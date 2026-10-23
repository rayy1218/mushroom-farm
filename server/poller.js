// The polling cycle: reads the outdoor probe, then every wired sensor, filter pressure sensor and energy meter through the
// Modbus client and stores one reading per poll;
// also polls each wired machine (relay module, aircon gateway) and keeps its last polls in memory.

import { ModbusError, registersToFloat } from './modbus.js';
import { MODES, FANS, RELAY_KEYS } from './machine-codes.js';

// What to ask for, and how to turn the registers into values.
const KINDS = {
  trh: { fn: 4, start: 1, qty: 2, values: ([t, rh]) => ({ t: ((t << 16) >> 16) / 10, rh: rh / 10 }) },
  co2: { fn: 3, start: 0, qty: 1, values: ([ppm]) => ({ co2: ppm }) },
};

// Energy meter (SDM120 style): input registers (fn 4), each a float32 over two registers, high word first.
const METER = { power: { start: 0x000c, qty: 2 }, energy: { start: 0x0156, qty: 2 } };

// Filter pressure sensor (spec 2026-10-22-filter-design.md 4): input register 0 (fn 4), the pressure drop in Pa × 10, signed.
// A value outside FILTER.min to FILTER.max is a failed poll that keeps the value.
const FILTER = { fn: 4, start: 0, qty: 1, min: -50, max: 2000 };

// Relay module: coils (fn 1) then current inputs (fn 2). Aircon gateway: settings (fn 3) then room T and error (fn 4).
const MACHINES = {
  relay: async (client, unit) => ({
    coils: await client.readBits(unit, 1, 0, RELAY_KEYS.length),
    inputs: await client.readBits(unit, 2, 0, RELAY_KEYS.length),
  }),
  ac: async (client, unit) => {
    const [power, mode, setpoint, fan] = await client.readRegisters(unit, 3, 0, 4);
    const [roomT, error] = await client.readRegisters(unit, 4, 0, 2);
    return {
      power: power === 0 ? false : power === 1 ? true : null,
      mode: MODES[mode] ?? null,
      setpoint: setpoint / 10,
      fan: FANS[fan] ?? null,
      roomT: ((roomT << 16) >> 16) / 10,
      error,
    };
  },
};
const POLLS_KEPT = 2;
const EMPTY = () => ({ address: null, polls: [] });

// Polls sensors and machines. log is only for errors that are not sensor failures (a database error).
// afterCycle(cycleStart), when given, is awaited at the end of each complete cycle (automatic control).
// clock (milliseconds, monotonic), setTimer and clearTimer are only replaced by tests.
export function createPoller({
  db, client, intervalMs = 5000, now = Date.now, log = console.error, afterCycle = null,
  clock = () => performance.now(), setTimer = setTimeout, clearTimer = clearTimeout,
}) {
  let stopped = false;
  let timer = null;
  let cycleBegan = 0; // clock() when the latest scheduled cycle began
  let running = null; // promise of the cycle in progress
  const machines = new Map(); // `${roomId}/${kind}` → { address, polls }, the last polls of each device

  async function pollOne({ roomId, kind, address }, began) {
    const { fn, start, qty, values } = KINDS[kind];
    const at = now();
    began(at);
    const reading = { roomId, kind, address, at };
    try {
      Object.assign(reading, { ok: true }, values(await client.readRegisters(address, fn, start, qty)));
    } catch (err) {
      Object.assign(reading, { ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' });
    }
    db.addReading(reading);
  }

  // The outdoor probe is a T/RH probe whose readings go to their own table. The address is read from the settings each
  // cycle: it can change while the app runs.
  async function pollOutdoor(address, began) {
    const { fn, start, qty, values } = KINDS.trh;
    const at = now();
    began(at);
    const reading = { address, at };
    try {
      Object.assign(reading, { ok: true }, values(await client.readRegisters(address, fn, start, qty)));
    } catch (err) {
      Object.assign(reading, { ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' });
    }
    db.addOutdoorReading(reading);
  }

  async function pollFilter({ roomId, address }, began) {
    const at = now();
    began(at);
    const reading = { roomId, address, at };
    try {
      const [raw] = await client.readRegisters(address, FILTER.fn, FILTER.start, FILTER.qty);
      const pa = ((raw << 16) >> 16) / 10;
      Object.assign(reading, pa >= FILTER.min && pa <= FILTER.max ? { ok: true, pa } : { ok: false, pa, error: 'Out of range' });
    } catch (err) {
      Object.assign(reading, { ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' });
    }
    db.addFilterReading(reading);
  }

  // Two reads (power, then energy); a failed read, or a value that is not a number, makes the poll a failed one.
  async function pollMeter({ roomId, address }, began) {
    const at = now();
    began(at);
    const reading = { roomId, address, at };
    try {
      const powerW = registersToFloat(await client.readRegisters(address, 4, METER.power.start, METER.power.qty));
      const energyKwh = registersToFloat(await client.readRegisters(address, 4, METER.energy.start, METER.energy.qty));
      if (!Number.isFinite(powerW) || !Number.isFinite(energyKwh)) throw new ModbusError('bad reply');
      Object.assign(reading, { ok: true, powerW, energyKwh });
    } catch (err) {
      Object.assign(reading, { ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' });
    }
    db.addMeterReading(reading);
  }

  async function pollMachine({ roomId, kind, address }, began) {
    const at = now();
    began(at);
    let poll;
    try {
      poll = { at, ok: true, ...await MACHINES[kind](client, address) };
    } catch (err) {
      poll = { at, ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' };
    }
    const key = `${roomId}/${kind}`;
    let entry = machines.get(key);
    if (entry?.address !== address) machines.set(key, entry = { address, polls: [] });
    entry.polls.push(poll);
    if (entry.polls.length > POLLS_KEPT) entry.polls.shift();
  }

  async function runCycle() {
    let cycleStart = null; // the time of the first poll of this cycle (the clock is not read more often than before)
    const began = (at) => { cycleStart ??= at; };
    try {
      const sensors = db.listWiredSensors();
      const wired = db.listWiredMachines();
      const meters = db.listMeters();
      const filters = db.listFilterSensors();
      const outdoor = db.outdoorAddress();
      if (outdoor !== null && !stopped) await pollOutdoor(outdoor, began);
      const wiredKeys = new Set(wired.map((m) => `${m.roomId}/${m.kind}`));
      for (const key of machines.keys()) if (!wiredKeys.has(key)) machines.delete(key);
      const roomIds = [...new Set([...sensors, ...filters, ...meters, ...wired].map((d) => d.roomId))].sort((a, b) => a - b);
      for (const roomId of roomIds) {
        for (const sensor of sensors.filter((s) => s.roomId === roomId)) {
          if (stopped) return;
          await pollOne(sensor, began);
        }
        for (const filter of filters.filter((f) => f.roomId === roomId)) {
          if (stopped) return;
          await pollFilter(filter, began);
        }
        for (const meter of meters.filter((m) => m.roomId === roomId)) {
          if (stopped) return;
          await pollMeter(meter, began);
        }
        for (const machine of wired.filter((m) => m.roomId === roomId)) {
          if (stopped) return;
          await pollMachine(machine, began);
        }
      }
      if (afterCycle && !stopped) await afterCycle(cycleStart ?? now());
    } catch (err) {
      log(err);
    }
  }

  // One full pass. A call while a pass is running joins it (no overlap).
  function cycle() {
    running ??= runCycle().finally(() => { running = null; });
    return running;
  }

  // Runs a cycle, then schedules the next one intervalMs after this one began.
  function tick() {
    timer = null;
    if (stopped) return;
    cycleBegan = clock(); // monotonic, so a clock change cannot stretch or skip the schedule
    cycle().then(() => {
      if (stopped) return;
      timer = setTimer(tick, Math.max(0, cycleBegan + intervalMs - clock()));
    });
  }

  return {
    start() {
      if (stopped || timer || running) return;
      tick();
    },

    // Resolves once the cycle in progress (if any) is over; nothing is written after that.
    async stop() {
      stopped = true;
      clearTimer(timer);
      timer = null;
      await running;
    },

    cycle,

    // Changes the interval. While waiting for the next cycle, that cycle is moved to the new interval after the
    // start of the last one (at once if that is already over). While a cycle runs, the new interval applies
    // when it ends; cycles never overlap and there is never more than one timer.
    setIntervalMs(ms) {
      intervalMs = ms;
      if (stopped || timer === null) return;
      clearTimer(timer);
      timer = setTimer(tick, Math.max(0, cycleBegan + intervalMs - clock()));
    },

    // { relay: { address, polls }, ac: { address, polls } } for the room: the last two polls of each
    // device, oldest first (address null and no polls when the device is not wired or not polled yet).
    // A copy.
    machineState(roomId) {
      const get = (kind) => {
        const entry = machines.get(`${roomId}/${kind}`);
        return entry ? { address: entry.address, polls: structuredClone(entry.polls) } : EMPTY();
      };
      return { relay: get('relay'), ac: get('ac') };
    },
  };
}

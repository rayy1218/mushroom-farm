// The polling cycle: reads every wired sensor through the Modbus client and stores one reading per poll.

import { ModbusError } from './modbus.js';

// What to ask for, and how to turn the registers into values.
const KINDS = {
  trh: { fn: 4, start: 1, qty: 2, values: ([t, rh]) => ({ t: ((t << 16) >> 16) / 10, rh: rh / 10 }) },
  co2: { fn: 3, start: 0, qty: 1, values: ([ppm]) => ({ co2: ppm }) },
};

// log is only for errors that are not sensor failures (a database error).
export function createPoller({ db, client, intervalMs = 5000, now = Date.now, log = console.error }) {
  let stopped = false;
  let timer = null;
  let running = null; // promise of the cycle in progress

  async function pollOne({ roomId, kind, address }) {
    const { fn, start, qty, values } = KINDS[kind];
    const at = now();
    const reading = { roomId, kind, address, at };
    try {
      Object.assign(reading, { ok: true }, values(await client.readRegisters(address, fn, start, qty)));
    } catch (err) {
      Object.assign(reading, { ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' });
    }
    db.addReading(reading);
  }

  async function runCycle() {
    try {
      for (const sensor of db.listWiredSensors()) {
        if (stopped) break;
        await pollOne(sensor);
      }
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
    const began = performance.now(); // monotonic, so a clock change cannot stretch or skip the schedule
    cycle().then(() => {
      if (stopped) return;
      timer = setTimeout(tick, Math.max(0, began + intervalMs - performance.now()));
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
      clearTimeout(timer);
      timer = null;
      await running;
    },

    cycle,
  };
}

// Automatic control (spec 2026-10-19-controller-design.md): the pure decision, the validation of the
// settings and the runner that sends the differences after each poll cycle.

import { CommandError } from './machines.js';
import { RELAY_KEYS } from './machine-codes.js';

export const DEFAULTS = { auto: false, co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, humidifierDuringExchange: true };

// Pairs of band limits, in the order they are checked.
const BANDS = [
  { low: 'co2Low', high: 'co2High', label: 'CO₂ band', min: 300, max: 5000, unit: 'ppm' },
  { low: 'tLow', high: 'tHigh', label: 'Temperature band', min: 16, max: 35, unit: '°C' },
  { low: 'rhLow', high: 'rhHigh', label: 'Humidity band', min: 40, max: 100, unit: '%' },
];

const AC_MIN = 16;
const AC_MAX = 30;
const EXCHANGE_DROP = 5;

const num = (x) => String(Math.round(x * 10) / 10);
const word = (on) => (on ? 'on' : 'off');

// bands: { co2Low, co2High, tLow, tHigh, rhLow, rhHigh }. state: { exchange, humidifier }, the remembered band states.
// humidifierDuringExchange: whether an air exchange forces the humidifier on (default true).
// readings: { co2, rh }, null when the sensor gave nothing this cycle (that rule then keeps its state).
// Returns { state, desired, reasons }. Pure.
export function decide({ bands, state, readings, humidifierDuringExchange = true }) {
  const { co2 = null, rh = null } = readings ?? {};
  let exchange = state.exchange;
  let band = state.humidifier;
  const reasons = {};

  // Air exchange: on at or above the upper CO2 limit, off at or below the lower, kept between.
  if (co2 === null) {
    reasons.exchange = `CO₂ sensor not answering: air exchange kept ${word(exchange)}`;
  } else if (co2 >= bands.co2High) {
    exchange = true;
    reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≥ ${bands.co2High}`;
  } else if (co2 <= bands.co2Low) {
    exchange = false;
    reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≤ ${bands.co2Low}`;
  } else {
    reasons.exchange = `Air exchange kept ${word(exchange)}: CO₂ ${num(co2)} between ${bands.co2Low} and ${bands.co2High}`;
  }

  // Humidifier band: on at or below the lower RH limit, off at or above the upper, kept between.
  const forced = exchange && humidifierDuringExchange;
  const note = exchange && !humidifierDuringExchange ? '; not forced during air exchange' : '';
  let why;
  if (rh === null) {
    why = `Humidity sensor not answering: humidifier kept ${word(band)}`;
  } else if (rh <= bands.rhLow) {
    band = true;
    why = exchange && !humidifierDuringExchange ? `Humidifier: on (RH ${num(rh)} ≤ ${bands.rhLow})` : `Humidifier: RH ${num(rh)} ≤ ${bands.rhLow}`;
  } else if (rh >= bands.rhHigh) {
    band = false;
    why = exchange && !humidifierDuringExchange
      ? `Humidifier: off (RH ${num(rh)} ≥ ${bands.rhHigh}${note})` : `Humidifier: RH ${num(rh)} ≥ ${bands.rhHigh}`;
  } else {
    why = `Humidifier kept ${word(band)}: RH ${num(rh)} between ${bands.rhLow} and ${bands.rhHigh}`;
  }
  reasons.humidifier = forced ? 'Humidifier: on during air exchange' : why;

  const middle = (bands.tLow + bands.tHigh) / 2;
  const target = exchange ? middle - EXCHANGE_DROP : middle;
  const setpoint = Math.round(Math.min(AC_MAX, Math.max(AC_MIN, target)) * 2) / 2;
  reasons.ac = exchange
    ? `Aircon: ${setpoint.toFixed(1)} °C (${middle.toFixed(1)} − ${EXCHANGE_DROP} during air exchange)`
    : `Aircon: ${setpoint.toFixed(1)} °C (middle of ${bands.tLow}–${bands.tHigh})`;
  reasons.circulation = 'Circulation: always on';

  return {
    state: { exchange, humidifier: band },
    desired: {
      intake: exchange,
      exhaust: exchange,
      humidifier: forced || band,
      circulation: true,
      ac: { power: true, mode: 'cool', setpoint, fan: 'auto' },
    },
    reasons,
  };
}

// Validates a whole settings object. Returns { error, field } for the first problem, or null.
export function validateControl(c) {
  if (typeof c.auto !== 'boolean') return { error: 'auto must be true or false', field: 'auto' };
  if (typeof c.humidifierDuringExchange !== 'boolean') {
    return { error: 'humidifierDuringExchange must be true or false', field: 'humidifierDuringExchange' };
  }
  for (const { low, high, label, min, max, unit } of BANDS) {
    for (const [field, side] of [[low, 'lower'], [high, 'upper']]) {
      const v = c[field];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
        return { error: `${label} ${side} limit must be a number from ${min} to ${max} ${unit}`, field };
      }
    }
    if (c[low] >= c[high]) return { error: `${label} lower limit must be below the upper limit`, field: low };
  }
  return null;
}

const emptyReasons = () => ({ exchange: '', humidifier: '', ac: '', circulation: '' });
const BYPASS = { bypassAuto: true };
const RESENDS = 3;
const NAMES = { intake: 'Intake fan', exhaust: 'Exhaust fan', circulation: 'Circulation fan', humidifier: 'Humidifier', ac: 'Aircon' };
const REASON_OF = { intake: 'exchange', exhaust: 'exchange', circulation: 'circulation', humidifier: 'humidifier', ac: 'ac' };

// db: the farm database. machines: from createMachines. now is injectable.
// log is only for errors that are not command failures (a database error).
export function createController({ db, machines, now = Date.now, log = console.error }) {
  const reasons = new Map(); // roomId → { exchange, humidifier, ac, circulation }, in memory only
  const tries = new Map(); // `${roomId}/${machine}` → { want, n }: re-sends in the current not-following episode

  // Drops what is kept in memory for a deleted room.
  function forget(roomId) {
    reasons.delete(roomId);
    for (const key of [...RELAY_KEYS, 'ac']) tries.delete(`${roomId}/${key}`);
  }

  // The room's control settings with the reasons, or null when there is no such room.
  function get(roomId) {
    const c = db.getControl(roomId);
    if (!c) {
      forget(roomId);
      return null;
    }
    const { humidifier, ...rest } = c; // the band state, not the machine's command
    return { ...rest, humidifierBand: humidifier, reasons: { ...emptyReasons(), ...reasons.get(roomId) } };
  }

  // The reading of this cycle of a sensor, or null (no data, failed, or older than the cycle).
  function fresh(sensor, cycleStart) {
    const r = sensor.readings.at(-1);
    return r && r.ok && r.at >= cycleStart ? r : null;
  }

  const stillAuto = (roomId) => Boolean(db.getControl(roomId)?.auto);

  async function runRoom(room, cycleStart) {
    const c = db.getControl(room.id);
    if (!c?.auto) return;
    const [trh, co2] = db.getSensors(room.id, 1);
    const t = fresh(trh, cycleStart);
    const c2 = fresh(co2, cycleStart);
    const commands = db.getCommands(room.id);
    const { state, desired, reasons: why } = decide({
      bands: c,
      state: { exchange: c.exchange, humidifier: c.humidifier },
      readings: { rh: t?.rh ?? null, co2: c2?.co2 ?? null },
      humidifierDuringExchange: c.humidifierDuringExchange,
    });
    db.setControlState(room.id, state, now());

    // What to send: the differences, and a machine that is not following again (at most RESENDS times per episode).
    const view = machines.get(room.id);
    const statusOf = { ac: view?.ac?.status };
    for (const m of view?.relay?.machines ?? []) statusOf[m.key] = m.status;
    const sends = [];
    const plan = (key, want, differs) => {
      const slot = `${room.id}/${key}`;
      const sig = JSON.stringify(want);
      let entry = tries.get(slot);
      if (!entry || entry.want !== sig) tries.set(slot, entry = { want: sig, n: 0 });
      const status = statusOf[key];
      if (differs) {
        entry.n = 0;
        sends.push(key);
      } else if (status === 'not-following') {
        const name = NAMES[key];
        if (entry.n < RESENDS) {
          entry.n++;
          sends.push(key);
          why[REASON_OF[key]] += `; ${name}: not following, sent again (${entry.n} of ${RESENDS})`;
        } else {
          why[REASON_OF[key]] += `; ${name}: not following after ${RESENDS} tries`;
        }
      } else if (status === 'on' || status === 'off') {
        entry.n = 0;
      }
    };
    if (room.relayAddress !== null) {
      for (const key of RELAY_KEYS) plan(key, desired[key], commands.relay[key] !== desired[key]);
    }
    if (room.acAddress !== null) {
      const a = commands.ac;
      const d = desired.ac;
      const same = a.power === d.power && a.mode === d.mode && a.fan === d.fan
        && Math.round(a.setpoint * 10) === Math.round(d.setpoint * 10);
      plan('ac', d, !same);
    }
    reasons.set(room.id, why);

    for (const key of sends) {
      if (!stillAuto(room.id)) return; // the user took over while we were sending
      await machines.command(room.id, key, key === 'ac' ? desired.ac : { on: desired[key] }, BYPASS);
    }
  }

  return {
    get,

    forget,

    // Applies any of auto, humidifierDuringExchange and the six limits and returns the view like get. Returns null when there is no
    // such room; throws CommandError (400, with field) for a bad value.
    update(roomId, body) {
      const current = db.getControl(roomId);
      if (!current) return null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new CommandError(400, 'Body must be a JSON object');
      const merged = {};
      for (const key of Object.keys(DEFAULTS)) merged[key] = key in body ? body[key] : current[key];
      const bad = validateControl(merged);
      if (bad) throw new CommandError(400, bad.error, bad.field);
      db.setControl(roomId, merged);
      if (merged.auto && !current.auto) {
        for (const key of [...RELAY_KEYS, 'ac']) tries.delete(`${roomId}/${key}`);
        // Turning auto on: the band states start from what is commanded now.
        // An old start time must not survive: clear the state first.
        const { relay } = db.getCommands(roomId);
        db.setControlState(roomId, { exchange: false, humidifier: false }, now());
        db.setControlState(roomId, { exchange: relay.intake, humidifier: relay.humidifier }, now());
      }
      return get(roomId);
    },

    // Called after each poll cycle; cycleStart is the time that cycle began.
    async run(cycleStart) {
      for (const room of db.listRooms()) {
        try {
          await runRoom(room, cycleStart);
        } catch (err) {
          log(err);
        }
      }
    },
  };
}

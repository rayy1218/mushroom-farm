// Automatic control (spec 2026-10-19-controller-design.md): the pure decision, the validation of the
// settings and the runner that sends the differences after each poll cycle.

import { CommandError } from './machines.js';
import { RELAY_KEYS } from './machine-codes.js';

export const DEFAULTS = { auto: false, co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };

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
// readings: { co2, rh }, null when the sensor gave nothing this cycle (that rule then keeps its state).
// commands is accepted for the caller's convenience and not needed: the decision depends on the state only.
// Returns { state, desired, reasons }. Pure.
export function decide({ bands, state, readings }) {
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
  let why;
  if (rh === null) {
    why = `Humidity sensor not answering: humidifier kept ${word(band)}`;
  } else if (rh <= bands.rhLow) {
    band = true;
    why = `Humidifier: RH ${num(rh)} ≤ ${bands.rhLow}`;
  } else if (rh >= bands.rhHigh) {
    band = false;
    why = `Humidifier: RH ${num(rh)} ≥ ${bands.rhHigh}`;
  } else {
    why = `Humidifier kept ${word(band)}: RH ${num(rh)} between ${bands.rhLow} and ${bands.rhHigh}`;
  }
  reasons.humidifier = exchange ? 'Humidifier: on during air exchange' : why;

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
      humidifier: exchange || band,
      circulation: true,
      ac: { power: true, mode: 'cool', setpoint, fan: 'auto' },
    },
    reasons,
  };
}

// Validates a whole settings object. Returns { error, field } for the first problem, or null.
export function validateControl(c) {
  if (typeof c.auto !== 'boolean') return { error: 'auto must be true or false', field: 'auto' };
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

// db: the farm database. machines: from createMachines. now is injectable.
// log is only for errors that are not command failures (a database error).
export function createController({ db, machines, now = Date.now, log = console.error }) {
  const reasons = new Map(); // roomId → { exchange, humidifier, ac, circulation }, in memory only

  // The room's control settings with the reasons, or null when there is no such room.
  function get(roomId) {
    const c = db.getControl(roomId);
    if (!c) {
      reasons.delete(roomId);
      return null;
    }
    return { ...c, reasons: { ...emptyReasons(), ...reasons.get(roomId) } };
  }

  // The reading of this cycle of a sensor, or null (no data, failed, or older than the cycle).
  function fresh(sensor, cycleStart) {
    const r = sensor.readings.at(-1);
    return r && r.ok && r.at >= cycleStart ? r : null;
  }

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
      readings: { t: t?.t ?? null, rh: t?.rh ?? null, co2: c2?.co2 ?? null },
      commands,
    });
    db.setControlState(room.id, state, now());
    reasons.set(room.id, why);

    if (room.relayAddress !== null) {
      for (const key of RELAY_KEYS) {
        if (commands.relay[key] !== desired[key]) await machines.command(room.id, key, { on: desired[key] }, BYPASS);
      }
    }
    if (room.acAddress !== null) {
      const a = commands.ac;
      const d = desired.ac;
      const same = a.power === d.power && a.mode === d.mode && a.fan === d.fan
        && Math.round(a.setpoint * 10) === Math.round(d.setpoint * 10);
      if (!same) await machines.command(room.id, 'ac', d, BYPASS);
    }
  }

  return {
    get,

    // Applies any of auto and the six limits and returns the view like get. Returns null when there is no
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
        // Turning auto on: the band states start from what is commanded now.
        const { relay } = db.getCommands(roomId);
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

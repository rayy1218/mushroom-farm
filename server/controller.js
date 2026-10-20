// Automatic control (spec 2026-10-19-controller-design.md): the pure decision, the validation of the
// settings and the runner that sends the differences after each poll cycle.

import { CommandError } from './machines.js';
import { RELAY_KEYS } from './machine-codes.js';
import { createSensorChecks } from './checks.js';
import { createAlarms } from './alarms.js';
import { advance, BAND_KEYS } from './program.js';

export const DEFAULTS = {
  auto: false, co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, humidifierDuringExchange: false, acFan: 'auto',
  co2Safety: 1250, exchangeMaxMin: 10, acDrop: 0, exchangeEveryMin: 15,
};
export const AC_FANS = ['auto', 'low', 'high'];

// Pairs of band limits, in the order they are checked.
const BANDS = [
  // A lower limit below about 450 ppm can never be reached with outdoor air at about 420.
  { low: 'co2Low', high: 'co2High', label: 'CO₂ band', min: 450, max: 5000, unit: 'ppm' },
  { low: 'tLow', high: 'tHigh', label: 'Temperature band', min: 16, max: 35, unit: '°C' },
  { low: 'rhLow', high: 'rhHigh', label: 'Humidity band', min: 40, max: 100, unit: '%' },
];

const AC_MIN = 16;
const AC_MAX = 30;
const AC_DROP_MAX = 10; // °C the aircon setpoint may be lowered during an air exchange (acDrop)

// Machine protection and the timed fallbacks (spec 2026-10-19-safety-and-history-design.md 2.1 to 2.3).
const MIN_ON_MS = 30_000; // air exchange
const MIN_OFF_MS = 60_000;
const TIMED_EXCHANGE_ON_MS = 10 * 60_000; // CO₂ sensor fault: on 10 min of every 30
const TIMED_EXCHANGE_OFF_MS = 20 * 60_000;
const FRESH_AIR_RUN_MS = 60_000; // a fresh-air run (no air exchange for exchangeEveryMin): the fans run this long
const EVERY_MAX = 240; // min, the longest fresh-air interval
const TIMED_HUMIDIFIER_MS = 10 * 60_000; // T/RH probe fault: 10 min on, 10 min off
const HUMIDIFIER_HOLD_MS = 60_000; // the command changes at most once a minute
const AC_HOLD_MS = 120_000; // at most one changed aircon command every 2 min

const num = (x) => String(Math.round(x * 10) / 10);
const word = (on) => (on ? 'on' : 'off');

// "40 s", "1 min 20 s", "2 min": a wait for a reason text, rounded up to whole seconds.
function wait(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  return s % 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s / 60} min`;
}

// Whether the aircon command a differs from the desired d (the setpoint compared in tenths).
const acDiffers = (a, d) => a.power !== d.power || a.mode !== d.mode || a.fan !== d.fan
  || Math.round(a.setpoint * 10) !== Math.round(d.setpoint * 10);

// bands: { co2Low, co2High, co2Safety, exchangeMaxMin, exchangeEveryMin, tLow, tHigh, rhLow, rhHigh, acDrop } (acDrop: °C
// lower during an air exchange, 0 when missing; exchangeEveryMin: fresh air at least this often, 0 or missing: off).
// state: { exchange, exchangeSince, exchangeEndedAt, exchangeForced, freshFrom, cappedInRow, humidifier, humidifierSince },
// the remembered states (times in ms; exchangeSince is null while the exchange is off, exchangeEndedAt null when it never
// ended; exchangeForced: the running exchange is a fresh-air run; freshFrom: the fresh-air wait counts from then, null:
// from the last end, or from now when it never ended).
// humidifierDuringExchange: whether an air exchange forces the humidifier on (default false).
// acFan: the aircon fan, 'auto' | 'low' | 'high' (default 'auto').
// readings: { co2, rh }, null when the sensor gave nothing usable this cycle (that rule then keeps its state).
// faults: { co2, trh }, true while that sensor is faulty (timed exchange, timed humidifier). now: ms.
// Returns { state, desired, reasons }. Pure.
export function decide({ bands, state, readings, faults, now, humidifierDuringExchange = false, acFan = 'auto' }) {
  const { co2 = null, rh = null } = readings ?? {};
  const was = state.exchange;
  let exchange = was;
  // An exchange that is on with no start time (from the upgrade) starts counting now.
  let since = state.exchangeSince ?? (was ? now : null);
  let endedAt = state.exchangeEndedAt ?? null;
  let capped = state.cappedInRow ?? 0;
  let freshRun = was && Boolean(state.exchangeForced);
  let freshFrom = state.freshFrom ?? endedAt ?? now;
  let band = state.humidifier;
  let humidifierSince = null;
  const reasons = {};

  const start = () => { exchange = true; since = now; freshRun = false; };
  const stop = () => { exchange = false; since = null; endedAt = now; freshRun = false; freshFrom = now; };
  const onFor = was ? now - since : 0;
  const offFor = was || endedAt === null ? Infinity : now - endedAt;
  const { co2Low, co2High, co2Safety } = bands;
  // Fresh air: with no air exchange for `every` ms, the fans run for FRESH_AIR_RUN_MS whatever the CO2.
  const every = (bands.exchangeEveryMin ?? 0) * 60_000;
  const freshDue = !was && every > 0 && now - freshFrom >= every;
  const startFresh = () => {
    start();
    freshRun = true;
    reasons.exchange = `Fresh air: no air exchange for ${bands.exchangeEveryMin} min, fans on for ${FRESH_AIR_RUN_MS / 60_000} min`;
  };
  // The timed exchange of a CO2 fault rests at most the fresh-air interval.
  const timedOff = every > 0 ? Math.min(TIMED_EXCHANGE_OFF_MS, every) : TIMED_EXCHANGE_OFF_MS;

  // Air exchange: on at or above the upper CO2 limit, off at or below the lower, kept between; at the safety level
  // it starts at once and has no time limit; otherwise it stops at the time limit.
  if (faults?.co2) {
    freshRun = false; // the timed exchange takes over a fresh-air run
    if (was) {
      if (onFor >= TIMED_EXCHANGE_ON_MS) stop();
    } else if (offFor >= timedOff) {
      start();
    }
    reasons.exchange = `CO₂ sensor fault: timed air exchange, 10 min of every ${(TIMED_EXCHANGE_ON_MS + timedOff) / 60_000}`;
  } else if (freshRun && (co2 === null || co2 < co2High)) {
    // A fresh-air run: its minute, even below the lower limit; one that reaches the upper limit goes on below as normal.
    if (onFor >= FRESH_AIR_RUN_MS) {
      stop();
      reasons.exchange = `Fresh air done: fans ran ${FRESH_AIR_RUN_MS / 60_000} min`;
    } else {
      reasons.exchange = `Fresh air: fans on, ${wait(FRESH_AIR_RUN_MS - onFor)} to go`;
    }
  } else if (co2 === null) {
    if (freshDue) startFresh();
    else reasons.exchange = `CO₂ reading not usable: air exchange kept ${word(exchange)}`;
  } else if (!was) {
    if (co2 >= co2Safety) {
      start();
      reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≥ safety level ${co2Safety}`;
    } else if (co2 >= co2High) {
      if (offFor >= MIN_OFF_MS) {
        start();
        reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≥ ${co2High}`;
      } else {
        reasons.exchange = `Air exchange waits: minimum off time, ${wait(MIN_OFF_MS - offFor)} to go`;
      }
    } else if (freshDue) {
      startFresh();
    } else if (co2 <= co2Low) {
      reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≤ ${co2Low}`;
    } else {
      reasons.exchange = `Air exchange kept off: CO₂ ${num(co2)} between ${co2Low} and ${co2High}`;
    }
  } else if (co2 >= co2Safety) {
    freshRun = false;
    reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≥ safety level ${co2Safety}, no time limit`;
  } else if (co2 <= co2Low) {
    freshRun = false;
    if (onFor >= MIN_ON_MS) {
      stop();
      capped = 0;
      reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≤ ${co2Low}`;
    } else {
      reasons.exchange = `Air exchange waits: minimum on time, ${wait(MIN_ON_MS - onFor)} to go`;
    }
  } else if (onFor >= bands.exchangeMaxMin * 60_000) {
    stop();
    capped++;
    reasons.exchange = `Air exchange stopped at the ${bands.exchangeMaxMin} min limit: CO₂ ${num(co2)} above ${co2Low}`;
  } else if (co2 >= co2High) {
    freshRun = false;
    reasons.exchange = `Air exchange: CO₂ ${num(co2)} ≥ ${co2High}`;
  } else {
    reasons.exchange = `Air exchange kept on: CO₂ ${num(co2)} between ${co2Low} and ${co2High}`;
  }

  // Humidifier band: on at or below the lower RH limit, off at or above the upper, kept between.
  // A faulty T/RH probe: on for 10 min, off for 10 min, repeating.
  const forced = exchange && humidifierDuringExchange;
  const note = exchange && !humidifierDuringExchange ? '; not forced during air exchange' : '';
  let why;
  if (faults?.trh) {
    humidifierSince = state.humidifierSince ?? now;
    band = Math.floor((now - humidifierSince) / TIMED_HUMIDIFIER_MS) % 2 === 0;
    why = 'Humidity sensor fault: timed humidifier, 10 min of every 20';
  } else if (rh === null) {
    humidifierSince = state.humidifierSince ?? null; // kept: a probe that is not yet called faulty (or a restart) must not restart the timer
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
  const drop = bands.acDrop ?? 0;
  const lowered = exchange && drop > 0;
  const target = lowered ? middle - drop : middle;
  const setpoint = Math.round(Math.min(AC_MAX, Math.max(AC_MIN, target)) * 2) / 2;
  const fanNote = acFan === 'auto' ? '' : `, fan ${acFan}`;
  reasons.ac = lowered
    ? `Aircon: ${setpoint.toFixed(1)} °C (${middle.toFixed(1)} − ${num(drop)} during air exchange)${fanNote}`
    : `Aircon: ${setpoint.toFixed(1)} °C (middle of ${bands.tLow}–${bands.tHigh})${fanNote}`;
  reasons.circulation = 'Circulation: always on';

  return {
    state: {
      exchange, exchangeSince: since, exchangeEndedAt: endedAt, exchangeForced: freshRun, freshFrom,
      cappedInRow: capped, humidifier: band, humidifierSince,
    },
    desired: {
      intake: exchange,
      exhaust: exchange,
      humidifier: forced || band,
      circulation: true,
      ac: { power: true, mode: 'cool', setpoint, fan: acFan },
    },
    reasons,
  };
}

// Machine protection for the humidifier and the aircon (the air exchange keeps its own times in decide).
// desired: the decided commands. commands: what is commanded now (db.getCommands). changedAt: when the controller last
// changed the humidifier and the aircon command (null or missing: never, no wait). now: ms.
// Returns { desired, held: { humidifier, ac } }: a machine that must wait keeps its commanded value and has a reason text.
export function protect({ desired, commands, changedAt = {}, now }) {
  const out = { ...desired };
  const held = { humidifier: '', ac: '' };

  const on = commands.relay.humidifier;
  if (desired.humidifier !== on && changedAt.humidifier != null && now - changedAt.humidifier < HUMIDIFIER_HOLD_MS) {
    out.humidifier = on;
    held.humidifier = `Humidifier waits: minimum ${word(on)} time, ${wait(HUMIDIFIER_HOLD_MS - (now - changedAt.humidifier))} to go`;
  }

  const { power, mode, setpoint, fan } = commands.ac;
  if (acDiffers(commands.ac, desired.ac) && changedAt.ac != null && now - changedAt.ac < AC_HOLD_MS) {
    out.ac = { power, mode, setpoint, fan };
    held.ac = `Aircon waits: next change in ${wait(AC_HOLD_MS - (now - changedAt.ac))}`;
  }
  return { desired: out, held };
}

// Validates a whole settings object. Returns { error, field } for the first problem, or null.
// compareSafety false skips only the check that the safety level is above co2High (the range is still checked).
export function validateControl(c, { compareSafety = true } = {}) {
  if (typeof c.auto !== 'boolean') return { error: 'auto must be true or false', field: 'auto' };
  if (typeof c.humidifierDuringExchange !== 'boolean') {
    return { error: 'humidifierDuringExchange must be true or false', field: 'humidifierDuringExchange' };
  }
  if (!AC_FANS.includes(c.acFan)) return { error: 'Aircon fan must be auto, low or high', field: 'acFan' };
  for (const { low, high, label, min, max, unit } of BANDS) {
    for (const [field, side] of [[low, 'lower'], [high, 'upper']]) {
      const v = c[field];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) {
        return { error: `${label} ${side} limit must be a number from ${min} to ${max} ${unit}`, field };
      }
    }
    if (c[low] >= c[high]) return { error: `${label} lower limit must be below the upper limit`, field: low };
  }
  if (typeof c.co2Safety !== 'number' || !Number.isFinite(c.co2Safety) || c.co2Safety > 10_000) {
    return { error: 'CO₂ safety level must be a number up to 10000 ppm', field: 'co2Safety' };
  }
  if (compareSafety && c.co2Safety <= c.co2High) return { error: 'CO₂ safety level must be above the CO₂ band upper limit', field: 'co2Safety' };
  if (!Number.isInteger(c.exchangeMaxMin) || c.exchangeMaxMin < 1 || c.exchangeMaxMin > 120) {
    return { error: 'Air exchange time limit must be a whole number from 1 to 120 min', field: 'exchangeMaxMin' };
  }
  if (typeof c.acDrop !== 'number' || !Number.isFinite(c.acDrop) || c.acDrop < 0 || c.acDrop > AC_DROP_MAX) {
    return { error: `Aircon lower during air exchange must be a number from 0 to ${AC_DROP_MAX} °C`, field: 'acDrop' };
  }
  if (!Number.isInteger(c.exchangeEveryMin) || c.exchangeEveryMin < 0 || c.exchangeEveryMin > EVERY_MAX) {
    return { error: `Fresh air interval must be a whole number from 0 to ${EVERY_MAX} min (0: off)`, field: 'exchangeEveryMin' };
  }
  return null;
}

const emptyReasons = () => ({ exchange: '', humidifier: '', ac: '', circulation: '', held: { humidifier: '', ac: '' } });
const BYPASS = { bypassAuto: true };
const RESENDS = 3;
const NAMES = { intake: 'Intake fan', exhaust: 'Exhaust fan', circulation: 'Circulation fan', humidifier: 'Humidifier', ac: 'Aircon' };
const REASON_OF = { intake: 'exchange', exhaust: 'exchange', circulation: 'circulation', humidifier: 'humidifier', ac: 'ac' };

// db: the farm database. machines: from createMachines. now is injectable. checks (createSensorChecks) and alarms
// (createAlarms) are made here unless a test passes its own.
// log is only for errors that are not command failures (a database error).
export function createController({ db, machines, now = Date.now, log = console.error, checks = createSensorChecks({ now }), alarms = createAlarms({ db, now }) }) {
  const reasons = new Map(); // roomId → { exchange, humidifier, ac, circulation, held }, in memory only
  const tries = new Map(); // `${roomId}/${machine}` → { want, n }: re-sends in the current not-following episode
  const changed = new Map(); // `${roomId}/humidifier|ac` → when the controller last changed that command (machine protection)
  const lastCo2 = new Map(); // roomId → the last good CO₂ reading (for the planned end of an exchange)
  let lastStart = null; // the start time of the previous cycle

  // Drops what is kept in memory for a deleted room.
  function forget(roomId) {
    reasons.delete(roomId);
    lastCo2.delete(roomId);
    for (const key of [...RELAY_KEYS, 'ac']) tries.delete(`${roomId}/${key}`);
    changed.delete(`${roomId}/humidifier`);
    changed.delete(`${roomId}/ac`);
    checks.forget(roomId);
    alarms.forget(roomId);
  }

  // The last check of each sensor as { ok, why, fault }, null for a sensor not checked yet.
  function checksOf(roomId) {
    const view = (r) => (r ? { ok: r.ok, why: r.why, fault: r.fault } : null);
    const { trh, co2 } = checks.get(roomId);
    return { trh: view(trh), co2: view(co2) };
  }

  // When the running exchange is planned to stop: the time limit after its start, 10 min for a timed exchange (CO₂ sensor
  // fault), 1 min for a fresh-air run; null when off, with auto off, or while the CO₂ is at the safety level (no limit).
  function exchangeEndsAt(roomId, c) {
    if (!c.auto || !c.exchange || c.exchangeSince === null) return null;
    if (checks.get(roomId).co2?.fault) return c.exchangeSince + TIMED_EXCHANGE_ON_MS;
    if (c.exchangeForced) return c.exchangeSince + FRESH_AIR_RUN_MS;
    if ((lastCo2.get(roomId) ?? 0) >= c.co2Safety) return null;
    return c.exchangeSince + c.exchangeMaxMin * 60_000;
  }

  // The room's control settings with the reasons, or null when there is no such room.
  function get(roomId) {
    const c = db.getControl(roomId);
    if (!c) {
      forget(roomId);
      return null;
    }
    const { humidifier, humidifierSince, ...rest } = c; // the band state, not the machine's command
    return { ...rest, humidifierBand: humidifier, exchangeEndsAt: exchangeEndsAt(roomId, c), checks: checksOf(roomId), reasons: { ...emptyReasons(), ...reasons.get(roomId) } };
  }

  // The reading of this cycle of a sensor (even a failed poll), or null (no data, or older than the cycle).
  function latest(sensor, cycleStart) {
    const r = sensor.readings.at(-1);
    return r && r.at >= cycleStart ? r : null;
  }

  const stillAuto = (roomId) => Boolean(db.getControl(roomId)?.auto);

  async function runRoom(room, cycleStart, prevStart) {
    let c = db.getControl(room.id);
    if (!c) return;
    const at = now();

    // The stage program (auto on or off): a due stage change, and the ramped bands written to the settings when they differ.
    const program = db.getProgram(room.id);
    let blocksDone = null;
    if (program.crops.length > 0) {
      const next = advance(program, at, c);
      if (next.program !== program) db.setProgram(room.id, next.program);
      if (next.bands && BAND_KEYS.some((k) => next.bands[k] !== c[k])) {
        db.setControl(room.id, { ...c, ...next.bands });
        c = db.getControl(room.id);
      }
      if (next.program.done) blocksDone = { flush: next.program.flush, flushes: next.program.flushes };
    }
    const commands = db.getCommands(room.id);

    // Check the sensors (auto on or off); a reading that fails a check counts as missing.
    const exchangeRecent = commands.relay.intake || commands.relay.exhaust || (c.exchangeEndedAt !== null && prevStart !== null && c.exchangeEndedAt >= prevStart);
    const ctx = { exchangeRecent, humidifierOn: commands.relay.humidifier };
    const good = { t: null, rh: null, co2: null };
    const unwired = { trh: false, co2: false };
    for (const sensor of db.getSensors(room.id, 1)) {
      if (sensor.status === 'not-wired') {
        checks.forget(room.id, sensor.kind);
        unwired[sensor.kind] = true;
        continue;
      }
      const r = latest(sensor, cycleStart);
      if (!r) continue; // not polled this cycle: nothing changes
      const result = checks.check(room.id, sensor.kind, r, ctx);
      if (sensor.kind === 'trh') {
        if (result.parts.t.ok) good.t = r.t;
        if (result.parts.rh.ok) good.rh = r.rh;
      } else if (result.ok) {
        good.co2 = r.co2;
      }
    }
    const status = checks.get(room.id);
    // A value whose sensor is faulty or not wired clears its process alarms (a missing reading only pauses them).
    const parts = (kind, name) => unwired[kind] || Boolean(status[kind]?.parts[name].fault);
    const clear = { t: parts('trh', 't'), rh: parts('trh', 'rh'), co2: parts('co2', 'co2') };
    if (good.co2 !== null) lastCo2.set(room.id, good.co2);
    else if (unwired.co2) lastCo2.delete(room.id);
    const faults = { trh: status.trh?.fault ? status.trh.faultWhy : null, co2: status.co2?.fault ? status.co2.faultWhy : null };

    // What to send: the differences, and a machine that is not following again (at most RESENDS times per episode).
    const view = machines.get(room.id);
    const sends = [];
    let desired = null;
    let cappedInRow = c.cappedInRow;
    if (c.auto) {
      const decided = decide({
        bands: c,
        state: {
          exchange: c.exchange, exchangeSince: c.exchangeSince, exchangeEndedAt: c.exchangeEndedAt,
          exchangeForced: c.exchangeForced, freshFrom: c.freshFrom,
          cappedInRow: c.cappedInRow, humidifier: c.humidifier, humidifierSince: c.humidifierSince,
        },
        readings: { rh: good.rh, co2: good.co2 },
        faults: { trh: Boolean(status.trh?.parts.rh.fault), co2: faults.co2 !== null }, // only an RH fault times the humidifier
        now: at,
        humidifierDuringExchange: c.humidifierDuringExchange,
        acFan: c.acFan,
      });
      const why = decided.reasons;
      db.setControlState(room.id, decided.state, at);
      cappedInRow = decided.state.cappedInRow;
      const protectedNow = protect({
        desired: decided.desired, commands, changedAt: { humidifier: changed.get(`${room.id}/humidifier`), ac: changed.get(`${room.id}/ac`) }, now: at,
      });
      desired = protectedNow.desired;
      why.held = protectedNow.held;

      const statusOf = { ac: view?.ac?.status };
      for (const m of view?.relay?.machines ?? []) statusOf[m.key] = m.status;
      const plan = (key, want, differs) => {
        const slot = `${room.id}/${key}`;
        const sig = JSON.stringify(want);
        let entry = tries.get(slot);
        if (!entry || entry.want !== sig) tries.set(slot, entry = { want: sig, n: 0 });
        const status = statusOf[key];
        if (differs) {
          entry.n = 0;
          sends.push(key);
          if (key === 'humidifier' || key === 'ac') changed.set(slot, at);
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
      if (room.acAddress !== null) plan('ac', desired.ac, acDiffers(commands.ac, desired.ac));
      reasons.set(room.id, why);
    }

    // An alarm error must not stop this room's commands.
    try {
      alarms.evaluate(room, { readings: good, bands: c, faults, clear, cappedInRow, machines: view, blocksDone });
    } catch (err) {
      log(err);
    }

    for (const key of sends) {
      if (!stillAuto(room.id)) return; // the user took over while we were sending
      await machines.command(room.id, key, key === 'ac' ? desired.ac : { on: desired[key] }, BYPASS);
    }
  }

  return {
    get,

    forget,

    // Applies any of auto, humidifierDuringExchange, acFan, co2Safety, exchangeMaxMin, acDrop, exchangeEveryMin and the six limits and returns the view like get.
    // Returns null when there is no such room; throws CommandError (400, with field) for a bad value.
    update(roomId, body) {
      const current = db.getControl(roomId);
      if (!current) return null;
      if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new CommandError(400, 'Body must be a JSON object');
      const merged = {};
      for (const key of Object.keys(DEFAULTS)) merged[key] = key in body ? body[key] : current[key];
      // The safety level is compared with the CO₂ band only when the body sets one of them, so a room whose
      // stored band is above its level can still switch auto, the humidifier option or the fan.
      const bad = validateControl(merged, { compareSafety: 'co2High' in body || 'co2Safety' in body });
      if (bad) throw new CommandError(400, bad.error, bad.field);
      db.setControl(roomId, merged);
      // A person's change of a band ends a running ramp (a band sent unchanged, e.g. with another setting, does not).
      if (BAND_KEYS.some((k) => k in body && body[k] !== current[k])) {
        const program = db.getProgram(roomId);
        if (program.ramp) db.setProgram(roomId, { ...program, ramp: null });
      }
      if (merged.auto && !current.auto) {
        for (const key of [...RELAY_KEYS, 'ac']) tries.delete(`${roomId}/${key}`);
        changed.delete(`${roomId}/humidifier`);
        changed.delete(`${roomId}/ac`);
        // Turning auto on: the band states start from what is commanded now, with no old times or counts.
        // An old start time must not survive: clear the state first.
        const { relay } = db.getCommands(roomId);
        db.setControlState(roomId, { exchange: false, humidifier: false }, now());
        db.setControlState(roomId, {
          exchange: relay.intake, humidifier: relay.humidifier, exchangeEndedAt: null, cappedInRow: 0, humidifierSince: null,
          exchangeForced: false, freshFrom: null, // the fresh-air wait counts from the first cycle
        }, now());
      } else if (!merged.auto && current.auto) {
        // Turning auto off: nothing is switched; the "too small" count and the timed humidifier start over.
        db.setControlState(roomId, { exchange: current.exchange, humidifier: current.humidifier, cappedInRow: 0, humidifierSince: null }, now());
      }
      return get(roomId);
    },

    // Called after each poll cycle; cycleStart is the time that cycle began. Every room gets its sensors checked and
    // its alarms evaluated; only rooms with auto on are controlled.
    async run(cycleStart) {
      const prevStart = lastStart;
      lastStart = cycleStart;
      for (const room of db.listRooms()) {
        try {
          await runRoom(room, cycleStart, prevStart);
        } catch (err) {
          log(err);
        }
      }
    },
  };
}

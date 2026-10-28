// Alarms (spec 2026-10-19-safety-and-history-design.md section 3): the controller's run calls evaluate once per room
// and cycle. A condition must hold for its delay before an alarm is raised; an active alarm clears with a little
// hysteresis. The alarms themselves are rows of the alarms table (see db.js); only the delay counts are in memory.

import { FILTER_ALARM_DELAY_MS } from './filter.js';

const MIN_MS = 60_000;
const EPS = 1e-9; // for limits like tHigh + 0.8
const HUMIDIFIER_DELAY = 30 * MIN_MS; // the humidifier too small: running this long with the humidity below the band
const HOUR_MS = 60 * MIN_MS;
// A room left in Manual by mistake (a worker taps Manual and walks away): the reminder after auto has been off this long.
export const MANUAL_REMIND_MS = 2 * HOUR_MS;

const num = (x) => (Math.round(x * 10) / 10).toLocaleString('en-US'); // a limit as set: 85, 21.5, 1,250
const one = (x) => x.toFixed(1); // a measured temperature, humidity or pressure: 66.9, 78.0
const ppm = (x) => Math.round(x).toLocaleString('en-US'); // 1,050
// The texts say what was measured and against which limit, every number with its unit (critique 2026-10-28: no arithmetic
// like "below 85 − 5"). They are written when the alarm is raised; the pages put the value now beside them.
const tBand = (b) => `the band (${num(b.tLow)}–${num(b.tHigh)} °C)`;
const rhBand = (b) => `the band (${num(b.rhLow)}–${num(b.rhHigh)} % RH)`;

export const MACHINE_NAMES = { intake: 'Intake fan', exhaust: 'Exhaust fan', circulation: 'Circulation fan', humidifier: 'Humidifier', dehumidifier: 'Dehumidifier', lights: 'Lights', ac: 'Aircon' };
export const MACHINE_KEYS = Object.keys(MACHINE_NAMES);
const BAD_STATUS = {
  'not-following': () => 'not following its command',
  'not-running': () => 'not running (switch on, no current)',
  'running-while-off': () => 'running while switched off',
  fault: (m) => `fault (error code ${m.errorCode})`,
  'no-answer': (m, key) => `no answer from the ${key === 'ac' ? 'aircon gateway' : 'relay module'}`,
};

// The process alarms: raised when `hit` holds for the delay, cleared when `released` holds. A rule gets the good
// value of its reading (null when the sensor is faulty or gave nothing: no alarm from a bad sensor) and the bands.
const PROCESS = [
  { key: 'tHigh', sensor: 't', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.t,
    hit: (v, b) => v > b.tHigh + 1, released: (v, b) => v <= b.tHigh + 0.8 + EPS,
    text: (v, b) => `Temperature ${one(v)} °C: more than 1 °C over ${tBand(b)}` },
  { key: 'tLow', sensor: 't', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.t,
    hit: (v, b) => v < b.tLow - 1, released: (v, b) => v >= b.tLow - 0.8 - EPS,
    text: (v, b) => `Temperature ${one(v)} °C: more than 1 °C under ${tBand(b)}` },
  { key: 'rhLow', sensor: 'rh', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.rh,
    hit: (v, b) => v < b.rhLow - 5, released: (v, b) => v >= b.rhLow - 4 - EPS,
    text: (v, b) => `Humidity ${one(v)} % RH: more than 5 % RH under ${rhBand(b)}` },
  // A wet room (water on caps and walls: blotch, soft mushrooms). The delay is longer than one air exchange, which
  // can wet the room for a while in Malaysian air.
  { key: 'rhHigh', sensor: 'rh', level: 'warning', delay: 15 * MIN_MS, read: (r) => r.rh,
    hit: (v, b) => v > b.rhHigh + 3, released: (v, b) => v <= b.rhHigh + 2 + EPS,
    text: (v, b) => `Humidity ${one(v)} % RH: more than 3 % RH over ${rhBand(b)}` },
  { key: 'co2High', sensor: 'co2', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.co2,
    hit: (v, b) => v > b.co2High + 100, released: (v, b) => v <= b.co2High + 80 + EPS,
    text: (v, b) => `CO₂ ${ppm(v)} ppm: more than 100 ppm over the air exchange start point (${ppm(b.co2High)} ppm)` },
  { key: 'co2Safety', sensor: 'co2', level: 'critical', delay: MIN_MS, read: (r) => r.co2,
    hit: (v, b) => v >= b.co2Safety, released: (v, b) => v < b.co2Safety - 20,
    text: (v, b) => `CO₂ ${ppm(v)} ppm: at or above the safety level (${ppm(b.co2Safety)} ppm)` },
];

// db: the farm database (alarm queries). now is injectable.
export function createAlarms({ db, now = Date.now }) {
  const pending = new Map(); // `${roomId}/${key}` → when the raising condition began to hold
  const counted = new Map(); // `${roomId}/${key}` → ms of counted time in the raising condition (the filter pressure alarms)
  const lastAt = new Map(); // room id → the time of its last evaluation

  // A filter pressure alarm (spec 2026-10-22-filter-design.md 5): raised once the counted readings stayed in the raising range
  // for `delay` of intake-running time, added up across exchanges. result: null (no counted reading: the count pauses) or
  // { hit, released, text }; neither hit nor released (the hysteresis) also pauses. credit: the ms this evaluation adds.
  function addUp(room, active, key, delay, result, credit) {
    const slot = `${room.id}/${key}`;
    if (result === null) return;
    const at = now();
    if (active.has(key)) {
      if (result.released) db.clearAlarm(room.id, key, at);
      counted.delete(slot);
      return;
    }
    if (result.released) counted.delete(slot);
    else if (result.hit) {
      const ms = (counted.get(slot) ?? 0) + credit;
      if (ms >= delay) {
        counted.delete(slot);
        db.raiseAlarm(room.id, key, 'warning', result.text(), at);
      } else counted.set(slot, ms);
    }
  }

  // Handles one alarm kind. result: null when it cannot be told (nothing changes, the count is dropped), else
  // { hit, released, text }. active: the room's active alarms by key.
  function apply(room, active, key, level, delay, result) {
    const slot = `${room.id}/${key}`;
    if (result === null) {
      pending.delete(slot);
      return;
    }
    const at = now();
    if (active.has(key)) {
      if (result.released) db.clearAlarm(room.id, key, at);
      return;
    }
    if (!result.hit) {
      pending.delete(slot);
      return;
    }
    if (!pending.has(slot)) pending.set(slot, at);
    if (at - pending.get(slot) >= delay) {
      pending.delete(slot);
      db.raiseAlarm(room.id, key, level, result.text(), at);
    }
  }

  return {
    // room: { id, relayAddress, acAddress }. input: { readings: { t, rh, co2 } (good values or null), bands (the room's control settings, with auto and autoChangedAt),
    // faults: { trh, co2 } (the fault text or null),
    // blocksDone: { flush, flushes } while the room's program is done, else null.
    // filter: { sensor, pa, cleanPa, finalPa, changeDays, daysInUse } (filter.js filterInput), or missing: no filter alarms.
    // clear: { t, rh, co2 } (true when that value's sensor is faulty or not wired: its process alarms clear), cappedInRow, machines (the machines view or null) }.
    evaluate(room, { readings, bands, faults, clear = {}, cappedInRow, machines, blocksDone = null, filter = null }) {
      const active = new Map(db.activeAlarms(room.id).map((a) => [a.key, a]));

      for (const rule of PROCESS) {
        const v = rule.read(readings);
        if (clear[rule.sensor]) {
          // A faulty or unwired sensor: the alarm ends (the sensor fault alarm says why) and the count is dropped.
          if (active.has(rule.key)) db.clearAlarm(room.id, rule.key, now());
          pending.delete(`${room.id}/${rule.key}`);
          continue;
        }
        const result = v === null || v === undefined ? null
          : { hit: rule.hit(v, bands), released: rule.released(v, bands), text: () => rule.text(v, bands) };
        apply(room, active, rule.key, rule.level, rule.delay, result);
      }

      for (const [key, name, fault] of [['sensorTrh', 'T/RH probe', faults.trh], ['sensorCo2', 'CO₂ sensor', faults.co2]]) {
        apply(room, active, key, 'serious', 0, { hit: Boolean(fault), released: !fault, text: () => `${name} fault: ${fault}` });
      }

      apply(room, active, 'exchangeTooSmall', 'warning', 0, {
        hit: cappedInRow >= 3,
        released: cappedInRow === 0,
        text: () => `Air exchange too small: ${cappedInRow} exchanges in a row stopped at the ${bands.exchangeMaxMin} min limit before CO₂ fell to the stop point (${ppm(bands.co2Low)} ppm)`,
      });

      // Left in Manual: auto off for MANUAL_REMIND_MS (bands.autoChangedAt, null when not known) in a room with something to
      // control (a relay module or an aircon gateway). Cleared once auto is on again or the room has nothing wired.
      const wired = (room.relayAddress ?? null) !== null || (room.acAddress ?? null) !== null;
      const since = bands.autoChangedAt ?? null;
      const manualMs = wired && !bands.auto && since !== null ? now() - since : -1;
      apply(room, active, 'manualLong', 'serious', 0, {
        hit: manualMs >= MANUAL_REMIND_MS,
        released: manualMs < MANUAL_REMIND_MS,
        text: () => `Automatic control off for ${Math.max(2, Math.floor(manualMs / HOUR_MS))} h: the machines stay as set by hand`,
      });

      apply(room, active, 'blocksDone', 'warning', 0, {
        hit: blocksDone !== null,
        released: blocksDone === null,
        text: () => `Flush ${blocksDone.flush} of ${blocksDone.flushes} done: replace the blocks`,
      });

      // The intake filter (spec 2026-10-22-filter-design.md 5): the change reminder, and from the counted pressure (null: no
      // reading counts now, the count pauses and an active alarm stays) a dirty or a missing filter. No sensor: they clear.
      // This evaluation counts the time since the last one, but none from before the intake passed its spin-up.
      const prevAt = lastAt.get(room.id);
      lastAt.set(room.id, now());
      if (filter) {
        const due = filter.changeDays > 0 && filter.daysInUse >= filter.changeDays;
        apply(room, active, 'filterDue', 'warning', 0, {
          hit: due, released: !due,
          text: () => `Filter in use ${Math.floor(filter.daysInUse)} days: change every ${filter.changeDays} days`,
        });
        const pa = filter.pa;
        const credit = pa === null || prevAt === undefined || !Number.isFinite(filter.countFrom) ? 0
          : Math.max(0, Math.min(now() - prevAt, now() - filter.countFrom));
        const judged = (rule) => (!filter.sensor ? { hit: false, released: true, text: () => '' } : pa === null ? null : rule);
        addUp(room, active, 'filterDirty', FILTER_ALARM_DELAY_MS, judged({
          hit: pa >= filter.finalPa, released: pa < filter.finalPa - 10,
          text: () => `Filter pressure ${one(pa)} Pa: at or above the change pressure (${num(filter.finalPa)} Pa)`,
        }), credit);
        addUp(room, active, 'filterMissing', FILTER_ALARM_DELAY_MS, judged({
          hit: pa < filter.cleanPa / 2, released: pa >= 0.6 * filter.cleanPa - EPS,
          text: () => `Filter pressure ${one(pa)} Pa: filter missing or torn, or the sensor tube is off`,
        }), credit);
      }

      // A humidifier too small for the room: running (switched on and drawing current) for HUMIDIFIER_DELAY with the humidity
      // still below the band. Not from a faulty probe; a missing reading pauses the count.
      const humidifierOn = machines?.relay?.machines?.find((x) => x.key === 'humidifier')?.status === 'on';
      if (clear.rh) {
        if (active.has('humidifierTooSmall')) db.clearAlarm(room.id, 'humidifierTooSmall', now());
        pending.delete(`${room.id}/humidifierTooSmall`);
      } else {
        const rh = readings.rh;
        apply(room, active, 'humidifierTooSmall', 'warning', HUMIDIFIER_DELAY, rh === null || rh === undefined ? null : {
          hit: humidifierOn && rh < bands.rhLow,
          released: !humidifierOn || rh >= bands.rhLow,
          text: () => `Humidifier too small: after ${HUMIDIFIER_DELAY / MIN_MS} min on, humidity was ${one(rh)} % RH (band from ${num(bands.rhLow)} % RH)`,
        });
      }

      for (const key of MACHINE_KEYS) {
        const m = key === 'ac' ? machines?.ac : machines?.relay?.machines?.find((x) => x.key === key);
        const status = m?.status;
        let result = null;
        if (status === 'not-wired' || status === 'not-fitted') result = { hit: false, released: true, text: () => '' };
        else if (status !== undefined) {
          const bad = status in BAD_STATUS;
          result = { hit: bad, released: !bad, text: () => `${MACHINE_NAMES[key]}: ${BAD_STATUS[status](m, key)}` };
        }
        apply(room, active, `machine.${key}`, 'serious', MIN_MS, result);
      }
    },

    // Drops the delay counts of a deleted room.
    forget(roomId) {
      for (const map of [pending, counted]) for (const slot of [...map.keys()]) if (slot.startsWith(`${roomId}/`)) map.delete(slot);
      lastAt.delete(roomId);
    },

    // Drops the delay counts of some of the room's alarms (a filter change: the old filter's count must not go on).
    reset(roomId, keys) {
      for (const key of keys) {
        pending.delete(`${roomId}/${key}`);
        counted.delete(`${roomId}/${key}`);
      }
    },
  };
}

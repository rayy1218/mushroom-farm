// Alarms (spec 2026-10-19-safety-and-history-design.md section 3): the controller's run calls evaluate once per room
// and cycle. A condition must hold for its delay before an alarm is raised; an active alarm clears with a little
// hysteresis. The alarms themselves are rows of the alarms table (see db.js); only the delay counts are in memory.

import { FILTER_ALARM_DELAY_MS } from './filter.js';
import { STAGES } from '../web/crops.js';
import { RELAY_KEYS } from './machine-codes.js';
import { fitted } from './machines.js';

const MIN_MS = 60_000;
// A result that pauses an alarm (independent review 2026-11-12): a missing reading or a held room (its gateway down) keeps the
// delay count and an alarm that is on as they are; null instead drops the count (the thing cannot be told any more).
const PAUSE = Symbol('pause');
// A pause longer than this does not count (final review 2026-11-12): the count, the Critical hold and an alarm's "began" move on
// by the gap, so the time out of band that was seen adds up across outages (review #12: restarting them had hidden a hot room
// behind a gateway out more than a minute every few minutes) and a 2 h outage cannot raise Serious "for 30 min" with the first
// reading after it.
export const MAX_GAP_MS = MIN_MS;
// The window a gateway alarm clears over: answering in more than three quarters of its cycles.
const GATEWAY_CLEAR_MS = 10 * MIN_MS;
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

// The tiers (spec 2026-11-12-alarms-triage-design.md 2): a Warning still out of band SERIOUS_AFTER after its condition began
// is Serious; past the room's crop limit (web/crops.js roomLimits) for the rule's critical hold it is Critical.
export const SERIOUS_AFTER_MS = 30 * MIN_MS;
const DRY_STAGES = ['pinning', 'fruiting'];
// "the hot limit for Grey oyster", or the band's guard when the band set the limit.
const limitFor = (what, crop, guard) => (crop ? `the ${what} limit for ${crop}` : `the ${what} limit (${guard})`);

// The process alarms: raised when `hit` holds for the delay, cleared when `released` holds. A rule gets the good
// value of its reading (null when the sensor is faulty or gave nothing: no alarm from a bad sensor) and the bands.
// critical: the tier past a crop limit L (null: none), held for `hold`; `applies(stage)` when only some stages have it.
const PROCESS = [
  { key: 'tHigh', sensor: 't', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.t,
    hit: (v, b) => v > b.tHigh + 1, released: (v, b) => v <= b.tHigh + 0.8 + EPS,
    text: (v, b) => `Temperature ${one(v)} °C: more than 1 °C over ${tBand(b)}`,
    critical: { hold: 10 * MIN_MS, hit: (v, L) => v > L.hot,
      text: (v, L) => `Temperature ${one(v)} °C: above ${num(L.hot)} °C, ${limitFor('hot', L.hotFor, '3 °C over the band')}, for 10 min` } },
  { key: 'tLow', sensor: 't', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.t,
    hit: (v, b) => v < b.tLow - 1, released: (v, b) => v >= b.tLow - 0.8 - EPS,
    text: (v, b) => `Temperature ${one(v)} °C: more than 1 °C under ${tBand(b)}`,
    critical: { hold: 30 * MIN_MS, hit: (v, L) => v < L.cold,
      text: (v, L) => `Temperature ${one(v)} °C: below ${num(L.cold)} °C, ${limitFor('cold', L.coldFor, '3 °C under the band')}, for 30 min` } },
  { key: 'rhLow', sensor: 'rh', level: 'warning', delay: 5 * MIN_MS, read: (r) => r.rh,
    hit: (v, b) => v < b.rhLow - 5, released: (v, b) => v >= b.rhLow - 4 - EPS,
    text: (v, b) => `Humidity ${one(v)} % RH: more than 5 % RH under ${rhBand(b)}`,
    critical: { hold: 15 * MIN_MS, applies: (stage) => DRY_STAGES.includes(stage), hit: (v, L) => v < L.dry,
      text: (v, L, stage) => `Humidity ${one(v)} % RH: below ${num(L.dry)} % RH, ${limitFor('dry', L.dryFor, '10 % RH under the band')} in ${STAGES[stage].toLowerCase()}, for 15 min` } },
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

// What a room's gateway carries (spec 2026-11-12-alarms-triage-design.md 4), by name: the machines (the fitted relay outputs, the
// aircon) and the sensors it has wired. The gateway and relay module alarms list them as held.
const SENSOR_NAMES = [['trhAddress', 'T/RH probe'], ['co2Address', 'CO₂ sensor'], ['dpAddress', 'Filter pressure sensor'], ['meterAddress', 'Energy meter']];
export function heldOf(room) {
  const machines = (room.relayAddress ?? null) === null ? [] : RELAY_KEYS.filter((k) => fitted(room, k)).map((k) => MACHINE_NAMES[k]);
  if ((room.acAddress ?? null) !== null) machines.push(MACHINE_NAMES.ac);
  return { machines, sensors: SENSOR_NAMES.filter(([field]) => (room[field] ?? null) !== null).map(([, name]) => name) };
}

const andList = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
const nOf = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// How long each process alarm's condition must hold (the Overview holds a reading out of band as long before it says so).
export const PROCESS_DELAYS = Object.fromEntries(PROCESS.map((p) => [p.key, p.delay]));

// db: the farm database (alarm queries). now is injectable.
export function createAlarms({ db, now = Date.now }) {
  const pending = new Map(); // `${roomId}/${key}` → when the raising condition began to hold
  const counted = new Map(); // `${roomId}/${key}` → ms of counted time in the raising condition (the filter pressure alarms)
  const lastAt = new Map(); // room id → the time of its last evaluation
  const began = new Map(); // `${roomId}/${key}` → when the condition of an active alarm began to hold (its pending start)
  const pausedSince = new Map(); // slot → when its pause began (a PAUSE result, or a missing reading for a Critical hold)
  const resumed = new Set(); // slots back from a long pause: their alarm waits at least MAX_GAP_MS of its condition
  const gatewayCycles = new Map(); // gateway text ('' the farm's) → { since, cycles: [{ at, down }] of the last minute }

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
  function apply(room, active, key, level, delay, result, extra = undefined) {
    const slot = `${room.id}/${key}`;
    if (result === PAUSE) { // nothing to tell now: the count and an alarm that is on wait as they are
      if (!pausedSince.has(slot)) pausedSince.set(slot, now());
      return;
    }
    if (pausedSince.has(slot)) {
      const gap = now() - pausedSince.get(slot);
      if (gap > MAX_GAP_MS) { // a long gap does not count: the counts move on by it
        if (pending.has(slot)) pending.set(slot, pending.get(slot) + gap);
        if (began.has(slot)) began.set(slot, began.get(slot) + gap);
        else if (active.has(key)) began.set(slot, active.get(key).raisedAt - delay + gap); // after a restart
        resumed.add(slot); // and a sensor fault left from the outage (delay 0) must hold a while first
      }
      pausedSince.delete(slot);
    }
    if (result === null) {
      pending.delete(slot);
      return;
    }
    const at = now();
    if (active.has(key)) {
      if (result.released) {
        db.clearAlarm(room.id, key, at);
        began.delete(slot);
      }
      return;
    }
    if (!result.hit) {
      pending.delete(slot);
      resumed.delete(slot);
      return;
    }
    if (!pending.has(slot)) pending.set(slot, at);
    if (at - pending.get(slot) >= (resumed.has(slot) ? Math.max(delay, MAX_GAP_MS) : delay)) {
      resumed.delete(slot);
      began.set(slot, pending.get(slot));
      pending.delete(slot);
      db.raiseAlarm(room.id, key, level, result.text(), at, extra);
    }
  }

  // The tiers of a process alarm (spec 2026-11-12-alarms-triage-design.md 2), after apply: up only, never down. v: the good
  // value (null: nothing to tell, the Critical hold starts again). limits: roomLimits or null; stage: the program's or null.
  function tier(room, rule, v, bands, limits, stage) {
    const slot = `${room.id}/${rule.key}.critical`;
    const c = rule.critical;
    if (v === null || v === undefined) { // a missing reading pauses the hold (review 2026-11-12); a long gap starts it again
      if (!pausedSince.has(slot)) pausedSince.set(slot, now());
      return;
    }
    if (pausedSince.has(slot)) {
      const gap = now() - pausedSince.get(slot);
      if (gap > MAX_GAP_MS && pending.has(slot)) pending.set(slot, pending.get(slot) + gap); // as apply: the gap does not count
      pausedSince.delete(slot);
    }
    const past = limits !== null && (!c.applies || c.applies(stage)) && c.hit(v, limits);
    if (!past) pending.delete(slot);
    else if (!pending.has(slot)) pending.set(slot, now());
    const at = now();
    const a = db.activeAlarms(room.id).find((x) => x.key === rule.key) ?? null;
    if (past && at - pending.get(slot) >= c.hold) {
      if (!a) {
        pending.delete(`${room.id}/${rule.key}`);
        began.set(`${room.id}/${rule.key}`, pending.get(slot));
        db.raiseAlarm(room.id, rule.key, 'critical', c.text(v, limits, stage), at);
      } else if (a.level !== 'critical') db.escalateAlarm(a.id, 'critical', c.text(v, limits, stage));
      return;
    }
    // from when the condition began; after a restart from the raise time less the delay
    const since = began.get(`${room.id}/${rule.key}`) ?? (a ? a.raisedAt - rule.delay : null);
    if (a?.level === 'warning' && rule.hit(v, bands) && at - since >= SERIOUS_AFTER_MS) {
      db.escalateAlarm(a.id, 'serious', `${rule.text(v, bands)} for ${SERIOUS_AFTER_MS / MIN_MS} min`);
    }
  }

  return {
    // room: { id, relayAddress, acAddress }. input: { readings: { t, rh, co2 } (good values or null), bands (the room's control settings, with auto and autoChangedAt),
    // faults: { trh, co2 } (the fault text or null),
    // blocksDone: { flush, flushes } while the room's program is done, else null.
    // filter: { sensor, pa, cleanPa, finalPa, changeDays, daysInUse } (filter.js filterInput), or missing: no filter alarms.
    // clear: { t, rh, co2 } (true when that value's sensor is faulty or not wired: its process alarms clear), cappedInRow, machines (the machines view or null) }.
    // limits: the room's crop limits (web/crops.js roomLimits; null without crops: no Critical tier), stage: the program's stage.
    // held: true while the room's gateway is down (no sensor fault, relay module or machine alarm is raised).
    evaluate(room, { readings, bands, faults, clear = {}, cappedInRow, machines, blocksDone = null, filter = null, limits = null, stage = null, held = false }) {
      const active = new Map(db.activeAlarms(room.id).map((a) => [a.key, a]));

      for (const rule of PROCESS) {
        const v = rule.read(readings);
        if (clear[rule.sensor] && !held) {
          // A faulty or unwired sensor: the alarm ends (the sensor fault alarm says why) and the count is dropped. Not while the
          // room is held: a probe gone silent with its gateway says nothing about the room (review 2026-11-12: a hot room's
          // alarm had cleared in a 15 s outage).
          if (active.has(rule.key)) db.clearAlarm(room.id, rule.key, now());
          pending.delete(`${room.id}/${rule.key}`);
          pending.delete(`${room.id}/${rule.key}.critical`);
          began.delete(`${room.id}/${rule.key}`);
          continue;
        }
        const result = v === null || v === undefined ? PAUSE
          : { hit: rule.hit(v, bands), released: rule.released(v, bands), text: () => rule.text(v, bands) };
        apply(room, active, rule.key, rule.level, rule.delay, result);
        if (rule.critical) tier(room, rule, v, bands, limits, stage);
      }

      // held: the room's gateway is down (evaluateGateways): its devices' alarms wait (null), the gateway alarm says why.
      for (const [key, name, fault] of [['sensorTrh', 'T/RH probe', faults.trh], ['sensorCo2', 'CO₂ sensor', faults.co2]]) {
        apply(room, active, key, 'serious', 0, held ? PAUSE : { hit: Boolean(fault), released: !fault, text: () => `${name} fault: ${fault}` });
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
      if (clear.rh && !held) {
        if (active.has('humidifierTooSmall')) db.clearAlarm(room.id, 'humidifierTooSmall', now());
        pending.delete(`${room.id}/humidifierTooSmall`);
      } else {
        const rh = readings.rh;
        apply(room, active, 'humidifierTooSmall', 'warning', HUMIDIFIER_DELAY, rh === null || rh === undefined ? PAUSE : {
          hit: humidifierOn && rh < bands.rhLow,
          released: !humidifierOn || rh >= bands.rhLow,
          text: () => `Humidifier too small: after ${HUMIDIFIER_DELAY / MIN_MS} min on, humidity was ${one(rh)} % RH (band from ${num(bands.rhLow)} % RH)`,
        });
      }

      // A relay module that does not answer (every fitted output no-answer: they share one poll) is one alarm; its outputs'
      // own alarms wait meanwhile (spec 2026-11-12-alarms-triage-design.md 4).
      const outputs = (machines?.relay?.machines ?? []).filter((x) => x.status !== 'not-fitted' && x.status !== 'not-wired');
      const relayDown = outputs.length > 0 && outputs.every((x) => x.status === 'no-answer');
      const relayKnown = outputs.length === 0 || outputs.every((x) => x.status !== 'no-data');
      apply(room, active, 'relayNoAnswer', 'serious', MIN_MS, held ? PAUSE : !relayKnown ? null : {
        hit: relayDown, released: !relayDown,
        text: () => `Relay module not answering: ${outputs.length} ${outputs.length === 1 ? 'machine gets' : 'machines get'} no commands. Check its power and wires (address ${machines.relay.address})`,
      });
      for (const key of MACHINE_KEYS) {
        const m = key === 'ac' ? machines?.ac : machines?.relay?.machines?.find((x) => x.key === key);
        const status = m?.status;
        let result = null;
        if (status === 'not-wired' || status === 'not-fitted') result = { hit: false, released: true, text: () => '' };
        else if (held || (key !== 'ac' && relayDown)) result = PAUSE; // held: no new alarm, one already on stays, the count waits
        else if (status !== undefined) {
          const bad = status in BAD_STATUS;
          result = { hit: bad, released: !bad, text: () => `${MACHINE_NAMES[key]}: ${BAD_STATUS[status](m, key)}` };
        }
        apply(room, active, `machine.${key}`, 'serious', MIN_MS, result);
      }
    },

    // The gateway alarms (spec 2026-11-12-alarms-triage-design.md 4), once per cycle before the rooms: gateways is the poller's
    // health ([{ gateway, address, roomIds, down }]; address: the gateway's text, the farm's too; null: not known, nothing changes). A gateway down now and in most cycles of the last
    // minute raises one Serious alarm on the lowest room behind it; it clears when it answers now and in more than three quarters
    // of the last minute. Returns the ids of the rooms behind a gateway down in this cycle (held: their alarms pause).
    evaluateGateways(gateways) {
      const held = new Set();
      if (!Array.isArray(gateways)) return held;
      const rooms = new Map(db.listRooms().map((r) => [r.id, r]));
      const owners = new Set();
      for (const g of gateways) {
        const ids = g.roomIds.filter((id) => rooms.has(id)).sort((x, y) => x - y);
        if (!ids.length) continue;
        // the last minutes of this gateway (review 2026-11-12: one silent cycle in four had hidden a dead aircon, and a gateway
        // back for a while had sent a Cleared and a new alarm each time)
        const at = now();
        const seen = gatewayCycles.get(g.gateway ?? '') ?? { since: at, cycles: [] };
        seen.cycles = [...seen.cycles.filter((c) => c.at >= at - GATEWAY_CLEAR_MS), { at, down: g.down }];
        gatewayCycles.set(g.gateway ?? '', seen);
        const minute = at - seen.since >= MIN_MS;
        const lastMinute = seen.cycles.filter((c) => c.at >= at - MIN_MS);
        const downs = lastMinute.filter((c) => c.down).length;
        const downs5 = seen.cycles.filter((c) => c.down).length;
        const first = rooms.get(ids[0]);
        owners.add(first.id);
        const behind = ids.map((id) => rooms.get(id));
        const machines = behind.reduce((n, r) => n + heldOf(r).machines.length, 0);
        const sensors = behind.reduce((n, r) => n + heldOf(r).sensors.length, 0);
        const what = [machines ? nOf(machines, 'machine', 'machines') : null, sensors ? nOf(sensors, 'sensor', 'sensors') : null].filter(Boolean).join(', ');
        // the place first and what to do (critique 2026-11-12: "Gateway 127.0.0.1:2514" meant nothing to a worker); the address is
        // kept on the alarm as it was raised (g.address; main.js names the farm's), for History, the owner's only
        const names = andList(behind.map((r) => r.name));
        const name = g.gateway === null ? "The farm's gateway" : behind.length === 1 ? `${names}'s gateway` : `The gateway of ${names}`;
        const whom = g.gateway === null ? ` for ${names}` : '';
        const active = new Map(db.activeAlarms(first.id).map((a) => [a.key, a]));
        // raised when down now and in more than half the cycles of the last minute; cleared when answering now and in more than
        // three quarters of the cycles of the last 10 min (final review 2026-11-12: "all of them" kept it on through rare drops;
        // review #12: one minute let a gateway out 65 s in 130 s send a raise and a Cleared every two minutes). Its rooms are held
        // only in the cycles it is down, so an alarm kept on hides nothing.
        apply(first, active, 'gateway', 'serious', 0, {
          hit: minute && g.down && downs > lastMinute.length / 2, released: minute && !g.down && downs5 < seen.cycles.length / 4,
          text: () => `${name} not answering: no readings or commands${whom}${what ? ` (${what})` : ''}. Check its power and network cable`,
        }, { gateway: g.address ?? g.gateway ?? null });
        // held in a cycle it is down (the counts pause, so an up cycle between lets the rooms' own alarms go on)
        if (g.down) for (const id of ids) held.add(id);
      }
      // a room no longer first behind a gateway in the health (moved, or nothing wired any more)
      for (const id of rooms.keys()) {
        if (owners.has(id)) continue;
        if (db.activeAlarms(id).some((a) => a.key === 'gateway')) db.clearAlarm(id, 'gateway', now());
        pending.delete(`${id}/gateway`);
      }
      return held;
    },

    // Drops the delay counts of a deleted room.
    forget(roomId) {
      for (const slot of [...resumed]) if (slot.startsWith(`${roomId}/`)) resumed.delete(slot);
      for (const map of [pending, counted, began, pausedSince]) for (const slot of [...map.keys()]) if (slot.startsWith(`${roomId}/`)) map.delete(slot);
      lastAt.delete(roomId);
    },

    // Drops the delay counts of some of the room's alarms (a filter change: the old filter's count must not go on).
    reset(roomId, keys) {
      for (const key of keys) {
        pending.delete(`${roomId}/${key}`);
        counted.delete(`${roomId}/${key}`);
        began.delete(`${roomId}/${key}`);
        pausedSince.delete(`${roomId}/${key}`);
      }
    },
  };
}

// Electricity and water per history bucket (spec 2026-10-26-usage-charts-design.md section 2): the usage part of
// GET /api/rooms/:id/history. The rules are the Energy card's (usage.js): a room with an energy meter is metered (the meter's
// steps by meterStep, read like the days are), one without is estimated from each machine's run time and rating
// (estimateDay; the intake against its filter by the day's mean pressure); water is always the humidifier's run time
// times its output.

import { fanWattFactor } from '../device/sim-power.js';
import { MACHINES, runIntervals, estimateDay, newMeterState, advanceMeter, dayWork, dayWindows, localZone } from './usage.js';

const HOUR_MS = 3_600_000;
const SETTLE_MS = 60_000; // a bucket is final this long after its end, like a day of the Energy card
const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

// Adds each interval [{ start, end, kind }] of a machine to the buckets it overlaps: ms[i][machine][kind]. The buckets are
// b wide from the edge `first`; the last one ends at `to`.
function addRunTime(ms, intervals, machine, first, b, to) {
  const n = ms.length;
  for (const { start, end, kind } of intervals) {
    const lo = Math.max(0, Math.floor((start - first) / b));
    const hi = Math.min(n - 1, Math.floor((Math.min(end, to) - 1 - first) / b));
    for (let i = lo; i <= hi; i++) {
      const piece = Math.min(end, first + (i + 1) * b, to) - Math.max(start, first + i * b);
      if (piece <= 0) continue;
      const m = (ms[i][machine] ??= {});
      m[kind] = (m[kind] ?? 0) + piece;
    }
  }
}

// The intake factor of each bucket: the filter's mean counted pressure of the local day the bucket starts in (the Energy
// card's day work, cached there), so the buckets of a day add up to the day. 1 without a filter sensor.
function intakeFactors(db, room, starts, to, zone) {
  if (room.dpAddress === null) return starts.map(() => 1);
  let count = 0;
  for (let d = zone.startOfDay(starts[0]); d <= to; d = zone.addDays(d, 1)) count++;
  const days = dayWindows(to, count, zone).map((day) => {
    const { pa } = dayWork(db, room, day, { now: to, zone });
    return { start: day.start, factor: pa === null ? 1 : fanWattFactor(pa, room.filterCleanPa, room.fanMaxPa) };
  });
  return starts.map((s) => days.findLast((d) => s >= d.start)?.factor ?? 1);
}

// The meter's kWh of each bucket starting at `starts` (b wide, the last one up to `to`), null for one without a reading.
// The settled buckets are kept in the room's usage cache (db.usageDays: a reading written before `meter.upto` or a change of
// the room drops the entry), so a refresh reads only the buckets since; the open ones are read on a copy of the state.
function meterBuckets(db, room, starts, b, to) {
  const cache = db.usageDays(room.id);
  const key = `buckets/${b}`;
  const first = starts[0];
  let e = cache.get(key);
  if (e && (first < e.from || e.meter.upto < first || e.meter.upto > to + 1)) e = undefined; // out of the window: start again
  if (!e) {
    const before = db.meterBefore(room.id, first);
    const state = { ...newMeterState(), ...(before ? { base: before.energy, at: before.at } : {}) };
    e = { from: first, end: first, meter: { state, kWh: 0, readings: 0, upto: first }, kWh: new Map() };
    cache.set(key, e);
  }
  const step = (m, hi) => {
    m.kWh = 0;
    m.readings = 0;
    advanceMeter(db, room.id, m, hi, true);
    return m.readings > 0 ? m.kWh : null;
  };
  for (let s = e.meter.upto; s + b + SETTLE_MS <= to; s += b) e.kWh.set(s, step(e.meter, s + b));
  e.end = e.meter.upto;
  for (const s of e.kWh.keys()) if (s < first) e.kWh.delete(s);
  e.from = first;
  const open = { ...e.meter, state: { ...e.meter.state } };
  return starts.map((s) => (s < e.meter.upto ? e.kWh.get(s) : step(open, Math.min(s + b, to + 1))));
}

// { buckets: [{ at, kWh, waterL }], metered, totals: { kWh, waterL } } for the window [from, to] cut in bucketS buckets the
// way db.history cuts the readings: from the first edge at or after `from` to the running bucket holding `to`, each `at` the
// bucket's middle kept inside the window. Metered: a bucket's kWh is the meter's increase over the readings inside it, null
// when it has none (the total is null when no bucket has one). Buckets rounded to 6 places, the totals to 3.
export function bucketUsage(db, room, { from, to, bucketS, zone = localZone }) {
  const b = bucketS * 1000;
  const fi = Math.ceil(from / b);
  const ci = Math.floor(to / b);
  const first = fi * b;
  const starts = Array.from({ length: Math.max(0, ci - fi + 1) }, (_, i) => first + i * b);
  const ms = starts.map(() => ({}));
  const metered = room.meterAddress !== null;
  let kWh = [];
  if (starts.length > 0) {
    for (const machine of MACHINES) {
      addRunTime(ms, runIntervals(db.machineLogWindow(room.id, machine, first, to), first, to, machine), machine, first, b, to);
    }
    if (metered) kWh = meterBuckets(db, room, starts, b, to);
    else {
      const factors = intakeFactors(db, room, starts, to, zone);
      kWh = ms.map((m, i) => Object.values(estimateDay(m, room, factors[i])).reduce((s, v) => s + v, 0));
    }
  }
  const raw = starts.map((start, i) => ({
    at: Math.min(Math.max(start + b / 2, from), to), kWh: kWh[i], waterL: ((ms[i].humidifier?.on ?? 0) / HOUR_MS) * room.humidifierLH,
  }));
  const read = raw.filter((x) => x.kWh !== null);
  return {
    buckets: raw.map((x) => ({ at: x.at, kWh: x.kWh === null ? null : round(x.kWh, 6), waterL: round(x.waterL, 6) })),
    metered,
    totals: {
      kWh: metered && read.length === 0 ? null : round(read.reduce((s, x) => s + x.kWh, 0), 3),
      waterL: round(raw.reduce((s, x) => s + x.waterL, 0), 3),
    },
  };
}

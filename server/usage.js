// Energy and water usage (spec 2026-10-20-energy-water-outdoor-design.md section 5). The pure parts (run time, estimated and
// metered energy) take plain rows; roomUsage and farmUsage read them from the database. No HTTP.

import { fanWattFactor } from '../device/sim-power.js';
import { meanCountedPa } from './filter.js';
import { energyCost } from './energy-cost.js'; // ---- Data integrity ----

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FAN_SHARE = 0.05; // the aircon in fan mode draws this share of its rated input
const MIN_DAYS = 30; // the 7 and 30 day totals need that many days whatever `days` is
// The days a room's cache keeps (the harvest costs read a run's days up to this far back; spec 2026-11-04-harvest-design.md 4).
export const USAGE_DAYS_KEPT = 400;
export const MACHINES = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights', 'ac'];
const RATING = { intake: 'intakeW', exhaust: 'exhaustW', circulation: 'circulationW', humidifier: 'humidifierW', dehumidifier: 'dehumidifierW', lights: 'lightsW' };

const pad = (n) => String(n).padStart(2, '0');
const round = (v, digits) => Math.round(v * 10 ** digits) / 10 ** digits;

// A time zone is { startOfDay(ms), addDays(startMs, n), label(ms) }: the local midnight at or before a time, a midnight
// n days on, and the YYYY-MM-DD of a time. localZone is the server's; fixedZone is a zone without daylight saving (tests).
export const localZone = {
  startOfDay(ms) {
    const d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  },
  addDays(startMs, n) {
    const d = new Date(startMs);
    d.setDate(d.getDate() + n);
    return d.getTime();
  },
  label(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  },
};

// offsetMin: minutes east of UTC.
export function fixedZone(offsetMin) {
  const off = offsetMin * 60_000;
  return {
    startOfDay: (ms) => Math.floor((ms + off) / DAY_MS) * DAY_MS - off,
    addDays: (startMs, n) => startMs + n * DAY_MS,
    label: (ms) => new Date(ms + off).toISOString().slice(0, 10),
  };
}

// The last `count` local days ending today, oldest first: [{ date, start, end }]; today ends at `now`.
export function dayWindows(now, count, zone) {
  const today = zone.startOfDay(now);
  const days = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = zone.addDays(today, -i);
    days.push({ date: zone.label(start), start, end: i === 0 ? now : zone.addDays(start, 1) });
  }
  return days;
}

// The intervals a machine was on from log rows ([{ at, on, mode }], oldest first, the first one at or before `from` when
// the machine was on at the start) cut to [from, to]: [{ start, end, kind }]. kind is 'on', or for the aircon 'full'
// (cool, dry, heat; a mode the log does not know counts as full) or 'fan'. A machine on at the end counts up to `to`.
export function runIntervals(rows, from, to, machine) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row.on) continue;
    const start = Math.max(row.at, from);
    const end = Math.min(rows[i + 1]?.at ?? to, to);
    if (end <= start) continue;
    out.push({ start, end, kind: machine === 'ac' ? (row.mode === 'fan' ? 'fan' : 'full') : 'on' });
  }
  return out;
}

// Milliseconds of each kind in each day: one { on?, full?, fan? } object per day of `days` (see dayWindows).
export function msPerDay(intervals, days) {
  const out = days.map(() => ({}));
  for (const { start, end, kind } of intervals) {
    days.forEach((day, i) => {
      const ms = Math.min(end, day.end) - Math.max(start, day.start);
      if (ms > 0) out[i][kind] = (out[i][kind] ?? 0) + ms;
    });
  }
  return out;
}

// ---- Data integrity ---- (spec 2026-11-12-data-integrity-design.md 7.1) Seen time: a room is seen while one of its good
// readings is at most SEEN_MS old; metered while a good meter reading is. A machine's run time counts only while the room is
// seen (an outage is no longer costed as running all day); the meter's time is measured, the rest of the seen time estimated.
export const SEEN_MS = 15 * 60_000; // three readings at the slowest reading interval (300 s)
const spanMs = (spans) => spans.reduce((s, [a, b]) => s + (b - a), 0);
// Spans [[start, end]] from seenBoundaries' rows (each reading covers `gap` ms after it), clipped to [from, to].
export function spansOf(rows, from, to, gap = SEEN_MS) {
  const last = rows.find((r) => r.at === null)?.prev ?? null;
  if (last === null) return [];
  const starts = rows.filter((r) => r.at !== null).sort((a, b) => a.at - b.at);
  const spans = [];
  let start = null;
  for (const r of starts) {
    if (r.prev === null) { start = r.at; continue; }
    if (start !== null) spans.push([start, r.prev + gap]);
    start = r.at;
  }
  if (start !== null) spans.push([start, last + gap]);
  return clipSpans(spans, from, to);
}
export const clipSpans = (spans, from, to) => spans.map(([a, b]) => [Math.max(a, from), Math.min(b, to)]).filter(([a, b]) => b > a);
// Spans a less spans b (both sorted, not overlapping).
export function subtractSpans(a, b) {
  const out = [];
  for (const [s, e] of a) {
    let cur = s;
    for (const [bs, be] of b) {
      if (be <= cur || bs >= e) continue;
      if (bs > cur) out.push([cur, bs]);
      cur = Math.max(cur, be);
    }
    if (cur < e) out.push([cur, e]);
  }
  return out;
}
// Spans a joined with spans b, sorted and merged.
export function unionSpans(a, b) {
  const all = [...a, ...b].sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [s, e] of all) {
    const top = out.at(-1);
    if (top && s <= top[1]) top[1] = Math.max(top[1], e);
    else out.push([s, e]);
  }
  return out;
}
// Machine intervals [{ start, end, kind }] cut to the spans.
export const intervalsIn = (intervals, spans) => intervals.flatMap((iv) => spans
  .map(([a, b]) => ({ ...iv, start: Math.max(iv.start, a), end: Math.min(iv.end, b) })).filter((x) => x.end > x.start));

// Two machines' ms per kind ({ on?, full?, fan? } each) added.
const addMs = (a, b) => Object.fromEntries(MACHINES.map((m) => {
  const out = { ...(a[m] ?? {}) };
  for (const [k, v] of Object.entries(b[m] ?? {})) out[k] = (out[k] ?? 0) + v;
  return [m, out];
}));

// When the app could see the room in [from, to): { seen, metered (spans), unseenMs }. A room with no sensor or meter is
// always seen (the app has nothing else to go by); so is the time before its first good reading.
export function seenOf(db, room, from, to) {
  const devices = [room.trhAddress, room.co2Address, room.meterAddress, room.dpAddress].some((a) => a !== null && a !== undefined);
  if (!devices) return { seen: [[from, to]], metered: [], unseenMs: 0 };
  const first = db.firstReadingAt(room.id);
  let seen = spansOf(db.seenBoundaries(room.id, from - SEEN_MS, to, SEEN_MS), from, to);
  if (first === null || first > from) seen = unionSpans(seen, clipSpans([[from, first === null ? to : first]], from, to));
  const metered = room.meterAddress === null || room.meterAddress === undefined ? []
    : spansOf(db.seenBoundaries(room.id, from - SEEN_MS, to, SEEN_MS, { meterOnly: true }), from, to);
  return { seen, metered, unseenMs: (to - from) - spanMs(seen) };
}

// seenOf for a day of the usage cache: the spans read so far kept on the entry (entry.seen: { upto, seen, metered }), only
// the readings since (and the SEEN_MS before them) read again; the time before the room's first reading added on top.
function seenOfDay(db, room, entry, from, to) {
  const devices = [room.trhAddress, room.co2Address, room.meterAddress, room.dpAddress].some((a) => a !== null && a !== undefined);
  if (!devices) return { seen: [[from, to]], metered: [], unseenMs: 0 };
  const s = entry.seen ?? (entry.seen = { upto: from, seen: [], metered: [] });
  if (to > s.upto) {
    const lo = Math.max(from, s.upto) - SEEN_MS;
    s.seen = unionSpans(s.seen, spansOf(db.seenBoundaries(room.id, lo, to, SEEN_MS), from, to));
    if (room.meterAddress !== null && room.meterAddress !== undefined) {
      s.metered = unionSpans(s.metered, spansOf(db.seenBoundaries(room.id, lo, to, SEEN_MS, { meterOnly: true }), from, to));
    }
    s.upto = to;
  }
  const first = db.firstReadingAt(room.id);
  const seen = first === null || first > from ? unionSpans(s.seen, clipSpans([[from, first === null ? to : first]], from, to)) : s.seen;
  return { seen: clipSpans(seen, from, to), metered: clipSpans(s.metered, from, to), unseenMs: (to - from) - spanMs(clipSpans(seen, from, to)) };
}

// Estimated kWh of each machine in one day from its run time and the room's ratings; the intake's rating times intakeFactor
// (its filter: spec 2026-10-22-filter-design.md 6).
export function estimateDay(ms, room, intakeFactor = 1) {
  const kWh = (milliseconds, watts) => (milliseconds / HOUR_MS) * (watts / 1000);
  const out = {};
  for (const machine of MACHINES) {
    const m = ms[machine] ?? {};
    out[machine] = machine === 'ac'
      ? kWh(m.full ?? 0, room.acInputW) + kWh(m.fan ?? 0, room.acInputW * FAN_SHARE)
      : kWh(m.on ?? 0, (room[RATING[machine]] ?? 0) * (machine === 'intake' ? intakeFactor : 1));
  }
  return out;
}

const MAX_KW = 100; // a step of the meter above this power over the time between two readings is implausible
const LOW_HOLD = 3; // a lower reading is the new base after this many in a row
const SETTLE_MS = 60_000; // a day is complete this long after its end (a reading of the last second may be written late)

// The state of reading a meter total: `base` the highest total seen (null before the first reading), `at` the time of
// the last reading, `low` how many readings in a row were below the base.
export const newMeterState = () => ({ base: null, at: 0, low: 0 });

// One good reading { at, energy } into the state; returns the kWh it adds. Only an increase above the base counts, and not
// when it is more than MAX_KW over the time since the last reading (a swap to a meter with a higher total: the base moves
// there without counting). A lower reading counts nothing: a glitch to 0 and back adds nothing, and one that holds for
// LOW_HOLD readings (a real reset, a new meter) becomes the base and counting goes on from it.
export function meterStep(state, r) {
  if (state.base === null) {
    state.base = r.energy;
    state.at = r.at;
    return 0;
  }
  const elapsed = r.at - state.at;
  state.at = r.at;
  if (r.energy > state.base) {
    const step = r.energy - state.base;
    state.base = r.energy;
    state.low = 0;
    return step <= (MAX_KW * elapsed) / HOUR_MS ? step : 0;
  }
  if (r.energy === state.base) {
    state.low = 0;
  } else if (++state.low >= LOW_HOLD) {
    state.base = r.energy;
    state.low = 0;
  }
  return 0;
}

// Metered energy per day from the good readings [{ at, energy }] oldest first (the first may be flagged `before`, the base
// of the first increase) by meterStep, each step to the day of the reading. Returns [{ kWh, readings }] per day,
// readings = how many were inside the day.
export function meteredDays(readings, days) {
  const out = days.map(() => ({ kWh: 0, readings: 0 }));
  const state = newMeterState();
  for (const r of readings) {
    const kWh = meterStep(state, r);
    if (r.before) continue;
    const day = out[days.findLastIndex((d) => r.at >= d.start)];
    day.readings++;
    day.kWh += kWh;
  }
  return out;
}

// Reads the meter of one day entry on from where it was to `hi` (exclusive). The database sums the plain steps of the
// new readings in one pass; only when a step is not plain (a decrease or an implausible one: rare) are the readings
// stepped here. `final`: no reading can come any more, so the entry is complete up to `hi`; otherwise it is complete up
// to just after its last reading, which is where the next call goes on.
export function advanceMeter(db, roomId, m, hi, final) {
  const c = db.meterChunk(roomId, m.upto, hi);
  if (c.n > 0) {
    const s = m.state;
    let plain = c.bad === 0;
    let bridge = 0; // the step from the last reading read before to the first of the chunk
    if (plain && s.base !== null) {
      bridge = c.first.energy - s.base;
      plain = bridge >= 0 && bridge <= (MAX_KW * (c.first.at - s.at)) / HOUR_MS;
    }
    if (plain) {
      m.kWh += bridge + c.kWh;
      m.readings += c.n;
      m.state = { base: c.last.energy, at: c.last.at, low: 0 };
    } else {
      for (const r of db.meterRows(roomId, m.upto, hi)) {
        m.kWh += meterStep(s, r);
        m.readings++;
      }
    }
    m.upto = final ? hi : c.last.at + 1;
  } else if (final) {
    m.upto = hi;
  }
}

// The work of one day of a room, cached while the day is complete: its machine run times, its metered energy and the mean
// counted pressure of its filter sensor (pa, null without a sensor or a counted reading).
// Today is read on from the last reading each time; a day that ended is final SETTLE_MS later and then costs nothing.
// db.usageDays drops an entry when the room's meter, filter sensor or gateway changes or a row is written inside its days.
export function dayWork(db, room, day, { now, zone }) {
  const cache = db.usageDays(room.id);
  const end = zone.addDays(day.start, 1);
  const key = `${day.start}/${end}`;
  const hi = Math.min(end, now + 1);
  const settled = now >= end + SETTLE_MS;
  let entry = cache.get(key);
  if (entry?.meter && entry.meter.upto > hi) entry = undefined; // the clock went back: start again
  if (!entry) {
    entry = { end, ms: null, meter: null };
    if (room.meterAddress !== null) {
      const before = db.meterBefore(room.id, day.start);
      entry.meter = { state: { ...newMeterState(), ...(before ? { base: before.energy, at: before.at } : {}) }, kWh: 0, readings: 0, upto: day.start };
    }
    cache.set(key, entry);
  }
  if (entry.meter) advanceMeter(db, room.id, entry.meter, hi, settled);
  if (entry.ms) return entry;
  // Data integrity: each machine's run time split into the metered time and the seen time not metered (estimated); none
  // while the room is not seen. Today's seen time is read on from where the last request left it (entry.seen).
  const { seen, metered, unseenMs } = seenOfDay(db, room, entry, day.start, day.end);
  const estimated = subtractSpans(seen, metered);
  const ms = {};
  const msMetered = {};
  for (const machine of MACHINES) {
    const on = runIntervals(db.machineLogWindow(room.id, machine, day.start, day.end), day.start, day.end, machine);
    ms[machine] = msPerDay(intervalsIn(on, estimated), [day])[0];
    msMetered[machine] = msPerDay(intervalsIn(on, metered), [day])[0];
  }
  const pa = room.dpAddress === null ? null
    : meanCountedPa(db.filterReadingsWindow(room.id, day.start, hi), db.machineLogWindow(room.id, 'intake', day.start - 60_000, day.end));
  if (settled) Object.assign(entry, { ms, msMetered, unseenMs, pa });
  return { ...entry, ms, msMetered, unseenMs, pa };
}

// The days of a room: [{ date, kWh, kWhMeasured, kWhEstimated, unseenMs, metered, byMachine, waterL }], oldest first, with the
// unrounded numbers rounded to 3 places. kWhMeasured: the meter's; kWhEstimated: the machines' run time while the room was
// seen and not metered (Data integrity 7.1); kWh their sum; metered: measured and nothing estimated. In the metered time the
// aircon estimate is replaced by `rest` (metered minus the other machines, at least 0); estimates of the other machines above
// the metered kWh are scaled down so that their metered part adds up to it.
// cachedOnly: a day that ended and is not in the cache yet is not worked out but given as { date, pending: true } (a cold
// year of one-second readings takes seconds: warmRoom works it out in the background); today and a day not yet settled are
// read as always (one day, from the last reading on).
export function roomDays(db, room, { now, zone, count, cachedOnly = false }) {
  const days = dayWindows(now, count, zone);
  const cache = db.usageDays(room.id);
  // Only the days older than the kept ones go: a short read after a long one leaves the long one's days for the next.
  if (cache.size > USAGE_DAYS_KEPT) {
    const oldest = zone.addDays(zone.startOfDay(now), -(USAGE_DAYS_KEPT - 1));
    for (const [key, e] of cache) if (e.end <= oldest) cache.delete(key);
  }
  return days.map((day) => {
    const end = zone.addDays(day.start, 1);
    if (cachedOnly && now >= end + SETTLE_MS && !cache.get(`${day.start}/${end}`)?.ms) return { date: day.date, pending: true };
    const work = dayWork(db, room, day, { now, zone });
    const factor = work.pa === null ? 1 : fanWattFactor(work.pa, room.filterCleanPa, room.fanMaxPa);
    const isMetered = room.meterAddress !== null && work.meter.readings >= 2;
    const inMeter = estimateDay(work.msMetered ?? {}, room, factor); // the metered time
    // the seen time not metered; a day the meter gave fewer than two readings: its metered time is estimated too
    const est = estimateDay(isMetered ? work.ms : addMs(work.ms, work.msMetered ?? {}), room, factor);
    const sumOf = (e, keys = MACHINES) => keys.reduce((s, k) => s + e[k], 0);
    const OTHERS = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights'];
    const kWhEstimated = round(sumOf(est), 3);
    const kWhMeasured = isMetered ? round(work.meter.kWh, 3) : 0;
    let byMachine = { ...est, rest: 0 };
    if (isMetered) {
      const metered = work.meter.kWh;
      const others = sumOf(inMeter, OTHERS);
      const scale = others > metered ? metered / others : 1; // the estimates are above the meter: they cannot be all right
      byMachine = { ...Object.fromEntries(OTHERS.map((k) => [k, inMeter[k] * scale + est[k]])), ac: est.ac, rest: Math.max(0, metered - others) };
    }
    const kWh = round(kWhMeasured + kWhEstimated, 3);
    for (const key of Object.keys(byMachine)) byMachine[key] = round(byMachine[key], 3);
    { // the rounding must not move the sum off kWh: the biggest machine takes the rest
      const sum = Object.values(byMachine).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - kWh) > 1e-9 && kWh > 0) {
        const biggest = [...MACHINES, 'rest'].reduce((a, b) => (byMachine[b] > byMachine[a] ? b : a));
        byMachine[biggest] = round(byMachine[biggest] + kWh - sum, 3);
      }
    }
    const humidifierMs = (work.ms.humidifier.on ?? 0) + (work.msMetered?.humidifier?.on ?? 0);
    return {
      date: day.date,
      kWh,
      kWhMeasured,
      kWhEstimated,
      unseenMs: work.unseenMs ?? 0,
      metered: isMetered && kWhEstimated === 0,
      byMachine,
      waterL: round((humidifierMs / HOUR_MS) * room.humidifierLH, 3),
    };
  });
}

// Works out the kept days (USAGE_DAYS_KEPT) of every room one day at a time, with the event loop free between days (the
// first usage request after a start would otherwise stall the poller for seconds with a month of one-second readings): the
// last MIN_DAYS of every room first (the Usage tab's), then the older ones newest first (the harvest costs').
export async function warmUsage(db, { now = Date.now(), zone = localZone } = {}) {
  const days = dayWindows(now, USAGE_DAYS_KEPT, zone);
  for (const part of [days.slice(-MIN_DAYS), days.slice(0, -MIN_DAYS).reverse()]) {
    for (const { id } of db.listRooms()) {
      for (const day of part) {
        const room = db.getRoom(id); // it may have changed or gone meanwhile
        if (!room) break;
        dayWork(db, room, day, { now, zone });
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }
}

// Works out the last `count` days of one room (up to the kept ones), newest first, a day at a time with the event loop free
// between days, as warmUsage does: what roomDays' cachedOnly leaves pending. signal: an AbortSignal that stops it (the
// server closing).
export async function warmRoom(db, roomId, { now = Date.now(), zone = localZone, count = USAGE_DAYS_KEPT, signal } = {}) {
  for (const day of dayWindows(now, Math.min(count, USAGE_DAYS_KEPT), zone).reverse()) {
    if (signal?.aborted) return;
    const room = db.getRoom(roomId); // it may have changed or gone meanwhile
    if (!room) return;
    dayWork(db, room, day, { now, zone });
    await new Promise((resolve) => setImmediate(resolve));
  }
}

// { kWh, cost, waterL, waterCost, metered } over a list of days; cost in the price's currency, 2 places.
// Data integrity (spec 9): each day priced at its own tariff price (prices.tariff, else prices.electricity) and rounded, then
// summed (energy-cost.js), so the Energy card's RM is Costs' and Harvest's; estimated: the RM of the estimated kWh.
export function totals(days, prices) {
  const kWh = round(days.reduce((sum, d) => sum + d.kWh, 0), 3);
  const waterL = round(days.reduce((sum, d) => sum + d.waterL, 0), 3);
  const c = energyCost(days, prices);
  return { kWh, cost: c.electricity, estimated: c.estimated, waterL, waterCost: c.water, metered: isMetered(days) };
}

// A range is metered when it has a metered day and every day that used anything is metered (days before the room's
// first data, at 0, do not make a range "estimated").
function isMetered(days) {
  const used = days.filter((d) => d.metered || d.kWh > 0);
  return used.length > 0 && used.every((d) => d.metered);
}

// The prices a reply shows: today's electricity and the water's (the tariff stays inside: Data integrity).
const shownPrices = ({ electricity, water }) => ({ electricity, water });

const summary = (days, prices) => ({
  today: totals(days.slice(-1), prices),
  last7: totals(days.slice(-7), prices),
  last30: totals(days.slice(-30), prices),
});

// GET /api/rooms/:id/usage: { prices, days: [...last `days`], today, last7, last30 }, or null when there is no such room.
// prices: { electricity, water } (water null when not set). now and zone are for tests.
export function roomUsage(db, roomId, { days = 30, prices, now = Date.now(), zone = localZone }) {
  const room = db.getRoom(roomId);
  if (!room) return null;
  const all = roomDays(db, room, { now, zone, count: Math.max(days, MIN_DAYS) });
  return { prices: shownPrices(prices), days: all.slice(-days), ...summary(all, prices) };
}

// GET /api/usage: the same for the whole farm (days summed over the rooms; metered when every room is) plus
// rooms: [{ id, name, today, last30 }].
export function farmUsage(db, { days = 30, prices, now = Date.now(), zone = localZone }) {
  const count = Math.max(days, MIN_DAYS);
  const rooms = db.listRooms().map((room) => ({ room, days: roomDays(db, room, { now, zone, count }) }));
  const farm = dayWindows(now, count, zone).map((day, i) => {
    const mine = rooms.map((r) => r.days[i]);
    const byMachine = Object.fromEntries([...MACHINES, 'rest'].map((key) => [key, round(mine.reduce((s, d) => s + d.byMachine[key], 0), 3)]));
    return {
      date: day.date,
      kWh: round(mine.reduce((s, d) => s + d.kWh, 0), 3),
      // ---- Data integrity ---- (7.1) the farm's measured, estimated and unseen parts: its rooms' summed
      kWhMeasured: round(mine.reduce((s, d) => s + d.kWhMeasured, 0), 3),
      kWhEstimated: round(mine.reduce((s, d) => s + d.kWhEstimated, 0), 3),
      unseenMs: mine.reduce((s, d) => s + d.unseenMs, 0),
      metered: isMetered(mine), // every room that used anything that day is metered
      byMachine,
      waterL: round(mine.reduce((s, d) => s + d.waterL, 0), 3),
    };
  });
  // ---- Data integrity ---- (9, G18) each room-day priced and rounded on its own: the farm's RM is the sum of its rooms'
  const period = (n) => farmTotals(rooms.map((r) => totals(r.days.slice(-n), prices)), farm.slice(-n), prices);
  return {
    prices: shownPrices(prices),
    days: farm.slice(-days),
    today: period(1), last7: period(7), last30: period(30),
    rooms: rooms.map(({ room, days: d }) => ({
      id: room.id, name: room.name, today: totals(d.slice(-1), prices), last30: totals(d.slice(-30), prices),
    })),
  };
}

// The rooms' totals of a period summed (the RM to the sen); metered as the farm's days of it.
function farmTotals(list, days, prices) {
  const add = (key, places) => round(list.reduce((sum, t) => sum + t[key], 0), places);
  const water = prices.water === null || prices.water === undefined;
  return { kWh: add('kWh', 3), cost: add('cost', 2), estimated: add('estimated', 2), waterL: add('waterL', 3), waterCost: water ? null : add('waterCost', 2), metered: isMetered(days) };
}

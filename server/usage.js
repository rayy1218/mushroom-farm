// Energy and water usage (spec 2026-10-20-energy-water-outdoor-design.md section 5). The pure parts (run time, estimated and
// metered energy) take plain rows; roomUsage and farmUsage read them from the database. No HTTP.

import { fanWattFactor } from '../device/sim-power.js';
import { meanCountedPa } from './filter.js';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FAN_SHARE = 0.05; // the aircon in fan mode draws this share of its rated input
const MIN_DAYS = 30; // the 7 and 30 day totals need that many days whatever `days` is
export const MACHINES = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'ac'];
const RATING = { intake: 'intakeW', exhaust: 'exhaustW', circulation: 'circulationW', humidifier: 'humidifierW', dehumidifier: 'dehumidifierW' };

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

// Estimated kWh of each machine in one day from its run time and the room's ratings; the intake's rating times intakeFactor
// (its filter: spec 2026-10-22-filter-design.md 6).
export function estimateDay(ms, room, intakeFactor = 1) {
  const kWh = (milliseconds, watts) => (milliseconds / HOUR_MS) * (watts / 1000);
  const out = {};
  for (const machine of MACHINES) {
    const m = ms[machine] ?? {};
    out[machine] = machine === 'ac'
      ? kWh(m.full ?? 0, room.acInputW) + kWh(m.fan ?? 0, room.acInputW * FAN_SHARE)
      : kWh(m.on ?? 0, room[RATING[machine]] * (machine === 'intake' ? intakeFactor : 1));
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
// db.usageDays drops an entry when the room changes or a row is written inside its days.
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
  const ms = {};
  for (const machine of MACHINES) {
    ms[machine] = msPerDay(runIntervals(db.machineLogWindow(room.id, machine, day.start, day.end), day.start, day.end, machine), [day])[0];
  }
  const pa = room.dpAddress === null ? null
    : meanCountedPa(db.filterReadingsWindow(room.id, day.start, hi), db.machineLogWindow(room.id, 'intake', day.start - 60_000, day.end));
  if (settled) Object.assign(entry, { ms, pa });
  return { ...entry, ms, pa };
}

// The days of a room: [{ date, kWh, metered, byMachine, waterL }], oldest first, with the unrounded numbers rounded to 3
// places. When a day is metered, the aircon estimate is replaced by `rest` (metered minus the other machines, at least 0);
// estimates of the other machines above the metered kWh are scaled down so that byMachine adds up to kWh.
export function roomDays(db, room, { now, zone, count }) {
  const days = dayWindows(now, count, zone);
  const cache = db.usageDays(room.id);
  if (cache.size > 400) for (const [key, e] of cache) if (e.end < days[0].start) cache.delete(key);
  return days.map((day) => {
    const work = dayWork(db, room, day, { now, zone });
    const est = estimateDay(work.ms, room, work.pa === null ? 1 : fanWattFactor(work.pa, room.filterCleanPa, room.fanMaxPa));
    const isMetered = room.meterAddress !== null && work.meter.readings >= 2;
    const others = est.intake + est.exhaust + est.circulation + est.humidifier + est.dehumidifier;
    let byMachine = { ...est, rest: 0 };
    if (isMetered) {
      const metered = work.meter.kWh;
      const scale = others > metered ? metered / others : 1; // the estimates are above the meter: they cannot be all right
      byMachine = {
        intake: est.intake * scale, exhaust: est.exhaust * scale, circulation: est.circulation * scale,
        humidifier: est.humidifier * scale, dehumidifier: est.dehumidifier * scale, ac: 0, rest: Math.max(0, metered - others),
      };
    }
    const kWh = round(isMetered ? work.meter.kWh : others + est.ac, 3);
    for (const key of Object.keys(byMachine)) byMachine[key] = round(byMachine[key], 3);
    if (isMetered && others > work.meter.kWh) { // the rounding must not move the sum off kWh: the biggest machine takes the rest
      const sum = Object.values(byMachine).reduce((a, b) => a + b, 0);
      const biggest = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier'].reduce((a, b) => (byMachine[b] > byMachine[a] ? b : a));
      byMachine[biggest] = round(byMachine[biggest] + kWh - sum, 3);
    }
    return {
      date: day.date,
      kWh,
      metered: isMetered,
      byMachine,
      waterL: round(((work.ms.humidifier.on ?? 0) / HOUR_MS) * room.humidifierLH, 3),
    };
  });
}

// Works out the last MIN_DAYS days of every room one day at a time, with the event loop free between days (the first
// usage request after a start would otherwise stall the poller for seconds with a month of one-second readings).
export async function warmUsage(db, { now = Date.now(), zone = localZone } = {}) {
  for (const { id } of db.listRooms()) {
    for (const day of dayWindows(now, MIN_DAYS, zone)) {
      const room = db.getRoom(id); // it may have changed or gone meanwhile
      if (!room) break;
      dayWork(db, room, day, { now, zone });
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
}

// { kWh, cost, waterL, waterCost, metered } over a list of days; cost in the price's currency, 2 places.
export function totals(days, prices) {
  const kWh = round(days.reduce((sum, d) => sum + d.kWh, 0), 3);
  const waterL = round(days.reduce((sum, d) => sum + d.waterL, 0), 3);
  return {
    kWh,
    cost: round(kWh * prices.electricity, 2),
    waterL,
    waterCost: prices.water === null ? null : round((waterL / 1000) * prices.water, 2),
    metered: isMetered(days),
  };
}

// A range is metered when it has a metered day and every day that used anything is metered (days before the room's
// first data, at 0, do not make a range "estimated").
function isMetered(days) {
  const used = days.filter((d) => d.metered || d.kWh > 0);
  return used.length > 0 && used.every((d) => d.metered);
}

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
  return { prices, days: all.slice(-days), ...summary(all, prices) };
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
      metered: isMetered(mine), // every room that used anything that day is metered
      byMachine,
      waterL: round(mine.reduce((s, d) => s + d.waterL, 0), 3),
    };
  });
  return {
    prices,
    days: farm.slice(-days),
    ...summary(farm, prices),
    rooms: rooms.map(({ room, days: d }) => ({
      id: room.id, name: room.name, today: totals(d.slice(-1), prices), last30: totals(d.slice(-30), prices),
    })),
  };
}

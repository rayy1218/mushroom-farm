// Energy and water usage (spec 2026-10-20-energy-water-outdoor-design.md section 5). The pure parts (run time, estimated and
// metered energy) take plain rows; roomUsage and farmUsage read them from the database. No HTTP.

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const FAN_SHARE = 0.05; // the aircon in fan mode draws this share of its rated input
const MIN_DAYS = 30; // the 7 and 30 day totals need that many days whatever `days` is
const MACHINES = ['intake', 'exhaust', 'circulation', 'humidifier', 'ac'];
const RATING = { intake: 'intakeW', exhaust: 'exhaustW', circulation: 'circulationW', humidifier: 'humidifierW' };

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

// Estimated kWh of each machine in one day from its run time and the room's ratings.
export function estimateDay(ms, room) {
  const kWh = (milliseconds, watts) => (milliseconds / HOUR_MS) * (watts / 1000);
  const out = {};
  for (const machine of MACHINES) {
    const m = ms[machine] ?? {};
    out[machine] = machine === 'ac'
      ? kWh(m.full ?? 0, room.acInputW) + kWh(m.fan ?? 0, room.acInputW * FAN_SHARE)
      : kWh(m.on ?? 0, room[RATING[machine]]);
  }
  return out;
}

// Metered energy per day from the good readings [{ at, energy }] oldest first (the first may be flagged `before`, the base
// of the first increase): the increases between consecutive readings, each to the day of the later one; a decrease (a
// meter reset or a new meter) is skipped. Returns [{ kWh, readings }] per day, readings = how many were inside the day.
export function meteredDays(readings, days) {
  const out = days.map(() => ({ kWh: 0, readings: 0 }));
  let prev = null;
  for (const r of readings) {
    if (!r.before) {
      const day = out[days.findLastIndex((d) => r.at >= d.start)];
      day.readings++;
      if (prev && r.energy >= prev.energy) day.kWh += r.energy - prev.energy;
    }
    prev = r;
  }
  return out;
}

// The days of a room: [{ date, kWh, metered, byMachine, waterL }], oldest first, with the unrounded numbers rounded to 3
// places. When a day is metered, the aircon estimate is replaced by `rest` (metered minus the other machines, at least 0).
export function roomDays(db, room, { now, zone, count }) {
  const days = dayWindows(now, count, zone);
  const from = days[0].start;
  const ms = days.map(() => ({}));
  for (const machine of MACHINES) {
    const per = msPerDay(runIntervals(db.machineLogWindow(room.id, machine, from, now), from, now, machine), days);
    per.forEach((p, i) => { ms[i][machine] = p; });
  }
  const metered = meteredDays(db.meterEnergy(room.id, from, now), days);
  return days.map((day, i) => {
    const est = estimateDay(ms[i], room);
    const isMetered = room.meterAddress !== null && metered[i].readings >= 2;
    const others = est.intake + est.exhaust + est.circulation + est.humidifier;
    const byMachine = isMetered
      ? { ...est, ac: 0, rest: Math.max(0, metered[i].kWh - others) }
      : { ...est, rest: 0 };
    for (const key of Object.keys(byMachine)) byMachine[key] = round(byMachine[key], 3);
    return {
      date: day.date,
      kWh: round(isMetered ? metered[i].kWh : others + est.ac, 3),
      metered: isMetered,
      byMachine,
      waterL: round(((ms[i].humidifier.on ?? 0) / HOUR_MS) * room.humidifierLH, 3),
    };
  });
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
    metered: days.length > 0 && days.every((d) => d.metered),
  };
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
      metered: mine.length > 0 && mine.every((d) => d.metered),
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

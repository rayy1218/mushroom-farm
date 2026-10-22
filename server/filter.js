// The intake filter (spec 2026-10-22-filter-design.md sections 4 and 5): which pressure readings count, how long the filter
// has been in use, the input of the filter alarms and a filter change. The rules are pure; filterInput and changeFilter
// read and write the database.

const DAY_MS = 86_400_000;
const COUNT_AFTER_MS = 60_000; // a reading counts once the intake has been commanded on this long (the fan is up to speed)
const MAX_AGE_MS = 120_000; // the alarms judge a reading at most this old

export const FILTER_ALARM_DELAY_MS = 10 * 60_000;
export const FILTER_KEYS = ['filterDue', 'filterDirty', 'filterMissing'];

// Whether the intake was commanded on all through [from, to]. log: its machine log rows [{ at, on }], oldest first, the
// first at or before `from` (db.machineLogWindow gives that).
export function intakeOnThrough(log, from, to) {
  const before = log.findLast((r) => r.at <= from);
  if (!before?.on) return false;
  return log.every((r) => r.at <= from || r.at > to || r.on);
}

// The newest good reading [{ at, pa, ok? }] (oldest first) at most maxAgeMs old and taken after the intake had been on
// COUNT_AFTER_MS without a break: { at, pa }, or null. With the fan off the sensor reads about 0 and says nothing.
export function countedPa(readings, intakeLog, now, maxAgeMs = MAX_AGE_MS) {
  for (let i = readings.length - 1; i >= 0; i--) {
    const r = readings[i];
    if (now - r.at > maxAgeMs) break;
    if (r.ok === false || r.pa === null || r.pa === undefined) continue;
    if (intakeOnThrough(intakeLog, r.at - COUNT_AFTER_MS, r.at)) return { at: r.at, pa: r.pa };
  }
  return null;
}

// The mean of the readings [{ at, pa }] that count (see countedPa, without the age limit), or null when none does.
export function meanCountedPa(readings, intakeLog) {
  const counted = readings.filter((r) => intakeOnThrough(intakeLog, r.at - COUNT_AFTER_MS, r.at));
  return counted.length === 0 ? null : counted.reduce((sum, r) => sum + r.pa, 0) / counted.length;
}

// Days since the filter was changed (a fraction), never below 0.
export function daysInUse(room, now) {
  return room.filterChangedAt === null ? 0 : Math.max(0, (now - room.filterChangedAt) / DAY_MS);
}

// The `filter` input of alarms.evaluate: { sensor, pa (the counted pressure or null), cleanPa, finalPa, changeDays, daysInUse }.
export function filterInput(db, room, now) {
  const sensor = room.dpAddress !== null;
  const counted = sensor
    ? countedPa(db.filterReadingsWindow(room.id, now - MAX_AGE_MS, now + 1), db.machineLogWindow(room.id, 'intake', now - MAX_AGE_MS - COUNT_AFTER_MS, now), now)
    : null;
  return {
    sensor, pa: counted?.pa ?? null, cleanPa: room.filterCleanPa, finalPa: room.filterFinalPa,
    changeDays: room.filterChangeDays, daysInUse: daysInUse(room, now),
  };
}

// **Filter changed**: the change time, a change row with the last counted pressure of the past day (null without one), and
// the filter alarms cleared. Returns the room, or null when there is no such room. The caller drops the alarms' delay counts.
export function changeFilter(db, roomId, at) {
  if (!db.getRoom(roomId)) return null;
  const readings = db.filterReadingsWindow(roomId, at - DAY_MS, at + 1);
  const counted = countedPa(readings, db.machineLogWindow(roomId, 'intake', at - DAY_MS - COUNT_AFTER_MS, at), at, Infinity);
  db.markFilterChanged(roomId, at, counted?.pa ?? null);
  for (const key of FILTER_KEYS) db.clearAlarm(roomId, key, at);
  return db.getRoom(roomId);
}

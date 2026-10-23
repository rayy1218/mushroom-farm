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

// When the intake's present run passed its spin-up (COUNT_AFTER_MS after it was switched on), or null while it is off or
// still spinning up. log: as for intakeOnThrough, oldest first.
export function countingFrom(log, now) {
  let since = null;
  for (const r of log) {
    if (r.at > now) break;
    if (!r.on) since = null;
    else if (since === null) since = r.at;
  }
  return since !== null && now - since >= COUNT_AFTER_MS ? since + COUNT_AFTER_MS : null;
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

// The mean of the readings [{ at, pa }] that count (see countedPa, without the age limit), or null when none does. One pass
// over both lists, oldest first: a reading counts when the intake's run it falls in began COUNT_AFTER_MS or more before it
// (intakeOnThrough over the spin-up, without searching the log for every reading of a day).
export function meanCountedPa(readings, intakeLog) {
  let i = 0, since = null, sum = 0, n = 0;
  for (const r of readings) {
    for (; i < intakeLog.length && intakeLog[i].at <= r.at; i++) {
      if (!intakeLog[i].on) since = null;
      else if (since === null) since = intakeLog[i].at;
    }
    if (since !== null && since <= r.at - COUNT_AFTER_MS) {
      sum += r.pa;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

// Days since the filter was changed (a fraction), never below 0.
export function daysInUse(room, now) {
  return room.filterChangedAt === null ? 0 : Math.max(0, (now - room.filterChangedAt) / DAY_MS);
}

// Whether the machines view (machines.js; null: none) says the intake is not running now. Without a relay module in the view
// the commanded rule alone decides.
function intakeStopped(view) {
  const status = view?.relay?.machines?.find((m) => m.key === 'intake')?.status;
  return status !== undefined && status !== 'not-wired' && status !== 'on';
}

// The `filter` input of alarms.evaluate: { sensor, pa, countFrom, cleanPa, finalPa, changeDays, daysInUse }. pa: the counted
// pressure now, null unless the intake is past its spin-up now, really runs (view: the machines view, when there is one) and
// the sensor answered its last poll (the alarms' count pauses); readings from before the last filter change are the old
// filter's and never count. countFrom: when the intake's present run passed its spin-up (at most this far back: the log
// window), or null.
export function filterInput(db, room, now, view = null) {
  const sensor = room.dpAddress !== null;
  let pa = null, countFrom = null;
  if (sensor) {
    const log = db.machineLogWindow(room.id, 'intake', now - MAX_AGE_MS - COUNT_AFTER_MS, now);
    countFrom = countingFrom(log, now);
    if (countFrom !== null && !intakeStopped(view) && db.getFilterSensor(room.id, 1)?.status === 'online') {
      const from = Math.max(now - MAX_AGE_MS, room.filterChangedAt ?? -Infinity);
      pa = countedPa(db.filterReadingsWindow(room.id, from, now + 1), log, now)?.pa ?? null;
    }
  }
  return {
    sensor, pa, countFrom, cleanPa: room.filterCleanPa, finalPa: room.filterFinalPa,
    changeDays: room.filterChangeDays, daysInUse: daysInUse(room, now),
  };
}

// **Filter changed**: the change time, a change row with the last counted pressure of the past day since the last change
// (null without one), and the filter alarms cleared. Returns the room, or null when there is no such room. The caller drops
// the alarms' delay counts.
export function changeFilter(db, roomId, at) {
  const room = db.getRoom(roomId);
  if (!room) return null;
  const readings = db.filterReadingsWindow(roomId, Math.max(at - DAY_MS, room.filterChangedAt ?? -Infinity), at + 1);
  const counted = countedPa(readings, db.machineLogWindow(roomId, 'intake', at - DAY_MS - COUNT_AFTER_MS, at), at, Infinity);
  db.markFilterChanged(roomId, at, counted?.pa ?? null);
  for (const key of FILTER_KEYS) db.clearAlarm(roomId, key, at);
  return db.getRoom(roomId);
}

// Pure helpers for the room dialog's Filter section and the room page's Filter card (no DOM, so they can be tested in Node).
// Spec 2026-10-22-filter-design.md sections 3 and 5.

import { meterAddressOf } from './ratings-math.js';

const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const STATUS_WORDS = { 'not-wired': 'Not wired', 'no-data': 'No data yet', online: 'Online', timeout: 'Timeout', offline: 'Offline' };
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const pad2 = (n) => String(n).padStart(2, '0');
const dayMonth = (ms) => `${new Date(ms).getDate()} ${MONTHS[new Date(ms).getMonth()]}`;
const dateTime = (ms) => `${dayMonth(ms)} ${pad2(new Date(ms).getHours())}:${pad2(new Date(ms).getMinutes())}`;

// The four settings (server/rooms.js FILTER; a test compares them), whole numbers.
export const FILTER_SETTINGS = [
  { name: 'fanMaxPa', label: 'Intake fan maximum pressure', unit: 'Pa', def: 200, min: 20, max: 2000 },
  { name: 'filterCleanPa', label: 'Clean filter pressure drop', unit: 'Pa', def: 40, min: 5, max: 1000 },
  { name: 'filterFinalPa', label: 'Filter change pressure', unit: 'Pa', def: 80, min: 5, max: 2000 },
  { name: 'filterChangeDays', label: 'Change the filter every', unit: 'days', def: 30, min: 0, max: 365 },
];
export const FILTER_NAMES = FILTER_SETTINGS.map((f) => f.name);

// A room (or null, for a new room) → the text of each setting; a missing number falls back to the default.
export function filterTexts(room) {
  return Object.fromEntries(FILTER_SETTINGS.map((f) => [f.name, String(finite(room?.[f.name]) ? room[f.name] : f.def)]));
}

// The inputs' texts → { values } or { errors: { name: message } }, in the server's words. The dialog always sends all four:
// the server keeps a setting that is left out.
export function parseFilter(texts) {
  const values = {};
  const errors = {};
  for (const f of FILTER_SETTINGS) {
    const s = String(texts?.[f.name] ?? '').trim();
    const n = /^[0-9]{1,4}$/.test(s) ? Number(s) : NaN;
    if (n >= f.min && n <= f.max) values[f.name] = n;
    else errors[f.name] = `${f.label} must be a whole number from ${f.min} to ${f.max} ${f.unit}`;
  }
  if (!errors.filterCleanPa) {
    if (!errors.fanMaxPa && values.fanMaxPa <= values.filterCleanPa) errors.fanMaxPa = "Fan maximum pressure must be above the clean filter's pressure drop";
    if (!errors.filterFinalPa && values.filterFinalPa <= values.filterCleanPa) errors.filterFinalPa = "Filter change pressure must be above the clean filter's pressure drop";
  }
  if (!errors.fanMaxPa && !errors.filterFinalPa && values.filterFinalPa >= values.fanMaxPa) errors.filterFinalPa = "Filter change pressure must be below the fan's maximum pressure";
  return Object.keys(errors).length ? { errors } : { values };
}

// The filter pressure sensor address: blank = none, else a whole number 1 to 247; NaN if wrong.
export const dpAddressOf = meterAddressOf;

const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;
// Whole local calendar days from `from` to `to` (0: the same day).
const calendarDays = (from, to) => {
  const a = new Date(from), b = new Date(to);
  return Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / DAY_MS);
};
const clamp01 = (x) => Math.min(1, Math.max(0, x));

// The bar of the Filter card: the reading (null: none yet) over a scale from 0 to the fan's maximum pressure. fill, cleanAt
// and finalAt are shares of the scale; tone: 'warn' below half the clean drop (the missing range), 'ok' up to the change
// pressure, 'bad' at or above it, null without a reading.
export function filterBar(room, value) {
  const max = room.fanMaxPa;
  const at = (pa) => clamp01(pa / max);
  const tone = value === null ? null : value < room.filterCleanPa / 2 ? 'warn' : value >= room.filterFinalPa ? 'bad' : 'ok';
  return { fill: value === null ? 0 : at(value), cleanAt: at(room.filterCleanPa), finalAt: at(room.filterFinalPa), tone };
}

// Whether the card must ask for the changes again: the room's change time is not the one last loaded (a change made on another
// page), or the last load failed. seen: { seenChangedAt (undefined: never loaded), failed }.
export const changesStale = (seen, room) => seen.failed || seen.seenChangedAt !== room.filterChangedAt;

// Whether the intake fan runs, from the machines view (GET /api/rooms/:id/machines): true when its status is on, false for any
// other status, null when it cannot be told (no view, no relay module, the intake not wired).
export function intakeRunning(view) {
  const status = view?.relay?.machines?.find((m) => m.key === 'intake')?.status;
  if (status === undefined || status === 'not-wired') return null;
  return status === 'on';
}

// The last reading taken with the intake on ({ at, pa } or null): a new good reading replaces it unless the intake is off
// (with the fan stopped the sensor reads about 0, which says nothing about the filter). The server's (sensor.lastRunning, the
// last counted reading of the past day) seeds it after a page load; the newest of them wins.
export function lastRunningOf(last, intake, sensor) {
  const newer = (a, b) => (a && (!b || a.at >= b.at) ? a : b ?? null);
  const server = finite(sensor?.lastRunning?.pa) && finite(sensor?.lastRunning?.at) ? sensor.lastRunning : null;
  let best = newer(last ?? null, server);
  const ok = sensor?.lastOk;
  if (intake !== false && finite(ok?.pa) && finite(ok?.at)) best = newer(best, { at: ok.at, pa: ok.pa });
  return best;
}

// The Filter card of the room page. room: GET /api/rooms/:id; sensor: the 'dp' element of the sensors reply (or null);
// changes: GET /api/rooms/:id/filter/changes; changesFailed: that list could not be loaded; intake: intakeRunning(); lastRunning:
// lastRunningOf(), shown while the intake is off (a reading from before the last filter change is the old filter's: not shown). →
// { pressure: { text, status, value, min, clean, final, max, over, bar, idle (text or null) } | null (no sensor), noSensor, age,
//   due, overdue, changes: [text], changesError (text or null) }.
export function filterCard({ room, sensor, changes, now, changesFailed = false, intake = null, lastRunning = null }) {
  const hasSensor = finite(room?.dpAddress) && sensor && sensor.status !== 'not-wired';
  let pressure = null;
  if (hasSensor) {
    const off = intake === false;
    const held = off && lastRunning && !(lastRunning.at < room.filterChangedAt) ? lastRunning : null;
    const pa = off ? held?.pa ?? null : finite(sensor.lastOk?.pa) ? sensor.lastOk.pa : null;
    const hhmm = held ? `${pad2(new Date(held.at).getHours())}:${pad2(new Date(held.at).getMinutes())}` : '';
    pressure = {
      text: pa !== null ? `${pa.toFixed(1)} Pa` : off ? 'Intake off: no reading with the intake on yet' : 'No reading yet',
      status: STATUS_WORDS[sensor.status] ?? String(sensor.status),
      value: pa, min: 0, clean: room.filterCleanPa, final: room.filterFinalPa, max: Math.max(room.fanMaxPa, pa ?? 0),
      over: pa !== null && pa >= room.filterFinalPa,
      bar: filterBar(room, pa),
      idle: held ? `Intake off: reading from ${hhmm}, with the intake on` : null,
    };
  }
  const since = finite(room?.filterChangedAt) ? room.filterChangedAt : now;
  const inUse = Math.max(0, calendarDays(since, now));
  const every = room?.filterChangeDays ?? 0;
  const dueAt = since + every * DAY_MS;
  const overdue = every > 0 && now >= dueAt;
  return {
    pressure,
    noSensor: 'No pressure sensor',
    age: inUse === 0 ? 'Changed today' : `${days(inUse)} in use`,
    due: every > 0 ? `${overdue ? 'Due since' : 'Change by'} ${dayMonth(dueAt)} (every ${days(every)})` : 'No reminder',
    overdue,
    changes: (Array.isArray(changes) ? changes : []).slice(0, 5)
      .map((c) => `Changed ${dateTime(c.at)}${finite(c.paBefore) ? ` at ${Math.round(c.paBefore)} Pa` : ''}`),
    changesError: changesFailed ? "Couldn't load the filter changes" : null,
  };
}

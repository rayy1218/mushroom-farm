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

// The Filter card of the room page. room: GET /api/rooms/:id; sensor: the 'dp' element of the sensors reply (or null);
// changes: GET /api/rooms/:id/filter/changes. →
// { pressure: { text, status, value, min, clean, final, max, over } | null (no sensor), noSensor, age, due, overdue, changes: [text] }.
export function filterCard({ room, sensor, changes, now }) {
  const hasSensor = finite(room?.dpAddress) && sensor && sensor.status !== 'not-wired';
  let pressure = null;
  if (hasSensor) {
    const pa = finite(sensor.lastOk?.pa) ? sensor.lastOk.pa : null;
    pressure = {
      text: pa === null ? 'No reading yet' : `${pa.toFixed(1)} Pa`,
      status: STATUS_WORDS[sensor.status] ?? String(sensor.status),
      value: pa, min: 0, clean: room.filterCleanPa, final: room.filterFinalPa, max: Math.max(room.fanMaxPa, pa ?? 0),
      over: pa !== null && pa >= room.filterFinalPa,
    };
  }
  const since = finite(room?.filterChangedAt) ? room.filterChangedAt : now;
  const days = Math.max(0, Math.floor((now - since) / DAY_MS));
  const every = room?.filterChangeDays ?? 0;
  const dueAt = since + every * DAY_MS;
  const overdue = every > 0 && now >= dueAt;
  return {
    pressure,
    noSensor: 'No pressure sensor',
    age: (now - since) < DAY_MS ? 'Changed today' : `${days} ${days === 1 ? 'day' : 'days'} in use`,
    due: every > 0 ? `${overdue ? 'Due since' : 'Change by'} ${dayMonth(dueAt)} (every ${every} days)` : 'No reminder',
    overdue,
    changes: (Array.isArray(changes) ? changes : []).slice(0, 5)
      .map((c) => `Changed ${dateTime(c.at)}${finite(c.paBefore) ? ` at ${Math.round(c.paBefore)} Pa` : ''}`),
  };
}

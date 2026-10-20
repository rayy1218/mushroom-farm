// Pure helpers for the outdoor sensor on the pages (no DOM, so they can be tested in Node).
// Spec 2026-10-20-energy-water-outdoor-design.md section 2.

import { historyPoints } from './history-math.js';
import { sparkPath, SPARK_W, SPARK_H, SPARK_WINDOW_MS, SPARK_BUCKET_MS } from './overview-math.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);

export const OUTDOOR_COLOR = { t: 'var(--s-t)', rh: 'var(--s-rh)' };
const STATUS_WORDS = { online: 'Online', timeout: 'Timeout', offline: 'Offline', 'no-data': 'No data yet', 'not-wired': 'Not set' };

// Night is 19:00 to 07:00 on the local clock (as on the device's simulated clock).
export function isNightHour(date) {
  const h = date.getHours();
  return h >= 19 || h < 7;
}

// Dew point (deg C) from temperature and relative humidity, Magnus formula; null when either is missing.
export function dewPoint(t, rh) {
  if (!finite(t) || !finite(rh) || rh <= 0 || rh > 100) return null;
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(rh / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

// GET /api/outdoor → the part of the room drawing's state that comes from outside: { out, night }.
// No sensor set (or no answer from the server): out is null and the drawing says "No outdoor sensor".
export function outdoorForDrawing(outdoor, now = Date.now()) {
  if (!outdoor || outdoor.address == null) return { out: null, night: false };
  return {
    out: { T: finite(outdoor.last?.t) ? outdoor.last.t : null, RH: finite(outdoor.last?.rh) ? outdoor.last.rh : null },
    night: isNightHour(new Date(now)),
  };
}

// GET /api/outdoor/history → chart points [{ at, value|null }] for one field ('t' or 'rh').
// Takes a room's history shape (rows of { at, t, rh } under `trh`) or one series per field ([{ at, v }] under `t` and `rh`).
export function outdoorPoints(history, field) {
  if (!history) return [];
  let rows = null;
  if (Array.isArray(history.trh)) rows = history.trh;
  else if (Array.isArray(history.rows)) rows = history.rows;
  else if (Array.isArray(history[field])) rows = history[field].map((r) => ({ at: r.at, [field]: r.v ?? r.value ?? r[field] }));
  if (!rows) return [];
  return historyPoints(rows, field, history.bucketS ?? 0, history.pollSeconds ?? 0);
}

// The second line of a chart for one outdoor field: { label, points }, or null when there is nothing to draw.
export function outdoorLine(history, field) {
  const points = outdoorPoints(history, field);
  return points.some((p) => p.value !== null) ? { label: 'Outdoor', points } : null;
}

// What the Overview's Outdoor card shows, from GET /api/outdoor. null: no answer (an older server): no card.
// { set: false } without a sensor; else { set, address, status, statusText, at, values: [{ label, text, color, spark }], fault }.
export function outdoorCard(data, now = Date.now()) {
  if (!data || typeof data !== 'object') return null;
  if (data.address == null) return { set: false };
  const last = data.last ?? null;
  const dew = finite(last?.dew) ? last.dew : dewPoint(last?.t, last?.rh);
  const win = { from: now - SPARK_WINDOW_MS, to: now, gapMs: 3 * SPARK_BUCKET_MS };
  const spark = (key) => sparkPath(data.spark?.[key], SPARK_W, SPARK_H, null, win);
  const text = (v, digits, unit) => (finite(v) ? `${v.toFixed(digits)} ${unit}` : '—');
  const values = [
    { key: 't', label: 'Temperature', unit: '°C', text: text(last?.t, 1, '°C'), color: OUTDOOR_COLOR.t, spark: spark('t') },
    { key: 'rh', label: 'Humidity', unit: '%RH', text: text(last?.rh, 0, '%RH'), color: OUTDOOR_COLOR.rh, spark: spark('rh') },
    { key: 'dew', label: 'Dew point', unit: '°C', text: text(dew, 1, '°C'), color: null, spark: null },
  ];
  const c = data.check ?? null;
  let fault = null;
  if (c && c.fault) fault = { level: 'serious', text: `Sensor fault: ${c.why ?? 'bad readings'}` };
  else if (c && c.ok === false) fault = { level: 'warning', text: `Check: ${c.why ?? 'a reading looks wrong'}` };
  return {
    set: true,
    address: data.address,
    status: data.status,
    statusText: STATUS_WORDS[data.status] ?? String(data.status ?? '—'),
    at: finite(last?.at) ? last.at : null,
    values,
    fault,
  };
}

// ---- The Live charts: the hour of outdoor history plus the newest readings ----

const TAIL_MAX = 120;

// Adds GET /api/outdoor's `last` reading ({ at, t, rh }) to the tail of recent readings when it is newer than the tail's end.
// Returns the tail itself when nothing was added (a new array otherwise), at most 120 readings.
export function pushOutdoorTail(tail, last) {
  if (!last || !finite(last.at) || !(finite(last.t) || finite(last.rh))) return tail;
  if (tail.length && last.at <= tail[tail.length - 1].at) return tail;
  return [...tail, { at: last.at, t: last.t, rh: last.rh }].slice(-TAIL_MAX);
}

// The 1 h history (rows of { at, t, rh } under `trh`, may be null) with the tail's readings after its last row,
// in the same shape, so the dashed line reaches the right edge between the once-a-minute fetches. null: nothing at all.
export function liveOutdoor(base, tail) {
  const rows = Array.isArray(base?.trh) ? base.trh : [];
  const end = rows.length ? rows[rows.length - 1].at : -Infinity;
  const extra = tail.filter((r) => r.at > end);
  if (!rows.length && !extra.length) return null;
  return { ...(base ?? {}), bucketS: base?.bucketS ?? 0, pollSeconds: base?.pollSeconds || 5, trh: [...rows, ...extra] };
}

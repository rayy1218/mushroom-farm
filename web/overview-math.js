// Pure helpers for the Overview page and the nav badge (no DOM, so they can be tested in Node).
// Spec 2026-10-19-safety-and-history-design.md section 6 (Overview, Nav).

import { formatStamp } from './history-math.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const round1 = (n) => Math.round(n * 10) / 10;

// The three sparklines of a room card: the key in overview.spark, the band keys in overview.bands.
export const SPARKS = [
  { key: 't', label: 'Temperature', unit: '°C', digits: 1, low: 'tLow', high: 'tHigh', color: 'var(--s-t)' },
  { key: 'rh', label: 'Humidity', unit: '%RH', digits: 0, low: 'rhLow', high: 'rhHigh', color: 'var(--s-rh)' },
  { key: 'co2', label: 'CO₂', unit: 'ppm', digits: 0, low: 'co2Low', high: 'co2High', color: 'var(--s-co2)' },
];

// A sparkline: points [{ at, v }] in a w x h box with 3 px padding, band { low, high } or null.
// window { from, to, gapMs } fixes the x scale to [from, to] and starts a new line where the points are more than gapMs apart.
// Returns { d, last: { x, y }, band: { y, h } | null, min, max }, or null with fewer than 2 usable points.
// Like v1's, with the band stretching the scale so it is always inside the box.
export function sparkPath(points, w, h, band, window = null) {
  const pts = (points ?? []).filter((p) => p && finite(p.at) && finite(p.v)).sort((a, b) => a.at - b.at);
  if (pts.length < 2) return null;
  const pad = 3;
  const values = pts.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const hasBand = band && finite(band.low) && finite(band.high) && band.high > band.low;
  let lo = hasBand ? Math.min(min, band.low) : min;
  let hi = hasBand ? Math.max(max, band.high) : max;
  if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
  const t0 = window ? window.from : pts[0].at;
  const t1 = window ? window.to : pts[pts.length - 1].at;
  const x = (t) => pad + (t1 > t0 ? (t - t0) / (t1 - t0) : 0) * (w - 2 * pad);
  const y = (v) => pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad);
  const last = pts[pts.length - 1];
  return {
    d: pts.map((p, i) => `${i && !(window?.gapMs && p.at - pts[i - 1].at > window.gapMs) ? 'L' : 'M'}${round1(x(p.at))} ${round1(y(p.v))}`).join(' '),
    last: { x: round1(x(last.at)), y: round1(y(last.v)) },
    band: hasBand ? { y: round1(y(band.high)), h: round1(y(band.low) - y(band.high)) } : null,
    min,
    max,
  };
}

export const alarmLevelRank = (level) => ({ critical: 3, serious: 2, warning: 1 })[level] ?? 0;

// The tiles over the room cards, from overview.rooms.
export function tiles(rooms) {
  let level = null;
  let alarms = 0;
  for (const r of rooms) {
    alarms += r.alarms.count;
    if (r.alarms.count > 0 && (level === null || alarmLevelRank(r.alarms.level) > alarmLevelRank(level))) level = r.alarms.level;
  }
  return {
    rooms: rooms.length,
    roomsOk: rooms.filter((r) => r.alarms.count === 0).length,
    alarms,
    level,
    exchanges: rooms.filter((r) => r.exchange).length,
  };
}

// Critical first, then newest (the order of GET /api/alarms).
export function sortAlarms(alarms) {
  return [...alarms].sort((a, b) => (b.level === 'critical') - (a.level === 'critical') || b.raisedAt - a.raisedAt || b.id - a.id);
}

// The number on the nav badge: alarms that are active (not cleared) and not acknowledged.
export function badgeCount(alarms) {
  return (alarms ?? []).filter((a) => a.clearedAt === null && a.ackedAt === null).length;
}

// "(2) " in front of a page title when there are unacknowledged alarms; an old prefix is replaced.
export function withTitlePrefix(title, count) {
  const bare = title.replace(/^\(\d+\) /, '');
  return count > 0 ? `(${count}) ${bare}` : bare;
}

const STATUS_WORDS = { timeout: 'Timeout', offline: 'Offline' };

// The value of a sensor on a room card: "23.5 °C", with the status word after it when the sensor is not online.
export function sensorText(sensor, field, digits, unit) {
  if (sensor.status === 'not-wired') return 'Not wired';
  if (sensor.status === 'no-data') return 'No data yet';
  const value = finite(sensor[field]) ? `${sensor[field].toFixed(digits)} ${unit}` : '—';
  return STATUS_WORDS[sensor.status] ? `${value} · ${STATUS_WORDS[sensor.status]}` : value;
}

export function exchangeText(room, now = Date.now()) {
  if (!room.exchange) return 'Air exchange off';
  if (!finite(room.exchangeSince)) return 'Air exchange on';
  return `Air exchange on since ${formatStamp(room.exchangeSince, now)}`;
}

// "10:42" today, "12 Oct 10:42" before.
export const alarmTimeText = (at, now = Date.now()) => formatStamp(at, now);

export const SPARK_WINDOW_MS = 24 * 3_600_000; // the sparklines show the last 24 h in 30 min buckets
export const SPARK_BUCKET_MS = 30 * 60_000;
export const SPARK_W = 140;
export const SPARK_H = 36;

// What one room card shows, from a room of GET /api/overview:
// { href, name, values: [{ label, text, color, spark, ... }], auto, exchange, alarm: { text, level } | null }
export function roomCard(room, now = Date.now()) {
  const values = SPARKS.map((def) => {
    const sensor = def.key === 'co2' ? room.co2 : room.trh;
    return {
      key: def.key,
      label: def.label,
      color: def.color,
      text: sensorText(sensor, def.key, def.digits, def.unit),
      spark: sparkPath(room.spark[def.key], SPARK_W, SPARK_H, { low: room.bands[def.low], high: room.bands[def.high] },
        { from: now - SPARK_WINDOW_MS, to: now, gapMs: 3 * SPARK_BUCKET_MS }),
    };
  });
  const n = room.alarms.count;
  return {
    href: `#/rooms/${room.id}`,
    name: room.name,
    values,
    auto: room.auto ? 'Auto on' : 'Auto off',
    exchange: exchangeText(room, now),
    alarm: n > 0 ? { text: `${n} ${n === 1 ? 'alarm' : 'alarms'}`, level: room.alarms.level } : null,
  };
}

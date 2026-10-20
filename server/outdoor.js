// The outdoor probe's replies (spec 2026-10-20-energy-water-outdoor-design.md section 2): GET /api/outdoor and its history.
// No HTTP. The sensor checks are not kept in memory: they are replayed over the last readings, so the farm app needs
// no extra state and a restart loses nothing.

import { createSensorChecks } from './checks.js';
import { HISTORY_BUCKET_S } from './db.js';

const SPARK_BUCKET_MS = 30 * 60_000;
const DAY_MS = 24 * 3_600_000;
const CHECK_WINDOW_MS = 3 * 3_600_000; // longer than the longest check (frozen after 120 min)
const RANGE_HOURS = { '1h': 1, '6h': 6, '24h': 24, '7d': 168, '30d': 720 };

export const RANGES = Object.keys(RANGE_HOURS);

// Dew point in °C (Magnus formula) of air at t °C and rh %.
export function dewPoint(t, rh) {
  const a = 17.62;
  const b = 243.12;
  const g = Math.log(rh / 100) + (a * t) / (b + t);
  return (b * g) / (a - g);
}

const round1 = (v) => Math.round(v * 10) / 10;

// The latest result of the room T/RH checks over the probe's readings of the last 3 hours (no exchange or humidifier
// context), or null when there are none. Cached per database for the same readings.
const cache = new WeakMap();
function checkOf(db, address, now) {
  const rows = db.outdoorSince(now - CHECK_WINDOW_MS);
  if (rows.length === 0) return null;
  const key = `${address}/${rows.length}/${rows.at(-1).at}/${rows[0].at}`;
  if (cache.get(db)?.key === key) return cache.get(db).result;
  const checks = createSensorChecks({ now: () => now });
  let last = null;
  for (const row of rows) last = checks.check('outdoor', 'trh', row);
  const result = { ok: last.ok, why: last.why, fault: last.fault };
  cache.set(db, { key, result });
  return result;
}

// GET /api/outdoor:
// { address, status, last: { at, t, rh, dew } | null, check: { ok, why, fault } | null, spark: { t: [{ at, v }], rh: [...] } }
export function outdoorView(db, now = Date.now()) {
  const sensor = db.getOutdoor(1);
  const ok = sensor.lastOk;
  const day = db.outdoorBuckets(SPARK_BUCKET_MS, now - DAY_MS, now);
  const line = (field) => day.map((p) => ({ at: p.at, v: p[field] }));
  return {
    address: sensor.address,
    status: sensor.status,
    last: ok ? { at: ok.at, t: ok.t, rh: ok.rh, dew: round1(dewPoint(ok.t, ok.rh)) } : null,
    check: sensor.address === null ? null : checkOf(db, sensor.address, now),
    spark: { t: line('t'), rh: line('rh') },
  };
}

// GET /api/outdoor/history?range=: the shape of a room's history for the T/RH series, { from, to, bucketS, trh: [{ at, t, rh }] }.
// Returns null for a range that is not one of RANGES.
export function outdoorHistory(db, range, now = Date.now()) {
  if (!Object.hasOwn(RANGE_HOURS, range)) return null;
  const hours = RANGE_HOURS[range];
  const bucketS = HISTORY_BUCKET_S[hours];
  const from = now - hours * 3_600_000;
  return { from, to: now, bucketS, trh: db.outdoorBuckets(bucketS * 1000, from, now) };
}

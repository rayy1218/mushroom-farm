// The outdoor probe's replies (spec 2026-10-20-energy-water-outdoor-design.md section 2): GET /api/outdoor and its history.
// No HTTP. The sensor checks are kept in memory and fed the new readings on each call; after a restart they start again
// from the last 3 hours of readings, so nothing is lost.

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

// The latest result of the room T/RH checks over the probe's readings (no exchange or humidifier context), or null when
// it has none in the last 3 hours. The checks are kept per database and fed only the readings newer than the last one
// they saw (a page refresh every second must stay cheap); they start again from the last 3 hours when the address
// changes or on the first call.
const state = new WeakMap(); // db → { address, checks, lastAt, result }
function checkOf(db, address, now) {
  let st = state.get(db);
  if (st?.address !== address) {
    st = { address, now, checks: createSensorChecks({ now: () => st.now }), lastAt: now - CHECK_WINDOW_MS - 1, result: null };
    state.set(db, st);
  }
  st.now = now; // the checks read the clock only for a reading without a time; they must not keep the first call's
  for (const row of db.outdoorSince(st.lastAt + 1)) {
    const r = st.checks.check('outdoor', 'trh', row);
    st.result = { ok: r.ok, why: r.why, fault: r.fault };
    st.lastAt = row.at;
  }
  return st.lastAt >= now - CHECK_WINDOW_MS ? st.result : null;
}

// The outdoor reading the room control may use: the probe's last good reading when it is at most maxAgeMs old and the
// probe's checks give no fault, else null. → { t, rh } | null.
export function outdoorReading(db, now = Date.now(), maxAgeMs = 5 * 60_000) {
  const sensor = db.getOutdoor(1);
  const ok = sensor.lastOk;
  if (!ok || sensor.address === null || now - ok.at > maxAgeMs) return null;
  // A later failed poll leaves the last good reading in use (until it is too old); the check of the reading itself must pass.
  const check = checkOf(db, sensor.address, now);
  const latest = sensor.readings[0];
  if (check && (latest?.at === ok.at ? !check.ok : check.fault)) return null;
  return { t: ok.t, rh: ok.rh };
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

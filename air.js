/*
 * air.js: AIR EXCHANGE ARITHMETIC (contract C9 section 3)
 *
 * Shared by the controller (size message), the capacity check and the equipment check.
 *   purgeTimeS(o)  -> seconds for a purge from the start to the stop level; Infinity when it never gets there
 *   sizeFor(o)     -> { needM3h, size, margin }: the smallest airflow that meets the time cap, and the sizes to buy
 *   riseRate(pts)  -> ppm/s from CO2 readings taken with the fans off; null with too few points
 * Volumes in m³, flows in m³/h, CO2 in ppm, CO2 output in m³/h.
 */
(function (global) {
  'use strict';
  const SIZES = Object.freeze([600, 900, 1200, 1800, 2400, 3600]);
  const MIN_POINTS = 4;
  const MAX_M3H = 1e6;

  function steadyPpm({ co2Out, prodM3h, flowM3h }) {
    return flowM3h > 0 ? co2Out + prodM3h * 1e6 / flowM3h : Infinity;
  }

  function purgeTimeS({ volume, co2Out, leakM3h = 0, prodM3h, m3h, start, stop }) {
    if (start <= stop) return 0;
    const q = m3h + leakM3h;
    if (!(q > 0)) return Infinity;
    const css = steadyPpm({ co2Out, prodM3h, flowM3h: q });
    if (css >= stop) return Infinity;
    return volume / q * Math.log((start - css) / (stop - css)) * 3600;
  }

  function sizeFor({ volume, co2Out, leakM3h = 0, prodM3h, start, stop, capS, sizes = SIZES }) {
    const ok = m3h => purgeTimeS({ volume, co2Out, leakM3h, prodM3h, m3h, start, stop }) <= capS;
    let lo = 0, hi = 50;
    while (!ok(hi)) {
      lo = hi; hi *= 2;
      if (hi > MAX_M3H) return { needM3h: Infinity, size: null, margin: null };
    }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (ok(mid)) hi = mid; else lo = mid; }
    const needM3h = Math.ceil(hi / 50) * 50;
    const i = sizes.findIndex(s => s >= needM3h);
    return { needM3h, size: i < 0 ? null : sizes[i], margin: i < 0 || i + 1 >= sizes.length ? null : sizes[i + 1] };
  }

  function riseRate(points) {
    const p = (points || []).filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.C));
    if (p.length < MIN_POINTS) return null;
    const n = p.length, mt = p.reduce((s, x) => s + x.t, 0) / n, mc = p.reduce((s, x) => s + x.C, 0) / n;
    let sxx = 0, sxy = 0;
    for (const x of p) { sxx += (x.t - mt) ** 2; sxy += (x.t - mt) * (x.C - mc); }
    return sxx > 0 ? sxy / sxx : null;
  }

  function prodFromRise({ ratePpmS, volume, leakM3h = 0, co2, co2Out }) {
    return ratePpmS * 3600 * volume / 1e6 + leakM3h * Math.max(0, co2 - co2Out) / 1e6;
  }

  global.ClimateAir = Object.freeze({ SIZES, MIN_POINTS, steadyPpm, purgeTimeS, sizeFor, riseRate, prodFromRise });
})(typeof window !== 'undefined' ? window : globalThis);

// Pure helpers for the "Electricity and water" section of the Charts tab (no DOM, so they can be tested in Node).
// Spec 2026-10-26-usage-charts-design.md section 1. The usage comes with the history reply: { buckets: [{ at, kWh, waterL }],
// metered, totals: { kWh, waterL } }; a missing or odd one (an older server) gives nothing to draw.

import { formatKWh, formatRM, formatLitres } from './usage-math.js';
import { chartPoints } from './chart-math.js';

export const LIVE_NO_METER = 'Live power needs an energy meter; pick a range for the estimate';
export const LIVE_WATER = 'Pick a range to see water';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const okUsage = (u) => u !== null && typeof u === 'object' && Array.isArray(u.buckets) && u.totals && typeof u.totals === 'object';

// The history bucket in words, for the headings: "kWh per 5 min".
export function bucketWord(bucketS) {
  if (bucketS < 60) return `${bucketS} s`;
  if (bucketS === 60) return 'minute';
  if (bucketS < 3600) return `${bucketS / 60} min`;
  return `${bucketS / 3600} h`;
}

// The range's totals in the Energy card's words: { text: "12.4 kWh · RM 6.82 · 4.6 L water", basis: 'metered' | 'estimated' },
// without the RM when there is no price; null without usage.
export function usageTotalsLine(usage, price) {
  if (!okUsage(usage)) return null;
  const { kWh, waterL } = usage.totals;
  const parts = finite(kWh) ? [formatKWh(kWh), ...(finite(price) ? [formatRM(kWh * price)] : [])] : ['No meter readings in this range'];
  parts.push(`${formatLitres(finite(waterL) ? waterL : 0)} water`);
  return { text: parts.join(' · '), basis: usage.metered === true ? 'metered' : 'estimated' };
}

// The bars of one field ('kWh' or 'waterL'): [{ from, to, v }], each bucket from its start to its end (bucketS wide), cut to
// the range { from, to }. v null: a metered bucket without readings, drawn as a gap.
export function usageBars(usage, key, bucketS, range) {
  if (!okUsage(usage)) return [];
  const b = bucketS * 1000;
  return usage.buckets.map((x) => {
    const start = Math.floor(x.at / b) * b;
    return { from: Math.max(start, range.from), to: Math.min(start + b, range.to), v: finite(x[key]) ? x[key] : null };
  });
}

// An amount with the places a small bucket needs: "0.42 kWh", "0.004 kWh", "12.3 kWh", "< 0.001 L".
export function formatAmount(v, unit) {
  if (!finite(v)) return '—';
  if (v === 0) return `0 ${unit}`;
  if (Math.abs(v) < 0.001) return `< 0.001 ${unit}`;
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : v >= 0.1 ? 2 : 3;
  return `${v.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
}

// The tooltip of a bar: "10:40  0.42 kWh (metered)"; water has no basis. metered is the reply's.
export function usageTip(bar, { unit, metered, formatAt }) {
  if (bar.v === null) return `${formatAt(bar.from)}  no meter readings`;
  const basis = unit === 'kWh' ? (metered ? ' (metered)' : ' (estimated)') : '';
  return `${formatAt(bar.from)}  ${formatAmount(bar.v, unit)}${basis}`;
}

// The chart in words for its aria-label: the total, the highest bucket and (electricity) metered or estimated.
export function usageSummary(bars, { title, unit, metered, formatAt }) {
  const have = bars.filter((x) => finite(x.v));
  if (have.length === 0) return `${title}: no data`;
  const total = have.reduce((s, x) => s + x.v, 0);
  const peak = have.reduce((a, x) => (x.v > a.v ? x : a), have[0]);
  const basis = unit === 'kWh' ? `, ${metered ? 'metered' : 'estimated'}` : '';
  return `${title}: total ${formatAmount(total, unit)}, highest ${formatAmount(peak.v, unit)} at ${formatAt(peak.from)}${basis}`;
}

// Live: the meter's power (W) over its last readings, a failed poll a gap.
export const livePowerPoints = (meter) => chartPoints(meter, 'power');

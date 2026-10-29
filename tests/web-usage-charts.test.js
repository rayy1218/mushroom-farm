// The "Electricity and water" section of the Charts tab (spec 2026-10-26-usage-charts-design.md section 1): the pure parts,
// and source checks of the page like the other page tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  LIVE_NO_METER, LIVE_WATER, bucketWord, usageTotalsLine, usageBars, formatAmount, usageTip, usageSummary, livePowerPoints,
} from '../web/usage-chart-math.js';

const page = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
const section = readFileSync(new URL('../web/usage-section.js', import.meta.url), 'utf8');
const template = page.slice(page.indexOf('const TEMPLATE'), page.indexOf('`;', page.indexOf('const TEMPLATE')));

const usage = (buckets, metered = false, totals = { kWh: 12.4, waterL: 4.6 }) => ({ buckets, metered, totals });

test('the totals line: kWh, the cost at the electricity price, the water, and metered or estimated', () => {
  assert.deepEqual(usageTotalsLine(usage([], false, { kWh: 12.4, waterL: 4.6 }), 0.55), { text: '12.4 kWh · RM 6.82 · 4.6 L water', basis: 'estimated' });
  assert.deepEqual(usageTotalsLine(usage([], true, { kWh: 12.4, waterL: 4.6 }), 0.55), { text: '12.4 kWh · RM 6.82 · 4.6 L water', basis: 'metered' });
  assert.equal(usageTotalsLine(usage([], false, { kWh: 12.4, waterL: 4.6 }), null).text, '12.4 kWh · 4.6 L water'); // no price: no RM
  assert.equal(usageTotalsLine(usage([], false, { kWh: 0, waterL: 0 }), null).text, '0.0 kWh · 0.0 L water');
  assert.equal(usageTotalsLine(usage([], true, { kWh: null, waterL: 1 }), 0.55).text, 'No meter readings in this range · 1.0 L water');
  assert.equal(usageTotalsLine(null, 0.55), null);
  assert.equal(usageTotalsLine({ buckets: 'x' }, 0.55), null); // an older server: no usage
});

test('the bucket in words, for the headings', () => {
  assert.deepEqual([15, 60, 300, 1800, 7200].map(bucketWord), ['15 s', 'minute', '5 min', '30 min', '2 h']);
});

test('bars: one per bucket from its start to its end, cut to the range; a bucket without readings stays null (a gap)', () => {
  const b = 300_000;
  const range = { from: 10 * b + 1000, to: 13 * b + 2000 };
  const u = usage([{ at: 11 * b + b / 2, kWh: 0.4, waterL: 0.1 }, { at: 12 * b + b / 2, kWh: null, waterL: 0 }, { at: range.to, kWh: 0.01, waterL: 0 }]);
  assert.deepEqual(usageBars(u, 'kWh', 300, range), [
    { from: 11 * b, to: 12 * b, v: 0.4 }, { from: 12 * b, to: 13 * b, v: null }, { from: 13 * b, to: range.to, v: 0.01 },
  ]);
  assert.deepEqual(usageBars(u, 'waterL', 300, range).map((x) => x.v), [0.1, 0, 0]);
  assert.deepEqual(usageBars(null, 'kWh', 300, range), []);
});

test('amounts get the places a small bucket needs', () => {
  assert.equal(formatAmount(0.42, 'kWh'), '0.42 kWh');
  assert.equal(formatAmount(0.004, 'kWh'), '0.004 kWh');
  assert.equal(formatAmount(12.345, 'kWh'), '12.3 kWh');
  assert.equal(formatAmount(0, 'L'), '0 L');
  assert.equal(formatAmount(0.0001, 'L'), '< 0.001 L');
  assert.equal(formatAmount(1234.5, 'kWh'), '1,235 kWh');
  assert.equal(formatAmount(null, 'kWh'), '—');
});

test('the tooltip: the time and the amount, electricity with metered or estimated', () => {
  const formatAt = () => '10:40';
  assert.equal(usageTip({ from: 0, to: 1, v: 0.42 }, { unit: 'kWh', metered: true, formatAt }), '10:40  0.42 kWh (metered)');
  assert.equal(usageTip({ from: 0, to: 1, v: 0.42 }, { unit: 'kWh', metered: false, formatAt }), '10:40  0.42 kWh (estimated)');
  assert.equal(usageTip({ from: 0, to: 1, v: 0.5 }, { unit: 'L', formatAt }), '10:40  0.50 L');
  assert.equal(usageTip({ from: 0, to: 1, v: null }, { unit: 'kWh', metered: true, formatAt }), '10:40  no meter readings');
});

test('the chart in words for a screen reader: total, the highest bucket, metered or estimated', () => {
  const formatAt = (ms) => `t${ms}`;
  const bars = [{ from: 1, to: 2, v: 0.2 }, { from: 2, to: 3, v: null }, { from: 3, to: 4, v: 0.5 }];
  assert.equal(usageSummary(bars, { title: 'Electricity per 5 min', unit: 'kWh', metered: true, formatAt }),
    'Electricity per 5 min: total 0.70 kWh, highest 0.50 kWh at t3, metered');
  assert.equal(usageSummary([], { title: 'Water per 5 min', unit: 'L', formatAt }), 'Water per 5 min: no data');
});

test('Live: the meter\'s power over its last readings, a failed poll a gap', () => {
  const meter = { readings: [{ at: 1, ok: true, power: 300 }, { at: 2, ok: false, power: null }, { at: 3, ok: true, power: 320 }] };
  assert.deepEqual(livePowerPoints(meter), [{ at: 1, value: 300 }, { at: 2, value: null }, { at: 3, value: 320 }]);
  assert.deepEqual(livePowerPoints(null), []);
  assert.equal(LIVE_NO_METER, 'Live power needs an energy meter; pick a range for the estimate');
  assert.equal(LIVE_WATER, 'Water is counted per hour: choose 1 h or longer above to see it.');
});

test('the page: the section under the three charts and before the machine timeline, following the range', () => {
  const charts = template.indexOf('data-charts'), usageAt = template.indexOf('data-usage-charts'), timeline = template.indexOf('data-timeline');
  assert.ok(charts > 0 && usageAt > charts && timeline > usageAt, 'charts, then the usage section, then the timeline');
  assert.match(page, /import \{ createUsageSection \} from '\.\/usage-section\.js';/);
  assert.match(page, /usageSection\.update\(\{ hist, sensors, price/);
  assert.match(page, /usageSection\?\.setCursor\(at\)/, 'the shared time line');
  assert.match(page, /usageSection\?\.destroy\(\)/);
});

test('the section: the heading, the totals, Live with and without a meter, metered bars solid and estimated hatched', () => {
  assert.match(section, /'Energy and water in this range'/);
  assert.match(section, /usageTotalsLine\(/);
  assert.match(section, /meterCard\(sensors\.meter\)/, 'Live: a power line only for a room with a meter');
  assert.match(section, /LIVE_NO_METER/);
  assert.match(section, /LIVE_WATER/);
  assert.match(section, /drawLineChart\(/);
  assert.match(section, /drawTimeBars\(/);
  assert.match(section, /hatch: !data\.usage\.metered|hatch: !usage\.metered/);
});

// Critique 2026-10-28: the line said 35 L while the water chart, without the bars inside the gaps, added up to 4.8 L.
test('the totals line adds up the bars the charts show when they are given', () => {
  const bars = { kWh: [{ v: 1.5 }, { v: null }, { v: 2 }], waterL: [{ v: 0.5 }, { v: 0.25 }] };
  assert.equal(usageTotalsLine(usage([], true, { kWh: 12.4, waterL: 35 }), null, bars).text, '3.5 kWh · 0.8 L water');
  assert.equal(usageTotalsLine(usage([], true), null, { kWh: [{ v: null }], waterL: [] }).text, 'No meter readings in this range · 0.0 L water');
  assert.match(section, /usageTotalsLine\(usage, price, data \? \{ kWh: kwhBars, waterL: waterBars \} : null\)/);
});

test('History: the range line says how many hours without readings it leaves out; the by-day card sits right after it', () => {
  assert.match(section, /basis\.textContent = gapH >= 0\.1 \? `\$\{line\.basis\} · \$\{gapH\.toFixed\(1\)\} h without readings not counted` : line\.basis;/);
  assert.match(page, /data-usage-charts><\/section>\n\s*<section data-usage><\/section>/);
});

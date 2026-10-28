// The outdoor line on the temperature and humidity charts (owner, 2026-10-26: "add dotted line for outside value"): dotted in
// the chart's own colour, so it is not taken for the grey dashed band limits, with its latest value in the legend.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chart = readFileSync(new URL('../web/chart.js', import.meta.url), 'utf8');
const part = chart.slice(chart.indexOf('// The second line (outdoor)'), chart.indexOf('// The line, one path per run'));

test('the outdoor line is dotted, round-capped, in the chart\'s colour; the band limits stay grey dashes', () => {
  assert.match(part, /'stroke-dasharray': OUTDOOR_DOTS/);
  assert.match(chart, /const OUTDOOR_DOTS = '0\.1 5';/);
  assert.match(part, /'stroke-linecap': 'round'/);
  assert.match(part, /style: `stroke:\$\{current\.color \?\? 'var\(--ink\)'\};opacity:\.8`/);
  assert.doesNotMatch(part, /'stroke-dasharray': '5 4'/);
  assert.match(chart, /'stroke-dasharray': '4 4'/, 'the band limits keep their dashes');
});

// Critique 2026-10-28: "own scale 25.8–32.6" in the plot was struck through by the band's line and gone on a phone.
test('its legend sits above the plot (Room, then Outdoor and its latest value); its scale is numbered on the right', () => {
  assert.match(part, /'Room'/);
  assert.match(part, /`\$\{current\.second\.label \?\? 'Outdoor'\}\$\{lastSecond \? ` \$\{fmt\(lastSecond\.value\)\}` : ''\}\$\{width < 560 \? ' · right scale' : ' · its scale on the right'\}`/);
  assert.match(part, /for \(const \[v, y\] of \[\[s2\.max, y1\], \[s2\.min, y0\]\]\)/);
  assert.match(chart, /export const M = \{ left: 64, right: 48,/);
});

test('the outdoor line has its own scale (owner, 2026-10-28): the room line keeps the full height', () => {
  const main = chart.slice(chart.indexOf('const { min, max } = niceRange(yRange('), chart.indexOf('// The outdoor line on its own scale'));
  assert.doesNotMatch(main, /secondValues/, 'the room\'s scale leaves the outdoor values out');
  assert.match(chart, /const s2 = secondValues\.length \? niceRange\(yRange\(secondValues, current\.minSpan \?\? 1, current\.bounds\), current\.bounds\) : null;/);
  assert.match(part, /yFor2\(p\.value\)/);
});

test('a long range marks a gap in the readings (the app or the sensor was off) instead of only breaking the line', () => {
  const gap = chart.slice(chart.indexOf('// A gap in the readings'), chart.indexOf('// The second line (outdoor)'));
  assert.ok(gap.length > 0, 'a block for the gaps');
  assert.match(gap, /if \(current\.range\)/, 'long ranges only (Live shows failed polls as red ticks)');
  assert.match(gap, /'No readings'/);
});

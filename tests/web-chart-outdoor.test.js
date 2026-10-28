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

test('its legend says the latest outdoor value and its own scale', () => {
  assert.match(part, /`\$\{current\.second\.label \?\? 'Outdoor'\}\$\{lastSecond \? ` \$\{fmt\(lastSecond\.value\)\}` : ''\} · own scale \$\{s2\.min\.toFixed\(dg\)\}–\$\{s2\.max\.toFixed\(dg\)\}`/);
});

test('the outdoor line has its own scale (owner, 2026-10-28): the room line keeps the full height', () => {
  const main = chart.slice(chart.indexOf('const { min, max } = yRange('), chart.indexOf('// The outdoor line on its own scale'));
  assert.doesNotMatch(main, /secondValues/, 'the room\'s scale leaves the outdoor values out');
  assert.match(chart, /const s2 = secondValues\.length \? yRange\(secondValues, current\.minSpan \?\? 1, current\.bounds\) : null;/);
  assert.match(part, /yFor2\(p\.value\)/);
});

test('a long range marks a gap in the readings (the app or the sensor was off) instead of only breaking the line', () => {
  const gap = chart.slice(chart.indexOf('// A gap in the readings'), chart.indexOf('// The second line (outdoor)'));
  assert.ok(gap.length > 0, 'a block for the gaps');
  assert.match(gap, /if \(current\.range\)/, 'long ranges only (Live shows failed polls as red ticks)');
  assert.match(gap, /'No readings'/);
});

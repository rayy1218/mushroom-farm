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

test('its legend says the latest outdoor value', () => {
  assert.match(part, /`\$\{current\.second\.label \?\? 'Outdoor'\}\$\{lastSecond \? ` \$\{fmt\(lastSecond\.value\)\}` : ''\}`/);
});

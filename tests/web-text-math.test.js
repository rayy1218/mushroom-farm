// A line that wraps well (web/text-math.js; critique 2026-10-29 at 390 px: "…from the bands · / fresh air every 12 min.",
// "metered · / 15.2 h…", "about 420 / ppm").

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keepLines, DOT } from '../web/text-math.js';

test('keepLines: a number keeps its unit and a "·" keeps to the words after it', () => {
  assert.equal(DOT, ' · ');
  assert.equal(keepLines('The farm runs the machines from the bands · fresh air every 12 min.'),
    'The farm runs the machines from the bands · fresh air every 12 min.');
  assert.equal(keepLines('metered · 15.2 h without readings not counted'), 'metered · 15.2 h without readings not counted');
  assert.equal(keepLines('Outdoor air is about 420 ppm'), 'Outdoor air is about 420 ppm');
  assert.equal(keepLines('12.4 kWh · RM 6.82 · 4.6 L water'), '12.4 kWh · RM 6.82 · 4.6 L water');
});

test('the Control card\'s mode line keeps its "·" and its minutes with their words', () => {
  const control = readFileSync(new URL('../web/control.js', import.meta.url), 'utf8');
  assert.match(control, /: on \? keepLines\(`The farm runs the machines from the bands\$\{every\}\.`\)/);
});

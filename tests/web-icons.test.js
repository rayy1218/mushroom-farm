// The readings' line icons (owner 2026-11-03): one per reading the cards show, stroked in currentColor, so the series hue
// set on them in styles.css is their only colour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { READING_ICONS, readingKey } from '../web/icons.js';

test('a line icon for temperature, humidity, CO2 and dew point; the room page keys map to them', () => {
  assert.deepEqual(Object.keys(READING_ICONS), ['t', 'rh', 'co2', 'dew']);
  for (const k of ['T', 'RH', 'CO2']) assert.ok(READING_ICONS[readingKey(k)], k);
  for (const m of Object.values(READING_ICONS)) assert.doesNotMatch(m, /fill=|stroke=|#[0-9a-f]{3}/i, 'the colour comes from the page');
});

test('each icon takes its series hue; dew point, with no chart, ink-2', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  for (const [k, v] of [['t', '--s-t'], ['rh', '--s-rh'], ['co2', '--s-co2'], ['dew', '--ink-2']]) {
    assert.match(css, new RegExp(`\\.r-ico\\[data-reading="${k}"\\] \\{ color: var\\(${v}\\); \\}`), k);
  }
});

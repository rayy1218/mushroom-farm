import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PARAMS } from '../device/sim-store.js';

// The device page is plain browser code: these checks read its source, so a new device setting or kind is not left off it.
const app = readFileSync(new URL('../device/web/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../device/web/index.html', import.meta.url), 'utf8');

test('every simulated room setting has an input on the device page', () => {
  for (const key of Object.keys(PARAMS)) assert.match(app, new RegExp(`\\['${key}', '`), key);
});

test('the device page knows the filter pressure sensor: add form, table, link and its simulated value', () => {
  assert.match(html, /<option value="dp">Filter pressure sensor<\/option>/);
  assert.match(app, /dp: 'Filter pressure sensor'/);
  assert.match(app, /\['filterProbe', 'Filter pressure sensor'\]/);
  assert.match(app, /filterProbe: 'dp'/);
  assert.match(app, /dp: \['pa'\]/);
});

test('the sim card has a Change filter button that posts to the room', () => {
  assert.match(app, /textContent: 'Change filter'/);
  assert.match(app, /\/api\/sims\/\$\{id\}\/change-filter/);
});

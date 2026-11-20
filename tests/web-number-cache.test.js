// The shared number formatters keep one Intl.NumberFormat a shape (the Economics review: the map's 49 labels a keystroke made
// a formatter a number): the words unchanged, the formatters made once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grouped } from '../web/overview-math.js';
import { kgText, rmText } from '../web/harvest-math.js';
import { figureText } from '../web/economics-math.js';
import { cellLabel, mapOf } from '../web/economics-map.js';

const VALUES = [0, -0, 1, -1, 0.005, 0.015, 1.005, 2.675, 1234.5, -1234.5678, 1e7 + 0.125, 99999.995, Number.MAX_SAFE_INTEGER, 1e21, NaN, Infinity];

test('grouped, kgText and rmText say every number as toLocaleString did', () => {
  for (const v of VALUES) {
    for (const d of [0, 1, 2, 3]) assert.equal(grouped(v, d), v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }), `${v} to ${d}`);
    if (Number.isFinite(v)) assert.equal(kgText(v), `${v.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`);
  }
  assert.equal(rmText(1234.5), 'RM 1,234.50');
});

test('a formatter a shape, kept: no number said through toLocaleString (a new formatter each call)', () => {
  const real = Number.prototype.toLocaleString;
  let calls = 0;
  Number.prototype.toLocaleString = function counted(...args) { calls += 1; return real.apply(this, args); }; // eslint-disable-line no-extend-native
  try {
    for (let i = 0; i < 500; i++) { grouped(i * 1.5, 2); kgText(i); rmText(i); figureText('yours.loss', i / 7); figureText('tariff', i / 9); }
  } finally {
    Number.prototype.toLocaleString = real; // eslint-disable-line no-extend-native
  }
  assert.equal(calls, 0);
});

test('the map\'s 49 cell labels say no number through toLocaleString', () => {
  const V = { price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60, 'yours.blocks': 1740, 'yours.yieldG': 250,
    'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14, 'yours.turn': 16, 'yours.kwhBlock': 0.4, 'yours.labourMin': 2.52,
    'yours.transport': 0, 'yours.rent': 0, 'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610 };
  const m = mapOf(V, {}, { kgWeek: 50 });
  const real = Number.prototype.toLocaleString;
  let calls = 0;
  Number.prototype.toLocaleString = function counted(...args) { calls += 1; return real.apply(this, args); }; // eslint-disable-line no-extend-native
  try {
    m.rows.forEach((row, r) => row.forEach((cell, c) => cellLabel(cell, m.prices[c], m.yields[r])));
  } finally {
    Number.prototype.toLocaleString = real; // eslint-disable-line no-extend-native
  }
  assert.equal(calls, 0);
});

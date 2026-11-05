// Inventory's one formatter (spec 2026-11-05-inventory-design.md 5 Numbers): a qty with its unit, RM, the price per unit,
// a farm day.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qtyText, rmText, perUnitText, dayText, longDayText } from '../web/inventory-math.js';

const plain = (s) => s.replace(/ /g, ' ');

test('a qty: whole units whole, kg and L to 2 decimals, grouped, a true minus, + only when asked', () => {
  assert.equal(plain(qtyText(120, 'pcs')), '120 pcs');
  assert.equal(plain(qtyText(1234, 'blocks')), '1,234 blocks');
  assert.equal(plain(qtyText(250, 'g')), '250 g');
  assert.equal(plain(qtyText(3.5, 'L')), '3.50 L');
  assert.equal(plain(qtyText(0.25, 'kg')), '0.25 kg');
  assert.equal(plain(qtyText(-2, 'L')), '−2.00 L');
  assert.equal(plain(qtyText(5, 'L', { signed: true })), '+5.00 L');
  assert.equal(plain(qtyText(0, 'L', { signed: true })), '0.00 L');
  assert.equal(plain(qtyText(-0.001, 'L')), '0.00 L', 'no minus on a figure that shows as 0');
  assert.equal(qtyText(null, 'L'), '—');
  assert.ok(qtyText(3.5, 'L').includes(' '), 'the unit keeps to its number');
});

test('RM to 2 places with grouping', () => {
  assert.equal(plain(rmText(1240.5)), 'RM 1,240.50');
  assert.equal(plain(rmText(0)), 'RM 0.00');
  assert.equal(rmText(null), '—');
});

test('the price per unit: 2 places from RM 0.10, two significant digits below, never a false 0', () => {
  assert.equal(plain(perUnitText(25, 3, 'L')), 'RM 8.33 per L');
  assert.equal(plain(perUnitText(4, 100, 'pcs')), 'RM 0.04 per piece');
  assert.equal(perUnitText(-1, 3, 'L'), '');
  assert.equal(plain(perUnitText(3.5, 1000, 'mL')), 'RM 0.0035 per mL');
  assert.equal(plain(perUnitText(0.01, 1000, 'g')), 'under RM 0.0001 per g');
  assert.equal(plain(perUnitText(0, 5, 'kg')), 'RM 0.00 per kg');
  assert.equal(perUnitText(25, 0, 'L'), '');
  assert.equal(perUnitText(NaN, 3, 'L'), '');
});

test('a farm day in words', () => {
  assert.equal(dayText('2026-11-12'), '12 Nov');
  assert.equal(longDayText('2026-11-12'), '12 Nov 2026');
  assert.equal(dayText('nonsense'), '—');
});

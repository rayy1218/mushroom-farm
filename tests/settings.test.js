// Farm settings: validation in server/settings.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, writeSettings, readCropYield, DEFAULT_SETTINGS } from '../server/settings.js';

const BAD = { error: 'Reading interval must be a whole number from 1 to 300 seconds', field: 'pollSeconds' };

test('the default reading interval is 5 seconds', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { pollSeconds: 5, outdoorAddress: null, electricityPrice: 0.55, waterPrice: null });
});

test('whole numbers from 1 to 300 are valid', () => {
  for (const n of [1, 5, 60, 300]) assert.deepEqual(validateSettings({ pollSeconds: n }), { settings: { pollSeconds: n } });
});

test('anything else is rejected with the field', () => {
  for (const v of [0, 301, -1, 2.5, NaN, Infinity, '5', null, undefined, true, [5], {}]) {
    assert.deepEqual(validateSettings({ pollSeconds: v }), BAD, String(v));
  }
  assert.deepEqual(validateSettings({}), { error: 'Body has no settings' });
});

test('a body that is not an object is rejected without a field', () => {
  for (const body of [null, [], 'x', 5]) assert.deepEqual(validateSettings(body), { error: 'Body must be a JSON object' });
});

test('unknown fields are ignored', () => {
  assert.deepEqual(validateSettings({ pollSeconds: 7, other: 1 }), { settings: { pollSeconds: 7 } });
});

test('cropYield: per crop dry substrate 0.05–20 kg and price 0–1,000 RM, null for not set; read back as stored', () => {
  assert.deepEqual(validateSettings({ cropYield: { oyster: { dryKg: 0.9, priceKg: 12 }, lionsmane: { dryKg: null, priceKg: 40 } } }).settings,
    { cropYield: { oyster: { dryKg: 0.9, priceKg: 12 }, lionsmane: { dryKg: null, priceKg: 40 } } });
  assert.equal(validateSettings({ cropYield: { oyster: { dryKg: 0, priceKg: 1 } } }).field, 'cropYield');
  assert.equal(validateSettings({ cropYield: { tomato: { dryKg: 1, priceKg: 1 } } }).field, 'cropYield');
  assert.equal(validateSettings({ cropYield: { oyster: { dryKg: 1, priceKg: 1001 } } }).field, 'cropYield');
  const store = new Map();
  const db = { getSetting: (k) => store.get(k) ?? null, setSetting: (k, v) => store.set(k, v) };
  writeSettings(db, { cropYield: { oyster: { dryKg: 0.9, priceKg: 12 } } });
  assert.deepEqual(readCropYield(db), { oyster: { dryKg: 0.9, priceKg: 12 } });
  store.set('cropYield', 'not json');
  assert.deepEqual(readCropYield(db), {});
});

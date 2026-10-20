// Settings of iteration 7: outdoorAddress, electricityPrice, waterPrice (validation and storage).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, readSettings, writeSettings, DEFAULT_SETTINGS } from '../server/settings.js';
import { openDb } from '../server/db.js';

test('any subset is valid and only the given fields come back', () => {
  assert.deepEqual(validateSettings({ outdoorAddress: 9 }), { settings: { outdoorAddress: 9 } });
  assert.deepEqual(validateSettings({ electricityPrice: 0.6, waterPrice: 2.5 }), { settings: { electricityPrice: 0.6, waterPrice: 2.5 } });
  assert.deepEqual(validateSettings({ pollSeconds: 3, waterPrice: null, outdoorAddress: null }),
    { settings: { pollSeconds: 3, outdoorAddress: null, waterPrice: null } });
});

test('outdoorAddress is null or 1 to 247', () => {
  for (const v of [1, 247, null]) assert.ok(validateSettings({ outdoorAddress: v }).settings, String(v));
  for (const v of [0, 248, 1.5, '9', true, NaN, undefined]) {
    assert.deepEqual(validateSettings({ outdoorAddress: v }), {
      error: 'Outdoor sensor address must be a whole number from 1 to 247, or empty', field: 'outdoorAddress',
    }, String(v));
  }
});

test('electricityPrice is 0 to 10', () => {
  for (const v of [0, 0.55, 10]) assert.ok(validateSettings({ electricityPrice: v }).settings, String(v));
  for (const v of [-0.01, 10.01, null, '0.5', NaN, Infinity]) {
    assert.deepEqual(validateSettings({ electricityPrice: v }), {
      error: 'Electricity price must be a number from 0 to 10 per kWh', field: 'electricityPrice',
    }, String(v));
  }
});

test('waterPrice is null or 0 to 100', () => {
  for (const v of [0, 3.2, 100, null]) assert.ok(validateSettings({ waterPrice: v }).settings, String(v));
  for (const v of [-1, 100.5, '3', NaN]) {
    assert.deepEqual(validateSettings({ waterPrice: v }), {
      error: 'Water price must be a number from 0 to 100 per m³, or empty', field: 'waterPrice',
    }, String(v));
  }
});

test('a body without any setting is rejected', () => {
  assert.deepEqual(validateSettings({ colour: 'red' }), { error: 'Body has no settings' });
});

test('a bad field is reported even when the others are good', () => {
  assert.equal(validateSettings({ pollSeconds: 5, electricityPrice: 11 }).field, 'electricityPrice');
});

test('defaults, storing a subset, and clearing with null', () => {
  const db = openDb(':memory:');
  assert.deepEqual(readSettings(db), DEFAULT_SETTINGS);
  assert.equal(DEFAULT_SETTINGS.electricityPrice, 0.55);
  writeSettings(db, { outdoorAddress: 9, waterPrice: 2.4 });
  assert.deepEqual(readSettings(db), { pollSeconds: 5, outdoorAddress: 9, electricityPrice: 0.55, waterPrice: 2.4 });
  writeSettings(db, { electricityPrice: 0.4 }); // the others are kept
  assert.deepEqual(readSettings(db), { pollSeconds: 5, outdoorAddress: 9, electricityPrice: 0.4, waterPrice: 2.4 });
  writeSettings(db, { outdoorAddress: null, waterPrice: null });
  assert.deepEqual(readSettings(db), { pollSeconds: 5, outdoorAddress: null, electricityPrice: 0.4, waterPrice: null });
  assert.equal(db.outdoorAddress(), null);
  writeSettings(db, { waterPrice: 0 });
  assert.equal(readSettings(db).waterPrice, 0); // zero is a price, not none
  db.setSetting('electricityPrice', 'junk');
  assert.equal(readSettings(db).electricityPrice, 0.55); // unusable text is the default
  db.close();
});

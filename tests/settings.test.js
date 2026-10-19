// Farm settings: validation in server/settings.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSettings, DEFAULT_SETTINGS } from '../server/settings.js';

const BAD = { error: 'Reading interval must be a whole number from 1 to 300 seconds', field: 'pollSeconds' };

test('the default reading interval is 5 seconds', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { pollSeconds: 5 });
});

test('whole numbers from 1 to 300 are valid', () => {
  for (const n of [1, 5, 60, 300]) assert.deepEqual(validateSettings({ pollSeconds: n }), { settings: { pollSeconds: n } });
});

test('anything else is rejected with the field', () => {
  for (const v of [0, 301, -1, 2.5, NaN, Infinity, '5', null, undefined, true, [5], {}]) {
    assert.deepEqual(validateSettings({ pollSeconds: v }), BAD, String(v));
  }
  assert.deepEqual(validateSettings({}), BAD);
});

test('a body that is not an object is rejected without a field', () => {
  for (const body of [null, [], 'x', 5]) assert.deepEqual(validateSettings(body), { error: 'Body must be a JSON object' });
});

test('unknown fields are ignored', () => {
  assert.deepEqual(validateSettings({ pollSeconds: 7, other: 1 }), { settings: { pollSeconds: 7 } });
});

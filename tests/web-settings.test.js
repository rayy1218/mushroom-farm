import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoll, refreshMs } from '../web/settings-math.js';
import { parseRoute, isCanonical } from '../web/route.js';

test('the reading interval is a whole number from 1 to 300', () => {
  for (const [text, n] of [['1', 1], ['5', 5], [' 60 ', 60], ['300', 300]]) assert.equal(parsePoll(text), n, text);
  for (const text of ['', '0', '301', '2.5', '-1', '1e2', 'abc', '0005', null, undefined]) assert.equal(parsePoll(text), null, String(text));
});

test('the room page refreshes every reading interval, clamped to 2 to 30 s', () => {
  assert.equal(refreshMs({ pollSeconds: 1 }), 2000);
  assert.equal(refreshMs({ pollSeconds: 2 }), 2000);
  assert.equal(refreshMs({ pollSeconds: 10 }), 10000);
  assert.equal(refreshMs({ pollSeconds: 30 }), 30000);
  assert.equal(refreshMs({ pollSeconds: 300 }), 30000);
});

test('unreadable settings keep the 5 s refresh', () => {
  for (const s of [null, undefined, {}, { pollSeconds: 'x' }, { pollSeconds: NaN }]) assert.equal(refreshMs(s), 5000, String(s));
});

test('#/settings is the settings page', () => {
  assert.deepEqual(parseRoute('#/settings'), { name: 'settings' });
  assert.deepEqual(parseRoute('#/settings/'), { name: 'settings' });
  assert.equal(isCanonical('#/settings'), true);
  assert.equal(isCanonical('#/settings/'), false);
  assert.deepEqual(parseRoute('#/settingsx'), { name: 'overview' });
});

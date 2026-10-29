import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoll, refreshMs, LIVE_READINGS, liveHint } from '../web/settings-math.js';
import { readFileSync } from 'node:fs';
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

// Critique 2026-10-29: water is priced per m³ while the app shows it in L; the hint beside the field says how they relate.
test('the water price says 1 m³ = 1,000 L beside its field', async () => {
  const { readFileSync } = await import('node:fs');
  const page = readFileSync(new URL('../web/settings-page.js', import.meta.url), 'utf8');
  assert.match(page, /<p class="muted s-hint" id="s-water">[^<]*1&nbsp;m³&nbsp;=&nbsp;1,000&nbsp;L[^<]*<\/p>/);
});

// Critique 2026-10-29c: "Live charts show the last 50 readings" said nothing of how long that is.
test('the interval hint says how long the Live charts\' 50 readings span at the interval', () => {
  assert.equal(LIVE_READINGS, 50);
  assert.equal(liveHint(1), 'Live charts show the last 50 readings, about 50\u00a0s at 1\u00a0s. A sensor or machine shows as offline after 3 failed readings in a row.');
  assert.match(liveHint(5), /about 4\u00a0min at 5\u00a0s\./);
  assert.match(liveHint(60), /about 50\u00a0min at 60\u00a0s\./);
  assert.match(liveHint(300), /about 4\u00a0h at 300\u00a0s\./);
  assert.match(liveHint(null), /^Live charts show the last 50 readings\. A sensor/, 'no interval yet: no span');
  const page = readFileSync(new URL('../web/settings-page.js', import.meta.url), 'utf8');
  assert.match(page, /hint\.textContent = liveHint\(parsePoll\(input\.value\) \?\? last\?\.pollSeconds \?\? null\);/, 'it follows the input as typed');
});

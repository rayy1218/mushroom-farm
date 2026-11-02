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

import { parseWorkerName, workersAfter, parseEveryDays, parseCustomRule, rulesBody, customAfter, ruleForm, idAfter, WORKER_MAX } from '../web/settings-math.js';

// Most texts are the server's (PUT /api/workers, PUT /api/task-rules), so a refusal reads the same from either; 'That name
// is taken', 'Pick at least one room' and 'Pick a time of day' are the form's own (the server's refusals differ).
test('Workers: a name is 1 to 40 characters and not taken; the whole list the PUT sends', () => {
  const list = [{ id: 1, name: 'Siti', active: true }, { id: 2, name: 'Ali', active: false }];
  assert.deepEqual(parseWorkerName('  Ah Kow ', list), { value: 'Ah Kow' });
  assert.deepEqual(parseWorkerName('', list), { error: 'Type a name' });
  assert.deepEqual(parseWorkerName('x'.repeat(WORKER_MAX + 1), list), { error: 'The name must be at most 40 characters' });
  assert.deepEqual(parseWorkerName('Ah\tKow', list), { error: 'A name cannot hold control characters' });
  assert.deepEqual(parseWorkerName('siti', list), { error: 'That name is taken' });
  assert.deepEqual(parseWorkerName('Siti ', list, 1), { value: 'Siti' }, 'its own name');
  assert.deepEqual(parseWorkerName('ali', list), { value: 'ali' }, 'a removed name may come back');
  assert.deepEqual(parseWorkerName('ALI', list, 1), { value: 'ALI' }, "a rename may take a removed worker's name");
  assert.deepEqual(workersAfter(list, { add: 'Ah Kow' }), [...list, { name: 'Ah Kow', active: true }]);
  assert.deepEqual(workersAfter(list, { add: 'ali' }), [list[0], { id: 2, name: 'ali', active: true }]);
  assert.deepEqual(workersAfter(list, { rename: { id: 1, name: 'Siti Aminah' } }), [{ id: 1, name: 'Siti Aminah', active: true }, list[1]]);
  assert.deepEqual(workersAfter(list, { rename: { id: 1, name: 'ALI' } }), [{ id: 1, name: 'ALI', active: true }],
    'the removed namesake is left out (the server would refuse two of a name; the log keeps names as text)');
  assert.deepEqual(workersAfter(list, { remove: 1 }), [{ id: 1, name: 'Siti', active: false }, list[1]], 'kept, inactive: old records keep the name');
});

test("Task rules: an upkeep interval of 1 to 365 days; the owner's own rule", () => {
  assert.deepEqual(parseEveryDays(' 7 '), { value: 7 });
  for (const t of ['', '0', '366', '2.5', 'x']) assert.deepEqual(parseEveryDays(t), { error: 'Interval must be a whole number from 1 to 365 days' }, t);
  assert.deepEqual(parseCustomRule({ text: ' Check the drain ', allRooms: true, rooms: [], often: 'daily', everyDays: '', slot: 'morning' }),
    { value: { text: 'Check the drain', rooms: null, everyDays: null, slot: 'morning', enabled: true } });
  assert.deepEqual(parseCustomRule({ text: 'Check the drain', allRooms: false, rooms: [2, 3], often: 'every', everyDays: '14', slot: 'any' }),
    { value: { text: 'Check the drain', rooms: [2, 3], everyDays: 14, slot: 'any', enabled: true } });
  assert.deepEqual(parseCustomRule({ text: 'Check the drain', allRooms: false, rooms: [2, 2, 3], often: 'daily', everyDays: '', slot: 'any' }).value.rooms,
    [2, 3], 'a room once (the server refuses a list with a room twice)');
  assert.deepEqual(parseCustomRule({ text: '', allRooms: false, rooms: [], often: 'every', everyDays: '0', slot: 'any' }),
    { errors: { text: 'Say what to do (1 to 120 characters)', rooms: 'Pick at least one room', everyDays: 'Interval must be a whole number from 1 to 365 days' } });
  assert.deepEqual(parseCustomRule({ text: 'x'.repeat(121), allRooms: true, rooms: [], often: 'daily', everyDays: '', slot: 'night' }).errors,
    { text: 'Say what to do (1 to 120 characters)', slot: 'Pick a time of day' });
  assert.deepEqual(parseCustomRule({ text: 'Check the drain', allRooms: false, rooms: null, often: 'daily', everyDays: '', slot: 'any' }).errors,
    { rooms: 'Pick at least one room' }, 'rooms is null only for every room');
});

// B6 review: an upkeep interval sent on every save would be stored, and the rule would no longer follow its default.
test("Task rules: the PUT body has every built-in rule's on/off, an interval only where it changed, the whole own list", () => {
  const shown = {
    builtin: [
      { key: 'footbath', kind: 'daily', everyDays: null, enabled: true },
      { key: 'acFilter', kind: 'upkeep', everyDays: 7, enabled: true },
      { key: 'flyTraps', kind: 'upkeep', everyDays: 7, enabled: true },
    ],
    custom: [{ id: 3, text: 'Check the drain', rooms: null, everyDays: null, slot: 'any', enabled: true }],
  };
  const off = { ...shown, builtin: shown.builtin.map((b) => (b.key === 'flyTraps' ? { ...b, enabled: false } : b)) };
  assert.deepEqual(rulesBody(off, shown), {
    builtin: [{ key: 'footbath', enabled: true }, { key: 'acFilter', enabled: true }, { key: 'flyTraps', enabled: false }],
    custom: shown.custom,
  }, 'a switch: no interval goes');
  const every = { ...shown, builtin: shown.builtin.map((b) => (b.key === 'acFilter' ? { ...b, everyDays: 14 } : b)) };
  assert.deepEqual(rulesBody(every, shown).builtin, [{ key: 'footbath', enabled: true }, { key: 'acFilter', enabled: true, everyDays: 14 }, { key: 'flyTraps', enabled: true }]);
  const added = { ...shown, custom: [...shown.custom, { text: 'Sweep', rooms: [2], everyDays: 7, slot: 'morning', enabled: true }] };
  assert.deepEqual(rulesBody(added, shown).custom, added.custom, 'a new own rule without an id; none left out');
});

// C9 review (lead): an own rule can be edited (the Add your own form, filled in) and removed.
test('Task rules: your own rules after an add, an edit (same id, its On/Off kept) or a removal; the form filled in for an edit', () => {
  const list = [
    { id: 3, text: 'Check the drain', rooms: null, everyDays: null, slot: 'morning', enabled: false },
    { id: 5, text: 'Sweep', rooms: [2, 4], everyDays: 14, slot: 'any', enabled: true },
  ];
  const typed = { text: 'Check the drains', rooms: [2], everyDays: 7, slot: 'afternoon', enabled: true };
  assert.deepEqual(customAfter(list, { add: typed }), [...list, typed]);
  assert.deepEqual(customAfter(list, { edit: { id: 3, rule: typed } }), [{ ...typed, id: 3, enabled: false }, list[1]]);
  assert.deepEqual(customAfter(list, { remove: 3 }), [list[1]]);
  assert.deepEqual(ruleForm(list[0]), { text: 'Check the drain', allRooms: true, rooms: [], often: 'daily', everyDays: '', slot: 'morning' });
  assert.deepEqual(ruleForm(list[1]), { text: 'Sweep', allRooms: false, rooms: [2, 4], often: 'every', everyDays: '14', slot: 'any' });
  assert.deepEqual(ruleForm(null), { text: '', allRooms: true, rooms: [], often: 'daily', everyDays: '', slot: 'morning' }, 'a new one');
  const back = ruleForm(list[1]);
  assert.deepEqual(parseCustomRule(back).value, { text: 'Sweep', rooms: [2, 4], everyDays: 14, slot: 'any', enabled: true }, 'reads back the same');
});

test('after a row goes, the cursor goes to the next one (null: none after it)', () => {
  assert.equal(idAfter([1, 2, 3], 2), 3);
  assert.equal(idAfter([1, 2, 3], 3), null);
  assert.equal(idAfter([1], 9), null);
});

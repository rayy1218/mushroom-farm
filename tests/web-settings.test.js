import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePoll, refreshMs, LIVE_READINGS, liveHint, yieldBody, accountLine, secretAction, accountActions, otherOwnerCanSignIn, roleConfirm, signOutConfirm, removeConfirm, accountDone, isNameField } from '../web/settings-math.js';
import { LOCKED_UNTIL_UNLOCKED } from '../server/auth.js';
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

test('yieldBody: empty text is not set, a crop with both empty is left out', () => {
  assert.deepEqual(yieldBody([{ crop: 'oyster', dryKg: '', priceKg: '' }, { crop: 'pink', dryKg: ' 0.9 ', priceKg: '' }, { crop: 'black', dryKg: '', priceKg: '12.50' }]),
    { cropYield: { pink: { dryKg: 0.9, priceKg: null }, black: { dryKg: null, priceKg: 12.5 } } });
  assert.deepEqual(yieldBody([{ crop: 'oyster', dryKg: '', priceKg: '' }]), { cropYield: {} });
  assert.deepEqual(yieldBody([{ crop: 'oyster', dryKg: '0.05', priceKg: '0' }, { crop: 'pink', dryKg: '20', priceKg: '1000' }]),
    { cropYield: { oyster: { dryKg: 0.05, priceKg: 0 }, pink: { dryKg: 20, priceKg: 1000 } } });
});

test('yieldBody: a bad input is named by field and crop, with the range', () => {
  for (const [dryKg, priceKg, field] of [['0.04', '', 'dryKg:oyster'], ['20.5', '', 'dryKg:oyster'], ['abc', '', 'dryKg:oyster'], ['-1', '', 'dryKg:oyster'],
    ['1,5', '', 'dryKg:oyster'], ['', '1,5', 'priceKg:oyster'], ['', '1000.5', 'priceKg:oyster'], ['', '-2', 'priceKg:oyster'], ['', '1e2', 'priceKg:oyster']]) {
    const r = yieldBody([{ crop: 'oyster', dryKg, priceKg }]);
    assert.equal(r.field, field, `${dryKg}/${priceKg}`);
    assert.match(r.error, /Grey oyster/);
    assert.match(r.error, field.startsWith('dry') ? /0\.05.*20 kg/ : /0.*1,000 RM/);
  }
  assert.equal(yieldBody([{ crop: 'oyster', dryKg: '1', priceKg: '' }, { crop: 'pink', dryKg: '99', priceKg: 'x' }]).field, 'dryKg:pink');
});

test('the Settings price is the expected price (Sales, spec 2026-11-05 6)', async () => {
  const { YIELD_NOTE } = await import('../web/settings-math.js');
  assert.ok(YIELD_NOTE.endsWith('The prices you get are recorded in Sales.'));
});

test("a worker's sign-in line on Settings → Workers", () => {
  const at = Date.UTC(2026, 10, 6, 2);
  assert.equal(accountLine({ role: 'worker', hasSecret: false, lockedUntil: null, sessions: 0 }, at), 'Worker · no PIN yet: cannot sign in');
  assert.equal(accountLine({ role: 'worker', hasSecret: true, lockedUntil: null, sessions: 2 }, at), 'Worker · signed in on 2 devices');
  assert.equal(accountLine({ role: 'owner', hasSecret: true, lockedUntil: null, sessions: 1 }, at), 'Owner · signed in on 1 device');
  assert.equal(accountLine({ role: 'worker', hasSecret: true, lockedUntil: at + 600_000, sessions: 0 }, at), 'Worker · locked until 10:10');
  // the daily cap's lock (server/auth.js LOCKED_UNTIL_UNLOCKED): it lasts until the owner's Unlock
  assert.equal(accountLine({ role: 'worker', hasSecret: true, lockedUntil: LOCKED_UNTIL_UNLOCKED, sessions: 1 }, at), 'Worker · locked: unlock to let them sign in');
  assert.equal(accountLine({ role: 'worker', hasSecret: true, lockedUntil: at + 400 * 86_400_000, sessions: 0 }, at), 'Worker · locked: unlock to let them sign in');
  assert.equal(accountActions({ role: 'worker', hasSecret: true, lockedUntil: LOCKED_UNTIL_UNLOCKED, sessions: 0 }, { self: false, otherOwner: false, now: at }).unlock, true);
  assert.deepEqual(secretAction({ role: 'worker', hasSecret: false }), { label: 'Set PIN', field: 'PIN (6 digits)', kind: 'pin' });
  assert.deepEqual(secretAction({ role: 'owner', hasSecret: true }), { label: 'Change password', field: 'Password (12 characters or more)', kind: 'password' });
});

// Review of Task 11: which of a row's sign-in buttons show, and the confirms' words, as pure functions.
test("a row's sign-in buttons: none of your own secret or Remove; Make worker on yours only with another owner who can sign in", () => {
  const now = Date.UTC(2026, 10, 6, 2);
  const worker = { role: 'worker', hasSecret: true, lockedUntil: null, sessions: 0 };
  const owner = { role: 'owner', hasSecret: true, lockedUntil: null, sessions: 1 };
  assert.deepEqual(accountActions(worker, { self: false, otherOwner: false, now }), {
    secret: { label: 'Change PIN', field: 'PIN (6 digits)', kind: 'pin' }, role: { to: 'owner', label: 'Make owner' }, unlock: false, signOut: false, remove: true,
  });
  const mine = accountActions(owner, { self: true, otherOwner: false, now });
  assert.equal(mine.secret, null, 'your own password is the Your password card');
  assert.equal(mine.remove, false, 'another owner removes you');
  assert.equal(mine.role, null, 'the last owner who can sign in');
  assert.deepEqual(accountActions(owner, { self: true, otherOwner: true, now }).role, { to: 'worker', label: 'Make worker' });
  assert.deepEqual(accountActions(owner, { self: false, otherOwner: false, now }).role, { to: 'worker', label: 'Make worker' });
  assert.equal(accountActions(owner, { self: true, otherOwner: false, now }).signOut, true);
  assert.equal(accountActions({ ...worker, lockedUntil: now + 1 }, { self: false, otherOwner: false, now }).unlock, true);
  assert.equal(accountActions({ ...worker, lockedUntil: now }, { self: false, otherOwner: false, now }).unlock, false, 'the lock ran out');
  assert.equal(accountActions({ ...worker, sessions: 2 }, { self: false, otherOwner: false, now }).signOut, true);
});

test('another owner who can sign in: active, an owner, a password set, not this one', () => {
  const list = [
    { id: 1, role: 'owner', active: true, hasSecret: true },
    { id: 2, role: 'owner', active: true, hasSecret: false },
    { id: 3, role: 'owner', active: false, hasSecret: true },
    { id: 4, role: 'worker', active: true, hasSecret: true },
  ];
  assert.equal(otherOwnerCanSignIn(list, 1), false);
  assert.equal(otherOwnerCanSignIn(list, 2), true);
  assert.equal(otherOwnerCanSignIn([...list, { id: 5, role: 'owner', active: true, hasSecret: true }], 1), true);
});

test("the confirms' words: a role, Sign out everywhere, removing an owner; your own say the page goes to the sign-in view", () => {
  assert.deepEqual(roleConfirm('Ali', 'owner', false), {
    title: 'Make Ali an owner', text: 'Ali becomes an owner: they see the money and Settings, and need a password to sign in.', go: 'Make owner',
  });
  assert.deepEqual(roleConfirm('Ray', 'worker', false), { title: 'Make Ray a worker', text: 'Ray becomes a worker: they need a PIN to sign in.', go: 'Make worker' });
  assert.match(roleConfirm('Ray', 'worker', true).text, /sign-in view/);
  assert.equal(roleConfirm('Ray', 'worker', true).title, 'Make yourself a worker');
  assert.equal(signOutConfirm('Ali', false), null, "another's: at once");
  assert.match(signOutConfirm('Ray', true).text, /sign-in view/);
  assert.equal(signOutConfirm('Ray', true).go, 'Sign out');
  assert.equal(removeConfirm('Ali', { role: 'worker' }), null, 'a worker: at once, as before');
  assert.deepEqual(removeConfirm('Ali', { role: 'owner' }), { title: 'Remove Ali', text: 'Ali is an owner: removing them signs them out everywhere.', go: 'Remove' });
});

test("the Workers card's line after a sign-in change", () => {
  assert.equal(accountDone('Ali', 'unlock'), 'Ali is unlocked');
  assert.equal(accountDone('Ali', 'sign-out'), 'Ali is signed out everywhere');
  assert.equal(accountDone('Ali', 'role', 'owner'), 'Ali is an owner now — set their password');
  assert.equal(accountDone('Ray', 'role', 'worker'), 'Ray is a worker now — set their PIN');
  assert.equal(accountDone('Ali', 'secret', 'worker'), 'Ali signs in with a PIN now');
  assert.equal(accountDone('Ali', 'secret', 'owner'), 'Ali signs in with a password now');
});

test("PUT /api/workers' refusals of a name go under the name's box; the rest (the farm needs an owner) to the card's line", () => {
  assert.equal(isNameField('workers.0.name'), true);
  assert.equal(isNameField('workers.12.name'), true);
  assert.equal(isNameField('workers'), false);
  assert.equal(isNameField('workers.0.id'), false);
  assert.equal(isNameField(undefined), false);
});

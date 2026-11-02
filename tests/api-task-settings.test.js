// The tasks' Settings over HTTP (spec 2026-10-30-tasks-design.md sections 3.4, 6 and 7.3): the workers and the task rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { DAILY_RULES, CLEAR_OUT, UPKEEP_RULES, localDate, addDays, dayStart } from '../server/task-rules.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

async function app(t, { controller = null } = {}) {
  const db = openDb(':memory:');
  const server = createApp(db, { controller });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, call };
}

const tasksOf = async (call, id) => (await call('GET', `/api/rooms/${id}/tasks`)).body;
const byRule = (rows, key) => rows.find((r) => r.ruleKey === key);

test('workers: none at first; add, rename and remove by putting the whole list; a bare list is taken too', async (t) => {
  const { call } = await app(t);
  assert.deepEqual(await call('GET', '/api/workers'), { status: 200, body: { workers: [] } });
  const added = await call('PUT', '/api/workers', { workers: [{ name: ' Ali ', active: true }, { name: 'Siti' }] });
  assert.equal(added.status, 200);
  assert.deepEqual(added.body.workers.map((w) => [w.name, w.active]), [['Ali', true], ['Siti', true]]);
  const [ali, siti] = added.body.workers;
  assert.ok(Number.isInteger(ali.id) && Number.isInteger(siti.id));
  const swapped = await call('PUT', '/api/workers', { workers: [{ id: ali.id, name: 'Siti', active: true }, { id: siti.id, name: 'Ali', active: false }] });
  assert.deepEqual(swapped.body.workers, [{ id: siti.id, name: 'Ali', active: false }, { id: ali.id, name: 'Siti', active: true }]); // by name
  const removed = await call('PUT', '/api/workers', { workers: [{ id: ali.id, name: 'Ali bin Abu', active: true }] });
  assert.deepEqual(removed.body.workers, [{ id: ali.id, name: 'Ali bin Abu', active: true }]);
  assert.deepEqual(await call('GET', '/api/workers'), removed);
  const bare = await call('PUT', '/api/workers', [{ id: ali.id, name: 'Ali bin Abu', active: true }, { name: 'Ah Kow' }]);
  assert.deepEqual(bare.body.workers.map((w) => w.name), ['Ah Kow', 'Ali bin Abu']); // by name
  assert.deepEqual(await call('POST', '/api/workers', { workers: [] }), { status: 404, body: { error: 'Not found' } });
});

test('workers: a name is required, of up to 40 characters, without control characters and not on the list twice; a refused list saves nothing', async (t) => {
  const { call } = await app(t);
  const put = (workers) => call('PUT', '/api/workers', { workers });
  const seeded = await put([{ name: 'Ali' }, { name: 'Siti' }]);
  const [ali, siti] = seeded.body.workers;
  for (const name of [undefined, '', '   ', 3]) {
    assert.deepEqual(await put([{ name: 'Ali' }, { name }]), { status: 400, body: { error: 'Type a name', field: 'workers.1.name' } });
  }
  assert.deepEqual(await put([{ name: 'x'.repeat(41) }]), { status: 400, body: { error: 'The name must be at most 40 characters', field: 'workers.0.name' } });
  // A parked name (during a swap) is U+0001 and the id: no real name may look like one.
  for (const name of ['\u00011', 'Ali\tbin Abu', 'Ali\u007f']) {
    assert.deepEqual(await put([{ name }]), { status: 400, body: { error: 'A name cannot hold control characters', field: 'workers.0.name' } });
  }
  assert.deepEqual(await put([{ name: 'Ali' }, { name: 'ali ' }]), { status: 400, body: { error: 'A worker called "ali" already exists', field: 'workers.1.name' } });
  assert.deepEqual(await put([{ name: 'Ali', active: 'yes' }]), { status: 400, body: { error: 'Active must be true or false', field: 'workers.0.active' } });
  assert.deepEqual(await put([{ id: 999, name: 'Ali' }]), { status: 400, body: { error: 'Unknown worker', field: 'workers.0.id' } });
  assert.deepEqual(await put([{ id: ali.id, name: 'Ali' }, { id: ali.id, name: 'Ah Kow' }]), {
    status: 400, body: { error: 'A worker is on the list twice', field: 'workers.1.id' },
  });
  assert.deepEqual(await put(['Ali']), { status: 400, body: { error: 'Each worker must be an object with a name', field: 'workers.0' } });
  assert.deepEqual(await call('PUT', '/api/workers', { workers: 'Ali' }), { status: 400, body: { error: 'Workers must be a list', field: 'workers' } });
  // A rename, a removal and a new worker, with one bad item: none of it is saved.
  assert.deepEqual(await put([{ id: ali.id, name: 'Ali bin Abu', active: true }, { name: 'Ah Kow' }, { name: 'Mei', active: 'yes' }]), {
    status: 400, body: { error: 'Active must be true or false', field: 'workers.2.active' },
  });
  assert.deepEqual(await call('GET', '/api/workers'), { status: 200, body: { workers: [ali, siti] } });
  assert.equal((await put([{ name: 'x'.repeat(40) }])).status, 200);
});

test('a renamed worker leaves the done rows as they were', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const [ali] = (await call('PUT', '/api/workers', { workers: [{ name: 'Ali' }] })).body.workers;
  const footbath = byRule((await tasksOf(call, id)).today, 'footbath');
  await call('POST', `/api/tasks/${footbath.id}/done`, { worker: 'Ali' });
  await call('PUT', '/api/workers', { workers: [{ id: ali.id, name: 'Ali bin Abu', active: true }] });
  const [row] = (await call('GET', `/api/rooms/${id}/tasks/log`)).body.rows;
  assert.equal(row.worker, 'Ali');
});

const BUILTIN_KEYS = [...new Set([...DAILY_RULES, CLEAR_OUT, ...UPKEEP_RULES].map((r) => r.key))];

test('task rules: every built-in rule with its families, stages and time, or its interval, all on; none of your own', async (t) => {
  const { call } = await app(t);
  const r = await call('GET', '/api/task-rules');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.builtin.map((x) => x.key), BUILTIN_KEYS);
  const walk = DAILY_RULES.find((x) => x.key === 'contamWalk');
  assert.deepEqual(r.body.builtin.find((x) => x.key === 'contamWalk'), {
    key: 'contamWalk', kind: 'daily', text: walk.text, families: walk.families ?? null, stages: walk.stages ?? null, when: walk.when, slot: walk.slot,
    everyDays: null, enabled: true,
  });
  const filter = UPKEEP_RULES.find((x) => x.key === 'acFilter');
  assert.deepEqual(r.body.builtin.find((x) => x.key === 'acFilter'), {
    key: 'acFilter', kind: 'upkeep', text: filter.text, families: filter.families ?? null, stages: filter.stages ?? null, when: filter.when ?? null,
    slot: filter.slot ?? 'any', everyDays: 7, enabled: true,
  });
  assert.deepEqual(r.body.custom, []);
  assert.deepEqual(await call('POST', '/api/task-rules', {}), { status: 404, body: { error: 'Not found' } });
});

test('task rules: a built-in rule turned off, an upkeep interval of 1 to 365 days; the others kept; bad ones 400 with the field', async (t) => {
  const { call } = await app(t);
  const put = (body) => call('PUT', '/api/task-rules', body);
  const rule = (body, key) => body.builtin.find((x) => x.key === key);
  const first = await put({ builtin: [{ key: 'footbath', enabled: false }, { key: 'acFilter', everyDays: 14 }] });
  assert.equal(first.status, 200);
  assert.deepEqual([rule(first.body, 'footbath').enabled, rule(first.body, 'acFilter').everyDays, rule(first.body, 'acFilter').enabled], [false, 14, true]);
  assert.deepEqual([rule(first.body, 'flyTraps').everyDays, rule(first.body, 'flyTraps').enabled], [7, true]);
  const second = await put({ builtin: [{ key: 'flyTraps', enabled: false }, { key: 'footbath', everyDays: 3 }] }); // a daily rule has no interval
  assert.deepEqual([rule(second.body, 'footbath').enabled, rule(second.body, 'footbath').everyDays, rule(second.body, 'acFilter').everyDays, rule(second.body, 'flyTraps').enabled],
    [false, null, 14, false]);
  for (const everyDays of [0, 366, 2.5, '7']) {
    assert.deepEqual(await put({ builtin: [{ key: 'acFilter', everyDays }] }), {
      status: 400, body: { error: 'Interval must be a whole number from 1 to 365 days', field: 'builtin.acFilter.everyDays' },
    });
  }
  assert.equal(rule((await put({ builtin: [{ key: 'acFilter', everyDays: 1 }] })).body, 'acFilter').everyDays, 1);
  assert.equal(rule((await put({ builtin: [{ key: 'acFilter', everyDays: 365 }] })).body, 'acFilter').everyDays, 365);
  assert.equal(rule((await put({ builtin: [{ key: 'acFilter', everyDays: null }] })).body, 'acFilter').everyDays, 7); // back to the default
  assert.deepEqual(await put({ builtin: [{ key: 'nope', enabled: false }] }), { status: 400, body: { error: 'Unknown rule "nope"', field: 'builtin' } });
  assert.deepEqual(await put({ builtin: [{ key: 'footbath', enabled: 'no' }] }), { status: 400, body: { error: 'On must be true or false', field: 'builtin.footbath.enabled' } });
  assert.deepEqual(await put({ builtin: 'all' }), { status: 400, body: { error: 'Built-in rules must be a list', field: 'builtin' } });
  assert.deepEqual(await put([]), { status: 400, body: { error: 'Body must be a JSON object' } });
  assert.deepEqual(rule((await call('GET', '/api/task-rules')).body, 'footbath').enabled, false);
});

// C9 review: the Settings card sends the interval the owner typed; typing the default back in returns the rule to its default
// (stored null), so it follows the default if a later version changes it.
test('task rules: an upkeep interval equal to the rule\'s default is stored as none (the default)', async (t) => {
  const { db, call } = await app(t);
  const put = (body) => call('PUT', '/api/task-rules', body);
  const stored = () => db.taskRuleSettings().find((s) => s.key === 'acFilter').everyDays;
  assert.equal(UPKEEP_RULES.find((r) => r.key === 'acFilter').everyDays, 7);
  await put({ builtin: [{ key: 'acFilter', everyDays: 14 }] });
  assert.equal(stored(), 14);
  const back = await put({ builtin: [{ key: 'acFilter', everyDays: 7 }] });
  assert.equal(back.status, 200);
  assert.equal(back.body.builtin.find((x) => x.key === 'acFilter').everyDays, 7);
  assert.equal((await call('GET', '/api/task-rules')).body.builtin.find((x) => x.key === 'acFilter').everyDays, 7);
  assert.equal(stored(), null, 'task_rule_settings.every_days is null');
});

test("task rules: your own, text 1 to 120, every room or some of this farm's, daily or every 1 to 365 days, a time of day; they make rows at once", async (t) => {
  const { db, call } = await app(t);
  const r1 = (await call('POST', '/api/rooms', { ...ROOM, name: 'Room 1' })).body.id;
  const r2 = (await call('POST', '/api/rooms', { ...ROOM, name: 'Room 2' })).body.id;
  const tank = { text: ' Check the water tank ', rooms: null, everyDays: null, slot: 'morning', enabled: true };
  const shelves = { text: 'Wipe the shelves', rooms: [r2], everyDays: 14, slot: 'any', enabled: true };
  const saved = await call('PUT', '/api/task-rules', { custom: [tank, shelves] });
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.body.custom.map(({ id, ...rest }) => rest), [{ ...tank, text: 'Check the water tank' }, shelves]);
  const [tankRule, shelvesRule] = saved.body.custom;
  // Made by the PUT itself, before any page asks for the room's tasks.
  assert.equal(byRule(db.dailyTasks(r1, localDate(Date.now())), `custom:${tankRule.id}`)?.text, 'Check the water tank');
  assert.equal(byRule(db.openTasks(r2, 'upkeep'), `custom:${shelvesRule.id}`)?.text, 'Wipe the shelves');
  const one = await tasksOf(call, r1);
  const two = await tasksOf(call, r2);
  assert.equal(byRule(one.today, `custom:${tankRule.id}`).text, 'Check the water tank');
  assert.equal(byRule(one.today, `custom:${tankRule.id}`).slot, 'morning');
  assert.equal(byRule(one.upkeep, `custom:${shelvesRule.id}`), undefined);
  assert.equal(byRule(two.upkeep, `custom:${shelvesRule.id}`).text, 'Wipe the shelves');

  const put = (change) => call('PUT', '/api/task-rules', { custom: [{ ...shelves, ...change }] });
  const fails = (error, field) => ({ status: 400, body: { error, field } });
  for (const text of ['', '  ', 'x'.repeat(121), 4]) assert.deepEqual(await put({ text }), fails('Say what to do (1 to 120 characters)', 'custom.0.text'));
  for (const rooms of [[], [999], [r1, r1], 'all', [String(r1)]]) assert.deepEqual(await put({ rooms }), fails("Rooms must be every room, or one or more of this farm's rooms", 'custom.0.rooms'));
  for (const everyDays of [0, 366, 1.5, 'weekly']) assert.deepEqual(await put({ everyDays }), fails('Interval must be daily or a whole number from 1 to 365 days', 'custom.0.everyDays'));
  assert.deepEqual(await put({ slot: 'evening' }), fails('Time of day must be morning, afternoon or any', 'custom.0.slot'));
  assert.deepEqual(await put({ enabled: 'yes' }), fails('On must be true or false', 'custom.0.enabled'));
  assert.deepEqual(await put({ id: 999 }), fails('Unknown rule', 'custom.0.id'));
  assert.deepEqual(await call('PUT', '/api/task-rules', { custom: ['Sweep'] }), fails('Each rule must be an object', 'custom.0'));
  assert.deepEqual(await call('PUT', '/api/task-rules', { custom: {} }), fails('Your own rules must be a list', 'custom'));
  const longest = { ...shelves, id: shelvesRule.id, text: 'x'.repeat(120), everyDays: 365, rooms: [r1, r2] };
  assert.equal((await call('PUT', '/api/task-rules', { custom: [{ ...tank, id: tankRule.id }, longest] })).status, 200);

  const kept = await call('PUT', '/api/task-rules', { custom: [{ id: tankRule.id, text: 'Check the tank', rooms: null, everyDays: null, slot: 'afternoon', enabled: false }] });
  assert.deepEqual(kept.body.custom, [{ id: tankRule.id, text: 'Check the tank', rooms: null, everyDays: null, slot: 'afternoon', enabled: false }]);
});

test('task rules: a rule twice or not an object is refused; a refused PUT saves neither list', async (t) => {
  const { call } = await app(t);
  const put = (body) => call('PUT', '/api/task-rules', body);
  const fails = (error, field) => ({ status: 400, body: { error, field } });
  assert.deepEqual(await put({ builtin: ['footbath'] }), fails('Each rule must be an object', 'builtin.0'));
  assert.deepEqual(await put({ builtin: [{ key: 'footbath', enabled: false }, null] }), fails('Each rule must be an object', 'builtin.1'));
  assert.deepEqual(await put({ builtin: [{ key: 'footbath', enabled: false }, { key: 'footbath', enabled: true }] }), fails('A rule is on the list twice', 'builtin'));
  const [rule] = (await put({ custom: [{ text: 'Sweep', rooms: null, everyDays: null, slot: 'any', enabled: true }] })).body.custom;
  assert.deepEqual(await put({ custom: [rule, { ...rule, text: 'Sweep again' }] }), fails('A rule is on the list twice', 'custom.1.id'));
  assert.deepEqual(await put({ custom: [{ ...rule, id: 999 }] }), fails('Unknown rule', 'custom.0.id'));
  const before = (await call('GET', '/api/task-rules')).body;
  assert.deepEqual(await put({ builtin: [{ key: 'footbath', enabled: false }], custom: [{ ...rule, slot: 'evening' }] }),
    fails('Time of day must be morning, afternoon or any', 'custom.0.slot'));
  assert.deepEqual(await put({ builtin: [{ key: 'acFilter', everyDays: 0 }], custom: [{ ...rule, text: 'Mop' }] }),
    fails('Interval must be a whole number from 1 to 365 days', 'builtin.acFilter.everyDays'));
  assert.deepEqual((await call('GET', '/api/task-rules')).body, before);
});

test('task rules: a new interval re-dates the open upkeep row at once; an own rule made every N days cancels its daily row', async (t) => {
  const { db, call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const today = localDate(Date.now());
  const open = (key) => byRule(db.openTasks(id, 'upkeep'), key);
  const service = byRule((await tasksOf(call, id)).upkeep, 'acService');
  await call('POST', `/api/tasks/${service.id}/done`, { worker: 'Ali' });
  assert.equal(open('acService').dueAt, dayStart(addDays(today, 120)));
  await call('PUT', '/api/task-rules', { builtin: [{ key: 'acService', everyDays: 90 }, { key: 'flyTraps', everyDays: 14 }] });
  assert.equal(open('acService').dueAt, dayStart(addDays(today, 90)));
  assert.equal(open('flyTraps').dueAt, dayStart(today)); // no done or skip yet: today

  const [tank] = (await call('PUT', '/api/task-rules', { custom: [{ text: 'Check the water tank', rooms: null, everyDays: null, slot: 'morning', enabled: true }] })).body.custom;
  const daily = byRule(db.dailyTasks(id, today), `custom:${tank.id}`);
  await call('PUT', '/api/task-rules', { custom: [{ ...tank, everyDays: 7 }] });
  assert.deepEqual([db.getTask(daily.id).status, db.getTask(daily.id).reason], ['cancelled', 'Rule changed']);
  assert.equal(open(`custom:${tank.id}`).dueAt, dayStart(today));
});

// Tasks in the database (spec 2026-10-30-tasks-design.md section 5): upgrade 18 to 19, the task rows, workers and the owner's
// rule changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, TASK_LOG_SQL } from '../server/db.js';
import { effectiveRules } from '../server/task-rules.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const TABLES = ['custom_task_rules', 'task_rule_settings', 'tasks', 'workers'];

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, id: db.createRoom(ROOM, 1000).id };
}

const daily = (roomId, extra = {}) => ({ roomId, ruleKey: 'footbath', date: '2026-10-30', slot: 'morning', text: 'Change the footbath at the door', at: 5000, ...extra });

test('a version 18 file is upgraded to 19 with the task tables, keeping its rooms, readings and settings; opened again it stays as it is', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v18.db');
  const first = openDb(path);
  const id = first.createRoom({ ...ROOM, trhAddress: 1 }, 1000).id; // a reading is kept for a sensor the room has
  first.addReading({ roomId: id, kind: 'trh', address: 1, at: 2000, ok: true, t: 18.5, rh: 88 });
  first.setSetting('electricityPrice', '0.55');
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec(`DROP TABLE tasks; DROP TABLE workers; DROP TABLE task_rule_settings; DROP TABLE custom_task_rules;
            PRAGMA user_version = 18;`);
  raw.close();
  const db = openDb(path);
  assert.equal(db.getRoom(id).name, 'Room 1');
  assert.equal(db.getSetting('electricityPrice'), '0.55');
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.deepEqual({ ...check.prepare('SELECT room_id, kind, address, at, t, rh FROM readings').get() },
    { room_id: id, kind: 'trh', address: 1, at: 2000, t: 18.5, rh: 88 });
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 24);
  const names = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const table of TABLES) assert.ok(names.includes(table), table);
  // Opened again (the next start): still the current version, and the rows made on it are left as they are.
  db.insertDailyTask(daily(id));
  db.insertLongtermTask({ roomId: id, text: 'Seal the door gap', at: 6000 });
  const rows = check.prepare('SELECT * FROM tasks ORDER BY id').all().map((r) => ({ ...r }));
  assert.equal(rows.length, 2);
  db.close();
  const again = openDb(path);
  t.after(() => again.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 24);
  assert.deepEqual(check.prepare('SELECT * FROM tasks ORDER BY id').all().map((r) => ({ ...r })), rows);
  assert.equal(again.getTask(rows[1].id).text, 'Seal the door gap');
});

test('a daily row is made once per room, rule, date and slot', (t) => {
  const { db, id } = fresh(t);
  assert.equal(db.insertDailyTask(daily(id, { note: 'n', unit: 'kg' })), true);
  assert.equal(db.insertDailyTask(daily(id, { text: 'again' })), false);
  assert.equal(db.insertDailyTask(daily(id, { slot: 'afternoon' })), true);
  assert.equal(db.insertDailyTask(daily(id, { date: '2026-10-31' })), true);
  const rows = db.dailyTasks(id, '2026-10-30');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    id: rows[0].id, roomId: id, kind: 'daily', ruleKey: 'footbath', date: '2026-10-30', slot: 'morning', text: 'Change the footbath at the door',
    note: 'n', status: 'open', dueAt: null, createdAt: 5000, closedAt: null, worker: null, amount: null, unit: 'kg', reason: null, source: null,
  });
  // a closed row still blocks a second one
  assert.equal(db.closeTask(rows[0].id, { status: 'done', at: 6000, worker: 'Ali', amount: 2.5 }), true);
  assert.equal(db.insertDailyTask(daily(id)), false);
  assert.deepEqual(db.openDailyBefore(id, '2026-10-31').map((r) => r.slot), ['afternoon']);
});

test('closeTask closes an open row once; an upkeep close makes the next row in the same step', (t) => {
  const { db, id } = fresh(t);
  const up = { roomId: id, ruleKey: 'acFilter', text: 'Wash the aircon filter and clear the drain tray', dueAt: 100, at: 50 };
  assert.equal(db.insertUpkeepTask(up), true);
  assert.equal(db.insertUpkeepTask({ ...up, dueAt: 200 }), false, 'one open row per rule');
  const open = db.openTasks(id, 'upkeep').find((r) => r.ruleKey === 'acFilter');
  assert.equal(open.slot, 'any');
  assert.equal(db.lastClosedUpkeep(id, 'acFilter'), null);
  assert.equal(db.closeTask(open.id, { status: 'skipped', at: 300, worker: 'Siti', reason: 'No spare filter' }, { ...up, dueAt: 900, at: 300 }), true);
  const closed = db.getTask(open.id);
  assert.deepEqual([closed.status, closed.closedAt, closed.worker, closed.reason], ['skipped', 300, 'Siti', 'No spare filter']);
  assert.equal(db.openTasks(id, 'upkeep').find((r) => r.ruleKey === 'acFilter').dueAt, 900);
  assert.equal(db.lastClosedUpkeep(id, 'acFilter').id, open.id);
  assert.equal(db.closeTask(open.id, { status: 'done', at: 400, worker: 'Ali' }, { ...up, dueAt: 999, at: 400 }), false, 'not open');
  assert.equal(db.getTask(open.id).status, 'skipped');
  assert.equal(db.openTasks(id, 'upkeep').length, 1, 'no second next row');
  assert.equal(db.getTask(12345), null);
});

test('a long-term row keeps its suggestion source', (t) => {
  const { db, id } = fresh(t);
  const source = { machine: 'acBTU', from: 9000, to: 12000, rmMonth: -42, suggestedAt: 777 };
  const row = db.insertLongtermTask({ roomId: id, text: 'Aircon 9,000 → 12,000 BTU/h', source, at: 800 });
  assert.deepEqual([row.kind, row.status, row.slot, row.source, row.note], ['longterm', 'open', 'any', source, null]);
  const own = db.insertLongtermTask({ roomId: id, text: 'Seal the door gap', note: 'Left side', at: 900 });
  assert.equal(own.source, null);
  assert.deepEqual(db.openTasks(id, 'longterm').map((r) => r.text), ['Aircon 9,000 → 12,000 BTU/h', 'Seal the door gap']);
});

test('the log: closed rows newest first in pages; the CSV list oldest first; a deleted room takes its tasks', (t) => {
  const { db, id } = fresh(t);
  const other = db.createRoom({ ...ROOM, name: 'Room 2' }, 1000).id;
  const ids = {};
  for (const [key, closedAt] of [['r1', 3000], ['r2', 1000], ['r3', 2000], ['r4', 2000]]) {
    db.insertDailyTask(daily(id, { ruleKey: key }));
    ids[key] = db.dailyTasks(id, '2026-10-30').at(-1).id;
    db.closeTask(ids[key], { status: 'done', at: closedAt, worker: 'Ali' });
  }
  db.insertDailyTask(daily(id, { ruleKey: 'open' }));
  db.insertDailyTask(daily(other));
  db.closeTask(db.dailyTasks(other, '2026-10-30')[0].id, { status: 'done', at: 5000, worker: 'Ali' });
  assert.deepEqual(db.taskLog(id).map((r) => r.ruleKey), ['r1', 'r4', 'r3', 'r2']);
  assert.deepEqual(db.taskLog(id, { limit: 2 }).map((r) => r.ruleKey), ['r1', 'r4']);
  assert.deepEqual(db.taskLog(id, { before: ids.r4, limit: 2 }).map((r) => r.ruleKey), ['r3', 'r2']);
  assert.deepEqual(db.taskLogAll(id).map((r) => r.ruleKey), ['r2', 'r3', 'r4', 'r1']);
  assert.equal(db.deleteRoom(id), true);
  assert.deepEqual(db.taskLogAll(id), []);
  assert.equal(db.dailyTasks(id, '2026-10-30').length, 0);
  assert.equal(db.taskLogAll(other).length, 1, 'other rooms keep theirs');
});

test('the tasks table refuses a daily row without a date or a rule key', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'check.db');
  const first = openDb(path);
  const id = first.createRoom(ROOM, 1000).id;
  first.close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const insert = raw.prepare(`INSERT INTO tasks (room_id, kind, rule_key, date, slot, text, created_at) VALUES (?, ?, ?, ?, 'any', 'x', 1)`);
  assert.throws(() => insert.run(id, 'daily', 'footbath', null), /CHECK constraint failed/);
  assert.throws(() => insert.run(id, 'daily', null, '2026-10-30'), /CHECK constraint failed/);
  insert.run(id, 'daily', 'footbath', '2026-10-30');
  insert.run(id, 'longterm', null, null);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 2);
});

test('the log queries read the closed rows index, without a sort', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'plan.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const args = { taskLog: [1, 7, 50], taskLogAll: [1] };
  assert.deepEqual(Object.keys(TASK_LOG_SQL).sort(), Object.keys(args).sort());
  for (const [name, sql] of Object.entries(TASK_LOG_SQL)) {
    const plan = raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args[name]).map((r) => r.detail);
    assert.ok(plan.some((d) => /^SEARCH tasks USING INDEX tasks_closed \(room_id=\?\)/.test(d)), `${name}: ${plan.join(' | ')}`);
    assert.ok(!plan.some((d) => /TEMP B-TREE/.test(d)), `${name}: ${plan.join(' | ')}`);
  }
});

test('the insert methods return false only for a row that is already there; a bad row throws', (t) => {
  const { db, id } = fresh(t);
  assert.equal(db.insertDailyTask(daily(id)), true);
  assert.equal(db.insertDailyTask(daily(id)), false);
  assert.throws(() => db.insertDailyTask(daily(id, { date: null })), /CHECK constraint failed/);
  const up = { roomId: id, ruleKey: 'acFilter', text: 'Wash the aircon filter and clear the drain tray', dueAt: 100, at: 50 };
  assert.equal(db.insertUpkeepTask(up), true);
  assert.equal(db.insertUpkeepTask(up), false);
  assert.throws(() => db.insertUpkeepTask({ ...up, ruleKey: 'trhClean', slot: 'evening' }), /CHECK constraint failed/);
});

test('closeTask rolls the close back when the next upkeep row cannot be made', (t) => {
  const { db, id } = fresh(t);
  const up = { roomId: id, ruleKey: 'acFilter', text: 'Wash the aircon filter and clear the drain tray', dueAt: 100, at: 50 };
  const other = { ...up, ruleKey: 'trhClean', text: 'Wipe the T/RH sensor' };
  db.insertUpkeepTask(up);
  db.insertUpkeepTask(other);
  const open = db.openTasks(id, 'upkeep').find((r) => r.ruleKey === 'acFilter');
  // trhClean already has an open row, so a next row of trhClean is not made
  assert.throws(() => db.closeTask(open.id, { status: 'done', at: 300, worker: 'Ali' }, { ...other, dueAt: 900, at: 300 }),
    /The next upkeep row was not made/);
  assert.deepEqual([db.getTask(open.id).status, db.getTask(open.id).closedAt], ['open', null]);
  assert.equal(db.openTasks(id, 'upkeep').length, 2);
});

test('the tasks table refuses an upkeep row without a due time and a closed row without a closed time', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'check.db');
  const first = openDb(path);
  const id = first.createRoom(ROOM, 1000).id;
  first.close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const insert = raw.prepare(`INSERT INTO tasks (room_id, kind, rule_key, slot, text, status, due_at, closed_at, created_at)
                              VALUES (?, 'upkeep', 'acFilter', 'any', 'x', ?, ?, ?, 1)`);
  assert.throws(() => insert.run(id, 'open', null, null), /CHECK constraint failed/);
  assert.throws(() => insert.run(id, 'done', 100, null), /CHECK constraint failed/);
  assert.throws(() => insert.run(id, 'open', 100, 200), /CHECK constraint failed/);
  insert.run(id, 'done', 100, 200);
  insert.run(id, 'open', 100, null);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM tasks').get().n, 2);
});

test('workers: add, rename and remove; a task keeps the name it was done with', (t) => {
  const { db, id } = fresh(t);
  const [ali, siti] = db.setWorkers([{ name: 'Ali', active: true }, { name: 'Siti', active: true }]);
  assert.deepEqual(ali, { id: ali.id, name: 'Ali', active: true });
  db.insertDailyTask(daily(id));
  const row = db.dailyTasks(id, '2026-10-30')[0];
  db.closeTask(row.id, { status: 'done', at: 6000, worker: 'Ali' });
  assert.deepEqual(db.setWorkers([{ id: ali.id, name: 'Ali bin Abu', active: false }, { name: 'Ah Kow', active: true }]).map((w) => [w.name, w.active]),
    [['Ah Kow', true], ['Ali bin Abu', false]]);
  assert.ok(!db.listWorkers().some((w) => w.name === siti.name), 'Siti removed');
  assert.equal(db.getTask(row.id).worker, 'Ali');
});

test('setWorkers swaps two names without tripping the unique name', () => {
  const db = openDb(':memory:');
  const [a, b] = db.setWorkers([{ name: 'Ali', active: true }, { name: 'Siti', active: true }]);
  db.setWorkers([{ id: a.id, name: b.name, active: true }, { id: b.id, name: a.name, active: true }]);
  assert.deepEqual(db.listWorkers().map((w) => [w.id, w.name]).sort((x, y) => x[0] - y[0]), [[a.id, b.name], [b.id, a.name]]);
});

test('rule settings and the owner\'s rules are stored; a removed rule\'s id is not used again', (t) => {
  const { db } = fresh(t);
  assert.deepEqual(db.taskRuleSettings(), []);
  db.setTaskRuleSettings([{ key: 'harvestPm', enabled: false }, { key: 'acFilter', enabled: true, everyDays: 10 }]);
  assert.deepEqual(db.setTaskRuleSettings([{ key: 'acFilter', enabled: true, everyDays: 14 }, { key: 'harvestPm', enabled: false, everyDays: null }]),
    [{ key: 'acFilter', enabled: true, everyDays: 14 }, { key: 'harvestPm', enabled: false, everyDays: null }]);
  const [a, b] = db.setCustomTaskRules([
    { text: 'Top up the RO tank', rooms: null, everyDays: null, slot: 'afternoon', enabled: true },
    { text: 'Clean the shelves', rooms: [1, 2], everyDays: 14, slot: 'any', enabled: true },
  ]);
  assert.deepEqual(b, { id: b.id, text: 'Clean the shelves', rooms: [1, 2], everyDays: 14, slot: 'any', enabled: true });
  const after = db.setCustomTaskRules([{ ...a, enabled: false }, { text: 'New rule', rooms: null, everyDays: 7, slot: 'morning', enabled: true }]);
  assert.deepEqual(after.map((c) => [c.text, c.enabled]), [['Top up the RO tank', false], ['New rule', true]]);
  assert.ok(after[1].id > b.id, 'the removed rule\'s id stays unused');
});

test('setTaskRules writes the built-in changes and the own rules in one step: a refused own rule keeps both as they were', (t) => {
  const { db } = fresh(t);
  const settings = [{ key: 'acFilter', enabled: true, everyDays: 10 }];
  const saved = db.setTaskRules({ settings, custom: [{ text: 'Top up the RO tank', rooms: null, everyDays: null, slot: 'any', enabled: true }] });
  assert.deepEqual(saved.settings, settings);
  assert.deepEqual(saved.custom.map((c) => c.text), ['Top up the RO tank']);
  // the slot breaks the table's CHECK after the settings are written
  assert.throws(() => db.setTaskRules({ settings: [{ key: 'acFilter', enabled: false, everyDays: 14 }], custom: [{ ...saved.custom[0], slot: 'evening' }] }));
  assert.deepEqual(db.taskRuleSettings(), settings);
  assert.deepEqual(db.customTaskRules(), saved.custom);
  // a list left out (null) is kept
  assert.deepEqual(db.setTaskRules({ settings: null, custom: [] }), { settings, custom: [] });
  assert.deepEqual(db.setTaskRules({ settings: [], custom: null }), { settings: [], custom: [] });
});

test('a deleted room leaves the owner\'s rules; a rule left with no room is removed, not given to a new room with its id', (t) => {
  const { db, id: first } = fresh(t);
  const top = db.createRoom({ ...ROOM, name: 'Room 2' }, 1000).id;
  const [onlyTop, both, all] = db.setCustomTaskRules([
    { text: 'Clean the top room', rooms: [top], everyDays: null, slot: 'any', enabled: true },
    { text: 'Clean both rooms', rooms: [first, top], everyDays: 7, slot: 'any', enabled: false },
    { text: 'Top up the RO tank', rooms: null, everyDays: null, slot: 'any', enabled: true },
  ]);
  assert.equal(db.deleteRoom(top), true);
  assert.deepEqual(db.customTaskRules().map((c) => [c.id, c.rooms, c.enabled]), [[both.id, [first], false], [all.id, null, true]]);
  const again = db.createRoom({ ...ROOM, name: 'Room 3' }, 2000).id;
  assert.equal(again, top, 'the top room\'s id is used again');
  const customKeys = (roomId) => {
    const custom = db.customTaskRules().map((c) => ({ ...c, enabled: true }));
    const { daily, upkeep } = effectiveRules({ settings: [], custom, roomId });
    return [...daily, ...upkeep].map((r) => r.key).filter((k) => k.startsWith('custom:')).sort();
  };
  assert.deepEqual(customKeys(again), [`custom:${all.id}`]);
  assert.deepEqual(customKeys(first), [`custom:${all.id}`, `custom:${both.id}`].sort());
  const [next] = db.setCustomTaskRules([{ text: 'New rule', rooms: null, everyDays: null, slot: 'any', enabled: true }]);
  assert.ok(next.id > onlyTop.id && next.id > all.id, 'the removed rule\'s id stays unused');
});

test('a rule whose rooms are not a list does not stop a room being deleted', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'rooms.db');
  const first = openDb(path);
  const id = first.createRoom(ROOM, 1000).id;
  first.setCustomTaskRules([
    { text: 'Not a list', rooms: [id], everyDays: null, slot: 'any', enabled: true },
    { text: 'Not JSON', rooms: [id], everyDays: null, slot: 'any', enabled: true },
  ]);
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec(`UPDATE custom_task_rules SET rooms = '5' WHERE text = 'Not a list'; UPDATE custom_task_rules SET rooms = '[5' WHERE text = 'Not JSON';`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.deleteRoom(id), true);
  assert.equal(db.getRoom(id), null);
});

test('setWorkers renames a worker by case only', (t) => {
  const { db } = fresh(t);
  const [ali] = db.setWorkers([{ name: 'ali', active: true }]);
  assert.deepEqual(db.setWorkers([{ id: ali.id, name: 'Ali', active: true }]), [{ id: ali.id, name: 'Ali', active: true }]);
});

test('reopenTask opens again only a daily row the server cancelled for a stage or rule change', (t) => {
  const { db, id } = fresh(t);
  const make = (slot) => {
    db.insertDailyTask(daily(id, { slot }));
    return db.dailyTasks(id, '2026-10-30').find((r) => r.slot === slot).id;
  };
  const stage = make('morning');
  const rule = make('afternoon');
  const done = make('any');
  db.closeTask(stage, { status: 'cancelled', at: 6000, reason: 'Stage changed' });
  db.closeTask(rule, { status: 'cancelled', at: 6000, reason: 'Rule changed' });
  db.closeTask(done, { status: 'done', at: 6000, worker: 'Ali' });
  const own = db.insertLongtermTask({ roomId: id, text: 'Fit a second fan', at: 5000 }).id;
  db.closeTask(own, { status: 'cancelled', at: 6000, reason: 'Stage changed' });
  assert.equal(db.reopenTask(stage), true);
  assert.equal(db.reopenTask(rule), true);
  assert.deepEqual(db.getTask(stage), { ...db.getTask(stage), status: 'open', closedAt: null, reason: null, worker: null, amount: null });
  assert.equal(db.reopenTask(stage), false, 'open already');
  assert.equal(db.reopenTask(done), false, 'a done row stays done');
  assert.equal(db.reopenTask(own), false, 'only daily rows');
  assert.equal(db.getTask(own).status, 'cancelled');
});

test('insertLongtermTasks makes every row or none', (t) => {
  const { db, id } = fresh(t);
  const rows = db.insertLongtermTasks([
    { roomId: id, text: 'Fan 150 → 200 m³/h', source: { machine: 'fanFlow', from: 150, to: 200, rmMonth: 3, suggestedAt: 1 }, at: 800 },
    { roomId: id, text: 'Seal the door gap', at: 800 },
  ]);
  assert.deepEqual(rows.map((r) => [r.text, r.source?.machine ?? null]), [['Fan 150 → 200 m³/h', 'fanFlow'], ['Seal the door gap', null]]);
  assert.throws(() => db.insertLongtermTasks([{ roomId: id, text: 'Fit a second fan', at: 900 }, { roomId: id, text: null, at: 900 }]),
    /NOT NULL constraint failed/);
  assert.deepEqual(db.openTasks(id, 'longterm').map((r) => r.text), ['Fan 150 → 200 m³/h', 'Seal the door gap']);
});

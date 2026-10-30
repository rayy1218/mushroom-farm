// Tasks in the database (spec 2026-10-30-tasks-design.md section 5): upgrade 18 to 19, the task rows, workers and the owner's
// rule changes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, TASK_LOG_SQL } from '../server/db.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const TABLES = ['custom_task_rules', 'task_rule_settings', 'tasks', 'workers'];

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, id: db.createRoom(ROOM, 1000).id };
}

const daily = (roomId, extra = {}) => ({ roomId, ruleKey: 'footbath', date: '2026-10-30', slot: 'morning', text: 'Change the footbath at the door', at: 5000, ...extra });

test('a version 18 file is upgraded to 19 with the task tables, keeping its rooms', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v18.db');
  const first = openDb(path);
  const id = first.createRoom(ROOM, 1000).id;
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec(`DROP TABLE tasks; DROP TABLE workers; DROP TABLE task_rule_settings; DROP TABLE custom_task_rules;
            PRAGMA user_version = 18;`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.getRoom(id).name, 'Room 1');
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 19);
  const names = check.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
  for (const table of TABLES) assert.ok(names.includes(table), table);
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
  const open = db.openUpkeep(id, 'acFilter');
  assert.equal(open.slot, 'any');
  assert.equal(db.lastClosedUpkeep(id, 'acFilter'), null);
  assert.equal(db.closeTask(open.id, { status: 'skipped', at: 300, worker: 'Siti', reason: 'No spare filter' }, { ...up, dueAt: 900, at: 300 }), true);
  const closed = db.getTask(open.id);
  assert.deepEqual([closed.status, closed.closedAt, closed.worker, closed.reason], ['skipped', 300, 'Siti', 'No spare filter']);
  assert.equal(db.openUpkeep(id, 'acFilter').dueAt, 900);
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

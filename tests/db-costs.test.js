// The costs table (spec 2026-11-05-costs-design.md 2): the step to version 24, the rows' writes, a monthly item's change and
// stop, and the triggers that keep a deleted room's costs as the farm's and drop a deleted run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createCropApi } from '../server/crop-api.js';

mkdirSync('/tmp/costs', { recursive: true });
const fileOf = () => join(mkdtempSync('/tmp/costs/db-'), 'farm.db');
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4, trhAddress: 1 };
const ONE = { date: '2026-11-03', category: 'repairs', amount: 120.5, roomId: null, runId: null, note: 'Fan belt' };
const RENT = { date: '2026-08-31', category: 'rent', amount: 1500, note: 'Shop lot', repeat: 'monthly' };

test('a new database is at version 25 with a STRICT costs table', () => {
  const file = fileOf();
  openDb(file).close();
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 25);
  const { sql } = raw.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'costs'").get();
  assert.match(sql, /STRICT/);
  const triggers = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name LIKE 'costs_%' ORDER BY name").all().map((r) => r.name);
  assert.deepEqual(triggers, ['costs_room_gone', 'costs_run_gone']);
  raw.close();
});

test('a version 20 database is upgraded to 25 and keeps its rows', () => {
  const file = fileOf();
  const db = openDb(file);
  const room = db.createRoom(ROOM, Date.now());
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec('DROP TRIGGER costs_room_gone; DROP TRIGGER costs_run_gone; DROP TABLE costs; PRAGMA user_version = 20;');
  raw.close();
  const again = openDb(file);
  assert.equal(again.getRoom(room.id).name, 'Container 1');
  assert.deepEqual(again.listCosts(), []);
  again.close();
});

test('add, read, list, edit and delete a cost', () => {
  const db = openDb(':memory:');
  const made = db.insertCost(ONE, 1000);
  assert.deepEqual(made, {
    id: made.id, date: '2026-11-03', category: 'repairs', amount: 120.5, roomId: null, runId: null, note: 'Fan belt',
    sourceKind: 'manual', sourceId: null, repeat: null, repeatUntil: null, worker: null, utility: null, periodFrom: null,
    periodTo: null, createdAt: 1000,
  });
  assert.deepEqual(db.getCost(made.id), made);
  assert.equal(db.getCost(999), null);
  const later = db.insertCost({ ...ONE, date: '2026-11-01' }, 2000);
  assert.deepEqual(db.listCosts().map((c) => c.id), [later.id, made.id], 'by date');
  const edited = db.updateCost(made.id, { ...ONE, amount: 99 });
  assert.equal(edited.amount, 99);
  assert.equal(db.updateCost(999, ONE), null);
  assert.equal(db.deleteCost(made.id), true);
  assert.equal(db.deleteCost(made.id), false);
  assert.throws(() => db.insertCost({ ...ONE, category: 'equipment' }, 1), /CHECK/);
  assert.throws(() => db.insertCost({ ...ONE, amount: 0 }, 1), /CHECK/);
  db.close();
});

test('a monthly item stops at a month, or ends and a new one starts in one step', () => {
  const db = openDb(':memory:');
  const rent = db.insertCost(RENT, 1);
  assert.equal(db.stopCost(rent.id, '2026-10').repeatUntil, '2026-10');
  assert.equal(db.stopCost(999, '2026-10'), null);
  const wage = db.insertCost({ date: '2026-09-25', category: 'labour', amount: 1700, worker: 'Ali', repeat: 'monthly' }, 1);
  const { ended, started } = db.changeCost(wage.id, '2026-10', { date: '2026-11-25', category: 'labour', amount: 1800, worker: 'Ali', repeat: 'monthly' }, 2);
  assert.equal(ended.repeatUntil, '2026-10');
  assert.equal(started.amount, 1800);
  assert.equal(started.date, '2026-11-25');
  assert.equal(db.changeCost(999, '2026-10', { date: '2026-11-25', category: 'labour', amount: 1, repeat: 'monthly' }, 3), null);
  assert.equal(db.listCosts().length, 3, 'a missing item adds nothing');
  db.close();
});

test('a deleted room\'s costs become the farm\'s and lose their run', () => {
  const db = openDb(':memory:');
  const room = db.createRoom(ROOM, Date.UTC(2026, 9, 1));
  createCropApi({ db, now: () => Date.UTC(2026, 9, 1) }).put(room.id, { crops: [{ crop: 'oyster', blocks: 500 }] });
  const run = db.openRun(room.id);
  const cost = db.insertCost({ ...ONE, roomId: room.id, runId: run.id }, 1);
  assert.equal(db.deleteRoom(room.id), true);
  const after = db.getCost(cost.id);
  assert.equal(after.roomId, null);
  assert.equal(after.runId, null);
  db.close();
});

test('deleting only a run drops the cost\'s run and keeps its room', () => {
  const file = fileOf();
  const db = openDb(file);
  const room = db.createRoom(ROOM, Date.UTC(2026, 9, 1));
  createCropApi({ db, now: () => Date.UTC(2026, 9, 1) }).put(room.id, { crops: [{ crop: 'oyster', blocks: 500 }] });
  const run = db.openRun(room.id);
  const cost = db.insertCost({ ...ONE, roomId: room.id, runId: run.id }, 1);
  const other = new DatabaseSync(file);
  other.exec('PRAGMA foreign_keys = OFF');
  other.prepare('DELETE FROM runs WHERE id = ?').run(run.id);
  other.close();
  const after = db.getCost(cost.id);
  assert.equal(after.runId, null);
  assert.equal(after.roomId, room.id);
  db.close();
});

test('a version 25 file re-opens unchanged with its rows', () => {
  const file = fileOf();
  const db = openDb(file);
  const cost = db.insertCost(ONE, 1000);
  db.close();
  const again = openDb(file);
  assert.deepEqual(again.getCost(cost.id), cost);
  assert.equal(again.listCosts().length, 1);
  again.close();
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 25);
  raw.close();
});

// The Batches tables (spec 2026-11-05-batches-design.md 2): the version-21 step, the store's rows, a deleted room's batches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { openWithStock } from './batches-fixture.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const BATCH = { kind: 'bought', crop: 'oyster', supplier: 'Agro Supplies', receivedAt: 1000, blocks: 1200, pricePerBlock: 2.3, createdAt: 1000 };
const TABLES = ['batches', 'batch_checks', 'batch_recipes', 'batch_materials', 'batch_loads'];

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

test('a new file has every Batches table, STRICT, at version 21', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'new.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 21);
  for (const name of TABLES) {
    const sql = raw.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.sql;
    assert.ok(sql, name);
    assert.match(sql, /STRICT/, name);
  }
});

test('a version 20 file is upgraded to 21 and keeps its rows', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v20.db');
  const first = openDb(path);
  first.createRoom(ROOM, 1000);
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec(`${TABLES.map((n) => `DROP TABLE ${n};`).join(' ')} PRAGMA user_version = 20;`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.listRooms().length, 1);
  assert.deepEqual(db.batches.all(), []);
  const id = db.batches.insert(BATCH);
  assert.equal(db.batches.get(id).supplier, 'Agro Supplies');
});

test('the store: insert, get, update, family, checks, remove', (t) => {
  const db = fresh(t);
  const s = db.batches;
  const id = s.insert(BATCH);
  const b = s.get(id);
  assert.equal(b.id, id);
  assert.equal(b.kind, 'bought');
  assert.equal(b.parentId, null);
  assert.equal(b.blocks, 1200);
  assert.equal(b.pricePerBlock, 2.3);
  assert.equal(b.lost, 0);
  assert.equal(b.roomName, null);
  assert.equal(b.runCrops, null);
  s.update(id, { note: 'Late', blocks: 1100 });
  assert.equal(s.get(id).note, 'Late');
  assert.equal(s.get(id).blocks, 1100);
  const part = s.insert({ ...BATCH, parentId: id, blocks: 100 });
  assert.deepEqual(s.family(id).map((x) => x.id), [id, part]);
  const c = s.insertCheck({ batchId: id, at: 2000, lost: 5, cause: 'green', worker: 'Ali', note: null, createdAt: 2000 });
  assert.equal(s.check(c).lost, 5);
  assert.equal(s.get(id).lost, 5);
  s.updateCheck(c, { at: 2100, lost: 6, cause: 'black', worker: 'Siti', note: 'wet' });
  assert.deepEqual({ ...s.check(c), createdAt: 0 }, { id: c, batchId: id, at: 2100, lost: 6, cause: 'black', worker: 'Siti', note: 'wet', createdAt: 0 });
  s.moveChecks(id, part);
  assert.equal(s.checks(part).length, 1);
  s.remove(part);
  assert.equal(s.get(part), null);
  assert.equal(s.check(c), null, 'a batch\'s checks go with it');
  assert.equal(s.all().length, 1);
});

test('a placed batch shows its room and run; run, room and placed are set together', (t) => {
  const db = fresh(t);
  const roomId = db.createRoom(ROOM, 1000).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 950 }] }, { change: 'start', at: 1500 });
  const run = db.openRun(roomId);
  const id = db.batches.insert(BATCH);
  db.batches.update(id, { runId: run.id, roomId, placedAt: 1600 });
  const b = db.batches.get(id);
  assert.equal(b.roomName, 'Room 1');
  assert.equal(b.runStartedAt, 1500);
  assert.equal(b.runEndedAt, null);
  assert.deepEqual(b.runCrops, [{ crop: 'oyster', blocks: 950 }]);
  assert.deepEqual(db.batches.byRun(run.id).map((x) => x.id), [id]);
  assert.throws(() => db.batches.update(id, { runId: null }), /CHECK/);
});

test('deleting a room keeps its batches and their placed time, without the room or run (ids are reused)', (t) => {
  const db = fresh(t);
  const roomId = db.createRoom(ROOM, 1000).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 950 }] }, { change: 'start', at: 1500 });
  const id = db.batches.insert(BATCH);
  db.batches.update(id, { runId: db.openRun(roomId).id, roomId, placedAt: 1600 });
  assert.equal(db.deleteRoom(roomId), true);
  const b = db.batches.get(id);
  assert.deepEqual([b.roomId, b.runId], [null, null]);
  assert.equal(b.placedAt, 1600);
});

test('the stock tables: none until Inventory makes them; then items and moves', (t) => {
  assert.equal(fresh(t).batches.hasStock(), false);
  const db = openWithStock(t);
  const s = db.batches;
  assert.equal(s.hasStock(), true);
  const item = s.blocksItem('Grey oyster blocks');
  assert.equal(s.blocksItem('Grey oyster blocks'), item, 'found, not made twice');
  s.insertMove({ itemId: item, at: 1000, qty: 1200, unitCost: 2.3, refId: 7, note: null });
  s.insertMove({ itemId: item, at: 2000, qty: -1200, unitCost: null, refId: 8, note: 'into a room' });
  assert.deepEqual(s.moves([7, 8]).map((m) => m.qty), [1200, -1200]);
  s.deleteMoves([7]);
  assert.deepEqual(s.moves([7, 8]).map((m) => m.refId), [8]);
  assert.deepEqual(s.moves([]), []);
  s.deleteMoves([]);
});

test('update: an undefined value or an unknown field throws; tx commits, rolls back, and does not nest', (t) => {
  const s = fresh(t).batches;
  const id = s.insert(BATCH);
  assert.throws(() => s.update(id, { note: undefined }), /No value for note/);
  assert.throws(() => s.update(id, { bogus: 1 }), /No column for bogus/);
  assert.equal(s.tx(() => 7), 7);
  assert.throws(() => s.tx(() => { s.insert(BATCH); throw new Error('boom'); }), /boom/);
  assert.equal(s.all().length, 1);
  assert.throws(() => s.tx(() => s.tx(() => 1)));
});

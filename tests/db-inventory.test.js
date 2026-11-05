
// Inventory in the database (spec 2026-11-05-inventory-design.md 2): the version-22 step, the defaults of a row written with
// only the contract's columns (as Batches writes them), the unique name, the moves, the purchases between two times and a
// batch's room.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

function file(t, name) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-inv-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, name);
}

test('a version 20 file is brought to 22 with the two inventory tables, empty', (t) => {
  const path = file(t, 'v20.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  raw.exec('DROP TABLE stock_moves; DROP TABLE stock_items; PRAGMA user_version = 20;');
  raw.close();
  const db = openDb(path);
  assert.deepEqual(db.stockItems(), []);
  assert.deepEqual(db.stockMoves(), []);
  db.close();
  const check = new DatabaseSync(path);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 22);
  check.close();
});

test('a block item and a batch move written with only the contract columns read back with the defaults', (t) => {
  const path = file(t, 'batches.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  raw.exec(`INSERT INTO stock_items (id, name, kind, unit, reorder_at) VALUES (1, 'Grey oyster blocks', 'blocks', 'blocks', NULL);
            INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note) VALUES (1, 1000, 500, 1.2, 'batch', 14, NULL);`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.deepEqual(db.stockItem(1), {
    id: 1, name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks', reorderAt: null, ingredient: null, lrmpNo: null,
    archived: false, lowSentAt: null,
  });
  const [m] = db.stockMoves();
  assert.deepEqual(m, {
    id: m.id, itemId: 1, at: 1000, qty: 500, unitCost: 1.2, refKind: 'batch', refId: 14, note: null, total: null, supplier: null,
    useBy: null, roomId: null, reason: null, worker: null, counted: null, lotId: null, useBySentAt: null,
  });
});

test('item names are unique ignoring case; items and moves are written, changed and deleted', (t) => {
  const db = fresh(t);
  const bleach = db.insertStockItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2, ingredient: 'Sodium hypochlorite', lrmpNo: null });
  assert.equal(bleach.name, 'Bleach');
  assert.equal(bleach.ingredient, 'Sodium hypochlorite');
  assert.equal(db.stockNameUsed('bleach'), true);
  assert.equal(db.stockNameUsed('BLEACH', bleach.id), false);
  assert.equal(db.stockNameTaken('bLEACH'), 'Bleach');
  assert.equal(db.stockNameTaken('bleach', bleach.id), null);
  assert.throws(() => db.insertStockItem({ name: 'BLEACH', kind: 'chemical', unit: 'L' }));
  const changed = db.updateStockItem(bleach.id, { ...bleach, kind: 'other', reorderAt: 3, archived: true });
  assert.equal(changed.kind, 'other');
  assert.equal(changed.reorderAt, 3);
  assert.equal(changed.archived, true);
  db.setStockLowSent(bleach.id, 5000);
  assert.equal(db.stockItem(bleach.id).lowSentAt, 5000);

  const [buy] = db.insertStockMoves([{ itemId: bleach.id, at: 1000, qty: 5, refKind: 'purchase', total: 25, unitCost: 5, supplier: 'Kedai Ali', useBy: '2026-12-01' }]);
  assert.equal(buy.qty, 5);
  assert.equal(buy.useBy, '2026-12-01');
  const [out] = db.insertStockMoves([{ itemId: bleach.id, at: 2000, qty: -1, refKind: 'use', worker: 'Ali', lotId: buy.id, reason: 'Expired' }]);
  assert.deepEqual(db.itemStockMoves(bleach.id).map((m) => m.id), [buy.id, out.id]);
  const edited = db.updateStockMove(buy.id, { ...buy, qty: 6, total: 30, unitCost: 5, useBySentAt: 7000 });
  assert.equal(edited.qty, 6);
  assert.equal(edited.useBySentAt, 7000);
  db.setStockUseBySent(buy.id, null);
  assert.equal(db.stockMove(buy.id).useBySentAt, null);
  assert.equal(db.deleteStockMove(buy.id), 2, 'a purchase takes its throw-outs with it');
  assert.deepEqual(db.itemStockMoves(bleach.id), []);
  assert.equal(db.stockMove(buy.id), null);
  assert.equal(db.deleteStockItem(bleach.id), true);
  assert.equal(db.stockItem(bleach.id), null);
});

test('a list of moves is written in one transaction: one bad row writes none', (t) => {
  const db = fresh(t);
  const spawn = db.insertStockItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  assert.throws(() => db.insertStockMoves([
    { itemId: spawn.id, at: 1, qty: 1, refKind: 'adjust', counted: 1 },
    { itemId: spawn.id, at: 1, qty: 1, refKind: 'nonsense' },
  ]));
  assert.deepEqual(db.stockMoves(), []);
});

test('purchases between two times carry the item name and kind; batch moves are left out', (t) => {
  const db = fresh(t);
  const spawn = db.insertStockItem({ name: 'Grey oyster spawn', kind: 'spawn', unit: 'kg' });
  db.insertStockMoves([
    { itemId: spawn.id, at: 1000, qty: 3, refKind: 'purchase', total: 30, unitCost: 10 },
    { itemId: spawn.id, at: 2000, qty: 2, refKind: 'batch', refId: 4, unitCost: 1 },
    { itemId: spawn.id, at: 9000, qty: 1, refKind: 'purchase', total: 10, unitCost: 10 },
  ]);
  const got = db.stockPurchasesBetween(0, 5000);
  assert.equal(got.length, 1);
  assert.equal(got[0].name, 'Grey oyster spawn');
  assert.equal(got[0].kind, 'spawn');
  assert.equal(got[0].total, 30);
});

test("a batch's room is read from the batches table when it is there; without the table, none", (t) => {
  const path = file(t, 'rooms.db');
  const db = openDb(path);
  t.after(() => db.close());
  assert.deepEqual([...db.batchRooms([4])], []);
  const raw = new DatabaseSync(path);
  raw.exec('CREATE TABLE batches (id INTEGER PRIMARY KEY, room_id INTEGER) STRICT; INSERT INTO batches VALUES (4, 2), (5, NULL);');
  raw.close();
  assert.deepEqual([...db.batchRooms([4, 5, 6])], [[4, 2], [5, null]]);
  assert.deepEqual([...db.batchRooms([])], []);
});

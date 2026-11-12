// Reading the other modules' rows (spec 2026-11-05-costs-design.md 3; Money truth, 2026-11-12-money-truth-design.md 4 and
// 5): empty while their tables do not exist; every batch row with its cost (a bought row at its price, a made delivery's
// materials at their lots shared over its rows), its placing day and its losses while waiting; Inventory's purchases
// without kind 'blocks' (what was bought for stock); its uses, counts and throw-outs at what they took of the lots; Sales.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readSources } from '../server/costs-sources.js';
import { openDb } from '../server/db.js';
import { add } from './costs-fixtures.js';

mkdirSync('/tmp/money-truth', { recursive: true });

test('no tables yet: empty lists, no error', () => {
  const raw = new DatabaseSync(':memory:');
  assert.deepEqual(readSources(raw, 0, 1e15), { batches: [], purchases: [], uses: [], sales: [] });
  const db = openDb(':memory:');
  assert.deepEqual(db.costSources(0, 1e15), { batches: [], purchases: [], uses: [], sales: [] }, 'through the database');
  db.close();
});

test('the contract\'s columns only: a batch with a run is placed when received; purchases in the range; sales', () => {
  const raw = new DatabaseSync(':memory:');
  add(raw, {
    batches: [
      { id: 1, run_id: 7, room_id: 1, crop: 'oyster', received_at: 100, blocks: 500, price_per_block: 2.35 },
      { id: 2, run_id: null, room_id: null, crop: 'lionsmane', received_at: 200, blocks: 100, price_per_block: null },
    ],
    items: [
      { id: 1, name: 'Ready blocks', kind: 'blocks', unit: 'count' },
      { id: 2, name: 'PP bags 1 kg', kind: 'packaging', unit: 'pcs' },
      { id: 3, name: 'Alcohol 75 %', kind: 'chemical', unit: 'L' },
    ],
    moves: [
      { id: 1, item_id: 1, at: 150, qty: 500, unit_cost: 2.35, ref_kind: 'purchase' },
      { id: 2, item_id: 2, at: 160, qty: 1000, unit_cost: 0.045, ref_kind: 'purchase' },
      { id: 3, item_id: 3, at: 170, qty: 5, unit_cost: null, ref_kind: 'purchase' },
      { id: 4, item_id: 2, at: 180, qty: -200, unit_cost: null, ref_kind: 'use' },
      { id: 5, item_id: 1, at: 190, qty: -5, unit_cost: null, ref_kind: 'adjust' },
    ],
    sales: [
      { id: 1, sold_at: 300, crop: 'oyster', kg: 12.5, price_kg: 14, total: 175, buyer: 'Pasar', room_id: 1, run_id: 7 },
      { id: 2, sold_at: 9999, crop: 'oyster', kg: 1, price_kg: 14, total: 14, buyer: 'Pasar', room_id: null, run_id: null },
    ],
  });
  const got = readSources(raw, 0, 1000);
  assert.deepEqual(got.batches, [
    { batchId: 1, kind: 'bought', runId: 7, roomId: 1, receivedAt: 100, placedAt: 100, blocks: 500, pricePerBlock: 2.35, cost: 1175, missing: [], lost: [] },
    { batchId: 2, kind: 'bought', runId: null, roomId: null, receivedAt: 200, placedAt: null, blocks: 100, pricePerBlock: null, cost: null, missing: [], lost: [] },
  ]);
  assert.deepEqual(got.purchases, [
    { id: 2, itemId: 2, name: 'PP bags 1 kg', kind: 'packaging', at: 160, qty: 1000, unitCost: 0.045, total: 45 },
    { id: 3, itemId: 3, name: 'Alcohol 75 %', kind: 'chemical', at: 170, qty: 5, unitCost: null, total: null },
  ], 'no blocks purchase');
  assert.deepEqual(got.uses, [
    { id: 4, itemId: 2, name: 'PP bags 1 kg', kind: 'packaging', unit: 'pcs', at: 180, qty: 200, refKind: 'use', roomId: null, cost: 9, unpricedQty: 0 },
  ], 'the use at its lot (200 × RM 0.045); not the blocks count');
  assert.deepEqual(got.sales, [{ id: 1, at: 300, crop: 'oyster', kg: 12.5, total: 175, roomId: 1, runId: 7 }]);
});

test('a purchase total as paid when Inventory has a total column', () => {
  const raw = new DatabaseSync(':memory:');
  raw.exec(`CREATE TABLE stock_moves (id INTEGER PRIMARY KEY, item_id INTEGER, at INTEGER, qty REAL, unit_cost REAL,
    ref_kind TEXT, ref_id INTEGER, note TEXT, total REAL) STRICT;`);
  add(raw, {
    items: [{ id: 1, name: 'PP bags', kind: 'packaging', unit: 'count' }],
    moves: [
      { id: 1, item_id: 1, at: 10, qty: 3, unit_cost: 0.3333, total: 1, ref_kind: 'purchase' },
      { id: 2, item_id: 1, at: 20, qty: 3, unit_cost: 0.5, total: null, ref_kind: 'purchase' },
      { id: 3, item_id: 1, at: 30, qty: 3, unit_cost: null, total: null, ref_kind: 'purchase' },
      { id: 4, item_id: 1, at: 40, qty: 3, unit_cost: null, total: 7.456, ref_kind: 'purchase' },
    ],
  });
  assert.deepEqual(readSources(raw, 0, 1000).purchases.map((p) => p.total), [1, 1.5, null, 7.46]);
});

// A made farm (made-up figures): 1,200 kg sawdust, 400 kg rice bran, 80 kg lime, 80 kg gypsum and 300 kg grain spawn bought
// 21 Sep; a made delivery of 480 grey oyster blocks drawing 360.5, 92.4, 4.6, 4.6 and 57.5 kg and 480 plastic bags never bought.
function madeFarm({ parts = false } = {}) {
  const file = join(mkdtempSync('/tmp/money-truth/sources-'), 'farm.db');
  openDb(file).close();
  const raw = new DatabaseSync(file);
  const bought = Date.parse('2026-09-21T12:00:00+08:00');
  const mixed = Date.parse('2026-11-04T16:10:00+08:00');
  const placed = Date.parse('2026-11-05T16:46:00+08:00');
  const items = [['Sawdust', 'other', 'kg', 1200, 1680, 360.5], ['Rice bran', 'other', 'kg', 400, 840, 92.4], ['Lime', 'other', 'kg', 80, 72, 4.6],
    ['Gypsum', 'other', 'kg', 80, 96, 4.6], ['Grain spawn', 'spawn', 'kg', 300, 3300, 57.5], ['Plastic bags', 'bags', 'pcs', 0, 0, 480]];
  const lines = ['sawdust', 'bran', 'lime', 'gypsum', 'spawn', 'bags'];
  raw.exec(`INSERT INTO batches (id, kind, run_id, room_id, placed_at, crop, received_at, blocks, created_at, mixed_at)
    VALUES (5, 'made', ${parts ? 'NULL' : 2}, ${parts ? 'NULL' : 2}, ${parts ? 'NULL' : placed}, 'oyster', ${mixed}, ${parts ? 280 : 480}, ${mixed}, ${mixed})`);
  if (parts) {
    raw.exec(`INSERT INTO batches (id, kind, parent_id, run_id, room_id, placed_at, crop, received_at, blocks, created_at)
      VALUES (6, 'made', 5, 2, 2, ${placed}, 'oyster', ${mixed}, 200, ${placed})`);
    raw.exec(`INSERT INTO batch_checks (batch_id, at, lost, cause, created_at) VALUES (5, ${placed}, 30, 'green', ${placed})`);
  }
  items.forEach(([name, kind, unit, qty, total, drawn], i) => {
    const id = i + 1;
    raw.prepare('INSERT INTO stock_items (id, name, kind, unit) VALUES (?, ?, ?, ?)').run(id, name, kind, unit);
    if (qty) raw.prepare("INSERT INTO stock_moves (item_id, at, qty, unit_cost, total, ref_kind) VALUES (?, ?, ?, ?, ?, 'purchase')").run(id, bought, qty, total / qty, total);
    raw.prepare("INSERT INTO stock_moves (item_id, at, qty, ref_kind, ref_id) VALUES (?, ?, ?, 'batch', 5)").run(id, mixed, -drawn);
    raw.prepare('INSERT INTO batch_materials (batch_id, item, qty, unit, stock_item_id) VALUES (5, ?, ?, ?, ?)').run(lines[i], drawn, unit, id);
  });
  return raw;
}

test('a made batch: RM 1,340.90 of materials at their lots on its placing day, the plastic bags missing', () => {
  const raw = madeFarm();
  const [b] = readSources(raw, 0, 1e15).batches;
  assert.deepEqual(b, {
    batchId: 5, kind: 'made', runId: 2, roomId: 2, receivedAt: Date.parse('2026-11-04T16:10:00+08:00'),
    placedAt: Date.parse('2026-11-05T16:46:00+08:00'), blocks: 480, pricePerBlock: null, cost: 1340.9, missing: ['Plastic bags'], lost: [],
  });
  assert.deepEqual(readSources(raw, 0, 1e15).uses, [], 'a draw is in its batch, never a use');
});

test('a made delivery split over its rows by blocks, to the sen; a waiting row\'s blocks lost at the check\'s cost', () => {
  const raw = madeFarm({ parts: true });
  const rows = readSources(raw, 0, 1e15).batches;
  assert.deepEqual(rows.map((r) => [r.batchId, r.blocks, r.cost, r.placedAt === null]), [[5, 280, 782.19, true], [6, 200, 558.71, false]], 'RM 1,340.90 × 280 ÷ 480 floored, the rest');
  assert.deepEqual(rows[0].lost.map((l) => [l.blocks, l.cost]), [[30, 83.81]], '30 of its 280 blocks: RM 782.19 × 30 ÷ 280');
  assert.deepEqual(rows[1].lost, [], 'a placed row\'s losses are in its own cost');
});

test('a use in a room, a count that found less and a throw-out, at what they took of the lots; an unpriced part said', () => {
  const file = join(mkdtempSync('/tmp/money-truth/sources-'), 'farm.db');
  openDb(file).close();
  const raw = new DatabaseSync(file);
  raw.exec(`INSERT INTO stock_items (id, name, kind, unit) VALUES (1, 'Bleach', 'chemical', 'L');
    INSERT INTO stock_moves (id, item_id, at, qty, total, unit_cost, ref_kind) VALUES (1, 1, 100, 10, 50, 5, 'purchase');
    INSERT INTO stock_moves (id, item_id, at, qty, ref_kind, room_id, reason) VALUES (2, 1, 200, -2, 'use', 3, 'Footbath');
    INSERT INTO stock_moves (id, item_id, at, qty, ref_kind, counted) VALUES (3, 1, 300, -1, 'adjust', 7);
    INSERT INTO stock_moves (id, item_id, at, qty, ref_kind, reason, lot_id) VALUES (4, 1, 400, -9, 'use', 'Expired', 1);`);
  assert.deepEqual(readSources(raw, 0, 1000).uses.map((u) => [u.id, u.refKind, u.roomId, u.qty, u.cost, u.unpricedQty]), [
    [2, 'use', 3, 2, 10, 0], [3, 'adjust', null, 1, 5, 0], [4, 'use', null, 9, 35, 2],
  ], 'the throw-out takes the 7 L left at RM 5, the 2 L beyond the stock unpriced');
  assert.deepEqual(readSources(raw, 250, 1000).uses.map((u) => u.id), [3, 4], 'in the range');
});

test('a made delivery over RM 1,000 a block (a slip in a purchase) is no price, as Batches has it: never charged', () => {
  const raw = madeFarm();
  raw.exec("UPDATE stock_moves SET total = 1680000, unit_cost = 1400 WHERE item_id = 1 AND ref_kind = 'purchase'"); // sawdust at RM 1,400 a kg
  const [b] = readSources(raw, 0, 1e15).batches;
  assert.deepEqual([b.cost, b.missing], [null, ['Plastic bags']], 'RM 504,700 of sawdust over 480 blocks is over RM 1,000 a block');
});

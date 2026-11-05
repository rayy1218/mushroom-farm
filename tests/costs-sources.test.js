// Reading the other modules' rows (spec 2026-11-05-costs-design.md 3): empty while their tables do not exist; Batches' block
// costs (null without a price), Inventory's purchases without kind 'blocks' (Batches wins), Sales; all in a time range.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readSources } from '../server/costs-sources.js';
import { openDb } from '../server/db.js';
import { add } from './costs-fixtures.js';

test('no tables yet: empty lists, no error', () => {
  const raw = new DatabaseSync(':memory:');
  assert.deepEqual(readSources(raw, 0, 1e15), { batches: [], purchases: [], sales: [] });
  const db = openDb(':memory:');
  assert.deepEqual(db.costSources(0, 1e15), { batches: [], purchases: [], sales: [] }, 'through the database');
  db.close();
});

test('the rows in the range, with their totals', () => {
  const raw = new DatabaseSync(':memory:');
  add(raw, {
    batches: [
      { id: 1, run_id: 7, room_id: 1, crop: 'oyster', received_at: 100, blocks: 500, price_per_block: 2.35 },
      { id: 2, run_id: null, room_id: 2, crop: 'lionsmane', received_at: 200, blocks: 100, price_per_block: null },
      { id: 3, run_id: 8, room_id: 1, crop: 'oyster', received_at: 9000, blocks: 10, price_per_block: 1 },
    ],
    items: [
      { id: 1, name: 'Ready blocks', kind: 'blocks', unit: 'count' },
      { id: 2, name: 'PP bags 1 kg', kind: 'packaging', unit: 'count' },
      { id: 3, name: 'Alcohol 75 %', kind: 'chemical', unit: 'L' },
    ],
    moves: [
      { id: 1, item_id: 1, at: 150, qty: 500, unit_cost: 2.35, ref_kind: 'purchase' },
      { id: 2, item_id: 2, at: 160, qty: 1000, unit_cost: 0.045, ref_kind: 'purchase' },
      { id: 3, item_id: 3, at: 170, qty: 5, unit_cost: null, ref_kind: 'purchase' },
      { id: 4, item_id: 2, at: 180, qty: -200, unit_cost: null, ref_kind: 'use' },
    ],
    sales: [
      { id: 1, sold_at: 300, crop: 'oyster', kg: 12.5, price_kg: 14, total: 175, buyer: 'Pasar', room_id: 1, run_id: 7 },
      { id: 2, sold_at: 9999, crop: 'oyster', kg: 1, price_kg: 14, total: 14, buyer: 'Pasar', room_id: null, run_id: null },
    ],
  });
  const got = readSources(raw, 0, 1000);
  assert.deepEqual(got.batches, [
    { batchId: 1, runId: 7, roomId: 1, at: 100, blocks: 500, pricePerBlock: 2.35, cost: 1175 },
    { batchId: 2, runId: null, roomId: 2, at: 200, blocks: 100, pricePerBlock: null, cost: null },
  ]);
  assert.deepEqual(got.purchases, [
    { id: 2, itemId: 2, name: 'PP bags 1 kg', kind: 'packaging', at: 160, qty: 1000, unitCost: 0.045, total: 45 },
    { id: 3, itemId: 3, name: 'Alcohol 75 %', kind: 'chemical', at: 170, qty: 5, unitCost: null, total: null },
  ], 'no blocks purchase, no use');
  assert.deepEqual(got.sales, [{ id: 1, at: 300, crop: 'oyster', kg: 12.5, total: 175, roomId: 1, runId: 7 }]);
});

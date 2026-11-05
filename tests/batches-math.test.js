// The Batches figures (spec 2026-11-05-batches-design.md 3.1, 3.2 and 4), pure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goodOf, dryKgOf, runDryKg, blockCost, statusOf, runBlocksOf, movesOf } from '../server/batches-math.js';

const b = (o) => ({ id: 1, parentId: null, crop: 'oyster', blocks: 100, lost: 0, pricePerBlock: 2, blockKg: null, waterPct: null,
  runId: null, runEndedAt: null, runCrops: null, placedAt: null, receivedAt: 1000, ...o });

test('good blocks and dry kg per block', () => {
  assert.equal(goodOf(b({ blocks: 1200, lost: 20 })), 1180);
  assert.equal(dryKgOf(b({ blockKg: 2.3, waterPct: 60 })), 0.92);
  assert.equal(dryKgOf(b({})), null);
});

test("a run's dry kg per crop: only a crop whose batches all have a weight, weighted by blocks", () => {
  const rows = [
    b({ id: 1, blocks: 600, blockKg: 2, waterPct: 60 }), // 0.8 kg dry
    b({ id: 2, blocks: 400, blockKg: 2.5, waterPct: 60 }), // 1.0 kg dry
    b({ id: 3, crop: 'pink', blocks: 100, blockKg: 2, waterPct: 60 }),
    b({ id: 4, crop: 'pink', blocks: 100 }),
  ];
  assert.deepEqual(runDryKg(rows), { oyster: 0.88 });
  assert.deepEqual(runDryKg([]), {});
});

test('blockCost: blocks × price over the rows; null when one price is unknown; 0 with none', () => {
  assert.equal(blockCost([b({ blocks: 950, pricePerBlock: 2.3 }), b({ blocks: 250, pricePerBlock: 2.4 })]), 2785);
  assert.equal(blockCost([b({ pricePerBlock: 2 }), b({ pricePerBlock: null })]), null);
  assert.equal(blockCost([]), 0);
});

test("status and the run's blocks of the crop", () => {
  assert.equal(statusOf(b({})), 'waiting');
  assert.equal(statusOf(b({ runId: 3 })), 'placed');
  assert.equal(statusOf(b({ runId: 3, runEndedAt: 5000 })), 'past');
  assert.equal(statusOf(b({ placedAt: 3000 })), 'past', 'its room was deleted');
  assert.equal(runBlocksOf(b({})), null);
  assert.equal(runBlocksOf(b({ runId: 3, runCrops: [{ crop: 'pink', blocks: 300 }, { crop: 'oyster', blocks: 950 }] })), 950);
  assert.equal(runBlocksOf(b({ runId: 3, runCrops: [{ crop: 'pink', blocks: 300 }] })), 0);
});

test('the stock moves of a delivery: its receipt, a placed row out (less what was lost before), a waiting row\'s losses', () => {
  const first = b({ id: 1, blocks: 700, pricePerBlock: 2.3, receivedAt: 1000 });
  const part = b({ id: 2, parentId: 1, blocks: 500, placedAt: 3000, runId: 9 });
  const checks = { 1: [{ at: 1500, lost: 10 }], 2: [{ at: 2000, lost: 5 }, { at: 4000, lost: 3 }] };
  assert.deepEqual(movesOf([first, part], (id) => checks[id] ?? []), [
    { refId: 1, at: 1000, qty: 1200, unitCost: 2.3, note: null },
    { refId: 1, at: 1500, qty: -10, unitCost: null, note: 'contaminated' },
    { refId: 2, at: 2000, qty: -5, unitCost: null, note: 'contaminated' },
    { refId: 2, at: 3000, qty: -495, unitCost: null, note: 'into a room' },
  ]);
});

// The Batches figures (spec 2026-11-05-batches-design.md 3.1, 3.2 and 4), pure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goodOf, dryKgOf, runDryKg, blockCost, madePrice, statusOf, runBlocksOf, movesOf } from '../server/batches-math.js';

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

test('the stock moves: a deleted room\'s row keeps its move out; a row all lost before it went in has none', () => {
  const gone = b({ id: 1, blocks: 100, placedAt: 3000, runId: null, receivedAt: 1000 });
  assert.deepEqual(movesOf([gone], () => []).map((m) => m.qty), [100, -100]);
  const lost = b({ id: 1, blocks: 10, placedAt: 3000, runId: 9, receivedAt: 1000 });
  assert.deepEqual(movesOf([lost], () => [{ at: 2000, lost: 10 }]).map((m) => [m.qty, m.note]), [[10, null], [-10, 'contaminated']]);
});

test('a made batch is making until it is ready: in an area with its ready day, or put into a room', () => {
  const made = (o) => b({ kind: 'made', incubation: null, incubatedFrom: null, incubatedTo: null, ...o });
  assert.equal(statusOf(made({})), 'making');
  assert.equal(statusOf(made({ incubation: 'area', incubatedFrom: 2000 })), 'making');
  assert.equal(statusOf(made({ incubation: 'area', incubatedFrom: 2000, incubatedTo: 3000 })), 'waiting', 'ready to fruit');
  assert.equal(statusOf(made({ incubation: 'room', runId: 3, placedAt: 4000 })), 'placed');
  assert.equal(statusOf(made({ incubation: 'room', runId: 3, placedAt: 4000, runEndedAt: 5000 })), 'past');
  assert.equal(statusOf(made({ incubation: 'room' })), 'making', 'taken out of its grow room: it still incubates');
});

test('the made price per block: the materials at their purchase prices over the blocks made; null when one is unknown', () => {
  const prices = { 1: 0.35, 2: 1.2, 3: 0.08 };
  const priceOf = (id) => prices[id] ?? null;
  const lines = [{ qty: 287, stockItemId: 1 }, { qty: 73.6, stockItemId: 2 }, { qty: 400, stockItemId: 3 }];
  assert.equal(madePrice(lines, priceOf, 400), 0.5519, '(100.45 + 88.32 + 32) ÷ 400, to 4 places');
  assert.equal(madePrice([...lines, { qty: 5, stockItemId: null }], priceOf, 400), null, 'a line with no item');
  assert.equal(madePrice([{ qty: 5, stockItemId: 9 }], priceOf, 400), null, 'an item with no purchase price');
  assert.equal(madePrice([], priceOf, 400), null, 'no materials');
});

test("the stock moves of a made batch: its blocks at the mix, each material with an item out at the mix, the spawn at the inoculation", () => {
  const first = b({ id: 1, kind: 'made', blocks: 400, pricePerBlock: 0.55, receivedAt: 1000, mixedAt: 1000, inoculatedAt: 3000 });
  const materials = [
    { item: 'sawdust', qty: 287, stockItemId: 11 },
    { item: 'bran', qty: 73.6, stockItemId: null },
    { item: 'spawn', qty: 12, stockItemId: 12 },
  ];
  assert.deepEqual(movesOf([first], () => [], materials), [
    { refId: 1, at: 1000, qty: 400, unitCost: 0.55, note: null },
    { itemId: 11, refId: 1, at: 1000, qty: -287, unitCost: null, note: 'mixed' },
    { itemId: 12, refId: 1, at: 3000, qty: -12, unitCost: null, note: 'spawn' },
  ]);
  assert.deepEqual(movesOf([{ ...first, inoculatedAt: null }], () => [], materials).map((m) => m.qty), [400, -287], 'no spawn move before the inoculation');
});

test("a made batch's receipt is at the day mixed; moves with parts, placements and losses; no day mixed; a spawn line with no item", () => {
  const first = b({ id: 1, kind: 'made', blocks: 300, pricePerBlock: 1, receivedAt: 9000, mixedAt: 1000, inoculatedAt: 3000 });
  const part = b({ id: 2, parentId: 1, kind: 'made', blocks: 100, pricePerBlock: 1, receivedAt: 9000, mixedAt: 1000, placedAt: 5000, runId: 3 });
  const checks = { 1: [{ at: 2000, lost: 5 }], 2: [{ at: 4000, lost: 3 }, { at: 6000, lost: 2 }] };
  const moves = movesOf([first, part], (id) => checks[id] ?? [], [{ item: 'spawn', qty: 12, stockItemId: null }]);
  assert.deepEqual(moves.map((m) => [m.refId, m.at, m.qty, m.note]), [
    [1, 1000, 400, null],
    [1, 2000, -5, 'contaminated'],
    [2, 4000, -3, 'contaminated'],
    [2, 5000, -97, 'into a room'],
  ], 'the receipt at mixedAt; the loss after the placement is not taken out twice; no move for a spawn line with no item');
  const none = movesOf([{ ...first, mixedAt: null }], () => [], [{ item: 'sawdust', qty: 5, stockItemId: 4 }]);
  assert.deepEqual(none.map((m) => [m.at, m.qty]), [[9000, 300], [9000, -5]], 'no day mixed: the day received');
});

test('statusOf: a made batch whose room was deleted is past; ready in an area, then put into a room', () => {
  const made = (o) => b({ kind: 'made', incubation: 'area', incubatedFrom: 2000, incubatedTo: 3000, ...o });
  assert.equal(statusOf(made({ placedAt: 4000 })), 'past', 'placed, its room deleted');
  assert.equal(statusOf(made({})), 'waiting');
  assert.equal(statusOf(made({ placedAt: 4000, runId: 3 })), 'placed');
});

test('madePrice: no blocks, and a price of 0 is known', () => {
  assert.equal(madePrice([{ qty: 5, stockItemId: 1 }], () => 1, 0), null);
  assert.equal(madePrice([{ qty: 5, stockItemId: 1 }], () => 1, null), null);
  assert.equal(madePrice([{ qty: 5, stockItemId: 1 }], () => 0, 10), 0, 'a free material is a known price');
});

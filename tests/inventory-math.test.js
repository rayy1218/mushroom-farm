// Inventory's figures (spec 2026-11-05-inventory-design.md 3 and 5.1): in stock, lots oldest purchase first, a throw-out off
// its own lot, the use-by states in the farm's day, Low, an item's view, the attention counts, the myGAP 4-5 rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stockOf, lotsOf, useByState, itemView, attentionOf, sheetRows, SOON_DAYS, KINDS, ITEM_UNITS, WHOLE_UNITS, lotUnitCost, costedMoves,
} from '../server/inventory-math.js';

const at = (date, hh = 12) => Date.parse(`${date}T${String(hh).padStart(2, '0')}:00:00+08:00`);
let next = 0;
const mv = (fields) => ({
  id: ++next, itemId: 1, at: 0, qty: 0, unitCost: null, refKind: 'use', refId: null, note: null, total: null, supplier: null,
  useBy: null, roomId: null, reason: null, worker: null, counted: null, lotId: null, useBySentAt: null, ...fields,
});
const ITEM = { id: 1, name: 'Spawn', kind: 'spawn', unit: 'kg', reorderAt: null, ingredient: null, lrmpNo: null, archived: false, lowSentAt: null };

test('the kinds, the units and the whole-number units', () => {
  assert.deepEqual(KINDS, ['blocks', 'spawn', 'bags', 'chemical', 'packaging', 'other']);
  assert.deepEqual(ITEM_UNITS, ['pcs', 'kg', 'g', 'L', 'mL']);
  assert.deepEqual(WHOLE_UNITS, ['pcs', 'g', 'mL', 'blocks']);
});

test('in stock is the sum of the moves, to 3 places, and may go under 0', () => {
  assert.equal(stockOf([]), 0);
  assert.equal(stockOf([mv({ qty: 0.1 }), mv({ qty: 0.2 })]), 0.3);
  assert.equal(stockOf([mv({ qty: 2 }), mv({ qty: -5 })]), -3);
});

test('outs come off the oldest lot first, each lot to 0 before the next', () => {
  const a = mv({ at: 1000, qty: 5, refKind: 'purchase' });
  const b = mv({ at: 2000, qty: 3, refKind: 'purchase', useBy: '2026-12-01' });
  const lots = lotsOf([b, mv({ at: 3000, qty: -6 }), a]);
  assert.deepEqual(lots.map((l) => [l.moveId, l.qty, l.left]), [[a.id, 5, 0], [b.id, 3, 2]]);
  assert.equal(lots[1].useBy, '2026-12-01');
  assert.equal(lots[1].refKind, 'purchase');
});

test('a batch receipt and a count that added are lots; a count that took away is an out', () => {
  const batch = mv({ at: 1000, qty: 100, refKind: 'batch', refId: 4 });
  const count = mv({ at: 2000, qty: 5, refKind: 'adjust', counted: 105 });
  const less = mv({ at: 3000, qty: -10, refKind: 'adjust', counted: 95 });
  assert.deepEqual(lotsOf([batch, count, less]).map((l) => [l.refKind, l.refId, l.left]), [['batch', 4, 90], ['adjust', null, 5]]);
});

test('a throw-out comes off its own lot first; any part beyond it joins the other outs', () => {
  const a = mv({ at: 1000, qty: 5, refKind: 'purchase' });
  const b = mv({ at: 2000, qty: 3, refKind: 'purchase', useBy: '2026-11-01' });
  assert.deepEqual(lotsOf([a, b, mv({ at: 3000, qty: -3, lotId: b.id, reason: 'Expired' })]).map((l) => l.left), [5, 0]);
  assert.deepEqual(lotsOf([a, b, mv({ at: 3000, qty: -4, lotId: b.id })]).map((l) => l.left), [4, 0]);
});

test('outs beyond every lot leave them all at 0', () => {
  assert.deepEqual(lotsOf([mv({ qty: 2, refKind: 'purchase' }), mv({ at: 5, qty: -9 })]).map((l) => l.left), [0]);
});

test('use-by: soon within 7 days (the day itself usable), expired after it, nothing further off', () => {
  assert.equal(SOON_DAYS, 7);
  assert.equal(useByState(null, '2026-11-05'), null);
  assert.equal(useByState('2026-11-13', '2026-11-05'), null);
  assert.equal(useByState('2026-11-12', '2026-11-05'), 'soon');
  assert.equal(useByState('2026-11-05', '2026-11-05'), 'soon');
  assert.equal(useByState('2026-11-04', '2026-11-05'), 'expired');
});

test("an item's view: in stock, Low at or under its level, last counted, its worst use-by and its lots with some left", () => {
  const now = at('2026-11-05', 9);
  const old = mv({ at: at('2026-10-01'), qty: 2, refKind: 'purchase', useBy: '2026-11-04' });
  const later = mv({ at: at('2026-11-01'), qty: 3, refKind: 'purchase', useBy: '2026-11-10' });
  const count = mv({ at: at('2026-11-02'), qty: 0, refKind: 'adjust', counted: 5 });
  const v = itemView({ ...ITEM, reorderAt: 5 }, [old, later, count], now);
  assert.equal(v.qty, 5);
  assert.equal(v.low, true);
  assert.equal(v.lastCountedAt, count.at);
  assert.deepEqual(v.useBy, { date: '2026-11-04', state: 'expired', qty: 2 });
  assert.deepEqual(v.lots.map((l) => [l.moveId, l.left, l.state]), [[old.id, 2, 'expired'], [later.id, 3, 'soon']]);
  assert.equal(v.name, 'Spawn');
  assert.equal(v.archived, false);
  assert.equal(itemView({ ...ITEM, reorderAt: 4 }, [old, later], now).low, false);
  assert.equal(itemView(ITEM, [], now).low, false, 'no level: never Low');
  assert.equal(itemView(ITEM, [], now).lastCountedAt, null);
  assert.equal(itemView(ITEM, [], now).useBy, null);
});

test("the worst use-by's qty: what is left in every lot of that state (audit #4: part of the stock expired)", () => {
  const now = at('2026-11-05', 9);
  const a = mv({ at: at('2026-09-01'), qty: 3, refKind: 'purchase', useBy: '2026-11-01' });
  const b = mv({ at: at('2026-09-10'), qty: 1.5, refKind: 'purchase', useBy: '2026-11-03' });
  const c = mv({ at: at('2026-10-01'), qty: 25, refKind: 'purchase', useBy: '2027-04-10' });
  const used = mv({ at: at('2026-10-02'), qty: -1, refKind: 'use' });
  const v = itemView(ITEM, [a, b, c, used], now);
  assert.equal(v.qty, 28.5);
  assert.deepEqual(v.useBy, { date: '2026-11-01', state: 'expired', qty: 3.5 }, 'the use came off the oldest lot');
  const soon = mv({ at: at('2026-10-20'), qty: 3, refKind: 'purchase', useBy: '2026-11-09' });
  assert.deepEqual(itemView(ITEM, [soon, c], now).useBy, { date: '2026-11-09', state: 'soon', qty: 3 });
});

test("the use-by day is the farm's (UTC+8): 23:30 on 4 Nov in Malaysia is still 4 Nov", () => {
  const lot = mv({ at: at('2026-11-01'), qty: 1, refKind: 'purchase', useBy: '2026-11-04' });
  assert.equal(itemView(ITEM, [lot], Date.parse('2026-11-04T23:30:00+08:00')).useBy.state, 'soon');
  assert.equal(itemView(ITEM, [lot], Date.parse('2026-11-05T00:10:00+08:00')).useBy.state, 'expired');
});

test('attention counts the items not archived: low, a soon lot, an expired lot (each item by its worst)', () => {
  const v = (fields) => ({ archived: false, low: false, useBy: null, ...fields });
  assert.deepEqual(attentionOf([
    v({ low: true }), v({ useBy: { date: 'x', state: 'soon' } }), v({ low: true, useBy: { date: 'x', state: 'expired' } }),
    v({ archived: true, low: true }),
  ]), { low: 2, soon: 1, expired: 1 });
});

test('the 4-5 rows: chemical purchases and uses, oldest first, with the crops of the run, the room or none', () => {
  const items = new Map([
    [1, { ...ITEM, kind: 'chemical', name: 'Bleach', ingredient: 'Sodium hypochlorite', lrmpNo: 'LRMP 123', unit: 'L' }],
    [2, { ...ITEM, id: 2 }],
  ]);
  const rooms = new Map([[7, 'Container 1']]);
  const runs = [{ startedAt: at('2026-10-01'), endedAt: null, crops: [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 100 }] }];
  const moves = [
    mv({ itemId: 1, at: at('2026-11-03'), qty: -1, refKind: 'use', roomId: 7, reason: 'Footbath', worker: 'Ali' }),
    mv({ itemId: 1, at: at('2026-11-01'), qty: 5, refKind: 'purchase', total: 25 }),
    mv({ itemId: 1, at: at('2026-11-04'), qty: -0.5, refKind: 'use', roomId: null, worker: 'Siti' }),
    mv({ itemId: 1, at: at('2026-11-04'), qty: -0.5, refKind: 'use', roomId: 99, worker: 'Siti' }),
    mv({ itemId: 1, at: at('2026-11-04'), qty: -0.5, refKind: 'use', roomId: 0, worker: 'Siti' }),
    mv({ itemId: 2, at: at('2026-11-02'), qty: 1, refKind: 'purchase', total: 9 }),
    mv({ itemId: 1, at: at('2026-11-02'), qty: 2, refKind: 'adjust', counted: 6 }),
  ];
  const names = { oyster: 'Grey oyster', lionsmane: "Lion's mane" };
  const rows = sheetRows(moves, { items, rooms, runsOf: (id) => (id === 7 ? runs : []), cropName: (c) => names[c] });
  assert.deepEqual(rows.map((r) => [r.date, r.kind, r.crop, r.location, r.qty, r.price, r.reason, r.operator]), [
    ['2026-11-01', 'purchase', '', '', 5, 25, '', ''],
    ['2026-11-03', 'use', "Grey oyster, Lion's mane", 'Container 1', 1, null, 'Footbath', 'Ali'],
    ['2026-11-04', 'use', '', 'Not in a room', 0.5, null, '', 'Siti'],
    ['2026-11-04', 'use', '', 'A deleted room', 0.5, null, '', 'Siti'],
    ['2026-11-04', 'use', '', 'A deleted room', 0.5, null, '', 'Siti'],
  ]);
  assert.equal(rows[0].product, 'Bleach (Sodium hypochlorite)');
  assert.equal(rows[0].lrmpNo, 'LRMP 123');
  assert.equal(rows[0].unit, 'L');
});

test('a use in a room with no run at that moment has no crop', () => {
  const items = new Map([[1, { ...ITEM, kind: 'chemical', name: 'Bleach', unit: 'L' }]]);
  const runs = [{ startedAt: at('2026-11-10'), endedAt: null, crops: [{ crop: 'oyster', blocks: 1 }] }];
  const rows = sheetRows([mv({ itemId: 1, at: at('2026-11-03'), qty: -1, roomId: 7 })], { items, rooms: new Map([[7, 'Room']]), runsOf: () => runs, cropName: (c) => c });
  assert.equal(rows[0].crop, '');
  assert.equal(rows[0].product, 'Bleach');
  assert.equal(rows[0].lrmpNo, '');
});

// ---- Money truth (spec 2026-11-12-money-truth-design.md 3): what each lot cost, what each move out took, what is left ----

test('a lot\'s unit cost: a purchase\'s total ÷ qty (as paid), else its unit cost; a batch receipt\'s; a count\'s the last price', () => {
  assert.equal(lotUnitCost(mv({ qty: 1200, refKind: 'purchase', total: 1680, unitCost: 1.5 })), 1.4, 'the RM paid wins');
  assert.equal(lotUnitCost(mv({ qty: 100, refKind: 'purchase', unitCost: 0.7 })), 0.7);
  assert.equal(lotUnitCost(mv({ qty: 100, refKind: 'purchase' })), null, 'a purchase with no price');
  assert.equal(lotUnitCost(mv({ qty: 480, refKind: 'batch', refId: 5, unitCost: 2.7935 })), 2.7935);
  assert.equal(lotUnitCost(mv({ qty: 5, refKind: 'adjust', counted: 105 }), 1.25), 1.25, 'found stock at the last price paid');
  assert.equal(lotUnitCost(mv({ qty: 5, refKind: 'adjust', counted: 105 })), null);
});

test('each move out takes its lots oldest first, at their cost; the golden five materials and what is left of them', () => {
  const bought = Date.parse('2026-09-21T12:00:00+08:00');
  const mixed = Date.parse('2026-11-04T16:10:00+08:00');
  const golden = [['sawdust', 1200, 1680, 360.5, 504.7, 1175.3], ['bran', 400, 840, 92.4, 194.04, 645.96], ['lime', 80, 72, 4.6, 4.14, 67.86],
    ['gypsum', 80, 96, 4.6, 5.52, 90.48], ['spawn', 300, 3300, 57.5, 632.5, 2667.5]];
  let left = 0;
  for (const [name, qty, total, drawn, cost, value] of golden) {
    const lot = mv({ at: bought, qty, refKind: 'purchase', total, unitCost: total / qty });
    const draw = mv({ at: mixed, qty: -drawn, refKind: 'batch', refId: 5 });
    const { outs, lots, value: worth, unpriced } = costedMoves([draw, lot]);
    assert.deepEqual(outs.get(draw.id), { moveId: draw.id, qty: drawn, cost, unpricedQty: 0 }, name);
    assert.equal(lots[0].left, Math.round((qty - drawn) * 1000) / 1000, name);
    assert.equal(lots[0].value, value, name);
    assert.equal(worth, value, name);
    assert.equal(unpriced, false, name);
    left += worth;
  }
  assert.equal(Math.round(left * 100) / 100, 4647.1, 'the stock worth of the five');
});

test('a draw with no lot (bags never bought) is unpriced; a later purchase prices it, as Inventory\'s lots end', () => {
  const draw = mv({ at: 1000, qty: -480, refKind: 'batch', refId: 5 });
  const none = costedMoves([draw]);
  assert.deepEqual(none.outs.get(draw.id), { moveId: draw.id, qty: 480, cost: 0, unpricedQty: 480 });
  assert.equal(none.value, 0);
  assert.equal(none.unpriced, true, 'below zero: the worth is not known');
  const bought = mv({ at: 2000, qty: 1000, refKind: 'purchase', total: 50 });
  const later = costedMoves([draw, bought]);
  assert.deepEqual(later.outs.get(draw.id), { moveId: draw.id, qty: 480, cost: 24, unpricedQty: 0 });
  assert.deepEqual(later.lots.map((l) => [l.left, l.value]), [[520, 26]], 'the same left as lotsOf');
  assert.deepEqual(lotsOf([draw, bought]).map((l) => l.left), [520]);
  assert.equal(later.unpriced, false);
});

test('outs over two lots, a throw-out off its own lot, a count that found more at the last price, an unpriced lot', () => {
  const a = mv({ at: 1000, qty: 10, refKind: 'purchase', total: 10 }); // RM 1 a kg
  const b = mv({ at: 2000, qty: 10, refKind: 'purchase', total: 30 }); // RM 3 a kg
  const use = mv({ at: 3000, qty: -15, refKind: 'use', roomId: 2 });
  const thrown = mv({ at: 4000, qty: -5, refKind: 'use', reason: 'Expired', lotId: b.id });
  const found = mv({ at: 5000, qty: 4, refKind: 'adjust', counted: 4 });
  const less = mv({ at: 6000, qty: -1, refKind: 'adjust', counted: 3 });
  const gift = mv({ at: 7000, qty: 2, refKind: 'purchase' }); // no price
  const after = mv({ at: 8000, qty: -4, refKind: 'use' });
  const { outs, lots, value, unpriced } = costedMoves([after, gift, less, found, thrown, use, b, a]);
  assert.deepEqual(outs.get(use.id), { moveId: use.id, qty: 15, cost: 25, unpricedQty: 0 }, '10 at RM 1 + 5 at RM 3');
  assert.deepEqual(outs.get(thrown.id), { moveId: thrown.id, qty: 5, cost: 15, unpricedQty: 0 }, 'its own lot');
  assert.deepEqual(outs.get(less.id), { moveId: less.id, qty: 1, cost: 3, unpricedQty: 0 }, 'the found lot at RM 3, the last paid');
  assert.deepEqual(outs.get(after.id), { moveId: after.id, qty: 4, cost: 9, unpricedQty: 1 }, '3 found at RM 3, 1 of the gift');
  assert.deepEqual(lots.map((l) => [l.moveId, l.unitCost, l.left, l.value]), [[a.id, 1, 0, 0], [b.id, 3, 0, 0], [found.id, 3, 0, 0], [gift.id, null, 1, null]]);
  assert.equal(value, 0);
  assert.equal(unpriced, true, 'a lot with some left and no price');
  assert.deepEqual(lotsOf([after, gift, less, found, thrown, use, b, a]).map((l) => l.left), [0, 0, 0, 1], 'the same left as lotsOf');
});

test('an item\'s view carries its worth and each lot its unit cost and value', () => {
  const lot = mv({ at: Date.parse('2026-09-21T12:00:00+08:00'), qty: 1200, refKind: 'purchase', total: 1680 });
  const draw = mv({ at: Date.parse('2026-11-04T16:00:00+08:00'), qty: -360.5, refKind: 'batch', refId: 5 });
  const v = itemView(ITEM, [lot, draw], Date.parse('2026-11-12T12:00:00+08:00'));
  assert.equal(v.value, 1175.3);
  assert.equal(v.unpriced, false);
  assert.deepEqual(v.lots.map((l) => [l.left, l.unitCost, l.value]), [[839.5, 1.4, 1175.3]]);
  const none = itemView(ITEM, [mv({ at: 1000, qty: -480, refKind: 'batch' })], Date.parse('2026-11-12T12:00:00+08:00'));
  assert.equal(none.value, 0);
  assert.equal(none.unpriced, true);
});

test('a throw-out dated before its own lot (the purchase day edited later) takes that lot, as lotsOf does', () => {
  const a = mv({ at: 1000, qty: 10, refKind: 'purchase', total: 10 }); // RM 1
  const b = mv({ at: 3000, qty: 10, refKind: 'purchase', total: 100 }); // RM 10
  const thrown = mv({ at: 2000, qty: -5, refKind: 'use', reason: 'Expired', lotId: b.id });
  const { outs, lots } = costedMoves([a, thrown, b]);
  assert.deepEqual(lots.map((l) => l.left), lotsOf([a, thrown, b]).map((l) => l.left), 'the same left as lotsOf');
  assert.deepEqual(lots.map((l) => l.left), [10, 5]);
  assert.deepEqual(outs.get(thrown.id), { moveId: thrown.id, qty: 5, cost: 50, unpricedQty: 0 }, 'at its own lot\'s price');
});

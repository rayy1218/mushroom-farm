// The inventory store (spec 2026-11-05-inventory-design.md 4 and 7): items, the list and an item's page; purchases, uses,
// edits, deletes and throw-outs; counts, the purchases for Costs and the 4-5 sheet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createInventory } from '../server/inventory.js';
import { dayStart, addDays } from '../server/task-rules.js';

const NOW = Date.parse('2026-11-05T09:00:00+08:00');
const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let now = NOW;
  const inv = createInventory({ db, now: () => now });
  const told = [];
  inv.onChange((id) => told.push(id));
  return { db, inv, told, setNow: (ms) => { now = ms; } };
}

// For assert.throws: a refusal with that status and (when given) that field.
const refused = (status, field) => (err) => err.status === status && (field === undefined || err.field === field);

test('an item is added with its checks; a chemical keeps its ingredient and LRMP No., another kind does not', (t) => {
  const { inv, told } = setup(t);
  const bleach = inv.addItem({ name: '  Bleach ', kind: 'chemical', unit: 'L', reorderAt: 2, ingredient: 'Sodium hypochlorite', lrmpNo: 'LRMP 1' });
  assert.equal(bleach.name, 'Bleach');
  assert.equal(bleach.qty, 0);
  assert.equal(bleach.low, true, '0 is at or under 2');
  assert.equal(bleach.ingredient, 'Sodium hypochlorite');
  assert.equal(bleach.lrmpNo, 'LRMP 1');
  assert.deepEqual(told, [bleach.id]);
  const bags = inv.addItem({ name: 'Grow bags', kind: 'bags', unit: 'pcs', ingredient: 'x' });
  assert.equal(bags.ingredient, null);
  assert.equal(bags.reorderAt, null);
  assert.throws(() => inv.addItem({ name: 'bleach', kind: 'chemical', unit: 'L' }), refused(400, 'name'));
  assert.throws(() => inv.addItem({ name: '', kind: 'chemical', unit: 'L' }), refused(400, 'name'));
  assert.throws(() => inv.addItem({ name: 'x'.repeat(61), kind: 'other', unit: 'L' }), refused(400, 'name'));
  assert.throws(() => inv.addItem({ name: 'Blocks', kind: 'blocks', unit: 'blocks' }), refused(400, 'kind'));
  assert.throws(() => inv.addItem({ name: 'Diesel', kind: 'fuel', unit: 'L' }), refused(400, 'kind'));
  assert.throws(() => inv.addItem({ name: 'Diesel', kind: 'other', unit: 'gallon' }), refused(400, 'unit'));
  assert.throws(() => inv.addItem({ name: 'Punnets', kind: 'packaging', unit: 'pcs', reorderAt: 1.5 }), refused(400, 'reorderAt'));
  assert.throws(() => inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg', reorderAt: 1.234 }), refused(400, 'reorderAt'));
  assert.throws(() => inv.addItem(null), refused(400));
});

test('the list: by kind in the contract order, then name; attention; archived items hidden unless asked', (t) => {
  const { db, inv } = setup(t);
  inv.addItem({ name: 'Punnets', kind: 'packaging', unit: 'pcs' });
  inv.addItem({ name: 'bleach', kind: 'chemical', unit: 'L', reorderAt: 1 });
  inv.addItem({ name: 'Alcohol', kind: 'chemical', unit: 'L' });
  db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  const old = inv.addItem({ name: 'Old cleaner', kind: 'chemical', unit: 'L', reorderAt: 1 });
  inv.editItem(old.id, { archived: true });
  const list = inv.list();
  assert.deepEqual(list.items.map((i) => i.name), ['Grey oyster blocks', 'Alcohol', 'bleach', 'Punnets']);
  assert.deepEqual(list.attention, { low: 1, soon: 0, expired: 0 });
  assert.equal(list.archivedCount, 1);
  assert.equal('lots' in list.items[0], false);
  assert.deepEqual(list.suppliers, []);
  assert.deepEqual(inv.list({ archived: true }).items.map((i) => i.name), ['Grey oyster blocks', 'Alcohol', 'bleach', 'Old cleaner', 'Punnets']);
});

test('edit: name, kind, level; the unit only while the item has no records; a block item only its level', (t) => {
  const { db, inv } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const changed = inv.editItem(spawn.id, { name: 'Grey oyster spawn', unit: 'g', reorderAt: 500 });
  assert.equal(changed.name, 'Grey oyster spawn');
  assert.equal(changed.unit, 'g');
  assert.equal(changed.reorderAt, 500);
  assert.equal(inv.editItem(spawn.id, { kind: 'chemical', ingredient: 'Ethanol' }).ingredient, 'Ethanol');
  assert.equal(inv.editItem(spawn.id, { kind: 'other' }).ingredient, null, 'not a chemical: no ingredient');
  db.insertStockMoves([{ itemId: spawn.id, at: NOW, qty: 5, refKind: 'adjust', counted: 5 }]);
  assert.throws(() => inv.editItem(spawn.id, { unit: 'kg' }), refused(409, 'unit'));
  assert.equal(inv.editItem(spawn.id, { unit: 'g', reorderAt: null }).reorderAt, null, 'the same unit is fine');
  assert.throws(() => inv.editItem(spawn.id, { archived: 'yes' }), refused(400, 'archived'));
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  assert.equal(inv.editItem(blocks.id, { reorderAt: 200 }).reorderAt, 200);
  assert.throws(() => inv.editItem(blocks.id, { name: 'Blocks' }), refused(409));
  assert.throws(() => inv.editItem(blocks.id, { archived: true }), refused(409));
  assert.throws(() => inv.editItem(999, { name: 'x' }), refused(404));
});

test('delete: only an item with no records; else archive it', (t) => {
  const { db, inv, told } = setup(t);
  const a = inv.addItem({ name: 'A', kind: 'other', unit: 'pcs' });
  const b = inv.addItem({ name: 'B', kind: 'other', unit: 'pcs' });
  db.insertStockMoves([{ itemId: b.id, at: NOW, qty: 1, refKind: 'adjust', counted: 1 }]);
  inv.removeItem(a.id);
  assert.equal(db.stockItem(a.id), null);
  assert.equal(told.at(-1), a.id);
  assert.throws(() => inv.removeItem(b.id), refused(409));
  assert.throws(() => inv.removeItem(a.id), refused(404));
});

test("an item's page: its view, its lots, its moves newest first with their rooms, the earlier suppliers and reasons", (t) => {
  const { db, inv } = setup(t);
  const room = db.createRoom(ROOM, 1000);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  db.insertStockMoves([
    { itemId: bleach.id, at: NOW - 3000, qty: 5, refKind: 'purchase', total: 25, unitCost: 5, supplier: 'Kedai Ali' },
    { itemId: bleach.id, at: NOW - 2000, qty: -1, refKind: 'use', roomId: room.id, reason: 'Footbath', worker: 'Ali' },
    { itemId: bleach.id, at: NOW - 1000, qty: -1, refKind: 'use', roomId: 999, reason: 'footbath', worker: 'Ali' },
  ]);
  const page = inv.item(bleach.id);
  assert.equal(page.qty, 3);
  assert.deepEqual(page.lots.map((l) => l.left), [3]);
  assert.deepEqual(page.moves.map((m) => [m.refKind, m.roomName]), [['use', null], ['use', 'Container 1'], ['purchase', null]]);
  assert.equal(page.moves[0].roomId, 999, 'a deleted room keeps its id; the page says so');
  assert.equal('useBySentAt' in page.moves[0], false);
  assert.deepEqual(page.suppliers, ['Kedai Ali']);
  assert.deepEqual(page.reasons, ['footbath'], 'the latest spelling, once');
  assert.deepEqual(inv.list().suppliers, ['Kedai Ali']);
  assert.throws(() => inv.item(999), refused(404));
});

test("a name Batches keeps for its block items is refused, on add and on rename, whatever its case", (t) => {
  const { inv } = setup(t);
  assert.throws(() => inv.addItem({ name: 'grey OYSTER blocks', kind: 'other', unit: 'pcs' }), refused(400, 'name'));
  assert.throws(() => inv.addItem({ name: " lion's mane blocks ", kind: 'other', unit: 'pcs' }), refused(400, 'name'));
  const spawn = inv.addItem({ name: 'Grey oyster spawn', kind: 'spawn', unit: 'kg' });
  assert.throws(() => inv.editItem(spawn.id, { name: 'GREY OYSTER BLOCKS' }), refused(400, 'name'));
  assert.equal(inv.editItem(spawn.id, { name: 'Grey oyster spawn 2' }).name, 'Grey oyster spawn 2');
});

test('the reorder level is checked again on a unit change; qty-like levels; a block level; a kind stays', (t) => {
  const { db, inv } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg', reorderAt: 1.5 });
  assert.throws(() => inv.editItem(spawn.id, { unit: 'g' }), refused(400, 'reorderAt'));
  assert.equal(inv.editItem(spawn.id, { unit: 'g', reorderAt: 500 }).reorderAt, 500);
  const kg = inv.addItem({ name: 'Substrate', kind: 'other', unit: 'kg', reorderAt: 0.29 });
  assert.equal(kg.reorderAt, 0.29);
  assert.throws(() => inv.addItem({ name: 'Sawdust', kind: 'other', unit: 'kg', reorderAt: 1.005 }), refused(400, 'reorderAt'));
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  assert.throws(() => inv.editItem(blocks.id, { reorderAt: 1.5 }), refused(400, 'reorderAt'));
  assert.throws(() => inv.editItem(spawn.id, { kind: 'blocks' }), refused(400, 'kind'));
});

test('a purchase: qty in the unit, the total, the price per unit, the supplier, a use-by, the day', (t) => {
  const { inv, told } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const today = inv.purchase({ itemId: bleach.id, qty: 3, total: 25, supplier: ' Kedai Ali ', useBy: '2026-12-01' });
  assert.equal(today.at, NOW);
  assert.equal(today.qty, 3);
  assert.equal(today.unitCost, 8.333333);
  assert.equal(today.supplier, 'Kedai Ali');
  assert.equal(today.refKind, 'purchase');
  assert.equal(told.at(-1), bleach.id);
  const back = inv.purchase({ itemId: bleach.id, qty: 1.25, total: 0, day: '2026-11-01' });
  assert.equal(back.at, Date.parse('2026-11-01T12:00:00+08:00'));
  assert.equal(back.unitCost, 0);
  assert.equal(back.useBy, null);
  for (const [body, field] of [
    [{ qty: 0, total: 1 }, 'qty'], [{ qty: 1.234, total: 1 }, 'qty'], [{ qty: 100_001, total: 1 }, 'qty'], [{ qty: '3', total: 1 }, 'qty'],
    [{ qty: 1, total: -1 }, 'total'], [{ qty: 1, total: 1.005 }, 'total'], [{ qty: 1, total: null }, 'total'],
    [{ qty: 1, total: 1, day: '2026-11-06' }, 'day'], [{ qty: 1, total: 1, day: '2025-09-30' }, 'day'], [{ qty: 1, total: 1, day: '2026-02-30' }, 'day'],
    [{ qty: 1, total: 1, day: '2026-11-03', useBy: '2026-11-02' }, 'useBy'], [{ qty: 1, total: 1, useBy: 'soon' }, 'useBy'],
    [{ qty: 1, total: 1, supplier: 'x'.repeat(61) }, 'supplier'],
  ]) assert.throws(() => inv.purchase({ itemId: bleach.id, ...body }), refused(400, field), JSON.stringify(body));
  assert.throws(() => inv.purchase({ itemId: 999, qty: 1, total: 1 }), refused(404));
  const bags = inv.addItem({ name: 'Bags', kind: 'bags', unit: 'pcs' });
  assert.throws(() => inv.purchase({ itemId: bags.id, qty: 1.5, total: 1 }), refused(400, 'qty'));
});

test('no purchase of a block item (Batches brings blocks in); nothing new on an archived item', (t) => {
  const { db, inv } = setup(t);
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  assert.throws(() => inv.purchase({ itemId: blocks.id, qty: 10, total: 10 }), refused(409));
  const old = inv.addItem({ name: 'Old', kind: 'other', unit: 'pcs' });
  inv.editItem(old.id, { archived: true });
  assert.throws(() => inv.purchase({ itemId: old.id, qty: 1, total: 1 }), refused(409));
  assert.throws(() => inv.use({ itemId: old.id, qty: 1, worker: 'Ali' }), refused(409));
});

test('a use: taken off, with the room, the reason and who; more than in stock is allowed', (t) => {
  const { db, inv } = setup(t);
  const room = db.createRoom(ROOM, 1000);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const used = inv.use({ itemId: bleach.id, qty: 2, roomId: room.id, reason: 'Footbath', worker: 'Ali' });
  assert.equal(used.qty, -2);
  assert.equal(used.roomId, room.id);
  assert.equal(used.reason, 'Footbath');
  assert.equal(used.worker, 'Ali');
  assert.equal(used.at, NOW);
  assert.equal(inv.item(bleach.id).qty, -2);
  const back = inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', at: NOW - 3_600_000 });
  assert.equal(back.at, NOW - 3_600_000);
  assert.equal(back.roomId, null);
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  assert.equal(inv.use({ itemId: blocks.id, qty: 12, reason: 'Contaminated', worker: 'Ali' }).qty, -12, 'block items take uses');
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, roomId: 999, worker: 'Ali' }), refused(400, 'roomId'));
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1 }), refused(400, 'worker'));
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', at: NOW + 120_000 }), refused(400, 'at'));
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', at: NOW - 401 * 86_400_000 }), refused(400, 'at'));
});

test('who: one of the active workers when the farm has a list, as the list spells it', (t) => {
  const { db, inv } = setup(t);
  db.setWorkers([{ name: 'Ali', active: true }]);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  assert.equal(inv.use({ itemId: bleach.id, qty: 1, worker: 'ali' }).worker, 'Ali');
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, worker: 'Siti' }), refused(400, 'worker'));
});

test('edit a purchase or a use; a changed use-by may be told again; a count and a batch move are not edited', (t) => {
  const { db, inv, setNow } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const buy = inv.purchase({ itemId: bleach.id, qty: 3, total: 25, useBy: '2026-11-10' });
  db.setStockUseBySent(buy.id, NOW);
  const same = inv.editMove(buy.id, { total: 30, supplier: 'Kedai Ali' });
  assert.equal(same.unitCost, 10);
  assert.equal(same.supplier, 'Kedai Ali');
  assert.equal(same.useBySentAt, NOW, 'the same use-by: not told again');
  const moved = inv.editMove(buy.id, { useBy: '2026-11-20', day: '2026-11-02' });
  assert.equal(moved.useBySentAt, null);
  assert.equal(moved.at, Date.parse('2026-11-02T12:00:00+08:00'));
  assert.throws(() => inv.editMove(buy.id, { useBy: '2026-11-01' }), refused(400, 'useBy'));
  const used = inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', reason: 'Footbath' });
  setNow(NOW + 60_000);
  assert.equal(inv.editMove(used.id, { at: null }).at, used.at, 'at: null counts as not given');
  const edited = inv.editMove(used.id, { qty: 2, reason: 'Cleaning', roomId: null });
  assert.equal(edited.qty, -2);
  assert.equal(edited.reason, 'Cleaning');
  assert.equal(edited.worker, 'Ali');
  const [count] = db.insertStockMoves([{ itemId: bleach.id, at: NOW, qty: 0, refKind: 'adjust', counted: 1 }]);
  assert.throws(() => inv.editMove(count.id, { qty: 1 }), refused(409));
  const [batch] = db.insertStockMoves([{ itemId: bleach.id, at: NOW, qty: -1, refKind: 'batch', refId: 3 }]);
  assert.throws(() => inv.editMove(batch.id, { qty: 1 }), refused(409));
  assert.throws(() => inv.removeMove(batch.id), refused(409));
  assert.throws(() => inv.editMove(999, { qty: 1 }), refused(404));
});

test('delete a record; a purchase takes its throw-outs with it', (t) => {
  const { inv, told } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const buy = inv.purchase({ itemId: spawn.id, qty: 3, total: 30, useBy: '2026-11-08' });
  assert.equal(inv.throwOut(buy.id, { worker: 'Ali' }).lotId, buy.id);
  inv.removeMove(buy.id);
  assert.deepEqual(inv.item(spawn.id).moves, []);
  assert.equal(told.at(-1), spawn.id);
  assert.throws(() => inv.removeMove(buy.id), refused(404));
});

test('throw out: what is left of a soon or expired lot, from that lot, with the words for it', (t) => {
  const { inv, setNow } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const old = inv.purchase({ itemId: spawn.id, qty: 2, total: 20, day: '2026-10-20' });
  const soon = inv.purchase({ itemId: spawn.id, qty: 3, total: 30, useBy: '2026-11-08' });
  const later = inv.purchase({ itemId: spawn.id, qty: 1, total: 10, useBy: '2026-12-30' });
  inv.use({ itemId: spawn.id, qty: 1, worker: 'Ali' });
  const thrown = inv.throwOut(soon.id, { worker: 'Ali' });
  assert.equal(thrown.qty, -3);
  assert.equal(thrown.reason, 'Thrown out');
  assert.equal(thrown.refKind, 'use');
  assert.deepEqual(inv.item(spawn.id).lots.map((l) => [l.moveId, l.left]), [[old.id, 1], [later.id, 1]]);
  assert.throws(() => inv.throwOut(soon.id, { worker: 'Ali' }), refused(409), 'nothing left');
  assert.throws(() => inv.throwOut(later.id, { worker: 'Ali' }), refused(409), 'not near its use-by');
  setNow(Date.parse('2026-12-31T09:00:00+08:00'));
  assert.throws(() => inv.throwOut(later.id, {}), refused(400, 'worker'));
  assert.equal(inv.throwOut(later.id, { worker: 'Ali' }).reason, 'Expired');
  assert.throws(() => inv.throwOut(999, { worker: 'Ali' }), refused(404));
});

test('a count: each typed figure against the records at that moment, a matching one too, in one go', (t) => {
  const { inv, told } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const bags = inv.addItem({ name: 'Bags', kind: 'bags', unit: 'pcs' });
  inv.purchase({ itemId: bleach.id, qty: 5, total: 25 });
  const before = told.length;
  const { moves } = inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: 3.5 }, { itemId: bags.id, qty: 0 }] });
  assert.deepEqual(moves.map((m) => [m.itemId, m.qty, m.counted, m.refKind, m.worker]), [[bleach.id, -1.5, 3.5, 'adjust', 'Ali'], [bags.id, 0, 0, 'adjust', 'Ali']]);
  assert.equal(inv.item(bleach.id).qty, 3.5);
  assert.equal(inv.item(bags.id).lastCountedAt, NOW);
  assert.equal(told.at(-1), null, 'one write about several items');
  assert.equal(told.filter((x) => x === null).length, 1, 'told once');
  assert.equal(told.length, before + 1);
});

test('a count with one bad entry saves none', (t) => {
  const { inv } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const old = inv.addItem({ name: 'Old', kind: 'other', unit: 'pcs' });
  inv.editItem(old.id, { archived: true });
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: 1 }, { itemId: old.id, qty: 1 }] }), refused(400, 'counts.1'));
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: 1 }, { itemId: bleach.id, qty: 2 }] }), refused(400, 'counts.1'));
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: -1 }] }), refused(400, 'counts.0'));
  assert.throws(() => inv.count({ worker: 'Ali', counts: [] }), refused(400, 'counts'));
  assert.throws(() => inv.count({ counts: [{ itemId: bleach.id, qty: 1 }] }), refused(400, 'worker'));
  assert.deepEqual(inv.item(bleach.id).moves, []);
});

test("the purchases for Costs: the farm's days from–to, oldest first, never a batch move", (t) => {
  const { db, inv } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const a = inv.purchase({ itemId: spawn.id, qty: 2, total: 20, day: '2026-11-01' });
  const b = inv.purchase({ itemId: spawn.id, qty: 1, total: 12 });
  db.insertStockMoves([{ itemId: spawn.id, at: NOW, qty: 500, refKind: 'batch', refId: 1, unitCost: 1.2 }]);
  assert.deepEqual(inv.purchases('2026-11-01', '2026-11-05'), { purchases: [
    { id: a.id, itemId: spawn.id, name: 'Spawn', kind: 'spawn', at: a.at, qty: 2, unitCost: 10, total: 20 },
    { id: b.id, itemId: spawn.id, name: 'Spawn', kind: 'spawn', at: b.at, qty: 1, unitCost: 12, total: 12 },
  ] });
  assert.deepEqual(inv.purchases('2026-11-02', '2026-11-04').purchases, []);
  assert.deepEqual(inv.purchases('2026-11-05', '2026-11-05').purchases.map((p) => p.id), [b.id], 'a one-day range');
  assert.throws(() => inv.purchases('2026-11-05', '2026-11-01'), refused(400, 'from'));
  assert.throws(() => inv.purchases(null, '2026-11-01'), refused(400, 'from'));
  assert.throws(() => inv.purchases('2026-11-01', '5 Nov'), refused(400, 'to'));
});

test('the 4-5 sheet of the last 30, 90 or 365 days', (t) => {
  const { db, inv } = setup(t);
  const room = db.createRoom(ROOM, 1000);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', lrmpNo: 'LRMP 9' });
  inv.purchase({ itemId: bleach.id, qty: 5, total: 25, day: '2026-09-01' });
  inv.use({ itemId: bleach.id, qty: 1, roomId: room.id, reason: 'Footbath', worker: 'Ali' });
  const sheet = inv.sheet(30);
  assert.equal(sheet.from, '2026-10-07');
  assert.equal(sheet.to, '2026-11-05');
  assert.equal(sheet.days, 30);
  assert.deepEqual(sheet.rows.map((r) => [r.kind, r.location, r.lrmpNo]), [['use', 'Container 1', 'LRMP 9']]);
  assert.equal(inv.sheet(90).rows.length, 2);
  assert.throws(() => inv.sheet(7), refused(400, 'days'));
});

test('review fixes: day null is not a change; an old use keeps its own at; no throw-out on an archived item', (t) => {
  const { inv, setNow } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const buy = inv.purchase({ itemId: spawn.id, qty: 3, total: 30, day: '2026-11-01', useBy: '2026-11-08' });
  assert.equal(inv.editMove(buy.id, { day: null, total: 31 }).at, buy.at, 'day null leaves the day');
  const used = inv.use({ itemId: spawn.id, qty: 1, worker: 'Ali', at: NOW - 10_000 });
  setNow(NOW + 401 * 86_400_000);
  assert.equal(inv.editMove(used.id, { at: used.at, qty: 2 }).qty, -2, 'an old use sent back with its own at');
  assert.throws(() => inv.editMove(used.id, { at: used.at + 1 }), refused(400, 'at'));
  setNow(NOW);
  inv.editItem(spawn.id, { archived: true });
  assert.throws(() => inv.throwOut(buy.id, { worker: 'Ali' }), (e) => e.status === 409 && e.message === 'Bring the item back first: it is archived');
});

test('review fixes: count limits and messages', (t) => {
  const { inv } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const old = inv.addItem({ name: 'Old', kind: 'other', unit: 'pcs' });
  inv.editItem(old.id, { archived: true });
  const many = Array.from({ length: 501 }, () => ({ itemId: bleach.id, qty: 1 }));
  assert.throws(() => inv.count({ worker: 'Ali', counts: many }), (e) => e.status === 400 && e.field === 'counts' && e.message === 'Count at most 500 items at once');
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: old.id, qty: 1 }] }), (e) => e.status === 400 && e.field === 'counts.0' && e.message === 'That item is archived');
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: 999, qty: 1 }] }), (e) => e.field === 'counts.0' && e.message === 'No such item');
});

test('the purchases read keeps the edges of the farm days', (t) => {
  const { db, inv } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const from = '2026-11-02';
  const to = '2026-11-04';
  const edges = [dayStart(from) - 1, dayStart(from), dayStart(addDays(to, 1)) - 1, dayStart(addDays(to, 1))];
  const moves = db.insertStockMoves(edges.map((at) => ({ itemId: spawn.id, at, qty: 1, refKind: 'purchase', total: 1, unitCost: 1 })));
  assert.deepEqual(inv.purchases(from, to).purchases.map((p) => p.id), [moves[1].id, moves[2].id]);
});

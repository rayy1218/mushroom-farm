// The inventory store (spec 2026-11-05-inventory-design.md 4 and 7): items, the list and an item's page; purchases, uses,
// edits, deletes and throw-outs; counts, the purchases for Costs and the 4-5 sheet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createInventory } from '../server/inventory.js';

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

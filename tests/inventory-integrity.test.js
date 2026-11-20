// Inventory and Data integrity (spec 2026-11-12-data-integrity-design.md 3 and 4): purchases, uses, counts and throw-outs
// logged with who; Undo within its minute by its person (G20), else void; a voided purchase takes its throw-outs with it and
// leaves the lots, the stock and the sheet; a batch move is Batches'. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createInventory, InventoryError } from '../server/inventory.js';

const NOW = Date.UTC(2026, 10, 10, 2); // 10 Nov 2026 10:00 at the farm
const SARA = { name: 'Sara', role: 'worker' };
const LIM = { name: 'Lim', role: 'owner' };

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = NOW;
  db.setWorkers([{ name: 'Sara', active: true }, { name: 'Lim', active: true }]);
  const inventory = createInventory({ db, now: () => clock });
  const bleach = inventory.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  return { db, inventory, bleach, tick: (ms) => { clock += ms; } };
}
const refused = (fn, status, message) => assert.throws(fn, (e) => e instanceof InventoryError && e.status === status && (message === undefined || e.message === message));

test('G20: Sara\'s use undone at 40 s by Sara goes, an undo entry kept; at 70 s, or by another, it is voided instead', (t) => {
  const { db, inventory, bleach, tick } = setup(t);
  inventory.purchase({ itemId: bleach.id, qty: 10, total: 42 }, LIM);
  const use = inventory.use({ itemId: bleach.id, qty: 1.5, worker: 'Sara' }, SARA);
  tick(40_000);
  refused(() => inventory.removeMove(use.id, LIM), 409, 'Void it instead: a money record is kept.');
  inventory.removeMove(use.id, SARA);
  assert.equal(db.stockMove(use.id), null);
  assert.deepEqual(db.changesOf('move', use.id).map((c) => [c.action, c.by]), [['add', 'Sara'], ['undo', 'Sara']]);
  const again = inventory.use({ itemId: bleach.id, qty: 1.5, worker: 'Sara' }, SARA);
  tick(70_000);
  refused(() => inventory.removeMove(again.id, SARA), 409, 'Void it instead: a money record is kept.');
  inventory.voidMove(again.id, { reason: 'Used none, the bottle was full' }, LIM);
  assert.equal(inventory.item(bleach.id).qty, 10, 'out of the stock');
  assert.deepEqual(inventory.item(bleach.id).moves.map((m) => [m.refKind, m.voided?.reason ?? null]),
    [['use', 'Used none, the bottle was full'], ['purchase', null]], 'listed, struck');
  refused(() => inventory.editMove(again.id, { qty: 1 }, LIM), 409, 'Restore it first');
  inventory.restoreMove(again.id, {}, LIM);
  assert.equal(inventory.item(bleach.id).qty, 8.5);
});

test('a voided purchase takes the throw-outs of its lot with it, out of the lots and the sheet; restored together', (t) => {
  const { db, inventory, bleach, tick } = setup(t);
  const lot = inventory.purchase({ itemId: bleach.id, qty: 5, total: 25, useBy: '2026-11-11' }, LIM);
  tick(2 * 86_400_000);
  const out = inventory.throwOut(lot.id, { worker: 'Sara' }, SARA);
  assert.deepEqual(db.changesOf('move', out.id).map((c) => [c.action, c.by]), [['add', 'Sara']]);
  const v = inventory.voidMove(lot.id, { reason: 'Never came: the order was cancelled' }, LIM);
  assert.equal(v.voided.reason, 'Never came: the order was cancelled');
  assert.equal(db.stockMove(out.id).voidReason, 'Its purchase was voided');
  const page = inventory.item(bleach.id);
  assert.deepEqual([page.qty, page.lots.length], [0, 0]);
  assert.equal(inventory.sheet(30).rows.length, 0, 'out of the 4-5 sheet');
  assert.equal(inventory.purchases('2026-11-01', '2026-11-30').purchases.length, 0, "out of Costs' purchases");
  inventory.restoreMove(lot.id, {}, LIM);
  assert.equal(db.stockMove(out.id).voidedAt, null, 'its throw-out back too');
  assert.deepEqual(db.changesOf('move', lot.id).map((c) => c.action), ['add', 'void', 'restore']);
});

test('a count logs each of its moves; an edit logs before and after; a batch move is never voided here', (t) => {
  const { db, inventory, bleach } = setup(t);
  const p = inventory.purchase({ itemId: bleach.id, qty: 5, total: 25 }, LIM);
  const { moves } = inventory.count({ worker: 'Sara', counts: [{ itemId: bleach.id, qty: 4.5 }] }, SARA);
  assert.deepEqual(db.changesOf('move', moves[0].id).map((c) => [c.action, c.by, c.after.itemName]), [['add', 'Sara', 'Bleach']]);
  inventory.editMove(p.id, { total: 27 }, LIM);
  const [, edit] = db.changesOf('move', p.id);
  assert.deepEqual([edit.action, edit.before.total, edit.after.total], ['edit', 25, 27]);
  assert.equal(inventory.item(bleach.id).moves.find((m) => m.id === p.id).edits, 1);
  const raw = db.insertStockMoves([{ itemId: bleach.id, at: NOW, qty: 2, refKind: 'batch', refId: 3 }]);
  refused(() => inventory.voidMove(raw[0].id, { reason: 'Not ours' }, LIM), 409, 'Change it in Batches');
});

// Costs and Data integrity (spec 2026-11-12-data-integrity-design.md 3 to 5): every write logged with who; void, not delete
// (a one-off, a monthly item, an equipment item), out of every figure, listed struck; restore; a one-off like another asks
// once (G5). Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createCropApi } from '../server/crop-api.js';
import { createCosts, CostError } from '../server/costs.js';
import { fixedZone } from '../server/usage.js';
import { AskError } from '../server/asks.js';

const NOW = Date.UTC(2026, 10, 10, 4); // 10 Nov 2026 12:00 on the farm
const OCT1 = Date.UTC(2026, 9, 1, 1);
const LIM = { name: 'Lim', role: 'owner' };
const plain = (s) => s.replace(/\u00a0/g, ' ');

function setup(t) {
  const db = openDb(':memory:');
  let clock = OCT1;
  const now = () => clock;
  const one = db.createRoom({ name: 'Container 4', length: 6, width: 2.4, height: 2.4, trhAddress: 1 }, clock).id;
  createCropApi({ db, now }).put(one, { crops: [{ crop: 'oyster', blocks: 500 }] });
  clock = NOW;
  const costs = createCosts({ db, now: () => clock, zone: fixedZone(480) });
  t.after(async () => { costs.stop(); await costs.warmed(); db.close(); });
  // the month's view once its usage days are worked out (none recorded: no energy), so its figures are whole
  const view = async (month) => { costs.monthView({ month }); await costs.warmed(); return costs.monthView({ month }); };
  return { db, costs, one, view, tick: (ms) => { clock += ms; } };
}
const refused = (fn, status, field) => assert.throws(fn, (e) => e instanceof CostError && e.status === status && e.field === field);

test('G5: a second Packaging RM 45.00 on 10 Nov for the farm asks once; another day, category or place does not', (t) => {
  const { db, costs, one, tick } = setup(t);
  tick(-40 * 60_000); // 11:20
  costs.add({ date: '2026-11-10', category: 'packaging', amount: 45 }, LIM);
  tick(40 * 60_000);
  try {
    costs.add({ date: '2026-11-10', category: 'packaging', amount: 45 }, LIM);
    assert.fail('no ask');
  } catch (e) {
    assert.ok(e instanceof AskError, e.message);
    assert.deepEqual(e.asks.map((a) => [a.kind, a.field]), [['duplicate', 'amount']]);
    assert.equal(plain(e.asks[0].text), 'A Packaging cost of RM 45.00 on 10 Nov is already recorded (by Lim at 11:20). Is this another one?');
  }
  costs.add({ date: '2026-11-10', category: 'packaging', amount: 45, confirmed: ['duplicate'] }, LIM);
  costs.add({ date: '2026-11-09', category: 'packaging', amount: 45 }, LIM);
  costs.add({ date: '2026-11-10', category: 'rent', amount: 45 }, LIM);
  costs.add({ date: '2026-11-10', category: 'packaging', amount: 45, roomId: one }, LIM);
  const rent = costs.add({ date: '2026-11-10', category: 'rent', amount: 45, repeat: 'monthly', confirmed: [] }, LIM);
  assert.equal(rent.repeat, 'monthly', 'a monthly item is not asked about');
});

test('a one-off voided: listed struck, out of the month and its run, the edit refused; restored, counted again; each step logged', async (t) => {
  const { db, costs, one, view } = setup(t);
  const fan = costs.add({ date: '2026-11-03', category: 'repairs', amount: 120, roomId: one, note: 'Fan belt' }, LIM);
  const before = (await view('2026-11'));
  assert.equal(before.tiles.costs, 120);
  refused(() => costs.remove(fan.id), 409, undefined);
  refused(() => costs.voidCost(fan.id, { reason: 'x' }, LIM), 400, 'reason');
  const v = costs.voidCost(fan.id, { reason: 'Entered on the wrong farm' }, LIM);
  assert.deepEqual(v.voided, { at: NOW, by: 'Lim', reason: 'Entered on the wrong farm' });
  const after = (await view('2026-11'));
  assert.equal(after.tiles.costs, 0);
  assert.equal(after.runs[0].costs, 0);
  assert.deepEqual(after.entries.map((e) => [e.costId, e.voided?.reason]), [[fan.id, 'Entered on the wrong farm']]);
  refused(() => costs.edit(fan.id, { amount: 1 }, LIM), 409, undefined);
  costs.restoreCost(fan.id, {}, LIM);
  assert.equal((await view('2026-11')).tiles.costs, 120);
  assert.deepEqual(db.changesOf('cost', fan.id).map((c) => [c.action, c.by]), [['add', 'Lim'], ['void', 'Lim'], ['restore', 'Lim']]);
  assert.equal(db.changesOf('cost', fan.id)[0].after.roomName, 'Container 4');
});

test('a monthly item: edit, change from a month, stop and void logged; voided, every month of it goes', async (t) => {
  const { db, costs, view } = setup(t);
  const rent = costs.add({ date: '2026-10-05', category: 'rent', amount: 1500, repeat: 'monthly' }, LIM);
  costs.edit(rent.id, { note: 'Shed land' }, LIM);
  const { started } = costs.change(rent.id, { from: '2026-11', amount: 1600 }, LIM);
  costs.stopItem(started.id, { after: '2026-11' }, LIM);
  assert.deepEqual(db.changesOf('cost', rent.id).map((c) => c.action), ['add', 'edit', 'change']);
  assert.deepEqual(db.changesOf('cost', started.id).map((c) => c.action), ['add', 'stop']);
  assert.equal(db.changesOf('cost', rent.id)[2].after.amount, 1600);
  assert.equal((await view('2026-10')).tiles.costs, 1500);
  costs.voidCost(rent.id, { reason: 'The land is the owner\'s' }, LIM);
  assert.equal((await view('2026-10')).tiles.costs, 0, 'October\'s charge went');
  refused(() => costs.change(rent.id, { from: '2026-11', amount: 1 }, LIM), 409, undefined);
  assert.equal((await view('2026-11')).tiles.costs, 1600, 'the new item is its own');
  assert.equal((await view('2026-10')).entries[0].voided.reason, "The land is the owner's");
});

test('an equipment item voided: its write-off goes from every month, listed struck; DELETE refused; logged', async (t) => {
  const { db, costs, one, view } = setup(t);
  const rack = costs.addEquipment({ name: 'Steel rack', roomId: one, part: 'racks', boughtOn: '2026-09-02', amount: 600, lifeMonths: 12 }, LIM);
  assert.equal((await view('2026-10')).tiles.writeOff, 50);
  // September closed on 15 Oct (Data integrity 8.3): the item's write-off reaches it, so a write that moves it asks first
  costs.editEquipment(rack.id, { note: 'Five tiers' }, LIM); // a note alone: no ask
  refused(() => costs.removeEquipment(rack.id), 409, undefined);
  costs.voidEquipment(rack.id, { reason: 'Never delivered', confirmed: ['closed-month'] }, LIM);
  assert.equal((await view('2026-10')).tiles.writeOff, 0);
  assert.deepEqual(db.listEquipment(), [], 'out of the register Economics reads');
  assert.equal(costs.equipment().items[0].voided.reason, 'Never delivered');
  refused(() => costs.editEquipment(rack.id, { amount: 1 }, LIM), 409, undefined);
  costs.restoreEquipment(rack.id, { confirmed: ['closed-month'] }, LIM);
  assert.equal((await view('2026-10')).tiles.writeOff, 50);
  assert.deepEqual(db.changesOf('equipment', rack.id).map((c) => c.action), ['add', 'edit', 'void', 'restore']);
  assert.equal(costs.equipment().items[0].edits, 1);
});

test('a cost duplicate is one entered by hand: a Batches or Inventory row of the same figures is not asked about', async () => {
  const { costDuplicateAsks } = await import('../server/integrity-math.js');
  const c = { date: '2026-11-10', category: 'packaging', amount: 45, roomId: null };
  const twin = { ...c, id: 3, createdAt: NOW, by: 'Lim', repeat: null };
  assert.equal(costDuplicateAsks(c, [{ ...twin, sourceKind: 'manual' }], { label: 'Packaging' }).length, 1);
  assert.deepEqual(costDuplicateAsks(c, [{ ...twin, sourceKind: 'purchase' }], { label: 'Packaging' }), []);
  assert.deepEqual(costDuplicateAsks(c, [{ ...twin, sourceKind: 'batch' }], { label: 'Packaging' }), []);
});

// The costs service (server/costs.js, spec 2026-11-05-costs-design.md 2 and 5): its checks and writes, the month view and the
// contract's summary from fixtures of Batches, Inventory and Sales. No HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createCropApi } from '../server/crop-api.js';
import { createCosts, CostError } from '../server/costs.js';
import { fixedZone } from '../server/usage.js';
import { add } from './costs-fixtures.js';

mkdirSync('/tmp/costs', { recursive: true });
const NOW = Date.UTC(2026, 10, 15, 4); // 15 Nov 2026 12:00 on the farm's clock
const OCT1 = Date.UTC(2026, 9, 1, 1);
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4 };

// A farm in a file (so a second connection can make the other modules' tables): Container 1 with 100 oyster blocks since
// 1 Oct, Container 2 with none.
function setup(t) {
  const dir = mkdtempSync('/tmp/costs/svc-');
  const file = join(dir, 'farm.db');
  const db = openDb(file);
  let clock = OCT1;
  const now = () => clock;
  const one = db.createRoom({ ...ROOM, trhAddress: 1 }, clock).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, clock).id;
  createCropApi({ db, now }).put(one, { crops: [{ crop: 'oyster', blocks: 100 }] });
  clock = NOW;
  const costs = createCosts({ db, now, zone: fixedZone(480) });
  const changes = [];
  costs.onChange(() => changes.push(1));
  t.after(async () => {
    costs.stop();
    await costs.warmed();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const raw = () => new DatabaseSync(file);
  return { db, costs, one, two, changes, raw, run: db.openRun(one) };
}

function refused(fn, status, message, field) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof CostError, `${err?.constructor?.name}: ${err?.message}`);
    assert.equal(err.status, status);
    if (message !== null) assert.equal(err.message, message);
    assert.equal(err.field, field);
    return true;
  });
}

test('add a one-off: checked, a room cost gets its run, a write tells', (t) => {
  const s = setup(t);
  const made = s.costs.add({ date: '2026-11-03', category: 'repairs', amount: 120.456, roomId: s.one, note: '  Fan belt  ' });
  assert.equal(made.amount, 120.46);
  assert.equal(made.note, 'Fan belt');
  assert.equal(made.runId, s.run.id);
  assert.equal(made.repeat, null);
  assert.equal(s.changes.length, 1);
  const farm = s.costs.add({ date: '2026-11-03', category: 'transport', amount: 30 });
  assert.equal(farm.roomId, null);
  assert.equal(farm.runId, null);
  const empty = s.costs.add({ date: '2026-11-03', category: 'repairs', amount: 5, roomId: s.two });
  assert.equal(empty.runId, null, 'no run open then');
});

test('the checks', (t) => {
  const s = setup(t);
  const ok = { date: '2026-11-03', category: 'repairs', amount: 10 };
  refused(() => s.costs.add(null), 400, 'Body must be a JSON object', undefined);
  refused(() => s.costs.add({ ...ok, date: '2026-11-16' }), 400, 'Pick a date up to today', 'date');
  refused(() => s.costs.add({ ...ok, date: '2026-02-30' }), 400, 'Pick a date up to today', 'date');
  refused(() => s.costs.add({ ...ok, category: 'equipment' }), 400, 'Pick a category', 'category');
  refused(() => s.costs.add({ ...ok, amount: 0 }), 400, 'Enter an amount over RM 0, up to RM 1,000,000', 'amount');
  refused(() => s.costs.add({ ...ok, amount: '10' }), 400, 'Enter an amount over RM 0, up to RM 1,000,000', 'amount');
  refused(() => s.costs.add({ ...ok, roomId: 999 }), 400, 'That container no longer exists', 'roomId');
  refused(() => s.costs.add({ ...ok, note: 'x'.repeat(201) }), 400, 'The note must be at most 200 characters', 'note');
  refused(() => s.costs.add({ ...ok, repeat: 'weekly' }), 400, 'Repeat must be monthly or none', 'repeat');
  refused(() => s.costs.add({ ...ok, category: 'labour' }), 400, 'Pick who was paid', 'worker');
  refused(() => s.costs.add({ ...ok, category: 'labour', worker: '  ' }), 400, 'Pick who was paid', 'worker');
  refused(() => s.costs.add({ ...ok, category: 'utilities' }), 400, 'Pick electricity, water or other', 'utility');
  const bill = { ...ok, category: 'utilities', utility: 'electricity' };
  refused(() => s.costs.add({ ...bill, repeat: 'monthly' }), 400, 'An electricity or water bill is entered each month', 'repeat');
  refused(() => s.costs.add({ ...bill, roomId: s.one }), 400, 'A bill is the whole farm’s', 'roomId');
  refused(() => s.costs.add({ ...bill, periodFrom: '2026-09-01', periodTo: '2026-11-03' }), 400, 'Pick the last day the bill covers, up to 62 days after the first', 'periodTo');
  refused(() => s.costs.add({ ...bill, periodFrom: '2026-08-02', periodTo: '2026-08-31' }), 400, 'Pick a first day up to 92 days before the bill’s date', 'periodFrom');
  refused(() => s.costs.add({ ...bill, periodFrom: '2026-11-20', periodTo: '2026-12-05' }), 400, 'Pick a last day up to 31 days after the bill’s date', 'periodTo');
  assert.equal(s.costs.add({ ...bill, periodFrom: '2026-08-03', periodTo: '2026-09-02' }).periodFrom, '2026-08-03', '92 days before');
  assert.equal(s.costs.add({ ...bill, periodFrom: '2026-11-04', periodTo: '2026-12-04' }).periodTo, '2026-12-04', '31 days after');
  const made = s.costs.add(bill);
  assert.deepEqual([made.periodFrom, made.periodTo], ['2026-11-01', '2026-11-30'], 'default: the bill date\'s month');
  const wage = s.costs.add({ ...ok, category: 'labour', worker: 'Ali', repeat: 'monthly' });
  assert.equal(wage.worker, 'Ali');
  assert.equal(wage.runId, null, 'a monthly item finds its run on read');
});

test('edit, delete, change from a month and stop', (t) => {
  const s = setup(t);
  const one = s.costs.add({ date: '2026-11-03', category: 'repairs', amount: 10 });
  assert.equal(s.costs.edit(one.id, { amount: 12 }).amount, 12, 'a field left out keeps its value');
  refused(() => s.costs.edit(999, { amount: 1 }), 404, 'Cost not found', undefined);
  s.costs.remove(one.id);
  refused(() => s.costs.remove(one.id), 404, 'Cost not found', undefined);

  const rent = s.costs.add({ date: '2026-08-31', category: 'rent', amount: 1500, repeat: 'monthly' });
  refused(() => s.costs.change(rent.id, { from: '2026-12', amount: 1600 }), 400, 'Pick a month from Aug 2026 to Nov 2026', 'from');
  refused(() => s.costs.change(rent.id, { from: '2026-07', amount: 1600 }), 400, 'Pick a month from Aug 2026 to Nov 2026', 'from');
  const same = s.costs.change(rent.id, { from: '2026-08', amount: 1550 });
  assert.equal(same.ended, null, 'from its first month: edited in place');
  assert.equal(same.started.amount, 1550);
  const { ended, started } = s.costs.change(rent.id, { from: '2026-10', amount: 1600 });
  assert.equal(ended.repeatUntil, '2026-09');
  assert.equal(started.date, '2026-10-31');
  assert.equal(started.repeat, 'monthly');
  assert.equal(started.amount, 1600);
  refused(() => s.costs.change(one.id + 1000, { from: '2026-10', amount: 1 }), 404, 'Cost not found', undefined);
  const plain = s.costs.add({ date: '2026-11-03', category: 'repairs', amount: 10 });
  refused(() => s.costs.change(plain.id, { from: '2026-11', amount: 1 }), 400, 'This cost is not a monthly item', undefined);
  refused(() => s.costs.stopItem(plain.id, { after: '2026-11' }), 400, 'This cost is not a monthly item', undefined);
  refused(() => s.costs.stopItem(started.id, { after: '2026-09' }), 400, 'Pick a month from Oct 2026 to Nov 2026', 'after');
  assert.equal(s.costs.stopItem(started.id, { after: '2026-11' }).repeatUntil, '2026-11');
  assert.equal(s.changes.length, 8, 'each of the 8 writes told once, the refusals none');
});

test('the month view: pending energy first, then the figures once the usage days are worked out', async (t) => {
  const s = setup(t);
  s.costs.add({ date: '2026-11-01', category: 'rent', amount: 300, repeat: 'monthly' });
  s.costs.add({ date: '2026-11-03', category: 'repairs', amount: 40, roomId: s.one });
  const first = s.costs.monthView({});
  assert.equal(first.month, '2026-11');
  assert.equal(first.pending, true, 'a cold room: worked out in the background');
  assert.equal(first.tiles.profit, null);
  await s.costs.warmed();
  assert.equal(s.changes.length, 4, 'two adds and a warm done a room');
  const view = s.costs.monthView({ month: '2026-11' });
  assert.equal(view.pending, false);
  assert.equal(view.tiles.costs, 340, 'no readings: 0 kWh');
  assert.equal(view.tiles.income, 0);
  assert.equal(view.tiles.profit, -340);
  assert.deepEqual(view.entries.map((e) => [e.date, e.category, e.roomName]), [['2026-11-03', 'repairs', 'Container 1'], ['2026-11-01', 'rent', null]]);
  assert.deepEqual(view.repeating.map((c) => c.category), ['rent']);
  assert.equal(view.runs.length, 1);
  assert.equal(view.runs[0].roomName, 'Container 1');
  assert.equal(view.runs[0].parts.own, 40);
  assert.equal(view.runs[0].parts.shared, 300, 'Nov rent, all its: the only run');
  assert.equal(view.last12.at(-1).month, '2026-11');
  assert.ok(view.last12.every((m) => m.month >= view.first));
  assert.ok(view.notes.some((n) => n.kind === 'no-sales'));
});

test('the month view reads Batches, Inventory and Sales when their tables exist', async (t) => {
  const s = setup(t);
  const raw = s.raw();
  const at = (date) => Date.parse(`${date}T04:00:00Z`);
  add(raw, {
    batches: [{ id: 1, run_id: s.run.id, room_id: s.one, crop: 'oyster', received_at: at('2026-11-02'), blocks: 100, price_per_block: 2.5 }],
    items: [{ id: 1, name: 'PP bags', kind: 'packaging', unit: 'count' }],
    moves: [
      { id: 1, item_id: 1, at: at('2026-11-04'), qty: 1000, unit_cost: 0.05, ref_kind: 'purchase' },
      { id: 2, item_id: 1, at: at('2026-11-05'), qty: -200, ref_kind: 'use' },
    ],
    sales: [{ id: 1, sold_at: at('2026-11-10'), crop: 'oyster', kg: 20, price_kg: 15, total: 300, buyer: 'Pasar', room_id: s.one, run_id: s.run.id }],
  });
  raw.close();
  s.costs.monthView({});
  await s.costs.warmed();
  const view = s.costs.monthView({});
  assert.equal(view.tiles.costs, 260, 'blocks 250 + the 200 bags used 10 (Money truth: the 1,000 bought are not a cost)');
  assert.equal(view.tiles.income, 300);
  assert.equal(view.tiles.profit, 40);
  assert.deepEqual(view.byCategory.map((c) => [c.key, c.source, c.amount]), [['blocks-batches', 'batches', 250], ['inventory-packaging', 'inventory', 10]]);
  assert.deepEqual(view.bought, {
    total: 300, lines: [{ key: 'blocks', label: 'Blocks', amount: 250 }, { key: 'inventory-packaging', label: 'Packaging', amount: 50 }], unpriced: [],
  }, 'what was paid for stock this month');
  assert.equal(view.runs[0].income, 300);
  assert.equal(view.runs[0].profitPerKg, 2);
});

test('the month query and the summary', async (t) => {
  const s = setup(t);
  assert.throws(() => s.costs.monthView({ month: '2026-12' }), (e) => e.status === 400 && e.field === 'month' && e.message === 'Pick a month from Oct 2025 to Nov 2026');
  assert.throws(() => s.costs.monthView({ month: '2025-09' }), (e) => e.status === 400);
  assert.throws(() => s.costs.monthView({ month: 'nope' }), (e) => e.status === 400);
  s.costs.add({ date: '2026-11-01', category: 'rent', amount: 300 });
  const cold = s.costs.summary({ run: s.run.id });
  assert.deepEqual([cold.total, cold.energy, cold.water], [null, null, null], 'the run pending: no partial figure');
  await s.costs.warmed();
  assert.deepEqual(s.costs.summary({}), {
    total: 300, byCategory: [{ category: 'rent', amount: 300 }], energy: 0, water: null, income: 0, profit: -300, profitPerKg: null,
  }, 'no water price: water null');
  const ran = s.costs.summary({ run: s.run.id });
  assert.deepEqual([ran.energy, ran.water], [0, null]);
  assert.equal(s.costs.summary({ from: '2026-11-02', to: '2026-11-15' }).total, 0);
  assert.equal(s.costs.summary({ run: s.run.id }).total, 300);
  assert.throws(() => s.costs.summary({ run: 999 }), (e) => e.status === 404 && e.message === 'Run not found');
  assert.throws(() => s.costs.summary({ from: '2026-11-10', to: '2026-11-01' }), (e) => e.status === 400 && e.field === 'to');
  assert.throws(() => s.costs.summary({ from: 'x' }), (e) => e.status === 400 && e.field === 'from');
});

test('the month view says incomplete when a batch has no price', async (t) => {
  const s = setup(t);
  const raw = s.raw();
  add(raw, { batches: [{ id: 1, run_id: s.run.id, room_id: s.one, crop: 'oyster', received_at: Date.parse('2026-11-02T04:00:00Z'), blocks: 100, price_per_block: null }] });
  raw.close();
  s.costs.monthView({});
  await s.costs.warmed();
  assert.equal(s.costs.monthView({}).tiles.incomplete, true);
});

test('a Change from this month may store a day later this month, and the item stays editable', (t) => {
  const s = setup(t);
  const rent = s.costs.add({ date: '2026-08-31', category: 'rent', amount: 1500, repeat: 'monthly' });
  const { started } = s.costs.change(rent.id, { from: '2026-11', amount: 1600 });
  assert.equal(started.date, '2026-11-30', 'the clamped day: 31 → 30 in a 30-day month, a day after today (15 Nov)');
  assert.equal(s.costs.change(started.id, { from: '2026-11', amount: 1700 }).started.amount, 1700, 'in place again');
  assert.equal(s.costs.edit(started.id, { note: 'Lot 7' }).note, 'Lot 7');
  refused(() => s.costs.edit(started.id, { date: '2026-11-29' }), 400, 'Pick a date up to today', 'date');
  refused(() => s.costs.add({ date: '2026-11-30', category: 'rent', amount: 1 }), 400, 'Pick a date up to today', 'date');
});

test('a Stop only shortens', (t) => {
  const s = setup(t);
  const rent = s.costs.add({ date: '2026-08-31', category: 'rent', amount: 1500, repeat: 'monthly' });
  s.costs.change(rent.id, { from: '2026-11', amount: 1600 });
  refused(() => s.costs.stopItem(rent.id, { after: '2026-11' }), 400, 'Pick a month from Aug 2026 to Oct 2026', 'after');
  refused(() => s.costs.change(rent.id, { from: '2026-11', amount: 1 }), 400, 'Pick a month from Aug 2026 to Oct 2026', 'from');
  assert.equal(s.costs.stopItem(rent.id, { after: '2026-09' }).repeatUntil, '2026-09');
});

test('the worker is checked only when it changes or the cost becomes labour', (t) => {
  const s = setup(t);
  s.db.setWorkers([{ name: 'Ali', active: true }]);
  const one = s.costs.add({ date: '2026-11-03', category: 'labour', amount: 50, worker: 'Ali' });
  const wage = s.costs.add({ date: '2026-09-01', category: 'labour', amount: 1000, worker: 'Ali', repeat: 'monthly' });
  s.db.setWorkers([...s.db.listWorkers().map((w) => ({ ...w, active: false })), { name: 'Bob', active: true }]);
  assert.equal(s.costs.edit(one.id, { note: 'Harvest' }).worker, 'Ali', 'an inactive worker keeps their past cost');
  assert.equal(s.costs.change(wage.id, { from: '2026-10', amount: 1100 }).started.worker, 'Ali');
  refused(() => s.costs.edit(one.id, { worker: 'Zed' }), 400, 'That name is not on the workers list', 'worker');
});

test('the checks of a Change, an edit and the date\'s lower bound', (t) => {
  const s = setup(t);
  const rent = s.costs.add({ date: '2026-08-31', category: 'rent', amount: 1500, repeat: 'monthly' });
  refused(() => s.costs.change(rent.id, { from: '2026-10' }), 400, 'Enter an amount over RM 0, up to RM 1,000,000', 'amount');
  refused(() => s.costs.edit(rent.id, { repeat: null }), 400, 'Repeat changes through Change or Stop', 'repeat');
  const plain = s.costs.add({ date: '2026-11-03', category: 'repairs', amount: 10 });
  refused(() => s.costs.edit(plain.id, { repeat: 'monthly' }), 400, 'Repeat changes through Change or Stop', 'repeat');
  assert.equal(s.costs.edit(plain.id, { repeat: null, amount: 11 }).amount, 11, 'the stored repeat given again is fine');
  refused(() => s.costs.add({ date: '2025-09-30', category: 'repairs', amount: 1 }), 400, 'Pick a date from 1 Oct 2025 to today', 'date');
  assert.equal(s.costs.add({ date: '2025-10-01', category: 'repairs', amount: 1 }).date, '2025-10-01');
  refused(() => s.costs.edit(plain.id, { date: '2025-09-30' }), 400, 'Pick a date from 1 Oct 2025 to today', 'date');
});

test('a one-off finds its run again when its date moves; a category switch clears the worker and the period', (t) => {
  const s = setup(t);
  const early = s.costs.add({ date: '2026-09-20', category: 'repairs', amount: 5, roomId: s.one });
  assert.equal(early.runId, null, 'before the run');
  assert.equal(s.costs.edit(early.id, { date: '2026-11-03' }).runId, s.run.id);
  assert.equal(s.costs.edit(early.id, { date: '2026-09-21' }).runId, null);
  const pay = s.costs.add({ date: '2026-11-03', category: 'labour', amount: 50, worker: 'Ali' });
  const swapped = s.costs.edit(pay.id, { category: 'repairs' });
  assert.equal(swapped.worker, null);
  const bill = s.costs.add({ date: '2026-11-03', category: 'utilities', utility: 'electricity', amount: 80 });
  const other = s.costs.edit(bill.id, { category: 'transport' });
  assert.deepEqual([other.utility, other.periodFrom, other.periodTo], [null, null, null]);
});

test('a sale at 23:30 farm time on a range\'s first day counts; an explicit past month', async (t) => {
  const s = setup(t);
  const raw = s.raw();
  add(raw, {
    sales: [
      { id: 1, sold_at: Date.UTC(2026, 10, 10, 15, 30), crop: 'oyster', kg: 20, price_kg: 15, total: 300, buyer: 'Pasar', room_id: s.one, run_id: s.run.id },
      { id: 2, sold_at: Date.UTC(2026, 10, 9, 15, 30), crop: 'oyster', kg: 10, price_kg: 15, total: 150, buyer: 'Pasar', room_id: s.one, run_id: s.run.id },
    ],
  });
  raw.close();
  s.costs.summary({ from: '2026-11-10' });
  await s.costs.warmed();
  assert.equal(s.costs.summary({ from: '2026-11-10', to: '2026-11-15' }).income, 300, '23:30 on the 10th is the 10th, not the 11th');
  s.costs.add({ date: '2026-10-05', category: 'repairs', amount: 40 });
  const oct = s.costs.monthView({ month: '2026-10' });
  assert.equal(oct.month, '2026-10');
  assert.deepEqual(oct.entries.map((e) => e.date), ['2026-10-05']);
  assert.equal(oct.last12.at(-1).month, '2026-10');
  assert.equal(oct.runs.length, 1, 'the run open through October');
});

test('a bill in Entries carries what it adds: the unmeasured part, null while the energy is worked out', async (t) => {
  const s = setup(t);
  const bill = s.costs.add({ date: '2026-11-03', category: 'utilities', utility: 'electricity', amount: 80 });
  const water = s.costs.add({ date: '2026-11-04', category: 'utilities', utility: 'water', amount: 50 });
  s.costs.add({ date: '2026-11-05', category: 'repairs', amount: 10 });
  const cold = s.costs.monthView({});
  assert.deepEqual(cold.entries.find((e) => e.costId === bill.id).topUp, { amount: null, month: '2026-11' }, 'pending: not known yet');
  await s.costs.warmed();
  const view = s.costs.monthView({});
  const by = (id) => view.entries.find((e) => e.costId === id);
  assert.deepEqual(by(bill.id).topUp, { amount: 80, month: '2026-11' }, 'no readings: all of it unmeasured');
  assert.deepEqual(by(water.id).topUp, { amount: 50, month: '2026-11' }, 'no water price: the water bill counts in full');
  assert.equal(view.entries.find((e) => e.category === 'repairs').topUp, undefined, 'only a bill');
});

test('a bill entered in November for October: listed in November, its top-up in October', async (t) => {
  const s = setup(t);
  const bill = s.costs.add({ date: '2026-11-03', category: 'utilities', utility: 'electricity', amount: 80, periodFrom: '2026-10-01', periodTo: '2026-10-31' });
  s.costs.monthView({});
  await s.costs.warmed();
  const nov = s.costs.monthView({});
  assert.deepEqual(nov.entries.find((e) => e.costId === bill.id).topUp, { amount: 80, month: '2026-10' });
  assert.equal(nov.tiles.costs, 0, 'not in November');
  const oct = s.costs.monthView({ month: '2026-10' });
  assert.equal(oct.entries.length, 0, 'listed in the month of its date');
  assert.equal(oct.tiles.costs, 80);
});

test('blocks received before their run starts count in the run: the month view and the summary', async (t) => {
  const s = setup(t);
  const raw = s.raw();
  add(raw, { batches: [{ id: 1, run_id: s.run.id, room_id: s.one, crop: 'oyster', received_at: Date.parse('2026-09-20T04:00:00Z'), blocks: 100, price_per_block: 2.5 }] });
  raw.close();
  s.costs.monthView({});
  s.costs.summary({ run: s.run.id });
  await s.costs.warmed();
  const view = s.costs.monthView({});
  assert.equal(view.runs[0].parts.blocks, 250, 'received 20 Sep, the run from 1 Oct');
  assert.equal(s.costs.monthView({ month: '2026-10' }).runs[0].parts.blocks, 250);
  const sum = s.costs.summary({ run: s.run.id });
  assert.deepEqual(sum.byCategory, [{ category: 'blocks', amount: 250 }]);
  assert.equal(sum.total, 250);
});

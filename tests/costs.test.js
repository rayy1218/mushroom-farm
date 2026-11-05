// The costs service (server/costs.js, spec 2026-11-05-costs-design.md 2 and 5): its checks and writes, the month view and the
// contract's summary from fixtures of Batches, Inventory and Sales. No HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createCropApi } from '../server/crop-api.js';
import { createCosts, CostError } from '../server/costs.js';
import { fixedZone } from '../server/usage.js';
import { add } from './costs-fixtures.js';

mkdirSync('/tmp/costs', { recursive: true });
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15, 4); // 15 Nov 2026 12:00 on the farm's clock
const OCT1 = Date.UTC(2026, 9, 1, 1);
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4 };

// A farm in a file (so a second connection can make the other modules' tables): Container 1 with 100 oyster blocks since
// 1 Oct, Container 2 with none.
function setup(t) {
  const file = join(mkdtempSync('/tmp/costs/svc-'), 'farm.db');
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
  });
  const raw = () => new DatabaseSync(file);
  return { db, costs, one, two, changes, raw, run: db.openRun(one), set: (ms) => { clock = ms; } };
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
  refused(() => s.costs.add({ ...ok, amount: 0 }), 400, 'RM must be a number over 0 up to 1,000,000', 'amount');
  refused(() => s.costs.add({ ...ok, amount: '10' }), 400, 'RM must be a number over 0 up to 1,000,000', 'amount');
  refused(() => s.costs.add({ ...ok, roomId: 999 }), 400, 'That container no longer exists', 'roomId');
  refused(() => s.costs.add({ ...ok, note: 'x'.repeat(201) }), 400, 'The note must be at most 200 characters', 'note');
  refused(() => s.costs.add({ ...ok, repeat: 'weekly' }), 400, 'Repeat must be monthly or none', 'repeat');
  refused(() => s.costs.add({ ...ok, category: 'labour' }), 400, 'Pick who did it', 'worker');
  refused(() => s.costs.add({ ...ok, category: 'utilities' }), 400, 'Pick electricity, water or other', 'utility');
  const bill = { ...ok, category: 'utilities', utility: 'electricity' };
  refused(() => s.costs.add({ ...bill, repeat: 'monthly' }), 400, 'An electricity or water bill is entered each month', 'repeat');
  refused(() => s.costs.add({ ...bill, roomId: s.one }), 400, 'A bill is the whole farm’s', 'roomId');
  refused(() => s.costs.add({ ...bill, periodFrom: '2026-09-01', periodTo: '2026-11-03' }), 400, 'Pick the last day the bill covers, up to 62 days after the first', 'periodTo');
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
  refused(() => s.costs.stop(plain.id, { after: '2026-11' }), 400, 'This cost is not a monthly item', undefined);
  refused(() => s.costs.stop(started.id, { after: '2026-09' }), 400, 'Pick a month from Oct 2026 to Nov 2026', 'after');
  assert.equal(s.costs.stop(started.id, { after: '2026-11' }).repeatUntil, '2026-11');
  assert.ok(s.changes.length >= 6);
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
  assert.ok(s.changes.length >= 3, 'the warm done tells');
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
    moves: [{ id: 1, item_id: 1, at: at('2026-11-04'), qty: 1000, unit_cost: 0.05, ref_kind: 'purchase' }],
    sales: [{ id: 1, sold_at: at('2026-11-10'), crop: 'oyster', kg: 20, price_kg: 15, total: 300, buyer: 'Pasar', room_id: s.one, run_id: s.run.id }],
  });
  raw.close();
  s.costs.monthView({});
  await s.costs.warmed();
  const view = s.costs.monthView({});
  assert.equal(view.tiles.costs, 300, 'blocks 250 + bags 50');
  assert.equal(view.tiles.income, 300);
  assert.equal(view.tiles.profit, 0);
  assert.deepEqual(view.byCategory.map((c) => [c.key, c.source, c.amount]), [['blocks-batches', 'batches', 250], ['inventory-packaging', 'inventory', 50]]);
  assert.equal(view.runs[0].income, 300);
  assert.equal(view.runs[0].profitPerKg, 0);
});

test('the month query and the summary', async (t) => {
  const s = setup(t);
  assert.throws(() => s.costs.monthView({ month: '2026-12' }), (e) => e.status === 400 && e.field === 'month' && e.message === 'Pick a month from Oct 2025 to Nov 2026');
  assert.throws(() => s.costs.monthView({ month: '2025-09' }), (e) => e.status === 400);
  assert.throws(() => s.costs.monthView({ month: 'nope' }), (e) => e.status === 400);
  s.costs.add({ date: '2026-11-01', category: 'rent', amount: 300 });
  s.costs.monthView({});
  await s.costs.warmed();
  assert.deepEqual(s.costs.summary({}), {
    total: 300, byCategory: [{ category: 'rent', amount: 300 }], energy: 0, water: 0, income: 0, profit: -300, profitPerKg: null,
  });
  assert.equal(s.costs.summary({ from: '2026-11-02', to: '2026-11-15' }).total, 0);
  assert.equal(s.costs.summary({ run: s.run.id }).total, 300);
  assert.throws(() => s.costs.summary({ run: 999 }), (e) => e.status === 404 && e.message === 'Run not found');
  assert.throws(() => s.costs.summary({ from: '2026-11-10', to: '2026-11-01' }), (e) => e.status === 400 && e.field === 'to');
  assert.throws(() => s.costs.summary({ from: 'x' }), (e) => e.status === 400 && e.field === 'from');
});

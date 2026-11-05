// The Run page's service (server/runs.js, spec 2026-11-05-runs-design.md 3 and 4): a run composed from the real Harvest,
// Batches, Sales and Costs modules on one farm database; the list's order and crop filter, a run's parts, and the edges (a
// mixed run, a run with nothing, the energy still worked out, a deleted room, an unknown run). No HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { createCosts } from '../server/costs.js';
import { createRuns, RunError, LATEST_HARVESTS } from '../server/runs.js';
import { fixedZone } from '../server/usage.js';

mkdirSync('/tmp/runs', { recursive: true });
const DAY = 86_400_000;
const at = (d, h = 12) => Date.UTC(2026, Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // a farm day and hour
const NOW = at('2026-11-15');
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4 };

// Container 1: run A, 600 oyster blocks 1 Oct – 1 Nov (a batch of 600 at RM 2.50, 80 kg picked over two flushes, 40 kg sold
// at RM 12, a RM 120 repair), then run B from 1 Nov, 300 oyster and 100 lion's mane (15 kg picked, 8 kg sold). Container 2:
// run C from 10 Nov, 200 pink oyster blocks and nothing else.
function setup(t) {
  const dir = mkdtempSync('/tmp/runs/svc-');
  const db = openDb(join(dir, 'farm.db'));
  let clock = at('2026-09-28');
  const now = () => clock;
  const zone = fixedZone(480);
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const costs = createCosts({ db, now, zone });
  const runs = createRuns({ db, harvests, batches, sales, costs });
  t.after(async () => {
    harvests.stop();
    costs.stop();
    await Promise.all([harvests.warmed(), costs.warmed()]);
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const program = (roomId, crops, when, change) => db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change, at: when });
  const pick = (roomId, runId, crop, kg, day, flush = 1) => db.insertHarvest({
    roomId, runId, crop, stage: 'fruiting', flush, blocks: 1, kg, pickedAt: at(day), worker: null, taskId: null, at: at(day),
  });
  const one = db.createRoom({ ...ROOM, trhAddress: 1 }, clock).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, clock).id;
  const batch = batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', receivedAt: at('2026-09-28'), blocks: 600, pricePerBlock: 2.5 });
  program(one, [{ crop: 'oyster', blocks: 600 }], at('2026-10-01', 9), 'start');
  const a = db.openRun(one);
  clock = at('2026-10-01', 10);
  batches.place(batch.id, { roomId: one });
  pick(one, a.id, 'oyster', 50, '2026-10-10', 1);
  pick(one, a.id, 'oyster', 30, '2026-10-20', 2);
  clock = at('2026-10-15');
  const buyer = sales.addBuyer({ name: 'Kedai Ah Seng' });
  sales.record({ soldAt: at('2026-10-15'), buyerId: buyer.id, invoiceNo: 'R-1', lines: [{ crop: 'oyster', kg: 40, priceKg: 12, roomId: one }] });
  clock = NOW;
  costs.add({ date: '2026-10-05', category: 'repairs', amount: 120, roomId: one, note: 'Fan belt' });
  program(one, [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 100 }], at('2026-11-01', 9), 'restart');
  const b = db.openRun(one);
  pick(one, b.id, 'oyster', 10, '2026-11-12');
  pick(one, b.id, 'lionsmane', 5, '2026-11-12');
  sales.record({ soldAt: at('2026-11-13'), buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 8, priceKg: 12, roomId: one }] });
  program(two, [{ crop: 'pink', blocks: 200 }], at('2026-11-10', 9), 'start');
  const c = db.openRun(two);
  // the usage days worked out (none recorded: no energy), so Costs' figures are whole
  const warm = async () => {
    runs.list();
    await Promise.all([harvests.warmed(), costs.warmed()]);
  };
  return { db, runs, costs, one, two, a, b, c, pick, warm };
}

test('list: the open runs first, then the ended, each newest started first; a row\'s figures from each module', async (t) => {
  const s = setup(t);
  await s.warm();
  const { runs } = s.runs.list();
  assert.deepEqual(runs.map((r) => r.id), [s.c.id, s.b.id, s.a.id]);
  assert.deepEqual(Object.keys(runs[0]), ['id', 'roomId', 'roomName', 'crops', 'partial', 'startedAt', 'endedAt', 'kg', 'perBlock',
    'income', 'costs', 'profit', 'pending', 'incomplete']);
  const a = runs[2];
  assert.deepEqual([a.roomName, a.startedAt, a.endedAt, a.kg, a.perBlock], ['Container 1', at('2026-10-01', 9), at('2026-11-01', 9), 80, 0.13]);
  const [money] = s.costs.runViews({ run: s.a.id });
  assert.deepEqual([a.income, a.costs, a.profit, a.pending], [480, money.costs, money.profit, false]);
  assert.equal(a.costs, 1620, 'the batch RM 1,500.00 and the repair RM 120.00');
  assert.equal(a.profit, -1140);
  assert.deepEqual(runs[0].crops, [{ crop: 'pink', blocks: 200 }]);
  assert.deepEqual([runs[0].kg, runs[0].income, runs[0].costs, runs[0].profit], [0, 0, 0, 0], 'a run with nothing');
});

test('list: the crop filter; a crop that is not one is refused', async (t) => {
  const s = setup(t);
  assert.deepEqual(s.runs.list({ crop: 'lionsmane' }).runs.map((r) => r.id), [s.b.id]);
  assert.deepEqual(s.runs.list({ crop: 'oyster' }).runs.map((r) => r.id), [s.b.id, s.a.id]);
  assert.deepEqual(s.runs.list({ crop: '' }).runs.length, 3);
  assert.deepEqual(s.runs.list({ crop: 'black' }).runs, []);
  assert.throws(() => s.runs.list({ crop: 'mango' }), (e) => e instanceof RunError && e.status === 400 && e.field === 'crop' && e.message === 'Pick a crop');
});

test('list: the energy still worked out: Costs\' figures null and pending, the yield already there', (t) => {
  const s = setup(t);
  const a = s.runs.list().runs.find((r) => r.id === s.a.id);
  assert.deepEqual([a.kg, a.income, a.costs, a.profit, a.pending], [80, 480, null, null, true]);
});

test('view: an ended run\'s batches, flushes, harvests, sales and costs by kind', async (t) => {
  const s = setup(t);
  await s.warm();
  const v = s.runs.view(s.a.id);
  assert.equal(v.id, s.a.id);
  assert.deepEqual([v.kg, v.perBlock, v.income, v.costs, v.profit, v.kgSold], [80, 0.13, 480, 1620, -1140, 40]);
  assert.equal(v.profitPerKg, -28.5, 'the loss over the 40 kg sold');
  assert.deepEqual(v.batches.map((x) => [x.supplier, x.blocks, x.status]), [['Agro Supplies', 600, 'past']]);
  assert.equal(v.blockCost, 1500);
  assert.deepEqual(v.flushes.map((f) => [f.flush, f.kg]), [[1, 50], [2, 30]]);
  assert.deepEqual(v.harvests.map((h) => h.kg), [30, 50], 'newest pick first');
  assert.equal(v.harvestCount, 2);
  assert.deepEqual([v.sales.kg, v.sales.total], [40, 480]);
  assert.deepEqual(v.sales.lines.map((l) => [l.buyer, l.invoiceNo, l.crop, l.kg, l.priceKg, l.total, l.paidAt]), [['Kedai Ah Seng', 'R-1', 'oyster', 40, 12, 480, null]]);
  assert.equal(v.sales.total, v.income, 'Sales\' total is Costs\' income');
  assert.deepEqual([v.costsByKind.parts.blocks, v.costsByKind.parts.own], [1500, 120]);
  assert.deepEqual(v.costsByKind.byCategory, [{ category: 'blocks', amount: 1500 }, { category: 'repairs', amount: 120 }]);
  assert.ok(Array.isArray(v.costsByKind.notes));
  assert.equal(v.be, null, 'no dry kg for oyster (no block weight, nothing in Settings → Yield)');
  assert.deepEqual(v.missing.dryKg, ['oyster']);
});

test('view: a mixed run gives its yield per crop; a run with nothing gives empty parts', async (t) => {
  const s = setup(t);
  await s.warm();
  const b = s.runs.view(s.b.id);
  assert.deepEqual(b.byCrop.map((c) => [c.crop, c.blocks, c.kg]), [['oyster', 300, 10], ['lionsmane', 100, 5]]);
  assert.deepEqual([b.kg, b.perBlock, b.income], [15, 0.04, 96]);
  const c = s.runs.view(s.c.id);
  assert.deepEqual([c.kg, c.harvestCount, c.flushes, c.batches, c.blockCost, c.sales.lines, c.sales.total], [0, 0, [], [], 0, [], 0]);
  assert.deepEqual([c.income, c.costs, c.profit], [0, 0, 0]);
});

test('view: the latest harvests only, with the count of all', (t) => {
  const s = setup(t);
  for (let i = 1; i <= 10; i++) s.pick(s.two, s.c.id, 'pink', i, '2026-11-14');
  const v = s.runs.view(s.c.id);
  assert.equal(v.harvests.length, LATEST_HARVESTS);
  assert.equal(v.harvestCount, 10);
});

test('view: 404 for a run that is not there; a deleted room\'s runs go with it', (t) => {
  const s = setup(t);
  assert.throws(() => s.runs.view(999), (e) => e instanceof RunError && e.status === 404 && e.message === 'Run not found');
  s.db.deleteRoom(s.two);
  assert.throws(() => s.runs.view(s.c.id), (e) => e.status === 404);
  assert.deepEqual(s.runs.list().runs.map((r) => r.id), [s.b.id, s.a.id]);
});

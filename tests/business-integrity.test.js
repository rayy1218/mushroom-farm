// The Summary and Costs with Data integrity (spec 2026-11-12-data-integrity-design.md 5.3 and 6.2): sales above the harvest
// a Costs note and a Needs-you line (G7); the unsold balance on the Summary. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { createCosts } from '../server/costs.js';
import { createInventory } from '../server/inventory.js';
import { createRuns } from '../server/runs.js';
import { createBusiness } from '../server/business.js';
import { fixedZone } from '../server/usage.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const zone = fixedZone(480);
const LIM = { name: 'Lim', role: 'owner' };
const plain = (s) => s.replace(/ /g, ' ');

test('G7: 2,418.00 kg of abalone sold against 212.00 kg picked: the Costs note and the Summary\'s need; the unsold balance', async (t) => {
  const db = openDb(':memory:');
  let clock = at('2026-10-20');
  const now = () => clock;
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const costs = createCosts({ db, now, zone });
  const inventory = createInventory({ db, now });
  const runs = createRuns({ db, harvests, batches, sales, costs });
  const business = createBusiness({ costs, sales, inventory, batches, runs, zone });
  t.after(async () => { harvests.stop(); costs.stop(); await Promise.all([harvests.warmed(), costs.warmed()]); db.close(); });
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5 }, clock).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'abalone', blocks: 700 }] }, { change: 'start', at: clock });
  const run = db.openRun(room).id;
  for (const [kg, d] of [[112, '2026-11-01'], [100, '2026-11-04']]) {
    db.insertHarvest({ roomId: room, runId: run, crop: 'abalone', stage: 'fruiting', flush: 1, blocks: 700, kg, pickedAt: at(d, 8), worker: null, taskId: null, at: at(d, 8) });
  }
  clock = at('2026-11-10', 14);
  const buyer = sales.addBuyer({ name: 'Kedai Ah Seng' });
  sales.record({ soldAt: at('2026-11-02'), buyerId: buyer.id, lines: [{ crop: 'abalone', kg: 18, priceKg: 16 }] }, LIM);
  sales.record({ soldAt: at('2026-11-10'), buyerId: buyer.id, lines: [{ crop: 'abalone', kg: 2400, priceKg: 16 }], confirmed: ['oversell', 'kg'] }, LIM);
  costs.monthView({});
  await costs.warmed();
  assert.deepEqual(costs.monthView({}).notes.filter((n) => n.kind === 'oversold').map((n) => plain(n.text)),
    ['Abalone oyster: 2,418.00 kg sold or not sold to 10 Nov against 212.00 kg picked. Check the sales.']);
  assert.deepEqual(costs.monthView({ month: '2026-10' }).notes.filter((n) => n.kind === 'oversold'), [], 'October was not over');
  const s = business.summary();
  assert.deepEqual(s.needs.find((n) => n.kind === 'oversold').crops, ['abalone']);
  assert.deepEqual(s.unsold.total, { fresh: 0, past: 0, value: 0 }, 'more sold than picked: nothing left');
});

test('a crop over its harvest through Not sold alone has the note too (no sale of it)', async (t) => {
  const db = openDb(':memory:');
  let clock = at('2026-10-20');
  const now = () => clock;
  const costs = createCosts({ db, now, zone });
  t.after(async () => { costs.stop(); await costs.warmed(); db.close(); });
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5 }, clock).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'pink', blocks: 300 }] }, { change: 'start', at: clock });
  const run = db.openRun(room).id;
  db.insertHarvest({ roomId: room, runId: run, crop: 'pink', stage: 'fruiting', flush: 1, blocks: 300, kg: 20, pickedAt: at('2026-11-02', 8), worker: null, taskId: null, at: at('2026-11-02', 8) });
  clock = at('2026-11-10', 14);
  db.insertNotSold({ at: at('2026-11-05'), crop: 'pink', kg: 40, reason: 'spoiled', roomId: null, runId: null, buyerId: null, note: null, worker: null }, clock);
  costs.monthView({});
  await costs.warmed();
  assert.deepEqual(costs.monthView({}).notes.filter((n) => n.kind === 'oversold').map((n) => plain(n.text)),
    ['Pink oyster: 40.00 kg sold or not sold to 10 Nov against 20.00 kg picked. Check the sales.']);
});

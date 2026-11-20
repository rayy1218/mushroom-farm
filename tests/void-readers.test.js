// Data integrity (spec 2026-11-12-data-integrity-design.md 4.1): a voided record counts in no figure. A made-up farm's
// figures through the real modules (Costs' month and runs, Runs, Inventory, Sales, the Summary) are the same after a sale, a
// harvest, a cost, an equipment item, a purchase and a use are recorded and then voided.

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
const NOW = at('2026-11-10');
const LIM = { name: 'Lim', role: 'owner' };
const WHY = { reason: 'Entered on the wrong farm' };

test('a voided sale, harvest, cost, equipment item, purchase and use leave every figure as it was', async (t) => {
  const db = openDb(':memory:');
  let clock = at('2026-10-20');
  const now = () => clock;
  const zone = fixedZone(480);
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const costs = createCosts({ db, now, zone });
  const inventory = createInventory({ db, now });
  const runs = createRuns({ db, harvests, batches, sales, costs });
  const business = createBusiness({ costs, sales, inventory, batches, runs, zone });
  t.after(async () => { harvests.stop(); costs.stop(); await Promise.all([harvests.warmed(), costs.warmed()]); db.close(); });
  db.setWorkers([{ name: 'Aminah', active: true }]);
  const room = db.createRoom({ name: 'Container 4', length: 12, width: 2.3, height: 2.5, trhAddress: 1 }, clock).id;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'pink', blocks: 400 }] }, { change: 'start', at: clock });
  const bleach = inventory.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' }).id;
  inventory.purchase({ itemId: bleach, qty: 10, total: 42, day: '2026-10-20' }, LIM);
  clock = at('2026-11-02');
  harvests.record(room, { crop: 'pink', kg: 31.5, worker: 'Aminah' }, LIM);
  const buyer = sales.addBuyer({ name: 'Restoran Wong' });
  clock = at('2026-11-03', 14);
  sales.record({ soldAt: at('2026-11-03'), buyerId: buyer.id, lines: [{ crop: 'pink', kg: 12, priceKg: 18, roomId: room }] }, LIM);
  costs.add({ date: '2026-11-03', category: 'transport', amount: 35, roomId: room }, LIM);
  costs.addEquipment({ name: 'Mist fan', roomId: room, part: 'fans', boughtOn: '2026-10-01', amount: 480, lifeMonths: 24 }, LIM);
  clock = NOW;
  const figures = async () => {
    costs.monthView({});
    await Promise.all([costs.warmed(), harvests.warmed()]);
    const nov = costs.monthView({});
    const { stamp, ...harvestTab } = harvests.roomView(room);
    const sale = sales.view({ days: 30 });
    return {
      tiles: nov.tiles, byCategory: nov.byCategory, runs: nov.runs.map((r) => ({ ...r, notes: r.notes.map((n) => n.text) })),
      runList: runs.list(), stock: inventory.list().value, salesTotals: sale.totals, owed: sale.owed.total, byCrop: sale.byCrop,
      summary: (({ month, stock, needs }) => ({ month, stock, needs }))(business.summary()),
      run: { kg: harvestTab.current.kg, be: harvestTab.current.be },
    };
  };
  const before = await figures();

  clock = at('2026-11-04', 14);
  const h = harvests.record(room, { crop: 'pink', kg: 4.4, worker: 'Aminah' }, LIM);
  const d = sales.record({ soldAt: at('2026-11-04'), buyerId: buyer.id, lines: [{ crop: 'pink', kg: 3.2, priceKg: 18, roomId: room }] }, LIM);
  const c = costs.add({ date: '2026-11-04', category: 'packaging', amount: 45 }, LIM);
  const e = costs.addEquipment({ name: 'Second rack', roomId: room, part: 'racks', boughtOn: '2026-10-02', amount: 600, lifeMonths: 12 }, LIM);
  const p = inventory.purchase({ itemId: bleach, qty: 5, total: 25, day: '2026-11-04' }, LIM);
  const u = inventory.use({ itemId: bleach, qty: 2, roomId: room, worker: 'Aminah' }, LIM);
  harvests.voidHarvest(h.id, WHY, LIM);
  sales.voidSale(d.id, WHY, LIM);
  costs.voidCost(c.id, WHY, LIM);
  costs.voidEquipment(e.id, WHY, LIM);
  inventory.voidMove(p.id, WHY, LIM);
  inventory.voidMove(u.id, WHY, LIM);
  clock = NOW;
  assert.deepEqual(await figures(), before);
});

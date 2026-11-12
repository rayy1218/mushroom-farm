// Money truth (spec 2026-11-12-money-truth-design.md) on a made-up farm's numbers, through the real modules: Inventory's
// purchases and their worth, Batches' made blocks, Costs' month and runs, Sales reaching a run, Runs and the Summary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { createCosts } from '../server/costs.js';
import { createInventory } from '../server/inventory.js';
import { createRuns } from '../server/runs.js';
import { fixedZone } from '../server/usage.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // a farm day and hour
const NOW = at('2026-11-12');
const zone = fixedZone(480);

// A made-up farm: Room 1 (lion's mane, 800 bought blocks) and Container 1 (grey oyster, 480 blocks made on 4 Nov from the
// materials bought 21 Sep, put in on 5 Nov); the plastic bags never bought; 8 kg of lion's mane sold for RM 384 with no room.
function madeUpFarm(t) {
  const db = openDb(':memory:');
  let clock = at('2026-09-21');
  const now = () => clock;
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const costs = createCosts({ db, now, zone });
  const inventory = createInventory({ db, now });
  const runs = createRuns({ db, harvests, batches, sales, costs });
  t.after(async () => {
    harvests.stop();
    costs.stop();
    await Promise.all([harvests.warmed(), costs.warmed()]);
    db.close();
  });
  const room1 = db.createRoom({ name: 'Room 1', length: 9, width: 4.5, height: 2.8 }, clock).id;
  const c1 = db.createRoom({ name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 }, clock).id;
  const items = {};
  for (const [name, kind, qty, total] of [['Sawdust', 'other', 1200, 1680], ['Rice bran', 'other', 400, 840], ['Lime', 'other', 80, 72],
    ['Gypsum', 'other', 80, 96], ['Grain spawn', 'spawn', 300, 3300]]) {
    items[name] = inventory.addItem({ name, kind, unit: 'kg' }).id;
    inventory.purchase({ itemId: items[name], qty, total, day: '2026-09-21' });
  }
  items['Plastic bags'] = inventory.addItem({ name: 'Plastic bags', kind: 'bags', unit: 'pcs' }).id;
  clock = at('2026-11-04', 16);
  const start = (room, crop, blocks) => db.setProgram(room, { ...db.getProgram(room), crops: [{ crop, blocks }] }, { change: 'start', at: clock });
  start(room1, 'lionsmane', 800);
  start(c1, 'oyster', 480);
  const lions = batches.receive({ crop: 'lionsmane', supplier: 'Agro Supplies', receivedAt: clock, blocks: 800 });
  const made = batches.mix({
    crop: 'oyster', blocks: 480, mixedAt: clock, inoculatedAt: clock,
    materials: [['sawdust', 'Sawdust', 360.5], ['bran', 'Rice bran', 92.4], ['lime', 'Lime', 4.6], ['gypsum', 'Gypsum', 4.6]]
      .map(([item, name, qty]) => ({ item, qty, unit: 'kg', stockItemId: items[name] }))
      .concat([{ item: 'bags', qty: 480, unit: 'pcs', stockItemId: items['Plastic bags'] }]),
    spawn: { qty: 57.5, unit: 'kg', stockItemId: items['Grain spawn'] },
  });
  clock = at('2026-11-05', 16);
  batches.place(lions.id, { roomId: room1 });
  batches.place(made.id, { roomId: c1 });
  const buyer = sales.addBuyer({ name: 'Kedai Ah Seng' });
  sales.record({ soldAt: at('2026-11-05', 16), buyerId: buyer.id, lines: [{ crop: 'lionsmane', kg: 8, priceKg: 48 }] });
  clock = NOW;
  const warm = async () => {
    costs.monthView({});
    await costs.warmed();
  };
  return { db, batches, sales, costs, inventory, runs, room1, c1, items, made, lions, warm, setClock: (ms) => { clock = ms; } };
}

test('Container 1\'s made blocks charge their RM 1,340.90 of materials to its run, marked "Some costs have no price" (B1)', async (t) => {
  const f = madeUpFarm(t);
  await f.warm();
  const nov = f.costs.monthView({});
  const run = nov.runs.find((r) => r.roomId === f.c1);
  assert.equal(run.parts.blocks, 1340.9);
  assert.equal(run.incomplete, true);
  assert.deepEqual(run.notes.filter((n) => n.kind === 'unpriced-batch').map((n) => n.text), ['Container 1’s blocks of 5 Nov: no price for Plastic bags']);
  assert.equal(f.batches.detail(f.made.id).pricePerBlock, 2.7935);
});

test('stock worth RM 4,647.10; September\'s RM 5,988.00 bought is no cost of September but its cash line (B2)', async (t) => {
  const f = madeUpFarm(t);
  await f.warm();
  assert.deepEqual(f.inventory.list().value, { total: 4647.1, unpriced: ['Plastic bags'] });
  const sep = f.costs.monthView({ month: '2026-09' });
  assert.equal(sep.tiles.costs, 0);
  assert.equal(sep.tiles.profit, 0, 'was −RM 5,988.00');
  assert.equal(sep.bought.total, 5988);
});

test('Room 1\'s RM 384.00 sale with no room reaches its run, the only one growing lion\'s mane (B3); Runs says what is not tied', async (t) => {
  const f = madeUpFarm(t);
  await f.warm();
  const run = f.costs.monthView({}).runs.find((r) => r.roomId === f.room1);
  assert.deepEqual([run.income, run.kgSold], [384, 8], 'it was RM 0.00');
  const list = f.runs.list();
  assert.deepEqual(list.untied, { total: 0, kg: 0, count: 0 });
  const v = f.runs.view(run.id);
  assert.deepEqual(v.sales.lines.map((l) => [l.kg, l.total, l.tie.how]), [[8, 384, 'only']]);
  assert.deepEqual([v.sales.kg, v.sales.total, v.income], [8, 384, 384]);
  const buyer = f.sales.addBuyer({ name: 'Pasar Tani' });
  f.sales.record({ soldAt: at('2026-11-10'), buyerId: buyer.id, lines: [{ crop: 'pink', kg: 2, priceKg: 20 }] });
  assert.deepEqual(f.runs.list().untied, { total: 40, kg: 2, count: 1 }, 'no run grew pink oyster, none picked it');
  assert.deepEqual(f.runs.list({ crop: 'lionsmane' }).untied, { total: 0, kg: 0, count: 0 }, 'the crop filter');
});

test('a delivery put into a room takes its own blocks out of stock: stock worth + costs = what was paid (review scenario 2)', async (t) => {
  const f = madeUpFarm(t);
  f.setClock(at('2026-11-06'));
  f.batches.receive({ crop: 'pink', supplier: 'A', receivedAt: at('2026-11-06', 9), blocks: 1000, pricePerBlock: 2 });
  const b = f.batches.receive({ crop: 'pink', supplier: 'B', receivedAt: at('2026-11-06', 10), blocks: 1000, pricePerBlock: 3 });
  f.db.setProgram(f.room1, { ...f.db.getProgram(f.room1), crops: [{ crop: 'lionsmane', blocks: 800 }, { crop: 'pink', blocks: 1000 }] }, { change: 'update', at: at('2026-11-06', 11) });
  f.batches.place(b.id, { roomId: f.room1 });
  f.setClock(NOW);
  const pink = f.inventory.list().items.find((i) => i.name === 'Pink oyster blocks');
  assert.deepEqual([pink.qty, pink.value], [1000, 2000], 'A\'s 1,000 at RM 2 left, not B\'s at RM 3');
  await f.warm();
  const run = f.costs.monthView({}).runs.find((r) => r.roomId === f.room1);
  assert.equal(run.parts.blocks, 3000, 'B\'s 1,000 at RM 3 (the lion\'s mane blocks have no price)');
  assert.equal(pink.value + run.parts.blocks, 5000, 'what was paid for both');
});

test('made blocks in stock are worth their materials at their live price, partial while bags have no price (review scenario 1)', async (t) => {
  const f = madeUpFarm(t);
  const saw = f.inventory.addItem({ name: 'Pine sawdust', kind: 'other', unit: 'kg' }).id;
  f.inventory.purchase({ itemId: saw, qty: 1000, total: 1400, day: '2026-11-01' });
  const bags = f.inventory.addItem({ name: 'PP bags', kind: 'bags', unit: 'pcs' }).id;
  f.setClock(at('2026-11-06', 9));
  f.batches.mix({ crop: 'pink', blocks: 500, mixedAt: at('2026-11-06', 9), inoculatedAt: at('2026-11-06', 9),
    materials: [{ item: 'sawdust', qty: 400, unit: 'kg', stockItemId: saw }, { item: 'bags', qty: 500, unit: 'pcs', stockItemId: bags }] });
  const pinkBlocks = () => f.inventory.list().items.find((i) => i.name === 'Pink oyster blocks');
  assert.deepEqual([pinkBlocks().value, pinkBlocks().unpriced], [560, true], 'the sawdust\'s RM 560, the bags unpriced: not 0');
  f.setClock(at('2026-11-07', 9));
  f.inventory.purchase({ itemId: bags, qty: 1000, total: 100, day: '2026-11-06' }); // entered after the mix, no batch write
  assert.deepEqual([pinkBlocks().value, pinkBlocks().unpriced], [610, false], 'priced at once: 500 × RM 1.22');
  const item = f.inventory.item(pinkBlocks().id);
  assert.deepEqual(item.lots.map((l) => [l.left, l.unitCost, l.value]), [[500, 1.22, 610]]);
});

test('a sale tagged with a room whose run does not grow its crop follows the crop rules: Costs and the run page agree', async (t) => {
  const f = madeUpFarm(t);
  const buyer = f.sales.addBuyer({ name: 'Pasar Tani' });
  f.sales.record({ soldAt: at('2026-11-06'), buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 10, roomId: f.room1 }] });
  await f.warm();
  const runs = f.costs.monthView({}).runs;
  const room1 = runs.find((r) => r.roomId === f.room1);
  const c1 = runs.find((r) => r.roomId === f.c1);
  assert.equal(room1.income, 384, 'Room 1 grows lion\'s mane: the RM 20 of grey oyster is not its income');
  assert.equal(f.runs.view(room1.id).sales.total, 384, 'its run page lists the same');
  assert.equal(c1.income, 20, 'the only run growing grey oyster');
  assert.deepEqual(f.runs.view(c1.id).sales.lines.map((l) => [l.total, l.tie.how]), [[20, 'only']]);
});

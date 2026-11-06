// The Business summary's service (server/business.js, spec 2026-11-06-business-summary-design.md 3 and 4): the real Costs,
// Sales, Inventory, Batches and Runs modules on one farm database; the month's money as Costs gives it, every kind of need
// in its order, the open runs, the empty farm, and a module that fails (only its part goes). No HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { createCosts } from '../server/costs.js';
import { createInventory } from '../server/inventory.js';
import { createRuns } from '../server/runs.js';
import { createBusiness, PARTS, PART_FAILED } from '../server/business.js';
import { fixedZone } from '../server/usage.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // a farm day and hour
const NOW = at('2026-11-15');
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4, trhAddress: 1 };

// The modules on a new farm database at NOW; overrides: stand-ins for some of them (a module that fails).
function setup(t, overrides = {}) {
  const db = openDb(':memory:');
  let clock = NOW;
  const now = () => clock;
  const zone = fixedZone(480);
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const costs = createCosts({ db, now, zone });
  const inventory = createInventory({ db, now });
  const runs = createRuns({ db, harvests, batches, sales, costs });
  const logged = [];
  const business = createBusiness({ costs, sales, inventory, batches, runs, zone, log: (what, err) => logged.push(`${what} ${err.message}`), ...overrides });
  t.after(async () => {
    harvests.stop();
    costs.stop();
    await Promise.all([harvests.warmed(), costs.warmed()]);
    db.close();
  });
  // the usage days worked out (none recorded: no energy), so Costs' figures are whole
  const warm = async () => {
    business.summary();
    await Promise.all([harvests.warmed(), costs.warmed()]);
  };
  return { db, batches, sales, costs, inventory, business, logged, warm, setClock: (ms) => { clock = ms; } };
}

// Container 1's open run since 1 Nov (600 oyster blocks bought 28 Oct at RM 2.50, 20 kg picked), a RM 120 repair in October,
// two unpaid sales, Sawdust used with no purchase (below zero), Grow bags under their level, Lime past its use-by and
// Bleach near it, 400 Pink oyster blocks waiting with no price and 100 oyster blocks being made.
function farm(s) {
  const { db, batches, sales, costs, inventory } = s;
  s.setClock(at('2026-10-01'));
  const room = db.createRoom(ROOM, at('2026-10-01')).id;
  s.setClock(NOW);
  costs.add({ date: '2026-10-05', category: 'repairs', amount: 120, roomId: room, note: 'Fan belt' });
  const bought = batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', receivedAt: at('2026-10-28'), blocks: 600, pricePerBlock: 2.5 });
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'oyster', blocks: 600 }] }, { change: 'start', at: at('2026-11-01', 9) });
  const run = db.openRun(room);
  batches.place(bought.id, { roomId: room });
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 1, kg: 20, pickedAt: at('2026-11-10'), worker: null, taskId: null, at: at('2026-11-10') });
  const kedai = sales.addBuyer({ name: 'Kedai Ah Seng' });
  const pasar = sales.addBuyer({ name: 'Pasar Tani' });
  sales.record({ soldAt: at('2026-11-05'), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 8, priceKg: 12, roomId: room }] });
  sales.record({ soldAt: at('2026-11-12'), buyerId: pasar.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 12, roomId: room }] });
  const sawdust = inventory.addItem({ name: 'Sawdust', kind: 'other', unit: 'kg' });
  inventory.use({ itemId: sawdust.id, qty: 30, worker: 'Ali' });
  const bags = inventory.addItem({ name: 'Grow bags', kind: 'bags', unit: 'pcs', reorderAt: 200 });
  inventory.purchase({ itemId: bags.id, qty: 120, total: 60, day: '2026-11-10' });
  const lime = inventory.addItem({ name: 'Lime', kind: 'other', unit: 'kg' });
  inventory.purchase({ itemId: lime.id, qty: 10, total: 8, day: '2026-11-05', useBy: '2026-11-13' });
  const bleach = inventory.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  inventory.purchase({ itemId: bleach.id, qty: 5, total: 25, day: '2026-11-14', useBy: '2026-11-18' });
  const pink = batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-14'), blocks: 400 });
  batches.mix({ crop: 'oyster', blocks: 100 });
  return { room, run, kedai, pasar, sawdust, bags, lime, bleach, pink };
}

test('summary: the reply\'s parts; the month\'s money is Costs\' own, last month its result', async (t) => {
  const s = setup(t);
  farm(s);
  await s.warm();
  const r = s.business.summary();
  assert.deepEqual(Object.keys(r), ['month', 'lastMonth', 'needs', 'runs', 'errors']);
  const view = s.costs.monthView();
  assert.deepEqual(r.month, { month: '2026-11', today: '2026-11-15', pending: false, tiles: view.tiles, repeating: view.repeating });
  assert.equal(r.month.tiles.income, 120, 'the two sales');
  assert.equal(r.month.tiles.incomplete, true, 'the pink blocks have no price');
  assert.deepEqual(r.month.tiles.unsold, { kg: 10, value: null }, '20 kg picked, 10 sold; no expected price set');
  assert.deepEqual(r.lastMonth, { month: '2026-10', income: 0, costs: 1620, profit: -1620, pending: false }, 'the blocks and the repair');
  assert.deepEqual(r.errors, {});
});

test('summary: last month\'s figures equal Costs\' view of that month', async (t) => {
  const s = setup(t);
  farm(s);
  await s.warm();
  const { lastMonth } = s.business.summary();
  const october = s.costs.monthView({ month: '2026-10' }).tiles;
  assert.deepEqual([lastMonth.income, lastMonth.costs, lastMonth.profit], [october.income, october.costs, october.profit]);
});

test('summary: every kind of need, in its order, each with where it is fixed', async (t) => {
  const s = setup(t);
  const f = farm(s);
  await s.warm();
  const { needs } = s.business.summary();
  assert.deepEqual(needs.map((n) => n.kind), ['owed', 'below-zero', 'low', 'use-by', 'use-by', 'blocks', 'unpriced']);
  const [owed, below, low, lime, bleach, blocks, unpriced] = needs;
  assert.deepEqual(owed, {
    kind: 'owed', total: 120, count: 2, oldestAt: at('2026-11-05'), oldestBuyer: 'Kedai Ah Seng', buyers: ['Kedai Ah Seng', 'Pasar Tani'], href: '#/business/sales',
  }, 'the buyers most owed first; whose sale is the oldest');
  assert.deepEqual(below, { kind: 'below-zero', items: [{ id: f.sawdust.id, name: 'Sawdust', qty: -30, unit: 'kg' }], href: `#/business/inventory/${f.sawdust.id}` },
    'one item: its own page');
  assert.deepEqual(low, { kind: 'low', items: [{ id: f.bags.id, name: 'Grow bags', qty: 120, unit: 'pcs', reorderAt: 200 }], href: `#/business/inventory/${f.bags.id}` });
  assert.deepEqual(lime, { kind: 'use-by', id: f.lime.id, name: 'Lime', unit: 'kg', useBy: { date: '2026-11-13', state: 'expired', qty: 10 }, href: `#/business/inventory/${f.lime.id}` },
    'the expired first');
  assert.deepEqual(bleach, { kind: 'use-by', id: f.bleach.id, name: 'Bleach', unit: 'L', useBy: { date: '2026-11-18', state: 'soon', qty: 5 }, href: `#/business/inventory/${f.bleach.id}` });
  assert.deepEqual(blocks, { kind: 'blocks', blocks: 400, crops: ['pink'], href: '#/business/batches' }, 'ready for a room only: blocks being made are not a to-do');
  assert.deepEqual(unpriced, { kind: 'unpriced', notes: [{ text: 'Blocks received 14 Nov have no price', runId: null }], batchId: f.pink.id, href: `#/business/batches/${f.pink.id}` },
    'one delivery with no price: its batch page');
});

test('summary: several items below zero or low: Inventory; several deliveries with no price: Batches', async (t) => {
  const s = setup(t);
  for (const name of ['Gypsum', 'Lime']) {
    const it = s.inventory.addItem({ name, kind: 'other', unit: 'kg', reorderAt: 5 });
    s.inventory.use({ itemId: it.id, qty: 1, worker: 'Ali' });
  }
  for (const name of ['Bags', 'Gloves']) {
    const it = s.inventory.addItem({ name, kind: 'other', unit: 'pcs', reorderAt: 50 });
    s.inventory.purchase({ itemId: it.id, qty: 10, total: 5, day: '2026-11-10' });
  }
  s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-13'), blocks: 50 });
  s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-14'), blocks: 50 });
  await s.warm();
  const byKind = Object.fromEntries(s.business.summary().needs.map((n) => [n.kind, n]));
  assert.deepEqual(byKind['below-zero'].items.map((i) => i.name), ['Gypsum', 'Lime']);
  assert.equal(byKind['below-zero'].href, '#/business/inventory');
  assert.equal(byKind.low.href, '#/business/inventory');
  assert.equal(byKind.unpriced.notes.length, 2);
  assert.deepEqual([byKind.unpriced.batchId, byKind.unpriced.href], [null, '#/business/batches']);
});

test('summary: a priced delivery and one with no price received last month: no batch to name', async (t) => {
  const s = setup(t);
  s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-10-20'), blocks: 50 });
  s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-14'), blocks: 50, pricePerBlock: 2 });
  await s.warm();
  assert.deepEqual(s.business.summary().needs.filter((n) => n.kind === 'unpriced'), [], 'October\'s is not this month\'s note');
});

test('summary: one owed buyer is its own oldest; the oldest sale\'s buyer when several', async (t) => {
  const s = setup(t);
  const a = s.sales.addBuyer({ name: 'Ah Seng' });
  const b = s.sales.addBuyer({ name: 'Borneo Fresh' });
  s.sales.record({ soldAt: at('2026-10-01'), buyerId: b.id, lines: [{ crop: 'oyster', kg: 1, priceKg: 10 }] });
  s.sales.record({ soldAt: at('2026-11-10'), buyerId: a.id, lines: [{ crop: 'oyster', kg: 9, priceKg: 10 }] });
  await s.warm();
  const [owed] = s.business.summary().needs;
  assert.deepEqual([owed.buyers, owed.oldestBuyer, owed.oldestAt], [['Ah Seng', 'Borneo Fresh'], 'Borneo Fresh', at('2026-10-01')]);
});

test('summary: two use-by items in the same state: the earlier day first; an archived item is not read', async (t) => {
  const s = setup(t);
  const item = (name, useBy) => {
    const it = s.inventory.addItem({ name, kind: 'other', unit: 'kg' });
    s.inventory.purchase({ itemId: it.id, qty: 1, total: 1, day: '2026-11-10', useBy });
    return it;
  };
  item('Apple', '2026-11-19');
  item('Zinc', '2026-11-16');
  const gone = item('Old lime', '2026-11-12');
  const salt = s.inventory.addItem({ name: 'Salt', kind: 'other', unit: 'kg', reorderAt: 5 });
  s.inventory.use({ itemId: salt.id, qty: 2, worker: 'Ali' });
  s.inventory.editItem(gone.id, { archived: true });
  s.inventory.editItem(salt.id, { archived: true });
  await s.warm();
  const { needs } = s.business.summary();
  assert.deepEqual(needs.map((n) => [n.kind, n.name]), [['use-by', 'Zinc'], ['use-by', 'Apple']]);
});

test('summary: an item at 0 at or under its level is low (not below zero)', async (t) => {
  const s = setup(t);
  const it = s.inventory.addItem({ name: 'Gloves', kind: 'other', unit: 'pcs', reorderAt: 10 });
  await s.warm();
  const { needs } = s.business.summary();
  assert.deepEqual(needs.map((n) => [n.kind, n.items.map((i) => [i.id, i.qty])]), [['low', [[it.id, 0]]]]);
});

test('summary: blocks ready for a room: the good ones summed, several crops in the order first met', async (t) => {
  const s = setup(t);
  const pink = s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-12'), blocks: 100, pricePerBlock: 2 });
  s.batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', receivedAt: at('2026-11-13'), blocks: 50, pricePerBlock: 2 });
  s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-14'), blocks: 20, pricePerBlock: 2 });
  s.batches.addCheck(pink.id, { lost: 30, cause: 'green', worker: 'Ali' });
  s.batches.mix({ crop: 'oyster', blocks: 100 });
  await s.warm();
  const { needs } = s.business.summary();
  assert.deepEqual(needs, [{ kind: 'blocks', blocks: 140, crops: ['pink', 'oyster'], href: '#/business/batches' }],
    '70 of 100 good, 50 and 20; newest received first, so pink first; the 100 being made not a need');
});

test('summary: an item below zero is not also low; a lost batch is not waiting', async (t) => {
  const s = setup(t);
  const salt = s.inventory.addItem({ name: 'Salt', kind: 'other', unit: 'kg', reorderAt: 5 });
  s.inventory.use({ itemId: salt.id, qty: 2, worker: 'Ali' });
  const lost = s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-14'), blocks: 10, pricePerBlock: 2 });
  s.batches.addCheck(lost.id, { lost: 10, cause: 'green', worker: 'Ali' });
  await s.warm();
  const { needs } = s.business.summary();
  assert.deepEqual(needs.map((n) => n.kind), ['below-zero']);
});

test('summary: the open runs as Runs lists them; an ended run is not in progress', async (t) => {
  const s = setup(t);
  const f = farm(s);
  await s.warm();
  const { runs } = s.business.summary();
  assert.deepEqual(runs.map((r) => [r.id, r.roomName, r.kg, r.endedAt]), [[f.run.id, 'Container 1', 20, null]]);
  assert.deepEqual(Object.keys(runs[0]), ['id', 'roomId', 'roomName', 'crops', 'partial', 'startedAt', 'endedAt', 'kg', 'perBlock',
    'income', 'costs', 'profit', 'profitPerKg', 'pending', 'incomplete']);
  s.db.setProgram(f.room, { ...s.db.getProgram(f.room), crops: [] }, { change: 'end', at: at('2026-11-15', 9) });
  assert.deepEqual(s.business.summary().runs, []);
});

test('summary: a new farm: nothing needs the owner, no runs, the money at 0', async (t) => {
  const s = setup(t);
  await s.warm();
  const r = s.business.summary();
  assert.deepEqual([r.needs, r.runs, r.errors], [[], [], {}]);
  assert.deepEqual([r.month.tiles.income, r.month.tiles.costs, r.month.tiles.profit, r.month.tiles.unsold], [0, 0, 0, null]);
  assert.deepEqual(r.lastMonth, { month: '2026-10', income: 0, costs: 0, profit: 0, pending: false });
});

test('summary: the energy still worked out: the month pending, its costs and profit null', (t) => {
  const s = setup(t);
  s.db.createRoom(ROOM, at('2026-10-01'));
  const r = s.business.summary();
  assert.equal(r.month.pending, true);
  assert.deepEqual([r.month.tiles.costs, r.month.tiles.profit], [null, null]);
});

test('summary: a module that fails leaves only its own part out, says so and logs why', async (t) => {
  const broken = { view() { throw new Error('sales broke'); }, list() { throw new Error('list broke'); } };
  const s = setup(t, { sales: broken, inventory: broken });
  farm(s);
  await s.warm();
  s.logged.length = 0;
  const r = s.business.summary();
  assert.deepEqual(r.errors, { sales: PART_FAILED, inventory: PART_FAILED });
  assert.deepEqual(r.needs.map((n) => n.kind), ['blocks', 'unpriced'], 'Batches\' and Costs\' needs still there');
  assert.equal(r.month.month, '2026-11');
  assert.equal(r.runs.length, 1);
  assert.deepEqual(s.logged, ["Business summary: couldn't read sales: sales broke", "Business summary: couldn't read inventory: list broke"], 'the part named, the cause kept');
});

test('summary: every module failing: each part null or empty, every part named', (t) => {
  const fail = () => { throw new Error('down'); };
  const s = setup(t, {
    costs: { monthView: fail }, sales: { view: fail }, inventory: { list: fail }, batches: { list: fail }, runs: { list: fail },
  });
  const r = s.business.summary();
  assert.deepEqual(r, { month: null, lastMonth: null, needs: [], runs: null, errors: Object.fromEntries(PARTS.map((p) => [p, PART_FAILED])) });
  assert.equal(PART_FAILED, 'Something went wrong');
});

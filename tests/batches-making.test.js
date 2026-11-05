// Making blocks (spec 2026-11-05-batches-design.md 4 and 5): recipes, Make blocks (the mix), the steps (inoculate, incubate,
// ready to fruit), Put into a room for made blocks, sterilising loads, the made price per block and its stock moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createBatches } from '../server/batches.js';
import { openWithInventory } from './batches-fixture.js';

const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const RECIPE = { name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, waterPct: 60, bagKg: 2.3 };
const MIX = [{ item: 'sawdust', qty: 287, unit: 'kg' }, { item: 'bran', qty: 73.6, unit: 'kg' }];
const LOAD = { method: 'steam', bags: 200, hotAt: NOW - DAY, holdH: 6, tempC: 98, worker: 'Ali' };

function setup(t, { stock = false } = {}) {
  const inventory = stock ? openWithInventory(t) : null;
  const db = inventory ? inventory.db : openDb(':memory:');
  if (!inventory) t.after(() => db.close());
  let clock = NOW;
  const batches = createBatches({ db, now: () => clock });
  const told = [];
  batches.onChange((c) => told.push(c));
  let n = 0;
  function room(crops = [{ crop: 'oyster', blocks: 400 }]) {
    n += 1;
    const id = db.createRoom({ ...ROOM, name: `Container ${n}` }, 1000).id;
    db.setProgram(id, { ...db.getProgram(id), crops }, { change: 'start', at: NOW - 5 * DAY });
    return id;
  }
  return { db, batches, told, room, tick: (ms) => { clock += ms; }, item: inventory?.item, buy: inventory?.buy, archive: inventory?.archive };
}

const status = (fn) => {
  try { fn(); } catch (err) { return [err.status, err.field ?? null, err.message]; }
  return null;
};

// 400 bags of Grey oyster mixed two days ago (3 Nov), sawdust and bran.
const made = (batches, o = {}) => batches.mix({ crop: 'oyster', blocks: 400, mixedAt: NOW - 2 * DAY, materials: MIX, ...o });

test('recipes: add, list by name, edit, archive; the parts add up to 100 %; a name in use once', (t) => {
  const { batches, told } = setup(t);
  const r = batches.addRecipe(RECIPE);
  assert.deepEqual({ ...r, id: 0, createdAt: 0 }, { id: 0, ...RECIPE, otherPct: 0, otherName: null, archived: false, createdAt: 0 });
  assert.equal(r.createdAt, NOW);
  assert.deepEqual(told.at(-1), { batchId: null, roomId: null, runId: null, harvestRooms: [] }, 'the pages hear of it');
  const cases = [
    [{ name: ' ' }, 'name'],
    [{ name: 'sawdust 78' }, 'name'],
    [{ crop: 'tomato' }, 'crop'],
    [{ branPct: 21 }, 'sawdustPct'],
    [{ sawdustPct: 80, limePct: -1 }, 'limePct'],
    [{ sawdustPct: 76, otherPct: 2 }, 'otherName'],
    [{ waterPct: 85 }, 'waterPct'],
    [{ bagKg: 0.1 }, 'bagKg'],
    [{ archived: 'yes' }, 'archived'],
  ];
  for (const [change, field] of cases) {
    assert.deepEqual(status(() => batches.addRecipe({ ...RECIPE, name: 'B', ...change }))?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.addRecipe({ ...RECIPE, name: 'B', branPct: 21 }))[2], 'The parts must add up to 100 % (now 101 %)');
  assert.equal(status(() => batches.addRecipe(null))[0], 400);
  const other = batches.addRecipe({ ...RECIPE, name: 'With cotton', crop: '', sawdustPct: 70, otherPct: 8, otherName: ' Cotton waste ' });
  assert.deepEqual([other.crop, other.otherName], [null, 'Cotton waste'], 'Any crop; trimmed');
  assert.deepEqual(batches.recipes().recipes.map((x) => x.name), ['Sawdust 78', 'With cotton']);
  const e = batches.editRecipe(r.id, { bagKg: 2.5 });
  assert.deepEqual([e.bagKg, e.sawdustPct, e.name], [2.5, 78, 'Sawdust 78'], 'not given: kept');
  assert.equal(batches.editRecipe(r.id, { archived: true }).archived, true);
  assert.deepEqual(batches.recipes().recipes.map((x) => x.name), ['With cotton'], 'an archived recipe is not offered');
  assert.deepEqual(batches.recipes({ all: true }).recipes.map((x) => x.name), ['Sawdust 78', 'With cotton']);
  assert.equal(batches.addRecipe(RECIPE).name, 'Sawdust 78', 'an archived name is free again');
  assert.deepEqual(status(() => batches.editRecipe(r.id, { archived: false }))?.slice(0, 2), [400, 'name'], 'back in use, its name would be there twice');
  assert.equal(status(() => batches.editRecipe(999, {}))[0], 404);
});

test('make blocks: a made batch, making, mixed and received the same day, no supplier yet; the recipe gives the crop and the weight', (t) => {
  const { batches, told } = setup(t);
  const r = batches.addRecipe(RECIPE);
  const b = batches.mix({ recipeId: r.id, blocks: 400, mixedAt: NOW - DAY, materials: [...MIX, { item: 'other', name: ' Cotton waste ', qty: 10, unit: 'kg' }], note: 'first mix' });
  assert.deepEqual([b.kind, b.status, b.crop, b.blocks, b.supplier, b.receivedAt, b.mixedAt, b.recipeId, b.blockKg, b.waterPct, b.dryKg, b.pricePerBlock, b.note],
    ['made', 'making', 'oyster', 400, null, NOW - DAY, NOW - DAY, r.id, 2.3, 60, 0.92, null, 'first mix']);
  assert.deepEqual([b.incubation, b.sterilisedAt, b.spawn], [null, null, null]);
  assert.deepEqual(told.at(-1), { batchId: b.id, roomId: null, runId: null, harvestRooms: [] });
  const d = batches.detail(b.id);
  assert.equal(d.recipe.name, 'Sawdust 78');
  assert.deepEqual(d.materials.map((m) => [m.item, m.name, m.qty, m.unit, m.stockItemId, m.itemName, m.unitCost]), [
    ['sawdust', null, 287, 'kg', null, null, null], ['bran', null, 73.6, 'kg', null, null, null], ['other', 'Cotton waste', 10, 'kg', null, null, null],
  ]);
  assert.deepEqual(d.loads, []);
  const plain = batches.mix({ crop: 'pink', blocks: 10 });
  assert.deepEqual([plain.mixedAt, plain.receivedAt, plain.blockKg, plain.recipeId], [NOW, NOW, null, null], 'today; no recipe, no weight');
  assert.deepEqual(batches.detail(plain.id).materials, []);
  assert.equal(batches.mix({ recipeId: r.id, crop: 'pink', blocks: 10, blockKg: 2, waterPct: 65 }).crop, 'pink', "a crop picked over the recipe's");
  assert.deepEqual(batches.list({ status: 'making' }).batches.map((x) => x.id).slice(1), [plain.id, b.id], 'newest first');
  assert.deepEqual(batches.list({ status: 'waiting' }).batches, []);
});

test('make blocks: each bad field is a 400 naming it', (t) => {
  const { batches } = setup(t);
  const old = batches.addRecipe({ ...RECIPE, name: 'Old' });
  batches.editRecipe(old.id, { archived: true });
  const cases = [
    [{ crop: 'tomato' }, 'crop'],
    [{ crop: null }, 'crop'],
    [{ blocks: 0 }, 'blocks'],
    [{ blocks: 2.5 }, 'blocks'],
    [{ mixedAt: NOW + DAY }, 'mixedAt'],
    [{ mixedAt: 9e15 }, 'mixedAt'],
    [{ recipeId: 999 }, 'recipeId'],
    [{ recipeId: old.id }, 'recipeId'],
    [{ pricePerBlock: 1 }, 'pricePerBlock'],
    [{ blockKg: 2.3 }, 'waterPct'],
    [{ note: 'n'.repeat(501) }, 'note'],
    [{ materials: 'sawdust' }, 'materials'],
    [{ materials: [{ item: 'cement', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 0, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 100_001, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 1, unit: 'pcs' }] }, 'materials'],
    [{ materials: [{ item: 'bags', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 1, unit: 'kg' }, { item: 'sawdust', qty: 2, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'other', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'spawn', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 1, unit: 'kg', stockItemId: 'x' }] }, 'materials'],
    [{ spawn: { qty: 1, unit: 'kg' } }, 'inoculatedAt'],
  ];
  for (const [change, field] of cases) {
    assert.deepEqual(status(() => made(batches, change))?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.mix([]))[0], 400);
  assert.deepEqual(batches.list().batches, [], 'nothing was kept');
});

test('the steps: inoculated not before the mix; the incubation needs the inoculation; in an area until ready to fruit', (t) => {
  const { batches } = setup(t);
  const b = made(batches, { mixedAt: NOW - 3 * DAY });
  assert.deepEqual(status(() => batches.edit(b.id, { inoculatedAt: NOW - 4 * DAY })), [400, 'inoculatedAt', 'Inoculated must be on or after the day mixed']);
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'area' })), [400, 'incubation', 'Record the inoculation first']);
  assert.deepEqual(status(() => batches.edit(b.id, { pricePerBlock: 1 }))?.slice(0, 2), [400, 'pricePerBlock']);
  const i = batches.edit(b.id, { inoculatedAt: NOW - 2 * DAY, supplier: 'Spawn Co', strain: 'PL-27', spawnBatch: '0912', spawn: { qty: 12, unit: 'kg', stockItemId: null } });
  assert.deepEqual([i.status, i.supplier, i.strain, i.spawnBatch, i.spawn], ['making', 'Spawn Co', 'PL-27', '0912', { qty: 12, unit: 'kg', unitCost: null }]);
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'area', incubatedFrom: NOW - 3 * DAY }))?.slice(0, 2), [400, 'incubatedFrom']);
  const area = batches.edit(b.id, { incubation: 'area' });
  assert.deepEqual([area.incubation, area.incubatedFrom, area.incubatedTo, area.status], ['area', NOW - 2 * DAY, null, 'making'], 'from the inoculation by default');
  assert.deepEqual(status(() => batches.edit(b.id, { incubatedTo: NOW - 3 * DAY }))?.slice(0, 2), [400, 'incubatedTo']);
  assert.deepEqual(status(() => batches.edit(b.id, { incubatedTo: NOW + DAY }))?.slice(0, 2), [400, 'incubatedTo']);
  assert.equal(batches.edit(b.id, { incubatedTo: NOW }).status, 'waiting', 'ready to fruit');
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'room', incubatedTo: NOW }))?.slice(0, 2), [400, 'incubation'], 'only an area has dates');
  const room = batches.edit(b.id, { incubation: 'room' });
  assert.deepEqual([room.incubation, room.incubatedFrom, room.incubatedTo, room.status], ['room', null, null, 'making'], "the area's dates go");
  assert.deepEqual(status(() => batches.edit(b.id, { inoculatedAt: null })), [400, 'inoculatedAt', 'Clear the incubation before the inoculation']);
  assert.deepEqual(status(() => batches.edit(b.id, { spawn: { qty: 0, unit: 'kg' } }))?.slice(0, 2), [400, 'spawn']);
  assert.deepEqual(status(() => batches.edit(b.id, { spawn: { qty: 2, unit: 'pcs' } }))?.slice(0, 2), [400, 'spawn']);
  assert.equal(batches.edit(b.id, { spawn: { qty: 30, unit: 'bags' } }).spawn.unit, 'bags');
  assert.equal(batches.edit(b.id, { spawn: null }).spawn, null, 'the spawn line cleared');
  assert.deepEqual(status(() => batches.edit(b.id, { mixedAt: NOW - DAY })), [400, 'mixedAt', 'Inoculated must be on or after the day mixed']);
  assert.equal(batches.edit(b.id, { incubation: null, inoculatedAt: null }).inoculatedAt, null, 'both cleared at once');
});

test('edit the mix: the day moves the received day, not after a load; the mix lines replaced, the spawn kept; a recipe edit changes no batch', (t) => {
  const { batches } = setup(t);
  const r = batches.addRecipe(RECIPE);
  const b = made(batches, { recipeId: r.id, mixedAt: NOW - 3 * DAY });
  batches.edit(b.id, { inoculatedAt: NOW - DAY, spawn: { qty: 12, unit: 'kg' } });
  const e = batches.edit(b.id, { mixedAt: NOW - 2 * DAY, materials: [{ item: 'sawdust', qty: 300, unit: 'kg' }] });
  assert.deepEqual([e.mixedAt, e.receivedAt], [NOW - 2 * DAY, NOW - 2 * DAY]);
  assert.deepEqual(batches.detail(b.id).materials.map((m) => [m.item, m.qty]), [['sawdust', 300], ['spawn', 12]]);
  batches.addCheck(b.id, { lost: 1, cause: 'green', worker: 'Ali', at: NOW - 2 * DAY });
  assert.deepEqual(status(() => batches.edit(b.id, { mixedAt: NOW - DAY })), [400, 'mixedAt', 'Some contamination checks are before that day']);
  assert.equal(batches.edit(b.id, { blocks: 380 }).blocks, 380);
  assert.deepEqual(status(() => batches.edit(b.id, { blocks: 0 }))?.slice(0, 2), [400, 'blocks']);
  batches.editRecipe(r.id, { sawdustPct: 80, branPct: 18 });
  assert.equal(batches.detail(b.id).materials[0].qty, 300, 'copied at the mix, not linked');
  batches.editRecipe(r.id, { archived: true });
  assert.equal(batches.edit(b.id, { recipeId: r.id, note: 'kept' }).recipeId, r.id, 'its own archived recipe stays');
  assert.equal(batches.detail(b.id).recipe.archived, true);
});

test('put made blocks into a room: once inoculated (they incubate in that grow room) or, in an area, once ready to fruit', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const b = made(batches);
  assert.deepEqual(status(() => batches.place(b.id, { roomId })), [409, null, 'Record the inoculation before these blocks go into a room']);
  batches.edit(b.id, { inoculatedAt: NOW - DAY });
  const p = batches.place(b.id, { roomId, blocks: 100 });
  assert.deepEqual([p.status, p.parentId, p.kind, p.incubation, p.mixedAt], ['placed', b.id, 'made', 'room', NOW - 2 * DAY], 'a part copies the making');
  assert.equal(batches.detail(b.id).incubation, 'room', 'the whole delivery incubates in a grow room');
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'area' }))?.slice(0, 2), [409, 'incubation']);
  assert.deepEqual(status(() => batches.edit(b.id, { crop: 'pink' }))?.slice(0, 2), [409, 'crop']);
  assert.deepEqual(status(() => batches.edit(b.id, { blocks: 200 }))?.slice(0, 2), [409, 'blocks']);
  assert.equal(batches.edit(p.id, { strain: 'PL-27' }).strain, 'PL-27');
  assert.equal(batches.detail(b.id).strain, 'PL-27', 'shared: edited on a part, written to the delivery');
  assert.equal(batches.unplace(p.id).id, b.id, 'folded back');
  assert.equal(batches.detail(b.id).status, 'making', 'out of the room it still incubates');
  const area = made(batches);
  batches.edit(area.id, { inoculatedAt: NOW - DAY, incubation: 'area' });
  assert.deepEqual(status(() => batches.place(area.id, { roomId })), [409, null, 'These blocks incubate in an area: mark them ready to fruit first']);
  batches.edit(area.id, { incubatedTo: NOW });
  const whole = batches.place(area.id, { roomId });
  assert.deepEqual([whole.status, whole.incubation, whole.incubatedTo], ['placed', 'area', NOW]);
});

test('sterilising loads: record, by time, edit, delete; not before the mix; bags up to the blocks made; only on a made batch', (t) => {
  const { batches, told } = setup(t);
  const b = made(batches);
  const l1 = batches.addLoad(b.id, LOAD);
  assert.deepEqual({ ...l1, id: 0 }, { id: 0, batchId: b.id, ...LOAD, createdAt: NOW });
  assert.equal(told.at(-1).batchId, b.id);
  const l2 = batches.addLoad(b.id, { ...LOAD, hotAt: NOW - DAY - 3_600_000, bags: 100 });
  const d = batches.detail(b.id);
  assert.deepEqual(d.loads.map((l) => l.id), [l2.id, l1.id], 'by the time they got hot');
  assert.equal(d.sterilisedAt, NOW - DAY, 'the last load');
  assert.equal(batches.list().batches[0].sterilisedAt, NOW - DAY);
  const e = batches.editLoad(l1.id, { bags: 300, holdH: 6.25 });
  assert.deepEqual([e.bags, e.holdH, e.method, e.worker], [300, 6.3, 'steam', 'Ali'], 'to 0.1 h; not given: kept');
  batches.removeLoad(l2.id);
  assert.deepEqual(batches.detail(b.id).loads.map((l) => l.id), [l1.id]);
  assert.equal(status(() => batches.removeLoad(l2.id))[0], 404);
  assert.equal(status(() => batches.editLoad(999, { bags: 1 }))[0], 404);
  const cases = [
    [{ method: 'boil' }, 'method'],
    [{ bags: 0 }, 'bags'],
    [{ bags: 401 }, 'bags'],
    [{ hotAt: NOW - 3 * DAY }, 'hotAt'],
    [{ hotAt: NOW + 60_000 }, 'hotAt'],
    [{ holdH: 0.25 }, 'holdH'],
    [{ tempC: 140 }, 'tempC'],
    [{ worker: '' }, 'worker'],
  ];
  for (const [change, field] of cases) {
    assert.deepEqual(status(() => batches.addLoad(b.id, { ...LOAD, ...change }))?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.addLoad(b.id, { ...LOAD, bags: 401 }))[2], 'Bags must be a whole number from 1 to 400');
  const bought = batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', blocks: 10 });
  assert.deepEqual(status(() => batches.addLoad(bought.id, LOAD)), [409, null, 'Only blocks made on the farm have sterilising loads']);
  assert.deepEqual(status(() => batches.edit(b.id, { blocks: 250 })), [400, 'blocks', 'A sterilising load has more bags than that']);
  assert.deepEqual(status(() => batches.edit(b.id, { mixedAt: NOW })), [400, 'mixedAt', 'Some sterilising loads are before that day']);
  batches.remove(b.id);
  assert.equal(status(() => batches.editLoad(l1.id, { bags: 1 }))[0], 404, "a batch's loads go with it");
});

test("the made price per block and the stock moves, from Inventory's items and purchase prices", (t) => {
  const { db, batches, room, item, buy } = setup(t, { stock: true });
  const sawdust = item('Sawdust');
  const bran = item('Rice bran');
  const spawn = item('Grey oyster spawn', 'spawn');
  buy(sawdust, 0.35);
  buy(bran, 1.2);
  const b = made(batches, { materials: [{ item: 'sawdust', qty: 287, unit: 'kg', stockItemId: sawdust }, { item: 'bran', qty: 73.6, unit: 'kg', stockItemId: bran }] });
  assert.equal(b.pricePerBlock, 0.4719, '(287 × 0.35 + 73.6 × 1.2) ÷ 400 blocks made');
  const blocks = db.batches.blocksItem('Grey oyster blocks');
  const moves = () => db.batches.moves([b.id]).map((m) => [m.itemId, m.at, m.qty, m.unitCost, m.note]);
  assert.deepEqual(moves(), [
    [blocks, NOW - 2 * DAY, 400, 0.4719, null],
    [sawdust, NOW - 2 * DAY, -287, null, 'mixed'],
    [bran, NOW - 2 * DAY, -73.6, null, 'mixed'],
  ]);
  const i = batches.edit(b.id, { inoculatedAt: NOW - DAY, spawn: { qty: 12, unit: 'kg', stockItemId: spawn } });
  assert.equal(i.pricePerBlock, null, 'the spawn has no purchase price yet');
  assert.deepEqual(batches.detail(b.id).materials.map((m) => [m.itemName, m.unitCost]), [['Sawdust', 0.35], ['Rice bran', 1.2], ['Grey oyster spawn', null]]);
  buy(spawn, 8);
  assert.equal(batches.detail(b.id).pricePerBlock, null, 'a later purchase counts at the next write');
  assert.equal(batches.edit(b.id, { note: 'spawn bought' }).pricePerBlock, 0.7119, '+ 12 × 8, ÷ 400');
  assert.deepEqual(moves().at(-1), [spawn, NOW - DAY, -12, null, 'spawn'], 'the spawn out at the inoculation');
  assert.deepEqual(batches.list().batches[0].spawn, { qty: 12, unit: 'kg', unitCost: 8 }, "the 4-2 sheet's price per unit");
  const p = batches.place(b.id, { roomId: room(), blocks: 100 });
  assert.equal(p.pricePerBlock, 0.7119, "a part has the delivery's price: the blocks made, not the row's");
  assert.deepEqual(db.batches.moves([p.id]).map((m) => m.qty), [-100], 'into a room');
  assert.deepEqual(status(() => made(batches, { blocks: 1, materials: [{ item: 'sawdust', qty: 5000, unit: 'kg', stockItemId: bran }] })),
    [400, 'materials', 'The materials come to RM 6,000 a block, over RM 1,000']);
  assert.deepEqual(status(() => made(batches, { materials: [{ item: 'sawdust', qty: 1, unit: 'kg', stockItemId: 999 }] }))?.slice(0, 2), [400, 'materials'], 'no such item');
  batches.remove(p.id);
  batches.remove(b.id);
  assert.deepEqual([db.batches.materials(b.id), db.batches.loads(b.id), db.batches.moves([b.id, p.id])], [[], [], []], 'its lines and moves go with it');
});

test("Inventory's items for the pickers; without Inventory an item picked is not kept and the price is unknown", (t) => {
  const plain = setup(t);
  assert.deepEqual(plain.batches.stockItems(), { items: [] });
  const b = made(plain.batches, { materials: [{ item: 'sawdust', qty: 287, unit: 'kg', stockItemId: 5 }] });
  assert.deepEqual([b.pricePerBlock, plain.batches.detail(b.id).materials[0].stockItemId], [null, null]);
  const { batches, item, buy } = setup(t, { stock: true });
  const sawdust = item('Sawdust');
  buy(sawdust, 0.35);
  batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', blocks: 10 }); // makes the item "Grey oyster blocks"
  assert.deepEqual(batches.stockItems(), { items: [{ id: sawdust, name: 'Sawdust', kind: 'other', unit: 'kg', unitCost: 0.35 }] });
});

test('the CSV ends with the day mixed and the recipe', (t) => {
  const { batches } = setup(t);
  const r = batches.addRecipe(RECIPE);
  made(batches, { recipeId: r.id });
  const lines = batches.csv().text.trimEnd().split('\r\n');
  assert.match(lines[0], /,note,mixed,recipe$/);
  assert.equal(lines[1], '2026-11-03,Grey oyster,made,,,,,400,0,,,,,2.3,60,,2026-11-03,Sawdust 78');
});

test("a material linked to an Inventory item is counted in the item's unit; archived items are not offered", (t) => {
  const { batches, item, archive } = setup(t, { stock: true });
  const sawdust = item('Sawdust', 'other', 'kg');
  const bags = item('Autoclave bags', 'bags', 'pcs');
  const spawn = item('Grey oyster spawn', 'spawn', 'kg');
  const lbs = item('Bran by the sack', 'other', 'sack');
  const cases = [
    [{ materials: [{ item: 'sawdust', qty: 5, unit: 'kg', stockItemId: bags }] }, 'Sawdust is in kg; Inventory keeps Autoclave bags in pcs'],
    [{ materials: [{ item: 'bran', qty: 5, unit: 'kg', stockItemId: lbs }] }, 'Bran is in kg; Inventory keeps Bran by the sack in sack'],
    [{ materials: [{ item: 'bags', qty: 5, unit: 'pcs', stockItemId: sawdust }] }, 'Plastic bags is in pcs; Inventory keeps Sawdust in kg'],
  ];
  for (const [change, message] of cases) {
    assert.deepEqual(status(() => made(batches, change)), [400, 'materials', message]);
  }
  assert.ok(made(batches, { materials: [{ item: 'sawdust', qty: 5, unit: 'kg', stockItemId: sawdust }, { item: 'bags', qty: 400, unit: 'pcs', stockItemId: bags }] }));
  const b = made(batches);
  assert.deepEqual(status(() => batches.edit(b.id, { inoculatedAt: NOW - DAY, spawn: { qty: 30, unit: 'bags', stockItemId: spawn } })),
    [400, 'spawn', 'Spawn is in bags; Inventory keeps Grey oyster spawn in kg']);
  assert.equal(batches.edit(b.id, { inoculatedAt: NOW - DAY, spawn: { qty: 12, unit: 'kg', stockItemId: spawn } }).spawn.qty, 12);
  archive(lbs);
  assert.ok(!batches.stockItems().items.some((i) => i.id === lbs));
});

test('the made price over RM 1,000 a block is refused on any write that works it out, not left to the column', (t) => {
  const { batches, room, item, buy } = setup(t, { stock: true });
  const gold = item('Gold dust');
  buy(gold, 900);
  const b = made(batches, { blocks: 1000, materials: [{ item: 'sawdust', qty: 1000, unit: 'kg', stockItemId: gold }] });
  assert.equal(b.pricePerBlock, 900);
  const over = [400, 'materials', 'The materials come to RM 1,800 a block, over RM 1,000'];
  assert.deepEqual(status(() => batches.edit(b.id, { blocks: 500 })), over, 'fewer bags');
  assert.deepEqual(status(() => batches.edit(b.id, { materials: [{ item: 'sawdust', qty: 2000, unit: 'kg', stockItemId: gold }] })),
    [400, 'materials', 'The materials come to RM 1,800 a block, over RM 1,000']);
  batches.edit(b.id, { inoculatedAt: NOW - DAY });
  assert.deepEqual(status(() => batches.place(b.id, { roomId: room([{ crop: 'oyster', blocks: 1000 }]), blocks: 10 })), null, 'a part keeps the delivery price');
  assert.equal(batches.detail(b.id).blocks, 990);
});

test('list ?status=making offers the making batches', (t) => {
  const { batches } = setup(t);
  const m = made(batches);
  batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', blocks: 10 });
  assert.deepEqual(batches.list({ status: 'making' }).batches.map((x) => x.id), [m.id]);
});

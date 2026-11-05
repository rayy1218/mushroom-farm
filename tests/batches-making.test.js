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
  return { db, batches, told, room, tick: (ms) => { clock += ms; }, item: inventory?.item, buy: inventory?.buy };
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

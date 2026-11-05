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

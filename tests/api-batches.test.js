// The Batches routes (spec 2026-11-05-batches-design.md 6): every route, its 400s and 404s, the query, the CSV, and the
// events the pages listen for ('batches'; 'harvest' for a placed batch's room).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { createEvents } from '../server/events.js';
import { openWithInventory, withoutStock } from './batches-fixture.js';

const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };
const GOOD = { crop: 'oyster', supplier: 'Agro Supplies', blocks: 1200, pricePerBlock: 2.3 };

async function app(t) {
  const db = withoutStock(t);
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const server = createApp(db, { tasks: createTasks({ db }), events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const raw = (method, path, body) => fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const call = async (method, path, body) => {
    const res = await raw(method, path, body);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  async function room() {
    const made = await call('POST', '/api/rooms', { ...ROOM, trhAddress: 1 });
    assert.equal((await call('PUT', `/api/rooms/${made.body.id}/crop`, { crops: [{ crop: 'oyster', blocks: 950 }] })).status, 200);
    return made.body.id;
  }
  const of = (type) => seen.filter(([x]) => x === type).map(([, d]) => d);
  return { db, call, raw, room, of };
}

test('receive, list, read, edit, delete', async (t) => {
  const { call, of } = await app(t);
  const made = await call('POST', '/api/batches', GOOD);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.status, 'waiting');
  assert.deepEqual(of('batches').at(-1), { batchId: made.body.id, roomId: null, runId: null });
  const list = await call('GET', '/api/batches');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.batches.map((b) => b.id), [made.body.id]);
  assert.equal(list.body.blockCost, 2760);
  const one = await call('GET', `/api/batches/${made.body.id}`);
  assert.deepEqual(one.body.delivery.map((b) => b.id), [made.body.id]);
  const put = await call('PUT', `/api/batches/${made.body.id}`, { supplier: 'Agro Supplies Sdn Bhd' });
  assert.equal(put.body.supplier, 'Agro Supplies Sdn Bhd');
  assert.equal((await call('DELETE', `/api/batches/${made.body.id}`)).status, 204);
  assert.equal((await call('GET', `/api/batches/${made.body.id}`)).status, 404);
});

test('a bad body or query is a 400 with its field; unknown ids 404; other methods 404', async (t) => {
  const { call } = await app(t);
  const bad = await call('POST', '/api/batches', { ...GOOD, blocks: 0 });
  assert.deepEqual([bad.status, bad.body.field], [400, 'blocks']);
  for (const q of ['run=x', 'from=2026-13-01', 'to=5', 'status=gone']) {
    assert.equal((await call('GET', `/api/batches?${q}`)).status, 400, q);
  }
  assert.equal((await call('PUT', '/api/batches/99', { note: 'x' })).status, 404);
  assert.equal((await call('POST', '/api/batches/99/place', { roomId: 1 })).status, 404);
  assert.equal((await call('PUT', '/api/batch-checks/99', { lost: 1 })).status, 404);
  assert.equal((await call('PATCH', '/api/batches')).status, 404);
});

test('place, take out, checks; the events of a placed batch tell its room\'s Harvest too', async (t) => {
  const { call, room, of } = await app(t);
  const roomId = await room();
  const made = await call('POST', '/api/batches', GOOD);
  const placed = await call('POST', `/api/batches/${made.body.id}/place`, { roomId, blocks: 800 });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  assert.equal(placed.body.parentId, made.body.id);
  assert.deepEqual(of('harvest').at(-1), { roomId });
  const byRun = await call('GET', `/api/batches?run=${placed.body.runId}`);
  assert.deepEqual(byRun.body.batches.map((b) => b.id), [placed.body.id]);
  assert.equal(byRun.body.blockCost, 1840);
  const check = await call('POST', `/api/batches/${placed.body.id}/checks`, { lost: 3, cause: 'green', worker: 'Ali' });
  assert.equal(check.status, 201, JSON.stringify(check.body));
  assert.equal((await call('PUT', `/api/batch-checks/${check.body.id}`, { lost: 4 })).body.lost, 4);
  assert.equal((await call('DELETE', `/api/batch-checks/${check.body.id}`)).status, 204);
  const noCrop = await call('POST', `/api/batches/${made.body.id}/place`, { roomId: 999 });
  assert.deepEqual([noCrop.status, noCrop.body.field], [400, 'roomId']);
  const out = await call('POST', `/api/batches/${placed.body.id}/unplace`);
  assert.equal(out.status, 200);
  assert.equal(out.body.id, made.body.id, 'folded back');
  assert.equal((await call('POST', `/api/batches/${made.body.id}/unplace`)).status, 409);
});

test('the CSV: a file with the BOM, its name from the dates', async (t) => {
  const { call, raw } = await app(t);
  await call('POST', '/api/batches', { ...GOOD, receivedAt: Date.UTC(2026, 5, 1) });
  const res = await raw('GET', '/api/batches.csv?from=2026-01-01&to=2026-12-31');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /batches 2026-01-01/);
  const bytes = new Uint8Array(await res.arrayBuffer()); // res.text() would drop the BOM
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal((await raw('GET', '/api/batches.csv?from=bad')).status, 400);
});

test('making blocks: recipes, Make blocks, the steps through PUT, loads, the stock items; their 400s and 404s', async (t) => {
  const { call, of } = await app(t);
  const RECIPE = { name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, waterPct: 60, bagKg: 2.3 };
  const recipe = await call('POST', '/api/batch-recipes', RECIPE);
  assert.equal(recipe.status, 201, JSON.stringify(recipe.body));
  assert.deepEqual(of('batches').at(-1), { batchId: null, roomId: null, runId: null });
  assert.deepEqual((await call('GET', '/api/batch-recipes')).body.recipes.map((r) => r.id), [recipe.body.id]);
  const sum = await call('POST', '/api/batch-recipes', { ...RECIPE, name: 'Short', branPct: 10 });
  assert.deepEqual([sum.status, sum.body.field], [400, 'sawdustPct']);
  assert.equal((await call('PUT', `/api/batch-recipes/${recipe.body.id}`, { archived: true })).body.archived, true);
  assert.deepEqual((await call('GET', '/api/batch-recipes')).body.recipes, []);
  assert.equal((await call('GET', '/api/batch-recipes?all=1')).body.recipes.length, 1);
  assert.equal((await call('PUT', '/api/batch-recipes/99', { name: 'x' })).status, 404);
  assert.equal((await call('DELETE', `/api/batch-recipes/${recipe.body.id}`)).status, 404, 'archived, never deleted');
  const made = await call('POST', '/api/batches', { kind: 'made', crop: 'oyster', blocks: 400, materials: [{ item: 'sawdust', qty: 287, unit: 'kg' }] });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.kind, made.body.status, made.body.supplier], ['made', 'making', null]);
  assert.deepEqual(of('batches').at(-1), { batchId: made.body.id, roomId: null, runId: null });
  const noBags = await call('POST', '/api/batches', { kind: 'made', crop: 'oyster' });
  assert.deepEqual([noBags.status, noBags.body.field], [400, 'blocks']);
  const load = await call('POST', `/api/batches/${made.body.id}/loads`, { method: 'steam', bags: 400, hotAt: Date.now(), holdH: 6, tempC: 98, worker: 'Ali' });
  assert.equal(load.status, 201, JSON.stringify(load.body));
  assert.equal((await call('PUT', `/api/batch-loads/${load.body.id}`, { bags: 300 })).body.bags, 300);
  const one = await call('GET', `/api/batches/${made.body.id}`);
  assert.deepEqual([one.body.loads.length, one.body.materials.length, one.body.recipe], [1, 1, null]);
  assert.equal((await call('DELETE', `/api/batch-loads/${load.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/batch-loads/${load.body.id}`)).status, 404);
  assert.equal((await call('PATCH', '/api/batch-loads/1')).status, 404);
  const step = await call('PUT', `/api/batches/${made.body.id}`, { inoculatedAt: Date.now(), supplier: 'Spawn Co', spawn: { qty: 12, unit: 'kg' } });
  assert.equal(step.status, 200, JSON.stringify(step.body));
  assert.deepEqual([step.body.supplier, step.body.spawn.qty], ['Spawn Co', 12]);
  assert.deepEqual((await call('GET', '/api/batches?status=making')).body.batches.map((b) => b.id), [made.body.id]);
  assert.deepEqual((await call('GET', '/api/batches/stock-items')).body, { items: [] });
  assert.equal((await call('POST', '/api/batches/stock-items')).status, 404);
  assert.equal(one.body.inventory, false, 'the detail says the farm has no Inventory');
  const bought = await call('POST', '/api/batches', GOOD);
  assert.equal((await call('POST', `/api/batches/${bought.body.id}/loads`, { method: 'steam' })).status, 409);
});

test('GET /api/batches/stock-items with Inventory lists its items with their latest price, without the archived and the blocks', async (t) => {
  const inv = openWithInventory(t);
  const server = createApp(inv.db, { tasks: createTasks({ db: inv.db }), events: createEvents() });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const sawdust = inv.item('Sawdust');
  const old = inv.item('Old bran');
  inv.item('Grey oyster blocks', 'blocks', 'blocks');
  inv.buy(sawdust, 0.35);
  inv.archive(old);
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/batches/stock-items`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { items: [{ id: sawdust, name: 'Sawdust', kind: 'other', unit: 'kg', unitCost: 0.35 }] });
  const url = `http://127.0.0.1:${server.address().port}/api/batches`;
  const made = await (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'made', crop: 'oyster', blocks: 100 }) })).json();
  assert.equal((await (await fetch(`${url}/${made.id}`)).json()).inventory, true, 'the detail says the farm has Inventory');
});

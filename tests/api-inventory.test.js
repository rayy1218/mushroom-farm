// The inventory routes (spec 2026-11-05-inventory-design.md 7): the list, items, purchases, uses, counts, edits, deletes,
// throw-outs, the purchases for Costs, the 4-5 sheet; the 'inventory' events, and a 'batches' event read again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const server = createApp(db, { login: false, events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const inventoryEvents = () => seen.filter(([type]) => type === 'inventory').map(([, data]) => data);
  return { db, events, call, inventoryEvents };
}

test('items: add, list, read, edit, archive, delete', async (t) => {
  const { call, inventoryEvents } = await app(t);
  const made = await call('POST', '/api/inventory/items', { name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.id;
  assert.deepEqual(inventoryEvents().at(-1), { itemId: id });
  const list = await call('GET', '/api/inventory');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map((i) => i.name), ['Bleach']);
  assert.deepEqual(list.body.attention, { low: 1, soon: 0, expired: 0 });
  const bad = await call('POST', '/api/inventory/items', { name: 'bleach', kind: 'chemical', unit: 'L' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'name');
  assert.equal((await call('GET', `/api/inventory/items/${id}`)).body.name, 'Bleach');
  assert.equal((await call('PUT', `/api/inventory/items/${id}`, { reorderAt: 3 })).body.reorderAt, 3);
  assert.equal((await call('PUT', `/api/inventory/items/${id}`, { archived: true })).body.archived, true);
  assert.deepEqual((await call('GET', '/api/inventory')).body.items, []);
  assert.equal((await call('GET', '/api/inventory?archived=1')).body.items.length, 1);
  assert.equal((await call('DELETE', `/api/inventory/items/${id}`)).status, 204);
  assert.equal((await call('GET', `/api/inventory/items/${id}`)).status, 404);
  assert.equal((await call('PATCH', `/api/inventory/items/${id}`, {})).status, 404);
});

test('purchase, use, count, edit, delete and throw out', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/inventory/items', { name: 'Spawn', kind: 'spawn', unit: 'kg' })).body.id;
  const buy = await call('POST', '/api/inventory/purchases', { itemId: id, qty: 3, total: 30, useBy: '2000-01-01', day: null });
  assert.equal(buy.status, 400, 'a use-by before the day bought');
  assert.equal(buy.body.field, 'useBy');
  const ok = await call('POST', '/api/inventory/purchases', { itemId: id, qty: 3, total: 30 });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const used = await call('POST', '/api/inventory/uses', { itemId: id, qty: 1, worker: 'Ali' });
  assert.equal(used.status, 201, JSON.stringify(used.body));
  assert.equal(used.body.qty, -1);
  assert.equal((await call('POST', '/api/inventory/uses', { itemId: id, qty: 1 })).body.field, 'worker');
  const counted = await call('POST', '/api/inventory/counts', { worker: 'Ali', counts: [{ itemId: id, qty: 1.5 }] });
  assert.equal(counted.status, 201);
  assert.equal(counted.body.moves[0].qty, -0.5);
  assert.equal((await call('PUT', `/api/inventory/moves/${used.body.id}`, { qty: 2 })).body.qty, -2);
  assert.equal((await call('PUT', `/api/inventory/moves/${counted.body.moves[0].id}`, { qty: 2 })).status, 409);
  assert.equal((await call('POST', `/api/inventory/lots/${ok.body.id}/throw-out`, { worker: 'Ali' })).status, 409, 'no use-by');
  assert.equal((await call('DELETE', `/api/inventory/moves/${used.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/inventory/moves/${used.body.id}`)).status, 404);
  const page = await call('GET', `/api/inventory/items/${id}`);
  assert.deepEqual(page.body.moves.map((m) => m.refKind), ['adjust', 'purchase']);
});

test("a batch move is shown and never changed here", async (t) => {
  const { db, call } = await app(t);
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  const [move] = db.insertStockMoves([{ itemId: blocks.id, at: Date.now(), qty: 500, refKind: 'batch', refId: 3, unitCost: 1.2 }]);
  assert.equal((await call('GET', `/api/inventory/items/${blocks.id}`)).body.qty, 500);
  const put = await call('PUT', `/api/inventory/moves/${move.id}`, { qty: 1 });
  assert.equal(put.status, 409);
  assert.equal(put.body.error, 'Change it in Batches');
  assert.equal((await call('DELETE', `/api/inventory/moves/${move.id}`)).status, 409);
  assert.equal((await call('POST', '/api/inventory/purchases', { itemId: blocks.id, qty: 1, total: 1 })).status, 409);
});

test('the purchases for Costs: the contract shape; from and to checked', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/inventory/items', { name: 'Punnets', kind: 'packaging', unit: 'pcs' })).body.id;
  const buy = (await call('POST', '/api/inventory/purchases', { itemId: id, qty: 500, total: 75 })).body;
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const got = await call('GET', `/api/inventory/purchases?from=${today}&to=${today}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.body, { purchases: [{ id: buy.id, itemId: id, name: 'Punnets', kind: 'packaging', at: buy.at, qty: 500, unitCost: 0.15, total: 75 }] });
  assert.equal((await call('GET', '/api/inventory/purchases')).status, 400);
  assert.equal((await call('GET', `/api/inventory/purchases?from=${today}&to=2000-01-01`)).body.field, 'from');
});

test('the 4-5 sheet: 30 days by default, 30, 90 or 365', async (t) => {
  const { call } = await app(t);
  const got = await call('GET', '/api/inventory/sheet');
  assert.equal(got.status, 200);
  assert.equal(got.body.days, 30);
  assert.deepEqual(got.body.rows, []);
  assert.equal((await call('GET', '/api/inventory/sheet?days=365')).body.days, 365);
  assert.equal((await call('GET', '/api/inventory/sheet?days=7')).status, 400);
  assert.equal((await call('GET', '/api/inventory/sheet?days=abc')).status, 400);
});

test("a 'batches' event is read again: the pages hear 'inventory' with no item", async (t) => {
  const { events, inventoryEvents } = await app(t);
  events.publish('batches', { id: 3 });
  assert.deepEqual(inventoryEvents().at(-1), { itemId: null });
});

test('an unknown inventory path is a 404', async (t) => {
  const { call } = await app(t);
  assert.equal((await call('GET', '/api/inventory/nothing')).status, 404);
  assert.equal((await call('POST', '/api/inventory', {})).status, 404);
});

test('a throw-out of a lot near its use-by; unknown move and unknown item are 404', async (t) => {
  const { call } = await app(t);
  const made = await call('POST', '/api/inventory/items', { name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const farmDay = (plus) => new Date(Date.now() + 8 * 3_600_000 + plus * 86_400_000).toISOString().slice(0, 10);
  const buy = await call('POST', '/api/inventory/purchases', { itemId: made.body.id, qty: 3, total: 30, useBy: farmDay(3) });
  assert.equal(buy.status, 201, JSON.stringify(buy.body));
  const out = await call('POST', `/api/inventory/lots/${buy.body.id}/throw-out`, { worker: 'Ali' });
  assert.equal(out.status, 201, JSON.stringify(out.body));
  assert.equal(out.body.qty, -3);
  const noMove = await call('PUT', '/api/inventory/moves/99999', { qty: 1 });
  assert.equal(noMove.status, 404);
  assert.equal(noMove.body.error, 'No such record');
  const noItem = await call('POST', '/api/inventory/uses', { itemId: 99999, qty: 1, worker: 'Ali' });
  assert.equal(noItem.status, 404);
  assert.equal(noItem.body.error, 'No such item');
});

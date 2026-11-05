// The Sales routes (spec 2026-11-05-sales-design.md 5): buyers, record, edit, paid, delete, the page's view, the sheet's
// range, the summary for Costs (its exact shape), the CSV, the checks and the 'sales' events.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { createEvents } from '../server/events.js';
import { EVENT_TYPES } from '../web/live.js';

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const tasks = createTasks({ db, now: () => Date.now() });
  const server = createApp(db, { tasks, events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const raw = (method, path, body) => fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const call = async (method, path, body) => {
    const res = await raw(method, path, body);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const salesEvents = () => seen.filter(([type]) => type === 'sales');
  return { call, raw, salesEvents };
}

test('the live stream knows the sales event', () => {
  assert.ok(EVENT_TYPES.includes('sales'));
});

test('buyers: add, list, edit, a name taken, delete; each write tells the pages', async (t) => {
  const { call, salesEvents } = await app(t);
  const made = await call('POST', '/api/buyers', { name: 'Kedai Ah Seng', phone: '012', prices: { oyster: 12 } });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal((await call('POST', '/api/buyers', { name: 'kedai ah seng' })).status, 409);
  const bad = await call('POST', '/api/buyers', { name: '' });
  assert.deepEqual([bad.status, bad.body.field], [400, 'name']);
  const list = await call('GET', '/api/buyers');
  assert.deepEqual(list.body.buyers.map((b) => [b.name, b.sales, b.owed]), [['Kedai Ah Seng', 0, 0]]);
  assert.equal((await call('PUT', `/api/buyers/${made.body.id}`, { phone: '013' })).body.phone, '013');
  assert.equal((await call('PUT', '/api/buyers/999', { phone: '1' })).status, 404);
  assert.equal((await call('DELETE', `/api/buyers/${made.body.id}`)).status, 204);
  assert.equal(salesEvents().length, 3);
});

test('a sale: record, edit, paid, the view, delete; checks with their fields', async (t) => {
  const { call, salesEvents } = await app(t);
  const buyer = (await call('POST', '/api/buyers', { name: 'Borong Lim' })).body;
  const soldAt = Date.now() - 3_600_000;
  const made = await call('POST', '/api/sales', { soldAt, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 12, priceKg: 10.5 }] });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.total, 126);
  const bad = await call('POST', '/api/sales', { soldAt, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: -1, priceKg: 1 }] });
  assert.deepEqual([bad.status, bad.body.field], [400, 'lines.0.kg']);
  const id = made.body.id;
  const put = await call('PUT', `/api/sales/deliveries/${id}`, { soldAt, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 10, priceKg: 10 }] });
  assert.equal(put.body.total, 100);
  const paid = await call('PUT', `/api/sales/deliveries/${id}/paid`, { paidAt: Date.now() });
  assert.equal(paid.status, 200, JSON.stringify(paid.body));
  assert.ok(paid.body.paidAt > 0);
  const view = await call('GET', '/api/sales');
  assert.equal(view.status, 200);
  assert.deepEqual([view.body.days, view.body.deliveries.length, view.body.owed.total], [30, 1, 0]);
  assert.equal((await call('GET', '/api/sales?days=31')).status, 400);
  assert.equal((await call('GET', '/api/sales?days=abc')).status, 400);
  assert.equal((await call('DELETE', '/api/buyers/' + buyer.id)).status, 409);
  assert.equal((await call('DELETE', `/api/sales/deliveries/${id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/sales/deliveries/${id}`)).status, 404);
  assert.equal(salesEvents().length, 5, 'buyer, record, edit, paid, delete');
});

test('the summary for Costs: the contract\'s exact shape; the range and the CSV', async (t) => {
  const { call, raw } = await app(t);
  const buyer = (await call('POST', '/api/buyers', { name: 'Borong Lim' })).body;
  await call('POST', '/api/sales', { soldAt: Date.now() - 3_600_000, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 10 }] });
  const s = await call('GET', '/api/sales/summary');
  assert.deepEqual(s.body, { kg: 2, total: 20, byCrop: [{ crop: 'oyster', kg: 2, total: 20 }], byRun: [] });
  assert.equal((await call('GET', '/api/sales/summary?from=2026-13-01')).status, 400);
  assert.equal((await call('GET', '/api/sales/summary?run=x')).status, 400);
  assert.equal((await call('GET', '/api/sales/summary?run=3')).body.kg, 0);
  assert.equal((await call('GET', '/api/sales/range?from=2026-11-01&to=2026-11-05')).status, 200);
  assert.equal((await call('GET', '/api/sales/range?from=2026-11-05')).status, 400);
  const csv = await raw('GET', '/api/sales.csv?days=7');
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.headers.get('content-disposition'), /sales /);
  // fetch's text() drops a leading BOM, so read the bytes and keep it
  const sheet = new TextDecoder('utf-8', { ignoreBOM: true }).decode(await csv.arrayBuffer());
  assert.ok(sheet.startsWith('\ufeffdate,time,buyer'));
});

test('review: an empty run, run=0, days=7.0, unknown methods, event payloads, the CSV name', async (t) => {
  const { call, raw, salesEvents } = await app(t);
  assert.equal((await call('GET', '/api/sales/summary?from=&to=&run=')).status, 200);
  const zero = await call('GET', '/api/sales/summary?run=0');
  assert.deepEqual([zero.status, zero.body.field], [400, 'run']);
  const seven = await call('GET', '/api/sales?days=7.0');
  assert.deepEqual([seven.status, seven.body.field], [400, 'days']);
  for (const [method, path] of [['PATCH', '/api/sales'], ['GET', '/api/sales/deliveries/1'], ['DELETE', '/api/sales/deliveries/1/paid'], ['POST', '/api/buyers/1'], ['GET', '/api/sales/']]) {
    assert.equal((await call(method, path, method === 'GET' || method === 'DELETE' ? undefined : {})).status, 404, `${method} ${path}`);
  }
  assert.equal(salesEvents().length, 0);
  const buyer = (await call('POST', '/api/buyers', { name: 'Lim' })).body;
  await call('POST', '/api/sales', { soldAt: Date.now() - 3_600_000, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 1, priceKg: 1 }] });
  assert.ok(salesEvents().length >= 2);
  for (const [, data] of salesEvents()) assert.deepEqual(data, {});
  const csv = await raw('GET', '/api/sales.csv?days=7');
  assert.match(csv.headers.get('content-disposition'), /^attachment; filename="sales \d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv"; filename\*=UTF-8''/);
});

// The costs routes (spec 2026-11-05-costs-design.md 5): the writes, the 400s with their field, the 404s, the month view, the
// contract's summary, and the costs event on each write.

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
  const server = createApp(db, { events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const costEvents = () => seen.filter(([type]) => type === 'costs');
  return { call, costEvents };
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('add, list, edit, delete a cost; each write publishes costs', async (t) => {
  const { call, costEvents } = await app(t);
  const made = await call('POST', '/api/costs', { date: today(), category: 'repairs', amount: 12.5, note: 'Fan belt' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.amount, 12.5);
  assert.equal((await call('GET', '/api/costs')).body.costs.length, 1);
  const put = await call('PUT', `/api/costs/${made.body.id}`, { amount: 15 });
  assert.equal(put.status, 200);
  assert.equal(put.body.amount, 15);
  const bad = await call('POST', '/api/costs', { date: today(), category: 'nope', amount: 1 });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'category');
  assert.equal((await call('PUT', '/api/costs/9999', { amount: 1 })).status, 404);
  assert.equal((await call('DELETE', `/api/costs/${made.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/costs/${made.body.id}`)).status, 404);
  assert.equal(costEvents().length, 3, 'add, edit, delete');
});

test('change and stop a monthly item', async (t) => {
  const { call } = await app(t);
  const month = today().slice(0, 7);
  const rent = await call('POST', '/api/costs', { date: `${month}-01`, category: 'rent', amount: 100, repeat: 'monthly' });
  const changed = await call('POST', `/api/costs/${rent.body.id}/change`, { from: month, amount: 120 });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal(changed.body.started.amount, 120);
  const stopped = await call('POST', `/api/costs/${rent.body.id}/stop`, { after: month });
  assert.equal(stopped.status, 200);
  assert.equal(stopped.body.repeatUntil, month);
  assert.equal((await call('POST', `/api/costs/${rent.body.id}/stop`, { after: 'x' })).body.field, 'after');
  assert.equal((await call('POST', '/api/costs/9999/stop', { after: month })).status, 404);
});

test('the month view and the summary', async (t) => {
  const { call } = await app(t);
  const view = await call('GET', '/api/costs/month');
  assert.equal(view.status, 200);
  assert.equal(view.body.month, today().slice(0, 7));
  assert.equal((await call('GET', '/api/costs/month?month=2999-01')).status, 400);
  const sum = await call('GET', '/api/costs/summary');
  assert.equal(sum.status, 200);
  assert.deepEqual(Object.keys(sum.body), ['total', 'byCategory', 'energy', 'water', 'income', 'profit', 'profitPerKg']);
  assert.equal((await call('GET', '/api/costs/summary?run=abc')).status, 400);
  assert.equal((await call('GET', '/api/costs/summary?run=9999')).status, 404);
  assert.equal((await call('PATCH', '/api/costs/1')).status, 404);
});

test('the summary range, the past month and the wrong methods', async (t) => {
  const { call } = await app(t);
  const first = `${today().slice(0, 7)}-01`;
  const ok = await call('GET', `/api/costs/summary?from=${first}&to=${today()}`);
  assert.equal(ok.status, 200);
  const future = await call('GET', '/api/costs/summary?from=2999-01-01');
  assert.deepEqual([future.status, future.body.field], [400, 'from']);
  const backwards = await call('GET', `/api/costs/summary?from=${today()}&to=${first === today() ? '2000-01-01' : first}`);
  assert.deepEqual([backwards.status, backwards.body.field], [400, 'to']);
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  const past = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const view = await call('GET', `/api/costs/month?month=${past}`);
  assert.equal(view.status, 200, JSON.stringify(view.body));
  assert.equal(view.body.month, past);
  assert.equal((await call('POST', '/api/costs/month', {})).status, 404);
  assert.equal((await call('DELETE', '/api/costs')).status, 404);
  assert.equal((await call('GET', '/api/costs/1/change')).status, 404);
});

test('change and stop each publish one costs event; a refused write none', async (t) => {
  const { call, costEvents } = await app(t);
  const month = today().slice(0, 7);
  const rent = await call('POST', '/api/costs', { date: `${month}-01`, category: 'rent', amount: 100, repeat: 'monthly' });
  assert.equal(costEvents().length, 1);
  assert.equal((await call('POST', `/api/costs/${rent.body.id}/change`, { from: month, amount: 120 })).status, 200);
  assert.equal(costEvents().length, 2, 'change');
  assert.equal((await call('POST', `/api/costs/${rent.body.id}/stop`, { after: month })).status, 200);
  assert.equal(costEvents().length, 3, 'stop');
  assert.equal((await call('POST', `/api/costs/${rent.body.id}/stop`, { after: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/costs/9999/change', { from: month, amount: 1 })).status, 404);
  assert.equal((await call('POST', '/api/costs', { category: 'nope' })).status, 400);
  assert.equal((await call('DELETE', '/api/costs/9999')).status, 404);
  assert.equal(costEvents().length, 3, 'refused writes publish nothing');
});

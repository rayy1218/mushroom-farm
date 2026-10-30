// The tasks' Settings over HTTP (spec 2026-10-30-tasks-design.md sections 3.4, 6 and 7.3): the workers and the task rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

async function app(t, { controller = null } = {}) {
  const db = openDb(':memory:');
  const server = createApp(db, { controller });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, call };
}

const tasksOf = async (call, id) => (await call('GET', `/api/rooms/${id}/tasks`)).body;
const byRule = (rows, key) => rows.find((r) => r.ruleKey === key);

test('workers: none at first; add, rename and remove by putting the whole list; a bare list is taken too', async (t) => {
  const { call } = await app(t);
  assert.deepEqual(await call('GET', '/api/workers'), { status: 200, body: { workers: [] } });
  const added = await call('PUT', '/api/workers', { workers: [{ name: ' Ali ', active: true }, { name: 'Siti' }] });
  assert.equal(added.status, 200);
  assert.deepEqual(added.body.workers.map((w) => [w.name, w.active]), [['Ali', true], ['Siti', true]]);
  const [ali, siti] = added.body.workers;
  assert.ok(Number.isInteger(ali.id) && Number.isInteger(siti.id));
  const swapped = await call('PUT', '/api/workers', { workers: [{ id: ali.id, name: 'Siti', active: true }, { id: siti.id, name: 'Ali', active: false }] });
  assert.deepEqual(swapped.body.workers, [{ id: siti.id, name: 'Ali', active: false }, { id: ali.id, name: 'Siti', active: true }]); // by name
  const removed = await call('PUT', '/api/workers', { workers: [{ id: ali.id, name: 'Ali bin Abu', active: true }] });
  assert.deepEqual(removed.body.workers, [{ id: ali.id, name: 'Ali bin Abu', active: true }]);
  assert.deepEqual(await call('GET', '/api/workers'), removed);
  const bare = await call('PUT', '/api/workers', [{ id: ali.id, name: 'Ali bin Abu', active: true }, { name: 'Ah Kow' }]);
  assert.deepEqual(bare.body.workers.map((w) => w.name), ['Ah Kow', 'Ali bin Abu']); // by name
  assert.deepEqual(await call('POST', '/api/workers', { workers: [] }), { status: 404, body: { error: 'Not found' } });
});

test('workers: a name is required, of up to 40 characters, without control characters and not on the list twice; a refused list saves nothing', async (t) => {
  const { call } = await app(t);
  const put = (workers) => call('PUT', '/api/workers', { workers });
  const seeded = await put([{ name: 'Ali' }, { name: 'Siti' }]);
  const [ali, siti] = seeded.body.workers;
  for (const name of [undefined, '', '   ', 3]) {
    assert.deepEqual(await put([{ name: 'Ali' }, { name }]), { status: 400, body: { error: 'Name is required', field: 'workers.1.name' } });
  }
  assert.deepEqual(await put([{ name: 'x'.repeat(41) }]), { status: 400, body: { error: 'Name must be 40 characters or fewer', field: 'workers.0.name' } });
  // A parked name (during a swap) is U+0001 and the id: no real name may look like one.
  for (const name of ['\u00011', 'Ali\tbin Abu', 'Ali\u007f']) {
    assert.deepEqual(await put([{ name }]), { status: 400, body: { error: 'A name cannot hold control characters', field: 'workers.0.name' } });
  }
  assert.deepEqual(await put([{ name: 'Ali' }, { name: 'ali ' }]), { status: 400, body: { error: 'A worker called "ali" already exists', field: 'workers.1.name' } });
  assert.deepEqual(await put([{ name: 'Ali', active: 'yes' }]), { status: 400, body: { error: 'Active must be true or false', field: 'workers.0.active' } });
  assert.deepEqual(await put([{ id: 999, name: 'Ali' }]), { status: 400, body: { error: 'Unknown worker', field: 'workers.0.id' } });
  assert.deepEqual(await put([{ id: ali.id, name: 'Ali' }, { id: ali.id, name: 'Ah Kow' }]), {
    status: 400, body: { error: 'A worker is on the list twice', field: 'workers.1.id' },
  });
  assert.deepEqual(await put(['Ali']), { status: 400, body: { error: 'Each worker must be an object with a name', field: 'workers.0' } });
  assert.deepEqual(await call('PUT', '/api/workers', { workers: 'Ali' }), { status: 400, body: { error: 'Workers must be a list', field: 'workers' } });
  // A rename, a removal and a new worker, with one bad item: none of it is saved.
  assert.deepEqual(await put([{ id: ali.id, name: 'Ali bin Abu', active: true }, { name: 'Ah Kow' }, { name: 'Mei', active: 'yes' }]), {
    status: 400, body: { error: 'Active must be true or false', field: 'workers.2.active' },
  });
  assert.deepEqual(await call('GET', '/api/workers'), { status: 200, body: { workers: [ali, siti] } });
  assert.equal((await put([{ name: 'x'.repeat(40) }])).status, 200);
});

test('a renamed worker leaves the done rows as they were', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const [ali] = (await call('PUT', '/api/workers', { workers: [{ name: 'Ali' }] })).body.workers;
  const footbath = byRule((await tasksOf(call, id)).today, 'footbath');
  await call('POST', `/api/tasks/${footbath.id}/done`, { worker: 'Ali' });
  await call('PUT', '/api/workers', { workers: [{ id: ali.id, name: 'Ali bin Abu', active: true }] });
  const [row] = (await call('GET', `/api/rooms/${id}/tasks/log`)).body.rows;
  assert.equal(row.worker, 'Ali');
});

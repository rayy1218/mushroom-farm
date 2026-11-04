// The harvest routes (spec 2026-11-04-harvest-design.md 6): record, list, edit and delete a room's harvests, the farm view and
// its CSV, the days check, and the events the pages listen for.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { createEvents } from '../server/events.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const OYSTER = [{ crop: 'oyster', blocks: 500 }];
const MIXED = [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 100 }];

async function app(t) {
  const db = openDb(':memory:');
  const now = Date.now();
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const tasks = createTasks({ db, now: () => now });
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
  let n = 0;
  async function room(crops = OYSTER) {
    n += 1;
    const made = await call('POST', '/api/rooms', { ...ROOM, name: `Room ${n}`, trhAddress: n });
    assert.equal((await call('PUT', `/api/rooms/${made.body.id}/crop`, { crops })).status, 200);
    db.setProgram(made.body.id, { ...db.getProgram(made.body.id), stage: 'fruiting', stageSince: now });
    return made.body.id;
  }
  const harvestEvents = () => seen.filter(([type]) => type === 'harvest').map(([, data]) => data);
  return { db, call, raw, room, seen, harvestEvents };
}

test('record, list, edit and delete a room\'s harvests', async (t) => {
  const { call, room } = await app(t);
  const id = await room();
  const made = await call('POST', `/api/rooms/${id}/harvests`, { kg: 3.5, crop: 'oyster', worker: 'Ali' });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.kg, 3.5);
  const list = await call('GET', `/api/rooms/${id}/harvests`);
  assert.equal(list.status, 200);
  assert.equal(list.body.current.harvests.length, 1);
  assert.deepEqual(list.body.past, []);

  const bad = await call('POST', `/api/rooms/${id}/harvests`, { kg: -1, crop: 'oyster' });
  assert.equal(bad.status, 400);
  assert.ok(bad.body.field);

  const put = await call('PUT', `/api/harvests/${made.body.id}`, { kg: 4 });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.kg, 4);
  assert.equal((await call('PUT', '/api/harvests/99999', { kg: 4 })).status, 404);

  const gone = await call('DELETE', `/api/harvests/${made.body.id}`);
  assert.equal(gone.status, 204);
  assert.equal(gone.body, null);
  assert.equal((await call('DELETE', `/api/harvests/${made.body.id}`)).status, 404);

  assert.equal((await call('POST', '/api/rooms/9999/harvests', { kg: 1 })).status, 404);
  assert.equal((await call('GET', '/api/rooms/9999/harvests')).status, 404);
  const bare = await call('POST', '/api/rooms', { ...ROOM, name: 'Bare', trhAddress: 40 });
  const none = await call('POST', `/api/rooms/${bare.body.id}/harvests`, { kg: 1 });
  assert.equal(none.status, 409);
  assert.equal(none.body.error, 'No crops in this room');

  assert.equal((await call('PATCH', `/api/rooms/${id}/harvests`, {})).status, 404);
  assert.equal((await call('GET', '/api/harvests/1')).status, 404);
  assert.equal((await call('POST', '/api/harvest', {})).status, 404);
});

test('GET /api/harvest and its CSV; days must be 7, 30, 90 or 365', async (t) => {
  const { call, raw, room } = await app(t);
  const id = await room();
  await call('POST', `/api/rooms/${id}/harvests`, { kg: 2, crop: 'oyster', worker: 'Ali' });
  const farm = await call('GET', '/api/harvest');
  assert.equal(farm.status, 200);
  assert.equal(farm.body.buckets.length, 30);
  assert.equal((await call('GET', '/api/harvest?days=7')).body.buckets.length, 7);
  for (const days of ['45', '', 'abc', '30.5', '-7', '7%20']) {
    const bad = await call('GET', `/api/harvest?days=${days}`);
    assert.equal(bad.status, 400, days);
    assert.equal(bad.body.field, 'days');
  }
  assert.equal((await call('GET', '/api/harvest.csv?days=45')).status, 400);

  const csv = await raw('GET', '/api/harvest.csv?days=90');
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.match(csv.headers.get('content-disposition'), /^attachment; filename="harvests /);
  const bytes = new Uint8Array(await csv.arrayBuffer()); // text() would drop the BOM
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.match(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes), /^\uFEFF.*\r\n.*2/s);
  const dflt = await raw('GET', '/api/harvest.csv');
  assert.equal(dflt.status, 200);
  assert.equal((await raw('POST', '/api/harvest.csv')).status, 404);
});

test('a harvest event with the room id on each write; a check\'s harvest edit or delete also tells the Tasks tab', async (t) => {
  const { call, room, harvestEvents, seen } = await app(t);
  const id = await room();
  const made = await call('POST', `/api/rooms/${id}/harvests`, { kg: 1, crop: 'oyster', worker: 'Ali' });
  assert.deepEqual(harvestEvents(), [{ roomId: id }]);
  await call('PUT', `/api/harvests/${made.body.id}`, { kg: 2 });
  await call('DELETE', `/api/harvests/${made.body.id}`);
  assert.deepEqual(harvestEvents(), [{ roomId: id }, { roomId: id }, { roomId: id }]);
  assert.equal(seen.filter(([type, d]) => type === 'room' && d.part === 'tasks').length, 0, 'a record by hand is no task change');

  const today = await call('GET', `/api/rooms/${id}/tasks`);
  assert.equal(today.status, 200, JSON.stringify(today.body));
  const row = today.body.today.find((r) => r.ruleKey === 'harvestAm');
  const done = await call('POST', `/api/tasks/${row.id}/done`, { worker: 'Ali', amount: 2 });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(harvestEvents().length, 4, 'the Done of a harvest check publishes one');
  const tasksBefore = seen.filter(([type, d]) => type === 'room' && d.part === 'tasks').length;
  const picked = (await call('GET', `/api/rooms/${id}/harvests`)).body;
  const fromTask = picked.current.harvests.find((h) => h.taskId === row.id);
  assert.ok(fromTask, JSON.stringify(picked));
  await call('PUT', `/api/harvests/${fromTask.id}`, { kg: 2.5 });
  assert.equal(harvestEvents().length, 5);
  assert.equal(seen.filter(([type, d]) => type === 'room' && d.part === 'tasks' && d.id === id).length, tasksBefore + 1);
  await call('DELETE', `/api/harvests/${fromTask.id}`);
  assert.equal(harvestEvents().length, 6);
  assert.equal(seen.filter(([type, d]) => type === 'room' && d.part === 'tasks' && d.id === id).length, tasksBefore + 2);
});

test('the Done body amounts on a mixed room through POST /api/tasks/:id/done', async (t) => {
  const { call, room, harvestEvents } = await app(t);
  const id = await room(MIXED);
  const row = (await call('GET', `/api/rooms/${id}/tasks`)).body.today.find((r) => r.ruleKey === 'harvestAm');
  const refused = await call('POST', `/api/tasks/${row.id}/done`, { worker: 'Ali', amount: 3 });
  assert.equal(refused.status, 400);
  assert.equal(refused.body.field, 'amount');
  assert.deepEqual(harvestEvents(), []);
  const done = await call('POST', `/api/tasks/${row.id}/done`, { worker: 'Ali', amounts: { oyster: 2, lionsmane: 0.5 } });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.amount, 2.5);
  assert.deepEqual(harvestEvents(), [{ roomId: id }]);
});

// The tasks' live events (spec 2026-10-30-tasks-design.md section 6): a change publishes room { id, part: 'tasks' } and
// tasks { due }, whether a route made it or the controller's daily making; a look that changes nothing publishes nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';
import { createTasks } from '../server/tasks.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const tasks = createTasks({ db });
  const server = createApp(db, { events, tasks });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const got = [];
  events.subscribe((type, data) => got.push([type, data]));
  return { db, tasks, call, got };
}

const byRule = (rows, key) => rows.find((r) => r.ruleKey === key);
const onlyTasks = (got, id) => got.every(([type, data]) => type === 'tasks' || (type === 'room' && data.id === id && data.part === 'tasks'));

test('Done, Skip and Add publish the room part tasks and the farm due count; a GET that makes nothing publishes nothing', async (t) => {
  const { call, got } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  await call('PUT', `/api/rooms/${id}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] });
  const view = (await call('GET', `/api/rooms/${id}/tasks`)).body; // the first look makes the day's rows
  assert.deepEqual(got.slice(-2), [['room', { id, part: 'tasks' }], ['tasks', { due: view.counts.due }]]);
  got.length = 0;
  await call('GET', `/api/rooms/${id}/tasks`);
  await call('GET', '/api/tasks/today');
  assert.deepEqual(got, []);
  await call('POST', `/api/tasks/${byRule(view.today, 'harvestAm').id}/done`, { worker: 'Ali', amount: 1 });
  assert.deepEqual(got.slice(-2), [['room', { id, part: 'tasks' }], ['tasks', { due: view.counts.due - 1 }]]);
  got.length = 0;
  await call('POST', `/api/tasks/${byRule(view.upkeep, 'flyTraps').id}/skip`, { worker: 'Ali', reason: 'None in stock' });
  assert.deepEqual(got.slice(-2), [['room', { id, part: 'tasks' }], ['tasks', { due: view.counts.due - 2 }]]);
  got.length = 0;
  await call('POST', `/api/rooms/${id}/tasks`, { text: 'Fix the door seal' });
  assert.deepEqual(got, [['room', { id, part: 'tasks' }], ['tasks', { due: view.counts.due - 2 }]]);
  got.length = 0;
  assert.equal((await call('POST', `/api/tasks/${byRule(view.today, 'harvestAm').id}/done`, { worker: 'Ali' })).status, 409);
  assert.equal((await call('POST', `/api/tasks/${byRule(view.today, 'harvestPm').id}/done`, { worker: '' })).status, 400);
  assert.deepEqual(got, []); // a refused change publishes nothing
});

test("the controller's daily making (ensureDay outside a route) publishes too", async (t) => {
  const { db, tasks, got } = await app(t);
  const id = db.createRoom(ROOM).id; // no crops: footbath, floor and the five upkeep rows
  tasks.ensureDay(id);
  assert.ok(onlyTasks(got, id));
  assert.deepEqual(got.slice(-2), [['room', { id, part: 'tasks' }], ['tasks', { due: 7 }]]);
  got.length = 0;
  tasks.ensureDay(id);
  assert.deepEqual(got, []);
});

test('an own rule added in Settings makes its row in every room at once and publishes', async (t) => {
  const { db, tasks, call, got } = await app(t);
  const a = db.createRoom({ ...ROOM, name: 'Room A' }).id;
  const b = db.createRoom({ ...ROOM, name: 'Room B' }).id;
  tasks.ensureAll((await call('GET', '/api/tasks/today')).body.date);
  got.length = 0;
  await call('PUT', '/api/task-rules', { custom: [{ text: 'Check the water tank', rooms: null, everyDays: null, slot: 'morning', enabled: true }] });
  for (const id of [a, b]) assert.ok(got.some(([type, data]) => type === 'room' && data.id === id && data.part === 'tasks'));
  assert.deepEqual(got.at(-1), ['tasks', { due: 16 }]);
});

test('a room deleted publishes the farm due count without its rows', async (t) => {
  const { db, call, got } = await app(t);
  db.createRoom({ ...ROOM, name: 'Room A' });
  const b = db.createRoom({ ...ROOM, name: 'Room B' }).id;
  await call('GET', '/api/tasks/today'); // makes both rooms' rows: 7 each
  got.length = 0;
  assert.equal((await call('DELETE', `/api/rooms/${b}`)).status, 204);
  assert.deepEqual(got, [['room', { id: b, part: 'room' }], ['tasks', { due: 7 }]]);
});

test('a closed server no longer publishes the changes of the tasks it was given', async () => {
  const db = openDb(':memory:');
  const events = createEvents();
  const tasks = createTasks({ db });
  const server = createApp(db, { events, tasks });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  await new Promise((r) => server.close(r));
  const got = [];
  events.subscribe((type, data) => got.push([type, data]));
  tasks.ensureDay(db.createRoom(ROOM).id);
  assert.deepEqual(got, []);
  db.close();
});

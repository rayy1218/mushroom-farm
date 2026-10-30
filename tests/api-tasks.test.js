// The tasks over HTTP (spec 2026-10-30-tasks-design.md section 6): a room's tasks, Today, adding long-term tasks (own and
// Plan this), Done, Skip and Cancel with their errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { localDate, addDays } from '../server/task-rules.js';

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

// A room with grey oyster blocks, fruiting from now (the crop PUT starts the stage). → its id
async function fruitingRoom(call, name = 'Room 1') {
  const made = await call('POST', '/api/rooms', { ...ROOM, name });
  assert.equal((await call('PUT', `/api/rooms/${made.body.id}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] })).status, 200);
  return made.body.id;
}

const tasksOf = async (call, id) => (await call('GET', `/api/rooms/${id}/tasks`)).body;
const byRule = (rows, key) => rows.find((r) => r.ruleKey === key);
const hhmm = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

test("GET a room's tasks makes today's rows: the fruiting oyster day, the upkeep due today, no long-term yet; twice makes no more", async (t) => {
  const { call } = await app(t);
  const id = await fruitingRoom(call);
  const r = await call('GET', `/api/rooms/${id}/tasks`);
  assert.equal(r.status, 200);
  assert.equal(r.body.date, localDate(Date.now()));
  assert.deepEqual(r.body.today.map((x) => x.ruleKey).sort(), ['contamWalk', 'floorClean', 'footbath', 'harvestAm', 'harvestPm', 'humidifierCheck']);
  assert.ok(r.body.today.every((x) => x.kind === 'daily' && x.status === 'open' && x.roomId === id && x.date === r.body.date));
  assert.deepEqual(r.body.upkeep.map((x) => x.ruleKey).sort(), ['acChemWash', 'acFilter', 'acService', 'flyTraps', 'humidifierDescale']);
  assert.deepEqual(r.body.longterm, []);
  assert.deepEqual(r.body.counts, { due: 11, overdue: 0, longterm: 0 });
  const again = await call('GET', `/api/rooms/${id}/tasks`);
  assert.deepEqual(again.body.today.map((x) => x.id), r.body.today.map((x) => x.id));
  assert.deepEqual(again.body.upkeep.map((x) => x.id), r.body.upkeep.map((x) => x.id));
});

test("a room's tasks: 404 for no such room; only GET and POST", async (t) => {
  const { call } = await app(t);
  assert.deepEqual(await call('GET', '/api/rooms/999/tasks'), { status: 404, body: { error: 'Room not found' } });
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  assert.deepEqual(await call('DELETE', `/api/rooms/${id}/tasks`), { status: 404, body: { error: 'Not found' } });
});

test("Today: every room in the Overview's order with its rows; a room with no crops gets the footbath and the floor", async (t) => {
  const { db, call } = await app(t);
  await fruitingRoom(call, 'Room B');
  await call('POST', '/api/rooms', { ...ROOM, name: 'Room A' });
  const r = await call('GET', '/api/tasks/today');
  assert.equal(r.status, 200);
  assert.equal(r.body.date, localDate(Date.now()));
  assert.deepEqual(r.body.rooms.map((x) => [x.id, x.name]), db.listRooms().map((x) => [x.id, x.name]));
  const a = r.body.rooms.find((x) => x.name === 'Room A');
  assert.deepEqual(a.today.map((x) => x.ruleKey).sort(), ['floorClean', 'footbath']);
  assert.equal(a.upkeepDue.length, 5);
  assert.equal(a.longterm, 0);
  assert.equal(r.body.rooms.find((x) => x.name === 'Room B').today.length, 6);
  assert.deepEqual(await call('POST', '/api/tasks/today', {}), { status: 404, body: { error: 'Not found' } });
});

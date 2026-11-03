// GET /api/calendar (spec 2026-11-03-calendar-design.md 2 and 4): stored rows on past days and today, the upkeep due today,
// worked-out future days, the room filter, the errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { localDate, addDays } from '../server/task-rules.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

async function app(t) {
  const db = openDb(':memory:');
  const now = Date.now();
  const tasks = createTasks({ db, now: () => now });
  const server = createApp(db, { tasks });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  // A grey oyster room fruiting from the tasks' clock (as api-tasks.test.js). → its id
  async function fruitingRoom(name = 'Room 1') {
    const made = await call('POST', '/api/rooms', { ...ROOM, name });
    assert.equal((await call('PUT', `/api/rooms/${made.body.id}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] })).status, 200);
    db.setProgram(made.body.id, { ...db.getProgram(made.body.id), stageSince: now });
    return made.body.id;
  }
  return { db, call, fruitingRoom, now, today: localDate(now) };
}

const on = (body, date) => body.days.find((d) => d.date === date).items;

test('the days asked, today with its open rows, a later day worked out, each room with its crop and the horizon', async (t) => {
  const { call, fruitingRoom, today } = await app(t);
  const id = await fruitingRoom();
  const r = await call('GET', `/api/calendar?from=${addDays(today, -3)}&to=${addDays(today, 10)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.today, today);
  assert.equal(r.body.horizon, addDays(today, 92));
  assert.deepEqual(r.body.days.map((d) => d.date)[0], addDays(today, -3));
  assert.equal(r.body.days.length, 14);
  const harvest = on(r.body, today).find((i) => i.ruleKey === 'harvestAm');
  assert.equal(harvest.status, 'open');
  assert.equal(harvest.roomId, id);
  assert.equal(on(r.body, addDays(today, 1)).find((i) => i.ruleKey === 'harvestAm').status, 'planned');
  assert.equal(on(r.body, today).find((i) => i.ruleKey === 'footbath').routine, true);
  assert.deepEqual(r.body.rooms.map((x) => [x.id, x.crop.crops[0].crop]), [[id, 'oyster']]);
  assert.deepEqual(on(r.body, addDays(today, -1)), [], 'no rows that day');
});

test('a row done today shows done with who; a daily row left open on an earlier day shows missed', async (t) => {
  const { db, call, fruitingRoom, today, now } = await app(t);
  const id = await fruitingRoom();
  const rows = (await call('GET', `/api/rooms/${id}/tasks`)).body.today;
  const walk = rows.find((x) => x.ruleKey === 'footbath');
  assert.equal((await call('POST', `/api/tasks/${walk.id}/done`, { worker: 'Ali' })).status, 200);
  db.insertDailyTask({ roomId: id, ruleKey: 'floorClean', date: addDays(today, -2), slot: 'afternoon', text: 'Sweep', at: now });
  const r = await call('GET', `/api/calendar?from=${addDays(today, -2)}&to=${today}&room=${id}`);
  const done = on(r.body, today).find((i) => i.ruleKey === 'footbath');
  assert.equal(done.status, 'done');
  assert.equal(done.worker, 'Ali');
  assert.equal(on(r.body, addDays(today, -2)).find((i) => i.ruleKey === 'floorClean').status, 'missed');
});

test('room keeps one room; the errors', async (t) => {
  const { call, fruitingRoom, today } = await app(t);
  await fruitingRoom('Room A');
  const b = await fruitingRoom('Room B');
  const r = await call('GET', `/api/calendar?from=${today}&to=${today}&room=${b}`);
  assert.deepEqual(r.body.rooms.map((x) => x.id), [b]);
  assert.ok(on(r.body, today).every((i) => i.roomId === b));
  assert.deepEqual(await call('GET', `/api/calendar?from=${today}&to=${today}&room=999`), { status: 404, body: { error: 'Room not found' } });
  assert.equal((await call('GET', `/api/calendar?from=${today}&to=${today}&room=x`)).body.field, 'room');
  assert.equal((await call('GET', '/api/calendar?from=2026-02-30&to=2026-03-01')).body.field, 'from');
  assert.deepEqual((await call('GET', `/api/calendar?from=${today}&to=${addDays(today, 42)}`)).body, { error: 'Ask for 42 days or fewer', field: 'to' });
  assert.equal((await call('POST', `/api/calendar?from=${today}&to=${today}`, {})).status, 404);
});

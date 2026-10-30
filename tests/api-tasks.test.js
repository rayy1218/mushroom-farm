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

test('Add a long-term task of your own: text 1 to 120 characters, an optional note up to 500', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const made = await call('POST', `/api/rooms/${id}/tasks`, { text: '  Fix the door seal ', note: ' The bottom corner ' });
  assert.equal(made.status, 201);
  assert.equal(made.body.rows.length, 1);
  const row = made.body.rows[0];
  assert.deepEqual([row.roomId, row.kind, row.text, row.note, row.status, row.source], [id, 'longterm', 'Fix the door seal', 'The bottom corner', 'open', null]);
  assert.equal((await call('POST', `/api/rooms/${id}/tasks`, { text: 'Paint the walls', note: '' })).body.rows[0].note, null);
  assert.equal((await call('POST', `/api/rooms/${id}/tasks`, { text: 'x'.repeat(120) })).status, 201);
  for (const text of [undefined, '', '   ', 'x'.repeat(121), 5]) {
    assert.deepEqual(await call('POST', `/api/rooms/${id}/tasks`, { text, note: 'n' }), {
      status: 400, body: { error: 'Say what to do (1 to 120 characters)', field: 'text' },
    });
  }
  assert.deepEqual(await call('POST', `/api/rooms/${id}/tasks`, { text: 'Paint', note: 'x'.repeat(501) }), {
    status: 400, body: { error: 'The note must be at most 500 characters', field: 'note' },
  });
  assert.deepEqual(await call('POST', `/api/rooms/${id}/tasks`, { text: 'Paint', note: 7 }), {
    status: 400, body: { error: 'The note must be text', field: 'note' },
  });
  assert.deepEqual(await call('POST', `/api/rooms/${id}/tasks`, []), { status: 400, body: { error: 'Body must be a JSON object' } });
  assert.deepEqual(await call('POST', '/api/rooms/999/tasks', { text: 'Paint' }), { status: 404, body: { error: 'Room not found' } });
  const view = await tasksOf(call, id);
  assert.equal(view.longterm.length, 3);
  assert.equal(view.counts.longterm, 3);
});

test('Plan this: a suggestion makes one long-term row per machine that changes, with where it came from', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const at = Date.UTC(2026, 9, 29, 3, 0);
  const machines = [{ key: 'acBTU', from: 9000, to: 12000 }, { key: 'fanFlow', from: 150, to: 150 }, { key: 'dehumidifierLday', from: 0, to: 10 }];
  const made = await call('POST', `/api/rooms/${id}/tasks`, { suggestion: { machines, rmMonth: -42, suggestedAt: at } });
  assert.equal(made.status, 201);
  assert.deepEqual(made.body.rows.map((r) => r.text).sort(), ['Aircon 9,000 → 12,000 BTU/h', 'Dehumidifier none → 10 L/day']);
  assert.ok(made.body.rows.every((r) => r.kind === 'longterm' && r.status === 'open' && r.roomId === id));
  assert.deepEqual(made.body.rows.find((r) => r.source.machine === 'acBTU').source, { machine: 'acBTU', from: 9000, to: 12000, rmMonth: -42, suggestedAt: at });
  const same = await call('POST', `/api/rooms/${id}/tasks`, { suggestion: { machines: [{ key: 'fanFlow', from: 150, to: 150 }], rmMonth: 0, suggestedAt: at } });
  assert.deepEqual(same, { status: 400, body: { error: 'Nothing changes from what the room has now', field: 'suggestion' } });
  assert.deepEqual(await call('POST', '/api/rooms/999/tasks', { suggestion: { machines } }), { status: 404, body: { error: 'Room not found' } });
});

test('Plan this: a suggestion that is not one is 400 with the field', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const machinesError = { error: 'machines must be a list of { key, from, to } of the sized machines', field: 'suggestion' };
  const good = { machines: [{ key: 'acBTU', from: 9000, to: 12000 }], rmMonth: 10, suggestedAt: 1 };
  const post = (suggestion) => call('POST', `/api/rooms/${id}/tasks`, { suggestion });
  assert.deepEqual(await post('cheaper'), { status: 400, body: machinesError });
  for (const machines of [undefined, [{ key: 'pump', from: 1, to: 2 }], [{ key: 'acBTU', from: -1, to: 2 }], [{ key: 'acBTU', from: 1, to: '2' }],
    [{ key: 'acBTU', from: 1, to: 2_000_000 }], [{ key: 'acBTU', from: 1, to: 2 }, { key: 'acBTU', from: 2, to: 3 }], ['acBTU']]) {
    assert.deepEqual(await post({ ...good, machines }), { status: 400, body: machinesError });
  }
  assert.deepEqual(await post({ ...good, machines: [] }), { status: 400, body: { error: 'Nothing changes from what the room has now', field: 'suggestion' } });
  const numbers = { status: 400, body: { error: 'rmMonth and suggestedAt must be numbers', field: 'suggestion' } };
  assert.deepEqual(await post({ ...good, rmMonth: 'less' }), numbers);
  assert.deepEqual(await post({ ...good, suggestedAt: 'yesterday' }), numbers);
  const noMoney = await post({ machines: good.machines }); // rmMonth and suggestedAt left out: kept as none
  assert.equal(noMoney.status, 201);
  assert.deepEqual([noMoney.body.rows[0].source.rmMonth, noMoney.body.rows[0].source.suggestedAt], [null, null]);
});

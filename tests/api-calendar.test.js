// GET /api/calendar (spec 2026-11-03-calendar-design.md 2 and 4): stored rows on past days and today, the upkeep due today,
// worked-out future days, the room filter, the errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { localDate, addDays, dayStart } from '../server/task-rules.js';
import { advance } from '../server/program.js';
import { mixBands } from '../web/crops.js';

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
  assert.equal(done.id, walk.id, 'a stored row carries its id (a mixed Done\'s harvests are found by it)');
  assert.equal(on(r.body, addDays(today, -2)).find((i) => i.ruleKey === 'floorClean').status, 'missed');
  const later = await call('GET', `/api/calendar?from=${addDays(today, 1)}&to=${addDays(today, 1)}&room=${id}`);
  assert.ok(on(later.body, addDays(today, 1)).every((i) => i.id === undefined), 'a worked-out day has no rows');
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

// Code review 2026-11-03: the calendar's change day against what the farm makes on it, the old stage's rows at midnight and
// the new stage's at the change (the controller's advance), the old ones it no longer wants cancelled.
test("a change day's plan is what the farm makes: the old stage's rows until the change, the new stage's from it", () => {
  const db = openDb(':memory:');
  let now = 0;
  const tasks = createTasks({ db, now: () => now });
  const room = db.createRoom({ ...ROOM });
  const day = '2026-11-10';
  const change = dayStart(day) + 15 * 3_600_000; // 15:00 farm time
  db.setProgram(room.id, { ...db.getProgram(room.id), crops: [{ crop: 'oyster', blocks: 100 }], stage: 'fruiting', flush: 1, flushes: 4,
    stageSince: change - 7 * 86_400_000 });
  now = dayStart(addDays(day, -1)) + 10 * 3_600_000;
  const plan = tasks.calendarView({ from: day, to: day, roomId: room.id }).days[0].items.filter((i) => i.kind === 'daily');
  now = dayStart(day) + 30 * 60_000;
  tasks.ensureDay(room.id, day);
  const morning = new Set(db.dailyTasks(room.id, day).map((r) => r.ruleKey));
  now = change + 30 * 60_000;
  db.setProgram(room.id, advance(db.getProgram(room.id), now, mixBands([{ crop: 'oyster', blocks: 100 }], 'fruiting').bands).program);
  tasks.ensureDay(room.id, day);
  const rows = db.dailyTasks(room.id, day);
  assert.deepEqual(plan.map((i) => i.ruleKey).sort(), rows.map((r) => r.ruleKey).sort(), 'the same tasks');
  assert.deepEqual(plan.filter((i) => i.until).map((i) => i.ruleKey).sort(),
    rows.filter((r) => r.status === 'cancelled' && r.reason === 'Stage changed').map((r) => r.ruleKey).sort(), 'until: the ones the change cancels');
  assert.deepEqual(plan.filter((i) => i.from).map((i) => i.ruleKey).sort(), rows.filter((r) => !morning.has(r.ruleKey)).map((r) => r.ruleKey).sort(),
    'from: the ones made at the change');
  db.close();
});

test('overdue upkeep on today; a later stage start; a done program clears out', async (t) => {
  const { db, call, fruitingRoom, today, now } = await app(t);
  const id = await fruitingRoom();
  await call('GET', `/api/rooms/${id}/tasks`);
  const traps = db.openTasks(id, 'upkeep').find((r) => r.ruleKey === 'flyTraps');
  db.setTaskDue(traps.id, now - 2 * 86_400_000);
  const r = await call('GET', `/api/calendar?from=${today}&to=${addDays(today, 30)}&room=${id}`);
  assert.equal(on(r.body, today).find((i) => i.ruleKey === 'flyTraps').overdueDays, 2);
  const rest = r.body.days.find((d) => d.items.some((i) => i.kind === 'stage'));
  assert.deepEqual(rest.items.find((i) => i.kind === 'stage').stage, { stage: 'rest', flush: 1, done: false });
  db.setProgram(id, { ...db.getProgram(id), stage: 'rest', flush: 4, flushes: 4, done: true });
  const done = await call('GET', `/api/calendar?from=${addDays(today, 1)}&to=${addDays(today, 1)}&room=${id}`);
  assert.ok(on(done.body, addDays(today, 1)).some((i) => i.ruleKey === 'clearOut'));
});

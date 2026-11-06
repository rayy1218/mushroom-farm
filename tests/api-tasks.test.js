// The tasks over HTTP (spec 2026-10-30-tasks-design.md section 6): a room's tasks, Today, adding long-term tasks (own and
// Plan this), Done, Skip and Cancel with their errors.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { localDate, addDays } from '../server/task-rules.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

// The tasks module on a clock that stands still at the test's start, so a test that crosses midnight keeps its farm day.
async function app(t, { controller = null } = {}) {
  const db = openDb(':memory:');
  const now = Date.now();
  const tasks = createTasks({ db, now: () => now });
  const server = createApp(db, { login: false, controller, tasks });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  // A room with grey oyster blocks, fruiting from now (the crop PUT starts the stage on the real clock; its start is then
  // moved to the tasks' clock, the same day but for a PUT a moment past midnight). → its id
  async function fruitingRoom(name = 'Room 1') {
    const made = await call('POST', '/api/rooms', { ...ROOM, name });
    assert.equal((await call('PUT', `/api/rooms/${made.body.id}/crop`, { crops: [{ crop: 'oyster', blocks: 100 }] })).status, 200);
    db.setProgram(made.body.id, { ...db.getProgram(made.body.id), stageSince: now });
    return made.body.id;
  }
  return { db, call, fruitingRoom, today: localDate(now) };
}

const tasksOf = async (call, id) => (await call('GET', `/api/rooms/${id}/tasks`)).body;
const byRule = (rows, key) => rows.find((r) => r.ruleKey === key);
const hhmm = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

test("GET a room's tasks makes today's rows: the fruiting oyster day, the upkeep due today, no long-term yet; twice makes no more", async (t) => {
  const { call, fruitingRoom, today } = await app(t);
  const id = await fruitingRoom();
  const r = await call('GET', `/api/rooms/${id}/tasks`);
  assert.equal(r.status, 200);
  assert.equal(r.body.date, today);
  assert.deepEqual(r.body.today.map((x) => x.ruleKey).sort(), ['contamWalk', 'floorClean', 'footbath', 'harvestAm', 'harvestPm', 'humidifierCheck']);
  assert.ok(r.body.today.every((x) => x.kind === 'daily' && x.status === 'open' && x.roomId === id && x.date === r.body.date));
  assert.deepEqual(r.body.upkeep.map((x) => x.ruleKey).sort(), ['acChemWash', 'acFilter', 'acService', 'flyTraps', 'humidifierDescale']);
  assert.deepEqual(r.body.longterm, []);
  assert.deepEqual(r.body.counts, { due: 9, overdue: 0, longterm: 0 }, 'the 6 daily rows and the 3 upkeep rows of 7 days; the aircon service and wash come later');
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
  const { db, call, fruitingRoom, today } = await app(t);
  await fruitingRoom('Room B');
  await call('POST', '/api/rooms', { ...ROOM, name: 'Room A' });
  const r = await call('GET', '/api/tasks/today');
  assert.equal(r.status, 200);
  assert.equal(r.body.date, today);
  assert.deepEqual(r.body.rooms.map((x) => [x.id, x.name]), db.listRooms().map((x) => [x.id, x.name]));
  const a = r.body.rooms.find((x) => x.name === 'Room A');
  assert.deepEqual(a.today.map((x) => x.ruleKey).sort(), ['floorClean', 'footbath']);
  assert.equal(a.upkeepDue.length, 3, 'the 7-day rules; the aircon service and wash come later');
  assert.equal(a.longterm, 0);
  assert.equal(r.body.rooms.find((x) => x.name === 'Room B').today.length, 6);
  assert.deepEqual(await call('POST', '/api/tasks/today', {}), { status: 404, body: { error: 'Not found' } });
});

// The crop on each Today room (spec 2026-11-03-pictures-design.md 4): the room's crop reply without targets, for its picture.
test('Today: each room carries its crop, the crop reply without targets', async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom('Room B');
  await call('POST', '/api/rooms', { ...ROOM, name: 'Room A' });
  const { targets, ...expected } = (await call('GET', `/api/rooms/${id}/crop`)).body;
  const rooms = (await call('GET', '/api/tasks/today')).body.rooms;
  assert.deepEqual(rooms.find((x) => x.name === 'Room B').crop, expected);
  assert.deepEqual(rooms.find((x) => x.name === 'Room A').crop.crops, []);
});

test("a room's tasks carry its crop too, for the harvest pictures", async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom();
  const { targets, ...expected } = (await call('GET', `/api/rooms/${id}/crop`)).body;
  assert.deepEqual((await call('GET', `/api/rooms/${id}/tasks`)).body.crop, expected);
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
  const twice = await call('POST', `/api/rooms/${id}/tasks`, { suggestion: { machines, rmMonth: -42, suggestedAt: at } });
  assert.deepEqual(twice, { status: 409, body: { error: 'Already planned: see the Tasks tab', field: 'suggestion' } });
  assert.deepEqual(await call('POST', '/api/rooms/999/tasks', { suggestion: { machines } }), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(made.body.replaced, [], 'nothing open to replace the first time');
});

test('Plan this to another size: the reply lists the open plan it replaced (cancelled) besides the new rows; an own task replaces none', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const plan = (to) => call('POST', `/api/rooms/${id}/tasks`, { suggestion: { machines: [{ key: 'humidifierLH', from: 0.5, to }], rmMonth: 5, suggestedAt: 1 } });
  const first = (await plan(1)).body.rows[0];
  const again = await plan(2);
  assert.equal(again.status, 201);
  assert.deepEqual(again.body.rows.map((r) => r.text), ['Humidifier 0.5 → 2 L/h']);
  assert.deepEqual(again.body.replaced.map((r) => [r.id, r.text, r.status, r.reason]), [[first.id, 'Humidifier 0.5 → 1 L/h', 'cancelled', 'Replaced by a newer plan']]);
  assert.deepEqual((await call('POST', `/api/rooms/${id}/tasks`, { text: 'Seal the door' })).body.replaced, []);
});

test("Plan this: the fan's \"from\" at Simulate's default (assumed) comes back as the row's note and in its source", async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const made = await call('POST', `/api/rooms/${id}/tasks`, { suggestion: { machines: [{ key: 'fanFlow', from: 600, to: 150, assumed: true }], rmMonth: -3, suggestedAt: 1 } });
  assert.equal(made.status, 201);
  assert.deepEqual([made.body.rows[0].note, made.body.rows[0].source.assumed], ["The fan's flow now was Simulate's default, not from Setup", true]);
  const row = (await call('GET', `/api/rooms/${id}/tasks`)).body.longterm[0];
  assert.deepEqual([row.note, row.source.assumed], ["The fan's flow now was Simulate's default, not from Setup", true]);
});

test('Plan this: a suggestion that is not one is 400 with the field', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/rooms', ROOM)).body.id;
  const machinesError = { error: 'The plan must list the fan, aircon, humidifier or dehumidifier, each from and to a number from 0 to 1,000,000', field: 'suggestion' };
  const good = { machines: [{ key: 'acBTU', from: 9000, to: 12000 }], rmMonth: 10, suggestedAt: 1 };
  const post = (suggestion) => call('POST', `/api/rooms/${id}/tasks`, { suggestion });
  assert.deepEqual(await post('cheaper'), { status: 400, body: machinesError });
  for (const machines of [undefined, [{ key: 'pump', from: 1, to: 2 }], [{ key: 'acBTU', from: -1, to: 2 }], [{ key: 'acBTU', from: 1, to: '2' }],
    [{ key: 'acBTU', from: 1, to: 2_000_000 }], [{ key: 'acBTU', from: 1, to: 2 }, { key: 'acBTU', from: 2, to: 3 }], ['acBTU']]) {
    assert.deepEqual(await post({ ...good, machines }), { status: 400, body: machinesError });
  }
  assert.deepEqual(await post({ ...good, machines: [] }), { status: 400, body: { error: 'Nothing changes from what the room has now', field: 'suggestion' } });
  const numbers = { status: 400, body: { error: "The plan's RM a month must be a number and its time a time in ms", field: 'suggestion' } };
  assert.deepEqual(await post({ ...good, rmMonth: 'less' }), numbers);
  assert.deepEqual(await post({ ...good, suggestedAt: 'yesterday' }), numbers);
  const noMoney = await post({ machines: good.machines }); // rmMonth and suggestedAt left out: kept as none
  assert.equal(noMoney.status, 201);
  assert.deepEqual([noMoney.body.rows[0].source.rmMonth, noMoney.body.rows[0].source.suggestedAt], [null, null]);
});

test('Done: who did it and the amount kept; done twice is 409 with who and when, and so is a Skip after it', async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom();
  const harvest = byRule((await tasksOf(call, id)).today, 'harvestAm');
  assert.equal(harvest.unit, 'kg');
  const done = await call('POST', `/api/tasks/${harvest.id}/done`, { worker: '  Ali ', amount: 3.5 });
  assert.equal(done.status, 200);
  assert.deepEqual([done.body.id, done.body.status, done.body.worker, done.body.amount, done.body.unit], [harvest.id, 'done', 'Ali', 3.5, 'kg']);
  assert.equal(typeof done.body.closedAt, 'number');
  const already = { status: 409, body: { error: `Already done by Ali at ${hhmm(done.body.closedAt)}` } };
  assert.deepEqual(await call('POST', `/api/tasks/${harvest.id}/done`, { worker: 'Siti' }), already);
  assert.deepEqual(await call('POST', `/api/tasks/${harvest.id}/skip`, { worker: 'Siti', reason: 'Rain' }), already);
  const pm = byRule((await tasksOf(call, id)).today, 'harvestPm');
  const empty = await call('POST', `/api/tasks/${pm.id}/done`, { worker: 'Siti', amount: '' }); // the amount may be left empty
  assert.deepEqual([empty.status, empty.body.amount], [200, null]);
});

test('Done and Skip need a worker name of up to 40 characters; the amount is a number from 0 to 10,000; no such task is 404', async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom();
  const view = await tasksOf(call, id);
  const am = byRule(view.today, 'harvestAm');
  const pm = byRule(view.today, 'harvestPm');
  for (const body of [{}, { worker: '' }, { worker: '   ' }, { worker: 7 }, { worker: 'A\u0001li' }]) {
    assert.deepEqual(await call('POST', `/api/tasks/${am.id}/done`, body), { status: 400, body: { error: 'Pick who did it', field: 'worker' } });
  }
  assert.deepEqual(await call('POST', `/api/tasks/${am.id}/skip`, { reason: 'Rain' }), { status: 400, body: { error: 'Pick who did it', field: 'worker' } });
  assert.deepEqual(await call('POST', `/api/tasks/${am.id}/done`, { worker: 'A'.repeat(41) }), {
    status: 400, body: { error: 'The name must be at most 40 characters', field: 'worker' },
  });
  for (const amount of [-0.1, 10_000.5, '3', true]) {
    assert.deepEqual(await call('POST', `/api/tasks/${am.id}/done`, { worker: 'Ali', amount }), {
      status: 400, body: { error: 'The amount must be a number from 0 to 10,000', field: 'amount' },
    });
  }
  assert.deepEqual(await call('POST', `/api/tasks/${am.id}/done`, []), { status: 400, body: { error: 'Body must be a JSON object' } });
  assert.equal((await call('POST', `/api/tasks/${am.id}/done`, { worker: 'Ali', amount: 0 })).body.amount, 0);
  assert.equal((await call('POST', `/api/tasks/${pm.id}/done`, { worker: 'A'.repeat(40), amount: 10_000 })).body.amount, 10_000);
  assert.deepEqual(await call('POST', '/api/tasks/99999/done', { worker: 'Ali' }), { status: 404, body: { error: 'Task not found' } });
  assert.deepEqual(await call('GET', `/api/tasks/${am.id}/done`), { status: 404, body: { error: 'Not found' } });
});

test('Skip needs a reason; a skipped upkeep row brings the next, due its interval later; a long-term row is not skipped', async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom();
  const view = await tasksOf(call, id);
  const traps = byRule(view.upkeep, 'flyTraps');
  for (const reason of [undefined, '', '  ', 3]) {
    assert.deepEqual(await call('POST', `/api/tasks/${traps.id}/skip`, { worker: 'Ali', reason }), { status: 400, body: { error: 'Say why', field: 'reason' } });
  }
  assert.deepEqual(await call('POST', `/api/tasks/${traps.id}/skip`, { worker: 'Ali', reason: 'x'.repeat(201) }), {
    status: 400, body: { error: 'The reason must be at most 200 characters', field: 'reason' },
  });
  const skipped = await call('POST', `/api/tasks/${traps.id}/skip`, { worker: 'Ali', reason: ' No traps in stock ' });
  assert.equal(skipped.status, 200);
  assert.deepEqual([skipped.body.status, skipped.body.worker, skipped.body.reason], ['skipped', 'Ali', 'No traps in stock']);
  const next = byRule((await tasksOf(call, id)).upkeep, 'flyTraps');
  assert.notEqual(next.id, traps.id);
  assert.equal(next.status, 'open');
  assert.equal(next.dueDate, addDays(view.date, 7));
  const own = (await call('POST', `/api/rooms/${id}/tasks`, { text: 'Fix the door seal' })).body.rows[0];
  assert.deepEqual(await call('POST', `/api/tasks/${own.id}/skip`, { worker: 'Ali', reason: 'Later' }), {
    status: 400, body: { error: 'A long-term task is done or cancelled, not skipped' },
  });
});

test('Cancel: long-term only, with a reason; Done also closes a long-term row', async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom();
  const add = async (text) => (await call('POST', `/api/rooms/${id}/tasks`, { text })).body.rows[0];
  const seal = await add('Fix the door seal');
  for (const body of [{}, { reason: '' }, { reason: '   ' }]) {
    assert.deepEqual(await call('POST', `/api/tasks/${seal.id}/cancel`, body), { status: 400, body: { error: 'Say why', field: 'reason' } });
  }
  const cancelled = await call('POST', `/api/tasks/${seal.id}/cancel`, { reason: 'The landlord fixed it' });
  assert.equal(cancelled.status, 200);
  assert.deepEqual([cancelled.body.status, cancelled.body.reason], ['cancelled', 'The landlord fixed it']);
  assert.deepEqual(await call('POST', `/api/tasks/${seal.id}/cancel`, { reason: 'Twice' }), {
    status: 409, body: { error: `Already cancelled at ${hhmm(cancelled.body.closedAt)}` },
  });
  const walk = byRule((await tasksOf(call, id)).today, 'contamWalk');
  assert.deepEqual(await call('POST', `/api/tasks/${walk.id}/cancel`, { reason: 'No time' }), {
    status: 400, body: { error: 'Only a long-term task can be cancelled' },
  });
  const paint = await add('Paint the walls');
  const done = await call('POST', `/api/tasks/${paint.id}/done`, { worker: 'Siti' });
  assert.deepEqual([done.status, done.body.status, done.body.worker], [200, 'done', 'Siti']);
  assert.deepEqual((await tasksOf(call, id)).longterm, []);
});

// ---- final review ----

test('Done with a name not on the workers list: 400 field worker; a listed name in any case is stored as the list spells it', async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom();
  assert.equal((await call('PUT', '/api/workers', { workers: [{ name: 'Ali' }] })).status, 200);
  const walk = byRule((await tasksOf(call, id)).today, 'contamWalk');
  assert.deepEqual(await call('POST', `/api/tasks/${walk.id}/done`, { worker: 'Siti' }),
    { status: 400, body: { error: 'That name is not on the workers list', field: 'worker' } });
  const done = await call('POST', `/api/tasks/${walk.id}/done`, { worker: 'ali' });
  assert.deepEqual([done.status, done.body.worker], [200, 'Ali']);
});

test('POST /api/tasks/:id/undo: 200 with the open row (no body needed); 409 for an open, upkeep or too late row; 404 for no task', async (t) => {
  const { call, fruitingRoom } = await app(t);
  const id = await fruitingRoom();
  const view = await tasksOf(call, id);
  const foot = byRule(view.today, 'footbath');
  assert.equal((await call('POST', `/api/tasks/${foot.id}/undo`)).status, 409, 'an open row');
  await call('POST', `/api/tasks/${foot.id}/done`, { worker: 'Ali' });
  const r = await call('POST', `/api/tasks/${foot.id}/undo`);
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.id, r.body.status, r.body.closedAt, r.body.worker], [foot.id, 'open', null, null]);
  const upkeep = view.upkeep[0];
  await call('POST', `/api/tasks/${upkeep.id}/done`, { worker: 'Ali' });
  assert.deepEqual((await call('POST', `/api/tasks/${upkeep.id}/undo`)).body, { error: 'Only a daily task can be undone' });
  assert.deepEqual(await call('POST', '/api/tasks/99999/undo'), { status: 404, body: { error: 'Task not found' } });
  assert.equal((await call('GET', `/api/tasks/${foot.id}/undo`)).status, 404);
});

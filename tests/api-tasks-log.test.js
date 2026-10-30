// The task log over HTTP (spec 2026-10-30-tasks-design.md sections 6 and 7.1): closed rows newest first, 50 a page, and the
// CSV for the myGAP records.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { localDate } from '../server/task-rules.js';
import { attachment } from '../server/tasks-api.js';

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
  return { db, call, base };
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

test('the log: the closed rows newest first, open ones not; before= pages by id; a bad before is 400; no room is 404', async (t) => {
  const { call } = await app(t);
  const id = await fruitingRoom(call);
  const view = await tasksOf(call, id);
  const harvest = byRule(view.today, 'harvestAm');
  const footbath = byRule(view.today, 'footbath');
  await call('POST', `/api/tasks/${harvest.id}/done`, { worker: 'Ali', amount: 2 });
  await call('POST', `/api/tasks/${footbath.id}/skip`, { worker: 'Siti', reason: 'No water' });
  const log = await call('GET', `/api/rooms/${id}/tasks/log`);
  assert.equal(log.status, 200);
  assert.deepEqual(log.body.rows.map((r) => [r.ruleKey, r.status]).sort(), [['footbath', 'skipped'], ['harvestAm', 'done']]);
  assert.ok(log.body.rows[0].closedAt >= log.body.rows[1].closedAt);
  const [newer, older] = log.body.rows.map((r) => r.id);
  assert.deepEqual((await call('GET', `/api/rooms/${id}/tasks/log?before=${newer}`)).body.rows.map((r) => r.id), [older]);
  assert.deepEqual(await call('GET', `/api/rooms/${id}/tasks/log?before=${older}`), { status: 200, body: { rows: [] } });
  assert.equal((await call('GET', `/api/rooms/${id}/tasks/log?before=`)).body.rows.length, 2, 'an empty before is none');
  for (const before of ['abc', '0', '-1', '1.5', '1e3', '01', '9'.repeat(16)]) {
    assert.deepEqual(await call('GET', `/api/rooms/${id}/tasks/log?before=${before}`), { status: 400, body: { error: 'before must be a task id', field: 'before' } });
  }
  assert.deepEqual(await call('GET', '/api/rooms/999/tasks/log'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('POST', `/api/rooms/${id}/tasks/log`, {}), { status: 404, body: { error: 'Not found' } });
});

test('the log as CSV: a download named after the room, a UTF-8 BOM for Excel, the header, a line per closed row', async (t) => {
  const { call, base } = await app(t);
  const id = await fruitingRoom(call);
  const harvest = byRule((await tasksOf(call, id)).today, 'harvestAm');
  const done = (await call('POST', `/api/tasks/${harvest.id}/done`, { worker: 'Ali', amount: 3.5 })).body;
  const res = await fetch(`${base}/api/rooms/${id}/tasks/log.csv`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(res.headers.get('content-disposition'), 'attachment; filename="Room 1 tasks.csv"');
  const bytes = Buffer.from(await res.arrayBuffer()); // res.text() would drop the BOM
  assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  const lines = bytes.subarray(3).toString('utf8').trim().split(/\r?\n/);
  assert.equal(lines[0], 'date,time,room,task,status,worker,amount,unit,reason');
  assert.deepEqual(lines.slice(1), [`${localDate(done.closedAt)},${hhmm(done.closedAt)},Room 1,${harvest.text},done,Ali,3.5,kg,`]);
  assert.deepEqual(await call('GET', '/api/rooms/999/tasks/log.csv'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('PUT', `/api/rooms/${id}/tasks/log.csv`, {}), { status: 404, body: { error: 'Not found' } });
});

test('the download name: plain ASCII as it is; anything else as an ASCII stand-in and the UTF-8 name', () => {
  assert.equal(attachment('Room 1 tasks.csv'), 'attachment; filename="Room 1 tasks.csv"');
  assert.equal(attachment('Bilik "Tiram" tasks.csv'),
    `attachment; filename="Bilik _Tiram_ tasks.csv"; filename*=UTF-8''Bilik%20%22Tiram%22%20tasks.csv`);
  assert.equal(attachment("Bilik 1 – Ah Kow's tasks.csv"),
    `attachment; filename="Bilik 1 _ Ah Kow's tasks.csv"; filename*=UTF-8''Bilik%201%20%E2%80%93%20Ah%20Kow%27s%20tasks.csv`);
});

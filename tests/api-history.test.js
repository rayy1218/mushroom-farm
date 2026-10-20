// GET /api/rooms/:id/history?hours=N (spec 2026-10-19-safety-and-history-design.md 5): bucket averages made in SQL,
// good readings only, and the machine log rows with a start row.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, HISTORY_SQL } from '../server/db.js';
import { createApp } from '../server/app.js';

let db;
let server;
let base;

before(async () => {
  db = openDb(':memory:');
  server = createApp(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

async function get(path) {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
}

const HOUR = 3_600_000;
const fields = { name: 'R', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };
const room = () => {
  for (const r of db.listRooms()) db.deleteRoom(r.id);
  return db.createRoom(fields);
};
const trh = (id, at, t, rh, ok = true) => db.addReading({ roomId: id, kind: 'trh', address: 1, at, ok, t: ok ? t : null, rh: ok ? rh : null });
const co2 = (id, at, v, ok = true) => db.addReading({ roomId: id, kind: 'co2', address: 2, at, ok, co2: ok ? v : null });

test('hours must be 1, 6, 24, 168 or 720', async () => {
  const { id } = room();
  for (const h of ['', '2', 'abc', '0', '-1', '24.5', '1e1']) {
    const res = await get(`/api/rooms/${id}/history?hours=${h}`);
    assert.equal(res.status, 400, h);
    assert.equal(res.body.field, 'hours');
  }
  assert.equal((await get(`/api/rooms/${id}/history`)).status, 400);
  for (const h of [1, 6, 24, 168, 720]) assert.equal((await get(`/api/rooms/${id}/history?hours=${h}`)).status, 200, String(h));
});

test('an unknown room is 404', async () => {
  room();
  const res = await get('/api/rooms/99999/history?hours=1');
  assert.equal(res.status, 404);
});

test('the bucket size follows the range and the window ends now', async () => {
  const { id } = room();
  const sizes = {};
  for (const h of [1, 6, 24, 168, 720]) {
    const { body } = await get(`/api/rooms/${id}/history?hours=${h}`);
    sizes[h] = body.bucketS;
    assert.equal(body.to - body.from, h * HOUR);
    assert.ok(Math.abs(body.to - Date.now()) < 5000);
  }
  assert.deepEqual(sizes, { 1: 15, 6: 60, 24: 300, 168: 1800, 720: 7200 });
});

test('readings are averaged per bucket, at the bucket middle, good readings only, empty buckets left out', () => {
  const { id } = room();
  const now = 1_000 * HOUR;
  const b = 60_000; // 6 h range: 60 s buckets
  const start = now - 2 * HOUR; // a multiple of 60 s
  trh(id, start + 1000, 20, 80);
  trh(id, start + 31_000, 22, 90);
  trh(id, start + 45_000, 99, 99, false); // failed poll: not used
  trh(id, start + 3 * b + 5000, 24, 70); // a later bucket; the two between are empty
  co2(id, start + 2000, 700);
  co2(id, start + 4000, 800);
  trh(id, now - 7 * HOUR, 1, 1); // outside the window
  const h = db.history(id, 6, now);
  assert.deepEqual(h.trh, [
    { at: start + b / 2, t: 21, rh: 85 },
    { at: start + 3 * b + b / 2, t: 24, rh: 70 },
  ]);
  assert.deepEqual(h.co2, [{ at: start + b / 2, co2: 750 }]);
  assert.equal(h.from, now - 6 * HOUR);
  assert.equal(h.to, now);
});

test('the other rooms and the other sensor are not mixed in', () => {
  const a = room();
  const other = db.createRoom({ ...fields, name: 'Other', trhAddress: 11, co2Address: 12, relayAddress: 13, acAddress: 14 });
  const now = 1_000 * HOUR;
  trh(a.id, now - 1000, 20, 80);
  db.addReading({ roomId: other.id, kind: 'trh', address: 11, at: now - 1000, ok: true, t: 30, rh: 50 });
  co2(other.id, now - 1000, 900);
  const h = db.history(a.id, 1, now);
  assert.equal(h.trh.length, 1);
  assert.equal(h.trh[0].t, 20);
  assert.deepEqual(h.co2, []);
});

test('the bucket queries search the readings_by_time index', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-history-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'plan.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  for (const kind of ['trh', 'co2']) {
    const plan = raw.prepare(`EXPLAIN QUERY PLAN ${HISTORY_SQL.bucket(kind)}`).all(1, 0, 1e12).map((r) => r.detail);
    const onReadings = plan.filter((d) => /readings/.test(d));
    assert.ok(onReadings.length > 0);
    for (const d of onReadings) assert.match(d, /^SEARCH readings USING (COVERING )?INDEX readings_by_time \(room_id=\? AND kind=\? AND at>\? AND at<\?\)/, d);
  }
});

test('machine lines: log rows in the window and the last row before it, moved to the start', () => {
  const { id } = room();
  const now = 1_000 * HOUR;
  const from = now - HOUR;
  db.logMachine(id, 'exhaust', { on: true }, 'manual', from - 5 * HOUR);
  db.logMachine(id, 'exhaust', { on: false }, 'auto', from - 2 * HOUR);
  db.logMachine(id, 'exhaust', { on: true }, 'auto', from + 600_000);
  db.logMachine(id, 'exhaust', { on: false }, 'manual', from + 1_200_000);
  db.logMachine(id, 'exhaust', { on: true }, 'manual', now + 1000); // after the window
  db.logMachine(id, 'ac', { on: true, setpoint: 24, mode: 'cool', fan: 'auto' }, 'auto', from + 100_000);
  const h = db.history(id, 1, now);
  assert.deepEqual(h.machines.exhaust, [
    { at: from, on: false, source: 'auto' },
    { at: from + 600_000, on: true, source: 'auto' },
    { at: from + 1_200_000, on: false, source: 'manual' },
  ]);
  assert.deepEqual(h.machines.ac, [{ at: from + 100_000, on: true, setpoint: 24, mode: 'cool', fan: 'auto', source: 'auto' }]);
  assert.deepEqual(h.machines.intake, []);
  assert.deepEqual(Object.keys(h.machines), ['intake', 'exhaust', 'circulation', 'humidifier', 'ac']);
});

test('the reply of the route has the whole shape', async () => {
  const { id } = room();
  const now = Date.now();
  trh(id, now - 1000, 20, 80);
  const { body } = await get(`/api/rooms/${id}/history?hours=1`);
  assert.deepEqual(Object.keys(body).sort(), ['bucketS', 'co2', 'from', 'machines', 'pollSeconds', 'to', 'trh']);
  assert.equal(body.trh.length, 1);
  assert.equal(body.pollSeconds, 5);
  db.setSetting('pollSeconds', '120');
  assert.equal((await get(`/api/rooms/${id}/history?hours=1`)).body.pollSeconds, 120);
  db.setSetting('pollSeconds', '5');
});

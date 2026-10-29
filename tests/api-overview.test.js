// GET /api/overview (spec 2026-10-19-safety-and-history-design.md 5): one reply for the Overview page.
// Alarms are read from the alarms table directly, so these tests insert rows by hand.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

let dir;
let path;
let db;
let raw; // a second connection to the same file, to insert alarms
let server;
let base;

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'farm-overview-'));
  path = join(dir, 'o.db');
  db = openDb(path);
  raw = new DatabaseSync(path);
  server = createApp(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  raw.close();
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

const overview = async () => {
  const res = await fetch(`${base}/api/overview`);
  assert.equal(res.status, 200);
  return res.json();
};

const fields = { name: 'A', length: 6, width: 4, height: 2.5 };
function reset() {
  for (const r of db.listRooms()) db.deleteRoom(r.id);
  raw.exec('DELETE FROM alarms');
}
let alarmId = 0;
function alarm(roomId, key, level, { raisedAt = Date.now(), clearedAt = null, ackedAt = null } = {}) {
  raw.prepare('INSERT INTO alarms (id, room_id, key, level, text, raised_at, cleared_at, acked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(++alarmId, roomId, key, level, `${key} text`, raisedAt, clearedAt, ackedAt);
  return alarmId;
}

test('no rooms: empty lists', async () => {
  reset();
  assert.deepEqual(await overview(), { rooms: [], alarms: [] });
});

test('a room with no sensors wired and nothing read', async () => {
  reset();
  const room = db.createRoom(fields);
  const { rooms } = await overview();
  assert.deepEqual(rooms, [{
    id: room.id,
    name: 'A',
    trh: { status: 'not-wired', t: null, rh: null, at: null },
    co2: { status: 'not-wired', co2: null, at: null },
    auto: false,
    exchange: false,
    exchangeSince: null,
    exchangeEveryMin: 15,
    freshFrom: null,
    bands: { tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, co2Low: 600, co2High: 750, co2Safety: 1250 },
    alarms: { count: 0, level: null },
    spark: { t: [], rh: [], co2: [] },
    machines: { humidifier: null, dehumidifier: null, cooling: null },
    filterPa: null,
  }]);
});

// Near an edge is amber only when the machine that should act is not acting (critique 2026-10-28): the Overview is told
// what the room's humidifier, dehumidifier and aircon are commanded to do; null for a machine the room does not have.
test('the machines that act on a band edge: commanded on or off, null when not wired or not fitted', async () => {
  reset();
  const room = db.createRoom({ ...fields, relayAddress: 3, acAddress: 4 });
  const now = Date.now();
  db.setRelayCommand(room.id, 'humidifier', true, now);
  db.setAcCommand(room.id, { power: true, mode: 'cool', setpoint: 18, fan: 'auto' }, now);
  assert.deepEqual((await overview()).rooms[0].machines, { humidifier: true, dehumidifier: null, cooling: true });
  db.updateRoom(room.id, { ...db.getRoom(room.id), dehumidifier: true });
  db.setAcCommand(room.id, { power: true, mode: 'fan', setpoint: 18, fan: 'auto' }, now);
  assert.deepEqual((await overview()).rooms[0].machines, { humidifier: true, dehumidifier: false, cooling: false });
});

test('the filter\'s last counted pressure (with the intake up to speed) rides along for the "now" beside a filter alarm', async () => {
  reset();
  const room = db.createRoom({ ...fields, dpAddress: 7 });
  const now = Date.now();
  raw.prepare('UPDATE rooms SET filter_changed_at = ? WHERE id = ?').run(now - 60 * 60_000, room.id); // the filter in for an hour
  db.logMachine(room.id, 'intake', { on: true }, 'auto', now - 10 * 60_000);
  db.addFilterReading({ roomId: room.id, address: 7, at: now - 60_000, ok: true, pa: 41.2 });
  const { rooms } = await overview();
  assert.equal(rooms[0].filterPa, 41.2);
});

test('latest good values with the sensor status, control state and the 24 h sparklines', async () => {
  reset();
  const room = db.createRoom({ ...fields, trhAddress: 1, co2Address: 2 });
  const now = Date.now();
  const slot = 1_800_000;
  const start = Math.floor((now - 3_600_000) / slot) * slot; // a bucket boundary an hour ago
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: start + 1000, ok: true, t: 20, rh: 80 });
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: start + 2000, ok: true, t: 22, rh: 90 });
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: now - 1000, ok: true, t: 23.5, rh: 88 });
  db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: now - 1000, ok: true, co2: 700 });
  db.setControl(room.id, { ...db.getControl(room.id), auto: true });
  db.setControlState(room.id, { exchange: true, humidifier: false }, now - 60_000);
  const [r] = (await overview()).rooms;
  assert.deepEqual(r.trh, { status: 'online', t: 23.5, rh: 88, at: now - 1000 });
  assert.deepEqual(r.co2, { status: 'online', co2: 700, at: now - 1000 });
  assert.equal(r.auto, true);
  assert.equal(r.exchange, true);
  assert.equal(r.exchangeSince, now - 60_000);
  assert.deepEqual(r.spark.t[0], { at: start + slot / 2, v: 21 });
  assert.deepEqual(r.spark.rh[0], { at: start + slot / 2, v: 85 });
  assert.equal(r.spark.t.length, 2);
  assert.equal(r.spark.co2.length, 1);
});

// Critique 2026-10-29: the card's footer says when the next fresh air comes, not "Air exchange off" a third time.
test('the fresh-air wait: its interval and when it counts from (fresh air, else the last exchange\'s end); null in Manual', async () => {
  reset();
  const room = db.createRoom({ ...fields, trhAddress: 1 });
  const now = Date.now();
  db.setControl(room.id, { ...db.getControl(room.id), auto: true, exchangeEveryMin: 12 });
  db.setControlState(room.id, { exchange: false, humidifier: false, exchangeEndedAt: now - 5 * 60_000, freshFrom: now - 9 * 60_000 }, now);
  let [r] = (await overview()).rooms;
  assert.equal(r.exchangeEveryMin, 12);
  assert.equal(r.freshFrom, now - 9 * 60_000);
  db.setControlState(room.id, { exchange: false, humidifier: false, freshFrom: null }, now);
  [r] = (await overview()).rooms;
  assert.equal(r.freshFrom, now - 5 * 60_000, 'no fresh-air start: from the end of the last exchange, as the controller counts');
  db.setControl(room.id, { ...db.getControl(room.id), auto: false });
  [r] = (await overview()).rooms;
  assert.equal(r.freshFrom, null);
});

test('a failing sensor shows its status word and the last good value', async () => {
  reset();
  const room = db.createRoom({ ...fields, co2Address: 2 });
  const now = Date.now();
  db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: now - 30_000, ok: true, co2: 650 });
  for (let i = 3; i > 0; i--) db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: now - i * 1000, ok: false, error: 'timeout' });
  const [r] = (await overview()).rooms;
  assert.deepEqual(r.co2, { status: 'offline', co2: 650, at: now - 30_000 });
});

test('alarm counts count active alarms, the level is the highest; the list holds current alarms, critical first then newest', async () => {
  reset();
  const a = db.createRoom(fields);
  const b = db.createRoom({ ...fields, name: 'B' });
  const t = Date.now();
  const w = alarm(a.id, 'tHigh', 'warning', { raisedAt: t - 3000 });
  const s = alarm(a.id, 'sensorCo2', 'serious', { raisedAt: t - 2000, ackedAt: t - 1000 }); // active though acknowledged
  const c = alarm(b.id, 'co2Safety', 'critical', { raisedAt: t - 5000 });
  const cleared = alarm(b.id, 'tLow', 'warning', { raisedAt: t - 1000, clearedAt: t - 500 }); // cleared, not acknowledged: current
  alarm(b.id, 'rhLow', 'warning', { raisedAt: t - 4000, clearedAt: t - 3000, ackedAt: t - 2500 }); // done: history only
  const { rooms, alarms } = await overview();
  assert.deepEqual(rooms.map((r) => r.alarms), [{ count: 2, level: 'serious' }, { count: 1, level: 'critical' }]);
  assert.deepEqual(alarms.map((x) => x.id), [c, cleared, s, w]);
  assert.deepEqual(alarms[0], {
    id: c, roomId: b.id, roomName: 'B', key: 'co2Safety', level: 'critical', text: 'co2Safety text',
    raisedAt: t - 5000, clearedAt: null, ackedAt: null,
  });
});

test('the alarm list has at most 10 entries', async () => {
  reset();
  const a = db.createRoom(fields);
  for (let i = 0; i < 12; i++) alarm(a.id, `machine.k${i}`, 'serious', { raisedAt: 1000 + i });
  const { rooms, alarms } = await overview();
  assert.equal(alarms.length, 10);
  assert.equal(alarms[0].raisedAt, 1011);
  assert.equal(rooms[0].alarms.count, 12);
});

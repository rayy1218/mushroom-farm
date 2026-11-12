// The alarm routes of the JSON API (spec 2026-10-19-safety-and-history-design.md section 5).

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';

let db;
let server;
let base;
let a;
let b;

before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { login: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  for (const room of db.listRooms()) db.deleteRoom(room.id);
  a = db.createRoom({ name: 'Room A', length: 6, width: 4, height: 2.5 }).id;
  b = db.createRoom({ name: 'Room B', length: 6, width: 4, height: 2.5 }).id;
});

async function call(method, path) {
  const res = await fetch(base + path, { method });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('GET /api/alarms: the current alarms of every room, critical first, then newest, with the room name', async () => {
  assert.deepEqual((await call('GET', '/api/alarms')).body, []);
  const warn = db.raiseAlarm(a, 'tHigh', 'warning', 'Temperature 24.3 °C: more than 1 °C over the band (21–23 °C)', 1000);
  const crit = db.raiseAlarm(b, 'co2Safety', 'critical', 'CO₂ 1,300 ppm: at or above the safety level (1,250 ppm)', 900);
  const newer = db.raiseAlarm(b, 'rhLow', 'warning', 'Humidity 78.0 % RH: more than 5 % RH under the band (85–95 % RH)', 2000);
  const r = await call('GET', '/api/alarms');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.map((x) => x.id), [crit, newer, warn]);
  assert.deepEqual(r.body[0], {
    id: crit, roomId: b, roomName: 'Room B', key: 'co2Safety', level: 'critical',
    text: 'CO₂ 1,300 ppm: at or above the safety level (1,250 ppm)', raisedAt: 900, clearedAt: null, ackedAt: null, ackedBy: null,
  });
});

test('GET /api/alarms leaves out cleared and acknowledged alarms but keeps cleared or acknowledged ones', async () => {
  const t = Date.now(); // a cleared alarm waits 12 h for review (spec 2026-11-12-alarms-triage-design.md 5)
  const x = db.raiseAlarm(a, 'tHigh', 'warning', 'x', t - 30);
  const y = db.raiseAlarm(a, 'tLow', 'warning', 'y', t - 20);
  const z = db.raiseAlarm(a, 'rhLow', 'warning', 'z', t - 10);
  db.clearAlarm(a, 'tHigh', t - 5);
  db.clearAlarm(a, 'tLow', t - 5);
  db.ackAlarm(y, t - 4);
  db.ackAlarm(z, t - 4);
  assert.deepEqual((await call('GET', '/api/alarms')).body.map((r) => r.id), [z, x]);
});

test('POST /api/alarms/:id/ack answers the alarm; twice is fine; 404 for an unknown id', async () => {
  const id = db.raiseAlarm(a, 'tHigh', 'warning', 'x', 1);
  const first = await call('POST', `/api/alarms/${id}/ack`);
  assert.equal(first.status, 200);
  assert.equal(first.body.id, id);
  assert.equal(typeof first.body.ackedAt, 'number');
  const second = await call('POST', `/api/alarms/${id}/ack`);
  assert.equal(second.status, 200);
  assert.equal(second.body.ackedAt, first.body.ackedAt);
  const missing = await call('POST', '/api/alarms/999/ack');
  assert.deepEqual([missing.status, missing.body], [404, { error: 'Alarm not found' }]);
  assert.equal((await call('GET', `/api/alarms/${id}/ack`)).status, 404);
  assert.equal((await call('POST', '/api/alarms')).status, 404);
});

test('GET /api/rooms/:id/alarms: current and the last 50 of any state, newest first', async () => {
  for (let i = 0; i < 55; i++) {
    db.raiseAlarm(a, 'tHigh', 'warning', `n${i}`, 100 + i);
    db.clearAlarm(a, 'tHigh', 100 + i);
    db.ackRoomAlarms(a, 100 + i);
  }
  const live = db.raiseAlarm(a, 'co2High', 'warning', 'live', 500);
  db.raiseAlarm(b, 'co2High', 'warning', 'other room', 500);
  const r = await call('GET', `/api/rooms/${a}/alarms`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.current.map((x) => x.id), [live]);
  assert.equal(r.body.history.length, 50);
  assert.equal(r.body.history[0].id, live);
  assert.equal(r.body.history[1].text, 'n54');
  assert.equal((await call('GET', '/api/rooms/99/alarms')).status, 404);
  assert.equal((await call('POST', `/api/rooms/${a}/alarms`)).status, 404);
});

test('POST /api/rooms/:id/alarms/ack acknowledges every current alarm of the room', async () => {
  db.raiseAlarm(a, 'tHigh', 'warning', 'x', 1);
  db.raiseAlarm(a, 'tLow', 'warning', 'y', 2);
  db.raiseAlarm(b, 'tHigh', 'warning', 'z', 3);
  const r = await call('POST', `/api/rooms/${a}/alarms/ack`);
  assert.deepEqual([r.status, r.body], [200, { acked: 2 }]);
  assert.deepEqual((await call('POST', `/api/rooms/${a}/alarms/ack`)).body, { acked: 0 });
  assert.equal((await call('GET', `/api/rooms/${a}/alarms`)).body.current.every((x) => x.ackedAt !== null), true);
  assert.equal((await call('GET', `/api/rooms/${b}/alarms`)).body.current[0].ackedAt, null);
  assert.equal((await call('POST', '/api/rooms/99/alarms/ack')).status, 404);
  assert.equal((await call('GET', `/api/rooms/${a}/alarms/ack`)).status, 404);
});

test('deleting a room deletes its alarms', async () => {
  db.raiseAlarm(a, 'tHigh', 'warning', 'x', 1);
  assert.equal((await call('DELETE', `/api/rooms/${a}`)).status, 204);
  assert.deepEqual((await call('GET', '/api/alarms')).body, []);
});

// ---- Alarms triage (spec 2026-11-12-alarms-triage-design.md 4, 5, 7) ----
test('POST /api/alarms/ack acknowledges a group: the count of new ones; a bad list is 400', async () => {
  const x = db.raiseAlarm(a, 'machine.intake', 'serious', 'x', Date.now());
  const y = db.raiseAlarm(a, 'machine.exhaust', 'serious', 'y', Date.now());
  db.ackAlarm(y, Date.now());
  const post = async (body) => {
    const res = await fetch(`${base}/api/alarms/ack`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  assert.deepEqual(await post({ ids: [x, y, 99999] }), { status: 200, body: { acked: 1 } });
  assert.notEqual(db.getAlarm(x).ackedAt, null);
  for (const bad of [{}, { ids: [] }, { ids: ['1'] }, { ids: [0] }, { ids: Array.from({ length: 501 }, (_, i) => i + 1) }]) {
    assert.deepEqual(await post(bad), { status: 400, body: { error: 'ids must be a list of 1 to 500 alarm ids', field: 'ids' } });
  }
  assert.equal((await call('GET', '/api/alarms/ack')).status, 404);
});

test('a gateway alarm holds the rooms behind the gateway; the other rooms behind it show it too', async () => {
  for (const room of db.listRooms()) db.deleteRoom(room.id);
  const wired = { length: 6, width: 2.4, height: 2.4 };
  const one = db.createRoom({ ...wired, name: 'Room 1', trhAddress: 1, relayAddress: 3 }).id;
  const two = db.createRoom({ ...wired, name: 'Room 2', trhAddress: 11, co2Address: 12, acAddress: 14 }).id;
  const own = db.createRoom({ ...wired, name: 'Container 1', trhAddress: 1, gateway: '127.0.0.1:1512' }).id;
  const g = db.raiseAlarm(one, 'gateway', 'serious', "The farm's gateway not answering", Date.now(), { gateway: '127.0.0.1:1502' });
  const r = db.raiseAlarm(own, 'relayNoAnswer', 'serious', 'Relay module', Date.now());
  const list = (await call('GET', '/api/alarms')).body;
  assert.deepEqual(list.find((x) => x.id === g).held, [
    { roomId: one, roomName: 'Room 1', machines: ['Intake fan', 'Exhaust fan', 'Circulation fan', 'Humidifier'], sensors: ['T/RH probe'] },
    { roomId: two, roomName: 'Room 2', machines: ['Aircon'], sensors: ['T/RH probe', 'CO₂ sensor'] },
  ]);
  assert.deepEqual(list.find((x) => x.id === r).held, []); // Container 1 has no relay module wired now
  assert.deepEqual((await call('GET', `/api/rooms/${two}/alarms`)).body.current.map((x) => [x.id, x.roomName]), [[g, 'Room 1']]);
  assert.deepEqual((await call('GET', `/api/rooms/${own}/alarms`)).body.current.map((x) => x.id), [r]);
  // the address is History's (and the current one's field), not the text's
  assert.equal(list.find((x) => x.id === g).gatewayAddress, '127.0.0.1:1502');
  db.raiseAlarm(own, 'gateway', 'serious', "Container 1's gateway not answering", Date.now(), { gateway: '127.0.0.1:1512' });
  assert.equal((await call('GET', `/api/rooms/${own}/alarms`)).body.history.find((x) => x.key === 'gateway').gatewayAddress, '127.0.0.1:1512');
  const overview = (await call('GET', '/api/overview')).body;
  assert.equal(overview.alarms.find((x) => x.id === g).held.length, 2);
});

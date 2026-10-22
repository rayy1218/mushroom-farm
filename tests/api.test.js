import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { openDb } from '../server/db.js';
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

// Each test starts with an empty rooms table.
function reset() {
  for (const room of db.listRooms()) db.deleteRoom(room.id);
}

async function call(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, type: res.headers.get('content-type'), body: text ? JSON.parse(text) : null };
}

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

test('GET /api/rooms lists rooms sorted by name', async () => {
  reset();
  db.createRoom({ ...fields, name: 'b' });
  db.createRoom({ ...fields, name: 'A' });
  const res = await call('GET', '/api/rooms');
  assert.equal(res.status, 200);
  assert.equal(res.type, 'application/json; charset=utf-8');
  assert.deepEqual(res.body.map((r) => r.name), ['A', 'b']);
});

test('POST /api/rooms creates a room', async () => {
  reset();
  const res = await call('POST', '/api/rooms', { ...fields, name: '  Room 1 ' });
  assert.equal(res.status, 201);
  assert.equal(res.body.name, 'Room 1');
  assert.equal(res.body.volume, 60);
  assert.equal(typeof res.body.id, 'number');
  assert.equal(res.body.createdAt, res.body.updatedAt);
  assert.deepEqual(db.getRoom(res.body.id), res.body);
});

test('POST /api/rooms with invalid input gives 400 with the field', async () => {
  reset();
  const res = await call('POST', '/api/rooms', { ...fields, height: 11 });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Height must be a number from 0.5 to 10 m', field: 'height' });
  assert.deepEqual(db.listRooms(), []);
});

test('POST /api/rooms with a JSON array gives 400 without a field', async () => {
  const res = await call('POST', '/api/rooms', []);
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Body must be a JSON object' });
});

test('POST /api/rooms with bad JSON gives 400', async () => {
  for (const body of ['{"name":', '']) {
    const res = await call('POST', '/api/rooms', body);
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: 'Body must be valid JSON' });
  }
});

test('POST /api/rooms with a body over 64 KB gives 413', async () => {
  const res = await call('POST', '/api/rooms', { ...fields, pad: 'x'.repeat(70 * 1024) });
  assert.equal(res.status, 413);
  assert.deepEqual(res.body, { error: 'Body is too large' });
});

test('POST /api/rooms with a taken name gives 409', async () => {
  reset();
  db.createRoom(fields);
  const res = await call('POST', '/api/rooms', { ...fields, name: 'room 1' });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'A room called "room 1" already exists', field: 'name' });
});

test('PUT /api/rooms/:id updates the room', async () => {
  reset();
  const { id } = db.createRoom(fields, 1000);
  const res = await call('PUT', `/api/rooms/${id}`, { name: 'Room A', length: 5, width: 3, height: 2 });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Room A');
  assert.equal(res.body.volume, 30);
  assert.equal(res.body.createdAt, 1000);
  assert.ok(res.body.updatedAt > 1000);
});

test('PUT /api/rooms/:id needs all four fields', async () => {
  reset();
  const { id } = db.createRoom(fields);
  const res = await call('PUT', `/api/rooms/${id}`, { name: 'Room A' });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'length');
});

test('PUT /api/rooms/:id with a missing room gives 404', async () => {
  reset();
  const res = await call('PUT', '/api/rooms/99', {});
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Room not found' });
});

test("PUT /api/rooms/:id with another room's name gives 409", async () => {
  reset();
  db.createRoom(fields);
  const { id } = db.createRoom({ ...fields, name: 'Room 2' });
  const res = await call('PUT', `/api/rooms/${id}`, fields);
  assert.equal(res.status, 409);
  assert.equal(res.body.field, 'name');
});

test('DELETE /api/rooms/:id deletes the room', async () => {
  reset();
  const { id } = db.createRoom(fields);
  const res = await call('DELETE', `/api/rooms/${id}`);
  assert.equal(res.status, 204);
  assert.equal(res.body, null);
  assert.equal(db.getRoom(id), null);
});

test('DELETE /api/rooms/:id with a missing room gives 404', async () => {
  reset();
  const res = await call('DELETE', '/api/rooms/99');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: 'Room not found' });
});

test('ids that are not positive whole numbers give 404', async () => {
  for (const id of ['0', '-1', '1.5', 'abc', '01', '1e3', '9999999999999999']) {
    const res = await call('DELETE', `/api/rooms/${id}`);
    assert.equal((await call('GET', `/api/rooms/${id}/sensors`)).status, 404, id);
    assert.deepEqual((await call('GET', `/api/rooms/${id}`)).body, { error: 'Not found' }, id);
    assert.equal(res.status, 404, id);
    assert.deepEqual(res.body, { error: 'Not found' }, id);
  }
});

test('unknown API paths and methods give 404', async () => {
  for (const [method, path] of [
    ['GET', '/api'],
    ['GET', '/api/nope'],
    ['DELETE', '/api/rooms'],
    ['PATCH', '/api/rooms'],
    ['POST', '/api/rooms/1'],
    ['GET', '/api/rooms/1/extra'],
    ['POST', '/api/rooms/1/sensors'],
    ['PUT', '/api/rooms/1/sensors'],
    ['DELETE', '/api/rooms/1/sensors'],
    ['GET', '/api/rooms/1/sensors/'],
  ]) {
    const res = await call(method, path);
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(res.body, { error: 'Not found' });
  }
});

test('an unexpected failure gives 500 without details', async (t) => {
  t.mock.method(db, 'listRooms', () => {
    throw new Error('disk on fire');
  });
  t.mock.method(console, 'error', () => {});
  const res = await call('GET', '/api/rooms');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: 'Something went wrong' });
  assert.equal(console.error.mock.callCount(), 1);
});

test('POST and PUT with a body that is not JSON-typed give 415', async () => {
  reset();
  const { id } = db.createRoom(fields);
  const headers = { 'content-type': 'text/plain' };
  const body = JSON.stringify({ ...fields, name: 'Room 2' });
  const post = await fetch(`${base}/api/rooms`, { method: 'POST', headers, body });
  assert.equal(post.status, 415);
  assert.deepEqual(await post.json(), { error: 'Content-Type must be application/json' });
  const put = await fetch(`${base}/api/rooms/${id}`, { method: 'PUT', headers, body });
  assert.equal(put.status, 415);
  assert.deepEqual(await put.json(), { error: 'Content-Type must be application/json' });
  assert.equal(db.listRooms().length, 1);
  assert.equal(db.getRoom(id).name, 'Room 1');
});

test('a client that hangs up mid-body does not log an error', async (t) => {
  t.mock.method(console, 'error', () => {});
  const socket = net.connect(server.address().port, '127.0.0.1');
  await new Promise((resolve) => socket.once('connect', resolve));
  socket.write('POST /api/rooms HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 1000\r\n\r\n{"name":');
  socket.destroy();
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(console.error.mock.callCount(), 0);
});

// --- iteration 2: addresses, room detail, sensors ---

test('POST /api/rooms stores the sensor addresses; missing means null', async () => {
  reset();
  const res = await call('POST', '/api/rooms', { ...fields, trhAddress: 1, co2Address: 2 });
  assert.equal(res.status, 201);
  assert.equal(res.body.trhAddress, 1);
  assert.equal(res.body.co2Address, 2);
  const bare = await call('POST', '/api/rooms', { ...fields, name: 'Bare' });
  assert.equal(bare.body.trhAddress, null);
  assert.equal(bare.body.co2Address, null);
  assert.deepEqual((await call('GET', '/api/rooms')).body.map((r) => r.trhAddress), [null, 1]);
});

test('bad addresses give 400 with the address field', async () => {
  reset();
  let res = await call('POST', '/api/rooms', { ...fields, trhAddress: 0 });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'T/RH sensor address must be a whole number from 1 to 247', field: 'trhAddress' });
  res = await call('POST', '/api/rooms', { ...fields, co2Address: '5' });
  assert.deepEqual(res.body, { error: 'CO\u2082 sensor address must be a whole number from 1 to 247', field: 'co2Address' });
  res = await call('POST', '/api/rooms', { ...fields, trhAddress: 4, co2Address: 4 });
  assert.deepEqual(res.body, { error: 'The two sensors need different addresses', field: 'co2Address' });
  assert.deepEqual(db.listRooms(), []);
});

test('an address used by another room gives 409 naming the room and the field', async () => {
  reset();
  db.createRoom({ ...fields, trhAddress: 1, co2Address: 2 });
  let res = await call('POST', '/api/rooms', { ...fields, name: 'B', trhAddress: 1 });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'Address 1 is already used by Room 1', field: 'trhAddress' });
  res = await call('POST', '/api/rooms', { ...fields, name: 'B', trhAddress: 9, co2Address: 1 });
  assert.deepEqual(res.body, { error: 'Address 1 is already used by Room 1', field: 'co2Address' });
  const other = db.createRoom({ ...fields, name: 'C', trhAddress: 3 });
  res = await call('PUT', `/api/rooms/${other.id}`, { ...fields, name: 'C', trhAddress: 2 });
  assert.equal(res.status, 409);
  assert.equal(res.body.field, 'trhAddress');
  assert.equal(db.listRooms().length, 2);
});

test('PUT keeps the own addresses and a missing field clears the address', async () => {
  reset();
  const { id } = db.createRoom({ ...fields, trhAddress: 1, co2Address: 2 });
  let res = await call('PUT', `/api/rooms/${id}`, { ...fields, trhAddress: 1, co2Address: 2 });
  assert.equal(res.status, 200);
  res = await call('PUT', `/api/rooms/${id}`, { ...fields, trhAddress: 1 });
  assert.equal(res.body.trhAddress, 1);
  assert.equal(res.body.co2Address, null);
});

test('GET /api/rooms/:id returns the room, 404 when missing', async () => {
  reset();
  const room = db.createRoom({ ...fields, trhAddress: 1 });
  const res = await call('GET', `/api/rooms/${room.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, room);
  const missing = await call('GET', '/api/rooms/99');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Room not found' });
});

test('GET /api/rooms/:id/sensors returns [trh, co2, meter, dp], 404 when missing', async () => {
  reset();
  const room = db.createRoom({ ...fields, trhAddress: 1 });
  const at = Date.now();
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at, ok: true, t: 25.2, rh: 88 });
  db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: at + 1, ok: false, error: 'timeout' });
  const res = await call('GET', `/api/rooms/${room.id}/sensors`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, [
    {
      kind: 'trh', address: 1, status: 'timeout', failuresInRow: 1,
      lastOk: { at, t: 25.2, rh: 88 },
      readings: [{ at, ok: true, t: 25.2, rh: 88 }, { at: at + 1, ok: false, t: null, rh: null }],
    },
    { kind: 'co2', address: null, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] },
    { kind: 'meter', address: null, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] },
    { kind: 'dp', address: null, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] },
  ]);
  const missing = await call('GET', '/api/rooms/99/sensors');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Room not found' });
});

test('the sensors route returns at most the latest 50 readings, oldest first', async () => {
  reset();
  const room = db.createRoom({ ...fields, co2Address: 2 });
  for (let i = 1; i <= 60; i++) db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: i, ok: true, co2: i });
  const { body } = await call('GET', `/api/rooms/${room.id}/sensors`);
  assert.equal(body[1].readings.length, 50);
  assert.equal(body[1].readings[0].at, 11);
  assert.equal(body[1].readings[49].at, 60);
  assert.equal(body[1].status, 'online');
});

// The machine routes and the new room fields of the JSON API.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMachines } from '../server/machines.js';
import { ModbusError } from '../server/modbus.js';

let db;
let server;
let machines;
let base;
const writes = [];
const state = {}; // roomId → { relay: [polls], ac: [polls] }
let failWrites = null;

before(async () => {
  db = openDb(':memory:');
  const client = {
    async writeCoil(...args) { writes.push(['coil', ...args]); if (failWrites) throw failWrites; },
    async writeRegisters(...args) { writes.push(['regs', ...args]); if (failWrites) throw failWrites; },
  };
  const poller = {
    machineState(roomId) {
      const s = state[roomId] ?? {};
      const room = db.getRoom(roomId);
      return {
        relay: { address: s.relay ? room.relayAddress : null, polls: s.relay ?? [] },
        ac: { address: s.ac ? room.acAddress : null, polls: s.ac ?? [] },
      };
    },
  };
  machines = createMachines({ db, client, poller });
  server = createApp(db, { machines });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

function reset() {
  for (const room of db.listRooms()) {
    db.deleteRoom(room.id);
    machines.forget(room.id);
  }
  writes.length = 0;
  failWrites = null;
  for (const k of Object.keys(state)) delete state[k];
}

async function call(method, path, body, headers = { 'content-type': 'application/json' }) {
  const init = { method };
  if (body !== undefined) {
    init.headers = headers;
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const acBody = { power: true, mode: 'cool', setpoint: 23.5, fan: 'auto' };

// --- room fields ---

test('rooms carry relayAddress and acAddress; missing means null', async () => {
  reset();
  const res = await call('POST', '/api/rooms', { ...fields, relayAddress: 10, acAddress: 20 });
  assert.equal(res.status, 201);
  assert.equal(res.body.relayAddress, 10);
  assert.equal(res.body.acAddress, 20);
  const bare = await call('POST', '/api/rooms', { ...fields, name: 'B' });
  assert.deepEqual([bare.body.relayAddress, bare.body.acAddress], [null, null]);
  const list = await call('GET', '/api/rooms');
  assert.deepEqual(list.body.map((r) => [r.relayAddress, r.acAddress]), [[null, null], [10, 20]]);
  const one = await call('GET', `/api/rooms/${res.body.id}`);
  assert.deepEqual([one.body.relayAddress, one.body.acAddress], [10, 20]);
  const put = await call('PUT', `/api/rooms/${res.body.id}`, { ...fields, relayAddress: 10 });
  assert.deepEqual([put.body.relayAddress, put.body.acAddress], [10, null]);
});

test('bad machine addresses give 400 with the field; a clash in the room too', async () => {
  reset();
  let res = await call('POST', '/api/rooms', { ...fields, relayAddress: 0 });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Relay module address must be a whole number from 1 to 247', field: 'relayAddress' });
  res = await call('POST', '/api/rooms', { ...fields, acAddress: 'x' });
  assert.deepEqual(res.body, { error: 'Aircon gateway address must be a whole number from 1 to 247', field: 'acAddress' });
  res = await call('POST', '/api/rooms', { ...fields, trhAddress: 4, acAddress: 4 });
  assert.deepEqual(res.body, { error: 'The devices in a room need different addresses', field: 'acAddress' });
  assert.equal(db.listRooms().length, 0);
});

test('an address used by another room (any of the four) gives 409 naming the room and the field', async () => {
  reset();
  db.createRoom({ ...fields, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 });
  let res = await call('POST', '/api/rooms', { ...fields, name: 'B', relayAddress: 1 });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'Address 1 is already used by Room 1', field: 'relayAddress' });
  res = await call('POST', '/api/rooms', { ...fields, name: 'B', acAddress: 3 });
  assert.deepEqual(res.body, { error: 'Address 3 is already used by Room 1', field: 'acAddress' });
  res = await call('POST', '/api/rooms', { ...fields, name: 'B', trhAddress: 4 });
  assert.deepEqual(res.body, { error: 'Address 4 is already used by Room 1', field: 'trhAddress' });
  const other = db.createRoom({ ...fields, name: 'C', relayAddress: 5 });
  res = await call('PUT', `/api/rooms/${other.id}`, { ...fields, name: 'C', relayAddress: 4 });
  assert.equal(res.status, 409);
  assert.equal(res.body.field, 'relayAddress');
});

test('deleting a room deletes its commands', async () => {
  reset();
  const room = db.createRoom(fields);
  assert.equal((await call('DELETE', `/api/rooms/${room.id}`)).status, 204);
  assert.equal(db.getCommands(room.id), null);
});

// --- GET machines ---

test('GET /api/rooms/:id/machines returns the machines object', async () => {
  reset();
  const room = db.createRoom({ ...fields, relayAddress: 10, acAddress: 20 });
  state[room.id] = {
    relay: [{ at: 1, ok: true, coils: [false, false, false, false], inputs: [false, false, false, false] }],
    ac: [{ at: 1, ok: true, power: false, mode: 'cool', setpoint: 25, fan: 'auto', roomT: 24.8, error: 0 }],
  };
  const res = await call('GET', `/api/rooms/${room.id}/machines`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, {
    auto: false,
    relay: {
      address: 10,
      lastWrite: null,
      machines: [
        ...['intake', 'exhaust', 'circulation', 'humidifier'].map((key) => (
          { key, commanded: false, reported: false, running: false, status: 'off' })),
        { key: 'dehumidifier', commanded: false, reported: null, running: null, status: 'not-fitted' },
        { key: 'lights', commanded: false, reported: null, running: null, status: 'not-fitted' },
      ],
    },
    ac: {
      address: 20,
      lastWrite: null,
      commanded: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' },
      reported: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' },
      roomT: 24.8,
      errorCode: 0,
      status: 'off',
    },
  });
});

test('GET machines for a room without devices: not-wired, null values', async () => {
  reset();
  const room = db.createRoom(fields);
  const { body } = await call('GET', `/api/rooms/${room.id}/machines`);
  assert.equal(body.relay.address, null);
  assert.deepEqual(body.relay.machines.map((m) => m.status), ['not-wired', 'not-wired', 'not-wired', 'not-wired', 'not-fitted', 'not-fitted']);
  assert.deepEqual(body.ac, {
    address: null, lastWrite: null, commanded: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' },
    reported: null, roomT: null, errorCode: null, status: 'not-wired',
  });
});

test('GET machines: 404 for a missing room; other methods and paths are 404', async () => {
  reset();
  const room = db.createRoom(fields);
  const missing = await call('GET', '/api/rooms/99/machines');
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { error: 'Room not found' });
  for (const [method, path] of [
    ['POST', `/api/rooms/${room.id}/machines`],
    ['DELETE', `/api/rooms/${room.id}/machines`],
    ['PUT', `/api/rooms/${room.id}/machines`],
    ['GET', `/api/rooms/${room.id}/machines/intake`],
    ['GET', `/api/rooms/${room.id}/machines/`],
    ['PUT', `/api/rooms/${room.id}/machines/intake/x`],
  ]) {
    const res = await call(method, path, method === 'GET' ? undefined : {});
    assert.equal(res.status, 404, `${method} ${path}`);
    assert.deepEqual(res.body, { error: 'Not found' }, `${method} ${path}`);
  }
});

// --- PUT machines ---

test('PUT /api/rooms/:id/machines/:key switches a relay and returns the machines object', async () => {
  reset();
  const room = db.createRoom({ ...fields, relayAddress: 10 });
  const res = await call('PUT', `/api/rooms/${room.id}/machines/exhaust`, { on: true });
  assert.equal(res.status, 200);
  assert.deepEqual(writes, [['coil', 10, 1, true]]);
  assert.deepEqual(res.body.relay.machines[1], { key: 'exhaust', commanded: true, reported: null, running: null, status: 'no-data' });
  assert.equal(res.body.relay.lastWrite.ok, true);
  assert.equal(res.body.relay.lastWrite.error, null);
  assert.equal(typeof res.body.relay.lastWrite.at, 'number');
  assert.equal(res.body.ac.status, 'not-wired');
  assert.deepEqual((await call('GET', `/api/rooms/${room.id}/machines`)).body, res.body);
});

test('PUT /api/rooms/:id/machines/ac sends the aircon settings', async () => {
  reset();
  const room = db.createRoom({ ...fields, acAddress: 20 });
  const res = await call('PUT', `/api/rooms/${room.id}/machines/ac`, acBody);
  assert.equal(res.status, 200);
  assert.deepEqual(writes, [['regs', 20, 0, [1, 0, 235, 0]]]);
  assert.deepEqual(res.body.ac.commanded, acBody);
  assert.equal(res.body.ac.status, 'no-data');
  assert.equal(res.body.ac.lastWrite.ok, true);
});

test('a failed write is still 200 with lastWrite ok:false and the command kept', async () => {
  reset();
  const room = db.createRoom({ ...fields, relayAddress: 10, acAddress: 20 });
  failWrites = new ModbusError('timeout');
  let res = await call('PUT', `/api/rooms/${room.id}/machines/intake`, { on: true });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.relay.lastWrite.ok, res.body.relay.lastWrite.error], [false, 'timeout']);
  assert.equal(res.body.relay.machines[0].commanded, true);
  assert.equal(res.body.ac.lastWrite, null);
  failWrites = new ModbusError('exception', 3);
  res = await call('PUT', `/api/rooms/${room.id}/machines/ac`, acBody);
  assert.equal(res.status, 200);
  assert.equal(res.body.ac.lastWrite.error, 'exception 3');
  assert.equal(db.getCommands(room.id).ac.power, true);
});

test('PUT errors: 404 room and key, 400 body with field, 400 no address, 415, bad JSON', async () => {
  reset();
  const room = db.createRoom({ ...fields, relayAddress: 10 });
  const base404 = await call('PUT', '/api/rooms/99/machines/intake', { on: true });
  assert.deepEqual([base404.status, base404.body], [404, { error: 'Room not found' }]);
  const key404 = await call('PUT', `/api/rooms/${room.id}/machines/heater`, { on: true });
  assert.deepEqual([key404.status, key404.body], [404, { error: 'Not found' }]);

  let res = await call('PUT', `/api/rooms/${room.id}/machines/intake`, { on: 'yes' });
  assert.deepEqual([res.status, res.body], [400, { error: 'on must be true or false', field: 'on' }]);
  res = await call('PUT', `/api/rooms/${room.id}/machines/intake`, []);
  assert.deepEqual([res.status, res.body], [400, { error: 'Body must be a JSON object' }]);
  res = await call('PUT', `/api/rooms/${room.id}/machines/ac`, { ...acBody, setpoint: 31 });
  assert.deepEqual([res.status, res.body.field], [400, 'setpoint']);
  res = await call('PUT', `/api/rooms/${room.id}/machines/ac`, acBody);
  assert.deepEqual([res.status, res.body], [400, { error: 'No aircon gateway address set' }]);
  res = await call('PUT', `/api/rooms/${room.id}/machines/intake`, '{"on":');
  assert.deepEqual([res.status, res.body], [400, { error: 'Body must be valid JSON' }]);
  res = await call('PUT', `/api/rooms/${room.id}/machines/intake`, '{"on":true}', { 'content-type': 'text/plain' });
  assert.equal(res.status, 415);
  const bare = db.createRoom({ ...fields, name: 'B' });
  res = await call('PUT', `/api/rooms/${bare.id}/machines/intake`, { on: true });
  assert.deepEqual([res.status, res.body], [400, { error: 'No relay module address set' }]);
  assert.deepEqual(writes, []);
});

test('a room created after a delete (same id) does not inherit the old lastWrite', async () => {
  reset();
  const room = db.createRoom({ ...fields, relayAddress: 10 });
  await call('PUT', `/api/rooms/${room.id}/machines/intake`, { on: true });
  assert.equal((await call('DELETE', `/api/rooms/${room.id}`)).status, 204);
  const again = db.createRoom({ ...fields, relayAddress: 10 });
  assert.equal(again.id, room.id);
  assert.equal((await call('GET', `/api/rooms/${again.id}/machines`)).body.relay.lastWrite, null);
});

test('without a machines module the machine routes are 404', async () => {
  const bare = createApp(db);
  await new Promise((resolve) => bare.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${bare.address().port}/api/rooms/1/machines`);
    assert.equal(res.status, 404);
  } finally {
    await new Promise((resolve) => bare.close(resolve));
  }
});

// --- the dehumidifier (spec 2026-10-21-dehumidifier-design.md 2) ---

test('PUT machines/dehumidifier: 400 for a room without one, a normal command for a room with one', async () => {
  reset();
  const plain = db.createRoom({ ...fields, relayAddress: 10 });
  const res = await call('PUT', `/api/rooms/${plain.id}/machines/dehumidifier`, { on: true });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'This room has no dehumidifier', field: 'dehumidifier' });
  assert.equal(db.getCommands(plain.id).relay.dehumidifier, false);
  const fitted = db.createRoom({ ...fields, name: 'Wet', relayAddress: 11, dehumidifier: true });
  const ok = await call('PUT', `/api/rooms/${fitted.id}/machines/dehumidifier`, { on: true });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.relay.machines.find((m) => m.key === 'dehumidifier').commanded, true);
});

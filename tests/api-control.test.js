// The control routes of the JSON API and the manual lock.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createMachines } from '../server/machines.js';
import { createController } from '../server/controller.js';

let db;
let server;
let base;
let id;
let controller;
const writes = [];

before(async () => {
  db = openDb(':memory:');
  const client = {
    async writeCoil(...a) { writes.push(['coil', ...a]); },
    async writeRegisters(...a) { writes.push(['regs', ...a]); },
  };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client, poller });
  controller = createController({ db, machines });
  server = createApp(db, { machines, controller });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  for (const room of db.listRooms()) db.deleteRoom(room.id);
  writes.length = 0;
  id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, relayAddress: 3, acAddress: 4 }).id;
});

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const DEFAULT_VIEW = {
  auto: false, co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95,
  exchange: false, exchangeSince: null, humidifierBand: false,
  reasons: { exchange: '', humidifier: '', ac: '', circulation: '' },
};

test('GET control returns the defaults with empty reasons', async () => {
  const r = await call('GET', `/api/rooms/${id}/control`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, DEFAULT_VIEW);
});

test('PUT control changes any of the fields and replies like GET', async () => {
  const r = await call('PUT', `/api/rooms/${id}/control`, { co2High: 800, tLow: 20 });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ...DEFAULT_VIEW, co2High: 800, tLow: 20 });
  assert.deepEqual((await call('GET', `/api/rooms/${id}/control`)).body, r.body);
  const on = await call('PUT', `/api/rooms/${id}/control`, { auto: true });
  assert.equal(on.body.auto, true);
  assert.equal(on.body.co2High, 800);
});

test('PUT control validation answers 400 with the field', async () => {
  const cases = [
    [{ co2Low: 800 }, 'co2Low', 'CO₂ band lower limit must be below the upper limit'],
    [{ tLow: 24 }, 'tLow', 'Temperature band lower limit must be below the upper limit'],
    [{ rhLow: 99, rhHigh: 99 }, 'rhLow', 'Humidity band lower limit must be below the upper limit'],
    [{ co2Low: 100 }, 'co2Low', 'CO₂ band lower limit must be a number from 300 to 5000 ppm'],
    [{ co2High: 6000 }, 'co2High', null],
    [{ tHigh: 40 }, 'tHigh', null],
    [{ rhHigh: 101 }, 'rhHigh', null],
    [{ rhLow: 'x' }, 'rhLow', null],
    [{ auto: 1 }, 'auto', 'auto must be true or false'],
  ];
  for (const [body, field, message] of cases) {
    const r = await call('PUT', `/api/rooms/${id}/control`, body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.equal(r.body.field, field);
    if (message) assert.equal(r.body.error, message);
  }
  assert.equal((await call('PUT', `/api/rooms/${id}/control`, [])).body.field, undefined);
  assert.deepEqual((await call('GET', `/api/rooms/${id}/control`)).body, DEFAULT_VIEW);
});

test('control: 404 for an unknown room, 404 for other methods, 415 without JSON', async () => {
  assert.equal((await call('GET', '/api/rooms/99/control')).status, 404);
  assert.equal((await call('PUT', '/api/rooms/99/control', {})).status, 404);
  assert.equal((await call('DELETE', `/api/rooms/${id}/control`)).status, 404);
  const res = await fetch(`${base}/api/rooms/${id}/control`, { method: 'PUT', body: '{}' });
  assert.equal(res.status, 415);
});

test('a manual machine command is 409 while auto is on; machines GET shows auto', async () => {
  assert.equal((await call('GET', `/api/rooms/${id}/machines`)).body.auto, false);
  await call('PUT', `/api/rooms/${id}/control`, { auto: true });
  assert.equal((await call('GET', `/api/rooms/${id}/machines`)).body.auto, true);
  const r = await call('PUT', `/api/rooms/${id}/machines/intake`, { on: true });
  assert.deepEqual([r.status, r.body], [409, { error: 'Automatic control is on' }]);
  const ac = await call('PUT', `/api/rooms/${id}/machines/ac`, { power: true, mode: 'cool', setpoint: 22, fan: 'auto' });
  assert.equal(ac.status, 409);
  assert.deepEqual(writes, []);
  await call('PUT', `/api/rooms/${id}/control`, { auto: false });
  assert.equal((await call('PUT', `/api/rooms/${id}/machines/intake`, { on: true })).status, 200);
  assert.equal((await call('GET', `/api/rooms/${id}/machines`)).body.auto, false);
});

test('deleting the room deletes its control', async () => {
  assert.equal((await call('DELETE', `/api/rooms/${id}`)).status, 204);
  assert.equal((await call('GET', `/api/rooms/${id}/control`)).status, 404);
});

test('deleting the last room with auto on, then creating a room: its reasons are empty', async () => {
  await call('PUT', `/api/rooms/${id}/control`, { auto: true });
  await controller.run(0); // nothing fresh: still records a reason for the sensor not answering
  assert.notEqual(controller.get(id).reasons.exchange, '');
  assert.equal((await call('DELETE', `/api/rooms/${id}`)).status, 204);
  const created = await call('POST', '/api/rooms', { name: 'Room 2', length: 6, width: 4, height: 2.5 });
  assert.equal(created.status, 201);
  assert.deepEqual((await call('GET', `/api/rooms/${created.body.id}/control`)).body.reasons,
    { exchange: '', humidifier: '', ac: '', circulation: '' });
});

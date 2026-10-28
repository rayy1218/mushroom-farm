// Iteration 7 over HTTP: the new settings, the room's meter and ratings, /api/outdoor, /usage and the meter in /sensors.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { TELEGRAM_VIEW_DEFAULT } from '../server/settings.js';
import { DEFAULT_GATEWAY } from '../server/gateways.js';

let db;
let server;
let base;
const intervals = [];

before(async () => {
  db = openDb(':memory:');
  server = createApp(db, { poller: { setIntervalMs: (ms) => intervals.push(ms) } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
});

beforeEach(() => {
  for (const room of db.listRooms()) db.deleteRoom(room.id);
  for (const key of ['pollSeconds', 'outdoorAddress', 'electricityPrice', 'waterPrice']) db.setSetting(key, '');
  db.setSetting('pollSeconds', '5');
  intervals.length = 0;
});

async function call(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const fields = { name: 'A', length: 6, width: 4, height: 2.5 };
const DEFAULTS = { pollSeconds: 5, outdoorAddress: null, electricityPrice: 0.55, waterPrice: null, ...TELEGRAM_VIEW_DEFAULT, farmGateway: DEFAULT_GATEWAY };

test('GET /api/settings returns all four settings', async () => {
  assert.deepEqual((await call('GET', '/api/settings')).body, DEFAULTS);
});

test('PUT /api/settings accepts any subset, keeps the rest and answers with all of them', async () => {
  let res = await call('PUT', '/api/settings', { electricityPrice: 0.6 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ...DEFAULTS, electricityPrice: 0.6 });
  assert.deepEqual(intervals, []); // the poller is told only about a new interval
  res = await call('PUT', '/api/settings', { outdoorAddress: 9, waterPrice: 2.2, pollSeconds: 8 });
  assert.deepEqual(res.body, { ...DEFAULTS, pollSeconds: 8, outdoorAddress: 9, electricityPrice: 0.6, waterPrice: 2.2 });
  assert.deepEqual(intervals, [8000]);
  res = await call('PUT', '/api/settings', { outdoorAddress: null, waterPrice: null });
  assert.deepEqual(res.body, { ...DEFAULTS, pollSeconds: 8, outdoorAddress: null, electricityPrice: 0.6, waterPrice: null });
  assert.deepEqual((await call('GET', '/api/settings')).body, res.body);
});

test('bad new settings are 400 with the field and change nothing', async () => {
  for (const [body, field] of [
    [{ outdoorAddress: 0 }, 'outdoorAddress'], [{ electricityPrice: 11 }, 'electricityPrice'], [{ waterPrice: -1 }, 'waterPrice'],
    [{ pollSeconds: 5, waterPrice: 101 }, 'waterPrice'],
  ]) {
    const res = await call('PUT', '/api/settings', body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.field, field);
  }
  assert.deepEqual((await call('GET', '/api/settings')).body, DEFAULTS);
  assert.equal((await call('PUT', '/api/settings', {})).status, 400);
});

test('the outdoor address may not be one a room uses, and says which room', async () => {
  db.createRoom({ ...fields, name: 'Room X', co2Address: 4, meterAddress: 30 });
  for (const address of [4, 30]) {
    const res = await call('PUT', '/api/settings', { outdoorAddress: address });
    assert.equal(res.status, 400);
    assert.deepEqual(res.body, { error: `Address ${address} is used by Room X`, field: 'outdoorAddress' });
  }
  assert.equal((await call('PUT', '/api/settings', { outdoorAddress: 5 })).status, 200);
});

test('a room may not take the outdoor address', async () => {
  await call('PUT', '/api/settings', { outdoorAddress: 9 });
  let res = await call('POST', '/api/rooms', { ...fields, relayAddress: 9 });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: 'Address 9 is used by the outdoor sensor', field: 'relayAddress' });
  res = await call('POST', '/api/rooms', { ...fields, meterAddress: 9 });
  assert.equal(res.body.field, 'meterAddress');
  const room = (await call('POST', '/api/rooms', fields)).body;
  res = await call('PUT', `/api/rooms/${room.id}`, { ...fields, trhAddress: 9 });
  assert.equal(res.status, 400);
  assert.equal(res.body.error, 'Address 9 is used by the outdoor sensor');
  assert.equal((await call('PUT', `/api/rooms/${room.id}`, { ...fields, trhAddress: 10 })).status, 200);
  await call('PUT', '/api/settings', { outdoorAddress: null });
  assert.equal((await call('POST', '/api/rooms', { ...fields, name: 'B', trhAddress: 9 })).status, 201);
});

test('the room body carries the meter address and the six ratings', async () => {
  const body = { ...fields, meterAddress: 30, intakeW: 70, exhaustW: 80, circulationW: 20, humidifierW: 90, humidifierLH: 1.5, acInputW: 800 };
  const created = await call('POST', '/api/rooms', body);
  assert.equal(created.status, 201);
  for (const [k, v] of Object.entries(body)) assert.equal(created.body[k], v, k);
  const changed = await call('PUT', `/api/rooms/${created.body.id}`, { ...body, meterAddress: null, acInputW: 900 });
  assert.equal(changed.body.meterAddress, null);
  assert.equal(changed.body.acInputW, 900);
  assert.equal((await call('GET', `/api/rooms/${created.body.id}`)).body.humidifierLH, 1.5);
  const plain = (await call('POST', '/api/rooms', { ...fields, name: 'Plain' })).body;
  assert.deepEqual([plain.meterAddress, plain.intakeW, plain.exhaustW, plain.circulationW, plain.humidifierW, plain.humidifierLH, plain.acInputW],
    [null, 60, 60, 60, 80, 2, 1050]);
});

test('bad ratings are 400 with the field; a taken meter address is 409', async () => {
  let res = await call('POST', '/api/rooms', { ...fields, humidifierLH: 101 });
  assert.equal(res.status, 400);
  assert.equal(res.body.field, 'humidifierLH');
  res = await call('POST', '/api/rooms', { ...fields, intakeW: -1 });
  assert.equal(res.body.field, 'intakeW');
  await call('POST', '/api/rooms', { ...fields, meterAddress: 30 });
  res = await call('POST', '/api/rooms', { ...fields, name: 'B', trhAddress: 30 });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: 'Address 30 is already used by A', field: 'trhAddress' });
  res = await call('POST', '/api/rooms', { ...fields, name: 'C', meterAddress: 30 });
  assert.equal(res.status, 409);
  assert.equal(res.body.field, 'meterAddress');
});

test('GET /api/rooms/:id/sensors has the energy meter after the two sensors', async () => {
  const room = db.createRoom({ ...fields, meterAddress: 30 });
  let res = await call('GET', `/api/rooms/${room.id}/sensors`);
  assert.deepEqual(res.body.map((s) => s.kind), ['trh', 'co2', 'meter', 'dp']);
  assert.deepEqual(res.body[2], { kind: 'meter', address: 30, status: 'no-data', failuresInRow: 0, lastOk: null, readings: [] });
  const at = Date.now();
  db.addMeterReading({ roomId: room.id, address: 30, at, ok: true, powerW: 230.5, energyKwh: 12.25 });
  res = await call('GET', `/api/rooms/${room.id}/sensors`);
  assert.deepEqual(res.body[2], {
    kind: 'meter', address: 30, status: 'online', failuresInRow: 0, lastOk: { at, power: 230.5, energy: 12.25 },
    readings: [{ at, ok: true, power: 230.5, energy: 12.25 }],
  });
});

test('GET /api/outdoor: not set, then set with readings', async () => {
  assert.deepEqual((await call('GET', '/api/outdoor')).body, {
    address: null, status: 'not-set', last: null, check: null, spark: { t: [], rh: [] },
  });
  await call('PUT', '/api/settings', { outdoorAddress: 9 });
  const at = Date.now() - 60_000;
  db.addOutdoorReading({ address: 9, at, ok: true, t: 30, rh: 70 });
  const res = await call('GET', '/api/outdoor');
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), ['address', 'status', 'last', 'check', 'spark']);
  assert.equal(res.body.status, 'online');
  assert.deepEqual(res.body.last, { at, t: 30, rh: 70, dew: 23.9 });
  assert.deepEqual(res.body.check, { ok: true, why: null, fault: false });
  assert.deepEqual(res.body.spark.t.map((p) => p.v), [30]);
  assert.equal((await call('POST', '/api/outdoor', {})).status, 404);
});

test('GET /api/outdoor/history needs a range', async () => {
  await call('PUT', '/api/settings', { outdoorAddress: 9 });
  db.addOutdoorReading({ address: 9, at: Date.now() - 60_000, ok: true, t: 30, rh: 70 });
  for (const range of ['1h', '6h', '24h', '7d', '30d']) {
    const res = await call('GET', `/api/outdoor/history?range=${range}`);
    assert.equal(res.status, 200, range);
    assert.deepEqual(Object.keys(res.body), ['from', 'to', 'bucketS', 'trh', 'pollSeconds']);
    assert.equal(res.body.trh.length, 1);
    assert.equal(res.body.pollSeconds, 5);
  }
  for (const path of ['/api/outdoor/history', '/api/outdoor/history?range=2h']) {
    const res = await call('GET', path);
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'range');
  }
});

test('GET /api/rooms/:id/usage and /api/usage: shape, days, prices, errors', async () => {
  await call('PUT', '/api/settings', { electricityPrice: 0.5, waterPrice: 2 });
  const room = db.createRoom({ ...fields, intakeW: 1000, humidifierW: 0, humidifierLH: 10 });
  const start = Date.now() - 3_600_000;
  db.logMachine(room.id, 'intake', { on: true }, 'manual', start);
  db.logMachine(room.id, 'humidifier', { on: true }, 'manual', start);
  const res = await call('GET', `/api/rooms/${room.id}/usage`);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body), ['prices', 'days', 'today', 'last7', 'last30']);
  assert.deepEqual(res.body.prices, { electricity: 0.5, water: 2 });
  assert.equal(res.body.days.length, 30);
  assert.match(res.body.days[0].date, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(res.body.days[29]), ['date', 'kWh', 'metered', 'byMachine', 'waterL']);
  assert.deepEqual(Object.keys(res.body.days[29].byMachine), ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights', 'ac', 'rest']);
  // The hour may straddle midnight, so look at the 30 days.
  assert.ok(Math.abs(res.body.last30.kWh - 1) < 0.01, String(res.body.last30.kWh));
  assert.ok(Math.abs(res.body.last30.waterL - 10) < 0.1);
  assert.ok(Math.abs(res.body.last30.cost - 0.5) < 0.01);
  assert.equal((await call('GET', `/api/rooms/${room.id}/usage?days=7`)).body.days.length, 7);
  assert.equal((await call('GET', `/api/rooms/${room.id}/usage?days=90`)).body.days.length, 90);

  for (const days of ['0', '91', 'x', '1.5', '']) {
    const bad = await call('GET', `/api/rooms/${room.id}/usage?days=${days}`);
    assert.equal(bad.status, 400, days);
    assert.deepEqual(bad.body, { error: 'days must be a whole number from 1 to 90', field: 'days' });
  }
  assert.equal((await call('GET', '/api/rooms/99/usage')).status, 404);
  assert.equal((await call('POST', `/api/rooms/${room.id}/usage`, {})).status, 404);

  const farm = await call('GET', '/api/usage?days=5');
  assert.equal(farm.status, 200);
  assert.deepEqual(Object.keys(farm.body), ['prices', 'days', 'today', 'last7', 'last30', 'rooms']);
  assert.equal(farm.body.days.length, 5);
  assert.deepEqual(farm.body.rooms.map((r) => [r.id, r.name]), [[room.id, 'A']]);
  assert.deepEqual(Object.keys(farm.body.rooms[0]), ['id', 'name', 'today', 'last30']);
  assert.ok(Math.abs(farm.body.last30.kWh - 1) < 0.01);
  assert.equal((await call('GET', '/api/usage?days=0')).status, 400);
  assert.equal((await call('DELETE', '/api/usage')).status, 404);
});

// A Modbus gateway per room (a container behind its own gateway): the rooms.gateway column (upgrade 17 → 18), its check,
// addresses that clash only on the same gateway, the API's farm gateway, a client per gateway (server/gateways.js), the poller
// reading each room through its own gateway (the gateways at the same time) and the machines writing through it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, AddressTakenError } from '../server/db.js';
import { validateRoom } from '../server/rooms.js';
import { createApp } from '../server/app.js';
import { createGateways, parseGateway, sameGateway, DEFAULT_GATEWAY } from '../server/gateways.js';
import { createPoller } from '../server/poller.js';
import { createMachines } from '../server/machines.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const FARM = '127.0.0.1:1502';

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

// ---- upgrade 17 → 18 ----

test('upgrade 17 to 18: the rooms are kept and are on the farm\'s gateway (null); running it again is harmless', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'gateways-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  const id = first.createRoom({ ...ROOM, trhAddress: 3, relayAddress: 5 }, 1000).id;
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec('ALTER TABLE rooms DROP COLUMN gateway; PRAGMA user_version = 17;');
  raw.close();

  const db = openDb(path);
  const room = db.getRoom(id);
  assert.deepEqual([room.name, room.trhAddress, room.relayAddress, room.gateway], ['Room 1', 3, 5, null]);
  db.close();
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 18);

  const again = new DatabaseSync(path); // a file that has the column but an older version
  again.exec('PRAGMA user_version = 17;');
  again.close();
  const reopened = openDb(path);
  assert.equal(reopened.getRoom(id).gateway, null);
  reopened.close();
});

// ---- the check ----

test('gateway: left out stays out (an update keeps it); null, empty or blank is the farm\'s; host:port is kept trimmed', () => {
  const gateway = (value) => validateRoom({ ...ROOM, gateway: value });
  assert.equal('gateway' in validateRoom(ROOM).room, false);
  assert.equal(gateway(null).room.gateway, null);
  assert.equal(gateway('').room.gateway, null);
  assert.equal(gateway('   ').room.gateway, null);
  assert.equal(gateway(' 192.168.1.50:502 ').room.gateway, '192.168.1.50:502');
  assert.equal(gateway('container-2.local:1502').room.gateway, 'container-2.local:1502');
  assert.equal(gateway('[fd00::5]:502').room.gateway, '[fd00::5]:502');
  assert.equal(gateway('a:1').room.gateway, 'a:1');
  assert.equal(gateway('a:65535').room.gateway, 'a:65535');
});

test('gateway: anything but host:port (a port from 1 to 65535, no spaces, at most 100 characters) is refused', () => {
  const error = "Gateway must look like host:port, such as 192.168.1.50:502, or be empty for the farm's gateway";
  for (const bad of ['192.168.1.50', ':502', 'host:', 'host:0', 'host:65536', 'host:123456', 'my host:502', 'host:5o2', `${'h'.repeat(97)}:502`, 502, true, {}]) {
    assert.deepEqual(validateRoom({ ...ROOM, gateway: bad }), { error, field: 'gateway' }, JSON.stringify(bad));
  }
  assert.equal(validateRoom({ ...ROOM, gateway: `${'h'.repeat(96)}:502` }).room.gateway.length, 100);
});

test('parseGateway: host and port, the [ ] of an IPv6 address taken off; sameGateway compares them', () => {
  assert.deepEqual(parseGateway('127.0.0.1:1502'), { host: '127.0.0.1', port: 1502 });
  assert.deepEqual(parseGateway('[::1]:502'), { host: '::1', port: 502 });
  assert.equal(parseGateway('host:0'), null);
  assert.equal(parseGateway('nothing'), null);
  assert.equal(DEFAULT_GATEWAY, FARM);
  assert.equal(sameGateway('Gateway.local:502', 'gateway.local:502'), true);
  assert.equal(sameGateway('[::1]:502', '::1:502'), true);
  assert.equal(sameGateway('a:502', 'a:503'), false);
  assert.equal(sameGateway(null, 'a:502'), false);
});

// ---- the database ----

test('a room keeps its gateway; an update that leaves it out keeps it, null puts the room back on the farm\'s', (t) => {
  const db = fresh(t);
  const room = db.createRoom({ ...ROOM, gateway: '10.0.0.7:502' });
  assert.equal(room.gateway, '10.0.0.7:502');
  assert.equal(db.createRoom({ ...ROOM, name: 'Room 2' }).gateway, null);
  assert.equal(db.updateRoom(room.id, { ...ROOM, trhAddress: 4 }).gateway, '10.0.0.7:502');
  assert.equal(db.updateRoom(room.id, { ...ROOM, gateway: '10.0.0.8:502' }).gateway, '10.0.0.8:502');
  assert.equal(db.updateRoom(room.id, { ...ROOM, gateway: null }).gateway, null);
});

test('addresses clash only between rooms on the same gateway', (t) => {
  const db = fresh(t);
  db.createRoom({ ...ROOM, trhAddress: 1, relayAddress: 3 });
  const a = db.createRoom({ ...ROOM, name: 'Container A', gateway: '10.0.0.7:502', trhAddress: 1, relayAddress: 3 });
  assert.equal(a.trhAddress, 1, 'the same address behind another gateway');
  db.createRoom({ ...ROOM, name: 'Container B', gateway: '10.0.0.8:502', trhAddress: 1, relayAddress: 3 });
  assert.throws(() => db.createRoom({ ...ROOM, name: 'Container A2', gateway: '10.0.0.7:502', co2Address: 3 }), (err) => {
    assert.ok(err instanceof AddressTakenError);
    assert.equal(err.message, 'Address 3 is already used by Container A');
    assert.equal(err.field, 'co2Address');
    return true;
  });
  assert.throws(() => db.createRoom({ ...ROOM, name: 'Room 2', co2Address: 1 }), /already used by Room 1$/);
  // Moving a room to a gateway where its address is taken is refused too.
  assert.throws(() => db.updateRoom(a.id, { ...ROOM, name: 'Container A', gateway: null, trhAddress: 1 }), /already used by Room 1$/);
});

test('the list functions carry each device\'s gateway', (t) => {
  const db = fresh(t);
  db.createRoom({ ...ROOM, trhAddress: 1, relayAddress: 3, meterAddress: 4, dpAddress: 5 });
  db.createRoom({ ...ROOM, name: 'Container', gateway: '10.0.0.7:502', co2Address: 1, acAddress: 3, meterAddress: 4, dpAddress: 5 });
  assert.deepEqual(db.listWiredSensors().map((s) => [s.roomId, s.kind, s.gateway]), [[1, 'trh', null], [2, 'co2', '10.0.0.7:502']]);
  assert.deepEqual(db.listWiredMachines().map((m) => [m.roomId, m.kind, m.gateway]), [[1, 'relay', null], [2, 'ac', '10.0.0.7:502']]);
  assert.deepEqual(db.listMeters().map((m) => [m.roomId, m.gateway]), [[1, null], [2, '10.0.0.7:502']]);
  assert.deepEqual(db.listFilterSensors().map((m) => [m.roomId, m.gateway]), [[1, null], [2, '10.0.0.7:502']]);
});

// ---- the API ----

async function app(t, options = {}) {
  const db = openDb(':memory:');
  const server = createApp(db, options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, body === undefined ? { method } : { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json() };
  };
  return { db, call };
}

test('GET /api/settings says the farm\'s gateway; it cannot be set', async (t) => {
  const { call } = await app(t, { gateway: '192.168.1.40:502' });
  assert.equal((await call('GET', '/api/settings')).body.farmGateway, '192.168.1.40:502');
  const put = await call('PUT', '/api/settings', { farmGateway: '10.0.0.1:502', pollSeconds: 7 });
  assert.equal(put.status, 200);
  assert.deepEqual([put.body.farmGateway, put.body.pollSeconds], ['192.168.1.40:502', 7]);
  const { call: plain } = await app(t);
  assert.equal((await plain('GET', '/api/settings')).body.farmGateway, DEFAULT_GATEWAY, 'without one: the default');
});

test('the API stores the farm\'s own gateway as null, so it clashes with the rooms on the farm\'s gateway', async (t) => {
  const { db, call } = await app(t, { gateway: FARM });
  const farm = await call('POST', '/api/rooms', { ...ROOM, gateway: ` ${FARM} `, trhAddress: 1 });
  assert.equal(farm.status, 201);
  assert.equal(farm.body.gateway, null);
  const clash = await call('POST', '/api/rooms', { ...ROOM, name: 'Room 2', trhAddress: 1 });
  assert.deepEqual([clash.status, clash.body.field], [409, 'trhAddress']);
  const own = await call('POST', '/api/rooms', { ...ROOM, name: 'Container', gateway: '10.0.0.7:502', trhAddress: 1 });
  assert.deepEqual([own.status, own.body.gateway], [201, '10.0.0.7:502']);
  const back = await call('PUT', `/api/rooms/${own.body.id}`, { ...ROOM, name: 'Container', gateway: '127.0.0.1:1502', trhAddress: 1 });
  assert.deepEqual([back.status, back.body.field], [409, 'trhAddress'], 'moved onto the farm\'s gateway: the address clashes');
  const bad = await call('POST', '/api/rooms', { ...ROOM, name: 'Room 3', gateway: 'nope' });
  assert.deepEqual([bad.status, bad.body.field], [400, 'gateway']);
  assert.equal(db.listRooms().length, 2);
});

test('a PUT that leaves the gateway out keeps it', async (t) => {
  const { call } = await app(t);
  const { body: room } = await call('POST', '/api/rooms', { ...ROOM, gateway: '10.0.0.7:502' });
  const put = await call('PUT', `/api/rooms/${room.id}`, { ...ROOM, trhAddress: 2 });
  assert.deepEqual([put.status, put.body.gateway, put.body.trhAddress], [200, '10.0.0.7:502', 2]);
  const cleared = await call('PUT', `/api/rooms/${room.id}`, { ...ROOM, gateway: '' });
  assert.equal(cleared.body.gateway, null);
});

test('the outdoor sensor\'s address clashes only with the rooms on the farm\'s gateway (it is read through it)', async (t) => {
  const { call } = await app(t);
  assert.equal((await call('PUT', '/api/settings', { outdoorAddress: 9 })).status, 200);
  const farm = await call('POST', '/api/rooms', { ...ROOM, trhAddress: 9 });
  assert.deepEqual([farm.status, farm.body.error], [400, 'Address 9 is used by the outdoor sensor']);
  const own = await call('POST', '/api/rooms', { ...ROOM, gateway: '10.0.0.7:502', trhAddress: 9, relayAddress: 8 });
  assert.equal(own.status, 201);
  assert.equal((await call('PUT', '/api/settings', { outdoorAddress: 8 })).status, 200, 'a container\'s address is free on the farm\'s');
  await call('POST', '/api/rooms', { ...ROOM, name: 'Room 2', relayAddress: 7 });
  const taken = await call('PUT', '/api/settings', { outdoorAddress: 7 });
  assert.deepEqual([taken.status, taken.body.error], [400, 'Address 7 is used by Room 2']);
});

test('a relay module moved to another gateway: a running dehumidifier taken out is switched off through the old one first', async (t) => {
  const db = openDb(':memory:');
  const writes = [];
  const clients = { forRoom: (g) => ({ writeCoil: async (...args) => { writes.push([g, ...args]); }, writeRegisters: async () => {} }) };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, clients, poller });
  const server = createApp(db, { machines });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  });
  const room = db.createRoom({ ...ROOM, relayAddress: 3, dehumidifier: true });
  await machines.command(room.id, 'dehumidifier', { on: true });
  const res = await fetch(`http://127.0.0.1:${server.address().port}/api/rooms/${room.id}`, {
    method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...ROOM, relayAddress: 3, dehumidifier: false, gateway: '10.0.0.7:502' }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(writes, [[null, 3, 4, true], [null, 3, 4, false]]);
});

// ---- a client per gateway ----

test('createGateways: a client per distinct gateway, made on first use (the farm\'s for null), all closed together', () => {
  const made = [];
  const make = ({ host, port }) => {
    const client = { host, port, closed: false, close() { client.closed = true; } };
    made.push(client);
    return client;
  };
  const gateways = createGateways({ farm: { host: '127.0.0.1', port: 1502 }, make });
  assert.equal(made.length, 0, 'nothing made before it is asked for');
  const farm = gateways.forRoom(null);
  assert.deepEqual([farm.host, farm.port], ['127.0.0.1', 1502]);
  assert.equal(gateways.forRoom(undefined), farm);
  assert.equal(gateways.forRoom('127.0.0.1:1502'), farm, 'the farm\'s text: the same client');
  const a = gateways.forRoom('10.0.0.7:502');
  assert.equal(gateways.forRoom('10.0.0.7:502'), a);
  const v6 = gateways.forRoom('[fd00::5]:502');
  assert.deepEqual([v6.host, v6.port], ['fd00::5', 502]);
  assert.equal(made.length, 3);
  assert.throws(() => gateways.forRoom('nope'), /Not a gateway: "nope"/);
  gateways.close();
  assert.deepEqual(made.map((c) => c.closed), [true, true, true]);
  assert.notEqual(gateways.forRoom(null), farm, 'after close: a new client');
});

// ---- the poller ----

function fakeDb({ sensors = [], machines = [], meters = [], filters = [], outdoor = null } = {}) {
  const readings = [];
  const db = {
    readings,
    listWiredSensors: () => sensors,
    listWiredMachines: () => machines,
    listMeters: () => meters,
    listFilterSensors: () => filters,
    outdoorAddress: () => outdoor,
    addReading: (r) => readings.push({ type: 'room', ...r }),
    addOutdoorReading: (r) => readings.push({ type: 'outdoor', ...r }),
    addMeterReading: (r) => readings.push({ type: 'meter', ...r }),
    addFilterReading: (r) => readings.push({ type: 'filter', ...r }),
  };
  return db;
}

// A client of one gateway: its reads are logged with its name; hold() makes the reads wait until release().
function fakeClient(name, log) {
  let gate = null;
  const client = {
    hold() {
      let release;
      gate = new Promise((resolve) => { release = resolve; });
      return () => { gate = null; release(); };
    },
    async readRegisters(unit, fn) {
      log.push([name, unit]);
      if (gate) await gate;
      if (fn === 3) return [950];
      if (fn === 4) return [265, 881];
      return [0];
    },
    async readBits(unit) {
      log.push([name, unit]);
      if (gate) await gate;
      return [false, false, false, false];
    },
  };
  return client;
}

function fakeGateways(log) {
  const clients = new Map();
  return {
    clients,
    forRoom(gateway) {
      const key = gateway ?? 'farm';
      if (!clients.has(key)) clients.set(key, fakeClient(key, log));
      return clients.get(key);
    },
  };
}

test('each room is read through its own gateway, the outdoor probe through the farm\'s', async () => {
  const log = [];
  const db = fakeDb({
    outdoor: 30,
    sensors: [{ roomId: 1, kind: 'trh', address: 1, gateway: null }, { roomId: 2, kind: 'trh', address: 1, gateway: 'c:502' }],
    meters: [{ roomId: 2, address: 4, gateway: 'c:502' }],
    filters: [{ roomId: 2, address: 5, gateway: 'c:502' }],
    machines: [{ roomId: 2, kind: 'relay', address: 3, outputs: 4, gateway: 'c:502' }, { roomId: 1, kind: 'ac', address: 6, gateway: null }],
  });
  const poller = createPoller({ db, clients: fakeGateways(log), log: (err) => { throw err; } });
  await poller.cycle();
  assert.deepEqual(log.filter(([g]) => g === 'farm'), [['farm', 30], ['farm', 1], ['farm', 6], ['farm', 6]]);
  assert.deepEqual(log.filter(([g]) => g === 'c:502'), [['c:502', 1], ['c:502', 5], ['c:502', 4], ['c:502', 4], ['c:502', 3], ['c:502', 3]]);
  assert.equal(db.readings.length, 5);
  assert.equal(poller.machineState(2).relay.polls[0].ok, true);
});

test('the gateways are read at the same time: a gateway that hangs does not hold the rooms of another', async () => {
  const log = [];
  const gateways = fakeGateways(log);
  const release = gateways.forRoom('dead:502').hold();
  const db = fakeDb({
    sensors: [
      { roomId: 1, kind: 'trh', address: 1, gateway: 'dead:502' },
      { roomId: 1, kind: 'co2', address: 2, gateway: 'dead:502' },
      { roomId: 2, kind: 'trh', address: 1, gateway: null },
      { roomId: 3, kind: 'trh', address: 1, gateway: 'c:502' },
    ],
  });
  let ran = 0;
  const poller = createPoller({ db, clients: gateways, afterCycle: async () => { ran++; } });
  const cycle = poller.cycle();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(db.readings.map((r) => r.roomId).sort(), [2, 3], 'the other gateways\' rooms are read while the first waits');
  assert.equal(ran, 0, 'the controller waits for every gateway');
  release();
  await cycle;
  assert.deepEqual(db.readings.map((r) => [r.roomId, r.kind]).slice(2), [[1, 'trh'], [1, 'co2']], 'one gateway\'s devices in order');
  assert.equal(ran, 1);
});

test('the cycle starts with its first poll; a stop while a gateway hangs ends the cycle without the controller', async () => {
  const log = [];
  const gateways = fakeGateways(log);
  const release = gateways.forRoom('dead:502').hold();
  const db = fakeDb({
    sensors: [
      { roomId: 1, kind: 'trh', address: 1, gateway: 'dead:502' },
      { roomId: 1, kind: 'co2', address: 2, gateway: 'dead:502' },
      { roomId: 2, kind: 'trh', address: 1, gateway: null },
    ],
  });
  let clock = 100;
  const starts = [];
  const poller = createPoller({ db, clients: gateways, now: () => clock++, afterCycle: async (at) => { starts.push(at); } });
  const first = poller.cycle();
  await new Promise((resolve) => setImmediate(resolve));
  release();
  await first;
  assert.deepEqual(starts, [100]);
  const releaseAgain = gateways.forRoom('dead:502').hold();
  const second = poller.cycle();
  await new Promise((resolve) => setImmediate(resolve));
  const stopped = poller.stop();
  releaseAgain();
  await stopped;
  await second;
  assert.equal(starts.length, 1, 'no controller run after a stop');
  assert.equal(db.readings.filter((r) => r.roomId === 1 && r.kind === 'co2').length, 1, 'no poll begun after the stop');
});

test('a poller made with one client reads everything through it, whatever the gateway', async () => {
  const log = [];
  const client = fakeClient('one', log);
  const db = fakeDb({ sensors: [{ roomId: 1, kind: 'trh', address: 1, gateway: 'c:502' }, { roomId: 2, kind: 'trh', address: 2 }] });
  await createPoller({ db, client }).cycle();
  assert.deepEqual(log, [['one', 1], ['one', 2]]);
});

// ---- the machines ----

test('the machines write through the room\'s gateway', async (t) => {
  const db = fresh(t);
  const writes = [];
  const clients = {
    forRoom: (gateway) => ({
      writeCoil: async (...args) => { writes.push([gateway, 'coil', ...args]); },
      writeRegisters: async (...args) => { writes.push([gateway, 'regs', ...args]); },
    }),
  };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, clients, poller });
  const farm = db.createRoom({ ...ROOM, relayAddress: 3 });
  const container = db.createRoom({ ...ROOM, name: 'Container', gateway: '10.0.0.7:502', relayAddress: 3, acAddress: 4 });
  await machines.command(farm.id, 'intake', { on: true });
  await machines.command(container.id, 'exhaust', { on: true });
  await machines.command(container.id, 'ac', { power: true, mode: 'cool', setpoint: 22, fan: 'auto' });
  assert.deepEqual(writes, [
    [null, 'coil', 3, 0, true],
    ['10.0.0.7:502', 'coil', 3, 1, true],
    ['10.0.0.7:502', 'regs', 4, 0, [1, 0, 220, 0]],
  ]);
});

test('the last write of a device is not shown once the room is on another gateway', async (t) => {
  const db = fresh(t);
  const clients = { forRoom: () => ({ writeCoil: async () => {}, writeRegisters: async () => {} }) };
  const poller = { machineState: () => ({ relay: { address: 3, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, clients, poller });
  const room = db.createRoom({ ...ROOM, relayAddress: 3 });
  await machines.command(room.id, 'intake', { on: true });
  assert.equal(machines.get(room.id).relay.lastWrite.ok, true);
  db.updateRoom(room.id, { ...ROOM, relayAddress: 3, gateway: '10.0.0.7:502' });
  assert.equal(machines.get(room.id).relay.lastWrite, null);
});

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startDevice } from '../device/server.js';
import { createSensors } from '../device/sensors.js';
import { createSims } from '../device/sim-store.js';
import { outdoorAt } from '../device/sim-model.js';

// A model with fixed, easy numbers: the store and HTTP tests do not depend on the real physics.
const model = {
  satW: () => 20,
  rhOf: (T, W) => W * 5,
  wOf: (T, RH) => RH / 5,
  initialState: (p) => ({ T: p.outdoorT, W: 10, CO2: 420 }),
  step: (state) => ({ state, acting: { exchangeM3h: 0, acCoolKW: 0, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }),
};

let device;
let base;
const dirs = [];
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-sim-'));
  dirs.push(dir);
  return dir;
};

before(async () => {
  device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 0, model });
  base = `http://127.0.0.1:${device.httpPort}`;
});

after(async () => {
  await device.close();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

async function call(method, path, body) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' };
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const res = await fetch(base + path, init);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function reset() {
  for (const s of device.sensors.list()) device.sensors.remove(s.address);
  for (const r of device.sims.list()) device.sims.remove(r.id);
}

test('POST /api/sims adds a room with the defaults and GET lists it', async () => {
  reset();
  const res = await call('POST', '/api/sims', {});
  assert.equal(res.status, 201);
  const room = res.body;
  assert.match(room.name, /^Sim room \d+$/);
  assert.deepEqual(
    { enabled: room.enabled, trh: room.trh, co2: room.co2, relay: room.relay, ac: room.ac },
    { enabled: false, trh: null, co2: null, relay: null, ac: null },
  );
  assert.deepEqual(
    { volume: room.volume, blocks: room.blocks, co2PerBlock: room.co2PerBlock, wallUA: room.wallUA, outdoorHigh: room.outdoorHigh, outdoorLow: room.outdoorLow, outdoorDew: room.outdoorDew, fanFlow: room.fanFlow, acBTU: room.acBTU, humidifierLH: room.humidifierLH },
    { volume: 60, blocks: 500, co2PerBlock: 60, wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, fanFlow: 600, acBTU: 12000, humidifierLH: 2 },
  );
  // The air starts as the outdoor air at the room's time of day, which starts at the local time.
  assert.ok(Number.isInteger(room.clock) && room.clock >= 0 && room.clock < 86400);
  const out = outdoorAt(room, room.clock);
  assert.deepEqual(room.state, { T: out.outdoorT, W: 10, CO2: 420 });
  assert.deepEqual(room.outdoor, { T: Math.round(out.outdoorT * 10) / 10, RH: Math.round(out.outdoorRH * 10) / 10 });
  assert.equal(room.rh, 50);
  assert.equal(room.acting, null);
  const list = await call('GET', '/api/sims');
  assert.deepEqual(list.body.map((r) => r.id), [room.id]);
  const named = await call('POST', '/api/sims', { name: '  Room B ' });
  assert.equal(named.body.name, 'Room B');
});

test('PUT /api/sims/:id changes name, enabled and parameters', async () => {
  reset();
  const { id } = (await call('POST', '/api/sims', {})).body;
  const res = await call('PUT', `/api/sims/${id}`, { name: 'Fruiting', enabled: true, volume: 80.5, blocks: 700, acBTU: 18000, humidifierLH: 0.5 });
  assert.equal(res.status, 200);
  assert.deepEqual([res.body.name, res.body.enabled, res.body.volume, res.body.blocks, res.body.acBTU, res.body.humidifierLH], ['Fruiting', true, 80.5, 700, 18000, 0.5]);
});

test('PUT validation: 400 with the field', async () => {
  reset();
  const { id } = (await call('POST', '/api/sims', {})).body;
  const bad = async (patch, field) => {
    const res = await call('PUT', `/api/sims/${id}`, patch);
    assert.equal(res.status, 400, JSON.stringify(patch));
    assert.equal(res.body.field, field, JSON.stringify(patch));
    assert.equal(typeof res.body.error, 'string');
  };
  await bad({ name: '' }, 'name');
  await bad({ name: 'x'.repeat(41) }, 'name');
  await bad({ enabled: 'yes' }, 'enabled');
  await bad({ volume: 0 }, 'volume');
  await bad({ volume: '60' }, 'volume');
  await bad({ blocks: 1.5 }, 'blocks');
  await bad({ blocks: -1 }, 'blocks');
  await bad({ outdoorHigh: 200 }, 'outdoorHigh');
  await bad({ outdoorDew: -41 }, 'outdoorDew');
  await bad({ outdoorLow: 34 }, 'outdoorLow'); // above the day high of 33
  await bad({ outdoorDew: 26 }, 'outdoorDew'); // above the night low of 25
  await bad({ outdoorHigh: 24 }, 'outdoorLow'); // the night low of 25 is now above the day high
  await bad({ co2PerBlock: 1001 }, 'co2PerBlock');
  await bad({ wallUA: -1 }, 'wallUA');
  await bad({ sunW: -1 }, 'sunW');
  await bad({ fanFlow: Infinity }, 'fanFlow');
  await bad({ acBTU: null }, 'acBTU');
  await bad({ acBTU: 200001 }, 'acBTU');
  await bad({ acBTU: 12000.5 }, 'acBTU');
  await bad({ humidifierLH: -5 }, 'humidifierLH');
  await bad({ humidifierLH: 100.1 }, 'humidifierLH');
  await bad({ trh: 1.5 }, 'trh');
  await bad({ trh: 99 }, 'trh');
  assert.equal((await call('PUT', `/api/sims/${id}`, {})).status, 400);
  assert.equal((await call('PUT', `/api/sims/${id}`, '[1]')).status, 400);
  assert.equal((await call('POST', '/api/sims', { name: 5 })).status, 400);
});

test('unknown room is 404; unsupported method 404', async () => {
  reset();
  assert.equal((await call('PUT', '/api/sims/99', { name: 'x' })).status, 404);
  assert.equal((await call('DELETE', '/api/sims/99')).status, 404);
  assert.equal((await call('POST', '/api/sims/99/reset')).status, 404);
  assert.equal((await call('GET', '/api/sims/1')).status, 404);
  assert.equal((await call('DELETE', '/api/sims')).status, 404);
});

test('a non-JSON content type is 415', async () => {
  const res = await fetch(`${base}/api/sims`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
  assert.equal(res.status, 415);
});

test('links: only a device of the right kind, only once', async () => {
  reset();
  device.sensors.add({ address: 1, kind: 'trh' });
  device.sensors.add({ address: 2, kind: 'co2' });
  device.sensors.add({ address: 3, kind: 'relay' });
  device.sensors.add({ address: 4, kind: 'ac' });
  const a = (await call('POST', '/api/sims', {})).body.id;
  const b = (await call('POST', '/api/sims', {})).body.id;
  const ok = await call('PUT', `/api/sims/${a}`, { trh: 1, co2: 2, relay: 3, ac: 4 });
  assert.equal(ok.status, 200);
  assert.deepEqual([ok.body.trh, ok.body.co2, ok.body.relay, ok.body.ac], [1, 2, 3, 4]);

  const wrong = await call('PUT', `/api/sims/${b}`, { co2: 1 });
  assert.equal(wrong.status, 409);
  assert.equal(wrong.body.field, 'co2');
  const taken = await call('PUT', `/api/sims/${b}`, { trh: 1 });
  assert.equal(taken.status, 409);
  assert.equal(taken.body.field, 'trh');
  assert.match(taken.body.error, /already linked/);

  // Re-saving its own link is fine; unlinking frees the device.
  assert.equal((await call('PUT', `/api/sims/${a}`, { trh: 1 })).status, 200);
  assert.equal((await call('PUT', `/api/sims/${a}`, { trh: null })).body.trh, null);
  assert.equal((await call('PUT', `/api/sims/${b}`, { trh: 1 })).status, 200);
  assert.equal((await call('GET', '/api/sims')).body.find((r) => r.id === a).trh, null);
});

test('reset puts the air back to the start; delete removes the room', async () => {
  reset();
  const { id } = (await call('POST', '/api/sims', {})).body;
  device.sims.setState(id, { T: 20, W: 3, CO2: 2000 }, null);
  assert.equal(device.sims.get(id).state.T, 20);
  const res = await call('POST', `/api/sims/${id}/reset`);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.state, { T: outdoorAt(res.body, res.body.clock).outdoorT, W: 10, CO2: 420 });
  assert.equal((await call('DELETE', `/api/sims/${id}`)).status, 204);
  assert.deepEqual((await call('GET', '/api/sims')).body, []);
});

test('speed is 1, 10 or 60', async () => {
  assert.deepEqual((await call('GET', '/api/sim-speed')).body, { speed: 1 });
  assert.deepEqual((await call('PUT', '/api/sim-speed', { speed: 60 })).body, { speed: 60 });
  assert.equal(device.sims.getSpeed(), 60);
  for (const speed of [0, 5, '10', null]) {
    const res = await call('PUT', '/api/sim-speed', { speed });
    assert.equal(res.status, 400);
    assert.equal(res.body.field, 'speed');
  }
  await call('PUT', '/api/sim-speed', { speed: 1 });
});

test('a simulated sensor refuses manual values with 409 while its room is enabled', async () => {
  reset();
  device.sensors.add({ address: 1, kind: 'trh' });
  device.sensors.add({ address: 2, kind: 'co2' });
  device.sensors.add({ address: 3, kind: 'relay' });
  device.sensors.add({ address: 4, kind: 'ac' });
  const { id } = (await call('POST', '/api/sims', { name: 'Room A' })).body;
  await call('PUT', `/api/sims/${id}`, { trh: 1, co2: 2, relay: 3, ac: 4 });

  // Linked but not enabled: still editable.
  assert.equal((await call('PUT', '/api/sensors/1', { t: 20 })).status, 200);

  await call('PUT', `/api/sims/${id}`, { enabled: true });
  for (const [path, patch, field] of [['/api/sensors/1', { t: 21 }, 't'], ['/api/sensors/1', { rh: 50 }, 'rh'], ['/api/sensors/2', { co2: 900 }, 'co2'], ['/api/sensors/4', { roomT: 22 }, 'roomT']]) {
    const res = await call('PUT', path, patch);
    assert.equal(res.status, 409, path);
    assert.equal(res.body.error, `Sensor ${path.slice(-1)} is simulated by Room A`);
    assert.equal(res.body.field, field);
  }
  assert.equal(device.sensors.get(1).t, 20);
  // Answering, faults and the relay's stuck/dead stay editable.
  assert.equal((await call('PUT', '/api/sensors/1', { answering: false })).status, 200);
  assert.equal((await call('PUT', '/api/sensors/4', { error: 3, refuse: true })).status, 200);
  assert.equal((await call('PUT', '/api/sensors/3', { stuck: [true, false, false, false, false, false] })).status, 200);
  // Disabling or removing the room lifts the lock.
  await call('PUT', `/api/sims/${id}`, { enabled: false });
  assert.equal((await call('PUT', '/api/sensors/1', { t: 22 })).status, 200);
});

test('state round trip: rooms, links, speed and the air survive a restart', () => {
  const dir = tempDir();
  const statePath = join(dir, 'state.json');
  const sensors = createSensors({ statePath });
  sensors.add({ address: 1, kind: 'trh' });
  const a = createSims({ sensors, statePath: `${statePath}.sim`, model });
  const room = a.add({ name: 'Kept' });
  a.update(room.id, { enabled: true, trh: 1, volume: 90 });
  a.setSpeed(10);
  a.setState(room.id, { T: 18.5, W: 7, CO2: 1234, Tm: 19.25, Hs: 104 }, null);
  a.persist();

  const b = createSims({ sensors: createSensors({ statePath }), statePath: `${statePath}.sim`, model });
  assert.equal(b.getSpeed(), 10);
  const [again] = b.list();
  assert.deepEqual([again.id, again.name, again.enabled, again.trh, again.volume], [room.id, 'Kept', true, 1, 90]);
  assert.deepEqual(again.state, { T: 18.5, W: 7, CO2: 1234, Tm: 19.25, Hs: 104 });
  assert.equal(again.sunW, 300);
  assert.equal(b.add({}).id, room.id + 1);
});

test('an old state file with acKW and humidifierGH is converted to BTU/h and L/h', () => {
  const dir = tempDir();
  const sensors = createSensors({});
  const file = join(dir, 'state.json.sim');
  writeFileSync(file, JSON.stringify({ speed: 1, rooms: [
    { id: 1, name: 'Old', acKW: 3.5, humidifierGH: 2000, fanFlow: 700 },
    { id: 2, name: 'Odd', acKW: 0.26, humidifierGH: 1234 },
    { id: 3, name: 'Both', acKW: 3.5, acBTU: 20000, humidifierGH: 2000, humidifierLH: 0.5 },
    { id: 4, name: 'Bad', acKW: 5000, humidifierGH: -1 },
  ] }));
  const sims = createSims({ sensors, statePath: file, model });
  assert.deepEqual(sims.list().map((r) => r.id), [1, 2, 3]); // room 4 holds impossible values: skipped, as for any bad value
  const [a, b, c] = sims.list();
  assert.deepEqual([a.acBTU, a.humidifierLH, a.fanFlow], [11942, 2, 700]);
  assert.deepEqual([b.acBTU, b.humidifierLH], [887, 1.2]);
  assert.deepEqual([c.acBTU, c.humidifierLH], [20000, 0.5]);
  assert.equal('acKW' in a || 'humidifierGH' in a, false);
});

test('the old parameter names are ignored by the API', async () => {
  reset();
  const { id } = (await call('POST', '/api/sims', {})).body;
  assert.equal((await call('PUT', `/api/sims/${id}`, { acKW: 5, humidifierGH: 10 })).status, 400);
  const res = await call('PUT', `/api/sims/${id}`, { acKW: 5, volume: 70 });
  assert.equal(res.status, 200);
  assert.equal('acKW' in res.body, false);
});

test('a broken or odd state file starts empty; bad rooms are skipped', () => {
  const dir = tempDir();
  const sensors = createSensors({});
  const file = join(dir, 'state.json.sim');
  writeFileSync(file, '{not json');
  assert.deepEqual(createSims({ sensors, statePath: file, model }).list(), []);
  writeFileSync(file, '[1]');
  assert.deepEqual(createSims({ sensors, statePath: file, model }).list(), []);
  writeFileSync(file, JSON.stringify({ speed: 7, rooms: [{ id: 0, name: 'x' }, { id: 2, name: '', volume: 5 }, { id: 3, name: 'ok', blocks: -4 }, { id: 4, name: 'fine', speed: 1 }] }));
  const sims = createSims({ sensors, statePath: file, model });
  assert.equal(sims.getSpeed(), 1);
  assert.deepEqual(sims.list().map((r) => r.id), [4]);
});

test('a failed save rolls the change back', () => {
  const dir = tempDir();
  const sensors = createSensors({});
  const statePath = join(dir, 'sub', 'state.json.sim');
  mkdirSync(join(dir, 'sub'));
  const sims = createSims({ sensors, statePath, model });
  const room = sims.add({ name: 'Solid' });
  rmSync(join(dir, 'sub'), { recursive: true });
  assert.throws(() => sims.update(room.id, { name: 'Broken', volume: 99 }));
  assert.throws(() => sims.add({}));
  assert.throws(() => sims.setSpeed(60));
  assert.throws(() => sims.remove(room.id));
  assert.deepEqual([sims.get(room.id).name, sims.get(room.id).volume, sims.getSpeed(), sims.list().length], ['Solid', 60, 1, 1]);
  mkdirSync(join(dir, 'sub'));
  assert.equal(sims.add({}).id, room.id + 1);
  assert.equal(existsSync(statePath), true);
  assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).rooms.length, 2);
});

test('the sensors list says which room simulates each device, with the same kind check as the lock', async () => {
  reset();
  device.sensors.add({ address: 1, kind: 'trh' });
  device.sensors.add({ address: 3, kind: 'relay' });
  device.sensors.add({ address: 4, kind: 'ac' });
  const { id } = (await call('POST', '/api/sims', { name: 'Room A' })).body;
  await call('PUT', `/api/sims/${id}`, { trh: 1, relay: 3, ac: 4, enabled: true });
  const by = async () => Object.fromEntries((await call('GET', '/api/sensors')).body.map((s) => [s.address, s.simulatedBy]));
  assert.deepEqual(await by(), { 1: 'Room A', 3: null, 4: 'Room A' });
  await call('PUT', `/api/sims/${id}`, { enabled: false });
  assert.deepEqual(await by(), { 1: null, 3: null, 4: null });
});

test('removing a simulated room lifts the lock', async () => {
  reset();
  device.sensors.add({ address: 1, kind: 'trh' });
  const { id } = (await call('POST', '/api/sims', { name: 'Gone' })).body;
  await call('PUT', `/api/sims/${id}`, { trh: 1, enabled: true });
  assert.equal((await call('PUT', '/api/sensors/1', { t: 20 })).status, 409);
  assert.equal((await call('DELETE', `/api/sims/${id}`)).status, 204);
  assert.equal((await call('PUT', '/api/sensors/1', { t: 20 })).status, 200);
});

test('removing a linked device clears the link; a new device at that address is not locked', async () => {
  reset();
  device.sensors.add({ address: 1, kind: 'trh' });
  device.sensors.add({ address: 3, kind: 'relay' });
  const { id } = (await call('POST', '/api/sims', {})).body;
  await call('PUT', `/api/sims/${id}`, { trh: 1, relay: 3, enabled: true });
  assert.equal((await call('DELETE', '/api/sensors/1')).status, 204);
  const room = (await call('GET', '/api/sims')).body[0];
  assert.deepEqual([room.trh, room.relay, room.enabled], [null, 3, true]);
  assert.equal((await call('POST', '/api/sensors', { address: 1, kind: 'trh' })).status, 201);
  assert.equal((await call('PUT', '/api/sensors/1', { t: 20 })).status, 200);
});

test('a state file with a device linked twice keeps the first link only', () => {
  const dir = tempDir();
  const sensors = createSensors({});
  sensors.add({ address: 1, kind: 'trh' });
  sensors.add({ address: 2, kind: 'co2' });
  const file = join(dir, 'state.json.sim');
  writeFileSync(file, JSON.stringify({ speed: 1, rooms: [{ id: 1, name: 'A', trh: 1 }, { id: 2, name: 'B', trh: 1, co2: 2 }, { id: 3, name: 'C', co2: 2 }] }));
  const sims = createSims({ sensors, statePath: file, model });
  assert.deepEqual(sims.list().map((r) => [r.trh, r.co2]), [[1, null], [null, 2], [null, null]]);
});

test('the time of day survives a restart; an old file with a fixed outdoor gets the day cycle defaults', () => {
  const dir = tempDir();
  const file = join(dir, 'state.json.sim');
  writeFileSync(file, JSON.stringify({ speed: 1, rooms: [
    { id: 1, name: 'Old', outdoorT: 32, outdoorRH: 80, clock: 50000 },
    { id: 2, name: 'Odd', outdoorHigh: 30, outdoorLow: 31, outdoorDew: 20, clock: 90000 },
    { id: 3, name: 'Own', outdoorHigh: 35, outdoorLow: 26, outdoorDew: 25 },
  ] }));
  const noon = new Date(2026, 9, 20, 12, 0, 0).getTime();
  const sims = createSims({ sensors: createSensors({}), statePath: file, model, now: () => noon });
  const [old, odd, own] = sims.list();
  const outdoor = (r) => [r.outdoorHigh, r.outdoorLow, r.outdoorDew];
  assert.deepEqual(outdoor(old), [33, 25, 24]);
  assert.equal('outdoorT' in old || 'outdoorRH' in old, false);
  assert.equal(old.clock, 50000);
  assert.deepEqual(outdoor(odd), [33, 25, 24]); // the night low was above the day high
  assert.equal(odd.clock, 12 * 3600); // 90000 s is not a time of day: the local time
  assert.deepEqual(outdoor(own), [35, 26, 25]);
  sims.setState(own.id, own.state, null, 1234);
  sims.persist();
  const again = createSims({ sensors: createSensors({}), statePath: file, model });
  assert.equal(again.get(own.id).clock, 1234);
  sims.reset(own.id);
  assert.equal(sims.get(own.id).clock, 12 * 3600);
});

test('dehumidifier parameters: defaults, limits, and an older state file without them', async () => {
  reset();
  const room = (await call('POST', '/api/sims', {})).body;
  assert.deepEqual([room.dehumidifierLday, room.dehumidifierW], [0, 380]);
  const ok = await call('PUT', `/api/sims/${room.id}`, { dehumidifierLday: 20.5, dehumidifierW: 5000 });
  assert.deepEqual([ok.status, ok.body.dehumidifierLday, ok.body.dehumidifierW], [200, 20.5, 5000]);
  for (const [patch, field] of [[{ dehumidifierLday: -1 }, 'dehumidifierLday'], [{ dehumidifierLday: 200.5 }, 'dehumidifierLday'], [{ dehumidifierW: 5001 }, 'dehumidifierW'], [{ dehumidifierW: '380' }, 'dehumidifierW']]) {
    const res = await call('PUT', `/api/sims/${room.id}`, patch);
    assert.deepEqual([res.status, res.body.field], [400, field], JSON.stringify(patch));
  }
  const dir = tempDir();
  const file = join(dir, 'state.json.sim');
  writeFileSync(file, JSON.stringify({ speed: 1, rooms: [{ id: 1, name: 'Old', fanFlow: 700 }, { id: 2, name: 'New', dehumidifierLday: 30, dehumidifierW: 400 }] }));
  const sims = createSims({ sensors: createSensors({}), statePath: file, model });
  const [a, b] = sims.list();
  assert.deepEqual([a.dehumidifierLday, a.dehumidifierW, a.fanFlow], [0, 380, 700]);
  assert.deepEqual([b.dehumidifierLday, b.dehumidifierW], [30, 400]);
});

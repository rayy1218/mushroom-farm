import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createModbusServer } from '../device/modbus-server.js';
import { createSims, PARAMS } from '../device/sim-store.js';
import { createSimulation } from '../device/simulation.js';
import { startDevice } from '../device/server.js';
import { FILTER_DEFAULTS } from '../device/sim-model.js';

function thrown(fn) {
  try { fn(); } catch (err) { return err; }
  assert.fail('expected a throw');
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);

// ---- The filter pressure sensor ----

test('a filter pressure sensor starts at 40 Pa and is edited like other devices', () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  assert.deepEqual(s.get(9), { address: 9, kind: 'dp', pa: 40, answering: true });
  s.update(9, { pa: 123.45 });
  assert.equal(s.get(9).pa, 123.5);
  s.update(9, { pa: -12.3 });
  assert.equal(s.get(9).pa, -12.3);
});

test('its pressure has limits and it has no other values; other kinds are named', () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  s.add({ address: 8, kind: 'trh' });
  let err = thrown(() => s.update(9, { pa: 2000.1 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'pa', 'Pressure must be a number from -50 to 2000 Pa']);
  err = thrown(() => s.update(9, { pa: -50.1 }));
  assert.equal(err.status, 400);
  err = thrown(() => s.update(9, { t: 20 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 't', 'A filter pressure sensor has no t value']);
  err = thrown(() => s.update(8, { pa: 5 }));
  assert.deepEqual([err.status, err.field], [400, 'pa']);
  err = thrown(() => s.add({ address: 10, kind: 'flow' }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'kind', 'Kind must be trh, co2, relay, ac, meter or dp']);
});

test('a filter pressure sensor is saved in the state file and comes back', () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'mf-dp-')), 'state.json');
  const a = createSensors({ statePath });
  a.add({ address: 9, kind: 'dp' });
  a.update(9, { pa: 88 });
  assert.deepEqual(JSON.parse(readFileSync(statePath, 'utf8')), [{ address: 9, kind: 'dp', pa: 88, answering: true }]);
  assert.deepEqual(createSensors({ statePath }).get(9), { address: 9, kind: 'dp', pa: 88, answering: true });
  writeFileSync(statePath, JSON.stringify([{ address: 9, kind: 'dp', pa: 99999, answering: true }, { address: 10, kind: 'dp', pa: 12 }]));
  const c = createSensors({ statePath });
  assert.equal(c.get(9), undefined, 'a bad value skips the entry');
  assert.equal(c.get(10).pa, 12);
});

test('the simulation writes the pressure, clamped to the limits', () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  s.simWrite(9, { pa: 96.789 });
  assert.equal(s.get(9).pa, 96.8);
  s.simWrite(9, { pa: 5000 });
  assert.equal(s.get(9).pa, 2000);
  s.simWrite(9, { pa: 'x' });
  assert.equal(s.get(9).pa, 2000);
});

// ---- Modbus ----

async function ask(server, frames) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socket = net.connect(server.address().port, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    const replies = [];
    for (const f of frames) {
      const got = new Promise((resolve) => socket.once('data', resolve));
      socket.write(f);
      replies.push(await Promise.race([got, new Promise((r) => setTimeout(() => r(null), 300))]));
    }
    return replies;
  } finally {
    socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

function frame(unit, fn, start, qty) {
  const b = Buffer.alloc(12);
  b.writeUInt16BE(1, 0);
  b.writeUInt16BE(6, 4);
  b.writeUInt8(unit, 6);
  b.writeUInt8(fn, 7);
  b.writeUInt16BE(start, 8);
  b.writeUInt16BE(qty, 10);
  return b;
}

test('a filter pressure sensor answers function 04 register 0 with Pa x 10, signed', async () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  s.update(9, { pa: 123.4 });
  s.add({ address: 10, kind: 'dp' });
  s.update(10, { pa: -12.3 });
  const [up, down] = await ask(createModbusServer(s), [frame(9, 4, 0, 1), frame(10, 4, 0, 1)]);
  assert.deepEqual([...up.subarray(7, 9)], [4, 2]);
  assert.equal(up.readInt16BE(9), 1234);
  assert.equal(down.readInt16BE(9), -123);
  assert.equal(down.readUInt16BE(9), 0xff85);
});

test('any other range is an illegal address, any other function an illegal function; a silent one does not answer', async () => {
  const s = createSensors({});
  s.add({ address: 9, kind: 'dp' });
  const replies = await ask(createModbusServer(s), [frame(9, 4, 1, 1), frame(9, 4, 0, 2), frame(9, 3, 0, 1)]);
  assert.deepEqual(replies.map((r) => [r[7], r[8]]), [[0x84, 2], [0x84, 2], [0x83, 1]]);
  s.update(9, { answering: false });
  const [silent] = await ask(createModbusServer(s), [frame(9, 4, 0, 1)]);
  assert.equal(silent, null);
});

// ---- Simulated rooms ----

// A model with fixed numbers: the store and runner tests do not depend on the physics.
const fake = (filterPa = 87.65) => ({
  rhOf: (T, W) => W * 5, wOf: (T, RH) => RH / 5,
  initialState: (p) => ({ T: p.outdoorT, W: 10, CO2: 420 }),
  step: (state) => ({ state: { ...state, Lf: (state.Lf ?? 0) + 0.25 }, acting: { exchangeM3h: 0, acCoolKW: 0, acLatentKW: 0, acHeatKW: 0, humidifierGH: 0, blocksKW: 0, filterPa } }),
});

function rig(model = fake()) {
  const sensors = createSensors({ spinUpMs: 0 });
  sensors.add({ address: 1, kind: 'trh' });
  sensors.add({ address: 9, kind: 'dp' });
  const sims = createSims({ sensors, model });
  return { sensors, sims, id: sims.add({ name: 'Room' }).id, model };
}

test('a simulated room has the filter settings of the spec and an empty filter probe link', () => {
  const { sims, id } = rig();
  const room = sims.get(id);
  assert.deepEqual([room.fanMaxPa, room.filterCleanPa, room.filterFinalPa, room.filterLifeDays], [200, 40, 150, 30]);
  assert.deepEqual(Object.fromEntries(Object.keys(FILTER_DEFAULTS).map((k) => [k, PARAMS[k].value])), FILTER_DEFAULTS);
  assert.equal(room.filterProbe, null);
});

test('filter settings: limits, whole numbers, and they must fit together', () => {
  const { sims, id } = rig();
  sims.update(id, { fanMaxPa: 300, filterCleanPa: 60, filterFinalPa: 250, filterLifeDays: 90 });
  assert.deepEqual([sims.get(id).fanMaxPa, sims.get(id).filterCleanPa, sims.get(id).filterFinalPa, sims.get(id).filterLifeDays], [300, 60, 250, 90]);
  let err = thrown(() => sims.update(id, { fanMaxPa: 19 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'fanMaxPa', 'Fan maximum pressure must be a whole number from 20 to 2000 Pa']);
  err = thrown(() => sims.update(id, { filterLifeDays: 0 }));
  assert.deepEqual([err.status, err.field], [400, 'filterLifeDays']);
  err = thrown(() => sims.update(id, { filterCleanPa: 40.5 }));
  assert.deepEqual([err.status, err.field], [400, 'filterCleanPa']);
  err = thrown(() => sims.update(id, { fanMaxPa: 60 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'fanMaxPa', "Fan maximum pressure must be above the clean filter's pressure drop"]);
  err = thrown(() => sims.update(id, { filterFinalPa: 60 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'filterFinalPa', "Filter change pressure must be above the clean filter's pressure drop"]);
  err = thrown(() => sims.update(id, { filterCleanPa: 260 }));
  assert.deepEqual([err.status, err.field], [400, 'filterFinalPa']);
  assert.equal(sims.get(id).filterCleanPa, 60, 'nothing changed');
});

test('the filter probe link takes a filter pressure sensor only', () => {
  const { sims, id } = rig();
  sims.update(id, { filterProbe: 9 });
  assert.equal(sims.get(id).filterProbe, 9);
  const err = thrown(() => sims.update(id, { filterProbe: 1 }));
  assert.deepEqual([err.status, err.field, err.message], [409, 'filterProbe', 'Device 1 is a T/RH sensor, not a filter pressure sensor']);
  const other = thrown(() => sims.update(id, { trh: 9 }));
  assert.equal(other.status, 409);
});

test('Change filter: the loading goes to 0 and the rest of the air stays; a reset keeps the loading', () => {
  const { sims, id } = rig();
  sims.setState(id, { T: 24, W: 9, CO2: 900, Lf: 0.6 }, null);
  assert.equal(sims.reset(id).state.Lf, 0.6, 'a reset puts back the air, not the filter');
  const changed = sims.changeFilter(id);
  assert.equal(changed.state.Lf, 0);
  assert.equal(changed.state.CO2, 420);
  assert.equal(thrown(() => sims.changeFilter(99)).status, 404);
});

test('the runner writes the filter pressure into the filter probe; the probe is locked while simulated', () => {
  const { sensors, sims, id, model } = rig();
  sims.update(id, { enabled: true, filterProbe: 9 });
  createSimulation({ sensors, sims, model, tickMs: 0 }).tick();
  assert.equal(sensors.get(9).pa, 87.7);
  assert.equal(sims.get(id).state.Lf, 0.25);
  assert.equal(sims.get(id).acting.filterPa, 87.65);
  assert.equal(thrown(() => sensors.update(9, { pa: 10 })).status, 409);
});

test('the runner with the real model: a running intake shows the filter pressure', () => {
  const sensors = createSensors({ spinUpMs: 0 });
  sensors.add({ address: 4, kind: 'relay' });
  sensors.add({ address: 9, kind: 'dp' });
  const sims = createSims({ sensors });
  const { id } = sims.add({ name: 'Real' });
  sims.update(id, { enabled: true, relay: 4, filterProbe: 9 });
  sensors.writeCoil(4, 0, true); // intake
  sensors.writeCoil(4, 1, true); // exhaust
  createSimulation({ sensors, sims, tickMs: 0 }).tick();
  near(sensors.get(9).pa, 40, 0.1, 'a clean filter at fanFlow');
  sims.setState(id, { ...sims.get(id).state, Lf: 1 }, null);
  createSimulation({ sensors, sims, tickMs: 0 }).tick();
  near(sensors.get(9).pa, 150 * (200 / 310), 0.1);
  sensors.writeCoil(4, 0, false);
  createSimulation({ sensors, sims, tickMs: 0 }).tick();
  assert.equal(sensors.get(9).pa, 0, 'no pressure with the intake off');
});

test('the loading and the filter settings survive a restart; old rooms get the defaults, settings that do not fit too', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-dp-sim-'));
  const statePath = join(dir, 'state.json');
  const sensors = createSensors({ statePath });
  sensors.add({ address: 9, kind: 'dp' });
  const a = createSims({ sensors, statePath: `${statePath}.sim`, model: fake() });
  const { id } = a.add({ name: 'Kept' });
  a.update(id, { filterProbe: 9, filterLifeDays: 45 });
  a.setState(id, { T: 20, W: 8, CO2: 700, Lf: 0.4 }, null);
  a.persist();
  const b = createSims({ sensors: createSensors({ statePath }), statePath: `${statePath}.sim`, model: fake() });
  const again = b.get(id);
  assert.deepEqual([again.filterProbe, again.filterLifeDays, again.state.Lf], [9, 45, 0.4]);
  writeFileSync(`${statePath}.sim`, JSON.stringify({ speed: 1, rooms: [{ id: 1, name: 'Old', fanFlow: 700 }, { id: 2, name: 'Odd', fanMaxPa: 100, filterCleanPa: 120, filterFinalPa: 300 }] }));
  const [old, odd] = createSims({ sensors: createSensors({}), statePath: `${statePath}.sim`, model: fake() }).list();
  assert.deepEqual([old.fanMaxPa, old.filterCleanPa, old.filterFinalPa, old.filterLifeDays, old.filterProbe], [200, 40, 150, 30, null]);
  assert.deepEqual([odd.fanMaxPa, odd.filterCleanPa, odd.filterFinalPa], [200, 40, 150]);
});

test('POST /api/sims/:id/change-filter changes the filter; other methods and unknown rooms are 404', async () => {
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 0, model: fake() });
  try {
    const base = `http://127.0.0.1:${device.httpPort}`;
    const { id } = device.sims.add({ name: 'Http' });
    device.sims.setState(id, { T: 24, W: 9, CO2: 900, Lf: 0.9 }, null);
    const res = await fetch(`${base}/api/sims/${id}/change-filter`, { method: 'POST' });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).state.Lf, 0);
    assert.equal((await fetch(`${base}/api/sims/${id}/change-filter`, { method: 'GET' })).status, 404);
    assert.equal((await fetch(`${base}/api/sims/99/change-filter`, { method: 'POST' })).status, 404);
  } finally {
    await device.close();
  }
});

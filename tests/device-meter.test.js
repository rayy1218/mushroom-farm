import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createSims } from '../device/sim-store.js';
import { createSimulation } from '../device/simulation.js';
import { createModbusServer } from '../device/modbus-server.js';
import { startDevice } from '../device/server.js';
import { electricW, copAt } from '../device/sim-power.js';
import { outdoorAt } from '../device/sim-model.js';

function thrown(fn) {
  try { fn(); } catch (err) { return err; }
  assert.fail('expected a throw');
}

// ---- The meter device ----

test('a meter starts at zero and is edited like other devices', () => {
  const s = createSensors({});
  s.add({ address: 7, kind: 'meter' });
  assert.deepEqual(s.get(7), { address: 7, kind: 'meter', power: 0, energy: 0, answering: true });
  s.update(7, { power: 1234.56, energy: 98.7654 });
  assert.deepEqual([s.get(7).power, s.get(7).energy], [1234.6, 98.765]);
  s.update(7, { answering: false });
  assert.equal(s.get(7).answering, false);
});

test('meter values have limits and a meter has no other values', () => {
  const s = createSensors({});
  s.add({ address: 7, kind: 'meter' });
  s.add({ address: 8, kind: 'trh' });
  let err = thrown(() => s.update(7, { power: 100001 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 'power', 'Power must be a number from 0 to 100000 W']);
  err = thrown(() => s.update(7, { power: -1 }));
  assert.equal(err.status, 400);
  err = thrown(() => s.update(7, { power: true }));
  assert.equal(err.status, 400);
  err = thrown(() => s.update(7, { energy: 1e9 + 1 }));
  assert.deepEqual([err.status, err.field], [400, 'energy']);
  s.update(7, { energy: 1e9 });
  err = thrown(() => s.update(7, { t: 20 }));
  assert.deepEqual([err.status, err.field, err.message], [400, 't', 'A energy meter has no t value']);
  err = thrown(() => s.update(8, { energy: 5 }));
  assert.equal(err.status, 400);
});

test('a meter is saved in the state file and comes back', () => {
  const statePath = join(mkdtempSync(join(tmpdir(), 'mf-meter-')), 'state.json');
  const a = createSensors({ statePath });
  a.add({ address: 7, kind: 'meter' });
  a.update(7, { power: 500, energy: 12.5 });
  const saved = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.deepEqual(saved, [{ address: 7, kind: 'meter', power: 500, energy: 12.5, answering: true }]);
  const b = createSensors({ statePath });
  assert.deepEqual(b.get(7), { address: 7, kind: 'meter', power: 500, energy: 12.5, answering: true });
});

// ---- Modbus ----

async function ask(server, frame) {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const socket = net.connect(server.address().port, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    const replies = [];
    for (const f of frame) {
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

test('a meter answers function 04 at 0x000C and 0x0156 as float32, high word first', async () => {
  const s = createSensors({});
  s.add({ address: 7, kind: 'meter' });
  s.update(7, { power: 1234.5, energy: 42.125 });
  const log = [];
  const [power, energy] = await ask(createModbusServer(s, { onRequest: (e) => log.push(e) }), [frame(7, 4, 0x000c, 2), frame(7, 4, 0x0156, 2)]);
  assert.equal(power.length, 13);
  assert.deepEqual([...power.subarray(7, 9)], [4, 4]);
  assert.equal(power.readFloatBE(9), 1234.5);
  assert.equal(energy.readFloatBE(9), 42.125);
  assert.equal(power.readUInt16BE(9), 0x449a); // 1234.5 = 0x449A5000: the high word first
  assert.equal(power.readUInt16BE(11), 0x5000);
  assert.deepEqual(log.map((e) => e.result), ['answered', 'answered']);
});

test('a meter answers illegal address for any other range and illegal function for other functions', async () => {
  const s = createSensors({});
  s.add({ address: 7, kind: 'meter' });
  const frames = [frame(7, 4, 0x000d, 2), frame(7, 4, 0x000c, 1), frame(7, 4, 0x000c, 4), frame(7, 4, 0x0000, 2), frame(7, 4, 0x0157, 2), frame(7, 3, 0x000c, 2), frame(7, 4, 1, 2)];
  const replies = await ask(createModbusServer(s), frames);
  assert.deepEqual(replies.map((r) => [r[7], r[8]]), [[0x84, 2], [0x84, 2], [0x84, 2], [0x84, 2], [0x84, 2], [0x83, 1], [0x84, 2]]);
});

test('a silent meter does not answer', async () => {
  const s = createSensors({});
  s.add({ address: 7, kind: 'meter' });
  s.update(7, { answering: false });
  const [reply] = await ask(createModbusServer(s), [frame(7, 4, 0x000c, 2)]);
  assert.equal(reply, null);
});

// ---- The power function ----

const run = { acting: { acCoolKW: 0, acLatentKW: 0, acHeatKW: 0 }, inputs: { ac: null }, params: { outdoorT: 27, humidifierGH: 2000 } };

test('COP is 3.6 at 27 C, 3.1 at 35 C, and stays between 2 and 5', () => {
  assert.equal(copAt(27), 3.6);
  assert.ok(Math.abs(copAt(35) - 3.12) < 1e-9);
  assert.equal(copAt(80), 2);
  assert.equal(copAt(-40), 5);
});

test('nothing running draws nothing', () => {
  assert.equal(electricW(run), 0);
});

test('fans draw 60 W each and the humidifier 40 W per L/h of its setting', () => {
  const only = (inputs) => electricW({ ...run, inputs: { ac: null, ...inputs } });
  assert.equal(only({ intake: true }), 60);
  assert.equal(only({ exhaust: true }), 60);
  assert.equal(only({ circulation: true }), 60);
  assert.equal(only({ humidifier: true }), 80);
  assert.equal(only({ intake: true, exhaust: true, circulation: true, humidifier: true }), 260);
  assert.equal(electricW({ ...run, inputs: { ac: null, humidifier: true }, params: { outdoorT: 27, humidifierGH: 0 } }), 0);
});

test('the aircon draws the heat it moves over the COP, plus a 40 W fan while working', () => {
  const ac = { mode: 'cool', setpoint: 22, fan: 'auto' };
  const w = electricW({ acting: { acCoolKW: 2.4, acLatentKW: 1.2, acHeatKW: 0 }, inputs: { ac }, params: { outdoorT: 27 } });
  assert.ok(Math.abs(w - (3600 / 3.6 + 40)) < 1e-9);
  const hot = electricW({ acting: { acCoolKW: 2.4, acLatentKW: 1.2, acHeatKW: 0 }, inputs: { ac }, params: { outdoorT: 35 } });
  assert.ok(hot > w);
  const heat = electricW({ acting: { acCoolKW: 0, acLatentKW: 0, acHeatKW: 1.8 }, inputs: { ac: { ...ac, mode: 'heat' } }, params: { outdoorT: 27 } });
  assert.ok(Math.abs(heat - (1800 / 3.6 + 40)) < 1e-9);
  assert.equal(electricW({ acting: { acCoolKW: 0, acLatentKW: 0, acHeatKW: 0 }, inputs: { ac }, params: { outdoorT: 27 } }), 40); // on, at the setpoint
});

test('a powered-off or faulty aircon (no ac input) draws nothing', () => {
  assert.equal(electricW({ acting: { acCoolKW: 0, acLatentKW: 0, acHeatKW: 0 }, inputs: { ac: null }, params: { outdoorT: 27 } }), 0);
});

// ---- Links ----

function rig(now) {
  const sensors = createSensors({ spinUpMs: 0 });
  sensors.add({ address: 1, kind: 'trh' });
  sensors.add({ address: 2, kind: 'trh' });
  sensors.add({ address: 3, kind: 'meter' });
  sensors.add({ address: 4, kind: 'relay' });
  sensors.add({ address: 5, kind: 'ac' });
  const model = {
    rhOf: (T, W) => W * 5, wOf: (T, RH) => RH / 5,
    initialState: (p) => ({ T: p.outdoorT, W: 10, CO2: 420 }),
    step: (state) => ({ state: { ...state }, acting: { exchangeM3h: 0, acCoolKW: 0, acLatentKW: 0, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }),
  };
  const sims = createSims({ sensors, model, now });
  const room = sims.add({ name: 'Room' });
  return { sensors, sims, id: room.id, model };
}

test('a room has an outdoor link and a meter link, empty at first', () => {
  const { sims, id } = rig();
  const room = sims.get(id);
  assert.deepEqual([room.outdoorProbe, room.meter, room.meterKWh], [null, null, 0]);
});

test('the outdoor link takes a T/RH device, the meter link a meter', () => {
  const { sims, id } = rig();
  sims.update(id, { outdoorProbe: 2, meter: 3 });
  assert.deepEqual([sims.get(id).outdoorProbe, sims.get(id).meter], [2, 3]);
  sims.update(id, { outdoorProbe: null, meter: null });
  assert.deepEqual([sims.get(id).outdoorProbe, sims.get(id).meter], [null, null]);
});

test('wrong kinds are 409, a missing device 400, a non-number 400', () => {
  const { sims, id } = rig();
  let err = thrown(() => sims.update(id, { outdoorProbe: 3 }));
  assert.deepEqual([err.status, err.field, err.message], [409, 'outdoorProbe', 'Device 3 is an energy meter, not an outdoor T/RH sensor']);
  err = thrown(() => sims.update(id, { meter: 1 }));
  assert.deepEqual([err.status, err.field, err.message], [409, 'meter', 'Device 1 is a T/RH sensor, not an energy meter']);
  err = thrown(() => sims.update(id, { trh: 3 }));
  assert.equal(err.status, 409);
  err = thrown(() => sims.update(id, { meter: 99 }));
  assert.deepEqual([err.status, err.message], [400, 'No device with address 99']);
  err = thrown(() => sims.update(id, { outdoorProbe: 'x' }));
  assert.equal(err.status, 400);
});

test('one device on one link, in one room only', () => {
  const { sims, id } = rig();
  sims.update(id, { trh: 1 });
  let err = thrown(() => sims.update(id, { outdoorProbe: 1 }));
  assert.equal(err.status, 409);
  assert.equal(err.field, 'outdoorProbe');
  const other = sims.add({ name: 'Other' });
  sims.update(id, { outdoorProbe: 2, meter: 3 });
  err = thrown(() => sims.update(other.id, { outdoorProbe: 2 }));
  assert.deepEqual([err.status, err.message], [409, 'Device 2 is already linked to Room']);
  err = thrown(() => sims.update(other.id, { meter: 3 }));
  assert.equal(err.status, 409);
  err = thrown(() => sims.update(other.id, { trh: 2 }));
  assert.equal(err.status, 409);
});

test('removing a linked device unlinks it', () => {
  const { sensors, sims, id } = rig();
  sims.update(id, { outdoorProbe: 2, meter: 3 });
  sensors.remove(3);
  sensors.remove(2);
  assert.deepEqual([sims.get(id).outdoorProbe, sims.get(id).meter], [null, null]);
});

test('devices linked to an enabled room are locked to manual edits', () => {
  const { sensors, sims, id } = rig();
  sims.update(id, { outdoorProbe: 2, meter: 3 });
  sensors.update(2, { t: 20 }); // not enabled yet
  assert.equal(sensors.simulatedByDevice(3), null);
  sims.update(id, { enabled: true });
  assert.equal(sensors.simulatedByDevice(2), 'Room');
  assert.equal(sensors.simulatedByDevice(3), 'Room');
  let err = thrown(() => sensors.update(2, { rh: 50 }));
  assert.deepEqual([err.status, err.message, err.field], [409, 'Sensor 2 is simulated by Room', 'rh']);
  err = thrown(() => sensors.update(3, { power: 5 }));
  assert.deepEqual([err.status, err.message, err.field], [409, 'Sensor 3 is simulated by Room', 'power']);
  err = thrown(() => sensors.update(3, { energy: 5 }));
  assert.equal(err.status, 409);
  sensors.update(3, { answering: false }); // answering stays editable
  assert.equal(sensors.get(3).answering, false);
});

// ---- The runner ----

test('each tick writes the room outdoor T and RH into the outdoor probe', () => {
  const { sensors, sims, id, model } = rig();
  sims.update(id, { outdoorProbe: 2, enabled: true });
  const sim = createSimulation({ sensors, sims, model });
  sims.setSpeed(60);
  sim.tick();
  const room = sims.get(id);
  const out = outdoorAt(room, room.clock);
  assert.equal(sensors.get(2).t, Math.round(out.outdoorT * 10) / 10);
  assert.equal(sensors.get(2).rh, Math.round(out.outdoorRH * 10) / 10);
  assert.equal(sensors.get(1).t, 25); // the room probe was not linked: untouched
});

test('the meter gets the room power and adds power x simulated time', () => {
  const { sensors, sims, id, model } = rig();
  sims.update(id, { relay: 4, meter: 3, enabled: true });
  sensors.writeCoil(4, 0, true); // intake
  sensors.writeCoil(4, 2, true); // circulation
  sensors.writeCoil(4, 3, true); // humidifier, 2 L/h
  const sim = createSimulation({ sensors, sims, model });
  sims.setSpeed(60);
  sim.tick();
  sim.tick();
  const room = sims.get(id);
  assert.equal(room.acting.electricW, 60 + 60 + 80);
  assert.equal(sensors.get(3).power, 200);
  assert.ok(Math.abs(room.meterKWh - (200 * 120) / 3.6e6) < 1e-12);
  assert.equal(sensors.get(3).energy, Math.round(room.meterKWh * 1000) / 1000);
});

test('the aircon power counts only while it works', () => {
  const { sensors, sims, id } = rig();
  const model = {
    rhOf: (T, W) => W * 5, wOf: (T, RH) => RH / 5,
    initialState: (p) => ({ T: p.outdoorT, W: 10, CO2: 420 }),
    step: (state) => ({ state: { ...state }, acting: { exchangeM3h: 0, acCoolKW: 1.8, acLatentKW: 0.6, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }),
  };
  sims.update(id, { ac: 5, meter: 3, enabled: true });
  const sim = createSimulation({ sensors, sims, model });
  sensors.writeAc(5, { power: true, mode: 0, setpoint: 22, fan: 0 });
  sim.tick();
  const working = sims.get(id).acting.electricW;
  assert.ok(working > 2400 / 5 + 40 && working < 2400 / 2 + 40); // the COP is between 2 and 5
  // The fake model keeps reporting cooling, so only the 40 W indoor fan tells the states apart.
  sensors.update(5, { error: 3 });
  sim.tick();
  assert.ok(Math.abs(working - sims.get(id).acting.electricW - 40) < 1);
  sensors.update(5, { error: 0 });
  sensors.writeAc(5, { power: false, mode: 0, setpoint: 22, fan: 0 });
  sim.tick();
  assert.ok(Math.abs(working - sims.get(id).acting.electricW - 40) < 1);
});

test('an unlinked meter still lets the room keep its total; a disabled room does not count', () => {
  const { sensors, sims, id, model } = rig();
  sims.update(id, { enabled: true });
  const sim = createSimulation({ sensors, sims, model });
  sims.setState(id, sims.get(id).state, null, undefined, 5);
  sim.tick();
  assert.equal(sims.get(id).meterKWh, 5);
  sims.update(id, { enabled: false });
  sim.tick();
  assert.equal(sims.get(id).meterKWh, 5);
});

test('the meter total survives a restart and a reset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-meter-'));
  const statePath = join(dir, 'sims.json');
  const sensors = createSensors({ spinUpMs: 0 });
  sensors.add({ address: 3, kind: 'meter' });
  const a = createSims({ sensors, statePath });
  const room = a.add({ name: 'Room' });
  a.update(room.id, { meter: 3 });
  a.setState(room.id, a.get(room.id).state, null, undefined, 12.3456);
  a.persist();
  const saved = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(saved.rooms[0].meterKWh, 12.3456);
  assert.equal(saved.rooms[0].meter, 3);
  assert.equal(saved.rooms[0].outdoorProbe, null);
  const b = createSims({ sensors, statePath });
  assert.equal(b.get(room.id).meterKWh, 12.3456);
  assert.equal(b.reset(room.id).meterKWh, 12.3456);
});

test('a state file from before the new links loads with them empty and a bad total is zero', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-meter-'));
  const statePath = join(dir, 'sims.json');
  const sensors = createSensors({});
  const a = createSims({ sensors, statePath });
  const room = a.add({ name: 'Room' });
  const saved = JSON.parse(readFileSync(statePath, 'utf8'));
  delete saved.rooms[0].outdoorProbe;
  delete saved.rooms[0].meter;
  saved.rooms[0].meterKWh = -4;
  writeFileSync(statePath, JSON.stringify(saved));
  const b = createSims({ sensors, statePath });
  assert.deepEqual([b.get(room.id).outdoorProbe, b.get(room.id).meter, b.get(room.id).meterKWh], [null, null, 0]);
});

// ---- HTTP ----

test('the API shows meter entries, the new links and electricW', async () => {
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 0 });
  const base = `http://127.0.0.1:${device.httpPort}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  try {
    assert.equal((await call('POST', '/api/sensors', { address: 9, kind: 'meter' })).status, 201);
    assert.equal((await call('POST', '/api/sensors', { address: 8, kind: 'trh' })).status, 201);
    assert.equal((await call('PUT', '/api/sensors/9', { power: 750, energy: 3.5 })).body.power, 750);
    const room = (await call('POST', '/api/sims', {})).body;
    assert.deepEqual([room.outdoorProbe, room.meter, room.meterKWh], [null, null, 0]);
    assert.equal((await call('PUT', `/api/sims/${room.id}`, { meter: 8 })).status, 409);
    assert.equal((await call('PUT', `/api/sims/${room.id}`, { outdoorProbe: 9 })).status, 409);
    const ok = await call('PUT', `/api/sims/${room.id}`, { outdoorProbe: 8, meter: 9, enabled: true });
    assert.equal(ok.status, 200);
    assert.deepEqual([ok.body.outdoorProbe, ok.body.meter], [8, 9]);
    const list = (await call('GET', '/api/sensors')).body;
    assert.equal(list.find((s) => s.address === 9).simulatedBy, 'Sim room 1');
    assert.equal(list.find((s) => s.address === 8).simulatedBy, 'Sim room 1');
    assert.equal((await call('PUT', '/api/sensors/9', { power: 1 })).status, 409);
    assert.equal((await call('DELETE', '/api/sensors/9')).status, 204);
    assert.equal((await call('GET', '/api/sims')).body[0].meter, null);
  } finally {
    await device.close();
  }
});

test('the dehumidifier draws its rated power while it runs', () => {
  const w = (inputs) => electricW({ ...run, acting: { dehumidifierKW: 0.38 }, inputs: { ac: null, ...inputs } });
  assert.equal(w({ dehumidifier: true }), 380);
  assert.equal(w({ dehumidifier: false }), 0);
  assert.equal(w({ dehumidifier: true, intake: true }), 440);
});

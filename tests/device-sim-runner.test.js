import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createSims } from '../device/sim-store.js';
import { createSimulation } from '../device/simulation.js';
import { startDevice } from '../device/server.js';

// A model that records what it was given and moves to fixed numbers.
function recorder(next = { T: 21.26, W: 10, CO2: 1234.6 }) {
  const calls = [];
  return {
    calls,
    satW: () => 20,
    rhOf: (T, W) => W * 5 + 0.04,
    wOf: (T, RH) => RH / 5,
    initialState: (p) => ({ T: p.outdoorT, W: 10, CO2: 420 }),
    step(state, inputs, params, dt) {
      calls.push({ state: { ...state }, inputs: { ...inputs, ac: inputs.ac && { ...inputs.ac } }, params: { ...params }, dt });
      return { state: { ...next }, acting: { exchangeM3h: 1, acCoolKW: 0, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } };
    },
  };
}

function setup({ model = recorder(), now } = {}) {
  const sensors = createSensors({ spinUpMs: 0 });
  sensors.add({ address: 1, kind: 'trh' });
  sensors.add({ address: 2, kind: 'co2' });
  sensors.add({ address: 3, kind: 'relay' });
  sensors.add({ address: 4, kind: 'ac' });
  const sims = createSims({ sensors, model });
  const room = sims.add({ name: 'Room' });
  sims.update(room.id, { trh: 1, co2: 2, relay: 3, ac: 4, enabled: true });
  const sim = createSimulation({ sensors, sims, model, now });
  return { sensors, sims, sim, model, id: room.id };
}

const lastInputs = (model) => model.calls.at(-1).inputs;

test('a tick steps speed simulated seconds and writes rounded values into the linked sensors', () => {
  const { sensors, sims, sim, model, id } = setup();
  sims.setSpeed(10);
  sim.tick();
  assert.equal(model.calls.length, 1);
  assert.equal(model.calls[0].dt, 10);
  assert.equal(model.calls[0].params.volume, 60);
  assert.deepEqual(model.calls[0].state, { T: 32, W: 10, CO2: 420 });
  assert.deepEqual([sensors.get(1).t, sensors.get(1).rh, sensors.get(2).co2, sensors.get(4).roomT], [21.3, 50, 1235, 21.3]);
  assert.deepEqual(sims.get(id).state, { T: 21.26, W: 10, CO2: 1234.6 });
  assert.equal(sims.get(id).acting.exchangeM3h, 1);
  sim.tick();
  assert.deepEqual(model.calls[1].state, { T: 21.26, W: 10, CO2: 1234.6 });
});

test('values are clamped to the device limits', () => {
  const { sensors, sim } = setup({ model: recorder({ T: 95, W: 1, CO2: 20000 }) });
  sim.tick();
  assert.deepEqual([sensors.get(1).t, sensors.get(1).rh, sensors.get(2).co2, sensors.get(4).roomT], [80, 5, 10000, 80]);
});

test('intake, exhaust and humidifier follow the relay running state; circulation is ignored', () => {
  const { sensors, sim, model } = setup();
  sim.tick();
  assert.deepEqual(lastInputs(model), { intake: false, exhaust: false, humidifier: false, ac: null });
  sensors.writeCoil(3, 0, true);
  sensors.writeCoil(3, 2, true);
  sim.tick();
  assert.deepEqual(lastInputs(model), { intake: true, exhaust: false, humidifier: false, ac: null });
  sensors.writeCoil(3, 1, true);
  sensors.writeCoil(3, 3, true);
  sim.tick();
  assert.deepEqual(lastInputs(model), { intake: true, exhaust: true, humidifier: true, ac: null });
});

test('a stuck coil, a dead motor and a relay still spinning up do not count as running', () => {
  const { sensors, sim, model } = setup();
  sensors.update(3, { stuck: [false, true, false, false] });
  sensors.writeCoil(3, 0, true);
  sensors.writeCoil(3, 1, true); // stuck: acknowledged, does not move
  sensors.update(3, { dead: [false, false, false, true] });
  sensors.writeCoil(3, 3, true); // coil on, motor dead
  sim.tick();
  assert.deepEqual(lastInputs(model), { intake: true, exhaust: false, humidifier: false, ac: null });

  const slow = createSensors({ spinUpMs: 60_000 });
  slow.add({ address: 3, kind: 'relay' });
  const sims = createSims({ sensors: slow, model });
  const { id } = sims.add({});
  sims.update(id, { relay: 3, enabled: true });
  const m = recorder();
  createSimulation({ sensors: slow, sims, model: m }).tick();
  slow.writeCoil(3, 0, true);
  createSimulation({ sensors: slow, sims, model: m }).tick();
  assert.equal(m.calls.at(-1).inputs.intake, false);
});

test('the aircon counts only when power is on and the error code is 0; codes become names', () => {
  const { sensors, sim, model } = setup();
  sensors.writeAc(4, { power: true, mode: 1, setpoint: 22.5, fan: 2 });
  sim.tick();
  assert.deepEqual(lastInputs(model).ac, { mode: 'heat', setpoint: 22.5, fan: 'high' });
  sensors.writeAc(4, { power: true, mode: 0, setpoint: 24, fan: 0 });
  sim.tick();
  assert.deepEqual(lastInputs(model).ac, { mode: 'cool', setpoint: 24, fan: 'auto' });
  sensors.writeAc(4, { power: true, mode: 2, setpoint: 24, fan: 1 });
  sim.tick();
  assert.deepEqual(lastInputs(model).ac, { mode: 'dry', setpoint: 24, fan: 'low' });
  sensors.writeAc(4, { power: true, mode: 3, setpoint: 24, fan: 1 });
  sim.tick();
  assert.equal(lastInputs(model).ac.mode, 'fan');

  sensors.update(4, { error: 5 });
  sim.tick();
  assert.equal(lastInputs(model).ac, null);
  sensors.update(4, { error: 0 });
  sensors.writeAc(4, { power: false, mode: 0, setpoint: 24, fan: 0 });
  sim.tick();
  assert.equal(lastInputs(model).ac, null);
});

test('an aircon that refuses commands keeps its old settings, and the model sees those', () => {
  const { sensors, sim, model } = setup();
  sensors.writeAc(4, { power: true, mode: 0, setpoint: 24, fan: 0 });
  sensors.update(4, { refuse: true });
  sensors.writeAc(4, { power: false, mode: 1, setpoint: 30, fan: 2 });
  sim.tick();
  assert.deepEqual(lastInputs(model).ac, { mode: 'cool', setpoint: 24, fan: 'auto' });
});

test('a missing, unlinked or wrong-kind link means that machine is off and its sensor is not written', () => {
  const { sensors, sims, sim, model, id } = setup();
  sensors.writeCoil(3, 0, true);
  sensors.writeAc(4, { power: true, mode: 0, setpoint: 20, fan: 0 });
  sim.tick();
  assert.equal(lastInputs(model).intake, true);

  sensors.remove(3);
  sensors.remove(4);
  sensors.remove(2);
  sim.tick();
  assert.deepEqual(lastInputs(model), { intake: false, exhaust: false, humidifier: false, ac: null });
  assert.equal(sensors.get(1).t, 21.3);

  // The address comes back as another kind: not a relay, so it is not read as one.
  sensors.add({ address: 3, kind: 'co2' });
  sensors.add({ address: 2, kind: 'trh' });
  sensors.update(2, { t: 11 });
  sim.tick();
  assert.equal(lastInputs(model).intake, false);
  assert.equal(sensors.get(3).co2, 800);
  assert.equal(sensors.get(2).t, 11);

  sims.update(id, { trh: null, co2: null, relay: null, ac: null });
  sensors.update(1, { t: 5 });
  sim.tick();
  assert.equal(sensors.get(1).t, 5);
});

test('a disabled room writes nothing and is not stepped', () => {
  const { sensors, sims, sim, model, id } = setup();
  sims.update(id, { enabled: false });
  sensors.update(1, { t: 7 });
  sim.tick();
  assert.equal(model.calls.length, 0);
  assert.equal(sensors.get(1).t, 7);
  assert.equal(sensors.get(2).co2, 800);
  assert.deepEqual(sims.get(id).state, { T: 32, W: 10, CO2: 420 });
});

test('two rooms run independently', () => {
  const { sensors, sims, sim, model } = setup();
  sensors.add({ address: 5, kind: 'co2' });
  const other = sims.add({ name: 'Other' });
  sims.update(other.id, { co2: 5, enabled: true, blocks: 9 });
  sim.tick();
  assert.equal(model.calls.length, 2);
  assert.deepEqual(model.calls.map((c) => c.params.blocks), [500, 9]);
  assert.equal(sensors.get(5).co2, 1235);
});

test('the state file is written at most every 10 s of real time, and when the runner stops', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-sim-'));
  try {
    let clock = 1_000_000;
    const model = recorder();
    const sensors = createSensors({});
    const statePath = join(dir, 'state.json.sim');
    const sims = createSims({ sensors, statePath, model });
    const { id } = sims.add({});
    sims.update(id, { enabled: true });
    const sim = createSimulation({ sensors, sims, model, now: () => clock });
    const saved = () => JSON.parse(readFileSync(statePath, 'utf8')).rooms[0].state.CO2;

    sim.tick();
    assert.equal(saved(), 420); // the air moved in memory only
    clock += 9_000;
    sim.tick();
    assert.equal(saved(), 420);
    clock += 1_000;
    sim.tick();
    assert.equal(saved(), 1234.6);

    model.step = () => ({ state: { T: 1, W: 1, CO2: 999 }, acting: null });
    sim.tick();
    assert.equal(saved(), 1234.6);
    sim.stop();
    assert.equal(saved(), 999);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('startDevice runs the timer, and close stops it', async () => {
  const model = recorder();
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 20, model });
  device.sensors.add({ address: 1, kind: 'co2' });
  const room = device.sims.add({});
  device.sims.update(room.id, { co2: 1, enabled: true });
  const until = Date.now() + 3000;
  while (device.sensors.get(1).co2 !== 1235 && Date.now() < until) await new Promise((r) => setTimeout(r, 10));
  assert.equal(device.sensors.get(1).co2, 1235);
  await device.close();
  const n = model.calls.length;
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(model.calls.length, n);
});

test('startDevice with simTickMs 0 only steps when asked', async () => {
  const model = recorder();
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 0, model });
  try {
    device.sensors.add({ address: 1, kind: 'co2' });
    const room = device.sims.add({});
    device.sims.update(room.id, { co2: 1, enabled: true });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(model.calls.length, 0);
    device.sim.tick();
    assert.equal(model.calls.length, 1);
    assert.equal(device.sensors.get(1).co2, 1235);
  } finally {
    await device.close();
  }
});

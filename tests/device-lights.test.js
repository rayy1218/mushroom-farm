// The lights in the device app (spec 2026-10-26-lighting-design.md 5 and 7): the relay's 6th output, the light heat, the power
// and the sim parameter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createSims, PARAMS } from '../device/sim-store.js';
import { createSimulation } from '../device/simulation.js';
import { step, initialState, rhOf } from '../device/sim-model.js';
import { electricW } from '../device/sim-power.js';

const six = (v) => Array(6).fill(v);

test('relay: 6 outputs; coil 5 is the lights', () => {
  const s = createSensors({ spinUpMs: 0 });
  s.add({ address: 10, kind: 'relay' });
  assert.deepEqual(s.get(10).coils, six(false));
  s.writeCoil(10, 5, true);
  assert.deepEqual(s.get(10).running, [false, false, false, false, false, true]);
  assert.throws(() => s.writeCoil(10, 6, true), (err) => err.field === 'coil');
  assert.throws(() => s.update(10, { stuck: six(false).slice(0, 5) }), (err) => err.field === 'stuck');
});

test('a relay saved with 5 outputs (or 4) loads with the lights off', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-lights-'));
  try {
    const statePath = join(dir, 'state.json');
    writeFileSync(statePath, JSON.stringify([
      { address: 10, kind: 'relay', coils: [true, false, false, true, true], stuck: [false, true, false, false, false], dead: [false, false, true, false, false] },
      { address: 11, kind: 'relay', coils: [true, false, false, false] },
    ]));
    const s = createSensors({ statePath, spinUpMs: 0 });
    assert.deepEqual(s.get(10).coils, [true, false, false, true, true, false]);
    assert.deepEqual(s.get(10).stuck, [false, true, false, false, false, false]);
    assert.deepEqual(s.get(10).dead, [false, false, true, false, false, false]);
    assert.deepEqual(s.get(11).coils, [true, false, false, false, false, false]);
    s.writeCoil(10, 5, true);
    assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).find((d) => d.address === 10).coils.length, 6);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('sim parameter lightsW: Lights power, 0–5000 W, default 0 (none); an older file gets 0', () => {
  const { min, max, label, unit, value } = PARAMS.lightsW;
  assert.deepEqual([min, max, label, unit, value], [0, 5000, 'Lights power', 'W', 0]);
  const sims = createSims({ sensors: createSensors({}) });
  const room = sims.add({ name: 'R' });
  assert.equal(room.lightsW, 0);
  assert.equal(sims.update(room.id, { lightsW: 150 }).lightsW, 150);
  assert.throws(() => sims.update(room.id, { lightsW: 5001 }), (err) => err.field === 'lightsW');
  const dir = mkdtempSync(join(tmpdir(), 'dev-lights-'));
  try {
    const file = join(dir, 'state.json.sim');
    writeFileSync(file, JSON.stringify({ speed: 1, rooms: [{ id: 1, name: 'Old' }] }));
    assert.equal(createSims({ sensors: createSensors({}), statePath: file }).list()[0].lightsW, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('model: the lights put their power into the air as heat while on', () => {
  const P = { volume: 60, blocks: 0, co2PerBlock: 60, wallUA: 0, sunW: 0, outdoorT: 25, outdoorRH: 60, fanFlow: 600, acKW: 3.5, humidifierGH: 2000, lightsW: 500 };
  const OFF = { intake: false, exhaust: false, circulation: false, humidifier: false, dehumidifier: false, lights: false, ac: null };
  const s0 = initialState(P);
  const off = step(s0, OFF, P, 60);
  const on = step(s0, { ...OFF, lights: true }, P, 60);
  assert.ok(Math.abs(on.acting.machineKW - off.acting.machineKW - 0.5) < 1e-9);
  assert.equal(on.acting.lightsKW, 0.5);
  assert.equal(off.acting.lightsKW, 0);
  assert.ok(on.state.T > off.state.T);
  assert.ok(rhOf(on.state.T, on.state.W) < rhOf(off.state.T, off.state.W));
  assert.equal(step(s0, { ...OFF, lights: true }, P, 0).acting.lightsKW, 0.5, 'the nominal rates include it');
  assert.equal(step(s0, { ...OFF, lights: true }, { ...P, lightsW: undefined }, 60).acting.lightsKW, 0);
});

test('power: the lights draw lightsW while on', () => {
  const w = (inputs) => electricW({ acting: {}, inputs: { ac: null, ...inputs }, params: { outdoorT: 27, lightsW: 90 } });
  assert.equal(w({ lights: true }), 90);
  assert.equal(w({ lights: false }), 0);
});

test('runner: the lights input is output 6 really running; the model gets lightsW', () => {
  const sensors = createSensors({ spinUpMs: 0 });
  sensors.add({ address: 3, kind: 'relay' });
  const calls = [];
  const model = {
    satW: () => 20, rhOf: () => 50, wOf: () => 10, initialState: () => ({ T: 25, W: 10, CO2: 420 }),
    step(state, inputs, params) { calls.push({ inputs, params }); return { state, acting: {} }; },
  };
  const sims = createSims({ sensors, model });
  const room = sims.add({ name: 'R' });
  sims.update(room.id, { relay: 3, enabled: true, lightsW: 120 });
  const sim = createSimulation({ sensors, sims, model });
  sim.tick();
  assert.equal(calls.at(-1).inputs.lights, false);
  sensors.writeCoil(3, 5, true);
  sim.tick();
  assert.equal(calls.at(-1).inputs.lights, true);
  assert.equal(calls.at(-1).params.lightsW, 120);
  sensors.update(3, { dead: [false, false, false, false, false, true] });
  sim.tick();
  assert.equal(calls.at(-1).inputs.lights, false);
});

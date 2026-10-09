// Plant overrides and heat flows of the simulation (sim.js, C8 5.1). Contract: docs/contracts/equipment.md
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js');
const SIM = globalThis.ClimateSim;

const cmd = (over = {}) => ({ ac: { power: true, mode: 'cool', setpoint: 20, fan: 'auto' }, hu: { level: 1 }, air: { on: false }, lights: { on: true }, circ: { on: true }, ...over });
const env = over => ({ ...structuredClone(SIM.DEFAULT_ENV), ...over });
const run = (e, seconds, c = cmd()) => {
  const sim = SIM.create(e);
  for (let i = 0; i < seconds; i++) sim.step(1, c);
  return sim;
};

test('SIM1 plantOf and the aircond coil airflow', () => {
  assert.equal(SIM.PLANT.ac.coilM3s, 0.14);
  assert.equal(SIM.plantOf(undefined), SIM.PLANT);
  assert.equal(SIM.plantOf(null), SIM.PLANT);
  const p = SIM.plantOf({ ac: { capW: 7910 } });
  assert.equal(p.ac.capW, 7910);
  for (const k of Object.keys(SIM.PLANT.ac)) if (k !== 'capW') assert.deepEqual(p.ac[k], SIM.PLANT.ac[k]);
  SIM.plantOf({ ac: { capW: 1 } });
  assert.equal(SIM.PLANT.ac.capW, 3500);
  assert.equal(SIM.plantOf({ foo: 1 }).foo, undefined);
  assert.equal(SIM.plantOf({ air: { m3h: 600 } }).air, SIM.PLANT.air);
});

test('SIM2 an empty env.plant changes nothing', () => {
  const a = run(env(), 3600), b = run(env({ plant: {} }), 3600);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

test('SIM3 a bigger aircond cools the room more', () => {
  const a = run(env(), 3600), b = run(env({ plant: { ac: { capW: 7910, coilM3s: 0.3164 } } }), 3600);
  assert.ok(a.view().T - b.view().T >= 2, `${a.view().T} vs ${b.view().T}`);
});

test('SIM4 the calibration (env.room) overrides the plant room', () => {
  const a = run(env({ plant: { room: { ua: 300 } }, room: { ua: 50 } }), 600), b = run(env({ room: { ua: 50 } }), 600);
  assert.deepEqual(a.snapshot(), b.snapshot());
});

const KEYS = ['walls', 'sun', 'airSens', 'airLat', 'blockSens', 'blockLat', 'base', 'lights', 'people', 'fog', 'water', 'acSens', 'acLat'];

test('SIM5 heatJ has the 13 keys, all 0 at create, and is not part of the snapshot', () => {
  const sim = SIM.create(env());
  const h0 = sim.heatJ();
  assert.deepEqual(Object.keys(h0).sort(), [...KEYS].sort());
  for (const k of KEYS) assert.equal(h0[k], 0);
  const before = Object.keys(sim.snapshot()).sort();
  for (let i = 0; i < 600; i++) sim.step(1, cmd());
  for (const k of KEYS) assert.ok(Number.isFinite(sim.heatJ()[k]), k);
  assert.equal('flowJ' in sim.snapshot(), false);
  assert.deepEqual(Object.keys(sim.snapshot()).sort(), before);
});

test('SIM6 over a day the aircond removes what the sources bring in', () => {
  const sim = SIM.create(env());
  const c = cmd({ ac: { power: true, mode: 'cool', setpoint: 24, fan: 'auto' }, hu: { level: 0 } });
  const at = hours => { while (sim.snapshot().t < hours * 3600) sim.step(1, c); return sim.heatJ(); };
  const a = at(24), b = at(48);
  const d = k => b[k] - a[k];
  const sources = ['walls', 'sun', 'airSens', 'airLat', 'blockSens', 'blockLat', 'base', 'lights', 'people', 'water'].reduce((s, k) => s + d(k), 0);
  const removed = d('acSens') + d('acLat');
  assert.ok(Math.abs(removed / sources - 1) < 0.01, `${removed / sources}`);
});

test('SIM7 heatJ returns a copy', () => {
  const sim = run(env(), 60);
  const h = sim.heatJ();
  const walls = h.walls;
  h.walls = 1e9;
  assert.equal(sim.heatJ().walls, walls);
});

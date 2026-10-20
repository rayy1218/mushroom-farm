import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';
import { createSims } from '../device/sim-store.js';
import { createSimulation } from '../device/simulation.js';
import { outdoorAt } from '../device/sim-model.js';

// A model that changes nothing, so only the room's power counts.
const still = {
  satW: () => 20, rhOf: (T, W) => W * 5, wOf: (T, RH) => RH / 5,
  initialState: (p) => ({ T: p.outdoorT, W: 10, CO2: 420 }),
  step: (state) => ({ state: { ...state }, acting: { exchangeM3h: 0, acCoolKW: 0, acHeatKW: 0, humidifierGH: 0, blocksKW: 0 } }),
};

// Sensors, sims and a runner on the same two state files, like a device start.
function boot(dir, now = () => 0) {
  const statePath = join(dir, 'state.json');
  const sensors = createSensors({ statePath, spinUpMs: 0 });
  const sims = createSims({ sensors, statePath: `${statePath}.sim`, model: still });
  const sim = createSimulation({ sensors, sims, model: still, now });
  return { sensors, sims, sim, statePath };
}

function first(dir) {
  const a = boot(dir);
  a.sensors.add({ address: 3, kind: 'meter' });
  a.sensors.add({ address: 4, kind: 'relay' });
  a.sensors.add({ address: 5, kind: 'trh' });
  const room = a.sims.add({ name: 'Room' });
  a.sims.update(room.id, { meter: 3, relay: 4, outdoorProbe: 5, enabled: true });
  a.sensors.writeCoil(4, 2, true); // circulation, 60 W
  a.sims.setSpeed(60);
  return { ...a, id: room.id };
}

test('a restarted device answers the saved meter total at once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-mp-'));
  const a = first(dir);
  a.sim.tick();
  a.sim.tick();
  const total = a.sensors.get(3).energy;
  assert.ok(total >= 0.002);
  a.sim.stop();
  const b = boot(dir);
  assert.equal(b.sensors.get(3).energy, total);
});

test('a small step is not lost to rounding', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-mp-'));
  const a = first(dir);
  a.sims.setSpeed(1);
  for (let i = 0; i < 3600; i++) a.sim.tick(); // 60 W for an hour of 1 s steps
  assert.equal(a.sensors.get(3).energy, 0.06);
  a.sim.stop();
  assert.equal(boot(dir).sensors.get(3).energy, 0.06);
});

test('relinking a meter to another room does not move its total', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-mp-'));
  const a = first(dir);
  a.sims.setState(a.id, a.sims.get(a.id).state, null, undefined, 500); // the room had a big total of its own
  a.sim.tick();
  const room2 = a.sims.add({ name: 'Other' });
  a.sims.update(a.id, { meter: null });
  a.sims.update(room2.id, { meter: 3, enabled: true });
  const before = a.sensors.get(3).energy;
  a.sim.tick();
  const after = a.sensors.get(3).energy;
  assert.ok(after >= before && after - before < 1, `${before} -> ${after}`);
});

test('the total is saved on the flush interval; a crash loses at most that and never lowers it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-mp-'));
  let t = 0;
  const a = boot(dir, () => t);
  a.sensors.add({ address: 3, kind: 'meter' });
  a.sensors.add({ address: 4, kind: 'relay' });
  const room = a.sims.add({ name: 'Room' });
  a.sims.update(room.id, { meter: 3, relay: 4, enabled: true });
  a.sensors.writeCoil(4, 2, true);
  a.sims.setSpeed(60);
  a.sim.tick();
  const one = a.sensors.get(3).energy;
  t = 10_000;
  a.sim.tick(); // flushes
  const two = a.sensors.get(3).energy;
  t = 11_000;
  a.sim.tick(); // not yet saved: a crash here
  const three = a.sensors.get(3).energy;
  assert.ok(one < two && two < three);
  const saved = boot(dir).sensors.get(3).energy;
  assert.equal(saved, two);
  assert.ok(saved >= one);
});

test('a typed total replaces the register and the simulation continues from it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-mp-'));
  const a = first(dir);
  a.sims.update(a.id, { enabled: false });
  a.sensors.update(3, { energy: 7 });
  a.sims.update(a.id, { enabled: true });
  a.sim.tick();
  assert.ok(a.sensors.get(3).energy > 7);
  assert.ok(a.sensors.get(3).energy < 8);
});

test('the outdoor probe holds the room outdoor air before the first tick', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-mp-'));
  const a = first(dir);
  a.sim.prime();
  const room = a.sims.get(a.id);
  const out = outdoorAt(room, room.clock);
  assert.equal(a.sensors.get(5).t, Math.round(out.outdoorT * 10) / 10);
  assert.equal(a.sensors.get(5).rh, Math.round(out.outdoorRH * 10) / 10);
});

test('the file keeps the exact total only while it matches the register', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mf-mp-'));
  const a = first(dir);
  a.sims.setSpeed(1);
  a.sim.tick();
  a.sim.stop();
  const file = JSON.parse(readFileSync(a.statePath, 'utf8'));
  file.find((e) => e.address === 3).energy = 42; // someone edited the file
  writeFileSync(a.statePath, JSON.stringify(file));
  assert.equal(boot(dir).sensors.get(3).energy, 42);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';

function thrown(fn) {
  try { fn(); } catch (err) { return err; }
  assert.fail('expected a throw');
}

const four = (v) => [v, v, v, v];

test('relay and ac defaults', () => {
  const s = createSensors({});
  s.add({ address: 10, kind: 'relay' });
  s.add({ address: 20, kind: 'ac' });
  assert.deepEqual(s.get(10), {
    address: 10, kind: 'relay', coils: four(false), stuck: four(false), dead: four(false), running: four(false), answering: true,
  });
  assert.deepEqual(s.get(20), {
    address: 20, kind: 'ac', power: false, mode: 0, setpoint: 25, fan: 0, roomT: 25, error: 0, refuse: false, answering: true,
  });
  assert.deepEqual(s.list().map((x) => x.address), [10, 20]);
});

test('addresses are unique across all kinds; unknown kind is 400', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  assert.equal(thrown(() => s.add({ address: 1, kind: 'relay' })).status, 409);
  s.add({ address: 2, kind: 'relay' });
  assert.equal(thrown(() => s.add({ address: 2, kind: 'ac' })).status, 409);
  assert.equal(thrown(() => s.add({ address: 3, kind: 'fan' })).field, 'kind');
});

test('returned objects are copies', () => {
  const s = createSensors({});
  s.add({ address: 10, kind: 'relay' });
  s.get(10).stuck[0] = true;
  s.list()[0].dead[1] = true;
  assert.deepEqual(s.get(10).stuck, four(false));
  assert.deepEqual(s.get(10).dead, four(false));
});

test('relay update: stuck, dead, answering; coils only through writeCoil', () => {
  const s = createSensors({ spinUpMs: 0 });
  s.add({ address: 10, kind: 'relay' });
  s.update(10, { stuck: [true, false, false, true] });
  s.update(10, { dead: [false, true, false, false], answering: false });
  const r = s.get(10);
  assert.deepEqual(r.stuck, [true, false, false, true]);
  assert.deepEqual(r.dead, [false, true, false, false]);
  assert.equal(r.answering, false);
  const bad = [
    [{ coils: four(true) }, 'coils'],
    [{ stuck: [true] }, 'stuck'], [{ stuck: true }, 'stuck'], [{ stuck: [1, 0, 0, 0] }, 'stuck'],
    [{ dead: [true, true, true, true, true] }, 'dead'], [{ dead: null }, 'dead'], [{ t: 20 }, 't'], [{ roomT: 20 }, 'roomT'],
  ];
  for (const [patch, field] of bad) {
    const err = thrown(() => s.update(10, patch));
    assert.equal(err.status, 400, JSON.stringify(patch));
    assert.equal(err.field, field, JSON.stringify(patch));
  }
  assert.deepEqual(s.get(10).stuck, [true, false, false, true]);
});

test('writeCoil switches a coil; stuck keeps it; running follows coil and dead', () => {
  const s = createSensors({ spinUpMs: 0 });
  s.add({ address: 10, kind: 'relay' });
  s.writeCoil(10, 0, true);
  s.writeCoil(10, 3, true);
  assert.deepEqual(s.get(10).coils, [true, false, false, true]);
  assert.deepEqual(s.get(10).running, [true, false, false, true]);
  s.update(10, { dead: [false, false, false, true] });
  assert.deepEqual(s.get(10).running, [true, false, false, false]);
  s.update(10, { stuck: [true, false, false, false] });
  s.writeCoil(10, 0, false);
  assert.equal(s.get(10).coils[0], true);
  s.writeCoil(10, 1, true);
  assert.equal(s.get(10).coils[1], true);
});

test('running needs the spin-up time on', () => {
  let now = 0;
  const s = createSensors({ spinUpMs: 80, now: () => now });
  s.add({ address: 10, kind: 'relay' });
  s.writeCoil(10, 2, true);
  assert.equal(s.get(10).coils[2], true);
  assert.equal(s.get(10).running[2], false);
  now += 79;
  assert.equal(s.get(10).running[2], false);
  now += 1;
  assert.equal(s.get(10).running[2], true);
  s.writeCoil(10, 2, false);
  assert.equal(s.get(10).running[2], false);
  s.writeCoil(10, 2, true);
  assert.equal(s.get(10).running[2], false, 'spin-up starts again');
});

test('writing on to a coil that is already on keeps its timer', () => {
  let now = 0;
  const s = createSensors({ now: () => now });
  s.add({ address: 10, kind: 'relay' });
  s.writeCoil(10, 0, true);
  now += 1500;
  s.writeCoil(10, 0, true);
  now += 500;
  assert.equal(s.get(10).running[0], true);
});

test('a restart starts the spin-up again; running is not stored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-machines-'));
  const statePath = join(dir, 'state.json');
  let now = 0;
  const a = createSensors({ statePath, now: () => now });
  a.add({ address: 10, kind: 'relay' });
  a.writeCoil(10, 0, true);
  now += 2000;
  assert.equal(a.get(10).running[0], true);
  assert.equal('running' in JSON.parse(readFileSync(statePath, 'utf8'))[0], false);
  const b = createSensors({ statePath, now: () => now });
  assert.equal(b.get(10).coils[0], true);
  assert.equal(b.get(10).running[0], false);
  now += 2000;
  assert.equal(b.get(10).running[0], true);
  rmSync(dir, { recursive: true, force: true });
});

test('default spin-up is 2 s (injected clock)', () => {
  let now = 1000;
  const s = createSensors({ now: () => now });
  s.add({ address: 10, kind: 'relay' });
  s.writeCoil(10, 0, true);
  now += 1999;
  assert.equal(s.get(10).running[0], false);
  now += 1;
  assert.equal(s.get(10).running[0], true);
});

test('ac update: roomT, error, refuse, answering with limits', () => {
  const s = createSensors({});
  s.add({ address: 20, kind: 'ac' });
  s.update(20, { roomT: -5.5, error: 255, refuse: true, answering: false });
  const a = s.get(20);
  assert.equal(a.roomT, -5.5);
  assert.equal(a.error, 255);
  assert.equal(a.refuse, true);
  assert.equal(a.answering, false);
  s.update(20, { roomT: 80 });
  s.update(20, { roomT: -40, error: 0 });
  const bad = [
    [{ roomT: 80.1 }, 'roomT'], [{ roomT: -40.1 }, 'roomT'], [{ roomT: '20' }, 'roomT'],
    [{ error: 256 }, 'error'], [{ error: -1 }, 'error'], [{ error: 1.5 }, 'error'],
    [{ refuse: 'yes' }, 'refuse'], [{ power: true }, 'power'], [{ mode: 1 }, 'mode'], [{ setpoint: 20 }, 'setpoint'],
    [{ t: 20 }, 't'], [{ stuck: four(false) }, 'stuck'],
  ];
  for (const [patch, field] of bad) {
    const err = thrown(() => s.update(20, patch));
    assert.equal(err.status, 400, JSON.stringify(patch));
    assert.equal(err.field, field, JSON.stringify(patch));
  }
  assert.equal(s.get(20).roomT, -40);
});

test('writeAc sets the four values; refuse keeps them', () => {
  const s = createSensors({});
  s.add({ address: 20, kind: 'ac' });
  s.writeAc(20, { power: true, mode: 1, setpoint: 23.5, fan: 2 });
  const { power, mode, setpoint, fan } = s.get(20);
  assert.deepEqual({ power, mode, setpoint, fan }, { power: true, mode: 1, setpoint: 23.5, fan: 2 });
  s.update(20, { refuse: true });
  s.writeAc(20, { power: false, mode: 0, setpoint: 18, fan: 0 });
  assert.equal(s.get(20).power, true);
  assert.equal(s.get(20).setpoint, 23.5);
});

test('relay and ac are saved and loaded again (coils and settings included)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-machines-'));
  const statePath = join(dir, 'state.json');
  const a = createSensors({ statePath, spinUpMs: 0 });
  a.add({ address: 10, kind: 'relay' });
  a.writeCoil(10, 1, true);
  a.update(10, { stuck: [false, false, true, false], dead: [false, false, false, true], answering: false });
  a.add({ address: 20, kind: 'ac' });
  a.writeAc(20, { power: true, mode: 2, setpoint: 21, fan: 1 });
  a.update(20, { roomT: 27.5, error: 7, refuse: true });
  assert.deepEqual(readdirSync(dir), ['state.json']);
  const b = createSensors({ statePath, spinUpMs: 0 });
  assert.deepEqual(b.list(), a.list());
  assert.deepEqual(b.get(10).coils, [false, true, false, false]);
  assert.equal(b.get(20).setpoint, 21);
  rmSync(dir, { recursive: true, force: true });
});

test('a bad machine entry in the state file is skipped', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-machines-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, JSON.stringify([
    { address: 10, kind: 'relay', coils: [true, 'x', false, false] },
    { address: 11, kind: 'relay', stuck: [true] },
    { address: 20, kind: 'ac', power: true, mode: 9, setpoint: 21, fan: 1 },
    { address: 21, kind: 'ac', roomT: 99 },
    { address: 22, kind: 'ac', setpoint: 20.3 },
    { address: 30, kind: 'relay', coils: [true, false, false, false] },
  ]));
  const s = createSensors({ statePath, spinUpMs: 0 });
  assert.deepEqual(s.list().map((x) => x.address), [30]);
  assert.deepEqual(s.get(30).coils, [true, false, false, false]);
  assert.deepEqual(s.get(30).running, [true, false, false, false]);
  rmSync(dir, { recursive: true, force: true });
});

test('a failed save rolls back writeCoil, writeAc and update', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-machines-'));
  const statePath = join(dir, 'sub', 'state.json');
  mkdirSync(join(dir, 'sub'));
  const s = createSensors({ statePath, spinUpMs: 0 });
  s.add({ address: 10, kind: 'relay' });
  s.add({ address: 20, kind: 'ac' });
  rmSync(join(dir, 'sub'), { recursive: true }); // saving now fails
  assert.throws(() => s.writeCoil(10, 0, true), { code: 'ENOENT' });
  assert.equal(s.get(10).coils[0], false);
  assert.equal(s.get(10).running[0], false);
  assert.throws(() => s.update(10, { stuck: [true, true, true, true] }), { code: 'ENOENT' });
  assert.deepEqual(s.get(10).stuck, four(false));
  assert.throws(() => s.writeAc(20, { power: true, mode: 3, setpoint: 20, fan: 2 }), { code: 'ENOENT' });
  assert.equal(s.get(20).power, false);
  assert.equal(s.get(20).mode, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('writeCoil and writeAc on the wrong kind or address throw', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  s.add({ address: 10, kind: 'relay' });
  assert.equal(thrown(() => s.writeCoil(1, 0, true)).status, 404);
  assert.equal(thrown(() => s.writeCoil(99, 0, true)).status, 404);
  assert.equal(thrown(() => s.writeAc(10, { power: true, mode: 0, setpoint: 20, fan: 0 })).status, 404);
});

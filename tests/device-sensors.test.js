import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors } from '../device/sensors.js';

function thrown(fn) {
  try { fn(); } catch (err) { return err; }
  assert.fail('expected a throw');
}

test('add uses the defaults and list shows every sensor by address', () => {
  const s = createSensors({});
  s.add({ address: 5, kind: 'co2' });
  s.add({ address: 2, kind: 'trh' });
  assert.deepEqual(s.list(), [
    { address: 2, kind: 'trh', t: 25, rh: 85, co2: null, answering: true },
    { address: 5, kind: 'co2', t: null, rh: null, co2: 800, answering: true },
  ]);
  assert.equal(s.get(5).kind, 'co2');
  assert.equal(s.get(9), undefined);
});

test('update changes values and answering; remove deletes', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  s.add({ address: 2, kind: 'co2' });
  s.update(1, { t: -5.5, rh: 40.2 });
  s.update(1, { answering: false });
  s.update(2, { co2: 1200, answering: false });
  assert.deepEqual(s.get(1), { address: 1, kind: 'trh', t: -5.5, rh: 40.2, co2: null, answering: false });
  assert.equal(s.get(2).co2, 1200);
  s.remove(1);
  assert.equal(s.get(1), undefined);
  assert.equal(s.list().length, 1);
});

test('duplicate address is 409 on address', () => {
  const s = createSensors({});
  s.add({ address: 3, kind: 'trh' });
  const err = thrown(() => s.add({ address: 3, kind: 'co2' }));
  assert.equal(err.status, 409);
  assert.equal(err.field, 'address');
  assert.match(err.message, /3/);
});

test('address limits', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  s.add({ address: 247, kind: 'trh' });
  for (const bad of [0, 248, 1.5, '3', null, undefined, true, -1]) {
    const err = thrown(() => s.add({ address: bad, kind: 'trh' }));
    assert.equal(err.status, 400, String(bad));
    assert.equal(err.field, 'address');
  }
});

test('kind must be trh or co2', () => {
  const s = createSensors({});
  const err = thrown(() => s.add({ address: 1, kind: 'ph' }));
  assert.equal(err.status, 400);
  assert.equal(err.field, 'kind');
});

test('value limits at and beyond the boundaries', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  s.add({ address: 2, kind: 'co2' });
  s.update(1, { t: -40, rh: 0 });
  s.update(1, { t: 80, rh: 100 });
  s.update(2, { co2: 0 });
  s.update(2, { co2: 10000 });
  const cases = [
    [1, { t: -40.1 }, 't'], [1, { t: 80.1 }, 't'], [1, { rh: -0.1 }, 'rh'], [1, { rh: 100.1 }, 'rh'],
    [1, { t: '25' }, 't'], [1, { t: NaN }, 't'], [1, { rh: null }, 'rh'],
    [2, { co2: -1 }, 'co2'], [2, { co2: 10001 }, 'co2'], [2, { co2: 800.5 }, 'co2'],
    [1, { co2: 500 }, 'co2'], [2, { t: 20 }, 't'], [2, { rh: 20 }, 'rh'],
    [1, { answering: 'yes' }, 'answering'],
  ];
  for (const [address, patch, field] of cases) {
    const err = thrown(() => s.update(address, patch));
    assert.equal(err.status, 400, JSON.stringify(patch));
    assert.equal(err.field, field, JSON.stringify(patch));
  }
});

test('a rejected update changes nothing', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  thrown(() => s.update(1, { t: 30, rh: 500 }));
  assert.equal(s.get(1).t, 25);
});

test('values are kept to 0.1', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  s.update(1, { t: 25.26 });
  assert.equal(s.get(1).t, 25.3);
});

test('unknown address is 404 on update and remove', () => {
  const s = createSensors({});
  assert.equal(thrown(() => s.update(7, { answering: true })).status, 404);
  assert.equal(thrown(() => s.remove(7)).status, 404);
});

test('saved to the state file and loaded again, without leftover temp files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-sensors-'));
  const statePath = join(dir, 'state.json');
  const a = createSensors({ statePath });
  assert.equal(existsSync(statePath), false);
  a.add({ address: 4, kind: 'trh' });
  a.update(4, { t: 19.5, answering: false });
  a.add({ address: 6, kind: 'co2' });
  a.remove(6);
  assert.deepEqual(readdirSync(dir), ['state.json']);
  const b = createSensors({ statePath });
  assert.deepEqual(b.list(), [{ address: 4, kind: 'trh', t: 19.5, rh: 85, co2: null, answering: false }]);
});

test('a broken or invalid state file starts empty or skips bad entries', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dev-sensors-'));
  const statePath = join(dir, 'state.json');
  writeFileSync(statePath, '{not json');
  assert.deepEqual(createSensors({ statePath }).list(), []);
  writeFileSync(statePath, JSON.stringify([{ address: 999, kind: 'trh' }, { address: 2, kind: 'co2', co2: 700, answering: true }]));
  assert.deepEqual(createSensors({ statePath }).list().map((x) => x.address), [2]);
});

test('no file without a statePath', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  assert.equal(s.list().length, 1);
});

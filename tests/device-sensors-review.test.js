// Review fixes for device/sensors.js: failed saves roll back, unreadable state is announced, empty PUT is 400.

import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSensors, SensorError } from '../device/sensors.js';

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'device-sensors-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a failed save leaves add, update and remove undone', (t) => {
  const dir = tempDir(t);
  const state = join(dir, 'sub', 'state.json');
  mkdirSync(join(dir, 'sub'));
  const s = createSensors({ statePath: state });
  s.add({ address: 1, kind: 'trh' });
  s.update(1, { t: 30 });

  rmSync(join(dir, 'sub'), { recursive: true }); // saving now fails
  assert.throws(() => s.add({ address: 2, kind: 'co2' }), { code: 'ENOENT' });
  assert.deepEqual(s.list().map((x) => x.address), [1]);
  assert.throws(() => s.update(1, { t: 10, answering: false }), { code: 'ENOENT' });
  assert.equal(s.get(1).t, 30);
  assert.equal(s.get(1).answering, true);
  assert.throws(() => s.remove(1), { code: 'ENOENT' });
  assert.equal(s.get(1).t, 30);

  mkdirSync(join(dir, 'sub')); // and works again once saving works
  s.update(1, { t: 12 });
  assert.equal(s.get(1).t, 12);
});

test('an unreadable state file is announced with its name; a missing one is not', (t) => {
  const dir = tempDir(t);
  const warn = mock.method(console, 'warn', () => {});
  t.after(() => warn.mock.restore());

  createSensors({ statePath: join(dir, 'missing.json') });
  assert.equal(warn.mock.callCount(), 0);

  const broken = join(dir, 'broken.json');
  writeFileSync(broken, '{not json');
  assert.deepEqual(createSensors({ statePath: broken }).list(), []);
  assert.equal(warn.mock.callCount(), 1);
  assert.match(String(warn.mock.calls[0].arguments.join(' ')), /broken\.json/);

  const wrongShape = join(dir, 'shape.json');
  writeFileSync(wrongShape, '{"a":1}');
  createSensors({ statePath: wrongShape });
  assert.equal(warn.mock.callCount(), 2);
  assert.match(String(warn.mock.calls[1].arguments.join(' ')), /shape\.json/);
});

test('update with nothing recognised is 400 Nothing to change', () => {
  const s = createSensors({});
  s.add({ address: 1, kind: 'trh' });
  for (const patch of [{}, { colour: 'red' }, null, { t: undefined }]) {
    let err;
    try { s.update(1, patch); } catch (e) { err = e; }
    assert.ok(err instanceof SensorError, JSON.stringify(patch));
    assert.equal(err.status, 400);
    assert.equal(err.message, 'Nothing to change');
  }
  assert.equal(s.update(1, { answering: false }).answering, false);
});

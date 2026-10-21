import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_NAMES, shownMachines, statusWord, onOff, validSetpoint, describeAc, acBody, acMatches, lastWriteText, STATUS_WORDS } from '../web/machines-math.js';

test('every status of the spec has a word', () => {
  for (const s of ['not-wired', 'no-data', 'no-answer', 'switching', 'not-following', 'not-running', 'running-while-off', 'fault', 'on', 'off', 'not-fitted']) {
    assert.ok(STATUS_WORDS[s], s);
  }
  assert.equal(statusWord('on'), 'On');
  assert.equal(statusWord('something-new'), 'something-new');
});

test('onOff shows unknown as a dash', () => {
  assert.deepEqual([onOff(true), onOff(false), onOff(null)], ['on', 'off', '—']);
});

test('setpoint is 16 to 30 in half degrees', () => {
  for (const v of [16, 16.5, 23.5, 30]) assert.equal(validSetpoint(v), true, String(v));
  for (const v of [15.5, 30.5, 23.3, NaN, Infinity]) assert.equal(validSetpoint(v), false, String(v));
});

test('describeAc and acBody', () => {
  assert.equal(describeAc({ power: true, mode: 'cool', setpoint: 23.5, fan: 'auto' }), 'On · Cool · 23.5 °C · fan Auto');
  assert.equal(describeAc(null), '—');
  assert.deepEqual(acBody({ power: 1, mode: 'heat', setpoint: 20, fan: 'low', extra: 1 }), { power: true, mode: 'heat', setpoint: 20, fan: 'low' });
});

test('acMatches compares all four values', () => {
  const a = { power: true, mode: 'cool', setpoint: 23.5, fan: 'auto' };
  assert.equal(acMatches(a, { ...a }), true);
  assert.equal(acMatches(a, { ...a, fan: 'low' }), false);
  assert.equal(acMatches(a, null), false);
});

test('lastWriteText shows a failure with its age until the device is back in sync', () => {
  const ago = (ms) => `${ms / 1000} s ago`;
  const w = { at: 1000, ok: false, error: 'timeout' };
  assert.equal(lastWriteText(w, 6000, false, ago), 'Last write failed 5 s ago: timeout');
  assert.equal(lastWriteText(w, 6000, true, ago), '');
  assert.equal(lastWriteText({ at: 1, ok: true, error: null }, 6000, false, ago), '');
  assert.equal(lastWriteText(null, 6000, false, ago), '');
});

test('the Dehumidifier has a name and a status word', () => {
  assert.equal(MACHINE_NAMES.dehumidifier, 'Dehumidifier');
  assert.equal(statusWord('not-fitted'), 'Not fitted');
});

test('a relay machine that is not fitted is not shown; the others keep their order', () => {
  const list = [{ key: 'intake', status: 'on' }, { key: 'humidifier', status: 'off' }, { key: 'dehumidifier', status: 'not-fitted' }];
  assert.deepEqual(shownMachines(list).map((m) => m.key), ['intake', 'humidifier']);
  assert.deepEqual(shownMachines([...list.slice(0, 2), { key: 'dehumidifier', status: 'off' }]).map((m) => m.key), ['intake', 'humidifier', 'dehumidifier']);
  assert.deepEqual(shownMachines(undefined), []);
});

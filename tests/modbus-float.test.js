// Two registers (high word first) as an IEEE-754 float32, for the energy meter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registersToFloat } from '../server/modbus.js';

test('high word first', () => {
  assert.equal(registersToFloat([0x4366, 0x8000]), 230.5);
  assert.equal(registersToFloat([0x4144, 0x0000]), 12.25);
  assert.equal(registersToFloat([0x0000, 0x0000]), 0);
});

test('negative numbers and the low word', () => {
  assert.equal(registersToFloat([0xc366, 0x8000]), -230.5);
  assert.equal(registersToFloat([0x3f80, 0x0000]), 1);
  assert.ok(Math.abs(registersToFloat([0x3f80, 0x0001]) - 1) > 0 && registersToFloat([0x3f80, 0x0001]) < 1.0001);
});

test('not-a-number and infinity come through as numbers the caller can reject', () => {
  assert.ok(Number.isNaN(registersToFloat([0x7fc0, 0x0000])));
  assert.equal(registersToFloat([0x7f80, 0x0000]), Infinity);
});

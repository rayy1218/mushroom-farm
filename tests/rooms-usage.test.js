// Room input of iteration 7: the meter address and the six machine ratings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoom, RATINGS } from '../server/rooms.js';

const good = { name: 'R', length: 6, width: 4, height: 2.5 };

test('a body without ratings gets the defaults and no meter', () => {
  const { room } = validateRoom(good);
  assert.equal(room.meterAddress, null);
  assert.deepEqual([room.intakeW, room.exhaustW, room.circulationW, room.humidifierW, room.humidifierLH, room.acInputW],
    [60, 60, 60, 80, 2, 1050]);
});

test('given ratings and a meter address are kept', () => {
  const body = { ...good, meterAddress: 30, intakeW: 0, exhaustW: 5000, circulationW: 12.5, humidifierW: 99, humidifierLH: 100, acInputW: 20000 };
  const { room } = validateRoom(body);
  for (const [k, v] of Object.entries(body)) assert.equal(room[k], v, k);
});

test('a null rating is the default', () => {
  assert.equal(validateRoom({ ...good, acInputW: null }).room.acInputW, 1050);
});

test('every rating has its range', () => {
  for (const { field, min, max } of RATINGS) {
    assert.ok(validateRoom({ ...good, [field]: min }).room, `${field} min`);
    assert.ok(validateRoom({ ...good, [field]: max }).room, `${field} max`);
    for (const v of [min - 0.1, max + 0.1, '5', NaN, Infinity, true]) {
      const result = validateRoom({ ...good, [field]: v });
      assert.equal(result.field, field, `${field} ${v}`);
      assert.match(result.error, /must be a number from/);
    }
  }
  assert.equal(validateRoom({ ...good, humidifierLH: 101 }).error, 'Humidifier output must be a number from 0 to 100 L/h');
});

test('the meter address is 1 to 247 and differs from the other addresses', () => {
  for (const v of [0, 248, 1.5, '3']) {
    assert.deepEqual(validateRoom({ ...good, meterAddress: v }),
      { error: 'Energy meter address must be a whole number from 1 to 247', field: 'meterAddress' });
  }
  assert.deepEqual(validateRoom({ ...good, trhAddress: 4, meterAddress: 4 }),
    { error: 'The devices in a room need different addresses', field: 'meterAddress' });
  assert.deepEqual(validateRoom({ ...good, acAddress: 7, meterAddress: 7 }).field, 'meterAddress');
});

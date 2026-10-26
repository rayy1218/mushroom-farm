import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoom } from '../server/rooms.js';

const good = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: null, co2Address: null, relayAddress: null, acAddress: null,
  meterAddress: null, dpAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050, dehumidifierW: 380, dehumidifierLday: 20, lightsW: 60, dehumidifier: false };

test('a valid room comes back clean', () => {
  assert.deepEqual(validateRoom(good), { room: good });
});

test('the name is trimmed', () => {
  assert.equal(validateRoom({ ...good, name: '  Room 1  ' }).room.name, 'Room 1');
});

test('unknown keys are dropped', () => {
  assert.deepEqual(validateRoom({ ...good, colour: 'red' }), { room: good });
});

test('the body must be a JSON object', () => {
  for (const body of [null, [], 'Room 1', 5, true]) {
    assert.deepEqual(validateRoom(body), { error: 'Body must be a JSON object' });
  }
});

test('the name is required', () => {
  for (const name of [undefined, '', '   ', 5, null]) {
    assert.deepEqual(validateRoom({ ...good, name }), { error: 'Name is required', field: 'name' });
  }
});

test('the name is at most 60 characters after trimming', () => {
  assert.equal(validateRoom({ ...good, name: 'x'.repeat(60) }).room.name, 'x'.repeat(60));
  assert.equal(validateRoom({ ...good, name: ` ${'x'.repeat(60)} ` }).room.name, 'x'.repeat(60));
  assert.deepEqual(validateRoom({ ...good, name: 'x'.repeat(61) }), {
    error: 'Name must be 60 characters or fewer',
    field: 'name',
  });
});

const limits = [
  ['length', 'Length', 0.5, 100],
  ['width', 'Width', 0.5, 100],
  ['height', 'Height', 0.5, 10],
];

for (const [field, label, min, max] of limits) {
  const error = { error: `${label} must be a number from ${min} to ${max} m`, field };

  test(`${field} accepts ${min} and ${max}`, () => {
    assert.equal(validateRoom({ ...good, [field]: min }).room[field], min);
    assert.equal(validateRoom({ ...good, [field]: max }).room[field], max);
  });

  test(`${field} rejects values outside ${min}–${max}`, () => {
    assert.deepEqual(validateRoom({ ...good, [field]: 0.49 }), error);
    assert.deepEqual(validateRoom({ ...good, [field]: max + 0.01 }), error);
    assert.deepEqual(validateRoom({ ...good, [field]: -1 }), error);
  });

  test(`${field} must be a finite JSON number`, () => {
    for (const value of [undefined, null, '4', '', NaN, Infinity, true]) {
      assert.deepEqual(validateRoom({ ...good, [field]: value }), error);
    }
  });
}

test('the first failing field wins, in the order name, length, width, height', () => {
  assert.equal(validateRoom({}).field, 'name');
  assert.equal(validateRoom({ name: 'A' }).field, 'length');
  assert.equal(validateRoom({ name: 'A', length: 1 }).field, 'width');
  assert.equal(validateRoom({ name: 'A', length: 1, width: 1 }).field, 'height');
});

const TRH_MSG = 'T/RH sensor address must be a whole number from 1 to 247';
const CO2_MSG = 'CO\u2082 sensor address must be a whole number from 1 to 247';

for (const [field, message] of [['trhAddress', TRH_MSG], ['co2Address', CO2_MSG]]) {
  test(`${field} accepts 1 and 247, null and missing`, () => {
    assert.equal(validateRoom({ ...good, [field]: 1 }).room[field], 1);
    assert.equal(validateRoom({ ...good, [field]: 247 }).room[field], 247);
    assert.equal(validateRoom({ ...good, [field]: null }).room[field], null);
    const { [field]: _omit, ...without } = good;
    assert.equal(validateRoom(without).room[field], null);
  });

  test(`${field} rejects anything but a whole number from 1 to 247`, () => {
    for (const value of [0, 248, -1, 1.5, '3', true, NaN, Infinity, [], {}]) {
      assert.deepEqual(validateRoom({ ...good, [field]: value }), { error: message, field });
    }
  });
}

test('the two addresses of one room must differ', () => {
  assert.deepEqual(validateRoom({ ...good, trhAddress: 5, co2Address: 5 }), {
    error: 'The two sensors need different addresses',
    field: 'co2Address',
  });
  assert.deepEqual(validateRoom({ ...good, trhAddress: 5, co2Address: 6 }).room.co2Address, 6);
});

test('address checks come after the sizes and before the same-room check', () => {
  assert.equal(validateRoom({ ...good, height: 0, trhAddress: 0 }).field, 'height');
  assert.equal(validateRoom({ ...good, trhAddress: 0, co2Address: 0 }).field, 'trhAddress');
  assert.equal(validateRoom({ ...good, trhAddress: 3, co2Address: 0 }).field, 'co2Address');
});

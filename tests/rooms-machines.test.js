import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoom } from '../server/rooms.js';

const good = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

const RELAY_MSG = 'Relay module address must be a whole number from 1 to 247';
const AC_MSG = 'Aircon gateway address must be a whole number from 1 to 247';

for (const [field, message] of [['relayAddress', RELAY_MSG], ['acAddress', AC_MSG]]) {
  test(`${field} accepts 1 and 247, null and missing`, () => {
    assert.equal(validateRoom({ ...good, [field]: 1 }).room[field], 1);
    assert.equal(validateRoom({ ...good, [field]: 247 }).room[field], 247);
    assert.equal(validateRoom({ ...good, [field]: null }).room[field], null);
    assert.equal(validateRoom(good).room[field], null);
  });

  test(`${field} rejects anything but a whole number from 1 to 247`, () => {
    for (const value of [0, 248, -1, 1.5, '3', true, NaN, Infinity, [], {}]) {
      assert.deepEqual(validateRoom({ ...good, [field]: value }), { error: message, field });
    }
  });
}

test('all four addresses of one room must differ; the later field is blamed', () => {
  const all = { trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };
  assert.deepEqual(validateRoom({ ...good, ...all }).room.acAddress, 4);
  const clash = 'The devices in a room need different addresses';
  assert.deepEqual(validateRoom({ ...good, ...all, relayAddress: 1 }), { error: clash, field: 'relayAddress' });
  assert.deepEqual(validateRoom({ ...good, ...all, relayAddress: 2 }), { error: clash, field: 'relayAddress' });
  assert.deepEqual(validateRoom({ ...good, ...all, acAddress: 3 }), { error: clash, field: 'acAddress' });
  assert.deepEqual(validateRoom({ ...good, ...all, acAddress: 1 }), { error: clash, field: 'acAddress' });
  assert.equal(validateRoom({ ...good, trhAddress: 5, co2Address: 5 }).error, 'The two sensors need different addresses');
  assert.equal(validateRoom({ ...good, relayAddress: null, acAddress: null }).room.acAddress, null);
});

test('machine address format errors come after the sensor ones and before clashes', () => {
  assert.equal(validateRoom({ ...good, co2Address: 0, relayAddress: 0 }).field, 'co2Address');
  assert.equal(validateRoom({ ...good, relayAddress: 0, acAddress: 0 }).field, 'relayAddress');
  assert.equal(validateRoom({ ...good, trhAddress: 1, relayAddress: 1, acAddress: 0 }).field, 'acAddress');
});

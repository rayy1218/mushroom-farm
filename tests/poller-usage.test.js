// The poller and the outdoor probe and the energy meters (iteration 7). A fake database and Modbus client.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../server/poller.js';
import { ModbusError } from '../server/modbus.js';

function fakeDb({ sensors = [], meters = [], outdoor = null } = {}) {
  const db = {
    outdoor,
    meters,
    sensors,
    readings: [],
    outdoorReadings: [],
    meterReadings: [],
    listWiredSensors: () => db.sensors,
    listWiredMachines: () => [],
    listMeters: () => db.meters,
    listFilterSensors: () => [],
    outdoorAddress: () => db.outdoor,
    addReading: (r) => db.readings.push(r),
    addOutdoorReading: (r) => db.outdoorReadings.push(r),
    addMeterReading: (r) => db.meterReadings.push(r),
  };
  return db;
}

// 230.5 W = 0x4366 0x8000, 12.25 kWh = 0x4144 0x0000
function fakeClient(answer = (unit, fn, start) => {
  if (start === 0x000c) return [0x4366, 0x8000];
  if (start === 0x0156) return [0x4144, 0x0000];
  return [265, 881];
}) {
  const calls = [];
  return {
    calls,
    async readRegisters(...args) {
      calls.push(args);
      return answer(...args);
    },
  };
}

test('the outdoor probe is polled first, as a T/RH probe, and stored without a room', async () => {
  const db = fakeDb({ sensors: [{ roomId: 1, kind: 'trh', address: 3 }], outdoor: 9 });
  const client = fakeClient();
  let clock = 100;
  await createPoller({ db, client, now: () => clock++ }).cycle();
  assert.deepEqual(client.calls, [[9, 4, 1, 2], [3, 4, 1, 2]]);
  assert.deepEqual(db.outdoorReadings, [{ address: 9, at: 100, ok: true, t: 26.5, rh: 88.1 }]);
  assert.equal(db.readings[0].at, 101);
});

test('the outdoor address is read every cycle: it can be set, changed and cleared while running', async () => {
  const db = fakeDb();
  const client = fakeClient();
  const poller = createPoller({ db, client });
  await poller.cycle();
  assert.deepEqual(client.calls, []);
  db.outdoor = 9;
  await poller.cycle();
  db.outdoor = 11;
  await poller.cycle();
  db.outdoor = null;
  await poller.cycle();
  assert.deepEqual(client.calls.map((c) => c[0]), [9, 11]);
  assert.deepEqual(db.outdoorReadings.map((r) => r.address), [9, 11]);
});

test('a failed outdoor poll is stored with its error and does not stop the cycle', async () => {
  const db = fakeDb({ sensors: [{ roomId: 1, kind: 'co2', address: 4 }], outdoor: 9 });
  const client = fakeClient((unit) => {
    if (unit === 9) throw new ModbusError('timeout');
    return [700];
  });
  await createPoller({ db, client, now: () => 5 }).cycle();
  assert.deepEqual(db.outdoorReadings, [{ address: 9, at: 5, ok: false, error: 'timeout' }]);
  assert.equal(db.readings.length, 1);
});

test('an outdoor poll alone starts the cycle (the controller sees its time)', async () => {
  const db = fakeDb({ sensors: [{ roomId: 1, kind: 'trh', address: 3 }], outdoor: 9 });
  const starts = [];
  let clock = 500;
  await createPoller({ db, client: fakeClient(), now: () => clock++, afterCycle: async (s) => { starts.push(s); } }).cycle();
  assert.deepEqual(starts, [500]);
});

test('a meter is read after its room\'s sensors: power (fn 4, 0x000C) then energy (fn 4, 0x0156)', async () => {
  const db = fakeDb({
    sensors: [{ roomId: 1, kind: 'trh', address: 3 }, { roomId: 2, kind: 'trh', address: 5 }],
    meters: [{ roomId: 1, address: 30 }, { roomId: 2, address: 31 }],
  });
  const client = fakeClient();
  let clock = 1;
  await createPoller({ db, client, now: () => clock++ }).cycle();
  assert.deepEqual(client.calls, [
    [3, 4, 1, 2], [30, 4, 0x000c, 2], [30, 4, 0x0156, 2],
    [5, 4, 1, 2], [31, 4, 0x000c, 2], [31, 4, 0x0156, 2],
  ]);
  assert.deepEqual(db.meterReadings, [
    { roomId: 1, address: 30, at: 2, ok: true, powerW: 230.5, energyKwh: 12.25 },
    { roomId: 2, address: 31, at: 4, ok: true, powerW: 230.5, energyKwh: 12.25 },
  ]);
});

test('a room with a meter and no sensor is still polled', async () => {
  const db = fakeDb({ meters: [{ roomId: 7, address: 30 }] });
  await createPoller({ db, client: fakeClient(), now: () => 9 }).cycle();
  assert.equal(db.meterReadings.length, 1);
  assert.equal(db.meterReadings[0].roomId, 7);
});

test('a failed read of either register makes a failed poll', async () => {
  for (const failing of [0x000c, 0x0156]) {
    const db = fakeDb({ meters: [{ roomId: 1, address: 30 }] });
    const client = fakeClient((unit, fn, start) => {
      if (start === failing) throw new ModbusError('timeout');
      return [0x4366, 0x8000];
    });
    await createPoller({ db, client, now: () => 3 }).cycle();
    assert.deepEqual(db.meterReadings, [{ roomId: 1, address: 30, at: 3, ok: false, error: 'timeout' }], String(failing));
  }
});

test('a reply that is not a number is a failed poll', async () => {
  const db = fakeDb({ meters: [{ roomId: 1, address: 30 }] });
  await createPoller({ db, client: fakeClient(() => [0x7fc0, 0]), now: () => 3 }).cycle();
  assert.deepEqual(db.meterReadings, [{ roomId: 1, address: 30, at: 3, ok: false, error: 'bad reply' }]);
});

test('a Modbus exception from the meter is stored as its text', async () => {
  const db = fakeDb({ meters: [{ roomId: 1, address: 30 }] });
  const client = fakeClient(() => { throw new ModbusError('exception', 2); });
  await createPoller({ db, client, now: () => 3 }).cycle();
  assert.equal(db.meterReadings[0].error, 'exception 2');
});

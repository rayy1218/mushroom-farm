// The poller and the filter pressure sensor (spec 2026-10-22-filter-design.md section 4). A fake database and Modbus client.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../server/poller.js';
import { ModbusError } from '../server/modbus.js';

function fakeDb({ sensors = [], meters = [], filters = [] } = {}) {
  const db = {
    filterReadings: [],
    readings: [],
    meterReadings: [],
    listWiredSensors: () => sensors,
    listWiredMachines: () => [],
    listMeters: () => meters,
    listFilterSensors: () => filters,
    outdoorAddress: () => null,
    addReading: (r) => db.readings.push(r),
    addMeterReading: (r) => db.meterReadings.push(r),
    addFilterReading: (r) => db.filterReadings.push(r),
  };
  return db;
}

// The filter sensor (address 7) answers `pa` registers; the meter 0x4366 0x8000 (230.5 W) and 0x4144 0x0000 (12.25 kWh).
function fakeClient(pa = [553]) {
  const calls = [];
  return {
    calls,
    async readRegisters(unit, fn, start, qty) {
      calls.push([unit, fn, start, qty]);
      if (unit === 7) {
        if (pa instanceof Error) throw pa;
        return pa;
      }
      if (start === 0x000c) return [0x4366, 0x8000];
      if (start === 0x0156) return [0x4144, 0x0000];
      return [265, 881];
    },
  };
}

test('the filter sensor is read after the room\'s T/RH and CO2 sensors and before its meter: function 4, register 0, Pa × 10', async () => {
  const db = fakeDb({
    sensors: [{ roomId: 1, kind: 'trh', address: 3 }, { roomId: 1, kind: 'co2', address: 4 }],
    meters: [{ roomId: 1, address: 5 }],
    filters: [{ roomId: 1, address: 7 }],
  });
  const client = fakeClient();
  let clock = 100;
  await createPoller({ db, client, now: () => clock++ }).cycle();
  assert.deepEqual(client.calls.map((c) => c[0]), [3, 4, 7, 5, 5]);
  assert.deepEqual(client.calls[2], [7, 4, 0, 1]);
  assert.deepEqual(db.filterReadings, [{ roomId: 1, address: 7, at: 102, ok: true, pa: 55.3 }]);
});

test('the register is signed: a small negative pressure (sensor zero drift) is kept', async () => {
  const db = fakeDb({ filters: [{ roomId: 2, address: 7 }] });
  await createPoller({ db, client: fakeClient([0xfffb]), now: () => 5 }).cycle();
  assert.deepEqual(db.filterReadings, [{ roomId: 2, address: 7, at: 5, ok: true, pa: -0.5 }]);
});

test('outside −50 to 2000 Pa the poll fails with "Out of range" and the value is kept', async () => {
  for (const [regs, pa] of [[[20001], 2000.1], [[0xfe0b], -50.1]]) {
    const db = fakeDb({ filters: [{ roomId: 1, address: 7 }] });
    await createPoller({ db, client: fakeClient(regs), now: () => 5 }).cycle();
    assert.deepEqual(db.filterReadings, [{ roomId: 1, address: 7, at: 5, ok: false, pa, error: 'Out of range' }]);
  }
  const db = fakeDb({ filters: [{ roomId: 1, address: 7 }] });
  await createPoller({ db, client: fakeClient([20000]), now: () => 5 }).cycle();
  assert.equal(db.filterReadings[0].ok, true, '2000 Pa itself is in range');
});

test('a failed read is a failed poll with the Modbus error', async () => {
  const db = fakeDb({ filters: [{ roomId: 1, address: 7 }] });
  await createPoller({ db, client: fakeClient(new ModbusError('Timeout')), now: () => 5 }).cycle();
  assert.deepEqual(db.filterReadings, [{ roomId: 1, address: 7, at: 5, ok: false, error: 'Timeout' }]);
});

test('a room with only a filter sensor is polled, rooms in id order', async () => {
  const db = fakeDb({ sensors: [{ roomId: 3, kind: 'trh', address: 3 }], filters: [{ roomId: 1, address: 7 }] });
  const client = fakeClient();
  await createPoller({ db, client }).cycle();
  assert.deepEqual(client.calls.map((c) => c[0]), [7, 3]);
});

// Each gateway's health after a poll cycle (spec 2026-11-12-alarms-triage-design.md 4): down when every device read through it
// got no answer from the gateway (no connection, timeout); an exception or a bad reply means it answered.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../server/poller.js';
import { ModbusError } from '../server/modbus.js';

function fakeDb({ sensors = [], machines = [], outdoor = null }) {
  return {
    listWiredSensors: () => sensors, listWiredMachines: () => machines, listMeters: () => [], listFilterSensors: () => [],
    outdoorAddress: () => outdoor, addReading() {}, addOutdoorReading() {},
  };
}
const client = (fail) => ({
  async readRegisters(unit) { if (fail(unit)) throw fail(unit); return [250, 880]; },
  async readBits() { throw new ModbusError('timeout'); },
});

test('the health of each gateway reaches afterCycle with its rooms; down only when nothing answered', async () => {
  const sensors = [
    { roomId: 1, kind: 'trh', address: 1, gateway: null },
    { roomId: 2, kind: 'trh', address: 1, gateway: '127.0.0.1:1512' },
    { roomId: 3, kind: 'trh', address: 1, gateway: '127.0.0.1:1513' },
    { roomId: 4, kind: 'trh', address: 2, gateway: '127.0.0.1:1514' },
    { roomId: 4, kind: 'co2', address: 3, gateway: '127.0.0.1:1514' },
  ];
  const machines = [{ roomId: 2, kind: 'relay', address: 3, outputs: 4, gateway: '127.0.0.1:1512' }];
  const errors = {
    null: () => null,
    '127.0.0.1:1512': () => new ModbusError('no connection'), // the relay's readBits times out too: down
    '127.0.0.1:1513': () => new ModbusError('exception', 11), // the gateway answered: up
    '127.0.0.1:1514': (unit) => (unit === 2 ? new ModbusError('timeout') : null), // one answer: up
  };
  let seen = null;
  const poller = createPoller({
    db: fakeDb({ sensors, machines, outdoor: 9 }),
    clients: { forRoom: (g) => client(errors[g]) },
    afterCycle: (start, gateways) => { seen = gateways; },
  });
  await poller.cycle();
  const view = Object.fromEntries(seen.map((g) => [g.gateway, [g.roomIds, g.polls, g.failed, g.down]]));
  assert.deepEqual(view, {
    null: [[1], 2, 0, false], // the outdoor probe and room 1's probe
    '127.0.0.1:1512': [[2], 2, 2, true],
    '127.0.0.1:1513': [[3], 1, 0, false],
    '127.0.0.1:1514': [[4], 2, 1, false],
  });
});

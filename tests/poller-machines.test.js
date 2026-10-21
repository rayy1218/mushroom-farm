// The machine part of server/poller.js: relay module and aircon gateway polls kept in memory.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../server/poller.js';
import { ModbusError } from '../server/modbus.js';

function fakeDb({ sensors = [], machines = [] } = {}) {
  const readings = [];
  const db = {
    readings,
    sensors,
    machines,
    listWiredSensors: () => db.sensors,
    listWiredMachines: () => db.machines,
    listMeters: () => [],
    outdoorAddress: () => null,
    addReading: (r) => readings.push(r),
  };
  return db;
}

// answer: (call, unit, fn, start, qty) → value, or throws.
function fakeClient(answer) {
  const calls = [];
  return {
    calls,
    async readRegisters(unit, fn, start, qty) {
      calls.push(['regs', unit, fn, start, qty]);
      return answer('regs', unit, fn, start, qty);
    },
    async readBits(unit, fn, start, qty) {
      calls.push(['bits', unit, fn, start, qty]);
      return answer('bits', unit, fn, start, qty);
    },
  };
}

const normal = (kind, unit, fn) => {
  if (kind === 'bits') return fn === 1 ? [true, false, true, false] : [true, false, false, false];
  if (fn === 3) return [1, 1, 235, 2]; // power on, heat, 23.5, high
  if (fn === 4) return [248, 0];
  return [265, 881];
};

const relay = { roomId: 1, kind: 'relay', address: 10 };
const ac = { roomId: 1, kind: 'ac', address: 20 };

test('a relay module is polled with fn 1 then fn 2, five bits each', async () => {
  const client = fakeClient(normal);
  let clock = 1000;
  const poller = createPoller({ db: fakeDb({ machines: [relay] }), client, now: () => clock++ });
  await poller.cycle();
  assert.deepEqual(client.calls, [['bits', 10, 1, 0, 5], ['bits', 10, 2, 0, 5]]);
  assert.deepEqual(poller.machineState(1).relay, {
    address: 10,
    polls: [{ at: 1000, ok: true, coils: [true, false, true, false], inputs: [true, false, false, false] }],
  });
  assert.deepEqual(poller.machineState(1).ac, { address: null, polls: [] });
});

test('an aircon gateway is polled with fn 3 (4 registers) then fn 4 (2 registers)', async () => {
  const client = fakeClient(normal);
  const poller = createPoller({ db: fakeDb({ machines: [ac] }), client, now: () => 7 });
  await poller.cycle();
  assert.deepEqual(client.calls, [['regs', 20, 3, 0, 4], ['regs', 20, 4, 0, 2]]);
  assert.deepEqual(poller.machineState(1).ac, {
    address: 20,
    polls: [{ at: 7, ok: true, power: true, mode: 'heat', setpoint: 23.5, fan: 'high', roomT: 24.8, error: 0 }],
  });
});

test('aircon codes: every mode and fan, power off, a negative room T, an error code', async () => {
  const modes = ['cool', 'heat', 'dry', 'fan'];
  const fans = ['auto', 'low', 'high'];
  for (let i = 0; i < 4; i++) {
    const client = fakeClient((kind, unit, fn) => (fn === 3 ? [0, i, 160, i % 3] : [0xffc9, 17]));
    const poller = createPoller({ db: fakeDb({ machines: [ac] }), client, now: () => 1 });
    await poller.cycle();
    assert.deepEqual(poller.machineState(1).ac.polls[0],
      { at: 1, ok: true, power: false, mode: modes[i], setpoint: 16, fan: fans[i % 3], roomT: -5.5, error: 17 });
  }
});

test('codes the farm does not know become null instead of failing the poll', async () => {
  const client = fakeClient((kind, unit, fn) => (fn === 3 ? [2, 9, 250, 7] : [250, 0]));
  const poller = createPoller({ db: fakeDb({ machines: [ac] }), client, now: () => 1 });
  await poller.cycle();
  const poll = poller.machineState(1).ac.polls[0];
  assert.equal(poll.ok, true);
  assert.deepEqual([poll.power, poll.mode, poll.fan], [null, null, null]);
});

test('machines are polled after the sensors of the same room, rooms in id order', async () => {
  const db = fakeDb({
    sensors: [{ roomId: 1, kind: 'trh', address: 3 }, { roomId: 1, kind: 'co2', address: 4 }, { roomId: 3, kind: 'trh', address: 5 }],
    machines: [{ roomId: 1, kind: 'relay', address: 10 }, { roomId: 1, kind: 'ac', address: 20 }, { roomId: 2, kind: 'ac', address: 21 },
      { roomId: 3, kind: 'relay', address: 11 }],
  });
  const client = fakeClient(normal);
  await createPoller({ db, client }).cycle();
  assert.deepEqual(client.calls.map(([, unit, fn]) => `${unit}/${fn}`),
    ['3/4', '4/3', '10/1', '10/2', '20/3', '20/4', '21/3', '21/4', '5/4', '11/1', '11/2']);
  assert.equal(db.readings.length, 3, 'machine polls are not stored in the database');
});

test('only the last two polls are kept, oldest first', async () => {
  let n = 0;
  const client = fakeClient((kind) => (kind === 'bits' ? [n % 2 === 0, false, false, false] : []));
  let clock = 0;
  const poller = createPoller({ db: fakeDb({ machines: [relay] }), client, now: () => clock++ });
  for (let i = 0; i < 3; i++) {
    await poller.cycle();
    n++;
  }
  // each cycle makes two reads (n is bumped once per cycle, so coils are true on cycles 0 and 2)
  const polls = poller.machineState(1).relay.polls;
  assert.equal(polls.length, 2);
  assert.deepEqual(polls.map((p) => p.at), [1, 2]);
  assert.deepEqual(polls.map((p) => p.coils[0]), [false, true]);
});

test('a failed poll is kept with its error and a later one succeeds', async () => {
  const errors = [new ModbusError('timeout'), new ModbusError('no connection'), new ModbusError('exception', 2), new Error('odd')];
  for (const err of errors) {
    let fail = true;
    const client = fakeClient((kind, unit, fn) => { if (fail) throw err; return normal(kind, unit, fn); });
    let clock = 0;
    const poller = createPoller({ db: fakeDb({ machines: [relay] }), client, now: () => clock++ });
    await poller.cycle();
    assert.deepEqual(poller.machineState(1).relay.polls, [
      { at: 0, ok: false, error: err instanceof ModbusError ? err.message : 'bad reply' },
    ]);
    assert.equal(client.calls.length, 1, 'fn 2 is not asked after fn 1 failed');
    fail = false;
    await poller.cycle();
    const polls = poller.machineState(1).relay.polls;
    assert.deepEqual(polls.map((p) => p.ok), [false, true]);
  }
});

test('a failure in the second read fails the whole poll', async () => {
  const client = fakeClient((kind, unit, fn) => { if (fn === 4 || fn === 2) throw new ModbusError('timeout'); return normal(kind, unit, fn); });
  const poller = createPoller({ db: fakeDb({ machines: [relay, ac] }), client, now: () => 1 });
  await poller.cycle();
  assert.deepEqual(poller.machineState(1).relay.polls, [{ at: 1, ok: false, error: 'timeout' }]);
  assert.deepEqual(poller.machineState(1).ac.polls, [{ at: 1, ok: false, error: 'timeout' }]);
});

test('a failing relay module does not stop the other devices', async () => {
  const client = fakeClient((kind, unit, fn) => { if (unit === 10) throw new ModbusError('timeout'); return normal(kind, unit, fn); });
  const poller = createPoller({ db: fakeDb({ machines: [relay, ac] }), client, now: () => 1 });
  await poller.cycle();
  assert.equal(poller.machineState(1).relay.polls[0].ok, false);
  assert.equal(poller.machineState(1).ac.polls[0].ok, true);
});

test('the time of a machine poll is taken before the request', async () => {
  let clock = 5;
  const client = fakeClient((kind, unit, fn) => { clock = 99; return normal(kind, unit, fn); });
  const poller = createPoller({ db: fakeDb({ machines: [relay] }), client, now: () => clock });
  await poller.cycle();
  assert.equal(poller.machineState(1).relay.polls[0].at, 5);
});

test('a changed address starts with no polls; an unwired device and a deleted room are forgotten', async () => {
  const db = fakeDb({ machines: [relay, ac] });
  const poller = createPoller({ db, client: fakeClient(normal), now: () => 1 });
  await poller.cycle();
  await poller.cycle();
  assert.equal(poller.machineState(1).relay.polls.length, 2);

  db.machines = [{ ...relay, address: 11 }]; // relay re-wired, ac unwired
  await poller.cycle();
  assert.deepEqual(poller.machineState(1).relay.address, 11);
  assert.equal(poller.machineState(1).relay.polls.length, 1);
  assert.deepEqual(poller.machineState(1).ac, { address: null, polls: [] });

  db.machines = []; // room deleted
  await poller.cycle();
  assert.deepEqual(poller.machineState(1), { relay: { address: null, polls: [] }, ac: { address: null, polls: [] } });
  assert.deepEqual(poller.machineState(99), { relay: { address: null, polls: [] }, ac: { address: null, polls: [] } });
});

test('machineState returns copies: changing them does not change the poller', async () => {
  const poller = createPoller({ db: fakeDb({ machines: [relay] }), client: fakeClient(normal), now: () => 1 });
  await poller.cycle();
  const state = poller.machineState(1);
  state.relay.polls.length = 0;
  state.relay.address = 5;
  assert.equal(poller.machineState(1).relay.polls.length, 1);
  assert.equal(poller.machineState(1).relay.address, 10);
});

test('stop is honoured between devices', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const client = fakeClient(async (kind, unit, fn) => { await gate; return normal(kind, unit, fn); });
  const poller = createPoller({ db: fakeDb({ machines: [relay, ac] }), client });
  const cycle = poller.cycle();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const stopping = poller.stop();
  release();
  await stopping;
  await cycle;
  assert.deepEqual(client.calls.map((c) => c[1]), [10, 10], 'the aircon gateway was not polled after stop');
  assert.equal(poller.machineState(1).relay.polls.length, 1, 'the poll in flight finished');
});

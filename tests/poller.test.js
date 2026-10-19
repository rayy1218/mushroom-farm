import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPoller } from '../server/poller.js';
import { ModbusError } from '../server/modbus.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function fakeDb(sensors) {
  const readings = [];
  return { readings, listWiredSensors: () => sensors, listWiredMachines: () => [], addReading: (r) => readings.push(r) };
}

// answers: (unit, fn, start, qty) → registers, or throws.
function fakeClient(answer) {
  const calls = [];
  return {
    calls,
    async readRegisters(...args) {
      calls.push(args);
      return answer(...args);
    },
  };
}

const wired = [
  { roomId: 1, kind: 'trh', address: 3 },
  { roomId: 1, kind: 'co2', address: 4 },
  { roomId: 2, kind: 'trh', address: 5 },
];

test('one cycle polls every wired sensor in order and writes one reading each', async () => {
  const db = fakeDb(wired);
  const client = fakeClient((unit, fn) => (fn === 4 ? [265, 881] : [950]));
  let clock = 1000;
  const poller = createPoller({ db, client, now: () => clock++ });
  await poller.cycle();
  assert.deepEqual(client.calls, [[3, 4, 1, 2], [4, 3, 0, 1], [5, 4, 1, 2]]);
  assert.deepEqual(db.readings, [
    { roomId: 1, kind: 'trh', address: 3, at: 1000, ok: true, t: 26.5, rh: 88.1 },
    { roomId: 1, kind: 'co2', address: 4, at: 1001, ok: true, co2: 950 },
    { roomId: 2, kind: 'trh', address: 5, at: 1002, ok: true, t: 26.5, rh: 88.1 },
  ]);
});

test('a negative temperature is read as signed 16-bit', async () => {
  const db = fakeDb([wired[0]]);
  const poller = createPoller({ db, client: fakeClient(() => [0xffc9, 1000]) });
  await poller.cycle();
  assert.equal(db.readings[0].t, -5.5);
  assert.equal(db.readings[0].rh, 100);
});

test('the time of a reading is taken before the request', async () => {
  const db = fakeDb([wired[0]]);
  let clock = 5;
  const client = fakeClient(() => { clock = 99; return [1, 2]; });
  await createPoller({ db, client, now: () => clock }).cycle();
  assert.equal(db.readings[0].at, 5);
});

test('failures are stored with their error text and do not stop the cycle', async () => {
  const errors = [
    new ModbusError('timeout'),
    new ModbusError('no connection'),
    new ModbusError('exception', 2),
    new ModbusError('bad reply'),
    new Error('something else'),
  ];
  for (const err of errors) {
    const db = fakeDb(wired);
    let n = 0;
    const client = fakeClient(() => { if (n++ === 0) throw err; return [950]; });
    await createPoller({ db, client }).cycle();
    const text = err instanceof ModbusError ? err.message : 'bad reply';
    assert.deepEqual({ ok: db.readings[0].ok, error: db.readings[0].error }, { ok: false, error: text });
    assert.equal(db.readings[0].t, undefined);
    assert.equal(db.readings.length, 3);
    assert.equal(db.readings[1].ok, true);
  }
  assert.equal(new ModbusError('exception', 2).message, 'exception 2');
});

test('start runs a cycle now and then every interval', async () => {
  const db = fakeDb([wired[0]]);
  const poller = createPoller({ db, client: fakeClient(() => [1, 2]), intervalMs: 40, now: Date.now });
  poller.start();
  const deadline = Date.now() + 2000;
  while (db.readings.length < 3 && Date.now() < deadline) await sleep(5);
  await poller.stop();
  assert.ok(db.readings.length >= 3, `only ${db.readings.length} readings in 2 s`);
  for (let i = 1; i < db.readings.length; i++) {
    assert.ok(db.readings[i].at - db.readings[i - 1].at >= 35, `gap ${i}: ${db.readings[i].at - db.readings[i - 1].at} ms`);
  }
});

test('cycles never overlap, even when slower than the interval', async () => {
  const db = fakeDb([wired[0]]);
  let active = 0;
  let max = 0;
  const client = fakeClient(async () => {
    active++;
    max = Math.max(max, active);
    await sleep(60);
    active--;
    return [1, 2];
  });
  const poller = createPoller({ db, client, intervalMs: 20 });
  poller.start();
  poller.cycle(); // a manual cycle while one runs joins it
  await sleep(200);
  await poller.stop();
  assert.equal(max, 1);
  assert.ok(db.readings.length >= 2);
});

test('stop waits for the running cycle and nothing is written afterwards', async () => {
  const db = fakeDb(wired);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const client = fakeClient(async () => { await gate; return [1, 2]; });
  const poller = createPoller({ db, client, intervalMs: 10 });
  poller.start();
  await sleep(20);
  let stopped = false;
  const stopping = poller.stop().then(() => { stopped = true; });
  await sleep(30);
  assert.equal(stopped, false, 'stop is still waiting for the request in flight');
  release();
  await stopping;
  const written = db.readings.length;
  await sleep(60);
  assert.equal(db.readings.length, written);
  assert.equal(client.calls.length, 1, 'the cycle stopped after the request that was in flight');
});

test('stop before any cycle and stop twice are harmless', async () => {
  const db = fakeDb(wired);
  const poller = createPoller({ db, client: fakeClient(() => [1, 2]) });
  await poller.stop();
  await poller.stop();
  poller.start(); // a stopped poller stays stopped
  await sleep(20);
  assert.equal(db.readings.length, 0);
});

test('a database error in one cycle does not stop the poller', async () => {
  let fail = true;
  const readings = [];
  const db = {
    listWiredSensors: () => [wired[0]],
    listWiredMachines: () => [],
    addReading: (r) => { if (fail) { fail = false; throw new Error('disk full'); } readings.push(r); },
  };
  const poller = createPoller({ db, client: fakeClient(() => [1, 2]), intervalMs: 20, log: () => {} });
  poller.start();
  await sleep(100);
  await poller.stop();
  assert.ok(readings.length >= 1);
});

// A scheduler and a clock the test moves by hand: no real waiting.
function manualTime() {
  const time = { now: 0, timers: [], nextId: 1 };
  time.clock = () => time.now;
  time.setTimer = (fn, delay) => { const t = { id: time.nextId++, fn, delay }; time.timers.push(t); return t; };
  time.clearTimer = (t) => { time.timers = time.timers.filter((x) => x !== t); };
  return time;
}

// A client whose requests wait until the test lets them go.
function gatedClient() {
  const gates = [];
  return {
    gates,
    async readRegisters() {
      await new Promise((resolve) => gates.push(resolve));
      return [1, 2];
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

test('setIntervalMs while waiting moves the next cycle to the new interval counted from the cycle start', async () => {
  const time = manualTime();
  const db = fakeDb([wired[0]]);
  const poller = createPoller({ db, client: fakeClient(() => [1, 2]), intervalMs: 5000, setTimer: time.setTimer, clearTimer: time.clearTimer, clock: time.clock });
  poller.start();
  await settle();
  assert.deepEqual(time.timers.map((t) => t.delay), [5000]);
  time.now = 1000; // 1 s into the wait
  poller.setIntervalMs(2000);
  assert.deepEqual(time.timers.map((t) => t.delay), [1000], 'one timer only, 2 s after the cycle began');
  poller.setIntervalMs(60000);
  assert.deepEqual(time.timers.map((t) => t.delay), [59000]);
  await poller.stop();
  assert.equal(time.timers.length, 0);
});

test('setIntervalMs to an interval already over starts the next cycle at once', async () => {
  const time = manualTime();
  const db = fakeDb([wired[0]]);
  const poller = createPoller({ db, client: fakeClient(() => [1, 2]), intervalMs: 60000, setTimer: time.setTimer, clearTimer: time.clearTimer, clock: time.clock });
  poller.start();
  await settle();
  time.now = 10000;
  poller.setIntervalMs(5000);
  assert.deepEqual(time.timers.map((t) => t.delay), [0]);
  await poller.stop();
});

test('setIntervalMs during a cycle applies when the cycle ends, and never overlaps', async () => {
  const time = manualTime();
  const db = fakeDb([wired[0]]);
  const client = gatedClient();
  const poller = createPoller({ db, client, intervalMs: 60000, setTimer: time.setTimer, clearTimer: time.clearTimer, clock: time.clock });
  poller.start();
  await settle();
  assert.equal(client.gates.length, 1, 'the cycle is waiting for the sensor');
  time.now = 8000;
  poller.setIntervalMs(5000); // the interval is already over: due at once, but after this cycle
  assert.deepEqual(time.timers, [], 'no second timer while the cycle runs');
  client.gates.shift()();
  await settle();
  assert.deepEqual(time.timers.map((t) => t.delay), [0], 'the next cycle is due as soon as this one ended');
  assert.equal(db.readings.length, 1);
  await poller.stop();
});

test('setIntervalMs during a cycle with a longer interval waits the remainder after the cycle', async () => {
  const time = manualTime();
  const db = fakeDb([wired[0]]);
  const client = gatedClient();
  const poller = createPoller({ db, client, intervalMs: 1000, setTimer: time.setTimer, clearTimer: time.clearTimer, clock: time.clock });
  poller.start();
  await settle();
  time.now = 300;
  poller.setIntervalMs(10000);
  client.gates.shift()();
  await settle();
  assert.deepEqual(time.timers.map((t) => t.delay), [9700]);
  await poller.stop();
});

test('setIntervalMs before start and after stop is harmless', async () => {
  const time = manualTime();
  const db = fakeDb([wired[0]]);
  const poller = createPoller({ db, client: fakeClient(() => [1, 2]), intervalMs: 5000, setTimer: time.setTimer, clearTimer: time.clearTimer, clock: time.clock });
  poller.setIntervalMs(3000);
  assert.deepEqual(time.timers, []);
  poller.start();
  await settle();
  assert.deepEqual(time.timers.map((t) => t.delay), [3000]);
  await poller.stop();
  poller.setIntervalMs(1000);
  assert.deepEqual(time.timers, []);
});

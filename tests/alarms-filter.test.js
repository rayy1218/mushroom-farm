// The filter alarms (server/alarms.js, spec 2026-10-22-filter-design.md section 5) and the controller's filter input.
// filterDirty and filterMissing add up 10 min of intake-running time with counted readings, across exchanges.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createAlarms } from '../server/alarms.js';
import { createController } from '../server/controller.js';
import { FILTER_KEYS } from '../server/filter.js';

const S = 1000;
const MIN = 60_000;
const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, exchangeMaxMin: 10 };
// countFrom 0: the intake has been past its spin-up all along.
const FILTER = { sensor: true, pa: 60, countFrom: 0, cleanPa: 40, finalPa: 80, changeDays: 30, daysInUse: 3 };

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 });
  let clock = 1_000_000;
  const alarms = createAlarms({ db, now: () => clock });
  return {
    db, alarms,
    tick(ms, filter) {
      clock += ms;
      alarms.evaluate(room, {
        readings: { t: 22, rh: 90, co2: 650 }, bands, faults: { trh: null, co2: null }, cappedInRow: 0, machines: null,
        filter: { ...FILTER, ...filter },
      });
    },
    // n evaluations a minute apart with this filter input
    minutes(n, filter) {
      for (let i = 0; i < n; i++) this.tick(MIN, filter);
    },
    active: () => db.activeAlarms(room.id).map((a) => [a.key, a.level, a.text]),
    keys: () => db.activeAlarms(room.id).map((a) => a.key),
    room,
  };
}

test('no filter alarm for a filter in use 3 days at 60 Pa', (t) => {
  const s = setup(t);
  s.minutes(20);
  assert.deepEqual(s.active(), []);
});

test('filterDue: at once when the days in use reach the interval; not with no reminder; cleared when not due', (t) => {
  const s = setup(t);
  s.tick(0, { daysInUse: 29.99 });
  assert.deepEqual(s.active(), []);
  s.tick(0, { daysInUse: 32.4 });
  assert.deepEqual(s.active(), [['filterDue', 'warning', 'Filter in use 32 days, change every 30']]);
  s.tick(MIN, { daysInUse: 32.5, changeDays: 40 }); // the interval made longer
  assert.deepEqual(s.active(), []);
  s.tick(MIN, { daysInUse: 400, changeDays: 0 });
  assert.deepEqual(s.active(), []);
});

test('filterDirty: 10 min of counted time at or above the change pressure; clears below change pressure − 10', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 85 }); // the first evaluation has no time before it
  s.minutes(9, { pa: 85 });
  assert.deepEqual(s.active(), []);
  s.minutes(1, { pa: 85 });
  assert.deepEqual(s.active(), [['filterDirty', 'warning', 'Filter pressure 85 Pa, at or above the change pressure 80']]);
  s.minutes(1, { pa: 71 });
  assert.equal(s.active().length, 1, 'inside the hysteresis');
  s.minutes(1, { pa: 69.9 });
  assert.deepEqual(s.active(), []);
});

test('filterMissing: 10 min of counted time below half the clean pressure; clears at 0.6 × clean', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 12 });
  s.minutes(10, { pa: 12 });
  assert.deepEqual(s.active(), [['filterMissing', 'warning', 'Filter pressure 12 Pa: filter missing or torn, or the sensor tube is off']]);
  s.minutes(1, { pa: 23 });
  assert.equal(s.active().length, 1);
  s.minutes(1, { pa: 24 });
  assert.deepEqual(s.active(), []);
});

test('no counted reading pauses the count: it survives the gap and goes on after it; an active alarm stays', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 85 });
  s.minutes(5, { pa: 85 });
  s.tick(S, { pa: null }); // one evaluation without a reading (a failed poll)
  s.tick(20 * MIN, { pa: null, countFrom: null }); // the intake off for a long time
  s.minutes(4, { pa: 85 });
  assert.deepEqual(s.active(), [], '9 min so far: the time without a reading did not count');
  s.minutes(1, { pa: 85 });
  assert.deepEqual(s.keys(), ['filterDirty'], 'the 5 min before the gap still counted');
  s.minutes(1, { pa: null });
  assert.deepEqual(s.keys(), ['filterDirty'], 'no reading: the alarm stays');
  const m = setup(t);
  m.tick(0, { pa: 10 });
  m.minutes(9, { pa: 10 });
  m.tick(5 * S, { pa: null });
  m.minutes(1, { pa: 10 });
  assert.deepEqual(m.keys(), ['filterMissing']);
});

test('a reading in the release range starts the count again; one in the hysteresis only pauses it', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 85 });
  s.minutes(9, { pa: 85 });
  s.minutes(1, { pa: 75 }); // between 70 and 80: neither counts nor resets
  assert.deepEqual(s.active(), []);
  s.minutes(1, { pa: 85 });
  assert.deepEqual(s.keys(), ['filterDirty']);
  const r = setup(t);
  r.tick(0, { pa: 85 });
  r.minutes(9, { pa: 85 });
  r.minutes(1, { pa: 65 }); // below 70: the count starts again
  r.minutes(9, { pa: 85 });
  assert.deepEqual(r.active(), []);
  r.minutes(1, { pa: 85 });
  assert.deepEqual(r.keys(), ['filterDirty']);
});

test('only the time since the intake passed its spin-up counts', (t) => {
  const s = setup(t);
  s.tick(0, { pa: null, countFrom: null });
  s.tick(5 * MIN, { pa: 85, countFrom: 1_000_000 + 5 * MIN - 2 * MIN }); // past the spin-up 2 min ago: 2 of the 5 min count
  s.minutes(7, { pa: 85, countFrom: 1_000_000 + 3 * MIN });
  assert.deepEqual(s.active(), [], '9 min');
  s.minutes(1, { pa: 85, countFrom: 1_000_000 + 3 * MIN });
  assert.deepEqual(s.keys(), ['filterDirty']);
});

test('without a sensor the pressure alarms clear and their counts go; the reminder still works', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 85 });
  s.minutes(10, { pa: 85 });
  s.tick(MIN, { sensor: false, pa: null, daysInUse: 31 });
  assert.deepEqual(s.keys(), ['filterDue']);
  s.tick(MIN, { pa: 85, daysInUse: 31 });
  assert.deepEqual(s.keys(), ['filterDue'], 'the count starts from nothing');
});

test('reset drops the counts of the given keys', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 85 });
  s.minutes(9, { pa: 85 });
  s.alarms.reset(s.room.id, FILTER_KEYS);
  s.minutes(1, { pa: 85 });
  assert.deepEqual(s.active(), [], 'the count started again');
  s.minutes(9, { pa: 85 });
  assert.deepEqual(s.keys(), ['filterDirty']);
});

test('an evaluate without filter input raises no filter alarm (an older caller)', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 });
  createAlarms({ db, now: () => 0 }).evaluate(room, {
    readings: { t: 22, rh: 90, co2: 650 }, bands, faults: { trh: null, co2: null }, cappedInRow: 0, machines: null,
  });
  assert.deepEqual(db.activeAlarms(room.id), []);
});

test('the controller: 3-min exchanges every 15 min at the change pressure raise filterDirty after the 4th exchange', async (t) => {
  // The intake runs 3 min of every 15; its readings count after the 60 s spin-up, so each exchange adds 2 min:
  // 8 min after the 4th exchange, 10 min at the end of the 5th. The sensor reads about 0 while the intake is off.
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = 0;
  const id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, dpAddress: 7 }, 0).id;
  const machines = { get: () => null, async command() {}, forget() {} };
  const controller = createController({ db, machines, now: () => clock });
  const STEP = 5 * S;
  let intake = false;
  let raised = null; // { exchange, s } of the first evaluation with filterDirty
  let afterFour = null;
  // exchange k (1 to 5) runs the intake from k × 15 min to k × 15 min + 3 min
  for (clock = STEP; clock <= 5 * 15 * MIN + 3 * MIN; clock += STEP) {
    const exchange = Math.floor(clock / (15 * MIN));
    const start = exchange * 15 * MIN;
    // the poll, then the controller's run (it evaluates the alarms before it sends commands), then the commands
    db.addFilterReading({ roomId: id, address: 7, at: clock, ok: true, pa: intake ? 85 : 0.4 });
    await controller.run(clock);
    if (!raised && db.activeAlarms(id).some((a) => a.key === 'filterDirty')) raised = { exchange, s: (clock - start) / S };
    if (exchange >= 1 && clock === start) { intake = true; db.logMachine(id, 'intake', { on: true }, 'auto', clock); }
    if (exchange >= 1 && clock === start + 3 * MIN) {
      intake = false;
      db.logMachine(id, 'intake', { on: false }, 'auto', clock);
      if (exchange === 4) afterFour = db.activeAlarms(id).map((x) => x.key);
    }
  }
  assert.deepEqual(afterFour, [], 'not after 4 exchanges (8 min)');
  assert.deepEqual(raised, { exchange: 5, s: 180 }, 'raised at the end of the 5th exchange (10 min)');
  controller.filterChanged(id); // the counts go; the API clears the alarm itself
});

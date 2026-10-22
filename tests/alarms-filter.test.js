// The filter alarms (server/alarms.js, spec 2026-10-22-filter-design.md section 5) and the controller's filter input.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createAlarms } from '../server/alarms.js';
import { createController } from '../server/controller.js';
import { FILTER_KEYS } from '../server/filter.js';

const MIN = 60_000;
const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, exchangeMaxMin: 10 };
const FILTER = { sensor: true, pa: 80, cleanPa: 40, finalPa: 150, changeDays: 30, daysInUse: 3 };

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
    active: () => db.activeAlarms(room.id).map((a) => [a.key, a.level, a.text]),
    room,
  };
}

test('no filter alarm for a filter in use 3 days at 80 Pa', (t) => {
  const s = setup(t);
  for (let i = 0; i < 20; i++) s.tick(MIN);
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

test('filterDirty: at the change pressure for 10 min; clears below change pressure − 10', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 150 });
  s.tick(9 * MIN, { pa: 162 });
  assert.deepEqual(s.active(), []);
  s.tick(MIN, { pa: 162 });
  assert.deepEqual(s.active(), [['filterDirty', 'warning', 'Filter pressure 162 Pa, at or above the change pressure 150']]);
  s.tick(MIN, { pa: 141 });
  assert.equal(s.active().length, 1, 'inside the hysteresis');
  s.tick(MIN, { pa: 139.9 });
  assert.deepEqual(s.active(), []);
});

test('filterMissing: below half the clean pressure for 10 min; clears at 0.6 × clean', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 12 });
  s.tick(10 * MIN, { pa: 12 });
  assert.deepEqual(s.active(), [['filterMissing', 'warning', 'Filter pressure 12 Pa: filter missing or torn, or the sensor tube is off']]);
  s.tick(MIN, { pa: 23 });
  assert.equal(s.active().length, 1);
  s.tick(MIN, { pa: 24 });
  assert.deepEqual(s.active(), []);
});

test('no counted reading pauses the pressure alarms: an active one stays, a running count starts again', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 200 });
  s.tick(10 * MIN, { pa: 200 });
  s.tick(MIN, { pa: null });
  assert.equal(s.active().length, 1, 'the dirty alarm stays');
  const s2 = setup(t);
  s2.tick(0, { pa: 10 });
  s2.tick(9 * MIN, { pa: 10 });
  s2.tick(MIN, { pa: null });
  s2.tick(MIN, { pa: 10 });
  s2.tick(9 * MIN, { pa: 10 });
  assert.deepEqual(s2.active(), [], 'the missing count started again after the gap');
  s2.tick(MIN, { pa: 10 });
  assert.deepEqual(s2.active().map((a) => a[0]), ['filterMissing']);
});

test('without a sensor the pressure alarms clear; the reminder still works', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 200 });
  s.tick(10 * MIN, { pa: 200 });
  s.tick(MIN, { sensor: false, pa: null, daysInUse: 31 });
  assert.deepEqual(s.active().map((a) => a[0]), ['filterDue']);
});

test('reset drops the delay counts of the given keys', (t) => {
  const s = setup(t);
  s.tick(0, { pa: 200 });
  s.tick(9 * MIN, { pa: 200 });
  s.alarms.reset(s.room.id, FILTER_KEYS);
  s.tick(MIN, { pa: 200 });
  assert.deepEqual(s.active(), [], 'the count started again');
  s.tick(10 * MIN, { pa: 200 });
  assert.equal(s.active().length, 1);
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

test('the controller passes the room\'s filter: a dirty filter with the intake on raises filterDirty after 10 min', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = 0;
  const id = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, dpAddress: 7 }, 0).id;
  db.logMachine(id, 'intake', { on: true }, 'manual', 0);
  const machines = { get: () => null, async command() {}, forget() {} };
  const controller = createController({ db, machines, now: () => clock });
  for (let i = 0; i <= 11; i++) {
    clock = 2 * MIN + i * MIN;
    db.addFilterReading({ roomId: id, address: 7, at: clock, ok: true, pa: 170 });
    await controller.run(clock);
  }
  assert.deepEqual(db.activeAlarms(id).map((a) => a.key), ['filterDirty']);
  controller.filterChanged(id); // the delay counts go; the API clears the alarm itself
});

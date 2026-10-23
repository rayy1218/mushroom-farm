// The filter rules (server/filter.js, spec 2026-10-22-filter-design.md sections 4 and 5): which pressure readings count,
// days in use, the alarm input and a filter change.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { intakeOnThrough, countingFrom, countedPa, meanCountedPa, daysInUse, filterInput, changeFilter, FILTER_KEYS } from '../server/filter.js';

const S = 1000;
const DAY = 86_400_000;
const on = (at) => ({ at, on: true });
const off = (at) => ({ at, on: false });

test('intakeOnThrough: commanded on at `from` and never off up to `to`', () => {
  assert.equal(intakeOnThrough([on(0)], 10 * S, 70 * S), true);
  assert.equal(intakeOnThrough([on(20 * S)], 10 * S, 70 * S), false, 'switched on after `from`');
  assert.equal(intakeOnThrough([on(0), off(30 * S), on(40 * S)], 10 * S, 70 * S), false, 'a break inside');
  assert.equal(intakeOnThrough([on(0), off(80 * S)], 10 * S, 70 * S), true, 'off only after `to`');
  assert.equal(intakeOnThrough([off(0)], 10 * S, 70 * S), false);
  assert.equal(intakeOnThrough([], 10 * S, 70 * S), false);
});

test("countingFrom: when the intake's present run passed its 60 s spin-up, null while it is off or spinning up", () => {
  assert.equal(countingFrom([on(0)], 100 * S), 60 * S);
  assert.equal(countingFrom([on(0)], 60 * S), 60 * S);
  assert.equal(countingFrom([on(0)], 59 * S), null, 'still spinning up');
  assert.equal(countingFrom([on(0), off(30 * S), on(40 * S)], 120 * S), 100 * S, 'the present run');
  assert.equal(countingFrom([on(0), on(50 * S)], 120 * S), 60 * S, 'a repeated on does not start a new run');
  assert.equal(countingFrom([on(0), off(80 * S)], 90 * S), null, 'off now');
  assert.equal(countingFrom([], 90 * S), null);
});

test('countedPa: the newest good reading at most 120 s old, taken after 60 s of intake', () => {
  const log = [on(0)];
  assert.deepEqual(countedPa([{ at: 61 * S, ok: true, pa: 50 }], log, 70 * S), { at: 61 * S, pa: 50 });
  assert.equal(countedPa([{ at: 59 * S, ok: true, pa: 50 }], log, 70 * S), null, 'the fan was still spinning up');
  assert.equal(countedPa([{ at: 61 * S, ok: true, pa: 50 }], log, 182 * S), null, 'too old');
  assert.deepEqual(countedPa([{ at: 61 * S, ok: true, pa: 50 }], log, 181 * S), { at: 61 * S, pa: 50 });
  const readings = [{ at: 70 * S, ok: true, pa: 50 }, { at: 80 * S, ok: false, pa: 3000 }, { at: 90 * S, ok: true, pa: null }];
  assert.deepEqual(countedPa(readings, log, 95 * S), { at: 70 * S, pa: 50 }, 'failed polls and missing values are skipped');
  // switched off and on again: the newer reading is in the spin-up, the older one still counts
  const broken = [on(0), off(100 * S), on(110 * S)];
  assert.deepEqual(countedPa([{ at: 90 * S, pa: 48 }, { at: 120 * S, pa: 5 }], broken, 125 * S), { at: 90 * S, pa: 48 });
  assert.equal(countedPa([], log, 100 * S), null);
});

test('meanCountedPa: the mean of the counted readings, null without one', () => {
  const log = [on(0), off(200 * S)];
  assert.equal(meanCountedPa([{ at: 30 * S, pa: 5 }, { at: 100 * S, pa: 50 }, { at: 150 * S, pa: 60 }, { at: 250 * S, pa: 0 }], log), 55);
  assert.equal(meanCountedPa([{ at: 30 * S, pa: 5 }], log), null);
});

test('daysInUse: days since the filter was changed, never below 0', () => {
  assert.equal(daysInUse({ filterChangedAt: 0 }, 1.5 * DAY), 1.5);
  assert.equal(daysInUse({ filterChangedAt: 2 * DAY }, DAY), 0);
  assert.equal(daysInUse({ filterChangedAt: null }, DAY), 0);
});

function room(t, fields = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const r = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, relayAddress: 3, dpAddress: 7, ...fields }, 0);
  return { db, id: r.id };
}

test('filterInput: the alarm input of a room from its settings, sensor readings and intake log', (t) => {
  const { db, id } = room(t, { filterChangeDays: 14 });
  db.setRelayCommand(id, 'intake', true, 0);
  db.logMachine(id, 'intake', { on: true }, 'auto', 0);
  db.addFilterReading({ roomId: id, address: 7, at: 2 * DAY, ok: true, pa: 88 });
  assert.deepEqual(filterInput(db, db.getRoom(id), 2 * DAY + 5 * S), {
    sensor: true, pa: 88, countFrom: 2 * DAY - 115 * S, cleanPa: 40, finalPa: 80, changeDays: 14, daysInUse: (2 * DAY + 5 * S) / DAY,
  }); // the intake has run all along: its run is known from the start of the log window (120 + 60 s back), plus the spin-up
  db.logMachine(id, 'intake', { on: false }, 'auto', 2 * DAY + 10 * S);
  db.logMachine(id, 'intake', { on: true }, 'auto', 2 * DAY + 20 * S);
  db.addFilterReading({ roomId: id, address: 7, at: 2 * DAY + 30 * S, ok: true, pa: 2 });
  const spinning = filterInput(db, db.getRoom(id), 2 * DAY + 35 * S);
  assert.deepEqual([spinning.pa, spinning.countFrom], [null, null], 'switched on again 15 s ago: nothing counts now');
  db.addFilterReading({ roomId: id, address: 7, at: 2 * DAY + 85 * S, ok: true, pa: 91 });
  const again = filterInput(db, db.getRoom(id), 2 * DAY + 90 * S);
  assert.deepEqual([again.pa, again.countFrom], [91, 2 * DAY + 80 * S]);
  db.addFilterReading({ roomId: id, address: 7, at: 2 * DAY + 95 * S, ok: false, error: 'Timeout' });
  assert.equal(filterInput(db, db.getRoom(id), 2 * DAY + 100 * S).pa, null, 'the sensor did not answer the last poll');
  db.addFilterReading({ roomId: id, address: 7, at: 2 * DAY + 105 * S, ok: true, pa: 92 });
  assert.equal(filterInput(db, db.getRoom(id), 2 * DAY + 110 * S).pa, 92);
  assert.equal(filterInput(db, db.getRoom(id), 2 * DAY + 300 * S).pa, null, 'nothing counted lately');
  db.updateRoom(id, { name: 'Room 1', length: 6, width: 4, height: 2.5, relayAddress: 3 });
  assert.deepEqual(filterInput(db, db.getRoom(id), 2 * DAY).sensor, false);
});

test('changeFilter: the change with the last counted pressure of the past day, and the filter alarms cleared', (t) => {
  const { db, id } = room(t);
  db.logMachine(id, 'intake', { on: true }, 'auto', 0);
  db.addFilterReading({ roomId: id, address: 7, at: 5 * DAY, ok: true, pa: 160 });
  db.logMachine(id, 'intake', { on: false }, 'manual', 5 * DAY + 60 * S); // switched off to change the filter
  db.addFilterReading({ roomId: id, address: 7, at: 5 * DAY + 120 * S, ok: true, pa: 0 });
  for (const key of FILTER_KEYS) db.raiseAlarm(id, key, 'warning', key, 5 * DAY);
  db.raiseAlarm(id, 'tHigh', 'warning', 'hot', 5 * DAY);
  const r = changeFilter(db, id, 5 * DAY + 600 * S);
  assert.equal(r.filterChangedAt, 5 * DAY + 600 * S);
  assert.deepEqual(db.filterChanges(id), [{ at: 5 * DAY + 600 * S, paBefore: 160 }]);
  assert.deepEqual(db.activeAlarms(id).map((a) => a.key), ['tHigh']);
  assert.equal(changeFilter(db, 999, 0), null);
});

test('changeFilter without a sensor or a counted reading: no pressure before', (t) => {
  const { db, id } = room(t, { dpAddress: null });
  changeFilter(db, id, 1000);
  assert.deepEqual(db.filterChanges(id), [{ at: 1000, paBefore: null }]);
});

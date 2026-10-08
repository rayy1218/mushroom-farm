// tests/fakes/db.js: lifecycle, rooms, settings, column rules, readings, events, alarms, state, calibrations,
// crop mix, capacity reports (C1 sections 6, 9; docs/superpowers/plans .../lead-fakes.md tasks 4-7).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../controller.js');
const CC = globalThis.ClimateController;
const { openFakeDb } = require('./fakes/db.js');

let clock = 1791446400;
const now = () => clock;

function freshSettings() {
  return CC.defaultSettings();
}

// ---------- Task 4: lifecycle, rooms, settings ----------

test('openFakeDb: shape, independence, unknown options', () => {
  const db = openFakeDb();
  assert.equal(db.path, ':memory:');
  assert.equal(db.version, 1);
  const db2 = openFakeDb({ now: () => 1 });
  db2.createRoom({ name: 'X', volume: 10, vent: 'supply', settings: freshSettings() });
  assert.equal(db.listRooms().length, 0);
  assert.throws(() => openFakeDb({ upgrades: [] }), TypeError);
  assert.throws(() => openFakeDb({ foo: 1 }), TypeError);
  assert.doesNotThrow(() => openFakeDb(null)); // a missing/null options argument is {}
});

test('close(): idempotent, functions throw, path/version stay readable', () => {
  const db = openFakeDb({ now });
  db.close();
  db.close();
  assert.throws(() => db.listRooms(), { message: 'database is not open' });
  assert.throws(() => db.getRoom(1), { message: 'database is not open' });
  assert.throws(() => db.insertReading(1, { t: 1 }), { message: 'database is not open' });
  assert.equal(db.path, ':memory:');
  assert.equal(db.version, 1);
});

test('createRoom and currentSettings', () => {
  const db = openFakeDb({ now });
  const settings = freshSettings();
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings });
  assert.deepEqual(room, { id: 1, name: 'A', volume: 60, vent: 'supply', adapter: 'sim', created_at: clock, archived_at: null });
  assert.equal(Object.getPrototypeOf(room), Object.prototype);
  const version = db.currentSettings(1);
  assert.deepEqual(version, { id: 1, room_id: 1, saved_at: clock, note: 'Created', settings });
});

test('listRooms: ordering, includeArchived, unknown field', () => {
  const db = openFakeDb({ now });
  const settings = freshSettings();
  db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings });
  const b = db.createRoom({ name: 'B', volume: 60, vent: 'supply', settings });
  db.archiveRoom(b.id);
  assert.deepEqual(db.listRooms().map(r => r.id), [1]);
  assert.deepEqual(db.listRooms({ includeArchived: true }).map(r => r.id), [1, 2]);
  assert.throws(() => db.listRooms({ archived: true }), TypeError);
  assert.doesNotThrow(() => db.listRooms(null)); // a missing/null options argument is {}
});

test('getRoom: unknown ids', () => {
  const db = openFakeDb({ now });
  for (const id of [7, '1', NaN, undefined]) {
    assert.throws(() => db.getRoom(id), err => err instanceof Error && err.code === 'NOT_FOUND' && err.what === 'room' && Object.is(err.id, id));
  }
  assert.throws(() => db.getRoom(7), { message: 'Unknown room 7' });
});

test('updateRoom', () => {
  const db = openFakeDb({ now });
  const settings = freshSettings();
  db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings });
  const updated = db.updateRoom(1, { name: 'B' });
  assert.equal(updated.name, 'B');
  const unchanged = db.updateRoom(1, {});
  assert.deepEqual(unchanged, updated);
  assert.throws(() => db.updateRoom(1, { archived_at: 5 }), TypeError);
  assert.throws(() => db.updateRoom(1, { colour: 'x' }), TypeError);
  assert.equal(db.getRoom(1).name, 'B');
});

test('archiveRoom: keeps first archived_at, works on archived rooms', () => {
  const db = openFakeDb({ now });
  const settings = freshSettings();
  db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings });
  const archived = db.archiveRoom(1, 100);
  assert.equal(archived.archived_at, 100);
  const again = db.archiveRoom(1, 200);
  assert.equal(again.archived_at, 100);
  const archivedRoom = db.createRoom({ name: 'C', volume: 60, vent: 'supply', settings });
  db.archiveRoom(archivedRoom.id);
  // Every function still works on an archived room (archiving only stops the loop; C1 does not gate on it).
  assert.doesNotThrow(() => db.insertReading(archivedRoom.id, { t: 1, ac_mode: 'off', fog: 0, fan: 0, lights: false, circ: false }));
  assert.doesNotThrow(() => db.updateRoom(archivedRoom.id, { name: 'C2' }));
  assert.doesNotThrow(() => db.currentSettings(archivedRoom.id));
  assert.doesNotThrow(() => db.addEvent(archivedRoom.id, { t: 1, level: 'info', text: 'x' }));
  assert.doesNotThrow(() => db.raiseAlarm(archivedRoom.id, { alarm_key: 'k', level: 'warning', label: 'K' }));
  assert.doesNotThrow(() => db.listAlarms(archivedRoom.id));
});

test('copies: results and arguments are independent of stored data', () => {
  const db = openFakeDb({ now });
  const settings = freshSettings();
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings });
  room.name = 'mutated';
  settings.spT = 999;
  assert.equal(db.getRoom(1).name, 'A');
  assert.equal(db.currentSettings(1).settings.spT, freshSettings().spT);
  const toSave = freshSettings();
  const version = db.saveSettings(1, { settings: toSave, at: now() });
  toSave.spT = 111;
  assert.notEqual(db.getSettingsVersion(1, version.id).settings.spT, 111);

  // Mutating a returned settings object (from currentSettings or getSettingsVersion) must not change what
  // a later read returns.
  db.currentSettings(1).settings.spT = 222;
  assert.notEqual(db.currentSettings(1).settings.spT, 222);
  db.getSettingsVersion(1, version.id).settings.spT = 333;
  assert.notEqual(db.getSettingsVersion(1, version.id).settings.spT, 333);
});

test('saveSettings, settingsHistory, getSettingsVersion', () => {
  const db = openFakeDb({ now });
  const settings = freshSettings();
  db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings });
  db.createRoom({ name: 'B', volume: 60, vent: 'supply', settings });
  const v2 = db.saveSettings(1, { settings, note: 'n', at: 5 });
  assert.equal(v2.note, 'n');
  assert.equal(v2.id, db.currentSettings(1).id);
  assert.deepEqual(db.getSettingsVersion(1, v2.id), { id: v2.id, room_id: 1, saved_at: 5, note: 'n', settings });
  const v3 = db.saveSettings(1, { settings });
  assert.equal(v3.note, null);
  const history = db.settingsHistory(1);
  assert.deepEqual(history.map(h => h.id), [v3.id, v2.id, 1]);
  assert.deepEqual(Object.keys(history[0]).sort(), ['id', 'note', 'saved_at'].sort());
  assert.throws(() => db.getSettingsVersion(2, v2.id), err => err.code === 'NOT_FOUND' && err.what === 'settings');
});

test('every room-id function throws NotFoundError(room) for an unknown room', () => {
  const db = openFakeDb({ now });
  const calls = [
    () => db.getRoom(99),
    () => db.updateRoom(99, {}),
    () => db.archiveRoom(99),
    () => db.saveSettings(99, { settings: freshSettings() }),
    () => db.currentSettings(99),
    () => db.settingsHistory(99),
    () => db.getSettingsVersion(99, 1),
    () => db.insertReading(99, { t: 1, ac_mode: 'off', fog: 0, fan: 0, lights: 0, circ: 0 }),
    () => db.queryReadings(99, { from: 0, to: 1 }),
    () => db.latestReading(99),
    () => db.addEvent(99, { t: 1, level: 'info', text: 'x' }),
    () => db.listEvents(99),
    () => db.raiseAlarm(99, { alarm_key: 'k', level: 'warning', label: 'L' }),
    () => db.clearAlarm(99, 'k'),
    () => db.ackAlarm(99, 'k'),
    () => db.listAlarms(99),
    () => db.saveControllerState(99, { controller: {} }),
    () => db.loadControllerState(99),
    () => db.saveCalibration(99, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 }),
    () => db.listCalibrations(99),
    () => db.applyCalibration(99, 1),
    () => db.currentCalibration(99),
    () => db.getMix(99),
    () => db.replaceMix(99, []),
    () => db.saveCapacityReport(99, { report: { verdict: 'good' } }),
    () => db.latestCapacityReport(99),
  ];
  assert.equal(calls.length, 26);
  for (const fn of calls) {
    assert.throws(fn, err => err.code === 'NOT_FOUND' && err.what === 'room', fn.toString());
  }
});

test('left-out at uses options.now()', () => {
  const db = openFakeDb({ now });
  const room = db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings: freshSettings() });
  assert.equal(room.created_at, clock);
  const version = db.saveSettings(1, { settings: freshSettings() });
  assert.equal(version.saved_at, clock);
  const archived = db.archiveRoom(1);
  assert.equal(archived.archived_at, clock);
});

// ---------- Task 5: column rules ----------

function freshDb() {
  const db = openFakeDb({ now });
  db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings: freshSettings() });
  return db;
}

function assertConstraint(fn, errcode, afterCheck) {
  assert.throws(fn, err => {
    assert.equal(err.code, 'ERR_SQLITE_ERROR');
    assert.equal(err.errcode, errcode);
    assert.equal(err.errcode & 0xff, 19);
    return true;
  });
  if (afterCheck) afterCheck();
}

test('column rules: createRoom', () => {
  function badCreate(over, errcode) {
    const db = freshDb();
    assertConstraint(
      () => db.createRoom(Object.assign({ name: 'B', volume: 10, vent: 'supply', settings: freshSettings() }, over)),
      errcode,
      () => assert.deepEqual(db.listRooms().map(r => r.id), [1]) // the room from freshDb() only: nothing written
    );
  }
  badCreate({ volume: 0 }, 275);
  badCreate({ vent: 'side' }, 275);
  badCreate({ name: undefined }, 1299);
  badCreate({ settings: undefined }, 1299);
  badCreate({ at: 1.5 }, 3091);
  badCreate({ volume: 'abc' }, 3091);
});

function validReading(over) {
  return Object.assign({ t: 1, ac_mode: 'off', fog: 0, fan: 0, lights: 0, circ: 0 }, over);
}

test('column rules: insertReading', () => {
  function badReading(over, errcode) {
    const db = freshDb();
    assertConstraint(
      () => db.insertReading(1, validReading(over)),
      errcode,
      () => assert.equal(db.queryReadings(1, { from: 0, to: 1000 }).length, 0) // nothing written
    );
  }
  badReading({ fog: 4 }, 275);
  badReading({ fog: 1.5 }, 3091);
  badReading({ t: undefined }, 1299);
  badReading({ t: 1.5 }, 3091);
  badReading({ ac_mode: 'auto' }, 275);
  badReading({ lights: 2 }, 275);
  badReading({ T: 'abc' }, 3091);
});

test('column rules: addEvent, raiseAlarm', () => {
  const db1 = freshDb();
  assertConstraint(() => db1.addEvent(1, { t: 1, level: 'debug', text: 'x' }), 275, () => assert.equal(db1.listEvents(1).length, 0));
  const db2 = freshDb();
  assertConstraint(() => db2.addEvent(1, { t: 1, level: 'info' }), 1299, () => assert.equal(db2.listEvents(1).length, 0));
  const db3 = freshDb();
  assertConstraint(
    () => db3.raiseAlarm(1, { alarm_key: 'k', level: 'info', label: 'L' }),
    275,
    () => assert.equal(db3.listAlarms(1, { recent: 50 }).length, 0)
  );
});

test('column rules: archiveRoom, clearAlarm, ackAlarm, applyCalibration at columns', () => {
  const db = freshDb();
  assertConstraint(() => db.archiveRoom(1, 1.5), 3091, () => assert.equal(db.getRoom(1).archived_at, null));

  db.raiseAlarm(1, { alarm_key: 'k', level: 'warning', label: 'K', at: 1 });
  assertConstraint(
    () => db.clearAlarm(1, 'k', 1.5),
    3091,
    () => assert.equal(db.listAlarms(1, { recent: 0 })[0].cleared_at, null) // still open
  );
  assertConstraint(
    () => db.ackAlarm(1, 'k', 1.5),
    3091,
    () => assert.equal(db.listAlarms(1, { recent: 0 })[0].acked_at, null) // still unacknowledged
  );

  const run = db.saveCalibration(1, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 });
  assertConstraint(() => db.applyCalibration(1, run.id, 1.5), 3091, () => assert.equal(db.currentCalibration(1), null));
});

test('NaN at columns store null, not NaN', () => {
  const db = freshDb();
  db.archiveRoom(1, NaN);
  assert.equal(db.getRoom(1).archived_at, null);
  assert.deepEqual(db.listRooms().map(r => r.id), [1]); // a null archived_at does not drop the room from listRooms

  db.raiseAlarm(1, { alarm_key: 'j', level: 'warning', label: 'J', at: 1 });
  const afterNaNAck = db.ackAlarm(1, 'j', NaN);
  assert.equal(afterNaNAck.acked_at, null);
  const afterRealAck = db.ackAlarm(1, 'j', 50); // a later real ack still finds the row (it was not left "acked" with NaN)
  assert.equal(afterRealAck.acked_at, 50);

  db.raiseAlarm(1, { alarm_key: 'm', level: 'warning', label: 'M', at: 1 });
  const cleared = db.clearAlarm(1, 'm', NaN);
  assert.equal(cleared.cleared_at, null);

  const run = db.saveCalibration(1, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 });
  db.applyCalibration(1, run.id, NaN);
  assert.equal(db.currentCalibration(1), null); // a null applied_at is not "current"
});

test('column rules: replaceMix (all or nothing)', () => {
  const db = freshDb();
  db.replaceMix(1, [{ crop: 'oyster', blocks: 10 }]);
  assertConstraint(() => db.replaceMix(1, [{ crop: 'oyster', blocks: -1 }]), 275);
  assert.deepEqual(db.getMix(1), [{ crop: 'oyster', blocks: 10, co2_per_block: null }]);
  assertConstraint(() => db.replaceMix(1, [{ crop: 'oyster', blocks: 1.5 }]), 3091);
  assertConstraint(() => db.replaceMix(1, [{ blocks: 1 }]), 1299);
  assert.deepEqual(db.getMix(1), [{ crop: 'oyster', blocks: 10, co2_per_block: null }]);
});

test('column rules: replaceMix checks unknown fields of every row before column rules of any row', () => {
  // Row 0 breaks a column rule (blocks: -1); row 1 has an unknown field. Section 5.3: check 3 (unknown
  // fields, every row) happens before check 6 (column rules, every row), so this throws TypeError, not 275.
  const db = freshDb();
  assert.throws(() => db.replaceMix(1, [{ crop: 'a', blocks: -1 }, { crop: 'b', blocks: 1, x: 1 }]), TypeError);
  assert.deepEqual(db.getMix(1), []);
});

test('column rules: saveCapacityReport', () => {
  const db1 = freshDb();
  assertConstraint(() => db1.saveCapacityReport(1, { report: { verdict: 'ok' } }), 275, () => assert.equal(db1.latestCapacityReport(1), null));
  const db2 = freshDb();
  assertConstraint(
    () => db2.saveCapacityReport(1, { report: { verdict: 'good', utilisation: 74.5 } }),
    3091,
    () => assert.equal(db2.latestCapacityReport(1), null)
  );
  const db3 = freshDb();
  assertConstraint(() => db3.saveCapacityReport(1, {}), 1299, () => assert.equal(db3.latestCapacityReport(1), null));
});

test('column rules: saveCapacityReport verdict uses report?.verdict (a falsy report is NOT NULL, not CHECK)', () => {
  // report?.verdict for a falsy primitive report is undefined (property access, not short-circuit), so the
  // missing verdict is a NOT NULL violation (1299), not a CHECK failure (275) from the falsy value itself.
  const db1 = freshDb();
  assertConstraint(() => db1.saveCapacityReport(1, { report: 0 }), 1299, () => assert.equal(db1.latestCapacityReport(1), null));
  const db2 = freshDb();
  assertConstraint(() => db2.saveCapacityReport(1, { report: '' }), 1299, () => assert.equal(db2.latestCapacityReport(1), null));
});

test('column rules: saveCalibration', () => {
  const db1 = freshDb();
  assertConstraint(
    () => db1.saveCalibration(1, { inf_ach: 1, moist_buffer: 1, co2_per_block: 1 }),
    1299,
    () => assert.equal(db1.listCalibrations(1).length, 0)
  );
  const db2 = freshDb();
  assertConstraint(
    () => db2.saveCalibration(1, { ua: NaN, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 }),
    1299,
    () => assert.equal(db2.listCalibrations(1).length, 0)
  );
  const db3 = freshDb();
  assertConstraint(
    () => db3.saveCalibration(1, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1, log_rows: 2.5 }),
    3091,
    () => assert.equal(db3.listCalibrations(1).length, 0)
  );
});

test('column rules: saveControllerState', () => {
  const db = freshDb();
  assertConstraint(() => db.saveControllerState(1, {}), 1299, () => assert.equal(db.loadControllerState(1), null));
});

test('non-finite numbers stored as null; booleans of lights/circ', () => {
  const db = freshDb();
  db.insertReading(1, validReading({ T: NaN, power_w: Infinity }));
  const row = db.latestReading(1);
  assert.equal(row.T, null);
  assert.equal(row.power_w, null);
  db.insertReading(1, validReading({ t: 2, lights: true, circ: false }));
  const row2 = db.queryReadings(1, { from: 2, to: 2 })[0];
  assert.equal(row2.lights, 1);
  assert.equal(row2.circ, 0);
  const cal = db.saveCalibration(1, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1, rmse_t: NaN });
  assert.equal(cal.rmse_t, null);
});

test('TypeError for unknown fields; nothing stored', () => {
  const db1 = freshDb();
  assert.throws(() => db1.createRoom({ name: 'B', volume: 10, vent: 'supply', settings: freshSettings(), colour: 'x' }), TypeError);
  assert.deepEqual(db1.listRooms().map(r => r.id), [1]);

  const db2 = freshDb();
  for (const key of ['temp', 'rh', 'co2', 'n']) {
    assert.throws(() => db2.insertReading(1, validReading({ [key]: 1 })), TypeError);
  }
  assert.throws(() => db2.insertReading(1, validReading({ room_id: 2 })), TypeError);
  assert.equal(db2.queryReadings(1, { from: 0, to: 1000 }).length, 0);
  assert.doesNotThrow(() => db2.insertReading(1, validReading({ room_id: 1 })));
  assert.equal(db2.queryReadings(1, { from: 0, to: 1000 }).length, 1);

  const db3 = freshDb();
  assert.throws(() => db3.replaceMix(1, [{ crop: 'oyster', blocks: 1, co2PerBlock: 1 }]), TypeError);
  assert.deepEqual(db3.getMix(1), []);

  const db4 = freshDb();
  assert.throws(() => db4.queryReadings(1, { from: 0, to: 1, limit: 1 }), TypeError);

  const db5 = freshDb();
  assert.throws(() => db5.saveCapacityReport(1, { report: { verdict: 'good' }, verdict: 'good' }), TypeError);
  assert.equal(db5.latestCapacityReport(1), null);
});

// ---------- Task 6: readings ----------

test('a full Reading round-trips; a minimal one gets null for the rest', () => {
  const db = freshDb();
  const full = { room_id: 1, t: 10, T: 20, RH: 80, CO2: 700, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 18, fog: 1, fan: 2, lights: 1, circ: 0, power_w: 100, kwh: 1.5 };
  db.insertReading(1, full);
  assert.deepEqual(db.latestReading(1), full);
  assert.deepEqual(db.queryReadings(1, { from: 10, to: 10 })[0], full);
  assert.doesNotThrow(() => db.insertReading(1, db.latestReading(1)));

  const db2 = freshDb();
  db2.insertReading(1, validReading({ t: 5 }));
  const row = db2.latestReading(1);
  assert.deepEqual(Object.keys(row), ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'fan', 'lights', 'circ', 'power_w', 'kwh']);
  assert.equal(row.T, null);
  assert.equal(row.RH, null);
});

test('raw range is inclusive; order by t (not by T); ties by insertion; other rooms excluded', () => {
  const db = freshDb();
  db.createRoom({ name: 'B', volume: 60, vent: 'supply', settings: freshSettings() });
  // T decreases as t increases, so sorting by T (a bug) would give a different order than sorting by t.
  db.insertReading(1, validReading({ t: 30, T: 1 }));
  db.insertReading(1, validReading({ t: 10, T: 4 }));
  db.insertReading(1, validReading({ t: 20, T: 2 })); // first at t: 20
  db.insertReading(1, validReading({ t: 20, T: 3 })); // second at t: 20 (insertion order tie-break)
  db.insertReading(2, validReading({ t: 15, T: 99 }));
  db.insertReading(1, validReading({ t: 9, T: 999 })); // just outside from: 9 < 10
  db.insertReading(1, validReading({ t: 31, T: 999 })); // just outside to: 31 > 30
  const rows = db.queryReadings(1, { from: 10, to: 30 });
  assert.deepEqual(rows.map(r => r.T), [4, 2, 3, 1]); // by t ascending, ties by insertion order; from-1/to+1 excluded
  const all = db.queryReadings(1, { from: 0, to: 100 });
  assert.equal(all.length, 6);
});

test('bucket averaging', () => {
  const db = freshDb();
  // Inserted out of t order: the row with the largest t (95) is inserted first, so "last inserted" would
  // wrongly pick the t: 65 row's ac_mode/kwh. The bucket starts at 60, not 0, so the start is not trivial.
  db.insertReading(1, validReading({ t: 95, T: 20, fog: 2, lights: 0, ac_mode: 'off', ac_setpoint: null, kwh: null }));
  db.insertReading(1, validReading({ t: 65, T: 10, fog: 1, lights: 1, ac_mode: 'cool', ac_setpoint: 18, kwh: 1 }));
  const buckets = db.queryReadings(1, { from: 60, to: 119, step: 60 });
  assert.equal(buckets.length, 1);
  const b = buckets[0];
  assert.equal(b.t, 60);
  assert.equal(b.T, 15);
  assert.equal(b.fog, 1.5);
  assert.equal(b.lights, 0.5);
  assert.equal(b.ac_mode, 'off'); // the row with the largest t (95), even though it was inserted first
  assert.equal(b.ac_setpoint, 18); // average of the non-null values (the AC was on for one reading)
  assert.equal(b.kwh, null); // from the row with the largest t

  const allNullDb = freshDb();
  allNullDb.insertReading(1, validReading({ t: 60, T: undefined }));
  allNullDb.insertReading(1, validReading({ t: 61, T: undefined }));
  const allNullBucket = allNullDb.queryReadings(1, { from: 60, to: 119, step: 60 })[0];
  assert.equal(allNullBucket.T, null); // T null when all null

  const offBucketDb = freshDb();
  offBucketDb.insertReading(1, validReading({ t: 0, ac_setpoint: null }));
  offBucketDb.insertReading(1, validReading({ t: 30, ac_setpoint: null }));
  const offBucket = offBucketDb.queryReadings(1, { from: 0, to: 59, step: 60 })[0];
  assert.equal(offBucket.ac_setpoint, null); // the AC was off for the whole bucket
  assert.deepEqual(Object.keys(offBucket), Object.keys(offBucketDb.latestReading(1)));

  const emptyDb = freshDb();
  emptyDb.insertReading(1, validReading({ t: 5, T: 1 }));
  const empty = emptyDb.queryReadings(1, { from: 100, to: 200, step: 60 });
  assert.deepEqual(empty, []);

  const gapDb = freshDb();
  gapDb.insertReading(1, validReading({ t: 0, T: 1 })); // bucket 0
  gapDb.insertReading(1, validReading({ t: 120, T: 2 })); // bucket 120; bucket 60 has no readings
  const withGap = gapDb.queryReadings(1, { from: 0, to: 179, step: 60 });
  assert.deepEqual(withGap.map(r => r.t), [0, 120]); // the empty bucket between two filled ones is left out
});

test('queryReadings RangeErrors; step: null gives raw rows; a missing query argument', () => {
  const db = freshDb();
  db.insertReading(1, validReading({ t: 5 }));
  assert.throws(() => db.queryReadings(1), RangeError); // missing query argument entirely
  assert.throws(() => db.queryReadings(1, { to: 5 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 0, to: 1.5 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 5, to: 0 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 0, to: 10, step: 0 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 0, to: 10, step: 1.5 }), RangeError);
  const raw = db.queryReadings(1, { from: 0, to: 10, step: null });
  assert.equal(raw.length, 1);
});

test('latestReading: null without readings; largest t wins (not highest T); ties by insertion', () => {
  const db = freshDb();
  assert.equal(db.latestReading(1), null);
  db.insertReading(1, validReading({ t: 10, T: 50 }));
  db.insertReading(1, validReading({ t: 20, T: 1 }));
  assert.equal(db.latestReading(1).T, 1);

  db.insertReading(1, validReading({ t: 20, T: 99 })); // same largest t, inserted after
  assert.equal(db.latestReading(1).T, 99); // ties on the largest t: the one inserted last
});

// ---------- Task 7: events, alarms, state, calibrations, mix, capacity ----------

test('events', () => {
  const db = freshDb();
  const first = db.addEvent(1, { t: 0, level: 'info', text: 'e0' });
  assert.deepEqual(first, { id: first.id, room_id: 1, t: 0, level: 'info', text: 'e0' }); // addEvent's own return shape
  for (let i = 1; i < 105; i++) db.addEvent(1, { t: i, level: 'info', text: `e${i}` });
  assert.equal(db.listEvents(1).length, 100);
  assert.equal(db.listEvents(1, { limit: 5 }).length, 5);
  const ids = db.listEvents(1, { limit: 10 }).map(e => e.id);
  assert.deepEqual(ids[0], 105);
  for (let i = 1; i < ids.length; i++) assert.ok(ids[i] < ids[i - 1]); // the full list is id descending, not just the first
  const before = db.listEvents(1, { limit: 5 })[4].id;
  const next = db.listEvents(1, { before });
  assert.ok(next.every(e => e.id < before));
  assert.throws(() => db.listEvents(1, { limit: 0 }), RangeError);
  assert.throws(() => db.listEvents(1, { limit: 1001 }), RangeError);
  assert.throws(() => db.listEvents(1, { limit: 1.5 }), RangeError);
  assert.throws(() => db.listEvents(1, { before: 'x' }), RangeError);
  assert.doesNotThrow(() => db.listEvents(1, null)); // a missing/null options argument is {}
});

test('alarms: raise, clear, ack', () => {
  const db = freshDb();
  const a1 = db.raiseAlarm(1, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 1 });
  const a2 = db.raiseAlarm(1, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 2 });
  assert.deepEqual(a1, a2);
  assert.equal(db.listAlarms(1, { recent: 0 }).length, 1);
  const cleared = db.clearAlarm(1, 'rhHi', 5);
  assert.equal(cleared.cleared_at, 5);
  assert.equal(db.clearAlarm(1, 'rhHi'), null);
  const a3 = db.raiseAlarm(1, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 10 });
  assert.notEqual(a3.id, a1.id);

  const acked = db.ackAlarm(1, 'rhHi', 20);
  assert.equal(acked.id, a3.id);
  assert.equal(acked.acked_at, 20);
  const olderCleared = db.listAlarms(1, { recent: 10 }).find(a => a.id === a1.id);
  assert.equal(olderCleared.acked_at, 20);
  const again = db.ackAlarm(1, 'rhHi', 30);
  assert.deepEqual(again, acked);

  assert.throws(
    () => db.ackAlarm(1, 'nope'),
    err => err.code === 'NOT_FOUND' && err.what === 'alarm' && err.id === 'nope' && err.message === 'Unknown alarm nope'
  );
});

test('listAlarms ordering and recent limit', () => {
  const db = freshDb();
  db.raiseAlarm(1, { alarm_key: 'a', level: 'warning', label: 'A', at: 1 });
  db.clearAlarm(1, 'a', 10);
  db.raiseAlarm(1, { alarm_key: 'b', level: 'warning', label: 'B', at: 2 });
  db.clearAlarm(1, 'b', 20);
  db.raiseAlarm(1, { alarm_key: 'c', level: 'warning', label: 'C', at: 3 });
  const all = db.listAlarms(1, { recent: 1 });
  assert.equal(all[0].alarm_key, 'c');
  assert.equal(all.length, 2);
  assert.equal(all[1].alarm_key, 'b');
  assert.throws(() => db.listAlarms(1, { recent: 501 }), RangeError);
  assert.throws(() => db.listAlarms(1, { recent: -1 }), RangeError);
  // recent: 0 with cleared rows present (a, b): only the open row (c) comes back.
  assert.deepEqual(db.listAlarms(1, { recent: 0 }).map(a => a.alarm_key), ['c']);
});

test('listAlarms: open alarms order by raised_at desc, ties by id desc', () => {
  const db = freshDb();
  const x = db.raiseAlarm(1, { alarm_key: 'x', level: 'warning', label: 'X', at: 5 }); // tied raised_at, smaller id
  const y = db.raiseAlarm(1, { alarm_key: 'y', level: 'warning', label: 'Y', at: 5 }); // tied raised_at, larger id
  const z = db.raiseAlarm(1, { alarm_key: 'z', level: 'warning', label: 'Z', at: 1 }); // smallest raised_at: last
  assert.deepEqual(db.listAlarms(1, { recent: 0 }).map(a => a.id), [y.id, x.id, z.id]);
});

test('listAlarms: default recent is 20', () => {
  const db = freshDb();
  for (let i = 0; i < 25; i++) {
    db.raiseAlarm(1, { alarm_key: `k${i}`, level: 'warning', label: `K${i}`, at: i });
    db.clearAlarm(1, `k${i}`, i + 1);
  }
  assert.equal(db.listAlarms(1).length, 20); // no options at all
  assert.equal(db.listAlarms(1, {}).length, 20); // options given, recent left out
});

test('controller state', () => {
  const db = freshDb();
  assert.equal(db.loadControllerState(1), null);
  db.saveControllerState(1, { controller: { a: 1 }, at: 1 });
  db.saveControllerState(1, { controller: { a: 2, b: Infinity, c: NaN, d: -Infinity, e: undefined }, at: 2 });
  const state = db.loadControllerState(1);
  assert.equal(state.saved_at, 2);
  assert.equal(state.sim, null);
  assert.deepEqual(state.controller, { a: 2, b: Infinity, c: NaN, d: -Infinity });

  const snap = CC.create(CC.defaultSettings(), null, null).snapshot();
  db.saveControllerState(1, { controller: snap, at: 3 });
  const { toJson, fromJson } = require('../server/db-common.js');
  assert.deepEqual(db.loadControllerState(1).controller, fromJson(toJson(snap)));
});

test('calibrations', () => {
  const db = freshDb();
  const run = { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1, run_at: 10 };
  const c1 = db.saveCalibration(1, run);
  assert.equal(c1.applied_at, null);
  assert.equal(c1.rmse_t, null);
  assert.equal(c1.rmse_rh, null);
  assert.equal(c1.rmse_co2, null);
  assert.equal(c1.log_rows, null);
  const c1b = db.saveCalibration(1, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 }); // run_at left out
  assert.equal(c1b.run_at, clock); // uses now(), which is far larger than the other runs' run_at
  const c2 = db.saveCalibration(1, Object.assign({}, run, { run_at: 20 }));
  assert.deepEqual(db.listCalibrations(1).map(c => c.id), [c1b.id, c2.id, c1.id]);
  db.applyCalibration(1, c2.id, 100);
  assert.equal(db.currentCalibration(1).id, c2.id);
  db.applyCalibration(1, c1.id, 200);
  assert.equal(db.currentCalibration(1).id, c1.id);
  db.applyCalibration(1, c2.id, 300); // re-applying c2 (already applied once, at 100) makes it current again
  assert.equal(db.currentCalibration(1).id, c2.id);
  assert.throws(() => db.applyCalibration(1, 9999), err => err.code === 'NOT_FOUND' && err.what === 'calibration');

  const db2 = freshDb();
  assert.equal(db2.currentCalibration(1), null);
});

test('calibrations: applying another room\'s run; currentCalibration ties by the largest id', () => {
  const db = freshDb();
  const room2 = db.createRoom({ name: 'B', volume: 60, vent: 'supply', settings: freshSettings() });
  const runOfRoom2 = db.saveCalibration(room2.id, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 });
  assert.throws(() => db.applyCalibration(1, runOfRoom2.id), err => err.code === 'NOT_FOUND' && err.what === 'calibration');

  const r1 = db.saveCalibration(1, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 });
  const r2 = db.saveCalibration(1, { ua: 2, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 });
  db.applyCalibration(1, r1.id, 50);
  db.applyCalibration(1, r2.id, 50); // tied applied_at: the larger id wins
  assert.equal(db.currentCalibration(1).id, r2.id);
});

test('crop mix', () => {
  const db = freshDb();
  assert.deepEqual(db.getMix(1), []);
  const rows = db.replaceMix(1, [{ crop: 'oyster', blocks: 10 }, { crop: 'oyster', blocks: 20, co2_per_block: 5 }]);
  assert.deepEqual(rows, [{ crop: 'oyster', blocks: 10, co2_per_block: null }, { crop: 'oyster', blocks: 20, co2_per_block: 5 }]);
  assert.deepEqual(db.getMix(1), rows);
  db.replaceMix(1, []);
  assert.deepEqual(db.getMix(1), []);
});

test('capacity reports', () => {
  const db = freshDb();
  assert.equal(db.latestCapacityReport(1), null);
  const r1 = db.saveCapacityReport(1, { report: { verdict: 'good', utilisation: 74 }, run_at: 1 });
  assert.equal(r1.verdict, 'good'); // the verdict copy
  assert.equal(r1.utilisation, 74);
  const r2 = db.saveCapacityReport(1, { report: { verdict: 'impossible', utilisation: Infinity }, run_at: 2 });
  assert.equal(r2.utilisation, null);
  const rNaN = db.saveCapacityReport(1, { report: { verdict: 'good', utilisation: NaN } });
  assert.equal(rNaN.utilisation, null); // null for NaN too, not just Infinity
  const r3 = db.saveCapacityReport(1, { report: { verdict: 'good', value: Infinity } });
  assert.equal(r3.utilisation, null); // null when utilisation is missing entirely
  assert.equal(r3.report.value, Infinity);
  assert.equal(db.latestCapacityReport(1).id, r3.id);
});

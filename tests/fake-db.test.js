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
});

test('getRoom: unknown ids', () => {
  const db = openFakeDb({ now });
  for (const id of [7, '1', NaN, undefined]) {
    assert.throws(() => db.getRoom(id), err => err instanceof Error && err.code === 'NOT_FOUND' && err.what === 'room');
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
  assert.doesNotThrow(() => db.insertReading(archivedRoom.id, { t: 1, ac_mode: 'off', fog: 0, fan: 0, lights: false, circ: false }));
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
});

test('saveSettings, settingsHistory, getSettingsVersion', () => {
  const db = openFakeDb({ now });
  const settings = freshSettings();
  db.createRoom({ name: 'A', volume: 60, vent: 'supply', settings });
  db.createRoom({ name: 'B', volume: 60, vent: 'supply', settings });
  const v2 = db.saveSettings(1, { settings, note: 'n', at: 5 });
  assert.equal(v2.note, 'n');
  assert.equal(v2.id, db.currentSettings(1).id);
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

function assertConstraint(fn, errcode) {
  assert.throws(fn, err => {
    assert.equal(err.code, 'ERR_SQLITE_ERROR');
    assert.equal(err.errcode, errcode);
    assert.equal(err.errcode & 0xff, 19);
    return true;
  });
}

test('column rules: createRoom', () => {
  assertConstraint(() => freshDb().createRoom({ name: 'B', volume: 0, vent: 'supply', settings: freshSettings() }), 275);
  assertConstraint(() => freshDb().createRoom({ name: 'B', volume: 10, vent: 'side', settings: freshSettings() }), 275);
  assertConstraint(() => freshDb().createRoom({ volume: 10, vent: 'supply', settings: freshSettings() }), 1299);
  assertConstraint(() => freshDb().createRoom({ name: 'B', volume: 10, vent: 'supply' }), 1299);
  assertConstraint(() => freshDb().createRoom({ name: 'B', volume: 10, vent: 'supply', settings: freshSettings(), at: 1.5 }), 3091);
  assertConstraint(() => freshDb().createRoom({ name: 'B', volume: 'abc', vent: 'supply', settings: freshSettings() }), 3091);
  const db = freshDb();
  assert.throws(() => db.createRoom({ name: 'B', volume: 10, vent: 'supply', settings: freshSettings(), colour: 'red' }), TypeError);
  assert.equal(db.listRooms().length, 1);
});

function validReading(over) {
  return Object.assign({ t: 1, ac_mode: 'off', fog: 0, fan: 0, lights: 0, circ: 0 }, over);
}

test('column rules: insertReading', () => {
  assertConstraint(() => freshDb().insertReading(1, validReading({ fog: 4 })), 275);
  assertConstraint(() => freshDb().insertReading(1, validReading({ fog: 1.5 })), 3091);
  assertConstraint(() => freshDb().insertReading(1, validReading({ t: undefined })), 1299);
  assertConstraint(() => freshDb().insertReading(1, validReading({ t: 1.5 })), 3091);
  assertConstraint(() => freshDb().insertReading(1, validReading({ ac_mode: 'auto' })), 275);
  assertConstraint(() => freshDb().insertReading(1, validReading({ lights: 2 })), 275);
  assertConstraint(() => freshDb().insertReading(1, validReading({ T: 'abc' })), 3091);
});

test('column rules: addEvent, raiseAlarm', () => {
  assertConstraint(() => freshDb().addEvent(1, { t: 1, level: 'debug', text: 'x' }), 275);
  assertConstraint(() => freshDb().addEvent(1, { t: 1, level: 'info' }), 1299);
  assertConstraint(() => freshDb().raiseAlarm(1, { alarm_key: 'k', level: 'info', label: 'L' }), 275);
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

test('column rules: saveCapacityReport', () => {
  assertConstraint(() => freshDb().saveCapacityReport(1, { report: { verdict: 'ok' } }), 275);
  assertConstraint(() => freshDb().saveCapacityReport(1, { report: { verdict: 'good', utilisation: 74.5 } }), 3091);
  assertConstraint(() => freshDb().saveCapacityReport(1, {}), 1299);
});

test('column rules: saveCalibration', () => {
  assertConstraint(() => freshDb().saveCalibration(1, { inf_ach: 1, moist_buffer: 1, co2_per_block: 1 }), 1299);
  assertConstraint(() => freshDb().saveCalibration(1, { ua: NaN, inf_ach: 1, moist_buffer: 1, co2_per_block: 1 }), 1299);
  assertConstraint(() => freshDb().saveCalibration(1, { ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1, log_rows: 2.5 }), 3091);
});

test('column rules: saveControllerState', () => {
  assertConstraint(() => freshDb().saveControllerState(1, {}), 1299);
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
  const db = freshDb();
  assert.throws(() => db.createRoom({ name: 'B', volume: 10, vent: 'supply', settings: freshSettings(), colour: 'x' }), TypeError);
  for (const key of ['temp', 'rh', 'co2', 'n']) {
    assert.throws(() => db.insertReading(1, validReading({ [key]: 1 })), TypeError);
  }
  assert.throws(() => db.replaceMix(1, [{ crop: 'oyster', blocks: 1, co2PerBlock: 1 }]), TypeError);
  assert.throws(() => db.queryReadings(1, { from: 0, to: 1, limit: 1 }), TypeError);
  assert.throws(() => db.saveCapacityReport(1, { report: { verdict: 'good' }, verdict: 'good' }), TypeError);
  assert.throws(() => db.insertReading(1, validReading({ room_id: 2 })), TypeError);
  assert.doesNotThrow(() => db.insertReading(1, validReading({ room_id: 1 })));
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

test('raw range is inclusive; order by t then insertion; other rooms excluded', () => {
  const db = freshDb();
  db.createRoom({ name: 'B', volume: 60, vent: 'supply', settings: freshSettings() });
  db.insertReading(1, validReading({ t: 30, T: 3 }));
  db.insertReading(1, validReading({ t: 10, T: 1 }));
  db.insertReading(1, validReading({ t: 20, T: 2 }));
  db.insertReading(1, validReading({ t: 20, T: 2.5 }));
  db.insertReading(2, validReading({ t: 15, T: 99 }));
  const rows = db.queryReadings(1, { from: 10, to: 20 });
  assert.deepEqual(rows.map(r => r.T), [1, 2, 2.5]);
  const all = db.queryReadings(1, { from: 0, to: 100 });
  assert.equal(all.length, 4);
});

test('bucket averaging', () => {
  const db = freshDb();
  db.insertReading(1, validReading({ t: 0, T: 10, fog: 1, lights: 1, ac_mode: 'cool', ac_setpoint: 18, kwh: 1 }));
  db.insertReading(1, validReading({ t: 30, T: 20, fog: 2, lights: 0, ac_mode: 'off', ac_setpoint: null, kwh: null }));
  const buckets = db.queryReadings(1, { from: 0, to: 59, step: 60 });
  assert.equal(buckets.length, 1);
  const b = buckets[0];
  assert.equal(b.t, 0);
  assert.equal(b.T, 15);
  assert.equal(b.fog, 1.5);
  assert.equal(b.lights, 0.5);
  assert.equal(b.ac_mode, 'off');
  assert.equal(b.ac_setpoint, 18); // average of the non-null values (the AC was on for one reading)
  assert.equal(b.kwh, null); // from the row with the largest t

  const db3 = freshDb();
  db3.insertReading(1, validReading({ t: 0, ac_setpoint: null }));
  db3.insertReading(1, validReading({ t: 30, ac_setpoint: null }));
  const offBucket = db3.queryReadings(1, { from: 0, to: 59, step: 60 })[0];
  assert.equal(offBucket.ac_setpoint, null); // the AC was off for the whole bucket
  assert.deepEqual(Object.keys(b), Object.keys(db.latestReading(1)));

  const db2 = freshDb();
  db2.insertReading(1, validReading({ t: 5, T: 1 }));
  const empty = db2.queryReadings(1, { from: 100, to: 200, step: 60 });
  assert.deepEqual(empty, []);
});

test('queryReadings RangeErrors; step: null gives raw rows', () => {
  const db = freshDb();
  db.insertReading(1, validReading({ t: 5 }));
  assert.throws(() => db.queryReadings(1, { to: 5 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 0, to: 1.5 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 5, to: 0 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 0, to: 10, step: 0 }), RangeError);
  assert.throws(() => db.queryReadings(1, { from: 0, to: 10, step: 1.5 }), RangeError);
  const raw = db.queryReadings(1, { from: 0, to: 10, step: null });
  assert.equal(raw.length, 1);
});

test('latestReading: null without readings; largest t wins (not highest T)', () => {
  const db = freshDb();
  assert.equal(db.latestReading(1), null);
  db.insertReading(1, validReading({ t: 10, T: 50 }));
  db.insertReading(1, validReading({ t: 20, T: 1 }));
  assert.equal(db.latestReading(1).T, 1);
});

// ---------- Task 7: events, alarms, state, calibrations, mix, capacity ----------

test('events', () => {
  const db = freshDb();
  for (let i = 0; i < 105; i++) db.addEvent(1, { t: i, level: 'info', text: `e${i}` });
  assert.equal(db.listEvents(1).length, 100);
  assert.equal(db.listEvents(1, { limit: 5 }).length, 5);
  assert.deepEqual(db.listEvents(1).map(e => e.id)[0], 105);
  const before = db.listEvents(1, { limit: 5 })[4].id;
  const next = db.listEvents(1, { before });
  assert.ok(next.every(e => e.id < before));
  assert.throws(() => db.listEvents(1, { limit: 0 }), RangeError);
  assert.throws(() => db.listEvents(1, { limit: 1001 }), RangeError);
  assert.throws(() => db.listEvents(1, { limit: 1.5 }), RangeError);
  assert.throws(() => db.listEvents(1, { before: 'x' }), RangeError);
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

  assert.throws(() => db.ackAlarm(1, 'nope'), err => err.code === 'NOT_FOUND' && err.what === 'alarm' && err.id === 'nope');
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
  const c2 = db.saveCalibration(1, Object.assign({}, run, { run_at: 20 }));
  assert.deepEqual(db.listCalibrations(1).map(c => c.id), [c2.id, c1.id]);
  db.applyCalibration(1, c2.id, 100);
  assert.equal(db.currentCalibration(1).id, c2.id);
  db.applyCalibration(1, c1.id, 200);
  assert.equal(db.currentCalibration(1).id, c1.id);
  assert.throws(() => db.applyCalibration(1, 9999), err => err.code === 'NOT_FOUND' && err.what === 'calibration');
  const db2 = freshDb();
  assert.equal(db2.currentCalibration(1), null);
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
  assert.equal(r1.utilisation, 74);
  const r2 = db.saveCapacityReport(1, { report: { verdict: 'impossible', utilisation: Infinity }, run_at: 2 });
  assert.equal(r2.utilisation, null);
  const r3 = db.saveCapacityReport(1, { report: { verdict: 'good', value: Infinity } });
  assert.equal(r3.report.value, Infinity);
  assert.equal(db.latestCapacityReport(1).id, r3.id);
});

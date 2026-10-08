// Shared tests for server/db.js (C1) and tests/fakes/db.js (C1 section 9).
// Every test is defined once and run against both targets, except "real only" tests.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { openDb, NotFoundError, UPGRADES } = require('../server/db.js');
const { toJson, fromJson } = require('../server/db-common.js');
const { openFakeDb } = require('./fakes/db.js');
require('../sim.js');
require('../controller.js');
require('../runtime.js');
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, RT = globalThis.ClimateRuntime;

const TARGETS = [
  ['real', o => openDb(':memory:', o)],
  ['fake', o => openFakeDb(o)],
];

function both(name, fn) {
  for (const [label, open] of TARGETS) {
    test(`${label}: ${name}`, t => fn(t, open));
  }
}

// Multiple of 60, 900 and 3600.
const T0 = 1791446400;

function assertNotFound(fn, what, id) {
  assert.throws(fn, err => {
    assert.ok(err instanceof NotFoundError, 'instanceof NotFoundError');
    assert.equal(err.code, 'NOT_FOUND');
    assert.ok(Object.is(err.what, what), `what: ${String(err.what)} !== ${String(what)}`);
    assert.ok(Object.is(err.id, id), `id: ${String(err.id)} !== ${String(id)}`);
    assert.equal(err.message, `Unknown ${what} ${id}`);
    return true;
  });
}

function assertSql(fn, errcode) {
  assert.throws(fn, err => {
    assert.equal(err.code, 'ERR_SQLITE_ERROR');
    assert.ok(Object.is(err.errcode, errcode), `errcode: ${String(err.errcode)} !== ${String(errcode)}`);
    assert.equal(err.errcode & 0xff, 19);
    return true;
  });
}

function roomInput(over) {
  return Object.assign({ name: 'A', volume: 60, vent: 'supply', settings: { spT: 18 } }, over);
}
function reading(t, over) {
  return Object.assign({
    t, T: 20, RH: 80, CO2: 900, t_out: 30, rh_out: 60,
    ac_mode: 'cool', ac_setpoint: 18, fog: 1, fan: 1, lights: 1, circ: 1, power_w: 100, kwh: 1,
  }, over);
}
function calibRun(over) {
  return Object.assign({ ua: 90, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 40 }, over);
}
function report(over) {
  return Object.assign({ verdict: 'good', utilisation: 70, runs: [], balance: {} }, over);
}

// ---------------------------------------------------------------------------
// Task 1: Open, schema, close
// ---------------------------------------------------------------------------

both('open gives path and version', (t, open) => {
  let clock = T0;
  const now = () => clock;
  const db = open({ now });
  t.after(() => db.close());
  assert.equal(db.path, ':memory:');
  assert.equal(db.version, 1);
});

test('real: openDb rejects an unknown option', () => {
  assert.throws(() => openDb(':memory:', { nope: 1 }), err => {
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, 'openDb: unknown field "nope"');
    return true;
  });
});

test('fake: openFakeDb rejects an unknown option', () => {
  assert.throws(() => openFakeDb({ upgrades: [] }), TypeError);
});

test('real: opening a file creates the folder, schema and indexes', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-db-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'sub', 'farm.db');
  const db = openDb(file);
  db.close();
  assert.ok(fs.existsSync(file));

  const raw = new DatabaseSync(file);
  t.after(() => raw.close());

  const tables = raw.prepare(
    "SELECT name, strict FROM pragma_table_list() WHERE name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  const expectedTables = [
    'alarms', 'calibrations', 'capacity_reports', 'controller_state', 'crop_mixes',
    'events', 'readings', 'room_settings', 'rooms', 'schema_version',
  ];
  assert.deepStrictEqual(tables.map(r => r.name).sort(), expectedTables);
  for (const r of tables) assert.equal(r.strict, 1, `${r.name} is not strict`);

  const indexes = raw.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all().map(r => r.name);
  assert.deepStrictEqual(indexes, [
    'alarms_open', 'alarms_room', 'calibrations_room', 'capacity_reports_room',
    'events_room', 'readings_room_t', 'room_settings_room',
  ].sort());

  const cols = raw.prepare('SELECT name FROM pragma_table_info(?)').all('readings').map(r => r.name);
  assert.deepStrictEqual(cols, [
    'room_id', 't', 'temp', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint',
    'fog', 'fan', 'lights', 'circ', 'power_w', 'kwh',
  ]);
});

both('close twice does not throw; calls after close throw', (t, open) => {
  const db = open({ now: () => T0 });
  db.close();
  assert.doesNotThrow(() => db.close());
  assert.throws(() => db.getRoom(1), { message: 'database is not open' });
  assert.throws(() => db.listRooms(), { message: 'database is not open' });
});

// ---------------------------------------------------------------------------
// Task 2: Upgrades and file database (all real only)
// ---------------------------------------------------------------------------

function tmpFile(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farm-db-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, 'farm.db');
}

test('real: a file database uses WAL', t => {
  const file = tmpFile(t);
  const db = openDb(file, { now: () => T0 });
  db.close();
  const raw = new DatabaseSync(file);
  t.after(() => raw.close());
  assert.equal(raw.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
});

test('real: reopening a file applies no upgrade twice', t => {
  const file = tmpFile(t);
  const db1 = openDb(file, { now: () => T0 });
  db1.close();
  const db2 = openDb(file, { now: () => T0 + 100 });
  db2.close();
  const raw = new DatabaseSync(file);
  t.after(() => raw.close());
  assert.deepStrictEqual(raw.prepare('SELECT version, applied_at FROM schema_version').all().map(r => ({ ...r })), [
    { version: 1, applied_at: T0 },
  ]);
});

test('real: upgrades apply in order', t => {
  const file = tmpFile(t);
  const upgrades = [
    ...UPGRADES,
    { version: 2, sql: 'CREATE TABLE extra_a (x INTEGER) STRICT;' },
    { version: 3, sql: 'ALTER TABLE extra_a ADD COLUMN y INTEGER;' },
  ];
  const db = openDb(file, { now: () => T0, upgrades });
  assert.equal(db.version, 3);
  db.close();
  const raw = new DatabaseSync(file);
  t.after(() => raw.close());
  assert.deepStrictEqual(raw.prepare('SELECT version FROM schema_version ORDER BY version').all().map(r => ({ ...r })), [
    { version: 1 }, { version: 2 }, { version: 3 },
  ]);
  const cols = raw.prepare('SELECT name FROM pragma_table_info(?)').all('extra_a').map(r => r.name);
  assert.deepStrictEqual(cols, ['x', 'y']);
});

test('real: a failed upgrade leaves no trace; earlier upgrades stay', t => {
  const file = tmpFile(t);
  const upgrades = [
    ...UPGRADES,
    { version: 2, sql: 'CREATE TABLE fk_probe (room_id INTEGER REFERENCES rooms (id)) STRICT; INSERT INTO fk_probe VALUES (999);' },
  ];
  assert.throws(() => openDb(file, { now: () => T0, upgrades }), err => /^Schema upgrade 2 failed: /.test(err.message));

  const db = openDb(file, { now: () => T0 });
  assert.equal(db.version, 1);
  db.close();
  const raw = new DatabaseSync(file);
  t.after(() => raw.close());
  assert.deepStrictEqual(raw.prepare('SELECT version FROM schema_version ORDER BY version').all().map(r => ({ ...r })), [{ version: 1 }]);
  assert.deepStrictEqual(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'fk_probe'").all(), []);
});

test('real: a database newer than the app throws and changes nothing', t => {
  const file = tmpFile(t);
  const upgrades = [
    ...UPGRADES,
    { version: 2, sql: 'CREATE TABLE extra_a (x INTEGER) STRICT;' },
    { version: 3, sql: 'ALTER TABLE extra_a ADD COLUMN y INTEGER;' },
  ];
  openDb(file, { now: () => T0, upgrades }).close();
  assert.throws(() => openDb(file, { now: () => T0 }), {
    message: `The database ${file} has schema version 3; this app knows up to 1. Use a newer version of the app.`,
  });
  const raw = new DatabaseSync(file);
  t.after(() => raw.close());
  assert.equal(raw.prepare('SELECT MAX(version) AS v FROM schema_version').get().v, 3);
  assert.deepStrictEqual(raw.prepare("SELECT name FROM sqlite_master WHERE name = 'extra_a'").all().map(r => ({ ...r })), [{ name: 'extra_a' }]);
});

test('real: a room inserted with raw SQL has no settings', t => {
  const file = tmpFile(t);
  openDb(file, { now: () => T0 }).close();
  const raw = new DatabaseSync(file);
  raw.exec("INSERT INTO rooms (name, volume, vent, created_at) VALUES ('x', 10, 'supply', 1)");
  raw.close();
  const db = openDb(file, { now: () => T0 });
  t.after(() => db.close());
  assertNotFound(() => db.currentSettings(1), 'settings', 1);
});

// ---------------------------------------------------------------------------
// Task 3: Rooms (C1 section 6.4)
// ---------------------------------------------------------------------------

both('createRoom: defaults, first settings version', (t, open) => {
  let clock = T0;
  const db = open({ now: () => clock });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  assert.deepStrictEqual(room, {
    id: room.id, name: 'A', volume: 60, vent: 'supply', adapter: 'sim', created_at: T0, archived_at: null,
  });
  const settings = db.currentSettings(room.id);
  assert.deepStrictEqual(settings, {
    id: settings.id, room_id: room.id, saved_at: T0, note: 'Created', settings: { spT: 18 },
  });
});

both('createRoom: explicit values are stored', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const room = db.createRoom(roomInput({ adapter: 'hw', note: 'x', at: 5 }));
  assert.equal(room.adapter, 'hw');
  assert.equal(room.created_at, 5);
  const settings = db.currentSettings(room.id);
  assert.equal(settings.saved_at, 5);
  assert.equal(settings.note, 'x');
});

both('createRoom: missing settings is NOT NULL; no room stored', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const input = roomInput();
  delete input.settings;
  assertSql(() => db.createRoom(input), 1299);
  assert.deepStrictEqual(db.listRooms({ includeArchived: true }), []);
});

both('createRoom: unknown field; nothing stored', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  assert.throws(() => db.createRoom(roomInput({ colour: 'red' })), err => {
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, 'createRoom: unknown field "colour"');
    return true;
  });
  assert.deepStrictEqual(db.listRooms({ includeArchived: true }), []);
});

both('listRooms: order, filter, unknown field', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const a = db.createRoom(roomInput({ name: 'A' }));
  const b = db.createRoom(roomInput({ name: 'B' }));
  assert.deepStrictEqual(db.listRooms().map(r => r.id), [a.id, b.id]);
  db.archiveRoom(b.id);
  assert.deepStrictEqual(db.listRooms().map(r => r.id), [a.id]);
  assert.deepStrictEqual(db.listRooms({ includeArchived: true }).map(r => r.id), [a.id, b.id]);
  assert.throws(() => db.listRooms({ all: true }), TypeError);
});

both('getRoom: unknown ids throw NotFoundError', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  db.createRoom(roomInput());
  assertNotFound(() => db.getRoom(999), 'room', 999);
  assertNotFound(() => db.getRoom(NaN), 'room', NaN);
  assertNotFound(() => db.getRoom('1'), 'room', '1');
  assertNotFound(() => db.getRoom(undefined), 'room', undefined);
});

both('updateRoom: fields, unchanged, unknown field, bad value', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  assert.equal(db.updateRoom(room.id, { name: 'B' }).name, 'B');
  assert.equal(db.updateRoom(room.id, { volume: 80 }).volume, 80);
  assert.equal(db.updateRoom(room.id, { vent: 'exhaust' }).vent, 'exhaust');
  assert.deepStrictEqual(db.updateRoom(room.id, {}), db.getRoom(room.id));
  assert.throws(() => db.updateRoom(room.id, { archived_at: 5 }), err => {
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, 'updateRoom: unknown field "archived_at"');
    return true;
  });
  assertSql(() => db.updateRoom(room.id, { vent: 'north' }), 275);
  assert.equal(db.getRoom(room.id).vent, 'exhaust');
});

both('archiveRoom: idempotent, keeps working', (t, open) => {
  let clock = T0;
  const db = open({ now: () => clock });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  assert.equal(db.archiveRoom(room.id).archived_at, T0);
  assert.equal(db.archiveRoom(room.id, T0 + 50).archived_at, T0);
  assert.deepStrictEqual(db.getRoom(room.id).archived_at, T0);
  assert.doesNotThrow(() => db.getRoom(room.id));
});

// ---------------------------------------------------------------------------
// Task 4: Settings versions (C1 section 6.5)
// ---------------------------------------------------------------------------

both('saveSettings: defaults, becomes current', (t, open) => {
  let clock = T0;
  const db = open({ now: () => clock });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  clock = T0 + 10;
  const v = db.saveSettings(room.id, { settings: { spT: 20 } });
  assert.deepStrictEqual(v, { id: v.id, room_id: room.id, saved_at: T0 + 10, note: null, settings: { spT: 20 } });
  assert.deepStrictEqual(db.currentSettings(room.id), v);
});

both('saveSettings: explicit values', (t, open) => {
  let clock = T0;
  const db = open({ now: () => clock });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  const v = db.saveSettings(room.id, { settings: { spT: 20 }, note: 'n', at: 7 });
  assert.equal(v.note, 'n');
  assert.equal(v.saved_at, 7);
});

both('settingsHistory: shape and order', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  const v2 = db.saveSettings(room.id, { settings: { spT: 20 } });
  const hist = db.settingsHistory(room.id);
  assert.deepStrictEqual(hist.map(h => Object.keys(h).sort()), hist.map(() => ['id', 'note', 'saved_at'].sort()));
  assert.deepStrictEqual(hist.map(h => h.id), [v2.id, v2.id - 1]);
  assert.equal(hist[0].id, v2.id);
});

both('getSettingsVersion: returns version; wrong ids throw', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const a = db.createRoom(roomInput());
  const b = db.createRoom(roomInput());
  const va = db.currentSettings(a.id);
  assert.deepStrictEqual(db.getSettingsVersion(a.id, va.id), va);
  assertNotFound(() => db.getSettingsVersion(a.id, db.currentSettings(b.id).id), 'settings', db.currentSettings(b.id).id);
  assertNotFound(() => db.getSettingsVersion(a.id, 999), 'settings', 999);
  assertNotFound(() => db.getSettingsVersion(a.id, '1'), 'settings', '1');
});

both('saveSettings: errors', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  const before = db.settingsHistory(room.id).length;
  assertSql(() => db.saveSettings(room.id, {}), 1299);
  assert.equal(db.settingsHistory(room.id).length, before);
  assert.throws(() => db.saveSettings(room.id, { settings: {}, extra: 1 }), TypeError);
});

// ---------------------------------------------------------------------------
// Task 5: Readings, raw and latest (C1 section 6.6)
// ---------------------------------------------------------------------------

function makeRoom(db) {
  return db.createRoom(roomInput()).id;
}

both('insertReading: round trip, T <-> temp', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const r = { room_id: roomId, t: T0, T: 18.5, RH: 88, CO2: 900, t_out: 31, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, fan: 2, lights: 1, circ: 0, power_w: 1400, kwh: 12.5 };
  assert.equal(db.insertReading(roomId, r), undefined);
  const got = db.queryReadings(roomId, { from: T0, to: T0 })[0];
  assert.deepStrictEqual(got, r);
  assert.deepStrictEqual(db.latestReading(roomId), r);
  assert.doesNotThrow(() => db.insertReading(roomId, got));
});

both('insertReading: booleans come back 0/1', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  db.insertReading(roomId, reading(T0, { lights: true, circ: false }));
  const got = db.latestReading(roomId);
  assert.equal(got.lights, 1);
  assert.equal(got.circ, 0);
});

both('insertReading: non-finite and missing values become null', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const input = reading(T0, { T: NaN, RH: Infinity, CO2: -Infinity });
  delete input.t_out; delete input.rh_out; delete input.ac_setpoint; delete input.power_w; delete input.kwh;
  db.insertReading(roomId, input);
  const got = db.latestReading(roomId);
  for (const k of ['T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_setpoint', 'power_w', 'kwh']) {
    assert.equal(got[k], null, `${k} should be null`);
  }
});

both('insertReading: unknown field throws and stores nothing', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  for (const key of ['temp', 'rh', 'co2', 'n']) {
    assert.throws(() => db.insertReading(roomId, reading(T0, { [key]: 1 })), err => {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, `insertReading: unknown field "${key}"`);
      return true;
    });
  }
  assert.equal(db.latestReading(roomId), null);
});

both('insertReading: room_id rule', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const otherId = makeRoom(db);
  assert.throws(() => db.insertReading(roomId, reading(T0, { room_id: otherId })), TypeError);
  assert.equal(db.latestReading(roomId), null);
  assert.doesNotThrow(() => db.insertReading(roomId, reading(T0))); // room_id left out
});

both('queryReadings: inclusive range', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const from = T0, to = T0 + 60;
  db.insertReading(roomId, reading(from - 1));
  db.insertReading(roomId, reading(from));
  db.insertReading(roomId, reading(to));
  db.insertReading(roomId, reading(to + 1));
  const rows = db.queryReadings(roomId, { from, to });
  assert.deepStrictEqual(rows.map(r => r.t), [from, to]);
});

both('queryReadings: raw order by t, then insertion', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  db.insertReading(roomId, reading(T0 + 300, { T: 10 }));
  db.insertReading(roomId, reading(T0 + 100, { T: 30 }));
  db.insertReading(roomId, reading(T0 + 200, { T: 20 }));
  db.insertReading(roomId, reading(T0 + 400, { T: 25 }));
  db.insertReading(roomId, reading(T0 + 400, { T: 15 }));
  const rows = db.queryReadings(roomId, { from: T0, to: T0 + 500 });
  assert.deepStrictEqual(rows.map(r => r.t), [T0 + 100, T0 + 200, T0 + 300, T0 + 400, T0 + 400]);
  assert.deepStrictEqual(rows.slice(3).map(r => r.T), [25, 15]);
});

both('latestReading: largest t, ties by insertion; null for empty room', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.equal(db.latestReading(roomId), null);
  db.insertReading(roomId, reading(T0 + 100, { T: 30 }));
  db.insertReading(roomId, reading(T0 + 200, { T: 10 }));
  assert.equal(db.latestReading(roomId).t, T0 + 200);
  db.insertReading(roomId, reading(T0 + 300, { T: 5 }));
  db.insertReading(roomId, reading(T0 + 300, { T: 6 }));
  assert.equal(db.latestReading(roomId).T, 6);
});

both('queryReadings: errors', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.throws(() => db.queryReadings(roomId, { from: 1.5, to: 10 }), RangeError);
  assert.throws(() => db.queryReadings(roomId, { from: 1 }), RangeError);
  assert.throws(() => db.queryReadings(roomId, { from: 10, to: 1 }), RangeError);
  assert.throws(() => db.queryReadings(roomId, { from: 1, to: 10, step: 0 }), RangeError);
  assert.throws(() => db.queryReadings(roomId, { from: 1, to: 10, step: 1.5 }), RangeError);
  assert.throws(() => db.queryReadings(roomId, { from: 1, to: 10, step: -60 }), RangeError);
  assert.doesNotThrow(() => db.queryReadings(roomId, { from: 1, to: 10, step: null }));
  assert.throws(() => db.queryReadings(roomId, { from: 1, to: 10, limit: 5 }), TypeError);
});

// ---------------------------------------------------------------------------
// Task 6: Readings, buckets (C1 section 6.6 "Bucket averaging")
// ---------------------------------------------------------------------------

function bucketFixture(db, roomId) {
  db.insertReading(roomId, reading(T0, {
    T: 20, RH: 80, CO2: null, ac_mode: 'cool', ac_setpoint: 18, fog: 1, lights: 1, kwh: 1,
  }));
  db.insertReading(roomId, reading(T0 + 30, {
    T: null, RH: 90, CO2: null, ac_mode: 'off', ac_setpoint: null, fog: 2, lights: 0, kwh: 1.25,
  }));
  db.insertReading(roomId, reading(T0 + 150, {
    T: 21, RH: 85, CO2: 900, ac_mode: 'cool', ac_setpoint: 18, fog: 3, lights: 1, kwh: 2,
  }));
}

both('queryReadings: bucket averages, nulls, last ac_mode/kwh, empty bucket left out', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  bucketFixture(db, roomId);
  const rows = db.queryReadings(roomId, { from: T0, to: T0 + 300, step: 60 });
  assert.equal(rows.length, 2);
  assert.deepStrictEqual(rows.map(r => r.t), [T0, T0 + 120]);
  const [b0, b1] = rows;
  assert.equal(b0.T, 20); assert.equal(b1.T, 21);
  assert.equal(b0.RH, 85); assert.equal(b1.RH, 85);
  assert.equal(b0.CO2, null); assert.equal(b1.CO2, 900);
  assert.equal(b0.ac_mode, 'off'); assert.equal(b1.ac_mode, 'cool');
  assert.equal(b0.ac_setpoint, 18); assert.equal(b1.ac_setpoint, 18);
  assert.equal(b0.fog, 1.5); assert.equal(b1.fog, 3);
  assert.equal(b0.lights, 0.5); assert.equal(b1.lights, 1);
  assert.equal(b0.kwh, 1.25); assert.equal(b1.kwh, 2);
});

both('queryReadings: bucket row keys equal raw row keys', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  bucketFixture(db, roomId);
  const raw = db.queryReadings(roomId, { from: T0, to: T0 })[0];
  const bucket = db.queryReadings(roomId, { from: T0, to: T0 + 300, step: 60 })[0];
  assert.deepStrictEqual(Object.keys(bucket).sort(), Object.keys(raw).sort());
});

both('queryReadings: buckets align to multiples of step', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  bucketFixture(db, roomId);
  const rows = db.queryReadings(roomId, { from: T0 + 10, to: T0 + 59, step: 60 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].t, T0);
  assert.equal(rows[0].T, null);
  assert.equal(rows[0].RH, 90);
});

both('queryReadings: bucket filters by room', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const otherId = makeRoom(db);
  bucketFixture(db, roomId);
  db.insertReading(otherId, reading(T0, { T: 99 }));
  const rows = db.queryReadings(roomId, { from: T0, to: T0 + 300, step: 60 });
  assert.ok(rows.every(r => r.T !== 99));
});

// ---------------------------------------------------------------------------
// Task 7: Events (C1 section 6.7)
// ---------------------------------------------------------------------------

both('addEvent: shape', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const e = db.addEvent(roomId, { t: 5, level: 'warning', text: 'x' });
  assert.deepStrictEqual(e, { id: e.id, room_id: roomId, t: 5, level: 'warning', text: 'x' });
});

both('listEvents: default limit, order, cursor', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  for (let i = 0; i < 101; i++) db.addEvent(roomId, { t: T0 + i, level: 'info', text: `e${i}` });
  const page1 = db.listEvents(roomId);
  assert.equal(page1.length, 100);
  for (let i = 1; i < page1.length; i++) assert.ok(page1[i - 1].id > page1[i].id);
  assert.equal(db.listEvents(roomId, { limit: 1000 }).length, 101);
  const page2 = db.listEvents(roomId, { before: page1[page1.length - 1].id });
  assert.equal(page2.length, 1);
});

both('listEvents: before null equals left out; other room not listed', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const otherId = makeRoom(db);
  db.addEvent(roomId, { t: T0, level: 'info', text: 'x' });
  db.addEvent(otherId, { t: T0, level: 'info', text: 'y' });
  assert.deepStrictEqual(db.listEvents(roomId, { before: null }), db.listEvents(roomId));
  assert.equal(db.listEvents(roomId).length, 1);
});

both('listEvents: errors', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.throws(() => db.listEvents(roomId, { limit: 0 }), RangeError);
  assert.throws(() => db.listEvents(roomId, { limit: 1001 }), RangeError);
  assert.throws(() => db.listEvents(roomId, { limit: 1.5 }), RangeError);
  assert.throws(() => db.listEvents(roomId, { before: 1.5 }), RangeError);
  assert.throws(() => db.listEvents(roomId, { before: '5' }), RangeError);
  assert.throws(() => db.listEvents(roomId, { offset: 1 }), TypeError);
});

both('addEvent: constraints', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assertSql(() => db.addEvent(roomId, { t: 1, level: 'debug', text: 'x' }), 275);
  assertSql(() => db.addEvent(roomId, { t: 1, level: 'info' }), 1299);
  assertSql(() => db.addEvent(roomId, { t: 1.5, level: 'info', text: 'x' }), 3091);
  assert.equal(db.listEvents(roomId).length, 0);
});

// ---------------------------------------------------------------------------
// Task 8: Alarms (C1 section 6.8)
// ---------------------------------------------------------------------------

both('raiseAlarm: shape', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const a = db.raiseAlarm(roomId, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 100 });
  assert.deepStrictEqual(a, {
    id: a.id, room_id: roomId, alarm_key: 'rhHi', level: 'warning', label: 'High humidity',
    raised_at: 100, cleared_at: null, acked_at: null,
  });
});

both('raiseAlarm: idempotent while open', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const first = db.raiseAlarm(roomId, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 100 });
  const second = db.raiseAlarm(roomId, { alarm_key: 'rhHi', level: 'serious', label: 'Other', at: 150 });
  assert.deepStrictEqual(second, first);
  assert.equal(db.listAlarms(roomId, { recent: 0 }).length, 1);
});

both('clearAlarm: clear, second clear null, new occurrence', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const first = db.raiseAlarm(roomId, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 100 });
  const cleared = db.clearAlarm(roomId, 'rhHi', 200);
  assert.equal(cleared.cleared_at, 200);
  assert.equal(cleared.id, first.id);
  assert.equal(db.clearAlarm(roomId, 'rhHi', 250), null);
  const second = db.raiseAlarm(roomId, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 300 });
  assert.notEqual(second.id, first.id);
});

both('ackAlarm: acks all unacknowledged; idempotent; error', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const first = db.raiseAlarm(roomId, { alarm_key: 'rhHi', level: 'warning', label: 'x', at: 100 });
  db.clearAlarm(roomId, 'rhHi', 200);
  const second = db.raiseAlarm(roomId, { alarm_key: 'rhHi', level: 'warning', label: 'x', at: 300 });
  const acked = db.ackAlarm(roomId, 'rhHi', 400);
  assert.equal(acked.id, second.id);
  assert.equal(acked.acked_at, 400);
  const rows1 = db.listAlarms(roomId, { recent: 20 });
  assert.ok(rows1.every(r => r.acked_at === 400));
  const again = db.ackAlarm(roomId, 'rhHi', 500);
  assert.equal(again.acked_at, 400);
  assertNotFound(() => db.ackAlarm(roomId, 'nope'), 'alarm', 'nope');
});

both('listAlarms: order, filter', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  db.raiseAlarm(roomId, { alarm_key: 'a', level: 'warning', label: 'a', at: 100 });
  db.raiseAlarm(roomId, { alarm_key: 'b', level: 'warning', label: 'b', at: 200 });
  for (let i = 0; i < 21; i++) {
    db.raiseAlarm(roomId, { alarm_key: `c${i}`, level: 'warning', label: 'c', at: 10 + i });
    db.clearAlarm(roomId, `c${i}`, 1000 + i);
  }
  const listed = db.listAlarms(roomId);
  const openAlarms = listed.filter(a => a.cleared_at === null);
  const cleared = listed.filter(a => a.cleared_at !== null);
  assert.deepStrictEqual(openAlarms.map(a => a.alarm_key), ['b', 'a']);
  assert.equal(cleared.length, 20);
  for (let i = 1; i < cleared.length; i++) assert.ok(cleared[i - 1].cleared_at >= cleared[i].cleared_at);
  const onlyOpen = db.listAlarms(roomId, { recent: 0 });
  assert.deepStrictEqual(onlyOpen.map(a => a.alarm_key), ['b', 'a']);
});

both('listAlarms: errors', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.throws(() => db.listAlarms(roomId, { recent: -1 }), RangeError);
  assert.throws(() => db.listAlarms(roomId, { recent: 501 }), RangeError);
  assert.throws(() => db.listAlarms(roomId, { recent: 1.5 }), RangeError);
  assert.throws(() => db.listAlarms(roomId, { open: true }), TypeError);
});

both('raiseAlarm: constraints', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assertSql(() => db.raiseAlarm(roomId, { alarm_key: 'x', level: 'info', label: 'x' }), 275);
  assertSql(() => db.raiseAlarm(roomId, { alarm_key: 'x', level: 'warning' }), 1299);
});

// ---------------------------------------------------------------------------
// Task 9: Controller state and JSON (C1 section 5, 6.9)
// ---------------------------------------------------------------------------

both('loadControllerState: null before any save', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.equal(db.loadControllerState(roomId), null);
});

both('saveControllerState: shape; one row per room', (t, open) => {
  let clock = T0;
  const db = open({ now: () => clock });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.equal(db.saveControllerState(roomId, { controller: { a: 1 } }), undefined);
  const loaded = db.loadControllerState(roomId);
  assert.deepStrictEqual(loaded, { room_id: roomId, saved_at: T0, controller: { a: 1 }, sim: null });
  clock = T0 + 10;
  db.saveControllerState(roomId, { controller: { a: 2 }, sim: { b: 1 } });
  const loaded2 = db.loadControllerState(roomId);
  assert.deepStrictEqual(loaded2, { room_id: roomId, saved_at: T0 + 10, controller: { a: 2 }, sim: { b: 1 } });
});

both('saveControllerState: $num encoding of non-finite values', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const controller = { win: { min: Infinity, max: -Infinity }, x: NaN, list: [Infinity] };
  db.saveControllerState(roomId, { controller });
  const loaded = db.loadControllerState(roomId);
  assert.ok(Object.is(loaded.controller.win.min, Infinity));
  assert.ok(Object.is(loaded.controller.win.max, -Infinity));
  assert.ok(Object.is(loaded.controller.x, NaN));
  assert.ok(Object.is(loaded.controller.list[0], Infinity));
});

both('saveControllerState: real snapshot round-trips through toJson/fromJson', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const sim = SIM.create(structuredClone(SIM.DEFAULT_ENV));
  const ctl = CC.create(CC.defaultSettings(), null, null);
  const io = RT.simIO(sim);
  const rt = RT.createRuntime({ io, ctl });
  rt.poll();
  for (let s = 0; s < 120; s++) { io.advance(1); rt.poll(); }
  const snapshot = ctl.snapshot();
  db.saveControllerState(roomId, { controller: snapshot });
  const loaded = db.loadControllerState(roomId);
  assert.deepStrictEqual(loaded.controller, fromJson(toJson(snapshot)));
});

both('saveControllerState: errors', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assertSql(() => db.saveControllerState(roomId, {}), 1299);
  assert.throws(() => db.saveControllerState(roomId, { controller: {}, extra: 1 }), TypeError);
});

// ---------------------------------------------------------------------------
// Task 10: Calibrations (C1 section 6.10)
// ---------------------------------------------------------------------------

both('saveCalibration: defaults', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const c = db.saveCalibration(roomId, calibRun());
  assert.deepStrictEqual(c, {
    id: c.id, room_id: roomId, run_at: T0, ua: 90, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 40,
    rmse_t: null, rmse_rh: null, rmse_co2: null, log_rows: null, applied_at: null,
  });
});

both('saveCalibration: non-finite -> null; log_rows kept', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const c = db.saveCalibration(roomId, calibRun({ rmse_t: NaN, rmse_rh: Infinity, log_rows: 1440 }));
  assert.equal(c.rmse_t, null);
  assert.equal(c.rmse_rh, null);
  assert.equal(c.log_rows, 1440);
});

both('listCalibrations: run_at desc, then id desc', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const a = db.saveCalibration(roomId, calibRun({ run_at: 100 }));
  const b = db.saveCalibration(roomId, calibRun({ run_at: 100 }));
  const c = db.saveCalibration(roomId, calibRun({ run_at: 200 }));
  assert.deepStrictEqual(db.listCalibrations(roomId).map(r => r.id), [c.id, b.id, a.id]);
});

both('currentCalibration: current rule, history kept', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const a = db.saveCalibration(roomId, calibRun());
  const b = db.saveCalibration(roomId, calibRun());
  assert.equal(db.currentCalibration(roomId), null);
  db.applyCalibration(roomId, a.id, 100);
  db.applyCalibration(roomId, b.id, 200);
  assert.equal(db.currentCalibration(roomId).id, b.id);
  db.applyCalibration(roomId, a.id, 300);
  assert.equal(db.currentCalibration(roomId).id, a.id);
  assert.equal(db.listCalibrations(roomId).find(r => r.id === b.id).applied_at, 200);
  const c = db.saveCalibration(roomId, calibRun());
  db.applyCalibration(roomId, a.id, 500);
  db.applyCalibration(roomId, c.id, 500);
  assert.equal(db.currentCalibration(roomId).id, c.id);
});

both('applyCalibration: clock, errors', (t, open) => {
  let clock = T0;
  const db = open({ now: () => clock });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const otherId = makeRoom(db);
  const run = db.saveCalibration(roomId, calibRun());
  const otherRun = db.saveCalibration(otherId, calibRun());
  clock = T0 + 99;
  const applied = db.applyCalibration(roomId, run.id);
  assert.equal(applied.applied_at, T0 + 99);
  assertNotFound(() => db.applyCalibration(roomId, otherRun.id), 'calibration', otherRun.id);
  assertNotFound(() => db.applyCalibration(roomId, 999), 'calibration', 999);
  assertNotFound(() => db.applyCalibration(roomId, '1'), 'calibration', '1');
});

both('saveCalibration: constraints', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const run = calibRun(); delete run.ua;
  assertSql(() => db.saveCalibration(roomId, run), 1299);
  assertSql(() => db.saveCalibration(roomId, calibRun({ log_rows: 1.5 })), 3091);
  assertSql(() => db.saveCalibration(roomId, calibRun({ run_at: 1.5 })), 3091);
});

// ---------------------------------------------------------------------------
// Task 11: Crop mix (C1 section 6.11)
// ---------------------------------------------------------------------------

both('getMix: [] for a new room', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.deepStrictEqual(db.getMix(roomId), []);
});

both('replaceMix: pos order, default, duplicate crop allowed', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const rows = [
    { crop: 'oyster', blocks: 1200 },
    { crop: 'pink', blocks: 300, co2_per_block: 55 },
    { crop: 'oyster', blocks: 10 },
  ];
  const result = db.replaceMix(roomId, rows);
  assert.deepStrictEqual(result, [
    { crop: 'oyster', blocks: 1200, co2_per_block: null },
    { crop: 'pink', blocks: 300, co2_per_block: 55 },
    { crop: 'oyster', blocks: 10, co2_per_block: null },
  ]);
  assert.deepStrictEqual(db.getMix(roomId), result);
});

both('replaceMix: empties the mix', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  db.replaceMix(roomId, [{ crop: 'oyster', blocks: 10 }]);
  assert.deepStrictEqual(db.replaceMix(roomId, []), []);
  assert.deepStrictEqual(db.getMix(roomId), []);
});

both('replaceMix: all or nothing on a bad row', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const original = db.replaceMix(roomId, [{ crop: 'oyster', blocks: 10 }]);
  assertSql(() => db.replaceMix(roomId, [{ crop: 'a', blocks: 1 }, { crop: 'b', blocks: 1.5 }]), 3091);
  assert.deepStrictEqual(db.getMix(roomId), original);
  assertSql(() => db.replaceMix(roomId, [{ crop: 'a', blocks: -1 }]), 275);
  assert.deepStrictEqual(db.getMix(roomId), original);
  assertSql(() => db.replaceMix(roomId, [{ blocks: 1 }]), 1299);
  assert.deepStrictEqual(db.getMix(roomId), original);
});

both('replaceMix: unknown field; old mix stays', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const original = db.replaceMix(roomId, [{ crop: 'oyster', blocks: 10 }]);
  assert.throws(() => db.replaceMix(roomId, [{ crop: 'a', blocks: 1 }, { crop: 'b', blocks: 1, co2PerBlock: 1 }]), err => {
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, 'replaceMix: unknown field "co2PerBlock"');
    return true;
  });
  assert.deepStrictEqual(db.getMix(roomId), original);
});

// ---------------------------------------------------------------------------
// Task 12: Capacity reports (C1 section 6.12)
// ---------------------------------------------------------------------------

both('latestCapacityReport: null for a new room', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.equal(db.latestCapacityReport(roomId), null);
});

both('saveCapacityReport: copies, JSON', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const rep = report({ balance: { estimate: Infinity } });
  const c = db.saveCapacityReport(roomId, { report: rep });
  assert.deepStrictEqual(c, { id: c.id, room_id: roomId, run_at: T0, verdict: 'good', utilisation: 70, report: rep });
  assert.ok(Object.is(c.report.balance.estimate, Infinity));
});

both('saveCapacityReport: utilisation not finite -> null', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  const a = db.saveCapacityReport(roomId, { report: report({ utilisation: undefined, verdict: 'impossible' }) });
  assert.equal(a.utilisation, null);
  const b = db.saveCapacityReport(roomId, { report: report({ utilisation: NaN, verdict: 'impossible' }) });
  assert.equal(b.utilisation, null);
  const c = db.saveCapacityReport(roomId, { report: report({ utilisation: Infinity, verdict: 'impossible' }) });
  assert.equal(c.utilisation, null);
});

both('saveCapacityReport: constraints, no rounding', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assertSql(() => db.saveCapacityReport(roomId, { report: report({ utilisation: 74.5 }) }), 3091);
  assertSql(() => db.saveCapacityReport(roomId, { report: report({ verdict: 'ok' }) }), 275);
  assertSql(() => db.saveCapacityReport(roomId, {}), 1299);
  assert.equal(db.latestCapacityReport(roomId), null);
});

both('saveCapacityReport: latest is larger id; explicit run_at', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  db.saveCapacityReport(roomId, { report: report() });
  const second = db.saveCapacityReport(roomId, { report: report(), run_at: 5 });
  const latest = db.latestCapacityReport(roomId);
  assert.equal(latest.id, second.id);
  assert.equal(latest.run_at, 5);
});

both('saveCapacityReport: unknown field', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  assert.throws(() => db.saveCapacityReport(roomId, { report: report(), room: 1 }), err => {
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, 'saveCapacityReport: unknown field "room"');
    return true;
  });
});

// ---------------------------------------------------------------------------
// Task 13: Sweeps
// ---------------------------------------------------------------------------

both('every function throws NotFoundError(room) for an unknown room', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);
  db.replaceMix(roomId, [{ crop: 'oyster', blocks: 1 }]);
  db.saveCalibration(roomId, calibRun());
  db.raiseAlarm(roomId, { alarm_key: 'a', level: 'warning', label: 'a' });
  const calib = db.listCalibrations(roomId)[0];

  const calls = [
    ['getRoom', [999]],
    ['updateRoom', [999, {}]],
    ['archiveRoom', [999]],
    ['saveSettings', [999, { settings: {} }]],
    ['currentSettings', [999]],
    ['settingsHistory', [999]],
    ['getSettingsVersion', [999, 1]],
    ['insertReading', [999, reading(T0)]],
    ['queryReadings', [999, { from: T0, to: T0 }]],
    ['latestReading', [999]],
    ['addEvent', [999, { t: T0, level: 'info', text: 'x' }]],
    ['listEvents', [999]],
    ['raiseAlarm', [999, { alarm_key: 'a', level: 'warning', label: 'a' }]],
    ['clearAlarm', [999, 'a']],
    ['ackAlarm', [999, 'a']],
    ['listAlarms', [999]],
    ['saveControllerState', [999, { controller: {} }]],
    ['loadControllerState', [999]],
    ['saveCalibration', [999, calibRun()]],
    ['listCalibrations', [999]],
    ['applyCalibration', [999, calib.id]],
    ['currentCalibration', [999]],
    ['getMix', [999]],
    ['replaceMix', [999, []]],
    ['saveCapacityReport', [999, { report: report() }]],
    ['latestCapacityReport', [999]],
  ];
  for (const [name, args] of calls) {
    assertNotFound(() => db[name](...args), 'room', 999);
  }
});

both('constraint rules: one row per rule, nothing stored', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const roomId = makeRoom(db);

  // CHECK (275)
  assertSql(() => db.updateRoom(roomId, { volume: 0 }), 275);
  assertSql(() => db.updateRoom(roomId, { vent: 'north' }), 275);
  assertSql(() => db.saveCapacityReport(roomId, { report: report({ verdict: 'ok' }) }), 275);
  assertSql(() => db.replaceMix(roomId, [{ crop: 'a', blocks: -1 }]), 275);
  assertSql(() => db.insertReading(roomId, reading(T0, { ac_mode: 'auto' })), 275);
  assertSql(() => db.insertReading(roomId, reading(T0, { fog: 4 })), 275);
  assertSql(() => db.insertReading(roomId, reading(T0, { fan: -1 })), 275);
  assertSql(() => db.insertReading(roomId, reading(T0, { lights: 2 })), 275);
  assertSql(() => db.insertReading(roomId, reading(T0, { circ: 2 })), 275);
  assertSql(() => db.addEvent(roomId, { t: T0, level: 'debug', text: 'x' }), 275);
  assertSql(() => db.raiseAlarm(roomId, { alarm_key: 'x', level: 'info', label: 'x' }), 275);

  // NOT NULL (1299)
  { const r = roomInput(); delete r.name; assertSql(() => db.createRoom(r), 1299); }
  assertSql(() => db.updateRoom(roomId, { volume: NaN }), 1299);
  { const r = roomInput(); delete r.vent; assertSql(() => db.createRoom(r), 1299); }
  { const r = roomInput(); delete r.settings; assertSql(() => db.createRoom(r), 1299); }
  { const r = reading(T0); delete r.t; assertSql(() => db.insertReading(roomId, r), 1299); }
  { const r = reading(T0); delete r.ac_mode; assertSql(() => db.insertReading(roomId, r), 1299); }
  { const r = reading(T0); delete r.fog; assertSql(() => db.insertReading(roomId, r), 1299); }
  { const r = reading(T0); delete r.fan; assertSql(() => db.insertReading(roomId, r), 1299); }
  { const r = reading(T0); delete r.lights; assertSql(() => db.insertReading(roomId, r), 1299); }
  { const r = reading(T0); delete r.circ; assertSql(() => db.insertReading(roomId, r), 1299); }
  assertSql(() => db.addEvent(roomId, { t: T0, level: 'info' }), 1299);
  assertSql(() => db.raiseAlarm(roomId, { level: 'warning', label: 'x' }), 1299);
  assertSql(() => db.raiseAlarm(roomId, { alarm_key: 'x', level: 'warning' }), 1299);
  { const r = calibRun(); delete r.ua; assertSql(() => db.saveCalibration(roomId, r), 1299); }
  assertSql(() => db.replaceMix(roomId, [{ blocks: 1 }]), 1299);
  assertSql(() => db.saveCapacityReport(roomId, {}), 1299);
  assertSql(() => db.saveControllerState(roomId, {}), 1299);

  // Type (3091)
  assertSql(() => db.insertReading(roomId, reading(T0, { t: 1.5 })), 3091);
  assertSql(() => db.insertReading(roomId, reading(T0, { fog: 1.5 })), 3091);
  assertSql(() => db.insertReading(roomId, reading(T0, { fan: 1.5 })), 3091);
  assertSql(() => db.insertReading(roomId, reading('abc')), 3091);
  assertSql(() => db.insertReading(roomId, reading(T0, { T: 'abc' })), 3091);
  assertSql(() => db.addEvent(roomId, { t: 1.5, level: 'info', text: 'x' }), 3091);
  assertSql(() => db.raiseAlarm(roomId, { alarm_key: 'x', level: 'warning', label: 'x', at: 1.5 }), 3091);
  assertSql(() => db.saveCalibration(roomId, calibRun({ run_at: 1.5 })), 3091);
  assertSql(() => db.saveCalibration(roomId, calibRun({ log_rows: 1.5 })), 3091);
  assertSql(() => db.replaceMix(roomId, [{ crop: 'a', blocks: 1.5 }]), 3091);
  assertSql(() => db.saveCapacityReport(roomId, { report: report({ utilisation: 74.5 }) }), 3091);
});

both('left-out at/run_at equals now(), clock moved between calls', (t, open) => {
  let clock = T0;
  const db = open({ now: () => clock });
  t.after(() => db.close());

  clock = T0 + 1;
  const room = db.createRoom(roomInput());
  assert.equal(room.created_at, T0 + 1);

  clock = T0 + 2;
  assert.equal(db.archiveRoom(room.id).archived_at, T0 + 2);

  clock = T0 + 3;
  assert.equal(db.saveSettings(room.id, { settings: { spT: 1 } }).saved_at, T0 + 3);

  clock = T0 + 4;
  assert.equal(db.raiseAlarm(room.id, { alarm_key: 'a', level: 'warning', label: 'a' }).raised_at, T0 + 4);

  clock = T0 + 5;
  assert.equal(db.clearAlarm(room.id, 'a').cleared_at, T0 + 5);

  clock = T0 + 6;
  assert.equal(db.ackAlarm(room.id, 'a').acked_at, T0 + 6);

  clock = T0 + 7;
  db.saveControllerState(room.id, { controller: { a: 1 } });
  assert.equal(db.loadControllerState(room.id).saved_at, T0 + 7);

  clock = T0 + 8;
  const run = db.saveCalibration(room.id, calibRun());
  assert.equal(run.run_at, T0 + 8);

  clock = T0 + 9;
  assert.equal(db.applyCalibration(room.id, run.id).applied_at, T0 + 9);

  clock = T0 + 10;
  assert.equal(db.saveCapacityReport(room.id, { report: report() }).run_at, T0 + 10);
});

// ---------------------------------------------------------------------------
// Task 14: Final verification (plain rows of every shape)
// ---------------------------------------------------------------------------

both('rows of every shape are plain objects', (t, open) => {
  const db = open({ now: () => T0 });
  t.after(() => db.close());
  const room = db.createRoom(roomInput());
  const settings = db.currentSettings(room.id);
  db.insertReading(room.id, reading(T0));
  const readingRow = db.latestReading(room.id);
  const event = db.addEvent(room.id, { t: T0, level: 'info', text: 'x' });
  const alarm = db.raiseAlarm(room.id, { alarm_key: 'a', level: 'warning', label: 'a' });
  db.saveControllerState(room.id, { controller: { a: 1 } });
  const controllerState = db.loadControllerState(room.id);
  const calib = db.saveCalibration(room.id, calibRun());
  const [mixRow] = db.replaceMix(room.id, [{ crop: 'oyster', blocks: 1 }]);
  const capacity = db.saveCapacityReport(room.id, { report: report() });

  for (const row of [room, settings, readingRow, event, alarm, controllerState, calib, mixRow, capacity]) {
    assert.equal(Object.getPrototypeOf(row), Object.prototype);
  }
});

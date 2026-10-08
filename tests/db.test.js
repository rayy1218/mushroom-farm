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

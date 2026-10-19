// The safety and history schema in server/db.js (spec 2026-10-19-safety-and-history-design.md 3.2 and 4):
// upgrade 6 to 7 adds the alarms and machine_log tables, the readings time index and five room_controls columns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-safety-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The schema of version 6, copied from db.js before this upgrade.
const VERSION_6_SCHEMA = `
CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  length_m   REAL    NOT NULL CHECK (length_m BETWEEN 0.5 AND 100),
  width_m    REAL    NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
  height_m   REAL    NOT NULL CHECK (height_m BETWEEN 0.5 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247),
  co2_address INTEGER CHECK (co2_address BETWEEN 1 AND 247),
  relay_address INTEGER CHECK (relay_address BETWEEN 1 AND 247),
  ac_address INTEGER CHECK (ac_address BETWEEN 1 AND 247)
) STRICT;
CREATE TABLE readings (
  id      INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL,
  kind    TEXT    NOT NULL CHECK (kind IN ('trh', 'co2')),
  address INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  ok      INTEGER NOT NULL CHECK (ok IN (0, 1)),
  t       REAL,
  rh      REAL,
  co2     REAL,
  error   TEXT
) STRICT;
CREATE INDEX readings_by_sensor ON readings (room_id, kind, address, id);
CREATE INDEX readings_ok ON readings (room_id, kind, address, id) WHERE ok = 1;
CREATE TABLE machine_commands (
  room_id      INTEGER PRIMARY KEY,
  intake       INTEGER NOT NULL DEFAULT 0,
  exhaust      INTEGER NOT NULL DEFAULT 0,
  circulation  INTEGER NOT NULL DEFAULT 0,
  humidifier   INTEGER NOT NULL DEFAULT 0,
  ac_power     INTEGER NOT NULL DEFAULT 0,
  ac_mode      TEXT    NOT NULL DEFAULT 'cool',
  ac_setpoint  REAL    NOT NULL DEFAULT 25,
  ac_fan       TEXT    NOT NULL DEFAULT 'auto',
  relay_sent_at INTEGER,
  ac_sent_at   INTEGER
) STRICT;
CREATE TABLE room_controls (
  room_id  INTEGER PRIMARY KEY,
  auto     INTEGER NOT NULL DEFAULT 0 CHECK (auto IN (0, 1)),
  co2_low  REAL    NOT NULL DEFAULT 600,
  co2_high REAL    NOT NULL DEFAULT 750,
  t_low    REAL    NOT NULL DEFAULT 21,
  t_high   REAL    NOT NULL DEFAULT 23,
  rh_low   REAL    NOT NULL DEFAULT 85,
  rh_high  REAL    NOT NULL DEFAULT 95,
  exchange INTEGER NOT NULL DEFAULT 0 CHECK (exchange IN (0, 1)),
  exchange_since INTEGER,
  humidifier INTEGER NOT NULL DEFAULT 0 CHECK (humidifier IN (0, 1)),
  humidifier_during_exchange INTEGER NOT NULL DEFAULT 1 CHECK (humidifier_during_exchange IN (0, 1)),
  ac_fan TEXT NOT NULL DEFAULT 'auto' CHECK (ac_fan IN ('auto','low','high'))
) STRICT;
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
PRAGMA user_version = 6;`;

const NEW_CONTROL_COLUMNS = {
  co2_safety: 1250, exchange_max_min: 10, exchange_ended_at: null, capped_in_row: 0, humidifier_since: null,
};

function columns(raw, table) {
  return raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function indexes(raw) {
  return raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map((r) => r.name);
}

function checkVersion7(raw) {
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 7);
  assert.deepEqual(columns(raw, 'alarms'), ['id', 'room_id', 'key', 'level', 'text', 'raised_at', 'cleared_at', 'acked_at']);
  assert.deepEqual(columns(raw, 'machine_log'), ['id', 'room_id', 'machine', 'at', 'on_', 'setpoint', 'mode', 'fan', 'source']);
  for (const name of Object.keys(NEW_CONTROL_COLUMNS)) assert.ok(columns(raw, 'room_controls').includes(name), name);
  assert.equal(raw.prepare("SELECT sql FROM sqlite_master WHERE name = 'readings_by_time'").get().sql.replace(/\s+/g, ' '),
    'CREATE INDEX readings_by_time ON readings (room_id, kind, at, ok, t, rh, co2)');
  for (const name of ['readings_by_time', 'alarms_by_room', 'alarms_active', 'machine_log_by_room']) {
    assert.ok(indexes(raw).includes(name), name);
  }
}

test('a new database is at version 7 with the alarms, machine_log and new control columns', (t) => {
  const path = join(tempDir(t), 'farm.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  checkVersion7(raw);
});

test('upgrade 6 to 7 keeps rooms, readings, commands, controls and settings; new columns get their defaults', (t) => {
  const path = join(tempDir(t), 'farm.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_6_SCHEMA);
  old.exec(`INSERT INTO rooms (id, name, length_m, width_m, height_m, created_at, updated_at, trh_address, co2_address)
            VALUES (1, 'Room 1', 5, 4, 3, 1, 1, 10, 11);
            INSERT INTO readings (room_id, kind, address, at, ok, t, rh) VALUES (1, 'trh', 10, 100, 1, 22.5, 90);
            INSERT INTO machine_commands (room_id, intake) VALUES (1, 1);
            INSERT INTO room_controls (room_id, auto, co2_high, exchange, exchange_since, ac_fan) VALUES (1, 1, 800, 1, 50, 'low');
            INSERT INTO settings (key, value) VALUES ('pollSeconds', '7');`);
  old.close();

  const db = openDb(path);
  assert.equal(db.getRoom(1).name, 'Room 1');
  assert.equal(db.getSensors(1)[0].readings[0].t, 22.5);
  assert.equal(db.getCommands(1).relay.intake, true);
  const c = db.getControl(1);
  assert.equal(c.auto, true);
  assert.equal(c.co2High, 800);
  assert.equal(c.acFan, 'low');
  assert.equal(c.exchangeSince, 50);
  assert.equal(db.getSetting('pollSeconds'), '7');
  db.close();

  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  checkVersion7(raw);
  const row = raw.prepare('SELECT * FROM room_controls WHERE room_id = 1').get();
  // The safety level follows the room's CO2 upper limit (800 + 500); the rest get the column defaults.
  for (const [name, value] of Object.entries({ ...NEW_CONTROL_COLUMNS, co2_safety: 1300 })) assert.equal(row[name], value, name);
});

test('the new tables enforce their checks and one active alarm per room and key', (t) => {
  const path = join(tempDir(t), 'farm.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const alarm = raw.prepare('INSERT INTO alarms (room_id, key, level, text, raised_at, cleared_at) VALUES (?, ?, ?, ?, ?, ?)');
  alarm.run(1, 'tHigh', 'warning', 'x', 1, 5);
  alarm.run(1, 'tHigh', 'warning', 'x', 6, null);
  assert.throws(() => alarm.run(1, 'tHigh', 'warning', 'x', 7, null), /UNIQUE/);
  alarm.run(2, 'tHigh', 'warning', 'x', 7, null);
  assert.throws(() => alarm.run(1, 'co2High', 'loud', 'x', 1, null), /CHECK/);
  const log = raw.prepare('INSERT INTO machine_log (room_id, machine, at, on_, source) VALUES (?, ?, ?, ?, ?)');
  log.run(1, 'intake', 1, 1, 'auto');
  assert.throws(() => log.run(1, 'lights', 1, 1, 'auto'), /CHECK/);
  assert.throws(() => log.run(1, 'intake', 1, 1, 'robot'), /CHECK/);
});

test('deleting a room deletes its alarms and machine log', (t) => {
  const path = join(tempDir(t), 'farm.db');
  const db = openDb(path);
  const room = db.createRoom({ name: 'A', length: 2, width: 2, height: 2 });
  db.close();
  const raw = new DatabaseSync(path);
  raw.prepare("INSERT INTO alarms (room_id, key, level, text, raised_at) VALUES (?, 'tHigh', 'warning', 'x', 1)").run(room.id);
  raw.prepare("INSERT INTO machine_log (room_id, machine, at, on_, source) VALUES (?, 'intake', 1, 1, 'manual')").run(room.id);
  raw.close();
  const again = openDb(path);
  assert.equal(again.deleteRoom(room.id), true);
  again.close();
  const check = new DatabaseSync(path);
  t.after(() => check.close());
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM alarms').get().n, 0);
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM machine_log').get().n, 0);
});

test('upgrade 6 to 7 sets the safety level of each room to its CO2 upper limit + 500, within 1250 to 10000', (t) => {
  const path = join(tempDir(t), 'farm.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_6_SCHEMA);
  const room = old.prepare(`INSERT INTO rooms (id, name, length_m, width_m, height_m, created_at, updated_at)
                            VALUES (?, ?, 2, 2, 2, 1, 1)`);
  const control = old.prepare('INSERT INTO room_controls (room_id, co2_low, co2_high) VALUES (?, ?, ?)');
  for (const [id, high] of [[1, 750], [2, 900], [3, 1500], [4, 5000]]) {
    room.run(id, `Room ${id}`);
    control.run(id, high - 100, high);
  }
  old.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.deepEqual([1, 2, 3, 4].map((id) => db.getControl(id).co2Safety), [1250, 1400, 2000, 5500]);
});

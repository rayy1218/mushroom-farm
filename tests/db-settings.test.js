// Farm settings in server/db.js: the settings table, upgrade 4 to 5.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-settings-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The schema of version 4, copied from db.js before the settings table.
const VERSION_4_SCHEMA = `
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
  humidifier_during_exchange INTEGER NOT NULL DEFAULT 1 CHECK (humidifier_during_exchange IN (0, 1))
) STRICT;
PRAGMA user_version = 4;`;

test('a new database has no settings stored', () => {
  const db = openDb(':memory:');
  assert.equal(db.getSetting('pollSeconds'), null);
  db.close();
});

test('setSetting stores a value, replaces it, and it survives a reopen', (t) => {
  const path = join(tempDir(t), 'farm.db');
  let db = openDb(path);
  db.setSetting('pollSeconds', '12');
  assert.equal(db.getSetting('pollSeconds'), '12');
  db.setSetting('pollSeconds', '30');
  assert.equal(db.getSetting('pollSeconds'), '30');
  db.close();
  db = openDb(path);
  assert.equal(db.getSetting('pollSeconds'), '30');
  db.close();
});

test('upgrade 4 to 5 adds the settings table and keeps everything', (t) => {
  const path = join(tempDir(t), 'v4.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_4_SCHEMA);
  old.exec(`INSERT INTO rooms (id, name, length_m, width_m, height_m, created_at, updated_at, trh_address)
            VALUES (1, 'A', 6, 4, 2.5, 10, 20, 3)`);
  old.exec(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh) VALUES (1, 'trh', 3, 100, 1, 21.5, 88)`);
  old.exec(`INSERT INTO machine_commands (room_id, ac_setpoint) VALUES (1, 17)`);
  old.exec(`INSERT INTO room_controls (room_id, auto, co2_low) VALUES (1, 1, 500)`);
  old.close();

  const db = openDb(path);
  assert.equal(db.getSetting('pollSeconds'), null);
  assert.deepEqual(db.listRooms().map((r) => [r.id, r.name]), [[1, 'A']]);
  assert.deepEqual(db.getSensors(1)[0].readings, [{ at: 100, ok: true, t: 21.5, rh: 88 }]);
  assert.equal(db.getCommands(1).ac.setpoint, 17);
  assert.equal(db.getControl(1).co2Low, 500);
  db.setSetting('pollSeconds', '9');
  db.close();

  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 14);
  assert.deepEqual(raw.prepare('SELECT key, value FROM settings').all().map((r) => ({ ...r })), [{ key: 'pollSeconds', value: '9' }]);
  raw.close();
  openDb(path).close(); // opening again changes nothing
});

test('a failed upgrade 4 to 5 rolls back and leaves the file at version 4', (t) => {
  const path = join(tempDir(t), 'bad5.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_4_SCHEMA);
  old.exec('CREATE TABLE settings (x INTEGER)'); // makes CREATE TABLE settings fail
  old.close();
  assert.throws(() => openDb(path));
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 4);
  raw.close();
});

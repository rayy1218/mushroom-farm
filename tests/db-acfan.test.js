// The aircon fan setting in server/db.js: room_controls.ac_fan, upgrade 5 to 6.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-acfan-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The schema of version 5, copied from db.js before the ac_fan column.
const VERSION_5_SCHEMA = `
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

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
PRAGMA user_version = 5;`;

test('upgrade 5 to 6 adds ac_fan (auto) and keeps rooms, readings, commands, controls and settings', (t) => {
  const path = join(tempDir(t), 'v5.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_5_SCHEMA);
  old.exec(`INSERT INTO rooms (id, name, length_m, width_m, height_m, created_at, updated_at, trh_address)
            VALUES (1, 'A', 6, 4, 2.5, 10, 20, 3), (5, 'B', 5, 5, 3, 11, 21, NULL)`);
  old.exec(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh) VALUES (1, 'trh', 3, 100, 1, 21.5, 88)`);
  old.exec(`INSERT INTO machine_commands (room_id, ac_setpoint) VALUES (1, 17), (5, 25)`);
  old.exec(`INSERT INTO room_controls (room_id, auto, co2_low, humidifier_during_exchange) VALUES (1, 1, 500, 0), (5, 0, 600, 1)`);
  old.exec(`INSERT INTO settings (key, value) VALUES ('pollSeconds', '9')`);
  old.close();

  const db = openDb(path);
  assert.equal(db.getControl(1).acFan, 'auto');
  assert.equal(db.getControl(5).acFan, 'auto');
  assert.equal(db.getControl(1).co2Low, 500);
  assert.equal(db.getControl(1).humidifierDuringExchange, false);
  assert.equal(db.getCommands(1).ac.setpoint, 17);
  assert.deepEqual(db.getSensors(1)[0].readings, [{ at: 100, ok: true, t: 21.5, rh: 88 }]);
  assert.equal(db.getSetting('pollSeconds'), '9');
  db.setControl(1, { ...db.getControl(1), acFan: 'low' });
  assert.equal(db.getControl(1).acFan, 'low');
  assert.equal(db.getControl(5).acFan, 'auto');
  assert.throws(() => db.setControl(5, { ...db.getControl(5), acFan: 'turbo' })); // the CHECK refuses it
  db.close();

  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 14);
  raw.close();
  openDb(path).close(); // opening again changes nothing
});

test('a failed upgrade 5 to 6 rolls back and leaves the file at version 5', (t) => {
  const path = join(tempDir(t), 'bad6.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_5_SCHEMA);
  old.exec('ALTER TABLE room_controls ADD COLUMN ac_fan TEXT'); // makes ADD COLUMN fail
  old.close();
  assert.throws(() => openDb(path));
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 5);
  raw.close();
});

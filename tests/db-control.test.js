// Automatic control in server/db.js: room_controls, upgrade 2 to 3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

const DEFAULT_CONTROL = {
  auto: false, co2Low: 600, co2High: 750, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95,
  exchange: false, exchangeSince: null, humidifier: false, humidifierDuringExchange: false, acFan: 'auto',
  co2Safety: 1250, exchangeMaxMin: 10, acDrop: 0, exchangeEndedAt: null, cappedInRow: 0, humidifierSince: null,
};
// A room that already existed at an upgrade keeps the old behaviour: humidifier forced on and the aircon 5 °C lower
// during an exchange.
const UPGRADED_CONTROL = { ...DEFAULT_CONTROL, humidifierDuringExchange: true, acDrop: 5 };

// The schema of iteration 3 (user_version 2), copied from the db.js of that time.
const ITERATION_3_SCHEMA = `
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
PRAGMA user_version = 2;`;

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db4-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

test('upgrade 2 to 3 keeps rooms, readings and commands and adds a control row per room', (t) => {
  const path = join(tempDir(t), 'v3.db');
  const old = new DatabaseSync(path);
  old.exec(ITERATION_3_SCHEMA);
  old.exec(`INSERT INTO rooms (id, name, length_m, width_m, height_m, created_at, updated_at, trh_address, co2_address, relay_address, ac_address)
            VALUES (1, 'A', 6, 4, 2.5, 10, 20, 3, 4, 5, 6), (5, 'B', 5, 5, 3, 11, 21, NULL, NULL, NULL, NULL)`);
  old.exec(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh) VALUES (1, 'trh', 3, 100, 1, 21.5, 88)`);
  old.exec(`INSERT INTO machine_commands (room_id, intake, exhaust, humidifier, ac_setpoint, relay_sent_at) VALUES (1, 1, 1, 1, 17, 50)`);
  old.exec(`INSERT INTO machine_commands (room_id) VALUES (5)`);
  old.close();

  const db = openDb(path);
  assert.deepEqual(db.listRooms().map((r) => [r.id, r.name, r.relayAddress]), [[1, 'A', 5], [5, 'B', null]]);
  assert.deepEqual(db.getSensors(1)[0].readings, [{ at: 100, ok: true, t: 21.5, rh: 88 }]);
  assert.deepEqual(db.getCommands(1).relay, { intake: true, exhaust: true, circulation: false, humidifier: true, sentAt: 50 });
  assert.equal(db.getCommands(1).ac.setpoint, 17);
  // exchange and humidifier start from the commanded intake and humidifier
  assert.deepEqual(db.getControl(1), { ...UPGRADED_CONTROL, exchange: true, humidifier: true });
  assert.deepEqual(db.getControl(5), UPGRADED_CONTROL);
  db.close();

  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 8);
  raw.close();
  openDb(path).close(); // opening again changes nothing
  const again = new DatabaseSync(path);
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM room_controls').get().n, 2);
  again.close();
});

test('a failed upgrade 2 to 3 rolls back and leaves the file at version 2', (t) => {
  const path = join(tempDir(t), 'bad.db');
  const old = new DatabaseSync(path);
  old.exec(ITERATION_3_SCHEMA);
  old.exec('CREATE TABLE room_controls (x INTEGER)'); // makes CREATE TABLE fail
  old.close();
  assert.throws(() => openDb(path));
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 2);
  raw.close();
});

test('a new room gets the default control row; deleting the room deletes it', (t) => {
  const db = fresh(t);
  const room = db.createRoom(fields);
  assert.deepEqual(db.getControl(room.id), DEFAULT_CONTROL);
  assert.equal(db.getControl(99), null);
  assert.equal(db.deleteRoom(room.id), true);
  assert.equal(db.getControl(room.id), null);
  const raw = db.createRoom({ ...fields, name: 'Again' });
  assert.deepEqual(db.getControl(raw.id), DEFAULT_CONTROL);
});

test('setControl stores the settings and setControlState the band states', (t) => {
  const db = fresh(t);
  const { id } = db.createRoom(fields);
  const settings = { auto: true, co2Low: 500, co2High: 800, tLow: 20, tHigh: 24, rhLow: 80, rhHigh: 90, humidifierDuringExchange: false, acFan: 'high', co2Safety: 1100, exchangeMaxMin: 15, acDrop: 2 };
  assert.equal(db.setControl(id, settings), true);
  assert.deepEqual(db.getControl(id), { ...DEFAULT_CONTROL, ...settings });
  db.setControlState(id, { exchange: true, humidifier: true }, 1000);
  assert.deepEqual(db.getControl(id), { ...DEFAULT_CONTROL, ...settings, exchange: true, exchangeSince: 1000, humidifier: true });
  // exchangeSince only moves when the exchange changes
  db.setControlState(id, { exchange: true, humidifier: false }, 2000);
  assert.equal(db.getControl(id).exchangeSince, 1000);
  db.setControlState(id, { exchange: false, humidifier: false }, 3000);
  assert.equal(db.getControl(id).exchangeSince, null);
  db.setControlState(id, { exchange: true, humidifier: false }, 4000);
  assert.equal(db.getControl(id).exchangeSince, 4000);
  assert.equal(db.setControl(99, settings), false);
});

test('a room without a control row (made by older code) gets the default row', () => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-'));
  const path = join(dir, 'farm.db');
  try {
    const first = openDb(path);
    const room = first.createRoom(fields);
    first.close();
    const raw = new DatabaseSync(path);
    raw.exec('DELETE FROM room_controls');
    raw.close();
    const db = openDb(path);
    assert.deepEqual(db.getControl(room.id), DEFAULT_CONTROL);
    assert.equal(db.getControl(99), null);
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// The schema of version 3 (iteration 5 as first built), copied from db.js before the humidifier setting.
const VERSION_3_SCHEMA = `${ITERATION_3_SCHEMA.replace('PRAGMA user_version = 2;', '')}
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
  humidifier INTEGER NOT NULL DEFAULT 0 CHECK (humidifier IN (0, 1))
) STRICT;
PRAGMA user_version = 3;`;

test('upgrade 3 to 4 adds humidifier_during_exchange (on) and keeps rooms, readings, commands and controls', (t) => {
  const path = join(tempDir(t), 'v3.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_3_SCHEMA);
  old.exec(`INSERT INTO rooms (id, name, length_m, width_m, height_m, created_at, updated_at, trh_address, co2_address, relay_address, ac_address)
            VALUES (1, 'A', 6, 4, 2.5, 10, 20, 3, 4, 5, 6), (5, 'B', 5, 5, 3, 11, 21, NULL, NULL, NULL, NULL)`);
  old.exec(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh) VALUES (1, 'trh', 3, 100, 1, 21.5, 88)`);
  old.exec(`INSERT INTO machine_commands (room_id, intake, humidifier, ac_setpoint) VALUES (1, 1, 1, 17), (5, 0, 0, 25)`);
  old.exec(`INSERT INTO room_controls (room_id, auto, co2_low, co2_high, exchange, exchange_since, humidifier)
            VALUES (1, 1, 500, 800, 1, 77, 1), (5, 0, 600, 750, 0, NULL, 0)`);
  old.close();

  const db = openDb(path);
  assert.deepEqual(db.listRooms().map((r) => [r.id, r.name]), [[1, 'A'], [5, 'B']]);
  assert.deepEqual(db.getSensors(1)[0].readings, [{ at: 100, ok: true, t: 21.5, rh: 88 }]);
  assert.equal(db.getCommands(1).ac.setpoint, 17);
  assert.deepEqual(db.getControl(1), {
    ...UPGRADED_CONTROL, auto: true, co2Low: 500, co2High: 800, co2Safety: 1300, exchange: true, exchangeSince: 77, humidifier: true,
  });
  assert.deepEqual(db.getControl(5), UPGRADED_CONTROL);
  db.close();

  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 8);
  raw.close();
  openDb(path).close(); // opening again changes nothing
});

test('a failed upgrade 3 to 4 rolls back and leaves the file at version 3', (t) => {
  const path = join(tempDir(t), 'bad4.db');
  const old = new DatabaseSync(path);
  old.exec(VERSION_3_SCHEMA);
  old.exec('ALTER TABLE room_controls ADD COLUMN humidifier_during_exchange TEXT'); // makes ADD COLUMN fail
  old.close();
  assert.throws(() => openDb(path));
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 3);
  raw.close();
});

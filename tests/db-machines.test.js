// Iteration 3 in server/db.js: machine addresses, machine_commands, upgrade 1 to 2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, AddressTakenError } from '../server/db.js';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db3-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// The schema of iteration 2 (user_version 1), copied from the db.js of that time.
const ITERATION_2_SCHEMA = `
CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  length_m   REAL    NOT NULL CHECK (length_m BETWEEN 0.5 AND 100),
  width_m    REAL    NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
  height_m   REAL    NOT NULL CHECK (height_m BETWEEN 0.5 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  trh_address INTEGER CHECK (trh_address BETWEEN 1 AND 247),
  co2_address INTEGER CHECK (co2_address BETWEEN 1 AND 247)
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
PRAGMA user_version = 1;`;

const DEFAULT_COMMANDS = {
  relay: { intake: false, exhaust: false, circulation: false, humidifier: false, dehumidifier: false, sentAt: null },
  ac: { power: false, mode: 'cool', setpoint: 25, fan: 'auto', sentAt: null },
};

test('upgrade 1 to 2 keeps rooms and readings and gives every room default commands', (t) => {
  const path = join(tempDir(t), 'v2.db');
  const old = new DatabaseSync(path);
  old.exec(ITERATION_2_SCHEMA);
  old.exec(`INSERT INTO rooms (id, name, length_m, width_m, height_m, created_at, updated_at, trh_address, co2_address)
            VALUES (1, 'Old A', 6, 4, 2.5, 10, 20, 3, 4), (5, 'Old B', 5, 5, 3, 11, 21, NULL, NULL)`);
  old.exec(`INSERT INTO readings (room_id, kind, address, at, ok, t, rh) VALUES (1, 'trh', 3, 100, 1, 21.5, 88)`);
  old.exec(`INSERT INTO readings (room_id, kind, address, at, ok, error) VALUES (1, 'co2', 4, 101, 0, 'timeout')`);
  old.close();

  const db = openDb(path);
  assert.deepEqual(db.listRooms(), [
    { id: 1, name: 'Old A', length: 6, width: 4, height: 2.5, volume: 60, trhAddress: 3, co2Address: 4,
      relayAddress: null, acAddress: null, meterAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050, dehumidifierW: 380, dehumidifierLday: 20, dehumidifier: false, createdAt: 10, updatedAt: 20 },
    { id: 5, name: 'Old B', length: 5, width: 5, height: 3, volume: 75, trhAddress: null, co2Address: null,
      relayAddress: null, acAddress: null, meterAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050, dehumidifierW: 380, dehumidifierLday: 20, dehumidifier: false, createdAt: 11, updatedAt: 21 },
  ]);
  const [trh, co2] = db.getSensors(1);
  assert.deepEqual(trh.readings, [{ at: 100, ok: true, t: 21.5, rh: 88 }]);
  assert.equal(co2.readings.length, 1);
  assert.deepEqual(db.getCommands(1), DEFAULT_COMMANDS);
  assert.deepEqual(db.getCommands(5), DEFAULT_COMMANDS);
  db.close();

  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 12);
  raw.close();
  openDb(path).close(); // opening again changes nothing
  const again = new DatabaseSync(path);
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM machine_commands').get().n, 2);
  assert.equal(again.prepare('SELECT COUNT(*) AS n FROM readings').get().n, 2);
  again.close();
});

test('upgrade 0 to 2 (an iteration 1 file) also works', (t) => {
  const path = join(tempDir(t), 'v1.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE rooms (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    length_m REAL NOT NULL CHECK (length_m BETWEEN 0.5 AND 100), width_m REAL NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
    height_m REAL NOT NULL CHECK (height_m BETWEEN 0.5 AND 10), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT;
    INSERT INTO rooms VALUES (1, 'Old', 6, 4, 2.5, 10, 20);`);
  old.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.getRoom(1).relayAddress, null);
  assert.deepEqual(db.getCommands(1), DEFAULT_COMMANDS);
});

test('a failed upgrade rolls back and leaves the file at version 1', (t) => {
  const path = join(tempDir(t), 'bad.db');
  const old = new DatabaseSync(path);
  old.exec(ITERATION_2_SCHEMA);
  old.exec('CREATE TABLE machine_commands (x INTEGER)'); // makes CREATE TABLE fail
  old.close();
  assert.throws(() => openDb(path));
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 1);
  assert.equal(raw.prepare("SELECT COUNT(*) AS n FROM pragma_table_info('rooms') WHERE name = 'relay_address'").get().n, 0);
  raw.close();
});

test('a new room has relay and ac addresses and a default commands row', (t) => {
  const db = fresh(t);
  const room = db.createRoom({ ...fields, relayAddress: 10, acAddress: 247 });
  assert.equal(room.relayAddress, 10);
  assert.equal(room.acAddress, 247);
  assert.equal(db.createRoom({ ...fields, name: 'B' }).acAddress, null);
  assert.deepEqual(db.getCommands(1), DEFAULT_COMMANDS);
  assert.deepEqual(db.getCommands(2), DEFAULT_COMMANDS);
  assert.equal(db.getCommands(99), null);
  assert.equal(db.updateRoom(1, { ...fields }).relayAddress, null);
  assert.equal(db.updateRoom(1, { ...fields, relayAddress: 11, acAddress: 12 }).acAddress, 12);
});

test('deleting a room deletes its commands', (t) => {
  const db = fresh(t);
  db.createRoom(fields);
  db.deleteRoom(1);
  assert.equal(db.getCommands(1), null);
  const again = db.createRoom(fields); // ids are not reused with defaults leaking
  assert.deepEqual(db.getCommands(again.id), DEFAULT_COMMANDS);
});

test('addresses are unique across trh, co2, relay and ac of all rooms', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 });
  const clash = (extra, field, address, room = 'Room 1') => assert.throws(
    () => db.createRoom({ ...fields, name: 'B', ...extra }),
    (err) => {
      assert.ok(err instanceof AddressTakenError);
      assert.equal(err.message, `Address ${address} is already used by ${room}`);
      assert.equal(err.field, field);
      return true;
    },
  );
  clash({ relayAddress: 1 }, 'relayAddress', 1);
  clash({ relayAddress: 4 }, 'relayAddress', 4);
  clash({ acAddress: 3 }, 'acAddress', 3);
  clash({ acAddress: 2 }, 'acAddress', 2);
  clash({ trhAddress: 4 }, 'trhAddress', 4);
  clash({ co2Address: 3 }, 'co2Address', 3);
  db.createRoom({ ...fields, name: 'B', relayAddress: 5, acAddress: 6 });
  assert.throws(() => db.updateRoom(2, { ...fields, name: 'B', relayAddress: 4 }), AddressTakenError);
  assert.equal(db.updateRoom(2, { ...fields, name: 'B', relayAddress: 5, acAddress: 7 }).acAddress, 7);
  assert.equal(db.updateRoom(1, { ...fields, trhAddress: 3, co2Address: 4, relayAddress: 1, acAddress: 2 }).relayAddress, 1);
});

test('listWiredMachines lists relay then ac, rooms by id', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, name: 'A', acAddress: 7 });
  db.createRoom({ ...fields, name: 'B' });
  db.createRoom({ ...fields, name: 'C', relayAddress: 5, acAddress: 6 });
  assert.deepEqual(db.listWiredMachines(), [
    { roomId: 1, kind: 'ac', address: 7 },
    { roomId: 3, kind: 'relay', address: 5 },
    { roomId: 3, kind: 'ac', address: 6 },
  ]);
});

test('setRelayCommand and setAcCommand save the command and when it was sent', (t) => {
  const db = fresh(t);
  db.createRoom(fields);
  db.createRoom({ ...fields, name: 'B' });
  assert.equal(db.setRelayCommand(1, 'exhaust', true, 500), true);
  assert.equal(db.setRelayCommand(1, 'humidifier', true, 600), true);
  assert.equal(db.setRelayCommand(1, 'exhaust', false, 700), true);
  assert.equal(db.setRelayCommand(1, 'intake', true, 800), true);
  assert.deepEqual(db.getCommands(1).relay, { intake: true, exhaust: false, circulation: false, humidifier: true, dehumidifier: false, sentAt: 800 });
  assert.equal(db.setAcCommand(1, { power: true, mode: 'heat', setpoint: 23.5, fan: 'high' }, 900), true);
  assert.deepEqual(db.getCommands(1).ac, { power: true, mode: 'heat', setpoint: 23.5, fan: 'high', sentAt: 900 });
  assert.deepEqual(db.getCommands(1).relay.sentAt, 800, 'ac and relay send times are separate');
  assert.deepEqual(db.getCommands(2), DEFAULT_COMMANDS);
  assert.equal(db.setRelayCommand(99, 'intake', true, 1), false);
  assert.equal(db.setAcCommand(99, { power: true, mode: 'cool', setpoint: 20, fan: 'auto' }, 1), false);
  assert.throws(() => db.setRelayCommand(1, 'ac', true, 1), /unknown machine/);
});

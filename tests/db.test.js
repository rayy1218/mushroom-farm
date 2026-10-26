import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { openDb, NameTakenError, AddressTakenError } from '../server/db.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

test('a new database has no rooms', (t) => {
  assert.deepEqual(fresh(t).listRooms(), []);
});

test('createRoom stores the room and returns it with volume and times', (t) => {
  const db = fresh(t);
  const room = db.createRoom(fields, 1000);
  assert.deepEqual(room, {
    id: 1,
    name: 'Room 1',
    length: 6,
    width: 4,
    height: 2.5,
    volume: 60,
    trhAddress: null,
    co2Address: null,
    relayAddress: null,
    acAddress: null,
    meterAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050, dehumidifierW: 380, dehumidifierLday: 20, dehumidifier: false, lightsW: 60, lights: false,
    dpAddress: null, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: 1000,
    createdAt: 1000,
    updatedAt: 1000,
  });
  assert.deepEqual(db.getRoom(1), room);
});

test('volume is rounded to 2 decimals', (t) => {
  const room = fresh(t).createRoom({ ...fields, length: 1.11, width: 1.11, height: 1.11 });
  assert.equal(room.volume, 1.37);
});

test('listRooms sorts by name ignoring case', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, name: 'b room' });
  db.createRoom({ ...fields, name: 'C room' });
  db.createRoom({ ...fields, name: 'A room' });
  assert.deepEqual(db.listRooms().map((r) => r.name), ['A room', 'b room', 'C room']);
});

test('createRoom refuses a name already used, ignoring case', (t) => {
  const db = fresh(t);
  db.createRoom(fields);
  assert.throws(() => db.createRoom({ ...fields, name: 'ROOM 1' }), (err) => {
    assert.ok(err instanceof NameTakenError);
    assert.equal(err.message, 'A room called "ROOM 1" already exists');
    assert.equal(err.roomName, 'ROOM 1');
    return true;
  });
  assert.equal(db.listRooms().length, 1);
});

test('getRoom returns null for a missing id', (t) => {
  assert.equal(fresh(t).getRoom(99), null);
});

test('updateRoom changes the fields and updatedAt only', (t) => {
  const db = fresh(t);
  db.createRoom(fields, 1000);
  const room = db.updateRoom(1, { name: 'Room A', length: 5, width: 3, height: 2 }, 2000);
  assert.deepEqual(room, {
    id: 1,
    name: 'Room A',
    length: 5,
    width: 3,
    height: 2,
    volume: 30,
    trhAddress: null,
    co2Address: null,
    relayAddress: null,
    acAddress: null,
    meterAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050, dehumidifierW: 380, dehumidifierLday: 20, dehumidifier: false, lightsW: 60, lights: false,
    dpAddress: null, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: 1000,
    createdAt: 1000,
    updatedAt: 2000,
  });
  assert.deepEqual(db.getRoom(1), room);
});

test('updateRoom may keep the same name or change only its case', (t) => {
  const db = fresh(t);
  db.createRoom(fields);
  assert.equal(db.updateRoom(1, fields).name, 'Room 1');
  assert.equal(db.updateRoom(1, { ...fields, name: 'ROOM 1' }).name, 'ROOM 1');
});

test("updateRoom refuses another room's name", (t) => {
  const db = fresh(t);
  db.createRoom(fields);
  db.createRoom({ ...fields, name: 'Room 2' });
  assert.throws(() => db.updateRoom(2, { ...fields, name: 'room 1' }), NameTakenError);
  assert.equal(db.getRoom(2).name, 'Room 2');
});

test('updateRoom returns null for a missing id', (t) => {
  assert.equal(fresh(t).updateRoom(99, fields), null);
});

test('deleteRoom removes the room', (t) => {
  const db = fresh(t);
  db.createRoom(fields);
  assert.equal(db.deleteRoom(1), true);
  assert.equal(db.getRoom(1), null);
  assert.deepEqual(db.listRooms(), []);
});

test('deleteRoom returns false for a missing id', (t) => {
  assert.equal(fresh(t).deleteRoom(99), false);
});

test('a deleted name can be used again', (t) => {
  const db = fresh(t);
  db.createRoom(fields);
  db.deleteRoom(1);
  assert.equal(db.createRoom(fields).name, 'Room 1');
});

test('rooms survive closing and reopening a database file', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  first.createRoom(fields, 1000);
  first.close();
  const second = openDb(path);
  t.after(() => second.close());
  assert.equal(second.getRoom(1).name, 'Room 1');
});

// --- iteration 2: addresses, readings, upgrade ---

const ITERATION_1_SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  length_m   REAL    NOT NULL CHECK (length_m BETWEEN 0.5 AND 100),
  width_m    REAL    NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
  height_m   REAL    NOT NULL CHECK (height_m BETWEEN 0.5 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
`;

function version(path) {
  const raw = new DatabaseSync(path);
  const { user_version: v } = raw.prepare('PRAGMA user_version').get();
  raw.close();
  return v;
}

test('an iteration 1 database file is upgraded and keeps its rooms', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'old.db');
  const old = new DatabaseSync(path);
  old.exec(ITERATION_1_SCHEMA);
  old.prepare('INSERT INTO rooms (name, length_m, width_m, height_m, created_at, updated_at) VALUES (?,?,?,?,?,?)')
    .run('Old room', 5, 4, 3, 10, 20);
  assert.equal(old.prepare('PRAGMA user_version').get().user_version, 0);
  old.close();

  const db = openDb(path);
  assert.deepEqual(db.getRoom(1), {
    id: 1, name: 'Old room', length: 5, width: 4, height: 3, volume: 60,
    trhAddress: null, co2Address: null, relayAddress: null, acAddress: null, meterAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050, dehumidifierW: 380, dehumidifierLday: 20, dehumidifier: false, lightsW: 60, lights: false, createdAt: 10, updatedAt: 20,
    dpAddress: null, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: db.getRoom(1).filterChangedAt, // the upgrade time
  });
  assert.deepEqual(db.getSensors(1).map((s) => s.status), ['not-wired', 'not-wired']);
  db.updateRoom(1, { name: 'Old room', length: 5, width: 4, height: 3, trhAddress: 4 });
  db.addReading({ roomId: 1, kind: 'trh', address: 4, at: 1, ok: true, t: 20, rh: 80 });
  db.close();
  assert.equal(version(path), 16);

  const again = openDb(path); // already at version 16: opens without upgrading again
  t.after(() => again.close());
  assert.equal(again.getRoom(1).trhAddress, 4);
  assert.equal(again.getSensors(1)[0].readings.length, 1);
});

test('a new database is created at version 16', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'new.db');
  openDb(path).close();
  assert.equal(version(path), 16);
});

test('rooms store and return their addresses', (t) => {
  const db = fresh(t);
  const room = db.createRoom({ ...fields, trhAddress: 1, co2Address: 247 });
  assert.equal(room.trhAddress, 1);
  assert.equal(room.co2Address, 247);
  assert.equal(db.updateRoom(1, { ...fields }).trhAddress, null);
});

test('AddressTakenError on create and update, either kind, own address allowed', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1, co2Address: 2 });
  assert.throws(() => db.createRoom({ ...fields, name: 'B', trhAddress: 1 }), (err) => {
    assert.ok(err instanceof AddressTakenError);
    assert.equal(err.message, 'Address 1 is already used by Room 1');
    assert.equal(err.field, 'trhAddress');
    return true;
  });
  assert.throws(() => db.createRoom({ ...fields, name: 'B', trhAddress: 9, co2Address: 1 }), (err) => {
    assert.equal(err.field, 'co2Address');
    return true;
  });
  assert.throws(() => db.createRoom({ ...fields, name: 'B', co2Address: 1 }), AddressTakenError);
  db.createRoom({ ...fields, name: 'B', trhAddress: 3 });
  assert.throws(() => db.updateRoom(2, { ...fields, name: 'B', trhAddress: 2 }), AddressTakenError);
  assert.equal(db.updateRoom(2, { ...fields, name: 'B', trhAddress: 3, co2Address: 4 }).co2Address, 4);
  assert.equal(db.updateRoom(1, { ...fields, trhAddress: 2, co2Address: 1 }).trhAddress, 2);
  assert.equal(db.listRooms().length, 2);
});

test('listWiredSensors lists rooms by id, trh before co2', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, name: 'A', co2Address: 7 });
  db.createRoom({ ...fields, name: 'B' });
  db.createRoom({ ...fields, name: 'C', trhAddress: 5, co2Address: 6 });
  assert.deepEqual(db.listWiredSensors(), [
    { roomId: 1, kind: 'co2', address: 7 },
    { roomId: 3, kind: 'trh', address: 5 },
    { roomId: 3, kind: 'co2', address: 6 },
  ]);
});

test('getSensors returns null for a missing room, not-wired sensors for a bare room', (t) => {
  const db = fresh(t);
  assert.equal(db.getSensors(5), null);
  db.createRoom(fields);
  assert.deepEqual(db.getSensors(1), [
    { kind: 'trh', address: null, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] },
    { kind: 'co2', address: null, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] },
  ]);
});

const fail = (at, extra = {}) => ({ roomId: 1, kind: 'trh', address: 1, at, ok: false, error: 'timeout', ...extra });
const good = (at, t = 25, rh = 88) => ({ roomId: 1, kind: 'trh', address: 1, at, ok: true, t, rh });

test('status: no-data, online, timeout (1, 2), offline (3, 5), recovery', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1 });
  const status = () => db.getSensors(1)[0];
  assert.equal(status().status, 'no-data');
  db.addReading(good(100, 25.3, 88.1));
  assert.equal(status().status, 'online');
  assert.deepEqual(status().lastOk, { at: 100, t: 25.3, rh: 88.1 });
  assert.equal(status().failuresInRow, 0);
  db.addReading(fail(200));
  assert.equal(status().status, 'timeout');
  assert.equal(status().failuresInRow, 1);
  db.addReading(fail(300));
  assert.equal(status().status, 'timeout');
  db.addReading(fail(400));
  assert.equal(status().status, 'offline');
  assert.equal(status().failuresInRow, 3);
  db.addReading(fail(500));
  db.addReading(fail(600));
  assert.equal(status().status, 'offline');
  assert.equal(status().failuresInRow, 5);
  assert.equal(status().lastOk.at, 100);
  db.addReading(good(700));
  assert.equal(status().status, 'online');
  assert.equal(status().failuresInRow, 0);
});

test('only failures and no ok reading ever: offline with lastOk null', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1 });
  for (let i = 0; i < 3; i++) db.addReading(fail(i));
  const s = db.getSensors(1)[0];
  assert.equal(s.status, 'offline');
  assert.equal(s.lastOk, null);
  assert.equal(s.failuresInRow, 3);
});

test('failures are counted past the 50 readings shown', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1 });
  db.addReading(good(0));
  for (let i = 1; i <= 60; i++) db.addReading(fail(i));
  const s = db.getSensors(1)[0];
  assert.equal(s.failuresInRow, 60);
  assert.equal(s.readings.length, 50);
});

test('readings: at most 50, oldest first, failed ones have null values', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1, co2Address: 2 });
  for (let i = 1; i <= 55; i++) db.addReading(i === 55 ? fail(i) : good(i, i, i));
  const { readings } = db.getSensors(1)[0];
  assert.equal(readings.length, 50);
  assert.equal(readings[0].at, 6);
  assert.deepEqual(readings.at(-1), { at: 55, ok: false, t: null, rh: null });
  assert.deepEqual(readings[0], { at: 6, ok: true, t: 6, rh: 6 });
  assert.equal(db.getSensors(1, 3)[0].readings.length, 3);
});

test('co2 sensors use co2 instead of t and rh', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, co2Address: 2 });
  db.addReading({ roomId: 1, kind: 'co2', address: 2, at: 5, ok: true, co2: 950 });
  db.addReading({ roomId: 1, kind: 'co2', address: 2, at: 6, ok: false, error: 'timeout' });
  const s = db.getSensors(1)[1];
  assert.deepEqual(s.readings, [{ at: 5, ok: true, co2: 950 }, { at: 6, ok: false, co2: null }]);
  assert.deepEqual(s.lastOk, { at: 5, co2: 950 });
  assert.equal(s.status, 'timeout');
});

test('changing an address starts fresh and hides the old readings', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1 });
  for (let i = 0; i < 4; i++) db.addReading(fail(i));
  assert.equal(db.getSensors(1)[0].status, 'offline');
  db.updateRoom(1, { ...fields, trhAddress: 2 });
  const s = db.getSensors(1)[0];
  assert.equal(s.status, 'no-data');
  assert.deepEqual(s.readings, []);
  db.updateRoom(1, { ...fields, trhAddress: 1 });
  assert.equal(db.getSensors(1)[0].status, 'offline');
});

test('deleteRoom removes its readings and only its own', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 1 });
  db.createRoom({ ...fields, name: 'B', trhAddress: 2 });
  db.addReading(good(1));
  db.addReading({ roomId: 2, kind: 'trh', address: 2, at: 1, ok: true, t: 1, rh: 1 });
  assert.equal(db.deleteRoom(1), true);
  assert.equal(db.getSensors(1), null);
  assert.equal(db.getSensors(2)[0].readings.length, 1);
  db.createRoom({ ...fields, trhAddress: 1 }); // new room reuses no old readings (id 3)
  assert.equal(db.getSensors(3)[0].status, 'no-data');
});

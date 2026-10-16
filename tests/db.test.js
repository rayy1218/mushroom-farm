import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, NameTakenError } from '../server/db.js';
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

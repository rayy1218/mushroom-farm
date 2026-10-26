// The filter in the database (spec 2026-10-22-filter-design.md sections 3, 4, 5 and 9): room fields, the pressure sensor's
// readings, the filter changes, upgrade 13 to 14.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, AddressTakenError } from '../server/db.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

test('a new room has the filter defaults, no sensor and its filter changed when it was made', (t) => {
  const db = fresh(t);
  const room = db.createRoom(ROOM, 5000);
  assert.deepEqual(
    [room.fanMaxPa, room.filterCleanPa, room.filterFinalPa, room.filterChangeDays, room.filterChangedAt, room.dpAddress],
    [200, 40, 80, 30, 5000, null],
  );
});

test('given filter settings are stored; an update without them keeps them and the change time', (t) => {
  const db = fresh(t);
  const id = db.createRoom({ ...ROOM, fanMaxPa: 300, filterCleanPa: 30, filterFinalPa: 120, filterChangeDays: 14, dpAddress: 9 }, 5000).id;
  db.updateRoom(id, { ...ROOM, dpAddress: 9 }, 6000);
  const room = db.getRoom(id);
  assert.deepEqual(
    [room.fanMaxPa, room.filterCleanPa, room.filterFinalPa, room.filterChangeDays, room.filterChangedAt, room.dpAddress],
    [300, 30, 120, 14, 5000, 9],
  );
  db.updateRoom(id, { ...ROOM, filterChangeDays: 0, dpAddress: null }, 7000);
  assert.deepEqual([db.getRoom(id).filterChangeDays, db.getRoom(id).dpAddress, db.getRoom(id).fanMaxPa], [0, null, 300]);
});

test('the filter pressure sensor address is unique like the other addresses', (t) => {
  const db = fresh(t);
  db.createRoom({ ...ROOM, trhAddress: 5, dpAddress: 6 });
  assert.throws(() => db.createRoom({ ...ROOM, name: 'Room 2', dpAddress: 5 }), (e) => e instanceof AddressTakenError && e.field === 'dpAddress');
  assert.throws(() => db.createRoom({ ...ROOM, name: 'Room 2', co2Address: 6 }), (e) => e instanceof AddressTakenError && e.field === 'co2Address');
});

test('readings are stored only while the room has that sensor address; listFilterSensors lists them', (t) => {
  const db = fresh(t);
  const a = db.createRoom({ ...ROOM, dpAddress: 7 }).id;
  db.createRoom({ ...ROOM, name: 'Room 2' });
  assert.deepEqual(db.listFilterSensors(), [{ roomId: a, address: 7 }]);
  db.addFilterReading({ roomId: a, address: 7, at: 100, ok: true, pa: 55.5 });
  db.addFilterReading({ roomId: a, address: 8, at: 101, ok: true, pa: 60 }); // not its address
  assert.deepEqual(db.getFilterSensor(a).readings, [{ at: 100, ok: true, pa: 55.5 }]);
});

test('the sensor status like the energy meter: not wired, no data, online, timeout, offline', (t) => {
  const db = fresh(t);
  const id = db.createRoom(ROOM).id;
  assert.deepEqual(db.getFilterSensor(id), { kind: 'dp', address: null, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] });
  db.updateRoom(id, { ...ROOM, dpAddress: 7 });
  assert.equal(db.getFilterSensor(id).status, 'no-data');
  db.addFilterReading({ roomId: id, address: 7, at: 100, ok: true, pa: 50 });
  assert.equal(db.getFilterSensor(id).status, 'online');
  assert.deepEqual(db.getFilterSensor(id).lastOk, { at: 100, pa: 50 });
  db.addFilterReading({ roomId: id, address: 7, at: 101, ok: false, error: 'Timeout' });
  assert.equal(db.getFilterSensor(id).status, 'timeout');
  db.addFilterReading({ roomId: id, address: 7, at: 102, ok: false, pa: 2500, error: 'Out of range' });
  db.addFilterReading({ roomId: id, address: 7, at: 103, ok: false, error: 'Timeout' });
  const s = db.getFilterSensor(id);
  assert.deepEqual([s.status, s.failuresInRow, s.lastOk.at], ['offline', 3, 100]);
  assert.deepEqual(s.readings.map((r) => r.pa), [50, null, 2500, null]);
  assert.equal(db.getFilterSensor(999), null);
});

test('filterReadingsWindow: the good readings of the present address in [from, to), oldest first', (t) => {
  const db = fresh(t);
  const id = db.createRoom({ ...ROOM, dpAddress: 7 }).id;
  for (const [at, ok, pa] of [[100, true, 40], [200, false, null], [300, true, 45], [400, true, 50]]) {
    db.addFilterReading({ roomId: id, address: 7, at, ok, pa });
  }
  assert.deepEqual(db.filterReadingsWindow(id, 100, 400), [{ at: 100, pa: 40 }, { at: 300, pa: 45 }]);
  db.updateRoom(id, { ...ROOM, dpAddress: 8 });
  assert.deepEqual(db.filterReadingsWindow(id, 0, 1000), []);
  db.updateRoom(id, ROOM);
  assert.deepEqual(db.filterReadingsWindow(id, 0, 1000), []);
});

test('markFilterChanged sets the change time and adds a change; filterChanges newest first, at most `limit`', (t) => {
  const db = fresh(t);
  const id = db.createRoom(ROOM, 1000).id;
  assert.equal(db.markFilterChanged(id, 2000, 140.5), true);
  db.markFilterChanged(id, 3000, null);
  assert.equal(db.getRoom(id).filterChangedAt, 3000);
  assert.deepEqual(db.filterChanges(id), [{ at: 3000, paBefore: null }, { at: 2000, paBefore: 140.5 }]);
  assert.deepEqual(db.filterChanges(id, 1), [{ at: 3000, paBefore: null }]);
  assert.equal(db.markFilterChanged(999, 2000, null), false);
  assert.deepEqual(db.filterChanges(999), []);
});

test('deleting a room deletes its filter readings and changes', (t) => {
  const db = fresh(t);
  const id = db.createRoom({ ...ROOM, dpAddress: 7 }).id;
  db.addFilterReading({ roomId: id, address: 7, at: 100, ok: true, pa: 50 });
  db.markFilterChanged(id, 200, 50);
  db.deleteRoom(id);
  const again = db.createRoom({ ...ROOM, dpAddress: 7 }).id; // a new room may get the same id
  assert.deepEqual(db.getFilterSensor(again).readings, []);
  assert.deepEqual(db.filterChanges(again), []);
});

test('upgrade 13 to 14: the filter columns with their defaults, the change time is the upgrade time, the new tables', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'filter-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  const id = first.createRoom({ ...ROOM, trhAddress: 1 }, 1000).id;
  first.close();
  // back to a version 13 file
  const raw = new DatabaseSync(path);
  raw.exec(`DROP TABLE filter_readings; DROP TABLE filter_changes;
    ALTER TABLE rooms DROP COLUMN fan_max_pa; ALTER TABLE rooms DROP COLUMN filter_clean_pa;
    ALTER TABLE rooms DROP COLUMN filter_final_pa; ALTER TABLE rooms DROP COLUMN filter_change_days;
    ALTER TABLE rooms DROP COLUMN filter_changed_at; ALTER TABLE rooms DROP COLUMN dp_address;
    PRAGMA user_version = 13;`);
  raw.close();
  const before = Date.now();
  const db = openDb(path);
  t.after(() => db.close());
  const room = db.getRoom(id);
  assert.deepEqual([room.fanMaxPa, room.filterCleanPa, room.filterFinalPa, room.filterChangeDays, room.dpAddress, room.trhAddress],
    [200, 40, 80, 30, null, 1]);
  assert.ok(room.filterChangedAt >= before && room.filterChangedAt <= Date.now());
  db.updateRoom(id, { ...ROOM, dpAddress: 7 });
  db.addFilterReading({ roomId: id, address: 7, at: 100, ok: true, pa: 50 });
  db.markFilterChanged(id, 200, 50);
  assert.equal(db.filterChanges(id).length, 1);
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 16);
});

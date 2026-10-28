// Iteration 7: the upgrade to version 9, the room ratings and meter address, meter and outdoor readings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, AddressTakenError } from '../server/db.js';

const fields = { name: 'A', length: 6, width: 4, height: 2.5 };
const fresh = (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
};
const tempDir = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-usage-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const tableNames = (raw) => raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name);
const NEW_COLUMNS = ['intake_w', 'exhaust_w', 'circulation_w', 'humidifier_w', 'humidifier_lh', 'ac_input_w', 'meter_address'];

test('a new database is at version 17 with the usage tables and room columns', (t) => {
  const path = join(tempDir(t), 'new.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 17);
  assert.ok(tableNames(raw).includes('outdoor_readings') && tableNames(raw).includes('meter_readings'));
  const columns = raw.prepare('PRAGMA table_info(rooms)').all().map((c) => c.name);
  for (const c of NEW_COLUMNS) assert.ok(columns.includes(c), c);
  raw.close();
});

test('upgrade 8 to 9 keeps rooms and gives them the default ratings and no meter', (t) => {
  const path = join(tempDir(t), 'v8.db');
  const first = openDb(path);
  first.createRoom({ ...fields, trhAddress: 3 }, 10);
  first.close();
  // Turn the file back into a version 8 one.
  const raw = new DatabaseSync(path);
  raw.exec('DROP TABLE outdoor_readings; DROP TABLE meter_readings;');
  for (const c of NEW_COLUMNS) raw.exec(`ALTER TABLE rooms DROP COLUMN ${c}`);
  for (const c of ['exchange_every_min', 'exchange_forced', 'fresh_from']) raw.exec(`ALTER TABLE room_controls DROP COLUMN ${c}`); // version 10
  raw.exec('DROP TABLE room_crops; DROP TABLE room_programs; DROP TABLE simulation_runs; PRAGMA user_version = 8'); // version 11 tables too
  raw.close();

  const db = openDb(path);
  assert.deepEqual(db.getRoom(1), {
    id: 1, name: 'A', length: 6, width: 4, height: 2.5, volume: 60, trhAddress: 3, co2Address: null, relayAddress: null,
    acAddress: null, meterAddress: null, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2,
    acInputW: 1050, dehumidifierW: 380, dehumidifierLday: 20, dehumidifier: false, lightsW: 60, lights: false, createdAt: 10, updatedAt: 10,
    dpAddress: null, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, filterChangedAt: db.getRoom(1).filterChangedAt, // the upgrade time
  });
  db.close();
  openDb(path).close(); // opening again changes nothing
});

test('older versions end at 17 too (a version 0 file)', (t) => {
  const path = join(tempDir(t), 'old.db');
  const old = new DatabaseSync(path);
  old.exec(`CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    length_m REAL NOT NULL, width_m REAL NOT NULL, height_m REAL NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL) STRICT`);
  old.exec("INSERT INTO rooms VALUES (1, 'Old', 5, 4, 3, 1, 2)");
  old.close();
  const db = openDb(path);
  assert.equal(db.getRoom(1).humidifierLH, 2);
  assert.equal(db.getMeter(1).status, 'not-wired');
  db.close();
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 17);
  raw.close();
});

test('ratings and the meter address are stored, changed and returned', (t) => {
  const db = fresh(t);
  const ratings = { intakeW: 100, exhaustW: 110, circulationW: 20, humidifierW: 150, humidifierLH: 3.5, acInputW: 900 };
  const room = db.createRoom({ ...fields, meterAddress: 12, ...ratings });
  assert.deepEqual(room, { ...room, meterAddress: 12, ...ratings });
  const updated = db.updateRoom(room.id, { ...fields, meterAddress: null, ...ratings, acInputW: 1200 });
  assert.equal(updated.meterAddress, null);
  assert.equal(updated.acInputW, 1200);
  assert.equal(db.getRoom(room.id).humidifierLH, 3.5);
});

test('the meter address is unique like the other addresses', (t) => {
  const db = fresh(t);
  db.createRoom({ ...fields, trhAddress: 3 });
  assert.throws(() => db.createRoom({ ...fields, name: 'B', meterAddress: 3 }),
    (e) => e instanceof AddressTakenError && e.field === 'meterAddress' && e.roomName === 'A');
  const b = db.createRoom({ ...fields, name: 'B', meterAddress: 8 });
  assert.throws(() => db.updateRoom(1, { ...fields, trhAddress: 8 }), (e) => e instanceof AddressTakenError && e.field === 'trhAddress');
  db.updateRoom(b.id, { ...fields, name: 'B', meterAddress: 8 }); // its own address is fine
});

test('meter readings: listMeters, status, last good value, and the guard on the current address', (t) => {
  const db = fresh(t);
  const room = db.createRoom({ ...fields, meterAddress: 5 });
  assert.deepEqual(db.listMeters(), [{ roomId: room.id, address: 5 }]);
  assert.equal(db.getMeter(room.id).status, 'no-data');
  db.addMeterReading({ roomId: room.id, address: 5, at: 10, ok: true, powerW: 250.5, energyKwh: 12.25 });
  db.addMeterReading({ roomId: room.id, address: 6, at: 11, ok: true, powerW: 1, energyKwh: 1 }); // not the room's address
  let m = db.getMeter(room.id);
  assert.deepEqual(m, {
    kind: 'meter', address: 5, status: 'online', failuresInRow: 0, lastOk: { at: 10, power: 250.5, energy: 12.25 },
    readings: [{ at: 10, ok: true, power: 250.5, energy: 12.25 }],
  });
  db.addMeterReading({ roomId: room.id, address: 5, at: 20, ok: false, error: 'timeout' });
  assert.equal(db.getMeter(room.id).status, 'timeout');
  db.addMeterReading({ roomId: room.id, address: 5, at: 30, ok: false, error: 'timeout' });
  db.addMeterReading({ roomId: room.id, address: 5, at: 40, ok: false, error: 'timeout' });
  m = db.getMeter(room.id);
  assert.equal(m.status, 'offline');
  assert.equal(m.failuresInRow, 3);
  assert.equal(m.lastOk.at, 10);
  assert.equal(db.getMeter(99), null);
  assert.equal(db.getMeter(room.id, 2).readings.length, 2);
  assert.equal(db.getMeter(1 + room.id), null);
});

test('a room without a meter shows it as not wired', (t) => {
  const db = fresh(t);
  const room = db.createRoom(fields);
  assert.deepEqual(db.getMeter(room.id), { kind: 'meter', address: null, status: 'not-wired', failuresInRow: 0, lastOk: null, readings: [] });
});

test('the meter readings of a window: the one before it, the rows, and the chunk summed in the database', (t) => {
  const db = fresh(t);
  const room = db.createRoom({ ...fields, meterAddress: 5 });
  const H = 3_600_000;
  const add = (at, ok, energyKwh) => db.addMeterReading({ roomId: room.id, address: 5, at: at * H, ok, energyKwh });
  add(1, true, 1); add(2, true, 2); add(2.5, false, null); add(3, true, 3); add(5, true, 4);
  assert.deepEqual(db.meterBefore(room.id, 2 * H), { at: H, energy: 1 });
  assert.equal(db.meterBefore(room.id, H), null);
  assert.deepEqual(db.meterRows(room.id, 2 * H, 4 * H), [{ at: 2 * H, energy: 2 }, { at: 3 * H, energy: 3 }]);
  assert.deepEqual(db.meterChunk(room.id, 2 * H, 4 * H), { n: 2, kWh: 1, bad: 0, first: { at: 2 * H, energy: 2 }, last: { at: 3 * H, energy: 3 } });
  assert.deepEqual(db.meterChunk(room.id, 6 * H, 9 * H), { n: 0, kWh: 0, bad: 0, first: null, last: null });
  add(6, true, 0.5); // a decrease is not a plain step
  add(7, true, 300); // nor 300 kWh in an hour
  const chunk = db.meterChunk(room.id, 2 * H, 8 * H);
  assert.equal(chunk.bad, 2);
  assert.equal(chunk.kWh, 1 + 1); // 2 to 3 and 3 to 4 count, not 4 to 0.5 or 0.5 to 300
  assert.deepEqual(db.meterRows(99, 0, 100), []);
  assert.equal(db.meterBefore(99, 100), null);
});

test('machineLogWindow moves the last row before the window to its start', (t) => {
  const db = fresh(t);
  const room = db.createRoom(fields);
  db.logMachine(room.id, 'intake', { on: true }, 'manual', 100);
  db.logMachine(room.id, 'intake', { on: false }, 'manual', 500);
  db.logMachine(room.id, 'intake', { on: true }, 'auto', 900);
  assert.deepEqual(db.machineLogWindow(room.id, 'intake', 300, 800).map((r) => [r.at, r.on]), [[300, true], [500, false]]);
  assert.deepEqual(db.machineLogWindow(room.id, 'exhaust', 300, 800), []);
});

test('meter readings go with the room', (t) => {
  const path = join(tempDir(t), 'm.db');
  const db = openDb(path);
  const room = db.createRoom({ ...fields, meterAddress: 5 });
  db.addMeterReading({ roomId: room.id, address: 5, at: 1, ok: true, powerW: 1, energyKwh: 1 });
  db.deleteRoom(room.id);
  db.close();
  const raw = new DatabaseSync(path);
  assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM meter_readings').get().n, 0);
  raw.close();
});

test('the outdoor probe: stored only for the set address; status like a room sensor', (t) => {
  const db = fresh(t);
  assert.deepEqual(db.getOutdoor(), { address: null, status: 'not-set', failuresInRow: 0, lastOk: null, readings: [] });
  db.addOutdoorReading({ address: 9, at: 1, ok: true, t: 30, rh: 70 }); // no outdoor address: not stored
  db.setSetting('outdoorAddress', '9');
  assert.deepEqual(db.outdoorSince(0), []);
  assert.equal(db.outdoorAddress(), 9);
  assert.equal(db.getOutdoor().status, 'no-data');
  db.addOutdoorReading({ address: 8, at: 2, ok: true, t: 1, rh: 1 }); // another address: not stored
  db.addOutdoorReading({ address: 9, at: 3, ok: true, t: 30.5, rh: 71 });
  assert.equal(db.getOutdoor().status, 'online');
  assert.deepEqual(db.getOutdoor().lastOk, { at: 3, t: 30.5, rh: 71 });
  db.addOutdoorReading({ address: 9, at: 4, ok: false, error: 'timeout' });
  assert.equal(db.getOutdoor().status, 'timeout');
  db.addOutdoorReading({ address: 9, at: 5, ok: false, error: 'timeout' });
  db.addOutdoorReading({ address: 9, at: 6, ok: false, error: 'timeout' });
  assert.equal(db.getOutdoor().status, 'offline');
  assert.deepEqual(db.outdoorSince(4).map((r) => r.at), [4, 5, 6]);
  db.setSetting('outdoorAddress', '');
  assert.equal(db.outdoorAddress(), null);
  assert.equal(db.getOutdoor().status, 'not-set');
});

test('outdoor buckets average good readings per bucket, aligned to the epoch', (t) => {
  const db = fresh(t);
  db.setSetting('outdoorAddress', '9');
  const add = (at, tt, rh, ok = true) => db.addOutdoorReading({ address: 9, at, ok, t: tt, rh });
  add(1000, 30, 80); add(2000, 32, 90); add(2500, 99, 90); // t 99 is out of range
  add(12_000, 20, 50); add(13_000, 0, 0, false);
  assert.deepEqual(db.outdoorBuckets(10_000, 0, 15_000), [
    { at: 5000, t: 31, rh: 85 },
    { at: 15_000, t: 20, rh: 50 },
  ]);
  // The window starts at the first boundary at or after from; `at` is kept inside the window.
  assert.deepEqual(db.outdoorBuckets(10_000, 5000, 12_100), [{ at: 12_100, t: 20, rh: 50 }]);
});

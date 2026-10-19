// Review fixes for server/db.js: readings indexes, capped failure count, addReading guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, STATUS_SQL } from '../server/db.js';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function tempDir(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const ITERATION_1_SCHEMA = `
CREATE TABLE rooms (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  length_m   REAL    NOT NULL CHECK (length_m BETWEEN 0.5 AND 100),
  width_m    REAL    NOT NULL CHECK (width_m BETWEEN 0.5 AND 100),
  height_m   REAL    NOT NULL CHECK (height_m BETWEEN 0.5 AND 10),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;`;

function readingIndexes(path) {
  const raw = new DatabaseSync(path);
  const rows = raw.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = 'readings' AND sql IS NOT NULL ORDER BY name").all();
  raw.close();
  return rows.map((r) => ({ name: r.name, sql: r.sql.replace(/\s+/g, ' ') }));
}

const EXPECTED = [
  { name: 'readings_by_sensor', sql: 'CREATE INDEX readings_by_sensor ON readings (room_id, kind, address, id)' },
  { name: 'readings_by_time', sql: 'CREATE INDEX readings_by_time ON readings (room_id, kind, at, ok, t, rh, co2)' },
  { name: 'readings_ok', sql: 'CREATE INDEX readings_ok ON readings (room_id, kind, address, id) WHERE ok = 1' },
];

test('readings indexes: fresh schema and the 0 to 1 upgrade both get the per-sensor and time indexes', (t) => {
  const dir = tempDir(t);
  openDb(join(dir, 'new.db')).close();
  assert.deepEqual(readingIndexes(join(dir, 'new.db')), EXPECTED);

  const old = new DatabaseSync(join(dir, 'old.db'));
  old.exec(ITERATION_1_SCHEMA);
  old.close();
  openDb(join(dir, 'old.db')).close();
  assert.deepEqual(readingIndexes(join(dir, 'old.db')), EXPECTED);
});

test('the status queries search an index and never scan the readings table', (t) => {
  const dir = tempDir(t);
  const path = join(dir, 'plan.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const args = { latest: [1, 'trh', 1, 50], lastOk: [1, 'trh', 1], failuresSince: [1, 'trh', 1, 0] };
  assert.deepEqual(Object.keys(STATUS_SQL).sort(), Object.keys(args).sort());
  for (const [name, sql] of Object.entries(STATUS_SQL)) {
    const plan = raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args[name]).map((r) => r.detail);
    const onReadings = plan.filter((d) => /readings/.test(d));
    assert.ok(onReadings.length > 0, name);
    for (const d of onReadings) {
      assert.match(d, /^SEARCH readings USING (COVERING )?INDEX readings_(by_sensor|ok) \(room_id=\? AND kind=\? AND address=\?/, `${name}: ${d}`);
    }
  }
});

test('the failure count stops at 10000', (t) => {
  const dir = tempDir(t);
  const path = join(dir, 'many.db');
  const db = openDb(path);
  t.after(() => db.close());
  db.createRoom({ ...fields, trhAddress: 1 });
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  raw.exec('BEGIN');
  const ins = raw.prepare("INSERT INTO readings (room_id, kind, address, at, ok, error) VALUES (1, 'trh', 1, ?, 0, 'timeout')");
  for (let i = 0; i < 10050; i++) ins.run(i);
  raw.exec('COMMIT');
  const s = db.getSensors(1)[0];
  assert.equal(s.failuresInRow, 10000);
  assert.equal(s.status, 'offline');
});

test('addReading writes nothing once the room is gone or the sensor was re-wired', (t) => {
  const dir = tempDir(t);
  const path = join(dir, 'guard.db');
  const db = openDb(path);
  t.after(() => db.close());
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  const count = () => raw.prepare('SELECT COUNT(*) AS n FROM readings').get().n;
  const reading = (extra) => ({ roomId: 1, kind: 'trh', address: 1, at: 1, ok: false, error: 'timeout', ...extra });

  db.createRoom({ ...fields, trhAddress: 1, co2Address: 2 });
  db.addReading(reading({}));
  assert.equal(count(), 1);

  // Wrong kind for the address, wrong address, unknown room: nothing written.
  db.addReading(reading({ kind: 'co2' }));
  db.addReading(reading({ address: 2 }));
  db.addReading(reading({ roomId: 7 }));
  assert.equal(count(), 1);

  // The room was re-wired between listWiredSensors and addReading.
  db.updateRoom(1, { ...fields, trhAddress: 5, co2Address: 2 });
  db.addReading(reading({}));
  assert.equal(count(), 1);
  db.addReading(reading({ address: 5 }));
  db.addReading(reading({ kind: 'co2', address: 2 }));
  assert.equal(count(), 3);

  // The trh sensor was unwired.
  db.updateRoom(1, { ...fields, trhAddress: null, co2Address: 2 });
  db.addReading(reading({ address: 5 }));
  assert.equal(count(), 3);

  // The room was deleted.
  db.deleteRoom(1);
  db.addReading(reading({ kind: 'co2', address: 2 }));
  assert.equal(count(), 0);
});

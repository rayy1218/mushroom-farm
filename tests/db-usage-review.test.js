// Review fixes for iteration 7 in server/db.js: indexes of the meter and outdoor readings, the outdoor bucket cache,
// the machines of an unwired device logged off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, METER_SQL, OUTDOOR_SQL } from '../server/db.js';

const fields = { name: 'A', length: 6, width: 4, height: 2.5 };
const tempDir = (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-dbrev-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const indexes = (path) => {
  const raw = new DatabaseSync(path);
  const rows = raw.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL AND tbl_name IN ('meter_readings', 'outdoor_readings') ORDER BY name").all();
  raw.close();
  return rows.map((r) => r.name);
};
const EXPECTED = [
  'meter_readings_by_sensor', 'meter_readings_energy', 'meter_readings_ok',
  'outdoor_readings_by_sensor', 'outdoor_readings_by_time', 'outdoor_readings_ok',
];

test('meter and outdoor indexes: a fresh database and the 8 to 9 upgrade get the same ones', (t) => {
  const dir = tempDir(t);
  openDb(join(dir, 'new.db')).close();
  assert.deepEqual(indexes(join(dir, 'new.db')), EXPECTED);

  openDb(join(dir, 'v8.db')).close();
  const raw = new DatabaseSync(join(dir, 'v8.db'));
  raw.exec('DROP TABLE outdoor_readings; DROP TABLE meter_readings; DROP TABLE room_crops; DROP TABLE room_programs; DROP TABLE simulation_runs; PRAGMA user_version = 8');
  for (const c of ['intake_w', 'exhaust_w', 'circulation_w', 'humidifier_w', 'humidifier_lh', 'ac_input_w', 'meter_address']) {
    raw.exec(`ALTER TABLE rooms DROP COLUMN ${c}`);
  }
  // the columns of the later upgrades too (9 → 10 fresh air), so this is a real version 8 file
  for (const c of ['exchange_every_min', 'exchange_forced', 'fresh_from']) raw.exec(`ALTER TABLE room_controls DROP COLUMN ${c}`);
  raw.close();
  openDb(join(dir, 'v8.db')).close();
  assert.deepEqual(indexes(join(dir, 'v8.db')), EXPECTED);
});

const ARGS = {
  meter: {
    latest: [1, 5, 50], lastOk: [1, 5], failuresSince: [1, 5, 0], before: [1, 5, 1000],
    rows: [1, 5, 0, 1000], chunk: [1, 5, 0, 1000], first: [1, 5, 0, 1000], last: [1, 5, 0, 1000],
  },
  outdoor: { latest: [9, 1], lastOk: [9], failuresSince: [9, 0], since: [9, 0], bucket: [9, 0, 1000] },
};

test('the meter and outdoor queries search an index: no scan, no temp b-tree', (t) => {
  const path = join(tempDir(t), 'plan.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  for (const [name, sqls] of [['meter', METER_SQL], ['outdoor', OUTDOOR_SQL]]) {
    assert.deepEqual(Object.keys(sqls).sort(), Object.keys(ARGS[name]).sort(), name);
    for (const [key, sql] of Object.entries(sqls)) {
      const plan = raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...ARGS[name][key]).map((r) => r.detail);
      assert.ok(plan.some((d) => /SEARCH/.test(d)), `${name}.${key}: ${plan}`);
      for (const d of plan) {
        assert.doesNotMatch(d, /SCAN (meter|outdoor)_readings/, `${name}.${key}: ${d}`);
        // latest puts its newest `limit` rows back in order with a small sort, like the room sensors
        if (key !== 'latest') assert.doesNotMatch(d, /TEMP B-TREE/, `${name}.${key}: ${d}`);
      }
    }
  }
});

test('the outdoor history ignores the readings of an earlier address and follows a change of address', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const add = (address, at, tt) => {
    db.setSetting('outdoorAddress', String(address));
    db.addOutdoorReading({ address, at, ok: true, t: tt, rh: 50 });
  };
  add(8, 1000, 10); add(8, 2000, 10);
  add(9, 3000, 30); add(9, 4000, 32);
  assert.deepEqual(db.outdoorBuckets(10_000, 0, 15_000), [{ at: 5000, t: 31, rh: 50 }]);
  db.setSetting('outdoorAddress', '8');
  assert.deepEqual(db.outdoorBuckets(10_000, 0, 15_000), [{ at: 5000, t: 10, rh: 50 }]);
});

test('completed outdoor buckets are cached; a late reading inside one drops the cache', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  db.setSetting('outdoorAddress', '9');
  const add = (at, tt) => db.addOutdoorReading({ address: 9, at, ok: true, t: tt, rh: 50 });
  add(1000, 20); add(12_000, 22);
  const first = db.outdoorBuckets(10_000, 0, 25_000);
  assert.deepEqual(first.map((p) => p.t), [20, 22]);
  assert.deepEqual(db.outdoorBuckets(10_000, 0, 25_000), first);
  add(2000, 24); // inside the completed bucket 0
  assert.deepEqual(db.outdoorBuckets(10_000, 0, 25_000).map((p) => p.t), [22, 22]);
});

test('unwiring a device logs its machines off; an unrelated edit does not', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ ...fields, relayAddress: 3, acAddress: 4 }, 100);
  db.logMachine(room.id, 'intake', { on: true }, 'auto', 200);
  db.logMachine(room.id, 'humidifier', { on: true }, 'auto', 200);
  db.logMachine(room.id, 'exhaust', { on: false }, 'auto', 200);
  db.logMachine(room.id, 'ac', { on: true, setpoint: 22, mode: 'cool', fan: 'auto' }, 'manual', 200);
  db.updateRoom(room.id, { ...fields, name: 'A2', relayAddress: 3, acAddress: 4 }, 300);
  assert.equal(db.machineLog(room.id, 'intake').length, 1);
  db.updateRoom(room.id, { ...fields, relayAddress: null, acAddress: 4 }, 400);
  assert.deepEqual(db.machineLog(room.id, 'intake').map((r) => [r.at, r.on]), [[200, true], [400, false]]);
  assert.deepEqual(db.machineLog(room.id, 'humidifier').map((r) => [r.at, r.on]), [[200, true], [400, false]]);
  assert.equal(db.machineLog(room.id, 'exhaust').length, 1); // was off already
  assert.equal(db.machineLog(room.id, 'ac').length, 1); // aircon still wired
  db.updateRoom(room.id, { ...fields, relayAddress: null, acAddress: 7 }, 500); // a changed address is another device
  assert.deepEqual(db.machineLog(room.id, 'ac').map((r) => [r.at, r.on, r.mode]), [[200, true, 'cool'], [500, false, 'cool']]);
  assert.equal(db.machineLog(room.id, 'intake').length, 2);
});

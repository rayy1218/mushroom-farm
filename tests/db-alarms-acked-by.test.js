// Who acknowledged an alarm (spec 2026-11-12-alarms-triage-design.md 7): database 27's alarms.acked_by, the step from 26, and
// the step on a real version 26 farm file when a copy is on this machine.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

mkdirSync('/tmp/alarms-triage', { recursive: true });
// a file in a new folder, removed after the test (review 2026-11-12)
const fileOf = (t) => {
  const dir = mkdtempSync('/tmp/alarms-triage/db-');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, 'farm.db');
};
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5 };

test('acknowledge keeps who: the first name stays; a room or a group takes one; a tier change clears it', () => {
  const db = openDb(':memory:');
  const room = db.createRoom(ROOM).id;
  const a = db.raiseAlarm(room, 'tHigh', 'warning', 'hot', 1000);
  assert.equal(db.ackAlarm(a, 2000, 'Me').ackedBy, 'Me');
  assert.equal(db.ackAlarm(a, 3000, 'Ray').ackedBy, 'Me', 'acknowledged again: the first name and time stay');
  db.escalateAlarm(a, 'serious', 'hot for 30 min');
  assert.deepEqual([db.getAlarm(a).ackedAt, db.getAlarm(a).ackedBy], [null, null]);
  const b = db.raiseAlarm(room, 'tLow', 'warning', 'cold', 1000);
  assert.equal(db.ackAlarms([a, b], 4000, 'Ray'), 2);
  assert.deepEqual([db.getAlarm(a).ackedBy, db.getAlarm(b).ackedBy], ['Ray', 'Ray']);
  const c = db.raiseAlarm(room, 'rhLow', 'warning', 'dry', 1000);
  db.ackRoomAlarms(room, 5000, 'Ali');
  assert.equal(db.getAlarm(c).ackedBy, 'Ali');
  assert.equal(db.ackAlarm(db.raiseAlarm(room, 'co2High', 'warning', 'x', 1), 6000).ackedBy, null, 'no name given: null');
  db.close();
});

test('a gateway alarm keeps the address it was raised for (review 2026-11-12: History had shown the room\'s gateway of now)', () => {
  const db = openDb(':memory:');
  const room = db.createRoom({ ...ROOM, gateway: '127.0.0.1:1512' }).id;
  const g = db.raiseAlarm(room, 'gateway', 'serious', "Container 1's gateway not answering", 1000, { gateway: '127.0.0.1:1512' });
  db.updateRoom(room, { ...db.getRoom(room), gateway: '127.0.0.1:1599' }); // the room moved to another gateway since
  assert.equal(db.getAlarm(g).gatewayAddress, '127.0.0.1:1512');
  const other = db.raiseAlarm(room, 'tHigh', 'warning', 'hot', 1000);
  assert.equal('gatewayAddress' in db.getAlarm(other), false, 'only a gateway alarm carries one');
  db.close();
});

test('a version 26 database is upgraded to 27: alarms gain acked_by (empty), every alarm kept', (t) => {
  const file = fileOf(t);
  const db = openDb(file);
  const room = db.createRoom(ROOM).id;
  const old = db.raiseAlarm(room, 'tHigh', 'warning', 'hot', 1000);
  db.ackAlarm(old, 2000);
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec('ALTER TABLE alarms DROP COLUMN acked_by; ALTER TABLE alarms DROP COLUMN gateway; PRAGMA user_version = 26;'); // a version 26 file
  raw.close();
  const again = openDb(file);
  assert.deepEqual([again.getAlarm(old).ackedAt, again.getAlarm(old).ackedBy], [2000, null]);
  again.close();
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 27);
  assert.ok(check.prepare('PRAGMA table_info(alarms)').all().some((c) => c.name === 'acked_by' && c.type === 'TEXT'));
  assert.ok(check.prepare('PRAGMA table_info(alarms)').all().some((c) => c.name === 'gateway' && c.type === 'TEXT'));
  check.close();
});

// A real version 26 farm file, named by FARM_REAL_V26 (skipped without it). Copied, never opened in place.
const REAL = process.env.FARM_REAL_V26 ?? '';
test('a real version 26 farm file (the audit copy) opens at 27 with its alarms and rooms', { skip: !(REAL && existsSync(REAL)) && 'set FARM_REAL_V26 to a v26 farm file' }, () => {
  const dir = mkdtempSync('/tmp/alarms-triage/real-');
  const file = join(dir, 'v2.db');
  // a consistent copy even while a farm app writes the file (a plain file copy could catch it half-written)
  const source = new DatabaseSync(REAL, { readOnly: true });
  source.exec(`VACUUM INTO '${file}'`);
  source.close();
  try {
    const before = new DatabaseSync(file, { readOnly: true });
    const was = before.prepare('PRAGMA user_version').get().user_version;
    const alarms = before.prepare('SELECT COUNT(*) AS n FROM alarms').get().n;
    const rooms = before.prepare('SELECT COUNT(*) AS n FROM rooms').get().n;
    before.close();
    assert.equal(was, 26);
    const db = openDb(file);
    assert.equal(db.listRooms().length, rooms);
    assert.equal(db.roomAlarms(db.listRooms()[0].id).history.every((a) => a.ackedBy === null), true);
    db.close();
    const after = new DatabaseSync(file, { readOnly: true });
    assert.equal(after.prepare('PRAGMA user_version').get().user_version, 27);
    assert.equal(after.prepare('SELECT COUNT(*) AS n FROM alarms').get().n, alarms);
    assert.equal(after.prepare('SELECT COUNT(*) AS n FROM alarms WHERE acked_by IS NOT NULL').get().n, 0);
    assert.ok(statSync(file).size > 0);
    after.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

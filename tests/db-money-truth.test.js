// Money truth's database step (spec 2026-11-12-money-truth-design.md 2): version 28 from a version 27 file (the alarms'
// 27), the equipment register's table and trigger, a run's block-in day and a room's type.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

mkdirSync('/tmp/money-truth', { recursive: true });
const fileOf = () => join(mkdtempSync('/tmp/money-truth/db-'), 'farm.db');
const T = Date.UTC(2026, 10, 12, 4); // 12:00 on the farm
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

// A version 27 file: made new, then the step's table, trigger and columns taken out again.
function version27() {
  const file = fileOf();
  const db = openDb(file);
  const room = db.createRoom(ROOM, T).id;
  const crops = [{ crop: 'oyster', blocks: 600 }];
  db.setProgram(room, { ...db.getProgram(room), crops }, { change: 'start', at: T });
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec(`DROP TRIGGER equipment_room_gone; DROP TABLE equipment;
    ALTER TABLE runs DROP COLUMN blocks_in_at; ALTER TABLE rooms DROP COLUMN room_type; PRAGMA user_version = 27;`);
  raw.close();
  return { file, room };
}

test('a version 27 database is upgraded to 28: the equipment table (STRICT) and its trigger, the two columns; rooms and runs kept', () => {
  const { file, room } = version27();
  const db = openDb(file);
  db.close();
  const alarmCols = new DatabaseSync(file);
  const names = alarmCols.prepare('PRAGMA table_info(alarms)').all().map((c) => c.name);
  alarmCols.close();
  assert.ok(names.includes('acked_by') && names.includes('gateway'), "the alarms' columns kept");
  const again = openDb(file);
  assert.equal(again.getRoom(room).name, 'Container 1');
  assert.equal(again.openRun(room).crops[0].blocks, 600);
  again.close();
  const raw = new DatabaseSync(file);
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 28);
  const sql = (name) => raw.prepare('SELECT type, sql FROM sqlite_master WHERE name = ?').get(name);
  assert.match(sql('equipment').sql, /STRICT/);
  assert.equal(sql('equipment_room_gone').type, 'trigger');
  assert.equal(raw.prepare('SELECT blocks_in_at FROM runs').get().blocks_in_at, null, 'an old run has no block-in day');
  assert.equal(raw.prepare('SELECT room_type FROM rooms').get().room_type, 'container', 'every room of before is a container');
  assert.throws(() => raw.exec("UPDATE rooms SET room_type = 'tent'"), /CHECK/);
  assert.throws(() => raw.exec(`INSERT INTO equipment (name, part, bought_on, amount, life_months, created_at)
    VALUES ('Mixer', 'engine', '2026-01-03', 900, 60, ${T})`), /CHECK/);
  raw.close();
});

test('a deleted room\'s equipment becomes the farm\'s (room ids are reused)', () => {
  const file = fileOf();
  const db = openDb(file);
  const room = db.createRoom(ROOM, T).id;
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec(`INSERT INTO equipment (name, room_id, part, bought_on, amount, life_months, created_at)
    VALUES ('Daikin FTKF 2.5 hp', ${room}, 'cooling', '2025-01-03', 4170, 60, ${T})`);
  raw.close();
  const again = openDb(file);
  again.deleteRoom(room);
  again.close();
  const check = new DatabaseSync(file);
  assert.deepEqual({ ...check.prepare('SELECT room_id, part, resale, note FROM equipment').get() }, { room_id: null, part: 'cooling', resale: 0, note: '' });
  check.close();
});

test('a room\'s type: checked (container, built room, shed), a new room a container, kept when an edit leaves it out', async () => {
  const { validateRoom } = await import('../server/rooms.js');
  const { parseRoomFields, fieldTexts } = await import('../web/room-fields.js');
  assert.equal(validateRoom({ ...ROOM, roomType: 'built' }).room.roomType, 'built');
  assert.equal(validateRoom(ROOM).room.roomType, undefined, 'left out: kept');
  assert.equal(validateRoom({ ...ROOM, roomType: null }).room.roomType, undefined, 'null: kept');
  assert.deepEqual(validateRoom({ ...ROOM, roomType: 'tent' }), { error: 'Pick a room type', field: 'roomType' });
  const db = openDb(':memory:');
  const made = db.createRoom(ROOM, T);
  assert.equal(made.roomType, 'container');
  assert.equal(db.updateRoom(made.id, { ...ROOM, roomType: 'built' }, T).roomType, 'built');
  assert.equal(db.updateRoom(made.id, { ...ROOM, name: 'Room 1' }, T).roomType, 'built', 'kept when left out');
  assert.equal(db.createRoom({ ...ROOM, name: 'Shed 1', trhAddress: 2, roomType: 'shed' }, T).roomType, 'shed');
  db.close();
  assert.equal(parseRoomFields({ ...fieldTexts({ ...ROOM, roomType: 'shed' }) }, ['roomType']).values.roomType, 'shed');
  assert.deepEqual(parseRoomFields({ roomType: 'tent' }, ['roomType']).errors, { roomType: 'Pick a room type' });
  assert.equal(fieldTexts(null).roomType, 'container', 'a new room');
});

test('a version 26 database is upgraded to 28 in one start (through the alarms\' 27)', () => {
  const { file, room } = version27();
  const raw = new DatabaseSync(file);
  raw.exec('ALTER TABLE alarms DROP COLUMN acked_by; ALTER TABLE alarms DROP COLUMN gateway; PRAGMA user_version = 26;'); // a true v26 file
  raw.close();
  const db = openDb(file);
  assert.equal(db.getRoom(room).roomType, 'container');
  assert.deepEqual(db.listEquipment(), []);
  db.close();
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 28);
  const alarms = check.prepare('PRAGMA table_info(alarms)').all().map((c) => c.name);
  assert.ok(alarms.includes('acked_by') && alarms.includes('gateway'), "the alarms' 27 ran on the way");
  for (const [table, column] of [['runs', 'blocks_in_at'], ['rooms', 'room_type']]) {
    assert.ok(check.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column), column);
  }
  check.close();
});

test('a file at 28 from before the crop index gains harvests_by_crop on open', () => {
  const file = fileOf();
  openDb(file).close();
  const raw = new DatabaseSync(file);
  raw.exec('DROP INDEX harvests_by_crop;'); // still at 28
  raw.close();
  openDb(file).close();
  const check = new DatabaseSync(file);
  assert.equal(check.prepare("SELECT type FROM sqlite_master WHERE name = 'harvests_by_crop'").get()?.type, 'index');
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 28);
  check.close();
});

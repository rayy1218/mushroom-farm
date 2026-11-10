// The Economics table (spec 2026-11-06-economics-design.md 3): the step to version 26 from a version-25 file, the owner's
// figures with their "every" sentinels, a deleted room taking its rows, the simulator row's start, done and failed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, SIM_KEY } from '../server/db.js';

mkdirSync('/tmp/economics', { recursive: true });
const fileOf = () => join(mkdtempSync('/tmp/economics/db-'), 'farm.db');
const T = Date.UTC(2026, 10, 6, 6); // 14:00 on the farm
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

test('a version 25 database is upgraded to 26: the table (STRICT), its unique index and the room trigger; its rooms kept', () => {
  const file = fileOf();
  const db = openDb(file);
  const room = db.createRoom(ROOM, T).id;
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec('DROP TRIGGER economics_room_gone; DROP TABLE economics_figures; PRAGMA user_version = 25;'); // a version 25 file
  raw.close();
  const again = openDb(file);
  assert.equal(again.getRoom(room).name, 'Container 1');
  assert.deepEqual(again.economicsFigures(room, 'lionsmane'), []);
  again.close();
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 26);
  const kinds = (name) => check.prepare('SELECT type, sql FROM sqlite_master WHERE name = ?').get(name);
  assert.match(kinds('economics_figures').sql, /STRICT/);
  assert.equal(kinds('economics_figure').type, 'index');
  assert.match(kinds('economics_figure').sql, /UNIQUE INDEX/);
  assert.equal(kinds('economics_room_gone').type, 'trigger');
  assert.throws(() => check.exec("INSERT INTO economics_figures (key, source) VALUES ('price', 'guess')"), /CHECK/);
  assert.throws(() => check.exec("INSERT INTO economics_figures (key, source, status) VALUES ('price', 'owner', 'busy')"), /CHECK/);
  check.close();
});

test('the owner\'s figures: set (again: the last wins), read with the room\'s and every room\'s and crop\'s, cleared', () => {
  const db = openDb(':memory:');
  const one = db.createRoom(ROOM, T).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, T).id;
  const set = (roomId, crop, key, value, at = T) => db.setEconomicsFigure({ roomId, crop, key, value, at });
  assert.deepEqual(set(0, '', 'wage', 12), {
    id: 1, roomId: 0, crop: '', key: 'wage', source: 'owner', value: 12, at: T, status: null, simId: null, startedAt: null,
    error: null, kwh: null, blocks: null, days: null,
  });
  set(0, 'lionsmane', 'price', 55);
  set(0, 'oyster', 'price', 11);
  set(one, '', 'yours.rent', 300);
  set(one, 'lionsmane', 'yours.yieldG', 230);
  set(two, 'lionsmane', 'yours.yieldG', 180);
  assert.equal(set(0, 'lionsmane', 'price', 60, T + 1).value, 60, 'the last save wins');
  const keys = (roomId, crop) => db.economicsFigures(roomId, crop).map((r) => `${r.roomId}/${r.crop}/${r.key}=${r.value}`);
  assert.deepEqual(keys(one, 'lionsmane'), ['0//wage=12', '0/lionsmane/price=60', `${one}//yours.rent=300`, `${one}/lionsmane/yours.yieldG=230`]);
  assert.deepEqual(keys(two, 'oyster'), ['0//wage=12', '0/oyster/price=11']);
  assert.equal(db.clearEconomicsFigure({ roomId: 0, crop: 'lionsmane', key: 'price' }), true);
  assert.equal(db.clearEconomicsFigure({ roomId: 0, crop: 'lionsmane', key: 'price' }), false, 'nothing left to clear');
  assert.deepEqual(keys(one, 'lionsmane'), ['0//wage=12', `${one}//yours.rent=300`, `${one}/lionsmane/yours.yieldG=230`]);
  db.close();
});

test('a deleted room takes its own rows; the farm\'s and the crops\' stay', () => {
  const db = openDb(':memory:');
  const one = db.createRoom(ROOM, T).id;
  db.setEconomicsFigure({ roomId: 0, crop: 'lionsmane', key: 'price', value: 55, at: T });
  db.setEconomicsFigure({ roomId: one, crop: '', key: 'yours.rent', value: 300, at: T });
  db.setEconomicsFigure({ roomId: one, crop: 'lionsmane', key: 'yours.yieldG', value: 230, at: T });
  db.startEconomicsSim({ roomId: one, crop: 'lionsmane', simId: 4, at: T });
  db.deleteRoom(one);
  assert.deepEqual(db.economicsFigures(one, 'lionsmane').map((r) => r.key), ['price']);
  db.close();
});

test('the simulator row: started (working), done with its figure, started again (the figure kept), failed (the figure kept)', () => {
  const db = openDb(':memory:');
  const one = db.createRoom(ROOM, T).id;
  const where = { roomId: one, crop: 'lionsmane' };
  const first = db.startEconomicsSim({ ...where, simId: 7, at: T });
  assert.deepEqual([first.key, first.source, first.status, first.simId, first.startedAt, first.value], [SIM_KEY, 'simulator', 'working', 7, T, null]);
  assert.deepEqual(db.economicsSimsWorking().map((r) => r.simId), [7]);
  const done = db.settleEconomicsSim({ ...where, value: 0.478, at: T + 4000, kwh: 708.7, blocks: 1482, days: 42 });
  assert.deepEqual([done.status, done.value, done.at, done.kwh, done.blocks, done.days, done.error], ['done', 0.478, T + 4000, 708.7, 1482, 42, null]);
  assert.deepEqual(db.economicsSimsWorking(), []);
  const again = db.startEconomicsSim({ ...where, simId: 9, at: T + 9000 });
  assert.deepEqual([again.status, again.simId, again.startedAt, again.value, again.at], ['working', 9, T + 9000, 0.478, T + 4000]);
  const failed = db.settleEconomicsSim({ ...where, error: 'Stopped by a restart of the farm app' });
  assert.deepEqual([failed.status, failed.error, failed.value, failed.kwh], ['failed', 'Stopped by a restart of the farm app', 0.478, 708.7]);
  assert.equal(db.settleEconomicsSim({ roomId: one, crop: 'oyster', error: 'x' }), null, 'no row for grey oyster');
  assert.deepEqual(db.economicsFigures(one, 'lionsmane').map((r) => r.source), ['simulator'], 'the owner\'s row is apart');
  db.close();
});

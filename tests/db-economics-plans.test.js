// A run's plan (spec 2026-11-12-economics-stage-2-design.md 7.2): the step to version 30 from a version-28 file (the table,
// its indexes and trigger, a row with no figures for each crop of the four of every run then), a plan saved once and never
// replaced, the room's plans newest run first, a deleted run or room taking its plans.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

mkdirSync('/tmp/economics-2', { recursive: true });
const fileOf = () => join(mkdtempSync('/tmp/economics-2/db-'), 'farm.db');
const T = Date.UTC(2026, 8, 1, 1); // 09:00 on the farm, 1 Sep 2026
const DAY = 86_400_000;
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

// A room's run of crops from `at`, ended at `to` when given. → its id.
function run(db, room, crops, at, to = null) {
  db.setProgram(room, { ...db.getProgram(room), crops }, { change: 'start', at });
  const id = db.openRun(room).id;
  if (to !== null) db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: to });
  return id;
}

test('a version 28 database is upgraded to 30: the table (STRICT), its indexes and trigger, a row before for each crop of the four', () => {
  const file = fileOf();
  const db = openDb(file);
  const one = db.createRoom(ROOM, T).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, T).id;
  const mixed = run(db, one, [{ crop: 'lionsmane', blocks: 800 }, { crop: 'oyster', blocks: 200 }], T, T + 30 * DAY);
  const black = run(db, two, [{ crop: 'black', blocks: 500 }], T, T + 20 * DAY);
  const pink = run(db, one, [{ crop: 'pink', blocks: 600 }], T + 31 * DAY);
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec('DROP TRIGGER economics_plan_run_gone; DROP TABLE economics_plans; PRAGMA user_version = 28;'); // a version 28 file
  raw.close();
  const before = Date.now();
  const again = openDb(file);
  const after = Date.now();
  const rows = again.economicsPlans(one, 'lionsmane');
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0], at: 0, id: 0 }, { id: 0, runId: mixed, roomId: one, crop: 'lionsmane', at: 0, figures: null, context: null });
  assert.ok(rows[0].at >= before && rows[0].at <= after, 'the upgrade\'s clock');
  assert.equal(again.economicsPlan(mixed, 'oyster').figures, null);
  assert.equal(again.economicsPlan(pink, 'pink').figures, null, 'an open run too');
  assert.equal(again.economicsPlan(black, 'black'), null, 'a crop not of the four has none');
  again.close();
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 30);
  const kinds = (name) => check.prepare('SELECT type, sql FROM sqlite_master WHERE name = ?').get(name);
  assert.match(kinds('economics_plans').sql, /STRICT/);
  assert.match(kinds('economics_plan').sql, /UNIQUE INDEX/);
  assert.equal(kinds('economics_plans_by_room').type, 'index');
  assert.equal(kinds('economics_plan_run_gone').type, 'trigger');
  assert.equal(check.prepare('SELECT COUNT(*) AS n FROM economics_plans').get().n, 3);
  check.close();
});

test('a new database at 30 has the table and no rows', () => {
  const db = openDb(':memory:');
  const room = db.createRoom(ROOM, T).id;
  run(db, room, [{ crop: 'lionsmane', blocks: 800 }], T);
  assert.deepEqual(db.economicsPlans(room, 'lionsmane'), [], 'a run made after the upgrade has no row until Economics saves one');
  db.close();
});

test('a plan is saved once and never replaced; the room\'s plans newest run first; a deleted run or room takes its plans', () => {
  const db = openDb(':memory:');
  const room = db.createRoom(ROOM, T).id;
  const other = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, T).id;
  const first = run(db, room, [{ crop: 'lionsmane', blocks: 800 }], T, T + 30 * DAY);
  const second = run(db, room, [{ crop: 'lionsmane', blocks: 900 }], T + 31 * DAY);
  const elsewhere = run(db, other, [{ crop: 'lionsmane', blocks: 400 }], T);
  const figures = { price: { value: 50, source: 'research' }, 'yours.blocks': { value: 800, source: 'runs' } };
  const context = { otherBlocks: 1200, register: null };
  const save = (runId, roomId, at, f = figures) => db.saveEconomicsPlan({ runId, roomId, crop: 'lionsmane', at, figures: f, context });
  assert.equal(save(first, room, T), true);
  assert.equal(save(first, room, T + DAY, { price: { value: 99, source: 'owner' } }), false, 'never replaced');
  assert.equal(save(second, room, T + 31 * DAY), true);
  assert.equal(save(elsewhere, other, T), true);
  assert.deepEqual(db.economicsPlan(first, 'lionsmane'), { id: 1, runId: first, roomId: room, crop: 'lionsmane', at: T, figures, context });
  assert.deepEqual(db.economicsPlans(room, 'lionsmane').map((p) => p.runId), [second, first]);
  assert.deepEqual(db.economicsPlans(room, 'oyster'), []);
  db.deleteRoom(other);
  assert.equal(db.economicsPlan(elsewhere, 'lionsmane'), null, 'deleteRoom deletes its runs: the trigger takes their plans');
  assert.equal(db.economicsPlans(room, 'lionsmane').length, 2);
  db.close();
});

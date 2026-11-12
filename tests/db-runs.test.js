// The Runs block of server/db.js (spec 2026-11-05-runs-design.md 2): allRuns, every run of blocks newest started first with
// its room's name; no table of its own.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 1, 1); // 1 Oct 2026 09:00 at the farm
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4 };
const start = (db, roomId, crops, at, change = 'start') => db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change, at });

test('allRuns: none on a new farm', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  assert.deepEqual(db.allRuns(), []);
});

test('allRuns: every room\'s runs, newest started first, with the room\'s name; a deleted room\'s runs go with it', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const one = db.createRoom({ ...ROOM, trhAddress: 1 }, T0).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, T0).id;
  start(db, one, [{ crop: 'oyster', blocks: 600 }], T0);
  start(db, two, [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 100 }], T0 + DAY);
  start(db, one, [{ crop: 'pink', blocks: 500 }], T0 + 30 * DAY, 'restart');
  const runs = db.allRuns();
  assert.deepEqual(runs.map((r) => [r.roomName, r.startedAt, r.endedAt]), [
    ['Container 1', T0 + 30 * DAY, null],
    ['Container 2', T0 + DAY, null],
    ['Container 1', T0, T0 + 30 * DAY],
  ]);
  assert.deepEqual(Object.keys(runs[0]), ['id', 'roomId', 'startedAt', 'endedAt', 'crops', 'partial', 'blocksInAt', 'roomName']);
  assert.deepEqual(runs[1].crops, [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 100 }]);
  assert.equal(runs[1].partial, false);
  db.deleteRoom(two);
  assert.deepEqual(db.allRuns().map((r) => r.roomName), ['Container 1', 'Container 1']);
});

test('allRuns: a run whose room is not there reads roomName null', (t) => {
  mkdirSync('/tmp/runs', { recursive: true });
  const dir = mkdtempSync('/tmp/runs/db-');
  const file = join(dir, 'farm.db');
  const db = openDb(file);
  const raw = new DatabaseSync(file);
  t.after(() => { raw.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  raw.prepare('INSERT INTO runs (room_id, started_at, crops) VALUES (?, ?, ?)').run(99, T0, '[{"crop":"oyster","blocks":10}]');
  assert.deepEqual(db.allRuns().map((r) => [r.roomId, r.roomName]), [[99, null]]);
});

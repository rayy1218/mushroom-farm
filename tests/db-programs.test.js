// Upgrade 11: room crops, stage programs and simulation runs (spec 2026-10-20-crops-and-simulation-design.md 3.1, 4.4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { PROGRAM_DEFAULTS } from '../server/program.js';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

test('a room without a program has the defaults and no crops; null for no room', (t) => {
  const db = fresh(t);
  const { id } = db.createRoom(fields);
  assert.deepEqual(db.getProgram(id), PROGRAM_DEFAULTS);
  assert.equal(db.getProgram(99), null);
  assert.equal(db.setProgram(99, PROGRAM_DEFAULTS), false);
});

test('setProgram stores the program and its crops in order; a new list replaces the old', (t) => {
  const db = fresh(t);
  const { id } = db.createRoom(fields);
  const p = {
    ...PROGRAM_DEFAULTS, crops: [{ crop: 'golden', blocks: 200 }, { crop: 'oyster', blocks: 300 }], farmType: 'full', stage: 'pinning',
    stageSince: 123, flush: 2, flushes: 3, days: { spawn: 20, pinning: 5, fruiting: 8, rest: 9 }, rampH: 2.5, autoAdvance: false,
    ramp: { from: { tLow: 1 }, to: { tLow: 2 }, startAt: 1, endAt: 2 }, done: true,
  };
  assert.equal(db.setProgram(id, p), true);
  assert.deepEqual(db.getProgram(id), p);
  db.setProgram(id, { ...p, crops: [{ crop: 'pink', blocks: 5 }], ramp: null });
  assert.deepEqual(db.getProgram(id).crops, [{ crop: 'pink', blocks: 5 }]);
  assert.equal(db.getProgram(id).ramp, null);
});

test('runs: create, progress, finish, list newest first without the result, get with it, delete', (t) => {
  const db = fresh(t);
  const { id } = db.createRoom(fields);
  const run = db.createRun(id, { days: 7 }, 1000);
  assert.deepEqual(run, { id: run.id, roomId: id, createdAt: 1000, status: 'queued', progress: 0, input: { days: 7 }, summary: null, error: null, finishedAt: null });
  db.setRunProgress(run.id, 'running', 0.5);
  assert.equal(db.getRun(run.id).progress, 0.5);
  assert.equal(db.getRun(run.id).result, null);
  db.finishRun(run.id, { status: 'done', summary: { inBand: { all: 90 } }, result: { series: [1, 2] } }, 2000);
  const done = db.getRun(run.id);
  assert.equal(done.status, 'done');
  assert.equal(done.progress, 1);
  assert.deepEqual(done.result, { series: [1, 2] });
  assert.deepEqual(done.summary, { inBand: { all: 90 } });
  assert.equal(done.finishedAt, 2000);
  const second = db.createRun(id, { days: 1 }, 3000);
  assert.deepEqual(db.listRuns(id).map((r) => r.id), [second.id, run.id]);
  assert.equal('result' in db.listRuns(id)[1], false);
  assert.equal('result' in db.getRun(run.id, { withResult: false }), false);
  assert.equal(db.deleteRun(second.id), true);
  assert.equal(db.getRun(second.id), null);
  assert.equal(db.deleteRun(second.id), false);
});

test('a failed run keeps its progress and error; unfinished runs fail at a start', (t) => {
  const db = fresh(t);
  const { id } = db.createRoom(fields);
  const a = db.createRun(id, {}, 1);
  const b = db.createRun(id, {}, 2);
  db.setRunProgress(a.id, 'running', 0.3);
  assert.deepEqual(db.failUnfinishedRuns('Stopped by a restart of the farm app', 5), [a.id, b.id]);
  assert.equal(db.getRun(a.id).status, 'failed');
  assert.equal(db.getRun(a.id).progress, 0.3);
  assert.equal(db.getRun(a.id).error, 'Stopped by a restart of the farm app');
  assert.deepEqual(db.failUnfinishedRuns('x', 6), []);
});

test('at most 20 finished runs per room are kept; a running one is never pruned', (t) => {
  const db = fresh(t);
  const { id } = db.createRoom(fields);
  const other = db.createRoom({ ...fields, name: 'Room 2' }).id;
  const running = db.createRun(id, {}, 0);
  db.setRunProgress(running.id, 'running', 0.1);
  db.createRun(other, {}, 0);
  for (let i = 1; i <= 22; i++) db.finishRun(db.createRun(id, { i }, i).id, { status: 'done', summary: {}, result: {} }, i);
  const left = db.listRuns(id, 100);
  assert.equal(left.length, 21);
  assert.ok(left.some((r) => r.id === running.id));
  assert.deepEqual(left.filter((r) => r.status === 'done').map((r) => r.input.i).sort((x, y) => x - y)[0], 3);
  assert.equal(db.listRuns(other).length, 1);
});

test('deleting a room deletes its crops, program and runs', (t) => {
  const db = fresh(t);
  const { id } = db.createRoom(fields);
  db.setProgram(id, { ...PROGRAM_DEFAULTS, crops: [{ crop: 'oyster', blocks: 1 }] });
  const run = db.createRun(id, {}, 1);
  db.deleteRoom(id);
  assert.equal(db.getRun(run.id), null);
  const again = db.createRoom(fields);
  assert.deepEqual(db.getProgram(again.id).crops, []);
});

test('upgrade 10 to 11 adds the tables and keeps the rooms', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'programs-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'farm.db');
  const first = openDb(path);
  first.createRoom(fields);
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec('DROP TABLE room_crops; DROP TABLE room_programs; DROP TABLE simulation_runs; PRAGMA user_version = 10;');
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.listRooms().length, 1);
  assert.deepEqual(db.getProgram(1), PROGRAM_DEFAULTS);
  const check = new DatabaseSync(path, { readOnly: true });
  t.after(() => check.close());
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 11);
});

// The suggestion jobs (server/simulations.js, spec 2026-10-22-suggest-machines-design.md 4 and 5): validation, the one queue shared
// with the simulation runs, progress, done, failed, cancel, one per room, 20 kept, a deleted room, and the real worker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createSimulations, validateSizing, spawnWorker } from '../server/simulations.js';

const physics = { wallUA: 30, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 100 };
const sizing = (over = {}) => ({ physics, crops: [{ crop: 'lionsmane', blocks: 950 }], farmType: 'ready', stage: 'fruiting', ...over });
const run = (over = {}) => ({ physics: { ...physics, fanFlow: 600, acBTU: 12000, humidifierLH: 2 }, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1, ...over });

function setup(t) {
  const db = openDb(':memory:');
  const a = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  const b = db.createRoom({ name: 'Room 2', length: 6, width: 4, height: 2.5 }).id;
  const jobs = [];
  const sims = createSimulations({ db, now: () => 7000, spawn: (job, handlers) => { const j = { job, handlers, stopped: false }; jobs.push(j); return { stop: () => { j.stopped = true; } }; } });
  t.after(() => { sims.close(); db.close(); });
  return { db, a, b, sims, jobs };
}

const reply = { target: 95, days: 17, estimate: {}, best: [], reached: true, notes: [] };

test('validation: the walls, weather and sun, crops, farm type, stage and the target (default 95)', () => {
  const bad = (over, field) => assert.equal(validateSizing(sizing(over)).field, field, JSON.stringify(validateSizing(sizing(over))));
  assert.ok(validateSizing(null).error);
  bad({ physics: null }, 'physics');
  bad({ physics: { ...physics, wallUA: -1 } }, 'physics.wallUA');
  bad({ physics: { ...physics, sunW: 'x' } }, 'physics.sunW');
  bad({ physics: { ...physics, outdoorLow: 40 } }, 'physics.outdoorLow');
  bad({ physics: { ...physics, outdoorDew: 26 } }, 'physics.outdoorDew');
  bad({ crops: [] }, 'crops');
  bad({ farmType: 'both' }, 'farmType');
  bad({ stage: 'spawn' }, 'stage');
  for (const target of [49, 100, 95.5, '95', null]) bad({ target }, 'target');
  assert.equal(validateSizing(sizing({ target: 100 })).error, 'Target must be a whole number from 50 to 99 %');
  const { input } = validateSizing(sizing());
  assert.equal(input.target, 95);
  assert.deepEqual(Object.keys(input.physics), ['wallUA', 'outdoorHigh', 'outdoorLow', 'outdoorDew', 'sunW'], 'only the known fields, no machines');
  assert.equal(validateSizing(sizing({ target: 50, physics: { ...physics, fanFlow: 5000, extra: 1 } })).input.target, 50);
  assert.deepEqual(Object.keys(validateSizing(sizing({ physics: { ...physics, fanFlow: 5000 } })).input.physics), ['wallUA', 'outdoorHigh', 'outdoorLow', 'outdoorDew', 'sunW']);
});

test('start queues a job with the total candidates and starts it at once, with the room\'s context', (t) => {
  const { a, sims, jobs } = setup(t);
  const { job } = sims.startSizing(a, sizing());
  assert.deepEqual(job, { id: 1, roomId: a, status: 'queued', progress: 0, tried: 0, total: 36, createdAt: 7000, finishedAt: null, result: null, error: null });
  assert.equal(sims.getSizing(1).status, 'running');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].job.kind, 'sizing');
  assert.equal(jobs[0].job.input.target, 95);
  assert.equal(jobs[0].job.ctx.volume, 60);
  assert.equal(jobs[0].job.ctx.control.exchangeMaxMin, 10);
  assert.equal(sims.getSizing(99), null);
  assert.deepEqual(sims.startSizing(a, sizing({ target: 10 })), { error: 'Target must be a whole number from 50 to 99 %', field: 'target' });
});

test('progress, done and failed', (t) => {
  const { a, b, sims, jobs } = setup(t);
  sims.startSizing(a, sizing());
  jobs[0].handlers.onProgress(0.25);
  assert.equal(sims.getSizing(1).progress, 0.25);
  assert.equal(sims.getSizing(1).tried, 9); // a quarter of the 36 setups
  jobs[0].handlers.onDone(reply);
  assert.deepEqual([sims.getSizing(1).status, sims.getSizing(1).progress, sims.getSizing(1).finishedAt, sims.getSizing(1).result], ['done', 1, 7000, reply]);
  assert.equal(sims.getSizing(1).tried, 36);
  sims.startSizing(b, sizing());
  jobs[1].handlers.onError('boom');
  assert.deepEqual([sims.getSizing(2).status, sims.getSizing(2).error, sims.getSizing(2).result], ['failed', 'boom', null]);
});

test('one per room: 409 while waiting or running, allowed again when it ended; another room is independent', (t) => {
  const { a, b, sims, jobs } = setup(t);
  sims.startSizing(a, sizing());
  assert.deepEqual(sims.startSizing(a, sizing()), { error: 'A suggestion is already being worked out for this room', conflict: true });
  const other = sims.startSizing(b, sizing()).job;
  assert.equal(other.status, 'queued'); // waits for the first
  assert.equal(sims.startSizing(b, sizing()).conflict, true, 'queued counts');
  jobs[0].handlers.onDone(reply);
  assert.equal(sims.getSizing(other.id).status, 'running');
  assert.ok(sims.startSizing(a, sizing()).job);
});

test('sizing jobs and simulation runs share one queue, one at a time', (t) => {
  const { db, a, b, sims, jobs } = setup(t);
  const first = sims.start(a, run()).run;
  const suggestion = sims.startSizing(b, sizing()).job;
  const second = sims.start(b, run()).run;
  assert.equal(jobs.length, 1);
  assert.equal(suggestion.status, 'queued');
  jobs[0].handlers.onDone({ summary: { days: 1 } });
  assert.equal(db.getRun(first.id).status, 'done');
  assert.equal(jobs.length, 2);
  assert.equal(jobs[1].job.kind, 'sizing');
  assert.equal(db.getRun(second.id).status, 'queued');
  jobs[1].handlers.onDone(reply);
  assert.equal(jobs.length, 3);
  assert.equal(db.getRun(second.id).status, 'running');
  // The runs' limit of 5 does not count a suggestion, and ids are separate numbers.
  assert.equal(first.id, suggestion.id);
});

test('cancel stops a running suggestion and forgets it; a queued one is dropped; a run of the same id is untouched', (t) => {
  const { db, a, b, sims, jobs } = setup(t);
  const r = sims.start(a, run()).run; // running, id 1
  const queued = sims.startSizing(b, sizing()).job; // queued, sizing id 1
  assert.equal(sims.cancelSizing(queued.id), true);
  assert.equal(sims.getSizing(queued.id), null);
  assert.equal(db.getRun(r.id).status, 'running');
  assert.equal(jobs[0].stopped, false);
  jobs[0].handlers.onDone({ summary: {} });
  assert.equal(jobs.length, 1, 'the dropped one never starts');
  const running = sims.startSizing(a, sizing()).job;
  assert.equal(jobs.length, 2);
  assert.equal(sims.cancelSizing(running.id), true);
  assert.equal(jobs[1].stopped, true);
  assert.equal(sims.cancelSizing(running.id), false);
  // Cancelling a run does not stop a suggestion of the same id.
  const again = sims.startSizing(a, sizing()).job;
  assert.equal(sims.cancel(again.id), false); // no run with that id
  assert.equal(jobs[2].stopped, false);
});

test('a late message of a cancelled job changes nothing and the next job starts', (t) => {
  const { a, b, sims, jobs } = setup(t);
  const first = sims.startSizing(a, sizing()).job;
  sims.startSizing(b, sizing());
  sims.cancelSizing(first.id);
  assert.equal(jobs.length, 2);
  jobs[0].handlers.onDone(reply);
  assert.equal(sims.getSizing(first.id), null);
  assert.equal(sims.getSizing(2).status, 'running');
});

test('a room keeps its newest 20 finished suggestions', (t) => {
  const { a, sims, jobs } = setup(t);
  for (let i = 0; i < 22; i++) {
    sims.startSizing(a, sizing());
    jobs[i].handlers.onDone(reply);
  }
  assert.equal(sims.getSizing(1), null);
  assert.equal(sims.getSizing(2), null);
  assert.equal(sims.getSizing(3).status, 'done');
  assert.equal(sims.getSizing(22).status, 'done');
});

test('deleting a room stops its suggestion and drops its queued ones; close() forgets everything', (t) => {
  const { db, a, b, sims, jobs } = setup(t);
  const mine = sims.startSizing(a, sizing()).job;
  const theirs = sims.startSizing(b, sizing()).job;
  sims.forgetRoom(a);
  assert.equal(jobs[0].stopped, true);
  assert.equal(sims.getSizing(mine.id), null);
  assert.equal(jobs.length, 2); // the other room's starts at once
  sims.forgetRoom(b);
  assert.equal(sims.getSizing(theirs.id), null);
  const again = sims.startSizing(db.createRoom({ name: 'Room 3', length: 6, width: 4, height: 2.5 }).id, sizing()).job;
  sims.close();
  assert.equal(sims.getSizing(again.id), null);
  assert.equal(jobs.at(-1).stopped, true);
});

test('a spawn that throws fails the suggestion and the next starts', (t) => {
  const db = openDb(':memory:');
  const a = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  let n = 0;
  const sims = createSimulations({ db, spawn: () => { if (n++ === 0) throw new Error('no thread'); return { stop() {} }; } });
  t.after(() => { sims.close(); db.close(); });
  const { job } = sims.startSizing(a, sizing());
  assert.deepEqual([sims.getSizing(job.id).status, sims.getSizing(job.id).error], ['failed', 'no thread']);
  assert.ok(sims.startSizing(a, sizing()).job);
});

test('the real worker thread runs a search and reports progress and the reply', async (t) => {
  const db = openDb(':memory:');
  const a = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 }).id;
  const progress = [];
  const done = await new Promise((resolve, reject) => {
    // A short search: one day of a small room (the worker's own candidate list is the full one, so only the first shares).
    const sims = createSimulations({
      db,
      spawn: (job, h) => {
        const handle = spawnWorker({ ...job, ctx: { ...job.ctx, program: { flushes: 4, days: { fruiting: 1, rest: 1 }, rampH: 4 } } }, { ...h, onProgress: (s) => { progress.push(s); h.onProgress(s); if (s >= 0.04) { handle.stop(); resolve({ progress: sims.getSizing(1).progress }); } }, onDone: reject, onError: reject });
        return handle;
      },
    });
    sims.startSizing(a, sizing({ physics: { ...physics, wallUA: 5 } }));
    t.after(() => sims.close());
  });
  assert.ok(progress.length >= 1);
  assert.ok(done.progress > 0);
  db.close();
});

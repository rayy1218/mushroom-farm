// The simulation jobs (server/simulations.js): validation, one run at a time, progress, done, failed, cancel, restart, and
// the real worker thread for a short run. The in-process spawn here lets a test finish each job by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createSimulations, validateSimulation, spawnWorker, RESTART_TEXT } from '../server/simulations.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const body = (over = {}) => ({ physics, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1, ...over });

// A spawn that records its jobs; the test calls the handlers itself (always after spawn returned, like a worker).
function manual() {
  const jobs = [];
  const spawn = (job, handlers) => {
    const j = { job, handlers, stopped: false };
    jobs.push(j);
    return { stop: () => { j.stopped = true; } };
  };
  return { jobs, spawn };
}

function setup(t, extra = {}) {
  const db = openDb(':memory:');
  const { id } = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 });
  const m = manual();
  const sims = createSimulations({ db, spawn: m.spawn, now: () => 5000, ...extra });
  t.after(() => { sims.close(); db.close(); });
  return { db, id, sims, ...m };
}

const result = (kWh = 3) => ({ series: [], machines: {}, stages: [], summary: { days: 1, energy: { kWh } } });

test('validation names the field of the first problem', () => {
  const bad = (over, field) => {
    const r = validateSimulation(body(over));
    assert.equal(r.field, field, JSON.stringify(r));
    assert.ok(r.error);
  };
  assert.equal(validateSimulation(null).field, undefined);
  assert.ok(validateSimulation(null).error);
  bad({ physics: null }, 'physics');
  bad({ physics: { ...physics, wallUA: -1 } }, 'physics.wallUA');
  bad({ physics: { ...physics, wallUA: 'x' } }, 'physics.wallUA');
  bad({ physics: { ...physics, acBTU: 1000.5 } }, 'physics.acBTU');
  bad({ physics: { ...physics, humidifierLH: 101 } }, 'physics.humidifierLH');
  bad({ physics: { ...physics, outdoorLow: 40 } }, 'physics.outdoorLow'); // low above the high of 33
  bad({ physics: { ...physics, outdoorDew: 26 } }, 'physics.outdoorDew'); // dew above the low of 25
  bad({ crops: [] }, 'crops');
  bad({ crops: [{ crop: 'oyster', blocks: 0 }] }, 'crops');
  bad({ farmType: 'both' }, 'farmType');
  bad({ stage: 'spawn' }, 'stage'); // not in a ready farm
  bad({ days: 0 }, 'days');
  bad({ days: 91 }, 'days');
  bad({ days: 1.5 }, 'days');
  assert.equal(validateSimulation(body({ days: 90 })).error, undefined);
  assert.equal(validateSimulation(body({ farmType: 'full', stage: 'spawn' })).error, undefined);
});

test('start stores a queued run with the input and a snapshot of the room, and begins the first at once', (t) => {
  const { db, id, sims, jobs } = setup(t);
  db.setSetting('waterPrice', '2');
  const { run } = sims.start(id, body());
  assert.equal(run.status, 'queued');
  assert.equal(run.roomId, id);
  assert.equal(run.createdAt, 5000);
  assert.equal(run.input.days, 1);
  assert.equal(run.input.ctx.volume, 60);
  assert.equal(run.input.ctx.ratings.acInputW, 1050);
  assert.equal(run.input.ctx.control.acFan, 'auto');
  assert.deepEqual(run.input.ctx.program.days, { spawn: 21, pinning: 4, fruiting: 7, rest: 10 });
  assert.deepEqual(run.input.ctx.prices, { electricity: 0.55, water: 2 });
  assert.equal(jobs.length, 1);
  assert.equal(db.getRun(run.id).status, 'running');
  assert.deepEqual(jobs[0].job.input.crops, [{ crop: 'oyster', blocks: 500 }]);
  assert.equal(jobs[0].job.ctx.volume, 60);
});

test('one at a time: the second waits queued and starts when the first is done', (t) => {
  const { db, id, sims, jobs } = setup(t);
  const a = sims.start(id, body()).run;
  const b = sims.start(id, body({ days: 2 })).run;
  assert.equal(jobs.length, 1);
  assert.equal(db.getRun(b.id).status, 'queued');
  jobs[0].handlers.onDone(result());
  assert.equal(jobs.length, 2);
  assert.equal(db.getRun(a.id).status, 'done');
  assert.equal(db.getRun(b.id).status, 'running');
  assert.equal(jobs[1].job.input.days, 2);
});

test('progress is stored in steps of 1 %; done stores the summary and the result', (t) => {
  const { db, id, sims, jobs } = setup(t);
  const { run } = sims.start(id, body());
  const h = jobs[0].handlers;
  h.onProgress(0.004);
  assert.equal(db.getRun(run.id).progress, 0);
  h.onProgress(0.01);
  assert.equal(db.getRun(run.id).progress, 0.01);
  h.onProgress(0.014);
  assert.equal(db.getRun(run.id).progress, 0.01);
  h.onProgress(0.5);
  assert.equal(db.getRun(run.id).progress, 0.5);
  h.onDone(result(4.5));
  const done = db.getRun(run.id);
  assert.equal(done.status, 'done');
  assert.equal(done.progress, 1);
  assert.equal(done.summary.energy.kWh, 4.5);
  assert.deepEqual(done.result, result(4.5));
  assert.equal(done.finishedAt, 5000);
  assert.equal(db.listRuns(id)[0].summary.energy.kWh, 4.5);
});

test('an error fails the run with its text and the next one starts; a spawn that throws also fails', (t) => {
  const { db, id, sims, jobs } = setup(t);
  const a = sims.start(id, body()).run;
  const b = sims.start(id, body()).run;
  jobs[0].handlers.onError('boom');
  assert.equal(db.getRun(a.id).status, 'failed');
  assert.equal(db.getRun(a.id).error, 'boom');
  assert.equal(db.getRun(b.id).status, 'running');

  const db2 = openDb(':memory:');
  t.after(() => db2.close());
  const room = db2.createRoom({ name: 'R', length: 6, width: 4, height: 2.5 });
  const sims2 = createSimulations({ db: db2, spawn: () => { throw new Error('no thread'); } });
  const run = sims2.start(room.id, body()).run;
  assert.equal(db2.getRun(run.id).status, 'failed');
  assert.equal(db2.getRun(run.id).error, 'no thread');
});

test('cancel stops the running run and deletes it; the next starts. A queued one is dropped; unknown is false', (t) => {
  const { db, id, sims, jobs } = setup(t);
  const a = sims.start(id, body()).run;
  const b = sims.start(id, body()).run;
  const c = sims.start(id, body()).run;
  assert.equal(sims.cancel(c.id), true);
  assert.equal(db.getRun(c.id), null);
  assert.equal(sims.cancel(a.id), true);
  assert.equal(jobs[0].stopped, true);
  assert.equal(db.getRun(a.id), null);
  assert.equal(jobs.length, 2);
  assert.equal(db.getRun(b.id).status, 'running');
  jobs[0].handlers.onDone(result()); // a late message of the stopped job changes nothing
  assert.equal(db.getRun(b.id).status, 'running');
  jobs[1].handlers.onDone(result());
  assert.equal(jobs.length, 2); // c was dropped, not started
  assert.equal(sims.cancel(999), false);
  assert.equal(sims.cancel(b.id), true); // a finished run is only deleted
});

test('a new app marks runs left queued or running as failed', (t) => {
  const { db, id, sims } = setup(t);
  const a = sims.start(id, body()).run;
  const b = sims.start(id, body()).run;
  const doneRun = db.createRun(id, {}, 1);
  db.finishRun(doneRun.id, { status: 'done', summary: {}, result: {} }, 2);
  const again = createSimulations({ db, spawn: manual().spawn, now: () => 9000 });
  t.after(() => again.close());
  for (const run of [a, b]) {
    const r = db.getRun(run.id);
    assert.equal(r.status, 'failed');
    assert.equal(r.error, RESTART_TEXT);
    assert.equal(r.finishedAt, 9000);
  }
  assert.equal(db.getRun(doneRun.id).status, 'done');
});

test('the real worker thread runs a short simulation and reports progress and the result', async (t) => {
  const progress = [];
  const out = await new Promise((resolve) => {
    const db = openDb(':memory:');
    const room = db.createRoom({ name: 'R', length: 6, width: 4, height: 2.5 });
    t.after(() => db.close());
    const sims = createSimulations({ db, spawn: (job, h) => spawnWorker(job, { ...h, onProgress: (s) => progress.push(s), onDone: (r) => resolve({ r, db }) }) });
    const { run } = sims.start(room.id, body());
    t.after(() => sims.close());
    assert.ok(run.id);
  });
  assert.ok(progress.length >= 99);
  assert.equal(progress.at(-1), 1);
  assert.equal(out.r.series.length, 288);
  assert.ok(out.r.summary.inBand.t > 80);
});

test('a worker that fails to run its job reports the error', async () => {
  const message = await new Promise((resolve) => {
    spawnWorker({ input: {}, ctx: {} }, { onProgress() {}, onDone() {}, onError: resolve });
  });
  assert.equal(typeof message, 'string');
});

test('every whole percent of a worker is stored, even where floating point makes the step 0.0099', (t) => {
  const { db, id, sims, jobs } = setup(t);
  const { run } = sims.start(id, body());
  for (let k = 1; k <= 100; k++) {
    jobs[0].handlers.onProgress(k / 100);
    assert.equal(db.getRun(run.id).progress, k / 100, `at ${k} %`);
  }
});

test('deleting a room stops its running worker, drops its queued runs and starts the next room at once', (t) => {
  const { db, id, sims, jobs } = setup(t);
  const other = db.createRoom({ name: 'Room 2', length: 6, width: 4, height: 2.5 }).id;
  sims.start(id, body());
  sims.start(id, body());
  const b = sims.start(other, body()).run;
  assert.equal(jobs.length, 1);
  db.deleteRoom(id);
  sims.forgetRoom(id);
  assert.equal(jobs[0].stopped, true);
  assert.equal(jobs.length, 2);
  assert.equal(db.getRun(b.id).status, 'running');
  jobs[1].handlers.onDone(result());
  assert.equal(jobs.length, 2); // the dropped queued run of the deleted room never started
});

test('a run whose row is gone is skipped, and a worker whose row vanished is stopped on its next progress', (t) => {
  const { db, id, sims, jobs } = setup(t);
  const a = sims.start(id, body()).run;
  const b = sims.start(id, body()).run;
  const c = sims.start(id, body()).run;
  db.deleteRun(b.id); // gone from under the queue
  db.deleteRun(a.id); // gone from under the worker
  jobs[0].handlers.onProgress(0.5);
  assert.equal(jobs[0].stopped, true);
  assert.equal(jobs.length, 2); // b was skipped, c runs
  assert.equal(db.getRun(c.id).status, 'running');
});

test('a room keeps at most 5 queued or running runs; finished ones do not count', (t) => {
  const { db, id, sims, jobs } = setup(t);
  for (let i = 0; i < 5; i++) assert.ok(sims.start(id, body()).run);
  const sixth = sims.start(id, body());
  assert.deepEqual(sixth, { error: 'This room already has 5 simulations waiting or running', conflict: true });
  assert.equal(db.listRuns(id).length, 5);
  jobs[0].handlers.onDone(result());
  assert.ok(sims.start(id, body()).run);
});

test('farmType must be a string', () => {
  assert.equal(validateSimulation(body({ farmType: ['ready'] })).field, 'farmType');
  assert.equal(validateSimulation(body({ farmType: 'toString' })).field, 'farmType');
});

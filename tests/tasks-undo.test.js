// Undo (spec 2026-11-04-task-grid-design.md 3): a daily row done or skipped at most 60 s ago opens again and the harvests its
// Done made go; later, an open row, an upkeep or long-term row and no row are refused.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createCropApi } from '../server/crop-api.js';
import { createTasks, TaskError } from '../server/tasks.js';

const NOW = Date.UTC(2026, 10, 4, 0, 12); // 4 Nov 2026 08:12 on the farm's clock
const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1 };

function setup(t, start = NOW) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = start;
  const tasks = createTasks({ db, now: () => clock, log: (e) => { throw e; } });
  const id = db.createRoom(ROOM, clock).id;
  createCropApi({ db, now: () => clock }).put(id, { crops: [{ crop: 'oyster', blocks: 100 }] }); // opens a run
  db.setProgram(id, { ...db.getProgram(id), stage: 'fruiting', stageSince: clock });
  const changes = [];
  const harvested = [];
  tasks.onChange((roomId) => changes.push(roomId));
  tasks.onHarvest((roomId) => harvested.push(roomId));
  return {
    db, tasks, id, changes, harvested,
    later: (ms) => { clock += ms; },
    row: (key) => tasks.roomView(id).today.find((r) => r.ruleKey === key),
    harvestsOf: (taskId) => db.harvestsBetween(-8.64e15, 8.64e15).filter((h) => h.taskId === taskId),
  };
}

function refused(fn, status, message) {
  assert.throws(fn, (err) => {
    assert.ok(err instanceof TaskError);
    assert.equal(err.status, status);
    assert.equal(err.message, message);
    return true;
  });
}

const cleared = (r) => [r.status, r.closedAt, r.worker, r.amount, r.reason];

test('a daily row done 30 s ago opens again with its close cleared, and the room is told', (t) => {
  const s = setup(t);
  const row = s.row('footbath');
  s.tasks.done(row.id, { worker: 'Ali' });
  s.later(30_000);
  s.changes.length = 0;
  assert.deepEqual(cleared(s.tasks.undo(row.id)), ['open', null, null, null, null]);
  assert.deepEqual(cleared(s.row('footbath')), ['open', null, null, null, null]);
  assert.deepEqual(s.changes, [s.id]);
  assert.deepEqual(s.harvested, [], 'no harvests went, no harvest event');
  assert.equal(s.tasks.done(row.id, { worker: 'Sara' }).worker, 'Sara', 'it can be done again');
});

test('exactly 60 s is still in time; 61 s is too late, with the farm time it was done', (t) => {
  const s = setup(t);
  const [a, b] = [s.row('footbath'), s.row('floorClean')];
  s.tasks.done(a.id, { worker: 'Ali' });
  s.tasks.skip(b.id, { worker: 'Ali', reason: 'No water' });
  s.later(60_000);
  assert.equal(s.tasks.undo(a.id).status, 'open');
  s.later(1);
  s.changes.length = 0;
  refused(() => s.tasks.undo(b.id), 409, 'Too late to undo: it was skipped at 08:12');
  assert.equal(s.row('floorClean').status, 'skipped');
  assert.deepEqual(s.changes, []);
  s.tasks.done(a.id, { worker: 'Ali' });
  s.later(61_000);
  refused(() => s.tasks.undo(a.id), 409, 'Too late to undo: it was done at 08:13');
});

test('a row of a day that has ended is refused, though within the minute: its harvests stay', (t) => {
  const s = setup(t, Date.UTC(2026, 10, 4, 15, 59, 50)); // 4 Nov 23:59:50 on the farm's clock
  const row = s.row('harvestPm');
  s.tasks.done(row.id, { worker: 'Ali', amount: 2.4 });
  s.later(30_000); // 5 Nov 00:00:20
  s.changes.length = 0;
  s.harvested.length = 0;
  refused(() => s.tasks.undo(row.id), 409, 'Too late to undo: its day has ended');
  assert.equal(s.db.getTask(row.id).status, 'done');
  assert.equal(s.harvestsOf(row.id).length, 1);
  assert.deepEqual([s.changes, s.harvested], [[], []]);
});

test('a skipped row undoes, its reason cleared', (t) => {
  const s = setup(t);
  const row = s.row('floorClean');
  s.tasks.skip(row.id, { worker: 'Ali', reason: 'No water' });
  assert.deepEqual(cleared(s.tasks.undo(row.id)), ['open', null, null, null, null]);
});

test('a harvest check Done with kg: undo deletes its harvests, shows harvestCrops again and tells the harvest listeners', (t) => {
  const s = setup(t);
  const row = s.row('harvestAm');
  s.tasks.done(row.id, { worker: 'Ali', amount: 2.4 });
  assert.equal(s.harvestsOf(row.id).length, 1);
  const other = s.row('harvestPm');
  s.tasks.done(other.id, { worker: 'Ali', amount: 1 });
  s.harvested.length = 0;
  s.later(10_000);
  const back = s.tasks.undo(row.id);
  assert.deepEqual(cleared(back), ['open', null, null, null, null]);
  assert.equal(back.harvestCrops.length, 1);
  assert.deepEqual(s.harvestsOf(row.id), []);
  assert.equal(s.harvestsOf(other.id).length, 1, 'another check keeps its harvest');
  assert.deepEqual(s.harvested, [s.id]);
});

test('upkeep and long-term rows are refused; an open row, a cancelled row and no row too', (t) => {
  const s = setup(t);
  const upkeep = s.tasks.roomView(s.id).upkeep[0];
  s.tasks.done(upkeep.id, { worker: 'Ali' });
  refused(() => s.tasks.undo(upkeep.id), 409, 'Only a daily task can be undone');
  const long = s.tasks.addLongterm(s.id, { text: 'Fix the door seal' });
  s.tasks.done(long.id, { worker: 'Ali' });
  refused(() => s.tasks.undo(long.id), 409, 'Only a daily task can be undone');
  refused(() => s.tasks.undo(s.row('footbath').id), 409, 'It is not done or skipped (it is open)');
  refused(() => s.tasks.undo(999), 404, 'Task not found');
  const open = s.tasks.addLongterm(s.id, { text: 'Another' });
  s.tasks.cancel(open.id, { reason: 'No need' });
  refused(() => s.tasks.undo(open.id), 409, 'Only a daily task can be undone');
});

test('a race lost after the in-window check (another undo, or the minute ran out, between the read and the write): 409, nothing told', (t) => {
  const s = setup(t);
  const row = s.row('footbath');
  s.tasks.done(row.id, { worker: 'Ali' });
  s.later(30_000);
  const undoTask = s.db.undoTask;
  s.db.undoTask = (id, since) => { undoTask(id, since); return undoTask(id, since); }; // someone else's undo lands first
  s.changes.length = 0;
  refused(() => s.tasks.undo(row.id), 409, 'Too late to undo: it was done at 08:12');
  assert.deepEqual(s.changes, [], 'the loser tells no one (the winner did)');
  assert.deepEqual(s.harvested, []);
});

// The controller's cycle makes the rooms' tasks (spec 2026-10-30-tasks-design.md section 4): once per room per farm day, again
// after a stage change, an error logged without stopping the cycle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';
import { createTasks } from '../server/tasks.js';

const at = (iso) => Date.parse(iso);
const DAY = 86_400_000;
const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function setup(t, { tasks = null, failFor = null } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  let clock = at('2026-10-30T08:00:00+08:00');
  const now = () => clock;
  const calls = [];
  const fake = {
    ensureDay(roomId, date) {
      calls.push([roomId, date]);
      if (roomId === failFor) throw new Error('tasks broke');
    },
  };
  const errors = [];
  const machines = createMachines({ db, client, poller, now });
  const controller = createController({ db, machines, now, log: (e) => errors.push(e), tasks: tasks ? tasks({ db, now }) : fake });
  const id = db.createRoom(ROOM, clock).id;
  return {
    db, id, calls, errors,
    set: (iso) => { clock = at(iso); },
    at: () => clock,
    async cycle(dt = 30_000) {
      clock += dt;
      await controller.run(clock);
    },
  };
}

test('a room\'s tasks are made once per farm day', async (t) => {
  const s = setup(t);
  await s.cycle();
  await s.cycle();
  assert.deepEqual(s.calls, [[s.id, '2026-10-30']]);
  s.set('2026-10-30T23:59:00+08:00');
  await s.cycle();
  assert.equal(s.calls.length, 1, 'still 30 Oct on the farm clock');
  s.set('2026-10-31T00:00:00+08:00');
  await s.cycle();
  assert.deepEqual(s.calls.at(-1), [s.id, '2026-10-31']);
  assert.equal(s.calls.length, 2);
});

test('a stage change in the cycle makes the day again', async (t) => {
  const s = setup(t);
  s.db.setProgram(s.id, { ...s.db.getProgram(s.id), crops: [{ crop: 'oyster', blocks: 100 }], stage: 'fruiting', stageSince: s.at() - 7 * DAY + 60_000 });
  await s.cycle();
  assert.equal(s.calls.length, 1);
  await s.cycle(120_000); // fruiting ends: rest starts
  assert.equal(s.db.getProgram(s.id).stage, 'rest');
  assert.deepEqual(s.calls, [[s.id, '2026-10-30'], [s.id, '2026-10-30']]);
});

test('an error is logged once that day and the other rooms go on', async (t) => {
  const s = setup(t, { failFor: 1 });
  const other = s.db.createRoom({ ...ROOM, name: 'Room 2' }).id;
  await s.cycle();
  await s.cycle();
  assert.deepEqual(s.errors.map((e) => e.message), ['tasks broke']);
  assert.deepEqual(s.calls, [[s.id, '2026-10-30'], [other, '2026-10-30']]);
});

test('with the tasks module the cycle makes the rows', async (t) => {
  const s = setup(t, { tasks: createTasks });
  await s.cycle();
  assert.deepEqual(s.db.dailyTasks(s.id, '2026-10-30').map((r) => r.ruleKey), ['footbath', 'floorClean']);
  assert.deepEqual(s.errors, []);
});

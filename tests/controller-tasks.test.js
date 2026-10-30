// The controller's cycle makes the rooms' tasks (spec 2026-10-30-tasks-design.md section 4): once per room per farm day, again
// after a stage change (in the cycle or by the crop PUT) or a machine fitted or taken out, an error logged without stopping the
// room's control.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';
import { createTasks } from '../server/tasks.js';
import { startStage } from '../server/program.js';

const at = (iso) => Date.parse(iso);
const DAY = 86_400_000;
const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

function setup(t, { tasks = null, failFor = null, room = {} } = {}) {
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
  const id = db.createRoom({ ...ROOM, ...room }, clock).id;
  return {
    db, controller, id, calls, errors,
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

test('a stage started between cycles (the crop PUT) makes the day again', async (t) => {
  const s = setup(t);
  s.db.setProgram(s.id, { ...s.db.getProgram(s.id), crops: [{ crop: 'oyster', blocks: 100 }], stage: 'fruiting', stageSince: s.at() });
  await s.cycle();
  await s.cycle();
  assert.equal(s.calls.length, 1);
  s.db.setProgram(s.id, startStage(s.db.getProgram(s.id), 'rest', s.at(), s.db.getControl(s.id)));
  await s.cycle();
  assert.deepEqual(s.calls, [[s.id, '2026-10-30'], [s.id, '2026-10-30']]);
  await s.cycle();
  assert.equal(s.calls.length, 2);
});

test('a machine fitted or taken out between cycles makes the day again', async (t) => {
  const s = setup(t, { room: { relayAddress: 3, dehumidifier: true } });
  await s.cycle();
  s.db.updateRoom(s.id, { ...s.db.getRoom(s.id), dehumidifier: false });
  await s.cycle();
  assert.equal(s.calls.length, 2);
  s.db.updateRoom(s.id, { ...s.db.getRoom(s.id), co2Address: 2 });
  await s.cycle();
  assert.equal(s.calls.length, 3);
  await s.cycle();
  assert.equal(s.calls.length, 3);
});

test('an error is logged once that day; the room is still controlled and the other rooms go on', async (t) => {
  const s = setup(t, { failFor: 1, room: { trhAddress: 1, co2Address: 2, relayAddress: 3 } });
  const other = s.db.createRoom({ ...ROOM, name: 'Room 2' }).id;
  s.controller.update(s.id, { auto: true });
  const read = (co2) => {
    s.db.addReading({ roomId: s.id, kind: 'trh', address: 1, at: s.at(), ok: true, t: 22, rh: 90, error: null });
    s.db.addReading({ roomId: s.id, kind: 'co2', address: 2, at: s.at(), ok: true, co2, error: null });
  };
  s.set('2026-10-30T08:00:30+08:00');
  read(1000); // above the band: the air exchange starts
  await s.controller.run(s.at());
  assert.equal(s.db.getCommands(s.id).relay.intake, true, 'controlled in the cycle where ensureDay threw');
  await s.cycle();
  assert.deepEqual(s.errors.map((e) => e.message), ['tasks broke']);
  assert.deepEqual(s.calls, [[s.id, '2026-10-30'], [other, '2026-10-30']]);
});

test('without the tasks module the cycle runs as before', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const now = () => at('2026-10-30T08:00:00+08:00');
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const machines = createMachines({ db, client: { async writeCoil() {}, async writeRegisters() {} }, poller, now });
  const controller = createController({ db, machines, now, log: (e) => { throw e; } });
  const id = db.createRoom(ROOM, now()).id;
  await controller.run(now());
  assert.deepEqual(db.dailyTasks(id, '2026-10-30'), []);
});

test('with the tasks module the cycle makes the rows', async (t) => {
  const s = setup(t, { tasks: createTasks });
  await s.cycle();
  assert.deepEqual(s.db.dailyTasks(s.id, '2026-10-30').map((r) => r.ruleKey), ['footbath', 'floorClean']);
  assert.deepEqual(s.errors, []);
});

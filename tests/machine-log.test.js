// The machine log (spec 2026-10-19-safety-and-history-design.md 4): machines.command writes a row
// when a command changes a machine, with the source manual or auto; a re-send logs nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const clock = { now: 1_000_000 };
  const machines = createMachines({ db, client, poller, now: () => clock.now });
  const room = db.createRoom({ name: 'R', length: 6, width: 4, height: 2.5, relayAddress: 10, acAddress: 20 });
  return { db, machines, clock, id: room.id };
}

const ac = { power: true, mode: 'cool', setpoint: 24, fan: 'auto' };

test('a manual relay command is logged once; the same command again is not', async (t) => {
  const { db, machines, clock, id } = setup(t);
  await machines.command(id, 'exhaust', { on: true });
  clock.now += 5000;
  await machines.command(id, 'exhaust', { on: true });
  clock.now += 5000;
  await machines.command(id, 'exhaust', { on: false });
  assert.deepEqual(db.machineLog(id, 'exhaust'), [
    { at: 1_000_000, on: true, setpoint: null, mode: null, fan: null, source: 'manual' },
    { at: 1_010_000, on: false, setpoint: null, mode: null, fan: null, source: 'manual' },
  ]);
  assert.deepEqual(db.machineLog(id, 'intake'), []);
});

test('a command through bypassAuto is logged as auto', async (t) => {
  const { db, machines, id } = setup(t);
  db.setControl(id, { ...db.getControl(id), auto: true });
  await machines.command(id, 'intake', { on: true }, { bypassAuto: true });
  assert.equal(db.machineLog(id, 'intake')[0].source, 'auto');
});

test('the aircon logs power, setpoint, mode and fan; any change is a new row, a re-send is not', async (t) => {
  const { db, machines, clock, id } = setup(t);
  await machines.command(id, 'ac', ac);
  await machines.command(id, 'ac', ac);
  clock.now += 1000;
  await machines.command(id, 'ac', { ...ac, setpoint: 23.5 });
  clock.now += 1000;
  await machines.command(id, 'ac', { ...ac, setpoint: 23.5, fan: 'high' });
  const rows = db.machineLog(id, 'ac');
  assert.deepEqual(rows.map((r) => [r.on, r.setpoint, r.mode, r.fan]), [
    [true, 24, 'cool', 'auto'], [true, 23.5, 'cool', 'auto'], [true, 23.5, 'cool', 'high'],
  ]);
});

test('a rejected command logs nothing, and deleting the room deletes its log', async (t) => {
  const { db, machines, id } = setup(t);
  await assert.rejects(machines.command(id, 'exhaust', { on: 'yes' }));
  assert.deepEqual(db.machineLog(id, 'exhaust'), []);
  await machines.command(id, 'exhaust', { on: true });
  db.deleteRoom(id);
  assert.deepEqual(db.machineLog(id, 'exhaust'), []);
});

test('a manual command equal to the last auto row is not logged (spec: a re-send writes no row)', async (t) => {
  const { db, machines, clock, id } = setup(t);
  await machines.command(id, 'exhaust', { on: true }, { bypassAuto: true });
  clock.now += 5000;
  await machines.command(id, 'exhaust', { on: true }); // same state, now by hand
  assert.deepEqual(db.machineLog(id, 'exhaust').map((r) => [r.on, r.source]), [[true, 'auto']]);
});

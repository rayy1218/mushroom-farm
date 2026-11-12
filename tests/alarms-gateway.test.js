// One alarm per gateway outage (server/alarms.js evaluateGateways, spec 2026-11-12-alarms-triage-design.md 4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createAlarms, heldOf } from '../server/alarms.js';
import { createController } from '../server/controller.js';
import { createMachines } from '../server/machines.js';

const MIN = 60_000;
const wiredRoom = { length: 6, width: 2.4, height: 2.4, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const a = db.createRoom({ ...wiredRoom, name: 'Room 1' });
  const b = db.createRoom({ ...wiredRoom, name: 'Room 5', trhAddress: 11, co2Address: 12, relayAddress: 13, acAddress: 14 });
  const c = db.createRoom({ ...wiredRoom, name: 'Container 1', gateway: '127.0.0.1:1512' });
  let clock = 1_000_000;
  const alarms = createAlarms({ db, now: () => clock });
  const health = (down) => [
    { gateway: null, address: '127.0.0.1:1502', roomIds: [a.id, b.id], polls: 9, failed: down.farm ? 9 : 0, down: Boolean(down.farm) },
    { gateway: '127.0.0.1:1512', address: '127.0.0.1:1512', roomIds: [c.id], polls: 5, failed: down.c ? 5 : 1, down: Boolean(down.c) },
  ];
  return {
    db, alarms, a, b, c,
    tick(ms, down) { clock += ms; return alarms.evaluateGateways(health(down)); },
    all: () => db.currentAlarms(null, clock).filter((x) => x.clearedAt === null).map((x) => [x.roomId, x.key, x.level]),
  };
}

test('held: the wired sensors and machines of a room by name', () => {
  assert.deepEqual(heldOf({ ...wiredRoom, dehumidifier: true, lights: false, meterAddress: 5, dpAddress: 6 }), {
    machines: ['Intake fan', 'Exhaust fan', 'Circulation fan', 'Humidifier', 'Dehumidifier', 'Aircon'],
    sensors: ['T/RH probe', 'CO₂ sensor', 'Filter pressure sensor', 'Energy meter'],
  });
  assert.deepEqual(heldOf({ trhAddress: null, co2Address: null, relayAddress: null, acAddress: null }), { machines: [], sensors: [] });
});

test('a gateway down for 1 min: one Serious alarm on its lowest room, naming every room behind it; the rooms are held at once', (t) => {
  const s = setup(t);
  const held = s.tick(0, { farm: true });
  assert.deepEqual([...held].sort(), [s.a.id, s.b.id], 'held from the first failed cycle');
  s.tick(59_000, { farm: true });
  assert.deepEqual(s.all(), []);
  s.tick(1000, { farm: true });
  assert.deepEqual(s.all(), [[s.a.id, 'gateway', 'serious']]);
  assert.equal(s.db.activeAlarms(s.a.id)[0].text,
    "The farm's gateway not answering: no readings or commands for Room 1 and Room 5 (10 machines, 4 sensors). Check its power and network cable");
  assert.equal(s.db.activeAlarms(s.a.id)[0].gatewayAddress, '127.0.0.1:1502', 'the address it was raised for');
  // the farm's answers again, Container 1's goes silent: the farm's alarm waits for mostly answers; only a room behind a gateway
  // down in this cycle is held (final review 2026-11-12)
  assert.deepEqual([...s.tick(1000, { c: true })], [s.c.id]);
  assert.deepEqual(s.all(), [[s.a.id, 'gateway', 'serious']]);
  s.tick(MIN - 1000, { c: true });
  assert.deepEqual(s.all().sort(), [[s.a.id, 'gateway', 'serious'], [s.c.id, 'gateway', 'serious']].sort(),
    "the farm's: not yet answering in three quarters of its last 10 min; Container 1's: down in most cycles of its last minute");
  assert.equal(s.db.activeAlarms(s.c.id)[0].text, "Container 1's gateway not answering: no readings or commands (5 machines, 2 sensors). Check its power and network cable");
  // every 5 s, both answering: each alarm clears once under a quarter of the cycles of its last 10 min were silent
  for (let i = 0; i < 10 * 12; i++) s.tick(5000, {});
  assert.deepEqual(s.all(), []);
  assert.deepEqual([...s.tick(5000, {})], []);
});

test('no health (an older caller) changes nothing; a room no longer behind a down gateway loses its gateway alarm', (t) => {
  const s = setup(t);
  s.tick(0, { c: true });
  s.tick(MIN, { c: true });
  assert.deepEqual([...s.alarms.evaluateGateways(null)], []);
  assert.deepEqual(s.all(), [[s.c.id, 'gateway', 'serious']]);
  s.alarms.evaluateGateways([{ gateway: null, roomIds: [s.a.id, s.b.id], polls: 2, failed: 0, down: false }]);
  assert.deepEqual(s.all(), [], 'Container 1 is no longer behind a gateway in the health');
});

test('the controller: an outage raises one alarm and one Telegram-worthy change, not one per machine and sensor', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let clock = 1_000_000;
  const failed = { at: 0, ok: false, error: 'no connection' };
  const poller = { machineState: () => ({ relay: { address: 3, polls: [{ ...failed, at: clock }] }, ac: { address: 4, polls: [{ ...failed, at: clock }] } }) };
  const machines = createMachines({ db, client: { async writeCoil() {}, async writeRegisters() {} }, poller, now: () => clock });
  const controller = createController({ db, machines, now: () => clock, log: (e) => { throw e; } });
  const room = db.createRoom({ ...wiredRoom, name: 'Container 1', gateway: '127.0.0.1:1512' });
  const raised = [];
  db.onAlarmChange((e) => { if (e.change === 'raised') raised.push(e.alarm.key); });
  for (let i = 0; i < 40; i++) { // 40 cycles of 5 s, every read failing
    clock += 5000;
    db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: clock, ok: false, error: 'no connection' });
    db.addReading({ roomId: room.id, kind: 'co2', address: 2, at: clock, ok: false, error: 'no connection' });
    await controller.run(clock, [{ gateway: '127.0.0.1:1512', roomIds: [room.id], polls: 4, failed: 4, down: true }]);
  }
  assert.deepEqual(raised, ['gateway']);
});

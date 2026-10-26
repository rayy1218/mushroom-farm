// End to end: farm commands and machine polls through the real Modbus client against the device app.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDevice } from '../device/server.js';
import { openDb } from '../server/db.js';
import { createModbusClient } from '../server/modbus.js';
import { createPoller } from '../server/poller.js';
import { createMachines } from '../server/machines.js';

async function setup(t) {
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0 });
  device.sensors.add({ address: 10, kind: 'relay' });
  device.sensors.add({ address: 20, kind: 'ac' });

  const db = openDb(':memory:');
  const room = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, relayAddress: 10, acAddress: 20 });
  const client = createModbusClient({ host: '127.0.0.1', port: device.modbusPort, timeoutMs: 500 });
  let clock = Date.now();
  const poller = createPoller({ db, client, intervalMs: 60_000, now: () => clock, log: () => {} });
  const machines = createMachines({ db, client, poller, now: () => clock });

  t.after(async () => {
    await poller.stop();
    client.close();
    await device.close();
    db.close();
  });

  const view = () => machines.get(room.id);
  const relay = (key) => view().relay.machines.find((m) => m.key === key);
  // Leave the switching window (the polls then begin after the write), then two poll cycles, so the
  // "both of the last 2 polls" rules can apply.
  const settle = async () => {
    clock += 11_000;
    await poller.cycle();
    await poller.cycle();
  };
  return { device, room, machines, view, relay, settle };
}

test('switching a relay machine on: the coil, the reading and the running input follow', async (t) => {
  const { device, room, machines, relay, settle } = await setup(t);
  await settle();
  assert.equal(relay('intake').status, 'off');

  const reply = await machines.command(room.id, 'intake', { on: true });
  assert.equal(reply.relay.lastWrite.ok, true);
  assert.equal(device.sensors.get(10).coils[0], true, 'the device got the write');

  await settle();
  assert.deepEqual(
    { ...relay('intake') },
    { key: 'intake', commanded: true, reported: true, running: true, status: 'on' },
  );
  assert.equal(relay('exhaust').status, 'off', 'the other outputs are untouched');
});

test('a stuck relay shows not-following, a dead motor not-running', async (t) => {
  const { device, room, machines, relay, settle } = await setup(t);
  device.sensors.update(10, { stuck: [false, true, false, false, false, false], dead: [false, false, true, false, false, false] });

  await machines.command(room.id, 'exhaust', { on: true });
  await machines.command(room.id, 'circulation', { on: true });
  await settle();

  assert.equal(relay('exhaust').status, 'not-following');
  assert.equal(relay('exhaust').reported, false);
  assert.equal(relay('circulation').status, 'not-running');
  assert.equal(relay('circulation').running, false);
});

test('aircon: a command arrives, a refusing gateway shows not-following, an error code shows fault', async (t) => {
  const { device, room, machines, view, settle } = await setup(t);
  const cmd = { power: true, mode: 'cool', setpoint: 23.5, fan: 'low' };

  await machines.command(room.id, 'ac', cmd);
  await settle();
  assert.deepEqual(view().ac.reported, cmd);
  assert.equal(view().ac.status, 'on');

  device.sensors.update(20, { refuse: true, roomT: -2.5 });
  await machines.command(room.id, 'ac', { ...cmd, mode: 'dry' });
  await settle();
  assert.equal(view().ac.status, 'not-following');
  assert.equal(view().ac.reported.mode, 'cool');
  assert.equal(view().ac.roomT, -2.5);

  device.sensors.update(20, { error: 17 });
  await settle();
  assert.equal(view().ac.status, 'fault');
  assert.equal(view().ac.errorCode, 17);
});

test('a module that stops answering shows no-answer, and a write to it fails without losing the command', async (t) => {
  const { device, room, machines, view, relay, settle } = await setup(t);
  await settle();
  device.sensors.update(10, { answering: false });

  const reply = await machines.command(room.id, 'humidifier', { on: true });
  assert.equal(reply.relay.lastWrite.ok, false);
  assert.equal(reply.relay.lastWrite.error, 'timeout');
  await settle();
  assert.equal(relay('humidifier').status, 'no-answer');
  assert.equal(relay('humidifier').commanded, true);
  assert.equal(view().ac.status, 'off', 'the aircon gateway is a separate device and still answers');
});

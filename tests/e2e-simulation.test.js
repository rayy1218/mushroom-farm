// End to end: the farm switches machines over Modbus, the device app's simulation moves the sensors,
// and the farm's poller reads the new values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDevice } from '../device/server.js';
import { openDb } from '../server/db.js';
import { createModbusClient } from '../server/modbus.js';
import { createPoller } from '../server/poller.js';
import { createMachines } from '../server/machines.js';

async function setup(t) {
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 0 });
  for (const [address, kind] of [[1, 'trh'], [2, 'co2'], [10, 'relay'], [20, 'ac']]) device.sensors.add({ address, kind });
  const sim = device.sims.add({ name: 'Sim room' });
  // A fixed hot outdoor (no day cycle) and a crowded room, so the effects are large whatever the time of day.
  device.sims.update(sim.id, { trh: 1, co2: 2, relay: 10, ac: 20, enabled: true, blocks: 2000, outdoorHigh: 32, outdoorLow: 32, outdoorDew: 24 });
  device.sims.setSpeed(60);

  const db = openDb(':memory:');
  const room = db.createRoom({
    name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 10, acAddress: 20,
  });
  const client = createModbusClient({ host: '127.0.0.1', port: device.modbusPort, timeoutMs: 500 });
  const poller = createPoller({ db, client, intervalMs: 60_000, log: () => {} });
  const machines = createMachines({ db, client, poller });

  t.after(async () => {
    await poller.stop();
    client.close();
    await device.close();
    db.close();
  });

  // Simulated minutes pass on the device, then the farm polls once.
  const minutes = async (n) => {
    for (let i = 0; i < n; i++) device.sim.tick();
    await poller.cycle();
  };
  const latest = (kind) => db.getSensors(room.id).find((s) => s.kind === kind).lastOk;
  return { room, machines, minutes, latest };
}

test('CO2 builds up in a closed room and falls once the farm runs intake and exhaust', async (t) => {
  const { room, machines, minutes, latest } = await setup(t);
  await minutes(30);
  const closed = latest('co2').co2;
  assert.ok(closed > 1000, `blocks raise CO2 in a closed room (got ${closed})`);

  await machines.command(room.id, 'intake', { on: true });
  await machines.command(room.id, 'exhaust', { on: true });
  await minutes(10);
  const vented = latest('co2').co2;
  assert.ok(vented < closed - 200, `air exchange lowers CO2 (${closed} → ${vented})`);
});

test('the aircon in cool mode brings the room toward its setpoint', async (t) => {
  const { room, machines, minutes, latest } = await setup(t);
  await minutes(5);
  const start = latest('trh').t;

  await machines.command(room.id, 'ac', { power: true, mode: 'cool', setpoint: 22, fan: 'auto' });
  await minutes(60);
  const cooled = latest('trh').t;
  assert.ok(cooled < start - 5, `cooling lowers T (${start} → ${cooled})`);
  assert.ok(cooled > 21.5, `but not below the setpoint band (${cooled})`);
});

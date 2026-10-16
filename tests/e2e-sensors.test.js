// End to end: the farm's real Modbus client and poller against the real device app.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDevice } from '../device/server.js';
import { openDb } from '../server/db.js';
import { createModbusClient } from '../server/modbus.js';
import { createPoller } from '../server/poller.js';

async function setup(t) {
  const device = await startDevice({ modbusPort: 0, httpPort: 0 });
  device.sensors.add({ address: 1, kind: 'trh' });
  device.sensors.update(1, { t: -5.5, rh: 91.2 });
  device.sensors.add({ address: 2, kind: 'co2' });
  device.sensors.update(2, { co2: 1234 });

  const db = openDb(':memory:');
  const room = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2 });
  const client = createModbusClient({ host: '127.0.0.1', port: device.modbusPort, timeoutMs: 500 });
  const poller = createPoller({ db, client, intervalMs: 60_000, log: () => {} });

  let deviceOpen = true;
  t.after(async () => {
    await poller.stop();
    client.close();
    if (deviceOpen) await device.close();
    db.close();
  });
  const closeDevice = async () => {
    deviceOpen = false;
    await device.close();
  };
  const sensors = () => Object.fromEntries(db.getSensors(room.id).map((s) => [s.kind, s]));
  return { device, poller, sensors, closeDevice };
}

test('readings from the device app arrive with the right values', async (t) => {
  const { poller, sensors } = await setup(t);
  await poller.cycle();
  const { trh, co2 } = sensors();
  assert.equal(trh.status, 'online');
  assert.deepEqual([trh.lastOk.t, trh.lastOk.rh], [-5.5, 91.2]);
  assert.equal(co2.status, 'online');
  assert.equal(co2.lastOk.co2, 1234);
});

test('a sensor that stops answering goes timeout, then offline after 3, then back online', async (t) => {
  const { device, poller, sensors } = await setup(t);
  await poller.cycle();
  device.sensors.update(2, { answering: false });

  await poller.cycle();
  assert.equal(sensors().co2.status, 'timeout');
  assert.equal(sensors().co2.failuresInRow, 1);
  assert.equal(sensors().trh.status, 'online', 'the other sensor is unaffected');

  await poller.cycle();
  assert.equal(sensors().co2.status, 'timeout');
  await poller.cycle();
  assert.equal(sensors().co2.status, 'offline');
  assert.equal(sensors().co2.failuresInRow, 3);

  device.sensors.update(2, { answering: true });
  await poller.cycle();
  assert.equal(sensors().co2.status, 'online');
  assert.equal(sensors().co2.readings.filter((r) => !r.ok).length, 3, 'the gap stays in the history');
});

test('when the device app stops, every sensor fails with no connection', async (t) => {
  const { poller, sensors, closeDevice } = await setup(t);
  await poller.cycle();
  await closeDevice();
  await poller.cycle();
  const { trh, co2 } = sensors();
  assert.equal(trh.status, 'timeout');
  assert.equal(co2.status, 'timeout');
  assert.equal(trh.readings.at(-1).ok, false);
});

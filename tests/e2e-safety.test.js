// End to end: safety of the farm's automatic control against the device app's simulated room
// (spec 2026-10-19-safety-and-history-design.md 2.1 and 3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDevice } from '../device/server.js';
import { openDb } from '../server/db.js';
import { createModbusClient } from '../server/modbus.js';
import { createPoller } from '../server/poller.js';
import { createMachines } from '../server/machines.js';
import { createController } from '../server/controller.js';

// A farm with one simulated room whose fans are too small: 120 m³/h for 500 blocks at 60 mL/h only brings CO₂ down to
// about 670 ppm, between the band limits, so the exchange never ends by itself. One farm cycle = 10 simulated seconds.
async function setup(t) {
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 0 });
  for (const [address, kind] of [[1, 'trh'], [2, 'co2'], [10, 'relay'], [20, 'ac']]) device.sensors.add({ address, kind });
  const sim = device.sims.add({ name: 'Sim room' });
  device.sims.update(sim.id, { trh: 1, co2: 2, relay: 10, ac: 20, enabled: true, fanFlow: 120 });
  device.sims.setSpeed(10);

  const db = openDb(':memory:');
  const room = db.createRoom({
    name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 10, acAddress: 20,
  });
  const client = createModbusClient({ host: '127.0.0.1', port: device.modbusPort, timeoutMs: 100 });
  let clock = Date.now();
  const now = () => clock;
  let controller = null;
  const poller = createPoller({ db, client, intervalMs: 60_000, now, log: () => {}, afterCycle: (start) => controller.run(start) });
  const machines = createMachines({ db, client, poller, now });
  controller = createController({ db, machines, now });
  controller.update(room.id, { auto: true, exchangeEveryMin: 0 }); // the CO2 rules only (fresh air: controller-fresh-air.test.js)
  t.after(async () => {
    await poller.stop();
    client.close();
    await device.close();
    db.close();
  });

  const cycle = async () => {
    clock += 10_000;
    device.sim.tick();
    await poller.cycle();
  };
  const until = async (what, done, limit = 3000) => {
    for (let i = 0; i < limit; i++) {
      await cycle();
      if (done()) return;
    }
    assert.fail(`${what} did not happen within ${limit} cycles`);
  };
  return { device, db, room, controller, cycle, until, now };
}

test('CO₂ held between the limits: the exchange stops at the time limit, restarts at the upper limit, and "too small" is raised after 3', async (t) => {
  const { db, room, controller, cycle, until, now } = await setup(t);
  const intake = () => db.getCommands(room.id).relay.intake;
  const co2 = () => db.getSensors(room.id)[1].lastOk?.co2;

  await until('first exchange', intake);
  const began = now();
  assert.ok(co2() >= 750, `started at the upper limit (CO₂ ${co2()})`);

  await until('stop at the time limit', () => !intake());
  const ran = now() - began;
  assert.ok(ran >= 10 * 60_000 && ran <= 10 * 60_000 + 20_000, `ran ${ran / 1000} s, the limit is 600 s`);
  assert.ok(co2() > 600, `CO₂ still above the lower limit (${co2()})`);
  assert.equal(controller.get(room.id).cappedInRow, 1);
  assert.match(controller.get(room.id).reasons.exchange, /^Air exchange (stopped at the 10 min limit|kept off|waits)/);
  assert.equal(db.activeAlarms(room.id).some((a) => a.key === 'exchangeTooSmall'), false);

  await until('restart at the upper limit', intake);
  assert.ok(co2() >= 750);

  await until('too small alarm', () => db.activeAlarms(room.id).some((a) => a.key === 'exchangeTooSmall'));
  assert.equal(controller.get(room.id).cappedInRow, 3);
  const alarm = db.activeAlarms(room.id).find((a) => a.key === 'exchangeTooSmall');
  assert.match(alarm.text, /^Air exchange too small: 3 exchanges in a row stopped at the 10 min limit before CO₂ fell to the stop point \(600 ppm\)$/);
  assert.equal(alarm.level, 'warning');
  // no sensor or process alarms came from this
  assert.deepEqual(db.currentAlarms(room.id).map((a) => a.key).filter((k) => k.startsWith('sensor')), []);
});

test('a CO₂ sensor that does not answer: fault alarm after 3 polls and a timed exchange; it ends when the sensor is back', async (t) => {
  const { device, db, room, controller, cycle, until } = await setup(t);
  await cycle();
  assert.equal(db.getCommands(room.id).relay.intake, false);
  device.sensors.update(2, { answering: false });

  await until('sensor fault', () => db.activeAlarms(room.id).some((a) => a.key === 'sensorCo2'), 10);
  const alarm = db.activeAlarms(room.id).find((a) => a.key === 'sensorCo2');
  assert.deepEqual([alarm.level, alarm.text], ['serious', 'CO₂ sensor fault: no reading']);
  assert.equal(controller.get(room.id).checks.co2.fault, true);
  assert.equal(controller.get(room.id).reasons.exchange, 'CO₂ sensor fault: timed air exchange, 10 min of every 30');
  await cycle();
  assert.equal(db.getCommands(room.id).relay.intake, true, 'the timed exchange runs');
  assert.equal(db.getCommands(room.id).relay.exhaust, true);

  device.sensors.update(2, { answering: true });
  await cycle();
  assert.equal(controller.get(room.id).checks.co2.fault, false);
  assert.equal(db.activeAlarms(room.id).some((a) => a.key === 'sensorCo2'), false);
  assert.equal(db.currentAlarms(room.id).find((a) => a.key === 'sensorCo2').clearedAt !== null, true);
});

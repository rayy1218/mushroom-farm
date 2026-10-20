// End to end: the farm's automatic control runs the device app's simulated room through an air exchange.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDevice } from '../device/server.js';
import { openDb } from '../server/db.js';
import { createModbusClient } from '../server/modbus.js';
import { createPoller } from '../server/poller.js';
import { createMachines } from '../server/machines.js';
import { createController } from '../server/controller.js';

test('CO2 at the upper limit starts an air exchange, the lower limit ends it', async (t) => {
  const device = await startDevice({ modbusPort: 0, httpPort: 0, spinUpMs: 0, simTickMs: 0 });
  for (const [address, kind] of [[1, 'trh'], [2, 'co2'], [10, 'relay'], [20, 'ac']]) device.sensors.add({ address, kind });
  const sim = device.sims.add({ name: 'Sim room' });
  // 1200 m³/h: strong enough to bring this room well below 600 ppm.
  device.sims.update(sim.id, { trh: 1, co2: 2, relay: 10, ac: 20, fanFlow: 1200, enabled: true });
  device.sims.setSpeed(10);

  const db = openDb(':memory:');
  const room = db.createRoom({
    name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 10, acAddress: 20,
  });
  const client = createModbusClient({ host: '127.0.0.1', port: device.modbusPort, timeoutMs: 500 });
  // One clock for the farm: the machine protection times (30 s, 60 s, 2 min) run on simulated time, 10 s per cycle.
  let clock = Date.now();
  const now = () => clock;
  let controller = null;
  const poller = createPoller({ db, client, intervalMs: 60_000, now, log: () => {}, afterCycle: (start) => controller.run(start) });
  const machines = createMachines({ db, client, poller, now });
  controller = createController({ db, machines, now });
  controller.update(room.id, { auto: true });

  t.after(async () => {
    await poller.stop();
    client.close();
    await device.close();
    db.close();
  });

  const co2 = () => db.getSensors(room.id).find((s) => s.kind === 'co2').lastOk?.co2;
  const commands = () => db.getCommands(room.id);
  // One farm cycle = 10 simulated seconds on the device, then a poll and a control decision.
  const cycle = async () => {
    clock += 10_000;
    device.sim.tick();
    await poller.cycle();
  };
  const until = async (what, done, limit = 2000) => {
    for (let i = 0; i < limit; i++) {
      await cycle();
      if (done()) return;
    }
    assert.fail(`${what} did not happen within ${limit} cycles (CO2 ${co2()})`);
  };

  await cycle();
  assert.equal(commands().relay.circulation, true, 'circulation is on all the time');
  assert.deepEqual(commands().ac, { ...commands().ac, power: true, mode: 'cool', setpoint: 22, fan: 'auto' });

  await until('air exchange start', () => commands().relay.intake);
  assert.ok(co2() >= 750, `started at the upper limit (CO2 ${co2()})`);
  assert.equal(commands().relay.exhaust, true);
  // A new room does not force the humidifier on during an exchange: it follows its own band.
  assert.equal(controller.get(room.id).humidifierDuringExchange, false);
  assert.equal(commands().relay.humidifier, controller.get(room.id).humidifierBand, 'humidifier follows its band during an air exchange');
  assert.equal(commands().ac.setpoint, 17, 'aircon 5 °C lower during an air exchange');
  assert.equal(controller.get(room.id).exchange, true);

  await until('air exchange end', () => !commands().relay.intake);
  assert.ok(co2() <= 600, `ended at the lower limit (CO2 ${co2()})`);
  assert.equal(commands().relay.exhaust, false);
  assert.equal(commands().ac.setpoint, 22, 'aircon back to the middle of the band');
  assert.match(controller.get(room.id).reasons.exchange, /600/);
});

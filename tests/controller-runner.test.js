// The runner of automatic control: real :memory: database and machines, fake Modbus client.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createMachines, CommandError } from '../server/machines.js';
import { createController } from '../server/controller.js';
import { ModbusError } from '../server/modbus.js';
import { createPoller } from '../server/poller.js';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const WIRED = { ...fields, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

// A runner with a clock the test moves. cycle(co2, rh) adds readings "of this cycle" and runs the controller.
function setup(t, { db = openDb(':memory:'), room = WIRED, onWrite = null, log = (e) => { throw e; } } = {}) {
  t.after(() => db.close());
  const writes = [];
  const client = {
    async writeCoil(...a) { writes.push(['coil', ...a]); await onWrite?.(...a); },
    async writeRegisters(...a) { writes.push(['regs', ...a]); },
  };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  let clock = 1000;
  const now = () => clock;
  const machines = createMachines({ db, client, poller, now });
  const controller = createController({ db, machines, now, log });
  const id = db.createRoom(room).id;
  const api = {
    db, writes, controller, machines, id,
    clock: () => clock,
    async cycle({ co2 = 650, rh = 90, trhOk = true, co2Ok = true, dt = 30_000 } = {}) {
      clock += dt;
      const start = clock;
      const r = db.getRoom(id);
      if (r.trhAddress) db.addReading({ roomId: id, kind: 'trh', address: r.trhAddress, at: start, ok: trhOk, t: trhOk ? 22 : null, rh: trhOk ? rh : null, error: trhOk ? null : 'timeout' });
      if (r.co2Address) db.addReading({ roomId: id, kind: 'co2', address: r.co2Address, at: start, ok: co2Ok, co2: co2Ok ? co2 : null, error: co2Ok ? null : 'timeout' });
      clock += 1;
      await controller.run(start);
    },
  };
  return api;
}

// acDrop 5: these tests were written for a room that lowers the aircon 5 °C during an exchange (a new room: 0).
const setAuto = (c, id, extra = {}) => c.update(id, { auto: true, acDrop: 5, ...extra });

test('nothing is sent while auto is off', async (t) => {
  const s = setup(t);
  await s.cycle({ co2: 900 });
  assert.deepEqual(s.writes, []);
  assert.equal(s.controller.get(s.id).reasons.exchange, '');
});

test('the first cycle sends circulation and the aircon; then nothing again for the same decision', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id);
  await s.cycle();
  assert.deepEqual(s.writes, [
    ['coil', 3, 2, true], // circulation
    ['regs', 4, 0, [1, 0, 220, 0]], // on, cool, 22.0, auto
  ]);
  s.writes.length = 0;
  await s.cycle();
  await s.cycle();
  assert.deepEqual(s.writes, []);
  const view = s.controller.get(s.id);
  assert.equal(view.reasons.circulation, 'Circulation: always on');
  assert.equal(view.reasons.exchange, 'Air exchange kept off: CO₂ 650 between 600 and 750');
});

test('an air exchange starts at the upper limit and ends at the lower; only differences are written', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id, { humidifierDuringExchange: true });
  await s.cycle();
  s.writes.length = 0;
  await s.cycle({ co2: 760, dt: 120_000 }); // the aircon changes at most every 2 min
  assert.deepEqual(s.writes, [
    ['coil', 3, 0, true], ['coil', 3, 1, true], // intake, exhaust
    ['coil', 3, 3, true], // humidifier
    ['regs', 4, 0, [1, 0, 170, 0]], // 17.0
  ]);
  assert.equal(s.controller.get(s.id).exchange, true);
  assert.equal(s.controller.get(s.id).exchangeSince !== null, true);
  s.writes.length = 0;
  await s.cycle({ co2: 700 }); // between: nothing changes
  assert.deepEqual(s.writes, []);
  await s.cycle({ co2: 600, dt: 120_000 });
  assert.deepEqual(s.writes, [
    ['coil', 3, 0, false], ['coil', 3, 1, false], ['coil', 3, 3, false],
    ['regs', 4, 0, [1, 0, 220, 0]],
  ]);
  assert.equal(s.controller.get(s.id).exchange, false);
  assert.equal(s.controller.get(s.id).exchangeSince, null);
});

test('without a relay module or an aircon gateway that part is skipped', async (t) => {
  const noRelay = setup(t, { room: { ...WIRED, relayAddress: null } });
  setAuto(noRelay.controller, noRelay.id);
  await noRelay.cycle({ co2: 800 });
  assert.deepEqual(noRelay.writes.map((w) => w[0]), ['regs']);
  assert.equal(noRelay.controller.get(noRelay.id).exchange, true); // the state is still tracked

  const noAc = setup(t, { room: { ...WIRED, acAddress: null } });
  setAuto(noAc.controller, noAc.id, { humidifierDuringExchange: true });
  await noAc.cycle({ co2: 800 });
  assert.deepEqual(noAc.writes.map((w) => w[0]), ['coil', 'coil', 'coil', 'coil']);
});

test('a sensor that failed this cycle keeps the rule state; an old reading does not count', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id, { humidifierDuringExchange: true });
  await s.cycle({ co2: 800 });
  assert.equal(s.controller.get(s.id).exchange, true);
  s.writes.length = 0;
  await s.cycle({ co2Ok: false });
  assert.equal(s.controller.get(s.id).exchange, true);
  assert.equal(s.controller.get(s.id).reasons.exchange, 'CO₂ reading not usable: air exchange kept on');
  assert.deepEqual(s.writes, []);
  // No new reading at all: the latest one is older than the cycle start.
  await s.controller.run(s.clock() + 1);
  assert.equal(s.controller.get(s.id).reasons.exchange, 'CO₂ reading not usable: air exchange kept on');
  assert.equal(s.controller.get(s.id).reasons.humidifier, 'Humidifier: on during air exchange');
});

test('band states are saved: a new controller continues the hysteresis', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id);
  await s.cycle({ co2: 800, rh: 80 });
  const again = createController({ db: s.db, machines: s.machines, now: () => s.clock(), log: (e) => { throw e; } });
  assert.equal(again.get(s.id).exchange, true);
  assert.equal(again.get(s.id).reasons.exchange, ''); // reasons are only in memory
  const at = s.clock() + 10;
  s.db.addReading({ roomId: s.id, kind: 'co2', address: 2, at, ok: true, co2: 700 });
  await again.run(at); // a CO2 between the limits: the saved state decides
  assert.equal(again.get(s.id).exchange, true, 'between the limits the saved state is kept');
  assert.equal(s.controller.get(s.id).humidifierBand, true);
});

test('turning auto on starts from the commanded intake and humidifier', async (t) => {
  const s = setup(t);
  await s.machines.command(s.id, 'intake', { on: true });
  await s.machines.command(s.id, 'humidifier', { on: true });
  const view = setAuto(s.controller, s.id);
  assert.equal(view.exchange, true);
  assert.equal(s.controller.get(s.id).humidifierBand, true);
  assert.notEqual(view.exchangeSince, null);
  s.writes.length = 0;
  await s.cycle({ co2: 700, rh: 90 }); // between the limits: exchange stays on, exhaust follows
  assert.deepEqual(s.writes, [['coil', 3, 1, true], ['coil', 3, 2, true], ['regs', 4, 0, [1, 0, 170, 0]]]);
});

test('manual commands are refused with 409 while auto is on, and work again after it is off', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id);
  await assert.rejects(s.machines.command(s.id, 'intake', { on: true }),
    (e) => e instanceof CommandError && e.status === 409 && e.message === 'Automatic control is on' && e.field === undefined);
  await assert.rejects(s.machines.command(s.id, 'ac', { power: true, mode: 'cool', setpoint: 22, fan: 'auto' }), { status: 409 });
  assert.deepEqual(s.writes, []);
  s.controller.update(s.id, { auto: false });
  await s.machines.command(s.id, 'intake', { on: true });
  assert.equal(s.writes.length, 1);
});

test('update validates, merges and blames the low field', (t) => {
  const s = setup(t);
  const err = (body) => { try { s.controller.update(s.id, body); } catch (e) { return e; } return null; };
  assert.deepEqual([err({ co2Low: 800 }).status, err({ co2Low: 800 }).field], [400, 'co2Low']);
  assert.equal(err({ rhHigh: 101 }).field, 'rhHigh');
  assert.equal(err({ auto: 'yes' }).field, 'auto');
  assert.equal(err([]).message, 'Body must be a JSON object');
  assert.equal(s.controller.get(s.id).co2Low, 600, 'nothing stored on a failure');
  const ok = s.controller.update(s.id, { co2Low: 500, co2High: 900 });
  assert.deepEqual([ok.co2Low, ok.co2High, ok.tLow, ok.auto], [500, 900, 21, false]);
  assert.equal(s.controller.update(99, {}), null);
});

test('the poller calls afterCycle with the start time at the end of each cycle', async () => {
  const calls = [];
  const db = { listWiredSensors: () => [], listWiredMachines: () => [], listMeters: () => [], listFilterSensors: () => [], outdoorAddress: () => null, addReading() {} };
  let clock = 500;
  const poller = createPoller({ db, client: {}, now: () => clock++, afterCycle: async (start) => { calls.push(start); } });
  await poller.cycle();
  await poller.cycle();
  assert.deepEqual(calls, [500, 501]);
  const failing = createPoller({ db, client: {}, afterCycle: async () => { throw new Error('boom'); }, log: (e) => calls.push(e.message) });
  await failing.cycle();
  assert.equal(calls.at(-1), 'boom');
});

test('a user taking over mid-run is not overwritten: no write after auto goes off', async (t) => {
  let s;
  let first = true;
  s = setup(t, { onWrite: async () => { if (first) { first = false; s.controller.update(s.id, { auto: false }); } } });
  setAuto(s.controller, s.id);
  await s.cycle({ co2: 800 }); // would write circulation, intake, exhaust, humidifier and the aircon
  assert.deepEqual(s.writes, [['coil', 3, 0, true]]); // the first write only
});

test('forget drops the reasons of a deleted room; a new room starts empty', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id);
  await s.cycle();
  assert.notEqual(s.controller.get(s.id).reasons.exchange, '');
  s.db.deleteRoom(s.id);
  s.controller.forget(s.id);
  const other = s.db.createRoom({ ...WIRED, name: 'Room 2', trhAddress: 11, co2Address: 12, relayAddress: 13, acAddress: 14 }).id;
  assert.deepEqual(s.controller.get(other).reasons, { exchange: '', humidifier: '', dehumidifier: '', ac: '', circulation: '', held: { humidifier: '', dehumidifier: '', ac: '' } });
  if (other === s.id) assert.equal(s.controller.get(other).reasons.exchange, '');
});

test('turning auto on restarts the exchange start time', async (t) => {
  const s = setup(t);
  s.db.setControlState(s.id, { exchange: true, humidifier: false }, 111); // an old start time
  s.controller.update(s.id, { auto: false });
  await s.machines.command(s.id, 'intake', { on: true });
  const view = setAuto(s.controller, s.id);
  assert.equal(view.exchange, true);
  assert.notEqual(view.exchangeSince, 111);
  assert.equal(view.exchangeSince, s.clock());
});

test('an error in one room does not stop the next room', async (t) => {
  const errors = [];
  const s = setup(t, { log: (e) => errors.push(e.message) });
  const real = s.machines.command;
  s.machines.command = async (roomId, ...rest) => {
    if (roomId === s.id) throw new Error('bus down');
    return real(roomId, ...rest);
  };
  const second = s.db.createRoom({ ...WIRED, name: 'Room 2', trhAddress: 11, co2Address: 12, relayAddress: 13, acAddress: 14 }).id;
  setAuto(s.controller, s.id);
  s.controller.update(second, { auto: true });
  const start = s.clock() + 5000;
  for (const [room, trh, co2] of [[s.id, 1, 2], [second, 11, 12]]) {
    s.db.addReading({ roomId: room, kind: 'trh', address: trh, at: start, ok: true, t: 22, rh: 90 });
    s.db.addReading({ roomId: room, kind: 'co2', address: co2, at: start, ok: true, co2: 650 });
  }
  await s.controller.run(start);
  assert.equal(errors.length, 1);
  assert.equal(s.writes.some((w) => w[1] === 13), true, 'the second room was written');
});

test('a failed write is not retried by the next cycle (the command is already recorded)', async (t) => {
  let fail = true;
  const s = setup(t, { onWrite: async () => { if (fail) { fail = false; throw new ModbusError('timeout'); } } });
  setAuto(s.controller, s.id);
  await s.cycle();
  assert.equal(fail, false);
  s.writes.length = 0;
  await s.cycle();
  assert.deepEqual(s.writes.filter((w) => w[0] === 'coil'), []);
});

// Fake statuses: status[key] makes machines.get report it for the relay machine or 'ac'.
function fakeStatuses(s) {
  const status = {};
  s.machines.get = () => ({
    relay: { machines: ['intake', 'exhaust', 'circulation', 'humidifier'].map((key) => ({ key, status: status[key] ?? 'on' })) },
    ac: { status: status.ac ?? 'on' },
  });
  return status;
}

test('a machine that is not following is sent again, at most 3 times, with the reason', async (t) => {
  const s = setup(t);
  const status = fakeStatuses(s);
  setAuto(s.controller, s.id);
  await s.cycle();
  s.writes.length = 0;
  status.circulation = 'not-following';
  for (const n of [1, 2, 3]) {
    await s.cycle();
    assert.deepEqual(s.writes, [['coil', 3, 2, true]]);
    assert.equal(s.controller.get(s.id).reasons.circulation, `Circulation: always on; Circulation fan: not following, sent again (${n} of 3)`);
    s.writes.length = 0;
  }
  await s.cycle();
  assert.deepEqual(s.writes, []);
  assert.equal(s.controller.get(s.id).reasons.circulation, 'Circulation: always on; Circulation fan: not following after 3 tries');
});

test('the count resets when the machine follows again', async (t) => {
  const s = setup(t);
  const status = fakeStatuses(s);
  setAuto(s.controller, s.id);
  await s.cycle();
  status.circulation = 'not-following';
  await s.cycle();
  await s.cycle();
  status.circulation = 'on';
  await s.cycle();
  status.circulation = 'not-following';
  await s.cycle();
  assert.equal(s.controller.get(s.id).reasons.circulation.endsWith('(1 of 3)'), true);
});

test('the count resets when the desired value changes; the aircon is re-sent too', async (t) => {
  const s = setup(t);
  const status = fakeStatuses(s);
  setAuto(s.controller, s.id);
  await s.cycle();
  status.ac = 'not-following';
  s.writes.length = 0;
  await s.cycle();
  await s.cycle();
  await s.cycle();
  assert.deepEqual(s.writes.map((w) => w[0]), ['regs', 'regs', 'regs']);
  await s.cycle();
  assert.equal(s.writes.length, 3);
  assert.match(s.controller.get(s.id).reasons.ac, /Aircon: not following after 3 tries/);
  await s.cycle({ co2: 800 }); // the desired setpoint changes: sent, the count starts over
  assert.equal(s.writes.filter((w) => w[0] === 'regs').length, 4);
  await s.cycle({ co2: 800 });
  assert.equal(s.writes.filter((w) => w[0] === 'regs').length, 5);
  assert.match(s.controller.get(s.id).reasons.ac, /sent again \(1 of 3\)/);
});

test('nothing is re-sent while auto is off, and forget drops the counters', async (t) => {
  const s = setup(t);
  const status = fakeStatuses(s);
  setAuto(s.controller, s.id);
  await s.cycle();
  status.circulation = 'not-following';
  await s.cycle();
  s.controller.update(s.id, { auto: false });
  s.writes.length = 0;
  await s.cycle();
  assert.deepEqual(s.writes, []);
  s.controller.update(s.id, { auto: true });
  s.controller.forget(s.id);
  await s.cycle();
  assert.equal(s.controller.get(s.id).reasons.circulation.endsWith('(1 of 3)'), true);
});

test('humidifier during exchange off: changed between cycles, the next cycle sends the humidifier off', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id, { humidifierDuringExchange: true });
  await s.cycle({ co2: 800, rh: 96 });
  assert.equal(s.db.getCommands(s.id).relay.humidifier, true); // forced on during the exchange (turned on above)
  s.controller.update(s.id, { humidifierDuringExchange: false });
  assert.equal(s.db.getCommands(s.id).relay.humidifier, true); // nothing happens until the next cycle
  await s.cycle({ co2: 800, rh: 96, dt: 60_000 }); // the humidifier command changes at most once a minute
  assert.equal(s.db.getCommands(s.id).relay.humidifier, false);
  assert.equal(s.db.getCommands(s.id).relay.intake, true);
  assert.equal(s.controller.get(s.id).reasons.humidifier, 'Humidifier: off (RH 96 ≥ 95; not forced during air exchange)');
  assert.equal(s.controller.get(s.id).humidifierDuringExchange, false);
});

test('aircon fan changed between cycles: the next cycle sends the new fan', async (t) => {
  const s = setup(t);
  setAuto(s.controller, s.id);
  await s.cycle();
  assert.equal(s.db.getCommands(s.id).ac.fan, 'auto');
  s.controller.update(s.id, { acFan: 'low' });
  assert.equal(s.db.getCommands(s.id).ac.fan, 'auto'); // nothing happens until the next cycle
  await s.cycle({ dt: 120_000 }); // the aircon changes at most every 2 min
  assert.equal(s.db.getCommands(s.id).ac.fan, 'low');
  assert.equal(s.controller.get(s.id).acFan, 'low');
  assert.equal(s.controller.get(s.id).reasons.ac, 'Aircon: 22.0 °C (middle of 21–23), fan low');
  const sent = s.writes.length;
  await s.cycle();
  assert.equal(s.writes.length, sent); // the same fan is not sent again
});

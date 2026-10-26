// server/machines.js: commands (spec 4.3) and status (spec 4.4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createMachines, CommandError } from '../server/machines.js';
import { ModbusError } from '../server/modbus.js';

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

// A fake poller: polls[roomId] = { relay: [polls], ac: [polls] }; the address is the room's unless given.
function fakePoller() {
  const state = {};
  return {
    state,
    machineState(roomId) {
      const s = state[roomId] ?? {};
      return {
        relay: { address: s.relayAddress ?? (s.relay ? 10 : null), polls: s.relay ?? [] },
        ac: { address: s.acAddress ?? (s.ac ? 20 : null), polls: s.ac ?? [] },
      };
    },
  };
}

// A fake client: writes are recorded; set fail to make the next writes fail.
function fakeClient() {
  const writes = [];
  const client = {
    writes,
    fail: null,
    async writeCoil(...args) {
      writes.push(['coil', ...args]);
      if (client.fail) throw client.fail;
    },
    async writeRegisters(...args) {
      writes.push(['regs', ...args]);
      if (client.fail) throw client.fail;
    },
  };
  return client;
}

function setup(t, roomExtra = { relayAddress: 10, acAddress: 20 }) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const poller = fakePoller();
  const client = fakeClient();
  const clock = { now: 100_000 };
  const machines = createMachines({ db, client, poller, now: () => clock.now });
  const room = db.createRoom({ ...fields, ...roomExtra });
  return { db, poller, client, clock, machines, id: room.id };
}

const relayPoll = (coils, inputs, at = 1_000_000, ok = true) =>
  (ok ? { at, ok, coils, inputs } : { at, ok, error: 'timeout' });
const acPoll = (extra = {}, at = 1_000_000) =>
  ({ at, ok: true, power: false, mode: 'cool', setpoint: 25, fan: 'auto', roomT: 24.8, error: 0, ...extra });
const failed = (at = 1) => ({ at, ok: false, error: 'timeout' });

const OFF = [false, false, false, false];
const keyStatus = (view, key) => view.relay.machines.find((m) => m.key === key);

// --- the object ---

test('get returns null for an unknown room', (t) => {
  assert.equal(setup(t).machines.get(99), null);
});

test('the exact shape: relay machines in order, ac commanded and reported', (t) => {
  const { machines, poller, id } = setup(t);
  poller.state[id] = {
    relay: [relayPoll([true, false, false, false], [true, false, false, false])],
    ac: [acPoll({ power: false })],
  };
  assert.deepEqual(machines.get(id), {
    relay: {
      address: 10,
      lastWrite: null,
      machines: [
        { key: 'intake', commanded: false, reported: true, running: true, status: 'not-following' },
        { key: 'exhaust', commanded: false, reported: false, running: false, status: 'off' },
        { key: 'circulation', commanded: false, reported: false, running: false, status: 'off' },
        { key: 'humidifier', commanded: false, reported: false, running: false, status: 'off' },
        { key: 'dehumidifier', commanded: false, reported: null, running: null, status: 'not-fitted' },
        { key: 'lights', commanded: false, reported: null, running: null, status: 'not-fitted' },
      ],
    },
    ac: {
      address: 20,
      lastWrite: null,
      commanded: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' },
      reported: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' },
      roomT: 24.8,
      errorCode: 0,
      status: 'off',
    },
  });
});

// --- relay status, every row ---

test('relay status: not-wired without an address (commanded still shown, nothing else)', (t) => {
  const { machines, id, db } = setup(t, {});
  db.setRelayCommand(id, 'intake', true, 1);
  const view = machines.get(id);
  assert.equal(view.relay.address, null);
  assert.deepEqual(view.relay.machines[0], { key: 'intake', commanded: true, reported: null, running: null, status: 'not-wired' });
  assert.deepEqual(view.relay.machines.map((m) => m.status), ['not-wired', 'not-wired', 'not-wired', 'not-wired', 'not-fitted', 'not-fitted']);
  assert.equal(view.ac.status, 'not-wired');
  assert.deepEqual([view.ac.reported, view.ac.roomT, view.ac.errorCode, view.ac.address], [null, null, null, null]);
});

test('relay status: not-wired wins even when the poller still holds polls of an old address', (t) => {
  const { machines, id, poller } = setup(t, {});
  poller.state[id] = { relay: [relayPoll(OFF, OFF)], relayAddress: 10 };
  assert.equal(machines.get(id).relay.machines[0].status, 'not-wired');
});

test('relay status: no-data before the first poll, also for polls of another address', (t) => {
  const { machines, id, poller } = setup(t);
  assert.deepEqual(keyStatus(machines.get(id), 'intake'), { key: 'intake', commanded: false, reported: null, running: null, status: 'no-data' });
  poller.state[id] = { relay: [relayPoll(OFF, OFF)], relayAddress: 99 };
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'no-data');
});

test('relay status: no-answer when the latest poll failed (reported and running unknown)', (t) => {
  const { machines, id, poller } = setup(t);
  poller.state[id] = { relay: [relayPoll([true, true, true, true], [true, true, true, true]), failed(2)] };
  assert.deepEqual(keyStatus(machines.get(id), 'intake'), { key: 'intake', commanded: false, reported: null, running: null, status: 'no-answer' });
});

test('relay status: switching when reported differs and the command is under 10 s old', (t) => {
  const { machines, id, poller, clock, db } = setup(t);
  db.setRelayCommand(id, 'exhaust', true, clock.now - 9_999);
  poller.state[id] = { relay: [relayPoll(OFF, OFF)] };
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'switching');
  // the send time belongs to the module, so every machine that differs is switching
  db.setRelayCommand(id, 'intake', true, clock.now - 9_999);
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'switching');
  assert.equal(keyStatus(machines.get(id), 'circulation').status, 'off');
});

test('relay status: not-following when reported differs and the command is 10 s old or older', (t) => {
  const { machines, id, poller, clock, db } = setup(t);
  db.setRelayCommand(id, 'exhaust', true, clock.now - 10_000);
  poller.state[id] = { relay: [relayPoll(OFF, OFF)] };
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'not-following');
  clock.now += 1;
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'not-following');
});

test('relay status: reported on while commanded off is not-following (never commanded: sent time null)', (t) => {
  const { machines, id, poller } = setup(t);
  poller.state[id] = { relay: [relayPoll([false, false, false, true], OFF)] };
  assert.equal(keyStatus(machines.get(id), 'humidifier').status, 'not-following');
});

test('relay status: the switching window uses the injected clock', (t) => {
  const { machines, id, poller, clock, db } = setup(t);
  db.setRelayCommand(id, 'intake', true, 50_000);
  poller.state[id] = { relay: [relayPoll(OFF, OFF)] };
  clock.now = 59_999;
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'switching');
  clock.now = 60_000;
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'not-following');
});

test('relay status: not-running when reported on and running off in both of the last 2 polls', (t) => {
  const { machines, id, poller, db } = setup(t);
  db.setRelayCommand(id, 'intake', true, 1);
  const on = [true, false, false, false];
  poller.state[id] = { relay: [relayPoll(on, OFF), relayPoll(on, OFF)] };
  assert.deepEqual(keyStatus(machines.get(id), 'intake'), { key: 'intake', commanded: true, reported: true, running: false, status: 'not-running' });
});

test('relay status: one poll without running is not enough; running in either poll is fine', (t) => {
  const { machines, id, poller, db } = setup(t);
  db.setRelayCommand(id, 'intake', true, 1);
  const on = [true, false, false, false];
  poller.state[id] = { relay: [relayPoll(on, OFF)] };
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'on');
  poller.state[id] = { relay: [relayPoll(on, on), relayPoll(on, OFF)] };
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'on');
  poller.state[id] = { relay: [relayPoll(on, OFF), relayPoll(on, on)] };
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'on');
});

test('relay status: an earlier failed poll does not count as not running', (t) => {
  const { machines, id, poller, db } = setup(t);
  db.setRelayCommand(id, 'intake', true, 1);
  const on = [true, false, false, false];
  poller.state[id] = { relay: [failed(1), relayPoll(on, OFF, 2)] };
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'on');
});

test('relay status: running-while-off when reported off and running on in both of the last 2 polls', (t) => {
  const { machines, id, poller } = setup(t);
  const running = [false, true, false, false];
  poller.state[id] = { relay: [relayPoll(OFF, running), relayPoll(OFF, running)] };
  assert.deepEqual(keyStatus(machines.get(id), 'exhaust'), { key: 'exhaust', commanded: false, reported: false, running: true, status: 'running-while-off' });
  poller.state[id] = { relay: [relayPoll(OFF, OFF), relayPoll(OFF, running)] };
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'off');
});

test('relay status: on and off follow the reported state; the order of the checks', (t) => {
  const { machines, id, poller, db, clock } = setup(t);
  db.setRelayCommand(id, 'circulation', true, 1);
  const on = [false, false, true, false];
  poller.state[id] = { relay: [relayPoll(on, on), relayPoll(on, on)] };
  assert.equal(keyStatus(machines.get(id), 'circulation').status, 'on');
  // a differing state beats not-running / running-while-off
  db.setRelayCommand(id, 'circulation', false, clock.now - 20_000);
  assert.equal(keyStatus(machines.get(id), 'circulation').status, 'not-following');
  // no-answer beats everything below it
  poller.state[id].relay.push(failed(3));
  assert.equal(keyStatus(machines.get(id), 'circulation').status, 'no-answer');
});

// --- aircon status, every row ---

test('ac status: no-data, no-answer', (t) => {
  const { machines, id, poller } = setup(t);
  assert.equal(machines.get(id).ac.status, 'no-data');
  poller.state[id] = { ac: [acPoll(), failed(2)] };
  const ac = machines.get(id).ac;
  assert.equal(ac.status, 'no-answer');
  assert.deepEqual([ac.reported, ac.roomT, ac.errorCode], [null, null, null]);
});

test('ac status: fault when the error code is not 0, and it wins over switching', (t) => {
  const { machines, id, poller, db, clock } = setup(t);
  poller.state[id] = { ac: [acPoll({ error: 17 })] };
  assert.deepEqual([machines.get(id).ac.status, machines.get(id).ac.errorCode], ['fault', 17]);
  db.setAcCommand(id, { power: true, mode: 'cool', setpoint: 25, fan: 'auto' }, clock.now - 1000);
  assert.equal(machines.get(id).ac.status, 'fault');
});

test('ac status: switching under 10 s, not-following from 10 s, for any differing field', (t) => {
  const { machines, id, poller, db, clock } = setup(t);
  const cmd = { power: true, mode: 'heat', setpoint: 23.5, fan: 'high' };
  db.setAcCommand(id, cmd, clock.now - 5000);
  const differs = [{ power: false }, { mode: 'cool' }, { setpoint: 23 }, { fan: 'low' }];
  for (const d of differs) {
    poller.state[id] = { ac: [acPoll({ ...cmd, ...d })] };
    assert.equal(machines.get(id).ac.status, 'switching', JSON.stringify(d));
  }
  clock.now += 5000;
  for (const d of differs) {
    poller.state[id] = { ac: [acPoll({ ...cmd, ...d })] };
    assert.equal(machines.get(id).ac.status, 'not-following', JSON.stringify(d));
  }
});

test('ac status: on and off when everything follows; an unknown reported code never follows', (t) => {
  const { machines, id, poller, db, clock } = setup(t);
  db.setAcCommand(id, { power: true, mode: 'dry', setpoint: 18.5, fan: 'low' }, 1);
  poller.state[id] = { ac: [acPoll({ power: true, mode: 'dry', setpoint: 18.5, fan: 'low' })] };
  assert.equal(machines.get(id).ac.status, 'on');
  db.setAcCommand(id, { power: false, mode: 'dry', setpoint: 18.5, fan: 'low' }, 1);
  poller.state[id] = { ac: [acPoll({ power: false, mode: 'dry', setpoint: 18.5, fan: 'low' })] };
  assert.equal(machines.get(id).ac.status, 'off');
  poller.state[id] = { ac: [acPoll({ power: false, mode: null, setpoint: 18.5, fan: 'low' })] };
  assert.equal(machines.get(id).ac.status, 'not-following');
  assert.equal(clock.now > 0, true);
});

test('ac reported setpoint compares at one decimal (23.5 sent, 23.5 read back)', (t) => {
  const { machines, id, poller, db } = setup(t);
  db.setAcCommand(id, { power: true, mode: 'cool', setpoint: 23.1, fan: 'auto' }, 1);
  poller.state[id] = { ac: [acPoll({ power: true, setpoint: 231 / 10 })] };
  assert.equal(machines.get(id).ac.status, 'on');
});

// --- commands ---

test('PUT a relay machine: saves the command, writes fn 5 at once, returns the object', async (t) => {
  const { machines, client, id, db, clock } = setup(t);
  const view = await machines.command(id, 'exhaust', { on: true });
  assert.deepEqual(client.writes, [['coil', 10, 1, true]]);
  assert.deepEqual(db.getCommands(id).relay, { intake: false, exhaust: true, circulation: false, humidifier: false, dehumidifier: false, lights: false, sentAt: clock.now });
  assert.equal(keyStatus(view, 'exhaust').commanded, true);
  assert.deepEqual(view.relay.lastWrite, { at: clock.now, ok: true, error: null });
  assert.equal(view.ac.lastWrite, null);
  await machines.command(id, 'humidifier', { on: true });
  await machines.command(id, 'exhaust', { on: false });
  assert.deepEqual(client.writes.slice(1), [['coil', 10, 3, true], ['coil', 10, 1, false]]);
});

test('PUT every relay key writes its own output number', async (t) => {
  const { machines, client, id } = setup(t);
  for (const key of ['intake', 'exhaust', 'circulation', 'humidifier']) await machines.command(id, key, { on: true });
  assert.deepEqual(client.writes.map((w) => w[2]), [0, 1, 2, 3]);
});

test('PUT ac: saves the command, writes fn 16 with the codes and setpoint x 10', async (t) => {
  const { machines, client, id, db, clock } = setup(t);
  const body = { power: true, mode: 'heat', setpoint: 23.5, fan: 'high' };
  const view = await machines.command(id, 'ac', body);
  assert.deepEqual(client.writes, [['regs', 20, 0, [1, 1, 235, 2]]]);
  assert.deepEqual(db.getCommands(id).ac, { ...body, sentAt: clock.now });
  assert.deepEqual(view.ac.commanded, body);
  assert.deepEqual(view.ac.lastWrite, { at: clock.now, ok: true, error: null });
  assert.equal(view.relay.lastWrite, null);
  await machines.command(id, 'ac', { power: false, mode: 'fan', setpoint: 16, fan: 'auto' });
  await machines.command(id, 'ac', { power: true, mode: 'dry', setpoint: 30, fan: 'low' });
  assert.deepEqual(client.writes.slice(1), [['regs', 20, 0, [0, 3, 160, 0]], ['regs', 20, 0, [1, 2, 300, 1]]]);
});

test('a failed write keeps the command and reports lastWrite for that device only', async (t) => {
  const { machines, client, id, db } = setup(t);
  client.fail = new ModbusError('timeout');
  const view = await machines.command(id, 'intake', { on: true });
  assert.deepEqual(view.relay.lastWrite, { at: 100_000, ok: false, error: 'timeout' });
  assert.equal(view.ac.lastWrite, null);
  assert.equal(db.getCommands(id).relay.intake, true);
  assert.equal(keyStatus(view, 'intake').commanded, true);

  client.fail = new ModbusError('exception', 3);
  const acView = await machines.command(id, 'ac', { power: true, mode: 'cool', setpoint: 22, fan: 'auto' });
  assert.deepEqual(acView.ac.lastWrite, { at: 100_000, ok: false, error: 'exception 3' });
  assert.deepEqual(acView.relay.lastWrite, { at: 100_000, ok: false, error: 'timeout' });
  assert.equal(db.getCommands(id).ac.power, true);

  client.fail = new Error('odd');
  assert.equal((await machines.command(id, 'intake', { on: false })).relay.lastWrite.error, 'bad reply');

  client.fail = null; // sending again works and replaces lastWrite
  assert.deepEqual((await machines.command(id, 'intake', { on: false })).relay.lastWrite, { at: 100_000, ok: true, error: null });
});

test('lastWrite is the latest write, with its own time, and is dropped when the address changes', async (t) => {
  const { machines, id, db, clock } = setup(t);
  await machines.command(id, 'intake', { on: true });
  clock.now += 5000;
  await machines.command(id, 'intake', { on: false });
  assert.equal(machines.get(id).relay.lastWrite.at, 105_000);
  db.updateRoom(id, { ...fields, relayAddress: 11, acAddress: 20 });
  assert.equal(machines.get(id).relay.lastWrite, null);
  assert.equal(machines.get(id).ac.lastWrite, null);
});

test('a failed write is followed by not-following once the window is over', async (t) => {
  const { machines, client, id, poller, clock } = setup(t);
  client.fail = new ModbusError('timeout');
  await machines.command(id, 'intake', { on: true });
  poller.state[id] = { relay: [relayPoll(OFF, OFF)] };
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'switching');
  clock.now += 10_000;
  assert.equal(keyStatus(machines.get(id), 'intake').status, 'not-following');
});

test('command errors: unknown room and key are 404', async (t) => {
  const { machines, client, id } = setup(t);
  const rejects = (promise, status, message, field) => assert.rejects(promise, (err) => {
    assert.ok(err instanceof CommandError);
    assert.deepEqual([err.status, err.message, err.field], [status, message, field]);
    return true;
  });
  await rejects(machines.command(99, 'intake', { on: true }), 404, 'Room not found', undefined);
  await rejects(machines.command(id, 'heater', { on: true }), 404, 'Not found', undefined);
  await rejects(machines.command(id, 'toString', { on: true }), 404, 'Not found', undefined);
  assert.deepEqual(client.writes, []);
});

test('command errors: a bad relay body is 400 with the field and writes nothing', async (t) => {
  const { machines, client, id, db } = setup(t);
  const bad = (body, message, field) => assert.rejects(machines.command(id, 'intake', body), (err) => {
    assert.ok(err instanceof CommandError);
    assert.deepEqual([err.status, err.message, err.field], [400, message, field]);
    return true;
  });
  for (const body of [null, [], 'on', 5]) await bad(body, 'Body must be a JSON object', undefined);
  for (const on of [undefined, null, 'true', 1, 0]) await bad({ on }, 'on must be true or false', 'on');
  assert.deepEqual(client.writes, []);
  assert.equal(db.getCommands(id).relay.sentAt, null);
});

test('command errors: a bad ac body is 400 with the first failing field (power, mode, setpoint, fan)', async (t) => {
  const { machines, client, id, db } = setup(t);
  const good = { power: true, mode: 'cool', setpoint: 23.5, fan: 'auto' };
  const bad = (body, message, field) => assert.rejects(machines.command(id, 'ac', body), (err) => {
    assert.deepEqual([err.status, err.message, err.field], [400, message, field]);
    return true;
  });
  await bad(null, 'Body must be a JSON object', undefined);
  await bad({}, 'power must be true or false', 'power');
  for (const power of [1, 'true', null]) await bad({ ...good, power }, 'power must be true or false', 'power');
  const modeMsg = 'mode must be cool, heat, dry or fan';
  for (const mode of [undefined, 'Cool', 'auto', 0, null]) await bad({ ...good, mode }, modeMsg, 'mode');
  const spMsg = 'setpoint must be a number from 16 to 30 in steps of 0.5';
  for (const setpoint of [undefined, 15.5, 30.5, 23.25, '23', NaN, Infinity, null, 16.1]) {
    await bad({ ...good, setpoint }, spMsg, 'setpoint');
  }
  const fanMsg = 'fan must be auto, low or high';
  for (const fan of [undefined, 'medium', 1, null]) await bad({ ...good, fan }, fanMsg, 'fan');
  await bad({ power: 'x', mode: 'x', setpoint: 'x', fan: 'x' }, 'power must be true or false', 'power');
  await bad({ ...good, mode: 'x', fan: 'x' }, modeMsg, 'mode');
  assert.deepEqual(client.writes, []);
  assert.equal(db.getCommands(id).ac.sentAt, null);
  for (const setpoint of [16, 30, 22.5, 23]) await machines.command(id, 'ac', { ...good, setpoint });
  assert.equal(client.writes.length, 4);
});

test('command errors: no address is 400 (after the body check) and writes nothing', async (t) => {
  const { machines, client, id, db } = setup(t, {});
  await assert.rejects(machines.command(id, 'intake', { on: true }), (err) => {
    assert.deepEqual([err.status, err.message, err.field], [400, 'No relay module address set', undefined]);
    return true;
  });
  await assert.rejects(machines.command(id, 'ac', { power: true, mode: 'cool', setpoint: 22, fan: 'auto' }), (err) => {
    assert.deepEqual([err.status, err.message, err.field], [400, 'No aircon gateway address set', undefined]);
    return true;
  });
  await assert.rejects(machines.command(id, 'intake', { on: 'x' }), (err) => err.field === 'on');
  assert.deepEqual(client.writes, []);
  assert.equal(db.getCommands(id).relay.intake, false, 'nothing was saved');
  assert.equal(db.getCommands(id).relay.sentAt, null);
});

test('the command is saved before the write, and a write queued behind a poll still goes out', async (t) => {
  const { machines, client, id, db } = setup(t);
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  client.writeCoil = async (...args) => {
    assert.equal(db.getCommands(id).relay.intake, true, 'already saved when the write starts');
    client.writes.push(args);
    await gate;
  };
  const pending = machines.command(id, 'intake', { on: true });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(client.writes.length, 1);
  release();
  assert.equal((await pending).relay.lastWrite.ok, true);
});

// --- a poll that began before the write cannot have seen it ---

test('relay status: switching past 10 s while the latest poll began at or before the command was sent', (t) => {
  const { machines, id, poller, clock, db } = setup(t);
  db.setRelayCommand(id, 'exhaust', true, 50_000);
  clock.now = 80_000; // a slow cycle: 30 s later
  poller.state[id] = { relay: [relayPoll(OFF, OFF, 49_000)] };
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'switching');
  poller.state[id] = { relay: [relayPoll(OFF, OFF, 50_000)] };
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'switching', 'began at the send time');
  poller.state[id] = { relay: [relayPoll(OFF, OFF, 50_001)] };
  assert.equal(keyStatus(machines.get(id), 'exhaust').status, 'not-following');
});

test('ac status: switching past 10 s while the latest poll began at or before the command was sent', (t) => {
  const { machines, id, poller, clock, db } = setup(t);
  const cmd = { power: true, mode: 'heat', setpoint: 23.5, fan: 'high' };
  db.setAcCommand(id, cmd, 50_000);
  clock.now = 80_000;
  poller.state[id] = { ac: [acPoll({ power: false }, 50_000)] };
  assert.equal(machines.get(id).ac.status, 'switching');
  poller.state[id] = { ac: [acPoll({ power: false }, 50_001)] };
  assert.equal(machines.get(id).ac.status, 'not-following');
});

test('a write that fails with something other than a ModbusError is logged as a bug', async (t) => {
  const { machines, id, client } = setup(t);
  client.fail = new TypeError('oops');
  const logged = [];
  t.mock.method(console, 'error', (...a) => logged.push(a));
  const view = await machines.command(id, 'intake', { on: true });
  assert.equal(view.relay.lastWrite.error, 'bad reply');
  assert.equal(logged.length, 1);
  assert.equal(logged[0][0], client.fail);
});

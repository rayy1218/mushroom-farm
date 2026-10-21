// The dehumidifier in automatic control (spec 2026-10-21-dehumidifier-design.md 3): the rule, its protection and the runner.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, protect, createController } from '../server/controller.js';
import { createMachines, CommandError } from '../server/machines.js';
import { openDb } from '../server/db.js';

// Band 85-95: the middle is 90.
const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
const NOW = 10_000_000;
const S = 1000;

const go = ({ dehumidifier = false, humidifier = false, rh = 90, fitted = true, faults, during, co2 = 650, exchange = false } = {}) => decide({
  bands, state: { exchange, exchangeSince: exchange ? NOW - 60_000 : null, exchangeEndedAt: null, humidifier, dehumidifier },
  readings: { co2, rh }, faults, now: NOW, dehumidifierFitted: fitted, humidifierDuringExchange: during,
});

test('dehumidifier rule: off at or above the upper limit turns on, on at or below the middle turns off, kept between', () => {
  const cases = [
    // [on before, rh, on after, reason]
    [false, 95, true, 'Dehumidifier: RH 95 ≥ 95'],
    [false, 97, true, 'Dehumidifier: RH 97 ≥ 95'],
    [false, 94.9, false, 'Dehumidifier kept off: RH 94.9 between 90 and 95'],
    [false, 91.5, false, 'Dehumidifier kept off: RH 91.5 between 90 and 95'],
    [false, 90, false, 'Dehumidifier kept off: RH 90 ≤ 90'],
    [false, 86, false, 'Dehumidifier kept off: RH 86 ≤ 90'],
    [true, 90, false, 'Dehumidifier: RH 90 ≤ 90'],
    [true, 86, false, 'Dehumidifier: RH 86 ≤ 90'],
    [true, 90.1, true, 'Dehumidifier kept on: RH 90.1 between 90 and 95'],
    [true, 94, true, 'Dehumidifier kept on: RH 94 between 90 and 95'],
    [true, 96, true, 'Dehumidifier kept on: RH 96 ≥ 95'],
  ];
  for (const [before, rh, after, reason] of cases) {
    const r = go({ dehumidifier: before, rh });
    assert.equal(r.state.dehumidifier, after, `rh ${rh} from ${before}`);
    assert.equal(r.desired.dehumidifier, after);
    assert.equal(r.reasons.dehumidifier, reason);
  }
});

test('dehumidifier rule: not fitted is off with no reason and its state untouched', () => {
  const r = go({ fitted: false, rh: 99 });
  assert.deepEqual([r.desired.dehumidifier, r.state.dehumidifier, r.reasons.dehumidifier], [false, false, '']);
  assert.equal(decide({ bands, state: { exchange: false, humidifier: false }, readings: { co2: 650, rh: 99 }, now: NOW }).desired.dehumidifier, false);
});

test('dehumidifier rule: a faulty RH probe turns it off; no usable reading keeps it', () => {
  const fault = go({ dehumidifier: true, rh: null, faults: { trh: true } });
  assert.deepEqual([fault.desired.dehumidifier, fault.state.dehumidifier], [false, false]);
  assert.equal(fault.reasons.dehumidifier, 'Humidity sensor fault: dehumidifier off');
  for (const on of [true, false]) {
    const kept = go({ dehumidifier: on, rh: null });
    assert.deepEqual([kept.desired.dehumidifier, kept.state.dehumidifier], [on, on]);
    assert.equal(kept.reasons.dehumidifier, `Humidity sensor not answering: dehumidifier kept ${on ? 'on' : 'off'}`);
  }
});

test('dehumidifier rule: off while the humidifier is on, by its band or forced during an air exchange', () => {
  const band = go({ dehumidifier: true, humidifier: true, rh: 92 });
  assert.deepEqual([band.desired.humidifier, band.desired.dehumidifier, band.state.dehumidifier], [true, false, false]);
  assert.equal(band.reasons.dehumidifier, 'Dehumidifier off: the humidifier is on');
  const forced = go({ dehumidifier: false, rh: 97, co2: 800, during: true });
  assert.deepEqual([forced.desired.humidifier, forced.desired.dehumidifier], [true, false]);
  assert.equal(forced.reasons.dehumidifier, 'Dehumidifier off: the humidifier is on');
  // not forced: the exchange alone does not stop it
  assert.equal(go({ rh: 97, co2: 800, during: false }).desired.dehumidifier, true);
});

test('protect: the dehumidifier command changes at most once every 3 min', () => {
  const cmds = (dehumidifier) => ({
    relay: { intake: false, exhaust: false, circulation: true, humidifier: false, dehumidifier, sentAt: null },
    ac: { power: true, mode: 'cool', setpoint: 22, fan: 'auto', sentAt: null },
  });
  const want = (dehumidifier) => ({
    intake: false, exhaust: false, humidifier: false, dehumidifier, circulation: true, ac: { power: true, mode: 'cool', setpoint: 22, fan: 'auto' },
  });
  const on = protect({ desired: want(false), commands: cmds(true), changedAt: { dehumidifier: NOW - 100 * S }, now: NOW });
  assert.equal(on.desired.dehumidifier, true);
  assert.equal(on.held.dehumidifier, 'Dehumidifier waits: minimum on time, 1 min 20 s to go');
  const off = protect({ desired: want(true), commands: cmds(false), changedAt: { dehumidifier: NOW - 10 * S }, now: NOW });
  assert.equal(off.desired.dehumidifier, false);
  assert.equal(off.held.dehumidifier, 'Dehumidifier waits: minimum off time, 2 min 50 s to go');
  const free = protect({ desired: want(false), commands: cmds(true), changedAt: { dehumidifier: NOW - 180 * S }, now: NOW });
  assert.deepEqual([free.desired.dehumidifier, free.held.dehumidifier], [false, '']);
  assert.equal(protect({ desired: want(false), commands: cmds(true), changedAt: {}, now: NOW }).desired.dehumidifier, false, 'never changed');
  assert.equal(protect({ desired: want(true), commands: cmds(true), changedAt: { dehumidifier: NOW - S }, now: NOW }).held.dehumidifier, '');
});

// ---- runner ----

const WIRED = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

function setup(t, room = { ...WIRED, dehumidifier: true }) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const writes = [];
  const client = {
    async writeCoil(...a) { writes.push(['coil', ...a]); },
    async writeRegisters(...a) { writes.push(['regs', ...a]); },
  };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  let clock = 1_000_000;
  const now = () => clock;
  const machines = createMachines({ db, client, poller, now });
  const controller = createController({ db, machines, now, log: (e) => { throw e; } });
  const id = db.createRoom(room).id;
  return {
    db, controller, machines, writes, id,
    async cycle({ rh = 90, dt = 30_000 } = {}) {
      clock += dt;
      const start = clock;
      db.addReading({ roomId: id, kind: 'trh', address: 1, at: start, ok: true, t: 22, rh, error: null });
      db.addReading({ roomId: id, kind: 'co2', address: 2, at: start, ok: true, co2: 650, error: null });
      clock += 1;
      await controller.run(start);
    },
    coil: () => db.getCommands(id).relay.dehumidifier,
  };
}

test('runner: a fitted dehumidifier is commanded, its band state stored and its reason shown', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ rh: 96 });
  assert.equal(s.coil(), true);
  assert.deepEqual(s.writes.filter((w) => w[2] === 4), [['coil', 3, 4, true]]);
  assert.equal(s.db.getControl(s.id).dehumidifier, true);
  const v = s.controller.get(s.id);
  assert.equal(v.dehumidifierBand, true);
  assert.equal(v.reasons.dehumidifier, 'Dehumidifier: RH 96 ≥ 95');
  assert.equal(v.reasons.held.dehumidifier, '');
});

test('runner: a dehumidifier that just changed is held for 3 min and the reason says so', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ rh: 96 }); // on
  await s.cycle({ rh: 88, dt: 100_000 }); // wants off, held
  assert.equal(s.coil(), true);
  assert.equal(s.controller.get(s.id).reasons.held.dehumidifier, 'Dehumidifier waits: minimum on time, 1 min 20 s to go');
  assert.equal(s.controller.get(s.id).dehumidifierBand, false, 'the band state follows the rule, the command waits');
  await s.cycle({ rh: 88, dt: 90_000 });
  assert.equal(s.coil(), false);
  assert.equal(s.controller.get(s.id).reasons.held.dehumidifier, '');
});

test('runner: a room without a dehumidifier never commands it and shows no reason', async (t) => {
  const s = setup(t, WIRED);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ rh: 99 });
  assert.equal(s.coil(), false);
  assert.deepEqual(s.writes.filter((w) => w[2] === 4), []);
  const v = s.controller.get(s.id);
  assert.deepEqual([v.reasons.dehumidifier, v.reasons.held.dehumidifier, v.dehumidifierBand], ['', '', false]);
});

test('turning auto on starts the dehumidifier band from what is commanded now', async (t) => {
  const s = setup(t);
  await s.machines.command(s.id, 'dehumidifier', { on: true });
  s.controller.update(s.id, { auto: true });
  assert.equal(s.controller.get(s.id).dehumidifierBand, true);
  await s.cycle({ rh: 92 }); // between 90 and 95: kept on
  assert.equal(s.coil(), true);
  assert.equal(s.controller.get(s.id).reasons.dehumidifier, 'Dehumidifier kept on: RH 92 between 90 and 95');
});

test('manual command of a dehumidifier the room does not have: 400 with the field', async (t) => {
  const s = setup(t, WIRED);
  await assert.rejects(s.machines.command(s.id, 'dehumidifier', { on: true }), (err) => {
    assert.ok(err instanceof CommandError);
    assert.deepEqual([err.status, err.message, err.field], [400, 'This room has no dehumidifier', 'dehumidifier']);
    return true;
  });
  assert.equal(s.coil(), false);
  assert.deepEqual(s.writes, []);
});

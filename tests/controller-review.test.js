// Review fixes of the safety part: partial validation, restart, commanded exchange, alarms and the timed humidifier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, validateControl, DEFAULTS, createController } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';

const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
const NOW = 10_000_000;
const S = 1000;
const MIN = 60_000;
const WIRED = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

function setup(t, { alarms = undefined, log = (e) => { throw e; } } = {}) {
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
  const make = () => createController({ db, machines, now, log, ...(alarms ? { alarms } : {}) });
  const controller = make();
  const id = db.createRoom(WIRED).id;
  return {
    db, controller, machines, writes, id, make,
    clock: () => clock,
    advance: (ms) => { clock += ms; },
    async cycle({ co2 = 650, rh = 90, t: temp = 22, trhOk = true, co2Ok = true, dt = 30_000, ctl = controller } = {}) {
      clock += dt;
      const start = clock;
      db.addReading({ roomId: id, kind: 'trh', address: 1, at: start, ok: trhOk, t: trhOk ? temp : null, rh: trhOk ? rh : null, error: trhOk ? null : 'timeout' });
      db.addReading({ roomId: id, kind: 'co2', address: 2, at: start, ok: co2Ok, co2: co2Ok ? co2 : null, error: co2Ok ? null : 'timeout' });
      clock += 1;
      await ctl.run(start);
    },
  };
}

const offFor = (ms, extra = {}) => ({
  exchange: false, exchangeSince: null, exchangeEndedAt: ms === null ? null : NOW - ms, cappedInRow: 0, humidifier: false, humidifierSince: null, ...extra,
});

// ---- 1. validation only where the body touches the CO2 band or the safety level ----

test('validateControl: the safety comparison can be skipped', () => {
  const stale = { ...DEFAULTS, co2High: 1500, co2Safety: 1250 };
  assert.equal(validateControl(stale).field, 'co2Safety');
  assert.equal(validateControl(stale, { compareSafety: false }), null);
  assert.equal(validateControl({ ...stale, co2Safety: 10_001 }, { compareSafety: false }).field, 'co2Safety', 'the range is still checked');
});

test('a room with co2High above its safety level can still switch auto, the option and the fan', (t) => {
  const s = setup(t);
  s.db.setControl(s.id, { ...DEFAULTS, co2High: 1500, co2Safety: 1250 });
  assert.equal(s.controller.update(s.id, { auto: true }).auto, true);
  assert.equal(s.controller.update(s.id, { auto: false }).auto, false);
  assert.equal(s.controller.update(s.id, { acFan: 'low' }).acFan, 'low');
  assert.equal(s.controller.update(s.id, { humidifierDuringExchange: false }).humidifierDuringExchange, false);
  assert.throws(() => s.controller.update(s.id, { co2High: 1600 }), { status: 400, field: 'co2Safety' });
  assert.throws(() => s.controller.update(s.id, { co2Safety: 1500 }), { status: 400, field: 'co2Safety' });
  assert.equal(s.controller.update(s.id, { co2Safety: 1600 }).co2Safety, 1600);
});

test('a co2High above the safety level is a 400 on co2Safety', (t) => {
  const s = setup(t);
  s.db.setControl(s.id, { ...DEFAULTS, co2High: 750, co2Safety: 1250 });
  assert.throws(() => s.controller.update(s.id, { co2High: 1300 }), { status: 400, field: 'co2Safety' });
});

// ---- 4. an exchange that is on without a start time ----

test('decide: an exchange that is on with no start time gets one now, so the limits run', () => {
  const state = { exchange: true, exchangeSince: null, exchangeEndedAt: null, cappedInRow: 0, humidifier: false, humidifierSince: null };
  const r = decide({ bands, state, readings: { co2: 700, rh: 90 }, now: NOW });
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeSince, NOW);
  const later = decide({ bands, state: r.state, readings: { co2: 700, rh: 90 }, now: NOW + 10 * MIN });
  assert.equal(later.state.exchange, false);
  assert.equal(later.state.cappedInRow, 1);
  const wait = decide({ bands, state, readings: { co2: 590, rh: 90 }, now: NOW });
  assert.equal(wait.reasons.exchange, 'Air exchange waits: minimum on time, 30 s to go');
  const timed = decide({ bands, state, readings: { co2: null, rh: 90 }, faults: { co2: true, trh: false }, now: NOW });
  assert.equal(timed.state.exchangeSince, NOW);
  assert.equal(decide({ bands, state: offFor(null), readings: { co2: 650, rh: 90 }, now: NOW }).state.exchangeSince, null);
});

// ---- 10. only an RH fault times the humidifier ----

test('runner: a T-only fault leaves the humidifier on its RH band; a dead probe times it', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ rh: 80 });
  assert.equal(s.db.getCommands(s.id).relay.humidifier, true);
  for (let i = 0; i < 3; i++) await s.cycle({ t: 99, rh: 97 });
  assert.equal(s.controller.get(s.id).checks.trh.fault, true);
  assert.equal(s.controller.get(s.id).reasons.humidifier, 'Humidifier: RH 97 %, at or over 95 %');
  assert.equal(s.db.getCommands(s.id).relay.humidifier, false);
  for (let i = 0; i < 3; i++) await s.cycle({ trhOk: false });
  assert.equal(s.controller.get(s.id).reasons.humidifier, 'Humidity sensor fault: timed humidifier, 10 min of every 20');
});

// ---- 5. the falling-CO2 exemption follows the commanded fans ----

test('runner: a CO2 fall is not a jump while the fans are commanded on, even with auto off', async (t) => {
  const s = setup(t);
  await s.cycle({ co2: 2500 });
  await s.machines.command(s.id, 'intake', { on: true });
  await s.cycle({ co2: 1000, dt: 5000 }); // 1500 ppm drop in 5 s
  assert.equal(s.controller.get(s.id).checks.co2.ok, true);
});

test('runner: a CO2 fall with the fans off is still a jump', async (t) => {
  const s = setup(t);
  await s.cycle({ co2: 2500 });
  await s.cycle({ co2: 1000, dt: 5000 });
  assert.equal(s.controller.get(s.id).checks.co2.why, 'sudden jump');
});

// ---- 8. an alarm error does not stop the commands ----

test('runner: an alarm evaluation that throws is logged and the room is still controlled', async (t) => {
  const logged = [];
  const s = setup(t, { alarms: { evaluate() { throw new Error('alarm boom'); }, forget() {} }, log: (e) => logged.push(e.message) });
  s.controller.update(s.id, { auto: true });
  await s.cycle({ co2: 800 });
  assert.deepEqual(logged, ['alarm boom']);
  assert.equal(s.db.getCommands(s.id).relay.intake, true);
});

// ---- 11. restart ----

async function cycleWith(s, ctl, { dt, co2 = 700, rh = 90, trhOk = true }) {
  await s.cycle({ dt, co2, rh, trhOk, ctl });
}

test('restart in the middle of an exchange: the time limit and the off wait use the saved times', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ co2: 800 });
  const since = s.controller.get(s.id).exchangeSince;
  assert.notEqual(since, null);
  const second = s.make();
  assert.equal(second.get(s.id).exchangeSince, since);
  await cycleWith(s, second, { dt: 9 * MIN });
  assert.equal(s.db.getCommands(s.id).relay.intake, true);
  await cycleWith(s, second, { dt: MIN });
  assert.equal(s.db.getCommands(s.id).relay.intake, false, 'stopped at the 10 min limit counted from the saved start');
  assert.notEqual(second.get(s.id).exchangeEndedAt, null);
  const third = s.make();
  await cycleWith(s, third, { dt: 20 * S, co2: 800 });
  assert.equal(s.db.getCommands(s.id).relay.intake, false);
  assert.match(third.get(s.id).reasons.exchange, /^Air exchange waits: minimum off time, \d+ s to go$/);
  await cycleWith(s, third, { dt: 45 * S, co2: 800 });
  assert.equal(s.db.getCommands(s.id).relay.intake, true);
});

test('restart during the timed humidifier: it continues from the saved start', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle();
  for (let i = 0; i < 3; i++) await s.cycle({ trhOk: false });
  const since = s.db.getControl(s.id).humidifierSince;
  assert.notEqual(since, null);
  assert.equal(s.db.getCommands(s.id).relay.humidifier, true);
  const second = s.make(); // fresh sensor checks: the fault needs 3 bad readings again
  await cycleWith(s, second, { dt: 30 * S, trhOk: false });
  await cycleWith(s, second, { dt: 30 * S, trhOk: false });
  await cycleWith(s, second, { dt: 11 * MIN - (s.clock() - since), trhOk: false });
  assert.equal(s.db.getControl(s.id).humidifierSince, since);
  assert.equal(s.db.getCommands(s.id).relay.humidifier, false, 'the off half of the 20 min');
});

// ---- 11. an aircon re-send is not a change ----

test('an aircon re-send to an aircon that is not following does not start the 2 min hold', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true, acDrop: 5 }); // a room that lowers the aircon during an exchange
  await s.cycle(); // first send: 22
  const real = s.machines.get;
  s.machines.get = (id) => {
    const v = real(id);
    return { ...v, ac: { ...v.ac, status: 'not-following' } };
  };
  s.advance(3 * MIN);
  const before = s.writes.length;
  await s.cycle({ dt: 1000 }); // re-sent
  assert.equal(s.writes.length > before, true, 'sent again');
  s.machines.get = real;
  await s.cycle({ co2: 760, dt: 1000 }); // the exchange wants 17: no hold, the re-send was not a change
  assert.equal(s.db.getCommands(s.id).ac.setpoint, 17);
});

// ---- 3. process alarms clear with a faulty or unwired sensor ----

test('runner: a faulty CO2 sensor clears the CO2 process alarms; a T-only fault clears the T alarms only', async (t) => {
  const s = setup(t);
  const keys = () => s.db.activeAlarms(s.id).map((a) => a.key).sort();
  // CO2 alarm: 900 > 750 + 100 for 5 min; T alarm: 24.5 for 5 min; RH low: 70 for 5 min
  for (let i = 0; i < 11; i++) await s.cycle({ co2: 900 + (i % 2), t: 24.5 + (i % 2) * 0.1, rh: 70 + (i % 2) * 0.1 });
  assert.deepEqual(keys(), ['co2High', 'rhLow', 'tHigh']);
  for (let i = 0; i < 3; i++) await s.cycle({ co2Ok: false, t: 24.5, rh: 70 });
  assert.deepEqual(keys(), ['rhLow', 'sensorCo2', 'tHigh'], 'the CO2 process alarm is cleared');
  for (let i = 0; i < 3; i++) await s.cycle({ co2: 650, t: 99, rh: 70.2 });
  assert.deepEqual(keys(), ['rhLow', 'sensorTrh'], 'T out of range: the T alarm is cleared, RH low stays');
});

test('runner: an unwired CO2 sensor clears the CO2 process alarms', async (t) => {
  const s = setup(t);
  for (let i = 0; i < 11; i++) await s.cycle({ co2: 900 + (i % 2) });
  assert.deepEqual(s.db.activeAlarms(s.id).map((a) => a.key), ['co2High']);
  s.db.updateRoom(s.id, { ...WIRED, co2Address: null });
  await s.cycle();
  assert.deepEqual(s.db.activeAlarms(s.id).map((a) => a.key), []);
});

// ---- 7. the planned end of the exchange ----

test('control view: exchangeEndsAt is the planned end, null at the safety level, in a timed exchange its 10 min, and when off', async (t) => {
  const s = setup(t);
  assert.equal(s.controller.get(s.id).exchangeEndsAt, null);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ co2: 800 });
  const v = s.controller.get(s.id);
  assert.equal(v.exchangeEndsAt, v.exchangeSince + 10 * MIN);
  s.controller.update(s.id, { exchangeMaxMin: 20 });
  assert.equal(s.controller.get(s.id).exchangeEndsAt, v.exchangeSince + 20 * MIN);
  await s.cycle({ co2: 1300, dt: 5000 });
  assert.equal(s.controller.get(s.id).exchangeEndsAt, null, 'no limit at the safety level');
  await s.cycle({ co2: 800, dt: 5000 });
  assert.notEqual(s.controller.get(s.id).exchangeEndsAt, null);
  s.controller.update(s.id, { auto: false });
  assert.equal(s.controller.get(s.id).exchangeEndsAt, null);
});

test('control view: a timed exchange ends 10 min after it began', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle();
  for (let i = 0; i < 3; i++) await s.cycle({ co2Ok: false });
  const v = s.controller.get(s.id);
  assert.equal(v.exchange, true);
  assert.equal(v.exchangeEndsAt, v.exchangeSince + 10 * MIN);
});

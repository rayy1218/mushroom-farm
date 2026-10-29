// Safety in the controller (spec 2026-10-19-safety-and-history-design.md 2): the pure decide and protect, the
// validation of the new settings, and the runner with the sensor checks and the alarms.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, protect, validateControl, DEFAULTS, createController } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';

const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
const NOW = 10_000_000;
const S = 1000;
const MIN = 60_000;

const offFor = (ms, extra = {}) => ({
  exchange: false, exchangeSince: null, exchangeEndedAt: ms === null ? null : NOW - ms, cappedInRow: 0, humidifier: false, humidifierSince: null, ...extra,
});
const onFor = (ms, extra = {}) => ({
  exchange: true, exchangeSince: NOW - ms, exchangeEndedAt: null, cappedInRow: 0, humidifier: false, humidifierSince: null, ...extra,
});
const go = (state, co2, extra = {}) => decide({ bands, state, readings: { co2, rh: 90 }, now: NOW, ...extra });

// ---- decide: air exchange ----

test('safety level: starts at once, even right after a stop', () => {
  const r = go(offFor(5 * S), 1300);
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeSince, NOW);
  assert.equal(r.desired.intake, true);
  assert.equal(r.reasons.exchange, 'Air exchange: CO₂ 1,300 ppm, at or over the safety level 1,250 ppm');
  assert.equal(go(offFor(5 * S), 1250).state.exchange, true, 'at the level counts');
  assert.equal(go(offFor(5 * S), 1249).state.exchange, false);
});

test('safety level: a running exchange has no time limit', () => {
  const r = go(onFor(30 * MIN), 1300);
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.cappedInRow, 0);
  assert.equal(r.reasons.exchange, 'Air exchange: CO₂ 1,300 ppm, at or over the safety level 1,250 ppm, no time limit');
});

test('starts at the upper limit only after 60 s off, else waits with the seconds to go', () => {
  const wait = go(offFor(20 * S), 762);
  assert.equal(wait.state.exchange, false);
  assert.equal(wait.desired.intake, false);
  assert.equal(wait.reasons.exchange, 'Air exchange waits: minimum off time, 40 s to go');
  assert.equal(go(offFor(59_500), 762).reasons.exchange, 'Air exchange waits: minimum off time, 1 s to go');
  const start = go(offFor(60 * S), 762);
  assert.equal(start.state.exchange, true);
  assert.equal(start.state.exchangeSince, NOW);
  assert.equal(start.reasons.exchange, 'Air exchange: CO₂ 762 ppm, at or over 750 ppm');
  assert.equal(go(offFor(null), 762).state.exchange, true, 'never ended: no wait');
});

test('stops at the lower limit only after 30 s on; resets the too-small count', () => {
  const wait = go(onFor(10 * S, { cappedInRow: 2 }), 590);
  assert.equal(wait.state.exchange, true);
  assert.equal(wait.reasons.exchange, 'Air exchange waits: minimum on time, 20 s to go');
  const stop = go(onFor(30 * S, { cappedInRow: 2 }), 590);
  assert.deepEqual([stop.state.exchange, stop.state.exchangeSince, stop.state.exchangeEndedAt, stop.state.cappedInRow], [false, null, NOW, 0]);
  assert.equal(stop.reasons.exchange, 'Air exchange: CO₂ 590 ppm, at or under 600 ppm');
});

test('time limit: stops, counts it, and stays off between the limits', () => {
  const keep = go(onFor(9 * MIN + 59 * S, { cappedInRow: 1 }), 667);
  assert.equal(keep.state.exchange, true);
  assert.equal(keep.reasons.exchange, 'Air exchange kept on: CO₂ 667 ppm between 600 and 750 ppm');
  const stop = go(onFor(10 * MIN, { cappedInRow: 1 }), 667);
  assert.deepEqual([stop.state.exchange, stop.state.exchangeEndedAt, stop.state.cappedInRow], [false, NOW, 2]);
  assert.equal(stop.reasons.exchange, 'Air exchange stopped at the 10 min limit: CO₂ 667 ppm above 600 ppm');
  assert.equal(stop.desired.intake, false);
  // a later cycle, between the limits: it stays off (the band rule)
  const later = go(offFor(2 * MIN, { cappedInRow: 2 }), 667);
  assert.equal(later.state.exchange, false);
  assert.equal(later.state.cappedInRow, 2);
  // the limit is the room's setting
  const short = decide({ bands: { ...bands, exchangeMaxMin: 2 }, state: onFor(2 * MIN), readings: { co2: 667, rh: 90 }, now: NOW });
  assert.equal(short.state.exchange, false);
  assert.match(short.reasons.exchange, /2 min limit/);
});

test('the lower limit wins over the time limit and resets the count', () => {
  const r = go(onFor(12 * MIN, { cappedInRow: 2 }), 590);
  assert.deepEqual([r.state.exchange, r.state.cappedInRow], [false, 0]);
});

test('CO₂ sensor fault: timed exchange, 10 min on then 20 min off, repeating', () => {
  const faults = { co2: true, trh: false };
  const reason = 'CO₂ sensor fault: timed air exchange, 10 min of every 30';
  const start = go(offFor(20 * MIN), null, { faults });
  assert.deepEqual([start.state.exchange, start.state.exchangeSince], [true, NOW]);
  assert.equal(start.reasons.exchange, reason);
  assert.equal(go(offFor(19 * MIN), null, { faults }).state.exchange, false);
  assert.equal(go(onFor(9 * MIN), null, { faults }).state.exchange, true);
  const stop = go(onFor(10 * MIN), null, { faults });
  assert.deepEqual([stop.state.exchange, stop.state.exchangeEndedAt], [false, NOW]);
  assert.equal(stop.reasons.exchange, reason);
  assert.equal(go(offFor(null), null, { faults }).state.exchange, true, 'never ended: starts at once');
  // CO₂ values are ignored while faulty
  assert.equal(go(offFor(19 * MIN), 2000, { faults }).state.exchange, false);
});

test('no usable CO₂ reading (not faulty): the state is kept', () => {
  assert.equal(go(onFor(20 * MIN), null).state.exchange, true, 'not even the time limit applies');
  assert.equal(go(offFor(5 * MIN), null).reasons.exchange, 'CO₂ reading not usable: air exchange kept off');
});

// ---- decide: humidifier ----

test('T/RH probe fault: timed humidifier, 10 min on then 10 min off, repeating', () => {
  const faults = { trh: true, co2: false };
  const at = (since, now) => decide({ bands, state: offFor(null, { humidifierSince: since }), readings: { co2: 650, rh: null }, faults, now });
  const first = at(null, NOW);
  assert.deepEqual([first.state.humidifier, first.state.humidifierSince, first.desired.humidifier], [true, NOW, true]);
  assert.equal(first.reasons.humidifier, 'Humidity sensor fault: timed humidifier, 10 min of every 20');
  assert.equal(at(NOW - 9 * MIN, NOW).state.humidifier, true);
  assert.equal(at(NOW - 10 * MIN, NOW).state.humidifier, false);
  assert.equal(at(NOW - 19 * MIN, NOW).desired.humidifier, false);
  assert.equal(at(NOW - 20 * MIN, NOW).state.humidifier, true, 'repeats');
  // forced on during an exchange when the room asks for it
  const forced = decide({ bands, state: onFor(MIN, { humidifierSince: NOW - 15 * MIN }), readings: { co2: 800, rh: null }, faults, now: NOW, humidifierDuringExchange: true });
  assert.equal(forced.state.humidifier, false);
  assert.equal(forced.desired.humidifier, true);
  // without the fault the timer is dropped
  const ok = decide({ bands, state: offFor(null, { humidifierSince: NOW - MIN }), readings: { co2: 650, rh: 90 }, now: NOW });
  assert.equal(ok.state.humidifierSince, null);
});

test('a bad RH reading, not faulty: the band state is kept', () => {
  const r = decide({ bands, state: offFor(null, { humidifier: true }), readings: { co2: 650, rh: null }, now: NOW });
  assert.equal(r.state.humidifier, true);
  assert.equal(r.reasons.humidifier, 'Humidity sensor not answering: humidifier kept on');
});

// ---- protect ----

const commands = (humidifier, ac = {}) => ({
  relay: { intake: false, exhaust: false, circulation: true, humidifier, sentAt: null },
  ac: { power: true, mode: 'cool', setpoint: 22, fan: 'auto', sentAt: null, ...ac },
});
const want = (humidifier, setpoint = 22) => ({
  intake: false, exhaust: false, humidifier, circulation: true, ac: { power: true, mode: 'cool', setpoint, fan: 'auto' },
});

test('protect: the humidifier command changes at most once in 15 s (owner 2026-10-29: a minute overshot the band)', () => {
  const held = protect({ desired: want(false), commands: commands(true), changedAt: { humidifier: NOW - 5 * S }, now: NOW });
  assert.equal(held.desired.humidifier, true);
  assert.equal(held.held.humidifier, 'Humidifier waits: minimum on time, 10 s to go');
  const heldOn = protect({ desired: want(true), commands: commands(false), changedAt: { humidifier: NOW - 12 * S }, now: NOW });
  assert.equal(heldOn.desired.humidifier, false);
  assert.equal(heldOn.held.humidifier, 'Humidifier waits: minimum off time, 3 s to go');
  const free = protect({ desired: want(false), commands: commands(true), changedAt: { humidifier: NOW - 15 * S }, now: NOW });
  assert.deepEqual([free.desired.humidifier, free.held.humidifier], [false, '']);
  assert.equal(protect({ desired: want(false), commands: commands(true), changedAt: {}, now: NOW }).desired.humidifier, false, 'never changed');
  const same = protect({ desired: want(true), commands: commands(true), changedAt: { humidifier: NOW - S }, now: NOW });
  assert.equal(same.held.humidifier, '', 'nothing to hold when it does not differ');
});

test('protect: at most one changed aircon command every 2 min; a re-send is not a change', () => {
  const held = protect({ desired: want(false, 17), commands: commands(false), changedAt: { ac: NOW - 40 * S }, now: NOW });
  assert.deepEqual(held.desired.ac, { power: true, mode: 'cool', setpoint: 22, fan: 'auto' });
  assert.equal(held.held.ac, 'Aircon waits: next change in 1 min 20 s');
  assert.equal(protect({ desired: want(false, 17), commands: commands(false), changedAt: { ac: NOW - 2 * MIN }, now: NOW }).desired.ac.setpoint, 17);
  assert.equal(protect({ desired: want(false, 17), commands: commands(false), changedAt: { ac: NOW - 100 * S }, now: NOW }).held.ac,
    'Aircon waits: next change in 20 s');
  assert.equal(protect({ desired: want(false, 17), commands: commands(false), changedAt: { ac: NOW - 119_000 }, now: NOW }).held.ac,
    'Aircon waits: next change in 1 s');
  assert.equal(protect({ desired: want(false, 17), commands: commands(false), changedAt: { ac: NOW - 30 * S }, now: NOW }).held.ac.includes('1 min 30 s'), true);
  const resend = protect({ desired: want(false, 22), commands: commands(false), changedAt: { ac: NOW - S }, now: NOW });
  assert.equal(resend.held.ac, '');
  assert.equal(protect({ desired: want(false, 17), commands: commands(false), changedAt: { ac: NOW - 90 * S }, now: NOW }).held.ac,
    'Aircon waits: next change in 30 s');
  assert.equal(protect({ desired: want(false, 17), commands: commands(false), changedAt: { ac: NOW - 60 * S }, now: NOW }).held.ac,
    'Aircon waits: next change in 1 min');
});

test('protect keeps the circulation and the air exchange as decided and does not change its input', () => {
  const desired = want(false, 17);
  const frozen = JSON.stringify(desired);
  const r = protect({ desired, commands: commands(true), changedAt: { humidifier: NOW, ac: NOW }, now: NOW });
  assert.equal(r.desired.circulation, true);
  assert.equal(JSON.stringify(desired), frozen);
});

// ---- validation ----

test('validateControl: the safety level and the time limit', () => {
  assert.equal(validateControl(DEFAULTS), null);
  const bad = (patch) => validateControl({ ...DEFAULTS, ...patch });
  assert.deepEqual(bad({ co2Safety: 750 }), { error: 'CO₂ safety level must be above the air exchange start point', field: 'co2Safety' });
  assert.equal(bad({ co2Safety: 751 }), null);
  assert.equal(bad({ co2Safety: 10_000 }), null);
  assert.equal(bad({ co2Safety: 10_001 }).field, 'co2Safety');
  assert.equal(bad({ co2Safety: '1250' }).field, 'co2Safety');
  assert.equal(bad({ co2Safety: NaN }).field, 'co2Safety');
  assert.equal(bad({ co2High: 1300 }).field, 'co2Safety', 'the band moved above the level');
  const msg = 'Air exchange time limit must be a whole number from 1 to 120 min';
  assert.deepEqual(bad({ exchangeMaxMin: 0 }), { error: msg, field: 'exchangeMaxMin' });
  for (const v of [121, 2.5, '10', null, NaN]) assert.equal(bad({ exchangeMaxMin: v }).field, 'exchangeMaxMin', String(v));
  for (const v of [1, 10, 120]) assert.equal(bad({ exchangeMaxMin: v }), null);
});

// ---- runner ----

const WIRED = { name: 'Room 1', length: 6, width: 4, height: 2.5, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 };

// A runner with a clock the test moves. cycle() adds readings of a new cycle (default 30 s later) and runs it.
function setup(t, { room = WIRED } = {}) {
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
    clock: () => clock,
    advance: (ms) => { clock += ms; },
    async cycle({ co2 = 650, rh = 90, t: temp = 22, trhOk = true, co2Ok = true, dt = 30_000 } = {}) {
      clock += dt;
      const start = clock;
      db.addReading({ roomId: id, kind: 'trh', address: 1, at: start, ok: trhOk, t: trhOk ? temp : null, rh: trhOk ? rh : null, error: trhOk ? null : 'timeout' });
      db.addReading({ roomId: id, kind: 'co2', address: 2, at: start, ok: co2Ok, co2: co2Ok ? co2 : null, error: co2Ok ? null : 'timeout' });
      clock += 1;
      await controller.run(start);
    },
    keys: () => db.activeAlarms(id).map((a) => a.key),
  };
}

test('with auto off the sensors are still checked and alarms evaluated, and nothing is sent', async (t) => {
  const s = setup(t);
  for (let i = 0; i < 3; i++) await s.cycle({ co2Ok: false });
  assert.deepEqual(s.keys(), ['sensorCo2']);
  assert.equal(s.controller.get(s.id).checks.co2.fault, true);
  assert.equal(s.controller.get(s.id).checks.co2.why, 'no reading');
  assert.deepEqual(s.controller.get(s.id).checks.trh, { ok: true, why: null, fault: false });
  assert.deepEqual(s.writes, []);
  assert.equal(s.controller.get(s.id).reasons.exchange, '');
  await s.cycle(); // a good reading ends the fault and the alarm
  assert.deepEqual(s.keys(), []);
  assert.equal(s.controller.get(s.id).checks.co2.fault, false);
});

test('a process alarm comes from good readings after its delay, with auto off', async (t) => {
  const s = setup(t);
  for (let i = 0; i < 9; i++) await s.cycle({ t: 24.5 + (i % 2) * 0.1, dt: 30_000 });
  assert.deepEqual(s.keys(), []);
  for (let i = 0; i < 3; i++) await s.cycle({ t: 24.5 + (i % 2) * 0.1, dt: 30_000 });
  assert.deepEqual(s.keys(), ['tHigh']);
});

test('a reading that fails a check is not used: a CO₂ spike is ignored, a probe T out of range raises no alarm', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ co2: 650 });
  s.writes.length = 0;
  await s.cycle({ co2: 5000, dt: 10_000 }); // a sudden jump: bad, so treated as missing
  assert.equal(s.controller.get(s.id).exchange, false);
  assert.equal(s.controller.get(s.id).checks.co2.why, 'sudden jump');
  assert.equal(s.controller.get(s.id).reasons.exchange, 'CO₂ reading not usable: air exchange kept off');
  assert.deepEqual(s.writes, []);
});

test('3 bad CO₂ readings: fault alarm and the timed exchange', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle();
  for (let i = 0; i < 3; i++) await s.cycle({ co2Ok: false });
  assert.deepEqual(s.keys(), ['sensorCo2']);
  const view = s.controller.get(s.id);
  assert.equal(view.reasons.exchange, 'CO₂ sensor fault: timed air exchange, 10 min of every 25', 'rests at most the 15 min fresh-air interval');
  assert.equal(view.exchange, true, 'never ended: the timed exchange starts at once');
  assert.equal(s.db.getCommands(s.id).relay.intake, true);
  // on for 10 min, then off
  for (let i = 0; i < 19; i++) await s.cycle({ co2Ok: false });
  assert.equal(s.db.getCommands(s.id).relay.intake, true);
  await s.cycle({ co2Ok: false, dt: 30_000 });
  assert.equal(s.db.getCommands(s.id).relay.intake, false);
  assert.notEqual(s.controller.get(s.id).exchangeEndedAt, null);
});

test('the too-small count goes up at each limit stop and clears when auto is turned off', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true, exchangeMaxMin: 1 });
  await s.cycle({ co2: 760 });
  assert.equal(s.controller.get(s.id).exchange, true);
  // 1 min limit, CO2 held at 667: the exchange stops; it only restarts at the upper limit after 60 s off
  for (let round = 1; round <= 3; round++) {
    await s.cycle({ co2: 667 });
    await s.cycle({ co2: 667 });
    await s.cycle({ co2: 667 });
    assert.equal(s.controller.get(s.id).exchange, false, `stopped at the limit (${round})`);
    assert.equal(s.controller.get(s.id).cappedInRow, round);
    if (round < 3) {
      await s.cycle({ co2: 667, dt: 60_000 });
      await s.cycle({ co2: 760 });
      assert.equal(s.controller.get(s.id).exchange, true);
    }
  }
  assert.deepEqual(s.keys(), ['exchangeTooSmall']);
  s.controller.update(s.id, { auto: false });
  assert.equal(s.controller.get(s.id).cappedInRow, 0);
  await s.cycle({ co2: 667 });
  assert.deepEqual(s.keys(), []);
});

test('the safety level starts the exchange at once and raises the critical alarm after 60 s', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle({ co2: 700 });
  await s.cycle({ co2: 1100, dt: 20_000 });
  await s.cycle({ co2: 1300, dt: 20_000 });
  assert.equal(s.controller.get(s.id).exchange, true);
  assert.equal(s.controller.get(s.id).reasons.exchange, 'Air exchange: CO₂ 1,300 ppm, at or over the safety level 1,250 ppm, no time limit');
  await s.cycle({ co2: 1290, dt: 30_000 });
  await s.cycle({ co2: 1290, dt: 30_000 });
  assert.equal(s.keys().includes('co2Safety'), true);
  assert.equal(s.db.currentAlarms(s.id).find((a) => a.key === 'co2Safety').level, 'critical');
});

test('the humidifier is held for 15 s after a change and the reason says so', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true, rhLow: 90, rhHigh: 92 });
  await s.cycle({ rh: 89 }); // dry: humidifier on
  assert.equal(s.db.getCommands(s.id).relay.humidifier, true);
  await s.cycle({ rh: 93, dt: 5_000 }); // wet after 5 s: wants off, held
  assert.equal(s.db.getCommands(s.id).relay.humidifier, true);
  assert.equal(s.controller.get(s.id).reasons.held.humidifier, 'Humidifier waits: minimum on time, 10 s to go');
  await s.cycle({ rh: 93, dt: 10_000 });
  assert.equal(s.db.getCommands(s.id).relay.humidifier, false);
  assert.equal(s.controller.get(s.id).reasons.held.humidifier, '');
});

test('the aircon is held for 2 min after a change', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true, acDrop: 5 }); // a room that lowers the aircon during an exchange
  await s.cycle(); // first send: 22
  await s.cycle({ co2: 760 }); // air exchange: wants 17
  assert.equal(s.db.getCommands(s.id).ac.setpoint, 22);
  assert.equal(s.controller.get(s.id).reasons.held.ac, 'Aircon waits: next change in 1 min 30 s');
  assert.equal(s.controller.get(s.id).exchange, true, 'the fans do not wait for the aircon');
  await s.cycle({ co2: 760, dt: 90_000 });
  assert.equal(s.db.getCommands(s.id).ac.setpoint, 17);
});

test('the control view has the new settings, checks and held texts', (t) => {
  const s = setup(t);
  const v = s.controller.get(s.id);
  assert.deepEqual([v.co2Safety, v.exchangeMaxMin, v.exchangeEndedAt, v.cappedInRow], [1250, 10, null, 0]);
  assert.deepEqual(v.checks, { trh: null, co2: null });
  assert.deepEqual(v.reasons.held, { humidifier: '', dehumidifier: '', ac: '' });
  assert.equal('humidifierSince' in v, false);
  const u = s.controller.update(s.id, { co2Safety: 1500, exchangeMaxMin: 20 });
  assert.deepEqual([u.co2Safety, u.exchangeMaxMin], [1500, 20]);
  assert.throws(() => s.controller.update(s.id, { co2Safety: 700 }), { status: 400, field: 'co2Safety' });
  assert.throws(() => s.controller.update(s.id, { exchangeMaxMin: 0 }), { status: 400, field: 'exchangeMaxMin' });
});

test('forget drops the checks, the alarm delay counts and the protection times of a room', async (t) => {
  const s = setup(t);
  const hot = (i, rh) => ({ t: 24.5 + (i % 2) * 0.1, rh });
  s.controller.update(s.id, { auto: true, rhLow: 90, rhHigh: 92 });
  for (let i = 0; i < 6; i++) await s.cycle(hot(i, 91)); // the tHigh delay count runs: 2.5 min
  await s.cycle(hot(6, 89)); // humidifier on: its change time is kept
  assert.equal(s.db.getCommands(s.id).relay.humidifier, true);
  assert.notEqual(s.controller.get(s.id).checks.co2, null);
  s.controller.forget(s.id);
  assert.deepEqual(s.controller.get(s.id).checks, { trh: null, co2: null });
  // the protection time is gone: wet air switches the humidifier off at once (it would be held 1 min otherwise)
  await s.cycle({ ...hot(7, 93), dt: 1000 });
  assert.equal(s.db.getCommands(s.id).relay.humidifier, false);
  // the delay count starts again: 4 min after forget is not 5 min (without forget it would be 7)
  for (let i = 8; i < 16; i++) await s.cycle(hot(i, 93));
  assert.deepEqual(s.keys(), []);
});

test('an unwired sensor is not checked', async (t) => {
  const s = setup(t, { room: { ...WIRED, co2Address: null } });
  await s.cycle();
  assert.equal(s.controller.get(s.id).checks.co2, null);
  assert.equal(s.controller.get(s.id).checks.trh.ok, true);
});

// Outdoor air in control (spec 2026-10-26-live-alarms-outdoor-design.md 4): free cooling, outdoor drying, the wait for very wet
// outdoor air, exchangeKind; the runner's outdoor reading; the simulation passing the outdoor air.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createMachines } from '../server/machines.js';
import { createController } from '../server/controller.js';
import { simulate } from '../server/simulate.js';
import { validateSimulation } from '../server/simulations.js';
import { wOf, dewOf } from '../device/sim-model.js';

const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, exchangeEveryMin: 0, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95 };
const NOW = 10_000_000;
const MIN = 60_000;
const S = 1000;

const off = (ms = 5 * MIN, extra = {}) => ({
  exchange: false, exchangeSince: null, exchangeEndedAt: NOW - ms, cappedInRow: 0, humidifier: false, humidifierSince: null, ...extra,
});
const on = (kind, ms, extra = {}) => ({
  exchange: true, exchangeSince: NOW - ms, exchangeEndedAt: null, exchangeKind: kind, cappedInRow: 0, humidifier: false, humidifierSince: null, ...extra,
});
// The room warm (25 °C, RH 90) and the outdoor air cooler and drier unless a test says otherwise.
const go = (state, readings, extra = {}) => decide({
  bands, state, readings: { co2: 650, rh: 90, t: 25, outdoor: { t: 20, rh: 80 }, ...readings }, now: NOW, ...extra,
});
const goB = (state, b, readings, extra = {}) => go(state, readings, { bands: { ...bands, ...b }, ...extra });

// ---- free cooling ----

test('free cooling starts: outdoor 2 °C cooler, the room above the middle + 0.25 × width, outdoor not wetter', () => {
  const r = go(off(), {});
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeKind, 'cooling');
  assert.equal(r.desired.intake, true);
  assert.equal(r.desired.exhaust, true);
  assert.equal(r.reasons.exchange, 'Free cooling: outdoor 20 °C, the room 25 °C');
});

test('free cooling start thresholds', () => {
  // 2 °C cooler: 23 vs 25 starts, 23.1 does not
  assert.equal(go(off(), { outdoor: { t: 23, rh: 50 } }).state.exchange, true);
  assert.equal(go(off(), { outdoor: { t: 23.1, rh: 50 } }).state.exchange, false);
  // the room above 22 + 0.25 × 2 = 22.5
  assert.equal(go(off(), { t: 22.6, outdoor: { t: 18, rh: 50 } }).state.exchange, true);
  assert.equal(go(off(), { t: 22.5, outdoor: { t: 18, rh: 50 } }).state.exchange, false);
  // outdoor W at most the room's + 0.5
  const wIn = wOf(25, 90);
  const rhFor = (w) => (w / wOf(20, 100)) * 100;
  assert.equal(go(off(), { outdoor: { t: 20, rh: rhFor(wIn + 0.4) } }).state.exchange, true);
  assert.equal(go(off(), { outdoor: { t: 20, rh: rhFor(wIn + 0.6) } }).state.exchange, false);
});

test('free cooling stops at the middle, with the outdoor air less than 1 °C cooler, or with outdoor W 1 above the room', () => {
  const run = on('cooling', 2 * MIN);
  const keep = go(run, { t: 24 });
  assert.equal(keep.state.exchange, true);
  assert.equal(keep.state.exchangeKind, 'cooling');
  assert.equal(keep.reasons.exchange, 'Free cooling: outdoor 20 °C, the room 24 °C');
  const mid = go(run, { t: 22 });
  assert.equal(mid.state.exchange, false);
  assert.equal(mid.state.exchangeKind, null);
  assert.equal(mid.reasons.exchange, 'Free cooling ends: the room is at 22 °C');
  assert.equal(go(run, { t: 22.1 }).state.exchange, true);
  // hysteresis: still going at 1.5 °C cooler (stopped only past 1), the start needed 2
  assert.equal(go(run, { outdoor: { t: 23.5, rh: 50 } }).state.exchange, true);
  const warm = go(run, { outdoor: { t: 24.5, rh: 50 } });
  assert.equal(warm.state.exchange, false);
  assert.equal(warm.reasons.exchange, 'Free cooling ends: outdoor 24.5 °C, the room 25 °C');
  const wIn = wOf(25, 90);
  const rhFor = (w) => (w / wOf(20, 100)) * 100;
  assert.equal(go(run, { outdoor: { t: 20, rh: rhFor(wIn + 0.9) } }).state.exchange, true);
  assert.equal(go(run, { outdoor: { t: 20, rh: rhFor(wIn + 1.1) } }).state.exchange, false);
});

test('free cooling does not start at the CO₂ safety level, the CO₂ rule goes first', () => {
  const r = go(off(), { co2: 1300 });
  assert.equal(r.state.exchangeKind, 'co2');
  assert.equal(r.reasons.exchange, 'Air exchange: CO₂ 1300 ≥ safety level 1250');
  const high = go(off(), { co2: 800 });
  assert.equal(high.state.exchangeKind, 'co2');
  assert.equal(high.reasons.exchange, 'Air exchange: CO₂ 800 ≥ 750');
});

test('a running free cooling at the CO₂ upper limit is handed to the CO₂ rule (kind co2, normal time limit)', () => {
  const r = go(on('cooling', 2 * MIN), { co2: 800, t: 22 });
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeKind, 'co2');
  assert.equal(r.reasons.exchange, 'Air exchange: CO₂ 800 ≥ 750');
});

test('free cooling and outdoor drying keep the minimum off time', () => {
  const r = go(off(30 * S), {});
  assert.equal(r.state.exchange, false);
  assert.equal(go(off(60 * S), {}).state.exchange, true);
});

test('free cooling keeps the minimum on time and stops at the time limit', () => {
  const held = go(on('cooling', 20 * S), { t: 22 });
  assert.equal(held.state.exchange, true);
  assert.equal(held.reasons.exchange, 'Air exchange waits: minimum on time, 10 s to go');
  assert.equal(go(on('cooling', 30 * S), { t: 22 }).state.exchange, false);
  const limit = go(on('cooling', 10 * MIN), {});
  assert.equal(limit.state.exchange, false);
  assert.equal(limit.state.cappedInRow, 0);
  assert.equal(limit.reasons.exchange, 'Free cooling stopped at the 10 min limit');
  assert.equal(go(on('cooling', 10 * MIN - S), {}).state.exchange, true);
});

test('free cooling counts as an exchange for the fresh-air wait', () => {
  const b = { exchangeEveryMin: 15 };
  const r = goB(on('cooling', 10 * MIN), b, {});
  assert.equal(r.state.exchange, false);
  assert.equal(r.state.freshFrom, NOW);
});

test('free cooling is not lowered by the aircon drop', () => {
  const cool = goB(off(), { acDrop: 5 }, {});
  assert.equal(cool.desired.ac.setpoint, 22);
  const co2 = goB(off(), { acDrop: 5 }, { co2: 800 });
  assert.equal(co2.desired.ac.setpoint, 17);
});

// ---- outdoor drying ----

const wet = { t: 22, rh: 96 };

test('outdoor drying starts at RH ≥ the upper limit with the outdoor air 1 g/m³ drier and at most 4 °C warmer', () => {
  const r = go(off(), { t: 22, rh: 96, outdoor: { t: 20, rh: 60 } });
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeKind, 'drying');
  assert.match(r.reasons.exchange, /^Outdoor drying: outdoor air \d+(\.\d)? g\/m³, the room \d+(\.\d)? g\/m³$/);
  assert.equal(go(off(), { ...wet, rh: 94.9, outdoor: { t: 20, rh: 60 } }).state.exchange, false);
  assert.equal(go(off(), { ...wet, outdoor: { t: 26, rh: 20 } }).state.exchange, true);
  assert.equal(go(off(), { ...wet, outdoor: { t: 26.1, rh: 20 } }).state.exchange, false);
  const wIn = wOf(22, 96);
  const rhFor = (w) => (w / wOf(20, 100)) * 100;
  assert.equal(go(off(), { ...wet, outdoor: { t: 20, rh: rhFor(wIn - 1.1) } }).state.exchange, true);
  assert.equal(go(off(), { ...wet, outdoor: { t: 20, rh: rhFor(wIn - 0.9) } }).state.exchange, false);
});

test('outdoor drying stops at the middle of the RH band, or outdoor W within 0.5 of the room, or outdoor more than 5 °C warmer', () => {
  const run = on('drying', 2 * MIN);
  const keep = go(run, { t: 22, rh: 92, outdoor: { t: 20, rh: 60 } });
  assert.equal(keep.state.exchange, true);
  assert.equal(keep.state.exchangeKind, 'drying');
  const mid = go(run, { t: 22, rh: 90, outdoor: { t: 20, rh: 60 } });
  assert.equal(mid.state.exchange, false);
  assert.equal(mid.reasons.exchange, 'Outdoor drying ends: RH 90 ≤ 90');
  assert.equal(go(run, { t: 22, rh: 91, outdoor: { t: 20, rh: 60 } }).state.exchange, true);
  const wIn = wOf(22, 91);
  const rhFor = (w) => (w / wOf(20, 100)) * 100;
  assert.equal(go(run, { t: 22, rh: 91, outdoor: { t: 20, rh: rhFor(wIn - 0.6) } }).state.exchange, true);
  assert.equal(go(run, { t: 22, rh: 91, outdoor: { t: 20, rh: rhFor(wIn - 0.4) } }).state.exchange, false);
  assert.equal(go(run, { t: 22, rh: 91, outdoor: { t: 27, rh: 20 } }).state.exchange, true);
  const hot = go(run, { t: 22, rh: 91, outdoor: { t: 27.1, rh: 20 } });
  assert.equal(hot.state.exchange, false);
  assert.equal(hot.reasons.exchange, 'Outdoor drying ends: outdoor 27.1 °C, the room 22 °C');
});

test('outdoor drying keeps the minimum on time and the time limit', () => {
  const dry = { t: 22, rh: 90, outdoor: { t: 20, rh: 60 } };
  assert.equal(go(on('drying', 20 * S), dry).state.exchange, true);
  assert.equal(go(on('drying', 30 * S), dry).state.exchange, false);
  const limit = go(on('drying', 10 * MIN), { t: 22, rh: 96, outdoor: { t: 20, rh: 60 } });
  assert.equal(limit.state.exchange, false);
  assert.equal(limit.reasons.exchange, 'Outdoor drying stopped at the 10 min limit');
});

test('cooling comes before drying when both would start', () => {
  const r = go(off(), { t: 25, rh: 96, outdoor: { t: 20, rh: 50 } });
  assert.equal(r.state.exchangeKind, 'cooling');
});

// ---- wet outdoor air and the fresh-air wait ----

const hh = (ms) => `${String(new Date(ms).getHours()).padStart(2, '0')}:${String(new Date(ms).getMinutes()).padStart(2, '0')}`;
const due = (extra = {}) => off(15 * MIN, { freshFrom: NOW - 15 * MIN, ...extra });
const veryWet = { t: 25, rh: 100 }; // 25 °C saturated: W 23, the room (22 °C, RH 70) holds about 13.7
const calm = { t: 22, rh: 70 };
const fresh = (readings, extra = {}) => goB(due(extra), { exchangeEveryMin: 15 }, { co2: 650, ...calm, ...readings });

test('fresh air runs as before with outdoor air that is not very wet', () => {
  const r = fresh({ outdoor: { t: 21, rh: 70 } });
  assert.equal(r.state.exchangeKind, 'fresh');
  assert.equal(r.reasons.exchange, 'Fresh air: no air exchange for 15 min, fans on for 1 min');
});

test('fresh air waits while outdoor W ≥ room W + 3, at the latest one more interval', () => {
  const r = fresh({ outdoor: veryWet });
  assert.equal(r.state.exchange, false);
  assert.equal(r.reasons.exchange, `Fresh air waits: outdoor air is very wet (dew ${Math.round(dewOf(wOf(25, 100)) * 10) / 10} °C), at the latest ${hh(NOW - 15 * MIN + 30 * MIN)}`);
  // 29 min without fresh air: still waits; 30 min: runs whatever the air
  const late = (min) => goB(off(min * MIN, { freshFrom: NOW - min * MIN }), { exchangeEveryMin: 15 }, { ...calm, outdoor: veryWet });
  assert.equal(late(29).state.exchange, false);
  assert.equal(late(30).state.exchange, true);
  assert.equal(late(30).state.exchangeKind, 'fresh');
  // the threshold: W + 3
  const wIn = wOf(22, 70);
  const rhFor = (w) => (w / wOf(20, 100)) * 100;
  assert.equal(fresh({ outdoor: { t: 20, rh: rhFor(wIn + 2.9) } }).state.exchange, true);
  assert.equal(fresh({ outdoor: { t: 20, rh: rhFor(wIn + 3) } }).state.exchange, false);
});

test('fresh air waits while the outdoor air is 8 °C hotter', () => {
  assert.equal(fresh({ outdoor: { t: 29.9, rh: 20 } }).state.exchange, true);
  const r = fresh({ outdoor: { t: 30, rh: 20 } });
  assert.equal(r.state.exchange, false);
  assert.match(r.reasons.exchange, /^Fresh air waits: outdoor air is very hot \(30 °C\), at the latest \d\d:\d\d$/);
});

test('the wait is for the fresh-air run only: the CO₂ rule starts at once', () => {
  const r = fresh({ outdoor: veryWet, co2: 800 });
  assert.equal(r.state.exchange, true);
  assert.equal(r.state.exchangeKind, 'co2');
});

test('the wait also applies with no CO₂ reading', () => {
  const r = fresh({ outdoor: veryWet, co2: null });
  assert.equal(r.state.exchange, false);
  assert.match(r.reasons.exchange, /^Fresh air waits/);
});

// ---- unchanged behaviour ----

test('outdoorAir false: nothing changes, the outdoor reading is ignored', () => {
  const r = goB(off(), { outdoorAir: false }, {});
  assert.equal(r.state.exchange, false);
  assert.equal(r.state.exchangeKind, null);
  const dry = goB(off(), { outdoorAir: false }, { t: 22, rh: 96, outdoor: { t: 20, rh: 60 } });
  assert.equal(dry.state.exchange, false);
  assert.equal(fresh({ outdoor: veryWet }, {}).state.exchange, false);
  assert.equal(goB(due(), { exchangeEveryMin: 15, outdoorAir: false }, { ...calm, outdoor: veryWet }).state.exchange, true);
});

test('no outdoor reading, or no room T: nothing changes', () => {
  assert.equal(go(off(), { outdoor: null }).state.exchange, false);
  assert.equal(go(off(), { t: null }).state.exchange, false);
  assert.equal(go(off(), { rh: null }).state.exchange, false);
  const noReadings = decide({ bands, state: off(), readings: { co2: 650, rh: 90 }, now: NOW });
  assert.equal(noReadings.state.exchange, false);
  assert.equal(noReadings.reasons.exchange, 'Air exchange kept off: CO₂ 650 between 600 and 750');
});

test('a running free cooling ends when the outdoor reading is lost or the setting is switched off (after the minimum on time)', () => {
  const lost = go(on('cooling', 2 * MIN), { outdoor: null });
  assert.equal(lost.state.exchange, false);
  assert.equal(lost.reasons.exchange, 'Free cooling ends: no outdoor reading');
  const offSetting = goB(on('drying', 2 * MIN), { outdoorAir: false }, {});
  assert.equal(offSetting.state.exchange, false);
  assert.equal(offSetting.reasons.exchange, 'Outdoor drying ends: outdoor air is off');
});

test('exchangeKind: co2, fresh, timed, and null when off', () => {
  assert.equal(go(off(), { co2: 800, outdoor: null }).state.exchangeKind, 'co2');
  assert.equal(goB(due(), { exchangeEveryMin: 15 }, { ...calm, outdoor: null }).state.exchangeKind, 'fresh');
  const timed = decide({ bands, state: off(30 * MIN), readings: { co2: null, rh: 90 }, faults: { co2: true }, now: NOW });
  assert.equal(timed.state.exchangeKind, 'timed');
  const idle = go(off(), { outdoor: null });
  assert.equal(idle.state.exchangeKind, null);
  // a running co2 exchange keeps its kind
  assert.equal(go(on('co2', 2 * MIN), { co2: 700, outdoor: null }).state.exchangeKind, 'co2');
  assert.equal(go({ ...on(undefined, 2 * MIN) }, { co2: 700, outdoor: null }).state.exchangeKind, 'co2');
});

test('a CO₂ sensor fault takes over a running free cooling as a timed exchange', () => {
  const r = go(on('cooling', 2 * MIN), { co2: null }, { faults: { co2: true } });
  assert.equal(r.state.exchangeKind, 'timed');
});

// ---- the runner ----

const fields = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
function setup(t, { outdoor = true } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const client = { async writeCoil() {}, async writeRegisters() {} };
  const poller = { machineState: () => ({ relay: { address: null, polls: [] }, ac: { address: null, polls: [] } }) };
  let clock = 10_000_000;
  const now = () => clock;
  const machines = createMachines({ db, client, poller, now });
  const controller = createController({ db, machines, now, log: (e) => { throw e; } });
  const id = db.createRoom({ ...fields, trhAddress: 1, co2Address: 2, relayAddress: 3, acAddress: 4 }).id;
  if (outdoor) db.setSetting('outdoorAddress', '20');
  return {
    db, controller, id, tick: (ms) => { clock += ms; }, clock: () => clock,
    async cycle({ co2 = 650, rh = 90, t: temp = 25 } = {}) {
      clock += 30_000;
      const start = clock;
      db.addReading({ roomId: id, kind: 'trh', address: 1, at: start, ok: true, t: temp, rh });
      db.addReading({ roomId: id, kind: 'co2', address: 2, at: start, ok: true, co2 });
      clock += 1;
      await controller.run(start);
    },
    addOutdoor(at, t, rh, ok = true) { db.addOutdoorReading({ address: 20, at, ok, t: ok ? t : null, rh: ok ? rh : null, error: ok ? null : 'timeout' }); },
  };
}

test('runRoom: a fresh outdoor reading starts free cooling, the exchange kind is stored', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  await s.cycle(); // the first cycle: the exchange is off for less than the minimum off time? (never ended: no wait)
  s.addOutdoor(s.clock() - 10_000, 20, 80);
  await s.cycle();
  const c = s.controller.get(s.id);
  assert.equal(c.exchange, true);
  assert.equal(c.exchangeKind, 'cooling');
  assert.equal(c.reasons.exchange, 'Free cooling: outdoor 20 °C, the room 25 °C');
});

test('runRoom: an outdoor reading older than 5 min, a failed one, no outdoor probe or the setting off are ignored', async (t) => {
  const old = setup(t);
  old.controller.update(old.id, { auto: true });
  old.addOutdoor(old.clock() - 6 * 60_000, 20, 80);
  await old.cycle();
  assert.equal(old.controller.get(old.id).exchange, false);

  const failed = setup(t);
  failed.controller.update(failed.id, { auto: true });
  failed.addOutdoor(failed.clock() - 100, 0, 0, false);
  await failed.cycle();
  assert.equal(failed.controller.get(failed.id).exchange, false);

  const none = setup(t, { outdoor: false });
  none.controller.update(none.id, { auto: true });
  await none.cycle();
  assert.equal(none.controller.get(none.id).exchange, false);

  const disabled = setup(t);
  disabled.controller.update(disabled.id, { auto: true, outdoorAir: false });
  disabled.addOutdoor(disabled.clock() - 100, 20, 80);
  await disabled.cycle();
  assert.equal(disabled.controller.get(disabled.id).exchange, false);
});

test('runRoom: a last good reading is used even when a later poll failed (while it is at most 5 min old)', async (t) => {
  const s = setup(t);
  s.controller.update(s.id, { auto: true });
  s.addOutdoor(s.clock() - 20_000, 20, 80);
  s.addOutdoor(s.clock() - 10_000, 0, 0, false);
  await s.cycle();
  assert.equal(s.controller.get(s.id).exchangeKind, 'cooling');
});

test('the control setting outdoorAir is validated and saved', (t) => {
  const s = setup(t);
  assert.equal(s.controller.get(s.id).outdoorAir, true);
  assert.equal(s.controller.update(s.id, { outdoorAir: false }).outdoorAir, false);
  assert.throws(() => s.controller.update(s.id, { outdoorAir: 'yes' }), { field: 'outdoorAir' });
});

// ---- simulate ----

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 20, outdoorDew: 15, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const input = { physics, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1 };

test('simulate passes the outdoor air: outdoorAir changes the exchanges, a run override works', () => {
  const ctx = (outdoorAir) => ({ volume: 60, ratings: { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050 }, control: { exchangeMaxMin: 10, exchangeEveryMin: 0, acDrop: 0, outdoorAir }, program: null });
  const on = simulate(input, ctx(true));
  const offRun = simulate(input, ctx(false));
  assert.notDeepEqual(on.summary.energy, offRun.summary.energy);
  assert.deepEqual(simulate(input, ctx(true)).summary, on.summary);
});

test('a run may set control.outdoorAir (boolean)', () => {
  const body = { ...input, control: { outdoorAir: false } };
  assert.deepEqual(validateSimulation(body).input.control, { outdoorAir: false });
  assert.deepEqual(validateSimulation({ ...input, control: { outdoorAir: 1 } }), { error: 'Use outdoor air must be true or false', field: 'control.outdoorAir' });
});

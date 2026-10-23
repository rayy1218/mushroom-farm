import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FILTER_DEFAULTS, hasFilter, filterOf, changeFilter, initialState, step, wOf, rhOf } from '../device/sim-model.js';
import { fanWattFactor, electricW } from '../device/sim-power.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);
const OFF = { intake: false, exhaust: false, circulation: false, humidifier: false, ac: null };
const PAIR = { ...OFF, intake: true, exhaust: true };
// A room with no blocks whose outdoor air equals its own: only the fans and the filter act.
const BASE = { volume: 60, blocks: 0, co2PerBlock: 60, wallUA: 80, sunW: 0, outdoorT: 25, outdoorRH: 70, fanFlow: 600, acKW: 3.5, humidifierGH: 2000 };
const F = { ...BASE, ...FILTER_DEFAULTS };
const at = (Lf, params = F) => ({ ...initialState(params), Lf });
const F_FINAL = 0.75; // the intake share at the change pressure with the defaults: (200 − 80) ÷ (200 − 40)

function run(state, inputs, params, seconds, dt = 60) {
  let s = state, acting;
  for (let t = 0; t < seconds; t += dt) ({ state: s, acting } = step(s, inputs, params, dt));
  return { state: s, acting };
}

test('the defaults: 200 Pa fan, 40 Pa clean, 80 Pa change, 30 days', () => {
  assert.deepEqual(FILTER_DEFAULTS, { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterLifeDays: 30 });
});

test('hasFilter: the three pressures and a life above zero', () => {
  assert.equal(hasFilter(F), true);
  assert.equal(hasFilter(BASE), false);
  assert.equal(hasFilter({ ...F, filterLifeDays: 0 }), false);
  assert.equal(hasFilter({ ...F, fanMaxPa: null }), false);
  assert.equal(hasFilter({ ...F, filterFinalPa: '150' }), false);
});

test('filterOf: the sensor reading rises with the loading; share 1 when clean, 0.75 at the change pressure, 0 at the fan maximum', () => {
  assert.deepEqual(filterOf(BASE, 0.7), { share: 1, pressurePa: 0 });
  assert.deepEqual(filterOf(F, 0), { share: 1, pressurePa: 40 });
  const final = filterOf(F, 1);
  near(final.share, F_FINAL, 1e-12);
  assert.equal(final.pressurePa, 80);
  const past = filterOf(F, 2);
  assert.equal(past.pressurePa, 120);
  near(past.share, 0.5, 1e-12);
  assert.deepEqual(filterOf(F, 4), { share: 0, pressurePa: 200 });
  assert.deepEqual(filterOf(F, 6), { share: 0, pressurePa: 200 }, 'never above the fan maximum, never a negative share');
});

test('a new state and a state from before the filter start clean; changeFilter makes it clean', () => {
  assert.equal(initialState(F).Lf, 0);
  const r = step({ T: 25, W: wOf(25, 70), CO2: 500 }, OFF, F, 5);
  assert.equal(r.state.Lf, 0);
  const s = at(0.8);
  assert.deepEqual(changeFilter(s), { ...s, Lf: 0 });
});

test('a clogged filter: the pair moves fanFlow x (1 + f) / 2, the rest of the intake comes through the leaks', () => {
  const r = step(at(1), PAIR, F, 0);
  near(r.acting.exchangeM3h, 600 * (1 + F_FINAL) / 2, 1e-9);
  near(r.acting.intakeShare, F_FINAL, 1e-12);
  assert.equal(r.acting.filterPa, 80);
  near(r.acting.unfilteredM3h, 600 * (1 - F_FINAL) / 2, 1e-9);
  assert.equal(r.acting.filterLoad, 1);
  // Container Alpha's example in the spec: 150 m³/h, at the change pressure 131.25 exchanged, 112.5 filtered, 18.75 through the leaks
  const alpha = step(at(1), PAIR, { ...F, fanFlow: 150 }, 0).acting;
  near(alpha.exchangeM3h, 131.25, 1e-9);
  near(alpha.exchangeM3h - alpha.unfilteredM3h, 112.5, 1e-9);
  near(alpha.unfilteredM3h, 18.75, 1e-9);
});

test('one fan alone: the intake moves 30 % x f, the exhaust 30 % as before; no filter pressure without the intake', () => {
  const intake = step(at(1), { ...OFF, intake: true }, F, 0).acting;
  near(intake.exchangeM3h, 0.3 * 600 * F_FINAL, 1e-9);
  assert.equal(intake.filterPa, 80);
  assert.equal(intake.unfilteredM3h, 0);
  const exhaust = step(at(1), { ...OFF, exhaust: true }, F, 0).acting;
  near(exhaust.exchangeM3h, 180, 1e-9);
  assert.equal(exhaust.filterPa, 0);
  const none = step(at(1), OFF, F, 0).acting;
  near(none.exchangeM3h, 0.3 * 60, 1e-9, 'the leakage');
  assert.equal(none.filterPa, 0);
  near(step(at(5), { ...OFF, intake: true }, { ...F, fanFlow: 10 }, 0).acting.exchangeM3h, 18, 1e-9, 'never below the leakage');
});

test('without filter settings the fans move fanFlow as before and nothing loads', () => {
  const r = run(initialState(BASE), PAIR, BASE, 3600);
  assert.equal(r.acting.exchangeM3h, 600);
  assert.equal(r.acting.filterPa, 0);
  assert.equal(r.acting.intakeShare, 1);
  assert.equal(r.acting.unfilteredM3h, 0);
  assert.equal(r.state.Lf, 0);
});

test('the filter loads with the air it passes, not with the time', () => {
  const p = { ...F, filterLifeDays: 1 }; // 1 day x 24 h x 600 m³/h = 14 400 m³ to the change pressure
  const pair = run(at(0, p), PAIR, p, 3600).state.Lf;
  near(pair, 600 / 14400, 0.0005, 'about one hour of air');
  const intake = run(at(0, p), { ...OFF, intake: true }, p, 3600).state.Lf;
  near(intake, (0.3 * 600) / 14400, 0.0002);
  assert.equal(run(at(0, p), { ...OFF, exhaust: true }, p, 3600).state.Lf, 0);
  assert.equal(run(at(0, p), OFF, p, 3600).state.Lf, 0);
  let half = run(at(0, p), PAIR, p, 1800).state;
  half = run(half, OFF, p, 1800).state;
  near(half.Lf / pair, 0.5, 0.01, 'half the run time, half the loading');
  near(run(at(0, p), PAIR, p, 3600, 3600).state.Lf, pair, 1e-9, 'the step length does not matter');
  assert.equal(run(at(0, { ...p, fanFlow: 0 }), PAIR, { ...p, fanFlow: 0 }, 3600).state.Lf, 0, 'no fan flow, no loading');
});

test('30 days of the pair at 150 m³/h: loading about 0.88, intake share about 0.78', () => {
  const p = { ...F, fanFlow: 150 };
  const { state, acting } = run(at(0, p), PAIR, p, 30 * 86400, 3600);
  near(state.Lf, 0.885, 0.005); // dL/dt = f / 30 days with f = 1 − L/4 gives L = 4 (1 − e^(−30/120))
  near(acting.intakeShare, 0.779, 0.005);
});

test('a dirtier filter means less exchange: CO2 is higher after the same purge', () => {
  const s0 = (Lf) => ({ ...initialState(F), CO2: 2000, Lf });
  const clean = run(s0(0), PAIR, F, 600).state.CO2;
  const dirty = run(s0(1), PAIR, F, 600).state.CO2;
  assert.ok(dirty > clean + 20, `${dirty} vs ${clean}`);
});

test('the intake motor heat follows the filter pressure', () => {
  const s = at(1);
  const a = step(s, { ...OFF, intake: true }, { ...F, outdoorT: s.T, outdoorRH: rhOf(s.T, s.W) }, 5).acting;
  near(a.machineKW, 0.06 * fanWattFactor(80, 40, 200), 1e-9);
  near(step(at(0), { ...OFF, intake: true }, F, 5).acting.machineKW, 0.06, 1e-9, 'clean: the rated 60 W');
});

test('fanWattFactor: 1 when clean, 1.15 at the fan maximum, never below 1, 1 for bad values', () => {
  assert.equal(fanWattFactor(40, 40, 200), 1);
  near(fanWattFactor(200, 40, 200), 1.15, 1e-12);
  near(fanWattFactor(120, 40, 200), 1.075, 1e-12);
  assert.equal(fanWattFactor(0, 40, 200), 1);
  assert.equal(fanWattFactor(100, undefined, 200), 1);
  assert.equal(fanWattFactor(NaN, 40, 200), 1);
  assert.equal(fanWattFactor(100, 40, 40), 1);
  assert.equal(fanWattFactor(100, 60, 40), 1);
});

test('electricW: the intake fan draws more on a dirty filter, the exhaust fan does not', () => {
  const run1 = (inputs, filterPa) => electricW({ acting: { acCoolKW: 0, acLatentKW: 0, acHeatKW: 0, filterPa }, inputs: { ac: null, ...inputs }, params: { outdoorT: 27, ...FILTER_DEFAULTS } });
  near(run1({ intake: true }, 200), 69, 1e-9);
  assert.equal(run1({ intake: true }, 40), 60);
  assert.equal(run1({ exhaust: true }, 200), 60);
  assert.equal(electricW({ acting: { acCoolKW: 0, acLatentKW: 0, acHeatKW: 0 }, inputs: { ac: null, intake: true }, params: { outdoorT: 27 } }), 60, 'no filter settings: rated');
});

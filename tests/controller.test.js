// The pure decision of automatic control (server/controller.js, spec 2026-10-19-controller-design.md).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decide, validateControl, DEFAULTS } from '../server/controller.js';

// acDrop 5: the room these rules were written for lowers the aircon 5 °C during an exchange (a new room: 0).
const bands = { co2Low: 600, co2High: 750, co2Safety: 1250, exchangeMaxMin: 10, tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, acDrop: 5 };
const off = { exchange: false, humidifier: false };
const NOW = 10_000_000;

// A state given as { exchange, humidifier } is taken as long settled: an exchange running for 1 min, one off for ever.
function run({ state = off, co2 = 650, rh = 90, b = bands, during, fan, faults, now = NOW } = {}) {
  const full = { exchangeSince: state.exchange ? now - 60_000 : null, exchangeEndedAt: null, cappedInRow: 0, humidifierSince: null, ...state };
  return decide({ bands: b, state: full, readings: { rh, co2 }, faults, now, humidifierDuringExchange: during, acFan: fan });
}

test('air exchange: on at or above the upper limit, off at or below the lower, kept between', () => {
  const cases = [
    // [exchange before, co2, exchange after]
    [false, 749, false], [false, 750, true], [false, 900, true],
    [true, 601, true], [true, 600, false], [true, 300, false],
    [false, 700, false], [true, 700, true],
  ];
  for (const [before, co2, after] of cases) {
    const r = run({ state: { exchange: before, humidifier: false }, co2 });
    assert.equal(r.state.exchange, after, `co2 ${co2} from ${before}`);
    assert.equal(r.desired.intake, after);
    assert.equal(r.desired.exhaust, after);
  }
});

// Owner 2026-10-29: the switch points sit inside the band (web/band-math.js humidifierPoints): band 85–95 % RH, on at 86 %,
// off at 94 %.
test('humidifier: on at or below its on-point inside the band, off at or above its off-point, kept between', () => {
  const cases = [
    [false, 86.1, false], [false, 86, true], [false, 85.5, true], [false, 70, true],
    [true, 93.9, true], [true, 94, false], [true, 95, false], [true, 99, false],
    [false, 90, false], [true, 90, true],
  ];
  for (const [before, rh, after] of cases) {
    const r = run({ state: { exchange: false, humidifier: before }, rh });
    assert.equal(r.state.humidifier, after, `rh ${rh} from ${before}`);
    assert.equal(r.desired.humidifier, after);
  }
});

test('humidifier during exchange on: the humidifier is on during an air exchange but its own band state is still tracked', () => {
  const wet = run({ state: { exchange: false, humidifier: false }, co2: 800, rh: 97, during: true });
  assert.equal(wet.desired.humidifier, true);
  assert.equal(wet.state.humidifier, false);
  assert.equal(wet.reasons.humidifier, 'Humidifier: on during air exchange');
  const dry = run({ state: { exchange: false, humidifier: false }, co2: 800, rh: 80, during: true });
  assert.equal(dry.state.humidifier, true);
  // The exchange ends with RH between the limits: the humidifier band state (on) stays.
  const after = run({ state: { exchange: true, humidifier: true }, co2: 590, rh: 90, during: true });
  assert.equal(after.state.exchange, false);
  assert.equal(after.desired.humidifier, true);
});

test('humidifier during exchange off: it follows its band alone while the exchange runs', () => {
  const wet = run({ state: { exchange: false, humidifier: true }, co2: 800, rh: 96, during: false });
  assert.equal(wet.desired.intake, true);
  assert.equal(wet.desired.humidifier, false);
  assert.equal(wet.state.humidifier, false);
  assert.equal(wet.reasons.humidifier, 'Humidifier: off (RH 96 %, at or over its off-point 94 %; not forced during air exchange)');
  const dry = run({ state: { exchange: true, humidifier: false }, co2: 800, rh: 84, during: false });
  assert.equal(dry.desired.humidifier, true);
  assert.equal(dry.reasons.humidifier, 'Humidifier: on (RH 84 %, at or under its on-point 86 %)');
  const between = run({ state: { exchange: true, humidifier: true }, co2: 800, rh: 90, during: false });
  assert.equal(between.desired.humidifier, true);
  assert.equal(between.reasons.humidifier, 'Humidifier kept on: RH 90 % between its on-point 86 % and off-point 94 %');
  const gone = run({ state: { exchange: true, humidifier: false }, co2: 800, rh: null, during: false });
  assert.equal(gone.desired.humidifier, false);
  assert.equal(gone.reasons.humidifier, 'Humidity sensor not answering: humidifier kept off');
  // without an exchange nothing differs; true forces it on; the default is off (fresh Malaysian air is wet enough)
  assert.equal(run({ state: { exchange: false, humidifier: false }, rh: 96, during: false }).reasons.humidifier, 'Humidifier: RH 96 %, at or over its off-point 94 %');
  assert.equal(run({ co2: 800, rh: 96, during: true }).desired.humidifier, true);
  assert.equal(run({ co2: 800, rh: 96 }).desired.humidifier, false);
  assert.equal(DEFAULTS.humidifierDuringExchange, false);
});

test('aircon: power on, cool, auto fan, setpoint in the middle of the band', () => {
  const r = run();
  assert.deepEqual(r.desired.ac, { power: true, mode: 'cool', setpoint: 22, fan: 'auto' });
  assert.equal(run({ b: { ...bands, tLow: 20, tHigh: 25 } }).desired.ac.setpoint, 22.5);
  assert.equal(run({ b: { ...bands, tLow: 20, tHigh: 25.2 } }).desired.ac.setpoint, 22.5); // 22.6 rounds to 22.5
  assert.equal(run({ b: { ...bands, tLow: 20, tHigh: 25.5 } }).desired.ac.setpoint, 23); // 22.75 rounds to 23
});

test('aircon: 5 degrees lower during an air exchange, clamped to 16-30, rounded to 0.5', () => {
  const ex = { exchange: true, humidifier: false };
  assert.equal(run({ state: ex, co2: 700 }).desired.ac.setpoint, 17);
  assert.equal(run({ state: ex, co2: 700, b: { ...bands, tLow: 17, tHigh: 18 } }).desired.ac.setpoint, 16); // 12.5 clamps
  assert.equal(run({ b: { ...bands, tLow: 16, tHigh: 17 } }).desired.ac.setpoint, 16.5);
  assert.equal(run({ b: { ...bands, tLow: 34, tHigh: 35 } }).desired.ac.setpoint, 30); // 34.5 clamps
  assert.equal(run({ state: ex, co2: 700, b: { ...bands, tLow: 34, tHigh: 35 } }).desired.ac.setpoint, 29.5);
  assert.match(run({ state: ex, co2: 700 }).reasons.ac, /17\.0 °C \(22\.0 − 5 during air exchange\)/);
});

test('circulation is always on', () => {
  assert.equal(run().desired.circulation, true);
  assert.equal(run({ co2: null, rh: null }).desired.circulation, true);
  assert.equal(run().reasons.circulation, 'Circulation: always on');
});

test('a missing CO2 reading keeps the air exchange state and says so', () => {
  for (const exchange of [false, true]) {
    const r = run({ state: { exchange, humidifier: false }, co2: null, rh: 90 });
    assert.equal(r.state.exchange, exchange);
    assert.equal(r.desired.intake, exchange);
    assert.equal(r.reasons.exchange, `CO₂ reading not usable: air exchange kept ${exchange ? 'on' : 'off'}`);
  }
});

test('a missing RH reading keeps the humidifier state and says so; the exchange still runs', () => {
  for (const humidifier of [false, true]) {
    const r = run({ state: { exchange: false, humidifier }, co2: 650, rh: null });
    assert.equal(r.state.humidifier, humidifier);
    assert.equal(r.desired.humidifier, humidifier);
    assert.equal(r.reasons.humidifier, `Humidity sensor not answering: humidifier kept ${humidifier ? 'on' : 'off'}`);
  }
  const r = run({ state: off, co2: 800, rh: null, during: true });
  assert.equal(r.desired.intake, true);
  assert.equal(r.desired.humidifier, true);
});

test('aircon fan follows the room setting, auto when none is given', () => {
  assert.equal(run().desired.ac.fan, 'auto');
  for (const fan of ['auto', 'low', 'high']) assert.equal(run({ fan }).desired.ac.fan, fan);
  assert.equal(run({ fan: 'low', co2: 800 }).desired.ac.fan, 'low'); // also during an air exchange
  assert.equal(run({ fan: 'low' }).reasons.ac, 'Aircon: 22.0 °C (middle of 21–23 °C), fan low');
  assert.equal(run({ fan: 'high' }).reasons.ac, 'Aircon: 22.0 °C (middle of 21–23 °C), fan high');
  assert.equal(run({ fan: 'auto' }).reasons.ac, 'Aircon: 22.0 °C (middle of 21–23 °C)');
  assert.equal(run({ fan: 'low', co2: 800 }).reasons.ac, 'Aircon: 17.0 °C (22.0 − 5 during air exchange), fan low');
});

test('aircon drop: none for a new room (acDrop 0 or missing), any 0 to 10 °C as set', () => {
  for (const acDrop of [0, undefined]) {
    const r = run({ co2: 800, b: { ...bands, acDrop } });
    assert.equal(r.desired.ac.setpoint, 22);
    assert.equal(r.reasons.ac, 'Aircon: 22.0 °C (middle of 21–23 °C)');
  }
  const two = run({ co2: 800, b: { ...bands, acDrop: 2.5 } });
  assert.equal(two.desired.ac.setpoint, 19.5);
  assert.equal(two.reasons.ac, 'Aircon: 19.5 °C (22.0 − 2.5 during air exchange)');
  assert.equal(validateControl({ ...DEFAULTS, acDrop: 10 }), null);
  for (const acDrop of [-0.5, 10.5, '5', null]) {
    assert.deepEqual(validateControl({ ...DEFAULTS, acDrop }), { error: 'Aircon lower during air exchange must be a number from 0 to 10 °C', field: 'acDrop' });
  }
  assert.equal(DEFAULTS.acDrop, 0);
  // a CO2 lower limit below 450 ppm cannot be reached with outdoor air
  assert.deepEqual(validateControl({ ...DEFAULTS, co2Low: 449 }), { error: 'Air exchange stop point must be a number from 450 to 5000 ppm', field: 'co2Low' });
});

test('reasons name the rule and the numbers', () => {
  assert.equal(run({ co2: 762 }).reasons.exchange, 'Air exchange: CO₂ 762 ppm, at or over 750 ppm');
  assert.equal(run({ state: { exchange: true, humidifier: false }, co2: 590 }).reasons.exchange, 'Air exchange: CO₂ 590 ppm, at or under 600 ppm');
  assert.equal(run({ co2: 700 }).reasons.exchange, 'Air exchange kept off: CO₂ 700 ppm between 600 and 750 ppm');
  assert.equal(run({ rh: 80 }).reasons.humidifier, 'Humidifier: RH 80 %, at or under its on-point 86 %');
  assert.equal(run({ rh: 96 }).reasons.humidifier, 'Humidifier: RH 96 %, at or over its off-point 94 %');
  assert.equal(run({ rh: 90 }).reasons.humidifier, 'Humidifier kept off: RH 90 % between its on-point 86 % and off-point 94 %');
  assert.equal(run().reasons.ac, 'Aircon: 22.0 °C (middle of 21–23 °C)');
});

test('decide does not change its input', () => {
  const state = { exchange: false, humidifier: false };
  decide({ bands, state, readings: { co2: 800, rh: 80 }, now: NOW });
  assert.deepEqual(state, off);
});

test('validateControl: defaults are valid; each field and the low < high check', () => {
  assert.equal(validateControl(DEFAULTS), null);
  const bad = (patch) => validateControl({ ...DEFAULTS, ...patch });
  assert.deepEqual(bad({ auto: 1 }), { error: 'auto must be true or false', field: 'auto' });
  assert.deepEqual(bad({ acFan: 'medium' }), { error: 'Aircon fan must be auto, low or high', field: 'acFan' });
  assert.equal(bad({ acFan: undefined }).field, 'acFan');
  for (const acFan of ['auto', 'low', 'high']) assert.equal(bad({ acFan }), null);
  assert.deepEqual(bad({ humidifierDuringExchange: 'yes' }),
    { error: 'humidifierDuringExchange must be true or false', field: 'humidifierDuringExchange' });
  assert.equal(bad({ co2Low: 299 }).field, 'co2Low');
  assert.equal(bad({ co2High: 5001 }).field, 'co2High');
  assert.equal(bad({ tLow: 15.9 }).field, 'tLow');
  assert.equal(bad({ tHigh: 35.1 }).field, 'tHigh');
  assert.equal(bad({ rhLow: 39 }).field, 'rhLow');
  assert.equal(bad({ rhHigh: 101 }).field, 'rhHigh');
  assert.equal(bad({ rhHigh: '95' }).field, 'rhHigh');
  assert.equal(bad({ tLow: NaN }).field, 'tLow');
  assert.deepEqual(bad({ co2Low: 800 }), { error: 'Air exchange stop point must be below the start point', field: 'co2Low' });
  assert.equal(bad({ tLow: 23 }).field, 'tLow');
  assert.equal(bad({ rhLow: 95 }).field, 'rhLow');
  assert.equal(bad({ co2Low: 450, co2High: 5000, tLow: 16, tHigh: 35, rhLow: 40, rhHigh: 100, co2Safety: 5001 }), null);
});

// Critique 2026-10-29: "RH 88.7 % ≤ 90 %" was the only maths among reasons in words; CO₂ thousands grouped like everywhere.
test('reasons say at or over / at or under in words, never a maths sign, and group a CO₂ in thousands', async () => {
  const { readFileSync } = await import('node:fs');
  const code = readFileSync(new URL('../server/controller.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /[≤≥]/);
  assert.doesNotMatch(code, /toLocaleString/, 'decide() runs every step of a simulation: Intl formatting there made the simulations time out');
  const big = { ...bands, co2Low: 1000, co2High: 1400, co2Safety: 3000 };
  assert.equal(run({ co2: 1200, b: big }).reasons.exchange, 'Air exchange kept off: CO₂ 1,200 ppm between 1,000 and 1,400 ppm');
  assert.equal(run({ co2: 1450.4, b: big }).reasons.exchange, 'Air exchange: CO₂ 1,450.4 ppm, at or over 1,400 ppm');
  assert.equal(run({ state: { exchange: true, humidifier: false }, co2: 1500, b: { ...big, exchangeMaxMin: 60 } }).reasons.exchange,
    'Air exchange: CO₂ 1,500 ppm, at or over 1,400 ppm');
});

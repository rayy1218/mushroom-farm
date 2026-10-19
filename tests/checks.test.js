// Sensor checks (server/checks.js, spec 2026-10-19-safety-and-history-design.md section 1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSensorChecks } from '../server/checks.js';

const MIN = 60_000;
const START = 1_000_000_000;

// A checker with a clock the test moves; each call below is one cycle `step` ms after the one before.
function setup(step = 5000) {
  const checks = createSensorChecks();
  let at = START;
  const cycle = (kind, values, ctx = {}, ok = true) => {
    at += step;
    return checks.check(1, kind, { at, ok, ...values }, ctx);
  };
  return {
    checks,
    at: () => at,
    skip: (ms) => { at += ms; },
    trh: (t, rh, ctx) => cycle('trh', { t, rh }, ctx),
    co2: (co2, ctx) => cycle('co2', { co2 }, ctx),
    failed: (kind) => cycle(kind, {}, {}, false),
  };
}

test('a normal reading is ok', () => {
  const s = setup();
  const r = s.trh(22, 90);
  assert.deepEqual([r.ok, r.why, r.fault, r.faultWhy], [true, null, false, null]);
  assert.equal(s.co2(650).ok, true);
});

test('no reading: a failed poll is bad with its text', () => {
  const s = setup();
  const r = s.failed('co2');
  assert.deepEqual([r.ok, r.why], [false, 'no reading']);
  assert.equal(s.failed('trh').parts.rh.why, 'no reading');
});

test('range: T -10 to 60, RH 1 to 100, CO2 300 to 10000', () => {
  const cases = [
    ['trh', { t: -10.1, rh: 90 }, false], ['trh', { t: -10, rh: 90 }, true],
    ['trh', { t: 60, rh: 90 }, true], ['trh', { t: 60.1, rh: 90 }, false],
    ['trh', { t: 22, rh: 0.9 }, false], ['trh', { t: 22, rh: 1 }, true],
    ['trh', { t: 22, rh: 100.1 }, false],
    ['co2', { co2: 299 }, false], ['co2', { co2: 300 }, true],
    ['co2', { co2: 10000 }, true], ['co2', { co2: 10001 }, false],
  ];
  for (const [kind, values, ok] of cases) {
    const r = setup().checks.check(1, kind, { at: START, ok: true, ...values });
    assert.equal(r.ok, ok, JSON.stringify(values));
    if (!ok) assert.equal(r.why, 'value out of range');
  }
});

test('T and RH are checked separately; the probe result holds both', () => {
  const s = setup();
  const r = s.trh(70, 90);
  assert.deepEqual([r.ok, r.parts.t.ok, r.parts.rh.ok], [false, false, true]);
  assert.equal(r.why, 'value out of range');
});

test('sudden jump: T 2 degrees, RH 15 %, CO2 1000 ppm per minute', () => {
  const s = setup(MIN);
  s.trh(22, 90);
  s.co2(650);
  assert.equal(s.trh(23.9, 90).ok, true, '1.9 °C in a minute is fine');
  assert.equal(s.trh(26.5, 90).why, 'sudden jump');
  assert.equal(s.trh(26.5, 70).parts.rh.why, 'sudden jump', 'RH fell 20 % in a minute');
  assert.equal(s.co2(1600).ok, true, '950 ppm in a minute');
  assert.equal(s.co2(2700).why, 'sudden jump');
});

test('the rate is per minute: a slow change over a long gap is fine', () => {
  const s = setup(10 * MIN);
  s.co2(650);
  assert.equal(s.co2(5000).ok, true, '435 ppm/min');
});

test('a jump is accepted when 3 readings in a row agree', () => {
  const s = setup();
  s.co2(650);
  assert.equal(s.co2(1200).why, 'sudden jump'); // 6600 ppm/min
  assert.equal(s.co2(1210).why, 'sudden jump'); // agrees with the one before: second
  const third = s.co2(1215);
  assert.equal(third.ok, true, 'the third agreeing reading is accepted');
  assert.equal(s.co2(1220).ok, true, 'and the new level is the normal one');
  assert.equal(third.fault, false, 'only 2 bad readings: no fault');
});

test('readings that disagree do not add up to a jump', () => {
  const s = setup();
  s.co2(650);
  assert.equal(s.co2(1200).ok, false);
  assert.equal(s.co2(2500).ok, false);
  assert.equal(s.co2(1500).ok, false);
  assert.equal(s.co2(1500).ok, false);
  assert.equal(s.co2(1500).ok, true);
});

test('a reading back near the last good value ends a pending jump', () => {
  const s = setup();
  s.co2(650);
  s.co2(1200);
  assert.equal(s.co2(655).ok, true);
  assert.equal(s.co2(1200).why, 'sudden jump', 'the count starts again');
});

test('a falling CO2 is not tested while an air exchange runs or just after', () => {
  const s = setup();
  s.co2(1500);
  assert.equal(s.co2(700, { exchangeRecent: true }).ok, true);
  const s2 = setup();
  s2.co2(1500);
  assert.equal(s2.co2(700).why, 'sudden jump');
  const s3 = setup();
  s3.co2(700);
  assert.equal(s3.co2(1900, { exchangeRecent: true }).why, 'sudden jump', 'a rise is still tested');
});

test('frozen: the same value for 120 min (T, RH) and 60 min (CO2)', () => {
  const s = setup(5 * MIN);
  let r;
  for (let i = 0; i < 24; i++) r = s.trh(22, 90); // 24 readings, 5 min apart: 115 min
  assert.equal(r.ok, true);
  r = s.trh(22, 90); // 120 min
  assert.equal(r.parts.t.why, 'value does not change (frozen)');
  assert.equal(r.parts.rh.why, 'value does not change (frozen)');
  assert.equal(r.why, 'value does not change (frozen)');
  const c = setup(5 * MIN);
  for (let i = 0; i < 12; i++) r = c.co2(650);
  assert.equal(r.ok, true);
  assert.equal(c.co2(650).why, 'value does not change (frozen)');
});

test('a changing value is never frozen; a change restarts the time', () => {
  const s = setup(5 * MIN);
  for (let i = 0; i < 40; i++) assert.equal(s.co2(650 + (i % 2)).ok, true);
  const f = setup(5 * MIN);
  for (let i = 0; i < 11; i++) f.co2(650);
  f.co2(651);
  for (let i = 0; i < 11; i++) assert.equal(f.co2(651).ok, true);
});

test('RH of 99.9 or more is never frozen', () => {
  const s = setup(5 * MIN);
  let r;
  for (let i = 0; i < 40; i++) r = s.trh(22 + (i % 2) * 0.1, 100);
  assert.equal(r.parts.rh.ok, true);
});

test('RH is frozen after 30 min while the humidifier is commanded on', () => {
  const s = setup(5 * MIN);
  let r;
  for (let i = 0; i < 6; i++) r = s.trh(22 + i * 0.1, 90, { humidifierOn: true });
  assert.equal(r.parts.rh.ok, true, '25 min');
  r = s.trh(22.6, 90, { humidifierOn: true });
  assert.equal(r.parts.rh.why, 'value does not change (frozen)');
  assert.equal(r.parts.t.ok, true);
  const off = setup(5 * MIN);
  for (let i = 0; i < 8; i++) r = off.trh(22 + i * 0.1, 90, { humidifierOn: false });
  assert.equal(r.parts.rh.ok, true);
});

test('3 bad readings in a row make a fault; the next good reading ends it', () => {
  const s = setup();
  s.co2(650);
  assert.equal(s.failed('co2').fault, false);
  assert.equal(s.failed('co2').fault, false);
  const r = s.failed('co2');
  assert.deepEqual([r.fault, r.faultWhy], [true, 'no reading']);
  assert.equal(s.failed('co2').fault, true);
  const good = s.co2(655);
  assert.deepEqual([good.ok, good.fault, good.faultWhy], [true, false, null]);
});

test('a good reading between bad ones restarts the count', () => {
  const s = setup();
  s.failed('co2');
  s.failed('co2');
  s.co2(650);
  assert.equal(s.failed('co2').fault, false);
  assert.equal(s.failed('co2').fault, false);
});

test('the fault text is the reason of the latest bad reading; the probe is faulty when either value is', () => {
  const s = setup();
  s.trh(22, 90);
  s.trh(70, 90);
  s.trh(70, 90);
  const r = s.trh(70, 90);
  assert.deepEqual([r.fault, r.faultWhy, r.parts.t.fault, r.parts.rh.fault], [true, 'value out of range', true, false]);
});

test('get returns the last result of each kind, null before the first; forget drops them', () => {
  const s = setup();
  assert.deepEqual(s.checks.get(1), { trh: null, co2: null });
  s.co2(650);
  assert.equal(s.checks.get(1).co2.ok, true);
  assert.equal(s.checks.get(1).trh, null);
  s.checks.forget(1);
  assert.deepEqual(s.checks.get(1), { trh: null, co2: null });
  s.co2(650);
  s.trh(22, 90);
  s.checks.forget(1, 'co2');
  assert.equal(s.checks.get(1).co2, null);
  assert.equal(s.checks.get(1).trh.ok, true);
});

test('rooms are independent', () => {
  const checks = createSensorChecks();
  for (let i = 0; i < 3; i++) checks.check(1, 'co2', { at: START + i, ok: false });
  assert.equal(checks.check(2, 'co2', { at: START, ok: true, co2: 650 }).fault, false);
  assert.equal(checks.get(1).co2.fault, true);
});

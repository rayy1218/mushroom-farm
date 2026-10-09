// air.js: ClimateAir (contract C9 section 3).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../air.js');
const A = globalThis.ClimateAir;

// 60 m³ room, 420 ppm outside, 6000 blocks at 45 mL/h = 0.27 m³/h of CO2, purge 900 → 700 ppm.
const ROOM = { volume: 60, co2Out: 420, prodM3h: 0.27, start: 900, stop: 700 };

test('module shape: frozen, sizes, min points', () => {
  assert.ok(Object.isFrozen(A));
  assert.ok(Object.isFrozen(A.SIZES));
  assert.deepEqual([...A.SIZES], [600, 900, 1200, 1800, 2400, 3600]);
  assert.equal(A.MIN_POINTS, 4);
});

test('steadyPpm: outside plus output over flow; no flow is Infinity', () => {
  assert.equal(A.steadyPpm({ co2Out: 420, prodM3h: 0.27, flowM3h: 900 }), 720);
  assert.equal(A.steadyPpm({ co2Out: 420, prodM3h: 0.27, flowM3h: 0 }), Infinity);
});

test('purgeTimeS: hand calculation at 1800 m³/h', () => {
  const css = 420 + 0.27e6 / 1800;                                  // 570 ppm
  const want = 60 / 1800 * Math.log((900 - css) / (700 - css)) * 3600;
  assert.ok(Math.abs(A.purgeTimeS({ ...ROOM, m3h: 1800 }) - want) < 1e-9);
  assert.ok(Math.abs(want - 111.8) < 0.1);                           // about 1.9 min
});

test('purgeTimeS: leakage adds to the flow', () => {
  assert.ok(A.purgeTimeS({ ...ROOM, m3h: 1200, leakM3h: 24 }) < A.purgeTimeS({ ...ROOM, m3h: 1200 }));
});

test('purgeTimeS: never reaches the stop level, no flow, already below', () => {
  assert.equal(A.purgeTimeS({ ...ROOM, m3h: 900 }), Infinity);      // steady 720 ppm ≥ 700
  assert.equal(A.purgeTimeS({ ...ROOM, m3h: 0 }), Infinity);
  assert.equal(A.purgeTimeS({ ...ROOM, m3h: 1800, start: 650 }), 0);
});

test('sizeFor: smallest multiple of 50 that meets the cap, with size and margin', () => {
  const r = A.sizeFor({ ...ROOM, capS: 180 });
  assert.equal(r.needM3h % 50, 0);
  assert.ok(A.purgeTimeS({ ...ROOM, m3h: r.needM3h }) <= 180);
  assert.ok(A.purgeTimeS({ ...ROOM, m3h: r.needM3h - 50 }) > 180);
  assert.ok(r.needM3h >= 1350 && r.needM3h <= 1500);                 // spec table: about 1,400 m³/h
  assert.equal(r.size, 1800);
  assert.equal(r.margin, 2400);
});

test('sizeFor: past the last size gives null size and margin; impossible gives Infinity', () => {
  const big = A.sizeFor({ ...ROOM, prodM3h: 3, capS: 60 });
  assert.ok(big.needM3h > 3600);
  assert.equal(big.size, null);
  assert.equal(big.margin, null);
  const last = A.sizeFor({ ...ROOM, capS: 180, sizes: [600, 1800] });
  assert.equal(last.size, 1800);
  assert.equal(last.margin, null);
  assert.equal(A.sizeFor({ ...ROOM, co2Out: 800, capS: 180 }).needM3h, Infinity);   // outside air above the stop level
});

test('riseRate: least-squares slope; too few points or no time spread is null', () => {
  const pts = [0, 30, 60, 90, 120].map(t => ({ t, C: 700 + 1.25 * t + (t === 60 ? 2 : 0) }));
  assert.ok(Math.abs(A.riseRate(pts) - 1.25) < 0.01);
  assert.equal(A.riseRate(pts.slice(0, 3)), null);
  assert.equal(A.riseRate([{ t: 5, C: 1 }, { t: 5, C: 2 }, { t: 5, C: 3 }, { t: 5, C: 4 }]), null);
  assert.equal(A.riseRate([{ t: 0, C: NaN }, { t: 30, C: 1 }, { t: 60, C: 2 }, { t: 90, C: 3 }]), null);
  assert.equal(A.riseRate(null), null);
});

test('prodFromRise: rise × volume, plus what the leakage carries out', () => {
  // 0.27 m³/h in 60 m³ is 4500 ppm/h = 1.25 ppm/s
  assert.ok(Math.abs(A.prodFromRise({ ratePpmS: 1.25, volume: 60, co2: 800, co2Out: 420 }) - 0.27) < 1e-12);
  assert.ok(Math.abs(A.prodFromRise({ ratePpmS: 1.25, volume: 60, leakM3h: 24, co2: 800, co2Out: 420 }) - (0.27 + 24 * 380e-6)) < 1e-12);
});

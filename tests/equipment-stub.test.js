// equipment.js prep 2.0 stub (docs/contracts/equipment.md 4.1, 4.3, 12.7). The Equipment stream replaces the file and
// this test with tests/equipment.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js');
require('../air.js');
require('../controller.js');
require('../runtime.js');
require('../capacity.js');
require('../cycle.js');
require('../equipment.js');
const E = globalThis.ClimateEquipment;

function deepFrozen(v) {
  if (v === null || typeof v !== 'object') return true;
  return Object.isFrozen(v) && Object.values(v).every(deepFrozen);
}

test('catalogue values (C8 4.1)', () => {
  assert.deepEqual(E.AC_SIZES, [
    { hp: 1, w: 2640 }, { hp: 1.5, w: 3500 }, { hp: 2, w: 5280 }, { hp: 2.5, w: 6810 },
    { hp: 3, w: 7910 }, { hp: 4, w: 10550 }, { hp: 5, w: 13480 }, { hp: 6, w: 16120 }]);
  assert.deepEqual(E.CONSTRUCTIONS, {
    zinc:     { label: 'Zinc sheet, no insulation', u: 8.5,   roof: true },
    brick115: { label: 'Brick 115 mm, plastered',   u: 2.1,   roof: false },
    brick230: { label: 'Brick 230 mm',              u: 2.2,   roof: false },
    eps50:    { label: 'EPS panel 50 mm',           u: 0.715, roof: true },
    eps75:    { label: 'EPS panel 75 mm',           u: 0.475, roof: true },
    eps100:   { label: 'EPS panel 100 mm',          u: 0.305, roof: true },
    pu50:     { label: 'PU panel 50 mm',            u: 0.38,  roof: true },
    pu75:     { label: 'PU panel 75 mm',            u: 0.275, roof: true },
    pu100:    { label: 'PU panel 100 mm',           u: 0.2,   roof: true },
  });
  assert.deepEqual(Object.keys(E.CONSTRUCTIONS), ['zinc', 'brick115', 'brick230', 'eps50', 'eps75', 'eps100', 'pu50', 'pu75', 'pu100']);
  assert.deepEqual(E.FOGGER_SIZES, [3, 6, 14, 24]);
  assert.deepEqual(E.AIR_SIZES, [600, 900, 1200, 1800, 2400, 3600]);
  assert.deepEqual(E.AIR_SIZES, [...globalThis.ClimateAir.SIZES]);
  assert.deepEqual(E.DEFAULTS, { ac_hp: 1.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 });
  assert.deepEqual(E.LIMITS, { ac_units: [1, 4], fog_lph: [0.5, 50], air_m3h: [50, 10000], height: [2, 6] });
  assert.equal(E.SOL_AIR_K, 26);
  assert.equal(E.MARGIN, 1.2);
  assert.deepEqual(E.SHARE, { poor: 40, fair: 25, freshAir: 45 });
  assert.deepEqual(E.RUNS, { ac: 6, margin: 1, fogger: 1, air: 1 });
  assert.equal(E.MAX_RUNS, 9);
  assert.equal(E.MAX_RUNS, E.RUNS.ac + E.RUNS.margin + E.RUNS.fogger + E.RUNS.air);
});

test('the catalogue is deep-frozen (C8 4.1)', () => {
  for (const k of ['AC_SIZES', 'CONSTRUCTIONS', 'FOGGER_SIZES', 'AIR_SIZES', 'DEFAULTS', 'LIMITS', 'SHARE', 'RUNS']) {
    assert.ok(deepFrozen(E[k]), k);
  }
  assert.throws(() => { 'use strict'; E.CONSTRUCTIONS.zinc.u = 1; }, TypeError);
  assert.equal(E.CONSTRUCTIONS.zinc.u, 8.5);
});

test('checkEquipment: valid input', () => {
  assert.deepEqual(E.checkEquipment(E.DEFAULTS), []);
  assert.deepEqual(E.checkEquipment({}), []);
  assert.deepEqual(E.checkEquipment({ ac_hp: 2.5, walls: 'eps50', roof: 'pu100' }), []);
  assert.deepEqual(E.checkEquipment({ walls: null, roof: undefined }), []);
});

test('checkEquipment: each row of C8 4.3', () => {
  for (const bad of [null, [], 'x', 3, undefined]) assert.deepEqual(E.checkEquipment(bad), ['equipment: must be an object']);
  assert.deepEqual(E.checkEquipment({ b: 1, ac_hp: 2, a: 2 }), ['b: unknown field', 'a: unknown field']);
  assert.deepEqual(E.checkEquipment({ ac_hp: '2' }), ['ac_hp: must be one of 1, 1.5, 2, 2.5, 3, 4, 5, 6']);
  assert.deepEqual(E.checkEquipment({ ac_hp: 7 }), ['ac_hp: must be one of 1, 1.5, 2, 2.5, 3, 4, 5, 6']);
  for (const v of [0, 5, 1.5, '1']) assert.deepEqual(E.checkEquipment({ ac_units: v }), ['ac_units: must be a whole number from 1 to 4']);
  for (const v of [0.4, 51, NaN, Infinity, '3']) assert.deepEqual(E.checkEquipment({ fog_lph: v }), ['fog_lph: must be a number from 0.5 to 50']);
  for (const v of [49, 10001, NaN, '1800']) assert.deepEqual(E.checkEquipment({ air_m3h: v }), ['air_m3h: must be a number from 50 to 10000']);
  for (const v of [1.9, 6.1, NaN, '3']) assert.deepEqual(E.checkEquipment({ height: v }), ['height: must be a number from 2 to 6']);
  assert.deepEqual(E.checkEquipment({ walls: 'wood', roof: null }), [
    'walls: must be one of zinc, brick115, brick230, eps50, eps75, eps100, pu50, pu75, pu100 or null',
    'walls and roof: set both or neither']);
  assert.deepEqual(E.checkEquipment({ walls: 'zinc', roof: 'brick115' }),
    ['roof: must be one of zinc, eps50, eps75, eps100, pu50, pu75, pu100 or null']);
  assert.deepEqual(E.checkEquipment({ walls: 'zinc' }), ['walls and roof: set both or neither']);
  assert.deepEqual(E.checkEquipment({ roof: 'zinc', walls: null }), ['walls and roof: set both or neither']);
});

test('checkEquipment: limits are inclusive', () => {
  assert.deepEqual(E.checkEquipment({ ac_units: 1, fog_lph: 0.5, air_m3h: 50, height: 2 }), []);
  assert.deepEqual(E.checkEquipment({ ac_units: 4, fog_lph: 50, air_m3h: 10000, height: 6 }), []);
  assert.deepEqual(E.checkEquipment({ ac_hp: 1 }), []);
  assert.deepEqual(E.checkEquipment({ ac_hp: 6 }), []);
});

test('checkEquipment: several problems, in table order', () => {
  const eq = { height: 9, walls: 'zinc', zz: 1, ac_hp: 9, fog_lph: 0 };
  assert.deepEqual(E.checkEquipment(eq), [
    'zz: unknown field',
    'ac_hp: must be one of 1, 1.5, 2, 2.5, 3, 4, 5, 6',
    'fog_lph: must be a number from 0.5 to 50',
    'height: must be a number from 2 to 6',
    'walls and roof: set both or neither']);
});

test('geometry, shell, plantOf, estimate, runCheckSteps, runCheck, runCheckAsync throw stub', () => {
  for (const name of ['geometry', 'shell', 'plantOf', 'estimate', 'runCheckSteps', 'runCheck', 'runCheckAsync']) {
    assert.throws(() => E[name]({}, {}, {}), { message: 'stub' }, name);
  }
});

test('the stub exports exactly the C8 2 names', () => {
  assert.deepEqual(Object.keys(E).sort(), [
    'AC_SIZES', 'AIR_SIZES', 'CONSTRUCTIONS', 'DEFAULTS', 'FOGGER_SIZES', 'LIMITS', 'MARGIN', 'MAX_RUNS', 'RUNS', 'SHARE', 'SOL_AIR_K',
    'checkEquipment', 'estimate', 'geometry', 'plantOf', 'runCheck', 'runCheckAsync', 'runCheckSteps', 'shell']);
});

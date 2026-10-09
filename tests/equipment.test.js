// Equipment check (equipment.js). Contract: docs/contracts/equipment.md
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js'); require('../cycle.js'); require('../equipment.js');
const EQ = globalThis.ClimateEquipment, CC = globalThis.ClimateController, SIM = globalThis.ClimateSim, CY = globalThis.ClimateCycle, CAP = globalThis.ClimateCapacity, AIR = globalThis.ClimateAir;

const room = eq => ({ name: 'Room 1', volume: 60, calib: null, equipment: { ...EQ.DEFAULTS, ...eq } });
const lm = n => [{ crop: 'lionsmane', blocks: n }];
const LM = () => { const s = CC.defaultSettings(); s.crop = 'lionsmane'; Object.assign(s.program.days, { spawn: 21, pinning: 5, fruiting: 8, rest: 14 }); s.program.flushes = 3; return s; };

function deepFrozen(v) {
  if (v === null || typeof v !== 'object') return true;
  return Object.isFrozen(v) && Object.values(v).every(deepFrozen);
}

test('EQ1 the catalogue (C8 4.1) is complete and frozen', () => {
  assert.deepEqual(EQ.AC_SIZES, [
    { hp: 1, w: 2640 }, { hp: 1.5, w: 3500 }, { hp: 2, w: 5280 }, { hp: 2.5, w: 6810 },
    { hp: 3, w: 7910 }, { hp: 4, w: 10550 }, { hp: 5, w: 13480 }, { hp: 6, w: 16120 }]);
  assert.deepEqual(Object.entries(EQ.CONSTRUCTIONS), Object.entries({
    zinc:     { label: 'Zinc sheet, no insulation', u: 8.5,   roof: true },
    brick115: { label: 'Brick 115 mm, plastered',   u: 2.1,   roof: false },
    brick230: { label: 'Brick 230 mm',              u: 2.2,   roof: false },
    eps50:    { label: 'EPS panel 50 mm',           u: 0.715, roof: true },
    eps75:    { label: 'EPS panel 75 mm',           u: 0.475, roof: true },
    eps100:   { label: 'EPS panel 100 mm',          u: 0.305, roof: true },
    pu50:     { label: 'PU panel 50 mm',            u: 0.38,  roof: true },
    pu75:     { label: 'PU panel 75 mm',            u: 0.275, roof: true },
    pu100:    { label: 'PU panel 100 mm',           u: 0.2,   roof: true },
  }));
  assert.deepEqual(EQ.AIR_SIZES, [600, 900, 1200, 1800, 2400, 3600]);
  assert.deepEqual(EQ.AIR_SIZES, [...AIR.SIZES]);
  assert.deepEqual(EQ.FOGGER_SIZES, [3, 6, 14, 24]);
  assert.deepEqual(EQ.DEFAULTS, { ac_hp: 1.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 });
  assert.equal(EQ.DEFAULTS.air_m3h, SIM.PLANT.air.m3h);
  assert.deepEqual(EQ.LIMITS, { ac_units: [1, 4], fog_lph: [0.5, 50], air_m3h: [50, 10000], height: [2, 6] });
  assert.equal(EQ.SOL_AIR_K, 26);
  assert.equal(EQ.MARGIN, 1.2);
  assert.deepEqual(EQ.SHARE, { poor: 40, fair: 25, freshAir: 45 });
  assert.deepEqual(EQ.RUNS, { ac: 6, margin: 1, fogger: 1, air: 1 });
  assert.equal(EQ.MAX_RUNS, 9);
  for (const k of ['AC_SIZES', 'CONSTRUCTIONS', 'FOGGER_SIZES', 'AIR_SIZES', 'DEFAULTS', 'LIMITS', 'SHARE', 'RUNS']) assert.ok(deepFrozen(EQ[k]), k);
  assert.throws(() => { 'use strict'; EQ.CONSTRUCTIONS.zinc.u = 1; }, TypeError);
  assert.deepEqual(Object.keys(EQ).sort(), [
    'AC_SIZES', 'AIR_SIZES', 'CONSTRUCTIONS', 'DEFAULTS', 'FOGGER_SIZES', 'LIMITS', 'MARGIN', 'MAX_RUNS', 'RUNS', 'SHARE', 'SOL_AIR_K',
    'checkEquipment', 'estimate', 'geometry', 'plantOf', 'runCheck', 'runCheckAsync', 'runCheckSteps', 'shell']);
});

test('EQ2 checkEquipment: each row of C8 4.3, in table order', () => {
  const ACS = 'ac_hp: must be one of 1, 1.5, 2, 2.5, 3, 4, 5, 6';
  for (const bad of [5, null, []]) assert.deepEqual(EQ.checkEquipment(bad), ['equipment: must be an object']);
  assert.deepEqual(EQ.checkEquipment({}), []);
  assert.deepEqual(EQ.checkEquipment(EQ.DEFAULTS), []);
  assert.deepEqual(EQ.checkEquipment({ ac_hp: 1.25 }), [ACS]);
  assert.deepEqual(EQ.checkEquipment({ ac_units: 0 }), ['ac_units: must be a whole number from 1 to 4']);
  assert.deepEqual(EQ.checkEquipment({ ac_units: 2.5 }), ['ac_units: must be a whole number from 1 to 4']);
  assert.deepEqual(EQ.checkEquipment({ fog_lph: 0.4 }), ['fog_lph: must be a number from 0.5 to 50']);
  assert.deepEqual(EQ.checkEquipment({ air_m3h: 20000 }), ['air_m3h: must be a number from 50 to 10000']);
  assert.deepEqual(EQ.checkEquipment({ air_m3h: 40 }), ['air_m3h: must be a number from 50 to 10000']);
  assert.deepEqual(EQ.checkEquipment({ height: 1.5 }), ['height: must be a number from 2 to 6']);
  assert.deepEqual(EQ.checkEquipment({ walls: 'wood', roof: 'zinc' }), ['walls: must be one of zinc, brick115, brick230, eps50, eps75, eps100, pu50, pu75, pu100 or null']);
  assert.deepEqual(EQ.checkEquipment({ walls: 'pu50', roof: 'brick115' }), ['roof: must be one of zinc, eps50, eps75, eps100, pu50, pu75, pu100 or null']);
  assert.deepEqual(EQ.checkEquipment({ walls: 'pu50' }), ['walls and roof: set both or neither']);
  assert.deepEqual(EQ.checkEquipment({ roof: 'pu50', walls: null }), ['walls and roof: set both or neither']);
  assert.deepEqual(EQ.checkEquipment({ colour: 'red' }), ['colour: unknown field']);
  assert.deepEqual(EQ.checkEquipment({ ac_hp: '2', x: 1 }), ['x: unknown field', ACS]);
  assert.deepEqual(EQ.checkEquipment({ ac_units: '1' }), ['ac_units: must be a whole number from 1 to 4']);
  assert.deepEqual(EQ.checkEquipment({ walls: null, roof: undefined }), []);
});

const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

test('EQ3 geometry and shell', () => {
  assert.deepEqual(EQ.geometry(60, 3), { floor: 20, walls: 54, roof: 20 });
  const a = EQ.shell({ walls: 'eps75', roof: 'eps75', height: 3 }, 120);
  assert.equal(a.floor, 40);
  assert.ok(near(a.walls, 76.3675, 1e-4), a.walls);
  assert.ok(near(a.ua, 55.2746, 1e-4), a.ua);
  assert.ok(near(a.solarPeakW, 494, 1e-9), a.solarPeakW);
  const b = EQ.shell({ walls: 'brick115', roof: 'zinc', height: 3 }, 60);
  assert.ok(near(b.ua, 283.4, 0.05), b.ua);
  assert.ok(near(b.solarPeakW, 4420, 1e-9), b.solarPeakW);
  assert.equal(EQ.shell({ walls: null, roof: null }, 60), null);
});

test('EQ4 plantOf', () => {
  const rm = { volume: 60, calib: null };
  const p = EQ.plantOf({ ac_hp: 3, ac_units: 1, fog_lph: 6, air_m3h: 600, walls: 'pu50', roof: 'pu50', height: 3 }, rm);
  assert.deepEqual(Object.keys(p).sort(), ['ac', 'fogger', 'loads', 'room']);
  assert.equal(p.ac.capW, 7910);
  assert.ok(near(p.ac.coilM3s, 0.3164, 1e-12), p.ac.coilM3s);
  assert.ok(near(p.ac.auxW, 79.1, 1e-12), p.ac.auxW);
  assert.equal(p.ac.standbyW, 3);
  assert.deepEqual(p.fogger.levels.map(l => l.gph), [0, 2000, 4000, 6000]);
  assert.deepEqual(p.fogger.levels.map(l => l.w), [0, 140, 270, 400]);
  assert.ok(near(p.room.ua, 28.12, 0.005), p.room.ua);
  assert.ok(near(p.loads.solarPeakW, 197.6, 1e-9), p.loads.solarPeakW);
  const c = EQ.plantOf({ walls: 'pu50', roof: 'pu50' }, { volume: 60, calib: { ua: 90, infAch: 0.4, moistBuffer: 3 } });
  assert.equal('room' in c, false); assert.equal('loads' in c, false);
  const d = EQ.plantOf({}, rm);
  assert.deepEqual(d.ac, { capW: 3500, coilM3s: 0.14, auxW: 35, standbyW: 3 });
  assert.deepEqual(d.fogger.levels, SIM.PLANT.fogger.levels);
  assert.equal('room' in d, false);
  assert.equal(EQ.plantOf({ ac_units: 2, ac_hp: 1 }, rm).ac.standbyW, 6);
});

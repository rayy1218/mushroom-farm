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

test('EQ5 estimate (C8 6)', () => {
  const w = (r, mix, settings, want) => {
    const e = EQ.estimate(r, mix, settings ? { settings } : {});
    assert.ok(Math.abs(e.needW - want.needW) <= 1, `${e.needW} vs ${want.needW}`);
    assert.equal(e.stage, want.stage);
    assert.equal(e.hp, want.hp);
    return e;
  };
  const e = w(room({ ac_hp: 1 }), lm(1000), LM(), { needW: 3442.3, stage: 'pinning', hp: 1.5 });
  for (const [st, v] of Object.entries({ spawn: 1823, pinning: 3442, fruiting: 3039, rest: 1845 })) assert.ok(Math.abs(e.perStage[st] - v) <= 1, `${st} ${e.perStage[st]}`);
  const ready = LM(); ready.farmType = 'ready';
  w(room({ ac_hp: 1 }), lm(1000), ready, { needW: 3038.6, stage: 'fruiting', hp: 1.5 });
  w(room({ ac_hp: 1, walls: 'zinc', roof: 'zinc' }), lm(1000), LM(), { needW: 16178.9, stage: 'pinning', hp: 6 });
  w(room({ ac_hp: 1, walls: 'pu50', roof: 'pu50' }), lm(1000), LM(), { needW: 2393.6, stage: 'pinning', hp: 1 });
  w(room({ ac_hp: 1, walls: 'pu75', roof: 'pu75' }), lm(1000), LM(), { needW: 2229.8, stage: 'pinning', hp: 1 });
  w(room(), lm(2500), undefined, { needW: 5969.8, stage: 'pinning', hp: 2.5 });
});

// ---------- fixtures for the scripted search tests ----------
const H = (fog = 1000, over = {}) => ({ walls: 1000, sun: 0, airSens: 1000, airLat: 1000, blockSens: 500, blockLat: 500, base: 100, lights: 100, people: 0, fog, water: 0, acSens: 3000, acLat: 1000, ...over });

function fakeResult({ inT = 99, fails = [], wet = 0, fog = 1000, heat = {}, segs = null } = {}) {
  const list = (segs || [{ stage: 'fruiting', flush: 1 }]).map((x, i) => {
    const f = x.fails ?? fails;
    return {
      stage: x.stage, flush: x.flush, startDay: i, days: 1, hours: 24,
      targets: { spT: x.stage === 'pinning' ? 17 : 20, spRH: 90, co2Lim: 1000, coreMax: 30 },
      inT: x.inT ?? inT, rhOk: 100, lowRhMin: 0, wet: x.wet ?? wet, co2Below: 100, maxCore: 22, alarms: {}, kwh: 100, rm: 57,
      fails: f, pass: f.length === 0, heat: H(fog, heat),
    };
  });
  const series = [];
  for (const sg of list) for (let h = 0; h < 24; h++) {
    series.push({ h: series.length, stage: sg.stage, flush: sg.flush, T: 20, RH: 90, CO2: 800, core: 22, kwh: 4, heat: Object.fromEntries(Object.entries(sg.heat).map(([k, v]) => [k, v / 24])) });
  }
  return {
    verdict: 'ok', stages: list, series,
    totals: { days: list.length, kwh: 100 * list.length, rm: 57 * list.length, rmPerBlock: 0.057, pass: list.every(x => x.pass) },
  };
}
const scripted = fn => function* (rm) { yield { day: 1, days: 1, stage: 'fruiting', flush: 1 }; return fakeResult(fn(rm.plant, rm)); };
const hpOf = p => EQ.AC_SIZES.find(s => s.w === p.ac.capW).hp;
const HOT = ['temperature too high'], CO2 = ['CO₂ above the limit'];
const sizes = r => r.runs.filter(x => x.kind === 'ac').map(x => x.ac_hp);
const check = (rm, mix, fn, extra = {}) => EQ.runCheck(rm, mix, { runCycleSteps: scripted(fn), ...extra });

test('EQ6 input errors, from the first next() and from runCheck', () => {
  const cases = [
    [() => [null, lm(1)], 'TypeError', 'runCheck: room must be an object', {}],
    [() => [room(), 'x'], 'TypeError', 'runCheck: mix must be a list', {}],
    [() => [{ ...room(), equipment: { ac_hp: 7 } }, lm(1)], 'TypeError', 'runCheck: ac_hp: must be one of 1, 1.5, 2, 2.5, 3, 4, 5, 6', {}],
    [() => [room(), lm(1)], 'TypeError', 'runCheck: settings must be an object', { settings: [] }],
    [() => [room(), lm(1)], 'TypeError', 'runCheck: tariff must be a number of at least 0', { tariff: -1 }],
    [() => [room(), lm(1)], 'Error', 'Unknown region: mars', { region: 'mars' }],
  ];
  for (const [args, name, message, opts] of cases) {
    const [r, m] = args();
    assert.throws(() => EQ.runCheckSteps(r, m, opts).next(), { name, message });
    assert.throws(() => EQ.runCheck(r, m, opts), { name, message });
  }
  assert.throws(() => EQ.runCheck(room(), lm(1), { settings: { f: () => 1 } }), { name: 'DataCloneError' });
  return assert.rejects(EQ.runCheckAsync(room(), 'x'), /mix must be a list/);
});

test('EQ7 an impossible mix returns at once', () => {
  let called = 0, progress = 0;
  const mix = [{ crop: 'lionsmane', blocks: 500 }, { crop: 'pink', blocks: 500 }];
  const r = EQ.runCheck(room(), mix, { runCycleSteps: () => { called++; }, onProgress: () => { progress++; } });
  assert.deepEqual(r, { verdict: 'impossible', why: CAP.commonTargets(mix).conflict });
  assert.deepEqual([called, progress], [0, 0]);
});

// ---------- the search (C8 7), lm(2500), no settings ----------
const AIRTXT = 'Your 1,800 m³/h air exchange is enough: a purge takes at most 1.3 min (pinning), the limit is 3 min.';
const FOGTXT = 'Your 3 L/h fogger is enough.';
const WALLS_TYPICAL = 'Walls and roof: good. They bring in 23 % of the heat. (Typical walls: set the walls and roof of this room for a better answer.)';
const FRESH = 'Most of the heat comes in with the fresh air (47 %: 23 % heat, 23 % water). Bring in only the fresh air the blocks need, and recover its coolness with an energy-recovery unit that also exchanges moisture before you buy a bigger aircond.';
const passFrom = (min, bad = { fails: HOT }) => p => (hpOf(p) >= min ? {} : bad);

test('S-UP walks up from the own size to the smallest that works', () => {
  const r = check(room({ ac_hp: 1 }), lm(2500), p => (hpOf(p) >= 3 ? {} : { fails: HOT, inT: 50 }));
  assert.deepEqual(sizes(r), [1, 2.5, 3]);
  assert.deepEqual([r.ac.min, r.ac.recommended, r.ac.noReserve, r.ac.verdict], [3, 3, null, 'too-small']);
  assert.equal(r.ac.text, "Your 1 hp aircond is too small for lion's mane. In fruiting 1 it keeps the room within 1 °C of 20 °C only 50 % of the time. You need at least 3 hp.");
});

const DOWN_TXT = "Your 1 hp aircond is too small for lion's mane. In fruiting 1 it keeps the room within 1 °C of 20 °C only 60 % of the time. You need at least 2 hp. Buy 2.5 hp for a margin on the hottest days.";
test('S-DOWN walks down from the estimate and recommends a margin', () => {
  const r = check(room({ ac_hp: 1 }), lm(2500), p => (hpOf(p) >= 2 ? {} : { fails: HOT, inT: 60 }));
  assert.deepEqual(sizes(r), [1, 1.5, 2, 2.5]);
  assert.deepEqual(r.runs.map(x => x.ac_hp), [1, 1.5, 2, 2.5]);
  assert.deepEqual([r.ac.min, r.ac.recommended], [2, 2.5]);
  assert.equal(r.ac.text, DOWN_TXT);
  assert.deepEqual(r.summary, [DOWN_TXT, FOGTXT, AIRTXT, WALLS_TYPICAL, FRESH]);
});

test('S-OWNBELOW an own size below the walk result wins', () => {
  const r = check(room({ ac_hp: 2 }), lm(2500), p => (hpOf(p) === 2.5 ? { fails: HOT, inT: 90 } : hpOf(p) >= 2 ? {} : { fails: HOT }));
  assert.deepEqual(sizes(r), [2, 2.5, 3]);
  assert.deepEqual([r.ac.min, r.ac.recommended, r.ac.noReserve, r.ac.verdict], [2, 2, 'too-big', 'enough']);
  assert.deepEqual(r.runs.map(x => x.tooBig), [false, true, false]);
  assert.equal(r.ac.text, "Your 2 hp aircond is enough for lion's mane: it keeps the room within 1 °C of 20 °C 99 % of fruiting hours. It is just enough: it has no reserve for the hottest days, but no bigger size holds this room steadier (2.5 hp is too big).");
  assert.equal(r.summary.length, 4);
});

test('S-NONE no size works', () => {
  const r = check(room({ ac_hp: 1 }), lm(2500), p => ({ fails: HOT, inT: 40 + 5 * hpOf(p) }));
  assert.deepEqual(sizes(r), [1, 2.5, 3, 4, 5, 6]);
  assert.deepEqual([r.ac.min, r.ac.recommended], [null, null]);
  assert.equal(r.ac.text, "Your 1 hp aircond is too small for lion's mane. In fruiting 1 it keeps the room within 1 °C of 20 °C only 45 % of the time. No aircond in the list holds the temperature in this room for the whole cycle: the best, 6 hp, keeps it 70 % of fruiting hours. Fix the room first (see the heat breakdown).");
});

test('S-NONEOWN no size works and the own size is the best', () => {
  const r = check(room({ ac_hp: 6 }), lm(2500), p => ({ fails: HOT, inT: hpOf(p) === 6 ? 80 : 40 + 5 * hpOf(p) }));
  assert.deepEqual(sizes(r), [2.5, 3, 4, 5, 6]);
  assert.equal(r.ac.text, "Your 6 hp aircond is too small for lion's mane. In fruiting 1 it keeps the room within 1 °C of 20 °C only 80 % of the time. No aircond in the list holds the temperature in this room for the whole cycle; none does better than yours (80 % of fruiting hours). Fix the room first (see the heat breakdown).");
});

test('S-OVER an aircond two steps above the recommendation is oversized', () => {
  const r = check(room({ ac_hp: 6 }), lm(2500), passFrom(2));
  assert.deepEqual(sizes(r), [1.5, 2, 2.5, 6]);
  assert.deepEqual([r.ac.min, r.ac.recommended, r.ac.verdict], [2, 2.5, 'oversized']);
  assert.equal(r.ac.text, 'Your 6 hp aircond is bigger than this room needs: 2.5 hp is enough. It works, but a too-big aircond switches on and off more often and takes less water out of the air.');
});

test('S-BIG a too-big own size that fails', () => {
  const r = check(room({ ac_hp: 5 }), lm(2500), p => (hpOf(p) === 5 ? { fails: HOT, inT: 94.6 } : hpOf(p) >= 2 ? {} : { fails: HOT }));
  assert.deepEqual(sizes(r), [1.5, 2, 2.5, 5]);
  assert.equal(r.ac.verdict, 'too-big');
  assert.deepEqual(r.runs.map(x => x.tooBig), [false, false, false, true]);
  assert.equal(r.ac.text, 'Your 5 hp aircond is too big for this room: it switches on and off and the room drifts out of the band (fruiting 1: 94.6 % in band, the pass line is 95 %). 2.5 hp holds it.');
});

test('S-COLD a too-big own size that cools the room below the band', () => {
  const r = check(room({ ac_hp: 6 }), lm(2500), p => (hpOf(p) === 6 ? { fails: ['temperature too low'], inT: 94.8 } : hpOf(p) >= 2 ? {} : { fails: HOT }));
  assert.deepEqual(sizes(r), [1.5, 2, 2.5, 6]);
  assert.equal(r.ac.verdict, 'too-big');
  assert.deepEqual(r.runs.map(x => x.tooBig), [false, false, false, true]);
  assert.equal(r.ac.text, 'Your 6 hp aircond is too big for this room: it switches on and off and the room drifts out of the band (fruiting 1: 94.8 % in band, the pass line is 95 %). 2.5 hp holds it.');
});

test('S-MARGCOLD a margin run that is too cold is never recommended', () => {
  const r = check(room({ ac_hp: 1 }), lm(2500), p => (hpOf(p) === 2.5 ? { fails: ['temperature too low'], inT: 94 } : hpOf(p) >= 2 ? {} : { fails: HOT, inT: 60 }));
  assert.deepEqual(sizes(r), [1, 1.5, 2, 2.5]);
  assert.deepEqual([r.ac.min, r.ac.recommended, r.ac.noReserve], [2, 2, 'too-big']);
  assert.deepEqual(r.runs.map(x => x.tooBig), [false, false, false, true]);
  assert.equal(r.ac.text, "Your 1 hp aircond is too small for lion's mane. In fruiting 1 it keeps the room within 1 °C of 20 °C only 60 % of the time. You need at least 2 hp. It is just enough: it has no reserve for the hottest days, but no bigger size holds this room steadier (2.5 hp is too big).");
  assert.equal(r.summary.length, 5);
  assert.equal(r.summary[4], r.breakdown.text);
});

test('S-JUST the own size is the minimum and the margin is one step up', () => {
  const r = check(room({ ac_hp: 2 }), lm(2500), passFrom(2));
  assert.deepEqual(sizes(r), [1.5, 2, 2.5]);
  assert.equal(r.ac.text, "Your 2 hp aircond is enough for lion's mane: it keeps the room within 1 °C of 20 °C 99 % of fruiting hours. It is just enough: on the hottest days it has no reserve. 2.5 hp gives a margin.");
});

test('S-UNITS several units of the own size', () => {
  const r = check(room({ ac_hp: 1, ac_units: 2 }), lm(2500), p => (p.ac.capW >= 5280 ? {} : { fails: HOT }));
  assert.deepEqual(sizes(r), [1, 1.5]);
  assert.deepEqual([r.ac.units, r.ac.min, r.ac.recommended], [2, 1, 1.5]);
  assert.equal(r.ac.text, "Your 2 × 1 hp aircond is enough for lion's mane: it keeps the room within 1 °C of 20 °C 99 % of fruiting hours. It is just enough: on the hottest days it has no reserve. 2 × 1.5 hp gives a margin.");
});

test('S-CORE a hot block core in the spawn run', () => {
  const r = check(room({ ac_hp: 1 }), lm(2500), p => (hpOf(p) >= 2 ? {} : { fails: ['block core too hot'], inT: 99 }));
  assert.deepEqual(sizes(r), [1, 1.5, 2, 2.5]);
  assert.equal(r.ac.text, "Your 1 hp aircond is too small for lion's mane. In the spawn run the block core gets too hot. You need at least 2 hp. Buy 2.5 hp for a margin on the hottest days.");
});

test('S-LARGEST the largest size is the minimum: no reserve, fix the room', () => {
  const r = check(room({ ac_hp: 1, walls: 'zinc', roof: 'zinc' }), lm(1000), p => (hpOf(p) >= 6 ? {} : { fails: HOT, inT: 50 }), { settings: LM() });
  assert.equal(r.estimate.hp, 6);
  assert.deepEqual(sizes(r), [1, 5, 6]);
  assert.deepEqual([r.ac.min, r.ac.recommended, r.ac.noReserve], [6, 6, 'largest']);
  const t = "Your 1 hp aircond is too small for lion's mane. In fruiting 1 it keeps the room within 1 °C of 20 °C only 50 % of the time. You need at least 6 hp. It has no reserve for the hottest days: fix the room first (see the heat breakdown).";
  assert.equal(r.ac.text, t);
  assert.deepEqual(r.summary, [t, FOGTXT, 'Your 1,800 m³/h air exchange is enough: a purge takes at most 1.2 min (pinning), the limit is 3 min.', 'Walls and roof: good. They bring in 23 % of the heat.', r.breakdown.text]);
});

// ---------- fogger, wet, walls and roof, breakdown (C8 7.6, 8.3, 8.5 to 8.8, 9) ----------
const ENOUGH25 = "Your 2.5 hp aircond is enough for lion's mane: it keeps the room within 1 °C of 20 °C 99 % of fruiting hours.";
const from2 = (good, bad = { fails: HOT }) => p => (hpOf(p) >= 2 ? good(p) : bad);

test('S-FOG a fogger that is too small is confirmed by one run', () => {
  const r = check(room({ ac_hp: 2.5 }), lm(2500), from2(p => (p.fogger.levels[3].gph >= 6000 ? {} : { fails: ['humidity too low'] })));
  assert.deepEqual(sizes(r), [1.5, 2, 2.5]);
  assert.deepEqual([r.ac.min, r.ac.recommended], [2, 2.5]);
  assert.equal(r.ac.text, ENOUGH25);
  assert.deepEqual([r.runs.at(-1).kind, r.runs.at(-1).fog_lph, r.runs.at(-1).ac_hp], ['fogger', 6, 2.5]);
  assert.deepEqual([r.fogger.verdict, r.fogger.recommended], ['too-small', 6]);
  assert.equal(r.fogger.text, 'Your 3 L/h fogger is too small: the air gets too dry in fruiting. A 6 L/h fogger keeps the humidity up.');
});

test('S-FOGNO a bigger fogger does not fix a room the aircond dries', () => {
  const r = check(room({ ac_hp: 2.5 }), lm(2500), from2(p => (p.fogger.levels[3].gph >= 6000 ? { fails: ['humidity too low', 'temperature too low'] } : { fails: ['humidity too low'] })));
  assert.deepEqual([r.fogger.verdict, r.fogger.tried], ['not-the-fix', 6]);
  assert.equal(r.fogger.text, 'The air gets too dry in fruiting, and a 6 L/h fogger does not fix it: the aircond runs so hard that it dries the air. Fix the heat first (see the heat breakdown).');
});

test('S-FOGBIG a fogger that is bigger than needed', () => {
  const r = check(room({ ac_hp: 2.5, fog_lph: 14 }), lm(2500), from2(() => ({ fog: 24000 })));
  assert.equal(r.fogger.verdict, 'oversized');
  assert.equal(r.fogger.recommended, 3);
  assert.ok(Math.abs(r.fogger.peak - 1.469) < 0.001, r.fogger.peak);
  assert.equal(r.fogger.text, 'Your 14 L/h fogger is bigger than needed: it never used more than 1.5 L/h in an hour. It works; a 3 L/h fogger would do.');
});

const WET_TXT = 'The room is too wet in fruiting 1 (above 95 % RH 24 % of the time). A bigger aircond does not fix this: the outside air brings in more water than the aircond can take out without making the room too cold. Dry the fresh air before it comes in: an energy-recovery unit with a moisture-exchanging core (enthalpy wheel or hygroscopic core), a fresh-air dehumidifier, or add a dehumidifier in the room.';
test('S-WET a room that is too wet gets its own line, and the summary has six', () => {
  const r = check(room({ ac_hp: 2.5 }), lm(2500), from2(() => ({ fails: ['humidity near saturation'], wet: 24.1 })));
  assert.deepEqual(r.wet.stages, [{ stage: 'fruiting', flush: 1, wet: 24.1, limit: 95 }]);
  assert.deepEqual(r.summary, [ENOUGH25, WET_TXT, FOGTXT, AIRTXT,
    'Walls and roof: good. They bring in 23 % of the heat. An insulated room also needs drier fresh air. (Typical walls: set the walls and roof of this room for a better answer.)', FRESH]);
});

test('S-WET2 each wet segment prints with its own line', () => {
  const segs = [{ stage: 'pinning', flush: 1, wet: 16, fails: ['humidity near saturation'] }, { stage: 'fruiting', flush: 1, wet: 15, fails: ['humidity near saturation'] }];
  const r = check(room({ ac_hp: 2.5 }), lm(2500), from2(() => ({ segs })));
  assert.deepEqual(r.wet.stages, [{ stage: 'pinning', flush: 1, wet: 16, limit: 98 }, { stage: 'fruiting', flush: 1, wet: 15, limit: 95 }]);
  assert.ok(r.wet.text.startsWith('The room is too wet in pinning 1 (above 98 % RH 16 % of the time) and fruiting 1 (above 95 % RH 15 % of the time).'), r.wet.text);
});

test('S-FAIR walls and roof that are fair, and the breakdown says a bigger aircond', () => {
  const r = check(room({ ac_hp: 2.5 }), lm(2500), from2(() => ({ heat: { walls: 2000 } })));
  assert.deepEqual([r.insulation.verdict, r.insulation.insulatedHp, r.insulation.uaSource], ['fair', 2, 'typical']);
  assert.equal(r.insulation.text, 'Walls and roof: fair. They bring in 38 % of the heat. With PU panel 75 mm walls and roof the room would need about 2 hp (quick estimate). (Typical walls: set the walls and roof of this room for a better answer.)');
  assert.equal(r.breakdown.advice, 'bigger-ac');
  assert.equal(r.breakdown.text, 'The heat comes mostly from the blocks and the room itself, not from the walls or the fresh air: a bigger aircond is the right fix.');
});

test('S-FAIRWET fair walls in a wet room', () => {
  const r = check(room({ ac_hp: 2.5 }), lm(2500), from2(() => ({ heat: { walls: 2000 }, fails: ['humidity near saturation'], wet: 24.1 })));
  assert.equal(r.insulation.text, 'Walls and roof: fair. They bring in 38 % of the heat. With PU panel 75 mm walls and roof the room would need about 2 hp (quick estimate). An insulated room also needs drier fresh air. (Typical walls: set the walls and roof of this room for a better answer.)');
  assert.equal(r.summary.length, 6);
  assert.equal(r.summary[5], r.breakdown.text);
  assert.equal(r.breakdown.advice, 'bigger-ac');
});

test('S-POOR poor walls and roof: insulate first', () => {
  const r = check(room({ ac_hp: 2.5 }), lm(2500), from2(() => ({ heat: { walls: 3000 } })));
  assert.equal(r.insulation.verdict, 'poor');
  assert.equal(r.insulation.text, 'Walls and roof: poor. They bring in 48 % of the heat. With PU panel 75 mm walls and roof the room would need about 2 hp (quick estimate). (Typical walls: set the walls and roof of this room for a better answer.)');
  assert.equal(r.breakdown.advice, 'insulate');
  assert.equal(r.breakdown.text, 'Most of the heat comes through the walls and roof (48 %). Insulate before you buy a bigger aircond.');
});

// ---------- air exchange (C8 8.4, 7.6), own aircond 1.5 hp, every run passes unless noted ----------
const air = (eq, mix, fn = () => ({}), extra = {}) => check(room({ ac_hp: 1.5, ...eq }), mix, fn, extra);
const oyster6000 = [{ crop: 'oyster', blocks: 6000 }];
const READY = { settings: { ...CC.defaultSettings(), farmType: 'ready' } };

test('AIR-INF outside air alone cannot bring CO₂ down to the stop level', () => {
  const r = air({}, lm(7000000));
  assert.equal(r.air.verdict, 'too-small');
  assert.deepEqual([r.air.needM3h, r.air.recommended, r.air.stage, r.air.purgeS], [Infinity, null, 'pinning', Infinity]);
  assert.equal(r.air.text, 'Your 1,800 m³/h air exchange cannot bring CO₂ down to 700 ppm in pinning: outside air alone cannot bring CO₂ this low. Raise the stop level.');
});

test('AIR-NEVER a purge never reaches the stop level (C8 8.4 example 1)', () => {
  const r = air({ air_m3h: 900 }, oyster6000, undefined, READY);
  assert.deepEqual([r.air.verdict, r.air.needM3h, r.air.recommended, r.air.margin, r.air.stage, r.air.capS], ['too-small', 1450, 1800, 2400, 'fruiting', 180]);
  assert.equal(r.air.text, 'Your 900 m³/h air exchange is too small for 6,000 blocks in fruiting: a purge never brings CO₂ down to 700 ppm. Buy at least 1,450 m³/h; 1,800 m³/h gives a margin.');
});

test('AIR-SLOW a purge is too slow (example 2)', () => {
  const r = air({ air_m3h: 1200 }, oyster6000, undefined, READY);
  assert.ok(Math.abs(r.air.purgeS - 276) <= 1, r.air.purgeS);
  assert.equal(r.air.text, 'Your 1,200 m³/h air exchange is too small for 6,000 blocks in fruiting: a purge takes 4.6 min, the limit is 3 min. Buy at least 1,450 m³/h; 1,800 m³/h gives a margin.');
});

test('AIR-MARGIN the margin is the step after the size when the size equals the need', () => {
  const r = air({ air_m3h: 600 }, lm(2000));
  assert.deepEqual([r.air.recommended, r.air.margin], [900, 1200]);
  assert.equal(r.air.text, 'Your 600 m³/h air exchange is too small for 2,000 blocks in pinning: a purge takes 5.6 min, the limit is 3 min. Buy at least 900 m³/h; 1,200 m³/h gives a margin.');
});

test('AIR-NOSIZE no size in the list is big enough', () => {
  const r = air({}, lm(25000));
  assert.deepEqual([r.air.needM3h, r.air.recommended], [4150, null]);
  assert.equal(r.air.text, 'Your 1,800 m³/h air exchange is too small for 25,000 blocks in pinning: a purge never brings CO₂ down to 700 ppm. Buy at least 4,150 m³/h.');
});

test('AIR-RUN a CO₂ failure is confirmed by one run with a bigger air exchange', () => {
  const seen = [];
  const r = air({}, lm(2500), (p, rm) => { seen.push(rm); return rm.airM3h >= 2400 ? {} : { fails: CO2 }; });
  for (const rm of seen.filter(x => x.airM3h === 1800)) assert.equal('vent' in rm, false);
  assert.deepEqual(r.runs.filter(x => x.kind === 'ac').map(x => x.air_m3h), r.runs.filter(x => x.kind === 'ac').map(() => 1800));
  const last = r.runs.at(-1);
  assert.deepEqual([last.kind, last.air_m3h], ['air', 2400]);
  assert.equal(seen.at(-1).airM3h, 2400);
  assert.deepEqual([r.air.verdict, r.air.recommended, r.air.tried], ['too-small', 2400, 2400]);
  assert.equal(r.air.text, 'Your 1,800 m³/h air exchange is too small: CO₂ goes above the limit in fruiting. A 2,400 m³/h air exchange keeps it below.');
});

test('AIR-NOFIX a bigger air exchange does not fix the CO₂', () => {
  const r = air({}, lm(2500), () => ({ fails: CO2 }));
  assert.deepEqual([r.air.verdict, r.air.tried, r.air.recommended], ['not-the-fix', 2400, null]);
  assert.equal(r.air.text, 'CO₂ goes above the limit in fruiting, and a 2,400 m³/h air exchange does not fix it.');
});

test('AIR-NOFIX0 no bigger size exists: not-the-fix before oversized', () => {
  const r = air({ air_m3h: 3600 }, lm(2500), () => ({ fails: CO2 }));
  assert.equal(r.runs.some(x => x.kind === 'air'), false);
  assert.deepEqual([r.air.verdict, r.air.tried], ['not-the-fix', null]);
  assert.equal(r.air.text, 'CO₂ goes above the limit in fruiting.');
});

const OVER = 'bigger than this room needs: 900 m³/h is enough. Each purge brings in a lot of hot, wet outside air at once.';
test('AIR-OVER three steps above the need is oversized', () => {
  const r = air({ air_m3h: 2400 }, lm(1000));
  assert.deepEqual([r.air.verdict, r.air.recommended], ['oversized', 900]);
  assert.equal(r.air.text, `Your 2,400 m³/h air exchange is ${OVER}`);
});

test('AIR-OVER36 (example 4)', () => {
  assert.equal(air({ air_m3h: 3600 }, lm(1000)).air.text, `Your 3,600 m³/h air exchange is ${OVER}`);
});

test('AIR-OVERODD an odd size counts by the largest step not above it', () => {
  const r = air({ air_m3h: 2500 }, lm(1000));
  assert.equal(r.air.verdict, 'oversized');
  assert.equal(r.air.text, `Your 2,500 m³/h air exchange is ${OVER}`);
});

test('AIR-2STEP two steps above the need is not oversized (example 3)', () => {
  const r = air({ air_m3h: 1800 }, lm(1000));
  assert.deepEqual([r.air.verdict, r.air.recommended, r.air.needM3h], ['enough', null, 800]);
  assert.equal(r.air.text, 'Your 1,800 m³/h air exchange is enough: a purge takes at most 1.2 min (pinning), the limit is 3 min.');
});

test('AIR-900 (example 5)', () => {
  const r = air({ air_m3h: 900 }, lm(1000));
  assert.equal(r.air.verdict, 'enough');
  assert.equal(r.air.text, 'Your 900 m³/h air exchange is enough: a purge takes at most 2.5 min (pinning), the limit is 3 min.');
});

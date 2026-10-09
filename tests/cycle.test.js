// Crop cycle simulation (cycle.js). Contract: docs/contracts/cycle.md
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js'); require('../cycle.js');
// C9 bridge (lead deletes at step 2). Test only: until the controller stream merges, controller.js still speaks the old fan shapes.
// This makes it speak C9's: cmd.air, manual.air, rules.purgeMaxS, and on/off purges in place of steady air.
// It does nothing once controller.js has manual.air; the lead deletes it at step 2.
(function bridge(CC) {
  if (CC.defaultSettings().manual.air) return;
  const fix = cfg => { cfg.manual.air = { auto: true, on: false }; cfg.rules.airMode = 'purge'; cfg.rules.purgeMaxS = 180; return cfg; };
  const { defaultRules, defaultSettings, importSettings, create } = CC;
  CC.defaultRules = lim => ({ ...defaultRules(lim), airMode: 'purge', purgeMaxS: 180 });
  CC.defaultSettings = () => fix(defaultSettings());
  CC.importSettings = input => {
    const r = importSettings(input);
    return { settings: fix(r.settings), warnings: r.warnings.filter(w => !w.includes('"manual.air')) };
  };
  CC.create = (cfg, snapshot, onEvent) => {
    const ctl = create(cfg, snapshot, onEvent), update = ctl.update;
    ctl.update = r => { const c = update(r); return { ...c, air: { on: c.fan.level > 0 } }; };
    return ctl;
  };
})(globalThis.ClimateController);
// end of C9 bridge
const CY = globalThis.ClimateCycle, CAP = globalThis.ClimateCapacity, CC = globalThis.ClimateController, SIM = globalThis.ClimateSim;

const room = { name: 'Room 1', volume: 60, calib: null };
const oyster = n => [{ crop: 'oyster', blocks: n }];
const SHORT_FULL = { farmType: 'full', program: { flushes: 2, days: { spawn: 2, pinning: 1, fruiting: 2, rest: 1 } } };
const SHORT_READY = { farmType: 'ready', program: { flushes: 2, days: { fruiting: 2, rest: 1 } } };

let shortFull;
const getShortFull = () => shortFull || (shortFull = CY.runCycle(room, oyster(2000), { settings: SHORT_FULL }));
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ---------- X1 ----------
test('X1 capacity.js exports mixCo2 and roomOf', () => {
  assert.equal(typeof CAP.mixCo2, 'function');
  assert.equal(typeof CAP.roomOf, 'function');
  assert.equal(CAP.mixCo2(room, oyster(10)), 45);
  assert.equal(CAP.mixCo2({ ...room, calib: { ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 50 } }, oyster(10)), 50);
  assert.deepEqual(CAP.roomOf(room), { ...SIM.PLANT.room, volume: 60 });
  const r2 = CAP.roomOf({ volume: 30, calib: { ua: 90, infAch: 0.5, moistBuffer: 4 } });
  assert.equal(r2.ua, 90); assert.equal(r2.infAch, 0.5); assert.equal(r2.moistBuffer, 4); assert.equal(r2.volume, 30);
});

// ---------- E1, E2 ----------
test('E1 input errors, exact texts and order', () => {
  assert.throws(() => CY.runCycle(null, oyster(1)), { name: 'TypeError', message: 'runCycle: room must be an object' });
  assert.throws(() => CY.runCycle(room, 'x'), { name: 'TypeError', message: 'runCycle: mix must be a list' });
  assert.throws(() => CY.runCycle(room, [], { settings: [] }), { name: 'TypeError', message: 'runCycle: settings must be an object' });
  assert.throws(() => CY.runCycle(room, [], { settings: null }), { name: 'TypeError', message: 'runCycle: settings must be an object' });
  assert.throws(() => CY.runCycle(room, [], { tariff: -1 }), { name: 'TypeError', message: 'runCycle: tariff must be a number of at least 0' });
  assert.throws(() => CY.runCycle(room, [], { tariff: NaN }), { name: 'TypeError', message: 'runCycle: tariff must be a number of at least 0' });
  assert.throws(() => CY.runCycle(room, [], { tariff: '0.5' }), { name: 'TypeError', message: 'runCycle: tariff must be a number of at least 0' });
  assert.throws(() => CY.runCycle(room, [], { region: 'mars' }), { name: 'Error', message: 'Unknown region: mars' });
  assert.throws(() => CY.runCycle(room, [], { region: 'toString' }), { name: 'Error', message: 'Unknown region: toString' });
  assert.throws(() => CY.runCycle(room, [], { region: 'mars', tariff: -1 }), { name: 'TypeError', message: 'runCycle: tariff must be a number of at least 0' });
  assert.throws(() => CY.runCycle(room, [], { settings: { farmType: 'ready', f: () => 1 } }), { name: 'DataCloneError' });
});

test('E2 generator laziness; runCycleAsync rejects', async () => {
  const g = CY.runCycleSteps(null, []);
  assert.throws(() => g.next(), { name: 'TypeError', message: 'runCycle: room must be an object' });
  await assert.rejects(CY.runCycleAsync(room, 'x'), /mix must be a list/);
});

// ---------- I1 ----------
test('I1 an impossible mix returns at once, no simulation', () => {
  const mix = [{ crop: 'oyster', blocks: 1200 }, { crop: 'milky', blocks: 800 }];
  const r = CY.runCycle(room, mix);
  assert.deepStrictEqual(r, { verdict: 'impossible', why: CAP.commonTargets(mix).conflict });
  assert.match(r.why, /Grey oyster needs at most 27 °C/);
  const g = CY.runCycleSteps(room, mix);
  let calls = 0;
  const first = g.next();
  assert.equal(first.done, true);
  assert.deepStrictEqual(first.value, { verdict: 'impossible', why: CAP.commonTargets(mix).conflict });
  const r2 = CY.runCycle(room, mix, { onProgress: () => calls++ });
  assert.equal(calls, 0);
  assert.equal(r2.verdict, 'impossible');
  const r3 = CY.runCycle(room, oyster(0));
  assert.equal(r3.why, 'Add at least one crop with blocks.');
});

// ---------- D1 ----------
test('D1 cycleDays', () => {
  assert.equal(CY.cycleDays('full', CC.defaultProgram()), 83);
  assert.equal(CY.cycleDays('ready', CC.defaultProgram()), 58);
  const short = { ...CC.defaultProgram(), flushes: 2, days: { spawn: 2, pinning: 1, fruiting: 2, rest: 1 } };
  assert.equal(CY.cycleDays('full', short), 8);
  assert.equal(CY.cycleDays('ready', short), 5);
  const frac = { ...CC.defaultProgram(), days: { ...CC.defaultProgram().days, fruiting: 1.6 }, flushes: 1.4 };
  assert.equal(CY.cycleDays('ready', frac), 2);
  assert.throws(() => CY.cycleDays('other', CC.defaultProgram()), { message: 'Unknown farm type: other' });
});

// ---------- S1 ----------
test('S1 full program: stage order and durations', () => {
  const r = getShortFull();
  assert.equal(r.verdict, 'ok');
  assert.deepEqual(r.stages.map(s => [s.stage, s.flush, s.startDay, s.days, s.hours]), [
    ['spawn', 1, 0, 2, 48], ['pinning', 1, 2, 1, 24], ['fruiting', 1, 3, 2, 48], ['rest', 1, 5, 1, 24], ['fruiting', 2, 6, 2, 48],
  ]);
  assert.equal(r.totals.days, 8);
  assert.deepEqual(r.targets, { spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' });
  const byStage = Object.fromEntries(r.stages.map(s => [s.stage + s.flush, s.targets]));
  assert.deepEqual(byStage.spawn1, { spT: 24, spRH: 70, co2Lim: 5000, coreMax: 32 });
  assert.deepEqual(byStage.pinning1, { spT: 24, spRH: 92, co2Lim: 800, coreMax: 32 });
  assert.deepEqual(byStage.fruiting1, { spT: 25, spRH: 88, co2Lim: 1000, coreMax: 32 });
  assert.deepEqual(byStage.rest1, { spT: 25, spRH: 80, co2Lim: 2000, coreMax: 32 });
  assert.deepEqual(r.inputs, { farmType: 'full', days: { spawn: 2, pinning: 1, fruiting: 2, rest: 1 }, flushes: 2, region: 'my-lowland', blocks: 2000, co2PerBlock: 45, tariff: 0.57, warnings: [] });
});

// ---------- S2 ----------
test('S2 ready program: stage order and durations', () => {
  const r = CY.runCycle(room, oyster(2000), { settings: SHORT_READY });
  assert.deepEqual(r.stages.map(s => [s.stage, s.flush, s.startDay, s.days]), [['fruiting', 1, 0, 2], ['rest', 1, 2, 1], ['fruiting', 2, 3, 2]]);
  assert.equal(r.totals.days, 5);
  assert.equal(r.series.length, 120);
});

// ---------- R1 ----------
test('R1 hours and series', () => {
  const r = getShortFull();
  assert.equal(r.series.length, r.totals.days * 24);
  for (let i = 0; i < r.series.length; i++) assert.equal(r.series[i].h, i);
  for (const h of r.series) {
    const seg = r.stages.find(s => h.h >= s.startDay * 24 && h.h < (s.startDay + s.days) * 24);
    assert.ok(seg, `hour ${h.h} has a segment`);
    assert.equal(h.stage, seg.stage);
    assert.equal(h.flush, seg.flush);
    assert.ok(Number.isFinite(h.T) && Number.isFinite(h.RH) && Number.isFinite(h.CO2) && Number.isFinite(h.core));
    assert.ok(Number.isFinite(h.kwh) && h.kwh >= 0);
  }
  for (const s of r.stages) {
    for (const k of ['inT', 'rhOk', 'wet', 'co2Below']) assert.ok(s[k] >= 0 && s[k] <= 100, `${k} = ${s[k]}`);
  }
});

// ---------- R2 ----------
test('R2 totals equal the sum of the segments', () => {
  const r = getShortFull();
  assert.ok(near(r.totals.kwh, r.stages.reduce((s, x) => s + x.kwh, 0)));
  assert.ok(near(r.totals.rm, r.stages.reduce((s, x) => s + x.rm, 0)));
  for (const s of r.stages) {
    assert.ok(near(s.rm, s.kwh * 0.57));
    const hrs = r.series.filter(h => h.h >= s.startDay * 24 && h.h < (s.startDay + s.days) * 24);
    assert.ok(near(s.kwh, hrs.reduce((sum, h) => sum + h.kwh, 0)));
  }
  assert.ok(near(r.totals.rmPerBlock, r.totals.rm / 2000));
  assert.equal(r.totals.pass, r.stages.every(s => s.pass));
  for (const s of r.stages) assert.equal(s.pass, s.fails.length === 0);
  assert.ok(r.totals.kwh > 0);
  const r2 = CY.runCycle(room, oyster(2000), { settings: SHORT_READY, tariff: 1 });
  assert.ok(near(r2.totals.rm, r2.totals.kwh));
});

// ---------- DET ----------
test('DET deterministic', () => {
  const r = CY.runCycle(room, oyster(2000), { settings: SHORT_FULL });
  assert.deepStrictEqual(r, getShortFull());
});

// ---------- P1, P2 ----------
test('P1 progress per day', () => {
  const g = CY.runCycleSteps(room, oyster(2000), { settings: SHORT_FULL });
  const progress = [];
  let s = g.next();
  while (!s.done) { progress.push(s.value); s = g.next(); }
  assert.equal(progress.length, 8);
  assert.deepEqual(progress.map(p => p.day), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(progress.every(p => p.days === 8));
  assert.deepEqual(progress.map(p => p.stage), ['spawn', 'spawn', 'pinning', 'fruiting', 'fruiting', 'rest', 'fruiting', 'fruiting']);
  assert.deepEqual(progress.map(p => p.flush), [1, 1, 1, 1, 1, 1, 2, 2]);
  assert.deepStrictEqual(s.value, getShortFull());
});

test('P2 onProgress called once per day; three entry points agree', async () => {
  let n1 = 0;
  const r1 = CY.runCycle(room, oyster(2000), { settings: SHORT_READY, onProgress: () => n1++ });
  assert.equal(n1, 5);
  let n2 = 0;
  const r2 = await CY.runCycleAsync(room, oyster(2000), { settings: SHORT_READY, onProgress: () => n2++ });
  assert.equal(n2, 5);
  assert.deepStrictEqual(r1, r2);
});

// ---------- F1-F4 ----------
test('F1 forced settings cannot change the run', () => {
  const merged = JSON.parse(JSON.stringify(SHORT_FULL));
  merged.crop = 'pink'; merged.stage = 'rest';
  merged.offsets = { T: 3, RH: 0, CO2: 0 };
  merged.manual = { air: { auto: false, on: false } };
  merged.program.auto = false;
  merged.program.harvest = { on: true };
  const r = CY.runCycle(room, oyster(2000), { settings: merged });
  assert.deepStrictEqual(r, getShortFull());
});

test('F2 fractional days and flushes are rounded', () => {
  const r = CY.runCycle(room, oyster(2000), { settings: { farmType: 'ready', program: { flushes: 1.4, days: { fruiting: 1.6 } } } });
  assert.equal(r.inputs.flushes, 1);
  assert.equal(r.inputs.days.fruiting, 2);
  assert.equal(r.totals.days, 2);
  assert.equal(r.stages.length, 1);
});

test('F3 unknown settings are warned', () => {
  const r = CY.runCycle(room, oyster(2000), { settings: { farmType: 'ready', program: { flushes: 1, days: { fruiting: 1 } }, bogus: 1 } });
  assert.ok(r.inputs.warnings.includes('Unknown setting "bogus" is ignored.'));
});

test('F4 a mix that rounds to 0 blocks runs with 1 block', () => {
  const r = CY.runCycle(room, [{ crop: 'oyster', blocks: 0.4 }], { settings: { farmType: 'ready', program: { flushes: 1, days: { fruiting: 1 } } } });
  assert.equal(r.verdict, 'ok');
  assert.equal(r.inputs.blocks, 1);
  assert.ok(Number.isFinite(r.totals.rmPerBlock));
  assert.ok(near(r.totals.rmPerBlock, r.totals.rm));
});

// ---------- M1 ----------
test('M1 fruiting runs at the common targets', () => {
  const mix = [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 800 }];
  const r = CY.runCycle(room, mix, { settings: SHORT_READY });
  assert.equal(r.targets.spT, 25.5);
  assert.equal(r.targets.crop, 'oyster');
  const fruitingSegs = r.stages.filter(s => s.stage === 'fruiting');
  assert.equal(fruitingSegs.length, 2);
  for (const s of fruitingSegs) { assert.equal(s.targets.spT, 25.5); assert.equal(s.targets.spRH, 88); }
  const restSeg = r.stages.find(s => s.stage === 'rest');
  assert.equal(restSeg.targets.spT, 25);
  const f1 = fruitingSegs[0], f2 = fruitingSegs[1];
  const hoursOf = s => r.series.filter(h => h.h >= s.startDay * 24 && h.h < (s.startDay + s.days) * 24);
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(Math.abs(mean(hoursOf(f1).map(h => h.T)) - 25.5) < 0.2);
  const f2hours = hoursOf(f2).filter(h => h.h >= f2.startDay * 24 + 6);
  assert.ok(Math.abs(mean(f2hours.map(h => h.T)) - 25.5) < 0.25);
});

// ---------- DENSE ----------
test('DENSE 6000 grey oyster fails fruiting on temperature', () => {
  const r = CY.runCycle(room, oyster(6000), { settings: { farmType: 'ready', program: { flushes: 1 } } });
  assert.equal(r.stages.length, 1);
  const s = r.stages[0];
  assert.equal(s.pass, false);
  assert.ok(s.fails.includes('temperature too high'));
  assert.ok(s.inT < 95);
  assert.ok((s.alarms.acTooSmall || 0) >= 1);
  assert.equal(r.totals.pass, false);
});

// ---------- CO2 ----------
test('CO2 no frozen-CO2 false alarm', () => {
  const r = CY.runCycle(room, oyster(50), { settings: { farmType: 'ready', program: { flushes: 1 } } });
  for (const s of r.stages) assert.equal(s.alarms.sensor_CO2, undefined);
});

// ---------- WIN ----------
test('WIN the per-day weather window changes no number', () => {
  const r = CY.runCycle(room, oyster(2000), { settings: SHORT_FULL, fullWeather: true });
  assert.deepStrictEqual(r, getShortFull());
});

// ---------- FULL ----------
test('FULL full default cycle: speed and sensible result', { todo: 'C9 5.6 "Sensor check" (controller stream): the lead removes this at step 2' }, t => {
  const t0 = Date.now();
  const r = CY.runCycle(room, oyster(2000));
  const ms = Date.now() - t0;
  t.diagnostic(`full default cycle (83 days): ${ms} ms`);
  assert.ok(ms < 60000, `${ms} ms`);
  assert.equal(r.totals.days, 83);
  assert.equal(r.stages.length, 9);
  assert.deepEqual(r.stages.map(s => s.stage), ['spawn', 'pinning', 'fruiting', 'rest', 'fruiting', 'rest', 'fruiting', 'rest', 'fruiting']);
  assert.equal(r.series.length, 1992);
  for (const s of r.stages.filter(s => s.stage === 'fruiting')) {
    assert.equal(s.pass, true, JSON.stringify({ stage: s.stage, flush: s.flush, inT: s.inT, fails: s.fails }));
    t.diagnostic(`fruiting ${s.flush}: inT ${s.inT.toFixed(1)} pass ${s.pass}`);
  }
  const spawn = r.stages[0];
  assert.equal(spawn.pass, true, JSON.stringify(spawn.fails));
  assert.ok(spawn.maxCore <= 32, spawn.maxCore);
  t.diagnostic(`spawn: inT ${spawn.inT.toFixed(1)} maxCore ${spawn.maxCore.toFixed(1)} pass ${spawn.pass}`);
  for (const s of r.stages) assert.equal(s.alarms.sensor_CO2, undefined);
  assert.deepEqual(r.inputs.days, { spawn: 21, pinning: 4, fruiting: 7, rest: 10 });
  assert.equal(r.inputs.flushes, 4);
});

// ---------- AIR ----------
test('AIR the room size of the air exchange reaches the simulation', () => {
  const r = CY.runCycle({ ...room, airM3h: 1800 }, oyster(2000), { settings: SHORT_READY });
  assert.deepStrictEqual(r, CY.runCycle(room, oyster(2000), { settings: SHORT_READY }), 'no size is the default 1800 m³/h');
  const small = CY.runCycle({ ...room, airM3h: 900 }, oyster(2000), { settings: SHORT_READY });
  assert.ok(Math.abs(small.totals.kwh - r.totals.kwh) > 1e-6, `${small.totals.kwh} vs ${r.totals.kwh}`);
});

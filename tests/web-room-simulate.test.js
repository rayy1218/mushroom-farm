// web/room-simulate.js helpers (docs/contracts/web.md 3.7, 3.10).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js');
require('../web/room-tabs.js');
require('../web/room-simulate.js');
const H = globalThis.FarmRoomTabs.get('simulate').helpers;
const CC = globalThis.ClimateController;
const ROOM = { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 1791446400, archived_at: null, live: null };
const CAL = { id: 3, room_id: 1, run_at: 1790827200, ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41, rmse_t: 0.21,
  rmse_rh: null, rmse_co2: 38, log_rows: 5760, applied_at: 1790827230, applied: true, source: 'history', log_from: 1, log_to: 2, equipment: null };
const EQUIP = { room_id: 1, saved_at: 1791450950, ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 };
const S = { ...CC.defaultSettings(), airM3h: 900 };
const DRAFT = [{ crop: 'oyster', blocks: 1200, co2_per_block: null }, { crop: 'pink', blocks: 300, co2_per_block: 55 }];
const data = over => ({ room: ROOM, settings: S, draft: DRAFT, calibrations: [{ ...CAL, id: 2, applied: false }, CAL], equipment: null,
  region: 'my-lowland', tariff: 0.57, emptyBelow: 50, ...over });

test('SM1 registration', () => {
  const tab = globalThis.FarmRoomTabs.get('simulate');
  assert.equal(typeof tab.mount, 'function');
  assert.equal(typeof tab.unmount, 'function');
  assert.deepEqual(Object.keys(tab.helpers).sort(), ['appliedCalib', 'clampBlocks', 'clampCo2', 'cycleSummary', 'machinesText', 'progressText',
    'regionText', 'runInputs', 'runRowTexts', 'sameMix', 'seriesPoints', 'stageRows', 'toCapacityMix', 'toMixRows']);
  assert.equal(typeof globalThis.document, 'undefined');
  assert.doesNotThrow(() => tab.unmount());
});

test('SM2 mix', () => {
  assert.deepEqual(H.toCapacityMix(DRAFT), [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2PerBlock: 55 }]);
  assert.deepEqual(H.toMixRows(H.toCapacityMix(DRAFT)), DRAFT);
  const a = H.toCapacityMix(DRAFT);
  assert.equal(H.sameMix(a, H.toCapacityMix(DRAFT)), true);
  assert.equal(H.sameMix(a, a.slice(0, 1)), false);
  assert.equal(H.sameMix(a, [{ ...a[0], crop: 'pink' }, a[1]]), false);
  assert.equal(H.sameMix(a, [{ ...a[0], blocks: 1201 }, a[1]]), false);
  assert.equal(H.sameMix(a, [a[0], { ...a[1], co2PerBlock: 56 }]), false);
  assert.equal(H.sameMix([{ crop: 'oyster', blocks: 1 }], [{ crop: 'oyster', blocks: 1 }]), true);
  assert.equal(H.sameMix([{ crop: 'oyster', blocks: 1 }], [{ crop: 'oyster', blocks: 1, co2PerBlock: 55 }]), false);
  assert.equal(H.sameMix(null, a), false);
  assert.equal(H.sameMix(a, undefined), false);
  assert.equal(H.sameMix({}, {}), false);
  const before = JSON.stringify(DRAFT);
  H.toCapacityMix(DRAFT);
  assert.equal(JSON.stringify(DRAFT), before);
});

test('SM3 appliedCalib', () => {
  assert.equal(H.appliedCalib([{ ...CAL, applied: false }]), null);
  assert.equal(H.appliedCalib([]), null);
  assert.deepEqual(H.appliedCalib([CAL]), { ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41, rmse: { T: 0.21, RH: null, CO2: 38 },
    date: '2026-10-01T04:00:00.000Z' });
});

test('SM4 runInputs without machines', () => {
  const r = H.runInputs('cycle', data());
  assert.deepEqual(r.room, { name: 'Room 1', volume: 60, airM3h: 900, calib: H.appliedCalib([CAL]) });
  assert.equal('plant' in r.room, false);
  assert.deepEqual(r.mix, H.toCapacityMix(DRAFT));
  assert.equal(r.settings, S);
  assert.equal(r.region, 'my-lowland');
  assert.equal(r.tariff, 0.57);
  assert.deepEqual(r.inputs, { mix: DRAFT, settings: S, region: 'my-lowland', tariff: 0.57, volume: 60,
    calibration: { id: 3, ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41 }, empty_below: null, equipment: null });
  assert.deepEqual(Object.keys(r.inputs.calibration), ['id', 'ua', 'inf_ach', 'moist_buffer', 'co2_per_block']);
  assert.equal(H.runInputs('capacity', data()).inputs.empty_below, 50);
  const none = H.runInputs('cycle', data({ calibrations: [{ ...CAL, applied: false }] }));
  assert.equal(none.room.calib, null);
  assert.equal(none.inputs.calibration, null);
});

test('SM5 runInputs with machines', t => {
  const real = ClimateEquipment.plantOf;
  ClimateEquipment.plantOf = (eq, room) => ({ ac: { capW: 1 }, args: [eq, room] });
  t.after(() => { ClimateEquipment.plantOf = real; });
  const r = H.runInputs('cycle', data({ equipment: EQUIP }));
  assert.equal(r.room.plant.args[0], EQUIP);
  assert.deepEqual(r.room.plant.args[1], { volume: 60, calib: H.appliedCalib([CAL]) });
  assert.deepEqual(r.inputs.equipment, { ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 });
  assert.equal(r.room.airM3h, 900);
});

const seg = (stage, startDay, t, x) => ({ stage, flush: 1, startDay, days: 1, hours: 24, targets: t, lowRhMin: 0, wet: 0, ...x });
const RES = { verdict: 'ok', targets: { spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' },
  inputs: { farmType: 'full', days: { spawn: 1, pinning: 1, fruiting: 1, rest: 1 }, flushes: 1, region: 'my-lowland', blocks: 2000, co2PerBlock: 45, tariff: 0.57, warnings: [] },
  stages: [
    seg('spawn', 0, { spT: 24, spRH: 70, co2Lim: 5000, coreMax: 32 }, { inT: 100, rhOk: 3.4, co2Below: 100, maxCore: 28.2, alarms: {}, kwh: 10.4, rm: 5.93, fails: [], pass: true }),
    seg('fruiting', 1, { spT: 25, spRH: 88, co2Lim: 1000, coreMax: 32 }, { inT: 93.5, rhOk: 99.1, co2Below: 100, maxCore: 27.4, alarms: { rhHi: 2 }, kwh: 12.6, rm: 7.18, fails: ['temperature too high'], pass: false }),
  ],
  totals: { days: 2, kwh: 23, rm: 13.11, rmPerBlock: 0.006555, pass: false },
  series: Array.from({ length: 48 }, (_, h) => ({ h, stage: h < 24 ? 'spawn' : 'fruiting', flush: 1, T: 24, RH: 80, CO2: 900, core: 27, kwh: 0.5 })) };

test('SM6 cycle result', () => {
  assert.deepEqual(H.cycleSummary(RES), { chip: { lvl: 'warning', icon: '✕', text: '1 stage(s) fail' },
    line: '2 days · 1 flushes · 23 kWh · RM 13.11 · RM 0.01 per block' });
  const pass = { ...RES, stages: RES.stages.map(s => ({ ...s, pass: true, fails: [] })) };
  assert.deepEqual(H.cycleSummary(pass).chip, { lvl: 'good', icon: '✓', text: 'all stages pass' });
  assert.deepEqual(H.cycleSummary({ verdict: 'impossible', why: 'Add at least one crop with blocks.' }),
    { chip: { lvl: 'warning', icon: '✕', text: 'impossible' }, line: 'Add at least one crop with blocks.' });
  assert.deepEqual(H.stageRows(RES), [
    ['Spawn run', '1', '1', '100.0', 'not judged', 'not judged', '28.2', '–', '10', '5.93', 'Pass'],
    ['Fruiting', '1', '1', '93.5', '99.1', '100.0', '27.4', 'rhHi ×2', '13', '7.18', 'temperature too high']]);
  const pts = H.seriesPoints(RES);
  assert.equal(pts.length, 48);
  assert.deepEqual(pts[0], { t: 0, T: 24, RH: 80, C: 900, core: 27, spT: 24, spRH: 70, co2Lim: 5000 });
  assert.equal(pts[30].t, 108000);
  assert.equal(pts[30].spT, 25);
  assert.equal(pts[30].spRH, 88);
  assert.equal(pts[30].co2Lim, 1000);
});

'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

require('../sim.js');
require('../air.js');
require('../controller.js');
require('../runtime.js');
require('../calib.js');
require('../capacity.js');
require('../cycle.js');
require('../equipment.js');
require('../room-rules.js');

const R = globalThis.ClimateRoomRules;
const EQ = globalThis.ClimateEquipment;
const NOW = 1791450000;

describe('room-rules.js: members and constants', () => {
  test('Object.keys sorted equals the 13 names', () => {
    assert.deepStrictEqual(Object.keys(R).sort(), [
      'ALARM_KEYS', 'LIM', 'VERDICTS', 'checkCalibration', 'checkEquipmentBody', 'checkMix', 'checkReport', 'checkRoom',
      'checkRunPatch', 'checkSimulationRun', 'hasCrop', 'normRoom', 'validCalib',
    ].sort());
  });

  test('room-rules: loads without cycle.js and equipment.js (C3 7.1)', () => {
    const root = path.join(__dirname, '..');
    const code = ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity'].map(f => `require(${JSON.stringify(path.join(root, f + '.js'))});`).join('')
      + `require(${JSON.stringify(path.join(root, 'room-rules.js'))});`
      + "if (typeof globalThis.ClimateRoomRules.checkEquipmentBody !== 'function') process.exit(3);";
    const r = spawnSync(process.execPath, ['-e', code], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });

  test('LIM, VERDICTS, ALARM_KEYS', () => {
    assert.deepStrictEqual(R.LIM, { blocks: 200000, volume: [5, 5000], co2: [1, 1000], name: 60 });
    assert.deepStrictEqual(R.VERDICTS, ['impossible', 'too-dense', 'tight', 'good', 'too-empty']);
    assert.deepStrictEqual(R.ALARM_KEYS, [
      'tHi', 'tLo', 'tCrop', 'coreHi', 'rhHi', 'rhLo', 'co2Hi', 'co2Safe', 'disagree', 'acTooSmall', 'blocksDone', 'shockLimit',
      'airTooSmall',
    ]);
  });
});

describe('hasCrop', () => {
  test('known and unknown crops', () => {
    assert.equal(R.hasCrop('oyster'), true);
    assert.equal(R.hasCrop('milky'), true);
    assert.equal(R.hasCrop('shiitake'), false);
    assert.equal(R.hasCrop('toString'), false);
    assert.equal(R.hasCrop('__proto__'), false);
    assert.equal(R.hasCrop(5), false);
    assert.equal(R.hasCrop(undefined), false);
  });
});

describe('validCalib', () => {
  const full = { ua: 92, infAch: 0.3, moistBuffer: 3, co2PerBlock: 41, rmse: { T: 0.2 }, date: 'd' };
  test('a full valid calib comes back with the same 6 values', () => {
    assert.deepStrictEqual(R.validCalib(full), full);
  });
  test('no rmse -> {}; no date -> empty string', () => {
    const c = { ua: 92, infAch: 0.3, moistBuffer: 3, co2PerBlock: 41 };
    const out = R.validCalib(c);
    assert.deepStrictEqual(out.rmse, {});
    assert.equal(out.date, '');
  });
  test('each PARAMS min and max accepted', () => {
    const P = globalThis.ClimateCalib.PARAMS;
    for (const bound of ['min', 'max']) {
      const c = { ua: P.ua[bound], infAch: P.infAch[bound], moistBuffer: P.moistBuffer[bound], co2PerBlock: P.co2PerBlock[bound] };
      assert.notEqual(R.validCalib(c), null, `bound ${bound}`);
    }
  });
  test('invalid inputs give null', () => {
    assert.equal(R.validCalib(null), null);
    assert.equal(R.validCalib('x'), null);
    assert.equal(R.validCalib({ ...full, ua: 19.9 }), null);
    assert.equal(R.validCalib({ ...full, ua: NaN }), null);
    const { ua, ...rest } = full;
    assert.equal(R.validCalib(rest), null);
  });
});

describe('normRoom', () => {
  test('non-object gives null', () => {
    assert.equal(R.normRoom(null, 0), null);
    assert.equal(R.normRoom(5, 0), null);
  });
  test('drops mix rows with unknown crop or out-of-range blocks; rounds blocks', () => {
    const r = { name: 'X', mix: [{ crop: 'oyster', blocks: 10.4 }, { crop: 'shiitake', blocks: 5 }, { crop: 'pink', blocks: -1 }, { crop: 'pink', blocks: 200001 }] };
    const out = R.normRoom(r, 0);
    assert.deepStrictEqual(out.mix, [{ crop: 'oyster', blocks: 10 }]);
  });
  test('keeps co2PerBlock only in 1-1000', () => {
    const r = { mix: [
      { crop: 'oyster', blocks: 1, co2PerBlock: 0 },
      { crop: 'oyster', blocks: 1, co2PerBlock: 50 },
      { crop: 'oyster', blocks: 1, co2PerBlock: 1001 },
    ] };
    const out = R.normRoom(r, 0);
    assert.equal('co2PerBlock' in out.mix[0], false);
    assert.equal(out.mix[1].co2PerBlock, 50);
    assert.equal('co2PerBlock' in out.mix[2], false);
  });
  test('report kept only with a VERDICTS verdict and an array runs', () => {
    assert.equal(R.normRoom({ report: { verdict: 'good', runs: [] } }, 0).report !== null, true);
    assert.equal(R.normRoom({ report: { verdict: 'bogus', runs: [] } }, 0).report, null);
    assert.equal(R.normRoom({ report: { verdict: 'good', runs: 'x' } }, 0).report, null);
    assert.equal(R.normRoom({}, 0).report, null);
  });
  test('name = String(r.name || "Room").slice(0, 60)', () => {
    assert.equal(R.normRoom({}, 0).name, 'Room');
    assert.equal(R.normRoom({ name: 'x'.repeat(70) }, 0).name, 'x'.repeat(60));
  });
  test('bad volume -> ClimateSim.PLANT.room.volume; good volume kept', () => {
    assert.equal(R.normRoom({}, 0).volume, globalThis.ClimateSim.PLANT.room.volume);
    assert.equal(R.normRoom({ volume: 100 }, 0).volume, 100);
    assert.equal(R.normRoom({ volume: 1 }, 0).volume, globalThis.ClimateSim.PLANT.room.volume);
  });
  test('vent is not kept (C9 section 6.3)', () => {
    assert.ok(!('vent' in R.normRoom({ vent: 'exhaust' }, 0)));
    assert.ok(!('vent' in R.normRoom({}, 0)));
  });
  test('id = String(r.id) or a base-36 text ending with the index', () => {
    assert.equal(R.normRoom({ id: 7 }, 2).id, '7');
    const out = R.normRoom({}, 3).id;
    assert.equal(out.endsWith('3'), true);
  });
  test('calib = validCalib(r.calib); rev = 0', () => {
    assert.equal(R.normRoom({}, 0).calib, null);
    assert.equal(R.normRoom({}, 0).rev, 0);
    const validCalibInput = { ua: 92, infAch: 0.3, moistBuffer: 3, co2PerBlock: 41, rmse: { T: 0.2 }, date: 'd' };
    assert.deepStrictEqual(R.normRoom({ calib: validCalibInput }, 0).calib, R.validCalib(validCalibInput));
  });
});

describe('checkRoom', () => {
  test('a valid POST body gives []', () => {
    assert.deepStrictEqual(R.checkRoom({ name: 'A', volume: 60 }, false), []);
    assert.deepStrictEqual(R.checkRoom({ name: 'A', volume: 60, settings: 'anything' }, false), []);
  });
  test('one problem each for a missing field', () => {
    assert.equal(R.checkRoom({ volume: 60 }, false).length, 1);
    assert.equal(R.checkRoom({ name: 'A' }, false).length, 1);
  });
  test('name rules', () => {
    assert.equal(R.checkRoom({ name: '   ', volume: 60 }, false).length, 1);
    assert.equal(R.checkRoom({ name: 'x'.repeat(61), volume: 60 }, false).length, 1);
    assert.equal(R.checkRoom({ name: 5, volume: 60 }, false).length, 1);
    assert.deepStrictEqual(R.checkRoom({ name: '  ' + 'x'.repeat(60) + '  ', volume: 60 }, false), []);
  });
  test('volume rules', () => {
    for (const bad of [4.99, 5000.01, '60', null]) {
      assert.equal(R.checkRoom({ name: 'A', volume: bad }, false).length, 1, String(bad));
    }
  });
  test('vent is an unknown field (C9 section 6.3)', () => {
    assert.deepStrictEqual(R.checkRoom({ name: 'A', volume: 60, vent: 'supply' }, false), ['vent: unknown field']);
    assert.deepStrictEqual(R.checkRoom({ vent: 'supply' }, true), ['vent: unknown field', 'body: at least one field is required']);
  });
  test('unknown field and archived on POST', () => {
    assert.equal(R.checkRoom({ name: 'A', volume: 60, colour: 'red' }, false).length, 1);
    assert.equal(R.checkRoom({ name: 'A', volume: 60, archived: true }, false).length, 1);
  });
  test('a non-object body gives a problem', () => {
    assert.ok(R.checkRoom(null, false).length > 0);
    assert.ok(R.checkRoom([], false).length > 0);
    assert.ok(R.checkRoom('x', false).length > 0);
  });
  test('partial (PATCH): {} is a problem; valid partial bodies give []', () => {
    assert.ok(R.checkRoom({}, true).length > 0);
    assert.deepStrictEqual(R.checkRoom({ archived: true }, true), []);
    assert.deepStrictEqual(R.checkRoom({ name: 'B' }, true), []);
  });
  test('partial (PATCH): archived false or settings field is a problem', () => {
    assert.ok(R.checkRoom({ archived: false }, true).length > 0);
    assert.ok(R.checkRoom({ settings: {} }, true).length > 0);
  });
});

describe('checkMix', () => {
  test('[] is valid; a repeated crop is valid', () => {
    assert.deepStrictEqual(R.checkMix([]), []);
    assert.deepStrictEqual(R.checkMix([{ crop: 'oyster', blocks: 1 }, { crop: 'oyster', blocks: 2 }]), []);
  });
  test('not an array', () => {
    assert.ok(R.checkMix({}).length > 0);
  });
  test('a row not an object', () => {
    assert.ok(R.checkMix(['x']).length > 0);
  });
  test('unknown crop', () => {
    assert.ok(R.checkMix([{ crop: 'shiitake', blocks: 1 }])[0].startsWith('mix[0].crop'));
  });
  test('blocks rules', () => {
    for (const bad of [1.5, -1, 200001, '5']) {
      assert.ok(R.checkMix([{ crop: 'oyster', blocks: bad }]).some(p => p.startsWith('mix[0].blocks')), String(bad));
    }
  });
  test('co2_per_block rules', () => {
    for (const bad of [0, 1001, 'x']) {
      assert.ok(R.checkMix([{ crop: 'oyster', blocks: 1, co2_per_block: bad }]).some(p => p.startsWith('mix[0].co2_per_block')), String(bad));
    }
    assert.deepStrictEqual(R.checkMix([{ crop: 'oyster', blocks: 1 }]), []);
    assert.deepStrictEqual(R.checkMix([{ crop: 'oyster', blocks: 1, co2_per_block: null }]), []);
  });
  test('an extra key', () => {
    assert.ok(R.checkMix([{ crop: 'oyster', blocks: 1, extra: 1 }]).some(p => p.startsWith('mix[0].extra')));
  });
});

describe('checkCalibration', () => {
  const full = { ua: 92, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 41, rmse_t: 0.2, rmse_rh: 1, rmse_co2: 10, log_rows: 100 };
  test('a full valid body gives []', () => {
    assert.deepStrictEqual(R.checkCalibration(full, NOW), []);
  });
  test('each of the 4 values just outside its range', () => {
    assert.ok(R.checkCalibration({ ...full, ua: 19.9 }, NOW).some(p => p.startsWith('ua')));
    assert.ok(R.checkCalibration({ ...full, inf_ach: 3.1 }, NOW).some(p => p.startsWith('inf_ach')));
    assert.ok(R.checkCalibration({ ...full, moist_buffer: 0.9 }, NOW).some(p => p.startsWith('moist_buffer')));
    assert.ok(R.checkCalibration({ ...full, co2_per_block: 4.9 }, NOW).some(p => p.startsWith('co2_per_block')));
  });
  test('a missing rmse_t key is a problem; null is valid', () => {
    const { rmse_t, ...rest } = full;
    assert.ok(R.checkCalibration(rest, NOW).some(p => p.startsWith('rmse_t')));
    assert.deepStrictEqual(R.checkCalibration({ ...full, rmse_t: null }, NOW), []);
  });
  test('rmse_rh -0.1 is a problem', () => {
    assert.ok(R.checkCalibration({ ...full, rmse_rh: -0.1 }, NOW).some(p => p.startsWith('rmse_rh')));
  });
  test('log_rows 1 or 2.5 is a problem; null and 2 are valid', () => {
    assert.ok(R.checkCalibration({ ...full, log_rows: 1 }, NOW).some(p => p.startsWith('log_rows')));
    assert.ok(R.checkCalibration({ ...full, log_rows: 2.5 }, NOW).some(p => p.startsWith('log_rows')));
    assert.deepStrictEqual(R.checkCalibration({ ...full, log_rows: null }, NOW), []);
    assert.deepStrictEqual(R.checkCalibration({ ...full, log_rows: 2 }, NOW), []);
  });
  test('run_at rules', () => {
    assert.ok(R.checkCalibration({ ...full, run_at: 0 }, NOW).some(p => p.startsWith('run_at')));
    assert.ok(R.checkCalibration({ ...full, run_at: 1.5 }, NOW).some(p => p.startsWith('run_at')));
    assert.ok(R.checkCalibration({ ...full, run_at: NOW + 61 }, NOW).some(p => p.startsWith('run_at')));
    assert.deepStrictEqual(R.checkCalibration({ ...full, run_at: NOW + 60 }, NOW), []);
  });
  test('an extra field', () => {
    assert.ok(R.checkCalibration({ ...full, extra: 1 }, NOW).some(p => p.startsWith('extra')));
  });
  test('a non-object', () => {
    assert.ok(R.checkCalibration(null, NOW).length > 0);
    assert.ok(R.checkCalibration('x', NOW).length > 0);
  });
});

describe('checkEquipmentBody', () => {
  test('checkEquipmentBody (C3 7.7)', () => {
    assert.deepStrictEqual(R.checkEquipmentBody({ ...EQ.DEFAULTS }), []);
    assert.deepStrictEqual(R.checkEquipmentBody(null), ['equipment: must be an object']);
    assert.deepStrictEqual(R.checkEquipmentBody([]), ['equipment: must be an object']);
    const { height, ...noHeight } = EQ.DEFAULTS;
    assert.ok(R.checkEquipmentBody(noHeight).includes('height: missing'));
    const { air_m3h, ...rest } = EQ.DEFAULTS;
    const p = R.checkEquipmentBody({ ...rest, fan_m3h: 900 });
    assert.ok(p.includes('air_m3h: missing'));
    assert.ok(p.includes('fan_m3h: unknown field'));
    assert.ok(p.indexOf('air_m3h: missing') < p.indexOf('fan_m3h: unknown field'));
    const text = 'air_m3h: must be a number from 50 to 10000';
    assert.deepStrictEqual(R.checkEquipmentBody({ ...EQ.DEFAULTS, air_m3h: 40 }), [text]);
    assert.deepStrictEqual(R.checkEquipmentBody({ ...EQ.DEFAULTS, air_m3h: 10001 }), [text]);
    assert.deepStrictEqual(R.checkEquipmentBody({ ...EQ.DEFAULTS, air_m3h: 50 }), []);
    assert.deepStrictEqual(R.checkEquipmentBody({ ...EQ.DEFAULTS, air_m3h: 10000 }), []);
    // one body per checkEquipment problem of C8 4.3
    const D = EQ.DEFAULTS;
    const cases = [
      [{ ...D, ac_hp: 1.25 }, `ac_hp: must be one of ${EQ.AC_SIZES.map(s => s.hp).join(', ')}`],
      [{ ...D, ac_units: 5 }, 'ac_units: must be a whole number from 1 to 4'],
      [{ ...D, ac_units: 1.5 }, 'ac_units: must be a whole number from 1 to 4'],
      [{ ...D, fog_lph: 0.2 }, 'fog_lph: must be a number from 0.5 to 50'],
      [{ ...D, height: 7 }, 'height: must be a number from 2 to 6'],
      [{ ...D, walls: 'wood', roof: 'pu50' }, `walls: must be one of ${Object.keys(EQ.CONSTRUCTIONS).join(', ')} or null`],
      [{ ...D, walls: 'pu50', roof: 'brick115' }, `roof: must be one of ${Object.keys(EQ.CONSTRUCTIONS).filter(k => EQ.CONSTRUCTIONS[k].roof).join(', ')} or null`],
      [{ ...D, walls: 'pu50', roof: null }, 'walls and roof: set both or neither'],
      [{ ...D, vent: 1 }, 'vent: unknown field'],
    ];
    for (const [body, text2] of cases) assert.ok(R.checkEquipmentBody(body).includes(text2), text2);
  });
});

describe('checkCalibration extension', () => {
  const full = { ua: 92, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 41, rmse_t: 0.2, rmse_rh: 1, rmse_co2: 10, log_rows: 100 };
  test('checkCalibration: source, log_from, log_to, equipment (C3 7.4)', () => {
    for (const source of [null, 'csv', 'history', 'import']) {
      const body = source === 'history' ? { ...full, source, log_from: 1000, log_to: 2000 } : { ...full, source };
      assert.deepStrictEqual(R.checkCalibration(body, NOW), [], String(source));
    }
    assert.ok(R.checkCalibration({ ...full, source: 'web' }, NOW).some(p => p.startsWith('source')));
    assert.ok(R.checkCalibration({ ...full, source: 'history' }, NOW).some(p => p.startsWith('log_from')));
    assert.ok(R.checkCalibration({ ...full, source: 'history', log_from: null, log_to: null }, NOW).some(p => p.startsWith('log_from')));
    assert.ok(R.checkCalibration({ ...full, log_from: 1000 }, NOW).some(p => p.startsWith('log_to')));
    assert.ok(R.checkCalibration({ ...full, log_to: 1000 }, NOW).some(p => p.startsWith('log_from')));
    assert.ok(R.checkCalibration({ ...full, log_from: 3000, log_to: 2000 }, NOW).some(p => p.startsWith('log_from')));
    assert.ok(R.checkCalibration({ ...full, log_from: 1000, log_to: NOW + 61 }, NOW).some(p => p.startsWith('log_to')));
    assert.deepStrictEqual(R.checkCalibration({ ...full, log_from: 1000, log_to: NOW + 60 }, NOW), []);
    assert.deepStrictEqual(R.checkCalibration({ ...full, log_from: null, log_to: null }, NOW), []);
    assert.ok(R.checkCalibration({ ...full, log_from: 0, log_to: 5 }, NOW).some(p => p.startsWith('log_from')));
    assert.deepStrictEqual(R.checkCalibration({ ...full, equipment: { ...EQ.DEFAULTS } }, NOW), []);
    assert.deepStrictEqual(R.checkCalibration({ ...full, equipment: null }, NOW), []);
    const bad = R.checkCalibration({ ...full, equipment: { ...EQ.DEFAULTS, air_m3h: 40 } }, NOW);
    assert.ok(bad.some(p => p.includes('air_m3h')));
  });
});

describe('checkSimulationRun and checkRunPatch', () => {
  const CC = globalThis.ClimateController;
  const inputs = (over = {}) => ({
    mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }], settings: CC.defaultSettings(), region: 'my-lowland', tariff: 0.57,
    volume: 60, calibration: null, empty_below: null, equipment: null, ...over,
  });
  const cycleResult = () => ({ verdict: 'ok', totals: { days: 1, pass: true, kwh: 10, rm: 5.7, rmPerBlock: 0.003 }, stages: [{ stage: 'fruiting' }], series: Array.from({ length: 24 }, (_, h) => ({ h })) });
  const cycle = (over = {}) => ({ kind: 'cycle', inputs: inputs(), result: cycleResult(), ...over });
  const capacity = (over = {}) => ({ kind: 'capacity', inputs: inputs({ empty_below: 20 }), result: { verdict: 'good', runs: [], utilisation: 74 }, ...over });
  const airPart = (over = {}) => ({ verdict: 'enough', own: 1800, capS: 180, needM3h: 800, recommended: null, margin: null, purgeS: 69, stage: 'pinning', text: 'Your 1,800 m³/h air exchange is enough.', ...over });
  const eqReport = (air = airPart()) => ({ verdict: 'ok', ac: { verdict: 'too-small' }, air, runs: [{ kind: 'ac', ac_hp: 1 }], summary: ['x'] });
  const equipment = (result = eqReport(), over = {}) => ({ kind: 'equipment', inputs: inputs({ equipment: { ...EQ.DEFAULTS } }), result, ...over });
  const has = (body, text) => R.checkSimulationRun(body, NOW).some(p => p.startsWith(text));

  test('checkSimulationRun: valid runs (C3 7.6)', () => {
    assert.deepStrictEqual(R.checkSimulationRun(cycle(), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(cycle({ result: { ...cycleResult(), totals: { ...cycleResult().totals, pass: false } } }), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(cycle({ result: { verdict: 'impossible', why: 'x' } }), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(capacity(), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(equipment(), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(equipment({ verdict: 'impossible', why: 'x' }), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(cycle({ note: '  hello ' }), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(cycle({ note: null }), NOW), []);
  });

  test('checkSimulationRun: each broken rule (C3 7.6)', () => {
    const r = cycleResult();
    const cal = { id: 3, ua: 92, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 41 };
    const { mix, ...noMix } = inputs();
    const broken = [
      ['not an object', null, 'body'],
      ['extra body key', { ...cycle(), extra: 1 }, 'extra'],
      ['kind heat', cycle({ kind: 'heat' }), 'kind'],
      ['inputs key missing', cycle({ inputs: noMix }), 'inputs.mix'],
      ['inputs.vent', cycle({ inputs: inputs({ vent: 1 }) }), 'inputs.vent'],
      ['inputs.mix', cycle({ inputs: inputs({ mix: [{ crop: 'shiitake', blocks: 1 }] }) }), 'inputs.mix'],
      ['inputs.region', cycle({ inputs: inputs({ region: 'mars' }) }), 'inputs.region'],
      ['inputs.tariff', cycle({ inputs: inputs({ tariff: 11 }) }), 'inputs.tariff'],
      ['inputs.volume', cycle({ inputs: inputs({ volume: 4 }) }), 'inputs.volume'],
      ['inputs.calibration extra key', cycle({ inputs: inputs({ calibration: { ...cal, rmse_t: 0.1 } }) }), 'inputs.calibration.rmse_t'],
      ['inputs.calibration.id 0', cycle({ inputs: inputs({ calibration: { ...cal, id: 0 } }) }), 'inputs.calibration.id'],
      ['empty_below null for capacity', capacity({ inputs: inputs({ empty_below: null }) }), 'inputs.empty_below'],
      ['empty_below 5 for cycle', cycle({ inputs: inputs({ empty_below: 5 }) }), 'inputs.empty_below'],
      ['equipment null for equipment', equipment(eqReport(), { inputs: inputs({ equipment: null }) }), 'inputs.equipment'],
      ['series wrong length', cycle({ result: { ...r, series: r.series.slice(1) } }), 'result.series'],
      ['series[3].h 2', cycle({ result: { ...r, series: r.series.map((x, i) => (i === 3 ? { h: 2 } : x)) } }), 'result.series'],
      ['totals.days 0', cycle({ result: { ...r, totals: { ...r.totals, days: 0 } } }), 'result.totals.days'],
      ['capacity verdict pass', capacity({ result: { verdict: 'pass', runs: [] } }), 'result.verdict'],
      ['equipment ac.verdict pass', equipment({ ...eqReport(), ac: { verdict: 'pass' } }), 'result.ac.verdict'],
      ['note of 201 characters', cycle({ note: 'x'.repeat(201) }), 'note'],
    ];
    for (const [name, body, text] of broken) {
      const problems = R.checkSimulationRun(body, NOW);
      assert.ok(problems.length > 0, name);
      assert.ok(problems.some(p => p.startsWith(text)), `${name}: ${JSON.stringify(problems)}`);
    }
    assert.deepStrictEqual(R.checkSimulationRun(cycle({ inputs: inputs({ calibration: { ...cal, rmse_t: 0.1 } }) }), NOW).filter(p => p.includes('rmse_t')), ['inputs.calibration.rmse_t: unknown field']);
    assert.deepStrictEqual(R.checkSimulationRun(cycle({ inputs: inputs({ calibration: cal }) }), NOW), []);
  });

  test('checkSimulationRun: the air part of an equipment report (C3 7.6, revision 9)', () => {
    const { air, ...noAir } = eqReport();
    assert.ok(has(equipment(noAir), 'result.air'));
    assert.ok(has(equipment(eqReport(airPart({ verdict: 'fine' }))), 'result.air.verdict'));
    assert.ok(has(equipment(eqReport(airPart({ own: null }))), 'result.air.own'));
    assert.ok(has(equipment(eqReport(airPart({ stage: 'harvest' }))), 'result.air.stage'));
    assert.ok(has(equipment(eqReport(airPart({ text: '' }))), 'result.air.text'));
    assert.deepStrictEqual(R.checkSimulationRun(equipment(eqReport(airPart({ needM3h: null }))), NOW), []);
    assert.deepStrictEqual(R.checkSimulationRun(equipment(eqReport(airPart({ recommended: null }))), NOW), []);
    for (const verdict of ['enough', 'too-small', 'not-the-fix', 'oversized']) {
      assert.deepStrictEqual(R.checkSimulationRun(equipment(eqReport(airPart({ verdict }))), NOW), [], verdict);
    }
  });

  test('checkRunPatch (C3 7.6)', () => {
    assert.ok(R.checkRunPatch({}, NOW).length > 0);
    assert.deepStrictEqual(R.checkRunPatch({ note: null }, NOW), []);
    assert.deepStrictEqual(R.checkRunPatch({ real_start: null }, NOW), []);
    assert.deepStrictEqual(R.checkRunPatch({ real_start: NOW + 366 * 86400 }, NOW), []);
    assert.deepStrictEqual(R.checkRunPatch({ note: 'x', real_start: 5 }, NOW), []);
    for (const real_start of [0, 1.5, NOW + 366 * 86400 + 1]) {
      assert.ok(R.checkRunPatch({ real_start }, NOW).some(p => p.startsWith('real_start')), String(real_start));
    }
    assert.ok(R.checkRunPatch({ note: 'x'.repeat(201) }, NOW).some(p => p.startsWith('note')));
    assert.ok(R.checkRunPatch({ note: 'x', extra: 1 }, NOW).some(p => p.startsWith('extra')));
    assert.ok(R.checkRunPatch(null, NOW).length > 0);
  });
});

describe('checkReport', () => {
  test('a valid minimal report gives []', () => {
    assert.deepStrictEqual(R.checkReport({ verdict: 'good', runs: [] }), []);
  });
  test('not an object', () => {
    assert.ok(R.checkReport(null).length > 0);
  });
  test('unknown verdict', () => {
    assert.ok(R.checkReport({ verdict: 'bogus', runs: [] }).some(p => p.startsWith('verdict')));
  });
  test('runs not an array', () => {
    assert.ok(R.checkReport({ verdict: 'good', runs: 'x' }).some(p => p.startsWith('runs')));
  });
  test('utilisation rules', () => {
    assert.deepStrictEqual(R.checkReport({ verdict: 'good', runs: [] }), []);
    assert.deepStrictEqual(R.checkReport({ verdict: 'good', runs: [], utilisation: null }), []);
    assert.deepStrictEqual(R.checkReport({ verdict: 'good', runs: [], utilisation: 74 }), []);
    assert.ok(R.checkReport({ verdict: 'good', runs: [], utilisation: 74.5 }).some(p => p.startsWith('utilisation')));
    assert.ok(R.checkReport({ verdict: 'good', runs: [], utilisation: -1 }).some(p => p.startsWith('utilisation')));
  });
});

describe('browser load', () => {
  test('in a vm context, loading the modules defines window.ClimateRoomRules', () => {
    const w = { console };
    w.window = w;
    vm.createContext(w);
    for (const f of ['sim.js', 'controller.js', 'runtime.js', 'calib.js', 'capacity.js', 'room-rules.js']) {
      const file = path.join(__dirname, '..', f);
      vm.runInContext(fs.readFileSync(file, 'utf8'), w, { filename: file });
    }
    assert.equal(typeof w.ClimateRoomRules, 'object');
    assert.deepStrictEqual(Object.keys(w.ClimateRoomRules).sort(), Object.keys(R).sort());
  });
});

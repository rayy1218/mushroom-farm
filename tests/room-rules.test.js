'use strict';
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

require('../air.js');
require('../sim.js');
require('../controller.js');
require('../runtime.js');
require('../calib.js');
require('../room-rules.js');

const R = globalThis.ClimateRoomRules;
const NOW = 1791450000;

describe('room-rules.js: members and constants', () => {
  test('Object.keys sorted equals the 10 names', () => {
    assert.deepStrictEqual(Object.keys(R).sort(), [
      'ALARM_KEYS', 'LIM', 'VERDICTS', 'checkCalibration', 'checkMix', 'checkReport', 'checkRoom', 'hasCrop', 'normRoom', 'validCalib',
    ].sort());
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
  test('vent other than exhaust -> supply', () => {
    assert.equal(R.normRoom({ vent: 'exhaust' }, 0).vent, 'exhaust');
    assert.equal(R.normRoom({ vent: 'bogus' }, 0).vent, 'supply');
    assert.equal(R.normRoom({}, 0).vent, 'supply');
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
    assert.deepStrictEqual(R.checkRoom({ name: 'A', volume: 60, vent: 'supply' }, false), []);
    assert.deepStrictEqual(R.checkRoom({ name: 'A', volume: 60, vent: 'supply', settings: 'anything' }, false), []);
  });
  test('one problem each for a missing field', () => {
    assert.equal(R.checkRoom({ volume: 60, vent: 'supply' }, false).length, 1);
    assert.equal(R.checkRoom({ name: 'A', vent: 'supply' }, false).length, 1);
    assert.equal(R.checkRoom({ name: 'A', volume: 60 }, false).length, 1);
  });
  test('name rules', () => {
    assert.equal(R.checkRoom({ name: '   ', volume: 60, vent: 'supply' }, false).length, 1);
    assert.equal(R.checkRoom({ name: 'x'.repeat(61), volume: 60, vent: 'supply' }, false).length, 1);
    assert.equal(R.checkRoom({ name: 5, volume: 60, vent: 'supply' }, false).length, 1);
    assert.deepStrictEqual(R.checkRoom({ name: '  ' + 'x'.repeat(60) + '  ', volume: 60, vent: 'supply' }, false), []);
  });
  test('volume rules', () => {
    for (const bad of [4.99, 5000.01, '60', null]) {
      assert.equal(R.checkRoom({ name: 'A', volume: bad, vent: 'supply' }, false).length, 1, String(bad));
    }
  });
  test('vent rule', () => {
    assert.equal(R.checkRoom({ name: 'A', volume: 60, vent: 'side' }, false).length, 1);
  });
  test('unknown field and archived on POST', () => {
    assert.equal(R.checkRoom({ name: 'A', volume: 60, vent: 'supply', colour: 'red' }, false).length, 1);
    assert.equal(R.checkRoom({ name: 'A', volume: 60, vent: 'supply', archived: true }, false).length, 1);
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

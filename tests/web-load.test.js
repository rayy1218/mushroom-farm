// docs/contracts/web.md table 7.5: load order and globals (C5 1.1, 1.3, 1.4), the final page.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const BASE = ['ClimateSim', 'ClimateAir', 'ClimateController', 'ClimateRuntime', 'ClimateCalib', 'ClimateCapacity', 'ClimateCycle', 'ClimateEquipment',
  'ClimateRoomRules', 'FarmHarvestRules', 'FarmUi', 'FarmApi', 'FarmCharts', 'FarmSettingsPanel', 'FarmShell'];

test('L1: load order, nothing throws', () => {
  const before = new Set(Object.keys(globalThis));
  assert.doesNotThrow(() => {
    for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules', 'harvest-rules']) require(`../${f}.js`);
    for (const f of ['ui', 'api', 'charts', 'settings-panel']) require(`../web/${f}.js`);
    // web/vendor/qrcodegen.js is a classic script that declares `var qrcodegen`: run it as one.
    vm.runInThisContext(fs.readFileSync(path.join(root, 'web/vendor/qrcodegen.js'), 'utf8'), { filename: 'web/vendor/qrcodegen.js' });
    require('../web/shell.js');
  });
  globalThis.__webLoadBefore = before;
});

test('L2: globals of C5 1.1', () => {
  for (const k of ['FarmUi', 'FarmApi', 'FarmCharts', 'FarmSettingsPanel', 'FarmShell', 'FarmHarvestRules', 'ClimateCycle', 'ClimateEquipment']) {
    assert.equal(typeof globalThis[k], 'object', k);
  }
  assert.equal(typeof globalThis.FarmShell.register, 'function');
  assert.equal(typeof globalThis.qrcodegen, 'object');
});

test('L3: at most one global per file', () => {
  const before = globalThis.__webLoadBefore;
  const added = new Set(Object.keys(globalThis).filter(k => !before.has(k) && k !== '__webLoadBefore'));
  assert.deepEqual(added, new Set([...BASE, 'qrcodegen']));
  globalThis.__webLoadAfterL1 = added;
});

test('L4: the modules and the room tabs register; FarmRoomTabs and FarmEquipmentCard are defined; FarmBench is gone', () => {
  const FarmShell = globalThis.FarmShell;
  const recorded = [];
  FarmShell.register = (name, mod) => recorded.push({ name, mod });
  assert.doesNotThrow(() => {
    require('../web/room-tabs.js');
    require('../web/rooms.js');
    require('../web/room-live.js');
    require('../web/room-equipment.js');
    require('../web/room-simulate.js');
    require('../web/room-calibrate.js');
    require('../web/batches.js');
    require('../web/harvest.js');
    require('../web/simulator.js');
  });
  assert.deepEqual(recorded.map(r => r.name), ['rooms', 'batches', 'harvest', 'simulator']);
  for (const r of recorded) {
    assert.equal(typeof r.mod.mount, 'function', r.name);
    assert.equal(typeof r.mod.unmount, 'function', r.name);
  }
  const tabs = globalThis.FarmRoomTabs;
  assert.deepEqual([...tabs.NAMES], ['live', 'simulate', 'calibrate']);
  for (const n of tabs.NAMES) assert.ok(tabs.get(n), n);
  assert.equal(typeof globalThis.FarmEquipmentCard, 'object');
  assert.equal(globalThis.FarmBench, undefined);

  // Each remaining file adds exactly one global: FarmRoomTabs (web/room-tabs.js) and FarmEquipmentCard (web/room-equipment.js).
  const afterL1 = globalThis.__webLoadAfterL1, before = globalThis.__webLoadBefore;
  const addedSinceL1 = new Set(Object.keys(globalThis).filter(k => !before.has(k) && !afterL1.has(k) && k !== '__webLoadBefore' && k !== '__webLoadAfterL1'));
  assert.deepEqual(addedSinceL1, new Set(['FarmRoomTabs', 'FarmEquipmentCard']));
});

test('L5: every script of index.html exists, in the order the test loaded them', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
  for (const s of srcs) assert.ok(fs.existsSync(path.join(root, s)), s);
  assert.ok(!srcs.some(s => /web\/(capacity|calibration)\.js$/.test(s)));
  assert.ok(srcs.indexOf('web/shell.js') < srcs.indexOf('web/rooms.js'));
  assert.ok(srcs.indexOf('web/room-tabs.js') < srcs.indexOf('web/room-live.js'));
});

// docs/contracts/web.md table 7.5: load order and globals (C5 1.1, 1.3, 1.4).
const test = require('node:test');
const assert = require('node:assert/strict');

test('L1: load order, nothing throws', () => {
  const before = new Set(Object.keys(globalThis));
  assert.doesNotThrow(() => {
    require('../sim.js');
    require('../air.js');
    require('../controller.js');
    require('../runtime.js');
    require('../calib.js');
    require('../capacity.js');
    require('../room-rules.js');
    require('../web/ui.js');
    require('../web/api.js');
    require('../web/charts.js');
    require('../web/settings-panel.js');
    require('../web/shell.js');
  });
  globalThis.__webLoadBefore = before;
});

test('L2: globals of C5 1.1', () => {
  assert.equal(typeof globalThis.FarmUi, 'object');
  assert.equal(typeof globalThis.FarmApi, 'object');
  assert.equal(typeof globalThis.FarmCharts, 'object');
  assert.equal(typeof globalThis.FarmSettingsPanel, 'object');
  assert.equal(typeof globalThis.FarmShell, 'object');
  assert.equal(typeof globalThis.FarmShell.register, 'function');
});

test('L3: at most one global per file', () => {
  const before = globalThis.__webLoadBefore;
  const after = new Set(Object.keys(globalThis));
  const added = new Set([...after].filter(k => !before.has(k) && k !== '__webLoadBefore'));
  const expected = new Set(['ClimateSim', 'ClimateAir', 'ClimateController', 'ClimateRuntime', 'ClimateCalib', 'ClimateCapacity', 'ClimateRoomRules',
    'FarmUi', 'FarmApi', 'FarmCharts', 'FarmSettingsPanel', 'FarmShell']);
  // Exactly these 12 globals after L1: no more (FarmBench does not exist yet; web/simulator.js is not loaded).
  assert.deepEqual(added, expected);
  globalThis.__webLoadAfterL1 = expected;
});

test('L4: FarmShell.register recorder; FarmBench defined after web/simulator.js', () => {
  const FarmShell = globalThis.FarmShell;
  const recorded = [];
  FarmShell.register = (name, mod) => recorded.push({ name, mod });
  require('../web/simulator.js');
  require('../web/capacity.js');
  require('../web/calibration.js');
  assert.deepEqual(recorded.map(r => r.name), ['simulator', 'capacity', 'calibration']);
  for (const r of recorded) {
    assert.equal(typeof r.mod.mount, 'function');
    assert.equal(typeof r.mod.unmount, 'function');
  }
  assert.equal(typeof globalThis.FarmBench, 'object');

  // web/simulator.js defines FarmBench; web/capacity.js and web/calibration.js (today's cards) define no globals.
  const before = globalThis.__webLoadBefore, afterL1 = globalThis.__webLoadAfterL1;
  const afterAll = new Set(Object.keys(globalThis));
  const addedSinceL1 = new Set([...afterAll].filter(k => !before.has(k) && !afterL1.has(k) && k !== '__webLoadBefore' && k !== '__webLoadAfterL1'));
  assert.deepEqual(addedSinceL1, new Set(['FarmBench']));
});

// docs/contracts/web.md table 7.5: load order and globals (C5 1.1, 1.3, 1.4).
const test = require('node:test');
const assert = require('node:assert/strict');

test('L1: load order, nothing throws', () => {
  const before = new Set(Object.keys(globalThis));
  assert.doesNotThrow(() => {
    require('../sim.js');
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
  const added = [...after].filter(k => !before.has(k) && k !== '__webLoadBefore');
  const expected = new Set(['ClimateSim', 'ClimateController', 'ClimateRuntime', 'ClimateCalib', 'ClimateCapacity', 'ClimateRoomRules',
    'FarmUi', 'FarmApi', 'FarmCharts', 'FarmSettingsPanel', 'FarmShell', 'FarmBench']);
  for (const k of added) assert.ok(expected.has(k), `unexpected global ${k}`);
});

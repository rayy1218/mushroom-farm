// web/simulator.js: FarmBench, the wave 1 bridge (docs/contracts/web.md C5 3.5, table 7.6).
const test = require('node:test');
const assert = require('node:assert/strict');
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
require('../web/simulator.js');
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, FarmBench = globalThis.FarmBench;

test('FarmBench: lazy state, defaults', () => {
  assert.deepEqual(FarmBench.env, SIM.DEFAULT_ENV);
  const e1 = FarmBench.env, e2 = FarmBench.env;
  assert.equal(e1, e2);
  assert.deepEqual(FarmBench.cfg, CC.defaultSettings());
  assert.equal(FarmBench.tariff, 0.57);
  assert.equal(FarmBench.calApplied, null);
});

test('FarmBench.applyCalib: today\'s #calApply effect, no throw in Node', () => {
  assert.doesNotThrow(() => {
    FarmBench.applyCalib({ ua: 120, infAch: 0.6, moistBuffer: 4, co2PerBlock: 54.6 }, { T: 0.2, RH: 1.5, CO2: 30 });
  });
  assert.equal(FarmBench.env.room.ua, 120);
  assert.equal(FarmBench.env.room.infAch, 0.6);
  assert.equal(FarmBench.env.room.moistBuffer, 4);
  assert.equal(FarmBench.env.co2PerBlock, 55);
  const applied = FarmBench.calApplied;
  assert.deepEqual(applied, { ua: 120, infAch: 0.6, moistBuffer: 4, co2PerBlock: 55, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: applied.date });
  assert.equal(typeof applied.date, 'string');
  assert.doesNotThrow(() => new Date(applied.date).toISOString());
});

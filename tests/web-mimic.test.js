// web/simulator.js: mimicLayout, the air exchange of the room drawing (contract C9 section 7).
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
const { mimicLayout } = require('../web/simulator.js');
const SIM = globalThis.ClimateSim;

const INTAKE = { kind: 'fan', tag: 'SF-203', label: 'Filtered intake' };
const EXHAUST = { kind: 'fan', tag: 'EF-206', label: 'Exhaust' };

test('mimicLayout: the default room has the intake high and the exhaust low', () => {
  const { inletAt, exhaustAt } = SIM.DEFAULT_ENV;
  assert.deepEqual(mimicLayout({ inletAt, exhaustAt }), {
    inlet: { band: 'high', ...INTAKE },
    outlet: { band: 'low', ...EXHAUST },
  });
});

test('mimicLayout: four position cases, a fan on both walls', () => {
  for (const inletAt of ['high', 'low']) for (const exhaustAt of ['high', 'low']) {
    assert.deepEqual(mimicLayout({ inletAt, exhaustAt }), {
      inlet: { band: inletAt, ...INTAKE },
      outlet: { band: exhaustAt, ...EXHAUST },
    }, `${inletAt}/${exhaustAt}`);
  }
});

test('mimicLayout: an old env with vent gives the same drawing (vent is ignored)', () => {
  for (const vent of ['supply', 'exhaust']) {
    assert.deepEqual(mimicLayout({ vent, inletAt: 'low', exhaustAt: 'high' }), mimicLayout({ inletAt: 'low', exhaustAt: 'high' }));
  }
});

test('mimicLayout: a missing position falls back to intake high, exhaust low', () => {
  assert.deepEqual(mimicLayout({}), { inlet: { band: 'high', ...INTAKE }, outlet: { band: 'low', ...EXHAUST } });
});

// FarmMimic.layout (web/mimic.js), the air exchange of the room drawing (contract C9 section 7); simulator.js still exports it as mimicLayout.
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
require('../web/mimic.js');
const { mimicLayout, compareBars } = require('../web/simulator.js');
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

test('mimicLayout: simulator.js exports FarmMimic.layout itself', () => {
  assert.equal(mimicLayout, globalThis.FarmMimic.layout);
  assert.deepEqual(globalThis.FarmMimic.layout({ inletAt: 'low', exhaustAt: 'high' }), mimicLayout({ inletAt: 'low', exhaustAt: 'high' }));
});

// C13 6.3 (the 24 h test difference bars)
test('compareBars: change from your rules, better and worse, and "same" under 0.5', () => {
  const mine = { inT: 90, inRH: 80, total: 10 };
  const [a] = compareBars(mine, [{ name: 'No humidity priority', x: { inT: 92, inRH: 70, total: 10.2 } }]);
  assert.equal(a.name, 'No humidity priority');
  assert.equal(a.same, false);
  assert.deepEqual(a.rows.map(r => [r.key, r.verdict]), [['inT', 'better'], ['inRH', 'worse'], ['kwh', 'same']]);
  assert.equal(a.rows[0].delta, 2); assert.equal(a.rows[0].unit, 'points'); assert.equal(a.rows[2].unit, 'kWh');
});

test('compareBars: less energy is better, more is worse', () => {
  const mine = { inT: 90, inRH: 80, total: 10 };
  const [a, b] = compareBars(mine, [{ name: 'a', x: { ...mine, total: 9 } }, { name: 'b', x: { ...mine, total: 11 } }]);
  assert.equal(a.rows[2].verdict, 'better'); assert.equal(b.rows[2].verdict, 'worse');
});

test('compareBars: every change under 0.5 is "No difference"; 0.5 itself counts', () => {
  const mine = { inT: 90, inRH: 80, total: 10 };
  assert.equal(compareBars(mine, [{ name: 'x', x: { inT: 90.4, inRH: 79.6, total: 10.49 } }])[0].same, true);
  assert.equal(compareBars(mine, [{ name: 'x', x: { inT: 90.5, inRH: 80, total: 10 } }])[0].same, false);
  assert.deepEqual(compareBars(mine, []), []);
});


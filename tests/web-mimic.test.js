// web/simulator.js: mimicLayout, the fresh-air path of the room drawing (wave 2 draft, section 9.1).
const test = require('node:test');
const assert = require('node:assert/strict');
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
require('../web/simulator.js');
const SIM = globalThis.ClimateSim, { mimicLayout } = globalThis.FarmBench;

const SUPPLY_FAN = { kind: 'fan', tag: 'SF-203', label: 'Filtered supply air' };
const DAMPER = { kind: 'grille', tag: null, label: 'Air out (damper)' };
const OPEN_INLET = { kind: 'grille', tag: null, label: 'Air in (open inlet)' };
const EXHAUST_FAN = { kind: 'fan', tag: 'EF-203', label: 'Exhaust' };

test('mimicLayout: the default room is a supply fan high on the inlet wall, a damper low on the outlet wall', () => {
  const { vent, inletAt, exhaustAt } = SIM.DEFAULT_ENV;
  assert.deepEqual(mimicLayout({ vent, inletAt, exhaustAt }), {
    inlet: { band: 'high', ...SUPPLY_FAN },
    outlet: { band: 'low', ...DAMPER },
  });
});

test('mimicLayout: four vent and position cases', () => {
  const cases = [
    [{ vent: 'supply', inletAt: 'low', exhaustAt: 'high' }, { band: 'low', ...SUPPLY_FAN }, { band: 'high', ...DAMPER }],
    [{ vent: 'supply', inletAt: 'high', exhaustAt: 'low' }, { band: 'high', ...SUPPLY_FAN }, { band: 'low', ...DAMPER }],
    [{ vent: 'exhaust', inletAt: 'low', exhaustAt: 'high' }, { band: 'low', ...OPEN_INLET }, { band: 'high', ...EXHAUST_FAN }],
    [{ vent: 'exhaust', inletAt: 'high', exhaustAt: 'low' }, { band: 'high', ...OPEN_INLET }, { band: 'low', ...EXHAUST_FAN }],
  ];
  for (const [env, inlet, outlet] of cases) assert.deepEqual(mimicLayout(env), { inlet, outlet }, JSON.stringify(env));
});

test('mimicLayout: exactly one fan, on the inlet in supply mode and on the outlet in exhaust mode', () => {
  for (const vent of ['supply', 'exhaust']) {
    const L = mimicLayout({ vent, inletAt: 'high', exhaustAt: 'low' });
    assert.equal([L.inlet, L.outlet].filter(o => o.kind === 'fan').length, 1);
    assert.equal(L[vent === 'supply' ? 'inlet' : 'outlet'].kind, 'fan');
  }
});

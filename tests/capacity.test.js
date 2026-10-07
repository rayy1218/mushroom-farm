// Room capacity check (capacity.js). Spec: docs/superpowers/specs/2026-10-07-room-capacity-design.md
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js');
const CAP = globalThis.ClimateCapacity, CC = globalThis.ClimateController;

const room = { name: 'Room 1', volume: 60, vent: 'supply', calib: null };
const NOW = Date.parse('2026-10-07T12:00:00Z');

// ---------- common targets ----------
test('one crop: its own fruiting targets', () => {
  assert.deepEqual(CAP.commonTargets([{ crop: 'oyster', blocks: 2000 }]), { spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' });
});

test('a mix: block-weighted targets inside every range; the most CO2-sensitive crop sets the limit', () => {
  // 1200 × 25 °C + 800 × 26 °C = 25.4 °C -> rounded to 25.5
  assert.deepEqual(CAP.commonTargets([{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 800 }]), { spT: 25.5, spRH: 88, co2Lim: 1000, crop: 'oyster' });
  const g = CAP.commonTargets([{ crop: 'pink', blocks: 1500 }, { crop: 'golden', blocks: 500 }]);
  assert.equal(g.co2Lim, 800);
  assert.equal(g.crop, 'golden');
  assert.ok(g.spT >= 24 && g.spT <= 26, `${g.spT} inside both ranges`);
});

test('no common range: impossible, and the message names both crops', () => {
  const r = CAP.commonTargets([{ crop: 'oyster', blocks: 1200 }, { crop: 'milky', blocks: 800 }]);
  assert.equal(r.impossible, true);
  assert.match(r.conflict, /Grey oyster needs at most 27 °C, Milky .* needs at least 28 °C/);
});

test('an empty mix is refused', () => {
  assert.equal(CAP.commonTargets([{ crop: 'oyster', blocks: 0 }]).impossible, true);
});

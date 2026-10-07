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

test('targets are clamped into the overlap of the ranges', () => {
  // golden 24 °C × 1000 + abalone 27 °C × 10 = 24.03 °C; the overlap is [25, 26], so the target is 25
  assert.deepEqual(CAP.commonTargets([{ crop: 'golden', blocks: 1000 }, { crop: 'abalone', blocks: 10 }]), { spT: 25, spRH: 88, co2Lim: 800, crop: 'golden' });
});

test('a crop row with 0 blocks does not count', () => {
  assert.deepEqual(CAP.commonTargets([{ crop: 'oyster', blocks: 0 }, { crop: 'milky', blocks: 800 }]), { spT: 30, spRH: 85, co2Lim: 1000, crop: 'milky' });
});

test('equal CO2 limits: the crop with more blocks is named', () => {
  assert.equal(CAP.commonTargets([{ crop: 'oyster', blocks: 500 }, { crop: 'pink', blocks: 1500 }]).crop, 'pink');
});

test('bad input gives a message, not a crash or a wrong target', () => {
  assert.match(CAP.commonTargets([{ crop: 'truffle', blocks: 10 }]).conflict, /Unknown crop: truffle/);
  assert.equal(CAP.commonTargets([{ crop: 'oyster', blocks: '1200' }]).impossible, true, 'a text block count is not used');
});

// ---------- balance ----------
test('balance: the fan limit matches a hand calculation', () => {
  // 900 m³/h × (900 - 420) ppm / 45 mL/h per block = 9600 blocks
  const tg = CAP.commonTargets([{ crop: 'oyster', blocks: 1 }]);
  assert.equal(CAP.balance(room, [{ crop: 'oyster', blocks: 1 }], tg).fan, 9600);
  // An exhaust fan also gets the leakage air: (900 + 0.4 × 60) × 480 / 45 = 9856
  assert.equal(CAP.balance({ ...room, vent: 'exhaust' }, [{ crop: 'oyster', blocks: 1 }], tg).fan, 9856);
});

test('balance: a cooler crop carries fewer blocks; milky is limited by the fogger', () => {
  const est = crop => CAP.balance(room, [{ crop, blocks: 1 }], CAP.commonTargets([{ crop, blocks: 1 }]));
  assert.ok(est('golden').ac < est('oyster').ac && est('oyster').ac < est('pink').ac);
  assert.equal(est('milky').limit, 'fog');
});

test('balance: a fog need that is high when nearly empty still finds the upper limit', () => {
  // A leaky exhaust room: the empty room needs slightly more fog than the fogger gives, but blocks add water.
  const leaky = { ...room, vent: 'exhaust', calib: { ua: 80, infAch: 1, moistBuffer: 3, co2PerBlock: 45 } };
  const mix = [{ crop: 'milky', blocks: 1 }];
  assert.ok(CAP.balance(leaky, mix, CAP.commonTargets(mix)).fog > 4000);
});

test('balance: grey oyster is limited by the AC, near the measured value', () => {
  const mix = [{ crop: 'oyster', blocks: 1 }];
  const b = CAP.balance(room, mix, CAP.commonTargets(mix));
  assert.equal(b.limit, 'ac');
  assert.ok(b.ac > 3000 && b.ac < 3800, `${b.ac}`);
});

// ---------- trial ----------
test('trial: 2000 grey oyster pass all three design days', () => {
  const mix = [{ crop: 'oyster', blocks: 2000 }];
  const r = CAP.trial(room, mix, CAP.commonTargets(mix), 2000);
  assert.equal(r.pass, true, JSON.stringify(r.days));
  assert.equal(r.days.length, 3);
  assert.ok(r.kwhDay > 5 && r.kwhDay < 30, `${r.kwhDay} kWh/day`);
});

test('trial: too many blocks fail on temperature ("dense"); too few cool-crop blocks fail near saturation ("empty")', () => {
  const grey = [{ crop: 'oyster', blocks: 6000 }];
  const d = CAP.trial(room, grey, CAP.commonTargets(grey), 6000);
  assert.equal(d.side, 'dense');
  assert.ok(d.days.some(x => x.fails.includes('temperature too high')));
  const golden = [{ crop: 'golden', blocks: 200 }];
  const e = CAP.trial(room, golden, CAP.commonTargets(golden), 200);
  assert.equal(e.side, 'empty');
  assert.ok(e.days.some(x => x.fails.includes('humidity near saturation')));
});

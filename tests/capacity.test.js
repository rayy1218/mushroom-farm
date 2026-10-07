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
  const r = CAP.trial(room, mix, CAP.commonTargets(mix), 1999.6);
  assert.equal(r.pass, true, JSON.stringify(r.days));
  assert.equal(r.blocks, 2000);
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

test('trial: a nearly empty room is judged on the room, not on a false sensor fault', () => {
  // Noise-free CO2 would sit at exactly 420 ppm and look like a frozen sensor; the trial must still label this "empty".
  const golden = [{ crop: 'golden', blocks: 200 }];
  assert.equal(CAP.trial(room, golden, CAP.commonTargets(golden), 0).side, 'empty');
});

test('trial: bad input is refused with a clear error; blocks are rounded', () => {
  const mix = [{ crop: 'oyster', blocks: 2000 }], tg = CAP.commonTargets(mix);
  assert.throws(() => CAP.trial(room, mix, tg, 2000, 'mars'), /Unknown region: mars/);
  assert.throws(() => CAP.trial(room, mix, tg, NaN), /finite number/);
  assert.throws(() => CAP.balance(room, mix, tg, 'mars'), /Unknown region: mars/);
});

// ---------- calibration status ----------
test('calibration status: none, good, poor, old', () => {
  assert.equal(CAP.calibStatus(room, NOW).estimate, true);
  const cal = { ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: '2026-10-01T00:00:00Z' };
  assert.deepEqual(CAP.calibStatus({ ...room, calib: cal }, NOW), { calibrated: true, estimate: false, warnings: [] });
  const poor = CAP.calibStatus({ ...room, calib: { ...cal, rmse: { T: 0.9, RH: 1, CO2: 20 } } }, NOW);
  assert.equal(poor.estimate, true);
  const old = CAP.calibStatus({ ...room, calib: { ...cal, date: '2026-05-01T00:00:00Z' } }, NOW);
  assert.equal(old.estimate, false);
  assert.match(old.warnings[0], /days old/);
});

// ---------- verdicts ----------
test('verdict thresholds', () => {
  const cap = { max: 1000, min: 0 };
  const v = n => CAP.verdictOf(n, cap).verdict;
  assert.equal(v(490), 'too-empty');
  assert.equal(v(500), 'good');
  assert.equal(v(894), 'good');                 // 89.4 % shows as 89 %
  assert.equal(v(896), 'tight');                // 89.6 % shows as 90 %
  assert.equal(v(900), 'tight');
  assert.equal(v(1000), 'tight');
  assert.equal(v(1004), 'too-dense');           // above the capacity is too dense, even when 100.4 % rounds to 100 %
  assert.equal(CAP.verdictOf(1004, cap).utilisation, 101, 'the number shown matches the verdict');
  assert.equal(CAP.verdictOf(1200, { max: 2000, min: 600 }).verdict, 'good', 'above the minimum: not too wet');
  assert.equal(v(1006), 'too-dense');           // 100.6 % shows as 101 %
  assert.equal(CAP.verdictOf(400, cap, { emptyBelow: 30 }).verdict, 'good');
  assert.equal(CAP.verdictOf(500, { max: 0, min: 0 }).verdict, 'impossible');
  assert.deepEqual(CAP.verdictOf(500, { max: 2000, min: 600 }), { verdict: 'too-empty', why: 'wet', utilisation: 25 });
});

test('calibration status: a missing fit error or date is not trusted', () => {
  const cal = { ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: '2026-10-01T00:00:00Z' };
  const st = c => CAP.calibStatus({ ...room, calib: c }, NOW);
  assert.equal(st({ ...cal, rmse: { T: 0.2, RH: 1, CO2: NaN } }).estimate, true, 'a log without CO2 readings');
  assert.equal(st(JSON.parse(JSON.stringify({ ...cal, rmse: { T: 0.2, RH: 1, CO2: NaN } }))).estimate, true, 'the same after saving (NaN -> null)');
  assert.equal(st({ ...cal, rmse: undefined }).estimate, true, 'no fit error at all');
  assert.match(st({ ...cal, date: '' }).warnings.join(' '), /no valid date/);
  assert.match(st({ ...cal, date: '2027-01-01T00:00:00Z' }).warnings.join(' '), /no valid date/, 'a date in the future');
  const none = CAP.calibStatus(room, NOW);
  assert.equal(none.calibrated, false);
  assert.match(none.warnings[0], /not calibrated/);
});

// ---------- full check ----------
test('check: the capacity is the real limit (passes at the capacity, fails 10 % above)', () => {
  // A room with other walls, leaks and blocks than the default: the search must still find its limit.
  const hidden = { ...room, calib: { ua: 140, infAch: 0.9, moistBuffer: 4, co2PerBlock: 60, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
  const mix = [{ crop: 'oyster', blocks: 2000 }];
  const t0 = Date.now();
  const r = CAP.check(hidden, mix, { now: NOW });
  assert.ok(Date.now() - t0 < 20000, 'a full check takes less than 20 s');
  assert.ok(r.capacity.max > 0 && r.capacity.settled, JSON.stringify(r.capacity));
  const tg = CAP.commonTargets(mix);
  assert.equal(CAP.trial(hidden, mix, tg, r.capacity.max).pass, true);
  assert.equal(CAP.trial(hidden, mix, tg, r.capacity.max * 1.1).pass, false);
});

test('check: 2000 grey oyster in the default room is good; 6000 is too dense', () => {
  const good = CAP.check(room, [{ crop: 'oyster', blocks: 2000 }], { now: NOW });
  assert.equal(good.verdict, 'good');
  assert.equal(good.estimate, true, 'uncalibrated room: the report is an estimate');
  assert.ok(good.energy.rmPerBlockCycle > 0);
  assert.equal(good.limit[0].day, 'Hot-humid');
  const dense = CAP.check(room, [{ crop: 'oyster', blocks: 6000 }], { now: NOW });
  assert.equal(dense.verdict, 'too-dense');
  assert.ok(dense.utilisation > 100);
});

test('check: 200 golden oyster is too empty (too wet), with a minimum and a maximum', () => {
  const r = CAP.check(room, [{ crop: 'golden', blocks: 200 }], { now: NOW });
  assert.equal(r.verdict, 'too-empty');
  assert.equal(r.why, 'wet');
  assert.ok(r.capacity.min > 200 && r.capacity.min < r.capacity.max, JSON.stringify(r.capacity));
});

test('check: an impossible mix runs no simulation', () => {
  const r = CAP.check(room, [{ crop: 'oyster', blocks: 1200 }, { crop: 'milky', blocks: 800 }], { now: NOW });
  assert.equal(r.verdict, 'impossible');
  assert.equal(r.runs.length, 0);
});

test('check: the capacity is split over the crops in the mix ratios', () => {
  const r = CAP.check(room, [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 800 }], { now: NOW });
  const [a, b] = r.perCrop;
  assert.ok(a.max + b.max <= r.capacity.max && a.max + b.max >= r.capacity.max - 1);
  assert.ok(Math.abs(a.max / b.max - 1.5) < 0.01);
});

test('check: a balance estimate of 0 does not send the search to 1 block', () => {
  // A room that loses a lot of heat through its walls: the simple balance gives up (0), the simulation decides.
  const warm = { ...room, calib: { ua: 200, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
  const mix = [{ crop: 'black', blocks: 1000 }];
  assert.equal(CAP.balance(warm, mix, CAP.commonTargets(mix)).estimate, 0, 'the balance gives up on this room');
  const r = CAP.check(warm, mix, { now: NOW });
  assert.ok(r.runs[1].blocks > 500, `the second run is not a jump to 1 block: ${r.runs.map(x => x.blocks).join(',')}`);
  assert.equal(r.verdict, 'impossible', 'too hot at every size, as the simulation shows');
  assert.ok(r.limit.some(l => l.fails.includes('temperature too high')));
});

test('check: a too-wet plan with a low estimate still finds the pass window', () => {
  // A large, tight room: 100 black oyster blocks are too wet, and the estimate (about 80) is below the plan.
  const big = { ...room, volume: 120, calib: { ua: 150, infAch: 0.2, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
  const r = CAP.check(big, [{ crop: 'black', blocks: 100 }], { now: NOW });
  assert.equal(r.verdict, 'too-empty', r.runs.map(x => x.blocks + (x.pass ? 'P' : x.side)).join(' '));
  assert.equal(r.why, 'wet');
  assert.ok(r.capacity.min > 100 && r.capacity.max > r.capacity.min, JSON.stringify(r.capacity));
});

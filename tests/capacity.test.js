// Room capacity check (capacity.js). Spec: docs/superpowers/specs/2026-10-07-room-capacity-design.md
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js');
// C9 bridge (lead deletes at step 2). Test only: until the controller stream merges, controller.js still speaks the old fan shapes.
// This makes it speak C9's: cmd.air, manual.air, rules.purgeMaxS, and on/off purges in place of steady air.
// It does nothing once controller.js has manual.air; the lead deletes it at step 2.
(function bridge(CC) {
  if (CC.defaultSettings().manual.air) return;
  const fix = cfg => { cfg.manual.air = { auto: true, on: false }; cfg.rules.airMode = 'purge'; cfg.rules.purgeMaxS = 180; return cfg; };
  const { defaultRules, defaultSettings, importSettings, create } = CC;
  CC.defaultRules = lim => ({ ...defaultRules(lim), airMode: 'purge', purgeMaxS: 180 });
  CC.defaultSettings = () => fix(defaultSettings());
  CC.importSettings = input => {
    const r = importSettings(input);
    return { settings: fix(r.settings), warnings: r.warnings.filter(w => !w.includes('"manual.air')) };
  };
  CC.create = (cfg, snapshot, onEvent) => {
    const ctl = create(cfg, snapshot, onEvent), update = ctl.update;
    ctl.update = r => { const c = update(r); return { ...c, air: { on: c.fan.level > 0 } }; };
    return ctl;
  };
})(globalThis.ClimateController);
// end of C9 bridge
const CAP = globalThis.ClimateCapacity, CC = globalThis.ClimateController, SIM = globalThis.ClimateSim, AIR = globalThis.ClimateAir;

const room = { name: 'Room 1', volume: 60, calib: null };
const NOW = Date.parse('2026-10-07T12:00:00Z');
// A leaky room: with the fans off between purges, its leakage brings in wet outdoor air. With few blocks
// (little heat, so the AC seldom dries the air) it runs near saturation on the mild, rainy day.
const leaky = { ...room, calib: { ua: 80, infAch: 2, moistBuffer: 3, co2PerBlock: 45 } };

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
test('balance: the air exchange limit matches a hand calculation with ClimateAir', () => {
  // oyster: purge 900 -> 700 ppm, cap 180 s, 1800 m³/h, 45 mL/h per block, 60 m³, 420 ppm outside
  const mix = [{ crop: 'oyster', blocks: 1 }], tg = CAP.commonTargets(mix);
  const time = (n, m3h) => AIR.purgeTimeS({ volume: 60, co2Out: 420, leakM3h: 0, prodM3h: n * 45 / 1e6, m3h, start: 900, stop: 700 });
  const b = CAP.balance(room, mix, tg);
  assert.ok(time(b.air, 1800) <= 180 && time(b.air + 1, 1800) > 180, `${b.air}`);
  // closed form: 60/1800 h × ln((900 - css)/(700 - css)) = 180 s  ->  css = 642.56 ppm  ->  n = (642.56 - 420) × 1800 / 45
  assert.equal(b.air, 8902);
  const small = CAP.balance({ ...room, airM3h: 900 }, mix, tg);
  assert.ok(time(small.air, 900) <= 180 && time(small.air + 1, 900) > 180, `${small.air}`);
  assert.equal(small.limit, 'air');
  assert.equal(small.estimate, small.air);
});

test('balance: the leakage is a floor of the outdoor air; it does not change the air limit; the old vent field is ignored', () => {
  const mix = [{ crop: 'oyster', blocks: 1 }], tg = CAP.commonTargets(mix);
  const cal = { ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 };
  const a = CAP.balance({ ...room, calib: cal }, mix, tg);
  assert.deepEqual(CAP.balance({ ...room, calib: { ...cal, infAch: 2 } }, mix, tg), a, 'a floor below the blocks\' air changes nothing');
  assert.deepEqual(CAP.balance({ ...room, calib: cal, vent: 'exhaust' }, mix, tg), a);
  // 10 air changes an hour (600 m³/h) is above the air the blocks need up to about 5000 blocks (n = 600 × 380 / 45): the AC carries it
  const leaky = CAP.balance({ ...room, calib: { ...cal, infAch: 10 } }, mix, tg);
  assert.equal(leaky.air, a.air);
  assert.ok(leaky.ac < a.ac / 2, `${leaky.ac} vs ${a.ac}`);
});

test('balance: the room size is held to 50-10000 and a non-number means the default', () => {
  const mix = [{ crop: 'oyster', blocks: 1 }], tg = CAP.commonTargets(mix);
  const def = CAP.balance(room, mix, tg);
  for (const x of ['900', NaN, null, undefined]) assert.deepEqual(CAP.balance({ ...room, airM3h: x }, mix, tg), def, String(x));
  assert.deepEqual(CAP.balance({ ...room, airM3h: 20000 }, mix, tg), CAP.balance({ ...room, airM3h: 10000 }, mix, tg));
  assert.deepEqual(CAP.balance({ ...room, airM3h: 10 }, mix, tg), CAP.balance({ ...room, airM3h: 50 }, mix, tg));
  assert.equal(CAP.airOf({ airM3h: 20000 }), 10000);
  assert.equal(CAP.airOf({}), 1800);
});

test('balance: no air exchange limit up to 100000 blocks is Infinity', () => {
  // 5 mL/h per block at 10000 m³/h: 100000 blocks hold 470 ppm and purge 900 -> 700 in 14 s
  const mix = [{ crop: 'oyster', blocks: 1, co2PerBlock: 5 }];
  assert.equal(CAP.balance({ ...room, airM3h: 10000 }, mix, CAP.commonTargets(mix)).air, Infinity);
});

test('balance: a cooler crop carries fewer blocks; milky is limited by the fogger', () => {
  const est = crop => CAP.balance(room, [{ crop, blocks: 1 }], CAP.commonTargets([{ crop, blocks: 1 }]));
  assert.ok(est('golden').ac < est('oyster').ac && est('oyster').ac < est('pink').ac);
  assert.equal(est('milky').limit, 'fog');
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
  const e = CAP.trial(leaky, golden, CAP.commonTargets(golden), 200);
  assert.equal(e.side, 'empty');
  assert.ok(e.days.some(x => x.fails.includes('humidity near saturation')));
});

test('trial: a nearly empty room is judged on the room, not on a false sensor fault', () => {
  // Noise-free CO2 would sit at exactly 420 ppm and look like a frozen sensor; the trial must still label this "empty"
  // (the leaky room is too wet when empty).
  const golden = [{ crop: 'golden', blocks: 200 }];
  assert.equal(CAP.trial(leaky, golden, CAP.commonTargets(golden), 0).side, 'empty');
});

test('trial: bad input is refused with a clear error; blocks are rounded', () => {
  const mix = [{ crop: 'oyster', blocks: 2000 }], tg = CAP.commonTargets(mix);
  assert.throws(() => CAP.trial(room, mix, tg, 2000, 'mars'), /Unknown region: mars/);
  assert.throws(() => CAP.trial(room, mix, tg, NaN), /finite number/);
  assert.throws(() => CAP.balance(room, mix, tg, 'mars'), /Unknown region: mars/);
});

test('trial: the room size of the air exchange reaches the simulation', () => {
  const mix = [{ crop: 'oyster', blocks: 2000 }], tg = CAP.commonTargets(mix);
  const base = CAP.trial(room, mix, tg, 2000);
  assert.deepEqual(CAP.trial({ ...room, airM3h: 1800 }, mix, tg, 2000), base, 'no size is the default 1800 m³/h');
  const small = CAP.trial({ ...room, airM3h: 900 }, mix, tg, 2000);
  assert.notDeepEqual(small, base);
  // energy per m³ moved is the same for any size, so the day's energy hardly changes
  assert.ok(Math.abs(small.kwhDay - base.kwhDay) / base.kwhDay < 0.1, `${small.kwhDay} vs ${base.kwhDay}`);
  assert.deepEqual(CAP.trial({ ...room, airM3h: 20000 }, mix, tg, 2000), CAP.trial({ ...room, airM3h: 10000 }, mix, tg, 2000), 'held to 10000');
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

test('check: 200 golden oyster is too empty (too wet), with a minimum and a maximum', { todo: 'C9: the lead re-measures with the C9 controller at step 2' }, () => {
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
  const warm = { ...room, calib: { ua: 300, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
  const mix = [{ crop: 'black', blocks: 1000 }];
  assert.equal(CAP.balance(warm, mix, CAP.commonTargets(mix)).estimate, 0, 'the balance gives up on this room');
  const r = CAP.check(warm, mix, { now: NOW });
  assert.ok(r.runs[1].blocks > 500, `the second run is not a jump to 1 block: ${r.runs.map(x => x.blocks).join(',')}`);
  assert.ok(r.capacity.max < 100, `too hot above a few dozen blocks, as the simulation shows: ${JSON.stringify(r.capacity)}`);
  assert.ok(r.limit.some(l => l.fails.includes('temperature too high')));
});

test('check: a too-wet plan with a low estimate still finds the pass window', { todo: 'C9: the lead re-measures with the C9 controller at step 2' }, () => {
  // A large, tight room: 100 black oyster blocks are too wet, and the estimate (about 80) is below the plan.
  const big = { ...room, volume: 120, calib: { ua: 150, infAch: 0.2, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
  const r = CAP.check(big, [{ crop: 'black', blocks: 100 }], { now: NOW });
  assert.equal(r.verdict, 'too-empty', r.runs.map(x => x.blocks + (x.pass ? 'P' : x.side)).join(' '));
  assert.equal(r.why, 'wet');
  assert.ok(r.capacity.min > 100 && r.capacity.max > r.capacity.min, JSON.stringify(r.capacity));
});

// ---------- air exchange in the simulation (C9 4) ----------
const CMD = (air, extra = {}) => ({ ac: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 0 },
  lights: { on: false }, circ: { on: false }, ...(air === undefined ? {} : { air: { on: air } }), ...extra });
// An empty room (no blocks, no doors) with both zones at 1420 ppm, 1000 ppm above the outdoor air.
function airRoom(over = {}) {
  const e = { ...structuredClone(SIM.DEFAULT_ENV), blocks: 0, dailyCycle: false, ...over };
  const sim = SIM.create(e);
  sim.setRoom({ T: 25, RH: 85, CO2: 1420 });
  return sim;
}
const zoneC = sim => { const z = sim.view().zones; return { lo: z.lo.C, hi: z.hi.C }; };

test('sim: plant and environment of the air exchange', () => {
  assert.deepEqual(SIM.PLANT.air, { m3h: 1800, wPerM3h: 0.08 });
  assert.equal(SIM.PLANT.fan, undefined);
  assert.equal(SIM.DEFAULT_ENV.airM3h, null);
  assert.equal('vent' in SIM.DEFAULT_ENV, false);
  assert.equal(SIM.DEFAULT_ENV.inletAt, 'high');
  assert.equal(SIM.DEFAULT_ENV.exhaustAt, 'low');
});

test('sim: fans on, intake high and exhaust low: outdoor air enters high, no leakage', () => {
  const sim = airRoom();
  sim.step(1, CMD(true));
  const c = zoneC(sim);
  // high zone: 0.5 m³/s of 420 ppm air in, 0.5 m³/s of zone air on to the low zone, 30 m³: -1000 × 0.5 / 30 ppm
  assert.ok(Math.abs(c.hi - (1420 - 1000 * 0.5 / 30)) < 1e-9, `${c.hi}`);
  assert.ok(Math.abs(c.lo - 1420) < 1e-9, `${c.lo}`);   // the low zone gets high-zone air at 1420 ppm and loses the same
});

test('sim: fans on, intake low and exhaust high: outdoor air enters low', () => {
  const sim = airRoom({ inletAt: 'low', exhaustAt: 'high' });
  sim.step(1, CMD(true));
  const c = zoneC(sim);
  assert.ok(Math.abs(c.lo - (1420 - 1000 * 0.5 / 30)) < 1e-9, `${c.lo}`);
  assert.ok(Math.abs(c.hi - 1420) < 1e-9, `${c.hi}`);
});

test('sim: env.airM3h sets the airflow', () => {
  const sim = airRoom({ airM3h: 900 });
  sim.step(1, CMD(true));
  assert.ok(Math.abs(zoneC(sim).hi - (1420 - 1000 * 0.25 / 30)) < 1e-9);
});

test('sim: fans off: only leakage, half through each zone', () => {
  const sim = airRoom();
  sim.step(1, CMD(false));
  const c = zoneC(sim), leak = 0.4 * 60 / 3600;   // m³/s
  for (const zn of ['lo', 'hi']) assert.ok(Math.abs(c[zn] - (1420 - 1000 * leak / 2 / 30)) < 1e-9, `${zn} ${c[zn]}`);
});

test('sim: unfiltered air is the leakage (fans off) and the door, never the intake', () => {
  const on = airRoom(), off = airRoom();
  for (let i = 0; i < 3600; i++) { on.step(1, CMD(true)); off.step(1, CMD(false)); }
  assert.equal(on.view().unfilteredM3, 0);
  assert.ok(Math.abs(off.view().unfilteredM3 - 24) < 1e-6, `${off.view().unfilteredM3}`);   // 0.4 × 60 m³ in 1 h
  const door = airRoom();
  door.trigger('door');
  for (let i = 0; i < 60; i++) door.step(1, CMD(true));
  assert.ok(Math.abs(door.view().unfilteredM3 - 15) < 1e-6, `${door.view().unfilteredM3}`); // 0.25 m³/s for 60 s
});

test('sim: power, energy and run time of the air exchange', () => {
  const sim = airRoom();
  for (let i = 0; i < 3600; i++) sim.step(1, CMD(true));
  let v = sim.view();
  assert.ok(Math.abs(v.power.air - 144) < 1e-9);               // 1800 m³/h × 0.08 W
  assert.ok(Math.abs(v.kwh.air - 0.144) < 1e-9);
  assert.equal(sim.snapshot().runS.air, 3600);
  for (let i = 0; i < 600; i++) sim.step(1, CMD(false));
  v = sim.view();
  assert.equal(v.power.air, 0);
  assert.ok(Math.abs(v.kwh.air - 0.144) < 1e-9);
  assert.equal(sim.snapshot().runS.air, 3600);
  const r = sim.read();
  for (const k of ['power', 'kwh']) { assert.ok('air' in r[k], k); assert.equal('fan' in r[k], false, k); }
  assert.equal(r.runS.air, 3600);
  assert.equal('fan' in r.runS, false);
  const half = airRoom({ airM3h: 900 });
  half.step(1, CMD(true));
  assert.ok(Math.abs(half.view().power.air - 72) < 1e-9);
});

test('sim: view() shows the air exchange and the leakage', () => {
  const sim = airRoom();
  sim.step(1, CMD(true));
  assert.equal(sim.view().act.air, true);
  assert.equal(sim.view().airM3h, 1800);
  assert.equal('fanLevel' in sim.view().act, false);
  sim.step(1, CMD(false));
  assert.equal(sim.view().act.air, false);
  assert.ok(Math.abs(sim.view().airM3h - 24) < 1e-9);          // leakage 0.4 × 60 m³/h
});

test('sim: an old fan command and an old vent field are ignored', () => {
  const sim = airRoom();
  sim.step(1, CMD(undefined, { fan: { level: 3 } }));
  assert.equal(sim.view().act.air, false);
  assert.equal(sim.view().power.air, 0);
  const a = airRoom(), b = airRoom({ vent: 'exhaust' });
  for (let i = 0; i < 600; i++) { a.step(1, CMD(i % 120 < 30)); b.step(1, CMD(i % 120 < 30)); }
  assert.deepEqual(b.snapshot(), a.snapshot());
});

test('sim: env.airM3h is held to 50-10000; anything but a number means the default', () => {
  const power = airM3h => { const sim = airRoom({ airM3h }); sim.step(1, CMD(true)); return sim.view().power.air; };
  assert.ok(Math.abs(power(20000) - 800) < 1e-9);   // 10000 m³/h × 0.08 W
  assert.ok(Math.abs(power(10) - 4) < 1e-9);        // 50 m³/h
  for (const x of [null, undefined, NaN, '900']) assert.ok(Math.abs(power(x) - 144) < 1e-9, String(x));
  const sim = airRoom({ airM3h: 20000 });
  sim.step(1, CMD(true));
  assert.equal(sim.view().airM3h, 10000);
});

test('sim: an old snapshot (fan level, fan meters) is upgraded', () => {
  const sim = airRoom();
  for (let i = 0; i < 40; i++) sim.step(1, CMD(true));
  const old = sim.snapshot();
  delete old.act.air; old.act.fanLevel = 2;
  for (const k of ['p', 'kwh', 'runS']) { old[k].fan = old[k].air; delete old[k].air; }
  for (const k of ['power', 'kwh', 'runS']) { old.reading[k].fan = old.reading[k].air; delete old.reading[k].air; }
  const up = SIM.create(sim.env, old).snapshot();
  assert.equal(up.act.air, true);
  assert.equal('fanLevel' in up.act, false);
  for (const k of ['p', 'kwh', 'runS']) {
    assert.equal(up[k].air, sim.snapshot()[k].air, k);
    assert.equal('fan' in up[k], false, k);
  }
  assert.equal(up.reading.kwh.air, sim.snapshot().reading.kwh.air);
  assert.equal('fan' in up.reading.power, false);
  assert.equal(up.reading.runS.air, sim.snapshot().reading.runS.air);
  assert.equal('fan' in up.reading.runS, false);
  assert.deepEqual(SIM.create(sim.env, up).snapshot(), up, 'upgrading twice changes nothing');
  old.act.fanLevel = 0;
  assert.equal(SIM.create(sim.env, old).snapshot().act.air, false);
  assert.deepEqual(SIM.create(sim.env, sim.snapshot()).snapshot(), sim.snapshot(), 'a new snapshot is unchanged');
});

test('sim: a smaller pair runs longer to move the same air', () => {
  const runS = airM3h => {
    const sim = airRoom({ airM3h });
    // fans on until the room is back to 700 ppm
    while (sim.view().zones.hi.C > 700 || sim.view().zones.lo.C > 700) sim.step(1, CMD(true));
    return sim.snapshot().runS.air;
  };
  assert.ok(runS(900) > runS(1800));
});

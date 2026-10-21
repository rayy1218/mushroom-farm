import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satW, rhOf, wOf, initialState, step, outdoorAt, dewOf, wetBulb } from '../device/sim-model.js';

const P = { volume: 60, blocks: 500, co2PerBlock: 60, wallUA: 80, sunW: 0, outdoorT: 32, outdoorRH: 80, fanFlow: 600, acKW: 3.5, humidifierGH: 2000 };
const OFF = { intake: false, exhaust: false, circulation: false, humidifier: false, ac: null };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);
const AIR_CP = 1.2 * 1.006;
const capAir = (v = 60) => v * AIR_CP * 3; // kJ/K of the air node
const capMass = (v = 60, n = 0) => v * 10 + n * 4; // kJ/K of the mass node

function run(state, inputs, params, seconds, dt = 60) {
  let s = state, acting;
  for (let t = 0; t < seconds; t += dt) ({ state: s, acting } = step(s, inputs, params, dt));
  return { state: s, acting };
}
const noBlocks = { ...P, blocks: 0 };
// A state level with itself: mass at the air's T, surfaces at the air's RH. A T without a W gets 60 % RH.
const start = (over = {}, params = noBlocks) => {
  const s = { ...initialState(params), ...over };
  if (over.T !== undefined && over.W === undefined) s.W = wOf(over.T, 60);
  return { ...s, Tm: over.Tm ?? s.T, Hs: over.Hs ?? rhOf(s.T, s.W) };
};
// The outdoor equal to the room: leakage and walls then change nothing.
const still = (s, params = noBlocks) => ({ ...params, outdoorT: s.T, outdoorRH: rhOf(s.T, s.W) });
// Water in the air and on the surfaces, g.
const water = (s, v = 60) => s.W * v + (s.Hs / 100) * 3 * satW(25) * v;

test('saturation: Magnus values', () => {
  near(satW(20), 17.3, 0.2, 'satW(20)');
  near(satW(30), 30.4, 0.3, 'satW(30)');
  assert.ok(satW(30) > satW(20));
});

test('RH and W round trip', () => {
  for (const [T, RH] of [[10, 30], [22, 85], [32, 80], [40, 100]]) near(rhOf(T, wOf(T, RH)), RH, 1e-9);
  near(wOf(20, 50), satW(20) / 2, 1e-9);
  assert.equal(rhOf(20, 1000), 100);
  assert.equal(rhOf(20, -1), 0);
});

test('dewOf inverts the saturation curve', () => {
  for (const T of [-5, 0, 12, 24, 27.9]) near(dewOf(satW(T)), T, 1e-6);
  near(dewOf(wOf(32, 80)), 27.9, 0.1);
});

test('wetBulb: the aircon rating point and a wet room', () => {
  near(wetBulb(27, 47), 19, 0.4);
  near(wetBulb(22, 90), 20.9, 0.3);
  near(wetBulb(30, 100), 30, 0.3);
});

test('initialState starts at outdoor air, 420 ppm, mass and surfaces level with the air', () => {
  const s = initialState(P);
  assert.equal(s.T, 32);
  near(rhOf(s.T, s.W), 80, 1e-9);
  assert.equal(s.CO2, 420);
  assert.equal(s.Tm, 32);
  assert.equal(s.Hs, 80);
});

test('a state without mass and surfaces (from before) starts them level with the air', () => {
  const r = step({ T: 25, W: wOf(25, 70), CO2: 500 }, OFF, { ...noBlocks, outdoorT: 25, outdoorRH: 70 }, 5);
  near(r.state.Tm, 25, 1e-6);
  near(r.state.Hs, 70, 0.01);
});

test('outdoorAt: night low at 03:00, day high at 15:00, dew point all day, sun from 07:00 to 19:00', () => {
  const o = { outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24 };
  const at = (h) => outdoorAt(o, h * 3600);
  near(at(3).outdoorT, 25, 1e-9);
  near(at(15).outdoorT, 33, 1e-9);
  near(at(9).outdoorT, 29, 1e-9);
  near(at(21).outdoorT, 29, 1e-9);
  near(at(27).outdoorT, 25, 1e-9); // wraps after midnight
  near(dewOf(wOf(at(3).outdoorT, at(3).outdoorRH)), 24, 1e-6);
  near(dewOf(wOf(at(15).outdoorT, at(15).outdoorRH)), 24, 1e-6);
  near(at(15).outdoorRH, 61, 1); // a hot afternoon
  near(at(3).outdoorRH, 94, 1); // a humid night
  const flat = outdoorAt({ outdoorHigh: 30, outdoorLow: 30, outdoorDew: 30 }, 0);
  assert.equal(flat.outdoorT, 30);
  near(flat.outdoorRH, 100, 1e-9);
  near(at(13).sun, 1, 1e-9);
  near(at(10).sun, Math.sin(Math.PI / 4), 1e-9);
  for (const h of [0, 6, 7, 19, 22]) assert.equal(at(h).sun, 0, `sun at ${h}`);
});

test('walls and leakage bring in heat by wallUA and the leaking air; the air and the mass share it', () => {
  const s0 = start({ T: 22 });
  const p = { ...noBlocks, outdoorT: 32, outdoorRH: (s0.W / satW(32)) * 100 }; // the same water outdoors
  const r = step(s0, OFF, p, 5);
  const gained = (r.state.T - 22) * capAir() + (r.state.Tm - 22) * capMass();
  near(gained, (0.08 + (0.3 * 60 * AIR_CP) / 3600) * 10 * 5, 0.02);
  // over an hour the air warms first, the mass follows
  const h = run(s0, OFF, p, 3600, 5);
  assert.ok(h.state.T > h.state.Tm && h.state.Tm > 22 && h.state.T < 32);
  const panel = run(s0, OFF, { ...p, wallUA: 28 }, 3600, 5);
  const brick = run(s0, OFF, { ...p, wallUA: 283 }, 3600, 5);
  assert.ok(panel.state.T < h.state.T && h.state.T < brick.state.T);
});

test('exchange: full pair, one fan alone (30 %, at least the leakage), leakage', () => {
  const s0 = start({ T: 22, CO2: 2000 });
  const full = run(s0, { ...OFF, intake: true, exhaust: true }, noBlocks, 600);
  const half = run(s0, { ...OFF, intake: true }, noBlocks, 600);
  const half2 = run(s0, { ...OFF, exhaust: true }, noBlocks, 600);
  const leak = run(s0, OFF, noBlocks, 600);
  assert.equal(full.acting.exchangeM3h, 600);
  near(half.acting.exchangeM3h, 180, 1e-9);
  near(half2.acting.exchangeM3h, 180, 1e-9);
  near(leak.acting.exchangeM3h, 0.3 * 60, 1e-9);
  near(step(s0, { ...OFF, intake: true }, { ...noBlocks, fanFlow: 10 }, 5).acting.exchangeM3h, 18, 1e-9, 'never below the leakage');
  assert.ok(full.state.CO2 < half.state.CO2 && half.state.CO2 < leak.state.CO2 && leak.state.CO2 < 2000);
  // full: k = 600/60 = 10 /h; after 10 min e^-1.667 of the excess
  near(full.state.CO2, 420 + 1580 * Math.exp(-10 / 6), 15);
  assert.ok(full.state.T > half.state.T && half.state.T > leak.state.T);
});

test('exchange moves W toward outdoor', () => {
  const dry = start({ T: 32, W: wOf(32, 20) });
  const r = run(dry, { ...OFF, intake: true, exhaust: true }, noBlocks, 600);
  assert.ok(r.state.W > dry.W);
  assert.ok(r.state.W <= wOf(32, 80) + 1e-9);
});

test('the air turns over in minutes: a purge moves the air temperature fast, the mass slowly', () => {
  const s0 = start({ T: 22 });
  const r = run(s0, { ...OFF, intake: true, exhaust: true }, { ...noBlocks, fanFlow: 1200, outdoorRH: 50 }, 120, 5);
  assert.ok(r.state.T - 22 > 1.5, `air ${r.state.T}`);
  assert.ok(r.state.Tm - 22 < 0.3, `mass ${r.state.Tm}`);
});

test('blocks: CO2, water that falls as the air gets wetter, and their heat into the mass', () => {
  const at = (rh) => {
    const s0 = start({ T: 25, W: wOf(25, rh) }, P);
    return { s0, r: step(s0, OFF, still(s0, P), 5), none: step(s0, OFF, still(s0, noBlocks), 5) };
  };
  const { s0, r, none } = at(90);
  // CO2: 500 x 60 mL/h = 30 L/h = 0.03 m3/h over 60 m3 -> 500 ppm/h
  near(r.state.CO2 - s0.CO2, (500 / 3600) * 5, 0.01);
  // water at 90 % RH: 0.3 g/h per block; 0.6 at 80 %; none at 100 %
  near(water(r.state) - water(none.state), (500 * 0.3 / 3600) * 5, 0.003);
  near(water(at(80).r.state) - water(at(80).none.state), (500 * 0.6 / 3600) * 5, 0.006);
  near(water(at(100).r.state) - water(at(100).none.state), 0, 1e-3);
  // heat: respiration less evaporation, into the mass
  near(r.acting.blocksKW, (500 * (0.06 * 467 / 24.5 - 0.3 * 2.45)) / 3600, 1e-6);
  assert.ok(r.state.Tm > none.state.Tm);
  near(at(100).r.acting.blocksKW, (500 * 0.06 * 467 / 24.5) / 3600, 1e-6, 'no evaporation at 100 %');
  // at 30 mL/h in dry air the evaporation takes more heat than respiration gives
  const s1 = start({ T: 25, W: wOf(25, 60) }, P);
  assert.ok(step(s1, OFF, { ...still(s1, P), co2PerBlock: 30 }, 5).acting.blocksKW < 0);
});

test('humidifier: water in, evaporation cools, its driver warms a little', () => {
  const s0 = start({ T: 32, W: wOf(32, 50) });
  const r = step(s0, { ...OFF, humidifier: true }, still(s0), 5);
  const none = step(s0, OFF, still(s0), 5);
  assert.equal(r.acting.humidifierGH, 2000);
  near(r.acting.machineKW, 0.08, 1e-9); // 40 W per L/h
  near(water(r.state) - water(none.state), (2000 / 3600) * 5, 0.05);
  assert.ok(r.state.T < none.state.T);
});

test('machine heat: circulation 60 W, intake fan 60 W, exhaust fan none; sun from sunW', () => {
  const s0 = start({ T: 25 });
  const m = (inputs, params = still(s0)) => step(s0, { ...OFF, ...inputs }, params, 5).acting;
  near(m({ circulation: true }).machineKW, 0.06, 1e-9);
  near(m({ intake: true }).machineKW, 0.06, 1e-9);
  near(m({ exhaust: true }).machineKW, 0, 1e-9);
  near(m({}, { ...still(s0), sunW: 500, sun: 0.5 }).sunKW, 0.25, 1e-9);
  assert.equal(m({}, { ...still(s0), sunW: 500 }).sunKW, 0); // no sun given: night
  const warm = step(s0, { ...OFF, circulation: true }, { ...still(s0), sunW: 1000, sun: 1 }, 5);
  near((warm.state.T - 25) * capAir() + (warm.state.Tm - 25) * capMass(), 1.06 * 5, 0.05);
});

const cool = (fan = 'auto', setpoint = 22) => ({ ...OFF, ac: { mode: 'cool', setpoint, fan } });
const total = (a) => a.acCoolKW + a.acLatentKW; // capacity = sensible + latent

test('AC capacity: rated at 27 °C / 19 °C wet bulb indoors and 35 °C outdoors; more with a wetter room, less on a hot day', () => {
  const rated = start({ T: 27, W: wOf(27, 47) });
  const p = { ...noBlocks, outdoorT: 35 };
  near(total(step(rated, cool(), p, 0).acting), 3.5 * (1 + 0.03 * (wetBulb(27, 47) - 19)), 1e-9);
  const wet = start({ T: 27, W: wOf(27, 80) });
  assert.ok(total(step(wet, cool(), p, 0).acting) > total(step(rated, cool(), p, 0).acting));
  assert.ok(total(step(rated, cool(), { ...p, outdoorT: 40 }, 0).acting) < total(step(rated, cool(), p, 0).acting));
  // proportional band: 0.25 K above setpoint -> half
  const s = start({ T: 22.25, W: wOf(22.25, 60) });
  near(total(step(s, cool(), p, 0).acting), total(step(s, cool('auto', 16), p, 0).acting) / 2, 1e-9);
});

test('AC sensible and latent split by the coil: dry at the rating point, mostly water in a wet cool room', () => {
  const p = { ...noBlocks, outdoorT: 35 };
  const shr = (T, RH, fan = 'auto') => { const a = step(start({ T, W: wOf(T, RH) }), cool(fan, 16), p, 0).acting; return a.acCoolKW / total(a); };
  near(shr(27, 47), 0.8, 0.03); // a split aircon at its rating: about 0.75 to 0.8
  assert.ok(shr(22, 90) < 0.5, `wet room ${shr(22, 90)}`);
  // a slower fan dries more where the air is not near saturation
  assert.ok(shr(27, 47, 'low') < shr(27, 47, 'auto') && shr(27, 47, 'auto') < shr(27, 47, 'high'));
  // no water once the air's dew point is below the coil
  assert.equal(step(start({ T: 30, W: wOf(30, 20) }), cool('high', 16), p, 0).acting.acLatentKW, 0);
});

test('AC cool lowers T toward the setpoint, stops at it, and takes water out', () => {
  const r = run(start({ T: 30, W: wOf(30, 70) }), cool(), noBlocks, 1800, 5);
  assert.ok(r.state.T < 30 && r.state.T >= 22 - 1e-6);
  const at = step(start({ T: 22, W: wOf(22, 50) }), cool(), { ...noBlocks, outdoorT: 22 }, 5);
  assert.equal(at.acting.acCoolKW, 0);
  const s0 = start({ T: 30, W: wOf(30, 70) });
  const c = step(s0, cool(), still(s0), 5);
  near(water(s0) - water(c.state), (c.acting.acLatentKW / 2.45) * 5, 0.02);
});

test('AC dry: power capped at 0.4 and a colder coil', () => {
  const s0 = start({ T: 30, W: wOf(30, 50) }); // not near saturation, where the coil temperature matters
  const p = { ...noBlocks, outdoorT: 35 };
  const dry = step(s0, { ...OFF, ac: { mode: 'dry', setpoint: 22, fan: 'auto' } }, p, 0).acting;
  near(total(dry), 1.4, 1e-9);
  const c = step(s0, cool('low'), p, 0).acting;
  assert.ok(dry.acLatentKW / total(dry) > c.acLatentKW / total(c));
});

test('AC heat warms and stops at the setpoint', () => {
  const p = { ...noBlocks, outdoorT: 15 };
  const heat = { ...OFF, ac: { mode: 'heat', setpoint: 25, fan: 'auto' } };
  const r = run(start({ T: 15, W: wOf(15, 50) }, p), heat, p, 1800);
  assert.ok(r.state.T > 15);
  assert.equal(step(start({ T: 26 }), heat, noBlocks, 5).acting.acHeatKW, 0);
  near(step(start({ T: 10 }), heat, noBlocks, 5).acting.acHeatKW, 3.5, 1e-9); // heat: the rated output
});

test('AC fan mode and ac null do nothing', () => {
  const s0 = start({ T: 30, W: wOf(30, 70) });
  const p = { ...noBlocks, outdoorT: 30 };
  const base = step(s0, OFF, p, 60);
  const fan = step(s0, { ...OFF, ac: { mode: 'fan', setpoint: 18, fan: 'high' } }, p, 60);
  assert.deepEqual(fan.state, base.state);
  assert.equal(fan.acting.acCoolKW, 0);
  assert.equal(fan.acting.acHeatKW, 0);
});

test('surfaces hold water: wet air gives some to them (and its heat), dry air takes it back; water is kept', () => {
  const s0 = start({ T: 25, W: wOf(25, 95), Hs: 70 });
  const r = step(s0, OFF, still(s0), 60);
  assert.ok(r.state.W < s0.W && r.state.Hs > 70);
  assert.ok(r.state.T > 25, 'water taken up warms the air');
  near(water(r.state), water(s0), 0.05);
  assert.ok(r.acting.surfaceGH > 0);
  const dryAir = start({ T: 25, W: wOf(25, 60), Hs: 95 });
  const back = step(dryAir, OFF, still(dryAir), 60);
  assert.ok(back.acting.surfaceGH < 0 && back.state.Hs < 95);
  // after a few hours closed they meet
  const h = run(s0, OFF, still(s0), 4 * 3600);
  near(rhOf(h.state.T, h.state.W), h.state.Hs, 2); // the leakage keeps a small gap
});

test('condensation: the excess goes onto the surfaces and warms the air; RH never above 100', () => {
  const s0 = start({ T: 22, W: wOf(22, 95) });
  const r = run(s0, { ...OFF, intake: true, exhaust: true }, { ...noBlocks, outdoorT: 32, outdoorRH: 90 }, 300, 5);
  assert.ok(r.state.W <= satW(r.state.T) + 1e-9);
  // 30 °C saturated air pushed into a 22 °C room: water condenses
  const cold = start({ T: 22, W: wOf(22, 100), Hs: 100, Tm: 18 });
  const c = step(cold, { ...OFF, intake: true, exhaust: true }, { ...noBlocks, outdoorT: 30, outdoorRH: 100, fanFlow: 6000 }, 5);
  assert.ok(c.acting.condensedGH > 0);
  assert.ok(c.state.Hs > 100, 'free water on the surfaces');
  const h = run(start({ T: 25, W: wOf(25, 99) }), { ...OFF, humidifier: true }, { ...P, outdoorT: 25, outdoorRH: 100 }, 3600);
  assert.ok(rhOf(h.state.T, h.state.W) <= 100 + 1e-9 && h.state.W <= satW(h.state.T) + 1e-9);
  assert.ok(h.state.Hs <= 200);
});

test('the result does not depend on the step length: 1 s steps match 60 s steps (5 s sub-steps)', () => {
  // a small room where the gains per sub-step are large next to the air's heat capacity
  const p = { ...P, volume: 2, blocks: 16, sunW: 300, sun: 1, outdoorT: 33, outdoorRH: 60 };
  const inputs = { ...OFF, circulation: true, ac: { mode: 'cool', setpoint: 22, fan: 'auto' } };
  const s0 = start({ T: 28, W: wOf(28, 70) }, p);
  const a = run(s0, inputs, p, 7200, 1).state;
  const b = run(s0, inputs, p, 7200, 60).state;
  near(a.T, b.T, 0.1, 'T');
  near(rhOf(a.T, a.W), rhOf(b.T, b.W), 1, 'RH');
  near(b.T, 22, 0.15, 'the aircon holds its setpoint');
  // a huge humidifier in a hot, dry, tiny room: evaporation stops at saturation and does not overshoot into condensation
  const hp = { ...noBlocks, volume: 1, humidifierGH: 100000, outdoorT: 50, outdoorRH: 10 };
  const one = step(start({ T: 50, W: wOf(50, 10) }, hp), { ...OFF, humidifier: true }, hp, 5);
  assert.ok(one.acting.condensedGH < 1, `condensed ${one.acting.condensedGH}`);
  // a real humidifier: 1 s and 60 s steps agree
  const rp = { ...P, outdoorT: 30, outdoorRH: 50 };
  const r0 = start({ T: 30, W: wOf(30, 50) }, rp);
  const r1 = run(r0, { ...OFF, humidifier: true }, rp, 1800, 1).state;
  const r60 = run(r0, { ...OFF, humidifier: true }, rp, 1800, 60).state;
  near(r1.T, r60.T, 0.1, 'T');
  near(rhOf(r1.T, r1.W), rhOf(r60.T, r60.W), 1, 'RH');
});

test('stable and finite with huge fans, many blocks and long steps', () => {
  const p = { ...P, fanFlow: 100000, blocks: 100000, volume: 10, acKW: 50, humidifierGH: 100000, sunW: 5000, sun: 1 };
  let s = start({ T: 25 }, p);
  for (let i = 0; i < 200; i++) {
    s = step(s, { intake: true, exhaust: i % 2 === 0, circulation: true, humidifier: i % 3 === 0, ac: { mode: 'cool', setpoint: 18, fan: 'low' } }, p, 300).state;
    for (const k of ['T', 'W', 'CO2', 'Tm', 'Hs']) assert.ok(Number.isFinite(s[k]), `${k} at ${i}`);
    assert.ok(s.T > -20 && s.T < 80 && s.Tm > -20 && s.Tm < 80, `T ${s.T} Tm ${s.Tm}`);
    assert.ok(s.W <= satW(s.T) + 1e-9 && s.Hs >= 0 && s.Hs <= 200);
  }
});

test('dt 0 reports the unlimited rates and changes nothing', () => {
  const s0 = start({ T: 30, W: wOf(30, 70) }, P);
  const r = step(s0, { ...OFF, intake: true, exhaust: true, humidifier: true, ac: { mode: 'cool', setpoint: 22, fan: 'auto' } }, P, 0);
  assert.deepEqual(r.state, s0);
  assert.equal(r.acting.exchangeM3h, 600);
  assert.equal(r.acting.humidifierGH, 2000);
  assert.ok(total(r.acting) > 3);
});

test('acLoad: the share of its present capacity the aircon delivered (0 without an aircon, 1 at full demand)', () => {
  const params = { volume: 60, blocks: 0, co2PerBlock: 60, wallUA: 80, outdoorT: 33, outdoorRH: 70, sunW: 0, sun: 0, fanFlow: 0, acKW: 3.5, humidifierGH: 0 };
  const hot = { T: 30, W: wOf(30, 70), CO2: 420, Tm: 30, Hs: 70 };
  assert.equal(step(hot, { ac: null }, params, 10).acting.acLoad, 0);
  const full = step(hot, { ac: { mode: 'cool', setpoint: 20, fan: 'auto' } }, params, 10).acting.acLoad;
  assert.ok(full > 0.9 && full <= 1, String(full));
  const off = step(hot, { ac: { mode: 'cool', setpoint: 35, fan: 'auto' } }, params, 10).acting.acLoad;
  assert.equal(off, 0);
});

// ---- the dehumidifier (spec 2026-10-21-dehumidifier-design.md 5) ----

const DRY = { ...P, blocks: 0, wallUA: 0, outdoorT: 21, outdoorRH: 84, dehumidifierLday: 20, dehumidifierW: 360 };
const airAt = (T, RH) => ({ T, W: wOf(T, RH), CO2: 420, Tm: T, Hs: RH });

test('dehumidifier: at 21 °C 84 % a 20 L/day unit takes out about half its rating; acting reports it', () => {
  const { acting } = step(airAt(21, 84), { dehumidifier: true }, DRY, 5);
  assert.ok(acting.dehumidifierGH > 380 && acting.dehumidifierGH < 440, `${acting.dehumidifierGH} g/h`);
  assert.equal(acting.dehumidifierKW, 0.36);
  // at its rating point it takes out its rating
  const rated = step(airAt(30, 80), { dehumidifier: true }, { ...DRY, outdoorT: 30, outdoorRH: 80 }, 5).acting.dehumidifierGH;
  assert.ok(Math.abs(rated - 20000 / 24) < 15, `${rated} g/h at 30 °C 80 %`);
});

test('dehumidifier: dries and warms the room; nothing when off, not fitted, or at a 5 °C dew point', () => {
  const before = airAt(21, 84);
  const on = step(before, { dehumidifier: true }, DRY, 600).state;
  const off = step(before, { dehumidifier: false }, DRY, 600).state;
  assert.ok(rhOf(on.T, on.W) < rhOf(off.T, off.W) - 2, 'drier');
  assert.ok(on.T > off.T + 0.2, 'warmer: its power and the condensation heat');
  assert.equal(step(before, { dehumidifier: true }, { ...DRY, dehumidifierLday: 0 }, 5).acting.dehumidifierGH, 0);
  assert.equal(step(before, { dehumidifier: true }, { ...P, outdoorT: 21, outdoorRH: 84 }, 5).acting.dehumidifierGH, 0, 'params without it');
  assert.equal(step(airAt(10, 50), { dehumidifier: true }, DRY, 5).acting.dehumidifierGH, 0, 'dew point below 5 °C');
  assert.equal(step(before, { dehumidifier: false }, DRY, 5).acting.dehumidifierKW, 0);
});

test('dehumidifier: the nominal rates (dt 0) include it', () => {
  const { acting } = step(airAt(21, 84), { dehumidifier: true }, DRY, 0);
  assert.ok(acting.dehumidifierGH > 380);
  assert.equal(acting.dehumidifierKW, 0.36);
});

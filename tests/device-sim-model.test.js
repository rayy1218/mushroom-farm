import { test } from 'node:test';
import assert from 'node:assert/strict';
import { satW, rhOf, wOf, initialState, step } from '../device/sim-model.js';

const P = { volume: 60, blocks: 500, outdoorT: 32, outdoorRH: 80, fanFlow: 600, acKW: 3.5, humidifierGH: 2000 };
const OFF = { intake: false, exhaust: false, humidifier: false, ac: null };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tol ${tol})`);

function run(state, inputs, params, seconds, dt = 60) {
  let s = state, acting;
  for (let t = 0; t < seconds; t += dt) ({ state: s, acting } = step(s, inputs, params, dt));
  return { state: s, acting };
}
const noBlocks = { ...P, blocks: 0 };
const start = (over = {}, params = noBlocks) => ({ ...initialState(params), ...over });

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

test('initialState starts at outdoor air and 420 ppm', () => {
  const s = initialState(P);
  assert.equal(s.T, 32);
  near(rhOf(s.T, s.W), 80, 1e-9);
  assert.equal(s.CO2, 420);
});

test('walls pull T toward outdoor with tau 1 h', () => {
  const r = run(start({ T: 22 }), OFF, { ...noBlocks, volume: 1e9 }, 3600, 5);
  // leakage (0.3 vol/h) moves T at 0.03/h (heat capacity is 10x the air): rate 1.03 per hour
  near(r.state.T, 22 + 10 * (1 - Math.exp(-1.03)), 0.05);
  const cold = run(start({ T: 40 }), OFF, noBlocks, 600);
  assert.ok(cold.state.T < 40 && cold.state.T > 32);
});

test('exchange: full vs half vs leakage', () => {
  const s0 = start({ T: 22, CO2: 2000 });
  const full = run(s0, { ...OFF, intake: true, exhaust: true }, noBlocks, 600);
  const half = run(s0, { ...OFF, intake: true }, noBlocks, 600);
  const half2 = run(s0, { ...OFF, exhaust: true }, noBlocks, 600);
  const leak = run(s0, OFF, noBlocks, 600);
  assert.equal(full.acting.exchangeM3h, 600);
  assert.equal(half.acting.exchangeM3h, 300);
  assert.equal(half2.acting.exchangeM3h, 300);
  near(leak.acting.exchangeM3h, 0.3 * 60, 1e-9);
  assert.ok(full.state.CO2 < half.state.CO2 && half.state.CO2 < leak.state.CO2 && leak.state.CO2 < 2000);
  // full: k = 600/60 = 10 /h; after 10 min e^-1.667 of the excess (walls do not touch CO2)
  near(full.state.CO2, 420 + 1580 * Math.exp(-10 / 6), 15);
  assert.ok(full.state.T > half.state.T && half.state.T > leak.state.T);
});

test('exchange moves W toward outdoor', () => {
  const dry = start({ T: 32, W: wOf(32, 20) });
  const r = run(dry, { ...OFF, intake: true, exhaust: true }, noBlocks, 600);
  assert.ok(r.state.W > dry.W);
  assert.ok(r.state.W <= wOf(32, 80) + 1e-9);
  const wet = run(start({ T: 32, W: wOf(32, 100) }), { ...OFF, intake: true, exhaust: true }, noBlocks, 600);
  assert.ok(wet.state.W < wOf(32, 100));
});

test('blocks raise T, W and CO2 with exchange off', () => {
  const s0 = start({ T: 32, W: wOf(32, 50) }, P);
  const r = run(s0, OFF, { ...P, outdoorT: 32 }, 600);
  assert.ok(r.state.T > 32);
  assert.ok(r.state.W > s0.W);
  assert.ok(r.state.CO2 > 420);
  assert.equal(r.acting.blocksKW, 0.5);
  // CO2: 500*0.3 L/h = 150 L/h = 0.15 m3/h over 60 m3 -> 2500 ppm/h, 10 min = ~417 ppm (minus tiny leakage)
  near(r.state.CO2, 420 + 2500 / 6, 15);
  // heat: 0.5 kW / 720 kJ/K -> 0.0007 K/s
  // (walls pull back a little as the room warms)
  near(r.state.T - 32, 0.5 / 720 * 600, 0.05);
  assert.ok(r.state.T - 32 < 0.5 / 720 * 600);
});

test('humidifier raises W and lowers T', () => {
  const s0 = start({ T: 32, W: wOf(32, 50) });
  const r = run(s0, { ...OFF, humidifier: true }, { ...noBlocks, outdoorT: 32, outdoorRH: 50 }, 300, 5);
  // 2000 g/h * 300 s = 166.7 g over 60 m3 = 2.78 g/m3
  near(r.state.W - s0.W, 2.78, 0.1);
  // cooling 2.45 kJ/g * 166.7 g = 408 kJ / 720 kJ/K = 0.57 K
  near(32 - r.state.T, 0.57, 0.03);
  assert.equal(r.acting.humidifierGH, 2000);
});

const cool = (fan = 'auto', setpoint = 22) => ({ ...OFF, ac: { mode: 'cool', setpoint, fan } });

test('AC cool lowers T toward the setpoint and stops at it', () => {
  const r = run(start({ T: 30, W: wOf(30, 50) }), cool(), noBlocks, 1800);
  assert.ok(r.state.T < 30);
  assert.ok(r.state.T >= 22 - 1e-6);
  const at = step(start({ T: 22, W: wOf(22, 50) }), cool(), { ...noBlocks, outdoorT: 22 }, 5);
  assert.equal(at.acting.acCoolKW, 0);
  const below = step(start({ T: 20, W: wOf(20, 50) }), cool(), { ...noBlocks, outdoorT: 20 }, 5);
  assert.equal(below.acting.acCoolKW, 0);
  near(below.state.T, 20, 1e-9);
  // proportional band: 0.5 K above setpoint -> half power
  const total = (a) => a.acCoolKW + a.acLatentKW; // capacity = sensible + latent
  const half = step(start({ T: 22.25 }), cool(), noBlocks, 5);
  near(total(half.acting), 1.75, 1e-9);
  // far above: full power
  near(total(step(start({ T: 30 }), cool(), noBlocks, 5).acting), 3.5, 1e-9);
});

test('AC cool removes water; fan low more than high', () => {
  const s0 = start({ T: 30, W: wOf(30, 70) });
  const p = { ...noBlocks, outdoorT: 30 };
  const lo = step(s0, cool('low'), p, 5);
  const au = step(s0, cool('auto'), p, 5);
  const hi = step(s0, cool('high'), p, 5);
  const dw = r => s0.W - r.state.W;
  assert.ok(dw(lo) > dw(au) && dw(au) > dw(hi) && dw(hi) > 0);
  // low: 3.5 kW * 0.35 * wet / 2.45 g/s * 5 s / 60 m3 (exchange/leak adds a hair back)
  const wc = satW(12), wet = (s0.W - wc) / (satW(30) - wc);
  near(dw(lo), (0.5 * wet * 5) / 60, 0.002);
  near(dw(hi), (0.5 * wet * 5) / 60 * 0.15 / 0.35, 0.002);
  // sensible = P - latent
  near(lo.acting.acCoolKW, 3.5 - lo.acting.acLatentKW, 1e-9);
  near(lo.acting.acLatentKW, 3.5 * 0.35 * wet, 1e-9);
});

test('AC dry: power capped at 0.4 and more water', () => {
  const s0 = start({ T: 30, W: wOf(30, 70) });
  const p = { ...noBlocks, outdoorT: 30 };
  const dry = step(s0, { ...OFF, ac: { mode: 'dry', setpoint: 22, fan: 'auto' } }, p, 5);
  const c = step(s0, cool('low'), p, 5);
  near(dry.acting.acCoolKW + dry.acting.acLatentKW, 1.4, 1e-9);
  near(c.acting.acCoolKW + c.acting.acLatentKW, 3.5, 1e-9);
  // less cooling, but more water per kJ removed than any cool fan speed (0.6 vs 0.35)
  assert.ok(s0.T - dry.state.T < s0.T - c.state.T);
  const perKJ = r => (s0.W - r.state.W) / (s0.T - r.state.T);
  assert.ok(perKJ(dry) > perKJ(c) * 1.5);
  // absolute: 1.4 kW * 0.6 * wet / 2.45 g/s * 5 s / 60 m3
  const wet = (s0.W - satW(12)) / (satW(30) - satW(12));
  near(s0.W - dry.state.W, (1.4 * 0.6 * wet / 2.45 * 5) / 60, 0.002);
});

test('AC heat warms and stops at the setpoint', () => {
  const p = { ...noBlocks, outdoorT: 15 };
  const heat = { ...OFF, ac: { mode: 'heat', setpoint: 25, fan: 'auto' } };
  const r = run(start({ T: 15, W: wOf(15, 50) }, p), heat, p, 1800);
  assert.ok(r.state.T > 15);
  assert.equal(step(start({ T: 26 }), heat, noBlocks, 5).acting.acHeatKW, 0);
  near(step(start({ T: 10 }), heat, noBlocks, 5).acting.acHeatKW, 3.5, 1e-9);
});

test('AC fan mode and ac null do nothing', () => {
  const s0 = start({ T: 30, W: wOf(30, 70) });
  const p = { ...noBlocks, outdoorT: 30 };
  const base = step(s0, OFF, p, 60);
  const fan = step(s0, { ...OFF, ac: { mode: 'fan', setpoint: 18, fan: 'high' } }, p, 60);
  assert.deepEqual(fan.state, base.state);
  assert.equal(fan.acting.acCoolKW, 0);
  assert.equal(fan.acting.acHeatKW, 0);
  assert.equal(base.acting.acCoolKW, 0);
});

test('RH never above 100', () => {
  const r = run(start({ T: 25, W: wOf(25, 99) }), { ...OFF, humidifier: true }, { ...P, outdoorT: 25, outdoorRH: 100 }, 3600);
  assert.ok(rhOf(r.state.T, r.state.W) <= 100 + 1e-9);
  assert.ok(r.state.W <= satW(r.state.T) + 1e-9);
  const c = run(start({ T: 30, W: wOf(30, 100) }), cool(), P, 3600);
  assert.ok(c.state.W <= satW(c.state.T) + 1e-9);
});

test('dt 300 matches 60 x dt 5', () => {
  const inputs = { intake: true, exhaust: true, humidifier: true, ac: { mode: 'cool', setpoint: 22, fan: 'auto' } };
  const s0 = start({ T: 28, W: wOf(28, 60), CO2: 1500 }, P);
  const a = step(s0, inputs, P, 300).state;
  let b = s0;
  for (let i = 0; i < 60; i++) b = step(b, inputs, P, 5).state;
  near(a.T, b.T, 1e-6); near(a.W, b.W, 1e-6); near(a.CO2, b.CO2, 1e-6);
  // and against 1 s calls (fine steps)
  const c = step(s0, OFF, P, 300).state;
  let d = s0;
  for (let i = 0; i < 300; i++) d = step(d, OFF, P, 1).state;
  near(c.T, d.T, 0.01); near(c.CO2, d.CO2, 1);
});

test('stable and finite for edge params', () => {
  const edges = [
    { ...P, blocks: 0 },
    { ...P, volume: 1, blocks: 1 },
    { ...P, acKW: 0 },
    { ...P, volume: 1, blocks: 1, fanFlow: 1e6, acKW: 100, humidifierGH: 1e6 },
  ];
  const inputs = { intake: true, exhaust: true, humidifier: true, ac: { mode: 'cool', setpoint: 22, fan: 'low' } };
  for (const p of edges) {
    for (const inp of [inputs, OFF, { ...inputs, ac: { mode: 'heat', setpoint: 30, fan: 'auto' } }, { ...inputs, ac: { mode: 'dry', setpoint: 10, fan: 'high' } }]) {
      let s = initialState(p);
      for (let i = 0; i < 50; i++) {
        const r = step(s, inp, p, 300);
        s = r.state;
        for (const v of [s.T, s.W, s.CO2, ...Object.values(r.acting)]) assert.ok(Number.isFinite(v), JSON.stringify([p, s, r.acting]));
        assert.ok(s.W >= 0 && s.CO2 >= 0);
        assert.ok(s.T > -50 && s.T < 100);
      }
    }
  }
});

test('step does not mutate its inputs', () => {
  const s0 = start({ T: 25 });
  const copy = { ...s0 };
  step(s0, OFF, noBlocks, 10);
  assert.deepEqual(s0, copy);
});

test('AC condenses only while the air is wetter than the coil (dew point above 12 C)', () => {
  // dew point below the coil: no water removed, all of P is sensible
  const dryAir = start({ T: 30, W: satW(12) * 0.8 });
  const a = step(dryAir, cool('low'), { ...noBlocks, outdoorT: 30, outdoorRH: 10 }, 5);
  assert.equal(a.acting.acLatentKW, 0);
  near(a.acting.acCoolKW, 3.5, 1e-9);
  // saturated air: full latent share f
  const wetAir = start({ T: 30, W: satW(30) });
  const b = step(wetAir, cool('low'), noBlocks, 5);
  near(b.acting.acLatentKW, 3.5 * 0.35, 1e-9);
  near(b.acting.acCoolKW, 3.5 * 0.65, 1e-9);
});

test('a sealed wet room cannot be dried to near 0 % RH by the AC', () => {
  const s0 = start({ T: 32, W: wOf(32, 90) }, P);
  const r = run(s0, cool('low'), P, 6 * 3600);
  const rh = rhOf(r.state.T, r.state.W);
  assert.ok(rh > 50, `RH ${rh}`);
});

test('acting reports the last sub-step: humidifier limited by saturation', () => {
  const sat = start({ T: 25, W: satW(25) });
  const r = step(sat, { ...OFF, humidifier: true }, { ...noBlocks, outdoorT: 25, outdoorRH: 100 }, 5);
  assert.equal(r.acting.humidifierGH, 0);
});

test('air exchange moves T by the heat-capacity fraction, not the air-change fraction', () => {
  const s0 = start({ T: 22 });
  const r = step(s0, { ...OFF, intake: true, exhaust: true }, { ...noBlocks, outdoorRH: 0 }, 60);
  // k = 600/3600/60*60 = 0.1667 for W; kT = 600*1.2/3600*60/720 = 0.0167 for T (walls add 60/3600*10 = 0.17 K)
  near(r.state.T - 22, 10 * (0.0167 + 1 / 60), 0.02);
});

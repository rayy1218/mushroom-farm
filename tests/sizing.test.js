// Suggest machines (server/sizing.js, spec 2026-10-22-suggest-machines-design.md 3 and 4): the estimates for Container Alpha,
// the candidates, the ranking, the cool-down from outdoor air, and short searches with the real simulation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, candidates, rank, runSizing, sizingDays, searchPlan, COOL_DOWN_MAX_H, COOL_START_HOUR } from '../server/sizing.js';
import { simulate } from '../server/simulate.js';

// Container Alpha: 32.57 m³, walls 30 W/K, outdoor 33/25/24, sun 100, 950 lion's mane, ready-to-fruit, fruiting.
const input = {
  physics: { wallUA: 30, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 100 },
  crops: [{ crop: 'lionsmane', blocks: 950 }], farmType: 'ready', stage: 'fruiting', target: 95,
};
const ctx = {
  volume: 32.57,
  ratings: { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 20, humidifierLH: 0.5, acInputW: 1000, dehumidifierW: 380, dehumidifierLday: 0 },
  control: { exchangeMaxMin: 10, acDrop: 0, exchangeEveryMin: 15, humidifierDuringExchange: false, acFan: 'auto' },
  program: null, prices: null,
};

test('estimates for Container Alpha', () => {
  const e = estimate(input, ctx);
  assert.equal(e.fanFlow, 150);
  assert.equal(e.humidifierLH, 0.5);
  assert.ok(e.dehumidifierMaxLday >= 20 && e.dehumidifierMaxLday < 40, String(e.dehumidifierMaxLday));
  // about 2 kW of heat at the day high (6900 BTU/h: 9000), but the cool-down from 32.9 °C to the lion's mane's 20 °C within 3 h
  // takes about 6.5 kW (22 200 BTU/h): the mass of 950 blocks and the room
  assert.equal(e.acCoolBTU, 24000);
  assert.equal(e.acBTU, 24000);
  // that aircon takes about 7.5 L of water an hour out of air as wet as outdoors: the nearest humidifier
  assert.equal(e.humidifierCoolLH, 6);
  assert.equal(e.exchangeMaxMin, 60); // the fan has to run all the time at the strict stage
  assert.deepEqual(Object.keys(e.why), ['fanFlow', 'humidifierLH', 'dehumidifierLday', 'acBTU', 'coolDown', 'exchangeMaxMin']);
  assert.equal(e.why.coolDown, "From outdoor air at 14:00 (32.9 °C) to 20 °C within 3 h takes about 6,508 W: 4,961 W to cool the blocks and the room's mass, 1,547 W of heat at that hour (walls, sun, blocks, fan air); the aircon then takes about 7.5 L of water an hour out of air as wet as outdoors, which a humidifier of 6 L/h makes up");
  assert.match(e.why.acBTU, /; the cool-down needs more$/);
  assert.equal(e.why.fanFlow, '950 blocks give off 57 L of CO₂ an hour; 150 m³/h holds it at 800 ppm');
  for (const text of Object.values(e.why)) assert.equal(typeof text, 'string');
});

test('the strict bands come from both stages, the start stage may be rest, and a fan that is not busy keeps the room limit', () => {
  const rest = estimate({ ...input, stage: 'rest' }, ctx);
  assert.equal(rest.fanFlow, 150); // fruiting follows rest: still the strictest
  const few = estimate({ ...input, crops: [{ crop: 'oyster', blocks: 100 }] }, ctx);
  assert.equal(few.fanFlow, 100); // the smallest size
  assert.equal(few.exchangeMaxMin, 10); // runs a fraction of the time: the room's limit
  assert.equal(estimate({ ...input, crops: [{ crop: 'oyster', blocks: 100 }] }, { ...ctx, control: { exchangeMaxMin: 25 } }).exchangeMaxMin, 25);
  const spawn = estimate({ ...input, farmType: 'full', stage: 'spawn', crops: [{ crop: 'oyster', blocks: 500 }] }, ctx);
  assert.equal(spawn.fanFlow, 200); // spawn and pinning: pinning's 800 ppm limit is the strictest, 500 x 60 / (700 - 520) = 167
});

test('the cool-down estimate: a longer cool-down allowed, a smaller aircon; a few blocks in a warm crop, the day high rules', () => {
  const e = estimate(input, ctx);
  const slow = estimate({ ...input, coolDownMaxH: 12 }, ctx);
  assert.ok(slow.acCoolBTU < e.acCoolBTU, `${slow.acCoolBTU}`);
  assert.match(slow.why.coolDown, /within 12 h/);
  const warm = estimate({ ...input, crops: [{ crop: 'oyster', blocks: 50 }] }, ctx);
  assert.equal(warm.acCoolBTU, 9000);
  assert.equal(warm.acBTU, 9000);
  assert.doesNotMatch(warm.why.acBTU, /cool-down/);
  assert.ok(warm.humidifierCoolLH >= warm.humidifierLH);
});

test('days: the two stages of the program, at most 30', () => {
  assert.equal(sizingDays(input, ctx), 17); // fruiting 7 + rest 10
  assert.equal(sizingDays({ ...input, farmType: 'full', stage: 'spawn' }, ctx), 25); // spawn 21 + pinning 4
  assert.equal(sizingDays({ ...input, farmType: 'full', stage: 'spawn' }, { ...ctx, program: { days: { spawn: 40 } } }), 30);
});

test('candidates: at most 96, around the estimate', () => {
  const e = { ...estimate(input, ctx), acBTU: 9000 };
  const list = candidates(e);
  assert.equal(list.length, 48); // 3 fans x 2 humidifiers x 4 dehumidifiers x 2 aircons x the one limit
  assert.deepEqual([...new Set(list.map((c) => c.machines.fanFlow))], [100, 150, 200]);
  assert.deepEqual([...new Set(list.map((c) => c.machines.humidifierLH))], [0.3, 0.5]);
  assert.deepEqual([...new Set(list.map((c) => c.machines.dehumidifierLday))], [0, 10, 20, 30]);
  assert.deepEqual([...new Set(list.map((c) => c.machines.acBTU))], [9000, 12000]);
  assert.deepEqual([...new Set(list.map((c) => c.exchangeMaxMin))], [60]);
  const room = candidates({ ...e, exchangeMaxMin: 10 });
  assert.deepEqual([...new Set(room.map((c) => c.exchangeMaxMin))], [10, 60]);
  assert.ok(room.length <= 96);
  // The ends of the lists: no size below or above, a small largest dehumidifier.
  const edge = candidates({ fanFlow: 100, humidifierLH: 0.3, dehumidifierMaxLday: 10, acBTU: 60000, exchangeMaxMin: 10 });
  assert.deepEqual([...new Set(edge.map((c) => c.machines.fanFlow))], [100, 150]);
  assert.deepEqual([...new Set(edge.map((c) => c.machines.humidifierLH))], [0.3]);
  assert.deepEqual([...new Set(edge.map((c) => c.machines.dehumidifierLday))], [0, 10]);
  assert.deepEqual([...new Set(edge.map((c) => c.machines.acBTU))], [60000]);
});

const result = (t, rh, co2, kWh, coolDownH) => ({ machines: {}, exchangeMaxMin: 10, inBand: { t, rh, co2, all: Math.min(t, rh, co2) }, kWh, litres: 0, removedLitres: 0, ...(coolDownH === undefined ? {} : { coolDownH }) });

test('rank: the ones reaching the target by energy, then the rest by their lowest value', () => {
  const a = result(99, 96, 99, 50), b = result(100, 100, 100, 30), c = result(99, 96, 94, 10), d = result(90, 99, 99, 5), e = result(99, 99, 80, 1);
  const ranked = rank([a, c, d, e, b], 95);
  assert.deepEqual(ranked, [b, a, c, d, e]); // b and a reach 95 (b uses less); c lowest 94, d 90, e 80
  assert.deepEqual(rank([a, b], 99), [b, a]); // only b reaches 99 (a's humidity is 96)
  assert.deepEqual(rank([], 95), []);
  const input2 = [a, b];
  rank(input2, 95);
  assert.deepEqual(input2, [a, b], 'the argument is not reordered');
  // Equal lowest values: the cheaper first.
  assert.deepEqual(rank([result(90, 99, 99, 9), result(90, 98, 99, 3)], 95).map((r) => r.kWh), [3, 9]);
});

test('rank: reaching the target and cooling down within the limit first by energy, then the target alone by the cool-down', () => {
  const cheapSlow = result(99, 99, 99, 10, 4.5), cheapNever = result(99, 99, 99, 5, null), quick = result(99, 99, 99, 30, 1.2);
  const quicker = result(99, 99, 99, 40, 0.5), short = result(90, 99, 99, 1, 0.5), slow = result(99, 99, 99, 20, 3.5);
  assert.deepEqual(rank([cheapSlow, cheapNever, quick, quicker, short, slow], 95), [quick, quicker, slow, cheapSlow, cheapNever, short]);
  assert.deepEqual(rank([cheapSlow, quick], 95, 5), [cheapSlow, quick], 'within 5 h both cool down: by energy');
  assert.equal(COOL_DOWN_MAX_H, 3);
  assert.deepEqual(rank([result(99, 99, 99, 9, 3), result(99, 99, 99, 3, 3.1)], 95).map((r) => r.kWh), [9, 3], '3 h is within 3 h');
});

// A fake simulation that answers by the fan (and cools down in 1.5 h): the progress and the ranking can be tested without 30 s
// of simulation.
const fake = (calls) => (inp, cx) => {
  calls.push({ inp, cx });
  const good = inp.physics.fanFlow >= 150;
  return { summary: { inBand: { t: 100, rh: 99, co2: good ? 99 : 60, all: 60 }, energy: { kWh: inp.physics.fanFlow / 10 }, water: { litres: 1, removedLitres: 0 },
    ...(inp.start === 'outdoor' ? { coolDownS: 5400 } : {}) } };
};

test('runSizing: every candidate over the days of both stages and a cool-down day, with its machines and limit; the reply', () => {
  const calls = [], progress = [];
  const r = runSizing(input, ctx, { simulate: fake(calls), onProgress: (s) => progress.push(s) });
  const total = searchPlan(estimate(input, ctx)).total;
  assert.equal(total, 45, 'the two-phase plan for Container Alpha: 15 + 2 × 15 (16 less the core)');
  assert.equal(calls.length, 2 * total, 'each setup held in band and cooled down');
  assert.equal(calls[0].inp.days, 17);
  assert.equal('start' in calls[0].inp, false, 'the steady run starts in band');
  assert.deepEqual([calls[1].inp.days, calls[1].inp.start, calls[1].inp.startHour], [1, 'outdoor', COOL_START_HOUR]);
  assert.deepEqual(calls[1].inp.physics, calls[0].inp.physics);
  assert.equal(calls[1].cx, calls[0].cx);
  assert.equal(COOL_START_HOUR, 14);
  assert.equal(calls[0].cx.control.exchangeMaxMin, 60);
  assert.equal(calls[0].cx.control.acFan, 'auto', 'the room\'s other control settings stay');
  assert.equal(ctx.control.exchangeMaxMin, 10, 'the room\'s context is not touched');
  assert.equal(calls[0].inp.physics.wallUA, 30);
  assert.equal(progress.length, total, 'once a setup');
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((s, i) => i === 0 || s > progress[i - 1]));
  assert.equal(r.target, 95);
  assert.deepEqual([r.coolDownMaxH, r.coolDownStartHour], [3, 14]);
  assert.equal(r.days, 17);
  assert.equal(r.reached, true);
  assert.deepEqual(r.notes, []);
  assert.equal(r.best.length, 5);
  assert.deepEqual(r.best[0], { machines: r.best[0].machines, exchangeMaxMin: 60, control: { exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false }, inBand: { t: 100, rh: 99, co2: 99, all: 60 }, kWh: 15, litres: 1, removedLitres: 0, coolDownH: 1.5 });
  assert.deepEqual([calls[0].cx.control.acDrop, calls[0].cx.control.humidifierDuringExchange], [0, false], 'searched without the aircon drop and the forced humidifier');
  assert.equal(r.best[0].machines.fanFlow, 150);
  assert.equal(r.estimate.fanFlow, 150);
  assert.ok(r.estimate.why.fanFlow);
});

test('runSizing with a baseline: the room\'s machines tried like a setup with the room\'s own settings, answered apart, never in best', () => {
  const calls = [], progress = [];
  const baseline = { fanFlow: 600, acBTU: 9000, humidifierLH: 2, dehumidifierLday: 0 };
  // the baseline does best of all: it still stays out of best (the room has it; best is what to buy)
  const sim = (inp, cx) => {
    calls.push({ inp, cx });
    const own = inp.physics.fanFlow === 600 && inp.physics.acBTU === 9000;
    return { summary: { inBand: { t: 100, rh: 100, co2: 100, all: own ? 100 : 96 }, energy: { kWh: own ? 1 : 15 }, water: { litres: 1, removedLitres: 0 }, ...(inp.start ? { coolDownS: 3600 } : {}) } };
  };
  const r = runSizing({ ...input, baseline }, ctx, { simulate: sim, onProgress: (s) => progress.push(s) });
  const total = searchPlan(estimate(input, ctx)).total + 1;
  assert.equal(calls.length, 2 * total);
  assert.equal(progress.length, total);
  assert.equal(progress.at(-1), 1);
  assert.deepEqual(calls[0].inp.physics, { ...input.physics, ...baseline }, 'tried first');
  assert.equal(calls[0].cx.control.exchangeMaxMin, 10, 'the room\'s own time limit');
  assert.equal(calls[0].cx.control.acDrop, 0);
  assert.deepEqual(r.baseline, { machines: baseline, exchangeMaxMin: 10, control: { exchangeMaxMin: 10 }, inBand: { t: 100, rh: 100, co2: 100, all: 100 }, kWh: 1, litres: 1, removedLitres: 0, coolDownH: 1 });
  assert.ok(r.best.every((b) => !(b.machines.fanFlow === 600 && b.machines.acBTU === 9000)));
  assert.equal('baseline' in runSizing(input, ctx, { simulate: sim }), false);
});

test('runSizing: when nothing reaches the target the notes say which value falls short', () => {
  const sim = (inp) => ({ summary: { inBand: { t: 80, rh: 99, co2: 90, all: 70 }, energy: { kWh: 1 }, water: { litres: 1, removedLitres: 0 }, ...(inp.start ? { coolDownS: 3600 } : {}) } });
  const r = runSizing(input, ctx, { simulate: sim });
  assert.equal(r.reached, false);
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /^CO₂ stays above the band/);
  assert.match(r.notes[1], /^Temperature stays above the band/);
  const humid = runSizing(input, ctx, { simulate: (inp) => ({ summary: { inBand: { t: 99, rh: 70, co2: 99, all: 70 }, energy: { kWh: 1 }, water: { litres: 1, removedLitres: 0 }, ...(inp.start ? { coolDownS: 3600 } : {}) } }) });
  assert.match(humid.notes[0], /^Humidity stays out of its band/);
  assert.equal(humid.notes.length, 1);
  assert.equal(runSizing({ ...input, target: 60 }, ctx, { simulate: sim }).reached, true);
});

test('runSizing: a setup that holds the band but does not cool down within the limit does not reach it, and the note says so', () => {
  const sim = (slowH) => (inp) => ({ summary: { inBand: { t: 99, rh: 99, co2: 99, all: 99 }, energy: { kWh: 1 }, water: { litres: 1, removedLitres: 0 },
    ...(inp.start ? { coolDownS: slowH === null ? null : slowH * 3600 } : {}) } });
  const never = runSizing(input, ctx, { simulate: sim(null) });
  assert.equal(never.reached, false);
  assert.equal(never.best[0].coolDownH, null);
  assert.deepEqual(never.notes, ['It does not cool down within 3 h from outdoor air at 14:00: a bigger humidifier (the aircon dries the air as it cools it), a bigger aircon or fewer blocks']);
  const slow = runSizing(input, ctx, { simulate: sim(4.04) });
  assert.deepEqual([slow.reached, slow.best[0].coolDownH], [false, 4]);
  const allowed = runSizing({ ...input, coolDownMaxH: 4 }, ctx, { simulate: sim(4.04) });
  assert.deepEqual([allowed.reached, allowed.coolDownMaxH, allowed.notes], [true, 4, []]);
  assert.match(runSizing({ ...input, coolDownMaxH: 2 }, ctx, { simulate: sim(null) }).notes[0], /within 2 h/);
});

test('runSizing with the real simulation reaches the target with a fan of at most 200 m³/h', () => {
  const e = estimate(input, ctx);
  const list = [{ machines: { fanFlow: e.fanFlow, acBTU: 12000, dehumidifierLday: 10, humidifierLH: 0.5 }, exchangeMaxMin: 60 }];
  const r = runSizing({ ...input, coolDownMaxH: 24 }, ctx, { simulate, list, days: 2 });
  assert.equal(r.days, 2);
  assert.equal(r.best.length, 1);
  assert.ok(r.reached, JSON.stringify(r.best[0]));
  assert.ok(r.best[0].machines.fanFlow <= 200);
  assert.ok(r.best[0].inBand.t >= 95 && r.best[0].inBand.rh >= 95 && r.best[0].inBand.co2 >= 95);
  assert.ok(r.best[0].kWh > 0);
  assert.ok(r.best[0].coolDownH === null || r.best[0].coolDownH > 0);
});

// ---- the two-phase search (after the Room 1 check, 2026-10-22) ----

test('searchPlan: phase 1 the fan and a wide aircon range, phase 2 the humidity machines around the kept two', () => {
  const est = { fanFlow: 200, humidifierLH: 2, dehumidifierMaxLday: 60, acBTU: 9000, exchangeMaxMin: 60 };
  const plan = searchPlan(est);
  const fans = [...new Set(plan.phase1.map((c) => c.machines.fanFlow))];
  const acs = [...new Set(plan.phase1.map((c) => c.machines.acBTU))];
  assert.deepEqual(fans, [150, 200, 250]);
  assert.deepEqual(acs, [9000, 12000, 18000, 24000], 'from the estimate (the smallest size) to three above');
  const p2 = plan.phase2(plan.phase1[0]);
  assert.deepEqual([...new Set(p2.map((c) => c.machines.humidifierLH))], [1.5, 2, 3]);
  assert.deepEqual([...new Set(p2.map((c) => c.machines.dehumidifierLday))], [0, 10, 25, 60]);
  assert.equal(plan.total, plan.phase1.length + 2 * p2.length);
  assert.ok(plan.total <= 60, `${plan.total} setups`);
});

test('searchPlan: phase 1 with the cool-down\'s humidifier; phase 2 also near it when it is far above the estimate', () => {
  const est = { fanFlow: 200, humidifierLH: 0.5, humidifierCoolLH: 3, dehumidifierMaxLday: 60, acBTU: 12000, exchangeMaxMin: 60 };
  const plan = searchPlan(est);
  assert.deepEqual([...new Set(plan.phase1.map((c) => c.machines.humidifierLH))], [3]);
  assert.deepEqual([...new Set(plan.phase1.map((c) => c.machines.acBTU))], [9000, 12000, 18000, 24000, 30000]);
  const p2 = plan.phase2(plan.phase1[0]);
  assert.deepEqual([...new Set(p2.map((c) => c.machines.humidifierLH))], [0.5, 1, 2, 3], 'the estimate and the one above, the cool-down\'s and the one below');
  assert.equal(plan.total, 15 + 2 * 15, 'phase 2 without the core it starts from');
  const core = plan.phase1[0];
  assert.equal(p2.some((c) => JSON.stringify(c) === JSON.stringify(core)), false);
  assert.equal(p2.length, 4 * 4 - 1);
  const near = searchPlan({ ...est, humidifierCoolLH: 1 });
  assert.deepEqual([...new Set(near.phase2(near.phase1[0]).map((c) => c.machines.humidifierLH))], [0.3, 0.5, 1], 'next to it: around the estimate');
  assert.deepEqual([...new Set(near.phase1.map((c) => c.machines.humidifierLH))], [1]);
});

test('runSizing (two phases): phase 2 keeps the best two cores and the progress reaches 1 at the planned total', () => {
  const seen = [];
  const sim = (inp) => {
    if (!inp.start) seen.push(inp.physics);
    const big = inp.physics.acBTU >= 18000; // only a big aircon holds the temperature
    return { summary: { inBand: { t: big ? 99 : 60, rh: inp.physics.dehumidifierLday === 10 ? 97 : 80, co2: 99, all: 90 }, energy: { kWh: inp.physics.acBTU / 1000 + inp.physics.dehumidifierLday / 10 }, water: { litres: 1, removedLitres: 0 }, coolDownS: 3600 } };
  };
  const progress = [];
  const r = runSizing(input, ctx, { simulate: sim, onProgress: (p) => progress.push(p), days: 1 });
  const plan = searchPlan(r.estimate);
  assert.equal(seen.length, plan.total);
  const keys = seen.map((p) => JSON.stringify(p));
  assert.equal(new Set(keys).size, keys.length, 'no setup tried twice');
  assert.equal(progress.at(-1), 1);
  assert.equal(r.reached, true);
  assert.equal(r.best[0].machines.acBTU >= 18000, true);
  assert.equal(r.best[0].machines.dehumidifierLday, 10);
});

test('runSizing (two phases): an aircon that holds the band but cannot cool down is kept out; the bigger one that can is chosen', () => {
  // the fake room: every aircon holds the band, the cheaper the smaller; only from 30000 BTU/h does it cool down within 3 h
  const sim = (inp) => ({ summary: { inBand: { t: 99, rh: 99, co2: 99, all: 99 }, energy: { kWh: inp.physics.acBTU / 1000 }, water: { litres: 1, removedLitres: 0 },
    ...(inp.start ? { coolDownS: inp.physics.acBTU >= 30000 ? 7200 : 5 * 3600 } : {}) } });
  const r = runSizing(input, ctx, { simulate: sim, days: 1 });
  assert.equal(r.reached, true);
  assert.equal(r.best[0].machines.acBTU, 30000);
  assert.equal(r.best[0].coolDownH, 2);
  assert.ok(r.best.some((b) => b.machines.acBTU < 30000 && b.coolDownH === 5) || r.best.every((b) => b.machines.acBTU >= 30000));
});

test('runSizing with the real simulation: in a 40 ft container of 1,200 wood ear blocks 9000 BTU/h holds the band for less energy but cools down too slowly; 12000 is chosen', () => {
  // A 3 L/h humidifier (2026-10-29: 4 L/h, whose 1 min minimum run lifts this room about 6 % RH, overshot the band once the
  // humidifier switched 1 % RH inside it, 88 % RH in band; the cool-downs are then 2.2 h and 2.7 h, so the limit is 2.5 h).
  const box = { physics: { wallUA: 50, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 500 }, crops: [{ crop: 'woodear', blocks: 1200 }], farmType: 'ready', stage: 'fruiting', target: 90, coolDownMaxH: 2.5 };
  const list = [9000, 12000].map((acBTU) => ({ machines: { fanFlow: 200, acBTU, humidifierLH: 3, dehumidifierLday: 10 }, exchangeMaxMin: 60, acDrop: 0, humidifierDuringExchange: false }));
  const r = runSizing(box, { ...ctx, volume: 64.03 }, { simulate, list, days: 2 });
  const [first, second] = r.best;
  assert.equal(r.reached, true, JSON.stringify(r.best));
  assert.equal(first.machines.acBTU, 12000);
  assert.ok(first.coolDownH <= 2.5, String(first.coolDownH));
  assert.equal(second.machines.acBTU, 9000);
  assert.ok(second.coolDownH === null || second.coolDownH > 2.5, String(second.coolDownH));
  assert.ok(second.kWh < first.kWh && Math.min(second.inBand.t, second.inBand.rh, second.inBand.co2) >= 90, 'it would have won on the band alone');
});

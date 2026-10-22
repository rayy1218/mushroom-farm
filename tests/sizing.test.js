// Suggest machines (server/sizing.js, spec 2026-10-22-suggest-machines-design.md 3 and 4): the estimates for Container Alpha,
// the candidates, the ranking, and a short search with the real simulation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimate, candidates, rank, runSizing, sizingDays } from '../server/sizing.js';
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
  assert.equal(e.acBTU, 9000); // about 2 kW of heat: 6900 BTU/h, the next size
  assert.equal(e.exchangeMaxMin, 60); // the fan has to run all the time at the strict stage
  assert.deepEqual(Object.keys(e.why), ['fanFlow', 'humidifierLH', 'dehumidifierLday', 'acBTU', 'exchangeMaxMin']);
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

test('days: the two stages of the program, at most 30', () => {
  assert.equal(sizingDays(input, ctx), 17); // fruiting 7 + rest 10
  assert.equal(sizingDays({ ...input, farmType: 'full', stage: 'spawn' }, ctx), 25); // spawn 21 + pinning 4
  assert.equal(sizingDays({ ...input, farmType: 'full', stage: 'spawn' }, { ...ctx, program: { days: { spawn: 40 } } }), 30);
});

test('candidates: at most 96, around the estimate', () => {
  const e = estimate(input, ctx);
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

const result = (t, rh, co2, kWh) => ({ machines: {}, exchangeMaxMin: 10, inBand: { t, rh, co2, all: Math.min(t, rh, co2) }, kWh, litres: 0, removedLitres: 0 });

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

// A fake simulation that answers by the fan: the progress and the ranking can be tested without 30 s of simulation.
const fake = (calls) => (inp, cx) => {
  calls.push({ inp, cx });
  const good = inp.physics.fanFlow >= 150;
  return { summary: { inBand: { t: 100, rh: 99, co2: good ? 99 : 60, all: 60 }, energy: { kWh: inp.physics.fanFlow / 10 }, water: { litres: 1, removedLitres: 0 } } };
};

test('runSizing: every candidate over the days of both stages with its machines and limit; the reply', () => {
  const calls = [], progress = [];
  const r = runSizing(input, ctx, { simulate: fake(calls), onProgress: (s) => progress.push(s) });
  assert.equal(calls.length, 48);
  assert.equal(calls[0].inp.days, 17);
  assert.equal(calls[0].cx.control.exchangeMaxMin, 60);
  assert.equal(calls[0].cx.control.acFan, 'auto', 'the room\'s other control settings stay');
  assert.equal(ctx.control.exchangeMaxMin, 10, 'the room\'s context is not touched');
  assert.equal(calls[0].inp.physics.wallUA, 30);
  assert.equal(progress.length, 48);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.every((s, i) => i === 0 || s > progress[i - 1]));
  assert.equal(r.target, 95);
  assert.equal(r.days, 17);
  assert.equal(r.reached, true);
  assert.deepEqual(r.notes, []);
  assert.equal(r.best.length, 5);
  assert.deepEqual(r.best[0], { machines: r.best[0].machines, exchangeMaxMin: 60, inBand: { t: 100, rh: 99, co2: 99, all: 60 }, kWh: 15, litres: 1, removedLitres: 0 });
  assert.equal(r.best[0].machines.fanFlow, 150);
  assert.equal(r.estimate.fanFlow, 150);
  assert.ok(r.estimate.why.fanFlow);
});

test('runSizing: when nothing reaches the target the notes say which value falls short', () => {
  const sim = (inp) => ({ summary: { inBand: { t: 80, rh: 99, co2: 90, all: 70 }, energy: { kWh: 1 }, water: { litres: 1, removedLitres: 0 } } });
  const r = runSizing(input, ctx, { simulate: sim });
  assert.equal(r.reached, false);
  assert.equal(r.notes.length, 2);
  assert.match(r.notes[0], /^CO₂ stays above the band/);
  assert.match(r.notes[1], /^Temperature stays above the band/);
  const humid = runSizing(input, ctx, { simulate: () => ({ summary: { inBand: { t: 99, rh: 70, co2: 99, all: 70 }, energy: { kWh: 1 }, water: { litres: 1, removedLitres: 0 } } }) });
  assert.match(humid.notes[0], /^Humidity stays out of its band/);
  assert.equal(runSizing({ ...input, target: 60 }, ctx, { simulate: sim }).reached, true);
});

test('runSizing with the real simulation reaches the target with a fan of at most 200 m³/h', () => {
  const e = estimate(input, ctx);
  const list = candidates(e).filter((c) => c.machines.fanFlow === e.fanFlow && c.machines.acBTU === 12000 && c.machines.dehumidifierLday === 10 && c.machines.humidifierLH === 0.5);
  assert.equal(list.length, 1);
  const r = runSizing(input, ctx, { simulate, list, days: 2 });
  assert.equal(r.days, 2);
  assert.equal(r.best.length, 1);
  assert.ok(r.reached, JSON.stringify(r.best[0]));
  assert.ok(r.best[0].machines.fanFlow <= 200);
  assert.ok(r.best[0].inBand.t >= 95 && r.best[0].inBand.rh >= 95 && r.best[0].inBand.co2 >= 95);
  assert.ok(r.best[0].kWh > 0);
});

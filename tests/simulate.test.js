// The simulation engine (spec 2026-10-20-crops-and-simulation-design.md 4.2 and 4.3): shapes, sane numbers, stage changes,
// energy that adds up, and the same input giving the same result.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../server/simulate.js';
import { DEFAULTS } from '../server/controller.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const input = (over = {}) => ({ physics, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1, ...over });
const ctx = (over = {}) => ({
  volume: 60,
  ratings: { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050 },
  control: { ...DEFAULTS },
  program: null,
  prices: { electricity: 0.55, water: null },
  ...over,
});

const day = simulate(input(), ctx());

test('the result has the four parts of the spec', () => {
  assert.deepEqual(Object.keys(day).sort(), ['machines', 'series', 'stages', 'summary']);
  assert.equal(day.series.length, 288 + 1 - 1);
  assert.deepEqual(Object.keys(day.series[0]).sort(),
    ['co2', 'co2High', 'co2Low', 'outRH', 'outT', 'rh', 'rhHigh', 'rhLow', 's', 'stage', 't', 'tHigh', 'tLow']);
  assert.equal(day.series[0].s, 0);
  assert.equal(day.series[1].s, 300);
  assert.equal(day.series[0].stage, 'fruiting');
  assert.deepEqual(Object.keys(day.machines).sort(), ['ac', 'circulation', 'exhaust', 'humidifier', 'intake']);
  for (const spans of Object.values(day.machines)) for (const sp of spans) assert.ok(sp.to > sp.from && sp.from >= 0 && sp.to <= 86400);
  assert.ok(day.machines.ac.every((sp) => typeof sp.setpoint === 'number'));
  assert.deepEqual(day.stages, [{ stage: 'fruiting', flush: 1, from: 0, to: 86400 }]);
  const s = day.summary;
  assert.deepEqual(Object.keys(s).sort(), ['days', 'energy', 'extremes', 'inBand', 'perDay', 'perStage', 'water']);
  assert.equal(s.days, 1);
  assert.deepEqual(Object.keys(s.inBand).sort(), ['all', 'co2', 'rh', 't']);
  assert.deepEqual(Object.keys(s.energy).sort(), ['byMachine', 'cost', 'kWh']);
  assert.deepEqual(Object.keys(s.energy.byMachine).sort(), ['ac', 'circulation', 'exhaust', 'humidifier', 'intake']);
  assert.deepEqual(Object.keys(s.extremes).sort(), ['co2Max', 'rhMax', 'rhMin', 'tMax', 'tMin']);
  assert.equal(s.perDay.length, 1);
  assert.deepEqual(Object.keys(s.perDay[0]).sort(), ['day', 'kWh', 'litres']);
  assert.equal(s.perStage.length, 1);
});

test('a day of the default room with 500 grey oyster blocks gives sane numbers', () => {
  const s = day.summary;
  assert.ok(s.inBand.t > 80, `T in band ${s.inBand.t}`);
  assert.ok(s.inBand.all <= Math.min(s.inBand.t, s.inBand.rh, s.inBand.co2));
  assert.ok(s.energy.kWh > 0);
  assert.ok(s.water.litres > 0);
  assert.equal(s.water.cost, null); // no water price
  assert.equal(s.energy.cost, Math.round(s.energy.kWh * 0.55 * 100) / 100);
  assert.ok(s.extremes.tMin < s.extremes.tMax && s.extremes.co2Max >= 420);
  assert.equal(s.inBand.t, Math.round(s.inBand.t * 10) / 10);
});

test('energy by machine adds up to the total, and the days add up to it', () => {
  const { byMachine, kWh } = day.summary.energy;
  const sum = Object.values(byMachine).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - kWh) < 0.005, `${sum} vs ${kWh}`);
  assert.ok(byMachine.circulation > 1.4 && byMachine.circulation < 1.45); // 60 W all day
  assert.ok(byMachine.ac >= 1.05 * 0.05 * 24 - 0.01); // at least the fan share
  const perDay = day.summary.perDay.reduce((a, d) => a + d.kWh, 0);
  assert.ok(Math.abs(perDay - kWh) < 0.02);
});

test('prices give costs', () => {
  const r = simulate(input(), ctx({ prices: { electricity: 0.5, water: 3 } }));
  assert.equal(r.summary.water.cost, Math.round((r.summary.water.litres / 1000) * 3 * 100) / 100);
  assert.equal(simulate(input(), ctx({ prices: null })).summary.energy.cost, null);
});

test('a run that crosses a stage change lists the stages and the bands move', () => {
  const program = { flushes: 4, days: { spawn: 21, pinning: 4, fruiting: 1, rest: 10 }, rampH: 4 };
  const r = simulate(input({ days: 3, stage: 'fruiting' }), ctx({ program }));
  assert.deepEqual(r.stages.map((x) => [x.stage, x.flush, x.from, x.to]), [
    ['fruiting', 1, 0, 86400], ['rest', 1, 86400, 3 * 86400],
  ]);
  const first = r.series[0];
  const last = r.series.at(-1);
  assert.equal(first.stage, 'fruiting');
  assert.equal(last.stage, 'rest');
  assert.notEqual(first.rhLow, last.rhLow); // rest holds 80 % RH, fruiting 88
  assert.equal(last.rhLow, 77);
  assert.equal(r.summary.perStage.length, 2);
  assert.deepEqual(Object.keys(r.summary.perStage[0]).sort(), ['flush', 'from', 'inBand', 'stage', 'to']);
  // during the ramp the lower humidity limit sits between the two stages' values
  const mid = r.series.find((x) => x.s === 86400 + 2 * 3600);
  assert.ok(mid.rhLow < first.rhLow && mid.rhLow > last.rhLow);
});

test('the same input gives the same result', () => {
  assert.deepEqual(simulate(input(), ctx()), day);
});

test('progress is reported at least every 1 %, ending at 1', () => {
  const seen = [];
  simulate(input(), ctx(), { onProgress: (x) => seen.push(x) });
  assert.ok(seen.length >= 99);
  assert.equal(seen.at(-1), 1);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] >= seen[i - 1] && seen[i] - seen[i - 1] <= 0.011);
});

test('a room without a stored program uses the defaults; a stored one is used', () => {
  const stored = { flushes: 2, days: { spawn: 1, pinning: 1, fruiting: 1, rest: 1 }, rampH: 0 };
  const r = simulate(input({ days: 3 }), ctx({ program: stored }));
  assert.deepEqual(r.stages.map((x) => x.stage), ['fruiting', 'rest', 'fruiting']);
  assert.deepEqual(r.stages.map((x) => x.flush), [1, 1, 2]);
});

test('a room without a stored program runs the default one: fruiting 7 days, then rest', () => {
  const r = simulate(input({ days: 8 }), ctx({ program: null }));
  assert.deepEqual(r.stages.map((x) => [x.stage, x.flush, x.from]), [['fruiting', 1, 0], ['rest', 1, 604800]]);
});

test('the control settings and the machine protection reach the run', () => {
  const run = (control) => simulate(input(), ctx({ control: { ...DEFAULTS, ...control } }));
  // Machine protection: the humidifier keeps each state at least a minute (the last span may be cut by the end of the run).
  const hum = run({}).machines.humidifier;
  assert.ok(hum.length > 3);
  for (const sp of hum.slice(0, -1)) assert.ok(sp.to - sp.from >= 60, `${sp.from}-${sp.to}`);
  // Fresh air: fifteen-minute interval gives one-minute fan runs; interval 0 gives none.
  const oneMinute = (r) => r.machines.intake.filter((sp) => sp.to - sp.from === 60).length;
  assert.ok(oneMinute(run({ exchangeEveryMin: 15 })) > 0);
  assert.equal(oneMinute(run({ exchangeEveryMin: 0 })), 0);
  // The aircon setpoint drops during an air exchange.
  const plain = run({ exchangeEveryMin: 0, acDrop: 0 }).machines.ac.map((sp) => sp.setpoint);
  const lowered = run({ exchangeEveryMin: 0, acDrop: 3 }).machines.ac.map((sp) => sp.setpoint);
  assert.deepEqual([...new Set(plain)], [25]);
  assert.ok(lowered.includes(22) && lowered.includes(25));
});

test('aircon energy follows the aircon size of the stepper (COP 3), not the room rating', () => {
  const kWh = (over, ratings) => simulate(input({ physics: { ...physics, ...over } }), ctx(ratings ? { ratings } : {})).summary.energy.byMachine.ac;
  const small = kWh({});
  assert.ok(small > 0 && small <= 24 * (12000 / 3412.142 / 3) + 0.01, `${small} kWh`);
  // the room's rating does not change it
  assert.equal(kWh({}, { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 5000 }), small);
});

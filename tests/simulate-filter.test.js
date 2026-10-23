// The intake filter in simulation runs (spec 2026-10-22-filter-design.md 8): the run's filter settings, its changes by days
// and by pressure, the intake's watts against it and the filter part of the summary. No filter settings: no filter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulate } from '../server/simulate.js';
import { validateSimulation, validateSizing } from '../server/simulations.js';
import { runSizing } from '../server/sizing.js';
import { DEFAULTS } from '../server/controller.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const filter = { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterLifeDays: 30, filterChangeDays: 0, filterUsedDays: 0, filterSensor: false };
const input = (over = {}, days = 1) => ({ physics: { ...physics, ...over }, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days });
const ctx = {
  volume: 60,
  ratings: { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050 },
  control: { ...DEFAULTS },
  program: null,
  prices: { electricity: null, water: null },
};

test('no filter settings: no filter in the summary', () => {
  assert.equal(simulate(input(), ctx).summary.filter, null);
});

test('a clean filter that never loads much: no changes, the pressure near clean, almost no unfiltered air', () => {
  const f = simulate(input({ ...filter, filterLifeDays: 365 }), ctx).summary.filter;
  assert.deepEqual(f.changes, []);
  assert.ok(f.meanFilterPa >= 40 && f.meanFilterPa < 42, `mean ${f.meanFilterPa} Pa`);
  assert.ok(f.unfilteredPct < 0.5, `unfiltered ${f.unfilteredPct} %`);
  assert.ok(f.meanExchangeM3h > 0);
});

test('a filter already at its change pressure: higher pressure, less air, a share through the leaks', () => {
  const clean = simulate(input({ ...filter, filterLifeDays: 365 }), ctx).summary.filter;
  const dirty = simulate(input({ ...filter, filterUsedDays: 30 }), ctx).summary.filter;
  assert.ok(dirty.meanFilterPa >= 80 && dirty.meanFilterPa < 90, `mean ${dirty.meanFilterPa} Pa`);
  // (1 − f) ÷ (1 + f) with f = 0.75 at the change pressure: about 14 % of the air of an exchange
  assert.ok(dirty.unfilteredPct > 12 && dirty.unfilteredPct < 16, `unfiltered ${dirty.unfilteredPct} %`);
  assert.ok(dirty.meanExchangeM3h < clean.meanExchangeM3h);
});

test('changed every day: a change at the start of each day after the first, s from the start', () => {
  const f = simulate(input({ ...filter, filterLifeDays: 1, filterChangeDays: 1 }, 3), ctx).summary.filter;
  assert.deepEqual(f.changes, [86400, 172800]);
});

test('a filter in use as long as its interval at the start is changed at once', () => {
  const f = simulate(input({ ...filter, filterChangeDays: 2, filterUsedDays: 2 }, 3), ctx).summary.filter;
  assert.deepEqual(f.changes, [0, 172800]);
});

test('with a sensor the filter is changed after 10 min of intake running at or above the change pressure', () => {
  // The sensor reads the change pressure at a loading of 1: a filter one life in use starts there.
  const run = simulate(input({ ...filter, filterLifeDays: 1, filterUsedDays: 1, filterSensor: true }, 3), ctx);
  const f = run.summary.filter;
  assert.ok(f.changes.length >= 1, 'changed at least once');
  // the intake ran at least 10 min between the start and the first change
  const onBefore = run.machines.intake.reduce((a, sp) => a + Math.max(0, Math.min(sp.to, f.changes[0]) - sp.from), 0);
  assert.ok(onBefore >= 600, `intake on ${onBefore} s before the change`);
  assert.equal(f.changes.length, 1, 'clean after the change: not again within the run');
  assert.deepEqual(simulate(input({ ...filter, filterLifeDays: 1, filterUsedDays: 1 }, 3), ctx).summary.filter.changes, [], 'no sensor, no reminder: never changed');
});

test('the intake costs more against a dirty filter; the other fans do not', () => {
  const clean = simulate(input({ ...filter, filterLifeDays: 365 }), ctx).summary.energy.byMachine;
  const dirty = simulate(input({ ...filter, filterUsedDays: 60 }), ctx).summary.energy.byMachine;
  const hoursClean = clean.intake / 0.06, hoursDirty = dirty.intake / 0.06;
  assert.ok(hoursDirty > hoursClean * 1.02, `intake kWh ${clean.intake} → ${dirty.intake}`);
  assert.ok(dirty.exhaust >= clean.exhaust * 0.9);
});

test('validation: no filter field is fine; with any of them the four settings are needed and checked like the device app', () => {
  const v = (over) => validateSimulation(input(over));
  assert.equal(v({}).input.physics.fanMaxPa, undefined);
  const ok = v({ fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 150, filterLifeDays: 30 }).input.physics;
  assert.deepEqual([ok.filterChangeDays, ok.filterUsedDays, ok.filterSensor], [0, 0, false]);
  assert.deepEqual(v({ ...filter, filterSensor: true }).input.physics.filterSensor, true);
  assert.deepEqual(v({ filterSensor: true }), { error: 'Fan maximum pressure must be a whole number from 20 to 2000 Pa', field: 'physics.fanMaxPa' });
  assert.equal(v({ ...filter, filterLifeDays: 0 }).field, 'physics.filterLifeDays');
  assert.deepEqual(v({ ...filter, filterChangeDays: 400 }), { error: 'Filter change every must be a whole number from 0 to 365 days', field: 'physics.filterChangeDays' });
  assert.deepEqual(v({ ...filter, filterUsedDays: 1.5 }), { error: 'Filter in use must be a whole number from 0 to 365 days', field: 'physics.filterUsedDays' });
  assert.deepEqual(v({ ...filter, filterSensor: 'yes' }), { error: 'Filter pressure sensor must be true or false', field: 'physics.filterSensor' });
  assert.deepEqual(v({ ...filter, fanMaxPa: 40 }), { error: "Fan maximum pressure must be above the clean filter's pressure drop", field: 'physics.fanMaxPa' });
  assert.deepEqual(v({ ...filter, filterFinalPa: 30 }), { error: "Filter change pressure must be above the clean filter's pressure drop", field: 'physics.filterFinalPa' });
  assert.deepEqual(v({ ...filter, filterFinalPa: 200 }), { error: "Filter change pressure must be below the fan's maximum pressure", field: 'physics.filterFinalPa' });
});

test('suggest machines runs with no filter: its physics carry no filter field, even when the request had them', () => {
  const checked = validateSizing({ ...input({ ...filter }), target: 90 });
  assert.equal(checked.input.physics.fanMaxPa, undefined);
  const seen = [];
  const fake = (inp) => {
    seen.push(inp.physics);
    return { summary: { inBand: { t: 99, rh: 99, co2: 99, all: 99 }, energy: { kWh: 1 }, water: { litres: 1, removedLitres: 0 } } };
  };
  runSizing(checked.input, ctx, { simulate: fake, list: [{ machines: { fanFlow: 150, humidifierLH: 1, dehumidifierLday: 0, acBTU: 9000 }, exchangeMaxMin: 10 }], days: 1 });
  assert.equal(seen.length, 1);
  for (const key of Object.keys(filter)) assert.equal(seen[0][key], undefined, key);
});

test('a run without filter settings gives the numbers it gave before the filter existed (v2 ee4d30a)', () => {
  // Container Alpha's size and blocks, 3 days; the expected numbers were taken from the code before this iteration.
  const alpha = { wallUA: 30, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 100, fanFlow: 150, acBTU: 12000, humidifierLH: 0.5, dehumidifierLday: 20 };
  const r = simulate({ physics: alpha, crops: [{ crop: 'oyster', blocks: 950 }], farmType: 'ready', stage: 'fruiting', days: 3 }, {
    volume: 32.6, ratings: { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 0.5, acInputW: 1050 },
    control: { ...DEFAULTS }, program: null, prices: { electricity: 0.55, water: 0.004 },
  });
  const { inBand, energy, water, extremes } = r.summary;
  assert.deepEqual({ inBand, energy, water, extremes, series: r.series.length, last: r.series.at(-1) }, {
    inBand: { t: 100, rh: 99.2, co2: 97.3, all: 96.5 },
    energy: { byMachine: { intake: 1.19, exhaust: 1.19, circulation: 4.32, humidifier: 0.66, dehumidifier: 0, ac: 17.24 }, kWh: 24.6, cost: 13.53 },
    water: { litres: 16.5, removedLitres: 0, cost: 0 },
    extremes: { tMin: 25, tMax: 25.2, rhMin: 84.8, rhMax: 91.2, co2Max: 903 },
    series: 864,
    last: { s: 258900, t: 25.07, rh: 87.2, co2: 859, outT: 26.2, outRH: 88.2, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 900, stage: 'fruiting' },
  });
  assert.equal(r.summary.filter, null);
});

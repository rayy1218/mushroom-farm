// Critique 2026-10-29c: Simulate runs the room's bands as it runs them (Room 1 ran CO₂ 800/700 ppm and a safety level of
// 1,000 ppm by hand; the simulation used the stage's 900/700 ppm and 1,500): an optional `bands` in the request, checked like
// the controller's, used from the run's start until the program moves to another stage. And the run counts what started
// each air exchange (summary.exchanges), so its page can say why the fans ran.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSimulation } from '../server/simulations.js';
import { simulate } from '../server/simulate.js';
import { DEFAULTS, validateControl, bandProblem } from '../server/controller.js';
import { openDb } from '../server/db.js';
import { createSimulations } from '../server/simulations.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const body = (over = {}) => ({ physics, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 1, ...over });
const roomBands = { tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, co2Low: 700, co2High: 800, co2Safety: 1000 };
const ctx = (over = {}) => ({
  volume: 60,
  ratings: { intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 1050 },
  control: { ...DEFAULTS },
  program: null,
  prices: { electricity: 0.55, water: null },
  ...over,
});

test('validation: bands are optional, kept whole in the input when given', () => {
  assert.equal(validateSimulation(body()).input.bands, undefined);
  assert.deepEqual(validateSimulation(body({ bands: { ...roomBands, extra: 1 } })).input.bands, roomBands);
});

test('validation: bands are checked like the controller\'s, the field named under bands', () => {
  const bad = (bands, field, error) => {
    const r = validateSimulation(body({ bands }));
    assert.equal(r.field, field, JSON.stringify(r));
    if (error) assert.equal(r.error, error);
  };
  bad(null, 'bands', 'Bands must be an object');
  bad([1], 'bands', 'Bands must be an object');
  bad({ ...roomBands, tLow: undefined }, 'bands.tLow', 'Temperature band lower limit must be a number from 16 to 35 °C');
  bad({ ...roomBands, tLow: 27 }, 'bands.tLow', 'Temperature band lower limit must be below the upper limit');
  bad({ ...roomBands, rhHigh: 101 }, 'bands.rhHigh');
  bad({ ...roomBands, co2Low: 900 }, 'bands.co2Low', 'Air exchange stop point must be below the start point');
  bad({ ...roomBands, co2Safety: 800 }, 'bands.co2Safety', 'CO₂ safety level must be above the air exchange start point');
  bad({ ...roomBands, co2Safety: '1000' }, 'bands.co2Safety');
});

test('the band checks are the controller\'s own (one place)', () => {
  const control = { ...DEFAULTS, ...roomBands, co2Low: 900 };
  assert.deepEqual(validateControl(control), bandProblem(control));
  assert.equal(bandProblem(roomBands), null);
});

test('simulate holds the given bands from the start, instead of the stage\'s', () => {
  const run = simulate({ ...body(), bands: roomBands }, ctx());
  for (const r of [run.series[0], run.series.at(-1)]) {
    assert.deepEqual([r.co2Low, r.co2High, r.tLow, r.tHigh, r.rhLow, r.rhHigh], [700, 800, 24, 26, 85, 91]);
  }
  const stage = simulate(body(), ctx());
  assert.equal(stage.series[0].co2High, 900);
  // CO₂ over 800 ppm starts the air exchange: it runs more than with the stage's 900
  const on = (r) => r.machines.intake.reduce((t, x) => t + x.to - x.from, 0);
  assert.ok(on(run) > on(stage), `${on(run)} vs ${on(stage)}`);
});

test('the given bands last until the program moves to another stage; then the stage\'s, as before', () => {
  const program = { flushes: 2, days: { spawn: 21, pinning: 4, fruiting: 1, rest: 10 }, rampH: 0 };
  const run = simulate({ ...body({ days: 2 }), bands: roomBands }, ctx({ program }));
  assert.equal(run.stages[1].stage, 'rest');
  const before = run.series.filter((r) => r.s < run.stages[1].from);
  const after = run.series.filter((r) => r.s >= run.stages[1].from);
  assert.ok(before.every((r) => r.co2High === 800));
  assert.ok(after.every((r) => r.co2High === 1900 && r.rhLow === 77));
});

test('the run counts what started each air exchange', () => {
  const run = simulate(body(), ctx());
  const e = run.summary.exchanges;
  assert.deepEqual(Object.keys(e).sort(), ['co2', 'cooling', 'drying', 'fresh', 'timed']);
  const spans = run.machines.intake.length;
  assert.equal(e.co2 + e.fresh + e.cooling + e.drying + e.timed, spans);
});

test('a run stores the bands it was given in its input', (t) => {
  const db = openDb(':memory:');
  const { id } = db.createRoom({ name: 'Room 1', length: 6, width: 4, height: 2.5 });
  const sims = createSimulations({ db, spawn: () => ({ stop() {} }), now: () => 5000 });
  t.after(() => { sims.close(); db.close(); });
  const { run } = sims.start(id, body({ bands: roomBands }));
  assert.deepEqual(db.getRun(run.id, { withResult: false }).input.bands, roomBands);
});

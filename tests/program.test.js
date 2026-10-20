// The stage program (server/program.js, spec 2026-10-20-crops-and-simulation-design.md 3.2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM_DEFAULTS, validateProgram, nextStage, stageEndsAt, startStage, bandsAt, advance, programDays } from '../server/program.js';
import { cropBands } from '../web/crops.js';

const DAY = 86_400_000;
const H = 3_600_000;
const T0 = 1_000_000_000_000;
const OWN = { co2Low: 600, co2High: 900, co2Safety: 1400, tLow: 21, tHigh: 23, rhLow: 90, rhHigh: 95 };
const prog = (extra = {}) => ({ ...PROGRAM_DEFAULTS, crops: [{ crop: 'oyster', blocks: 500 }], stageSince: T0, ...extra });

test('validateProgram', () => {
  assert.equal(validateProgram(prog()), null);
  assert.equal(validateProgram({ ...PROGRAM_DEFAULTS }), null, 'no crops is allowed');
  const err = (extra) => validateProgram(prog(extra));
  assert.deepEqual(err({ farmType: 'x' }), { error: 'Farm type must be ready or full', field: 'farmType' });
  for (const farmType of ['toString', '__proto__', 'constructor', ['ready']]) assert.equal(err({ farmType }).field, 'farmType', String(farmType));
  assert.deepEqual(err({ stage: 'spawn' }), { error: 'Stage must be one of fruiting, rest', field: 'stage' });
  assert.equal(err({ farmType: 'full', stage: 'spawn' }), null);
  assert.equal(err({ flushes: 0 }).field, 'flushes');
  assert.equal(err({ flushes: 11 }).field, 'flushes');
  assert.equal(err({ flush: 5 }).field, 'flush');
  assert.equal(err({ days: { ...PROGRAM_DEFAULTS.days, rest: 0 } }).field, 'days.rest');
  assert.equal(err({ days: { ...PROGRAM_DEFAULTS.days, spawn: 91 } }).field, 'days.spawn');
  assert.equal(err({ rampH: 49 }).field, 'rampH');
  assert.equal(err({ rampH: -1 }).field, 'rampH');
  assert.equal(err({ autoAdvance: 'yes' }).field, 'autoAdvance');
  assert.equal(err({ crops: [{ crop: 'x', blocks: 1 }] }).field, 'crops');
});

test('nextStage: spawn → pinning → fruiting ⇄ rest, done after the last flush', () => {
  assert.deepEqual(nextStage(prog({ farmType: 'full', stage: 'spawn' })), { stage: 'pinning', flush: 1, done: false });
  assert.deepEqual(nextStage(prog({ farmType: 'full', stage: 'pinning' })), { stage: 'fruiting', flush: 1, done: false });
  assert.deepEqual(nextStage(prog({ stage: 'fruiting', flush: 1 })), { stage: 'rest', flush: 1, done: false });
  assert.deepEqual(nextStage(prog({ stage: 'rest', flush: 1 })), { stage: 'fruiting', flush: 2, done: false });
  assert.deepEqual(nextStage(prog({ stage: 'fruiting', flush: 4 })), { stage: 'rest', flush: 4, done: true });
  assert.equal(nextStage(prog({ stage: 'rest', flush: 4, done: true })), null);
  assert.equal(nextStage(prog({ stage: 'rest', flush: 4, done: false })), null, 'never past the last flush');
});

test('stageEndsAt: since + the stage days; null without crops, auto off, at the end or before a start', () => {
  assert.equal(stageEndsAt(prog()), T0 + 7 * DAY);
  assert.equal(stageEndsAt(prog({ stage: 'rest' })), T0 + 10 * DAY);
  assert.equal(stageEndsAt(prog({ crops: [] })), null);
  assert.equal(stageEndsAt(prog({ autoAdvance: false })), null);
  assert.equal(stageEndsAt(prog({ stage: 'rest', flush: 4, done: true })), null);
  assert.equal(stageEndsAt(prog({ stageSince: null })), null);
});

test('startStage ramps from the present bands to the crop bands; a lower CO₂ limit at once', () => {
  const p = startStage(prog(), 'fruiting', T0, OWN);
  const to = cropBands('oyster', 'fruiting');
  assert.deepEqual(p.ramp.to, to);
  assert.deepEqual(p.ramp.from, OWN, 'CO₂ 900 → 900: not lower, so it ramps too');
  assert.equal(p.ramp.endAt, T0 + 4 * H);
  assert.equal(p.stageSince, T0);
  const golden = startStage(prog({ crops: [{ crop: 'golden', blocks: 1 }] }), 'fruiting', T0, OWN);
  assert.equal(golden.ramp.from.co2High, 700, 'the lower CO₂ limit is taken at once');
  assert.equal(golden.ramp.from.co2Low, 600);
  assert.equal(golden.ramp.from.co2Safety, 1300);
  assert.equal(golden.ramp.from.tLow, 21);
  const now = startStage(prog(), 'fruiting', T0, OWN, { ramp: false });
  assert.deepEqual(now.ramp.from, to);
  assert.deepEqual(bandsAt(now, T0), to);
  assert.equal(startStage(prog({ farmType: 'full', flush: 3 }), 'spawn', T0, OWN).flush, 1);
  assert.equal(startStage(prog({ flush: 3 }), 'fruiting', T0, OWN).flush, 3, 'by hand: the flush is kept');
  assert.equal(startStage(prog({ flush: 3, done: true }), 'fruiting', T0, OWN).flush, 1, 'a done program: new blocks, flush 1');
  assert.equal(startStage(prog({ flush: 3, done: true }), 'fruiting', T0, OWN).done, false);
});

test('bandsAt interpolates and rounds, then holds the target', () => {
  const p = startStage(prog(), 'fruiting', T0, OWN);
  assert.deepEqual(bandsAt(p, T0), OWN);
  assert.deepEqual(bandsAt(p, T0 + 2 * H), { co2Low: 650, co2High: 900, co2Safety: 1450, tLow: 22.5, tHigh: 24.5, rhLow: 88, rhHigh: 93 });
  assert.deepEqual(bandsAt(p, T0 + 5 * H), cropBands('oyster', 'fruiting'));
  assert.equal(bandsAt(prog(), T0), null);
});

test('bandsAt keeps every upper value above its lower one', () => {
  const p = { ...prog(), ramp: { from: { ...OWN, tLow: 22, tHigh: 22.04 }, to: { ...OWN, tLow: 22, tHigh: 22.04 }, startAt: T0, endAt: T0 + H } };
  const b = bandsAt(p, T0 + H / 2);
  assert.ok(b.tHigh > b.tLow);
});

test('advance: each change at its own end time; the bands of the ramp; an ended ramp is dropped', () => {
  const start = startStage(prog(), 'fruiting', T0, OWN);
  const mid = advance(start, T0 + 2 * H, OWN);
  assert.deepEqual(mid.changed, []);
  assert.equal(mid.bands.tLow, 22.5);
  assert.ok(mid.program.ramp);
  const after = advance(start, T0 + 5 * H, OWN);
  assert.deepEqual(after.bands, cropBands('oyster', 'fruiting'));
  assert.equal(after.program.ramp, null);
  assert.equal(advance(after.program, T0 + 6 * H, OWN).bands, null);
  // 7 days of fruiting, then rest
  const rest = advance(after.program, T0 + 7 * DAY + H, cropBands('oyster', 'fruiting'));
  assert.deepEqual(rest.changed, [{ stage: 'rest', flush: 1, at: T0 + 7 * DAY }]);
  assert.equal(rest.program.stageSince, T0 + 7 * DAY);
  assert.equal(rest.bands.rhHigh, 89, 'one hour into the 4 h ramp from 91 to 83');
});

test('advance over a long gap applies several changes and ends done', () => {
  const p = startStage(prog({ flushes: 2 }), 'fruiting', T0, OWN, { ramp: false });
  const r = advance(p, T0 + 60 * DAY, OWN);
  assert.deepEqual(r.changed.map((c) => [c.stage, c.flush, (c.at - T0) / DAY]), [['rest', 1, 7], ['fruiting', 2, 17], ['rest', 2, 24]]);
  assert.equal(r.program.done, true);
  assert.equal(r.program.stage, 'rest');
  assert.deepEqual(r.bands, cropBands('oyster', 'rest'), 'the last ramp has ended: its target');
  assert.equal(r.program.ramp, null);
});

test('programDays: from a stage to the end of the last rest', () => {
  assert.equal(programDays(prog()), 7 + 10 + 3 * (7 + 10));
  assert.equal(programDays(prog({ farmType: 'full', stage: 'spawn' })), 21 + 4 + 4 * 17);
  assert.equal(programDays(prog({ flushes: 1 })), 17);
});

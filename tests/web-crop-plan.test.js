// The Crop tab as a stage plan (spec 2026-10-26-crop-stage-plan-design.md): the pure parts of the card.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stagePlan, stageTargets, stageWarnings, cropHeadline, stageLength, stageMark } from '../web/crop-math.js';

const at = (d, h, m, month = 9) => new Date(2026, month, d, h, m).getTime();
const days = { spawn: 21, pinning: 4, fruiting: 7, rest: 10 };
const ready = {
  crops: [{ crop: 'lionsmane', blocks: 950 }], farmType: 'ready', stage: 'fruiting', stageSince: at(26, 9, 55), flush: 1, flushes: 2,
  days, rampH: 4, autoAdvance: true, done: false, ramp: null, nextStage: { stage: 'rest', flush: 1, at: at(2, 9, 55, 10) }, targets: null,
};
const full = {
  ...ready, crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'golden', blocks: 200 }], farmType: 'full', stage: 'spawn', flushes: 1,
  nextStage: { stage: 'pinning', flush: 1, at: at(16, 9, 55, 10) },
};
const pick = (plan) => plan.map((e) => [e.name, e.state, e.dates]);

test('the plan of a ready room: fruiting and rest repeat until the last flush, each with its dates', () => {
  assert.deepEqual(pick(stagePlan(ready, at(27, 12, 0))), [
    ['Fruiting · flush 1', 'current', '26 Oct → 2 Nov'],
    ['Rest between flushes · flush 1', 'next', '2 Nov → 12 Nov'],
    ['Fruiting · flush 2', 'later', '12 Nov → 19 Nov'],
    ['Rest between flushes · flush 2', 'later', '19 Nov → 29 Nov'],
  ]);
  const plan = stagePlan(ready, at(27, 12, 0));
  assert.deepEqual(plan.map((e) => [e.stage, e.flush]), [['fruiting', 1], ['rest', 1], ['fruiting', 2], ['rest', 2]]);
  assert.equal(new Set(plan.map((e) => e.key)).size, plan.length, 'every entry has its own key');
});

test('the plan of a full-cycle room: spawn and pinning once, before the flushes', () => {
  assert.deepEqual(pick(stagePlan(full, at(27, 12, 0))), [
    ['Spawn run', 'current', '26 Oct → 16 Nov'],
    ['Pinning', 'next', '16 Nov → 20 Nov'],
    ['Fruiting · flush 1', 'later', '20 Nov → 27 Nov'],
    ['Rest between flushes · flush 1', 'later', '27 Nov → 7 Dec'],
  ]);
});

test('the entries before the current one are done, without dates', () => {
  const rest = { ...ready, stage: 'rest', stageSince: at(2, 9, 55, 10), nextStage: { stage: 'fruiting', flush: 2, at: at(12, 9, 55, 10) } };
  assert.deepEqual(pick(stagePlan(rest, at(3, 0, 0, 10))), [
    ['Fruiting · flush 1', 'done', ''],
    ['Rest between flushes · flush 1', 'current', '2 Nov → 12 Nov'],
    ['Fruiting · flush 2', 'next', '12 Nov → 19 Nov'],
    ['Rest between flushes · flush 2', 'later', '19 Nov → 29 Nov'],
  ]);
  const second = { ...ready, flush: 2, stageSince: at(12, 9, 55, 10) };
  assert.deepEqual(pick(stagePlan(second, at(13, 0, 0, 10))).map((e) => e[1]), ['done', 'done', 'current', 'next']);
});

test('a done room: every entry done, then Replace the blocks', () => {
  const done = { ...ready, stage: 'rest', flush: 2, done: true, stageSince: at(19, 9, 55, 10), nextStage: null };
  assert.deepEqual(pick(stagePlan(done, at(20, 0, 0, 10))), [
    ['Fruiting · flush 1', 'done', ''],
    ['Rest between flushes · flush 1', 'done', ''],
    ['Fruiting · flush 2', 'done', ''],
    ['Rest between flushes · flush 2', 'done', ''],
    ['Replace the blocks', 'current', ''],
  ]);
  assert.equal(stagePlan(done, at(20, 0, 0, 10)).at(-1).stage, null);
});

test('without automatic change: no dates after the current entry', () => {
  const off = { ...ready, autoAdvance: false, nextStage: { stage: 'rest', flush: 1, at: null } };
  assert.deepEqual(pick(stagePlan(off, at(27, 12, 0))), [
    ['Fruiting · flush 1', 'current', 'since 26 Oct'],
    ['Rest between flushes · flush 1', 'next', ''],
    ['Fruiting · flush 2', 'later', ''],
    ['Rest between flushes · flush 2', 'later', ''],
  ]);
});

test('no crops: no plan', () => {
  assert.deepEqual(stagePlan({ ...ready, crops: [], stageSince: null }, at(27, 12, 0)), []);
  assert.deepEqual(stagePlan(null, at(27, 12, 0)), []);
});

test('the targets of one crop: temperature, humidity, the CO₂ band and its safety level', () => {
  assert.deepEqual(stageTargets([{ crop: 'lionsmane', blocks: 950 }], 'fruiting'), [
    { key: 't', name: 'Temperature', value: '19–21 °C' },
    { key: 'rh', name: 'Humidity', value: '87–93 % RH' },
    { key: 'co2', name: 'CO₂ kept between', value: '700–900 ppm' },
    { key: 'safety', name: 'CO₂ safety level', value: '1,500 ppm' },
  ]);
});

test('the CO₂ values are grouped in thousands', () => {
  const rows = stageTargets([{ crop: 'oyster', blocks: 500 }], 'spawn');
  assert.deepEqual(rows.map((r) => r.value), ['23–25 °C', '67–73 % RH', '4,700–4,900 ppm', '5,500 ppm']);
});

test('two crops: the overlap of their bands, the CO₂ band of the stricter one', () => {
  const rows = stageTargets(full.crops, 'fruiting');
  assert.deepEqual(rows.map((r) => r.value), ['24–25 °C', '85–91 % RH', '600–700 ppm', '1,300 ppm']);
  assert.deepEqual(stageTargets([], 'fruiting'), []);
});

test('the warnings of a stage: the mix and the crops\' good ranges', () => {
  assert.deepEqual(stageWarnings(full.crops, 'fruiting'), []);
  const mixed = stageWarnings([{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 500 }], 'fruiting');
  assert.equal(mixed[0], "Grey oyster and Lion's mane (draft) do not fit one temperature band");
  assert.ok(mixed.some((w) => /goes past the guide's 16–22 °C for Lion's mane \(draft\)/.test(w)));
  assert.deepEqual(stageWarnings([{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 500 }], 'spawn'),
    ["Grey oyster and Lion's mane (draft) do not fit one humidity band"], 'the ranges are of fruiting only');
  assert.deepEqual(stageWarnings([], 'fruiting'), []);
});

test('the head: what grows, how many blocks, the farm type', () => {
  assert.deepEqual(cropHeadline(ready), { title: "Lion's mane · 950 blocks", farm: 'Ready-to-fruit blocks (bought in)' });
  assert.deepEqual(cropHeadline(full), { title: 'Grey oyster 300 + Golden oyster 200 blocks', farm: 'Full cycle (own spawn run and pinning)' });
  assert.equal(cropHeadline({ ...ready, crops: [{ crop: 'oyster', blocks: 1200 }] }).title, 'Grey oyster · 1,200 blocks');
  assert.deepEqual(cropHeadline({ ...ready, crops: [] }), { title: 'No crop set: the bands are set by hand', farm: '' });
});

test('the length of a stage: fruiting times the flushes', () => {
  assert.equal(stageLength(ready, 'fruiting'), '7 days × 2 flushes');
  assert.equal(stageLength({ ...ready, flushes: 1 }, 'fruiting'), '7 days × 1 flush');
  assert.equal(stageLength(ready, 'rest'), '10 days');
  assert.equal(stageLength({ ...ready, days: { ...days, pinning: 1 } }, 'pinning'), '1 day');
});

test('the mark of a stage: current with its day and flush, next with when, or none', () => {
  const now = at(27, 12, 0);
  assert.deepEqual(stageMark(ready, 'fruiting', now), { kind: 'current', text: 'Current · day 2 of 7 · flush 1 of 2' });
  assert.deepEqual(stageMark(ready, 'rest', now), { kind: 'next', text: 'Next · about 2 Nov 09:55' });
  assert.deepEqual(stageMark(full, 'spawn', now), { kind: 'current', text: 'Current · day 2 of 21' });
  assert.deepEqual(stageMark(full, 'fruiting', now), { kind: '', text: '' });
  const off = { ...ready, autoAdvance: false, nextStage: { stage: 'rest', flush: 1, at: null } };
  assert.deepEqual(stageMark(off, 'fruiting', at(30, 12, 0)), { kind: 'current', text: 'Current · day 5 · flush 1 of 2' });
  assert.deepEqual(stageMark(off, 'rest', now), { kind: 'next', text: 'Next · when you start it' });
  // the server sends nextStage null while automatic change is off: the next stage by the program's rules, without a time
  const none = { ...off, nextStage: null };
  assert.deepEqual(stageMark(none, 'rest', now), { kind: 'next', text: 'Next · when you start it' });
  assert.deepEqual(stageMark({ ...none, stage: 'spawn', farmType: 'full' }, 'pinning', now), { kind: 'next', text: 'Next · when you start it' });
  assert.deepEqual(stageMark({ ...none, stage: 'rest' }, 'fruiting', now), { kind: 'next', text: 'Next · when you start it' });
  assert.deepEqual(stageMark({ ...none, stage: 'rest', flush: 2 }, 'fruiting', now), { kind: '', text: '' }, 'after the last rest nothing follows');
  const done = { ...ready, stage: 'rest', flush: 2, done: true, nextStage: null };
  assert.deepEqual(stageMark(done, 'rest', now), { kind: 'current', text: 'Current · flush 2 of 2 done' });
  assert.deepEqual(stageMark(done, 'fruiting', now), { kind: '', text: '' });
  assert.deepEqual(stageMark({ ...ready, crops: [] }, 'fruiting', now), { kind: '', text: '' });
});

test('the card sends what the pure parts build: start, save and new blocks', () => {
  const src = readFileSync(new URL('../web/crop-card.js', import.meta.url), 'utf8');
  for (const name of ['startBody', 'saveBody', 'newBlocksBody', 'checkCropForm', 'stagePlan', 'stageTargets', 'cropHeadline']) {
    assert.match(src, new RegExp(`\\b${name}\\(`), `the card calls ${name}`);
  }
  assert.match(src, /export function createCropCard\(host, \{ roomId, onChange, onData, onOffline, onGone, getRoom, getBands = \(\) => null \}\)/);
  assert.match(src, /Start this stage/);
  assert.match(src, /Bands at once \(skip the/);
});

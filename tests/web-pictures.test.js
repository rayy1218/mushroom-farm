// The farm's pictures (spec 2026-11-03-pictures-design.md): one for every crop, crop and stage, machine, sensor and task rule;
// the Picture Rule (no state colour, no fixed colour: every fill a picture token defined in both themes).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CROPS as CROP_LIST } from '../web/crops.js';
import { DAILY_RULES, CLEAR_OUT, UPKEEP_RULES } from '../server/task-rules.js';
import { EQUIPMENT_CARDS } from '../web/equipment-cards.js';
import {
  CROPS, MACHINES, SENSORS, TASKS, STAGE_KEYS, markup, hues, taskPicture, equipmentPicture, machinePicture,
} from '../web/pictures-data.js';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const block = (selector) => {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `styles.css has ${selector}`);
  return css.slice(at, css.indexOf('\n}', at));
};
const dark = block(':root[data-theme="dark"]');
const light = block(':root[data-theme="light"]');
const defined = (b, name) => new RegExp(`${name}\\s*:`).test(b);

const every = () => [
  ...Object.keys(CROP_LIST).flatMap((k) => [['crop', k], ...STAGE_KEYS.map((s) => ['bag', k, s])]),
  ...Object.keys(MACHINES).map((k) => ['machine', k]),
  ...Object.keys(SENSORS).map((k) => ['sensor', k]),
  ...Object.keys(TASKS).map((k) => ['task', k]),
];

test('every crop of the crop list has a picture and two hues; a bag for every stage and for done', () => {
  assert.deepEqual(Object.keys(CROPS).sort(), Object.keys(CROP_LIST).sort());
  assert.deepEqual(STAGE_KEYS, ['spawn', 'pinning', 'fruiting', 'rest', 'done']);
  for (const k of Object.keys(CROP_LIST)) {
    assert.ok(markup('crop', k).includes('<path'), k);
    const [c, c2] = hues(k);
    assert.match(c, /^--p-/);
    assert.match(c2, /^--p-.*-2$/);
    for (const s of STAGE_KEYS) assert.ok(markup('bag', k, { stage: s }).length > 100, `${k} ${s}`);
  }
  assert.deepEqual(hues(null), hues('oyster'), 'no crop: the grey oyster hues');
  assert.notEqual(markup('bag', 'oyster', { stage: 'fruiting' }), markup('bag', 'pink', { stage: 'fruiting' }), 'the fruiting bag shows its crop');
});

test('every task rule has a picture; own rules, long-term tasks and unknown keys have theirs', () => {
  for (const r of [...DAILY_RULES, CLEAR_OUT, ...UPKEEP_RULES]) assert.ok(TASKS[r.key], r.key);
  for (const k of ['own', 'longTerm', 'generic']) assert.ok(TASKS[k], k);
  assert.equal(taskPicture({ kind: 'daily', ruleKey: 'contamWalk' }), 'contamWalk');
  assert.equal(taskPicture({ kind: 'daily', ruleKey: 'custom:4' }), 'own');
  assert.equal(taskPicture({ kind: 'upkeep', ruleKey: 'custom:9' }), 'own');
  assert.equal(taskPicture({ kind: 'longterm', ruleKey: null }), 'longTerm');
  assert.equal(taskPicture({ kind: 'daily', ruleKey: 'someday' }), 'generic', 'a rule this page does not know yet');
  assert.equal(markup('task', 'someday'), markup('task', 'generic'));
  assert.equal(taskPicture({ kind: 'daily', ruleKey: '__proto__' }), 'generic', 'only the table\'s own keys');
  assert.equal(markup('task', 'toString'), markup('task', 'generic'));
  assert.equal(markup('machine', 'constructor'), '');
  assert.deepEqual(hues('__proto__'), hues('oyster'));
});

test('a harvest task holds the room crop; without one, the grey oyster', () => {
  for (const k of ['harvestAm', 'harvestPm', 'harvestDaily', 'reishiRim']) {
    assert.ok(markup('task', k, { crop: 'pink' }).includes(markup('crop', 'pink')), k);
    assert.ok(markup('task', k).includes(markup('crop', 'oyster')), `${k} without a crop`);
    assert.ok(!markup('task', k).includes('CROP'), `${k}: no placeholder left`);
  }
});

test('every equipment card and every Machines row has its picture', () => {
  for (const c of EQUIPMENT_CARDS) {
    const [kind, key] = equipmentPicture(c.key);
    assert.ok((kind === 'machine' ? MACHINES : SENSORS)[key], `${c.key} → ${kind} ${key}`);
  }
  for (const k of ['intake', 'ac', 'circ', 'lights', 'hu', 'dh', 'exhaust']) assert.ok(MACHINES[machinePicture(k)], k);
});

test('the Picture Rule: no fixed colour and no state colour; every picture token in both themes', () => {
  const used = new Set();
  for (const [kind, key, stage] of every()) {
    const m = markup(kind, key, { stage, crop: 'pink' });
    assert.doesNotMatch(m, /#[0-9a-f]{3,8}\b|rgba?\(/i, `${kind} ${key}: colours come from tokens`);
    assert.doesNotMatch(m, /var\(--(good|warning|critical|accent|s-|m-run)/, `${kind} ${key}: no state or series colour`);
    for (const [, name] of m.matchAll(/var\((--p-[a-z0-9-]+)\)/g)) used.add(name);
  }
  for (const k of Object.keys(CROP_LIST)) for (const h of hues(k)) used.add(h);
  assert.ok(used.size > 20);
  for (const name of used) {
    assert.ok(defined(dark, name), `${name} in the dark theme`);
    assert.ok(defined(light, name), `${name} in the light theme`);
  }
});

// A token's name is not enough (finish review 2026-11-03: the harvest sun was the warning's amber under another name): every
// picture colour keeps its distance from the state and accent colours of its theme. The crops' own hues (golden oyster is
// yellow, pink oyster pink), the fly trap's yellow and water's pale blue are what they draw, and their words say so.
test('the Picture Rule by colour: no picture token near a state or accent colour', () => {
  const hex = (b) => Object.fromEntries([...b.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\b/g)].map((m) => [m[1], m[2]]));
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const far = (a, b) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
  const drawn = /^--p-(golden|pink|reishi|trap|water|cool)/;
  for (const b of [dark, light]) {
    const t = hex(b);
    const state = Object.entries(t).filter(([k]) => /^--(good|warning|critical|accent)(-text)?$/.test(k));
    for (const [k, v] of Object.entries(t)) {
      if (!k.startsWith('--p-') || drawn.test(k)) continue;
      for (const [sk, sv] of state) assert.ok(far(v, sv) >= 48, `${k} ${v} is near ${sk} ${sv}`);
    }
  }
});

// The Settings page's Workers and Task rules cards (spec 2026-10-30-tasks-design.md 7.3). Source checks; the checks of the
// names, intervals, own rules and the rules' PUT body are in web-settings.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const cards = src('task-settings.js');
const page = src('settings-page.js');

test('the Settings page mounts the two cards in its grid and unmounts them', () => {
  assert.ok(page.includes("import { mountTaskSettings } from './task-settings.js';"));
  assert.ok(page.includes('<div class="tk-settings" data-task-settings></div>'));
  assert.ok(page.includes("const unmountTaskSettings = mountTaskSettings(q('[data-task-settings]'));"));
  assert.ok(page.slice(page.indexOf('return function unmount()')).includes('unmountTaskSettings();'));
});

test('Workers: add, rename, remove; each change sends the whole list', () => {
  assert.ok(cards.includes('<h2>Workers</h2>'));
  assert.ok(cards.includes("request('PUT', '/api/workers', { workers: list }, COMMAND_TIMEOUT)"));
  assert.ok(cards.includes('putWorkers(workersAfter(workers, { add: p.value }), onField)'));
  assert.ok(cards.includes('putWorkers(workersAfter(workers, { rename: { id: x.id, name: p.value } }), onField)'));
  assert.ok(cards.includes('putWorkers(workersAfter(workers, { remove: x.id }))'));
});

test('Task rules: every built-in rule with its words and an On/Off switch, the upkeep intervals, Add your own', () => {
  assert.ok(cards.includes('<h2>Task rules</h2>'));
  assert.ok(cards.includes("request('PUT', '/api/task-rules', rulesBody(next, rules), COMMAND_TIMEOUT)"), 'an interval only where it changed');
  assert.ok(cards.includes("b.setAttribute('aria-pressed', String(on));"));
  assert.ok(cards.includes('ruleItem(b, ruleLine(b), `rule-${b.key}`'));
  assert.ok(cards.includes('[everyBox(b)]'));
  assert.ok(cards.includes('<button type="button" data-add-rule>Add your own</button>'));
  assert.ok(cards.includes('custom: [...rules.custom, p.value]'));
});

test("the own rule form shows each of parseCustomRule's errors under its box, the time of day's too", () => {
  assert.ok(cards.includes("errors: { text: q('#e-rule-text'), rooms: q('#e-rule-rooms'), everyDays: q('#e-rule-every'), slot: q('#e-rule-slot') },"));
  assert.match(cards, /<select id="f-rule-slot" name="slot" aria-describedby="e-rule-slot">\$\{SLOT_OPTIONS\}<\/select>\s*<p class="field-error" id="e-rule-slot" role="status"><\/p>/);
  assert.ok(cards.includes('const first = { text: f.text, rooms: f.all, everyDays: f.every, slot: f.slot }[names[0]];'));
});

test("a room gone since the page loaded (the server refuses an own rule's rooms): the rules and rooms are asked again and it says so", () => {
  assert.ok(cards.includes("if (err.status === 400 && /^custom\\.\\d+\\.rooms$/.test(err.field ?? '')) {"));
  assert.ok(cards.includes('r.error.textContent = ROOMS_CHANGED;'));
  assert.ok(cards.includes('await reloadRules();'));
});

test('a farm app from before the tasks: the cards stay hidden', () => {
  assert.ok(cards.includes('} else if (!routeMissing(wk.reason)) {'));
  assert.ok(cards.includes("} else if (rl.status === 'rejected' && !routeMissing(rl.reason)) {"));
});

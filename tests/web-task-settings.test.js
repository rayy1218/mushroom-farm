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
  assert.ok(cards.includes('await putWorkers(workersAfter(workers, { add: p.value }), onField)'));
  assert.ok(cards.includes('await putWorkers(workersAfter(workers, { rename: { id: x.id, name: p.value } }), onField)'));
  assert.ok(cards.includes('await putWorkers(workersAfter(workers, { remove: x.id }))'));
});

test('Workers: after a rename the cursor is on its Rename button, after a removal on the next name (else the Add box)', () => {
  const rename = cards.slice(cards.indexOf('{ rename: { id: x.id, name: p.value } }'));
  assert.match(rename, /^[^]*?renaming = null;\s*paintWorkers\(\);\s*focusTo\(`rename-\$\{x\.id\}`\);/);
  assert.ok(cards.includes('const next = idAfter(workers.filter((y) => y.active).map((y) => y.id), x.id);'));
  assert.ok(cards.includes('focusTo(next === null ? null : `rename-${next}`, w.input);'));
});

test('Workers: Esc cancels a rename; an open rename stays open (with what was typed) through a repaint', () => {
  assert.ok(cards.includes("if (event.key === 'Escape') { event.preventDefault(); cancelRename(x); }"));
  assert.ok(cards.includes('renaming?.id === x.id ? renameItem(x) : workerItem(x)'));
  assert.ok(cards.includes("input.addEventListener('input', () => { renaming.value = input.value; });"));
});

test('each card saves one change at a time and says so when a click comes meanwhile (none is dropped unsaid)', () => {
  assert.ok(cards.includes('if (workersBusy) { w.error.textContent = STILL_SAVING; return false; }'));
  assert.ok(cards.includes('if (rulesBusy) { r.error.textContent = STILL_SAVING; return false; }'));
  assert.ok(!/\bbusy\b/.test(cards.replace(/workersBusy|rulesBusy/g, '')), 'no busy shared by the two cards');
});

test('Task rules: every built-in rule with its words and an On/Off switch, the upkeep intervals, Add your own', () => {
  assert.ok(cards.includes('<h2>Task rules</h2>'));
  assert.ok(cards.includes("request('PUT', '/api/task-rules', rulesBody(next, rules), COMMAND_TIMEOUT)"), 'an interval only where it changed');
  assert.ok(cards.includes("b.setAttribute('aria-pressed', String(on));"));
  assert.ok(cards.includes('ruleItem(b, ruleLine(b), `rule-${b.key}`'));
  assert.ok(cards.includes('[everyBox(b)]'));
  assert.ok(cards.includes('<button type="button" data-add-rule>Add your own</button>'));
});

test("the own rule form shows each of parseCustomRule's errors under its box, the time of day's too; each such box is marked and the cursor goes to the first", () => {
  assert.ok(cards.includes("errors: { text: q('#e-rule-text'), rooms: q('#e-rule-rooms'), everyDays: q('#e-rule-every'), slot: q('#e-rule-slot') },"));
  assert.match(cards, /<select id="f-rule-slot" name="slot" aria-describedby="e-rule-slot">\$\{SLOT_OPTIONS\}<\/select>\s*<p class="field-error" id="e-rule-slot" role="status"><\/p>/);
  assert.ok(cards.includes("for (const input of boxesOf(name)) input.setAttribute('aria-invalid', 'true');"));
  assert.ok(cards.includes('boxesOf(names[0])[0]?.focus();'));
});

test('an upkeep interval: its error under its own box (linked to it), gone once it reads right, kept through a repaint', () => {
  assert.ok(cards.includes('err.id = `e-every-${rule.key}`;'));
  assert.ok(cards.includes("input.setAttribute('aria-describedby', err.id);"));
  const change = cards.slice(cards.indexOf("input.addEventListener('change', () => {\n      const p = parseEveryDays(input.value);"));
  assert.match(change, /^[^]*?everyDrafts\.set\(rule\.key, \{ value: input\.value, error: p\.error \}\);[^]*?everyDrafts\.delete\(rule\.key\);\s*err\.textContent = '';\s*input\.removeAttribute\('aria-invalid'\);\s*if \(p\.value !== rule\.everyDays\)/);
  assert.ok(!change.slice(0, change.indexOf('return box;')).includes('r.error.textContent'), 'not on the card-level line');
});

test('your own rules: Edit opens the form filled in and saves that rule (same id); Remove asks first, then saves the list without it', () => {
  assert.ok(cards.includes('const v = ruleForm(rule);'));
  assert.ok(cards.includes('customAfter(rules.custom, editing === null ? { add: p.value } : { edit: { id: editing, rule: p.value } })'));
  assert.ok(cards.includes("r.removeText.textContent = `Remove '${c.text}'? Its open tasks are cancelled.`;"));
  assert.ok(cards.includes("if (r.removeDialog.returnValue !== 'remove')"));
  assert.ok(cards.includes('await putRules({ ...rules, custom: customAfter(rules.custom, { remove: id }) })'));
  assert.ok(cards.includes("if (event.key === 'Escape') { event.preventDefault(); closeForm(); }") || cards.includes("r.form.addEventListener('keydown'"));
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

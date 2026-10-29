// Critique 2026-10-29, simulation and Suggest: the result page's verdict first, the sizing form's two fieldsets in one column on a
// phone, the Simulations list's row order, a Simulate dialog of one height, and the back links' words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const css = src('styles.css');
const block = css.slice(css.indexOf('/* critique 2026-10-29: simulation and Suggest */'));

test('a result page: the verdict comes before what the run was given, which folds (closed on a phone)', () => {
  const page = src('simulation-page.js');
  assert.ok(page.indexOf('data-verdict') < page.indexOf('data-inputs'), 'the verdict host is above the inputs');
  assert.match(page, /<details class="card sim-inputs" data-inputs hidden>\s*<summary class="sim-inputs-head"><h2>What this run was given<\/h2><\/summary>/);
  assert.match(page, /els\.inputs\.open = !matchMedia\('\(max-width: 600px\)'\)\.matches;/);
  assert.match(page, /els\.verdict\.append\(v\);/);
  assert.doesNotMatch(page, /els\.results\.append\(v\);/);
  assert.match(block, /\.sim-inputs-head \{[^}]*min-height: 44px;/);
});

test('the sizing form: Walls and sun, then Weather, in Simulate step 1 and on the Suggest page, one column on a phone', () => {
  for (const name of ['simulate-dialog.js', 'suggest-page.js']) {
    const page = src(name);
    assert.match(page, /for \(const g of PHYSICS_GROUPS\) \{/, name);
    assert.match(page, /el\('div', g\.key === 'weather' \? 'sizes sim-physics' : 'sizes two sim-physics'\)/, name);
    assert.match(page, /fieldLabel\(f\)/, name);
    assert.doesNotMatch(page, /'Walls and weather'/, name);
  }
  assert.match(block, /@media \(max-width: 600px\) \{\s*\.sizes\.sim-physics, \.sizes\.two\.sim-physics, \.sizes\.two\.sg-goal \{ grid-template-columns: 1fr; gap: 12px; \}/);
  assert.match(block, /\.sim-physics \.field input \{ width: 12ch; max-width: 100%; \}/);
  assert.match(block, /\.sg-form \{ max-width: 760px; \}/);
});

test('the Suggest form: the crops\' bands are a plain block with a heading, not a card in a card; the page line is short', () => {
  const page = src('suggest-page.js');
  assert.match(page, /const mix = el\('div', 'sim-mix sg-mix'\);/);
  assert.match(page, /el\('h3', 'sim-mix-title', "The search holds the room in the crops' bands for each stage"\)/);
  assert.match(block, /\.sg-mix \{ padding: 0; border: 0; \}/);
  assert.match(page, /<p class="page-sub sg-sub">/);
  assert.match(block, /\.sg-sub \{ max-width: 60ch; \}/);
});

test('Suggest: the room\'s machines go with the search as its baseline and show first, labelled, without Use this', () => {
  const page = src('suggest-page.js');
  assert.match(page, /now = roomMachines\(\{ room, lastRun: Array\.isArray\(runs\) \? runs\[0\] \?\? null : null \}\);/);
  assert.match(page, /const asked = \{ \.\.\.sizingBody\(state, targetText, coolText\), baseline: now\.machines \};/);
  assert.match(page, /writeStored\(id, \{ id: created\.id, body: asked, target: targetText, coolDown: coolText, from: now\.from \}\);/);
  assert.match(page, /baseFrom = stored\.from \?\? '';/);
  // a baseline field the form does not have: the error is said over the result, not lost
  assert.match(page, /if \(err\.status === 400 && err\.field && !err\.field\.startsWith\('baseline'\)\) showErrors/);
  const view = page.slice(page.indexOf('function resultView('));
  assert.match(view, /const base = baselineRow\(result, prices\);/);
  assert.ok(view.indexOf('baseView(base') < view.indexOf("el('ol', 'sg-list')"), 'the baseline row comes before the suggestions');
  assert.match(view, /el\('p', 'sg-caption', captionOf\(result, rows\.length\)\)/);
  const baseView = page.slice(page.indexOf('function baseView('), page.indexOf('function resultView('));
  assert.match(baseView, /el\('div', 'sg-row sg-base'\)/);
  assert.match(baseView, /el\('p', 'sg-base-title', 'What the room has now'\)/);
  assert.match(baseView, /el\('span', 'sg-base-tag', 'Baseline'\)/);
  assert.doesNotMatch(baseView, /Use this/);
  assert.match(block, /\.sg-base \{[^}]*background:/);
});

test('a link styled as a button (Suggest machines) is 44 px tall on a phone, like a button', () => {
  assert.match(block, /@media \(max-width: 600px\) \{\s*a\.button \{ min-height: 44px; \}/);
});

test('the Simulations list on a phone: date and In band on the first line, then the machines, the differing settings, energy and water', () => {
  assert.match(block, /\.sim-item \{ grid-template-columns: auto minmax\(0, 1fr\) auto; grid-template-areas: "date band status" "machines machines machines" "given given given" "use use use" "length length pick"; \}/);
  assert.match(block, /\.sim-item \.sim-name \{ display: contents; \}/);
  for (const [sel, area] of [['.sim-name > a', 'date'], ['> .sim-all', 'band'], ['> .sim-status', 'status'], ['.sim-machines', 'machines'], ['.sim-given', 'given'], ['> .sim-use', 'use'], ['> .sim-length', 'length'], ['> .sim-pick', 'pick']]) {
    assert.ok(block.includes(`.sim-item ${sel} { grid-area: ${area};`), `${sel} in ${area}`);
  }
});

test('Simulate keeps one height on a desk while its steps show, so Back and Next stay under the pointer', () => {
  const dialog = src('simulate-dialog.js');
  assert.match(dialog, /d\.dataset\.stepper = '';/);
  assert.match(dialog, /function paintRun\(\) \{\s*delete d\.dataset\.stepper;/);
  assert.match(block, /@media \(min-width: 601px\) \{\s*\.sim-dialog\[data-stepper\] \{ height: min\(760px, calc\(100dvh - max\(16px, 6vh\) - 16px\)\); \}/);
  assert.match(block, /\.sim-dialog\[data-stepper\] > form \{ display: flex; flex-direction: column; min-height: 100%; \}/);
  assert.match(block, /\.sim-dialog\[data-stepper\] \.sim-body \{ flex: 1 0 auto; \}/);
});

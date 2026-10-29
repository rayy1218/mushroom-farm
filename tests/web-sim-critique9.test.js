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

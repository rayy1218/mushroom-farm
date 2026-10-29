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

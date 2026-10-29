// The Simulate dialog's layout and focus (critique 2026-10-28): it fits the screen with its buttons in a footer that stays,
// the heading takes the focus (a field's focus pops a phone's keyboard), the aircon's sold-as picker and the farm type stay
// readable on a phone, and the intake filter folds away while it holds the room's own values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const dialog = src('simulate-dialog.js');
const css = src('styles.css');

test('the heading takes the focus on opening and on every step, never the first field', () => {
  assert.match(dialog, /title\.tabIndex = -1;/);
  assert.doesNotMatch(dialog, /querySelector\('input(, select)?'\)\?\.focus\(\)/, 'no field is focused on its own');
  assert.equal((dialog.match(/title\.focus\(\)/g) ?? []).length >= 3, true, 'opening, Next and Back');
});

test('the dialog fits the screen and its buttons stay in a footer that does not scroll away', () => {
  assert.match(css, /\.sim-dialog \{[^}]*max-height: calc\(100dvh - var\(--dialog-top\) - 16px\); padding-bottom: 0;/);
  assert.match(css, /\.sim-dialog \.actions \{[^}]*position: sticky; bottom: 0;/);
});

test('on a phone the aircon field takes the whole row, so its sold-as picker reads "12,000 BTU/h"; the farm type is full width', () => {
  assert.match(css, /@media \(max-width: 600px\) \{ \.sim-dialog \.sizes\.two > \.field:has\(\.sim-ac\) \{ grid-column: 1 \/ -1; \} \}/);
  assert.match(dialog, /const farmBox = el\('div', 'sim-farm'\);/);
});

test('the intake filter folds in a details, open when it is not the room\'s or a field in it has an error', () => {
  assert.match(dialog, /const filter = el\('details', 'sim-fold'\);/);
  assert.match(dialog, /filter\.open = !filterFromRoom\(state, room\);/);
  assert.match(dialog, /const fold = node\.closest\('details'\);\s*if \(fold\) fold\.open = true;/);
});

test('every field of the dialog has an id or a name', () => {
  assert.match(dialog, /sold\.name = 'acClass';/);
  assert.match(dialog, /select\.name = `crop-\$\{i \+ 1\}`;/);
  assert.match(dialog, /blocks\.name = `blocks-\$\{i \+ 1\}`;/);
  assert.match(dialog, /daysInput\.name = 'days';/);
});

test('step 3: the Control row\'s settings can be changed for this run, the fresh air interval only on the Setup tab', () => {
  assert.match(dialog, /box\.append\(radios, starts, el\('h3', 'sim-sub', 'Your choices'\), list, control\.node, suggestLink\(\)\);/);
  assert.match(dialog, /const head = el\('summary', '', 'Change for this run'\);/);
  assert.match(dialog, /field\(`control\.\$\{f\.key\}`, f\.label, numberInput\(controlText\(state, f\.key\)/);
  assert.match(dialog, /box\.dataset\.field = `control\.\$\{f\.key\}`;/);
  assert.match(dialog, /const fixed = fixedControlLine\(state\);/);
  assert.match(dialog, /fold\.open = Object\.keys\(runControl\(state\)\.own\)\.length > 0( \|\| hooks\.change !== undefined)?;/);
  assert.match(dialog, /roomControl: control, again: hooks\.from \?\? null/);
});

test('Suggest machines is a page of its own (owner 2026-10-28): step 3 links to it instead of holding the search', () => {
  assert.match(dialog, /const link = el\('a', 'sim-suggest-link', 'Suggest machines instead →'\);\s*link\.href = suggestHash\(room\.id\);/);
  assert.match(dialog, /link\.addEventListener\('click', \(\) => d\.close\(\)\);/);
  for (const gone of [/\/sizing/, /sizingRows/, /suggestBox/, /Cancel suggestion/, /✓/]) assert.doesNotMatch(dialog, gone);
});

test("the page's Use this opens Simulate on step 3 with the search's walls, weather and crops and the setup", () => {
  assert.match(dialog, /if \(hooks\.suggestion\) \{[^\n]*\n\s*applySuggestion\(state, hooks\.suggestion\.input, hooks\.suggestion\.candidate\);\s*step = 3;\s*\}/);
});

// ---- critique 2026-10-28, the smaller Simulate items ----

test('step 3: the How long and Start from rows are 44 px tall', () => {
  assert.match(css, /\.sim-choice \{[^}]*min-height: 44px;/);
  assert.match(css, /\.sim-choice input\[type="radio"\] \{[^}]*width: 20px; height: 20px;/);
});

test('the step marks: the current one carries aria-current and an accent underline, not weight alone', () => {
  assert.match(dialog, /if \(i \+ 1 === step\) li\.setAttribute\('aria-current', 'step'\);/);
  assert.match(css, /\.sim-steps \[aria-current="step"\] \{[^}]*text-decoration: underline 2px var\(--accent\);/);
});

test("step 1: the wall heat transfer and the sun on the roof have hints with typical values", () => {
  assert.match(dialog, /function field\(name, label, input, hint\) \{/);
  assert.match(dialog, /field\(`physics\.\$\{f\.key\}`, fieldLabel\(f\), numberInput\(state\.physics\[f\.key\], \(v\) => \{\s*state\.physics\[f\.key\] = v;[^}]*\}, f\.whole\), f\.hint\)/);
});

test('step 2: the crop rows share one grid, so Blocks sits over its input', () => {
  assert.match(css, /\.sim-crops \{ display: grid; grid-template-columns: minmax\(0, 1fr\) 92px auto auto;/);
  assert.match(css, /\.sim-crop-row \{ grid-column: 1 \/ -1; display: grid; grid-template-columns: subgrid;/);
});

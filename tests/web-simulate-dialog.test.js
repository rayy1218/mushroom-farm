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
  assert.match(css, /\.sim-dialog \{[^}]*max-height: calc\(100dvh - max\(16px, 6vh\) - 16px\);/);
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
  assert.match(dialog, /box\.append\(radios, starts, el\('h3', 'sim-sub', 'Your choices'\), list, control\.node, suggestBox\(refresh\)\);/);
  assert.match(dialog, /const head = el\('summary', '', 'Change for this run'\);/);
  assert.match(dialog, /field\(`control\.\$\{f\.key\}`, f\.label, numberInput\(controlText\(state, f\.key\)/);
  assert.match(dialog, /box\.dataset\.field = `control\.\$\{f\.key\}`;/);
  assert.match(dialog, /const fixed = fixedControlLine\(state\);/);
  assert.match(dialog, /fold\.open = Object\.keys\(runControl\(state\)\.own\)\.length > 0;/);
  assert.match(dialog, /roomControl: control, again: hooks\.from \?\? null/);
});

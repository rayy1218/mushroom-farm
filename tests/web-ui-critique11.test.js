// Critique 2026-10-29c, the room page and small items: what the Now tab says about bands changed by hand, the phone's room
// head and drawing, and the small texts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL(`../web/${f}`, import.meta.url), 'utf8');

test('Now: the Control card says when bands were changed by hand, with Setup and the way back (the By-Hand Rule)', () => {
  const control = src('control.js');
  assert.match(control, /const nowByHand = el\('div', 'mode-byhand'\);/);
  assert.match(control, /nowByHand\.append\(nowWords, nowBack\);/);
  assert.match(control, /el\('span', '', 'Bands changed by hand on '\)/);
  assert.match(control, /setupLink\.href = setupHref;/);
  assert.match(control, /nowByHand\.hidden = Object\.keys\(diffs\)\.length === 0;/, 'shown while any band differs from the stage (byHandValues)');
  assert.match(control, /nowBack\.addEventListener\('click', \(\) => backToStage\(nowBack, nowBackErr\)\);/, 'the same Back to stage values as Setup\'s');
  assert.match(src('room-detail.js'), /setupHref: roomHash\(id, 'setup'\),/);
  const css = src('styles.css');
  assert.match(css, /\.mode-byhand \{[^}]*color: var\(--accent-text\)/);
});

// Critique 2026-10-29c: on a phone the room head took about 300 px before the first reading (back link, name, size line, the
// room switch on its own row, the tabs).
test('a phone\'s room head: the room switch beside "← Overview" on one row; no size line on the Now tab', () => {
  const css = src('styles.css');
  const block = css.slice(css.indexOf('/* critique 2026-10-29c: UI */'));
  assert.match(block, /@media \(max-width: 600px\) \{[^]*?\.room-head \{ display: grid; grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.match(block, /\.room-head \.page-titles \{ display: contents; \}/);
  assert.match(block, /\.room-head \.room-switch \{ grid-row: 1; grid-column: 2;/);
  assert.match(block, /\.room-head\[data-tab="now"\] \.page-sub \{ display: none; \}/);
  const detail = src('room-detail.js');
  assert.match(detail, /roomHead\.dataset\.tab = tab;/, 'the head knows the tab');
  assert.match(detail, /const roomHead = q\('\.room-head'\);/);
});

// Critique 2026-10-29c: at about 350 × 150 px with its labels hidden the drawing said nothing the Machines list does not.
test('a phone under 480 px: the room drawing folds under "Show the room drawing", closed; open on wider screens', () => {
  const card = src('room-card.js');
  assert.match(card, /const fold = el\('details', 'rc-fold'\);/);
  assert.match(card, /matchMedia\('\(max-width: 479px\)'\)/);
  assert.match(card, /fold\.open = !small\?\.matches;/);
  assert.match(card, /put\(foldSummary, fold\.open \? 'Hide the room drawing' : 'Show the room drawing'\)/);
  assert.match(card, /hosts\.picture\.replaceChildren\(cardHead\('Room', note\), fold, blocks, fresh\);/);
  const css = src('styles.css');
  assert.match(css, /\.rc-fold-sum \{ display: none; \}/);
  assert.match(css, /@media \(max-width: 479px\) \{[^]*?\.rc-fold-sum \{ display: flex;/);
});

// Critique 2026-10-29c: the Crop tab's Automatic change box was in ink, every other box in the accent; on a phone the tab sat
// 14 px further in than the room head and the other tabs (the padding of the card it was before it became a plain wrapper).
test('Crop tab: Automatic change in the accent like every box; on a phone its edge lines up with the other tabs', () => {
  const css = src('styles.css');
  assert.match(css, /\.cp-auto input \{ width: 18px; height: 18px; margin: 0; accent-color: var\(--accent\); \}/);
  assert.doesNotMatch(css, /accent-color: var\(--ink\)/);
  assert.doesNotMatch(css, /\.crop-card\.card \{ padding: 14px; \}/);
  assert.match(css, /\.crop-card\.card \{ background: none; border: 0; padding: 0; box-shadow: none; \}/);
});

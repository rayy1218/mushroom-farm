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

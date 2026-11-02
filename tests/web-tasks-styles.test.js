// The tasks' styles (spec 2026-10-30-tasks-design.md 7; DESIGN.md: the app's tokens only, 44 px targets on a phone).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const block = css.slice(css.indexOf('/* ---- Tasks (iteration 19'));
const phone = block.slice(block.indexOf('@media (max-width: 600px) {'));

test('the tasks block exists and uses only the theme tokens (dark and light both follow)', () => {
  assert.ok(block.length > 0 && css.indexOf('/* ---- Tasks (iteration 19') > 0);
  assert.doesNotMatch(block, /#[0-9a-f]{3,8}\b/i, 'no colour outside the tokens');
  assert.doesNotMatch(block, /(?<![\w-])(black|white)(?![\w-])|rgba?\(|hsla?\(/i, 'no colour outside the tokens');
});

test('the tab count, the top bar count (shown on a phone too), the grids', () => {
  for (const rule of ['.room-tabs .tab-dot.tab-count {', '.room-tabs .tab-dot.tab-count[data-level="warning"] {', '.top-link .top-count {',
    '.tk-grid {', '.td-rooms {', '.tk-row {', '.tk-due[data-tone="amber"] {', '.tk-settings { display: contents; }', '.sg-use { display: grid; gap: 8px; }']) {
    assert.ok(block.includes(rule), rule);
  }
  // amber with dark text in both themes (the dark theme's page, the light theme's ink)
  assert.ok(block.includes('.room-tabs .tab-dot.tab-count[data-level="warning"] { background: var(--warning); color: var(--page); }'));
  assert.ok(block.includes(':root[data-theme="light"] .room-tabs .tab-dot.tab-count[data-level="warning"] { color: var(--ink); }'));
  // '.top-link span' hides the links' words on a phone: the count is a span too, and must stay
  assert.ok(block.indexOf('.top-link .top-count {') > 0 && !/\.top-link \.top-count \{[^}]*display: none/.test(block));
  assert.ok(css.includes("The room page's six tabs"));
});

test('long words in a task wrap, and a note keeps its line breaks', () => {
  assert.ok(block.includes('.tk-text { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }'));
  assert.match(block, /\.tk-note \{[^}]*white-space: pre-line;/);
});

test('a phone: the buttons and the fold at 44 px, a row stacks its buttons under its text, the top bar links narrower, six tabs fit', () => {
  for (const rule of ['.tk-row { flex-direction: column; align-items: stretch; gap: 8px; }', '.tk-actions button { flex: 1 1 0; min-height: 44px; }',
    '.tk-fold > summary { min-height: 44px; padding: 12px 0; }', '.tk-as select { flex: 1 1 auto; min-height: 44px; }',
    '.top-link { min-width: 44px; padding: 4px 6px; justify-content: center; gap: 4px; }', '.room-tabs a { padding: 10px 5px; gap: 4px; }',
    '.sg-planned a { display: inline-block; min-height: 44px; line-height: 44px; white-space: nowrap; }']) {
    assert.ok(phone.includes(rule), rule);
  }
});

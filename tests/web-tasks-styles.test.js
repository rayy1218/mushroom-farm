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

test('a phone: Done and Skip beside the text at 44 px (a long-term row stacks them under it), the fold at 44 px, the top bar links narrower, six tabs fit', () => {
  for (const rule of ['.tk-row { gap: 8px; }', '.tk-actions { gap: 6px; }', '.tk-actions button { min-height: 44px; padding: 7px 10px; }',
    '.tk-row[data-kind="longterm"] { flex-direction: column; align-items: stretch; }', '.tk-row[data-kind="longterm"] .tk-actions { gap: 8px; }',
    '.tk-row[data-kind="longterm"] .tk-actions button { flex: 1 1 0; padding: 7px 14px; }', '.tk-fold > summary { min-height: 44px; padding: 12px 0; }', '.tk-as select { flex: 1 1 auto; min-height: 44px; }',
    '.top-link { min-width: 44px; padding: 4px 6px; justify-content: center; gap: 4px; }', '.room-tabs a { padding: 10px 5px; gap: 4px; }',
    '.sg-planned a { display: inline-block; min-height: 44px; line-height: 44px; white-space: nowrap; }']) {
    assert.ok(phone.includes(rule), rule);
  }
});

test('the room tabs fade only at an edge that hides a tab (data-more, as the Setup and History links), never always', () => {
  const tabs = css.slice(css.indexOf("/* The room page's six tabs"), css.indexOf('.sensors {'));
  assert.doesNotMatch(tabs.slice(0, tabs.indexOf('.room-tabs::-webkit-scrollbar')), /mask-image/, 'no always-on fade');
  for (const edge of ['end', 'start', 'both']) assert.ok(tabs.includes(`.room-tabs[data-more="${edge}"] { mask-image:`), edge);
  const room = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
  assert.ok(room.includes("container.querySelectorAll('.setup-nav, .room-tabs')"), 'the tab row gets its data-more too');
});

test('the Tasks tab from 1,100 px: Today, Upkeep and Long-term on the left, the Log alone on the right', () => {
  const desk = block.slice(block.indexOf('.tk-grid {'), block.indexOf('.tk-part .sim-card-head'));
  assert.ok(desk.includes('.tk-grid { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); grid-template-rows: auto auto auto 1fr; }'));
  assert.ok(desk.includes('.tk-grid > :not(.tk-log-card) { grid-column: 1; }'));
  assert.ok(desk.includes('.tk-grid > .tk-log-card { grid-column: 2; grid-row: 1 / -1; }'));
  const card = readFileSync(new URL('../web/tasks-card.js', import.meta.url), 'utf8');
  assert.ok(card.includes("const logCard = el('section', 'card tk-part tk-log-card');"));
});

test('review minor: the dialog wraps its primary button on top; the Today room link is 44 px by its own margin; Live keeps its dot', () => {
  assert.ok(block.includes('.tk-dialog .actions { flex-wrap: wrap-reverse; }'));
  assert.ok(phone.includes('.td-long-list a { display: inline-flex; align-items: center; min-height: 44px; }'));
  assert.ok(phone.includes('.td-room h2 a { display: inline-block; padding-block: 11px; margin-block: -11px; }'), 'an inline block: a long name wraps inside it');
  assert.ok(!phone.includes('.td-room h2 a, .td-long-list a'), 'the room name is not a flex box on a phone');
  assert.ok(!phone.includes('.td-room h2 { margin-top'));
  assert.ok(phone.includes('.topbar:has(> .top-alarm:not([hidden])) .live-mark [data-live-text] {'), 'the word hides, the dot stays');
  assert.ok(!phone.includes('.live-dot { display: none; }'));
  assert.equal(block.split('.tk-add > button { margin-top').length, 2, 'one rule, not repeated on a phone');
});

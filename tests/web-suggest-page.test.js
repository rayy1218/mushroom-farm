// The Suggest machines page and its ways in (owner 2026-10-28): the Simulations card's button beside Simulate, step 3's link,
// and the result page's pointer; on a phone its rows stack, with no sideways scroll.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('suggest-page.js');
const card = src('sim-card.js');
const css = src('styles.css');

test('the router mounts the page at #/rooms/:id/suggest', () => {
  const app = src('app.js');
  assert.match(app, /import \* as suggest from '\.\/suggest-page\.js';/);
  assert.match(app, /route\.name === 'suggest' \? suggest\.mount\(view, \{ id: route\.id \}\)/);
});

test('the page asks the walls and weather, the crops, the target and the longest cool-down, prefilled like Simulate', () => {
  assert.match(page, /for \(const f of SIZING_FIELDS\)/);
  assert.match(page, /state = initialState\(\{ room, lastRun: Array\.isArray\(runs\) \? runs\[0\] \?\? null : null, cropData: crop \}\);/);
  assert.match(page, /field\('target', 'Target \(%\)'/);
  assert.match(page, /field\('coolDownMaxH', 'Longest cool-down \(h\)'/);
  assert.match(page, /const go = button\('Suggest', 'primary', 'submit'\);/);
  assert.match(page, /const errors = checkSuggest\(state, targetText, coolText\);/);
  assert.match(page, /els\.title\.textContent = `Suggest machines for \$\{room\.name\}`;/);
});

test('the search: POST, its progress as tried of total, Cancel (DELETE), and the prices from the settings', () => {
  assert.match(page, /request\('POST', `\/api\/rooms\/\$\{id\}\/sizing`, asked\)/);
  assert.match(page, /request\('GET', `\/api\/sizing\/\$\{mine\.id\}`\)/);
  assert.match(page, /request\('DELETE', `\/api\/sizing\/\$\{mine\.id\}`\)/);
  assert.match(page, /el\('p', 'sim-progress', sizingProgress\(job\)\)/);
  assert.match(page, /request\('GET', '\/api\/settings'\)/);
  assert.match(page, /prices = pricesOf\(settings\);/);
});

test('the result: ranked by money, five columns, the verdict in words with its tone, details per row, the estimates and notes', () => {
  assert.match(page, /const rows = suggestRows\(result, prices\);/);
  assert.match(page, /const heads = COLUMNS\.map\(\(c, i\) => \(i === 2 \? moneyHead\(prices\) : c\)\);/);
  assert.match(page, /verdict\.dataset\.tone = r\.verdict\.tone;/);
  assert.match(page, /const more = el\('details', 'sg-more'\);/);
  assert.match(page, /estimateLines\(result\.estimate\)/);
  assert.match(page, /for \(const n of result\.notes \?\? \[\]\)/);
  assert.doesNotMatch(page, /✓/);
  assert.doesNotMatch(page, /us-table-wrap/, 'no sideways scroller');
});

test('Use this opens Simulate with the setup, not the room\'s machines (machines are physical)', () => {
  assert.match(page, /openSimulateDialog\(room, \{ suggestion: \{ input: body, candidate: result\.best\[r\.index\] \} \}\)/);
  assert.doesNotMatch(page, /Set as the room/);
});

test('the search goes on when the page is left, and shows again on coming back', () => {
  assert.match(page, /writeStored\(id, \{ id: created\.id, body: asked, target: targetText, coolDown: coolText \}\);/);
  assert.match(page, /const stored = readStored\(id\);/);
  const unmount = page.slice(page.indexOf('return function unmount()'));
  assert.doesNotMatch(unmount, /DELETE/);
});

test('the Simulations card: Suggest machines beside Simulate, a link in the secondary style', () => {
  assert.match(card, /const suggest = el\('a', 'button', 'Suggest machines'\);\s*suggest\.href = suggestHash\(roomId\);/);
  assert.match(card, /buttons\.append\(suggest, simulate\);/);
});

test('the result page points to the page for other machines', () => {
  const result = src('simulation-page.js');
  assert.match(result, /suggestHash\(id\)/);
  assert.doesNotMatch(result, /the last step of Simulate/);
});

test('on a phone the rows stack into blocks with their labels, no sideways scroll, 44 px targets', () => {
  assert.match(css, /\.sg-row \{[^}]*grid-template-columns: minmax\(0, 1fr\) 112px 120px 112px auto;/);
  assert.match(css, /@media \(max-width: 760px\) \{\s*\.sg-head \{ display: none; \}/);
  assert.match(css, /\.sg-row \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); \}/);
  assert.match(css, /\.sg-label \{ position: static;/);
  assert.match(css, /\.sg-more > summary \{[^}]*min-height: 44px;/);
});

// The Sales page (spec 2026-11-05-sales-design.md 6). Source checks, as the Harvest page's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('sales-page.js');
const css = src('styles.css');
const html = src('index.html');

test('the head: title, line, period, Record a sale, Buyers, Export CSV', () => {
  assert.ok(page.includes('<h1 class="page-title" tabindex="-1">Sales</h1>'));
  assert.ok(page.includes('What was sold, to whom, and what is owed.'));
  assert.ok(page.includes('data-record>Record a sale</button>'));
  assert.ok(page.includes('data-buyers>Buyers</button>'));
  assert.ok(page.includes('<a class="button" data-csv download>Export CSV</a>'));
  assert.ok(page.includes('els.csv.href = `/api/sales.csv?days=${period}`;'));
  assert.ok(page.includes("history.replaceState(null, '', canonicalHash({ name: 'sales', days: n }));"));
});

test('it reads GET /api/sales and again on sales, harvest, a room change and the stream back', () => {
  assert.ok(page.includes("request('GET', `/api/sales?days=${period}`)"));
  assert.ok(page.includes("live.on('sales', () => reload.call()),"));
  assert.ok(page.includes("live.on('harvest', () => reload.call()),"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'room') reload.call(); }),"));
  assert.ok(page.includes('live.onStatus('));
});

test('cards: totals, owed (only when owed), sales, by crop, by buyer; the empty words', () => {
  for (const s of ['data-tiles', 'data-owed', 'data-list', 'data-crops', 'data-buyers-table', 'data-empty']) assert.ok(page.includes(s), s);
  assert.ok(page.includes('els.owed.hidden = sales.owed.count === 0;'));
  assert.ok(page.includes('emptyText(period)'));
  assert.ok(page.includes('No buyers yet. Record a sale to add the first.'));
});

test('styles: one Sales block at the end, .sl- classes, tokens only', () => {
  const start = css.indexOf('/* ---- Sales ---- */');
  assert.ok(start > 0);
  const block = css.slice(start);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test(block), 'no raw colours: tokens only');
  assert.ok(/\.sl-/.test(block));
});

test('the top bar is not touched (contract 3)', () => {
  assert.ok(!html.includes('business'));
});

const block = css.slice(css.indexOf('/* ---- Sales ---- */'));

test('styles: the end marker closes the file; no colour literals; every token defined; every selector .sl-', () => {
  assert.ok(block.trimEnd().endsWith('/* ---- end Sales ---- */'), 'the Sales block is last');
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(block), 'no hex, rgb() or hsl()');
  for (const [, name] of block.matchAll(/var\((--[\w-]+)/g)) assert.ok(new RegExp(`${name}\\s*:`).test(css.slice(0, css.indexOf('/* ---- Sales ---- */'))), name);
  const bare = block.replace(/\/\*.*?\*\//gs, '').replace(/@media[^{]*\{/g, '');
  for (const [, sel] of bare.matchAll(/(?:^|\})\s*([^{}]+)\{/g)) {
    for (const one of sel.split(',')) assert.ok(one.trim().startsWith('.sl-'), one.trim());
  }
});

test('buttons: names for a screen reader, the Owed toggle, focus keys, quiet Edit', () => {
  assert.ok(page.includes('aria-label\', `Edit the sale of ${r.day} to ${r.buyer}`'));
  assert.ok(page.includes('`Mark the sale of ${r.day} to ${r.buyer} paid`'));
  assert.ok(page.includes("toggle.setAttribute('aria-expanded', String(on));"));
  for (const k of ['`edit-${d.id}`', '`paid-${d.id}`', '`owed-${b.buyerId}`']) assert.ok(page.includes(k), k);
  assert.ok(page.includes("'tk-quiet sl-edit'"));
  assert.ok(page.includes('const changed = () => reload.call();'));
});

const dialogs = src('sales-dialogs.js');

test('Record / Edit sale: its own dialog, lines added and removed, the buyer picker with New buyer, the foot, Delete', () => {
  assert.ok(dialogs.includes("'Record a sale'") && dialogs.includes("'Edit sale'"));
  assert.ok(dialogs.includes("'Add a crop'"));
  assert.ok(dialogs.includes("'New buyer…'"));
  assert.ok(dialogs.includes("'Their invoice or receipt number'"));
  assert.ok(dialogs.includes("'Delete this sale'"));
  assert.ok(dialogs.includes('footText('));
  assert.ok(dialogs.includes('prefill('));
  assert.ok(dialogs.includes('unlikely('));
  assert.ok(dialogs.includes("request('POST', '/api/sales'"));
  assert.ok(dialogs.includes('request(\'PUT\', `/api/sales/deliveries/${'));
  assert.ok(dialogs.includes("request('GET', '/api/settings')"), 'the expected prices');
  assert.ok(dialogs.includes("mark.unpaid ? 'Mark paid' : 'Mark unpaid'"), "an Edit's paid line");
});

test('Mark paid, Delete and Buyers use openForm', () => {
  assert.ok(dialogs.includes("import { openForm, errorText } from './task-dialogs.js';"));
  assert.ok(dialogs.includes("title: 'Mark paid'"));
  assert.ok(dialogs.includes("label: 'Paid on'"));
  assert.ok(dialogs.includes("label: 'Delete sale'"));
  assert.ok(dialogs.includes("'Add a buyer'"));
  assert.ok(dialogs.includes("'Archive'") && dialogs.includes("'Restore'") && dialogs.includes("'Delete buyer'"));
});

test('the dialogs give the cursor back to the button that opened them (or the page title) when they close', () => {
  assert.ok(dialogs.includes('opener = document.activeElement'));
  assert.ok(dialogs.includes("document.querySelector('dialog[open]')"));
  assert.ok(dialogs.includes('.closed.then(() => giveBack(opener))'));
  assert.ok(dialogs.includes("document.querySelector('h1.page-title')"));
});

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

test('review: a late answer goes to the page, not a later dialog; the buttons held while sending; boxes clear as typed', () => {
  assert.ok(dialogs.includes('let saleSeq = 0;'));
  assert.ok(dialogs.includes('const me = ++saleSeq;'));
  assert.ok(dialogs.includes('const gone = () => me !== saleSeq || !d.open;'));
  assert.ok(dialogs.includes('if (gone()) { lost('), 'every await checks the opening is still there');
  assert.ok(dialogs.includes('for (const b of held) b.disabled = on;'), 'Cancel, Delete this sale, the paid toggle and the primary held');
  assert.ok(dialogs.includes("input.addEventListener('input', () => clearBox({ input, error }));"));
  assert.ok(dialogs.includes('primary.textContent = label; // plain while sending'), 'a failed send does not still say "anyway"');
  assert.ok(dialogs.includes("import { lineTotal, footText, prefill, unlikely, saleBody, deleteTitle, deleteLead, priceText, paidMark, num, deliveryRow } from './sales-math.js';"));
  assert.ok(!dialogs.includes('function priceNumber'), 'the one number reader');
  assert.ok(dialogs.includes('date.input.max = farmDate(now);'), 'today as at the submit');
});

test('review: a new buyer in A–Z, Delete buyer confirms, Restore and Archive held, "expected" described, lines named', () => {
  assert.ok(dialogs.includes('localeCompare(made.name'));
  assert.ok(dialogs.includes('title: `Delete ${b.name}?`'));
  assert.ok(dialogs.includes("'They have no sales. Their phone and usual prices go too.'"));
  assert.ok(dialogs.includes('aside.disabled = true;') && dialogs.includes('edit.disabled = true;'));
  assert.ok(dialogs.includes('`${price.input.id}-expected`'));
  assert.ok(dialogs.includes("row.setAttribute('role', 'group');"));
  assert.ok(dialogs.includes('`Line ${i + 1}, ${cropShortName(l.crop.input.value)}`'));
});

test('audit: the desk list as columns (a subgrid a delivery), a line part kept whole, the reference its own phone row', () => {
  assert.ok(page.includes("el('span', 'sl-line-part', part)"), 'a line part each');
  assert.ok(page.includes("linesNode('sl-lines', d.lines)") && page.includes('lineParts(lines).forEach'));
  assert.ok(/\.sl-line-part \{[^}]*white-space: nowrap/.test(block));
  assert.ok(/@media \(min-width: 900px\) \{[^@]*\.sl-list \{[^}]*grid-template-columns: auto minmax\(8rem, 14rem\) minmax\(14rem, 1fr\) auto auto minmax\(0, 8rem\) auto/.test(block), 'the tracks on the list');
  assert.ok(/\.sl-item \{[^}]*grid-column: 1 \/ -1;[^}]*grid-template-columns: subgrid/.test(block), 'a delivery a subgrid');
  assert.ok(/\.sl-list \{[^}]*grid-template-columns: minmax\(6\.5rem, max-content\)/.test(block), 'a phone row: the first track fixed');
  assert.ok(/\.sl-item:focus-visible \{ outline: 2px solid var\(--accent\); outline-offset: 2px; \}/.test(block));
});

test('audit: the phone tables leave out Sold (by crop) and kg (by buyer), said under the name', () => {
  assert.ok(page.includes("el('span', 'sl-sub', r.sub)"));
  assert.ok(/\.sl-table td\.num, \.sl-table th\.num \{[^}]*padding-left: 5px/.test(block) || /padding-left: 5px; padding-right: 5px/.test(block), '10 px between figures');
  assert.ok(block.includes('.sl-crop-table th:nth-child(2)') && block.includes('.sl-buyer-table th:nth-child(2)'));
});

test('audit: no buyers: the empty card has its own Record a sale; Owed as columns', () => {
  assert.ok(page.includes('data-empty-record'));
  assert.ok(/\.sl-owed-list \{[^}]*max-width: 52rem/.test(block));
  assert.ok(/\.sl-owed-item \+ \.sl-owed-item \{[^}]*border-top: 1px solid var\(--border\)/.test(block), 'a hairline between buyers');
});

test('audit: Record opens on "Pick a buyer" (prices filled once one is chosen); Edit keeps the sale\'s buyer', () => {
  assert.ok(dialogs.includes("'Pick a buyer'"));
  assert.ok(dialogs.includes('pick.disabled = true;'));
  assert.ok(dialogs.includes("if (buyer.input.value === '') { l.price.input.value = ''; showExpected(l, false); return; }"), 'no price before a buyer');
});

test('audit: the amber question a line-wide note, still described by the box; the title unboxed; two columns from 900 px', () => {
  assert.ok(dialogs.includes("el('p', 'sl-line-check')"));
  assert.ok(dialogs.includes("check.setAttribute('aria-live', 'polite');"));
  assert.ok(/\.sl-line-check \{[^}]*grid-column: 1 \/ -1/.test(block));
  assert.ok(block.includes('.sl-dialog-title:focus { outline: none; }'));
  assert.ok(/\.sl-dialog \.sl-form \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(block));
});

test('audit: Buyers: Restore and Archive come back to the buyer with a status line; Cancel goes back to the list', () => {
  assert.ok(dialogs.includes('`buyer-${b.id}`'));
  assert.ok(dialogs.includes('`${b.name} restored.`') && dialogs.includes('`${b.name} archived.`'));
  assert.ok(dialogs.includes("statusLine.setAttribute('role', 'status');"));
  assert.ok(dialogs.includes('backToList'));
  assert.ok(dialogs.includes('lead: [`${deliveryRow(delivery).day}${DOT}${delivery.buyer}${DOT}${rmText(delivery.total)}`]'), 'Mark paid names the day');
});

test('the page repaints when the phone query changes (the row limit in the painted key); the listener goes on unmount', () => {
  assert.ok(page.includes('const media = window.matchMedia(PHONE);'));
  assert.ok(page.includes("media.addEventListener('change', onMedia);"));
  assert.ok(page.includes("media.removeEventListener('change', onMedia);"));
  assert.ok(page.includes('const key = JSON.stringify([sales, showAll, limit]);'));
});

test('finish review: "RM per kg" kept whole in a head; "expected" inside the RM box; a phone line gives Crop its own row', () => {
  assert.ok(page.includes("[c.slice(0, -9), 'RM per kg']") && page.includes("el('span', 'sl-nowrap', unit)"));
  assert.ok(dialogs.includes("el('span', 'tk-suffix sl-expected', 'expected')") && dialogs.includes('price.input.after(expected);'));
  const sales = css.slice(css.indexOf('/* ---- Sales ---- */'));
  assert.ok(sales.includes('.sl-line > .field:nth-child(1) { grid-column: 1 / -1; grid-row: 1; }'));
  assert.ok(sales.includes('.sl-line > .sl-line-check { grid-row: 3; }'));
  assert.ok(sales.includes('.sl-new-buyer { column-gap: 16px; }'));
  assert.ok(sales.includes('.sl-item > .sl-day { padding-right: 10px; }'));
  assert.ok(!sales.includes('.sl-expected { grid-row'));
});

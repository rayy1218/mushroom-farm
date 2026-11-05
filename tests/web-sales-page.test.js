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

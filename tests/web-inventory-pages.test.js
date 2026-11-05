// The Inventory pages and dialogs (spec 2026-11-05-inventory-design.md 4 and 5). Source checks; the look is checked in the
// browser (the UI/UX audit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const path = (name) => new URL(`../web/${name}`, import.meta.url);
const src = (name) => readFileSync(path(name), 'utf8');

test('the dialogs: on the tasks openForm; the routes they send to; more than in stock asks once', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes("from './task-dialogs.js'"));
  for (const route of ["'/api/inventory/items'", "'/api/inventory/purchases'", "'/api/inventory/uses'", '`/api/inventory/moves/${move.id}`', '`/api/inventory/lots/${lot.moveId}/throw-out`']) {
    assert.ok(d.includes(route), route);
  }
  assert.ok(d.includes('overStock('));
  assert.ok(d.includes("`${label} anyway`"));
  assert.ok(d.includes("closeLabel: 'Keep it'"));
  assert.ok(d.includes("label: 'Delete this record'"));
});

test('the list page: mounted by the router; reads the list on the inventory events; its buttons and links', () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventory from './inventory-page.js';"));
  assert.ok(app.includes(": route.name === 'inventory' ? inventory.mount(view, {})"));
  const page = src('inventory-page.js');
  assert.ok(page.includes("live.on('inventory', () => reload.call())"));
  assert.ok(page.includes("request('GET', archived ? '/api/inventory?archived=1' : '/api/inventory')"));
  for (const words of ['Record use', 'Purchase', 'Count stock', 'Add item', 'myGAP 4-5 sheet', 'No stock items yet.']) assert.ok(page.includes(words), words);
});

test('the styles: one Inventory block at the end, .iv- classes, tokens only', () => {
  const css = src('styles.css');
  const start = css.indexOf('/* ---- Inventory');
  const end = css.indexOf('/* ---- end Inventory ---- */');
  assert.ok(start > 0 && end > start);
  const block = css.slice(start, end);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'no fixed colours: tokens only');
  for (const sel of block.match(/^[^@\s/}][^{]*\{/gm) ?? []) assert.match(sel, /\.iv-/, sel);
});

test('the list page review fixes: the farm day in the paint key, all-archived line, alive to Record use, buttons off until loaded, fixed table from 900 px', () => {
  const page = src('inventory-page.js');
  assert.ok(page.includes('farmDate(Date.now())'));
  assert.ok(page.includes('Every item is archived.'));
  assert.ok(page.includes('openUseDialog({ items: data.items, alive,'));
  assert.ok(page.includes('data-use disabled') && page.includes('data-purchase disabled'));
  assert.ok(page.includes('loadedArchived'));
  const css = src('styles.css');
  assert.match(css, /@media \(min-width: 900px\)[^}]*\n\s+\.iv-table \{ table-layout: fixed; \}/);
});

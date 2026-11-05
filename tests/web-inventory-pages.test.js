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

test("the item page: mounted; its tiles, lots and history; batch moves not edited; the item's own actions", () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventoryItem from './inventory-item.js';"));
  assert.ok(app.includes(": route.name === 'inventoryItem' ? inventoryItem.mount(view, { id: route.id })"));
  const page = src('inventory-item.js');
  assert.ok(page.includes('request(\'GET\', `/api/inventory/items/${id}`)'));
  for (const words of ['In stock', 'Reorder at', 'Last counted', 'Lots', 'History', 'Change it in Batches', 'Throw out', 'Bring back', 'That item no longer exists.']) {
    assert.ok(page.includes(words), words);
  }
  assert.ok(page.includes('HISTORY_SHOWN = 20'));
});

test('Count stock: mounted; one form of every item; sends the typed ones; a refresh keeps the typed boxes', () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventoryCount from './inventory-count.js';"));
  assert.ok(app.includes(": route.name === 'inventoryCount' ? inventoryCount.mount(view, {})"));
  const page = src('inventory-count.js');
  assert.ok(page.includes("send('POST', '/api/inventory/counts'") || page.includes("request('POST', '/api/inventory/counts'"));
  assert.ok(page.includes('countBody('));
  assert.ok(page.includes('By the records'));
  assert.ok(page.includes('location.hash = INVENTORY_HASH'));
});

test('the 4-5 sheet: mounted; the period in its address; printing as the 4-6 sheet does', () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventorySheet from './inventory-sheet.js';"));
  assert.ok(app.includes(": route.name === 'inventorySheet' ? inventorySheet.mount(view, { days: route.days })"));
  const page = src('inventory-sheet.js');
  assert.ok(page.includes("document.body.classList.add('printing-sheet')"));
  assert.ok(page.includes("document.body.classList.remove('printing-sheet')"));
  assert.ok(page.includes('request(\'GET\', `/api/inventory/sheet?days=${period}`)'));
  assert.ok(page.includes("history.replaceState(null, '', inventorySheetHash(n))"));
  assert.ok(page.includes('window.print()'));
});

test('the Settings card: one switch, saved at once; says so while Telegram is not set up', () => {
  const settings = src('settings-page.js');
  assert.ok(settings.includes("import { mountInventorySettings } from './inventory-settings.js';"));
  assert.ok(settings.includes('<div data-inventory-settings></div>'));
  assert.ok(settings.includes("mountInventorySettings(q('[data-inventory-settings]'))"));
  const card = src('inventory-settings.js');
  assert.ok(card.includes('Send low-stock and use-by messages to Telegram'));
  assert.ok(card.includes("request('PUT', '/api/settings', { inventoryTelegram:"));
  assert.ok(card.includes('Nothing is sent until Telegram is set up above.'));
});

test('review fixes: the item page paint key has the farm day; the row click ignores selections and modifiers', () => {
  const item = src('inventory-item.js');
  assert.ok(item.includes("import { farmDate } from './tasks-math.js';"));
  assert.ok(item.includes('JSON.stringify([data, showAll, farmDate(Date.now())])'));
  assert.ok(item.includes("document.title = 'Inventory · Mushroom farm';\n        return;") || /els\.banner\.hidden = true;\s*document\.title = 'Inventory/.test(item));
  assert.ok(item.includes('els.archive.disabled = true'));
  assert.ok(item.includes('tabindex="-1" data-history-title') || item.includes('id="iv-history-title" tabindex="-1"'));
  assert.ok(item.includes("dataset.tone = 'warn'") && item.includes("dataset.tone = 'amber'"));
  const page = src('inventory-page.js');
  assert.ok(page.includes('e.button !== 0 || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || window.getSelection()?.toString()'));
  const css = src('styles.css');
  assert.ok(css.includes('@media (hover: hover) {\n  .iv-row:hover'));
  assert.ok(css.includes('.iv-move-edit { min-width: 44px'));
});

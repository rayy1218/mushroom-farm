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
  assert.ok(item.includes("dataset.tone = 'amber'"));
  // audit #4: the figure is toned for Low only; the use-by line names its part in its own tone
  assert.ok(!item.includes("dataset.tone = 'warn'"));
  assert.ok(item.includes('useByLine(it)') && item.includes("'us-basis iv-useby-line'"));
  const page = src('inventory-page.js');
  assert.ok(page.includes('e.button !== 0 || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || window.getSelection()?.toString()'));
  const css = src('styles.css');
  assert.ok(css.includes('@media (hover: hover) {\n  .iv-row:hover'));
  assert.ok(css.includes('.iv-move-edit { min-width: 44px'));
});

test('review fixes: Count stock names line, worker reload, gone rows, retry, inputMode; the sheet hides a failed table; the settings box is not disabled', () => {
  const c = src('inventory-count.js');
  assert.ok(c.includes("No names yet: add the workers' names in ") && c.includes("'#/settings'"));
  assert.ok(c.includes("addEventListener('farm:worker', reloadNames)") && c.includes("removeEventListener('farm:worker', reloadNames)"));
  assert.ok(c.includes('reloadNames(); // renamed or removed'));
  assert.ok(c.includes('Archived since you opened this page'));
  assert.ok(c.includes('Loading…'));
  assert.ok(c.includes("WHOLE_UNITS.includes(unit) ? 'numeric' : 'decimal'"));
  assert.ok(!c.includes('if (alive() && rows.size)'), 'a live refresh also retries an empty first load');
  const sheet = src('inventory-sheet.js');
  assert.match(sheet, /catch \(err\) \{[\s\S]*els\.wrap\.hidden = true;/);
  const set = src('inventory-settings.js');
  assert.ok(!set.includes('box.disabled'));
  assert.ok(set.includes('sending'));
});

test('audit #1: Record use and Purchase start on "Pick an item" unless asked for one or kept from the last time; grouped by kind; the stock in the hint', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes("[['', 'Pick an item'], ...list.map((i) => [String(i.id), i.name])]"), 'the options carry the name only');
  assert.ok(!d.includes('in stock)`'), 'no stock cut off inside an option');
  assert.ok(d.includes("hintOf: (v) => stockHint("));
  assert.ok(d.includes("document.createElement('optgroup')"));
  assert.ok(d.includes("startItem(list, itemId, 'use')") && d.includes("startItem(list, itemId, 'purchase')"));
  assert.ok(d.includes("use: 'farm.inventory.useItem', purchase: 'farm.inventory.purchaseItem'"));
  assert.ok(d.includes("if (sent.ok) keepItem('use', body.itemId);") && d.includes("if (sent.ok) keepItem('purchase', body.itemId);"));
  assert.ok(!d.includes('?? list[0]'), 'never the first item by default');
});

test('audit #21: a qty box follows its unit: suffix, keypad and the unit spoken in its label', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes("input.inputMode = unit && WHOLE_UNITS.includes(unit) ? 'numeric' : 'decimal';"));
  assert.ok(d.includes("spoken.className = 'sr-only iv-unit-words';"));
  assert.ok(d.includes('`, in ${UNIT_WORDS[unit] ?? unit}`'));
  for (const call of ["setUnit(form, 'reorderAt', unit);", "setUnit(form, 'qty', item.unit);", "setUnit(form, 'qty', item?.unit ?? null);"]) assert.ok(d.includes(call), call);
});

test('audit #2: after a record the page says what was saved, with Undo for a minute on a new move; Count stock hands its result to the list', () => {
  const line = src('inventory-done.js');
  assert.ok(line.includes("request('DELETE', `/api/inventory/moves/${id}`)"));
  assert.ok(line.includes("say('Undone'"));
  assert.ok(line.includes("export const FLASH_KEY = 'farm.inventory.flash';"));
  for (const page of ['inventory-page.js', 'inventory-item.js']) {
    const p = src(page);
    assert.ok(p.includes('<p class="muted iv-done-line" role="status" data-done hidden></p>'), page);
    assert.ok(p.includes("createDoneLine(q('[data-done]')"), page);
    assert.ok(p.includes('if (result) doneLine.show(result);'), page);
    assert.ok(p.includes('doneLine.destroy();'), page);
  }
  assert.ok(src('inventory-page.js').includes('doneLine.show(takeFlash());'));
  const c = src('inventory-count.js');
  assert.ok(c.includes('keepFlash({') && c.includes("doneText({ kind: 'count'"));
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes('onDone?.({ at: Date.now(), ...done(sent.reply) });'));
  assert.ok(d.includes("made(doneText({ kind: 'use'") && d.includes("made(doneText({ kind: 'purchase'") && d.includes("made(doneText({ kind: 'throwOut'"));
  assert.ok(d.includes("doneText({ kind: 'deleted' })"));
});

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
  for (const words of ['In stock', 'Reorder at', 'Last counted', 'Lots', 'History', 'Batch records change in Batches', 'Throw out', 'Bring back', 'That item no longer exists.']) {
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
  assert.ok(c.includes('No longer on the list since you opened this page'));
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

test('audit #3 and #5: Count stock keeps typed figures until saved, asks before leaving, Save at the foot of a phone', () => {
  const c = src('inventory-count.js');
  assert.ok(c.includes("const KEPT_KEY = 'farm.inventory.count';"));
  assert.ok(c.includes('keptCounts(readKept(), items)'));
  assert.ok(c.includes('Your unsaved counts are back.') && c.includes('Clear them'));
  assert.ok(c.includes('writeKept({});\n      if (alive()) {\n        leaving = true;'), 'cleared on a save, before leaving for the list');
  assert.ok(c.includes("document.addEventListener('click', onClick, true);") && c.includes("document.removeEventListener('click', onClick, true);"));
  assert.ok(c.includes("window.addEventListener('popstate', onPop);") && c.includes("window.removeEventListener('popstate', onPop);"));
  assert.ok(c.includes("history.pushState(null, '', INVENTORY_COUNT_HASH);"));
  assert.ok(c.includes("window.addEventListener('beforeunload', onUnload);") && c.includes("window.removeEventListener('beforeunload', onUnload);"));
  assert.ok(c.includes('window.confirm(leaveText(n))'));
  const css = src('styles.css');
  assert.match(css, /\.iv-count-send \{ position: sticky; bottom: 0;/);
});

test('audit list fixes: empty farm (#9), Count stock button (#10), pill by the name and a capped page (#11), the phone line (#12), attention filters (#13), archived rows (#14)', () => {
  const page = src('inventory-page.js');
  assert.ok(page.includes('<p class="muted" data-loading role="status">Loading…</p>'));
  assert.ok(page.includes('els.use.hidden = nothing;') && page.includes('els.count.hidden = nothing;') && page.includes('els.add.hidden = nothing;'));
  assert.ok(page.includes("if (pill) name.append(' ', pillNode(pill));"));
  assert.ok(!page.includes("'iv-state-col'"), 'no fifth column');
  assert.ok(page.includes("el('span', 'iv-meta', metaLine(item, now))"));
  assert.ok(page.includes("b.setAttribute('aria-pressed', String(filter === p.key));"));
  assert.ok(page.includes('items.filter((i) => needsLook(i, filter))'));
  assert.ok(page.includes("'iv-row iv-row-archived'"));
  assert.ok(page.includes('askedArchived = true;'));
  const css = src('styles.css');
  assert.ok(css.includes('.iv-page { max-width: 1040px; }'));
  assert.ok(css.includes('.iv-tools a.button { min-height: 36px; padding: 7px 14px; background: var(--raised);'));
  assert.ok(css.includes('.iv-table .iv-row-archived :is(th, td, a) { color: var(--muted); }'));
});

test('audit item page fixes: history columns (#15), lots From and years (#16), Batches said once (#17), archived says so (#18), phone tiles (#19)', () => {
  const page = src('inventory-item.js');
  assert.ok(page.includes('<div class="iv-page">'));
  assert.ok(page.includes('<th scope="col">From</th>'));
  assert.ok(page.includes('lotLabel(lot, today)') && page.includes('lotPill(lot, today)') && page.includes('moveLine(m, it, today)'));
  assert.ok(page.includes("'iv-lot-useby iv-lot-none'"));
  assert.ok(page.includes("els.batchNote.hidden = !it.moves.some((m) => m.refKind === 'batch');"));
  assert.ok(!page.includes("'Change it in Batches'"));
  assert.ok(page.includes('els.archivedNote.hidden = !it.archived;'));
  assert.ok(page.includes("els.title.textContent = 'Item not found';"));
  const css = src('styles.css');
  assert.ok(css.includes('.iv-move { display: grid; grid-template-columns: minmax(0, 1fr) 13ch 4.5rem;'));
  assert.ok(css.includes('.iv-tiles > :last-child:nth-child(odd) { grid-column: 1 / -1; }'));
});

test('audit dialog fixes: unit by kind and Delete this item (#22), RM before the figure and stacked dates (#20)', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes('const unit = item?.unit ?? UNIT_BY_KIND.chemical;'));
  assert.ok(d.includes('unitBox.value = UNIT_BY_KIND[kind.value];'));
  assert.ok(d.includes("[{ label: 'Delete this item', action: () => openDeleteItemDialog({ item, onDone, onLost }) }]"));
  assert.ok(d.includes("send('DELETE', `/api/inventory/items/${item.id}`)"));
  assert.ok(d.includes("rmPrefix(form, 'total');"));
  assert.ok(d.includes("className: 'tk-when iv-when'"));
  const item = src('inventory-item.js');
  assert.ok(item.includes('if (result?.gone) {') && item.includes('keepFlash(result);'));
  const css = src('styles.css');
  assert.ok(css.includes('.field .tk-suffix-box.iv-prefix-box input { padding-left: 40px;'));
  assert.ok(css.includes('@media (max-width: 420px) { .tk-dialog .tk-when.iv-when .tk-group-fields { grid-template-columns: 1fr; } }'));
});

test('audit Count stock fixes: the difference beside the records (#6), a gone row looks off (#8), the page capped', () => {
  const c = src('inventory-count.js');
  assert.ok(c.includes('const diff = countDiff(r.input.value, r.item);'));
  assert.ok(c.includes("if (diff.warn) part.dataset.tone = 'amber';"));
  assert.ok(c.includes('<div class="iv-page">'));
  const css = src('styles.css');
  assert.ok(css.includes('.iv-count-row input:disabled { opacity: .55; background: var(--band); cursor: not-allowed; }'));
});

test('audit sheet fixes: the Farm line inside a phone (#23); print light margins, fixed widths, blank rows and the review foot (#24)', () => {
  const sheet = src('inventory-sheet.js');
  assert.ok(sheet.includes("col.style.width = `${mm}mm`;"));
  assert.ok(sheet.includes('Array.from({ length: SHEET_BLANK_ROWS }'));
  assert.ok(sheet.includes('Sheet reviewed by: <span class="iv-sheet-line"></span> (Management) on <span class="iv-sheet-line iv-sheet-line-short"></span>'));
  const css = src('styles.css');
  assert.ok(css.includes('.iv-sheet .hv-sheet-facts .hv-write-line { min-width: min(40ch, 55vw); }'));
  assert.ok(css.includes('html:root:has(.iv-sheet) { color-scheme: light; background: Canvas; }'));
  assert.ok(css.includes('body.printing-sheet .iv-sheet-table { min-width: 0; font-size: 8pt; table-layout: fixed; }'));
});

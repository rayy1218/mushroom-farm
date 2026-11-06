// The room's Harvest tab and the Crop tab's harvest line (spec 2026-11-04-harvest-design.md 3 and 7). Source checks, like
// the Tasks card's; the figures and texts are tested in web-harvest-math.test.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EVENT_TYPES } from '../web/live.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const card = src('harvest-card.js');
const crop = src('crop-card.js');
const dialogs = src('task-dialogs.js');
const css = src('styles.css');

test("the card reads the room's harvests and asks again on its harvest events, a crop change and the stream coming back", () => {
  assert.ok(card.includes("request('GET', `/api/rooms/${roomId}/harvests`)"));
  assert.ok(EVENT_TYPES.includes('harvest'));
  assert.ok(card.includes("live.on('harvest', (d) => { if (d.roomId === null || d.roomId === roomId) reload.call(); })"), 'null: every room');
  assert.ok(card.includes("live.on('room', (d) => { if (d.id === roomId && d.part === 'crop') reload.call(); })"));
  const destroy = card.slice(card.indexOf('destroy() {'));
  for (const x of ['reload.cancel();', 'clearTimeout(timer);', 'for (const off of offLive) off();', 'host.className = hostClass;']) assert.ok(destroy.includes(x), x);
});

test('the parts in order: Record a harvest, This run, Harvests, Past runs, the empty text', () => {
  assert.ok(card.includes('host.replaceChildren(head, runCard, listCard, pastCard, emptyCard);'));
  const at = ['This run', 'Harvests', 'Past runs'].map((t) => card.indexOf(`el('h2', '', '${t}')`));
  assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])));
  assert.ok(card.includes("recordNote.append('Give the room its crops on the ', toCrop, ' first');"), 'the Crop tab a link');
  assert.ok(card.includes('record.disabled = !run;'));
  assert.ok(card.includes("a.href = '#/settings';"), 'the missing note links to Settings');
});

test('a room that never had crops: no Record button, an empty state with the way to the Crop tab (audit #11)', () => {
  assert.ok(card.includes('const never = !run && past.length === 0;'));
  assert.ok(card.includes('record.hidden = never;'));
  assert.ok(card.includes("el('p', 'none', 'No crops in this room yet.')"));
  assert.ok(card.includes("const giveCrops = el('a', 'button', 'Give it crops on the Crop tab');"));
  assert.ok(card.includes("giveCrops.href = roomHash(roomId, 'crop');"));
  assert.match(css, /\.hv-empty \{[^}]*border-style: dashed; border-color: var\(--border-strong\);/);
});

test('This run: the notes right under the tiles; Past runs a table whose rows open below them (audit #16, #19)', () => {
  assert.ok(card.includes("const parts = [prices && el('p', 'muted hv-missing', prices), missingLine(run.missing)].filter(Boolean);"));
  assert.ok(card.indexOf('missingLine(run.missing)].filter(Boolean)') < card.indexOf('parts.push(flushTable(run))'));
  assert.ok(card.includes("const toggle = button(row.title, 'hv-run-toggle');"));
  assert.ok(card.includes("toggle.setAttribute('aria-expanded', String(open));"));
  assert.ok(card.includes('cell.colSpan = pastColumns(money).length;'));
  assert.ok(card.includes('const SHOWN_PAST = 8;'));
  assert.match(css, /\.hv-run-body \{ padding-left: 12px; border-left: 2px solid var\(--border\); \}/);
});

test('Settings → Yield: the inputs styled as the app\'s, 44 px on a phone, the short labels there (audit #1, #2)', () => {
  assert.ok(css.includes('.field input, .yd-table input {\n  font: inherit;'));
  assert.ok(css.includes('.field input[aria-invalid="true"], .yd-table input[aria-invalid="true"]'));
  assert.ok(css.includes('button, .ctl, .field input, .field select, .yd-table input, select,'));
  assert.ok(css.includes('.yd-table { width: 100%; max-width: 640px;'));
  const yd = src('yield-card.js');
  assert.ok(yd.includes("short: 'Dry kg per block'") && yd.includes("short: 'Expected RM per kg'"));
  assert.ok(yd.includes('td.dataset.label = c.short;'));
  // a text box, so "1,5" is an error yieldBody names rather than a number box's silent empty
  assert.ok(yd.includes("type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: 'not set'"));
  assert.doesNotMatch(yd, /type: 'number'/);
  assert.ok(yd.includes("`${CROPS[crop].name}: ${c.label}, ${c.range[0].toLocaleString('en-US')} to ${c.range[1].toLocaleString('en-US')}`"), 'the range in its name');
});

test('Record, Edit and Delete: the task dialog form, the worker box, the time box, the bodies from harvest-math', () => {
  assert.match(dialogs, /export function openForm\(/);
  // a date box and a 24 h text box, not the browser's time input (it follows the browser's locale: 02:03 PM)
  assert.doesNotMatch(dialogs, /datetime-local/);
  assert.doesNotMatch(card, /datetime/);
  assert.match(dialogs, /input\.type = 'date';/);
  assert.ok(card.includes("name: 'pickedDate', label: 'Date', kind: 'date', value: shown.date, min: whenBoxes(run.startedAt).date, max: whenBoxes(Math.min(run.endedAt ?? now, now)).date,"));
  assert.ok(card.includes('hintOf: dateHint,'), "the date in the farm's words under the box (audit #13)");
  assert.ok(card.includes("kind: 'group', className: 'tk-when',"), 'Date and Time side by side');
  assert.ok(card.includes("{ name: 'pickedTime', label: 'Time', kind: 'text', value: shown.time, placeholder: '08:12', inputMode: 'decimal', maxLength: 5, hint: '24 h, like 08:12' },"));
  assert.ok(card.includes("const kgField = (value) => ({ name: 'kg', label: 'kg picked', kind: 'number', value, suffix: 'kg' });"));
  assert.ok(card.includes('title: recordTitle(getRoom()?.name),'), 'Record names the room (audit #12)');
  assert.ok(card.includes('const lead = [recordLead(view.stamp)].filter(Boolean);'), 'and the flush and stage it takes');
  assert.ok(card.includes("r.field === 'pickedAt' ? { ...r, field: 'pickedDate' } : r"), "the server's pickedAt error under the date box");
  assert.ok(card.includes("workerField(names, 'Who picked it')"));
  assert.ok(card.includes("return onTime(await send('POST', `/api/rooms/${roomId}/harvests`, body));"));
  assert.ok(card.includes("return onTime(await send('PUT', `/api/harvests/${h.id}`, body));"));
  assert.ok(card.includes("const r = await send('DELETE', `/api/harvests/${h.id}`);"));
  assert.ok(card.includes('title: deleteTitle(h),'), 'the harvest named once, in the title');
  assert.ok(card.includes('lead: [deleteLead(h), ...(h.taskId ? ["Its harvest check\'s kg becomes the total of what is left."] : [])],'), "a check's row says what happens to the check's kg");
  assert.ok(card.includes("options: crops.map((c) => [c.crop, cropShortName(c.crop)])"), 'no (draft) in the crop picker');
});

test('Record a harvest is off until the first answer; a farm app without the harvests says so, with no timer', () => {
  const made = card.indexOf("const record = button('Record a harvest', 'primary');");
  assert.ok(card.slice(made, made + 150).includes('record.disabled = true;'));
  const missing = card.slice(card.indexOf('if (routeMissing(err)) {'));
  assert.ok(missing.startsWith("if (routeMissing(err)) { // a farm app from before the harvests: say so, nothing else\n        runLine.textContent = OUTDATED;\n        record.hidden = true;\n        return;"),
    'OUTDATED, Record hidden, and back before the timer is set');
});

test("one Edit a row, Delete in the Edit dialog's footer; 8 rows (5 on a phone), the meta on one line (audit #8)", () => {
  assert.ok(!card.includes("button('Delete', 'tk-quiet')"));
  assert.ok(card.includes("buttons: [{ label: 'Delete this harvest', action: () => deleteHarvest(h, li, fallback) }, { value: 'save', label: 'Save', primary: true }],"));
  assert.ok(card.includes('const SHOWN = 8;') && card.includes('const SHOWN_PHONE = 5;'));
  assert.match(css, /\.hv-meta \{[^}]*white-space: nowrap; text-overflow: ellipsis;/);
  assert.ok(card.includes("if (edit?.isConnected && !document.querySelector('dialog[open]')) edit.focus();"), 'Keep it: back to the row');
});

test("after a Delete the cursor goes to the next row's Edit, else the list's title", () => {
  assert.ok(card.includes('const near = li.nextElementSibling ?? li.previousElementSibling;'));
  assert.ok(card.includes('pendingFocus = [near && `edit-${near.dataset.id}`, fallback].filter(Boolean);'));
  assert.ok(card.includes("listTitle.tabIndex = -1;\n  listTitle.dataset.focusKey = 'harvests-title';"));
  assert.ok(card.includes("harvestRow(h, run, 'harvests-title')") && card.includes('harvestRow(h, run, `run-${run.id}`)'));
  assert.ok(card.includes('const keys = pendingFocus ?? (focusKey ? [focusKey] : []);'));
});

test('the Crop tab: the run in one line with a link to the Harvest tab, read on the harvest events (throttled; null: every room)', () => {
  assert.ok(crop.includes("yieldLink.href = roomHash(roomId, 'harvest');"));
  assert.ok(crop.includes('yieldText.textContent = summaryLine(harvestRun ?? {}, last.flush);'));
  assert.ok(crop.includes("const reloadHarvests = createThrottle(() => { if (alive) loadHarvests(); });"));
  assert.ok(crop.includes("live.on('harvest', (d) => { if (alive && (d.roomId === null || d.roomId === roomId)) reloadHarvests.call(); }),"));
  assert.ok(crop.includes('live.onStatus((up) => { if (alive && up && harvestKey) reloadHarvests.call(); })'));
  assert.ok(crop.includes('reloadHarvests.cancel();'), 'a reload waiting is dropped on destroy');
  assert.ok(crop.includes('const show = Boolean(last) && hasCrops(last) && harvestRun !== undefined;'));
  // cleared crops forget the key, so the same crops given again (a new run) are read again
  assert.ok(crop.includes("const key = hasCrops(data) ? JSON.stringify([data.crops, data.stage, data.flush, data.done]) : '';"));
  assert.ok(crop.includes('if (key !== harvestKey) { harvestKey = key; if (key) loadHarvests(); }'));
});

test('Delete room names the harvests', () => {
  assert.ok(src('room-edit.js').includes("'The room goes with its readings, history, crop, harvests and simulations.'"));
});

test('a mixed room\'s flushes on a phone: the per-crop columns give way to the split under "Flush N"; a field-less confirm\'s title has no box', () => {
  assert.ok(card.includes("table('Flushes', flushColumns(run.crops), flushRows(run), 2, { perCrop: flushPerCrop(run.crops), subs: flushSplits(run) })"));
  assert.ok(card.includes("if (i >= perCrop[0] && i < perCrop[1]) td.classList.add('hv-crop-col');"));
  assert.ok(card.includes("if (i >= perCrop[0] && i < perCrop[1]) th.classList.add('hv-crop-col');"), 'the head too');
  assert.ok(card.includes("const td = el('td', 'hv-flush-split', subs[row]);") && card.includes('td.colSpan = columns.length;'), 'a row of its own, the table wide');
  assert.ok(css.includes('.hv-split-row { display: none; }\n@media (max-width: 600px) {\n  .hv-table .hv-crop-col { display: none; }'));
  assert.ok(css.includes('  .hv-split-row { display: table-row; }'));
  assert.ok(css.includes('#tk-dialog-title:focus { outline: none; }'));
});

test('an implausible pick asks once in Record, Edit and Done (the behaviour: web-pick-guard.test.js)', () => {
  assert.ok(card.includes("const implausible = pickGuard({ value: 'record', label: 'Record', fields: ['crop', 'kg'] });"), 'a crop change asks again');
  assert.ok(card.includes('const asked = implausible(form, recordPicks(body, run));'));
  assert.ok(card.includes("const implausible = pickGuard({ value: 'save', label: 'Save', fields: ['kg'] });"));
  assert.ok(card.includes('const asked = implausible(form, editPicks(body, h));'), 'Edit: only a changed kg');
  assert.ok(dialogs.includes("const implausible = pickGuard({ value: 'done', label: 'Done', fields: amounts.map((f) => f.name) });"));
  assert.ok(dialogs.includes('const asked = implausible(form, donePicks(row, body));'));
});

test('the pick question is a check, not a fault: amber under the kg box, the box not marked invalid, still read out', () => {
  assert.ok(dialogs.includes('return warnings.map((w) => ({ ...w, warn: true }));'));
  assert.ok(dialogs.includes("err.classList.toggle('field-warn', Boolean(p.warn));"));
  assert.ok(dialogs.includes("if (p.warn) input.dataset.warn = '';\n        else input.setAttribute('aria-invalid', 'true');"));
  assert.ok(dialogs.includes('for (const p of boxed) {'), 'each box of a list: a mixed Done warns on every crop at once');
  assert.ok(dialogs.includes("err.setAttribute('aria-live', 'polite');"), 'the words under the box are announced');
  assert.ok(css.includes('.field-error.field-warn { color: var(--warning-text); }'));
  assert.ok(css.includes('.field input[data-warn] { border-color: var(--warning-text); }'));
  assert.ok(dialogs.includes("value: '', hint: 'Leave it empty if it was not weighed or counted.', ...(f.suffix ? { suffix: f.suffix } : {}) }));"), 'the single kg box has "kg" inside');
});

// ---- Batches ---- (the integration, 2026-11-05; contract section 4): the run's blocks line, batchLineFor's text and link
// (its words: web-batches-math.test.js)
test("This run: the run's batches read with its harvests under the same token, a muted line to the batch, again on 'batches'", () => {
  assert.ok(card.includes("import { batchLineFor } from './batches-math.js';"));
  assert.ok(card.includes("return { runId: run.id, reply: await request('GET', `/api/batches?run=${run.id}`) };"));
  const load = card.slice(card.indexOf('async function refresh() {'), card.indexOf('// ---- Batches ---- the current run'));
  assert.match(load, /const \[runBlocks, runProfit\] = await Promise\.all\(\[isOwner\(\) \? readBlocks\(data\.current\) : null, isOwner\(\) \? readProfit\(data\.current\) : null\]\);\n\s*if \(!alive \|\| me !== seq\) return;\n\s*view = data;\n\s*blocks = runBlocks;\n\s*profit = runProfit;\n\s*paint\(\);/,
    'a stale answer is dropped before anything changes');
  assert.ok(card.includes('return blocks?.runId === run.id ? blocks : null;'), 'a failed read keeps the same run\'s line');
  assert.ok(card.includes('const key = JSON.stringify([view, showAll, [...allOf], blocks, profit]);'), 'a new answer repaints');
  assert.ok(card.includes("runCard.append(el('h2', '', 'This run'), runLine, blocksLine, profitLine, tiles, runBody);"), 'under the run\'s head');
  assert.ok(card.includes("const blocksLine = el('p', 'muted bz-blocks');"));
  assert.ok(card.includes('const line = batchLineFor(run, blocks?.runId === run.id ? blocks.reply : null);'));
  assert.ok(card.includes('blocksLine.hidden = !line;'));
  assert.ok(card.includes("live.on('batches', () => reload.call()),"));
  assert.ok(EVENT_TYPES.includes('batches'));
  assert.equal((card.match(/batchLineFor/g) ?? []).length, 2, 'only in This run');
});

// ---- Costs ---- (the Business audit, 2026-11-05): the run's profit so far, a muted line to the run page
test("This run: the run's profit from Costs' summary, read with the harvests, a muted link to Costs; again on 'costs' and 'sales'", () => {
  assert.ok(card.includes("import { runProfitLine } from './costs-math.js';"));
  assert.ok(card.includes("return { runId: run.id, reply: await request('GET', `/api/costs/summary?run=${run.id}`) };"));
  assert.ok(card.includes('return profit?.runId === run.id ? profit : null;'), "a failed read keeps the same run's line");
  assert.ok(card.includes("const profitLine = el('p', 'muted bz-blocks hv-profit');"), "the blocks line's look");
  assert.ok(card.includes('const money = runProfitLine(profit?.runId === run.id ? profit.reply : null);'));
  assert.ok(card.includes('profitLine.hidden = !money;'), 'hidden when Costs has nothing');
  assert.ok(card.includes('a.href = runHash(run.id); // ---- Runs ----'), 'the line opens the run page (2026-11-05, Runs fixes); its Costs card links on');
  assert.ok(card.includes("live.on('costs', () => reload.call()),") && card.includes("live.on('sales', () => reload.call()),"));
  assert.ok(EVENT_TYPES.includes('costs') && EVENT_TYPES.includes('sales'));
});

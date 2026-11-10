// The Costs page (spec 2026-11-05-costs-design.md 6) and its dialogs. Source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('costs-page.js');
const dialogs = src('costs-dialogs.js');
const app = src('app.js');
const css = src('styles.css');
const costsCss = css.slice(css.indexOf('/* ---- Costs ---- */'), css.indexOf('/* ---- end Costs ---- */'));

test('the router mounts the page with its month', () => {
  assert.ok(app.includes("import * as costs from './costs-page.js';"));
  assert.ok(app.includes(": route.name === 'costs' ? costs.mount(page, { month: route.month })")); // under the Business strip (the merge)
});

test('the month in the address, in place; a bookmark out of the months kept goes to this month', () => {
  assert.ok(page.includes("history.replaceState(null, '', costsHash(shown));"));
  assert.ok(page.includes("if (err.status === 400 && err.field === 'month' && asked !== null) {"));
  assert.ok(page.includes("history.replaceState(null, '', costsHash(null));"));
});

test('a failed answer after a month step keeps the figures dimmed until the named month comes', () => {
  assert.ok(page.includes("if (view && view.month === wanted()) els.body.removeAttribute('aria-busy');"));
});

test('it listens to the events the app knows; a month step reads only the month, the lists on the costs and room events', () => {
  assert.ok(page.includes("const LISTEN = ['costs', 'harvest', 'sales', 'batches', 'inventory'].filter((type) => EVENT_TYPES.includes(type));"));
  assert.ok(page.includes("...LISTEN.map((type) => live.on(type, () => (type === 'costs' ? reloadAll() : reload.call()))),"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reloadAll(); }),"));
  assert.ok(page.includes("lists ? request('GET', '/api/costs') : null,"));
});

test('unmount closes a dialog of the page; Add and Edit stop when the page went while the workers were read', () => {
  assert.ok(page.includes("import { closeTaskDialog } from './task-dialogs.js';"));
  assert.match(page, /return function unmount\(\) \{\n {4}mountSeq\+\+;\n {4}closeTaskDialog\(\);/);
  assert.equal(dialogs.match(/const workers = await loadWorkers\(\)\.catch\(\(\) => null\);\n {2}if \(!alive\(\)\) return;/g).length, 2);
  assert.ok(page.includes('onLost: showError, alive,'));
});

test('the where-it-lands cache forgets a refused month', () => {
  assert.ok(page.includes('answer.catch(() => { if (other.get(m) === answer) other.delete(m); });'));
});

test('the loss tone from the tile\'s tone, not its place; the month arrows are buttons that hand the focus over', () => {
  assert.ok(page.includes("list.forEach((t, i) => { if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn'; });"));
  assert.ok(page.includes('<button type="button" class="co-step" data-prev aria-label="Previous month" disabled>'), 'off until the first answer');
  assert.ok(page.includes('if (focused === els.prev && els.prev.disabled && !els.next.disabled) els.next.focus();'));
  assert.match(costsCss, /button\.co-step \{[^}]*min-width: 44px; min-height: 44px;/);
});

test('a resize, a run opened and a repaint keep the focus; a run opened repaints only the runs', () => {
  assert.ok(page.includes('frame = requestAnimationFrame(() => { if (alive() && view) keepFocus(paintChart); });'));
  assert.ok(page.includes('keepFocus(paintRuns); // only the runs'));
  assert.ok(page.includes('lastWidth = width;'));
});

test('the dialogs: a stale row reads the lists again; Add before the first answer says so; Change offers Stop and Delete', () => {
  assert.ok(page.includes('if (!c) reloadAll();'));
  assert.ok(page.includes('else if (els.banner.hidden) showError(LOADING);'));
  assert.ok(dialogs.includes("{ label: 'Stop', action: () => openStopDialog({ cost, today, onDone, onLost }) },"));
  assert.ok(dialogs.includes("value: clampMonth(today.slice(0, 7), months)"), 'Stop starts on this month');
  assert.ok(!dialogs.includes('FARM_OFFSET_MS') && !dialogs.includes("'Jan', 'Feb'"), 'the farm\'s clock and months from the shared helpers');
});

test('a new labour cost starts on Pick a name; unread workers say so rather than a box to type in', () => {
  assert.ok(dialogs.includes("return { ...f, value: c?.worker ?? '' };"));
  assert.ok(dialogs.includes("options: [['', 'Names not read']"));
});

test('the chart: one Tab stop, the arrows and Home and End; no figures at all said in words', () => {
  assert.ok(page.includes("tabindex: b.shown ? 0 : -1"));
  assert.ok(page.includes("const j = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: links.length - 1 }[event.key];"));
  assert.ok(page.includes("el('p', 'none co-chart-none', 'No figures yet.')"));
});

test('styles: Profit in Display, the two columns from 900 px, the lists by their own width, tabular figures where they line up', () => {
  assert.ok(costsCss.includes('.co-tiles > :first-child .us-kwh { font-size: var(--fs-3xl); line-height: 1.1; letter-spacing: -.02em; }'));
  assert.match(costsCss, /@media \(max-width: 600px\) \{[^@]*\.co-tiles > :first-child \.us-kwh \{ font-size: 28px; \}/);
  assert.ok(costsCss.includes('@media (min-width: 900px) {\n  .co-page { grid-template-columns'));
  assert.ok(costsCss.includes('.co-repeats > .co-repeat { grid-column: 1 / -1; grid-template-columns: subgrid; }'));
  assert.ok(costsCss.includes('@container (max-width: 560px) {'));
  assert.ok(!/\.co-entry \{[^}]*tabular-nums/.test(costsCss));
  assert.match(costsCss, /\.co-date \{[^}]*tabular-nums/);
  assert.match(costsCss, /\.co-amount \{[^}]*tabular-nums/);
  assert.ok(!/#[0-9a-f]{3,6}\b/i.test(costsCss), 'tokens only');
});

// ---- the Business audit, 2026-11-05 ----
test('the head: Loading… until the first answer (not a blank), and Export CSV of the month on show', () => {
  assert.ok(page.includes('<span class="co-month-name" data-month aria-live="polite">Loading…</span>'));
  assert.ok(page.includes("<a class=\"button\" data-csv href='/api/costs.csv' download>Export CSV</a>")); // (a route never in double quotes: the worker sweep, web-roles)
  assert.ok(page.includes('els.csv.href = `/api/costs.csv?month=${m}`;'));
  assert.ok(!/\.co-tools > \.primary \{/.test(costsCss), "the head buttons' height is the Business pages' (bz), not the module's");
});

test('links to the other pages: the container, the run\'s blocks, a category\'s source; the link look', () => {
  assert.ok(page.includes('if (i === 0) td.append(link(c, r.roomHref));'));
  assert.ok(page.includes('if (href) dt.append(link(label, href));'));
  assert.ok(page.includes('if (c.href) source.append(link(c.source, c.href));'));
  assert.match(costsCss, /\.co-link \{[^}]*color: var\(--ink\); text-decoration: underline; text-decoration-color: var\(--muted\);/);
});

test('a loss in Runs: only the figure in the loss tone, Profit says Loss in words', () => {
  assert.ok(page.includes("if (loss) td.append(el('span', 'co-loss', c), ...(i === 4 ? [el('span', 'co-sub', 'Loss')] : []));"));
  assert.ok(!costsCss.includes('td.co-loss'), 'not the whole cell');
  assert.match(costsCss, /\.co-loss \{ color: var\(--critical-text\); \}/);
});

test('mid-month: each monthly item its charge day, the month note of what is still to come, the line under Runs', () => {
  assert.ok(page.includes('const x = repeatingLine(c, view.today);'));
  assert.ok(page.includes("what.append(el('span', 'co-sub', x.when));"));
  assert.ok(page.includes('const notes = monthNotes(view);'), 'the whole view: its monthly items and today');
  assert.ok(page.includes("el('p', 'muted co-runs-note', SHARED_NOTE)"));
});

test("the chart's svg names the months in sum", () => {
  assert.ok(page.includes("'aria-label': chartWords(months, chartTitle(months.length))"));
});

test('the Business conventions: quiet row actions bz-quiet, the dialogs\' form bz-form', () => {
  assert.ok(page.includes("el('button', 'tk-quiet co-quiet bz-quiet', label)"));
  assert.ok(dialogs.includes("document.querySelector('dialog.tk-dialog[open] > form')?.classList.add('bz-form');"));
  assert.ok(!/openForm\(\{/.test(dialogs.replace('const form = openForm(options);', '')), 'every dialog through the bz-form wrapper');
});

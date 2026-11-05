// The farm's Harvest page, its myGAP sheet, the top bar's Harvest link and the Overview's Harvest card (spec
// 2026-11-04-harvest-design.md 7). Source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('harvest-page.js');
const app = src('app.js');
const html = src('index.html');
const overview = src('overview.js');
const css = src('styles.css');

test('the router mounts the page and the sheet, and marks the Harvest link on both', () => {
  assert.ok(app.includes("import * as harvest from './harvest-page.js';"));
  assert.ok(app.includes(": route.name === 'harvest' ? harvest.mount(view, { days: route.days })"));
  assert.ok(app.includes(": route.name === 'sheet' ? harvest.mountSheet(view, { days: route.days })"));
  assert.ok(app.includes("harvest: document.querySelectorAll('[data-nav=\"harvest\"]'),"));
  assert.ok(app.includes("const section = route.name === 'sheet' ? 'harvest' : ['settings', 'overview', 'today', 'calendar', 'harvest'].includes(route.name)"));
});

test("the top bar's Harvest link, a basket and the word, between Calendar and Overview", () => {
  const bar = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
  assert.match(bar, /<a class="top-link" href="#\/harvest" data-nav="harvest" aria-label="Harvest"><svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"[^>]*aria-hidden="true">[^]*?<\/svg><span>Harvest<\/span><\/a>/);
  assert.ok(bar.indexOf('data-nav="calendar"') < bar.indexOf('data-nav="harvest"') && bar.indexOf('data-nav="harvest"') < bar.indexOf('data-nav="overview"'));
});

test('the page: the period in the address, Export CSV and the myGAP sheet follow it; the chart in the harvest hue', () => {
  assert.ok(page.includes("history.replaceState(null, '', canonicalHash({ name: 'harvest', days: n }));"));
  assert.ok(page.includes('els.csv.href = `/api/harvest.csv?days=${period}`;'));
  assert.ok(page.includes('els.sheet.href = sheetHash(period);'));
  assert.ok(page.includes('<a class="button" data-csv download>Export CSV</a>'));
  assert.ok(page.includes("color: 'var(--s-harvest)'"));
  assert.ok(page.includes("request('GET', `/api/harvest?days=${period}`)"));
});

test('the page and the sheet ask again on a harvest, a crop change and the stream coming back', () => {
  assert.ok(page.includes("live.on('harvest', () => reload.call()),"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),"), 'a room added, renamed or deleted too (review R2)');
  assert.ok(overview.includes("live.on('room', (d) => { if (d.part === 'room') harvestAt = 0; reload.call(); }),"));
  assert.ok(page.includes('live.onStatus((up) => { if (up) reload.call(); else timerOf(REFRESH_MS); }),'));
  assert.equal(page.match(/const stop = keepCurrent\(/g).length, 2);
  assert.ok(!page.includes('farm:harvest'));
});

test('the sheet: Print, the class that prints it light without the top bar, taken off when it goes', () => {
  assert.ok(page.includes("q('[data-print]').addEventListener('click', () => window.print());"));
  assert.ok(page.includes("document.body.classList.add('printing-sheet');"));
  assert.ok(page.includes("document.body.classList.remove('printing-sheet');"));
  const print = css.slice(css.indexOf('@media print {\n  body.printing-sheet {'));
  assert.match(print, /body\.printing-sheet \{\s*color-scheme: light; --page: #fff; --surface: #fff; --ink: #000;/);
  assert.match(print, /body\.printing-sheet \.hv-sheet-tools[^{]*\{ display: none !important; \}/);
  assert.ok(css.includes('@media print { .topbar { display: none !important; } }'));
});

test('the harvest hue in both themes (the Mirror Rule)', () => {
  const dark = css.slice(css.indexOf(':root[data-theme="dark"] {'), css.indexOf(':root[data-theme="light"] {'));
  const light = css.slice(css.indexOf(':root[data-theme="light"] {'));
  assert.match(dark, /--s-harvest: #[0-9a-f]{6};/);
  assert.match(light.slice(0, light.indexOf('}')), /--s-harvest: #[0-9a-f]{6};/);
});

test("the Overview's Harvest card: read with the usage at most once a minute and at once on a harvest; its title opens the page", () => {
  assert.ok(overview.includes("wantHarvest ? request('GET', '/api/harvest?days=30').catch(() => null) : null,"));
  assert.ok(overview.includes('const wantHarvest = Date.now() - harvestAt >= USAGE_REFRESH_MS;'));
  assert.ok(overview.includes("live.on('harvest', () => { harvestAt = 0; reload.call(); }),"));
  assert.ok(overview.includes("link.href = '#/harvest';"));
  assert.ok(overview.indexOf('if (usage) cards.push(energyNode(usage));') < overview.indexOf('if (harvest) cards.push(harvestNode(harvest));'), 'beside Energy and water');
});

test('the page: the segments by what the bars cover, the totals card titled with the reply\'s dates, the notes under the tiles', () => {
  assert.ok(page.includes("const b = el('button', '', periodWords(n));"));
  assert.ok(page.includes('els.totalsTitle.textContent = rangeText(farm);'));
  assert.ok(!page.includes('The last ${period} days'));
  assert.ok(page.includes('els.tiles.replaceChildren(...tileNodes(pageTiles(farm)));'));
  assert.ok(page.includes("prices && el('p', 'muted hv-missing', prices)"), "the cost's prices are today's: said once under the tiles");
  assert.ok(page.includes("td.append(el('span', 'hv-without', r.without))"), 'a room value without a crop says so');
});

test('the sheet: a blank line for the farm\'s name (the app has none), the kg total in the foot', () => {
  assert.ok(page.includes('<div><dt>Farm</dt><dd class="hv-write-line"></dd></div>'));
  assert.ok(!page.includes('brand-text'), "not the app's name");
  assert.ok(page.includes('<tfoot><tr><th scope="row" colspan="3">Total</th><td class="num" data-total></td>'));
  assert.ok(page.includes('els.total.textContent = t.harvested;'), 'the kg total, now from sheetTotals (Sales 9)');
  assert.match(css, /body\.printing-sheet \.hv-sheet-table tfoot \{ display: table-row-group; \}/, 'printed once, at the end');
});

test("the Overview's Harvest card names the crops its RM value leaves out", () => {
  assert.ok(overview.includes("if (t.note) tile.append(node('p', 'us-note', t.note));"));
});

test('By room: the names on one line, the period over kg and RM and This run over the run\'s columns; a phone puts the run under the name (audit #7)', () => {
  assert.ok(page.includes("{ label: `Last ${periodWords(farm.days)}`, span: 2 }, { label: 'This run', span: 2, className: 'hv-run-col' }"));
  assert.ok(page.includes("if (r.run) th.append(el('span', 'hv-run-words', r.run));"));
  assert.match(css, /\.hv-farm-table \.hv-name \{[^}]*white-space: nowrap;/);
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.hv-farm-table \.hv-run-col \{ display: none; \}/);
});

test('the totals card: the tiles held to a width, the kg in Display type; the Overview\'s three tiles at 360 px (audit #17, #20)', () => {
  assert.ok(css.includes('.hv-page .hv-tiles > .us-tile { flex: 0 1 260px; }'));
  assert.ok(css.includes('.hv-page .hv-tiles > :first-child .us-kwh { font-size: var(--fs-3xl);'));
  assert.ok(css.includes('.ov-harvest .us-tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }'));
});

test('a long figure never runs into the next tile: the tiles grow to their figures and wrap; a phone sets a long one a size down', () => {
  assert.ok(css.includes('.hv-tiles { display: flex; flex-wrap: wrap; margin-top: 4px; }'));
  assert.ok(css.includes('.hv-tiles > .us-tile { flex: 1 0 128px; min-width: min-content; }'));
  assert.match(css, /@media \(max-width: 600px\) \{\n  \.hv-tiles > \.us-tile \{ flex-basis: calc\(50% - 6px\); \}[^\n]*\n  \.hv-tiles \.us-kwh\[data-long\] \{ font-size: var\(--fs-lg\); \}/);
  const card = src('harvest-card.js');
  assert.ok(card.includes('const LONG_FIGURE = 11;'));
  assert.ok(card.includes("if (t.value.length > LONG_FIGURE) value.dataset.long = '';"));
});

test("the Overview's Harvest card: a 30-day strip in the harvest hue and the rooms' kg two a line; the title 44 px on a phone (audit #23)", () => {
  assert.ok(overview.includes('for (const b of stripBars(farm, 300, 48)) {'));
  assert.ok(overview.includes("strip.setAttribute('aria-label', chartLabel(farm));"));
  assert.ok(overview.includes("const list = node('ul', 'us-rooms ov-harvest-rooms');"));
  assert.match(css, /\.ov-strip \{[^}]*height: 48px;[^}]*fill: var\(--s-harvest\);/);
  assert.ok(css.includes('.ov-harvest-rooms { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));'));
  assert.ok(css.includes('.ov-harvest h2 a { display: inline-block; padding: 11px 4px; margin: -11px -4px; }'));
});

test('the myGAP sheet: the sales of the same days as their own rows, the Total with sold kg and RM (Sales, spec 2026-11-05 6)', () => {
  assert.ok(page.includes("import { sheetWithSales, sheetTotals } from './sales-math.js';"));
  assert.ok(page.includes('request(\'GET\', `/api/sales/range?from=${data.from}&to=${data.to}`)'));
  assert.ok(page.includes('sheetWithSales(farm.records, lines)'));
  assert.ok(page.includes('Sales could not be read: the sales columns are blank.'));
  assert.ok(page.includes('data-sold') && page.includes('data-income'));
  assert.ok(page.includes("live.on('sales', () => reload.call())"));
});

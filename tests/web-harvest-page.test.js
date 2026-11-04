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
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop') reload.call(); }),"));
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

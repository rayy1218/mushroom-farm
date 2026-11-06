// The app's frame (owner, 2026-10-26: no side bar, no bottom tab bar; 2026-10-28: Overview and Settings in the top bar, the
// alarm count its own button, the Rooms list folded into the Overview).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');

test('one bar on top: no side bar, no bottom tab bar', () => {
  assert.doesNotMatch(html, /<aside class="side"/);
  assert.doesNotMatch(html, /class="tabbar"/);
  assert.doesNotMatch(css, /\.side \{|\.tabbar \{|\.menu a/);
  assert.equal((html.match(/<header class="topbar">/g) ?? []).length, 1);
});

test('the top bar: the farm\'s name, then Overview and Settings as links, the alarm count as its own button', () => {
  const bar = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
  assert.match(bar, /<a class="brand brand-top" href="#\/overview"/);
  assert.match(bar, /<a class="top-link" href="#\/overview" data-nav="overview" aria-label="Overview">/, "its word hides on a phone, so the link keeps its name (critique 2026-10-29c)");
  assert.match(bar, /<a class="top-link" href="#\/settings" data-nav="settings" aria-label="Settings">/);
  assert.match(bar, /<a class="top-alarm" href="#\/overview" data-alarm-button hidden><svg[^]*<span data-badge><\/span><\/a>/);
  assert.ok(bar.indexOf('data-nav="overview"') < bar.indexOf('data-nav="settings"'), 'Overview before Settings');
  assert.equal((html.match(/data-badge/g) ?? []).length, 1);
});

test('the Overview holds every room and Add room (the Rooms list is folded into it)', () => {
  const overview = readFileSync(new URL('../web/overview.js', import.meta.url), 'utf8');
  assert.match(overview, /<button type="button" data-add>Add room<\/button>/);
  assert.match(overview, /<div class="ov-section-head">\n\s*<h2>Rooms<\/h2>\n\s*<span class="card-note">Traces: the last 24 hours<\/span>\n\s*<\/div>\n\s*<div class="ov-rooms" data-rooms><\/div>/);
  assert.match(overview, /openRoomDialog\(\{ onSaved: \(room\) => \{ location\.hash = roomHash\(room\.id, 'setup'\); \} \}\)/, 'a new room opens on its Setup');
});

test("the page says it couldn't load when its modules never ran (a blank page under 'Not live' before; critique 2026-10-28)", async () => {
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.match(html, /<div class="load-fail" id="load-fail" role="alert" hidden>/);
  assert.match(html, /setTimeout\(function\(\)\{if\(window\.farmReady\)return;/);
  assert.match(app, /window\.farmReady = true;/);
});

test('601 to 1099 px: the top links are their icons (and the Today count), so no page scrolls sideways (critique 2026-11-05 #1; to 1099 px since Business)', () => {
  const band = css.slice(css.indexOf('@media (max-width: 1099px) {'));
  assert.ok(band.length < css.length, 'a band up to 1099 px');
  const rules = band.slice(0, band.indexOf('\n}'));
  assert.ok(rules.includes('.top-link > span:not(.top-count) { display: none; }'), 'the words go, the count stays');
  assert.ok(rules.includes('.top-link { min-width: 44px; padding: 4px 6px; justify-content: center; gap: 4px; }'));
  // the phone's own rules come after it, so under 600 and 400 px they still win
  assert.ok(css.indexOf('@media (max-width: 1099px) {') < css.indexOf('@media (max-width: 430px) {\n  .topbar { gap: 2px; }'));
});

// ---- Business (the integration, 2026-11-05; DESIGN.md "Business" and the Navigation Rule) ----
test('the top bar: one Business link after Harvest, before Overview, current on every business page', () => {
  const bar = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
  assert.match(bar, /<a class="top-link" href="#\/business" data-nav="business" aria-label="Business"><svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">[^]*?<\/svg><span>Business<\/span><\/a>/);
  const icon = bar.slice(bar.indexOf('data-nav="business"'), bar.indexOf('</svg>', bar.indexOf('data-nav="business"')));
  assert.doesNotMatch(icon, /#[0-9a-f]{3,6}|var\(--/i, 'a line in currentColor, no colour of its own (the Picture Rule)');
  assert.ok(bar.indexOf('data-nav="harvest"') < bar.indexOf('data-nav="business"') && bar.indexOf('data-nav="business"') < bar.indexOf('data-nav="overview"'));
  assert.equal((bar.match(/class="top-link"/g) ?? []).length, 6);
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("business: document.querySelectorAll('[data-nav=\"business\"]'),"));
  assert.ok(app.includes("const current = tab ? 'business' : section;"));
  assert.ok(app.includes('if (name === current)'));
});

test('#/business is the Summary tab itself: no memory of the last tab (farm.business gone); the strip over the six pages', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  for (const gone of ['farm.business', 'businessLanding', 'lastBusiness', 'keepBusiness']) assert.ok(!app.includes(gone), gone);
  assert.ok(app.includes('view.append(businessTabs(businessStrip(route)), page);'));
  for (const m of ['sales.mount(page,', 'costs.mount(page,', 'batches.mount(page,', 'inventory.mount(page,']) assert.ok(app.includes(m), m);
  for (const m of ['batchSheet.mountSheet(view,', 'inventorySheet.mount(view,', 'batches.mountBatch(view,', 'inventoryItem.mount(view,', 'inventoryCount.mount(view,']) assert.ok(app.includes(m), `${m} no strip`);
  const tabs = readFileSync(new URL('../web/business-tabs.js', import.meta.url), 'utf8');
  assert.ok(tabs.includes("nav.className = 'room-tabs bz-tabs';"), "the room page's tabs, as they are");
  assert.ok(tabs.includes("nav.setAttribute('aria-label', 'Business');"));
  assert.ok(tabs.includes("if (t.key === current) a.setAttribute('aria-current', 'page');"));
});

// the joint Business audit (2026-11-05), agent C: the top link's current state, and the one look the four modules share
test('the Business top link is current as "true" (a section, not this page); the strip\'s tab keeps "page" (C3)', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("if (name === current) a.setAttribute('aria-current', name === 'business' ? 'true' : 'page');"));
  const tabs = readFileSync(new URL('../web/business-tabs.js', import.meta.url), 'utf8');
  assert.ok(tabs.includes("a.setAttribute('aria-current', 'page')"));
});

test('every business page but a sheet marks the view .bz-view, for the shared look (C1)', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("view.classList.toggle('bz-view', Boolean(tab) && !/Sheet$/.test(route.name));"));
});

test('the .bz- block: sticky dialog footers (bz-form and bt-form), the quiet row action, 14 px card titles, 36/44 px head buttons (C1)', () => {
  const bz = css.slice(css.indexOf('/* ---- Business (the integration'), css.indexOf('/* ---- end Business ---- */'));
  assert.ok(bz.includes('.tk-dialog:has(> form:is(.bz-form, .bt-form)) { padding-bottom: 0; }'));
  assert.ok(bz.includes('.tk-dialog > form:is(.bz-form, .bt-form) > .actions { position: sticky; bottom: 0;'));
  assert.ok(bz.includes('.tk-dialog > form:is(.bz-form, .bt-form) > .actions .tk-aside { grid-column: 1 / -1;'), 'a phone: Delete on its own row');
  const quiet = bz.slice(bz.indexOf('button.bz-quiet, a.bz-quiet {'), bz.indexOf('}', bz.indexOf('button.bz-quiet, a.bz-quiet {')));
  for (const rule of ['min-height: 36px;', 'border: 1px solid var(--border-strong);', 'background: transparent;', 'color: var(--ink-2);', 'font-size: var(--fs-md);']) assert.ok(quiet.includes(rule), rule);
  assert.ok(/@media \(max-width: 600px\) \{[^]*?:is\(button, a\)\.bz-quiet \{ min-height: 44px;/.test(bz), '44 px on a phone');
  assert.ok(bz.includes('.bz-view .card h2 { font-size: var(--fs-md); font-weight: 600; }'));
  assert.ok(bz.includes('.bz-view .page-head :is(button, a.button):not(.range-bar button, .co-step) { min-height: 36px; }'));
  assert.ok(!css.includes('.bt-form) > .actions { position: sticky') || bz.includes('bt-form'), 'one rule for both');
  assert.ok(!/\.tk-dialog > form\.bt-form > \.actions \{/.test(css), "Batches' own footer rule folded into the shared one");
});

test("the range control's unselected words in ink-2: 4.5:1 or more on the light page's track (C2)", () => {
  assert.ok(css.includes('.range-bar button { min-height: 30px; padding: 4px 12px; border: 0; border-radius: 7px; background: transparent; color: var(--ink-2);'));
});

test('a phone with seven icons: the Live dot alone, the alarm button for the Overview link, 38 px links under 430 px', () => {
  const phone = css.slice(css.indexOf('/* a phone (C8 review'), css.indexOf('/* the smallest phones with the alarm button too'));
  assert.ok(phone.includes('@media (max-width: 600px) {\n  .topbar .live-mark [data-live-text] { position: absolute;'));
  assert.ok(phone.includes('.topbar:has(> .top-alarm:not([hidden])) .top-link[data-nav="overview"] { display: none; }'));
  assert.ok(phone.includes('.top-link { min-width: 38px; }') && phone.includes('.topbar .theme-btn { width: 38px; min-width: 38px; }'));
  assert.ok(phone.includes('@container (max-width: 27.98px) { .brand-top .brand-mark { display: none; } }'), 'the mark whole or not at all');
  assert.ok(!css.includes('min-width: 40px; }\n  .topbar .theme-btn { width: 40px'), 'the 40 px of six icons is gone');
});

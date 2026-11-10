// The Economics page (web/economics-page.js, spec 2026-11-06-economics-design.md 8 and 9): its mount under the strip, its
// reads and live updates, the cards in order, the folds and rows, typing and saving, the phone's blocks and the .ec- styles.
// The typing (the draft) and the reads (createReader, keepFocus) run for real in their own tests
// (web-economics-figures, web-business-page); here the page's use of them is checked in its source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('economics-page.js');
const app = src('app.js');
const css = src('styles.css');
const ecCss = css.slice(css.indexOf('/* ---- Economics (spec 2026-11-06-economics-design.md 8) ---- */'), css.indexOf('/* ---- end Economics ---- */'));

test('the router mounts it under the strip with the address\'s room and crop; its title', () => {
  assert.ok(app.includes("import * as economics from './economics-page.js'; // ---- Economics ----"));
  assert.ok(app.includes(": route.name === 'economics' ? economics.mount(page, { room: route.room, crop: route.crop }) // ---- Economics ----"));
  assert.ok(page.includes('<h1 class="page-title" tabindex="-1">Economics</h1>'));
  assert.ok(page.includes('What one of your rooms makes a month with a crop, against the other ways to grow it or buy it in.'));
  assert.ok(page.includes("document.title = 'Economics · Mushroom farm';"));
});

test('it reads again on the events, a room\'s crops or name, the stream\'s return and a timer; stale answers dropped, an older app stops', () => {
  assert.ok(page.includes("const LISTEN = ['economics', 'harvest', 'sales', 'batches', 'costs'].filter((type) => EVENT_TYPES.includes(type));"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),"));
  assert.ok(page.includes('live.onStatus((up) => { if (up) reload.call(); }),'));
  assert.ok(page.includes("live.on('simulation', (d) => {"), 'the progress of its own run');
  assert.ok(page.includes('const reader = createReader({'), 'the Summary\'s reader: a sequence drops a stale answer, a missing route stops');
  assert.ok(page.includes('delay: () => fallbackMs(REFRESH_MS, live.connected()),'));
  assert.ok(page.includes('if (key === painted) return; // the same answer: nothing to paint'));
  assert.ok(page.includes("if (err.status === 404 && err.message === 'Room not found' && want.room !== null) {"));
  assert.ok(page.includes('That room is gone; showing ${reply.room.name}.'));
});

test('the cards in order: the headline, A month, each way, Figures; the selects; no rooms; the banner', () => {
  const at = (s) => page.indexOf(s);
  assert.ok(at('<label for="ec-room">Room</label>') < at('<label for="ec-crop">Crop</label>'));
  assert.ok(at('class="card ec-headline"') < at('<h2 id="ec-compare-title">A month, each way</h2>'));
  assert.ok(at('<h2 id="ec-compare-title">A month, each way</h2>') < at('<h2 id="ec-figures-title">Figures</h2>'));
  assert.ok(page.includes('No rooms yet. Economics plans with one of your rooms.'));
  assert.ok(page.includes('Rooms, to add one'));
  assert.ok(page.includes('<div class="banner" role="alert" hidden>'));
  assert.ok(page.includes("const keepAddress = () => history.replaceState(null, '', economicsHash({ room: reply.room?.id ?? null, crop: reply.crop }));"));
});

test('typing works the money out at once; a save on leaving the box; a refusal under it; no answer keeps it, not saved; Back to default', () => {
  assert.ok(page.includes("box.addEventListener('input', () => onType(f.key, box));"));
  assert.ok(page.includes("box.addEventListener('change', () => onSave(f.key, box));"));
  assert.ok(page.includes('if (t.error) return; // the refusal is under the box; nothing is sent'));
  assert.ok(page.includes("tag.textContent = 'Saving…';"));
  assert.ok(page.includes("request('PUT', '/api/economics/figures', { room: reply.room.id, crop: reply.crop, key, value: t.value })"));
  assert.ok(page.includes('notSaved.add(key); // the typed figure stays in the sums, marked not saved'));
  assert.ok(page.includes("box.setAttribute('aria-invalid', 'true');"));
  assert.ok(page.includes("box.setAttribute('aria-describedby', error.id);"));
  assert.ok(page.includes("request('DELETE', `/api/economics/figures?room=${reply.room.id}&crop=${reply.crop}&key=${encodeURIComponent(key)}`)"));
  assert.ok(page.includes("request('POST', '/api/economics/work-out', { room: reply.room.id, crop: reply.crop })"));
  assert.ok(page.includes("box.inputMode = def.whole ? 'numeric' : 'decimal';"));
});

test('a repaint keeps the cursor and never rewrites a box the owner is typing in', () => {
  assert.ok(page.includes('const typing = box && document.activeElement === box;'));
  assert.ok(page.includes('if (box && !typing && !draft.unsaved(f.key) && !draft.error(f.key)) box.value = boxText(f.value);'));
  assert.ok(page.includes('keepFocus(container, () => {'));
  assert.ok(page.includes("box.dataset.focusKey = `box:${f.key}`;"));
  assert.ok(page.includes('if (next !== shape) {'), 'the rows are rebuilt only for another room, crop or set of figures');
});

test('the styles: one .ec- block, tokens only (no colour of its own), the phone\'s blocks and 44 px taps', () => {
  assert.ok(ecCss.length > 500);
  assert.doesNotMatch(ecCss, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tokens only');
  assert.ok([...ecCss.matchAll(/^\s*([^@/\s][^{]*)\{/gm)].every((m) => m[1].split(/,(?![^(]*\))/).every((s) => /\.ec-/.test(s))), 'every rule is .ec-');
  assert.ok(ecCss.includes('@media (max-width: 600px)'));
  assert.ok(ecCss.includes('.ec-desk { display: none; }'));
  assert.ok(ecCss.includes('.ec-phone { display: grid; gap: 16px; }'));
  assert.ok(ecCss.includes('.ec-box { min-height: 44px; }'));
  // a link on its own (Change in Settings, Rooms) is a 44 px target; a source's link stays in its sentence (the inline exception)
  assert.ok(ecCss.includes('.ec-fig-field { flex-wrap: wrap; }'));
  assert.ok(ecCss.includes('.ec-fig-field .co-link, .ec-foot .co-link { display: inline-flex; align-items: center; min-height: 44px; white-space: nowrap; }'));
  assert.doesNotMatch(ecCss, /\.ec-(fig|note|note-line) \.co-link/);
});

test('the reviews\' notes: a new draft for another room or crop; a refusal kept by the page; the tariff\'s link; sources; the run\'s state; farm time', () => {
  // another room or crop: a new draft, its refusals and unsaved marks gone
  assert.ok(page.includes('if (next.room && reply && (next.room.id !== reply.room?.id || next.crop !== reply.crop)) {\n      draft = createDraft();'));
  // a refusal (400, its words) is the page's, under the box; the draft lets the refused value go; no answer or a server
  // fault keeps it in the sums, marked not saved
  assert.ok(page.includes('const serverErrors = new Map(); // key → the server\'s refusal of the last save'));
  assert.ok(page.includes('serverErrors.set(key, err.message);\n        draft.drop(key, t.value);'));
  assert.ok(page.includes('const text = serverErrors.get(key) ?? draft.error(key);'));
  assert.ok(page.includes('if (err.status === 0 || err.status >= 500) {'));
  // the tariff (Settings' figure): no box, its link in the box's place
  assert.ok(page.includes("field.append(el('span', 'ec-fig-value', ''), link('Change in Settings', '#/settings'));"));
  assert.ok(page.indexOf('if (def.settings) {') < page.indexOf("const box = el('input', 'ec-box');"));
  // a source with no url is plain words; one with a url opens in a new tab, rel="noopener"
  assert.ok(page.includes('s.url ? link(words, s.url, true) : words'));
  assert.ok(page.includes("a.target = '_blank';\n    a.rel = 'noopener';"));
  // Work it out's line is the view's sim.status, never the reply's HTTP status (202 even when the run ended at once)
  assert.ok(page.includes('const s = simText(reply.sim, f, {'));
  assert.ok(page.includes("const next = await request('POST', '/api/economics/work-out', { room: reply.room.id, crop: reply.crop });\n      if (alive()) show(next);"));
  assert.doesNotMatch(page, /\b20[02]\b/);
  // dates are economics-figures.js's (farm time): the page formats none of its own
  assert.doesNotMatch(page, /toLocale|formatDate|new Date\(/);
});

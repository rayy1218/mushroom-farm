// The Business summary page (web/business-page.js, spec 2026-11-06-business-summary-design.md 6): its mount under the strip,
// its reads, its cards and links, its styles. Source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('business-page.js');
const app = src('app.js');
const css = src('styles.css');
const smCss = css.slice(css.indexOf('/* ---- Summary (spec 2026-11-06-business-summary-design.md 6) ---- */'), css.indexOf('/* ---- end Summary ---- */'));

test('the router mounts the Summary under the strip, at #/business', () => {
  assert.ok(app.includes("import * as summary from './business-page.js'; // ---- Summary ----"));
  assert.ok(app.includes(": route.name === 'summary' ? summary.mount(page, {}) // ---- Summary ----"));
  assert.ok(page.includes('<h1 class="page-title" tabindex="-1">Summary</h1>'));
  assert.ok(page.includes("document.title = 'Business summary · Mushroom farm';"));
});

test('it reads the summary again on the modules\' events, a room\'s crops or name, the stream\'s return and a timer; a stale answer is dropped', () => {
  assert.ok(page.includes("const LISTEN = ['batches', 'inventory', 'sales', 'costs', 'harvest'].filter((type) => EVENT_TYPES.includes(type));"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),"));
  assert.ok(page.includes('live.onStatus((up) => { if (up) reload.call(); }),'));
  assert.ok(page.includes("const reply = await request('GET', '/api/business/summary');"));
  assert.ok(page.includes('if (!alive() || mine !== seq) return;'));
  assert.ok(page.includes('timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));'));
  assert.ok(page.includes('keepFocus(container, () => paint(reply));'), 'focus kept over a repaint');
});

test('three cards in order, Money first; each part says when its module could not be read', () => {
  const order = ['sm-money-title', 'sm-needs-title', 'sm-runs-title'].map((id) => page.indexOf(`id="${id}"`));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((i) => i > 0));
  assert.ok(page.includes('<a class="co-link" href="${COSTS_HASH}">Costs</a>'));
  assert.ok(page.includes('<a class="co-link" href="${RUNS_HASH}">Runs</a>'));
  assert.ok(page.includes("els.money.replaceChildren(el('p', 'none', readFailText('costs')));"));
  assert.ok(page.includes("els.runs.replaceChildren(el('p', 'none', readFailText('runs')));"));
  assert.ok(page.includes("parts.push(...needFailLines(r.errors).map((t) => el('p', 'none sm-failed', t)));"));
  assert.ok(page.includes("const none = lines.length ? null : needsEmpty(r.errors);"));
});

test('the money in Costs\' tiles\' look; a run page link named for its run; no runs: a link to the rooms', () => {
  assert.ok(page.includes("const tiles = el('div', 'us-tiles hv-tiles co-tiles');"));
  assert.ok(page.includes("if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn';"));
  assert.ok(page.includes("page.setAttribute('aria-label', row.label);"));
  assert.ok(page.includes("rooms.append(link('Rooms', ROOMS_HASH));"));
  assert.ok(page.includes("const ROOMS_HASH = '#/overview';"));
});

test('an older farm app or no answer: the banner says why; an older app stops the asking', () => {
  assert.ok(page.includes('const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);'));
  assert.ok(page.includes('outdated = routeMissing(err);'));
});

test('the styles: one .sm- block at the end, tokens only; Money across, then Needs you beside Runs from 900 px; 44 px taps', () => {
  assert.ok(smCss.length > 0);
  assert.ok(css.trimEnd().endsWith('/* ---- end Summary ---- */'));
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(smCss), false, 'no fixed colour');
  for (const rule of smCss.match(/[^{}]+\{[^}]*\}/g) ?? []) {
    const selector = rule.slice(0, rule.indexOf('{')).replace(/\/\*[^*]*\*\//g, '').trim();
    if (selector.startsWith('@media') || selector === '') continue;
    assert.match(selector, /\.sm-/, selector);
  }
  assert.ok(smCss.includes('.sm-page { display: grid; gap: 16px; align-items: start; }'));
  assert.ok(smCss.includes('grid-template-areas: "money money" "needs runs";'));
  assert.ok(smCss.includes('.sm-page .co-link { padding-block: 14px; }'));
  assert.ok(smCss.includes('.sm-need .co-link { display: block; padding-block: 12px; }'));
});

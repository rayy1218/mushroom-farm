// The Business summary page (web/business-page.js, spec 2026-11-06-business-summary-design.md 6): its mount under the strip,
// its reads, its cards and links, its styles. The focus kept over a repaint and the reads run for real (a small fake
// container, a stubbed read and timer); the rest source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keepFocus, keyOf, createReader } from '../web/business-page.js';
import { ApiError } from '../web/api.js';

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

test('it reads the summary again on the modules\' events, a room\'s crops or name, the stream\'s return and a timer', () => {
  assert.ok(page.includes("const LISTEN = ['batches', 'inventory', 'sales', 'costs', 'harvest'].filter((type) => EVENT_TYPES.includes(type));"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),"));
  assert.ok(page.includes('live.onStatus((up) => { if (up) reload.call(); }),'));
  assert.ok(page.includes("read: () => request('GET', '/api/business/summary'),"));
  assert.ok(page.includes('delay: () => fallbackMs(REFRESH_MS, live.connected()),'));
  assert.ok(page.includes('done: (reply) => keepFocus(container, () => paint(reply)),'), 'focus kept over a repaint');
});

// A node of the fake container: its focus key or address and words; focus() makes it the document's active element.
function fakeNode(doc, { key = null, href = null, text = '', tag = 'a' } = {}) {
  return {
    tag, textContent: text, dataset: key === null ? {} : { focusKey: key },
    getAttribute: (name) => (name === 'href' ? href : null),
    focus() { doc.activeElement = this; },
  };
}
function fakeContainer(doc) {
  const box = {
    nodes: [], h1: null,
    contains: (n) => n === box.h1 || box.nodes.includes(n),
    querySelectorAll: () => box.nodes.filter((n) => n.dataset.focusKey !== undefined || n.getAttribute('href')),
    querySelector: (sel) => (sel === 'h1' ? box.h1 : null),
  };
  box.h1 = fakeNode(doc, { tag: 'h1' });
  return box;
}

test('a repaint keeps the cursor on the same need (its focus key, whatever its words or address now), a use-by on its item', () => {
  const doc = { activeElement: null };
  const box = fakeContainer(doc);
  box.nodes = [fakeNode(doc, { key: 'low', href: '#/business/inventory/6', text: 'Low stock: Grow bags 120 pcs' }), fakeNode(doc, { key: 'use-by:8', href: '#/x/8' })];
  box.nodes[0].focus();
  keepFocus(box, () => {
    box.nodes = [fakeNode(doc, { key: 'use-by:8', href: '#/x/8' }), fakeNode(doc, { key: 'low', href: '#/business/inventory', text: 'Low stock: Grow bags and Gloves' })];
  }, doc);
  assert.equal(doc.activeElement, box.nodes[1], 'the low line, now two items and Inventory\'s list');
  assert.equal(keyOf(fakeNode(doc, { href: '#/business/costs', text: 'Costs' })), '#/business/costs|Costs', 'a head link: its address and words');
});

test('a repaint that removes the focused Retry (its part read this time) puts the cursor on the page\'s title', () => {
  const doc = { activeElement: null };
  const box = fakeContainer(doc);
  box.nodes = [fakeNode(doc, { key: 'retry:sales', tag: 'button' })];
  box.nodes[0].focus();
  keepFocus(box, () => { box.nodes = [fakeNode(doc, { key: 'owed', href: '#/business/sales' })]; }, doc);
  assert.equal(doc.activeElement, box.h1);
  doc.activeElement = null; // the cursor elsewhere on the page: a repaint leaves it
  keepFocus(box, () => { box.nodes = []; }, doc);
  assert.equal(doc.activeElement, null);
});

// ---- Economics (the audit, 2026-11-10, #11) ---- a page may name where the cursor goes when its element is gone
test('keepFocus: a fallback instead of the title, when the page gives one; the title by default, as before', () => {
  const doc = { activeElement: null };
  const box = fakeContainer(doc);
  const back = fakeNode(doc, { key: 'back:price', tag: 'button' });
  box.nodes = [fakeNode(doc, { key: 'note:price:0:1' })];
  box.nodes[0].focus();
  const seen = [];
  const watch = (n) => { const f = n.focus; n.focus = function () { seen.push(this.tag); f.call(this); }; return n; };
  watch(box.h1);
  keepFocus(box, () => { box.nodes = [watch(back)]; }, doc, () => back);
  assert.equal(doc.activeElement, back);
  assert.deepEqual(seen, ['button'], 'the title is never focused on the way');
  box.nodes[0].focus();
  keepFocus(box, () => { box.nodes = []; }, doc, () => null);
  assert.equal(doc.activeElement, box.h1, 'a fallback with nothing: the title');
  box.nodes = [fakeNode(doc, { key: 'x', tag: 'button' })];
  box.nodes[0].focus();
  keepFocus(box, () => { box.nodes = []; }, doc);
  assert.equal(doc.activeElement, box.h1, 'no fallback: the title, as every other page');
});

// The reads with a stubbed request and timer: each read a promise the test answers.
function reads(t, { alive = () => true } = {}) {
  const asked = [];
  const timers = [];
  const shown = [];
  const failed = [];
  const reader = createReader({
    read: () => new Promise((resolve, reject) => asked.push({ resolve, reject })),
    done: (reply) => shown.push(reply), failed: (err) => failed.push(err), delay: () => 60_000, alive,
    setTimer: (fn, ms) => { timers.push({ fn, ms, live: true }); return timers.length; }, clearTimer: (id) => { if (id) timers[id - 1].live = false; },
  });
  t.after(() => reader.stop());
  return { reader, asked, timers, shown, failed, armed: () => timers.filter((x) => x.live) };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('the reads: an older answer than the last asked is dropped; each answer sets the next read a minute on', async (t) => {
  const r = reads(t);
  r.reader.load();
  r.reader.load(); // an event while the first read is out
  r.asked[1].resolve({ n: 2 });
  await settle();
  r.asked[0].resolve({ n: 1 });
  await settle();
  assert.deepEqual(r.shown, [{ n: 2 }]);
  assert.deepEqual(r.armed().map((x) => x.ms), [60_000], 'one timer');
  r.armed()[0].fn();
  assert.equal(r.asked.length, 3, 'the timer reads again');
});

test('the reads: no answer is told and read again later; an older farm app is told and stops them; a gone page drops its answer', async (t) => {
  const r = reads(t);
  r.reader.load();
  r.asked[0].reject(new ApiError(0, null));
  await settle();
  assert.equal(r.failed.length, 1);
  assert.equal(r.armed().length, 1, 'tried again on the timer');
  r.reader.load();
  r.asked[1].reject(new ApiError(404, { error: 'Not found' }));
  await settle();
  assert.deepEqual([r.failed.length, r.armed().length], [2, 0]);
  r.reader.load();
  assert.equal(r.asked.length, 2, 'no more reads');
  let alive = true;
  const g = reads(t, { alive: () => alive });
  g.reader.load();
  alive = false;
  g.asked[0].resolve({ n: 1 });
  await settle();
  assert.deepEqual([g.shown, g.armed()], [[], []]);
});

test('three cards in order, Money first; each part not read says so in its own place, with Retry, and is said once', () => {
  const order = ['sm-money-title', 'sm-needs-title', 'sm-runs-title'].map((id) => page.indexOf(`id="${id}"`));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((i) => i > 0));
  assert.ok(page.includes('<a class="co-link" href="${COSTS_HASH}">Costs</a>'));
  assert.ok(page.includes('<a class="co-link" href="${RUNS_HASH}">Runs</a>'));
  assert.ok(page.includes("els.money.replaceChildren(failNode('p', '', readFailText('costs'), 'costs'));"));
  assert.ok(page.includes("els.runs.replaceChildren(failNode('p', '', readFailText('runs'), 'runs'));"));
  assert.ok(page.includes("li.append(failNode('p', 'sm-need-row', n.text, n.part));"));
  assert.ok(page.includes('retry.dataset.focusKey = `retry:${part}`;'));
  assert.ok(page.includes('<p class="sr-only" data-said aria-live="polite"></p>'));
  assert.ok(page.includes('const none = lines.length ? null : needsEmpty(r.errors);'));
  assert.ok(page.includes('els.needsTitle.textContent = needsTitle(count);'));
});

test('the money in Costs\' tiles\' look, two more on a wide desk; a need\'s whole line its link with its state; the container the run page\'s link; no runs: the rooms', () => {
  assert.ok(page.includes("const tiles = el('div', 'us-tiles hv-tiles co-tiles');"));
  assert.ok(page.includes("if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn';"));
  assert.ok(page.includes("nodes.slice(list.length).forEach((n) => n.classList.add('sm-wide'));"));
  assert.ok(page.includes('if (n.tone) li.dataset.tone = n.tone;'));
  assert.ok(page.includes("const a = el('a', 'sm-need-row sm-need-link');"));
  assert.ok(page.includes('a.dataset.focusKey = n.key;'));
  assert.ok(page.includes("room.setAttribute('aria-label', row.label);"));
  assert.ok(page.includes('room.dataset.focusKey = `run:${row.id}`;'));
  assert.ok(page.includes('rooms.append(link(ROOMS_LINK, ROOMS_HASH));'));
  assert.ok(page.includes("const ROOMS_HASH = '#/overview';"));
});

test('an older farm app or no answer: the banner says why', () => {
  assert.ok(page.includes('const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);'));
});

// Every rule's selector in a stretch of CSS, those inside an @media block too (each block opened and read on its own).
function selectorsOf(text) {
  const out = [];
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '');
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{', i);
    if (open < 0) break;
    const head = body.slice(i, open).replace(/[;}]/g, ' ').trim();
    let depth = 1;
    let j = open + 1;
    for (; j < body.length && depth; j++) depth += body[j] === '{' ? 1 : body[j] === '}' ? -1 : 0;
    if (head.startsWith('@media')) out.push(...selectorsOf(body.slice(open + 1, j - 1)));
    else out.push(head);
    i = j;
  }
  return out;
}

test('the styles: one marked .sm- block, tokens only; Money across, then Needs you beside Runs from 900 px; five tiles from 1100 px; 44 px taps', () => {
  assert.ok(smCss.length > 0);
  assert.ok(css.indexOf('/* ---- end Summary ---- */') > css.indexOf('/* ---- Summary (spec'), 'its end marker after its start');
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(smCss), false, 'no fixed colour');
  const selectors = selectorsOf(smCss);
  assert.ok(selectors.includes('.sm-money'), 'a rule inside a media block is read');
  for (const selector of selectors) assert.match(selector, /\.sm-/, selector);
  assert.equal(selectorsOf('@media (x) { .a { b: c; } .sm-b { d: e; } } .sm-c { f: g; }').join('|'), '.a|.sm-b|.sm-c', 'the first rule of a media block too');
  assert.ok(smCss.includes('.sm-page { display: grid; gap: 16px; align-items: start; }'));
  assert.ok(smCss.includes('grid-template-areas: "money money" "needs runs";'));
  assert.ok(smCss.includes('.sm-page :is(.card-head .co-link, .sm-room) { display: inline-flex; align-items: center; min-height: 44px; padding-block: 0; }'));
  assert.ok(smCss.includes('.sm-need-row { padding-block: 12px; }'));
  assert.ok(smCss.includes('.sm-foot .co-link { padding-block: 14px; }'));
  assert.ok(smCss.includes('.sm-need[data-tone="critical"] .sm-dot { background: var(--critical); }'), 'a state\'s colour from its token');
  assert.ok(smCss.includes('@media (min-width: 1100px) {\n  .sm-money .sm-wide { display: block; }'));
});

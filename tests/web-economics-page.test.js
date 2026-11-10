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
  assert.ok(page.includes("if (verdict === 'same') return verdict; // the same answer: nothing to paint"));
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
  assert.ok(page.includes('if (t.error) { // the refusal stays under the box with its text; the sums go back to the saved figure'), 'nothing is sent');
  assert.ok(page.includes("tag.textContent = 'Saving…';"));
  assert.ok(page.includes("request('PUT', '/api/economics/figures', { room: at.room.id, crop: at.crop, key, value: t.value })"));
  assert.ok(page.includes('notSaved.add(key); // the typed figure stays in the sums, marked not saved'));
  assert.ok(page.includes("box.setAttribute('aria-invalid', 'true');"));
  assert.ok(page.includes("request('DELETE', `/api/economics/figures?${new URLSearchParams({ room: at.room.id, crop: at.crop, key })}`)"));
  assert.ok(page.includes("request('POST', '/api/economics/work-out', { room: at.room.id, crop: at.crop })"));
  assert.ok(page.includes("box.inputMode = def.whole ? 'numeric' : 'decimal';"));
});

test('a repaint keeps the cursor and never rewrites a box the owner is typing in', () => {
  assert.ok(page.includes('const typing = box && document.activeElement === box;'));
  assert.ok(page.includes('keepFocus(container, paint, document, () => {'));
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
  // the box is a field: the shared field rules (40 px on a desk, 44 px on a phone, the refused outline), its own width and figures
  assert.ok(css.includes('.sim-crop-row select, .sim-crop-row input, .brand-top, .ec-box { min-height: 44px; }'), 'the phone\'s field rule after the field rules');
  assert.ok(css.includes('\n.ec-box, .field input, .yd-table input {\n  font: inherit;\n  min-height: 40px;'));
  assert.ok(css.includes('.field input[aria-invalid="true"]:focus-visible, .ec-box[aria-invalid="true"]:focus-visible { outline-color: var(--critical-text); }'));
  assert.ok(ecCss.includes('.ec-box { width: 9em; text-align: right; font-variant-numeric: tabular-nums; scroll-margin-top: 88px; }'));
  assert.doesNotMatch(ecCss, /\n\s*\.ec-box \{[^}]*(min-height|padding|border)/, 'the field rules give its height, padding and border');
  // a link on its own (Change in Settings, Rooms) is a 44 px row; a source's link in its sentence keeps its line (no padding:
  // it would overlap the next line's link; WCAG 2.5.8's inline exception)
  assert.ok(ecCss.includes('.ec-fig-field { flex-wrap: wrap; }'));
  assert.ok(ecCss.includes('.ec-fig-field .co-link, .ec-foot .co-link { display: inline-flex; align-items: center; min-height: 44px; white-space: nowrap; }'));
  assert.doesNotMatch(ecCss, /\.ec-note[^{]*\.co-link[^{]*\{[^}]*padding/, 'a source\'s link in its sentence has no padding over the next line');
  assert.doesNotMatch(ecCss, /\.ec-tag[^{]*\{[^}]*accent/, 'the source tag is a neutral chip, the owner\'s too');
  assert.ok(ecCss.includes('.ec-block-label { display: block;'));
});

test('the reviews\' notes: a new draft for another room or crop; a refusal kept by the page; the tariff\'s link; sources; the run\'s state; farm time', () => {
  // another room or crop: a new draft, its refusals and unsaved marks gone
  assert.ok(page.includes('if (next.room && reply && (next.room.id !== reply.room?.id || next.crop !== reply.crop)) {\n      draft = createDraft();'));
  // a refusal (400, its words) is the page's, under the box; the draft lets the refused value go; no answer or a server
  // fault keeps it in the sums, marked not saved
  assert.ok(page.includes('const refusals = new Map(); // key → the refusal kept under a box left with it (the box\'s own check or the server\'s)'));
  assert.ok(page.includes('refusals.set(key, err.message);\n        draft.drop(key, t.value);'));
  assert.ok(page.includes('const refused = refusals.get(key) ?? draft.error(key);'));
  assert.ok(page.includes('if (err.status === 0 || err.status >= 500) {'));
  // the tariff (Settings' figure): no box, its link in the box's place
  assert.ok(page.includes("field.append(el('span', 'ec-fig-value', ''), link('Change in Settings', '#/settings'));"));
  assert.ok(page.indexOf('if (def.settings) {') < page.indexOf("const box = el('input', 'ec-box');"));
  // a source with no url is plain words; one with a url opens in a new tab, rel="noopener"
  assert.ok(page.includes('s.url ? keyed(link(s.words, s.url, true), i) : s.words'));
  assert.ok(page.includes("a.target = '_blank';\n    a.rel = 'noopener';"));
  // Work it out's line is the view's sim.status, never the reply's HTTP status (202 even when the run ended at once)
  assert.ok(page.includes('const s = simText(reply.sim, f, {'));
  assert.ok(page.includes("const next = await request('POST', '/api/economics/work-out', { room: at.room.id, crop: at.crop });\n      if (!alive()) return;\n      if (!fitsWant(next, want)) return;\n      if (show(next, { act }) !== 'new') repaint();"));
  assert.doesNotMatch(page, /\b20[02]\b/);
  // dates are economics-figures.js's (farm time): the page formats none of its own
  assert.doesNotMatch(page, /toLocale|formatDate|new Date\(/);
});

test('the spec review\'s notes: replies through createReplies; a save that painted nothing repaints; Profit a month on a phone', () => {
  // replies: a read notes the actions before it; an action bumps it; a reply not wanted, older or the same is not painted
  assert.ok(page.includes('const replies = createReplies();'));
  assert.ok(page.includes('const verdict = replies.take(next, want, how);'));
  assert.ok(page.includes("read: async () => { const asked = replies.asked(); return { next: await request('GET', path()), asked }; },"));
  assert.ok(page.includes('done: ({ next, asked }) => show(next, { asked }),'));
  for (const action of ['onSave', 'onBack', 'onWorkOut']) {
    const body = page.slice(page.indexOf(`async function ${action}(`), page.indexOf('\n  }\n', page.indexOf(`async function ${action}(`)));
    assert.ok(body.includes('const act = replies.act();'), `${action} makes earlier reads stale and numbers itself`);
    assert.ok(body.includes('if (!fitsWant(next, want)) return;') && body.includes("if (show(next, { act }) !== 'new') repaint();"), action);
  }
  // a save's reply that a read already painted (the economics event comes first) repaints the tag itself
  assert.ok(page.includes("if (show(next, { act }) !== 'new') repaint(); // a read painted this answer first, while the tag said Saving…"));
  // the box: kept while focused, unsaved or refused
  assert.ok(page.includes('if (box && !keepsBox({ focused: typing, unsaved: draft.unsaved(f.key), refused: Boolean(draft.error(f.key) || refusals.has(f.key)) })) box.value = boxText(f.value);'));
  // the phone's block head: the way's name with "Profit a month" over its profit
  assert.ok(page.includes("profitNode.prepend(el('span', 'ec-block-label', profitRow.label));"));
});

test('the spec review\'s notes: Work it out\'s refusals shown and said; a failed save said; the dot; no unused import', () => {
  assert.ok(page.includes('simRefused = err.status === 0 ? OFFLINE : err.message;'));
  assert.ok(page.includes("parts.push(el('p', 'ec-note-line ec-warn', simRefused));"));
  assert.ok(page.includes('said(simRefused);'));
  assert.ok(page.includes('if (reply && simMoved(reply.sim, next.sim)) simRefused = null; // the run moved on: the refusal is old'));
  assert.ok(page.includes('said(`${figureOf(key).label}: couldn\'t save. Retry is under it.`);'));
  assert.ok(page.includes('said(err.message); // the refusal, as under the box'));
  assert.ok(page.includes('p.append(DOT, b);'));
  assert.doesNotMatch(page, /' · '/);
  assert.doesNotMatch(page, /cropShortName/);
});

test('the code review\'s notes: the cursor kept in its row; one Work it out at a time; the run\'s line as typed; the gone line', () => {
  // a note's links keyed by their row; a repaint that took the cursor out of its row puts it on Back to default, else the box
  assert.ok(page.includes('a.dataset.focusKey = noteLinkKey(key, line, i);'));
  assert.ok(page.includes('to = focusAfterRepaint({'));
  assert.ok(page.includes('return target ? row.querySelector(target) : null;'), 'keepFocus\'s fallback: the row\'s place, never the title on the way');
  // Work it out: one request at a time
  assert.ok(page.includes('if (workingOut) return; // one request at a time'));
  assert.ok(page.includes('workingOut = false;'));
  // the live progress: a run that moved on clears an old refusal
  assert.ok(page.includes('if (simMoved(reply.sim, sim)) simRefused = null;'));
  // the same answer returns before it replaces the reply (the live progress stays)
  const show = page.slice(page.indexOf('  function show(next, how'), page.indexOf('\n  }\n', page.indexOf('  function show(next, how')));
  assert.ok(show.indexOf("if (verdict === 'same') return verdict;") < show.indexOf('reply = next;'));
  // typing repaints the run's line (its block life follows the figures)
  const onType = page.slice(page.indexOf('  function onType('), page.indexOf('\n  }\n', page.indexOf('  function onType(')));
  assert.ok(onType.includes('paintSimRow();'));
  // the gone line shows only once the first room is read
  assert.ok(page.includes('reader.load().then(() => {\n          if (!reply?.room) return;\n          els.gone.textContent = `That room is gone; showing ${reply.room.name}.`;\n          els.gone.hidden = false;'));
  assert.doesNotMatch(page, /els\.gone\.hidden = false;\n\s+reader\.load/);
  // the folds worked out once a repaint
  const paintFigures = page.slice(page.indexOf('  function paintFigures('), page.indexOf('\n  }\n', page.indexOf('  function paintFigures(')));
  assert.equal(paintFigures.split('foldsOf(reply)').length - 1, 1);
});

test('the code re-review: Work it out\'s line keeps the cursor when its button goes, said once', () => {
  assert.ok(page.includes("p.tabIndex = -1;"));
  assert.ok(page.includes("p.dataset.focusKey = `sim:${f.key}`;"));
  assert.ok(page.includes("const target = { back: '.ec-back', box: '.ec-box', sim: '[data-sim-line]' }[to];"));
  // the progress repaint goes through the same keeper
  const simRow = page.slice(page.indexOf('  function paintSimRow('), page.indexOf('\n  }\n', page.indexOf('  function paintSimRow(')));
  assert.ok(simRow.includes('keepRowFocus(() => paintSim(node, f));'));
  // focus reads the line: the polite "Working it out" said in the same paint is taken back, so it is said once
  assert.ok(page.includes("if (to === 'sim' && simJustSaid) said(''); // the focused line says it; the polite line would say it twice"));
});

// ---- the Impeccable audit (2026-11-10, .impeccable/critique/2026-11-10-economics.md) ----
test('the audit #1: the result stays in view while typing (a sticky line atop Figures, its loss in words, hidden from a reader)', () => {
  assert.ok(page.includes('<p class="ec-now" data-now aria-hidden="true"></p>'));
  assert.ok(page.indexOf('data-now') < page.indexOf('class="muted ec-intro"'), 'atop the Figures card');
  assert.ok(page.includes('els.now.replaceChildren(...leadNodes(h.first));'), 'the headline\'s first sentence, its loss in words and colour');
  assert.match(ecCss, /\.ec-now \{ position: sticky; top: var\(--topbar-h\); z-index: 2;/);
  assert.ok(ecCss.includes('.ec-box { width: 9em; text-align: right; font-variant-numeric: tabular-nums; scroll-margin-top:'), 'a focused box clears the line');
});

test('the audit #7 #8 #9 #10: a refusal left is said and leaves the sums; the parts line in the headline; a box\'s unit and tag described; the saved line says the result', () => {
  // #7: leaving a refused box: said, the sums back on the saved figure, the text and its refusal kept
  assert.ok(page.includes('if (t.error) { // the refusal stays under the box with its text; the sums go back to the saved figure'));
  assert.ok(page.includes('refusals.set(key, t.error);\n      draft.drop(key);\n      said(t.error);'));
  // #8: the parts not read, in the headline card too
  assert.ok(page.includes('<p class="ec-parts" data-head-parts hidden></p>'));
  assert.ok(page.indexOf('data-head-parts') < page.indexOf('ec-compare-title'));
  // #9: the box's description: its refusal or check first, then its unit and its tag
  assert.ok(page.includes("const described = [error.hidden ? null : error, ...row.querySelectorAll('.ec-prefix, .ec-unit, .ec-tag')].filter((n) => n && n.textContent);"));
  assert.ok(page.includes("box.setAttribute('aria-describedby', described.map((n) => n.id).join(' '));"));
  // #10: the saved line with the result
  assert.ok(page.includes('said(savedText(key, t.value, next.room.name, next.crop, draft.results()[0]) + (warn ? ` ${warn}` : \'\'));'));
});

test('the audit #2 #6 #12 #14 #20 #22 #26: fold heads h3; an unusual figure checked; RM inside the box; a new tab said; the row\'s order; the run\'s end said; the gone line said', () => {
  assert.ok(page.includes("s.append(el('h3', 'ec-fold-title', foldHead(fold)));"));
  assert.ok(page.includes("const warn = refused ? null : likely(f, draft.unsaved(f.key) ? draft.values()[f.key] : f.source === 'owner' ? f.value : null);"));
  assert.ok(page.includes("error.classList.toggle('ec-warn', Boolean(!refused && warn));"));
  assert.ok(page.includes("if (prefix) wrap.append(Object.assign(el('span', 'ec-prefix', prefix), { id: `${box.id}-pre` }));"));
  assert.ok(page.includes("a.append(el('span', 'sr-only', ' (opens in a new tab)'));"));
  assert.ok(page.includes("row.append(label, field, tag, error, note);\n    if (f.key === 'yours.kwhBlock') row.append(el('div', 'ec-sim'));\n    row.append(applies);"));
  assert.ok(page.includes("if (n.back) p.append(' ', backNode(key));"));
  assert.ok(page.includes("if (ended && simEnded !== endKey) {"));
  assert.ok(page.includes('<p class="muted ec-gone" data-gone role="status" hidden></p>'));
});

test('the audit\'s styles: fold heads at card size, the measure, the empty card, the notes\' lines on a phone, the picks\' gap, the run\'s focus ring, one sub-line rule', () => {
  assert.ok(ecCss.includes('.ec-fold-head { font-size: var(--fs-md);'));
  assert.ok(ecCss.includes('.ec-page, .ec-picks { max-width: 1040px; }'), 'Inventory\'s item page\'s measure');
  assert.ok(ecCss.includes('.ec-empty { background: transparent; border-style: dashed; border-color: var(--border-strong); box-shadow: none; }'));
  assert.ok(ecCss.includes('.ec-note-line { line-height: 1.75; }'));
  assert.ok(ecCss.includes('.ec-picks { display: flex; flex-wrap: wrap; gap: 12px 16px;'));
  assert.ok(ecCss.includes('.ec-sim [data-sim-line]:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }'));
  assert.ok(ecCss.includes('.ec-way-room, .ec-sub { display: block; color: var(--muted); font-size: var(--fs-sm); font-weight: 400; }'));
  assert.ok(ecCss.includes('.ec-note > .ec-note-line { flex-basis: 100%; }'));
  // a phone: the tag beside the label, the box and its unit a row of their own (at 360 px "a kg" fell under the box)
  assert.ok(ecCss.includes('.ec-fig-label { grid-column: 1; grid-row: 1; }\n  .ec-tag { grid-column: 2; grid-row: 1; }\n  .ec-fig-field { grid-column: 1 / -1; grid-row: 2; }'));
});

// The Economics tab, #/business/economics?room=&crop= (spec 2026-11-06-economics-design.md 8 and 9): what one of the farm's
// rooms makes a month with a crop, against the other ways to grow it or buy it in. The server gives the figures and where
// each comes from; the page works the money out with the model (web/economics-model.js) on every keystroke, saves a figure
// when its box is left, and runs Work it out. It asks again on the economics, harvest, sales, batches and costs events, a
// room's crops or name, when the stream comes back, and on a timer (as the Summary); an answer older than the last asked is
// dropped, and so is a read asked before a save or a reply for a room or crop no longer picked; an older farm app stops the
// reads.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { economicsHash } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { keepFocus, createReader } from './business-page.js';
import { ECONOMICS_CROPS, figureOf, unitParts } from './economics-defaults.js';
import { blockLife, inputsOf } from './economics-model.js';
import { headline, rows, wayName, fillLine, sizedLine, neverLine, leftLine, figureText } from './economics-math.js';
import {
  foldsOf, foldHead, tagText, appliesText, noteParts, simText, sourcesLine, boxText, savedText, partsLine, createDraft,
  fitsWant, createReplies, keepsBox, simMoved, noteLinkKey, focusAfterRepaint, likely, sourceItems,
} from './economics-figures.js';
import { DOT } from './text-math.js';

const REFRESH_MS = 60_000;
const LISTEN = ['economics', 'harvest', 'sales', 'batches', 'costs'].filter((type) => EVENT_TYPES.includes(type));
const ROOMS_HASH = '#/overview'; // the Overview holds the rooms
const CROP_SELECT = { oyster: 'Grey oyster', pink: 'Pink oyster', woodear: 'Black jelly', lionsmane: "Lion's mane" };

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}
// A link in the Business pages' link look (Costs' .co-link).
const link = (text, href, newTab = false) => {
  const a = el('a', 'co-link', text);
  a.href = href;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener';
    a.append(el('span', 'sr-only', ' (opens in a new tab)'));
  }
  return a;
};
const idOf = (key) => `ec-f-${key.replace('.', '-')}`;
// The words of a failed read: an older farm app, no answer, or the server's own.
const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);

const PAGE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Economics</h1>
      <p class="page-sub">What one of your rooms makes a month with a crop, against the other ways to grow it or buy it in.</p>
    </div>
  </div>
  <div class="ec-picks" data-picks hidden>
    <div class="field ec-pick"><label for="ec-room">Room</label><select id="ec-room" data-room></select></div>
    <div class="field ec-pick"><label for="ec-crop">Crop</label><select id="ec-crop" data-crop></select></div>
  </div>
  <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
  <p class="sr-only" data-said aria-live="polite"></p>
  <p class="muted ec-gone" data-gone role="status" hidden></p>
  <div class="card ec-empty" data-empty hidden>
    <p class="none">No rooms yet. Economics plans with one of your rooms.</p>
    <p class="ec-foot"><a class="co-link" href="${ROOMS_HASH}">Rooms, to add one</a></p>
  </div>
  <div class="ec-page" data-body hidden>
    <section class="card ec-headline" aria-label="The month">
      <p class="ec-lead" data-lead></p>
      <p class="ec-second" data-second></p>
      <p class="muted ec-sources" data-sources></p>
      <p class="ec-parts" data-head-parts hidden></p>
    </section>
    <section class="card ec-compare" aria-labelledby="ec-compare-title">
      <div class="card-head"><h2 id="ec-compare-title">A month, each way</h2></div>
      <div data-table></div>
      <div class="ec-lines" data-lines></div>
    </section>
    <section class="card ec-figures" aria-labelledby="ec-figures-title">
      <div class="card-head"><h2 id="ec-figures-title">Figures</h2></div>
      <p class="ec-now" data-now aria-hidden="true"></p>
      <p class="muted ec-intro">Change a figure and the page works it out again as you type; it is saved for every device when you leave the box.</p>
      <p class="ec-parts" data-parts hidden></p>
      <div data-folds></div>
    </section>
  </div>`;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { room = null, crop = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = PAGE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    picks: q('[data-picks]'), room: q('[data-room]'), crop: q('[data-crop]'), banner: q('.banner'), bannerText: q('[data-banner-text]'),
    said: q('[data-said]'), gone: q('[data-gone]'), empty: q('[data-empty]'), body: q('[data-body]'), lead: q('[data-lead]'),
    second: q('[data-second]'), sources: q('[data-sources]'), table: q('[data-table]'), lines: q('[data-lines]'), parts: q('[data-parts]'),
    folds: q('[data-folds]'), now: q('[data-now]'), headParts: q('[data-head-parts]'),
  };
  document.title = 'Economics · Mushroom farm';
  let want = { room, crop }; // the room and crop asked for (null: the server's choice)
  let reply = null;
  let draft = createDraft();
  const replies = createReplies(); // which reply is painted: none stale, none for a room or crop no longer picked
  let shape = ''; // the figure rows' keys and room and crop: the rows are rebuilt only when it changes
  const said = (text) => { els.said.textContent = text; };

  // ---- The headline and the comparison: worked out in the browser from the figures (and what is typed) ----
  // The lead sentence's parts: a loss's figure in the critical text, its word ("loss") beside it.
  const leadNodes = (first) => first.map((p) => (typeof p === 'string' ? p : el('span', 'co-loss', p.text)));
  function paintMoney() {
    const results = draft.results();
    if (!results.length) return;
    const values = draft.values();
    const life = values.life;
    const h = headline(results, { room: reply.room.name, crop: reply.crop, life });
    els.lead.replaceChildren(...leadNodes(h.first));
    // the same sentence atop Figures, in view while typing (the audit, #1); a reader hears the result in the saved line
    els.now.replaceChildren(...leadNodes(h.first));
    els.second.textContent = h.second ?? '';
    els.second.hidden = !h.second;
    els.sources.textContent = sourcesLine(reply.figures);
    paintParts(els.headParts, 'retry-parts-head'); // a part not read, where the headline uses its fallback (the audit, #8)
    paintTable(results);
    const lines = [
      fillLine(results[0], { room: reply.room.name, blocks: values['yours.blocks'], first: values['yours.first'] }),
      neverLine(results, life),
      results.length > 1 ? sizedLine(reply.room.name, values['yours.blocks']) : null,
      leftLine(reply.crop),
    ].filter(Boolean);
    els.lines.replaceChildren(...lines.map((t) => el('p', 'muted ec-line', t)));
  }

  // A desk table (a column a way) and, on a phone, one small table a way, Your container first (CSS shows one of them).
  function paintTable(results) {
    const table = rows(results);
    const wrap = el('div', 'us-table-wrap ec-desk');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'A month, each way');
    wrap.tabIndex = 0;
    wrap.dataset.focusKey = 'region-compare';
    const t = el('table', 'us-table ec-table');
    t.append(el('caption', 'sr-only', 'A month, each way'));
    const head = el('tr');
    const corner = el('th', '');
    corner.scope = 'col';
    corner.append(el('span', 'sr-only', 'Figure'));
    head.append(corner);
    for (const r of results) {
      const th = el('th', 'num');
      th.scope = 'col';
      th.append(el('span', 'ec-way', wayName(r.way)));
      if (r.way === 'yours') th.append(el('span', 'ec-way-room', reply.room.name));
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const row of table) {
      const tr = el('tr');
      tr.dataset.row = row.key;
      const th = el('th', '', row.label);
      th.scope = 'row';
      tr.append(th);
      for (const c of row.cells) tr.append(cellNode('td', c));
      body.append(tr);
    }
    t.append(thead, body);
    wrap.append(t);
    // the phone's: a block a way, its head the way's name with Profit a month beside it
    const phone = el('div', 'ec-phone');
    const profitRow = table.find((x) => x.key === 'profit');
    results.forEach((r, i) => {
      const block = el('section', 'ec-block');
      const blockHead = el('div', 'ec-block-head');
      const name = el('h3', 'ec-block-name', wayName(r.way));
      if (r.way === 'yours') name.append(el('span', 'ec-way-room', reply.room.name));
      const profitNode = cellNode('p', profitRow.cells[i], 'ec-block-profit');
      profitNode.prepend(el('span', 'ec-block-label', profitRow.label));
      blockHead.append(name, profitNode);
      const bt = el('table', 'us-table ec-block-table');
      bt.append(el('caption', 'sr-only', `${wayName(r.way)}: a month`));
      const bb = el('tbody');
      for (const row of table.filter((x) => x.key !== 'profit')) {
        const tr = el('tr');
        const th = el('th', '', row.label);
        th.scope = 'row';
        tr.append(th, cellNode('td', row.cells[i]));
        bb.append(tr);
      }
      bt.append(bb);
      block.append(blockHead, bt);
      phone.append(block);
    });
    els.table.replaceChildren(wrap, phone);
  }
  // A cell: its figure, a loss in the critical text with "Loss" under it.
  function cellNode(tag, c, extra = '') {
    const node = el(tag, ['num', extra].filter(Boolean).join(' '));
    node.append(c.tone === 'loss' ? el('span', 'co-loss', c.text) : c.text);
    if (c.sub) node.append(el('span', 'ec-sub', c.sub));
    return node;
  }

  // ---- The Figures card ----
  // The rows are built when the room, crop or figures change; a repaint otherwise updates them in place and never rewrites
  // a box the owner is typing in (its text and its unsaved figure stay).
  // The warning of a part not read (spec 9.2), with its quiet Retry: in the headline card and atop Figures.
  function paintParts(node, focusKey) {
    const line = partsLine(reply.errors);
    node.hidden = !line;
    if (!line) return;
    const retry = el('button', 'bz-quiet', 'Retry');
    retry.type = 'button';
    retry.dataset.focusKey = focusKey;
    retry.addEventListener('click', () => reader.load());
    node.replaceChildren(el('span', '', line), retry);
  }
  function paintFigures() {
    paintParts(els.parts, 'retry-parts');
    const folds = foldsOf(reply);
    const next = JSON.stringify([reply.room.id, reply.crop, reply.figures.map((f) => f.key)]);
    if (next !== shape) {
      shape = next;
      els.folds.replaceChildren(...folds.map(foldNode));
    }
    for (const fold of folds) {
      const title = els.folds.querySelector(`[data-fold="${fold.way}"] > summary > h3`);
      if (title) title.textContent = foldHead(fold);
      for (const f of fold.figures) updateRow(f);
    }
  }
  function foldNode(fold) {
    const d = el('details', 'ec-fold');
    d.dataset.fold = fold.way;
    d.open = fold.open;
    const s = el('summary', 'part-title ec-fold-head');
    s.append(el('h3', 'ec-fold-title', foldHead(fold))); // a heading a reader can jump to (the audit, #2)
    d.append(s, ...fold.figures.map(rowNode));
    return d;
  }
  function rowNode(f) {
    const def = figureOf(f.key);
    const row = el('div', 'ec-fig');
    row.dataset.key = f.key;
    const label = el(def.settings ? 'span' : 'label', 'ec-fig-label', def.label); // Settings' figure has no box to name
    const field = el('div', 'ec-fig-field');
    if (def.settings) {
      field.append(el('span', 'ec-fig-value', ''), link('Change in Settings', '#/settings'));
    } else {
      const box = el('input', 'ec-box');
      box.id = idOf(f.key);
      label.htmlFor = box.id;
      box.type = 'text';
      box.inputMode = def.whole ? 'numeric' : 'decimal';
      box.autocomplete = 'off';
      box.dataset.focusKey = `box:${f.key}`;
      box.addEventListener('input', () => onType(f.key, box));
      box.addEventListener('change', () => onSave(f.key, box));
      // RM inside the box before the figure, the rest of the unit beside it (the audit, #12; DESIGN's unit inside the box)
      const { prefix, after } = unitParts(def.unit);
      const wrap = el('span', 'ec-boxwrap');
      if (prefix) wrap.append(Object.assign(el('span', 'ec-prefix', prefix), { id: `${box.id}-pre` }));
      if (prefix) box.classList.add('ec-has-prefix');
      wrap.append(box);
      field.append(wrap);
      field.append(Object.assign(el('span', 'ec-unit', after), { id: `${box.id}-unit` })); // empty for flushes: the boxes stay in one column
    }
    const tag = Object.assign(el('span', 'ec-tag'), { id: `${idOf(f.key)}-tag` });
    const error = el('p', 'ec-error');
    error.id = `${idOf(f.key)}-error`;
    error.hidden = true;
    const note = el('div', 'ec-note');
    const applies = el('p', 'muted ec-applies');
    // the row's note, then (electricity per block) Work it out's line, then where it applies (the audit, #20)
    row.append(label, field, tag, error, note);
    if (f.key === 'yours.kwhBlock') row.append(el('div', 'ec-sim'));
    row.append(applies);
    return row;
  }
  // A row's tag, box, note, applies and (electricity per block) simulator line, from the figure as the reply has it.
  function updateRow(f) {
    const row = els.folds.querySelector(`[data-key="${f.key}"]`);
    if (!row) return;
    const box = row.querySelector('.ec-box');
    const typing = box && document.activeElement === box;
    if (box && !keepsBox({ focused: typing, unsaved: draft.unsaved(f.key), refused: Boolean(draft.error(f.key) || refusals.has(f.key)) })) box.value = boxText(f.value);
    const value = row.querySelector('.ec-fig-value');
    if (value) value.textContent = figureText(f.key, f.value);
    const tag = row.querySelector('.ec-tag');
    if (!tag.dataset.saving) tag.textContent = draft.unsaved(f.key) && notSaved.has(f.key) ? 'Not saved' : tagText(f);
    tag.dataset.source = f.source;
    showError(f.key, row);
    const note = row.querySelector('.ec-note');
    const parts = noteParts(f, { room: reply.room.name, crop: reply.crop }).map((n, line) => noteNode(n, f.key, line));
    if (notSaved.has(f.key)) parts.unshift(retryNode(f.key));
    note.replaceChildren(...parts);
    row.querySelector('.ec-applies').textContent = appliesText(f, reply.room.name, reply.crop);
    const sim = row.querySelector('.ec-sim');
    if (sim) paintSim(sim, f);
  }
  // A note's line; its links keyed by the row (a source is cited by many rows: keepFocus must not find another row's).
  function noteNode(n, key, line) {
    const p = el('p', `ec-note-line${n.tone === 'warn' ? ' ec-warn' : ' muted'}`, n.text);
    const keyed = (a, i) => {
      a.dataset.focusKey = noteLinkKey(key, line, i);
      return a;
    };
    if (n.link) p.append(' ', keyed(link(n.link.text, n.link.href), 'link'));
    if (n.sources) {
      p.append(' Sources: ');
      // one link a page; two pages of one name told apart (the audit, #15)
      sourceItems(n.sources).forEach((s, i) => p.append(i ? ', ' : '', s.url ? keyed(link(s.words, s.url, true), i) : s.words));
      p.append('.');
    }
    if (n.back) p.append(' ', backNode(key)); // Back to default on its own line, the set figure's (the audit, #20)
    return p;
  }
  function backNode(key) {
    const b = el('button', 'bz-quiet ec-back', 'Back to default');
    b.type = 'button';
    b.dataset.focusKey = `back:${key}`;
    b.setAttribute('aria-label', `Back to default: ${figureOf(key).label}`);
    b.addEventListener('click', () => onBack(key));
    return b;
  }
  function retryNode(key) {
    const p = el('p', 'ec-note-line ec-warn', "Couldn't save");
    const b = el('button', 'bz-quiet', 'Retry');
    b.type = 'button';
    b.dataset.focusKey = `retry:${key}`;
    b.addEventListener('click', () => {
      const box = els.folds.querySelector(`[data-key="${key}"] .ec-box`);
      if (box) onSave(key, box);
    });
    p.append(DOT, b);
    return p;
  }
  // The line under a box: its refusal (aria-invalid), else a check of an unusual figure (the audit, #6: amber, allowed, the
  // box not invalid); the box's description is that line, then its unit and its source tag (the audit, #9).
  function showError(key, row = els.folds.querySelector(`[data-key="${key}"]`)) {
    const box = row?.querySelector('.ec-box');
    const error = row?.querySelector('.ec-error');
    const f = reply.figures.find((x) => x.key === key);
    if (!box || !error || !f) return;
    const refused = refusals.get(key) ?? draft.error(key);
    const warn = refused ? null : likely(f, draft.unsaved(f.key) ? draft.values()[f.key] : f.source === 'owner' ? f.value : null);
    const text = refused ?? warn;
    error.textContent = text ?? '';
    error.hidden = !text;
    error.classList.toggle('ec-warn', Boolean(!refused && warn));
    box.toggleAttribute('data-warn', Boolean(!refused && warn));
    if (refused) box.setAttribute('aria-invalid', 'true');
    else box.removeAttribute('aria-invalid');
    const described = [error.hidden ? null : error, ...row.querySelectorAll('.ec-prefix, .ec-unit, .ec-tag')].filter((n) => n && n.textContent);
    box.setAttribute('aria-describedby', described.map((n) => n.id).join(' '));
  }

  // The Electricity per block row's Work it out line (spec 6.3).
  let workingOut = false; // a Work it out request not yet answered
  let simSaid = null; // the run "Working it out" was said for
  let simJustSaid = false; // the run's line was said in this paint
  let simWatched = false; // this page asked for the run or saw it working: its end is said
  let simEnded = null; // the end that was said (run, status, time)
  let simRefused = null; // the words of the last Work it out the server refused or never answered
  function paintSim(node, f) {
    const values = draft.values();
    const s = simText(reply.sim, f, {
      room: reply.room.name, crop: reply.crop, life: blockLife(inputsOf(values, 'yours')), machinesNote: reply.machinesNote,
    });
    const p = el('p', `ec-note-line${s.tone === 'warn' ? ' ec-warn' : ' muted'}`, s.text);
    p.dataset.simLine = '';
    p.tabIndex = -1; // the cursor's place when its button goes (the run started)
    p.dataset.focusKey = `sim:${f.key}`;
    const parts = [p];
    if (simRefused) parts.push(el('p', 'ec-note-line ec-warn', simRefused));
    if (s.action) {
      const b = el('button', 'bz-quiet ec-work', s.action);
      b.type = 'button';
      b.dataset.focusKey = 'work-out';
      b.addEventListener('click', onWorkOut);
      parts.push(b);
    }
    node.replaceChildren(...parts);
    const working = reply.sim && (reply.sim.status === 'working' || reply.sim.status === 'waiting');
    if (working && simSaid !== reply.sim.simId) {
      simSaid = reply.sim.simId;
      simWatched = true;
      said('Working it out');
      simJustSaid = true;
    }
    // its end (the figure, or why it failed), said once when this page saw it start (the audit, #22)
    const ended = reply.sim && (reply.sim.status === 'done' || reply.sim.status === 'failed');
    const endKey = ended ? `${reply.sim.simId}:${reply.sim.status}:${reply.sim.at}` : null;
    if (ended && simEnded !== endKey) {
      if (simWatched) {
        said(s.text);
        simJustSaid = true;
      }
      simEnded = endKey;
      simWatched = false;
    }
  }
  // The line alone (typing changes the block life it names; the live progress), the cursor kept.
  function paintSimRow() {
    const node = els.folds.querySelector('[data-key="yours.kwhBlock"] .ec-sim');
    const f = reply.figures.find((x) => x.key === 'yours.kwhBlock');
    if (node && f) keepRowFocus(() => paintSim(node, f));
  }

  // ---- Typing, saving, back to default, Work it out ----
  const refusals = new Map(); // key → the refusal kept under a box left with it (the box's own check or the server's)
  const notSaved = new Set(); // keys whose save got no answer or a server fault
  function onType(key, box) {
    refusals.delete(key);
    draft.type(key, box.value);
    showError(key);
    paintMoney();
    paintSimRow();
  }
  // An action's room and crop, as a reply's (fitsWant): a failure for a room or crop no longer picked is dropped too.
  const here = () => ({ room: { id: reply.room.id }, crop: reply.crop });
  async function onSave(key, box) {
    const t = draft.type(key, box.value);
    if (t.error) { // the refusal stays under the box with its text; the sums go back to the saved figure (the audit, #7)
      refusals.set(key, t.error);
      draft.drop(key);
      said(t.error);
      showError(key);
      paintMoney();
      paintSimRow();
      return;
    }
    const at = here();
    const row = els.folds.querySelector(`[data-key="${key}"]`);
    const tag = row?.querySelector('.ec-tag');
    if (tag) {
      tag.dataset.saving = '1';
      tag.textContent = 'Saving…';
    }
    const act = replies.act(); // a read asked before this save is older than its reply
    try {
      const next = await request('PUT', '/api/economics/figures', { room: at.room.id, crop: at.crop, key, value: t.value });
      if (!alive()) return;
      if (tag) delete tag.dataset.saving;
      if (!fitsWant(next, want)) return; // another room or crop was picked meanwhile
      notSaved.delete(key);
      draft.drop(key, t.value); // only the value it saved: a newer one typed meanwhile stays
      if (show(next, { act }) !== 'new') repaint(); // a read painted this answer first, while the tag said Saving…
      // said with the result (out of view at the box) and, once, a check of an unusual figure
      const warn = likely(reply.figures.find((x) => x.key === key), t.value);
      said(savedText(key, t.value, next.room.name, next.crop, draft.results()[0]) + (warn ? ` ${warn}` : ''));
    } catch (err) {
      if (!alive()) return;
      if (tag) delete tag.dataset.saving;
      if (!fitsWant(at, want)) return;
      if (err.status === 0 || err.status >= 500) {
        notSaved.add(key); // the typed figure stays in the sums, marked not saved
        said(`${figureOf(key).label}: couldn't save. Retry is under it.`);
      } else { // a refusal (its words under the box, the box keeping the text): the refused figure leaves the sums
        refusals.set(key, err.message);
        draft.drop(key, t.value);
        said(err.message); // the refusal, as under the box
      }
      repaint();
    }
  }
  async function onBack(key) {
    const at = here();
    const act = replies.act();
    try {
      const next = await request('DELETE', `/api/economics/figures?${new URLSearchParams({ room: at.room.id, crop: at.crop, key })}`);
      if (!alive()) return;
      if (!fitsWant(next, want)) return;
      draft.drop(key);
      refusals.delete(key);
      notSaved.delete(key);
      if (show(next, { act }) !== 'new') repaint();
      // the box shows the figure it fell to (a repaint leaves a focused box alone), and keeps the cursor
      const box = els.folds.querySelector(`[data-key="${key}"] .ec-box`);
      if (box) {
        box.value = boxText(reply.figures.find((f) => f.key === key)?.value);
        box.focus({ preventScroll: true });
      }
      said(`${figureOf(key).label}: back to default.`);
    } catch (err) {
      if (alive() && fitsWant(at, want)) fail(err);
    }
  }
  async function onWorkOut() {
    if (workingOut) return; // one request at a time
    workingOut = true;
    const at = here();
    const act = replies.act();
    simRefused = null;
    simWatched = true; // its end is said
    try {
      const next = await request('POST', '/api/economics/work-out', { room: at.room.id, crop: at.crop });
      if (!alive()) return;
      if (!fitsWant(next, want)) return;
      if (show(next, { act }) !== 'new') repaint();
    } catch (err) {
      if (!alive() || !fitsWant(at, want)) return;
      // "Already working it out…", the queue's words, or no answer: under the button and said
      simRefused = err.status === 0 ? OFFLINE : err.message;
      said(simRefused);
      repaint();
    } finally {
      workingOut = false;
    }
  }

  // ---- Reads ----
  const keepAddress = () => history.replaceState(null, '', economicsHash({ room: reply.room?.id ?? null, crop: reply.crop }));
  function fillPicks() {
    const rooms = reply.rooms.map((r) => {
      const o = el('option', '', r.name);
      o.value = String(r.id);
      return o;
    });
    els.room.replaceChildren(...rooms);
    els.room.value = String(reply.room.id);
    if (!els.crop.options.length) {
      els.crop.replaceChildren(...ECONOMICS_CROPS.map((c) => {
        const o = el('option', '', CROP_SELECT[c]);
        o.value = c;
        return o;
      }));
    }
    els.crop.value = reply.crop;
  }
  // A paint, the cursor kept (keepFocus); one a paint took out of its figure's row goes to the row's place for it
  // (focusAfterRepaint: Work it out's line when its button went, Back to default when a research note's link went, else the
  // box), never the page's title.
  function keepRowFocus(paint) {
    const active = document.activeElement;
    const row = container.contains(active) ? active.closest('.ec-fig') : null;
    const inSim = Boolean(active?.closest('.ec-sim'));
    simJustSaid = false;
    let to = null;
    // keepFocus's fallback: the row's place, worked out after the paint, so the title is never focused on the way (the audit, #11)
    keepFocus(container, paint, document, () => {
      to = focusAfterRepaint({
        inRow: Boolean(row), rowKept: Boolean(row?.isConnected), stillInRow: false, hasBack: Boolean(row?.querySelector('.ec-back')), inSim,
      });
      const target = { back: '.ec-back', box: '.ec-box', sim: '[data-sim-line]' }[to];
      return target ? row.querySelector(target) : null;
    });
    if (to === 'sim' && simJustSaid) said(''); // the focused line says it; the polite line would say it twice
  }
  function repaint() {
    keepRowFocus(() => {
      paintMoney();
      paintFigures();
    });
  }
  // A reply: shown at once (an action's: how { act }, its number) or from a read (how { asked }: its note of the actions
  // before it).
  // → 'new' (painted), 'same' (the answer already painted) or 'drop' (stale, or for a room or crop no longer picked).
  function show(next, how = {}) {
    const verdict = replies.take(next, want, how);
    if (verdict === 'drop') return verdict;
    els.banner.hidden = true;
    if (verdict === 'same') return verdict; // the same answer: nothing to paint (the live progress stays)
    if (next.room && reply && (next.room.id !== reply.room?.id || next.crop !== reply.crop)) {
      draft = createDraft();
      refusals.clear();
      notSaved.clear();
      simRefused = null;
    }
    if (reply && simMoved(reply.sim, next.sim)) simRefused = null; // the run moved on: the refusal is old
    reply = next;
    if (!reply.room) {
      els.picks.hidden = true;
      els.body.hidden = true;
      els.empty.hidden = false;
      return verdict;
    }
    draft.use(reply);
    els.empty.hidden = true;
    els.picks.hidden = false;
    els.body.hidden = false;
    fillPicks();
    keepAddress();
    repaint();
    return verdict;
  }
  // No answer: the banner says why; what was shown stays (a first read that fails shows the banner alone).
  function fail(err) {
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }

  const path = () => `/api/economics${want.room || want.crop ? `?${[want.room ? `room=${want.room}` : '', want.crop ? `crop=${want.crop}` : ''].filter(Boolean).join('&')}` : ''}`;
  const reader = createReader({
    read: async () => { const asked = replies.asked(); return { next: await request('GET', path()), asked }; },
    done: ({ next, asked }) => show(next, { asked }),
    failed(err) {
      if (err.status === 404 && err.message === 'Room not found' && want.room !== null) {
        want = { room: null, crop: want.crop }; // the address's room is gone: the first room instead
        reader.load().then(() => {
          if (!reply?.room) return;
          els.gone.textContent = `That room is gone; showing ${reply.room.name}.`;
          els.gone.hidden = false;
        });
        return;
      }
      fail(err);
    },
    delay: () => fallbackMs(REFRESH_MS, live.connected()),
    alive,
  });
  const reload = createThrottle(() => { if (alive()) reader.load(); });
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => reload.call())),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }), // a run starts or ends; a room's name
    live.on('simulation', (d) => {
      // its progress words only; done or failed arrives as 'economics'
      if (!reply?.sim || d.id !== reply.sim.simId || (d.status !== 'running' && d.status !== 'queued')) return;
      const sim = { ...reply.sim, status: d.status === 'queued' ? 'waiting' : 'working', progress: d.progress };
      if (simMoved(reply.sim, sim)) simRefused = null;
      reply.sim = sim;
      paintSimRow();
    }),
    live.onStatus((up) => { if (up) reload.call(); }),
  ];
  const pick = () => {
    want = { room: Number(els.room.value) || null, crop: els.crop.value || null };
    els.gone.hidden = true;
    reader.load();
  };
  els.room.addEventListener('change', pick); // the crop picked stays: the same crop in another room
  els.crop.addEventListener('change', pick);
  q('[data-retry]').addEventListener('click', () => reader.load());
  reader.load();

  return function unmount() {
    mountSeq++;
    reader.stop();
    reload.cancel();
    for (const off of offLive) off();
  };
}

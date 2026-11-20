// The Economics tab, #/business/economics?room=&crop= (spec 2026-11-06-economics-design.md 8 and 9): what one of the farm's
// rooms makes a month with a crop, against the other ways to grow it or buy it in. The server gives the figures and where
// each comes from; the page works the money out with the model (web/economics-model.js) on every keystroke, saves a figure
// when its box is left, and runs Work it out. It asks again on the economics, harvest, sales, batches and costs events, a
// room's crops or name, when the stream comes back, and on a timer (as the Summary); an answer older than the last asked is
// dropped, and so is a read asked before a save or a reply for a room or crop no longer picked; an older farm app stops the
// reads.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { economicsHash, ECONOMICS_HASH } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { keepFocus, createReader } from './business-page.js';
import { ECONOMICS_CROPS, figureOf, unitParts, figureLabel } from './economics-defaults.js';
import { blockLife, inputsOf } from './economics-model.js';
import {
  headline, rows, wayName, fillLine, sizedLine, neverLine, leftLine, figureText, labourLine, tilesOf, stickyText, barsOf, compareChoices,
  phoneCaption, readerSentence,
} from './economics-math.js';
import {
  foldsOf, foldHead, appliesText, noteParts, simText, boxText, savedText, partsLine, createDraft,
  fitsWant, createReplies, keepsBox, simMoved, noteLinkKey, focusAfterRepaint, likely, sourceItems, labelOf, meterOf, meterText, limitFigure,
  limitWeekOf,
} from './economics-figures.js';
import { DOT } from './text-math.js';
import { paintPlans, paintTiles, paintBars, labelNodes, paintMap, paintSwing } from './economics-charts.js'; // ---- Economics stage 2 ----
import { swings } from './economics-swing.js';
import { mapOf, capOf } from './economics-map.js';

const REFRESH_MS = 60_000;
const LISTEN = ['economics', 'harvest', 'sales', 'batches', 'costs', 'inventory'].filter((type) => EVENT_TYPES.includes(type)); // inventory: Money truth
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
      <p class="page-sub">One room's month with a crop, against the other ways to grow or buy it.</p>
    </div>
    <div class="ec-picks" data-picks hidden>
      <div class="field ec-pick"><label for="ec-room">Room</label><select id="ec-room" data-room></select></div>
      <div class="field ec-pick"><label for="ec-crop">Crop</label><select id="ec-crop" data-crop></select></div>
    </div>
  </div>
  <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
  <p class="sr-only" data-said aria-live="polite"></p>
  <p class="muted ec-gone" data-gone role="status" hidden></p>
  <div class="card ec-empty" data-empty hidden>
    <p class="none">No rooms yet. Economics plans with one of your rooms.</p>
    <p class="ec-foot"><a class="co-link" href="${ROOMS_HASH}">Rooms, to add one</a></p>
  </div>
  <div class="ec-page" data-body hidden>
    <section class="card ec-headline" aria-label="The month" data-month>
      <p class="sr-only" data-sentence></p>
      <div class="us-tiles hv-tiles co-tiles ec-tiles" data-tiles></div>
      <p class="ec-meter" data-meter></p>
      <p class="ec-parts" data-head-parts hidden></p>
    </section>
    <div class="ec-rest">
    <p class="ec-sticky" data-sticky aria-hidden="true" hidden></p>
    <section class="card ec-compare" aria-labelledby="ec-compare-title">
      <div class="card-head"><h2 id="ec-compare-title">A month, each way</h2></div>
      <ol class="ec-bars" data-bars aria-label="Profit a month, each way"></ol>
      <div class="field ec-pair" data-pair hidden><label for="ec-pair">Compare with</label><select id="ec-pair" data-pair-pick></select></div>
      <div data-table></div>
      <div class="ec-lines" data-lines></div>
    </section>
    <section class="card ec-swing-card" aria-labelledby="ec-swing-title">
      <div class="card-head"><h2 id="ec-swing-title">What moves profit most</h2></div>
      <div class="ec-swing-body" data-swing></div>
    </section>
    <section class="card ec-map-card" aria-labelledby="ec-map-title">
      <div class="card-head"><h2 id="ec-map-title">Price × yield</h2></div>
      <p class="muted ec-intro ec-runs-intro" data-map-lead></p>
      <div class="ec-limit" data-limit></div>
      <div class="ec-map-body" data-map></div>
    </section>
    <section class="card ec-runs" aria-labelledby="ec-runs-title">
      <div class="card-head"><h2 id="ec-runs-title">Your runs against the plan</h2></div>
      <p class="muted ec-intro ec-runs-intro">Each run's figures against the figures saved when it started; its money a month at its own figures.</p>
      <div class="ec-runs-body" data-runs></div>
    </section>
    <section class="card ec-figures" aria-labelledby="ec-figures-title">
      <h2 class="ec-figures-head" id="ec-figures-title"><button type="button" class="ec-figures-toggle" aria-expanded="false" aria-controls="ec-figures-body" data-figures-toggle data-focus-key="figures-toggle">Figures</button></h2>
      <div class="ec-figures-body" id="ec-figures-body" data-figures-body hidden>
        <p class="muted ec-intro">Change a figure and the page works it out again as you type; it is saved for every device when you leave the box.</p>
        <p class="ec-parts" data-parts hidden></p>
        <div class="ec-folds" data-folds></div>
      </div>
    </section>
    </div>
  </div>`;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { room = null, crop = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = PAGE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    picks: q('[data-picks]'), room: q('[data-room]'), crop: q('[data-crop]'), banner: q('.banner'), bannerText: q('[data-banner-text]'),
    said: q('[data-said]'), gone: q('[data-gone]'), empty: q('[data-empty]'), body: q('[data-body]'), table: q('[data-table]'),
    lines: q('[data-lines]'), parts: q('[data-parts]'), folds: q('[data-folds]'), headParts: q('[data-head-parts]'), runs: q('[data-runs]'),
    month: q('[data-month]'), sentence: q('[data-sentence]'), tiles: q('[data-tiles]'), meter: q('[data-meter]'), sticky: q('[data-sticky]'),
    bars: q('[data-bars]'), pair: q('[data-pair]'), pairPick: q('[data-pair-pick]'),
    map: q('[data-map]'), mapLead: q('[data-map-lead]'), limit: q('[data-limit]'), swing: q('[data-swing]'),
    figuresToggle: q('[data-figures-toggle]'), figuresBody: q('[data-figures-body]'),
  };
  document.title = 'Economics · Mushroom farm';
  let want = { room, crop }; // the room and crop asked for (null: the server's choice)
  let reply = null;
  let draft = createDraft();
  const replies = createReplies(); // which reply is painted: none stale, none for a room or crop no longer picked
  let shape = ''; // the figure rows' keys and room and crop: the rows are rebuilt only when it changes
  const said = (text) => { els.said.textContent = text; };

  // ---- The month and the comparison: worked out in the browser from the figures (and what is typed) ----
  // A sentence's parts: a loss's figure in the critical text, its word ("loss") beside it.
  const leadNodes = (first) => first.map((p) => (typeof p === 'string' ? p : el('span', 'co-loss', p.text)));
  let markedWay = null; // stage 2: the way whose column a tap on its bar marked (4.2)
  let pairWay = null; // stage 2: the phone's other way (4.4); null: the best other way
  let slowTimer = null; // stage 2: the swing, the map and the runs wait for a pause in the typing (the UI check: a fifth of a second a key on a slow phone)
  // ---- Economics stage 2 ---- what you can sell caps the month everywhere (the owner, 2026-11-12), only when the owner has
  // typed it (the owner, 2026-11-13): the box as typed, else the saved limit; { sellCap } for the model, or nothing
  const limitWeek = () => limitWeekOf(reply.limit, draft.unsaved(LIMIT_KEY) ? draft.values()[LIMIT_KEY] : null);
  const capCtx = () => { const k = limitWeek(); return typeof k === 'number' ? { sellCap: capOf(k) } : {}; };
  function paintMoney({ later = false } = {}) {
    const results = draft.results(capCtx());
    if (!results.length) return;
    const values = draft.values();
    const life = values.life;
    const h = headline(results, { room: reply.room.name, crop: reply.crop, life });
    // ---- Economics stage 2 ---- (4.1) the sentence for a reader (the cap said too); the tiles say it again; the meter; the
    // sticky line
    const uncapped = results[0].capped ? draft.results()[0] : null; // the month if all it grows sold: the profit tile's caption
    const tiles = tilesOf(results, { room: reply.room.name, crop: reply.crop, type: reply.room.type, price: values.price, life, uncapped });
    els.sentence.textContent = readerSentence(h, results, { uncapped, kgWeek: limitWeek() });
    paintTiles(els.tiles, tiles, { onBest: showBar });
    paintMeter();
    const stickyWords = el('span', '', ''); // one inline run: a flex line would drop the spaces at its pieces' edges (the UI check)
    stickyWords.append(...leadNodes(stickyText(results[0])));
    els.sticky.replaceChildren(stickyWords);
    paintParts(els.headParts, 'retry-parts-head'); // a part not read, where the headline uses its fallback (the audit, #8)
    if (markedWay && !results.some((r) => r.way === markedWay)) markedWay = null;
    paintBars(els.bars, barsOf(results, reply.left ?? [], reply.crop, reply.room.type), { picked: markedWay, onPick: pickBar });
    paintPair(results);
    paintTable(results);
    const labour = labourLine(results[0], reply.room.name); // ---- Money truth ---- the workers' share and its hours
    const lines = [
      fillLine(results[0], { room: reply.room.name, blocks: values['yours.blocks'], first: values['yours.first'] }),
      neverLine(results, life),
      results.length > 1 ? sizedLine(reply.room.name, values['yours.blocks']) : null,
      leftLine(reply.crop),
    ].filter(Boolean);
    els.lines.replaceChildren(
      ...(labour ? [el('p', `ec-line ${labour.tone === 'warn' ? 'ec-warn' : 'muted'}`, labour.text)] : []),
      ...lines.map((t) => el('p', 'muted ec-line', t)),
    );
    clearTimeout(slowTimer);
    if (later) slowTimer = setTimeout(() => { if (alive() && reply?.room) keepRowFocus(paintSlow); }, 150);
    else paintSlow();
  }
  // ---- Economics stage 2 ---- what moves profit most (5.5), price × yield (6.5) and the runs (7.8), with the figures as typed
  function paintSlow() {
    if (!draft.results().length) return;
    const values = draft.values();
    const typedKeys = reply.figures.filter((f) => draft.unsaved(f.key)).map((f) => f.key);
    const people = typeof values['yours.workers'] === 'number' && typeof values['yours.workerMonth'] === 'number';
    paintSwing(els.swing, swings(reply.figures, values, { ...draft.context(), ...capCtx() }, { typed: typedKeys }), { room: reply.room.name, type: reply.room.type, figures: reply.figures, people, values }, swingState);
    paintPriceYield(values);
    paintRuns();
  }

  // ---- Your runs against the plan (stage 2, spec 2026-11-12-economics-stage-2-design.md 7.8): read on their own route, their
  // money worked out here with the plan's figures (a run before plans were kept: the figures now, typing included) ----
  let plansReply = null;
  const runState = { open: new Map(), failed: false, outdated: false, onRetry: () => plansReader.load() };
  const plansFit = (p) => Boolean(p && reply?.room && p.room.id === reply.room.id && p.crop === reply.crop);
  function paintRuns() {
    if (!reply?.room) return;
    paintPlans(els.runs, {
      view: plansFit(plansReply) ? plansReply : null, values: draft.values(), ctx: draft.context(), room: reply.room.name, crop: reply.crop,
    }, runState);
  }

  // A desk table (a column a way, capped at 760 px, the column a bar marked tinted) and, on a phone, one table of Your
  // container beside the way Compare with picks (stage 2, 4.4; CSS shows one of them).
  function paintTable(results) {
    const table = rows(results);
    const type = reply.room.type;
    const wrap = el('div', 'us-table-wrap ec-desk');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'A month, each way');
    wrap.tabIndex = 0;
    wrap.dataset.focusKey = 'region-compare';
    wrap.append(tableNode(results, table, results.map((_, i) => i), 'A month, each way'));
    // the phone's: Your container and one other way
    const other = pairOf(results);
    const phone = el('div', 'ec-phone');
    const cols = [0, ...(other ? [results.findIndex((r) => r.way === other)] : [])];
    phone.append(tableNode(results, table, cols, other ? phoneCaption('yours', other, type) : `A month: ${wayName('yours', { type })}`));
    els.table.replaceChildren(wrap, phone);
  }
  function tableNode(results, table, cols, caption) {
    const t = el('table', 'us-table ec-table');
    t.append(el('caption', 'sr-only', caption));
    const head = el('tr');
    const corner = el('th', '');
    corner.scope = 'col';
    corner.append(el('span', 'sr-only', 'Figure'));
    head.append(corner);
    const marked = (r) => (r.way === markedWay ? ' ec-on' : '');
    for (const i of cols) {
      const r = results[i];
      const th = el('th', `num${marked(r)}`);
      th.scope = 'col';
      th.dataset.way = r.way;
      th.append(el('span', 'ec-way', wayName(r.way, { type: reply.room.type })));
      if (r.way === 'yours') th.append(el('span', 'ec-way-room', reply.room.name));
      if (r.way === markedWay) th.append(el('span', 'ec-way-room', 'Shown'));
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
      for (const i of cols) tr.append(cellNode('td', row.cells[i], marked(results[i]).trim()));
      body.append(tr);
    }
    t.append(thead, body);
    return t;
  }
  // ---- Economics stage 2 ---- the phone's other way: the one picked, else the best other way (4.4)
  function pairOf(results) {
    const choices = compareChoices(results, reply.room.type);
    if (!choices.length) return null;
    return choices.some((c) => c.way === pairWay) ? pairWay : choices[0].way;
  }
  function paintPair(results) {
    const choices = compareChoices(results, reply.room.type);
    els.pair.hidden = choices.length < 2; // two ways: no choice to make
    const way = pairOf(results);
    const next = JSON.stringify(choices);
    if (els.pairPick.dataset.shape !== next) {
      els.pairPick.dataset.shape = next;
      els.pairPick.replaceChildren(...choices.map((c) => Object.assign(el('option', '', c.name), { value: c.way })));
    }
    if (way) els.pairPick.value = way;
  }
  // The meter (4.3): the figures that make Your container's month by tier; with none yours, where to set them.
  function paintMeter() {
    const m = meterText(meterOf(reply.figures));
    els.meter.replaceChildren(m.text);
    if (m.setYours) {
      const go = el('button', 'ec-inline', 'Figures');
      go.type = 'button';
      go.dataset.focusKey = 'meter-figures';
      go.addEventListener('click', () => {
        setFiguresOpen(true);
        els.figuresToggle.focus();
        els.figuresToggle.scrollIntoView({ block: 'start' });
      });
      els.meter.append(`${DOT}set yours in `, go, ' below');
    }
  }
  // ---- Price × yield (stage 2, 6.5): the map of Your container's profit, capped by what you can sell (its own Figures
  // row at the top of the card) ----
  const swingState = { all: false, onToggle: () => { swingState.all = !swingState.all; keepRowFocus(paintMoney); }, goTo: (key) => goToFigure(key) };
  const LIMIT_KEY = 'market.kgWeek';
  const figureByKey = (key) => (key === LIMIT_KEY ? limitFigure(reply.limit, reply.errors) : reply.figures.find((x) => x.key === key));
  const pickedLine = el('p', 'ec-map-picked'); // seen; said on the page's polite line only when a cell is picked (the UI check)
  const mapState = { picked: { row: 3, col: 3 }, onPick: pickCell, line: pickedLine };
  let limitShape = '';
  function paintPriceYield(values) {
    els.mapLead.textContent = `${reply.room.name}'s profit a month at selling prices and yields around yours now, the rest held.`;
    const shapeNow = `${reply.room.id}/${reply.crop}`;
    if (limitShape !== shapeNow) {
      limitShape = shapeNow;
      els.limit.replaceChildren(rowNode(limitFigure(reply.limit, reply.errors)));
    }
    updateRow(limitFigure(reply.limit, reply.errors));
    const map = mapOf(values, draft.context(), { kgWeek: limitWeek() }); // now's cell: the month the tiles show
    paintMap(els.map, map, mapState);
  }
  // A cell picked (a tap or Enter): the map alone painted again, its line said (the review: not the whole page).
  function pickCell(row, col) {
    mapState.picked = { row, col };
    keepRowFocus(() => paintPriceYield(draft.values()));
    said(pickedLine.textContent);
  }

  // ---- Economics stage 2 ---- Figures starts folded; one tap opens it; the choice kept on the device (the owner, 2026-11-12)
  const FIGURES_KEY = 'farm.economics.figures';
  function setFiguresOpen(open, keep = true) {
    els.figuresToggle.setAttribute('aria-expanded', String(open));
    els.figuresBody.hidden = !open;
    if (keep) try { localStorage.setItem(FIGURES_KEY, open ? 'open' : 'closed'); } catch { /* not kept: folded next time */ }
  }
  let figuresOpen = false;
  try { figuresOpen = localStorage.getItem(FIGURES_KEY) === 'open'; } catch { /* folded */ }
  setFiguresOpen(figuresOpen, false);
  els.figuresToggle.addEventListener('click', () => setFiguresOpen(els.figuresBody.hidden));
  // A figure's name in What moves profit most or Set these first: Figures opened, its fold too, the cursor on its box.
  function goToFigure(key) {
    setFiguresOpen(true);
    const row = container.querySelector(`[data-key="${key}"]`);
    if (!row) return;
    const fold = row.closest('details');
    if (fold) fold.open = true;
    const box = row.querySelector('.ec-box') ?? row.querySelector('a, button');
    row.scrollIntoView({ block: 'center' });
    box?.focus({ preventScroll: true });
  }

  // A bar tapped: its column marked in the table and, on a phone, the way beside Your container.
  function pickBar(way) {
    markedWay = way === markedWay ? null : way;
    if (way !== 'yours' && markedWay) pairWay = way;
    keepRowFocus(paintMoney);
    if (markedWay) said(`${wayName(way, { type: reply.room.type })} shown in the table.`);
  }
  // Tile 4: to its bar, the cursor on it.
  function showBar(way) {
    const b = els.bars.querySelector(`[data-way="${way}"] button`);
    if (b) b.focus();
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
    const label = el(def.settings ? 'span' : 'label', 'ec-fig-label', figureLabel(f.key, reply.room.type)); // Settings' figure has no box to name
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
    const row = container.querySelector(`[data-key="${f.key}"]`);
    if (!row) return;
    const box = row.querySelector('.ec-box');
    const typing = box && document.activeElement === box;
    if (box && !keepsBox({ focused: typing, unsaved: draft.unsaved(f.key), refused: Boolean(draft.error(f.key) || refusals.has(f.key)) })) box.value = boxText(f.key, f.value);
    const value = row.querySelector('.ec-fig-value');
    if (value) value.textContent = figureText(f.key, f.value);
    const tag = row.querySelector('.ec-tag');
    // stage 2 (4.3): a label in its tier, its row ruled by it; Saving… and Not saved keep the neutral look
    const label = labelOf(f);
    row.dataset.tier = label.tier;
    if (!tag.dataset.saving) {
      const unsavedMark = draft.unsaved(f.key) && notSaved.has(f.key);
      tag.dataset.tier = unsavedMark ? 'app' : label.tier;
      tag.replaceChildren(...(unsavedMark ? ['Not saved'] : labelNodes(label)));
    }
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
    if (typeof n.use === 'number') p.append(' ', useNode(key, n.use)); // stage 2: Your sales' week as the limit, one tap
    return p;
  }
  // Use this: the suggestion into the box, saved as if typed and left (the owner, 2026-11-13).
  function useNode(key, value) {
    const b = el('button', 'bz-quiet ec-back', 'Use this');
    b.type = 'button';
    b.dataset.focusKey = `use:${key}`;
    b.setAttribute('aria-label', `Use this: ${figureLabel(key, reply.room.type)} ${figureText(key, value)}`);
    b.addEventListener('click', () => {
      const box = container.querySelector(`[data-key="${key}"] .ec-box`);
      if (!box) return;
      box.value = boxText(key, value);
      onSave(key, box);
    });
    return b;
  }
  function backNode(key) {
    const b = el('button', 'bz-quiet ec-back', 'Back to default');
    b.type = 'button';
    b.dataset.focusKey = `back:${key}`;
    b.setAttribute('aria-label', `Back to default: ${figureLabel(key, reply.room.type)}`);
    b.addEventListener('click', () => onBack(key));
    return b;
  }
  function retryNode(key) {
    const p = el('p', 'ec-note-line ec-warn', "Couldn't save");
    const b = el('button', 'bz-quiet', 'Retry');
    b.type = 'button';
    b.dataset.focusKey = `retry:${key}`;
    b.addEventListener('click', () => {
      const box = container.querySelector(`[data-key="${key}"] .ec-box`);
      if (box) onSave(key, box);
    });
    p.append(DOT, b);
    return p;
  }
  // The line under a box: its refusal (aria-invalid), else a check of an unusual figure (the audit, #6: amber, allowed, the
  // box not invalid); the box's description is that line, then its unit and its source tag (the audit, #9).
  function showError(key, row = container.querySelector(`[data-key="${key}"]`)) {
    const box = row?.querySelector('.ec-box');
    const error = row?.querySelector('.ec-error');
    const f = figureByKey(key);
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
  let typeFrame = null;
  function onType(key, box) {
    refusals.delete(key);
    draft.type(key, box.value);
    showError(key);
    // one paint a frame however fast the keys come (the UI check); the slow parts after a pause
    if (typeFrame === null) {
      typeFrame = requestAnimationFrame(() => {
        typeFrame = null;
        if (!alive() || !reply?.room) return;
        paintMoney({ later: true });
        paintSimRow();
      });
    }
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
    const row = container.querySelector(`[data-key="${key}"]`);
    const tag = row?.querySelector('.ec-tag');
    if (tag) {
      tag.dataset.saving = '1';
      tag.dataset.tier = 'app';
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
      const warn = likely(figureByKey(key), t.value);
      said(savedText(key, t.value, next.room.name, next.crop, draft.results(capCtx())[0], next.room.type) + (warn ? ` ${warn}` : ''));
    } catch (err) {
      if (!alive()) return;
      if (tag) delete tag.dataset.saving;
      if (!fitsWant(at, want)) return;
      if (err.status === 0 || err.status >= 500) {
        notSaved.add(key); // the typed figure stays in the sums, marked not saved
        said(`${figureLabel(key, reply.room.type)}: couldn't save. Retry is under it.`);
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
      const box = container.querySelector(`[data-key="${key}"] .ec-box`);
      if (box) {
        box.value = boxText(key, figureByKey(key)?.value);
        box.focus({ preventScroll: true });
      }
      said(`${figureLabel(key, reply.room.type)}: back to default.`);
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
    const moved = next.room && (!reply?.room || next.room.id !== reply.room.id || next.crop !== reply.crop); // stage 2: the runs asked again
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
    if (moved) {
      mapState.picked = { row: 3, col: 3 };
      markedWay = null;
      pairWay = null;
      plansReply = null;
      runState.open.clear();
      runState.failed = false;
    }
    repaint();
    if (moved && !runState.outdated) plansReader.load();
    return verdict;
  }
  // No answer: the banner says why; what was shown stays (a first read that fails shows the banner alone).
  function fail(err) {
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }

  const path = () => `/api/economics${economicsHash(want).slice(ECONOMICS_HASH.length)}`; // the address's query, as economicsHash builds it
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
  // the runs: asked when the room or crop changes, on the same events and timer, never after a save (a save changes only
  // the figures now, which the page holds)
  const plansReader = createReader({
    read: () => request('GET', `/api/economics/plans?${new URLSearchParams({ room: reply.room.id, crop: reply.crop })}`),
    done(next) {
      if (!plansFit(next)) return; // for a room or crop no longer picked
      plansReply = next;
      runState.failed = false;
      keepRowFocus(paintRuns);
    },
    failed(err) {
      if (routeMissing(err)) runState.outdated = true; // an older farm app: the reads stop
      else runState.failed = true;
      keepRowFocus(paintRuns);
    },
    delay: () => fallbackMs(REFRESH_MS, live.connected()),
    alive: () => alive() && Boolean(reply?.room),
  });
  const reload = createThrottle(() => {
    if (!alive()) return;
    reader.load();
    if (reply?.room) plansReader.load();
  });
  // a figure saved or Work it out tells 'economics' without plan: the view alone (the review: a save never reads the runs)
  const reloadView = createThrottle(() => { if (alive()) reader.load(); });
  const offLive = [
    ...LISTEN.map((type) => live.on(type, (d) => (type === 'economics' && !d?.plan ? reloadView.call() : reload.call()))),
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
  els.pairPick.addEventListener('change', () => { // stage 2 (4.4): the phone's other way, said
    pairWay = els.pairPick.value;
    keepRowFocus(paintMoney);
    said(`Comparing with ${els.pairPick.selectedOptions[0]?.textContent ?? ''}`);
  });
  // stage 2 (4.1): the sticky line only while the month's tiles are out of view
  const watchTiles = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([e]) => { els.sticky.hidden = e.isIntersecting; }, {
      rootMargin: `-${parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'), 10) || 56}px 0px 0px 0px`, // under the top bar
    }) : null;
  watchTiles?.observe(els.month);
  els.room.addEventListener('change', pick); // the crop picked stays: the same crop in another room
  els.crop.addEventListener('change', pick);
  q('[data-retry]').addEventListener('click', () => reader.load());
  reader.load();

  return function unmount() {
    mountSeq++;
    reader.stop();
    plansReader.stop();
    watchTiles?.disconnect();
    clearTimeout(slowTimer);
    if (typeFrame !== null) cancelAnimationFrame(typeFrame);
    mapState.resize?.disconnect();
    reload.cancel();
    reloadView.cancel();
    for (const off of offLive) off();
  };
}

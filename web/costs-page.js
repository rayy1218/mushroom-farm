// The Costs page, #/business/costs (spec 2026-11-05-costs-design.md 6): a month's profit, income and costs, the months'
// profit, the costs by category, the month's entries, the monthly items and the runs with their whole figures. It asks for
// GET /api/costs/month on the costs, harvest, sales, batches and inventory events (those the app knows), a room's crops or
// name, when the stream comes back, and on a timer (as Harvest); the costs and rooms lists (the dialogs') only at first and on
// the costs and room events. The month steps in place (the address keeps it, as Harvest keeps its period): the page, its
// scroll and the focus stay.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { costsHash } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { tileNodes } from './harvest-card.js';
import { closeTaskDialog } from './task-dialogs.js';
import {
  monthTitle, addMonths, monthTiles, monthNotes, categoryRows, categoryTotal, entryLine, repeatingLine, RUN_COLUMNS, runRow, runParts,
  profitBars, BARS_M, chartMonths, chartTitle, noFigures,
} from './costs-math.js';
import { openAddDialog, openEditDialog, openChangeDialog, openStopDialog } from './costs-dialogs.js';

const REFRESH_MS = 60_000;
const LISTEN = ['costs', 'harvest', 'sales', 'batches', 'inventory'].filter((type) => EVENT_TYPES.includes(type));
const NS = 'http://www.w3.org/2000/svg';
const CHART_H = 190;
const LABEL_MIN = 30; // a month's slot narrower than this (a phone) names every other month
const PENDING_H = 24; // a month still being worked out: a hatched stub over the zero line
const LOADING = 'The costs are still loading. Try again in a moment.';

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Costs</h1>
      <p class="page-sub">What the farm spends, what it makes, and each run’s profit.</p>
    </div>
    <div class="co-tools">
      <nav class="co-month" aria-label="Month">
        <button type="button" class="co-step" data-prev aria-label="Previous month"><span aria-hidden="true">‹</span></button>
        <span class="co-month-name" data-month aria-live="polite"></span>
        <button type="button" class="co-step" data-next aria-label="Next month"><span aria-hidden="true">›</span></button>
      </nav>
      <button type="button" class="primary" data-add>Add a cost</button>
    </div>
  </div>
  <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
  <div class="co-page" data-body hidden>
    <section class="card co-month-card" aria-labelledby="co-month-title">
      <h2 id="co-month-title" data-title></h2>
      <div class="us-tiles hv-tiles co-tiles" data-tiles></div>
      <ul class="co-notes" data-notes></ul>
      <h3 class="co-chart-title" id="co-chart-title" data-chart-title></h3>
      <div class="co-chart" data-chart></div>
    </section>
    <section class="card co-entries-card" aria-labelledby="co-entries-title"><h2 id="co-entries-title">Entries</h2><div class="co-list-box" data-entries></div></section>
    <section class="card co-cat-card" aria-labelledby="co-cat-title"><h2 id="co-cat-title">By category</h2><div data-categories></div></section>
    <section class="card co-repeat-card" aria-labelledby="co-repeat-title"><h2 id="co-repeat-title">Monthly items</h2><div class="co-list-box" data-repeating></div></section>
    <section class="card co-runs-card" aria-labelledby="co-runs-title"><h2 id="co-runs-title">Runs</h2><div data-runs></div></section>
  </div>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}
function svg(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
// A quiet button (Harvest's Edit); key: where the focus goes back to after a repaint.
const quietButton = (label, key, onClick, name = null) => {
  const b = el('button', 'tk-quiet co-quiet', label);
  b.type = 'button';
  b.dataset.focusKey = key;
  if (name) b.setAttribute('aria-label', name);
  b.addEventListener('click', onClick);
  return b;
};
// A plain click (not one opening a new tab) on a month link.
const plainClick = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
// A note's line: its kind on it; a price left out in the warning tone.
const noteNode = (tag, className, n) => {
  const node = el(tag, `${className} ${n.warn ? 'co-note-warn' : 'muted'}`, n.text);
  node.dataset.kind = n.kind;
  return node;
};

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { month = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    prev: q('[data-prev]'), next: q('[data-next]'), month: q('[data-month]'), add: q('[data-add]'), banner: q('.banner'),
    bannerText: q('[data-banner-text]'), retry: q('[data-retry]'), body: q('[data-body]'), title: q('[data-title]'),
    tiles: q('[data-tiles]'), notes: q('[data-notes]'), chartTitle: q('[data-chart-title]'), chart: q('[data-chart]'),
    categories: q('[data-categories]'), entries: q('[data-entries]'), repeating: q('[data-repeating]'), runs: q('[data-runs]'),
  };
  document.title = 'Costs · Mushroom farm';

  let shown = month; // the month asked for: null for this month
  let view = null; // GET /api/costs/month of the month on show
  let costs = []; // GET /api/costs: the rows the edit dialogs open
  let rooms = [];
  let listsStale = true; // costs and rooms to be read with the next month (at first, and on the costs and room events)
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';
  let other = new Map(); // month → a promise of its runs (the Add dialog's "where it lands" for a date in another month)
  const open = new Set(); // the runs whose breakdown is open

  const current = () => view?.today.slice(0, 7) ?? null;
  const wanted = () => shown ?? current(); // the month the head names

  function showError(text) {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  }

  // The focus goes back to the control it was on (by its key) after fn repaints a part.
  function keepFocus(fn) {
    const key = container.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;
    fn();
    if (key) container.querySelector(`[data-focus-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    const asked = shown;
    const lists = listsStale;
    try {
      const [v, list, roomList] = await Promise.all([
        request('GET', `/api/costs/month${asked ? `?month=${asked}` : ''}`),
        lists ? request('GET', '/api/costs') : null,
        lists ? request('GET', '/api/rooms') : null,
      ]);
      if (!alive() || mine !== seq) return;
      view = v;
      if (lists) {
        costs = list.costs;
        rooms = roomList.map((r) => ({ id: r.id, name: r.name })); // GET /api/rooms: the rooms as a list
        listsStale = false;
      }
      other = new Map();
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      if (err.status === 400 && err.field === 'month' && asked !== null) { // a bookmark out of the months kept: this month
        shown = null;
        history.replaceState(null, '', costsHash(null));
        load();
        return;
      }
      // the figures on show stay dimmed while the head names another month (never another month's figures under its name)
      if (view && view.month === wanted()) els.body.removeAttribute('aria-busy');
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!live.connected()) listsStale = true; // no events to say the lists changed
      load();
    }, fallbackMs(REFRESH_MS, live.connected()));
  }

  const reload = createThrottle(() => { if (alive()) load(); });
  const reloadAll = () => {
    listsStale = true;
    reload.call();
  };

  // A month's runs for the Add and Edit dialogs: the month on show's, else asked once per load (a refusal asked again).
  function runsIn(m) {
    if (!view) return Promise.resolve(null);
    if (m === view.month) return Promise.resolve(view.runs);
    if (m < view.first || m > current()) return Promise.resolve(null);
    if (!other.has(m)) {
      const answer = request('GET', `/api/costs/month?month=${m}`).then((v) => v.runs);
      answer.catch(() => { if (other.get(m) === answer) other.delete(m); });
      other.set(m, answer);
    }
    return other.get(m);
  }
  const dialogOpts = () => ({
    rooms, today: view.today, first: view.first, month: view.month, runsIn, onDone: () => reload.call(), onLost: showError, alive,
  });
  // A cost's row for its dialog; a row not in the list (the list is older than the month): read both again.
  function costOr(id) {
    const c = costs.find((x) => x.id === id);
    if (!c) reloadAll();
    return c;
  }
  function openAdd() {
    if (view) openAddDialog(dialogOpts());
    else if (els.banner.hidden) showError(LOADING);
  }

  // Another month, in place: its name and arrows at once, the figures dimmed until its answer comes.
  function go(m) {
    shown = m === current() ? null : m;
    history.replaceState(null, '', costsHash(shown));
    paintHead(m);
    els.body.setAttribute('aria-busy', 'true');
    painted = '';
    load();
  }
  for (const b of [els.prev, els.next]) b.addEventListener('click', () => { if (b.dataset.to) go(b.dataset.to); });

  // The head's month and its arrows: an arrow off at the ends; one that had the focus hands it to the other.
  function paintHead(m) {
    els.month.textContent = monthTitle(m);
    const focused = document.activeElement;
    const step = (b, to, on) => {
      b.disabled = !on;
      if (on) b.dataset.to = to;
      else delete b.dataset.to;
    };
    step(els.prev, addMonths(m, -1), addMonths(m, -1) >= view.first);
    step(els.next, addMonths(m, 1), addMonths(m, 1) <= current());
    if (focused === els.prev && els.prev.disabled && !els.next.disabled) els.next.focus();
    if (focused === els.next && els.next.disabled && !els.prev.disabled) els.prev.focus();
  }

  function paintMonth() {
    els.title.textContent = monthTitle(view.month);
    const list = monthTiles(view);
    const nodes = tileNodes(list);
    list.forEach((t, i) => { if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn'; });
    els.tiles.replaceChildren(...nodes);
    // a phone: one long figure sets them all a size down, so the row's figures match (Profit has its own row)
    els.tiles.toggleAttribute('data-long', nodes.slice(1).some((n) => n.querySelector('.us-kwh').hasAttribute('data-long')));
    const notes = monthNotes(view);
    els.notes.replaceChildren(...notes.map((n) => noteNode('li', '', n)));
    els.notes.hidden = notes.length === 0;
    paintChart();
  }

  // The months' profit bars: one Tab stop (the shown month), ← → Home End move along them, Enter opens a month.
  function paintChart() {
    const width = Math.floor(els.chart.clientWidth) || 600;
    lastWidth = width;
    const months = chartMonths(view.last12, width);
    els.chartTitle.textContent = chartTitle(months.length);
    if (noFigures(view.last12)) {
      els.chart.replaceChildren(el('p', 'none co-chart-none', 'No figures yet.'));
      return;
    }
    const { bars, zeroY, ticks } = profitBars(months, view.month, width, CHART_H);
    const root = svg('svg', { width, height: CHART_H, role: 'group', 'aria-labelledby': 'co-chart-title' });
    const hatch = svg('pattern', { id: 'co-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    hatch.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'co-hatch-line' }));
    const defs = svg('defs');
    defs.append(hatch);
    root.append(defs);
    const [x0, x1] = [BARS_M.left, width - BARS_M.right];
    for (const t of ticks) {
      root.append(svg('line', { x1: x0, x2: x1, y1: t.y, y2: t.y, class: 'co-grid' }));
      root.append(svg('text', { x: x0 - 6, y: t.y + 4, 'text-anchor': 'end', class: 'co-axis' }, t.label));
    }
    root.append(svg('line', { x1: x0, x2: x1, y1: zeroY, y2: zeroY, class: 'co-zero' }));
    const at = bars.findIndex((b) => b.shown);
    const slot = bars.length > 1 ? bars[1].x - bars[0].x : x1 - x0;
    bars.forEach((b, i) => {
      const link = svg('a', { href: costsHash(b.month === current() ? null : b.month), 'aria-label': b.words, class: 'co-bar-link', tabindex: b.shown ? 0 : -1 });
      if (b.shown) link.setAttribute('aria-current', 'page');
      link.dataset.focusKey = `bar-${b.month}`;
      link.addEventListener('click', (event) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        if (!b.shown) go(b.month);
      });
      link.append(svg('title', {}, b.words));
      // the whole slot takes the tap; the bar is drawn inside it
      link.append(svg('rect', { x: b.x - (slot - b.w) / 2, y: 0, width: slot, height: CHART_H, class: 'co-bar-hit' }));
      const rect = b.pending
        ? { x: b.x, y: zeroY - PENDING_H, width: b.w, height: PENDING_H, class: `co-bar co-bar-pending${b.shown ? ' co-bar-shown' : ''}` }
        : { x: b.x, y: b.y, width: b.w, height: b.h, class: `co-bar${b.loss ? ' co-bar-loss' : ''}${b.shown ? ' co-bar-shown' : ''}` };
      if (b.pending || !b.empty) link.append(svg('rect', { ...rect, rx: 2 })); // a month of nothing draws no bar
      if (b.showValue) {
        const y = b.loss ? b.y + b.h + 13 : b.y - 5;
        link.append(svg('text', { x: b.x + b.w / 2, y, 'text-anchor': 'middle', class: 'co-bar-value', 'aria-hidden': 'true' }, b.value));
      }
      if (slot >= LABEL_MIN || (i - at) % 2 === 0) {
        link.append(svg('text', { x: b.x + b.w / 2, y: CHART_H - 6, 'text-anchor': 'middle', class: `co-axis${b.shown ? ' co-axis-shown' : ''}` }, b.label));
      }
      root.append(link);
    });
    els.chart.replaceChildren(root);
  }
  const barLinks = () => [...els.chart.querySelectorAll('.co-bar-link')];
  const rove = (link) => { for (const a of barLinks()) a.setAttribute('tabindex', a === link ? '0' : '-1'); };
  els.chart.addEventListener('focusin', (event) => {
    const link = event.target.closest?.('.co-bar-link');
    if (link) rove(link);
  });
  els.chart.addEventListener('keydown', (event) => {
    const links = barLinks();
    const i = links.indexOf(event.target.closest?.('.co-bar-link'));
    if (i < 0) return;
    const j = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: links.length - 1 }[event.key];
    if (j === undefined) return;
    event.preventDefault();
    const to = links[Math.max(0, Math.min(links.length - 1, j))];
    rove(to);
    to.focus();
  });

  // A card's table (its h2 names it; the caption says it again to a screen reader). numFrom: the first column of figures
  // (right-aligned heads); foot: a row for the tfoot.
  function table(caption, heads, rows, className = '', numFrom = 1, foot = null) {
    const wrap = el('div', 'us-table-wrap');
    const t = el('table', `us-table co-table ${className}`.trim());
    t.append(el('caption', 'sr-only', caption));
    const head = el('tr');
    heads.forEach((h, i) => {
      const th = el('th', i >= numFrom ? 'num' : '', h);
      th.scope = 'col';
      head.append(th);
    });
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const r of rows) body.append(r);
    t.append(thead, body);
    if (foot) {
      const tfoot = el('tfoot');
      tfoot.append(foot);
      t.append(tfoot);
    }
    wrap.append(t);
    return wrap;
  }

  function paintCategories() {
    if (!view.byCategory.length) {
      els.categories.replaceChildren(el('p', 'none', `No costs in ${monthTitle(view.month)}.`));
      return;
    }
    const rows = categoryRows(view.byCategory).map((c) => {
      const tr = el('tr');
      const th = el('th');
      th.scope = 'row';
      th.append(el('span', 'co-name', c.label));
      if (c.source) th.append(el('span', 'co-source', c.source));
      tr.append(th, el('td', 'num', c.amount), el('td', 'num', c.share));
      return tr;
    });
    const foot = el('tr', 'total');
    const th = el('th', '', 'Total');
    th.scope = 'row';
    foot.append(th, el('td', 'num', categoryTotal(view)), el('td', 'num'));
    els.categories.replaceChildren(table('Costs by category', ['Category', 'RM', 'Share'], rows, 'co-cat-table', 1, foot));
  }

  function paintEntries() {
    if (!view.entries.length) {
      const empty = el('div', 'co-empty');
      empty.append(el('p', 'none', `No costs recorded for ${monthTitle(view.month)}.`));
      const add = el('button', '', 'Add a cost'); // the head's Add stays the one filled button
      add.type = 'button';
      add.dataset.focusKey = 'add-empty';
      add.addEventListener('click', openAdd);
      empty.append(add);
      els.entries.replaceChildren(empty);
      return;
    }
    const list = el('ul', 'co-entries');
    for (const e of view.entries) {
      const x = entryLine(e);
      const li = el('li', 'co-entry');
      const what = el('span', 'co-what', x.what);
      if (x.monthly) what.append(' ', el('span', 'co-tag', 'monthly'));
      if (x.bill) what.append(' ', el('span', 'co-tag', 'bill'));
      if (x.topUp) what.append(el('span', 'co-sub', x.topUp));
      const acts = el('span', 'co-acts');
      acts.append(quietButton('Edit', `edit-${e.costId}-${e.date}`, () => {
        const c = costOr(e.costId);
        if (!c) return;
        if (c.repeat === 'monthly') openChangeDialog({ cost: c, ...dialogOpts() });
        else openEditDialog({ cost: c, ...dialogOpts() });
      }, `Edit ${x.what}, ${x.date}`));
      li.append(el('span', 'co-date', x.date), what, el('span', 'co-whom', x.whom), el('span', 'co-amount', x.amount), acts);
      list.append(li);
    }
    els.entries.replaceChildren(list);
  }

  function paintRepeating() {
    if (!view.repeating.length) {
      els.repeating.replaceChildren(el('p', 'none', 'No monthly items. Tick “Every month” when you add rent or a base wage.'));
      return;
    }
    const list = el('ul', 'co-entries co-repeats');
    for (const c of view.repeating) {
      const x = repeatingLine(c);
      const li = el('li', 'co-entry co-repeat');
      const acts = el('span', 'co-acts');
      const row = () => costOr(c.id);
      acts.append(
        quietButton('Change', `change-${c.id}`, () => { const r = row(); if (r) openChangeDialog({ cost: r, ...dialogOpts() }); }, `Change ${x.what}`),
        quietButton('Stop', `stop-${c.id}`, () => { const r = row(); if (r) openStopDialog({ cost: r, ...dialogOpts() }); }, `Stop ${x.what}`),
      );
      li.append(el('span', 'co-what', x.what), el('span', 'co-whom', x.whom), el('span', 'co-amount', x.amount), el('span', 'co-date', x.since), acts);
      list.append(li);
    }
    els.repeating.replaceChildren(list);
  }

  function paintRuns() {
    if (!view.runs.length) {
      els.runs.replaceChildren(el('p', 'none', `No runs in ${monthTitle(view.month)}.`));
      return;
    }
    const rows = [];
    for (const run of view.runs) {
      const r = runRow(run);
      const tr = el('tr', 'co-run');
      const th = el('th');
      th.scope = 'row';
      const toggle = el('button', 'hv-run-toggle co-dates', r.dates);
      toggle.type = 'button';
      toggle.dataset.focusKey = `run-${run.id}`;
      toggle.setAttribute('aria-expanded', String(open.has(run.id)));
      toggle.setAttribute('aria-controls', `co-run-${run.id}`);
      toggle.setAttribute('aria-label', `${r.room}, ${r.dates}`); // two rooms' runs may share their dates
      toggle.addEventListener('click', () => {
        if (open.has(run.id)) open.delete(run.id);
        else open.add(run.id);
        keepFocus(paintRuns); // only the runs: the rest of the page stays as it is
      });
      th.append(toggle);
      const cells = [r.room, r.crops, ...r.cells].map((c, i) => {
        const td = el('td', i < 2 ? `co-run-${i ? 'crops' : 'room'}` : 'num', c);
        td.dataset.label = RUN_COLUMNS[i + 1];
        if ((i === 4 && r.loss) || (i === 5 && r.perKgLoss)) td.classList.add('co-loss');
        if (i === 3 && r.incomplete) td.append(el('span', 'co-sub', 'Some costs have no price'));
        return td;
      });
      tr.append(th, ...cells);
      rows.push(tr);
      if (open.has(run.id)) {
        const more = el('tr', 'co-parts');
        more.id = `co-run-${run.id}`;
        const td = el('td');
        td.colSpan = RUN_COLUMNS.length;
        const body = el('div', 'co-parts-body');
        const dl = el('dl', 'co-parts-list');
        for (const [label, value] of runParts(run)) {
          const pair = el('div');
          pair.append(el('dt', '', label), el('dd', '', value));
          dl.append(pair);
        }
        body.append(dl, ...monthNotes({ pending: false, notes: run.notes }).map((n) => noteNode('p', 'co-run-note', n)));
        td.append(body);
        more.append(td);
        rows.push(more);
      }
    }
    const waiting = view.runs.some((x) => x.pending) ? [el('p', 'muted co-runs-pending', 'Working out the energy cost of some runs…')] : [];
    els.runs.replaceChildren(...waiting, table(`Runs in ${monthTitle(view.month)}`, RUN_COLUMNS, rows, 'co-runs-table', 3));
  }

  function paint() {
    const key = JSON.stringify([view, costs, rooms]);
    if (key === painted) {
      els.body.removeAttribute('aria-busy');
      return; // a refresh with nothing new leaves the page (and the focus) alone
    }
    painted = key;
    els.body.hidden = false;
    els.body.removeAttribute('aria-busy');
    keepFocus(() => {
      paintHead(view.month);
      paintMonth();
      paintCategories();
      paintEntries();
      paintRepeating();
      paintRuns();
    });
  }

  els.add.addEventListener('click', openAdd);
  els.retry.addEventListener('click', () => load());
  let frame = 0;
  let lastWidth = 0;
  const resize = new ResizeObserver(() => {
    const w = Math.floor(els.chart.clientWidth);
    if (!view || w === lastWidth) return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (alive() && view) keepFocus(paintChart); });
  });
  resize.observe(els.chart);
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => (type === 'costs' ? reloadAll() : reload.call()))),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reloadAll(); }), // a run starts or ends; a room's name
    live.onStatus((up) => {
      if (up) reloadAll();
      else if (!outdated) {
        clearTimeout(timer);
        timer = setTimeout(() => { listsStale = true; load(); }, REFRESH_MS);
      }
    }),
  ];
  load();

  return function unmount() {
    mountSeq++;
    closeTaskDialog(); // a dialog of this page has nothing to go back to
    reload.cancel();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    resize.disconnect();
    for (const off of offLive) off();
  };
}

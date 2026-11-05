// The Costs page, #/business/costs (spec 2026-11-05-costs-design.md 6): a month's income, costs and profit, 12 months of
// profit, the costs by category, the month's entries, the monthly items and the runs with their whole figures. It asks for
// GET /api/costs/month on the costs, harvest, sales, batches and inventory events (those the app knows), a room's crops or
// name, when the stream comes back, and on a timer (as Harvest). The month steps in place (the address keeps it, as
// Harvest keeps its period): the page, its scroll and the focus stay.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { costsHash } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { tileNodes } from './harvest-card.js';
import {
  moneyText, monthTitle, addMonths, monthTiles, categoryRows, entryLine, repeatingLine, RUN_COLUMNS, runRow, runParts, profitBars,
} from './costs-math.js';
import { openAddDialog, openEditDialog, openChangeDialog, openStopDialog } from './costs-dialogs.js';

const REFRESH_MS = 60_000;
const LISTEN = ['costs', 'harvest', 'sales', 'batches', 'inventory'].filter((type) => EVENT_TYPES.includes(type));
const NS = 'http://www.w3.org/2000/svg';
const CHART_H = 168;
const BAR_MAX = 48; // a bar's widest, so 12 bars on a desk stay bars, not blocks
const LABEL_MIN = 30; // a month's slot narrower than this (a phone) names every other month
const PENDING_H = 24; // a month still being worked out: a hatched stub over the zero line

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Costs</h1>
      <p class="page-sub">What the farm spends, what it makes, and each run’s profit.</p>
    </div>
    <div class="co-tools">
      <nav class="co-month" aria-label="Month">
        <a class="button co-step" data-prev aria-label="Previous month"><span aria-hidden="true">‹</span></a>
        <span class="co-month-name" data-month aria-live="polite"></span>
        <a class="button co-step" data-next aria-label="Next month"><span aria-hidden="true">›</span></a>
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
      <h3 class="co-chart-title" id="co-chart-title">Profit, last 12 months</h3>
      <div class="co-chart" data-chart></div>
    </section>
    <section class="card co-entries-card" aria-labelledby="co-entries-title"><h2 id="co-entries-title">Entries</h2><div data-entries></div></section>
    <section class="card co-cat-card" aria-labelledby="co-cat-title"><h2 id="co-cat-title">By category</h2><div data-categories></div></section>
    <section class="card co-repeat-card" aria-labelledby="co-repeat-title"><h2 id="co-repeat-title">Monthly items</h2><div data-repeating></div></section>
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
const shortMonth = (m) => monthTitle(m).replace(/^(\w{3})\w*/, '$1'); // "Nov 2026", as repeatingLine's since
// A plain click (not one opening a new tab) on a month link.
const plainClick = (event) => event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { month = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    prev: q('[data-prev]'), next: q('[data-next]'), month: q('[data-month]'), add: q('[data-add]'), banner: q('.banner'),
    bannerText: q('[data-banner-text]'), retry: q('[data-retry]'), body: q('[data-body]'), title: q('[data-title]'),
    tiles: q('[data-tiles]'), notes: q('[data-notes]'), chart: q('[data-chart]'), categories: q('[data-categories]'),
    entries: q('[data-entries]'), repeating: q('[data-repeating]'), runs: q('[data-runs]'),
  };
  document.title = 'Costs · Mushroom farm';

  let shown = month; // the month asked for: null for this month
  let view = null; // GET /api/costs/month of the month on show
  let costs = []; // GET /api/costs: the rows the edit dialogs open
  let rooms = [];
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';
  let other = new Map(); // month → a promise of its runs (the Add dialog's "where it lands" for a date in another month)
  const open = new Set(); // the runs whose breakdown is open

  const current = () => view?.today.slice(0, 7) ?? null;

  function showError(text) {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const [v, list, roomList] = await Promise.all([
        request('GET', `/api/costs/month${shown ? `?month=${shown}` : ''}`),
        request('GET', '/api/costs'),
        request('GET', '/api/rooms'),
      ]);
      if (!alive() || mine !== seq) return;
      view = v;
      costs = list.costs;
      rooms = roomList.map((r) => ({ id: r.id, name: r.name })); // GET /api/rooms: the rooms as a list
      other = new Map();
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.body.removeAttribute('aria-busy');
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const reload = createThrottle(() => { if (alive()) load(); });

  // A month's runs for the Add and Edit dialogs: the month on show's, else asked once per load.
  function runsIn(m) {
    if (!view) return Promise.resolve(null);
    if (m === view.month) return Promise.resolve(view.runs);
    if (m < view.first || m > current()) return Promise.resolve(null);
    if (!other.has(m)) other.set(m, request('GET', `/api/costs/month?month=${m}`).then((v) => v.runs));
    return other.get(m);
  }
  const dialogOpts = () => ({
    rooms, today: view.today, month: view.month, runsIn, onDone: () => reload.call(), onLost: showError,
  });
  const costById = (id) => costs.find((c) => c.id === id);

  // Another month, in place: its name and arrows at once, the figures dimmed until its answer comes.
  function go(m) {
    shown = m === current() ? null : m;
    history.replaceState(null, '', costsHash(shown));
    paintHead(m);
    els.body.setAttribute('aria-busy', 'true');
    painted = '';
    load();
  }
  for (const a of [els.prev, els.next]) {
    a.addEventListener('click', (event) => {
      if (!plainClick(event) || !a.dataset.to) return;
      event.preventDefault();
      go(a.dataset.to);
    });
  }

  function paintHead(m) {
    els.month.textContent = monthTitle(m);
    const now = current();
    const step = (a, to, on) => {
      if (on) {
        a.href = costsHash(to === now ? null : to);
        a.dataset.to = to;
        a.removeAttribute('aria-disabled');
      } else {
        a.removeAttribute('href');
        delete a.dataset.to;
        a.setAttribute('aria-disabled', 'true');
      }
    };
    step(els.prev, addMonths(m, -1), addMonths(m, -1) >= view.first);
    step(els.next, addMonths(m, 1), addMonths(m, 1) <= now);
  }

  function paintMonth() {
    els.title.textContent = monthTitle(view.month);
    els.tiles.replaceChildren(...tileNodes(monthTiles(view)));
    if (view.tiles.profit < 0 && !view.pending) els.tiles.children[2]?.querySelector('.us-kwh')?.setAttribute('data-tone', 'warn');
    els.notes.replaceChildren(...view.notes.map((n) => el('li', 'muted', n.text)));
    els.notes.hidden = view.notes.length === 0;
    paintChart();
  }

  function paintChart() {
    const width = Math.floor(els.chart.clientWidth) || 600;
    const { bars, zeroY, ticks } = profitBars(view.last12, view.month, width, CHART_H);
    const root = svg('svg', { width, height: CHART_H, role: 'group', 'aria-labelledby': 'co-chart-title' });
    const hatch = svg('pattern', { id: 'co-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    hatch.append(svg('line', { x1: 0, y1: 0, x2: 0, y2: 6, class: 'co-hatch-line' }));
    const defs = svg('defs');
    defs.append(hatch);
    root.append(defs);
    for (const t of ticks) {
      root.append(svg('line', { x1: 72, x2: width - 8, y1: t.y, y2: t.y, class: 'co-grid' }));
      root.append(svg('text', { x: 66, y: t.y + 4, 'text-anchor': 'end', class: 'co-axis' }, t.label));
    }
    root.append(svg('line', { x1: 72, x2: width - 8, y1: zeroY, y2: zeroY, class: 'co-zero' }));
    const at = bars.findIndex((b) => b.shown);
    const slot = bars.length > 1 ? bars[1].x - bars[0].x : width;
    bars.forEach((b, i) => {
      const point = view.last12[i];
      const words = `${monthTitle(b.month)}: ${b.pending ? 'working out' : point.profit < 0 ? `loss ${moneyText(point.profit)}` : `profit ${moneyText(point.profit)}`}`;
      const link = svg('a', { href: costsHash(b.month === current() ? null : b.month), 'aria-label': words, class: 'co-bar-link' });
      if (b.shown) link.setAttribute('aria-current', 'page');
      link.dataset.focusKey = `bar-${b.month}`;
      link.addEventListener('click', (event) => {
        if (!plainClick(event)) return;
        event.preventDefault();
        if (!b.shown) go(b.month);
      });
      link.append(svg('title', {}, words));
      const w = Math.min(b.w, BAR_MAX);
      const x = b.x + (b.w - w) / 2;
      // the whole slot takes the tap; the bar is drawn inside it
      link.append(svg('rect', { x: b.x - (slot - b.w) / 2, y: 0, width: slot, height: CHART_H, class: 'co-bar-hit' }));
      const rect = b.pending
        ? { x, y: zeroY - PENDING_H, width: w, height: PENDING_H, class: `co-bar co-bar-pending${b.shown ? ' co-bar-shown' : ''}` }
        : { x, y: b.y, width: w, height: b.h, class: `co-bar${b.loss ? ' co-bar-loss' : ''}${b.shown ? ' co-bar-shown' : ''}` };
      if (b.pending || point.profit !== 0) link.append(svg('rect', { ...rect, rx: 2 })); // a month of none draws no bar
      if (slot >= LABEL_MIN || (i - at) % 2 === 0) {
        link.append(svg('text', { x: b.x + b.w / 2, y: CHART_H - 6, 'text-anchor': 'middle', class: `co-axis${b.shown ? ' co-axis-shown' : ''}` }, b.label));
      }
      root.append(link);
    });
    els.chart.replaceChildren(root);
  }

  // A card's table (its h2 names it; the caption says it again to a screen reader).
  // numFrom: the first column of figures (right-aligned heads).
  function table(caption, heads, rows, className = '', numFrom = 1) {
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
    els.categories.replaceChildren(table('Costs by category', ['Category', 'RM', 'Share'], rows, 'co-cat-table'));
  }

  function paintEntries() {
    if (!view.entries.length) {
      const empty = el('div', 'co-empty');
      empty.append(el('p', 'none', `No costs recorded for ${monthTitle(view.month)}.`));
      const add = el('button', '', 'Add a cost'); // the head's Add stays the one filled button
      add.type = 'button';
      add.dataset.focusKey = 'add-empty';
      add.addEventListener('click', () => openAddDialog(dialogOpts()));
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
      const acts = el('span', 'co-acts');
      acts.append(quietButton('Edit', `edit-${e.costId}-${e.date}`, () => {
        const c = costById(e.costId);
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
    const list = el('ul', 'co-entries');
    for (const c of view.repeating) {
      const x = repeatingLine(c);
      const li = el('li', 'co-entry co-repeat');
      const row = costById(c.id) ?? c;
      const acts = el('span', 'co-acts');
      acts.append(
        quietButton('Change', `change-${c.id}`, () => openChangeDialog({ cost: row, ...dialogOpts() }), `Change ${x.what}`),
        quietButton('Stop', `stop-${c.id}`, () => openStopDialog({ cost: row, ...dialogOpts() }), `Stop ${x.what}`),
      );
      li.append(el('span', 'co-what', x.what), el('span', 'co-whom', x.whom), el('span', 'co-amount', x.amount), el('span', 'co-date', !c.repeatUntil ? x.since : c.repeatUntil === c.date.slice(0, 7) ? `${shortMonth(c.repeatUntil)} only` : `${x.since}, until ${shortMonth(c.repeatUntil)}`), acts);
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
        paint(true);
      });
      th.append(toggle);
      const cells = [r.room, r.crops, ...r.cells].map((c, i) => {
        const td = el('td', i < 2 ? `co-run-${i ? 'crops' : 'room'}` : 'num', c);
        td.dataset.label = RUN_COLUMNS[i + 1];
        if (i === 4 && r.loss) td.classList.add('co-loss');
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
        body.append(dl, ...run.notes.map((n) => el('p', 'muted co-run-note', n.text)));
        td.append(body);
        more.append(td);
        rows.push(more);
      }
    }
    els.runs.replaceChildren(table(`Runs in ${monthTitle(view.month)}`, RUN_COLUMNS, rows, 'co-runs-table', 3));
  }

  // force: a repaint with the same figures (a run opened or closed). The focus goes back to the control it was on.
  function paint(force = false) {
    const key = JSON.stringify([view, costs, rooms]);
    if (!force && key === painted) {
      els.body.removeAttribute('aria-busy');
      return; // a refresh with nothing new leaves the page (and the focus) alone
    }
    painted = key;
    const focused = container.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;
    els.body.hidden = false;
    els.body.removeAttribute('aria-busy');
    paintHead(view.month);
    paintMonth();
    paintCategories();
    paintEntries();
    paintRepeating();
    paintRuns();
    if (focused) container.querySelector(`[data-focus-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }

  els.add.addEventListener('click', () => { if (view) openAddDialog(dialogOpts()); });
  els.retry.addEventListener('click', () => load());
  let frame = 0;
  let lastWidth = 0;
  const resize = new ResizeObserver(() => {
    const w = Math.floor(els.chart.clientWidth);
    if (!view || w === lastWidth) return;
    lastWidth = w;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (alive() && view) paintChart(); });
  });
  resize.observe(els.chart);
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => reload.call())),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }), // a run starts or ends; a room's name
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) {
        clearTimeout(timer);
        timer = setTimeout(load, REFRESH_MS);
      }
    }),
  ];
  load();

  return function unmount() {
    mountSeq++;
    reload.cancel();
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    resize.disconnect();
    for (const off of offLive) off();
  };
}

// The Sales page, #/business/sales (spec 2026-11-05-sales-design.md 6): the period's totals (sold of harvested, income,
// owed all time), what each buyer owes, the period's sales, and by crop and by buyer. It asks for GET /api/sales on the
// sales and harvest events (a Settings price save is a harvest event), a room renamed or deleted, the stream coming back,
// and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { canonicalHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { tileNodes } from './harvest-card.js';
import { picture } from './pictures.js';
import { rangeText, periodWords, rmText } from './harvest-math.js';
import {
  pageTiles, deliveryRow, cropRows, buyerRows, CROP_COLUMNS, BUYER_COLUMNS, emptyText, ageText, lineParts,
} from './sales-math.js';
import { DOT } from './text-math.js';
import { openSale, openPaid, openBuyers } from './sales-dialogs.js';

const REFRESH_MS = 60_000;
const DAYS = [7, 30, 90, 365];
const SHOWN = 20;
const SHOWN_PHONE = 10;
const PHONE = '(max-width: 600px)';

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Sales</h1>
      <p class="page-sub">What was sold, to whom, and what is owed.</p>
    </div>
    <div class="sl-tools">
      <div class="range-bar" role="group" aria-label="Period" data-range></div>
      <button type="button" class="primary" data-record>Record a sale</button>
      <button type="button" data-buyers>Buyers</button>
      <a class="button" data-csv download>Export CSV</a>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <div class="sl-page" data-body hidden>
    <section class="card sl-totals" aria-labelledby="sl-totals-title">
      <h2 id="sl-totals-title" data-totals-title>Loading…</h2>
      <div class="us-tiles sl-tiles" data-tiles></div>
    </section>
    <section class="card sl-owed" data-owed hidden aria-labelledby="sl-owed-title">
      <h2 id="sl-owed-title">Owed</h2>
      <ul class="sl-owed-list" data-owed-list></ul>
    </section>
    <section class="card sl-sales" aria-labelledby="sl-sales-title">
      <h2 id="sl-sales-title">Sales</h2>
      <p class="none" data-empty hidden></p>
      <p class="sl-empty-record" data-empty-record hidden><button type="button">Record a sale</button></p>
      <ul class="sl-list" data-list></ul>
      <button type="button" class="tk-quiet sl-more" data-more hidden></button>
    </section>
    <section class="card sl-by-crop" data-crops aria-labelledby="sl-crops-title"></section>
    <section class="card sl-by-buyer" data-buyers-table aria-labelledby="sl-by-buyer-title"></section>
  </div>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// A delivery's lines in short, a part a crop kept whole (no break inside "Lion's mane 2.20 kg"), joined by the dot.
function linesNode(className, lines) {
  const node = el('span', className);
  lineParts(lines).forEach((part, i) => {
    if (i) node.append(DOT);
    node.append(el('span', 'sl-line-part', part));
  });
  return node;
}

// A card's table: the first column names the row (head(row) → nodes), the others are figures; a row's diff (by crop: the
// average price against the expected one) goes under the Average figure and its sub (the sold kg) under the name, on a
// phone only (the Sold, Harvested and Expected columns, and by buyer the kg, are hidden there).
function table(caption, columns, rows, head, extra = '') {
  const wrap = el('div', 'us-table-wrap');
  const t = el('table', `us-table sl-table${extra}`);
  t.append(el('caption', 'sr-only', caption));
  const tr = el('tr');
  columns.forEach((c, i) => {
    // "RM per kg" kept whole: a narrow head breaks "Average / RM per kg", not "Average RM per / kg"
    const [words, unit] = c.endsWith(' RM per kg') ? [c.slice(0, -9), 'RM per kg'] : [c, null];
    const th = el('th', i ? 'num' : '', words);
    if (unit) th.append(el('span', 'sl-nowrap', unit));
    th.scope = 'col';
    tr.append(th);
  });
  const thead = el('thead');
  thead.append(tr);
  const body = el('tbody');
  for (const r of rows) {
    const row = el('tr');
    const th = el('th');
    th.scope = 'row';
    const name = el('span', 'sl-name');
    name.append(...head(r));
    th.append(name);
    if (r.sub) th.append(el('span', 'sl-sub', r.sub));
    const tds = r.cells.map((c) => el('td', 'num', c));
    if (r.diff) tds[3].append(el('span', 'sl-diff', r.diff));
    row.append(th, ...tds);
    body.append(row);
  }
  t.append(thead, body);
  wrap.append(t);
  return wrap;
}

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { days = 30 } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    range: q('[data-range]'), csv: q('[data-csv]'), record: q('[data-record]'), buyers: q('[data-buyers]'), banner: q('.banner'),
    bannerText: q('[data-banner-text]'), body: q('[data-body]'), totalsTitle: q('[data-totals-title]'), tiles: q('[data-tiles]'),
    owed: q('[data-owed]'), owedList: q('[data-owed-list]'), list: q('[data-list]'), more: q('[data-more]'), empty: q('[data-empty]'),
    emptyRecord: q('[data-empty-record]'),
    crops: q('[data-crops]'), buyersTable: q('[data-buyers-table]'),
  };
  document.title = 'Sales · Mushroom farm';

  let period = days;
  let sales = null; // GET /api/sales of the period on show
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';
  let showAll = false;
  const open = new Set(); // the buyers whose unpaid sales are shown
  const media = window.matchMedia(PHONE);
  const phone = () => media.matches;
  // a phone shows fewer sales: crossing the width repaints (the limit is in the painted key)
  const onMedia = () => { if (alive() && sales) paint(); };
  media.addEventListener('change', onMedia);

  const buttons = DAYS.map((n) => {
    const b = el('button', '', periodWords(n));
    b.type = 'button';
    b.addEventListener('click', () => pick(n));
    els.range.append(b);
    return [n, b];
  });

  function showPeriod() {
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === period));
    els.csv.href = `/api/sales.csv?days=${period}`;
  }

  function pick(n) {
    if (n === period) return;
    period = n;
    history.replaceState(null, '', canonicalHash({ name: 'sales', days: n }));
    sales = null;
    painted = '';
    showAll = false;
    els.body.hidden = true;
    showPeriod();
    load();
  }

  const changed = () => reload.call(); // after a dialog's write (the event comes too; the throttle joins them)
  const ctx = () => ({ onChanged: changed, onError: showError });

  function showError(text) {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  }

  // One delivery in the Sales list, flat so the list's columns (each delivery a subgrid of them) lay it as a block on a
  // phone and as one row on a desk: day, buyer, the lines, the total, the paid mark, the reference; Edit opens it.
  function deliveryItem(d) {
    const r = deliveryRow(d);
    const li = el('li', 'sl-item');
    const edit = el('button', 'tk-quiet sl-edit', 'Edit');
    edit.type = 'button';
    edit.dataset.focusKey = `edit-${d.id}`;
    edit.setAttribute('aria-label', `Edit the sale of ${r.day} to ${r.buyer}`);
    edit.addEventListener('click', () => openSale({ ...ctx(), delivery: d }));
    li.append(el('span', 'sl-day', r.day), el('span', 'sl-buyer', r.buyer), linesNode('sl-lines', d.lines),
      el('span', 'sl-total num', r.total), el('span', `sl-mark${r.paid.unpaid ? ' sl-unpaid' : ''}`, r.paid.text));
    if (r.reference) li.append(el('span', 'muted sl-ref', r.reference));
    li.append(edit);
    return li;
  }

  // A buyer's row in Owed: the name (a button that opens their unpaid sales under it, in place), RM owed, the oldest; the
  // sales as columns (day, lines, RM, reference, Mark paid), the reference's cell kept when there is none.
  function owedItem(b) {
    const li = el('li', 'sl-owed-item');
    const toggle = el('button', 'sl-owed-name', b.buyer);
    toggle.type = 'button';
    toggle.dataset.focusKey = `owed-${b.buyerId}`;
    const row = el('p', 'sl-owed-row');
    row.append(toggle, el('span', 'num sl-owed-total', rmText(b.total)), el('span', 'muted sl-owed-age', `oldest ${ageText(b.oldestAt, Date.now())}`));
    const ul = el('ul', 'sl-owed-sales');
    for (const d of b.deliveries) {
      const r = deliveryRow(d);
      const item = el('li', 'sl-owed-sale');
      const paid = el('button', '', 'Mark paid');
      paid.type = 'button';
      paid.dataset.focusKey = `paid-${d.id}`;
      paid.setAttribute('aria-label', `Mark the sale of ${r.day} to ${r.buyer} paid`);
      paid.addEventListener('click', () => openPaid({ ...ctx(), delivery: d }));
      item.append(el('span', 'sl-day', r.day), linesNode('sl-lines', d.lines), el('span', 'num sl-owed-amount', r.total),
        el('span', 'muted sl-ref', r.reference), paid);
      ul.append(item);
    }
    const show = (on) => {
      toggle.setAttribute('aria-expanded', String(on));
      ul.hidden = !on;
    };
    show(open.has(b.buyerId));
    toggle.addEventListener('click', () => {
      const on = !open.has(b.buyerId);
      if (on) open.add(b.buyerId); else open.delete(b.buyerId);
      show(on);
    });
    li.append(row, ul);
    return li;
  }

  function paint() {
    const list = sales.deliveries;
    const limit = showAll ? list.length : phone() ? SHOWN_PHONE : SHOWN;
    const key = JSON.stringify([sales, showAll, limit]);
    if (key === painted) return;
    painted = key;
    // the cursor on an Edit, a Mark paid or an Owed name comes back to the same one after the repaint
    const focusKey = container.contains(document.activeElement) ? document.activeElement.dataset?.focusKey : null;
    els.body.hidden = false;
    els.totalsTitle.textContent = rangeText(sales);
    els.tiles.replaceChildren(...tileNodes(pageTiles(sales, Date.now())));

    els.owed.hidden = sales.owed.count === 0;
    els.owedList.replaceChildren(...sales.owed.buyers.map(owedItem));

    els.empty.hidden = list.length > 0;
    els.empty.textContent = sales.buyerCount === 0 ? 'No buyers yet. Record a sale to add the first.' : emptyText(period);
    els.emptyRecord.hidden = list.length > 0 || sales.buyerCount !== 0;
    els.list.replaceChildren(...list.slice(0, limit).map(deliveryItem));
    els.more.hidden = list.length <= limit;
    els.more.textContent = `Show all ${list.length}`;

    const crops = cropRows(sales);
    els.crops.hidden = crops.length === 0;
    const h2 = (id, text) => { const h = el('h2', '', text); h.id = id; return h; };
    els.crops.replaceChildren(h2('sl-crops-title', 'By crop'),
      table('By crop', CROP_COLUMNS, crops, (c) => [picture('crop', c.crop, { size: 24 }), el('span', '', c.name)], ' sl-crop-table'));
    const buyers = buyerRows(sales);
    els.buyersTable.hidden = buyers.length === 0;
    els.buyersTable.replaceChildren(h2('sl-by-buyer-title', 'By buyer'), table('By buyer', BUYER_COLUMNS, buyers, (b) => [el('span', '', b.name)], ' sl-buyer-table'));
    if (focusKey) {
      const node = container.querySelector(`[data-focus-key="${focusKey}"]`);
      if (node && !node.closest('[hidden]')) node.focus();
    }
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', `/api/sales?days=${period}`);
      if (!alive() || mine !== seq) return;
      sales = data;
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('sales', () => reload.call()),
    live.on('harvest', () => reload.call()),
    live.on('room', (d) => { if (d.part === 'room') reload.call(); }),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }
    }),
  ];

  els.record.addEventListener('click', () => openSale({ ...ctx(), delivery: null }));
  els.emptyRecord.firstElementChild.addEventListener('click', () => openSale({ ...ctx(), delivery: null }));
  els.buyers.addEventListener('click', () => openBuyers(ctx()));
  els.more.addEventListener('click', () => {
    const at = els.list.children.length;
    showAll = true;
    paint();
    const first = els.list.children[at];
    if (first) { first.tabIndex = -1; first.focus(); }
  });
  q('[data-retry]').addEventListener('click', () => load());
  showPeriod();
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
    media.removeEventListener('change', onMedia);
  };
}

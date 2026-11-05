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
  pageTiles, deliveryRow, cropRows, buyerRows, CROP_COLUMNS, BUYER_COLUMNS, emptyText, ageText, linesShort,
} from './sales-math.js';
import { openSale, openPaid, openBuyers } from './sales-dialogs.js';

const REFRESH_MS = 60_000;
const DAYS = [7, 30, 90, 365];
const SHOWN = 20;
const SHOWN_PHONE = 10;

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
      <ul class="sl-list" data-list></ul>
      <button type="button" class="link sl-more" data-more hidden></button>
    </section>
    <section class="card sl-by-crop" data-crops></section>
    <section class="card sl-by-buyer" data-buyers-table></section>
  </div>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// A card's table: the first column names the row (head(row) → nodes), the others are figures; under: an optional line
// under the name (by crop: the price against expected, shown on a phone in place of the last two columns).
function table(caption, columns, rows, head) {
  const wrap = el('div', 'us-table-wrap');
  const t = el('table', 'us-table sl-table');
  t.append(el('caption', 'sr-only', caption));
  const tr = el('tr');
  columns.forEach((c, i) => {
    const th = el('th', i ? 'num' : '', c);
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
    if (r.diff) th.append(el('span', 'sl-diff', r.diff));
    row.append(th, ...r.cells.map((c) => el('td', 'num', c)));
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
  const phone = () => window.matchMedia('(max-width: 600px)').matches;

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

  const changed = () => load(); // after a dialog's write (the event comes too; the throttle joins them)
  const ctx = () => ({ onChanged: changed, onError: showError });

  function showError(text) {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  }

  // One delivery in the Sales list: day and buyer, the lines, the total, the paid mark, the reference; Edit opens it.
  function deliveryItem(d) {
    const r = deliveryRow(d);
    const li = el('li', 'sl-item');
    const head = el('p', 'sl-item-head');
    head.append(el('span', 'sl-day', r.day), el('span', 'sl-buyer', r.buyer));
    const mark = el('span', `sl-mark${r.paid.unpaid ? ' sl-unpaid' : ''}`, r.paid.text);
    const foot = el('p', 'sl-item-foot');
    foot.append(el('span', 'sl-total num', r.total), mark);
    if (r.reference) foot.append(el('span', 'muted sl-ref', r.reference));
    const edit = el('button', 'link sl-edit', 'Edit');
    edit.type = 'button';
    edit.setAttribute('aria-label', `Edit the sale of ${r.day} to ${r.buyer}`);
    edit.addEventListener('click', () => openSale({ ...ctx(), delivery: d }));
    li.append(head, el('p', 'sl-lines', r.lines), foot, edit);
    return li;
  }

  // A buyer's row in Owed: the name (a button that opens their unpaid sales under it), RM owed, the oldest.
  function owedItem(b) {
    const li = el('li', 'sl-owed-item');
    const toggle = el('button', 'link sl-owed-name', b.buyer);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', String(open.has(b.buyerId)));
    toggle.addEventListener('click', () => {
      if (open.has(b.buyerId)) open.delete(b.buyerId);
      else open.add(b.buyerId);
      painted = '';
      paint();
    });
    const row = el('p', 'sl-owed-row');
    row.append(toggle, el('span', 'num sl-owed-total', rmText(b.total)), el('span', 'muted', `oldest ${ageText(b.oldestAt, Date.now())}`));
    li.append(row);
    if (open.has(b.buyerId)) {
      const ul = el('ul', 'sl-owed-sales');
      for (const d of b.deliveries) {
        const r = deliveryRow(d);
        const item = el('li', 'sl-owed-sale');
        const paid = el('button', '', 'Mark paid');
        paid.type = 'button';
        paid.addEventListener('click', () => openPaid({ ...ctx(), delivery: d }));
        item.append(el('span', 'sl-day', r.day), el('span', 'sl-lines', linesShort(d.lines)), el('span', 'num', r.total),
          el('span', 'muted sl-ref', r.reference), paid);
        ul.append(item);
      }
      li.append(ul);
    }
    return li;
  }

  function paint() {
    const key = JSON.stringify([sales, showAll, [...open]]);
    if (key === painted) return;
    painted = key;
    els.body.hidden = false;
    els.totalsTitle.textContent = rangeText(sales);
    els.tiles.replaceChildren(...tileNodes(pageTiles(sales, Date.now())));

    els.owed.hidden = sales.owed.count === 0;
    els.owedList.replaceChildren(...sales.owed.buyers.map(owedItem));

    const list = sales.deliveries;
    const limit = showAll ? list.length : phone() ? SHOWN_PHONE : SHOWN;
    els.empty.hidden = list.length > 0;
    els.empty.textContent = sales.buyerCount === 0 ? 'No buyers yet. Record a sale to add the first.' : emptyText(period);
    els.list.replaceChildren(...list.slice(0, limit).map(deliveryItem));
    els.more.hidden = list.length <= limit;
    els.more.textContent = `Show all ${list.length}`;

    const crops = cropRows(sales);
    els.crops.hidden = crops.length === 0;
    els.crops.replaceChildren(el('h2', '', 'By crop'),
      table('By crop', CROP_COLUMNS, crops, (c) => [picture('crop', c.crop, { size: 24 }), el('span', '', c.name)]));
    const buyers = buyerRows(sales);
    els.buyersTable.hidden = buyers.length === 0;
    els.buyersTable.replaceChildren(el('h2', '', 'By buyer'), table('By buyer', BUYER_COLUMNS, buyers, (b) => [el('span', '', b.name)]));
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
  els.buyers.addEventListener('click', () => openBuyers(ctx()));
  els.more.addEventListener('click', () => { showAll = true; paint(); });
  q('[data-retry]').addEventListener('click', () => load());
  showPeriod();
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
  };
}

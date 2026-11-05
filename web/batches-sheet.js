// The myGAP 4-2 sheet, #/business/batches/sheet?from=&to= (spec 2026-11-05-batches-design.md 7): a print page of the
// planting material bought and used in the dates, from every batch (GET /api/batches): a receipt row per delivery, a use
// row per placement, the treatment columns blank to write in. The From and To boxes replace the address (no new mount); the last 90 days
// when it has none. The Harvest sheet's print rules (hv-sheet classes, body.printing-sheet) give it its paper.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { farmDate } from './tasks-math.js';
import { BATCHES_HASH, batchSheetHash } from './route.js';
import { sheetRows, SHEET_TITLE, SHEET_COLUMNS, fullDate } from './batches-math.js';
import { dateHint } from './harvest-math.js';

const REFRESH_MS = 60_000;
const DAY_MS = 86_400_000;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

const TEMPLATE = `
  <div class="hv-sheet bt-sheet">
    <div class="hv-sheet-tools">
      <a class="back" href="${BATCHES_HASH}">Back to Batches</a>
      <div class="bt-sheet-dates">
        <label>From <input type="date" data-from></label>
        <label>To <input type="date" data-to></label>
      </div>
      <button type="button" class="primary" data-print>Print</button>
    </div>
    <h1 class="page-title hv-sheet-title" tabindex="-1"></h1>
    <p class="bt-sheet-note" role="alert" data-range-note hidden>From must be on or before To</p>
    <dl class="hv-sheet-facts">
      <div><dt>Farm</dt><dd class="hv-write-line"></dd></div>
      <div><dt>Period</dt><dd data-period></dd></div>
    </dl>
    <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
    <p class="none" data-empty hidden>No planting material bought or used in these dates.</p>
    <div class="hv-sheet-wrap" data-wrap hidden>
      <table class="hv-sheet-table bt-sheet-table">
        <thead><tr data-head></tr></thead>
        <tbody data-rows></tbody>
      </table>
    </div>
  </div>`;

let mountSeq = 0;

export function mountSheet(container, { from = null, to = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  const today = farmDate(Date.now());
  if (!from || !to || from > to) {
    from = farmDate(Date.now() - 89 * DAY_MS);
    to = today;
    history.replaceState(null, '', batchSheetHash(from, to)); // the dates the sheet shows, in its address
  }
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    from: q('[data-from]'), to: q('[data-to]'), period: q('[data-period]'), banner: q('.banner'), bannerText: q('[data-banner-text]'),
    note: q('[data-range-note]'), empty: q('[data-empty]'), wrap: q('[data-wrap]'), rows: q('[data-rows]'),
  };
  document.title = 'myGAP 4-2 sheet · Mushroom farm';
  document.body.classList.add('printing-sheet');
  q('.hv-sheet-title').textContent = SHEET_TITLE;
  q('[data-head]').append(...SHEET_COLUMNS.map((c) => {
    const th = el('th', '', c);
    th.scope = 'col';
    return th;
  }));
  els.from.value = from;
  els.to.value = to;
  els.from.max = today;
  els.to.max = today;
  els.from.title = dateHint(from);
  els.to.title = dateHint(to);
  const midday = (d) => Date.parse(`${d}T04:00:00Z`); // 12:00 farm time of a date, for the words
  const showPeriod = () => { els.period.textContent = `${fullDate(midday(from))} – ${fullDate(midday(to))}`; };
  showPeriod();
  let batches = null; // the last read, for a changed date to repaint from
  // A changed date: the address is replaced (not mounted again: the boxes keep their focus), the period and rows follow.
  const onDate = () => {
    const [f, t] = [els.from.value, els.to.value];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f) || !/^\d{4}-\d{2}-\d{2}$/.test(t)) { els.note.hidden = true; return; } // a box half typed or cleared
    els.note.hidden = f <= t;
    if (f > t) return;
    from = f;
    to = t;
    els.from.title = dateHint(from);
    els.to.title = dateHint(to);
    history.replaceState(null, '', batchSheetHash(from, to));
    showPeriod();
    if (batches) paint(batches);
  };
  els.from.addEventListener('change', onDate);
  els.to.addEventListener('change', onDate);

  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  function paint(data) {
    batches = data;
    const rows = sheetRows(Array.isArray(data?.batches) ? data.batches : [], { from, to, today: farmDate(Date.now()) });
    const key = JSON.stringify([from, to, rows]);
    if (key === painted) return;
    painted = key;
    els.empty.hidden = rows.length > 0;
    els.wrap.hidden = rows.length === 0;
    els.rows.replaceChildren(...rows.map((cells) => {
      const tr = el('tr');
      tr.append(...cells.map((c, i) => el('td', i >= 6 && i <= 8 ? 'hv-write' : '', c)));
      return tr;
    }));
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', '/api/batches');
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(data);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const reload = createThrottle(() => { if (alive()) load(); });
  const offs = [
    live.on('batches', () => reload.call()),
    live.on('room', (d) => { if (d.part === 'room') reload.call(); }), // a room renamed: the Block / area column names it
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }
    }),
  ];
  q('[data-print]').addEventListener('click', () => window.print());
  q('[data-retry]').addEventListener('click', () => load());
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offs) off();
    document.body.classList.remove('printing-sheet');
  };
}

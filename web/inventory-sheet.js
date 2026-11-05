// The myGAP 4-5 sheet, #/business/inventory/sheet?days=30 (spec 2026-11-05-inventory-design.md 5 and 5.1): the chemical
// items' purchases and uses of the last 30, 90 or 365 days as the sheet's twelve columns, Equipment, PHI and Re-entry left
// blank to write in. A print page as the Harvest 4-6 sheet (its layout classes and body.printing-sheet).

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { INVENTORY_HASH, inventorySheetHash } from './route.js';
import { live } from './live.js';
import { createThrottle } from './live-math.js';
import { SHEET_TITLE, SHEET_COLUMNS, SHEET_WRITE, SHEET_WIDTHS_MM, SHEET_BLANK_ROWS, SHEET_DAYS, sheetCells, sheetRange, sheetEmpty, sheetPeriod } from './inventory-math.js';
import { farmDate } from './tasks-math.js';

const TEMPLATE = `
  <div class="hv-sheet iv-sheet">
    <div class="hv-sheet-tools">
      <a class="back" data-back>Back to Inventory</a>
      <div class="range-bar" role="group" aria-label="Period" data-range></div>
      <button type="button" class="primary" data-print>Print</button>
    </div>
    <h1 class="page-title hv-sheet-title" tabindex="-1"></h1>
    <dl class="hv-sheet-facts">
      <div><dt>Farm</dt><dd class="hv-write-line"></dd></div>
      <div><dt>Period</dt><dd data-period></dd></div>
    </dl>
    <div class="banner" role="alert" hidden>
      <span data-banner-text></span>
      <button type="button" data-retry>Retry</button>
    </div>
    <p class="none" data-empty hidden></p>
    <div class="hv-sheet-wrap" data-wrap hidden>
      <table class="hv-sheet-table iv-sheet-table">
        <caption class="sr-only">Chemicals bought and used</caption>
        <colgroup data-cols></colgroup>
        <thead><tr data-head></tr></thead>
        <tbody data-rows></tbody>
      </table>
    </div>
    <div class="iv-sheet-foot" data-foot hidden>
      <p>Sheet reviewed by: <span class="iv-sheet-line"></span> (Management) on <span class="iv-sheet-line iv-sheet-line-short"></span></p>
    </div>
  </div>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

let mountSeq = 0;

export function mount(container, { days = 30 } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    period: q('[data-period]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), empty: q('[data-empty]'), wrap: q('[data-wrap]'),
    rows: q('[data-rows]'), range: q('[data-range]'), foot: q('[data-foot]'),
  };
  document.title = 'myGAP 4-5 sheet · Mushroom farm';
  document.body.classList.add('printing-sheet'); // print: no top bar, no buttons, light colours (styles.css)
  q('[data-back]').href = INVENTORY_HASH;
  q('.hv-sheet-title').textContent = SHEET_TITLE;
  // The printed widths (a fixed layout in print: styles.css), so the write-in columns are wide enough to write in.
  q('[data-cols]').append(...SHEET_WIDTHS_MM.map((mm) => {
    const col = el('col');
    col.style.width = `${mm}mm`;
    return col;
  }));
  q('[data-head]').append(...SHEET_COLUMNS.map((c) => {
    const th = el('th', '', c);
    th.scope = 'col';
    return th;
  }));

  let period = days;
  let seq = 0;
  const buttons = SHEET_DAYS.map((n) => {
    const b = el('button', '', `${n} days`);
    b.type = 'button';
    b.addEventListener('click', () => pick(n));
    els.range.append(b);
    return [n, b];
  });
  // The Period line as the Batches sheet's: the dates at once (the last `period` farm days, today included), never a loading word
  // nor a dash; the reply's own dates replace them.
  const showPeriod = () => {
    els.period.textContent = sheetRange(sheetPeriod(period, farmDate(Date.now())));
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === period));
    els.empty.textContent = sheetEmpty(period);
  };
  function pick(n) {
    if (n === period) return;
    period = n;
    history.replaceState(null, '', inventorySheetHash(n));
    showPeriod();
    load();
  }

  // The records, then SHEET_BLANK_ROWS empty rows for entries by hand (audit #24): with no records the sheet still prints
  // as a blank form, under its empty line.
  function paint(sheet) {
    els.period.textContent = sheetRange(sheet);
    els.empty.hidden = sheet.rows.length > 0;
    els.wrap.hidden = false;
    els.foot.hidden = false;
    const blank = Array.from({ length: SHEET_BLANK_ROWS }, () => {
      const tr = el('tr', 'iv-sheet-blank');
      tr.append(...SHEET_COLUMNS.map(() => el('td', 'hv-write')));
      return tr;
    });
    els.rows.replaceChildren(...sheet.rows.map((r) => {
      const tr = el('tr');
      tr.append(...sheetCells(r).map((c, i) => el('td', SHEET_WRITE.includes(i) ? 'hv-write' : '', c)));
      return tr;
    }), ...blank);
  }

  async function load() {
    if (!alive()) return;
    const mine = ++seq;
    try {
      const sheet = await request('GET', `/api/inventory/sheet?days=${period}`);
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(sheet);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      els.wrap.hidden = true;
      els.foot.hidden = true;
      els.empty.hidden = true;
    }
  }

  q('[data-print]').addEventListener('click', () => window.print());
  q('[data-retry]').addEventListener('click', () => load());
  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [live.on('inventory', () => reload.call()), live.onStatus((up) => { if (up) reload.call(); })];
  showPeriod();
  load();

  return function unmount() {
    mountSeq++;
    reload.cancel();
    for (const off of offLive) off();
    document.body.classList.remove('printing-sheet');
  };
}

// The farm's Harvest page, #/harvest (spec 2026-11-04-harvest-design.md 7): what every room picked over 7, 30, 90 or 365
// days, its value and cost per kg, a bar chart of kg per day, week or month, By room and By crop; Export CSV and the myGAP
// sheet, #/harvest/sheet, a print page of the production and sales record (mountSheet). Both ask for GET /api/harvest on
// the harvest events and crop changes (New blocks starts a run), when the stream comes back, and on a timer (as Calendar).

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { roomHash, sheetHash, canonicalHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { drawTimeBars } from './bar-chart.js';
import { missingLine } from './harvest-card.js';
import { mainCrop } from './room-card-math.js';
import { picture, emptyPicture } from './pictures.js';
import {
  pageTiles, harvestBars, barTip, harvestTicks, rangeText, emptyText, roomRows, ROOM_COLUMNS, cropRows, CROP_COLUMNS, chartTitle,
  chartLabel, sheetRows, SHEET_TITLE, SHEET_COLUMNS,
} from './harvest-math.js';

const REFRESH_MS = 60_000;
const DAYS = [7, 30, 90, 365];

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Harvest</h1>
      <p class="page-sub" data-sub>Loading…</p>
    </div>
    <div class="hv-tools">
      <div class="range-bar" role="group" aria-label="Period" data-range></div>
      <a class="button" data-csv download>Export CSV</a>
      <a class="button" data-sheet>myGAP sheet</a>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <div class="hv-page" data-body hidden>
    <section class="card hv-totals" aria-labelledby="hv-totals-title">
      <h2 id="hv-totals-title" data-totals-title></h2>
      <div class="us-tiles hv-tiles" data-tiles></div>
      <div data-missing></div>
      <h3 class="hv-chart-title" data-chart-title></h3>
      <div class="chart-host" data-chart></div>
    </section>
    <section class="card hv-by-room" data-rooms></section>
    <section class="card hv-by-crop" data-crops></section>
  </div>
  <section class="card hv-page-empty" data-empty hidden><p class="none" data-empty-text></p></section>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// A card's table (its h2 names it; the caption says it again to a screen reader): the first column names the row (a picture
// and words, built by `head`), the others are figures.
function table(caption, columns, rows, head) {
  const wrap = el('div', 'us-table-wrap');
  const t = el('table', 'us-table hv-farm-table');
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
    const name = el('span', 'hv-name');
    name.append(...head(r));
    th.append(name);
    row.append(th, ...r.cells.map((c) => el('td', 'num', c)));
    body.append(row);
  }
  t.append(thead, body);
  wrap.append(t);
  return wrap;
}

// How the page and the sheet stay current: the harvest events and a room's crops (a run starts or ends), the stream back,
// and the timer. load() is the page's; returns stop().
function keepCurrent(load, timerOf) {
  const reload = createThrottle(load);
  const offLive = [
    live.on('harvest', () => reload.call()),
    live.on('room', (d) => { if (d.part === 'crop') reload.call(); }),
    live.onStatus((up) => { if (up) reload.call(); else timerOf(REFRESH_MS); }),
  ];
  return () => {
    reload.cancel();
    for (const off of offLive) off();
  };
}

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { days = 30 } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    sub: q('[data-sub]'), range: q('[data-range]'), csv: q('[data-csv]'), sheet: q('[data-sheet]'), banner: q('.banner'),
    bannerText: q('[data-banner-text]'), body: q('[data-body]'), totalsTitle: q('[data-totals-title]'), tiles: q('[data-tiles]'),
    missing: q('[data-missing]'), chartTitle: q('[data-chart-title]'), chart: q('[data-chart]'), rooms: q('[data-rooms]'),
    crops: q('[data-crops]'), empty: q('[data-empty]'), emptyText: q('[data-empty-text]'),
  };
  document.title = 'Harvest · Mushroom farm';

  let period = days;
  let farm = null; // GET /api/harvest of the period on show
  let seq = 0;
  let timer = null;
  let outdated = false;
  let chart = null;
  let painted = '';

  const buttons = DAYS.map((n) => {
    const b = el('button', '', `${n} days`);
    b.type = 'button';
    b.addEventListener('click', () => pick(n));
    els.range.append(b);
    return [n, b];
  });

  // The period in the address (as Calendar keeps its day: the page, its scroll and the focus stay), the links and the buttons.
  function showPeriod() {
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === period));
    els.csv.href = `/api/harvest.csv?days=${period}`;
    els.sheet.href = sheetHash(period);
    els.emptyText.textContent = emptyText(period);
    els.totalsTitle.textContent = `The last ${period} days`;
  }

  function pick(n) {
    if (n === period) return;
    period = n;
    history.replaceState(null, '', canonicalHash({ name: 'harvest', days: n }));
    farm = null; // the last period's figures go: they are not this one's
    painted = '';
    els.body.hidden = true;
    els.empty.hidden = true;
    showPeriod();
    els.sub.textContent = 'Loading…';
    load();
  }

  function roomHead(r) {
    const crop = mainCrop(r.crops);
    const a = el('a', '', r.name);
    a.href = roomHash(r.id, 'harvest');
    return [crop ? picture('crop', crop, { size: 24 }) : emptyPicture(24), a];
  }

  function paint() {
    const key = JSON.stringify(farm);
    if (key === painted) return; // a refresh with nothing new leaves the page (and the chart's tip) alone
    painted = key;
    els.sub.textContent = rangeText(farm);
    const none = !(farm.totals?.kg > 0);
    els.body.hidden = none;
    els.empty.hidden = !none;
    if (none) return;
    els.tiles.replaceChildren(...pageTiles(farm).map((t) => {
      const tile = el('div', 'us-tile');
      tile.append(el('p', 'us-label', t.label), el('p', 'us-kwh', t.value));
      if (t.line) tile.append(el('p', 'us-basis hv-basis', t.line));
      return tile;
    }));
    const note = missingLine(farm.missing);
    els.missing.replaceChildren(...(note ? [note] : []));
    els.chartTitle.textContent = chartTitle(farm);
    const { bars, range } = harvestBars(farm);
    const shown = farm;
    const opts = {
      bars, range, color: 'var(--s-harvest)', label: chartLabel(shown),
      ticksFor: (w) => harvestTicks(shown, w), tip: (bar) => barTip(shown.bucket, bar.b),
    };
    if (chart) chart.update(opts);
    else chart = drawTimeBars(els.chart, opts);
    const rooms = roomRows(farm);
    els.rooms.replaceChildren(el('h2', '', 'By room'), el('p', 'muted hv-card-note', 'kg and RM over the period; kg per block and BE of the run under way.'),
      table('By room', ROOM_COLUMNS, rooms, roomHead));
    els.crops.replaceChildren(el('h2', '', 'By crop'),
      table('By crop', CROP_COLUMNS, cropRows(farm), (c) => [picture('crop', c.crop, { size: 24 }), el('span', '', c.name)]));
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', `/api/harvest?days=${period}`);
      if (!alive() || mine !== seq) return;
      farm = data;
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (!farm) els.sub.textContent = '';
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  q('[data-retry]').addEventListener('click', () => load());
  const stop = keepCurrent(() => { if (alive()) load(); }, (ms) => {
    if (outdated) return;
    clearTimeout(timer);
    timer = setTimeout(load, ms);
  });
  showPeriod();
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    stop();
    chart?.destroy();
  };
}

// ---- the myGAP sheet ----

const SHEET_TEMPLATE = `
  <div class="hv-sheet">
    <div class="hv-sheet-tools">
      <a class="back" data-back>Back to Harvest</a>
      <button type="button" class="primary" data-print>Print</button>
    </div>
    <h1 class="page-title hv-sheet-title" tabindex="-1"></h1>
    <dl class="hv-sheet-facts">
      <div><dt>Farm</dt><dd data-farm></dd></div>
      <div><dt>Period</dt><dd data-period>Loading…</dd></div>
    </dl>
    <div class="banner" role="alert" hidden>
      <span data-banner-text></span>
      <button type="button" data-retry>Retry</button>
    </div>
    <p class="none" data-empty hidden></p>
    <div class="hv-sheet-wrap" data-wrap hidden>
      <table class="hv-sheet-table">
        <thead><tr data-head></tr></thead>
        <tbody data-rows></tbody>
      </table>
    </div>
  </div>`;

// The farm's name as the top bar shows it.
const farmName = () => document.querySelector('.brand-text strong')?.textContent.trim() || 'Mushroom farm';

export function mountSheet(container, { days = 30 } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = SHEET_TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    period: q('[data-period]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), empty: q('[data-empty]'), wrap: q('[data-wrap]'),
    rows: q('[data-rows]'),
  };
  document.title = 'myGAP sheet · Mushroom farm';
  document.body.classList.add('printing-sheet'); // print: no top bar, no buttons, light colours (styles.css)
  q('[data-back]').href = canonicalHash({ name: 'harvest', days });
  q('.hv-sheet-title').textContent = SHEET_TITLE;
  q('[data-farm]').textContent = farmName();
  q('[data-head]').append(...SHEET_COLUMNS.map((c, i) => {
    const th = el('th', i >= 3 && i <= 6 ? 'num' : '', c);
    th.scope = 'col';
    return th;
  }));
  els.empty.textContent = emptyText(days);

  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  function paint(farm) {
    const key = JSON.stringify([farm.from, farm.to, farm.records]);
    if (key === painted) return;
    painted = key;
    els.period.textContent = rangeText(farm);
    const rows = sheetRows(farm.records);
    els.empty.hidden = rows.length > 0;
    els.wrap.hidden = rows.length === 0;
    els.rows.replaceChildren(...rows.map((cells) => {
      const tr = el('tr');
      tr.append(...cells.map((c, i) => el('td', `${i >= 3 && i <= 6 ? 'num' : ''}${i >= 4 ? ' hv-write' : ''}`.trim(), c)));
      return tr;
    }));
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', `/api/harvest?days=${days}`);
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(data);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (!painted) els.period.textContent = '—';
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  q('[data-print]').addEventListener('click', () => window.print());
  q('[data-retry]').addEventListener('click', () => load());
  const stop = keepCurrent(() => { if (alive()) load(); }, (ms) => {
    if (outdated) return;
    clearTimeout(timer);
    timer = setTimeout(load, ms);
  });
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    stop();
    document.body.classList.remove('printing-sheet');
  };
}

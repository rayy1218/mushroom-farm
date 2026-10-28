// The "Energy and water" card of the room page: tiles, two 30-day bar charts and the breakdown per machine.
// Spec 2026-10-20-energy-water-outdoor-design.md section 7. Asked at most once a minute (usage changes slowly).

import { request } from './api.js';
import {
  USAGE_DAYS, USAGE_REFRESH_MS, usageTiles, barSeries, barLayout, barAt, barsSummary, barTip, axisLabel,
  breakdown, breakdownNote, formatKWh, formatRM,
} from './usage-math.js';

const NS = 'http://www.w3.org/2000/svg';
let patternSeq = 0; // each chart's hatch pattern needs an id of its own

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function text(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// The tiles (Today, 7 days, 30 days): the numbers and the word "metered" or "estimated".
export function usageTileNodes(usage, withWeek = true) {
  return usageTiles(usage, withWeek).map((t) => {
    const tile = text('div', 'us-tile');
    tile.append(text('p', 'us-label', t.label), text('p', 'us-kwh', t.kWh), text('p', 'us-line', t.cost));
    tile.append(text('p', 'us-line', t.water));
    if (t.waterCost !== null) tile.append(text('p', 'us-line', t.waterCost));
    if (t.basis) tile.append(text('p', 'us-basis', t.basis));
    return tile;
  });
}

// A bar chart of one number per day, drawn 1:1 at the host's width (a ResizeObserver redraws it).
// opts: { series (barSeries), kind: 'energy' | 'water' | 'run-energy' | 'run-water' (a simulation's days: no metered or estimated), color, unit }. Returns { update(opts), destroy() }.
export function drawBarChart(host, opts) {
  let current = opts;
  let svg = null;
  let layout = null;
  let lastWidth = -1;
  const id = `hatch-${++patternSeq}`;
  const tip = text('div', 'tip');
  tip.hidden = true;
  host.append(tip);

  function draw() {
    const width = Math.floor(host.clientWidth);
    lastWidth = width;
    svg?.remove();
    svg = null;
    layout = null;
    tip.hidden = true;
    if (width < 40) return;
    const height = width < 420 ? 170 : 200;
    const { series, kind, color } = current;
    layout = barLayout(series, width, height);
    const { plot, bars } = layout;
    svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': barsSummary(series, kind) });
    // the hatch of an estimated day
    const defs = el('defs');
    const pattern = el('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pattern.append(el('line', { x1: 0, y1: 0, x2: 0, y2: 5, 'stroke-width': 2.5, style: `stroke:${color}` }));
    defs.append(pattern);
    svg.append(defs);
    for (const t of layout.yTicks) {
      svg.append(el('line', { x1: plot.x0, x2: plot.x1, y1: t.y, y2: t.y, style: 'stroke:var(--grid)', 'stroke-width': 1 }));
      svg.append(el('text', { x: plot.x0 - 6, y: t.y + 4, 'text-anchor': 'end', style: 'fill:var(--muted)', 'font-size': 12 }, axisLabel(t.v)));
    }
    svg.append(el('line', { x1: plot.x0, x2: plot.x1, y1: plot.y0, y2: plot.y0, style: 'stroke:var(--axis)', 'stroke-width': 1 }));
    for (const b of bars) {
      if (b.h <= 0) continue;
      const solid = kind !== 'energy' || b.metered; // a simulation's days (kind 'run-energy') are not estimates
      svg.append(el('rect', {
        x: b.x.toFixed(1), y: b.y.toFixed(1), width: b.w.toFixed(1), height: b.h.toFixed(1), 'stroke-width': 1,
        style: solid ? `fill:${color};stroke:${color}` : `fill:url(#${id});stroke:${color}`,
      }));
    }
    for (const t of layout.xTicks) {
      svg.append(el('text', { x: t.x, y: height - 6, 'text-anchor': t.anchor ?? 'middle', style: 'fill:var(--muted)', 'font-size': 12 }, t.label));
    }
    svg.addEventListener('pointerdown', onPointer);
    svg.addEventListener('pointermove', onPointer);
    svg.addEventListener('pointerleave', onLeave);
    host.prepend(svg);
  }

  function onPointer(event) {
    if (!layout || layout.bars.length === 0) return;
    const box = svg.getBoundingClientRect();
    const i = barAt(layout, event.clientX - box.left);
    const b = layout.bars[i];
    tip.textContent = barTip(b, current.kind);
    tip.hidden = false;
    const w = tip.offsetWidth;
    const x = b.x + b.w / 2;
    tip.style.left = `${Math.max(0, x + 10 + w > Number(svg.getAttribute('width')) ? x - 10 - w : x + 10)}px`;
  }

  function onLeave(event) {
    if (event.pointerType === 'touch') return; // a finger lifting keeps the reading on screen
    tip.hidden = true;
  }

  const observer = new ResizeObserver(() => {
    if (Math.floor(host.clientWidth) !== lastWidth) draw();
  });
  observer.observe(host);
  draw();

  return {
    update(next) {
      current = next;
      draw();
    },
    destroy() {
      observer.disconnect();
      svg?.remove();
      tip.remove();
    },
  };
}

const PRICE_HINT = 'Water costs are not shown: enter the water rate on Settings.';

// host: an element to fill. Returns { refresh(force), destroy() }: refresh asks the server unless it asked less than a minute ago.
export function createUsageCard(host, { roomId, getRoom }) {
  let seq = 0; // every load takes a token; a reply that finds it changed is dropped
  let loadedAt = 0;
  let loading = false;
  let usage = null;
  let energyChart = null;
  let waterChart = null;

  host.className = 'card us-card';
  host.append(text('h2', '', 'Energy and water by day'));
  const tiles = text('div', 'us-tiles');
  const hint = text('p', 'muted us-hint', PRICE_HINT);
  hint.hidden = true;
  const msg = text('p', 'none', 'Loading…');
  const charts = text('div', 'us-charts');
  const energyBox = text('div', 'us-chart');
  const waterBox = text('div', 'us-chart');
  energyBox.append(text('h3', '', 'Energy per day (kWh), last 30 days'));
  waterBox.append(text('h3', '', 'Water per day (L), last 30 days'));
  const energyHost = text('div', 'chart-host');
  const waterHost = text('div', 'chart-host');
  energyBox.append(energyHost);
  waterBox.append(waterHost);
  const legend = text('p', 'legend');
  legend.append(text('span', 'swatch swatch-solid', ''), document.createTextNode('Metered'), text('span', 'swatch swatch-hatch', ''), document.createTextNode('Estimated'));
  energyBox.append(legend);
  charts.append(energyBox, waterBox);
  const tableBox = text('div', 'us-table-box');
  host.append(tiles, hint, msg, charts, tableBox);
  charts.hidden = true;

  function paint() {
    const days = Array.isArray(usage?.days) ? usage.days : [];
    tiles.replaceChildren(...usageTileNodes(usage));
    hint.hidden = !usage || Number.isFinite(usage.prices?.water);
    msg.hidden = days.length > 0;
    if (days.length === 0) msg.textContent = usage ? 'No usage recorded yet' : msg.textContent;
    charts.hidden = days.length === 0;
    const energy = { series: barSeries(days, 'kWh'), kind: 'energy', color: 'var(--s-energy)' };
    const water = { series: barSeries(days, 'waterL'), kind: 'water', color: 'var(--s-water)' };
    legend.hidden = !energy.series.some((s) => s.v !== null);
    if (!energyChart) energyChart = drawBarChart(energyHost, energy);
    else energyChart.update(energy);
    if (!waterChart) waterChart = drawBarChart(waterHost, water);
    else waterChart.update(water);
    tableBox.replaceChildren(...(days.length ? [breakdownTable(days, usage?.prices?.electricity, getRoom?.()?.dehumidifier === true, getRoom?.()?.lights === true)] : []));
  }

  async function refresh(force = false) {
    if (!force && (loading || Date.now() - loadedAt < USAGE_REFRESH_MS)) return; // a forced one supersedes a load in flight
    const me = ++seq;
    loading = true;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/usage?days=${USAGE_DAYS}`);
      if (me !== seq) return;
      usage = data;
      loadedAt = Date.now();
      paint();
    } catch (err) {
      if (me !== seq) return;
      loadedAt = Date.now(); // do not ask again at once; the last numbers stay
      if (!usage) msg.textContent = err.status === 404 ? 'Usage is not available on this server' : "Couldn't load the usage";
    } finally {
      if (me === seq) loading = false;
    }
  }

  return {
    refresh,
    destroy() {
      seq++;
      energyChart?.destroy();
      waterChart?.destroy();
      host.replaceChildren();
    },
  };
}

// The 30-day breakdown per machine: kWh, share and cost; a total row; one line on how the days were worked out.
function breakdownTable(days, price, dehumidifier, lights) {
  const b = breakdown(days, price, { dehumidifier, lights });
  const wrap = text('div', 'us-table-wrap');
  const table = text('table', 'us-table');
  table.append(text('caption', '', 'Energy by machine, last 30 days'));
  const head = text('tr');
  for (const h of ['Machine', 'kWh', 'Share', 'Cost']) {
    const th = text('th', h === 'Machine' ? '' : 'num', h);
    th.scope = 'col';
    head.append(th);
  }
  const thead = text('thead');
  thead.append(head);
  table.append(thead);
  const body = text('tbody');
  for (const r of b.rows) {
    const tr = text('tr');
    const th = text('th', '', r.label);
    th.scope = 'row';
    tr.append(th, text('td', 'num', formatKWh(r.kWh)), text('td', 'num', r.share === null ? '—' : `${Math.round(r.share * 100)} %`), text('td', 'num', formatRM(r.cost)));
    body.append(tr);
  }
  const foot = text('tr', 'total');
  const th = text('th', '', 'Total');
  th.scope = 'row';
  foot.append(th, text('td', 'num', formatKWh(b.total.kWh)), text('td', 'num', ''), text('td', 'num', formatRM(b.total.cost)));
  body.append(foot);
  table.append(body);
  wrap.append(table, text('p', 'muted us-note', breakdownNote(days, { dehumidifier, lights })));
  return wrap;
}

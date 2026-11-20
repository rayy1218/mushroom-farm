// The Economics page's stage-2 sections (spec 2026-11-12-economics-stage-2-design.md 4 to 7): the DOM of the tiles, the bars,
// what moves profit most, the price × yield map and the runs against the plan. Every word and
// figure comes from the pure modules (economics-plan.js, economics-math.js, economics-map.js, economics-swing.js); these
// only build the nodes.
//   el · paintPlans · paintTiles · paintBars · labelNodes · paintMap · paintSwing

import {
  runMonths, runRows, gapsOf, againstLine, gapsLine, planLine, mixedLine, partialLine, missingLine, progressOf, progressLine,
  planValuesOf, runTitle, leftOutLine, emptyLine, olderText, noDayLine, PAST_SHOWN,
} from './economics-plan.js';
import { runHash } from './route.js';
import { cellText, cellLabel, lineWords, priceHead, yieldHead } from './economics-map.js';
import { TOP, swingText, swingEnds, stillLine } from './economics-swing.js';
import { figureLabel } from './economics-defaults.js';
import { arrowText, figureText } from './economics-math.js';
import { labelOf } from './economics-figures.js';
import { moneyText } from './costs-math.js';

export function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}

// ---- Your runs against the plan (7.8) ----
// node: the section's box; view: the plans reply, or null; values and ctx: the page's figures now (a run before plans were
// kept is worked out with them, typing included); room: its name; state: { open: Map runId → open (and 'older'), failed,
// outdated, onRetry }: kept by the page across repaints.
export function paintPlans(node, { view, values, ctx, room, crop }, state) {
  const out = [];
  if (state.outdated) {
    out.push(el('p', 'muted ec-runs-line', 'This farm app is older than the page; reload once it is updated.'));
    node.replaceChildren(...out);
    return;
  }
  if (state.failed) {
    const p = el('p', 'ec-parts', '');
    p.append(el('span', '', "Couldn't read your runs just now"));
    const retry = el('button', 'bz-quiet', 'Retry');
    retry.type = 'button';
    retry.dataset.focusKey = 'retry-runs';
    retry.addEventListener('click', state.onRetry);
    p.append(retry);
    out.push(p);
  }
  if (!view) {
    node.replaceChildren(...out);
    return;
  }
  const plan = (runId) => view.plans[runId] ?? { at: null, before: true };
  if (view.current) out.push(currentNode(view.current, plan(view.current.runId), values, ctx, crop));
  const past = view.past.map((run, i) => pastNode(run, plan(run.runId), { values, ctx, room, crop, errors: view.errors ?? {} }, state, i === 0));
  out.push(...past.slice(0, PAST_SHOWN));
  if (past.length > PAST_SHOWN) {
    const older = el('details', 'ec-fold ec-older');
    const s = el('summary', 'part-title ec-fold-head');
    s.dataset.focusKey = 'runs-older'; // on the summary, the thing focused (the review)
    s.append(el('h3', 'ec-fold-title', olderText(past.length - PAST_SHOWN)));
    older.open = state.open.get('older') ?? false;
    older.addEventListener('toggle', () => state.open.set('older', older.open));
    older.append(s, ...past.slice(PAST_SHOWN));
    out.push(older);
  }
  if (!view.past.length) out.push(el('p', 'muted ec-runs-line', emptyLine({ crop, room, current: Boolean(view.current) })));
  const left = leftOutLine(view.leftOut?.partial ?? 0);
  if (left) out.push(el('p', 'muted ec-runs-line', left));
  node.replaceChildren(...out);
}

// The run in progress: its day and kg against the plan by now, a bar under it (its line says it), where the plan came from.
function currentNode(current, plan, values, ctx, crop) {
  const box = el('div', 'ec-current');
  if (current.day === null) {
    box.append(el('p', 'ec-progress', noDayLine(current)));
    const a = el('a', 'co-link ec-alone', 'Give its block-in day');
    a.href = runHash(current.runId);
    box.append(a);
    return box;
  }
  const p = progressOf(current, planValuesOf(plan, values, ctx, crop).values);
  box.append(el('p', 'ec-progress', progressLine(p)));
  const bar = el('div', 'ec-progress-bar');
  bar.setAttribute('aria-hidden', 'true');
  const fill = el('span', '');
  fill.style.width = `${Math.min(100, p.planTotal > 0 ? (p.kg / p.planTotal) * 100 : 0)}%`;
  const due = el('span', 'ec-progress-due'); // where the plan expected to be by now
  due.style.left = `${Math.min(100, p.planTotal > 0 ? (p.planKg / p.planTotal) * 100 : 0)}%`;
  bar.append(fill, due);
  box.append(bar, el('p', 'muted ec-runs-line', planLine(plan)));
  return box;
}

// A finished run: a fold, its title its days and month, inside the table of plan against the run and its lines.
function pastNode(run, plan, { values, ctx, room, crop, errors }, state, newest) {
  const months = runMonths(plan, run, values, ctx, crop);
  const d = el('details', 'ec-fold ec-run');
  d.dataset.run = String(run.runId);
  d.open = state.open.get(run.runId) ?? newest; // the newest open until the owner folds it
  d.addEventListener('toggle', () => state.open.set(run.runId, d.open));
  const s = el('summary', 'part-title ec-fold-head');
  s.dataset.focusKey = `run:${run.runId}`;
  const title = runTitle(run, months);
  const h3 = el('h3', 'ec-fold-title');
  const money = moneyText(months.run.profit); // a loss's figure in the critical text, as in the table (the UI check)
  const at = months.run.profit < 0 ? title.indexOf(money) : -1;
  if (at < 0) h3.textContent = title;
  else h3.append(title.slice(0, at), el('span', 'co-loss', money), title.slice(at + money.length));
  s.append(h3);
  const t = el('table', 'us-table ec-run-table');
  t.append(el('caption', 'sr-only', `${title.split(' · ')[0]} against its plan`));
  const head = el('tr');
  for (const [text, cls] of [['Figure', ''], ['Plan', 'num'], ['This run', 'num']]) {
    const th = el('th', cls, text);
    th.scope = 'col';
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const r of runRows(plan, run, values, ctx, crop, { months, errors })) {
    const tr = el('tr');
    tr.dataset.row = r.key;
    const th = el('th', '', r.label);
    th.scope = 'row';
    const loss = (text) => (r.key === 'profit' && text.startsWith('\u2212') ? el('span', 'co-loss', text) : text); // a loss's figure, as everywhere
    const runCell = el('td', `num${r.tone === 'warn' ? ' ec-warn' : ''}`);
    runCell.append(loss(r.run));
    if (r.sub) runCell.append(el('span', 'ec-sub', r.sub));
    const planCell = el('td', 'num');
    planCell.append(loss(r.plan));
    tr.append(th, planCell, runCell);
    body.append(tr);
  }
  t.append(thead, body);
  const lines = [againstLine(months.diff), gapsLine(gapsOf(plan, run, values, ctx, crop, { months })), planLine(plan), missingLine(months.missing),
    mixedLine(run, room), partialLine(run)].filter(Boolean);
  d.append(s, t, ...lines.map((text, i) => el('p', `ec-runs-line${i === 0 ? '' : ' muted'}`, text)));
  return d;
}

// ---- The month's tiles (4.1): Costs' stat strip; the first three say again what the sentence before them says (hidden from
// a reader), the fourth a button to its bar ----
export function paintTiles(node, tiles, { onBest }) {
  node.replaceChildren(...tiles.map((t) => {
    const best = t.key === 'best';
    const tile = el(best ? 'button' : 'div', `us-tile ec-tile${best ? ' ec-tile-best' : ''}`);
    tile.dataset.tile = t.key;
    if (best) {
      tile.type = 'button';
      tile.dataset.focusKey = 'tile:best';
      tile.setAttribute('aria-label', `${t.label}: ${t.way}, ${t.figure} a month, ${t.caption}. Show it in the bars`);
      tile.addEventListener('click', () => onBest(t.wayKey));
    } else tile.setAttribute('aria-hidden', 'true');
    const part = best ? 'span' : 'p'; // a button holds phrasing content only (the UI check)
    const figure = el(part, 'us-kwh');
    if (best) figure.append(el('span', 'ec-tile-way', t.way));
    figure.append(t.tone === 'loss' ? el('span', 'co-loss', t.figure) : t.figure);
    tile.append(el(part, 'us-label', t.label), figure, el(part, `us-basis ec-tile-caption${t.captionTone === 'loss' ? ' co-loss' : ''}`, t.caption));
    return tile;
  }));
}

// ---- Profit per way (4.2): a list, each shown way a button marking its column; the bars' shapes hidden from a reader ----
export function paintBars(node, bars, { picked, onPick }) {
  node.replaceChildren(...bars.rows.map((r) => {
    // Your way's bar outlined only when it is long enough not to read as a focus ring (the UI check)
    const li = el('li', `ec-bar${r.yours ? ' ec-bar-yours' : ''}${r.yours && r.length < 0.03 ? ' ec-bar-short' : ''}${r.compared ? '' : ' ec-bar-left'}`);
    li.dataset.way = r.way;
    const label = el('span', 'ec-bar-name', r.name);
    const track = el('span', 'ec-bar-track');
    track.setAttribute('aria-hidden', 'true');
    if (!r.compared) {
      track.append(el('span', 'ec-bar-reason', r.reason));
      li.append(label, track, el('span', 'sr-only', r.words));
      label.setAttribute('aria-hidden', 'true');
      return li;
    }
    const zero = el('span', 'ec-bar-zero');
    zero.style.left = `${bars.zero * 100}%`;
    const bar = el('span', `ec-bar-fill${r.kind === 'loss' ? ' ec-bar-loss' : ''}`);
    bar.style.left = `${r.start * 100}%`;
    bar.style.width = `${r.length * 100}%`;
    const value = el('span', `ec-bar-value${r.tone === 'loss' ? ' co-loss' : ''}`, r.kind === 'even' ? 'breaks even' : r.text);
    // the value just past the bar's end: right of a profit, left of a loss
    if (r.kind === 'loss') value.style.right = `${(1 - r.start) * 100}%`;
    else value.style.left = `${(r.start + r.length) * 100}%`;
    value.dataset.side = r.kind === 'loss' ? 'left' : 'right';
    track.append(zero, bar, value);
    const b = el('button', 'ec-bar-button');
    b.type = 'button';
    b.dataset.focusKey = `bar:${r.way}`;
    b.setAttribute('aria-pressed', String(picked === r.way));
    b.setAttribute('aria-label', `${r.words}. Show in the table`);
    b.addEventListener('click', () => onPick(r.way));
    b.append(label, track);
    li.append(b);
    return li;
  }));
}

// A source label's nodes (4.3): You set's pencil, its words, research's confidence dots (hidden: the words a reader hears say
// it).
const PENCIL = '<svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false"><path d="M8.2 1.3l2.5 2.5-6.4 6.4H1.8V7.7z" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
export function labelNodes(label) {
  const out = [];
  if (label.tier === 'typed') {
    const pencil = el('span', 'ec-pencil');
    pencil.innerHTML = PENCIL;
    out.push(pencil);
  }
  out.push(label.text);
  if (label.dots) {
    const dots = el('span', 'ec-dots', `${'●'.repeat(label.dots)}${'○'.repeat(3 - label.dots)}`);
    dots.setAttribute('aria-hidden', 'true');
    out.push(dots, el('span', 'sr-only', label.reader.slice(label.text.length)));
  }
  return out;
}

// ---- Price × yield (6.5): a real table, each cell a button named by its label, one Tab stop (arrows, Home, End); the
// break-even one line under the cells' words (an svg over the grid, its arrows outside the grid when it leaves it); the
// picked cell's line. Built once a shape and then updated in place as figures are typed (the UI check: a keystroke rebuilt
// 262 elements) ----
const NONE_WORDS = {
  price: 'With a selling price of RM 0.00 there is nothing to map: set it in Figures.',
  yield: 'With a yield of 0 g there is nothing to map: set it in Figures.',
};
const SVG = 'http://www.w3.org/2000/svg';
// state: { picked: { row, col }, onPick(row, col, how), line: the picked line's node }, kept by the page.
export function paintMap(node, map, state) {
  if (map.none) {
    state.line.hidden = true;
    state.grid = null;
    node.replaceChildren(el('p', 'muted ec-runs-line', NONE_WORDS[map.none]));
    return;
  }
  const shape = `${map.yields.length}x${map.prices.length}`;
  if (!state.grid || state.grid.shape !== shape || !node.contains(state.grid.wrap)) state.grid = buildGrid(node, map, state, shape);
  const g = state.grid;
  g.map = map;
  map.prices.forEach((p, c) => {
    g.heads[c].desk.textContent = priceHead(p);
    g.heads[c].phone.textContent = priceHead(p, { phone: true });
  });
  map.rows.forEach((row, r) => {
    g.yieldHeads[r].textContent = yieldHead(map.yields[r]);
    row.forEach((cell, c) => {
      const { td, b, desk, phone, dot } = g.cells[r][c];
      const now = map.now?.row === r && map.now?.col === c; // none when the figures fall between the cells (the review)
      dot.hidden = !now;
      const picked = state.picked.row === r && state.picked.col === c;
      td.className = `ec-cell ec-cell-${cell.tone}${cell.capped ? ' ec-capped' : ''}`;
      b.className = `ec-cell-button${now ? ' ec-cell-now' : ''}`;
      b.tabIndex = picked ? 0 : -1;
      if (picked) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
      b.setAttribute('aria-label', `${now ? 'Now: ' : ''}${cellLabel(cell, map.prices[c], map.yields[r])}`);
      desk.textContent = cellText(cell);
      phone.textContent = cellText(cell, { phone: true });
    });
  });
  drawLine(g);
  // the picked cell's line: the page's own node, said on its polite line only when a cell is picked (the UI check)
  const pickedCell = map.rows[state.picked.row][state.picked.col];
  state.line.textContent = cellLabel(pickedCell, map.prices[state.picked.col], map.yields[state.picked.row]);
  state.line.hidden = false;
  g.lines.replaceChildren(...lineWords(map).map((w) => el('p', 'muted ec-runs-line', w)));
  g.legendCap.hidden = map.cap === null;
  g.legendNow.hidden = !map.now;
}

function buildGrid(node, map, state, shape) {
  const lastCol = map.prices.length - 1;
  const lastRow = map.yields.length - 1;
  const t = el('table', 'ec-map');
  t.append(el('caption', 'sr-only', 'Profit a month by selling price and yield per good block'));
  const head = el('tr');
  const corner = el('th', 'ec-map-corner');
  corner.scope = 'col';
  const axis = el('span', '', 'g');
  axis.setAttribute('aria-hidden', 'true');
  const axisWords = el('span', 'ec-map-axis', ' ╲ RM a kg');
  axisWords.setAttribute('aria-hidden', 'true');
  corner.append(axis, axisWords, el('span', 'sr-only', 'Yield per good block, by selling price a kg'));
  head.append(corner);
  const heads = map.prices.map(() => {
    const th = el('th', 'ec-map-head');
    th.scope = 'col';
    const h = { desk: el('span', 'ec-desk-only'), phone: el('span', 'ec-phone-only') };
    th.append(h.desk, h.phone);
    head.append(th);
    return h;
  });
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  const yieldHeads = [];
  const cells = map.rows.map((row, r) => {
    const tr = el('tr');
    const th = el('th', 'ec-map-yield');
    th.scope = 'row';
    yieldHeads.push(th);
    tr.append(th);
    const out = row.map((_, c) => {
      const td = el('td', 'ec-cell');
      const b = el('button', 'ec-cell-button');
      b.type = 'button';
      b.dataset.focusKey = `map:${r}:${c}`;
      b.dataset.row = String(r);
      b.dataset.col = String(c);
      b.addEventListener('click', () => state.onPick(r, c));
      b.addEventListener('keydown', (e) => {
        const to = { ArrowLeft: [r, c - 1], ArrowRight: [r, c + 1], ArrowUp: [r - 1, c], ArrowDown: [r + 1, c], Home: [r, 0], End: [r, lastCol] }[e.key];
        if (!to) return;
        e.preventDefault();
        // the arrows move the cursor and the Tab stop; a tap or Enter picks (the review: no repaint, no second reading)
        const [nr, nc] = [Math.max(0, Math.min(lastRow, to[0])), Math.max(0, Math.min(lastCol, to[1]))];
        for (const cellsRow of state.grid.cells) for (const x of cellsRow) x.b.tabIndex = -1;
        const next = state.grid.cells[nr][nc].b;
        next.tabIndex = 0;
        next.focus();
      });
      const dot = el('span', 'ec-now-dot'); // shown on now's cell as the figures move
      dot.hidden = true;
      const desk = el('span', 'ec-desk-only');
      const phone = el('span', 'ec-phone-only');
      b.append(dot, desk, phone);
      td.append(b);
      tr.append(td);
      return { td, b, desk, phone, dot };
    });
    body.append(tr);
    return out;
  });
  t.append(thead, body);
  const wrap = el('div', 'ec-map-wrap');
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'ec-be-line');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  wrap.append(t, svg);
  const lines = el('div', 'ec-map-lines');
  const legend = el('p', 'muted ec-map-legend');
  legend.setAttribute('aria-hidden', 'true');
  const swatch = (cls, words) => {
    const sp = el('span', 'ec-key');
    sp.append(el('span', `ec-swatch ${cls}`), words);
    return sp;
  };
  const legendCap = swatch('ec-capped', 'Capped by what you can sell');
  const legendNow = swatch('ec-swatch-now', 'Now');
  legend.append(swatch('ec-cell-profit', 'Profit'), swatch('ec-cell-loss', 'Loss'), legendCap, legendNow, swatch('ec-swatch-be', 'Break-even'));
  const side = el('div', 'ec-map-side');
  side.append(state.line, lines, legend);
  node.replaceChildren(wrap, side);
  // the line follows the cells when the card changes width
  const grid = { shape, wrap, svg, heads, yieldHeads, cells, lines, legendCap, legendNow, map };
  if (typeof ResizeObserver === 'function') {
    state.resize?.disconnect();
    state.resize = new ResizeObserver(() => drawLine(grid));
    state.resize.observe(wrap);
  }
  return grid;
}

// The break-even line: through each row's centre at its price (straight between the columns' centres), held at the grid's
// edge where it leaves the grid, with an arrow outside the edge.
function drawLine(g) {
  const { map, wrap, svg, cells } = g;
  const box = wrap.getBoundingClientRect();
  if (!box.width) return;
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.setAttribute('width', String(box.width));
  svg.setAttribute('height', String(box.height));
  const rect = (r, c) => cells[r][c].td.getBoundingClientRect();
  const lastCol = map.prices.length - 1;
  const first = rect(0, 0);
  const last = rect(0, lastCol);
  const [x0, x1] = [first.left + first.width / 2 - box.left, last.left + last.width / 2 - box.left];
  const [edgeL, edgeR] = [first.left - box.left, last.right - box.left];
  const step = map.prices[1] - map.prices[0];
  const points = [];
  const arrows = [];
  map.line.forEach((l, r) => {
    const cy = rect(r, 0).top + rect(r, 0).height / 2 - box.top;
    if (l.be === null) return;
    let x = step > 0 ? x0 + ((l.be - map.prices[0]) / step) * ((x1 - x0) / lastCol) : x0;
    if (l.off === 'left' || x < edgeL) { x = edgeL; arrows.push([x, cy, -1]); }
    if (l.off === 'right' || x > edgeR) { x = edgeR; arrows.push([x, cy, 1]); }
    points.push(`${x.toFixed(1)},${cy.toFixed(1)}`);
  });
  const line = document.createElementNS(SVG, 'polyline');
  line.setAttribute('points', points.join(' '));
  line.setAttribute('class', 'ec-be-path');
  const marks = arrows.map(([x, y, dir]) => {
    const a = document.createElementNS(SVG, 'path');
    a.setAttribute('d', `M${x + dir * 2},${y - 4} l${dir * 5},4 l${-dir * 5},4 z`);
    a.setAttribute('class', 'ec-be-arrow');
    return a;
  });
  svg.replaceChildren(line, ...marks);
}

// ---- What moves profit most (5.5): first the owner's decisions apart ("Set these first", the owner 2026-11-12), each
// linking to its box with its source label; then the chart of the rest, a row a figure: its name (a link to its box), its
// source, its range, and a bar on one scale around now with the fall at the left and the rise at the right, each with the
// figure that gives it; the whole row's words for a reader ----
// out: swings'; ctx: { room, type, figures, people, values }; state: { all, onToggle, goTo(key) }, kept by the page.
export function paintSwing(node, out, { room, type, figures = [], people = false, values = {} }, state) {
  const figureOfKey = (key) => figures.find((x) => x.key === key);
  const goLink = (key, cls = 'ec-go') => {
    const b = el('button', cls, figureLabel(key, type));
    b.type = 'button';
    b.dataset.focusKey = `go:${key}`;
    b.addEventListener('click', () => state.goTo(key));
    return b;
  };
  const sourceNode = (key) => {
    const f = figureOfKey(key);
    return f ? el('span', 'ec-swing-source', ` · ${labelOf(f).reader}`) : '';
  };
  const parts = [];
  if (out.decisions.length) {
    const set = el('section', 'ec-first');
    set.setAttribute('aria-labelledby', 'ec-first-title');
    set.append(Object.assign(el('h3', 'ec-first-title', 'Set these first'), { id: 'ec-first-title' }),
      el('p', 'muted ec-runs-line', 'Your decisions, not risks: the page takes research for them until you set your own.'));
    const list = el('ul', 'ec-first-list');
    for (const r of out.decisions) {
      const li = el('li', 'ec-first-row');
      const what = el('p', 'ec-first-what');
      what.append(goLink(r.key), el('span', 'ec-first-value', ` ${figureText(r.key, values[r.key])}`), sourceNode(r.key));
      const moves = r.up - r.down;
      li.append(what, el('p', 'muted ec-first-moves', Math.round(moves * 100) === 0
        ? 'Moves nothing at these figures.' : swingText(r, type).slice(figureLabel(r.key, type).length + 1)));
      list.append(li);
    }
    set.append(list);
    parts.push(set);
  }
  parts.push(el('p', 'muted ec-intro', `${room}'s profit a month, each of the other figures set to its low then its high, the rest held. Research figures swing over their research range; yours, your runs', your sales' and Settings' by 20 % each way.`));
  parts.push(el('p', 'ec-swing-now', `Now: ${moneyText(out.base)} a month.`));
  const list = el('ol', 'ec-swing');
  const most = Math.max(0, ...out.rows.map((r) => Math.max(-r.down, r.up)));
  const shown = state.all ? out.rows : out.rows.slice(0, TOP);
  for (const r of shown) {
    const li = el('li', 'ec-swing-row');
    const head = el('p', 'ec-swing-words');
    const flush = r.key === 'yours.flushes';
    const range = el('span', 'ec-swing-range', ` ${arrowText(r.key, r.low, r.high, { unit: !flush })}${flush ? ' (the yield with them)' : ''}`);
    range.setAttribute('aria-hidden', 'true');
    const label = goLink(r.key, 'ec-go ec-swing-label');
    label.setAttribute('aria-label', `${swingText(r, type)}. Go to the figure`);
    head.append(label, sourceNode(r.key), range);
    const ends = swingEnds(r);
    const row = el('div', 'ec-swing-line');
    row.setAttribute('aria-hidden', 'true');
    const end = (e, side) => {
      const sp = el('span', `ec-swing-end ec-swing-${side}`);
      sp.append(el('span', `ec-swing-amount${e.text.startsWith('−') ? ' co-loss' : ''}`, e.text), el('span', 'ec-swing-at', e.at));
      return sp;
    };
    const bar = el('span', 'ec-swing-bar');
    const at = (v) => 50 + (most > 0 ? (v / most) * 50 : 0); // % of the track
    if (r.down < 0) {
      const neg = el('span', 'ec-swing-down');
      neg.style.left = `${at(r.down)}%`;
      neg.style.width = `${50 - at(r.down)}%`;
      bar.append(neg);
    }
    if (r.up > 0) {
      const pos = el('span', 'ec-swing-up');
      pos.style.left = '50%';
      pos.style.width = `${at(r.up) - 50}%`;
      bar.append(pos);
    }
    bar.append(el('span', 'ec-swing-zero'));
    row.append(end(ends.down, 'left'), bar, end(ends.up, 'right'));
    li.append(head, row);
    list.append(li);
  }
  parts.push(list);
  if (out.rows.length > TOP) {
    const b = el('button', 'bz-quiet ec-swing-all', state.all ? `Show the top ${TOP}` : `Show all ${out.rows.length}`);
    b.type = 'button';
    b.dataset.focusKey = 'swing:all';
    b.setAttribute('aria-expanded', String(state.all));
    b.addEventListener('click', state.onToggle);
    parts.push(b);
  }
  if (!out.rows.length) parts.push(el('p', 'muted ec-runs-line', 'No figure moves it at these figures.'));
  const still = stillLine(out.still, type, { people });
  if (still) parts.push(el('p', 'muted ec-runs-line', still));
  node.replaceChildren(...parts);
}

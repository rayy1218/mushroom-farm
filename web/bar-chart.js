// A bar chart on a time axis, inline SVG drawn 1:1 at the host's width (a ResizeObserver redraws it), lined up with the line
// charts above it (the same margins, the same ticks): the "Electricity and water" and "Air exchange" sections of the Charts tab.

import { M } from './chart.js';
import { xFor, nearestIndex } from './chart-math.js';
import { niceMax, axisLabel } from './usage-math.js';

const NS = 'http://www.w3.org/2000/svg';
// An axis value: axisLabel's, with the places a tiny one needs (a 15 s bucket's 0.0025 kWh is not 0.003).
const tickLabel = (v) => (v !== 0 && Math.abs(v) < 0.01 ? String(Number(v.toPrecision(2))) : axisLabel(v));
let patternSeq = 0; // each chart's hatch pattern needs an id of its own

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// opts: { bars: [{ from, to, v|null }] (null: a gap), range: { from, to }, ticksFor(width) → [{ at, label }], color,
// hatch (true: the bars hatched, an estimate), whole (a count: whole axis values), share (of its slot a bar fills, default all but a hair), label (the aria-label), tip(bar) → text, onCursor(at|null) }.
// Returns { update(opts), setCursor(at|null), destroy() }.
export function drawTimeBars(host, opts) {
  let current = opts;
  let svg = null;
  let layout = null;
  let lastWidth = -1;
  let cursorAt = null;
  let cursorLine = null;
  let marker = null;
  const id = `tbar-hatch-${++patternSeq}`;
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  host.append(tip);

  function draw() {
    const width = Math.floor(host.clientWidth);
    lastWidth = width;
    svg?.remove();
    svg = null;
    layout = null;
    tip.hidden = true;
    if (width < 40) return; // not laid out (hidden)
    const height = width < 420 ? 170 : 200;
    const x0 = M.left;
    const x1 = width - M.right;
    const y0 = height - M.bottom;
    const y1 = M.top;
    const { bars, range, color } = current;
    let top = niceMax(Math.max(0, ...bars.map((b) => (b.v === null ? 0 : b.v))));
    if (current.whole && top % 2 !== 0) top += 1; // counts: whole numbers at the middle line too
    const yFor = (v) => y0 - (v / top) * (y0 - y1);
    const xAt = (t) => xFor(t, range.from, range.to, x0, x1);
    svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': current.label ?? '' });
    if (current.hatch) {
      const defs = el('defs');
      const pattern = el('pattern', { id, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
      pattern.append(el('line', { x1: 0, y1: 0, x2: 0, y2: 5, 'stroke-width': 2.5, style: `stroke:${color}` }));
      defs.append(pattern);
      svg.append(defs);
    }
    for (const v of [0, top / 2, top]) {
      const y = yFor(v);
      svg.append(el('line', { x1: x0, x2: x1, y1: y, y2: y, style: 'stroke:var(--grid)', 'stroke-width': 1 }));
      svg.append(el('text', { x: x0 - 6, y: y + 4, 'text-anchor': 'end', style: 'fill:var(--muted)', 'font-size': 12 }, tickLabel(v)));
    }
    const xs = [];
    for (const b of bars) {
      const xa = xAt(b.from);
      const xb = xAt(b.to);
      xs.push((xa + xb) / 2);
      if (b.v === null || b.v <= 0) continue;
      const slot = xb - xa;
      const w = current.share ? slot * current.share : slot - (slot > 4 ? 1 : 0); // a hair between wide bars, none between thin ones
      const y = yFor(b.v);
      svg.append(el('rect', {
        x: (xa + (slot - w) / 2).toFixed(1), y: y.toFixed(1), width: Math.max(1, w).toFixed(1), height: Math.max(0.5, y0 - y).toFixed(1),
        style: current.hatch ? `fill:url(#${id});stroke:${color};stroke-width:${xb - xa > 4 ? 1 : 0}` : `fill:${color}`,
      }));
    }
    svg.append(el('line', { x1: x0, x2: x1, y1: y0, y2: y0, style: 'stroke:var(--axis)', 'stroke-width': 1 }));
    for (const tick of current.ticksFor ? current.ticksFor(width) : []) {
      const x = xAt(tick.at);
      svg.append(el('line', { x1: x, x2: x, y1: y0, y2: y0 + 4, style: 'stroke:var(--axis)', 'stroke-width': 1 }));
      svg.append(el('text', { x, y: height - 6, 'text-anchor': 'middle', style: 'fill:var(--muted)', 'font-size': 12 }, tick.label));
    }
    cursorLine = el('line', { y1, y2: y0, style: 'stroke:var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
    marker = el('line', { y1, y2: y0, style: 'stroke:var(--ink-2)', 'stroke-width': 1, visibility: 'hidden' });
    svg.append(cursorLine, marker);
    layout = { xs, width, x0, x1 };
    placeCursor();
    svg.addEventListener('pointerdown', onPointer);
    svg.addEventListener('pointermove', onPointer);
    svg.addEventListener('pointerleave', onLeave);
    host.prepend(svg);
  }

  function placeCursor() {
    if (!cursorLine) return;
    const { range } = current;
    if (cursorAt === null || cursorAt < range.from || cursorAt > range.to) {
      cursorLine.setAttribute('visibility', 'hidden');
      return;
    }
    const x = xFor(cursorAt, range.from, range.to, layout.x0, layout.x1);
    cursorLine.setAttribute('x1', x);
    cursorLine.setAttribute('x2', x);
    cursorLine.setAttribute('visibility', 'visible');
  }

  function onPointer(event) {
    if (!layout || layout.xs.length === 0) return;
    const box = svg.getBoundingClientRect();
    const i = nearestIndex(layout.xs, event.clientX - box.left);
    const bar = current.bars[i];
    const x = layout.xs[i];
    marker.setAttribute('x1', x);
    marker.setAttribute('x2', x);
    marker.setAttribute('visibility', 'visible');
    tip.textContent = current.tip(bar);
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(0, x + 10 + w > layout.width ? x - 10 - w : x + 10)}px`;
    current.onCursor?.((bar.from + bar.to) / 2);
  }

  function onLeave(event) {
    if (event.pointerType === 'touch') return; // a finger lifting keeps the reading on screen
    tip.hidden = true;
    marker?.setAttribute('visibility', 'hidden');
    current.onCursor?.(null);
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
    setCursor(at) {
      cursorAt = at;
      if (layout) placeCursor();
    },
    destroy() {
      observer.disconnect();
      svg?.remove();
      tip.remove();
    },
  };
}

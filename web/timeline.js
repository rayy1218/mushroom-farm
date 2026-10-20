// The machine timeline: one row per machine under the charts, a bar where it was commanded on.
// Auto bars are solid, manual bars hatched. Lines up with the line charts (same left and right margin and time axis).

import { M } from './chart.js';
import { xFor } from './chart-math.js';
import { thinMarks } from './history-math.js';

const NS = 'http://www.w3.org/2000/svg';
const ROW_H = 30;
let patternSeq = 0;

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// opts: { rows: [{ key, label, spans: [{ from, to, source }], marks: [{ at, text }] }], range: { from, to },
//         ticks: [{ at, label }], formatAt(ms), onCursor(at|null) }
// Returns { update(opts), setCursor(at|null), destroy() }.
export function drawTimeline(host, opts) {
  let current = opts;
  let svg = null;
  let cursorLine = null;
  let cursorAt = null;
  let geometry = null; // { t0, t1, x0, x1 }
  let lastWidth = -1;
  const pattern = `hatch-${++patternSeq}`;
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  host.append(tip);

  function draw() {
    const width = Math.floor(host.clientWidth);
    lastWidth = width;
    svg?.remove();
    svg = null;
    geometry = null;
    if (width < 40) return;
    const { rows, range } = current;
    const ticks = (current.ticksFor ? current.ticksFor(width) : current.ticks) ?? [];
    const x0 = M.left;
    const x1 = width - M.right;
    const height = rows.length * ROW_H + 24;
    const xAt = (t) => xFor(t, range.from, range.to, x0, x1);
    svg = el('svg', {
      width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
      'aria-label': `Machine timeline: ${rows.map((r) => `${r.label} ${r.spans.length === 0 ? 'off' : `on ${r.spans.length} time${r.spans.length === 1 ? '' : 's'}`}`).join(', ')}`,
    });
    const defs = el('defs');
    const hatch = el('pattern', { id: pattern, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    hatch.append(el('line', { x1: 0, y1: 0, x2: 0, y2: 6, style: 'stroke:var(--ink-2)', 'stroke-width': 2.5 }));
    defs.append(hatch);
    svg.append(defs);

    rows.forEach((row, i) => {
      const y = i * ROW_H;
      svg.append(el('line', { x1: x0, x2: x1, y1: y + ROW_H, y2: y + ROW_H, style: 'stroke:var(--grid)', 'stroke-width': 1 }));
      svg.append(el('text', { x: 4, y: y + 19, style: 'fill:var(--muted)', 'font-size': 11 }, row.label)); // own column left of the plot
      for (const s of row.spans) {
        const xa = xAt(s.from);
        const w = Math.max(2, xAt(s.to) - xa);
        const rect = el('rect', { x: xa, y: y + 14, width: w, height: 10, rx: 2, style: 'stroke:var(--ink-2)', 'stroke-width': 1 });
        rect.setAttribute('fill', s.source === 'manual' ? `url(#${pattern})` : 'var(--ink-2)');
        svg.append(rect);
      }
      for (const m of thinMarks(row.marks, xAt, 40)) {
        svg.append(el('text', { x: xAt(m.at) + 3, y: y + 11, style: 'fill:var(--ink)', 'font-size': 11 }, m.text));
      }
    });
    const yAxis = rows.length * ROW_H;
    svg.append(el('line', { x1: x0, x2: x1, y1: yAxis, y2: yAxis, style: 'stroke:var(--axis)', 'stroke-width': 1 }));
    for (const tick of ticks) {
      const x = xAt(tick.at);
      svg.append(el('line', { x1: x, x2: x, y1: yAxis, y2: yAxis + 4, style: 'stroke:var(--axis)', 'stroke-width': 1 }));
      svg.append(el('text', { x, y: height - 6, 'text-anchor': 'middle', style: 'fill:var(--muted)', 'font-size': 12 }, tick.label));
    }
    cursorLine = el('line', { y1: 0, y2: yAxis, style: 'stroke:var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
    svg.append(cursorLine);
    geometry = { t0: range.from, t1: range.to, x0, x1 };
    svg.addEventListener('pointermove', onPointer);
    svg.addEventListener('pointerdown', onPointer);
    svg.addEventListener('pointerleave', onLeave);
    host.prepend(svg);
    placeCursor();
  }

  function placeCursor() {
    if (!cursorLine || !geometry) return;
    if (cursorAt === null || cursorAt < geometry.t0 || cursorAt > geometry.t1) {
      cursorLine.setAttribute('visibility', 'hidden');
      return;
    }
    const x = xFor(cursorAt, geometry.t0, geometry.t1, geometry.x0, geometry.x1);
    cursorLine.setAttribute('x1', x);
    cursorLine.setAttribute('x2', x);
    cursorLine.setAttribute('visibility', 'visible');
  }

  function onPointer(event) {
    if (!geometry) return;
    const box = svg.getBoundingClientRect();
    const x = Math.min(geometry.x1, Math.max(geometry.x0, event.clientX - box.left));
    const at = geometry.t0 + ((x - geometry.x0) / (geometry.x1 - geometry.x0)) * (geometry.t1 - geometry.t0);
    current.onCursor?.(at);
    tip.textContent = current.formatAt ? current.formatAt(at) : String(at);
    tip.hidden = false;
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(0, x + 10 + w > box.width ? x - 10 - w : x + 10)}px`;
  }

  function onLeave(event) {
    if (event.pointerType === 'touch') return;
    tip.hidden = true;
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
      tip.hidden = true;
      draw();
    },
    setCursor(at) {
      cursorAt = at;
      placeCursor();
    },
    destroy() {
      observer.disconnect();
      svg?.remove();
      tip.remove();
    },
  };
}

// A small inline-SVG line chart. Drawn 1:1 at the host's pixel width (re-drawn by a ResizeObserver),
// so text keeps its real size on a phone. Colours come from the theme tokens through CSS variables.

import { formatClock, yRange, xFor, segments, nearestIndex } from './chart-math.js';

const NS = 'http://www.w3.org/2000/svg';
const M = { left: 46, right: 12, top: 10, bottom: 24 };

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// opts: { points: [{ at, value|null }], unit, label, color = 'var(--ink)', digits = 1, minSpan = 1, bounds, band }
// band: { low, high } drawn as a shaded zone with dashed limit lines (the room's control band), or null.
// Returns { update(opts), destroy() }.
export function drawLineChart(host, opts) {
  let current = opts;
  let svg = null;
  let marker = null; // { line, dot }
  let layout = null; // { xs, ys, points }
  let lastWidth = -1;
  let hoverAt = null; // the `at` of the hovered point, kept across update()
  let hoverX = null; // pointer x (client) while it is over the chart
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  host.append(tip);

  function fmt(v) {
    return `${v.toFixed(current.digits ?? 1)} ${current.unit}`;
  }

  function draw() {
    const width = Math.floor(host.clientWidth);
    lastWidth = width;
    svg?.remove();
    svg = null;
    marker = null;
    layout = null;
    if (width < 40) return; // not laid out (hidden), nothing to draw yet
    const { points, label } = current;
    const height = width < 420 ? 170 : 200;
    const x0 = M.left;
    const x1 = width - M.right;
    const y0 = height - M.bottom; // bottom
    const y1 = M.top; // top

    const values = points.map((p) => p.value).filter((v) => v !== null && Number.isFinite(v));
    const band = current.band ?? null;
    const { min, max } = yRange(values, current.minSpan ?? 1, current.bounds, band ? [band.low, band.high] : []);
    const t0 = points.length ? points[0].at : 0;
    const t1 = points.length ? points[points.length - 1].at : 0;
    const xs = points.map((p) => xFor(p.at, t0, t1, x0, x1));
    const yFor = (v) => y0 - ((v - min) / (max - min)) * (y0 - y1);
    const ys = points.map((p) => (p.value === null ? null : yFor(p.value)));

    const lo = values.length ? Math.min(...values) : null;
    const hi = values.length ? Math.max(...values) : null;
    const latest = [...points].reverse().find((p) => p.value !== null);
    svg = el('svg', {
      width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
      'aria-label': `${label}: ${points.length} polls${latest ? `, latest ${fmt(latest.value)}, min ${fmt(lo)}, max ${fmt(hi)}` : ''}${band ? `, band ${fmt(band.low)} to ${fmt(band.high)}` : ''}`,
    });

    // Grid lines and y labels at the padded min and max.
    for (const [v, y] of [[max, y1], [min, y0]]) {
      svg.append(el('line', { x1: x0, x2: x1, y1: y, y2: y, style: 'stroke:var(--grid)', 'stroke-width': 1 }));
      svg.append(el('text', {
        x: x0 - 6, y: y + 4, 'text-anchor': 'end', style: 'fill:var(--muted)', 'font-size': 12,
      }, v.toFixed(current.digits ?? 1)));
    }
    svg.append(el('line', { x1: x0, x2: x1, y1: y0, y2: y0, style: 'stroke:var(--axis)', 'stroke-width': 1 }));

    // The control band: a shaded zone between the limits, dashed lines and their values at the right end.
    if (band) {
      const yHigh = yFor(band.high);
      const yLow = yFor(band.low);
      svg.append(el('rect', { x: x0, y: yHigh, width: x1 - x0, height: Math.max(0, yLow - yHigh), style: 'fill:var(--band)' }));
      for (const [v, y, dy] of [[band.high, yHigh, -4], [band.low, yLow, 13]]) {
        svg.append(el('line', {
          x1: x0, x2: x1, y1: y, y2: y, style: 'stroke:var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '4 4',
        }));
        svg.append(el('text', {
          x: x1 - 4, y: y + dy, 'text-anchor': 'end', style: 'fill:var(--muted)', 'font-size': 11,
        }, v.toFixed(current.digits ?? 1)));
      }
    }

    // Time labels at start, middle and end.
    if (points.length) {
      const mid = (t0 + t1) / 2;
      for (const [at, anchor, x] of [[t0, 'start', x0], [mid, 'middle', (x0 + x1) / 2], [t1, 'end', x1]]) {
        if (t1 === t0 && anchor !== 'middle') continue;
        svg.append(el('text', {
          x, y: height - 6, 'text-anchor': anchor, style: 'fill:var(--muted)', 'font-size': 12,
        }, formatClock(at)));
      }
    }

    // Failed polls: a short tick on the bottom axis, so a gap is visible as well as the broken line.
    points.forEach((p, i) => {
      if (p.value !== null) return;
      svg.append(el('line', { x1: xs[i], x2: xs[i], y1: y0 - 12, y2: y0, style: 'stroke:var(--critical-text)', 'stroke-width': 2 }));
    });

    // The line, one path per run; a run of one point is a dot.
    const idx = new Map(points.map((p, i) => [p, i]));
    for (const run of segments(points)) {
      if (run.length === 1) {
        const i = idx.get(run[0]);
        svg.append(el('circle', { cx: xs[i], cy: ys[i], r: 3, style: `fill:${current.color ?? 'var(--ink)'}` }));
        continue;
      }
      const d = run.map((p, k) => { const i = idx.get(p); return `${k ? 'L' : 'M'}${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`; }).join(' ');
      svg.append(el('path', {
        d, fill: 'none', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round',
        style: `stroke:${current.color ?? 'var(--ink)'}`,
      }));
    }

    // Pointer marker (hidden until used).
    marker = {
      line: el('line', { y1, y2: y0, style: 'stroke:var(--ink-2)', 'stroke-width': 1, visibility: 'hidden' }),
      dot: el('circle', { r: 4, style: `fill:${current.color ?? 'var(--ink)'};stroke:var(--surface)`, 'stroke-width': 2, visibility: 'hidden' }),
    };
    svg.append(marker.line, marker.dot);

    layout = { xs, ys, points, width, y0 };
    svg.addEventListener('pointerdown', onPointer);
    svg.addEventListener('pointermove', onPointer);
    svg.addEventListener('pointerleave', onLeave);
    host.prepend(svg);
    // Put the tooltip back on the point that was hovered, if the pointer is still over the chart.
    if (hoverX !== null && hoverAt !== null) {
      const j = points.findIndex((p) => p.at === hoverAt);
      if (j >= 0) showPoint(j);
    }
  }

  function hideTip() {
    tip.hidden = true;
    if (marker) { marker.line.setAttribute('visibility', 'hidden'); marker.dot.setAttribute('visibility', 'hidden'); }
  }

  function onPointer(event) {
    if (!layout || layout.points.length === 0) return;
    const box = svg.getBoundingClientRect();
    hoverX = event.clientX;
    const i = nearestIndex(layout.xs, event.clientX - box.left);
    showPoint(i);
  }

  function showPoint(i) {
    const p = layout.points[i];
    const x = layout.xs[i];
    hoverAt = p.at;
    marker.line.setAttribute('x1', x);
    marker.line.setAttribute('x2', x);
    marker.line.setAttribute('visibility', 'visible');
    if (p.value === null) marker.dot.setAttribute('visibility', 'hidden');
    else {
      marker.dot.setAttribute('cx', x);
      marker.dot.setAttribute('cy', layout.ys[i]);
      marker.dot.setAttribute('visibility', 'visible');
    }
    tip.textContent = `${formatClock(p.at)}  ${p.value === null ? 'no answer' : fmt(p.value)}`;
    tip.hidden = false;
    // Keep the tip inside the chart: flip to the left of the marker near the right edge.
    const w = tip.offsetWidth;
    const left = x + 10 + w > layout.width ? x - 10 - w : x + 10;
    tip.style.left = `${Math.max(0, left)}px`;
  }

  function onLeave(event) {
    if (event.pointerType === 'touch') return; // a finger lifting keeps the reading on screen
    hoverX = null;
    hoverAt = null;
    hideTip();
  }

  const observer = new ResizeObserver(() => {
    if (Math.floor(host.clientWidth) !== lastWidth) draw(); // height-only changes (our own svg) need no redraw
  });
  observer.observe(host);
  draw();

  return {
    update(next) {
      current = next;
      hideTip();
      draw();
    },
    destroy() {
      observer.disconnect();
      svg?.remove();
      tip.remove();
    },
  };
}

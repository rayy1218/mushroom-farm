// A small inline-SVG line chart. Drawn 1:1 at the host's pixel width (re-drawn by a ResizeObserver),
// so text keeps its real size on a phone. Colours come from the theme tokens through CSS variables.

import { niceRange, formatClock, yRange, xFor, segments, nearestIndex, clipSeries, stepShapes, stepValues } from './chart-math.js';

const OUTDOOR_DOTS = '0.1 5'; // round dots 5 px apart (with a round cap a zero-length dash draws a dot)

const NS = 'http://www.w3.org/2000/svg';
export const M = { left: 64, right: 48, top: 10, bottom: 24 }; // the timeline lines up with these; right: the outdoor scale's numbers

function el(name, attrs = {}, text) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

// opts: { points: [{ at, value|null }], unit, label, color = 'var(--ink)', digits = 1, minSpan = 1, bounds, band }
// band: { low, high } drawn as a shaded zone with dashed limit lines (the room's control band), or null.
// bandSteps: [{ from, to, low, high }] is a band that moved (a simulation's), drawn as a stepped shaded zone with stepped dashed
// limit lines; it takes the place of band.
// Long ranges (spec 2026-10-19-safety-and-history-design.md 6) add: range { from, to } (the x axis spans it, not just the points),
// ticks [{ at, label }] (axis labels instead of start/middle/end), formatAt(ms) (tooltip time), failTicks false (no red ticks
// for null points) and onCursor(at|null) (called while the pointer moves, for the shared time line).
// second: { label, points } is another line of the same unit (the outdoor values), drawn dashed and muted under the main
// one and cut to the time window; it is named in the aria-label and in a legend line at the top right.
// Returns { update(opts), setCursor(at|null), destroy() }.
export function drawLineChart(host, opts) {
  let current = opts;
  let svg = null;
  let marker = null; // { line, dot }
  let layout = null; // { xs, ys, points }
  let lastWidth = -1;
  let hoverAt = null; // the `at` of the hovered point, kept across update()
  let hoverX = null; // pointer x (client) while it is over the chart
  let cursorAt = null; // a shared time line set from outside (setCursor)
  let cursorLine = null;
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  host.append(tip);

  function fmt(v) {
    return `${v.toFixed(current.digits ?? 1)} ${current.unit}`;
  }

  // ", outdoor latest 29.1 °C" for the aria-label, when there is a second line.
  function secondText() {
    const last = current.second ? [...current.second.points].reverse().find((p) => p.value !== null && Number.isFinite(p.value)) : null;
    return last ? `, ${(current.second.label ?? 'outdoor').toLowerCase()} latest ${fmt(last.value)}` : '';
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
    const y1 = current.second?.points?.some((p) => p.value !== null && Number.isFinite(p.value)) ? 30 : M.top; // a chart with an outdoor line: its legend above the plot

    const values = points.map((p) => p.value).filter((v) => v !== null && Number.isFinite(v));
    const steps = current.bandSteps?.length ? current.bandSteps : null;
    const band = steps ? null : current.band ?? null;
    const t0 = current.range ? current.range.from : points.length ? points[0].at : 0;
    const t1 = current.range ? current.range.to : points.length ? points[points.length - 1].at : 0;
    const second = current.second ? clipSeries(current.second.points, t0, t1) : [];
    const secondValues = second.map((p) => p.value).filter((v) => v !== null && Number.isFinite(v));
    const { min, max } = niceRange(yRange(values, current.minSpan ?? 1, current.bounds, [...(band ? [band.low, band.high] : []), ...stepValues(steps)]), current.bounds);
    // The outdoor line on its own scale (owner, 2026-10-28), so the room's line keeps the chart's height; its numbers on the right.
    const s2 = secondValues.length ? niceRange(yRange(secondValues, current.minSpan ?? 1, current.bounds), current.bounds) : null;
    const xs = points.map((p) => xFor(p.at, t0, t1, x0, x1));
    const yFor = (v) => y0 - ((v - min) / (max - min)) * (y0 - y1);
    const ys = points.map((p) => (p.value === null ? null : yFor(p.value)));

    const lo = values.length ? Math.min(...values) : null;
    const hi = values.length ? Math.max(...values) : null;
    const latest = [...points].reverse().find((p) => p.value !== null);
    svg = el('svg', {
      width, height, viewBox: `0 0 ${width} ${height}`, role: 'img',
      'aria-label': `${label}: ${points.length} ${current.noun ?? 'readings'}${latest ? `, latest ${fmt(latest.value)}, min ${fmt(lo)}, max ${fmt(hi)}` : ''}${band ? `, band ${fmt(band.low)} to ${fmt(band.high)}` : ''}${steps ? ', band as it moved' : ''}${secondText()}`,
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
          x: x1 - 4, y: y + dy, 'text-anchor': 'end', style: 'fill:var(--muted)', 'font-size': 12,
        }, v.toFixed(current.digits ?? 1)));
      }
    }

    // A band that moved: a rect for each step, the two limits as stepped dashed lines, the last values at the right end.
    if (steps) {
      const shapes = stepShapes(steps, { from: t0, to: t1 }, (t) => xFor(t, t0, t1, x0, x1), yFor);
      for (const r of shapes.rects) svg.append(el('rect', { x: r.x.toFixed(1), y: r.y.toFixed(1), width: r.width.toFixed(1), height: r.height.toFixed(1), style: 'fill:var(--band)' }));
      for (const d of [shapes.high, shapes.low]) {
        if (d) svg.append(el('path', { d, fill: 'none', style: 'stroke:var(--muted)', 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
      }
      const end = steps[steps.length - 1];
      for (const [v, dy] of [[end.high, -4], [end.low, 13]]) {
        svg.append(el('text', { x: x1 - 4, y: yFor(v) + dy, 'text-anchor': 'end', style: 'fill:var(--muted)', 'font-size': 12 }, v.toFixed(current.digits ?? 1)));
      }
    }

    // Time labels: the given ticks, or start, middle and end.
    const ticks = current.ticksFor ? current.ticksFor(width) : current.ticks; // ticksFor: recomputed at every redraw
    if (ticks) {
      for (const tick of ticks) {
        const x = xFor(tick.at, t0, t1, x0, x1);
        svg.append(el('line', { x1: x, x2: x, y1: y0, y2: y0 + 4, style: 'stroke:var(--axis)', 'stroke-width': 1 }));
        svg.append(el('text', {
          x, y: height - 6, 'text-anchor': 'middle', style: 'fill:var(--muted)', 'font-size': 12,
        }, tick.label));
      }
    } else if (points.length) {
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
      if (p.value !== null || current.failTicks === false) return;
      svg.append(el('line', { x1: xs[i], x2: xs[i], y1: y0 - 12, y2: y0, style: 'stroke:var(--critical-text)', 'stroke-width': 2 }));
    });

    // A gap in the readings on a long range (historyPoints puts a null where the polls stopped: the app or the sensor was off):
    // a quiet strip between the readings either side, named when it is wide enough, so the gap is not taken for a flat room.
    if (current.range) {
      points.forEach((p, i) => {
        if (p.value !== null || i === 0 || i === points.length - 1) return;
        const a = xs[i - 1];
        const b = xs[i + 1];
        if (!(b > a)) return;
        svg.append(el('rect', { x: a.toFixed(1), y: y1, width: (b - a).toFixed(1), height: y0 - y1, style: 'fill:var(--band)' }));
        if (b - a > 90) {
          svg.append(el('text', { x: ((a + b) / 2).toFixed(1), y: ((y0 + y1) / 2 + 4).toFixed(1), 'text-anchor': 'middle', style: 'fill:var(--muted)', 'font-size': 12 }, 'No readings'));
        }
      });
    }

    // The second line (outdoor): dotted in the chart's own colour (the grey dashes are the band limits), under the main one, with
    // its name and latest value at the top left (the band limits are labelled at the right edge).
    if (secondValues.length) {
      const yFor2 = (v) => y0 - ((v - s2.min) / (s2.max - s2.min)) * (y0 - y1);
      const dg = current.digits ?? 1;
      const dots = { fill: 'none', 'stroke-width': 2.5, 'stroke-dasharray': OUTDOOR_DOTS, 'stroke-linecap': 'round', style: `stroke:${current.color ?? 'var(--ink)'};opacity:.8` };
      for (const run of segments(second)) {
        if (run.length < 2) continue;
        const d = run.map((p, k) => `${k ? 'L' : 'M'}${xFor(p.at, t0, t1, x0, x1).toFixed(1)} ${yFor2(p.value).toFixed(1)}`).join(' ');
        svg.append(el('path', { d, ...dots }));
      }
      const lastSecond = [...second].reverse().find((p) => p.value !== null && Number.isFinite(p.value));
      // its scale: the numbers at the right edge, dotted ticks like its line
      for (const [v, y] of [[s2.max, y1], [s2.min, y0]]) {
        svg.append(el('text', { x: x1 + 6, y: y + 4, 'text-anchor': 'start', style: 'fill:var(--muted)', 'font-size': 12 }, v.toFixed(dg)));
      }
      // the legend above the plot, clear of the band's lines: the room's line, then the outdoor one and where its scale is
      const solid = { 'stroke-width': 2.5, 'stroke-linecap': 'round', style: `stroke:${current.color ?? 'var(--ink)'}` };
      svg.append(el('line', { x1: x0, x2: x0 + 16, y1: 12, y2: 12, ...solid }));
      const roomText = el('text', { x: x0 + 22, y: 16, style: 'fill:var(--ink-2)', 'font-size': 12 }, 'Room');
      svg.append(roomText);
      const lx = x0 + 70;
      svg.append(el('line', { x1: lx, x2: lx + 20, y1: 12, y2: 12, ...dots }));
      svg.append(el('text', { x: lx + 26, y: 16, style: 'fill:var(--ink-2)', 'font-size': 12 },
        `${current.second.label ?? 'Outdoor'}${lastSecond ? ` ${fmt(lastSecond.value)}` : ''}${width < 560 ? ' · right scale' : ' · its scale on the right'}`));
    }

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
    cursorLine = el('line', { y1, y2: y0, style: 'stroke:var(--ink-2)', 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' });
    svg.append(cursorLine, marker.line, marker.dot);

    layout = { xs, ys, points, width, y0, t0, t1, x0, x1 };
    placeCursor();
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

  function placeCursor() {
    if (!cursorLine || !layout) return;
    if (cursorAt === null || cursorAt < layout.t0 || cursorAt > layout.t1) {
      cursorLine.setAttribute('visibility', 'hidden');
      return;
    }
    const x = xFor(cursorAt, layout.t0, layout.t1, layout.x0, layout.x1);
    cursorLine.setAttribute('x1', x);
    cursorLine.setAttribute('x2', x);
    cursorLine.setAttribute('visibility', 'visible');
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
    current.onCursor?.(layout.points[i].at);
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
    tip.textContent = `${(current.formatAt ?? formatClock)(p.at)}  ${p.value === null ? 'no answer' : fmt(p.value)}`;
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
    current.onCursor?.(null);
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
    // The shared time line: draws a dashed line at `at` (null hides it), for hovers on another chart.
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

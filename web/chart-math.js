// Pure helpers for the line chart and the detail page (no DOM, so they can be tested in Node).

const pad2 = (n) => String(n).padStart(2, '0');

// hh:mm:ss in the browser's local time.
export function formatClock(ms) {
  const d = new Date(ms);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

// "5 s ago", "2 min ago", "1 h 5 min ago"; never negative (a clock a little behind shows "0 s ago").
export function formatAgo(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} h ago` : `${h} h ${m % 60} min ago`;
}

// The y range for a set of values: the data's min and max with 10 % padding either side.
// A flat line (or one value) still gets a range of at least minSpan, centred on the value.
// `bounds` ([lo, hi]) keeps the axis inside the measure's physical range (relative humidity: 0 to 100).
// include: extra values the range must show (the band limits), even when no reading is near them.
// A range's ends rounded out to a round step (at least an eighth of the span: 1, 2 or 5 times a power of ten), so the
// axis reads 18.5–21.5 rather than 18.8–21.2; bounds still apply.
export function niceRange({ min, max }, bounds = null) {
  const raw = (max - min) / 8;
  if (!(raw > 0)) return { min, max };
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((k) => k * p).find((s) => s >= raw);
  const r = (x) => Number(x.toFixed(10));
  let lo = r(Math.floor(r(min / step)) * step);
  let hi = r(Math.ceil(r(max / step)) * step);
  if (bounds) { lo = Math.max(lo, bounds[0]); hi = Math.min(hi, bounds[1]); }
  return { min: lo, max: hi };
}

export function yRange(values, minSpan = 1, bounds = null, include = []) {
  const data = values.filter((x) => Number.isFinite(x));
  if (data.length === 0) return { min: 0, max: minSpan };
  const v = [...data, ...include.filter((x) => Number.isFinite(x))];
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const span = Math.max(hi - lo, minSpan);
  const padding = span * 0.1;
  const mid = (lo + hi) / 2;
  let min = mid - span / 2 - padding;
  let max = mid + span / 2 + padding;
  if (bounds) {
    min = Math.max(min, bounds[0]);
    max = Math.min(max, bounds[1]);
  }
  return { min, max };
}

// x position of time `at` between the first and last time, across [x0, x1].
// A single time (or all equal) sits in the middle.
export function xFor(at, t0, t1, x0, x1) {
  if (t1 <= t0) return (x0 + x1) / 2;
  return x0 + ((at - t0) / (t1 - t0)) * (x1 - x0);
}

// Runs of consecutive points that have a value; a null value ends a run (the line breaks there).
export function segments(points) {
  const runs = [];
  let run = [];
  for (const p of points) {
    if (p.value === null || p.value === undefined || !Number.isFinite(p.value)) {
      if (run.length) runs.push(run);
      run = [];
    } else {
      run.push(p);
    }
  }
  if (run.length) runs.push(run);
  return runs;
}

// Index of the x in `xs` (ascending) closest to `x`; -1 when there are none.
export function nearestIndex(xs, x) {
  if (xs.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < xs.length; i++) {
    if (Math.abs(xs[i] - x) < Math.abs(xs[best] - x)) best = i;
  }
  return best;
}

// Points for the three charts from a sensor object (I3): one point per poll, null when not ok.
export function chartPoints(sensor, field) {
  return (sensor?.readings ?? []).map((r) => ({ at: r.at, value: r.ok && Number.isFinite(r[field]) ? r[field] : null }));
}

// A second line (the outdoor values) cut to the chart's time window [t0, t1]: points inside it stay, and where a line
// crosses an edge a point is added on the edge, so the line runs to the edge instead of stopping at the last point inside.
// A null value (a gap) is kept when inside the window.
export function clipSeries(points, t0, t1) {
  const out = [];
  const has = (p) => p && p.value !== null && p.value !== undefined && Number.isFinite(p.value);
  const lerp = (a, b, at) => ({ at, value: a.value + ((b.value - a.value) * (at - a.at)) / (b.at - a.at) });
  const list = points ?? [];
  list.forEach((p, i) => {
    const prev = list[i - 1];
    if (t1 > t0 && prev && has(prev) && has(p) && p.at > prev.at) {
      for (const edge of [t0, t1]) if (prev.at < edge && p.at > edge) out.push(lerp(prev, p, edge));
    }
    if (p.at >= t0 && p.at <= t1) out.push(p);
  });
  return out;
}

// The band as it moved (chart option bandSteps: [{ from, to, low, high }], times like the points') cut to the window and turned
// into shapes: one shaded rect per step and one stepped path for each limit. yFor maps a value to y, xAt a time to x.
// → { rects: [{ x, y, width, height }], high, low } (the two paths as `d` strings, '' when there is no step in the window).
export function stepShapes(steps, window, xAt, yFor) {
  const rects = [];
  const paths = { high: '', low: '' };
  let end = null; // where the previous step ended, to continue its line
  for (const s of steps ?? []) {
    const from = Math.max(s.from, window.from);
    const to = Math.min(s.to, window.to);
    if (!(to > from)) continue;
    const xa = xAt(from);
    const xb = xAt(to);
    const yHigh = yFor(s.high);
    const yLow = yFor(s.low);
    rects.push({ x: xa, y: yHigh, width: Math.max(0, xb - xa), height: Math.max(0, yLow - yHigh) });
    for (const [key, y] of [['high', yHigh], ['low', yLow]]) {
      paths[key] += `${end === from ? `V${y.toFixed(1)}` : `M${xa.toFixed(1)} ${y.toFixed(1)}`}H${xb.toFixed(1)}`;
    }
    end = to;
  }
  return { rects, ...paths };
}

// Every value a list of band steps reaches, for the y range.
export const stepValues = (steps) => (steps ?? []).flatMap((s) => [s.low, s.high]);

// The outdoor line's legend, longest first, the first that fits `room` px of 12 px text (about 7 px a character, so a phone's
// chart never clips it): "Outdoor 61.1 % RH · its scale on the right", "… · right scale", "Outdoor 61.1 % RH", "Outdoor".
// Without the scale words the right scale's own dotted mark says whose numbers they are. scale false: the chart has no
// outdoor scale (a phone's), so the legend never names one.
export function secondLegend(label, value, room, scale = true) {
  const base = value ? `${label} ${value}` : label;
  return [...(scale ? [`${base} · its scale on the right`, `${base} · right scale`] : []), base].find((t) => t.length * 7 <= room) ?? label;
}

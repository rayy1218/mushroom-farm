// web/charts.js: charts moved from the old dashboard script (docs/contracts/web.md section 6).
(function (global) {
'use strict';

// ---------------- Pure functions (6.2) ----------------
function lowerBound(arr, t) {
  let a = 0, b = arr.length;
  while (a < b) { const m = (a + b) >> 1; if (arr[m].t < t) a = m + 1; else b = m; }
  return a;
}
function nearest(pts, t) {
  if (!pts.length) return null;
  const i = lowerBound(pts, t);
  if (i <= 0) return pts[0];
  if (i >= pts.length) return pts[pts.length - 1];
  return t - pts[i - 1].t < pts[i].t - t ? pts[i - 1] : pts[i];
}
// Average readings into buckets so a long window draws fast. Gaps (NaN) are left out of the average.
const AVG_KEYS = ['T', 'RH', 'C', 'tOut', 'rhOut', 'ac', 'hu', 'fan', 'li', 'ci', 'acSet', 'core', 'vpd'];
function aggregate(pts, maxN) {
  if (pts.length <= maxN) return pts;
  const k = Math.ceil(pts.length / maxN), out = [];
  for (let i = 0; i < pts.length; i += k) {
    const chunk = pts.slice(i, i + k), o = { ...chunk[chunk.length - 1] };
    for (const key of AVG_KEYS) {
      let s = 0, n = 0;
      for (const p of chunk) if (Number.isFinite(p[key])) { s += p[key]; n++; }
      o[key] = n ? s / n : NaN;
    }
    o.t = (chunk[0].t + chunk[chunk.length - 1].t) / 2;
    out.push(o);
  }
  return out;
}
function niceTicks(lo, hi, n) {
  if (hi - lo < 1e-9) hi = lo + 1;
  const raw = (hi - lo) / (n - 1), mag = 10 ** Math.floor(Math.log10(raw)), r = raw / mag;
  const st = (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.floor(lo / st) * st; v <= Math.ceil(hi / st) * st + st * 1e-6; v += st) out.push(+v.toFixed(6));
  return out;
}
// A line with gaps where the value is not finite, or where two points are more than gapS apart.
function linePath(pts, X, Y, f, gapS = Infinity) {
  let d = '', pen = false, lastT = null;
  for (const p of pts) {
    const y = f(p);
    if (!Number.isFinite(y)) { pen = false; continue; }
    if (pen && lastT != null && p.t - lastT > gapS) pen = false;
    d += (pen ? 'L' : 'M') + X(p.t).toFixed(1) + ',' + Y(y).toFixed(1);
    pen = true; lastT = p.t;
  }
  return d;
}
function areaPath(pts, X, Y, lo, hi) {
  if (pts.length < 2) return '';
  let d = linePath(pts, X, Y, hi);
  for (let i = pts.length - 1; i >= 0; i--) d += 'L' + X(pts[i].t).toFixed(1) + ',' + Y(lo(pts[i])).toFixed(1);
  return d + 'Z';
}
// Bar with rounded top ends only (anchored to the baseline).
function barPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

// ---------------- DOM charts (6.3, drawExhaustBars, drawCalibCharts, createLadder) ----------------
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const BAND_T = 1, BAND_RH = 3;

const TREND_DEFS = {
  T: { out: 'tOut', unit: '°C', dec: 1, minSpan: 3, label: 'Temperature', title: 'TT-101 · outdoor OT-104',
    band: p => [p.spT - BAND_T, p.spT + BAND_T], ref: p => p.spT, sub: p => `Target ${p.spT.toFixed(1)} °C ± ${BAND_T}` },
  RH: { out: 'rhOut', unit: '%', dec: 0, minSpan: 12, label: 'Relative humidity', title: 'MT-102 · outdoor OT-104',
    band: p => [p.spRH - BAND_RH, p.spRH + BAND_RH], ref: p => p.spRH, sub: p => `Target ${p.spRH} % ± ${BAND_RH}` },
  C: { out: null, unit: 'ppm', dec: 0, minSpan: 300, label: 'CO₂ concentration', title: 'AT-103',
    band: p => [p.fanOff, p.fanOn], ref: p => p.co2Lim, sub: p => `Fan ${p.fanOff}–${p.fanOn} ppm · limit ${p.co2Lim}` },
};
const DEV = [['ac', 'AC'], ['hu', 'Fogger'], ['fan', 'Fan'], ['li', 'Lights'], ['ci', 'Circ.']];
const LEGEND_NAME = { ac: 'Air conditioner', hu: 'Fogger', fan: 'Exhaust fan', li: 'Lights', ci: 'Circulation' };
const sumTo = (p, n) => DEV.slice(0, n).reduce((a, [k]) => a + (p[k] || 0), 0);

function createTrendCharts(el, opts) {
  const keys = opts.keys || ['T', 'RH', 'C'];
  const power = !!opts.power;
  const clock = opts.clock;
  const statusFn = opts.status || (() => null);
  el.classList.add('contents');

  let view = null, hoverT = null, hoverChart = null, rafId = null;
  const cards = [];

  // A hover, key move or resize redraws through one shared requestAnimationFrame (6.3): destroy() cancels it.
  function scheduleRedraw() {
    if (rafId != null) return;
    rafId = requestAnimationFrame(() => { rafId = null; redraw(); });
  }

  function card(titleText, sub, headingTag, withSub) {
    const section = document.createElement('section'); section.className = 'card trend';
    const head = document.createElement('div'); head.className = 'ch-head';
    const left = document.createElement('div');
    const h3 = document.createElement(headingTag || 'h3'); h3.textContent = titleText;
    const tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = sub || '';
    left.append(h3, tag);
    const readv = document.createElement('div'); readv.className = 'readv'; readv.textContent = '--';
    head.append(left, readv);
    const host = document.createElement('div'); host.className = 'ch-host';
    // The power card has no per-key status chip or hover sub-line (drawPowerCard never sets them), so it
    // gets no .ch-sub row: today's power card is head, legend, host, tooltip, with no blank line.
    if (withSub === false) { section.append(head, host); return { section, readv, subSpan: null, chip: null, host }; }
    const chSub = document.createElement('div'); chSub.className = 'ch-sub';
    const subSpan = document.createElement('span'); const chip = document.createElement('span'); chip.className = 'chip';
    chSub.append(subSpan, chip);
    section.append(head, chSub, host);
    return { section, readv, subSpan, chip, host };
  }

  function makeSvg(host, height, label) {
    const svg = svgEl('svg', { class: 'chart', height, tabindex: 0, role: 'img', 'aria-label': `${label}. Use the left and right arrow keys to read values.` }, host);
    const c = { host, svg, height, w: host.clientWidth || 400 };
    c.nightG = svgEl('g', {}, svg);
    c.grid = svgEl('g', { class: 'grid' }, svg);
    c.xaxis = svgEl('g', {}, svg);
    c.body = svgEl('g', {}, svg);
    c.cross = svgEl('line', { class: 'cross', visibility: 'hidden' }, svg);
    c.over = svgEl('g', {}, svg);
    const size = () => { c.w = Math.max(200, host.clientWidth); svg.setAttribute('width', c.w); svg.setAttribute('viewBox', `0 0 ${c.w} ${height}`); scheduleRedraw(); };
    const ro = new ResizeObserver(size);
    ro.observe(host);
    c.ro = ro;
    svg.addEventListener('pointermove', ev => {
      if (!view) return;
      const r = svg.getBoundingClientRect(), pw = c.w - c.m.l - c.m.r;
      const t = view.t0 + (ev.clientX - r.left - c.m.l) / pw * (view.t1 - view.t0);
      const p = nearest(view.pts, t);
      if (p && p.t !== hoverT) { hoverT = p.t; hoverChart = c; scheduleRedraw(); }
    });
    svg.addEventListener('pointerleave', () => { hoverT = null; scheduleRedraw(); });
    svg.addEventListener('blur', () => { hoverT = null; scheduleRedraw(); });
    svg.addEventListener('keydown', ev => {
      if (!view || !view.pts.length) return;
      const pts = view.pts;
      let i = hoverT == null ? pts.length - 1 : lowerBound(pts, hoverT);
      if (ev.key === 'ArrowLeft') i = Math.max(0, i - (ev.shiftKey ? 12 : 1));
      else if (ev.key === 'ArrowRight') i = Math.min(pts.length - 1, i + (ev.shiftKey ? 12 : 1));
      else if (ev.key === 'Escape') { hoverT = null; scheduleRedraw(); return; }
      else return;
      ev.preventDefault(); hoverT = pts[i].t; hoverChart = c; scheduleRedraw();
    });
    return c;
  }

  const trendCards = [];
  for (const key of keys) {
    const def = TREND_DEFS[key];
    const ui = card(def.label, def.title);
    const c = makeSvg(ui.host, 160, `${def.label} trend`);
    c.m = { l: 46, r: def.out ? 58 : 12, t: 10, b: 22 };
    c.band = svgEl('path', { class: 'band' }, c.body);
    c.ref = svgEl('path', { class: 'ref' }, c.body);
    if (def.out) c.outLine = svgEl('path', { class: 'out' }, c.body);
    if (key === 'T') c.coreLine = svgEl('path', { class: 'core' }, c.body);
    c.line = svgEl('path', { class: 'line' }, c.body);
    c.labels = svgEl('g', {}, c.body);
    c.dot = svgEl('circle', { class: 'dot', r: 4, visibility: 'hidden' }, c.over);
    el.appendChild(ui.section);
    trendCards.push({ key, def, c, ui });
  }

  let powerCard = null;
  if (power) {
    const ui = card('Power consumption', 'Power meters · stacked by machine', 'h2', false);
    ui.section.className = 'card power';
    const legend = document.createElement('div'); legend.className = 'legend';
    const lg = {};
    for (const [k, name] of DEV) {
      const span = document.createElement('span'); span.style.setProperty('--key', `var(--s-${k === 'li' ? 'li' : k === 'ci' ? 'ci' : k})`);
      const i = document.createElement('i'); const b = document.createElement('b'); lg[k] = b;
      span.append(i, document.createTextNode(LEGEND_NAME[k] + ' '), b);
      legend.append(span);
    }
    ui.section.insertBefore(legend, ui.host);
    const tooltip = document.createElement('div'); tooltip.className = 'tooltip'; tooltip.setAttribute('role', 'status');
    ui.section.append(tooltip);
    const c = makeSvg(ui.host, 220, 'Power consumption by machine, stacked');
    c.m = { l: 56, r: 84, t: 10, b: 22 };
    c.areas = Object.fromEntries(DEV.map(([k]) => [k, svgEl('path', { class: `area ${k}` }, c.body)]));
    c.gap = svgEl('path', { class: 'gap' }, c.body);
    c.base = svgEl('line', { class: 'base' }, c.body);
    c.labels = svgEl('g', {}, c.body);
    el.appendChild(ui.section);
    powerCard = { c, ui, legend: lg, tooltip };
  }

  function nightShade(c, v, X) {
    const { m, height: h } = c;
    let s = '';
    const off = clock.offset, A0 = v.t0 + off, A1 = v.t1 + off;
    for (let d = Math.floor(A0 / 86400) - 1; d <= Math.floor(A1 / 86400); d++) {
      const a = Math.max(A0, d * 86400 + 19 * 3600), b = Math.min(A1, (d + 1) * 86400 + 7 * 3600);
      if (b > a) s += `<rect class="night" x="${X(a - off).toFixed(1)}" y="${m.t}" width="${(X(b - off) - X(a - off)).toFixed(1)}" height="${h - m.t - m.b}"/>`;
    }
    c.nightG.innerHTML = s;
  }
  function xAxis(c, v, X) {
    const { m, height: h } = c, span = v.t1 - v.t0;
    const step = [600, 1800, 3600, 7200, 10800, 14400, 21600].find(s => s >= span / 6) || 21600;
    const off = clock.offset;
    let s = '';
    for (let A = Math.ceil((v.t0 + off) / step) * step; A <= v.t1 + off + 1e-6; A += step) s += `<text x="${X(A - off).toFixed(1)}" y="${h - 5}" text-anchor="middle">${clock.hm(A - off)}</text>`;
    s += `<line class="base" x1="${m.l}" x2="${c.w - m.r}" y1="${h - m.b}" y2="${h - m.b}"/>`;
    c.xaxis.innerHTML = s;
  }
  function crosshair(c, X, show) {
    if (!show) { c.cross.setAttribute('visibility', 'hidden'); return; }
    const x = X(hoverT).toFixed(1);
    for (const [k, val] of [['x1', x], ['x2', x], ['y1', c.m.t], ['y2', c.height - c.m.b]]) c.cross.setAttribute(k, val);
    c.cross.setAttribute('visibility', 'visible');
  }
  const lastFinite = (pts, key) => { for (let i = pts.length - 1; i >= 0; i--) if (Number.isFinite(pts[i][key])) return pts[i]; return null; };

  function drawTrend(tc, v, hp) {
    const { def, c, ui } = tc, { m, w, height: h } = c, pts = v.pts;
    if (!pts.length) return;
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    let lo = Infinity, hi = -Infinity;
    const take = x => { if (Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); } };
    for (const p of pts) { const [b0, b1] = def.band(p); take(p[tc.key]); take(b0); take(b1); take(def.ref(p)); if (def.out) take(p[def.out]); if (tc.key === 'T') take(p.core); }
    if (!Number.isFinite(lo)) return;
    const mid = (lo + hi) / 2, half = Math.max(hi - lo, def.minSpan) / 2;
    lo = Math.min(lo, mid - half); hi = Math.max(hi, mid + half);
    const pad = (hi - lo) * 0.05, ticks = niceTicks(lo - pad, hi + pad, 4), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = t => m.l + (t - v.t0) / (v.t1 - v.t0) * pw, Y = val => m.t + (1 - (val - y0) / (y1 - y0)) * ph;
    nightShade(c, v, X);
    c.grid.innerHTML = ticks.map(tk => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(tk).toFixed(1)}" y2="${Y(tk).toFixed(1)}"/><text x="${m.l - 6}" y="${(Y(tk) + 4).toFixed(1)}" text-anchor="end">${Number.isInteger(tk) ? tk : tk.toFixed(1)}</text>`).join('');
    xAxis(c, v, X);
    c.band.setAttribute('d', areaPath(pts, X, Y, p => def.band(p)[0], p => def.band(p)[1]));
    c.ref.setAttribute('d', linePath(pts, X, Y, def.ref, v.gapS));
    c.line.setAttribute('d', linePath(pts, X, Y, p => p[tc.key], v.gapS));
    c.labels.replaceChildren();
    if (def.out) {
      c.outLine.setAttribute('d', linePath(pts, X, Y, p => p[def.out], v.gapS));
      if (c.coreLine) c.coreLine.setAttribute('d', linePath(pts, X, Y, p => p.core, v.gapS));
      const pIn = lastFinite(pts, tc.key), pOut = lastFinite(pts, def.out), xEnd = X(pts[pts.length - 1].t) + 6;
      if (pIn && pOut) {
        let yIn = Y(pIn[tc.key]), yOut = Y(pOut[def.out]);
        if (Math.abs(yIn - yOut) < 13) { const mid2 = (yIn + yOut) / 2, s = yIn <= yOut ? -1 : 1; yIn = mid2 + s * 6.5; yOut = mid2 - s * 6.5; }
        for (const [txt, y] of [['Room', yIn], ['Outdoor', yOut]]) { const t = svgEl('text', { class: 'slabel', x: xEnd, y: (y + 4).toFixed(1) }, c.labels); t.textContent = txt; }
      }
    }
    crosshair(c, X, !!hp);
    if (hp && Number.isFinite(hp[tc.key])) { c.dot.setAttribute('cx', X(hp.t).toFixed(1)); c.dot.setAttribute('cy', Y(hp[tc.key]).toFixed(1)); c.dot.setAttribute('visibility', 'visible'); }
    else c.dot.setAttribute('visibility', 'hidden');
    const p = hp || pts[pts.length - 1];
    const UI = global.FarmUi;
    const sm = document.createElement('small'); sm.textContent = def.unit;
    ui.readv.replaceChildren(document.createTextNode(UI.fmtNum(p[tc.key], def.dec)), sm);
    const outTxt = def.out ? ` · outdoor ${UI.fmtNum(p[def.out], def.dec)} ${def.unit}` : '';
    ui.subSpan.textContent = hp ? `${clock.stamp(hp.t)}${outTxt}` : def.sub(p) + outTxt;
    const chip = statusFn(tc.key === 'C' ? 'CO2' : tc.key);
    if (chip) UI.paintChip(ui.chip, chip); else ui.chip.replaceChildren();
  }

  function drawPowerCard(v, hp) {
    if (!powerCard) return;
    const { c, ui, legend, tooltip } = powerCard, { m, w, height: h } = c, pts = v.pts;
    if (!pts.length) return;
    const UI = global.FarmUi;
    const pw = w - m.l - m.r, ph = h - m.t - m.b;
    let max = 100; for (const p of pts) max = Math.max(max, sumTo(p, 5));
    const ticks = niceTicks(0, max * 1.05, 4), y1 = ticks[ticks.length - 1];
    const X = t => m.l + (t - v.t0) / (v.t1 - v.t0) * pw, Y = val => m.t + (1 - val / y1) * ph;
    nightShade(c, v, X);
    c.grid.innerHTML = ticks.map(tk => `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(tk).toFixed(1)}" y2="${Y(tk).toFixed(1)}"/><text x="${m.l - 6}" y="${(Y(tk) + 4).toFixed(1)}" text-anchor="end">${tk >= 1000 ? (tk / 1000) + ' kW' : tk + ' W'}</text>`).join('');
    xAxis(c, v, X);
    const lo = {}, hi = {};
    DEV.forEach(([k], i) => { lo[k] = p => sumTo(p, i); hi[k] = p => sumTo(p, i + 1); });
    for (const [k] of DEV) c.areas[k].setAttribute('d', areaPath(pts, X, Y, lo[k], hi[k]));
    c.gap.setAttribute('d', pts.length > 1 ? DEV.slice(0, 4).map(([k]) => linePath(pts, X, Y, hi[k], v.gapS)).join('') : '');
    for (const [k, val] of [['x1', m.l], ['x2', w - m.r], ['y1', Y(0)], ['y2', Y(0)]]) c.base.setAttribute(k, val);
    c.labels.replaceChildren();
    const last = pts[pts.length - 1];
    for (const [k, name] of DEV) {
      const yT = Y(hi[k](last)), yB = Y(lo[k](last));
      if (yB - yT >= 14) { const t = svgEl('text', { class: 'dlabel', x: X(last.t) + 6, y: ((yT + yB) / 2 + 4).toFixed(1) }, c.labels); t.textContent = name; }
    }
    crosshair(c, X, !!hp);
    const p = hp || last, total = sumTo(p, 5);
    const sm = document.createElement('small'); sm.textContent = total >= 1000 ? 'kW' : 'W';
    ui.readv.replaceChildren(document.createTextNode(UI.watts(total).replace(/ k?W$/, '')), sm);
    legend.ac.textContent = UI.watts(p.ac || 0); legend.hu.textContent = UI.watts(p.hu || 0); legend.fan.textContent = UI.watts(p.fan || 0);
    legend.li.textContent = UI.watts(p.li || 0); legend.ci.textContent = UI.watts(p.ci || 0);
    if (hp && hoverChart === c) {
      const rows = [document.createElement('div')];
      rows[0].className = 'tt-time'; rows[0].textContent = clock.stamp(hp.t);
      const row = (key, val, name, cls) => {
        const r = document.createElement('div'); r.className = 'row' + (cls ? ' ' + cls : '');
        const i = document.createElement('i'); if (key) i.style.setProperty('--key', `var(--s-${key})`); else i.style.visibility = 'hidden';
        const b = document.createElement('b'); b.textContent = UI.watts(val);
        const s = document.createElement('span'); s.textContent = name;
        r.append(i, b, s); rows.push(r);
      };
      row('ci', hp.ci || 0, 'Circulation'); row('li', hp.li || 0, 'Lights'); row('fan', hp.fan, 'Exhaust fan'); row('hu', hp.hu, 'Fogger'); row('ac', hp.ac, 'Air conditioner'); row(null, total, 'Total', 'total');
      tooltip.replaceChildren(...rows);
      tooltip.style.display = 'block';
      const x = X(hp.t) + ui.host.offsetLeft;
      tooltip.style.left = `${x + 14 + tooltip.offsetWidth > ui.host.offsetLeft + w ? x - 14 - tooltip.offsetWidth : x + 14}px`;
      tooltip.style.top = `${ui.host.offsetTop + 8}px`;
    } else tooltip.style.display = 'none';
  }

  function redraw() {
    if (!view) return;
    if (hoverT != null && hoverT < view.t0) hoverT = null;
    const hp = hoverT == null ? null : nearest(view.pts, hoverT);
    for (const tc of trendCards) drawTrend(tc, view, hp);
    drawPowerCard(view, hp);
  }
  function draw(v) {
    view = { t0: v.t0, t1: v.t1, pts: aggregate(v.pts, 700), gapS: v.gapS ?? Infinity };
    redraw();
  }
  function destroy() {
    if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
    for (const tc of trendCards) tc.c.ro.disconnect();
    if (powerCard) powerCard.c.ro.disconnect();
    el.replaceChildren();
  }
  return { draw, destroy };
}

// ---------------- drawExhaustBars ----------------
function drawExhaustBars(host, { hours, nowH, vol, clock }) {
  host.replaceChildren();
  const w = Math.max(240, host.clientWidth), h = 150, m = { l: 34, r: 8, t: 14, b: 22 };
  const pw = w - m.l - m.r, ph = h - m.t - m.b, bw = pw / 24, gap = 2;
  const Y = min => m.t + (1 - min / 60) * ph;
  const svg = svgEl('svg', { class: 'chart', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': 'Exhaust fan run minutes per hour, last 24 hours. The table below has the values.' });
  for (const tk of [0, 15, 30, 45, 60]) {
    svgEl('line', { x1: m.l, x2: w - m.r, y1: Y(tk), y2: Y(tk), class: tk === 0 ? 'base' : 'gridl' }, svg);
    const t = svgEl('text', { x: m.l - 6, y: Y(tk) + 4, 'text-anchor': 'end' }, svg); t.textContent = tk;
  }
  const maxB = hours.reduce((b, x) => (x.runS > b.runS ? x : b), hours[0]);
  hours.forEach((b, i) => {
    const x = m.l + i * bw + gap / 2, mins = b.runS / 60;
    if (b.h >= 0 && mins > 0) {
      const top = Y(Math.min(60, mins)), bh = Y(0) - top;
      const g = svgEl('g', { class: 'xbar' + (b.h === nowH ? ' now' : '') }, svg);
      svgEl('path', { d: barPath(x, top, bw - gap, bh, 4) }, g);
      const title = svgEl('title', {}, g);
      title.textContent = `${clock.hm(b.h * 3600)}–${clock.hm((b.h + 1) * 3600)}: ${Math.round(mins)} min, ${b.starts} purges, ${Math.round(b.m3)} m³ (${(b.m3 / vol).toFixed(1)} air changes)${b.h === nowH ? ', hour not finished' : ''}`;
      if (b === maxB) { const t = svgEl('text', { x: x + (bw - gap) / 2, y: top - 4, 'text-anchor': 'middle', class: 'xlab' }, svg); t.textContent = `${Math.round(mins)}`; }
    }
    if (((b.h + Math.round(clock.offset / 3600)) % 3 + 3) % 3 === 0) { const t = svgEl('text', { x: x + (bw - gap) / 2, y: h - 5, 'text-anchor': 'middle' }, svg); t.textContent = clock.hm(b.h * 3600); }
  });
  host.append(svg);
}

// ---------------- drawCalibCharts ----------------
function drawCalibCharts(host, { rows, base, fit }) {
  host.replaceChildren();
  if (!rows || !base) return;
  for (const [k, name, dec] of [['T', 'Temperature °C', 1], ['RH', 'Humidity %', 0], ['CO2', 'CO₂ ppm', 0]]) {
    const box = document.createElement('div'); const h4 = document.createElement('h4'); h4.textContent = name; box.append(h4);
    const w = Math.max(200, (host.clientWidth || 900) / 3 - 12), h = 120, m = { l: 36, r: 6, t: 6, b: 16 };
    const series = [['meas', rows.map(r => [r.t, r[k]])], ['simb', base.series.map(r => [r.t, r[k]])]];
    if (fit) series.push(['sima', fit.result.series.map(r => [r.t, r[k]])]);
    let lo = Infinity, hi = -Infinity, tMax = rows[rows.length - 1].t || 1;
    for (const [, pts] of series) for (const [, y] of pts) if (Number.isFinite(y)) { lo = Math.min(lo, y); hi = Math.max(hi, y); }
    const ticks = niceTicks(lo, hi, 3), y0 = ticks[0], y1 = ticks[ticks.length - 1];
    const X = t => m.l + t / tMax * (w - m.l - m.r), Y = y => m.t + (1 - (y - y0) / (y1 - y0 || 1)) * (h - m.t - m.b);
    const svg = svgEl('svg', { class: 'chart', width: w, height: h, viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': `${name}: measured and simulated` });
    for (const tk of ticks) { svgEl('line', { x1: m.l, x2: w - m.r, y1: Y(tk), y2: Y(tk), class: 'gridl' }, svg); const tx = svgEl('text', { x: m.l - 4, y: Y(tk) + 4, 'text-anchor': 'end' }, svg); tx.textContent = Number.isInteger(tk) ? tk : tk.toFixed(1); }
    for (const [cls, pts] of series) {
      let dd = '', pen = false;
      for (const [t, y] of pts) { if (!Number.isFinite(y)) { pen = false; continue; } dd += (pen ? 'L' : 'M') + X(t).toFixed(1) + ',' + Y(y).toFixed(1); pen = true; }
      svgEl('path', { d: dd, class: cls }, svg);
    }
    box.append(svg); host.append(box);
  }
  const key = document.createElement('div'); key.className = 'cal-key';
  key.innerHTML = '<span><i></i>Measured</span><span><i class="b"></i>Simulation now</span>' + (fit ? '<span><i class="a"></i>Simulation, fitted</span>' : '');
  host.append(key);
}

// ---------------- createLadder ----------------
const LADDER_ROWS = [
  { key: 'fan', name: 'Fan purge', color: 'var(--s-fan)', hi: s => s.rules.fanOn, lo: s => s.rules.fanOff, on: s => true },
  { key: 'ac', name: 'AC setback', color: 'var(--s-ac)', hi: s => s.rules.acOff, lo: s => s.rules.acOn, on: s => s.rules.acPurge },
];
function createLadder(el) {
  el.classList.add('ladder');
  const rows = [];
  LADDER_ROWS.forEach((row, i) => {
    const name = document.createElement('span'); name.className = 'lad-name'; name.textContent = row.name;
    name.style.gridArea = `${i + 1} / 1`;
    const track = document.createElement('div'); track.className = 'lad-track'; track.style.setProperty('--key', row.color);
    track.style.gridArea = `${i + 1} / 2`;
    const hys = document.createElement('span'); hys.className = 'lad-hys';
    const onEl = document.createElement('span'); onEl.className = 'lad-on';
    track.append(hys, onEl);
    const chip = document.createElement('span'); chip.className = 'chip'; chip.style.gridArea = `${i + 1} / 3`;
    el.append(name, track, chip);
    rows.push({ ...row, hys, onEl, track, chip });
  });
  const over = document.createElement('div'); over.className = 'lad-over'; over.style.gridArea = `1 / 2 / ${LADDER_ROWS.length + 1} / 3`;
  const mk = (id, cls) => { const d = document.createElement('div'); d.className = cls; d.id = id; d.append(document.createElement('b')); return d; };
  const now = mk('ladNow', 'lad-mark'), lim = mk('ladLim', 'lad-mark lim'), safe = mk('ladSafe', 'lad-mark safe');
  over.append(now, lim, safe);
  const scale = document.createElement('div'); scale.className = 'lad-scale'; scale.id = 'ladScale'; scale.style.gridArea = `${LADDER_ROWS.length + 1} / 2`;
  el.append(over, scale);

  let ladScale = { lo: 400, hi: 1500 };
  const ladPos = v => `${clamp((v - ladScale.lo) / (ladScale.hi - ladScale.lo) * 100, 0, 100)}%`;
  function layout(settings, co2) {
    const R = settings.rules, now = Number.isFinite(co2) ? co2 : 0;
    const top = Math.max(R.fanOn, R.acOff, settings.co2Lim, R.co2Safety ? R.co2SafetyAt : 0, now, 0);
    ladScale = { lo: 400, hi: Math.ceil((top + 250) / 250) * 250 };
    for (const row of rows) {
      const lo = row.lo(settings), hi = row.hi(settings);
      row.hys.style.left = ladPos(lo); row.hys.style.width = `calc(${ladPos(hi)} - ${ladPos(lo)})`;
      row.onEl.style.left = ladPos(hi); row.onEl.style.right = '0';
      row.track.classList.toggle('lad-row-off', !row.on(settings));
    }
    scale.replaceChildren();
    const step = Math.ceil((ladScale.hi - ladScale.lo) / 5 / 100) * 100;
    for (let x = Math.ceil(ladScale.lo / step) * step; x <= ladScale.hi; x += step) {
      const s = document.createElement('span'); s.style.left = ladPos(x); s.textContent = x; scale.append(s);
    }
    lim.style.left = ladPos(settings.co2Lim);
    safe.style.left = ladPos(R.co2SafetyAt); safe.hidden = !R.co2Safety;
  }
  function draw(settings, co2, chips) {
    layout(settings, co2);
    const ok = Number.isFinite(co2);
    now.hidden = !ok;
    if (ok) { now.style.left = ladPos(co2); now.firstChild.textContent = `${Math.round(co2)} ppm`; }
    const UI = global.FarmUi;
    for (const row of rows) {
      const chip = chips && chips[row.key];
      if (chip) UI.paintChip(row.chip, chip); else row.chip.replaceChildren();
    }
  }
  function destroy() { el.replaceChildren(); el.classList.remove('ladder'); }
  return { draw, destroy };
}

global.FarmCharts = {
  lowerBound, nearest, aggregate, niceTicks, linePath, areaPath, barPath,
  createTrendCharts, drawExhaustBars, drawCalibCharts, createLadder,
};
})(typeof window !== 'undefined' ? window : globalThis);

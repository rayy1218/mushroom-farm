// The room drawing, shared by the farm's room page and the device app's simulated rooms.
//   createMimic(host, { idPrefix }) → { paint(drawState), tick(dtSeconds), destroy() }
//   startLoop(() => [mimic, ...]) → stop(): the requestAnimationFrame loop (paused while the tab is hidden)
// It is drawn 1:1 at the host's width (a ResizeObserver rebuilds it): the shapes scale, the text never does.
// Wide hosts get the room cross-section, narrow ones (a phone) a stacked version. The mapping from data is in
// mimic-math.js (pure, tested); styles in mimic.css.

import { sizeFor, view, describe, UNIT_KEYS } from './mimic-math.js';

export { fromRoom, fromSim, sizeFor, view, describe } from './mimic-math.js';

const NS = 'http://www.w3.org/2000/svg';
const BLADE = 'M0,-4 C10,-9 22,-7 27,0 C21,4 9,4 0,4 Z';

function S(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

function textNode(parent, x, y, cls, anchor) {
  return S('text', { x: Math.round(x), y: Math.round(y), class: cls, ...(anchor ? { 'text-anchor': anchor } : {}) }, parent);
}

// Three blades around the origin, r px long (the base blade is 27 long).
function blades(parent, r) {
  const g = S('g', {}, parent);
  const spin = S('g', {}, g);
  for (const a of [0, 120, 240]) S('path', { class: 'blade', d: BLADE, transform: `rotate(${a}) scale(${r / 27})` }, spin);
  S('circle', { class: 'blade', r: Math.max(2.5, r / 5.4) }, g);
  return spin;
}

// ---------------- the layouts: where everything goes, in px ----------------

function layoutWide(size) {
  const { w, h, k } = size, g = Math.max(k, 0.8);
  const acW = Math.max(196 * k, 170), acX = 348 * k - acW / 2, acY = 108 * k, acH = 62;
  const step = Math.max(50 * k, 54), roX = 470 * k, roW = Math.max(150 * k, 128), roY = 112 * k;
  const fan = (cx, cy, side) => ({ cx, cy, s: g, side });
  const ventY = { in: 160 * k, out: 352 * k };
  return {
    mode: 'wide', w, h, k,
    ground: h - 8 * k,
    wall: { x: 176 * k, y: 92 * k, w: 648 * k, h: 320 * k }, room: { x: 184 * k, y: 100 * k, w: 632 * k, h: 312 * k }, hatch: true,
    outdoor: { x: 12, eyebrow: 20, big: 46, small: 66, icon: [140, 38], sky: [154, 43] },
    note: { x: w - 8, y: 20, anchor: 'end' },
    cond: { cx: 330 * k, cy: 59 * k, s: g, rect: [290 * k, 30 * k, 80 * k, 58 * k], tx: 380 * k, ty: 54 * k, anchor: 'start', pipes: [346 * k, 356 * k, 88 * k, 108 * k] },
    ac: { x: acX, y: acY, w: acW, h: acH, flows: [0.2, 0.5, 0.8].map((f) => [acX + acW * f, acY + acH + 4, acX + acW * f - 24 * k, acY + acH + 4 + 84 * k]) },
    circ: { cx: 720 * k, cy: 150 * k, s: g, tx: 720 * k, ty: 150 * k + 20 * g + 18, anchor: 'middle' },
    readouts: [0, 1, 2].map((i) => ({ x: roX, y: roY + i * step, w: roW, h: 44 })),
    fanIn: { ...fan(180 * k, ventY.in), tx: 12, ty: ventY.in + 40 * g + 22, anchor: 'start', flows: { x1: 60 * k, x2: 134 * k, y: ventY.in } },
    fanOut: { ...fan(820 * k, ventY.out), tx: 836 * k, ty: ventY.out - 40 * g - 28, anchor: 'start', flows: { x1: 866 * k, x2: 990 * k, y: ventY.out } },
    hu: { s: k, ox: 0, oy: 0, tx: 680 * k, ty: 356 * k, anchor: 'end' },
    rack: { s: k, ox: 0, oy: 0, tx: 404 * k, ty: 356 * k, plume: 46 },
  };
}

function layoutNarrow(size) {
  const { w, h } = size;
  const acW = Math.min(w - 32, 320), roW = (w - 32 - 16) / 3, fanY = 270;
  const hs = 0.8, rs = 0.85;
  return {
    mode: 'narrow', w, h, k: 1,
    ground: h - 6,
    wall: { x: 0, y: 92, w, h: h - 98 }, room: { x: 8, y: 100, w: w - 16, h: h - 106 }, hatch: true,
    outdoor: { x: 34, eyebrow: null, big: null, small: 22, icon: [18, 17], sky: null, line: true },
    note: { x: 8, y: 86, anchor: 'start' },
    cond: { cx: w - 56, cy: 59, s: 0.8, rect: [w - 96, 34, 80, 50], tx: w - 104, ty: 46, anchor: 'end', pipes: null },
    ac: { x: 16, y: 108, w: acW, h: 62, flows: [0.2, 0.5, 0.8].map((f) => [16 + acW * f, 174, 16 + acW * f - 16, 214]) },
    circ: { cx: w / 2, cy: fanY, s: 0.8, tx: w / 2, ty: fanY + 34, anchor: 'middle' },
    readouts: [0, 1, 2].map((i) => ({ x: 16 + i * (roW + 8), y: 350, w: roW, h: 46 })),
    fanIn: { cx: 44, cy: fanY, s: 0.85, tx: 16, ty: fanY + 50, anchor: 'start', side: 'in', flows: { x1: 92, x2: 142, y: fanY } },
    fanOut: { cx: w - 44, cy: fanY, s: 0.85, tx: w - 16, ty: fanY + 50, anchor: 'end', side: 'out', flows: { x1: w - 146, x2: w - 96, y: fanY } },
    hu: { s: hs, ox: w - 16 - 64 * hs - 690 * hs, oy: h - 18 - 412 * hs, tx: w - 16 - 64 * hs - 10, ty: h - 18 - 70 * hs, anchor: 'end' },
    rack: { s: rs, ox: 16 - 240 * rs, oy: h - 18 - 412 * rs, tx: 16, ty: 432, plume: 30 },
  };
}

// ---------------- the drawing ----------------

export function createMimic(host, opts = {}) {
  const prefix = opts.idPrefix || 'mimic-';
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const anim = { fanIn: 0, fanOut: 0, cond: 0, circ: 0, acFlow: 0, airFlow: 0 };
  const mist = Array.from({ length: 16 }, (_, i) => ({ ph: i / 16, dx: (Math.random() - 0.5) * 14 }));
  const bubbles = Array.from({ length: 14 }, (_, i) => ({ ph: i / 14, dx: Math.random() * 136 }));
  let v = view(null), draw = null, svg = null, shape = null, h = null, alive = true, uid = 0;

  function build(size) {
    uid++;
    const L = size.mode === 'wide' ? layoutWide(size) : layoutNarrow(size);
    shape = `${size.mode}:${size.w}`;
    svg?.remove();
    svg = S('svg', { class: 'mimic-svg', width: size.w, height: size.h, viewBox: `0 0 ${size.w} ${size.h}`, role: 'img' });
    host.append(svg);
    const id = (n) => `${prefix}${uid}-${n}`;
    const defs = S('defs', {}, svg);
    const pat = S('pattern', { id: id('hatch'), width: 7, height: 7, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    S('rect', { class: 'hatch-bg', width: 7, height: 7 }, pat);
    S('line', { class: 'hatch-line', x1: 0, y1: 0, x2: 0, y2: 7 }, pat);
    for (const kind of ['ac', 'air']) {
      const m = S('marker', { id: id(`ar-${kind}`), viewBox: '0 0 10 10', refX: 7, refY: 5, markerWidth: 5, markerHeight: 5, orient: 'auto' }, defs);
      S('path', { class: `arrowhead ${kind}`, d: 'M0 0 L10 5 L0 10 z' }, m);
    }
    h = { L, text: {}, flowsAc: [], flowsAir: [], boxes: {} };
    const T = (key, x, y, cls, anchor) => { h.text[key] = textNode(svg, x, y, cls, anchor); return h.text[key]; };

    // outdoor
    const o = L.outdoor;
    if (o.eyebrow !== null) T('outEye', o.x, o.eyebrow, 'm-eyebrow').textContent = 'OUTDOOR';
    h.sun = S('g', { transform: `translate(${o.icon[0]} ${o.icon[1]})` }, svg);
    S('circle', { class: 'sun', r: 5 }, h.sun);
    S('path', { class: 'sun', d: 'M0,-8.5V-7 M0,7V8.5 M-8.5,0H-7 M7,0H8.5 M-6,-6L-5,-5 M5,5L6,6 M-6,6L-5,5 M5,-5L6,-6' }, h.sun);
    h.moon = S('g', { transform: `translate(${o.icon[0]} ${o.icon[1]})` }, svg);
    S('circle', { class: 'moon', r: 6.5 }, h.moon);
    S('circle', { class: 'moon-cut', cx: 3.6, cy: -2.4, r: 5.4 }, h.moon);
    if (o.big !== null) { T('outT', o.x, o.big, 'm-big'); }
    T('outSmall', o.x, o.small, 'm-small');
    if (o.sky) T('sky', o.sky[0], o.sky[1], 'm-small');
    T('note', L.note.x, L.note.y, 'm-small m-note', L.note.anchor);

    // structure
    S('line', { class: 'ground', x1: 0, y1: L.ground, x2: size.w, y2: L.ground }, svg);
    S('rect', { class: 'wall', fill: `url(#${id('hatch')})`, x: L.wall.x, y: L.wall.y, width: L.wall.w, height: L.ground - L.wall.y }, svg);
    S('rect', { class: 'room', x: L.room.x, y: L.room.y, width: L.room.w, height: L.ground - L.room.y }, svg);

    // condenser (outdoors, above the wall)
    const c = L.cond;
    h.boxes.cond = S('g', {}, svg);
    S('rect', { class: 'unit', x: c.rect[0], y: c.rect[1], width: c.rect[2], height: c.rect[3], rx: 4 }, h.boxes.cond);
    const cg = S('g', { transform: `translate(${c.cx} ${c.cy}) scale(${c.s})` }, h.boxes.cond);
    S('circle', { class: 'ring', r: 22 }, cg);
    h.condBlades = blades(cg, 18);
    if (c.pipes) for (const x of c.pipes.slice(0, 2)) S('path', { class: 'pipe', d: `M${x} ${c.pipes[2]} V${c.pipes[3]}` }, svg);
    T('condName', c.tx, c.ty, 'm-small', c.anchor).textContent = 'Condenser';
    T('condState', c.tx, c.ty + 16, 'm-small', c.anchor);

    // aircon
    const a = L.ac;
    h.boxes.ac = S('g', {}, svg);
    S('rect', { class: 'unit', x: a.x, y: a.y, width: a.w, height: a.h, rx: 6 }, h.boxes.ac);
    S('rect', { class: 'keybar ac', x: a.x, y: a.y, width: 6, height: a.h, rx: 2 }, h.boxes.ac);
    T('acName', a.x + 16, a.y + 19, 'm-tag').textContent = 'Aircon';
    T('acState', a.x + 16, a.y + 37, 'm-small');
    T('acSub', a.x + 16, a.y + 54, 'm-small');
    for (const [x1, y1, x2, y2] of a.flows) {
      h.flowsAc.push(S('path', { class: 'flow ac', d: `M${x1} ${y1} C${x1 + 2} ${y1 + (y2 - y1) * 0.4}, ${x2 + 14} ${y1 + (y2 - y1) * 0.7}, ${x2} ${y2}`, 'marker-end': `url(#${id('ar-ac')})` }, svg));
    }

    // circulation fan
    const ci = L.circ;
    h.boxes.circ = S('g', { transform: `translate(${ci.cx} ${ci.cy}) scale(${ci.s})` }, svg);
    S('circle', { class: 'unit', r: 24 }, h.boxes.circ);
    h.circBlades = blades(h.boxes.circ, 17);
    T('circName', ci.tx, ci.ty, 'm-tag', ci.anchor).textContent = 'Circulation fan';
    T('circState', ci.tx, ci.ty + 16, 'm-small', ci.anchor);

    // readouts
    h.readouts = {};
    ['T', 'RH', 'CO2'].forEach((key, i) => {
      const r = L.readouts[i], g = S('g', { class: 'readout' }, svg);
      S('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4 }, g);
      h.readouts[key] = {
        g,
        val: textNode(g, r.x + 8, r.y + 18, 'val'),
        ico: textNode(g, r.x + r.w - 8, r.y + (L.mode === 'narrow' ? 35 : 17), 'ico', 'end'),
        zn: textNode(g, r.x + 8, r.y + 35, 'zn'),
      };
    });

    // intake and exhaust fans (on the wall)
    h.fans = {};
    for (const [key, f] of [['intake', L.fanIn], ['exhaust', L.fanOut]]) {
      const g = S('g', { transform: `translate(${f.cx} ${f.cy}) scale(${f.s})` }, svg);
      h.boxes[key] = g;
      S('rect', { class: 'unit', x: -40, y: -40, width: 80, height: 80, rx: 6 }, g);
      S('rect', { class: 'keybar air', x: -40, y: 34, width: 80, height: 6, rx: 2 }, g);
      S('circle', { class: 'ring', r: 31 }, g);
      h.fans[key] = blades(g, 27);
      S('rect', { class: 'damper', x: -3, y: -36, width: 6, height: 72, rx: 2 }, g);
      for (const d of [-18, 0, 18]) {
        h.flowsAir.push(S('path', { class: 'flow air', d: `M${f.flows.x1} ${f.flows.y + d * f.s} H${f.flows.x2}`, 'marker-end': `url(#${id('ar-air')})` }, svg));
      }
      T(`${key}Name`, f.tx, f.ty, 'm-tag', f.anchor).textContent = key === 'intake' ? 'Intake fan' : 'Exhaust fan';
      T(`${key}State`, f.tx, f.ty + 16, 'm-small', f.anchor);
    }

    // humidifier and its mist (old 1000-wide coordinates under one transform)
    const hu = L.hu, hg = S('g', { transform: `translate(${hu.ox} ${hu.oy}) scale(${hu.s})` }, svg);
    h.boxes.hu = S('g', {}, hg);
    S('rect', { class: 'unit', x: 712, y: 326, width: 20, height: 12, rx: 3 }, h.boxes.hu);
    S('rect', { class: 'unit body', x: 690, y: 336, width: 64, height: 76, rx: 8 }, h.boxes.hu);
    S('rect', { class: 'keybar hu', x: 690, y: 336, width: 64, height: 6, rx: 2 }, h.boxes.hu);
    S('rect', { class: 'tank', x: 700, y: 370, width: 44, height: 30, rx: 3 }, h.boxes.hu);
    h.mist = mist.map(() => S('circle', { class: 'mist', r: 3 }, hg));
    T('huName', hu.tx, hu.ty, 'm-tag', hu.anchor).textContent = 'Humidifier';
    T('huState', hu.tx, hu.ty + 16, 'm-small', hu.anchor);

    // rack of blocks with the CO2 bubbles
    const rk = L.rack, rg = S('g', { transform: `translate(${rk.ox} ${rk.oy}) scale(${rk.s})` }, svg);
    S('line', { class: 'post', x1: 240, x2: 240, y1: 312, y2: 412 }, rg);
    S('line', { class: 'post', x1: 394, x2: 394, y1: 312, y2: 412 }, rg);
    S('line', { class: 'shelf', x1: 238, x2: 396, y1: 362, y2: 362 }, rg);
    h.caps = [];
    for (const y0 of [324, 374]) for (let i = 0; i < 5; i++) {
      const x = 246 + i * 29;
      S('rect', { class: 'bag', x, y: y0, width: 24, height: 36, rx: 7 }, rg);
      for (const [cx, cy, side] of [[x + 2, y0 + 12, -1], [x + 22, y0 + 24, 1]]) {
        const cap = S('g', { class: 'cap' }, S('g', { transform: `translate(${cx} ${cy})` }, rg));
        S('ellipse', { cx: 3 * side, cy: 0, rx: 7, ry: 3.6 }, cap);
        S('ellipse', { cx: 2 * side, cy: 5, rx: 5, ry: 2.8 }, cap);
        h.caps.push(cap);
      }
    }
    h.bubbles = bubbles.map(() => S('circle', { class: 'bubble', r: 2.5 }, rg));
    T('rackName', rk.tx, rk.ty, 'm-tag').textContent = 'Growing blocks';
    T('blocks', rk.tx, rk.ty + 16, 'm-small');
    if (draw !== undefined) paint(draw);
  }

  const put = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };

  function frame(dt) {
    if (!h) return;
    const move = dt > 0, u = v.units;
    if (move) {
      const air = Math.max(u.intake.level, u.exhaust.level);
      anim.fanIn = (anim.fanIn + 1080 * u.intake.level * dt) % 360;
      anim.fanOut = (anim.fanOut + 1080 * u.exhaust.level * dt) % 360;
      anim.cond = (anim.cond + 720 * (v.comp ? 0.3 + u.ac.level : 0) * dt) % 360;
      anim.circ = (anim.circ + 900 * u.circ.level * dt) % 360;
      anim.acFlow -= dt * 40 * (0.5 + u.ac.level);
      anim.airFlow -= dt * 60 * (0.3 + air);
    }
    h.fans.intake.setAttribute('transform', `rotate(${anim.fanIn.toFixed(1)})`);
    h.fans.exhaust.setAttribute('transform', `rotate(${anim.fanOut.toFixed(1)})`);
    h.condBlades.setAttribute('transform', `rotate(${anim.cond.toFixed(1)})`);
    h.circBlades.setAttribute('transform', `rotate(${anim.circ.toFixed(1)})`);
    for (const f of h.flowsAc) { f.style.opacity = v.acFlow; f.style.strokeDashoffset = anim.acFlow; }
    const airAmount = Math.max(u.intake.level, u.exhaust.level);
    for (const f of h.flowsAir) { f.style.opacity = v.airOn ? 0.35 + 0.65 * airAmount : 0; f.style.strokeDashoffset = anim.airFlow; }
    const fog = u.hu.level;
    mist.forEach((m, i) => {
      if (move) { m.ph += dt * (0.25 + 0.5 * fog); if (m.ph > 1) { m.ph -= 1; m.dx = (Math.random() - 0.5) * 14; } }
      const e = h.mist[i];
      e.setAttribute('cx', (722 + m.dx + Math.sin(m.ph * 7 + m.dx) * 4).toFixed(1));
      e.setAttribute('cy', (322 - m.ph * 80).toFixed(1));
      e.setAttribute('r', (2.5 + m.ph * 6).toFixed(1));
      e.style.opacity = (fog * (1 - m.ph) * 0.7).toFixed(2);
    });
    const plume = h.L.rack.plume / h.L.rack.s;
    bubbles.forEach((b, i) => {
      if (move) { b.ph += dt * (0.3 + 0.3 * v.co2Rate); if (b.ph > 1) { b.ph -= 1; b.dx = Math.random() * 136; } }
      const e = h.bubbles[i];
      e.setAttribute('cx', (249 + b.dx + Math.sin(b.ph * 9 + b.dx) * 3).toFixed(1));
      e.setAttribute('cy', (318 - b.ph * plume).toFixed(1));
      e.style.opacity = (v.co2Rate * (1 - b.ph)).toFixed(2);
    });
  }

  function paint(next) {
    draw = next;
    v = view(next);
    if (!h) return;
    const u = v.units;
    const o = h.L.outdoor;
    if (o.line) put(h.text.outSmall, `${v.hasOut ? `Outdoor ${v.outLine}` : v.outLine} · ${v.sky}`);
    else if (v.hasOut) { put(h.text.outT, v.outT); put(h.text.outSmall, v.outRH); put(h.text.sky, v.sky); } else { put(h.text.outT, ''); put(h.text.outSmall, v.outLine); put(h.text.sky, ''); }
    const showSky = v.hasOut || o.line;
    h.sun.style.display = showSky && !v.night ? '' : 'none';
    h.moon.style.display = showSky && v.night ? '' : 'none';
    put(h.text.note, v.note);
    put(h.text.condState, u.ac.on && v.comp ? 'Running' : 'Idle');
    const line = (key, unit) => put(h.text[key], unit.state === '--' ? 'No data' : `${unit.warn ? '! ' : ''}${unit.state}`);
    line('acState', u.ac); put(h.text.acSub, u.ac.sub);
    line('huState', u.hu); line('intakeState', u.intake); line('exhaustState', u.exhaust); line('circState', u.circ);
    put(h.text.blocks, v.blocks);
    for (const key of ['T', 'RH', 'CO2']) {
      const r = h.readouts[key], x = v.readouts[key];
      r.g.dataset.lvl = x.lvl;
      put(r.val, x.val); put(r.ico, x.ico); put(r.zn, x.zn);
    }
    const mark = (g, unit, on) => { g.classList.toggle('on', on); g.classList.toggle('nodata', !unit.known); g.classList.toggle('warn', unit.warn); };
    mark(h.boxes.ac, u.ac, u.ac.on); mark(h.boxes.cond, u.ac, u.ac.on && v.comp); mark(h.boxes.hu, u.hu, u.hu.on);
    mark(h.boxes.intake, u.intake, u.intake.on); mark(h.boxes.exhaust, u.exhaust, u.exhaust.on); mark(h.boxes.circ, u.circ, u.circ.on);
    for (const cap of h.caps) cap.style.transform = `scale(${v.capScale})`;
    svg.setAttribute('aria-label', describe(v));
    frame(0);
  }

  // Rebuilds on a change of the host width; hidden hosts (width 0) wait.
  function fit() {
    if (!alive) return;
    const width = host.clientWidth;
    if (!width) return;
    const size = sizeFor(width);
    if (`${size.mode}:${size.w}` === shape) return;
    build(size);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  observer?.observe(host);
  fit();
  if (!svg) build(sizeFor(host.clientWidth || 390)); // no layout yet (a hidden host or no observer): a first drawing anyway

  return {
    paint,
    tick(dt) {
      if ((reduced && reduced.matches) || !(dt > 0)) return;
      if (!host.isConnected || host.clientWidth === 0) return; // hidden (a missing room, a closed card): nothing to draw
      frame(Math.min(dt, 0.1));
    },
    destroy() { alive = false; observer?.disconnect(); svg?.remove(); svg = null; h = null; },
  };
}

// One requestAnimationFrame loop for the drawings getMimics() returns; stops while the tab is hidden and
// does not start for people who asked for less motion. Returns stop().
export function startLoop(getMimics) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || typeof requestAnimationFrame !== 'function') return () => {};
  let id = 0, last = 0, stopped = false;
  const step = (now) => {
    if (stopped) return;
    const dt = last ? (now - last) / 1000 : 0;
    last = now;
    for (const m of getMimics()) m.tick(dt);
    id = requestAnimationFrame(step);
  };
  const onVisibility = () => {
    cancelAnimationFrame(id);
    last = 0;
    if (!document.hidden && !stopped) id = requestAnimationFrame(step);
  };
  document.addEventListener('visibilitychange', onVisibility);
  onVisibility();
  return () => { stopped = true; cancelAnimationFrame(id); document.removeEventListener('visibilitychange', onVisibility); };
}

export { UNIT_KEYS };

// The room picture, shared by the farm's room page and the device app's simulated rooms: a container cut open on the
// ground under the sky, its machines as white units with one accent colour each, two racks of blocks and the air path from
// the intake to the exhaust (spec 2026-10-26-room-picture-design.md section 2; the look of docs/mockups/room-overview-minimal-colour.html).
//   createMimic(host, { idPrefix, readouts }) → { paint(drawState), tick(dtSeconds), destroy() }
//   startLoop(() => [mimic, ...]) → stop(): the requestAnimationFrame loop (paused while the tab is hidden)
// One layout, viewBox 840 × 380, scaled to the host's width. Below 640 px of host width the small texts are hidden (the names,
// the outdoor air, the aircon's state, the blocks, the readings: the page says them elsewhere). The lights (a lamp under the
// ceiling, spec 2026-10-26-lighting-design.md 8) and the dehumidifier only when the room has them. readouts: the three readings
// drawn by the room (the device app, which has no reading tiles).
// The mapping from data is in mimic-math.js (pure, tested); colours in mimic.css.

import { view, describe, UNIT_KEYS } from './mimic-math.js';

export { fromRoom, fromSim, view, describe } from './mimic-math.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 840;
const H = 380;
const NARROW_BELOW = 640; // px of host width: the small texts inside the picture are hidden below
let made = 0; // pictures made, for ids unique on the page
// One blade about the hub at (0, 0), in a fan 24 units across; three of them, 120° apart.
const BLADE = 'M0 0 C-2.5 -3 -2.4 -7.8 0.6 -8.6 C3.6 -8.7 3.4 -3.6 0 0 Z';
// The air path: in through the intake, over the racks, out past the exhaust.
const AIR_PATH = 'M112 170 H150 C 250 160, 420 196, 490 214 S 640 262, 714 270 H 770';

function S(tag, attrs, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

function textNode(parent, x, y, cls, anchor) {
  return S('text', { x, y, class: cls, ...(anchor ? { 'text-anchor': anchor } : {}) }, parent);
}

// A fan of radius r at (cx, cy): a ring, three blades and the hub. The blades turn about their own origin (the hub): the
// loop sets rotate() on their group, inside the fan's translate, so they never swing about a bounding box.
function fan(parent, cx, cy, r) {
  const g = S('g', { class: 'fan', transform: `translate(${cx} ${cy}) scale(${r / 12})` }, parent);
  S('circle', { class: 'ring', r: 11 }, g);
  const spin = S('g', { class: 'blades' }, g);
  for (const a of [0, 120, 240]) S('path', { d: BLADE, transform: `rotate(${a})` }, spin);
  S('circle', { class: 'blades', r: 1.9 }, g);
  return { g, spin };
}

// Three shelves of five blocks, each with a lion's mane, between two posts.
function rack(parent, x, y) {
  const g = S('g', {}, parent);
  for (let s = 0; s < 3; s++) {
    const shelf = y + 40 + s * 44;
    for (let b = 0; b < 5; b++) {
      const bx = x + 6 + b * 23;
      S('rect', { class: 'bag', x: bx, y: shelf - 31, width: 19, height: 30, rx: 7 }, g);
      S('circle', { class: 'cap', cx: bx + 9.5, cy: shelf - 13, r: 6 }, g);
    }
    S('rect', { class: 'rack', x, y: shelf, width: 122, height: 3, rx: 1.5 }, g);
  }
  S('rect', { class: 'rack', x, y, width: 3, height: 134, rx: 1.5 }, g);
  S('rect', { class: 'rack', x: x + 119, y, width: 3, height: 134, rx: 1.5 }, g);
}

// A hood with louvres (the intake's filter, the exhaust's outlet).
function hood(parent, x, y, w, h, lx1, lx2, ys) {
  S('rect', { class: 'unit', x, y, width: w, height: h, rx: 5 }, parent);
  for (const ly of ys) S('line', { class: 'louvre', x1: lx1, y1: ly, x2: lx2, y2: ly }, parent);
}

// A machine's name (bold) and its state under it, next to the machine. sky: written on the sky, not inside the room.
// A detail (the intake's filter) follows a short state on its line, a long one on a line of its own; max: the room the state
// line has (px), squeezed to it when a long state word would run off the picture.
function tag(parent, x, y, name, anchor, { sky = false, max = 0 } = {}) {
  const g = S('g', { class: `tag${sky ? ' on-sky' : ''}` }, parent);
  textNode(g, x, y, 'm-name', anchor).textContent = name;
  const line = textNode(g, x, y + 15, 'm-state', anchor);
  const state = S('tspan', {}, line);
  const sub = S('tspan', { class: 'm-sub' }, line);
  const below = textNode(g, x, y + 30, 'm-state m-sub', anchor);
  return { g, line, state, sub, below, max };
}

export function createMimic(host, opts = {}) {
  const prefix = opts.idPrefix || 'mimic-';
  const reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const anim = { intake: 0, exhaust: 0, cond: 0, circ: 0, plume: 0, air: 0 };
  const mist = Array.from({ length: 8 }, (_, i) => ({ ph: i / 8, dx: (Math.random() - 0.5) * 12 }));
  const drops = [0, 0.5].map((ph, i) => ({ ph, x: 185 + i * 6 }));
  let v = view(null), alive = true;

  const svg = S('svg', { class: 'mimic-svg', viewBox: `0 0 ${W} ${H}`, role: 'img' });
  host.append(svg);
  const h = { tags: {}, units: {}, fans: {} };
  const arrow = `${prefix}${++made}-arrow`; // unique on the page (a remounted page draws a new one)
  const defs = S('defs', {}, svg);
  const marker = S('marker', { id: arrow, viewBox: '0 0 10 10', refX: 6, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto' }, defs);
  S('path', { class: 'arrowhead', d: 'M0 0 L10 5 L0 10 z' }, marker);

  // sky and ground, the sun or the moon, the outdoor air
  S('rect', { class: 'sky', width: W, height: 336 }, svg);
  S('rect', { class: 'ground', y: 334, width: W, height: H - 334 }, svg);
  h.sun = S('circle', { class: 'sun', cx: 46, cy: 46, r: 13 }, svg);
  h.moon = S('g', {}, svg);
  S('circle', { class: 'moon', cx: 46, cy: 46, r: 13 }, h.moon);
  S('circle', { class: 'sky', cx: 52, cy: 41, r: 11 }, h.moon);
  const outdoor = S('g', { class: 'on-sky small' }, svg);
  textNode(outdoor, 70, 40, 'm-eyebrow').textContent = 'Outdoor';
  h.outT = textNode(outdoor, 70, 59, 'm-big');
  h.outRH = textNode(outdoor, 70, 75, 'm-small');

  // the container: a steel shell cut open, ribs on the roof edge, the room inside and its floor
  S('rect', { class: 'steel', x: 150, y: 112, width: 540, height: 222, rx: 6 }, svg);
  const ribs = S('g', { class: 'ribs' }, svg);
  for (let i = 0; i < 26; i++) S('line', { x1: 164 + i * 20, y1: 114, x2: 164 + i * 20, y2: 124 }, ribs);
  S('rect', { class: 'inside', x: 164, y: 126, width: 512, height: 196, rx: 2 }, svg);
  S('rect', { class: 'floor', x: 164, y: 314, width: 512, height: 8 }, svg);

  // the condenser on the roof and its pipe
  S('rect', { class: 'rack', x: 424, y: 104, width: 4, height: 30 }, svg);
  h.units.cond = S('g', {}, svg);
  S('rect', { class: 'unit', x: 392, y: 70, width: 70, height: 38, rx: 6 }, h.units.cond);
  h.fans.cond = fan(h.units.cond, 412, 89, 14);
  for (const y of [80, 87, 94, 101]) S('line', { class: 'louvre', x1: 434, y1: y, x2: 452, y2: y }, h.units.cond);
  h.tags.cond = tag(svg, 472, 84, 'Condenser', 'start', { sky: true });

  // the split aircon under the ceiling, its state written on it; cool (or warm) air under it while it runs
  h.units.ac = S('g', {}, svg);
  S('rect', { class: 'unit', x: 352, y: 134, width: 150, height: 30, rx: 8 }, h.units.ac);
  S('rect', { class: 'keybar ac', x: 352, y: 134, width: 5, height: 30, rx: 2 }, h.units.ac);
  h.acText = textNode(h.units.ac, 366, 153, 'm-ac small');
  h.acLamp = S('circle', { class: 'lamp', cx: 491, cy: 143, r: 3 }, h.units.ac);
  h.plumes = [0, 1, 2].map((i) => S('path', { class: 'plume', d: `M${384 + i * 40} 170 q -6 26 -16 50` }, svg));

  // two racks of blocks with lion's mane
  rack(svg, 258, 178);
  rack(svg, 392, 178);

  // the lights under the ceiling over the left rack (only when the room has them): a lamp on its cord, a warm glow round it
  // and light falling on the blocks while they are on; its name left of it
  h.lights = S('g', {}, svg);
  h.units.lights = S('g', { class: 'lights' }, h.lights);
  S('path', { class: 'light-cone', d: 'M309 148 H329 L378 312 H260 Z' }, h.units.lights);
  S('circle', { class: 'light-glow', cx: 319, cy: 146, r: 15 }, h.units.lights);
  S('rect', { class: 'rack', x: 318, y: 126, width: 2, height: 10 }, h.units.lights);
  S('path', { class: 'unit', d: 'M306 147 L311 136 H327 L332 147 Z' }, h.units.lights);
  S('circle', { class: 'bulb', cx: 319, cy: 148, r: 3.5 }, h.units.lights);
  h.tags.lights = tag(h.lights, 298, 146, 'Lights', 'end');

  // the air path, under the fans and the machines
  h.air = S('path', { class: 'air-path', d: AIR_PATH }, svg);

  // the intake: its hood (the filter) outside the left wall, then its fan in the wall in front of it; its name left of the hood
  h.units.intake = S('g', {}, svg);
  hood(h.units.intake, 118, 146, 32, 50, 124, 136, [156, 164, 172, 180, 188]);
  h.fans.intake = fan(h.units.intake, 158, 171, 18);
  h.tags.intake = tag(svg, 110, 166, 'Intake fan', 'end', { sky: true, max: 104 });

  // the dehumidifier on the near wall (only when the room has one), drops under it while it runs; its name under it
  h.dh = S('g', {}, svg);
  h.units.dh = S('g', {}, h.dh);
  S('rect', { class: 'unit', x: 174, y: 232, width: 28, height: 44, rx: 5 }, h.units.dh);
  S('rect', { class: 'keybar dh', x: 174, y: 232, width: 28, height: 5, rx: 2 }, h.units.dh);
  h.dhTank = S('rect', { class: 'lamp', x: 180, y: 260, width: 16, height: 9, rx: 2 }, h.units.dh);
  h.drops = drops.map(() => S('circle', { class: 'drop', r: 1.8 }, h.dh));
  h.tags.dh = tag(h.dh, 172, 292, 'Dehumidifier', 'start');

  // the circulation fan under the ceiling, its name under it
  S('rect', { class: 'rack', x: 619, y: 126, width: 3, height: 12 }, svg);
  h.units.circ = S('g', {}, svg);
  h.fans.circ = fan(h.units.circ, 620, 152, 14);
  h.tags.circ = tag(svg, 620, 186, 'Circulation', 'middle');

  // the humidifier on the floor, mist rising from it while it runs; its name right of it
  h.mist = mist.map(() => S('circle', { class: 'mist', r: 4 }, svg));
  h.units.hu = S('g', {}, svg);
  S('rect', { class: 'unit', x: 530, y: 270, width: 36, height: 44, rx: 8 }, h.units.hu);
  S('rect', { class: 'keybar hu', x: 530, y: 270, width: 36, height: 5, rx: 2 }, h.units.hu);
  h.huDrop = S('path', { class: 'lamp', d: 'M548 284 c-4 6 -5 8 -5 10 a5 5 0 0 0 10 0 c0 -2 -1 -4 -5 -10z' }, h.units.hu);
  h.tags.hu = tag(svg, 574, 288, 'Humidifier', 'start');

  // the exhaust: its hood outside the right wall, then its fan low in the wall in front of it; its name under the outgoing air
  h.units.exhaust = S('g', {}, svg);
  hood(h.units.exhaust, 690, 246, 30, 48, 704, 714, [256, 264, 272, 280]);
  h.fans.exhaust = fan(h.units.exhaust, 683, 270, 18);
  h.tags.exhaust = tag(svg, 728, 298, 'Exhaust fan', 'start', { sky: true, max: 108 });

  h.blocks = textNode(svg, 386, 358, 'm-blocks small', 'middle');

  // the readings by the room (the device app): value and chip text, right of the container above the exhaust
  h.readouts = {};
  if (opts.readouts) {
    ['T', 'RH', 'CO2'].forEach((key, i) => {
      const y = 130 + i * 38;
      const g = S('g', { class: 'readout small' }, svg);
      S('rect', { x: 706, y, width: 126, height: 32, rx: 5 }, g);
      const val = textNode(g, 714, y + 14, 'val');
      const chip = textNode(g, 714, y + 27, 'zn');
      h.readouts[key] = { g, val, ico: S('tspan', { class: 'ico' }, chip), zn: S('tspan', {}, chip) };
    });
  }

  const put = (node, text) => { if (node && node.textContent !== text) node.textContent = text; };
  // "● On", the state word ("Off", "! Not following"), or "No data".
  const stateOf = (u) => (!u.known ? 'No data' : u.warn ? `! ${u.state}` : u.on ? '● On' : u.state);

  function frame(dt) {
    const move = dt > 0, u = v.units;
    if (move) {
      const air = Math.max(u.intake.level, u.exhaust.level);
      anim.intake = (anim.intake + 1080 * u.intake.level * dt) % 360;
      anim.exhaust = (anim.exhaust + 1080 * u.exhaust.level * dt) % 360;
      anim.cond = (anim.cond + 720 * (v.comp ? 0.3 + u.ac.level : 0) * dt) % 360;
      anim.circ = (anim.circ + 300 * u.circ.level * dt) % 360; // slowly
      anim.plume -= dt * 24 * (0.5 + u.ac.level);
      anim.air -= dt * 28 * (0.5 + air);
    }
    for (const key of ['intake', 'exhaust', 'cond', 'circ']) h.fans[key].spin.setAttribute('transform', `rotate(${anim[key].toFixed(1)})`);
    for (const p of h.plumes) p.style.strokeDashoffset = anim.plume.toFixed(1);
    h.air.style.strokeDashoffset = v.airOn ? anim.air.toFixed(1) : '0';
    const fog = u.hu.on ? Math.max(0.4, u.hu.level) : 0;
    mist.forEach((m, i) => {
      if (move) { m.ph += dt * (0.3 + 0.3 * fog); if (m.ph > 1) { m.ph -= 1; m.dx = (Math.random() - 0.5) * 12; } }
      const e = h.mist[i];
      e.setAttribute('cx', (548 + m.dx + Math.sin(m.ph * 6 + m.dx) * 3).toFixed(1));
      e.setAttribute('cy', (264 - m.ph * 70).toFixed(1));
      e.setAttribute('r', (2.6 + m.ph * 2.6).toFixed(1));
      e.style.opacity = (fog * Math.min(1, m.ph * 6) * (1 - m.ph ** 4)).toFixed(2);
    });
    const dry = v.dh?.on ? Math.max(0.4, v.dh.level) : 0;
    drops.forEach((d, i) => {
      if (move) { d.ph += dt * (0.5 + 0.6 * dry); if (d.ph > 1) d.ph -= 1; }
      const e = h.drops[i];
      e.setAttribute('cx', d.x);
      e.setAttribute('cy', (278 + d.ph * 14).toFixed(1));
      e.style.opacity = (dry > 0 ? 0.9 * (1 - d.ph * 0.7) : 0).toFixed(2);
    });
  }

  function paint(next) {
    v = view(next);
    const u = v.units;
    svg.classList.toggle('night', v.night);
    h.sun.style.display = v.night ? 'none' : '';
    h.moon.style.display = v.night ? '' : 'none';
    put(h.outT, v.hasOut ? v.outT : 'No outdoor sensor');
    put(h.outRH, v.hasOut ? v.outRH : '');

    const show = (t, unit, sub = '') => {
      const state = stateOf(unit);
      const short = state.length <= 5; // "● On", "Off"
      put(t.state, state);
      put(t.sub, sub && short ? ` · ${sub}` : '');
      put(t.below, sub && !short ? sub : '');
      t.line.classList.toggle('on', unit.known && unit.on && !unit.warn);
      if (!t.max) return;
      t.line.removeAttribute('textLength');
      const width = t.line.getComputedTextLength?.() ?? 0; // 0 while not drawn (a hidden host)
      if (width > t.max) {
        t.line.setAttribute('textLength', t.max);
        t.line.setAttribute('lengthAdjust', 'spacingAndGlyphs');
      }
    };
    const cond = { known: u.ac.known, on: v.comp, warn: u.ac.warn, state: v.comp ? 'On' : 'Off' };
    show(h.tags.cond, { ...cond, warn: false });
    show(h.tags.intake, u.intake, v.filter);
    show(h.tags.exhaust, u.exhaust);
    show(h.tags.circ, u.circ);
    show(h.tags.hu, u.hu);
    h.dh.style.display = v.dh ? '' : 'none';
    if (v.dh) show(h.tags.dh, v.dh);
    h.lights.style.display = v.lights ? '' : 'none';
    if (v.lights) show(h.tags.lights, v.lights);

    const ac = u.ac;
    put(h.acText, v.acLabel);
    h.acLamp.classList.toggle('on', ac.on);
    const warm = ac.mode === 'heat';
    for (const p of h.plumes) {
      p.classList.toggle('warm', warm);
      p.style.opacity = v.comp ? (0.45 + 0.4 * ac.level).toFixed(2) : '0';
    }
    h.huDrop.classList.toggle('on', u.hu.on);
    h.dhTank.classList.toggle('on', Boolean(v.dh?.on));

    h.air.classList.toggle('on', v.airOn);
    if (v.airOn) h.air.setAttribute('marker-end', `url(#${arrow})`);
    else h.air.removeAttribute('marker-end');

    const mark = (key, unit, on) => {
      const g = h.units[key];
      g.classList.toggle('on', on);
      g.classList.toggle('nodata', !unit.known);
      g.classList.toggle('warn', unit.warn);
    };
    mark('ac', ac, ac.on);
    mark('cond', ac, ac.known && v.comp);
    mark('hu', u.hu, u.hu.on);
    mark('intake', u.intake, u.intake.on);
    mark('exhaust', u.exhaust, u.exhaust.on);
    mark('circ', u.circ, u.circ.on);
    if (v.dh) mark('dh', v.dh, v.dh.on);
    if (v.lights) mark('lights', v.lights, v.lights.on);
    for (const key of ['intake', 'exhaust', 'circ']) h.fans[key].g.classList.toggle('on', u[key].known && u[key].on);
    h.fans.cond.g.classList.toggle('on', ac.known && v.comp);

    put(h.blocks, v.blocks);
    svg.classList.toggle('no-blocks', !v.blocks); // no crop (or no blocks set): the shelves are drawn empty
    for (const [key, r] of Object.entries(h.readouts)) {
      const x = v.readouts[key];
      r.g.dataset.lvl = x.lvl;
      put(r.val, x.val);
      put(r.ico, x.ico ? `${x.ico} ` : '');
      put(r.zn, x.zn);
    }
    svg.setAttribute('aria-label', describe(v));
    frame(0);
  }

  // The small texts go below 640 px of host width; a hidden host (width 0) keeps its class.
  function fit() {
    if (!alive) return;
    const width = host.clientWidth;
    if (width) host.classList.toggle('mimic-narrow', width < NARROW_BELOW);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  observer?.observe(host);
  fit();
  paint(null);

  return {
    paint,
    tick(dt) {
      if ((reduced && reduced.matches) || !(dt > 0)) return;
      if (!alive || !host.isConnected || host.clientWidth === 0) return; // hidden (a missing room, a closed card): nothing to draw
      frame(Math.min(dt, 0.1));
    },
    destroy() { alive = false; observer?.disconnect(); svg.remove(); host.classList.remove('mimic-narrow'); },
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

// The Now tab's room cards (redesign 2026-10-28; spec 2026-10-26-room-picture-design.md section 3 for the words): three
// reading cards (the value, the status, the band and a trace of the recent readings with the band shaded), the room picture
// (mimic.js) with the fresh-air line and the outdoor and filter line, the machines in the order the air meets them, and the
// crop with the day of its stage. The words come from room-card-math.js (pure, tested); this file only builds and fills nodes.
//   createRoomCard({ readings, picture, machines, crop }, { idPrefix, cropHref, onSwitch })
//     → { mimic, paint(card, drawState, traces, switches), setFresh(text), destroy() }
//   traces: { T, RH, CO2 } → traceOf() of each reading (or null).
//   switches: { manual, state(key) → { on, busy, error, disabled } | null }: in Manual each relay machine's row has its switch
//   (onSwitch(key) sends the command), in Auto the pill shows its state.

import { createMimic } from './mimic.js';

const SVG = 'http://www.w3.org/2000/svg';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function svg(tag, attrs = {}, parent) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent?.append(node);
  return node;
}

const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };

// A card's head: its title at the left, a quiet note at the right.
function cardHead(title, note) {
  const head = el('div', 'card-head');
  head.append(el('h2', '', title), note);
  return head;
}

const SERIES = { T: 'var(--s-t)', RH: 'var(--s-rh)', CO2: 'var(--s-co2)' };

export function createRoomCard(hosts, { idPrefix = 'room-', cropHref = '', onSwitch = () => {} } = {}) {
  // ---- the three reading cards ----
  hosts.readings.classList.add('rd-row');
  const tiles = ['T', 'RH', 'CO2'].map((key) => {
    const t = { key, node: el('section', 'card rd'), name: el('h2', 'rd-name'), chip: el('span', 'rd-chip'), num: el('span', 'rd-num'),
      unit: el('span', 'rd-unit'), band: el('p', 'rd-band'), span: el('span', 'rd-span') };
    t.node.dataset.key = key;
    const head = el('div', 'rd-head');
    head.append(t.name, t.chip);
    const val = el('p', 'rd-val');
    val.append(t.num, t.unit);
    t.trace = el('div', 'rd-trace');
    t.trace.setAttribute('role', 'img');
    t.svg = svg('svg', { viewBox: '0 0 100 32', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
    t.zone = svg('rect', { class: 'rd-zone', x: 0, width: 100, fill: SERIES[key] }, t.svg);
    t.path = svg('path', { class: 'rd-line', fill: 'none', stroke: SERIES[key], 'vector-effect': 'non-scaling-stroke' }, t.svg);
    t.trace.append(t.svg, t.span);
    t.node.append(head, val, t.band, t.trace);
    hosts.readings.append(t.node);
    return t;
  });

  function paintTile(t, x, trace) {
    put(t.name, x.name);
    put(t.chip, x.chip.text);
    t.chip.dataset.lvl = x.chip.lvl;
    put(t.num, x.value);
    put(t.unit, x.unit);
    put(t.band, x.band);
    t.band.hidden = !x.band;
    t.node.dataset.edge = x.edge;
    t.trace.setAttribute('aria-label', x.label);
    t.trace.hidden = !trace;
    if (!trace) return;
    t.path.setAttribute('d', trace.line);
    t.zone.style.display = trace.band ? '' : 'none';
    if (trace.band) { t.zone.setAttribute('y', trace.band.y); t.zone.setAttribute('height', Math.max(0, trace.band.h)); }
    put(t.span, trace.span);
  }

  // ---- the room picture ----
  const note = el('span', 'card-note');
  hosts.picture.classList.add('card', 'pic-card');
  const pic = el('div', 'mimic-host rc-pic');
  pic.dataset.mimicHost = '';
  const fresh = el('p', 'rc-fresh');
  // The control line is the Control card's and the outdoor air and the filter are in the picture and the Machines rows: the
  // card says only when fresh air comes next.
  hosts.picture.replaceChildren(cardHead('Room', note), pic, fresh);
  hosts.picture.style.containerType = 'inline-size';
  const mimic = createMimic(pic, { idPrefix });

  // ---- the machines, in the order the air meets them ----
  hosts.machines.classList.add('card', 'mc-card');
  const list = el('ul', 'mc-list');
  hosts.machines.replaceChildren(cardHead('Machines', el('span', 'card-note', 'In the order the air meets them')), list);
  let shownKeys = '';
  let machineNodes = [];
  function paintMachines(rows, switches) {
    const keys = rows.map((m) => m.key).join();
    if (keys !== shownKeys) { // made again only when the machines change (a dehumidifier or lights fitted or taken out)
      shownKeys = keys;
      machineNodes = rows.map((m) => {
        const n = { node: el('li', 'mc-row'), pill: el('span', 'pill'), effect: el('span', 'mc-eff'), detail: el('span', 'mc-d'),
          sw: el('button', 'mc-switch'), err: el('p', 'mc-err') };
        n.node.dataset.key = m.key;
        const text = el('div', 'mc-text');
        const line = el('div', 'mc-sub');
        line.append(n.effect, n.detail);
        text.append(el('span', 'mc-name', m.name), line);
        n.sw.type = 'button';
        n.sw.hidden = true;
        n.sw.setAttribute('aria-label', m.name); // pressed: on
        n.sw.addEventListener('click', () => onSwitch(m.key));
        n.err.setAttribute('role', 'status');
        n.err.hidden = true;
        n.node.append(el('span', 'mc-step', String(m.step)), text, n.pill, n.sw, n.err);
        return n;
      });
      list.replaceChildren(...machineNodes.map((n) => n.node));
    }
    rows.forEach((m, i) => {
      const n = machineNodes[i];
      n.node.dataset.tone = m.pill.tone;
      put(n.pill, m.pill.text);
      n.pill.dataset.tone = m.pill.tone;
      put(n.effect, m.effect);
      put(n.detail, m.detail);
      n.detail.hidden = !m.detail;
      // Manual: the switch in place of the pill (a fault still shows its pill beside it)
      const sw = switches?.manual ? switches.state(m.key) : null;
      n.sw.hidden = !sw;
      n.pill.hidden = Boolean(sw) && m.pill.tone !== 'warn';
      n.node.dataset.manual = String(Boolean(sw));
      if (sw) {
        put(n.sw, sw.busy ? 'Sending…' : sw.on ? 'On' : 'Off');
        n.sw.setAttribute('aria-pressed', String(sw.on));
        n.sw.disabled = sw.disabled;
      }
      put(n.err, sw?.error ?? '');
      n.err.hidden = !sw?.error;
    });
  }

  // ---- the crop and its stage (a link to the Crop tab) ----
  const crop = { stage: el('span', 'pill'), name: el('p', 'cs-name'), sub: el('p', 'cs-sub'), bar: el('div', 'cs-bar'),
    fill: el('div', 'cs-fill'), day: el('span', 'cs-day'), next: el('span', 'cs-next'), empty: el('p', 'cs-empty', 'No crop set. Add one on the Crop tab.') };
  hosts.crop.classList.add('card', 'crop-sum');
  crop.bar.append(crop.fill);
  const foot = el('div', 'cs-foot');
  foot.append(crop.day, crop.next);
  const link = el('a', 'cs-link', 'Open the Crop tab');
  if (cropHref) link.href = cropHref;
  hosts.crop.replaceChildren(cardHead('Crop', crop.stage), crop.name, crop.sub, crop.bar, foot, crop.empty, link);

  function paintCrop(s) {
    for (const node of [crop.stage, crop.name, crop.sub, crop.bar, foot]) node.hidden = !s;
    crop.empty.hidden = Boolean(s);
    if (!s) return;
    put(crop.stage, s.stage);
    put(crop.name, s.name);
    put(crop.sub, s.sub);
    crop.bar.hidden = s.share === null;
    crop.fill.style.width = `${Math.round((s.share ?? 0) * 100)}%`;
    put(crop.day, s.day);
    put(crop.next, s.next);
  }

  return {
    mimic,
    // card: roomCard() of room-card-math.js; draw: the DrawState of the picture; traces: traceOf() per reading.
    paint(card, draw, traces = {}, switches = null) {
      mimic.paint(draw);
      put(note, 'Air path: in, treated, out');
      card.tiles.forEach((x, i) => paintTile(tiles[i], x, traces[x.key] ?? null));
      put(fresh, card.fresh);
      fresh.hidden = !card.fresh;
      paintMachines(card.machines, switches);
      paintCrop(card.summary);
    },
    // The fresh-air line between refreshes (its minutes count down).
    setFresh(text) {
      put(fresh, text);
      fresh.hidden = !text;
    },
    destroy() {
      mimic.destroy();
      for (const host of Object.values(hosts)) host.replaceChildren();
    },
  };
}

// The Room card of the room page (spec 2026-10-26-room-picture-design.md section 3): the room picture (mimic.js) beside three
// reading tiles with band bars and the fresh-air line, the machines as tiles in the order the air meets them, and a line with
// the outdoor air and the filter. The words come from room-card-math.js (pure, tested); this file only builds and fills nodes.
//   createRoomCard(host, { idPrefix }) → { mimic, paint(card, drawState), setFresh(text), destroy() }

import { createMimic } from './mimic.js';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

const put = (node, text) => { if (node.textContent !== text) node.textContent = text; };
const pct = (share) => `${(share * 100).toFixed(2)}%`;

// Parts of a line: the even ones plain, the odd ones bold.
function lineNode(parts) {
  const span = el('span');
  parts.forEach((p, i) => { if (p) span.append(i % 2 ? el('b', '', p) : document.createTextNode(p)); });
  return span;
}

export function createRoomCard(host, { idPrefix = 'room-', cropHref = '' } = {}) {
  host.classList.add('card', 'room-card');
  const note = el('small', 'rc-note');
  const head = el('h2', 'rc-head');
  head.append(el('span', '', 'Room'), note);
  // The crop stage, a link to the Crop tab: "Fruiting · since … · day 1 of 7 · flush 1 of 4 · Next: …".
  const stage = el('a', 'rc-stage');
  if (cropHref) stage.href = cropHref;
  stage.hidden = true;
  const pic = el('div', 'mimic-host rc-pic');
  pic.dataset.mimicHost = '';
  const tilesBox = el('div', 'rc-tiles');
  const fresh = el('p', 'rc-fresh');
  const side = el('div', 'rc-side');
  side.append(tilesBox, fresh);
  const top = el('div', 'rc-top');
  top.append(pic, side);
  const mhead = el('div', 'rc-mhead');
  mhead.append(el('b', '', 'Machines'), el('span', '', 'in the order the air meets them: in → treated → out'));
  const grid = el('div', 'rc-mgrid');
  const strip = el('p', 'rc-strip');
  host.replaceChildren(head, stage, top, mhead, grid, strip);
  const mimic = createMimic(pic, { idPrefix });

  // The three reading tiles, made once so the mark can slide to a new reading.
  const tiles = [0, 1, 2].map(() => {
    const t = { node: el('div', 'rt-tile'), name: el('span'), chip: el('span', 'rt-chip'), num: el('span'), unit: el('small') };
    const lab = el('div', 'rt-lab');
    lab.append(t.name, t.chip);
    const val = el('div', 'rt-val');
    val.append(t.num, t.unit);
    t.bar = el('div', 'rt-bar');
    t.bar.setAttribute('role', 'img');
    t.zone = el('div', 'rt-zone');
    t.mark = el('div', 'rt-mark');
    t.lims = [el('span', 'rt-lim'), el('span', 'rt-lim')];
    t.bar.append(el('div', 'rt-track'), t.zone, t.mark, ...t.lims);
    t.node.append(lab, val, t.bar);
    tilesBox.append(t.node);
    return t;
  });

  function paintTile(t, x) {
    put(t.name, x.name);
    put(t.chip, x.chip.text);
    t.chip.dataset.lvl = x.chip.lvl;
    put(t.num, x.value);
    put(t.unit, x.unit);
    t.node.dataset.edge = x.edge;
    t.bar.setAttribute('aria-label', x.label);
    const { zone, mark, limits } = x.bar;
    t.zone.hidden = !zone;
    if (zone) { t.zone.style.left = pct(zone.from); t.zone.style.width = pct(zone.to - zone.from); }
    t.mark.hidden = mark === null;
    if (mark !== null) t.mark.style.left = pct(mark);
    t.lims.forEach((node, i) => {
      node.hidden = !limits[i];
      if (limits[i]) { put(node, limits[i].text); node.style.left = pct(limits[i].at); }
    });
  }

  // The machine tiles, made again only when the machines change (a dehumidifier fitted or taken out).
  let shownKeys = '';
  let machineNodes = [];
  function paintMachines(list) {
    const keys = list.map((m) => m.key).join();
    if (keys !== shownKeys) {
      shownKeys = keys;
      machineNodes = list.map((m) => {
        const n = { node: el('div', 'mt-tile'), pill: el('span', 'mt-pill'), effect: el('div', 'mt-eff'), detail: el('div', 'mt-d') };
        const name = el('div', 'mt-n');
        name.append(el('span', '', m.name), n.pill);
        n.node.append(el('span', 'mt-step', String(m.step)), name, n.effect, n.detail);
        return n;
      });
      grid.replaceChildren(...machineNodes.map((n) => n.node));
      grid.style.setProperty('--mt-n', String(list.length)); // one row on a desktop: six, or five without a dehumidifier
    }
    list.forEach((m, i) => {
      const n = machineNodes[i];
      n.node.classList.toggle('on', m.on && m.pill.tone === 'on');
      put(n.pill, m.pill.text);
      n.pill.dataset.tone = m.pill.tone;
      put(n.effect, m.effect);
      put(n.detail, m.detail);
      n.detail.hidden = !m.detail;
    });
  }

  return {
    mimic,
    // card: roomCard() of room-card-math.js; draw: the DrawState of the picture.
    paint(card, draw) {
      mimic.paint(draw);
      put(note, card.note);
      stage.hidden = !card.stage;
      if (card.stage) {
        const words = [card.stage.detail, card.stage.next].filter(Boolean).join(' · ');
        stage.replaceChildren(el('b', '', card.stage.stage), document.createTextNode(words ? ` · ${words}` : ''));
      }
      card.tiles.forEach((x, i) => paintTile(tiles[i], x));
      put(fresh, card.fresh);
      fresh.hidden = !card.fresh;
      paintMachines(card.machines);
      strip.replaceChildren(...card.bottom.map(lineNode));
    },
    // The fresh-air line between refreshes (its minutes count down).
    setFresh(text) {
      put(fresh, text);
      fresh.hidden = !text;
    },
    destroy() { mimic.destroy(); host.replaceChildren(); },
  };
}

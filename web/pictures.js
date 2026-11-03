// The farm's pictures as page nodes (spec 2026-11-03-pictures-design.md): flat drawings that say what a thing is, never how it
// is (the Picture Rule in DESIGN.md), always beside the words that say the same, so they are hidden from screen readers.
//   picture(kind, key, { size, crop }) → <svg class="pic">
// kind: 'crop' (key: a crop of web/crops.js), 'bag' (key: a crop; stage: a stage or 'done'), 'machine', 'sensor' or 'task'
// (key: a rule key, 'own', 'longTerm' or 'generic'). crop: the room's main crop, which a harvest task holds and tints.
// The markup and the choice of picture are in pictures-data.js (pure, tested).

import { markup, hues } from './pictures-data.js';

const NS = 'http://www.w3.org/2000/svg';

export function picture(kind, key, { size = 32, crop = null, stage = null } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'pic');
  svg.dataset.pic = `${kind}:${key ?? ''}`;
  const [c, c2] = hues(kind === 'crop' || kind === 'bag' ? key : crop);
  svg.style.setProperty('--c', `var(${c})`);
  svg.style.setProperty('--c2', `var(${c2})`);
  svg.innerHTML = markup(kind, key, { crop, stage });
  return svg;
}

// An empty place for a picture (a room without crops): a dashed tile the picture's size.
export function emptyPicture(size = 40) {
  const tile = document.createElement('span');
  tile.className = 'pic pic-empty';
  tile.style.width = tile.style.height = `${size}px`;
  tile.setAttribute('aria-hidden', 'true');
  return tile;
}

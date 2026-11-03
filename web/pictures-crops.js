// The crop pictures and the grow bag by stage (spec 2026-11-03-pictures-design.md; drafted in .impeccable/mocks/pictures). 48 × 48 grid, flat fills; each crop takes its hue through --c (the
// cap) and --c2 (the gills, stems and pale parts), set from CROP_HUES on the <svg>. Tokens: the --p-* of web/styles.css.

export const CROP_HUES = {
  oyster: ['--p-grey', '--p-grey-2'],
  black: ['--p-black', '--p-black-2'],
  pink: ['--p-pink', '--p-pink-2'],
  abalone: ['--p-abalone', '--p-abalone-2'],
  golden: ['--p-golden', '--p-golden-2'],
  woodear: ['--p-woodear', '--p-woodear-2'],
  reishi: ['--p-reishi', '--p-reishi-2'],
  milky: ['--p-milky', '--p-milky-2'],
  lionsmane: ['--p-lion', '--p-lion-2'],
};

const r1 = (n) => Math.round(n * 10) / 10;
const pt = (cx, cy, r, k, deg) => [r1(cx + r * Math.cos(deg * Math.PI / 180)), r1(cy - r * k * Math.sin(deg * Math.PI / 180))];

// A fan-shaped oyster cap seen from below, its stem point at (ax, ay): the cap's rim (--c) from angle a0 to a1 (degrees,
// counter-clockwise, 0 = right), the gills (--c2) inside it and the gill lines. k flattens it; frills > 0 waves the rim.
function oysterCap({ ax, ay, r, a0, a1, k = 1, rim = 0.8, frills = 0, depth = 0.09, lines = 7, lineOpacity = 0.55 }) {
  const n = Math.max(frills, 6);
  const step = (a1 - a0) / n;
  let cap = `M${ax} ${ay} L${pt(ax, ay, r, k, a0).join(' ')}`;
  for (let i = 0; i < n; i++) {
    const m = a0 + step * (i + 0.5);
    const c = frills ? pt(ax, ay, r * (1 + depth * 2), k, m) : pt(ax, ay, r / Math.cos((step / 2) * Math.PI / 180), k, m);
    cap += ` Q${c.join(' ')} ${pt(ax, ay, r, k, a0 + step * (i + 1)).join(' ')}`;
  }
  cap += ' Z';
  const g = r * rim;
  let gill = `M${ax} ${ay} L${pt(ax, ay, g, k, a0 + 4).join(' ')}`;
  for (let i = 0; i < n; i++) {
    const m = a0 + 4 + ((a1 - a0 - 8) / n) * (i + 0.5);
    const c = pt(ax, ay, g / Math.cos(((a1 - a0 - 8) / n / 2) * Math.PI / 180), k, m);
    gill += ` Q${c.join(' ')} ${pt(ax, ay, g, k, a0 + 4 + ((a1 - a0 - 8) / n) * (i + 1)).join(' ')}`;
  }
  gill += ' Z';
  const ls = [];
  for (let i = 1; i < lines; i++) ls.push(`M${ax} ${ay} L${pt(ax, ay, g * 0.94, k, a0 + 4 + ((a1 - a0 - 8) / lines) * i).join(' ')}`);
  return `<path d="${cap}" fill="var(--c)"/><path d="${gill}" fill="var(--c2)"/>`
    + `<path d="${ls.join(' ')}" stroke="var(--c)" stroke-width="1.2" stroke-linecap="round" opacity="${lineOpacity}"/>`;
}

// A short stem from (x, y) down to the ground at 46.
const stem = (x, y, w = 4) => `<path d="M${x - w / 2} 46 C${x - w / 2} 42 ${x - w / 4} ${y + 3} ${x} ${y} L${x + w / 2} ${y + 1.5} C${x + w / 3} ${y + 5} ${x + w / 2} 42 ${x + w * 0.6} 46 Z" fill="var(--c2)"/>`;

// A small funnel cap (golden oyster) at (x, y), w across, on a thin stem from the bouquet's foot.
function funnel(x, y, w, foot) {
  return `<path d="M${foot[0]} ${foot[1]} Q${r1((foot[0] + x) / 2 + (x - foot[0]) * 0.15)} ${r1((foot[1] + y) / 2 + 4)} ${x} ${y + 2}" stroke="var(--c2)" stroke-width="2.6" stroke-linecap="round" fill="none"/>`
    + `<path d="M${r1(x - w * 0.5)} ${y} L${x} ${r1(y + w * 0.45)} L${r1(x + w * 0.5)} ${y} Z" fill="var(--c2)"/>`
    + `<ellipse cx="${x}" cy="${y}" rx="${r1(w * 0.55)}" ry="${r1(w * 0.24)}" fill="var(--c)"/>`
    + `<ellipse cx="${x}" cy="${r1(y + w * 0.02)}" rx="${r1(w * 0.22)}" ry="${r1(w * 0.09)}" fill="var(--p-golden-3)"/>`;
}

export const CROPS = {
  // Grey oyster: two fan-shaped caps on one short stem, seen from below: the pale gills run from the stem to the rim.
  oyster: `
    <path d="M16 38 C10 36 3.5 32 3 27 C2.6 22 7 20 11 22 C14 24 16 30 16 38 Z" fill="var(--c)"/>
    <path d="M16 38 C11 35.5 6 32 5.6 28 C5.4 25 8 24 10.6 25.4 C13 27 15 31 16 38 Z" fill="var(--c2)"/>
    <path d="M18 38 C10 32 6 26 8 20 C10 10 26 4 36 8 C44 11 47 18 44 22 C40 28 28 34 18 38 Z" fill="var(--c)"/>
    <path d="M18 38 C12 32 10 27 11 22 C13 14 26 10 35 12.5 C41 14.5 43 18 41 21 C37 26 27 33 18 38 Z" fill="var(--c2)"/>
    <path d="M18 38 L12 21 M18 38 L17 15 M18 38 L23 12 M18 38 L29 11 M18 38 L35 13 M18 38 L40 17 M18 38 L41 21" stroke="var(--c)" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>
    <path d="M13 46 C14 42 15.5 39 18 36.5 L21.5 38 C19.5 40.5 18.5 43 18.5 46 Z" fill="var(--c2)"/>
    <path d="M13 46 C14 42 15.5 39 18 36.5 L19 37 C17 39.5 16 42.5 15.6 46 Z" fill="var(--c)" opacity=".45"/>`,
  // Black oyster: heavier than the grey, one deep dark cap over a second low in front, both on a stout stem.
  black: `
    <path d="M17 38 C8 33 3 26 5 18 C8 7 24 2 35 6 C44 9.5 47 17 43 23 C38 30 27 35 17 38 Z" fill="var(--c)"/>
    <path d="M17 38 C11 33 8.5 27 10 21.5 C12.5 13.5 25 9 34 12 C40 14 42 18 39.6 22 C35 28 26 33.5 17 38 Z" fill="var(--c2)"/>
    <path d="M17 38 L11 23 M17 38 L14.6 16.4 M17 38 L20.6 12.6 M17 38 L27 11 M17 38 L33.4 12.2 M17 38 L38.6 16.4 M17 38 L39.6 21.4" stroke="var(--c)" stroke-width="1.3" stroke-linecap="round" opacity=".6"/>
    <path d="M12 46 C13.5 42 15 39.5 17.6 37 L23.4 39 C21.4 41.5 20.4 43.6 20.4 46 Z" fill="var(--c2)"/>
    <path d="M20 40.5 C26 35.6 34 34 40.4 35.6 C45.4 37 45.6 41.4 41 43 C34.4 45.2 26.4 44.4 20 40.5 Z" fill="var(--c)"/>
    <path d="M20 40.5 C26.4 43 33.4 44 40.6 43.2 C35.2 45.8 27 45.6 21.2 42.4 Z" fill="var(--c2)"/>`,
  // Pink oyster: a cluster of three frilly caps, their wavy rims opening every way.
  pink: `
    ${oysterCap({ ax: 22, ay: 38, r: 15, a0: 105, a1: 205, k: 0.95, rim: 0.74, frills: 6, depth: 0.1, lines: 5 })}
    ${oysterCap({ ax: 24, ay: 38, r: 16, a0: -20, a1: 78, k: 0.95, rim: 0.74, frills: 6, depth: 0.1, lines: 5 })}
    ${oysterCap({ ax: 23, ay: 37, r: 19, a0: 48, a1: 132, k: 1, rim: 0.74, frills: 7, depth: 0.1, lines: 6 })}
    ${stem(23, 36, 6)}`,
  // Golden oyster: a bouquet of small yellow funnel caps on thin stems from one foot.
  golden: `
    ${funnel(10, 22, 13, [23, 45])}
    ${funnel(37, 21, 13, [24, 45])}
    ${funnel(17, 12, 12, [23, 45])}
    ${funnel(31, 10, 12, [24, 45])}
    ${funnel(24, 27, 15, [24, 45])}`,
  // Abalone oyster: one thick, broad cap on a short stem set off its centre, black droplets on the stem.
  abalone: `
    <path d="M17 46 C17 40 18 33 20 28 L30 28 C30 34 30 40 32 46 Z" fill="var(--c2)"/>
    <path d="M30 28 C30 34 30 40 32 46 L29 46 C28 40 28 34 28 28 Z" fill="var(--c)" opacity=".35"/>
    <path d="M4 22 C4 13 15 7 26 7 C37 7 45 12 45 20 C45 23 43 25 40 25 L8 26 C5.5 26 4 24.5 4 22 Z" fill="var(--c)"/>
    <path d="M7 26 C12 30 18 31.5 25 31.5 C32 31.5 38 29.5 42 25 Z" fill="var(--c2)"/>
    <path d="M12 27.5 L25 31.4 M18 29.8 L25 31.4 M32 30.2 L25 31.4 M38 27.8 L25 31.4" stroke="var(--c)" stroke-width="1.1" stroke-linecap="round" opacity=".5"/>
    <path d="M13 12 C17 9.5 22 8.6 27 8.8" stroke="var(--p-shine)" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M22 37 c1.4 1.8 1.4 3.4 0 3.4 s-1.4 -1.6 0 -3.4 Z M27 33.5 c1.2 1.5 1.2 2.9 0 2.9 s-1.2 -1.4 0 -2.9 Z M26.5 41.5 c1 1.3 1 2.5 0 2.5 s-1 -1.2 0 -2.5 Z" fill="var(--p-drop)"/>`,
  // Wood ear (black jelly): rubbery ear-shaped lobes, a paler rim round a deep cup and its veins.
  woodear: `
    <path d="M23 44 C12 45 3 37 4 26 C5 16 13 11 19 15 C23 18 21 24 17 26 C14 28 15 33 19 35 C22 37 25 40 23 44 Z" fill="var(--c2)"/>
    <path d="M21 41 C13 41 7 35 7.5 27 C8 20 13 16.5 17 18.5 C19.5 20 18.5 23.5 15.5 25.5 C11.5 28.5 12.5 34 17 36.5 C19.5 38 21.5 39.5 21 41 Z" fill="var(--c)"/>
    <path d="M24 42 C30 46 43 42 44 30 C45 18 37 6 26 7 C19 7.6 16 13 20 17 C23 20 28 18 31 21 C35 25 33 31 28 33 C24 34.6 22 38.5 24 42 Z" fill="var(--c2)"/>
    <path d="M25.5 39.5 C31 42 40 38.5 41 29.5 C42 20 36 10.5 27 10.5 C22.5 10.6 20.5 13.6 22.5 15.6 C25 18 30 16.5 33.6 20 C38 24.5 36 32 30.5 34.6 C27 36.3 24.6 37.5 25.5 39.5 Z" fill="var(--c)"/>
    <path d="M33 14 C37 19 38.6 25 37.5 31 M28.6 12 C33 15 35.5 19.5 35.4 24 M11 24 C10 29 11.5 34 15.5 37.5" stroke="var(--c2)" stroke-width="1.2" stroke-linecap="round" fill="none" opacity=".7"/>`,
  // Reishi (lingzhi): a lacquered kidney-shaped shelf with its pale growing rim and growth bands, on a side stem.
  reishi: `
    <path d="M14 29 C16 34 17 40 15 46 L21 46 C22 40 21 33 19 28 Z" fill="var(--c)"/>
    <path d="M14 29 C16 34 17 40 15 46 L16.6 46 C18 40 17.4 34 16 29 Z" fill="var(--p-shine)"/>
    <path d="M4 21 C4 11 16 6 27 6.5 C38 7 45 12.5 44.5 20 C44 27 37 31.5 29.5 30.5 C25.5 30 23.5 27.5 19.5 29.5 C15 31.5 4 31 4 21 Z" fill="var(--c2)"/>
    <path d="M7.5 20.5 C7.5 12.6 17 9 27 9.5 C36 10 41 14 40.6 19.6 C40.2 25 35 27.6 29.6 27 C25.8 26.6 23.4 24.6 19.4 26.4 C14.6 28.6 7.5 27.4 7.5 20.5 Z" fill="var(--c)"/>
    <path d="M12 20 C12 15 19 12.6 26.5 13 C33 13.3 36.6 16 36.4 19.4 M16.5 20.5 C16.5 17.6 21 16.2 26 16.5 C30.4 16.7 32.6 18.2 32.4 20.2" stroke="var(--p-band)" stroke-width="1.2" stroke-linecap="round" fill="none"/>
    <path d="M13 13.5 C17 11.4 22 10.6 27 10.8" stroke="var(--p-shine)" stroke-width="2" stroke-linecap="round" fill="none"/>`,
  // Milky (Calocybe indica): white, a tall thick stem with a flat-topped cap; a younger one beside it.
  milky: `
    <path d="M14.5 46 C12.5 41 14 34 15.5 20 L25.5 20 C27 34 28.5 41 26.5 46 Z" fill="var(--c)"/>
    <path d="M21.5 20 L25.5 20 C27 34 28.5 41 26.5 46 L22.5 46 C24 41 23 34 21.5 20 Z" fill="var(--c2)"/>
    <path d="M6 13 C6 9.5 9 8 13 8 L28 8 C32 8 35 9.5 35 13 L35 16.5 C35 18.5 33.5 20 31.5 20 L9.5 20 C7.5 20 6 18.5 6 16.5 Z" fill="var(--c)"/>
    <path d="M28 8 C32 8 35 9.5 35 13 L35 16.5 C35 18.5 33.5 20 31.5 20 L27 20 C29 19 30.5 17.5 30.5 15 L30.5 12 C30.5 10 29.5 8.6 28 8 Z" fill="var(--c2)"/>
    <path d="M8 20 L33 20 L31 22.5 L10 22.5 Z" fill="var(--c2)"/>
    <path d="M33.5 46 C32.5 43 33 38 34 31 L40 31 C41 38 41.5 43 40.5 46 Z" fill="var(--c)"/>
    <path d="M38 31 L40 31 C41 38 41.5 43 40.5 46 L38.6 46 C39.2 43 39 38 38 31 Z" fill="var(--c2)"/>
    <path d="M30 28 C30 26 31.6 25 34 25 L40 25 C42.4 25 44 26 44 28 L44 29.6 C44 30.6 43.2 31.4 42.2 31.4 L31.8 31.4 C30.8 31.4 30 30.6 30 29.6 Z" fill="var(--c)"/>
    <path d="M40.5 25 C42.6 25.2 44 26.2 44 28 L44 29.6 C44 30.6 43.2 31.4 42.2 31.4 L40 31.4 C41.2 30.6 41.6 29.6 41.6 28.4 C41.6 26.8 41.2 25.6 40.5 25 Z" fill="var(--c2)"/>`,
  // Lion's mane: a white rounded clump with no cap, its long spines hanging down like a fringe.
  lionsmane: `
    <path d="M6 22 C6 12 14 6 24 6 C34 6 42 12 42 22 L42 26 L6 26 Z" fill="var(--c)"/>
    <path d="M33 7.6 C38.6 10 42 15.4 42 22 L42 26 L36 26 L36 21 C36 15.6 35 11 33 7.6 Z" fill="var(--c2)"/>
    <path d="M6 24 L6 31 L8 37 L10 31.5 L11.5 40 L13.8 32 L15.6 42 L18 32.5 L20 44 L22.6 33 L24.6 44.6 L27 33 L29.2 43.6 L31.4 32.5 L33.4 42 L35.6 32 L37.4 39.4 L39.2 31.5 L40.6 36.4 L42 30.5 L42 24 Z" fill="var(--c)"/>
    <path d="M10 25 L10 31 M13.8 25 L13.8 33 M17.8 25 L17.8 33.5 M22.4 25 L22.4 34 M27 25 L27 34 M31.4 25 L31.4 33.5 M35.6 25 L35.6 33 M39.2 25 L39.2 32" stroke="var(--c2)" stroke-width="1.2" stroke-linecap="round"/>
    <path d="M12 16 C13 13 15.6 11 19 10" stroke="var(--c2)" stroke-width="1.2" stroke-linecap="round" fill="none"/>`,
};

// The grow bag, shared by every stage: an upright bag 28 across (10–38) with its foot on the ground at 46, its neck gathered
// to the ring at the mouth (17.5–30.5, 10–14). Pins and caps sit on the ring; a fruiting crop stands in front of the bag's top.
const BAG = 'M10 26 C10 21 15 18.5 19 16.5 L19 14 L29 14 L29 16.5 C33 18.5 38 21 38 26 L38 42 C38 44.2 36.2 46 34 46 L14 46 C11.8 46 10 44.2 10 42 Z';
const BAG_SHADE = 'M31.5 18 C35 19.8 38 22 38 26 L38 42 C38 44.2 36.2 46 34 46 L30.5 46 C32.6 45.4 33.6 43.8 33.6 41.6 L33.6 26 C33.6 22.6 32.8 20 31.5 18 Z';
const SHEEN = '<path d="M14 26 L14 40" stroke="var(--p-plastic)" stroke-width="2.4" stroke-linecap="round"/>';
const COLLAR = '<rect x="17.5" y="10" width="13" height="4.6" rx="1.4" fill="var(--p-collar)"/><path d="M19 12.3 H29" stroke="var(--p-collar-2)" stroke-width="1" stroke-linecap="round" opacity=".7"/>';
const CAP = '<path d="M18.2 10.2 C18.2 6.8 20.8 5.4 24 5.4 C27.2 5.4 29.8 6.8 29.8 10.2 Z" fill="var(--p-collar-2)"/>';
const whiteBag = `<path d="${BAG}" fill="var(--p-bag-white)" stroke="var(--p-edge)" stroke-width=".8"/><path d="${BAG_SHADE}" fill="var(--p-myc-2)"/>${SHEEN}`;

// Pins: knobs in the crop's hue, crowding out of the open ring.
const PINS = `<g fill="var(--c)">
    <circle cx="19.6" cy="9" r="2.4"/><circle cx="24" cy="6.6" r="3"/><circle cx="28.6" cy="8.4" r="2.6"/><circle cx="21.8" cy="10.6" r="2"/><circle cx="26.4" cy="10.8" r="2.1"/><circle cx="16.8" cy="11.6" r="1.5"/><circle cx="31" cy="11.4" r="1.6"/>
  </g><path d="M24 9.6 V11.4 M19.6 11.4 V12.4 M28.6 10.9 V12.4" stroke="var(--c2)" stroke-width="1.4" stroke-linecap="round"/>`;

// The crop's own picture over the bag's top when it fruits: about 30 units across, its foot in front of the bag's shoulders.
const FRUIT_AT = {
  oyster: 'translate(7.4 -3.6) scale(.66)',
  black: 'translate(8 -3.6) scale(.66)',
  pink: 'translate(7.6 -8.2) scale(.68)',
  golden: 'translate(8 -3.8) scale(.66)',
  abalone: 'translate(8 -3.4) scale(.64)',
  woodear: 'translate(8 -3.6) scale(.66)',
  reishi: 'translate(8.4 -3.4) scale(.64)',
  milky: 'translate(8.6 -4) scale(.66)',
  lionsmane: 'translate(7.6 -3.2) scale(.66)',
};

export function bag(cropKey, stage) {
  if (stage === 'spawn') {
    return `<path d="${BAG}" fill="var(--p-bag)"/>`
      + '<path d="M10 26 C10 21 15 18.5 19 16.5 L19 14 L29 14 L29 16.5 C33 18.5 38 21 38 26 L38 30 C34.6 33 32 29 28.4 32 C25 35 22 30.6 18.6 33.6 C15.6 36 12.4 32.4 10 33.4 Z" fill="var(--p-myc)"/>'
      + '<path d="M13.4 38.6 c1.8 -1 2.8 .4 1.6 1.6 M29.4 37.8 c1.6 -1.2 3 0 1.8 1.4 M21.6 41.4 c1.4 -.8 2.4 .4 1.2 1.4" stroke="var(--p-myc)" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
      + `<path d="${BAG_SHADE}" fill="var(--p-bag-shade)" opacity=".8"/>${SHEEN}${COLLAR}${CAP}`;
  }
  if (stage === 'pinning') return `${whiteBag}${COLLAR}${PINS}`;
  if (stage === 'fruiting') return `${whiteBag}${COLLAR}<g transform="${FRUIT_AT[cropKey] ?? FRUIT_AT.oyster}">${CROPS[cropKey] ?? CROPS.oyster}</g>`;
  if (stage === 'rest') {
    return `${whiteBag}${COLLAR}${CAP}`
      + '<path d="M18 21 L30 21" stroke="var(--p-myc-2)" stroke-width="1.4" stroke-linecap="round"/>';
  }
  // done: the spent bag, slumped and grey-brown, its ring empty.
  return '<path d="M7.5 34 C7.5 27 13 23 18.6 20.6 L19.4 17 L28.6 17 L29.4 20.6 C35 23 40.5 27 40.5 34 L40.8 42 C40.8 44.2 39 46 36.8 46 L11.2 46 C9 46 7.2 44.2 7.2 42 Z" fill="var(--p-spent)"/>'
    + '<path d="M33 22.6 C37.4 24.8 40.5 28.4 40.5 34 L40.8 42 C40.8 44.2 39 46 36.8 46 L33.4 46 C35.2 45.4 36.4 44 36.4 41.8 L36.2 34 C36.2 29 35 25.6 33 22.6 Z" fill="var(--p-spent-2)"/>'
    + '<path d="M12.6 31 C16 33 19 29.4 22.6 32 M24.6 37 C27.6 39 31 35.6 34 37.6 M11.6 40.4 C14 41.4 16 39.6 18 40.8" stroke="var(--p-spent-2)" stroke-width="1.4" stroke-linecap="round" fill="none"/>'
    + '<rect x="17.5" y="13.2" width="13" height="4.4" rx="1.4" fill="var(--p-spent-2)"/>';
}

export const STAGE_KEYS = ['spawn', 'pinning', 'fruiting', 'rest', 'done'];

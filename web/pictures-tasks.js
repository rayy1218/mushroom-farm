// The task pictures (spec 2026-11-03-pictures-design.md): one per task rule (server/task-rules.js), 48 × 48 grid, flat fills from the --p-* tokens
// of web/styles.css. A picture shows the task's object. The harvest pictures hold the literal CROP: the room's crop picture
// goes there (its own 48 × 48 markup, drawn smaller), with --c and --c2 set to the crop's hues.

const AIR = 'fill="none" stroke="var(--p-air)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"';

// A grow bag, 20 × 34 at (x, y) scaled by s: the substrate in its plastic sleeve, the white neck and its collar.
// body: the substrate's fill; neck: false for a bag opened at the top (cut flat), 'cap' for the neck with its cap on.
function bag(x, y, s = 1, { body = 'var(--p-bag)', neck = true, extra = '' } = {}) {
  const top = neck
    ? `<rect x="6.5" y="0" width="7" height="7" rx="1.2" fill="var(--p-myc)" stroke="var(--p-edge)" stroke-width=".8"/>
       <rect x="5" y="6" width="10" height="3" rx="1.2" fill="var(--p-unit-2)"/>`
    : '';
  const shape = neck
    ? 'M3 9 Q10 6.6 17 9 L19 32 Q19 34 17 34 H3 Q1 34 1 32 Z'
    : 'M2.5 6 H17.5 L19 32 Q19 34 17 34 H3 Q1 34 1 32 Z';
  return `<g transform="translate(${x} ${y}) scale(${s})">
    ${top}
    <path d="${shape}" fill="${body}"${body === 'var(--p-myc)' ? ' stroke="var(--p-edge)"' : ''}/>
    <path d="M3.4 ${neck ? 10.4 : 7.4} L2.6 31.5" stroke="var(--p-plastic)" stroke-width="1.6" stroke-linecap="round"/>
    ${extra}
  </g>`;
}

// A humidifier, 20 × 28 at (x, y) scaled by s: a white body, its water-blue top and the window on its water.
function humidifier(x, y, s = 1, extra = '') {
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <rect x="0" y="4" width="20" height="24" rx="5" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <path d="M0 9 Q0 4 5 4 H15 Q20 4 20 9 V10 H0 Z" fill="var(--p-water-2)"/>
    <rect x="8" y="1" width="4" height="4" rx="1" fill="var(--p-unit-2)"/>
    <rect x="5" y="15" width="10" height="9" rx="2" fill="var(--p-unit-2)"/>
    <rect x="5" y="19" width="10" height="5" rx="2" fill="var(--p-water)"/>
    ${extra}
  </g>`;
}

// A split aircon's indoor unit, 40 × 16 at (x, y): a wide white body and its air slot.
function aircon(x, y) {
  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="40" height="16" rx="4" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <rect x="4" y="10.5" width="32" height="3" rx="1.5" fill="var(--p-unit-2)"/>
    <rect x="29" y="4" width="6" height="2" rx="1" fill="var(--p-unit-2)"/>
  </g>`;
}

// The basket of the harvest pictures, with the crop over its rim (examples.js harvest).
const BASKET = `
    <path d="M5 23 H43 L39 41 C38.6 43 37 44 35 44 H13 C11 44 9.4 43 9 41 Z" fill="var(--p-wood)"/>
    <path d="M7.5 29 H40.5 M8.8 35 H39.2 M10 40.5 H38" stroke="var(--p-wood-2)" stroke-width="1.6"/>
    <path d="M5 23 H43 V26 H5 Z" fill="var(--p-wood-2)"/>`;
const sunRays = (cx, cy, r) => [0, 45, 90, 135, 180, 225, 270, 315]
  .map((a) => { const t = (a * Math.PI) / 180; const c = Math.cos(t); const n = Math.sin(t);
    return `M${(cx + c * (r + 1.6)).toFixed(1)} ${(cy + n * (r + 1.6)).toFixed(1)} L${(cx + c * (r + 3.6)).toFixed(1)} ${(cy + n * (r + 3.6)).toFixed(1)}`; })
  .join(' ');

export const TASKS = {
  // Contamination walk: a bag with mould on it goes into a bin bag.
  contamWalk: `
    ${bag(3, 8, 1, { extra: `<circle cx="8" cy="18" r="4.2" fill="var(--p-mould)"/><circle cx="13.5" cy="26" r="3.2" fill="var(--p-mould-2)"/><circle cx="6.5" cy="28.5" r="2" fill="var(--p-mould)"/>` })}
    <path d="M30 20 C28 26 28 40 31 44 H43 C46 40 46 26 44 20 Z" fill="var(--p-binbag)"/>
    <path d="M32 20 L35 15 L37 18 L39 15 L42 20 Z" fill="var(--p-binbag)"/>
    <path d="M24 10 C29 6 34 8 36 13" ${AIR}/><path d="M33 12.5 L36 13.5 L37 10.5" ${AIR}/>`,
  // Colonisation check: a bag gone white all through, under a magnifying glass.
  colonisedCheck: `
    ${bag(5, 8, 1, { body: 'var(--p-myc)', extra: `<path d="M3 30 Q10 28 18.6 30.5 L18.8 32 Q19 34 17 34 H3 Q1 34 1 32 Z" fill="var(--p-bag)"/>` })}
    <circle cx="31" cy="25" r="8.5" fill="var(--p-plastic)" stroke="var(--p-metal-2)" stroke-width="3"/>
    <path d="M37 31 L44 38" stroke="var(--p-metal-2)" stroke-width="4.2" stroke-linecap="round"/>`,
  // Open the bags: scissors at the bag's neck.
  openBags: `
    ${bag(4, 10, 1)}
    <path d="M17 12 L44 4 M17 6 L44 14" stroke="var(--p-metal)" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="40" cy="22" r="4" fill="none" stroke="var(--p-metal-2)" stroke-width="2.6"/>
    <circle cx="33" cy="24.5" r="4" fill="none" stroke="var(--p-metal-2)" stroke-width="2.6"/>
    <path d="M36.5 10 L39 19 M32 11.4 L33.5 21" stroke="var(--p-metal-2)" stroke-width="2.6" stroke-linecap="round"/>`,
  // Casing: an opened bag topped with a layer of soil, a light spray over it.
  casingApply: `
    ${bag(12, 12, 1, { neck: false, extra: `<path d="M2.5 6 H17.5 L17.9 12 H2.1 Z" fill="var(--p-soil)"/>` })}
    <circle cx="16" cy="6" r="1.6" fill="var(--p-water)"/><circle cx="22" cy="3.5" r="1.6" fill="var(--p-water)"/>
    <circle cx="28" cy="6" r="1.6" fill="var(--p-water)"/><circle cx="34" cy="3.5" r="1.6" fill="var(--p-water)"/>
    <circle cx="19" cy="9.5" r="1.3" fill="var(--p-water)"/><circle cx="25" cy="8.6" r="1.3" fill="var(--p-water)"/><circle cx="31" cy="9.5" r="1.3" fill="var(--p-water)"/>`,
  // Reishi's form: a closed bag growing antlers, or an open bag growing a cap.
  reishiForm: `
    ${bag(1, 12, 0.92, { extra: `<path d="M10 9 V3 M10 6 L6 1.5 M10 5 L14 0.5" stroke="var(--p-reishi)" stroke-width="2.6" stroke-linecap="round" transform="translate(0 -9)"/>` })}
    ${bag(26, 12, 0.92, { neck: false, extra: `<path d="M10 6 V1 M2 1 C2 -6 18 -6 20 0 C16 2 6 2 2 1 Z" fill="var(--p-reishi)"/><path d="M2 1 C6 2 16 2 20 0 L19.4 1.6 C15 3.4 6 3.4 2.4 2.4 Z" fill="var(--p-reishi-2)"/>` })}`,
  // Humidifier: water in, mist coming out.
  humidifierCheck: `
    ${humidifier(14, 16, 1.1)}
    <circle cx="20" cy="10" r="3.4" fill="var(--p-water)"/><circle cx="25" cy="7" r="4.2" fill="var(--p-water)"/><circle cx="30.5" cy="10" r="3.2" fill="var(--p-water)"/>
    <circle cx="25" cy="2.8" r="2.2" fill="var(--p-water)" opacity=".7"/>`,
  // Morning harvest: the basket with the crop, the morning sun up at its left.
  harvestAm: `
    <circle cx="7" cy="8" r="3.6" fill="var(--p-sun)"/>
    <path d="${sunRays(7, 8, 3.6)}" stroke="var(--p-sun)" stroke-width="1.6" stroke-linecap="round"/>
    <g transform="translate(13 -2) scale(.66)">CROP</g>${BASKET}`,
  // Afternoon harvest: the same basket, the sun going down at its right.
  harvestPm: `
    <path d="M36 14 A6 6 0 0 1 48 14 Z" fill="var(--p-sun)"/>
    <path d="M34 16 H48" stroke="var(--p-sun)" stroke-width="1.6" stroke-linecap="round"/>
    <g transform="translate(3 -2) scale(.66)">CROP</g>${BASKET}`,
  // Harvest check: the basket with the crop.
  harvestDaily: `<g transform="translate(8 -2) scale(.66)">CROP</g>${BASKET}`,
  // Reishi's rim: the crop and a knife at its stem, no basket.
  reishiRim: `
    <g transform="translate(0 0) scale(.86)">CROP</g>
    <path d="M22 42 L44 30 L44.6 33 C38 38 30 41 23.5 43 Z" fill="var(--p-metal)"/>
    <path d="M44 30 L47 28.4" stroke="var(--p-wood-2)" stroke-width="3.6" stroke-linecap="round"/>`,
  // Scrape and recap: a scraper at the bag's open mouth, its cap waiting beside.
  scrapeRecap: `
    ${bag(6, 12, 1, { neck: false, extra: `<path d="M2.5 6 H17.5 L17.7 8.6 H2.3 Z" fill="var(--p-myc)"/>` })}
    <path d="M17 17 L33 5" stroke="var(--p-metal)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M33 5 L39 0.6" stroke="var(--p-wood-2)" stroke-width="3.6" stroke-linecap="round"/>
    <circle cx="32" cy="25" r="1.8" fill="var(--p-bag-2)"/><circle cx="37" cy="31" r="1.5" fill="var(--p-bag-2)"/><circle cx="33" cy="37" r="1.7" fill="var(--p-bag-2)"/>
    <circle cx="39" cy="42" r="1.4" fill="var(--p-bag-2)"/><circle cx="31" cy="43.5" r="1.3" fill="var(--p-bag-2)"/>`,
  // Reopen for the next flush: the cap lifted off the bag again, the arrow going round.
  reopen: `
    ${bag(5, 13, 1, { neck: false, extra: `<rect x="6.5" y="0" width="7" height="6.5" rx="1.2" fill="var(--p-myc)"/>` })}
    <rect x="9" y="1" width="10" height="7" rx="2" fill="var(--p-unit)" stroke="var(--p-edge)" transform="rotate(-24 14 4.5)"/>
    <path d="M33 34 A8.5 8.5 0 1 0 31 20" ${AIR}/><path d="M30.5 15.5 L31 20 L35.5 20.6" ${AIR}/>`,
  // Footbath: a shallow tray of water at the door, a boot stepping in.
  footbath: `
    <path d="M3 34 H45 L42 43 H6 Z" fill="var(--p-metal)"/>
    <path d="M5.5 36 H42.5 L41.6 39 H6.4 Z" fill="var(--p-water)"/>
    <path d="M17 6 H29 V27 C33 27 38 28.5 38 33 V36 H17 Z" fill="var(--p-boot)"/>
    <path d="M17 31 H38 V36 H17 Z" fill="var(--p-unit-ink)" opacity=".6"/>`,
  // Floor clean: a broom sweeping.
  floorClean: `
    <path d="M38 3 L22 30" stroke="var(--p-wood)" stroke-width="3.2" stroke-linecap="round"/>
    <path d="M16 26 L28 33 L23 44 C17 44 10 41 6 37 Z" fill="var(--p-straw)"/>
    <path d="M16 26 L28 33 L26.4 36 L14.4 29 Z" fill="var(--p-wood-2)"/>
    <path d="M12 38 L18 35 M17 41.5 L21.5 37.5" stroke="var(--p-wood-2)" stroke-width="1.3" stroke-linecap="round" opacity=".7"/>
    <path d="M34 42 H44 M37 36.5 H45" ${AIR}/>`,
  // Clear out: the spent bags out of the room on a trolley.
  clearOut: `
    ${bag(4, 14, 0.62, { body: 'var(--p-bag-2)' })}${bag(16.5, 14, 0.62, { body: 'var(--p-bag-2)' })}${bag(29, 14, 0.62, { body: 'var(--p-bag-2)' })}
    <rect x="2" y="35" width="40" height="3.2" rx="1.6" fill="var(--p-metal)"/>
    <path d="M40 36.6 L44 27" stroke="var(--p-metal)" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="9" cy="42" r="3.2" fill="var(--p-metal-2)"/><circle cx="35" cy="42" r="3.2" fill="var(--p-metal-2)"/>
    <path d="M2 8 H14 M10 4 L14 8 L10 12" ${AIR}/>`,

  // Aircon filter: its mesh, rinsed under the tap.
  acFilter: `
    <path d="M2 7 H17 Q20 7 20 10 V12.5" fill="none" stroke="var(--p-metal)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M8 2.5 H14 M11 2.5 V6" stroke="var(--p-metal-2)" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M20 15 V21" stroke="var(--p-water)" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="2.6 2.6"/>
    <g transform="rotate(-8 26 33)">
      <rect x="6" y="22" width="36" height="20" rx="3" fill="var(--p-unit)" stroke="var(--p-edge)"/>
      <rect x="9.5" y="25.5" width="29" height="13" rx="1" fill="var(--p-unit-2)"/>
      <path d="M13.5 25.5 V38.5 M17.5 25.5 V38.5 M21.5 25.5 V38.5 M25.5 25.5 V38.5 M29.5 25.5 V38.5 M33.5 25.5 V38.5 M9.5 29.8 H38.5 M9.5 34.2 H38.5" stroke="var(--p-unit)" stroke-width="1"/>
    </g>
    <circle cx="11" cy="45.5" r="1.5" fill="var(--p-water)"/><circle cx="38" cy="46" r="1.5" fill="var(--p-water)"/>`,
  // Descale the humidifier: a sponge against it, bubbles.
  humidifierDescale: `
    ${humidifier(6, 14, 1.1)}
    <rect x="26" y="20" width="18" height="11" rx="3" fill="var(--p-sponge)" transform="rotate(-18 35 25.5)"/>
    <rect x="26" y="28" width="18" height="4" rx="1.6" fill="var(--p-sponge-2)" transform="rotate(-18 35 25.5)"/>
    <circle cx="32" cy="10" r="2.6" fill="none" stroke="var(--p-water)" stroke-width="1.5"/>
    <circle cx="39" cy="12" r="1.8" fill="none" stroke="var(--p-water)" stroke-width="1.4"/>
    <circle cx="37" cy="5" r="1.6" fill="none" stroke="var(--p-water)" stroke-width="1.3"/>`,
  // Fly traps: a yellow sticky card on its hook, flies caught on it.
  flyTraps: `
    <path d="M24 2 V9" stroke="var(--p-metal)" stroke-width="1.6"/>
    <circle cx="24" cy="11" r="2" fill="none" stroke="var(--p-metal)" stroke-width="1.6"/>
    <rect x="10" y="13" width="28" height="32" rx="2.5" fill="var(--p-trap)"/>
    <g fill="var(--p-unit-ink)">
      <circle cx="16" cy="20" r="1.4"/><circle cx="27" cy="18.5" r="1.2"/><circle cx="32" cy="25" r="1.4"/><circle cx="19" cy="28" r="1.2"/>
      <circle cx="25" cy="33" r="1.4"/><circle cx="15" cy="38" r="1.2"/><circle cx="31" cy="38" r="1.3"/><circle cx="22" cy="41" r="1"/>
    </g>
    <path d="M14.4 19.4 L13.2 18.2 M17.6 19.4 L18.8 18.2 M30.4 24.4 L29.2 23.2 M33.6 24.4 L34.8 23.2 M23.4 32.4 L22.2 31.2 M26.6 32.4 L27.8 31.2" stroke="var(--p-unit-ink)" stroke-width=".9" stroke-linecap="round"/>`,
  // Dehumidifier filter: the tall unit with its filter slid out, a drop at its drain.
  dehumidifierFilter: `
    <rect x="6" y="5" width="22" height="38" rx="5" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <path d="M6 10 Q6 5 11 5 H23 Q28 5 28 10 V12 H6 Z" fill="var(--p-dh)"/>
    <rect x="10" y="16" width="14" height="3" rx="1.5" fill="var(--p-unit-2)"/>
    <g transform="translate(22 20)">
      <rect x="0" y="0" width="22" height="16" rx="2" fill="var(--p-unit-2)"/>
      <path d="M4 0 V16 M8 0 V16 M12 0 V16 M16 0 V16 M0 5.3 H22 M0 10.7 H22" stroke="var(--p-unit)" stroke-width="1"/>
    </g>
    <path d="M17 44 C17 44 14 47.2 14 48 A3 3 0 0 0 20 48 C20 47.2 17 44 17 44 Z" fill="var(--p-water-2)" transform="translate(0 -3)"/>`,
  // CO₂ sensor check: the sensor out in the open air, under the sun (outdoor air is about 420 ppm).
  co2Check: `
    <circle cx="36" cy="11" r="5.4" fill="var(--p-sun)"/>
    <path d="${sunRays(36, 11, 5.4)}" stroke="var(--p-sun)" stroke-width="1.8" stroke-linecap="round"/>
    <rect x="5" y="16" width="22" height="28" rx="4" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <rect x="9" y="20" width="14" height="9" rx="1.5" fill="var(--p-unit-ink)"/>
    <path d="M11.5 26.5 V24.5 M14.5 26.5 V22.5 M17.5 26.5 V23.5 M20.5 26.5 V25" stroke="var(--p-unit-2)" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M9 34 H23 M9 37.5 H23 M9 41 H23" stroke="var(--p-unit-2)" stroke-width="1.4"/>
    <path d="M31 30 C34 28 37 32 40 30 C42.5 28.5 44 29.5 45 30 M31 37 C34 35 37 39 40 37 C42.5 35.5 44 36.5 45 37" ${AIR}/>`,
  // Humidity sensor check: the slim probe with its vents beside a drop of water.
  rhCheck: `
    <rect x="9" y="4" width="13" height="40" rx="6.5" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <path d="M12.5 24 H18.5 M12.5 28 H18.5 M12.5 32 H18.5 M12.5 36 H18.5 M12.5 40 H18.5" stroke="var(--p-unit-2)" stroke-width="1.8" stroke-linecap="round"/>
    <rect x="12" y="9" width="7" height="9" rx="1.5" fill="var(--p-unit-ink)"/>
    <path d="M35 13 C35 13 26 24 26 30 A9 9 0 0 0 44 30 C44 24 35 13 35 13 Z" fill="var(--p-water)"/>
    <path d="M30.5 29 A5 5 0 0 0 33 34" fill="none" stroke="var(--p-unit)" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>`,
  // Aircon service: the indoor unit and a spanner.
  acService: `
    ${aircon(4, 6)}
    <g transform="rotate(-38 26 34)">
      <rect x="12" y="31.6" width="26" height="4.8" rx="2.4" fill="var(--p-metal)"/>
      <path d="M38 27 A7 7 0 1 1 38 41 L38 37 L42 36.6 L42 31.4 L38 31 Z" fill="var(--p-metal)"/>
    </g>`,
  // Aircon chemical wash: the indoor unit and a spray bottle aimed at it.
  acChemWash: `
    ${aircon(4, 6)}
    <path d="M30 26 H38 V30 H42 V34 H36 L38 46 H24 L26 34 Z" fill="var(--p-unit-2)"/>
    <rect x="26" y="36" width="12" height="10" rx="1.6" fill="var(--p-water-2)"/>
    <rect x="30" y="23" width="9" height="4" rx="1" fill="var(--p-metal-2)"/>
    <circle cx="27" cy="25.5" r="1.4" fill="var(--p-water)"/><circle cx="23" cy="24.5" r="1.4" fill="var(--p-water)"/><circle cx="24.5" cy="28.5" r="1.4" fill="var(--p-water)"/><circle cx="20" cy="27" r="1.3" fill="var(--p-water)"/>`,

  // A worker's own rule: a clipboard with a ticked list.
  own: `
    <rect x="8" y="5" width="32" height="40" rx="3.5" fill="var(--p-wood)"/>
    <rect x="11.5" y="10" width="25" height="32" rx="1.5" fill="var(--p-paper)"/>
    <rect x="17" y="2.5" width="14" height="6" rx="2" fill="var(--p-metal)"/>
    <path d="M15 18 L16.8 19.8 L19.6 16.2 M15 26 L16.8 27.8 L19.6 24.2 M15 34 L16.8 35.8 L19.6 32.2" fill="none" stroke="var(--p-unit-ink)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M23 18 H33 M23 26 H33 M23 34 H30" stroke="var(--p-unit-2)" stroke-width="2" stroke-linecap="round"/>`,
  // A long-term task: a calendar page with one day marked.
  longTerm: `
    <rect x="5" y="8" width="38" height="36" rx="4" fill="var(--p-paper)" stroke="var(--p-edge)"/>
    <path d="M5 12 Q5 8 9 8 H39 Q43 8 43 12 V16 H5 Z" fill="var(--p-metal-2)"/>
    <rect x="13" y="4" width="3.4" height="8" rx="1.7" fill="var(--p-metal)"/><rect x="31.6" y="4" width="3.4" height="8" rx="1.7" fill="var(--p-metal)"/>
    <g fill="var(--p-unit-2)">
      <rect x="9" y="20" width="5" height="4.4" rx="1"/><rect x="16.5" y="20" width="5" height="4.4" rx="1"/><rect x="24" y="20" width="5" height="4.4" rx="1"/><rect x="31.5" y="20" width="5" height="4.4" rx="1"/>
      <rect x="9" y="27" width="5" height="4.4" rx="1"/><rect x="16.5" y="27" width="5" height="4.4" rx="1"/><rect x="31.5" y="27" width="5" height="4.4" rx="1"/>
      <rect x="9" y="34" width="5" height="4.4" rx="1"/><rect x="16.5" y="34" width="5" height="4.4" rx="1"/><rect x="24" y="34" width="5" height="4.4" rx="1"/>
    </g>
    <circle cx="26.5" cy="29.2" r="4.4" fill="var(--p-wood)"/>`,
  // Any other task: a note and its pencil.
  generic: `
    <path d="M8 6 H32 L40 14 V42 Q40 44 38 44 H10 Q8 44 8 42 Z" fill="var(--p-paper)" stroke="var(--p-edge)"/>
    <path d="M32 6 V14 H40 Z" fill="var(--p-unit-2)"/>
    <path d="M13 20 H31 M13 26 H33 M13 32 H24" stroke="var(--p-unit-2)" stroke-width="2" stroke-linecap="round"/>
    <g transform="rotate(40 34 33)">
      <rect x="31" y="20" width="6" height="22" fill="var(--p-trap)"/>
      <path d="M31 42 H37 L34 47.5 Z" fill="var(--p-wood)"/>
      <rect x="31" y="17" width="6" height="3.4" rx="1" fill="var(--p-metal)"/>
    </g>`,
};

// The machines' and sensors' pictures (spec 2026-11-03-pictures-design.md). 48 × 48 grid, flat fills from the --p-* tokens of web/styles.css: white
// units as in the room drawing (web/mimic.js), the fan blade of its fans, one identifying colour per machine, never the
// accent blue (blue means "running").
const BLADE = 'M0 0 C-2.5 -3 -2.4 -7.8 0.6 -8.6 C3.6 -8.7 3.4 -3.6 0 0 Z';

const fan = (cx, cy, s, fill = 'var(--p-unit-ink)') => [0, 120, 240]
  .map((a) => `<path d="${BLADE}" fill="${fill}" transform="translate(${cx} ${cy}) rotate(${a}) scale(${s})"/>`).join('')
  + `<circle cx="${cx}" cy="${cy}" r="${1.6 * s}" fill="${fill}"/>`;
const unit = (x, y, w, h, r = 4) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="var(--p-unit)" stroke="var(--p-edge)"/>`;
const arrow = (x1, y, x2) => `<path d="M${x1} ${y} H${x2} m-3.5 -3.8 l3.8 3.8 -3.8 3.8" fill="none" stroke="var(--p-air)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`;
const drop = (cx, cy, s, fill) => `<path d="M0 -6 C-1.5 -3.5 -4 -1 -4 1.6 A4 4 0 0 0 4 1.6 C4 -1 1.5 -3.5 0 -6 Z" fill="${fill}" transform="translate(${cx} ${cy}) scale(${s})"/>`;
const screws = (xs, y) => xs.map((x) => `<circle cx="${x}" cy="${y}" r="1.6" fill="var(--p-port)"/>`).join('');

export const MACHINES = {
  // Intake fan: the unit with its fan, the filter's pleats at its face, the air going in.
  intake: `
    ${unit(13, 8, 30, 32)}
    <path d="M13 12 h5 M13 16 h5 M13 20 h5 M13 24 h5 M13 28 h5 M13 32 h5 M13 36 h5" stroke="var(--p-unit-2)" stroke-width="2.2"/>
    <circle cx="29" cy="24" r="10.5" fill="var(--p-unit-2)"/>
    ${fan(29, 24, 1.05)}
    ${arrow(2, 24, 10)}`,
  // Exhaust fan: the unit with its fan and the louvres it blows through, the air leaving.
  exhaust: `
    ${unit(5, 8, 30, 32)}
    <circle cx="18" cy="24" r="10.5" fill="var(--p-unit-2)"/>
    ${fan(18, 24, 1.05)}
    <path d="M31 11 l4 4 M31 17 l4 4 M31 23 l4 4 M31 29 l4 4" stroke="var(--p-unit-2)" stroke-width="2.4" stroke-linecap="round"/>
    ${arrow(38, 24, 46)}
    <path d="M38.5 15 H43 M38.5 33 H43" stroke="var(--p-air)" stroke-width="2" stroke-linecap="round" opacity=".7"/>`,
  // Circulation fan: a round fan on its stand, no box: it only stirs the room's air.
  circulation: `
    <path d="M22.5 34 h3 v8 h-3 Z" fill="var(--p-unit-2)"/>
    <rect x="13" y="41" width="22" height="4" rx="2" fill="var(--p-unit-2)"/>
    <circle cx="24" cy="20" r="17" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <circle cx="24" cy="20" r="13.5" fill="var(--p-unit-2)"/>
    ${fan(24, 20, 1.45)}
    <path d="M10.5 20 H37.5 M24 6.5 V33.5" stroke="var(--p-unit)" stroke-width="1" opacity=".5"/>`,
  // Humidifier: a tub on the floor, its mist rising.
  humidifier: `
    <circle cx="20" cy="12" r="5" fill="var(--p-water)" opacity=".75"/>
    <circle cx="27" cy="8.5" r="5.5" fill="var(--p-water)" opacity=".75"/>
    <circle cx="31" cy="14" r="4.2" fill="var(--p-water)" opacity=".75"/>
    <rect x="21.5" y="16" width="5" height="6" rx="1.2" fill="var(--p-unit-2)"/>
    <path d="M11 24 C11 22 12.5 21 14.5 21 H33.5 C35.5 21 37 22 37 24 V41 C37 43.5 35 45 32.5 45 H15.5 C13 45 11 43.5 11 41 Z" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <rect x="11" y="24" width="26" height="4" fill="var(--p-hu)"/>
    ${drop(24, 36.5, 1.05, 'var(--p-hu)')}`,
  // Dehumidifier: a tall unit with its grille on top and the water it takes out in its tank.
  dehumidifier: `
    ${unit(11, 4, 26, 41)}
    <rect x="11" y="4" width="26" height="4" rx="2" fill="var(--p-dh)"/>
    <path d="M15.5 12.5 H32.5 M15.5 16.5 H32.5 M15.5 20.5 H32.5" stroke="var(--p-unit-2)" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="15" y="27" width="18" height="14" rx="2.5" fill="var(--p-unit-2)"/>
    <rect x="15" y="34" width="18" height="7" rx="2.5" fill="var(--p-water)"/>
    ${drop(24, 30.5, .62, 'var(--p-dh)')}`,
  // Aircon: the indoor split unit on the wall, its vent open and cool air falling.
  aircon: `
    <path d="M3 13 C3 10.8 4.8 9 7 9 H41 C43.2 9 45 10.8 45 13 V24 C45 26 43.5 27 41.5 27 H6.5 C4.5 27 3 26 3 24 Z" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <rect x="3" y="9" width="42" height="3.5" rx="1.75" fill="var(--p-cool)"/>
    <path d="M8 23.5 H40" stroke="var(--p-unit-2)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="39" cy="17" r="1.6" fill="var(--p-unit-2)"/>
    <path d="M14 31 c-2 3 2 5 0 8 M24 31 c-2 3 2 5 0 8 M34 31 c-2 3 2 5 0 8" fill="none" stroke="var(--p-cool)" stroke-width="2.4" stroke-linecap="round"/>`,
  // Lights: a lamp on its cord, the light falling from it.
  lights: `
    <path d="M24 2 V11" stroke="var(--p-metal)" stroke-width="2"/>
    <path d="M10 25 C10 16 16 10.5 24 10.5 C32 10.5 38 16 38 25 Z" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <path d="M17.5 25 A6.5 6.5 0 0 0 30.5 25 Z" fill="var(--p-light)"/>
    <rect x="21" y="9" width="6" height="3" rx="1" fill="var(--p-unit-2)"/>
    <path d="M24 36 V45 M15 34 L11 41.5 M33 34 L37 41.5 M9 29 L3.5 32 M39 29 L44.5 32" stroke="var(--p-light)" stroke-width="2.6" stroke-linecap="round"/>`,
};

export const SENSORS = {
  // Temperature and humidity probe: a white wall box with its vents, a thermometer and a drop on its face.
  trh: `
    ${unit(12, 5, 24, 38, 5)}
    <path d="M16 35 H32 M16 38.5 H32" stroke="var(--p-unit-2)" stroke-width="2" stroke-linecap="round"/>
    <path d="M19 10 a2.4 2.4 0 0 1 4.8 0 V21.5 a4.4 4.4 0 1 1 -4.8 0 Z" fill="var(--p-unit-2)"/>
    <circle cx="21.4" cy="25" r="2.6" fill="var(--p-unit-ink)"/>
    <rect x="20.4" y="13" width="2" height="11" rx="1" fill="var(--p-unit-ink)"/>
    ${drop(30, 21, .85, 'var(--p-unit-ink)')}`,
  // CO₂ sensor: a white box with its display reading CO₂.
  co2: `
    ${unit(6, 8, 36, 32, 5)}
    <rect x="10" y="12" width="28" height="16" rx="2.5" fill="var(--p-lcd)"/>
    <text x="24" y="24.5" text-anchor="middle" font-size="11" font-weight="700" font-family="Inter, system-ui, sans-serif" fill="var(--p-lcd-ink)" letter-spacing="-.3">CO<tspan font-size="7" dy="2">2</tspan></text>
    <path d="M12 33.5 H36" stroke="var(--p-unit-2)" stroke-width="2" stroke-linecap="round" stroke-dasharray="2 2.5"/>`,
  // Energy meter: a DIN-rail meter on its rail, its display and screw terminals.
  meter: `
    <rect x="3" y="21" width="42" height="6" rx="1" fill="var(--p-rail)"/>
    ${unit(14, 4, 20, 40, 2.5)}
    ${screws([19, 24, 29], 8)}
    ${screws([19, 24, 29], 40)}
    <rect x="17" y="13" width="14" height="9" rx="1.5" fill="var(--p-lcd)"/>
    <path d="M19.5 17.5 H28.5" stroke="var(--p-lcd-ink)" stroke-width="2" stroke-dasharray="2 1"/>
    <path d="M24 26 L21 31.5 H25 L22.5 36" fill="none" stroke="var(--p-unit-ink)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Filter pressure sensor: a gauge in a box, its two tubes to either side of the filter.
dp: `
    ${unit(11, 6, 26, 30, 5)}
    <circle cx="24" cy="19" r="9.5" fill="var(--p-lcd)"/>
    <path d="M17.5 19 A6.5 6.5 0 0 1 30.5 19" fill="none" stroke="var(--p-unit-2)" stroke-width="1.6"/>
    <path d="M24 19 L28.6 14.4" stroke="var(--p-unit-ink)" stroke-width="2" stroke-linecap="round"/>
    <circle cx="24" cy="19" r="1.8" fill="var(--p-unit-ink)"/>
    <rect x="8" y="29" width="3" height="4" fill="var(--p-port)"/>
    <rect x="37" y="29" width="3" height="4" fill="var(--p-port)"/>
    <path d="M8 31 H6 C4 31 3 32.5 3 34.5 V44 M40 31 H42 C44 31 45 32.5 45 34.5 V44" fill="none" stroke="var(--p-tube)" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M16 31 H32" stroke="var(--p-unit-2)" stroke-width="2" stroke-linecap="round"/>`,
  // Outdoor probe: the probe inside its shield of stacked plates, on a pole.
outdoor: `
    <rect x="22.5" y="30" width="3" height="16" fill="var(--p-metal)"/>
    <path d="M8 9 C8 7 9 6 11 6 H37 C39 6 40 7 40 9 V10.5 H8 Z" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <rect x="10" y="13.5" width="28" height="4" rx="2" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <rect x="10" y="20.5" width="28" height="4" rx="2" fill="var(--p-unit)" stroke="var(--p-edge)"/>
    <rect x="13" y="27.5" width="22" height="3.5" rx="1.75" fill="var(--p-unit-2)"/>
    <path d="M15 10.5 V27.5 M33 10.5 V27.5" stroke="var(--p-unit-2)" stroke-width="1.6"/>`,
  // Relay module: a DIN-rail module with its row of relays and their screw terminals.
  relay: `
    <rect x="3" y="21" width="42" height="6" rx="1" fill="var(--p-rail)"/>
    ${unit(5, 7, 38, 34, 3)}
    ${screws([10, 16, 22, 28, 34, 40].map((x) => x - 1), 11)}
    ${[8, 14, 20, 26, 32, 38].map((x) => `<rect x="${x - 1}" y="16.5" width="5" height="12" rx="1" fill="var(--p-unit-2)"/>`).join('')}
    ${screws([10, 16, 22, 28, 34, 40].map((x) => x - 1), 35)}`,
  // Modbus gateway: Ethernet in, RS-485 out: a box with its network socket, its terminals and the network cable.
gateway: `
    <path d="M2 24 H7" stroke="var(--p-tube)" stroke-width="3.2" stroke-linecap="round"/>
    ${unit(7, 11, 34, 26, 4)}
    <path d="M11 18 H19 V20 H21 V28 H19 V30 H11 Z" fill="var(--p-port)"/>
    <path d="M13 20.5 V22 M15 20.5 V22 M17 20.5 V22" stroke="var(--p-unit)" stroke-width="1"/>
    <rect x="5" y="21" width="8" height="6" rx="1" fill="var(--p-unit-2)"/>
    <rect x="28" y="17" width="9" height="14" rx="1.5" fill="var(--p-unit-2)"/>
    ${screws([32.5], 20.5)}${screws([32.5], 24)}${screws([32.5], 27.5)}
    <path d="M37 20.5 H46 M37 27.5 H46" stroke="var(--p-tube)" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="24.5" cy="33" r="1.3" fill="var(--p-unit-2)"/>`,
};

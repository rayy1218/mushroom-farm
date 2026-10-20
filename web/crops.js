// The crop list, the stages and the bands they give (spec 2026-10-20-crops-and-simulation-design.md section 2).
// Pure: imported by the farm server and by the page. The numbers are v1's (controller.js on master).

// Targets per stage: [temperature °C, RH %, CO₂ limit ppm]. range: the good fruiting range (T °C, RH %).
// cool: a crop held well below the outdoor air (an insulated room and a larger aircon).
export const CROPS = {
  oyster: { name: 'Grey oyster', spawn: [24, 70, 5000], pinning: [24, 92, 800], fruiting: [25, 88, 1000], rest: [25, 80, 2000], range: { T: [23, 27], RH: [85, 92] } },
  black: { name: 'Black oyster', spawn: [25, 70, 5000], pinning: [23, 92, 800], fruiting: [23, 88, 900], rest: [24, 80, 2000], range: { T: [21, 25], RH: [85, 92] } },
  pink: { name: 'Pink oyster', spawn: [27, 70, 5000], pinning: [26, 92, 800], fruiting: [26, 88, 1000], rest: [27, 80, 2000], range: { T: [24, 29], RH: [85, 92] } },
  abalone: { name: 'Abalone oyster', spawn: [27, 70, 5000], pinning: [26, 90, 1000], fruiting: [27, 87, 1000], rest: [27, 80, 2000], range: { T: [25, 30], RH: [85, 90] } },
  golden: { name: 'Golden oyster', spawn: [26, 70, 5000], pinning: [24, 92, 700], fruiting: [24, 88, 800], rest: [25, 80, 2000], range: { T: [22, 26], RH: [85, 92] } },
  woodear: { name: 'Black jelly (wood ear)', spawn: [27, 70, 5000], pinning: [26, 92, 1500], fruiting: [26, 90, 1500], rest: [27, 80, 3000], range: { T: [24, 29], RH: [88, 95] } },
  reishi: { name: 'Reishi (lingzhi)', spawn: [28, 70, 5000], pinning: [27, 90, 1000], fruiting: [27, 88, 1000], rest: [27, 80, 2000], range: { T: [25, 30], RH: [85, 92] } },
  milky: { name: 'Milky (Calocybe indica)', spawn: [30, 70, 5000], pinning: [30, 90, 1000], fruiting: [30, 85, 1000], rest: [30, 80, 2000], range: { T: [28, 34], RH: [80, 90] } },
  // Draft: fruits at 16–22 °C; needs an insulated room and a larger aircon than the tropical crops.
  lionsmane: { name: "Lion's mane (draft)", spawn: [23, 80, 5000], pinning: [17, 92, 1000], fruiting: [20, 90, 1000], rest: [21, 80, 2000], range: { T: [16, 22], RH: [85, 92] }, cool: true },
};
export const CROP_KEYS = Object.keys(CROPS);

export const STAGES = { spawn: 'Spawn run', pinning: 'Pinning', fruiting: 'Fruiting', rest: 'Rest between flushes' };
export const STAGE_KEYS = Object.keys(STAGES);

// Farms that buy ready-to-fruit blocks never have a spawn run or pinning in their rooms.
export const FARM_TYPES = {
  ready: { name: 'Ready-to-fruit blocks (bought in)', stages: ['fruiting', 'rest'] },
  full: { name: 'Full cycle (own spawn run and pinning)', stages: ['spawn', 'pinning', 'fruiting', 'rest'] },
};

export const CO2_PER_BLOCK = 60; // mL/h, every crop (the simulation's default; no per-crop data yet)
export const MAX_CROPS = 9;
export const MAX_BLOCKS = 100_000;

const T_HALF = 1;
const RH_HALF = 3;
const round1 = (v) => Math.round(v * 10) / 10;

// The CO₂ band of a limit (v1's fanOn, fanOff and co2SafetyAt; the lower limit at least 450 ppm).
function co2Band(limit) {
  return {
    co2Low: Math.max(450, Math.min(limit - 150, Math.max(600, limit - 300))),
    co2High: limit - 100,
    co2Safety: limit + 500,
  };
}

// The bands of one crop in one stage: { co2Low, co2High, co2Safety, tLow, tHigh, rhLow, rhHigh }.
export function cropBands(crop, stage) {
  const [t, rh, limit] = CROPS[crop][stage];
  return { ...co2Band(limit), tLow: t - T_HALF, tHigh: t + T_HALF, rhLow: rh - RH_HALF, rhHigh: Math.min(100, rh + RH_HALF) };
}

const names = (list) => list.map((c) => CROPS[c.crop].name).join(' and ');

// The bands of a mix of crops [{ crop, blocks }] in one stage: per value the overlap of the crops' bands; the CO₂ band from
// the crop with the lowest limit. An empty temperature or humidity overlap falls back to the blocks-weighted average target ±
// the one-crop half width, with a warning. → { bands, warnings }.
export function mixBands(crops, stage) {
  const one = crops.map((c) => ({ ...c, bands: cropBands(c.crop, stage), target: CROPS[c.crop][stage] }));
  const strictest = one.reduce((a, b) => (b.target[2] < a.target[2] ? b : a));
  const bands = { co2Low: strictest.bands.co2Low, co2High: strictest.bands.co2High, co2Safety: strictest.bands.co2Safety };
  const warnings = [];
  const total = one.reduce((sum, c) => sum + c.blocks, 0);
  for (const [low, high, index, half, word] of [['tLow', 'tHigh', 0, T_HALF, 'temperature'], ['rhLow', 'rhHigh', 1, RH_HALF, 'humidity']]) {
    const lo = Math.max(...one.map((c) => c.bands[low]));
    const hi = Math.min(...one.map((c) => c.bands[high]));
    if (lo < hi) {
      bands[low] = lo;
      bands[high] = hi;
      continue;
    }
    const mid = round1(one.reduce((sum, c) => sum + c.target[index] * c.blocks, 0) / total);
    bands[low] = round1(mid - half);
    bands[high] = round1(index === 1 ? Math.min(100, mid + half) : mid + half);
    warnings.push(`${names(one)} do not fit one ${word} band`);
  }
  return { bands, warnings };
}

// Plain warnings for bands outside a crop's good fruiting range (fruiting stage only; other stages differ on purpose).
export function rangeWarnings(crops, bands, stage) {
  if (stage !== 'fruiting') return [];
  const out = [];
  for (const { crop } of crops) {
    const { name, range } = CROPS[crop];
    if (bands.tLow < range.T[0] || bands.tHigh > range.T[1]) {
      out.push(`Temperature band ${bands.tLow}–${bands.tHigh} °C is outside ${name}'s range ${range.T[0]}–${range.T[1]} °C`);
    }
    if (bands.rhLow < range.RH[0] || bands.rhHigh > range.RH[1]) {
      out.push(`Humidity band ${bands.rhLow}–${bands.rhHigh} % is outside ${name}'s range ${range.RH[0]}–${range.RH[1]} %`);
    }
  }
  return out;
}

// Checks a crop list [{ crop, blocks }]: 1 to MAX_CROPS rows, known crops, each once, blocks a whole number 1–MAX_BLOCKS.
// An empty list is allowed only with allowEmpty (a room without a crop). → { error, field } or null.
export function validateCrops(list, { allowEmpty = false } = {}) {
  const field = 'crops';
  if (!Array.isArray(list)) return { error: 'Crops must be a list', field };
  if (list.length === 0) return allowEmpty ? null : { error: 'Add at least one crop', field };
  if (list.length > MAX_CROPS) return { error: `At most ${MAX_CROPS} crops`, field };
  const seen = new Set();
  for (const row of list) {
    if (row === null || typeof row !== 'object' || !CROP_KEYS.includes(row.crop)) return { error: 'Unknown crop', field };
    if (seen.has(row.crop)) return { error: `${CROPS[row.crop].name} is in the list twice`, field };
    seen.add(row.crop);
    if (!Number.isInteger(row.blocks) || row.blocks < 1 || row.blocks > MAX_BLOCKS) {
      return { error: `Blocks must be a whole number from 1 to ${MAX_BLOCKS}`, field };
    }
  }
  return null;
}

export const blocksOf = (crops) => crops.reduce((sum, c) => sum + c.blocks, 0);

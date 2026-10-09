/*
 * equipment.js: PREP 2.0 STUB of the equipment check (docs/contracts/equipment.md).
 *
 * The frozen catalogue of C8 4.1 and the real checkEquipment of C8 4.3. geometry, shell, plantOf, estimate,
 * runCheckSteps, runCheck and runCheckAsync throw Error('stub'); the Equipment stream replaces this whole file.
 * At load it reads nothing (C8 1: only ClimateSim, which the stub does not need yet).
 */
(function (global) {
'use strict';

function deepFreeze(v) {
  if (v !== null && typeof v === 'object') {
    for (const k of Object.keys(v)) deepFreeze(v[k]);
    Object.freeze(v);
  }
  return v;
}

const AC_SIZES = deepFreeze([
  { hp: 1, w: 2640 }, { hp: 1.5, w: 3500 }, { hp: 2, w: 5280 }, { hp: 2.5, w: 6810 },
  { hp: 3, w: 7910 }, { hp: 4, w: 10550 }, { hp: 5, w: 13480 }, { hp: 6, w: 16120 },
]);

const CONSTRUCTIONS = deepFreeze({
  zinc:     { label: 'Zinc sheet, no insulation', u: 8.5,   roof: true },
  brick115: { label: 'Brick 115 mm, plastered',   u: 2.1,   roof: false },
  brick230: { label: 'Brick 230 mm',              u: 2.2,   roof: false },
  eps50:    { label: 'EPS panel 50 mm',           u: 0.715, roof: true },
  eps75:    { label: 'EPS panel 75 mm',           u: 0.475, roof: true },
  eps100:   { label: 'EPS panel 100 mm',          u: 0.305, roof: true },
  pu50:     { label: 'PU panel 50 mm',            u: 0.38,  roof: true },
  pu75:     { label: 'PU panel 75 mm',            u: 0.275, roof: true },
  pu100:    { label: 'PU panel 100 mm',           u: 0.2,   roof: true },
});

const FOGGER_SIZES = deepFreeze([3, 6, 14, 24]);
const AIR_SIZES = deepFreeze([600, 900, 1200, 1800, 2400, 3600]);
const DEFAULTS = deepFreeze({ ac_hp: 1.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 });
const LIMITS = deepFreeze({ ac_units: [1, 4], fog_lph: [0.5, 50], air_m3h: [50, 10000], height: [2, 6] });
const SOL_AIR_K = 26;
const MARGIN = 1.2;
const SHARE = deepFreeze({ poor: 40, fair: 25, freshAir: 45 });
const RUNS = deepFreeze({ ac: 6, margin: 1, fogger: 1, air: 1 });
const MAX_RUNS = RUNS.ac + RUNS.margin + RUNS.fogger + RUNS.air;

const WALL_KEYS = Object.keys(CONSTRUCTIONS);
const ROOF_KEYS = WALL_KEYS.filter(k => CONSTRUCTIONS[k].roof);

function inRange(v, [lo, hi]) { return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi; }

// C8 4.3: problems in table order; [] = valid. Missing fields are allowed.
function checkEquipment(eq) {
  if (eq === null || typeof eq !== 'object' || Array.isArray(eq)) return ['equipment: must be an object'];
  const problems = [];
  const present = k => eq[k] !== undefined;
  for (const k of Object.keys(eq)) if (!Object.hasOwn(DEFAULTS, k)) problems.push(`${k}: unknown field`);
  if (present('ac_hp') && !AC_SIZES.some(s => s.hp === eq.ac_hp)) {
    problems.push(`ac_hp: must be one of ${AC_SIZES.map(s => s.hp).join(', ')}`);
  }
  if (present('ac_units') && !(Number.isInteger(eq.ac_units) && inRange(eq.ac_units, LIMITS.ac_units))) {
    problems.push('ac_units: must be a whole number from 1 to 4');
  }
  if (present('fog_lph') && !inRange(eq.fog_lph, LIMITS.fog_lph)) problems.push('fog_lph: must be a number from 0.5 to 50');
  if (present('air_m3h') && !inRange(eq.air_m3h, LIMITS.air_m3h)) problems.push('air_m3h: must be a number from 50 to 10000');
  if (present('height') && !inRange(eq.height, LIMITS.height)) problems.push('height: must be a number from 2 to 6');
  if (present('walls') && eq.walls !== null && !(typeof eq.walls === 'string' && WALL_KEYS.includes(eq.walls))) {
    problems.push(`walls: must be one of ${WALL_KEYS.join(', ')} or null`);
  }
  if (present('roof') && eq.roof !== null && !(typeof eq.roof === 'string' && ROOF_KEYS.includes(eq.roof))) {
    problems.push(`roof: must be one of ${ROOF_KEYS.join(', ')} or null`);
  }
  if (((eq.walls ?? null) === null) !== ((eq.roof ?? null) === null)) problems.push('walls and roof: set both or neither');
  return problems;
}

function stub() { throw new Error('stub'); }

global.ClimateEquipment = {
  AC_SIZES, CONSTRUCTIONS, FOGGER_SIZES, AIR_SIZES, DEFAULTS, LIMITS, SOL_AIR_K, MARGIN, SHARE, RUNS, MAX_RUNS,
  checkEquipment,
  geometry: stub, shell: stub, plantOf: stub, estimate: stub, runCheckSteps: stub, runCheck: stub, runCheckAsync: stub,
};
})(typeof window !== 'undefined' ? window : globalThis);

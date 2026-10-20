// Pure helpers for the simulation stepper (no DOM, so they can be tested in Node).
// Spec 2026-10-20-crops-and-simulation-design.md section 4.1. Every input is kept as the text typed; checks speak like the server.

import { CROPS, STAGES, FARM_TYPES, mixBands, rangeWarnings, validateCrops } from './crops.js';

// The physics inputs of step 1. min, max and whole are those of the device app's PARAMS (device/sim-store.js; a test compares
// them); def is the default (the humidifier's is the room's rating).
export const PHYSICS_FIELDS = [
  { key: 'wallUA', label: 'Wall heat transfer', unit: 'W/K', min: 0, max: 100000, whole: false, def: 80 },
  { key: 'outdoorHigh', label: 'Outdoor day high', unit: '°C', min: -40, max: 60, whole: false, def: 33 },
  { key: 'outdoorLow', label: 'Outdoor night low', unit: '°C', min: -40, max: 60, whole: false, def: 25 },
  { key: 'outdoorDew', label: 'Outdoor dew point', unit: '°C', min: -40, max: 60, whole: false, def: 24 },
  { key: 'sunW', label: 'Sun on the roof', unit: 'W', min: 0, max: 100000, whole: false, def: 300 },
  { key: 'fanFlow', label: 'Fan flow', unit: 'm³/h', min: 0, max: 100000, whole: false, def: 600 },
  { key: 'acBTU', label: 'Aircon', unit: 'BTU/h', min: 0, max: 200000, whole: true, def: 12000 },
  { key: 'humidifierLH', label: 'Humidifier output', unit: 'L/h', min: 0, max: 100, whole: false, def: 2 },
];

export const DEFAULT_CROPS = [{ crop: 'oyster', blocks: 500 }];
export const DAYS_DEFAULT = 7;
export const DAYS_MAX = 90;

// The room's program numbers when it has none (server/program.js PROGRAM_DEFAULTS).
const PROGRAM_NUMBERS = { flushes: 4, days: { spawn: 21, pinning: 4, fruiting: 7, rest: 10 } };

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const grouped = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 1 });

// ---- the program (a copy of server/program.js programDays: the page cannot import server files; a test compares them) ----

function nextOf(p) {
  if (p.stage === 'spawn') return { stage: 'pinning', flush: 1, done: false };
  if (p.stage === 'pinning') return { stage: 'fruiting', flush: 1, done: false };
  if (p.stage === 'fruiting') return { stage: 'rest', flush: p.flush, done: p.flush >= p.flushes };
  return p.done ? null : { stage: 'fruiting', flush: p.flush + 1, done: false };
}

// Days from the start of `stage` (flush `flush`) to the end of the last flush's rest. p: { flushes, days }.
export function programDays(p, stage = p.stage, flush = p.flush) {
  let q = { ...p, stage, flush, done: false };
  let days = q.days[q.stage];
  for (let next = nextOf(q); next; next = nextOf(q)) {
    q = { ...q, ...next };
    days += q.days[q.stage];
  }
  return days;
}

// The room's program numbers from GET /api/rooms/:id/crop, or the defaults.
export function programOf(cropData) {
  const days = { ...PROGRAM_NUMBERS.days };
  for (const stage of Object.keys(days)) if (Number.isInteger(cropData?.days?.[stage])) days[stage] = cropData.days[stage];
  return { flushes: Number.isInteger(cropData?.flushes) ? cropData.flushes : PROGRAM_NUMBERS.flushes, days };
}

export const stagesOf = (farmType) => (FARM_TYPES[farmType] ?? FARM_TYPES.ready).stages;
export const fixStage = (farmType, stage) => (stagesOf(farmType).includes(stage) ? stage : stagesOf(farmType)[0]);

// ---- the state of the stepper ----

// The texts of the three steps. lastRun: the room's newest run (input as it was posted), cropData: GET /api/rooms/:id/crop.
export function initialState({ room, lastRun = null, cropData = null }) {
  const before = lastRun?.input?.physics;
  const physics = {};
  for (const f of PHYSICS_FIELDS) {
    const fallback = f.key === 'humidifierLH' && isNumber(room?.humidifierLH) ? room.humidifierLH : f.def;
    physics[f.key] = String(isNumber(before?.[f.key]) ? before[f.key] : fallback);
  }
  const crops = Array.isArray(cropData?.crops) && cropData.crops.length ? cropData.crops : DEFAULT_CROPS;
  const farmType = cropData?.farmType in FARM_TYPES ? cropData.farmType : 'ready';
  return {
    physics,
    crops: crops.map((c) => ({ crop: c.crop, blocks: String(c.blocks) })),
    farmType,
    stage: fixStage(farmType, cropData?.stage ?? 'fruiting'),
    daysMode: 'days',
    days: String(DAYS_DEFAULT),
  };
}

// The crop rows with the blocks as numbers; a blocks text that is not a whole number stays NaN (the check reports it).
const cropsOf = (state) => state.crops.map((c) => ({ crop: c.crop, blocks: /^[0-9]{1,9}$/.test(String(c.blocks).trim()) ? Number(c.blocks) : NaN }));

const physicsMessage = (f) => `${f.label} must be ${f.whole ? 'a whole number' : 'a number'} from ${f.min} to ${f.max} ${f.unit}`;

// The number of a physics text, or NaN.
function numberOf(text) {
  const s = String(text ?? '').trim();
  return /^-?[0-9]{1,7}(\.[0-9]{1,4})?$/.test(s) ? Number(s) : NaN;
}

function physicsValues(state) {
  return Object.fromEntries(PHYSICS_FIELDS.map((f) => [f.key, numberOf(state.physics[f.key])]));
}

// Whole program: the days to run from the chosen start stage (flush 1), at most DAYS_MAX.
export function wholeProgram(state, cropData) {
  const total = programDays({ ...programOf(cropData), stage: state.stage, flush: 1 });
  return { days: Math.min(total, DAYS_MAX), total, capped: total > DAYS_MAX };
}

export function daysOf(state, cropData) {
  if (state.daysMode === 'whole') return wholeProgram(state, cropData).days;
  const s = String(state.days ?? '').trim();
  return /^[0-9]{1,3}$/.test(s) ? Number(s) : NaN;
}

// The errors of one step: { 'physics.wallUA': message, crops, stage, days }. An empty object: the step is fine.
export function checkStep(step, state) {
  const errors = {};
  if (step === 1) {
    const v = physicsValues(state);
    for (const f of PHYSICS_FIELDS) {
      const n = v[f.key];
      if (!Number.isFinite(n) || n < f.min || n > f.max || (f.whole && !Number.isInteger(n))) errors[`physics.${f.key}`] = physicsMessage(f);
    }
    if (!errors['physics.outdoorLow'] && !errors['physics.outdoorHigh'] && v.outdoorLow > v.outdoorHigh) {
      errors['physics.outdoorLow'] = 'Outdoor night low must not be above the day high';
    }
    if (!errors['physics.outdoorDew'] && !errors['physics.outdoorLow'] && v.outdoorDew > v.outdoorLow) {
      errors['physics.outdoorDew'] = 'Outdoor dew point must not be above the night low';
    }
  } else if (step === 2) {
    const bad = validateCrops(cropsOf(state));
    if (bad) errors.crops = bad.error;
    if (!stagesOf(state.farmType).includes(state.stage)) errors.stage = `Stage must be one of ${stagesOf(state.farmType).join(', ')}`;
  } else if (step === 3 && state.daysMode !== 'whole') {
    const n = daysOf(state);
    if (!Number.isInteger(n) || n < 1 || n > DAYS_MAX) errors.days = `Days must be a whole number from 1 to ${DAYS_MAX}`;
  }
  return errors;
}

const FIELD_ORDER = [...PHYSICS_FIELDS.map((f) => `physics.${f.key}`), 'crops', 'farmType', 'stage', 'days'];

// The first field of an errors object in the order of the stepper, or null.
export function firstField(errors) {
  return FIELD_ORDER.find((f) => errors[f]) ?? Object.keys(errors)[0] ?? null;
}

// Which step a field of a server error belongs to, or null (an error with no field of ours).
export function stepOf(field) {
  if (typeof field !== 'string') return null;
  if (field === 'physics' || field.startsWith('physics.')) return 1;
  if (field === 'crops' || field === 'farmType' || field === 'stage') return 2;
  return field === 'days' ? 3 : null;
}

// The body of POST /api/rooms/:id/simulations from a checked state.
export function buildBody(state, cropData = null) {
  return {
    physics: physicsValues(state),
    crops: cropsOf(state),
    farmType: state.farmType,
    stage: state.stage,
    days: daysOf(state, cropData),
  };
}

// ---- words ----

export const bandLines = (b) => [`Temperature ${b.tLow}–${b.tHigh} °C`, `Humidity ${b.rhLow}–${b.rhHigh} %`, `CO₂ ${b.co2Low}–${b.co2High} ppm`];

// The bands of the crops of step 2 in its start stage: { lines, warnings } (the mix's own warnings and those of the crops' ranges),
// or null while the crops are not valid.
export function mixSummary(state) {
  const crops = cropsOf(state);
  if (validateCrops(crops) || !stagesOf(state.farmType).includes(state.stage)) return null;
  const { bands, warnings } = mixBands(crops, state.stage);
  return { lines: bandLines(bands), warnings: [...warnings, ...rangeWarnings(crops, bands, state.stage)] };
}

export const roomLine = (room) =>
  `Room size ${room.length} × ${room.width} × ${room.height} m, ${Number(room.volume).toFixed(1)} m³`;

const farmWords = { ready: 'ready-to-fruit blocks', full: 'full cycle' };

// The summary of step 3: [{ label, text }].
export function summaryLines(state, room, cropData = null) {
  const v = Object.fromEntries(PHYSICS_FIELDS.map((f) => [f.key, state.physics[f.key]]));
  const crops = state.crops.map((c) => `${CROPS[c.crop]?.name ?? c.crop}, ${c.blocks} blocks`).join('; ');
  const days = state.daysMode === 'whole' ? `Whole program, ${wholeProgram(state, cropData).days} days` : `${state.days} days`;
  return [
    { label: 'Room', text: roomLine(room).replace('Room size ', 'Size ') },
    { label: 'Walls and weather', text: `Walls ${v.wallUA} W/K, sun on the roof ${v.sunW} W, outdoor ${v.outdoorLow}–${v.outdoorHigh} °C, dew point ${v.outdoorDew} °C` },
    { label: 'Machines', text: `Fan ${v.fanFlow} m³/h, aircon ${grouped(Number(v.acBTU))} BTU/h, humidifier ${v.humidifierLH} L/h` },
    { label: 'Crops', text: `${crops}; ${farmWords[state.farmType]}, starting at ${STAGES[state.stage].toLowerCase().replace(' between flushes', '')}` },
    { label: 'Run', text: days },
  ];
}

// "Running… 35 %" while a run is going; its end otherwise.
export function progressLine(run) {
  if (run.status === 'queued') return 'Waiting for its turn…';
  if (run.status === 'done') return 'Done';
  if (run.status === 'failed') return `Failed: ${run.error ?? 'the run stopped'}`;
  return `Running… ${Math.round((isNumber(run.progress) ? run.progress : 0) * 100)} %`;
}


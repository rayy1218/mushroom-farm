// Pure helpers for the simulation stepper (no DOM, so they can be tested in Node).
// Spec 2026-10-20-crops-and-simulation-design.md section 4.1. Every input is kept as the text typed; checks speak like the server.

import { CROPS, STAGES, FARM_TYPES, mixBands, rangeWarnings, validateCrops } from './crops.js';

// The physics inputs of step 1. min, max and whole are those of the device app's PARAMS (device/sim-store.js; a test compares
// them); def is the default (the humidifier's is the room's rating, the dehumidifier's the room's capacity when it is fitted).
export const PHYSICS_FIELDS = [
  { key: 'wallUA', label: 'Wall heat transfer', unit: 'W/K', min: 0, max: 100000, whole: false, def: 80 },
  { key: 'outdoorHigh', label: 'Outdoor day high', unit: '°C', min: -40, max: 60, whole: false, def: 33 },
  { key: 'outdoorLow', label: 'Outdoor night low', unit: '°C', min: -40, max: 60, whole: false, def: 25 },
  { key: 'outdoorDew', label: 'Outdoor dew point', unit: '°C', min: -40, max: 60, whole: false, def: 24 },
  { key: 'sunW', label: 'Sun on the roof', unit: 'W', min: 0, max: 100000, whole: false, def: 300 },
  { key: 'fanFlow', label: 'Fan flow', unit: 'm³/h', min: 0, max: 100000, whole: false, def: 600 },
  { key: 'acBTU', label: 'Aircon capacity', unit: 'BTU/h', min: 0, max: 200000, whole: true, def: 12000 },
  { key: 'humidifierLH', label: 'Humidifier output', unit: 'L/h', min: 0, max: 100, whole: false, def: 2 },
  // Not a device parameter by this name (the server maps it to the dehumidifier's rating); the limit is the spec's.
  { key: 'dehumidifierLday', label: 'Dehumidifier', unit: 'L/day', min: 0, max: 200, whole: false, def: 0, device: false },
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
  return p.done || p.flush >= p.flushes ? null : { stage: 'fruiting', flush: p.flush + 1, done: false };
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

// The accessible name of a crop row's Remove button.
export const removeLabel = (crop) => `Remove ${CROPS[crop]?.name ?? 'crop'}`;

export const stagesOf = (farmType) => (FARM_TYPES[farmType] ?? FARM_TYPES.ready).stages;
export const fixStage = (farmType, stage) => (stagesOf(farmType).includes(stage) ? stage : stagesOf(farmType)[0]);

// ---- the state of the stepper ----

// The texts of the three steps. lastRun: the room's newest run (input as it was posted), cropData: GET /api/rooms/:id/crop.
export function initialState({ room, lastRun = null, cropData = null }) {
  const before = lastRun?.input?.physics;
  const physics = {};
  for (const f of PHYSICS_FIELDS) {
    let fallback = f.def;
    if (f.key === 'humidifierLH' && isNumber(room?.humidifierLH)) fallback = room.humidifierLH;
    if (f.key === 'dehumidifierLday' && room?.dehumidifier === true && isNumber(room.dehumidifierLday)) fallback = room.dehumidifierLday;
    physics[f.key] = String(isNumber(before?.[f.key]) ? before[f.key] : fallback);
  }
  // The crops: the room's, else those of its last run (a room only simulated so far), else Grey oyster 500.
  const roomCrops = Array.isArray(cropData?.crops) && cropData.crops.length > 0;
  const lastCrops = !roomCrops && Array.isArray(lastRun?.input?.crops) && lastRun.input.crops.length > 0 ? lastRun.input : null;
  const crops = roomCrops ? cropData.crops : lastCrops ? lastCrops.crops : DEFAULT_CROPS;
  const from = lastCrops ?? cropData;
  const farmType = Object.hasOwn(FARM_TYPES, from?.farmType ?? '') ? from.farmType : 'ready';
  return {
    physics,
    crops: crops.map((c) => ({ crop: c.crop, blocks: String(c.blocks) })),
    farmType,
    stage: fixStage(farmType, from?.stage ?? 'fruiting'),
    daysMode: 'days',
    days: String(DAYS_DEFAULT),
    // The air exchange time limit of this run: null while it is the room's (a suggestion's Use this sets it).
    exchangeMaxMin: null,
    roomExchangeMaxMin: null, // the room's own, from GET /api/rooms/:id/control, when known
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
  return field === 'days' || field === 'target' || field === 'control.exchangeMaxMin' ? 3 : null;
}

// The body of POST /api/rooms/:id/simulations from a checked state.
export function buildBody(state, cropData = null) {
  const body = {
    physics: physicsValues(state),
    crops: cropsOf(state),
    farmType: state.farmType,
    stage: state.stage,
    days: daysOf(state, cropData),
  };
  if (isNumber(state.exchangeMaxMin)) body.control = { exchangeMaxMin: state.exchangeMaxMin };
  return body;
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
    { label: 'Machines', text: `Fan ${v.fanFlow} m³/h, aircon ${grouped(Number(v.acBTU))} BTU/h, humidifier ${v.humidifierLH} L/h, ${Number(v.dehumidifierLday) > 0 ? `dehumidifier ${v.dehumidifierLday} L/day` : 'no dehumidifier'}` },
    ...(isNumber(state.exchangeMaxMin) ? [{ label: 'Air exchange', text: limitLine(state.exchangeMaxMin, state.roomExchangeMaxMin) }] : []),
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


// ---- suggest machines (spec 2026-10-22-suggest-machines-design.md section 7) ----

export const TARGET_DEFAULT = '95';
const TARGET_MESSAGE = 'Target must be a whole number from 50 to 99 %';

// The error of a Target (%) text, or null.
export function checkTarget(text) {
  const s = String(text ?? '').trim();
  return /^[0-9]{1,3}$/.test(s) && Number(s) >= 50 && Number(s) <= 99 ? null : TARGET_MESSAGE;
}

// The body of POST /api/rooms/:id/sizing: the walls, weather and sun of step 1 (the machines are what it looks for), the crops
// of step 2 and the target. The state's texts are checked by the caller (checkStep 1 and 2, checkTarget).
export function sizingBody(state, target) {
  const v = physicsValues(state);
  return {
    physics: { wallUA: v.wallUA, outdoorHigh: v.outdoorHigh, outdoorLow: v.outdoorLow, outdoorDew: v.outdoorDew, sunW: v.sunW },
    crops: cropsOf(state),
    farmType: state.farmType,
    stage: state.stage,
    target: Number(String(target).trim()),
  };
}

// The words over the progress bar of a sizing job. The server sends progress 0-1; tried and total, when it sends them, are named.
export function sizingProgress(job) {
  if (job.status === 'queued') return 'Waiting for its turn…';
  if (job.status === 'done') return 'Done';
  if (job.status === 'failed') return `Failed: ${job.error ?? 'the search stopped'}`;
  if (isNumber(job.total) && job.total > 0) {
    const tried = isNumber(job.tried) ? job.tried : Math.round((isNumber(job.progress) ? job.progress : 0) * job.total);
    return `Trying ${tried} of ${job.total} setups…`;
  }
  return `Trying setups… ${Math.round((isNumber(job.progress) ? job.progress : 0) * 100)} %`;
}

const one = (v) => (isNumber(v) ? v.toFixed(1) : '—');

// result.best as the rows of the table: texts, whether the row is the best one and whether it reaches the target (in words,
// never colour alone). index is the row's place in result.best, for Use this.
export function sizingRows(result) {
  const target = result?.target;
  return (Array.isArray(result?.best) ? result.best : []).map((c, i) => {
    // Temperature, humidity and CO₂ each at the target (spec section 4); "All three" is information only.
    const reached = isNumber(target) && ['t', 'rh', 'co2'].every((k) => isNumber(c.inBand?.[k]) && c.inBand[k] >= target);
    const best = i === 0;
    const verdict = reached ? `reaches ${target} %` : `below ${target} %`;
    const text = best ? `Best, ${verdict}` : `${verdict[0].toUpperCase()}${verdict.slice(1)}`;
    return {
      index: i, best, reached,
      mark: text,
      fan: String(c.machines?.fanFlow), humidifier: String(c.machines?.humidifierLH), dehumidifier: String(c.machines?.dehumidifierLday ?? 0),
      aircon: grouped(Number(c.machines?.acBTU)), limit: String(c.exchangeMaxMin),
      t: one(c.inBand?.t), rh: one(c.inBand?.rh), co2: one(c.inBand?.co2), all: one(c.inBand?.all), kWh: one(c.kWh),
    };
  });
}

// The estimates with their reasons, one line each: "Fan 150 m³/h: why".
export function estimateLines(est) {
  if (!est) return [];
  const why = est.why ?? {};
  const rows = [
    ['Fan', `${est.fanFlow} m³/h`, why.fanFlow, est.fanFlow],
    ['Humidifier', `${est.humidifierLH} L/h`, why.humidifierLH, est.humidifierLH],
    ['Dehumidifier', `up to ${est.dehumidifierMaxLday} L/day`, why.dehumidifierLday, est.dehumidifierMaxLday],
    ['Aircon', `${isNumber(est.acBTU) ? grouped(est.acBTU) : est.acBTU} BTU/h`, why.acBTU, est.acBTU],
    ['Air exchange time limit', `up to ${est.exchangeMaxMin} min`, why.exchangeMaxMin, est.exchangeMaxMin],
  ];
  return rows.filter((r) => r[3] !== undefined && r[3] !== null).map(([name, value, reason]) => `${name} ${value}${reason ? `: ${reason}` : ''}`);
}

// "Air exchange time limit 60 min (the room: 10 min)"; roomMin unknown: "(set for this run)".
export function limitLine(min, roomMin) {
  return `Air exchange time limit ${min} min (${isNumber(roomMin) ? `the room: ${roomMin} min` : 'set for this run'})`;
}

// Use this: the setup's machines into step 1's texts; the run's time limit when it is not the room's own.
export function useSetup(state, candidate, roomMin) {
  const m = candidate.machines;
  state.physics.fanFlow = String(m.fanFlow);
  state.physics.humidifierLH = String(m.humidifierLH);
  state.physics.dehumidifierLday = String(m.dehumidifierLday);
  state.physics.acBTU = String(m.acBTU);
  state.roomExchangeMaxMin = isNumber(roomMin) ? roomMin : null;
  state.exchangeMaxMin = isNumber(roomMin) && candidate.exchangeMaxMin === roomMin ? null : candidate.exchangeMaxMin;
}

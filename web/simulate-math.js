// Pure helpers for the simulation stepper (no DOM, so they can be tested in Node).
// Spec 2026-10-20-crops-and-simulation-design.md section 4.1. Every input is kept as the text typed; checks speak like the server.

import { acSize, kwOfBtu } from './simulation-math.js';
import { exchangePoints } from './band-math.js';
import { CROPS, STAGES, FARM_TYPES, mixBands, rangeWarnings, validateCrops } from './crops.js';
import { HUMIDIFIER_LABEL, OUTDOOR_LABEL } from './control-math.js';

// The physics inputs of step 1. min, max and whole are those of the device app's PARAMS (device/sim-store.js; a test compares
// them); def is the default (the humidifier's is the room's rating, the dehumidifier's the room's capacity when it is fitted).
export const PHYSICS_FIELDS = [
  { key: 'wallUA', label: 'Wall heat transfer', unit: 'W/K', min: 0, max: 100000, whole: false, def: 80 },
  { key: 'outdoorHigh', label: 'Outdoor day high', unit: '°C', min: -40, max: 60, whole: false, def: 33 },
  { key: 'outdoorLow', label: 'Outdoor night low', unit: '°C', min: -40, max: 60, whole: false, def: 25 },
  { key: 'outdoorDew', label: 'Outdoor dew point', unit: '°C', min: -40, max: 60, whole: false, def: 24 },
  { key: 'sunW', label: 'Sun on the roof', unit: 'W', min: 0, max: 100000, whole: false, def: 300 },
  { key: 'fanFlow', label: 'Fan flow', unit: 'm³/h', min: 0, max: 100000, whole: false, def: 600 },
  // kept in BTU/h (the device app's parameter); entered in kW, with the BTU/h class it is sold by as a picker (kw)
  { key: 'acBTU', label: 'Aircon size', unit: 'BTU/h', min: 0, max: 200000, whole: true, def: 12000, kw: true },
  { key: 'humidifierLH', label: 'Humidifier output', unit: 'L/h', min: 0, max: 100, whole: false, def: 2 },
  // Not a device parameter by this name (the server maps it to the dehumidifier's rating); the limit is the spec's.
  { key: 'dehumidifierLday', label: 'Dehumidifier', unit: 'L/day', min: 0, max: 200, whole: false, def: 0, device: false },
  // The intake filter (spec 2026-10-22-filter-design.md 8): four settings of the device app, then the run's own two. room: the
  // room field that prefills it.
  { key: 'fanMaxPa', label: 'Fan maximum pressure', unit: 'Pa', min: 20, max: 2000, whole: true, def: 200, room: 'fanMaxPa' },
  { key: 'filterCleanPa', label: 'Clean filter pressure drop', unit: 'Pa', min: 5, max: 1000, whole: true, def: 40, room: 'filterCleanPa' },
  { key: 'filterFinalPa', label: 'Filter change pressure', unit: 'Pa', min: 5, max: 2000, whole: true, def: 80, room: 'filterFinalPa' },
  { key: 'filterLifeDays', label: 'Filter life', unit: 'days', min: 1, max: 365, whole: true, def: 30 },
  { key: 'filterChangeDays', label: 'Filter change every', unit: 'days', min: 0, max: 365, whole: true, def: 30, device: false, room: 'filterChangeDays' },
  { key: 'filterUsedDays', label: 'Filter in use', unit: 'days', min: 0, max: 365, whole: true, def: 0, device: false },
];
export const FILTER_KEYS = ['fanMaxPa', 'filterCleanPa', 'filterFinalPa', 'filterLifeDays', 'filterChangeDays', 'filterUsedDays'];
const DAY_MS = 86_400_000;

export const DEFAULT_CROPS = [{ crop: 'oyster', blocks: 500 }];
// The hour a run from outdoor air starts at, the cool-down's of Suggest machines (server/sizing.js COOL_START_HOUR; a test
// compares them): the heat of the day.
export const COOL_START_HOUR = 14;
const clockHour = (h) => `${String(h).padStart(2, '0')}:00`;
// Step 3's Start from.
export const startChoices = [
  { value: 'band', label: 'In band (a room that is running)' },
  { value: 'outdoor', label: `Outdoor air at ${clockHour(COOL_START_HOUR)} (just loaded)` },
];
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

// The texts of the three steps. lastRun: the room's newest run (input as it was posted), cropData: GET /api/rooms/:id/crop,
// roomControl: GET /api/rooms/:id/control (null when it could not be read); again: a run to simulate again, whose own
// control settings (Change for this run) go with it.
// The filter's days in use are the room's now (whole days since its last change), whatever the last run had.
export function initialState({ room, lastRun = null, cropData = null, roomControl = null, again = null, now = Date.now() }) {
  const before = lastRun?.input?.physics;
  const physics = {};
  for (const f of PHYSICS_FIELDS) {
    let fallback = f.def;
    if (f.key === 'humidifierLH' && isNumber(room?.humidifierLH)) fallback = room.humidifierLH;
    if (f.key === 'dehumidifierLday' && room?.dehumidifier === true && isNumber(room.dehumidifierLday)) fallback = room.dehumidifierLday;
    if (f.room && isNumber(room?.[f.room])) fallback = room[f.room];
    physics[f.key] = String(isNumber(before?.[f.key]) ? before[f.key] : fallback);
  }
  // at most 365, the field's limit: a filter not changed for over a year is a year old for the run
  physics.filterUsedDays = String(isNumber(room?.filterChangedAt) ? Math.min(365, Math.max(0, Math.floor((now - room.filterChangedAt) / DAY_MS))) : 0);
  // The crops: the room's, else those of its last run (a room only simulated so far), else Grey oyster 500.
  const roomCrops = Array.isArray(cropData?.crops) && cropData.crops.length > 0;
  const lastCrops = !roomCrops && Array.isArray(lastRun?.input?.crops) && lastRun.input.crops.length > 0 ? lastRun.input : null;
  const crops = roomCrops ? cropData.crops : lastCrops ? lastCrops.crops : DEFAULT_CROPS;
  const from = lastCrops ?? cropData;
  const farmType = Object.hasOwn(FARM_TYPES, from?.farmType ?? '') ? from.farmType : 'ready';
  const state = {
    physics,
    crops: crops.map((c) => ({ crop: c.crop, blocks: String(c.blocks) })),
    farmType,
    stage: fixStage(farmType, from?.stage ?? 'fruiting'),
    filterSensor: isNumber(room?.dpAddress), // the run changes its filter at the change pressure, as the room's sensor would tell
    daysMode: 'days',
    days: String(DAYS_DEFAULT),
    start: 'band', // Start from: 'band' or 'outdoor' (at COOL_START_HOUR)
    // The room's control settings that a run uses (step 3's Control row), or null when unknown.
    roomControl: pickControl(roomControl),
    // This run's own: the air exchange time limit (null while it is the room's) and the other settings of RUN_CONTROL that
    // differ from the room's (Change for this run, or a suggestion's Use this); the texts typed for the numbers.
    exchangeMaxMin: null,
    runSettings: {},
    controlTexts: {},
  };
  for (const f of RUN_CONTROL) {
    const v = again?.input?.control?.[f.key];
    if (v !== undefined) setRunControl(state, f.key, f.switch ? v : String(v));
  }
  return state;
}

// Whether the filter fields hold what the room gives them (step 1 folds them away then): its pressures and change days, the
// default filter life and the days since its last change.
export function filterFromRoom(state, room, now = Date.now()) {
  const own = initialState({ room, now }).physics;
  return FILTER_KEYS.every((k) => numberOf(state.physics[k]) === Number(own[k]));
}

// The crop rows with the blocks as numbers; a blocks text that is not a whole number stays NaN (the check reports it).
const cropsOf = (state) => state.crops.map((c) => ({ crop: c.crop, blocks: /^[0-9]{1,9}$/.test(String(c.blocks).trim()) ? Number(c.blocks) : NaN }));

const physicsMessage = (f) => (f.kw ? `${f.label} must be a number from 0 to ${kwOfBtu(f.max).toFixed(1)} kW`
  : `${f.label} must be ${f.whole ? 'a whole number' : 'a number'} from ${f.min} to ${f.max} ${f.unit}`);

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
    if (!errors['physics.filterCleanPa']) {
      if (!errors['physics.fanMaxPa'] && v.fanMaxPa <= v.filterCleanPa) errors['physics.fanMaxPa'] = "Fan maximum pressure must be above the clean filter's pressure drop";
      if (!errors['physics.filterFinalPa'] && v.filterFinalPa <= v.filterCleanPa) errors['physics.filterFinalPa'] = "Filter change pressure must be above the clean filter's pressure drop";
    }
    if (!errors['physics.fanMaxPa'] && !errors['physics.filterFinalPa'] && v.filterFinalPa >= v.fanMaxPa) {
      errors['physics.filterFinalPa'] = "Filter change pressure must be below the fan's maximum pressure";
    }
  } else if (step === 2) {
    const bad = validateCrops(cropsOf(state));
    if (bad) errors.crops = bad.error;
    if (!stagesOf(state.farmType).includes(state.stage)) errors.stage = `Stage must be one of ${stagesOf(state.farmType).join(', ')}`;
  } else if (step === 3) {
    const n = daysOf(state);
    if (state.daysMode !== 'whole' && (!Number.isInteger(n) || n < 1 || n > DAYS_MAX)) errors.days = `Days must be a whole number from 1 to ${DAYS_MAX}`;
    for (const f of RUN_CONTROL) {
      const text = state.controlTexts?.[f.key];
      if (!f.switch && text !== undefined && controlNumber(f, text) === null) errors[`control.${f.key}`] = f.message;
    }
  }
  return errors;
}

const FIELD_ORDER = [...PHYSICS_FIELDS.map((f) => `physics.${f.key}`), 'crops', 'farmType', 'stage', 'days', 'control.exchangeMaxMin', 'control.acDrop'];

// The first field of an errors object in the order of the stepper, or null.
export function firstField(errors) {
  return FIELD_ORDER.find((f) => errors[f]) ?? Object.keys(errors)[0] ?? null;
}

// Which step a field of a server error belongs to, or null (an error with no field of ours).
export function stepOf(field) {
  if (typeof field !== 'string') return null;
  if (field === 'physics' || field.startsWith('physics.')) return 1;
  if (field === 'crops' || field === 'farmType' || field === 'stage') return 2;
  return ['days', 'target', 'control', 'start', 'startHour', 'coolDownMaxH'].includes(field) || String(field).startsWith('control.') ? 3 : null;
}

// The body of POST /api/rooms/:id/simulations from a checked state.
export function buildBody(state, cropData = null) {
  const body = {
    physics: { ...physicsValues(state), filterSensor: state.filterSensor === true },
    crops: cropsOf(state),
    farmType: state.farmType,
    stage: state.stage,
    days: daysOf(state, cropData),
    ...(state.start === 'outdoor' ? { start: 'outdoor', startHour: COOL_START_HOUR } : {}),
  };
  const { own } = runControl(state);
  if (Object.keys(own).length > 0) body.control = own;
  return body;
}

// ---- words ----

export const bandLines = (b) => [`Temperature ${b.tLow}–${b.tHigh} °C`, `Humidity ${b.rhLow}–${b.rhHigh} % RH`, `Air exchange ${exchangePoints(b.co2Low, b.co2High)}`];

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

// The filter of a run in one line: v holds the texts (or numbers) of the filter fields.
const days = (n) => `${n} ${Number(n) === 1 ? 'day' : 'days'}`;

export function filterLine(v, sensor) {
  const every = Number(v.filterChangeDays) > 0;
  const when = every && sensor ? `changed every ${days(v.filterChangeDays)} or at the change pressure (pressure sensor)`
    : every ? `changed every ${days(v.filterChangeDays)} (no pressure sensor)`
      : sensor ? 'changed at the change pressure (pressure sensor)' : 'never changed (no reminder, no pressure sensor)';
  return `Clean ${v.filterCleanPa} Pa, change at ${v.filterFinalPa} Pa, fan maximum ${v.fanMaxPa} Pa, life ${days(v.filterLifeDays)}; ${days(v.filterUsedDays)} in use; ${when}`;
}

// The summary of step 3: [{ label, text }].
export function summaryLines(state, room, cropData = null) {
  const v = Object.fromEntries(PHYSICS_FIELDS.map((f) => [f.key, state.physics[f.key]]));
  const crops = state.crops.map((c) => `${CROPS[c.crop]?.name ?? c.crop}, ${c.blocks} blocks`).join('; ');
  const days = state.daysMode === 'whole' ? `Whole program, ${wholeProgram(state, cropData).days} days` : `${state.days} days`;
  return [
    { label: 'Room', text: roomLine(room).replace('Room size ', 'Size ') },
    { label: 'Walls and weather', text: `Walls ${v.wallUA} W/K, sun on the roof ${v.sunW} W, outdoor ${v.outdoorLow}–${v.outdoorHigh} °C, dew point ${v.outdoorDew} °C` },
    { label: 'Machines', text: `Fan ${v.fanFlow} m³/h, aircon ${acSize(Number(v.acBTU))}, humidifier ${v.humidifierLH} L/h, ${Number(v.dehumidifierLday) > 0 ? `dehumidifier ${v.dehumidifierLday} L/day` : 'no dehumidifier'}${room?.lights === true ? `, lights ${room.lightsW} W on the room's schedule` : ''}` },
    { label: 'Control', text: controlLine(state) },
    { label: 'Filter', text: filterLine(v, state.filterSensor === true) },
    { label: 'Crops', text: `${crops}; ${farmWords[state.farmType]}, starting at ${STAGES[state.stage].toLowerCase().replace(' between flushes', '')}` },
    ...(state.start === 'outdoor' ? [{ label: 'Start', text: `From outdoor air at ${clockHour(COOL_START_HOUR)} (just loaded)` }] : []),
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

// result.best as the rows of the table: texts, whether the row is the best one and whether it reaches the target and cools
// down in time (in words, never colour alone). index is the row's place in result.best, for Use this. A result from before
// the cool-down check (no coolDownMaxH) is judged on the target alone.
export function sizingRows(result) {
  const target = result?.target;
  const maxH = isNumber(result?.coolDownMaxH) ? result.coolDownMaxH : null;
  return (Array.isArray(result?.best) ? result.best : []).map((c, i) => {
    // Temperature, humidity and CO₂ each at the target (spec section 4); "All three" is information only.
    const held = isNumber(target) && ['t', 'rh', 'co2'].every((k) => isNumber(c.inBand?.[k]) && c.inBand[k] >= target);
    const cools = maxH === null || (isNumber(c.coolDownH) && c.coolDownH <= maxH);
    const reached = held && cools;
    const best = i === 0;
    const verdict = [held ? `reaches ${target} %` : `below ${target} %`, ...(cools ? [] : [`cools down in over ${maxH} h`])].join(', ');
    const text = best ? `Best, ${verdict}` : `${verdict[0].toUpperCase()}${verdict.slice(1)}`;
    return {
      index: i, best, reached,
      mark: text,
      fan: String(c.machines?.fanFlow), humidifier: String(c.machines?.humidifierLH), dehumidifier: String(c.machines?.dehumidifierLday ?? 0),
      aircon: acSize(Number(c.machines?.acBTU)), limit: String(c.exchangeMaxMin),
      t: one(c.inBand?.t), rh: one(c.inBand?.rh), co2: one(c.inBand?.co2), all: one(c.inBand?.all), kWh: one(c.kWh),
      coolDown: maxH === null ? '—' : isNumber(c.coolDownH) ? `${c.coolDownH.toFixed(1)} h` : 'not in a day',
    };
  });
}

// What the table's Cools down in measures, or null for a result from before the cool-down check.
export function coolDownLine(result) {
  if (!isNumber(result?.coolDownMaxH)) return null;
  const hour = clockHour(isNumber(result.coolDownStartHour) ? result.coolDownStartHour : COOL_START_HOUR);
  return `Cool-down: from outdoor air at ${hour} (just loaded, or after the door was open) until temperature and humidity are in band and hold it for an hour (at most 0.5 °C too warm or 2 % RH too dry now and then); at most ${result.coolDownMaxH} h.`;
}

// The estimates with their reasons, one line each: "Fan 150 m³/h: why".
export function estimateLines(est) {
  if (!est) return [];
  const why = est.why ?? {};
  const rows = [
    ['Fan', `${est.fanFlow} m³/h`, why.fanFlow, est.fanFlow],
    ['Humidifier', `${est.humidifierLH} L/h`, why.humidifierLH, est.humidifierLH],
    ['Dehumidifier', `up to ${est.dehumidifierMaxLday} L/day`, why.dehumidifierLday, est.dehumidifierMaxLday],
    ['Aircon', isNumber(est.acBTU) ? acSize(est.acBTU) : est.acBTU, why.acBTU, est.acBTU],
    ['Cool-down', `aircon ${acSize(est.acCoolBTU)}, humidifier ${est.humidifierCoolLH} L/h`, why.coolDown, est.acCoolBTU],
    ['Air exchange time limit', `${est.exchangeMaxMin} min`, why.exchangeMaxMin, est.exchangeMaxMin],
  ];
  return rows.filter((r) => r[3] !== undefined && r[3] !== null).map(([name, value, reason]) => `${name} ${value}${reason ? `: ${reason}` : ''}`);
}

// Use this: the setup's machines into step 1's texts; the run's time limit, aircon drop and humidifier setting when they are
// not the room's own (what was typed for this run goes). roomControl: the room's control settings { exchangeMaxMin, acDrop,
// humidifierDuringExchange, ... } (or just its time limit as a number, or null when unknown); the state's when not given.
export function useSetup(state, candidate, roomControl = state.roomControl) {
  state.roomControl = typeof roomControl === 'number' ? { exchangeMaxMin: roomControl } : pickControl(roomControl);
  const roomC = state.roomControl ?? {};
  const settings = {};
  for (const key of ['acDrop', 'humidifierDuringExchange']) {
    const v = candidate.control?.[key];
    if (v !== undefined && v !== roomC[key]) settings[key] = v;
  }
  state.runSettings = settings;
  state.controlTexts = {};
  const m = candidate.machines;
  state.physics.fanFlow = String(m.fanFlow);
  state.physics.humidifierLH = String(m.humidifierLH);
  state.physics.dehumidifierLday = String(m.dehumidifierLday);
  state.physics.acBTU = String(m.acBTU);
  state.exchangeMaxMin = isNumber(roomC.exchangeMaxMin) && candidate.exchangeMaxMin === roomC.exchangeMaxMin ? null : candidate.exchangeMaxMin;
}

// ---- the control settings of a run (step 3's Control row and Change for this run; critique 2026-10-28) ----

// The room's control settings a run uses (server/simulate.js): the fresh air interval only as the room has it.
const CONTROL_KEYS = ['exchangeEveryMin', 'exchangeMaxMin', 'acDrop', 'humidifierDuringExchange', 'outdoorAir'];
function pickControl(c) {
  if (!c || typeof c !== 'object') return null;
  return Object.fromEntries(CONTROL_KEYS.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, c[k]]));
}

// What one run may set for itself (server/simulations.js validateSimulation control), labelled as on the Setup tab.
export const RUN_CONTROL = [
  { key: 'exchangeMaxMin', label: 'Air exchange time limit (min)', min: 1, max: 120, whole: true,
    message: 'Air exchange time limit must be a whole number from 1 to 120 min' },
  { key: 'acDrop', label: 'Aircon lower during air exchange (°C)', min: 0, max: 10, whole: false,
    message: 'Aircon lower during air exchange must be a number from 0 to 10 °C' },
  { key: 'humidifierDuringExchange', label: HUMIDIFIER_LABEL, switch: true },
  { key: 'outdoorAir', label: OUTDOOR_LABEL, switch: true },
];

// The number of a typed text within the field's limits, or null.
function controlNumber(f, text) {
  const n = numberOf(text);
  return Number.isFinite(n) && n >= f.min && n <= f.max && (!f.whole || Number.isInteger(n)) ? n : null;
}

// The settings the run uses: { values (the room's with the run's own on top), own (the run's own, the body's control) }.
export function runControl(state) {
  const own = { ...(isNumber(state.exchangeMaxMin) ? { exchangeMaxMin: state.exchangeMaxMin } : {}), ...(state.runSettings ?? {}) };
  const room = state.roomControl ?? {};
  return { values: { ...Object.fromEntries(CONTROL_KEYS.map((k) => [k, room[k]])), ...own }, own };
}

// A setting of Change for this run: a text for a number, true or false for a switch. The room's value (or a text that is
// not a number in its limits) is no setting of the run's own; the text stays as typed for the check (checkStep 3).
export function setRunControl(state, key, value) {
  const f = RUN_CONTROL.find((x) => x.key === key);
  let v = value;
  if (!f.switch) {
    state.controlTexts = { ...state.controlTexts, [key]: String(value) };
    v = controlNumber(f, value);
  }
  const own = v !== null && v !== state.roomControl?.[key];
  if (key === 'exchangeMaxMin') { state.exchangeMaxMin = own ? v : null; return; }
  const { [key]: _, ...rest } = state.runSettings ?? {};
  state.runSettings = own ? { ...rest, [key]: v } : rest;
}

// Back to the room's settings.
export function resetRunControl(state) {
  state.exchangeMaxMin = null;
  state.runSettings = {};
  state.controlTexts = {};
}

// The text of a number field of Change for this run: as typed, else the value the run uses ('' when unknown).
export function controlText(state, key) {
  const typed = state.controlTexts?.[key];
  if (typed !== undefined) return typed;
  const v = runControl(state).values[key];
  return isNumber(v) ? String(v) : '';
}

const dropWords = (v) => (v > 0 ? `${v} °C lower` : 'not lowered');
const onWords = (v) => (v ? 'on' : 'off');
const usedWords = (v) => (v ? 'used' : 'not used');

// Step 3's Control row: "Air exchange every 15 min, up to 10 min; aircon 5 °C lower during air exchange; humidifier on during
// air exchange; outdoor air used", a setting of the run's own marked "(for this run; the room: 10 min)".
export function controlLine(state) {
  const { values: v, own } = runControl(state);
  const room = state.roomControl;
  if (!room && Object.keys(own).length === 0) return 'As on the Setup tab (they could not be read)';
  const known = (k) => v[k] !== undefined;
  const mark = (k, words) => (own[k] === undefined ? '' : ` (for this run${room && room[k] !== undefined ? `; the room: ${words(room[k])}` : ''})`);
  const parts = [];
  if (known('exchangeMaxMin')) {
    const every = room?.exchangeEveryMin;
    const limit = `${v.exchangeMaxMin} min${mark('exchangeMaxMin', (x) => `${x} min`)}`;
    parts.push(isNumber(every) && every > 0 ? `air exchange every ${every} min, up to ${limit}`
      : every === 0 ? `fresh air interval off; air exchange up to ${limit}` : `air exchange up to ${limit}`);
  }
  if (known('acDrop')) parts.push(`aircon ${dropWords(v.acDrop)} during air exchange${mark('acDrop', dropWords)}`);
  if (known('humidifierDuringExchange')) parts.push(`humidifier ${onWords(v.humidifierDuringExchange)} during air exchange${mark('humidifierDuringExchange', onWords)}`);
  if (known('outdoorAir')) parts.push(`outdoor air ${usedWords(v.outdoorAir)}${mark('outdoorAir', usedWords)}`);
  if (!room) parts.push('the rest as on the Setup tab');
  const text = parts.join('; ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// The setting a run cannot change for itself (the server takes no fresh air interval per run), or null when unknown.
export function fixedControlLine(state) {
  const every = state.roomControl?.exchangeEveryMin;
  if (!isNumber(every)) return null;
  return `${every > 0 ? `Fresh air at least every ${every} min` : 'Fresh air interval off'}: set on the Setup tab`;
}

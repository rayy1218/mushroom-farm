// The stage program of a room (spec 2026-10-20-crops-and-simulation-design.md 3.2): which stage follows, when, and the slow
// change of the bands (ramp). Pure: used by the live controller and by the simulation.
//
// A program is { crops: [{ crop, blocks }], farmType, stage, stageSince (ms), flush, flushes, days: { spawn, pinning, fruiting,
// rest }, rampH, autoAdvance, ramp: { from, to, startAt, endAt } | null, done, lightHours: { spawn, pinning, fruiting, rest },
// lightStart: 'HH:MM' } (the light schedule: spec 2026-10-26-lighting-design.md 3). Bands are
// { co2Low, co2High, co2Safety, tLow, tHigh, rhLow, rhHigh }.

import { FARM_TYPES, STAGE_KEYS, mixBands, validateCrops } from '../web/crops.js';
import { LIGHT_HOURS, LIGHT_START, isClock, isLightHours } from '../web/light-math.js';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const BAND_KEYS = ['co2Low', 'co2High', 'co2Safety', 'tLow', 'tHigh', 'rhLow', 'rhHigh'];
const STEP = { tLow: 0.1, tHigh: 0.1, rhLow: 1, rhHigh: 1, co2Low: 10, co2High: 10, co2Safety: 10 };

export const PROGRAM_DEFAULTS = {
  crops: [], farmType: 'ready', stage: 'fruiting', stageSince: null, flush: 1, flushes: 4,
  days: { spawn: 21, pinning: 4, fruiting: 7, rest: 10 }, rampH: 4, autoAdvance: true, ramp: null, done: false,
  lightHours: LIGHT_HOURS, lightStart: LIGHT_START,
};

// The first stage of each farm type (new blocks start there).
export const FIRST_STAGE = Object.fromEntries(Object.entries(FARM_TYPES).map(([k, t]) => [k, t.stages[0]]));

const roundTo = (v, step) => Math.round(Math.round(v / step) * step * 10) / 10;
const pick = (bands) => Object.fromEntries(BAND_KEYS.map((k) => [k, bands[k]]));

// Checks a whole program (the stored fields). → { error, field } or null.
export function validateProgram(p) {
  const crops = validateCrops(p.crops, { allowEmpty: true });
  if (crops) return crops;
  if (typeof p.farmType !== 'string' || !Object.hasOwn(FARM_TYPES, p.farmType)) return { error: 'Farm type must be ready or full', field: 'farmType' };
  const stages = FARM_TYPES[p.farmType].stages;
  if (typeof p.stage !== 'string' || !stages.includes(p.stage)) return { error: `Stage must be one of ${stages.join(', ')}`, field: 'stage' };
  if (!Number.isInteger(p.flushes) || p.flushes < 1 || p.flushes > 10) return { error: 'Flushes must be a whole number from 1 to 10', field: 'flushes' };
  if (!Number.isInteger(p.flush) || p.flush < 1 || p.flush > p.flushes) return { error: `Flush must be a whole number from 1 to ${p.flushes}`, field: 'flush' };
  if (p.days === null || typeof p.days !== 'object') return { error: 'Days must be given per stage', field: 'days' };
  for (const stage of STAGE_KEYS) {
    const d = p.days[stage];
    if (!Number.isInteger(d) || d < 1 || d > 90) return { error: 'Days of each stage must be a whole number from 1 to 90', field: `days.${stage}` };
  }
  if (typeof p.rampH !== 'number' || !Number.isFinite(p.rampH) || p.rampH < 0 || p.rampH > 48) {
    return { error: 'Ramp must be a number from 0 to 48 h', field: 'rampH' };
  }
  if (typeof p.autoAdvance !== 'boolean') return { error: 'autoAdvance must be true or false', field: 'autoAdvance' };
  if (p.lightHours === null || typeof p.lightHours !== 'object' || Array.isArray(p.lightHours)) {
    return { error: 'Light hours must be given per stage', field: 'lightHours' };
  }
  for (const stage of STAGE_KEYS) {
    if (!isLightHours(p.lightHours[stage])) return { error: 'Light hours must be a whole number from 0 to 24', field: `lightHours.${stage}` };
  }
  if (!isClock(p.lightStart)) return { error: 'Light start must be a time like 07:00', field: 'lightStart' };
  return null;
}

// The stage after the present one: { stage, flush, done }, or null (the last rest after the last flush).
export function nextStage(p) {
  if (p.stage === 'spawn') return { stage: 'pinning', flush: 1, done: false };
  if (p.stage === 'pinning') return { stage: 'fruiting', flush: 1, done: false };
  if (p.stage === 'fruiting') return { stage: 'rest', flush: p.flush, done: p.flush >= p.flushes };
  return p.done || p.flush >= p.flushes ? null : { stage: 'fruiting', flush: p.flush + 1, done: false };
}

// When the present stage ends and the next starts (ms), or null: no crops, automatic change off, nothing follows, or no start.
export function stageEndsAt(p) {
  if (!p.autoAdvance || p.crops.length === 0 || p.stageSince === null || nextStage(p) === null) return null;
  return p.stageSince + p.days[p.stage] * DAY_MS;
}

// The program with `stage` started at `now`: the bands move from `currentBands` to the crops' bands of the stage over rampH
// (none when rampH is 0 or ramp is false: the new bands at once). A lower CO₂ upper limit takes effect at once with its lower
// limit and safety level. flush and done: for the next stage (advance); a stage started by hand keeps the flush, except
// spawn, pinning and any stage of a done program (new blocks): flush 1; it is not done.
export function startStage(p, stage, now, currentBands, { ramp = true, flush, done } = {}) {
  const to = mixBands(p.crops, stage).bands;
  const from = pick(currentBands);
  if (to.co2High < from.co2High) {
    from.co2Low = to.co2Low;
    from.co2High = to.co2High;
    from.co2Safety = to.co2Safety;
  }
  const hours = ramp ? p.rampH : 0;
  return {
    ...p,
    stage,
    stageSince: now,
    flush: flush ?? (stage === 'spawn' || stage === 'pinning' || p.done ? 1 : p.flush),
    done: done ?? false,
    ramp: { from: hours > 0 ? from : to, to, startAt: now, endAt: now + hours * HOUR_MS },
  };
}

// The bands of the ramp at `now` (rounded: T 0.1 °C, RH 1 %, CO₂ 10 ppm; each upper value above its lower one and the safety
// level above the CO₂ upper limit), its target after its end, or null without a ramp.
export function bandsAt(p, now) {
  const r = p.ramp;
  if (!r) return null;
  const span = r.endAt - r.startAt;
  const f = span <= 0 ? 1 : Math.min(1, Math.max(0, (now - r.startAt) / span));
  if (f >= 1) return { ...r.to };
  const out = {};
  for (const k of BAND_KEYS) out[k] = roundTo(r.from[k] + (r.to[k] - r.from[k]) * f, STEP[k]);
  for (const [lo, hi] of [['tLow', 'tHigh'], ['rhLow', 'rhHigh'], ['co2Low', 'co2High'], ['co2High', 'co2Safety']]) {
    if (out[hi] <= out[lo]) out[hi] = roundTo(out[lo] + STEP[hi], STEP[hi]);
  }
  return out;
}

// Applies every stage change that is due by `now` (each at its own end time, so a long gap gives several), then reads the
// bands. currentBands: the room's bands now (used when there is no ramp). → { program, changed: [{ stage, flush, at }],
// bands }: bands = what the program wants the room's bands to be now (null without a ramp); a ramp that has ended is dropped
// from the program after its target is returned.
export function advance(p, now, currentBands) {
  let program = p;
  const changed = [];
  for (let at = stageEndsAt(program); at !== null && at <= now; at = stageEndsAt(program)) {
    const next = nextStage(program);
    const from = bandsAt(program, at) ?? currentBands;
    program = startStage(program, next.stage, at, from, { flush: next.flush, done: next.done });
    changed.push({ stage: next.stage, flush: next.flush, at });
  }
  const bands = bandsAt(program, now);
  if (program.ramp && now >= program.ramp.endAt) program = { ...program, ramp: null };
  return { program, changed, bands };
}

// How long the whole program runs from the start of `stage` (flush `flush`), in days: to the end of the last flush's rest.
export function programDays(p, stage = p.stage, flush = p.flush) {
  let q = { ...p, stage, flush, done: false, autoAdvance: true, crops: p.crops.length ? p.crops : [{ crop: 'oyster', blocks: 1 }] };
  let days = q.days[q.stage];
  for (let next = nextStage(q); next; next = nextStage(q)) {
    q = { ...q, ...next };
    days += q.days[q.stage];
  }
  return days;
}

// Pure helpers for the Crop and stage card of the room page (no DOM, so they can be tested in Node).
// Spec 2026-10-20-crops-and-simulation-design.md sections 3.4 and 3.5 (the reply of GET /api/rooms/:id/crop).

import { STAGES, FARM_TYPES, rangeWarnings, validateCrops } from './crops.js';
import { formatDateTime } from './simulation-math.js';

const DAY_MS = 86_400_000;
const pad2 = (n) => String(n).padStart(2, '0');

export const hasCrops = (c) => Array.isArray(c?.crops) && c.crops.length > 0;

// "since 20 Oct 10:42 · day 3 of 7 · flush 1 of 4": the day counts from the start of the stage and stops at its length once
// the change is due; without automatic change there is no length. Spawn and pinning have no flush. '' without a start.
export function stageLine(c, now = Date.now()) {
  if (!hasCrops(c) || !Number.isFinite(c.stageSince)) return '';
  const day = Math.max(1, Math.floor((now - c.stageSince) / DAY_MS) + 1);
  const length = c.days?.[c.stage];
  const parts = [`since ${formatDateTime(c.stageSince)}`, c.autoAdvance && length ? `day ${Math.min(day, length)} of ${length}` : `day ${day}`];
  if (c.stage === 'fruiting' || c.stage === 'rest') parts.push(`flush ${c.flush} of ${c.flushes}`);
  return parts.join(' · ');
}

// "Next: Rest between flushes, about 27 Oct 10:42", or '' when nothing follows.
export function nextLine(c) {
  if (c?.done || !c?.nextStage) return '';
  const name = STAGES[c.nextStage.stage] ?? c.nextStage.stage;
  return Number.isFinite(c.nextStage.at) ? `Next: ${name}, about ${formatDateTime(c.nextStage.at)}` : `Next: ${name} (automatic change is off)`;
}

// "Bands moving to fruiting, ready about 14:42" while the bands move (the date too when it is not today).
export function rampLine(c, now = Date.now()) {
  const end = c?.ramp?.endAt;
  if (!Number.isFinite(end) || end <= now) return '';
  const d = new Date(end);
  const when = d.toDateString() === new Date(now).toDateString() ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : formatDateTime(end);
  return `Bands moving to ${(STAGES[c.stage] ?? c.stage).toLowerCase()}, ready about ${when}`;
}

export const doneLine = (c) => (c?.done ? `Flush ${c.flushes} of ${c.flushes} done: replace the blocks` : '');

// The warnings in words: those of the mix of the stage and those of the crops' good ranges.
export function cropWarnings(c) {
  if (!hasCrops(c) || !c.targets) return [];
  return [...(c.targets.warnings ?? []), ...rangeWarnings(c.crops, c.targets.bands, c.stage)];
}

// ---- the form ----

// The texts of the form from a reply.
export const formFromData = (c) => ({
  crops: (c.crops ?? []).map((r) => ({ crop: r.crop, blocks: String(r.blocks) })),
  farmType: c.farmType in FARM_TYPES ? c.farmType : 'ready',
  flushes: String(c.flushes),
  days: Object.fromEntries(Object.keys(STAGES).map((s) => [s, String(c.days?.[s])])),
  rampH: String(c.rampH),
  autoAdvance: c.autoAdvance !== false,
});

export const FORM_FIELD_ORDER = ['crops', 'farmType', 'flushes', 'days.spawn', 'days.pinning', 'days.fruiting', 'days.rest', 'rampH', 'autoAdvance'];

// Checks the form like the server (validateProgram). → { values (what Save sends, only the farm type's stages in days), errors }.
export function checkCropForm(form) {
  const errors = {};
  const crops = form.crops.map((r) => ({ crop: r.crop, blocks: /^[0-9]{1,9}$/.test(String(r.blocks).trim()) ? Number(r.blocks) : NaN }));
  const bad = validateCrops(crops, { allowEmpty: true });
  if (bad) errors.crops = bad.error;
  const flushes = /^[0-9]{1,3}$/.test(String(form.flushes).trim()) ? Number(form.flushes) : NaN;
  if (!(flushes >= 1 && flushes <= 10)) errors.flushes = 'Flushes must be a whole number from 1 to 10';
  const days = {};
  for (const stage of (FARM_TYPES[form.farmType] ?? FARM_TYPES.ready).stages) {
    const n = /^[0-9]{1,3}$/.test(String(form.days[stage]).trim()) ? Number(form.days[stage]) : NaN;
    if (!(n >= 1 && n <= 90)) errors[`days.${stage}`] = 'Days of each stage must be a whole number from 1 to 90';
    days[stage] = n;
  }
  const rampH = /^[0-9]{1,2}(\.[0-9])?$/.test(String(form.rampH).trim()) ? Number(form.rampH) : NaN;
  if (!(rampH >= 0 && rampH <= 48)) errors.rampH = 'Ramp must be a number from 0 to 48 h';
  return { values: { crops, farmType: form.farmType, flushes, days, rampH, autoAdvance: Boolean(form.autoAdvance) }, errors };
}

// The body of Save; stage only for a room that had no crops, so its stage starts with them.
export const saveBody = (values, stage) => (stage ? { ...values, stage } : { ...values });

// The body of Start stage; applyNow skips the slow change of the bands.
export const startBody = (stage, applyNow) => (applyNow ? { stage, applyNow: true } : { stage });

// Pure helpers for the Crop and stage card of the room page (no DOM, so they can be tested in Node).
// Spec 2026-10-20-crops-and-simulation-design.md sections 3.4 and 3.5 (the reply of GET /api/rooms/:id/crop).

import { CROPS, STAGES, FARM_TYPES, validateCrops, mixBands, rangeWarnings } from './crops.js';
import { formatDateTime } from './simulation-math.js';
import { lightRow, isClock, isLightHours, normaliseClock } from './light-math.js';

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

// The warnings in words: the server's targets.warnings (the mix of the stage and the crops' good ranges), as they are.
export const cropWarnings = (c) => (hasCrops(c) && c.targets ? [...(c.targets.warnings ?? [])] : []);

// ---- the form ----

// The texts of the form from a reply.
export const formFromData = (c) => ({
  crops: (c.crops ?? []).map((r) => ({ crop: r.crop, blocks: String(r.blocks) })),
  farmType: c.farmType in FARM_TYPES ? c.farmType : 'ready',
  flushes: String(c.flushes),
  days: Object.fromEntries(Object.keys(STAGES).map((s) => [s, String(c.days?.[s])])),
  rampH: String(c.rampH),
  autoAdvance: c.autoAdvance !== false,
  // the light schedule (spec 2026-10-26-lighting-design.md 3), when the server sends it
  ...(c.lightHours ? { lightHours: Object.fromEntries(Object.keys(STAGES).map((s) => [s, String(c.lightHours[s])])) } : {}),
  ...(typeof c.lightStart === 'string' ? { lightStart: c.lightStart } : {}),
});

export const FORM_FIELD_ORDER = ['crops', 'farmType', 'flushes', 'days.spawn', 'days.pinning', 'days.fruiting', 'days.rest', 'rampH', 'autoAdvance',
  'lightHours.spawn', 'lightHours.pinning', 'lightHours.fruiting', 'lightHours.rest', 'lightStart'];

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
  const rampH = /^[0-9]{1,2}(\.[0-9]+)?$/.test(String(form.rampH).trim()) ? Number(form.rampH) : NaN;
  if (!(rampH >= 0 && rampH <= 48)) errors.rampH = 'Ramp must be a number from 0 to 48 h';
  const values = { crops, farmType: form.farmType, flushes, days, rampH, autoAdvance: Boolean(form.autoAdvance) };
  if (form.lightHours) {
    values.lightHours = {};
    for (const stage of Object.keys(STAGES)) {
      const n = /^[0-9]{1,2}$/.test(String(form.lightHours[stage]).trim()) ? Number(form.lightHours[stage]) : NaN;
      if (!isLightHours(n)) errors[`lightHours.${stage}`] = 'Light hours must be a whole number from 0 to 24';
      values.lightHours[stage] = n;
    }
  }
  if (form.lightStart !== undefined) {
    const start = normaliseClock(form.lightStart); // "7:00" and "0700" are 07:00
    if (!isClock(start)) errors.lightStart = 'Light start must be a time like 07:00';
    values.lightStart = start;
  }
  return { values, errors };
}

const sameRows = (a, b) => a.length === b.length && a.every((r, i) => r.crop === b[i].crop && r.blocks === b[i].blocks);

// The body of Save with only what differs from the loaded view `c` (a Save of another field must not restart a done room):
// crops only when the rows changed, days only for the stages that changed. stage: for a room that had no crops, so its first
// crops start in the chosen stage. {} when nothing changed.
export function saveBody(values, c, stage) {
  const body = {};
  const crops = c?.crops ?? [];
  if (!sameRows(values.crops, crops)) body.crops = values.crops;
  if (values.farmType !== c?.farmType) body.farmType = values.farmType;
  if (values.flushes !== c?.flushes) body.flushes = values.flushes;
  const days = Object.fromEntries(Object.entries(values.days).filter(([s, n]) => n !== c?.days?.[s]));
  if (Object.keys(days).length) body.days = days;
  if (values.rampH !== c?.rampH) body.rampH = values.rampH;
  if (values.autoAdvance !== c?.autoAdvance) body.autoAdvance = values.autoAdvance;
  if (values.lightHours) {
    const hours = Object.fromEntries(Object.entries(values.lightHours).filter(([s, n]) => n !== c?.lightHours?.[s]));
    if (Object.keys(hours).length) body.lightHours = hours;
  }
  if (values.lightStart !== undefined && values.lightStart !== c?.lightStart) body.lightStart = values.lightStart;
  if (stage && crops.length === 0 && body.crops?.length) body.stage = stage;
  return body;
}

// New blocks in a done room: its rows, and newBlocks, so the room starts again at flush 1.
export const newBlocksBody = (values) => ({ crops: values.crops, newBlocks: true });

// The body of Start stage; applyNow skips the slow change of the bands.
export const startBody = (stage, applyNow) => (applyNow ? { stage, applyNow: true } : { stage });

// ---- the stage plan (spec 2026-10-26-crop-stage-plan-design.md) ----

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayOf = (ms) => { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const grouped = (n) => n.toLocaleString('en-US');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const shortName = (key) => (CROPS[key] ? CROPS[key].name.replace(/\s*\(.*\)$/, '') : key);
const hasFlush = (stage) => stage === 'fruiting' || stage === 'rest';

// The head of the card: { title: "Lion's mane · 950 blocks" or "Grey oyster 300 + Golden oyster 200 blocks", farm: the farm type }.
export function cropHeadline(c) {
  if (!hasCrops(c)) return { title: 'No crop set: the bands are set by hand', farm: '' };
  const title = c.crops.length === 1
    ? `${shortName(c.crops[0].crop)} · ${grouped(c.crops[0].blocks)} blocks`
    : `${c.crops.map((r) => `${shortName(r.crop)} ${grouped(r.blocks)}`).join(' + ')} blocks`;
  return { title, farm: FARM_TYPES[c.farmType]?.name ?? '' };
}

// "7 days"; fruiting "7 days × 4 flushes".
export function stageLength(c, stage) {
  const n = c?.days?.[stage];
  if (!Number.isFinite(n)) return '';
  const length = plural(n, 'day', 'days');
  return stage === 'fruiting' ? `${length} × ${plural(c.flushes, 'flush', 'flushes')}` : length;
}

// The mark of a stage section: { kind: 'current' | 'next' | '', text }: "Current · day 2 of 7 · flush 1 of 4",
// "Next · about 2 Nov 09:55" (or "Next · when you start it" without automatic change), "Current · flush 4 of 4 done".
export function stageMark(c, stage, now = Date.now()) {
  if (!hasCrops(c)) return { kind: '', text: '' };
  if (stage === c.stage) {
    if (c.done) return { kind: 'current', text: `Current · flush ${c.flushes} of ${c.flushes} done` };
    const parts = ['Current'];
    if (Number.isFinite(c.stageSince)) {
      const day = Math.max(1, Math.floor((now - c.stageSince) / DAY_MS) + 1);
      const length = c.days?.[stage];
      parts.push(c.autoAdvance && length ? `day ${Math.min(day, length)} of ${length}` : `day ${day}`);
    }
    if (hasFlush(stage)) parts.push(`flush ${c.flush} of ${c.flushes}`);
    return { kind: 'current', text: parts.join(' · ') };
  }
  const next = c.done ? null : c.nextStage ?? followingStage(c); // the server sends no next stage while automatic change is off
  if (next?.stage === stage) {
    return { kind: 'next', text: Number.isFinite(next.at) ? `Next · about ${formatDateTime(next.at)}` : 'Next · when you start it' };
  }
  return { kind: '', text: '' };
}

// The stage after the present one by the program's rules (server/program.js nextStage), without a time; null after the last rest.
function followingStage(c) {
  if (c.stage === 'spawn') return { stage: 'pinning', at: null };
  if (c.stage === 'pinning' || (c.stage === 'rest' && c.flush < c.flushes)) return { stage: 'fruiting', at: null };
  return c.stage === 'fruiting' ? { stage: 'rest', at: null } : null;
}

// The Stages list: the whole program of the farm type (spawn and pinning once, then fruiting and rest for every flush), each
// entry { key, stage, flush, name, state: 'done' | 'current' | 'next' | 'later', dates }. The entries before the current one
// are done, without dates; the current one "26 Oct → 2 Nov" (without automatic change "since 26 Oct", and no dates after it);
// the ones after follow on from its end. A done room: every entry done, then "Replace the blocks". [] without crops.
export function stagePlan(c, now = Date.now()) {
  if (!hasCrops(c)) return [];
  const entries = [];
  for (const stage of (FARM_TYPES[c.farmType] ?? FARM_TYPES.ready).stages) {
    if (!hasFlush(stage)) entries.push({ key: stage, stage, flush: null, name: STAGES[stage] });
  }
  for (let f = 1; f <= c.flushes; f++) {
    for (const stage of ['fruiting', 'rest']) entries.push({ key: `${stage}-${f}`, stage, flush: f, name: `${STAGES[stage]} · flush ${f}` });
  }
  const current = c.done ? entries.length : entries.findIndex((e) => e.stage === c.stage && (e.flush === null || e.flush === c.flush));
  let from = Number.isFinite(c.stageSince) ? c.stageSince : now;
  const out = entries.map((e, i) => {
    if (current < 0 || i < current) return { ...e, state: current < 0 ? 'later' : 'done', dates: '' };
    const state = i === current ? 'current' : i === current + 1 ? 'next' : 'later';
    if (!c.autoAdvance) return { ...e, state, dates: i === current ? `since ${dayOf(from)}` : '' };
    const to = from + c.days[e.stage] * DAY_MS;
    const dates = `${dayOf(from)} → ${dayOf(to)}`;
    from = to;
    return { ...e, state, dates };
  });
  if (c.done) out.push({ key: 'replace', stage: null, flush: null, name: 'Replace the blocks', state: 'current', dates: '' });
  return out;
}

// The Targets table of a stage for the crops: [{ key: 't' | 'rh' | 'co2' | 'safety' | 'light', name, value }], [] without
// crops. light: the stage's { hours, start } of the light schedule (none from an older server: no Light row).
export function stageTargets(crops, stage, light = null) {
  if (!Array.isArray(crops) || crops.length === 0) return [];
  const b = mixBands(crops, stage).bands;
  const rows = [
    { key: 't', name: 'Temperature', value: `${b.tLow}–${b.tHigh} °C` },
    { key: 'rh', name: 'Humidity', value: `${b.rhLow}–${b.rhHigh} %` },
    { key: 'co2', name: 'CO₂ kept between', value: `${grouped(b.co2Low)}–${grouped(b.co2High)} ppm` },
    { key: 'safety', name: 'CO₂ safety level', value: `${grouped(b.co2Safety)} ppm` },
  ];
  if (light && Number.isFinite(light.hours)) rows.push({ key: 'light', name: 'Light', value: lightRow(light.hours, light.start) });
  return rows;
}

// The light schedule of a stage from a reply: { hours, start }, or null from an older server without it.
export const lightOf = (c, stage) => (c?.lightHours && Number.isFinite(c.lightHours[stage]) ? { hours: c.lightHours[stage], start: c.lightStart } : null);

// The warnings of a stage for the crops, as the server words them: the mix, then the crops' good ranges (fruiting only).
export function stageWarnings(crops, stage) {
  if (!Array.isArray(crops) || crops.length === 0) return [];
  const mixed = mixBands(crops, stage);
  return [...mixed.warnings, ...rangeWarnings(crops, mixed.bands, stage)];
}

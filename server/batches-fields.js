// The Batches field rules shared by server/batches.js and server/batches-making.js (spec 2026-11-05-batches-design.md 2 and
// 3): the error a refusal throws, the number, time and text checks, a block's weight. No database.

import { localDate, dayStart } from './task-rules.js';

export const MAX_BLOCKS = 100_000;
export const MAX_TEXT = 80;
export const MAX_NOTE = 500;
export const EARLIEST = Date.UTC(2000, 0, 1);

export class BatchError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'BatchError';
    this.status = status;
    this.field = field;
  }
}

export const bad = (message, field) => new BatchError(400, message, field);
export const conflict = (message, field) => new BatchError(409, message, field);
export const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export const numIn = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
// A time: whole ms from 2000 to now.
export const isTime = (v, now) => Number.isInteger(v) && v >= EARLIEST && v <= now;
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(dayStart(s)) && localDate(dayStart(s)) === s;
export const grouped = (n) => n.toLocaleString('en-US');

// A text field: trimmed, at most max characters, no control characters (a note may hold line breaks); empty is null.
export function textOf(v, field, label, max = MAX_TEXT) {
  if (v === undefined || v === null) return null;
  const control = field === 'note' ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (typeof v !== 'string' || control.test(v)) throw bad(`${label} must be plain text`, field);
  const s = v.trim();
  if (s.length > max) throw bad(`${label} must be at most ${max} characters`, field);
  return s || null;
}

// A block's weight and water % (spec 2: both or neither); a field not in body keeps was's (an edit). → { blockKg, waterPct }.
export function weightOf(body, was = null) {
  const has = (k) => Object.hasOwn(body, k);
  const kg = has('blockKg') ? body.blockKg ?? null : was?.blockKg ?? null;
  const water = has('waterPct') ? body.waterPct ?? null : was?.waterPct ?? null;
  if (kg !== null && !numIn(kg, 0.2, 10)) throw bad('Block weight must be 0.2–10 kg, or empty', 'blockKg');
  if (water !== null && !numIn(water, 30, 80)) throw bad('Water must be 30–80 %, or empty', 'waterPct');
  if (kg === null && water !== null) throw bad('Give the block weight with the water %', 'blockKg');
  if (kg !== null && water === null) throw bad('Give the water % with the block weight', 'waterPct');
  return { blockKg: kg, waterPct: water };
}

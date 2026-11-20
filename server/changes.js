// The change log (spec 2026-11-12-data-integrity-design.md 3): who made a write (the signed-in person, else the app), the
// entry a store writes inside its write's transaction, a void's reason, and the log's reads for its routes. No HTTP.

import { HttpError } from './http-error.js';

// A write with no person (a test, a script, the app's own work).
export const APP = Object.freeze({ name: 'app', role: 'app' });

// Who made a request: { name, role } from its session, else APP.
export const whoOf = (req) => (req?.who ? { name: req.who.name, role: req.who.role } : APP);

// A who as the stores take it (a test's plain object, or none).
export const whoIs = (who) => (who && typeof who.name === 'string' && who.name ? { name: who.name, role: who.role ?? 'owner' } : APP);

// One entry for a write by `who` at `at` (ms): { kind, rowId, action, before?, after?, reason? }. Call it inside the write's
// db.transaction so the two commit together.
export function record(db, who, at, { kind, rowId, action, before = null, after = null, reason = null }) {
  const w = whoIs(who);
  return db.logChange({ at, by: w.name, role: w.role, kind, rowId, action, before, after, reason });
}

export const REASON_MIN = 3;
export const REASON_MAX = 200;

// A body's reason, trimmed: required (3–200 characters, else 400 on `field` with `words`), or optional (null when missing or
// empty). → the text, or null.
// Err: the module's error class (status, message, field), so its routes and tests see their own.
export function reasonOf(body, { required = true, field = 'reason', words = 'Say why, in a few words', Err = HttpError } = {}) {
  const v = body !== null && typeof body === 'object' ? body[field] : undefined;
  const t = typeof v === 'string' ? v.trim() : '';
  if (!t) {
    if (required) throw new Err(400, words, field);
    return null;
  }
  if (t.length < REASON_MIN || t.length > REASON_MAX) throw new Err(400, `${words} (3 to 200 characters)`, field);
  return t;
}

// What a void's reply says of it: null, or { at, by, reason } (a row as a store reads it, with voidedAt and its pair).
export const voidedOf = (row) => (row?.voidedAt === null || row?.voidedAt === undefined ? null
  : { at: row.voidedAt, by: row.voidedBy, reason: row.voidReason });

// The Undo window (section 4.3): a record may be deleted within 60 s of its `add` entry by the same person.
export const UNDO_MS = 60_000;
export function undoAllowed(db, kind, rowId, who, now) {
  const add = db.addOf(kind, rowId);
  return add !== null && add.by === whoIs(who).name && now - add.at <= UNDO_MS;
}

// Shared helpers for server/db.js and tests/fakes/db.js (C1 section 5.1).
'use strict';

class NotFoundError extends Error {
  constructor(what, id) {
    super(`Unknown ${what} ${id}`);
    this.name = 'NotFoundError';
    this.code = 'NOT_FOUND';
    this.what = what;
    this.id = id;
  }
}

function toJson(value) {
  return JSON.stringify(value, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? { $num: String(v) } : v));
}

function fromJson(text) {
  return JSON.parse(text, (k, v) =>
    v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.$num === 'string'
      ? Number(v.$num)
      : v
  );
}

module.exports = { NotFoundError, toJson, fromJson };

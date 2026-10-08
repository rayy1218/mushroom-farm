// Shared helpers for server/rooms.js and tests/fakes/rooms.js (C2 sections 6.2, 6.3). Loads nothing.
'use strict';

class RoomError extends Error {
  constructor(code, message, details = []) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
    this.details = details;
  }
}

const DEMO_ROOM = Object.freeze({ name: 'Room 1', volume: 60, vent: 'supply' });
const FIRST_NOTE = 'Created';

function isPlainObject(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

const BANNED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

// Deep copy of a trusted value (the base): no filtering, no warnings.
function deepCopy(v) {
  if (Array.isArray(v)) return v.map(deepCopy);
  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) out[k] = deepCopy(v[k]);
    return out;
  }
  return v;
}

// Deep copy of an untrusted value, dropping __proto__/constructor/prototype keys at any depth (inside arrays too)
// and recording a warning for each one, named by its dot path.
function cleanCopy(v, path, warnings) {
  if (Array.isArray(v)) return v.map((item, i) => cleanCopy(item, path ? `${path}.${i}` : String(i), warnings));
  if (isPlainObject(v)) {
    const out = {};
    for (const k of Object.keys(v)) {
      const key = path ? `${path}.${k}` : k;
      if (BANNED_KEYS.has(k)) { warnings.push(`Setting "${key}" is not allowed: ignored.`); continue; }
      out[k] = cleanCopy(v[k], key, warnings);
    }
    return out;
  }
  return v;
}

// Lays the cleaned src over dst (a deep copy of the base) key by key, dropping banned keys with a warning.
function mergeInto(dst, src, path, warnings) {
  for (const k of Object.keys(src)) {
    const key = path ? `${path}.${k}` : k;
    if (BANNED_KEYS.has(k)) { warnings.push(`Setting "${key}" is not allowed: ignored.`); continue; }
    const val = src[k];
    if (isPlainObject(val) && isPlainObject(dst[k])) mergeInto(dst[k], val, key, warnings);
    else dst[k] = cleanCopy(val, key, warnings);
  }
}

function cleanSettings(settings, base = {}) {
  const warnings = [];
  const result = deepCopy(base);
  mergeInto(result, settings, '', warnings);
  return { settings: result, warnings };
}

module.exports = { RoomError, DEMO_ROOM, FIRST_NOTE, cleanSettings };

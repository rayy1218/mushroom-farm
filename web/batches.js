// web/batches.js: the Batches pages (docs/contracts/harvest.md 12.3).
(function (global) {
'use strict';

let alive = false;

const OFFSET = 8 * 3600;
const TEXT = ['strain', 'source', 'notes'];
const NUM = ['block_count', 'block_wet_kg', 'moisture_pct', 'flush_gap_days'];
const DATE = ['spawn_date', 'received_at'];

// Farm dates (UTC+8) whatever the browser's time zone (lead decision 67).
function dateToSeconds(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof text === 'string' ? text : '');
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Date.UTC(y, mo - 1, d) / 1000 - OFFSET;
}
function secondsToDate(t) {
  const d = new Date((t + OFFSET) * 1000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}
const ageDays = (from, now) => Math.floor((now - from) / 86400);

// form: { edit, fields }. An empty value is left out on create and sent as null on edit.
function batchBody({ edit, fields }) {
  const body = {};
  for (const k of Object.keys(fields)) {
    if (k === 'crop') { body.crop = fields.crop; continue; }
    const text = String(fields[k]).trim();
    if (text === '') { if (edit) body[k] = null; continue; }
    if (TEXT.includes(k)) body[k] = text;
    else if (NUM.includes(k)) body[k] = Number.isFinite(Number(text)) ? Number(text) : text;
    else if (DATE.includes(k)) body[k] = dateToSeconds(text) ?? text;
  }
  return body;
}

function mount(el, params) { alive = true; }
function unmount() { alive = false; }

global.FarmShell.register('batches', { mount, unmount });

if (typeof module === 'object' && module && module.exports) module.exports = { dateToSeconds, secondsToDate, ageDays, batchBody };
})(typeof window !== 'undefined' ? window : globalThis);

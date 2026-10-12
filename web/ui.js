// web/ui.js: formatting and small DOM helpers moved from the old dashboard script (docs/contracts/web.md section 5).
(function (global) {
'use strict';

const NS = 'http://www.w3.org/2000/svg';

function set(id, text) {
  const e = (typeof document !== 'undefined') ? document.getElementById(id) : null;
  if (e && e.textContent !== text) e.textContent = text;
}
function cell(tag, text) { const e = document.createElement(tag); e.textContent = text; return e; }
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function paintChip(el, chip) {
  el.dataset.lvl = chip.lvl;
  if (el.dataset.txt === chip.text && el.dataset.ico === chip.icon) return;
  el.dataset.txt = chip.text; el.dataset.ico = chip.icon;
  const i = document.createElement('span'); i.className = 'ico'; i.textContent = chip.icon; i.setAttribute('aria-hidden', 'true');
  const t = document.createElement('span'); t.textContent = chip.text;
  el.replaceChildren(i, t);
}
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fmtNum = (x, d) => (x != null && Number.isFinite(x) ? x.toFixed(d) : '—');
const fmtDur = s => (s < 3600 ? `${Math.floor(s / 60)} min` : `${(s / 3600).toFixed(1)} h`);
const pad2 = n => String(n).padStart(2, '0');
const fmtMinSec = s => `${Math.floor(s / 60)}:${pad2(Math.round(s % 60))}`;
const watts = w => (w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`);
const pct = f => `${Math.round(f * 100)} %`;
const nf = n => Math.round(n).toLocaleString('en');

const ICON = { critical: '◆', serious: '▲', warning: '▲', good: '✓', info: '•' };
const LVL_RANK = { critical: 3, serious: 2, warning: 1 };

// A simulation clock: t is seconds since the start of the run. startHour is when the run began (room time).
function simClock(startHour) {
  const offset = startHour * 3600;
  function parts(t) {
    const a = Math.floor(offset + t);
    return { day: Math.floor(a / 86400) + 1, h: Math.floor((a % 86400) / 3600), m: Math.floor((a % 3600) / 60), s: a % 60 };
  }
  return {
    offset,
    hm: t => { const c = parts(t); return `${pad2(c.h)}:${pad2(c.m)}`; },
    stamp: t => { const c = parts(t); return `D${c.day} ${pad2(c.h)}:${pad2(c.m)}:${pad2(c.s)}`; },
    label: t => { const c = parts(t); return `Day ${c.day} · ${pad2(c.h)}:${pad2(c.m)}`; },
  };
}

// Farm (Malaysia, UTC+8, no DST) clock: t is Unix time. UTC getters stand in for a UTC+8 time zone.
function farmClock() {
  const offset = 28800;
  const at = t => new Date((t + offset) * 1000);
  const ymd = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const hms = d => `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  const hm = d => `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}`;
  return {
    offset,
    hm: t => hm(at(t)),
    stamp: t => `${ymd(at(t))} ${hms(at(t))}`,
    label: t => `${ymd(at(t))} ${hm(at(t))}`,
  };
}

function errorText(err) {
  if (err && err.name === 'ApiError') {
    if (!(err.details && err.details.length)) return err.error;
    return `${err.error}${/[.!?]$/.test(err.error) ? ' ' : ': '}${err.details.join('; ')}`;
  }
  return err.message;
}

// C11 3.2: a message next to the action that caused it. lvl 'info', 'good' or 'error'; an empty text hides the box.
function say(el, lvl, text) {
  if (!el) return;
  el.classList.add('alert');
  el.dataset.lvl = lvl;
  el.textContent = text || '';
  el.hidden = !text;
}

// C11 3.3: an error in plain words. labels maps an API field key to the field's label on the page.
// Returns { text, fields }: fields[key] is the line shown under that field; text is the line for the alert.
function problemText(problem) {
  const p = String(problem).trim();
  if (p === 'required') return 'Fill this in.';
  const s = p.charAt(0).toUpperCase() + p.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}
function plainError(err, labels) {
  const map = labels || {};
  const fields = {};
  const rest = [];
  if (err && err.name === 'ApiError' && err.details && err.details.length) {
    for (const d of err.details) {
      // 'key: problem' (C10 details) or 'key problem' (C3 room details: 'name must be 1 to 60 characters')
      const m = /^([a-z_][a-z0-9_.]*): (.+)$/i.exec(String(d)) || /^([a-z_][a-z0-9_]*) (.+)$/i.exec(String(d));
      if (m && Object.hasOwn(map, m[1])) fields[m[1]] = problemText(m[2]);
      else rest.push(String(d));
    }
    const n = Object.keys(fields).length;
    if (n && !rest.length) return { text: n === 1 ? 'Check the marked field.' : 'Check the marked fields.', fields };
    if (n) return { text: `Check the marked fields. Also: ${rest.join('; ')}`, fields };
  }
  return { text: err ? errorText(err) : '', fields };
}

// C11 3.3: shows plainError's field lines under their fields (.field[data-field]) and clears the others.
function markFields(root, fields) {
  if (!root) return;
  const f = fields || {};
  root.querySelectorAll('.field[data-field]').forEach(box => {
    const msg = f[box.dataset.field] || '';
    let err = box.querySelector('.field-err');
    if (!err && msg) { err = document.createElement('p'); err.className = 'field-err'; box.append(err); }
    if (err) { err.textContent = msg; err.hidden = !msg; }
    box.querySelectorAll('input, select, textarea').forEach(c => {
      if (msg) c.setAttribute('aria-invalid', 'true'); else c.removeAttribute('aria-invalid');
    });
  });
}

global.FarmUi = { set, cell, svgEl, paintChip, clamp, fmtNum, fmtDur, fmtMinSec, watts, pct, nf, ICON, LVL_RANK, simClock, farmClock, errorText,
  say, plainError, markFields };
})(typeof window !== 'undefined' ? window : globalThis);

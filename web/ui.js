// web/ui.js: formatting and small DOM helpers moved from app.js (docs/contracts/web.md section 5).
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
    return (err.details && err.details.length) ? `${err.error}: ${err.details.join('; ')}` : err.error;
  }
  return err.message;
}

global.FarmUi = { set, cell, svgEl, paintChip, clamp, fmtNum, fmtDur, fmtMinSec, watts, pct, nf, ICON, LVL_RANK, simClock, farmClock, errorText };
})(typeof window !== 'undefined' ? window : globalThis);

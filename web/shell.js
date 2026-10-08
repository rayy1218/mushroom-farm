// web/shell.js: menu, routing, settings level, theme (docs/contracts/web.md section 2).
(function (global) {
'use strict';

const registry = {};
let current = null; // { name, params, module }
const MENU_NAMES = { rooms: 'Rooms', simulator: 'Simulator', capacity: 'Capacity', calibration: 'Calibration' };
const ROOM_ID_RE = /^[1-9][0-9]{0,14}$/;

// Parses location.hash into { name, params } (2.1), or null for an unknown hash (redirect to the default route).
function parseHash(hash) {
  let h = hash || '';
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length > 1 && h.endsWith('/')) h = h.slice(0, -1);
  if (h === '') return null;
  const parts = h.split('/').filter(Boolean);
  if (parts.length === 1) {
    const name = parts[0];
    if (name === 'rooms' || name === 'simulator' || name === 'capacity' || name === 'calibration') return { name, params: {} };
    return null;
  }
  if (parts.length === 2 && parts[0] === 'rooms' && ROOM_ID_RE.test(parts[1])) return { name: 'rooms', params: { id: Number(parts[1]) } };
  return null;
}
function paramsEqual(a, b) {
  const ak = Object.keys(a), bk = Object.keys(b);
  return ak.length === bk.length && ak.every(k => a[k] === b[k]);
}
function showNotice(view, text) {
  view.replaceChildren();
  const p = document.createElement('p'); p.className = 'est-note'; p.textContent = text;
  view.append(p);
}

function route() {
  const parsed = parseHash(location.hash);
  if (!parsed) { location.replace('#/rooms'); return; }
  const { name, params } = parsed;
  if (current && current.name === name && paramsEqual(current.params, params)) return;
  if (current && current.module) {
    try { current.module.unmount(); } catch (err) { console.error(err); }
  }
  const view = document.getElementById('view');
  view.replaceChildren();
  for (const attr of Array.from(view.attributes)) { if (attr.name !== 'id') view.removeAttribute(attr.name); }
  document.querySelectorAll('#menu a').forEach(a => {
    if (a.dataset.module === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${MENU_NAMES[name]} · Mushroom farm`;
  const module = registry[name];
  current = { name, params, module };
  if (!module) { showNotice(view, 'This part of the app is not installed.'); return; }
  try {
    const result = module.mount(view, params);
    if (result && typeof result.catch === 'function') {
      result.catch(err => { console.error(err); showNotice(view, `This page could not be opened: ${err && err.message}`); });
    }
  } catch (err) {
    console.error(err);
    showNotice(view, `This page could not be opened: ${err && err.message}`);
  }
}

function register(name, module) { registry[name] = module; }

function initLevel() {
  const levelSeg = document.getElementById('levelSeg');
  document.body.dataset.level = 'farmer';
  levelSeg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.level === 'farmer')));
  levelSeg.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const level = b.dataset.level;
    document.body.dataset.level = level;
    levelSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    document.dispatchEvent(new CustomEvent('farm-level', { detail: { level } }));
  });
}
function initTheme() {
  const themeBtn = document.getElementById('themeBtn');
  const isDark = () => (document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches);
  const syncThemeBtn = () => { themeBtn.textContent = isDark() ? 'Light theme' : 'Dark theme'; };
  themeBtn.addEventListener('click', () => { document.documentElement.dataset.theme = isDark() ? 'light' : 'dark'; syncThemeBtn(); });
  syncThemeBtn();
}
function init() {
  initLevel();
  initTheme();
  route();
}

const FarmShell = {
  register,
  get level() { return document.body.dataset.level; },
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
  global.addEventListener('hashchange', route);
}

global.FarmShell = FarmShell;
})(typeof window !== 'undefined' ? window : globalThis);

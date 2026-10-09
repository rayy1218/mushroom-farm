// web/shell.js: menu, routing, settings level, theme (docs/contracts/web.md section 2).
(function (global) {
'use strict';

const registry = {};
let current = null; // { name, params, module }
const MENU_NAMES = Object.freeze({ rooms: 'Rooms', simulator: 'Test bench', batches: 'Batches', harvest: 'Harvest' });
const ROOM_ID_RE = /^[1-9][0-9]{0,14}$/;
const TABS = ['live', 'simulate', 'calibrate']; // the names of FarmRoomTabs.NAMES (C5 3.9); not read here so the file loads alone in Node
const isId = s => ROOM_ID_RE.test(s);

// Parses location.hash into { name, params } (C5 2.1, C10 11), { redirect } for '#/rooms/:id', or null (redirect to the default route).
// The hash must start with '#/': a missing leading slash ('#rooms') or an empty segment ('#//simulator',
// '#/rooms//3') is "anything else" and does not route.
function parseHash(hash) {
  let h = hash || '';
  if (!h.startsWith('#/')) return null;
  h = h.slice(1);
  if (h.length > 1 && h.endsWith('/')) h = h.slice(0, -1);
  const parts = h.split('/'); // h starts with '/', so parts[0] is always ''
  parts.shift();
  const [name, a, b, c] = parts;
  if (parts.some(x => x === '')) return null;
  const n = parts.length;
  if (name === 'rooms') {
    if (n === 1) return { name, params: {} };
    if (!isId(a)) return null;
    const id = Number(a);
    if (n === 2) return { redirect: `#/rooms/${id}/live` };
    if (!TABS.includes(b)) return null;
    if (n === 3) return { name, params: { id, tab: b } };
    if (n === 4 && b === 'calibrate' && isId(c)) return { name, params: { id, tab: b, runId: Number(c) } };
    return null;
  }
  if (name === 'simulator') {
    if (n === 1) return { name, params: {} };
    return n === 2 && isId(a) ? { name, params: { roomId: Number(a) } } : null;
  }
  if (name === 'batches') {
    if (n === 1) return { name, params: {} };
    return n === 2 && isId(a) ? { name, params: { id: Number(a) } } : null;
  }
  if (name === 'harvest' && n === 2) {
    if (a === 'stickers') return { name, params: { view: 'stickers' } };
    return isId(a) ? { name, params: { view: 'record', id: Number(a) } } : null;
  }
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

// Step 5: menu marking, title and the bare layout (lead decision 66). The shell owns body[data-layout].
function menuLink(parsed) {
  if (parsed.name !== 'harvest') return parsed.name;
  return parsed.params.view === 'stickers' ? 'batches' : null;
}
function applyChrome(parsed) {
  const link = menuLink(parsed);
  document.querySelectorAll('#menu a').forEach(a => {
    if (link && a.dataset.module === link) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${MENU_NAMES[parsed.name]} · Mushroom farm`;
  if (parsed.name === 'harvest' && parsed.params.view === 'record') document.body.dataset.layout = 'bare';
  else delete document.body.dataset.layout;
}

function route() {
  const parsed = parseHash(location.hash);
  if (!parsed) { location.replace('#/rooms'); return; }
  if (parsed.redirect) { location.replace(parsed.redirect); return; }
  const { name, params } = parsed;
  if (current && current.name === name && paramsEqual(current.params, params)) return;
  if (current && current.name === name && current.module && typeof current.module.update === 'function') {
    let kept = false;
    try { kept = current.module.update(params) === true; } catch (err) { console.error(err); }
    if (kept) { current.params = params; applyChrome(parsed); return; }
  }
  if (current && current.module) {
    try { current.module.unmount(); } catch (err) { console.error(err); }
  }
  const view = document.getElementById('view');
  view.replaceChildren();
  for (const attr of Array.from(view.attributes)) { if (attr.name !== 'id') view.removeAttribute(attr.name); }
  applyChrome(parsed);
  const module = registry[name];
  const token = current = { name, params, module };
  if (!module) { showNotice(view, 'This part of the app is not installed.'); return; }
  try {
    const result = module.mount(view, params);
    if (result && typeof result.catch === 'function') {
      result.catch(err => {
        console.error(err);
        if (current !== token) return; // the user moved on: do not touch the new module's view
        showNotice(view, `This page could not be opened: ${err && err.message}`);
      });
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
  MENU_NAMES,
  parseHash,
  get level() { return document.body.dataset.level; },
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
  global.addEventListener('hashchange', route);
}

global.FarmShell = FarmShell;
})(typeof window !== 'undefined' ? window : globalThis);

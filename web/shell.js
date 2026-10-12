// web/shell.js: menu, routing, settings level, theme (docs/contracts/web.md section 2).
(function (global) {
'use strict';

const registry = {};
let current = null; // { name, params, module }
let guard = null;    // C11 3.1: () => string; a non-empty string means "this page has unsaved work"
let shownHash = '';  // the hash of the page on screen, to go back to when the user stays
let skipHash = null; // the hash put back by a refused leave: its hashchange is ignored once
const MENU_NAMES = Object.freeze({ overview: 'Overview', rooms: 'Rooms', simulator: 'Test bench', batches: 'Batches', harvest: 'Harvest', settings: 'Settings' });
const DEFAULT_ROUTE = '#/overview'; // C12 2.1
const LEVEL_KEY = 'mushroom-farm.level'; // C12 2.3
const THEME_KEY = 'mushroom-farm.theme'; // C12 3.1
const ROOM_ID_RE = /^[1-9][0-9]{0,14}$/;
const TABS = ['overview', 'settings', 'simulate', 'calibrate']; // the names of FarmRoomTabs.NAMES (C12 2.2); not read here so the file loads alone in Node
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
    if (n === 2) return { redirect: `#/rooms/${id}/overview` };
    if (b === 'live' && n === 3) return { redirect: `#/rooms/${id}/overview` }; // C12 2.2: old links
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
  if (name === 'harvest') {
    if (n === 1) return { name, params: { view: 'today' } }; // C12 2.1
    if (n !== 2) return null;
    if (a === 'stickers') return { name, params: { view: 'stickers' } };
    return isId(a) ? { name, params: { view: 'record', id: Number(a) } } : null;
  }
  if ((name === 'overview' || name === 'settings') && n === 1) return { name, params: {} }; // C12 2.1
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
  return parsed.params.view === 'record' ? null : 'harvest'; // C12 2.1: Harvest has its own menu entry
}
function applyChrome(parsed) {
  const link = menuLink(parsed);
  document.querySelectorAll('#menu a, #tabbar a').forEach(a => {
    if (link && a.dataset.module === link) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.title = `${MENU_NAMES[parsed.name]} · Mushroom farm`;
  if (parsed.name === 'harvest' && parsed.params.view === 'record') document.body.dataset.layout = 'bare';
  else delete document.body.dataset.layout;
}

// C11 3.1: asks before leaving a page with unsaved work. true = go on, false = stay.
function mayLeave() {
  let why = '';
  try { why = guard ? String(guard() || '') : ''; } catch (err) { console.error(err); }
  if (!why) return true;
  return global.confirm(`${why}\n\nLeave this page and lose them?`);
}
function guardLeave(fn) { guard = typeof fn === 'function' ? fn : null; }
function scrollTop() { if (typeof global.scrollTo === 'function') global.scrollTo(0, 0); }

function route() {
  if (skipHash !== null && location.hash === skipHash) { skipHash = null; return; }
  skipHash = null;
  const parsed = parseHash(location.hash);
  if (!parsed) { location.replace(DEFAULT_ROUTE); return; }
  if (parsed.redirect) { location.replace(parsed.redirect); return; }
  const { name, params } = parsed;
  if (current && current.name === name && paramsEqual(current.params, params)) return;
  if (current && !mayLeave()) { skipHash = shownHash; location.replace(shownHash); return; }
  guard = null;
  shownHash = location.hash;
  scrollTop();
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

// C12 2.3: the settings level is kept in this browser; the Settings page and the side bar switch it with setLevel.
function readLevel() {
  try { return global.localStorage && global.localStorage.getItem(LEVEL_KEY) === 'installer' ? 'installer' : 'farmer'; } catch { return 'farmer'; }
}
function paintLevel(level) {
  document.body.dataset.level = level;
  document.querySelectorAll('[data-level-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.levelBtn === level)));
}
function setLevel(level) {
  const lv = level === 'installer' ? 'installer' : 'farmer';
  if (document.body.dataset.level === lv) return;
  try { if (global.localStorage) global.localStorage.setItem(LEVEL_KEY, lv); } catch { /* private mode: not kept */ }
  paintLevel(lv);
  document.dispatchEvent(new CustomEvent('farm-level', { detail: { level: lv } }));
}
function initLevel() {
  paintLevel(readLevel());
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-level-btn]');
    if (b) setLevel(b.dataset.levelBtn);
  });
}
// C12 3.1: the theme is kept in this browser; absent = follow the device.
function readTheme() {
  try { const t = global.localStorage && global.localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : 'device'; } catch { return 'device'; }
}
function paintTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme; else delete root.dataset.theme;
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = isDark() ? 'Light theme' : 'Dark theme';
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeBtn === theme)));
}
function isDark() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
}
function setTheme(theme) {
  const t = theme === 'light' || theme === 'dark' ? theme : 'device';
  try {
    if (global.localStorage) { if (t === 'device') global.localStorage.removeItem(THEME_KEY); else global.localStorage.setItem(THEME_KEY, t); }
  } catch { /* private mode: not kept */ }
  paintTheme(t);
}
function initTheme() {
  paintTheme(readTheme());
  const btn = document.getElementById('themeBtn');
  if (btn) btn.addEventListener('click', () => setTheme(isDark() ? 'light' : 'dark'));
}

// C12 3.1: the farm status chip. Pure: rooms are the listRooms() rows. Returns { chip, sim }; chip is null with no rooms.
function farmStatus(rooms) {
  const list = Array.isArray(rooms) ? rooms : [];
  if (!list.length) return { chip: null, sim: false };
  const ui = global.FarmUi;
  let stopped = 0, alarms = 0, check = 0;
  for (const r of list) {
    const st = ui.roomStatus(r);
    if (st.text === 'Stopped') stopped++;
    else if (st.text === 'Check room') check++;
    else if (r.live && r.live.alarms > 0) alarms += r.live.alarms;
  }
  const sim = list.every(r => r.adapter === 'sim');
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  if (stopped) return { chip: { lvl: 'serious', icon: ui.ICON.serious, text: `${stopped} stopped` }, sim };
  if (alarms) return { chip: { lvl: 'warning', icon: ui.ICON.warning, text: plural(alarms, 'alarm', 'alarms') }, sim };
  if (check) return { chip: { lvl: 'warning', icon: ui.ICON.warning, text: plural(check, 'room to check', 'rooms to check') }, sim };
  return { chip: { lvl: 'good', icon: ui.ICON.good, text: 'All rooms OK' }, sim };
}
let statusTimer = null;
async function refreshStatus() {
  const chipEl = document.getElementById('farmStatus'), simEl = document.getElementById('farmSim');
  if (!chipEl || !global.FarmApi || !global.FarmUi) return;
  let rooms;
  try { rooms = await global.FarmApi.listRooms(); } catch { return; } // keep the last chips
  const { chip, sim } = farmStatus(rooms);
  if (chip) global.FarmUi.paintChip(chipEl, chip);
  chipEl.hidden = !chip;
  if (simEl) simEl.hidden = !sim;
}
function initStatus() {
  refreshStatus();
  statusTimer = setInterval(refreshStatus, 30000);
}
function init() {
  initLevel();
  initTheme();
  initStatus();
  route();
}

const FarmShell = {
  register,
  guardLeave,
  setLevel,
  setTheme,
  farmStatus,
  DEFAULT_ROUTE,
  MENU_NAMES,
  parseHash,
  get theme() { return readTheme(); },
  get level() { return document.body.dataset.level; },
};

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
  global.addEventListener('hashchange', route);
  global.addEventListener('beforeunload', e => {
    let why = '';
    try { why = guard ? String(guard() || '') : ''; } catch { why = ''; }
    if (why) { e.preventDefault(); e.returnValue = why; }
  });
}

global.FarmShell = FarmShell;
})(typeof window !== 'undefined' ? window : globalThis);

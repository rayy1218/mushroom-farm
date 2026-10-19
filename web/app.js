// The shell: theme, hash router, and mounting pages into <main id="view">.
// A page is { mount(container, params) → unmount() }.

import { parseRoute, isCanonical } from './route.js';
import * as list from './rooms-list.js';
import * as detail from './room-detail.js';
import * as settings from './settings-page.js';
import * as overview from './overview.js';
import { loadBadge } from './overview-data.js';
import { withTitlePrefix } from './overview-math.js';

const view = document.getElementById('view');
const menuLinks = {
  overview: document.querySelectorAll('[data-nav="overview"]'),
  list: document.querySelectorAll('[data-nav="rooms"]'),
  settings: document.querySelectorAll('[data-nav="settings"]'),
};

let unmount = null;
let shown = false;

function show() {
  if (!isCanonical(location.hash)) {
    const route = parseRoute(location.hash);
    // Tidy an empty or unknown hash without adding a history entry.
    history.replaceState(null, '', route.name === 'detail' ? `#/rooms/${route.id}` : route.name === 'settings' ? '#/settings'
      : route.name === 'list' ? '#/rooms' : '#/overview');
  }
  const route = parseRoute(location.hash);
  unmount?.();
  view.replaceChildren();
  unmount = route.name === 'detail' ? detail.mount(view, { id: route.id })
    : route.name === 'settings' ? settings.mount(view, {})
    : route.name === 'list' ? list.mount(view, {})
    : overview.mount(view, {});
  // The Rooms entry stays current on a room's page.
  const section = route.name === 'settings' ? 'settings' : route.name === 'overview' ? 'overview' : 'list';
  for (const [name, links] of Object.entries(menuLinks)) {
    for (const a of links) {
      if (name === section) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
  }
  // After a navigation (not the first paint) move focus to the new page's heading.
  if (shown) view.querySelector('h1')?.focus({ preventScroll: true });
  else shown = true;
  window.scrollTo(0, 0);
}

// Theme: dark by default; the choice is kept in this browser. index.html applies it before first paint.
const THEME_COLOURS = { dark: '#1c1f22', light: '#f4f5f6' }; // each theme's --surface
const themeButtons = document.querySelectorAll('.theme-btn');

function currentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function showTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const next = theme === 'dark' ? 'light' : 'dark';
  for (const b of themeButtons) {
    b.textContent = next === 'light' ? 'Light mode' : 'Dark mode';
    b.setAttribute('aria-label', `Switch to ${next} mode`);
  }
  document.querySelector('meta[name="theme-color"]').setAttribute('content', THEME_COLOURS[theme]);
}

for (const b of themeButtons) {
  b.addEventListener('click', () => {
    const theme = currentTheme() === 'dark' ? 'light' : 'dark';
    showTheme(theme);
    try { localStorage.setItem('farm.theme', theme); } catch { /* not kept */ }
  });
}

showTheme(currentTheme());

// "Skip to content" must not change the hash (the router would redirect to the list).
document.querySelector('[data-skip]').addEventListener('click', (e) => {
  e.preventDefault();
  view.focus();
});

// The alarm badge on the Overview entry and "(2) " in front of the page title: the number of active, unacknowledged
// alarms, asked every 30 s (and again when the page changes, so an Acknowledge shows at once).
const BADGE_MS = 30_000;
const titleNode = document.querySelector('title');
let badge = 0;

function showBadge() {
  for (const el of document.querySelectorAll('[data-badge]')) {
    el.textContent = String(badge);
    el.hidden = badge === 0;
  }
  const next = withTitlePrefix(document.title, badge);
  if (next !== document.title) document.title = next; // pages set their own title: the observer below puts the prefix back
}

async function refreshBadge() {
  const count = await loadBadge();
  if (count === null) return; // the server did not answer: keep the last number
  badge = count;
  showBadge();
}

new MutationObserver(showBadge).observe(titleNode, { childList: true });
setInterval(refreshBadge, BADGE_MS);

window.addEventListener('hashchange', () => { show(); refreshBadge(); });
show();
refreshBadge();

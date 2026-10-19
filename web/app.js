// The shell: theme, hash router, and mounting pages into <main id="view">.
// A page is { mount(container, params) → unmount() }.

import { parseRoute, isCanonical } from './route.js';
import * as list from './rooms-list.js';
import * as detail from './room-detail.js';
import * as settings from './settings-page.js';

const view = document.getElementById('view');
const menuLinks = {
  list: document.querySelectorAll('[data-nav="rooms"]'),
  settings: document.querySelectorAll('[data-nav="settings"]'),
};

let unmount = null;
let shown = false;

function show() {
  if (!isCanonical(location.hash)) {
    const route = parseRoute(location.hash);
    // Tidy an empty or unknown hash without adding a history entry.
    history.replaceState(null, '', route.name === 'detail' ? `#/rooms/${route.id}` : route.name === 'settings' ? '#/settings' : '#/rooms');
  }
  const route = parseRoute(location.hash);
  unmount?.();
  view.replaceChildren();
  unmount = route.name === 'detail' ? detail.mount(view, { id: route.id })
    : route.name === 'settings' ? settings.mount(view, {})
    : list.mount(view, {});
  // The Rooms entry stays current on a room's page.
  const section = route.name === 'settings' ? 'settings' : 'list';
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

window.addEventListener('hashchange', show);
show();

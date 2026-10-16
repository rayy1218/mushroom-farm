// The shell: theme, hash router, and mounting pages into <main id="view">.
// A page is { mount(container, params) → unmount() }.

import { parseRoute, isCanonical } from './route.js';
import * as list from './rooms-list.js';
import * as detail from './room-detail.js';

const view = document.getElementById('view');
const menuRooms = document.getElementById('menu-rooms');

let unmount = null;
let shown = false;

function show() {
  if (!isCanonical(location.hash)) {
    const route = parseRoute(location.hash);
    // Tidy an empty or unknown hash without adding a history entry.
    history.replaceState(null, '', route.name === 'detail' ? `#/rooms/${route.id}` : '#/rooms');
  }
  const route = parseRoute(location.hash);
  unmount?.();
  view.replaceChildren();
  unmount = route.name === 'detail' ? detail.mount(view, { id: route.id }) : list.mount(view, {});
  menuRooms.setAttribute('aria-current', 'page');
  // After a navigation (not the first paint) move focus to the new page's heading.
  if (shown) view.querySelector('h1')?.focus({ preventScroll: true });
  else shown = true;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', show);
show();

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
  document.dispatchEvent(new CustomEvent('farm-theme')); // charts read colours from the tokens
}

for (const b of themeButtons) {
  b.addEventListener('click', () => {
    const theme = currentTheme() === 'dark' ? 'light' : 'dark';
    showTheme(theme);
    try { localStorage.setItem('farm.theme', theme); } catch { /* not kept */ }
  });
}

showTheme(currentTheme());

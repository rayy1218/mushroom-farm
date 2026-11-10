// The page's entry (spec 2026-11-06-login-design.md 6): who is signed in first; nobody, the sign-in view, then the app.
// The app (app.js) opens the live stream as it loads, so it is loaded only once someone is signed in. window.farmReady is
// set only once the app or the sign-in view is really up; when something here fails index.html's "Couldn't load" (#load-fail)
// is shown at once, not after its 8 s timer. Once boot.js runs (window.farmBooting) that timer stands down: over a slow link
// (Tailscale Funnel) the app's hundred-odd files can take longer than 8 s, and a real failure is shown here instead.

import { request, routeMissing, OUTDATED } from './api.js';
import { setMe } from './session.js';
import * as login from './login.js';
import { landing, failText, NOT_KEPT } from './login-math.js';
import './theme.js'; // the theme button works on the sign-in view too

const root = document.documentElement;
const SLOW_MS = 90_000; // the app not up after this long: say so (an import that never settles)
window.farmBooting = true;

// The page's "Couldn't load" now (its Reload button reloads); text: the words to show instead of the usual ones.
function showLoadFail(text) {
  const box = document.getElementById('load-fail');
  if (text) box.querySelector('p').textContent = text;
  box.hidden = false;
  document.getElementById('load-fail-reload').addEventListener('click', () => location.reload(), { once: true });
}

// While signed out the brand is not a link (its Overview is not there yet): no address, no name of its own, out of the Tab order.
const brand = document.querySelector('.brand-top');
const brandLink = { href: brand?.getAttribute('href'), label: brand?.getAttribute('aria-label') };
function brandIsLink(on) {
  if (!brand) return;
  for (const [attr, value] of [['href', brandLink.href], ['aria-label', brandLink.label]]) {
    if (on && value) brand.setAttribute(attr, value);
    else brand.removeAttribute(attr);
  }
}

async function open(who) {
  setMe(who);
  root.dataset.booting = ''; // the top bar's links stay hidden until app.js has made them the role's (index.html starts so)
  delete root.dataset.signin;
  brandIsLink(true);
  const slow = setTimeout(() => { if (!window.farmReady) showLoadFail(); }, SLOW_MS);
  try {
    await import('./app.js'); // app.js sets window.farmReady itself when it is up
  } finally {
    clearTimeout(slow);
  }
}

async function start() {
  let who = null;
  try {
    who = await request('GET', '/api/session');
  } catch (err) {
    if (err.status !== 401) return showLoadFail(routeMissing(err) ? OUTDATED : null);
  }
  if (who) return open(who).catch(() => showLoadFail());
  root.dataset.signin = '';
  delete root.dataset.booting;
  brandIsLink(false);
  const wanted = location.hash;
  const unmount = login.mount(document.getElementById('view'), {
    // → words to show on the view when the app must not open yet, else nothing
    async onSignedIn(signedIn) {
      // Over plain http (not localhost) the browser drops the Secure cookie: ask once more before opening the app
      try {
        await request('GET', '/api/session');
      } catch (err) {
        return err.status === 401 ? NOT_KEPT : failText(err.status, err.message);
      }
      unmount.opening(); // "Opening the farm app…" in the view (app.js replaces it) rather than a blank page
      history.replaceState(null, '', landing(wanted, signedIn.role));
      open(signedIn).catch(() => showLoadFail());
    },
  });
  window.farmReady = true;
}

start();

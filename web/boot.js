// The page's entry (spec 2026-11-06-login-design.md 6): who is signed in first; nobody, the sign-in view, then the app.
// The app (app.js) opens the live stream as it loads, so it is loaded only once someone is signed in. window.farmReady is
// set only once the app or the sign-in view is really up; when something here fails index.html's "Couldn't load" (#load-fail)
// is shown at once, not after its 8 s timer. Once boot.js runs (window.farmBooting) that timer stands down: over a slow link
// (Tailscale Funnel) the app's hundred-odd files can take longer than 8 s, and a real failure is shown here instead.

import { request, routeMissing, OUTDATED } from './api.js';
import { setMe } from './session.js';
import * as login from './login.js';
import { landing, failText, NOT_KEPT } from './login-math.js';

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

async function open(who) {
  setMe(who);
  delete root.dataset.signin;
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
      unmount();
      history.replaceState(null, '', landing(wanted, signedIn.role));
      open(signedIn).catch(() => showLoadFail());
    },
  });
  window.farmReady = true;
}

start();

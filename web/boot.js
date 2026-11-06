// The page's entry (spec 2026-11-06-login-design.md 6): who is signed in first; nobody, the sign-in view, then the app.
// The app (app.js) opens the live stream as it loads, so it is loaded only once someone is signed in. A server that cannot
// be reached leaves window.farmReady unset: index.html's "Couldn't load" shows after 8 s.

import { request } from './api.js';
import { setMe } from './session.js';
import * as login from './login.js';
import { landing } from './login-math.js';

const root = document.documentElement;

async function open(who) {
  setMe(who);
  delete root.dataset.signin;
  await import('./app.js');
}

async function start() {
  let who = null;
  try {
    who = await request('GET', '/api/session');
  } catch (err) {
    if (err.status !== 401) return;
  }
  if (who) return open(who);
  root.dataset.signin = '';
  const wanted = location.hash;
  const unmount = login.mount(document.getElementById('view'), {
    onSignedIn(signedIn) {
      unmount();
      history.replaceState(null, '', landing(wanted, signedIn.role));
      open(signedIn);
    },
  });
  window.farmReady = true;
}

start();

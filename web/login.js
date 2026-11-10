// The sign-in view (spec 2026-11-06-login-design.md 6): the names as buttons, then the PIN or password box.
//   mount(container, { onSignedIn(me) }) → unmount(); unmount.opening(): the view says the app is opening (boot.js, once
//   signed in: app.js replaces it when it is up)

import { request } from './api.js';
import { SECRET, secretProblem, failText, pinComplete, keepsSecret, lockedUntil, NO_ACCOUNTS, OPENING } from './login-math.js';

// The hidden username box is for password managers only: out of reach (no Tab, not read out), but not readonly (some managers
// skip a readonly box). The lead describes the heading, so "Nobody can sign in yet" is read with "Sign in".
const TEMPLATE = `
<section class="card login" aria-labelledby="login-title">
  <h1 id="login-title" class="page-title" tabindex="-1" aria-describedby="login-lead">Sign in</h1>
  <p class="login-lead" id="login-lead" data-lead>Who are you?</p>
  <ul class="login-names" data-names></ul>
  <p class="field-error login-load-error" role="status" data-load-error></p>
  <button type="button" data-retry hidden>Try again</button>
  <form class="login-secret" data-form novalidate hidden>
    <input class="sr-only" type="text" name="username" autocomplete="username" tabindex="-1" aria-hidden="true" data-username>
    <div class="field">
      <label for="login-secret" data-label>PIN</label>
      <input id="login-secret" name="secret" type="password" aria-describedby="login-lead login-error login-hint" required>
      <p class="field-error" id="login-error" aria-live="polite" data-error></p>
      <p class="c-hint login-hint" id="login-hint" data-hint></p>
    </div>
    <div class="login-actions">
      <button type="button" data-back>Not you?</button>
      <button type="submit" class="primary" data-submit>Sign in</button>
    </div>
  </form>
  <p class="login-opening" role="status" data-opening></p>
</section>`;

// After the focus has moved to the box, its error is read through aria-describedby; the live region waits this long before
// it listens again, so the error is not said twice (audit 2026-11-10).
const LIVE_BACK_MS = 150;

export function mount(container, { onSignedIn }) {
  container.innerHTML = TEMPLATE;
  const q = (s) => container.querySelector(s);
  const els = {
    lead: q('[data-lead]'), names: q('[data-names]'), loadError: q('[data-load-error]'), retry: q('[data-retry]'), form: q('[data-form]'),
    label: q('[data-label]'), input: q('#login-secret'), hint: q('[data-hint]'), error: q('[data-error]'), back: q('[data-back]'),
    submit: q('[data-submit]'), username: q('[data-username]'), title: q('#login-title'), opening: q('[data-opening]'),
  };
  let alive = true;
  let picked = null;
  let busy = false;
  let held = null; // { until, timer }: a lock's reply said when tries come back; Sign in waits until then
  let liveTimer = null;
  document.title = 'Sign in · Mushroom farm';

  function nameButton(n) {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'login-name';
    b.textContent = n.name;
    b.addEventListener('click', () => pick(n));
    li.append(b);
    return li;
  }

  function noAccounts() {
    const [before, command, after] = NO_ACCOUNTS;
    const code = document.createElement('code');
    code.className = 'login-command';
    code.textContent = command;
    els.lead.replaceChildren(before, code, after);
  }

  async function loadNames() {
    els.loadError.textContent = '';
    els.retry.hidden = true;
    try {
      const { names } = await request('GET', '/api/login/names');
      if (!alive) return;
      els.names.replaceChildren(...names.map(nameButton));
      if (names.length) els.lead.textContent = 'Who are you?';
      else noAccounts();
    } catch (err) {
      if (!alive) return;
      els.loadError.textContent = failText(err.status, err.message);
      els.retry.hidden = false;
    }
  }

  // The error under the box. When the focus must move there (a click on Sign in), the words are set with the live region
  // quiet: the box's description reads them as it gets the focus. Already in the box (Enter, the 6th digit), the live region says them.
  function showError(text) {
    const moving = document.activeElement !== els.input;
    clearTimeout(liveTimer);
    if (moving) els.error.removeAttribute('aria-live');
    els.error.textContent = text;
    els.input.setAttribute('aria-invalid', 'true');
    if (moving) {
      els.input.focus();
      liveTimer = setTimeout(() => els.error.setAttribute('aria-live', 'polite'), LIVE_BACK_MS);
    }
  }

  function release() {
    if (!held) return;
    clearTimeout(held.timer);
    held = null;
    if (alive && !busy) els.submit.disabled = false;
  }

  // A lock that says when it ends: Sign in stays off (the server's words under the box) until then; Not you? still works.
  function hold(until) {
    release();
    els.submit.disabled = true;
    held = { until, timer: setTimeout(() => { release(); if (alive) els.error.textContent = ''; }, until - Date.now()) };
  }

  function pick(n) {
    release();
    picked = n;
    const box = SECRET[n.kind];
    els.lead.textContent = `Signing in as ${n.name}`;
    els.names.hidden = true;
    els.form.hidden = false;
    els.label.textContent = box.label;
    els.input.value = '';
    els.input.setAttribute('inputmode', box.inputmode);
    els.input.setAttribute('autocomplete', box.autocomplete);
    els.input.maxLength = box.maxlength;
    if (n.kind === 'pin') els.input.setAttribute('pattern', '[0-9]*');
    else els.input.removeAttribute('pattern');
    els.username.value = n.name;
    els.hint.textContent = box.hint ?? '';
    els.hint.hidden = !box.hint;
    els.error.textContent = '';
    els.input.removeAttribute('aria-invalid');
    els.input.focus();
  }

  els.back.addEventListener('click', () => {
    release();
    picked = null;
    els.form.hidden = true;
    els.names.hidden = false;
    els.lead.textContent = 'Who are you?';
    els.names.querySelector('button')?.focus();
  });
  els.input.addEventListener('input', () => {
    if (held) return; // the lock's words stay until it ends
    els.error.textContent = '';
    els.input.removeAttribute('aria-invalid');
    // a PIN sends itself at its 6th digit (a phone's number pad has no Enter)
    if (picked && pinComplete(picked.kind, els.input.value, busy)) els.form.requestSubmit();
  });
  els.retry.addEventListener('click', loadNames);
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || held || !picked) return;
    const secret = els.input.value;
    const problem = secretProblem(picked.kind, secret);
    if (problem) return showError(problem);
    busy = true;
    els.submit.disabled = true;
    els.back.disabled = true;
    // a wrong password stays in its box, selected, to retype; a PIN is cleared
    const afterFail = () => {
      if (keepsSecret(picked.kind)) els.input.select();
      else els.input.value = '';
    };
    try {
      const who = await request('POST', '/api/login', { id: picked.id, secret });
      // onSignedIn may answer with words to show (the browser did not keep the sign-in)
      const stay = alive ? await onSignedIn(who) : null;
      if (stay && alive) {
        els.input.value = '';
        showError(stay);
      }
    } catch (err) {
      if (alive) {
        const until = lockedUntil(err.status, err.retryAt, Date.now());
        if (until) hold(until);
        showError(failText(err.status, err.message));
        afterFail();
      }
    } finally {
      busy = false;
      if (alive) {
        els.submit.disabled = Boolean(held);
        els.back.disabled = false;
      }
    }
  });

  loadNames();
  els.title.focus();
  function unmount() {
    alive = false;
    release();
    clearTimeout(liveTimer);
    container.replaceChildren();
  }
  // Signed in: the box and its buttons go, and the view says the app is opening (its own live region, there from the start).
  unmount.opening = () => {
    alive = false;
    release();
    els.form.hidden = true;
    els.names.hidden = true;
    els.retry.hidden = true;
    els.opening.textContent = OPENING;
  };
  return unmount;
}

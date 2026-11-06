// The sign-in view (spec 2026-11-06-login-design.md 6): the names as buttons, then the PIN or password box.
//   mount(container, { onSignedIn(me) }) → unmount()

import { request } from './api.js';
import { SECRET, secretProblem, failText } from './login-math.js';

const TEMPLATE = `
<section class="card login" aria-labelledby="login-title">
  <h1 id="login-title" class="page-title" tabindex="-1">Sign in</h1>
  <p class="login-lead" id="login-lead" data-lead>Who are you?</p>
  <ul class="login-names" data-names></ul>
  <p class="field-error" role="status" data-load-error></p>
  <button type="button" data-retry hidden>Try again</button>
  <form class="login-secret" data-form novalidate hidden>
    <input class="sr-only" type="text" name="username" autocomplete="username" readonly tabindex="-1" aria-hidden="true" data-username>
    <div class="field">
      <label for="login-secret" data-label>PIN</label>
      <input id="login-secret" name="secret" type="password" aria-describedby="login-lead login-hint login-error" required>
      <p class="hint" id="login-hint" data-hint></p>
      <p class="field-error" id="login-error" aria-live="polite" data-error></p>
    </div>
    <div class="login-actions">
      <button type="button" data-back>Not you?</button>
      <button type="submit" class="primary" data-submit>Sign in</button>
    </div>
  </form>
</section>`;

export function mount(container, { onSignedIn }) {
  container.innerHTML = TEMPLATE;
  const q = (s) => container.querySelector(s);
  const els = {
    lead: q('[data-lead]'), names: q('[data-names]'), loadError: q('[data-load-error]'), retry: q('[data-retry]'), form: q('[data-form]'),
    label: q('[data-label]'), input: q('#login-secret'), hint: q('[data-hint]'), error: q('[data-error]'), back: q('[data-back]'),
    submit: q('[data-submit]'), username: q('[data-username]'), title: q('#login-title'),
  };
  let alive = true;
  let picked = null;
  let busy = false;
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

  async function loadNames() {
    els.loadError.textContent = '';
    els.retry.hidden = true;
    try {
      const { names } = await request('GET', '/api/login/names');
      if (!alive) return;
      els.names.replaceChildren(...names.map(nameButton));
      els.lead.textContent = names.length ? 'Who are you?' : 'Nobody can sign in yet: the owner sets the first password on the farm computer (npm run owner).';
    } catch (err) {
      if (!alive) return;
      els.loadError.textContent = failText(err.status, err.message);
      els.retry.hidden = false;
    }
  }

  function showError(text) {
    els.error.textContent = text;
    els.input.setAttribute('aria-invalid', 'true');
    if (document.activeElement !== els.input) els.input.focus();
  }

  function pick(n) {
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
    picked = null;
    els.form.hidden = true;
    els.names.hidden = false;
    els.lead.textContent = 'Who are you?';
    els.names.querySelector('button')?.focus();
  });
  els.input.addEventListener('input', () => {
    els.error.textContent = '';
    els.input.removeAttribute('aria-invalid');
  });
  els.retry.addEventListener('click', loadNames);
  els.form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy || !picked) return;
    const secret = els.input.value;
    const problem = secretProblem(picked.kind, secret);
    if (problem) return showError(problem);
    busy = true;
    els.submit.disabled = true;
    els.back.disabled = true;
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
        els.input.value = '';
        showError(failText(err.status, err.message));
      }
    } finally {
      busy = false;
      if (alive) {
        els.submit.disabled = false;
        els.back.disabled = false;
      }
    }
  });

  loadNames();
  els.title.focus();
  return function unmount() {
    alive = false;
    container.replaceChildren();
  };
}

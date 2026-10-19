// Settings page: the farm-wide reading interval.

import { request, OFFLINE } from './api.js';
import { parsePoll, POLL_MESSAGE, POLL_MIN, POLL_MAX } from './settings-math.js';

const COMMAND_TIMEOUT = 15000;
const SAVED = 'Saved — applies from the next reading';
const HINT = 'Graphs show the last 50 readings. A sensor or machine shows as offline after 3 failed readings in a row.';

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Settings</h1>
      <p class="page-sub">Farm-wide settings.</p>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <form class="card settings" data-form novalidate hidden>
    <h2>Readings</h2>
    <div class="field">
      <label for="f-pollSeconds">Reading interval (seconds)</label>
      <input id="f-pollSeconds" name="pollSeconds" type="number" min="${POLL_MIN}" max="${POLL_MAX}" step="1" inputmode="numeric" aria-describedby="e-pollSeconds s-hint">
      <p class="field-error" id="e-pollSeconds" role="status"></p>
    </div>
    <p class="muted s-hint" id="s-hint">${HINT}</p>
    <div class="ac-send">
      <button type="submit" class="primary" data-save>Save</button>
      <button type="button" data-reset hidden>Reset</button>
      <span class="unsent" data-unsent hidden>Unsent changes</span>
    </div>
    <p class="s-saved" data-saved role="status" hidden></p>
  </form>`;

let mountSeq = 0; // every mount gets a token; a reply that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const form = q('[data-form]');
  const input = q('#f-pollSeconds');
  const fieldErr = q('#e-pollSeconds');
  const save = q('[data-save]');
  const reset = q('[data-reset]');
  const unsent = q('[data-unsent]');
  const saved = q('[data-saved]');
  const banner = q('.banner');
  const bannerText = q('[data-banner-text]');
  const retry = q('[data-retry]');
  document.title = 'Settings · Mushroom farm';

  let last = null; // the settings as the server has them
  let dirty = false;
  let saving = false;

  function setError(text) {
    if (fieldErr.textContent !== text) fieldErr.textContent = text;
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function paintDirty() {
    unsent.hidden = !dirty;
    reset.hidden = !dirty;
  }
  function setInput(s) {
    input.value = String(s.pollSeconds);
  }

  async function load() {
    banner.hidden = true;
    try {
      const data = await request('GET', '/api/settings');
      if (!alive()) return;
      last = data;
      if (!dirty) setInput(data);
      form.hidden = false;
    } catch (err) {
      if (!alive()) return;
      bannerText.textContent = err.status === 0 ? OFFLINE : err.message;
      banner.hidden = false;
    }
  }

  input.addEventListener('input', () => {
    dirty = true;
    setError('');
    saved.hidden = true;
    paintDirty();
  });

  reset.addEventListener('click', () => {
    dirty = false;
    setError('');
    if (last) setInput(last);
    paintDirty();
    save.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const n = parsePoll(input.value);
    if (n === null) {
      setError(POLL_MESSAGE);
      input.focus();
      return;
    }
    saving = true;
    save.disabled = true;
    reset.disabled = true;
    saved.hidden = true;
    try {
      const data = await request('PUT', '/api/settings', { pollSeconds: n }, COMMAND_TIMEOUT);
      if (!alive()) return;
      last = data;
      dirty = false;
      setError('');
      setInput(data);
      paintDirty();
      saved.textContent = SAVED;
      saved.hidden = false;
    } catch (err) {
      if (!alive()) return;
      if (err.status === 400 && err.field === 'pollSeconds') {
        setError(err.message);
        input.focus();
      } else {
        setError(err.status === 0 ? `${OFFLINE}. Try again.` : err.message);
      }
    } finally {
      saving = false;
      if (alive()) {
        save.disabled = false;
        reset.disabled = false;
      }
    }
  });

  retry.addEventListener('click', load);
  load();

  return function unmount() {
    mountSeq++;
    document.title = 'Rooms · Mushroom farm';
    container.replaceChildren();
  };
}

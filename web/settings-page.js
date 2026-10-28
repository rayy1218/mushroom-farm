// Settings page: the farm-wide reading interval, the outdoor sensor address and the electricity and water prices.

import { request, OFFLINE } from './api.js';
import { mountTelegram } from './telegram-card.js';
import { parsePoll, POLL_MESSAGE, POLL_MIN, POLL_MAX, EXTRA_FIELDS, parseExtraSettings } from './settings-math.js';

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
  <div class="settings-grid">
  <form class="card settings" data-form novalidate hidden>
    <h2>Readings</h2>
    <div class="field">
      <label for="f-pollSeconds">Reading interval (seconds)</label>
      <input id="f-pollSeconds" name="pollSeconds" type="number" min="${POLL_MIN}" max="${POLL_MAX}" step="1" inputmode="numeric" aria-describedby="e-pollSeconds s-hint">
      <p class="field-error" id="e-pollSeconds" role="status"></p>
    </div>
    <p class="muted s-hint" id="s-hint">${HINT}</p>
    <h2>Outdoor sensor</h2>
    <div class="field">
      <label for="f-outdoorAddress">Outdoor sensor address</label>
      <input id="f-outdoorAddress" name="outdoorAddress" type="number" min="1" max="247" step="1" inputmode="numeric" placeholder="none" aria-describedby="e-outdoorAddress s-outdoor">
      <p class="field-error" id="e-outdoorAddress" role="status"></p>
    </div>
    <p class="muted s-hint" id="s-outdoor">A T/RH probe outside, 1 to 247, or empty for none. It cannot share an address with a room's sensor.</p>
    <h2>Prices</h2>
    <div class="field">
      <label for="f-electricityPrice">Electricity price (RM per kWh)</label>
      <input id="f-electricityPrice" name="electricityPrice" type="number" min="0" max="10" step="0.01" inputmode="decimal" aria-describedby="e-electricityPrice">
      <p class="field-error" id="e-electricityPrice" role="status"></p>
    </div>
    <div class="field">
      <label for="f-waterPrice">Water price (RM per m³)</label>
      <input id="f-waterPrice" name="waterPrice" type="number" min="0" max="100" step="0.01" inputmode="decimal" placeholder="not set" aria-describedby="e-waterPrice s-water">
      <p class="field-error" id="e-waterPrice" role="status"></p>
    </div>
    <p class="muted s-hint" id="s-water">Leave the water price empty and water costs are not shown. Enter the rate on your water bill.</p>
    <div class="ac-send">
      <button type="submit" class="primary" data-save>Save</button>
      <button type="button" data-reset hidden>Reset</button>
      <span class="unsent" data-unsent hidden>Unsent changes</span>
    </div>
    <p class="s-saved" data-saved role="status" hidden></p>
  </form>
  <div data-telegram></div>
  </div>`;

let mountSeq = 0; // every mount gets a token; a reply that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const form = q('[data-form]');
  // every field of the form: the input, its error line and (for the added ones) how its text is read and shown
  const fields = {
    pollSeconds: { input: q('#f-pollSeconds'), err: q('#e-pollSeconds'), show: (v) => String(v ?? '') },
    ...Object.fromEntries(EXTRA_FIELDS.map((f) => [f.name, { input: q(`#f-${f.name}`), err: q(`#e-${f.name}`), show: f.show }])),
  };
  const input = fields.pollSeconds.input;
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

  function setError(text, name = 'pollSeconds') {
    const { input: el, err } = fields[name];
    if (err.textContent !== text) err.textContent = text;
    if (text) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  }
  function clearErrors() {
    for (const name of Object.keys(fields)) setError('', name);
  }
  function paintDirty() {
    unsent.hidden = !dirty;
    reset.hidden = !dirty;
  }
  function setInput(s) {
    for (const [name, f] of Object.entries(fields)) f.input.value = f.show(s[name]);
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

  for (const [name, f] of Object.entries(fields)) {
    f.input.addEventListener('input', () => {
      dirty = true;
      setError('', name);
      saved.hidden = true;
      paintDirty();
    });
  }

  reset.addEventListener('click', () => {
    dirty = false;
    clearErrors();
    if (last) setInput(last);
    paintDirty();
    save.focus();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    clearErrors();
    const n = parsePoll(input.value);
    const extra = parseExtraSettings(Object.fromEntries(EXTRA_FIELDS.map((f) => [f.name, fields[f.name].input.value])));
    const errors = { ...(n === null ? { pollSeconds: POLL_MESSAGE } : {}), ...extra.errors };
    const wrong = Object.keys(fields).filter((name) => errors[name]);
    if (wrong.length) {
      for (const name of wrong) setError(errors[name], name);
      fields[wrong[0]].input.focus();
      return;
    }
    saving = true;
    save.disabled = true;
    reset.disabled = true;
    saved.hidden = true;
    try {
      const data = await request('PUT', '/api/settings', { pollSeconds: n, ...extra.body }, COMMAND_TIMEOUT);
      if (!alive()) return;
      last = data;
      dirty = false;
      clearErrors();
      setInput(data);
      paintDirty();
      saved.textContent = SAVED;
      saved.hidden = false;
    } catch (err) {
      if (!alive()) return;
      if (err.status === 400 && Object.hasOwn(fields, err.field)) {
        setError(err.message, err.field);
        fields[err.field].input.focus();
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
  const unmountTelegram = mountTelegram(q('[data-telegram]'));

  return function unmount() {
    mountSeq++;
    unmountTelegram();
    document.title = 'Rooms · Mushroom farm';
    container.replaceChildren();
  };
}

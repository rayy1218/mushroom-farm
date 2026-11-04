// The "Yield" card of the Settings page: per crop the dry substrate of a block and the price per kg, with its own form and Save.

import { request, OFFLINE } from './api.js';
import { CROPS, CROP_KEYS } from './crops.js';
import { picture } from './pictures.js';
import { yieldBody, YIELD_NOTE, YIELD_DRY, YIELD_PRICE } from './settings-math.js';

const COMMAND_TIMEOUT = 15000;
const COLUMNS = [
  { key: 'dryKg', label: 'Dry substrate per block (kg)', short: 'Dry kg per block', range: YIELD_DRY },
  { key: 'priceKg', label: 'Price (RM per kg)', short: 'RM per kg', range: YIELD_PRICE },
];

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountYield(container) {
  let alive = true;
  container.innerHTML = `
  <div class="banner" role="alert" data-yd-banner hidden>
    <span data-yd-banner-text></span>
    <button type="button" data-yd-retry>Retry</button>
  </div>
  <form class="card settings yield" id="yield" data-yd-form novalidate hidden>
    <h2>Yield</h2>
    <table class="yd-table">
      <thead><tr><th scope="col">Crop</th>${COLUMNS.map((c) => `<th scope="col">${c.label}</th>`).join('')}</tr></thead>
      <tbody data-yd-rows></tbody>
    </table>
    <p class="muted s-hint">${YIELD_NOTE}</p>
    <div class="ac-send">
      <button type="submit" class="primary" data-yd-save>Save</button>
    </div>
    <p class="s-saved" data-yd-saved role="status" hidden></p>
  </form>`;
  const q = (sel) => container.querySelector(sel);
  const form = q('[data-yd-form]');
  const save = q('[data-yd-save]');
  const saved = q('[data-yd-saved]');
  const banner = q('[data-yd-banner]');
  const bannerText = q('[data-yd-banner-text]');
  q('[data-yd-retry]').addEventListener('click', () => load());

  // inputs['dryKg:oyster'] = { input, err }
  const inputs = {};
  const tbody = q('[data-yd-rows]');
  for (const crop of CROP_KEYS) {
    const tr = el('tr');
    const name = el('th', 'yd-crop');
    name.scope = 'row';
    const named = el('span', 'yd-crop-name'); // the picture beside the name (a table cell cannot be a flex box itself)
    named.append(picture('crop', crop, { size: 24 }), el('span', null, CROPS[crop].name));
    name.append(named);
    tr.append(name);
    for (const c of COLUMNS) {
      const id = `${c.key}-${crop}`;
      const td = el('td', 'yd-cell');
      td.dataset.label = c.short; // a phone's label over the box: short, so both boxes of a row sit level
      // A text box with the decimal keypad, as the task dialogs' kg: a number box drops text it cannot read ("1,5" reads as
      // empty, saved as not set), where yieldBody names the box and the range.
      const input = el('input');
      Object.assign(input, { id: `f-yd-${id}`, name: id, type: 'text', inputMode: 'decimal', autocomplete: 'off', placeholder: 'not set' });
      input.setAttribute('aria-label', `${CROPS[crop].name}: ${c.label}, ${c.range[0].toLocaleString('en-US')} to ${c.range[1].toLocaleString('en-US')}`);
      input.setAttribute('aria-describedby', `e-yd-${id}`);
      const err = el('p', 'field-error');
      err.id = `e-yd-${id}`;
      err.setAttribute('role', 'status');
      td.append(input, err);
      tr.append(td);
      inputs[`${c.key}:${crop}`] = { input, err };
      input.addEventListener('input', () => {
        setError(`${c.key}:${crop}`, '');
        saved.hidden = true;
      });
    }
    tbody.append(tr);
  }

  function setError(field, text) {
    const { input, err } = inputs[field];
    if (err.textContent !== text) err.textContent = text;
    if (text) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  const clearErrors = () => { for (const field of Object.keys(inputs)) setError(field, ''); };

  function paint(settings) {
    const saved = settings.cropYield ?? {};
    for (const crop of CROP_KEYS) {
      for (const c of COLUMNS) inputs[`${c.key}:${crop}`].input.value = saved[crop]?.[c.key] ?? '';
    }
  }

  async function load() {
    banner.hidden = true;
    try {
      const data = await request('GET', '/api/settings');
      if (!alive) return;
      paint(data);
      form.hidden = false;
    } catch (err) {
      if (!alive) return;
      bannerText.textContent = `Yield: ${err.status === 0 ? OFFLINE : err.message}`;
      banner.hidden = false;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearErrors();
    saved.hidden = true;
    const built = yieldBody(CROP_KEYS.map((crop) => ({ crop, dryKg: inputs[`dryKg:${crop}`].input.value, priceKg: inputs[`priceKg:${crop}`].input.value })));
    if (built.error) {
      setError(built.field, built.error);
      inputs[built.field].input.focus();
      return;
    }
    save.disabled = true;
    try {
      const data = await request('PUT', '/api/settings', { cropYield: built.cropYield }, COMMAND_TIMEOUT);
      if (!alive) return;
      paint(data);
      saved.textContent = 'Saved';
      saved.hidden = false;
    } catch (err) {
      if (!alive) return;
      const first = inputs[`dryKg:${CROP_KEYS[0]}`];
      if (err.status === 400 && err.field === 'cropYield') {
        first.err.textContent = err.message;
        first.input.setAttribute('aria-invalid', 'true');
        first.input.focus();
      } else {
        first.err.textContent = err.status === 0 ? `${OFFLINE}. Try again.` : err.message;
        first.input.setAttribute('aria-invalid', 'true');
      }
    } finally {
      save.disabled = false;
    }
  });

  load();
  return function unmount() {
    alive = false;
  };
}

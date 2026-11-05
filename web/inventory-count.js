// Count stock, #/business/inventory/count (spec 2026-11-05-inventory-design.md 4 and 5): a box for every item not archived,
// by kind, beside what the records say; who once at the top. Save sends the typed boxes as one count (POST
// /api/inventory/counts) and goes back to the list. The records' figures follow the 'inventory' events; the boxes are never
// touched by a refresh (a worker may be halfway along the shelves).

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { INVENTORY_HASH } from './route.js';
import { live } from './live.js';
import { createThrottle } from './live-math.js';
import { loadWorkers, getWorker, setWorker, errorText } from './task-dialogs.js';
import { groupItems, qtyText, countBody } from './inventory-math.js';

const COMMAND_TIMEOUT = 15000;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <a class="back" data-back>Inventory</a>
      <h1 class="page-title" tabindex="-1">Count stock</h1>
      <p class="page-sub">Type what is on the shelf. A box left empty is skipped.</p>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <form class="iv-count" data-form novalidate hidden>
    <div class="card iv-count-who">
      <div class="field">
        <label for="iv-count-worker">Who counted</label>
        <select id="iv-count-worker" data-worker aria-describedby="iv-count-worker-error"></select>
        <p class="field-error" id="iv-count-worker-error" aria-live="polite"></p>
      </div>
    </div>
    <div class="iv-groups" data-groups></div>
    <p class="form-error" role="alert" tabindex="-1" data-error hidden></p>
    <div class="iv-count-send">
      <button type="submit" class="primary" data-save disabled>Save counts</button>
      <span class="muted" data-typed role="status"></span>
    </div>
  </form>
  <section class="card iv-empty" data-empty hidden>
    <p class="none">No stock items to count.</p>
    <a class="button" data-empty-back>Back to Inventory</a>
  </section>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

let mountSeq = 0;

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    form: q('[data-form]'), worker: q('[data-worker]'), workerError: q('#iv-count-worker-error'), groups: q('[data-groups]'),
    error: q('[data-error]'), save: q('[data-save]'), typed: q('[data-typed]'), banner: q('.banner'), bannerText: q('[data-banner-text]'),
    empty: q('[data-empty]'),
  };
  q('[data-back]').href = INVENTORY_HASH;
  q('[data-empty-back]').href = INVENTORY_HASH;
  document.title = 'Count stock · Inventory · Mushroom farm';

  const rows = new Map(); // itemId → { item, input, error, records }
  let busy = false;

  const showError = (text) => {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  };
  const entries = () => [...rows.values()].map((r) => ({ itemId: r.item.id, unit: r.item.unit, text: r.input.value }));
  function countTyped() {
    const n = entries().filter((e) => e.text.trim() !== '').length;
    els.save.disabled = busy || n === 0;
    els.typed.textContent = n ? `${n} typed` : '';
  }

  function build(items) {
    const open = items.filter((i) => !i.archived);
    els.empty.hidden = open.length > 0;
    els.form.hidden = open.length === 0;
    els.groups.replaceChildren(...groupItems(open).map((g) => {
      const card = el('fieldset', 'card iv-count-group');
      card.append(el('legend', '', g.name));
      for (const item of g.items) {
        const id = `iv-count-${item.id}`;
        const row = el('div', 'field iv-count-row');
        const label = el('label', 'iv-count-name', item.name);
        label.htmlFor = id;
        const records = el('p', 'c-hint iv-count-records', `By the records ${qtyText(item.qty, item.unit)}`);
        records.id = `${id}-hint`;
        const box = el('span', 'tk-suffix-box');
        const input = el('input');
        Object.assign(input, { id, type: 'text', inputMode: 'decimal', autocomplete: 'off' });
        const suffix = el('span', 'tk-suffix', item.unit);
        suffix.setAttribute('aria-hidden', 'true');
        box.append(input, suffix);
        const error = el('p', 'field-error');
        error.id = `${id}-error`;
        error.setAttribute('aria-live', 'polite');
        input.setAttribute('aria-describedby', `${records.id} ${error.id}`);
        input.addEventListener('input', () => {
          error.textContent = '';
          input.removeAttribute('aria-invalid');
          countTyped();
        });
        row.append(label, records, box, error);
        card.append(row);
        rows.set(item.id, { item, input, error, records });
      }
      return card;
    }));
    countTyped();
  }

  // A refresh: the records' figures only.
  function refresh(items) {
    for (const item of items) {
      const r = rows.get(item.id);
      if (!r) continue;
      r.item = item;
      r.records.textContent = `By the records ${qtyText(item.qty, item.unit)}`;
    }
  }

  async function load(first = false) {
    try {
      const [data, names] = await Promise.all([request('GET', '/api/inventory'), first ? loadWorkers() : Promise.resolve(null)]);
      if (!alive()) return;
      els.banner.hidden = true;
      if (first) {
        const mine = getWorker();
        els.worker.replaceChildren(...[['', 'Pick a name'], ...names.map((n) => [n, n])].map(([v, t]) => {
          const o = el('option', '', t);
          o.value = v;
          return o;
        }));
        els.worker.value = names.includes(mine) ? mine : '';
        build(data.items);
      } else {
        refresh(data.items);
      }
    } catch (err) {
      if (!alive()) return;
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
    }
  }

  function fieldError(field, message) {
    if (field === 'worker') {
      els.workerError.textContent = message;
      els.worker.setAttribute('aria-invalid', 'true');
      els.worker.focus();
      return;
    }
    const itemId = field ? Number(String(field).replace(/^count-/, '')) : NaN;
    const r = rows.get(itemId);
    if (r) {
      r.error.textContent = message;
      r.input.setAttribute('aria-invalid', 'true');
      r.input.focus();
      return;
    }
    els.error.textContent = message;
    els.error.hidden = false;
    els.error.focus();
  }

  els.worker.addEventListener('change', () => {
    els.workerError.textContent = '';
    els.worker.removeAttribute('aria-invalid');
  });
  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    els.error.hidden = true;
    const body = countBody(entries(), els.worker.value);
    if (body.error) {
      fieldError(body.field, body.error);
      return;
    }
    busy = true;
    countTyped();
    try {
      await request('POST', '/api/inventory/counts', body, COMMAND_TIMEOUT);
      setWorker(body.worker);
      if (alive()) location.hash = INVENTORY_HASH;
    } catch (err) {
      if (!alive()) return;
      // the server names an entry 'counts.<index>' (of the counts sent) or 'worker'
      const m = /^counts\.(\d+)$/.exec(err.field ?? '');
      const field = m ? `count-${body.counts[Number(m[1])]?.itemId}` : err.field === 'worker' ? 'worker' : null;
      if (err.status === 400 && err.field === 'worker') window.dispatchEvent(new CustomEvent('farm:worker'));
      fieldError(field, err.status === 400 ? err.message : errorText(err));
    } finally {
      busy = false;
      if (alive()) countTyped();
    }
  });
  q('[data-retry]').addEventListener('click', () => load(rows.size === 0));

  const reload = createThrottle(() => { if (alive() && rows.size) load(false); });
  const offLive = [live.on('inventory', () => reload.call()), live.onStatus((up) => { if (up) reload.call(); })];
  load(true);

  return function unmount() {
    mountSeq++;
    reload.cancel();
    for (const off of offLive) off();
  };
}

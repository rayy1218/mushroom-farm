// Count stock, #/business/inventory/count (spec 2026-11-05-inventory-design.md 4 and 5): a box for every item not archived,
// by kind, beside what the records say; who once at the top. Save sends the typed boxes as one count (POST
// /api/inventory/counts) and goes back to the list. The records' figures follow the 'inventory' events; the boxes are never
// touched by a refresh (a worker may be halfway along the shelves). The typed boxes are kept in this tab (sessionStorage)
// until saved, and leaving with some typed asks first (audit 2026-11-05 #3).

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { INVENTORY_HASH, INVENTORY_COUNT_HASH } from './route.js';
import { live } from './live.js';
import { createThrottle } from './live-math.js';
import { loadWorkers, getWorker, setWorker, errorText } from './task-dialogs.js';
import { groupItems, qtyText, countBody, countDiff, doneText, keptCounts, leaveText, WHOLE_UNITS } from './inventory-math.js';
import { DOT } from './text-math.js';
import { keepFlash } from './inventory-done.js';

const COMMAND_TIMEOUT = 15000;
const KEPT_KEY = 'farm.inventory.count'; // { itemId: text }: the typed boxes, until a save

function readKept() {
  try { return JSON.parse(sessionStorage.getItem(KEPT_KEY) ?? 'null'); } catch { return null; }
}
function writeKept(map) {
  try {
    if (Object.keys(map).length) sessionStorage.setItem(KEPT_KEY, JSON.stringify(map));
    else sessionStorage.removeItem(KEPT_KEY);
  } catch { /* not kept: a slip loses them, as before */ }
}

const TEMPLATE = `
  <div class="iv-page iv-detail">
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
  <p class="muted" data-loading role="status">Loading…</p>
  <form class="iv-count" data-form novalidate hidden>
    <div data-lead></div>
    <p class="muted iv-count-back" data-back-line role="status" hidden>Your unsaved counts are back. <button type="button" class="iv-link" data-forget>Clear them</button></p>
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
  </section>
  </div>`;

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
    empty: q('[data-empty]'), loading: q('[data-loading]'), lead: q('[data-lead]'), backLine: q('[data-back-line]'),
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
  let leaving = false; // a save is taking the page to the list: no question
  const entries = () => [...rows.values()].filter((r) => !r.gone).map((r) => ({ itemId: r.item.id, unit: r.item.unit, text: r.input.value }));
  const typedCount = () => entries().filter((e) => e.text.trim() !== '').length;
  function countTyped() {
    const n = typedCount();
    els.save.disabled = busy || n === 0;
    els.typed.textContent = n ? `${n} typed` : '';
  }
  // Every typed box (a gone row's too: it may come back), kept until a save.
  const keep = () => writeKept(Object.fromEntries([...rows].filter(([, r]) => r.input.value.trim() !== '').map(([id, r]) => [String(id), r.input.value])));

  // The worker picker from the names; the selection stays when it is still on the list. No names: the dialogs' line.
  function paintNames(names) {
    const keep = els.worker.value || getWorker();
    els.worker.replaceChildren(...[['', 'Pick a name'], ...names.map((n) => [n, n])].map(([v, t]) => {
      const o = el('option', '', t);
      o.value = v;
      return o;
    }));
    els.worker.value = names.includes(keep) ? keep : '';
    els.lead.replaceChildren();
    if (!names.length) {
      const p = el('p', 'muted iv-count-lead');
      const a = el('a', '', 'Settings');
      a.href = '#/settings';
      p.append("No names yet: add the workers' names in ", a, ' first.');
      els.lead.append(p);
    }
  }
  async function reloadNames() {
    try {
      const names = await loadWorkers();
      if (alive()) paintNames(names);
    } catch { /* the list stays as it was */ }
  }
  const inputMode = (unit) => (WHOLE_UNITS.includes(unit) ? 'numeric' : 'decimal');
  // "By the records 1.50 kg", and with a figure typed its difference (audit #6): "· −0.25 kg", amber when over half.
  function paintRecords(r) {
    r.records.replaceChildren(`By the records ${qtyText(r.item.qty, r.item.unit)}`);
    const diff = countDiff(r.input.value, r.item);
    if (!diff) return;
    const part = el('span', 'iv-count-diff', diff.text);
    if (diff.warn) part.dataset.tone = 'amber';
    r.records.append(DOT, part);
  }

  function build(items) {
    rows.clear();
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
        const records = el('p', 'c-hint iv-count-records');
        records.id = `${id}-hint`;
        const box = el('span', 'tk-suffix-box');
        const input = el('input');
        Object.assign(input, { id, type: 'text', inputMode: inputMode(item.unit), autocomplete: 'off' });
        const suffix = el('span', 'tk-suffix', item.unit);
        suffix.setAttribute('aria-hidden', 'true');
        box.append(input, suffix);
        const error = el('p', 'field-error');
        error.id = `${id}-error`;
        error.setAttribute('aria-live', 'polite');
        input.setAttribute('aria-describedby', `${records.id} ${error.id}`);
        const r = { item, input, error, records, suffix, gone: null, row };
        input.addEventListener('input', () => {
          error.textContent = '';
          input.removeAttribute('aria-invalid');
          paintRecords(r);
          countTyped();
          keep();
        });
        row.append(label, records, box, error);
        card.append(row);
        rows.set(item.id, r);
        paintRecords(r);
      }
      return card;
    }));
    const kept = keptCounts(readKept(), items);
    for (const [id, text] of Object.entries(kept)) {
      const r = rows.get(Number(id));
      if (!r) continue;
      r.input.value = text;
      paintRecords(r);
    }
    els.backLine.hidden = Object.keys(kept).length === 0;
    countTyped();
  }

  // A refresh: the records' figures and units only; an item gone from the list (archived, deleted) is switched off.
  function refresh(items) {
    const byId = new Map(items.filter((i) => !i.archived).map((i) => [i.id, i]));
    for (const [id, r] of rows) {
      const item = byId.get(id);
      if (!item) {
        if (!r.gone) {
          r.gone = el('p', 'muted iv-count-gone', 'No longer on the list since you opened this page'); // archived or deleted: one can't tell
          r.gone.id = `iv-count-${id}-gone`;
          r.input.disabled = true;
          r.input.setAttribute('aria-describedby', `${r.records.id} ${r.error.id} ${r.gone.id}`);
          r.row.insertBefore(r.gone, r.error);
          countTyped();
        }
        continue;
      }
      if (r.gone) {
        r.gone.remove();
        r.gone = null;
        r.input.disabled = false;
        r.input.setAttribute('aria-describedby', `${r.records.id} ${r.error.id}`);
      }
      r.item = item;
      paintRecords(r);
      r.suffix.textContent = item.unit;
      r.input.inputMode = inputMode(item.unit);
    }
    countTyped();
  }

  let built = false; // the first reply has come and the page is built (an empty list is built again by the next reply)
  async function load() {
    try {
      const [data, names] = await Promise.all([request('GET', '/api/inventory'), built ? Promise.resolve(null) : loadWorkers()]);
      if (!alive()) return;
      els.banner.hidden = true;
      els.loading.hidden = true;
      if (!built) {
        paintNames(names);
        build(data.items);
        built = rows.size > 0;
      } else {
        refresh(data.items);
      }
    } catch (err) {
      if (!alive()) return;
      if (!built) els.loading.hidden = true;
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
      const reply = await request('POST', '/api/inventory/counts', body, COMMAND_TIMEOUT);
      setWorker(body.worker);
      keepFlash({ // the list says it, with Undo for the minute (audit #2)
        text: doneText({ kind: 'count', count: body.counts.length, worker: body.worker }),
        moves: (reply?.moves ?? []).map((m) => m.id).filter(Number.isInteger), at: Date.now(),
      });
      writeKept({});
      if (alive()) {
        leaving = true;
        location.hash = INVENTORY_HASH;
      }
    } catch (err) {
      if (!alive()) return;
      // the server names an entry 'counts.<index>' (of the counts sent) or 'worker'
      const m = /^counts\.(\d+)$/.exec(err.field ?? '');
      const field = m ? `count-${body.counts[Number(m[1])]?.itemId}` : err.field === 'worker' ? 'worker' : null;
      if (err.status === 400 && err.field === 'worker') reloadNames(); // renamed or removed
      fieldError(field, err.status === 400 ? err.message : errorText(err));
    } finally {
      busy = false;
      if (alive()) countTyped();
    }
  });
  q('[data-retry]').addEventListener('click', () => load());
  q('[data-forget]').addEventListener('click', () => {
    for (const r of rows.values()) r.input.value = '';
    writeKept({});
    els.backLine.hidden = true;
    countTyped();
    rows.values().next().value?.input.focus();
  });

  // Leaving with typed boxes asks first. A tap on an app link (the back link, the top bar: a capture listener on the
  // document, before the link is followed) is cancelled on "Cancel". The phone's Back is heard as popstate, which comes
  // before the router's hashchange but cannot be cancelled: on "Cancel" the address is put back, and the router shows Count
  // stock again with the kept figures. A reload or a closed tab: beforeunload. The figures stay kept in every case.
  const ask = () => {
    const n = typedCount();
    return leaving || n === 0 || window.confirm(leaveText(n));
  };
  const onClick = (event) => {
    const a = event.target.closest?.('a[href^="#/"]');
    if (!a || !alive() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (a.getAttribute('href') === location.hash) return;
    if (ask()) leaving = true;
    else event.preventDefault();
  };
  const onPop = () => {
    if (!alive() || ask()) {
      leaving = true;
      return;
    }
    history.pushState(null, '', INVENTORY_COUNT_HASH);
  };
  const onUnload = (event) => {
    if (leaving || typedCount() === 0) return;
    event.preventDefault();
    event.returnValue = '';
  };
  document.addEventListener('click', onClick, true);
  window.addEventListener('popstate', onPop);
  window.addEventListener('beforeunload', onUnload);

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [live.on('inventory', () => reload.call()), live.onStatus((up) => { if (up) reload.call(); })];
  window.addEventListener('farm:worker', reloadNames);
  load();

  return function unmount() {
    mountSeq++;
    reload.cancel();
    window.removeEventListener('farm:worker', reloadNames);
    document.removeEventListener('click', onClick, true);
    window.removeEventListener('popstate', onPop);
    window.removeEventListener('beforeunload', onUnload);
    for (const off of offLive) off();
  };
}

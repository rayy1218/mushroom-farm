// The Inventory page, #/business/inventory (spec 2026-11-05-inventory-design.md 5): every item by kind with what is in stock,
// its reorder level, when it was last counted and its pill; the attention line; Record use, Purchase, Count stock, Add item
// and the myGAP 4-5 sheet. Reads GET /api/inventory on the 'inventory' events, when the stream comes back, and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { inventoryItemHash, INVENTORY_COUNT_HASH, inventorySheetHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { DOT } from './text-math.js';
import { openItemDialog, openPurchaseDialog, openUseDialog } from './inventory-dialogs.js';
import { farmDate } from './tasks-math.js';
import { groupItems, pillOf, attentionParts, countedText, qtyText } from './inventory-math.js';

const REFRESH_MS = 60_000;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Inventory</h1>
      <p class="page-sub">What is in stock, what was bought and used, and what runs out.</p>
    </div>
    <div class="iv-tools">
      <button type="button" class="primary" data-use disabled>Record use</button>
      <button type="button" data-purchase disabled>Purchase</button>
      <a class="button" data-count>Count stock</a>
      <button type="button" data-add>Add item</button>
      <a class="iv-sheet-link" data-sheet>myGAP 4-5 sheet</a>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <p class="iv-attention" data-attention hidden></p>
  <div class="iv-groups" data-groups></div>
  <p class="none iv-all-archived" data-all-archived hidden>Every item is archived.</p>
  <section class="card iv-empty" data-empty hidden>
    <p class="none">No stock items yet.</p>
    <button type="button" class="primary" data-add-empty>Add item</button>
  </section>
  <p class="iv-archived" data-archived-line hidden><button type="button" class="iv-link" data-archived></button></p>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export function pillNode(pill) {
  const p = el('span', 'pill', pill?.text ?? '');
  if (pill) p.dataset.tone = pill.tone;
  return p;
}

// One kind's card: a table of its items (on a phone each row a block: the name and pill, then In stock, then the rest).
function groupCard(group, now) {
  const card = el('section', 'card iv-group');
  const id = `iv-g-${group.kind}`;
  const h = el('h2', '', group.name);
  h.id = id;
  card.setAttribute('aria-labelledby', id);
  const wrap = el('div', 'us-table-wrap');
  const t = el('table', 'us-table iv-table');
  t.append(el('caption', 'sr-only', group.name));
  const head = el('tr');
  for (const [text, cls] of [['Item', ''], ['In stock', 'num'], ['Reorder at', 'num'], ['Last counted', ''], ['', 'iv-state-col']]) {
    const th = el('th', cls, text);
    th.scope = 'col';
    if (!text) th.append(el('span', 'sr-only', 'State'));
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const item of group.items) {
    const tr = el('tr');
    tr.dataset.id = String(item.id);
    tr.className = 'iv-row'; // the whole row opens the item; the name stays the real link
    const name = el('th', 'iv-name');
    name.scope = 'row';
    const a = el('a', '', item.name);
    a.href = inventoryItemHash(item.id);
    name.append(a);
    if (item.ingredient) name.append(el('span', 'iv-sub', item.ingredient));
    const counted = countedText(item.lastCountedAt, now);
    const countCell = el('td', `iv-counted${counted.stale ? ' iv-stale' : ''}`, counted.text);
    countCell.dataset.label = 'Last counted';
    const reorder = el('td', 'num iv-reorder', item.reorderAt === null ? '—' : qtyText(item.reorderAt, item.unit));
    reorder.dataset.label = 'Reorder at';
    const state = el('td', 'iv-state');
    state.append(pillNode(pillOf(item)));
    tr.append(name, el('td', 'num iv-qty', qtyText(item.qty, item.unit)), reorder, countCell, state);
    body.append(tr);
  }
  t.append(thead, body);
  wrap.append(t);
  card.append(h, wrap);
  return card;
}

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    use: q('[data-use]'), purchase: q('[data-purchase]'), count: q('[data-count]'), add: q('[data-add]'), sheet: q('[data-sheet]'),
    banner: q('.banner'), bannerText: q('[data-banner-text]'), attention: q('[data-attention]'), groups: q('[data-groups]'),
    empty: q('[data-empty]'), allArchived: q('[data-all-archived]'), archivedLine: q('[data-archived-line]'), archived: q('[data-archived]'),
  };
  document.title = 'Inventory · Mushroom farm';
  els.count.href = INVENTORY_COUNT_HASH;
  els.sheet.href = inventorySheetHash(30);

  let data = null; // GET /api/inventory
  let archived = false; // archived items asked for
  let loadedArchived = false; // and what the last answer was for
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  const showError = (text) => {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  };

  function paint() {
    const key = JSON.stringify([data, archived, farmDate(Date.now())]);
    if (key === painted) return;
    painted = key;
    const items = data.items ?? [];
    const parts = attentionParts(data.attention, items);
    els.attention.hidden = parts.length === 0;
    els.attention.replaceChildren(...parts.flatMap((p, i) => {
      const s = el('span', 'iv-att', p.text);
      s.dataset.tone = p.tone;
      return i ? [DOT, s] : [s];
    }));
    els.empty.hidden = items.length > 0 || data.archivedCount > 0;
    els.allArchived.hidden = !(items.length === 0 && data.archivedCount > 0 && !archived);
    els.groups.replaceChildren(...groupItems(items).map((g) => groupCard(g, Date.now())));
    els.archivedLine.hidden = data.archivedCount === 0;
    els.archived.textContent = archived ? 'Hide archived' : `Show archived (${data.archivedCount})`;
    const open = items.filter((i) => !i.archived);
    els.use.disabled = open.length === 0;
    els.purchase.disabled = !open.some((i) => i.kind !== 'blocks');
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', archived ? '/api/inventory?archived=1' : '/api/inventory');
      if (!alive() || mine !== seq) return;
      data = reply;
      loadedArchived = archived;
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (archived !== loadedArchived) { // a failed toggle: the button goes back to what is shown
        archived = loadedArchived;
        painted = '';
        if (data) paint();
      }
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const done = () => load();
  const add = () => openItemDialog({ onDone: done, onLost: showError });
  els.add.addEventListener('click', add);
  q('[data-add-empty]').addEventListener('click', add);
  els.use.addEventListener('click', () => { if (data) openUseDialog({ items: data.items, alive, onDone: done, onLost: showError }); });
  els.purchase.addEventListener('click', () => { if (data) openPurchaseDialog({ items: data.items, suppliers: data.suppliers, onDone: done, onLost: showError }); });
  els.archived.addEventListener('click', () => {
    archived = !archived;
    load();
  });
  els.groups.addEventListener('click', (e) => {
    const row = e.target.closest?.('tr.iv-row');
    if (!row || e.target.closest('a, button')) return;
    row.querySelector('.iv-name a')?.click();
  });
  q('[data-retry]').addEventListener('click', () => load());

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('inventory', () => reload.call()),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) {
        clearTimeout(timer);
        timer = setTimeout(load, REFRESH_MS);
      }
    }),
  ];
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
  };
}

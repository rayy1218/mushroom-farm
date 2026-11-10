// The Inventory page, #/business/inventory (spec 2026-11-05-inventory-design.md 5): every item by kind with what is in stock,
// its reorder level, when it was last counted and its pill; the attention line; Record use, Purchase, Count stock, Add item
// and the myGAP 4-5 sheet. Reads GET /api/inventory on the 'inventory' events, when the stream comes back, and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { inventoryItemHash, INVENTORY_COUNT_HASH, inventorySheetHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { DOT } from './text-math.js';
import { openItemDialog, openPurchaseDialog, openUseDialog } from './inventory-dialogs.js';
import { createDoneLine, takeFlash } from './inventory-done.js';
import { farmDate } from './tasks-math.js';
import { groupItems, pillOf, attentionParts, countedText, metaLine, needsLook, qtyText, useItems } from './inventory-math.js';

const REFRESH_MS = 60_000;

const TEMPLATE = `
  <div class="iv-page">
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Inventory</h1>
      <p class="page-sub">What is in stock, what was bought and used, and what runs out.</p>
    </div>
    <div class="iv-tools">
      <button type="button" class="primary" data-use disabled>Record use</button>
      <button type="button" data-purchase disabled data-owner-only>Purchase</button>
      <a class="button" data-count>Count stock</a>
      <button type="button" data-add data-owner-only>Add item</button>
      <a class="iv-sheet-link" data-sheet data-owner-only>myGAP 4-5 sheet</a>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <p class="muted" data-loading role="status">Loading…</p>
  <p class="iv-attention" data-attention hidden></p>
  <p class="muted iv-filter-line" data-filter-line hidden><span data-filter-text></span> <button type="button" class="iv-link" data-filter-off>Show all</button></p>
  <p class="muted iv-done-line" role="status" data-done hidden></p>
  <div class="iv-groups" data-groups></div>
  <p class="none iv-all-archived" data-all-archived hidden>Every item is archived.</p>
  <section class="card iv-empty" data-empty hidden>
    <p class="none">No stock items yet.</p>
    <button type="button" class="primary" data-add-empty data-owner-only>Add item</button>
  </section>
  <p class="iv-archived" data-archived-line hidden><button type="button" class="iv-link" data-archived></button> <span class="muted" data-archived-said role="status"></span></p>
  </div>`;

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

// One kind's card: a table of its items, the pill right after the name (audit #11: at 1440 px a pill at the card's far end
// sat 1,200 px from its name). On a phone each row is a block: the name and pill, In stock at the right, then one muted
// line, "Reorder at 2.00 L · counted today" (audit #12); the Reorder at and Last counted cells are the desk's.
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
  for (const [text, cls] of [['Item', ''], ['In stock', 'num'], ['Reorder at', 'num'], ['Last counted', '']]) {
    const th = el('th', cls, text);
    th.scope = 'col';
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const item of group.items) {
    const tr = el('tr');
    tr.dataset.id = String(item.id);
    tr.className = item.archived ? 'iv-row iv-row-archived' : 'iv-row'; // the whole row opens the item; the name stays the real link
    const name = el('th', 'iv-name');
    name.scope = 'row';
    const a = el('a', '', item.name);
    a.href = inventoryItemHash(item.id);
    name.append(a);
    const pill = pillOf(item);
    if (pill) name.append(' ', pillNode(pill));
    if (item.ingredient) name.append(el('span', 'iv-sub', item.ingredient));
    name.append(el('span', 'iv-meta', metaLine(item, now)));
    const counted = countedText(item.lastCountedAt, now);
    const countCell = el('td', `iv-counted${counted.stale ? ' iv-stale' : ''}`, counted.text);
    const reorder = el('td', 'num iv-reorder', item.reorderAt === null ? '—' : qtyText(item.reorderAt, item.unit));
    tr.append(name, el('td', 'num iv-qty', qtyText(item.qty, item.unit)), reorder, countCell);
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
    loading: q('[data-loading]'), filterLine: q('[data-filter-line]'), filterText: q('[data-filter-text]'), archivedSaid: q('[data-archived-said]'),
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
  let filter = null; // an attention part tapped: 'low' | 'soon' | 'expired' (audit #13), or none
  let askedArchived = false; // the toggle was tapped: its answer is said (audit #14)

  const showError = (text) => {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  };

  function paint() {
    const key = JSON.stringify([data, archived, filter, farmDate(Date.now())]);
    if (key === painted) return;
    painted = key;
    els.loading.hidden = true;
    const items = data.items ?? [];
    const parts = attentionParts(data.attention, items);
    if (filter && !parts.some((p) => p.key === filter)) filter = null; // nothing of that kind any more
    els.attention.hidden = parts.length === 0;
    // Each part a filter (audit #13): the items it counts, from every card; tapped again (or Show all), the whole list.
    els.attention.replaceChildren(...parts.flatMap((p, i) => {
      const b = el('button', 'iv-att', p.text);
      b.type = 'button';
      b.dataset.tone = p.tone;
      b.setAttribute('aria-pressed', String(filter === p.key));
      b.addEventListener('click', () => setFilter(filter === p.key ? null : p.key));
      return i ? [DOT, b] : [b];
    }));
    const shown = items.filter((i) => needsLook(i, filter));
    const part = parts.find((p) => p.key === filter);
    els.filterLine.hidden = !part;
    els.filterText.textContent = part ? `Showing only ${part.text}.` : '';
    const open = items.filter((i) => !i.archived);
    const none = items.length === 0;
    els.empty.hidden = !none || data.archivedCount > 0;
    els.allArchived.hidden = !(none && data.archivedCount > 0 && !archived);
    els.groups.replaceChildren(...groupItems(shown).map((g) => groupCard(g, Date.now())));
    els.archivedLine.hidden = data.archivedCount === 0 || Boolean(filter);
    els.archived.textContent = archived ? 'Hide archived' : `Show archived (${data.archivedCount})`;
    if (askedArchived) {
      askedArchived = false;
      const n = data.archivedCount;
      els.archivedSaid.textContent = archived ? `${n} archived item${n === 1 ? '' : 's'} shown, at the end of ${n === 1 ? 'its card' : 'their cards'}.` : 'Archived items hidden.';
    }
    // An empty farm (audit #9): the empty card's Add item is the one thing to do; nothing to record, buy or count yet, and
    // no second Add item in the head.
    const nothing = open.length === 0 && data.archivedCount === 0;
    els.use.hidden = nothing;
    els.purchase.hidden = nothing;
    els.count.hidden = nothing;
    els.add.hidden = nothing;
    els.use.disabled = useItems(items).length === 0; // block items are Batches' (joint audit B1)
    els.purchase.disabled = !open.some((i) => i.kind !== 'blocks');
  }
  function setFilter(key) {
    filter = key;
    paint();
    const pressed = els.attention.querySelector('[aria-pressed="true"]');
    (pressed ?? els.attention.querySelector('button'))?.focus();
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

  const doneLine = createDoneLine(q('[data-done]'), { onUndone: () => load(), onError: showError });
  const done = (result) => {
    load();
    if (result) doneLine.show(result);
  };
  const add = () => openItemDialog({ onDone: done, onLost: showError });
  els.add.addEventListener('click', add);
  q('[data-add-empty]').addEventListener('click', add);
  els.use.addEventListener('click', () => { if (data) openUseDialog({ items: data.items, alive, onDone: done, onLost: showError }); });
  els.purchase.addEventListener('click', () => { if (data) openPurchaseDialog({ items: data.items, suppliers: data.suppliers, onDone: done, onLost: showError }); });
  els.archived.addEventListener('click', () => {
    archived = !archived;
    askedArchived = true; // the focus stays on the toggle; the line beside it says what came (audit #14)
    els.archivedSaid.textContent = '';
    load();
  });
  q('[data-filter-off]').addEventListener('click', () => setFilter(null));
  els.groups.addEventListener('click', (e) => {
    const row = e.target.closest?.('tr.iv-row');
    if (!row || e.target.closest('a, button')) return;
    if (e.button !== 0 || e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || window.getSelection()?.toString()) return;
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
  doneLine.show(takeFlash()); // Count stock's save, said once here (it left for this page)

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    doneLine.destroy();
    for (const off of offLive) off();
  };
}

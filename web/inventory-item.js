// An item's page, #/business/inventory/<id> (spec 2026-11-05-inventory-design.md 5): its tiles (In stock, Reorder at, Last
// counted), its lots with their use-by and Throw out, and its history newest first (20, then Show all) with one quiet Edit a
// row (a count: Delete; a batch move: Batches'). Purchase (not on a block item), Record use, Edit and Archive or Bring back.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { INVENTORY_HASH } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { DOT } from './text-math.js';
import {
  openItemDialog, openPurchaseDialog, openUseDialog, openMoveDialog, openDeleteDialog, openThrowOutDialog, openArchiveDialog, bringBack,
} from './inventory-dialogs.js';
import { farmDate } from './tasks-math.js';
import { pillNode } from './inventory-page.js';
import { qtyText, countedText, lotLabel, lotPill, moveLine, dayText, KIND_ONE } from './inventory-math.js';

const REFRESH_MS = 60_000;
const HISTORY_SHOWN = 20;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <a class="back iv-back" data-back>Inventory</a>
      <h1 class="page-title" tabindex="-1" data-title>Loading…</h1>
      <p class="page-sub" data-sub></p>
    </div>
    <div class="iv-tools" data-tools hidden>
      <button type="button" class="primary" data-use>Record use</button>
      <button type="button" data-purchase>Purchase</button>
      <button type="button" data-edit>Edit</button>
      <button type="button" data-archive>Archive</button>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <div class="iv-item" data-body hidden>
    <section class="card iv-figures" aria-label="Figures">
      <div class="us-tiles iv-tiles" data-tiles></div>
    </section>
    <section class="card iv-lots" data-lots-card aria-labelledby="iv-lots-title" hidden>
      <h2 id="iv-lots-title">Lots</h2>
      <div class="us-table-wrap"><table class="us-table iv-lot-table">
        <caption class="sr-only">Lots</caption>
        <thead><tr><th scope="col">Bought</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Left</th><th scope="col">Use by</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
        <tbody data-lots></tbody>
      </table></div>
    </section>
    <section class="card iv-history" aria-labelledby="iv-history-title">
      <h2 id="iv-history-title" tabindex="-1" data-history-title>History</h2>
      <p class="none" data-no-history hidden>Nothing recorded yet.</p>
      <ul class="iv-moves" data-moves></ul>
      <button type="button" class="iv-link" data-all hidden></button>
    </section>
  </div>
  <section class="card iv-empty" data-gone hidden>
    <p class="none">That item no longer exists.</p>
    <a class="button" data-gone-back>Back to Inventory</a>
  </section>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function tile(label, value, line = null) {
  const t = el('div', 'us-tile');
  t.append(el('p', 'us-label', label), el('p', 'us-kwh', value));
  if (line) t.append(el('p', 'us-basis', line));
  return t;
}

let mountSeq = 0;

export function mount(container, { id }) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    title: q('[data-title]'), sub: q('[data-sub]'), tools: q('[data-tools]'), use: q('[data-use]'), purchase: q('[data-purchase]'),
    edit: q('[data-edit]'), archive: q('[data-archive]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), body: q('[data-body]'),
    tiles: q('[data-tiles]'), lotsCard: q('[data-lots-card]'), lots: q('[data-lots]'), moves: q('[data-moves]'), noHistory: q('[data-no-history]'),
    all: q('[data-all]'), gone: q('[data-gone]'),
  };
  q('[data-back]').href = INVENTORY_HASH;
  q('[data-gone-back]').href = INVENTORY_HASH;
  document.title = 'Inventory · Mushroom farm';

  let data = null; // GET /api/inventory/items/:id
  let showAll = false;
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  const showError = (text) => {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  };
  const done = () => load();

  function paint() {
    const key = JSON.stringify([data, showAll, farmDate(Date.now())]);
    if (key === painted) return;
    painted = key;
    const it = data;
    const blocks = it.kind === 'blocks';
    els.title.textContent = it.name;
    document.title = `${it.name} · Inventory · Mushroom farm`;
    els.sub.textContent = [KIND_ONE[it.kind] ?? it.kind, `counted in ${it.unit}`, it.ingredient, it.lrmpNo && `LRMP No. ${it.lrmpNo}`].filter(Boolean).join(DOT);
    els.tools.hidden = false;
    els.purchase.hidden = blocks || it.archived;
    els.use.hidden = it.archived;
    els.archive.hidden = blocks;
    els.archive.textContent = it.archived ? 'Bring back' : 'Archive';
    els.body.hidden = false;

    const counted = countedText(it.lastCountedAt, Date.now());
    const pill = it.useBy ? `${it.useBy.state === 'expired' ? 'Expired' : 'Use by'} ${dayText(it.useBy.date)}` : null;
    const stockTile = tile('In stock', qtyText(it.qty, it.unit), [it.low ? 'Low' : null, pill].filter(Boolean).join(DOT) || null);
    const expired = it.useBy?.state === 'expired' || it.lots.some((l) => l.state === 'expired');
    if (expired) stockTile.querySelector('.us-kwh').dataset.tone = 'warn';
    else if (it.low) stockTile.querySelector('.us-kwh').dataset.tone = 'amber';
    els.tiles.replaceChildren(
      stockTile,
      tile('Reorder at', it.reorderAt === null ? '—' : qtyText(it.reorderAt, it.unit), it.reorderAt === null ? 'No level set' : null),
      tile('Last counted', counted.text),
    );

    els.lotsCard.hidden = it.lots.length === 0;
    els.lots.replaceChildren(...it.lots.map((lot) => {
      const tr = el('tr');
      const head = el('th', '', lotLabel(lot));
      head.scope = 'row';
      const useBy = el('td', 'iv-lot-useby');
      const lp = lotPill(lot);
      if (lp) useBy.append(pillNode(lp));
      else useBy.textContent = lot.useBy ? dayText(lot.useBy) : '—';
      const action = el('td', 'iv-lot-action');
      if (lot.state) {
        const b = el('button', 'danger-text', 'Throw out');
        b.type = 'button';
        b.addEventListener('click', () => openThrowOutDialog({ lot, item: it, onDone: done, onLost: showError, alive }));
        action.append(b);
      }
      tr.append(head, el('td', 'num iv-lot-qty', qtyText(lot.qty, it.unit)), el('td', 'num iv-lot-left', qtyText(lot.left, it.unit)), useBy, action);
      return tr;
    }));

    const moves = showAll ? it.moves : it.moves.slice(0, HISTORY_SHOWN);
    els.noHistory.hidden = it.moves.length > 0;
    els.moves.replaceChildren(...moves.map((m) => {
      const line = moveLine(m, it);
      const li = el('li', 'iv-move');
      const text = el('div', 'iv-move-text');
      text.append(el('span', 'iv-move-what', line.what), el('span', 'iv-move-when', line.when));
      li.append(text, el('span', 'iv-move-qty', line.qty));
      if (line.edit === null) {
        li.append(el('span', 'iv-move-note', 'Change it in Batches'));
      } else {
        const b = el('button', 'iv-link iv-move-edit', line.edit === 'edit' ? 'Edit' : 'Delete');
        b.type = 'button';
        const throwOuts = it.moves.some((x) => x.lotId === m.id);
        b.addEventListener('click', () => (line.edit === 'edit'
          ? openMoveDialog({ move: m, item: it, suppliers: it.suppliers, reasons: it.reasons, throwOuts, onDone: done, onLost: showError, alive })
          : openDeleteDialog({ move: m, item: it, throwOuts, onDone: done, onLost: showError })));
        li.append(b);
      }
      return li;
    }));
    els.all.hidden = showAll || it.moves.length <= HISTORY_SHOWN;
    els.all.textContent = `Show all ${it.moves.length}`;
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', `/api/inventory/items/${id}`);
      if (!alive() || mine !== seq) return;
      data = reply;
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      if (err.status === 404 && !routeMissing(err)) {
        els.body.hidden = true;
        els.tools.hidden = true;
        els.gone.hidden = false;
        els.title.textContent = 'Item';
        els.banner.hidden = true;
        document.title = 'Inventory · Mushroom farm';
        return;
      }
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  els.use.addEventListener('click', () => { if (data) openUseDialog({ items: [data], itemId: data.id, reasons: data.reasons, onDone: done, onLost: showError, alive }); });
  els.purchase.addEventListener('click', () => { if (data) openPurchaseDialog({ items: [data], itemId: data.id, suppliers: data.suppliers, onDone: done, onLost: showError }); });
  els.edit.addEventListener('click', () => { if (data) openItemDialog({ item: data, hasMoves: data.moves.length > 0, onDone: done, onLost: showError }); });
  els.archive.addEventListener('click', async () => {
    if (!data) return;
    if (!data.archived) {
      openArchiveDialog({ item: data, onDone: done, onLost: showError });
      return;
    }
    els.archive.disabled = true;
    const r = await bringBack(data);
    els.archive.disabled = false;
    if (r === true || r.stale) load();
    if (r !== true) showError(r.message);
  });
  els.all.addEventListener('click', () => {
    const before = data.moves.length > HISTORY_SHOWN ? HISTORY_SHOWN : 0;
    showAll = true;
    paint();
    const rows = [...els.moves.children].slice(before);
    (rows.map((r) => r.querySelector('button')).find(Boolean) ?? q('[data-history-title]')).focus();
  });
  q('[data-retry]').addEventListener('click', () => load());

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('inventory', (d) => { if (d?.itemId === null || d?.itemId === undefined || d.itemId === id) reload.call(); }),
    live.on('room', (d) => { if (d.part === 'room') reload.call(); }), // a room renamed or deleted: the history names it
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

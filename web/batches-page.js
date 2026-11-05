// The Batches page, #/business/batches, and a batch's page, #/business/batches/<id> (spec 2026-11-05-batches-design.md 7):
// the batches waiting, in the rooms' current runs and past (one run's with ?run=); a batch's details, its delivery and its
// contamination checks, with its actions. Both read again on the batches events, a room's crop or name change (a run starts
// or ends), when the stream comes back, and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { picture } from './pictures.js';
import { DOT } from './text-math.js';
import { farmDate } from './tasks-math.js';
import { BATCHES_HASH, batchHash, batchSheetHash, roomHash } from './route.js';
import { createBatchDialogs } from './batches-dialogs.js';
import { closeTaskDialog } from './task-dialogs.js';
import {
  pageGroups, pastIn, PAST_RANGES, PAST_COLUMNS, pastCells, waitingLine, placedLine, goodText, cropBlocks, detailFacts, overNote,
  statusLine, checkLine, deliveryLine, fullDate, dateText, countBlocks,
} from './batches-math.js';

const REFRESH_MS = 60_000;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className = '') {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

// How a page stays current; load() is the page's, timerOf(ms) its slow timer while the stream is down. → stop().
function keepCurrent(load, timerOf) {
  const reload = createThrottle(load);
  const offs = [
    live.on('batches', () => reload.call()),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),
    live.onStatus((up) => { if (up) reload.call(); else timerOf(REFRESH_MS); }),
  ];
  return () => {
    reload.cancel();
    for (const off of offs) off();
  };
}

// A page's read: GET path, paint(data); the banner on a failure; the fallback timer. → { load, stop }.
function reader(path, paint, els, alive) {
  let seq = 0;
  let timer = null;
  let outdated = false;
  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', path());
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(data);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      if (err.status === 404 && !routeMissing(err)) { paint(null); return; } // the batch is gone
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }
  const stopLive = keepCurrent(() => { if (alive()) load(); }, (ms) => {
    if (outdated) return;
    clearTimeout(timer);
    timer = setTimeout(load, ms);
  });
  return { load, stop: () => { clearTimeout(timer); stopLive(); } };
}

const BANNER = `<div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>`;

// A batch's row: its picture, its name (a link to it), a line of words, its blocks, and an optional action.
function batchRow(b, line, action = null) {
  const row = el('div', 'bt-row');
  const words = el('div', 'bt-words');
  const name = el('a', 'bt-name', cropBlocks(b.crop));
  name.href = batchHash(b.id);
  words.append(name, el('p', 'bt-line', line));
  row.append(picture('crop', b.crop, { size: 32 }), words, el('span', 'bt-count', goodText(b)));
  if (action) row.append(action);
  return row;
}

// After a dialog changed the data: the cursor goes back to the button that opened it (by its data-focus-key) once the page has
// painted, else to the page's title (that button is gone: the row moved, the batch folded). → { wait(key), settle() }.
function focusAfterChange(container) {
  let waiting = false;
  let key = null;
  function settle(tries = 20) {
    if (!waiting) return;
    if (document.querySelector('dialog[open]') && tries > 0) { setTimeout(() => settle(tries - 1), 50); return; } // the dialog is still closing
    waiting = false;
    const node = key ? container.querySelector(`[data-focus-key="${key}"]`) : null;
    (node && !node.disabled ? node : container.querySelector('h1'))?.focus();
  }
  return { wait(k) { waiting = true; key = k; }, settle: () => settle() };
}

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

// ---- the Batches page ----

const LIST = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Batches</h1>
      <p class="page-sub">Where each run's blocks come from: the supplier, the spawn batch, the blocks and their price.</p>
    </div>
    <div class="bt-tools">
      <button type="button" class="primary" data-receive>Receive blocks</button>
      <a class="button" data-csv download>Export CSV</a>
      <a class="button" data-sheet>myGAP 4-2 sheet</a>
    </div>
  </div>
  ${BANNER}
  <p class="bt-filter" data-filter hidden>Batches of one run. <a href="${BATCHES_HASH}">All batches</a></p>
  <section class="card bt-card" aria-labelledby="bt-waiting-title"><h2 id="bt-waiting-title">Waiting</h2><div data-waiting><p class="none">Loading…</p></div></section>
  <section class="card bt-card" aria-labelledby="bt-rooms-title"><h2 id="bt-rooms-title">In rooms</h2><div data-rooms></div></section>
  <section class="card bt-card" aria-labelledby="bt-past-title">
    <div class="card-head"><h2 id="bt-past-title">Past</h2><div class="range-bar bt-range" role="group" aria-label="Received in" data-range></div></div>
    <div data-past></div>
  </section>`;

export function mount(container, { run = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = LIST;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'), bannerText: q('[data-banner-text]'), waiting: q('[data-waiting]'), rooms: q('[data-rooms]'),
    past: q('[data-past]'), range: q('[data-range]'),
  };
  document.title = 'Batches · Mushroom farm';
  q('[data-filter]').hidden = run === null;
  q('[data-csv]').href = '/api/batches.csv';
  q('[data-sheet]').href = batchSheetHash(farmDate(Date.now() - 89 * 86_400_000), farmDate(Date.now()));

  let list = null;
  let days = run === null ? 90 : null; // one run's batches: all the past ones of it
  const refocus = focusAfterChange(container);
  let painted = '';
  const showError = (text) => { els.bannerText.textContent = text; els.banner.hidden = false; };
  const read = reader(() => (run === null ? '/api/batches' : `/api/batches?run=${run}`), (data) => { list = data?.batches ?? []; paint(); refocus.settle(); }, els, alive);
  const dialogs = createBatchDialogs({
    onChanged: () => { if (alive()) { refocus.wait(dialogs.openerKey()); read.load(); } }, onError: showError, alive,
  });
  q('[data-receive]').addEventListener('click', () => dialogs.receive());
  q('[data-retry]').addEventListener('click', () => read.load());

  const ranges = PAST_RANGES.map(([n, label]) => {
    const b = button(label);
    b.addEventListener('click', () => { days = n; painted = ''; paint(); });
    els.range.append(b);
    return [n, b];
  });

  function pastTable(rows, today) {
    const wrap = el('div', 'us-table-wrap');
    const t = el('table', 'us-table bt-past-table');
    t.append(el('caption', 'sr-only', 'Past batches'));
    const head = el('tr');
    PAST_COLUMNS.forEach((c, i) => {
      const th = el('th', [4, 5, 6].includes(i) ? 'num' : '', c);
      th.scope = 'col';
      head.append(th);
    });
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const b of rows) {
      const tr = el('tr');
      pastCells(b, today).forEach((text, i) => {
        const cellEl = el(i === 0 ? 'th' : 'td', [4, 5, 6].includes(i) ? 'num' : '');
        cellEl.dataset.label = PAST_COLUMNS[i]; // a phone shows each figure under its name
        if (i === 0) {
          cellEl.scope = 'row';
          const a = el('a', '', text);
          a.href = batchHash(b.id);
          cellEl.append(a);
        } else {
          cellEl.textContent = text;
        }
        tr.append(cellEl);
      });
      body.append(tr);
    }
    t.append(thead, body);
    wrap.append(t);
    return wrap;
  }

  function paint() {
    if (!list) return;
    const today = farmDate(Date.now()); // read at each paint: past midnight the dates and the past filter move on
    const key = JSON.stringify([list, days, today]);
    if (key === painted) return;
    painted = key;
    for (const [n, b] of ranges) b.setAttribute('aria-pressed', String(n === days));
    const g = pageGroups(list);
    const now = Date.now();
    els.waiting.replaceChildren(...(g.waiting.length ? g.waiting.map((b) => {
      const put = button('Put into a room');
      put.dataset.focusKey = `put-${b.id}`;
      put.setAttribute('aria-label', `Put ${countBlocks(b.good, b.crop)} into a room`);
      put.disabled = b.good < 1;
      if (put.disabled) put.title = 'Every block was lost';
      put.addEventListener('click', () => dialogs.place(b));
      return batchRow(b, waitingLine(b, now), put);
    }) : [el('p', 'none', 'No blocks waiting.')]));
    els.rooms.replaceChildren(...(g.rooms.length ? g.rooms.map((r) => {
      const group = el('div', 'bt-group-room');
      const h = el('h3', 'bt-room-head');
      const a = el('a', '', r.roomName);
      a.href = roomHash(r.roomId, 'harvest');
      h.append(a, `${DOT}run since ${dateText(r.runStartedAt, today)}`);
      group.append(h, ...r.batches.map((b) => batchRow(b, placedLine(b, today))), ...r.over.map((t) => el('p', 'bt-over', t)));
      return group;
    }) : [el('p', 'none', "No batches in a room's current run.")]));
    const past = pastIn(g.past, days, now);
    els.past.replaceChildren(past.length ? pastTable(past, today) : el('p', 'none', days === null ? 'No past batches.' : `No past batches received in the last ${PAST_RANGES.find(([n]) => n === days)[1]}.`));
  }

  read.load();
  return function unmount() {
    mountSeq++;
    read.stop();
    closeTaskDialog(); // a dialog of this page closes with it
  };
}

// ---- a batch ----

const ONE = `
  <a class="back" href="${BATCHES_HASH}">Batches</a>
  <div class="page-head">
    <div class="page-titles bt-titles">
      <span class="bt-pic" data-pic></span>
      <div>
        <h1 class="page-title" tabindex="-1" data-title>Loading…</h1>
        <p class="page-sub" data-sub></p>
      </div>
    </div>
    <div class="bt-tools" data-actions></div>
  </div>
  ${BANNER}
  <div data-body hidden>
    <p class="bt-over" data-over hidden></p>
    <section class="card bt-card" aria-labelledby="bt-details-title"><h2 id="bt-details-title">Details</h2><dl class="bt-facts" data-facts></dl></section>
    <section class="card bt-card" aria-labelledby="bt-delivery-title" data-delivery-card hidden><h2 id="bt-delivery-title">Delivery</h2><div data-delivery></div></section>
    <section class="card bt-card" aria-labelledby="bt-checks-title">
      <div class="card-head"><h2 id="bt-checks-title">Contamination</h2><span data-add-check></span></div>
      <div data-checks></div>
    </section>
  </div>
  <section class="card bt-card" data-gone hidden><p class="none">No such batch.</p><a href="${BATCHES_HASH}">Back to Batches</a></section>`;

export function mountBatch(container, { id }) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = ONE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'), bannerText: q('[data-banner-text]'), title: q('[data-title]'), sub: q('[data-sub]'), pic: q('[data-pic]'),
    actions: q('[data-actions]'), body: q('[data-body]'), over: q('[data-over]'), facts: q('[data-facts]'), deliveryCard: q('[data-delivery-card]'),
    delivery: q('[data-delivery]'), addCheck: q('[data-add-check]'), checks: q('[data-checks]'), gone: q('[data-gone]'),
  };
  document.title = 'Batch · Mushroom farm';
  let painted = '';
  const refocus = focusAfterChange(container);
  const showError = (text) => { els.bannerText.textContent = text; els.banner.hidden = false; };
  const read = reader(() => `/api/batches/${id}`, (b) => { paint(b); refocus.settle(); }, els, alive);
  const dialogs = createBatchDialogs({
    onChanged: () => { if (alive()) { refocus.wait(dialogs.openerKey()); read.load(); } }, onError: showError, alive,
  });
  q('[data-retry]').addEventListener('click', () => read.load());

  function paint(b) {
    if (!b) {
      els.banner.hidden = true;
      els.body.hidden = true;
      els.actions.replaceChildren();
      els.title.textContent = 'Batch';
      els.sub.textContent = '';
      els.gone.hidden = false;
      return;
    }
    const today = farmDate(Date.now());
    const key = JSON.stringify([b, today]);
    if (key === painted) return;
    painted = key;
    document.title = `${cropBlocks(b.crop)} · Mushroom farm`;
    els.gone.hidden = true;
    els.body.hidden = false;
    els.pic.replaceChildren(picture('crop', b.crop, { size: 40 }));
    els.title.textContent = cropBlocks(b.crop);
    els.sub.textContent = [`Received ${fullDate(b.receivedAt)}`, b.supplier, statusLine(b)].filter(Boolean).join(DOT);

    const actions = [];
    if (b.status === 'waiting') {
      const put = button('Put into a room', 'primary');
      put.dataset.focusKey = 'put';
      put.disabled = b.good < 1;
      if (put.disabled) put.title = 'Every block was lost';
      put.addEventListener('click', () => dialogs.place(b));
      actions.push(put);
    } else if (b.status === 'placed') {
      const out = button('Take out');
      out.dataset.focusKey = 'take-out';
      out.addEventListener('click', () => dialogs.takeOut(b));
      actions.push(out);
    }
    const edit = button('Edit');
    edit.dataset.focusKey = 'edit';
    edit.addEventListener('click', () => dialogs.edit(b));
    const del = button('Delete', 'danger-text');
    del.addEventListener('click', () => dialogs.remove(b, () => { location.hash = BATCHES_HASH; }));
    els.actions.replaceChildren(...actions, edit, del);

    const over = overNote(b);
    els.over.hidden = !over;
    els.over.textContent = over ?? '';
    els.facts.replaceChildren(...detailFacts(b).map(([label, value]) => {
      const row = el('div');
      row.append(el('dt', '', label), el('dd', '', value));
      return row;
    }));

    els.deliveryCard.hidden = b.delivery.length < 2;
    els.delivery.replaceChildren(...b.delivery.map((x) => {
      const row = el('p', 'bt-delivery-row');
      if (x.id === b.id) {
        row.append(el('strong', '', deliveryLine(x)), el('span', 'muted', ' (this one)'));
      } else {
        const a = el('a', '', deliveryLine(x));
        a.href = batchHash(x.id);
        row.append(a);
      }
      return row;
    }));

    const add = button('Record a check');
    add.dataset.focusKey = 'check';
    add.disabled = b.good < 1;
    add.addEventListener('click', () => dialogs.check(b));
    els.addCheck.replaceChildren(add);
    els.checks.replaceChildren(...(b.checks.length ? b.checks.map((c) => {
      const row = el('div', 'bt-check');
      row.append(el('p', 'bt-line', checkLine(c, today)));
      if (c.note) row.append(el('p', 'muted bt-note', c.note));
      const editCheck = button('Edit', 'bt-quiet');
      editCheck.dataset.focusKey = `edit-check-${c.id}`;
      editCheck.setAttribute('aria-label', `Edit the check of ${fullDate(c.at)}`);
      editCheck.addEventListener('click', () => dialogs.check(b, c));
      row.append(editCheck);
      return row;
    }) : [el('p', 'none', 'No contamination recorded.')]));
  }

  read.load();
  return function unmount() {
    mountSeq++;
    read.stop();
    closeTaskDialog(); // a dialog of this page closes with it
  };
}

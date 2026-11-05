// The Batches page, #/business/batches, and a batch's page, #/business/batches/<id> (spec 2026-11-05-batches-design.md 7):
// the batches being made and waiting, in the rooms' current runs and past (one run's with ?run=); a batch's details, its
// delivery, its contamination checks and, a made one's, its Making card, with its actions. Both read again on the batches events, a room's crop or name change (a run starts
// or ends), when the stream comes back, and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { picture } from './pictures.js';
import { DOT } from './text-math.js';
import { farmDate } from './tasks-math.js';
import { BATCHES_HASH, batchHash, batchSheetHash, roomHash } from './route.js';
import { createBatchDialogs } from './batches-dialogs.js';
import { makingNodes } from './batches-making.js';
import { closeTaskDialog } from './task-dialogs.js';
import { tileNodes } from './harvest-card.js';
import {
  pageGroups, pastIn, PAST_RANGES, PAST_COLUMNS, pastCells, waitingLine, placedLine, goodText, cropBlocks, detailFacts, overNote,
  statusLine, checkLine, deliveryLine, fullDate, dateText, countBlocks, figureLine, waitingLong, runOf, runYieldFacts, statusText, placeable, csvHref,
  nextStep, rowAction,
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

// Put into a room for a batch's head (its accessible name starts with its words); with no good block, aria-disabled (Tab
// still reaches it) with its reason in words under it. → the node.
function putAction(b, dialogs, { focusKey, primary = false }) {
  const put = button('Put into a room', primary ? 'primary' : '');
  put.dataset.focusKey = focusKey;
  put.setAttribute('aria-label', `Put into a room: ${countBlocks(b.good, b.crop)}`);
  put.addEventListener('click', () => { if (put.getAttribute('aria-disabled') !== 'true') dialogs.place(b); });
  if (b.good >= 1) return put;
  put.setAttribute('aria-disabled', 'true');
  const wrap = el('span', 'bt-act');
  const why = el('span', 'bt-reason', 'Every block was lost');
  why.id = `bt-why-${b.id}`;
  put.setAttribute('aria-describedby', why.id);
  wrap.append(put, why);
  return wrap;
}

// The Waiting card's row action (rowAction): a waiting batch's Put into a room; a making one's next step as a quiet button
// (as In rooms' Record a check), named with its blocks ("Record a load: 400 Grey oyster blocks"); with no good block the
// words "Every block was lost" alone. One focus key a row, so the cursor comes back to its next action after a change.
const ROW_DIALOGS = { put: 'place', load: 'sterilise', inoculate: 'inoculate', ready: 'ready' };
function rowNode(b, dialogs, today) {
  const act = rowAction(b, today);
  if (!act) return b.good >= 1 ? null : el('span', 'bt-act bt-reason', 'Every block was lost');
  const go = button(act.label, b.status === 'making' ? 'bt-quiet bz-quiet' : '');
  go.dataset.focusKey = `act-${b.id}`;
  go.setAttribute('aria-label', `${act.label}: ${countBlocks(act.key === 'put' || act.key === 'ready' ? b.good : b.blocks, b.crop)}`);
  go.addEventListener('click', () => dialogs[ROW_DIALOGS[act.key]](b));
  return go;
}

const BANNER = `<div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>`;

// A batch's row: its picture, its name (a link to it, its hit area the whole row), a line of words, its blocks, and an
// optional action (above the link).
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
      <p class="page-sub">Where each run's blocks come from: bought or made on the farm, their spawn, blocks and price.</p>
    </div>
    <div class="bt-tools">
      <button type="button" class="primary" data-receive>Receive blocks</button>
      <button type="button" data-make>Make blocks</button>
      <button type="button" data-recipes data-focus-key="recipes">Recipes</button>
      <a class="button" data-csv download>Export CSV</a>
      <a class="button" data-sheet>myGAP 4-2 sheet</a>
    </div>
  </div>
  ${BANNER}
  <p class="bt-filter" data-filter hidden>Batches of one run. <a href="${BATCHES_HASH}">All batches</a></p>
  <section class="card bt-card" aria-labelledby="bt-waiting-title"><h2 id="bt-waiting-title">Waiting</h2><div class="bt-rows" data-waiting><p class="none">Loading…</p></div></section>
  <section class="card bt-card" aria-labelledby="bt-rooms-title"><h2 id="bt-rooms-title">In rooms</h2><div class="bt-rows" data-rooms><p class="none">Loading…</p></div></section>
  <section class="card bt-card" aria-labelledby="bt-past-title">
    <div class="card-head"><h2 id="bt-past-title">Past</h2><div class="range-bar bt-range" role="group" aria-label="Received in" data-range></div></div>
    <div data-past><p class="none">Loading…</p></div>
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
  const csvLink = q('[data-csv]');
  csvLink.href = '/api/batches.csv';
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
  q('[data-make]').addEventListener('click', () => dialogs.mix()); // on to the new batch's page: no focus key
  q('[data-recipes]').addEventListener('click', () => dialogs.recipes());
  q('[data-retry]').addEventListener('click', () => read.load());

  const ranges = PAST_RANGES.map(([n, label]) => {
    const b = button(label);
    b.addEventListener('click', () => { days = n; painted = ''; csvLink.href = csvHref(n, farmDate(Date.now())); paint(); });
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
          const a = el('a', 'bt-past-link', text); // its hit area the whole row
          a.href = batchHash(b.id);
          a.setAttribute('aria-label', `${cropBlocks(b.crop)} received ${text}`);
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
    // the made batches still being made above the waiting ones, with their status line and their next step (spec 7)
    const waiting = [...g.making, ...g.waiting];
    els.waiting.replaceChildren(...(waiting.length ? waiting.map((b) => batchRow(b, b.kind === 'made' ? statusText(b, today) : waitingLine(b, now),
      rowNode(b, dialogs, today)))
      : [el('p', 'none', 'No blocks waiting. Receive blocks when a delivery comes in.')]));
    // an in-room row: Record a check, the phone's way to it (the batch's page has it too)
    const checkAction = (b) => {
      if (b.good < 1) return null;
      const add = button('Record a check', 'bt-quiet bz-quiet');
      add.dataset.focusKey = `check-${b.id}`;
      add.setAttribute('aria-label', `Record a check: ${countBlocks(b.blocks, b.crop)}`);
      add.addEventListener('click', () => dialogs.check(b));
      return add;
    };
    els.rooms.replaceChildren(...(g.rooms.length ? g.rooms.map((r) => {
      const group = el('div', 'bt-group-room');
      const h = el('h3', 'bt-room-head');
      const a = el('a', '', r.roomName);
      a.href = roomHash(r.roomId, 'harvest');
      h.append(a, `${DOT}run since ${dateText(r.runStartedAt, today)}`);
      group.append(h, ...r.batches.map((b) => batchRow(b, placedLine(b, today), checkAction(b))), ...r.over.map((t) => el('p', 'bt-over', t)));
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

// The body: on a desk Details and Delivery at the left, Contamination and This run at the right; on a phone one column in this
// order, Contamination first (the floor's job: record a check), then This run, Details and Delivery. A made batch's Making card
// goes at the top of the left column while the batch is being made, at its foot once it is made (moved in the DOM, so the
// reading and tab order are the order seen).
const ONE = `
  <a class="back" href="${BATCHES_HASH}">Batches</a>
  <div class="page-head">
    <div class="page-titles bt-titles">
      <span class="bt-pic" data-pic></span>
      <div>
        <h1 class="page-title" tabindex="-1" data-title>Loading…</h1>
        <p class="bt-figures" data-figures></p>
        <p class="page-sub" data-sub></p>
      </div>
    </div>
    <div class="bt-tools" data-actions></div>
  </div>
  ${BANNER}
  <div class="bt-batch" data-body hidden>
    <div class="bt-side">
      <section class="card bt-card" aria-labelledby="bt-checks-title">
        <div class="card-head"><h2 id="bt-checks-title">Contamination</h2><span data-add-check></span></div>
        <div data-checks></div>
      </section>
      <section class="card bt-card" aria-labelledby="bt-run-title" data-run-card hidden>
        <h2 id="bt-run-title" data-run-title>This run</h2>
        <div data-run></div>
      </section>
    </div>
    <div class="bt-main">
      <section class="card bt-card bt-making" aria-labelledby="bt-making-title" data-making-card hidden><h2 id="bt-making-title">Making</h2><div data-making></div></section>
      <section class="card bt-card" aria-labelledby="bt-details-title">
        <h2 id="bt-details-title">Details</h2>
        <p class="bt-over" data-over hidden></p>
        <dl class="bt-facts" data-facts></dl>
      </section>
      <section class="card bt-card" aria-labelledby="bt-delivery-title" data-delivery-card hidden><h2 id="bt-delivery-title">Delivery</h2><div data-delivery></div></section>
    </div>
  </div>
  <section class="card bt-card" data-gone hidden><p class="none">No such batch.</p><a href="${BATCHES_HASH}">Back to Batches</a></section>`;

export function mountBatch(container, { id }) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = ONE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'), bannerText: q('[data-banner-text]'), title: q('[data-title]'), figures: q('[data-figures]'), sub: q('[data-sub]'),
    pic: q('[data-pic]'), actions: q('[data-actions]'), body: q('[data-body]'), over: q('[data-over]'), facts: q('[data-facts]'),
    deliveryCard: q('[data-delivery-card]'), delivery: q('[data-delivery]'), addCheck: q('[data-add-check]'), checks: q('[data-checks]'),
    gone: q('[data-gone]'), runCard: q('[data-run-card]'), runTitle: q('[data-run-title]'), run: q('[data-run]'),
    makingCard: q('[data-making-card]'), making: q('[data-making]'), main: q('.bt-main'),
  };
  document.title = 'Batch · Mushroom farm';
  let painted = '';
  let batch = null; // the last read
  const refocus = focusAfterChange(container);
  const showError = (text) => { els.bannerText.textContent = text; els.banner.hidden = false; };
  const read = reader(() => `/api/batches/${id}`, (b) => { paint(b); refocus.settle(); loadRun(); }, els, alive);
  const dialogs = createBatchDialogs({
    onChanged: () => { if (alive()) { refocus.wait(dialogs.openerKey()); read.load(); } }, onError: showError, alive,
  });
  q('[data-retry]').addEventListener('click', () => read.load());

  // This run (a placed or past batch whose room is still there): the room's harvests, read only; again on its harvest events.
  let runSeq = 0;
  let runPainted = '';
  async function loadRun() {
    const b = batch;
    const mine = ++runSeq;
    if (!b || b.status === 'waiting' || !Number.isInteger(b.roomId) || !Number.isInteger(b.runId)) { els.runCard.hidden = true; return; }
    let facts = null;
    try {
      // the run's batches (its block cost for the per-kg line, as Costs; why a BE is a dash) read with the harvests; without
      // them the tiles still show, the cost line does not
      const [harvests, runReply] = await Promise.all([
        request('GET', `/api/rooms/${b.roomId}/harvests`),
        request('GET', `/api/batches?run=${b.runId}`).catch(() => null),
      ]);
      facts = runYieldFacts(runOf(harvests, b.runId), b, runReply);
    } catch {
      facts = null; // a deleted room (404) or no answer: the card stays away rather than show a wrong figure
    }
    if (!alive() || mine !== runSeq) return;
    const key = JSON.stringify(facts);
    if (key === runPainted) return;
    runPainted = key;
    els.runCard.hidden = !facts;
    if (!facts) return;
    els.runTitle.textContent = facts.title;
    if (facts.empty) { els.run.replaceChildren(el('p', 'none', facts.empty)); return; }
    const tiles = el('div', 'us-tiles hv-tiles bt-run-tiles');
    tiles.append(...tileNodes(facts.tiles));
    els.run.replaceChildren(tiles, ...(facts.reason ? [el('p', 'bt-run-cost bt-run-reason', facts.reason)] : []), ...(facts.cost ? [el('p', 'bt-run-cost', facts.cost)] : []));
  }
  const reloadRun = createThrottle(() => { if (alive()) loadRun(); });
  const offHarvest = live.on('harvest', (d) => { if (d.roomId === null || d.roomId === batch?.roomId) reloadRun.call(); });

  function paint(b) {
    batch = b;
    if (!b) {
      els.banner.hidden = true;
      els.body.hidden = true;
      els.actions.replaceChildren();
      els.title.textContent = 'Batch';
      els.figures.textContent = '';
      els.sub.textContent = '';
      els.gone.hidden = false;
      return;
    }
    const today = farmDate(Date.now());
    const key = JSON.stringify([b, today]);
    if (key === painted) return;
    painted = key;
    const made = b.kind === 'made';
    const name = made ? `${countBlocks(b.blocks, b.crop)}${DOT}made` : countBlocks(b.blocks, b.crop);
    document.title = `${name} · Mushroom farm`;
    els.gone.hidden = true;
    els.body.hidden = false;
    els.pic.replaceChildren(picture('crop', b.crop, { size: 40 }));
    els.title.textContent = name;
    els.figures.textContent = figureLine(b);
    // "Received 3 Nov · Agro Supplies · In Container 1", the room a link to its Harvest tab while the batch is in it; a made
    // batch's: its status line ("Inoculated 4 Nov", "In Container 1")
    const status = made ? statusText(b, today) : statusLine(b);
    let statusNode = status;
    if (b.status === 'placed' && Number.isInteger(b.roomId)) {
      statusNode = el('a', 'bt-room-link', status);
      statusNode.href = roomHash(b.roomId, 'harvest');
    }
    if (made) els.sub.replaceChildren(statusNode);
    else els.sub.replaceChildren([`Received ${dateText(b.receivedAt, today).replace(/ /g, '\u00a0')}`, b.supplier].filter(Boolean).join(DOT) + DOT, statusNode);

    const onGone = () => { if (alive()) location.hash = BATCHES_HASH; };
    const actions = [];
    if (placeable(b)) { // while making, the primary is the Making card's next step, Put into a room only once it is next
      actions.push(putAction(b, dialogs, { focusKey: 'put', primary: b.status !== 'making' || nextStep(b, today) === 'put' }));
    } else if (b.status === 'placed') {
      const out = button('Take out');
      out.dataset.focusKey = 'take-out';
      out.addEventListener('click', () => dialogs.takeOut(b));
      actions.push(out);
    }
    // Delete is inside Edit, a quiet red button at its footer's start (as Harvest's); a made batch's Edit opens Edit the mix
    // (the Making card's Mix step names it so: this one is "Edit this batch")
    const edit = button('Edit');
    edit.dataset.focusKey = 'edit';
    if (made) edit.setAttribute('aria-label', 'Edit this batch');
    edit.addEventListener('click', () => (made ? dialogs.mix(b, { onGone }) : dialogs.edit(b, { onGone })));
    els.actions.replaceChildren(...actions, edit);

    const over = overNote(b);
    els.over.hidden = !over;
    els.over.textContent = over ?? '';
    els.facts.replaceChildren(...detailFacts(b, today).map(([label, value]) => {
      const row = el('div');
      row.append(el('dt', '', label), el('dd', '', value));
      return row;
    }));

    els.makingCard.hidden = !made;
    const top = made && b.status === 'making'; // moved only when its place changes: a move would drop the focus inside it
    if (top && els.main.firstElementChild !== els.makingCard) els.main.prepend(els.makingCard);
    if (!top && els.main.lastElementChild !== els.makingCard) els.main.append(els.makingCard);
    els.making.replaceChildren(...(made ? makingNodes(b, dialogs, today, { onGone }) : []));

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
      const editCheck = button('Edit', 'bt-quiet bz-quiet');
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
    reloadRun.cancel();
    offHarvest();
    closeTaskDialog(); // a dialog of this page closes with it
  };
}

// ---- the Today page's "Blocks waiting" (contract 2026-11-05; web/today-page.js mounts it in its Batches block) ----

// host: the Today page's container. A card after its groups, as its Long-term card: the waiting batches received
// BATCH_WAIT_DAYS or more days ago, each a link to its batch; hidden while there are none. Read from GET
// /api/batches?status=waiting, again on the batches events, when the stream comes back and on a timer (the days move on).
// → stop().
export function todayWaiting(host) {
  let on = true;
  let seq = 0;
  let timer = null;
  const card = el('section', 'card td-long bt-today');
  card.hidden = true;
  card.setAttribute('aria-labelledby', 'bt-today-title');
  const title = el('h2', '', 'Blocks waiting');
  title.id = 'bt-today-title';
  const list = el('ul', 'td-long-list');
  card.append(title, list);
  host.append(card);
  let painted = '';
  async function load() {
    if (!on) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const lines = waitingLong((await request('GET', '/api/batches?status=waiting'))?.batches, Date.now());
      if (!on || mine !== seq) return;
      const key = JSON.stringify(lines);
      if (key !== painted) {
        painted = key;
        card.hidden = lines.length === 0;
        list.replaceChildren(...lines.map((x) => {
          const li = el('li');
          const a = el('a', '', x.text);
          a.href = x.href;
          li.append(a);
          return li;
        }));
      }
    } catch {
      // the Today page's own banner says the server is away; this card keeps what it showed
    }
    if (!on) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }
  const reload = createThrottle(() => load());
  const offs = [live.on('batches', () => reload.call()), live.onStatus((up) => { if (up) reload.call(); })];
  load();
  return () => {
    on = false;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offs) off();
    card.remove();
  };
}

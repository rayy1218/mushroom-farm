// The Runs tab, #/business/runs (?crop=), and a run's page, #/business/runs/<id> (spec 2026-11-05-runs-design.md 6): each run
// of blocks with its yield and money; a run's profit so far, its tiles, and its Blocks, Harvests, Sales and Costs, each card
// linking to the module that keeps it. Read only. Both ask again on the harvest, batches, sales and costs events, a room's
// crops or name, when the stream comes back, and on a timer (as Costs); an answer older than the last asked is dropped.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { RUNS_HASH, runsHash, roomHash, batchesRunHash, BATCHES_HASH, SALES_HASH, COSTS_HASH } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { farmDate } from './tasks-math.js';
import { DOT } from './text-math.js';
import { picture } from './pictures.js';
import { tileNodes, missingLine, figureName } from './harvest-card.js';
import {
  flushColumns, flushRows, flushPerCrop, flushSplits, BY_CROP_COLUMNS, byCropRows, harvestLine,
} from './harvest-math.js';
import { SHARED_NOTE } from './costs-math.js';
import {
  LIST_COLUMNS, cropChoices, listRow, emptyText, runTitle, runSub, pageTiles, costsMix, batchRows, SALE_COLUMNS, saleRows,
  salesTotal, costRows, costsTotal, costNotes, tieText, untiedText, countLine, COUNT_TITLE, countLead, countBody, countRange,
} from './runs-math.js';
import { openForm, errorText, closeTaskDialog } from './task-dialogs.js'; // ---- Money truth ---- the block-in day's dialog

const REFRESH_MS = 60_000;
const LISTEN = ['harvest', 'batches', 'sales', 'costs', 'inventory'].filter((type) => EVENT_TYPES.includes(type)); // inventory: a purchase prices made blocks (Money truth)
const PHONE = '(max-width: 600px)';
const BANNER = '<div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>';

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}
// A link in the Business pages' link look (neutral ink, a muted underline: Costs' .co-link).
const link = (text, href) => {
  const a = el('a', 'co-link', text);
  a.href = href;
  return a;
};
// A card's table: its caption for a screen reader, the heads (BE spelt out), the figures from numFrom right-aligned.
function table(caption, heads, rows, className, numFrom = 1) {
  const wrap = el('div', 'us-table-wrap');
  const t = el('table', `us-table ${className}`);
  t.append(el('caption', 'sr-only', caption));
  const head = el('tr');
  heads.forEach((h, i) => {
    const th = el('th', i >= numFrom ? 'num' : '');
    th.append(figureName(h, h === 'BE' ? 'Biological efficiency' : null));
    th.scope = 'col';
    head.append(th);
  });
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  body.append(...rows);
  t.append(thead, body);
  wrap.append(t);
  return wrap;
}
// A table laid out as blocks on a phone (display: block drops a table's meaning): its parts say what they are (ARIA roles),
// so a screen reader still reads a figure with its column. The table named by its caption.
function keepTable(wrap, caption) {
  const t = wrap.querySelector('table');
  t.setAttribute('role', 'table');
  t.setAttribute('aria-label', caption);
  for (const g of t.querySelectorAll('thead, tbody')) g.setAttribute('role', 'rowgroup');
  for (const r of t.querySelectorAll('tr')) r.setAttribute('role', 'row');
  for (const th of t.querySelectorAll('th')) th.setAttribute('role', th.scope === 'col' ? 'columnheader' : 'rowheader');
  for (const td of t.querySelectorAll('td')) td.setAttribute('role', 'cell');
  // where it still scrolls sideways (wider than a phone), its box is a named stop for the keys (setRegions)
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', caption);
  wrap.dataset.region = '';
  wrap.dataset.focusKey = `region-${caption}`;
  return wrap;
}
// The boxes that scroll take a Tab stop; on a phone, where the tables are blocks that never scroll, none.
function setRegions(container, phone) {
  for (const w of container.querySelectorAll('[data-region]')) {
    if (phone) w.removeAttribute('tabindex');
    else w.tabIndex = 0;
  }
}
// After a repaint the cursor goes back to the same link or box (its href and words, or its focus key), as Batches' focus keys.
const keyOf = (node) => node?.dataset?.focusKey ?? (node?.getAttribute?.('href') ? `${node.getAttribute('href')}|${node.textContent}` : null);
function keepFocus(container, repaint) {
  const before = container.contains(document.activeElement) ? keyOf(document.activeElement) : null;
  repaint();
  if (!before || container.contains(document.activeElement)) return;
  const again = [...container.querySelectorAll('a[href], [data-focus-key]')].find((n) => keyOf(n) === before);
  again?.focus({ preventScroll: true });
}

// A row of plain cells: the first names the row.
function plainRow(cells, numFrom = 1) {
  const tr = el('tr');
  cells.forEach((c, i) => {
    const td = el(i === 0 ? 'th' : 'td', i >= numFrom ? 'num' : '', c);
    if (i === 0) td.scope = 'row';
    tr.append(td);
  });
  return tr;
}

// Reads a path now, again on the events, the stream's return and a timer; paint(reply) gets each new answer, fail(err) a
// failure (the last answer stays on show); each paint keeps the cursor where it was (keepFocus) and the scrolling tables' Tab
// stops to the width. → { load, stop } (stop: no more reads, also from inside fail).
function reader(path, { paint, fail, alive, container }) {
  let seq = 0;
  let timer = null;
  let outdated = false;
  let stopped = false;
  async function load() {
    if (!alive() || outdated || stopped) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', path());
      if (!alive() || mine !== seq) return;
      keepFocus(container(), () => paint(reply));
      setRegions(container(), window.matchMedia?.(PHONE).matches ?? false);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      outdated = routeMissing(err);
      fail(err);
      if (outdated || stopped) return;
    }
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }
  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => reload.call())),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }), // a run starts or ends; a room's name
    live.onStatus((up) => { if (up) reload.call(); }),
  ];
  // a phone and a desk: the scrolling boxes' Tab stops follow the width
  const phone = window.matchMedia?.(PHONE);
  const onWidth = () => setRegions(container(), phone.matches);
  phone?.addEventListener('change', onWidth);
  return {
    load,
    stop() {
      phone?.removeEventListener('change', onWidth);
      stopped = true;
      reload.cancel();
      clearTimeout(timer);
      for (const off of offLive) off();
    },
  };
}

// The words of a failed read: an older farm app, no answer, or the server's own.
const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

// ---- the Runs tab ----

const LIST = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Runs</h1>
      <p class="page-sub">Each run of blocks: what it picked, sold and cost.</p>
    </div>
    <div class="field rn-crop">
      <label for="rn-crop">Crop</label>
      <select id="rn-crop" data-crop></select>
    </div>
  </div>
  ${BANNER}
  <section class="card rn-list-card" aria-labelledby="rn-list-title" data-body hidden>
    <h2 id="rn-list-title" class="sr-only">Runs</h2>
    <div data-list></div>
  </section>`;

export function mount(container, { crop = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = LIST;
  const q = (sel) => container.querySelector(sel);
  const els = { crop: q('[data-crop]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), body: q('[data-body]'), list: q('[data-list]') };
  document.title = 'Runs · Mushroom farm';
  let shown = crop;
  let painted = '';
  for (const c of cropChoices()) {
    const o = el('option', '', c.label);
    o.value = c.value;
    els.crop.append(o);
  }
  els.crop.value = shown ?? '';
  // Another crop, in place: the address keeps it (replaced, as Costs' month), the list read again.
  els.crop.addEventListener('change', () => {
    shown = els.crop.value || null;
    history.replaceState(null, '', runsHash(shown));
    els.body.setAttribute('aria-busy', 'true');
    read.load();
  });

  function paint(reply) {
    els.banner.hidden = true;
    els.body.hidden = false;
    els.body.removeAttribute('aria-busy');
    const today = farmDate(Date.now()); // read at each paint: past midnight "since" moves on
    const key = JSON.stringify([reply, today, shown]); // the crop too: its caption changes with it
    if (key === painted) return;
    painted = key;
    if (!reply.runs.length) {
      els.list.replaceChildren(el('p', 'none', emptyText(shown)));
      return;
    }
    const rows = reply.runs.map((run) => {
      const r = listRow(run);
      const tr = el('tr', 'rn-run');
      // the container and Costs' run days name the row and open the run's page
      const name = el('th', 'rn-name');
      name.scope = 'row';
      name.append(link(r.name, r.href));
      const crops = el('td', 'rn-crops');
      crops.dataset.label = LIST_COLUMNS[1];
      const what = el('span', 'co-crop');
      if (r.crop) what.append(picture('crop', r.crop, { size: 24 }));
      what.append(el('span', '', r.crops));
      crops.append(what);
      const figures = r.cells.map((c, i) => {
        const loss = (i === 4 && r.loss) || (i === 5 && r.perKgLoss);
        const td = el('td', i === 4 ? 'num rn-profit' : 'num', loss ? null : c);
        td.dataset.label = LIST_COLUMNS[i + 2];
        // a loss keeps its minus; only the figure takes the loss tone, "Loss" under Profit in words (Costs' runs)
        if (loss) td.append(el('span', 'co-loss', c));
        if (i === 4 && r.loss) td.append(el('span', 'co-sub', 'Loss'));
        if (i === 3 && r.costsLine) td.append(el('span', 'co-sub', r.costsLine));
        return td;
      });
      tr.append(name, crops, ...figures);
      return tr;
    });
    const caption = shown ? `Runs of ${els.crop.selectedOptions[0]?.textContent}` : 'Runs';
    // ---- Money truth ---- the sales that reach no run, with where they are kept
    const untied = untiedText(reply.untied);
    const lead = [];
    if (untied) {
      const p = el('p', 'rn-untied', `${untied} `);
      p.append(link('Sales', SALES_HASH));
      lead.push(p);
    }
    els.list.replaceChildren(...lead, keepTable(table(caption, LIST_COLUMNS, rows, 'rn-table', 2), caption), el('p', 'muted co-runs-note', SHARED_NOTE));
  }
  function fail(err) {
    els.body.removeAttribute('aria-busy');
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }
  const read = reader(() => `/api/runs${shown ? `?crop=${shown}` : ''}`, { paint, fail, alive, container: () => container });
  q('[data-retry]').addEventListener('click', () => read.load());
  read.load();

  return function unmount() {
    mountSeq++;
    read.stop();
  };
}

// ---- a run's page ----

const ONE = `
  <a class="back" href="${RUNS_HASH}" data-back>Runs</a>
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1" data-title>Loading…</h1>
      <p class="page-sub rn-sub" data-sub></p>
    </div>
  </div>
  ${BANNER}
  <div class="rn-page" data-body hidden>
    <section class="card rn-money" aria-labelledby="rn-money-title">
      <h2 id="rn-money-title">Money and yield</h2>
      <div class="us-tiles hv-tiles co-tiles" data-tiles></div>
      <div data-notes></div>
      <div class="rn-count" data-count hidden></div>
    </section>
    <section class="card rn-costs" aria-labelledby="rn-costs-title">
      <div class="card-head"><h2 id="rn-costs-title">Costs</h2><span data-costs-link></span></div>
      <div data-costs></div>
    </section>
    <section class="card rn-blocks" aria-labelledby="rn-blocks-title">
      <div class="card-head"><h2 id="rn-blocks-title">Blocks</h2><span data-blocks-link></span></div>
      <div data-blocks></div>
    </section>
    <section class="card rn-harvests" aria-labelledby="rn-harvests-title">
      <div class="card-head"><h2 id="rn-harvests-title">Harvests</h2><span data-harvests-link></span></div>
      <div data-harvests></div>
    </section>
    <section class="card rn-sales" aria-labelledby="rn-sales-title">
      <div class="card-head"><h2 id="rn-sales-title">Sales</h2><span data-sales-link></span></div>
      <div data-sales></div>
    </section>
  </div>
  <section class="card rn-gone" data-gone hidden><p class="none">No such run. A container's runs go with it when it is deleted.</p><a class="co-link" href="${RUNS_HASH}">Back to Runs</a></section>`;

export function mountRun(container, { id }) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = ONE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    back: q('[data-back]'), title: q('[data-title]'), sub: q('[data-sub]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), body: q('[data-body]'),
    gone: q('[data-gone]'), tiles: q('[data-tiles]'), notes: q('[data-notes]'), blocks: q('[data-blocks]'), blocksLink: q('[data-blocks-link]'),
    harvests: q('[data-harvests]'), harvestsLink: q('[data-harvests-link]'), sales: q('[data-sales]'), salesLink: q('[data-sales-link]'),
    costs: q('[data-costs]'), costsLink: q('[data-costs-link]'), count: q('[data-count]'),
  };
  document.title = 'Run · Mushroom farm';
  let painted = '';

  function paintHead(v, today) {
    const title = runTitle(v);
    els.title.textContent = title;
    document.title = `${title} · Mushroom farm`;
    const s = runSub(v, today);
    // "Container 1 · since 4 Nov": the container a link to its Harvest tab while it is there
    els.sub.replaceChildren(s.roomHref ? link(s.room, s.roomHref) : s.room, `${DOT}${s.dates}`);
  }

  function paintMoney(v) {
    const list = pageTiles(v);
    const nodes = tileNodes(list);
    list.forEach((t, i) => { if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn'; });
    els.tiles.replaceChildren(...nodes);
    // a phone: one long figure sets the others a size down (Costs' month card; Profit has its own row)
    els.tiles.toggleAttribute('data-long', nodes.slice(1).some((n) => n.querySelector('.us-kwh').hasAttribute('data-long')));
    // what the costs are made of: the why of the profit (Costs' parts), then Harvest's Settings → Yield line
    const mix = costsMix(v);
    const missing = missingLine(v.missing);
    els.notes.replaceChildren(...(mix ? [el('p', 'muted rn-mix', mix)] : []), ...(missing ? [missing] : []));
  }

  function paintBlocks(v, today) {
    els.blocksLink.replaceChildren(link('Batches', v.batches.length ? batchesRunHash(v.id) : BATCHES_HASH));
    if (!v.batches.length) {
      els.blocks.replaceChildren(el('p', 'none', 'No batches in this run. Blocks come in and go into a container through Batches.'));
      return;
    }
    const list = el('ul', 'rn-batches');
    for (const b of batchRows(v.batches, today)) {
      const li = el('li', 'rn-batch');
      li.append(link(b.title, b.href), el('span', 'rn-line muted', b.line), ...(b.note ? [el('span', 'rn-line muted', b.note)] : []));
      list.append(li);
    }
    // no money here: the Costs card's Blocks is the run's one block cost
    els.blocks.replaceChildren(list);
  }

  function paintHarvests(v) {
    els.harvestsLink.replaceChildren(...(v.roomName ? [link('Harvest tab', roomHash(v.roomId, 'harvest'))] : []));
    if (!v.harvestCount) {
      els.harvests.replaceChildren(el('p', 'none', 'Nothing picked in this run yet.'));
      return;
    }
    const parts = [];
    if (v.flushes.length) {
      const [from, to] = flushPerCrop(v.crops);
      const subs = flushSplits(v);
      const rows = [];
      flushRows(v).forEach((cells, i) => {
        const tr = plainRow(cells, 2);
        for (let c = from; c < to; c++) tr.children[c].classList.add('hv-crop-col');
        rows.push(tr);
        if (subs[i]) {
          const split = el('tr', 'hv-split-row');
          const td = el('td', 'hv-flush-split', subs[i]);
          td.colSpan = cells.length;
          split.append(td);
          rows.push(split);
        }
      });
      const t = table('Flushes', flushColumns(v.crops), rows, 'hv-table', 2);
      t.querySelectorAll('thead th').forEach((th, c) => { if (c >= from && c < to) th.classList.add('hv-crop-col'); });
      parts.push(t);
    }
    // a mixed run: its yield per crop (the money is the whole run's)
    if (v.byCrop.length > 1) parts.push(table('By crop', BY_CROP_COLUMNS, byCropRows(v).map((cells) => plainRow(cells)), 'hv-table'));
    const mixed = v.crops.length > 1;
    const list = el('ul', 'hv-list rn-picks');
    for (const h of v.harvests) {
      const l = harvestLine(h, { mixed });
      const li = el('li', 'hv-row');
      const text = el('div', 'hv-text');
      const title = el('p', 'hv-title');
      title.append(el('span', 'hv-kg', l.kg), `${DOT}${l.what}`);
      text.append(title, el('p', 'hv-meta', [l.when, l.who, l.from].filter(Boolean).join(DOT)));
      li.append(picture('task', 'harvestDaily', { crop: h.crop, size: 32 }), text);
      list.append(li);
    }
    // the latest few; every pick (and its Edit) is on the room's Harvest tab
    const more = v.harvestCount > v.harvests.length ? [el('p', 'muted tk-sub', `The latest ${v.harvests.length} of ${v.harvestCount}.`)] : [];
    const all = v.roomName ? [el('p', 'rn-foot')] : [];
    all[0]?.append(link('All picks on the Harvest tab', roomHash(v.roomId, 'harvest')));
    parts.push(el('h3', 'rn-sub-title', 'Picks'), ...more, list, ...all);
    els.harvests.replaceChildren(...parts);
  }

  function paintSales(v) {
    els.salesLink.replaceChildren(link('Sales', SALES_HASH));
    if (!v.sales.lines.length) {
      els.sales.replaceChildren(el('p', 'none', 'No sales of this run. A sale line that names the container counts in the run open on its day; one that names none, in the only run growing its crop, else shared by the kg picked.'));
      return;
    }
    const cell = (text, className, column) => {
      const td = el('td', className, text);
      td.dataset.label = SALE_COLUMNS[column];
      return td;
    };
    const rows = saleRows(v.sales.lines).map((s, i) => {
      const tr = el('tr', 'rn-sale');
      const day = el('th', '', s.day);
      day.scope = 'row';
      const buyer = cell(s.buyer, 'rn-buyer', 1);
      if (s.reference) buyer.append(el('span', 'co-sub', s.reference));
      const paid = cell(null, 'num rn-paid', 5); // a phone: a line of its own under the figures, its mark its own words
      paid.append(el('span', `sl-mark${s.paid.unpaid ? ' sl-unpaid' : ''}`, s.paid.text)); // Sales' paid mark, its look too
      const sold = cell(s.sold, '', 2);
      const tie = tieText(v.sales.lines[i]); // ---- Money truth ---- how it reached this run
      if (tie) sold.append(el('span', 'co-sub', tie));
      tr.append(day, buyer, sold, cell(s.price, 'num', 3), cell(s.total, 'num rn-total-cell', 4), paid);
      return tr;
    });
    const caption = 'Sales of this run';
    els.sales.replaceChildren(keepTable(table(caption, SALE_COLUMNS, rows, 'rn-sales-table', 3), caption), el('p', 'rn-foot', `Sold ${salesTotal(v.sales)}`));
  }

  function paintCosts(v) {
    els.costsLink.replaceChildren(link('Costs', COSTS_HASH));
    const notes = costNotes(v).map((n) => {
      const p = el('p', `rn-note ${n.warn ? 'co-note-warn' : 'muted'}`, n.text);
      p.dataset.kind = n.kind;
      return p;
    });
    const rows = costRows(v);
    const dl = el('dl', 'co-parts-list rn-parts');
    for (const [label, value, href, quiet] of rows) {
      const pair = el('div');
      const dt = el('dt', '', href ? null : label);
      if (href) dt.append(link(label, href)); // Blocks: the run's batches
      pair.append(dt, el('dd', quiet ? 'muted' : '', value)); // electricity or water at 0 in words: muted
      dl.append(pair);
    }
    const total = el('div', 'rn-total');
    total.append(el('dt', '', 'Total'), el('dd', '', costsTotal(v)));
    dl.append(total);
    els.costs.replaceChildren(...notes, dl, el('p', 'muted co-runs-note', SHARED_NOTE));
  }

  // ---- Money truth ---- (spec 2026-11-12-money-truth-design.md 8.2) a partial run counts in Economics once its block-in day
  // is given; the page reads again on the 'harvest' event the save publishes
  function paintCount(v, today) {
    const c = countLine(v, today);
    els.count.hidden = !c;
    if (!c) return els.count.replaceChildren();
    const send = (body) => request('PUT', `/api/runs/${v.id}/blocks-in`, body).then(() => read.load());
    const go = el('button', 'tk-quiet bz-quiet', c.action);
    go.type = 'button';
    go.dataset.focusKey = 'count';
    go.addEventListener('click', () => openForm({
      title: COUNT_TITLE,
      lead: [countLead(v, today)],
      fields: [{ name: 'day', label: 'Blocks went in on', kind: 'date', value: v.blocksInAt ? farmDate(v.blocksInAt) : '', ...countRange(v) }],
      buttons: [{ value: 'count', label: 'Count it', primary: true }],
      submit: async (values) => {
        const r = countBody(values.day, v);
        if (!r.body) return r;
        try {
          await send(r.body);
          return true;
        } catch (err) {
          return err.field ? { field: 'day', message: err.message } : { message: errorText(err) };
        }
      },
    }));
    const tools = [go];
    if (c.stop) {
      const stop = el('button', 'tk-quiet bz-quiet', c.stop);
      stop.type = 'button';
      stop.dataset.focusKey = 'count-stop';
      stop.addEventListener('click', () => send({ blocksInAt: null }).catch((err) => { els.bannerText.textContent = failText(err); els.banner.hidden = false; }));
      tools.push(stop);
    }
    const acts = el('span', 'rn-count-acts');
    acts.append(...tools);
    els.count.replaceChildren(el('p', 'muted rn-count-text', c.text), acts);
  }
  // ---- end Money truth ----

  function paint(v) {
    els.banner.hidden = true;
    els.gone.hidden = true;
    const today = farmDate(Date.now());
    const key = JSON.stringify([v, today]);
    if (key === painted) return;
    painted = key;
    els.body.hidden = false;
    els.back.hidden = false;
    paintHead(v, today);
    paintMoney(v);
    paintCount(v, today);
    paintCosts(v);
    paintBlocks(v, today);
    paintHarvests(v);
    paintSales(v);
  }
  function fail(err) {
    if (err.status === 404 && !routeMissing(err)) { // no such run (or its container deleted): say so, and stop asking
      els.title.textContent = 'Run';
      els.sub.replaceChildren();
      els.body.hidden = true;
      els.back.hidden = true; // one way back: the card's own
      els.gone.hidden = false;
      read.stop();
      return;
    }
    if (!painted) els.title.textContent = 'Run'; // never "Loading…" under a failed first read
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }
  const read = reader(() => `/api/runs/${id}`, { paint, fail, alive, container: () => container });
  q('[data-retry]').addEventListener('click', () => read.load());
  read.load();

  return function unmount() {
    mountSeq++;
    closeTaskDialog(); // ---- Money truth ---- its dialog has nothing to go back to
    read.stop();
  };
}

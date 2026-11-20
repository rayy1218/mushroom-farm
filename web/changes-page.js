// The Changes page, #/business/changes (?days=&kind=&by=; spec 2026-11-12-data-integrity-design.md 11): every change to a
// money record over a period, newest first: when, who, what (a link to the page that keeps it), the change in words and why;
// filtered by what and who, exported as CSV. Not a tab: reached from the Summary, the History folds and Settings. The owner's
// only (a worker's 403 says whose it is). It asks again on the money modules' events, the stream's return and a timer; an
// answer older than the last asked is dropped. The words are web/changes-math.js's.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { BUSINESS_HASH, changesHash } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { farmDate } from './tasks-math.js';
import { CHANGES_LEAD, CHANGES_OWNER, CHANGE_PERIODS, KIND_FILTERS, changeRows, changesEmpty, CHANGES_MORE, recordLead } from './changes-math.js';

const REFRESH_MS = 60_000;
const LISTEN = ['sales', 'costs', 'harvest', 'inventory'].filter((type) => EVENT_TYPES.includes(type));
const COLUMNS = ['When', 'Who', 'What', 'Change', 'Why'];

const TEMPLATE = `
  <a class="back" href="${BUSINESS_HASH}" data-back>Summary</a>
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Changes</h1>
      <p class="page-sub">${CHANGES_LEAD}</p>
    </div>
  </div>
  <div class="dx-changes-tools" data-tools>
    <div class="range-bar" role="group" aria-label="Period" data-range></div>
    <div class="field dx-changes-filter">
      <label for="dx-changes-kind">What</label>
      <select id="dx-changes-kind" data-kind></select>
    </div>
    <div class="field dx-changes-filter">
      <label for="dx-changes-by">Who</label>
      <select id="dx-changes-by" data-by></select>
    </div>
    <a class="button dx-changes-csv" data-csv download>Export CSV</a>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <section class="card dx-changes-card" aria-labelledby="dx-changes-title" data-body hidden>
    <h2 id="dx-changes-title" class="sr-only">Changes</h2>
    <div data-list></div>
  </section>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}
const option = (value, words) => {
  const o = el('option', '', words);
  o.value = value;
  return o;
};

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { days: firstDays = 30, kind: firstKind = null, by: firstBy = null, id = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    tools: q('[data-tools]'), range: q('[data-range]'), kind: q('[data-kind]'), by: q('[data-by]'), csv: q('[data-csv]'),
    banner: q('.banner'), bannerText: q('[data-banner-text]'), body: q('[data-body]'), list: q('[data-list]'),
  };
  document.title = 'Changes · Mushroom farm';

  let days = firstDays;
  let kind = firstKind;
  let by = firstBy;
  let seq = 0;
  let timer = null;
  let outdated = false;
  const shown = () => ({ days, kind, by });
  // id: one record's changes (a History fold's All changes), its kind's link to every change of that kind
  const query = () => (id !== null ? `kind=${kind}&id=${id}`
    : [`days=${days}`, kind ? `kind=${kind}` : '', by ? `by=${encodeURIComponent(by)}` : ''].filter(Boolean).join('&'));

  const buttons = CHANGE_PERIODS.map(([n, words]) => {
    const b = el('button', '', words);
    b.type = 'button';
    b.addEventListener('click', () => { if (n !== days) { days = n; changed(); } });
    els.range.append(b);
    return [n, b];
  });
  els.kind.append(...KIND_FILTERS.map(([value, words]) => option(value, words)));
  els.kind.addEventListener('change', () => { kind = els.kind.value || null; changed(); });
  els.by.addEventListener('change', () => { by = els.by.value || null; changed(); });

  // the filters said: the period pressed, the selects set, the CSV of the period (and its kind), the address kept
  function showFilters(people = []) {
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === days));
    els.kind.value = kind ?? '';
    // Who: the people in the period, and the one asked for even when the period has none of theirs
    const names = [...new Set([...people, ...(by ? [by] : [])])].sort((a, b) => a.localeCompare(b));
    els.by.replaceChildren(option('', 'Everyone'), ...names.map((n) => option(n, n)));
    els.by.value = by ?? '';
    els.csv.href = `/api/changes.csv?days=${days}${kind ? `&kind=${kind}` : ''}`;
  }
  function changed() {
    history.replaceState(null, '', changesHash(shown()));
    showFilters([...els.by.options].map((o) => o.value).filter(Boolean));
    load();
  }

  function showError(text) {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  }

  // A table on a desk; on a phone each entry a block (its parts keep their roles, so a reader still hears the column).
  function paint(reply) {
    if (id !== null) return paintRecord(reply);
    showFilters(reply.people ?? []);
    els.body.hidden = false;
    if (!reply.entries.length) {
      els.list.replaceChildren(el('p', 'none', changesEmpty(shown())));
      return;
    }
    paintTable(reply.entries, reply.more ? [el('p', 'muted dx-changes-more', CHANGES_MORE(reply.entries.length))] : []);
  }

  // The entries' table (a phone's blocks), after the nodes before it.
  function paintTable(entries, before = []) {
    const today = farmDate(Date.now());
    const t = el('table', 'us-table dx-changes-table');
    t.setAttribute('role', 'table');
    t.setAttribute('aria-label', 'Changes');
    t.append(el('caption', 'sr-only', 'Changes'));
    const head = el('tr');
    head.setAttribute('role', 'row');
    for (const h of COLUMNS) {
      const th = el('th', '', h);
      th.scope = 'col';
      th.setAttribute('role', 'columnheader');
      head.append(th);
    }
    const thead = el('thead');
    thead.setAttribute('role', 'rowgroup');
    thead.append(head);
    const tbody = el('tbody');
    tbody.setAttribute('role', 'rowgroup');
    for (const r of changeRows(entries, today)) {
      const tr = el('tr', 'dx-change');
      tr.setAttribute('role', 'row');
      const cells = [r.when, r.who, r.what, r.change, r.why].map((text, i) => {
        const td = el('td', `dx-change-${COLUMNS[i].toLowerCase()}`);
        td.setAttribute('role', 'cell');
        td.dataset.label = COLUMNS[i];
        if (i === 2 && r.href) {
          const a = el('a', 'co-link', text);
          a.href = r.href;
          td.append(a);
        } else td.textContent = text;
        return td;
      });
      tr.append(...cells);
      tbody.append(tr);
    }
    t.append(thead, tbody);
    const wrap = el('div', 'us-table-wrap');
    wrap.append(t);
    els.list.replaceChildren(...before, wrap);
  }

  // One record: what it is and a link to every change of its kind, then its entries newest first (no period, no filters).
  function paintRecord(reply) {
    els.tools.hidden = true;
    els.body.hidden = false;
    const lead = el('p', 'dx-changes-record');
    lead.append(el('span', '', recordLead(reply.entries)), ' ');
    const all = el('a', 'co-link', `All changes to ${KIND_FILTERS.find(([k]) => k === kind)?.[1] ?? 'records'}`);
    all.href = changesHash({ kind });
    lead.append(all);
    if (!reply.entries.length) {
      els.list.replaceChildren(lead);
      return;
    }
    paintTable(reply.entries.toReversed(), [lead]);
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', `/api/changes?${query()}`);
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(reply);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      if (err.status === 403) {
        // a worker: the log holds money; the page says whose it is (nothing to retry)
        els.tools.hidden = true;
        els.body.hidden = false;
        els.list.replaceChildren(el('p', 'none', CHANGES_OWNER));
        return;
      }
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => reload.call())),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }
    }),
  ];
  q('[data-retry]').addEventListener('click', () => load());
  showFilters();
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
  };
}

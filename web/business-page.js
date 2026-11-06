// The Business summary, #/business (spec 2026-11-06-business-summary-design.md 6): the Summary tab, first in the Business
// strip. This month's money as Costs gives it, a line per thing that needs the owner (each a link to where it is fixed) and
// the runs in progress. Read only. It asks again on the batches, inventory, sales, costs and harvest events, a room's crops or
// name, when the stream comes back, and on a timer (as Runs); an answer older than the last asked is dropped. A module that
// could not be read says so in its own card; the rest shows.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { COSTS_HASH, RUNS_HASH } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { farmDate } from './tasks-math.js';
import { DOT } from './text-math.js';
import { picture } from './pictures.js';
import { tileNodes } from './harvest-card.js';
import {
  moneyTitle, moneyTiles, unsoldLine, lastMonthLine, needLines, needFailLines, needsEmpty, readFailText, RUNS_NONE, runRows,
} from './business-math.js';

const REFRESH_MS = 60_000;
const LISTEN = ['batches', 'inventory', 'sales', 'costs', 'harvest'].filter((type) => EVENT_TYPES.includes(type));
const ROOMS_HASH = '#/overview'; // the Overview holds the rooms (#/rooms is it now)

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
// After a repaint the cursor goes back to the same link (its address and words), as the run page's.
const keyOf = (node) => (node?.getAttribute?.('href') ? `${node.getAttribute('href')}|${node.textContent}` : null);
function keepFocus(container, repaint) {
  const before = container.contains(document.activeElement) ? keyOf(document.activeElement) : null;
  repaint();
  if (!before || container.contains(document.activeElement)) return;
  const again = [...container.querySelectorAll('a[href]')].find((n) => keyOf(n) === before);
  again?.focus({ preventScroll: true });
}
// The words of a failed read: an older farm app, no answer, or the server's own.
const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);

const PAGE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Summary</h1>
      <p class="page-sub">This month's money, what needs you and the runs under way.</p>
    </div>
  </div>
  <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
  <div class="sm-page" data-body hidden>
    <section class="card sm-money" aria-labelledby="sm-money-title">
      <div class="card-head"><h2 id="sm-money-title" data-money-title>This month so far</h2><a class="co-link" href="${COSTS_HASH}">Costs</a></div>
      <div data-money></div>
    </section>
    <section class="card sm-needs" aria-labelledby="sm-needs-title">
      <div class="card-head"><h2 id="sm-needs-title">Needs you</h2></div>
      <div data-needs></div>
    </section>
    <section class="card sm-runs" aria-labelledby="sm-runs-title">
      <div class="card-head"><h2 id="sm-runs-title">Runs in progress</h2><a class="co-link" href="${RUNS_HASH}">Runs</a></div>
      <div data-runs></div>
    </section>
  </div>`;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = PAGE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'), bannerText: q('[data-banner-text]'), body: q('[data-body]'), moneyTitle: q('[data-money-title]'),
    money: q('[data-money]'), needs: q('[data-needs]'), runs: q('[data-runs]'),
  };
  document.title = 'Business summary · Mushroom farm';
  let painted = '';

  // Profit, Income and Costs as Costs' month card has them, then the kg not sold and last month's result.
  function paintMoney(r) {
    els.moneyTitle.textContent = moneyTitle(r.month);
    if (!r.month) {
      els.money.replaceChildren(el('p', 'none', readFailText('costs')));
      return;
    }
    const list = moneyTiles(r.month);
    const nodes = tileNodes(list);
    list.forEach((t, i) => { if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn'; });
    const tiles = el('div', 'us-tiles hv-tiles co-tiles');
    tiles.append(...nodes);
    // a phone: one long figure sets the others a size down (Costs' month card; Profit has its own row)
    tiles.toggleAttribute('data-long', nodes.slice(1).some((n) => n.querySelector('.us-kwh').hasAttribute('data-long')));
    const lines = [unsoldLine(r.month), lastMonthLine(r.lastMonth, r.month)].filter(Boolean).map((t) => el('p', 'muted sm-line', t));
    els.money.replaceChildren(tiles, ...lines);
  }

  // A line per need, each its link; "Nothing needs you right now." only when every module was read.
  function paintNeeds(r, now) {
    const lines = needLines(r.needs, now);
    const parts = [];
    if (lines.length) {
      const list = el('ul', 'sm-needs-list');
      for (const n of lines) {
        const li = el('li', 'sm-need');
        li.dataset.kind = n.kind;
        li.append(link(n.text, n.href));
        list.append(li);
      }
      parts.push(list);
    }
    const none = lines.length ? null : needsEmpty(r.errors);
    if (none) parts.push(el('p', 'none', none));
    parts.push(...needFailLines(r.errors).map((t) => el('p', 'none sm-failed', t)));
    els.needs.replaceChildren(...parts);
  }

  // Each open run: its container with the money so far beside it, then its crops, days and kg, and its Run page.
  function paintRuns(r, today) {
    if (!r.runs) {
      els.runs.replaceChildren(el('p', 'none', readFailText('runs')));
      return;
    }
    if (!r.runs.length) {
      const rooms = el('p', 'sm-foot');
      rooms.append(link('Rooms', ROOMS_HASH));
      els.runs.replaceChildren(el('p', 'none', RUNS_NONE), rooms);
      return;
    }
    const list = el('ul', 'sm-runs-list');
    for (const row of runRows(r.runs, today)) {
      const li = el('li', 'sm-run');
      const head = el('div', 'sm-run-head');
      const room = el('span', 'co-crop sm-room');
      if (row.crop) room.append(picture('crop', row.crop, { size: 24 }));
      room.append(el('span', '', row.room));
      // "Profit so far RM 357.18"; a loss in words, only its figure in the loss tone (Costs' way)
      const money = el('span', 'sm-so-far');
      money.append(el('span', 'sm-so-far-label', row.money.label), ' ', el('span', `sm-so-far-value${row.money.tone === 'loss' ? ' co-loss' : ''}`, row.money.value));
      if (row.money.line) money.append(el('span', 'co-sub', row.money.line));
      head.append(room, money);
      const line = el('p', 'muted sm-run-line', `${[row.crops, row.days, row.kg].join(DOT)}${DOT}`);
      const page = link('Run page', row.href);
      page.setAttribute('aria-label', row.label); // "Run page, Container 1, since 4 Nov": one name per run
      line.append(page);
      li.append(head, line);
      list.append(li);
    }
    els.runs.replaceChildren(list);
  }

  function paint(r) {
    els.banner.hidden = true;
    els.body.hidden = false;
    const now = Date.now();
    const today = farmDate(now); // read at each paint: past midnight "day 12" and "oldest 3 days" move on
    const key = JSON.stringify([r, today]);
    if (key === painted) return;
    painted = key;
    paintMoney(r);
    paintNeeds(r, now);
    paintRuns(r, today);
  }
  // No answer: the banner says why; what was shown stays (a first read that fails shows the banner alone).
  function fail(err) {
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }

  let seq = 0;
  let timer = null;
  let outdated = false;
  let stopped = false;
  async function load() {
    if (!alive() || outdated || stopped) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', '/api/business/summary');
      if (!alive() || mine !== seq) return;
      keepFocus(container, () => paint(reply));
    } catch (err) {
      if (!alive() || mine !== seq) return;
      outdated = routeMissing(err);
      fail(err);
      if (outdated) return;
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
  q('[data-retry]').addEventListener('click', () => load());
  load();

  return function unmount() {
    mountSeq++;
    stopped = true;
    reload.cancel();
    clearTimeout(timer);
    for (const off of offLive) off();
  };
}

// The Business summary, #/business (spec 2026-11-06-business-summary-design.md 6): the Summary tab, first in the Business
// strip. This month's money as Costs gives it, a line per thing that needs the owner (the worst first, each a link to where
// it is fixed) and the runs in progress. Read only. It asks again on the batches, inventory, sales, costs and harvest events,
// a room's crops or name, when the stream comes back, and on a timer (as Runs); an answer older than the last asked is
// dropped. A module that could not be read says so in its own place, with Retry; the rest shows.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { COSTS_HASH, RUNS_HASH } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { farmDate } from './tasks-math.js';
import { picture } from './pictures.js';
import { tileNodes } from './harvest-card.js';
import {
  moneyTitle, moneyTiles, toComeLine, unsoldLine, unsoldTile, lastMonthLine, lastMonthTile, needLines, needsTitle, needsEmpty,
  readFailText, PART_NAMES, RETRY_WORDS, RUNS_NONE, ROOMS_LINK, runRows,
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

// After a repaint the cursor goes back to the same link or button: its focus key (a need's kind, a use-by's item, a run, a
// Retry's part), else its address and words (the card heads' links), as the run page's. One that is gone (a Retry whose part
// was read this time, a need fixed) leaves it on the page's title, never on the body. doc: the document (tests pass theirs).
export const keyOf = (node) => node?.dataset?.focusKey ?? (node?.getAttribute?.('href') ? `${node.getAttribute('href')}|${node.textContent}` : null);
export function keepFocus(container, repaint, doc = document) {
  const before = container.contains(doc.activeElement) ? keyOf(doc.activeElement) : null;
  repaint();
  if (!before || container.contains(doc.activeElement)) return;
  const again = [...container.querySelectorAll('a[href], [data-focus-key]')].find((n) => keyOf(n) === before);
  (again ?? container.querySelector('h1'))?.focus({ preventScroll: true });
}

// The reads: an answer older than the last asked is dropped, the next asked on a timer after each; an older farm app (the
// route missing) stops them. read: () => a promise of the reply; done(reply) and failed(err): the page's; delay(): the
// timer's ms; alive(): false once the page is gone. → { load, stop }.
export function createReader({ read, done, failed, delay, alive = () => true, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let seq = 0;
  let timer = null;
  let stopped = false;
  const going = () => alive() && !stopped;
  async function load() {
    if (!going()) return;
    clearTimer(timer);
    const mine = ++seq;
    try {
      const reply = await read();
      if (!going() || mine !== seq) return;
      done(reply);
    } catch (err) {
      if (!going() || mine !== seq) return;
      if (routeMissing(err)) stopped = true;
      failed(err);
      if (stopped) return;
    }
    clearTimer(timer);
    timer = setTimer(load, delay());
  }
  return { load, stop() { stopped = true; clearTimer(timer); } };
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
  <p class="sr-only" data-said aria-live="polite"></p>
  <div class="sm-page" data-body hidden>
    <section class="card sm-money" aria-labelledby="sm-money-title">
      <div class="card-head"><h2 id="sm-money-title" data-money-title>This month so far</h2><a class="co-link" href="${COSTS_HASH}">Costs</a></div>
      <div data-money></div>
    </section>
    <section class="card sm-needs" aria-labelledby="sm-needs-title">
      <div class="card-head"><h2 id="sm-needs-title" data-needs-title>Needs you</h2></div>
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
    banner: q('.banner'), bannerText: q('[data-banner-text]'), said: q('[data-said]'), body: q('[data-body]'),
    moneyTitle: q('[data-money-title]'), money: q('[data-money]'), needsTitle: q('[data-needs-title]'), needs: q('[data-needs]'), runs: q('[data-runs]'),
  };
  document.title = 'Business summary · Mushroom farm';
  let painted = '';
  let failedBefore = new Set(); // the parts not read last time: a part newly failing is said once (aria-live)

  // A part not read: its words in the warning tone, and Retry (its focus key the part's).
  const failNode = (tag, className, text, part) => {
    const node = el(tag, [className, 'sm-failed'].filter(Boolean).join(' '));
    const retry = el('button', 'bz-quiet sm-retry', RETRY_WORDS);
    retry.type = 'button';
    retry.dataset.focusKey = `retry:${part}`;
    retry.setAttribute('aria-label', `${RETRY_WORDS} ${PART_NAMES[part]}`);
    retry.addEventListener('click', () => reader.load());
    node.append(el('span', '', text), retry);
    return node;
  };

  // Profit, Income and Costs as Costs' month card has them; on a wide desk the kg not sold and last month as tiles 4 and 5,
  // else as lines under Costs' still-to-come line.
  function paintMoney(r) {
    els.moneyTitle.textContent = moneyTitle(r.month);
    if (!r.month) {
      els.money.replaceChildren(failNode('p', '', readFailText('costs'), 'costs'));
      return;
    }
    const list = moneyTiles(r.month);
    const wide = [unsoldTile(r.month), lastMonthTile(r.lastMonth, r.month)].filter(Boolean);
    const nodes = tileNodes([...list, ...wide]);
    [...list, ...wide].forEach((t, i) => { if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn'; });
    nodes.slice(list.length).forEach((n) => n.classList.add('sm-wide'));
    const tiles = el('div', 'us-tiles hv-tiles co-tiles');
    tiles.append(...nodes);
    // a phone: one long figure sets the others a size down (Costs' month card; Profit has its own row)
    tiles.toggleAttribute('data-long', nodes.slice(1, list.length).some((n) => n.querySelector('.us-kwh').hasAttribute('data-long')));
    const toCome = toComeLine(r.month);
    const unsold = unsoldLine(r.month);
    const last = lastMonthLine(r.lastMonth, r.month);
    const lines = [
      ...(toCome ? [el('p', 'muted sm-line', toCome)] : []),
      ...(unsold ? [el('p', 'muted sm-line sm-narrow', unsold)] : []),
    ];
    if (last) {
      const p = el('p', 'muted sm-line sm-narrow');
      p.append(...last.map((part) => (part.tone === 'loss' ? el('span', 'co-loss', part.text) : part.text)));
      lines.push(p);
    }
    els.money.replaceChildren(tiles, ...lines);
  }

  // A line per need, the worst first, the whole line its link with its state's dot; a part not read in its needs' place;
  // "Nothing needs you right now." only when every module was read.
  function paintNeeds(r, now) {
    const lines = needLines(r, now);
    const count = lines.filter((n) => n.kind !== 'failed').length;
    els.needsTitle.textContent = needsTitle(count);
    const parts = [];
    if (lines.length) {
      const list = el('ul', 'sm-needs-list');
      for (const n of lines) {
        const li = el('li', 'sm-need');
        li.dataset.kind = n.kind;
        if (n.tone) li.dataset.tone = n.tone;
        if (n.kind === 'failed') {
          li.append(failNode('p', 'sm-need-row', n.text, n.part));
        } else {
          const a = el('a', 'sm-need-row sm-need-link');
          a.href = n.href;
          a.dataset.focusKey = n.key;
          const dot = el('span', 'sm-dot');
          dot.setAttribute('aria-hidden', 'true');
          a.append(dot, el('span', 'sm-need-text', n.text));
          li.append(a);
        }
        list.append(li);
      }
      parts.push(list);
    }
    const none = lines.length ? null : needsEmpty(r.errors);
    if (none) parts.push(el('p', 'none', none));
    els.needs.replaceChildren(...parts);
  }

  // Each open run: its container (the run page's link, its main crop's picture) with the money so far beside it, then its
  // crops, days and kg.
  function paintRuns(r, today) {
    if (!r.runs) {
      els.runs.replaceChildren(failNode('p', '', readFailText('runs'), 'runs'));
      return;
    }
    if (!r.runs.length) {
      const rooms = el('p', 'sm-foot');
      rooms.append(link(ROOMS_LINK, ROOMS_HASH));
      els.runs.replaceChildren(el('p', 'none', RUNS_NONE), rooms);
      return;
    }
    const list = el('ul', 'sm-runs-list');
    for (const row of runRows(r.runs, today)) {
      const li = el('li', 'sm-run');
      const head = el('div', 'sm-run-head');
      const room = link(null, row.href);
      room.classList.add('co-crop', 'sm-room');
      room.dataset.focusKey = `run:${row.id}`;
      room.setAttribute('aria-label', row.label); // "Run page, Container 1, since 4 Nov": one name per run, its words in it
      if (row.crop) room.append(picture('crop', row.crop, { size: 24 }));
      room.append(el('span', '', row.room));
      // "Profit so far −RM 1,005.97" with "Loss" under it: only the figure in the loss tone (the run page's Profit tile)
      const money = el('span', 'sm-so-far');
      money.append(el('span', 'sm-so-far-label', row.money.label), ' ', el('span', `sm-so-far-value${row.money.tone === 'loss' ? ' co-loss' : ''}`, row.money.value));
      if (row.money.line) money.append(el('span', 'co-sub', row.money.line));
      head.append(room, money);
      li.append(head, el('p', 'muted sm-run-line', row.line));
      list.append(li);
    }
    els.runs.replaceChildren(list);
  }

  // A part newly not read is said once (the cards' words stay for the eye); one read again clears it.
  function sayFailed(r) {
    const now = new Set(Object.keys(r.errors ?? {}));
    const fresh = [...now].filter((p) => !failedBefore.has(p) && PART_NAMES[p]);
    failedBefore = now;
    if (fresh.length) els.said.textContent = `Couldn't read ${fresh.map((p) => PART_NAMES[p]).join(' and ')} just now.`;
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
    sayFailed(r);
  }
  // No answer: the banner says why; what was shown stays (a first read that fails shows the banner alone).
  function fail(err) {
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }

  const reader = createReader({
    read: () => request('GET', '/api/business/summary'),
    done: (reply) => keepFocus(container, () => paint(reply)),
    failed: fail,
    delay: () => fallbackMs(REFRESH_MS, live.connected()),
    alive,
  });
  const reload = createThrottle(() => { if (alive()) reader.load(); });
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => reload.call())),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }), // a run starts or ends; a room's name
    live.onStatus((up) => { if (up) reload.call(); }),
  ];
  q('[data-retry]').addEventListener('click', () => reader.load());
  reader.load();

  return function unmount() {
    mountSeq++;
    reader.stop();
    reload.cancel();
    for (const off of offLive) off();
  };
}

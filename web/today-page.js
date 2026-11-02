// The farm's Today page, #/today (spec 2026-10-30-tasks-design.md 7.2): who is doing the rounds (a name from Settings, kept
// in this browser), every room in the Overview's order with its open stage tasks by slot and its overdue upkeep, Done and
// Skip in place, the closed ones folded under "6 done", and a line per room with open long-term tasks to its Tasks tab. The
// page asks for its data on the tasks events, when the stream comes back, and on a timer (30 s; 60 s while the stream is
// up: the day turns over at midnight without an event).

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { roomHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { slotGroups, upkeepRows, dayTitle, tasksDueWords, longtermWords, todayCount } from './tasks-math.js';
import { createTaskActions, createWorkerPicker } from './task-dialogs.js';
import { el, taskRow, slotPart, keepFocus } from './task-list.js';
import { DOT } from './text-math.js';

const REFRESH_MS = 30_000;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Today</h1>
      <p class="page-sub" data-sub>Loading…</p>
    </div>
    <div class="td-picker" data-picker></div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <p class="meta warn tk-error" data-error role="alert" hidden></p>
  <div class="td-rooms" data-rooms></div>
  <section class="card td-long" data-long hidden>
    <h2>Long-term</h2>
    <ul class="td-long-list" data-long-list></ul>
  </section>`;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    sub: q('[data-sub]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), error: q('[data-error]'), rooms: q('[data-rooms]'),
    long: q('[data-long]'), longList: q('[data-long-list]'),
  };
  document.title = 'Today · Mushroom farm';
  const picker = createWorkerPicker();
  q('[data-picker]').append(picker.node);

  let view = null; // GET /api/tasks/today
  let seq = 0;
  let timer = null;
  let outdated = false; // a farm app from before the tasks: no timer
  let painted = ''; // what the rooms show: a refresh with nothing new leaves them (and their focus and clicks) alone
  const openFolds = new Set();

  // A change repaints the rooms even when the next answer reads the same: the row tapped holds its buttons until then. It
  // asks through the same throttle as the tasks events, which the server sends for the same change.
  const actions = createTaskActions({
    onChanged: () => { if (alive()) { els.error.hidden = true; painted = ''; reload.call(); } },
    onError: (text) => { if (alive()) { els.error.textContent = text; els.error.hidden = false; } },
  });

  // A room: its name (to its Tasks tab), its open stage tasks by slot (the closed ones folded) and its upkeep due.
  function roomPart(r) {
    const card = el('section', 'card td-room');
    const title = el('h2');
    const link = el('a', '', r.name);
    link.href = roomHash(r.id, 'tasks');
    title.append(link);
    card.append(title);
    const groups = slotGroups(r.today);
    for (const g of groups) card.append(slotPart(g, actions, { openFolds, foldKey: `${r.id}:${g.slot}` }));
    const up = upkeepRows(r.upkeepDue, view.date);
    if (up.length) {
      const part = el('div', 'tk-slot');
      const list = el('ul', 'tk-list');
      list.append(...up.map(({ row, due }) => taskRow(row, actions, { due })));
      part.append(el('h3', 'tk-slot-title', 'Upkeep'), list);
      card.append(part);
    }
    if (!groups.some((g) => g.open.length) && up.length === 0) card.append(el('p', 'none', groups.length ? 'All done for today.' : 'Nothing due today.'));
    return card;
  }

  function paint() {
    const key = JSON.stringify(view);
    if (key === painted) return;
    painted = key;
    keepFocus(container, () => {
      els.sub.textContent = `${dayTitle(view.date)}${DOT}${tasksDueWords(todayCount(view) ?? 0)}`;
      els.rooms.replaceChildren(...(view.rooms.length ? view.rooms.map(roomPart) : [el('p', 'none', 'No rooms yet. Add one on the Overview.')]));
      const long = view.rooms.filter((r) => r.longterm > 0);
      els.long.hidden = long.length === 0;
      els.longList.replaceChildren(...long.map((r) => {
        const li = el('li');
        const a = el('a', '', `${r.name}: ${longtermWords(r.longterm)}`);
        a.href = roomHash(r.id, 'tasks');
        li.append(a);
        return li;
      }));
    });
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', '/api/tasks/today');
      if (!alive() || mine !== seq) return;
      view = data;
      els.banner.hidden = true;
      picker.node.hidden = false;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (!view) els.sub.textContent = '';
      if (routeMissing(err)) { outdated = true; picker.node.hidden = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  q('[data-retry]').addEventListener('click', load);
  // Any room's tasks moved (the server sends the tasks event after every change): ask again, at most once in 2 s. The stream
  // back: ask once (events were missed). The stream gone: the short timer.
  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('tasks', () => reload.call()),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }
    }),
  ];
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
    actions.destroy();
    picker.destroy();
    document.title = 'Rooms · Mushroom farm';
    container.replaceChildren();
  };
}

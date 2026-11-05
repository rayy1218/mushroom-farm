// A room's month sheet of daily tasks (spec 2026-11-04-task-grid-design.md 4), #/rooms/:id/tasks/sheet?month=YYYY-MM: the
// paper log the owner showed, filled from the app (✓ and initials, ✗, —, shaded not due), blank for the pen on the days still
// to come with the planned boxes outlined, and the Farm and Reviewed-by lines. A print page as the myGAP sheet: Print and
// Back, hidden in print; one A4, portrait for 8 columns or fewer, landscape above (styles.css). It asks for GET /api/calendar
// for the month on the room's tasks and harvest events, when the stream comes back, and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { taskSheetHash, tasksHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { monthDays, monthTitle, sheetRows, sheetLayout, weekOf, LEGEND } from './task-grid-math.js';
import { farmDate } from './tasks-math.js';
import { loadWorkers } from './task-dialogs.js';
import { el } from './task-list.js';
import { DOT } from './text-math.js';

const REFRESH_MS = 60_000;
// what a blank box means, for a screen reader (the paper shows it by its shade or outline)
const BLANK = { none: 'not due', cancelled: 'cancelled', planned: 'planned', open: 'open' };

const TEMPLATE = `
  <div class="ts-sheet">
    <div class="ts-tools">
      <a class="back" data-back>Back to Tasks</a>
      <button type="button" class="primary" data-print>Print</button>
    </div>
    <div class="ts-head">
      <p class="ts-farm">Farm: <span class="ts-line"></span></p>
      <h1 class="page-title ts-title" tabindex="-1">Daily tasks</h1>
      <p class="ts-month" data-month></p>
    </div>
    <div class="banner" role="alert" hidden>
      <span data-banner-text></span>
      <button type="button" data-retry>Retry</button>
    </div>
    <p class="none" data-none>Loading…</p>
    <div class="ts-wrap" data-wrap hidden>
      <table class="ts-table">
        <caption class="sr-only" data-caption></caption>
        <thead><tr data-head></tr></thead>
        <tbody data-rows></tbody>
      </table>
    </div>
    <div class="ts-foot">
      <p class="ts-review">Sheet reviewed by: <span class="ts-line"></span> (Management) on <span class="ts-line ts-line-short"></span></p>
      <p class="ts-legend">${LEGEND}${DOT}outlined: due</p>
    </div>
  </div>`;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

// month: 'YYYY-MM', or null for this month (the farm's, put in the address once the server says it). from: the route shown
// before, so Back returns to the Tasks tab's week it came from.
export function mountSheet(container, { roomId, month = null, from = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    sheet: q('.ts-sheet'), back: q('[data-back]'), title: q('.ts-title'), month: q('[data-month]'), banner: q('.banner'),
    bannerText: q('[data-banner-text]'), none: q('[data-none]'), wrap: q('[data-wrap]'), caption: q('[data-caption]'),
    head: q('[data-head]'), rows: q('[data-rows]'), table: q('.ts-table'),
  };
  document.title = 'Daily tasks sheet · Mushroom farm';
  document.body.classList.add('printing-sheet'); // print: no top bar, no buttons, light colours (styles.css)
  const cameFrom = from?.name === 'detail' && from.id === roomId && from.tab === 'tasks' ? from : null;
  let shown = month ?? farmDate(Date.now()).slice(0, 7); // the browser's clock until the server's
  let cal = null; // GET /api/calendar of the month
  let workers = [];
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  // Back: the week the Tasks tab showed; opened from elsewhere, this week for this month, else the month's first week.
  function setBack(today) {
    const week = cameFrom ? cameFrom.week ?? null : today && shown === today.slice(0, 7) ? null : weekOf(`${shown}-01`).from;
    els.back.href = tasksHash(roomId, week);
  }
  setBack(null);
  els.month.textContent = monthTitle(shown);

  function paint() {
    if (!cal) return;
    const key = JSON.stringify([cal, workers]);
    if (key === painted) return;
    painted = key;
    const name = cal.rooms?.[0]?.name ?? `Room ${roomId}`;
    const title = `Daily tasks${DOT}${name}`;
    els.title.textContent = title;
    els.month.textContent = monthTitle(shown);
    els.caption.textContent = `${title}, ${monthTitle(shown)}`;
    document.title = `${name} daily tasks, ${monthTitle(shown)} · Mushroom farm`;
    setBack(cal.today);
    const sheet = sheetRows({ month: shown, days: cal.days, today: cal.today, workers });
    const layout = sheetLayout(sheet.columns.length);
    els.sheet.classList.toggle('ts-landscape', layout.landscape);
    els.sheet.classList.toggle('ts-sideways', layout.sideways);
    els.none.textContent = `No daily tasks in ${monthTitle(shown)}.`;
    els.none.hidden = sheet.columns.length > 0;
    els.wrap.hidden = sheet.columns.length === 0;
    els.table.style.setProperty('--cols', String(sheet.columns.length)); // a phone scrolls a wide month sideways
    const corner = el('th', 'ts-day', 'Day');
    corner.scope = 'col';
    const initials = el('th', 'ts-initials', 'Initials');
    initials.scope = 'col';
    els.head.replaceChildren(corner, ...sheet.columns.map((c) => {
      const th = el('th', 'ts-task');
      th.scope = 'col';
      th.title = c.text;
      th.append(el('span', 'ts-task-name', c.shortName));
      return th;
    }), initials);
    els.rows.replaceChildren(...sheet.rows.map((r) => {
      const tr = el('tr');
      if (r.date === cal.today) tr.className = 'ts-today';
      const th = el('th', 'ts-day');
      th.scope = 'row';
      th.append(el('span', 'ts-date', String(r.day)), ' ', el('span', 'ts-weekday', r.weekday));
      tr.append(th, ...r.cells.map((c) => {
        const td = el('td', `ts-box${c.outlined ? ' ts-outlined' : ''}${c.shaded ? ' ts-shaded' : ''}`, c.text);
        if (!c.text && BLANK[c.kind] && (c.shaded || c.outlined)) td.append(el('span', 'sr-only', BLANK[c.kind]));
        return td;
      }));
      // the pen's initials on the days still to come (today's too: its open boxes are for the pen); a day gone has the app's
      tr.append(el('td', `ts-write${r.date < cal.today ? ' ts-shaded' : ''}`));
      return tr;
    }));
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    const { from: first, to: last } = monthDays(shown);
    try {
      const data = await request('GET', `/api/calendar?room=${roomId}&from=${first}&to=${last}`);
      if (!alive() || mine !== seq) return;
      if (month === null) {
        // this month by the server's clock, kept in the address (no new history entry)
        month = data.today.slice(0, 7);
        history.replaceState(null, '', taskSheetHash(roomId, month));
        if (month !== shown) { shown = month; load(); return; }
      }
      els.banner.hidden = true;
      cal = data;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (!cal) els.none.textContent = '—';
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  q('[data-print]').addEventListener('click', () => window.print());
  q('[data-retry]').addEventListener('click', () => load());
  // the room's tasks (a Done, a Skip, an Undo, the day's rows made), its crop (the planned days), its name, its harvests (a
  // kg Done), the stream back
  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('room', (d) => { if (d.id === roomId && ['tasks', 'crop', 'room'].includes(d.part)) reload.call(); }),
    live.on('harvest', (d) => { if (d.roomId == null || d.roomId === roomId) reload.call(); }),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }
    }),
  ];
  loadWorkers().then((list) => { if (alive()) { workers = list; paint(); } }, () => {}); // without them, a clash shows only among the month's
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
    document.body.classList.remove('printing-sheet');
  };
}

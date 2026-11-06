// The room's Tasks tab (spec 2026-10-30-tasks-design.md 7.1; the grid 2026-11-04-task-grid-design.md): Daily tasks (the
// week's grid, web/task-grid.js, in place of the day list and the Log; Export CSV under it), Upkeep (overdue first) and
// Long-term (Plan this on Suggest machines, or Add). createTasksCard(host, { roomId, week, shown, onWeek, onCounts, onGone })
// → { setWeek(week), show(), destroy() }; onCounts(counts | null) gives the tab its dot; week, onWeek: the grid's week (the
// address); shown: the Tasks tab shows (else show() when it first does: the grid reads its week then, the dot needs only the
// room reply).
// The card asks for its own data: on the room's tasks events, when the stream comes back, and on a timer (30 s; 60 s while
// the stream is up: the day turns over at midnight without an event). The grid asks for its week itself.

import { request, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { upkeepRows, nowDue, comingUpWords, longtermLine, dayTitle, tasksDueWords } from './tasks-math.js';
import { createTaskActions } from './task-dialogs.js';
import { createTaskGrid } from './task-grid.js';
import { el, button, taskRow, keepFocus } from './task-list.js';
import { keepLines, DOT } from './text-math.js';
import { mainCrop } from './room-card-math.js';
import { calendarHash } from './route.js';

const REFRESH_MS = 30_000;

export function createTasksCard(host, { roomId, week = null, shown = true, onWeek, onCounts, onGone }) {
  let alive = true;
  let seq = 0; // every load takes a token; an answer that finds it changed is dropped
  let timer = null;
  let view = null; // GET /api/rooms/:id/tasks
  let painted = ''; // what the parts show: a refresh with nothing new leaves them (and their focus and clicks) alone
  const openFolds = new Set();

  const hostClass = host.className;
  host.className = 'tk-grid';

  // Daily tasks: the week's grid
  const todayCard = el('section', 'card tk-part tk-today');
  const todayHead = el('div', 'sim-card-head');
  todayHead.append(el('h2', '', 'Daily tasks'));
  const todaySub = el('p', 'muted tk-sub tk-day');
  const subText = el('span', '', 'Loading…');
  const error = el('p', 'meta warn tk-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const gridHost = el('div', 'tg-host');
  // the room's days ahead and behind on the Calendar, at the end of the day's line (spec 2026-11-03-calendar-design.md 5)
  const calLink = el('a', 'tk-cal', 'Open in the calendar');
  calLink.href = calendarHash({ room: roomId });
  todaySub.append(subText, DOT, calLink);
  // The foot: Print month (the grid's) and every closed task as CSV, for the myGAP records (the Log's export, under the grid
  // that took its place)
  const csvLine = el('p', 'muted tk-sub tg-csv');
  csvLine.dataset.ownerOnly = ''; // ---- Login ---- Print month and Export CSV: the owner's
  const csv = el('a', '', 'Export CSV');
  csv.href = `/api/rooms/${roomId}/tasks/log.csv`;
  csv.setAttribute('download', '');
  todayCard.append(todayHead, todaySub, error, gridHost, csvLine);

  // Upkeep
  const upkeepCard = el('section', 'card tk-part');
  const upkeepList = el('ul', 'tk-list');
  const upkeepNone = el('p', 'none', 'No upkeep for this room.');
  upkeepNone.hidden = true;
  const upkeepLater = el('details', 'tk-fold tk-later');
  upkeepLater.hidden = true;
  upkeepLater.open = openFolds.has('upkeep-later');
  upkeepLater.addEventListener('toggle', () => { if (upkeepLater.open) openFolds.add('upkeep-later'); else openFolds.delete('upkeep-later'); });
  const upkeepLaterSummary = el('summary');
  upkeepLaterSummary.dataset.focusKey = 'fold-upkeep-later';
  const upkeepLaterList = el('ul', 'tk-list');
  upkeepLater.append(upkeepLaterSummary, upkeepLaterList);
  upkeepCard.append(el('h2', '', 'Upkeep'), el('p', 'muted tk-sub', 'Each counted from the last time it was done.'), upkeepList, upkeepNone, upkeepLater);

  // Long-term
  const longCard = el('section', 'card tk-part');
  const longHead = el('div', 'sim-card-head');
  const add = button('Add');
  add.dataset.ownerOnly = ''; // ---- Login ---- a worker does the tasks; the owner sets them
  add.setAttribute('aria-label', 'Add a long-term task');
  longHead.append(el('h2', '', 'Long-term'), add);
  const longList = el('ul', 'tk-list');
  const longNone = el('p', 'none', 'None open. Plan this on Suggest machines, or Add your own.');
  longNone.hidden = true;
  longCard.append(longHead, longList, longNone);

  host.replaceChildren(todayCard, upkeepCard, longCard);

  // A change repaints the parts even when the next answer reads the same: the row tapped holds its buttons until then. It
  // asks through the same throttle as the room's tasks events, which the server sends for the same change.
  // row: the closed row the server answered (a 409's: null), the grid's Undo line's proof that the tap was this browser's.
  const onChanged = (row) => {
    if (!alive) return;
    if (row?.id != null) grid.sent(row.id);
    error.hidden = true;
    painted = '';
    reload.call();
  };
  const onError = (text) => { if (alive) { error.textContent = text; error.hidden = false; } };
  const actions = createTaskActions({ onChanged, onError });
  // the grid's Undo says its failures and asks again the same way
  const grid = createTaskGrid(gridHost, { roomId, week, shown, onWeek, actions, onChanged: () => onChanged(null), onError });
  csvLine.append(grid.printLink, DOT, csv, `: every done, skipped, missed and cancelled task, for the myGAP records`);

  function paint() {
    const key = JSON.stringify(view);
    if (key === painted) return;
    painted = key;
    grid.update(view);
    keepFocus(host, () => {
      subText.textContent = `${dayTitle(view.date)}${DOT}${tasksDueWords(view.counts?.due ?? 0)}`;
      const crop = mainCrop(view.crop?.crops); // the room's main crop, which a harvest's picture holds
      // Due now (overdue or today) in the list; the rest folded under "Coming up", the nearest date first.
      const up = upkeepRows(view.upkeep, view.date);
      const now = up.filter(({ due }) => (due.late ?? -1) >= 0);
      const later = up.filter(({ due }) => (due.late ?? -1) < 0);
      upkeepList.replaceChildren(...now.map(({ row, due }) => taskRow(row, actions, { due: nowDue(due), crop })));
      upkeepLater.hidden = later.length === 0;
      upkeepLaterSummary.textContent = later.length ? keepLines(comingUpWords(later)) : '';
      upkeepLaterList.replaceChildren(...later.map(({ row, due }) => taskRow(row, actions, { due, crop })));
      upkeepNone.textContent = up.length ? 'Nothing due now.' : 'No upkeep for this room.';
      upkeepNone.hidden = now.length > 0;
      const open = (view.longterm ?? []).filter((r) => r.status === 'open');
      longList.replaceChildren(...open.map((row) => taskRow(row, actions, { line: longtermLine(row), skip: false, cancel: true })));
      longNone.textContent = 'None open. Plan this on Suggest machines, or Add your own.';
      longNone.hidden = open.length > 0;
    });
    onCounts?.(view.counts ?? null);
  }

  async function refresh() {
    if (!alive) return;
    clearTimeout(timer);
    const me = ++seq;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/tasks`);
      if (!alive || me !== seq) return;
      view = data;
      paint();
    } catch (err) {
      if (!alive || me !== seq) return;
      if (routeMissing(err)) { // a farm app from before the tasks: say so, no dot, no empty parts, no timer
        subText.textContent = OUTDATED;
        for (const node of [gridHost, csvLine, upkeepCard, longCard]) node.hidden = true;
        onCounts?.(null);
        return;
      }
      if (err.status === 404) { onGone?.(); return; }
      if (!view) {
        subText.textContent = "Couldn't load the tasks";
        for (const none of [upkeepNone, longNone]) { none.textContent = "Couldn't load the tasks"; none.hidden = false; }
      }
    }
    if (!alive) return;
    clearTimeout(timer);
    timer = setTimeout(refresh, fallbackMs(REFRESH_MS, live.connected()));
  }

  add.addEventListener('click', () => actions.add(roomId));

  // The room's tasks moved (a Done elsewhere, a new day made, a stage change): ask again, at most once in 2 s. The stream
  // back: ask once, as the timer does. The stream gone: the short timer.
  const reload = createThrottle(() => { if (alive) refresh(); });
  const catchUp = createThrottle(() => { if (alive) refresh(); });
  const offLive = [
    live.on('room', (d) => { if (d.id === roomId && d.part === 'tasks') reload.call(); }),
    live.onStatus((up) => {
      if (up) catchUp.call();
      else if (view) { clearTimeout(timer); timer = setTimeout(refresh, REFRESH_MS); }
    }),
  ];
  refresh();

  return {
    setWeek: (w) => grid.setWeek(w),
    show: () => grid.show(),
    destroy() {
      alive = false;
      seq++;
      clearTimeout(timer);
      reload.cancel();
      catchUp.cancel();
      for (const off of offLive) off();
      grid.destroy();
      actions.destroy();
      host.replaceChildren();
      host.className = hostClass;
    },
  };
}

// The room's Tasks tab (spec 2026-10-30-tasks-design.md 7.1): Today (the day's stage tasks by Morning, Afternoon and Any
// time, the closed ones folded), Upkeep (overdue first), Long-term (Plan this on Suggest machines, or Add) and the Log of the
// last 14 days with Older… and Export CSV. createTasksCard(host, { roomId, onCounts, onGone }) → { destroy() };
// onCounts(counts | null) gives the tab its dot. The card asks for its own data: on the room's tasks events, when the stream
// comes back, and on a timer (30 s; 60 s while the stream is up: the day turns over at midnight without an event).

import { request, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { slotGroups, upkeepRows, nowDue, taskParts, comingUpWords, longtermLine, logRows, dayTitle, tasksDueWords, LOG_DAYS, LOG_PAGE } from './tasks-math.js';
import { createTaskActions, createWorkerPicker } from './task-dialogs.js';
import { el, button, taskRow, slotPart, keepFocus } from './task-list.js';
import { keepLines, DOT } from './text-math.js';
import { mainCrop } from './room-card-math.js';
import { calendarHash } from './calendar-math.js';

const REFRESH_MS = 30_000;

export function createTasksCard(host, { roomId, onCounts, onGone }) {
  let alive = true;
  let seq = 0; // every load takes a token; an answer that finds it changed is dropped
  let logSeq = 0;
  let timer = null;
  let view = null; // GET /api/rooms/:id/tasks
  let painted = ''; // what the parts show: a refresh with nothing new leaves them (and their focus and clicks) alone
  let log = []; // the closed rows read so far, newest first
  let logMore = false; // the last page was full: there may be older ones
  let logAll = false; // Older… was pressed: every row read so far, not only the last 14 days
  let logFailed = false;
  const openFolds = new Set();

  const hostClass = host.className;
  host.className = 'tk-grid';

  // Today
  const todayCard = el('section', 'card tk-part tk-today');
  const todayHead = el('div', 'sim-card-head');
  const picker = createWorkerPicker();
  todayHead.append(el('h2', '', 'Today'), picker.node);
  const todaySub = el('p', 'muted tk-sub tk-day', 'Loading…');
  const error = el('p', 'meta warn tk-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  const todayBody = el('div', 'tk-body');
  // the room's days ahead and behind on the Calendar (spec 2026-11-03-calendar-design.md 5)
  const calLine = el('p', 'tk-cal');
  const calLink = el('a', '', 'Open in the calendar');
  calLink.href = calendarHash({ room: roomId });
  calLine.append(calLink);
  todayCard.append(todayHead, todaySub, calLine, error, todayBody);

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
  add.setAttribute('aria-label', 'Add a long-term task');
  longHead.append(el('h2', '', 'Long-term'), add);
  const longList = el('ul', 'tk-list');
  const longNone = el('p', 'none', 'None open. Plan this on Suggest machines, or Add your own.');
  longNone.hidden = true;
  longCard.append(longHead, longList, longNone);

  // Log
  const logCard = el('section', 'card tk-part tk-log-card');
  const logHead = el('div', 'sim-card-head');
  const csv = el('a', 'button', 'Export CSV');
  csv.href = `/api/rooms/${roomId}/tasks/log.csv`;
  csv.setAttribute('download', '');
  const logTitle = el('h2', '', 'Log');
  logHead.append(logTitle, csv);
  const logList = el('ul', 'tk-log');
  const logNone = el('p', 'none');
  logNone.hidden = true;
  const older = button('Older…');
  older.hidden = true;
  logCard.append(logHead, el('p', 'muted tk-sub', `Done, skipped, missed and cancelled tasks of the last ${LOG_DAYS} days. Export CSV has them all, for the myGAP records.`),
    logList, logNone, older);

  host.replaceChildren(todayCard, upkeepCard, longCard, logCard);

  // A change repaints the parts even when the next answer reads the same: the row tapped holds its buttons until then. It
  // asks through the same throttle as the room's tasks events, which the server sends for the same change.
  const actions = createTaskActions({
    onChanged: () => { if (alive) { error.hidden = true; painted = ''; reload.call(); } },
    onError: (text) => { if (alive) { error.textContent = text; error.hidden = false; } },
  });

  function paint() {
    const key = JSON.stringify(view);
    if (key === painted) return;
    painted = key;
    keepFocus(host, () => {
      todaySub.textContent = `${dayTitle(view.date)}${DOT}${tasksDueWords(view.counts?.due ?? 0)}`;
      const groups = slotGroups(view.today);
      const crop = mainCrop(view.crop?.crops); // the room's main crop, which a harvest's picture holds
      todayBody.replaceChildren(...(groups.length ? groups.map((g) => slotPart(g, actions, { openFolds, crop })) : [el('p', 'none', 'No stage tasks today.')]));
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
        todaySub.textContent = OUTDATED;
        for (const node of [picker.node, upkeepCard, longCard, logCard]) node.hidden = true;
        onCounts?.(null);
        return;
      }
      if (err.status === 404) { onGone?.(); return; }
      if (!view) {
        todaySub.textContent = "Couldn't load the tasks";
        for (const none of [upkeepNone, longNone]) { none.textContent = "Couldn't load the tasks"; none.hidden = false; }
      }
    }
    if (!alive) return;
    clearTimeout(timer);
    timer = setTimeout(poll, fallbackMs(REFRESH_MS, live.connected()));
  }

  // The timer: the parts and the Log (not while Older… shows the older pages: they would fold back under the reader).
  function poll() {
    refresh();
    if (!logAll) loadLog();
  }

  // The Log: the first page again (after a change), or the next older page (Older…).
  async function loadLog(next = false) {
    const me = ++logSeq;
    const before = next && log.length ? log[log.length - 1].id : null;
    try {
      const data = await request('GET', `/api/rooms/${roomId}/tasks/log${before === null ? '' : `?before=${before}`}`);
      if (!alive || me !== logSeq) return;
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      log = before === null ? rows : [...log, ...rows];
      if (before === null) logAll = false; // a change or a new first page: back to the last 14 days
      logMore = rows.length >= LOG_PAGE;
      logFailed = false;
    } catch {
      if (!alive || me !== logSeq) return;
      logFailed = true;
    }
    paintLog();
  }

  function paintLog() {
    const lines = logRows(log, Date.now(), logAll);
    logList.replaceChildren(...lines.map((l) => {
      const li = el('li');
      const head = el('p', 'tk-log-head');
      const status = el('span', 'tk-log-status', l.status);
      status.dataset.tone = l.tone;
      head.append(`${l.date} ${l.time}${DOT}`, status, ...[l.worker, l.amount].filter(Boolean).map((t) => `${DOT}${t}`));
      li.append(head, el('p', 'tk-log-task', keepLines(taskParts(l.task).name)));
      if (l.reason) li.append(el('p', 'tk-log-reason', keepLines(l.reason)));
      return li;
    }));
    logNone.textContent = logFailed ? "Couldn't load the log" : `Nothing closed in the last ${LOG_DAYS} days.`;
    logNone.hidden = lines.length > 0 && !logFailed;
    older.hidden = !(logMore || (!logAll && lines.length < log.length));
  }

  // Older… hides itself when there is nothing older: the cursor goes to the first line it added.
  older.addEventListener('click', async () => {
    const shown = logList.children.length;
    logAll = true;
    if (logMore) await loadLog(true);
    else paintLog();
    if (!alive) return;
    if (!older.hidden) return;
    const first = logList.children[shown] ?? logTitle; // nothing older after all: the Log's title
    first.tabIndex = -1;
    first.focus();
  });
  add.addEventListener('click', () => actions.add(roomId));

  // The room's tasks moved (a Done elsewhere, a new day made, a stage change): ask again, at most once in 2 s, the Log from
  // its first page. The stream back: ask once, as the timer does (older Log pages stay). The stream gone: the short timer.
  const reload = createThrottle(() => { if (alive) { refresh(); loadLog(); } });
  const catchUp = createThrottle(() => { if (alive) poll(); });
  const offLive = [
    live.on('room', (d) => { if (d.id === roomId && d.part === 'tasks') reload.call(); }),
    live.onStatus((up) => {
      if (up) catchUp.call();
      else if (view) { clearTimeout(timer); timer = setTimeout(poll, REFRESH_MS); }
    }),
  ];
  refresh();
  loadLog();

  return {
    destroy() {
      alive = false;
      seq++;
      logSeq++;
      clearTimeout(timer);
      reload.cancel();
      catchUp.cancel();
      for (const off of offLive) off();
      actions.destroy();
      picker.destroy();
      host.replaceChildren();
      host.className = hostClass;
    },
  };
}

// The Tasks tab's grid (spec 2026-11-04-task-grid-design.md 2, 3 and 5): the room's daily tasks of a week as its log sheet,
// days down and tasks across on a desk, the same boxes turned on a phone (≤ 600 px: tasks down, days across). A box of today
// is ticked here: a tap is Done, a long press, right-click or the menu key opens Skip…, Undo and Details; a box of a day gone
// shows its Details. The week comes from GET /api/calendar; today's rows (with their ids) from the room tasks reply the card
// already reads, handed over by update().
//   createTaskGrid(host, { roomId, week, onWeek(week | null), actions, onChanged(), onError(text) })
//   → { update(view), setWeek(week | null), destroy() }  (week: a Monday 'YYYY-MM-DD'; null: this week)

import { request, OUTDATED, OFFLINE, routeMissing } from './api.js';
import { live } from './live.js';
import { createThrottle } from './live-math.js';
import { weekOf, shiftWeek, weekTitle, gridColumns, gridCells, menuItems, LEGEND, createPress, gridMove, MOVE_KEYS, createHeld, createPaintGate,
  sheetMonth } from './task-grid-math.js';
import { amountText, farmTime, farmDate } from './tasks-math.js';
import { dayTitle } from './calendar-math.js';
import { openForm, loadWorkers, errorText } from './task-dialogs.js';
import { el, button } from './task-list.js';
import { picture } from './pictures.js';
import { keepLines } from './text-math.js';
import { taskSheetHash } from './route.js';

const PRESS_MS = 500; // a long press opens the menu
const MOVE_PX = 10; // a press that moves further is a scroll, not a long press
const COMMAND_TIMEOUT = 15000;
const PHONE = '(max-width: 600px)';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS = { done: 'Done', missed: 'Missed', skipped: 'Skipped', cancelled: 'Cancelled', open: 'Open', planned: 'Planned' };
const MARKS = { done: '✓', missed: '✗', skipped: '—' };
// the farm's day by this browser's clock, until the first reply says the server's
const localToday = () => farmDate(Date.now());
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
// a box that holds a row: Details, and its menu
const hasRow = (c) => c && c.kind !== 'none' && c.kind !== 'planned';

export function createTaskGrid(host, { roomId, week = null, onWeek, actions, onChanged, onError }) {
  let alive = true;
  let seq = 0; // every load takes a token; an answer that finds it changed is dropped (a late week never paints over a newer one)
  let cal = null; // GET /api/calendar of the week on show
  let view = null; // GET /api/rooms/:id/tasks (the card's)
  let workers = []; // the active workers' names, for the initials' clashes
  let failed = ''; // why the week could not be read, while there is none to show
  let painted = '';
  let current = null; // the box (data-at) the grid's Tab stop is on
  const held = createHeld(); // today's rows tapped: their boxes wait for their row's change (a second tap would send again)
  const media = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
  let turned = media?.matches ?? false;
  const info = new WeakMap(); // a box or a head → what it shows

  // The head: ‹ This week › and the week's dates, Print month at the end.
  const head = el('div', 'tg-head');
  const prev = button('‹', 'tg-step');
  prev.setAttribute('aria-label', 'Week before');
  const next = button('›', 'tg-step');
  next.setAttribute('aria-label', 'Week after');
  const thisWeek = button('This week');
  const title = el('h3', 'tg-title');
  title.setAttribute('aria-live', 'polite');
  const print = el('a', 'button tg-print', 'Print month');
  const nav = el('div', 'tg-nav');
  nav.append(prev, thisWeek, next);
  head.append(nav, title, print);
  const scroller = el('div', 'tg-scroll');
  const table = el('table', 'tg');
  table.setAttribute('role', 'grid');
  scroller.append(table);
  const byAt = (at) => (at ? table.querySelector(`[data-at="${CSS.escape(at)}"]`) : null); // a box or a head by its place
  const none = el('p', 'none tg-none');
  none.hidden = true;
  const legend = el('p', 'muted tg-legend', LEGEND);
  host.replaceChildren(head, none, scroller, legend);

  // ---- data ----

  async function load() {
    if (!alive) return;
    const me = ++seq;
    const { from, to } = weekOf(week ?? cal?.today ?? localToday());
    print.href = taskSheetHash(roomId, sheetMonth({ from, to }, cal?.today ?? localToday())); // at once, not when the week comes
    table.setAttribute('aria-busy', 'true');
    try {
      const data = await request('GET', `/api/calendar?room=${roomId}&from=${from}&to=${to}`);
      if (!alive || me !== seq) return;
      const mine = weekOf(data.today).from;
      if (week === mine) { week = null; onWeek?.(null); } // this week has no query
      if (!week && from !== mine) { cal = data; load(); return; } // the browser's clock was not the server's
      cal = data;
      failed = '';
    } catch (err) {
      if (!alive || me !== seq) return;
      if (cal?.from !== from) cal = null; // another week's boxes must not show under this week's title
      failed = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : "Couldn't load the week";
    }
    table.removeAttribute('aria-busy');
    paint();
  }
  loadWorkers().then((list) => { if (alive) { workers = list; paint(); } }, () => {}); // without them, a clash shows only among the week's

  const shown = () => weekOf(week ?? cal?.today ?? localToday());
  function go(w) {
    week = cal && w === weekOf(cal.today).from ? null : w;
    onWeek?.(week);
    load();
  }
  prev.addEventListener('click', () => go(shiftWeek(shown().from, -1)));
  next.addEventListener('click', () => go(shiftWeek(shown().from, 1)));
  thisWeek.addEventListener('click', () => { if (week !== null) go(null); });

  // ---- painting ----

  // A day's head: "Mon 2" (desk), "M 2" (phone); its name the day in words.
  function dayHead(date, today) {
    const th = el('th', 'tg-day', `${turned ? DAYS[weekday(date)][0] : DAYS[weekday(date)]} ${Number(date.slice(8))}`);
    th.setAttribute('role', turned ? 'columnheader' : 'rowheader');
    th.setAttribute('aria-label', dayTitle(date, today));
    th.dataset.at = `day|${date}`;
    return th;
  }

  // A task's head: its picture and short name, a button that shows the full text.
  function taskHead(col) {
    const th = el('th', 'tg-task');
    th.setAttribute('role', turned ? 'rowheader' : 'columnheader');
    const b = button('', 'tg-task-name');
    b.append(picture('task', col.picture, { size: 24 }), el('span', '', col.shortName));
    b.title = col.text;
    b.dataset.at = `task|${col.key}`;
    info.set(b, { col });
    th.append(b);
    return th;
  }

  // A box: a button when it does something (today's open row, a row's Details), else the cell itself takes the cursor.
  function box(c, col, date) {
    const td = el('td', 'tg-cell');
    td.setAttribute('role', 'gridcell');
    const target = hasRow(c) ? button('', 'tg-box') : el('span', 'tg-box');
    target.dataset.kind = c.kind;
    if (c.about) target.dataset.about = '';
    const look = el('span', 'tg-look');
    look.setAttribute('aria-hidden', 'true');
    if (MARKS[c.kind]) {
      const mark = el('span', 'tg-mark', MARKS[c.kind]);
      if (c.amountText) mark.append(' ', el('span', 'tg-amount', c.amountText)); // a phone's narrow box puts it under the ✓
      look.append(mark);
    }
    if (c.initials) look.append(el('span', 'tg-who', c.initials));
    if (c.about) look.append(el('span', 'tg-about', '≈'));
    target.append(look);
    const focus = hasRow(c) ? target : td;
    focus.setAttribute('aria-label', c.words);
    focus.dataset.at = `${date}|${col.key}`;
    focus.dataset.box = '';
    if (c.taskId != null && held.has(c.taskId)) target.setAttribute('aria-disabled', 'true');
    info.set(focus, { c, col, date });
    td.append(target);
    return td;
  }

  // Every repaint goes through the gate: while the menu is open it waits for it to close.
  const gate = createPaintGate(() => { if (alive) draw(); });
  const paint = () => gate.paint();
  function draw() {
    if (!cal) {
      painted = ''; // the boxes are hidden: the next week read shows, even when it reads as the last
      title.textContent = weekTitle(shown());
      none.textContent = failed || 'Loading…';
      none.hidden = false;
      scroller.hidden = legend.hidden = true;
      return;
    }
    const todayRows = view?.date === cal.today && cal.from <= view.date && view.date <= cal.to ? view.today ?? [] : null;
    const key = JSON.stringify([cal, todayRows, workers, turned, held.ids()]);
    if (key === painted) return; // nothing new: the boxes (their focus and presses) stay
    painted = key;
    title.textContent = weekTitle(cal);
    thisWeek.setAttribute('aria-disabled', String(week === null));
    print.href = taskSheetHash(roomId, sheetMonth(cal, cal.today));
    const columns = gridColumns(cal.days, todayRows ?? []);
    const rows = gridCells({ days: cal.days, columns, today: cal.today, todayRows, workers });
    none.textContent = 'No daily tasks this week.';
    none.hidden = columns.length > 0;
    scroller.hidden = legend.hidden = columns.length === 0;
    const focused = table.contains(document.activeElement) ? document.activeElement.dataset.at : null;
    table.dataset.turn = turned ? 'phone' : 'desk';
    table.style.setProperty('--cols', String(columns.length));
    // One set of boxes; a phone turns it: a row a task, a column a day.
    const corner = el('td', 'tg-corner');
    corner.setAttribute('role', 'gridcell');
    const heads = turned ? rows.map((r) => dayHead(r.date, cal.today)) : columns.map(taskHead);
    const lines = turned
      ? columns.map((col, i) => ({ head: taskHead(col), boxes: rows.map((r) => ({ c: r.cells[i], date: r.date, today: r.today, col })) }))
      : rows.map((r) => ({ head: dayHead(r.date, cal.today), today: r.today, boxes: r.cells.map((c, i) => ({ c, date: r.date, today: r.today, col: columns[i] })) }));
    const top = el('tr');
    top.setAttribute('role', 'row');
    top.append(corner, ...heads);
    if (turned) rows.forEach((r, i) => { if (r.today) heads[i].classList.add('tg-today'); });
    const thead = el('thead');
    thead.append(top);
    const tbody = el('tbody');
    for (const line of lines) {
      const tr = el('tr');
      tr.setAttribute('role', 'row');
      if (line.today) tr.classList.add('tg-today');
      tr.append(line.head, ...line.boxes.map(({ c, col, date, today }) => {
        const td = box(c, col, date);
        if (turned && today) td.classList.add('tg-today');
        return td;
      }));
      tbody.append(tr);
    }
    table.replaceChildren(thead, tbody);
    // The Tab stop: the box it was on, else today's first open box, else today's first, else the first box.
    const stops = [focused, current].map(byAt);
    const stop = stops.find(Boolean) ?? table.querySelector('.tg-today button[data-kind="open"]')
      ?? table.querySelector(':is(.tg-today[data-box], .tg-today [data-box])') ?? table.querySelector('[data-box]');
    for (const n of table.querySelectorAll('[data-at]')) n.tabIndex = n === stop ? 0 : -1;
    current = stop?.dataset.at ?? null;
    if (focused && stop) stop.focus();
  }

  // ---- acting on a box (spec 3) ----

  // After a dialog: the box (or head) at `at` takes the focus again when a repaint under the dialog left it on nothing.
  function refocus(at) {
    if (!alive || !at || (document.activeElement && document.activeElement !== document.body)) return;
    byAt(at)?.focus();
  }

  // Done (a row with an amount opens its dialog; createTaskActions decides) and Skip: the box waits for its row's change in
  // the room reply (update) once something changed, and lets go at once when nothing did.
  function act(action, c, at) {
    const id = c.taskId;
    if (held.has(id)) return;
    held.hold(id, view?.today);
    paint();
    const after = (changed) => {
      if (!alive) return;
      if (!changed && held.letGo(id)) paint();
      refocus(at);
    };
    Promise.resolve(action(c.row)).then(after, () => after(false));
  }

  async function undo(c) {
    try {
      await request('POST', `/api/tasks/${c.taskId}/undo`, undefined, COMMAND_TIMEOUT);
      if (alive) onChanged?.();
    } catch (err) {
      if (!alive) return;
      if (err.status === 409 || err.status === 404) onChanged?.(); // done meanwhile, or too late: the boxes as they are now
      onError?.(errorText(err));
    }
  }

  // Details (a read-only dialog): the task's text and note, its status, who, when, the amount, the reason.
  function details({ c, col, date }, at) {
    const r = c.row;
    // a missed row's closed time is when the server noticed it, not a time anyone did anything
    const facts = [['Status', STATUS[c.kind]], ['Who', r.worker], ['When', c.kind !== 'missed' && Number.isFinite(r.closedAt) ? farmTime(r.closedAt) : ''],
      ['Amount', amountText(r)], ['Reason', r.reason], ['Note', r.note]];
    const dl = el('dl', 'tg-facts');
    for (const [k, v] of facts) if (v) dl.append(el('dt', '', k), el('dd', '', keepLines(String(v))));
    const text = typeof r.text === 'string' && r.text.trim() ? [r.text] : []; // no empty line for a row without one
    openForm({ title: col.shortName, lead: [dayTitle(date, cal?.today), ...text, dl] }).closed.then(() => refocus(at));
  }

  // A task's full text (its head's tap).
  function fullText(col, at) {
    openForm({ title: col.shortName, lead: [col.text || col.shortName] }).closed.then(() => refocus(at));
  }

  function tap(node) {
    const x = info.get(node);
    if (!x) return;
    const at = node.dataset.at;
    if (!x.c) fullText(x.col, at);
    else if (x.c.kind === 'open' && x.c.taskId != null) act(actions.done, x.c, at);
    else if (hasRow(x.c)) details(x, at);
  }

  // ---- the menu: Skip… (an open box of today), Undo (a Done or Skip of the last minute), Details ----

  let menu = null;
  let menuFor = null;
  // (back: the focus to its box, found by its place, as a repaint held while the menu was open may have made it anew)
  function closeMenu(back = false) {
    if (!menu) return;
    menu.remove();
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
    const at = menuFor.dataset.at;
    menu = menuFor = null;
    gate.closed();
    if (back) byAt(at)?.focus();
  }
  const outside = (e) => { if (!menu?.contains(e.target)) closeMenu(); };
  const onMove = () => closeMenu(); // the menu is fixed: a scroll or a resize would leave it away from its box

  function openMenu(pressed) {
    if (menuFor === pressed) return; // the timer and the contextmenu of one press open one menu
    closeMenu();
    const at = pressed.dataset.at;
    const node = pressed.isConnected ? pressed : byAt(at); // made anew by a repaint the last menu held
    const x = info.get(node);
    if (!hasRow(x?.c)) return;
    const { c } = x;
    const run = { skip: ['Skip…', () => act(actions.skip, c, at)], undo: ['Undo', () => undo(c)], details: ['Details', () => details(x, at)] };
    const items = menuItems(c, Date.now()).map((k) => run[k]);
    menu = el('div', 'tg-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', c.words);
    menu.addEventListener('contextmenu', (e) => e.preventDefault()); // a long press on an item is not the browser's menu
    menuFor = node;
    gate.opened();
    for (const [label, run] of items) {
      const b = button(label);
      b.setAttribute('role', 'menuitem');
      b.tabIndex = -1;
      b.addEventListener('click', () => { closeMenu(true); run(); });
      menu.append(b);
    }
    menu.addEventListener('keydown', (e) => {
      const list = [...menu.children];
      const i = list.indexOf(document.activeElement);
      const to = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: list.length - 1 }[e.key];
      if (to !== undefined) { e.preventDefault(); list[(to + list.length) % list.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); }
      else if (e.key === 'Tab') closeMenu(true);
    });
    document.body.append(menu);
    // at the box: under it, or over it where the screen ends; inside the screen sideways
    const r = node.getBoundingClientRect();
    const m = menu.getBoundingClientRect();
    const below = r.bottom + 4 + m.height <= innerHeight;
    menu.style.top = `${Math.max(4, below ? r.bottom + 4 : r.top - 4 - m.height)}px`;
    menu.style.left = `${Math.max(4, Math.min(r.left, innerWidth - m.width - 4))}px`;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    menu.firstChild.focus({ preventScroll: true });
  }

  // A long press opens the menu; the pointer's tap that ends it must not also act (a keyboard's click always does). A
  // press that moves is a scroll.
  const press = createPress({ onHold: openMenu, ms: PRESS_MS, movePx: MOVE_PX });
  const target = (e) => e.target.closest?.('[data-at]');
  const stopPress = () => press.stop();
  table.addEventListener('pointerdown', (e) => {
    const t = target(e);
    press.down(t && e.button === 0 && hasRow(info.get(t)?.c) ? t : null, e.clientX, e.clientY);
  });
  table.addEventListener('pointermove', (e) => press.move(e.clientX, e.clientY));
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) table.addEventListener(type, stopPress);
  table.addEventListener('click', (e) => {
    const t = target(e);
    if (t?.tagName === 'BUTTON' && press.click(e.detail)) tap(t);
  });
  // right-click, a phone's own long press, Shift+F10 and the menu key
  table.addEventListener('contextmenu', (e) => {
    const t = target(e);
    if (!t || !hasRow(info.get(t)?.c)) return;
    e.preventDefault();
    stopPress();
    openMenu(t);
  });

  // ---- the keyboard: one Tab stop, the arrows move, Home and End to the row's ends (with Ctrl, the grid's) ----

  table.addEventListener('keydown', (e) => {
    const t = target(e);
    if (!t) return;
    if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
      e.preventDefault();
      openMenu(t);
      return;
    }
    if (!MOVE_KEYS.has(e.key)) return;
    e.preventDefault();
    const grid = [...table.rows].map((tr) => [...tr.cells].map((td) => (td.matches('[data-at]') ? td : td.querySelector('[data-at]'))));
    const y = grid.findIndex((row) => row.includes(t));
    const to = gridMove(grid, [y, grid[y].indexOf(t)], e.key, e.ctrlKey);
    if (!to) return;
    const n = grid[to[0]][to[1]];
    t.tabIndex = -1;
    n.tabIndex = 0;
    current = n.dataset.at;
    n.focus();
  });
  table.addEventListener('focusin', (e) => {
    const t = target(e);
    if (!t || t.dataset.at === current) return;
    for (const n of table.querySelectorAll('[data-at]')) n.tabIndex = n === t ? 0 : -1;
    current = t.dataset.at;
  });

  // ---- refresh ----

  // The room's tasks or harvests moved, or the stream came back: the week again, at most once in 2 s.
  const reload = createThrottle(() => { if (alive) load(); });
  const offLive = [
    live.on('room', (d) => { if (d.id === roomId && d.part === 'tasks') reload.call(); }),
    live.on('harvest', (d) => { if (d.roomId == null || d.roomId === roomId) reload.call(); }),
    live.onStatus((up) => { if (up) reload.call(); }),
  ];
  const onTurn = () => { turned = media.matches; paint(); };
  media?.addEventListener('change', onTurn);
  load();

  return {
    // the room tasks reply (today's rows with their ids); a new day: the week again
    update(next) {
      view = next;
      held.changed(next?.today); // a tapped row's change came: its box lets go (paint shows it)
      if (cal && next?.date && next.date !== cal.today) load();
      else paint();
    },
    setWeek(w) {
      if ((w ?? null) === week) return;
      week = w ?? null;
      load();
    },
    destroy() {
      alive = false;
      seq++;
      stopPress();
      closeMenu();
      reload.cancel();
      for (const off of offLive) off();
      media?.removeEventListener('change', onTurn);
      host.replaceChildren();
    },
  };
}

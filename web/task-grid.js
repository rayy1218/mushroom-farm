// The Tasks tab's grid (spec 2026-11-04-task-grid-design.md 2, 3 and 5): the room's daily tasks of a week as its log sheet,
// days down and tasks across on a desk, the same boxes turned where the columns do not fit the card (a phone, a narrow
// tablet: tasks down, days across). A box of today is ticked here: a tap is Done, with a line under the grid to Undo it for a
// minute; a long press, right-click or the menu key opens Skip…, Undo and Details; a box of a day gone shows its Details. The
// week comes from GET /api/calendar, read first when the Tasks tab first shows (show(); shown: it shows already); today's
// rows (with their ids) from the room tasks reply the card already reads, handed over by update(); sent(id): a Done or Skip
// the server took (createTaskActions' onChanged row), the only kind the Undo line offers to undo.
//   createTaskGrid(host, { roomId, week, shown, onWeek(week | null), actions, onChanged(), onError(text) })
//   → { update(view), sent(id), show(), setWeek(week | null), printLink, destroy() }  (week: a Monday 'YYYY-MM-DD'; null:
//   this week; printLink: Print month, for the card's foot)

import { request, OUTDATED, OFFLINE, routeMissing } from './api.js';
import { live } from './live.js';
import { createThrottle } from './live-math.js';
import { weekOf, shiftWeek, weekTitle, gridColumns, gridCells, menuItems, legendFor, createPress, gridMove, MOVE_KEYS, createHeld, createPaintGate,
  sheetMonth, unitHead, deskWidth, doneSplit, createUndoLine } from './task-grid-math.js';
import { amountText, farmTime, farmDate } from './tasks-math.js';
import { dayTitle } from './calendar-math.js';
import { openForm, activeWorkers, errorText } from './task-dialogs.js';
import { el, button } from './task-list.js';
import { picture } from './pictures.js';
import { keepLines, DOT } from './text-math.js';
import { taskSheetHash } from './route.js';

const PRESS_MS = 500; // a long press opens the menu
const MOVE_PX = 10; // a press that moves further is a scroll, not a long press
const COMMAND_TIMEOUT = 15000;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS = { done: 'Done', missed: 'Missed', skipped: 'Skipped', cancelled: 'Cancelled', open: 'Open', planned: 'Planned' };
const SVG = 'http://www.w3.org/2000/svg';
// The marks drawn, not the font's ✓ ✗ — (Inter has no ✓; the fallback drew it 9 px, and ✗ small): 18 px, a 2.6 stroke in
// the box's colour (the ink; amber for missed, muted for skipped), round ends.
const GLYPHS = { done: 'M5 12.5l4.5 4.5L19 7.5', missed: 'M6 6l12 12M18 6L6 18', skipped: 'M6 12h12' };
function glyph(kind) {
  const svg = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ class: 'tg-glyph', viewBox: '0 0 24 24', width: '18', height: '18', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2.6', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(k, v);
  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', GLYPHS[kind]);
  svg.append(path);
  return svg;
}
// the farm's day by this browser's clock, until the first reply says the server's
const localToday = () => farmDate(Date.now());
const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();
// a box that holds a row: Details, and its menu
const hasRow = (c) => c && c.kind !== 'none' && c.kind !== 'planned';

export function createTaskGrid(host, { roomId, week = null, shown: started = true, onWeek, actions, onChanged, onError }) {
  let alive = true;
  let seq = 0; // every load takes a token; an answer that finds it changed is dropped (a late week never paints over a newer one)
  let cal = null; // GET /api/calendar of the week on show
  let view = null; // GET /api/rooms/:id/tasks (the card's)
  let workers = []; // the active workers' names, for the initials' clashes
  let failed = ''; // why the week could not be read, while there is none to show
  let painted = '';
  let current = null; // the box (data-at) the grid's Tab stop is on
  const held = createHeld(); // today's rows tapped: their boxes wait for their row's change (a second tap would send again)
  let width = 0; // the card's inside width: the grid turns when its columns do not fit (deskWidth), not by the screen's
  let turned = false;
  const info = new WeakMap(); // a box or a head → what it shows

  // The head, as the Calendar's: the week's dates, then ‹ This week › at the right (a phone: ‹ dates › on one row).
  const head = el('div', 'tg-head');
  const prev = button('‹', 'tg-step tg-prev');
  prev.setAttribute('aria-label', 'Week before');
  const next = button('›', 'tg-step tg-next');
  next.setAttribute('aria-label', 'Week after');
  const thisWeek = button('This week', 'tg-this');
  const title = el('h3', 'tg-title');
  title.setAttribute('aria-live', 'polite');
  // Print month: in the card's foot, beside Export CSV (the card places it)
  const print = el('a', 'tg-print', 'Print month');
  const nav = el('div', 'tg-nav');
  nav.append(prev, thisWeek, next);
  head.append(title, nav);
  const scroller = el('div', 'tg-scroll');
  const table = el('table', 'tg');
  table.setAttribute('role', 'grid');
  scroller.append(table);
  const byAt = (at) => (at ? table.querySelector(`[data-at="${CSS.escape(at)}"]`) : null); // a box or a head by its place
  const none = el('p', 'none tg-none');
  none.hidden = true;
  // After a Done or Skip from the grid: "Floor done by Sara · Undo" for Undo's minute (said politely; the menu keeps Undo)
  const doneLine = el('p', 'muted tg-done-line');
  doneLine.setAttribute('role', 'status');
  doneLine.setAttribute('aria-live', 'polite');
  const undoLine = createUndoLine({ onChange: (shown) => showDone(shown) });
  // The legend: each box as it shows (the same classes, 14 px) and its words
  const legend = el('p', 'muted tg-legend');
  legendFor('grid').forEach((e, i) => {
    const key = el('span', 'tg-key');
    const sample = el('span', e.kind === 'about' ? 'tg-key-about' : 'tg-box tg-key-box', e.kind === 'about' ? e.mark : '');
    if (e.kind !== 'about') {
      sample.dataset.kind = e.kind;
      if (GLYPHS[e.kind]) { const mark = el('span', 'tg-mark'); mark.append(glyph(e.kind)); sample.append(mark); }
    }
    sample.setAttribute('aria-hidden', 'true');
    key.append(sample, e.words);
    legend.append(...(i ? [DOT, key] : [key]));
  });
  host.replaceChildren(head, none, scroller, doneLine, legend);

  // ---- data ----

  async function load() {
    if (!alive || !started) return; // the tab not shown yet: show() reads it
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
  // without them, a clash shows only among the week's (read with the week's first read)
  const readWorkers = () => activeWorkers().then((list) => { if (alive) { workers = list; paint(); } }, () => {});

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

  // A task's head: its picture, name (an own rule's whole text: two lines at most on a desk, wrapped whole turned) and unit,
  // a button that shows the full text.
  function taskHead(col) {
    const th = el('th', 'tg-task');
    th.setAttribute('role', turned ? 'rowheader' : 'columnheader');
    const b = button('', 'tg-task-name');
    b.append(picture('task', col.picture, { size: 24 }), el('span', 'tg-name', col.name));
    if (unitHead(col)) b.append(el('span', 'tg-unit', unitHead(col))); // the boxes' amounts are bare
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
    if (GLYPHS[c.kind]) {
      const mark = el('span', 'tg-mark');
      mark.append(glyph(c.kind));
      if (c.amountText) mark.append(el('span', 'tg-amount', c.amountText)); // a phone's narrow box puts it under the ✓
      look.append(mark);
    }
    if (c.initials) look.append(el('span', 'tg-who', c.initials));
    if (c.about) look.append(el('span', 'tg-about', '≈'));
    target.append(look);
    const focus = hasRow(c) ? target : td;
    focus.setAttribute('aria-label', c.words);
    focus.dataset.at = `${date}|${col.key}`;
    focus.dataset.box = '';
    if (hasRow(c)) { // its menu: a long press, right-click, Shift+F10 or the menu key
      focus.setAttribute('aria-haspopup', 'menu');
      focus.setAttribute('aria-keyshortcuts', 'Shift+F10');
    }
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
    const columns = gridColumns(cal.days, todayRows ?? []);
    turned = width > 0 && width < deskWidth(columns.length); // not laid out yet: the desk, until the observer says
    const key = JSON.stringify([cal, todayRows, workers, turned, held.ids()]);
    if (key === painted) return; // nothing new: the boxes (their focus and presses) stay
    painted = key;
    title.textContent = weekTitle(cal);
    thisWeek.setAttribute('aria-disabled', String(week === null));
    print.href = taskSheetHash(roomId, sheetMonth(cal, cal.today));
    const rows = gridCells({ days: cal.days, columns, today: cal.today, todayRows, workers });
    none.textContent = 'No daily tasks this week.';
    none.hidden = columns.length > 0;
    scroller.hidden = legend.hidden = columns.length === 0;
    const focused = table.contains(document.activeElement) ? document.activeElement.dataset.at : null;
    table.dataset.turn = host.dataset.turn = turned ? 'phone' : 'desk';
    host.style.setProperty('--cols', String(columns.length)); // the table's widths, and the head's and legend's cap
    const todayAt = rows.findIndex((r) => r.today); // turned: today's column tinted through the task names' rows too
    table.toggleAttribute('data-today', todayAt >= 0);
    table.style.setProperty('--today', String(Math.max(0, todayAt)));
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

  // After a dialog: the box (or head) at `at` takes the focus again when a repaint under the dialog left it on nothing (the
  // page, or still in the closed dialog: Chrome moves it to the page only at the next frame when its box is gone).
  function refocus(at) {
    const a = document.activeElement;
    if (!alive || !at || (a && a !== document.body && a.isConnected && !a.closest('dialog:not([open])'))) return;
    byAt(at)?.focus();
  }

  // Done (a row with an amount opens its dialog; createTaskActions decides) and Skip: the box waits for its row's change in
  // the room reply (update) once something changed, and lets go at once when nothing did.
  // The Undo line waits for the server's answer (sent) and the row's change, and shows once both say it was this tap's;
  // nothing sent (a dialog closed, a failure) leaves nothing waiting.
  function act(action, c, at, col) {
    const id = c.taskId;
    if (held.has(id)) return;
    held.hold(id, view?.today);
    undoLine.expect(id, col.shortName);
    undoAt = at;
    paint();
    const after = (changed) => {
      if (!alive) return;
      if (!changed) { undoLine.drop(id); if (held.letGo(id)) paint(); }
      refocus(at);
    };
    Promise.resolve(action(c.row)).then(after, () => after(false));
  }

  // The line under the grid: the words, then a quiet Undo; empty (still a live region) when there is nothing to undo.
  let undoAt = null; // the box the line is about: the focus goes back to it after its Undo
  function showDone(shown) {
    if (!shown) { doneLine.replaceChildren(); return; }
    const b = button('Undo', 'tk-quiet tg-undo');
    b.addEventListener('click', () => {
      const at = undoAt;
      undoLine.hide();
      undo({ taskId: shown.id });
      byAt(at)?.focus();
    });
    doneLine.replaceChildren(shown.text, DOT, b);
  }

  async function undo(c) {
    undoLine.hide(); // the menu's Undo too: the line's minute is over
    try {
      await request('POST', `/api/tasks/${c.taskId}/undo`, undefined, COMMAND_TIMEOUT);
      if (alive) onChanged?.();
    } catch (err) {
      if (!alive) return;
      if (err.status === 409 || err.status === 404) { onChanged?.(); load(); } // done meanwhile, or too late: the week again, as it is now
      onError?.(errorText(err));
    }
  }

  // Details: the task's text and note, its status, who, when, the amount (a mixed Done's kg by crop under it), the reason.
  // Today's open box also has Skip… and Done, as its tap and menu, so a worker who pressed to read it can act at once.
  function details({ c, col, date }, at) {
    const r = c.row;
    // a missed row's closed time is when the server noticed it, not a time anyone did anything
    const facts = [['Status', STATUS[c.kind]], ['Who', r.worker], ['When', c.kind !== 'missed' && Number.isFinite(r.closedAt) ? farmTime(r.closedAt) : ''],
      ['Amount', amountText(r)], ['Reason', r.reason], ['Note', r.note]];
    const dl = el('dl', 'tg-facts');
    let amount = null; // its dd: By crop goes under it
    for (const [k, v] of facts) {
      if (!v) continue;
      const dd = el('dd', '', keepLines(String(v)));
      dl.append(el('dt', '', k), dd);
      if (k === 'Amount') amount = dd;
    }
    const text = typeof r.text === 'string' && r.text.trim() ? [r.text] : []; // no empty line for a row without one
    const open = c.kind === 'open' && c.taskId != null;
    let chose = null;
    const form = openForm({
      title: col.shortName, lead: [dayTitle(date, cal?.today), ...text, dl],
      ...(open ? { buttons: [{ label: 'Skip…', value: 'skip' }, { label: 'Done', value: 'done', primary: true }], closeLabel: 'Close',
        submit: (_, which) => { chose = which; return true; } } : {}),
    });
    form.closed.then(() => (chose ? act(chose === 'done' ? actions.done : actions.skip, c, at, col) : refocus(at)));
    // the kg of each crop live in the room's harvests (the calendar item holds their sum)
    if (c.kind === 'done' && r.unit === 'kg') {
      request('GET', `/api/rooms/${roomId}/harvests`).then((v) => {
        const split = doneSplit(r, [...(v?.current?.harvests ?? []), ...(v?.past ?? []).flatMap((run) => run.harvests ?? [])]);
        if (split && amount?.isConnected) amount.after(el('dt', '', 'By crop'), el('dd', '', split));
      }, () => {});
    }
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
    else if (x.c.kind === 'open' && x.c.taskId != null) act(actions.done, x.c, at, x.col);
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

  // byKey: the first item takes the focus (and its ring); a pointer's menu takes it itself, so nothing looks picked
  function openMenu(pressed, byKey = false) {
    if (menuFor === pressed) return; // the timer and the contextmenu of one press open one menu
    closeMenu();
    const at = pressed.dataset.at;
    const node = pressed.isConnected ? pressed : byAt(at); // made anew by a repaint the last menu held
    const x = info.get(node);
    if (!hasRow(x?.c)) return;
    const { c } = x;
    const run = { skip: ['Skip…', () => act(actions.skip, c, at, x.col)], undo: ['Undo', () => undo(c)], details: ['Details', () => details(x, at)] };
    const items = menuItems(c, Date.now()).map((k) => run[k]);
    menu = el('div', 'tg-menu');
    menu.setAttribute('role', 'menu');
    menu.tabIndex = -1;
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
      const to = { ArrowDown: i + 1, ArrowUp: (i < 0 ? 0 : i) - 1, Home: 0, End: list.length - 1 }[e.key]; // i -1: the menu itself
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
    (byKey ? menu.firstChild : menu).focus({ preventScroll: true });
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
      openMenu(t, true);
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

  // The room's tasks, crop (its stage or crops: the days planned) or harvests moved, or the stream came back: the week
  // again, at most once in 2 s.
  const reload = createThrottle(() => { if (alive) load(); });
  const offLive = [
    live.on('room', (d) => { if (d.id === roomId && (d.part === 'tasks' || d.part === 'crop')) reload.call(); }),
    live.on('harvest', (d) => { if (d.roomId == null || d.roomId === roomId) reload.call(); }),
    live.onStatus((up) => { if (up) reload.call(); }),
  ];
  // the card's width: a repaint when it crosses the desk layout's width (draw keeps the boxes when the turn is the same), at
  // the next frame: a repaint inside the observer's callback that changes the size again is a "ResizeObserver loop"
  let frame = 0;
  const sized = typeof ResizeObserver === 'function' ? new ResizeObserver(([entry]) => {
    const w = Math.round(entry.contentRect.width);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => { if (alive && w !== width) { width = w; paint(); } });
  }) : null;
  sized?.observe(host);
  if (started) { load(); readWorkers(); }

  return {
    // the room tasks reply (today's rows with their ids); a new day: the week again
    update(next) {
      view = next;
      held.changed(next?.today); // a tapped row's change came: its box lets go (paint shows it)
      undoLine.rows(next?.today); // and the Undo line shows it, or goes when the row opened again
      if (cal && next?.date && next.date !== cal.today) load();
      else paint();
    },
    sent: (id) => undoLine.sent(id),
    show() {
      if (started) return;
      started = true;
      load();
      readWorkers();
    },
    printLink: print,
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
      sized?.disconnect();
      cancelAnimationFrame(frame);
      undoLine.hide();
      host.replaceChildren();
    },
  };
}

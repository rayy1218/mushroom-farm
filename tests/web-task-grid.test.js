// The Tasks tab's grid (spec 2026-11-04-task-grid-design.md 2, 3 and 5): the grid in place of the day list and the Log, its
// keyboard roles, the long press, the menu by state, the week in the address. Source checks, and the menu's pure rule.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menuItems, UNDO_MS } from '../web/task-grid-math.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const grid = src('task-grid.js');
const card = src('tasks-card.js');
const css = src('styles.css');

test("the menu by the box's state: Skip… on today's open row, Undo within the minute, Details on any row", () => {
  const now = Date.UTC(2026, 10, 4, 8, 0);
  const open = { kind: 'open', taskId: 5, row: { status: 'open' } };
  assert.deepEqual(menuItems(open, now), ['skip', 'details']);
  assert.deepEqual(menuItems({ ...open, taskId: null }, now), ['details'], "today's row without its id (the room reply not yet in): no Skip");
  const done = { kind: 'done', taskId: 5, row: { status: 'done', closedAt: now - 30_000 } };
  assert.deepEqual(menuItems(done, now), ['undo', 'details']);
  assert.deepEqual(menuItems(done, now + UNDO_MS), ['details'], 'a minute after: no Undo (the server has the last word)');
  assert.deepEqual(menuItems({ kind: 'skipped', taskId: 5, row: { closedAt: now } }, now), ['undo', 'details']);
  assert.deepEqual(menuItems({ kind: 'done', taskId: null, row: { closedAt: now } }, now), ['details'], 'a past day: Details only');
  for (const kind of ['missed', 'cancelled']) assert.deepEqual(menuItems({ kind, taskId: null, row: {} }, now), ['details'], kind);
  for (const kind of ['none', 'planned']) assert.deepEqual(menuItems({ kind, row: null }, now), [], kind);
  assert.deepEqual(menuItems(null, now), []);
});

test('the card: the grid in place of the day list and the Log; Upkeep, Long-term, the calendar link and Export CSV stay', () => {
  assert.ok(card.includes("import { createTaskGrid } from './task-grid.js';"));
  for (const gone of ['slotGroups', 'slotPart', 'logRows', 'loadLog', "button('Older…')", "el('h2', '', 'Log')", "el('h2', '', 'Today')", 'logCard']) {
    assert.ok(!card.includes(gone), gone);
  }
  assert.ok(card.includes("el('h2', '', 'Daily tasks')"));
  assert.ok(card.includes('csv.href = `/api/rooms/${roomId}/tasks/log.csv`;'));
  assert.ok(card.includes("calLink.href = calendarHash({ room: roomId });"));
  assert.ok(card.includes('onCounts?.(view.counts ?? null);'), 'the tab dot from the room reply, as before');
  assert.ok(card.includes('grid.update(view);'), "today's rows (with their ids) from the reply the card reads: no second request");
  assert.ok(!grid.includes('/api/rooms/${roomId}/tasks'), 'the grid does not ask for the room tasks itself');
  // the Today page keeps the list
  assert.ok(src('today-page.js').includes('slotPart'));
});

test('the week from GET /api/calendar; a late reply never paints over a newer week; refresh on tasks, harvest, the stream back', () => {
  assert.ok(grid.includes("request('GET', `/api/calendar?room=${roomId}&from=${from}&to=${to}`)"));
  assert.ok(grid.includes('const me = ++seq;') && grid.includes('if (!alive || me !== seq) return;'));
  assert.ok(grid.includes('const reload = createThrottle(() => { if (alive) load(); });'));
  assert.ok(grid.includes("live.on('room', (d) => { if (d.id === roomId && d.part === 'tasks') reload.call(); })"));
  assert.ok(grid.includes("live.on('harvest', (d) => { if (d.roomId == null || d.roomId === roomId) reload.call(); })"));
  assert.ok(grid.includes('live.onStatus((up) => { if (up) reload.call(); })'));
  assert.ok(grid.includes("failed = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : \"Couldn't load the week\";"));
  assert.ok(grid.includes("none.textContent = 'No daily tasks this week.';"));
  const destroy = grid.slice(grid.indexOf('destroy() {'));
  for (const x of ['seq++;', 'stopPress();', 'closeMenu();', 'reload.cancel();', 'off()', 'sized?.disconnect();', 'undoLine.hide();']) assert.ok(destroy.includes(x), x);
});

test('one renderer for both layouts: days down on a desk, turned where the columns do not fit the card; this week has no query', () => {
  // by the card's width against the desk layout's (critique #6: a 700 px tablet broke "Contaminat / ion"), not the screen's
  assert.ok(!grid.includes('matchMedia'));
  assert.ok(grid.includes('turned = width > 0 && width < deskWidth(columns.length);'));
  assert.ok(grid.includes('sized?.observe(host);') && grid.includes('if (w !== width) { width = w; paint(); }'));
  assert.ok(grid.includes('const heads = turned ? rows.map((r) => dayHead(r.date, cal.today)) : columns.map(taskHead);'));
  assert.equal(grid.split('box(c, col, date)').length, 3, 'one box renderer (its definition and its one call)');
  assert.ok(grid.includes("b.append(picture('task', col.picture, { size: 24 }), el('span', 'tg-name', col.shortName));"));
  assert.ok(grid.includes("if (unitHead(col)) b.append(el('span', 'tg-unit', unitHead(col)));"), 'the unit once, in the head (critique #2)');
  assert.ok(grid.includes("if (week === mine) { week = null; onWeek?.(null); } // this week has no query"));
  assert.ok(grid.includes('print.href = taskSheetHash(roomId,'));
});

test('keyboard: role="grid", rows and cells, one Tab stop, arrows, Home and End, Shift+F10 and the menu key', () => {
  assert.ok(grid.includes("table.setAttribute('role', 'grid');"));
  assert.ok(grid.includes("tr.setAttribute('role', 'row');") && grid.includes("td.setAttribute('role', 'gridcell');"));
  assert.ok(grid.includes("th.setAttribute('role', turned ? 'columnheader' : 'rowheader');"));
  assert.ok(grid.includes("th.setAttribute('role', turned ? 'rowheader' : 'columnheader');"));
  assert.ok(grid.includes("for (const n of table.querySelectorAll('[data-at]')) n.tabIndex = n === stop ? 0 : -1;"));
  // the moves themselves: tests/web-task-grid-state.test.js (gridMove)
  assert.ok(grid.includes('if (!MOVE_KEYS.has(e.key)) return;') && grid.includes('const to = gridMove(grid, [y, grid[y].indexOf(t)], e.key, e.ctrlKey);'));
  assert.ok(grid.includes("if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {"));
  // the box's words are its name (a screen reader hears "Footbath, Wednesday 4 November: done by Sara at 08:12")
  assert.ok(grid.includes("focus.setAttribute('aria-label', c.words);"));
  assert.ok(grid.includes("look.setAttribute('aria-hidden', 'true');"));
});

test('a long press (500 ms) opens the menu and the tap that ends it does not also act; a press that moves is a scroll', () => {
  assert.ok(grid.includes('const PRESS_MS = 500;'));
  // the press's behaviour (hold, scroll, swallow vs a keyboard's Enter): tests/web-task-grid-state.test.js (createPress)
  assert.ok(grid.includes('const press = createPress({ onHold: openMenu, ms: PRESS_MS, movePx: MOVE_PX });'));
  assert.ok(grid.includes("press.down(t && e.button === 0 && hasRow(info.get(t)?.c) ? t : null, e.clientX, e.clientY);"));
  assert.ok(grid.includes("table.addEventListener('pointermove', (e) => press.move(e.clientX, e.clientY));"));
  assert.ok(grid.includes("if (t?.tagName === 'BUTTON' && press.click(e.detail)) tap(t);"), "the click's detail: 0 from the keyboard");
  assert.ok(grid.includes("table.addEventListener('contextmenu', (e) => {"), 'right-click and a phone\'s own long press');
  assert.ok(grid.includes('if (menuFor === pressed) return;'), 'the timer and the contextmenu of one press open one menu');
  assert.ok(grid.includes("menu.addEventListener('contextmenu', (e) => e.preventDefault());"), 'a long press on an item');
  assert.ok(css.includes('-webkit-touch-callout: none; user-select: none;'), 'a long press does not select the box');
});

test("a tap: today's open box is Done (the one tap, or its dialog), any other row Details; Undo posts and says its errors", () => {
  assert.ok(grid.includes("else if (x.c.kind === 'open' && x.c.taskId != null) act(actions.done, x.c, at, x.col);"));
  assert.ok(grid.includes('else if (hasRow(x.c)) details(x, at);'));
  assert.ok(grid.includes("await request('POST', `/api/tasks/${c.taskId}/undo`, undefined, COMMAND_TIMEOUT);"));
  assert.ok(grid.includes('if (err.status === 409 || err.status === 404) onChanged?.();'));
  assert.ok(grid.includes('onError?.(errorText(err));'));
  // the box waits for the repaint once something changed (a second tap would send again), and lets go when nothing did
  assert.ok(grid.includes("if (c.taskId != null && held.has(c.taskId)) target.setAttribute('aria-disabled', 'true');"));
  // ...and lets go only when the room reply shows its row changed (createHeld; a calendar reload does not)
  assert.ok(grid.includes('held.hold(id, view?.today);') && grid.includes('if (!changed && held.letGo(id)) paint();'));
  const update = grid.slice(grid.indexOf('update(next) {'), grid.indexOf('setWeek(w) {'));
  assert.ok(update.includes('held.changed(next?.today);'));
  assert.equal(grid.split('held.changed(').length, 2, 'only update() lets a box go on a change');
  // Details: the text, then status, who, when (not a missed row's), amount, reason, note
  assert.ok(grid.includes("['Status', STATUS[c.kind]], ['Who', r.worker], ['When', c.kind !== 'missed'"));
  // ...today's open box also Skip… and Done (critique #20); a mixed Done's kg by crop from the room's harvests (#21)
  assert.ok(grid.includes("buttons: [{ label: 'Skip…', value: 'skip' }, { label: 'Done', value: 'done', primary: true }]"));
  assert.ok(grid.includes("form.closed.then(() => (chose ? act(chose === 'done' ? actions.done : actions.skip, c, at, col) : refocus(at)));"));
  assert.ok(grid.includes("request('GET', `/api/rooms/${roomId}/harvests`)") && grid.includes('const split = doneSplit(r, '));
});

test('the Undo line: after a Done or Skip from the grid, "Floor done by Sara · Undo", polite, for the minute (critique #7)', () => {
  assert.ok(grid.includes("const doneLine = el('p', 'muted tg-done-line');"));
  assert.ok(grid.includes("doneLine.setAttribute('role', 'status');") && grid.includes("doneLine.setAttribute('aria-live', 'polite');"));
  assert.ok(grid.includes('undoLine.expect(id, col.shortName);'), 'every act: the tap, the menu\'s Skip…, Details\' Done and Skip…');
  assert.ok(grid.includes('undoLine.rows(next?.today);'), 'shown once the room reply has the row closed');
  assert.ok(grid.includes("const b = button('Undo', 'tk-quiet tg-undo');") && grid.includes('undo({ taskId: shown.id });'));
  assert.ok(grid.includes('host.replaceChildren(head, none, scroller, doneLine, legend);'), 'under the grid, before the legend');
  // its state's behaviour: tests/web-task-grid-math.test.js (createUndoLine)
});

test('the look: amber only for a missed day, the accent on today, a planned box dashed, the boxes 44 px or more on a phone', () => {
  const block = css.slice(css.indexOf("/* ---- the Tasks tab's grid"), css.indexOf('/* ---- the month sheet'));
  assert.ok(block.includes('.tg-box[data-kind="missed"] .tg-mark { color: var(--warning-text);'));
  assert.ok(block.includes('.tg-box[data-kind="missed"] { border-color: color-mix(in srgb, var(--warning) 45%, transparent); background: var(--warning-soft); }'), 'the whole box tinted (critique #9)');
  assert.equal(block.match(/--warning/g).length, 3, 'amber nowhere else');
  assert.doesNotMatch(block, /--good|--critical|#[0-9a-f]{3,6}\b/i, 'no green, no red, no new colour');
  assert.ok(block.includes('.tg[data-turn="desk"] tr.tg-today > * { box-shadow: inset 0 2px var(--accent), inset 0 -2px var(--accent); }'));
  // turned: today's column tinted, through the task names' rows too, not ringed in pieces (critique #11)
  assert.ok(block.includes('.tg[data-turn="phone"] .tg-today { background: var(--accent-soft); }'));
  assert.ok(block.includes('.tg[data-turn="phone"][data-today] .tg-task { background: linear-gradient('));
  assert.ok(grid.includes("table.style.setProperty('--today', String(Math.max(0, todayAt)));"));
  assert.ok(block.includes('.tg-box:is([data-kind="none"], [data-kind="cancelled"]) { border-color: transparent; background: color-mix(in srgb, var(--ink) 9%, transparent); }'), 'not due: a shade with weight (#12)');
  assert.ok(block.includes('.tg-who { color: var(--ink-2); font-size: var(--fs-xs);'), 'the initials at the type scale (#8)');
  assert.ok(grid.includes("if (c.kind === 'done') mark.append(tick());"), 'the tick drawn (#8)');
  assert.ok(block.includes('.tg-menu button:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; background: var(--band); }'), 'the ring inside the item (#19)');
  assert.ok(grid.includes('(byKey ? menu.firstChild : menu).focus({ preventScroll: true });'), "a pointer's menu takes the focus itself");
  assert.ok(block.includes('.tg-box[data-kind="planned"] { border: 1px dashed var(--border-strong); }'));
  assert.ok(block.includes('.tg[data-turn="phone"] .tg-box { min-width: 0; height: 48px;'));
  assert.ok(block.includes('.tg { width: 100%; border-collapse: collapse; table-layout: fixed; font-variant-numeric: tabular-nums; }'));
});

test('the menu holds the repaint and closes on a scroll; a dialog gives the focus back; no repaint after destroy', () => {
  // every paint through the gate (its behaviour: tests/web-task-grid-state.test.js), opened and closed with the menu
  assert.ok(grid.includes('const gate = createPaintGate(() => { if (alive) draw(); });') && grid.includes('const paint = () => gate.paint();'));
  assert.equal(grid.split('draw()').length, 3, 'draw() only behind the gate (its definition and the gate)');
  assert.ok(grid.includes('gate.opened();') && grid.includes('gate.closed();'));
  assert.ok(grid.includes("document.addEventListener('scroll', onMove, true);") && grid.includes("document.removeEventListener('scroll', onMove, true);"));
  assert.ok(grid.includes('if (back) byAt(at)?.focus();'), 'the box found again by its place: a held repaint made it anew');
  // after Done's or Skip's dialog, Details and a task's full text: the box again when the focus fell to the page
  assert.ok(grid.includes('refocus(at);') && grid.split('.closed.then(() => refocus(at));').length === 2);
  assert.ok(grid.includes("if (!alive || !at || (a && a !== document.body && a.isConnected && !a.closest('dialog:not([open])'))) return;"));
  assert.ok(grid.includes('loadWorkers().then((list) => { if (alive) { workers = list; paint(); } }, () => {});'));
  assert.ok(grid.includes("const text = typeof r.text === 'string' && r.text.trim() ? [r.text] : [];"), 'Details: no empty line');
  const load = grid.slice(grid.indexOf('async function load() {'), grid.indexOf("await request('GET', `/api/calendar"));
  assert.ok(load.includes('print.href = taskSheetHash(roomId, sheetMonth({ from, to }, cal?.today ?? localToday()));'), 'Print month has an address while the week loads');
});

test('a desk: columns of 92 to 150 px; the head, Undo line and legend stop at the grid\'s width; Print month in the foot', () => {
  assert.ok(css.includes('.tg[data-turn="desk"] { min-width: calc(88px + var(--cols, 6) * 92px); max-width: calc(88px + var(--cols, 6) * 150px); }'));
  assert.ok(css.includes('.tg-host[data-turn="desk"] > * { max-width: calc(88px + var(--cols, 6) * 150px); }'), 'critique #18');
  assert.ok(grid.includes("host.style.setProperty('--cols', String(columns.length));"));
  assert.ok(css.includes('.tg-task { vertical-align: top; }'), 'the pictures on one line (#15)');
  assert.ok(css.includes('-webkit-line-clamp: 2;'), 'a head two lines at most (#14)');
  // the head as the Calendar's: the dates, then ‹ This week › (#17); on a phone ‹ dates › on one row (#16)
  assert.ok(grid.includes('head.append(title, nav);'));
  assert.ok(css.includes('.tg-this[aria-disabled="true"] { display: none; }'));
  assert.ok(card.includes('csvLine.append(grid.printLink, DOT, csv,'), 'Print month beside Export CSV');
  assert.ok(css.includes('@media (min-width: 900px) {\n  .tk-grid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }'), 'Upkeep and Long-term side by side from 900 px (#24)');
});

// The room's Tasks tab (spec 2026-10-30-tasks-design.md 7.1) and the task rows it shares with the Today page. Source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const card = src('tasks-card.js');
const list = src('task-list.js');

test("the card reads the room's tasks and its log; Export CSV downloads the whole log", () => {
  assert.ok(card.includes("request('GET', `/api/rooms/${roomId}/tasks`)"));
  assert.ok(card.includes("request('GET', `/api/rooms/${roomId}/tasks/log${before === null ? '' : `?before=${before}`}`)"));
  assert.ok(card.includes('csv.href = `/api/rooms/${roomId}/tasks/log.csv`;'));
  assert.ok(card.includes("csv.setAttribute('download', '');"));
});

test('four parts in order: Today by slot, Upkeep overdue first, Long-term with Add, the Log with Older…', () => {
  const at = ['Today', 'Upkeep', 'Long-term', 'Log'].map((t) => card.indexOf(`el('h2', '', '${t}')`));
  assert.ok(at.every((x, i) => x > 0 && (i === 0 || x > at[i - 1])), 'the four titles, in order');
  assert.ok(card.includes('host.replaceChildren(todayCard, upkeepCard, longCard, logCard);'));
  assert.ok(card.includes('slotGroups(view.today)'));
  assert.ok(card.includes('upkeepRows(view.upkeep, view.date)'));
  assert.ok(card.includes('taskRow(row, actions, { line: longtermLine(row), skip: false, cancel: true })'));
  assert.ok(card.includes("add.addEventListener('click', () => actions.add(roomId));"));
  assert.ok(card.includes("const older = button('Older…');"));
  assert.ok(card.includes('logRows(log, Date.now(), logAll)'));
});

test('the tab dot from the counts; the live stream and the stream coming back ask again; destroy stops it all', () => {
  assert.ok(card.includes('onCounts?.(view.counts ?? null);'));
  assert.ok(card.includes("live.on('room', (d) => { if (d.id === roomId && d.part === 'tasks') reload.call(); })"));
  const destroy = card.slice(card.indexOf('destroy() {'));
  for (const x of ['reload.cancel();', 'actions.destroy();', 'picker.destroy();', 'clearTimeout(timer);']) assert.ok(destroy.includes(x), x);
});

test('a row: its text, the crop notes muted under it, Done and Skip; the closed ones folded under "6 done"', () => {
  assert.ok(list.includes("if (row.note) text.append(el('p', 'tk-note', keepLines(row.note)));"));
  assert.ok(list.includes('tap(done, () => actions.done(row));'));
  assert.ok(list.includes('tap(b, () => actions.skip(row));'));
  assert.ok(list.includes("text.append(el('p', 'tk-closed-line', keepLines(closedLine(row))));"));
  assert.ok(list.includes("const fold = el('details', 'tk-fold');"));
  assert.ok(list.includes("const summary = el('summary', '', keepLines(group.fold));"));
  assert.ok(list.includes('fold.append(summary, list);'));
});

test("a tap holds the row's buttons until the list repaints (a tap between the answer and the repaint would send again)", () => {
  // They only look disabled (aria-disabled, like Setup's Save): a disabled button would lose the cursor to the page.
  assert.ok(list.includes("for (const x of held) x.setAttribute('aria-disabled', 'true');"));
  const settle = list.slice(list.indexOf('Promise.resolve(action()).then(async (changed) => {'));
  assert.ok(settle.includes('if (!changed) { release(); return; }') && settle.includes('}, release);'), 'nothing changed or it failed: let go');
  // A change repaints the list even when the next view reads the same, so a held row always comes back.
  assert.ok(card.includes("onChanged: () => { if (alive) { error.hidden = true; painted = ''; reload.call(); } },"));
});

// ---- C6 review ----

test('a closed row hands the focus on: the same button, else the next row, the previous row, the fold, the part\'s title', () => {
  assert.ok(list.includes('summary.dataset.focusKey = `fold-${foldKey}`;'));
  assert.ok(list.includes('part.dataset.foldKey = foldKey;'));
  assert.ok(list.includes('const keys = [node.dataset?.focusKey, keyOf(next), keyOf(prev), fold].filter(Boolean);'));
  assert.ok(list.includes('const plan = host.contains(document.activeElement) ? focusPlan(document.activeElement) : null;'));
  assert.ok(list.includes('heading.tabIndex = -1;'));
  // A dialog that closed after the repaint gives the focus back to a button that is gone: the plan made at the tap is used.
  assert.ok(list.includes('if (b.isConnected) return;'));
});

test('the card: no stray timer, its own changes through the throttle, the Log back to its first page on a change', () => {
  assert.ok(card.includes('async function refresh() {\n    if (!alive) return;'));
  assert.ok(card.includes('clearTimeout(timer);\n    timer = setTimeout(poll, fallbackMs(REFRESH_MS, live.connected()));'));
  assert.ok(card.includes("onChanged: () => { if (alive) { error.hidden = true; painted = ''; reload.call(); } },"));
  assert.ok(card.includes('if (before === null) logAll = false; // a change or a new first page: back to the last 14 days'));
  assert.ok(card.includes('function poll() {\n    refresh();\n    if (!logAll) loadLog();'));
  assert.ok(card.includes('first.tabIndex = -1;'), 'Older… hides itself: the cursor goes to the first older line');
  assert.ok(card.includes("for (const none of [upkeepNone, longNone]) { none.textContent = \"Couldn't load the tasks\"; none.hidden = false; }"));
  assert.ok(card.slice(card.indexOf('destroy() {')).includes('host.className = hostClass;'));
});

// ---- C6 re-review ----

test("the focus after a dialog: Chrome leaves it on the closed dialog's element, not on <body>, so that counts as lost too", () => {
  assert.ok(list.includes("const lost = !a || a === document.body || !a.isConnected || Boolean(a.closest?.('dialog:not([open])'));"));
  assert.ok(list.includes('await new Promise(requestAnimationFrame);'));
  assert.ok(list.includes('if (lost) refocus(document, plan);'));
});

test('the stream coming back does not fold the older Log pages back (the timer\'s rule)', () => {
  assert.ok(card.includes('const catchUp = createThrottle(() => { if (alive) poll(); });'));
  assert.ok(card.includes('if (up) catchUp.call();'));
  assert.ok(card.slice(card.indexOf('destroy() {')).includes('catchUp.cancel();'));
});

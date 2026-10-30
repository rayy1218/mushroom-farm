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
  assert.ok(list.includes("fold.append(el('summary', '', keepLines(group.fold)), list);"));
});

test("a tap holds the row's buttons until the list repaints (a tap between the answer and the repaint would send again)", () => {
  // They only look disabled (aria-disabled, like Setup's Save): a disabled button would lose the cursor to the page.
  assert.ok(list.includes("for (const x of held) x.setAttribute('aria-disabled', 'true');"));
  assert.ok(list.includes('Promise.resolve(action()).then((changed) => { if (!changed) release(); }, release);'));
  // A change repaints the list even when the next view reads the same, so a held row always comes back.
  assert.ok(card.includes("onChanged: () => { if (alive) { error.hidden = true; painted = ''; refresh(); loadLog(); } },"));
});

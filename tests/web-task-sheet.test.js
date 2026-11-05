// A room's month sheet of daily tasks (spec 2026-11-04-task-grid-design.md 4): the page, its mounting and its print rules.
// Source checks (the rows are task-grid-math's sheetRows, tested on their own).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('task-sheet.js');
const app = src('app.js');
const css = src('styles.css');

test('the router mounts the sheet with the route shown before (for Back); no top link is current, as on the room page', () => {
  assert.ok(app.includes("import * as taskSheet from './task-sheet.js';"));
  assert.ok(app.includes(": route.name === 'taskSheet' ? taskSheet.mountSheet(view, { roomId: route.id, month: route.month, from: parseRoute(before) })"));
  assert.ok(app.includes("window.addEventListener('hashchange', (e) => { show(new URL(e.oldURL).hash);"));
  assert.match(app, /const section = route\.name === 'sheet' \? 'harvest' : \['settings', 'overview', 'today', 'calendar', 'harvest'\]\.includes\(route\.name\)/);
});

test("the page: the month's calendar for the room, the head, the table with Initials, the foot, Print and Back", () => {
  assert.ok(page.includes('await request(\'GET\', `/api/calendar?room=${roomId}&from=${first}&to=${last}`)'));
  assert.ok(page.includes('<p class="ts-farm">Farm: <span class="ts-line"></span></p>'));
  assert.ok(page.includes('const title = `Daily tasks${DOT}${name}`;'));
  assert.ok(page.includes('els.month.textContent = monthTitle(shown);'));
  assert.ok(page.includes("const initials = el('th', 'ts-initials', 'Initials');"));
  assert.ok(page.includes('Sheet reviewed by: <span class="ts-line"></span> (Management) on <span class="ts-line ts-line-short"></span>'));
  assert.ok(page.includes('${LEGEND}${DOT}outlined: due'));
  assert.ok(page.includes("q('[data-print]').addEventListener('click', () => window.print());"));
  assert.ok(page.includes('els.back.href = tasksHash(roomId, week);'));
  assert.ok(page.includes("const cameFrom = from?.name === 'detail' && from.id === roomId && from.tab === 'tasks' ? from : null;"), 'Back: the week it came from');
});

test('the sheet\'s rows and page: sheetRows, portrait or landscape and the sideways heads from sheetLayout', () => {
  assert.ok(page.includes('const sheet = sheetRows({ month: shown, days: cal.days, today: cal.today, workers });'));
  assert.ok(page.includes("els.sheet.classList.toggle('ts-landscape', layout.landscape);"));
  assert.ok(page.includes("els.sheet.classList.toggle('ts-sideways', layout.sideways);"));
  assert.ok(page.includes("el('td', `ts-box${c.outlined ? ' ts-outlined' : ''}${c.shaded ? ' ts-shaded' : ''}`, c.text)"));
  assert.ok(page.includes("tr.append(el('td', `ts-write${r.date < cal.today ? ' ts-shaded' : ''}`));"), 'Initials: blank for the pen from today on');
});

test('no month in the address: this month by the server, put in the address without a history entry', () => {
  assert.ok(page.includes("history.replaceState(null, '', taskSheetHash(roomId, month));"));
  assert.ok(page.includes('if (month !== shown) { shown = month; load(); return; }'));
});

test('it stays current and cleans up: the room\'s tasks, crop and name, harvests, the stream; the print class goes', () => {
  assert.ok(page.includes("['tasks', 'crop', 'room'].includes(d.part)"));
  assert.ok(page.includes("live.on('harvest',"));
  assert.ok(page.includes("document.body.classList.add('printing-sheet');"));
  assert.ok(page.includes("document.body.classList.remove('printing-sheet');"));
  assert.ok(page.includes('for (const off of offLive) off();'));
});

test('print: A4 portrait or landscape by named pages, the tools hidden, the light paper of the myGAP sheet, the shade printed', () => {
  assert.match(css, /\.ts-sheet \{ page: ts-portrait; \}/);
  assert.match(css, /\.ts-sheet\.ts-landscape \{ page: ts-landscape; \}/);
  assert.match(css, /@page ts-portrait \{ size: A4 portrait; margin: 12mm; \}/);
  assert.match(css, /@page ts-landscape \{ size: A4 landscape; margin: 12mm; \}/);
  assert.match(css, /body\.printing-sheet \.ts-tools, body\.printing-sheet \.banner[^{]*\{ display: none !important; \}/);
  assert.match(css, /@media print \{\n  body\.printing-sheet \{\s*color-scheme: light; --page: #fff;/, 'the light tokens the page shares');
  assert.match(css, /body\.printing-sheet \.ts-shaded \{ background: #d4d4d4; -webkit-print-color-adjust: exact; print-color-adjust: exact; \}/);
  assert.match(css, /body\.printing-sheet \.ts-table tr \{ break-inside: avoid; \}/);
  assert.match(css, /\.ts-wrap \{ overflow-x: auto; \}/, 'a phone scrolls it sideways');
  assert.match(css, /\.ts-sideways \.ts-task-name \{[^}]*writing-mode: vertical-rl; transform: rotate\(180deg\);/);
});

test('a phone: columns wide enough for "✓ 2.9 AL", the names upwards, the days kept in view as the boxes scroll', () => {
  assert.ok(css.includes('min-width: calc(7.5rem + var(--cols, 6) * 4.5rem);'));
  assert.match(css, /@media screen and \(max-width: 600px\) \{[^@]*\n {2}\.ts-task-name \{[^}]*writing-mode: vertical-rl;/);
  assert.ok(css.includes('.ts-table :is(thead, tbody) .ts-day { position: sticky; left: 0;'));
  assert.ok(css.includes('body.printing-sheet .ts-table .ts-day { width: 12mm; position: static; box-shadow: none; }'), 'not on paper');
});

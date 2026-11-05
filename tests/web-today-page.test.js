// The farm's Today page and the top bar's Today link (spec 2026-10-30-tasks-design.md 7.2). Source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('today-page.js');
const app = src('app.js');
const html = src('index.html');

test('the router mounts the page at #/today and marks its link', () => {
  assert.ok(app.includes("import * as today from './today-page.js';"));
  assert.ok(app.includes(": route.name === 'today' ? today.mount(view, {})"));
  assert.ok(app.includes("const section = route.name === 'sheet' ? 'harvest' : ['settings', 'overview', 'today', 'calendar', 'harvest'].includes(route.name) ? route.name : null;"));
  assert.ok(app.includes("today: document.querySelectorAll('[data-nav=\"today\"]'),"));
});

test("the top bar's Today link, before Overview, with the count of tasks due (hidden at 0)", () => {
  const bar = html.slice(html.indexOf('<header class="topbar">'), html.indexOf('</header>'));
  assert.match(bar, /<a class="top-link" href="#\/today" data-nav="today" aria-label="Today"><svg[^]*?<span>Today<\/span><span class="top-count" data-today-count hidden><\/span><\/a>/);
  assert.ok(bar.indexOf('data-nav="today"') < bar.indexOf('data-nav="overview"'), 'Today before Overview');
  assert.ok(bar.indexOf('data-nav="today"') < bar.indexOf('data-nav="calendar"') && bar.indexOf('data-nav="calendar"') < bar.indexOf('data-nav="overview"'),
    'the Calendar between Today and Overview (spec 2026-11-03-calendar-design.md 5)');
  assert.ok(app.includes("count = todayCount(await request('GET', '/api/tasks/today'));"));
  assert.ok(app.includes("live.on('tasks', (data) => {"));
  assert.ok(app.includes('for (const a of menuLinks.today) a.setAttribute(\'aria-label\', todayLinkLabel(todayDue));'));
  assert.ok(app.includes('el.textContent = countText(todayDue);'), 'the count stops at 99+');
});

test("on its way to #/today the top bar leaves the count to the page's own load, which hands its total to the top bar", () => {
  assert.ok(app.includes("window.addEventListener('hashchange', (e) => { show(new URL(e.oldURL).hash); refreshBadge(); if (mounted?.name !== 'today') refreshToday(); });"));
  assert.ok(page.includes("window.dispatchEvent(new CustomEvent('farm:today-count', { detail: todayCount(view) }));"));
  assert.ok(page.indexOf("new CustomEvent('farm:today-count'") > page.indexOf('view = data;'), 'after each load');
  assert.ok(app.includes("window.addEventListener('farm:today-count', (event) => {"));
  const listener = app.slice(app.indexOf("window.addEventListener('farm:today-count'"));
  assert.match(listener, /^[^]*?todaySeq\+\+;[^]*?if \(Number\.isInteger\(event\.detail\)\) todayDue = event\.detail;[^]*?showToday\(\);/);
});

test('the stream gone before the first answer: the page still switches to the 30 s timer (not on a farm app without tasks)', () => {
  assert.ok(page.includes('else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }'));
  assert.ok(page.includes('if (routeMissing(err)) { outdated = true; picker.node.hidden = true; return; }'));
});

test("the page: who is doing the rounds, each room's open rows by slot and its overdue upkeep, then the long-term lines", () => {
  assert.ok(page.includes("request('GET', '/api/tasks/today')"));
  assert.ok(page.includes("q('[data-picker]').append(picker.node);"));
  assert.ok(page.includes('slotPart(g, actions, { openFolds, foldKey: `${r.id}:${g.slot}`, crop: crop.crop })'));
  assert.ok(page.includes('const crop = cropLine(r.crop);'), 'the crop line and picture under the room name (spec 2026-11-03-pictures-design.md 3)');
  assert.ok(page.includes('upkeepRows(r.upkeepDue, view.date)'));
  assert.ok(page.includes("link.href = roomHash(r.id, 'tasks');"));
  assert.ok(page.includes('const a = el(\'a\', \'\', `${r.name}: ${longtermWords(r.longterm)}`);'));
  assert.ok(page.includes("document.title = 'Today · Mushroom farm';"));
  assert.ok(page.includes("live.on('tasks', () => reload.call())"));
  const unmount = page.slice(page.indexOf('return function unmount()'));
  for (const x of ['reload.cancel();', 'actions.destroy();', 'picker.destroy();', 'clearTimeout(timer);']) assert.ok(unmount.includes(x), x);
});

test('a Done or Skip repaints the page even when the next answer reads the same (the tapped row lets go), through the throttle', () => {
  assert.match(page, /onChanged: \(\) => \{ if \(alive\(\)\) \{ els\.error\.hidden = true; painted = ''; reload\.call\(\); \} \}/);
  assert.ok(page.includes('import { el, taskRow, slotPart, keepFocus } from \'./task-list.js\';'), 'the rows, their hold and focus come from task-list');
  assert.ok(page.includes('keepFocus(container, () => {'));
});

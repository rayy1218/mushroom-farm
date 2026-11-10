// The room page's tabs (owner, 2026-10-26: "page is too long make it tab"): the alarms above the tabs, one panel per tab,
// a tab change shows and hides panels without mounting the page again. Source checks, like the other page tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_TABS } from '../web/route.js';

const page = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const template = page.slice(page.indexOf('const TEMPLATE'), page.indexOf('`;', page.indexOf('const TEMPLATE')));

// Each tab's panel holds these sections, in this order (redesign 2026-10-28: tabs for the jobs check, act, set up; Tasks
// 2026-10-30).
const PANELS = {
  now: ['data-readings', 'data-picture', 'data-now-side', 'data-mode', 'data-machine-list', 'data-machines', 'data-crop-sum'],
  history: ['data-range', 'data-charts', 'data-usage-charts', 'data-usage data-owner-only>', 'data-timeline'], // the by-day card with the range's energy and water (critique 2026-10-28)
  crop: ['data-crop'],
  tasks: ['data-tasks'],
  harvest: ['data-harvest'],
  simulations: ['data-simulations'],
  setup: ['data-control', 'data-equipment', 'data-filter', 'data-profile', 'data-delete'],
};

test('the tabs under the title; the alarms before the panels (moved into the Now tab\'s side column while it shows)', () => {
  const head = template.indexOf('class="page-head room-head"'), bar = template.indexOf('data-tabs'), main = template.indexOf('class="room-main"');
  const alarms = template.indexOf('data-alarms'), panel = template.indexOf('data-panel=');
  assert.ok(head >= 0 && bar > head && main > bar && alarms > main && panel > alarms, 'the head, the tab bar, then the content: alarms, then the panels');
  assert.match(page, /if \(tab === 'now'\) \{ if \(alarmsNode\.parentNode !== nowSide\) nowSide\.prepend\(alarmsNode\); \}/);
  assert.match(page, /else if \(alarmsNode\.parentNode !== main\) main\.prepend\(alarmsNode\);/);
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /\.room-layout/, 'no side bar any more');
  assert.match(css, /\.room-tabs a\[aria-current="page"\] \{ color: var\(--ink\); border-bottom-color: var\(--accent\); \}/);
});

test('one panel per tab, holding its sections', () => {
  for (const { key } of ROOM_TABS) {
    const start = template.indexOf(`data-panel="${key}"`);
    assert.ok(start > 0, `panel ${key}`);
    const end = template.indexOf('data-panel=', start + 1);
    const body = template.slice(start, end === -1 ? undefined : end);
    let last = -1;
    for (const section of PANELS[key]) {
      const at = body.indexOf(section);
      assert.ok(at > last, `${section} in the ${key} panel, in order`);
      last = at;
    }
  }
});

test('the Now tab: the readings first; on a narrow screen one column in the order readings, alarms, control, machines, switches, picture, crop', () => {
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  const narrow = css.slice(css.indexOf('@media (max-width: 1099px) {\n  .now {'));
  const order = ['data-readings', 'data-alarms', 'data-mode', 'data-machine-list', 'data-machines', 'data-picture', 'data-crop-sum']
    .map((k) => Number(new RegExp(`\\.now \\[${k}\\] \\{ order: (\\d+); \\}`).exec(narrow)?.[1]));
  assert.deepEqual(order, [1, 2, 3, 4, 5, 6, 7]);
});

test('the tab bar links each tab by its address and marks the current one', () => {
  assert.match(page, /import \{ ROOM_TABS, OWNER_TABS, roomHash, tasksHash \} from '\.\/route\.js';/);
  assert.match(page, /a\.href = roomHash\(id, t\.key\)/);
  assert.match(page, /setAttribute\('aria-current', 'page'\)/);
  assert.match(page, /panel\.hidden = panel\.dataset\.panel !== tab/);
});

test('mount takes the tab, and the page can change tab without mounting again', () => {
  assert.match(page, /export function mount\(container, \{ id, tab = 'now', week = null \}\)/);
  assert.match(page, /unmount\.setTab = setTab;/);
  assert.match(app, /detail\.mount\(view, \{ id: route\.id, tab: route\.tab, week: route\.week \?\? null \}\)/);
  assert.match(app, /mounted\?\.name === 'detail' && route\.name === 'detail' && mounted\.id === route\.id/);
  assert.match(app, /unmount\.setTab\?\.\(route\.tab\)/);
  // the Tasks tab's week (spec 2026-11-04-task-grid-design.md 2): from the address, and back into it in place
  assert.ok(app.includes("if (route.tab === 'tasks') unmount.setWeek?.(route.week ?? null);"));
  assert.ok(page.includes('unmount.setWeek = (w) => { setTasksWeek(w); tasksCard?.setWeek(week); };'));
  // the Tasks tab's link carries the week: leaving the tab and coming back keeps it (while on the room's page)
  assert.ok(page.includes('tasksLink.href = tasksHash(id, week);'));
  assert.ok(page.includes("onWeek: (w) => { setTasksWeek(w); if (alive() && tab === 'tasks')"));
  assert.ok(page.includes("window.history.replaceState(null, '', tasksHash(id, w));"), 'history is the History tab\'s state in this page');
});

test('links back into a room open the right tab', () => {
  const run = readFileSync(new URL('../web/simulation-page.js', import.meta.url), 'utf8');
  assert.match(run, /els\.back\.href = roomHash\(id, 'simulations'\)/);
  const usage = readFileSync(new URL('../web/usage-math.js', import.meta.url), 'utf8');
  assert.match(usage, /href: roomHash\(r\.id, 'history'\)/);
});

test('the Tasks tab: its card, made once, gone with a missing room and on leaving; its tab carries the due count', () => {
  assert.match(page, /import \{ createTasksCard \} from '\.\/tasks-card\.js';/);
  assert.match(page, /import \{ tabDot \} from '\.\/tasks-math\.js';/);
  assert.ok(page.includes('tasksCard ??= createTasksCard(els.tasksHost, {'));
  assert.ok(page.includes('onCounts: (c) => { if (alive()) paintTasksDot(c); }, onGone: () => { if (alive()) load(); },'));
  const missing = page.slice(page.indexOf('function showMissing()'), page.indexOf('function renderHead()'));
  assert.ok(missing.includes('tasksCard?.destroy();') && missing.includes('paintTasksDot(null);'));
  const unmount = page.slice(page.indexOf('function unmount()'));
  assert.ok(unmount.includes('tasksCard?.destroy();'));
  assert.ok(page.includes("if (t.key === 'tasks') {"));
  assert.ok(page.includes("tasksDot = text('span', 'tab-dot tab-count');"));
  assert.ok(page.includes("tasksLink.setAttribute('aria-label', `Tasks: ${dot.label}`);"));
  assert.ok(page.includes("if (data.part === 'tasks') return; // the Tasks card asks for its own"));
});

test('the Harvest tab: its card, made once, gone with a missing room and on leaving', () => {
  assert.match(page, /import \{ createHarvestCard \} from '\.\/harvest-card\.js';/);
  assert.ok(page.includes('harvestCard ??= createHarvestCard(els.harvestHost, { roomId: id, getRoom: () => room, onGone: () => { if (alive()) load(); } });'));
  const missing = page.slice(page.indexOf('function showMissing()'), page.indexOf('function renderHead()'));
  assert.ok(missing.includes('harvestCard?.destroy();'));
  assert.ok(page.slice(page.indexOf('function unmount()')).includes('harvestCard?.destroy();'));
});

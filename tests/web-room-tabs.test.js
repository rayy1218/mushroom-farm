// The room page's tabs (owner, 2026-10-26: "page is too long make it tab"): the alarms above the tabs, one panel per tab,
// a tab change shows and hides panels without mounting the page again. Source checks, like the other page tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_TABS } from '../web/route.js';

const page = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const template = page.slice(page.indexOf('const TEMPLATE'), page.indexOf('`;', page.indexOf('const TEMPLATE')));

// Each tab's panel holds these sections, in this order (redesign 2026-10-28: five tabs for the jobs check, act, set up).
const PANELS = {
  now: ['data-readings', 'data-picture', 'data-now-side', 'data-mode', 'data-machine-list', 'data-machines', 'data-crop-sum'],
  history: ['data-range', 'data-charts', 'data-usage-charts', 'data-timeline', 'data-usage>'],
  crop: ['data-crop'],
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
  assert.match(page, /import \{ ROOM_TABS, roomHash \} from '\.\/route\.js';/);
  assert.match(page, /a\.href = roomHash\(id, t\.key\)/);
  assert.match(page, /setAttribute\('aria-current', 'page'\)/);
  assert.match(page, /panel\.hidden = panel\.dataset\.panel !== tab/);
});

test('mount takes the tab, and the page can change tab without mounting again', () => {
  assert.match(page, /export function mount\(container, \{ id, tab = 'now' \}\)/);
  assert.match(page, /unmount\.setTab = setTab;/);
  assert.match(app, /detail\.mount\(view, \{ id: route\.id, tab: route\.tab \}\)/);
  assert.match(app, /mounted\?\.name === 'detail' && route\.name === 'detail' && mounted\.id === route\.id/);
  assert.match(app, /unmount\.setTab\?\.\(route\.tab\)/);
});

test('links back into a room open the right tab', () => {
  const run = readFileSync(new URL('../web/simulation-page.js', import.meta.url), 'utf8');
  assert.match(run, /els\.back\.href = roomHash\(id, 'simulations'\)/);
  const usage = readFileSync(new URL('../web/usage-math.js', import.meta.url), 'utf8');
  assert.match(usage, /href: roomHash\(r\.id, 'history'\)/);
});

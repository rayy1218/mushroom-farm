// The room page's tabs (owner, 2026-10-26: "page is too long make it tab"): the alarms above the tabs, one panel per tab,
// a tab change shows and hides panels without mounting the page again. Source checks, like the other page tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ROOM_TABS } from '../web/route.js';

const page = readFileSync(new URL('../web/room-detail.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const template = page.slice(page.indexOf('const TEMPLATE'), page.indexOf('`;', page.indexOf('const TEMPLATE')));

// Each tab's panel holds these sections, in this order.
const PANELS = {
  overview: ['data-room-card'],
  charts: ['data-range', 'data-charts', 'data-timeline'],
  climate: ['data-control', 'data-machines'],
  crop: ['data-crop'],
  sensors: ['data-sensors', 'data-filter'],
  energy: ['data-usage'],
  simulations: ['data-simulations'],
  profile: ['data-profile', 'data-delete'],
  equipment: ['data-equipment'],
};

test('a side bar of tabs beside the content; the alarms at the top of the content, outside every panel (seen on every tab)', () => {
  const layout = template.indexOf('class="room-layout"'), bar = template.indexOf('data-tabs'), main = template.indexOf('class="room-main"');
  const alarms = template.indexOf('data-alarms'), panel = template.indexOf('data-panel=');
  assert.ok(layout > 0 && bar > layout && main > bar && alarms > main && panel > alarms, 'layout: the tab bar, then the content: alarms, then the panels');
  const css = readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.room-layout \{ display: grid; grid-template-columns: 196px minmax\(0, 1fr\);/, 'a side bar from 900 px');
  assert.match(css, /\.room-tabs \{ flex-direction: column;/);
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

test('the tab bar links each tab by its address and marks the current one', () => {
  assert.match(page, /import \{ ROOM_TABS, roomHash \} from '\.\/route\.js';/);
  assert.match(page, /a\.href = roomHash\(id, t\.key\)/);
  assert.match(page, /setAttribute\('aria-current', 'page'\)/);
  assert.match(page, /panel\.hidden = panel\.dataset\.panel !== tab/);
});

test('mount takes the tab, and the page can change tab without mounting again', () => {
  assert.match(page, /export function mount\(container, \{ id, tab = 'overview' \}\)/);
  assert.match(page, /unmount\.setTab = setTab;/);
  assert.match(app, /detail\.mount\(view, \{ id: route\.id, tab: route\.tab \}\)/);
  assert.match(app, /mounted\?\.name === 'detail' && route\.name === 'detail' && mounted\.id === route\.id/);
  assert.match(app, /unmount\.setTab\?\.\(route\.tab\)/);
});

test('links back into a room open the right tab', () => {
  const run = readFileSync(new URL('../web/simulation-page.js', import.meta.url), 'utf8');
  assert.match(run, /els\.back\.href = roomHash\(id, 'simulations'\)/);
  const usage = readFileSync(new URL('../web/usage-math.js', import.meta.url), 'utf8');
  assert.match(usage, /href: roomHash\(r\.id, 'energy'\)/);
});

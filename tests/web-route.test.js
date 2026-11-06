import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, isCanonical, ROOM_TABS, roomHash, suggestHash, canonicalHash, TODAY_HASH, HARVEST_HASH, SALES_HASH, sheetHash, tasksHash, taskSheetHash, BATCHES_HASH, batchHash, batchesRunHash, batchSheetHash } from '../web/route.js';

test('empty and unknown hashes mean the Overview', () => {
  for (const h of ['', '#', '#/', '#/other', '#/rooms/abc', '#/rooms/0', '#/rooms/01', '#/rooms/1/x', '#/rooms/-1', undefined]) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, String(h));
  }
});

test('#/rooms is the Overview now (the Rooms list is folded into it); the old address is tidied', () => {
  assert.deepEqual(parseRoute('#/rooms'), { name: 'overview' });
  assert.equal(isCanonical('#/rooms'), false);
});

test('a room id means the detail page, on its Now tab', () => {
  assert.deepEqual(parseRoute('#/rooms/7'), { name: 'detail', id: 7, tab: 'now' });
  assert.deepEqual(parseRoute('#/rooms/123/'), { name: 'detail', id: 123, tab: 'now' });
});

test('seven room tabs (redesign 2026-10-28; Tasks between Crop and Simulations, 2026-10-30; Harvest after Tasks, 2026-11-04); a tab is part of the address', () => {
  assert.deepEqual(ROOM_TABS.map((t) => t.key), ['now', 'history', 'crop', 'tasks', 'harvest', 'simulations', 'setup']);
  assert.deepEqual(ROOM_TABS.map((t) => t.label), ['Now', 'History', 'Crop', 'Tasks', 'Harvest', 'Simulations', 'Setup']);
  for (const tab of ['history', 'crop', 'tasks', 'harvest', 'simulations', 'setup']) {
    assert.deepEqual(parseRoute(`#/rooms/7/${tab}`), { name: 'detail', id: 7, tab });
    assert.deepEqual(parseRoute(`#/rooms/7/${tab}/`), { name: 'detail', id: 7, tab });
    assert.equal(isCanonical(`#/rooms/7/${tab}`), true);
    assert.equal(isCanonical(`#/rooms/7/${tab}/`), false);
  }
  assert.deepEqual(parseRoute('#/rooms/7/alarms'), { name: 'overview' });
  assert.equal(roomHash(7), '#/rooms/7');
  assert.equal(roomHash(7, 'now'), '#/rooms/7');
  assert.equal(roomHash(7, 'history'), '#/rooms/7/history');
  assert.equal(roomHash(7, 'tasks'), '#/rooms/7/tasks');
  assert.equal(roomHash(7, 'nonsense'), '#/rooms/7');
  assert.equal(roomHash(7, 'setup'), '#/rooms/7/setup');
});

test("the old nine tabs' addresses (bookmarks, links) open the tab that holds them now, and are tidied to it", () => {
  const OLD = { overview: 'now', charts: 'history', energy: 'history', climate: 'setup', sensors: 'setup', profile: 'setup', equipment: 'setup' };
  for (const [old, tab] of Object.entries(OLD)) {
    assert.deepEqual(parseRoute(`#/rooms/7/${old}`), { name: 'detail', id: 7, tab }, old);
    assert.equal(isCanonical(`#/rooms/7/${old}`), false, `${old} is tidied`);
    assert.equal(roomHash(7, old), roomHash(7, tab), `roomHash(${old})`);
  }
});

test('canonical hashes are left alone, others are tidied', () => {
  assert.equal(isCanonical('#/overview'), true);
  assert.equal(isCanonical('#/rooms/7'), true);
  assert.equal(isCanonical(''), false);
  assert.equal(isCanonical('#/rooms/7/'), false);
  assert.equal(isCanonical('#/rooms/x'), false);
});

test('a simulation run of a room is its own page', () => {
  assert.deepEqual(parseRoute('#/rooms/3/simulations/12'), { name: 'simulation', id: 3, runId: 12 });
  assert.deepEqual(parseRoute('#/rooms/3/simulations/12/'), { name: 'simulation', id: 3, runId: 12 });
  assert.deepEqual(parseRoute('#/rooms/3/simulations'), { name: 'detail', id: 3, tab: 'simulations' }, 'without a run: the Simulations tab');
  for (const h of ['#/rooms/3/simulations/0', '#/rooms/3/simulations/x', '#/rooms/0/simulations/1', '#/rooms/3/simulations/1/2']) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, h);
  }
  assert.equal(isCanonical('#/rooms/3/simulations/12'), true);
  assert.equal(isCanonical('#/rooms/3/simulations/12/'), false);
  assert.equal(isCanonical('#/rooms/3/simulations/0'), false);
});

test('Suggest machines is a page of its room (owner 2026-10-28: out of the Simulate dialog)', () => {
  assert.deepEqual(parseRoute('#/rooms/3/suggest'), { name: 'suggest', id: 3 });
  assert.deepEqual(parseRoute('#/rooms/3/suggest/'), { name: 'suggest', id: 3 });
  assert.equal(isCanonical('#/rooms/3/suggest'), true);
  assert.equal(isCanonical('#/rooms/3/suggest/'), false);
  assert.deepEqual(parseRoute('#/rooms/0/suggest'), { name: 'overview' });
  assert.equal(suggestHash(3), '#/rooms/3/suggest');
  assert.equal(canonicalHash({ name: 'suggest', id: 3 }), '#/rooms/3/suggest');
  assert.equal(canonicalHash({ name: 'simulation', id: 3, runId: 12 }), '#/rooms/3/simulations/12');
  assert.equal(canonicalHash({ name: 'detail', id: 3, tab: 'history' }), '#/rooms/3/history');
  assert.equal(canonicalHash({ name: 'settings' }), '#/settings');
  assert.equal(canonicalHash({ name: 'overview' }), '#/overview');
});

test("#/today is the farm's Today page (spec 2026-10-30-tasks-design.md 7.2)", () => {
  assert.deepEqual(parseRoute('#/today'), { name: 'today' });
  assert.deepEqual(parseRoute('#/today/'), { name: 'today' });
  assert.equal(isCanonical('#/today'), true);
  assert.equal(isCanonical('#/today/'), false);
  assert.equal(canonicalHash({ name: 'today' }), '#/today');
  assert.equal(TODAY_HASH, '#/today');
  assert.deepEqual(parseRoute('#/todayx'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/today?x'), { name: 'overview' });
  assert.equal(isCanonical('#/today?x'), false);
});

test('#/calendar is the Calendar page, its room and day in the query (spec 2026-11-03-calendar-design.md 5)', () => {
  assert.deepEqual(parseRoute('#/calendar'), { name: 'calendar', room: null, day: null });
  assert.deepEqual(parseRoute('#/calendar?room=2&day=2026-11-04'), { name: 'calendar', room: 2, day: '2026-11-04' });
  assert.deepEqual(parseRoute('#/calendar?room=zz'), { name: 'calendar', room: null, day: null });
  for (const bad of ['2026-13-01', '2026-02-30', '2026-00-10', '2026-11-32']) {
    assert.deepEqual(parseRoute(`#/calendar?room=2&day=${bad}`), { name: 'calendar', room: 2, day: null }, `${bad}: no day, not a RangeError`);
    assert.equal(isCanonical(`#/calendar?day=${bad}`), false, bad);
  }
  assert.equal(isCanonical('#/calendar?room=2&day=2026-11-04'), true);
  assert.equal(isCanonical('#/calendar?day=2026-11-04&room=2'), false, 'one order');
  assert.equal(canonicalHash({ name: 'calendar', room: null, day: '2026-11-04' }), '#/calendar?day=2026-11-04');
});

test('routes: the Harvest tab, the Harvest page and the sheet', () => {
  assert.ok(ROOM_TABS.some((t) => t.key === 'harvest' && t.label === 'Harvest'));
  assert.deepEqual(ROOM_TABS.map((t) => t.key).slice(3, 5), ['tasks', 'harvest']);
  assert.deepEqual(parseRoute('#/rooms/7/harvest'), { name: 'detail', id: 7, tab: 'harvest' });
  assert.deepEqual(parseRoute('#/harvest'), { name: 'harvest', days: 30 });
  assert.deepEqual(parseRoute('#/harvest?days=90'), { name: 'harvest', days: 90 });
  assert.deepEqual(parseRoute('#/harvest?days=45'), { name: 'harvest', days: 30 });
  assert.deepEqual(parseRoute('#/harvest/sheet?days=7'), { name: 'sheet', days: 7 });
  assert.deepEqual(parseRoute('#/harvest/sheet'), { name: 'sheet', days: 30 });
  assert.equal(canonicalHash({ name: 'harvest', days: 30 }), HARVEST_HASH);
  assert.equal(canonicalHash({ name: 'harvest', days: 90 }), '#/harvest?days=90');
  assert.equal(sheetHash(7), '#/harvest/sheet?days=7');
  assert.equal(canonicalHash({ name: 'sheet', days: 30 }), '#/harvest/sheet?days=30');
  assert.equal(isCanonical('#/harvest?days=30'), false);
  assert.equal(isCanonical('#/harvest?days=365'), true);
});

// ---- Tasks as a grid (spec 2026-11-04-task-grid-design.md 2) ----

test("the Tasks tab keeps its week in the query: its Monday; this week has none; another tab's query is dropped", () => {
  assert.deepEqual(parseRoute('#/rooms/7/tasks?week=2026-11-02'), { name: 'detail', id: 7, tab: 'tasks', week: '2026-11-02' });
  assert.deepEqual(parseRoute('#/rooms/7/tasks?week=2026-11-04'), { name: 'detail', id: 7, tab: 'tasks', week: '2026-11-02' }, 'a Wednesday: its Monday');
  assert.deepEqual(parseRoute('#/rooms/7/tasks?week=2026-11-08'), { name: 'detail', id: 7, tab: 'tasks', week: '2026-11-02' }, 'a Sunday ends the week');
  assert.deepEqual(parseRoute('#/rooms/7/tasks?week=2027-01-01'), { name: 'detail', id: 7, tab: 'tasks', week: '2026-12-28' }, 'over the year');
  for (const bad of ['', '?week=', '?week=2026-02-30', '?week=2026-13-01', '?week=2026-00-10', '?week=soon', '?day=2026-11-04']) {
    assert.deepEqual(parseRoute(`#/rooms/7/tasks${bad}`), { name: 'detail', id: 7, tab: 'tasks' }, bad);
  }
  assert.deepEqual(parseRoute('#/rooms/7/history?week=2026-11-02'), { name: 'detail', id: 7, tab: 'history' });
  assert.equal(canonicalHash(parseRoute('#/rooms/7/tasks?week=2026-11-05')), '#/rooms/7/tasks?week=2026-11-02');
  assert.equal(canonicalHash(parseRoute('#/rooms/7/tasks?week=nope')), '#/rooms/7/tasks');
  assert.equal(canonicalHash(parseRoute('#/rooms/7/history?week=2026-11-02')), '#/rooms/7/history');
  assert.ok(isCanonical('#/rooms/7/tasks?week=2026-11-02'));
  assert.ok(!isCanonical('#/rooms/7/tasks?week=2026-11-03'));
  assert.equal(tasksHash(7), '#/rooms/7/tasks');
  assert.equal(tasksHash(7, '2026-11-02'), '#/rooms/7/tasks?week=2026-11-02');
});

test("the month sheet of a room's daily tasks keeps its month in the query; a bad or missing month is this month (no query)", () => {
  assert.deepEqual(parseRoute('#/rooms/7/tasks/sheet?month=2026-11'), { name: 'taskSheet', id: 7, month: '2026-11' });
  assert.deepEqual(parseRoute('#/rooms/7/tasks/sheet/?month=2027-01'), { name: 'taskSheet', id: 7, month: '2027-01' });
  for (const bad of ['', '?month=', '?month=2026-13', '?month=2026-00', '?month=2026-13-01', '?month=2026-02-30', '?month=2026-1', '?month=2026-11-04', '?month=soon', '?week=2026-11-02']) {
    assert.deepEqual(parseRoute(`#/rooms/7/tasks/sheet${bad}`), { name: 'taskSheet', id: 7, month: null }, bad);
  }
  assert.deepEqual(parseRoute('#/rooms/0/tasks/sheet?month=2026-11'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/rooms/7/history/sheet?month=2026-11'), { name: 'overview' }, 'only the Tasks tab has a sheet');
  assert.equal(taskSheetHash(7, '2026-11'), '#/rooms/7/tasks/sheet?month=2026-11');
  assert.equal(taskSheetHash(7), '#/rooms/7/tasks/sheet');
  assert.equal(canonicalHash(parseRoute('#/rooms/7/tasks/sheet/?month=2026-11')), '#/rooms/7/tasks/sheet?month=2026-11');
  assert.equal(canonicalHash(parseRoute('#/rooms/7/tasks/sheet?month=nope')), '#/rooms/7/tasks/sheet');
  assert.ok(isCanonical('#/rooms/7/tasks/sheet?month=2026-11'));
  assert.ok(!isCanonical('#/rooms/7/tasks/sheet?month=2026-11&x=1'));
});

test('the Batches pages: the list (one run\'s with ?run=), a batch, the myGAP 4-2 sheet with its dates', () => {
  assert.equal(BATCHES_HASH, '#/business/batches');
  assert.deepEqual(parseRoute('#/business/batches'), { name: 'batches', run: null });
  assert.deepEqual(parseRoute('#/business/batches?run=12'), { name: 'batches', run: 12 });
  assert.deepEqual(parseRoute('#/business/batches?run=x'), { name: 'batches', run: null });
  assert.equal(isCanonical('#/business/batches?run=x'), false);
  assert.equal(batchesRunHash(12), '#/business/batches?run=12');
  assert.deepEqual(parseRoute('#/business/batches/7'), { name: 'batch', id: 7 });
  assert.equal(batchHash(7), '#/business/batches/7');
  assert.deepEqual(parseRoute('#/business/batches/sheet?from=2026-08-08&to=2026-11-05'), { name: 'batchSheet', from: '2026-08-08', to: '2026-11-05' });
  assert.deepEqual(parseRoute('#/business/batches/sheet'), { name: 'batchSheet', from: null, to: null });
  assert.deepEqual(parseRoute('#/business/batches/sheet?from=2026-13-01&to=x'), { name: 'batchSheet', from: null, to: null });
  assert.equal(batchSheetHash('2026-08-08', '2026-11-05'), '#/business/batches/sheet?from=2026-08-08&to=2026-11-05');
  for (const h of ['#/business/batches', '#/business/batches?run=12', '#/business/batches/7', '#/business/batches/sheet?from=2026-08-08&to=2026-11-05']) {
    assert.equal(isCanonical(h), true, h);
  }
  assert.deepEqual(parseRoute('#/business/batches/0'), { name: 'overview' });
});

test('the Sales page (spec 2026-11-05-sales-design.md 6): #/business/sales with its period, 30 without one', () => {
  assert.equal(SALES_HASH, '#/business/sales');
  assert.deepEqual(parseRoute('#/business/sales'), { name: 'sales', days: 30 });
  assert.deepEqual(parseRoute('#/business/sales?days=90'), { name: 'sales', days: 90 });
  assert.deepEqual(parseRoute('#/business/sales?days=31'), { name: 'sales', days: 30 });
  assert.equal(isCanonical('#/business/sales'), true);
  assert.equal(isCanonical('#/business/sales?days=30'), false);
  assert.equal(isCanonical('#/business/sales?days=7'), true);
  assert.equal(isCanonical('#/business/sales/'), false);
  assert.equal(canonicalHash({ name: 'sales', days: 365 }), '#/business/sales?days=365');
});

// ---- Business (the integration, 2026-11-05): one top-bar entry, #/business (the Summary tab since 2026-11-06), and the strip of the six pages ----
test('#/business: the Summary tab\'s own route, canonical as it is, a trailing slash tidied', async () => {
  const { BUSINESS_HASH } = await import('../web/route.js');
  assert.equal(BUSINESS_HASH, '#/business');
  assert.deepEqual(parseRoute('#/business'), { name: 'summary' });
  assert.deepEqual(parseRoute('#/business/'), { name: 'summary' });
  assert.equal(isCanonical('#/business'), true);
  assert.equal(isCanonical('#/business/'), false);
  assert.equal(canonicalHash({ name: 'summary' }), '#/business');
  assert.deepEqual(parseRoute('#/business/nope'), { name: 'overview' }, 'an unknown business page is unknown, as elsewhere');
  assert.deepEqual(parseRoute('#/businesses'), { name: 'overview' });
});

test('the Business tabs: Summary, Batches, Inventory, Sales, Costs, Runs, each its page', async () => {
  const { BUSINESS_TABS, BUSINESS_HASH, INVENTORY_HASH, COSTS_HASH, RUNS_HASH } = await import('../web/route.js');
  assert.deepEqual(BUSINESS_TABS.map((t) => t.key), ['summary', 'batches', 'inventory', 'sales', 'costs', 'runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.label), ['Summary', 'Batches', 'Inventory', 'Sales', 'Costs', 'Runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.hash), [BUSINESS_HASH, BATCHES_HASH, INVENTORY_HASH, SALES_HASH, COSTS_HASH, RUNS_HASH]);
  for (const t of BUSINESS_TABS) assert.ok(isCanonical(t.hash), t.hash);
});

test('businessTabOf: every #/business page belongs to its tab (the top bar marks Business; the browser keeps the tab)', async () => {
  const { businessTabOf } = await import('../web/route.js');
  const cases = {
    '#/business/batches': 'batches', '#/business/batches?run=4': 'batches', '#/business/batches/7': 'batches',
    '#/business/batches/sheet?from=2026-08-08&to=2026-11-05': 'batches',
    '#/business/inventory': 'inventory', '#/business/inventory/3': 'inventory', '#/business/inventory/count': 'inventory',
    '#/business/inventory/sheet?days=90': 'inventory',
    '#/business/sales': 'sales', '#/business/sales?days=7': 'sales',
    '#/business/costs': 'costs', '#/business/costs?month=2026-10': 'costs',
    '#/business': 'summary', '#/harvest': null, '#/harvest/sheet?days=30': null, '#/rooms/7/harvest': null, '#/overview': null,
  };
  for (const [hash, tab] of Object.entries(cases)) assert.equal(businessTabOf(parseRoute(hash)), tab, hash);
  assert.equal(businessTabOf(null), null);
});

test('businessStrip: the strip shows on the six pages only (not a batch, an item, Count stock, or a sheet for print)', async () => {
  const { businessStrip } = await import('../web/route.js');
  const cases = {
    '#/business/batches': 'batches', '#/business/batches?run=4': 'batches', '#/business/inventory': 'inventory',
    '#/business/sales?days=90': 'sales', '#/business/costs?month=2026-10': 'costs',
    '#/business/batches/7': null, '#/business/batches/sheet': null, '#/business/inventory/3': null,
    '#/business/inventory/count': null, '#/business/inventory/sheet?days=30': null, '#/business': 'summary', '#/overview': null,
  };
  for (const [hash, tab] of Object.entries(cases)) assert.equal(businessStrip(parseRoute(hash)), tab, hash);
});

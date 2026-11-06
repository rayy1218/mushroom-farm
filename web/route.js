// Hash router: which page does a location hash mean? Anything unknown means the Overview.

import { CROP_KEYS } from './crops.js'; // ---- Runs ----

// The room page's tabs (redesign 2026-10-28: for the three jobs check, act and set up; Tasks 2026-10-30, spec
// 2026-10-30-tasks-design.md 7.1); the first has no name in the address (#/rooms/7), the others do (#/rooms/7/history).
export const ROOM_TABS = [
  { key: 'now', label: 'Now' },
  { key: 'history', label: 'History' },
  { key: 'crop', label: 'Crop' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'harvest', label: 'Harvest' },
  { key: 'simulations', label: 'Simulations' },
  { key: 'setup', label: 'Setup' },
];
// ---- Login ---- the room tabs only an owner has (spec 2026-11-06-login-design.md 6)
export const OWNER_TABS = ['simulations', 'setup'];
const NAMED_TABS = ROOM_TABS.slice(1).map((t) => t.key);
// The nine tabs before the redesign: an old address (a bookmark, a link) opens the tab that holds that part now.
const OLD_TABS = { overview: 'now', charts: 'history', energy: 'history', climate: 'setup', sensors: 'setup', profile: 'setup', equipment: 'setup' };
const tabOf = (tab) => OLD_TABS[tab] ?? tab;
const ID = '([1-9][0-9]{0,14})';

// The address of a room's page on a tab (an unknown tab: the Now tab).
export function roomHash(id, tab = 'now') {
  const t = tabOf(tab);
  return NAMED_TABS.includes(t) ? `#/rooms/${id}/${t}` : `#/rooms/${id}`;
}

// The address of a room's Suggest machines page (owner 2026-10-28: a page of its own, out of the Simulate dialog).
export const suggestHash = (id) => `#/rooms/${id}/suggest`;

// The farm's Today page (spec 2026-10-30-tasks-design.md 7.2): every room's tasks of the day.
export const TODAY_HASH = '#/today';

// The Calendar page's address: its room and day in the query, in one order.
// (a month or day out of range, 2026-13-01, is not one: Date.parse gives NaN, which toISOString would throw on)
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '') && Number.isFinite(Date.parse(`${s}T00:00:00Z`))
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export function calendarHash({ room = null, day = null } = {}) {
  const q = [room ? `room=${room}` : '', day ? `day=${day}` : ''].filter(Boolean).join('&');
  return q ? `#/calendar?${q}` : '#/calendar';
}
// The Calendar's query (spec 2026-11-03-calendar-design.md 5): a room id and a real date, else null.
export function parseCalendarQuery(query) {
  const p = new URLSearchParams(query ?? '');
  const room = /^[1-9][0-9]{0,14}$/.test(p.get('room') ?? '') ? Number(p.get('room')) : null;
  const day = isDate(p.get('day')) ? p.get('day') : null;
  return { room, day };
}

// The Tasks tab on a week (spec 2026-11-04-task-grid-design.md 2): its Monday in the query; this week (null) has none.
export const tasksHash = (id, week = null) => (week ? `#/rooms/${id}/tasks?week=${week}` : roomHash(id, 'tasks'));
// The month sheet of a room's daily tasks, for the pen ('YYYY-MM'); this month when none (the page puts it in the address).
export const taskSheetHash = (id, month = null) => (month ? `#/rooms/${id}/tasks/sheet?month=${month}` : `#/rooms/${id}/tasks/sheet`);
// A real month ('YYYY-MM') or null.
const monthOf = (s) => (/^\d{4}-\d{2}$/.test(s ?? '') && isDate(`${s}-01`) ? s : null);
// A week's Monday from any day of it ('YYYY-MM-DD'), or null for a date that is not one.
function mondayOf(s) {
  if (!isDate(s)) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return new Date(ms - ((new Date(ms).getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
}

// The Harvest page (spec 2026-11-04-harvest-design.md 7): its period in days in the query, 30 without one; the myGAP sheet
// under it keeps the period in its address always.
export const HARVEST_HASH = '#/harvest';
const HARVEST_DAYS = [7, 30, 90, 365];
const daysOf = (query) => {
  const n = Number(new URLSearchParams(query ?? '').get('days'));
  return HARVEST_DAYS.includes(n) ? n : 30;
};
export const sheetHash = (days) => `#/harvest/sheet?days=${days}`;
// ---- Costs ---- (spec 2026-11-05-costs-design.md 6): its month in the query; this month has none.
export const COSTS_HASH = '#/business/costs';
export const costsHash = (month = null) => (month ? `${COSTS_HASH}?month=${month}` : COSTS_HASH);

// ---- Batches ---- (spec 2026-11-05-batches-design.md 7): the page (?run= one run's batches), a batch, and the myGAP 4-2
// sheet with its dates in the query (the page puts the last 90 days there when they are missing or not dates).
export const BATCHES_HASH = '#/business/batches';
export const batchHash = (id) => `${BATCHES_HASH}/${id}`;
export const batchesRunHash = (runId) => `${BATCHES_HASH}?run=${runId}`;
export const batchSheetHash = (from, to) => `${BATCHES_HASH}/sheet?from=${from}&to=${to}`;
function parseBatches(hash) {
  const sheet = /^#\/business\/batches\/sheet\/?(?:\?(.*))?$/.exec(hash);
  if (sheet) {
    const p = new URLSearchParams(sheet[1] ?? '');
    const [from, to] = [p.get('from'), p.get('to')].map((d) => (isDate(d) ? d : null));
    return { name: 'batchSheet', from: from && to ? from : null, to: from && to ? to : null };
  }
  const one = new RegExp(`^#/business/batches/${ID}/?$`).exec(hash);
  if (one) return { name: 'batch', id: Number(one[1]) };
  const list = /^#\/business\/batches\/?(?:\?(.*))?$/.exec(hash);
  if (!list) return null;
  const run = new URLSearchParams(list[1] ?? '').get('run');
  return { name: 'batches', run: /^[1-9][0-9]{0,14}$/.test(run ?? '') ? Number(run) : null };
}
// ---- Inventory (spec 2026-11-05-inventory-design.md 5): the list, an item, Count stock and the myGAP 4-5 sheet with its
// period (30, 90 or 365 days; 30 without one). ----
export const INVENTORY_HASH = '#/business/inventory';
export const INVENTORY_COUNT_HASH = `${INVENTORY_HASH}/count`;
export const inventoryItemHash = (id) => `${INVENTORY_HASH}/${id}`;
const INVENTORY_SHEET_DAYS = [30, 90, 365];
export const inventorySheetHash = (days = 30) => `${INVENTORY_HASH}/sheet?days=${days}`;
// ---- Sales (spec 2026-11-05-sales-design.md 6): the business page, its period as Harvest's ----
export const SALES_HASH = '#/business/sales';
// ---- Runs ---- (spec 2026-11-05-runs-design.md 6): the Runs tab (?crop= one crop's runs) and a run's page.
export const RUNS_HASH = '#/business/runs';
export const runsHash = (crop = null) => (crop ? `${RUNS_HASH}?crop=${crop}` : RUNS_HASH);
export const runHash = (id) => `${RUNS_HASH}/${id}`;
function parseRuns(hash) {
  const one = new RegExp(`^#/business/runs/${ID}/?$`).exec(hash);
  if (one) return { name: 'run', id: Number(one[1]) };
  const list = /^#\/business\/runs\/?(?:\?(.*))?$/.exec(hash);
  if (!list) return null;
  const crop = new URLSearchParams(list[1] ?? '').get('crop');
  return { name: 'runs', crop: CROP_KEYS.includes(crop) ? crop : null };
}
// ---- end Runs ----

// ---- Business (the integration, 2026-11-05; DESIGN.md "Business") ----: the top bar's one Business entry opens #/business,
// the Summary tab (spec 2026-11-06-business-summary-design.md 2: always, no memory of the last tab); the six pages share a
// strip of tabs, as a room's page does. businessTabOf(route): the tab a page belongs to (the top bar marks Business on every
// one of them); businessStrip(route): the tab whose strip shows: only the six pages themselves (a batch, an item, Count stock
// and a run keep their back link; a sheet for print has no strip).
export const BUSINESS_HASH = '#/business';
export const BUSINESS_TABS = [
  { key: 'summary', label: 'Summary', hash: BUSINESS_HASH }, // ---- Summary ----
  { key: 'batches', label: 'Batches', hash: BATCHES_HASH },
  { key: 'inventory', label: 'Inventory', hash: INVENTORY_HASH },
  { key: 'sales', label: 'Sales', hash: SALES_HASH },
  { key: 'costs', label: 'Costs', hash: COSTS_HASH },
  { key: 'runs', label: 'Runs', hash: RUNS_HASH }, // ---- Runs ----
];
const BUSINESS_PAGES = new Map([
  ['summary', 'summary'], // ---- Summary ----
  ['batches', 'batches'], ['batch', 'batches'], ['batchSheet', 'batches'],
  ['inventory', 'inventory'], ['inventoryItem', 'inventory'], ['inventoryCount', 'inventory'], ['inventorySheet', 'inventory'],
  ['sales', 'sales'], ['costs', 'costs'],
  ['runs', 'runs'], ['run', 'runs'], // ---- Runs ----
]);
export const businessTabOf = (route) => BUSINESS_PAGES.get(route?.name) ?? null;
export const businessStrip = (route) => (BUSINESS_TABS.some((t) => t.key === route?.name) ? route.name : null);

// ---- Login ---- the pages a worker may open: null when route is one, else the address to show instead (Today; a room's
// owner tab: its Now tab).
const WORKER_PAGES = new Set(['today', 'calendar', 'overview', 'detail', 'harvest', 'inventory', 'inventoryItem', 'inventoryCount']);
export function workerHash(route) {
  if (!WORKER_PAGES.has(route?.name)) return '#/today';
  if (route.name === 'detail' && OWNER_TABS.includes(route.tab)) return roomHash(route.id, 'now');
  return null;
}

export function parseRoute(hash) {
  const run = new RegExp(`^#/rooms/${ID}/simulations/${ID}/?$`).exec(hash ?? '');
  if (run) return { name: 'simulation', id: Number(run[1]), runId: Number(run[2]) };
  const suggest = new RegExp(`^#/rooms/${ID}/suggest/?$`).exec(hash ?? '');
  if (suggest) return { name: 'suggest', id: Number(suggest[1]) };
  const taskSheet = new RegExp(`^#/rooms/${ID}/tasks/sheet/?(?:\\?(.*))?$`).exec(hash ?? '');
  if (taskSheet) return { name: 'taskSheet', id: Number(taskSheet[1]), month: monthOf(new URLSearchParams(taskSheet[2] ?? '').get('month')) };
  const m = new RegExp(`^#/rooms/${ID}(?:/([a-z]+))?/?(?:\\?(.*))?$`).exec(hash ?? '');
  const tab = m && m[2] !== undefined ? tabOf(m[2]) : 'now';
  if (m && (tab === 'now' || NAMED_TABS.includes(tab)) && m[2] !== 'now') {
    // the Tasks tab's week (any day of it: its Monday); another tab's query is dropped
    const week = tab === 'tasks' ? mondayOf(new URLSearchParams(m[3] ?? '').get('week')) : null;
    return week ? { name: 'detail', id: Number(m[1]), tab, week } : { name: 'detail', id: Number(m[1]), tab };
  }
  if (/^#\/today\/?$/.test(hash ?? '')) return { name: 'today' };
  if (/^#\/business\/?$/.test(hash ?? '')) return { name: 'summary' }; // ---- Summary ----
  // The Calendar (spec 2026-11-03-calendar-design.md 5): its room and day in the query.
  const calendar = /^#\/calendar\/?(?:\?(.*))?$/.exec(hash ?? '');
  if (calendar) return { name: 'calendar', ...parseCalendarQuery(calendar[1]) };
  const sales = /^#\/business\/sales\/?(?:\?(.*))?$/.exec(hash ?? '');
  if (sales) return { name: 'sales', days: daysOf(sales[1]) };
  const sheet = /^#\/harvest\/sheet\/?(?:\?(.*))?$/.exec(hash ?? '');
  if (sheet) return { name: 'sheet', days: daysOf(sheet[1]) };
  const harvest = /^#\/harvest\/?(?:\?(.*))?$/.exec(hash ?? '');
  if (harvest) return { name: 'harvest', days: daysOf(harvest[1]) };
  const batches = parseBatches(hash ?? '');
  if (batches) return batches;
  // ---- Inventory ----
  const inventory = /^#\/business\/inventory(?:\/(count|sheet|[1-9][0-9]{0,14}))?\/?(?:\?(.*))?$/.exec(hash ?? '');
  if (inventory) {
    if (inventory[1] === 'count') return { name: 'inventoryCount' };
    if (inventory[1] === 'sheet') {
      const n = Number(new URLSearchParams(inventory[2] ?? '').get('days'));
      return { name: 'inventorySheet', days: INVENTORY_SHEET_DAYS.includes(n) ? n : 30 };
    }
    return inventory[1] ? { name: 'inventoryItem', id: Number(inventory[1]) } : { name: 'inventory' };
  }
  // #/rooms (the Rooms list until 2026-10-28) is the Overview now: it holds every room and Add room.
  const costs = /^#\/business\/costs\/?(?:\?(.*))?$/.exec(hash ?? ''); // ---- Costs ----
  if (costs) return { name: 'costs', month: monthOf(new URLSearchParams(costs[1] ?? '').get('month')) };
  const runs = parseRuns(hash ?? ''); // ---- Runs ----
  if (runs) return runs;
  if (/^#\/settings\/?$/.test(hash ?? '')) return { name: 'settings' };
  return { name: 'overview' };
}

// The one address of a route (an address that is not it is tidied to it).
export function canonicalHash(route) {
  if (route.name === 'simulation') return `#/rooms/${route.id}/simulations/${route.runId}`;
  if (route.name === 'suggest') return suggestHash(route.id);
  if (route.name === 'taskSheet') return taskSheetHash(route.id, route.month);
  if (route.name === 'detail') return route.tab === 'tasks' ? tasksHash(route.id, route.week) : roomHash(route.id, route.tab);
  if (route.name === 'today') return TODAY_HASH;
  if (route.name === 'summary') return BUSINESS_HASH; // ---- Summary ----
  if (route.name === 'calendar') return calendarHash(route);
  if (route.name === 'sales') return route.days === 30 ? SALES_HASH : `${SALES_HASH}?days=${route.days}`;
  if (route.name === 'harvest') return route.days === 30 ? HARVEST_HASH : `${HARVEST_HASH}?days=${route.days}`;
  if (route.name === 'sheet') return sheetHash(route.days);
  if (route.name === 'batches') return route.run ? batchesRunHash(route.run) : BATCHES_HASH;
  if (route.name === 'batch') return batchHash(route.id);
  if (route.name === 'batchSheet') return route.from && route.to ? batchSheetHash(route.from, route.to) : `${BATCHES_HASH}/sheet`;
  if (route.name === 'inventory') return INVENTORY_HASH; // ---- Inventory ----
  if (route.name === 'inventoryItem') return inventoryItemHash(route.id);
  if (route.name === 'inventoryCount') return INVENTORY_COUNT_HASH;
  if (route.name === 'inventorySheet') return inventorySheetHash(route.days);
  if (route.name === 'costs') return costsHash(route.month); // ---- Costs ----
  if (route.name === 'runs') return runsHash(route.crop); // ---- Runs ----
  if (route.name === 'run') return runHash(route.id);
  return route.name === 'settings' ? '#/settings' : '#/overview';
}

export function isCanonical(hash) {
  return hash === canonicalHash(parseRoute(hash));
}

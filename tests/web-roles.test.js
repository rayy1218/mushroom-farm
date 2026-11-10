// What a worker's pages leave out (spec 2026-11-06-login-design.md 6): the owner's buttons marked data-owner-only, the
// picker gone, the signed-in name for every "who did it".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { workerMay } from '../server/roles.js';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');

test('the owner-only parts are marked', () => {
  const html = src('index.html');
  assert.match(html, /data-nav="settings"[^>]*data-owner-only|data-owner-only[^>]*data-nav="settings"/);
  assert.ok(html.includes('data-signout'));
  assert.ok(src('crop-card.js').includes("editBtn.dataset.ownerOnly = ''"));
  assert.ok(src('tasks-card.js').includes("add.dataset.ownerOnly = ''") && src('tasks-card.js').includes("csvLine.dataset.ownerOnly = ''"));
  assert.ok(src('task-list.js').includes("b.dataset.ownerOnly = ''"));
  assert.ok(src('harvest-card.js').includes("edit.dataset.ownerOnly = ''"));
  for (const attr of ['data-purchase', 'data-add', 'data-sheet']) assert.match(src('inventory-page.js'), new RegExp(`${attr}[^>]*data-owner-only`), attr);
  for (const attr of ['data-purchase', 'data-edit', 'data-archive']) assert.match(src('inventory-item.js'), new RegExp(`${attr}[^>]*data-owner-only`), attr);
  assert.match(src('harvest-page.js'), /data-csv[^>]*data-owner-only/);
  assert.match(src('harvest-page.js'), /data-sheet[^>]*data-owner-only/);
  // a worker reads a room's alarms and filter changes, but Acknowledge and Filter changed are the owner's
  assert.ok(src('alarms.js').includes("b.dataset.ownerOnly = ''") && src('alarms.js').includes("ackAll.dataset.ownerOnly = ''"));
  assert.ok(src('overview.js').includes("ack.dataset.ownerOnly = ''"));
  assert.ok(src('filter-card.js').includes("changed.dataset.ownerOnly = ''"));
  // Add room and the way to the crops' editor (a live look as a worker)
  assert.match(src('overview.js'), /data-add data-owner-only>Add room</);
  assert.ok(src('harvest-card.js').includes("giveCrops.dataset.ownerOnly = ''"));
  // the run's page (a Business page) is linked for an owner only
  assert.ok(src('harvest-card.js').includes('...(isOwner() ? [DOT, runPageLink(run, getRoom()?.name)] : [])'));
});

test('"Doing the rounds as" is gone: who did it is the signed-in name', () => {
  assert.ok(!src('task-dialogs.js').includes('createWorkerPicker'));
  assert.ok(!src('today-page.js').includes('createWorkerPicker'));
  assert.ok(!src('tasks-card.js').includes('createWorkerPicker'));
  assert.ok(!src('task-dialogs.js').includes("'farm.worker'"));
  assert.ok(src('task-dialogs.js').includes('me()?.name'));
});

test("a worker's pages ask only for what they may read (no 403 on the room page, Today or the Overview)", () => {
  const room = src('room-detail.js');
  assert.ok(room.includes("isOwner() ? request('GET', `/api/rooms/${id}/control`).catch(() => null) : null,"), 'the control settings');
  assert.ok(room.includes('if (isOwner()) simulationsCard ??= createSimulationsCard('), 'the Simulations card');
  assert.ok(src('today-page.js').includes('const stopBatches = isOwner() ? todayWaiting(container) : () => {};'), 'Blocks waiting');
  assert.ok(src('overview.js').includes('const wantUsage = isOwner() && Date.now() - usageAt >= USAGE_REFRESH_MS;'), "the farm's usage");
});

test('Sign out looks like the other top links; the picker\'s rules are gone', () => {
  const css = src('styles.css');
  assert.ok(css.includes('.top-signout { border: 0; background: none; transition: none; }'));
  assert.ok(!/\.tk-as\b|\.td-picker\b/.test(css));
});

// ---- the sweep (Task 9 review), fail closed: every '/api/…' route in every module a worker's pages load is one the server
// lets a worker use (server/roles.js), or it sits behind a guard a worker never passes (an owner-only control, an isOwner()
// check, a page a worker is sent away from), named here and found in the source. A route whose method cannot be read off its
// line counts as every method; a call with no route on its line must be one of the wrappers named here.

const server = (name) => readFileSync(new URL(`../server/${name}`, import.meta.url), 'utf8');
const METHODS = ['GET', 'POST', 'PUT', 'DELETE'];

const PAGES_OF_A_WORKER = ['route.js', "const WORKER_PAGES = new Set(['today', 'calendar', 'overview', 'detail', 'harvest', 'inventory', 'inventoryItem', 'inventoryCount']);"];
const NO_SETUP_TAB = ['route.js', "export const OWNER_TABS = ['simulations', 'setup'];"];
const NO_CONTROL = ['room-detail.js', "isOwner() ? request('GET', `/api/rooms/${id}/control`).catch(() => null) : null,"]; // no Auto/Manual, no switches
const SIGN_IN = (path) => ['../server/auth-api.js', `if (path === '${path}') {`]; // served before the gate, to anyone

// The worker's pages and the page's entry; every module they import (static or import()) is swept, but for these.
const WORKER_ENTRIES = ['today-page.js', 'calendar-page.js', 'overview.js', 'room-detail.js', 'harvest-page.js', 'inventory-page.js',
  'inventory-item.js', 'inventory-count.js', 'app.js', 'boot.js'];
// Modules only an owner reaches, not followed: [module, why, { importer: guard }] (each import of it by a swept module must be
// listed with the guard that keeps a worker out).
const OWNER_PAGE = { 'app.js': PAGES_OF_A_WORKER };
const OWNER_ONLY = [
  ['settings-page.js', 'Settings', OWNER_PAGE], ['simulation-page.js', 'a simulation run', OWNER_PAGE],
  ['suggest-page.js', 'Suggest machines', OWNER_PAGE], ['sales-page.js', 'Sales', OWNER_PAGE], ['costs-page.js', 'Costs', OWNER_PAGE],
  ['runs-page.js', 'Runs and a run', OWNER_PAGE], ['business-page.js', 'the Business summary', OWNER_PAGE],
  ['batches-sheet.js', "Batches' myGAP sheet", OWNER_PAGE], ['task-sheet.js', "a room's month sheet", OWNER_PAGE],
  ['inventory-sheet.js', "Inventory's myGAP sheet", OWNER_PAGE],
  ['batches-page.js', 'Batches; on Today its Blocks waiting card, made for an owner only',
    { 'app.js': PAGES_OF_A_WORKER, 'today-page.js': ['today-page.js', 'const stopBatches = isOwner() ? todayWaiting(container) : () => {};'] }],
  ['sim-card.js', 'the Simulations tab', { 'room-detail.js': ['room-detail.js', 'if (isOwner()) simulationsCard ??= createSimulationsCard('] }],
  ['simulate-dialog.js', 'opened from the Simulations card and Suggest machines; the room page only closes it',
    { 'room-detail.js': ['room-detail.js', "import { closeSimulateDialog } from './simulate-dialog.js';"] }],
  ['room-edit.js', 'the Setup tab (its forms and Delete room)', { 'room-detail.js': NO_SETUP_TAB }],
  ['equipment.js', 'the Setup tab', { 'room-detail.js': NO_SETUP_TAB }],
  ['room-dialog.js', 'Add room', { 'overview.js': ['overview.js', '<button type="button" data-add data-owner-only>Add room</button>'] }],
];

// The calls whose route is passed in: their own lines carry none (exact text). crop-card's send() PUTs the crop (the one
// route in it), so a call to it needs none either.
const WRAPPERS = {
  'api.js': ['export async function request(method, path, body, timeout = 10000) {', 'res = await fetch(path, init);'],
  'crop-card.js': ['async function send(body, fields, after) {'],
  'harvest-card.js': ['async function send(method, path, body) {', 'await request(method, path, body, COMMAND_TIMEOUT);'],
  'inventory-dialogs.js': ['async function send(method, path, body) {', 'const reply = await request(method, path, body, COMMAND_TIMEOUT);'],
  'task-dialogs.js': ['async function send(path, body, form = null) {', "const row = await request('POST', path, body, COMMAND_TIMEOUT);"],
};
const FIXED_ROUTE_SEND = new Set(['crop-card.js']);

// [module, method ('?': not read off the line), path, ...[guard file, guard text]]
const EXCEPTIONS = [
  ['api.js', '?', '/api/session', ['api.js', "if (res.status === 401 && path !== '/api/session' && !path.startsWith('/api/login')) {"]], // compared, not asked
  ['api.js', '?', '/api/login', ['api.js', "if (res.status === 401 && path !== '/api/session' && !path.startsWith('/api/login')) {"]],
  ['boot.js', 'GET', '/api/session', SIGN_IN('/api/session')],
  ['login.js', 'GET', '/api/login/names', SIGN_IN('/api/login/names')],
  ['login.js', 'POST', '/api/login', SIGN_IN('/api/login')],
  ['app.js', 'POST', '/api/logout', SIGN_IN('/api/logout')],
  ['live.js', '?', '/api/events', ['live.js', "url = '/api/events'"], ['live.js', 'new Source(url)']], // the stream: a GET a worker may
  ['inventory-page.js', '?', '/api/inventory', ['inventory-page.js', "request('GET', archived ? '/api/inventory?archived=1' : '/api/inventory')"]],
  ['batches-math.js', '?', '/api/batches.csv', ['batches-page.js', 'csvHref(n, farmDate(Date.now()))']], // Batches' link (and below)
  ['crop-card.js', 'PUT', '/api/rooms/1/crop', ['crop-card.js', "editBtn.dataset.ownerOnly = ''"], ['crop-card.js', "pencil.dataset.ownerOnly = ''"],
    ['crop-card.js', "start.dataset.ownerOnly = ''"], ['crop-card.js', "editSave.dataset.ownerOnly = ''"], ['crop-card.js', "for (const node of [rampField, lightField, autoField, programSave]) node.dataset.ownerOnly = '';"],
    ['crop-card.js', "if (!editing && isOwner()) openEditor();"]],
  ['crop-card.js', 'PUT', '/api/rooms/1/control', ['crop-card.js', "backBtn.dataset.ownerOnly = ''"]],
  ['harvest-card.js', 'GET', '/api/batches', ['harvest-card.js', 'isOwner() ? readBlocks(data.current) : null']],
  ['harvest-card.js', 'GET', '/api/costs/summary', ['harvest-card.js', 'isOwner() ? readProfit(data.current) : null']],
  ['harvest-card.js', 'PUT', '/api/harvests/1', ['harvest-card.js', "edit.dataset.ownerOnly = ''"]], // Edit, and Delete in its dialog
  ['harvest-card.js', 'DELETE', '/api/harvests/1', ['harvest-card.js', "edit.dataset.ownerOnly = ''"]],
  ['inventory-done.js', 'DELETE', '/api/inventory/moves/1', ['inventory-done.js', 'const moves = isOwner() ? result.moves : null;']], // Undo
  ['inventory-dialogs.js', '?', '/api/inventory/items/1', ['inventory-item.js', '<button type="button" data-edit data-owner-only>']], // Edit item
  ['inventory-dialogs.js', '?', '/api/inventory/items', ['inventory-page.js', '<button type="button" data-add data-owner-only>'],
    ['inventory-page.js', 'data-add-empty data-owner-only']], // Add item
  ['inventory-dialogs.js', 'DELETE', '/api/inventory/items/1', ['inventory-item.js', '<button type="button" data-edit data-owner-only>']], // from Edit
  ['inventory-dialogs.js', 'PUT', '/api/inventory/items/1', ['inventory-item.js', '<button type="button" data-archive data-owner-only>']], // Archive, Bring back
  ['inventory-dialogs.js', 'POST', '/api/inventory/purchases', ['inventory-item.js', '<button type="button" data-purchase data-owner-only>'],
    ['inventory-page.js', '<button type="button" data-purchase disabled data-owner-only>']],
  ['inventory-dialogs.js', 'PUT', '/api/inventory/moves/1', ['inventory-item.js', "b.dataset.ownerOnly = ''; // ---- Login ---- a move is changed by the owner"]],
  ['inventory-dialogs.js', 'DELETE', '/api/inventory/moves/1', ['inventory-item.js', "b.dataset.ownerOnly = ''; // ---- Login ---- a move is changed by the owner"]],
  ['inventory-dialogs.js', 'POST', '/api/inventory/lots/1/throw-out', ['inventory-item.js', "action.dataset.ownerOnly = ''"]],
  ['task-dialogs.js', 'POST', '/api/tasks/1/cancel', ['task-list.js', "b.dataset.ownerOnly = ''"]], // a long-term task's Cancel
  ['task-dialogs.js', 'POST', '/api/rooms/1/tasks', ['tasks-card.js', "add.dataset.ownerOnly = ''"], PAGES_OF_A_WORKER], // Add; Plan this (Suggest page)
  ['task-dialogs.js', 'PUT', '/api/rooms/1', ['task-dialogs.js', 'const update = isOwner() ? setupUpdate(row.source, room) : null;']],
  ['tasks-card.js', 'GET', '/api/rooms/1/tasks/log.csv', ['tasks-card.js', "csvLine.dataset.ownerOnly = ''"]],
  ['room-detail.js', 'GET', '/api/rooms/1/control', NO_CONTROL],
  ['usage.js', 'GET', '/api/rooms/1/usage', ['room-detail.js', 'if (isOwner()) usageCard = createUsageCard(']], // the Overview: its tiles only
  ['overview.js', 'GET', '/api/usage', ['overview.js', 'const wantUsage = isOwner() && Date.now() - usageAt >= USAGE_REFRESH_MS;']],
  ['overview.js', 'POST', '/api/alarms/1/ack', ['overview.js', "ack.dataset.ownerOnly = ''"]],
  ['alarms.js', 'POST', '/api/alarms/1/ack', ['alarms.js', "b.dataset.ownerOnly = ''"]],
  ['alarms.js', 'POST', '/api/rooms/1/alarms/ack', ['alarms.js', "ackAll.dataset.ownerOnly = ''"]],
  ['filter-card.js', 'POST', '/api/rooms/1/filter/changed', ['filter-card.js', "changed.dataset.ownerOnly = ''"],
    ['room-detail.js', "if (isOwner()) { // ---- Login ---- the Intake filter card is the Setup tab's"]], // and the card is the Setup tab's
  ['harvest-page.js', 'GET', '/api/harvest.csv', ['harvest-page.js', 'data-csv download data-owner-only']],
  ['harvest-page.js', 'GET', '/api/sales/range', PAGES_OF_A_WORKER], // the myGAP sheet
  ['machines.js', 'PUT', '/api/rooms/1/machines/1', NO_CONTROL], ['machines.js', 'PUT', '/api/rooms/1/machines/ac', NO_CONTROL],
  ['control.js', 'PUT', '/api/rooms/1/control', NO_CONTROL],
];

const importsOf = (file, read = src) => [...read(file).matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"]\.\/([\w.-]+\.js)['"]/g)].map((m) => m[1]);

// → { swept: [modules], edges: [[importer, owner-only module]] }
function workerModules(read = src) {
  const skip = new Set(OWNER_ONLY.map(([f]) => f));
  const swept = new Set();
  const edges = [];
  const todo = [...WORKER_ENTRIES];
  while (todo.length) {
    const f = todo.pop();
    if (swept.has(f)) continue;
    swept.add(f);
    for (const g of importsOf(f, read)) (skip.has(g) ? edges.push([f, g]) : todo.push(g));
  }
  return { swept: [...swept].sort(), edges };
}

// A module's lines, read for routes and calls: → { routes: [{ method, path, line }], bare: [lines with a call and no route] }.
// A comment line is skipped and a trailing ' // …' cut. A route's method: the call it is in (request('PUT', …), send('PUT', …),
// task-dialogs' send(`/api/…`) posts, new EventSource( GETs); a link (.href = …) GETs; anything else is '?'.
function linesOf(file, read = src) {
  const routes = [];
  const bare = [];
  for (const raw of read(file).split('\n')) {
    const line = /^\s*(\/\/|\*|\/\*)/.test(raw) ? '' : raw.replace(/\s\/\/\s.*$/, '');
    const calls = [...line.matchAll(/(?<![\w.$])(request|send|fetch)\(|\bnew EventSource\(/g)];
    const found = [...line.matchAll(/['`](\/api\/[^'`]*)['`]/g)];
    if (calls.length && !found.length) bare.push(line.trim());
    for (const r of found) {
      const call = calls.filter((c) => c.index < r.index).pop();
      let method = '?';
      if (!call) {
        if (/(\.href\s*=\s*|\bhref=)$/.test(line.slice(0, r.index))) method = 'GET';
      } else if (call[0].includes('EventSource')) {
        method = 'GET';
      } else if (call[1] !== 'fetch') {
        const between = line.slice(call.index + call[0].length, r.index);
        const named = /^\s*'(GET|POST|PUT|DELETE)'\s*,\s*$/.exec(between);
        if (named) method = named[1];
        else if (call[1] === 'send' && file === 'task-dialogs.js' && /^\s*$/.test(between)) method = 'POST';
      }
      routes.push({ method, path: r[1].replace(/\$\{[^}]*\}/g, '1').replace(/\?.*$/, ''), line: line.trim() });
    }
  }
  return { routes, bare };
}

const workerUses = (method, path) => (method === '?' ? METHODS.every((m) => workerMay(m, path)) : workerMay(method, path));

// → the misses: a route not a worker's with no exception, a call with no route that is not a named wrapper
function sweep(read = src) {
  const missed = [];
  for (const file of workerModules(read).swept) {
    const { routes, bare } = linesOf(file, read);
    for (const { method, path, line } of routes) {
      if (workerUses(method, path)) continue;
      if (!EXCEPTIONS.some(([f, m, p]) => f === file && m === method && p === path)) missed.push(`${file}: ${method} ${path} (${line})`);
    }
    for (const line of bare) {
      if ((WRAPPERS[file] ?? []).includes(line)) continue;
      if (FIXED_ROUTE_SEND.has(file) && [...line.matchAll(/(?<![\w.$])(request|send|fetch)\(/g)].every((c) => c[1] === 'send')) continue;
      missed.push(`${file}: a call with no route (${line})`);
    }
  }
  return missed;
}

test("the sweep: a worker's pages name only routes a worker may use, or each sits behind its guard (fail closed)", () => {
  assert.deepEqual(sweep(), [], 'a route a worker may not use, or a call whose route is not on its line, with no guard named here');
  const guard = ([file, text], what) => assert.ok((file.startsWith('../server/') ? server(file.slice(10)) : src(file)).includes(text), `${what}: ${file} has ${text}`);
  for (const [file, method, path, ...guards] of EXCEPTIONS) {
    assert.ok(linesOf(file).routes.some((r) => r.method === method && r.path === path), `${file}: ${method} ${path} is still there`);
    for (const g of guards) guard(g, `${file}: ${method} ${path}`);
  }
  for (const [file, lines] of Object.entries(WRAPPERS)) for (const line of lines) assert.ok(linesOf(file).bare.includes(line), `${file}: ${line}`);
  // csvHref (batches-math.js) is the Batches page's alone
  const { swept, edges } = workerModules();
  for (const file of swept.filter((f) => f !== 'batches-math.js')) assert.ok(!/\bcsvHref\b/.test(src(file)), `${file} uses csvHref`);
  // an owner-only module is imported by a swept one only where its guard is
  for (const [importer, module] of edges) {
    const entry = OWNER_ONLY.find(([f]) => f === module);
    assert.ok(entry[2][importer], `${importer} imports ${module} (${entry[1]}) with no guard named`);
    guard(entry[2][importer], `${importer} → ${module}`);
  }
  assert.ok(swept.includes('crop-card.js') && swept.includes('inventory-dialogs.js') && swept.includes('task-grid.js') && swept.length > 50, 'the closure');
});

test('no route is asked for but through api.js and live.js; none is written in double quotes', () => {
  for (const file of readdirSync(new URL('../web/', import.meta.url)).filter((f) => f.endsWith('.js'))) {
    const text = src(file);
    if (!['api.js', 'live.js'].includes(file)) assert.ok(!/\bfetch\(|EventSource\(/.test(text), `${file}: fetch or EventSource`);
    assert.ok(!text.includes('"/api/'), `${file}: "/api/ in double quotes`);
  }
});

// ---- Login polish (audit 2026-11-10) ----

test("a worker's \"Who did it\" is their name in words, not a list of one; an owner's is the list, theirs picked", async (t) => {
  const { setMe } = await import('../web/session.js');
  const { workerField } = await import('../web/task-dialogs.js');
  t.after(() => setMe(null));
  setMe({ id: 2, name: 'Ali', role: 'worker' });
  assert.deepEqual(workerField(['Ali'], 'Who picked it'), { name: 'worker', label: 'Who picked it', kind: 'fixed', value: 'Ali' });
  setMe({ id: 1, name: 'Ray', role: 'owner' });
  const owner = workerField(['Ali', 'Ray'], 'Who picked it');
  assert.equal(owner.kind, 'select');
  assert.equal(owner.value, 'Ray');
  // the dialog shows a fixed value as words with a hidden input (sent as it is), and puts the cursor in the first real box
  const dialogs = src('task-dialogs.js');
  assert.ok(dialogs.includes("if (f.kind === 'fixed') {") && dialogs.includes("input.type = 'hidden';"));
  assert.ok(dialogs.includes("([...inputs.values()].find((i) => i.type !== 'hidden') ?? heading).focus();"));
  // Count stock: a worker's "Who counted" is their name in words too
  const count = src('inventory-count.js');
  assert.ok(count.includes("el('span', 'tk-fixed-label', 'Who counted')") && count.includes("els.worker.after(el('p', 'tk-fixed-value', getWorker() ?? ''));"));
});

test("a worker's pages have no dead ends to the owner's pages", () => {
  // the room's Nothing wired yet card: no Set up the equipment, and who wires it said
  const room = src('room-detail.js');
  assert.match(room, /data-bare-setup data-owner-only>Set up the equipment</);
  assert.ok(room.includes("const BARE_WORKER = \"The owner wires this room's sensors and machines.\";"));
  assert.ok(room.includes("if (!isOwner()) container.querySelector('[data-bare-text]').textContent = BARE_WORKER;"));
  // the Overview's Set up the room and set one on Settings: the owner's links; a worker's words
  const overview = src('overview.js');
  assert.ok(overview.includes("} else line.append('The owner wires them.');"));
  assert.ok(overview.includes("} else p.append('the owner sets one on Settings.');"));
  assert.ok(overview.indexOf("if (isOwner()) {\n          const setup = node('a', '', 'Set up the room');") > 0);
  assert.ok(overview.indexOf("if (isOwner()) {\n        const link = node('a', '', 'set one on Settings');") > 0);
  // an item's Batches links (its notes, a batch's lot and history line): words for a worker
  const item = src('inventory-item.js');
  assert.ok(item.includes('const mayOpen = (href) => isOwner() || !workerHash(parseRoute(href));'));
  assert.ok(item.includes('if (!href || !mayOpen(href)) return document.createTextNode(text);'));
  assert.ok(item.includes("a.replaceWith(linkOr(a.textContent, BATCHES_HASH))"));
  // Count stock with no names: the owner's link to Settings; a worker's words
  assert.ok(src('inventory-count.js').includes(`} else p.append("No names yet: the owner adds the workers' names in Settings first.");`));
  // the room's Crop card with no crop: a worker does not start one
  assert.ok(src('room-card.js').includes("isOwner() ? 'No crop set. Add one on the Crop tab.' : 'No crop set: the owner starts one on the Crop tab.'"));
  assert.ok(src('styles.css').includes('html[data-role="worker"] .now-bare p { margin-bottom: 0; }'));
  // Harvest's sub-line: no value or energy for a worker
  const harvest = src('harvest-page.js');
  assert.ok(harvest.includes("const WORKER_SUB = 'What the rooms picked, by room and crop.';"));
  assert.ok(harvest.includes("if (!isOwner()) container.querySelector('[data-page-sub]').textContent = WORKER_SUB;"));
});

test("a worker's Inventory link has a box for its icon; the links wait (hidden, keeping their room) until app.js applied the role", () => {
  const app = src('app.js');
  assert.ok(app.includes("a.querySelector('svg').innerHTML = INVENTORY_ICON;"));
  assert.ok(src('index.html').includes('<html lang="en" data-booting>'));
  assert.ok(src('styles.css').includes('html[data-booting] .top-link { visibility: hidden; }'));
  assert.ok(src('boot.js').includes("root.dataset.booting = '';"));
  assert.ok(app.indexOf('delete document.documentElement.dataset.booting;') > app.indexOf("a.querySelector('svg').innerHTML = INVENTORY_ICON;"));
});

// What a worker's pages leave out (spec 2026-11-06-login-design.md 6): the owner's buttons marked data-owner-only, the
// picker gone, the signed-in name for every "who did it".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

// ---- the sweep (Task 9 review): every route a worker's pages name is one the server lets a worker use (server/roles.js),
// or it sits behind a guard a worker never passes: an owner-only control, an isOwner() check or a page a worker is sent
// away from. Each such exception names its guard, and the guard must be in the source.

// the modules a worker's pages load
const WORKER_MODULES = ['crop-card', 'harvest-card', 'inventory-item', 'inventory-done', 'inventory-page', 'inventory-dialogs',
  'inventory-count', 'task-dialogs', 'task-list', 'task-grid', 'tasks-card', 'today-page', 'room-detail', 'overview', 'alarms',
  'filter-card', 'calendar-page', 'harvest-page', 'machines', 'control'];

// Every '/api/…' in a module, with the method of the call it is on: request('PUT', …) or send('PUT', …); task-dialogs'
// send(path, …) posts; a link (no call on the line) is a GET. Ids become 1 and the query goes.
function routesOf(file) {
  const out = [];
  src(`${file}.js`).split('\n').forEach((line) => {
    for (const m of line.matchAll(/['`](\/api\/[^'`]*)['`]/g)) {
      const call = [...line.slice(0, m.index).matchAll(/\b(request|send)\(\s*(?:'(GET|POST|PUT|DELETE)')?/g)].pop();
      const method = call ? (call[2] ?? (call[1] === 'send' && !/send\(\s*\w+ \?/.test(line) ? 'POST' : '?')) : 'GET';
      out.push({ method, path: m[1].replace(/\$\{[^}]*\}/g, '1').replace(/\?.*$/, '') });
    }
  });
  return out;
}

const PAGES_OF_A_WORKER = ['route.js', "const WORKER_PAGES = new Set(['today', 'calendar', 'overview', 'detail', 'harvest', 'inventory', 'inventoryItem', 'inventoryCount']);"];
const NO_CONTROL = ['room-detail.js', "isOwner() ? request('GET', `/api/rooms/${id}/control`).catch(() => null) : null,"]; // no Auto/Manual, no switches
// [file, method, path, ...[guard file, guard text]]
const EXCEPTIONS = [
  ['crop-card', 'PUT', '/api/rooms/1/crop', ['crop-card.js', "editBtn.dataset.ownerOnly = ''"], ['crop-card.js', "pencil.dataset.ownerOnly = ''"],
    ['crop-card.js', "start.dataset.ownerOnly = ''"], ['crop-card.js', "editSave.dataset.ownerOnly = ''"], ['crop-card.js', "for (const node of [rampField, lightField, autoField, programSave]) node.dataset.ownerOnly = '';"],
    ['crop-card.js', "if (!editing && isOwner()) openEditor();"]],
  ['crop-card', 'PUT', '/api/rooms/1/control', ['crop-card.js', "backBtn.dataset.ownerOnly = ''"]],
  ['harvest-card', 'GET', '/api/batches', ['harvest-card.js', 'isOwner() ? readBlocks(data.current) : null']],
  ['harvest-card', 'GET', '/api/costs/summary', ['harvest-card.js', 'isOwner() ? readProfit(data.current) : null']],
  ['harvest-card', 'PUT', '/api/harvests/1', ['harvest-card.js', "edit.dataset.ownerOnly = ''"]], // Edit, and Delete in its dialog
  ['harvest-card', 'DELETE', '/api/harvests/1', ['harvest-card.js', "edit.dataset.ownerOnly = ''"]],
  ['inventory-done', 'DELETE', '/api/inventory/moves/1', ['inventory-done.js', 'const moves = isOwner() ? result.moves : null;']], // Undo
  ['inventory-dialogs', '?', '/api/inventory/items/1', ['inventory-item.js', '<button type="button" data-edit data-owner-only>']], // Edit item
  ['inventory-dialogs', '?', '/api/inventory/items', ['inventory-page.js', '<button type="button" data-add data-owner-only>'],
    ['inventory-page.js', 'data-add-empty data-owner-only']], // Add item
  ['inventory-dialogs', 'DELETE', '/api/inventory/items/1', ['inventory-item.js', '<button type="button" data-edit data-owner-only>']], // from Edit
  ['inventory-dialogs', 'PUT', '/api/inventory/items/1', ['inventory-item.js', '<button type="button" data-archive data-owner-only>']], // Archive, Bring back
  ['inventory-dialogs', 'POST', '/api/inventory/purchases', ['inventory-item.js', '<button type="button" data-purchase data-owner-only>'],
    ['inventory-page.js', '<button type="button" data-purchase disabled data-owner-only>']],
  ['inventory-dialogs', 'PUT', '/api/inventory/moves/1', ['inventory-item.js', "b.dataset.ownerOnly = ''; // ---- Login ---- a move is changed by the owner"]],
  ['inventory-dialogs', 'DELETE', '/api/inventory/moves/1', ['inventory-item.js', "b.dataset.ownerOnly = ''; // ---- Login ---- a move is changed by the owner"]],
  ['inventory-dialogs', 'POST', '/api/inventory/lots/1/throw-out', ['inventory-item.js', "action.dataset.ownerOnly = ''"]],
  ['task-dialogs', 'POST', '/api/tasks/1/cancel', ['task-list.js', "b.dataset.ownerOnly = ''"]], // a long-term task's Cancel
  ['task-dialogs', 'POST', '/api/rooms/1/tasks', ['tasks-card.js', "add.dataset.ownerOnly = ''"], PAGES_OF_A_WORKER], // Add; Plan this (Suggest page)
  ['task-dialogs', 'PUT', '/api/rooms/1', ['task-dialogs.js', 'const update = isOwner() ? setupUpdate(row.source, room) : null;']],
  ['tasks-card', 'GET', '/api/rooms/1/tasks/log.csv', ['tasks-card.js', "csvLine.dataset.ownerOnly = ''"]],
  ['room-detail', 'GET', '/api/rooms/1/control', NO_CONTROL],
  ['overview', 'GET', '/api/usage', ['overview.js', 'const wantUsage = isOwner() && Date.now() - usageAt >= USAGE_REFRESH_MS;']],
  ['overview', 'POST', '/api/alarms/1/ack', ['overview.js', "ack.dataset.ownerOnly = ''"]],
  ['alarms', 'POST', '/api/alarms/1/ack', ['alarms.js', "b.dataset.ownerOnly = ''"]],
  ['alarms', 'POST', '/api/rooms/1/alarms/ack', ['alarms.js', "ackAll.dataset.ownerOnly = ''"]],
  ['filter-card', 'POST', '/api/rooms/1/filter/changed', ['filter-card.js', "changed.dataset.ownerOnly = ''"],
    ['room-detail.js', "if (isOwner()) { // ---- Login ---- the Intake filter card is the Setup tab's"]], // and the card is the Setup tab's
  ['harvest-page', 'GET', '/api/harvest.csv', ['harvest-page.js', 'data-csv download data-owner-only']],
  ['harvest-page', 'GET', '/api/sales/range', PAGES_OF_A_WORKER], // the myGAP sheet
  ['machines', 'PUT', '/api/rooms/1/machines/1', NO_CONTROL], ['machines', 'PUT', '/api/rooms/1/machines/ac', NO_CONTROL],
  ['control', 'PUT', '/api/rooms/1/control', NO_CONTROL],
];

test("the sweep: a worker's pages name only routes a worker may use, or each sits behind its guard", () => {
  const missed = [];
  for (const file of WORKER_MODULES) {
    for (const { method, path } of routesOf(file)) {
      if (method !== '?' && workerMay(method, path)) continue;
      const ex = EXCEPTIONS.find(([f, m, p]) => f === file && m === method && p === path);
      if (!ex) missed.push(`${file}: ${method} ${path}`);
    }
  }
  assert.deepEqual(missed, [], 'a route a worker may not use, with no guard named here');
  for (const [file, method, path, ...guards] of EXCEPTIONS) {
    assert.ok(routesOf(file).some((r) => r.method === method && r.path === path), `${file}: ${method} ${path} is still there`);
    for (const [guardFile, text] of guards) assert.ok(src(guardFile).includes(text), `${file}: ${method} ${path}: ${guardFile} has ${text}`);
  }
});

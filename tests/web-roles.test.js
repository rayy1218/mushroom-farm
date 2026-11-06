// What a worker's pages leave out (spec 2026-11-06-login-design.md 6): the owner's buttons marked data-owner-only, the
// picker gone, the signed-in name for every "who did it".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
});

test('"Doing the rounds as" is gone: who did it is the signed-in name', () => {
  assert.ok(!src('task-dialogs.js').includes('createWorkerPicker'));
  assert.ok(!src('today-page.js').includes('createWorkerPicker'));
  assert.ok(!src('tasks-card.js').includes('createWorkerPicker'));
  assert.ok(!src('task-dialogs.js').includes("'farm.worker'"));
  assert.ok(src('task-dialogs.js').includes('me()?.name'));
});

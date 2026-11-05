// The Inventory pages and dialogs (spec 2026-11-05-inventory-design.md 4 and 5). Source checks; the look is checked in the
// browser (the UI/UX audit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const path = (name) => new URL(`../web/${name}`, import.meta.url);
const src = (name) => readFileSync(path(name), 'utf8');

test('the dialogs: on the tasks openForm; the routes they send to; more than in stock asks once', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes("from './task-dialogs.js'"));
  for (const route of ["'/api/inventory/items'", "'/api/inventory/purchases'", "'/api/inventory/uses'", '`/api/inventory/moves/${move.id}`', '`/api/inventory/lots/${lot.moveId}/throw-out`']) {
    assert.ok(d.includes(route), route);
  }
  assert.ok(d.includes('overStock('));
  assert.ok(d.includes("`${label} anyway`"));
  assert.ok(d.includes("closeLabel: 'Keep it'"));
  assert.ok(d.includes("label: 'Delete this record'"));
});

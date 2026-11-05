// The Inventory addresses (spec 2026-11-05-inventory-design.md 5) and its live event.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, isCanonical, canonicalHash, INVENTORY_HASH, INVENTORY_COUNT_HASH, inventoryItemHash, inventorySheetHash } from '../web/route.js';
import { EVENT_TYPES } from '../web/live.js';

test('the list, an item, Count stock and the 4-5 sheet', () => {
  assert.deepEqual(parseRoute('#/business/inventory'), { name: 'inventory' });
  assert.deepEqual(parseRoute('#/business/inventory/'), { name: 'inventory' });
  assert.deepEqual(parseRoute('#/business/inventory/7'), { name: 'inventoryItem', id: 7 });
  assert.deepEqual(parseRoute('#/business/inventory/count'), { name: 'inventoryCount' });
  assert.deepEqual(parseRoute('#/business/inventory/sheet?days=90'), { name: 'inventorySheet', days: 90 });
  assert.deepEqual(parseRoute('#/business/inventory/sheet'), { name: 'inventorySheet', days: 30 });
  assert.deepEqual(parseRoute('#/business/inventory/sheet?days=7'), { name: 'inventorySheet', days: 30 });
  assert.deepEqual(parseRoute('#/business/inventory/0'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/business/inventory/other'), { name: 'overview' });
});

test('one address each', () => {
  assert.equal(INVENTORY_HASH, '#/business/inventory');
  assert.equal(INVENTORY_COUNT_HASH, '#/business/inventory/count');
  assert.equal(inventoryItemHash(7), '#/business/inventory/7');
  assert.equal(inventorySheetHash(365), '#/business/inventory/sheet?days=365');
  for (const h of ['#/business/inventory', '#/business/inventory/7', '#/business/inventory/count', '#/business/inventory/sheet?days=30']) {
    assert.ok(isCanonical(h), h);
  }
  assert.equal(canonicalHash(parseRoute('#/business/inventory/sheet')), '#/business/inventory/sheet?days=30');
  assert.equal(isCanonical('#/business/inventory/'), false);
});

test("the pages hear 'inventory'", () => {
  assert.ok(EVENT_TYPES.includes('inventory'));
});

// The Summary tab's address (spec 2026-11-06-business-summary-design.md 2): #/business itself, the first Business tab; the
// top bar's entry always opens it (no memory of the last tab); the other tabs' old addresses keep working.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as route from '../web/route.js';

const { parseRoute, canonicalHash, isCanonical, BUSINESS_HASH, BUSINESS_TABS, businessTabOf, businessStrip } = route;

test('#/business is the Summary tab: its route, canonical as it is, the first tab, its strip shown', () => {
  assert.deepEqual(parseRoute('#/business'), { name: 'summary' });
  assert.equal(canonicalHash(parseRoute('#/business/')), BUSINESS_HASH);
  assert.equal(isCanonical('#/business'), true);
  assert.deepEqual(BUSINESS_TABS[0], { key: 'summary', label: 'Summary', hash: '#/business' });
  assert.equal(businessTabOf(parseRoute('#/business')), 'summary');
  assert.equal(businessStrip(parseRoute('#/business')), 'summary');
});

test('no landing memory: the entry never sends #/business elsewhere', () => {
  assert.equal('businessLanding' in route, false);
});

test('the other tabs\' addresses keep working, each its own tab', () => {
  const cases = {
    '#/business/batches': 'batches', '#/business/inventory': 'inventory', '#/business/sales': 'sales', '#/business/costs': 'costs',
    '#/business/runs': 'runs',
  };
  for (const [hash, tab] of Object.entries(cases)) {
    assert.equal(isCanonical(hash), true, hash);
    assert.equal(businessStrip(parseRoute(hash)), tab, hash);
  }
});

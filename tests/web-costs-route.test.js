// The Costs page's address (spec 2026-11-05-costs-design.md 6): #/business/costs, its month in the query.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, canonicalHash, costsHash, COSTS_HASH } from '../web/route.js';

test('#/business/costs and its month', () => {
  assert.equal(COSTS_HASH, '#/business/costs');
  assert.deepEqual(parseRoute('#/business/costs'), { name: 'costs', month: null });
  assert.deepEqual(parseRoute('#/business/costs?month=2026-10'), { name: 'costs', month: '2026-10' });
  assert.deepEqual(parseRoute('#/business/costs?month=2026-13'), { name: 'costs', month: null }, 'not a month: this month');
  assert.equal(canonicalHash({ name: 'costs', month: null }), '#/business/costs');
  assert.equal(costsHash('2026-10'), '#/business/costs?month=2026-10');
  assert.equal(parseRoute('#/business').name, 'overview', 'the Business page comes at the merge');
});

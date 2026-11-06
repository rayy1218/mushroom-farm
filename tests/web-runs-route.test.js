// The Run page's addresses (spec 2026-11-05-runs-design.md 6): the Runs tab #/business/runs (?crop=) and a run's page
// #/business/runs/<id>, the fifth Business tab.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRoute, canonicalHash, isCanonical, RUNS_HASH, runsHash, runHash, businessTabOf, businessStrip,
} from '../web/route.js';

test('#/business/runs and its crop; a crop that is not one is every crop', () => {
  assert.equal(RUNS_HASH, '#/business/runs');
  assert.deepEqual(parseRoute('#/business/runs'), { name: 'runs', crop: null });
  assert.deepEqual(parseRoute('#/business/runs?crop=lionsmane'), { name: 'runs', crop: 'lionsmane' });
  assert.deepEqual(parseRoute('#/business/runs?crop=mango'), { name: 'runs', crop: null });
  assert.deepEqual(parseRoute('#/business/runs/'), { name: 'runs', crop: null });
  assert.equal(runsHash(), '#/business/runs');
  assert.equal(runsHash('oyster'), '#/business/runs?crop=oyster');
  assert.equal(canonicalHash({ name: 'runs', crop: 'oyster' }), '#/business/runs?crop=oyster');
  assert.equal(isCanonical('#/business/runs?crop=mango'), false);
});

test('#/business/runs/<id>: a run\'s page; 0 and words are not one', () => {
  assert.deepEqual(parseRoute('#/business/runs/12'), { name: 'run', id: 12 });
  assert.equal(runHash(12), '#/business/runs/12');
  assert.equal(canonicalHash({ name: 'run', id: 12 }), '#/business/runs/12');
  assert.equal(isCanonical('#/business/runs/12'), true);
  assert.deepEqual(parseRoute('#/business/runs/0'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/business/runs/abc'), { name: 'overview' });
});

test('Runs is a Business tab: its strip on the list, not on a run (it has its back link)', () => {
  assert.equal(businessTabOf(parseRoute('#/business/runs')), 'runs');
  assert.equal(businessTabOf(parseRoute('#/business/runs/12')), 'runs');
  assert.equal(businessStrip(parseRoute('#/business/runs?crop=pink')), 'runs');
  assert.equal(businessStrip(parseRoute('#/business/runs/12')), null);
});

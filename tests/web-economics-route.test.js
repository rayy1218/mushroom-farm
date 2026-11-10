// The Economics tab's address (spec 2026-11-06-economics-design.md 2): #/business/economics with its room and crop, the
// seventh Business tab and its strip; the owner's only (a worker's address is Today); the 'economics' event on the stream.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, canonicalHash, isCanonical, ECONOMICS_HASH, economicsHash, BUSINESS_TABS, businessTabOf, businessStrip, workerHash } from '../web/route.js';
import { EVENT_TYPES } from '../web/live.js';

test('#/business/economics: its room (a whole number) and crop (one of the four), each or neither', () => {
  assert.equal(ECONOMICS_HASH, '#/business/economics');
  assert.deepEqual(parseRoute('#/business/economics'), { name: 'economics', room: null, crop: null });
  assert.deepEqual(parseRoute('#/business/economics/'), { name: 'economics', room: null, crop: null });
  assert.deepEqual(parseRoute('#/business/economics?room=3&crop=pink'), { name: 'economics', room: 3, crop: 'pink' });
  assert.deepEqual(parseRoute('#/business/economics?crop=lionsmane'), { name: 'economics', room: null, crop: 'lionsmane' });
  assert.deepEqual(parseRoute('#/business/economics?room=0&crop=reishi'), { name: 'economics', room: null, crop: null }, 'not a room, not one of the four');
  assert.deepEqual(parseRoute('#/business/economics/2'), { name: 'overview' });
});

test('its one address: room then crop, a null left out; others tidied to it', () => {
  assert.equal(economicsHash({ room: 3, crop: 'pink' }), '#/business/economics?room=3&crop=pink');
  assert.equal(economicsHash({ crop: 'oyster' }), '#/business/economics?crop=oyster');
  assert.equal(economicsHash(), '#/business/economics');
  assert.equal(canonicalHash(parseRoute('#/business/economics?crop=pink&room=3')), '#/business/economics?room=3&crop=pink');
  assert.equal(isCanonical('#/business/economics?room=3&crop=pink'), true);
  assert.equal(isCanonical('#/business/economics/'), false);
  assert.equal(isCanonical('#/business/economics?room=x'), false);
});

test('the seventh Business tab, last, its strip shown; the other tabs unchanged', () => {
  assert.deepEqual(BUSINESS_TABS.at(-1), { key: 'economics', label: 'Economics', hash: '#/business/economics' });
  assert.deepEqual(BUSINESS_TABS.map((t) => t.key), ['summary', 'batches', 'inventory', 'sales', 'costs', 'runs', 'economics']);
  assert.equal(businessTabOf(parseRoute('#/business/economics?room=3')), 'economics');
  assert.equal(businessStrip(parseRoute('#/business/economics?room=3&crop=pink')), 'economics');
  assert.equal(businessStrip(parseRoute('#/business/runs')), 'runs');
});

test('the owner\'s only: a worker opening it is sent to Today; the economics event is one the page can hear', () => {
  assert.equal(workerHash(parseRoute('#/business/economics')), '#/today');
  assert.ok(EVENT_TYPES.includes('economics'));
});

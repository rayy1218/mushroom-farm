import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, isCanonical } from '../web/route.js';

test('empty and unknown hashes mean the Overview', () => {
  for (const h of ['', '#', '#/', '#/other', '#/rooms/abc', '#/rooms/0', '#/rooms/01', '#/rooms/1/x', '#/rooms/-1', undefined]) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, String(h));
  }
});

test('#/rooms is the Rooms list', () => {
  assert.deepEqual(parseRoute('#/rooms'), { name: 'list' });
});

test('a room id means the detail page', () => {
  assert.deepEqual(parseRoute('#/rooms/7'), { name: 'detail', id: 7 });
  assert.deepEqual(parseRoute('#/rooms/123/'), { name: 'detail', id: 123 });
});

test('canonical hashes are left alone, others are tidied', () => {
  assert.equal(isCanonical('#/rooms'), true);
  assert.equal(isCanonical('#/overview'), true);
  assert.equal(isCanonical('#/rooms/7'), true);
  assert.equal(isCanonical(''), false);
  assert.equal(isCanonical('#/rooms/7/'), false);
  assert.equal(isCanonical('#/rooms/x'), false);
});

test('a simulation run of a room is its own page', () => {
  assert.deepEqual(parseRoute('#/rooms/3/simulations/12'), { name: 'simulation', id: 3, runId: 12 });
  assert.deepEqual(parseRoute('#/rooms/3/simulations/12/'), { name: 'simulation', id: 3, runId: 12 });
  for (const h of ['#/rooms/3/simulations', '#/rooms/3/simulations/0', '#/rooms/3/simulations/x', '#/rooms/0/simulations/1', '#/rooms/3/simulations/1/2']) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, h);
  }
  assert.equal(isCanonical('#/rooms/3/simulations/12'), true);
  assert.equal(isCanonical('#/rooms/3/simulations/12/'), false);
  assert.equal(isCanonical('#/rooms/3/simulations/0'), false);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, isCanonical, ROOM_TABS, roomHash } from '../web/route.js';

test('empty and unknown hashes mean the Overview', () => {
  for (const h of ['', '#', '#/', '#/other', '#/rooms/abc', '#/rooms/0', '#/rooms/01', '#/rooms/1/x', '#/rooms/-1', undefined]) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, String(h));
  }
});

test('#/rooms is the Rooms list', () => {
  assert.deepEqual(parseRoute('#/rooms'), { name: 'list' });
});

test('a room id means the detail page, on its Overview tab', () => {
  assert.deepEqual(parseRoute('#/rooms/7'), { name: 'detail', id: 7, tab: 'overview' });
  assert.deepEqual(parseRoute('#/rooms/123/'), { name: 'detail', id: 123, tab: 'overview' });
});

test('a room page tab is part of the address; an unknown tab means the Overview page', () => {
  assert.deepEqual(ROOM_TABS.map((t) => t.key), ['overview', 'charts', 'climate', 'crop', 'sensors', 'energy', 'simulations']);
  assert.deepEqual(ROOM_TABS.map((t) => t.label), ['Overview', 'Charts', 'Climate', 'Crop', 'Sensors', 'Energy', 'Simulations']);
  for (const tab of ['charts', 'climate', 'crop', 'sensors', 'energy', 'simulations']) {
    assert.deepEqual(parseRoute(`#/rooms/7/${tab}`), { name: 'detail', id: 7, tab });
    assert.deepEqual(parseRoute(`#/rooms/7/${tab}/`), { name: 'detail', id: 7, tab });
    assert.equal(isCanonical(`#/rooms/7/${tab}`), true);
    assert.equal(isCanonical(`#/rooms/7/${tab}/`), false);
  }
  assert.deepEqual(parseRoute('#/rooms/7/overview'), { name: 'overview' }, 'the Overview tab has no name in the address');
  assert.deepEqual(parseRoute('#/rooms/7/alarms'), { name: 'overview' });
  assert.equal(roomHash(7), '#/rooms/7');
  assert.equal(roomHash(7, 'overview'), '#/rooms/7');
  assert.equal(roomHash(7, 'charts'), '#/rooms/7/charts');
  assert.equal(roomHash(7, 'nonsense'), '#/rooms/7');
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
  assert.deepEqual(parseRoute('#/rooms/3/simulations'), { name: 'detail', id: 3, tab: 'simulations' }, 'without a run: the Simulations tab');
  for (const h of ['#/rooms/3/simulations/0', '#/rooms/3/simulations/x', '#/rooms/0/simulations/1', '#/rooms/3/simulations/1/2']) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, h);
  }
  assert.equal(isCanonical('#/rooms/3/simulations/12'), true);
  assert.equal(isCanonical('#/rooms/3/simulations/12/'), false);
  assert.equal(isCanonical('#/rooms/3/simulations/0'), false);
});

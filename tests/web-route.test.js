import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, isCanonical, ROOM_TABS, roomHash } from '../web/route.js';

test('empty and unknown hashes mean the Overview', () => {
  for (const h of ['', '#', '#/', '#/other', '#/rooms/abc', '#/rooms/0', '#/rooms/01', '#/rooms/1/x', '#/rooms/-1', undefined]) {
    assert.deepEqual(parseRoute(h), { name: 'overview' }, String(h));
  }
});

test('#/rooms is the Overview now (the Rooms list is folded into it); the old address is tidied', () => {
  assert.deepEqual(parseRoute('#/rooms'), { name: 'overview' });
  assert.equal(isCanonical('#/rooms'), false);
});

test('a room id means the detail page, on its Now tab', () => {
  assert.deepEqual(parseRoute('#/rooms/7'), { name: 'detail', id: 7, tab: 'now' });
  assert.deepEqual(parseRoute('#/rooms/123/'), { name: 'detail', id: 123, tab: 'now' });
});

test('five room tabs (redesign 2026-10-28: Now, History, Crop, Simulations, Setup); a tab is part of the address', () => {
  assert.deepEqual(ROOM_TABS.map((t) => t.key), ['now', 'history', 'crop', 'simulations', 'setup']);
  assert.deepEqual(ROOM_TABS.map((t) => t.label), ['Now', 'History', 'Crop', 'Simulations', 'Setup']);
  for (const tab of ['history', 'crop', 'simulations', 'setup']) {
    assert.deepEqual(parseRoute(`#/rooms/7/${tab}`), { name: 'detail', id: 7, tab });
    assert.deepEqual(parseRoute(`#/rooms/7/${tab}/`), { name: 'detail', id: 7, tab });
    assert.equal(isCanonical(`#/rooms/7/${tab}`), true);
    assert.equal(isCanonical(`#/rooms/7/${tab}/`), false);
  }
  assert.deepEqual(parseRoute('#/rooms/7/alarms'), { name: 'overview' });
  assert.equal(roomHash(7), '#/rooms/7');
  assert.equal(roomHash(7, 'now'), '#/rooms/7');
  assert.equal(roomHash(7, 'history'), '#/rooms/7/history');
  assert.equal(roomHash(7, 'nonsense'), '#/rooms/7');
  assert.equal(roomHash(7, 'setup'), '#/rooms/7/setup');
});

test("the old nine tabs' addresses (bookmarks, links) open the tab that holds them now, and are tidied to it", () => {
  const OLD = { overview: 'now', charts: 'history', energy: 'history', climate: 'setup', sensors: 'setup', profile: 'setup', equipment: 'setup' };
  for (const [old, tab] of Object.entries(OLD)) {
    assert.deepEqual(parseRoute(`#/rooms/7/${old}`), { name: 'detail', id: 7, tab }, old);
    assert.equal(isCanonical(`#/rooms/7/${old}`), false, `${old} is tidied`);
    assert.equal(roomHash(7, old), roomHash(7, tab), `roomHash(${old})`);
  }
});

test('canonical hashes are left alone, others are tidied', () => {
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

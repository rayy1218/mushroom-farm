// How the Overview page loads and what a room card shows (web/overview-data.js, roomCard in web/overview-math.js), with fetch stubbed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadOverview, loadBadge } from '../web/overview-data.js';
import { roomCard } from '../web/overview-math.js';

const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();

// routes: path → { status, body } | 'down'. Unlisted paths answer 404.
function stubFetch(t, routes) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (path) => {
    calls.push(path);
    const r = routes[path];
    if (r === 'down') throw new TypeError('fetch failed');
    return new Response(JSON.stringify(r?.body ?? { error: 'Not found' }), {
      status: r?.status ?? 404,
      headers: { 'content-type': 'application/json' },
    });
  };
  t.after(() => { globalThis.fetch = real; });
  return calls;
}

const alarm = (id, level, raisedAt, extra = {}) => ({
  id, roomId: 1, roomName: 'A', key: 'k', level, text: 't', raisedAt, clearedAt: null, ackedAt: null, ...extra,
});

test('the page loads /api/overview and /api/alarms; the list is sorted and cut to 10', async (t) => {
  const many = Array.from({ length: 12 }, (_, i) => alarm(i + 1, 'warning', 100 + i));
  const calls = stubFetch(t, {
    '/api/overview': { status: 200, body: { rooms: [], alarms: [] } },
    '/api/alarms': { status: 200, body: many },
  });
  const r = await loadOverview();
  assert.deepEqual(calls.sort(), ['/api/alarms', '/api/overview']);
  assert.equal(r.alarms.length, 10);
  assert.equal(r.alarms[0].id, 12);
  assert.deepEqual(r.failed, { overview: false, alarms: false });
});

test('a 404 from /api/alarms is fine: the overview reply carries the list', async (t) => {
  stubFetch(t, { '/api/overview': { status: 200, body: { rooms: [], alarms: [alarm(1, 'critical', 5)] } } });
  const r = await loadOverview();
  assert.deepEqual(r.alarms.map((a) => a.id), [1]);
  assert.deepEqual(r.failed, { overview: false, alarms: false });
});

test('parts fail independently: no overview keeps the alarms, a dead server fails both', async (t) => {
  stubFetch(t, { '/api/overview': { status: 500, body: { error: 'x' } }, '/api/alarms': { status: 200, body: [alarm(1, 'serious', 5)] } });
  let r = await loadOverview();
  assert.equal(r.overview, null);
  assert.deepEqual(r.alarms.map((a) => a.id), [1]);
  assert.deepEqual(r.failed, { overview: true, alarms: false });
  stubFetch(t, { '/api/overview': 'down', '/api/alarms': 'down' });
  r = await loadOverview();
  assert.deepEqual(r.failed, { overview: true, alarms: true });
  assert.deepEqual(r.alarms, []);
});

test('the badge count comes from /api/alarms; a 404 counts 0, a dead server gives null (keep the last)', async (t) => {
  stubFetch(t, { '/api/alarms': { status: 200, body: [alarm(1, 'warning', 1), alarm(2, 'warning', 2, { ackedAt: 3 })] } });
  assert.equal(await loadBadge(), 1);
  stubFetch(t, {});
  assert.equal(await loadBadge(), 0);
  stubFetch(t, { '/api/alarms': 'down' });
  assert.equal(await loadBadge(), null);
});

const bands = { tLow: 21, tHigh: 23, rhLow: 85, rhHigh: 95, co2Low: 600, co2High: 750 };

test('a room card: values with status words, exchange, auto, alarm chip and three sparklines', () => {
  const spark = [{ at: 0, v: 20 }, { at: 1, v: 22 }];
  const card = roomCard({
    id: 3, name: 'Fruiting', trh: { status: 'online', t: 22.04, rh: 91.2, at: 1 }, co2: { status: 'offline', co2: 650, at: 1 },
    auto: true, exchange: true, exchangeSince: at(19, 10, 42), alarms: { count: 2, level: 'serious' }, bands,
    spark: { t: spark, rh: [], co2: spark },
  }, at(19, 12));
  assert.equal(card.href, '#/rooms/3');
  assert.equal(card.name, 'Fruiting');
  assert.deepEqual(card.values.map((v) => v.text), ['22.0 °C', '91 %RH', '650 ppm · Offline']);
  assert.equal(card.auto, 'Auto on');
  assert.equal(card.exchange, 'Air exchange on since 10:42');
  assert.deepEqual(card.alarm, { text: '2 alarms', level: 'serious' });
  assert.ok(card.values[0].spark.d);
  assert.equal(card.values[1].spark, null);
});

test('a room card without alarms has no chip; "1 alarm" in the singular; Auto off', () => {
  const base = {
    id: 1, name: 'A', trh: { status: 'not-wired' }, co2: { status: 'not-wired' }, auto: false, exchange: false, exchangeSince: null,
    bands, spark: { t: [], rh: [], co2: [] },
  };
  assert.equal(roomCard({ ...base, alarms: { count: 0, level: null } }, 0).alarm, null);
  assert.equal(roomCard({ ...base, alarms: { count: 1, level: 'warning' } }, 0).alarm.text, '1 alarm');
  assert.equal(roomCard({ ...base, alarms: { count: 0, level: null } }, 0).auto, 'Auto off');
});

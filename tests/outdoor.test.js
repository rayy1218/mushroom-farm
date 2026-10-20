// The outdoor probe's replies: GET /api/outdoor and its history (server/outdoor.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { outdoorView, outdoorHistory, dewPoint } from '../server/outdoor.js';

const NOW = Date.UTC(2026, 9, 20, 4, 0, 0);
const MIN = 60_000;

function setup(t, address = 9) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  if (address !== null) db.setSetting('outdoorAddress', String(address));
  return db;
}
const add = (db, at, t, rh) => db.addOutdoorReading({ address: 9, at, ok: t !== null, t, rh, error: t === null ? 'timeout' : null });

test('dew point (Magnus): 30 °C and 70 % is about 24 °C; saturated air is at its own temperature', () => {
  assert.ok(Math.abs(dewPoint(30, 70) - 23.9) < 0.2);
  assert.ok(Math.abs(dewPoint(20, 100) - 20) < 0.01);
});

test('not set: address null, no data', (t) => {
  const db = setup(t, null);
  assert.deepEqual(outdoorView(db, NOW), { address: null, status: 'not-set', last: null, check: null, spark: { t: [], rh: [] } });
});

test('set but nothing polled yet', (t) => {
  const db = setup(t);
  assert.deepEqual(outdoorView(db, NOW), { address: 9, status: 'no-data', last: null, check: null, spark: { t: [], rh: [] } });
});

test('the latest good reading with its dew point, the check and a 24 h spark in 30 min buckets', (t) => {
  const db = setup(t);
  add(db, NOW - 3 * 3_600_000, 30, 70);
  add(db, NOW - 100 * MIN, 31, 68);
  add(db, NOW - 95 * MIN, 31, 70);
  add(db, NOW - 5 * MIN, 32.04, 65);
  const view = outdoorView(db, NOW);
  assert.equal(view.address, 9);
  assert.equal(view.status, 'online');
  assert.deepEqual(view.last, { at: NOW - 5 * MIN, t: 32.04, rh: 65, dew: Math.round(dewPoint(32.04, 65) * 10) / 10 });
  assert.deepEqual(view.check, { ok: true, why: null, fault: false });
  assert.deepEqual(view.spark.t.map((p) => p.v), [30, 31, 32.04]);
  assert.deepEqual(view.spark.rh.map((p) => p.v), [70, 69, 65]);
  for (const p of view.spark.t) assert.ok(p.at >= NOW - 24 * 3_600_000 && p.at <= NOW);
});

test('readings older than 24 h are not in the spark', (t) => {
  const db = setup(t);
  add(db, NOW - 25 * 3_600_000, 30, 70);
  assert.deepEqual(outdoorView(db, NOW).spark, { t: [], rh: [] });
});

test('the room checks apply: three bad readings in a row are a fault, without the exchange or humidifier exemptions', (t) => {
  const db = setup(t);
  add(db, NOW - 10 * MIN, 30, 70);
  add(db, NOW - 3 * MIN, 70, 70); // out of range
  assert.deepEqual(outdoorView(db, NOW).check, { ok: false, why: 'value out of range', fault: false });
  add(db, NOW - 2 * MIN, 70, 70);
  add(db, NOW - 1 * MIN, 70, 70);
  assert.deepEqual(outdoorView(db, NOW).check, { ok: false, why: 'value out of range', fault: true });
  add(db, NOW, 31, 70);
  assert.deepEqual(outdoorView(db, NOW + 1).check, { ok: true, why: null, fault: false });
});

test('a sudden jump is judged against the earlier reading and a frozen value after two hours', (t) => {
  const db = setup(t);
  add(db, NOW - 10 * MIN, 25, 70);
  add(db, NOW - 9 * MIN, 40, 70); // 15 °C in a minute
  assert.equal(outdoorView(db, NOW).check.why, 'sudden jump');

  const frozen = setup(t);
  for (let m = 150; m >= 0; m -= 5) add(frozen, NOW - m * MIN, 29, 80);
  assert.deepEqual(outdoorView(frozen, NOW).check, { ok: false, why: 'value does not change (frozen)', fault: true });
});

test('failed polls count as bad for the fault and set the status', (t) => {
  const db = setup(t);
  add(db, NOW - 10 * MIN, 30, 70);
  for (const m of [3, 2, 1]) add(db, NOW - m * MIN, null, null);
  const view = outdoorView(db, NOW);
  assert.equal(view.status, 'offline');
  assert.equal(view.check.fault, true);
  assert.equal(view.last.t, 30); // the last good value stays
});

test('history: the shape of a room history for T and RH, per range', (t) => {
  const db = setup(t);
  add(db, NOW - 20 * MIN, 30, 70);
  add(db, NOW - 10 * MIN, 32, 60);
  const h = outdoorHistory(db, '1h', NOW);
  assert.deepEqual(Object.keys(h), ['from', 'to', 'bucketS', 'trh']);
  assert.equal(h.to, NOW);
  assert.equal(h.from, NOW - 3_600_000);
  assert.equal(h.bucketS, 15);
  assert.deepEqual(h.trh.map((p) => [p.t, p.rh]), [[30, 70], [32, 60]]);
  assert.deepEqual(['6h', '24h', '7d', '30d'].map((r) => outdoorHistory(db, r, NOW).bucketS), [60, 300, 1800, 7200]);
  assert.equal(outdoorHistory(db, '24h', NOW).from, NOW - 24 * 3_600_000);
  assert.equal(outdoorHistory(db, '30d', NOW).from, NOW - 720 * 3_600_000);
  const coarse = outdoorHistory(db, '24h', NOW).trh; // 5 min buckets: the two readings are in different buckets
  assert.equal(coarse.length, 2);
});

test('history: an unknown range is null', (t) => {
  const db = setup(t);
  for (const range of ['', '2h', '24', '1H', 'x']) assert.equal(outdoorHistory(db, range, NOW), null, range);
});

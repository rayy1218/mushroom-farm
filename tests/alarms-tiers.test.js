// The severity tiers of the temperature and humidity alarms (server/alarms.js, spec 2026-11-12-alarms-triage-design.md 2 and 3):
// Warning after 5 min out of band, Serious 30 min after it began, Critical past the crop's hot, cold or dry limit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createAlarms } from '../server/alarms.js';
import { roomLimits } from '../web/crops.js';

const MIN = 60_000;
const bands = { co2Low: 600, co2High: 900, co2Safety: 1500, tLow: 24, tHigh: 26, rhLow: 85, rhHigh: 91, exchangeMaxMin: 10 };
const OYSTER = roomLimits([{ crop: 'oyster', blocks: 500 }], bands); // hot 32, cold 15, dry 70

function setup(t, { limits = OYSTER, stage = 'fruiting' } = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ name: 'Container 1', length: 6, width: 2.4, height: 2.4 });
  let clock = 1_000_000;
  const alarms = createAlarms({ db, now: () => clock });
  const changes = [];
  db.onAlarmChange((e) => changes.push(`${e.change} ${e.alarm?.level}`));
  return {
    db, changes,
    tick(ms, r, extra = {}) {
      clock += ms;
      alarms.evaluate(room, {
        readings: { t: 25, rh: 88, co2: 700, ...r }, bands, faults: { trh: null, co2: null }, cappedInRow: 0, machines: null,
        limits, stage, ...extra,
      });
    },
    one: () => db.activeAlarms(room.id)[0] ?? null,
    at: () => clock,
  };
}

test('a hot room: Warning after 5 min, Serious 30 min after it began, then it clears as before', (t) => {
  const s = setup(t);
  s.tick(0, { t: 28 });
  s.tick(5 * MIN, { t: 28 });
  assert.deepEqual([s.one().key, s.one().level], ['tHigh', 'warning']);
  const raisedAt = s.one().raisedAt;
  s.tick(25 * MIN - 1000, { t: 28.2 });
  assert.equal(s.one().level, 'warning');
  s.tick(1000, { t: 28.4 });
  assert.deepEqual([s.one().level, s.one().text, s.one().raisedAt],
    ['serious', 'Temperature 28.4 °C: more than 1 °C over the band (24–26 °C) for 30 min', raisedAt]);
  s.tick(MIN, { t: 25 });
  assert.equal(s.one(), null);
  assert.deepEqual(s.changes, ['raised warning', 'escalated serious', 'cleared serious']);
});

test('Serious needs the raise condition still holding, not only the release margin', (t) => {
  const s = setup(t);
  s.tick(0, { t: 28 });
  s.tick(5 * MIN, { t: 28 });
  s.tick(25 * MIN, { t: 26.9 }); // over tHigh + 0.8, not over tHigh + 1: the alarm stays, no tier
  assert.equal(s.one().level, 'warning');
  s.tick(MIN, { t: 27.5 });
  assert.equal(s.one().level, 'serious');
});

test('past the hot limit for 10 min: Critical, from a Warning or a Serious, and it stays Critical until it clears', (t) => {
  const s = setup(t);
  s.tick(0, { t: 28 });
  s.tick(5 * MIN, { t: 28 });
  s.tick(MIN, { t: 33 });
  s.tick(10 * MIN - 1000, { t: 33.5 });
  assert.equal(s.one().level, 'warning');
  s.tick(1000, { t: 33.1 });
  assert.deepEqual([s.one().level, s.one().text], ['critical', 'Temperature 33.1 °C: above 32 °C, the hot limit for Grey oyster, for 10 min']);
  s.tick(30 * MIN, { t: 28 }); // cooler, still out of band: stays Critical
  assert.equal(s.one().level, 'critical');
  s.tick(MIN, { t: 25 });
  assert.equal(s.one(), null);
});

test('a reading back inside the limit starts the hold again; a missing one pauses it (the count is kept)', (t) => {
  const s = setup(t);
  s.tick(0, { t: 33 });
  s.tick(9 * MIN, { t: 33 });
  s.tick(MIN, { t: 31 }); // inside 32: the count stops
  s.tick(0, { t: 33 });
  s.tick(9 * MIN, { t: 33 });
  assert.equal(s.one().level, 'warning');
  s.tick(30_000, { t: null }); // no reading: the hold waits
  assert.equal(s.one().level, 'warning');
  s.tick(30_000, { t: 33 });
  assert.equal(s.one().level, 'critical');
});

test('a Warning acknowledged turns Critical unacknowledged again', (t) => {
  const s = setup(t);
  s.tick(0, { t: 34 });
  s.tick(5 * MIN, { t: 34 });
  s.db.ackAlarm(s.one().id, s.at());
  s.tick(5 * MIN, { t: 34 });
  assert.deepEqual([s.one().level, s.one().ackedAt], ['critical', null]);
});

test('cold: below the cold limit for 30 min; the band guard names no crop', (t) => {
  const s = setup(t, { limits: roomLimits([{ crop: 'oyster', blocks: 1 }], { ...bands, tLow: 16 }) }); // cold = min(15, 13) = 13
  s.tick(0, { t: 12 });
  s.tick(29 * MIN, { t: 12 });
  assert.equal(s.one().level, 'warning');
  s.tick(MIN, { t: 12 });
  // tLow 24 in the bands passed to evaluate, so the text's band is 24–26
  assert.deepEqual([s.one().key, s.one().level, s.one().text], ['tLow', 'critical', 'Temperature 12.0 °C: below 13 °C, the cold limit (3 °C under the band), for 30 min']);
});

test('dry: below the dry limit for 15 min in fruiting or pinning only', (t) => {
  const s = setup(t);
  s.tick(0, { rh: 64 });
  s.tick(15 * MIN, { rh: 64 });
  assert.deepEqual([s.one().key, s.one().level, s.one().text], ['rhLow', 'critical', 'Humidity 64.0 % RH: below 70 % RH, the dry limit for Grey oyster in fruiting, for 15 min']);
  for (const stage of ['spawn', 'rest']) {
    const r = setup(t, { stage });
    r.tick(0, { rh: 64 });
    r.tick(29 * MIN, { rh: 64 });
    assert.equal(r.one().level, 'warning', stage);
    r.tick(MIN, { rh: 64 });
    assert.equal(r.one().level, 'serious', stage); // 30 min out of band still counts
  }
});

test('no crops: Warning and Serious only', (t) => {
  const s = setup(t, { limits: null, stage: null });
  s.tick(0, { t: 40 });
  s.tick(60 * MIN, { t: 40 });
  assert.equal(s.one().level, 'serious');
});

test('a faulty probe clears the alarm and drops the hold', (t) => {
  const s = setup(t);
  s.tick(0, { t: 33 });
  s.tick(8 * MIN, { t: 33 });
  s.tick(MIN, { t: null }, { clear: { t: true, rh: true } });
  assert.equal(s.one(), null);
  s.tick(0, { t: 33 });
  s.tick(9 * MIN, { t: 33 });
  assert.equal(s.one().level, 'warning');
});

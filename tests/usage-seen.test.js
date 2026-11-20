// Seen, metered and unseen time (server/usage.js, spec 2026-11-12-data-integrity-design.md 7.1): a room's day split into the
// meter's time, the seen time estimated from machine run time, and the time the app could not see it (nothing counted).
// Made-up figures (G12).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { fixedZone, roomDays, spansOf, subtractSpans, unionSpans, intervalsIn, SEEN_MS } from '../server/usage.js';
import { seenAllDay } from './integrity-fixture.js';

const zone = fixedZone(480);
const at = (day, hour, minute = 0) => Date.UTC(2026, 10, day, hour - 8, minute);
const H = 3_600_000;

test('the spans: each reading fresh for 15 minutes; subtract, join, cut machine intervals', () => {
  assert.equal(SEEN_MS, 15 * 60_000);
  const rows = [{ prev: null, at: 0 }, { prev: 10 * 60_000, at: 60 * 60_000 }, { prev: 70 * 60_000, at: null }];
  assert.deepEqual(spansOf(rows, 0, 2 * H), [[0, 25 * 60_000], [60 * 60_000, 85 * 60_000]]);
  assert.deepEqual(spansOf([], 0, H), []);
  assert.deepEqual(subtractSpans([[0, 100]], [[10, 20], [50, 60]]), [[0, 10], [20, 50], [60, 100]]);
  assert.deepEqual(unionSpans([[0, 10]], [[5, 20], [30, 40]]), [[0, 20], [30, 40]]);
  assert.deepEqual(intervalsIn([{ start: 0, end: 100, kind: 'on' }], [[10, 20], [90, 120]]), [{ start: 10, end: 20, kind: 'on' }, { start: 90, end: 100, kind: 'on' }]);
});

test('G12: a metered room read to 3 Nov 16:50, then nothing; its aircon left on is not costed while unseen', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ name: 'Container 2', length: 12, width: 2.3, height: 2.5, trhAddress: 1, meterAddress: 30, acInputW: 1700 }, at(1, 0));
  // a reading every 10 minutes from 1 Nov 00:00 to 3 Nov 16:50 (the meter 4 kWh a day; the T/RH sensor too)
  let energy = 1000;
  for (let ms = at(1, 0); ms <= at(3, 16, 50); ms += 10 * 60_000) {
    db.addMeterReading({ roomId: room.id, address: 30, at: ms, ok: true, powerW: 170, energyKwh: energy });
    db.addReading({ roomId: room.id, kind: 'trh', address: 1, at: ms, ok: true, t: 25, rh: 88 });
    energy += 4 / 144;
  }
  db.logMachine(room.id, 'ac', { on: true, setpoint: 22, mode: 'cool', fan: 'auto' }, 'auto', at(1, 0));
  const days = roomDays(db, db.getRoom(room.id), { now: at(9, 0), zone, count: 8 }); // 1 to 8 Nov
  const byDate = Object.fromEntries(days.map((d) => [d.date.slice(8), d]));
  assert.equal(byDate['02'].metered, true);
  assert.equal(byDate['02'].unseenMs, 0);
  // 3 Nov: metered to 17:05 (16:50 and its 15 minutes), unseen the 6 h 55 min after
  assert.equal(byDate['03'].unseenMs, (6 * 60 + 55) * 60_000);
  assert.equal(byDate['03'].kWhEstimated, 0);
  for (const d of ['04', '05', '06', '07', '08']) {
    assert.deepEqual([byDate[d].kWh, byDate[d].kWhMeasured, byDate[d].kWhEstimated, byDate[d].unseenMs], [0, 0, 0, 24 * H], d);
  }
});

test('the sensors seen without the meter: that time is estimated; a room with no device is always seen', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ name: 'Container 5', length: 12, width: 2.3, height: 2.5, trhAddress: 1, meterAddress: 30, intakeW: 1000 }, at(1, 0));
  seenAllDay(db, room.id, at(2, 0), at(3, 0));
  db.logMachine(room.id, 'intake', { on: true }, 'auto', at(2, 6));
  db.logMachine(room.id, 'intake', { on: false }, 'auto', at(2, 9));
  const [day] = roomDays(db, db.getRoom(room.id), { now: at(3, 0) + 120_000, zone, count: 2 });
  assert.deepEqual([day.kWhMeasured, day.kWhEstimated, day.kWh, day.metered, day.unseenMs], [0, 3, 3, false, 0]);
  const bare = db.createRoom({ name: 'Shed 1', length: 12, width: 6, height: 3, intakeW: 1000 }, at(1, 0));
  db.logMachine(bare.id, 'intake', { on: true }, 'auto', at(2, 0));
  const [plain] = roomDays(db, db.getRoom(bare.id), { now: at(3, 0) + 120_000, zone, count: 2 });
  assert.deepEqual([plain.kWhEstimated, plain.unseenMs], [24, 0], 'no sensor: the estimate stands');
});

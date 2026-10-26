// Electricity and water per history bucket (spec 2026-10-26-usage-charts-design.md section 2): estimated from run time
// like the Energy card's days, metered from the meter's steps, water from the humidifier. Time zone UTC+8 (fixedZone).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { fixedZone, roomDays } from '../server/usage.js';
import { bucketUsage } from '../server/usage-buckets.js';

const zone = fixedZone(480);
const H = 3_600_000;
const at = (day, hour, minute = 0, second = 0) => Date.UTC(2026, 9, day, hour - 8, minute, second);
const fields = { name: 'A', length: 6, width: 4, height: 2.5 };

function setup(t, room = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, room: db.createRoom({ ...fields, ...room }) };
}
const log = (db, room, machine, time, on, extra = {}) => db.logMachine(room.id, machine, { on, ...extra }, 'auto', time);
const meter = (db, room, time, energyKwh) => db.addMeterReading({ roomId: room.id, address: 30, at: time, ok: true, powerW: 100, energyKwh });
const sum = (list, key) => list.reduce((s, b) => s + (b[key] ?? 0), 0);
// The buckets are rounded to 6 places and the days to 3: a sum of buckets is within half a Wh of the day.
const close = (a, b, msg, within = 1e-6) => assert.ok(Math.abs(a - b) <= within, `${msg}: ${a} vs ${b}`);

test('the estimate per bucket adds up to the day estimate of the Energy card, water too', (t) => {
  const { db, room } = setup(t, { intakeW: 50, exhaustW: 40, circulationW: 30, humidifierW: 80, humidifierLH: 2, acInputW: 1000 });
  log(db, room, 'intake', at(19, 1, 3), true);
  log(db, room, 'intake', at(19, 2, 47), false);
  log(db, room, 'exhaust', at(19, 1, 3), true);
  log(db, room, 'exhaust', at(19, 1, 33), false);
  log(db, room, 'circulation', at(18, 22), true); // on from the day before
  log(db, room, 'humidifier', at(19, 5, 1, 30), true);
  log(db, room, 'humidifier', at(19, 7, 12), false);
  log(db, room, 'ac', at(19, 9), true, { setpoint: 22, mode: 'cool', fan: 'auto' });
  log(db, room, 'ac', at(19, 11, 10), true, { setpoint: 22, mode: 'fan', fan: 'auto' });
  log(db, room, 'ac', at(19, 12), false, { setpoint: 22, mode: 'fan', fan: 'auto' });
  const now = at(20, 0);
  const day = roomDays(db, room, { now, zone, count: 2 })[0];
  const usage = bucketUsage(db, db.getRoom(room.id), { from: now - 24 * H, to: now, bucketS: 300, zone });
  assert.equal(usage.metered, false);
  close(sum(usage.buckets, 'kWh'), day.kWh, 'kWh', 5e-4);
  close(sum(usage.buckets, 'waterL'), day.waterL, 'water', 5e-4);
  close(usage.totals.kWh, day.kWh, 'total kWh');
  close(usage.totals.waterL, day.waterL, 'total water');
  // 1:03 to 1:05 is the bucket of 1:00 to 1:05: 2 min of the intake (50 W) and the exhaust (40 W), and the circulation (30 W) all of it
  const b = usage.buckets.find((x) => x.at === at(19, 1, 2, 30));
  close(b.kWh, (2 / 60) * 0.09 + (5 / 60) * 0.03, 'one bucket');
});

test('the intake against the filter: the day mean pressure scales every bucket of the day', (t) => {
  const { db, room } = setup(t, { dpAddress: 7, intakeW: 100, exhaustW: 0, circulationW: 0, humidifierW: 0, acInputW: 0 });
  log(db, room, 'intake', at(19, 0), true);
  log(db, room, 'intake', at(19, 4), false);
  db.addFilterReading({ roomId: room.id, address: 7, at: at(19, 1), ok: true, pa: 200 }); // the fan's maximum: 1.15
  const now = at(20, 0);
  const day = roomDays(db, room, { now, zone, count: 2 })[0];
  const usage = bucketUsage(db, db.getRoom(room.id), { from: now - 24 * H, to: now, bucketS: 300, zone });
  close(day.kWh, 0.4 * 1.15, 'the day');
  close(sum(usage.buckets, 'kWh'), day.kWh, 'the buckets', 5e-4);
  close(usage.totals.kWh, day.kWh, 'the total');
});

test('metered: the meter steps inside each bucket, a reset skipped, a bucket without readings null', (t) => {
  const { db, room } = setup(t, { meterAddress: 30 });
  const from = at(19, 0);
  const to = from + H; // the 1 h range: 15 s buckets
  meter(db, room, from - 10_000, 100); // before the window: the base
  meter(db, room, from + 5_000, 100.005); // bucket 0
  meter(db, room, from + 10_000, 100.0075); // bucket 0
  // bucket 1 (15 to 30 s): no reading
  meter(db, room, from + 31_000, 100.01); // bucket 2
  meter(db, room, from + 46_000, 0.1); // bucket 3: a reset, held three times
  meter(db, room, from + 50_000, 0.1);
  meter(db, room, from + 55_000, 0.1);
  meter(db, room, from + 62_000, 0.102); // bucket 4
  const usage = bucketUsage(db, db.getRoom(room.id), { from, to, bucketS: 15, zone });
  assert.equal(usage.metered, true);
  assert.equal(usage.buckets.length, 241); // 240 whole buckets and the one holding `to`
  assert.deepEqual(usage.buckets.slice(0, 6).map((b) => b.kWh), [0.0075, null, 0.0025, 0, 0.002, null]);
  assert.deepEqual(usage.buckets.slice(0, 2).map((b) => b.at), [from + 7_500, from + 22_500]);
  close(usage.totals.kWh, 0.012, 'total');
});

test('metered without any reading in the range: every bucket null, the total null', (t) => {
  const { db, room } = setup(t, { meterAddress: 30 });
  const from = at(19, 0);
  const usage = bucketUsage(db, db.getRoom(room.id), { from, to: from + H, bucketS: 15, zone });
  assert.equal(usage.metered, true);
  assert.ok(usage.buckets.every((b) => b.kWh === null));
  assert.equal(usage.totals.kWh, null);
  assert.equal(usage.totals.waterL, 0);
});

test('water: the humidifier run time times its output, in the buckets it ran', (t) => {
  const { db, room } = setup(t, { humidifierLH: 3 });
  const from = at(19, 0);
  log(db, room, 'humidifier', from + 30 * 60_000, true);
  log(db, room, 'humidifier', from + 90 * 60_000, false);
  const usage = bucketUsage(db, db.getRoom(room.id), { from, to: from + 6 * H, bucketS: 60, zone });
  const wet = usage.buckets.filter((b) => b.waterL > 0);
  assert.equal(wet.length, 60);
  close(wet[0].waterL, 3 / 60, 'a minute');
  close(usage.totals.waterL, 3, 'an hour');
});

test('the range follows the history buckets: from the first edge at or after from, at the bucket middle kept inside', (t) => {
  const { db, room } = setup(t);
  const to = at(19, 10, 0, 7); // not on an edge
  const from = to - H;
  const usage = bucketUsage(db, db.getRoom(room.id), { from, to, bucketS: 15, zone });
  const b = 15_000;
  assert.equal(usage.buckets[0].at, Math.ceil(from / b) * b + b / 2);
  assert.equal(usage.buckets.at(-1).at, to); // the running bucket's middle is past now
  assert.equal(usage.buckets.length, Math.floor(to / b) - Math.ceil(from / b) + 1);
});

test('nothing ran: every bucket at 0 and the totals 0', (t) => {
  const { db, room } = setup(t, { intakeW: 0, exhaustW: 0, circulationW: 0, humidifierW: 0, humidifierLH: 0, acInputW: 0 });
  const from = at(19, 0);
  const usage = bucketUsage(db, db.getRoom(room.id), { from, to: from + 24 * H, bucketS: 300, zone });
  assert.ok(usage.buckets.every((b) => b.kWh === 0 && b.waterL === 0));
  assert.deepEqual(usage.totals, { kWh: 0, waterL: 0 });
  assert.equal(usage.metered, false);
});

test('metered buckets that are settled are read once: the next request reads only the new ones, a late reading is counted', (t) => {
  const { db, room } = setup(t, { meterAddress: 30 });
  const from = at(19, 0);
  const value = (s) => 100 + 0.001 * (s / 5 + 1);
  for (let s = 0; s < 3600; s += 5) if (s < 1800 || s >= 1815) meter(db, room, from + s * 1000, value(s)); // none 30:00 to 30:15
  let chunks = 0;
  const real = db.meterChunk;
  db.meterChunk = (...args) => { chunks++; return real.apply(db, args); };
  const ask = (to) => bucketUsage(db, db.getRoom(room.id), { from: to - H, to, bucketS: 15, zone });
  const first = ask(from + H);
  assert.ok(chunks >= 240);
  close(first.totals.kWh, 0.719, 'an hour of steps but the first');
  chunks = 0;
  const again = ask(from + H + 2_000);
  assert.ok(chunks <= 8, `${chunks} chunks read again`);
  assert.deepEqual(again.buckets.slice(0, -6), first.buckets.slice(1, -6)); // the window moved on one bucket
  const bucket = (u, minute, second) => u.buckets.find((x) => x.at === from + minute * 60_000 + second * 1000 + 7_500).kWh;
  assert.equal(bucket(again, 30, 0), null);
  close(bucket(again, 30, 15), 0.004 + 0.002, 'the step over the gap and two more');
  meter(db, room, from + 1807_000, value(1795) + 0.0015); // late, inside a settled bucket
  const late = ask(from + H + 3_000);
  close(bucket(late, 30, 0), 0.0015, 'the late reading');
  close(bucket(late, 30, 15), 0.0025 + 0.002, 'the step after it and two more');
});

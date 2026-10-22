// The intake fan's estimate against its filter (spec 2026-10-22-filter-design.md 6): with a filter pressure sensor the
// day's mean counted pressure raises the intake's watts (sim-power.js fanWattFactor); without one, the rating as before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { fixedZone, roomUsage, estimateDay } from '../server/usage.js';

const zone = fixedZone(480);
const H = 3_600_000;
const at = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour - 8, minute); // local time, UTC+8
const NOW = at(20, 10);
const PRICES = { electricity: 0.5, water: null };
const fields = { name: 'A', length: 6, width: 4, height: 2.5, intakeW: 100, exhaustW: 100 };

function setup(t, room = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, room: db.createRoom({ ...fields, ...room }, at(1, 0)) };
}
const log = (db, room, machine, time, on = true) => db.logMachine(room.id, machine, { on }, 'auto', time);

test('estimateDay: the intake times the factor, the other machines as rated', () => {
  const ms = { intake: { on: H }, exhaust: { on: H } };
  const est = estimateDay(ms, { ...fields, circulationW: 0, humidifierW: 0, dehumidifierW: 0, acInputW: 0 }, 1.075);
  assert.equal(est.intake, 0.1075);
  assert.equal(est.exhaust, 0.1);
  assert.equal(estimateDay(ms, { ...fields, circulationW: 0, humidifierW: 0, dehumidifierW: 0, acInputW: 0 }).intake, 0.1);
});

test('a day with counted pressure: intake kWh × fanWattFactor(mean Pa, clean, max)', (t) => {
  const { db, room } = setup(t, { dpAddress: 7 });
  log(db, room, 'intake', at(19, 0));
  log(db, room, 'exhaust', at(19, 0));
  log(db, room, 'intake', at(19, 2), false);
  log(db, room, 'exhaust', at(19, 2), false);
  db.addFilterReading({ roomId: room.id, address: 7, at: at(19, 0, 0) + 30_000, ok: true, pa: 2 }); // spin-up: not counted
  db.addFilterReading({ roomId: room.id, address: 7, at: at(19, 1), ok: true, pa: 110 });
  db.addFilterReading({ roomId: room.id, address: 7, at: at(19, 1, 30), ok: true, pa: 130 });
  db.addFilterReading({ roomId: room.id, address: 7, at: at(19, 3), ok: true, pa: 1 }); // intake off: not counted
  const day = roomUsage(db, room.id, { days: 2, prices: PRICES, now: NOW, zone }).days[0];
  // mean 120 Pa: 1 + 0.15 × (120 − 40) / (200 − 40) = 1.075; 2 h × 100 W = 0.2 kWh
  assert.equal(day.byMachine.intake, 0.215);
  assert.equal(day.byMachine.exhaust, 0.2);
  assert.equal(day.kWh, 0.415);
});

test('without a sensor, or a day without a counted reading, the intake is at its rating', (t) => {
  const { db, room } = setup(t);
  log(db, room, 'intake', at(19, 0));
  log(db, room, 'intake', at(19, 2), false);
  assert.equal(roomUsage(db, room.id, { days: 2, prices: PRICES, now: NOW, zone }).days[0].byMachine.intake, 0.2);
  const s = setup(t, { dpAddress: 7 });
  log(s.db, s.room, 'intake', at(19, 0));
  log(s.db, s.room, 'intake', at(19, 2), false);
  assert.equal(roomUsage(s.db, s.room.id, { days: 2, prices: PRICES, now: NOW, zone }).days[0].byMachine.intake, 0.2);
});

test('a reading written into a worked-out day makes it count again', (t) => {
  const { db, room } = setup(t, { dpAddress: 7 });
  log(db, room, 'intake', at(18, 0));
  log(db, room, 'intake', at(18, 2), false);
  const first = roomUsage(db, room.id, { days: 3, prices: PRICES, now: NOW, zone }).days[0];
  assert.equal(first.byMachine.intake, 0.2);
  db.addFilterReading({ roomId: room.id, address: 7, at: at(18, 1), ok: true, pa: 200 }); // 1.15
  assert.equal(roomUsage(db, room.id, { days: 3, prices: PRICES, now: NOW, zone }).days[0].byMachine.intake, 0.23);
});

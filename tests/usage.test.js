// Energy and water usage: run time cut at local midnights, estimates, metered energy, totals and costs.
// Time zone: UTC+8 without daylight saving (fixedZone), so the days are the same wherever the tests run.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import {
  fixedZone, localZone, dayWindows, runIntervals, msPerDay, meteredDays, totals, roomUsage, farmUsage,
} from '../server/usage.js';

const zone = fixedZone(480);
const H = 3_600_000;
// A local time of the days 2026-10-19 and 2026-10-20 (UTC+8).
const at = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour - 8, minute);
const NOW = at(20, 10); // 10:00 on the 20th
const PRICES = { electricity: 0.5, water: null };
const fields = { name: 'A', length: 6, width: 4, height: 2.5 };

function setup(t, room = {}) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return { db, room: db.createRoom({ ...fields, ...room }) };
}
const on = (db, room, machine, time, state = true, extra = {}) => db.logMachine(room.id, machine, { on: state, ...extra }, 'auto', time);

test('days are local calendar days, today ends at now', () => {
  const days = dayWindows(NOW, 3, zone);
  assert.deepEqual(days.map((d) => d.date), ['2026-10-18', '2026-10-19', '2026-10-20']);
  assert.equal(days[2].start, at(20, 0));
  assert.equal(days[1].end, at(20, 0));
  assert.equal(days[2].end, NOW);
});

test('the server time zone has days that follow the calendar even where a day is 23 hours long', () => {
  const was = process.env.TZ;
  process.env.TZ = 'America/New_York'; // clocks went forward on 2026-03-08
  try {
    const days = dayWindows(Date.UTC(2026, 2, 9, 12), 3, localZone);
    assert.deepEqual(days.map((d) => d.date), ['2026-03-07', '2026-03-08', '2026-03-09']);
    assert.equal(days[1].end - days[1].start, 23 * H);
    assert.equal(days[2].start, days[1].end);
  } finally {
    if (was === undefined) delete process.env.TZ;
    else process.env.TZ = was;
  }
});

test('run intervals: on and off, cut to the window, a machine on at the end counts to the end', () => {
  const rows = [{ at: 100, on: true }, { at: 200, on: false }, { at: 300, on: true }];
  assert.deepEqual(runIntervals(rows, 0, 1000, 'intake'), [{ start: 100, end: 200, kind: 'on' }, { start: 300, end: 1000, kind: 'on' }]);
  assert.deepEqual(runIntervals(rows, 150, 350, 'intake'), [{ start: 150, end: 200, kind: 'on' }, { start: 300, end: 350, kind: 'on' }]);
  assert.deepEqual(runIntervals([], 0, 10, 'intake'), []);
});

test('the aircon: cool, dry and heat are full, fan is its own kind, off is nothing', () => {
  const rows = [
    { at: 0, on: true, mode: 'cool' }, { at: 10, on: true, mode: 'fan' }, { at: 20, on: false, mode: 'fan' },
    { at: 30, on: true, mode: 'heat' }, { at: 40, on: true, mode: 'dry' },
  ];
  assert.deepEqual(runIntervals(rows, 0, 50, 'ac').map((i) => [i.start, i.end, i.kind]), [
    [0, 10, 'full'], [10, 20, 'fan'], [30, 40, 'full'], [40, 50, 'full'],
  ]);
});

test('run time is split at midnight', () => {
  const days = dayWindows(NOW, 2, zone);
  const per = msPerDay([{ start: at(19, 22), end: at(20, 2), kind: 'on' }], days);
  assert.deepEqual(per, [{ on: 2 * H }, { on: 2 * H }]);
});

test('estimated energy: the dehumidifier counts its rating times its run time, in the day and the totals', (t) => {
  const { db, room } = setup(t, { dehumidifier: true, dehumidifierW: 400 });
  on(db, room, 'dehumidifier', at(20, 7)); // still on at 10:00: 3 h
  const usage = roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone });
  assert.deepEqual(usage.days[0].byMachine, { intake: 0, exhaust: 0, circulation: 0, humidifier: 0, dehumidifier: 1.2, ac: 0, rest: 0 });
  assert.equal(usage.days[0].kWh, 1.2);
  assert.equal(usage.today.kWh, 1.2);
  assert.equal(usage.days[0].waterL, 0, 'the live water is the humidifier only');
});

test('estimated energy: run time times the rating, across midnight', (t) => {
  const { db, room } = setup(t, { intakeW: 100, humidifierW: 200, humidifierLH: 3 });
  on(db, room, 'intake', at(19, 22));
  on(db, room, 'intake', at(20, 2), false);
  on(db, room, 'humidifier', at(20, 8)); // still on at 10:00: counts 2 h
  const usage = roomUsage(db, room.id, { days: 2, prices: PRICES, now: NOW, zone });
  assert.deepEqual(usage.days.map((d) => d.date), ['2026-10-19', '2026-10-20']);
  assert.equal(usage.days[0].kWh, 0.2); // 2 h x 100 W
  assert.deepEqual(usage.days[1].byMachine, { intake: 0.2, exhaust: 0, circulation: 0, humidifier: 0.4, dehumidifier: 0, ac: 0, rest: 0 });
  assert.equal(usage.days[1].kWh, 0.6);
  assert.equal(usage.days[1].metered, false);
  assert.equal(usage.days[1].waterL, 6); // 2 h x 3 L/h
  assert.equal(usage.days[0].waterL, 0);
});

test('aircon estimate: rated input while cooling, 5 % in fan mode', (t) => {
  const { db, room } = setup(t, { acInputW: 1000 });
  on(db, room, 'ac', at(20, 0), true, { mode: 'cool', setpoint: 22, fan: 'auto' });
  on(db, room, 'ac', at(20, 4), true, { mode: 'fan', setpoint: 22, fan: 'auto' });
  on(db, room, 'ac', at(20, 6), false, { mode: 'fan', setpoint: 22, fan: 'auto' });
  const today = roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone }).days[0];
  assert.equal(today.byMachine.ac, 4.1); // 4 h x 1 kW + 2 h x 50 W
  assert.equal(today.kWh, 4.1);
});

test('the log before the window sets the state at its start', (t) => {
  const { db, room } = setup(t, { intakeW: 1000 });
  on(db, room, 'intake', at(1, 12)); // on since the 1st, never turned off
  const usage = roomUsage(db, room.id, { days: 2, prices: PRICES, now: NOW, zone });
  assert.equal(usage.days[0].kWh, 24); // the whole 19th
  assert.equal(usage.days[1].kWh, 10); // up to 10:00
  assert.equal(usage.last30.kWh, 12 + 24 * 18 + 10); // from noon on the 1st
});

test('metered days: the increases between good readings, to the day of the later reading, a lower reading counts nothing', () => {
  const days = dayWindows(NOW, 2, zone);
  const r = (time, energy, extra) => ({ at: time, energy, ...extra });
  const out = meteredDays([
    r(at(19, 20), 100, { before: true }), r(at(19, 23), 101), r(at(20, 1), 103), r(at(20, 2), 5), r(at(20, 3), 6.5),
  ], days);
  assert.deepEqual(out, [{ kWh: 1, readings: 1 }, { kWh: 2, readings: 3 }]); // 5 and 6.5 are below 103 and have not held for 3
});

test('a metered day uses the meter; rest is the meter minus the fans and humidifier; the aircon estimate is replaced', (t) => {
  const { db, room } = setup(t, { meterAddress: 30, intakeW: 1000, acInputW: 5000 });
  on(db, room, 'intake', at(20, 0));
  on(db, room, 'intake', at(20, 1), false); // 1 kWh
  on(db, room, 'ac', at(20, 0), true, { mode: 'cool', setpoint: 22, fan: 'auto' });
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 0, 5), ok: true, powerW: 1, energyKwh: 50 });
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 5), ok: true, powerW: 1, energyKwh: 53.5 });
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 6), ok: false, error: 'timeout' }); // not counted
  const today = roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone }).days[0];
  assert.equal(today.metered, true);
  assert.equal(today.kWh, 3.5);
  assert.deepEqual(today.byMachine, { intake: 1, exhaust: 0, circulation: 0, humidifier: 0, dehumidifier: 0, ac: 0, rest: 2.5 });
});

test('rest is never negative; a day with one good reading is estimated', (t) => {
  const { db, room } = setup(t, { meterAddress: 30, intakeW: 1000 });
  on(db, room, 'intake', at(20, 0));
  on(db, room, 'intake', at(20, 4), false); // 4 kWh estimated
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 1), ok: true, powerW: 1, energyKwh: 10 });
  let today = roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone }).days[0];
  assert.equal(today.metered, false);
  assert.equal(today.kWh, 4);
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 2), ok: true, powerW: 1, energyKwh: 11 });
  today = roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone }).days[0];
  assert.equal(today.metered, true);
  assert.equal(today.kWh, 1);
  assert.equal(today.byMachine.rest, 0); // metered 1 kWh is less than the 4 kWh of fan estimates
});

test('a room without a meter is never metered, even with old readings', (t) => {
  const { db, room } = setup(t, { meterAddress: 30 });
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 1), ok: true, powerW: 1, energyKwh: 10 });
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 2), ok: true, powerW: 1, energyKwh: 11 });
  db.updateRoom(room.id, { ...fields });
  assert.equal(roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone }).days[0].metered, false);
});

test('totals: today, 7 and 30 days with cost, water cost only with a water price, metered only when every day is', (t) => {
  const { db, room } = setup(t, { intakeW: 1000, humidifierW: 0, humidifierLH: 10 });
  on(db, room, 'intake', at(15, 0));
  on(db, room, 'intake', at(15, 1), false); // 1 kWh five days ago
  on(db, room, 'intake', at(20, 0));
  on(db, room, 'intake', at(20, 2), false); // 2 kWh today
  on(db, room, 'humidifier', at(20, 9)); // 1 h on: 10 L
  const usage = roomUsage(db, room.id, { days: 1, prices: { electricity: 0.55, water: 2 }, now: NOW, zone });
  assert.deepEqual(usage.prices, { electricity: 0.55, water: 2 });
  assert.equal(usage.days.length, 1);
  assert.deepEqual(usage.today, { kWh: 2, cost: 1.1, waterL: 10, waterCost: 0.02, metered: false });
  assert.deepEqual(usage.last7, { kWh: 3, cost: 1.65, waterL: 10, waterCost: 0.02, metered: false });
  assert.equal(usage.last30.kWh, 3);
  const free = roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone });
  assert.equal(free.today.waterCost, null);
});

test('totals of no days are zero and not metered', () => {
  assert.deepEqual(totals([], PRICES), { kWh: 0, cost: 0, waterL: 0, waterCost: null, metered: false });
});

test('days: the number of days returned follows the query, the totals do not', (t) => {
  const { db, room } = setup(t);
  assert.equal(roomUsage(db, room.id, { days: 90, prices: PRICES, now: NOW, zone }).days.length, 90);
  assert.equal(roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone }).days.length, 1);
  assert.equal(roomUsage(db, 99, { days: 1, prices: PRICES, now: NOW, zone }), null);
});

test('the farm: days summed over the rooms, a line per room', (t) => {
  const { db, room } = setup(t, { intakeW: 1000 });
  const other = db.createRoom({ ...fields, name: 'B', exhaustW: 500, meterAddress: 31 });
  on(db, room, 'intake', at(20, 0));
  on(db, room, 'intake', at(20, 1), false);
  on(db, other, 'exhaust', at(20, 0));
  on(db, other, 'exhaust', at(20, 2), false);
  const farm = farmUsage(db, { days: 2, prices: PRICES, now: NOW, zone });
  assert.equal(farm.days.length, 2);
  assert.equal(farm.days[1].kWh, 2);
  assert.equal(farm.days[1].byMachine.intake, 1);
  assert.equal(farm.days[1].byMachine.exhaust, 1);
  assert.equal(farm.days[1].metered, false); // room A has no meter
  assert.deepEqual(farm.today, { kWh: 2, cost: 1, waterL: 0, waterCost: null, metered: false });
  assert.deepEqual(farm.rooms.map((r) => [r.id, r.name, r.today.kWh, r.last30.kWh]), [[1, 'A', 1, 1], [2, 'B', 1, 1]]);
  assert.deepEqual(Object.keys(farm), ['prices', 'days', 'today', 'last7', 'last30', 'rooms']);
});

test('a farm without rooms has zero days', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const farm = farmUsage(db, { days: 3, prices: PRICES, now: NOW, zone });
  assert.deepEqual(farm.days.map((d) => d.kWh), [0, 0, 0]);
  assert.deepEqual(farm.rooms, []);
  assert.equal(farm.last30.metered, false);
});

test('a range is metered when every day that used anything is metered; empty days before the data do not count', async () => {
  const { totals } = await import('../server/usage.js');
  const prices = { electricity: 0.55, water: null };
  const empty = { kWh: 0, metered: false, waterL: 0 };
  assert.equal(totals([empty, empty, { kWh: 2, metered: true, waterL: 0 }], prices).metered, true);
  assert.equal(totals([{ kWh: 1, metered: false, waterL: 0 }, { kWh: 2, metered: true, waterL: 0 }], prices).metered, false);
  assert.equal(totals([empty, empty], prices).metered, false);
});

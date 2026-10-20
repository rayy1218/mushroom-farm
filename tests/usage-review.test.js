// Review fixes for iteration 7 usage: the metered total ignores glitches, the caches of completed days, the unwired
// machine, byMachine adding up, and the speed with many one-second readings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../server/db.js';
import { fixedZone, dayWindows, meteredDays, roomUsage, farmUsage, warmUsage } from '../server/usage.js';

const zone = fixedZone(480);
const at = (day, hour, minute = 0, second = 0) => Date.UTC(2026, 9, day, hour - 8, minute, second);
const NOW = at(20, 10);
const PRICES = { electricity: 0.5, water: null };
const fields = { name: 'A', length: 6, width: 4, height: 2.5 };

// 1 s readings from `start`, the energy of each given.
const series = (start, values) => values.map((energy, i) => ({ at: start + i * 1000, energy }));
const total = (rows) => meteredDays(rows, dayWindows(NOW, 1, zone))[0].kWh;
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('a glitch to 0 and back does not count the whole total again', () => {
  near(total(series(at(20, 1), [5000, 5000.01, 0, 0, 5000.01, 5000.02])), 0.02);
  near(total(series(at(20, 1), [5000, 0, 5000, 5000])), 0);
});

test('a real reset to 0 continues from there once it has held for 3 readings', () => {
  // 5000 to 5000.01 counts; 0, 0.005, 0.01 are the low readings and the third becomes the base; two more steps count.
  near(total(series(at(20, 1), [5000, 5000.01, 0, 0.005, 0.01, 0.015, 0.025])), 0.025);
});

test('a swap to a meter with a higher total: the first step is implausible and skipped', () => {
  near(total(series(at(20, 1), [100, 100.01, 9000, 9000.01, 9000.02])), 0.03);
});

test('a step larger than 100 kW over the elapsed time is skipped, one inside it counts', () => {
  near(total([{ at: at(20, 1), energy: 10 }, { at: at(20, 2), energy: 109 }, { at: at(20, 3), energy: 209 }]), 199);
  near(total([{ at: at(20, 1), energy: 10 }, { at: at(20, 2), energy: 111 }]), 0);
});

test('normal increments across midnight go to the day of the later reading', () => {
  const out = meteredDays([
    { at: at(19, 23, 59, 59), energy: 100, before: true }, { at: at(20, 0, 0, 1), energy: 100.02 }, { at: at(20, 0, 0, 2), energy: 100.03 },
  ], dayWindows(NOW, 2, zone));
  assert.deepEqual(out.map((d) => d.readings), [0, 2]);
  near(out[1].kWh, 0.03);
});

test('byMachine adds up to kWh when the estimates exceed the metered energy', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ ...fields, meterAddress: 30, intakeW: 1000, exhaustW: 1000, humidifierW: 2000 });
  db.logMachine(room.id, 'intake', { on: true }, 'auto', at(20, 0));
  db.logMachine(room.id, 'exhaust', { on: true }, 'auto', at(20, 0));
  db.logMachine(room.id, 'humidifier', { on: true }, 'auto', at(20, 0)); // 10 + 10 + 20 kWh estimated by 10:00
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 1), ok: true, energyKwh: 100 });
  db.addMeterReading({ roomId: room.id, address: 30, at: at(20, 9), ok: true, energyKwh: 108 });
  const today = roomUsage(db, room.id, { days: 1, prices: PRICES, now: NOW, zone }).days[0];
  assert.equal(today.kWh, 8);
  assert.equal(today.byMachine.rest, 0);
  near(Object.values(today.byMachine).reduce((a, b) => a + b, 0), 8);
  assert.equal(today.byMachine.humidifier, 4);
  assert.equal(today.byMachine.intake, 2);
});

test('an unwired aircon stops being charged', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ ...fields, acAddress: 4, acInputW: 1000 }, at(18, 0));
  db.logMachine(room.id, 'ac', { on: true, setpoint: 22, mode: 'cool', fan: 'auto' }, 'manual', at(19, 0));
  db.updateRoom(room.id, { ...fields, acAddress: null, acInputW: 1000 }, at(19, 12));
  const usage = roomUsage(db, room.id, { days: 2, prices: PRICES, now: NOW, zone });
  assert.equal(usage.days[0].kWh, 12);
  assert.equal(usage.days[1].kWh, 0);
});

test('completed days are kept: the same answer, and a change of the room or a late row works them out again', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ ...fields, meterAddress: 30, intakeW: 1000 }, at(1, 0));
  const add = (time, energyKwh) => db.addMeterReading({ roomId: room.id, address: 30, at: time, ok: true, energyKwh });
  add(at(19, 1), 10); add(at(19, 5), 12);
  db.logMachine(room.id, 'intake', { on: true }, 'auto', at(19, 6));
  db.logMachine(room.id, 'intake', { on: false }, 'auto', at(19, 8));
  const ask = () => roomUsage(db, room.id, { days: 2, prices: PRICES, now: NOW, zone }).days;
  const first = ask();
  assert.equal(first[0].kWh, 2);
  assert.equal(first[0].byMachine.intake, 2);
  assert.deepEqual(ask(), first);
  add(at(19, 3), 11); // arrives late, inside a completed day: 10, 11, 12
  assert.equal(ask()[0].kWh, 2);
  add(at(19, 6), 13); // a late reading after the others
  assert.equal(ask()[0].kWh, 3);
  db.updateRoom(room.id, { ...fields, meterAddress: null, intakeW: 500 }, at(20, 5));
  const after = ask();
  assert.equal(after[0].metered, false);
  assert.equal(after[0].byMachine.intake, 1); // the new rating
  db.logMachine(room.id, 'intake', { on: true }, 'auto', at(19, 20)); // late: a settled day changes
  assert.ok(ask()[0].byMachine.intake > 1);
});

// Rows are written through a second connection in one transaction: 260k inserts in a moment.
test('with 3 days of one-second readings the second request is fast, a new reading keeps it so', { timeout: 30_000 }, (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-perf-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'perf.db');
  const db = openDb(path);
  t.after(() => db.close());
  const room = db.createRoom({ ...fields, meterAddress: 30, intakeW: 1000 }, at(1, 0));
  const first = at(20, 10) - 3 * 86_400_000;
  const raw = new DatabaseSync(path);
  const insert = raw.prepare('INSERT INTO meter_readings (room_id, address, at, ok, power_w, energy_kwh) VALUES (?, 30, ?, 1, 1500, ?)');
  raw.exec('BEGIN');
  for (let i = 0; i <= 3 * 86_400; i++) insert.run(room.id, first + i * 1000, 100 + i * 0.0004);
  raw.exec('COMMIT');
  raw.close();
  const ask = () => {
    const began = performance.now();
    const usage = roomUsage(db, room.id, { days: 30, prices: PRICES, now: NOW, zone });
    return { ms: performance.now() - began, usage };
  };
  const cold = ask();
  const warm = ask();
  assert.deepEqual(warm.usage, cold.usage);
  assert.ok(warm.ms < 200, `warm ${warm.ms} ms`);
  assert.ok(cold.ms < 5000, `cold ${cold.ms} ms`);
  const day = cold.usage.days.at(-1);
  assert.equal(day.metered, true);
  assert.equal(day.kWh, 14.4); // 36001 readings from midnight to 10:00, each with the increase from the one before: 14.4004
  db.addMeterReading({ roomId: room.id, address: 30, at: NOW + 1000, ok: true, powerW: 1, energyKwh: 100 + (3 * 86_400 + 1) * 0.0004 });
  const began = performance.now();
  roomUsage(db, room.id, { days: 30, prices: PRICES, now: NOW + 1000, zone });
  const next = { ms: performance.now() - began };
  assert.ok(next.ms < 200, `after a new reading ${next.ms} ms`);
  const farm = (() => { const began = performance.now(); farmUsage(db, { days: 30, prices: PRICES, now: NOW + 1000, zone }); return performance.now() - began; })();
  assert.ok(farm < 200, `farm ${farm} ms`);
});

test('warming works the last 30 days out of every room, a day at a time, and the answer is the same', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const room = db.createRoom({ ...fields, intakeW: 1000 }, at(1, 0));
  db.logMachine(room.id, 'intake', { on: true }, 'auto', at(19, 0));
  db.logMachine(room.id, 'intake', { on: false }, 'auto', at(19, 2));
  await warmUsage(db, { now: NOW, zone });
  assert.equal(db.usageDays(room.id).size, 30);
  assert.equal(roomUsage(db, room.id, { days: 30, prices: PRICES, now: NOW, zone }).days.at(-2).kWh, 2);
});

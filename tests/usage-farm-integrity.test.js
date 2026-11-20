// The farm's Energy card (spec 2026-11-12-data-integrity-design.md 7.1, 9; G17, G18): each room-day priced and rounded on its
// own, so the farm's RM is the sum of its rooms' to the sen; the farm's days carry the measured, estimated and unseen parts.
// Made-up figures. Time zone UTC+8 (fixedZone).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { fixedZone, farmUsage } from '../server/usage.js';

const zone = fixedZone(480);
const at = (day, hour, minute = 0) => Date.UTC(2026, 9, day, hour - 8, minute);
const NOW = at(20, 10);
const PRICES = { electricity: 0.55, water: null };
const fields = { length: 6, width: 4, height: 2.5 };
const on = (db, room, machine, time, state = true) => db.logMachine(room.id, machine, { on: state }, 'auto', time);

test('G18: the farm\'s RM is its rooms\' RM, each room-day rounded; its days say what is estimated', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  // two rooms with no sensors (always seen), each 1.010 kWh of estimate on the 19th and the 20th: RM 0.5555 a room-day
  const a = db.createRoom({ ...fields, name: 'A', intakeW: 1010 });
  const b = db.createRoom({ ...fields, name: 'B', exhaustW: 1010 });
  for (const day of [19, 20]) {
    on(db, a, 'intake', at(day, 1));
    on(db, a, 'intake', at(day, 2), false);
    on(db, b, 'exhaust', at(day, 3));
    on(db, b, 'exhaust', at(day, 4), false);
  }
  const farm = farmUsage(db, { days: 2, prices: PRICES, now: NOW, zone });
  const sum = (key, period) => Math.round(farm.rooms.reduce((s, r) => s + r[period][key], 0) * 100) / 100;
  assert.equal(farm.today.cost, 1.12, 'RM 0.56 a room (not 2.020 kWh × 0.55 = RM 1.11)');
  assert.equal(farm.today.cost, sum('cost', 'today'));
  assert.equal(farm.last30.cost, 2.24);
  assert.equal(farm.last30.cost, sum('cost', 'last30'));
  assert.equal(farm.last30.estimated, 2.24);
  assert.equal(farm.last7.cost, 2.24);
  assert.equal(farm.today.kWh, 2.02);
  assert.equal(farm.today.metered, false);
  const day = farm.days[1];
  assert.deepEqual([day.kWh, day.kWhMeasured, day.kWhEstimated, day.unseenMs], [2.02, 0, 2.02, 0]);
  assert.deepEqual(Object.keys(farm.today), ['kWh', 'cost', 'estimated', 'waterL', 'waterCost', 'metered']);
});

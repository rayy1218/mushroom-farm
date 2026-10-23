// The room's filter settings and filter pressure sensor address (spec 2026-10-22-filter-design.md section 3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRoom, FILTER } from '../server/rooms.js';

const BASE = { name: 'Room 1', length: 6, width: 4, height: 2.5 };

test('the four filter settings with their defaults, ranges and units', () => {
  assert.deepEqual(FILTER.map((f) => [f.field, f.default, f.min, f.max, f.unit]), [
    ['fanMaxPa', 200, 20, 2000, 'Pa'],
    ['filterCleanPa', 40, 5, 1000, 'Pa'],
    ['filterFinalPa', 80, 5, 2000, 'Pa'],
    ['filterChangeDays', 30, 0, 365, 'days'],
  ]);
});

test('filter settings left out stay out (an update keeps the stored ones, a new room gets the defaults)', () => {
  const { room } = validateRoom(BASE);
  for (const f of FILTER) assert.equal(f.field in room, false, f.field);
  assert.equal(room.dpAddress, null);
});

test('given filter settings are kept; null counts as left out', () => {
  const { room } = validateRoom({ ...BASE, fanMaxPa: 300, filterCleanPa: 30, filterFinalPa: 120, filterChangeDays: 0, dpAddress: 9 });
  assert.deepEqual([room.fanMaxPa, room.filterCleanPa, room.filterFinalPa, room.filterChangeDays, room.dpAddress], [300, 30, 120, 0, 9]);
  assert.equal('fanMaxPa' in validateRoom({ ...BASE, fanMaxPa: null }).room, false);
});

test('each filter setting must be a whole number in its range', () => {
  const cases = [
    ['fanMaxPa', 19, 'Intake fan maximum pressure must be a whole number from 20 to 2000 Pa'],
    ['fanMaxPa', 200.5, 'Intake fan maximum pressure must be a whole number from 20 to 2000 Pa'],
    ['filterCleanPa', 1001, 'Clean filter pressure drop must be a whole number from 5 to 1000 Pa'],
    ['filterFinalPa', 2001, 'Filter change pressure must be a whole number from 5 to 2000 Pa'],
    ['filterChangeDays', -1, 'Change the filter every must be a whole number from 0 to 365 days'],
    ['filterChangeDays', '30', 'Change the filter every must be a whole number from 0 to 365 days'],
  ];
  for (const [field, value, error] of cases) assert.deepEqual(validateRoom({ ...BASE, [field]: value }), { error, field });
});

test('the fan must push above the clean filter, and the change pressure must be above the clean one and below the fan maximum', () => {
  assert.deepEqual(validateRoom({ ...BASE, fanMaxPa: 40, filterCleanPa: 40 }), {
    error: "Fan maximum pressure must be above the clean filter's pressure drop", field: 'fanMaxPa',
  });
  assert.deepEqual(validateRoom({ ...BASE, filterCleanPa: 60, filterFinalPa: 60 }), {
    error: "Filter change pressure must be above the clean filter's pressure drop", field: 'filterFinalPa',
  });
  assert.deepEqual(validateRoom({ ...BASE, fanMaxPa: 150, filterFinalPa: 150 }), {
    error: "Filter change pressure must be below the fan's maximum pressure", field: 'filterFinalPa',
  });
  // A value left out is compared as its default (the pages send all four).
  assert.equal(validateRoom({ ...BASE, filterCleanPa: 150 }).field, 'filterFinalPa');
  assert.equal(validateRoom({ ...BASE, filterFinalPa: 200 }).error, "Filter change pressure must be below the fan's maximum pressure");
  assert.equal(validateRoom({ ...BASE, fanMaxPa: 400, filterCleanPa: 190, filterFinalPa: 300 }).room.filterCleanPa, 190);
});

test('the filter pressure sensor address: 1 to 247, and not one of the room\'s other addresses', () => {
  assert.deepEqual(validateRoom({ ...BASE, dpAddress: 0 }), { error: 'Filter pressure sensor address must be a whole number from 1 to 247', field: 'dpAddress' });
  assert.deepEqual(validateRoom({ ...BASE, trhAddress: 5, dpAddress: 5 }), { error: 'The devices in a room need different addresses', field: 'dpAddress' });
});

// The costs' figures (spec 2026-11-05-costs-design.md 2.1 and 4), pure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  lastDayOf, addMonths, monthName, chargeDate, chargesOf, runOn, blockDays, split,
} from '../server/costs-math.js';

export const cost = (over = {}) => ({
  id: 1, date: '2026-11-01', category: 'rent', amount: 100, roomId: null, runId: null, note: '', repeat: null,
  repeatUntil: null, worker: null, utility: null, periodFrom: null, periodTo: null, ...over,
});
export const run = (over = {}) => ({ id: 1, roomId: 1, startDate: '2026-10-01', endDate: null, blocks: 100, ...over });

test('months: the last day, a month on, the name', () => {
  assert.equal(lastDayOf('2026-02'), '2026-02-28');
  assert.equal(lastDayOf('2024-02'), '2024-02-29');
  assert.equal(lastDayOf('2026-11'), '2026-11-30');
  assert.equal(addMonths('2026-11', 2), '2027-01');
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(monthName('2026-11'), 'Nov 2026');
});

test('a monthly item charges on its day, the month\'s last when shorter', () => {
  assert.equal(chargeDate('2026-01-31', '2026-02'), '2026-02-28');
  assert.equal(chargeDate('2026-10-31', '2026-11'), '2026-11-30');
  assert.equal(chargeDate('2026-10-05', '2026-12'), '2026-12-05');
});

test('the charges of a cost in a range: none in the future, none after its last month', () => {
  const today = '2026-11-15';
  const rent = cost({ date: '2026-08-31', repeat: 'monthly' });
  assert.deepEqual(chargesOf(rent, '2026-08-01', '2026-12-31', today).map((c) => c.date), ['2026-08-31', '2026-09-30', '2026-10-31'],
    'not 30 Nov: after today');
  assert.deepEqual(chargesOf({ ...rent, repeatUntil: '2026-09' }, '2026-01-01', '2026-12-31', today).map((c) => c.date), ['2026-08-31', '2026-09-30']);
  assert.deepEqual(chargesOf(rent, '2026-10-01', '2026-10-31', today).map((c) => c.date), ['2026-10-31']);
  assert.deepEqual(chargesOf(rent, '2026-07-01', '2026-07-31', today), [], 'before it starts');
  const one = cost({ date: '2026-11-03' });
  assert.deepEqual(chargesOf(one, '2026-11-01', '2026-11-30', today).map((c) => c.date), ['2026-11-03']);
  assert.deepEqual(chargesOf(one, '2026-10-01', '2026-10-31', today), []);
  assert.equal(chargesOf(one, '2026-11-01', '2026-11-30', today)[0].cost, one);
});

test('the run of a room on a day: the later one on the day one ends and the next starts', () => {
  const today = '2026-11-15';
  const runs = [run({ id: 1, endDate: '2026-11-03' }), run({ id: 2, startDate: '2026-11-03' }), run({ id: 3, roomId: 2 })];
  assert.equal(runOn(runs, 1, '2026-11-02', today).id, 1);
  assert.equal(runOn(runs, 1, '2026-11-03', today).id, 2);
  assert.equal(runOn(runs, 1, '2026-09-30', today), null);
  assert.equal(runOn(runs, 2, '2026-11-15', today).id, 3);
  assert.equal(runOn(runs, 2, '2026-11-16', today), null, 'an open run reaches today, not past it');
});

test('block-days: blocks × the days open in the range, both ends counted', () => {
  const today = '2026-11-15';
  assert.equal(blockDays(run({ startDate: '2026-10-25' }), '2026-11-01', '2026-11-30', today), 1500, '15 days to today');
  assert.equal(blockDays(run({ startDate: '2026-10-25' }), '2026-10-01', '2026-10-31', today), 700);
  assert.equal(blockDays(run({ startDate: '2026-10-25', endDate: '2026-11-03' }), '2026-11-01', '2026-11-30', today), 300);
  assert.equal(blockDays(run({ startDate: '2026-12-01' }), '2026-11-01', '2026-11-30', today), 0);
});

test('split: shares to 2 places, the last taking the remainder', () => {
  assert.deepEqual(split(100, [1, 2]), [33.33, 66.67]);
  assert.deepEqual(split(10, [1, 1, 1]), [3.33, 3.33, 3.34]);
  assert.deepEqual(split(300, [1500, 2000]), [128.57, 171.43]);
});

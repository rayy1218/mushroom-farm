// The task rules (server/task-rules.js, spec 2026-10-30-tasks-design.md sections 3 and 4): the farm's day, the stage day,
// the daily rules a room wants on a day, the owner's changes and the upkeep conditions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localDate, localTime, dayStart, addDays, daysBetween, stageDayOn } from '../server/task-rules.js';
import { PROGRAM_DEFAULTS } from '../server/program.js';

const at = (iso) => Date.parse(iso);
const START = at('2026-10-30T09:15:00+08:00'); // a stage started on 30 Oct, farm time
const prog = (extra = {}) => ({ ...PROGRAM_DEFAULTS, farmType: 'full', crops: [{ crop: 'oyster', blocks: 100 }], stageSince: START, ...extra });

test('the farm day is Kuala Lumpur time whatever the host clock', () => {
  assert.equal(localDate(at('2026-10-29T16:00:00Z')), '2026-10-30'); // 00:00 farm time
  assert.equal(localDate(at('2026-10-29T15:59:59Z')), '2026-10-29');
  assert.equal(localTime(at('2026-10-30T01:12:00Z')), '09:12');
  assert.equal(dayStart('2026-10-30'), at('2026-10-30T00:00:00+08:00'));
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
  assert.equal(daysBetween('2026-11-02', '2026-10-30'), -3);
});

test('stageDayOn: day 1 is the farm date of the stage start, not capped; null without a start', () => {
  assert.deepEqual(stageDayOn(prog({ stage: 'fruiting' }), '2026-10-30'), { day: 1, length: 7 });
  assert.deepEqual(stageDayOn(prog({ stage: 'fruiting' }), '2026-11-05'), { day: 7, length: 7 });
  assert.deepEqual(stageDayOn(prog({ stage: 'fruiting' }), '2026-11-08'), { day: 10, length: 7 });
  // 23:30 farm time is still that day
  assert.equal(stageDayOn(prog({ stageSince: at('2026-10-30T23:30:00+08:00') }), '2026-10-31').day, 2);
  assert.equal(stageDayOn(prog({ stageSince: null }), '2026-10-30'), null);
});

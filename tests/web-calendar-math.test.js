// The Calendar page's pure parts (spec 2026-11-03-calendar-design.md 5): the month grid, a day's marks, the day list's
// groups and lines, the address.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  monthGrid, monthRange, shiftMonth, monthOf, monthTitle, dayMarks, dayGroups, itemLine, stageText, calendarHash,
  parseCalendarQuery, dayTitle, dayLabel,
} from '../web/calendar-math.js';

const item = (over) => ({ roomId: 1, kind: 'daily', status: 'planned', ruleKey: 'harvestAm', text: 'Harvest check', note: null,
  slot: 'morning', worker: null, amount: null, unit: null, reason: null, closedAt: null, overdueDays: 0, routine: false,
  about: false, stage: null, ...over });

test('monthGrid: 6 weeks from the Monday on or before the 1st; monthRange, shiftMonth, monthOf, monthTitle', () => {
  const g = monthGrid('2026-11');
  assert.equal(g.length, 42);
  assert.deepEqual(g[0], { date: '2026-10-26', inMonth: false });
  assert.deepEqual(g[6], { date: '2026-11-01', inMonth: true });
  assert.deepEqual(g.at(-1), { date: '2026-12-06', inMonth: false });
  assert.deepEqual(monthGrid('2026-06')[0], { date: '2026-06-01', inMonth: true }, 'a month starting on a Monday');
  assert.deepEqual(monthRange('2026-11'), { from: '2026-10-26', to: '2026-12-06' });
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(monthOf('2026-11-04'), '2026-11');
  assert.equal(monthTitle('2026-11'), 'November 2026');
});

test("dayMarks: a stage start's bag first, then the harvest, then upkeep and stage tasks; routine never; 3 at most", () => {
  const cropOf = (roomId) => (roomId === 1 ? 'oyster' : 'pink');
  const items = [
    item({ ruleKey: 'footbath', routine: true }),
    item({ kind: 'upkeep', ruleKey: 'flyTraps', slot: 'any' }),
    item({ ruleKey: 'harvestAm' }),
    item({ ruleKey: 'harvestPm', slot: 'afternoon' }),
    item({ kind: 'stage', ruleKey: null, stage: { stage: 'rest', flush: 1, done: false } }),
    item({ roomId: 2, ruleKey: 'harvestAm' }),
    item({ ruleKey: 'scrapeRecap' }),
  ];
  const m = dayMarks(items, cropOf);
  assert.deepEqual(m.marks, [
    { kind: 'bag', key: 'oyster', stage: 'rest' },
    { kind: 'task', key: 'flyTraps' },
    { kind: 'task', key: 'scrapeRecap' },
  ], 'what changes first; the harvest last');
  assert.equal(m.more, 1, 'one basket for every room harvesting');
  assert.equal(m.count, 5, 'the tasks: not the routine, not the stage start');
  assert.equal(m.missed, false);
  assert.deepEqual(dayMarks([item({}), item({ roomId: 2 })], cropOf).marks, [{ kind: 'task', key: 'harvestAm', crop: null }], 'two crops: a plain basket');
  assert.deepEqual(dayMarks([item({}), item({ ruleKey: 'harvestPm' })], cropOf).marks, [{ kind: 'task', key: 'harvestAm', crop: 'oyster' }]);
  assert.equal(dayMarks([item({ kind: 'upkeep', status: 'open', overdueDays: 2 })], cropOf).overdue, true);
  assert.equal(dayMarks([item({ status: 'missed', routine: true, ruleKey: 'footbath' })], cropOf).missed, true);
  assert.deepEqual(dayMarks([item({ kind: 'stage', ruleKey: null, stage: { stage: 'rest', flush: 4, done: true } })], cropOf).marks,
    [{ kind: 'bag', key: 'oyster', stage: 'done' }]);
});

test('dayGroups: rooms in their order, stage starts, the rows by slot, upkeep, the routine folded', () => {
  const view = { rooms: [{ id: 2, name: 'B' }, { id: 1, name: 'A' }, { id: 3, name: 'C' }],
    days: [{ date: '2026-11-04', items: [
      item({ ruleKey: 'footbath', routine: true }),
      item({ kind: 'upkeep', ruleKey: 'flyTraps', slot: 'any' }),
      item({ ruleKey: 'harvestPm', slot: 'afternoon' }),
      item({ ruleKey: 'harvestAm' }),
      item({ kind: 'stage', ruleKey: null, stage: { stage: 'rest', flush: 1, done: false } }),
      item({ roomId: 2, ruleKey: 'openBags' }),
    ] }] };
  const g = dayGroups(view, '2026-11-04');
  assert.deepEqual(g.map((x) => x.room.name), ['B', 'A'], 'a room with nothing that day left out');
  const a = g[1];
  assert.equal(a.stages.length, 1);
  assert.deepEqual(a.slots.map((s) => [s.label, s.rows.map((r) => r.ruleKey)]), [['Morning', ['harvestAm']], ['Afternoon', ['harvestPm']]]);
  assert.deepEqual(a.upkeep.map((r) => r.ruleKey), ['flyTraps']);
  assert.deepEqual(a.routine.map((r) => r.ruleKey), ['footbath']);
  assert.equal(a.about, false);
  assert.deepEqual(dayGroups(view, '2026-11-05'), []);
});

test('itemLine and stageText: closed rows as the Log, overdue upkeep, estimates; a stage start in words', () => {
  assert.equal(itemLine(item({ status: 'missed' })), 'Missed');
  assert.match(itemLine(item({ status: 'done', worker: 'Ali', closedAt: Date.UTC(2026, 10, 4, 1, 12), amount: 2.4, unit: 'kg' })), /^Done by Ali at 09:12 · 2\.4 kg$/);
  assert.equal(itemLine(item({ kind: 'upkeep', status: 'open', overdueDays: 2 })), 'overdue 2 days');
  assert.equal(itemLine(item({ kind: 'upkeep', status: 'open', overdueDays: 1 })), 'overdue 1 day');
  assert.equal(itemLine(item({ kind: 'upkeep', status: 'open', overdueDays: 0 })), '');
  assert.equal(itemLine(item({ about: true })), '', 'said once under the room');
  assert.equal(itemLine(item({})), '');
  assert.equal(stageText({ stage: 'rest', flush: 1, done: false }), 'Rest between flushes starts · flush 1');
  assert.equal(stageText({ stage: 'rest', flush: 4, done: true }), 'Rest between flushes starts · flush 4, the last');
  assert.equal(stageText({ stage: 'pinning', flush: 1, done: false }), 'Pinning starts');
});

test('the address: room and day kept; anything else dropped', () => {
  assert.equal(calendarHash({ room: 2, day: '2026-11-04' }), '#/calendar?room=2&day=2026-11-04');
  assert.equal(calendarHash({ room: null, day: null }), '#/calendar');
  assert.deepEqual(parseCalendarQuery('room=2&day=2026-11-04'), { room: 2, day: '2026-11-04' });
  assert.deepEqual(parseCalendarQuery('room=x&day=2026-02-30&y=1'), { room: null, day: null });
  assert.deepEqual(parseCalendarQuery(''), { room: null, day: null });
});

test('dayTitle and dayLabel', () => {
  assert.equal(dayTitle('2026-11-04', '2026-11-03'), 'Wednesday 4 November');
  assert.equal(dayTitle('2026-11-03', '2026-11-03'), 'Today, Tuesday 3 November');
  assert.equal(dayLabel('2026-11-04', '2026-11-03', { count: 3, missed: false }), 'Wednesday 4 November: 3 tasks');
  assert.equal(dayLabel('2026-11-02', '2026-11-03', { count: 1, missed: true }), 'Monday 2 November: 1 task, a task missed');
  assert.equal(dayLabel('2026-11-05', '2026-11-03', { count: 0, missed: false }), 'Thursday 5 November: nothing');
  assert.equal(dayLabel('2026-11-04', '2026-11-03', { count: 2, missed: false }, ['A: Rest between flushes starts']),
    'Wednesday 4 November: 2 tasks, A: Rest between flushes starts');
  assert.equal(dayLabel('2026-11-03', '2026-11-03', { count: 1, missed: false, overdue: true }), 'Today, Tuesday 3 November: 1 task, a task overdue');
});

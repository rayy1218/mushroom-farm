// The pure helpers of the Tasks tab, the Today page, Plan this and the Settings task rules (spec
// docs/superpowers/specs/2026-10-30-tasks-design.md section 7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  farmDate, farmTime, dayMonth, dayTitle, daysFrom, tasksDueWords, longtermWords, tabDot, todayCount, todayLinkLabel,
  slotGroups, foldLine, closedLine, amountText, recordsAmount, amountField, dueWords, upkeepRows,
} from '../web/tasks-math.js';

const at = (h, m = 0, d = 30) => Date.UTC(2026, 9, d, h - 8, m); // a time on the farm's clock (UTC+8) on a day of October 2026

test("days and times are the farm's (Asia/Kuala_Lumpur), whatever the browser's zone", () => {
  assert.equal(farmTime(at(9, 12)), '09:12');
  assert.equal(farmDate(at(1, 0, 30)), '2026-10-30', '01:00 at the farm is already the 30th (17:00 UTC on the 29th)');
  assert.equal(dayMonth('2026-11-02'), '2 Nov');
  assert.equal(dayTitle('2026-10-30'), 'Friday 30 Oct');
  assert.equal(daysFrom('2026-10-27', '2026-10-30'), 3);
  assert.equal(daysFrom('2026-10-30', '2026-11-06'), 7);
  assert.equal(daysFrom('2026-12-31', '2027-01-01'), 1);
});

test('the counts in words: the tab dot, the Today link, the long-term lines', () => {
  assert.equal(tabDot(null), null);
  assert.equal(tabDot({ due: 0, overdue: 0, longterm: 2 }), null, 'long-term tasks alone make no dot');
  assert.deepEqual(tabDot({ due: 1, overdue: 0, longterm: 0 }), { text: '1', level: 'due', label: '1 task due' });
  assert.deepEqual(tabDot({ due: 3, overdue: 1, longterm: 0 }), { text: '3', level: 'warning', label: '3 tasks due, 1 overdue' });
  assert.equal(tabDot({ due: 120, overdue: 0 }).text, '99+');
  assert.equal(todayCount({ date: '2026-10-30', rooms: [{ counts: { due: 2 } }, { counts: { due: 5 } }] }), 7);
  assert.equal(todayCount({ rooms: [{ today: [{ status: 'open' }, { status: 'done' }], upkeepDue: [{ status: 'open' }] }] }), 2, 'without counts: the open rows');
  assert.equal(todayCount(null), null);
  assert.equal(todayLinkLabel(0), 'Today');
  assert.equal(todayLinkLabel(1), 'Today: 1 task due');
  assert.equal(todayLinkLabel(7), 'Today: 7 tasks due');
  assert.equal(tasksDueWords(0), 'Nothing due');
  assert.equal(longtermWords(1), '1 long-term task');
  assert.equal(longtermWords(2), '2 long-term tasks');
});

test("today's rows by Morning, Afternoon and Any time; the closed ones folded into words", () => {
  const rows = [
    { id: 1, slot: 'afternoon', status: 'open' }, { id: 2, slot: 'morning', status: 'done' }, { id: 3, slot: 'morning', status: 'open' },
    { id: 4, slot: 'morning', status: 'skipped' }, { id: 5, slot: 'morning', status: 'done' },
  ];
  assert.deepEqual(slotGroups(rows).map((g) => [g.slot, g.label, g.open.map((r) => r.id), g.closed.map((r) => r.id), g.fold]), [
    ['morning', 'Morning', [3], [2, 4, 5], '2 done · 1 skipped'],
    ['afternoon', 'Afternoon', [1], [], ''],
  ]);
  assert.deepEqual(slotGroups([]), []);
  assert.equal(foldLine(Array.from({ length: 6 }, () => ({ status: 'done' }))), '6 done');
  assert.equal(foldLine([{ status: 'missed' }, { status: 'cancelled' }]), '1 missed · 1 cancelled');
});

test('a closed row says who, when, how much and why', () => {
  assert.equal(closedLine({ status: 'done', worker: 'Ali', closedAt: at(9, 12), amount: 2.4, unit: 'kg' }), 'Done by Ali at 09:12 · 2.4 kg');
  assert.equal(closedLine({ status: 'skipped', worker: 'Siti', closedAt: at(10, 5), reason: 'No bags opened yet' }), 'Skipped by Siti at 10:05 · No bags opened yet');
  assert.equal(closedLine({ status: 'missed', closedAt: at(0, 0, 31) }), 'Missed');
  assert.equal(closedLine({ status: 'cancelled', closedAt: at(8, 0), reason: 'Stage changed' }), 'Cancelled at 08:00 · Stage changed');
  assert.equal(amountText({ amount: 1250, unit: 'kg' }), '1,250 kg');
  assert.equal(amountText({ amount: null, unit: 'kg' }), '');
  assert.equal(amountText({ amount: 0.125, unit: 'kg' }), '0.125 kg', 'up to 3 decimals, like the server');
  assert.equal(amountText({ amount: 0.1 + 0.2, unit: 'kg' }), '0.3 kg');
});

test('the amount box of a rule that records one', () => {
  assert.equal(recordsAmount({ unit: null, amountLabel: null }), false);
  assert.equal(recordsAmount({ unit: 'kg', amountLabel: 'kg picked' }), true);
  assert.deepEqual(amountField({ unit: 'kg', amountLabel: 'kg picked' }), { label: 'kg picked', unit: 'kg' });
  assert.deepEqual(amountField({ unit: 'bags', amountLabel: 'Bags removed' }), { label: 'Bags removed', unit: 'bags' });
  assert.deepEqual(amountField({ unit: 'kg', amountLabel: 'Weight' }), { label: 'Weight (kg)', unit: 'kg' });
  assert.deepEqual(amountField({ unit: 'kg', amountLabel: null }), { label: 'Amount (kg)', unit: 'kg' });
  assert.deepEqual(amountField({ unit: 'g', amountLabel: 'Eggs gathered' }), { label: 'Eggs gathered (g)', unit: 'g' }, 'the unit as a whole word, not inside one');
  assert.deepEqual(amountField({ unit: 'kg', amountLabel: 'Picked, KG' }), { label: 'Picked, KG', unit: 'kg' });
  assert.deepEqual(amountField({ unit: 'm³', amountLabel: 'Water in m³' }), { label: 'Water in m³', unit: 'm³' });
  assert.deepEqual(amountField({ unit: 'm³', amountLabel: 'Water in m³s' }), { label: 'Water in m³s (m³)', unit: 'm³' });
});

test('upkeep: overdue first in words, then due within 7 days, then the rest by date', () => {
  const today = '2026-10-30';
  assert.deepEqual(dueWords({ dueDate: '2026-10-27' }, today), { text: 'overdue 3 days', tone: 'amber', group: 'overdue', late: 3 });
  assert.equal(dueWords({ dueDate: '2026-10-29' }, today).text, 'overdue 1 day');
  assert.deepEqual(dueWords({ dueDate: '2026-10-30' }, today), { text: 'due today', tone: null, group: 'soon', late: 0 });
  assert.deepEqual(dueWords({ dueDate: '2026-11-02' }, today), { text: 'due 2 Nov', tone: null, group: 'soon', late: -3 });
  assert.equal(dueWords({ dueDate: '2026-11-06' }, today).group, 'soon');
  assert.equal(dueWords({ dueDate: '2026-11-07' }, today).group, 'later');
  assert.equal(dueWords({ dueAt: at(9, 0, 28) }, today).text, 'overdue 2 days', 'without dueDate: the farm day of dueAt');
  const rows = [
    { id: 1, status: 'open', dueDate: '2026-12-20' }, { id: 2, status: 'open', dueDate: '2026-10-29' }, { id: 3, status: 'open', dueDate: '2026-11-01' },
    { id: 4, status: 'open', dueDate: '2026-10-20' }, { id: 5, status: 'done', dueDate: '2026-10-01' },
  ];
  assert.deepEqual(upkeepRows(rows, today).map((x) => x.row.id), [4, 2, 3, 1]);
});

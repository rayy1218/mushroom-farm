// The filter part of a run's results page (spec 2026-10-22-filter-design.md 8): the input line, the filter tiles and the
// filter changes on the intake row of the timeline. A run without a filter (older runs, suggest machines) shows none of it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputLine, filterView, timelineRows } from '../web/simulation-math.js';

const physics = { wallUA: 80, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, sunW: 300, fanFlow: 600, acBTU: 12000, humidifierLH: 2 };
const filter = { fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 150, filterLifeDays: 30, filterChangeDays: 30, filterUsedDays: 12, filterSensor: true };
const input = (over = {}) => ({ physics: { ...physics, ...over }, crops: [{ crop: 'oyster', blocks: 500 }], farmType: 'ready', stage: 'fruiting', days: 7 });

test('the input line names the filter when the run had one', () => {
  assert.ok(!/filter/.test(inputLine(input())));
  assert.match(inputLine(input(filter)), / · filter 40\u00a0Pa clean, change at 150\u00a0Pa, 12 days in use, changed every 30 days or at the change pressure$/);
  assert.match(inputLine(input({ ...filter, filterChangeDays: 0, filterSensor: false })), / · filter 40\u00a0Pa clean, change at 150\u00a0Pa, 12 days in use, never changed$/);
  assert.match(inputLine(input({ ...filter, filterSensor: false })), / · filter 40\u00a0Pa clean, change at 150\u00a0Pa, 12 days in use, changed every 30 days$/);
});

test('the filter tiles; none for a run without a filter', () => {
  assert.equal(filterView({ days: 7 }), null);
  assert.equal(filterView({ days: 7, filter: null }), null);
  const v = filterView({ days: 7, filter: { changes: [86400, 2 * 86400 + 3600 * 5 + 60 * 3], meanExchangeM3h: 123.44, meanFilterPa: 97.04, unfilteredPct: 20.96 } });
  assert.deepEqual(v.tiles, [
    { label: 'Filter changes', value: '2', line: 'day 2 00:00, day 3 05:03' },
    { label: 'Mean filter pressure', value: '97.0 Pa', line: 'while the intake ran' },
    { label: 'Unfiltered air', value: '21.0 %', line: 'of the exchanges, in through the leaks' },
    { label: 'Mean air exchange', value: '123 m³/h', line: 'over the whole run' },
  ]);
  const none = filterView({ days: 1, filter: { changes: [], meanExchangeM3h: 50, meanFilterPa: null, unfilteredPct: 0 } });
  assert.deepEqual(none.tiles.slice(0, 2), [
    { label: 'Filter changes', value: 'None', line: 'not changed in the run' },
    { label: 'Mean filter pressure', value: '—', line: 'the intake never ran' },
  ]);
});

test('the intake row of the timeline marks the filter changes', () => {
  const machines = { intake: [{ from: 0, to: 600 }], exhaust: [], circulation: [], humidifier: [], dehumidifier: [], ac: [] };
  const rows = timelineRows(machines, 0, input(filter), [86400]);
  assert.deepEqual(rows.find((r) => r.key === 'intake').marks, [{ at: 86400, text: 'Filter' }]);
  assert.deepEqual(timelineRows(machines, 0, input()).find((r) => r.key === 'intake').marks, []);
  assert.deepEqual(timelineRows(machines, 0, input(filter), null).find((r) => r.key === 'intake').marks, [], 'not a list: no marks');
});

test('one day is "1 day" in the input line', () => {
  assert.match(inputLine(input({ ...filter, filterChangeDays: 1, filterUsedDays: 1, filterSensor: false })), / · filter 40\u00a0Pa clean, change at 150\u00a0Pa, 1 day in use, changed every 1 day$/);
});

test('filter changes of a run that started at 14:00 are told on its clock', () => {
  const v = filterView({ days: 7, filter: { changes: [86400, 2 * 86400 + 3600 * 5 + 60 * 3], meanExchangeM3h: 1, meanFilterPa: 1, unfilteredPct: 0 } }, 14);
  assert.equal(v.tiles[0].line, 'day 2 14:00, day 3 19:03');
});

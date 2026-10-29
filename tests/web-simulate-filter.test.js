// The stepper's filter settings (spec 2026-10-22-filter-design.md 8): prefilled from the room, checked like the server, sent
// with the run and said in the summary.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialState, checkStep, buildBody, summaryLines, firstField } from '../web/simulate-math.js';

const DAY = 86_400_000;
const now = new Date(2026, 9, 22, 12).getTime(); // local noon: the days in use are local calendar days, as on Setup
const room = {
  id: 3, name: 'Room 1', length: 6, width: 4, height: 3, volume: 72, humidifierLH: 2,
  fanMaxPa: 250, filterCleanPa: 30, filterFinalPa: 120, filterChangeDays: 21, filterChangedAt: now - 9.4 * DAY, dpAddress: 9,
};

test('the filter fields come from the room: its settings, the whole days since its last change, its pressure sensor', () => {
  const s = initialState({ room, now });
  assert.deepEqual(
    ['fanMaxPa', 'filterCleanPa', 'filterFinalPa', 'filterLifeDays', 'filterChangeDays', 'filterUsedDays'].map((k) => s.physics[k]),
    ['250', '30', '120', '30', '21', '9'],
  );
  assert.equal(s.filterSensor, true);
  const plain = initialState({ room: { id: 1, name: 'R', length: 2, width: 2, height: 2, volume: 8 }, now });
  assert.deepEqual(
    ['fanMaxPa', 'filterCleanPa', 'filterFinalPa', 'filterLifeDays', 'filterChangeDays', 'filterUsedDays'].map((k) => plain.physics[k]),
    ['200', '40', '80', '30', '30', '0'],
  );
  assert.equal(plain.filterSensor, false);
});

test("a last run gives its filter settings, but the days in use are the room's now", () => {
  const lastRun = { input: { physics: { fanMaxPa: 300, filterCleanPa: 50, filterFinalPa: 200, filterLifeDays: 45, filterChangeDays: 14, filterUsedDays: 2 } } };
  const s = initialState({ room, lastRun, now });
  assert.deepEqual(
    ['fanMaxPa', 'filterCleanPa', 'filterFinalPa', 'filterLifeDays', 'filterChangeDays', 'filterUsedDays'].map((k) => s.physics[k]),
    ['300', '50', '200', '45', '14', '9'],
  );
});

test('step 1 checks the filter numbers and that the fan and the change pressure are above the clean drop', () => {
  const s = initialState({ room, now });
  assert.deepEqual(checkStep(1, s), {});
  s.physics.filterLifeDays = '0';
  s.physics.filterUsedDays = '2.5';
  let e = checkStep(1, s);
  assert.equal(e['physics.filterLifeDays'], 'Filter life must be a whole number from 1 to 365 days');
  assert.equal(e['physics.filterUsedDays'], 'Filter in use must be a whole number from 0 to 365 days');
  const t = initialState({ room, now });
  t.physics.fanMaxPa = '30';
  t.physics.filterFinalPa = '25';
  e = checkStep(1, t);
  assert.equal(e['physics.fanMaxPa'], "Fan maximum pressure must be above the clean filter's pressure drop");
  assert.equal(e['physics.filterFinalPa'], "Filter change pressure must be above the clean filter's pressure drop");
  assert.equal(firstField(e), 'physics.fanMaxPa');
  const u = initialState({ room, now });
  u.physics.filterFinalPa = '250';
  assert.deepEqual(checkStep(1, u), { 'physics.filterFinalPa': "Filter change pressure must be below the fan's maximum pressure" });
});

test("the body sends the filter with the room's sensor", () => {
  const p = buildBody(initialState({ room, now })).physics;
  assert.deepEqual(
    [p.fanMaxPa, p.filterCleanPa, p.filterFinalPa, p.filterLifeDays, p.filterChangeDays, p.filterUsedDays, p.filterSensor],
    [250, 30, 120, 30, 21, 9, true],
  );
});

test('the summary says the filter in one line', () => {
  const line = (s) => summaryLines(s, room).find((l) => l.label === 'Filter').text;
  const s = initialState({ room, now });
  assert.equal(line(s), 'Clean 30\u00a0Pa, change at 120\u00a0Pa, fan maximum 250\u00a0Pa, life 30 days; 9 days in use; changed every 21 days or at the change pressure (pressure sensor)');
  s.physics.filterChangeDays = '0';
  s.filterSensor = false;
  assert.equal(line(s), 'Clean 30\u00a0Pa, change at 120\u00a0Pa, fan maximum 250\u00a0Pa, life 30 days; 9 days in use; never changed (no reminder, no pressure sensor)');
  s.filterSensor = true;
  assert.equal(line(s), 'Clean 30\u00a0Pa, change at 120\u00a0Pa, fan maximum 250\u00a0Pa, life 30 days; 9 days in use; changed at the change pressure (pressure sensor)');
});

test('review fixes: the days in use at most 365; one day is "1 day" in the summary', () => {
  const s = initialState({ room: { ...room, filterChangedAt: now - 400 * DAY }, now });
  assert.equal(s.physics.filterUsedDays, '365');
  assert.deepEqual(checkStep(1, s), {});
  const t = initialState({ room: { ...room, filterChangedAt: now - 1.5 * DAY, filterChangeDays: 1 }, now });
  t.filterSensor = false;
  assert.equal(summaryLines(t, room).find((l) => l.label === 'Filter').text,
    'Clean 30\u00a0Pa, change at 120\u00a0Pa, fan maximum 250\u00a0Pa, life 30 days; 1 day in use; changed every 1 day (no pressure sensor)');
});

test('the days in use are counted as on Setup: local calendar days since the change (critique 2026-10-29: Setup said 6, Simulate 5)', async () => {
  const { filterCard } = await import('../web/filter-math.js');
  const at = (d, h) => new Date(2026, 9, d, h).getTime();
  for (const [changed, today, days] of [[at(21, 23), at(22, 1), '1'], [at(22, 1), at(22, 23), '0'], [at(16, 22), at(22, 8), '6']]) {
    const r = { ...room, filterChangedAt: changed };
    assert.equal(initialState({ room: r, now: today }).physics.filterUsedDays, days);
    assert.equal(filterCard({ room: r, sensor: null, changes: [], now: today }).age, days === '0' ? 'Changed today' : `${days} ${days === '1' ? 'day' : 'days'} in use`);
  }
});

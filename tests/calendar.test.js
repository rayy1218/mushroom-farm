// The calendar's future days (spec 2026-11-03-calendar-design.md 3): stage steps, the daily rules on their days, upkeep
// repeats, routine, the range check.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectRoom, programSteps, programOn, isRoutine, checkRange } from '../server/calendar.js';
import { effectiveRules, localDate, dayStart, addDays } from '../server/task-rules.js';
import { PROGRAM_DEFAULTS } from '../server/program.js';

const DAY = 86_400_000;
const TODAY = '2026-11-03';
const NOW = dayStart(TODAY) + 10 * 3_600_000; // 10:00 farm time
const rules = effectiveRules({ roomId: 1 });
const oyster = (over = {}) => ({ ...PROGRAM_DEFAULTS, crops: [{ crop: 'oyster', blocks: 600 }], stage: 'fruiting',
  stageSince: dayStart(TODAY) - 2 * DAY + 3_600_000, flush: 1, flushes: 2, ...over }); // fruiting day 3 of 7 today
const project = (program, o = {}) => projectRoom({ program, rules, openUpkeep: [], today: TODAY, now: NOW,
  from: TODAY, to: addDays(TODAY, 40), ...o });
const keys = (m, date) => (m.get(date) ?? []).map((i) => i.ruleKey ?? `stage:${i.stage.stage}`);

test('stage steps follow stageEndsAt while automatic change is on; done after the last fruiting', () => {
  const steps = programSteps(oyster(), NOW + 60 * DAY);
  assert.deepEqual(steps.map((s) => [s.program.stage, s.program.flush, s.program.done]),
    [['fruiting', 1, false], ['rest', 1, false], ['fruiting', 2, false], ['rest', 2, true]]);
  assert.equal(localDate(steps[1].at), addDays(TODAY, 5), 'fruiting day 3 of 7 today: rest starts in 5 days');
  assert.equal(programOn(steps, addDays(TODAY, 4)).stage, 'fruiting');
  assert.equal(programOn(steps, addDays(TODAY, 5)).stage, 'rest', 'the new stage counts from its start day');
  assert.equal(programSteps(oyster({ autoAdvance: false }), NOW + 60 * DAY).length, 1, 'automatic change off: no steps');
});

test('future days: harvest checks while fruiting, a stage item on its start day, first- and last-day rules, done rules', () => {
  const m = project(oyster());
  assert.equal(m.has(TODAY), false, 'nothing worked out for today but a stage starting');
  assert.ok(keys(m, addDays(TODAY, 1)).includes('harvestAm'));
  const rest = addDays(TODAY, 5);
  assert.deepEqual(m.get(rest)[0].stage, { stage: 'rest', flush: 1, done: false });
  assert.equal(m.get(rest)[0].kind, 'stage');
  assert.ok(keys(m, rest).includes('scrapeRecap'), 'first day of the rest');
  // code review 2026-11-03: the farm makes the day's rows at midnight under the old stage and cancels them at the change
  const harvest = m.get(rest).find((i) => i.ruleKey === 'harvestAm');
  assert.equal(harvest.until, '01:00', 'the old stage until it changes');
  assert.equal(m.get(rest).find((i) => i.ruleKey === 'scrapeRecap').from, '01:00', 'the new stage from the change');
  assert.equal(m.get(rest).find((i) => i.ruleKey === 'footbath').until, null, 'wanted by both: neither');
  assert.ok(!keys(m, addDays(TODAY, 6)).includes('harvestAm'), 'the next day: the rest only');
  assert.ok(keys(m, addDays(TODAY, 14)).includes('reopen'), 'last day of the rest (10 days)');
  const lastRest = addDays(TODAY, 5 + 10 + 7);
  assert.equal(m.get(lastRest)[0].stage.done, true);
  assert.ok(keys(m, lastRest).includes('clearOut'), 'the done program clears out');
  for (const items of m.values()) for (const i of items) assert.equal(i.status, 'planned');
  assert.ok(m.get(addDays(TODAY, 1)).every((i) => i.about === false), 'before any automatic change: not "about"');
  assert.ok(m.get(rest).filter((i) => i.kind === 'stage' || i.from).every((i) => i.about === true), 'the change and what it brings: estimated');
  assert.ok(m.get(addDays(TODAY, 6)).every((i) => i.about === true));
});

test('automatic change off: the stage carries on, no stage items', () => {
  const m = project(oyster({ autoAdvance: false }));
  assert.ok(keys(m, addDays(TODAY, 30)).includes('harvestAm'));
  assert.ok([...m.values()].flat().every((i) => i.kind !== 'stage'));
});

test('upkeep repeats from the open row due date; an overdue one from today; nothing past the range', () => {
  const openUpkeep = [{ ruleKey: 'flyTraps', dueAt: dayStart(addDays(TODAY, 2)), text: 'Check the yellow fly traps', slot: 'any' },
    { ruleKey: 'acFilter', dueAt: dayStart(addDays(TODAY, -3)), text: 'Wash the aircon filter', slot: 'any' }];
  const m = project(oyster(), { openUpkeep });
  const on = (key) => [...m.entries()].filter(([, items]) => items.some((i) => i.ruleKey === key)).map(([d]) => d);
  assert.deepEqual(on('flyTraps').slice(0, 3), [addDays(TODAY, 2), addDays(TODAY, 9), addDays(TODAY, 16)]);
  assert.deepEqual(on('acFilter').slice(0, 2), [addDays(TODAY, 7), addDays(TODAY, 14)], 'overdue: as if done today');
  assert.equal(m.get(addDays(TODAY, 2)).find((i) => i.ruleKey === 'flyTraps').kind, 'upkeep');
});

test('a room without crops: its own rules only; the horizon caps the range', () => {
  const m = project({ ...PROGRAM_DEFAULTS }, { to: addDays(TODAY, 200) });
  assert.deepEqual(keys(m, addDays(TODAY, 1)).sort(), ['floorClean', 'footbath']);
  assert.equal(m.has(addDays(TODAY, 93)), false);
  assert.ok(m.has(addDays(TODAY, 92)));
});

test('routine: the walk, the humidifier, the footbath, the floor and own daily rules', () => {
  for (const k of ['contamWalk', 'humidifierCheck', 'footbath', 'floorClean', 'custom:3']) assert.equal(isRoutine('daily', k), true, k);
  for (const k of ['harvestAm', 'openBags']) assert.equal(isRoutine('daily', k), false, k);
  assert.equal(isRoutine('upkeep', 'custom:3'), false);
});

test('checkRange: dates, order and span', () => {
  assert.deepEqual(checkRange('2026-11-01', '2026-12-12'), null);
  assert.equal(checkRange('2026-11-01', '2026-12-13').error, 'Ask for 42 days or fewer');
  assert.equal(checkRange('2026-11-05', '2026-11-01').field, 'to');
  assert.equal(checkRange('2026-02-30', '2026-03-01').field, 'from');
  assert.equal(checkRange(null, '2026-03-01').field, 'from');
});

test('a stage changing later today: the new stage\'s tasks from the change, marked', () => {
  const p = oyster({ stageSince: NOW - 7 * DAY + 5 * 3_600_000 }); // fruiting ends today at 15:00
  const m = project(p);
  const today = m.get(TODAY) ?? [];
  assert.equal(today[0].kind, 'stage');
  assert.deepEqual(today.filter((i) => i.kind === 'daily').map((i) => [i.ruleKey, i.from]), [['scrapeRecap', '15:00']], 'only what the change adds');
});

test('a turned-off upkeep rule keeps its open row: shown once on its due date; a repeat uses the rule\'s words now', () => {
  const off = effectiveRules({ roomId: 1, settings: [{ key: 'flyTraps', enabled: false, everyDays: null }] });
  const openUpkeep = [{ ruleKey: 'flyTraps', dueAt: dayStart(addDays(TODAY, 3)), text: 'Old words', slot: 'any' }];
  const m = project(oyster(), { rules: off, openUpkeep });
  const on = [...m.entries()].filter(([, items]) => items.some((i) => i.ruleKey === 'flyTraps')).map(([d]) => d);
  assert.deepEqual(on, [addDays(TODAY, 3)]);
  const m2 = project(oyster(), { openUpkeep });
  assert.equal(m2.get(addDays(TODAY, 10)).find((i) => i.ruleKey === 'flyTraps').text, 'Check the yellow fly traps; replace the full ones');
  assert.equal(m2.get(addDays(TODAY, 3)).find((i) => i.ruleKey === 'flyTraps').text, 'Old words', 'the open row itself keeps its words');
});

test('full cycle: open the bags on the first day of pinning; reishi rim every 2 days; an own daily rule; a mixed room\'s notes', () => {
  const full = oyster({ farmType: 'full', stage: 'spawn', stageSince: dayStart(TODAY) + 3_600_000, flush: 1, days: { spawn: 3, pinning: 4, fruiting: 7, rest: 10 } });
  const m = project(full);
  assert.ok(keys(m, addDays(TODAY, 3)).includes('openBags'), 'pinning starts in 3 days: open the bags that day');
  assert.ok(!keys(m, addDays(TODAY, 4)).includes('openBags'));
  const reishi = project(oyster({ crops: [{ crop: 'reishi', blocks: 100 }], stageSince: dayStart(TODAY) + 3_600_000, days: { spawn: 21, pinning: 4, fruiting: 30, rest: 10 } }));
  const rim = [1, 2, 3, 4].map((n) => keys(reishi, addDays(TODAY, n)).includes('reishiRim'));
  assert.deepEqual(rim, [false, true, false, true], 'fruiting day 1 is today: the rim on days 3 and 5');
  const own = effectiveRules({ roomId: 1, custom: [{ id: 3, text: 'Check the door seal', rooms: null, everyDays: null, slot: 'morning', enabled: true }] });
  const o = project(oyster(), { rules: own }).get(addDays(TODAY, 1)).find((i) => i.ruleKey === 'custom:3');
  assert.equal(o.text, 'Check the door seal');
  assert.equal(o.routine, true);
  const mixed = project(oyster({ crops: [{ crop: 'pink', blocks: 300 }, { crop: 'golden', blocks: 300 }] }));
  assert.match(mixed.get(addDays(TODAY, 1)).find((i) => i.ruleKey === 'harvestAm').note, /^Pink oyster: .* · Golden oyster: /);
});

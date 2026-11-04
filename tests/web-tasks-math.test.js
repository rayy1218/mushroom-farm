// The pure helpers of the Tasks tab, the Today page, Plan this and the Settings task rules (spec
// docs/superpowers/specs/2026-10-30-tasks-design.md section 7).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  farmDate, farmTime, dayMonth, dayTitle, daysFrom, tasksDueWords, longtermWords, tabDot, todayCount, todayLinkLabel,
  countText,
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
  assert.equal(countText(7), '7');
  assert.equal(countText(99), '99');
  assert.equal(countText(100), '99+', 'the top bar and the tab dot stop at 99+');
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

import {
  rmWords, longtermLine, changeText, machineChanges, planOf, plannedWords, acInputOf, setupUpdate, beforeText, setupBody,
  parseAmount, checkReason, checkLongterm, logRows, logLine,
} from '../web/tasks-math.js';

test('a long-term row from Suggest machines in one line', () => {
  const row = { text: 'Aircon 9,000 → 12,000 BTU/h', source: { machine: 'acBTU', from: 9000, to: 12000, rmMonth: -42.4, suggestedAt: at(14, 0, 29) } };
  // the RM a month is the whole plan's (every machine of it together), not this machine's
  assert.equal(longtermLine(row), 'Aircon 9,000 → 12,000 BTU/h · plan: RM 42 a month less · from Suggest machines, 29 Oct');
  assert.equal(longtermLine({ ...row, source: { ...row.source, rmMonth: 15.6 } }), 'Aircon 9,000 → 12,000 BTU/h · plan: RM 16 a month more · from Suggest machines, 29 Oct');
  assert.equal(longtermLine({ ...row, source: { ...row.source, rmMonth: null } }), 'Aircon 9,000 → 12,000 BTU/h · from Suggest machines, 29 Oct', 'no electricity price: no money');
  assert.equal(longtermLine({ ...row, source: { ...row.source, suggestedAt: null } }), 'Aircon 9,000 → 12,000 BTU/h · plan: RM 42 a month less · from Suggest machines', 'no time: no day');
  assert.equal(longtermLine({ text: 'Fix the door seal', source: null }), 'Fix the door seal');
  assert.equal(rmWords(0.3), 'about the same money a month');
  assert.equal(rmWords(null), '');
});

test('a machine change in words, as the server names the task', () => {
  assert.equal(changeText({ key: 'fanFlow', from: 150, to: 200 }), 'Fan 150 → 200 m³/h');
  assert.equal(changeText({ key: 'acBTU', from: 9000, to: 12000 }), 'Aircon 9,000 → 12,000 BTU/h');
  assert.equal(changeText({ key: 'humidifierLH', from: 0.5, to: 1 }), 'Humidifier 0.5 → 1 L/h');
  assert.equal(changeText({ key: 'dehumidifierLday', from: 0, to: 10 }), 'Dehumidifier none → 10 L/day');
  assert.equal(changeText({ key: 'dehumidifierLday', from: 10, to: 0 }), 'Dehumidifier 10 L/day → none');
  const now = { fanFlow: 150, acBTU: 9000, humidifierLH: 0.5, dehumidifierLday: 0 };
  assert.deepEqual(machineChanges(now, { ...now, acBTU: 12000, dehumidifierLday: 10 }).map((c) => [c.key, c.from, c.to]), [['acBTU', 9000, 12000], ['dehumidifierLday', 0, 10]]);
  assert.deepEqual(machineChanges(now, { ...now }), []);
});

test('Plan this: the changes against the baseline and the RM a month against it', () => {
  const result = {
    days: 2,
    baseline: { machines: { fanFlow: 150, acBTU: 9000, humidifierLH: 0.5, dehumidifierLday: 0 }, kWh: 20, litres: 0 },
    best: [{ machines: { fanFlow: 150, acBTU: 12000, humidifierLH: 1, dehumidifierLday: 0 }, kWh: 15, litres: 0 }],
  };
  const plan = planOf(result, 0, { electricity: 0.55, water: null }, 123);
  assert.deepEqual(plan.changes.map((c) => c.text), ['Aircon 9,000 → 12,000 BTU/h', 'Humidifier 0.5 → 1 L/h']);
  assert.equal(plan.rmMonth, -41.25, 'RM 123.75 a month against RM 165');
  assert.equal(plan.rmText, 'RM 41 a month less');
  assert.deepEqual(plan.body, { suggestion: { machines: [{ key: 'acBTU', from: 9000, to: 12000 }, { key: 'humidifierLH', from: 0.5, to: 1 }], rmMonth: -41.25, suggestedAt: 123 } });
  assert.equal(planOf(result, 0, { electricity: null, water: null }, 123).rmMonth, null, 'no price: no money');
  assert.equal(planOf({ ...result, baseline: undefined }, 0, { electricity: 0.55 }, 123), null, 'no baseline: the "from" is unknown');
  assert.deepEqual(planOf({ ...result, best: [result.baseline] }, 0, { electricity: 0.55 }, 123).changes, [], 'the room has it already: nothing to plan (the server refuses an empty plan)');
});

test('C10 review: Plan this from a search whose baseline is no longer the room\'s now; the fan at Simulate\'s default; the planned line', () => {
  const machines = { fanFlow: 600, acBTU: 9000, humidifierLH: 0.5, dehumidifierLday: 0 };
  const result = {
    days: 2,
    baseline: { machines, kWh: 20, litres: 0 },
    best: [{ machines: { ...machines, fanFlow: 150, acBTU: 12000 }, kWh: 15, litres: 0 }],
  };
  const prices = { electricity: 0.55, water: null };
  assert.equal(planOf(result, 0, prices, 123).stale, false, 'no now given: as before');
  assert.equal(planOf(result, 0, prices, 123, { machines, defaults: [] }).stale, false, 'the room has the baseline still');
  // Setup changed since the search (a stored search, come back to): its "from" is not the room's now
  assert.equal(planOf(result, 0, prices, 123, { machines: { ...machines, acBTU: 12000 }, defaults: [] }).stale, true);
  const fan = planOf(result, 0, prices, 123, { machines, defaults: ['fanFlow'] });
  assert.deepEqual(fan.changes.map((c) => c.text), ["Fan 600 → 150 m³/h (fan now: Simulate's default)", 'Aircon 9,000 → 12,000 BTU/h']);
  assert.deepEqual(fan.body.suggestion.machines, [{ key: 'fanFlow', from: 600, to: 150, assumed: true }, { key: 'acBTU', from: 9000, to: 12000 }],
    'the fan is flagged for the row\'s note');
  assert.deepEqual(planOf(result, 0, prices, 123, { machines, defaults: [] }).body.suggestion.machines[0], { key: 'fanFlow', from: 600, to: 150 });
  assert.deepEqual(planOf(result, 0, prices, 123, { machines, defaults: [] }).changes.map((c) => c.text), ['Fan 600 → 150 m³/h', 'Aircon 9,000 → 12,000 BTU/h']);
  assert.equal(plannedWords(3, 3), '3 long-term tasks planned');
  assert.equal(plannedWords(1, 3), '1 long-term task planned (2 already planned)');
  // a plan to another size replaces the machine's open one: say which (the replaced rows' texts)
  assert.equal(plannedWords(1, 1, [{ text: 'Humidifier 0.5 → 2 L/h' }]), '1 long-term task planned (replaces Humidifier 0.5 → 2 L/h)');
  assert.equal(plannedWords(2, 3, [{ text: 'Humidifier 0.5 → 2 L/h' }, { text: 'Fan 150 → 200 m³/h' }]),
    '2 long-term tasks planned (1 already planned; replaces Humidifier 0.5 → 2 L/h · Fan 150 → 200 m³/h)');
  assert.equal(plannedWords(1, 1, []), '1 long-term task planned');
});

const ROOM = {
  name: 'Room 2', length: 3, width: 2, height: 2.5, trhAddress: 1, co2Address: 2, meterAddress: null, dpAddress: null, relayAddress: 3,
  acAddress: null, dehumidifier: false, lights: false, intakeW: 60, exhaustW: 60, circulationW: 60, humidifierW: 80, humidifierLH: 2, acInputW: 800,
  dehumidifierW: 380, dehumidifierLday: 20, lightsW: 60, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterChangeDays: 30, gateway: null,
};

test('Done on a long-term machine task offers these Setup values (spec 7.5)', () => {
  assert.equal(acInputOf(12000), 1070, '12,000 ÷ 11.25 = 1,066.7 W, to 10 W');
  assert.equal(acInputOf(9000), 800);
  assert.equal(acInputOf(18000), 1600);
  assert.deepEqual(setupUpdate({ machine: 'acBTU', from: 9000, to: 12000 }, ROOM), [
    { name: 'acInputW', label: 'Aircon rated input', unit: 'W', kind: 'number', before: 800, after: 1070 },
  ]);
  assert.deepEqual(setupUpdate({ machine: 'humidifierLH', from: 2, to: 3 }, ROOM), [
    { name: 'humidifierLH', label: 'Humidifier output', unit: 'L/h', kind: 'number', before: 2, after: 3 },
  ]);
  assert.deepEqual(setupUpdate({ machine: 'dehumidifierLday', from: 0, to: 25 }, ROOM), [
    { name: 'dehumidifier', label: 'Dehumidifier fitted', unit: null, kind: 'check', before: false, after: true },
    { name: 'dehumidifierLday', label: 'Dehumidifier capacity', unit: 'L/day', kind: 'number', before: null, after: 25 },
  ]);
  assert.deepEqual(setupUpdate({ machine: 'dehumidifierLday', from: 20, to: 0 }, { ...ROOM, dehumidifier: true }), [
    { name: 'dehumidifier', label: 'Dehumidifier fitted', unit: null, kind: 'check', before: true, after: false },
  ]);
  assert.equal(setupUpdate({ machine: 'fanFlow', from: 150, to: 200 }, ROOM), null, 'Setup keeps no fan flow');
  assert.equal(setupUpdate(null, ROOM), null);
  assert.equal(beforeText({ kind: 'number', unit: 'W', before: 1050 }), '1,050 W');
  assert.equal(beforeText({ kind: 'number', unit: 'L/day', before: null }), 'not set');
  assert.equal(beforeText({ kind: 'check', before: false }), 'not fitted');
});

test("Save and mark done: the room's PUT body with the edited values, checked as Setup checks them", () => {
  const { body } = setupBody(ROOM, { acInputW: '1070' });
  assert.equal(body.acInputW, 1070);
  assert.equal(body.name, 'Room 2');
  assert.equal(body.humidifierLH, 2, 'the rest as the room has it');
  const fitted = setupBody(ROOM, { dehumidifier: true, dehumidifierLday: '25' }).body;
  assert.equal(fitted.dehumidifier, true);
  assert.equal(fitted.dehumidifierLday, 25);
  assert.deepEqual(setupBody(ROOM, { acInputW: 'abc' }), { errors: { acInputW: 'Aircon rated input must be a number from 0 to 20000 W' } });
});

test("the boxes of the dialogs: an amount, a reason, a long-term task, in the server's words", () => {
  assert.deepEqual(parseAmount('', 'kg'), { value: null });
  assert.deepEqual(parseAmount(' 2.45 ', 'kg'), { value: 2.45 });
  assert.deepEqual(parseAmount('0.125', 'kg'), { value: 0.125 }, 'up to 3 decimals, as the amount shows');
  assert.deepEqual(parseAmount('10000', 'kg'), { value: 10000 });
  for (const t of ['10000.5', '-1', 'abc', '1e3', '2.4567']) {
    assert.deepEqual(parseAmount(t, 'kg'), { error: 'The amount must be a number from 0 to 10,000' }, t);
  }
  assert.deepEqual(checkReason('  '), { error: 'Say why' });
  assert.deepEqual(checkReason(' Bags not ready '), { value: 'Bags not ready' });
  assert.deepEqual(checkReason('x'.repeat(200)), { value: 'x'.repeat(200) });
  assert.deepEqual(checkReason('x'.repeat(201)), { error: 'The reason must be at most 200 characters' });
  assert.deepEqual(checkLongterm({ text: ' ', note: '' }), { errors: { text: 'Say what to do (1 to 120 characters)' } });
  assert.deepEqual(checkLongterm({ text: 'x'.repeat(121), note: '' }), { errors: { text: 'Say what to do (1 to 120 characters)' } });
  assert.deepEqual(checkLongterm({ text: ' Seal the door ', note: ' ' }), { values: { text: 'Seal the door', note: null } });
  assert.deepEqual(checkLongterm({ text: 'Seal the door', note: 'x'.repeat(501) }), { errors: { note: 'The note must be at most 500 characters' } });
});

test('the Log: the last 14 days, each line with its time, status, who, amount and why', () => {
  const now = at(12, 0);
  const rows = [
    { id: 9, text: 'Harvest check', status: 'done', closedAt: at(11, 0), worker: 'Ali', amount: 3.5, unit: 'kg', reason: null },
    { id: 8, text: 'Footbath', status: 'missed', closedAt: at(0, 0, 14), worker: null, amount: null, unit: null, reason: null },
  ];
  assert.deepEqual(logRows(rows, now).map((l) => l.id), [9]);
  assert.deepEqual(logRows(rows, now, true).map((l) => l.id), [9, 8]);
  assert.deepEqual(logLine(rows[0]), { id: 9, date: '30 Oct', time: '11:00', task: 'Harvest check', status: 'Done', tone: 'good', worker: 'Ali', amount: '3.5 kg', reason: '' });
  assert.equal(logLine(rows[1]).tone, 'amber');
  const missed = { id: 7, text: 'Footbath', status: 'missed', date: '2026-10-29', closedAt: at(0, 30, 31), worker: null, amount: null, unit: null, reason: null };
  assert.deepEqual([logLine(missed).date, logLine(missed).time], ['29 Oct', ''], "a missed row is its own day's, not the day the server noticed it");
});

test('a machine the baseline does not know is no change (only the dehumidifier has 0 = none)', () => {
  const next = { fanFlow: 200, acBTU: 12000, humidifierLH: 1, dehumidifierLday: 10 };
  assert.deepEqual(machineChanges({ fanFlow: null, acBTU: undefined, humidifierLH: 1, dehumidifierLday: null }, next).map((c) => [c.key, c.from, c.to]), [['dehumidifierLday', 0, 10]]);
});

test('the aircon class rule is the one Simulate uses, up to the 60,000 BTU/h class', async () => {
  const sim = await import('../web/simulate-math.js');
  const { AC_CLASSES, acClassOf } = await import('../web/simulation-math.js');
  const { readFileSync } = await import('node:fs');
  assert.equal(sim.BTU_PER_W, 11.25);
  assert.match(readFileSync(new URL('../web/tasks-math.js', import.meta.url), 'utf8'), /import \{ BTU_PER_W \} from '\.\/simulate-math\.js';/);
  assert.equal(AC_CLASSES.at(-1), 60000, "as server/sizing.js's AC_SIZES");
  assert.equal(acClassOf(60000), 60000);
  for (const btu of [9000, 12000, 48000, 60000]) {
    assert.equal(sim.roomMachines({ room: { acInputW: acInputOf(btu), humidifierLH: 2 } }).machines.acBTU, btu, `${btu} BTU/h → ${acInputOf(btu)} W → back`);
  }
});

import { whenWords, ruleLine, customLine } from '../web/tasks-math.js';

test('a rule in words for the Task rules card', () => {
  assert.equal(whenWords('daily'), 'every day');
  assert.equal(whenWords('first'), 'first day of the stage');
  assert.equal(whenWords('last'), 'last day of the stage');
  assert.equal(whenWords({ every: 2, lastDays: 7 }), 'every 2 days in the last 7 days of the stage');
  assert.equal(whenWords({ every: 2, lastDays: null }), 'every 2 days');
  assert.equal(ruleLine({ key: 'contamWalk', kind: 'daily', families: null, stages: null, when: 'daily', slot: 'morning' }), 'Every room · every day · morning');
  assert.equal(ruleLine({ key: 'footbath', kind: 'daily', families: null, stages: null, when: 'daily', slot: 'morning' }), 'Every room · every day · morning');
  assert.equal(ruleLine({ key: 'floorClean', kind: 'daily', families: null, stages: null, when: 'daily', slot: 'afternoon' }), 'Every room · every day · afternoon');
  assert.equal(ruleLine({ key: 'x', kind: 'daily', families: ['oyster'], stages: null, when: 'daily', slot: 'any' }), 'Oyster · all stages · every day · any time');
  assert.equal(ruleLine({ key: 'colonisedCheck', kind: 'daily', families: null, stages: ['spawn'], when: { every: 2, lastDays: 7 }, slot: 'any' }),
    'All crops · spawn run · every 2 days in the last 7 days of the stage · any time');
  assert.equal(ruleLine({ key: 'openBags', kind: 'daily', families: ['oyster', 'woodear', 'lionsmane', 'reishi'], stages: ['pinning'], when: 'first', slot: 'morning' }),
    "Oyster, wood ear, lion's mane, reishi · pinning · first day of the stage · morning");
  assert.equal(ruleLine({ key: 'humidifierCheck', kind: 'daily', families: null, stages: ['pinning', 'fruiting'], when: 'daily', slot: 'morning' }), 'All crops · pinning, fruiting · every day · morning');
  assert.equal(ruleLine({ key: 'clearOut', kind: 'daily', families: null, stages: null, when: 'daily', slot: 'morning' }), 'After the last flush · every day · morning');
  assert.equal(ruleLine({ key: 'acFilter', kind: 'upkeep', everyDays: 7 }), 'Every 7 days');
  assert.equal(customLine({ rooms: null, everyDays: null, slot: 'morning' }, []), 'All rooms · every day · morning');
  assert.equal(customLine({ rooms: [1, 2], everyDays: 14, slot: 'any' }, [{ id: 1, name: 'Room 1' }, { id: 2, name: 'Room 2' }]), 'Room 1, Room 2 · every 14 days · any time');
  assert.equal(customLine({ rooms: [9], everyDays: 1, slot: 'afternoon' }, []), 'Room 9 · every day · afternoon');
});

// ---- final review ----

test("Plan this flags every machine whose \"from\" is Simulate's default (a room not rated yet), not only the fan", () => {
  const machines = { fanFlow: 600, acBTU: 12000, humidifierLH: 1, dehumidifierLday: 0 };
  const result = {
    days: 2,
    baseline: { machines, kWh: 20, litres: 0 },
    best: [{ machines: { fanFlow: 150, acBTU: 9000, humidifierLH: 2, dehumidifierLday: 10 }, kWh: 15, litres: 0 }],
  };
  const plan = planOf(result, 0, { electricity: 0.55, water: null }, 123, { machines, defaults: ['fanFlow', 'acBTU', 'humidifierLH'] });
  assert.deepEqual(plan.changes.map((c) => c.text), [
    "Fan 600 → 150 m³/h (fan now: Simulate's default)",
    "Aircon 12,000 → 9,000 BTU/h (aircon now: Simulate's default)",
    "Humidifier 1 → 2 L/h (humidifier now: Simulate's default)",
    'Dehumidifier none → 10 L/day',
  ]);
  assert.deepEqual(plan.body.suggestion.machines, [
    { key: 'fanFlow', from: 600, to: 150, assumed: true },
    { key: 'acBTU', from: 12000, to: 9000, assumed: true },
    { key: 'humidifierLH', from: 1, to: 2, assumed: true },
    { key: 'dehumidifierLday', from: 0, to: 10 },
  ]);
  const rated = planOf(result, 0, { electricity: 0.55, water: null }, 123, { machines, defaults: ['fanFlow'] });
  assert.deepEqual(rated.body.suggestion.machines.filter((m) => m.assumed).map((m) => m.key), ['fanFlow'], 'Setup has the aircon and humidifier');
});

test('taskParts: a task\'s name, then what to do (owner 2026-11-02: one long sentence read as a wall)', async () => {
  const { taskParts } = await import('../web/tasks-math.js');
  assert.deepEqual(taskParts('Contamination walk: take out and bag any green, orange, black or slimy bags, away from the room'),
    { name: 'Contamination walk', detail: 'Take out and bag any green, orange, black or slimy bags, away from the room' });
  assert.deepEqual(taskParts('Harvest check: pick the ready ones; pick before any misting'), { name: 'Harvest check', detail: 'Pick the ready ones; pick before any misting' });
  assert.deepEqual(taskParts('Descale and sanitise the humidifier (RO water; no bleach on the disc)'),
    { name: 'Descale and sanitise the humidifier', detail: 'RO water; no bleach on the disc' });
  assert.deepEqual(taskParts('Check the CO₂ sensor against outdoor air (about 420 ppm)'), { name: 'Check the CO₂ sensor against outdoor air', detail: 'About 420 ppm' });
  assert.deepEqual(taskParts('Open the bags (cut or remove the cap). Don\'t spray the opened bags for 2 days'),
    { name: 'Open the bags (cut or remove the cap)', detail: 'Don\'t spray the opened bags for 2 days' });
  assert.deepEqual(taskParts('Change the footbath at the door'), { name: 'Change the footbath at the door', detail: '' });
  assert.deepEqual(taskParts('Harvest check (afternoon)'), { name: 'Harvest check (afternoon)', detail: '' }, 'a short bracket is part of the name');
  assert.deepEqual(taskParts('Aircon 9,000 → 12,000 BTU/h · plan: RM 42 a month less · from Suggest machines, 29 Oct'),
    { name: 'Aircon 9,000 → 12,000 BTU/h', detail: 'plan: RM 42 a month less · from Suggest machines, 29 Oct' });
  assert.deepEqual(taskParts('Paint the walls'), { name: 'Paint the walls', detail: '' });
  assert.deepEqual(taskParts(''), { name: '', detail: '' });
});

test('comingUpWords: the upkeep folded under Coming up, how many and the nearest date', async () => {
  const { comingUpWords, upkeepRows } = await import('../web/tasks-math.js');
  const rows = [{ id: 1, status: 'open', dueDate: '2027-01-31' }, { id: 2, status: 'open', dueDate: '2026-12-02' }];
  assert.equal(comingUpWords(upkeepRows(rows, '2026-11-02')), 'Coming up · 2 · next 2 Dec');
  assert.equal(comingUpWords([]), '');
});

test('nowDue: in the due-now list only overdue words stay', async () => {
  const { nowDue, dueWords } = await import('../web/tasks-math.js');
  assert.equal(nowDue(dueWords({ dueDate: '2026-11-02' }, '2026-11-02')), null);
  assert.deepEqual(nowDue(dueWords({ dueDate: '2026-10-30' }, '2026-11-02')).text, 'overdue 3 days');
});

test('amountFields: one box per crop of a mixed harvest check, else the single amount box, else none', async () => {
  const { amountFields } = await import('../web/tasks-math.js');
  const crops = [{ crop: 'oyster', name: 'Grey oyster' }, { crop: 'lionsmane', name: "Lion's mane" }];
  // a mixed room: each box named by its crop, the unit in the box and the group's legend ("kg picked")
  assert.deepEqual(amountFields({ unit: 'kg', amountLabel: 'kg picked', harvestCrops: crops }), [
    { name: 'kg:oyster', label: 'Grey oyster', crop: 'oyster' },
    { name: 'kg:lionsmane', label: "Lion's mane", crop: 'lionsmane' },
  ]);
  assert.deepEqual(amountFields({ unit: 'kg', amountLabel: 'kg picked', harvestCrops: [crops[0]] }), [{ name: 'amount', label: 'kg picked' }]);
  assert.deepEqual(amountFields({ unit: 'kg', amountLabel: 'Weight', harvestCrops: null }), [{ name: 'amount', label: 'Weight (kg)' }]);
  assert.deepEqual(amountFields({ unit: null, amountLabel: null }), []);
});

test('doneBody: amount for one box, amounts per crop for several, an error names the field', async () => {
  const { doneBody } = await import('../web/tasks-math.js');
  const crops = [{ crop: 'oyster', name: 'Grey oyster' }, { crop: 'lionsmane', name: 'Lion' }];
  const mixed = { unit: 'kg', harvestCrops: crops };
  assert.deepEqual(doneBody({ unit: 'kg' }, 'Ali', { amount: ' 2.5 ' }), { worker: 'Ali', amount: 2.5 });
  assert.deepEqual(doneBody({ unit: 'kg' }, 'Ali', { amount: '' }), { worker: 'Ali' });
  assert.deepEqual(doneBody({ unit: null }, 'Ali', {}), { worker: 'Ali' });
  assert.deepEqual(doneBody(mixed, 'Ali', { 'kg:oyster': '2', 'kg:lionsmane': '0.5' }), { worker: 'Ali', amounts: { oyster: 2, lionsmane: 0.5 } });
  assert.deepEqual(doneBody(mixed, 'Ali', { 'kg:oyster': '', 'kg:lionsmane': '0' }), { worker: 'Ali', amounts: { lionsmane: 0 } });
  assert.deepEqual(doneBody(mixed, 'Ali', { 'kg:oyster': '', 'kg:lionsmane': ' ' }), { worker: 'Ali' });
  assert.deepEqual(doneBody(mixed, 'Ali', { 'kg:oyster': '1', 'kg:lionsmane': 'x' }), { error: 'The amount must be a number from 0 to 10,000', field: 'kg:lionsmane' });
  assert.deepEqual(doneBody({ unit: 'kg' }, 'Ali', { amount: '-1' }), { error: 'The amount must be a number from 0 to 10,000', field: 'amount' });
});

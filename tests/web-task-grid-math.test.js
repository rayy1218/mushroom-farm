// The Tasks tab's grid, its pure parts (spec 2026-11-04-task-grid-design.md 2, 2.1, 4 and 5): the week and the month, the
// columns, the boxes, the initials, the short names, the words a screen reader says and the month sheet's rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RULE_ORDER, SHORT_NAMES, LEGEND, UNDO_MS, weekOf, shiftWeek, weekTitle, monthDays, shortName, initialsFor, gridColumns,
  gridCells, boxWords, boxAmount, canUndo, sheetRows, sheetLayout, monthTitle,
} from '../web/task-grid-math.js';
import { DAILY_RULES, CLEAR_OUT } from '../server/task-rules.js';
import { DOT } from '../web/text-math.js';

const TODAY = '2026-11-04'; // a Wednesday
const at = (date, hm) => Date.parse(`${date}T${hm}:00+08:00`); // the farm's clock
const item = (over) => ({ roomId: 7, kind: 'daily', status: 'planned', ruleKey: 'footbath', text: 'Change the footbath at the door',
  note: null, slot: 'morning', worker: null, amount: null, unit: null, reason: null, closedAt: null, overdueDays: 0, routine: true,
  about: false, stage: null, until: null, from: null, ...over });
const row = (over) => ({ id: 1, roomId: 7, kind: 'daily', ruleKey: 'footbath', date: TODAY, slot: 'morning', text: 'Change the footbath at the door',
  note: null, status: 'open', dueAt: null, createdAt: at(TODAY, '00:00'), closedAt: null, worker: null, amount: null, unit: null,
  reason: null, source: null, amountLabel: null, harvestCrops: null, ...over });
const week = (byDate) => weekOf(TODAY).days.map((date) => ({ date, items: byDate[date] ?? [] }));

test('weekOf: Monday to Sunday of any day of the week; shiftWeek; weekTitle', () => {
  const w = weekOf(TODAY);
  assert.deepEqual(w, {
    from: '2026-11-02', to: '2026-11-08',
    days: ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'],
  });
  assert.equal(weekOf('2026-11-02').from, '2026-11-02', 'a Monday is its own week');
  assert.equal(weekOf('2026-11-08').from, '2026-11-02', 'a Sunday is the end of the week');
  const across = weekOf('2026-12-01');
  assert.equal(across.from, '2026-11-30', 'a week crossing a month');
  assert.equal(across.to, '2026-12-06');
  assert.equal(weekOf('2027-01-01').from, '2026-12-28', 'and a year');
  assert.equal(shiftWeek('2026-11-04', 1), '2026-11-09');
  assert.equal(shiftWeek('2026-11-04', -1), '2026-10-26');
  assert.equal(weekTitle(w), '2–8 November 2026');
  assert.equal(weekTitle(across), '30 November – 6 December 2026');
  assert.equal(weekTitle(weekOf('2027-01-01')), '28 December 2026 – 3 January 2027');
});

test('monthDays: the 1st to the last of 30 and 31 day months and February', () => {
  const nov = monthDays('2026-11');
  assert.equal(nov.from, '2026-11-01');
  assert.equal(nov.to, '2026-11-30');
  assert.equal(nov.days.length, 30);
  assert.equal(monthDays('2026-12').days.length, 31);
  assert.equal(monthDays('2026-12').to, '2026-12-31');
  assert.equal(monthDays('2027-02').days.length, 28);
  assert.equal(monthDays('2028-02').days.length, 29);
  assert.equal(monthDays('2026-11-17').from, '2026-11-01', 'a date means its month');
});

test('RULE_ORDER: the server order of the daily rules (clear out, then DAILY_RULES), every one with a short name', () => {
  assert.deepEqual(RULE_ORDER, [CLEAR_OUT.key, ...DAILY_RULES.map((r) => r.key)]);
  for (const key of RULE_ORDER) assert.ok(SHORT_NAMES[key], key);
});

test('shortName: spec 2.1 for the built-in rules; an own rule its text cut to 24 characters with "…"', () => {
  assert.equal(shortName('contamWalk', 'Contamination walk: take out…'), 'Contamination walk');
  assert.equal(shortName('colonisedCheck'), 'Colonisation check');
  assert.equal(shortName('casingApply'), 'Casing');
  assert.equal(shortName('humidifierCheck'), 'Humidifier');
  assert.equal(shortName('harvestAm'), 'Harvest AM');
  assert.equal(shortName('harvestPm'), 'Harvest PM');
  assert.equal(shortName('harvestDaily'), 'Harvest');
  assert.equal(shortName('reopen'), 'Reopen the bags');
  assert.equal(shortName('floorClean'), 'Floor');
  assert.equal(shortName('clearOut'), 'Clear out');
  assert.equal(shortName('custom:3', 'Check the water tank'), 'Check the water tank');
  assert.equal(shortName('custom:3', 'Check the water tank level and top up'), 'Check the water tank le…');
  assert.equal(shortName('custom:3', 'Check the water tank level and top up').length, 24);
  assert.equal(shortName('custom:3', 'Wash the boots and the gloves'), 'Wash the boots and the…', 'no space before the "…"');
  assert.equal(shortName('custom:3', 'x'.repeat(24)), 'x'.repeat(24), '24 characters stay whole');
  assert.equal(shortName('somethingNew', 'Weigh the bags: before they go in'), 'Weigh the bags', 'a rule this page does not know: its name');
});

test('initialsFor: two words the first letters of the first two, one word its first two letters, upper case', () => {
  const m = initialsFor(['Ali Lee', 'Sara', 'siti nur aisyah', 'J']);
  assert.equal(m.get('Ali Lee'), 'AL');
  assert.equal(m.get('Sara'), 'SA');
  assert.equal(m.get('siti nur aisyah'), 'SN');
  assert.equal(m.get('J'), 'J');
});

test('initialsFor: names that share initials each show the first name cut to 4 letters, as written', () => {
  const m = initialsFor(['Aliya Tan', 'Ali Teh', 'Sara', 'Ben', 'Sam Lee']);
  assert.equal(m.get('Aliya Tan'), 'Aliy');
  assert.equal(m.get('Ali Teh'), 'Ali');
  assert.equal(m.get('Sara'), 'SA', 'Sara (SA) and Sam Lee (SL) do not clash');
  assert.equal(m.get('Ben'), 'BE');
  const n = initialsFor(['Sara', 'Sabri', 'sara', null, '', 'Sara']);
  assert.equal(n.get('Sara'), 'Sara', 'a name twice (or in another case) is one person, still clashing with Sabri');
  assert.equal(n.get('Sabri'), 'Sabr');
  assert.equal(n.size, 3);
});

test('gridColumns: the week\'s daily rules in the rules\' order, then own rules by id; only rules with a row or a planned item', () => {
  const days = week({
    '2026-11-02': [item({ ruleKey: 'floorClean', slot: 'afternoon', status: 'done' }), item({ ruleKey: 'custom:12', text: 'Check the water tank', status: 'missed' })],
    '2026-11-03': [item({ ruleKey: 'footbath', status: 'done' }), item({ ruleKey: 'custom:3', text: 'Wipe the door handles', status: 'done' })],
    '2026-11-05': [item({ ruleKey: 'harvestAm', text: 'Harvest check: pick the ready ones', unit: 'kg' }), item({ ruleKey: 'contamWalk', unit: 'bags' })],
    '2026-11-06': [item({ kind: 'upkeep', ruleKey: 'acFilter' }), item({ kind: 'stage', ruleKey: null, text: '' }), item({ kind: 'longterm', ruleKey: null, text: 'Aircon' })],
  });
  const cols = gridColumns(days);
  assert.deepEqual(cols.map((c) => c.key), ['contamWalk|morning', 'harvestAm|morning', 'footbath|morning', 'floorClean|afternoon', 'custom:3|morning', 'custom:12|morning']);
  assert.deepEqual(cols[1], { key: 'harvestAm|morning', ruleKey: 'harvestAm', slot: 'morning', shortName: 'Harvest AM', text: 'Harvest check: pick the ready ones', unit: 'kg', picture: 'harvestAm' });
  assert.equal(cols[4].shortName, 'Wipe the door handles');
  assert.equal(cols[4].picture, 'own');
  assert.equal(cols[0].unit, 'bags');
  assert.deepEqual(gridColumns(week({})), [], 'a week with nothing: no columns');
});

test('gridColumns: today\'s rows count; a rule in two slots is two columns; an own rule takes its latest text', () => {
  const days = week({
    '2026-11-02': [item({ ruleKey: 'custom:3', text: 'Old words', status: 'done' }), item({ ruleKey: 'custom:3', slot: 'afternoon', text: 'Old words' })],
    '2026-11-03': [item({ ruleKey: 'custom:3', text: 'New words', status: 'done' })],
  });
  const cols = gridColumns(days, [row({ ruleKey: 'clearOut', text: 'Clear out the spent blocks' })]);
  assert.deepEqual(cols.map((c) => c.key), ['clearOut|morning', 'custom:3|morning', 'custom:3|afternoon']);
  assert.equal(cols[1].text, 'New words');
  assert.equal(cols[1].shortName, 'New words');
});

test('gridCells: every kind of box over a week, today\'s rows from the room tasks reply with their ids', () => {
  const harvest = { ruleKey: 'harvestAm', text: 'Harvest check: pick the ready ones', unit: 'kg' };
  const days = week({
    '2026-11-02': [
      item({ ...harvest, status: 'done', worker: 'Ali Lee', amount: 2.4, closedAt: at('2026-11-02', '08:12') }),
      item({ status: 'done', worker: 'Sara', closedAt: at('2026-11-02', '07:50') }),
    ],
    '2026-11-03': [
      item({ ...harvest, status: 'missed' }),
      item({ status: 'skipped', worker: 'Sara', reason: 'No water', closedAt: at('2026-11-03', '09:00') }),
    ],
    // today in the calendar reply: no ids; the room tasks reply's rows win
    [TODAY]: [item({ ...harvest, status: 'open' }), item({ status: 'done', worker: 'Sara', closedAt: at(TODAY, '08:12') })],
    '2026-11-05': [item({ ...harvest }), item({ about: true })],
    '2026-11-06': [item({ ...harvest, status: 'cancelled', reason: 'Stage changed' })],
  });
  const todayRows = [
    row({ id: 41, ...harvest, status: 'open', amountLabel: 'kg picked', harvestCrops: [{ crop: 'oyster', name: 'Grey oyster', blocks: 400 }] }),
    row({ id: 42, status: 'done', worker: 'Sara', closedAt: at(TODAY, '08:12') }),
  ];
  const cols = gridColumns(days, todayRows);
  const grid = gridCells({ days, columns: cols, today: TODAY, todayRows, workers: ['Ali Lee', 'Sara'] });
  assert.equal(grid.length, 7);
  assert.deepEqual(grid.map((r) => r.today), [false, false, true, false, false, false, false]);
  const box = (date, i) => grid.find((r) => r.date === date).cells[i];

  const done = box('2026-11-02', 0);
  assert.equal(done.kind, 'done');
  assert.equal(done.initials, 'AL');
  assert.equal(done.amountText, '2.4');
  assert.equal(done.taskId, null, 'a past day: no id (the calendar reply has none)');
  assert.equal(done.words, 'Harvest AM, Monday 2 November: done by Ali Lee at 08:12, 2.4 kg');
  assert.equal(box('2026-11-02', 1).amountText, '');
  assert.equal(box('2026-11-02', 1).initials, 'SA');

  assert.equal(box('2026-11-03', 0).kind, 'missed');
  assert.equal(box('2026-11-03', 0).words, 'Harvest AM, Tuesday 3 November: missed');
  assert.equal(box('2026-11-03', 1).kind, 'skipped');
  assert.equal(box('2026-11-03', 1).words, 'Footbath, Tuesday 3 November: skipped by Sara at 09:00: No water');

  const open = box(TODAY, 0);
  assert.equal(open.kind, 'open');
  assert.equal(open.taskId, 41);
  assert.deepEqual(open.row.harvestCrops, [{ crop: 'oyster', name: 'Grey oyster', blocks: 400 }], 'the row the Done dialog needs');
  assert.equal(open.words, 'Harvest AM, Today, Wednesday 4 November: open');
  const closedToday = box(TODAY, 1);
  assert.equal(closedToday.kind, 'done');
  assert.equal(closedToday.taskId, 42, 'today\'s closed row keeps its id (Undo)');
  assert.equal(closedToday.words, 'Footbath, Today, Wednesday 4 November: done by Sara at 08:12');

  assert.equal(box('2026-11-05', 0).kind, 'planned');
  assert.equal(box('2026-11-05', 0).about, false);
  assert.equal(box('2026-11-05', 0).words, 'Harvest AM, Thursday 5 November: planned');
  assert.equal(box('2026-11-05', 1).about, true);
  assert.equal(box('2026-11-05', 1).words, 'Footbath, Thursday 5 November: planned, dates estimated from the stage plan');

  assert.equal(box('2026-11-06', 0).kind, 'cancelled');
  assert.equal(box('2026-11-06', 0).words, 'Harvest AM, Friday 6 November: cancelled: Stage changed');
  const none = box('2026-11-06', 1);
  assert.equal(none.kind, 'none');
  assert.equal(none.row, null);
  assert.equal(none.initials, '');
  assert.equal(none.words, 'Footbath, Friday 6 November: not due');
});

test('gridCells: without the room tasks reply, today comes from the calendar; a planned item later today shows', () => {
  const days = week({
    [TODAY]: [item({ status: 'open' }), item({ ruleKey: 'harvestAm', text: 'Harvest check', about: true, from: '14:00' })],
  });
  const cols = gridColumns(days);
  const today = gridCells({ days, columns: cols, today: TODAY }).find((r) => r.today);
  assert.deepEqual(today.cells.map((c) => [c.kind, c.taskId]), [['planned', null], ['open', null]]);
  const withRows = gridCells({ days, columns: cols, today: TODAY, todayRows: [row({ id: 9 })] }).find((r) => r.today);
  assert.deepEqual(withRows.cells.map((c) => [c.kind, c.taskId]), [['planned', null], ['open', 9]], 'a planned item stays beside the rows');
});

test('gridCells: the initials see the week\'s names and the workers\' list for a clash', () => {
  const days = week({
    '2026-11-02': [item({ status: 'done', worker: 'Aliya Tan', closedAt: at('2026-11-02', '08:00') })],
    '2026-11-03': [item({ status: 'done', worker: 'Ali Teh', closedAt: at('2026-11-03', '08:00') })],
  });
  const cols = gridColumns(days);
  const grid = gridCells({ days, columns: cols, today: TODAY, workers: ['Sara'] });
  assert.deepEqual(grid.slice(0, 2).map((r) => r.cells[0].initials), ['Aliy', 'Ali']);
  const clash = gridCells({ days: week({ '2026-11-02': days[0].items }), columns: cols, today: TODAY, workers: ['Ali Teh'] });
  assert.equal(clash[0].cells[0].initials, 'Aliy', 'a clash with a worker who did nothing this week still counts');
});

test('boxAmount: the figure alone, kg to 2 decimals at most, bags whole', () => {
  assert.equal(boxAmount({ amount: 2.4, unit: 'kg' }), '2.4');
  assert.equal(boxAmount({ amount: 2.355, unit: 'kg' }), '2.36');
  assert.equal(boxAmount({ amount: 1234.5, unit: 'kg' }), '1,234.5');
  assert.equal(boxAmount({ amount: 3, unit: 'bags' }), '3');
  assert.equal(boxAmount({ amount: 0, unit: 'bags' }), '0');
  assert.equal(boxAmount({ amount: null, unit: 'kg' }), '');
  assert.equal(boxAmount(null), '');
});

test('boxWords: a box in words for a column and a day', () => {
  const col = { shortName: 'Footbath' };
  assert.equal(boxWords(col, '2026-11-04', { kind: 'done', row: { worker: 'Sara', closedAt: at('2026-11-04', '08:12') } }), 'Footbath, Wednesday 4 November: done by Sara at 08:12');
  assert.equal(boxWords(col, '2026-11-04', { kind: 'done', row: { worker: null, closedAt: null } }), 'Footbath, Wednesday 4 November: done');
  assert.equal(boxWords(col, '2026-11-04', { kind: 'skipped', row: { worker: 'Sara', closedAt: at('2026-11-04', '08:12'), reason: null } }), 'Footbath, Wednesday 4 November: skipped by Sara at 08:12');
  assert.equal(boxWords(col, '2026-11-04', { kind: 'none', row: null }, '2026-11-04'), 'Footbath, Today, Wednesday 4 November: not due');
});

test('canUndo: today\'s done or skipped box with an id, closed at most a minute ago', () => {
  const now = at(TODAY, '08:13');
  const cell = (over) => ({ kind: 'done', taskId: 4, row: { closedAt: now - 30_000 }, ...over });
  assert.equal(UNDO_MS, 60_000);
  assert.equal(canUndo(cell(), now), true);
  assert.equal(canUndo(cell({ kind: 'skipped' }), now), true);
  assert.equal(canUndo(cell({ row: { closedAt: now - 60_000 } }), now), true);
  assert.equal(canUndo(cell({ row: { closedAt: now - 60_001 } }), now), false);
  assert.equal(canUndo(cell({ taskId: null }), now), false, 'no id: nothing to undo');
  assert.equal(canUndo(cell({ kind: 'missed' }), now), false);
  assert.equal(canUndo(cell({ kind: 'open' }), now), false);
});

test('LEGEND: the line under the grid, its dots kept to the words before them', () => {
  assert.equal(LEGEND, ['✓ done (initials)', '✗ missed', '— skipped', 'shaded: not due'].join(DOT));
  assert.equal(LEGEND.replace(/\u00a0/g, ' '), '✓ done (initials) · ✗ missed · — skipped · shaded: not due');
});

test('sheetRows: a month of 30 days, a weekday letter, the boxes as print text, days ahead blank with planned outlined', () => {
  const days = monthDays('2026-11').days.map((date) => ({ date, items: [] }));
  const on = (date) => days.find((d) => d.date === date).items;
  on('2026-11-02').push(item({ ruleKey: 'harvestAm', text: 'Harvest check', unit: 'kg', status: 'done', worker: 'Ali Lee', amount: 2.4, closedAt: at('2026-11-02', '08:12') }));
  on('2026-11-02').push(item({ status: 'done', worker: 'Sara', closedAt: at('2026-11-02', '08:00') }));
  on('2026-11-03').push(item({ ruleKey: 'harvestAm', text: 'Harvest check', unit: 'kg', status: 'missed' }), item({ status: 'skipped', worker: 'Sara', reason: 'x' }));
  on(TODAY).push(item({ status: 'open' }));
  on('2026-11-05').push(item({}));
  const sheet = sheetRows({ month: '2026-11', days, today: TODAY, workers: ['Ali Lee', 'Sara'] });
  assert.deepEqual(sheet.columns.map((c) => c.shortName), ['Harvest AM', 'Footbath']);
  assert.equal(sheet.rows.length, 30);
  assert.deepEqual(sheet.rows.slice(0, 3).map((r) => [r.day, r.weekday]), [[1, 'S'], [2, 'M'], [3, 'T']]);
  assert.equal(sheet.rows[29].date, '2026-11-30');
  const r = (d) => sheet.rows[d - 1];
  assert.deepEqual(r(1).cells, [{ kind: 'none', text: '', outlined: false, shaded: true }, { kind: 'none', text: '', outlined: false, shaded: true }]);
  assert.deepEqual(r(2).cells.map((c) => c.text), ['✓ 2.4 AL', '✓ SA']);
  assert.deepEqual(r(3).cells.map((c) => c.text), ['✗', '—']);
  assert.deepEqual(r(4).cells[1], { kind: 'open', text: '', outlined: true, shaded: false }, 'today\'s open box: blank for the pen');
  assert.deepEqual(r(5).cells, [{ kind: 'none', text: '', outlined: false, shaded: false }, { kind: 'planned', text: '', outlined: true, shaded: false }]);
  assert.deepEqual([r(3).ahead, r(4).ahead, r(5).ahead], [false, false, true]);
  assert.equal(sheet.rows.every((x) => x.cells.length === 2), true);
});

test('sheetRows: a month of 31 days; a month with no daily tasks has no columns', () => {
  const days = monthDays('2026-12').days.map((date) => ({ date, items: [] }));
  const sheet = sheetRows({ month: '2026-12', days, today: TODAY });
  assert.equal(sheet.rows.length, 31);
  assert.deepEqual(sheet.columns, []);
  assert.deepEqual(sheet.rows[30], { date: '2026-12-31', day: 31, weekday: 'T', ahead: true, cells: [] });
});

test("sheetLayout: A4 portrait for 8 columns or fewer, landscape above; the heads sideways when a column is narrower than 22 mm", () => {
  const at = (n) => { const l = sheetLayout(n); return `${l.landscape ? 'L' : 'P'}${l.sideways ? 's' : ''}`; };
  assert.deepEqual([0, 1, 6, 7, 8].map(at), ['P', 'P', 'P', 'P', 'Ps'], 'portrait: 156 mm over the columns');
  assert.deepEqual([9, 11, 12, 20].map(at), ['L', 'L', 'Ls', 'Ls'], 'landscape: 243 mm over them');
});

test('monthTitle: "November 2026"', () => {
  assert.equal(monthTitle('2026-11'), 'November 2026');
  assert.equal(monthTitle('2027-01-15'), 'January 2027', 'a date: its month');
});

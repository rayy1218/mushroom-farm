import test from 'node:test';
import assert from 'node:assert/strict';
import { kgText, perBlockText, beText, rmText, costText, summaryLine, flushColumns, sheetRows, sheetTotal } from '../web/harvest-math.js';

const nb = ' ';
const dot = `${nb}· `;

test('formats: kg, per block, BE, RM, cost', () => {
  assert.equal(kgText(18.44), `18.4${nb}kg`);
  assert.equal(kgText(2.35, { exact: true }), `2.35${nb}kg`);
  assert.equal(kgText(2, { exact: true }), `2.00${nb}kg`, 'one harvest always to 2 decimals, so the rows line up');
  assert.equal(kgText(5.7, { exact: true }), `5.70${nb}kg`);
  assert.equal(kgText(1240), `1,240.0${nb}kg`);
  assert.equal(perBlockText(0.314), `0.31${nb}kg per block`);
  assert.equal(beText(34), `BE 34${nb}%`);
  assert.equal(rmText(1240.5), `RM${nb}1,240.50`);
  assert.equal(costText({ costPerKg: 3.1, days: 46, water: true }), `RM${nb}3.10 per${nb}kg${dot}electricity and water over 46${nb}days at today’s prices`);
  assert.equal(costText({ costPerKg: 3.1, days: 1, water: false }), `RM${nb}3.10 per${nb}kg${dot}electricity over 1${nb}day at today’s prices`);
});

test('a missing figure is a dash', () => {
  for (const f of [kgText, perBlockText, beText, rmText]) assert.equal(f(null), '—');
  assert.equal(kgText(undefined, { exact: true }), '—');
  assert.equal(costText({ costPerKg: null, days: 3, water: true }), '—');
});

test('the Crop tab summary line', () => {
  assert.equal(summaryLine({ kg: 18.44, perBlock: 0.31, be: 34 }, 2), `Flush 2${dot}18.4${nb}kg this run${dot}0.31${nb}kg per block${dot}BE 34${nb}%`);
  assert.equal(summaryLine({ kg: 5, perBlock: 0.01, be: null }, 1), `Flush 1${dot}5.0${nb}kg this run${dot}0.01${nb}kg per block`);
  assert.equal(summaryLine({ kg: 0, perBlock: 0, be: null }, 1), 'No harvests recorded in this run yet.');
});

test('flush columns: one kg column per crop in a mixed room', () => {
  assert.deepEqual(flushColumns([{ crop: 'oyster' }]), ['Flush', 'Dates', 'kg', 'kg per block', 'BE'], 'Dates: they are dates, not a count');
  assert.deepEqual(flushColumns([{ crop: 'oyster' }, { crop: 'lionsmane' }]), ['Flush', 'Dates', 'Grey oyster kg', "Lion's mane kg", 'kg', 'kg per block', 'BE']);
});

test('sheet rows: the myGAP columns, the sales cells blank', () => {
  const rows = sheetRows([{ date: '2026-11-03', roomName: 'Room 1', crop: 'oyster', runStartedAt: Date.UTC(2026, 9, 2, 16), kg: 3.5 }]);
  assert.deepEqual(rows[0], ['3 Nov 2026', 'Grey oyster', `Room 1${dot}run of 3 Oct`, '3.50', '', '', '', '', '']);
  const [big] = sheetRows([{ date: '2026-11-03', roomName: 'Room 3', crop: 'lionsmane', runStartedAt: null, kg: 1234.5 }]);
  assert.deepEqual(big.slice(1, 4), ["Lion's mane", `Room 3${dot}run of —`, '1,234.50'], 'no (draft) on the form; the kg to 2 decimals, grouped');
  assert.equal(sheetTotal({ totals: { kg: 1240.456 } }), '1,240.46');
  assert.equal(sheetTotal({ totals: {} }), '');
});

// ---- Task 9: the Harvest room tab ----

import { recordLead, recordTitle, dateHint, runHead, harvestLine, pastRow, PAST_COLUMNS, missingNote, flushRows, byCropRows, runTiles, deleteTitle, deleteLead, pricesNote, whenBoxes, whenMs, recordBody, editBody } from '../web/harvest-math.js';

const at = (y, mo, d, h = 0, mi = 0) => Date.UTC(y, mo - 1, d, h - 8, mi); // a farm time (UTC+8) in ms

const oneCrop = {
  id: 3, startedAt: at(2026, 10, 3, 9), endedAt: null, partial: false, crops: [{ crop: 'oyster', blocks: 500 }],
  kg: 18.44, perBlock: 0.04, be: 34, value: 221.28, cost: { costPerKg: 3.1, cost: 57.2, days: 46, water: true },
  byCrop: [{ crop: 'oyster', blocks: 500, kg: 18.44, perBlock: 0.04, be: 34, value: 221.28 }],
  flushes: [
    { flush: null, from: at(2026, 10, 20, 8), to: at(2026, 10, 20, 8), kg: 1.2, byCrop: { oyster: 1.2 }, perBlock: 0, be: 2 },
    { flush: 1, from: at(2026, 10, 21, 8), to: at(2026, 10, 27, 17), kg: 12.04, byCrop: { oyster: 12.04 }, perBlock: 0.02, be: 22 },
    { flush: 2, from: at(2026, 10, 30, 8), to: at(2026, 11, 4, 8), kg: 5.2, byCrop: { oyster: 5.2 }, perBlock: 0.01, be: null },
  ],
  missing: { dryKg: [], price: [] },
  harvests: [],
};
const mixed = {
  ...oneCrop, crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 1200 }],
  byCrop: [{ crop: 'oyster', blocks: 300, kg: 10, perBlock: 0.03, be: 30, value: 120 }, { crop: 'lionsmane', blocks: 1200, kg: 8.44, perBlock: 0.01, be: null, value: null }],
  flushes: [{ flush: 1, from: at(2026, 10, 21, 8), to: at(2026, 10, 21, 17), kg: 18.44, byCrop: { oyster: 10, lionsmane: 8.44 }, perBlock: 0.01, be: null }],
};

test('the run head: when the blocks went in (or the records began) and the crops with their blocks', () => {
  assert.equal(runHead(oneCrop), `Blocks in 3 Oct${dot}Grey oyster 500${nb}blocks`);
  assert.equal(runHead({ ...oneCrop, partial: true, startedAt: at(2026, 11, 4, 0, 30) }), `Recorded from 4 Nov${dot}Grey oyster 500${nb}blocks`);
  assert.equal(runHead(mixed), `Blocks in 3 Oct${dot}Grey oyster 300${nb}blocks${dot}Lion's mane 1,200${nb}blocks`);
  assert.equal(runHead({ ...oneCrop, crops: [{ crop: 'oyster', blocks: 1 }] }), `Blocks in 3 Oct${dot}Grey oyster 1${nb}block`);
});

test('a harvest line: when, what (the crop only in a mixed room), kg exact, who, from', () => {
  const h = { id: 9, crop: 'oyster', flush: 2, kg: 2.35, pickedAt: at(2026, 11, 4, 8, 12), worker: 'Ali', taskId: 41 };
  assert.deepEqual(harvestLine(h, { mixed: false }), { when: `4${nb}Nov 08:12`, what: 'Flush 2', kg: `2.35${nb}kg`, who: 'Ali', from: 'from the harvest check' });
  assert.deepEqual(harvestLine({ ...h, taskId: null }, { mixed: true }), { when: `4${nb}Nov 08:12`, what: `Grey oyster${dot}flush 2`, kg: `2.35${nb}kg`, who: 'Ali', from: '' }, 'recorded by hand: the usual case, not said');
  assert.equal(harvestLine({ ...h, flush: null }, { mixed: false }).what, 'Before records');
  assert.equal(harvestLine({ ...h, flush: null }, { mixed: true }).what, `Grey oyster${dot}before records`);
  assert.equal(harvestLine({ ...h, worker: null }, { mixed: false }).who, '');
});

test('a past run: a row of the Past runs table, its dates and the figures that are known', () => {
  const run = { ...oneCrop, endedAt: at(2026, 11, 2, 10) };
  assert.deepEqual(PAST_COLUMNS, ['Dates', 'Crops', 'kg', 'kg per block', 'BE', 'RM value', 'Cost per kg']);
  assert.deepEqual(pastRow(run), {
    title: '3 Oct – 2 Nov',
    cells: [`Grey oyster 500${nb}blocks`, `18.4${nb}kg`, `0.04${nb}kg`, `34${nb}%`, `RM${nb}221.28`, `RM${nb}3.10`],
  });
  assert.equal(pastRow(run).cells.length + 1, PAST_COLUMNS.length);
  const missingFigures = { ...run, partial: true, be: null, value: null, cost: null };
  assert.deepEqual(pastRow(missingFigures).cells.slice(3), ['—', '—', '—']);
  assert.equal(pastRow(missingFigures).title, 'Recorded 3 Oct – 2 Nov');
  assert.equal(pastRow({ ...run, startedAt: at(2025, 12, 28, 9), endedAt: at(2026, 1, 30, 9) }).title, '28 Dec 2025 – 30 Jan 2026');
  assert.equal(pastRow({ ...run, startedAt: at(2026, 11, 2, 9), endedAt: at(2026, 11, 2, 15) }).title, '2 Nov');
});

test('the missing note names the crops and what to set', () => {
  assert.equal(missingNote({ dryKg: ['oyster'], price: [] }), 'Set the dry substrate per block of Grey oyster in Settings → Yield.');
  assert.equal(missingNote({ dryKg: [], price: ['oyster', 'lionsmane'] }), "Set the price of Grey oyster and Lion's mane in Settings → Yield.");
  assert.equal(missingNote({ dryKg: ['oyster'], price: ['lionsmane'] }), "Set the dry substrate per block of Grey oyster and the price of Lion's mane in Settings → Yield.");
  assert.equal(missingNote({ dryKg: ['lionsmane'], price: ['lionsmane'] }), "Set the dry substrate per block and the price of Lion's mane in Settings → Yield.");
  assert.equal(missingNote({ dryKg: [], price: [] }), null);
  assert.equal(missingNote(undefined), null);
});

test('the flushes table: Before records first, the days, a kg column per crop in a mixed room', () => {
  assert.deepEqual(flushRows(oneCrop), [
    ['Before records', '20 Oct', `1.2${nb}kg`, `0.00${nb}kg`, `2${nb}%`],
    ['Flush 1', '21–27 Oct', `12.0${nb}kg`, `0.02${nb}kg`, `22${nb}%`],
    ['Flush 2', '30 Oct – 4 Nov', `5.2${nb}kg`, `0.01${nb}kg`, '—'],
  ]);
  assert.deepEqual(flushRows(mixed), [['Flush 1', '21 Oct', `10.0${nb}kg`, `8.4${nb}kg`, `18.4${nb}kg`, `0.01${nb}kg`, '—']]);
  assert.equal(flushRows(mixed)[0].length, flushColumns(mixed.crops).length);
  assert.deepEqual(flushRows({ ...mixed, flushes: [{ ...mixed.flushes[0], byCrop: { oyster: 10 } }] })[0].slice(2, 4), [`10.0${nb}kg`, '—']);
});

test('the By crop table of a mixed room', () => {
  assert.deepEqual(byCropRows(mixed), [
    ['Grey oyster', `300${nb}blocks`, `10.0${nb}kg`, `0.03${nb}kg`, `30${nb}%`, `RM${nb}120.00`],
    ["Lion's mane", `1,200${nb}blocks`, `8.4${nb}kg`, `0.01${nb}kg`, '—', '—'],
  ]);
});

test('the tiles: kg, kg per block, BE, RM value, cost per kg with what it counts (the tables\' words)', () => {
  assert.deepEqual(runTiles(oneCrop), [
    { label: 'kg', value: `18.4${nb}kg` },
    { label: 'kg per block', value: `0.04${nb}kg` },
    { label: 'BE', title: 'Biological efficiency', value: `34${nb}%` },
    { label: 'RM value', value: `RM${nb}221.28` },
    { label: 'Cost per kg', value: `RM${nb}3.10`, line: `electricity and water${dot}46${nb}days` },
  ]);
  assert.equal(runTiles({ ...oneCrop, cost: { ...oneCrop.cost, days: 1, water: false } })[4].line, `electricity${dot}1${nb}day`);
  const none = runTiles({ ...oneCrop, kg: 0, perBlock: 0, be: null, value: null, cost: { costPerKg: null, cost: 4, days: 2, water: false } });
  assert.deepEqual(none.map((t) => t.value), [`0.0${nb}kg`, `0.00${nb}kg`, '—', '—', '—']);
  assert.equal(none[4].line, undefined);
  assert.equal(runTiles({ ...oneCrop, cost: null })[4].value, '—');
});

test('no energy recorded: the cost per kg is a dash that says so, never RM 0.00', () => {
  const t = runTiles({ ...oneCrop, cost: { costPerKg: null, cost: 0, days: 41, water: false, none: 'no-energy' } })[4];
  assert.deepEqual(t, { label: 'Cost per kg', value: '—', line: 'No energy recorded yet' });
  assert.deepEqual(pageTiles({ ...farm, totals: { ...farm.totals, cost: { costPerKg: null, cost: 0, days: 30, water: false, none: 'no-energy' } } })[2],
    { label: 'Cost per kg', value: '—', line: 'No energy recorded yet' });
  assert.equal(pricesNote(oneCrop.cost), 'The cost per kg is at today’s prices.');
  assert.equal(pricesNote({ costPerKg: null, none: 'no-energy' }), null);
  assert.equal(pricesNote(null), null);
});

test('the RM value of the priced crops, the crops left out named with their kg', () => {
  const part = { ...mixed, value: 120, unpriced: ['lionsmane'] };
  assert.deepEqual(runTiles(part)[3], { label: 'RM value', value: `RM${nb}120.00`, line: `without Lion's mane (8.4${nb}kg, no price)` });
  const two = { ...part, byCrop: [...part.byCrop, { crop: 'pink', kg: 2, value: null }], unpriced: ['lionsmane', 'pink'] };
  assert.equal(runTiles(two)[3].line, `without Lion's mane, Pink oyster (10.4${nb}kg, no price)`);
  assert.deepEqual(runTiles({ ...part, value: null })[3], { label: 'RM value', value: '—', line: "Lion's mane has no price" });
  assert.equal(runTiles({ ...two, value: null })[3].line, "Lion's mane, Pink oyster have no price");
  assert.equal(runTiles({ ...oneCrop, unpriced: [] })[3].line, undefined);
});

test('the delete question: the harvest in the title, when and who in the lead (the day and month kept together)', () => {
  const h = { crop: 'lionsmane', kg: 6.35, pickedAt: at(2026, 11, 4, 14, 36), worker: 'Kumar' };
  assert.equal(deleteTitle(h), `Delete 6.35${nb}kg of Lion's mane?`);
  assert.equal(deleteLead(h), `Picked 4${nb}Nov 14:36 by Kumar.`);
  assert.equal(deleteLead({ ...h, worker: null }), `Picked 4${nb}Nov 14:36.`);
});

test('Record a harvest: the stamp it will take, the date in the farm\'s words under the box', () => {
  assert.equal(recordLead({ stage: 'fruiting', flush: 3 }), `Flush 3${dot}Fruiting`);
  assert.equal(recordLead({ stage: 'rest', flush: 1 }), `Flush 1${dot}Rest between flushes`);
  assert.equal(recordLead(null), null);
  assert.equal(recordTitle('Room 1'), `Record a harvest${dot}Room 1`);
  assert.equal(recordTitle(''), 'Record a harvest');
  assert.equal(dateHint('2026-11-04'), 'Wednesday 4 Nov', 'as the Calendar names a day');
  assert.equal(dateHint(''), '');
  assert.equal(dateHint('4 Nov'), '');
});

test('the date and time boxes in the farm time: shown, read back (a 24 h time, typed loosely)', () => {
  assert.deepEqual(whenBoxes(at(2026, 11, 4, 8, 12) + 37_000), { date: '2026-11-04', time: '08:12' });
  assert.equal(whenMs('2026-11-04', '08:12'), at(2026, 11, 4, 8, 12));
  assert.equal(whenMs('2026-11-04', '8:12'), at(2026, 11, 4, 8, 12));
  assert.equal(whenMs('2026-11-04', '0812'), at(2026, 11, 4, 8, 12));
  for (const [d, t] of [['', '08:12'], ['2026-11-04', ''], ['2026-11-04', '24:00'], ['2026-11-04', '8.12'], ['4 Nov', '08:12']]) assert.ok(Number.isNaN(whenMs(d, t)), `${d} ${t}`);
});

test('Record a harvest: the body, the checks, the time left out when both boxes still show what they opened with', () => {
  const now = at(2026, 11, 4, 9, 0) + 20_000;
  const run = { ...mixed, startedAt: at(2026, 10, 3, 9, 30) + 45_000 };
  const shown = whenBoxes(now);
  const v = (more) => ({ crop: 'oyster', kg: '1', worker: 'Ali', pickedDate: shown.date, pickedTime: shown.time, ...more });
  assert.deepEqual(recordBody(v({ crop: 'lionsmane', kg: ' 2.35 ' }), { run, now, shown }), { crop: 'lionsmane', kg: 2.35, worker: 'Ali' });
  assert.deepEqual(recordBody({ kg: '1', worker: 'Ali', pickedDate: '2026-11-03', pickedTime: '17:05' }, { run: oneCrop, now, shown }), { crop: 'oyster', kg: 1, worker: 'Ali', pickedAt: at(2026, 11, 3, 17, 5) });
  // the run's first minute: the run's start (the box has no seconds)
  assert.equal(recordBody(v({ pickedDate: '2026-10-03', pickedTime: '09:30' }), { run, now, shown }).pickedAt, run.startedAt);
  assert.deepEqual(recordBody(v({ kg: '' }), { run, now, shown }), { error: 'Give the kg picked', field: 'kg' });
  for (const kg of ['0', '-1', 'abc', '10001', '1.2345']) {
    assert.deepEqual(recordBody(v({ kg }), { run, now, shown }), { error: 'kg must be a number over 0 up to 10,000', field: 'kg' }, kg);
  }
  assert.deepEqual(recordBody(v({ pickedDate: '' }), { run, now, shown }), { error: 'Pick a date', field: 'pickedDate' });
  assert.deepEqual(recordBody(v({ pickedTime: '25:00' }), { run, now, shown }), { error: 'Give the time as 24 h, like 08:12', field: 'pickedTime' });
  // a day outside the run is the date's fault; a time outside it on a day in it, the time's
  assert.deepEqual(recordBody(v({ pickedDate: '2026-10-02', pickedTime: '12:00' }), { run, now, shown }), { error: "Pick a time from the run's start to now", field: 'pickedDate' });
  assert.deepEqual(recordBody(v({ pickedDate: '2026-10-03', pickedTime: '09:29' }), { run, now, shown }), { error: "Pick a time from the run's start to now", field: 'pickedTime' });
  assert.deepEqual(recordBody(v({ pickedTime: '09:01' }), { run, now, shown }), { error: "Pick a time from the run's start to now", field: 'pickedTime' });
  assert.deepEqual(recordBody(v({ pickedDate: '2026-11-05', pickedTime: '08:00' }), { run, now, shown }), { error: "Pick a time from the run's start to now", field: 'pickedDate' });
  assert.deepEqual(recordBody(v({ worker: '' }), { run, now, shown }), { error: 'Pick who picked it', field: 'worker' });
});

test('Edit a harvest: only what changed; nothing changed is an empty body', () => {
  const now = at(2026, 11, 4, 9, 0);
  const h = { id: 9, crop: 'oyster', kg: 2.35, pickedAt: at(2026, 11, 4, 8, 12) + 37_000 };
  const shown = whenBoxes(h.pickedAt);
  const v = (more) => ({ kg: '2.35', pickedDate: shown.date, pickedTime: shown.time, ...more });
  assert.deepEqual(editBody(v(), h, { run: oneCrop, now, shown }), {});
  assert.deepEqual(editBody(v({ pickedTime: '8:12' }), h, { run: oneCrop, now, shown }), {}, 'the same time typed loosely is no change');
  assert.deepEqual(editBody(v({ kg: '2.4' }), h, { run: oneCrop, now, shown }), { kg: 2.4 });
  assert.deepEqual(editBody(v({ pickedTime: '07:00' }), h, { run: oneCrop, now, shown }), { pickedAt: at(2026, 11, 4, 7) });
  const ended = { ...oneCrop, endedAt: at(2026, 11, 2, 10) };
  assert.deepEqual(editBody(v({ pickedDate: '2026-11-03', pickedTime: '07:00' }), h, { run: ended, now, shown }), { error: "Pick a time from the run's start to its end", field: 'pickedDate' });
  assert.deepEqual(editBody(v({ kg: '0' }), h, { run: oneCrop, now, shown }), { error: 'kg must be a number over 0 up to 10,000', field: 'kg' });
});

// ---- Task 11: the Harvest page, the myGAP sheet and the Overview card ----

import {
  overviewTiles, pageTiles, harvestBars, barTip, harvestTicks, rangeText, emptyText, periodWords, roomRows, ROOM_COLUMNS, cropRows, CROP_COLUMNS,
  SHEET_TITLE, SHEET_COLUMNS,
} from '../web/harvest-math.js';

const farm = {
  from: '2026-10-06', to: '2026-11-04', days: 30, bucket: 'day',
  buckets: [{ from: '2026-11-03', to: '2026-11-03', kg: 2.4 }, { from: '2026-11-04', to: '2026-11-04', kg: 0 }],
  totals: { kg: 64.5, value: 774, cost: { costPerKg: 3.1, cost: 199.95, days: 30, water: true } },
  rooms: [
    { id: 1, name: 'Room 1', crops: [{ crop: 'oyster', blocks: 500 }], kg: 60, value: 720, current: { kg: 18.44, perBlock: 0.31, be: 34 } },
    { id: 2, name: 'Room 2', crops: [], kg: 0, value: 0, current: null },
    { id: 3, name: 'Room 3', crops: [], kg: 4.5, value: null, current: null },
  ],
  crops: [{ crop: 'oyster', kg: 60, value: 720 }, { crop: 'pink', kg: 4.5, value: null }],
  today: { kg: 2.4, value: 28.8 }, last7: { kg: 18, value: 216 }, last30: { kg: 64.5, value: 774 },
  missing: { dryKg: [], price: [] }, records: [],
};

test('the Overview card: today, 7 and 30 days, the 30-day value when known; nothing in 30 days says so', () => {
  assert.deepEqual(overviewTiles(farm), {
    tiles: [
      { label: 'Today', value: `2.4${nb}kg`, line: null, note: null },
      { label: '7 days', value: `18.0${nb}kg`, line: null, note: null },
      { label: '30 days', value: `64.5${nb}kg`, line: `RM${nb}774.00`, note: null },
    ],
    empty: null,
  });
  assert.deepEqual(overviewTiles({ ...farm, last30: { kg: 64.5, value: null, unpriced: ['pink'] } }).tiles[2], { label: '30 days', value: `64.5${nb}kg`, line: null, note: 'Pink oyster not priced' });
  assert.deepEqual(overviewTiles({ ...farm, last30: { kg: 64.5, value: 720, unpriced: ['pink', 'lionsmane'] } }).tiles[2],
    { label: '30 days', value: `64.5${nb}kg`, line: `RM${nb}720.00`, note: "Pink oyster, Lion's mane not priced" });
  assert.deepEqual(overviewTiles({ ...farm, today: { kg: 0, value: 0 }, last7: { kg: 0, value: 0 }, last30: { kg: 0, value: 0 } }),
    { tiles: [], empty: 'No harvests in the last 30 days.' });
});

test("the page's tiles: kg, RM value, cost per kg with what it counts", () => {
  assert.deepEqual(pageTiles(farm), [
    { label: 'kg', value: `64.5${nb}kg` },
    { label: 'RM value', value: `RM${nb}774.00` },
    { label: 'Cost per kg', value: `RM${nb}3.10`, line: `electricity and water${dot}30${nb}days` },
  ]);
  assert.equal(pageTiles({ ...farm, totals: { ...farm.totals, value: 720, unpriced: ['pink'] } })[1].line, `without Pink oyster (4.5${nb}kg, no price)`, 'the kg from By crop');
  const none = pageTiles({ ...farm, totals: { kg: 0, value: null, cost: { costPerKg: null, cost: 0, days: 30, water: false } } });
  assert.deepEqual(none.map((t) => t.value), [`0.0${nb}kg`, '—', '—']);
});

test('the bars: one per bucket in the farm time, a whole slot each (the last one too), the range over them', () => {
  const day = (y, m, d) => Date.UTC(y, m - 1, d) - 8 * 3_600_000; // the farm's midnight
  const { bars, range } = harvestBars(farm);
  assert.deepEqual(bars.map(({ from, to, v }) => ({ from, to, v })), [
    { from: day(2026, 11, 3), to: day(2026, 11, 4), v: 2.4 },
    { from: day(2026, 11, 4), to: day(2026, 11, 5), v: 0 },
  ]);
  assert.deepEqual(range, { from: day(2026, 11, 3), to: day(2026, 11, 5) });
  const weeks = harvestBars({ ...farm, bucket: 'week', buckets: [{ from: '2026-11-02', to: '2026-11-04', kg: 12 }] });
  assert.deepEqual([weeks.bars[0].from, weeks.bars[0].to], [day(2026, 11, 2), day(2026, 11, 9)], 'the week under way: its whole week');
  const months = harvestBars({ ...farm, bucket: 'month', buckets: [{ from: '2026-12-01', to: '2026-12-31', kg: 1 }, { from: '2027-01-01', to: '2027-01-04', kg: 2 }] });
  assert.deepEqual(months.bars.map((b) => [b.from, b.to]), [[day(2026, 12, 1), day(2027, 1, 1)], [day(2027, 1, 1), day(2027, 2, 1)]]);
  assert.deepEqual(harvestBars({ ...farm, buckets: [] }), { bars: [], range: null });
});

test("a bar's tip: the day, the week or the month, and its kg", () => {
  assert.equal(barTip('day', { from: '2026-11-03', kg: 2.4 }), `3 Nov${dot}2.4${nb}kg`);
  assert.equal(barTip('week', { from: '2026-11-02', kg: 12 }), `Week of 2 Nov${dot}12.0${nb}kg`);
  assert.equal(barTip('month', { from: '2026-11-01', kg: 64.5 }), `Nov 2026${dot}64.5${nb}kg`);
});

test('the ticks: under the bars, the last bar always, as many as the width takes', () => {
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.UTC(2026, 9, 6 + i)).toISOString().slice(0, 10);
    return { from: d, to: d, kg: 1 };
  });
  const f = { ...farm, buckets: days };
  const { bars } = harvestBars(f);
  const wide = harvestTicks(f, 1200);
  const narrow = harvestTicks(f, 360);
  assert.ok(narrow.length < wide.length && narrow.length >= 2);
  for (const ticks of [wide, narrow]) {
    const last = ticks[ticks.length - 1];
    assert.deepEqual(last, { at: (bars[29].from + bars[29].to) / 2, label: '4 Nov' });
  }
  assert.deepEqual(harvestTicks({ ...farm, bucket: 'week', buckets: [{ from: '2026-11-02', to: '2026-11-04', kg: 1 }] }, 800).map((t) => t.label), ['2 Nov']);
  assert.deepEqual(harvestTicks({ ...farm, bucket: 'month', buckets: [{ from: '2026-12-01', to: '2026-12-31', kg: 1 }, { from: '2027-01-01', to: '2027-01-04', kg: 2 }] }, 800)
    .map((t) => t.label), ['Dec', 'Jan 2027'], 'January carries its year');
  assert.deepEqual(harvestTicks({ ...farm, buckets: [] }, 800), []);
});

test('the range in words: one month, two months, two years', () => {
  assert.equal(rangeText({ from: '2026-11-01', to: '2026-11-04' }), `1–4 Nov 2026`);
  assert.equal(rangeText({ from: '2026-10-06', to: '2026-11-04' }), `6 Oct – 4 Nov 2026`);
  assert.equal(rangeText({ from: '2025-12-01', to: '2026-11-04' }), `1 Dec 2025 – 4 Nov 2026`);
  assert.equal(rangeText({ from: '2026-11-04', to: '2026-11-04' }), `4 Nov 2026`);
  assert.equal(emptyText(7), 'No harvests in the last 7 days.');
  assert.equal(emptyText(90), 'No harvests in the last 13 weeks.');
  assert.equal(emptyText(365), 'No harvests in the last 12 months.');
  assert.deepEqual([7, 30, 90, 365].map(periodWords), ['7 days', '30 days', '13 weeks', '12 months'], 'the segments: what the buckets cover');
});

test('By room: the rooms that picked or have a run, with the run’s kg per block and BE; By crop', () => {
  assert.deepEqual(ROOM_COLUMNS, ['Room', 'kg', 'RM value', 'kg per block', 'BE']);
  assert.deepEqual(roomRows(farm), [
    {
      id: 1, name: 'Room 1', crops: [{ crop: 'oyster', blocks: 500 }], cells: [`60.0${nb}kg`, `RM${nb}720.00`, `0.31${nb}kg`, `34${nb}%`], without: null,
      run: `This run 0.31${nb}kg per block${dot}BE 34${nb}%`,
    },
    { id: 3, name: 'Room 3', crops: [], cells: [`4.5${nb}kg`, '—', '—', '—'], without: null, run: null },
  ]);
  const partial = roomRows({ ...farm, rooms: [{ ...farm.rooms[0], value: 600, unpriced: ['lionsmane'] }] })[0];
  assert.equal(partial.without, "without Lion's mane", 'a room value without a crop says so under it');
  assert.equal(roomRows({ ...farm, rooms: [{ ...farm.rooms[0], current: { kg: 1, perBlock: 0.45, be: null } }] })[0].run, `This run 0.45${nb}kg per block`, 'a phone: the run under the name');
  assert.deepEqual(CROP_COLUMNS, ['Crop', 'kg', 'RM value']);
  assert.deepEqual(cropRows(farm), [
    { crop: 'oyster', name: 'Grey oyster', cells: [`60.0${nb}kg`, `RM${nb}720.00`] },
    { crop: 'pink', name: 'Pink oyster', cells: [`4.5${nb}kg`, '—'] },
  ]);
});

test('the myGAP sheet: its title and columns, the last five for the farmer to fill', () => {
  assert.equal(SHEET_TITLE, `myGAP 4-6${dot}Production and sales record (Rekod pengeluaran dan penjualan hasil)`);
  assert.deepEqual(SHEET_COLUMNS, ['Date', 'Crop', 'Block / location', 'Harvested (kg)', 'Sold (kg)', 'Price / kg (RM)', 'Total (RM)', 'Invoice No.', 'Buyer']);
});

import { chartTitle, chartLabel } from '../web/harvest-math.js';

test("the chart's title and what it says to a screen reader", () => {
  assert.equal(chartTitle(farm), 'kg picked per day');
  assert.equal(chartTitle({ ...farm, bucket: 'week' }), 'kg picked per week');
  assert.equal(chartLabel(farm), `kg picked per day, 6 Oct – 4 Nov 2026: 64.5${nb}kg in all; the most 2.4${nb}kg, 3 Nov`);
  assert.equal(chartLabel({ ...farm, bucket: 'month', buckets: [{ from: '2026-11-01', to: '2026-11-04', kg: 0 }] }), `kg picked per month, 6 Oct – 4 Nov 2026: 64.5${nb}kg in all`);
});

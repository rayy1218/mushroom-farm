import test from 'node:test';
import assert from 'node:assert/strict';
import { kgText, perBlockText, beText, rmText, costText, summaryLine, flushColumns, sheetRows } from '../web/harvest-math.js';

const nb = ' ';
const dot = `${nb}· `;

test('formats: kg, per block, BE, RM, cost', () => {
  assert.equal(kgText(18.44), `18.4${nb}kg`);
  assert.equal(kgText(2.35, { exact: true }), `2.35${nb}kg`);
  assert.equal(kgText(2, { exact: true }), `2${nb}kg`);
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
  assert.deepEqual(flushColumns([{ crop: 'oyster' }]), ['Flush', 'Days', 'kg', 'kg per block', 'BE']);
  assert.deepEqual(flushColumns([{ crop: 'oyster' }, { crop: 'lionsmane' }]), ['Flush', 'Days', 'Grey oyster kg', "Lion's mane (draft) kg", 'kg', 'kg per block', 'BE']);
});

test('sheet rows: the myGAP columns, the sales cells blank', () => {
  const rows = sheetRows([{ date: '2026-11-03', roomName: 'Room 1', crop: 'oyster', runStartedAt: Date.UTC(2026, 9, 2, 16), kg: 3.5 }]);
  assert.deepEqual(rows[0], ['3 Nov 2026', 'Grey oyster', `Room 1${dot}run of 3 Oct`, '3.5', '', '', '', '', '']);
});

// ---- Task 9: the Harvest room tab ----

import { runHead, harvestLine, pastRow, missingNote, flushRows, byCropRows, runTiles, deleteQuestion, whenValue, whenMs, recordBody, editBody } from '../web/harvest-math.js';

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
  assert.equal(runHead(mixed), `Blocks in 3 Oct${dot}Grey oyster 300${nb}blocks${dot}Lion's mane (draft) 1,200${nb}blocks`);
  assert.equal(runHead({ ...oneCrop, crops: [{ crop: 'oyster', blocks: 1 }] }), `Blocks in 3 Oct${dot}Grey oyster 1${nb}block`);
});

test('a harvest line: when, what (the crop only in a mixed room), kg exact, who, from', () => {
  const h = { id: 9, crop: 'oyster', flush: 2, kg: 2.35, pickedAt: at(2026, 11, 4, 8, 12), worker: 'Ali', taskId: 41 };
  assert.deepEqual(harvestLine(h, { mixed: false }), { when: '4 Nov 08:12', what: 'Flush 2', kg: `2.35${nb}kg`, who: 'Ali', from: 'from the harvest check' });
  assert.deepEqual(harvestLine({ ...h, taskId: null }, { mixed: true }), { when: '4 Nov 08:12', what: `Grey oyster${dot}flush 2`, kg: `2.35${nb}kg`, who: 'Ali', from: 'recorded' });
  assert.equal(harvestLine({ ...h, flush: null }, { mixed: false }).what, 'Before records');
  assert.equal(harvestLine({ ...h, flush: null }, { mixed: true }).what, `Grey oyster${dot}before records`);
  assert.equal(harvestLine({ ...h, worker: null }, { mixed: false }).who, '');
});

test('a past run: its dates and the figures that are known', () => {
  const run = { ...oneCrop, endedAt: at(2026, 11, 2, 10) };
  assert.deepEqual(pastRow(run), {
    title: '3 Oct – 2 Nov',
    cells: [`Grey oyster 500${nb}blocks`, `18.4${nb}kg`, `0.04${nb}kg per block`, `BE 34${nb}%`, `RM${nb}221.28`, `RM${nb}3.10 per${nb}kg`],
  });
  const missingFigures = { ...run, partial: true, be: null, value: null, cost: null };
  assert.deepEqual(pastRow(missingFigures).cells.slice(3), ['—', '—', '—']);
  assert.equal(pastRow(missingFigures).title, 'Recorded 3 Oct – 2 Nov');
  assert.equal(pastRow({ ...run, startedAt: at(2025, 12, 28, 9), endedAt: at(2026, 1, 30, 9) }).title, '28 Dec 2025 – 30 Jan 2026');
  assert.equal(pastRow({ ...run, startedAt: at(2026, 11, 2, 9), endedAt: at(2026, 11, 2, 15) }).title, '2 Nov');
});

test('the missing note names the crops and what to set', () => {
  assert.equal(missingNote({ dryKg: ['oyster'], price: [] }), 'Set the dry substrate per block of Grey oyster in Settings → Yield.');
  assert.equal(missingNote({ dryKg: [], price: ['oyster', 'lionsmane'] }), "Set the price of Grey oyster and Lion's mane (draft) in Settings → Yield.");
  assert.equal(missingNote({ dryKg: ['oyster'], price: ['lionsmane'] }), "Set the dry substrate per block of Grey oyster and the price of Lion's mane (draft) in Settings → Yield.");
  assert.equal(missingNote({ dryKg: ['lionsmane'], price: ['lionsmane'] }), "Set the dry substrate per block and the price of Lion's mane (draft) in Settings → Yield.");
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
    ["Lion's mane (draft)", `1,200${nb}blocks`, `8.4${nb}kg`, `0.01${nb}kg`, '—', '—'],
  ]);
});

test('the tiles: kg, kg per block, BE, RM value, cost per kg with what it counts', () => {
  assert.deepEqual(runTiles(oneCrop), [
    { label: 'Picked', value: `18.4${nb}kg` },
    { label: 'Per block', value: `0.04${nb}kg` },
    { label: 'Biological efficiency', value: `34${nb}%` },
    { label: 'Value', value: `RM${nb}221.28` },
    { label: 'Cost per kg', value: `RM${nb}3.10`, line: `electricity and water over 46${nb}days at today’s prices` },
  ]);
  const none = runTiles({ ...oneCrop, kg: 0, perBlock: 0, be: null, value: null, cost: { costPerKg: null, cost: 4, days: 2, water: false } });
  assert.deepEqual(none.map((t) => t.value), [`0.0${nb}kg`, `0.00${nb}kg`, '—', '—', '—']);
  assert.equal(none[4].line, undefined);
  assert.equal(runTiles({ ...oneCrop, cost: null })[4].value, '—');
});

test('the delete question', () => {
  assert.equal(deleteQuestion({ crop: 'oyster', kg: 2.4, pickedAt: at(2026, 11, 4, 8, 12) }), `Delete 2.4${nb}kg of Grey oyster picked 4 Nov 08:12?`);
});

test('the time box in the farm time: shown, read back', () => {
  assert.equal(whenValue(at(2026, 11, 4, 8, 12) + 37_000), '2026-11-04T08:12');
  assert.equal(whenMs('2026-11-04T08:12'), at(2026, 11, 4, 8, 12));
  assert.ok(Number.isNaN(whenMs('')));
  assert.ok(Number.isNaN(whenMs('4 Nov')));
});

test('Record a harvest: the body, the checks, the time left out when it is still the one shown', () => {
  const now = at(2026, 11, 4, 9, 0) + 20_000;
  const run = { ...mixed, startedAt: at(2026, 10, 3, 9, 30) + 45_000 };
  const shown = whenValue(now);
  assert.deepEqual(recordBody({ crop: 'lionsmane', kg: ' 2.35 ', worker: 'Ali', pickedAt: shown }, { run, now, shown }), { crop: 'lionsmane', kg: 2.35, worker: 'Ali' });
  assert.deepEqual(recordBody({ kg: '1', worker: 'Ali', pickedAt: '2026-11-03T17:05' }, { run: oneCrop, now, shown }), { crop: 'oyster', kg: 1, worker: 'Ali', pickedAt: at(2026, 11, 3, 17, 5) });
  // the run's first minute: the run's start (the box has no seconds)
  assert.equal(recordBody({ crop: 'oyster', kg: '1', worker: 'Ali', pickedAt: '2026-10-03T09:30' }, { run, now, shown }).pickedAt, run.startedAt);
  assert.deepEqual(recordBody({ crop: 'oyster', kg: '', worker: 'Ali', pickedAt: shown }, { run, now, shown }), { error: 'Give the kg picked', field: 'kg' });
  for (const kg of ['0', '-1', 'abc', '10001', '1.2345']) {
    assert.deepEqual(recordBody({ crop: 'oyster', kg, worker: 'Ali', pickedAt: shown }, { run, now, shown }), { error: 'kg must be a number over 0 up to 10,000', field: 'kg' }, kg);
  }
  assert.deepEqual(recordBody({ crop: 'oyster', kg: '1', worker: 'Ali', pickedAt: '' }, { run, now, shown }), { error: 'Pick a date and time', field: 'pickedAt' });
  assert.deepEqual(recordBody({ crop: 'oyster', kg: '1', worker: 'Ali', pickedAt: '2026-10-03T09:29' }, { run, now, shown }), { error: "Pick a time from the run's start to now", field: 'pickedAt' });
  assert.deepEqual(recordBody({ crop: 'oyster', kg: '1', worker: 'Ali', pickedAt: '2026-11-04T09:01' }, { run, now, shown }), { error: "Pick a time from the run's start to now", field: 'pickedAt' });
  assert.deepEqual(recordBody({ crop: 'oyster', kg: '1', worker: '', pickedAt: shown }, { run, now, shown }), { error: 'Pick who picked it', field: 'worker' });
});

test('Edit a harvest: only what changed; nothing changed is an empty body', () => {
  const now = at(2026, 11, 4, 9, 0);
  const h = { id: 9, crop: 'oyster', kg: 2.35, pickedAt: at(2026, 11, 4, 8, 12) + 37_000 };
  const shown = whenValue(h.pickedAt);
  assert.deepEqual(editBody({ kg: '2.35', pickedAt: shown }, h, { run: oneCrop, now, shown }), {});
  assert.deepEqual(editBody({ kg: '2.4', pickedAt: shown }, h, { run: oneCrop, now, shown }), { kg: 2.4 });
  assert.deepEqual(editBody({ kg: '2.35', pickedAt: '2026-11-04T07:00' }, h, { run: oneCrop, now, shown }), { pickedAt: at(2026, 11, 4, 7) });
  const ended = { ...oneCrop, endedAt: at(2026, 11, 2, 10) };
  assert.deepEqual(editBody({ kg: '2.35', pickedAt: '2026-11-03T07:00' }, h, { run: ended, now, shown }), { error: "Pick a time from the run's start to its end", field: 'pickedAt' });
  assert.deepEqual(editBody({ kg: '0', pickedAt: shown }, h, { run: oneCrop, now, shown }), { error: 'kg must be a number over 0 up to 10,000', field: 'kg' });
});

// The Batches pages' pure parts (spec 2026-11-05-batches-design.md 7).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rmText, blocksText, blockKgText, numberOf, overNotes, deliveryLine, waterText, dateText, agoText, goodText, countBlocks, weightText, pageGroups, pastIn, pastCells,
  detailFacts, overNote, batchLineFor, sheetRows, SHEET_COLUMNS, receiveBody, receiveValues, placeBody, roomChoices, checkBody,
  checkLine, statusLine, roomRunText, figureLine, waitingLong, waitingLine, placedLine, BATCH_WAIT_DAYS, runOf, runYieldFacts, csvHref, stockNote,
} from '../web/batches-math.js';

const nb = '\u00a0';
const dot = `${nb}· `;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const b = (o) => ({ id: 1, parentId: null, kind: 'bought', crop: 'oyster', supplier: 'Agro Supplies', receivedAt: NOW - 2 * DAY, blocks: 1200,
  lost: 0, good: 1200, pricePerBlock: 2.3, spawnBatch: '0912', strain: null, deliveryRef: null, inoculatedAt: null, blockKg: null,
  waterPct: null, dryKg: null, runId: null, roomId: null, roomName: null, runStartedAt: null, runEndedAt: null, runBlocks: null,
  placedAt: null, note: null, status: 'waiting', ...o });

test('the formatter', () => {
  assert.equal(rmText(2185), `RM${nb}2,185.00`);
  assert.equal(rmText(null), '—');
  assert.equal(blocksText(1200), `1,200${nb}blocks`);
  assert.equal(blocksText(1), `1${nb}block`);
  assert.equal(blockKgText(2.3), `2.30${nb}kg`);
  assert.equal(waterText(60), `60${nb}%`);
  assert.equal(dateText(NOW, '2026-11-05'), '5 Nov');
  assert.equal(dateText(Date.UTC(2025, 0, 3, 4), '2026-11-05'), '3 Jan 2025');
  assert.equal(agoText(NOW, NOW), 'today');
  assert.equal(agoText(NOW - DAY, NOW), 'yesterday');
  assert.equal(agoText(NOW - 12 * DAY, NOW), `12${nb}days${nb}ago`, 'kept whole at a wrap');
  assert.equal(goodText(b({})), `1,200${nb}blocks`);
  assert.equal(goodText(b({ lost: 20, good: 1180 })), '1,180 of 1,200 good');
  assert.equal(countBlocks(1200, 'oyster'), '1,200 Grey oyster blocks');
  assert.equal(countBlocks(1, 'pink'), '1 Pink oyster block');
  assert.equal(weightText(b({ blockKg: 2.3, waterPct: 60, dryKg: 0.92 })), `2.30${nb}kg${dot}60${nb}% water${dot}0.92${nb}kg dry`);
  assert.equal(weightText(b({})), null);
});

test('the page\'s groups: waiting, in rooms by run with the over-count note, past', () => {
  const run = { runId: 4, roomId: 2, roomName: 'Container 1', runStartedAt: NOW - 5 * DAY, runBlocks: 950, status: 'placed' };
  const list = [
    b({ id: 1 }),
    b({ id: 2, ...run, blocks: 800 }),
    b({ id: 3, ...run, blocks: 400 }),
    b({ id: 4, runId: 3, roomName: 'Container 2', runEndedAt: NOW - DAY, status: 'past' }),
  ];
  const g = pageGroups(list);
  assert.deepEqual(g.waiting.map((x) => x.id), [1]);
  assert.equal(g.rooms.length, 1);
  assert.deepEqual(g.rooms[0].batches.map((x) => x.id), [2, 3]);
  assert.deepEqual(g.rooms[0].over, ['Batches hold 1,200 Grey oyster blocks; the run has 950.']);
  assert.deepEqual(g.past.map((x) => x.id), [4]);
  assert.deepEqual(pastIn([b({ receivedAt: NOW - 100 * DAY }), b({ receivedAt: NOW - 10 * DAY })], 90, NOW).length, 1);
  assert.equal(pastIn([b({ receivedAt: NOW - 400 * DAY })], null, NOW).length, 1);
  assert.deepEqual(pastCells(b({ ...run, lost: 3 }), '2026-11-05'),
    ['3 Nov', 'Grey oyster', 'Agro Supplies', '0912', '1,200', '3', `RM${nb}2.30`, `Container 1${dot}run of 31 Oct`]);
  assert.equal(pastCells(b({ ...run }), '2026-11-05')[5], '—', 'none lost: a dash');
});

test('a batch: its facts, the over-count note, its status line, a check\'s line', () => {
  const one = b({ strain: 'PL-27', blockKg: 2.3, waterPct: 60, dryKg: 0.92, delivery: [b({ blocks: 800 }), b({ id: 2, parentId: 1, blocks: 400 })] });
  assert.deepEqual(detailFacts(one), [
    ['Spawn batch', '0912'], ['Strain', 'PL-27'], ['Block weight', `2.30${nb}kg${dot}60${nb}% water${dot}0.92${nb}kg dry`],
    ['Price per block', `RM${nb}2.30`], ['Whole delivery', `1,200${nb}blocks${dot}RM${nb}2,760.00`],
  ]);
  assert.equal(overNote(b({ status: 'placed', runBlocks: 950, batchBlocks: 1200 })), 'Batches hold 1,200 Grey oyster blocks; the run has 950.');
  assert.equal(overNote(b({ status: 'placed', runBlocks: 950, batchBlocks: 950 })), null);
  assert.equal(statusLine(b({})), 'Waiting');
  assert.equal(statusLine(b({ status: 'placed', roomName: 'Container 1' })), `In${nb}Container${nb}1`, 'kept whole at a wrap');
  assert.equal(statusLine(b({ status: 'past', roomName: 'Container 1' })), `Past${dot}Container 1`);
  assert.equal(checkLine({ at: NOW, lost: 20, cause: 'green', worker: 'Ali' }, '2026-11-05'), `5 Nov 12:00${dot}20${nb}blocks lost${dot}Green mould${dot}Ali`);
});

test('batchLineFor: null without batches; one batch; several', () => {
  const run = { id: 4 };
  assert.equal(batchLineFor(run, { batches: [], blockCost: 0 }), null);
  assert.equal(batchLineFor(null, { batches: [b({})] }), null);
  assert.deepEqual(batchLineFor(run, { batches: [b({ id: 7, blocks: 950 })], blockCost: 2185 }),
    { text: `Blocks${dot}Agro Supplies${dot}spawn batch 0912${dot}950${nb}blocks${dot}RM${nb}2,185.00`, href: '#/business/batches/7' });
  assert.deepEqual(batchLineFor(run, { batches: [b({ id: 7, blocks: 800 }), b({ id: 8, blocks: 400, pricePerBlock: null })], blockCost: null }),
    { text: `Blocks${dot}2 batches${dot}1,200${nb}blocks`, href: '#/business/batches?run=4' });
  assert.ok(batchLineFor(run, { batches: [b({ id: 7, blocks: 480 })], blockCost: 1340.9, blockCostPartial: true }).text.endsWith(`RM${nb}1,340.90, some with no price`),
    'Money truth: a made delivery with a material unpriced');
});

test('the myGAP 4-2 sheet: a receipt row per delivery and a use row per placement in the dates, by date', () => {
  assert.equal(SHEET_COLUMNS.length, 10);
  const first = b({ id: 1, blocks: 400, strain: 'PL-27', receivedAt: Date.UTC(2026, 10, 2, 4) });
  const part = b({ id: 2, parentId: 1, blocks: 800, placedAt: Date.UTC(2026, 10, 3, 4), runId: 4, roomName: 'Container 1', runStartedAt: Date.UTC(2026, 9, 3, 4) });
  const old = b({ id: 3, receivedAt: Date.UTC(2026, 6, 1, 4), pricePerBlock: null, supplier: 'Old' });
  const rows = sheetRows([part, first, old], { from: '2026-11-01', to: '2026-11-30', today: '2026-11-05' });
  assert.deepEqual(rows, [
    ['2 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, `1,200${nb}blocks`, `RM${nb}2.30`, '', '', '', '', '', 'Agro Supplies'],
    ['3 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, '', '', `800${nb}blocks`, `Container 1${dot}run of 3 Oct`, '', '', '', ''],
  ]);
  assert.equal(sheetRows([old], { from: '2026-07-01', to: '2026-07-01', today: '2026-11-05' })[0][3], '', 'an unknown price: blank to write in');
});

test('the dialogs\' bodies', () => {
  const v = { crop: 'oyster', supplier: 'Agro', receivedDate: '2026-11-03', blocks: '1,200', pricePerBlock: '2.30', spawnBatch: '0912',
    strain: '', deliveryRef: '', inoculatedDate: '', blockKg: '', waterPct: '60', note: '' };
  const r = receiveBody(v);
  assert.deepEqual(r.body, { crop: 'oyster', supplier: 'Agro', receivedAt: Date.UTC(2026, 10, 2, 16), blocks: 1200, pricePerBlock: 2.3,
    spawnBatch: '0912', strain: '', deliveryRef: '', note: '', inoculatedAt: null, blockKg: null, waterPct: null });
  assert.equal(receiveBody({ ...v, blockKg: '2.3' }).body.waterPct, 60, 'water counts only with a weight');
  assert.deepEqual(receiveBody({ ...v, blocks: '12.5' }).field, 'blocks');
  assert.deepEqual(receiveBody({ ...v, pricePerBlock: 'two' }).field, 'pricePerBlock');
  assert.deepEqual(receiveBody({ ...v, receivedDate: '' }).field, 'receivedDate');
  const edit = receiveBody(v, { edit: { cropEditable: false, blocksEditable: false } }).body;
  assert.equal('crop' in edit || 'blocks' in edit, false);
  assert.equal(receiveValues(null).waterPct, '60');
  assert.equal(receiveValues(b({ pricePerBlock: 2.3, blockKg: 2.3, waterPct: 60 })).pricePerBlock, '2.3');
  assert.deepEqual(placeBody({ roomId: '3', blocks: '' }, 1200).body, { roomId: 3, blocks: 1200 });
  assert.equal(placeBody({ roomId: '', blocks: '' }, 1200).field, 'roomId');
  const rooms = [
    { id: 1, name: 'Room 1', crop: { crops: [] } },
    { id: 2, name: 'Container 1', crop: { crops: [{ crop: 'oyster', blocks: 950 }] } },
    { id: 3, name: 'Container 2', crop: { crops: [{ crop: 'pink', blocks: 600 }] } },
  ];
  assert.deepEqual(roomChoices(rooms, 'oyster'), { ok: [[2, 'Container 1']], off: ['Room 1 (no crops)', 'Container 2 (no Grey oyster)'] });
  // with the batches in the rooms' current runs (GET /api/batches?status=placed): each offered room says its blocks of the crop
  const placed = [b({ id: 7, status: 'placed', roomId: 2, blocks: 500 }), b({ id: 8, status: 'placed', roomId: 2, blocks: 300 }),
    b({ id: 9, status: 'placed', roomId: 2, crop: 'pink', blocks: 99 }), b({ id: 10, status: 'past', roomId: 2, blocks: 50 })];
  assert.deepEqual(roomChoices(rooms, 'oyster', placed).ok, [[2, `Container 1${dot}800${nb}blocks in batches`]]);
  assert.deepEqual(roomChoices([...rooms, { id: 4, name: 'Container 3', crop: { crops: [{ crop: 'oyster', blocks: 10 }] } }], 'oyster', placed).ok[1], [4, 'Container 3']);
  const c = checkBody({ checkDate: '2026-11-05', checkTime: '8:12', lost: '20', cause: 'green', worker: 'Ali', note: '' });
  assert.deepEqual(c.body, { at: Date.UTC(2026, 10, 5, 0, 12), lost: 20, cause: 'green', worker: 'Ali', note: '' });
  assert.equal(checkBody({ checkDate: '2026-11-05', checkTime: '25:00', lost: '1', cause: 'green', worker: 'Ali' }).field, 'checkTime');
  assert.equal('worker' in checkBody({ checkDate: '2026-11-05', checkTime: '08:00', lost: '1', cause: 'green', worker: '' }, { edit: true }).body, false);
});

test('a batch whose room was deleted keeps its placement: "a deleted room"', () => {
  const gone = b({ placedAt: NOW - DAY, status: 'past' });
  assert.equal(roomRunText(gone, '2026-11-05'), 'a deleted room');
  assert.equal(roomRunText(b({}), '2026-11-05'), '—');
  assert.equal(pastCells(gone, '2026-11-05')[7], 'a deleted room');
  assert.equal(statusLine(gone), `Past${dot}a deleted room`);
  assert.equal(sheetRows([gone], { from: '2026-11-04', to: '2026-11-04', today: '2026-11-05' })[0][5], 'a deleted room');
});

test('the run of a past year says its year; the sheet counts the blocks that went in', () => {
  const run = { roomName: 'Container 1', runStartedAt: Date.UTC(2025, 9, 3, 4) };
  assert.equal(roomRunText(b(run), '2026-11-05'), `Container 1${dot}run of 3 Oct 2025`);
  assert.equal(roomRunText(b({ ...run, runStartedAt: Date.UTC(2026, 9, 3, 4) }), '2026-11-05'), `Container 1${dot}run of 3 Oct`);
  const placed = b({ ...run, blocks: 600, usedBlocks: 590, placedAt: Date.UTC(2026, 10, 3, 4), status: 'placed' });
  const rows = sheetRows([placed], { from: '2026-11-03', to: '2026-11-03', today: '2026-11-05' });
  assert.equal(rows[1][4], `590${nb}blocks`, 'after the receipt of the same day');
  assert.equal(rows[1][5], `Container 1${dot}run of 3 Oct 2025`);
  assert.equal(sheetRows([{ ...placed, usedBlocks: undefined }], { from: '2026-11-03', to: '2026-11-03', today: '2026-11-05' })[1][4], `600${nb}blocks`, 'an older server: the blocks');
});

test('typed numbers: commas only as thousands groups', () => {
  assert.equal(numberOf('1,200'), 1200);
  assert.equal(numberOf('1,200,000.5'), 1200000.5);
  assert.equal(numberOf('2,30'), NaN);
  assert.equal(numberOf('12,34'), NaN);
  assert.equal(numberOf(',200'), NaN);
  assert.equal(numberOf('1,2000'), NaN);
  assert.equal(numberOf('.5'), 0.5);
  assert.equal(numberOf('5.'), NaN);
  assert.equal(numberOf('-3'), NaN);
  assert.equal(numberOf('  7 '), 7);
  assert.equal(numberOf(''), null);
  assert.equal(numberOf(undefined), null);
  assert.equal(numberOf('1e3'), NaN);
});

test('farm time near midnight (UTC+8): 00:30 farm is the previous day 16:30 UTC', () => {
  const late = Date.UTC(2026, 10, 4, 15, 30); // 4 Nov 23:30 farm
  const early = Date.UTC(2026, 10, 4, 16, 30); // 5 Nov 00:30 farm
  assert.equal(dateText(late, '2026-11-05'), '4 Nov');
  assert.equal(dateText(early, '2026-11-05'), '5 Nov');
  assert.equal(agoText(late, early), 'yesterday', '23:30 to 00:30 is across midnight');
  assert.equal(agoText(early, early + 23 * 3_600_000), 'today');
  assert.equal(agoText(late, late + 60_000), 'today');
  // 90 days: the first day is 89 farm days back (8 Aug), whatever the hour
  const nowEarly = early;
  const nowLate = Date.UTC(2026, 10, 5, 15, 30); // 5 Nov 23:30 farm
  const edge = (ms) => [b({ receivedAt: ms })];
  assert.equal(pastIn(edge(Date.UTC(2026, 7, 7, 16, 30)), 90, nowEarly).length, 1, '8 Aug 00:30 farm is in, at 00:30');
  assert.equal(pastIn(edge(Date.UTC(2026, 7, 7, 15, 30)), 90, nowEarly).length, 0, '7 Aug 23:30 farm is out, at 00:30');
  assert.equal(pastIn(edge(Date.UTC(2026, 7, 7, 16, 30)), 90, nowLate).length, 1, '8 Aug 00:30 farm is in, at 23:30');
  assert.equal(pastIn(edge(Date.UTC(2026, 7, 7, 15, 30)), 90, nowLate).length, 0, '7 Aug 23:30 farm is out, at 23:30');
});

test('a receipt and a use on the same day: the receipt first', () => {
  const day = Date.UTC(2026, 10, 3, 1); // 3 Nov 09:00 farm
  const first = b({ id: 9, receivedAt: day, blocks: 500, placedAt: day + 3_600_000, usedBlocks: 500, roomName: 'Container 1', runStartedAt: day - DAY, status: 'placed' });
  const other = b({ id: 2, receivedAt: day - 5 * DAY, blocks: 100 });
  const rows = sheetRows([first, other], { from: '2026-11-03', to: '2026-11-03', today: '2026-11-05' });
  assert.equal(rows.length, 2);
  assert.equal(rows[0][2], `500${nb}blocks`, 'the receipt');
  assert.equal(rows[0][4], '');
  assert.equal(rows[1][2], '');
  assert.equal(rows[1][4], `500${nb}blocks`, 'the use');
});

test('overNotes with two crops: one note per crop that holds more than the run', () => {
  const list = [
    b({ id: 1, crop: 'oyster', blocks: 800, runBlocks: 950 }), b({ id: 2, crop: 'oyster', blocks: 400, runBlocks: 950 }),
    b({ id: 3, crop: 'pink', blocks: 300, runBlocks: 600 }), b({ id: 4, crop: 'king', blocks: 70, runBlocks: 50 }),
  ];
  const notes = overNotes(list);
  assert.equal(notes.length, 2);
  assert.ok(notes.includes('Batches hold 1,200 Grey oyster blocks; the run has 950.'));
  assert.ok(notes.some((n) => n.startsWith('Batches hold 70 ') && n.endsWith('the run has 50.')));
  assert.deepEqual(overNotes([b({ blocks: 5, runBlocks: null })]), []);
});

test('receiveBody: a weight with no water is null; checkBody: an empty date', () => {
  const v = { crop: 'oyster', supplier: '', receivedDate: '2026-11-03', blocks: '10', pricePerBlock: '', spawnBatch: '', strain: '',
    deliveryRef: '', inoculatedDate: '', blockKg: '2.3', waterPct: '', note: '' };
  const r = receiveBody(v);
  assert.equal(r.body.blockKg, 2.3);
  assert.equal(r.body.waterPct, null, 'the server then refuses the weight without water: the box says nothing is sent for water');
  assert.equal(checkBody({ checkDate: '', checkTime: '08:00', lost: '1', cause: 'green', worker: 'Ali' }).field, 'checkDate');
  assert.equal(checkBody({ checkDate: undefined, checkTime: '08:00', lost: '1', cause: 'green', worker: 'Ali' }).field, 'checkDate');
});

test('a deleted room in a delivery line and a status line', () => {
  const gone = b({ id: 2, parentId: 1, blocks: 300, placedAt: NOW - DAY, status: 'past' });
  assert.equal(deliveryLine(gone), `300${nb}blocks${dot}Past${dot}a deleted room`);
  assert.equal(deliveryLine(b({ blocks: 300 })), `300${nb}blocks${dot}Waiting`);
  assert.equal(statusLine(gone), `Past${dot}a deleted room`);
  assert.equal(statusLine({ ...gone, roomName: null, status: 'past' }), `Past${dot}a deleted room`);
});

test('the Delivery card marks each part: Waiting, In the room, Past · the room', () => {
  assert.equal(deliveryLine(b({ blocks: 300, status: 'placed', roomName: 'Container 1' })), `300${nb}blocks${dot}In${nb}Container${nb}1`);
  assert.equal(deliveryLine(b({ blocks: 300, status: 'past', roomName: 'Container 2' })), `300${nb}blocks${dot}Past${dot}Container 2`);
});

test("a batch's figure line: the good blocks, the lost ones only after a loss", () => {
  assert.equal(figureLine(b({ blocks: 800, lost: 12, good: 788 })), `788 good${dot}12 lost`);
  assert.equal(figureLine(b({ blocks: 1200 })), '1,200 good');
});

test('waitingLong: the waiting batches received BATCH_WAIT_DAYS or more ago, oldest first, with their line', () => {
  assert.equal(BATCH_WAIT_DAYS, 3);
  const list = [
    b({ id: 1, receivedAt: NOW - 2 * DAY, good: 100 }),
    b({ id: 2, receivedAt: NOW - 3 * DAY, blocks: 600, good: 600, crop: 'pink' }),
    b({ id: 3, receivedAt: NOW - 40 * DAY, blocks: 400, good: 400 }),
    b({ id: 4, receivedAt: NOW - 50 * DAY, status: 'placed' }),
    b({ id: 5, receivedAt: NOW - 50 * DAY, blocks: 10, lost: 10, good: 0 }),
    b({ id: 6, receivedAt: NOW - 20 * DAY, blocks: 1, good: 1 }),
  ];
  assert.deepEqual(waitingLong(list, NOW), [
    { id: 3, text: `400 Grey oyster blocks waiting 40${nb}days`, href: '#/business/batches/3' },
    { id: 6, text: `1 Grey oyster block waiting 20${nb}days`, href: '#/business/batches/6' },
    { id: 2, text: `600 Pink oyster blocks waiting 3${nb}days`, href: '#/business/batches/2' },
  ]);
  assert.deepEqual(waitingLong([], NOW), []);
  assert.deepEqual(waitingLong(null, NOW), []);
});

test("runOf and runYieldFacts: the batch's run in the room's harvests, its yield and the run's blocks' cost per kg picked", () => {
  const current = { id: 1, endedAt: null, crops: [{ crop: 'oyster', blocks: 950 }], kg: 190, perBlock: 0.2, be: 21.7, harvests: [{ id: 1 }],
    byCrop: [{ crop: 'oyster', blocks: 950, kg: 190, perBlock: 0.2, be: 21.7 }] };
  const past = { id: 2, endedAt: NOW - DAY, crops: [{ crop: 'oyster', blocks: 600 }], kg: 0, perBlock: 0, be: 0, harvests: [] };
  const reply = { current, past: [past] };
  assert.equal(runOf(reply, 1), current);
  assert.equal(runOf(reply, 2), past);
  assert.equal(runOf(reply, 9), null);
  assert.equal(runOf(null, 1), null);
  // the run's batches (GET /api/batches?run=): blockCost RM 2,185.00 for its 950 blocks; 2,185 / 190 kg = RM 11.50 a kg, as Costs
  const runReply = { batches: [b({ blocks: 950, pricePerBlock: 2.3 })], blockCost: 2185 };
  assert.equal(runYieldFacts(null, b({}), runReply), null, 'no run (a deleted room): nothing shown');
  assert.deepEqual(runYieldFacts(current, b({ pricePerBlock: 2.3 }), runReply), {
    title: 'This run', empty: null, reason: null,
    tiles: [
      { label: 'kg so far', value: `190.0${nb}kg` },
      { label: 'kg per block', value: `0.20${nb}kg` },
      { label: 'BE', title: 'Biological efficiency', value: `22${nb}%` },
    ],
    cost: `Blocks cost RM${nb}11.50 per${nb}kg picked`,
  });
  // C4 (joint audit): the run's block cost over the run's kg, not this batch's price over the kg per block
  const two = { batches: [b({ blocks: 500, pricePerBlock: 2.3 }), b({ id: 2, blocks: 450, pricePerBlock: 3 })], blockCost: 2500 };
  assert.equal(runYieldFacts(current, b({ pricePerBlock: 2.3 }), two).cost, `Blocks cost RM${nb}13.16 per${nb}kg picked`, '2,500 / 190 kg');
  assert.equal(runYieldFacts(current, b({ pricePerBlock: 2.3 })).cost, null, 'the run\'s batches not read: no cost line');
  assert.equal(runYieldFacts(current, b({ pricePerBlock: null }), { ...runReply, blockCost: null }).cost, null, 'a price unknown in the run: no cost line');
  assert.deepEqual(runYieldFacts(past, b({}), runReply), { title: 'This run', empty: 'No harvests in this run.', tiles: [], cost: null }, 'an ended run: no "yet"');
  assert.equal(runYieldFacts({ ...current, kg: 0, byCrop: [] }, b({})).empty, 'No harvests in this run yet.');
  const ended = runYieldFacts({ ...current, endedAt: NOW - DAY }, b({}), runReply);
  assert.equal(ended.tiles[0].label, 'kg', 'an ended run: its kg, not "so far"');
  assert.equal(ended.cost, `Blocks cost RM${nb}11.50 per${nb}kg picked`);
  // a mixed run: the batch's crop's own figures, the cost the whole run's (its blocks over all its kg, as Costs)
  const mixed = { ...current, crops: [{ crop: 'oyster', blocks: 500 }, { crop: 'pink', blocks: 450 }], kg: 300, perBlock: 0.32,
    byCrop: [{ crop: 'oyster', blocks: 500, kg: 125, perBlock: 0.25, be: 27 }, { crop: 'pink', blocks: 450, kg: 175, perBlock: 0.39, be: 40 }] };
  const m = runYieldFacts(mixed, b({ pricePerBlock: 2.5 }), { batches: [], blockCost: 2400 });
  assert.equal(m.title, "This run's Grey oyster");
  assert.deepEqual(m.tiles.map((t) => t.value), [`125.0${nb}kg`, `0.25${nb}kg`, `27${nb}%`]);
  assert.equal(m.cost, `The run's blocks cost RM${nb}8.00 per${nb}kg picked`, '2,400 / 300 kg, the whole run');
  const noBe = runYieldFacts({ ...current, be: null, byCrop: [] }, b({}));
  assert.equal(noBe.tiles[2].value, '—', 'no BE: a dash');
  assert.equal(noBe.reason, 'Some batches in this run have no weight', 'batches not read: the general reason');
  const noBeRun = { ...current, be: null, byCrop: [] };
  const w = (blocks, blockKg) => ({ crop: 'oyster', blocks, blockKg });
  const of = (list) => ({ batches: list, blockCost: null });
  assert.equal(runYieldFacts(noBeRun, b({}), of([w(200, null), w(300, 2.3)])).reason, "200 blocks in this run have no weight", 'some unweighted: their blocks');
  assert.equal(runYieldFacts(noBeRun, b({}), of([w(1, null), w(300, 2.3)])).reason, '1 block in this run has no weight');
  assert.equal(runYieldFacts(noBeRun, b({}), of([w(200, null), { crop: 'pink', blocks: 5, blockKg: 2 }])).reason,
    'Set the dry substrate per block of Grey oyster in Settings → Yield.', 'none weighted: Settings → Yield is the source');
  assert.equal(runYieldFacts(current, b({}), of([w(200, null)])).reason, null, 'a BE: no reason');
});

test('stockNote (C5): a line drawing on an Inventory item for more than it has in stock is told, in amber, not refused', () => {
  const items = [{ id: 7, name: 'Plastic bags', kind: 'other', unit: 'pcs', qty: 460 }, { id: 8, name: 'Sawdust', kind: 'other', unit: 'kg', qty: 120.5 }];
  assert.equal(stockNote('500', '7', items), `More than the 460${nb}pcs in stock`);
  assert.equal(stockNote('460', '7', items), null, 'all of it: fine');
  assert.equal(stockNote('121', '8', items), `More than the 120.5${nb}kg in stock`);
  assert.equal(stockNote('1,000', '8', items), `More than the 120.5${nb}kg in stock`, 'a grouped amount reads');
  assert.equal(stockNote('', '7', items), null, 'no amount');
  assert.equal(stockNote('abc', '7', items), null, 'not a number: the box says so on Save');
  assert.equal(stockNote('500', '', items), null, 'no item');
  assert.equal(stockNote('500', '99', items), null, 'an item not offered (archived or gone)');
  assert.equal(stockNote('5', '7', [{ ...items[0], qty: 0 }]), `None in stock`, 'none left');
  assert.equal(stockNote('5', '7', [{ ...items[0], qty: -3 }]), `None in stock`, 'under 0 (not yet counted)');
  // an edit: the batch's own line already came off the stock, so it counts as there
  const stored = [{ item: 'bags', qty: 400, unit: 'pcs', stockItemId: 7 }];
  assert.equal(stockNote('500', '7', items, stored), null, '460 + its own 400');
  assert.equal(stockNote('900', '7', items, stored), `More than the 860${nb}pcs in stock`);
  assert.equal(stockNote('500', '7', items, [{ ...stored[0], stockItemId: 9 }]), `More than the 460${nb}pcs in stock`, 'its line on another item');
  assert.equal(stockNote('5', '7', [{ id: 7, name: 'x', unit: 'pcs' }]), null, 'an older server without qty: nothing said');
});

test('the rows\' lines keep a date and "40 days ago" whole at a wrap', () => {
  assert.equal(waitingLine(b({ receivedAt: NOW - 40 * DAY }), NOW), `Agro Supplies${dot}Received 26${nb}Sep${dot}40${nb}days${nb}ago`);
  assert.equal(placedLine(b({ receivedAt: NOW - 3 * DAY }), '2026-11-05'), `Agro Supplies${dot}spawn batch 0912${dot}received 2${nb}Nov`);
});

test("csvHref: Export CSV follows the Past card's range", () => {
  assert.equal(csvHref(90, '2026-11-05'), '/api/batches.csv', '90 days: the default');
  assert.equal(csvHref(365, '2026-11-05'), '/api/batches.csv?from=2025-11-06', '12 months: today less 364 days');
  assert.equal(csvHref(null, '2026-11-05'), '/api/batches.csv?from=2000-01-01');
});

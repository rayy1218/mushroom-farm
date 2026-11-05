// The Batches pages' pure parts (spec 2026-11-05-batches-design.md 7).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rmText, blocksText, kgText, waterText, dateText, agoText, goodText, countBlocks, weightText, pageGroups, pastIn, pastCells,
  detailFacts, overNote, batchLineFor, sheetRows, SHEET_COLUMNS, receiveBody, receiveValues, placeBody, roomChoices, checkBody,
  checkLine, statusLine, roomRunText,
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
  assert.equal(kgText(2.3), `2.30${nb}kg`);
  assert.equal(waterText(60), `60${nb}%`);
  assert.equal(dateText(NOW, '2026-11-05'), '5 Nov');
  assert.equal(dateText(Date.UTC(2025, 0, 3, 4), '2026-11-05'), '3 Jan 2025');
  assert.equal(agoText(NOW, NOW), 'today');
  assert.equal(agoText(NOW - DAY, NOW), 'yesterday');
  assert.equal(agoText(NOW - 12 * DAY, NOW), '12 days ago');
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
});

test('a batch: its facts, the over-count note, its status line, a check\'s line', () => {
  const one = b({ strain: 'PL-27', blockKg: 2.3, waterPct: 60, dryKg: 0.92, delivery: [b({ blocks: 800 }), b({ id: 2, parentId: 1, blocks: 400 })] });
  assert.deepEqual(detailFacts(one), [
    ['Spawn batch', '0912'], ['Strain', 'PL-27'], ['Block weight', `2.30${nb}kg${dot}60${nb}% water${dot}0.92${nb}kg dry`],
    ['Price per block', `RM${nb}2.30`], ['Delivery', `1,200${nb}blocks${dot}RM${nb}2,760.00`],
  ]);
  assert.equal(overNote(b({ status: 'placed', runBlocks: 950, batchBlocks: 1200 })), 'Batches hold 1,200 Grey oyster blocks; the run has 950.');
  assert.equal(overNote(b({ status: 'placed', runBlocks: 950, batchBlocks: 950 })), null);
  assert.equal(statusLine(b({})), 'Waiting');
  assert.equal(statusLine(b({ status: 'placed', roomName: 'Container 1' })), 'In Container 1');
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
});

test('the myGAP 4-2 sheet: a receipt row per delivery and a use row per placement in the dates, by date', () => {
  assert.equal(SHEET_COLUMNS.length, 10);
  const first = b({ id: 1, blocks: 400, strain: 'PL-27', receivedAt: Date.UTC(2026, 10, 2, 4) });
  const part = b({ id: 2, parentId: 1, blocks: 800, placedAt: Date.UTC(2026, 10, 3, 4), runId: 4, roomName: 'Container 1', runStartedAt: Date.UTC(2026, 9, 3, 4) });
  const old = b({ id: 3, receivedAt: Date.UTC(2026, 6, 1, 4), pricePerBlock: null, supplier: 'Old' });
  const rows = sheetRows([part, first, old], { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(rows, [
    ['2 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, `1,200${nb}blocks`, `RM${nb}2.30`, '', '', '', '', '', 'Agro Supplies'],
    ['3 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, '', '', `800${nb}blocks`, `Container 1${dot}run of 3 Oct`, '', '', '', ''],
  ]);
  assert.equal(sheetRows([old], { from: '2026-07-01', to: '2026-07-01' })[0][3], '', 'an unknown price: blank to write in');
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
  const c = checkBody({ checkDate: '2026-11-05', checkTime: '8:12', lost: '20', cause: 'green', worker: 'Ali', note: '' });
  assert.deepEqual(c.body, { at: Date.UTC(2026, 10, 5, 0, 12), lost: 20, cause: 'green', worker: 'Ali', note: '' });
  assert.equal(checkBody({ checkDate: '2026-11-05', checkTime: '25:00', lost: '1', cause: 'green', worker: 'Ali' }).field, 'checkTime');
  assert.equal('worker' in checkBody({ checkDate: '2026-11-05', checkTime: '08:00', lost: '1', cause: 'green', worker: '' }, { edit: true }).body, false);
});

test('a batch whose room was deleted keeps its placement: "a deleted room"', () => {
  const gone = b({ placedAt: NOW - DAY, status: 'past' });
  assert.equal(roomRunText(gone), 'a deleted room');
  assert.equal(roomRunText(b({})), '—');
  assert.equal(pastCells(gone, '2026-11-05')[7], 'a deleted room');
  assert.equal(statusLine(gone), `Past${dot}a deleted room`);
  assert.equal(sheetRows([gone], { from: '2026-11-04', to: '2026-11-04' })[0][5], 'a deleted room');
});

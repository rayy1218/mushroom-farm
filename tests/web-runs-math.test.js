// The Run page's pure parts (web/runs-math.js, spec 2026-11-05-runs-design.md 6 and 7): the Runs tab's rows, a run's head and
// tiles, and its Blocks, Sales and Costs rows, each figure by its module's formatter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIST_COLUMNS, cropChoices, cropsText, runDates, listRow, emptyText, runTitle, runSub, pageTiles, batchRows, blockCostText,
  SALE_COLUMNS, saleRows, salesTotal, costRows, costsTotal, costNotes,
} from '../web/runs-math.js';

const NB = ' ';
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // farm day and hour
const TODAY = '2026-11-15';
const RUN = {
  id: 7, roomId: 1, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 600 }], partial: false,
  startedAt: at('2026-11-04', 9), endedAt: null, kg: 80, perBlock: 0.13, income: 480, costs: 1620, profit: -1140, pending: false, incomplete: false,
};

test('the columns, the crop choices and the empty words', () => {
  assert.deepEqual(LIST_COLUMNS, ['Container', 'Crops', 'Dates', 'kg', 'kg per block', 'Income', 'Costs', 'Profit']);
  const choices = cropChoices();
  assert.deepEqual(choices[0], { value: '', label: 'All crops' });
  assert.ok(choices.some((c) => c.value === 'lionsmane' && c.label === "Lion's mane"), 'the draft crop without "(draft)"');
  assert.equal(emptyText(null), 'No runs yet. A run starts when a container gets its blocks on its Crop tab.');
  assert.equal(emptyText('pink'), 'No runs of Pink oyster.');
});

test('a run\'s days: since its start while open, its range once ended, "recorded" for a run under way at the upgrade', () => {
  assert.equal(runDates(RUN, TODAY), 'since 4 Nov');
  assert.equal(runDates({ ...RUN, startedAt: at('2025-12-28') }, TODAY), 'since 28 Dec 2025');
  assert.equal(runDates({ ...RUN, endedAt: at('2026-12-20') }, TODAY), '4 Nov – 20 Dec');
  assert.equal(runDates({ ...RUN, endedAt: at('2026-11-20') }, TODAY), '4–20 Nov');
  assert.equal(runDates({ ...RUN, partial: true }, TODAY), 'recorded since 4 Nov');
});

test('a row: its figures by Harvest\'s and Costs\' formatters, a loss with its minus, the run page its link', () => {
  const r = listRow(RUN, TODAY);
  assert.deepEqual(r, {
    href: '#/business/runs/7', label: 'Container 1, since 4 Nov', room: 'Container 1', roomHref: '#/rooms/1/harvest',
    crops: '600 Grey oyster', crop: 'oyster', dates: 'since 4 Nov',
    cells: [`80.0${NB}kg`, `0.13${NB}kg`, `RM${NB}480.00`, `RM${NB}1,620.00`, `−RM${NB}1,140.00`],
    costsLine: null, loss: true,
  });
  const mixed = listRow({ ...RUN, crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 1000 }], profit: 20 }, TODAY);
  assert.equal(mixed.crops, `300 Grey oyster${NB}· 1,000 Lion's mane`);
  assert.equal(mixed.crop, 'lionsmane', 'the main crop: the most blocks');
  assert.equal(mixed.loss, false);
  const pending = listRow({ ...RUN, costs: null, profit: null, pending: true }, TODAY);
  assert.deepEqual([pending.cells[3], pending.cells[4], pending.costsLine, pending.loss], ['—', '—', 'working out', false]);
  assert.equal(listRow({ ...RUN, incomplete: true }, TODAY).costsLine, 'Some costs have no price');
  const gone = listRow({ ...RUN, roomName: null }, TODAY);
  assert.deepEqual([gone.room, gone.roomHref], ['A deleted room', null]);
});

test('the head: the blocks, the container and the days', () => {
  assert.equal(runTitle(RUN), '600 Grey oyster blocks');
  assert.equal(runTitle({ crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 100 }] }), "300 Grey oyster and 100 Lion's mane blocks");
  assert.equal(runTitle({ crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'pink', blocks: 50 }, { crop: 'lionsmane', blocks: 100 }] }),
    "300 Grey oyster, 50 Pink oyster and 100 Lion's mane blocks");
  assert.equal(runTitle({ crops: [{ crop: 'oyster', blocks: 1 }] }), '1 Grey oyster block');
  assert.equal(runTitle({ crops: [] }), 'A run');
  assert.deepEqual(runSub(RUN, TODAY), { room: 'Container 1', roomHref: '#/rooms/1/harvest', dates: 'since 4 Nov' });
});

test('the tiles: Profit so far first, a loss in words; Profit once ended; a dash while the energy is worked out', () => {
  const v = { ...RUN, kgSold: 40, be: 34 };
  assert.deepEqual(pageTiles(v), [
    { label: 'Profit so far', value: `−RM${NB}1,140.00`, line: 'Loss', tone: 'loss' },
    { label: 'Income', value: `RM${NB}480.00`, line: `40.0${NB}kg sold` },
    { label: 'Costs', value: `RM${NB}1,620.00` },
    { label: 'Picked', value: `80.0${NB}kg` },
    { label: 'kg per block', value: `0.13${NB}kg` },
    { label: 'BE', title: 'Biological efficiency', value: `34${NB}%` },
  ]);
  const ended = pageTiles({ ...v, endedAt: at('2026-11-14'), profit: 260, kgSold: 0, incomplete: true });
  assert.deepEqual(ended[0], { label: 'Profit', value: `RM${NB}260.00` });
  assert.equal(ended[1].line, 'Nothing sold');
  assert.equal(ended[2].line, 'Some costs have no price');
  const waiting = pageTiles({ ...v, pending: true, costs: null, profit: null });
  assert.deepEqual([waiting[0], waiting[2]], [{ label: 'Profit so far', value: '—', line: 'working out' }, { label: 'Costs', value: '—', line: 'working out' }]);
  assert.equal(pageTiles({ ...v, be: null })[5].value, '—');
});

test('the Blocks card: each batch, its supplier, day and price; the block cost, or why it is not known', () => {
  const batches = [
    { id: 3, crop: 'oyster', blocks: 600, supplier: 'Agro Supplies', kind: 'bought', receivedAt: at('2026-09-28'), pricePerBlock: 2.5 },
    { id: 4, crop: 'oyster', blocks: 1, supplier: null, kind: 'made', receivedAt: at('2025-12-30'), pricePerBlock: null },
  ];
  assert.deepEqual(batchRows(batches, TODAY), [
    { href: '#/business/batches/3', title: '600 Grey oyster blocks', line: `Agro Supplies${NB}· received 28 Sep${NB}· RM${NB}2.50 a block` },
    { href: '#/business/batches/4', title: '1 Grey oyster block', line: `made on the farm${NB}· received 30 Dec 2025${NB}· no price` },
  ]);
  assert.equal(blockCostText({ batches, blockCost: 1500 }), `Block cost RM${NB}1,500.00`);
  assert.equal(blockCostText({ batches, blockCost: null }), 'Some batches have no price');
  assert.equal(blockCostText({ batches: [], blockCost: 0 }), null);
});

test('the Sales card: a line as Sales shows a delivery; the total', () => {
  assert.deepEqual(SALE_COLUMNS, ['Day', 'Buyer', 'Sold', 'RM per kg', 'Total', 'Paid']);
  const lines = [{ id: 1, deliveryId: 1, soldAt: at('2026-11-13'), buyer: 'Kedai Ah Seng', invoiceNo: 'R-1', crop: 'oyster', kg: 40, priceKg: 12, total: 480, paidAt: null }];
  assert.deepEqual(saleRows(lines), [{
    day: 'Fri 13 Nov', buyer: 'Kedai Ah Seng', reference: 'R-1', sold: `Grey oyster 40.00${NB}kg`, price: `RM${NB}12.00`, total: `RM${NB}480.00`,
    paid: { text: 'Unpaid', unpaid: true },
  }]);
  assert.deepEqual(saleRows([{ ...lines[0], paidAt: at('2026-11-14'), invoiceNo: null }])[0].paid, { text: `Paid 14${NB}Nov`, unpaid: false });
  assert.equal(salesTotal({ kg: 48, total: 576 }), `48.0${NB}kg${NB}· RM${NB}576.00`);
});

test('the Costs card: Costs\' breakdown without the income rows, its total and notes', () => {
  const v = {
    ...RUN, kgSold: 40, costsByKind: { parts: { blocks: 1500, energy: 12.5, water: 0, own: 120, shared: 30 }, notes: [{ kind: 'unpriced-batch', text: 'A batch has no price' }] },
  };
  assert.deepEqual(costRows(v), [
    ['Blocks', `RM${NB}1,500.00, some with no price`, '#/business/batches?run=7'],
    ['Electricity', `RM${NB}12.50`], ['Own costs', `RM${NB}120.00`], ['Share of shared costs', `RM${NB}30.00`],
  ]);
  assert.deepEqual(costRows({ ...v, costsByKind: null }), []);
  assert.equal(costsTotal(v), `RM${NB}1,620.00`);
  assert.equal(costsTotal({ ...v, pending: true }), '—');
  assert.deepEqual(costNotes(v), [{ kind: 'unpriced-batch', text: 'A batch has no price', warn: true }]);
  assert.deepEqual(costNotes({ ...v, pending: true, costsByKind: null }), [{ kind: 'pending', text: 'Working out the energy cost…', warn: false }]);
});

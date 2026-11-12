// The Run page's pure parts (web/runs-math.js, spec 2026-11-05-runs-design.md 6 and 7): the Runs tab's rows, a run's head and
// tiles, and its Blocks, Sales and Costs rows, each figure by its module's formatter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LIST_COLUMNS, cropChoices, cropsText, runDates, listRow, emptyText, runTitle, runSub, runPageLabel, pageTiles, costsMix, batchRows,
  MADE_NOTE, SALE_COLUMNS, saleRows, salesTotal, costRows, costsTotal, costNotes, tieText, untiedText, countLine, COUNT_TITLE, countLead, countBody, countRange,
} from '../web/runs-math.js';

const NB = ' ';
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // farm day and hour
const TODAY = '2026-11-15';
const RUN = {
  id: 7, roomId: 1, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 600 }], partial: false,
  startedAt: at('2026-11-04', 9), endedAt: null, kg: 80, perBlock: 0.13, income: 480, costs: 1620, profit: -1140, profitPerKg: -28.5,
  pending: false, incomplete: false,
};

test('the columns, the crop choices and the empty words', () => {
  assert.deepEqual(LIST_COLUMNS, ['Run', 'Crops', 'kg', 'kg per block', 'Income', 'Costs', 'Profit', 'Profit per kg']);
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

test('a row: named by its container and Costs\' run days, its figures by Harvest\'s and Costs\' formatters, a loss with its minus', () => {
  const r = listRow(RUN);
  assert.deepEqual(r, {
    href: '#/business/runs/7', name: `Container 1${NB}· 4 Nov${NB}–${NB}now`, crops: '600 Grey oyster', crop: 'oyster',
    cells: [`80.0${NB}kg`, `0.13${NB}kg`, `RM${NB}480.00`, `RM${NB}1,620.00`, `−RM${NB}1,140.00`, `−RM${NB}28.50`],
    costsLine: null, loss: true, perKgLoss: true,
  });
  assert.equal(listRow({ ...RUN, endedAt: at('2026-12-20') }).name, `Container 1${NB}· 4 Nov${NB}–${NB}20 Dec`, 'Costs\' words for an ended run');
  assert.equal(listRow({ ...RUN, partial: true }).name, `Container 1${NB}· recorded 4 Nov${NB}–${NB}now`);
  const mixed = listRow({ ...RUN, crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 1000 }], profit: 20, profitPerKg: 0.5 });
  assert.equal(mixed.crops, `300 Grey oyster${NB}· 1,000 Lion's mane`);
  assert.equal(mixed.crop, 'lionsmane', 'the main crop: the most blocks');
  assert.deepEqual([mixed.loss, mixed.perKgLoss], [false, false]);
  const pending = listRow({ ...RUN, costs: null, profit: null, profitPerKg: null, pending: true });
  assert.deepEqual([pending.cells[3], pending.cells[4], pending.cells[5], pending.costsLine, pending.loss], ['—', '—', '—', 'working out', false]);
  assert.equal(listRow({ ...RUN, incomplete: true }).costsLine, 'Some costs have no price');
  const gone = listRow({ ...RUN, roomName: null, costs: null, profit: null, profitPerKg: null });
  assert.equal(gone.name, `A deleted room${NB}· 4 Nov${NB}–${NB}now`);
  assert.deepEqual([gone.cells[3], gone.cells[4], gone.costsLine], ['—', '—', null], 'a room-less run: a dash, never "working out"');
});

test('a "Run page" link\'s name: the container and the run\'s days', () => {
  assert.equal(runPageLabel(RUN, TODAY), 'Run page, Container 1, since 4 Nov');
  assert.equal(runPageLabel({ ...RUN, endedAt: at('2026-12-20') }, TODAY), 'Run page, Container 1, 4 Nov – 20 Dec');
  assert.equal(runPageLabel({ ...RUN, roomName: undefined }, TODAY), 'Run page, since 4 Nov');
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

test('the tiles: Profit so far first, a loss in words; Profit per kg; the kg not sold; Profit once ended; a dash while the energy is worked out', () => {
  const v = { ...RUN, kgSold: 40, be: 34 };
  assert.deepEqual(pageTiles(v), [
    { label: 'Profit so far', value: `−RM${NB}1,140.00`, line: 'Loss', tone: 'loss' },
    { label: 'Income', value: `RM${NB}480.00`, line: `40.0${NB}kg sold` },
    { label: 'Costs', value: `RM${NB}1,620.00` },
    { label: 'Profit per kg', value: `−RM${NB}28.50`, line: `on 40.0${NB}kg sold`, tone: 'loss' },
    { label: 'Picked', value: `80.0${NB}kg`, line: `40.0${NB}kg not sold` },
    { label: 'kg per block', value: `0.13${NB}kg` },
    { label: 'BE', title: 'Biological efficiency', value: `34${NB}%` },
  ]);
  const ended = pageTiles({ ...v, endedAt: at('2026-11-14'), profit: 260, profitPerKg: null, kgSold: 0, incomplete: true });
  assert.deepEqual(ended[0], { label: 'Profit', value: `RM${NB}260.00` });
  assert.equal(ended[1].line, 'Nothing sold');
  assert.equal(ended[2].line, 'Some costs have no price');
  assert.deepEqual(ended[3], { label: 'Profit per kg', value: '—', line: 'Nothing sold' });
  assert.deepEqual(pageTiles({ ...v, kgSold: 80 })[4], { label: 'Picked', value: `80.0${NB}kg` }, 'all sold: no line');
  const waiting = pageTiles({ ...v, pending: true, costs: null, profit: null, profitPerKg: null });
  assert.deepEqual([waiting[0], waiting[2], waiting[3]], [{ label: 'Profit so far', value: '—', line: 'working out' },
    { label: 'Costs', value: '—', line: 'working out' }, { label: 'Profit per kg', value: '—', line: 'working out' }]);
  assert.equal(pageTiles({ ...v, be: null })[6].value, '—');
  const gone = pageTiles({ ...v, roomName: null, costs: null, profit: null, profitPerKg: null, pending: false });
  assert.deepEqual([gone[0].value, gone[0].line, gone[2].value, gone[2].line], ['—', undefined, '—', undefined], 'a room-less run: a dash, never "working out"');
});

const PRICES = { electricity: 0.55, water: null };
test('the money\'s make-up under the tiles: the parts over 0, the biggest\'s share, the energy not recorded', () => {
  const v = { ...RUN, costs: 17879.23, prices: PRICES, costsByKind: { parts: { blocks: 3040, energy: 0, water: 0, own: 480, shared: 14359.23 }, notes: [] } };
  assert.equal(costsMix(v), `Blocks RM${NB}3,040.00${NB}· Own RM${NB}480.00${NB}· Shared RM${NB}14,359.23 (80${NB}% of costs)${NB}· Electricity not recorded yet${NB}· No water price`);
  const metered = { ...v, costs: 3532.5, prices: { electricity: 0.55, water: 0.01 }, costsByKind: { parts: { blocks: 3040, energy: 12.5, water: 0, own: 480, shared: 0 }, notes: [] } };
  assert.equal(costsMix(metered), `Blocks RM${NB}3,040.00 (86${NB}% of costs)${NB}· Electricity RM${NB}12.50${NB}· Own RM${NB}480.00${NB}· Water not recorded yet`);
  const one = { ...v, costs: 3040, prices: { electricity: 0.55, water: 0.01 }, costsByKind: { parts: { blocks: 3040, energy: 0, water: 0, own: 0, shared: 0 }, notes: [] } };
  assert.equal(costsMix(one), `Blocks RM${NB}3,040.00${NB}· Electricity and water not recorded yet`, 'one part: no share');
  assert.equal(costsMix({ ...v, pending: true, costs: null }), null, 'none while the energy is worked out');
  assert.equal(costsMix({ ...v, costsByKind: null, costs: null }), null, 'none without Costs\' view');
});

test('the Blocks card: each batch, its supplier and day received (a made one its day made and a note), its price a block; no money total', () => {
  const batches = [
    { id: 3, crop: 'oyster', blocks: 600, supplier: 'Agro Supplies', kind: 'bought', receivedAt: at('2026-09-28'), pricePerBlock: 2.5 },
    { id: 4, crop: 'oyster', blocks: 1, supplier: 'Spawn Co', kind: 'made', receivedAt: at('2025-12-30'), mixedAt: at('2025-12-20'), pricePerBlock: null },
    { id: 5, crop: 'oyster', blocks: 20, supplier: null, kind: 'made', receivedAt: at('2026-09-20'), mixedAt: null, pricePerBlock: 1.1 },
  ];
  assert.deepEqual(batchRows(batches, TODAY), [
    { href: '#/business/batches/3', title: '600 Grey oyster blocks', line: `Agro Supplies${NB}· received 28${NB}Sep${NB}· RM${NB}2.50 a block`, note: null },
    { href: '#/business/batches/4', title: '1 Grey oyster block', line: `made 20${NB}Dec${NB}2025${NB}· no price`, note: MADE_NOTE },
    { href: '#/business/batches/5', title: '20 Grey oyster blocks', line: `made 20${NB}Sep${NB}· RM${NB}1.10 a block`, note: MADE_NOTE },
  ]);
  assert.equal(MADE_NOTE, 'Its materials at what their lots cost, charged to the run as its blocks went in');
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

test('the Costs card: Costs\' breakdown without the income rows, Electricity and Water kept at 0 in words, its total and notes', () => {
  const v = {
    ...RUN, kgSold: 40, prices: PRICES,
    costsByKind: { parts: { blocks: 1500, energy: 12.5, water: 0, own: 120, shared: 30 }, notes: [{ kind: 'unpriced-batch', text: 'A batch has no price' }] },
  };
  assert.deepEqual(costRows(v), [
    ['Blocks', `RM${NB}1,500.00, some with no price`, '#/business/batches?run=7'],
    ['Electricity', `RM${NB}12.50`], ['Water', 'no price set', null, true], ['Own costs', `RM${NB}120.00`], ['Share of shared costs', `RM${NB}30.00`],
  ]);
  const none = { ...v, costsByKind: { parts: { blocks: 0, energy: 0, water: 0, own: 0, shared: 0 }, notes: [] }, prices: { electricity: 0.55, water: 0.01 } };
  assert.deepEqual(costRows(none), [['Electricity', 'not recorded yet', null, true], ['Water', 'not recorded yet', null, true]]);
  assert.deepEqual(costRows({ ...none, pending: true }), [['Electricity', 'working out', null, true], ['Water', 'working out', null, true]]);
  assert.deepEqual(costRows({ ...none, prices: { electricity: 0, water: 0.01 } })[0], ['Electricity', 'no price set', null, true]);
  assert.deepEqual(costRows({ ...v, costsByKind: null }), []);
  assert.equal(costsTotal(v), `RM${NB}1,620.00`);
  assert.equal(costsTotal({ ...v, pending: true }), '—');
  assert.deepEqual(costNotes(v), [{ kind: 'unpriced-batch', text: 'A batch has no price', warn: true }]);
  assert.deepEqual(costNotes({ ...v, pending: true, costsByKind: null }), [{ kind: 'pending', text: 'Working out the energy cost…', warn: false }]);
});

// ---- Money truth (spec 2026-11-12-money-truth-design.md 7) ----
test('how a sale line reached the run; the Runs tab\'s line for what reaches none; a made batch\'s missing price', () => {
  const plain = (s) => s?.replace(/[ ⁠]/g, ' ').replace(/ +/g, ' ');
  assert.equal(tieText({ crop: 'lionsmane', kg: 8, tie: { how: 'only', share: 1, kg: 8, total: 384 } }), 'Tied here: the only run growing Lion\'s mane that day');
  assert.equal(plain(tieText({ crop: 'oyster', kg: 2.5, tie: { how: 'picked', share: 0.25, kg: 10, total: 100 } })), 'Shared: 2.5 kg of a 10.0 kg sale, by the kg picked here');
  assert.equal(tieText({ crop: 'oyster', kg: 8, tie: { how: 'room', share: 1, kg: 8, total: 96 } }), null);
  assert.equal(tieText({ crop: 'oyster', kg: 8 }), null);
  assert.equal(plain(untiedText({ total: 384, kg: 8, count: 1 })), 'RM 384.00 of sales not tied to a run');
  assert.equal(untiedText({ total: 0, kg: 0, count: 0 }), null);
  assert.equal(untiedText(undefined), null, 'an older server');
  const [row] = batchRows([{ id: 5, kind: 'made', blocks: 480, crop: 'oyster', mixedAt: at('2026-11-04'), receivedAt: at('2026-11-04'), pricePerBlock: 2.7935, priceMissing: ['Plastic bags'] }], '2026-11-12');
  assert.equal(plain(row.line), 'made 4 Nov · RM 2.79 a block · no price for Plastic bags');
});

test('a partial run\'s line for Economics, its dialog\'s words and the day it sends (Money truth 8.2)', () => {
  const plain = (s) => s?.replace(/[ ⁠]/g, ' ');
  const run = { id: 3, partial: true, startedAt: at('2026-11-04', 16), blocksInAt: null };
  const line = countLine(run, '2026-11-12');
  assert.deepEqual([plain(line.text), line.action, line.stop], ['Recorded from 4 Nov, when the app began keeping runs; its blocks went in earlier, so Economics leaves it out.', 'Count it in Economics', undefined]);
  const counted = countLine({ ...run, blocksInAt: at('2026-09-20') }, '2026-11-12');
  assert.deepEqual([plain(counted.text), counted.action, counted.stop], ['Counted in Economics from 20 Sep, the day its blocks went in.', 'Change the day', 'Stop counting it']);
  assert.equal(countLine({ ...run, partial: false }, '2026-11-12'), null);
  assert.equal(COUNT_TITLE, 'Count this run in Economics');
  assert.match(plain(countLead(run, '2026-11-12')), /recorded from 4 Nov: give the day its blocks went in\. Count it only if every pick since then is recorded\.$/);
  assert.deepEqual(countBody('2026-09-20', run), { body: { blocksInAt: at('2026-09-20') } }, 'noon on the farm\'s day');
  assert.equal(countBody('2026-11-05', run).field, 'day');
  assert.equal(countBody('2025-11-03', run).field, 'day', '366 days before');
  assert.equal(countBody('', run).field, 'day');
  assert.deepEqual(countRange(run), { max: '2026-11-04', min: '2025-11-04' });
});

test('the money\'s make-up names the equipment written off (Money truth)', () => {
  const v = { pending: false, costs: 300, prices: { electricity: 0.55, water: null }, costsByKind: { parts: { blocks: 0, energy: 100, water: 0, own: 0, equipment: 200, shared: 0 } } };
  assert.match(costsMix(v).replace(/[\u00a0]/g, ' '), /^Electricity RM 100.00 · Equipment RM 200.00 \(67 % of costs\)/);
});

// The Business summary's pure parts (web/business-math.js, spec 2026-11-06-business-summary-design.md 6 and 7): the money
// card's title, tiles and lines, each need's line, the failure and empty words, the open runs' rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOT } from '../web/text-math.js';
import {
  moneyTitle, moneyTiles, unsoldLine, lastMonthLine, NEEDS_NONE, NEED_PARTS, needLines, needFailLines, needsEmpty, readFailText,
  RUNS_NONE, runRows,
} from '../web/business-math.js';

const NB = ' ';
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // farm day and hour
const NOW = at('2026-11-15');
const TODAY = '2026-11-15';
const TILES = {
  income: 550, costs: 192.82, profit: 357.18, costPerKg: 1.28, profitPerKg: 35.72, kgHarvested: 150.61, kgSold: 10,
  unsold: { kg: 140.61, value: 4921.35 }, incomplete: true,
};
const MONTH = { month: '2026-11', pending: false, tiles: TILES };
const RUN = {
  id: 7, roomId: 1, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 600 }], partial: false,
  startedAt: at('2026-11-04', 9), endedAt: null, kg: 150.61, perBlock: 0.25, income: 550, costs: 192.82, profit: 357.18,
  profitPerKg: 35.72, pending: false, incomplete: false,
};

test('the money card: "November so far", Costs\' Profit, Income and Costs tiles, the kg not sold', () => {
  assert.equal(moneyTitle(MONTH), 'November so far');
  assert.equal(moneyTitle(null), 'This month so far', 'Costs not read');
  assert.deepEqual(moneyTiles(MONTH), [
    { label: 'Profit', value: `RM${NB}357.18` },
    { label: 'Income', value: `RM${NB}550.00`, line: `10.0${NB}kg sold` },
    { label: 'Costs', value: `RM${NB}192.82`, line: 'Some costs have no price' },
  ]);
  assert.equal(unsoldLine(MONTH), `140.6${NB}kg not sold yet, about RM${NB}4,921.35 at your expected prices`);
  assert.equal(unsoldLine({ ...MONTH, tiles: { ...TILES, unsold: { kg: 12, value: null } } }), `12.0${NB}kg not sold yet`, 'a crop with no expected price');
  assert.equal(unsoldLine({ ...MONTH, tiles: { ...TILES, unsold: null } }), null, 'everything picked is sold');
  assert.equal(unsoldLine(null), null);
});

test('the money card: a loss, and the energy still worked out', () => {
  const loss = moneyTiles({ ...MONTH, tiles: { ...TILES, profit: -340, incomplete: false } });
  assert.deepEqual(loss[0], { label: 'Profit', value: `−RM${NB}340.00`, line: 'Loss', tone: 'loss' });
  assert.deepEqual(loss[2], { label: 'Costs', value: `RM${NB}192.82` });
  const pending = moneyTiles({ ...MONTH, pending: true, tiles: { ...TILES, costs: null, profit: null } });
  assert.deepEqual([pending[0], pending[2]], [{ label: 'Profit', value: '—', line: 'working out' }, { label: 'Costs', value: '—', line: 'working out' }]);
});

test('last month\'s result: profit or loss in words, nothing recorded, working out, the year when it is another', () => {
  assert.equal(lastMonthLine({ month: '2026-10', income: 1500, costs: 300, profit: 1200, pending: false }, MONTH), `October: profit RM${NB}1,200.00`);
  assert.equal(lastMonthLine({ month: '2026-10', income: 0, costs: 13412.23, profit: -13412.23, pending: false }, MONTH), `October: loss RM${NB}13,412.23`);
  assert.equal(lastMonthLine({ month: '2026-10', income: 0, costs: 0, profit: 0, pending: false }, MONTH), 'October: nothing recorded');
  assert.equal(lastMonthLine({ month: '2026-10', income: 0, costs: null, profit: null, pending: true }, MONTH), 'October: working out');
  assert.equal(lastMonthLine({ month: '2025-12', income: 10, costs: 0, profit: 10, pending: false }, { ...MONTH, month: '2026-01' }), `December 2025: profit RM${NB}10.00`);
  assert.equal(lastMonthLine(null, MONTH), null, 'last month not kept');
});

test('a line per need, in the reply\'s order, each with its address', () => {
  const needs = [
    { kind: 'owed', total: 1240, count: 3, oldestAt: at('2026-11-03'), buyers: ['Kedai Ah Seng', 'Pasar Tani'], href: '#/business/sales' },
    { kind: 'below-zero', items: [{ id: 5, name: 'Sawdust', qty: -430.6, unit: 'kg' }], href: '#/business/inventory' },
    { kind: 'low', items: [{ id: 6, name: 'Grow bags', qty: 120, unit: 'pcs', reorderAt: 200 }], href: '#/business/inventory' },
    { kind: 'use-by', id: 8, name: 'Lime', unit: 'kg', useBy: { date: '2026-11-13', state: 'expired', qty: 4.5 }, href: '#/business/inventory/8' },
    { kind: 'use-by', id: 9, name: 'Bleach', unit: 'L', useBy: { date: '2026-11-18', state: 'soon', qty: 3 }, href: '#/business/inventory/9' },
    { kind: 'blocks', waiting: { blocks: 400, crops: ['pink'] }, making: { blocks: 100, crops: ['oyster'] }, href: '#/business/batches' },
    { kind: 'unpriced', notes: [{ text: 'Room 1’s blocks of 4 Nov have no price', runId: 1 }], href: '#/business/batches' },
  ];
  assert.deepEqual(needLines(needs, NOW), [
    { kind: 'owed', text: `RM${NB}1,240.00 owed by Kedai Ah Seng and Pasar Tani${DOT}oldest 12 days`, href: '#/business/sales' },
    { kind: 'below-zero', text: `Below zero: Sawdust −430.60${NB}kg${DOT}a purchase is missing`, href: '#/business/inventory' },
    { kind: 'low', text: `Low stock: Grow bags 120${NB}pcs, reorder at 200${NB}pcs`, href: '#/business/inventory' },
    { kind: 'use-by', text: `Lime${DOT}4.50${NB}kg expired 13 Nov`, href: '#/business/inventory/8' },
    { kind: 'use-by', text: `Bleach${DOT}3.00${NB}L use by 18 Nov`, href: '#/business/inventory/9' },
    { kind: 'blocks', text: `400 Pink oyster blocks ready for a room${DOT}100 Grey oyster blocks being made`, href: '#/business/batches' },
    { kind: 'unpriced', text: `Room 1’s blocks of 4 Nov have no price${DOT}this month's costs leave them out`, href: '#/business/batches' },
  ]);
});

test('the needs of several: the names cut short, the blocks of several crops, the deliveries counted', () => {
  const lines = needLines([
    { kind: 'owed', total: 96, count: 4, oldestAt: NOW, buyers: ['A', 'B', 'C', 'D'], href: '#/business/sales' },
    { kind: 'below-zero', items: ['Grain spawn', 'Plastic bags', 'Gypsum', 'Lime', 'Rice bran'].map((name, i) => ({ id: i, name, qty: -1, unit: 'kg' })), href: '#/business/inventory' },
    { kind: 'low', items: [{ id: 1, name: 'Bags', qty: 1, unit: 'pcs', reorderAt: 5 }, { id: 2, name: 'Gloves', qty: 0, unit: 'pcs', reorderAt: 5 }], href: '#/business/inventory' },
    { kind: 'blocks', waiting: { blocks: 1200, crops: ['oyster', 'pink'] }, making: { blocks: 0, crops: [] }, href: '#/business/batches' },
    { kind: 'blocks', waiting: { blocks: 0, crops: [] }, making: { blocks: 1, crops: ['oyster'] }, href: '#/business/batches' },
    { kind: 'unpriced', notes: [{ text: 'a', runId: 1 }, { text: 'b', runId: 3 }, { text: 'c', runId: null }], href: '#/business/batches' },
    { kind: 'something-new', href: '#/business' },
  ], NOW).map((l) => l.text);
  assert.deepEqual(lines, [
    `RM${NB}96.00 owed by A, B and 2 more${DOT}oldest today`,
    `Below zero: Grain spawn, Plastic bags, Gypsum and 2 more${DOT}purchases are missing`,
    'Low stock: Bags and Gloves',
    '1,200 blocks ready for a room',
    '1 Grey oyster block being made',
    `Blocks of 3 deliveries have no price${DOT}this month's costs leave them out`,
  ], 'a kind the page does not know is left out');
});

test('nothing needs you only when every module was read; a module not read says so', () => {
  assert.equal(needsEmpty({}), NEEDS_NONE);
  assert.equal(NEEDS_NONE, 'Nothing needs you right now.');
  assert.equal(needsEmpty({ runs: 'Something went wrong' }), NEEDS_NONE, 'the runs are not a need');
  assert.equal(needsEmpty({ sales: 'Something went wrong' }), null);
  assert.deepEqual(NEED_PARTS, ['sales', 'inventory', 'batches', 'costs']);
  assert.deepEqual(needFailLines({ costs: 'x', sales: 'x', runs: 'x' }), ["Couldn't check Sales just now.", "Couldn't check Costs just now."]);
  assert.deepEqual(needFailLines(undefined), []);
  assert.equal(readFailText('costs'), "Couldn't read Costs just now.");
  assert.equal(readFailText('runs'), "Couldn't read Runs just now.");
});

test('the open runs: container, crops, days with its day, kg picked, the money so far, the run page named for its run', () => {
  const [row] = runRows([RUN], TODAY);
  assert.deepEqual(row, {
    id: 7, href: '#/business/runs/7', label: 'Run page, Container 1, since 4 Nov', room: 'Container 1', crop: 'oyster',
    crops: '600 Grey oyster', days: `since 4 Nov${DOT}day 12`, kg: `150.6${NB}kg picked`, money: { label: 'Profit so far', value: `RM${NB}357.18` },
  });
  assert.equal(RUNS_NONE, 'No runs in progress. A run starts when a container gets its blocks on its Crop tab.');
  assert.deepEqual(runRows(null, TODAY), []);
});

test('the open runs: a loss in words, working out, no Costs view, some costs with no price, a run under way at the upgrade', () => {
  const money = (o) => runRows([{ ...RUN, ...o }], TODAY)[0].money;
  assert.deepEqual(money({ profit: -1140 }), { label: 'Loss so far', value: `RM${NB}1,140.00`, tone: 'loss' });
  assert.deepEqual(money({ pending: true, costs: null, profit: null }), { label: 'Profit so far', value: '—', line: 'working out' });
  assert.deepEqual(money({ costs: null, profit: null }), { label: 'Profit so far', value: '—' });
  assert.deepEqual(money({ incomplete: true }), { label: 'Profit so far', value: `RM${NB}357.18`, line: 'Some costs have no price' });
  const partial = runRows([{ ...RUN, partial: true, roomName: null }], TODAY)[0];
  assert.deepEqual([partial.days, partial.room], ['recorded since 4 Nov', 'A deleted room']);
  assert.equal(runRows([{ ...RUN, startedAt: at('2026-11-15', 9) }], TODAY)[0].days, `since 15 Nov${DOT}day 1`);
});

// The Business summary's pure parts (web/business-math.js, spec 2026-11-06-business-summary-design.md 6 and 7): the money
// card's title, tiles and lines, each need's line, the failure and empty words, the open runs' rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOT } from '../web/text-math.js';
import {
  moneyTitle, moneyTiles, toComeLine, unsoldLine, unsoldTile, lastMonthLine, lastMonthTile, NEEDS_NONE, NEED_PARTS, needLines, needsTitle,
  needsEmpty, readFailText, RETRY_WORDS, RUNS_NONE, ROOMS_LINK, runRows,
} from '../web/business-math.js';
import { toComeNote } from '../web/costs-math.js';

const NB = ' ';
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // farm day and hour
const NOW = at('2026-11-15');
const TODAY = '2026-11-15';
const TILES = {
  income: 550, costs: 192.82, profit: 357.18, costPerKg: 1.28, profitPerKg: 35.72, kgHarvested: 150.61, kgSold: 10,
  unsold: { kg: 140.61, value: 4921.35 }, incomplete: true,
};
const RENT = { id: 1, category: 'rent', note: null, amount: 1500, date: '2026-10-20', repeat: 'monthly', repeatUntil: null, roomId: null, roomName: null };
const MONTH = { month: '2026-11', today: TODAY, pending: false, tiles: TILES, repeating: [RENT] };
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

test('the money card: Costs\' still-to-come line, in its words; none once every monthly item is charged or without Costs', () => {
  assert.equal(toComeLine(MONTH), `Still to come this month: RM${NB}1,500.00 (rent)`);
  assert.equal(toComeLine(MONTH), toComeNote(MONTH).text, 'Costs\' own note');
  assert.equal(toComeLine({ ...MONTH, today: '2026-11-25' }), null, 'charged on the 20th');
  assert.equal(toComeLine({ ...MONTH, repeating: [] }), null);
  assert.equal(toComeLine(null), null);
});

test('the money card on a desk: the kg not sold and last month as tiles 4 and 5', () => {
  assert.deepEqual(unsoldTile(MONTH), { label: 'Not sold', value: `140.6${NB}kg`, line: `about RM${NB}4,921.35 at your expected prices` });
  assert.deepEqual(unsoldTile({ ...MONTH, tiles: { ...TILES, unsold: { kg: 12, value: null } } }), { label: 'Not sold', value: `12.0${NB}kg` });
  assert.equal(unsoldTile({ ...MONTH, tiles: { ...TILES, unsold: null } }), null);
  const tile = (o) => lastMonthTile({ month: '2026-10', income: 1500, costs: 300, profit: 1200, pending: false, ...o }, MONTH);
  assert.deepEqual(tile({}), { label: 'October', value: `RM${NB}1,200.00`, line: 'Profit' });
  assert.deepEqual(tile({ income: 0, costs: 340, profit: -340 }), { label: 'October', value: `−RM${NB}340.00`, line: 'Loss', tone: 'loss' }, 'Costs\' Profit tile\'s loss');
  assert.deepEqual(tile({ income: 0, costs: 0, profit: 0 }), { label: 'October', value: `RM${NB}0.00`, line: 'Nothing recorded' });
  assert.deepEqual(tile({ costs: null, profit: null, pending: true }), { label: 'October', value: '—', line: 'working out' });
  assert.equal(lastMonthTile(null, MONTH), null);
});

test('the money card: a loss, and the energy still worked out', () => {
  const loss = moneyTiles({ ...MONTH, tiles: { ...TILES, profit: -340, incomplete: false } });
  assert.deepEqual(loss[0], { label: 'Profit', value: `−RM${NB}340.00`, line: 'Loss', tone: 'loss' });
  assert.deepEqual(loss[2], { label: 'Costs', value: `RM${NB}192.82` });
  const pending = moneyTiles({ ...MONTH, pending: true, tiles: { ...TILES, costs: null, profit: null } });
  assert.deepEqual([pending[0], pending[2]], [{ label: 'Profit', value: '—', line: 'working out' }, { label: 'Costs', value: '—', line: 'working out' }]);
});

test('last month\'s result: the figure (a loss with its minus, in the loss tone) and its word; nothing recorded; working out; the year when another', () => {
  const words = (parts) => parts && parts.map((p) => p.text).join('');
  const line = (o, month = MONTH) => lastMonthLine({ month: '2026-10', income: 1500, costs: 300, profit: 1200, pending: false, ...o }, month);
  assert.equal(words(line({})), `October: RM${NB}1,200.00 profit`);
  assert.deepEqual(line({ income: 0, costs: 13412.23, profit: -13412.23 }), [
    { text: 'October: ' }, { text: `−RM${NB}13,412.23`, tone: 'loss' }, { text: ' loss' },
  ], 'only the figure in the loss tone, as the Runs list and the run page');
  assert.equal(words(line({ income: 0, costs: 0, profit: 0 })), 'October: nothing recorded');
  assert.equal(words(line({ costs: null, profit: null, pending: true })), 'October: working out');
  assert.equal(words(line({ month: '2025-12', income: 10, costs: 0, profit: 10 }, { ...MONTH, month: '2026-01' })), `December 2025: RM${NB}10.00 profit`);
  assert.equal(lastMonthLine(null, MONTH), null, 'last month not kept');
});

test('a line per need with its address and state tone; the worst first (below zero and expired, then low, use-by soon, owed over 30 days and no price), the reply\'s order within', () => {
  const needs = [
    { kind: 'owed', total: 1240, count: 3, oldestAt: at('2026-11-03'), oldestBuyer: 'Pasar Tani', buyers: ['Kedai Ah Seng', 'Pasar Tani'], href: '#/business/sales' },
    { kind: 'below-zero', items: [{ id: 5, name: 'Sawdust', qty: -430.6, unit: 'kg' }], href: '#/business/inventory/5' },
    { kind: 'low', items: [{ id: 6, name: 'Grow bags', qty: 120, unit: 'pcs', reorderAt: 200 }], href: '#/business/inventory/6' },
    { kind: 'use-by', id: 8, name: 'Lime', unit: 'kg', useBy: { date: '2026-11-13', state: 'expired', qty: 4.5 }, href: '#/business/inventory/8' },
    { kind: 'use-by', id: 9, name: 'Bleach', unit: 'L', useBy: { date: '2026-11-18', state: 'soon', qty: 3 }, href: '#/business/inventory/9' },
    { kind: 'blocks', blocks: 400, crops: ['pink'], href: '#/business/batches' },
    { kind: 'unpriced', notes: [{ text: 'Room 1’s blocks of 4 Nov have no price', runId: 1 }], batchId: 4, href: '#/business/batches/4' },
  ];
  assert.deepEqual(needLines({ needs, errors: {} }, NOW), [
    { kind: 'below-zero', key: 'below-zero', tone: 'critical', text: `Below zero: Sawdust −430.60${NB}kg${DOT}a purchase is missing`, href: '#/business/inventory/5' },
    { kind: 'use-by', key: 'use-by:8', tone: 'critical', text: `Lime${DOT}4.50${NB}kg expired 13 Nov`, href: '#/business/inventory/8' },
    { kind: 'low', key: 'low', tone: 'warning', text: `Low stock: Grow bags 120${NB}pcs, reorder at 200${NB}pcs`, href: '#/business/inventory/6' },
    { kind: 'use-by', key: 'use-by:9', tone: 'warning', text: `Bleach${DOT}3.00${NB}L use by 18 Nov`, href: '#/business/inventory/9' },
    { kind: 'unpriced', key: 'unpriced', tone: 'warning', text: `Room 1’s blocks of 4 Nov have no price${DOT}this month's costs leave them out`, href: '#/business/batches/4' },
    { kind: 'owed', key: 'owed', tone: null, text: `RM${NB}1,240.00 owed by Kedai Ah Seng and Pasar Tani${DOT}oldest 12 days (Pasar Tani)`, href: '#/business/sales' },
    { kind: 'blocks', key: 'blocks', tone: null, text: `400 Pink oyster blocks ready for a room`, href: '#/business/batches' },
  ]);
});

test('money owed: a warning once the oldest sale is over 30 days; one buyer not named twice', () => {
  const owed = (days, buyers = ['Kedai Ah Seng']) => needLines({ needs: [{ kind: 'owed', total: 50, count: 1, oldestAt: NOW - days * 86_400_000, oldestBuyer: 'Kedai Ah Seng', buyers, href: '#/business/sales' }] }, NOW)[0];
  assert.deepEqual([owed(30).tone, owed(31).tone], [null, 'warning']);
  assert.equal(owed(50).text, `RM${NB}50.00 owed by Kedai Ah Seng${DOT}oldest 50 days`);
  assert.equal(owed(50, ['Pasar Tani', 'Kedai Ah Seng']).text, `RM${NB}50.00 owed by Pasar Tani and Kedai Ah Seng${DOT}oldest 50 days (Kedai Ah Seng)`);
});

test('the needs of several: the names cut short, the blocks of several crops, the deliveries counted; an unknown kind left out', () => {
  const lines = needLines({ needs: [
    { kind: 'owed', total: 96, count: 4, oldestAt: NOW, oldestBuyer: 'C', buyers: ['A', 'B', 'C', 'D'], href: '#/business/sales' },
    { kind: 'below-zero', items: ['Grain spawn', 'Plastic bags', 'Gypsum', 'Lime', 'Rice bran'].map((name, i) => ({ id: i, name, qty: -1, unit: 'kg' })), href: '#/business/inventory' },
    { kind: 'low', items: [{ id: 1, name: 'Bags', qty: 1, unit: 'pcs', reorderAt: 5 }, { id: 2, name: 'Gloves', qty: 0, unit: 'pcs', reorderAt: 5 }], href: '#/business/inventory' },
    { kind: 'blocks', blocks: 1200, crops: ['oyster', 'pink'], href: '#/business/batches' },
    { kind: 'unpriced', notes: [{ text: 'a', runId: 1 }, { text: 'b', runId: 3 }, { text: 'c', runId: null }], batchId: null, href: '#/business/batches' },
    { kind: 'something-new', href: '#/business' },
    { kind: 'toString', href: '#/business' },
  ] }, NOW).map((l) => l.text);
  assert.deepEqual(lines, [
    `Below zero: Grain spawn, Plastic bags, Gypsum and 2 more${DOT}purchases are missing`,
    'Low stock: Bags and Gloves',
    `Blocks of 3 deliveries have no price${DOT}this month's costs leave them out`,
    `RM${NB}96.00 owed by A, B and 2 more${DOT}oldest today (C)`,
    `1,200${NB}blocks ready for a room`,
  ], 'a kind the page does not know is left out, an inherited name too');
  assert.equal(needLines({ needs: [{ kind: 'blocks', blocks: 1, crops: ['oyster'], href: '#' }] }, NOW)[0].text, '1 Grey oyster block ready for a room');
});

test('a module not read: its line in its needs\' place, a warning, trying again; nothing needs you only when every module was read', () => {
  const needs = [
    { kind: 'below-zero', items: [{ id: 5, name: 'Sawdust', qty: -1, unit: 'kg' }], href: '#/business/inventory/5' },
    { kind: 'blocks', blocks: 4, crops: ['pink'], href: '#/business/batches' },
  ];
  const lines = needLines({ needs, errors: { sales: 'x', costs: 'x', runs: 'x' } }, NOW);
  assert.deepEqual(lines.map((l) => [l.key, l.tone]), [['below-zero', 'critical'], ['failed:sales', 'warning'], ['failed:costs', 'warning'], ['blocks', null]]);
  assert.deepEqual(lines[1], { kind: 'failed', key: 'failed:sales', part: 'sales', tone: 'warning', text: `Couldn't check Sales just now${DOT}trying again every minute` });
  assert.equal(RETRY_WORDS, 'Retry');
  assert.deepEqual(NEED_PARTS, ['sales', 'inventory', 'batches', 'costs']);
  assert.equal(needsEmpty({}), NEEDS_NONE);
  assert.equal(NEEDS_NONE, 'Nothing needs you right now.');
  assert.equal(needsEmpty({ runs: 'Something went wrong' }), NEEDS_NONE, 'the runs are not a need');
  assert.equal(needsEmpty({ sales: 'Something went wrong' }), null);
  assert.deepEqual(needLines({ needs: [], errors: undefined }, NOW), []);
  assert.equal(readFailText('costs'), `Couldn't read Costs just now${DOT}trying again every minute`);
  assert.equal(readFailText('runs'), `Couldn't read Runs just now${DOT}trying again every minute`);
});

test('the card\'s title counts the needs (a part not read is not one)', () => {
  assert.equal(needsTitle(0), 'Needs you');
  assert.equal(needsTitle(3), `Needs you${DOT}3`);
});

test('the open runs: container (the run page\'s link, named for its run), crops, days with its day, kg picked, the money so far', () => {
  const [row] = runRows([RUN], TODAY);
  assert.deepEqual(row, {
    id: 7, href: '#/business/runs/7', label: 'Run page, Container 1, since 4 Nov', room: 'Container 1', crop: 'oyster',
    line: `600 Grey oyster${DOT}since 4 Nov${DOT}day 12${DOT}150.6${NB}kg picked`, money: { label: 'Profit so far', value: `RM${NB}357.18` },
  });
  assert.equal(runRows([{ ...RUN, kg: 0 }], TODAY)[0].line, `600 Grey oyster${DOT}since 4 Nov${DOT}day 12${DOT}nothing picked yet`);
  assert.equal(RUNS_NONE, 'No runs in progress. A run starts when a container gets its blocks on its Crop tab.');
  assert.equal(ROOMS_LINK, 'Rooms, to open a container');
  assert.deepEqual(runRows(null, TODAY), []);
});

test('the open runs: a loss as the run page has it, working out, no Costs view, some costs with no price, a run under way at the upgrade', () => {
  const money = (o) => runRows([{ ...RUN, ...o }], TODAY)[0].money;
  assert.deepEqual(money({ profit: -1140 }), { label: 'Profit so far', value: `−RM${NB}1,140.00`, line: 'Loss', tone: 'loss' });
  assert.deepEqual(money({ profit: -1140, incomplete: true }), { label: 'Profit so far', value: `−RM${NB}1,140.00`, line: `Loss${DOT}Some costs have no price`, tone: 'loss' });
  assert.deepEqual(money({ pending: true, costs: null, profit: null }), { label: 'Profit so far', value: '—', line: 'working out' });
  assert.deepEqual(money({ costs: null, profit: null }), { label: 'Profit so far', value: '—' });
  assert.deepEqual(money({ incomplete: true }), { label: 'Profit so far', value: `RM${NB}357.18`, line: 'Some costs have no price' });
  const partial = runRows([{ ...RUN, partial: true, roomName: null }], TODAY)[0];
  assert.deepEqual([partial.line.split(DOT)[1], partial.room], ['recorded since 4 Nov', 'A deleted room']);
  assert.equal(runRows([{ ...RUN, startedAt: at('2026-11-15', 9) }], TODAY)[0].line.split(DOT).slice(1, 3).join(DOT), `since 15 Nov${DOT}day 1`);
});

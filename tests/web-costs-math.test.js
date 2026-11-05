// The Costs page's pure parts (spec 2026-11-05-costs-design.md 6): the one formatter, the month words, the tiles, the rows and
// the profit bars' layout.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  moneyText, perKgText, monthTitle, monthTiles, categoryRows, entryLine, repeatingLine, runRow, runParts, profitBars, monthsBetween,
} from '../web/costs-math.js';
import { DOT } from '../web/text-math.js';

const NB = ' ';

test('money: RM, 2 places, grouping; a loss with a minus sign; a dash for nothing', () => {
  assert.equal(moneyText(1240.5), `RM${NB}1,240.50`);
  assert.equal(moneyText(-1240.5), `−RM${NB}1,240.50`);
  assert.equal(moneyText(0), `RM${NB}0.00`);
  assert.equal(moneyText(null), '—');
  assert.equal(perKgText(0.004), `RM${NB}0.004`);
  assert.equal(perKgText(-3.1), `−RM${NB}3.10`);
});

test('month words', () => {
  assert.equal(monthTitle('2026-11'), 'November 2026');
  assert.deepEqual(monthsBetween('2026-10', '2026-12'), ['2026-10', '2026-11', '2026-12']);
});

test('the tiles: a loss says so in words; pending says why', () => {
  const tiles = monthTiles({ pending: false, tiles: { income: 300, costs: 640, profit: -340, costPerKg: 32, profitPerKg: -17, kgHarvested: 20, kgSold: 20 } });
  assert.deepEqual(tiles.map((x) => [x.label, x.value, x.line ?? null]), [
    ['Income', `RM${NB}300.00`, `20.0${NB}kg sold`],
    ['Costs', `RM${NB}640.00`, null],
    ['Profit', `−RM${NB}340.00`, 'Loss'],
    ['Cost per kg', `RM${NB}32.00`, `20.0${NB}kg picked`],
    ['Profit per kg', `−RM${NB}17.00`, 'per kg sold'],
  ]);
  const pending = monthTiles({ pending: true, tiles: { income: 0, costs: null, profit: null, costPerKg: null, profitPerKg: null, kgHarvested: 0, kgSold: 0 } });
  assert.equal(pending[1].value, '—');
  assert.equal(pending[1].line, 'Working out the energy cost…');
  assert.equal(pending[0].line, 'Nothing sold');
});

test('the Costs tile says when some costs have no price; a pending run shows dashes', () => {
  const t = (over) => monthTiles({ pending: false, tiles: { income: 0, costs: 10, profit: -10, costPerKg: null, profitPerKg: null, kgHarvested: 0, kgSold: 0, ...over } });
  assert.equal(t({ incomplete: true })[1].line, 'Some costs have no price');
  assert.equal(t({ incomplete: false })[1].line, undefined);
  const pend = monthTiles({ pending: true, tiles: { income: 0, costs: null, profit: null, costPerKg: null, profitPerKg: null, kgHarvested: 0, kgSold: 0, incomplete: true } });
  assert.equal(pend[1].line, 'Working out the energy cost…');
  const run = { startedAt: Date.UTC(2026, 9, 2, 16), endedAt: null, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 100 }], income: 300, costs: null, profit: null, profitPerKg: null, pending: true, parts: { blocks: 0, energy: 0, water: 0, own: 0, shared: 0 } };
  assert.deepEqual(runRow(run).cells, [`RM${NB}300.00`, '—', '—', '—']);
  assert.equal(runRow(run).loss, false);
});

test('rows: categories with their source, entries, monthly items, runs', () => {
  assert.deepEqual(categoryRows([{ key: 'blocks-batches', label: 'Blocks', source: 'batches', amount: 250, share: 83 }]),
    [{ label: 'Blocks', source: 'from Batches', amount: `RM${NB}250.00`, share: `83${NB}%` }]);
  assert.deepEqual(entryLine({ date: '2026-11-03', label: 'Labour', worker: 'Ali', note: 'Oct sales bonus', roomName: null, amount: 230, repeat: null }),
    { date: '3 Nov', what: `Labour${DOT}Ali${DOT}Oct sales bonus`, whom: 'The farm', amount: `RM${NB}230.00`, monthly: false });
  assert.deepEqual(repeatingLine({ date: '2026-08-31', category: 'rent', note: 'Shop lot', worker: null, roomName: null, amount: 1500 }),
    { what: `Rent${DOT}Shop lot`, whom: 'The farm', amount: `RM${NB}1,500.00 a${NB}month`, since: 'since Aug 2026' });
  const run = {
    startedAt: Date.UTC(2026, 9, 2, 16), endedAt: null, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 100 }],
    income: 300, costs: 640, profit: -340, profitPerKg: -17, parts: { blocks: 250, energy: 40, water: 0, own: 50, shared: 300 },
  };
  assert.deepEqual(runRow(run).cells, [`RM${NB}300.00`, `RM${NB}640.00`, `−RM${NB}340.00`, `−RM${NB}17.00`]);
  assert.equal(runRow(run).dates, `3 Oct${NB}–${NB}now`);
  assert.equal(runRow(run).crops, 'Grey oyster');
  assert.deepEqual(runParts(run).map(([label]) => label), ['Blocks', 'Electricity', 'Own costs', 'Share of shared costs', 'Income']);
});

test('profit bars: above and below one zero line, the shown month marked', () => {
  const months = [{ month: '2026-10', profit: 200 }, { month: '2026-11', profit: -100 }, { month: '2026-12', profit: null, pending: true }];
  const { bars, zeroY, ticks } = profitBars(months, '2026-11', 300, 160);
  assert.equal(bars.length, 3);
  assert.ok(bars[0].y + bars[0].h <= zeroY + 0.001, 'a profit above the line');
  assert.ok(Math.abs(bars[1].y - zeroY) < 0.001, 'a loss from the line down');
  assert.equal(bars[1].loss, true);
  assert.equal(bars[1].shown, true);
  assert.equal(bars[2].pending, true);
  assert.ok(ticks.some((x) => x.label === `RM${NB}0`));
});

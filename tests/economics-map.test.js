// The price × yield map (web/economics-map.js, spec 2026-11-12-economics-stage-2-design.md 6): Your container's profit a
// month over 7 selling prices and 7 yields around the figures now, the break-even line, the sales limit capping what sells,
// the cells' words. Goldens: stage 1's 11.1 inputs (made-up figures).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STEPS, capOf, cellOf, mapOf, cellText, cellLabel, lineWords, priceHead, yieldHead } from '../web/economics-map.js';
import { compare } from '../web/economics-model.js';
import { limitWeekOf } from '../web/economics-figures.js';
import { moneyText } from '../web/costs-math.js';

const plain = (s) => s.replaceAll('\u00a0', ' ').replaceAll('\u2060', '').replaceAll('\u2011', '-');
const r2 = (v) => Math.round(v * 100) / 100;
const V = {
  price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60,
  'yours.blocks': 1740, 'yours.yieldG': 250.015, 'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14,
  'yours.turn': 16, 'yours.kwhBlock': (506 * 42) / (1740 * 30.4), 'yours.labourMin': 2.52, 'yours.transport': 0, 'yours.rent': 0,
  'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
};
const GRID = [ // rows: 400, 350, 300, 250, 200, 150, 100 g; columns: RM 20 … 80
  [-2046.82, 2033.97, 6114.76, 10195.56, 14276.35, 18357.15, 22437.94],
  [-2913.99, 656.7, 4227.4, 7798.09, 11368.79, 14939.48, 18510.17],
  [-3781.16, -720.56, 2340.03, 5400.63, 8461.22, 11521.82, 14582.41],
  [-4648.33, -2097.83, 452.66, 3003.16, 5553.66, 8104.15, 10654.65],
  [-5515.5, -3475.1, -1434.7, 605.69, 2646.09, 4686.49, 6726.88],
  [-6382.66, -4852.37, -3322.07, -1791.77, -261.47, 1268.82, 2799.12],
  [-7249.83, -6229.64, -5209.44, -4189.24, -3169.04, -2148.84, -1128.64],
];

test('the grid at the golden inputs: 49 cells to the sen, now in the centre, a break-even a row', () => {
  assert.deepEqual(STEPS, [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6]);
  const m = mapOf(V, {}, { kgWeek: null });
  assert.deepEqual(m.prices, [20, 30, 40, 50, 60, 70, 80]);
  assert.deepEqual(m.yields.map((y) => r2(y)), [400.02, 350.02, 300.02, 250.02, 200.01, 150.01, 100.01], 'high at the top');
  assert.deepEqual(m.rows.map((row) => row.map((c) => r2(c.profit))), GRID);
  assert.deepEqual(m.now, { row: 3, col: 3 });
  assert.equal(m.cap, null);
  assert.equal(m.rows.flat().some((c) => c.capped), false);
  assert.deepEqual(m.line.map((l) => [r2(l.be), l.off]), [[25.02, null], [28.16, null], [32.35, null], [38.23, null], [47.03, null], [61.71, null], [91.06, 'right']]);
  assert.deepEqual([m.rows[3][3].tone, m.rows[3][2].tone, m.rows[3][1].tone], ['profit', 'profit', 'loss']);
});

test('what you can sell caps the kg sold: the rows that grow more sell the cap, every cost kept', () => {
  assert.equal(r2(capOf(60)), 260.57);
  assert.equal(capOf(null), null);
  const m = mapOf(V, {}, { kgWeek: 60 });
  const capped = [-4554.46, -1948.74, 656.97, 3262.69, 5868.4, 8474.11, 11079.83];
  for (const row of [0, 1, 2]) {
    assert.deepEqual(m.rows[row].map((c) => r2(c.profit)), capped, `row ${row}`);
    assert.ok(m.rows[row].every((c) => c.capped && r2(c.kgSold) === 260.57));
    assert.equal(r2(m.line[row].be), 37.48);
  }
  assert.deepEqual(m.rows.slice(3).map((row) => row.map((c) => r2(c.profit))), GRID.slice(3), '255.05 kg at 250 g: under the cap');
  assert.equal(r2(m.rows[2][4].grown), 306.06);
});

test('no grid with a price or a yield of 0; prices up to RM 1,000 a kg in even steps', () => {
  assert.deepEqual(mapOf({ ...V, price: 0 }, {}, {}), { none: 'price' });
  assert.deepEqual(mapOf({ ...V, 'yours.yieldG': 0 }, {}, {}), { none: 'yield' });
  const dear = mapOf({ ...V, price: 800 }, {}, {});
  assert.deepEqual(dear.prices, [250, 375, 500, 625, 750, 875, 1000], 'the centre held at RM 625: even steps');
  // the centre clamped: no cell is now (the nearest would differ from the tiles: the review); now's month said under the grid
  assert.equal(dear.now, null, 'RM 800 is between RM 750 and RM 875');
  const tile = compare({ ...V, price: 800 }, ['yours'], {})[0];
  assert.equal(dear.here.profit, tile.profit, 'now\'s month: the tile\'s');
  assert.ok(lineWords(dear).map(plain).includes(`Now, at RM 800.00 a kg and 250 g a block, falls between the cells: ${plain(moneyText(tile.profit))} a month.`), lineWords(dear).map(plain).join(' | '));
  assert.equal(plain(lineWords(dear)[0]), plain(lineWords(mapOf(V, {}, {}))[0]), 'the break-even at your yield from now\'s own month');
  const exact = mapOf({ ...V, price: 750 }, {}, {});
  assert.deepEqual(exact.now, { row: 3, col: 4 }, 'clamped, but now exactly on a column');
  assert.equal(exact.rows[3][4].profit, compare({ ...V, price: 750 }, ['yours'], {})[0].profit);
  const heavy = mapOf({ ...V, 'yours.yieldG': 4000 }, {}, {});
  assert.equal(heavy.now, null, 'the yield clamped too (4,000 g between 3,750 and 4,375 g)');
  assert.equal(mapOf(V, {}, {}).now.row, 3);
  assert.equal(mapOf(V, {}, {}).here.profit, mapOf(V, {}, {}).rows[3][3].profit);
  assert.equal(cellOf(V, {}, { price: 50, yieldG: 0, cap: null }).be, null, 'nothing sold: no break-even');
});

test('the cells\' words: whole RM on a desk, a sign on a phone; a reader\'s label; the heads; the lines under the grid', () => {
  const m = mapOf(V, {}, { kgWeek: null });
  assert.equal(plain(cellText(m.rows[3][3])), '3,003');
  assert.equal(plain(cellText(m.rows[3][0])), '−4,648');
  assert.deepEqual([cellText(m.rows[3][3], { phone: true }), cellText(m.rows[3][0], { phone: true }), cellText({ profit: 0.001 }, { phone: true })], ['+', '−', '0']);
  assert.equal(plain(cellLabel(m.rows[2][4], 60, m.yields[2])), 'RM 60.00 a kg and 300 g a block: RM 8,461.22 a month, 306.1 kg sold, break-even RM 32.35 a kg.');
  const c = mapOf(V, {}, { kgWeek: 60 });
  assert.equal(plain(cellLabel(c.rows[2][4], 60, c.yields[2])),
    'RM 60.00 a kg and 300 g a block: RM 5,868.40 a month, 260.6 kg sold of 306.1 kg grown (what you can sell), break-even RM 37.48 a kg.');
  assert.equal(plain(cellLabel(cellOf(V, {}, { price: 50, yieldG: 0, cap: null }), 50, 0)), 'RM 50.00 a kg and 0 g a block: −RM 8,984.17 a month, nothing sold.');
  assert.deepEqual([plain(priceHead(20)), plain(priceHead(20.5)), plain(priceHead(20, { phone: true })), plain(priceHead(20.58, { phone: true })), plain(priceHead(41.15, { phone: true })), plain(yieldHead(250.015))], ['RM 20', 'RM 20.50', '20', '20.6', '41.2', '250 g']);
  assert.deepEqual(lineWords(m).map(plain), ['Break-even at your yield (250 g): RM 38.23 a kg.', 'At 100 g a block it breaks even only above RM 80.00 a kg.']);
  const low = mapOf({ ...V, price: 100 }, {}, {});
  assert.ok(lineWords(low).map(plain).includes('At 250 g a block and over it breaks even below RM 40.00 a kg.'), lineWords(low).map(plain).join(' | '));
});

// ---- the UI check's notes ----
test('the capped rows said under the grid; now\'s cell is the month the tiles show (the owner\'s one answer)', () => {
  const m = mapOf(V, {}, { kgWeek: 60 });
  assert.ok(lineWords(m).map(plain).includes('From 300 g a block you grow more than you can sell (60.0 kg a week): those rows earn the same.'), lineWords(m).map(plain).join(' | '));
  // the owner's one answer: now's cell is the month the tiles show, capped the same way
  for (const kgWeek of [null, 60, 50, 20]) {
    const month = compare(V, ['yours'], kgWeek === null ? {} : { sellCap: capOf(kgWeek) })[0];
    assert.equal(mapOf(V, {}, { kgWeek }).rows[3][3].profit, month.profit, `${kgWeek} kg a week`);
  }
  // the owner, 2026-11-13: the limit caps only when typed; Your sales' week alone caps neither the tile nor now's cell
  const sales = { kg: 150, days: 21, from: '2026-10-21' }; // 50.0 kg a week: under the 255.1 kg a month grown
  for (const [limit, typed, capped] of [[{ value: null, source: null, at: null, sales }, null, false], [{ value: 50, source: 'owner', at: 0, sales }, null, true],
    [{ value: null, source: null, at: null, sales }, 50, true]]) {
    const kgWeek = limitWeekOf(limit, typed);
    const month = compare(V, ['yours'], typeof kgWeek === 'number' ? { sellCap: capOf(kgWeek) } : {})[0];
    const now = mapOf(V, {}, { kgWeek }).rows[3][3];
    assert.equal(now.profit, month.profit);
    assert.equal(month.capped, capped);
  }
});

// What moves profit most (web/economics-swing.js, spec 2026-11-12-economics-stage-2-design.md 5): Your container's profit a
// month with each figure at its low then its high, the rest held; research figures over their range, the rest ±20 % (whole
// figures rounded outwards, every figure within its limits); a flush brings its share of the yield; the register's write-off
// in step with a swung part; labour as people. Goldens: stage 1's 11.1 inputs (made-up figures), the spec's table 5.6.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SWING, TOP, DECISIONS, rangeOf, swings, swingText, swingEnds, stillLine } from '../web/economics-swing.js';
import { researchOf } from '../web/economics-defaults.js';

const plain = (s) => s.replaceAll('\u00a0', ' ').replaceAll('\u2060', '').replaceAll('\u2011', '-');
const r2 = (v) => Math.round(v * 100) / 100;
const V = {
  price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60,
  'yours.blocks': 1740, 'yours.yieldG': 250.015, 'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14,
  'yours.turn': 16, 'yours.kwhBlock': (506 * 42) / (1740 * 30.4), 'yours.labourMin': 2.52, 'yours.transport': 0, 'yours.rent': 0,
  'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
};
const ROOM = { volume: 67.4, humidifierLH: 2 }; // a 40 ft container
// The view's figures at those values, every one from the source given (with its lion's mane research).
const figuresAt = (source, values = V) => Object.entries(values).map(([key, value]) => ({
  key, value, source, way: key.includes('.') ? key.split('.')[0] : 'shared', research: researchOf(key, 'lionsmane', ROOM, 1740),
}));
const rowsOf = (out, list = out.rows) => list.map((r) => [r.key, +r.low.toFixed(4), +r.high.toFixed(4), r2(r.atLow), r2(r.atHigh)]);

test('golden, every figure yours (±20 %): the base RM 3,003.16; flushes, price and yield lead; the decisions apart; transport still', () => {
  assert.deepEqual([SWING, TOP], [0.2, 8]);
  const out = swings(figuresAt('owner'), V, {});
  assert.equal(r2(out.base), 3003.16);
  assert.deepEqual(rowsOf(out), [
    ['yours.flushes', 1, 3, -7179, 3589.5],
    ['price', 40, 60, -2550.5, 2550.5],
    ['yours.yieldG', 200.012, 300.018, -2397.47, 2397.47],
    ['blockPrice', 4.8, 7.2, 1511.31, -1511.31],
    ['yours.turn', 12, 20, 381.37, -315.04],
    ['shrink', 8, 12, 266.39, -266.39],
    ['yours.loss', 8, 12, 266.39, -266.39],
    ['yours.first', 9, 15, 278.69, -241.53],
    ['yours.interval', 11, 17, 278.69, -241.53],
    ['pack', 2.4, 3.6, 153.03, -153.03],
    ['wage', 8, 12, 105.79, -105.79],
    ['yours.labourMin', 2.016, 3.024, 105.79, -105.79],
    ['tariff', 0.4408, 0.6612, 55.76, -55.76],
    ['yours.kwhBlock', 0.3214, 0.4821, 55.76, -55.76],
    ['fixedTnb', 16, 24, 4, -4],
  ]);
  assert.deepEqual(rowsOf(out, out.decisions), [
    ['life', 48, 72, -149.96, 99.97],
    ['yours.container', 14800, 22200, 61.67, -61.67],
    ['yours.cooling', 6864, 10296, 28.6, -28.6],
    ['yours.fans', 2640, 3960, 11, -11],
    ['yours.humidifier', 2400, 3600, 10, -10],
    ['yours.racks', 2088, 3132, 8.7, -8.7],
    ['yours.rent', 0, 0, 0, 0],
  ], 'every decision, moving or not');
  assert.deepEqual(out.still, ['yours.transport']);
  const flush = out.rows[0];
  assert.deepEqual([r2(flush.down), r2(flush.up), r2(flush.spread)], [-7179, 3589.5, 10768.5]);
  assert.ok(DECISIONS.includes('yours.workers') && DECISIONS.includes('yours.workerMonth') && DECISIONS.includes('yours.other'));
});

test('golden, every figure research: yield, flushes and price lead; rent among the decisions; nothing still', () => {
  const out = swings(figuresAt('research'), V, {});
  assert.deepEqual(rowsOf(out).slice(0, 8), [
    ['yours.yieldG', 150, 400, -4795.36, 7191.25],
    ['yours.flushes', 1, 3, -7179, 3589.5],
    ['price', 30, 70, -5100.99, 5100.99],
    ['blockPrice', 3, 10, 3778.29, -5037.71],
    ['yours.loss', 5, 25, 665.96, -1997.89],
    ['shrink', 5, 20, 665.96, -1331.93],
    ['yours.turn', 9, 30, 724.6, -905.75],
    ['pack', 1.5, 5, 382.57, -510.1],
  ]);
  assert.deepEqual(rowsOf(out).slice(8).map((r) => r[0]), ['yours.kwhBlock', 'yours.labourMin', 'yours.interval', 'yours.transport',
    'yours.first', 'wage', 'tariff', 'fixedTnb']);
  assert.deepEqual(rowsOf(out, out.decisions).map((r) => r[0]), ['yours.rent', 'life', 'yours.container', 'yours.fans', 'yours.cooling', 'yours.humidifier', 'yours.racks']);
  assert.deepEqual(rowsOf(out, out.decisions).find((r) => r[0] === 'yours.racks'), ['yours.racks', 348, 2262, 37.7, 5.8], 'a range not holding the value: used as it is');
  assert.deepEqual(out.still, []);
});

test('the range: ±20 % for yours, your runs\', your sales\', Settings\' and the simulator\'s; whole figures outwards; the limits; a typed figure', () => {
  const f = (key, source, value) => ({ key, source, value, research: researchOf(key, 'lionsmane', ROOM, 1740) });
  for (const source of ['owner', 'runs', 'sales', 'costs', 'register', 'settings', 'simulator']) {
    assert.deepEqual(rangeOf(f('price', source, 50), 50), { low: 40, high: 60, how: 'twenty' }, source);
  }
  assert.deepEqual(rangeOf(f('price', 'research', 50), 50), { low: 30, high: 70, how: 'research' });
  assert.deepEqual(rangeOf(f('price', 'research', 55), 55, { typed: true }), { low: 44, high: 66, how: 'twenty' }, 'a typed figure is yours');
  assert.deepEqual(rangeOf(f('yours.first', 'owner', 3), 3), { low: 2, high: 4, how: 'twenty' }, '2.4 down, 3.6 up');
  assert.deepEqual(rangeOf(f('yours.loss', 'owner', 80), 80), { low: 64, high: 90, how: 'twenty' }, 'a loss at most 90 %');
  assert.deepEqual(rangeOf(f('yours.flushes', 'owner', 1), 1), { low: 1, high: 2, how: 'twenty' }, 'at least 1 flush');
  assert.deepEqual(rangeOf({ key: 'wage', source: 'research', value: 10, research: null }, 10), { low: 8, high: 12, how: 'twenty' }, 'no research: ±20 %');
});

test('the room\'s blocks never swing; labour as people stills the hourly cost and the minutes; the register\'s write-off moves with a swung part', () => {
  const people = { ...V, 'yours.workers': 1, 'yours.workerMonth': 1954.15 };
  const out = swings(figuresAt('owner', people), people, { otherBlocks: 0 });
  assert.equal(out.rows.some((r) => r.key === 'yours.blocks') || out.still.includes('yours.blocks'), false);
  assert.ok(out.still.includes('wage') && out.still.includes('yours.labourMin'));
  assert.ok(out.decisions.some((r) => r.key === 'yours.workerMonth'));
  const reg = { ...V, 'yours.cooling': 8340, 'yours.other': 1200 };
  const ctx = { register: { total: 9540, writeOffMonth: 189, parts: { 'yours.cooling': 8340, 'yours.other': 1200 } } };
  const r = swings(figuresAt('owner', reg), reg, ctx);
  const cooling = r.decisions.find((x) => x.key === 'yours.cooling');
  assert.equal(r2(cooling.atHigh), r2(-(189 * (8340 * 0.2)) / 9540), 'the register\'s month by its parts\' share, no jump to equipment ÷ months');
  assert.ok(r2(r.decisions.find((x) => x.key === 'life').spread) > 0, 'the parts not in the register still follow the months');
});

test('the words: a row, a flush, a figure with no unit after it, the still line', () => {
  const out = swings(figuresAt('owner'), V, {});
  const by = Object.fromEntries(out.rows.map((r) => [r.key, plain(swingText(r))]));
  assert.equal(by.price, 'Selling price RM 40.00 → 60.00 a kg: −RM 2,550.50 to +RM 2,550.50 a month');
  assert.equal(by['yours.flushes'], 'Flushes per block 1 → 3 (the yield with them): −RM 7,179.00 to +RM 3,589.50 a month');
  assert.equal(by.blockPrice, 'Block price, ready to fruit RM 4.80 → 7.20 a block: +RM 1,511.31 to −RM 1,511.31 a month');
  assert.equal(by['yours.turn'], 'Rest and turnaround 12 → 20 days: +RM 381.37 to −RM 315.04 a month');
  const container = out.decisions.find((r) => r.key === 'yours.container');
  assert.equal(plain(swingText(container)), 'Container, delivered RM 14,800.00 → 22,200.00: +RM 61.67 to −RM 61.67 a month');
  assert.equal(plain(swingText(container, 'built')).startsWith('Building, insulated RM'), true);
  assert.equal(plain(stillLine(out.still)), 'Not moving it at these figures: “Transport to buyers”.');
  // a bar's ends: the fall at the left with the figure that gives it, the rise at the right
  const ends = (key) => JSON.parse(plain(JSON.stringify(swingEnds(out.rows.find((r) => r.key === key)))));
  assert.deepEqual(ends('blockPrice'), { down: { text: '−RM 1,511.31', at: 'RM 7.20 a block' }, up: { text: '+RM 1,511.31', at: 'RM 4.80 a block' } });
  assert.deepEqual(ends('price'), { down: { text: '−RM 2,550.50', at: 'RM 40.00 a kg' }, up: { text: '+RM 2,550.50', at: 'RM 60.00 a kg' } });
  assert.equal(plain(stillLine(['wage', 'yours.labourMin', 'yours.rent'], 'container', { people: true })), 'Not moving it at these figures: “Rent”. Labour per block handled sets only the hours needed: labour is counted as workers.');
  assert.equal(stillLine(['wage'], 'container', { people: true }), null);
  assert.equal(stillLine([]), null);
});

test('the review: a register part typed over its figure: the swing\'s now is the tile\'s (the register not scaled)', async () => {
  const { compare } = await import('../web/economics-model.js');
  const reg = { ...V, 'yours.cooling': 9000, 'yours.other': 1200 }; // cooling typed over the register's 8,340
  const ctx = { register: { total: 9540, writeOffMonth: 189, parts: { 'yours.cooling': 8340, 'yours.other': 1200 } } };
  assert.equal(r2(swings(figuresAt('owner', reg), reg, ctx).base), r2(compare(reg, ['yours'], ctx)[0].profit));
});

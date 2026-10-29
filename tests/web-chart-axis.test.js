// The line charts' y axis and band numbers (critique 2026-10-29c): a simulation's axis said only 22.0 and 15.0, so 16.3 °C
// could not be read; the CO₂ axis printed 1000; a band number sat beside the axis's own number under the axis ("25.0" by
// "24.0") or on the outdoor line; the band's numbers of a simulation stood at the right among the outdoor scale's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { yTicks, tickCount, groupNumber, bandLabels } from '../web/chart-math.js';

const chart = readFileSync(new URL('../web/chart.js', import.meta.url), 'utf8');

test('yTicks: round values inside the range, as many as fit (1, 2, 2.5 or 5 times a power of ten)', () => {
  assert.deepEqual(yTicks(15, 22, 5), [16, 18, 20, 22], 'a simulation\'s 15–22 °C: 16.3 °C now reads between 16 and 18');
  assert.deepEqual(yTicks(18.5, 21.5, 6), [19, 20, 21]);
  assert.deepEqual(yTicks(80, 100, 6), [80, 85, 90, 95, 100]);
  assert.deepEqual(yTicks(400, 1600, 6, 0), [500, 750, 1000, 1250, 1500]);
  assert.deepEqual(yTicks(22, 34, 5), [22.5, 25, 27.5, 30, 32.5], 'Container Gamma at 390 px: not 25 and 30 alone');
  assert.deepEqual(yTicks(18.5, 21.5, 6), [19, 20, 21], 'no 0.25 steps: one decimal cannot show them');
  assert.deepEqual(yTicks(19.6, 20.4, 5), [19.6, 19.8, 20, 20.2, 20.4]);
  assert.deepEqual(yTicks(0, 1, 6, 0), [0, 1], 'never finer than the digits shown');
  assert.deepEqual(yTicks(20, 20, 5), [20], 'no range: the one value');
  for (const [lo, hi, most] of [[15, 22, 5], [18.5, 21.5, 6], [24.5, 27, 5], [55, 100, 6], [700, 1500, 5], [-2, 3, 6]]) {
    const t = yTicks(lo, hi, most, 1);
    assert.ok(t.length >= 3 && t.length <= most, `${lo}–${hi}: ${t.join(', ')}`);
    assert.ok(t.every((v) => v >= lo && v <= hi));
  }
});

test('tickCount: a number every 28 px or more of plot, 2 to 6', () => {
  assert.equal(tickCount(146), 6, 'a desk chart with an outdoor legend');
  assert.equal(tickCount(116), 5, 'a phone\'s');
  assert.equal(tickCount(40), 2);
  assert.equal(tickCount(400), 6);
});

test('groupNumber: thousands grouped, cheaply (no toLocaleString)', () => {
  assert.equal(groupNumber(1000, 0), '1,000');
  assert.equal(groupNumber(1234567.25, 1), '1,234,567.3');
  assert.equal(groupNumber(999, 0), '999');
  assert.equal(groupNumber(21, 1), '21.0');
  assert.equal(groupNumber(-1500, 0), '-1,500');
  assert.doesNotMatch(readFileSync(new URL('../web/chart-math.js', import.meta.url), 'utf8'), /toLocaleString/);
});

const box = { x0: 64, y0: 176, y1: 30 };

test('bandLabels: the top number over its line, the bottom one under it, at the left inside the plot', () => {
  const { labels, skip } = bandLabels([{ text: '21.0', y: 80 }, { text: '19.0', y: 130 }], box, []);
  assert.deepEqual(labels.map(({ text, x, y }) => [text, x, y]), [['21.0', 68, 76], ['19.0', 68, 143]]);
  assert.deepEqual(skip, []);
});

test('bandLabels: a number that would leave the plot turns to its line\'s other side (never under the time axis)', () => {
  // Container Gamma at 390 px: the band's 25.0 sat under the axis beside the axis's 24.0
  const { labels } = bandLabels([{ text: '28.0', y: 60 }, { text: '25.0', y: 168 }], box, []);
  assert.equal(labels[1].y, 164, 'over its line, inside the band');
  assert.ok(labels[1].y + 2 <= box.y0);
  const top = bandLabels([{ text: '28.0', y: 32 }, { text: '25.0', y: 120 }], box, []).labels[0];
  assert.equal(top.y, 45, 'under its line when over it would reach the legend');
});

test('bandLabels: two numbers that would overlap stand side by side', () => {
  const { labels } = bandLabels([{ text: '25.0', y: 168 }, { text: '24.0', y: 172 }], box, []);
  assert.ok(labels[1].x >= labels[0].x + labels[0].width + 6, 'the bottom one right of the top one');
});

test('bandLabels: an axis number whose row a band number takes is left out (its grid line stays)', () => {
  const { skip } = bandLabels([{ text: '21.0', y: 80 }, { text: '19.0', y: 130 }], box, [176, 141, 106, 72, 37]);
  assert.deepEqual(skip, [1, 3], 'the 19.0 under its line at 143 sits on the row of the tick at 141, the 21.0 at 76 on 72');
});

test('chart.js: ticks and grid lines from yTicks, numbers grouped, band numbers placed by bandLabels on a backing', () => {
  assert.match(chart, /yTicks\(min, max, tickCount\(y0 - y1\), dg\)/);
  assert.match(chart, /bandLabels\(/);
  assert.match(chart, /class: 'band-label-bg'/, 'a backing of the card\'s colour, so no line runs through a band number');
  assert.doesNotMatch(chart, /\.toFixed\(current\.digits \?\? 1\)\)/, 'every number on the chart is grouped');
  assert.doesNotMatch(chart, /x: x1 - 4, y: yFor\(v\) \+ dy, 'text-anchor': 'end'/, 'a moved band is numbered at the left too, not among the outdoor scale');
});

test('chart.js: the outdoor line is drawn under the band\'s shading and limits, fainter than the room\'s', () => {
  assert.ok(chart.indexOf('// The second line (outdoor)') < chart.indexOf('// The control band:'), 'outdoor first, the band over it');
  assert.match(chart, /style: `stroke:\$\{current\.color \?\? 'var\(--ink\)'\};opacity:\.55`/);
});

// The outdoor line on the temperature and humidity charts (owner, 2026-10-26: "add dotted line for outside value"): dotted in
// the chart's own colour, so it is not taken for the grey dashed band limits, with its latest value in the legend.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const chart = readFileSync(new URL('../web/chart.js', import.meta.url), 'utf8');
const part = chart.slice(chart.indexOf('// The second line (outdoor)'), chart.indexOf('// The control band:'));

test('the outdoor line is dotted, round-capped, in the chart\'s colour; the band limits stay grey dashes', () => {
  assert.match(part, /'stroke-dasharray': OUTDOOR_DOTS/);
  assert.match(chart, /const OUTDOOR_DOTS = '0\.1 5';/);
  assert.match(part, /'stroke-linecap': 'round'/);
  assert.match(part, /style: `stroke:\$\{current\.color \?\? 'var\(--ink\)'\};opacity:\.55`/, 'fainter than the room\'s line (critique 2026-10-29c)');
  assert.doesNotMatch(part, /'stroke-dasharray': '5 4'/);
  assert.match(chart, /'stroke-dasharray': '4 4'/, 'the band limits keep their dashes');
});

// Critique 2026-10-28: "own scale 25.8–32.6" in the plot was struck through by the band's line and gone on a phone.
test('its legend sits above the plot (Room, then Outdoor and its latest value); its scale is numbered on the right', () => {
  assert.match(part, /'Room'/);
  assert.match(part, /secondLegend\(current\.second\.label \?\? 'Outdoor', lastSecond \? fmt\(lastSecond\.value\) : '', \(narrow \? width : x1\) - \(lx \+ 26\) - 4, !narrow\)/);
  assert.match(part, /svg\.append\(el\('line', \{ x1: x1 \+ 7, x2: x1 \+ 27, y1: y1 - 10, y2: y1 - 10, \.\.\.dots \}\)\);/, 'the right scale under a dotted mark');
  assert.match(part, /if \(!narrow\) \{\n        for \(const \[v, y\] of \[\[s2\.max, y1\], \[s2\.min, y0\]\]\)/, 'not on a phone (critique 2026-10-29)');
  assert.match(part, /for \(const \[v, y\] of \[\[s2\.max, y1\], \[s2\.min, y0\]\]\)/);
  assert.match(chart, /export const M = \{ left: 64, right: 48,/);
});

test('the outdoor line has its own scale (owner, 2026-10-28): the room line keeps the full height', () => {
  const main = chart.slice(chart.indexOf('const { min, max } = niceRange(yRange('), chart.indexOf('// The outdoor line on its own scale'));
  assert.doesNotMatch(main, /secondValues/, 'the room\'s scale leaves the outdoor values out');
  assert.match(chart, /const s2 = secondValues\.length \? niceRange\(yRange\(secondValues, current\.minSpan \?\? 1, current\.bounds\), current\.bounds\) : null;/);
  assert.match(part, /yFor2\(p\.value\)/);
});

test('a long range marks a gap in the readings (the app or the sensor was off) instead of only breaking the line', () => {
  const gap = chart.slice(chart.indexOf('// A gap in the readings'), chart.indexOf('// The line, one path per run'));
  assert.ok(gap.length > 0, 'a block for the gaps');
  assert.match(gap, /if \(current\.range\)/, 'long ranges only (Live shows failed polls as red ticks)');
  assert.match(gap, /'No readings'/);
});

// Critique 2026-10-28: "Outdoor 61.1 % RH · right scale" was cut by the SVG's edge at 390 px.
test('the outdoor legend takes the longest words that fit; a phone keeps the name and value whole', async () => {
  const { secondLegend } = await import('../web/chart-math.js');
  assert.equal(secondLegend('Outdoor', '61.1 % RH', 400), 'Outdoor 61.1 % RH · its scale on the right');
  assert.equal(secondLegend('Outdoor', '61.1 % RH', 220), 'Outdoor 61.1 % RH · right scale');
  // a 390 px phone: the chart about 310 px wide, the text from x 100 to the scale's mark at 262
  assert.equal(secondLegend('Outdoor', '61.1 % RH', 310 - 48 - 100 - 4), 'Outdoor 61.1 % RH');
  assert.equal(secondLegend('Outdoor', '61.1 % RH', 60), 'Outdoor');
  assert.equal(secondLegend('Outdoor', '', 400), 'Outdoor · its scale on the right', 'no value yet');
});

// Critique 2026-10-29: the band's numbers at the right end sat beside the outdoor scale's: two columns of numbers at the
// right of every chart. The room's band is labelled at the left inside the plot, by the room's own scale.
test('the band\'s numbers sit at the left inside the plot, by the room\'s scale, apart from the outdoor scale at the right', async () => {
  const { M } = await import('../web/chart.js');
  const band = chart.slice(chart.indexOf('// The control band:'), chart.indexOf('// Time labels'));
  assert.doesNotMatch(band, /x1 - 4/);
  assert.match(chart, /svg\.append\(el\('text', \{ x: l\.x, y: l\.y, 'text-anchor': 'start', style: 'fill:var\(--muted\)', 'font-size': 12, class: 'band-label' \}, l\.text\)\);/);
  const { bandLabels } = await import('../web/chart-math.js');
  assert.equal(bandLabels([{ text: '21.0', y: 80 }, { text: '19.0', y: 130 }], { x0: M.left, y0: 176, y1: 30 }, []).labels[0].x, M.left + 4);
});

// Critique 2026-10-29: on a phone the outdoor scale's numbers took 48 px of a 330 px chart; they go (the legend says the
// outdoor value), and the plot, the bar charts and the timeline all get the width.
test('a phone\'s chart has no outdoor scale numbers: an 18 px right margin, the same for the bar charts and the timeline', async () => {
  const { rightMargin, NARROW_CHART, M } = await import('../web/chart.js');
  assert.equal(rightMargin(330), 18);
  assert.equal(rightMargin(NARROW_CHART), M.right);
  assert.match(chart, /export const rightMargin = \(width\) => \(width < NARROW_CHART \? 18 : M\.right\);/);
  assert.match(chart, /const x1 = width - rightMargin\(width\);/);
  for (const file of ['timeline.js', 'bar-chart.js']) {
    const src = readFileSync(new URL(`../web/${file}`, import.meta.url), 'utf8');
    assert.match(src, /const x1 = width - rightMargin\(width\);/, file);
  }
  const { secondLegend } = await import('../web/chart-math.js');
  assert.equal(secondLegend('Outdoor', '61.1 % RH', 400, false), 'Outdoor 61.1 % RH', 'no scale to name');
});

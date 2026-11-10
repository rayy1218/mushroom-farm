// The Units Rule in the Economics words (web/economics-*.js): a number keeps its unit at a wrap (a no-break space between
// them), RM and USD keep their number, and a range of numbers never breaks at its dash (word joiners around it). Checked on
// every research note, every refusal and the comparison's own lines, and on the page modules' source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ECONOMICS_CROPS, FIGURES, figuresFor, researchOf, checkFigure } from '../web/economics-defaults.js';
import { rangeText, leftLine } from '../web/economics-math.js';

const UNIT = /\d (?:°C|%|kWh|kg|g|m³|L\/h|W|hp|h|ft|sen|days?|months?|blocks?|flush(?:es)?|CNY|min|RM\/kg|RM)(?![\w/³])/;
const MONEY = /\b(?:RM|USD) [\d−-]/;
const DASH = /\d–|–\d/; // a range's dash with no word joiner beside it
const broken = (text) => [UNIT, MONEY, DASH].filter((re) => re.test(text)).map(String);
const rooms = [{ volume: 67.4, humidifierLH: 2 }, { volume: 30, humidifierLH: 13 }];

test('every research note keeps its numbers with their units, and its ranges whole', () => {
  for (const crop of ECONOMICS_CROPS) {
    for (const f of figuresFor(crop)) {
      for (const room of rooms) {
        const r = researchOf(f.key, crop, room, 1482);
        if (r) assert.deepEqual(broken(r.note), [], `${crop} ${f.key}: ${r.note}`);
      }
    }
  }
});

test('every refusal keeps its number with its unit', () => {
  for (const f of FIGURES) {
    const words = checkFigure(f.key, -1);
    assert.deepEqual(broken(words), [], words);
  }
});

test('a range keeps together at its dash; the ways left out keep their units and ranges', () => {
  assert.equal(rangeText('price', 3, 10), 'RM\u00a03.00\u2060–\u206010.00\u00a0a\u00a0kg');
  assert.equal(rangeText('yours.yieldG', 150, 400), '150\u2060–\u2060400\u00a0g');
  for (const crop of ECONOMICS_CROPS) assert.deepEqual(broken(leftLine(crop)), [], crop);
});

test('the page modules write no number and unit with a plain space between them', () => {
  for (const name of ['economics-math.js', 'economics-figures.js', 'economics-page.js']) {
    const code = readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8').split('\n').filter((line) => !/^\s*\/\//.test(line));
    for (const line of code) assert.deepEqual(broken(line.replace(/\/\/ .*$/, '')).filter((re) => re !== String(DASH)), [], `${name}: ${line.trim()}`);
  }
});

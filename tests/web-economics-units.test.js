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
  for (const name of ['economics-math.js', 'economics-figures.js', 'economics-page.js', 'economics-plan.js', 'economics-map.js', 'economics-swing.js', 'economics-charts.js']) { // stage 2's too
    const code = readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8').split('\n').filter((line) => !/^\s*\/\//.test(line));
    for (const line of code) assert.deepEqual(broken(line.replace(/\/\/ .*$/, '')).filter((re) => re !== String(DASH)), [], `${name}: ${line.trim()}`);
  }
});

// ---- Economics stage 2 (spec 2026-11-12-economics-stage-2-design.md) ----
test('stage 2\'s words keep their units: the tiles, the bars, the swing, the map, the runs against the plan', async () => {
  const { compare } = await import('../web/economics-model.js');
  const { tilesOf, stickyText, barsOf, SHORT_LEFT } = await import('../web/economics-math.js');
  const { swings, swingText, stillLine } = await import('../web/economics-swing.js');
  const { mapOf, cellLabel, lineWords } = await import('../web/economics-map.js');
  const plan = await import('../web/economics-plan.js');
  const { meterText, meterOf, noteParts, limitFigure } = await import('../web/economics-figures.js');
  const V = {
    price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60, 'yours.blocks': 1740, 'yours.yieldG': 250,
    'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14, 'yours.turn': 16, 'yours.kwhBlock': 0.4, 'yours.labourMin': 2.52,
    'yours.transport': 0, 'yours.rent': 0, 'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
  };
  const texts = [];
  for (const price of [50, 36]) {
    const results = compare({ ...V, price }, ['yours']);
    texts.push(...tilesOf([...results, { ...results[0], way: 'shed' }], { room: 'Container 1', crop: 'lionsmane', price, life: 60 }).flatMap((t) => [t.figure, t.caption]));
    texts.push(stickyText(results[0]).map((p) => (typeof p === 'string' ? p : p.text)).join(''));
    texts.push(...barsOf(results, [{ way: 'shed', reason: 'warm-strain' }], 'lionsmane').rows.map((r) => r.words));
  }
  texts.push(...Object.values(SHORT_LEFT).flatMap((o) => Object.values(o)));
  const figures = Object.entries(V).map(([key, value]) => ({ key, value, source: 'owner', way: key.includes('.') ? 'yours' : 'shared', research: null }));
  const out = swings(figures, V, {});
  texts.push(...out.rows.map((r) => swingText(r)), stillLine(out.still) ?? '');
  const m = mapOf(V, {}, { kgWeek: 60 });
  texts.push(...m.rows.flatMap((row, r) => row.map((c, i) => cellLabel(c, m.prices[i], m.yields[r]))), ...lineWords(m));
  texts.push(meterText(meterOf(figures)).text);
  for (const source of ['owner', 'sales', null]) texts.push(...noteParts(limitFigure({ value: 8, source, at: 0, sales: { kg: 24, days: 21, from: '2026-10-21' } }), { room: 'Container 1', crop: 'lionsmane' }).map((n) => n.text));
  const P = { at: 0, figures: Object.fromEntries(Object.entries(V).map(([k, value]) => [k, { value, source: 'research' }])), context: {} };
  const run = { runId: 1, from: 0, to: 28 * 86_400_000, days: 28, partial: true, mixed: ['oyster'], blocks: 1740, lost: 87, measured: true, kg: 380.6, sold: { kg: 300, total: 16200 }, price: 54, blockPrice: 6.5, kwhBlock: 0.45, kwhPending: false };
  const args = [P, run, V, {}, 'lionsmane'];
  const months = plan.runMonths(...args);
  texts.push(...plan.runRows(...args).flatMap((r) => [r.plan, r.run, r.sub ?? '']), plan.againstLine(months.diff), plan.gapsLine(plan.gapsOf(...args)), plan.planLine(P),
    plan.mixedLine(run, 'Container 1'), plan.partialLine(run), plan.runTitle(run, months), plan.noDayLine(run),
    plan.progressLine(plan.progressOf({ day: 20, kg: 180 }, V)), plan.progressLine(plan.progressOf({ day: 5, kg: 0 }, V)));
  for (const t of texts) assert.deepEqual(broken(t), [], t);
});

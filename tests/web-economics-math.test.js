// The Economics page's words for the comparison (web/economics-math.js, spec 2026-11-06-economics-design.md 8.2–8.4, 8.7):
// the headline at the golden inputs and at every crop's defaults, every headline case and equipment word, the rows (a loss,
// never, no equipment), the months, a figure with its unit, the lines under the table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsText, figureText, rangeText, wayName, headline, rows, fillLine, sizedLine, neverLine, leftLine, labourLine, tilesOf, stickyText, barsOf, SHORT_LEFT, compareChoices, phoneCaption, readerSentence } from '../web/economics-math.js';
import { compare, grow } from '../web/economics-model.js';
import { ECONOMICS_CROPS, WAYS, figuresFor, researchOf } from '../web/economics-defaults.js';

const NB = '\u00a0';
// The words as the spec writes them: a number keeps its unit with a no-break space (the Units Rule), read here as a space.
const plain = (v) => (typeof v === 'string' ? v.replaceAll(NB, ' ').replaceAll('\u2060', '').replaceAll('\u2011', '-') : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const text = (h) => plain([h.first.map((p) => (typeof p === 'string' ? p : p.text)).join(''), h.second].filter(Boolean).join(' '));

// The model page's inputs (section 11.1) as figures.
const GOLDEN = {
  price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60,
  'yours.blocks': 1740, 'yours.yieldG': 250.015, 'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14,
  'yours.turn': 16, 'yours.kwhBlock': 506 / (1740 * 30.4 / 42), 'yours.labourMin': 2.52, 'yours.transport': 0, 'yours.rent': 0,
  'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
  ...Object.fromEntries(['highland', 'warm'].flatMap((w) => [
    [`${w}.yieldG`, w === 'warm' ? 124 : 250.015], [`${w}.flushes`, 2], [`${w}.loss`, 10], [`${w}.first`, 12], [`${w}.interval`, 14],
    [`${w}.turn`, 16], [`${w}.labourMin`, 2.52], [`${w}.transport`, w === 'highland' ? 2 : 0], [`${w}.rent`, 0], [`${w}.kwhHouse`, 146],
    [`${w}.house`, 5000], [`${w}.humidifier`, 1500], [`${w}.fans`, w === 'highland' ? 1800 : 3300],
  ])),
  'highland.uphill': 0, 'import.landed': 41.1047, 'import.buyHours': 2, 'import.rent': 0,
};

test('golden: the headline at the model page\'s inputs in Container 1', () => {
  const h = headline(compare(GOLDEN, WAYS.lionsmane), { room: 'Container 1', crop: 'lionsmane', life: 60 });
  assert.equal(text(h), "Lion's mane in Container 1: RM 3,003.16 a month, break-even RM 38.23 a kg, pays back in 13 months. A highland grower makes RM 3,152.92 on a quarter of the equipment.");
});

test('11.2: the headline of every crop at the research defaults in a 40 ft container', () => {
  const room = { volume: 67.4, humidifierLH: 2 };
  const want = {
    // Money truth: Your container's labour the farm's one worker (RM 1,954.15 a month, all in its one room)
    oyster: 'Grey oyster in Container 1: −RM 3,016.63 a month loss, break-even RM 28.70 a kg, never pays back. A lowland shed loses less, −RM 814.18, on a tenth of the equipment.',
    pink: 'Pink oyster in Container 1: −RM 1,849.73 a month loss, break-even RM 26.00 a kg, never pays back. A lowland shed loses less, −RM 757.61, on a tenth of the equipment.',
    woodear: 'Black jelly (wood ear) in Container 1: −RM 1,456.25 a month loss, break-even RM 37.09 a kg, never pays back. Importing and reselling makes RM 641.32 with no equipment.',
    lionsmane: "Lion's mane in Container 1: RM 680.07 a month, break-even RM 46.87 a kg, pays back in 41 months. A highland grower makes RM 2,649.57 on a fifth of the equipment.",
  };
  for (const crop of ECONOMICS_CROPS) {
    const values = Object.fromEntries(figuresFor(crop).map((f) => [f.key, f.key === 'tariff' ? 0.55 : researchOf(f.key, crop, room, 1482).value]));
    values['yours.blocks'] = 1482;
    assert.equal(text(headline(compare(values, WAYS[crop]), { room: 'Container 1', crop, life: 60 })), want[crop], crop);
  }
});

// A result as the model gives it, with only what the words read.
const r = (way, profit, { equipment = 10_000, kg = 100, be = 30, paybackAll = 12, kind = 'grow' } = {}) => ({ way, kind, profit, equipment, kgSold: kg, be, paybackAll, payback: paybackAll });

test('the headline\'s first sentence: a profit that pays back, one that doesn\'t within the write-off, a loss (its figure in the loss tone), nothing sold', () => {
  const at = (yours) => headline([yours], { room: 'Container 1', crop: 'lionsmane', life: 60 });
  assert.equal(text(at(r('yours', 120, { be: 49.1, paybackAll: Infinity }))), "Lion's mane in Container 1: RM 120.00 a month, break-even RM 49.10 a kg, but it doesn't pay back within the 60 months the equipment is written off over.");
  assert.equal(at(r('yours', 120)).second, null, 'one way shown: no second sentence');
  const loss = headline([r('yours', -1400.38, { be: 18.68, paybackAll: Infinity })], { room: 'Container 1', crop: 'oyster', life: 60 });
  assert.deepEqual(plain(loss.first), ['Grey oyster in Container 1: ', { text: '−RM 1,400.38', tone: 'loss' }, ' a month loss, break-even RM 18.68 a kg, never pays back.']);
  assert.equal(loss.first[1].text, `−RM${NB}1,400.38`, 'RM keeps its figure at a wrap');
  const none = headline([r('yours', -2083, { kg: 0, be: null, paybackAll: Infinity })], { room: 'Container 1', crop: 'oyster', life: 60 });
  assert.equal(text(none), 'Grey oyster in Container 1 sells nothing at these figures: −RM 2,083.00 a month loss.');
  assert.deepEqual(plain(none.first[1]), { text: '−RM 2,083.00', tone: 'loss' });
});

test('the headline\'s second sentence: the best other way (ties in column order) makes more, loses less, yours the most, all lose more', () => {
  const second = (results) => plain(headline(results, { room: 'Container 1', crop: 'lionsmane', life: 60 }).second);
  assert.equal(second([r('yours', 100), r('highland', 300, { equipment: 2306 }), r('warm', 300, { equipment: 9999 })]), 'A highland grower makes RM 300.00 on a quarter of the equipment.');
  assert.equal(second([r('yours', -1400), r('shed', -814.18, { equipment: 1280 })]), 'A lowland shed loses less, −RM 814.18, on a tenth of the equipment.');
  assert.equal(second([r('yours', 3000), r('highland', 2000), r('import', -5, { kind: 'trade', equipment: 0 }), r('warm', -9)]), 'That is the most of the 4 ways; next, a highland grower makes RM 2,000.00.');
  assert.equal(second([r('yours', 3000), r('highland', -1), r('warm', -9)]), 'Every other way loses money at these figures.');
  assert.equal(second([r('yours', -100), r('shed', -900)]), 'Every other way loses more.');
});

test('the equipment words: none, yours none, the nearest fraction, about the same, twice, times', () => {
  const words = (other, yours = 10_000, kind = 'grow') => headline([r('yours', 1, { equipment: yours }), r('highland', 9, { equipment: other, kind })],
    { room: 'R', crop: 'lionsmane', life: 60 }).second.replace(/^A highland grower makes RM.\S+ /, '').replaceAll(NB, ' ');
  assert.equal(words(0, 10_000, 'trade'), 'with no equipment.');
  assert.equal(words(6800, 0), 'on RM 6,800.00 of equipment.');
  assert.equal(words(1280), 'on a tenth of the equipment.');
  assert.equal(words(2306), 'on a quarter of the equipment.');
  assert.equal(words(3400), 'on a third of the equipment.');
  assert.equal(words(5200), 'on half of the equipment.');
  assert.equal(words(7000), 'on two thirds of the equipment.');
  assert.equal(words(8000), 'on three quarters of the equipment.');
  assert.equal(words(9000), 'on about the same equipment.');
  assert.equal(words(11_500), 'on about the same equipment.');
  assert.equal(words(15_000), 'on 1.5 times the equipment.');
  assert.equal(words(20_400), 'on twice the equipment.');
});

const inputs = { blocks: 1740, yieldG: 250, flushes: 2, loss: 10, first: 12, interval: 14, turn: 16, shrink: 10, price: 50, blockPrice: 6, uphill: 0,
  kwhMonth: 506, tariff: 0.551, fixedTnb: 20, labourMin: 2.52, wage: 10, pack: 3, transport: 0, rent: 0, equipment: 35990, lifeMonths: 60 };

test('the rows at the golden inputs: the cold room and import, a loss with "Loss" under it, never, no equipment', () => {
  const [cold, , imp, warm] = compare(GOLDEN, WAYS.lionsmane);
  const table = rows([cold, imp, warm]);
  const at = (key) => table.find((x) => x.key === key);
  assert.deepEqual(table.map((x) => x.label), ['Blocks a month', 'kg sold a month', 'Income', 'Blocks, or mushrooms bought', 'Electricity', 'Labour',
    'Packing and delivery', 'Transport', 'Rent', 'Equipment written off', 'Costs', 'Profit a month', 'Break-even', 'Equipment',
    'Payback (equipment)', 'Payback (incl. first batch)']);
  const cells = (key) => plain(at(key).cells.map((c) => c.text));
  assert.deepEqual(cells('blocks'), ['1,259', '283.4 kg bought', '1,259']);
  assert.deepEqual(cells('kg'), ['255.0 kg', '255.0 kg', '126.5 kg']);
  assert.deepEqual(cells('income'), ['RM 12,752.48', 'RM 12,752.48', 'RM 6,324.85']);
  assert.deepEqual(cells('bought'), ['RM 7,556.57', 'RM 11,648.60', 'RM 7,556.57']);
  assert.deepEqual(cells('electricity'), ['RM 298.81', 'RM 0.00', 'RM 100.45']);
  assert.deepEqual(cells('labour'), ['RM 528.96', 'RM 608.00', 'RM 528.96']);
  assert.deepEqual(cells('writeOff'), ['RM 599.83', 'RM 0.00', 'RM 163.33']);
  assert.deepEqual(cells('costs'), ['RM 9,749.32', 'RM 13,021.75', 'RM 8,728.80']);
  assert.deepEqual(plain(at('profit').cells), [{ text: 'RM 3,003.16' }, { text: '−RM 269.27', tone: 'loss', sub: 'Loss' }, { text: '−RM 2,403.95', tone: 'loss', sub: 'Loss' }]);
  assert.deepEqual(cells('be'), ['RM 38.23 a kg', 'RM 51.06 a kg', 'RM 69.00 a kg']);
  assert.deepEqual(cells('equipment'), ['RM 35,990.00', 'None', 'RM 9,800.00']);
  assert.deepEqual(cells('payback'), ['10 months', 'No equipment', 'Never'], 'a cell starts with a capital, as No equipment');
  assert.deepEqual(cells('paybackAll'), ['13 months', 'No equipment', 'Never']);
  assert.equal(rows([grow({ ...inputs, yieldG: 0 })])[12].cells[0].text, '—', 'nothing sold: no break-even');
});

test('the months: under 1, 1, one decimal under 9.95, whole above, never', () => {
  assert.deepEqual(plain([0.5, 1, 6.16, 9.94, 9.99, 13.37, 61.2, Infinity, NaN].map(monthsText)),
    ['under 1 month', '1 month', '6.2 months', '9.9 months', '10 months', '13 months', '61 months', 'never', '—']);
});

test('a figure with its unit, and a research range', () => {
  assert.deepEqual(plain([
    figureText('yours.yieldG', 250.015), figureText('yours.kwhBlock', 0.4), figureText('shrink', 10), figureText('yours.first', 42),
    figureText('yours.first', 1), figureText('yours.labourMin', 2.52), figureText('import.buyHours', 2), figureText('import.buyHours', 1),
    figureText('price', 55), figureText('blockPrice', 6), figureText('yours.rent', 300), figureText('wage', 10), figureText('yours.container', 38100),
    figureText('tariff', 0.5515), figureText('yours.blocks', 1740), figureText('life', 60), figureText('yours.flushes', 2), figureText('yours.flushes', 1),
    figureText('shed.kwhHouse', 60), figureText('price', null),
  ]), [
    '250 g', '0.40 kWh', '10 %', '42 days', '1 day', '2.52 min', '2 hours a day', '1 hour a day', 'RM 55.00 a kg', 'RM 6.00 a block',
    'RM 300.00 a month', 'RM 10.00 an hour', 'RM 38,100.00', 'RM 0.5515 a kWh', '1,740 blocks', '60 months', '2 flushes', '1 flush',
    '60 kWh a month', '—',
  ]);
  assert.equal(plain(rangeText('yours.yieldG', 150, 400)), '150–400 g');
  assert.equal(plain(rangeText('price', 8, 13)), 'RM 8.00–13.00 a kg');
});

test('the way names, and the lines under the table', () => {
  assert.deepEqual(['yours', 'shed', 'highland', 'import', 'warm'].map((w) => wayName(w)), ['Your container', 'Lowland shed', 'Highland grower', 'Import and resell', 'Warm strain']);
  assert.equal(wayName('warm', { sentence: true }), 'A warm strain in a lowland shed');
  assert.equal(wayName('import', { sentence: true, lower: true }), 'importing and reselling');
  const [cold, , , warm] = compare(GOLDEN, WAYS.lionsmane);
  assert.equal(plain(fillLine(cold, { room: 'Container 1', blocks: 1740, first: 12 })), "First batch: Container 1's equipment, its first 1,740 blocks (RM 10,440.00) and the costs until the first harvest, 12 days in (RM 326.75).");
  assert.equal(plain(sizedLine('Container 1', 1740)), "Every way is sized to Container 1's 1,740 blocks; a shed or a highland house holds up to 2,000.");
  assert.equal(plain(neverLine([cold, warm], 60)), 'Never: not within the 60 months the equipment is written off over.');
  assert.equal(neverLine([cold], 60), null);
  assert.match(plain(leftLine('oyster')), /^Not compared: a highland grower \(grey oyster isn't grown commercially there/);
  assert.equal(plain(leftLine('woodear')), 'Not compared: a highland grower (growth slows sharply below 18 °C).');
  assert.equal(plain(leftLine('lionsmane')), "Not compared: a lowland shed with the usual strain (it fruits at 18–24 °C); the warm strain is the lowland shed for lion's mane.");
});

test('the spec review: RM through Costs\' formatters, RM 0.00 is not a loss, nothing sold follows the profit\'s sign, no-break spaces', () => {
  // The One Format Rule: a cheap price per kg as Costs shows it, a negative RM figure with its minus.
  assert.equal(figureText('price', 0.035), `RM${NB}0.035${NB}a${NB}kg`);
  assert.equal(figureText('yours.rent', -5), `\u2212RM${NB}5.00${NB}a${NB}month`);
  assert.equal(plain(rangeText('price', 0.035, 0.05)), 'RM 0.035–0.05 a kg');
  // RM 0.00 in the second sentence.
  const second = (results) => plain(headline(results, { room: 'Container 1', crop: 'lionsmane', life: 60 }).second);
  assert.equal(second([r('yours', 100), r('highland', 0, { equipment: 2306 })]), 'That is the most of the 2 ways; next, a highland grower breaks even.');
  assert.equal(second([r('yours', 0), r('highland', -50)]), 'Every other way loses money at these figures.');
  assert.equal(second([r('yours', 0), r('highland', 0.004)]), 'That is the most of the 2 ways; next, a highland grower breaks even.');
  assert.equal(second([r('yours', -100), r('highland', 0.003, { equipment: 2306 })]), 'A highland grower breaks even on a quarter of the equipment.');
  assert.equal(second([r('yours', -100), r('shed', -0.004, { equipment: 1280 })]), 'A lowland shed breaks even on a tenth of the equipment.');
  // Nothing sold at a zero profit is no loss; the first sentence has no loss tone.
  const none = headline([r('yours', 0, { kg: 0, be: null })], { room: 'Container 1', crop: 'oyster', life: 60 });
  assert.equal(text(none), 'Grey oyster in Container 1 sells nothing at these figures: RM 0.00 a month.');
  assert.ok(none.first.every((p) => typeof p === 'string'));
  // No-break spaces in "60 months".
  const pays = headline([r('yours', 120, { paybackAll: Infinity })], { room: 'R', crop: 'lionsmane', life: 60 }).first[0];
  assert.ok(pays.includes(`60${NB}months`));
  assert.ok(neverLine([r('yours', 1, { paybackAll: Infinity })], 60).includes(`60${NB}months`));
  assert.ok(leftLine('oyster').includes(`25${NB}\u00b0C`) && leftLine('oyster').includes(`3\u2060\u2013\u20604${NB}days`) && leftLine('woodear').includes(`18${NB}\u00b0C`));
});

test('the code review: a loss is decided as moneyText decides its sign (half a sen rounds away from zero)', () => {
  const h = headline([r('yours', -0.005)], { room: 'Container 1', crop: 'lionsmane', life: 60 });
  assert.equal(h.first[1].tone, 'loss');
  assert.match(text(h), /−RM 0\.01 a month loss/);
  assert.deepEqual(plain(rows([{ ...r('yours', -0.005), cost: {} }]).find((x) => x.key === 'profit').cells[0]), { text: '−RM 0.01', tone: 'loss', sub: 'Loss' });
  assert.equal(rangeText('price', NaN, 13), '—');
  assert.equal(plain(fillLine({ fill: 100, rampCost: 5 }, { room: 'R', blocks: 10, first: 1 })).includes('1 day in'), true);
});

test('the audit: break-even never breaks at its hyphen; a sentence keeps "never pays back"', () => {
  const r = (way, profit, more = {}) => ({ way, kind: 'grow', profit, be: 18.68, payback: Infinity, paybackAll: Infinity, kgSold: 100, equipment: 1000, ...more });
  const h = headline([r('yours', -1400.38)], { room: 'Container 1', crop: 'oyster', life: 60 });
  const words = h.first.map((p) => (typeof p === 'string' ? p : p.text)).join('');
  assert.ok(words.includes('break\u2011even'), 'a non-breaking hyphen');
  assert.ok(words.includes('never pays back'));
});

// ---- Money truth (spec 2026-11-12-money-truth-design.md 9 and 10) ----
test('the labour line: the room\'s share of the workers and its hours, over them in the warning tone; Your way by the room type', () => {
  const plain = (s) => s?.replace(/[  ⁠]/g, ' ');
  const yours = { labourHours: { needed: 52.94, there: 83.2, share: 0.4, workers: 1, each: 1954.15 } };
  assert.deepEqual(plain(labourLine(yours, 'Container 1').text), 'Labour: Container 1’s share (40 %, by blocks) of 1 worker at RM 1,954.15 a month. Handling its blocks takes 52.9 h a month of the 83.2 h that share gives.');
  const over = labourLine({ labourHours: { ...yours.labourHours, needed: 120 } }, 'Container 1');
  assert.deepEqual([plain(over.text).endsWith('takes 120.0 h a month, more than the 83.2 h that share gives.'), over.tone], [true, 'warn']);
  assert.equal(labourLine({ labourHours: null }, 'Container 1'), null);
  assert.deepEqual([wayName('yours'), wayName('yours', { type: 'built' }), wayName('yours', { type: 'shed' }), wayName('shed', { type: 'built' })],
    ['Your container', 'Your room', 'Your shed', 'Lowland shed']);
  assert.equal(plain(figureText('yours.workers', 1.5)), '1.5 workers');
});

// ---- Economics stage 2 (spec 2026-11-12-economics-stage-2-design.md 4.1) ----
const LIONS = ['yours', 'highland', 'import', 'warm'];
const tileWords = (t) => plain({ label: t.label, way: t.way ?? null, figure: t.figure, tone: t.tone ?? null, caption: t.caption, captionTone: t.captionTone ?? null });
const sticky = (parts) => plain(parts.map((p) => (typeof p === 'string' ? p : `[${p.text}]`)).join(''));

test('the tiles at the golden inputs: a profit at RM 50.00, a loss at RM 36.00', () => {
  const at = (price) => tilesOf(compare({ ...GOLDEN, price }, LIONS), { room: 'Container 1', crop: 'lionsmane', price, life: 60 }).map(tileWords);
  assert.deepEqual(at(50), [
    { label: 'Profit a month', way: null, figure: 'RM 3,003.16', tone: null, caption: "Profit · Container 1, Lion's mane", captionTone: null },
    { label: 'Break-even', way: null, figure: 'RM 38.23 a kg', tone: null, caption: 'You sell at RM 50.00, RM 11.77 over it.', captionTone: null },
    { label: 'Payback', way: null, figure: '13 months', tone: null, caption: 'With the first batch · equipment RM 35,990.00', captionTone: null },
    { label: 'Best other way', way: 'Highland grower', figure: 'RM 3,152.92', tone: null, caption: 'RM 149.76 a month more than yours', captionTone: null },
  ]);
  assert.deepEqual(at(36), [
    { label: 'Profit a month', way: null, figure: '−RM 567.53', tone: 'loss', caption: "Loss · Container 1, Lion's mane", captionTone: null },
    { label: 'Break-even', way: null, figure: 'RM 38.23 a kg', tone: null, caption: 'You sell at RM 36.00, RM 2.23 short.', captionTone: 'loss' },
    { label: 'Payback', way: null, figure: 'Never', tone: 'loss', caption: 'Not within the 60 months it is written off over', captionTone: null },
    { label: 'Best other way', way: 'Highland grower', figure: '−RM 417.77', tone: 'loss', caption: 'RM 149.76 a month more than yours', captionTone: null },
  ]);
  assert.equal(tilesOf(compare(GOLDEN, LIONS), { room: 'Container 1', crop: 'lionsmane', price: 50, life: 60 })[3].wayKey, 'highland');
});

test('the tiles\' other cases: nothing sold, just at break-even, the best other way less or the same, your room by its type', () => {
  const nothing = tilesOf(compare({ ...GOLDEN, 'yours.yieldG': 0 }, LIONS), { room: 'Container 1', crop: 'lionsmane', price: 50, life: 60 }).map(tileWords);
  assert.deepEqual([nothing[1].figure, nothing[1].caption, nothing[2].figure], ['—', 'Nothing sells at these figures.', 'Never']);
  const be = compare(GOLDEN, ['yours'])[0].be;
  const just = tilesOf(compare({ ...GOLDEN, price: Math.round(be * 100) / 100 }, LIONS), { room: 'Container 1', crop: 'lionsmane', price: Math.round(be * 100) / 100, life: 60 });
  assert.match(plain(just[1].caption), /^You sell at RM 38\.23, just at it\.$/);
  const yoursBest = compare({ ...GOLDEN, 'highland.transport': 20 }, LIONS);
  const t = tilesOf(yoursBest, { room: 'Container 1', crop: 'lionsmane', price: 50, life: 60 });
  assert.match(plain(t[3].caption), / a month less than yours$/);
  const same = [{ ...yoursBest[0] }, { ...yoursBest[0], way: 'highland' }];
  assert.equal(tilesOf(same, { room: 'Container 1', crop: 'lionsmane', price: 50, life: 60 })[3].caption, 'The same as yours');
  assert.equal(plain(tilesOf(compare(GOLDEN, LIONS), { room: 'Room A', crop: 'lionsmane', price: 50, life: 60, type: 'built' })[0].caption), "Profit · Room A, Lion's mane");
  const under = tilesOf(compare({ ...GOLDEN, 'yours.container': 0, 'yours.cooling': 0, 'yours.humidifier': 0, 'yours.fans': 0, 'yours.racks': 0, 'yours.first': 1, blockPrice: 0.5 }, LIONS), { room: 'Container 1', crop: 'lionsmane', price: 50, life: 60 });
  assert.equal(plain(under[2].figure), 'Under 1 month');
});

test('the sticky line: a profit, a loss (its figure in the critical text), nothing sold', () => {
  const at = (v) => stickyText(compare(v, ['yours'])[0]);
  assert.equal(sticky(at(GOLDEN)), 'Profit RM 3,003.16 a month · Break-even RM 38.23 a kg');
  assert.equal(sticky(at({ ...GOLDEN, price: 36 })), 'Loss [−RM 567.53] a month · Break-even RM 38.23 a kg');
  assert.equal(at({ ...GOLDEN, price: 36 })[1].tone, 'loss');
  assert.match(sticky(at({ ...GOLDEN, 'yours.yieldG': 0 })), /^Nothing sells · \[−RM [\d,]+\.\d\d\] a month$/);
});

// ---- Economics stage 2 (spec 4.2): profit per way as diverging bars ----
test('the bars at the golden inputs: five rows in the fixed order, the shed not compared, zero at 43.26 % of the track', () => {
  const b = barsOf(compare(GOLDEN, LIONS), [{ way: 'shed', reason: 'warm-strain' }], 'lionsmane');
  assert.equal(Math.round(b.zero * 10000) / 100, 43.26);
  assert.deepEqual(b.rows.map((r) => [r.way, r.compared, r.kind]), [
    ['yours', true, 'profit'], ['shed', false, null], ['highland', true, 'profit'], ['import', true, 'loss'], ['warm', true, 'loss'],
  ]);
  const by = Object.fromEntries(b.rows.map((r) => [r.way, r]));
  assert.deepEqual(plain([by.yours.name, by.yours.text, by.yours.words]), ['Your container', 'RM 3,003.16', 'Your container, RM 3,003.16 a month profit']);
  assert.equal(by.yours.yours, true);
  assert.equal(Math.round((by.highland.start + by.highland.length) * 1e6), 1e6, 'the biggest profit reaches the right edge');
  assert.equal(Math.round(by.warm.start * 1e6), 0, 'the biggest loss reaches the left edge');
  assert.equal(Math.round((by.import.start + by.import.length) * 1e4), Math.round(b.zero * 1e4), 'a loss ends at zero');
  assert.deepEqual(plain([by.warm.text, by.warm.tone, by.warm.words]), ['−RM 2,403.95', 'loss', 'Warm strain, −RM 2,403.95 a month loss']);
  assert.deepEqual(plain([by.shed.reason, by.shed.words]), ['Not compared: the warm strain is its lowland shed', 'Lowland shed: not compared, the warm strain is its lowland shed']);
});

test('the bars: grey oyster\'s four rows; all profits, all losses; a way at RM 0.00 breaks even; your way by its type; the short reasons', () => {
  const oyster = barsOf(compare(GOLDEN, ['yours', 'shed']), [{ way: 'highland', reason: 'too-cool' }, { way: 'import', reason: 'not-imported' }], 'oyster');
  assert.deepEqual(oyster.rows.map((r) => r.way), ['yours', 'shed', 'highland', 'import']);
  const fake = (profits) => profits.map(([way, profit]) => ({ way, profit, kind: 'grow' }));
  assert.equal(barsOf(fake([['yours', 100], ['shed', 50]]), [], 'oyster').zero, 0);
  assert.equal(barsOf(fake([['yours', -100], ['shed', -50]]), [], 'oyster').zero, 1);
  const even = barsOf(fake([['yours', 100], ['shed', 0.004]]), [], 'oyster').rows[1];
  assert.deepEqual([even.kind, even.length, plain(even.words)], ['even', 0, 'Lowland shed breaks even']);
  assert.equal(barsOf(fake([['yours', 1]]), [], 'oyster', 'built').rows[0].name, 'Your room');
  assert.deepEqual(Object.keys(SHORT_LEFT).sort(), ['lionsmane', 'oyster', 'pink', 'woodear']);
  assert.equal(plain(SHORT_LEFT.oyster.highland), 'it fruits best at 25 °C');
  assert.equal(plain(SHORT_LEFT.pink.import), 'it keeps 1–4 days; none is imported');
});

// ---- Economics stage 2 (spec 4.4): the phone's pair ----
test('Compare with: the other ways, the best first; the phone table\'s caption', () => {
  assert.deepEqual(compareChoices(compare(GOLDEN, LIONS)).map((c) => [c.way, c.name]),
    [['highland', 'Highland grower'], ['import', 'Import and resell'], ['warm', 'Warm strain']]);
  assert.deepEqual(compareChoices(compare(GOLDEN, ['yours'])), []);
  assert.equal(phoneCaption('yours', 'highland'), 'A month: Your container and Highland grower');
  assert.equal(phoneCaption('yours', 'shed', 'shed'), 'A month: Your shed and Lowland shed');
});

test('capped at what you can sell (the owner, 2026-11-12): the profit tile leads with the capped month, the uncapped one its caption; kg sold of kg grown', () => {
  const cap = (50 * 30.4) / 7;
  const capped = compare(GOLDEN, LIONS, { sellCap: cap });
  const free = compare(GOLDEN, LIONS)[0];
  const [profit] = tilesOf(capped, { room: 'Container 1', crop: 'lionsmane', price: 50, life: 60, uncapped: free }).map(tileWords);
  assert.deepEqual([profit.figure, profit.caption], ['RM 1,221.54', 'Profit at what you can sell · RM 3,003.16 if all 255.0 kg sold']);
  const kg = rows(capped).find((r) => r.key === 'kg');
  assert.deepEqual(plain([kg.cells[0].text, kg.cells[0].sub]), ['217.1 kg', 'of 255.0 kg grown']);
  assert.equal(rows(compare(GOLDEN, LIONS)).find((r) => r.key === 'kg').cells[0].sub, undefined);
});

test('the reader\'s sentence says the cap after the headline when the month is capped, in words, not the tile\'s middot (the review)', () => {
  const opts = { room: 'Container 1', crop: 'lionsmane', life: 60 };
  const capped = compare(GOLDEN, LIONS, { sellCap: (50 * 30.4) / 7 });
  const uncapped = compare(GOLDEN, LIONS)[0];
  const h = headline(capped, opts);
  const said = plain(readerSentence(h, capped, { uncapped, kgWeek: 50 }));
  assert.ok(said.endsWith(' At what you can sell (50.0 kg a week); RM 3,003.16 a month if all 255.0 kg sold.'), said);
  assert.ok(!said.includes('·'));
  const free = compare(GOLDEN, LIONS);
  const hf = headline(free, opts);
  assert.equal(readerSentence(hf, free, { uncapped: null, kgWeek: null }), [hf.first.map((x) => (typeof x === 'string' ? x : x.text)).join(''), hf.second].filter(Boolean).join(' '), 'not capped: the headline alone');
  assert.equal(readerSentence(hf, free, { uncapped: free[0], kgWeek: 500 }), readerSentence(hf, free, {}), 'a limit over what it grows: no extra words');
});

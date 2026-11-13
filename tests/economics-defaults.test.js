// The Economics figures and defaults (web/economics-defaults.js, spec 2026-11-06-economics-design.md 4 and 11.2): every
// crop and shown way worked at the research defaults in a 40 ft container, the figures' ranges and words, the room-size rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECONOMICS_CROPS, WAYS, LEFT, FIGURES, figureOf, figuresFor, placeOf, checkFigure, researchOf, sizeOf, SOURCES, unitParts,
} from '../web/economics-defaults.js';
import { compare, inputsOf } from '../web/economics-model.js';

const ROOM = { volume: 67.4, humidifierLH: 2 }; // a 40 ft container (section 11.2)
const r2 = (v) => Math.round(v * 100) / 100;

// Every figure of the crop at its research default, the electricity price Settings' default 0.55.
function researchValues(crop, room = ROOM) {
  const blocks = researchOf('yours.blocks', crop, room, null).value;
  return Object.fromEntries(figuresFor(crop).map((f) => [f.key, f.key === 'tariff' ? 0.55 : researchOf(f.key, crop, room, blocks).value]));
}

// [way, kg sold, income, costs, profit, break-even, equipment, payback, payback with the first fill] (null: never). Your
// container's labour is the farm's one worker at RM 1,954.15 a month, all of it in its one room (Money truth 9).
const TABLE = {
  oyster: [
    ['yours', 161.29, 1612.85, 4629.48, -3016.63, 28.70, 52977.40, null, null], // Money truth: labour one worker's RM 1,954.15
    ['shed', 72.76, 727.60, 1541.78, -814.18, 21.19, 6800, null, null],
  ],
  pink: [
    ['yours', 308.16, 6163.22, 8012.95, -1849.73, 26.00, 52977.40, null, null],
    ['shed', 121.64, 2432.85, 3190.46, -757.61, 26.23, 6800, null, null],
  ],
  woodear: [
    ['yours', 120.47, 3011.81, 4468.05, -1456.25, 37.09, 52977.40, null, null],
    ['shed', 76.23, 1905.73, 1890.74, 15.00, 24.80, 6800, 52.99, null],
    ['import', 120.47, 3011.81, 2370.48, 641.32, 19.68, 0, 'none', 'none'],
  ],
  lionsmane: [
    ['yours', 217.22, 10860.94, 10180.87, 680.07, 46.87, 52977.40, 33.89, 40.54],
    ['highland', 217.22, 10860.94, 8211.37, 2649.57, 37.80, 8300, 2.98, 6.64],
    ['import', 217.22, 10860.94, 11121.39, -260.45, 51.20, 0, 'none', 'none'],
    ['warm', 107.74, 5387.03, 7473.50, -2086.47, 69.37, 9800, null, null],
  ],
};
const months = (v) => (v === null ? 'none' : Number.isFinite(v) ? r2(v) : null);

for (const crop of ECONOMICS_CROPS) {
  test(`11.2: ${crop} at the research defaults in a 40 ft container`, () => {
    const out = compare(researchValues(crop), WAYS[crop]);
    assert.deepEqual(out.map((o) => o.way), TABLE[crop].map((row) => row[0]));
    out.forEach((o, i) => {
      const [, kg, income, costs, profit, be, equipment, payback, all] = TABLE[crop][i];
      assert.deepEqual(
        [r2(o.kgSold), r2(o.income), r2(o.costs), r2(o.profit), r2(o.be), r2(o.equipment), months(o.payback), months(o.paybackAll)],
        [kg, income, costs, profit, be, equipment, payback, all], `${crop} ${o.way}`,
      );
    });
  });
}

test('11.2: import buys 128.16 kg of black jelly and 241.35 kg of lion\'s mane a month', () => {
  assert.equal(r2(compare(researchValues('woodear'), WAYS.woodear)[2].kgBought), 128.16);
  assert.equal(r2(compare(researchValues('lionsmane'), WAYS.lionsmane)[2].kgBought), 241.35);
});

test('every figure of every crop\'s shown ways has a default inside its own range and the figure\'s limits, a confidence and known sources', () => {
  for (const crop of ECONOMICS_CROPS) {
    for (const f of figuresFor(crop)) {
      const d = researchOf(f.key, crop, ROOM, 1482);
      assert.ok(d, `${crop} ${f.key} has a default`);
      assert.ok(d.low <= d.value && d.value <= d.high, `${crop} ${f.key}: ${d.low} ≤ ${d.value} ≤ ${d.high}`);
      assert.ok(d.value >= f.min && d.value <= f.max, `${crop} ${f.key} inside ${f.min}–${f.max}`);
      assert.ok(['high', 'medium', 'low'].includes(d.confidence), `${crop} ${f.key} confidence`);
      for (const s of d.sources) assert.ok(SOURCES[s], `${crop} ${f.key}: source ${s} is known`);
      if (!f.settings) assert.equal(checkFigure(f.key, d.value), null, `${crop} ${f.key} passes its own check`);
    }
  }
});

test('the figures: the shared ones, Your container\'s, then each shown way\'s; scopes saved as room 0 and crop \'\' for every', () => {
  assert.deepEqual([...new Set(figuresFor('lionsmane').map((f) => f.way))], ['shared', 'yours', 'highland', 'warm', 'import']);
  assert.deepEqual([...new Set(figuresFor('oyster').map((f) => f.way))], ['shared', 'yours', 'shed']);
  assert.ok(figuresFor('lionsmane').some((f) => f.key === 'highland.uphill'));
  assert.ok(!figuresFor('lionsmane').some((f) => f.key === 'warm.uphill'));
  assert.equal(FIGURES.length, new Set(FIGURES.map((f) => f.key)).size, 'keys are unique');
  assert.deepEqual(placeOf('price', 3, 'pink'), { roomId: 0, crop: 'pink' });
  assert.deepEqual(placeOf('wage', 3, 'pink'), { roomId: 0, crop: '' });
  assert.deepEqual(placeOf('yours.rent', 3, 'pink'), { roomId: 3, crop: '' });
  assert.deepEqual(placeOf('yours.yieldG', 3, 'pink'), { roomId: 3, crop: 'pink' });
  assert.deepEqual(placeOf('shed.yieldG', 3, 'pink'), { roomId: 0, crop: 'pink' });
  assert.deepEqual(LEFT.lionsmane, [{ way: 'shed', reason: 'warm-strain' }]);
});

test('checkFigure: a number in range passes; out of range, not a number or not whole is refused in the Settings rule\'s words', () => {
  assert.equal(checkFigure('price', 55), null);
  assert.equal(checkFigure('price', 1001), 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg');
  assert.equal(checkFigure('price', '55'), 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg');
  assert.equal(checkFigure('yours.blocks', 1.5), 'Blocks in the room must be a whole number from 1 to 100,000\u00a0blocks');
  assert.equal(checkFigure('yours.flushes', 0), 'Flushes per block must be a whole number from 1 to 10');
  assert.equal(checkFigure('yours.loss', 100), 'Blocks lost must be a number from 0 to 90\u00a0%');
  assert.equal(checkFigure('yours.loss', 90), null);
  assert.equal(checkFigure('tariff', 0.6), 'Electricity price is set in Settings');
  assert.equal(checkFigure('nope', 1), 'Unknown figure');
  assert.equal(figureOf('nope'), null);
});

test('the room-size rules: a 20 ft up to 40 m³, a 40 ft above; humidifiers per 6 L/h; racks per block; blocks from the volume', () => {
  const small = { volume: 40, humidifierLH: 7 };
  assert.deepEqual([sizeOf(small), sizeOf(ROOM)], ['20 ft', '40 ft']);
  assert.deepEqual([researchOf('yours.container', 'oyster', small, 1).value, researchOf('yours.container', 'oyster', ROOM, 1).value], [24550, 38100]);
  assert.deepEqual([researchOf('yours.cooling', 'oyster', small, 1).value, researchOf('yours.cooling', 'oyster', ROOM, 1).value], [4520, 9040]);
  assert.equal(researchOf('yours.humidifier', 'oyster', small, 1).value, 3000, '7 L/h: two humidifiers');
  assert.equal(researchOf('yours.humidifier', 'oyster', { volume: 30, humidifierLH: 0 }, 1).value, 1500, 'at least one');
  assert.equal(researchOf('yours.racks', 'oyster', ROOM, 1482).value, 1037.4);
  assert.equal(researchOf('yours.blocks', 'oyster', ROOM, null).value, 1482);
  assert.equal(researchOf('yours.blocks', 'oyster', small, null).value, 880);
  assert.equal(researchOf('import.landed', 'oyster', ROOM, 1), null, 'grey oyster is not imported');
});

test('every way of every crop gets finite inputs from the research defaults (a missing shed.* or warm.* key would show as "sells nothing")', () => {
  for (const crop of ECONOMICS_CROPS) {
    const values = researchValues(crop, { volume: 32.6 });
    for (const way of WAYS[crop]) {
      for (const [k, v] of Object.entries(inputsOf(values, way))) assert.ok(typeof v === 'number' && Number.isFinite(v), `${crop} ${way}: ${k} is ${v}`);
    }
  }
});

test('researchOf: racks fall back to the room\'s own blocks; blocks are capped at the figure\'s limit; copies; null for a way the crop does not show', () => {
  assert.equal(researchOf('yours.racks', 'oyster', ROOM, undefined).value, 1037.4);
  assert.equal(researchOf('yours.racks', 'oyster', ROOM, NaN).value, 1037.4);
  const huge = researchOf('yours.blocks', 'oyster', { volume: 5000, humidifierLH: 2 }, null);
  assert.deepEqual([huge.value, huge.low <= huge.value, huge.high], [100000, true, 100000]);
  assert.equal(checkFigure('yours.blocks', huge.value), null);
  const first = researchOf('price', 'oyster', ROOM, 1);
  first.value = -1;
  first.sources.push('X99');
  const again = researchOf('price', 'oyster', ROOM, 1);
  assert.deepEqual([again.value, again.sources.includes('X99')], [10, false]);
  assert.equal(researchOf('import.rent', 'oyster', ROOM, 1), null);
  assert.equal(researchOf('highland.flushes', 'oyster', ROOM, 1), null);
});

test('checkFigure: the edges of a range, and what is not a finite number', () => {
  const priceError = 'Selling price must be a number from RM\u00a00 to RM\u00a01,000\u00a0a\u00a0kg';
  for (const v of [NaN, null, undefined, Infinity, -Infinity]) assert.equal(checkFigure('price', v), priceError, String(v));
  assert.equal(checkFigure('price', -0.01), priceError);
  assert.equal(checkFigure('price', 0), null);
  assert.equal(checkFigure('yours.turn', 0), null);
  assert.equal(checkFigure('yours.blocks', 100000), null);
  assert.equal(checkFigure('yours.blocks', 100001), 'Blocks in the room must be a whole number from 1 to 100,000\u00a0blocks');
});

test('a unit split for a box: RM before the figure (inside the box), the rest after it', () => {
  assert.deepEqual(unitParts('RM/kg'), { prefix: 'RM', after: 'a kg' });
  assert.deepEqual(unitParts('RM a block'), { prefix: 'RM', after: 'a block' });
  assert.deepEqual(unitParts('RM an hour'), { prefix: 'RM', after: 'an hour' });
  assert.deepEqual(unitParts('RM'), { prefix: 'RM', after: '' });
  assert.deepEqual(unitParts('%'), { prefix: null, after: '%' });
  assert.deepEqual(unitParts(''), { prefix: null, after: '' });
});

test('a refusal in the app\'s money words: RM first, the figures grouped', () => {
  const NB = ' ';
  assert.equal(checkFigure('price', -1), `Selling price must be a number from RM${NB}0 to RM${NB}1,000${NB}a${NB}kg`);
  assert.equal(checkFigure('yours.container', -1), `Container, delivered must be a number from RM${NB}0 to RM${NB}10,000,000`);
  assert.equal(checkFigure('yours.blocks', 0), `Blocks in the room must be a whole number from 1 to 100,000${NB}blocks`);
  assert.equal(checkFigure('yours.loss', 91), `Blocks lost must be a number from 0 to 90${NB}%`);
});

// ---- Money truth (spec 2026-11-12-money-truth-design.md 9 and 10) ----
test('the room type: a built room\'s panels and cooling by its size, a shed\'s house and no cooling; the way and the building named by it', async () => {
  const { yoursName, figureLabel, EQUIPMENT_KEYS } = await import('../web/economics-defaults.js');
  const room1 = { volume: 113.4, length: 9, width: 4.5, height: 2.8, humidifierLH: 2, type: 'built' };
  assert.equal(sizeOf(room1), null, 'not a container');
  const building = researchOf('yours.container', 'lionsmane', room1, 2640);
  assert.deepEqual([building.value, building.low, building.high], [25056, 15660, 39150], '156.6 m² of panel at RM 160 (100–250)');
  assert.match(building.note.replace(/\u00a0/g, ' '), /^156.6 m² of insulated panel walls, roof and floor at RM 160 a m²/);
  const cooling = researchOf('yours.cooling', 'lionsmane', room1, 2640);
  assert.deepEqual([cooling.value, cooling.low, cooling.high], [13560, 9040, 18080], '3 × 2.5 hp for 113 m³, not the 40 ft reefer\'s 2');
  assert.equal(researchOf('yours.container', 'lionsmane', { ...room1, type: 'container' }, 2640).value, 38100, 'as a container: the 40 ft reefer');
  const shed = { volume: 200, length: 10, width: 8, height: 2.5, humidifierLH: 2, type: 'shed' };
  assert.deepEqual([researchOf('yours.container', 'oyster', shed, 3000).value, researchOf('yours.cooling', 'oyster', shed, 3000).value,
    researchOf('yours.racks', 'oyster', shed, 3000).value], [10000, 0, 0], 'two houses for 3,000 blocks; not cooled; racks in the house');
  // With no blocks known yet, a shed's own block count and its house come from the room's size (this once looped forever)
  assert.equal(researchOf('yours.blocks', 'oyster', shed).value, 4400, 'a 200 m³ shed at the research blocks a m³');
  assert.equal(researchOf('yours.container', 'oyster', shed).value, 15000, 'three houses for its 4,400 blocks');
  assert.deepEqual([yoursName('container'), yoursName('built'), yoursName('shed'), yoursName(undefined)], ['Your container', 'Your room', 'Your shed', 'Your container']);
  assert.deepEqual([figureLabel('yours.container', 'built'), figureLabel('yours.container', 'shed'), figureLabel('yours.cooling', 'built')],
    ['Building, insulated', 'Shed', 'Cooling, fitted']);
  assert.deepEqual(EQUIPMENT_KEYS, ['yours.container', 'yours.cooling', 'yours.humidifier', 'yours.fans', 'yours.racks', 'yours.other']);
});

test('labour as people: the workers and a worker\'s month at RM 1,700 × 1.1495, farm figures of Your container', () => {
  const w = researchOf('yours.workerMonth', 'lionsmane', ROOM, 1482);
  assert.deepEqual([w.value, w.low, w.high, w.confidence], [1954.15, 1954.15, 2299, 'medium']);
  assert.equal(researchOf('yours.workers', 'oyster', ROOM, 1482).value, 1);
  assert.deepEqual([figureOf('yours.workers').scope, figureOf('yours.workerMonth').scope, figureOf('yours.workers').way], ['farm', 'farm', 'yours']);
  assert.equal(checkFigure('yours.workers', 0.5), null, 'a part-time worker');
  assert.equal(figureOf('wage').label, 'Labour cost, other ways');
  assert.equal(researchOf('yours.other', 'pink', ROOM, 1482).value, 0);
});

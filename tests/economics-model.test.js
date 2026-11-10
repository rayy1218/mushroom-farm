// The Economics model (web/economics-model.js, spec 2026-11-06-economics-design.md 5 and 11.1): a growing way, import and
// resell, the houses, the figures to a way's inputs and the comparison. The golden test feeds the model page's own inputs
// (research/lions-mane-economics.html at its defaults, the custom cold room) and must give its results to the sen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_A_MONTH, blockLife, grow, trade, housesOf, inputsOf, compare } from '../web/economics-model.js';

const r2 = (v) => Math.round(v * 100) / 100;
// Every figure of `want` to 2 places (a nested object too); Infinity and null as they are.
function near(got, want, path = '') {
  for (const [k, v] of Object.entries(want)) {
    if (v !== null && typeof v === 'object') near(got[k], v, `${path}${k}.`);
    else if (typeof v === 'number' && Number.isFinite(v)) assert.equal(r2(got[k]), v, `${path}${k}`);
    else assert.equal(got[k], v, `${path}${k}`);
  }
}

// The model page's shared inputs and its cold room (section 11.1).
const SHARED = { price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, lifeMonths: 60 };
const GROW = { blocks: 1740, yieldG: 161.3 * 1.55, flushes: 2, loss: 10, first: 12, interval: 14, turn: 16, labourMin: 2.52, uphill: 0, rent: 0 };
const COLD = { ...SHARED, ...GROW, kwhMonth: 506, transport: 0, equipment: 18500 + 8580 + 3000 + 3300 + 2610 };
const HIGHLAND = { ...SHARED, ...GROW, kwhMonth: 146, transport: 2, equipment: 5000 + 1500 + 1800 };
const WARM = { ...SHARED, ...GROW, yieldG: 80 * 1.55, kwhMonth: 146, transport: 0, equipment: 5000 + 1500 + 3300 };
const IMPORT = { price: 50, shrink: 10, pack: 3, wage: 10, landed: 8.10 * 4.087 + 8, buyHours: 2, rent: 0 };

test('golden: the cold room gives the model page\'s RM 3,003.16 a month, break-even RM 38.23, payback 13.37 months', () => {
  assert.equal(DAYS_A_MONTH, 30.4);
  near(grow(COLD), {
    life: 42, blocksM: 1259.43, kgSold: 255.05, income: 12752.48,
    cost: { blocks: 7556.57, electricity: 298.81, labour: 528.96, packing: 765.15, transport: 0, rent: 0, writeOff: 599.83 },
    costs: 9749.32, profit: 3003.16, be: 38.23, equipment: 35990, fill: 10440, rampCost: 326.75, payback: 9.99, paybackAll: 13.37,
  });
});

test('golden: the highland grower makes RM 3,152.92, break-even RM 37.64, payback 6.16 months', () => {
  near(grow(HIGHLAND), {
    blocksM: 1259.43, kgSold: 255.05, income: 12752.48,
    cost: { blocks: 7556.57, electricity: 100.45, labour: 528.96, packing: 765.15, transport: 510.10, rent: 0, writeOff: 138.33 },
    costs: 9599.56, profit: 3152.92, be: 37.64, equipment: 8300, fill: 10440, rampCost: 248.45, payback: 2.52, paybackAll: 6.16,
  });
});

test('golden: the warm strain loses RM 2,403.95 and never pays back', () => {
  near(grow(WARM), {
    kgSold: 126.50, income: 6324.85,
    cost: { blocks: 7556.57, electricity: 100.45, labour: 528.96, packing: 379.49, transport: 0, rent: 0, writeOff: 163.33 },
    costs: 8728.80, profit: -2403.95, be: 69.00, equipment: 9800, fill: 10440, rampCost: 248.45, payback: Infinity, paybackAll: Infinity,
  });
});

test('golden: import and resell sells the cold room\'s kg and loses RM 269.27, break-even RM 51.06', () => {
  const cold = grow(COLD);
  near(trade(IMPORT, cold.kgSold), {
    kgBought: 283.39, kgSold: 255.05, income: 12752.48,
    cost: { blocks: 11648.60, electricity: 0, labour: 608, packing: 765.15, transport: 0, rent: 0, writeOff: 0 },
    costs: 13021.75, profit: -269.27, be: 51.06, equipment: 0, payback: null, paybackAll: null,
  });
});

test('grow: nothing sold has no break-even; a loss or a payback past the write-off never pays back; no equipment pays back at once', () => {
  const none = grow({ ...COLD, yieldG: 0 });
  assert.equal(none.kgSold, 0);
  assert.equal(none.be, null);
  assert.equal(none.payback, Infinity);
  const slow = grow({ ...COLD, equipment: 3602.99 * 61 }); // op 3,602.99 a month: 61 months is past the 60
  assert.equal(slow.payback, Infinity);
  assert.equal(slow.paybackAll, Infinity);
  const free = grow({ ...COLD, equipment: 0 });
  assert.equal(free.payback, 0);
  assert.equal(r2(free.paybackAll), 3.38, 'the first fill and the wait still counted');
  assert.equal(grow({ ...COLD, flushes: 1 }).life, 28, 'one flush: no interval');
  assert.equal(blockLife({ first: 12, interval: 14, flushes: 2, turn: 16 }), 42);
});

test('housesOf: a house holds up to 2,000 blocks, at least one', () => {
  assert.deepEqual([housesOf(1), housesOf(2000), housesOf(2001), housesOf(0)], [1, 1, 2, 1]);
});

// The figures as the page holds them (key → value), at the model page's inputs.
const VALUES = {
  price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60,
  'yours.blocks': 1740, 'yours.yieldG': 250.015, 'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14,
  'yours.turn': 16, 'yours.kwhBlock': 0.4, 'yours.labourMin': 2.52, 'yours.transport': 0, 'yours.rent': 0,
  'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
  'highland.yieldG': 250.015, 'highland.flushes': 2, 'highland.loss': 10, 'highland.first': 12, 'highland.interval': 14,
  'highland.turn': 16, 'highland.labourMin': 2.52, 'highland.transport': 2, 'highland.rent': 0, 'highland.uphill': 0.5,
  'highland.kwhHouse': 146, 'highland.house': 5000, 'highland.humidifier': 1500, 'highland.fans': 1800,
  'import.landed': 41.1047, 'import.buyHours': 2, 'import.rent': 0,
};

test('inputsOf: your container\'s kWh a month from kWh per block, its equipment summed; a house way per house; import its own', () => {
  const yours = inputsOf(VALUES, 'yours');
  assert.equal(r2(yours.kwhMonth), 503.77);
  assert.equal(yours.equipment, 35990);
  assert.deepEqual([yours.lifeMonths, yours.uphill, yours.blocks, yours.yieldG], [60, 0, 1740, 250.015]);
  const two = inputsOf({ ...VALUES, 'yours.blocks': 2001 }, 'highland');
  assert.deepEqual([two.kwhMonth, two.equipment, two.uphill, two.transport], [292, 16600, 0.5, 2]);
  assert.deepEqual(inputsOf(VALUES, 'import'), { price: 50, shrink: 10, pack: 3, wage: 10, landed: 41.1047, buyHours: 2, rent: 0 });
});

test('compare: your container first, import selling your kg sold', () => {
  const out = compare(VALUES, ['yours', 'highland', 'import']);
  assert.deepEqual(out.map((r) => r.way), ['yours', 'highland', 'import']);
  assert.equal(out[2].kgSold, out[0].kgSold);
  assert.equal(out[2].kind, 'trade');
  assert.equal(out[1].kind, 'grow');
});

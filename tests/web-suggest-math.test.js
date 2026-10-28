// Suggest machines as a page of its own (owner 2026-10-28: "numbers decide the business"): the setups ranked by the money they
// cost a month, five columns, and whether each reaches the goal said in words.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  pricesOf, monthly, suggestRows, verdictOf, moneyHead, priceLine, noneReachedLine, COLUMNS,
} from '../web/suggest-math.js';

const machines = (fanFlow, acBTU, humidifierLH, dehumidifierLday) => ({ fanFlow, acBTU, humidifierLH, dehumidifierLday });
const result = {
  target: 95, days: 7, coolDownMaxH: 3, coolDownStartHour: 14,
  best: [
    { machines: machines(150, 9000, 0.5, 10), exchangeMaxMin: 30, control: { exchangeMaxMin: 30, acDrop: 0, humidifierDuringExchange: false },
      inBand: { t: 99.12, rh: 97, co2: 98, all: 96.04 }, kWh: 41.26, litres: 12, removedLitres: 3, coolDownH: 1.5 },
    { machines: machines(200, 12000, 1, 0), exchangeMaxMin: 10, control: { exchangeMaxMin: 10, acDrop: 0, humidifierDuringExchange: false },
      inBand: { t: 99, rh: 90, co2: 99, all: 88 }, kWh: 55, litres: 20, removedLitres: 0, coolDownH: 3.8 },
  ],
};
const prices = { electricity: 0.55, water: 2.5 };

test('the prices from GET /api/settings: electricity always (the default 0.55), water only when set', () => {
  assert.deepEqual(pricesOf({ electricityPrice: 0.55, waterPrice: null }), { electricity: 0.55, water: null });
  assert.deepEqual(pricesOf({ electricityPrice: 0.6, waterPrice: 2.5 }), { electricity: 0.6, water: 2.5 });
  assert.deepEqual(pricesOf(null), { electricity: null, water: null }, 'settings not read');
});

test('a month: the search\'s days scaled to 30, the money for electricity and (with a price) water', () => {
  const m = monthly(result.best[0], 7, prices);
  assert.equal(m.kWh.toFixed(2), '176.83');
  assert.equal(m.litres.toFixed(2), '51.43');
  assert.equal(m.energyRM.toFixed(2), '97.26');
  assert.equal(m.waterRM.toFixed(4), '0.1286');
  assert.equal(m.rm.toFixed(2), '97.38');
  const dry = monthly(result.best[0], 7, { electricity: 0.55, water: null });
  assert.equal(dry.waterRM, null);
  assert.equal(dry.rm.toFixed(2), '97.26');
  assert.equal(monthly(result.best[0], 7, { electricity: null, water: null }).rm, null);
});

test('five columns at most: the setup, in band, RM per month, the cool-down and Use this', () => {
  assert.deepEqual(COLUMNS, ['Setup', 'In band (all three)', 'RM per month', 'Cools down in', '']);
  assert.equal(moneyHead(prices), 'RM per month');
  assert.equal(moneyHead({ electricity: null, water: null }), 'Energy per month', 'no price: energy instead');
});

test('the rows: the setup in one line, all three in band, the money a month and the cool-down; the rest in the details', () => {
  const rows = suggestRows(result, prices);
  assert.equal(rows.length, 2);
  const [a, b] = rows;
  assert.deepEqual(a.setupParts, ['Fan 150 m³/h', 'aircon 2.6 kW (9,000 BTU/h class)', 'humidifier 0.5 L/h', 'dehumidifier 10 L/day']);
  assert.equal(b.setupParts[3], 'no dehumidifier');
  assert.deepEqual([a.rank, a.index, a.inBand, a.money, a.coolDown], [1, 0, '96.0 %', 'RM 97.38', '1.5 h']);
  assert.deepEqual([b.rank, b.index, b.inBand, b.money, b.coolDown], [2, 1, '88.0 %', 'RM 129.86', '3.8 h']);
  assert.deepEqual(a.details, [
    { label: 'Temperature in band', value: '99.1 %' },
    { label: 'Humidity in band', value: '97.0 %' },
    { label: 'CO₂ in band', value: '98.0 %' },
    { label: 'Energy', value: '41.3 kWh in 7 days · 177 kWh a month' },
    { label: 'Water (humidifier)', value: '12 L in 7 days · 51 L a month' },
    { label: 'Water taken out (dehumidifier)', value: '3.0 L in 7 days' },
    { label: 'Money a month', value: 'RM 97.26 electricity + RM 0.13 water' },
    { label: 'Air exchange time limit', value: '30 min' },
    { label: 'Aircon during air exchange', value: 'not lowered' },
    { label: 'Humidifier during air exchange', value: 'off' },
  ]);
  assert.equal(b.details.some((d) => d.label.startsWith('Water taken out')), false, 'none taken out: no line');
  // no water price: electricity only, and it says so
  assert.equal(suggestRows(result, { electricity: 0.55, water: null })[0].details.find((d) => d.label === 'Money a month').value,
    'RM 97.26 electricity (no water price set)');
  // no price at all: energy a month in the money column, no money line
  const bare = suggestRows(result, { electricity: null, water: null })[0];
  assert.equal(bare.money, '177 kWh');
  assert.equal(bare.details.some((d) => d.label === 'Money a month'), false);
  assert.deepEqual(suggestRows(null, prices), []);
  assert.deepEqual(suggestRows({ best: [] }, prices), []);
});

test('whether a setup reaches the goal, in words (never a tick) with its tone', () => {
  assert.deepEqual(verdictOf(result.best[0], result), { reached: true, tone: 'good', text: 'Reaches 95 % and cools down in 1.5 h' });
  assert.deepEqual(verdictOf(result.best[1], result), { reached: false, tone: 'amber', text: 'Misses: humidity 90.0 % in band, under 95 %; cools down in 3.8 h, over 3 h' });
  assert.equal(verdictOf({ ...result.best[0], coolDownH: 4.2 }, result).text, 'Misses: cools down in 4.2 h, over 3 h');
  assert.equal(verdictOf({ ...result.best[0], coolDownH: null }, result).text, 'Misses: does not cool down in a day');
  assert.equal(verdictOf({ ...result.best[0], inBand: { t: 93.14, rh: 90, co2: 99, all: 85 } }, result).text,
    'Misses: temperature 93.1 % and humidity 90.0 % in band, under 95 %');
  assert.equal(verdictOf({ ...result.best[0], inBand: { t: 93.14, rh: 90, co2: 80, all: 70 } }, result).text,
    'Misses: temperature 93.1 %, humidity 90.0 % and CO₂ 80.0 % in band, under 95 %');
  // a result from before the cool-down check: the target alone
  const old = { ...result, coolDownMaxH: undefined };
  assert.deepEqual(verdictOf(result.best[0], old), { reached: true, tone: 'good', text: 'Reaches 95 %' });
  assert.equal(suggestRows(old, prices)[0].coolDown, '—');
  for (const r of suggestRows(result, prices)) assert.doesNotMatch(r.verdict.text, /✓/);
});

test('ranked by money: the setups that reach the goal cheapest first, then the rest in the search\'s order', () => {
  const heavyWater = { ...result.best[0], kWh: 40, litres: 2000 };
  const light = { ...result.best[0], kWh: 41, litres: 10, machines: machines(150, 9000, 0.3, 10) };
  const miss = result.best[1];
  const r = { ...result, best: [heavyWater, light, miss] }; // the server ranks by kWh
  assert.deepEqual(suggestRows(r, prices).map((x) => x.index), [1, 0, 2], 'with water at RM 2.50 per m³ the lighter one is cheaper');
  assert.deepEqual(suggestRows(r, prices).map((x) => x.rank), [1, 2, 3]);
  assert.deepEqual(suggestRows(r, { electricity: 0.55, water: null }).map((x) => x.index), [0, 1, 2], 'without a water price: by energy');
  // a miss never climbs over a setup that reaches the goal, however cheap
  const cheapMiss = { ...miss, kWh: 1, litres: 0 };
  assert.deepEqual(suggestRows({ ...result, best: [result.best[0], cheapMiss] }, prices).map((x) => x.index), [0, 1]);
});

test('the line under the table: what the money is made of', () => {
  assert.equal(priceLine(prices, 7), 'RM per month: electricity at RM 0.55 per kWh and water at RM 2.50 per m³ (Settings), the 7 days of the search scaled to 30.');
  assert.equal(priceLine({ electricity: 0.55, water: null }, 17), 'RM per month: electricity at RM 0.55 per kWh (Settings; no water price set), the 17 days of the search scaled to 30.');
  assert.equal(priceLine({ electricity: null, water: null }, 7), 'The prices could not be read: the setups are ranked by energy, the 7 days of the search scaled to 30.');
});

test('none reaches the goal: said in words', () => {
  assert.equal(noneReachedLine(result, suggestRows(result, prices)), null);
  const missed = { ...result, best: [result.best[1]] };
  assert.equal(noneReachedLine(missed, suggestRows(missed, prices)), 'No setup reached 95 % and cooled down within 3 h.');
  const old = { ...missed, coolDownMaxH: undefined };
  assert.equal(noneReachedLine(old, suggestRows(old, prices)), 'No setup reached 95 %.');
  assert.equal(noneReachedLine({ ...result, best: [] }, []), null, 'no setup at all says so elsewhere');
});

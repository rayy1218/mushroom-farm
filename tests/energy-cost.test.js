// One pricing of usage days (server/energy-cost.js, spec 2026-11-12-data-integrity-design.md 9): each day at its own tariff
// price (G14), rounded to the sen and then summed (G17); measured and estimated apart; water per day. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayCost, energyCost, dayPrice } from '../server/energy-cost.js';
import { liveRates } from '../server/tariffs.js';

const TARIFF = liveRates([{ id: 1, from: '2020-01-01', rate: 0.515, afa: 0, voided: null }, { id: 2, from: '2026-10-01', rate: 0.515, afa: 0.0275, voided: null }]);

test('G14: 10.000 kWh on 30 Sep at 0.5150 is RM 5.15; on 1 Oct at 0.5425 is RM 5.43 (5.425, half away from zero)', () => {
  assert.equal(dayPrice('2026-09-30', { tariff: TARIFF }), 0.515);
  assert.deepEqual(dayCost({ date: '2026-09-30', kWh: 10, kWhMeasured: 10, kWhEstimated: 0, waterL: 0 }, { tariff: TARIFF, water: null }),
    { measured: 5.15, estimated: 0, electricity: 5.15, water: null });
  assert.equal(dayCost({ date: '2026-10-01', kWh: 10, kWhMeasured: 10, kWhEstimated: 0, waterL: 0 }, { tariff: TARIFF, water: null }).electricity, 5.43);
});

test('G17: three days of 1.010 kWh at RM 0.55 are RM 0.56 each, RM 1.68 (not RM 1.67 from 3.030 kWh × 0.55)', () => {
  const days = ['2026-11-01', '2026-11-02', '2026-11-03'].map((date) => ({ date, kWh: 1.01, kWhMeasured: 0, kWhEstimated: 1.01, waterL: 0 }));
  const c = energyCost(days, { electricity: 0.55, water: null });
  assert.deepEqual([c.estimated, c.electricity, c.kWh], [1.68, 1.68, 3.03]);
});

test('measured and estimated priced apart, water per day; a day of before split by its metered flag', () => {
  const c = energyCost([
    { date: '2026-11-01', kWh: 6, kWhMeasured: 4, kWhEstimated: 2, waterL: 1500, unseenMs: 0 },
    { date: '2026-11-02', kWh: 3, metered: true, waterL: 0 },
    { date: '2026-11-03', kWh: 1, metered: false, waterL: 250, unseenMs: 3_600_000 },
  ], { electricity: 0.5, water: 2 });
  assert.deepEqual(c, { measured: 3.5, estimated: 1.5, electricity: 5, water: 3.5, kWhMeasured: 7, kWhEstimated: 3, kWh: 10, waterL: 1750, unseenMs: 3_600_000 });
});

// The unsold balance (server/unsold-math.js, spec 2026-11-12-data-integrity-design.md 6.2): still to sell and past its keeping
// days, the order sales and Not sold take the picks in, the value. Made-up figures (G10).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unsoldBalance, unsoldOf } from '../server/unsold-math.js';
import { KEEP_DAYS, keepDaysOf } from '../web/crops.js';

const ms = (d) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), 4);
const pick = (crop, kg, date) => ({ crop, kg, date });
const sale = (crop, kg, date) => ({ crop, kg, date, at: ms(date) });

test('G10: 190.0 kg of black jelly picked 1 Nov, 24.0 kg sold 2 Nov, today 10 Nov: 166.0 kg past its keeping days since 6 Nov', () => {
  const b = unsoldBalance({ picks: [pick('woodear', 190, '2026-11-01')], sales: [sale('woodear', 24, '2026-11-02')], notSold: [] }, {}, '2026-11-10');
  assert.deepEqual(b.crops, [{ crop: 'woodear', picked: 190, sold: 24, notSold: 0, fresh: 0, past: 166, pastSince: '2026-11-06', value: 0 }]);
  assert.deepEqual(b.total, { fresh: 0, past: 166, value: 0 });
  const closed = unsoldBalance({ picks: [pick('woodear', 190, '2026-11-01')], sales: [sale('woodear', 24, '2026-11-02')], notSold: [sale('woodear', 166, '2026-11-10')] }, {}, '2026-11-10');
  assert.deepEqual(closed.crops, [], 'recorded not sold: nothing left');
});

test('a sale takes the picks still fresh on its day first; Not sold takes the oldest; still to sell valued at the expected price', () => {
  const picks = [pick('oyster', 20, '2026-11-01'), pick('oyster', 15, '2026-11-08'), pick('oyster', 9, '2026-11-10')];
  const b = unsoldBalance({ picks, sales: [sale('oyster', 15, '2026-11-09')], notSold: [sale('oyster', 5, '2026-11-09')] },
    { oyster: { priceKg: 13.5 } }, '2026-11-10');
  // the 9 Nov sale takes the 8 Nov pick (fresh then); Not sold 5 of the 1 Nov pick: 15 left of it, past since 4 Nov
  assert.deepEqual(b.crops, [{ crop: 'oyster', picked: 44, sold: 15, notSold: 5, fresh: 9, past: 15, pastSince: '2026-11-04', value: 121.5 }]);
  assert.equal(unsoldOf(b, 'oyster'), 24);
  assert.equal(unsoldOf(b, 'pink'), 0);
  const noPrice = unsoldBalance({ picks: [pick('pink', 4, '2026-11-10')], sales: [], notSold: [] }, {}, '2026-11-10');
  assert.deepEqual([noPrice.crops[0].value, noPrice.total.value], [null, null]);
});

test('keeping days: the defaults; a farm\'s own from Settings → Yield', () => {
  assert.deepEqual(KEEP_DAYS, { oyster: 3, black: 3, pink: 2, abalone: 3, golden: 2, woodear: 5, reishi: 30, milky: 5, lionsmane: 5 });
  assert.equal(keepDaysOf('oyster', {}), 3);
  assert.equal(keepDaysOf('oyster', { oyster: { keepDays: 7 } }), 7);
  const cold = unsoldBalance({ picks: [pick('oyster', 10, '2026-11-05')], sales: [], notSold: [] }, { oyster: { keepDays: 7 } }, '2026-11-10');
  assert.deepEqual([cold.crops[0].fresh, cold.crops[0].past], [10, 0]);
});

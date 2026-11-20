// Data integrity's asks, pure (server/integrity-math.js, spec 2026-11-12-data-integrity-design.md 5): the boundaries the
// browser's checks had (now the server's), the crop's balance, the minutes' words. Made-up figures.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salePriceAsks, cropBalance, oversold, agoWords, dayWords } from '../server/integrity-math.js';

const plain = (s) => s.replace(/ /g, ' ');

test('the price and kg asks: 500 kg exactly asks nothing; an expected price of 0 no price check; "over 3" at 3.0', () => {
  const cropYield = { oyster: { priceKg: 12 }, black: { priceKg: 0 } };
  assert.deepEqual(salePriceAsks([{ crop: 'oyster', kg: 500, priceKg: 12 }], cropYield), []);
  assert.deepEqual(salePriceAsks([{ crop: 'black', kg: 1, priceKg: 50 }], cropYield), []);
  assert.equal(plain(salePriceAsks([{ crop: 'oyster', kg: 1, priceKg: 36.1 }], cropYield)[0].text), "That's over 3 times the expected RM 12.00 per kg. Is RM 36.10 right?");
});

test('the crop\'s balance from its first pick to a day\'s end; over at 5 % and a sen', () => {
  const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
  const b = cropBalance({
    picks: [{ kg: 112, pickedAt: at('2026-11-01') }, { kg: 100, pickedAt: at('2026-11-04') }, { kg: 50, pickedAt: at('2026-11-12') }],
    sales: [{ kg: 5, soldAt: at('2026-10-30') }, { kg: 18, soldAt: at('2026-11-02') }], notSold: [{ kg: 4, at: at('2026-11-05') }],
  }, '2026-11-10');
  assert.deepEqual(b, { firstAt: at('2026-11-01'), picked: 212, sold: 18, notSold: 4 }, 'a sale before the first pick and a later pick left out');
  assert.equal(oversold({ picked: 212, sold: 222.6, notSold: 0 }), false);
  assert.equal(oversold({ picked: 212, sold: 222.61, notSold: 0 }), true);
  assert.deepEqual(cropBalance({ picks: [], sales: [], notSold: [] }, '2026-11-10'), { firstAt: null, picked: 0, sold: 0, notSold: 0 });
});

test('words: minutes ago, a day', () => {
  const now = Date.UTC(2026, 10, 10, 2);
  assert.equal(agoWords(now, now - 20_000), 'just now');
  assert.equal(agoWords(now, now - 60_000), '1 minute ago');
  assert.equal(agoWords(now, now - 7 * 60_000), '7 minutes ago');
  assert.equal(agoWords(now, now - 3 * 3_600_000), 'on 10 Nov');
  assert.equal(dayWords('2026-11-03'), '3 Nov');
});

// The asks in the browser (web/asks.js, spec 2026-11-12-data-integrity-design.md 5.1): the problems a dialog shows, the
// confirmed kinds sent with the same body again, a changed body asked again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAsk, asksProblems, anyway, createConfirm } from '../web/asks.js';
import { ApiError } from '../web/api.js';

const ASKS = [{ kind: 'duplicate', field: 'lines.0.kg', text: 'Is this another sale?' }, { kind: 'closed-month', field: 'soldAt', text: 'October 2026 is closed' }];

test('an ApiError carries the asks of a 409; isAsk knows one', () => {
  const err = new ApiError(409, { error: 'Check before saving', asks: ASKS });
  assert.equal(isAsk(err), true);
  assert.equal(isAsk(new ApiError(409, { error: 'Void it instead' })), false);
  assert.equal(isAsk(new ApiError(400, { error: 'x', asks: ASKS })), false);
});

test('the problems under their boxes, mapped; the primary\'s words', () => {
  assert.deepEqual(asksProblems(ASKS, (f) => (f === 'soldAt' ? 'date' : f)), [
    { field: 'lines.0.kg', message: 'Is this another sale?', warn: true }, { field: 'date', message: 'October 2026 is closed', warn: true },
  ]);
  assert.equal(anyway('Record'), 'Record anyway');
});

test('asks on one box share it; an ask with no box of its own joins the first box, or the form\'s line when none has one', () => {
  const three = [...ASKS, { kind: 'price', field: 'lines.0.kg', text: 'Is RM 90.00 right?' }];
  const has = (f) => f === 'lines.0.kg';
  assert.deepEqual(asksProblems(three, (f) => f, has), [
    { field: 'lines.0.kg', message: 'Is this another sale? Is RM 90.00 right? October 2026 is closed', warn: true },
  ]);
  assert.deepEqual(asksProblems(ASKS, (f) => f, () => false), [
    { field: null, message: 'Is this another sale? October 2026 is closed', warn: true },
  ]);
});

test('the same body again goes with the kinds confirmed; a changed one does not', () => {
  const c = createConfirm();
  const body = { kg: 4, priceKg: 13.5 };
  assert.deepEqual(c.body(body), body);
  c.asked(body, ASKS);
  assert.equal(c.waiting, true);
  assert.deepEqual(c.body({ kg: 4, priceKg: 13.5 }), { kg: 4, priceKg: 13.5, confirmed: ['duplicate', 'closed-month'] });
  assert.deepEqual(c.body({ kg: 4.1, priceKg: 13.5 }), { kg: 4.1, priceKg: 13.5 });
  c.reset();
  assert.equal(c.waiting, false);
});

test('a new ask on the same values keeps the kinds already confirmed', () => {
  const c = createConfirm();
  const body = { kg: 4 };
  c.asked(body, [{ kind: 'duplicate' }]);
  c.asked(body, [{ kind: 'closed-month' }]);
  assert.deepEqual(c.body(body).confirmed, ['duplicate', 'closed-month']);
  c.asked({ kg: 5 }, [{ kind: 'pick' }]);
  assert.deepEqual(c.body({ kg: 5 }).confirmed, ['pick'], 'other values: only their own');
});

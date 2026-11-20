// The month close's own tick (spec 2026-11-12-data-integrity-design.md 8.3): a minute after the server starts, then every
// day at 06:00 at the farm, the month that closed keeps its figures though nobody opened Costs. Made-up figures (none).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createCostRoutes, START_CLOSE_MS } from '../server/costs-api.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);

test('a minute after start, then at 06:00 each day: the closed month is kept', (t) => {
  const db = openDb(':memory:');
  const timers = [];
  const routes = createCostRoutes({
    db, events: null, now: () => at('2026-11-20', 9),
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
  });
  t.after(() => { routes.close(); db.close(); });
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, START_CLOSE_MS);
  assert.equal(db.monthClose('2026-10'), null);
  timers[0].fn();
  assert.notEqual(db.monthClose('2026-10'), null, 'an empty farm: nothing to work out, kept at once');
  assert.equal(timers[1].ms, at('2026-11-21', 6) - at('2026-11-20', 9), 'then the next 06:00');
});

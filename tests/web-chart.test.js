import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatClock, formatAgo, yRange, xFor, segments, nearestIndex, chartPoints } from '../web/chart-math.js';

test('formatClock is hh:mm:ss in local time', () => {
  const d = new Date(2026, 9, 16, 7, 5, 9);
  assert.equal(formatClock(d.getTime()), '07:05:09');
});

test('formatAgo', () => {
  assert.equal(formatAgo(0), '0 s ago');
  assert.equal(formatAgo(-3000), '0 s ago');
  assert.equal(formatAgo(4600), '5 s ago');
  assert.equal(formatAgo(59000), '59 s ago');
  assert.equal(formatAgo(60000), '1 min ago');
  assert.equal(formatAgo(3600000), '1 h ago');
  assert.equal(formatAgo(3900000), '1 h 5 min ago');
});

test('yRange pads the data and never collapses', () => {
  const r = yRange([20, 30]);
  assert.ok(r.min < 20 && r.max > 30);
  assert.ok(Math.abs(r.min - 19) < 1e-9 && Math.abs(r.max - 31) < 1e-9);
  const flat = yRange([25, 25, 25], 2);
  assert.ok(flat.max - flat.min >= 2);
  assert.ok(flat.min < 25 && flat.max > 25);
  assert.deepEqual(yRange([]), { min: 0, max: 1 });
  assert.deepEqual(yRange([NaN, null]), { min: 0, max: 1 });
});

test('yRange stretches to include the band so its lines are always visible', () => {
  const r = yRange([650, 700], 100, null, [600, 750]);
  assert.ok(r.min < 600 && r.max > 750);
  const above = yRange([900, 1000], 100, null, [600, 750]);
  assert.ok(above.min < 600 && above.max > 1000, 'readings far above the band still show the band');
  const clamped = yRange([90, 92], 5, [0, 100], [85, 95]);
  assert.ok(clamped.min < 85 && clamped.max <= 100, 'bounds still apply');
});

test('xFor spreads times across the width and centres a single time', () => {
  assert.equal(xFor(0, 0, 100, 10, 110), 10);
  assert.equal(xFor(50, 0, 100, 10, 110), 60);
  assert.equal(xFor(100, 0, 100, 10, 110), 110);
  assert.equal(xFor(5, 5, 5, 10, 110), 60);
});

test('segments break at null values', () => {
  const p = (at, value) => ({ at, value });
  const runs = segments([p(1, 1), p(2, 2), p(3, null), p(4, 4), p(5, null), p(6, null), p(7, 7), p(8, 8)]);
  assert.deepEqual(runs.map((r) => r.map((x) => x.at)), [[1, 2], [4], [7, 8]]);
  assert.deepEqual(segments([]), []);
  assert.deepEqual(segments([p(1, null)]), []);
  assert.equal(segments([p(1, 0)]).length, 1); // zero is a value
});

test('nearestIndex', () => {
  assert.equal(nearestIndex([], 5), -1);
  assert.equal(nearestIndex([0, 10, 20], 4), 0);
  assert.equal(nearestIndex([0, 10, 20], 6), 1);
  assert.equal(nearestIndex([0, 10, 20], 99), 2);
});

test('chartPoints maps failed polls to null', () => {
  const sensor = { readings: [{ at: 1, ok: true, t: 25, rh: 80 }, { at: 2, ok: false, t: null, rh: null }, { at: 3, ok: true, t: 0, rh: 1 }] };
  assert.deepEqual(chartPoints(sensor, 't'), [{ at: 1, value: 25 }, { at: 2, value: null }, { at: 3, value: 0 }]);
  assert.deepEqual(chartPoints(null, 't'), []);
});

test('niceRange: axis ends rounded out to a round step (18.5–21.5, not 18.8–21.2); bounds still apply', async () => {
  const { niceRange } = await import('../web/chart-math.js');
  assert.deepEqual(niceRange({ min: 18.8, max: 21.2 }), { min: 18.5, max: 21.5 });
  assert.deepEqual(niceRange({ min: 25.8, max: 32.6 }), { min: 25, max: 33 });
  assert.deepEqual(niceRange({ min: 640, max: 915 }), { min: 600, max: 950 });
  assert.deepEqual(niceRange({ min: 84, max: 101 }, [0, 100]), { min: 80, max: 100 });
  assert.deepEqual(niceRange({ min: 5, max: 5 }), { min: 5, max: 5 });
});

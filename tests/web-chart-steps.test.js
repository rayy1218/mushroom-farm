import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepShapes, stepValues } from '../web/chart-math.js';

const xAt = (t) => t / 10; // 0..1000 s → 0..100 px
const yFor = (v) => 100 - v;

test('a band that moved is a stepped zone: a rect for each step and a line that jumps between them', () => {
  const steps = [{ from: 0, to: 400, low: 24, high: 26 }, { from: 400, to: 1000, low: 25, high: 27 }];
  const s = stepShapes(steps, { from: 0, to: 1000 }, xAt, yFor);
  assert.deepEqual(s.rects, [{ x: 0, y: 74, width: 40, height: 2 }, { x: 40, y: 73, width: 60, height: 2 }]);
  assert.equal(s.high, 'M0.0 74.0H40.0V73.0H100.0');
  assert.equal(s.low, 'M0.0 76.0H40.0V75.0H100.0');
});

test('steps are cut to the window; a gap starts a new line; nothing inside gives nothing', () => {
  const steps = [{ from: 0, to: 400, low: 24, high: 26 }, { from: 600, to: 1000, low: 24, high: 26 }];
  const cut = stepShapes(steps, { from: 100, to: 800 }, xAt, yFor);
  assert.deepEqual(cut.rects.map((r) => [r.x, r.width]), [[10, 30], [60, 20]]);
  assert.equal(cut.high, 'M10.0 74.0H40.0M60.0 74.0H80.0');
  assert.deepEqual(stepShapes(steps, { from: 400, to: 600 }, xAt, yFor), { rects: [], high: '', low: '' });
  assert.deepEqual(stepShapes(undefined, { from: 0, to: 1 }, xAt, yFor), { rects: [], high: '', low: '' });
  assert.deepEqual(stepValues(steps), [24, 26, 24, 26]);
});

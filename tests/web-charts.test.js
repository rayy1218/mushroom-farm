// web/charts.js pure functions (docs/contracts/web.md section 6.2, table 7.2).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../web/ui.js');
require('../web/charts.js');
const FC = globalThis.FarmCharts;

test('lowerBound, nearest moved unchanged', () => {
  const pts = [{ t: 0 }, { t: 10 }, { t: 20 }];
  assert.equal(FC.lowerBound(pts, 10), 1);
  assert.equal(FC.lowerBound(pts, 15), 2);
  assert.equal(FC.lowerBound(pts, 25), 3);
  assert.equal(FC.nearest(pts, 14).t, 10);
  assert.equal(FC.nearest(pts, 16).t, 20);
  assert.equal(FC.nearest([], 5), null);
});

test('niceTicks moved unchanged', () => {
  assert.deepEqual(FC.niceTicks(0, 10, 3), [0, 5, 10]);
  assert.deepEqual(FC.niceTicks(18.2, 25.7, 4), [17.5, 20, 22.5, 25, 27.5]);
  assert.deepEqual(FC.niceTicks(5, 5, 3), [5, 5.5, 6]);
});

test('aggregate moved unchanged', () => {
  const pts = [{ t: 0 }, { t: 10 }, { t: 20 }];
  assert.equal(FC.aggregate(pts, 10), pts);
  const pts2 = [{ t: 0, T: 1, x: 'a' }, { t: 10, T: NaN, x: 'b' }, { t: 20, T: 3, x: 'c' }, { t: 30, T: 5, x: 'd' }];
  const out = FC.aggregate(pts2, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].t, 5); assert.equal(out[1].t, 25);
  assert.equal(out[0].T, 1); assert.equal(out[1].T, 4);
  assert.equal(out[0].x, 'b'); assert.equal(out[1].x, 'd');
});

test('linePath: NaN gaps, new gapS', () => {
  const X = t => t, Y = y => y;
  assert.equal(FC.linePath([{ t: 0, v: 1 }, { t: 10, v: NaN }, { t: 20, v: 3 }, { t: 30, v: 4 }], X, Y, p => p.v), 'M0.0,1.0M20.0,3.0L30.0,4.0');
  const pts = [{ t: 0, v: 1 }, { t: 3, v: 2 }, { t: 20, v: 3 }];
  assert.equal(FC.linePath(pts, X, Y, p => p.v), 'M0.0,1.0L3.0,2.0L20.0,3.0');
  assert.equal(FC.linePath(pts, X, Y, p => p.v, 5), 'M0.0,1.0L3.0,2.0M20.0,3.0');
});

test('areaPath moved unchanged', () => {
  const X = t => t, Y = y => y;
  assert.equal(FC.areaPath([{ t: 0, v: 1 }], X, Y, () => 0, p => p.v), '');
  const two = FC.areaPath([{ t: 0, v: 1 }, { t: 10, v: 2 }], X, Y, () => 0, p => p.v);
  assert.ok(two.endsWith('Z'));
});

test('barPath moved unchanged', () => {
  assert.equal(FC.barPath(0, 0, 10, 20, 3), 'M0,20V3Q0,0 3,0H7Q10,0 10,3V20Z');
});

test('TREND_DEFS sub lines run with and without spT (finding 10 regression)', () => {
  const D = FC.TREND_DEFS;
  assert.equal(D.T.sub({ spT: 18 }), 'Target 18.0 °C ± 1');
  assert.doesNotThrow(() => D.T.sub({}));
  assert.equal(D.T.sub({}).includes('undefined'), false);
  assert.equal(D.RH.sub({ spRH: 85 }), 'Target 85 % ± 3');
  assert.equal(D.C.sub({ fanOff: 800, fanOn: 1000, co2Lim: 1200 }), 'Fan 800–1000 ppm · limit 1200');
});

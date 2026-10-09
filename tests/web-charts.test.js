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
  assert.equal(D.C.sub({ fanOff: 800, fanOn: 1000, co2Lim: 1200 }), 'Purge 800–1000 ppm · limit 1200');
});

// A small stand-in for the DOM, enough for createLadder and drawPurgeBars (Node has no document).
class FakeEl {
  constructor(tagName) {
    this.tagName = tagName; this.children = []; this.attrs = {}; this.dataset = {};
    this.className = ''; this.id = ''; this.textContent = ''; this.hidden = false; this.clientWidth = 600;
    this.style = { setProperty(k, v) { this[k] = v; } };
    const cls = new Set();
    this.classList = { add: c => cls.add(c), remove: c => cls.delete(c), toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), contains: c => cls.has(c) };
  }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { for (const c of cs) this.children.push(typeof c === 'string' ? Object.assign(new FakeEl('#text'), { textContent: c }) : c); }
  replaceChildren(...cs) { this.children = []; this.append(...cs); }
  get firstChild() { return this.children[0] || null; }
}
const allOf = (e, out = []) => { out.push(e); for (const c of e.children) allOf(c, out); return out; };
function fakeDocument(t) {
  globalThis.document = { createElement: tag => new FakeEl(tag), createElementNS: (ns, tag) => new FakeEl(tag) };
  t.after(() => { delete globalThis.document; });
}

test('aggregate: the air exchange power key is "air" (C9 4.2)', () => {
  const out = FC.aggregate([{ t: 0, air: 144, fan: 1 }, { t: 10, air: 0, fan: 2 }], 1);
  assert.equal(out.length, 1);
  assert.equal(out[0].air, 72);
  assert.equal(out[0].fan, 2); // not a power key any more: taken from the bucket's last point
});

test('createLadder: one row "Purge" from the stop level to the start level (C9 7)', (t) => {
  fakeDocument(t);
  const el = new FakeEl('div');
  const lad = FC.createLadder(el);
  assert.deepEqual(allOf(el).filter(e => e.className === 'lad-name').map(e => e.textContent), ['Purge']);
  lad.draw({ co2Lim: 1200, rules: { fanOn: 1000, fanOff: 800, co2Safety: false, co2SafetyAt: 3000 } }, 900, { air: { lvl: 'info', icon: '▲', text: 'Purging' } });
  const pos = v => `${(v - 400) / (1500 - 400) * 100}%`; // scale 400 to ceil((1200 + 250) / 250) × 250 = 1500 ppm
  assert.equal(allOf(el).find(e => e.className === 'lad-hys').style.left, pos(800));
  assert.equal(allOf(el).find(e => e.className === 'lad-on').style.left, pos(1000));
  assert.equal(allOf(el).find(e => e.className === 'chip').dataset.txt, 'Purging');
});

test('drawPurgeBars: purge bars titled with purges, m³ and capped purges (C9 7)', (t) => {
  fakeDocument(t);
  const host = new FakeEl('div');
  const clock = { offset: 0, hm: s => `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:00` };
  const hours = Array.from({ length: 24 }, (_, h) => ({ h, runS: 0, starts: 0, m3: 0, cappedN: 0 }));
  hours[23] = { h: 23, runS: 180, starts: 2, m3: 90, cappedN: 1 };
  assert.equal(FC.drawExhaustBars, undefined);
  FC.drawPurgeBars(host, hours, clock);
  assert.equal(host.children[0].attrs['aria-label'], 'Air exchange run minutes per hour, last 24 hours. The table below has the values.');
  assert.deepEqual(allOf(host).filter(e => e.tagName === 'title').map(e => e.textContent), ['23:00–00:00: 3 min, 2 purges, 90 m³, 1 capped, hour not finished']);
});

// drawCalibCharts options (docs/contracts/web.md C5 6.2): a recording DOM stub.
function stubEl(tag) {
  return { tag, attrs: {}, style: {}, children: [], className: '', textContent: '', clientWidth: 900,
    setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; } };
}
const walk = (n, f, out = []) => { if (n && typeof n === 'object') { if (f(n)) out.push(n); (n.children || []).forEach(c => walk(c, f, out)); } return out; };
const ROWS = [{ t: 0, T: 20, RH: 80, CO2: 900 }, { t: 3600, T: 21, RH: 82, CO2: 950 }];
const BASE = { series: [{ t: 0, T: 20.5, RH: 81, CO2: 910 }, { t: 3600, T: 21.5, RH: 83, CO2: 940 }] };
const FIT = { result: { series: BASE.series } };
const keyTexts = host => walk(host, n => n.className === 'cal-key')[0].children.map(s => s.children[1]);
const keyIcons = host => walk(host, n => n.className === 'cal-key')[0].children.map(s => s.children[0]);
const paths = (host, cls) => walk(host, n => n.tag === 'path' && n.attrs.class === cls);
function drawStub(opts) {
  const saved = { document: globalThis.document };
  globalThis.document = { createElement: stubEl, createElementNS: (ns, tag) => stubEl(tag) };
  try { const host = stubEl('div'); FC.drawCalibCharts(host, opts); return host; }
  finally { globalThis.document = saved.document; }
}

test('CH1 base is read as series', () => {
  const host = drawStub({ rows: ROWS, base: BASE, fit: null });
  assert.equal(walk(host, n => n.tag === 'svg').length, 3);
  assert.equal(walk(host, n => n.className === 'cal-key').length, 1);
  assert.equal(paths(host, 'meas').length, 3);
  assert.equal(paths(host, 'simb').length, 3);
  assert.equal(paths(host, 'sima').length, 0);
  assert.deepEqual(keyTexts(host), ['Measured', 'Simulation now']);
  assert.equal(walk(host, n => n.tag === 'path' && n.style.strokeDasharray !== undefined).length, 0);
});

test('CH2 labels', () => {
  const host = drawStub({ rows: ROWS, base: BASE, fit: FIT, labels: { rows: 'Real (sensors)', base: 'Predicted (run 12)' } });
  assert.deepEqual(keyTexts(host), ['Real (sensors)', 'Predicted (run 12)', 'Simulation, fitted']);
  const h2 = drawStub({ rows: ROWS, base: BASE, fit: FIT, labels: { fit: 'F' } });
  assert.deepEqual(keyTexts(h2), ['Measured', 'Simulation now', 'F']);
});

test('CH3 dashed', () => {
  const dash = (d, base, fit, ib, ia) => {
    const host = drawStub({ rows: ROWS, base: BASE, fit: FIT, dashed: d });
    for (const p of paths(host, 'simb')) assert.equal(p.style.strokeDasharray, base);
    for (const p of paths(host, 'sima')) assert.equal(p.style.strokeDasharray, fit);
    const [, b, a] = keyIcons(host);
    assert.equal(b.style.borderTopStyle, ib);
    assert.equal(a.style.borderTopStyle, ia);
  };
  dash('base', '4 3', 'none', 'dashed', 'solid');
  dash('fit', 'none', '4 3', 'solid', 'dashed');
  dash(null, 'none', 'none', 'solid', 'solid');
});

test('CH4 defaults are today\'s look', () => {
  const host = drawStub({ rows: ROWS, base: BASE, fit: FIT });
  assert.deepEqual(keyTexts(host), ['Measured', 'Simulation now', 'Simulation, fitted']);
  assert.deepEqual(keyIcons(host).map(i => i.className), ['', 'b', 'a']);
  assert.equal(walk(host, n => n.tag === 'path' && n.style.strokeDasharray !== undefined).length, 0);
  assert.equal(keyIcons(host).filter(i => i.style.borderTopStyle !== undefined).length, 0);
  assert.equal(paths(host, 'meas').length, 3); assert.equal(paths(host, 'sima').length, 3);
});

test('createLadder: a chip drawn, cleared and drawn again shows again (lead decision 82)', (t) => {
  fakeDocument(t);
  const el = new FakeEl('div');
  const lad = FC.createLadder(el);
  const S = { co2Lim: 1200, rules: { fanOn: 1000, fanOff: 800, co2Safety: false, co2SafetyAt: 3000 } };
  const X = { air: { lvl: 'info', icon: '▲', text: 'Purging' } };
  const chip = () => allOf(el).find(e => e.className === 'chip');
  const shown = () => chip().children.map(c => c.textContent);
  lad.draw(S, 900, X); assert.deepEqual(shown(), ['▲', 'Purging']);
  lad.draw(S, 900, null); assert.deepEqual(shown(), []);
  lad.draw(S, 900, X); assert.deepEqual(shown(), ['▲', 'Purging']);
});

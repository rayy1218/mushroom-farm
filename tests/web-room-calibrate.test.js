// web/room-calibrate.js helpers (docs/contracts/web.md 3.6, 3.11).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js');
require('../web/room-tabs.js');
require('../web/room-calibrate.js');
const H = globalThis.FarmRoomTabs.get('calibrate').helpers;
const SIM = globalThis.ClimateSim, CAL = globalThis.ClimateCalib;
const RD = (t, over) => ({ room_id: 1, t, T: 25, RH: 88, CO2: 900, t_out: 31, rh_out: 60, ac_mode: 'cool', ac_setpoint: 24, fog: 1,
  air: 0, lights: 1, circ: 0, power_w: null, kwh: null, ac_fan: 'auto', stage: 'fruiting', core: 27, ...over });
const EQ = { room_id: 1, saved_at: 5, ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 };
const EQ7 = { ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 };

test('CB1 registration', () => {
  const tab = globalThis.FarmRoomTabs.get('calibrate');
  assert.equal(typeof tab.mount, 'function');
  assert.equal(typeof tab.unmount, 'function');
  assert.deepEqual(Object.keys(tab.helpers).sort(), ['farmMidnight', 'farmDate', 'defaultRange', 'rangeQuery', 'logFromReadings', 'historyGaps',
    'envBaseFor', 'paramsOfRun', 'startParams', 'defaultBlocks', 'parseBlocks', 'fitBlockReason', 'calibBody', 'sameMachines', 'staleText',
    'pairSeries', 'differences', 'differenceLines', 'predictedRows', 'realRows', 'fitVerdict', 'fitRows', 'fitSummary', 'fitFigure'].sort());
  assert.doesNotThrow(() => tab.unmount());
});

test('CB2 farm days', () => {
  assert.equal(H.farmMidnight('2026-10-08'), 1791388800);
  assert.equal(H.farmDate(1791450000), '2026-10-08');
  assert.equal(H.farmDate(1791388800), '2026-10-08');
  assert.equal(H.farmDate(1791388799), '2026-10-07');
  for (const bad of ['', 'x', '2026-13-01', '2026-02-30']) assert.equal(H.farmMidnight(bad), null);
});

test('CB3 range', () => {
  assert.deepEqual(H.defaultRange(1791450000), { from: '2026-10-07', to: '2026-10-08' });
  assert.deepEqual(H.rangeQuery('2026-10-07', '2026-10-08', 1791450000), { from: 1791302400, to: 1791450000, days: 2 });
  const w = H.rangeQuery('2026-10-02', '2026-10-08', 1791475199);
  assert.equal(w.days, 7); assert.equal(w.to - w.from, 604799);
  assert.deepEqual(H.rangeQuery('2026-10-01', '2026-10-08', 1791475199), { error: 'Pick at most 7 days.' });
  assert.deepEqual(H.rangeQuery('2026-10-08', '2026-10-07', 1791450000), { error: 'The first day is after the last day.' });
  assert.deepEqual(H.rangeQuery('', '2026-10-08', 1791450000), { error: 'Pick the first and the last day.' });
  assert.deepEqual(H.rangeQuery('2026-10-09', '2026-10-09', 1791450000), { error: 'The first day is in the future.' });
});

test('CB4 logFromReadings', () => {
  const rows = H.logFromReadings([RD(1791450030, { air: 1 }), RD(1791450000, { CO2: 20000, ac_mode: 'off', ac_setpoint: null, ac_fan: null, stage: null })]);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { t: 0, hour: 17, T: 25, RH: 88, CO2: null, tOut: 31, rhOut: 60, air: 0, fog: 1, lights: 1, circ: 0,
    acPower: 0, acMode: null, acSet: null, acFan: null, stage: null });
  assert.equal(rows[1].t, 30); assert.equal(rows[1].hour, 17 + 30 / 3600); assert.equal(rows[1].CO2, 900); assert.equal(rows[1].air, 1);
  assert.equal(rows[1].acPower, 1); assert.equal(rows[1].acMode, 'cool'); assert.equal(rows[1].acSet, 24);
  assert.equal(rows[1].acFan, 'auto'); assert.equal(rows[1].stage, 'fruiting');
  assert.equal(Object.keys(rows[1]).length, 16);
  assert.equal(H.logFromReadings([RD(1791450000, { T: -20 })])[0].T, null);
  const env = H.envBaseFor({ volume: 60, live: null }, 1000, rows, null, 1800);
  assert.doesNotThrow(() => CAL.replay(rows, env, CAL.paramsOf(SIM.DEFAULT_ENV)));
});

test('CB5 historyGaps', () => {
  const at = ts => ts.map(t => ({ t }));
  assert.equal(H.historyGaps(at([0, 30, 700, 730, 2000])), 2);
  assert.equal(H.historyGaps(at([5])), 0);
  assert.equal(H.historyGaps([]), 0);
  assert.equal(H.historyGaps(at([0, 600])), 0);
});

test('CB6 envBaseFor', t => {
  const room = { volume: 80, live: { stage: 'pinning' } };
  const e = H.envBaseFor(room, 1500, [{ stage: null }, { stage: 'rest' }], null, 900);
  assert.deepEqual(e, { ...structuredClone(SIM.DEFAULT_ENV), airM3h: 900, room: { volume: 80 }, blocks: 1500, blockStage: 'rest' });
  assert.equal('plant' in e, false);
  assert.equal(H.envBaseFor(room, 1500, [{ stage: null }], null, 900).blockStage, 'pinning');
  assert.equal(H.envBaseFor({ volume: 80, live: null }, 1500, [], null, 900).blockStage, 'fruiting');
  const real = globalThis.ClimateEquipment.plantOf;
  globalThis.ClimateEquipment.plantOf = (eq, r) => ({ ac: { capW: 1 }, args: [eq, r] });
  t.after(() => { globalThis.ClimateEquipment.plantOf = real; });
  assert.deepEqual(H.envBaseFor(room, 1500, [], EQ, 900).plant.args, [EQ, { volume: 80, calib: {} }]);
});

test('CB7 start values', () => {
  assert.deepEqual(H.paramsOfRun({ ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41 }), { ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41 });
  const e = structuredClone(SIM.DEFAULT_ENV);
  assert.deepEqual(H.startParams([{ ua: 1, inf_ach: 1, moist_buffer: 1, co2_per_block: 1, applied: false },
    { ua: 100, inf_ach: 0.5, moist_buffer: 2, co2_per_block: 50, applied: true }], e), { ua: 100, infAch: 0.5, moistBuffer: 2, co2PerBlock: 50 });
  assert.deepEqual(H.startParams([], e), CAL.paramsOf(e));
});

test('CB8 blocks', () => {
  assert.equal(H.defaultBlocks([{ blocks: 1200 }, { blocks: 300 }], null), 1500);
  assert.equal(H.defaultBlocks([], { blocks: 2000 }), 2000);
  assert.equal(H.defaultBlocks([{ blocks: 0 }], { blocks: null }), null);
  assert.equal(H.defaultBlocks([], null), null);
  assert.equal(H.parseBlocks('1500'), 1500); assert.equal(H.parseBlocks(' 7 '), 7); assert.equal(H.parseBlocks('200000'), 200000);
  for (const bad of ['', '0', '12.5', '200001', 'x']) assert.equal(H.parseBlocks(bad), null);
});

test('CB9 calibBody', () => {
  const fit = { params: { ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41.7 }, result: { rmse: { T: 0.21, RH: NaN, CO2: 38 } } };
  const rows = new Array(720).fill({});
  assert.deepEqual(H.calibBody(fit, rows, 'history', { from: 100, to: 200 }, EQ), { ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41.7,
    rmse_t: 0.21, rmse_rh: null, rmse_co2: 38, log_rows: 720, source: 'history', log_from: 100, log_to: 200, equipment: EQ7 });
  const c = H.calibBody(fit, rows, 'csv', null, null);
  assert.equal('log_from' in c, false); assert.equal('log_to' in c, false);
  const nan = H.calibBody({ ...fit, result: { rmse: { T: NaN, RH: 1, CO2: NaN } } }, rows, 'csv', null, null);
  assert.equal(nan.rmse_t, null); assert.equal(nan.rmse_co2, null);
  assert.equal(c.source, 'csv'); assert.equal(c.equipment, null);
});

test('CB10 sameMachines', () => {
  assert.equal(H.sameMachines(null, null), true);
  assert.equal(H.sameMachines(null, EQ), false);
  assert.equal(H.sameMachines(EQ7, EQ), true);
  assert.equal(H.sameMachines(EQ7, { ...EQ, air_m3h: 1800 }), false);
  assert.equal(H.staleText({ run_at: 1791450000 }), 'The applied calibration (2026-10-08) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.');
});

test('CB11 pairs', () => {
  const start = 1791388800;
  const series = [0, 1, 2].map(h => ({ h, stage: 'fruiting', flush: 1, T: 25, RH: 88, CO2: 900, core: 27, kwh: 1 }));
  const buckets = [RD(start, { T: 25.5, RH: 86, CO2: 930 }), RD(start + 7200, { T: 24.5, RH: 90, CO2: 870, stage: 'rest' })];
  const pairs = H.pairSeries(series, buckets, start);
  assert.deepEqual(pairs.map(p => p.h), [0, 2]);
  assert.deepEqual(H.differences(pairs), { T: 0.5, RH: 2, CO2: 30, hours: 2, stageShare: 50 });
  const nostage = H.pairSeries(series, [RD(start, { stage: null }), RD(start + 7200, { stage: 'fruiting' })], start);
  assert.equal(H.differences(nostage).stageShare, 100);
  const d0 = H.differences([]);
  assert.equal(d0.hours, 0); assert.equal(d0.stageShare, null);
});

test('CB12 lines', () => {
  assert.deepEqual(H.differenceLines({ T: 0.5, RH: 2, CO2: 30, hours: 2, stageShare: 50 }),
    ['Average difference: 0.5 °C, RH 2.0 %, CO₂ 30 ppm over 2 hours.', 'Stage agreement: 50 % of hours', 'A big gap means: calibrate again.']);
  assert.deepEqual(H.differenceLines({ T: 0.5, RH: 2, CO2: 30, hours: 2, stageShare: null }).length, 2);
  assert.deepEqual(H.differenceLines({ T: NaN, RH: NaN, CO2: NaN, hours: 0, stageShare: null }), ['No real readings for this run yet.']);
  const series = [0, 1, 2].map(h => ({ h, T: 25, RH: 88, CO2: 900 }));
  assert.deepEqual(H.predictedRows(series)[2], { t: 7200, T: 25, RH: 88, CO2: 900 });
  assert.equal(H.realRows([RD(1000), RD(8200)], 1000)[1].t, 7200);
});

test('CB14 fitBlockReason: the visible reason a disabled Fit gives', () => {
  const ok = { loaded: true, blocks: 600, hasRows: true, hasEnv: true, source: 'history', readings: 700 };
  assert.equal(H.fitBlockReason(ok), '');
  assert.equal(H.fitBlockReason({ ...ok, loaded: false }), 'Loading this room…');
  assert.equal(H.fitBlockReason({ ...ok, blocks: null }), 'Enter the number of blocks in the room during the log.');
  assert.match(H.fitBlockReason({ ...ok, blocks: null, hasRows: false, readings: 90 }), /^Needs at least 1 hour/);   // the readings come first: they take time
  assert.equal(H.fitBlockReason({ ...ok, hasRows: false, readings: 90 }), 'Needs at least 1 hour of readings. Come back in about 15 min.');
  assert.equal(H.fitBlockReason({ ...ok, hasRows: false, readings: 0 }), 'Needs at least 1 hour of readings. Come back in about 60 min.');
  assert.equal(H.fitBlockReason({ ...ok, hasRows: false, readings: 90, today: false }), 'Pick days with at least 1 hour of readings.');
  assert.match(H.fitBlockReason({ ...ok, hasRows: false, readings: 90, today: true }), /Come back in about 15 min/);
  assert.equal(H.fitBlockReason({ ...ok, hasRows: false, readings: null }), 'Load the room history first.');
  assert.equal(H.fitBlockReason({ ...ok, hasRows: false, source: 'csv', readings: null }), 'Load a CSV log first.');
  assert.equal(H.fitBlockReason({ ...ok, hasEnv: false }), 'The room values are not ready yet.');
});

test('CB13 a late reply of an unmounted mount never touches the next mount', async () => {
  const stubs = {};
  const stub = () => ({ value: '', textContent: '', hidden: false, disabled: false, dataset: {}, children: [], classList: { add() {} }, addEventListener() {},
    setAttribute() {}, replaceChildren() {}, append() {}, after() {}, remove() {} });
  const el = { set innerHTML(v) {}, querySelector: s => (stubs[s] ||= stub()), querySelectorAll: () => [] };
  globalThis.document = { createElement: () => stub() };
  const FA = globalThis.FarmApi, saved = { ...FA };
  const late = {};
  const slow = new Promise((_, rej) => { late.fail = () => rej(new Error('OLD MOUNT')); });
  let call = 0;
  Object.assign(FA, {
    getMix: () => (++call === 1 ? slow : Promise.resolve([])), listCalibrations: async () => [], getEquipment: async () => null,
    getSettings: async () => ({ airM3h: 1800 }), listSimulations: async () => [],
  });
  const tab = globalThis.FarmRoomTabs.get('calibrate'), ctx = { id: 1, params: {}, room: () => ({ volume: 60, live: null }), on() {} };
  try {
    const first = tab.mount(el, ctx);
    tab.unmount();
    await tab.mount(el, ctx);
    const msgOf = () => (stubs['#calMsg'] || { textContent: '' }).textContent;
    const before = msgOf();
    late.fail(); await first;
    assert.equal(msgOf(), before);
    assert.notEqual(msgOf(), 'OLD MOUNT');
  } finally { Object.assign(FA, saved); delete globalThis.document; tab.unmount(); }
});

// ---- a tiny DOM, enough to build the charts and look at them ----
class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.text = ''; this.className = ''; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k]; }
  append(...kids) { for (const k of kids) this.children.push(typeof k === 'string' ? Object.assign(new El('#text'), { text: k }) : k); }
  appendChild(k) { this.children.push(k); return k; }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  insertBefore(k, ref) { const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, k); return k; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  set textContent(t) { this.text = String(t); this.children = []; }
  get textContent() { return this.text + this.children.map(c => c.textContent).join(''); }
}
const walk = (e, fn) => { fn(e); for (const c of e.children) walk(c, fn); };
const all = (e, pred) => { const out = []; walk(e, x => { if (pred(x)) out.push(x); }); return out; };
const withFakeDom = fn => {
  globalThis.document = { createElement: t => new El(t), createElementNS: (ns, t) => new El(t) };
  try { return fn(); } finally { delete globalThis.document; }
};
const cls = (e, c) => (e.attrs.class || e.className || '').split(/\s+/).includes(c);

test('PL8 fitVerdict thresholds (decision 103)', () => {
  const w = (k, v) => H.fitVerdict(k, v).word;
  assert.deepEqual([w('T', 0.5), w('T', 0.51), w('T', 1.0), w('T', 1.01)], ['Good', 'Fair', 'Fair', 'Poor']);
  assert.deepEqual([w('RH', 3), w('RH', 3.1), w('RH', 6), w('RH', 6.1)], ['Good', 'Fair', 'Fair', 'Poor']);
  assert.deepEqual([w('CO2', 80), w('CO2', 81), w('CO2', 150), w('CO2', 151)], ['Good', 'Fair', 'Fair', 'Poor']);
  assert.equal(H.fitVerdict('T', 0.2).lvl, 'good');
  assert.equal(H.fitVerdict('T', 2).lvl, 'serious');
  assert.equal(H.fitVerdict('T', NaN), null);
  assert.equal(H.fitVerdict('x', 1), null);
});

test('PL9 fitRows and the summary in words', () => {
  const rows = H.fitRows({ T: 2, RH: 9, CO2: 300 }, { T: 0.3, RH: 2, CO2: 60 });
  assert.deepEqual(rows.map(r => [r.kind, r.before, r.after, r.verdict.word]), [['T', 2, 0.3, 'Good'], ['RH', 9, 2, 'Good'], ['CO2', 300, 60, 'Good']]);
  assert.equal(H.fitSummary(rows), 'The fitted room follows your readings closely.');
  assert.match(H.fitSummary(H.fitRows({ T: 2, RH: 9, CO2: 300 }, { T: 0.8, RH: 2, CO2: 60 })), /but temperature could be closer\.$/);
  assert.match(H.fitSummary(H.fitRows({ T: 2, RH: 9, CO2: 300 }, { T: 3, RH: 2, CO2: 200 })), /differs from your readings in temperature and CO₂\./);
  assert.match(H.fitSummary(H.fitRows({}, {})), /not enough readings/);
});

test('PL10 the fit quality figure is labelled and has a row per measurement', () => withFakeDom(() => {
  const fig = H.fitFigure({ T: 2, RH: 9, CO2: 300 }, { T: 0.3, RH: 2, CO2: 60 });
  assert.ok(cls(fig, 'fit-quality'));
  const svg = all(fig, e => e.tag === 'svg')[0];
  assert.equal(svg.attrs.role, 'img');
  assert.match(svg.attrs['aria-label'], /Temperature: error 2\.00 °C before, 0\.30 °C after, Good.*The fitted room follows your readings closely\./);
  assert.equal(all(svg, e => cls(e, 'plan-b-after')).length, 3);
  const texts = all(svg, e => e.tag === 'text').map(e => e.textContent);
  assert.equal(texts.filter(t => t === 'Good').length, 3);
}));

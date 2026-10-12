// web/room-simulate.js helpers (docs/contracts/web.md 3.7, 3.10).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js');
require('../web/room-tabs.js');
require('../web/room-simulate.js');
const H = globalThis.FarmRoomTabs.get('simulate').helpers;
const CC = globalThis.ClimateController;
const ROOM = { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 1791446400, archived_at: null, live: null };
const CAL = { id: 3, room_id: 1, run_at: 1790827200, ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41, rmse_t: 0.21,
  rmse_rh: null, rmse_co2: 38, log_rows: 5760, applied_at: 1790827230, applied: true, source: 'history', log_from: 1, log_to: 2, equipment: null };
const EQUIP = { room_id: 1, saved_at: 1791450950, ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 };
const S = { ...CC.defaultSettings(), airM3h: 900 };
const DRAFT = [{ crop: 'oyster', blocks: 1200, co2_per_block: null }, { crop: 'pink', blocks: 300, co2_per_block: 55 }];
const data = over => ({ room: ROOM, settings: S, draft: DRAFT, calibrations: [{ ...CAL, id: 2, applied: false }, CAL], equipment: null,
  region: 'my-lowland', tariff: 0.57, emptyBelow: 50, ...over });

test('SM1 registration', () => {
  const tab = globalThis.FarmRoomTabs.get('simulate');
  assert.equal(typeof tab.mount, 'function');
  assert.equal(typeof tab.unmount, 'function');
  assert.deepEqual(Object.keys(tab.helpers).sort(), ['appliedCalib', 'availableCrops', 'bulletFigure', 'bulletVerdict', 'bulletZones', 'clampBlocks', 'clampCo2', 'cycleDays', 'cycleFigure', 'cycleSummary', 'machinesText', 'progressText',
    'regionText', 'runBlockReason', 'runInputs', 'runRowTexts', 'sameMix', 'seriesPoints', 'stageRows', 'toCapacityMix', 'toMixRows']);
  assert.equal(typeof globalThis.document, 'undefined');
  assert.doesNotThrow(() => tab.unmount());
});

test('SM2 mix', () => {
  assert.deepEqual(H.toCapacityMix(DRAFT), [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2PerBlock: 55 }]);
  assert.deepEqual(H.toMixRows(H.toCapacityMix(DRAFT)), DRAFT);
  const a = H.toCapacityMix(DRAFT);
  assert.equal(H.sameMix(a, H.toCapacityMix(DRAFT)), true);
  assert.equal(H.sameMix(a, a.slice(0, 1)), false);
  assert.equal(H.sameMix(a, [{ ...a[0], crop: 'pink' }, a[1]]), false);
  assert.equal(H.sameMix(a, [{ ...a[0], blocks: 1201 }, a[1]]), false);
  assert.equal(H.sameMix(a, [a[0], { ...a[1], co2PerBlock: 56 }]), false);
  assert.equal(H.sameMix([{ crop: 'oyster', blocks: 1 }], [{ crop: 'oyster', blocks: 1 }]), true);
  assert.equal(H.sameMix([{ crop: 'oyster', blocks: 1 }], [{ crop: 'oyster', blocks: 1, co2PerBlock: 55 }]), false);
  assert.equal(H.sameMix(null, a), false);
  assert.equal(H.sameMix(a, undefined), false);
  assert.equal(H.sameMix({}, {}), false);
  const before = JSON.stringify(DRAFT);
  H.toCapacityMix(DRAFT);
  assert.equal(JSON.stringify(DRAFT), before);
});

test('SM3 appliedCalib', () => {
  assert.equal(H.appliedCalib([{ ...CAL, applied: false }]), null);
  assert.equal(H.appliedCalib([]), null);
  assert.deepEqual(H.appliedCalib([CAL]), { ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41, rmse: { T: 0.21, RH: null, CO2: 38 },
    date: '2026-10-01T04:00:00.000Z' });
});

test('SM4 runInputs without machines', () => {
  const r = H.runInputs('cycle', data());
  assert.deepEqual(r.room, { name: 'Room 1', volume: 60, airM3h: 900, calib: H.appliedCalib([CAL]) });
  assert.equal('plant' in r.room, false);
  assert.deepEqual(r.mix, H.toCapacityMix(DRAFT));
  assert.equal(r.settings, S);
  assert.equal(r.region, 'my-lowland');
  assert.equal(r.tariff, 0.57);
  assert.deepEqual(r.inputs, { mix: DRAFT, settings: S, region: 'my-lowland', tariff: 0.57, volume: 60,
    calibration: { id: 3, ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41 }, empty_below: null, equipment: null });
  assert.deepEqual(Object.keys(r.inputs.calibration), ['id', 'ua', 'inf_ach', 'moist_buffer', 'co2_per_block']);
  assert.equal(H.runInputs('capacity', data()).inputs.empty_below, 50);
  const none = H.runInputs('cycle', data({ calibrations: [{ ...CAL, applied: false }] }));
  assert.equal(none.room.calib, null);
  assert.equal(none.inputs.calibration, null);
});

test('SM5 runInputs with machines', t => {
  const real = ClimateEquipment.plantOf;
  ClimateEquipment.plantOf = (eq, room) => ({ ac: { capW: 1 }, args: [eq, room] });
  t.after(() => { ClimateEquipment.plantOf = real; });
  const r = H.runInputs('cycle', data({ equipment: EQUIP }));
  assert.equal(r.room.plant.args[0], EQUIP);
  assert.deepEqual(r.room.plant.args[1], { volume: 60, calib: H.appliedCalib([CAL]) });
  assert.deepEqual(r.inputs.equipment, { ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 });
  assert.equal(r.room.airM3h, 900);
});

const seg = (stage, startDay, t, x) => ({ stage, flush: 1, startDay, days: 1, hours: 24, targets: t, lowRhMin: 0, wet: 0, ...x });
const RES = { verdict: 'ok', targets: { spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' },
  inputs: { farmType: 'full', days: { spawn: 1, pinning: 1, fruiting: 1, rest: 1 }, flushes: 1, region: 'my-lowland', blocks: 2000, co2PerBlock: 45, tariff: 0.57, warnings: [] },
  stages: [
    seg('spawn', 0, { spT: 24, spRH: 70, co2Lim: 5000, coreMax: 32 }, { inT: 100, rhOk: 3.4, co2Below: 100, maxCore: 28.2, alarms: {}, kwh: 10.4, rm: 5.93, fails: [], pass: true }),
    seg('fruiting', 1, { spT: 25, spRH: 88, co2Lim: 1000, coreMax: 32 }, { inT: 93.5, rhOk: 99.1, co2Below: 100, maxCore: 27.4, alarms: { rhHi: 2 }, kwh: 12.6, rm: 7.18, fails: ['temperature too high'], pass: false }),
  ],
  totals: { days: 2, kwh: 23, rm: 13.11, rmPerBlock: 0.006555, pass: false },
  series: Array.from({ length: 48 }, (_, h) => ({ h, stage: h < 24 ? 'spawn' : 'fruiting', flush: 1, T: 24, RH: 80, CO2: 900, core: 27, kwh: 0.5 })) };

test('SM6 cycle result', () => {
  assert.deepEqual(H.cycleSummary(RES), { chip: { lvl: 'warning', icon: '✕', text: '1 stage(s) fail' },
    line: '2 days · 1 flush · 23 kWh · RM 13.11 · RM 0.01 per block' });
  assert.ok(H.cycleSummary({ ...RES, totals: { ...RES.totals, days: 1 }, inputs: { ...RES.inputs, flushes: 2 } }).line.startsWith('1 day · 2 flushes · '));
  const pass = { ...RES, stages: RES.stages.map(s => ({ ...s, pass: true, fails: [] })) };
  assert.deepEqual(H.cycleSummary(pass).chip, { lvl: 'good', icon: '✓', text: 'all stages pass' });
  assert.deepEqual(H.cycleSummary({ verdict: 'impossible', why: 'Add at least one crop with blocks.' }),
    { chip: { lvl: 'warning', icon: '✕', text: 'impossible' }, line: 'Add at least one crop with blocks.' });
  assert.deepEqual(H.stageRows(RES), [
    ['Spawn run', '1', '1', '100.0', 'not judged', 'not judged', '28.2', '–', '10', '5.93', 'Pass'],
    ['Fruiting', '1', '1', '93.5', '99.1', '100.0', '27.4', 'rhHi ×2', '13', '7.18', 'temperature too high']]);
  const pts = H.seriesPoints(RES);
  assert.equal(pts.length, 48);
  const r5 = CC.defaultRules(5000), r1 = CC.defaultRules(1000);
  assert.deepEqual(pts[0], { t: 0, T: 24, RH: 80, C: 900, core: 27, spT: 24, spRH: 70, co2Lim: 5000, fanOff: r5.fanOff, fanOn: r5.fanOn });
  assert.equal(pts[30].fanOff, r1.fanOff);
  assert.equal(pts[30].fanOn, r1.fanOn);
  assert.equal(pts[30].t, 108000);
  assert.equal(pts[30].spT, 25);
  assert.equal(pts[30].spRH, 88);
  assert.equal(pts[30].co2Lim, 1000);
  const two = { ...RES, stages: [...RES.stages, seg('fruiting', 2, { spT: 22, spRH: 91, co2Lim: 800, coreMax: 32 }, { flush: 2 })],
    series: [...RES.series, { h: 48, stage: 'fruiting', flush: 2, T: 22, RH: 90, CO2: 700, core: 25, kwh: 0.5 }] };
  const last = H.seriesPoints(two)[48];
  assert.equal(last.spT, 22);
  assert.equal(last.spRH, 91);
  assert.equal(last.co2Lim, 800);
  assert.equal(H.seriesPoints(two)[30].spT, 25);
});

const INFO = { id: 12, room_id: 1, created_at: 1791450900, kind: 'cycle', verdict: 'pass', blocks: 2000, days: 83, kwh: 1093.4, rm: 623.2,
  utilisation: null, real_start: null, note: null, inputs: { mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }] } };

test('SM7 runRowTexts', () => {
  assert.deepEqual(H.runRowTexts(INFO), { run: 'Cycle · 2026-10-08 17:15:00', mix: '2000 Grey oyster',
    chip: { lvl: 'good', icon: '✓', text: 'Passes' }, energy: 'RM 0.31 per block', note: '' });
  const two = { ...INFO, inputs: { mix: [{ crop: 'oyster', blocks: 1200, co2_per_block: null }, { crop: 'pink', blocks: 0, co2_per_block: null }, { crop: 'pink', blocks: 300, co2_per_block: 55 }] } };
  assert.equal(H.runRowTexts(two).mix, `1200 ${CC.CROPS.oyster.name} + 300 ${CC.CROPS.pink.name}`);
  assert.equal(H.runRowTexts({ ...INFO, inputs: { mix: [] } }).mix, '–');
  assert.equal(H.runRowTexts({ ...INFO, kind: 'capacity', verdict: 'good', utilisation: 74 }).energy, '74 %');
  assert.equal(H.runRowTexts({ ...INFO, kind: 'equipment', verdict: 'enough', rm: 5, utilisation: 3 }).energy, '–');
  assert.equal(H.runRowTexts({ ...INFO, verdict: 'impossible', rm: null }).energy, '–');
  assert.equal(H.runRowTexts({ ...INFO, blocks: 0, rm: 5 }).energy, '–');
  assert.equal(H.runRowTexts({ ...INFO, note: 'hello' }).note, 'hello');
  assert.equal(H.runRowTexts({ ...INFO, kind: 'equipment', verdict: 'enough' }).run.startsWith('Equipment · '), true);
  assert.equal(H.runRowTexts({ ...INFO, kind: 'capacity', verdict: 'good' }).run.startsWith('Capacity · '), true);
  const chip = (kind, verdict) => H.runRowTexts({ ...INFO, kind, verdict }).chip;
  const W = text => ({ lvl: 'warning', icon: '✕', text }), G = text => ({ lvl: 'good', icon: '✓', text }), I = text => ({ lvl: 'info', icon: '●', text });
  assert.deepEqual(chip('cycle', 'pass'), G('Passes'));
  assert.deepEqual(chip('cycle', 'fail'), W('Fails'));
  assert.deepEqual(chip('capacity', 'good'), G('Good'));
  assert.deepEqual(chip('capacity', 'tight'), I('Tight'));
  assert.deepEqual(chip('capacity', 'too-dense'), W('Too many blocks'));
  assert.deepEqual(chip('capacity', 'too-empty'), I('Too few blocks'));
  assert.deepEqual(chip('equipment', 'enough'), G('Enough'));
  assert.deepEqual(chip('equipment', 'too-small'), W('Too small'));
  assert.deepEqual(chip('equipment', 'too-big'), W('Too big'));
  assert.deepEqual(chip('equipment', 'oversized'), I('Bigger than needed'));
  for (const k of ['cycle', 'capacity', 'equipment']) assert.deepEqual(chip(k, 'impossible'), W('Impossible'));
  assert.deepEqual(chip('cycle', 'xyz'), I('xyz'));
  assert.deepEqual(chip('capacity', 'xyz'), I('xyz'));
  assert.deepEqual(chip('equipment', 'xyz'), I('xyz'));
});

test('SM8 progressText', () => {
  assert.equal(H.progressText({ day: 3, days: 83, stage: 'spawn', flush: 1 }), 'Day 3 of 83 · Spawn run');
  assert.equal(H.progressText({ day: 22, days: 83, stage: 'pinning', flush: 1 }), 'Day 22 of 83 · Pinning');
  assert.equal(H.progressText({ day: 40, days: 83, stage: 'fruiting', flush: 2 }), 'Day 40 of 83 · Fruiting · flush 2');
  assert.equal(H.progressText({ day: 50, days: 83, stage: 'rest', flush: 2 }), 'Day 50 of 83 · Rest between flushes · flush 2');
  assert.equal(H.progressText({ runs: 3, blocks: 1600, pass: true }), 'Simulation run 3: 1,600 blocks, pass…');
  assert.equal(H.progressText({ runs: 3, blocks: 1600, pass: false }), 'Simulation run 3: 1,600 blocks, fail…');
});

test('SM9 machinesText', () => {
  assert.equal(H.machinesText(null), 'Typical machines');
  assert.equal(H.machinesText({ ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 }),
    '2.5 hp aircond · 3 L/h fogger · 1,800 m³/h air exchange · Typical walls');
  assert.equal(H.machinesText({ ...EQUIP, ac_units: 2 }), '2 × 2.5 hp aircond · 3 L/h fogger · 1,200 m³/h air exchange · PU panel 50 mm walls and roof');
  assert.ok(H.machinesText({ ...EQUIP, walls: 'brick115', roof: 'zinc' }).endsWith('Brick 115 mm, plastered walls, Zinc sheet, no insulation roof'));
});

test('SM10 inputs', () => {
  assert.equal(H.clampBlocks('12.6'), 13);
  assert.equal(H.clampBlocks('-5'), 0);
  assert.equal(H.clampBlocks('300000'), 200000);
  assert.equal(H.clampBlocks(''), 0);
  assert.equal(H.clampBlocks('abc'), 0);
  assert.equal(H.clampCo2(''), null);
  assert.equal(H.clampCo2('0'), 1);
  assert.equal(H.clampCo2('55.4'), 55);
  assert.equal(H.clampCo2('5000'), 1000);
  assert.equal(H.clampCo2('x'), null);
  assert.equal(H.regionText('my-lowland'), 'Lowland Peninsular Malaysia');
  assert.equal(H.regionText('x'), 'x');
});

// ---- mount races (web.md 3.9): a tiny DOM stub, installed only inside these tests ----
class FakeEl {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.className = ''; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.isConnected = true; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  append(...c) { this.children.push(...c.filter(x => typeof x !== 'string')); }
  replaceChildren(...c) { this.children = []; this.append(...c); }
  addEventListener() {}
  get firstElementChild() { return this.children[0]; }
  get lastElementChild() { return this.children[this.children.length - 1]; }
  matches(part) {
    if (part[0] === '#') return this.attrs.id === part.slice(1);
    if (part[0] === '[') { const m = /^\[([\w-]+)="(.*)"\]$/.exec(part); return this.attrs[m[1]] === m[2]; }
    return this.tagName === part.toUpperCase();
  }
  all(chain, out) {
    for (const c of this.children) {
      if (c.matches(chain[0])) { if (chain.length === 1) out.push(c); else c.all(chain.slice(1), out); }
      c.all(chain, out);
    }
    return out;
  }
  querySelectorAll(sel) { return sel.split(',').flatMap(s => this.all(s.trim().split(/\s+/), [])); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
const withDom = (t, mixById) => {
  globalThis.document = { createElement: tag => new FakeEl(tag) };
  const api = globalThis.FarmApi, old = { ...api }, oldCard = globalThis.FarmEquipmentCard;
  const cards = { mounted: 0 };
  globalThis.FarmEquipmentCard = { mount: () => { cards.mounted++; return { unmount() {} }; }, renderReport() {} };
  Object.assign(api, { getMix: id => mixById[id], listCalibrations: async () => [], getSettings: async () => S,
    listSettingsHistory: async () => [{ id: 1, saved_at: 1791450000 }], getEquipment: async () => null, listSimulations: async () => [] });
  t.after(() => { delete globalThis.document; Object.assign(api, old); globalThis.FarmEquipmentCard = oldCard; if (!oldCard) delete globalThis.FarmEquipmentCard; });
  const tab = globalThis.FarmRoomTabs.get('simulate');
  t.after(() => tab.unmount());
  const ctx = id => ({ id, params: {}, room: () => ({ ...ROOM, id }), on: () => () => {} });
  return { tab, ctx, cards };
};
const later = () => new Promise(r => setTimeout(r, 20));

test('SM11 mounting twice on the same element makes one machines card', async t => {
  const { tab, ctx, cards } = withDom(t, { 1: Promise.resolve([]) });
  const el = new FakeEl('div');
  const p1 = tab.mount(el, ctx(1)), p2 = tab.mount(el, ctx(1));
  await Promise.all([p1, p2]); await later();
  assert.equal(cards.mounted, 1);
});

test('SM12 a slow load of an earlier room never paints into the next room', async t => {
  let late;
  const slow = new Promise(r => { late = r; });
  const { tab, ctx } = withDom(t, { 1: slow, 2: Promise.resolve([{ crop: 'pink', blocks: 7, co2_per_block: null }]) });
  const el = new FakeEl('div');
  const p1 = tab.mount(el, ctx(1));
  tab.unmount();
  const p2 = tab.mount(el, ctx(2));
  await p2; await later();
  late([{ crop: 'oyster', blocks: 99, co2_per_block: null }]);
  await p1; await later();
  const rows = el.querySelectorAll('#smMix tbody tr');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].children[1].children[0].value, '7');
});

test('SM30 availableCrops: a crop in another row is not offered again, the row\'s own crop stays', () => {
  const keys = ['oyster', 'pink', 'lionsmane'];
  const mix = [{ crop: 'oyster', blocks: 1 }, { crop: 'pink', blocks: 1 }];
  assert.deepEqual(H.availableCrops(mix, 0, keys), ['oyster', 'lionsmane']);
  assert.deepEqual(H.availableCrops(mix, 1, keys), ['pink', 'lionsmane']);
  assert.deepEqual(H.availableCrops(mix, 2, keys), ['lionsmane']);      // a new row
  assert.deepEqual(H.availableCrops([], 0, keys), keys);
  const dup = [{ crop: 'oyster', blocks: 1 }, { crop: 'oyster', blocks: 2 }];       // a saved mix with the same crop twice
  assert.deepEqual(H.availableCrops(dup, 0, keys), ['oyster', 'pink', 'lionsmane']);
  assert.deepEqual(H.availableCrops(dup, 1, keys), ['oyster', 'pink', 'lionsmane']);
  assert.ok(H.availableCrops([], 0).includes('oyster'));                  // default: every crop a room can grow
});

test('SM31 runBlockReason: no run without a crop and blocks', () => {
  const why = 'Add a mushroom and the number of blocks first.';
  assert.equal(H.runBlockReason([]), why);
  assert.equal(H.runBlockReason([{ crop: 'oyster', blocks: 0, co2_per_block: null }]), why);
  assert.equal(H.runBlockReason(undefined), why);
  assert.equal(H.runBlockReason([{ crop: 'oyster', blocks: 0 }, { crop: 'pink', blocks: 3 }]), '');
  assert.equal(H.runBlockReason([{ crop: 'oyster', blocks: 1 }, { crop: 'oyster', blocks: 3 }]), 'The same mushroom is in the mix twice.');
});

test('SM32 an empty mix: both run buttons are disabled and the reason is shown; a mix with blocks enables them', async t => {
  const { tab, ctx } = withDom(t, { 1: Promise.resolve([]), 2: Promise.resolve([{ crop: 'oyster', blocks: 5, co2_per_block: null }]) });
  const el = new FakeEl('div');
  await tab.mount(el, ctx(1)); await later();
  const help = () => el.querySelector('#smRunHelp');
  assert.equal(el.querySelector('#smCap').disabled, true);
  assert.equal(el.querySelector('#smCycle').disabled, true);
  assert.equal(help().textContent, 'Add a mushroom and the number of blocks first.');
  assert.equal(help().hidden, false);
  await tab.mount(el, ctx(2)); await later();
  assert.equal(el.querySelector('#smCap').disabled, false);
  assert.equal(help().hidden, true);
});

test('SM33 a loaded mix with the same crop twice shows the reason and keeps both selects filled', async t => {
  const { tab, ctx } = withDom(t, { 1: Promise.resolve([{ crop: 'oyster', blocks: 5, co2_per_block: null }, { crop: 'oyster', blocks: 7, co2_per_block: null }]) });
  const el = new FakeEl('div');
  await tab.mount(el, ctx(1)); await later();
  assert.equal(el.querySelector('#smRunHelp').textContent, 'The same mushroom is in the mix twice.');
  assert.equal(el.querySelector('#smCap').disabled, true);
  for (const row of el.querySelectorAll('#smMix tbody tr')) assert.ok(row.children[0].children[0].children.some(o => o.attrs.value === 'oyster'));
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

const capRep = over => ({ verdict: 'good', planned: 2000, utilisation: 55, capacity: { min: 0, max: 3652, hi: 4019, settled: true },
  runs: [{ blocks: 2000, pass: true }, { blocks: 3652, pass: true }, { blocks: 4019, pass: false }], ...over });

test('PL1 bulletZones: the pass window and the largest count tried', () => {
  const z = H.bulletZones(capRep(), 50);
  assert.deepEqual(z.zones.map(x => [x.key, x.label, x.from, x.to]), [['empty', 'Too empty', 0, 1826], ['fits', 'Fits', 1826, 3652], ['full', 'Too full', 3652, 4019]]);
  assert.equal(z.end, 4019); assert.equal(z.plan, 2000); assert.equal(z.efficient, null);
  // the wet limit raises the lower edge; a plan above every run still fits the scale; no "too full" zone when nothing above was tried
  assert.equal(H.bulletZones(capRep({ capacity: { min: 2500, max: 3652, settled: true } }), 50).lo, 2500);
  const big = H.bulletZones(capRep({ planned: 5000 }), 50);
  assert.equal(big.end, 5000);
  const none = H.bulletZones(capRep({ runs: [], planned: 1000 }), 50);
  assert.deepEqual(none.zones.map(x => x.key), ['empty', 'fits']);
  assert.equal(H.bulletZones({ capacity: { min: 0, max: 0 } }, 50), null);
  assert.equal(H.bulletZones({ verdict: 'impossible' }, 50), null);
});

test('PL2 bulletVerdict in words', () => {
  assert.equal(H.bulletVerdict(capRep(), 50), '2,000 blocks fit. The room holds up to 3,652.');
  assert.equal(H.bulletVerdict(capRep({ verdict: 'too-dense', planned: 3900 }), 50), '3,900 blocks are too many. The room holds up to 3,652.');
  assert.match(H.bulletVerdict(capRep({ verdict: 'tight' }), 50), /fit, but only just\. The room holds up to 3,652\. There is no margin/);
  assert.equal(H.bulletVerdict(capRep({ verdict: 'too-empty', why: 'use', planned: 500 }), 50), '500 blocks are too few for this room. It fits 1,826 to 3,652 blocks.');
  assert.match(H.bulletVerdict(capRep({ verdict: 'too-empty', why: 'wet', planned: 500, capacity: { min: 1200, max: 3652, settled: true } }), 50), /below about 1,200 the room gets too wet/);
  assert.match(H.bulletVerdict(capRep({ capacity: { min: 0, max: 3652, settled: false } }), 50), /holds up to about 3,652/);
  assert.equal(H.bulletVerdict({ verdict: 'impossible', why: 'No.' }, 50), 'No.');
});

const cycleRes = () => ({ verdict: 'ok', totals: { days: 3, kwh: 30, rm: 17.1, rmPerBlock: 0.01, pass: true },
  stages: [{ stage: 'spawn', flush: 1, startDay: 0, days: 1, pass: true }, { stage: 'fruiting', flush: 1, startDay: 1, days: 1.5, pass: true }, { stage: 'rest', flush: 1, startDay: 2.5, days: 0.5, pass: false }],
  inputs: { flushes: 1 },
  series: Array.from({ length: 72 }, (_, h) => ({ h, stage: 'fruiting', flush: 1, T: 20, RH: 90, CO2: 800, core: 22, kwh: h < 24 ? 0.5 : h < 48 ? 1 : 0.25 })) });

test('PL3 cycleDays: kWh a day, stage spans, flush days', () => {
  const d = H.cycleDays(cycleRes());
  assert.deepEqual(d.days.map(x => x.kwh), [12, 24, 6]);
  assert.equal(d.maxKwh, 24);
  assert.deepEqual(d.stages.map(x => [x.stage, x.from, x.to, x.pass]), [['spawn', 0, 1, true], ['fruiting', 1, 2.5, true], ['rest', 2.5, 3, false]]);
  assert.deepEqual(d.flushes, [{ flush: 1, day: 1 }]);
  assert.deepEqual(d.total, { days: 3, kwh: 30, rm: 17.1 });
});

test('PL4 the capacity bullet is a labelled figure', () => withFakeDom(() => {
  const fig = H.bulletFigure(capRep(), 50);
  assert.ok(cls(fig, 'cap-bullet'));
  assert.equal(all(fig, e => e.tag === 'h4')[0].textContent, 'Does your plan fit this room?');
  const svg = all(fig, e => e.tag === 'svg')[0];
  assert.equal(svg.attrs.role, 'img');
  assert.match(svg.attrs['aria-label'], /2,000 blocks fit\. The room holds up to 3,652\..*Your plan: 2,000 blocks/);
  const texts = all(svg, e => e.tag === 'text').map(e => e.textContent);
  for (const t of ['Too empty', 'Fits', 'Too full', 'Your plan · 2,000', '1,826', '3,652']) assert.ok(texts.includes(t), t);
  assert.equal(H.bulletFigure({ capacity: { max: 0 } }, 50), null);
}));

test('PL5 the cycle chart is a labelled figure with a row per stage and a bar per day', () => withFakeDom(() => {
  const fig = H.cycleFigure(cycleRes());
  assert.ok(cls(fig, 'cycle-gantt'));
  assert.equal(all(fig, e => e.tag === 'h4')[0].textContent, 'Your grow cycle, day by day');
  const svg = all(fig, e => e.tag === 'svg')[0];
  assert.match(svg.attrs['aria-label'], /3 days with 1 flush and uses 30 kWh, RM 17\.10\. 1 stage does not pass\./);
  assert.equal(all(svg, e => cls(e, 'plan-st')).length, 3);
  assert.equal(all(svg, e => cls(e, 'plan-st-fail')).length, 1);
  assert.equal(all(svg, e => cls(e, 'plan-day')).length, 3);
  const texts = all(svg, e => e.tag === 'text').map(e => e.textContent);
  for (const t of ['Spawn run', 'Fruiting', 'Rest']) assert.ok(texts.includes(t), t);
  assert.ok(!texts.includes('Pinning'));
}));

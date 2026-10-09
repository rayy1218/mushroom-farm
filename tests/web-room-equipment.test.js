// The Your machines card (web/room-equipment.js, C5 3.12): its pure helpers. Contract: docs/contracts/web.md
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js'); require('../cycle.js'); require('../equipment.js');
require('../web/room-equipment.js');
const EQ = globalThis.ClimateEquipment, CC = globalThis.ClimateController;
const { helpers } = globalThis.FarmEquipmentCard;

const room = eq => ({ name: 'Room 1', volume: 60, calib: null, equipment: { ...EQ.DEFAULTS, ...eq } });
const lm = n => [{ crop: 'lionsmane', blocks: n }];
const H = (over = {}) => ({ walls: 1000, sun: 0, airSens: 1000, airLat: 1000, blockSens: 500, blockLat: 500, base: 100, lights: 100, people: 0, fog: 1000, water: 0, acSens: 3000, acLat: 1000, ...over });
const fake = ({ inT = 99, fails = [], wet = 0 } = {}) => {
  const seg = { stage: 'fruiting', flush: 1, startDay: 0, days: 1, hours: 24, targets: { spT: 20, spRH: 90, co2Lim: 1000, coreMax: 30 }, inT, rhOk: 100, lowRhMin: 0, wet, co2Below: 100, maxCore: 22, alarms: {}, kwh: 100, rm: 57, fails, pass: fails.length === 0, heat: H() };
  const series = Array.from({ length: 24 }, (_, h) => ({ h, stage: 'fruiting', flush: 1, T: 20, RH: 90, CO2: 800, core: 22, kwh: 4, heat: Object.fromEntries(Object.entries(H()).map(([k, v]) => [k, v / 24])) }));
  return { verdict: 'ok', stages: [seg], series, totals: { days: 1, kwh: 100, rm: 57, rmPerBlock: 0.057, pass: fails.length === 0 } };
};
const hpOf = p => EQ.AC_SIZES.find(s => s.w === p.ac.capW).hp;
const runner = fn => function* (rm) { yield { day: 1, days: 1, stage: 'fruiting', flush: 1 }; return fake(fn(rm.plant)); };
const down = () => EQ.runCheck(room({ ac_hp: 1 }), lm(2500), { runCycleSteps: runner(p => (hpOf(p) >= 2 ? {} : { fails: ['temperature too high'], inT: 60 })) });
const wetRep = () => EQ.runCheck(room({ ac_hp: 2.5 }), lm(2500), { runCycleSteps: runner(p => (hpOf(p) >= 2 ? { fails: ['humidity near saturation'], wet: 24.1 } : { fails: ['temperature too high'] })) });

// A form with the seven fields, as the card builds it.
function fakeForm() {
  const f = Object.fromEntries(['eqAcHp', 'eqAcUnits', 'eqFog', 'eqAir', 'eqWalls', 'eqRoof', 'eqHeight'].map(id => [id, { value: '' }]));
  return { f, querySelector: sel => f[sel.slice(1)] };
}

test('W1 the card exports its helpers and they read and fill the form', () => {
  const card = globalThis.FarmEquipmentCard;
  assert.equal(typeof card.mount, 'function');
  assert.equal(typeof card.renderReport, 'function');
  for (const k of ['formValues', 'fillForm', 'progressText', 'runRows', 'machineRows', 'heatRows', 'airNote']) assert.equal(typeof card.helpers[k], 'function', k);
  const form = fakeForm();
  helpers.fillForm(form, null);
  assert.deepEqual(helpers.formValues(form), EQ.DEFAULTS);
  const eq = { ac_hp: 2.5, ac_units: 2, fog_lph: 6, air_m3h: 1200, walls: 'pu50', roof: 'zinc', height: 3.5 };
  helpers.fillForm(form, eq);
  assert.deepEqual(Object.keys(helpers.formValues(form)), ['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height']);
  assert.deepEqual(helpers.formValues(form), eq);
});

test('W2 progressText by kind', () => {
  const p = { run: 2, kind: 'ac', ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, day: 3, days: 78 };
  assert.equal(helpers.progressText(p), 'Run 2 · 2.5 hp aircond · day 3 of 78');
  assert.equal(helpers.progressText({ ...p, ac_units: 2 }), 'Run 2 · 2 × 2.5 hp aircond · day 3 of 78');
  assert.equal(helpers.progressText({ ...p, run: 5, kind: 'fogger', fog_lph: 6 }), 'Run 5 · 6 L/h fogger · day 3 of 78');
  assert.equal(helpers.progressText({ ...p, run: 5, kind: 'air', air_m3h: 2400 }), 'Run 5 · 2,400 m³/h air exchange · day 3 of 78');
});

test('W3 runRows: one row per aircond run, with tags', () => {
  const rows = helpers.runRows(down());
  assert.deepEqual(rows.map(r => r.aircond), ['1 hp', '1.5 hp', '2 hp', '2.5 hp']);
  assert.deepEqual(rows.map(r => r.tags), [[], [], ['smallest that works'], ['buy this']]);
  assert.deepEqual(rows.map(r => r.result), ['too small', 'too small', 'holds it', 'holds it']);
  assert.deepEqual([rows[0].fruiting, rows[0].worst, rows[0].kwh, rows[0].rm], ['60 %', 'fruiting 1: 60 %', '0.04', '0.06']);
});

test('W4 machineRows and heatRows', () => {
  const r = wetRep();
  assert.deepEqual(helpers.machineRows(r), [
    { machine: 'Aircond', yours: '2.5 hp', verdict: 'Enough', buy: '' },
    { machine: 'Fogger', yours: '3 L/h', verdict: 'Enough', buy: '' },
    { machine: 'Air exchange', yours: '1,800 m³/h', verdict: 'Enough', buy: '' },
    { machine: 'Walls and roof', yours: 'Typical', verdict: 'Good', buy: '' },
  ]);
  assert.deepEqual(helpers.heatRows(r).map(x => [x.label, x.kwh, x.share]), [
    ['Walls and roof (sun included)', 1, 23], ['Fresh air: heat', 1, 23], ['Fresh air: water', 1, 23], ['Blocks', 1, 23], ['Machines and lights', 0, 4]]);
});

test('W5 airNote', () => {
  assert.equal(helpers.airNote(1800, 1800), '');
  assert.equal(helpers.airNote(null, 900), '');
  assert.equal(helpers.airNote(1200, 900), "The room's settings use 900 m³/h for the air exchange; save your machines to use 1,200 m³/h there too.");
});

// ---------- the card against a small DOM stub ----------
function stubDom() {
  const made = [];
  globalThis.document = {
    createElement() {
      const nodes = {}, el = {
        className: '', innerHTML: '', removed: false, listeners: {},
        querySelector(sel) { return (nodes[sel] ||= { querySelector: el.querySelector, value: '', textContent: '', hidden: false, disabled: false, style: {}, listeners: {}, addEventListener(t, f) { this.listeners[t] = f; }, replaceChildren() {} }); },
        addEventListener(t, f) { this.listeners[t] = f; }, removeEventListener() {}, remove() { this.removed = true; },
      };
      made.push(el);
      return el;
    },
  };
  return made;
}
const hostEl = () => ({ children: [], replaceChildren(...c) { this.children = c; } });
const opts = (over = {}) => ({ id: 1, equipment: null, runInputs: () => ({ settings: { airM3h: 900 } }), onEquipment() {}, onSaved() {}, ...over });

test('W6 the progress bar is the fill span first, then the text span (C5 3.8)', () => {
  const made = stubDom();
  globalThis.FarmEquipmentCard.mount(hostEl(), opts());
  const html = made[0].innerHTML;
  assert.ok(html.indexOf('id="eqProgressBar"') > 0 && html.indexOf('id="eqProgressBar"') < html.indexOf('id="eqProgressText"'));
  assert.match(html, /<div class="run-progress" id="eqProgress" hidden><span id="eqProgressBar"><\/span><span id="eqProgressText"><\/span><\/div>/);
});

test('W7 after a successful save the air note is empty, not repainted from stale settings', async () => {
  const made = stubDom();
  globalThis.FarmApi = { saveEquipment: async eq => ({ room_id: 1, ...eq }) };
  globalThis.FarmUi = { errorText: e => e.message };
  const got = [];
  const host = hostEl();
  const card = globalThis.FarmEquipmentCard.mount(host, opts({ equipment: { ...EQ.DEFAULTS, air_m3h: 1200 }, onEquipment: e => got.push(e) }));
  const sec = made[0];
  assert.match(sec.querySelector('#eqAirNote').textContent, /1,200 m³\/h there too/);
  sec.querySelector('#eqSave').listeners.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(got.length, 1);
  assert.equal(sec.querySelector('#eqAirNote').textContent, '');
  card.unmount();
});

test('W8 a second mount into the same element replaces the first; the first never reports late', async () => {
  const made = stubDom();
  let release;
  globalThis.FarmApi = { saveEquipment: eq => new Promise(r => { release = () => r({ room_id: 1, ...eq }); }) };
  globalThis.FarmUi = { errorText: e => e.message };
  const host = hostEl(), first = [], second = [];
  globalThis.FarmEquipmentCard.mount(host, opts({ onEquipment: e => first.push(e) }));
  made[0].querySelector('#eqSave').listeners.click();
  globalThis.FarmEquipmentCard.mount(host, opts({ onEquipment: e => second.push(e) }));
  assert.equal(made[0].removed, true);
  assert.deepEqual(host.children, [made[1]]);
  release();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual([first.length, second.length], [0, 0]);
});

test('W9 the aircond Buy cell is empty when the recommended size is the own size, set when it differs', () => {
  assert.equal(helpers.machineRows(wetRep())[0].buy, '');
  assert.equal(helpers.machineRows(down())[0].buy, '2.5 hp');
});

test('W10 mount survives settings that are missing, and Check is disabled for an impossible mix', () => {
  const made = stubDom();
  globalThis.FarmApi = {}; globalThis.FarmUi = {};
  const mix = [{ crop: 'lionsmane', blocks: 500 }, { crop: 'pink', blocks: 500 }];
  globalThis.FarmEquipmentCard.mount(hostEl(), opts({ runInputs: () => ({ settings: undefined, mix }) }));
  assert.equal(made[0].querySelector('#eqCheck').disabled, true);
  assert.equal(made[0].querySelector('#eqAirNote').textContent, '');
  const made2 = stubDom();
  globalThis.FarmEquipmentCard.mount(hostEl(), opts({ runInputs: () => ({ settings: undefined, mix: lm(100) }) }));
  assert.equal(made2[0].querySelector('#eqCheck').disabled, false);
});

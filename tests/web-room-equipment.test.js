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
  for (const k of ['sizeGroups', 'sizesFigure', 'heatFigure', 'formValues', 'fillForm', 'progressText', 'runRows', 'machineRows', 'heatRows', 'airNote']) assert.equal(typeof card.helpers[k], 'function', k);
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
  assert.deepEqual(rows.map(r => r.tags), [['your aircond'], [], ['smallest that works'], ['buy this']]);
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
// The real FarmUi helpers, but say and markFields work on the stub nodes and record what they were given.
require('../web/ui.js');
const realUi = globalThis.FarmUi;
const marked = [];
function testUi() {
  return { ...realUi, say: (el, lvl, text) => { el.textContent = text; el.dataset = { lvl }; }, markFields: (root, fields) => { marked.push(fields); } };
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
  globalThis.FarmApi = { saveEquipment: async (id, eq) => ({ room_id: id, ...eq }) };
  globalThis.FarmUi = testUi();
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
  globalThis.FarmApi = { saveEquipment: (id, eq) => new Promise(r => { release = () => r({ room_id: id, ...eq }); }) };
  globalThis.FarmUi = testUi();
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

test('W10 mount survives settings that are missing, and Check stays enabled for an impossible mix and says why', () => {
  const made = stubDom();
  globalThis.FarmApi = {}; globalThis.FarmUi = testUi();
  const mix = [{ crop: 'lionsmane', blocks: 500 }, { crop: 'pink', blocks: 500 }];
  globalThis.FarmEquipmentCard.mount(hostEl(), opts({ runInputs: () => ({ settings: undefined, mix }) }));
  assert.equal(made[0].querySelector('#eqCheck').disabled, false);
  assert.equal(made[0].querySelector('#eqAirNote').textContent, '');
  const made2 = stubDom();
  globalThis.FarmEquipmentCard.mount(hostEl(), opts({ runInputs: () => ({ settings: undefined, mix: lm(100) }) }));
  assert.equal(made2[0].querySelector('#eqCheck').disabled, false);
  made[0].querySelector('#eqCheck').listeners.click();
  assert.equal(made[0].querySelector('#eqMsg').textContent, 'This crop mix cannot share one room.');
  assert.equal(made[0].querySelector('#eqCheck').disabled, false);
});

test('W11 acVerdictText: "Your <size> is big enough." when the room already has enough, never a buy line for its own size', () => {
  const own = EQ.runCheck(room({ ac_hp: 2.5 }), lm(2500), { runCycleSteps: runner(p => (hpOf(p) >= 2 ? {} : { fails: ['temperature too high'], inT: 60 })) });
  assert.equal(own.ac.verdict, 'enough');
  assert.equal(helpers.acVerdictText(own).startsWith('Your 2.5 hp aircond is big enough.'), true);
  assert.doesNotMatch(helpers.acVerdictText(own), /smaller|would also/);       // recommended is not below the own size
  assert.equal(helpers.runRows(own).some(r => r.hp === own.ac.own && r.tags.includes('buy this')), false);
  assert.ok(helpers.runRows(own).find(r => r.hp === own.ac.own).tags.includes('your aircond'));
  const big = EQ.runCheck(room({ ac_hp: 4 }), lm(2500), { runCycleSteps: runner(p => (hpOf(p) >= 2 ? {} : { fails: ['temperature too high'], inT: 60 })) });
  assert.equal(big.ac.verdict, 'oversized');
  assert.match(helpers.acVerdictText(big), /^Your 4 hp aircond is big enough\. A 2\.5 hp would also be enough\./);
  assert.equal(helpers.machineRows(big)[0].buy, '');                          // no buy cell when the own aircond is enough
  assert.equal(helpers.runRows(big).some(r => r.tags.includes('buy this')), false);
  assert.equal(helpers.acVerdictText(down()), down().ac.text);   // too small: the report's own text
  const host = { children: [], replaceChildren(...c) { this.children = c; } };
  globalThis.document = { createElement: t => new El(t), createElementNS: (ns, t) => new El(t) };
  globalThis.FarmEquipmentCard.renderReport(host, own);
  assert.ok(host.children[0].children[0].textContent.startsWith('Your 2.5 hp aircond is big enough.'));
  delete globalThis.document;
});

test('W12 emptyMixReason', () => {
  assert.equal(helpers.emptyMixReason([]), 'Add a mushroom and the number of blocks first.');
  assert.equal(helpers.emptyMixReason([{ crop: 'oyster', blocks: 0 }]), 'Add a mushroom and the number of blocks first.');
  assert.equal(helpers.emptyMixReason(undefined), 'Add a mushroom and the number of blocks first.');
  assert.equal(helpers.emptyMixReason(lm(5)), '');
});

test('W13 Check with an empty mix says what to add and does not run', async () => {
  const made = stubDom();
  globalThis.FarmApi = {}; globalThis.FarmUi = testUi();
  globalThis.FarmEquipmentCard.mount(hostEl(), opts({ runInputs: () => ({ settings: { airM3h: 900 }, mix: [] }) }));
  made[0].querySelector('#eqCheck').listeners.click();
  await new Promise(r => setTimeout(r, 10));
  assert.equal(made[0].querySelector('#eqMsg').textContent, 'Add a mushroom and the number of blocks first.');
  assert.equal(made[0].querySelector('#eqResult').children, undefined);
});

test('W14 the engine\'s no-reserve sentence is kept after "big enough"', () => {
  const rep = { ac: { verdict: 'enough', own: 2, units: 1, min: 2, recommended: 2.5,
    text: 'Your 2 hp aircond is enough for Lion\'s mane: it keeps the room within 1 °C of 18 °C 97 % of fruiting hours. It is just enough: on the hottest days it has no reserve. 2.5 hp gives a margin.' } };
  assert.equal(helpers.acVerdictText(rep), 'Your 2 hp aircond is big enough. It is just enough: on the hottest days it has no reserve. 2.5 hp gives a margin.');
  const plain = { ac: { verdict: 'enough', own: 2.5, units: 1, min: 2, recommended: 2.5, text: 'Your 2.5 hp aircond is enough for X: it keeps the room within 1 °C of 18 °C 99 % of fruiting hours.' } };
  assert.equal(helpers.acVerdictText(plain), 'Your 2.5 hp aircond is big enough.');
});

test('W15 an invalid form is marked per field through plainError; the marks are cleared first', async () => {
  const made = stubDom();
  marked.length = 0;
  globalThis.FarmApi = {}; globalThis.FarmUi = testUi();
  globalThis.FarmEquipmentCard.mount(hostEl(), opts({ runInputs: () => ({ settings: { airM3h: 900 }, mix: lm(100) }) }));
  const sec = made[0];
  sec.querySelector('#eqFog').value = '99';
  sec.querySelector('#eqSave').listeners.click();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(marked[0], {});
  assert.deepEqual(Object.keys(marked[1]), ['fog_lph']);
  assert.equal(marked[1].fog_lph, 'Must be a number from 0.5 to 50.');
  assert.equal(sec.querySelector('#eqMsg').textContent, 'Check the marked field.');
  assert.equal(sec.querySelector('#eqMsg').dataset.lvl, 'error');
});

test('W16 the leave guard is set while the form differs from the saved machines, and cleared after a save and on unmount', async () => {
  const made = stubDom();
  const calls = [];
  globalThis.FarmShell = { guardLeave: fn => calls.push(fn ? fn() : null) };
  globalThis.FarmApi = { saveEquipment: async (id, eq) => ({ room_id: id, ...eq }) };
  globalThis.FarmUi = testUi();
  const card = globalThis.FarmEquipmentCard.mount(hostEl(), opts({ equipment: { ...EQ.DEFAULTS } }));
  const sec = made[0], form = sec.querySelector('form.equip-form');
  const fill = () => helpers.fillForm(form, { ...EQ.DEFAULTS });
  fill();                                                         // the fields hold the defaults the card loaded
  form.listeners.input();
  assert.deepEqual(calls, []);                                    // nothing differs: the guard is not touched
  sec.querySelector('#eqFog').value = '5';
  form.listeners.input();
  assert.deepEqual(calls, ['Your machines have unsaved changes.']);
  form.listeners.input();
  assert.equal(calls.length, 1);                                  // set once
  sec.querySelector('#eqSave').listeners.click();
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(calls.slice(1), [null]);                       // cleared after the save
  sec.querySelector('#eqFog').value = '6';
  form.listeners.input();
  card.unmount();
  assert.deepEqual(calls.slice(2), ['Your machines have unsaved changes.', null]);
  delete globalThis.FarmShell;
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

test('PL6 sizeGroups: one group per size, yours and recommended marked', () => {
  const g = helpers.sizeGroups(down());
  assert.deepEqual(g.map(x => x.label), ['1 hp', '1.5 hp', '2 hp', '2.5 hp']);
  assert.deepEqual(g.map(x => x.yours), [true, false, false, false]);
  assert.deepEqual(g.map(x => x.recommended), [false, false, false, true]);
  assert.deepEqual(g.map(x => x.state), ['small', 'small', 'holds', 'holds']);
  assert.equal(g[0].inT, 60);
  assert.equal(typeof g[0].rmPerBlock, 'number');
});

test('PL7 the sizes chart and the heat bar are labelled figures', () => withFakeDom(() => {
  const r = down();
  const fig = helpers.sizesFigure(r);
  assert.ok(cls(fig, 'ac-sizes'));
  assert.equal(all(fig, e => e.tag === 'h4')[0].textContent, 'Which aircond size works?');
  const svg = all(fig, e => e.tag === 'svg')[0];
  assert.equal(svg.attrs.role, 'img');
  assert.match(svg.attrs['aria-label'], /1 hp 60 % of the time in band.*too small.*Yours is 1 hp\. Recommended: 2\.5 hp\./);
  const texts = all(svg, e => e.tag === 'text').map(e => e.textContent);
  assert.ok(texts.includes('yours'));
  assert.ok(texts.includes('recommended'));
  const heat = helpers.heatFigure(r);
  assert.ok(cls(heat, 'heat-split'));
  assert.equal(all(heat, e => e.tag === 'h4')[0].textContent, 'Where the heat comes from');
  assert.equal(all(heat, e => e.tag === 'svg')[0].attrs.role, 'img');
  assert.equal(all(heat, e => e.tag === 'li').length, r.breakdown.items.filter(i => i.share > 0).length);
}));

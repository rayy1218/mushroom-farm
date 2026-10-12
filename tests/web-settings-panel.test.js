// select#inCrop lists every crop (C8 5.4.3). Contract: docs/contracts/equipment.md
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('../air.js'); require('../controller.js');
const CC = globalThis.ClimateController;

test('CROPLIST select#inCrop lists every crop with a range', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'settings-panel.js'), 'utf8');
  const block = src.match(/<select id="inCrop">([\s\S]*?)<\/select>/);
  assert.ok(block, 'select#inCrop found');
  const values = [...block[1].matchAll(/<option value="([^"]+)"/g)].map(m => m[1]).sort();
  const crops = Object.keys(CC.CROPS).filter(k => CC.CROPS[k].range).sort();
  assert.deepEqual(values, crops);
});

const src = fs.readFileSync(path.join(__dirname, '..', 'web', 'settings-panel.js'), 'utf8');

test('RULEFIELDS every rule input is a labelled .field with its unit inside .field-ctl', () => {
  for (const [id, unit] of [['rCo2SafeAt', 'ppm'], ['rRhStop', '% under target'], ['rRhResume', '% under target'],
    ['rFanOn', 'ppm'], ['rFanOff', 'ppm'], ['rPurgeMax', 'min'], ['rMinOff', 's']]) {
    const re = new RegExp(`<label for="${id}">[^<]+</label>\\s*<div class="field-ctl"><input type="number" id="${id}"[^>]*><span class="unit">${unit}</span></div>`);
    assert.match(src, re, id);
  }
  assert.match(src, /<label class="chk"><input type="checkbox" id="rCo2Safety"> Run the fresh air above this level<\/label>/);
  assert.doesNotMatch(src, /<label class="num">(At|Until|Start|Stop|Longest|Minimum)/);
});

test('RULEHELP the computed absolute values', () => {
  require('../web/settings-panel.js');
  const { ruleHelp } = globalThis.FarmSettingsPanel;
  assert.equal(ruleHelp.rh(88, 3), '= 85 % now');
  assert.equal(ruleHelp.rh(88, 1), '= 87 % now');
  assert.equal(ruleHelp.rh(87.5, 3), '= 84.5 % now');
  assert.equal(ruleHelp.purgeMax(90), '= 90 s');
  assert.equal(ruleHelp.minOff(120), '= 2 min');
  assert.equal(ruleHelp.minOff(30), '= 0.5 min');
});

test('PROGFIELDS program, lights, room and correction inputs are labelled fields', () => {
  for (const [id, unit] of [['pgDaysSpawn', 'days'], ['pgDaysPin', 'days'], ['pgDaysFruit', 'days'], ['pgDaysRest', 'days'],
    ['pgRampH', 'h'], ['pgDry', 'min'], ['pgPick', 'min'], ['pgFloor', '% under target'],
    ['inRoomM3', 'm³'], ['inAirSize', 'm³/h'], ['oT', '°C'], ['oRH', '%'], ['oCO2', 'ppm']]) {
    const re = new RegExp(`<label for="${id}">[^<]+</label>\\s*<div class="field-ctl"><input [^>]*id="${id}"[^>]*><span class="unit">${unit.replace(/[/%]/g, '\\$&')}</span></div>`);
    assert.match(src, re, id);
  }
  assert.match(src, /<label for="pgFlushes">[^<]+<\/label>\s*<div class="field-ctl"><input [^>]*id="pgFlushes"/);
  assert.match(src, /<label for="pgLightOn">[^<]+<\/label>\s*<div class="field-ctl"><input type="text" id="pgLightOn"/);
  assert.match(src, /<fieldset class="stage-chks">\s*<legend>Lights run in these stages<\/legend>/);
  assert.match(src, /id="pgLightOnHelp">24 h clock, like 07:00</);
});

test('PROGHIDE the spawn and pinning day ids sit on the .field that holds the input', () => {
  assert.match(src, /<div class="field" id="pgDaysSpawnL">\s*<label for="pgDaysSpawn">/);
  assert.match(src, /<div class="field" id="pgDaysPinL">\s*<label for="pgDaysPin">/);
});

test('ARIA each rule input with a help line points at it', () => {
  for (const [id, help] of [['rRhStop', 'rRhStopAbs'], ['rRhResume', 'rRhResumeAbs'], ['rPurgeMax', 'rPurgeMaxAbs'], ['rMinOff', 'rMinOffAbs'],
    ['pgFloor', 'pgFloorHelp'], ['pgLightOn', 'pgLightOnHelp'], ['pgLightOff', 'pgLightOffHelp']]) {
    assert.match(src, new RegExp(`id="${id}"[^>]*aria-describedby="${help}"`), id);
    assert.match(src, new RegExp(`class="field-help" id="${help}"`), help);
  }
});

test('RULEGRID priority 3 is one grid and the checkboxes sit straight in their containers', () => {
  const p3 = src.match(/Priority 3 · CO₂ purge[\s\S]*?<\/fieldset>/)[0];
  assert.equal((p3.match(/class="form-grid"/g) || []).length, 1);
  assert.match(src, /<label class="chk"><input type="checkbox" id="rCo2Safety">/);
  assert.doesNotMatch(src, /<div class="field"><label class="chk">/);
  assert.doesNotMatch(src, /style="margin-top/);
});

test('C14 wantsText, rampNote, targetWarningsByKind and the confirm section', () => {
  require('../web/ui.js'); require('../web/settings-panel.js');
  const SP = globalThis.FarmSettingsPanel;
  assert.equal(SP.wantsText('lionsmane', 'pinning'), "Lion's mane · pinning wants 17 °C · 92 % · CO₂ under 1,000 ppm");
  assert.equal(SP.wantsText('nope', 'pinning'), '');
  const stored = { ...CC.defaultSettings(), crop: 'oyster', stage: 'fruiting' };
  assert.equal(SP.rampNote(stored, stored), '');
  const edited = { ...stored, crop: 'lionsmane', stage: 'pinning', program: { ...stored.program, rampH: 6 } };
  assert.equal(SP.rampNote(stored, edited), 'After you save, the targets move to 17 °C and 92 % over 6 h.');
  assert.equal(SP.rampNote(stored, { ...edited, program: { ...edited.program, rampH: 0 } }), 'After you save, the targets change to 17 °C and 92 %.');
  const w = globalThis.FarmUi.targetWarningsByKind({ ...stored, crop: 'oyster', stage: 'fruiting', spT: 16, spRH: 80 });
  assert.equal(w.T.length, 1); assert.match(w.T[0], /16 °C is outside/);
  assert.equal(w.RH.length, 1); assert.match(w.RH[0], /% drier\.$/);
  assert.deepEqual(globalThis.FarmUi.targetWarningsByKind({ ...stored, spT: 25, spRH: 88 }), { T: [], RH: [] });
  assert.equal(SP.checkSection([]), null);
});

test('C14 the target warning appears and clears as the slider moves; the ramp note follows the crop', () => {
  require('../web/ui.js'); require('../web/settings-panel.js');
  const SP = globalThis.FarmSettingsPanel;
  const mk = () => { const e = { dataset: {}, setAttribute() {}, children: [], textContent: '', hidden: false, className: '', attrs: {}, append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; } }; return e; };
  const nodes = {};
  const node = id => nodes[id] ||= Object.assign(mk(), { id, classList: { add() {}, toggle() {} }, listeners: {}, addEventListener(n, f) { this.listeners[n] = f; },
    dataset: {}, querySelectorAll: () => [], setAttribute() {}, value: '' });
  const host = { classList: { add() {} }, set innerHTML(html) { this.html = html; }, replaceChildren() {},
    querySelector: sel => node(sel.replace(/^#/, '').replace(/^\[data-slot="(.*)"\]$/, 'slot-$1')),
    querySelectorAll: () => [] };
  const old = { document: globalThis.document };
  globalThis.document = { createElement: () => mk(), getElementById: id => node(id), addEventListener() {}, removeEventListener() {}, body: { dataset: {} }, activeElement: null };
  try {
    const s0 = { ...CC.defaultSettings(), crop: 'oyster', stage: 'fruiting' };
    const panel = SP.createSettingsPanel(host, { settings: s0 });
    assert.equal(node('warnSpT').children.length, 0);
    node('inSpT').value = '16'; node('inSpT').listeners.input({ target: node('inSpT') });
    assert.equal(node('warnSpT').children.length, 1);
    assert.match(node('warnSpT').children[0].textContent, /^▲ 16 °C is outside what Grey oyster can take/);
    node('inSpT').value = '25'; node('inSpT').listeners.input({ target: node('inSpT') });
    assert.equal(node('warnSpT').children.length, 0);
    assert.equal(node('cropRamp').hidden, true);
    node('inCrop').value = 'lionsmane'; node('inCrop').listeners.change({ target: node('inCrop') });
    assert.equal(node('cropRamp').hidden, false);
    assert.match(node('cropRamp').textContent, /^After you save, the targets move to 20 °C and 90 % over /);
    assert.match(node('cropWants').textContent, /^Lion's mane · fruiting wants /);
    panel.destroy();
  } finally { if (old.document === undefined) delete globalThis.document; else globalThis.document = old.document; }
});

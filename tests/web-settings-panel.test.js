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
  assert.equal(ruleHelp.rhStop(88, 3), '= 85 % now');
  assert.equal(ruleHelp.rhResume(88, 1), '= 87 % now');
  assert.equal(ruleHelp.rhStop(87.5, 3), '= 84.5 % now');
  assert.equal(ruleHelp.purgeMax(90), '= 90 s');
  assert.equal(ruleHelp.minOff(120), '= 2 min');
  assert.equal(ruleHelp.minOff(30), 'under a minute');
});

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

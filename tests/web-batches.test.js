// web/batches.js: helpers and the #btCrop options (docs/contracts/harvest.md 12.2, 12.3, 13).
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller']) require(`../${f}.js`);
require('../harvest-rules.js'); require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
const B = require('../web/batches.js');
const CC = globalThis.ClimateController, HR = globalThis.FarmHarvestRules;

test('BT1 module registers batches and exports the C10 12.2 names only', () => {
  assert.equal(typeof registered.batches.mount, 'function');
  assert.equal(typeof registered.batches.unmount, 'function');
  assert.deepEqual(Object.keys(B).sort(), ['ageDays', 'batchBody', 'dateToSeconds', 'secondsToDate']);
});

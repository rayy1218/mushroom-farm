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

test('BT2 dates are farm dates whatever the browser zone', () => {
  assert.equal(B.dateToSeconds('2026-10-08'), 1791388800);
  for (const bad of ['', 'x', '2026-13-01', '2026-02-30', '2026-1-5']) assert.equal(B.dateToSeconds(bad), null, bad);
  assert.equal(B.secondsToDate(1791388800), '2026-10-08');
  assert.equal(B.secondsToDate(1791388799), '2026-10-07');
  assert.equal(B.secondsToDate(B.dateToSeconds('2026-12-31')), '2026-12-31');
});

test('BT3 ageDays counts whole days', () => {
  assert.equal(B.ageDays(1791388800, 1791388800 + 3 * 86400 - 1), 2);
  assert.equal(B.ageDays(1791388800, 1791388800 + 3 * 86400), 3);
});

test('BT4 batchBody builds the create and edit bodies', () => {
  const body = B.batchBody({ edit: false, fields: { crop: 'oyster', strain: ' PO-2 ', source: '', block_count: '1000', block_wet_kg: '1.2', moisture_pct: '60', spawn_date: '', received_at: '2026-10-08', flush_gap_days: '', notes: '  ' } });
  assert.deepEqual(body, { crop: 'oyster', strain: 'PO-2', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: 1791388800 });
  assert.deepEqual(HR.checkBatch(body, false), []);
  assert.deepEqual(B.batchBody({ edit: true, fields: { strain: '', notes: 'late', spawn_date: '', block_count: '900' } }),
    { strain: null, notes: 'late', spawn_date: null, block_count: 900 });
  assert.equal(B.batchBody({ edit: false, fields: { block_count: '12a' } }).block_count, '12a');
  assert.deepEqual(Object.keys(B.batchBody({ edit: true, fields: { strain: 'x' } })), ['strain']);
});

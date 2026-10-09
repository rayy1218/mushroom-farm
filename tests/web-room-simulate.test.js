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
  assert.deepEqual(Object.keys(tab.helpers).sort(), ['appliedCalib', 'clampBlocks', 'clampCo2', 'cycleSummary', 'machinesText', 'progressText',
    'regionText', 'runInputs', 'runRowTexts', 'sameMix', 'seriesPoints', 'stageRows', 'toCapacityMix', 'toMixRows']);
  assert.equal(typeof globalThis.document, 'undefined');
  assert.doesNotThrow(() => tab.unmount());
});

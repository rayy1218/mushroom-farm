// web/room-live.js helpers (docs/contracts/web.md 3.4, 7.9; C9 7).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js'); require('../web/settings-panel.js');
require('../web/room-tabs.js');
require('../web/room-live.js');
const tab = globalThis.FarmRoomTabs.get('live');
const H = tab && tab.helpers;
const CC = globalThis.ClimateController, clock = globalThis.FarmUi.farmClock();
const S = CC.defaultSettings();                                   // airM3h 1800, rules.purgeMaxS 180
const AIR = { on: false, state: 'idle', reason: null, delayed: false, timed: false, manual: false, manualOn: false,
  nextPurgeS: null, purgeS: null, why: null, today: { purges: 0, avgS: null, capped: 0 } };
const air = over => ({ ...AIR, ...over });
const READING = { room_id: 1, t: 1791450000, T: 18.2, RH: 88.4, CO2: 812, t_out: 31.5, rh_out: 62, ac_mode: 'cool', ac_setpoint: 17.5,
  fog: 1, air: 0, lights: 1, circ: 0, power_w: 1430, kwh: 12.84, ac_fan: 'auto', stage: 'fruiting', core: 19.1 };
const TG = { spT: 18, spRH: 88, co2Lim: 1000, fanOn: 900, fanOff: 700 };

const HELPER_NAMES = ['airLive', 'airSub', 'windowQuery', 'gapFor', 'reconnectQuery', 'chartTargets', 'toChartPoint', 'retarget',
  'mergePoints', 'mergeEvent', 'readingTexts', 'machineLines', 'commandFromReading', 'programText', 'alarmTexts', 'detailChanges',
  'countText', 'changeLines', 'versionText', 'rebase'];

test('LV1 registration', () => {
  assert.ok(tab, 'tab live registered');
  assert.equal(typeof tab.mount, 'function');
  assert.equal(typeof tab.unmount, 'function');
  assert.equal(typeof tab.helpers, 'object');
  for (const n of HELPER_NAMES) assert.equal(typeof H[n], 'function', n);
  assert.doesNotThrow(() => tab.unmount());
});

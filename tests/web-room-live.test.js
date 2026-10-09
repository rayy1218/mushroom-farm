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

test('LV2 airLive follows the C5 3.4 rows', () => {
  const chip = (lvl, icon, text) => ({ lvl, icon, text });
  const IDLE = chip('none', '○', 'Idle');
  const r1 = air({ on: true, state: 'purge', reason: 'purge', purgeS: 75 });
  let o = H.airLive(r1, S);
  assert.equal(o.state, 'Purge 1:15 of 3:00'); assert.equal(o.glance, 'Purging 1:15');
  assert.deepEqual(o.chip, chip('info', '▲', 'Purging'));
  assert.equal(H.airLive(r1, null).state, 'Purge 1:15');
  o = H.airLive(air({ on: true, reason: 'safety' }), S);
  assert.deepEqual([o.state, o.glance, o.chip], ['Safety run', 'Safety run', chip('serious', '◆', 'Safety run')]);
  for (const [reason, text] of [['timed', 'Timed purge'], ['free cooling', 'Free cooling'], ['drying', 'Drying'], ['manual', 'Manual on']]) {
    o = H.airLive(air({ on: true, reason }), S);
    assert.deepEqual([o.state, o.glance, o.chip], [text, text, chip('info', '●', text)]);
  }
  assert.equal(H.airLive(air({ on: true, reason: 'weird' }), S).state, 'On');
  assert.equal(H.airLive(air({ on: true, reason: null }), S).glance, 'On');
  o = H.airLive(air({ manual: true, manualOn: true }), S);
  assert.deepEqual([o.state, o.glance, o.chip], ['Manual on', 'Manual on', chip('info', '●', 'Manual on')]);
  for (const extra of [{}, { delayed: true }]) {
    o = H.airLive(air({ manual: true, ...extra }), S);
    assert.deepEqual([o.state, o.glance, o.chip], ['Manual off', 'Manual off', chip('none', '○', 'Manual off')]);
  }
  o = H.airLive(air({ delayed: true }), S);
  assert.deepEqual([o.state, o.glance, o.chip], ['Delayed (humidity first)', 'Delayed (humidity first)', chip('info', '❚❚', 'Delayed')]);
  o = H.airLive(air({ timed: true }), S);
  assert.deepEqual([o.state, o.glance, o.chip], ['Timed purge · off', 'Timed purge · off', IDLE]);
  o = H.airLive(air({ nextPurgeS: 240 }), S);
  assert.deepEqual([o.state, o.glance, o.chip], ['Idle · purge in about 4 min', 'Next purge in about 4 min', IDLE]);
  assert.equal(H.airLive(air({ nextPurgeS: 241 }), S).glance, 'Next purge in about 5 min');
  assert.equal(H.airLive(air({ nextPurgeS: 30 }), S).glance, 'Next purge in about 1 min');
  for (const a of [AIR, air({ state: 'after' })]) {
    o = H.airLive(a, S);
    assert.deepEqual([o.state, o.glance, o.chip], ['Idle', 'Idle', IDLE]);
  }
  assert.equal(H.airLive(air({ on: true, reason: 'manual', manual: true, manualOn: true }), S).state, 'Manual on');
});

test('LV3 airLive day line', () => {
  assert.equal(H.airLive(AIR, S).day, 'Purges 0 · average –');
  assert.equal(H.airLive(air({ today: { purges: 41, avgS: 74, capped: 0 } }), S).day, 'Purges 41 · average 1:14');
  assert.equal(H.airLive(air({ today: { purges: 41, avgS: 74.4, capped: 0 } }), S).day, 'Purges 41 · average 1:14');
  assert.equal(H.airLive(air({ today: { purges: 41, avgS: 74, capped: 2 } }), S).day, 'Purges 41 · average 1:14 · 2 capped');
});

test('LV4 airLive null', () => {
  assert.deepEqual(H.airLive(null, S), { state: '–', glance: '–', chip: null, day: '' });
});

test('LV5 airSub', () => {
  assert.equal(H.airSub(S), 'SF-203 + EF-206 · 1,800 m³/h');
  assert.equal(H.airSub(null), 'SF-203 + EF-206');
});

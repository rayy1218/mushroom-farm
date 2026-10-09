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

test('LV6 windows and reconnect queries', () => {
  assert.deepEqual(H.windowQuery(3600, 10000), { from: 6400, to: 10000, step: undefined });
  assert.deepEqual(H.windowQuery(21600, 30000), { from: 8400, to: 30000, step: undefined });
  assert.equal(H.windowQuery(86400, 100000).step, 120);
  assert.equal(H.windowQuery(604800, 700000).step, 900);
  assert.throws(() => H.windowQuery(7200, 10000), RangeError);
  assert.equal(H.gapFor(undefined), 90); assert.equal(H.gapFor(120), 360); assert.equal(H.gapFor(900), 2700);
  assert.deepEqual(H.reconnectQuery(3600, 9000, 10000), { from: 9001, to: 10000, step: undefined, merge: true });
  assert.equal(H.reconnectQuery(3600, 1000, 10000).from, 6400);
  assert.equal(H.reconnectQuery(3600, 10000, 10000), null);
  assert.deepEqual(H.reconnectQuery(3600, null, 10000), { from: 6400, to: 10000, step: undefined, merge: false });
  assert.deepEqual(H.reconnectQuery(86400, 9000, 10000), { from: -76400, to: 10000, step: 120, merge: false });
});

test('LV7 chart points', () => {
  assert.deepEqual(H.chartTargets({ targets: { T: 18, RH: 88, CO2: 1000 } }, S), TG);
  const fb = H.chartTargets({ targets: null }, S);
  assert.equal(fb.spT, 25); assert.equal(fb.fanOn, 900);
  const none = H.chartTargets(null, null);
  for (const k of Object.keys(TG)) assert.ok(Number.isNaN(none[k]), k);
  assert.deepEqual(H.toChartPoint(READING, TG), { t: 1791450000, T: 18.2, RH: 88.4, C: 812, tOut: 31.5, rhOut: 62, core: 19.1,
    spT: 18, spRH: 88, co2Lim: 1000, fanOn: 900, fanOff: 700 });
  const p = H.toChartPoint({ ...READING, T: null, CO2: 20000, rh_out: -5, core: null }, TG);
  for (const k of ['T', 'C', 'rhOut', 'core']) assert.ok(Number.isNaN(p[k]), k);
  assert.equal(p.RH, 88.4); assert.equal(p.tOut, 31.5);
  const pts = [{ t: 1, spT: 1 }], copy = structuredClone(pts);
  assert.deepEqual(H.retarget(pts, TG), [{ t: 1, ...TG }]);
  assert.deepEqual(pts, copy);
  const base = [{ t: 10 }, { t: 40 }], bc = structuredClone(base);
  assert.deepEqual(H.mergePoints(base, { t: 25 }, 0).map(x => x.t), [10, 25, 40]);
  const rep = H.mergePoints(base, { t: 40, T: 1 }, 0);
  assert.equal(rep.length, 2); assert.equal(rep[1].T, 1);
  assert.deepEqual(H.mergePoints(base, { t: 25 }, 20).map(x => x.t), [25, 40]);
  assert.deepEqual(H.mergePoints(base, { t: 5 }, 20).map(x => x.t), [40]);
  assert.deepEqual(base, bc);
});

test('LV8 reading, machine and program texts', () => {
  assert.deepEqual(H.readingTexts(READING, clock), { T: '18.2 °C', RH: '88 % RH', CO2: '812 ppm', at: 'Reading at 2026-10-08 17:00:00' });
  assert.deepEqual(H.readingTexts(null, clock), { T: '—', RH: '—', CO2: '—', at: 'No reading yet' });
  assert.deepEqual(H.machineLines(READING), ['AC Cool 17.5 °C', 'Fogger level 1', 'Air exchange Off', 'Lights on', 'Circulation fan off', 'Power 1.43 kW']);
  assert.deepEqual(H.machineLines({ ...READING, ac_mode: 'off', ac_setpoint: null, fog: 0, air: 1, lights: 0, circ: 1, power_w: null }),
    ['AC off', 'Fogger off', 'Air exchange On', 'Lights off', 'Circulation fan on']);
  assert.deepEqual(H.machineLines(null), []);
  assert.equal(H.programText({ crop: 'oyster', stage: 'fruiting', flush: 2 }), 'Running now: Grey oyster · Fruiting · flush 2');
  assert.equal(H.programText({ crop: 'oyster', stage: 'fruiting', flush: null }), 'Running now: Grey oyster · Fruiting');
  assert.equal(H.programText(null), ''); assert.equal(H.programText({ crop: null }), '');
});

test('LV9 command from a reading', () => {
  assert.deepEqual(H.commandFromReading(READING), { ac: { power: true, mode: 'cool', setpoint: 17.5 }, hu: { level: 1 },
    air: { on: false }, lights: { on: true }, circ: { on: false } });
  assert.deepEqual(H.commandFromReading({ ...READING, air: 1 }).air, { on: true });
  assert.deepEqual(H.commandFromReading({ ...READING, ac_mode: 'off' }).ac, { power: false });
  assert.equal(H.commandFromReading(null), null);
});

test('LV10 alarm and event lists', () => {
  const a = { alarm_key: 'rh_high', label: 'High humidity', level: 'warning', raised_at: 1791450012, cleared_at: null, acked_at: null };
  assert.deepEqual(H.alarmTexts(a, clock), { main: 'High humidity · since 2026-10-08 17:00:12', state: 'Active · not acknowledged', canAck: true });
  const b = H.alarmTexts({ ...a, cleared_at: 1791450600, acked_at: 1791450700 }, clock);
  assert.equal(b.state, 'Cleared 2026-10-08 17:10:00 · acknowledged'); assert.equal(b.canAck, false);
  const ids = x => x.map(e => e.id);
  assert.deepEqual(ids(H.mergeEvent([{ id: 5 }, { id: 3 }], { id: 6 })), [6, 5, 3]);
  assert.deepEqual(ids(H.mergeEvent([{ id: 5 }, { id: 3 }], { id: 5 })), [5, 3]);
  assert.deepEqual(ids(H.mergeEvent([{ id: 5 }, { id: 3 }], { id: 4 })), [5, 4, 3]);
});

test('LV11 forms and change lines', () => {
  assert.deepEqual(H.detailChanges({ name: 'Room 1', volume: 60 }, { name: ' Room 1 ', volume: '60' }), {});
  assert.deepEqual(H.detailChanges({ name: 'Room 1', volume: 60 }, { name: 'Shed A', volume: '80' }), { name: 'Shed A', volume: 80 });
  assert.equal(H.countText(0), ''); assert.equal(H.countText(1), '1 unsaved change(s)');
  assert.equal(H.versionText({ id: 14, saved_at: 1791450100, note: 'Lower RH' }, clock, true), '2026-10-08 17:01:40 · Lower RH · current');
  assert.equal(H.versionText({ id: 14, saved_at: 1791450100, note: null }, clock, false), '2026-10-08 17:01:40 · —');
  assert.deepEqual(H.changeLines(globalThis.FarmSettingsPanel.diffSettings(S, { ...S, spT: 20 })), ['Temperature target: 25 °C → 20 °C']);
});

// web/room-live.js helpers (docs/contracts/web.md 3.4, 7.9; C9 7).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js'); require('../web/settings-panel.js');
require('../web/room-tabs.js');
require('../web/room-live.js');
const tab = globalThis.FarmRoomTabs.get('overview');
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
  'mergePoints', 'mergeEvent', 'readingTexts', 'machineLines', 'machineTiles', 'readyText', 'rampShows', 'rampText', 'targetsText', 'alarmTexts'];

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
  assert.equal(H.airLive(air({ on: true, reason: 'purge', purgeS: 75, manual: true }), S).state, 'Purge 1:15 of 3:00');
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
  assert.deepEqual(H.reconnectQuery(3600, 9999, 10000), { from: 10000, to: 10000, step: undefined, merge: true });
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
  assert.deepEqual(H.machineLines(READING), ['AC Cool 17.5 °C', 'Fogger level 1', 'Fresh air Off', 'Lights on', 'Circulation fan off', 'Power 1.43 kW']);
  assert.deepEqual(H.machineLines({ ...READING, ac_mode: 'off', ac_setpoint: null, fog: 0, air: 1, lights: 0, circ: 1, power_w: null }),
    ['AC off', 'Fogger off', 'Fresh air On', 'Lights off', 'Circulation fan on']);
  assert.deepEqual(H.machineLines(null), []);
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

test('LV20 machineTiles', () => {
  assert.deepEqual(H.machineTiles(null, []), []);
  const tiles = H.machineTiles(READING, ['hu', 'lights']);
  assert.deepEqual(tiles.map(t => t.dev), ['ac', 'hu', 'air', 'lights', 'circ', 'power']);
  assert.deepEqual(tiles.map(t => t.name), ['Aircon', 'Mister', 'Fresh-air fans', 'Lights', 'Circulation fan', 'Power']);
  assert.deepEqual(tiles.map(t => t.state), ['Cool 17.5 °C', 'Level 1', 'Off', 'On', 'Off', '1.43 kW']);
  assert.deepEqual(tiles.map(t => t.on), [true, true, false, true, false, true]);
  assert.deepEqual(tiles.map(t => t.manual), [false, true, false, true, false, false]);
  const off = H.machineTiles({ ...READING, ac_mode: 'off', fog: 0, power_w: null }, undefined);
  assert.deepEqual(off.map(t => t.state), ['Off', 'Off', 'Off', 'On', 'Off']);
  assert.equal(off[0].on, false); assert.equal(off[1].on, false);
});

test('LV21 targetsText and the ramp', () => {
  const NOW = 1791450000, base = { targets: { T: 25, RH: 88, CO2: 1000 } };
  const TXT = 'Should be: 25.0 °C · 88 % · CO₂ under 1,000 ppm';
  const to = { T: 17, RH: 92, CO2: 1000 };
  assert.equal(H.targetsText(base, NOW), TXT);
  assert.equal(H.targetsText({ ...base, ramp: null }, NOW), TXT);
  assert.equal(H.targetsText({ ...base, ramp: { to, endsAt: NOW + 1800 } }, NOW).startsWith(`${TXT} · moving to 17 °C and 92 %, ready `), true);
  assert.equal(H.targetsText({ targets: null }, NOW), '');
  assert.equal(H.targetsText(null, NOW), '');
});

test('LV22 rampText: today, tomorrow, past', () => {
  const NOW = 1791450000, to = { T: 17, RH: 92, CO2: 1000 };
  const hm = t => clock.hm(t), ymd = t => clock.label(t).slice(0, 10);
  // pick a time later the same farm day and one the next farm day
  let same = NOW + 600; while (ymd(same) !== ymd(NOW)) same -= 60;
  const next = NOW + 86400;
  assert.equal(H.rampText({ to, endsAt: same }, NOW), `moving to 17 °C and 92 %, ready about ${hm(same)}`);
  assert.equal(H.rampText({ to, endsAt: next }, NOW), `moving to 17 °C and 92 %, ready tomorrow about ${hm(next)}`);
  assert.match(H.rampText({ to, endsAt: NOW + 3 * 86400 }, NOW), /, ready (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) about \d\d:\d\d$/);
  // decision 116: the room already has the targets
  assert.equal(H.rampText({ to, endsAt: next }, NOW, { T: 17.05, RH: 91.5 }), '');
  assert.notEqual(H.rampText({ to, endsAt: next }, NOW, { T: 25, RH: 88 }), '');
  assert.equal(H.rampText({ to, endsAt: NOW - 5 }, NOW), '');
  assert.equal(H.rampText(null, NOW), '');
  assert.equal(H.rampText({ to: { T: 22.5, RH: 80.4, CO2: 1000 }, endsAt: next }, NOW).startsWith('moving to 22.5 °C and 80 %'), true);
});

// ---- mount smoke: a tiny DOM stub, installed only inside this test (C13 3.1) ----
class FakeEl {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.className = ''; this.textContent = ''; this.hidden = false; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  append(...c) { this.children.push(...c.filter(x => typeof x !== 'string')); }
  replaceChildren(...c) { this.children = []; this.append(...c); }
  addEventListener(n, f) { this.listeners[n] = f; }
  matches(p) {
    if (p[0] === '#') return this.attrs.id === p.slice(1);
    if (p[0] === '.') return this.className.split(/\s+/).includes(p.slice(1));
    return this.tagName === p.toUpperCase();
  }
  all(chain, out) { for (const c of this.children) { if (c.matches(chain[0])) { if (chain.length === 1) out.push(c); else c.all(chain.slice(1), out); } c.all(chain, out); } return out; }
  querySelectorAll(sel) { return this.all(sel.trim().split(/\s+/), []); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

test('LV12 mount: drawing first, timeline under the trends, no glance row, teardown stops the loop and the listeners', async t => {
  const docL = new Set(), rafs = new Map(); let nextRaf = 1, destroyed = [], paints = 0;
  const saved = ['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'performance'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  const set = (k, v) => Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  set('document', { hidden: false, body: { dataset: { level: 'farmer' } }, createElement: tag => new FakeEl(tag),
    addEventListener: (n, f) => docL.add(n + f), removeEventListener: (n, f) => docL.delete(n + f) });
  set('requestAnimationFrame', f => { rafs.set(nextRaf, f); return nextRaf++; });
  set('cancelAnimationFrame', id => rafs.delete(id));
  set('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  set('performance', { now: () => 0 });
  const FC = globalThis.FarmCharts, FM = globalThis.FarmMimic, api = globalThis.FarmApi;
  const old = { ...FC }, oldM = FM && { ...FM }, oldApi = { ...api };
  globalThis.FarmMimic = { create: () => ({ paint() { paints++; }, tick() {}, destroy() { destroyed.push('mimic'); } }), fromReading: () => ({}) };
  FC.createTrendCharts = host => { const s = new FakeEl('section'); s.className = 'card trend'; host.append(s); return { draw() {}, setHover() {}, destroy() { destroyed.push('charts'); } }; };
  FC.drawMachineTimeline = () => ({ update() {}, setHover() {}, destroy() { destroyed.push('timeline'); } });
  Object.assign(api, { getReadings: async () => [], getAlarms: async () => [], getEvents: async () => [], getSettings: async () => CC.defaultSettings() });
  t.after(() => {
    tab.unmount();
    for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
    Object.assign(FC, old); Object.assign(api, oldApi); globalThis.FarmMimic = oldM;
  });
  const el = new FakeEl('div');
  const ctx = { id: 1, params: {}, room: () => ({ id: 1, name: 'Room 1', volume: 60, live: { reading: READING } }), on: () => () => {} };
  await tab.mount(el, ctx);
  assert.ok(el.children[0].matches('.room-drawing'), 'the drawing card is first');
  assert.equal(el.querySelector('#airGlance'), null, 'the duplicate air glance row is gone');
  assert.ok(el.querySelector('#airDay'), 'the day line sits in the Fresh air card');
  const charts = el.querySelector('#lvCharts');
  assert.ok(charts.children[charts.children.length - 1].matches('.machine-timeline'), 'the timeline is the last thing under the trends');
  assert.ok(paints >= 1);
  assert.equal(rafs.size, 1, 'the loop runs');
  assert.ok(docL.size >= 2, 'level and visibility listeners are on');
  tab.unmount();
  assert.equal(rafs.size, 0, 'teardown stops the loop');
  assert.equal(docL.size, 0, 'teardown removes the document listeners');
  assert.deepEqual(destroyed.sort(), ['charts', 'mimic', 'timeline']);
});

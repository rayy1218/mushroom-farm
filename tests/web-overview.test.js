// web/overview.js: pure helpers and the mount/unmount token (C12 4).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
require('../web/overview.js');
const OV = registered.overview;
const H = OV.helpers;

// 2026-10-12 12:00 farm time (04:00 UTC) = Monday
const NOW = Date.UTC(2026, 9, 12, 4, 0, 0) / 1000;
const MIDNIGHT = Date.UTC(2026, 9, 11, 16, 0, 0) / 1000; // 00:00 farm = 16:00 UTC the day before

test('OV1 module and farm clock', () => {
  assert.equal(typeof OV.mount, 'function');
  assert.equal(typeof OV.unmount, 'function');
  assert.doesNotThrow(() => OV.unmount());
  assert.equal(H.dayStart(NOW), MIDNIGHT);
  assert.equal(H.dayStart(MIDNIGHT), MIDNIGHT);
  assert.equal(H.dayStart(MIDNIGHT - 1), MIDNIGHT - 86400);
  assert.equal(H.dateText(NOW), 'Monday 12 October');
  assert.equal(H.dateText(MIDNIGHT - 1), 'Sunday 11 October');
  assert.equal(H.eventTime(NOW - 3600, NOW), '11:00');
  assert.equal(H.eventTime(NOW - 86400, NOW), '11 Oct 12:00');
});

test('OV2 kwhToday', () => {
  assert.equal(H.kwhToday([]), 0);
  assert.equal(H.kwhToday(null), 0);
  assert.equal(H.kwhToday([{ kwh: 10 }]), 0);
  assert.equal(H.kwhToday([{ kwh: 10 }, { kwh: 11.5 }, { kwh: 13 }]), 3);
  assert.equal(H.kwhToday([{ kwh: 10 }, { kwh: 12 }, { kwh: 1 }, { kwh: 3 }]), 4, 'a meter restart counts as 0');
  assert.equal(H.kwhToday([{ kwh: 10 }, { kwh: null }, { kwh: 12 }]), 2, 'null rows are skipped');
  assert.equal(H.kwhToday([{ kwh: null }, { kwh: 5 }, { kwh: 6 }]), 1);
  assert.equal(H.kwhToday([{ kwh: 0.1 }, { kwh: 0.2 }, { kwh: 0.3 }]), 0.2);
  // with a start: the last row before it is the baseline, so the first hour of the day counts
  const rows = [{ t: 80, kwh: 100 }, { t: 90, kwh: 101 }, { t: 100, kwh: 102.5 }, { t: 110, kwh: 104 }];
  assert.equal(H.kwhToday(rows, 100), 3, 'baseline is the row at t=90');
  assert.equal(H.kwhToday(rows), 4);
  assert.equal(H.kwhToday(rows.slice(2), 100), 1.5, 'no baseline: the first row only sets it');
  assert.equal(H.kwhToday([{ t: 90, kwh: null }, { t: 95, kwh: 5 }, { t: 100, kwh: 6 }], 100), 1);
  assert.equal(H.kwhToday([{ t: 90, kwh: 50 }, { t: 100, kwh: 2 }, { t: 110, kwh: 3 }], 100), 1, 'restart after the baseline counts 0');
  assert.equal(H.kwhToday([{ t: 90, kwh: 5 }], 100), 0);
});

test('OV3 sparkPath', () => {
  assert.equal(H.sparkPath([], 140, 36, null), null);
  assert.equal(H.sparkPath([{ t: 0, v: 1 }], 140, 36, null), null);
  assert.equal(H.sparkPath([{ t: 0, v: 1 }, { t: 1, v: NaN }, { t: 2, v: null }], 140, 36, null), null);
  const p = H.sparkPath([{ t: 0, v: 20 }, { t: 100, v: 30 }], 140, 36, null);
  assert.equal(p.band, null);
  assert.equal(p.min, 20); assert.equal(p.max, 30);
  assert.match(p.d, /^M3 33 L137 3$/);
  assert.deepEqual(p.last, { x: 137, y: 3 });
  // the band widens the vertical range and is positioned inside the box
  const q = H.sparkPath([{ t: 0, v: 24 }, { t: 100, v: 26 }], 140, 36, { lo: 23, hi: 27 });
  assert.ok(q.band.y >= 0 && q.band.y + q.band.h <= 36);
  assert.equal(q.band.y, 3); assert.equal(q.band.h, 30);
  assert.ok(q.last.y > q.band.y && q.last.y < q.band.y + q.band.h);
  // points out of order are sorted, a flat line is centred
  const f = H.sparkPath([{ t: 50, v: 5 }, { t: 0, v: 5 }], 140, 36, null);
  assert.match(f.d, /^M3 18 L137 18$/);
  // a bad band is ignored
  assert.equal(H.sparkPath([{ t: 0, v: 1 }, { t: 1, v: 2 }], 140, 36, { lo: 3, hi: 3 }).band, null);
  assert.equal(H.sparkPath([{ t: 0, v: 1 }, { t: 1, v: 2 }], 140, 36, { lo: NaN, hi: 3 }).band, null);
});

test('OV4 sparkLabel', () => {
  assert.equal(H.sparkLabel('T', 24.1, 25.64), 'Temperature, last 24 hours: 24.1 to 25.6 °C');
  assert.equal(H.sparkLabel('RH', 80.2, 88.4), 'Humidity, last 24 hours: 80 to 88 %');
  assert.equal(H.sparkLabel('T', 24.01, 24.02), 'Temperature, last 24 hours: 24.0 °C');
});

test('OV5 weekBars', () => {
  const bars = H.weekBars([], NOW);
  assert.equal(bars.length, 7);
  assert.equal(bars[6].start, MIDNIGHT);
  assert.equal(bars[0].start, MIDNIGHT - 6 * 86400);
  assert.equal(bars[6].label, 'Mon');
  assert.equal(bars[5].label, 'Sun');
  assert.ok(bars.every(b => b.kg === 0));
  const crates = [
    { t: NOW - 60, kg: 4.5 }, { t: MIDNIGHT, kg: 1 },              // today (boundary included)
    { t: MIDNIGHT - 1, kg: 2 },                                      // yesterday
    { t: MIDNIGHT - 6 * 86400, kg: 3 },                              // oldest day
    { t: MIDNIGHT - 7 * 86400, kg: 9 },                              // too old
    { t: NOW + 86400, kg: 9 },                                       // future
    { t: NOW - 10, kg: 5, deleted_at: NOW },                         // undone
    { t: NOW - 10, kg: NaN },
  ];
  const w = H.weekBars(crates, NOW);
  assert.equal(w[6].kg, 5.5);
  assert.equal(w[5].kg, 2);
  assert.equal(w[0].kg, 3);
  assert.equal(w[3].kg, 0);
  assert.equal(H.weekBars([{ t: NOW, kg: 0.1 }, { t: NOW, kg: 0.2 }], NOW)[6].kg, 0.3);
});

test('OV6 checklist', () => {
  const room = id => ({ id, name: `Room ${id}` });
  let c = H.checklist({ rooms: [], history: {}, batches: [], calibrations: {}, installer: false });
  assert.deepEqual(c.items.map(i => i.key), ['rooms', 'crop', 'batch', 'harvest']);
  assert.ok(c.items.every(i => !i.done));
  assert.equal(c.allDone, false);
  assert.equal(c.items[0].href, '#/rooms');
  assert.equal(c.items[1].href, '#/rooms', 'no rooms: the settings link goes to the rooms');
  assert.equal(H.checklist({ rooms: [], installer: true }).items[4].href, '#/rooms');
  c = H.checklist({ rooms: [room(1), room(2)], history: { 1: 3, 2: 1 }, batches: [], calibrations: {}, installer: false });
  assert.equal(c.items[0].done, true);
  assert.equal(c.items[1].done, false, 'room 2 has one settings version');
  assert.equal(c.items[1].href, '#/rooms/2/settings');
  c = H.checklist({ rooms: [room(1), room(2)], history: { 1: 2, 2: 2 }, batches: [{ totals: { kg: 0 } }], calibrations: {}, installer: false });
  assert.equal(c.items[1].done, true);
  assert.equal(c.items[2].done, true);
  assert.equal(c.items[3].done, false, 'a batch without harvest');
  assert.equal(c.allDone, false);
  c = H.checklist({ rooms: [room(1)], history: { 1: 2 }, batches: [{ totals: { kg: 0 } }, { totals: { kg: 12 } }], calibrations: {}, installer: false });
  assert.equal(c.allDone, true);
  // installer item
  c = H.checklist({ rooms: [room(1), room(2)], history: { 1: 2, 2: 2 }, batches: [{ totals: { kg: 3 } }], calibrations: {}, installer: true });
  assert.equal(c.items.length, 5);
  assert.equal(c.items[4].key, 'calibrate');
  assert.equal(c.items[4].done, false);
  assert.equal(c.items[4].href, '#/rooms/1/calibrate');
  assert.equal(c.allDone, false);
  c = H.checklist({ rooms: [room(1), room(2)], history: { 1: 2, 2: 2 }, batches: [{ totals: { kg: 3 } }], calibrations: { 2: 1 }, installer: true });
  assert.equal(c.items[4].done, true);
  assert.equal(c.items[4].href, '#/rooms/2/calibrate');
  assert.equal(c.allDone, true);
  // missing history entry counts as not done
  c = H.checklist({ rooms: [room(1)], batches: [], installer: false });
  assert.equal(c.items[1].done, false);
});

test('OV7 mergeEvents', () => {
  const a = { room: { id: 1, name: 'Room 1' }, events: [{ id: 5, t: 100, text: 'a1' }, { id: 4, t: 90, text: 'a2' }] };
  const b = { room: { id: 2, name: 'Barn' }, events: [{ id: 9, t: 95, text: 'b1' }, { id: 3, t: 100, text: 'b2' }] };
  const m = H.mergeEvents([a, b], 3);
  assert.deepEqual(m.map(e => e.text), ['a1', 'b2', 'b1']);
  assert.deepEqual(m.map(e => e.room_name), ['Room 1', 'Barn', 'Barn']);
  assert.equal(m[0].room_id, 1);
  assert.equal(H.mergeEvents([a, b], 10).length, 4);
  assert.deepEqual(H.mergeEvents([], 8), []);
  assert.deepEqual(H.mergeEvents([{ room: { id: 1, name: 'x' }, events: [] }], 8), []);
  assert.deepEqual(H.mergeEvents([a], 8).map(e => e.id), [5, 4]);
  // equal times: higher id first
  assert.deepEqual(H.mergeEvents([{ room: { id: 1, name: 'x' }, events: [{ id: 1, t: 5 }, { id: 2, t: 5 }] }], 2).map(e => e.id), [2, 1]);
  assert.equal(a.events[0].room_name, undefined, 'input not changed');
});

const good = { lvl: 'good', icon: '✓', text: 'In band' };
const mkRoom = (id, name, over = {}) => ({ id, name, adapter: 'sim',
  live: { running: true, alarms: 0, status: { T: good, RH: good, CO2: good }, air: null, manual: [], crop: 'oyster', stage: 'fruiting', flush: 1,
    targets: { T: 18, RH: 88, CO2: 1000 }, reading: { T: 18, RH: 88, CO2: 800, ac_mode: 'cool', fog: 1, air: 0, lights: 1, circ: 0, kwh: 1 }, ...over } });

test('OV8 kpis', () => {
  const rooms = [mkRoom(1, 'A'), mkRoom(2, 'B', { alarms: 2 }), mkRoom(3, 'C', { alarms: 1 }), mkRoom(4, 'D', { running: false })];
  const k = H.kpis(rooms, { kwh: 12.34, kgToday: 5.25, weekKg: 40 });
  assert.equal(k.rooms.value + k.rooms.unit, '1 of 4 OK');
  assert.equal(k.rooms.sub, '3 to check');
  assert.equal(k.alarms.value, '3');
  assert.equal(k.alarms.sub, 'B, C');
  assert.equal(k.energy.value + k.energy.unit, '12.3 kWh');
  assert.equal(k.energy.sub, 'about RM 7.03');
  assert.equal(k.harvest.value + k.harvest.unit, '5.3 kg today');
  assert.equal(k.harvest.sub, '40.0 kg this week');
  const all = H.kpis([mkRoom(1, 'A'), mkRoom(2, 'B')], { kwh: 0, kgToday: 0, weekKg: 0 });
  assert.equal(all.rooms.value + all.rooms.unit, '2 of 2 OK');
  assert.equal(all.rooms.sub, 'All good');
  assert.equal(all.alarms.value, '0');
  assert.equal(all.alarms.sub, 'None open');
  assert.equal(all.energy.sub, 'about RM 0.00');
  const none = H.kpis([mkRoom(1, 'A')], {});
  assert.equal(none.energy.value, '–');
  assert.equal(none.harvest.value, '0.0');
  const warn = H.kpis([mkRoom(1, 'A', { status: { T: { lvl: 'warning', icon: '▲', text: 'Above band' }, RH: good, CO2: good } })], {});
  assert.equal(warn.rooms.sub, '1 to check');
});

test('OV9 machineStrip, cropLine, bandFor', () => {
  const s = H.machineStrip(mkRoom(1, 'A', { manual: ['hu'] }));
  assert.deepEqual(s.map(m => m.key), ['ac', 'hu', 'air', 'lights', 'circ']);
  assert.deepEqual(s.map(m => m.on), [true, true, false, true, false]);
  assert.deepEqual(s.map(m => m.manual), [false, true, false, false, false]);
  assert.equal(s[2].name, 'Fresh-air fans');
  assert.ok(H.machineStrip({ live: null }).every(m => !m.on));
  assert.equal(H.machineStrip(mkRoom(1, 'A', { reading: { ac_mode: 'off', fog: 0, air: 1, lights: 0, circ: 1 } }))[0].on, false);
  assert.equal(H.cropLine(null), '–');
  assert.match(H.cropLine(mkRoom(1, 'A').live), /^Grey oyster · Fruiting · flush 1$/);
  assert.deepEqual(H.bandFor('T', { targets: { T: 18 } }), { lo: 17, hi: 19 });
  assert.deepEqual(H.bandFor('RH', { targets: { RH: 88 } }), { lo: 85, hi: 91 });
  assert.equal(H.bandFor('T', null), null);
  assert.equal(H.bandFor('T', { targets: null }), null);
});

// ---- mount / unmount with a tiny DOM ----
class Node_ {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.dataset = {}; this.hidden = false; this._text = ''; this.className = ''; this.listeners = {};
    const self = this;
    this.classList = { add: c => { self.className = (self.className + ' ' + c).trim(); } }; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  set textContent(v) { this._text = String(v); this.children = []; }
  append(...n) { for (const c of n) { if (typeof c === 'string') this._text += c; else { c.parent = this; this.children.push(c); } } }
  replaceChildren(...n) { this._text = ''; this.children = []; this.append(...n); }
  appendChild(c) { this.append(c); return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  find(pred, out = []) { if (pred(this)) out.push(this); for (const c of this.children) c.find(pred, out); return out; }
}
const docListeners = {};
globalThis.document = {
  body: { dataset: {} },
  createElement: t => new Node_(t), createElementNS: (ns, t) => new Node_(t),
  addEventListener: (t, f) => { (docListeners[t] ||= new Set()).add(f); },
  removeEventListener: (t, f) => { (docListeners[t] ||= new Set()).delete(f); },
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const stubApi = over => {
  const calls = [];
  Object.assign(globalThis.FarmApi, {
    listRooms: () => Promise.resolve([]), getReadings: () => Promise.resolve([]), getEvents: () => Promise.resolve([]), getRoomHarvest: () => Promise.resolve({ batches: [] }),
    listBatches: () => Promise.resolve([]), getBatch: () => Promise.resolve({ crates: [] }), listSettingsHistory: () => Promise.resolve([]), listCalibrations: () => Promise.resolve([]),
    ...over });
  return calls;
};
const cardsIn = view => view.find(n => n.className.split(' ').includes('ov-room'));
const tick = () => new Promise(r => setImmediate(r));

test('OV10 mount with no rooms shows the Add a room card', async () => {
  stubApi({});
  const view = new Node_('div');
  await OV.mount(view);
  const texts = view.find(n => n.tag === 'h1').map(n => n.textContent);
  assert.deepEqual(texts, ['Your farm today']);
  const empty = view.find(n => n.className.includes('ov-empty'))[0];
  assert.equal(empty.hidden, false);
  assert.match(empty.textContent, /No rooms yet\./);
  assert.equal(view.find(n => n.className.includes('ov-kpis'))[0].hidden, true);
  OV.unmount();
});

test('OV11 mount paints cards, a failing part leaves the rest working', async () => {
  stubApi({
    listRooms: () => Promise.resolve([mkRoom(1, 'Room 1'), mkRoom(2, 'Barn')]),
    getEvents: id => (id === 2 ? Promise.reject(new Error('events are down')) : Promise.resolve([])),
    getReadings: () => Promise.resolve([{ t: 1, T: 18, RH: 88, kwh: 1 }, { t: 2, T: 19, RH: 87, kwh: 2 }]),
  });
  const view = new Node_('div');
  await OV.mount(view);
  assert.equal(cardsIn(view).length, 2);
  const alert = view.find(n => n.tag === 'p' && n.className.includes('alert'))[0];
  assert.equal(alert.hidden, false);
  assert.equal(alert.textContent, 'events are down');
  assert.equal(view.find(n => n.tag === 'svg' && n.attrs.role === 'img' && /Temperature/.test(n.attrs['aria-label'])).length, 2);
  OV.unmount();
});

test('OV12 a late reply of an unmounted page does not paint into a new mount', async () => {
  const first = deferred();
  stubApi({ listRooms: () => first.promise });
  const v1 = new Node_('div');
  const p1 = OV.mount(v1);
  OV.unmount();
  stubApi({ listRooms: () => Promise.resolve([mkRoom(7, 'Second')]) });
  const v2 = new Node_('div');
  await OV.mount(v2);
  assert.equal(cardsIn(v2).length, 1);
  first.resolve([mkRoom(1, 'Old'), mkRoom(2, 'Old 2'), mkRoom(3, 'Old 3')]);
  await p1; await tick();
  assert.equal(cardsIn(v1).length, 0, 'the first mount stays empty');
  assert.equal(cardsIn(v2).length, 1);
  assert.match(cardsIn(v2)[0].textContent, /Second/);
  // a late failure of the first mount shows no message either
  OV.unmount();
});

test('OV13 a remount without unmount stops the old page; unmount removes the level listener', async () => {
  stubApi({ listRooms: () => Promise.resolve([mkRoom(1, 'A')]) });
  const v1 = new Node_('div'); await OV.mount(v1);
  assert.equal(docListeners['farm-level'].size, 1);
  const v2 = new Node_('div'); await OV.mount(v2);
  assert.equal(docListeners['farm-level'].size, 1);
  OV.unmount();
  assert.equal(docListeners['farm-level'].size, 0);
  OV.unmount();
});

test('OV14 the checklist shows for a fresh farm and Hide stores the flag', async () => {
  const stored = {};
  globalThis.localStorage = { getItem: k => stored[k] ?? null, setItem: (k, v) => { stored[k] = v; } };
  stubApi({ listRooms: () => Promise.resolve([mkRoom(1, 'A')]) });
  const view = new Node_('div'); await OV.mount(view);
  const start = view.find(n => n.className.includes('ov-start'))[0];
  assert.equal(start.hidden, false);
  const items = view.find(n => n.tag === 'li' && n.dataset.key);
  assert.deepEqual(items.map(i => i.dataset.done), ['true', 'false', 'false', 'false']);
  const hide = view.find(n => n.tag === 'button' && n.textContent === 'Hide this list')[0];
  hide.listeners.click[0]();
  assert.equal(stored['mushroom-farm.start.hidden'], '1');
  assert.equal(start.hidden, true);
  OV.unmount();
});

test('OV15 a room without a placed batch says so; crates are cached per batch', async () => {
  let getBatchCalls = 0;
  stubApi({
    listRooms: () => Promise.resolve([mkRoom(1, 'A'), mkRoom(2, 'B')]),
    getRoomHarvest: id => Promise.resolve(id === 1 ? { batches: [{ today: { kg: 4 } }] } : { batches: [] }),
    listBatches: () => Promise.resolve([{ id: 5, room_id: 1, state: 'placed', totals: { kg: 4 } }]),
    getBatch: () => { getBatchCalls++; return Promise.resolve({ crates: [{ t: Math.floor(Date.now() / 1000), kg: 4 }] }); },
  });
  const view = new Node_('div'); await OV.mount(view);
  const texts = view.find(n => n.className.includes('ov-harvest')).map(n => n.textContent);
  assert.deepEqual(texts, ['Harvest today: 4.0 kg', 'No batch in this room']);
  assert.equal(getBatchCalls, 1);
  OV.unmount();
});

test('C14 rampLine: the card line while the targets move', () => {
  const NOW = 1791450000, to = { T: 17, RH: 92, CO2: 1000 }, clock = globalThis.FarmUi.farmClock();
  const live = r => ({ crop: 'lionsmane', stage: 'pinning', ramp: r });
  assert.equal(H.rampLine(live(null), NOW), '');
  assert.equal(H.rampLine(null, NOW), '');
  assert.equal(H.rampLine(live({ to, endsAt: NOW - 1 }), NOW), '');
  const next = NOW + 86400;
  assert.equal(H.rampLine(live({ to, endsAt: next }), NOW), `Moving to Lion's mane Pinning targets, ready tomorrow about ${clock.hm(next)}`);
  let same = NOW + 600; while (clock.label(same).slice(0, 10) !== clock.label(NOW).slice(0, 10)) same -= 60;
  assert.equal(H.rampLine(live({ to, endsAt: same }), NOW), `Moving to Lion's mane Pinning targets, ready about ${clock.hm(same)}`);
});

// web/rooms.js helpers (docs/contracts/web.md 3.7, 3.8). The module registers into a local object.
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
require('../web/rooms.js');
const H = registered.rooms.helpers;
const R = { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 1791446400, archived_at: null,
  live: { reading: { room_id: 1, t: 1791450000, T: 18.2, RH: 88.4, CO2: 812, t_out: 31.5, rh_out: 62, ac_mode: 'cool', ac_setpoint: 17.5,
    fog: 1, air: 0, lights: 1, circ: 0, power_w: 1430, kwh: 12.84, ac_fan: 'auto', stage: 'fruiting', core: 19.1 },
    stage: 'fruiting', crop: 'oyster', targets: { T: 18, RH: 88, CO2: 1000 },
    status: { T: { lvl: 'good', icon: '✓', text: 'In band' }, RH: { lvl: 'good', icon: '✓', text: 'In band' }, CO2: { lvl: 'good', icon: '✓', text: 'Below limit' } },
    alarms: 0, running: true, error: null, flush: 1, blocks: 2000, air: null } };
const live = over => ({ ...R, live: { ...R.live, ...over } });
const reading = over => live({ reading: { ...R.live.reading, ...over } });
const warnStatus = { ...R.live.status, RH: { lvl: 'warning', icon: '▲', text: 'High' } };

test('RS1 module', () => {
  assert.equal(typeof registered.rooms.mount, 'function');
  assert.equal(typeof registered.rooms.unmount, 'function');
  assert.equal(typeof registered.rooms.update, 'function');
  for (const k of ['statusChip', 'cropText', 'cardTexts', 'machineLines', 'infoText', 'stateText', 'alarmsChip', 'upsertRoom', 'takeLive',
    'refreshRoom', 'refreshDelay', 'newRoomName', 'readStored', 'importPlan', 'importRooms']) {
    assert.equal(typeof H[k], 'function', k);
  }
  assert.equal(typeof document, 'undefined');
  assert.doesNotThrow(() => registered.rooms.unmount());
  assert.equal(registered.rooms.update({ id: 1, tab: 'live' }), false);
});

test('RS2 statusChip precedence', () => {
  assert.deepEqual(H.statusChip(R), { lvl: 'good', icon: '✓', text: 'All good' });
  assert.deepEqual(H.statusChip(live({ status: warnStatus })), { lvl: 'info', icon: '•', text: 'Out of band' });
  assert.deepEqual(H.statusChip(live({ alarms: 1 })), { lvl: 'warning', icon: '▲', text: '1 alarm' });
  assert.equal(H.statusChip(live({ alarms: 2, status: warnStatus })).text, '2 alarms');
  assert.deepEqual(H.statusChip(live({ running: false, error: 'boom', alarms: 2 })), { lvl: 'serious', icon: '▲', text: 'Stopped' });
  assert.equal(H.statusChip(live({ status: null })).text, 'All good');
  assert.equal(H.statusChip({ ...R, live: null }).text, 'Stopped');
});

test('RS3 cardTexts', () => {
  assert.deepEqual(H.cardTexts(R), {
    name: 'Room 1', crop: 'Grey oyster · Fruiting · flush 1 · 2000 blocks', air: 'Air exchange off',
    T: '18.2 °C', RH: '88 % RH', CO2: '812 ppm',
    machines: 'AC Cool 17.5 °C · Fogger level 1 · Lights on · Circulation fan off · Power 1.43 kW', stopped: null });
  assert.equal(H.cardTexts(reading({ air: 1 })).air, 'Air exchange on');
  const empty = H.cardTexts(live({ reading: null }));
  assert.equal(empty.air, '–');
  assert.equal(empty.T, '— °C'); assert.equal(empty.RH, '— % RH'); assert.equal(empty.CO2, '— ppm');
  assert.equal(empty.machines, '');
  assert.equal(H.cardTexts(live({ flush: null, blocks: null })).crop, 'Grey oyster · Fruiting');
  assert.ok(H.cardTexts(live({ crop: 'lionsmane-x', stage: 'pinning' })).crop.startsWith('lionsmane-x · Pinning'));
  assert.ok(H.cardTexts(live({ crop: null })).crop.startsWith('–'));
  assert.equal(H.cardTexts(live({ running: false, error: 'boom' })).stopped, 'Stopped: boom');
  assert.equal(H.cardTexts(live({ running: false, error: null })).stopped, 'Stopped');
});

test('RS4 machineLines', () => {
  assert.deepEqual(H.machineLines({ ...R.live.reading, ac_mode: 'off', fog: 0, lights: 0, circ: 1, power_w: null }),
    ['AC off', 'Fogger off', 'Lights off', 'Circulation fan on']);
  assert.deepEqual(H.machineLines(null), []);
});

test('RS5 header texts', () => {
  assert.equal(H.infoText(R), 'Grey oyster · Fruiting · flush 1 · 2000 blocks · 60 m³');
  assert.equal(H.infoText(live({ blocks: null })), 'Grey oyster · Fruiting · flush 1 · 60 m³');
  assert.equal(H.infoText(live({ flush: null, blocks: null })), 'Grey oyster · Fruiting · 60 m³');
  assert.equal(H.stateText(R), 'Running');
  assert.equal(H.stateText(live({ running: false, error: 'boom' })), 'Stopped: boom');
  assert.equal(H.stateText(live({ running: false, error: null })), 'Stopped');
  assert.equal(H.stateText({ ...R, live: null }), 'Stopped');
  assert.deepEqual(H.alarmsChip(0), { lvl: 'good', icon: '✓', text: 'No alarms' });
  assert.equal(H.alarmsChip(1).text, '1 alarm');
  assert.deepEqual(H.alarmsChip(3), { lvl: 'warning', icon: '▲', text: '3 alarms' });
});

test('RS6 room lists', () => {
  const r1 = { ...R, id: 1 }, r2 = { ...R, id: 2 }, r3 = { ...R, id: 3 };
  const list = [r1, r3];
  assert.deepEqual(H.upsertRoom(list, r2).map(r => r.id), [1, 2, 3]);
  assert.deepEqual(list, [r1, r3]);
  const renamed = { ...r3, name: 'Shed' };
  assert.equal(H.upsertRoom(list, renamed)[1], renamed);
  assert.equal(H.upsertRoom(list, renamed).length, 2);
  assert.deepEqual(H.upsertRoom([r1, r2, r3], { ...r1, archived_at: 5 }).map(r => r.id), [2, 3]);
  assert.deepEqual(H.upsertRoom([r2, r3], { ...r1, archived_at: 5 }).map(r => r.id), [2, 3]);

  const reply = [{ ...R, id: 1, live: { ...R.live, status: warnStatus, targets: { T: 19, RH: 90, CO2: 900 }, reading: { ...R.live.reading, t: 5 } } },
    { ...R, id: 9 }];
  const out = H.takeLive([{ ...R, id: 1 }, r2], reply);
  assert.equal(out.length, 2);
  assert.equal(out[0].live.status, warnStatus);
  assert.deepEqual(out[0].live.targets, { T: 19, RH: 90, CO2: 900 });
  assert.equal(out[0].live.reading.t, R.live.reading.t);
  assert.equal(out[1], r2);

  const air = { on: true };
  const older = { ...R, live: { ...R.live, air, flush: 2, blocks: 10, status: warnStatus, targets: null, reading: { ...R.live.reading, t: R.live.reading.t - 30 } } };
  const m = H.refreshRoom(R, older);
  assert.equal(m.live.air, air); assert.equal(m.live.flush, 2); assert.equal(m.live.blocks, 10);
  assert.equal(m.live.status, warnStatus); assert.equal(m.live.targets, null);
  assert.equal(m.live.reading, R.live.reading);
  const newer = { ...older, live: { ...older.live, reading: { ...R.live.reading, t: R.live.reading.t + 30 } } };
  assert.equal(H.refreshRoom(R, newer).live.reading, newer.live.reading);
  const stopped = { ...R, live: null };
  assert.equal(H.refreshRoom(R, stopped), stopped);

  assert.equal(H.refreshDelay(null, 5), 0);
  assert.equal(H.refreshDelay(1000, 11000), 20000);
  assert.equal(H.refreshDelay(1000, 40000), 0);
  assert.equal(H.newRoomName('  ', 2), 'Room 3');
  assert.equal(H.newRoomName(' Shed ', 2), 'Shed');
});

test('RS7 readStored', () => {
  const stub = text => ({ getItem: () => text });
  const good = H.readStored(stub(JSON.stringify({ version: 1, rooms: [null, { name: 'A', volume: 80, vent: 'exhaust', mix: [{ crop: 'oyster', blocks: 900 }] }, 'bad'] })));
  assert.equal(good.length, 1);
  assert.equal(good[0].i, 1);
  assert.equal(good[0].room.name, 'A');
  assert.equal('vent' in good[0].room, false);
  assert.deepEqual(H.readStored({ getItem() { throw new Error('blocked'); } }), []);
  assert.deepEqual(H.readStored(stub('{')), []);
  assert.deepEqual(H.readStored(stub(null)), []);
  assert.deepEqual(H.readStored(stub('{"rooms":3}')), []);
});

const stored = (over = {}) => H.readStored({ getItem: () => JSON.stringify({ version: 1, rooms: [{ name: 'N', volume: 80, mix: [{ crop: 'oyster', blocks: 900 }, { crop: 'pink', blocks: 100, co2PerBlock: 55 }], ...over }] }) })[0];
const CALIB = { ua: 120, infAch: 0.5, moistBuffer: 3, co2PerBlock: 50, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: '2026-10-01T04:00:00.000Z' };
const NOW = 1791450000;

test('RS8 importPlan', () => {
  const blank = stored({ name: '   ', volume: 55 }); blank.i = 2;
  assert.deepEqual(H.importPlan(blank, NOW).room, { name: 'Room 3', volume: 55 });
  const p = H.importPlan(stored({ calib: CALIB }), NOW);
  assert.deepEqual(p.mix, [{ crop: 'oyster', blocks: 900, co2_per_block: null }, { crop: 'pink', blocks: 100, co2_per_block: 55 }]);
  assert.equal(H.importPlan(stored({ calib: null }), NOW).calibration, null);
  assert.deepEqual(p.calibration, { ua: 120, inf_ach: 0.5, moist_buffer: 3, co2_per_block: 50, rmse_t: 0.2, rmse_rh: 1.5, rmse_co2: 30,
    log_rows: null, source: 'import', run_at: 1790827200 });
  for (const date of ['2030-01-01T00:00:00.000Z', '', 'nonsense']) {
    assert.equal('run_at' in H.importPlan(stored({ calib: { ...CALIB, date } }), NOW).calibration, false, date);
  }
  for (const T of [-1, NaN, undefined]) {
    const c = H.importPlan(stored({ calib: { ...CALIB, rmse: { RH: 1.5, CO2: 30, T } } }), NOW).calibration;
    assert.equal(c.rmse_t, null);
  }
  assert.deepEqual(ClimateRoomRules.checkRoom(p.room, false), []);
  assert.deepEqual(ClimateRoomRules.checkMix(p.mix), []);
});

function recorder(over = {}) {
  const calls = [];
  const api = {};
  let k = 0;
  for (const name of ['createRoom', 'saveMix', 'saveCalibration', 'applyCalibration']) {
    api[name] = (...a) => {
      calls.push([name, ...a]);
      if (over[name]) return over[name](...a);
      if (name === 'createRoom') { k++; return Promise.resolve({ id: 10 + k, name: a[0].name }); }
      if (name === 'saveCalibration') return Promise.resolve({ id: 90 });
      return Promise.resolve({});
    };
  }
  return { api, calls };
}

test('RS9 importRooms', async () => {
  const entries = [stored({ name: 'One', calib: CALIB }), stored({ name: 'Two' })];
  const seen = [];
  const a = recorder();
  const res = await H.importRooms(entries, a.api, { nowS: NOW, onRoom: (k, n) => seen.push([k, n]) });
  assert.deepEqual(res, { created: 2, failed: null });
  assert.deepEqual(a.calls.map(c => c[0] + (c[1] === undefined ? '' : ':' + (typeof c[1] === 'number' ? c[1] : ''))),
    ['createRoom:', 'saveMix:11', 'saveCalibration:11', 'applyCalibration:11', 'createRoom:', 'saveMix:12']);
  assert.equal(a.calls[3][2], 90);
  assert.deepEqual(seen, [[1, 2], [2, 2]]);

  const err = new Error('nope');
  let n = 0;
  const b = recorder({ createRoom: (body) => { n++; return n === 2 ? Promise.reject(err) : Promise.resolve({ id: 11, name: body.name }); } });
  const r2 = await H.importRooms(entries, b.api, { nowS: NOW, onRoom() {} });
  assert.deepEqual(r2, { created: 1, failed: { name: 'Two', error: err } });
  assert.equal(b.calls.at(-1)[0], 'createRoom');

  const c = recorder({ saveMix: () => Promise.reject(err) });
  const r3 = await H.importRooms(entries, c.api, { nowS: NOW, onRoom() {} });
  assert.equal(r3.created, 1);
  assert.equal(r3.failed.error, err);
  assert.equal(c.calls.at(-1)[0], 'saveMix');

  const d = recorder({ createRoom: () => { throw err; } });
  const r4 = await H.importRooms(entries, d.api, { nowS: NOW, onRoom() {} });
  assert.deepEqual(r4, { created: 0, failed: { name: 'One', error: err } });
});

test('RS10 import on the wire', async t => {
  const { startFakeApi } = require('./fakes/api-server.js');
  const fake = await startFakeApi();
  t.after(() => fake.close());
  const saved = FarmApi.base;
  FarmApi.base = fake.url;
  t.after(() => { FarmApi.base = saved; });
  fake.reply('POST', '/api/rooms', 201, { id: 7, name: 'North' });
  fake.reply('POST', '/api/rooms/7/calibrations', 201, { id: 3 });
  const entry = stored({ name: 'North', calib: CALIB });
  const plan = H.importPlan(entry, NOW);
  const res = await H.importRooms([entry], FarmApi, { nowS: NOW, onRoom() {} });
  assert.deepEqual(res, { created: 1, failed: null });
  const reqs = fake.requests.filter(r => r.path.startsWith('/api/')).map(r => [r.method, r.path, r.body]);
  assert.deepEqual(reqs, [
    ['POST', '/api/rooms', plan.room],
    ['PUT', '/api/rooms/7/mix', plan.mix],
    ['POST', '/api/rooms/7/calibrations', plan.calibration],
    ['POST', '/api/rooms/7/calibrations/3/apply', null],
  ]);
});

test('RS11 import finished after unmount still writes the marker', async t => {
  const cache = {};
  const mk = () => {
    const e = { dataset: {}, hidden: false, value: '', textContent: '', disabled: false, listeners: {},
      addEventListener(n, f) { this.listeners[n] = f; }, setAttribute() {}, removeAttribute() {}, replaceChildren() {}, append() {}, closest: () => null,
      querySelector: sel => (cache[sel] ||= mk()), querySelectorAll: () => [] };
    return e;
  };
  const el = mk();
  const stored = [];
  const store = { 'mushroom-farm.rooms.v1': JSON.stringify({ version: 1, rooms: [{ name: 'A', volume: 80, mix: [] }] }) };
  const saved = { document: globalThis.document, localStorage: globalThis.localStorage, confirm: globalThis.confirm, api: { ...FarmApi } };
  globalThis.document = { createElement: mk };
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { stored.push([k, v]); } };
  globalThis.confirm = () => true;
  t.after(() => {
    registered.rooms.unmount();
    for (const k of ['document', 'localStorage', 'confirm']) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
    Object.assign(FarmApi, saved.api);
  });
  let release;
  FarmApi.stream = () => () => {};
  FarmApi.createRoom = () => new Promise(res => { release = () => res({ id: 5, name: 'A' }); });
  FarmApi.saveMix = async () => ({});
  FarmApi.listRooms = async () => [];
  registered.rooms.mount(el, {});
  const clicked = cache['#rhImport'].listeners.click();
  registered.rooms.unmount();
  release();
  await clicked;
  assert.equal(stored.length, 1);
  assert.equal(stored[0][0], 'mushroom-farm.rooms.v1.imported');
});

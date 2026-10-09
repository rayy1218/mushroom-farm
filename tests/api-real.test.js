// The real modules behind the API: db.js, rooms.js, harvest-db.js and harvest-api.js (C3 12.2, C10 13).
// Checks statuses, reply shapes and stored values only.
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

const { openDb } = require('../server/db.js');
const { createRoomManager } = require('../server/rooms.js');
const { openHarvest } = require('../server/harvest-db.js');
const { createHarvestRoutes, startOfDay } = require('../server/harvest-api.js');
const { createApi } = require('../server/api.js');

const root = path.join(__dirname, '..');
const WAIT_MS = 5000;
const DAY = 86400;
const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'air', 'lights', 'circ',
  'power_w', 'kwh', 'ac_fan', 'stage', 'core'];
const RUN_INFO_KEYS = ['id', 'room_id', 'created_at', 'kind', 'verdict', 'blocks', 'days', 'kwh', 'rm', 'utilisation',
  'real_start', 'note', 'inputs'];
const EQUIPMENT_KEYS = ['room_id', 'saved_at', 'ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height'];

function sortedKeys(o) { return Object.keys(o).sort(); }

function withTimeout(promise, ms, what) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`timeout: ${what}`)), ms); });
  return Promise.race([promise, limit]).finally(() => clearTimeout(timer));
}

async function startStack(t) {
  const db = openDb(':memory:');
  const rooms = createRoomManager({ db, tickMs: 0 });
  rooms.start();
  const harvest = openHarvest(db);
  const fatals = [];
  const api = createApi({ db, rooms, root, onFatal: e => fatals.push(e), heartbeatMs: 1000,
    extraRoutes: createHarvestRoutes({ db, harvest }) });
  const server = http.createServer(api.handle);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    api.close();
    server.close();
    server.closeAllConnections();
    rooms.stop();
    db.close();
  });
  async function call(method, p, body) {
    const init = { method, signal: AbortSignal.timeout(WAIT_MS) };
    if (body !== undefined) {
      init.headers = { 'content-type': 'application/json' };
      init.body = typeof body === 'string' ? body : JSON.stringify(body);
    }
    const res = await fetch(base + p, init);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  }
  return { db, rooms, harvest, base, call, fatals };
}

// A cycle Result that passes checkSimulationRun: one day, 24 hourly rows.
function smallCycle() {
  return {
    verdict: 'ok',
    totals: { days: 1, pass: true, kwh: 12.5, rm: 7.1, rmPerBlock: 0.007 },
    stages: [{ stage: 'fruiting', days: 1 }],
    series: Array.from({ length: 24 }, (_, h) => ({ h, T: 18, RH: 88, CO2: 800 })),
  };
}

function runBody(settings, note) {
  return {
    kind: 'cycle',
    inputs: {
      mix: [{ crop: 'oyster', blocks: 1000, co2_per_block: null }],
      settings,
      region: 'my-lowland',
      tariff: 0.57,
      volume: 60,
      calibration: null,
      empty_below: null,
      equipment: null,
    },
    result: smallCycle(),
    note,
  };
}

const EQUIPMENT = { ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: 'pu50', roof: 'pu50', height: 3 };

test('rooms: list, get, create, patch, readings, stream', async t => {
  const s = await startStack(t);

  const list = await s.call('GET', '/api/rooms');
  assert.equal(list.status, 200);
  assert.equal(list.json.length, 1);
  const room = list.json[0];
  assert.equal(room.name, 'Room 1');
  assert.equal(room.adapter, 'sim');
  assert.equal(room.archived_at, null);
  const live = room.live;
  assert.equal(live.running, true);
  assert.equal(live.error, null);
  assert.equal(typeof live.stage, 'string');
  assert.equal(typeof live.crop, 'string');
  assert.deepEqual(sortedKeys(live.targets), ['CO2', 'RH', 'T']);
  assert.equal(typeof live.alarms, 'number');
  assert.equal(typeof live.flush, 'number');
  assert.ok(live.blocks === null || Number.isInteger(live.blocks));
  assert.deepEqual(sortedKeys(live.reading), [...READING_KEYS].sort());
  assert.deepEqual(Object.keys(live.reading), READING_KEYS);
  assert.deepEqual(sortedKeys(live.air), ['delayed', 'manual', 'manualOn', 'nextPurgeS', 'on', 'purgeS', 'reason', 'state', 'timed', 'today', 'why']);
  assert.ok(['idle', 'purge', 'after'].includes(live.air.state));
  assert.deepEqual(sortedKeys(live.air.today), ['avgS', 'capped', 'purges']);

  const id = room.id;
  const got = await s.call('GET', `/api/rooms/${id}`);
  // Only the list route exists for reading rooms; a GET of one room answers 404 (C3 section 5).
  assert.equal(got.status, 404);

  const created = await s.call('POST', '/api/rooms', { name: 'Room 2', volume: 200, settings: { crop: 'pink' } });
  assert.equal(created.status, 201);
  assert.equal(created.json.volume, 200);
  assert.equal(created.json.live.running, true);
  const stored = await s.call('GET', `/api/rooms/${created.json.id}/settings`);
  assert.equal(stored.json.roomM3, 200);
  assert.equal(stored.json.crop, 'pink');

  const patched = await s.call('PATCH', `/api/rooms/${created.json.id}`, { name: 'Room Two' });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.name, 'Room Two');
  assert.equal((await s.call('PATCH', `/api/rooms/${created.json.id}`, { vent: 3 })).status, 400);

  const archived = await s.call('PATCH', `/api/rooms/${created.json.id}`, { archived: true });
  assert.equal(archived.status, 200);
  assert.equal(typeof archived.json.archived_at, 'number');
  assert.equal(archived.json.live, null);
  assert.equal((await s.call('GET', `/api/rooms/${created.json.id}/settings`)).status, 404);
  assert.equal((await s.call('GET', '/api/rooms/9999/settings')).status, 404);

  const raw = await s.call('GET', `/api/rooms/${id}/readings`);
  assert.equal(raw.status, 200);
  assert.ok(raw.json.length >= 1);
  assert.deepEqual(Object.keys(raw.json[0]), READING_KEYS);
  assert.equal(raw.json[0].room_id, id);
  const avg = await s.call('GET', `/api/rooms/${id}/readings?step=3600`);
  assert.equal(avg.status, 200);
  assert.deepEqual(Object.keys(avg.json[0]), READING_KEYS);
  assert.equal(avg.json[0].t % 3600, 0);
  assert.equal((await s.call('GET', `/api/rooms/${id}/readings?from=abc`)).status, 400);
  assert.equal((await s.call('GET', '/api/rooms/9999/readings')).status, 404);
});

test('settings: save changes only what was sent; stream announces it', async t => {
  const s = await startStack(t);
  const id = s.rooms.list()[0].id;
  const before = (await s.call('GET', `/api/rooms/${id}/settings`)).json;

  const stream = await withTimeout(new Promise((resolve, reject) => {
    const req = http.get(s.base + '/api/stream', res => resolve({ req, res }));
    req.on('error', reject);
  }), WAIT_MS, 'stream connect');
  t.after(() => stream.req.destroy());
  assert.equal(stream.res.statusCode, 200);
  assert.match(stream.res.headers['content-type'], /^text\/event-stream/);
  let seen = '';
  stream.res.setEncoding('utf8');
  const waiters = [];
  stream.res.on('data', chunk => {
    seen += chunk;
    for (const w of waiters.slice()) if (w.test(seen)) { waiters.splice(waiters.indexOf(w), 1); w.done(); }
  });
  const until = (re, what) => withTimeout(new Promise(resolve => {
    const w = { test: text => re.test(text), done: resolve };
    if (w.test(seen)) resolve(); else waiters.push(w);
  }), WAIT_MS, what);

  await until(/^retry: 3000\n\n/, 'retry line');

  const put = await s.call('PUT', `/api/rooms/${id}/settings`, { settings: { spT: 20 }, note: 'cooler' });
  assert.equal(put.status, 200);
  assert.deepEqual(sortedKeys(put.json), ['settings', 'warnings']);
  assert.ok(Array.isArray(put.json.warnings));
  assert.equal(put.json.settings.spT, 20);
  await until(/event: settings\ndata: /, 'settings event');

  const after = (await s.call('GET', `/api/rooms/${id}/settings`)).json;
  assert.deepEqual({ ...after, spT: before.spT }, before);
  assert.equal(after.spT, 20);

  const history = await s.call('GET', `/api/rooms/${id}/settings/history`);
  assert.equal(history.status, 200);
  assert.equal(history.json[0].note, 'cooler');
  assert.equal(history.json[0].room_id, id);

  assert.equal((await s.call('PUT', `/api/rooms/${id}/settings`, { settings: 5 })).status, 400);
  assert.equal((await s.call('PUT', '/api/rooms/9999/settings', { settings: {} })).status, 404);
});

test('calibrations: save, then apply', async t => {
  const s = await startStack(t);
  const id = s.rooms.list()[0].id;
  const body = { ua: 90, inf_ach: 0.3, moist_buffer: 3.5, co2_per_block: 40, rmse_t: 0.2, rmse_rh: 1.8, rmse_co2: 35, log_rows: 100 };

  const saved = await s.call('POST', `/api/rooms/${id}/calibrations`, body);
  assert.equal(saved.status, 201);
  assert.equal(saved.json.ua, 90);
  assert.equal(saved.json.applied, false);
  assert.equal(saved.json.applied_at, null);
  assert.equal(saved.json.source, null);
  assert.equal((await s.call('POST', `/api/rooms/${id}/calibrations`, { ...body, ua: 5 })).status, 400);

  const applied = await s.call('POST', `/api/rooms/${id}/calibrations/${saved.json.id}/apply`);
  assert.equal(applied.status, 200);
  assert.equal(applied.json.applied, true);
  assert.equal(typeof applied.json.applied_at, 'number');

  const list = await s.call('GET', `/api/rooms/${id}/calibrations`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.map(r => [r.id, r.applied]), [[saved.json.id, true]]);
  assert.equal((await s.call('POST', `/api/rooms/${id}/calibrations/9999/apply`)).status, 404);
  assert.equal(s.rooms.get(id).live.running, true);
});

test('simulation runs 6.20-6.24', async t => {
  const s = await startStack(t);
  const id = s.rooms.list()[0].id;
  const settings = (await s.call('GET', `/api/rooms/${id}/settings`)).json;

  assert.deepEqual((await s.call('GET', `/api/rooms/${id}/simulations`)).json, []);

  const created = await s.call('POST', `/api/rooms/${id}/simulations`, runBody(settings, '  first  '));
  assert.equal(created.status, 201);
  assert.deepEqual(Object.keys(created.json), RUN_INFO_KEYS);
  assert.equal('result' in created.json, false);
  assert.equal(created.json.kind, 'cycle');
  assert.equal(created.json.verdict, 'pass');
  assert.equal(created.json.blocks, 1000);
  assert.equal(created.json.days, 1);
  assert.equal(created.json.kwh, 12.5);
  assert.equal(created.json.rm, 7.1);
  assert.equal(created.json.note, 'first');
  assert.equal(created.json.real_start, null);

  const bad = runBody(settings);
  bad.inputs.region = 'nowhere';
  assert.equal((await s.call('POST', `/api/rooms/${id}/simulations`, bad)).status, 400);
  assert.equal((await s.call('POST', '/api/rooms/9999/simulations', runBody(settings))).status, 404);

  const second = await s.call('POST', `/api/rooms/${id}/simulations`, runBody(settings));
  assert.equal(second.json.note, null);

  const list = await s.call('GET', `/api/rooms/${id}/simulations`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.json.map(r => r.id), [second.json.id, created.json.id]);
  assert.equal(list.json.every(r => !('result' in r)), true);
  const page = await s.call('GET', `/api/rooms/${id}/simulations?limit=1&before=${second.json.id}`);
  assert.deepEqual(page.json.map(r => r.id), [created.json.id]);
  assert.equal((await s.call('GET', `/api/rooms/${id}/simulations?limit=0`)).status, 400);

  const one = await s.call('GET', `/api/rooms/${id}/simulations/${created.json.id}`);
  assert.equal(one.status, 200);
  assert.deepEqual(Object.keys(one.json), [...RUN_INFO_KEYS, 'result']);
  assert.equal(one.json.result.series.length, 24);
  assert.equal(one.json.result.totals.days, 1);
  assert.equal((await s.call('GET', `/api/rooms/${id}/simulations/9999`)).status, 404);

  const realStart = Math.floor(Date.now() / 1000) - DAY;
  const patched = await s.call('PATCH', `/api/rooms/${id}/simulations/${created.json.id}`, { note: 'linked', real_start: realStart });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.note, 'linked');
  assert.equal(patched.json.real_start, realStart);
  assert.equal((await s.call('PATCH', `/api/rooms/${id}/simulations/${created.json.id}`, {})).status, 400);
  assert.equal((await s.call('PATCH', `/api/rooms/${id}/simulations/9999`, { note: 'x' })).status, 404);
  assert.equal((await s.call('GET', `/api/rooms/${id}/simulations/${created.json.id}`)).json.real_start, realStart);

  const deleted = await s.call('DELETE', `/api/rooms/${id}/simulations/${created.json.id}`);
  assert.equal(deleted.status, 200);
  assert.equal(deleted.json.id, created.json.id);
  assert.equal((await s.call('GET', `/api/rooms/${id}/simulations/${created.json.id}`)).status, 404);
  assert.equal((await s.call('DELETE', `/api/rooms/${id}/simulations/${created.json.id}`)).status, 404);
});

test('equipment 6.25 and 6.26 keep the settings airM3h in step', async t => {
  const s = await startStack(t);
  const id = s.rooms.list()[0].id;

  const none = await s.call('GET', `/api/rooms/${id}/equipment`);
  assert.equal(none.status, 200);
  assert.equal(none.json, null);

  const settingsAir = async () => (await s.call('GET', `/api/rooms/${id}/settings`)).json.airM3h;
  const versions = async () => (await s.call('GET', `/api/rooms/${id}/settings/history`)).json.length;
  const air0 = await settingsAir();
  const v0 = await versions();
  const differing = air0 === 2400 ? 2600 : 2400;

  const saved = await s.call('PUT', `/api/rooms/${id}/equipment`, { ...EQUIPMENT, air_m3h: differing });
  assert.equal(saved.status, 200);
  assert.deepEqual(Object.keys(saved.json), EQUIPMENT_KEYS);
  assert.equal(saved.json.air_m3h, differing);
  assert.equal(await settingsAir(), differing);
  assert.equal(await versions(), v0 + 1);
  const hist = (await s.call('GET', `/api/rooms/${id}/settings/history`)).json;
  assert.equal(hist[0].note, 'Air exchange size from Your machines');

  const same = await s.call('PUT', `/api/rooms/${id}/equipment`, { ...EQUIPMENT, air_m3h: differing, fog_lph: 4 });
  assert.equal(same.status, 200);
  assert.equal(same.json.fog_lph, 4);
  assert.equal(await versions(), v0 + 1);

  const got = await s.call('GET', `/api/rooms/${id}/equipment`);
  assert.deepEqual(got.json, same.json);

  assert.equal((await s.call('PUT', `/api/rooms/${id}/equipment`, { ...EQUIPMENT, vent: 1 })).status, 400);
  const { height, ...partial } = EQUIPMENT;
  assert.equal((await s.call('PUT', `/api/rooms/${id}/equipment`, partial)).status, 400);
  assert.equal((await s.call('PUT', `/api/rooms/${id}/equipment`, { ...EQUIPMENT, air_m3h: 5 })).status, 400);
  assert.equal(await settingsAir(), differing);
  assert.equal((await s.call('PUT', '/api/rooms/9999/equipment', EQUIPMENT)).status, 404);
  assert.equal((await s.call('GET', '/api/rooms/9999/equipment')).status, 404);
});

test('harvest routes C10 9.1-9.10, with the same-day clamps of lead decisions 77 and 78', async t => {
  const s = await startStack(t);
  const roomId = s.rooms.list()[0].id;
  const nowS = Math.floor(Date.now() / 1000);
  const received = nowS - 2; // a time today (or just before midnight; the clamp holds either way)
  const batch = { crop: 'oyster', strain: ' PO-2 ', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: received };

  assert.deepEqual((await s.call('GET', '/api/batches')).json, []);
  assert.equal((await s.call('GET', '/api/batches?state=lost')).status, 400);
  assert.equal((await s.call('GET', '/api/batches?room=9999')).status, 400);

  const created = await s.call('POST', '/api/batches', batch);
  assert.equal(created.status, 201);
  const b = created.json;
  assert.equal(b.state, 'received');
  assert.equal(b.strain, 'PO-2');
  assert.equal(b.room_id, null);
  assert.equal(b.room_name, null);
  assert.equal(b.flush_gap_days, 5);
  assert.deepEqual(b.totals, { crates: 0, kg: 0, g_per_block: 0, be_pct: 0, flushes: 0 });
  assert.equal((await s.call('POST', '/api/batches', { ...batch, block_count: 0 })).status, 400);
  assert.equal((await s.call('POST', '/api/batches', { ...batch, received_at: nowS + 3600 })).status, 400);

  const patched = await s.call('PATCH', `/api/batches/${b.id}`, { notes: 'first lot', flush_gap_days: 7 });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.notes, 'first lot');
  assert.equal(patched.json.flush_gap_days, 7);
  assert.equal((await s.call('PATCH', `/api/batches/${b.id}`, { crop: 'nope' })).status, 400);
  assert.equal((await s.call('PATCH', '/api/batches/9999', { notes: 'x' })).status, 404);

  // Place: the farm-day rule lets 00:00 today pass; the route stores received_at instead (LD 77, 78).
  const sod = startOfDay(received);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/clear`, {})).status, 400);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/place`, { room_id: 9999 })).status, 400);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/place`, { room_id: roomId, placed_at: sod - DAY })).status, 400);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/place`, { room_id: roomId, placed_at: nowS + 3600 })).status, 400);
  const placed = await s.call('POST', `/api/batches/${b.id}/place`, { room_id: roomId, placed_at: sod });
  assert.equal(placed.status, 200);
  assert.equal(placed.json.state, 'placed');
  assert.equal(placed.json.room_name, 'Room 1');
  assert.equal(placed.json.placed_at, received);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/place`, { room_id: roomId })).status, 400);

  const filtered = await s.call('GET', `/api/batches?state=placed&room=${roomId}`);
  assert.deepEqual(filtered.json.map(x => x.id), [b.id]);
  assert.deepEqual((await s.call('GET', '/api/batches?state=cleared')).json, []);

  assert.equal((await s.call('POST', `/api/batches/${b.id}/crates`, { kg: -1 })).status, 400);
  const crate = await s.call('POST', `/api/batches/${b.id}/crates`, { kg: 12.5, picker: ' Ali ' });
  assert.equal(crate.status, 201);
  assert.deepEqual(sortedKeys(crate.json), ['crate', 'flush', 'totals']);
  assert.equal(crate.json.crate.kg, 12.5);
  assert.equal(crate.json.crate.picker, 'Ali');
  assert.equal(crate.json.crate.batch_id, b.id);
  assert.equal(crate.json.crate.deleted_at, null);
  assert.equal(crate.json.flush, 1);
  assert.equal(crate.json.totals.crates, 1);
  assert.equal(crate.json.totals.kg, 12.5);
  const second = await s.call('POST', `/api/batches/${b.id}/crates`, { kg: 3 });
  assert.equal(second.status, 201);

  const detail = await s.call('GET', `/api/batches/${b.id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.crates.length, 2);
  assert.ok(Array.isArray(detail.json.flushes));
  assert.equal(detail.json.totals.kg, 15.5);
  assert.equal((await s.call('GET', '/api/batches/9999')).status, 404);
  assert.equal((await s.call('GET', '/api/batches/abc')).status, 404);

  const rh = await s.call('GET', `/api/rooms/${roomId}/harvest`);
  assert.equal(rh.status, 200);
  assert.deepEqual(rh.json.room, { id: roomId, name: 'Room 1' });
  assert.equal(rh.json.day_start, startOfDay(nowS));
  assert.equal(rh.json.batches.length, 1);
  assert.equal(rh.json.batches[0].id, b.id);
  assert.equal(rh.json.batches[0].flush, 1);
  assert.equal(rh.json.batches[0].today.kg, 15.5);
  assert.equal((await s.call('GET', '/api/rooms/9999/harvest')).status, 404);

  assert.equal((await s.call('DELETE', `/api/batches/${b.id}`)).status, 400);
  const undone = await s.call('DELETE', `/api/crates/${second.json.crate.id}`);
  assert.equal(undone.status, 200);
  assert.equal(undone.json.id, second.json.crate.id);
  assert.equal(typeof undone.json.deleted_at, 'number');
  assert.equal((await s.call('DELETE', `/api/crates/${second.json.crate.id}`)).status, 400);
  assert.equal((await s.call('DELETE', '/api/crates/9999')).status, 404);
  assert.equal((await s.call('GET', `/api/batches/${b.id}`)).json.crates.length, 1);

  // Clear: the same clamp, max(cleared_at, placed_at).
  assert.equal((await s.call('POST', `/api/batches/${b.id}/clear`, { cleared_at: nowS + 3600 })).status, 400);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/clear`, { extra: 1 })).status, 400);
  const cleared = await s.call('POST', `/api/batches/${b.id}/clear`, { cleared_at: sod });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.state, 'cleared');
  assert.equal(cleared.json.cleared_at, received);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/clear`, {})).status, 400);
  assert.equal((await s.call('POST', `/api/batches/${b.id}/crates`, { kg: 1 })).status, 400);

  // A cleared batch's crate can still be undone (LD 68); a batch without crates can be deleted.
  assert.equal((await s.call('DELETE', `/api/crates/${crate.json.crate.id}`)).status, 200);
  const spare = (await s.call('POST', '/api/batches', batch)).json;
  assert.equal((await s.call('POST', `/api/batches/${spare.id}/crates`, { kg: 1 })).status, 400);
  const removed = await s.call('DELETE', `/api/batches/${spare.id}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.json.id, spare.id);
  assert.equal((await s.call('GET', `/api/batches/${spare.id}`)).status, 404);
  assert.equal((await s.call('DELETE', `/api/batches/${spare.id}`)).status, 404);
  assert.deepEqual(s.fatals, []);
});

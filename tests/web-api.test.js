// web/api.js: FarmApi (docs/contracts/web.md section 4, table 7.3), against the lead's fake API server.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startFakeApi } = require('./fakes/api-server.js');
require('../web/api.js');
const FarmApi = globalThis.FarmApi;

function apiRequests(fake) { return fake.requests.filter(r => r.path.startsWith('/api/')); }

async function withFake(t, opts) {
  const fake = await startFakeApi(opts);
  FarmApi.base = fake.url;
  t.after(() => fake.close());
  return fake;
}

test('the 19 request functions: method, path, query, body, result', async (t) => {
  const fake = await withFake(t);

  const roomsList = await FarmApi.listRooms();
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms', query: {}, body: null });
  assert.deepEqual(roomsList, []);

  const room = { name: 'A', volume: 60 };
  const created = await FarmApi.createRoom(room);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms', query: {}, body: room });
  assert.deepEqual(created, room);

  const updated = await FarmApi.updateRoom(1, { name: 'B' });
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'PATCH', path: '/api/rooms/1', query: {}, body: { name: 'B' } });
  assert.deepEqual(updated, { name: 'B' });

  const r1 = await FarmApi.restartRoom(1);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms/1/restart', query: {}, body: null });
  assert.deepEqual(r1, null);

  const restarted = { id: 2, name: 'Room 2', live: { running: true, error: null } };
  fake.reply('POST', '/api/rooms/2/restart', 200, restarted);
  const r2 = await FarmApi.restartRoom(2);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms/2/restart', query: {}, body: null });
  assert.deepEqual(r2, restarted);

  const settingsNow = await FarmApi.getSettings(1);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/settings', query: {}, body: null });
  assert.deepEqual(settingsNow, {});

  const settings = { spT: 25 };
  const saved1 = await FarmApi.saveSettings(1, settings);
  assert.deepEqual(apiRequests(fake).at(-1).body, { settings });
  assert.deepEqual(saved1, { settings });
  const saved2 = await FarmApi.saveSettings(1, settings, '');
  assert.deepEqual(apiRequests(fake).at(-1).body, { settings });
  assert.deepEqual(saved2, { settings });
  const saved3 = await FarmApi.saveSettings(1, settings, 'x');
  assert.deepEqual(apiRequests(fake).at(-1).body, { settings, note: 'x' });
  assert.deepEqual(saved3, { settings, note: 'x' });
  assert.equal(apiRequests(fake).at(-1).method, 'PUT');
  assert.equal(apiRequests(fake).at(-1).path, '/api/rooms/1/settings');

  const history = await FarmApi.listSettingsHistory(1);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/settings/history', query: {}, body: null });
  assert.deepEqual(history, []);

  const restored = await FarmApi.restoreSettings(1, 14);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms/1/settings/restore/14', query: {}, body: null });
  assert.deepEqual(restored, null);

  const readings = await FarmApi.getReadings(1, { from: 10, to: 20 });
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/readings', query: { from: '10', to: '20' }, body: null });
  assert.deepEqual(readings, []);

  const events1 = await FarmApi.getEvents(1);
  assert.deepEqual(apiRequests(fake).at(-1).query, {});
  assert.deepEqual(events1, []);
  const events2 = await FarmApi.getEvents(1, { limit: 100, before: 55 });
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/events', query: { limit: '100', before: '55' }, body: null });
  assert.deepEqual(events2, []);

  const alarms = await FarmApi.getAlarms(1);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/alarms', query: {}, body: null });
  assert.deepEqual(alarms, []);

  const acked = await FarmApi.ackAlarm(1, 'rh Hi');
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms/1/alarms/rh%20Hi/ack', query: {}, body: null });
  assert.deepEqual(acked, null);

  const calibs = await FarmApi.listCalibrations(1);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/calibrations', query: {}, body: null });
  assert.deepEqual(calibs, []);

  const run = { ua: 90 };
  const savedRun = await FarmApi.saveCalibration(1, run);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms/1/calibrations', query: {}, body: run });
  assert.deepEqual(savedRun, run);

  const applied = await FarmApi.applyCalibration(1, 3);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms/1/calibrations/3/apply', query: {}, body: null });
  assert.deepEqual(applied, null);

  const mix = await FarmApi.getMix(1);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/mix', query: {}, body: null });
  assert.deepEqual(mix, []);

  const rows = [{ crop: 'oyster', blocks: 1 }];
  const savedMix = await FarmApi.saveMix(1, rows);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'PUT', path: '/api/rooms/1/mix', query: {}, body: rows });
  assert.deepEqual(savedMix, rows);

  const report = { verdict: 'good' };
  const savedReport = await FarmApi.saveCapacity(1, report);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'POST', path: '/api/rooms/1/capacity', query: {}, body: report });
  assert.deepEqual(savedReport, report);

  fake.reply('GET', '/api/rooms/1/capacity', 200, report);
  const gotReport = await FarmApi.getCapacity(1);
  assert.deepEqual(apiRequests(fake).at(-1), { method: 'GET', path: '/api/rooms/1/capacity', query: {}, body: null });
  assert.deepEqual(gotReport, report);
});

test('errors: ApiError for 400, 404, 500', async (t) => {
  const fake = await withFake(t);
  for (const status of [400, 404, 500]) {
    fake.reply('GET', '/api/rooms', status, { error: 'Invalid query', details: ['from: bad'] });
    await assert.rejects(FarmApi.listRooms(), err => {
      assert.ok(err instanceof FarmApi.ApiError);
      assert.equal(err.name, 'ApiError');
      assert.equal(err.message, 'Invalid query');
      assert.equal(err.error, 'Invalid query');
      assert.equal(err.status, status);
      assert.deepEqual(err.details, ['from: bad']);
      return true;
    });
  }
});

test('status 0: no server', async (t) => {
  const fake = await startFakeApi();
  FarmApi.base = fake.url;
  await fake.close();
  await assert.rejects(FarmApi.listRooms(), err => {
    assert.equal(err.status, 0);
    assert.equal(err.error, 'The farm server cannot be reached.');
    assert.equal(err.details.length, 1);
    assert.equal(typeof err.details[0], 'string');
    return true;
  });
});

test('non-JSON bodies', async (t) => {
  const fake = await withFake(t);
  fake.reply('GET', '/api/rooms', 500, 'oops');
  await assert.rejects(FarmApi.listRooms(), err => {
    assert.equal(err.error, 'HTTP 500');
    assert.deepEqual(err.details, []);
    return true;
  });
  fake.reply('GET', '/api/rooms', 200, 'hello');
  await assert.rejects(FarmApi.listRooms(), err => {
    assert.ok(err instanceof FarmApi.ApiError);
    assert.equal(err.error, 'The server sent a reply that is not JSON.');
    return true;
  });
});

test('empty body resolves null', async (t) => {
  const fake = await withFake(t);
  fake.reply('POST', '/api/rooms/1/restart', 204, undefined);
  assert.equal(await FarmApi.restartRoom(1), null);
});

test('getCapacity: no report vs unknown room', async (t) => {
  const fake = await withFake(t);
  fake.reply('GET', '/api/rooms/1/capacity', 404, { error: 'No capacity report', details: [] });
  assert.equal(await FarmApi.getCapacity(1), null);
  fake.reply('GET', '/api/rooms/2/capacity', 404, { error: 'Unknown room', details: [] });
  await assert.rejects(FarmApi.getCapacity(2), err => {
    assert.ok(err instanceof FarmApi.ApiError);
    assert.equal(err.status, 404);
    assert.equal(err.error, 'Unknown room');
    return true;
  });
});

test('stream: delivers events, open/down/open, stops after close', async (t) => {
  const fake = await startFakeApi({ retryMs: 50 });
  FarmApi.base = fake.url;
  t.after(() => fake.close());
  const events = [];
  const close = FarmApi.stream((type, data) => events.push([type, data]));
  t.after(() => close());

  await waitFor(() => events.some(e => e[0] === 'open'));
  assert.deepEqual(events[0], ['open', { reconnect: false }]);

  fake.emit('reading', { room_id: 1, t: 5 });
  await waitFor(() => events.some(e => e[0] === 'reading'));
  assert.ok(events.some(e => e[0] === 'reading' && JSON.stringify(e[1]) === JSON.stringify({ room_id: 1, t: 5 })));

  fake.dropStreams();
  await waitFor(() => events.filter(e => e[0] === 'down').length === 1);
  await waitFor(() => events.filter(e => e[0] === 'open').length === 2);
  assert.deepEqual(events.find(e => e[0] === 'open' && e[1].reconnect === true), ['open', { reconnect: true }]);
  assert.equal(apiRequests(fake).filter(r => r.method === 'GET' && r.path === '/api/stream').length, 2);

  await sleep(100);
  assert.equal(events.filter(e => e[0] === 'down').length, 1);

  close();
  const countBefore = events.length;
  const requestsBefore = apiRequests(fake).filter(r => r.method === 'GET' && r.path === '/api/stream').length;
  await sleep(100);
  assert.equal(events.length, countBefore);
  assert.equal(apiRequests(fake).filter(r => r.method === 'GET' && r.path === '/api/stream').length, requestsBefore);
});

test('stream: bad data skipped; onEvent throw does not stop the stream', async (t) => {
  const fake = await startFakeApi({ retryMs: 50 });
  FarmApi.base = fake.url;
  t.after(() => fake.close());
  const events = [];
  let throwNext = false;
  const close = FarmApi.stream((type, data) => {
    events.push([type, data]);
    if (throwNext && type === 'reading') { throwNext = false; throw new Error('boom'); }
  });
  t.after(() => close());
  await waitFor(() => events.some(e => e[0] === 'open'));

  // A data: line that is not JSON (JSON.stringify(undefined) is undefined, so emit('bad', undefined) writes
  // "data: undefined") is skipped: no onEvent call for it, and the connection stays open (no 'down').
  fake.emit('bad', undefined);
  await sleep(50);
  assert.equal(events.some(e => e[0] === 'bad'), false);
  assert.equal(events.some(e => e[0] === 'down'), false);
  fake.emit('reading', { room_id: 1, t: 0 });
  await waitFor(() => events.filter(e => e[0] === 'reading').length === 1);
  assert.equal(events.some(e => e[0] === 'down'), false);
  assert.equal(apiRequests(fake).filter(r => r.method === 'GET' && r.path === '/api/stream').length, 1);

  throwNext = true;
  fake.emit('reading', { room_id: 1, t: 1 });
  await waitFor(() => events.filter(e => e[0] === 'reading').length === 2);
  fake.emit('reading', { room_id: 1, t: 2 });
  await waitFor(() => events.filter(e => e[0] === 'reading').length === 3);
});

test('watchdog: no data triggers down and reconnect', async (t) => {
  FarmApi.streamTimeoutMs = 100;
  t.after(() => { FarmApi.streamTimeoutMs = 45000; });
  const fake = await startFakeApi({ retryMs: 50 });
  FarmApi.base = fake.url;
  t.after(() => fake.close());
  const events = [];
  const close = FarmApi.stream((type, data) => events.push([type, data]));
  t.after(() => close());

  await waitFor(() => events.some(e => e[0] === 'open'));
  assert.deepEqual(events[0], ['open', { reconnect: false }]);
  await waitFor(() => events.some(e => e[0] === 'down'), 2000);
  const down = events.find(e => e[0] === 'down');
  assert.equal(down[1].error, 'No data from the server for 0.1 s');
  await waitFor(() => events.filter(e => e[0] === 'open').length === 2, 2000);
  assert.equal(apiRequests(fake).filter(r => r.method === 'GET' && r.path === '/api/stream').length, 2);

  close();
  const requestsBefore = apiRequests(fake).filter(r => r.method === 'GET' && r.path === '/api/stream').length;
  await sleep(100);
  assert.equal(apiRequests(fake).filter(r => r.method === 'GET' && r.path === '/api/stream').length, requestsBefore);
});

test('watchdog: emits keep the connection alive', async (t) => {
  FarmApi.streamTimeoutMs = 300;
  t.after(() => { FarmApi.streamTimeoutMs = 45000; });
  const fake = await startFakeApi({ retryMs: 50 });
  FarmApi.base = fake.url;
  t.after(() => fake.close());
  const events = [];
  const close = FarmApi.stream((type, data) => events.push([type, data]));
  t.after(() => close());
  await waitFor(() => events.some(e => e[0] === 'open'));
  const timer = setInterval(() => fake.emit('reading', { room_id: 1, t: 1 }), 50);
  await sleep(400);
  clearInterval(timer);
  assert.equal(events.filter(e => e[0] === 'down').length, 0);
  close();
  const countBefore = events.length;
  await sleep(100);
  assert.equal(events.length, countBefore);
});

test('stream: close() inside the open handler leaves no timer and no later event', async (t) => {
  const MS = 12345;
  FarmApi.streamTimeoutMs = MS;
  t.after(() => { FarmApi.streamTimeoutMs = 45000; });
  const live = new Set();
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => {
    const h = realSet(fn, ms, ...a);
    if (ms === MS) live.add(h);
    return h;
  };
  globalThis.clearTimeout = h => { live.delete(h); return realClear(h); };
  t.after(() => { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; });
  const fake = await withFake(t, { retryMs: 50 });
  const events = [];
  let close;
  close = FarmApi.stream((type, data) => { events.push([type, data]); if (type === 'open') close(); });
  await waitFor(() => events.some(e => e[0] === 'open'));
  await sleep(100);
  fake.emit('reading', { room_id: 1, t: 1 });
  await sleep(100);
  assert.deepEqual(events.map(e => e[0]), ['open']);
  assert.equal(live.size, 0, 'no watchdog timer left armed');
  assert.equal(apiRequests(fake).filter(r => r.path === '/api/stream').length, 1);
});

test('stream: a 2xx reply without a body ends the connection with down, then reconnects', async (t) => {
  const fake = await withFake(t);
  fake.reply('GET', '/api/stream', 204);
  const events = [];
  const close = FarmApi.stream((type, data) => events.push([type, data]));
  t.after(() => close());
  await waitFor(() => events.some(e => e[0] === 'down'), 500);
  assert.ok(events.some(e => e[0] === 'down'));
  close();
});

test('stream: a negative or non-numeric retry value is ignored', async (t) => {
  const fake = await withFake(t, { retryMs: -5 });
  const events = [];
  const close = FarmApi.stream((type, data) => events.push([type, data]));
  t.after(() => close());
  await waitFor(() => events.some(e => e[0] === 'open'));
  fake.dropStreams();
  await waitFor(() => events.some(e => e[0] === 'down'));
  await sleep(300);
  assert.equal(events.filter(e => e[0] === 'open').length, 1, 'default 3 s delay kept, no immediate reconnect');
  close();
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function waitFor(fn, timeoutMs = 1000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await sleep(10);
  }
}

// C5 4.3, revision 7 additions: simulations and equipment. The first GET, the DELETE and GET equipment use the fake's
// 4.5 defaults ([], {}, null; C5 7.10); the other routes are set with reply.
test('simulation and equipment functions: method, path, query, body, result', async (t) => {
  const fake = await withFake(t);
  const last = () => apiRequests(fake).at(-1);

  assert.deepEqual(await FarmApi.listSimulations(1), []);
  assert.deepEqual(last(), { method: 'GET', path: '/api/rooms/1/simulations', query: {}, body: null });
  const infos = [{ id: 7, kind: 'capacity' }];
  fake.reply('GET', '/api/rooms/1/simulations', 200, infos);
  assert.deepEqual(await FarmApi.listSimulations(1, { limit: 20, before: 9 }), infos);
  assert.deepEqual(last(), { method: 'GET', path: '/api/rooms/1/simulations', query: { limit: '20', before: '9' }, body: null });
  await FarmApi.listSimulations(1, { limit: 5 });
  assert.deepEqual(last().query, { limit: '5' });

  const run = { kind: 'capacity', inputs: { a: 1 }, result: { b: 2 }, note: 'n' };
  fake.reply('POST', '/api/rooms/1/simulations', 201, { id: 8, kind: 'capacity' });
  assert.deepEqual(await FarmApi.createSimulation(1, run), { id: 8, kind: 'capacity' });
  assert.deepEqual(last(), { method: 'POST', path: '/api/rooms/1/simulations', query: {}, body: run });

  const full = { id: 8, kind: 'capacity', inputs: {}, result: {} };
  fake.reply('GET', '/api/rooms/1/simulations/8', 200, full);
  assert.deepEqual(await FarmApi.getSimulation(1, 8), full);
  assert.deepEqual(last(), { method: 'GET', path: '/api/rooms/1/simulations/8', query: {}, body: null });

  fake.reply('PATCH', '/api/rooms/1/simulations/8', 200, { id: 8, note: 'x' });
  assert.deepEqual(await FarmApi.updateSimulation(1, 8, { note: 'x' }), { id: 8, note: 'x' });
  assert.deepEqual(last(), { method: 'PATCH', path: '/api/rooms/1/simulations/8', query: {}, body: { note: 'x' } });

  assert.deepEqual(await FarmApi.deleteSimulation(1, 8), {});
  assert.deepEqual(last(), { method: 'DELETE', path: '/api/rooms/1/simulations/8', query: {}, body: null });

  assert.equal(await FarmApi.getEquipment(1), null);
  assert.deepEqual(last(), { method: 'GET', path: '/api/rooms/1/equipment', query: {}, body: null });

  const eq = { ac_hp: 2, ac_units: 1, fog_lph: 6, air_m3h: 1800, walls: null, roof: null, height: 3 };
  fake.reply('PUT', '/api/rooms/1/equipment', 200, eq);
  assert.deepEqual(await FarmApi.saveEquipment(1, eq), eq);
  assert.deepEqual(last(), { method: 'PUT', path: '/api/rooms/1/equipment', query: {}, body: eq });
});

// C10 12.1: the ten harvest functions, one test each.
const last = fake => apiRequests(fake).at(-1);

test('listBatches: no query, state and room, one key, null and undefined left out', async (t) => {
  const fake = await withFake(t);
  fake.reply('GET', '/api/batches', 200, []);
  assert.deepEqual(await FarmApi.listBatches(), []);
  assert.deepEqual(last(fake), { method: 'GET', path: '/api/batches', query: {}, body: null });
  const list = [{ id: 1 }];
  fake.reply('GET', '/api/batches', 200, list);
  assert.deepEqual(await FarmApi.listBatches({ state: 'placed', room: 2 }), list);
  assert.deepEqual(last(fake), { method: 'GET', path: '/api/batches', query: { state: 'placed', room: '2' }, body: null });
  await FarmApi.listBatches({ state: 'received' });
  assert.deepEqual(last(fake).query, { state: 'received' });
  await FarmApi.listBatches({ room: null, state: undefined });
  assert.deepEqual(last(fake).query, {});
});

test('createBatch', async (t) => {
  const fake = await withFake(t);
  const fields = { crop: 'lionsmane', blocks: 40 };
  fake.reply('POST', '/api/batches', 201, { id: 4, ...fields });
  assert.deepEqual(await FarmApi.createBatch(fields), { id: 4, ...fields });
  assert.deepEqual(last(fake), { method: 'POST', path: '/api/batches', query: {}, body: fields });
});

test('getBatch', async (t) => {
  const fake = await withFake(t);
  const detail = { id: 4, crates: [] };
  fake.reply('GET', '/api/batches/4', 200, detail);
  assert.deepEqual(await FarmApi.getBatch(4), detail);
  assert.deepEqual(last(fake), { method: 'GET', path: '/api/batches/4', query: {}, body: null });
});

test('updateBatch', async (t) => {
  const fake = await withFake(t);
  fake.reply('PATCH', '/api/batches/4', 200, { id: 4, blocks: 30 });
  assert.deepEqual(await FarmApi.updateBatch(4, { blocks: 30 }), { id: 4, blocks: 30 });
  assert.deepEqual(last(fake), { method: 'PATCH', path: '/api/batches/4', query: {}, body: { blocks: 30 } });
});

test('placeBatch', async (t) => {
  const fake = await withFake(t);
  fake.reply('POST', '/api/batches/4/place', 200, { id: 4, room_id: 2 });
  assert.deepEqual(await FarmApi.placeBatch(4, { room_id: 2, placed_at: 100 }), { id: 4, room_id: 2 });
  assert.deepEqual(last(fake), { method: 'POST', path: '/api/batches/4/place', query: {}, body: { room_id: 2, placed_at: 100 } });
});

test('clearBatch: always sends a body', async (t) => {
  const fake = await withFake(t);
  fake.reply('POST', '/api/batches/4/clear', 200, { id: 4, cleared_at: 5 });
  assert.deepEqual(await FarmApi.clearBatch(4), { id: 4, cleared_at: 5 });
  assert.deepEqual(last(fake), { method: 'POST', path: '/api/batches/4/clear', query: {}, body: {} });
  await FarmApi.clearBatch(4, { cleared_at: 5 });
  assert.deepEqual(last(fake).body, { cleared_at: 5 });
});

test('deleteBatch', async (t) => {
  const fake = await withFake(t);
  fake.reply('DELETE', '/api/batches/4', 200, { id: 4 });
  assert.deepEqual(await FarmApi.deleteBatch(4), { id: 4 });
  assert.deepEqual(last(fake), { method: 'DELETE', path: '/api/batches/4', query: {}, body: null });
});

test('getRoomHarvest', async (t) => {
  const fake = await withFake(t);
  const harvest = { batches: [] };
  fake.reply('GET', '/api/rooms/2/harvest', 200, harvest);
  assert.deepEqual(await FarmApi.getRoomHarvest(2), harvest);
  assert.deepEqual(last(fake), { method: 'GET', path: '/api/rooms/2/harvest', query: {}, body: null });
});

test('addCrate', async (t) => {
  const fake = await withFake(t);
  fake.reply('POST', '/api/batches/4/crates', 201, { crate: { id: 9 } });
  assert.deepEqual(await FarmApi.addCrate(4, { kg: 12.5, picker: 'Ali' }), { crate: { id: 9 } });
  assert.deepEqual(last(fake), { method: 'POST', path: '/api/batches/4/crates', query: {}, body: { kg: 12.5, picker: 'Ali' } });
});

test('undoCrate', async (t) => {
  const fake = await withFake(t);
  fake.reply('DELETE', '/api/crates/9', 200, { id: 9 });
  assert.deepEqual(await FarmApi.undoCrate(9), { id: 9 });
  assert.deepEqual(last(fake), { method: 'DELETE', path: '/api/crates/9', query: {}, body: null });
});

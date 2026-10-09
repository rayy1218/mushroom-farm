// Harvest routes (server/harvest-api.js). Contract: docs/contracts/harvest.md (C10) sections 6-9, C3 section 2.1.
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { HttpError } = require('../server/api-common.js');
const { openFakeDb } = require('./fakes/db.js');
const { openFakeHarvest } = require('./fakes/harvest-db.js');
require('../controller.js');
require('../harvest-rules.js');
const { createHarvestRoutes, startOfDay } = require('../server/harvest-api.js');

const Rules = globalThis.FarmHarvestRules;
const NOW = 1791450000; // 2026-10-08 17:00 farm time
const DAY = 86400;
const BATCH_KEYS = ['id', 'crop', 'strain', 'source', 'block_count', 'block_wet_kg', 'moisture_pct', 'spawn_date',
  'received_at', 'room_id', 'placed_at', 'cleared_at', 'flush_gap_days', 'notes', 'created_at'];
const BATCH_OUT = [...BATCH_KEYS, 'room_name', 'state', 'totals'];
const DETAIL_OUT = [...BATCH_OUT, 'flushes', 'crates'];
const ROOM_BATCH_OUT = [...BATCH_OUT, 'flush', 'today'];
const GOOD = { crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: NOW - DAY };
const ZERO_TOTALS = { crates: 0, kg: 0, g_per_block: 0, be_pct: 0, flushes: 0 };

function setup() {
  let clock = NOW;
  const now = () => clock;
  const db = openFakeDb({ now });
  const harvest = openFakeHarvest(db, { now });
  const routes = createHarvestRoutes({ db, harvest, now });
  const room = (name, { archived } = {}) => {
    const r = db.createRoom({ name, volume: 60, settings: {} });
    if (archived) db.archiveRoom(r.id);
    return r.id;
  };
  const call = (method, p, { id, body, query } = {}) => {
    const parts = p.split('/');
    const hits = routes.filter(r => r.method === method && r.segs.length === parts.length
      && r.segs.every((s, i) => s.startsWith(':') || s === parts[i]));
    assert.equal(hits.length, 1, `${method} ${p} matches one route`);
    const [r] = hits;
    const params = {};
    r.segs.forEach((s, i) => { if (s.startsWith(':')) params[s.slice(1)] = parts[i]; });
    return r.run({
      id: r.needsRoom ? id : undefined,
      params,
      body: r.hasBody ? body : undefined,
      query: new URLSearchParams(query || ''),
    });
  };
  const setClock = t => { clock = t; };
  return { db, harvest, routes, room, call, setClock };
}

function seed(harvest, over = {}, roomId, placedAt = NOW - 9 * DAY) {
  const b = harvest.createBatch({ crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: NOW - 10 * DAY, ...over });
  if (roomId !== undefined) harvest.placeBatch(b.id, roomId, placedAt);
  return b;
}

function assertHttp(fn, status, error, details) {
  assert.throws(fn, e => e instanceof HttpError && e.status === status && e.error === error
    && (details === undefined || assert.deepStrictEqual(e.details, details) === undefined));
}

function snapshot(harvest, id) {
  const snap = { list: harvest.listBatches() };
  if (id !== undefined) {
    snap.batch = harvest.getBatch(id);
    snap.crates = harvest.listCrates(id);
  }
  return snap;
}

// Runs fn, expects the HttpError, and checks the store did not change.
function rejects(harvest, id, fn, status, error, details) {
  const before = snapshot(harvest, id);
  assertHttp(fn, status, error, details);
  assert.deepStrictEqual(snapshot(harvest, id), before);
}

const ROUTE_TABLE = [
  ['GET', ['api', 'batches'], false, false],
  ['POST', ['api', 'batches'], false, true],
  ['GET', ['api', 'batches', ':batchId'], false, false],
  ['PATCH', ['api', 'batches', ':batchId'], false, true],
  ['POST', ['api', 'batches', ':batchId', 'place'], false, true],
  ['POST', ['api', 'batches', ':batchId', 'clear'], false, true],
  ['DELETE', ['api', 'batches', ':batchId'], false, false],
  ['GET', ['api', 'rooms', ':id', 'harvest'], true, false],
  ['POST', ['api', 'batches', ':batchId', 'crates'], false, true],
  ['DELETE', ['api', 'crates', ':crateId'], false, false],
];

test('exports: createHarvestRoutes and startOfDay', () => {
  assert.deepStrictEqual(Object.keys(require('../server/harvest-api.js')).sort(), ['createHarvestRoutes', 'startOfDay']);
});

test('routes: ten routes in C10 9 order', () => {
  const { routes } = setup();
  assert.deepStrictEqual(routes.map(r => [r.method, r.segs, r.needsRoom, r.hasBody]), ROUTE_TABLE);
  for (const r of routes) {
    assert.equal(typeof r.run, 'function');
    assert.deepStrictEqual(Object.keys(r), ['method', 'segs', 'needsRoom', 'hasBody', 'run']);
  }
});

test('routes: no reserved segment names', () => {
  const { routes } = setup();
  const names = routes.flatMap(r => r.segs).filter(s => s.startsWith(':'));
  for (const bad of [':versionId', ':runId', ':alarmKey']) assert.ok(!names.includes(bad), bad);
  const withId = routes.filter(r => r.segs.includes(':id'));
  assert.equal(withId.length, 1);
  assert.deepStrictEqual(withId[0].segs, ['api', 'rooms', ':id', 'harvest']);
});

test('requires: never server/db.js, server/api.js or server/harvest-db.js', () => {
  for (const f of ['db.js', 'api.js', 'harvest-db.js']) {
    const p = path.join(__dirname, '..', 'server', f);
    assert.ok(!Object.hasOwn(require.cache, p), f);
  }
});

test('startOfDay: Malaysian midnight', () => {
  assert.equal(startOfDay(NOW), 1791388800);
  assert.equal(startOfDay(1791388800), 1791388800);
  assert.equal(startOfDay(1791388799), 1791302400);
  assert.equal(startOfDay(NOW + 7 * 3600), 1791475200);
});

test('9.1 GET /api/batches: Batch list, order, room_name, state, totals', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const placed = seed(harvest, { received_at: NOW - 5 * DAY }, r1, NOW - 4 * DAY);
  const received = seed(harvest, { received_at: NOW - 2 * DAY });
  const cleared = seed(harvest, { received_at: NOW - 8 * DAY }, r1, NOW - 7 * DAY);
  harvest.addCrate(placed.id, { kg: 5, picker: null, t: NOW - 3 * DAY });
  const gone = harvest.addCrate(placed.id, { kg: 2, picker: null, t: NOW - 2 * DAY });
  harvest.undoCrate(gone.id, NOW - DAY);
  harvest.addCrate(cleared.id, { kg: 7, picker: null, t: NOW - 6 * DAY });
  harvest.clearBatch(cleared.id, NOW - 5 * DAY);
  const res = call('GET', 'api/batches');
  assert.equal(res.status, 200);
  assert.deepStrictEqual(res.body.map(b => b.id), [received.id, placed.id, cleared.id]);
  for (const b of res.body) {
    assert.deepStrictEqual(Object.keys(b), BATCH_OUT);
    assert.deepStrictEqual(b.totals, Rules.totals(harvest.getBatch(b.id), harvest.listCrates(b.id)));
  }
  assert.deepStrictEqual(res.body.map(b => b.state), ['received', 'placed', 'cleared']);
  assert.deepStrictEqual(res.body.map(b => b.room_name), [null, 'Room 1', 'Room 1']);
  assert.equal(res.body[1].totals.crates, 1);
});

test('9.1 GET /api/batches: state and room filters', () => {
  const { harvest, call, room, db } = setup();
  const r1 = room('Room 1');
  const r2 = room('Room 2');
  const received = seed(harvest);
  const p1 = seed(harvest, {}, r1);
  const p2 = seed(harvest, {}, r2);
  const ids = res => res.body.map(b => b.id).sort();
  assert.deepStrictEqual(ids(call('GET', 'api/batches', { query: 'state=placed' })), [p1.id, p2.id]);
  assert.deepStrictEqual(ids(call('GET', 'api/batches', { query: 'state=received' })), [received.id]);
  assert.deepStrictEqual(ids(call('GET', `api/batches`, { query: `room=${r1}` })), [p1.id]);
  assert.deepStrictEqual(ids(call('GET', 'api/batches', { query: 'x=1' })), [received.id, p1.id, p2.id]);
  db.archiveRoom(r1);
  const res = call('GET', 'api/batches', { query: `room=${r1}` });
  assert.deepStrictEqual(res.body.map(b => [b.id, b.room_name]), [[p1.id, 'Room 1']]);
});

test('9.1 GET /api/batches: bad query is 400 Invalid query', () => {
  const { call } = setup();
  assertHttp(() => call('GET', 'api/batches', { query: 'state=open' }), 400, 'Invalid query', ['state: must be received, placed or cleared']);
  for (const room of ['abc', '0', '999']) {
    assertHttp(() => call('GET', 'api/batches', { query: `room=${room}` }), 400, 'Invalid query', ['room: no such room']);
  }
});

test('9.2 POST /api/batches: 201 Batch, defaults, trimming', () => {
  const { harvest, call } = setup();
  const res = call('POST', 'api/batches', { body: GOOD });
  assert.equal(res.status, 201);
  assert.deepStrictEqual(Object.keys(res.body), BATCH_OUT);
  assert.equal(res.body.state, 'received');
  assert.equal(res.body.room_name, null);
  assert.equal(res.body.flush_gap_days, 5);
  assert.equal(res.body.created_at, NOW);
  assert.deepStrictEqual(res.body.totals, ZERO_TOTALS);
  const res2 = call('POST', 'api/batches', { body: { ...GOOD, strain: '  PO-2 ', notes: '   ', flush_gap_days: 7 } });
  const row = harvest.getBatch(res2.body.id);
  assert.equal(row.strain, 'PO-2');
  assert.equal(row.notes, null);
  assert.equal(row.flush_gap_days, 7);
});

test('9.2 POST /api/batches: checkBatch problems are 400 Invalid batch, nothing stored', () => {
  const { harvest, call } = setup();
  rejects(harvest, undefined, () => call('POST', 'api/batches', { body: {} }), 400, 'Invalid batch',
    ['crop: required', 'block_count: required', 'block_wet_kg: required', 'moisture_pct: required', 'received_at: required']);
  rejects(harvest, undefined, () => call('POST', 'api/batches', { body: { ...GOOD, room_id: 1 } }), 400, 'Invalid batch', ['room_id: unknown field']);
  const problems = Rules.checkBatch({ ...GOOD, block_count: 0 }, false);
  assert.equal(problems.length, 1);
  rejects(harvest, undefined, () => call('POST', 'api/batches', { body: { ...GOOD, block_count: 0 } }), 400, 'Invalid batch', problems);
});

test('9.2 POST /api/batches: dates in the future are 400 Invalid batch', () => {
  const { harvest, call } = setup();
  rejects(harvest, undefined, () => call('POST', 'api/batches', { body: { ...GOOD, received_at: NOW + 1 } }), 400, 'Invalid batch',
    ['received_at: must not be in the future']);
  rejects(harvest, undefined, () => call('POST', 'api/batches', { body: { ...GOOD, spawn_date: NOW + 1 } }), 400, 'Invalid batch',
    ['spawn_date: must not be in the future']);
  assert.equal(call('POST', 'api/batches', { body: { ...GOOD, received_at: NOW } }).status, 201);
  assert.equal(call('POST', 'api/batches', { body: { ...GOOD, spawn_date: null } }).status, 201);
});

test('9.3 GET /api/batches/:batchId: BatchDetail with flushes and live crates newest first', () => {
  const { harvest, call, room } = setup();
  const b = seed(harvest, {}, room('Room 1'));
  harvest.addCrate(b.id, { kg: 3, picker: null, t: NOW - 8 * DAY });
  harvest.addCrate(b.id, { kg: 4, picker: 'A', t: NOW - 7 * DAY });
  const a = harvest.addCrate(b.id, { kg: 5, picker: null, t: NOW - DAY });
  const dup = harvest.addCrate(b.id, { kg: 6, picker: null, t: NOW - DAY });
  const gone = harvest.addCrate(b.id, { kg: 9, picker: null, t: NOW - 2 * DAY });
  harvest.undoCrate(gone.id, NOW - 1);
  const res = call('GET', `api/batches/${b.id}`);
  const all = harvest.listCrates(b.id);
  assert.equal(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.body), DETAIL_OUT);
  assert.deepStrictEqual(res.body.flushes, Rules.flushes(harvest.getBatch(b.id), all));
  assert.equal(res.body.flushes.length, 2);
  assert.deepStrictEqual(res.body.totals, Rules.totals(harvest.getBatch(b.id), all));
  assert.equal(res.body.crates.length, 4);
  assert.deepStrictEqual(res.body.crates.slice(0, 2).map(c => c.id), [dup.id, a.id]);
  assert.ok(res.body.crates.every(c => c.deleted_at === null));
  assert.deepStrictEqual(res.body.crates.map(c => c.t), [...res.body.crates.map(c => c.t)].sort((x, y) => y - x));
});

test('ids: a bad or unknown :batchId is 404 Unknown batch', () => {
  const { harvest, call } = setup();
  const b = seed(harvest);
  const cases = [
    ['GET', 'api/batches/', undefined],
    ['PATCH', 'api/batches/', { notes: 'x' }],
    ['POST', 'api/batches/', { room_id: 1 }, '/place'],
    ['POST', 'api/batches/', {}, '/clear'],
    ['DELETE', 'api/batches/', undefined],
    ['POST', 'api/batches/', { kg: 1 }, '/crates'],
  ];
  for (const [method, base, body, tail = ''] of cases) {
    for (const bad of ['abc', '0', '1.5', '-1', '999']) {
      rejects(harvest, b.id, () => call(method, `${base}${bad}${tail}`, { body }), 404, 'Unknown batch', []);
    }
  }
});

test('ids: the id check comes before the body rules', () => {
  const { call } = setup();
  assertHttp(() => call('PATCH', 'api/batches/999', { body: { crop: 3 } }), 404, 'Unknown batch', []);
  assertHttp(() => call('POST', 'api/batches/999/place', { body: { x: 1 } }), 404, 'Unknown batch', []);
  assertHttp(() => call('POST', 'api/batches/999/crates', { body: {} }), 404, 'Unknown batch', []);
});

test('9.4 PATCH /api/batches/:batchId: changed fields only, trimming', () => {
  const { harvest, call } = setup();
  const b = seed(harvest, { strain: 'PO-2' });
  const res = call('PATCH', `api/batches/${b.id}`, { body: { notes: ' moved to rack 2 ' } });
  assert.equal(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.body), BATCH_OUT);
  assert.equal(res.body.notes, 'moved to rack 2');
  const { notes, ...rest } = res.body;
  const { notes: oldNotes, ...oldRest } = { ...b, room_name: null, state: 'received', totals: ZERO_TOTALS };
  assert.deepStrictEqual(rest, oldRest);
  assert.equal(call('PATCH', `api/batches/${b.id}`, { body: { strain: '' } }).body.strain, null);
});

test('9.4 PATCH /api/batches/:batchId: 400 Invalid batch', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const received = seed(harvest);
  const placed = seed(harvest, {}, r1);
  const cleared = seed(harvest, {}, r1);
  harvest.clearBatch(cleared.id, NOW - DAY);
  rejects(harvest, received.id, () => call('PATCH', `api/batches/${received.id}`, { body: {} }), 400, 'Invalid batch', ['body: at least one field is required']);
  rejects(harvest, received.id, () => call('PATCH', `api/batches/${received.id}`, { body: { notes: 'x', room_id: 2 } }), 400, 'Invalid batch',
    ['room_id: unknown field']);
  rejects(harvest, received.id, () => call('PATCH', `api/batches/${received.id}`, { body: { received_at: NOW + 1 } }), 400, 'Invalid batch',
    ['received_at: must not be in the future']);
  for (const b of [placed, cleared]) {
    rejects(harvest, b.id, () => call('PATCH', `api/batches/${b.id}`, { body: { received_at: NOW - 8 * DAY } }), 400, 'Invalid batch',
      ['received_at: must not be after the day it was placed']);
  }
  assert.equal(call('PATCH', `api/batches/${received.id}`, { body: { received_at: NOW - 2 * DAY } }).status, 200);
});

test('9.5 place: 200 Batch, placed_at defaults to now', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const a = seed(harvest);
  const res = call('POST', `api/batches/${a.id}/place`, { body: { room_id: r1 } });
  assert.equal(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.body), BATCH_OUT);
  assert.equal(res.body.state, 'placed');
  assert.equal(res.body.room_name, 'Room 1');
  assert.equal(res.body.placed_at, NOW);
  const b = seed(harvest);
  assert.equal(call('POST', `api/batches/${b.id}/place`, { body: { room_id: r1, placed_at: NOW - DAY } }).body.placed_at, NOW - DAY);
});

test('9.5 place: body rules are 400 Invalid batch', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const old = room('Old', { archived: true });
  const b = seed(harvest);
  const place = body => () => call('POST', `api/batches/${b.id}/place`, { body });
  const bad = (body, details) => rejects(harvest, b.id, place(body), 400, 'Invalid batch', details);
  bad({ room_id: r1, x: 1 }, ['x: unknown field']);
  bad(null, ['body: must be an object']);
  bad([], ['body: must be an object']);
  for (const body of [{}, { room_id: 'abc' }, { room_id: 1.5 }, { room_id: 999 }, { room_id: old }]) bad(body, ['room_id: no such room']);
  bad({ room_id: r1, placed_at: 1.5 }, ['placed_at: must be whole seconds since 1970']);
  bad({ room_id: r1, placed_at: null }, ['placed_at: must be whole seconds since 1970']);
  bad({ room_id: r1, placed_at: startOfDay(b.received_at) - 1 }, ['placed_at: must not be before the day it was received']);
  bad({ room_id: r1, placed_at: NOW + 1 }, ['placed_at: must not be in the future']);
});

test('9.5 place: a placed or cleared batch is 400 Batch is already in a room', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const placed = seed(harvest, {}, r1);
  const cleared = seed(harvest, {}, r1);
  harvest.clearBatch(cleared.id, NOW - DAY);
  for (const b of [placed, cleared]) {
    rejects(harvest, b.id, () => call('POST', `api/batches/${b.id}/place`, { body: { room_id: r1 } }), 400, 'Batch is already in a room', []);
  }
  // Body rules come before the state rule (C10 9.5).
  rejects(harvest, placed.id, () => call('POST', `api/batches/${placed.id}/place`, { body: { room_id: r1, x: 1 } }), 400, 'Invalid batch',
    ['x: unknown field']);
});

test('9.6 clear: 200 Batch; {} clears now', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const a = seed(harvest, {}, r1);
  const res = call('POST', `api/batches/${a.id}/clear`, { body: {} });
  assert.equal(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.body), BATCH_OUT);
  assert.equal(res.body.state, 'cleared');
  assert.equal(res.body.cleared_at, NOW);
  const b = seed(harvest, {}, r1);
  assert.equal(call('POST', `api/batches/${b.id}/clear`, { body: { cleared_at: NOW - DAY } }).body.cleared_at, NOW - DAY);
});

test('9.6 clear: body, state and date rules in order', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const received = seed(harvest);
  const placed = seed(harvest, {}, r1);
  const cleared = seed(harvest, {}, r1);
  harvest.clearBatch(cleared.id, NOW - DAY);
  const clear = (b, body) => () => call('POST', `api/batches/${b.id}/clear`, { body });
  rejects(harvest, placed.id, clear(placed, { x: 1 }), 400, 'Invalid batch', ['x: unknown field']);
  rejects(harvest, placed.id, clear(placed, { cleared_at: 1.5 }), 400, 'Invalid batch', ['cleared_at: must be whole seconds since 1970']);
  rejects(harvest, placed.id, clear(placed, { cleared_at: NOW + 1 }), 400, 'Invalid batch', ['cleared_at: must not be in the future']);
  rejects(harvest, received.id, clear(received, {}), 400, 'Batch is not in a room', []);
  // Body rules come before the state rule (C10 9.6).
  rejects(harvest, received.id, clear(received, { x: 1 }), 400, 'Invalid batch', ['x: unknown field']);
  rejects(harvest, received.id, clear(received, { cleared_at: NOW + 1 }), 400, 'Invalid batch', ['cleared_at: must not be in the future']);
  rejects(harvest, received.id, clear(received, { cleared_at: received.received_at - 1 }), 400, 'Batch is not in a room', []);
  rejects(harvest, cleared.id, clear(cleared, {}), 400, 'Batch is cleared', []);
  rejects(harvest, placed.id, clear(placed, { cleared_at: startOfDay(harvest.getBatch(placed.id).placed_at) - 1 }), 400, 'Invalid batch',
    ['cleared_at: must not be before the day it was placed']);
});

test('9.7 DELETE /api/batches/:batchId: 200 Batch as before the delete', () => {
  const { harvest, call } = setup();
  const b = seed(harvest);
  const res = call('DELETE', `api/batches/${b.id}`);
  assert.equal(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.body), BATCH_OUT);
  assert.equal(res.body.state, 'received');
  assert.deepStrictEqual(res.body.totals, ZERO_TOTALS);
  assertHttp(() => call('GET', `api/batches/${b.id}`), 404, 'Unknown batch', []);
});

test('9.7 DELETE: a batch with crates is 400 Batch has crates', () => {
  const { harvest, call, room } = setup();
  const b = seed(harvest, {}, room('Room 1'));
  const c = harvest.addCrate(b.id, { kg: 1, picker: null, t: NOW - DAY });
  harvest.undoCrate(c.id, NOW - 10);
  rejects(harvest, b.id, () => call('DELETE', `api/batches/${b.id}`), 400, 'Batch has crates', []);
  assert.equal(harvest.getBatch(b.id).id, b.id);
});

test('9.8 GET /api/rooms/:id/harvest: RoomHarvest', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const r2 = room('Room 2');
  // later is created first and received later, so the store lists it first; the route must sort by placed_at.
  const later = seed(harvest, { received_at: NOW - 6 * DAY }, r1, NOW - 5 * DAY);
  const earlier = seed(harvest, {}, r1, NOW - 9 * DAY);
  seed(harvest);
  const cleared = seed(harvest, {}, r1, NOW - 9 * DAY);
  harvest.clearBatch(cleared.id, NOW - 2 * DAY);
  seed(harvest, {}, r2);
  const res = call('GET', `api/rooms/${r1}/harvest`, { id: r1 });
  assert.equal(res.status, 200);
  assert.deepStrictEqual(Object.keys(res.body), ['room', 'day_start', 'batches']);
  assert.deepStrictEqual(res.body.room, { id: 1, name: 'Room 1' });
  assert.equal(res.body.day_start, 1791388800);
  assert.deepStrictEqual(res.body.batches.map(b => b.id), [earlier.id, later.id]);
  for (const b of res.body.batches) assert.deepStrictEqual(Object.keys(b), ROOM_BATCH_OUT);
});

test('9.8 today and flush', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const a = seed(harvest, {}, r1);
  const b = seed(harvest, {}, r1);
  harvest.addCrate(a.id, { kg: 4, picker: null, t: NOW - 8 * DAY });
  harvest.addCrate(a.id, { kg: 4, picker: null, t: 1791388799 });
  const mid = harvest.addCrate(a.id, { kg: 0.1, picker: null, t: 1791388800 });
  const recent = harvest.addCrate(a.id, { kg: 0.2, picker: null, t: NOW - 60 });
  const gone = harvest.addCrate(a.id, { kg: 7, picker: null, t: NOW - 30 });
  harvest.undoCrate(gone.id, NOW - 10);
  const res = call('GET', `api/rooms/${r1}/harvest`, { id: r1 });
  const [ra, rb] = res.body.batches;
  assert.deepStrictEqual(ra.today.crates.map(c => c.id), [recent.id, mid.id]);
  assert.equal(ra.today.kg, 0.3);
  assert.equal(ra.flush, 2);
  assert.equal(rb.id, b.id);
  assert.equal(rb.flush, 0);
  assert.deepStrictEqual(rb.today, { crates: [], kg: 0 });
});

test('9.9 POST crates: 201 CrateSaved', () => {
  const { harvest, call, room } = setup();
  const b = seed(harvest, {}, room('Room 1'));
  const addArgs = [];
  const realAdd = harvest.addCrate;
  harvest.addCrate = (...a) => { addArgs.push(a); return realAdd(...a); };
  const res = call('POST', `api/batches/${b.id}/crates`, { body: { kg: 12.5, picker: '  Aminah ' } });
  assert.deepStrictEqual(addArgs[0], [b.id, { kg: 12.5, picker: 'Aminah', t: NOW }]);
  assert.equal(res.status, 201);
  assert.deepStrictEqual(Object.keys(res.body), ['crate', 'flush', 'totals']);
  assert.deepStrictEqual(res.body.crate, { id: res.body.crate.id, batch_id: b.id, t: NOW, kg: 12.5, picker: 'Aminah', deleted_at: null });
  assert.deepStrictEqual(res.body.totals, Rules.totals(harvest.getBatch(b.id), harvest.listCrates(b.id)));
  assert.equal(call('POST', `api/batches/${b.id}/crates`, { body: { kg: 3 } }).body.crate.picker, null);
  assert.equal(call('POST', `api/batches/${b.id}/crates`, { body: { kg: 3, picker: '' } }).body.crate.picker, null);
});

test('9.9 POST crates: flush is the flush the crate joined', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const a = seed(harvest, {}, r1);
  assert.equal(call('POST', `api/batches/${a.id}/crates`, { body: { kg: 1 } }).body.flush, 1);
  const b = seed(harvest, {}, r1);
  harvest.addCrate(b.id, { kg: 1, picker: null, t: NOW - 6 * DAY });
  assert.equal(call('POST', `api/batches/${b.id}/crates`, { body: { kg: 1 } }).body.flush, 2);
  const c = seed(harvest, {}, r1);
  harvest.addCrate(c.id, { kg: 1, picker: null, t: NOW - 2 * DAY });
  assert.equal(call('POST', `api/batches/${c.id}/crates`, { body: { kg: 1 } }).body.flush, 1);
});

test('9.9 POST crates: 400 Invalid crate, Batch is not in a room, Batch is cleared', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const placed = seed(harvest, {}, r1);
  const received = seed(harvest);
  const cleared = seed(harvest, {}, r1);
  harvest.clearBatch(cleared.id, NOW - DAY);
  const add = (b, body) => () => call('POST', `api/batches/${b.id}/crates`, { body });
  rejects(harvest, placed.id, add(placed, {}), 400, 'Invalid crate', ['kg: required']);
  rejects(harvest, placed.id, add(placed, { kg: 51 }), 400, 'Invalid crate', ['kg: must be a number from 0.01 to 50 kg']);
  rejects(harvest, placed.id, add(placed, { kg: 1, batch_id: 2 }), 400, 'Invalid crate', ['batch_id: unknown field']);
  rejects(harvest, received.id, add(received, { kg: 1 }), 400, 'Batch is not in a room', []);
  // checkCrate comes before the state rule (C10 9.9).
  rejects(harvest, received.id, add(received, {}), 400, 'Invalid crate', ['kg: required']);
  rejects(harvest, cleared.id, add(cleared, { kg: 1 }), 400, 'Batch is cleared', []);
});

test('9.9 POST crates: a batch whose room was archived takes crates', () => {
  const { harvest, call, room, db } = setup();
  const r1 = room('Room 1');
  const b = seed(harvest, {}, r1);
  db.archiveRoom(r1);
  assert.equal(call('POST', `api/batches/${b.id}/crates`, { body: { kg: 2 } }).status, 201);
});

test('9.10 DELETE /api/crates/:crateId: 200 Crate', () => {
  const { harvest, call, room } = setup();
  const b = seed(harvest, {}, room('Room 1'));
  const c = harvest.addCrate(b.id, { kg: 5, picker: null, t: NOW - DAY });
  const undoArgs = [];
  const realUndo = harvest.undoCrate;
  harvest.undoCrate = (...a) => { undoArgs.push(a); return realUndo(...a); };
  const res = call('DELETE', `api/crates/${c.id}`);
  assert.deepStrictEqual(undoArgs, [[c.id, NOW]]);
  assert.equal(res.status, 200);
  assert.deepStrictEqual(res.body, { ...c, deleted_at: NOW });
  assert.equal(Rules.totals(harvest.getBatch(b.id), harvest.listCrates(b.id)).crates, 0);
});

test('9.10 DELETE: 404 Unknown crate, 400 Crate is already undone', () => {
  const { harvest, call, room, setClock } = setup();
  const b = seed(harvest, {}, room('Room 1'));
  const c = harvest.addCrate(b.id, { kg: 5, picker: null, t: NOW - DAY });
  for (const bad of ['abc', '0', '1.5', '999']) {
    rejects(harvest, b.id, () => call('DELETE', `api/crates/${bad}`), 404, 'Unknown crate', []);
  }
  call('DELETE', `api/crates/${c.id}`);
  setClock(NOW + 100);
  rejects(harvest, b.id, () => call('DELETE', `api/crates/${c.id}`), 400, 'Crate is already undone', []);
  assert.equal(harvest.getCrate(c.id).deleted_at, NOW);
});

test('9.10 DELETE: a crate of a cleared batch can be undone', () => {
  const { harvest, call, room } = setup();
  const b = seed(harvest, {}, room('Room 1'));
  const c = harvest.addCrate(b.id, { kg: 5, picker: null, t: NOW - 3 * DAY });
  harvest.clearBatch(b.id, NOW - DAY);
  assert.equal(call('DELETE', `api/crates/${c.id}`).status, 200);
});

test('store errors reach the caller unchanged', () => {
  const { harvest, call, room } = setup();
  const b = seed(harvest, {}, room('Room 1'));
  const E = Object.assign(new Error('CHECK constraint failed'), { code: 'ERR_SQLITE_ERROR', errcode: 275 });
  harvest.addCrate = () => { throw E; };
  assert.throws(() => call('POST', `api/batches/${b.id}/crates`, { body: { kg: 1 } }), e => e === E);
  const F = Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 });
  harvest.listBatches = () => { throw F; };
  assert.throws(() => call('GET', 'api/batches'), e => e === F);
  // The id and room lookups turn only NOT_FOUND into an answer; anything else reaches mapError unchanged.
  const s2 = setup();
  const r2 = s2.room('Room 1');
  const b2 = seed(s2.harvest, {}, r2);
  const fresh = seed(s2.harvest);
  const c2 = s2.harvest.addCrate(b2.id, { kg: 1, picker: null, t: NOW - DAY });
  const realGetRoom = s2.db.getRoom;
  s2.db.getRoom = () => { throw F; };
  assert.throws(() => s2.call('GET', 'api/batches', { query: `room=${r2}` }), e => e === F);
  assert.throws(() => s2.call('POST', `api/batches/${fresh.id}/place`, { body: { room_id: r2 } }), e => e === F);
  s2.db.getRoom = realGetRoom;
  s2.harvest.getBatch = () => { throw F; };
  assert.throws(() => s2.call('GET', `api/batches/${b2.id}`), e => e === F);
  s2.harvest.getCrate = () => { throw F; };
  assert.throws(() => s2.call('DELETE', `api/crates/${c2.id}`), e => e === F);
});

test('day rules compare farm days: previous day is 400, same day is clamped', () => {
  const { harvest, call, room } = setup();
  const r1 = room('Room 1');
  const D = startOfDay(NOW - 3 * DAY); // 00:00 three days ago
  const received = seed(harvest, { received_at: D + 10 * 3600 });
  const place = at => () => call('POST', `api/batches/${received.id}/place`, { body: { room_id: r1, placed_at: at } });
  rejects(harvest, received.id, place(D - 1), 400, 'Invalid batch', ['placed_at: must not be before the day it was received']);
  // Same day, earlier hour: stored clamped to received_at (LD 78).
  assert.equal(place(D)().body.placed_at, D + 10 * 3600);
  const placed = seed(harvest, { received_at: D + 9 * 3600 }, r1, D + 10 * 3600);
  const clear = at => () => call('POST', `api/batches/${placed.id}/clear`, { body: { cleared_at: at } });
  rejects(harvest, placed.id, clear(D - 1), 400, 'Invalid batch', ['cleared_at: must not be before the day it was placed']);
  assert.equal(clear(D)().body.cleared_at, D + 10 * 3600);
  const patch = at => () => call('PATCH', `api/batches/${placed.id}`, { body: { received_at: at } });
  rejects(harvest, placed.id, patch(D + DAY), 400, 'Invalid batch', ['received_at: must not be after the day it was placed']);
  assert.equal(patch(D + 11 * 3600)().body.received_at, D + 10 * 3600);
  assert.equal(patch(D + DAY - 1)().body.received_at, D + 10 * 3600); // 23:59:59 the same farm day: clamped
  assert.equal(patch(D + 9 * 3600 + 60)().body.received_at, D + 9 * 3600 + 60);
});

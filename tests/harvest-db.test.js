// Harvest store (server/harvest-db.js). Contract: docs/contracts/harvest.md sections 3, 5 and 13.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { openHarvest } = require('../server/harvest-db.js');
const { SCHEMA_V4_HARVEST } = require('../server/harvest-schema.js');
const { NotFoundError } = require('../server/db-common.js');
const { openFakeDb } = require('./fakes/db.js');
const { openFakeHarvest } = require('./fakes/harvest-db.js');
const { openDb, UPGRADES } = require('../server/db.js');

const HAS_V4 = UPGRADES.some(u => u.version === 4);
const DAY = 86400;

const BATCH_KEYS = ['id', 'crop', 'strain', 'source', 'block_count', 'block_wet_kg', 'moisture_pct', 'spawn_date', 'received_at', 'room_id', 'placed_at', 'cleared_at', 'flush_gap_days', 'notes', 'created_at'];
const CRATE_KEYS = ['id', 'batch_id', 't', 'kg', 'picker', 'deleted_at'];

// Per test: the clock starts at 2026-10-08 17:00 farm time and moves with `clock += ...`.
let clock;
const now = () => clock;

const batch = over => ({ crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: clock - 86400, ...over });
const crate = over => ({ kg: 12.5, ...over });

function openFake(t, now) {
  const db = openFakeDb({ now });
  const harvest = openFakeHarvest(db, { now });
  t.after(() => db.close());
  const addRoom = (name, { archived = false } = {}) => {
    const room = db.createRoom({ name, volume: 60, settings: {} });
    if (archived) db.archiveRoom(room.id);
    return room.id;
  };
  return { db, harvest, addRoom, archiveRoom: id => db.archiveRoom(id) };
}

function openReal(t, now) {
  let db;
  let addRoom;
  let archiveRoom;
  if (HAS_V4) {
    archiveRoom = id => db.archiveRoom(id);
    db = openDb(':memory:', { now });
    t.after(() => db.close());
    addRoom = (name, { archived = false } = {}) => {
      const room = db.createRoom({ name, volume: 60, settings: {} });
      if (archived) db.archiveRoom(room.id);
      return room.id;
    };
  } else {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived_at INTEGER) STRICT;');
    sqlite.exec(SCHEMA_V4_HARVEST);
    const getRoom = id => { const r = sqlite.prepare('SELECT * FROM rooms WHERE id = ?').get(id); if (!r) throw new NotFoundError('room', id); return { ...r }; };
    db = { version: 4, sqlite, getRoom };
    t.after(() => sqlite.close());
    archiveRoom = id => sqlite.prepare('UPDATE rooms SET archived_at = ? WHERE id = ?').run(now(), id);
    addRoom = (name, { archived = false } = {}) => Number(sqlite.prepare('INSERT INTO rooms (name, archived_at) VALUES (?, ?)').run(name, archived ? now() : null).lastInsertRowid);
  }
  const harvest = openHarvest(db, { now });
  return { db, harvest, addRoom, archiveRoom };
}

const TARGETS = [['fake', openFake], ['real', openReal]];

function both(name, fn) {
  for (const [label, opener] of TARGETS) {
    test(`${label}: ${name}`, t => {
      clock = 1791450000;
      return fn(t, () => opener(t, now));
    });
  }
}

function realTest(name, fn) {
  test(`real: ${name}`, t => {
    clock = 1791450000;
    return fn(t);
  });
}

function assertNotFound(fn, what, id) {
  assert.throws(fn, e => {
    assert.ok(e instanceof NotFoundError);
    assert.equal(e.code, 'NOT_FOUND');
    assert.equal(e.what, what);
    assert.ok(Object.is(e.id, id), `id ${String(e.id)} is not ${String(id)}`);
    assert.equal(e.message, `Unknown ${what} ${id}`);
    return true;
  });
}

function assertSql(fn, errcode) {
  assert.throws(fn, e => {
    assert.equal(e.code, 'ERR_SQLITE_ERROR');
    assert.equal(e.errcode, errcode);
    assert.equal(e.errcode & 0xff, 19);
    return true;
  });
}

function assertTypeError(fn, message) {
  assert.throws(fn, e => e instanceof TypeError && e.message === message);
}

const isPlain = row => Object.getPrototypeOf(row) === Object.prototype;

// Task 1: openHarvest
realTest('openHarvest rejects an unknown option', t => {
  const { db } = openReal(t, now);
  assert.throws(() => openHarvest(db, { nope: 1 }), TypeError);
});

realTest('openHarvest needs schema version 4', t => {
  const { db } = openReal(t, now);
  assert.throws(() => openHarvest({ version: 3, sqlite: db.sqlite, getRoom: db.getRoom }, { now }),
    e => e.constructor === Error && e.message === 'Harvest needs schema version 4 or newer');
  assert.doesNotThrow(() => openHarvest({ version: 4, sqlite: db.sqlite, getRoom: db.getRoom }, { now }));
});


// Task 2: createBatch, getBatch
realTest('the store writes through db.sqlite', t => {
  const { db, harvest } = openReal(t, now);
  harvest.createBatch(batch());
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM batches').get().n, 1);
});

both('createBatch: shape and defaults', (t, open) => {
  const { harvest } = open();
  const row = harvest.createBatch(batch());
  assert.deepEqual(Object.keys(row), BATCH_KEYS);
  for (const k of ['strain', 'source', 'spawn_date', 'room_id', 'placed_at', 'cleared_at', 'notes']) assert.equal(row[k], null, k);
  assert.equal(row.flush_gap_days, 5);
  assert.equal(row.created_at, clock);
  assert.ok(Number.isInteger(row.id));
  assert.deepEqual(harvest.getBatch(row.id), row);
  assert.ok(isPlain(row));
});

both('createBatch: explicit values are stored', (t, open) => {
  const { harvest } = open();
  const row = harvest.createBatch(batch({ strain: 'PO-2', source: 'Kebun', spawn_date: clock - 30 * DAY, flush_gap_days: 7, notes: 'rack 2', at: 5 }));
  assert.equal(row.strain, 'PO-2');
  assert.equal(row.source, 'Kebun');
  assert.equal(row.spawn_date, clock - 30 * DAY);
  assert.equal(row.flush_gap_days, 7);
  assert.equal(row.notes, 'rack 2');
  assert.equal(row.created_at, 5);
});

both('createBatch: unknown field; nothing stored', (t, open) => {
  const { harvest } = open();
  assertTypeError(() => harvest.createBatch(batch({ colour: 'red' })), 'createBatch: unknown field "colour"');
  assertTypeError(() => harvest.createBatch(batch({ room_id: 1 })), 'createBatch: unknown field "room_id"');
  assert.deepEqual(harvest.listBatches(), []);
});

both('getBatch: unknown ids throw NotFoundError(batch)', (t, open) => {
  const { harvest } = open();
  harvest.createBatch(batch());
  for (const id of [999, NaN, '1', undefined]) assertNotFound(() => harvest.getBatch(id), 'batch', id);
});

// Task 3: listBatches
both('listBatches: order is received_at descending, then id descending', (t, open) => {
  const { harvest } = open();
  const a = harvest.createBatch(batch({ received_at: clock - 3 * DAY }));
  const b = harvest.createBatch(batch({ received_at: clock - DAY }));
  const c = harvest.createBatch(batch({ received_at: clock - DAY }));
  assert.deepEqual(harvest.listBatches().map(r => r.id), [c.id, b.id, a.id]);
  assert.ok(isPlain(harvest.listBatches()[0]));
});

both('listBatches: state filter', (t, open) => {
  const { harvest, addRoom } = open();
  const room = addRoom('A');
  const received = harvest.createBatch(batch());
  const placed = harvest.createBatch(batch());
  const cleared = harvest.createBatch(batch());
  harvest.placeBatch(placed.id, room, clock);
  harvest.placeBatch(cleared.id, room, clock);
  harvest.clearBatch(cleared.id, clock + 10);
  const ids = options => harvest.listBatches(options).map(r => r.id).sort();
  assert.deepEqual(ids({ state: 'received' }), [received.id]);
  assert.deepEqual(ids({ state: 'placed' }), [placed.id]);
  assert.deepEqual(ids({ state: 'cleared' }), [cleared.id]);
  const all = [received.id, placed.id, cleared.id].sort();
  assert.deepEqual(ids({ state: null }), all);
  assert.deepEqual(ids({}), all);
});

both('listBatches: room filter; archived rooms count', (t, open) => {
  const { harvest, addRoom, archiveRoom } = open();
  const roomA = addRoom('A');
  const roomB = addRoom('B');
  const inA = harvest.createBatch(batch());
  const inB = harvest.createBatch(batch());
  const inA2 = harvest.createBatch(batch());
  harvest.createBatch(batch());
  harvest.placeBatch(inA.id, roomA, clock);
  harvest.placeBatch(inB.id, roomB, clock);
  harvest.placeBatch(inA2.id, roomA, clock);
  harvest.clearBatch(inA2.id, clock + 1);
  const ids = options => harvest.listBatches(options).map(r => r.id).sort();
  assert.deepEqual(ids({ room_id: roomB }), [inB.id]);
  assert.deepEqual(ids({ room_id: roomA, state: 'placed' }), [inA.id]);
  archiveRoom(roomB);
  assert.deepEqual(ids({ room_id: roomB }), [inB.id]);
});

both('listBatches: room_id filters in every state (LD 70)', (t, open) => {
  const { harvest, addRoom } = open();
  const room = addRoom('A');
  harvest.createBatch(batch());
  const placed = harvest.createBatch(batch());
  const cleared = harvest.createBatch(batch());
  harvest.placeBatch(placed.id, room, clock);
  harvest.placeBatch(cleared.id, room, clock);
  harvest.clearBatch(cleared.id, clock + 1);
  assert.deepEqual(harvest.listBatches({ room_id: room }).map(r => r.id).sort(), [placed.id, cleared.id].sort());
  assert.deepEqual(harvest.listBatches({ room_id: room, state: 'cleared' }).map(r => r.id), [cleared.id]);
});

both('listBatches: errors', (t, open) => {
  const { harvest } = open();
  assert.throws(() => harvest.listBatches({ state: 'gone' }), RangeError);
  assertNotFound(() => harvest.listBatches({ room_id: 999 }), 'room', 999);
  assertTypeError(() => harvest.listBatches({ room: 1 }), 'listBatches: unknown field "room"');
});

// Task 4: updateBatch
both('updateBatch: changes fields; {} changes nothing', (t, open) => {
  const { harvest } = open();
  const row = harvest.createBatch(batch());
  const changed = harvest.updateBatch(row.id, { strain: 'X', notes: 'n', flush_gap_days: 6 });
  assert.deepEqual(changed, { ...row, strain: 'X', notes: 'n', flush_gap_days: 6 });
  assert.deepEqual(Object.keys(changed), BATCH_KEYS);
  assert.deepEqual(harvest.updateBatch(row.id, {}), changed);
});

both('updateBatch: fields it refuses', (t, open) => {
  const { harvest } = open();
  const row = harvest.createBatch(batch());
  for (const key of ['room_id', 'placed_at', 'cleared_at', 'created_at', 'at', 'colour']) {
    assertTypeError(() => harvest.updateBatch(row.id, { [key]: 1 }), `updateBatch: unknown field "${key}"`);
  }
  assert.deepEqual(harvest.getBatch(row.id), row);
});

both('updateBatch: a constraint failure leaves the row unchanged', (t, open) => {
  const { harvest } = open();
  const row = harvest.createBatch(batch());
  assertSql(() => harvest.updateBatch(row.id, { moisture_pct: 100 }), 275);
  assertSql(() => harvest.updateBatch(row.id, { crop: null }), 1299);
  assert.deepEqual(harvest.getBatch(row.id), row);
});

both('updateBatch: unknown batch', (t, open) => {
  const { harvest } = open();
  assertNotFound(() => harvest.updateBatch(999, { strain: 'X' }), 'batch', 999);
});

both('updateBatch: an explicit undefined sets NULL (LD 70)', (t, open) => {
  const { harvest } = open();
  const row = harvest.createBatch(batch({ strain: 'PO-2', notes: 'n' }));
  const cleared = harvest.updateBatch(row.id, { strain: undefined, notes: undefined });
  assert.equal(cleared.strain, null);
  assert.equal(cleared.notes, null);
  assertSql(() => harvest.updateBatch(row.id, { crop: undefined }), 1299);
  assert.deepEqual(harvest.getBatch(row.id), cleared);
});

// Task 5: placeBatch, clearBatch
both('placeBatch: sets room_id and placed_at', (t, open) => {
  const { harvest, addRoom } = open();
  const room = addRoom('A');
  const row = harvest.createBatch(batch());
  const placed = harvest.placeBatch(row.id, room, clock);
  assert.deepEqual(placed, { ...row, room_id: room, placed_at: clock });
  assert.deepEqual(harvest.getBatch(row.id), placed);
  assert.ok(isPlain(placed));
});

both('placeBatch: archived room accepted; unknown room and batch throw', (t, open) => {
  const { harvest, addRoom } = open();
  const archived = addRoom('Old', { archived: true });
  const valid = addRoom('A');
  const row = harvest.createBatch(batch());
  assert.equal(harvest.placeBatch(row.id, archived, clock).room_id, archived);
  const other = harvest.createBatch(batch());
  assertNotFound(() => harvest.placeBatch(other.id, 999, clock), 'room', 999);
  assert.deepEqual(harvest.getBatch(other.id), other);
  assertNotFound(() => harvest.placeBatch(999, valid, clock), 'batch', 999);
});

both('placeBatch: placed before received is a CHECK failure', (t, open) => {
  const { harvest, addRoom } = open();
  const room = addRoom('A');
  const row = harvest.createBatch(batch());
  assertSql(() => harvest.placeBatch(row.id, room, row.received_at - 1), 275);
  assert.deepEqual(harvest.getBatch(row.id), row);
});

both('clearBatch: sets cleared_at', (t, open) => {
  const { harvest, addRoom } = open();
  const room = addRoom('A');
  const row = harvest.createBatch(batch());
  const placed = harvest.placeBatch(row.id, room, clock);
  const cleared = harvest.clearBatch(row.id, clock + 100);
  assert.deepEqual(cleared, { ...placed, cleared_at: clock + 100 });
  assert.deepEqual(harvest.getBatch(row.id), cleared);
});

both('clearBatch: before placed, or on a received batch, is a CHECK failure', (t, open) => {
  const { harvest, addRoom } = open();
  const room = addRoom('A');
  const received = harvest.createBatch(batch());
  assertSql(() => harvest.clearBatch(received.id, clock), 275);
  assert.deepEqual(harvest.getBatch(received.id), received);
  const placed = harvest.placeBatch(harvest.createBatch(batch()).id, room, clock);
  assertSql(() => harvest.clearBatch(placed.id, placed.placed_at - 1), 275);
  assert.deepEqual(harvest.getBatch(placed.id), placed);
});

both('clearBatch: unknown batch', (t, open) => {
  const { harvest } = open();
  assertNotFound(() => harvest.clearBatch(999, clock), 'batch', 999);
});

both('placeBatch: an unknown batch wins over an unknown room (LD 70)', (t, open) => {
  const { harvest } = open();
  assertNotFound(() => harvest.placeBatch(999, 999, clock), 'batch', 999);
});

both('clearBatch: null un-clears a cleared batch (LD 70)', (t, open) => {
  const { harvest, addRoom } = open();
  const room = addRoom('A');
  const row = harvest.createBatch(batch());
  harvest.placeBatch(row.id, room, clock);
  harvest.clearBatch(row.id, clock + 5);
  const back = harvest.clearBatch(row.id, null);
  assert.equal(back.cleared_at, null);
  assert.equal(back.room_id, room);
  assert.equal(back.placed_at, clock);
});

// Task 6: addCrate, getCrate
both('addCrate: shape and default t', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  const row = harvest.addCrate(b.id, { kg: 12.5 });
  assert.deepEqual(Object.keys(row), CRATE_KEYS);
  assert.equal(row.batch_id, b.id);
  assert.equal(row.t, clock);
  assert.equal(row.kg, 12.5);
  assert.equal(row.picker, null);
  assert.equal(row.deleted_at, null);
  assert.deepEqual(harvest.getCrate(row.id), row);
  assert.ok(isPlain(row));
});

both('addCrate: explicit t and picker; integer kg', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  const row = harvest.addCrate(b.id, { kg: 12, picker: 'Aminah', t: clock - 60 });
  assert.equal(row.kg, 12);
  assert.equal(row.t, clock - 60);
  assert.equal(row.picker, 'Aminah');
});

both('addCrate: unknown field; unknown batch', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  assertTypeError(() => harvest.addCrate(b.id, { kg: 1, batch_id: 2 }), 'addCrate: unknown field "batch_id"');
  assert.equal(harvest.countCrates(b.id), 0);
  assertNotFound(() => harvest.addCrate(999, crate()), 'batch', 999);
});

both('getCrate: unknown ids throw NotFoundError(crate)', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  harvest.addCrate(b.id, crate());
  for (const id of [999, NaN, '1', undefined]) assertNotFound(() => harvest.getCrate(id), 'crate', id);
});

// Task 7: listCrates
function threeBatchCrates(harvest) {
  const b = harvest.createBatch(batch());
  const ids = {};
  for (const t of [300, 100, 200, 400, 400]) ids[`${t}${ids[t] === undefined ? '' : 'b'}`] = harvest.addCrate(b.id, crate({ t })).id;
  return { b, ids };
}

both('listCrates: t ascending, then id; undone crates included', (t, open) => {
  const { harvest } = open();
  const { b, ids } = threeBatchCrates(harvest);
  harvest.undoCrate(ids[100], 500);
  const rows = harvest.listCrates(b.id);
  assert.deepEqual(rows.map(r => r.id), [ids[100], ids[200], ids[300], ids[400], ids['400b']]);
  assert.equal(rows[0].deleted_at, 500);
  assert.deepEqual(Object.keys(rows[0]), CRATE_KEYS);
  assert.ok(isPlain(rows[0]));
});

both('listCrates: from is inclusive', (t, open) => {
  const { harvest } = open();
  const { b } = threeBatchCrates(harvest);
  assert.deepEqual(harvest.listCrates(b.id, { from: 200 }).map(r => r.t), [200, 300, 400, 400]);
  assert.deepEqual(harvest.listCrates(b.id, { from: null }), harvest.listCrates(b.id, {}));
});

both('listCrates: a null or non-finite from is no filter (LD 70)', (t, open) => {
  const { harvest } = open();
  const { b } = threeBatchCrates(harvest);
  const all = harvest.listCrates(b.id);
  assert.equal(all.length, 5);
  for (const from of [Infinity, -Infinity, NaN, null]) assert.deepEqual(harvest.listCrates(b.id, { from }), all, String(from));
});

both('listCrates: errors', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  assertTypeError(() => harvest.listCrates(b.id, { to: 5 }), 'listCrates: unknown field "to"');
  assertNotFound(() => harvest.listCrates(999), 'batch', 999);
});

// Task 8: undoCrate, countCrates
both('undoCrate: sets deleted_at; a second undo keeps the first time', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  const c = harvest.addCrate(b.id, crate());
  assert.equal(harvest.undoCrate(c.id, 500).deleted_at, 500);
  assert.equal(harvest.undoCrate(c.id, 900).deleted_at, 500);
  assert.ok(isPlain(harvest.undoCrate(c.id, 900)));
});

both('undoCrate: default at is now; unknown crate', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  const c = harvest.addCrate(b.id, crate());
  clock += 30;
  assert.equal(harvest.undoCrate(c.id).deleted_at, clock);
  assertNotFound(() => harvest.undoCrate(999), 'crate', 999);
});

both('undoCrate: an explicit null at changes nothing (LD 70)', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  const live = harvest.addCrate(b.id, crate());
  const undone = harvest.addCrate(b.id, crate());
  harvest.undoCrate(undone.id, 500);
  assert.equal(harvest.undoCrate(live.id, null).deleted_at, null);
  assert.equal(harvest.listCrates(b.id).find(r => r.id === live.id).deleted_at, null);
  assert.equal(harvest.undoCrate(undone.id, null).deleted_at, 500);
});

both('countCrates: counts every row, undone ones included', (t, open) => {
  const { harvest } = open();
  const b = harvest.createBatch(batch());
  const first = harvest.addCrate(b.id, crate());
  harvest.addCrate(b.id, crate());
  harvest.addCrate(b.id, crate());
  harvest.undoCrate(first.id, 500);
  assert.equal(harvest.countCrates(b.id), 3);
  assert.equal(harvest.countCrates(harvest.createBatch(batch()).id), 0);
  assertNotFound(() => harvest.countCrates(999), 'batch', 999);
});

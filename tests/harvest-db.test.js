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
  return { db, harvest, addRoom };
}

function openReal(t, now) {
  let db;
  let addRoom;
  if (HAS_V4) {
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
    addRoom = (name, { archived = false } = {}) => Number(sqlite.prepare('INSERT INTO rooms (name, archived_at) VALUES (?, ?)').run(name, archived ? now() : null).lastInsertRowid);
  }
  const harvest = openHarvest(db, { now });
  return { db, harvest, addRoom };
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

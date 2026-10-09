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


// In-memory fake of the harvest store (docs/contracts/harvest.md sections 5 and 5.4). No SQLite; the room check goes
// through the db object's getRoom, as the real store does. Reproduces the rules of the schema of C10 section 3.
'use strict';
const { NotFoundError } = require('../../server/db-common.js');

const STATES = ['received', 'placed', 'cleared'];
const BATCH_FIELDS = ['crop', 'strain', 'source', 'block_count', 'block_wet_kg', 'moisture_pct', 'spawn_date', 'received_at', 'flush_gap_days', 'notes'];

function constraintError(message, errcode) {
  return Object.assign(new Error(message), { code: 'ERR_SQLITE_ERROR', errcode, errstr: 'constraint failed' });
}

// One column of a STRICT table: missing or non-finite -> NULL, then NOT NULL (1299), type (3091), CHECK (275).
function column(raw, { type, notNull, check, name }) {
  const v = raw;
  if (v === undefined || v === null || (typeof v === 'number' && !Number.isFinite(v))) {
    if (notNull) throw constraintError(`NOT NULL constraint failed: ${name}`, 1299);
    return null;
  }
  if (type === 'TEXT') {
    if (typeof v !== 'string') throw constraintError(`cannot store ${typeof v} value in TEXT column ${name}`, 3091);
  } else {
    if (typeof v !== 'number') throw constraintError(`cannot store value in ${type} column ${name}`, 3091);
    if (type === 'INTEGER' && !Number.isInteger(v)) throw constraintError(`cannot store REAL value in INTEGER column ${name}`, 3091);
  }
  if (check && !check(v)) throw constraintError(`CHECK constraint failed: ${name}`, 275);
  return v;
}

function checkFields(obj, allowed, label) {
  if (obj == null) return;
  for (const k of Object.keys(obj)) {
    if (!allowed.includes(k)) throw new TypeError(`${label}: unknown field "${k}"`);
  }
}

// A missing (undefined) or explicit null options argument is treated as {}.
function orEmpty(v) {
  return v == null ? {} : v;
}

// Every column and table CHECK of `batches`, in SQL order. `row` holds the 15 columns (undefined counts as NULL).
function validateBatch(row) {
  const out = {
    id: row.id,
    crop: column(row.crop, { type: 'TEXT', notNull: true, name: 'batches.crop' }),
    strain: column(row.strain, { type: 'TEXT', name: 'batches.strain' }),
    source: column(row.source, { type: 'TEXT', name: 'batches.source' }),
    block_count: column(row.block_count, { type: 'INTEGER', notNull: true, check: v => v >= 1, name: 'batches.block_count' }),
    block_wet_kg: column(row.block_wet_kg, { type: 'REAL', notNull: true, check: v => v > 0, name: 'batches.block_wet_kg' }),
    moisture_pct: column(row.moisture_pct, { type: 'REAL', notNull: true, check: v => v >= 0 && v < 100, name: 'batches.moisture_pct' }),
    spawn_date: column(row.spawn_date, { type: 'INTEGER', name: 'batches.spawn_date' }),
    received_at: column(row.received_at, { type: 'INTEGER', notNull: true, name: 'batches.received_at' }),
    room_id: column(row.room_id, { type: 'INTEGER', name: 'batches.room_id' }),
    placed_at: column(row.placed_at, { type: 'INTEGER', name: 'batches.placed_at' }),
    cleared_at: column(row.cleared_at, { type: 'INTEGER', name: 'batches.cleared_at' }),
    flush_gap_days: column(row.flush_gap_days, { type: 'INTEGER', notNull: true, check: v => v >= 1, name: 'batches.flush_gap_days' }),
    notes: column(row.notes, { type: 'TEXT', name: 'batches.notes' }),
    created_at: column(row.created_at, { type: 'INTEGER', notNull: true, name: 'batches.created_at' }),
  };
  if ((out.room_id === null) !== (out.placed_at === null)) throw constraintError('CHECK constraint failed: room_id and placed_at', 275);
  if (out.placed_at !== null && out.placed_at < out.received_at) throw constraintError('CHECK constraint failed: placed_at >= received_at', 275);
  if (out.cleared_at !== null && (out.placed_at === null || out.cleared_at < out.placed_at)) {
    throw constraintError('CHECK constraint failed: cleared_at >= placed_at', 275);
  }
  return out;
}

function stateOf(b) {
  if (b.cleared_at !== null) return 'cleared';
  return b.room_id !== null ? 'placed' : 'received';
}

function openFakeHarvest(db, options) {
  options = orEmpty(options);
  for (const k of Object.keys(options)) {
    if (k !== 'now') throw new TypeError(`openFakeHarvest: unknown option "${k}"`);
  }
  const now = options.now || (() => Math.floor(Date.now() / 1000));

  let batches = [];
  let crates = [];
  let nextBatch = 1;
  let nextCrate = 1;

  const copy = row => ({ ...row });

  function requireBatch(id) {
    const row = Number.isInteger(id) ? batches.find(b => b.id === id) : undefined;
    if (!row) throw new NotFoundError('batch', id);
    return row;
  }

  function requireCrate(id) {
    const row = Number.isInteger(id) ? crates.find(c => c.id === id) : undefined;
    if (!row) throw new NotFoundError('crate', id);
    return row;
  }

  // Replace the stored row's columns with `next` once every rule has passed.
  function store(row, next) {
    Object.assign(row, validateBatch(next));
    return copy(row);
  }

  function createBatch(fields) {
    checkFields(fields, [...BATCH_FIELDS, 'at'], 'createBatch');
    fields = orEmpty(fields);
    const next = {
      ...fields,
      id: nextBatch,
      flush_gap_days: fields.flush_gap_days === undefined ? 5 : fields.flush_gap_days,
      room_id: null,
      placed_at: null,
      cleared_at: null,
      created_at: fields.at === undefined ? now() : fields.at,
    };
    const row = validateBatch(next);
    nextBatch += 1;
    batches.push(row);
    return copy(row);
  }

  function getBatch(id) {
    return copy(requireBatch(id));
  }

  function listBatches(options) {
    options = orEmpty(options);
    checkFields(options, ['state', 'room_id'], 'listBatches');
    const state = options.state === undefined ? null : options.state;
    if (state !== null && !STATES.includes(state)) throw new RangeError(`listBatches: unknown state "${state}"`);
    const roomId = options.room_id === undefined ? null : options.room_id;
    if (roomId !== null) db.getRoom(roomId);
    return batches
      .filter(b => (state === null || stateOf(b) === state) && (roomId === null || b.room_id === roomId))
      .sort((a, b) => b.received_at - a.received_at || b.id - a.id)
      .map(copy);
  }

  function updateBatch(id, changes) {
    const row = requireBatch(id);
    checkFields(changes, BATCH_FIELDS, 'updateBatch');
    const next = { ...row };
    for (const k of Object.keys(orEmpty(changes))) next[k] = changes[k];
    return store(row, next);
  }

  function placeBatch(id, roomId, placedAt) {
    const row = requireBatch(id);
    db.getRoom(roomId);
    return store(row, { ...row, room_id: roomId, placed_at: placedAt });
  }

  function clearBatch(id, clearedAt) {
    const row = requireBatch(id);
    return store(row, { ...row, cleared_at: clearedAt });
  }

  function deleteBatch(id) {
    const row = requireBatch(id);
    if (crates.some(c => c.batch_id === id)) throw constraintError('FOREIGN KEY constraint failed', 787);
    batches = batches.filter(b => b !== row);
    return copy(row);
  }

  function countCrates(batchId) {
    requireBatch(batchId);
    return crates.filter(c => c.batch_id === batchId).length;
  }

  function addCrate(batchId, crate) {
    requireBatch(batchId);
    checkFields(crate, ['kg', 'picker', 't'], 'addCrate');
    crate = orEmpty(crate);
    const row = {
      id: nextCrate,
      batch_id: batchId,
      t: column(crate.t === undefined ? now() : crate.t, { type: 'INTEGER', notNull: true, name: 'harvest_crates.t' }),
      kg: column(crate.kg, { type: 'REAL', notNull: true, check: v => v >= 0.01 && v <= 50, name: 'harvest_crates.kg' }),
      picker: column(crate.picker, { type: 'TEXT', name: 'harvest_crates.picker' }),
      deleted_at: null,
    };
    nextCrate += 1;
    crates.push(row);
    return crateCopy(row);
  }

  // The 6 columns of harvest_crates in SQL order.
  function crateCopy(c) {
    return { id: c.id, batch_id: c.batch_id, t: c.t, kg: c.kg, picker: c.picker, deleted_at: c.deleted_at };
  }

  function listCrates(batchId, options) {
    requireBatch(batchId);
    options = orEmpty(options);
    checkFields(options, ['from'], 'listCrates');
    const from = options.from === undefined ? null : options.from;
    return crates
      .filter(c => c.batch_id === batchId && (from === null || c.t >= from))
      .sort((a, b) => a.t - b.t || a.id - b.id)
      .map(crateCopy);
  }

  function getCrate(id) {
    return crateCopy(requireCrate(id));
  }

  function undoCrate(id, at) {
    const row = requireCrate(id);
    if (row.deleted_at === null) {
      row.deleted_at = column(at === undefined ? now() : at, { type: 'INTEGER', name: 'harvest_crates.deleted_at' });
    }
    return crateCopy(row);
  }

  return {
    createBatch, getBatch, listBatches, updateBatch, placeBatch, clearBatch, deleteBatch,
    countCrates, addCrate, listCrates, getCrate, undoCrate,
  };
}

module.exports = { openFakeHarvest };

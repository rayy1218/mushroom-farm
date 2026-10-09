// Harvest store: batches and the crates picked from them (docs/contracts/harvest.md section 5).
// Synchronous; runs its statements on the C1 connection (db.sqlite) and opens none of its own.
'use strict';
const { NotFoundError } = require('./db-common.js');

const BATCH_FIELDS = ['crop', 'strain', 'source', 'block_count', 'block_wet_kg', 'moisture_pct', 'spawn_date', 'received_at', 'flush_gap_days', 'notes'];
const STATES = ['received', 'placed', 'cleared'];

// Unknown own keys throw before anything is written (C1 section 1).
function fields(fn, obj, allowed) {
  if (obj === undefined || obj === null) return;
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) throw new TypeError(`${fn}: unknown field "${key}"`);
  }
}

// node:sqlite throws on undefined and stores Infinity: both become what C1 binds, NULL.
function val(x) {
  if (x === undefined) return null;
  if (typeof x === 'number' && !Number.isFinite(x)) return null;
  return x;
}

const plain = row => (row ? { ...row } : null);
const orEmpty = x => (x === undefined || x === null ? {} : x);

function openHarvest(db, options) {
  options = orEmpty(options);
  for (const key of Object.keys(options)) {
    if (key !== 'now') throw new TypeError(`openHarvest: unknown option "${key}"`);
  }
  const now = options.now || (() => Math.floor(Date.now() / 1000));
  if (!(db.version >= 4)) throw new Error('Harvest needs schema version 4 or newer');
  const sqlite = db.sqlite;

  const insertBatch = sqlite.prepare(`INSERT INTO batches
    (crop, strain, source, block_count, block_wet_kg, moisture_pct, spawn_date, received_at, flush_gap_days, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`);
  const getBatchStmt = sqlite.prepare('SELECT * FROM batches WHERE id = ?');
  const listBatchesStmt = sqlite.prepare(`SELECT * FROM batches
    WHERE (? IS NULL OR (CASE WHEN cleared_at IS NOT NULL THEN 'cleared' WHEN room_id IS NOT NULL THEN 'placed' ELSE 'received' END) = ?)
      AND (? IS NULL OR room_id = ?)
    ORDER BY received_at DESC, id DESC`);
  const updateBatchStmt = sqlite.prepare(`UPDATE batches SET
    crop = ?, strain = ?, source = ?, block_count = ?, block_wet_kg = ?, moisture_pct = ?, spawn_date = ?, received_at = ?, flush_gap_days = ?, notes = ?
    WHERE id = ? RETURNING *`);
  const placeBatchStmt = sqlite.prepare('UPDATE batches SET room_id = ?, placed_at = ? WHERE id = ? RETURNING *');
  const clearBatchStmt = sqlite.prepare('UPDATE batches SET cleared_at = ? WHERE id = ? RETURNING *');
  const deleteBatchStmt = sqlite.prepare('DELETE FROM batches WHERE id = ?');
  const countCratesStmt = sqlite.prepare('SELECT COUNT(*) AS n FROM harvest_crates WHERE batch_id = ?');
  const insertCrate = sqlite.prepare('INSERT INTO harvest_crates (batch_id, t, kg, picker) VALUES (?, ?, ?, ?) RETURNING *');
  const listCratesStmt = sqlite.prepare(`SELECT * FROM harvest_crates
    WHERE batch_id = ? AND (? IS NULL OR t >= ?) ORDER BY t, id`);
  const getCrateStmt = sqlite.prepare('SELECT * FROM harvest_crates WHERE id = ?');
  // Only a live crate takes the time, so an undone crate keeps its first one.
  const undoCrateStmt = sqlite.prepare('UPDATE harvest_crates SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL');

  function batchOrThrow(id) {
    const row = Number.isInteger(id) ? getBatchStmt.get(id) : undefined;
    if (!row) throw new NotFoundError('batch', id);
    return row;
  }

  function crateOrThrow(id) {
    const row = Number.isInteger(id) ? getCrateStmt.get(id) : undefined;
    if (!row) throw new NotFoundError('crate', id);
    return row;
  }

  function createBatch(batch) {
    fields('createBatch', batch, [...BATCH_FIELDS, 'at']);
    batch = orEmpty(batch);
    return plain(insertBatch.get(
      val(batch.crop), val(batch.strain), val(batch.source), val(batch.block_count), val(batch.block_wet_kg),
      val(batch.moisture_pct), val(batch.spawn_date), val(batch.received_at),
      batch.flush_gap_days === undefined ? 5 : val(batch.flush_gap_days), val(batch.notes),
      batch.at === undefined ? now() : val(batch.at),
    ));
  }

  function getBatch(id) {
    return plain(batchOrThrow(id));
  }

  function listBatches(options) {
    fields('listBatches', options, ['state', 'room_id']);
    options = orEmpty(options);
    const state = val(options.state);
    if (state !== null && !STATES.includes(state)) throw new RangeError(`listBatches: unknown state "${state}"`);
    const roomId = val(options.room_id);
    if (roomId !== null) db.getRoom(roomId);
    return listBatchesStmt.all(state, state, roomId, roomId).map(plain);
  }

  return { createBatch, getBatch, listBatches };
}

module.exports = { openHarvest };

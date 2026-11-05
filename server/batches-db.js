// The Batches tables and their queries (spec 2026-11-05-batches-design.md 2 and 3.1): made by db.js's version-21 step and
// reached as db.batches (createBatchStore). Rows go in and come out in camelCase; the rules are server/batches.js's.
// Inventory's stock_items and stock_moves are Inventory's: they are written here only when they exist (contract section 7).

export const BATCHES_SCHEMA = `
CREATE TABLE IF NOT EXISTS batches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  kind            TEXT    NOT NULL DEFAULT 'bought' CHECK (kind IN ('bought', 'made')),
  parent_id       INTEGER,
  run_id          INTEGER,
  room_id         INTEGER,
  placed_at       INTEGER,
  crop            TEXT    NOT NULL,
  supplier        TEXT,
  received_at     INTEGER NOT NULL,
  blocks          INTEGER NOT NULL CHECK (blocks BETWEEN 1 AND 100000),
  price_per_block REAL    CHECK (price_per_block BETWEEN 0 AND 1000),
  spawn_batch     TEXT,
  strain          TEXT,
  delivery_ref    TEXT,
  inoculated_at   INTEGER,
  block_kg        REAL    CHECK (block_kg BETWEEN 0.2 AND 10),
  water_pct       REAL    CHECK (water_pct BETWEEN 30 AND 80),
  recipe_id       INTEGER,
  mixed_at        INTEGER,
  incubation      TEXT    CHECK (incubation IN ('room', 'area')),
  incubated_from  INTEGER,
  incubated_to    INTEGER,
  note            TEXT,
  created_at      INTEGER NOT NULL,
  CHECK ((run_id IS NULL) = (room_id IS NULL) AND (run_id IS NULL OR placed_at IS NOT NULL)),
  CHECK ((block_kg IS NULL) = (water_pct IS NULL))
) STRICT;
CREATE INDEX IF NOT EXISTS batches_by_run ON batches (run_id);
CREATE INDEX IF NOT EXISTS batches_by_received ON batches (received_at);
CREATE INDEX IF NOT EXISTS batches_by_parent ON batches (parent_id);
CREATE TABLE IF NOT EXISTS batch_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id   INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  lost       INTEGER NOT NULL CHECK (lost BETWEEN 1 AND 100000),
  cause      TEXT    NOT NULL CHECK (cause IN ('green', 'black', 'bacterial', 'pests', 'other')),
  worker     TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS batch_checks_by_batch ON batch_checks (batch_id, at);
CREATE TABLE IF NOT EXISTS batch_recipes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  crop        TEXT,
  sawdust_pct REAL    NOT NULL CHECK (sawdust_pct BETWEEN 0 AND 100),
  bran_pct    REAL    NOT NULL CHECK (bran_pct BETWEEN 0 AND 100),
  lime_pct    REAL    NOT NULL CHECK (lime_pct BETWEEN 0 AND 100),
  gypsum_pct  REAL    NOT NULL CHECK (gypsum_pct BETWEEN 0 AND 100),
  other_pct   REAL    NOT NULL DEFAULT 0 CHECK (other_pct BETWEEN 0 AND 100),
  other_name  TEXT,
  water_pct   REAL    NOT NULL CHECK (water_pct BETWEEN 30 AND 80),
  bag_kg      REAL    NOT NULL CHECK (bag_kg BETWEEN 0.2 AND 10),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at  INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS batch_materials (
  id            INTEGER PRIMARY KEY,
  batch_id      INTEGER NOT NULL,
  item          TEXT    NOT NULL CHECK (item IN ('sawdust', 'bran', 'lime', 'gypsum', 'other', 'spawn', 'bags')),
  name          TEXT,
  qty           REAL    NOT NULL CHECK (qty > 0 AND qty <= 100000),
  unit          TEXT    NOT NULL CHECK (unit IN ('kg', 'bags', 'pcs')),
  stock_item_id INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS batch_materials_by_batch ON batch_materials (batch_id);
CREATE TABLE IF NOT EXISTS batch_loads (
  id         INTEGER PRIMARY KEY,
  batch_id   INTEGER NOT NULL,
  method     TEXT    NOT NULL CHECK (method IN ('steam', 'pressure', 'pasteurise')),
  bags       INTEGER NOT NULL CHECK (bags BETWEEN 1 AND 100000),
  hot_at     INTEGER NOT NULL,
  hold_h     REAL    NOT NULL CHECK (hold_h BETWEEN 0.5 AND 24),
  temp_c     REAL    NOT NULL CHECK (temp_c BETWEEN 60 AND 130),
  worker     TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS batch_loads_by_batch ON batch_loads (batch_id);`;

// A batch's fields (camelCase) and their columns.
const COLUMNS = {
  kind: 'kind', parentId: 'parent_id', runId: 'run_id', roomId: 'room_id', placedAt: 'placed_at', crop: 'crop', supplier: 'supplier',
  receivedAt: 'received_at', blocks: 'blocks', pricePerBlock: 'price_per_block', spawnBatch: 'spawn_batch', strain: 'strain',
  deliveryRef: 'delivery_ref', inoculatedAt: 'inoculated_at', blockKg: 'block_kg', waterPct: 'water_pct', recipeId: 'recipe_id',
  mixedAt: 'mixed_at', incubation: 'incubation', incubatedFrom: 'incubated_from', incubatedTo: 'incubated_to', note: 'note',
  createdAt: 'created_at',
};
const CHECK_COLUMNS = { batchId: 'batch_id', at: 'at', lost: 'lost', cause: 'cause', worker: 'worker', note: 'note', createdAt: 'created_at' };

// Every batch with its lost blocks, its room's name and its run's times and crops.
const SELECT = `
SELECT b.*, rm.name AS room_name, ru.started_at AS run_started_at, ru.ended_at AS run_ended_at, ru.crops AS run_crops,
       COALESCE((SELECT SUM(c.lost) FROM batch_checks c WHERE c.batch_id = b.id), 0) AS lost,
       COALESCE((SELECT SUM(c.lost) FROM batch_checks c WHERE c.batch_id = b.id AND b.placed_at IS NOT NULL AND c.at <= b.placed_at), 0) AS lost_before
FROM batches b LEFT JOIN rooms rm ON rm.id = b.room_id LEFT JOIN runs ru ON ru.id = b.run_id`;

function batchOf(r) {
  const out = {};
  for (const [key, column] of Object.entries(COLUMNS)) out[key] = r[column];
  out.id = r.id;
  out.lost = r.lost;
  out.lostBefore = r.lost_before;
  out.roomName = r.room_name;
  out.runStartedAt = r.run_started_at;
  out.runEndedAt = r.run_ended_at;
  out.runCrops = r.run_crops === null ? null : JSON.parse(r.run_crops);
  return out;
}
const checkOf = (r) => ({ id: r.id, batchId: r.batch_id, at: r.at, lost: r.lost, cause: r.cause, worker: r.worker, note: r.note, createdAt: r.created_at });

// The columns and values of the given fields of `map` (an unknown field throws: a typo is a bug, not a no-op).
function columnsOf(fields, map) {
  return Object.entries(fields).map(([key, value]) => {
    if (!Object.hasOwn(map, key)) throw new Error(`No column for ${key}`);
    if (value === undefined) throw new Error(`No value for ${key}`);
    return [map[key], value];
  });
}

// db: the DatabaseSync (not db.js's wrapper). → the store.
export function createBatchStore(db) {
  const q = {
    all: db.prepare(`${SELECT} ORDER BY b.received_at DESC, b.id DESC`),
    get: db.prepare(`${SELECT} WHERE b.id = ?`),
    family: db.prepare(`${SELECT} WHERE b.id = ?1 OR b.parent_id = ?1 ORDER BY b.id`),
    byRun: db.prepare(`${SELECT} WHERE b.run_id = ? ORDER BY b.id`),
    remove: db.prepare('DELETE FROM batches WHERE id = ?'),
    removeChecks: db.prepare('DELETE FROM batch_checks WHERE batch_id = ?'),
    removeMaterials: db.prepare('DELETE FROM batch_materials WHERE batch_id = ?'),
    removeLoads: db.prepare('DELETE FROM batch_loads WHERE batch_id = ?'),
    checks: db.prepare('SELECT * FROM batch_checks WHERE batch_id = ? ORDER BY at, id'),
    check: db.prepare('SELECT * FROM batch_checks WHERE id = ?'),
    removeCheck: db.prepare('DELETE FROM batch_checks WHERE id = ?'),
    moveChecks: db.prepare('UPDATE batch_checks SET batch_id = ? WHERE batch_id = ?'),
    forgetRoom: db.prepare('UPDATE batches SET room_id = NULL, run_id = NULL WHERE room_id = ?'),
    hasStock: db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('stock_items', 'stock_moves')"),
  };

  function insertRow(table, fields, map) {
    const pairs = columnsOf(fields, map);
    const sql = `INSERT INTO ${table} (${pairs.map(([c]) => c).join(', ')}) VALUES (${pairs.map(() => '?').join(', ')})`;
    return Number(db.prepare(sql).run(...pairs.map(([, v]) => v)).lastInsertRowid);
  }
  function updateRow(table, id, fields, map) {
    const pairs = columnsOf(fields, map);
    if (!pairs.length) return;
    db.prepare(`UPDATE ${table} SET ${pairs.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...pairs.map(([, v]) => v), id);
  }

  return {
    // fn() inside one transaction; its value. Not nested: the callers of batches.js open one per write.
    tx(fn) {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    // Every batch, newest received first.
    all: () => q.all.all().map(batchOf),
    // A batch, or null.
    get(id) {
      const r = q.get.get(id);
      return r ? batchOf(r) : null;
    },
    // A delivery: its first row and its parts, by id.
    family: (firstId) => q.family.all(firstId).map(batchOf),
    // The batches put into a run.
    byRun: (runId) => q.byRun.all(runId).map(batchOf),
    // A new batch from its camelCase fields. → its id.
    insert: (fields) => insertRow('batches', fields, COLUMNS),
    // The given fields of a batch.
    update: (id, fields) => updateRow('batches', id, fields, COLUMNS),
    // A batch and its checks, materials and loads.
    remove(id) {
      q.removeChecks.run(id);
      q.removeMaterials.run(id);
      q.removeLoads.run(id);
      q.remove.run(id);
    },
    // A deleted room's batches keep their records and the time they went in, without the room and its run (db.js deleteRoom; room and run ids are reused).
    forgetRoom: (roomId) => q.forgetRoom.run(roomId),

    // A batch's checks, oldest first.
    checks: (batchId) => q.checks.all(batchId).map(checkOf),
    check(id) {
      const r = q.check.get(id);
      return r ? checkOf(r) : null;
    },
    insertCheck: (fields) => insertRow('batch_checks', fields, CHECK_COLUMNS),
    updateCheck: (id, fields) => updateRow('batch_checks', id, fields, CHECK_COLUMNS),
    removeCheck: (id) => q.removeCheck.run(id),
    // A folded part's checks go to its first row.
    moveChecks: (fromId, toId) => q.moveChecks.run(toId, fromId),

    // ---- Inventory's tables (contract section 7): only when they exist ----
    hasStock: () => q.hasStock.get().n === 2,
    // The stock item of kind 'blocks' with this name, made when missing. → its id.
    blocksItem(name) {
      const found = db.prepare("SELECT id FROM stock_items WHERE kind = 'blocks' AND name = ? ORDER BY id LIMIT 1").get(name);
      if (found) return found.id;
      return Number(db.prepare("INSERT INTO stock_items (name, kind, unit, reorder_at) VALUES (?, 'blocks', 'blocks', NULL)").run(name).lastInsertRowid);
    },
    insertMove({ itemId, at, qty, unitCost, refId, note }) {
      db.prepare("INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note) VALUES (?, ?, ?, ?, 'batch', ?, ?)")
        .run(itemId, at, qty, unitCost ?? null, refId, note ?? null);
    },
    // The 'batch' moves of these batch ids, by time.
    moves(refIds) {
      if (!refIds.length) return [];
      return db.prepare(`SELECT * FROM stock_moves WHERE ref_kind = 'batch' AND ref_id IN (${refIds.map(() => '?').join(', ')}) ORDER BY at, id`)
        .all(...refIds).map((r) => ({ id: r.id, itemId: r.item_id, at: r.at, qty: r.qty, unitCost: r.unit_cost, refId: r.ref_id, note: r.note }));
    },
    deleteMoves(refIds) {
      if (!refIds.length) return;
      db.prepare(`DELETE FROM stock_moves WHERE ref_kind = 'batch' AND ref_id IN (${refIds.map(() => '?').join(', ')})`).run(...refIds);
    },
  };
}

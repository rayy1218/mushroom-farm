// server/harvest-schema.js: the SQL of schema upgrade 4 (C10 section 3). Released upgrades are never edited (C1 3).
const SCHEMA_V4_HARVEST = `
-- Upgrade 4: batches and harvest by room QR (C10).

CREATE TABLE batches (
  id             INTEGER PRIMARY KEY,
  crop           TEXT    NOT NULL,
  strain         TEXT,
  source         TEXT,
  block_count    INTEGER NOT NULL CHECK (block_count >= 1),
  block_wet_kg   REAL    NOT NULL CHECK (block_wet_kg > 0),
  moisture_pct   REAL    NOT NULL CHECK (moisture_pct >= 0 AND moisture_pct < 100),
  spawn_date     INTEGER,
  received_at    INTEGER NOT NULL,
  room_id        INTEGER REFERENCES rooms (id),
  placed_at      INTEGER,
  cleared_at     INTEGER,
  flush_gap_days INTEGER NOT NULL DEFAULT 5 CHECK (flush_gap_days >= 1),
  notes          TEXT,
  created_at     INTEGER NOT NULL,
  CHECK ((room_id IS NULL) = (placed_at IS NULL)),
  CHECK (placed_at IS NULL OR placed_at >= received_at),
  CHECK (cleared_at IS NULL OR (placed_at IS NOT NULL AND cleared_at >= placed_at))
) STRICT;
CREATE INDEX batches_room ON batches (room_id, cleared_at);

CREATE TABLE harvest_crates (
  id         INTEGER PRIMARY KEY,
  batch_id   INTEGER NOT NULL REFERENCES batches (id),
  t          INTEGER NOT NULL,
  kg         REAL    NOT NULL CHECK (kg >= 0.01 AND kg <= 50),
  picker     TEXT,
  deleted_at INTEGER
) STRICT;
CREATE INDEX harvest_crates_batch ON harvest_crates (batch_id, t);
`;

module.exports = { SCHEMA_V4_HARVEST };

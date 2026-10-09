# C1: Database contract (`server/db.js`)

Date: 2026-10-08. Status: **draft** (revision 6, not frozen; the lead freezes it with wave 2). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`. Air exchange: C9 `docs/contracts/air.md` (frozen, lead decision 55). Batches and harvest: C10 `docs/contracts/harvest.md` (folded into wave 2, lead decision 59).

This contract defines the SQLite schema (as exact SQL), the schema upgrade mechanism, every function of `server/db.js`, and the in-memory fake `tests/fakes/db.js` (section 9). The Data stream builds `server/db.js` against it. The Rooms stream (C2) and the API stream (C3) build against the fake, which follows this contract as section 9 states.

### Changes in revision 6

Wave 2 on top of C9 (the air exchange, on `master` 6a12852). C9 owns upgrade 2 (`SCHEMA_V2_AIR`: `readings.fan` becomes `air` 0/1, `rooms.vent` is dropped); the whole wave 2 schema moves to upgrade 3 (lead decision 54, amended). C9 section 10 lists the C1 sections it overrides (3, 4, 4.2, 6.2, 6.4, 6.6, 9); they now say what C9 6.1 and 6.2 say. C10 (batches and harvest by room QR) is folded into wave 2 (lead decision 59): it owns upgrade 4 (`SCHEMA_V4_HARVEST` in the lead's `server/harvest-schema.js`), and C10 section 14 lists its C1 changes (the rows marked "C10 14" below).

| Section | Change |
|---|---|
| 1 | Booleans: `air` accepts `true`/`false` like `lights` and `circ` (C9 6.1). Transactions: upgrades 2 and 3 are each one transaction. |
| 3 | Upgrade list 1 (released), 2 (C9 `SCHEMA_V2_AIR`, a rebuild of `readings` that needs no extra field), 3 (wave 2, columns and tables only). `db.version` is 3 (C9 6.1, 10). |
| 4 | Upgrade 1 SQL unchanged (released); a note that upgrade 2 replaces its `readings.fan` and drops its `rooms.vent` (C9 10). |
| 4.2 | `rooms` loses `vent` (dropped by upgrade 2). `readings` has `air` (0/1) in place of `fan`; the meter sums use the key `air` (C9 4.2, 6.1). The wave 2 columns and tables are "upgrade 3". `room_equipment.fan_m3h` becomes `air_m3h` (50–10000, the air exchange pair, C9 10 row C8); `calibrations.equipment` holds the 7 fields with `air_m3h`. `simulation_runs.inputs` has no `vent`. |
| 4.3 (replaced) | Upgrade 2 is C9's `SCHEMA_V2_AIR`, exact SQL copied from C9 6.2 (on `master`). |
| 4.4 (new) | Upgrade 3: the wave 2 SQL of revision 5's 4.3 with `room_equipment.air_m3h REAL NOT NULL CHECK (air_m3h BETWEEN 50 AND 10000)` in place of `fan_m3h`; re-checked on Node 22.20 on a version 1 file through upgrade 2. |
| 6.2 | `Room` has no `vent` (C9 6.1). `Reading` keeps 18 keys with `air` in place of `fan` (lead decision 20, amended). `Equipment` has `air_m3h`. |
| 6.3 | `db.version` is 3. |
| 6.4 | `createRoom` and `updateRoom` take no `vent`: it is an unknown field (C9 6.3). |
| 6.6 | `insertReading` takes `air` (0/1 or boolean); raw and bucket SQL use `air` (`AVG(air) AS air`); bucket `air` is the fraction of readings with the air exchange on (C9 6.1). |
| 6.14 | `saveEquipment` takes `air_m3h`; a missing field has an exact message, checked in field order before anything is written (finding 23). |
| 7 | C2 writes `air` (C9 6.3). |
| 8 | Version 3; upgrade 2 and upgrade 3 tests; the master tests that number their test upgrades 3 and 4 move up; `air` `CHECK` (`air: 2` → 275); `vent` an unknown field; `air_m3h` range `CHECK`; the missing-field message (finding 23). |
| 9 | The fake reports `version: 3`; 9.2 names `air` with `lights` and `circ` among the booleans; `air` `CHECK IN (0, 1)`; no `vent`; `air_m3h` `CHECK` and type; the `saveEquipment` missing-field message. |
| 1 | C10 14, lead decisions 59 and 61: Transactions: upgrade 4 is one transaction too. One connection: `db.sqlite` shares it with `server/harvest-db.js`. |
| 3 | C10 14, lead decision 59: `UPGRADES` gets `{ version: 4, sql: SCHEMA_V4_HARVEST }` (`require('./harvest-schema.js')`); `db.version` is 4; upgrade 4 is the first case of "later modules add their tables this way". |
| 4.2, 4.5 (new) | C10 14, lead decision 59: tables `batches` and `harvest_crates` (columns by reference to C10 3); 4.5 holds the exact upgrade 4 SQL, copied from C10 3 (owned by C10 and `server/harvest-schema.js`). |
| 6.3 | C10 14, lead decision 61: `db.version` is 4; new member `db.sqlite`, the `DatabaseSync` connection, for `server/harvest-db.js` only. |
| 7 | C10 14, lead decision 61: caller row for `server/harvest-db.js` (C10 5). |
| 8 | C10 14, lead decision 59: version 4; the two upgrade 4 tables and their two indexes exist; the version 3 results of the upgrade tests become version 4; new test "Upgrade 4 from version 3"; the test upgrades move to 5 and 6; the newer-database message says `knows up to 4`. |
| 9 | C10 14, lead decisions 59 and 61: the fake reports `version: 4` and `sqlite: null`; it has no harvest tables (the harvest fake is C10 5.4). |

### Changes in revision 5

Room-centred app and C8 equipment, frozen together (lead decisions 18, 20, 23, 30, 33, 39, 50, 54). Upgrade 2 holds every wave 2 schema change; wave 2 adds no other upgrade.

| Section | Change |
|---|---|
| 1 | JSON columns add `calibrations.equipment`, `simulation_runs.inputs`, `simulation_runs.result`. |
| 3, 6.3, 9.1 | `db.version` is 2. Upgrade 2 only adds columns (`ALTER TABLE … ADD COLUMN`) and tables: no table rebuild. |
| 4.3 (new) | Upgrade 2, exact SQL: `readings` gains `ac_fan`, `stage`, `core` (lead decision 20); `calibrations` gains `source`, `log_from`, `log_to` (lead decision 23) and `equipment` (lead decision 50); new tables `simulation_runs` (lead decisions 18, 39; its `CHECK`s carry C8's kind and verdicts, lead decision 30) and `room_equipment` (C8, lead decisions 33, 54). Checked on node:sqlite (Node 22.20). |
| 4.2 | New rows for `readings` and `calibrations`; new tables `simulation_runs` and `room_equipment`; `calibrations.ua` is "Heat through walls and roof" (lead decision 28); `capacity_reports` is written by version 1 pages only (lead decision 19). |
| 6.1 | `NotFoundError` `what` adds `simulation`. |
| 6.2 | `Reading` has 18 keys; `Calibration` adds `source`, `log_from`, `log_to`, `equipment`; new shapes `SimulationRunInfo`, `SimulationRun`, `Equipment`. |
| 6.4 | "There is no delete" except simulation runs (6.13). |
| 6.6 | `insertReading` takes `ac_fan`, `stage`, `core`; raw and bucket SQL return them; bucket rules for the three keys. |
| 6.10 | `saveCalibration` takes `source`, `log_from`, `log_to`, `equipment`. |
| 6.13, 6.14 (new) | Simulation run functions; room equipment functions. |
| 7, 8, 9 | Callers (C2 adds `getEquipment`; the C2 row also names `getMix`, which C2 revision 6 added), tests and the fake for all of the above. |

### Changes in revision 4

| Section | Change |
|---|---|
| 1, 4, 4.1, 4.2, 6.6 | Lead decision 1: the `readings` columns carry the Reading key names (`RH`, `CO2` instead of `rh`, `co2`). The one exception is the temperature column `temp`, because SQLite cannot hold `t` and `T` in one table; db.js renames only `temp` to `T`. |
| 6.6 | Bug fix: the raw and latest queries order by `readings.t`. A bare `t` in `ORDER BY` matches the `T` alias and sorted by temperature (tested on Node 22.20). Raw rows with equal `t` come back in insertion order. Only raw rows can go back into `insertReading`. |
| 6.1, 8, 9.2 | Lead decision 3: the constraint code table lists all five codes (275, 1299, 3091, 787, 2067). The fake uses the same codes. Neither db can raise 787 or 2067 through the db object. |
| 1, 4.2, 6.4, 6.5 | Lead decision 6: stored settings are only `defaultSettings()` or the `settings` result of `importSettings`. Restore goes through C2 `applySettings`. |
| 6.6, 6.10, 7, 8, 9 | Removed `insertReadings` and `getCalibration` because nothing calls them (C3 revision 4 also dropped `getCalibration`). Kept `latestReading`, because C2's tests use it. Removed the plan to swap the fake for the real db (lead decision 7). |
| 6.6 | The tie rule for the bucket's last row stays "not defined" (open question decided). |

## 1. General rules

| Rule | Detail |
|---|---|
| Module | CommonJS (like the rest of the repo): `module.exports = { openDb, NotFoundError, UPGRADES }`. `NotFoundError` is the class from `server/db-common.js` (section 5.1), re-exported. |
| Engine | `node:sqlite` (`DatabaseSync`), Node.js 22.13 or newer (no flag needed from 22.13). No npm dependencies. The lead sets `package.json` `engines.node` to `">=22.13"`. |
| Experimental warning | Node 22 prints `ExperimentalWarning: SQLite is an experimental feature` once per process. `server/main.js` is started, and the `npm test` script runs, with `node --disable-warning=ExperimentalWarning` (the lead sets the `test` script to `node --disable-warning=ExperimentalWarning --test tests/*.test.js`). db.js itself does not touch warnings. |
| Synchronous | Every function is synchronous and returns its value directly (never a Promise). The fake db is synchronous too. |
| One connection | The server opens the database once (`openDb`) and shares the object. `server/harvest-db.js` uses the same connection through `db.sqlite` (section 6.3, lead decision 61) and opens none of its own. |
| Time | Every time value is an integer: seconds since 1970-01-01 00:00 UTC. Passing a time with a fraction fails (STRICT tables reject it). |
| Clock | Arguments named `at` (and `run_at` where noted) are optional; when left out, db.js uses `now()` from `openDb`'s options (default `Math.floor(Date.now() / 1000)`). Reading and event times (`t`) are always given by the caller. |
| Ids | Integers made by SQLite (`INTEGER PRIMARY KEY`). An id that matches no row (including `NaN`, a string, `undefined`) gives `NotFoundError`. |
| Returned rows | Plain objects (normal prototype, not node:sqlite's null-prototype rows), so `assert.deepStrictEqual` works. Keys are the column names exactly as in the SQL below. The one exception is the readings column `temp`, which is returned as `T` (section 6.6). |
| Argument objects | Every object argument accepts only the keys this contract lists for it. Any other key throws `TypeError('<function>: unknown field "<key>"')` before anything is written. The values of JSON columns (`settings`, `report`, `controller`, `sim`, `equipment` of a calibration, `inputs`, `result`) are not checked. |
| Missing values | `undefined` (or a left-out key) is bound as `NULL`. An optional column stores `NULL` and returns `null`; a `NOT NULL` column then fails with the node:sqlite error. |
| Non-finite numbers | db.js binds `NaN`, `Infinity` and `-Infinity` as `NULL` in every column (SQLite would otherwise store `Infinity`). A `NOT NULL` column then fails. |
| JSON columns | `room_settings.settings`, `capacity_reports.report`, `controller_state.controller`, `controller_state.sim`, `calibrations.equipment`, `simulation_runs.inputs`, `simulation_runs.result`: db.js stores JS values as JSON text and returns them parsed (`null` stays SQL `NULL` and comes back `null`). It keeps non-finite numbers (section 5). |
| Booleans | SQLite has none. `air`, `lights` and `circ` accept `true`, `false`, `0`, `1` and are returned as `0` or `1`. |
| Validation | db.js does not apply business rules. The callers validate first. Settings: C2 stores only `ClimateController.defaultSettings()` or the `settings` result of `ClimateController.importSettings`, never settings received from HTTP or an import as they arrived (lead decision 6). Rooms, mixes and calibrations go through `room-rules.js` (`check*`); query options are checked in the API. The SQL constraints (types, `NOT NULL`, `CHECK`, foreign keys) are the last guard: a value that breaks one throws the node:sqlite error and stores nothing. |
| Archived rooms | An archived room still exists: every function works on it (reads and writes). Stopping its loop and refusing edits are C2 and C3 decisions. |
| Transactions | A function that writes more than one row (`createRoom`, `replaceMix`, each schema upgrade) runs in one transaction: all rows or none. Upgrade 2 (C9), upgrade 3 and upgrade 4 (C10) are each one transaction (section 3). |
| Demo room | Not a db.js matter: `openDb` makes only the schema. C2 `start()` creates the demo room (C2 section 4) through `createRoom`. |

## 2. Opening the database

### 2.1 `openDb`

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `openDb(path, options?)` | `path`: string, a file path (for example `data/farm.db`) or `':memory:'` for tests. `options.now`: function returning integer seconds (default `() => Math.floor(Date.now() / 1000)`). `options.upgrades`: array of upgrades (default `UPGRADES`; tests only) | The db object (section 6) | `TypeError` (unknown option); the database is newer than the app (section 3); an upgrade failed (section 3); the file cannot be opened or is not a database (node:sqlite error). `server/main.js` prints the message and exits. |

### 2.2 Steps of `openDb`, in order

| Step | Action |
|---|---|
| 1 | For a file path: create the parent folder if it is missing (`fs.mkdirSync(dir, { recursive: true })`). |
| 2 | `new DatabaseSync(path)`. |
| 3 | `PRAGMA journal_mode = WAL;` (an in-memory database stays in `memory` mode; that is fine). |
| 4 | `PRAGMA foreign_keys = ON;` |
| 5 | `PRAGMA synchronous = NORMAL;` (safe with WAL; fewer writes to the Pi's SD card; a power cut can lose the last commits but never corrupts the file) |
| 6 | `PRAGMA busy_timeout = 5000;` (a backup tool reading the file does not make a write fail at once) |
| 7 | Apply the schema upgrades (section 3). |
| 8 | Prepare the statements and return the db object. |

## 3. Schema upgrades

| Item | Rule |
|---|---|
| Table | `schema_version (version, applied_at)`: one row per applied upgrade. `openDb` creates it itself (it is not part of an upgrade): `CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL) STRICT;` |
| Upgrade list | `UPGRADES` in `server/db.js`: an array of `{ version, sql }` with `version` = 1, 2, 3, … in order and no gaps; `sql` is SQL text run with `db.exec`. |
| The four upgrades | `{ version: 1, sql: SCHEMA_V1 }` (section 4, released), `{ version: 2, sql: SCHEMA_V2_AIR }` (section 4.3, C9 6.2, on `master`), `{ version: 3, sql: SCHEMA_V3_ROOMS }` (section 4.4, wave 2), `{ version: 4, sql: SCHEMA_V4_HARVEST }` (section 4.5, C10 3, wave 2; lead decision 59). Wave 2 appends upgrades 3 and 4 and edits neither of the others. |
| Where upgrade 4 comes from | db.js takes `SCHEMA_V4_HARVEST` from `require('./harvest-schema.js')` (the lead's prep 2.0 file, C10 2); db.js does not write that SQL itself. db.js prepares no statement on the upgrade 4 tables: `server/harvest-db.js` does (C10 5). |
| Current version | `SELECT COALESCE(MAX(version), 0) AS version FROM schema_version` (0 = new, empty database). |
| Apply | For each upgrade with `version` above the current version, in order: `BEGIN IMMEDIATE`; `exec(sql)`; `INSERT INTO schema_version (version, applied_at) VALUES (?, now())`; `COMMIT`. |
| Failed upgrade | `ROLLBACK` (that upgrade leaves no trace; earlier upgrades stay applied), then throw `Error('Schema upgrade <version> failed: <SQLite message>')`. |
| Newer database | If the current version is above the highest version in the list: throw `Error('The database <path> has schema version <n>; this app knows up to <m>. Use a newer version of the app.')` and change nothing. |
| Released upgrades | Never edited. A change is always a new upgrade with the next number. Later modules add their tables this way; upgrade 4 (C10 batches and harvest, section 4.5) is the first case. |
| Table rebuilds | A later upgrade that rebuilds a table (SQLite cannot drop a `CHECK`) must follow SQLite's 12-step rebuild; `foreign_keys` cannot change inside a transaction, so such an upgrade needs an extra field in the upgrade object when another table references the rebuilt one. Upgrade 2 (C9) rebuilds `readings` without that field: no table references `readings`, and `ALTER TABLE rooms DROP COLUMN vent` works because `vent` has only its own `CHECK` (checked on Node 22.20, SQLite 3.50.4, inside `BEGIN IMMEDIATE` with `foreign_keys = ON`; C9 6.2). Upgrade 3 only adds columns (`ALTER TABLE … ADD COLUMN`) and tables. Upgrade 4 only creates tables and their indexes (`CREATE TABLE`, `CREATE INDEX`). The `simulation_runs` `CHECK`s carry C8's kind `equipment` and its verdicts from the start, because SQLite cannot change a `CHECK` without rebuilding the table (lead decision 30). |
| Result | `db.version` is the schema version after opening (4 for this contract: upgrades 1, 2, 3 and 4, sections 4, 4.3, 4.4 and 4.5). |

## 4. Schema version 1 (exact SQL)

This is the `sql` of upgrade 1 (`SCHEMA_V1`), released and never edited. Its `readings.fan` (0–3) and `rooms.vent` are history: upgrade 2 (section 4.3, C9) turns `fan` into `air` (0/1) and drops `vent`, so section 4.2 lists neither. All tables are `STRICT` (SQLite 3.37+; Node 22 bundles 3.4x+): a value of the wrong type fails instead of being stored.

```sql
CREATE TABLE rooms (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  volume      REAL    NOT NULL CHECK (volume > 0),
  vent        TEXT    NOT NULL CHECK (vent IN ('supply', 'exhaust')),
  adapter     TEXT    NOT NULL DEFAULT 'sim',
  created_at  INTEGER NOT NULL,
  archived_at INTEGER
) STRICT;

CREATE TABLE room_settings (
  id       INTEGER PRIMARY KEY,
  room_id  INTEGER NOT NULL REFERENCES rooms (id),
  saved_at INTEGER NOT NULL,
  settings TEXT    NOT NULL,
  note     TEXT
) STRICT;
CREATE INDEX room_settings_room ON room_settings (room_id, id);

CREATE TABLE calibrations (
  id            INTEGER PRIMARY KEY,
  room_id       INTEGER NOT NULL REFERENCES rooms (id),
  run_at        INTEGER NOT NULL,
  ua            REAL    NOT NULL,
  inf_ach       REAL    NOT NULL,
  moist_buffer  REAL    NOT NULL,
  co2_per_block REAL    NOT NULL,
  rmse_t        REAL,
  rmse_rh       REAL,
  rmse_co2      REAL,
  log_rows      INTEGER,
  applied_at    INTEGER
) STRICT;
CREATE INDEX calibrations_room ON calibrations (room_id, run_at);

CREATE TABLE crop_mixes (
  room_id       INTEGER NOT NULL REFERENCES rooms (id),
  pos           INTEGER NOT NULL,
  crop          TEXT    NOT NULL,
  blocks        INTEGER NOT NULL CHECK (blocks >= 0),
  co2_per_block REAL,
  PRIMARY KEY (room_id, pos)
) STRICT;

CREATE TABLE capacity_reports (
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  run_at      INTEGER NOT NULL,
  verdict     TEXT    NOT NULL CHECK (verdict IN ('good', 'tight', 'too-dense', 'too-empty', 'impossible')),
  utilisation INTEGER,
  report      TEXT    NOT NULL
) STRICT;
CREATE INDEX capacity_reports_room ON capacity_reports (room_id, id);

CREATE TABLE readings (
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  t           INTEGER NOT NULL,
  temp        REAL,
  RH          REAL,
  CO2         REAL,
  t_out       REAL,
  rh_out      REAL,
  ac_mode     TEXT    NOT NULL CHECK (ac_mode IN ('off', 'cool', 'heat', 'dry', 'fan')),
  ac_setpoint REAL,
  fog         INTEGER NOT NULL CHECK (fog BETWEEN 0 AND 3),
  fan         INTEGER NOT NULL CHECK (fan BETWEEN 0 AND 3),
  lights      INTEGER NOT NULL CHECK (lights IN (0, 1)),
  circ        INTEGER NOT NULL CHECK (circ IN (0, 1)),
  power_w     REAL,
  kwh         REAL
) STRICT;
CREATE INDEX readings_room_t ON readings (room_id, t);

CREATE TABLE events (
  id      INTEGER PRIMARY KEY,
  room_id INTEGER NOT NULL REFERENCES rooms (id),
  t       INTEGER NOT NULL,
  level   TEXT    NOT NULL CHECK (level IN ('info', 'good', 'warning', 'serious', 'critical')),
  text    TEXT    NOT NULL
) STRICT;
CREATE INDEX events_room ON events (room_id, id);

CREATE TABLE alarms (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL REFERENCES rooms (id),
  alarm_key  TEXT    NOT NULL,
  level      TEXT    NOT NULL CHECK (level IN ('warning', 'serious', 'critical')),
  label      TEXT    NOT NULL,
  raised_at  INTEGER NOT NULL,
  cleared_at INTEGER,
  acked_at   INTEGER
) STRICT;
CREATE INDEX alarms_room ON alarms (room_id, raised_at);
CREATE UNIQUE INDEX alarms_open ON alarms (room_id, alarm_key) WHERE cleared_at IS NULL;

CREATE TABLE controller_state (
  room_id    INTEGER PRIMARY KEY REFERENCES rooms (id),
  saved_at   INTEGER NOT NULL,
  controller TEXT    NOT NULL,
  sim        TEXT
) STRICT;
```

### 4.1 Differences from spec section 2

| Item | Spec | This contract | Reason |
|---|---|---|---|
| Room temperature column in `readings` | `T` | Column `temp`. The Reading key that db.js takes and returns is still `T`. `RH` and `CO2` are column names as in the spec. | SQLite column names ignore case, even in quotes: `t` (time) and `T` in one table fail with "duplicate column name: T" (tested on Node 22.20). This is the only column whose name differs from its Reading key (lead decision 1). db.js renames it in both directions (section 6.6); no other module renames anything. |
| `crop_mixes.pos` | not listed | Added; primary key (`room_id`, `pos`) | Keeps the row order of the mix table. Today's card allows the same crop twice, so (`room_id`, `crop`) cannot be the key. |
| Index on `events` | not listed | (`room_id`, `id`) | Newest-first pages by room |
| Index on `alarms` | not listed | (`room_id`, `raised_at`), and a unique partial index: at most one open alarm per room and key | `raiseAlarm` is idempotent and safe |
| `log_rows` | "log size" | Nullable | A calibration imported from browser storage has no log size |

### 4.2 Tables and columns

#### `rooms`

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `id` | INTEGER | no | – | Room id |
| `name` | TEXT | no | – | Shown name (C3 limits it to 60 characters, as today) |
| `volume` | REAL | no | m³, > 0 | Room volume (capacity card limit 5–5000) |
| `adapter` | TEXT | no | `sim` (later `hw`, …) | Which adapter runs the room. No `CHECK`, so a new adapter needs no table rebuild |
| `created_at` | INTEGER | no | s since 1970 UTC | When the room was made |
| `archived_at` | INTEGER | yes | s since 1970 UTC | `null` = active; set = archived (loop stopped, data kept) |

Upgrade 2 dropped the version 1 column `vent` (C9 6.2). A room has no air path setting: every room uses the drawing positions of `DEFAULT_ENV` (`inletAt: 'high'`, `exhaustAt: 'low'`), and its air exchange size is the settings key `airM3h` (C9 5.2).

#### `room_settings`

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `id` | INTEGER | no | – | Version id; larger = newer |
| `room_id` | INTEGER | no | `rooms.id` | Room |
| `saved_at` | INTEGER | no | s since 1970 UTC | When saved |
| `settings` | TEXT | no | JSON | The controller settings object (`cfg`): `ClimateController.defaultSettings()`, the `settings` part of an `importSettings` result, or a running `cfg` built from them (lead decision 6). Never the file wrapper with `format` and `version`. |
| `note` | TEXT | yes | – | `Created` for the first version of every room (the demo room included), `Restored version <id>` for a restore, or the user's note |

The current settings of a room are its version with the largest `id`.

#### `calibrations`

| Column | Type | Null | Unit or values | Meaning (source: `calib.js`, app.js `calApplied`) |
|---|---|---|---|---|
| `id` | INTEGER | no | – | Run id |
| `room_id` | INTEGER | no | `rooms.id` | Room |
| `run_at` | INTEGER | no | s since 1970 UTC | When the fit ran (for an import: the old `calib.date`) |
| `ua` | REAL | no | W/K (20–400) | Heat through walls and roof (`PARAMS.ua`): heat flows out when the room is warmer than outside, in when outside is hotter (lead decision 28) |
| `inf_ach` | REAL | no | air changes per h (0.05–3) | Air leakage (`PARAMS.infAch`) |
| `moist_buffer` | REAL | no | × (1–10) | Moisture buffer (`PARAMS.moistBuffer`) |
| `co2_per_block` | REAL | no | mL/h per block (5–300) | CO₂ per block (`PARAMS.co2PerBlock`; today's page rounds it when it applies it) |
| `rmse_t` | REAL | yes | °C | Fit error of T (`result.rmse.T`); `null` when not fitted (NaN) |
| `rmse_rh` | REAL | yes | % RH | Fit error of RH |
| `rmse_co2` | REAL | yes | ppm | Fit error of CO₂ |
| `log_rows` | INTEGER | yes | rows | Rows of the farm log used; `null` when not known |
| `applied_at` | INTEGER | yes | s since 1970 UTC | When last applied to the room; `null` = never |
| `source` | TEXT | yes | `csv`, `history`, `import` | Upgrade 3. Where the fitted log came from: a CSV log file, the room's own readings, or the browser-storage import; `null` for runs saved before upgrade 3 |
| `log_from` | INTEGER | yes | s since 1970 UTC | Upgrade 3. First reading time of the fitted history (`source = 'history'`); `null` otherwise |
| `log_to` | INTEGER | yes | s since 1970 UTC | Upgrade 3. Last reading time of the fitted history |
| `equipment` | TEXT | yes | JSON | Upgrade 3. The room's machines the fit used (lead decision 50): the 7 Equipment fields `{ ac_hp, ac_units, fog_lph, air_m3h, walls, roof, height }` of `room_equipment` at fit time; `null` = fitted with the typical machines (`PLANT`, no machines saved), imported, or saved before upgrade 3. The Calibrate tab warns when the room's machines now differ (C5 3.11). |

The room's current calibration is the run with the largest `applied_at` (ties: largest `id`).

#### `crop_mixes`

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `room_id` | INTEGER | no | `rooms.id` | Room |
| `pos` | INTEGER | no | 0, 1, 2, … | Row order in the mix table |
| `crop` | TEXT | no | a key of `ClimateController.CROPS` (`oyster`, `black`, …) | Crop |
| `blocks` | INTEGER | no | blocks, ≥ 0 (card limit 200 000) | Planned blocks |
| `co2_per_block` | REAL | yes | mL/h (card limit 1–1000) | Own CO₂ per block; `null` = use the room's calibrated value |

#### `capacity_reports`

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `id` | INTEGER | no | – | Report id; larger = newer |
| `room_id` | INTEGER | no | `rooms.id` | Room |
| `run_at` | INTEGER | no | s since 1970 UTC | When the check finished |
| `verdict` | TEXT | no | `good`, `tight`, `too-dense`, `too-empty`, `impossible` | Copy of `report.verdict` (for lists without parsing) |
| `utilisation` | INTEGER | yes | % (whole number) | Copy of `report.utilisation`, unchanged (not rounded); `null` when it is not a finite number (for example the verdict is `impossible`) |
| `report` | TEXT | no | JSON | The whole `ClimateCapacity.checkAsync` result |

Written by the version 1 web pages only; from upgrade 3 the web app stores capacity checks in `simulation_runs` (lead decision 19). The table and its functions stay.

#### `readings`

One row per controller reading (every 30 s by default). The "Reading key" column is the key of the Reading object that db.js takes (`insertReading`) and returns (`queryReadings`, `latestReading`). It is the same JSON as C2's ReadingRow, C3's Reading and what C5 reads (lead decision 1). Every key equals its column name except `T` (column `temp`, section 4.1). The "Source" column says how C2 fills it from a live room (C2 section 5.3 owns that; it is repeated here so the meaning of each column is exact).

| Column | Reading key | Type | Null | Unit or values | Meaning | Source in a live room (`r` = reading from the adapter, `cmd` = commands from `controller.update(r)`) |
|---|---|---|---|---|---|---|
| `room_id` | `room_id` | INTEGER | no | `rooms.id` | Room | The `roomId` argument |
| `t` | `t` | INTEGER | no | s since 1970 UTC | When the reading was taken | `Math.round(r.t)` (the adapter's reading time; C2 section 13.2 makes the sim's time real) |
| `temp` | `T` | REAL | yes | °C | Room temperature, raw | `r.T` |
| `RH` | `RH` | REAL | yes | % | Room humidity, raw | `r.RH` |
| `CO2` | `CO2` | REAL | yes | ppm | Room CO₂, raw | `r.CO2` |
| `t_out` | `t_out` | REAL | yes | °C | Outdoor temperature | `r.tOut` |
| `rh_out` | `rh_out` | REAL | yes | % | Outdoor humidity | `r.rhOut` |
| `ac_mode` | `ac_mode` | TEXT | no | `off`, `cool`, `heat`, `dry`, `fan` | AC command | `cmd.ac.power ? cmd.ac.mode : 'off'` |
| `ac_setpoint` | `ac_setpoint` | REAL | yes | °C (16–30) | AC setpoint command; `null` when the AC is off | `cmd.ac.power ? cmd.ac.setpoint : null` |
| `fog` | `fog` | INTEGER | no | 0–3 | Fogger level command | `cmd.hu.level` |
| `air` | `air` | INTEGER | no | 0, 1 | Upgrade 2 (C9). Air exchange command: `1` = intake `SF-203` and exhaust `EF-206` on, dampers open; `0` = both off, dampers closed | `cmd.air && cmd.air.on ? 1 : 0` (C9 6.3) |
| `lights` | `lights` | INTEGER | no | 0, 1 | Lights command | `cmd.lights.on` |
| `circ` | `circ` | INTEGER | no | 0, 1 | Circulation fan (`CF-205`) command | `cmd.circ.on` |
| `power_w` | `power_w` | REAL | yes | W | Total electric power at the reading | Sum of `r.power` (`ac + hu + air + lights + circ`, the meter keys of C9 4.2); `null` if the adapter has no meter |
| `kwh` | `kwh` | REAL | yes | kWh | Energy meter: total since the adapter's meter started (it only grows within a run) | Sum of `r.kwh` (`ac + hu + air + lights + circ`); `null` if the adapter has no meter |
| `ac_fan` | `ac_fan` | TEXT | yes | `low`, `auto`, `high` | Upgrade 3. AC indoor fan command (the AC's own fan, not the air exchange); `null` when the AC is off | `cmd.ac.power ? (['low', 'auto', 'high'].includes(cmd.ac.fan) ? cmd.ac.fan : 'auto') : null` (the rule `sim.js` applies, so the `CHECK` cannot fail) |
| `stage` | `stage` | TEXT | yes | a key of `ClimateController.STAGES` (`spawn`, `pinning`, `fruiting`, `rest`) | Upgrade 3. Controller stage after its decision at this reading. No `CHECK` (an open list, like `alarm_key`: a new stage needs no rebuild of the largest table) | `cfg.stage` |
| `core` | `core` | REAL | yes | °C | Upgrade 3. Block core temperature (probe) | `r.core` if a finite number, else `null` |

The `ac_mode` value `fan` is the AC's fan-only mode, not the air exchange. Readings written before upgrade 2 have `air = 1` where their version 1 fan level was 1–3, else `0` (C9 6.2). Readings written before upgrade 3 have `ac_fan`, `stage` and `core` = `NULL`; readers accept `null` (calib.js takes `acFan` `null` as `'auto'`). There is no `ac_power` column: `ac_mode = 'off'` records "AC power off" (C2 5.3), and calib.js `acPower` is derived from it (lead decision 20).

The sensor values are stored raw, as the adapter gave them: a missing sensor (`null`) and any non-finite number are stored as `NULL`. An out-of-range value (for example the sim's `range` fault) is stored as it is; the charts hide implausible values as today's page does (`plausible`).

#### `events`

| Column | Type | Null | Unit or values | Meaning (source: controller `onEvent({ t, lvl, text })`) |
|---|---|---|---|---|
| `id` | INTEGER | no | – | Event id; larger = later |
| `room_id` | INTEGER | no | `rooms.id` | Room |
| `t` | INTEGER | no | s since 1970 UTC | When it happened (C2 section 5.4) |
| `level` | TEXT | no | `info`, `good`, `warning`, `serious`, `critical` | `lvl` |
| `text` | TEXT | no | – | `text` |

#### `alarms`

One row per alarm occurrence (raise to clear). The same key raised again after it cleared is a new row.

| Column | Type | Null | Unit or values | Meaning (source: controller `alarmList()` items `{ id, label, lvl, active, acked, since }`) |
|---|---|---|---|---|
| `id` | INTEGER | no | – | Row id |
| `room_id` | INTEGER | no | `rooms.id` | Room |
| `alarm_key` | TEXT | no | Any string. The controller today raises 14 key forms: `tHi`, `tLo`, `tCrop`, `coreHi`, `rhHi`, `rhLo`, `co2Hi`, `co2Safe`, `disagree`, `acTooSmall`, `blocksDone`, `shockLimit`, `airTooSmall` (C9 5.5), and `sensor_<key>` with `<key>` a key of `ClimateController.SENSORS` (`T`, `RH`, `CO2`, `tOut`, `rhOut`, `core`, `T2`, `RH2`, `CO2b`; for example `sensor_RH`). The list is open: there is no `CHECK`, so a new controller alarm needs no upgrade, and readers must accept unknown keys. | Alarm `id` in the controller |
| `level` | TEXT | no | `warning`, `serious`, `critical` | `lvl` when raised |
| `label` | TEXT | no | – | `label` |
| `raised_at` | INTEGER | no | s since 1970 UTC | When raised (`Math.round(since)`) |
| `cleared_at` | INTEGER | yes | s since 1970 UTC | `null` = still active (open) |
| `acked_at` | INTEGER | yes | s since 1970 UTC | `null` = not acknowledged |

#### `controller_state`

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `room_id` | INTEGER | no | `rooms.id` (primary key: one row per room) | Room |
| `saved_at` | INTEGER | no | s since 1970 UTC | When saved |
| `controller` | TEXT | no | JSON | `ctl.snapshot()` |
| `sim` | TEXT | yes | JSON | `sim.snapshot()` of the simulated adapter; `null` for an adapter without a simulation |

#### `simulation_runs` (upgrade 3)

One row per saved Simulate run: a capacity check, a full cycle or a C8 equipment check (lead decisions 18, 39).

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `id` | INTEGER | no | – | Run id; larger = newer |
| `room_id` | INTEGER | no | `rooms.id` | Room |
| `created_at` | INTEGER | no | s since 1970 UTC | When the server stored the run |
| `kind` | TEXT | no | `cycle`, `capacity`, `equipment` | `cycle`: a C7 full cycle (`ClimateCycle`); `capacity`: a capacity check (`ClimateCapacity.checkSteps`/`checkAsync`); `equipment`: a C8 equipment check (`ClimateEquipment.runCheckSteps`/`runCheckAsync`) |
| `verdict` | TEXT | no | cycle: `pass`, `fail`, `impossible`; capacity: `good`, `tight`, `too-dense`, `too-empty`, `impossible`; equipment: `enough`, `too-small`, `too-big`, `oversized`, `impossible` | Copied from `result` by db.js (6.13, table "Summary columns") |
| `blocks` | INTEGER | no | blocks, ≥ 0 | Planned blocks: the sum of `inputs.mix[].blocks` |
| `days` | INTEGER | yes | days, ≥ 1 | `result.totals.days` of a cycle that ran; `null` otherwise |
| `kwh` | REAL | yes | kWh | `result.totals.kwh` of a cycle that ran; `null` otherwise |
| `rm` | REAL | yes | RM | `result.totals.rm` of a cycle that ran; `null` otherwise |
| `utilisation` | INTEGER | yes | % | `result.utilisation` of a capacity check, unchanged (no rounding); `null` when not a finite number, or for the other kinds |
| `real_start` | INTEGER | yes | s since 1970 UTC | When the planned cycle really started in the room (00:00 farm time of that day); set later in the Calibrate tab; `null` = not linked |
| `note` | TEXT | yes | – | The farmer's note (C3 limits it to 200 characters) |
| `inputs` | TEXT | no | JSON | What the run used: `{ mix, settings, region, tariff, volume, calibration, empty_below, equipment }` (C3 3.10.1). No air size key: a capacity or cycle run's size is `inputs.settings.airM3h`, an equipment check's is `inputs.equipment.air_m3h` |
| `result` | TEXT | no | JSON | The whole C7 Result (with `series`, about 300 KB for the default cycle), the whole capacity report, or the C8 Report (no hourly series; a few KB) |

#### `room_equipment` (upgrade 3, C8)

One row per room: the room's machines and its walls and roof (`docs/contracts/equipment.md` section 4.2). Replaced on save.

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `room_id` | INTEGER | no | `rooms.id` (primary key) | Room |
| `saved_at` | INTEGER | no | s since 1970 UTC | Last save |
| `ac_hp` | REAL | no | 1, 1.5, 2, 2.5, 3, 4, 5, 6 | Size of each aircond (hp badge) |
| `ac_units` | INTEGER | no | 1–4 | Number of airconds of that size |
| `fog_lph` | REAL | no | L/h, 0.5–50 | Fogger output at its top level |
| `air_m3h` | REAL | no | m³/h, 50–10000 | Airflow of the air exchange pair (intake = exhaust) when on (C9); C8 default 1800. C3 6.26 keeps the room's settings `airM3h` in step with it (C2 `applySettings`) |
| `walls` | TEXT | yes | C8 `CONSTRUCTIONS` keys: `zinc`, `brick115`, `brick230`, `eps50`, `eps75`, `eps100`, `pu50`, `pu75`, `pu100` | `null` = not set |
| `roof` | TEXT | yes | keys with `roof: true`: `zinc`, `eps50`, `eps75`, `eps100`, `pu50`, `pu75`, `pu100` | `null` = not set; set both or neither |
| `height` | REAL | no | m, 2–6 | Inside height |

#### `batches` and `harvest_crates` (upgrade 4, C10)

Owned by C10 (`docs/contracts/harvest.md`): the columns, types and constraints are the SQL of section 4.5 (C10 3); C10 3 and 5.2 give their meaning. db.js creates the tables through upgrade 4 and has no function on them; `server/harvest-db.js` reads and writes them through `db.sqlite` (section 6.3).

| Table | Columns (C10 3) | Index | Meaning |
|---|---|---|---|
| `batches` | The 15 columns of C10 3, `id` to `created_at` (`BatchRow`, C10 5.2) | `batches_room` (`room_id`, `cleared_at`) | One row per batch of bought, colonised blocks: received, then placed in a room (`room_id` references `rooms (id)`), then cleared |
| `harvest_crates` | The 6 columns of C10 3, `id` to `deleted_at` (`CrateRow`, C10 5.2) | `harvest_crates_batch` (`batch_id`, `t`) | One row per weighed crate of a batch (`batch_id` references `batches (id)`); `deleted_at` set = undone |

#### `schema_version`

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `version` | INTEGER | no | 1, 2, … (primary key) | Applied upgrade |
| `applied_at` | INTEGER | no | s since 1970 UTC | When applied |

### 4.3 Schema version 2 (upgrade 2, C9, on `master`: exact SQL)

`SCHEMA_V2_AIR`, the `sql` of upgrade 2, copied from C9 6.2. It is on `master` (6a12852) and released with C9: wave 2 never edits it. Run as one transaction by section 3.

```sql
CREATE TABLE readings_new (
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  t           INTEGER NOT NULL,
  temp        REAL,
  RH          REAL,
  CO2         REAL,
  t_out       REAL,
  rh_out      REAL,
  ac_mode     TEXT    NOT NULL CHECK (ac_mode IN ('off', 'cool', 'heat', 'dry', 'fan')),
  ac_setpoint REAL,
  fog         INTEGER NOT NULL CHECK (fog BETWEEN 0 AND 3),
  air         INTEGER NOT NULL CHECK (air IN (0, 1)),
  lights      INTEGER NOT NULL CHECK (lights IN (0, 1)),
  circ        INTEGER NOT NULL CHECK (circ IN (0, 1)),
  power_w     REAL,
  kwh         REAL
) STRICT;
INSERT INTO readings_new (room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh)
  SELECT room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, CASE WHEN fan > 0 THEN 1 ELSE 0 END, lights, circ, power_w, kwh FROM readings;
DROP TABLE readings;
ALTER TABLE readings_new RENAME TO readings;
CREATE INDEX readings_room_t ON readings (room_id, t);
ALTER TABLE rooms DROP COLUMN vent;
```

| Rule | Detail |
|---|---|
| What it does | Rebuilds `readings` with `air` (0/1) in place of the version 1 fan level, and drops `rooms.vent` (C9 6.1) |
| Old rows | `air = 1` where the version 1 level was 1–3, `0` where it was 0. Every other column keeps its value; `ac_mode` keeps the value `'fan'` (the AC's fan-only mode) |
| Checked | On Node 22.20 (SQLite 3.50.4) inside `BEGIN IMMEDIATE` with `foreign_keys = ON`: no table references `readings`, and `DROP COLUMN` works on a column with only its own `CHECK` (C9 6.2) |
| Cost on an existing file | Copies every reading once (the whole `readings` table is rewritten) |

### 4.4 Schema version 3 (upgrade 3, exact SQL)

`SCHEMA_V3_ROOMS`, the `sql` of upgrade 3, run as one transaction by section 3. It holds the whole wave 2 schema (lead decision 54, amended): only `ALTER TABLE … ADD COLUMN` and `CREATE TABLE`, no rebuild. Upgrades 1 and 2 (sections 4 and 4.3) are released and never edited. The new `readings` columns follow C9's `kwh`. Checked on node:sqlite (Node 22.20, SQLite 3.50.4): applied through upgrade 2 on a version 1 file with a room, a reading and a calibration, every new column of an old row is `NULL` (and the reading's version 1 level 2 is `air` 1); `equipment`/`too-small` is stored; `equipment`/`pass`, `cycle`/`enough` and `heat`/`pass` give errcode 275; `ac_hp` 1.25, `ac_units` 5, `air_m3h` 40 and 10001, `walls` without `roof`, `roof` `brick115`, `ac_fan` `max`, `source` `web` give 275 (`air_m3h` 50 and 10000 are stored); `ac_units` 1.5, `ac_hp` `'x'`, `air_m3h` `'x'`, `core` `'abc'` give 3091. On an empty file the three upgrades give version 3.

```sql
-- Upgrade 3: room-centred app and C8 equipment (lead decisions 18, 20, 23, 30, 33, 39, 50, 54).

-- Readings: what calib.js needs to replay a live room, and what Calibrate compares with a simulation (LD 20).
ALTER TABLE readings ADD COLUMN ac_fan TEXT CHECK (ac_fan IN ('low', 'auto', 'high'));
ALTER TABLE readings ADD COLUMN stage  TEXT;
ALTER TABLE readings ADD COLUMN core   REAL;

-- Calibrations: where the fitted log came from (LD 23) and the machines it was fitted with (LD 50).
ALTER TABLE calibrations ADD COLUMN source    TEXT CHECK (source IN ('csv', 'history', 'import'));
ALTER TABLE calibrations ADD COLUMN log_from  INTEGER;
ALTER TABLE calibrations ADD COLUMN log_to    INTEGER;
ALTER TABLE calibrations ADD COLUMN equipment TEXT;

-- Saved Simulate runs: capacity checks, full cycles and C8 equipment checks (LD 18, 39).
CREATE TABLE simulation_runs (
  id          INTEGER PRIMARY KEY,
  room_id     INTEGER NOT NULL REFERENCES rooms (id),
  created_at  INTEGER NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('cycle', 'capacity', 'equipment')),
  verdict     TEXT    NOT NULL CHECK (verdict IN ('pass', 'fail', 'impossible', 'good', 'tight', 'too-dense', 'too-empty',
                                                 'enough', 'too-small', 'too-big', 'oversized')),
  blocks      INTEGER NOT NULL CHECK (blocks >= 0),
  days        INTEGER CHECK (days >= 1),
  kwh         REAL,
  rm          REAL,
  utilisation INTEGER,
  real_start  INTEGER,
  note        TEXT,
  inputs      TEXT    NOT NULL,
  result      TEXT    NOT NULL,
  CHECK ((kind = 'cycle'     AND verdict IN ('pass', 'fail', 'impossible'))
      OR (kind = 'capacity'  AND verdict IN ('good', 'tight', 'too-dense', 'too-empty', 'impossible'))
      OR (kind = 'equipment' AND verdict IN ('enough', 'too-small', 'too-big', 'oversized', 'impossible')))
) STRICT;
CREATE INDEX simulation_runs_room ON simulation_runs (room_id, id);

-- C8: the machines of each room (one row per room; replaced on save) (LD 33, 54).
CREATE TABLE room_equipment (
  room_id   INTEGER PRIMARY KEY REFERENCES rooms (id),
  saved_at  INTEGER NOT NULL,
  ac_hp     REAL    NOT NULL CHECK (ac_hp IN (1, 1.5, 2, 2.5, 3, 4, 5, 6)),
  ac_units  INTEGER NOT NULL CHECK (ac_units BETWEEN 1 AND 4),
  fog_lph   REAL    NOT NULL CHECK (fog_lph BETWEEN 0.5 AND 50),
  air_m3h   REAL    NOT NULL CHECK (air_m3h BETWEEN 50 AND 10000),
  walls     TEXT    CHECK (walls IN ('zinc', 'brick115', 'brick230', 'eps50', 'eps75', 'eps100', 'pu50', 'pu75', 'pu100')),
  roof      TEXT    CHECK (roof IN ('zinc', 'eps50', 'eps75', 'eps100', 'pu50', 'pu75', 'pu100')),
  height    REAL    NOT NULL CHECK (height BETWEEN 2 AND 6),
  CHECK ((walls IS NULL) = (roof IS NULL))
) STRICT;
```

| Rule | Detail |
|---|---|
| Cost on an existing file | `ADD COLUMN` with a `CHECK` makes SQLite test the existing rows once (a scan of `readings`, about 1 s per few hundred thousand rows on a Pi); every new column is `NULL` for old rows, which passes. The README notes the one-time delay (Docs stream). |
| Old rows | `readings.ac_fan`, `stage`, `core` and `calibrations.source`, `log_from`, `log_to`, `equipment` are `NULL` for every row written before the upgrade |
| `stage` has no `CHECK` | Like `alarm_key` and `adapter`: a new controller stage needs no rebuild of the largest table; C2 always writes `cfg.stage`, one of `ClimateController.STAGES` (lead decision 20) |
| `calibrations.equipment` has no `CHECK` | A JSON column (section 5); C3 validates it with `checkEquipmentBody` (C3 7.4, 7.7) |
| The `simulation_runs` `CHECK`s | The kind/verdict pair is a table `CHECK`: a verdict outside its kind's list gives 275 |

### 4.5 Schema version 4 (upgrade 4, C10: exact SQL)

`SCHEMA_V4_HARVEST`, the `sql` of upgrade 4, owned by C10 / `server/harvest-schema.js` (the lead's prep 2.0 file; lead decision 59). Copied from C10 3, byte for byte; C10 3 is the source, and db.js takes the text from `require('./harvest-schema.js')`. Run as one transaction by section 3. Only `CREATE TABLE` and `CREATE INDEX`; upgrades 1, 2 and 3 (sections 4, 4.3 and 4.4) are not touched.

```sql
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
```

| Rule | Detail |
|---|---|
| Owner | C10 3 and `server/harvest-schema.js`. A change to this SQL is a C10 change, made through the lead; this section is then copied again |
| Old databases | Upgrade 4 runs on a version 3 file (after upgrades 2 and 3 on older files); both tables start empty |
| Checked | C10 3 (node:sqlite, Node 22.20, 2026-10-09): every `CHECK` and foreign key fires; a fraction in `t` gives 3091; an integer `kg` is stored as real |
| No db.js functions | The upgrade 4 tables are read and written only by `server/harvest-db.js` (C10 5), through `db.sqlite` |

## 5. JSON columns

| Rule | Detail |
|---|---|
| Write | `toJson(value)` from `server/db-common.js` (section 5.1): `JSON.stringify` with a replacer that turns every non-finite number into an object: `Infinity` → `{"$num":"Infinity"}`, `-Infinity` → `{"$num":"-Infinity"}`, `NaN` → `{"$num":"NaN"}`. |
| Read | `fromJson(text)`: `JSON.parse` with a reviver that turns every object with exactly one key `$num` whose value is a string back into `Number(value)`. |
| Why | The controller snapshot can hold `Infinity` (for example the sensor response window `resp.*.win.min` / `.max`), and capacity reports can hold `NaN` or `Infinity`. Plain JSON turns them into `null`, and a restored controller would then behave differently. |
| Not kept | `undefined` properties (left out, as `JSON.stringify` does; for example `ctl.snapshot()` has `v.T2`, `v.RH2`, `v.CO2b` set to `undefined` without a second sensor set, and they come back missing), functions, `Map`, `Set`. The controller treats a missing value as `undefined`. |
| Comparing in tests | A loaded value equals `fromJson(toJson(saved))`, not always `saved` itself. Tests compare with `assert.deepStrictEqual(loaded, fromJson(toJson(saved)))`. |
| Fake | The fake stores `toJson(value)` and returns `fromJson(text)` with the same helper, so it gives exactly the real db's result. |

### 5.1 Shared helper `server/db-common.js`

Written by the lead in wave 0 (with the fakes), so `server/db.js` and `tests/fakes/db.js` use the same code. CommonJS: `module.exports = { NotFoundError, toJson, fromJson }`.

| Export | Signature | Contract |
|---|---|---|
| `NotFoundError` | `new NotFoundError(what, id)` | `class NotFoundError extends Error`; `name = 'NotFoundError'`; `code = 'NOT_FOUND'`; `what` and `id` as given; `message` = `Unknown <what> <id>` (for example `Unknown room 7`, `Unknown alarm rhHi`) |
| `toJson` | `(value) → string` | `JSON.stringify(value, (k, v) => typeof v === 'number' && !Number.isFinite(v) ? { $num: String(v) } : v)` |
| `fromJson` | `(text) → any` | `JSON.parse(text, (k, v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v.$num === 'string' ? Number(v.$num) : v)` |

## 6. The db object

### 6.1 Errors

| Error | When | Shape | Caller's answer |
|---|---|---|---|
| `NotFoundError` | A room id, settings version, calibration run, alarm key or simulation run matches no row (rule per function below) | Section 5.1; `err.what` = `'room'`, `'settings'`, `'calibration'`, `'alarm'` or `'simulation'` (message `Unknown simulation <id>`); `err.id` = the id or key that was asked for | C3: HTTP 404. C2: a programming error (the room manager only uses rooms it loaded). Callers test `err.code === 'NOT_FOUND'`. |
| `RangeError` | A query option is out of range (named per function) | Standard `RangeError` with a message naming the option | C3 validates first, so this is a bug: HTTP 500 |
| `TypeError` (unknown field) | An argument object has a key this contract does not list for it (section 1) | `TypeError('<function>: unknown field "<key>"')`; nothing is written | A bug: fails a test instead of losing data |
| node:sqlite error | A constraint fails (type, `NOT NULL`, `CHECK`, foreign key), the disk is full, the file is locked longer than `busy_timeout` | `Error` with `code: 'ERR_SQLITE_ERROR'`, `errcode` (the SQLite extended result code; constraint codes in the table below), `errstr`. The fake sets the same `code` and `errcode` on its constraint errors (lead decision 3, section 9.2). | C3: HTTP 500, then `onFatal` unless it is a constraint error (`(err.errcode & 0xff) === 19`; C3 section 4.2). C2: a failed write during a tick is a database error (C2 section 11: `fatal`, the server stops with a clear message) |
| `Error('database is not open')` | Any call after `close()` (thrown by node:sqlite; the fake throws the same message) | – | Programming error |

Constraint error codes (checked on Node 22.20). Every one has `errcode & 0xff === 19` (`SQLITE_CONSTRAINT`), and the fake uses exactly these codes (lead decision 3):

| Failed rule | `errcode` | `errcode & 0xff` | Message of the real db (example; not part of the contract) | Can it happen through the db object? |
|---|---|---|---|---|
| `CHECK` | 275 | 19 | `CHECK constraint failed: fog BETWEEN 0 AND 3` | Yes, in both dbs |
| `NOT NULL` | 1299 | 19 | `NOT NULL constraint failed: readings.t` | Yes, in both dbs |
| Wrong type in a STRICT table (a fraction or a non-numeric string in an INTEGER column, a non-numeric string in a REAL column) | 3091 | 19 | `cannot store REAL value in INTEGER column readings.t` | Yes, in both dbs |
| Foreign key | 787 | 19 | `FOREIGN KEY constraint failed` | No: every function checks the room first and throws `NotFoundError` (below). |
| `UNIQUE` (the index `alarms_open`) | 2067 | 19 | `UNIQUE constraint failed: alarms.room_id, alarms.alarm_key` | No: `raiseAlarm` looks for the open row first and returns it (section 6.8). |

A row that breaks more than one rule throws one error; which of the codes it carries is not defined (tests use rows that break one rule).

Every function that takes a `roomId` first checks that the room exists (archived rooms count) and throws `NotFoundError` with `what: 'room'` if it does not. This holds for reads too, so C3 can answer 404 for an unknown room on every route.

### 6.2 Resource shapes (returned objects)

| Shape | Fields |
|---|---|
| `Room` | `{ id, name, volume, adapter, created_at, archived_at }` (no `vent`, C9 6.1) |
| `SettingsVersion` | `{ id, room_id, saved_at, note, settings }` (`settings` parsed) |
| `SettingsVersionInfo` | `{ id, saved_at, note }` |
| `Reading` | `{ room_id, t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh, ac_fan, stage, core }` (18 keys, in this order; lead decision 20, amended; `air` from C9 6.1). The same keys for raw rows and averaged (bucket) rows; in a bucket row `t` is the bucket start and the values follow section 6.6. This is exactly C2's ReadingRow and C3's Reading, and what C5 reads (lead decision 1). |
| `Event` | `{ id, room_id, t, level, text }` |
| `Alarm` | `{ id, room_id, alarm_key, level, label, raised_at, cleared_at, acked_at }` |
| `ControllerState` | `{ room_id, saved_at, controller, sim }` (`controller` and `sim` parsed; `sim` may be `null`) |
| `Calibration` | `{ id, room_id, run_at, ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows, applied_at, source, log_from, log_to, equipment }` (`equipment` parsed, or `null`) |
| `MixRow` | `{ crop, blocks, co2_per_block }` (`co2_per_block` may be `null`; `pos` is not returned: the array order is the order) |
| `CapacityReport` | `{ id, room_id, run_at, verdict, utilisation, report }` (`report` parsed) |
| `SimulationRunInfo` | `{ id, room_id, created_at, kind, verdict, blocks, days, kwh, rm, utilisation, real_start, note, inputs }` (`inputs` parsed; no `result`) |
| `SimulationRun` | `SimulationRunInfo` plus `result` (parsed) |
| `Equipment` | `{ room_id, saved_at, ac_hp, ac_units, fog_lph, air_m3h, walls, roof, height }` |

### 6.3 Properties and lifecycle

| Member | Type | Meaning | Errors |
|---|---|---|---|
| `db.path` | string | The path given to `openDb` (`':memory:'` for the fake) | – |
| `db.version` | integer | Schema version after opening (4) | – |
| `db.sqlite` | `DatabaseSync` | The node:sqlite connection that `openDb` opened (lead decision 61). A read-only property: db.js never replaces it, and no caller may assign it. For `server/harvest-db.js` only (C10 5.1), which prepares its own statements on it; no other module uses it, and nobody closes it except `db.close()`. The fake has `sqlite: null` (section 9.1). | After `db.close()` the connection is closed: node:sqlite throws `Error('database is not open')` |
| `db.close()` | → `undefined` | Closes the connection (WAL is checkpointed by SQLite). A second call does nothing. | – |

### 6.4 Rooms

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `createRoom(room)` | `room.name`: string; `room.volume`: number (m³); `room.adapter`: string (default `'sim'`); `room.settings`: settings object (required; `defaultSettings()` or the `settings` result of `importSettings`, lead decision 6; C2 section 9.4); `room.note`: string (default `'Created'`); `room.at`: integer s (default `now()`) | `Room`. In one transaction it inserts the room (`created_at = at`) and its first settings version (`saved_at = at`, `note`), so a room always has settings | `TypeError` (unknown field, `vent` included: C9 6.3); node:sqlite error (volume ≤ 0, missing name or settings) |
| `listRooms(options?)` | `options.includeArchived`: boolean (default `false`) | `Room[]`, ordered by `id` ascending. Without `includeArchived`, only rooms with `archived_at = null` | `TypeError` (unknown field) |
| `getRoom(id)` | `id`: integer | `Room` | `NotFoundError('room')` |
| `updateRoom(id, changes)` | `id`: integer; `changes`: object with any of `name` (string), `volume` (number). An empty object changes nothing | `Room` after the change | `NotFoundError('room')`; `TypeError` (any other key, `vent` included (C9 6.3), `archived_at` too: use `archiveRoom`); node:sqlite error (bad value) |
| `archiveRoom(id, at?)` | `id`: integer; `at`: integer s (default `now()`) | `Room` with `archived_at` set. Already archived: unchanged (keeps the first `archived_at`) | `NotFoundError('room')` |

There is no delete and no un-archive. The only delete in C1 is `deleteSimulationRun` (6.13).

### 6.5 Settings versions

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `saveSettings(roomId, version)` | `version.settings`: settings object; `version.note`: string or `null` (default `null`); `version.at`: integer s (default `now()`) | `SettingsVersion` (the new version, now current) | `NotFoundError('room')`; `TypeError` (unknown field); node:sqlite error (missing settings) |
| `currentSettings(roomId)` | – | `SettingsVersion` with the largest `id` for the room | `NotFoundError('room')`; `NotFoundError('settings')` if the room has no version (cannot happen for rooms made by `createRoom`) |
| `settingsHistory(roomId)` | – | `SettingsVersionInfo[]`, all versions, newest first (`id` descending); the first one is the current version | `NotFoundError('room')` |
| `getSettingsVersion(roomId, versionId)` | `versionId`: integer | `SettingsVersion` | `NotFoundError('room')`; `NotFoundError('settings')` if no version with this id belongs to this room |

Restore (spec: `POST …/settings/restore/:versionId`) is not a db function. C3 reads the old version with `getSettingsVersion` and passes its `settings` to C2 `applySettings` with the note `Restored version <versionId>` (C3 section 11). C2 runs it through `importSettings` and stores the result with `saveSettings` (lead decision 6; C2 section 9.2).

### 6.6 Readings

Every Reading key is its column name, except `T` (section 4.1). db.js writes `reading.T` into the column `temp` and reads it back as `temp AS T`. Callers never see `temp`: passing it is an unknown field. So are `rh` and `co2`, because keys are case-sensitive.

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `insertReading(roomId, reading)` | `reading`: a `Reading` object (section 6.2). `t` (integer s, required); `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_setpoint`, `power_w`, `kwh`, `core` (number, `null` or left out; non-finite → `NULL`); `ac_fan`, `stage` (string, `null` or left out); `ac_mode` (string, required); `fog` (integer 0–3, required); `air`, `lights`, `circ` (boolean or 0/1, required); `room_id` (optional; when present it must equal `roomId`) | `undefined` | `NotFoundError('room')`; `TypeError` (unknown field, including `temp`, `rh`, `co2`, `n` and the version 1 key `fan`; or `room_id` ≠ `roomId`); node:sqlite error (missing or bad required field, `t` with a fraction) |
| `queryReadings(roomId, query)` | `query.from`, `query.to`: integer s, both required, `from ≤ to`; rows with `from ≤ t ≤ to`. `query.step`: integer s ≥ 1, or `null` / left out for raw rows | Without `step`: raw `Reading[]`, ordered by `t` ascending (equal `t`: insertion order). With `step`: averaged `Reading[]`, one per bucket that has rows (empty buckets are left out, so a gap stays a gap), ordered by `t` ascending | `NotFoundError('room')`; `TypeError` (unknown field); `RangeError` if `from` or `to` is not an integer, `from > to`, or `step` is not an integer ≥ 1 |
| `latestReading(roomId)` | – | The newest raw `Reading` of the room (largest `t`; ties: the one inserted last), or `null` if the room has none | `NotFoundError('room')` |

Duplicate `t` values for one room are allowed (no unique key); they are returned as they are. A raw Reading (from `queryReadings` without `step`, or from `latestReading`) can be passed back to `insertReading` unchanged. A bucket row cannot, because its `fog`, `air`, `lights` and `circ` can be fractions.

#### Bucket averaging

| Bucket field | Value |
|---|---|
| `room_id` | The room |
| `t` | Bucket start: `floor(t / step) * step` (buckets align to multiples of `step` since 1970 UTC; Malaysia time is UTC+8, so steps that divide 1 h also align to local hours) |
| `T`, `RH`, `CO2`, `t_out`, `rh_out`, `power_w` | Average of the non-null values; `null` if all are null |
| `ac_setpoint` | Average of the non-null values (the AC was on); `null` if the AC was off for the whole bucket |
| `fog` | Average level (a fraction, for example 1.5) |
| `air` | Fraction of readings with the air exchange on (0–1; C9 6.1) |
| `lights`, `circ` | Fraction of readings with the machine on (0–1) |
| `ac_mode` | Value of the last reading in the bucket (the one with the largest `t`) |
| `kwh` | Value of the last reading in the bucket (the meter at the bucket's end) |
| `ac_fan` | Value of the last reading in the bucket |
| `stage` | Value of the last reading in the bucket |
| `core` | Average of the non-null values; `null` if all are null |

A bucket row has no count field: its keys are exactly the raw row's keys.

When two readings share the bucket's largest `t`, which one gives `ac_mode`, `kwh`, `ac_fan` and `stage` is not defined (the real db and the fake may differ); tests must not depend on it. This is decided: defining it would need a window query for a case that the room loop does not produce (C2 writes one reading per `t`).

Exact SQL (the `MAX(t)` makes SQLite take the bare columns `ac_mode`, `kwh`, `ac_fan` and `stage` from the last row of each group; it must stay the only `MIN`/`MAX` in the inner query). node:sqlite binds every JS number as REAL, so `:step` is cast to INTEGER for the integer division. The outer query orders by `b`, because the result has both `t` and `T`, which SQLite treats as the same name:

```sql
SELECT room_id, b AS t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh,
       ac_fan, stage, core
FROM (
  SELECT room_id,
         (t / CAST(:step AS INTEGER)) * CAST(:step AS INTEGER) AS b,
         AVG(temp) AS T, AVG(RH) AS RH, AVG(CO2) AS CO2, AVG(t_out) AS t_out, AVG(rh_out) AS rh_out,
         AVG(ac_setpoint) AS ac_setpoint, AVG(fog) AS fog, AVG(air) AS air,
         AVG(lights) AS lights, AVG(circ) AS circ, AVG(power_w) AS power_w, AVG(core) AS core,
         MAX(t) AS t_last, ac_mode, kwh, ac_fan, stage
  FROM readings
  WHERE room_id = :room_id AND t >= :from AND t <= :to
  GROUP BY b
)
ORDER BY b;
```

Raw query (uses `readings_room_t`). `ORDER BY` must name `readings.t`: in `ORDER BY`, SQLite matches a bare `t` to the result column `T` first, so `ORDER BY t` would sort by temperature (tested on Node 22.20). `WHERE` is not affected, because a table column wins there.

```sql
SELECT room_id, t, temp AS T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh,
       ac_fan, stage, core
FROM readings WHERE room_id = ? AND t >= ? AND t <= ? ORDER BY readings.t, readings.rowid;
```

Latest reading: the raw query's columns with `WHERE room_id = ? ORDER BY readings.t DESC, readings.rowid DESC LIMIT 1`.

db.js sets no row limit; C3 limits the range or requires a `step` for long ranges.

### 6.7 Events

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `addEvent(roomId, event)` | `event.t`: integer s; `event.level`: `'info'`, `'good'`, `'warning'`, `'serious'` or `'critical'`; `event.text`: string | `Event` (with its new `id`) | `NotFoundError('room')`; `TypeError` (unknown field); node:sqlite error (bad level, missing text, `t` with a fraction) |
| `listEvents(roomId, options?)` | `options.limit`: integer 1–1000 (default 100); `options.before`: an event `id` (integer) or `null` (default): only events with `id < before` | `Event[]`, newest first (`id` descending), at most `limit` | `NotFoundError('room')`; `TypeError` (unknown field); `RangeError` (bad `limit` or `before`) |

`before` is an id cursor, not a time: the next page is `listEvents(roomId, { before: lastEventOfThisPage.id })`. Ids follow insertion order, which is time order for one room's loop.

### 6.8 Alarms

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `raiseAlarm(roomId, alarm)` | `alarm.alarm_key`: string; `alarm.level`: `'warning'`, `'serious'` or `'critical'`; `alarm.label`: string; `alarm.at`: integer s (default `now()`) | `Alarm`: the new open row. If this room already has an open row for this key, that row unchanged (no new row, no error) | `NotFoundError('room')`; `TypeError` (unknown field); node:sqlite error (bad level, missing key or label) |
| `clearAlarm(roomId, alarmKey, at?)` | `alarmKey`: string; `at`: integer s (default `now()`) | `Alarm`: the open row with `cleared_at = at`; `null` if there is no open row for this key (no error) | `NotFoundError('room')` |
| `ackAlarm(roomId, alarmKey, at?)` | `alarmKey`: string; `at`: integer s (default `now()`) | Sets `acked_at = at` on every row of this room and key with `acked_at = null` (as the controller's `ack(id)` acknowledges the alarm), then returns the newest row for the key (largest `id`). Already acknowledged: the newest row unchanged | `NotFoundError('room')`; `NotFoundError('alarm')` if the room has no row with this key |
| `listAlarms(roomId, options?)` | `options.recent`: integer 0–500 (default 20) | `Alarm[]`: first every open alarm (`cleared_at = null`), newest `raised_at` first; then the `recent` most recently cleared alarms, newest `cleared_at` first. Ties: larger `id` first. `{ recent: 0 }` gives the open alarms only (C2 loads them this way at loop start) | `NotFoundError('room')`; `TypeError` (unknown field); `RangeError` (bad `recent`) |

A cleared alarm that nobody acknowledged has `cleared_at` set and `acked_at = null`; the page can still offer Acknowledge for it (the controller also keeps such alarms in `alarmList()` until they are acknowledged).

### 6.9 Controller state

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `saveControllerState(roomId, state)` | `state.controller`: object (`ctl.snapshot()`), required; `state.sim`: object (`sim.snapshot()`) or `null` (default `null`); `state.at`: integer s (default `now()`) | `undefined`. Replaces the room's row (one row per room: `INSERT … ON CONFLICT (room_id) DO UPDATE`) | `NotFoundError('room')`; `TypeError` (unknown field); node:sqlite error (missing controller) |
| `loadControllerState(roomId)` | – | `ControllerState`, or `null` if never saved | `NotFoundError('room')` |

### 6.10 Calibrations

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `saveCalibration(roomId, run)` | `run.ua`, `run.inf_ach`, `run.moist_buffer`, `run.co2_per_block`: numbers, required; `run.rmse_t`, `run.rmse_rh`, `run.rmse_co2`: number or `null` (non-finite → `null`; default `null`); `run.log_rows`: integer or `null` (default `null`); `run.run_at`: integer s (default `now()`); `run.source`: `'csv'`, `'history'`, `'import'` or `null` (default `null`); `run.log_from`, `run.log_to`: integer s or `null` (default `null`); `run.equipment`: object (the 7 Equipment fields) or `null` (default `null`; stored as JSON) | `Calibration` with `applied_at = null` | `NotFoundError('room')`; `TypeError` (unknown field); node:sqlite error (missing value, a `source` outside its list, a fraction in `log_from` or `log_to`) |
| `listCalibrations(roomId)` | – | `Calibration[]`, newest first (`run_at` descending, then `id` descending) | `NotFoundError('room')` |
| `applyCalibration(roomId, runId, at?)` | `runId`: integer; `at`: integer s (default `now()`) | `Calibration` with `applied_at = at` (applying again moves `applied_at` to the new time, so it becomes current again). Other runs keep their `applied_at` (history) | `NotFoundError('room')`; `NotFoundError('calibration')` if no run with this id belongs to this room |
| `currentCalibration(roomId)` | – | `Calibration` with the largest `applied_at` (ties: largest `id`), or `null` if no run was applied | `NotFoundError('room')` |

### 6.11 Crop mix

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `getMix(roomId)` | – | `MixRow[]` in `pos` order; `[]` if none | `NotFoundError('room')` |
| `replaceMix(roomId, rows)` | `rows`: array of `{ crop: string, blocks: integer ≥ 0, co2_per_block?: number or null }` (may be empty). Stored with `pos` = array index | `MixRow[]` as stored. One transaction: delete the room's rows, insert the new ones | `NotFoundError('room')`; `TypeError` (unknown field in a row); node:sqlite error (`blocks` with a fraction or negative, missing crop): nothing changes |

### 6.12 Capacity reports

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `saveCapacityReport(roomId, entry)` | `entry.report`: the `checkAsync` result object, required; `entry.run_at`: integer s (default `now()`). db.js copies `report.verdict` into `verdict`, and `report.utilisation` unchanged (no rounding) into `utilisation` (`null` if not a finite number) | `CapacityReport` | `NotFoundError('room')`; `TypeError` (unknown field of `entry`); node:sqlite error (verdict not one of the five, a `utilisation` with a fraction, missing report) |
| `latestCapacityReport(roomId)` | – | `CapacityReport` with the largest `id`, or `null` if none | `NotFoundError('room')` |

Older reports are kept (no delete); only the latest is read in version 1. Written by the version 1 web pages only (lead decision 19).

### 6.13 Simulation runs

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `saveSimulationRun(roomId, run)` | `run.kind`: `'cycle'`, `'capacity'` or `'equipment'`; `run.inputs`: object, required; `run.result`: object, required; `run.note`: string or `null` (default `null`); `run.real_start`: integer s or `null` (default `null`); `run.at`: integer s (default `now()`, stored as `created_at`) | `SimulationRun`. db.js fills the summary columns by the table below | `NotFoundError('room')`; `TypeError` (unknown field); node:sqlite error (bad `kind`, a verdict outside the kind's list, missing `inputs` or `result`, a fraction in an INTEGER column) |
| `listSimulationRuns(roomId, options?)` | `options.limit`: integer 1–200 (default 50); `options.before`: a run `id` (integer) or `null` (default): only runs with `id < before` | `SimulationRunInfo[]`, newest first (`id` descending), at most `limit` | `NotFoundError('room')`; `TypeError` (unknown field); `RangeError` (bad `limit` or `before`) |
| `getSimulationRun(roomId, runId)` | `runId`: integer | `SimulationRun` | `NotFoundError('room')`; `NotFoundError('simulation')` if no run with this id belongs to this room |
| `updateSimulationRun(roomId, runId, changes)` | `changes`: any of `note` (string or `null`), `real_start` (integer s or `null`); `{}` changes nothing | `SimulationRunInfo` after the change | `NotFoundError('room')`; `NotFoundError('simulation')`; `TypeError` (any other key); node:sqlite error (a fraction in `real_start`) |
| `deleteSimulationRun(roomId, runId)` | `runId`: integer | `SimulationRunInfo` of the deleted row (read before the delete) | `NotFoundError('room')`; `NotFoundError('simulation')` |

| Summary column | `kind = 'cycle'` | `kind = 'capacity'` | `kind = 'equipment'` (C8) |
|---|---|---|---|
| `verdict` | `'impossible'` when `result.verdict === 'impossible'`; else `'pass'` when `result.totals.pass === true`; else `'fail'` | `result.verdict`, unchanged (the `CHECK` rejects anything else) | `'impossible'` when `result.verdict === 'impossible'`; else `result.ac && result.ac.verdict` (the `CHECK` rejects anything else; a missing `ac` gives `undefined`, bound as `NULL`: 1299) |
| `blocks` | Sum of the `blocks` values of `inputs.mix` that are finite numbers (`0` for an empty or missing mix) | Same | Same |
| `days`, `kwh`, `rm` | `result.totals.days`, `.kwh`, `.rm` when `result.totals` is an object; each `null` when not a finite number | `null` | `null` |
| `utilisation` | `null` | `result.utilisation` unchanged when a finite number, else `null` | `null` |

| Other kinds | Rule |
|---|---|
| Any other `kind` (rejected by the `kind` `CHECK`) | `verdict` = `result.verdict` as given, `blocks` as above, `days`, `kwh`, `rm`, `utilisation` `null`; the insert then fails (275 from the `kind` `CHECK`; with `result.verdict` missing as well, which error comes first is not defined, 6.1) |

| Rule | Detail |
|---|---|
| JSON columns | `inputs` and `result` keep non-finite numbers (`toJson`, section 5) |
| Lists | `listSimulationRuns` never returns `result` (a default cycle's result is about 300 KB) |
| Delete | `deleteSimulationRun` is the only delete in C1 (6.4) |

### 6.14 Room equipment (C8)

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `getEquipment(roomId)` | – | `Equipment`, or `null` when the room has no row | `NotFoundError('room')` |
| `saveEquipment(roomId, eq)` | `eq`: the 7 fields `ac_hp`, `ac_units`, `fog_lph`, `air_m3h`, `walls`, `roof`, `height`, all required (`walls`, `roof` may be `null`); `eq.at`: integer s (default `now()`, stored as `saved_at`) | `Equipment` (insert, or replace the room's row: `INSERT … ON CONFLICT (room_id) DO UPDATE SET` every column) | `NotFoundError('room')`; `TypeError` (unknown field, the old key `fan_m3h` included; missing field, below); node:sqlite error (275 a `CHECK`, 3091 a wrong type) |

| Rule | Detail |
|---|---|
| Missing field | A field of the 7 that is absent or `undefined` throws `TypeError('saveEquipment: missing field "<key>"')`, before anything is written. `null` is not missing: it is stored (`walls`, `roof`) or fails its `NOT NULL` (1299, the other five). |
| Which key the message names | The first missing key in the order `ac_hp`, `ac_units`, `fog_lph`, `air_m3h`, `walls`, `roof`, `height` |
| Order of the checks | The room check (`NotFoundError`), then unknown fields, then missing fields, then the write (SQL constraints). Real db and fake give the same error and message. |
| Air size in the settings | db.js does not touch settings. C3 6.26 saves the Equipment, then calls C2 `applySettings` with `{ airM3h: air_m3h }` when the room's settings `airM3h` differs (lead decision 35, amended) |

## 7. Which caller uses what

| Caller | Functions |
|---|---|
| `server/main.js` | `openDb`, `close` |
| C2 `server/rooms.js` (C2 section 15) | `listRooms` (`{ includeArchived: true }` for the empty-database check; no argument for the rooms to start and `list`), `getRoom`, `createRoom` (also the demo room in `start()`), `updateRoom`, `archiveRoom`, `currentSettings`, `saveSettings`, `currentCalibration` (sim adapter room values), `loadControllerState`, `saveControllerState`, `insertReading`, `queryReadings` (`{ from: now − 3600, to: now }`, raw rows, at loop start for `Live.reading`; no conversion), `addEvent`, `listAlarms` (`{ recent: 0 }` for the open alarms at loop start; `{ recent: 500 }` in `ackAlarm`), `raiseAlarm`, `clearAlarm`, `ackAlarm`, `getMix` (loop start, the block count; C2 revision 6), `getEquipment` (loop start, the room's machines for the simulated adapter; C2 revision 8). C2 does not call `getSettingsVersion` or `latestReading`. Revision 5: C2 writes the new Reading keys `ac_fan`, `stage`, `core` through `insertReading`. Revision 6: C2 writes `air` (`cmd.air && cmd.air.on ? 1 : 0`, C9 6.3) and creates rooms without `vent`. |
| C3 `server/api.js` (C3 section 11) | Reads: `getRoom` (the room check of every route), `currentSettings`, `settingsHistory`, `getSettingsVersion` (restore), `queryReadings`, `listEvents`, `listAlarms`, `listCalibrations`, `currentCalibration`, `getMix`, `latestCapacityReport`. Revision 5 reads: `listSimulationRuns`, `getSimulationRun`, `getEquipment`. Writes the API makes itself: `saveCalibration`, `applyCalibration` (then C2 `restart`), `replaceMix`, `saveCapacityReport` (legacy), `saveSimulationRun`, `updateSimulationRun`, `deleteSimulationRun`, `saveEquipment`. Writes that change a running room go through C2 (settings, restore, ack, update, archive, create). Readings go to the browser as db.js returns them (no mapping). |
| C10 `server/harvest-db.js` (C10 5.1) | `db.version` (it needs 4 or newer), `db.sqlite` (its statements on `batches` and `harvest_crates`; lead decision 61), `getRoom` (the room check of `placeBatch` and `listBatches`) |
| C10 `server/harvest-api.js` (C10 9) | `getRoom` (9.1 room names, 9.5 place check), through `opts.db` |
| Tests only | `latestReading`: C2's tests compare the recorded reading with it (C2 sections 5.3 and 17). No server code calls it in version 1. |

## 8. Tests (`tests/db.test.js`)

The file defines every test once and runs it twice: with `openDb(':memory:', options)` and with `openFakeDb(options)` (section 9). Tests marked "real only" run only against `openDb`.

| Test | Proves | Real only |
|---|---|---|
| Open `':memory:'` | `db.version === 4`; every table and index of sections 4, 4.3, 4.4 and 4.5 exists (`simulation_runs`, its index, `room_equipment`, the seven new columns; `batches`, `harvest_crates`, `batches_room`, `harvest_crates_batch`); `readings` has `air` and no `fan`; `rooms` has no `vent`; `foreign_keys` is on; `db.sqlite` is a `DatabaseSync` | yes |
| Upgrade 2 (C9, on `master`) | The `master` tests of C9 6.2 stay, with two changes: where they open with the default list and assert the version 2 result (`db.version === 2`, `schema_version` rows 1 and 2, the 15 `readings` columns), they assert version 4 and the 18 columns instead (`openDb` prepares the statements of the current schema, so it cannot open a file that stops at version 2). They prove: a version 1 file with `fan` 0, 1, 2, 3 gives `air` 0, 1, 1, 1; `rooms` has no `vent`; the bucket `air` is the fraction on (0.75); `air: 2` is rejected (275); a failed upgrade 2 leaves the version 1 file as it was | yes |
| Upgrade 3 from version 2 | Build a version 2 file with raw `DatabaseSync` (not `openDb`, which prepares the statements of the current schema): `CREATE TABLE schema_version …`, `exec(UPGRADES[0].sql)`, `exec(UPGRADES[1].sql)`, `schema_version` rows 1 and 2, then one room, one reading and one calibration inserted by SQL; close it and open it with `openDb` and the default list: `version === 4`, `schema_version` rows 3 and 4 added, the old reading comes back with `ac_fan`, `stage`, `core` = `null`, the old calibration with `source`, `log_from`, `log_to`, `equipment` = `null` | yes |
| Upgrade 1 to 4 in one open | A version 1 file (written as the `master` test's `writeVersion1File` does, `fan` 0–3) opened with the default list: `version === 4`, `schema_version` rows 1, 2, 3, 4; each reading has `air` 0/1 and `ac_fan`, `stage`, `core` = `null`; `batches` and `harvest_crates` exist and are empty | yes |
| Upgrade 4 from version 3 | A temporary file opened with `openDb(path, { upgrades: UPGRADES.slice(0, 3) })` (version 3; db.js prepares no harvest statement, so `openDb` can open a version 3 file) and given one room with `createRoom`; closed, then reopened with the default list: `version === 4`, `schema_version` row 4 added, the room unchanged, `batches` and `harvest_crates` exist and are empty (C10 3 "Old databases") | yes |
| Open a temporary file | `journal_mode` is `wal`; reopening applies no upgrade twice | yes |
| Upgrades | With `options.upgrades` of two test upgrades appended after `UPGRADES`: both applied in order; a failing upgrade rolls back and throws `Schema upgrade N failed`; a database with a higher version throws and is not changed (message `… this app knows up to 4. …`). The test upgrades are numbered 5 and 6 (the `master` tests number them 3 and 4, and the failing one 3: wave 2 moves them up by two, past upgrades 3 and 4) | yes |
| Each function | Its return shape, its order, its defaults, and each error listed above (including `NotFoundError` for an unknown room on reads, and `TypeError` for an unknown field with nothing stored) | no |
| Constraint errors | Each `CHECK`, `NOT NULL` and type rule of section 9.2, with a row that breaks only that rule, throws an error with `code === 'ERR_SQLITE_ERROR'` and stores nothing | no |
| `errcode` values | The errors of the previous test have `errcode` 275 for a `CHECK`, 1299 for a `NOT NULL` and 3091 for a wrong type, so `(errcode & 0xff) === 19`. This is the shared test of lead decision 3 (C3 section 4.2 relies on it). | no |
| Readings | A Reading with `T`, `RH`, `CO2`, `room_id` comes back equal from `queryReadings` and `latestReading`; `temp`, `rh`, `co2` or `n` as an input key throw `TypeError`; raw range is inclusive at both ends; raw rows come back in `t` order when the temperatures are in another order, and rows with equal `t` in insertion order; `latestReading` picks the largest `t`, not the highest temperature; bucket values of section 6.6 (averages, nulls, last `ac_mode` and `kwh` with distinct `t` values, empty buckets left out, keys equal to a raw row's); `RangeError` cases; `latestReading` is `null` for a room without readings | no |
| Readings, `air` (C9 6.1) | `air` `true` / `false` is stored as `1` / `0`; `air: 2` → 275; `air: 0.5` → 3091; a missing `air` → 1299; `fan` as an input key throws `TypeError`; a bucket's `air` is the fraction of readings with the air exchange on | no |
| Rooms, no `vent` (C9 6.3) | `createRoom` and `updateRoom` with `vent` throw `TypeError` (`createRoom: unknown field "vent"`, `updateRoom: unknown field "vent"`) and store nothing; a `Room` has exactly the 6 keys of section 6.2 | no |
| Readings, upgrade 3 keys | A Reading with `ac_fan`, `stage`, `core` comes back equal (raw and latest); a bucket takes `ac_fan` and `stage` from the last row and averages `core`; `ac_fan: 'max'` → 275; `core: 'abc'` → 3091; a Reading without the three keys stores `null` in each | no |
| Simulation runs | Save, list (newest first, `limit`, `before`, no `result`), get (with `result`), update (`note`, `real_start`), delete (then `NotFoundError('simulation')`); the summary rules of 6.13 for a passing cycle, a failing cycle, an impossible cycle, a capacity report and an equipment Report (`result.ac.verdict = 'too-small'` stores `verdict` `too-small` and `days`, `kwh`, `rm`, `utilisation` `null`); a run of another room is `NotFoundError('simulation')`; `kind: 'capacity'` with `result.verdict` `'pass'` → 275, `kind: 'equipment'` with `result.ac.verdict` `'pass'` → 275, `kind: 'heat'` with `result.verdict` `'good'` → 275 (the `kind` `CHECK`); `Infinity` inside `result` survives | no |
| Calibrations, upgrade 3 fields | `source`, `log_from`, `log_to`, `equipment` stored and returned (`equipment` parsed, with `air_m3h`); left out → `null`; `source: 'web'` → 275 | no |
| Equipment | `getEquipment` of a new room is `null`; save then get returns the same 9 keys; a second save replaces (one row); `ac_hp: 1.25` → 275; `ac_units: 5` → 275; `air_m3h` 50 and 10000 stored, 40 and 10001 → 275; `walls: 'pu50', roof: null` → 275; `roof: 'brick115'` → 275; `ac_units: 1.5` → 3091; `ac_hp: 'x'` → 3091; `air_m3h: 'x'` → 3091; `fan_m3h` as a key → `TypeError('saveEquipment: unknown field "fan_m3h"')`; unknown room → `NotFoundError('room')` | no |
| Equipment, missing field | Left-out `height` → `TypeError('saveEquipment: missing field "height"')`; `height: undefined` → the same; `fog_lph` and `height` both left out → the message names `fog_lph`; `walls: null, roof: null` is not missing; after each error `getEquipment` is still `null` (nothing written) | no |
| Alarms | Raise twice gives one open row; clear then raise gives a new row; ack marks all unacknowledged rows of the key; `listAlarms` with `{ recent: 0 }` gives the open rows only | no |
| JSON | `Infinity`, `-Infinity`, `NaN` inside a controller state survive save and load; a real `ctl.snapshot()` loads equal to `fromJson(toJson(snapshot))` | no |
| Transactions | A failing `createRoom` or `replaceMix` leaves no row | no |
| Clock | Left-out `at` uses `options.now()` | no |

## 9. The fake (`tests/fakes/db.js`)

Written by the lead in wave 0, so C2 and C3 can test before `server/db.js` exists. It is plain JavaScript with in-memory arrays (no SQLite); it requires only `server/db-common.js` (for `NotFoundError`, `toJson` and `fromJson`), never `server/db.js` (lead decision 7).

### 9.1 Export

| Export | Arguments | Returns | Errors |
|---|---|---|---|
| `openFakeDb(options?)` | `options.now`: function returning integer seconds (default `() => Math.floor(Date.now() / 1000)`) | The db object of section 6, with `path = ':memory:'`, `version = 4`, `sqlite = null` (lead decision 61) and `close()`; a new empty database on every call | `TypeError` (unknown option; `upgrades` is not accepted) |

### 9.2 What the fake reproduces

| Behaviour | Fake |
|---|---|
| Functions, arguments, return shapes, orders, defaults, `now` | Exactly as section 6, including plain-object rows, `T` / `RH` / `CO2` keys, raw order (`t`, then insertion order) and bucket averaging |
| `NotFoundError`, `RangeError`, `TypeError` (unknown field, `vent` and `fan` included; `room_id` ≠ `roomId`; the `saveEquipment` missing field of 6.14, same message and key order) | Exactly as section 6 (same class, `code`, `what`, `id`, message) |
| Missing values, non-finite numbers, booleans of `air`, `lights` and `circ` | Exactly as section 1 |
| Every `NOT NULL` of sections 4, 4.3 and 4.4 (upgrade 2: `air`; upgrade 3: simulation `kind`, `inputs`, `result`, `verdict`, `blocks`; every `NOT NULL` column of `room_equipment`) | Throws `Error` with `code: 'ERR_SQLITE_ERROR'`, `errcode: 1299` |
| Every `CHECK` of the current schema, sections 4, 4.3 and 4.4 (`volume > 0`, `verdict`, `blocks >= 0`, `ac_mode`, `fog`, `lights`, `circ`, event `level`, alarm `level`; upgrade 2: `air` `IN (0, 1)`; upgrade 3: `ac_fan`, calibration `source`, simulation `kind`, simulation `verdict` (the 11 values), the kind/verdict pair (three kinds), simulation `blocks >= 0`, `days >= 1`, `ac_hp`, `ac_units`, `fog_lph`, `air_m3h` (50–10000), `walls`, `roof`, `height`, the `walls`/`roof` pair). The fake has no room `vent` and no reading level `fan` (C9 6.1). | Throws `Error` with `code: 'ERR_SQLITE_ERROR'`, `errcode: 275` |
| Foreign key (787), `UNIQUE` (2067) | Same codes as section 6.1. As in the real db, they cannot happen through the db object: the room check comes first, and `raiseAlarm` returns the open row. |
| Type rules: a number with a fraction in an INTEGER column (`t`, `at`, `run_at`, `blocks`, `fog`, `air`, `log_rows`, `utilisation`; upgrade 3: `log_from`, `log_to`, `days`, `real_start`, `ac_units`, `saved_at`; db.js copies `report.utilisation` unchanged, with no rounding, so a fraction fails like in any INTEGER column); a non-numeric string (for example `'abc'`) in an INTEGER or REAL column (upgrade 3 REAL columns: `core`, `kwh`, `rm`, `ac_hp`, `fog_lph`, `air_m3h`, `height`) | Throws `Error` with `code: 'ERR_SQLITE_ERROR'`, `errcode: 3091` |
| A row that breaks more than one rule | Throws one of the errors above; which one is not defined (section 6.1) |
| Unique open alarm per room and key | `raiseAlarm` returns the open row, as section 6.8 |
| All or nothing: `createRoom`, `replaceMix` | Checks every row before it changes anything |
| Upgrade 3 functions | `saveSimulationRun`, `listSimulationRuns`, `getSimulationRun`, `updateSimulationRun`, `deleteSimulationRun`, `getEquipment`, `saveEquipment` and the new Reading and Calibration fields, exactly as sections 6.2, 6.6, 6.10, 6.13 and 6.14, the `saveEquipment` missing-field message included (written by the lead in prep 2.0; the C9 key `air` and the missing `vent` are on `master` already) |
| JSON columns | `toJson` on write, `fromJson` on read (section 5) |
| Calls after `close()` | Throw `Error('database is not open')` |

| Not reproduced (tests must not depend on it) | Why |
|---|---|
| `errstr` of constraint errors; the error message text | SQLite detail; "real only" tests do not check them either |
| Which bare row gives `ac_mode`, `kwh`, `ac_fan` and `stage` when two readings share a bucket's largest `t` | Not defined (section 6.6) |
| `schema_version`, upgrades, PRAGMAs, files, WAL, `busy_timeout`, disk errors | No SQLite in the fake |
| `db.sqlite` (it is `null`) and the upgrade 4 tables `batches`, `harvest_crates` | No SQLite in the fake; harvest tests use the harvest fake `openFakeHarvest(openFakeDb())` (C10 5.4, `tests/fakes/harvest-db.js`) |
| Numeric strings (for example `'5'`) in INTEGER or REAL columns, non-strings in TEXT columns, booleans outside `air`, `lights` and `circ`, objects, bigints | SQLite converts some of them silently; callers validate first, so the result is not part of this contract |

A test of C2 or C3 that needs a database error the fake cannot make (C2 section 11: an error during a tick; C3 section 4.2: a non-constraint error that calls `onFatal`) replaces one function of the fake object with one that throws an error of the real shape, for example:

| Error to imitate | Value to throw |
|---|---|
| Disk I/O error (fatal in C3) | `Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' })` |
| Disk full (fatal in C3) | `Object.assign(new Error('database or disk is full'), { code: 'ERR_SQLITE_ERROR', errcode: 13, errstr: 'database or disk is full' })` |
| Constraint failure (500 only in C3) | Make it with the fake itself (a section 9.2 rule), or `Object.assign(new Error('CHECK constraint failed'), { code: 'ERR_SQLITE_ERROR', errcode: 275, errstr: 'constraint failed' })` |

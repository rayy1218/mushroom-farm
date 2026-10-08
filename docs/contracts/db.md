# C1: Database contract (`server/db.js`)

Date: 2026-10-08. Status: **frozen** (revision 4). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`.

This contract defines the SQLite schema (as exact SQL), the schema upgrade mechanism, every function of `server/db.js`, and the in-memory fake `tests/fakes/db.js` (section 9). The Data stream builds `server/db.js` against it. The Rooms stream (C2) and the API stream (C3) build against the fake, which follows this contract as section 9 states.

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
| One connection | The server opens the database once (`openDb`) and shares the object. |
| Time | Every time value is an integer: seconds since 1970-01-01 00:00 UTC. Passing a time with a fraction fails (STRICT tables reject it). |
| Clock | Arguments named `at` (and `run_at` where noted) are optional; when left out, db.js uses `now()` from `openDb`'s options (default `Math.floor(Date.now() / 1000)`). Reading and event times (`t`) are always given by the caller. |
| Ids | Integers made by SQLite (`INTEGER PRIMARY KEY`). An id that matches no row (including `NaN`, a string, `undefined`) gives `NotFoundError`. |
| Returned rows | Plain objects (normal prototype, not node:sqlite's null-prototype rows), so `assert.deepStrictEqual` works. Keys are the column names exactly as in the SQL below. The one exception is the readings column `temp`, which is returned as `T` (section 6.6). |
| Argument objects | Every object argument accepts only the keys this contract lists for it. Any other key throws `TypeError('<function>: unknown field "<key>"')` before anything is written. The values of JSON columns (`settings`, `report`, `controller`, `sim`) are not checked. |
| Missing values | `undefined` (or a left-out key) is bound as `NULL`. An optional column stores `NULL` and returns `null`; a `NOT NULL` column then fails with the node:sqlite error. |
| Non-finite numbers | db.js binds `NaN`, `Infinity` and `-Infinity` as `NULL` in every column (SQLite would otherwise store `Infinity`). A `NOT NULL` column then fails. |
| JSON columns | `room_settings.settings`, `capacity_reports.report`, `controller_state.controller`, `controller_state.sim`: db.js stores JS values as JSON text and returns them parsed. It keeps non-finite numbers (section 5). |
| Booleans | SQLite has none. `lights` and `circ` accept `true`, `false`, `0`, `1` and are returned as `0` or `1`. |
| Validation | db.js does not apply business rules. The callers validate first. Settings: C2 stores only `ClimateController.defaultSettings()` or the `settings` result of `ClimateController.importSettings`, never settings received from HTTP or an import as they arrived (lead decision 6). Rooms, mixes and calibrations go through `room-rules.js` (`check*`); query options are checked in the API. The SQL constraints (types, `NOT NULL`, `CHECK`, foreign keys) are the last guard: a value that breaks one throws the node:sqlite error and stores nothing. |
| Archived rooms | An archived room still exists: every function works on it (reads and writes). Stopping its loop and refusing edits are C2 and C3 decisions. |
| Transactions | A function that writes more than one row (`createRoom`, `replaceMix`, each schema upgrade) runs in one transaction: all rows or none. |
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
| Current version | `SELECT COALESCE(MAX(version), 0) AS version FROM schema_version` (0 = new, empty database). |
| Apply | For each upgrade with `version` above the current version, in order: `BEGIN IMMEDIATE`; `exec(sql)`; `INSERT INTO schema_version (version, applied_at) VALUES (?, now())`; `COMMIT`. |
| Failed upgrade | `ROLLBACK` (that upgrade leaves no trace; earlier upgrades stay applied), then throw `Error('Schema upgrade <version> failed: <SQLite message>')`. |
| Newer database | If the current version is above the highest version in the list: throw `Error('The database <path> has schema version <n>; this app knows up to <m>. Use a newer version of the app.')` and change nothing. |
| Released upgrades | Never edited. A change is always a new upgrade with the next number. Later modules (batches, harvest, …) add their tables this way. |
| Table rebuilds | A later upgrade that rebuilds a table (SQLite cannot drop a `CHECK`) must follow SQLite's 12-step rebuild; `foreign_keys` cannot change inside a transaction, so such an upgrade needs an extra field in the upgrade object. Not needed for version 1. |
| Result | `db.version` is the schema version after opening (1 for this contract). |

## 4. Schema version 1 (exact SQL)

This is the `sql` of upgrade 1. All tables are `STRICT` (SQLite 3.37+; Node 22 bundles 3.4x+): a value of the wrong type fails instead of being stored.

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
| `vent` | TEXT | no | `supply`, `exhaust` | Air path (sim `env.vent`) |
| `adapter` | TEXT | no | `sim` (later `hw`, …) | Which adapter runs the room. No `CHECK`, so a new adapter needs no table rebuild |
| `created_at` | INTEGER | no | s since 1970 UTC | When the room was made |
| `archived_at` | INTEGER | yes | s since 1970 UTC | `null` = active; set = archived (loop stopped, data kept) |

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
| `ua` | REAL | no | W/K (20–400) | Room heat loss (`PARAMS.ua`) |
| `inf_ach` | REAL | no | air changes per h (0.05–3) | Air leakage (`PARAMS.infAch`) |
| `moist_buffer` | REAL | no | × (1–10) | Moisture buffer (`PARAMS.moistBuffer`) |
| `co2_per_block` | REAL | no | mL/h per block (5–300) | CO₂ per block (`PARAMS.co2PerBlock`; today's page rounds it when it applies it) |
| `rmse_t` | REAL | yes | °C | Fit error of T (`result.rmse.T`); `null` when not fitted (NaN) |
| `rmse_rh` | REAL | yes | % RH | Fit error of RH |
| `rmse_co2` | REAL | yes | ppm | Fit error of CO₂ |
| `log_rows` | INTEGER | yes | rows | Rows of the farm log used; `null` when not known |
| `applied_at` | INTEGER | yes | s since 1970 UTC | When last applied to the room; `null` = never |

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
| `fan` | `fan` | INTEGER | no | 0–3 | Exhaust or supply fan level command | `cmd.fan.level` |
| `lights` | `lights` | INTEGER | no | 0, 1 | Lights command | `cmd.lights.on` |
| `circ` | `circ` | INTEGER | no | 0, 1 | Circulation fan command | `cmd.circ.on` |
| `power_w` | `power_w` | REAL | yes | W | Total electric power at the reading | Sum of `r.power` (`ac + hu + fan + lights + circ`); `null` if the adapter has no meter |
| `kwh` | `kwh` | REAL | yes | kWh | Energy meter: total since the adapter's meter started (it only grows within a run) | Sum of `r.kwh` (`ac + hu + fan + lights + circ`); `null` if the adapter has no meter |

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
| `alarm_key` | TEXT | no | Any string. The controller today raises 13 key forms: `tHi`, `tLo`, `tCrop`, `coreHi`, `rhHi`, `rhLo`, `co2Hi`, `co2Safe`, `disagree`, `acTooSmall`, `blocksDone`, `shockLimit`, and `sensor_<key>` with `<key>` a key of `ClimateController.SENSORS` (`T`, `RH`, `CO2`, `tOut`, `rhOut`, `core`, `T2`, `RH2`, `CO2b`; for example `sensor_RH`). The list is open: there is no `CHECK`, so a new controller alarm needs no upgrade, and readers must accept unknown keys. | Alarm `id` in the controller |
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

#### `schema_version`

| Column | Type | Null | Unit or values | Meaning |
|---|---|---|---|---|
| `version` | INTEGER | no | 1, 2, … (primary key) | Applied upgrade |
| `applied_at` | INTEGER | no | s since 1970 UTC | When applied |

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
| `NotFoundError` | A room id, settings version, calibration run or alarm key matches no row (rule per function below) | Section 5.1; `err.what` = `'room'`, `'settings'`, `'calibration'` or `'alarm'`; `err.id` = the id or key that was asked for | C3: HTTP 404. C2: a programming error (the room manager only uses rooms it loaded). Callers test `err.code === 'NOT_FOUND'`. |
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
| `Room` | `{ id, name, volume, vent, adapter, created_at, archived_at }` |
| `SettingsVersion` | `{ id, room_id, saved_at, note, settings }` (`settings` parsed) |
| `SettingsVersionInfo` | `{ id, saved_at, note }` |
| `Reading` | `{ room_id, t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh }`. The same keys for raw rows and averaged (bucket) rows; in a bucket row `t` is the bucket start and the values follow section 6.6. This is exactly C2's ReadingRow and C3's Reading, and what C5 reads (lead decision 1). |
| `Event` | `{ id, room_id, t, level, text }` |
| `Alarm` | `{ id, room_id, alarm_key, level, label, raised_at, cleared_at, acked_at }` |
| `ControllerState` | `{ room_id, saved_at, controller, sim }` (`controller` and `sim` parsed; `sim` may be `null`) |
| `Calibration` | `{ id, room_id, run_at, ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows, applied_at }` |
| `MixRow` | `{ crop, blocks, co2_per_block }` (`co2_per_block` may be `null`; `pos` is not returned: the array order is the order) |
| `CapacityReport` | `{ id, room_id, run_at, verdict, utilisation, report }` (`report` parsed) |

### 6.3 Properties and lifecycle

| Member | Type | Meaning | Errors |
|---|---|---|---|
| `db.path` | string | The path given to `openDb` (`':memory:'` for the fake) | – |
| `db.version` | integer | Schema version after opening (1) | – |
| `db.close()` | → `undefined` | Closes the connection (WAL is checkpointed by SQLite). A second call does nothing. | – |

### 6.4 Rooms

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `createRoom(room)` | `room.name`: string; `room.volume`: number (m³); `room.vent`: `'supply'` or `'exhaust'`; `room.adapter`: string (default `'sim'`); `room.settings`: settings object (required; `defaultSettings()` or the `settings` result of `importSettings`, lead decision 6; C2 section 9.4); `room.note`: string (default `'Created'`); `room.at`: integer s (default `now()`) | `Room`. In one transaction it inserts the room (`created_at = at`) and its first settings version (`saved_at = at`, `note`), so a room always has settings | `TypeError` (unknown field); node:sqlite error (bad vent, volume ≤ 0, missing name or settings) |
| `listRooms(options?)` | `options.includeArchived`: boolean (default `false`) | `Room[]`, ordered by `id` ascending. Without `includeArchived`, only rooms with `archived_at = null` | `TypeError` (unknown field) |
| `getRoom(id)` | `id`: integer | `Room` | `NotFoundError('room')` |
| `updateRoom(id, changes)` | `id`: integer; `changes`: object with any of `name` (string), `volume` (number), `vent` (`'supply'` or `'exhaust'`). An empty object changes nothing | `Room` after the change | `NotFoundError('room')`; `TypeError` (any other key, `archived_at` included: use `archiveRoom`); node:sqlite error (bad value) |
| `archiveRoom(id, at?)` | `id`: integer; `at`: integer s (default `now()`) | `Room` with `archived_at` set. Already archived: unchanged (keeps the first `archived_at`) | `NotFoundError('room')` |

There is no delete and no un-archive.

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
| `insertReading(roomId, reading)` | `reading`: a `Reading` object (section 6.2). `t` (integer s, required); `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_setpoint`, `power_w`, `kwh` (number, `null` or left out; non-finite → `NULL`); `ac_mode` (string, required); `fog`, `fan` (integer 0–3, required); `lights`, `circ` (boolean or 0/1, required); `room_id` (optional; when present it must equal `roomId`) | `undefined` | `NotFoundError('room')`; `TypeError` (unknown field, including `temp`, `rh`, `co2`, `n`; or `room_id` ≠ `roomId`); node:sqlite error (missing or bad required field, `t` with a fraction) |
| `queryReadings(roomId, query)` | `query.from`, `query.to`: integer s, both required, `from ≤ to`; rows with `from ≤ t ≤ to`. `query.step`: integer s ≥ 1, or `null` / left out for raw rows | Without `step`: raw `Reading[]`, ordered by `t` ascending (equal `t`: insertion order). With `step`: averaged `Reading[]`, one per bucket that has rows (empty buckets are left out, so a gap stays a gap), ordered by `t` ascending | `NotFoundError('room')`; `TypeError` (unknown field); `RangeError` if `from` or `to` is not an integer, `from > to`, or `step` is not an integer ≥ 1 |
| `latestReading(roomId)` | – | The newest raw `Reading` of the room (largest `t`; ties: the one inserted last), or `null` if the room has none | `NotFoundError('room')` |

Duplicate `t` values for one room are allowed (no unique key); they are returned as they are. A raw Reading (from `queryReadings` without `step`, or from `latestReading`) can be passed back to `insertReading` unchanged. A bucket row cannot, because its `fog`, `fan`, `lights` and `circ` can be fractions.

#### Bucket averaging

| Bucket field | Value |
|---|---|
| `room_id` | The room |
| `t` | Bucket start: `floor(t / step) * step` (buckets align to multiples of `step` since 1970 UTC; Malaysia time is UTC+8, so steps that divide 1 h also align to local hours) |
| `T`, `RH`, `CO2`, `t_out`, `rh_out`, `power_w` | Average of the non-null values; `null` if all are null |
| `ac_setpoint` | Average of the non-null values (the AC was on); `null` if the AC was off for the whole bucket |
| `fog`, `fan` | Average level (a fraction, for example 1.5) |
| `lights`, `circ` | Fraction of readings with the machine on (0–1) |
| `ac_mode` | Value of the last reading in the bucket (the one with the largest `t`) |
| `kwh` | Value of the last reading in the bucket (the meter at the bucket's end) |

A bucket row has no count field: its keys are exactly the raw row's keys.

When two readings share the bucket's largest `t`, which one gives `ac_mode` and `kwh` is not defined (the real db and the fake may differ); tests must not depend on it. This is decided: defining it would need a window query for a case that the room loop does not produce (C2 writes one reading per `t`).

Exact SQL (the `MAX(t)` makes SQLite take the bare columns `ac_mode` and `kwh` from the last row of each group; it must stay the only `MIN`/`MAX` in the inner query). node:sqlite binds every JS number as REAL, so `:step` is cast to INTEGER for the integer division. The outer query orders by `b`, because the result has both `t` and `T`, which SQLite treats as the same name:

```sql
SELECT room_id, b AS t, T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh
FROM (
  SELECT room_id,
         (t / CAST(:step AS INTEGER)) * CAST(:step AS INTEGER) AS b,
         AVG(temp) AS T, AVG(RH) AS RH, AVG(CO2) AS CO2, AVG(t_out) AS t_out, AVG(rh_out) AS rh_out,
         AVG(ac_setpoint) AS ac_setpoint, AVG(fog) AS fog, AVG(fan) AS fan,
         AVG(lights) AS lights, AVG(circ) AS circ, AVG(power_w) AS power_w,
         MAX(t) AS t_last, ac_mode, kwh
  FROM readings
  WHERE room_id = :room_id AND t >= :from AND t <= :to
  GROUP BY b
)
ORDER BY b;
```

Raw query (uses `readings_room_t`). `ORDER BY` must name `readings.t`: in `ORDER BY`, SQLite matches a bare `t` to the result column `T` first, so `ORDER BY t` would sort by temperature (tested on Node 22.20). `WHERE` is not affected, because a table column wins there.

```sql
SELECT room_id, t, temp AS T, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh
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
| `saveCalibration(roomId, run)` | `run.ua`, `run.inf_ach`, `run.moist_buffer`, `run.co2_per_block`: numbers, required; `run.rmse_t`, `run.rmse_rh`, `run.rmse_co2`: number or `null` (non-finite → `null`; default `null`); `run.log_rows`: integer or `null` (default `null`); `run.run_at`: integer s (default `now()`) | `Calibration` with `applied_at = null` | `NotFoundError('room')`; `TypeError` (unknown field); node:sqlite error (missing value) |
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

Older reports are kept (no delete); only the latest is read in version 1.

## 7. Which caller uses what

| Caller | Functions |
|---|---|
| `server/main.js` | `openDb`, `close` |
| C2 `server/rooms.js` (C2 section 15) | `listRooms` (`{ includeArchived: true }` for the empty-database check; no argument for the rooms to start and `list`), `getRoom`, `createRoom` (also the demo room in `start()`), `updateRoom`, `archiveRoom`, `currentSettings`, `saveSettings`, `currentCalibration` (sim adapter room values), `loadControllerState`, `saveControllerState`, `insertReading`, `queryReadings` (`{ from: now − 3600, to: now }`, raw rows, at loop start for `Live.reading`; no conversion), `addEvent`, `listAlarms` (`{ recent: 0 }` for the open alarms at loop start; `{ recent: 500 }` in `ackAlarm`), `raiseAlarm`, `clearAlarm`, `ackAlarm`. C2 does not call `getSettingsVersion`, `latestReading` or `getMix`. |
| C3 `server/api.js` (C3 section 11) | Reads: `getRoom` (the room check of every route), `currentSettings`, `settingsHistory`, `getSettingsVersion` (restore), `queryReadings`, `listEvents`, `listAlarms`, `listCalibrations`, `currentCalibration`, `getMix`, `latestCapacityReport`. Writes the API makes itself: `saveCalibration`, `applyCalibration` (then C2 `restart`), `replaceMix`, `saveCapacityReport`. Writes that change a running room go through C2 (settings, restore, ack, update, archive, create). Readings go to the browser as db.js returns them (no mapping). |
| Tests only | `latestReading`: C2's tests compare the recorded reading with it (C2 sections 5.3 and 17). No server code calls it in version 1. |

## 8. Tests (`tests/db.test.js`)

The file defines every test once and runs it twice: with `openDb(':memory:', options)` and with `openFakeDb(options)` (section 9). Tests marked "real only" run only against `openDb`.

| Test | Proves | Real only |
|---|---|---|
| Open `':memory:'` | `db.version === 1`; every table and index of section 4 exists; `foreign_keys` is on | yes |
| Open a temporary file | `journal_mode` is `wal`; reopening applies no upgrade twice | yes |
| Upgrades | With `options.upgrades` of two test upgrades: both applied in order; a failing upgrade rolls back and throws `Schema upgrade N failed`; a database with a higher version throws and is not changed | yes |
| Each function | Its return shape, its order, its defaults, and each error listed above (including `NotFoundError` for an unknown room on reads, and `TypeError` for an unknown field with nothing stored) | no |
| Constraint errors | Each `CHECK`, `NOT NULL` and type rule of section 9.2, with a row that breaks only that rule, throws an error with `code === 'ERR_SQLITE_ERROR'` and stores nothing | no |
| `errcode` values | The errors of the previous test have `errcode` 275 for a `CHECK`, 1299 for a `NOT NULL` and 3091 for a wrong type, so `(errcode & 0xff) === 19`. This is the shared test of lead decision 3 (C3 section 4.2 relies on it). | no |
| Readings | A Reading with `T`, `RH`, `CO2`, `room_id` comes back equal from `queryReadings` and `latestReading`; `temp`, `rh`, `co2` or `n` as an input key throw `TypeError`; raw range is inclusive at both ends; raw rows come back in `t` order when the temperatures are in another order, and rows with equal `t` in insertion order; `latestReading` picks the largest `t`, not the highest temperature; bucket values of section 6.6 (averages, nulls, last `ac_mode` and `kwh` with distinct `t` values, empty buckets left out, keys equal to a raw row's); `RangeError` cases; `latestReading` is `null` for a room without readings | no |
| Alarms | Raise twice gives one open row; clear then raise gives a new row; ack marks all unacknowledged rows of the key; `listAlarms` with `{ recent: 0 }` gives the open rows only | no |
| JSON | `Infinity`, `-Infinity`, `NaN` inside a controller state survive save and load; a real `ctl.snapshot()` loads equal to `fromJson(toJson(snapshot))` | no |
| Transactions | A failing `createRoom` or `replaceMix` leaves no row | no |
| Clock | Left-out `at` uses `options.now()` | no |

## 9. The fake (`tests/fakes/db.js`)

Written by the lead in wave 0, so C2 and C3 can test before `server/db.js` exists. It is plain JavaScript with in-memory arrays (no SQLite); it requires only `server/db-common.js` (for `NotFoundError`, `toJson` and `fromJson`), never `server/db.js` (lead decision 7).

### 9.1 Export

| Export | Arguments | Returns | Errors |
|---|---|---|---|
| `openFakeDb(options?)` | `options.now`: function returning integer seconds (default `() => Math.floor(Date.now() / 1000)`) | The db object of section 6, with `path = ':memory:'`, `version = 1` and `close()`; a new empty database on every call | `TypeError` (unknown option; `upgrades` is not accepted) |

### 9.2 What the fake reproduces

| Behaviour | Fake |
|---|---|
| Functions, arguments, return shapes, orders, defaults, `now` | Exactly as section 6, including plain-object rows, `T` / `RH` / `CO2` keys, raw order (`t`, then insertion order) and bucket averaging |
| `NotFoundError`, `RangeError`, `TypeError` (unknown field, `room_id` ≠ `roomId`) | Exactly as section 6 (same class, `code`, `what`, `id`, message) |
| Missing values, non-finite numbers, booleans of `lights` and `circ` | Exactly as section 1 |
| Every `NOT NULL` of section 4 | Throws `Error` with `code: 'ERR_SQLITE_ERROR'`, `errcode: 1299` |
| Every `CHECK` of section 4 (`volume > 0`, `vent`, `verdict`, `blocks >= 0`, `ac_mode`, `fog`, `fan`, `lights`, `circ`, event `level`, alarm `level`) | Throws `Error` with `code: 'ERR_SQLITE_ERROR'`, `errcode: 275` |
| Foreign key (787), `UNIQUE` (2067) | Same codes as section 6.1. As in the real db, they cannot happen through the db object: the room check comes first, and `raiseAlarm` returns the open row. |
| Type rules: a number with a fraction in an INTEGER column (`t`, `at`, `run_at`, `blocks`, `fog`, `fan`, `log_rows`, `utilisation`; db.js copies `report.utilisation` unchanged, with no rounding, so a fraction fails like in any INTEGER column); a non-numeric string (for example `'abc'`) in an INTEGER or REAL column | Throws `Error` with `code: 'ERR_SQLITE_ERROR'`, `errcode: 3091` |
| A row that breaks more than one rule | Throws one of the errors above; which one is not defined (section 6.1) |
| Unique open alarm per room and key | `raiseAlarm` returns the open row, as section 6.8 |
| All or nothing: `createRoom`, `replaceMix` | Checks every row before it changes anything |
| JSON columns | `toJson` on write, `fromJson` on read (section 5) |
| Calls after `close()` | Throw `Error('database is not open')` |

| Not reproduced (tests must not depend on it) | Why |
|---|---|
| `errstr` of constraint errors; the error message text | SQLite detail; "real only" tests do not check them either |
| Which bare row gives `ac_mode` and `kwh` when two readings share a bucket's largest `t` | Not defined (section 6.6) |
| `schema_version`, upgrades, PRAGMAs, files, WAL, `busy_timeout`, disk errors | No SQLite in the fake |
| Numeric strings (for example `'5'`) in INTEGER or REAL columns, non-strings in TEXT columns, booleans outside `lights` and `circ`, objects, bigints | SQLite converts some of them silently; callers validate first, so the result is not part of this contract |

A test of C2 or C3 that needs a database error the fake cannot make (C2 section 11: an error during a tick; C3 section 4.2: a non-constraint error that calls `onFatal`) replaces one function of the fake object with one that throws an error of the real shape, for example:

| Error to imitate | Value to throw |
|---|---|
| Disk I/O error (fatal in C3) | `Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10, errstr: 'disk I/O error' })` |
| Disk full (fatal in C3) | `Object.assign(new Error('database or disk is full'), { code: 'ERR_SQLITE_ERROR', errcode: 13, errstr: 'database or disk is full' })` |
| Constraint failure (500 only in C3) | Make it with the fake itself (a section 9.2 rule), or `Object.assign(new Error('CHECK constraint failed'), { code: 'ERR_SQLITE_ERROR', errcode: 275, errstr: 'constraint failed' })` |

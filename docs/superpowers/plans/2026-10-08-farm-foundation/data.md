# Work brief: Wave 1, Data stream (C1): `server/db.js` and `tests/db.test.js`

Date: 2026-10-08. Repo: `/home/foqcus/Documents/mushroom-farm` (you work alone in your own git worktree of it).
Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`, sections 2, 5 and 6.
Contract: `docs/contracts/db.md` (C1, revision 4). This brief cites it as "C1 §n". The lead decisions (LD 1 to 7) are already folded into C1. When this brief and C1 disagree, C1 wins: follow C1 and report the difference to the lead.

## 1. Goal

Build `server/db.js`, the farm app's SQLite layer, exactly as C1 defines it: `openDb`, the upgrade list `UPGRADES` (upgrade 1 = the C1 §4 SQL, copied verbatim) and the 28 functions plus `close` of the db object (C1 §6). Build `tests/db.test.js`: every test is defined once and runs against both the real database (`openDb(':memory:', options)`) and the lead's fake (`openFakeDb(options)` from `tests/fakes/db.js`). A few tests are "real only" (C1 §8). This file is the shared test of LD 3: the fake's constraint errors must carry the same `code` and `errcode` as node:sqlite.

Nothing else uses `server/db.js` in wave 1. C2 and C3 test against the fake only (LD 7), and the API stream's `server/main.js` opens the real db.

## 2. Files

| File | Access | Content or reason |
|---|---|---|
| `server/db.js` | Create (owned) | CommonJS. `module.exports = { openDb, NotFoundError, UPGRADES }`. `NotFoundError` is the class from `./db-common.js`, re-exported (the same object). Requires only `node:sqlite`, `node:fs`, `node:path` and `./db-common.js`. |
| `tests/db.test.js` | Create (owned) | The C1 §8 tests, laid out as in section 6 |
| `docs/contracts/db.md` | Read only (lead) | The contract. Read all of it before you start. |
| `server/db-common.js` | Read only (lead, wave 0) | `NotFoundError`, `toJson`, `fromJson` (C1 §5.1). db.js uses these and never its own copies. |
| `tests/fakes/db.js` | Read only (lead, wave 0) | `openFakeDb(options)` (C1 §9), the second target of every shared test |
| `package.json` | Read only (lead, wave 0) | `scripts.test` = `node --disable-warning=ExperimentalWarning --test tests/*.test.js`; `engines.node` = `">=22.13"` |
| `controller.js`, `sim.js`, `runtime.js` | Read only (shared modules) | Only to make a real `ctl.snapshot()` in Task 9 |

You may create or change only the two owned files.

## 3. Contract sections you build against

| C1 section | What |
|---|---|
| §1 | General rules: CommonJS, synchronous, integer seconds, clock, ids, plain-object rows, unknown fields, missing and non-finite values → `NULL`, JSON columns, booleans, no business validation, archived rooms, transactions (`createRoom`, `replaceMix`, each upgrade), no demo room |
| §2.1, §2.2 | `openDb` arguments, errors and its 8 steps in order |
| §3 | `schema_version`, `UPGRADES`, apply, failed upgrade, newer database, `db.version` |
| §4 | Schema version 1, exact SQL. Copy it verbatim into `UPGRADES[0].sql`. |
| §4.1, §4.2 | Column meanings. The `readings` columns carry the Reading key names (`RH`, `CO2`, …) except `temp`, which db.js returns as `T` (LD 1). |
| §5, §5.1 | JSON columns through `toJson` / `fromJson` |
| §6.1 | Errors: `NotFoundError`, `RangeError`, `TypeError`, node:sqlite errors (constraint codes 275, 1299, 3091, 787, 2067), `Error('database is not open')` |
| §6.2, §6.3 | Returned shapes; `path`, `version`, `close` |
| §6.4 to §6.12 | Function tables: rooms, settings versions, readings (exact bucket, raw and latest SQL), events, alarms, controller state, calibrations, crop mix, capacity reports |
| §8 | Tests to write |
| §9.2 | What the fake reproduces. Shared tests check only these behaviours. |

## 4. node:sqlite facts (checked on Node 22.20, installed here)

| Fact | What `server/db.js` does |
|---|---|
| Rows come back with a null prototype. | Copy every returned row into a plain object (`{ ...row }`). |
| Binding `true`, `false` or `undefined` throws `ERR_INVALID_ARG_TYPE`. `NaN` binds as `NULL`, but `Infinity` is stored as `Infinity` in a REAL column. | Pass every bound value through one helper: `undefined` → `null`, `true`/`false` → `1`/`0`, a non-finite number → `null`, anything else unchanged. |
| A named-parameter object with a key the SQL does not use throws `ERR_INVALID_STATE`. | Pass exactly the parameters each statement uses. |
| A second `DatabaseSync.close()` throws; after `close()` a prepared statement throws `statement has been finalized`. | Keep a `closed` flag: a second `db.close()` does nothing, and every function first throws `new Error('database is not open')` when closed. |
| An INTEGER key compared with the text `'7'` matches row 7. | Before every lookup by id (room ids, `versionId`, `runId`), require `Number.isInteger(id)`; otherwise throw `NotFoundError`. |
| A CHECK fails with `errcode` 275, a NOT NULL with 1299, a fraction or non-numeric text in an INTEGER column, or non-numeric text in a REAL column of a STRICT table, with 3091. All have `code: 'ERR_SQLITE_ERROR'`. | Let node:sqlite errors propagate unchanged: roll back an open transaction and rethrow; never wrap or rewrite. |
| SQLite cannot hold columns `t` and `T` in one table. In `ORDER BY`, a bare `t` matches the result alias `T` first, so `ORDER BY t` sorts by temperature. | Write `reading.T` into `temp`, read `temp AS T`. Use the C1 §6.6 raw and latest SQL exactly: `ORDER BY readings.t, readings.rowid` (latest: both `DESC`, `LIMIT 1`). |
| node:sqlite binds every JS number as REAL. | Use the C1 §6.6 bucket SQL verbatim (it casts `:step`), with named parameters `:step`, `:room_id`, `:from`, `:to`. |
| `prepare()` on a missing table throws. | Prepare statements at step 8, after the upgrades. Tests that pass `options.upgrades` start the list with the real upgrade 1 (`[...UPGRADES, …]`). |
| `PRAGMA journal_mode = WAL` on `':memory:'` stays `memory`. | That is fine (C1 §2.2 step 3). |

## 5. Suggested internal structure (not part of the contract)

| Helper | Job |
|---|---|
| `live()` | Throws `new Error('database is not open')` when closed. First line of every function except `close`. |
| `fields(fn, obj, allowed)` | For each own key of `obj` (when `obj` is not `undefined` or `null`) not in `allowed`: throw `new TypeError(\`${fn}: unknown field "${key}"\`)`. `fn` is the called function's name. |
| `val(x)` | The binding helper of section 4 |
| `plain(row)` | `row ? { ...row } : null` |
| `roomCheck(id)` | `if (!Number.isInteger(id) \|\| !getRoomStmt.get(id)) throw new NotFoundError('room', id)` |
| `tx(fn)` | `BEGIN`, run `fn`, `COMMIT`; on any throw `ROLLBACK` and rethrow the same error. Used by `createRoom` and `replaceMix`. |
| `upgrade(conn, list, path, now)` | C1 §3, with `BEGIN IMMEDIATE` per upgrade |

Order of checks in every function (the same order as the fake): `live()`; room check; unknown fields (every row of `replaceMix` before any write); `room_id` ≠ `roomId`; `RangeError`; the write (constraint errors); sub-id `NotFoundError` (`settings`, `calibration`, `alarm`). `openDb` closes its `DatabaseSync` before it throws (unknown option, newer database, failed upgrade).

## 6. Test file layout (`tests/db.test.js`)

| Item | Rule |
|---|---|
| Requires | `node:test`, `node:assert/strict`, `node:fs`, `node:os`, `node:path`, `node:sqlite` (raw `DatabaseSync` for "real only" file checks), `../server/db.js`, `../server/db-common.js`, `./fakes/db.js`. Task 9 also requires `../sim.js`, `../controller.js`, `../runtime.js` and reads `globalThis.ClimateSim`, `ClimateController`, `ClimateRuntime`, as `tests/harness.js` does. |
| Two targets | `const TARGETS = [['real', o => openDb(':memory:', o)], ['fake', o => openFakeDb(o)]];`. A helper `both(name, fn)` registers `test(\`${label}: ${name}\`, …)` once per target and passes `(open)`. A "real only" test is a plain `test('real: …')`. |
| Clock | Per test: `let clock = 1791446400; const now = () => clock;` and `open({ now })`. 1791446400 is a multiple of 60, 900 and 3600. |
| Clean-up | `t.after(() => db.close())`. File tests use `fs.mkdtempSync(path.join(os.tmpdir(), 'farm-db-'))` and `fs.rmSync(dir, { recursive: true, force: true })` in `t.after`. |
| `assertNotFound(fn, what, id)` | `instanceof NotFoundError` (from `server/db-common.js`), `code === 'NOT_FOUND'`, `what` and `id` as given (`Object.is` for `NaN`), `message === \`Unknown ${what} ${id}\`` |
| `assertSql(fn, errcode)` | `code === 'ERR_SQLITE_ERROR'`, `errcode` as given, `(errcode & 0xff) === 19`. Never assert the message or `errstr` (C1 §9.2). |
| Unknown-field asserts | The exact message `` `<function>: unknown field "<key>"` `` (including `replaceMix` rows). `room_id` ≠ `roomId`: `instanceof TypeError` only (message not frozen). `openFakeDb` options: `instanceof TypeError` only. |
| Plain rows | `Object.getPrototypeOf(row) === Object.prototype` for at least one row of each shape |
| Factories | `roomInput(over)`, `reading(t, over)`, `calibRun(over)`, `report(over)`, so each test overrides only the field it is about. Settings content is never checked by db.js, so a small object such as `{ spT: 18 }` is enough. |
| Never assert in shared tests | Which row gives `ac_mode`/`kwh` when two readings share a bucket's largest `t`; node:sqlite message texts; numeric strings, non-strings in TEXT columns, booleans outside `lights`/`circ`, bigints; anything under "Not reproduced" in C1 §9.2 |

## 7. Tasks (TDD: write the failing test, see it fail for the right reason, implement, see it pass, commit)

Run one file with `node --disable-warning=ExperimentalWarning --test tests/db.test.js`. Commit after each task with a conventional message (for example `feat(db): rooms (C1 §6.4)`), ending with the Co-Authored-By trailer your session gives you. Do not push. "Both" = shared test, run on the real db and the fake.

### Task 0: Preflight (no code)

| Check | Command | Expected |
|---|---|---|
| Node | `node --version` | v22.13 or newer (v22.20.0 here) |
| Wave 0 files | `ls server/db-common.js tests/fakes/db.js docs/contracts/db.md` | All exist. If one is missing, stop and report to the lead. |
| Test script | `node -p "require('./package.json').scripts.test"` | `node --disable-warning=ExperimentalWarning --test tests/*.test.js`. If not, report it; do not edit `package.json`. |
| Baseline | `npm test` | `# fail 0`. Note `# pass N`. |
| Vectors | `git status --porcelain tests/vectors` | Empty |

### Task 1: Open, schema, close

| Test | Target | Proves |
|---|---|---|
| `openDb(':memory:', { now })`: `db.path === ':memory:'`, `db.version === 1`. `openFakeDb({ now })`: the same. | both | C1 §6.3, §9.1 |
| `openDb(':memory:', { nope: 1 })` throws `TypeError('openDb: unknown field "nope"')`; `openFakeDb({ upgrades: [] })` throws `TypeError` | real; fake | C1 §1, §2.1, §9.1 |
| `openDb('<dir>/sub/farm.db')` (folder `sub` missing) creates folder and file. After `close()`, a raw `DatabaseSync` finds exactly the tables `rooms`, `room_settings`, `calibrations`, `crop_mixes`, `capacity_reports`, `readings`, `events`, `alarms`, `controller_state`, `schema_version` (names not starting with `sqlite_`), each with `strict = 1` in `pragma_table_list`; the indexes `room_settings_room`, `calibrations_room`, `capacity_reports_room`, `readings_room_t`, `events_room`, `alarms_room`, `alarms_open`; and `readings` columns (`pragma_table_info`) exactly `room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, fan, lights, circ, power_w, kwh`. A raw connection cannot see a `':memory:'` database, so this check uses a file. | real only | C1 §2.2 step 1, §3, §4 |
| `close()` twice does not throw; after `close()`, `getRoom(1)` and `listRooms()` throw `Error` with message `database is not open` | both | C1 §6.1, §6.3 |

Implement `openDb` steps 1 to 8, `UPGRADES = [{ version: 1, sql: <C1 §4 verbatim> }]`, `schema_version`, `path`, `version`, `close` and the closed guard.

### Task 2: Upgrades and file database (all real only)

| Test | Proves |
|---|---|
| A raw `DatabaseSync` on the closed file gives `PRAGMA journal_mode` = `wal` | C1 §2.2 step 3 |
| Open the file at T0, close, reopen at T0 + 100: a raw read of `schema_version` is exactly `[{ version: 1, applied_at: T0 }]` | No upgrade applied twice; `applied_at = now()` |
| `upgrades: [...UPGRADES, { version: 2, sql: 'CREATE TABLE extra_a (x INTEGER) STRICT;' }, { version: 3, sql: 'ALTER TABLE extra_a ADD COLUMN y INTEGER;' }]`: `db.version === 3`; raw reads show versions 1, 2, 3 and `extra_a` with columns `x`, `y` | Applied in order (3 needs 2) |
| On a new file, `upgrades: [...UPGRADES, { version: 2, sql: 'CREATE TABLE fk_probe (room_id INTEGER REFERENCES rooms (id)) STRICT; INSERT INTO fk_probe VALUES (999);' }]` throws `Error` matching `/^Schema upgrade 2 failed: /`. Reopening with the default list gives `version === 1`; raw reads show no `fk_probe` and only version 1 | `foreign_keys` is on before the upgrades (step 4); a failed upgrade leaves no trace; earlier ones stay |
| Open with the three-upgrade list, close, open with the default list: throws exactly `Error('The database <file> has schema version 3; this app knows up to 1. Use a newer version of the app.')` (`<file>` = the path given); raw reads still show max version 3 and `extra_a` | C1 §3 "Newer database" |
| Make the file with `openDb`, close, insert a room with raw SQL (`INSERT INTO rooms (name, volume, vent, created_at) VALUES ('x', 10, 'supply', 1)`), reopen: `currentSettings(id)` throws `NotFoundError('settings', id)` | C1 §6.5 |

### Task 3: Rooms (C1 §6.4), both

| Test | Proves |
|---|---|
| `createRoom({ name: 'A', volume: 60, vent: 'supply', settings: { spT: 18 } })` at T0 returns exactly `{ id, name: 'A', volume: 60, vent: 'supply', adapter: 'sim', created_at: T0, archived_at: null }`; `currentSettings(id)` is `{ id: <int>, room_id: id, saved_at: T0, note: 'Created', settings: { spT: 18 } }` | Defaults; first version in the same call |
| `adapter: 'hw'`, `note: 'x'`, `at: 5` are stored (`created_at` 5, `saved_at` 5, note `x`) | Explicit values |
| Without `settings`: throws 1299 and `listRooms({ includeArchived: true })` stays `[]` | NOT NULL; transaction leaves no room |
| `colour: 'red'` throws `TypeError('createRoom: unknown field "colour"')`, nothing stored | Unknown field |
| `listRooms()` is `id` ascending; after `archiveRoom(b)` it leaves out `b`, `{ includeArchived: true }` keeps it; `{ all: true }` throws `TypeError` | Order, filter, unknown field |
| `getRoom` of 999, `NaN`, `'1'` (room 1 exists) and `undefined` each throws `NotFoundError('room', <given>)` | C1 §1 "Ids" |
| `updateRoom` with `{ name: 'B' }`, `{ volume: 80 }`, `{ vent: 'exhaust' }` returns the changed `Room`; `{}` returns it unchanged; `{ archived_at: 5 }` throws `TypeError('updateRoom: unknown field "archived_at"')`; `{ vent: 'north' }` throws 275 and the room is unchanged | C1 §6.4 |
| `archiveRoom(id)` at T0 sets `archived_at: T0`; `archiveRoom(id, T0 + 50)` keeps T0; the archived room still accepts `getRoom` and `saveSettings` | Idempotent; archived rooms work |

### Task 4: Settings versions (C1 §6.5), both

| Test | Proves |
|---|---|
| `saveSettings(id, { settings: { spT: 20 } })` at T0 + 10 returns `{ id, room_id, saved_at: T0 + 10, note: null, settings: { spT: 20 } }`, now `currentSettings(id)` | Defaults; current = largest `id` |
| `note: 'n'`, `at: 7` are stored | Explicit values |
| `settingsHistory(id)` items have exactly the keys `id`, `saved_at`, `note`, newest first; `[0]` is current | Shape, order |
| `getSettingsVersion(id, v)` returns the version; a version of another room, `999` and `'1'` each throw `NotFoundError('settings', <given>)` | C1 §6.5 |
| `saveSettings(id, {})` throws 1299 and the history length is unchanged; `{ settings: {}, extra: 1 }` throws `TypeError` | Errors |

### Task 5: Readings, raw and latest (C1 §6.6), both

| Test | Proves |
|---|---|
| Full Reading `{ room_id, t, T: 18.5, RH: 88, CO2: 900, t_out: 31, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, fan: 2, lights: 1, circ: 0, power_w: 1400, kwh: 12.5 }`: `insertReading` returns `undefined`; `queryReadings(id, { from: t, to: t })[0]` and `latestReading(id)` each `deepStrictEqual` the input (plain object); passing that row back to `insertReading` works | `T` ↔ `temp`; round trip |
| `lights: true`, `circ: false` come back `1`, `0` | Booleans |
| `T: NaN`, `RH: Infinity`, `CO2: -Infinity`, and `t_out`, `rh_out`, `ac_setpoint`, `power_w`, `kwh` left out all come back `null` | Non-finite and missing values |
| Key `temp`, `rh`, `co2` or `n` each throws `TypeError('insertReading: unknown field "<key>"')` and stores nothing | Callers never use column names (LD 1) |
| `room_id` of another existing room throws `TypeError`, nothing stored; `room_id` left out works | `room_id` rule |
| Readings at `from − 1`, `from`, `to`, `to + 1`: the query returns only `from` and `to` | Inclusive range |
| Insert t = 300 (`T` 10), t = 100 (`T` 30), t = 200 (`T` 20): raw query returns `t` 100, 200, 300; then two rows at t = 400 with `T` 25 then `T` 15 come back in that insertion order | `ORDER BY readings.t, readings.rowid`, not temperature |
| t = 100 with `T` 30 and t = 200 with `T` 10: `latestReading` is the t = 200 row; add two rows at t = 300: it returns the one inserted last; a room without readings gives `null` | Largest `t`, ties by insertion |
| `RangeError` for `from: 1.5`, `to` left out, `from > to`, `step: 0`, `step: 1.5`, `step: -60`; `step: null` gives raw rows; `{ from, to, limit: 5 }` throws `TypeError` | C1 §6.6 errors |

### Task 6: Readings, buckets (C1 §6.6 "Bucket averaging"), both

Data (B = 1791446400, `step` 60): rows at B, B + 30 and B + 150. Bucket B + 60 has no row. Values are exact in binary, so the SQL `AVG` and the fake's JS average match.

| Field | B | B + 30 | B + 150 | Bucket B | Bucket B + 120 |
|---|---|---|---|---|---|
| `T` | 20 | `null` | 21 | 20 | 21 |
| `RH` | 80 | 90 | 85 | 85 | 85 |
| `CO2` | `null` | `null` | 900 | `null` | 900 |
| `ac_mode` | `cool` | `off` | `cool` | `off` (last) | `cool` |
| `ac_setpoint` | 18 | `null` | 18 | 18 | 18 |
| `fog` | 1 | 2 | 3 | 1.5 | 3 |
| `lights` | 1 | 0 | 1 | 0.5 | 1 |
| `kwh` | 1 | 1.25 | 2 | 1.25 (last) | 2 |

| Test | Proves |
|---|---|
| `queryReadings(id, { from: B, to: B + 300, step: 60 })` returns exactly two rows, `t` = B and B + 120, with the values above | Averages, nulls, last `ac_mode`/`kwh` with distinct `t`, empty bucket left out |
| A bucket row's sorted keys equal a raw row's sorted keys (no `n`) | Same shape (LD 1) |
| `from: B + 10` reports bucket `t` = B for the B + 30 row only (`T` `null`, `RH` 90) | Buckets align to multiples of `step` |
| Another room's readings are never included | `room_id` filter |

### Task 7: Events (C1 §6.7), both

| Test | Proves |
|---|---|
| `addEvent(id, { t: 5, level: 'warning', text: 'x' })` returns `{ id, room_id, t: 5, level: 'warning', text: 'x' }` | Shape |
| 101 events: `listEvents(id)` gives 100, `id` descending; `{ limit: 1000 }` gives 101; `{ before: <smallest id of page 1> }` gives the rest | Default limit, order, cursor |
| `before: null` equals left out; another room's events are not listed | Options |
| `RangeError` for `limit` 0, 1001, 1.5 and `before` 1.5, `'5'`; `{ offset: 1 }` throws `TypeError` | Errors |
| `level: 'debug'` throws 275; `text` left out 1299; `t: 1.5` 3091; nothing stored | Constraints |

### Task 8: Alarms (C1 §6.8), both

| Test | Proves |
|---|---|
| `raiseAlarm(id, { alarm_key: 'rhHi', level: 'warning', label: 'High humidity', at: 100 })` returns `{ id, room_id, alarm_key: 'rhHi', level: 'warning', label: 'High humidity', raised_at: 100, cleared_at: null, acked_at: null }` | Shape |
| Raising `rhHi` again (other label and level, `at` 150) returns the first row unchanged, no error; `listAlarms(id, { recent: 0 })` has one row | Idempotent raise (no 2067) |
| `clearAlarm(id, 'rhHi', 200)` returns the row with `cleared_at: 200`; a second clear returns `null`; raising at 300 makes a new row (new `id`) | Clear; new occurrence |
| `ackAlarm(id, 'rhHi', 400)` sets `acked_at: 400` on both rows and returns the newest; ack at 500 keeps 400; `ackAlarm(id, 'nope')` throws `NotFoundError('alarm', 'nope')` | Ack all unacknowledged rows; idempotent; error |
| `listAlarms`: open rows first (`raised_at` desc), then cleared (`cleared_at` desc), ties by larger `id`; with 21 cleared rows the default lists 20; `{ recent: 0 }` gives open rows only | Order, filter |
| `RangeError` for `recent` -1, 501, 1.5; `{ open: true }` throws `TypeError` | Errors |
| `level: 'info'` throws 275; `label` left out 1299 | Constraints |

### Task 9: Controller state and JSON (C1 §5, §6.9), both

| Test | Proves |
|---|---|
| `loadControllerState(id)` is `null` before any save | Default |
| `saveControllerState(id, { controller: { a: 1 } })` returns `undefined`; load gives `{ room_id, saved_at: now, controller: { a: 1 }, sim: null }`; a second save replaces it (new `saved_at`, `controller`, `sim`) | Shape; one row per room |
| `controller: { win: { min: Infinity, max: -Infinity }, x: NaN, list: [Infinity] }` loads with the same non-finite values (`Object.is`) | `$num` encoding |
| A real snapshot: `ClimateController.create(ClimateController.defaultSettings(), null, null)` run on `ClimateSim.create(structuredClone(ClimateSim.DEFAULT_ENV))` through `ClimateRuntime.simIO` and `createRuntime` for 120 s (`io.advance(1); rt.poll();`). The loaded `controller` `deepStrictEqual`s `fromJson(toJson(snapshot))` | C1 §5 "Comparing in tests" |
| `controller` left out throws 1299; `{ controller: {}, extra: 1 }` throws `TypeError` | Errors |

### Task 10: Calibrations (C1 §6.10), both

| Test | Proves |
|---|---|
| `saveCalibration(id, { ua: 90, inf_ach: 0.3, moist_buffer: 3, co2_per_block: 40 })` returns all 12 `Calibration` keys, `rmse_*`, `log_rows`, `applied_at` `null`, `run_at = now()` | Defaults |
| `rmse_t: NaN`, `rmse_rh: Infinity` stored as `null`; `log_rows: 1440` kept | Non-finite → null |
| `listCalibrations` is `run_at` desc, then `id` desc (two runs with equal `run_at`) | Order |
| `currentCalibration` is `null` before any apply. Apply A at 100, B at 200: B. Apply A at 300: A, and B keeps `applied_at` 200. Two runs applied at the same time: larger `id` | Current rule, history kept |
| `applyCalibration` without `at` uses `now()`; a run of another room, `999` and `'1'` each throw `NotFoundError('calibration', <given>)` | Clock, errors |
| `ua` left out throws 1299; `log_rows: 1.5` and `run_at: 1.5` throw 3091 | Constraints |

### Task 11: Crop mix (C1 §6.11), both

| Test | Proves |
|---|---|
| `getMix` is `[]` for a new room | Default |
| `replaceMix(id, [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2_per_block: 55 }, { crop: 'oyster', blocks: 10 }])` returns `[{ crop: 'oyster', blocks: 1200, co2_per_block: null }, …]` in the same order; `getMix` returns the same | `pos` order, default, duplicate crop allowed |
| `replaceMix(id, [])` empties the mix | Replace |
| Second row `blocks: 1.5` throws 3091; `blocks: -1` 275; `crop` left out 1299; each time `getMix` still returns the old mix | All or nothing |
| Second row with key `co2PerBlock` throws `TypeError('replaceMix: unknown field "co2PerBlock"')`; the old mix stays | Unknown field |

### Task 12: Capacity reports (C1 §6.12), both

| Test | Proves |
|---|---|
| `latestCapacityReport` is `null` for a new room | Default |
| `saveCapacityReport(id, { report: { verdict: 'good', utilisation: 74, runs: [], balance: { estimate: Infinity } } })` returns `{ id, room_id, run_at: now, verdict: 'good', utilisation: 74, report }`, with `report.balance.estimate` `Infinity` | Copies, JSON |
| `utilisation` left out, `NaN` or `Infinity` (with `verdict: 'impossible'`) gives `utilisation: null` | Not finite → null |
| `utilisation: 74.5` throws 3091; `verdict: 'ok'` 275; `report` left out 1299; nothing stored | Constraints, no rounding |
| After two saves the latest is the larger `id`; `run_at: 5` is kept | Latest, explicit `run_at` |
| `{ report: {…}, room: 1 }` throws `TypeError('saveCapacityReport: unknown field "room"')` | Unknown field |

### Task 13: Sweeps, both

| Test | Proves |
|---|---|
| A table of `[name, args]`: each of `getRoom`, `updateRoom`, `archiveRoom`, `saveSettings`, `currentSettings`, `settingsHistory`, `getSettingsVersion`, `insertReading`, `queryReadings`, `latestReading`, `addEvent`, `listEvents`, `raiseAlarm`, `clearAlarm`, `ackAlarm`, `listAlarms`, `saveControllerState`, `loadControllerState`, `saveCalibration`, `listCalibrations`, `applyCalibration`, `currentCalibration`, `getMix`, `replaceMix`, `saveCapacityReport`, `latestCapacityReport`, called with room 999 and otherwise valid arguments, throws `NotFoundError('room', 999)` | C1 §6.1 room check on reads and writes (so 787 never happens) |
| A table, one row per rule, each row breaking only that rule; `assertSql` plus "nothing stored". CHECK (275): `volume: 0`, `vent: 'north'`, `verdict: 'ok'`, `blocks: -1`, `ac_mode: 'auto'`, `fog: 4`, `fan: -1`, `lights: 2`, `circ: 2`, event `level: 'debug'`, alarm `level: 'info'`. NOT NULL (1299): room `name`, `volume: NaN`, `vent` left out, `settings` left out, reading `t`, `ac_mode`, `fog`, `fan`, `lights`, `circ` left out, event `text`, alarm `alarm_key` and `label`, calibration `ua`, mix `crop`, `report` left out, `controller` left out. Type (3091): reading `t: 1.5`, `fog: 1.5`, `fan: 1.5`, `t: 'abc'`, `T: 'abc'`, event `t: 1.5`, alarm `at: 1.5`, calibration `run_at: 1.5` and `log_rows: 1.5`, mix `blocks: 1.5`, `utilisation: 74.5` | C1 §8 "Constraint errors" and "`errcode` values" (LD 3) |
| Every left-out `at` or `run_at` (`createRoom`, `archiveRoom`, `saveSettings`, `raiseAlarm`, `clearAlarm`, `ackAlarm`, `saveControllerState`, `saveCalibration`, `applyCalibration`, `saveCapacityReport`) equals `now()`, with the clock moved between calls | C1 §8 "Clock" |

Never put `'abc'` in a column that also has a CHECK (`fog`, `volume`): it would break two rules.

### Task 14: Final verification

Run section 8, then commit. Report as section 11 says.

## 8. How to verify

| Step | Command | Expected |
|---|---|---|
| 1 | `node --disable-warning=ExperimentalWarning --test tests/db.test.js` | `# fail 0`; every shared test appears twice (`real: …`, `fake: …`) |
| 2 | `npm test` | `# fail 0`; `# pass` = Task 0 baseline + your tests; no `ExperimentalWarning` line |
| 3 | `git status --porcelain tests/vectors` and `git diff --stat $(git merge-base HEAD master) -- tests/vectors` | Both empty: the 8 recorded runs are unchanged |
| 4 | `git diff --name-only $(git merge-base HEAD master)...HEAD` | Exactly `server/db.js` and `tests/db.test.js` |
| 5 | `grep -n "require(" server/db.js` | Only `node:sqlite`, `node:fs`, `node:path`, `./db-common.js` |
| 6 | `node -e "const m=require('./server/db.js'); const d=m.openDb(':memory:'); console.log(Object.keys(m).sort().join(' '), m.NotFoundError===require('./server/db-common.js').NotFoundError, m.UPGRADES.length, Object.keys(d).filter(k=>typeof d[k]==='function').length)"` | `NotFoundError UPGRADES openDb true 1 29` (28 functions plus `close`; no `insertReadings`, no `getCalibration`) |
| 7 | Rough speed check (not a test): 10,000 `insertReading` calls on `':memory:'`, then `queryReadings` with `step: 900` over them | Each well under 1 s |

## 9. Done when

| # | Item |
|---|---|
| 1 | `server/db.js` exports exactly `openDb`, `NotFoundError` (the `server/db-common.js` class) and `UPGRADES` (one entry: version 1, the C1 §4 SQL verbatim) |
| 2 | The db object has exactly the C1 §6.3 to §6.12 members, with C1's names, arguments, shapes, defaults, orders and errors, all synchronous |
| 3 | Rows are plain objects; Reading keys are `T`, `RH`, `CO2` (column `temp` never leaves db.js); bucket rows have the raw row's keys |
| 4 | Raw and latest readings order by `readings.t`, then `rowid`; the bucket SQL is C1 §6.6 verbatim |
| 5 | JSON columns use `toJson`/`fromJson` from `server/db-common.js` |
| 6 | `createRoom`, `replaceMix` and each upgrade are all or nothing |
| 7 | node:sqlite errors reach the caller unchanged (`code`, `errcode`) |
| 8 | Calls after `close()` throw `Error('database is not open')`; a second `close()` does nothing |
| 9 | `tests/db.test.js` covers every row of C1 §8; shared tests pass on both targets; real-only tests pass |
| 10 | `npm test` green; `tests/vectors/` unchanged; only the two owned files changed; commits made, not pushed |

## 10. What NOT to do

| Do not | Why |
|---|---|
| Touch any file but `server/db.js` and `tests/db.test.js` (not `server/db-common.js`, `tests/fakes/db.js`, `package.json`, `docs/`, the shared modules, other tests, `tests/vectors/`) | File ownership (spec §6). Fake or contract problems go to the lead. |
| Run `npm run vectors` or `tools/make-vectors.js` | They rewrite `tests/vectors/` |
| Add npm dependencies, an ORM or query builder, ES modules or a build step | Spec; C1 §1 |
| Add `insertReadings`, `getCalibration`, a restore function, a delete, an un-archive, async functions, caches, row limits, extra exports or methods | C1 revision 4 is the whole API (YAGNI) |
| Rename any reading key other than `T` ↔ `temp`, or add a count field to bucket rows | LD 1 |
| Validate business rules (names, crops, volume limits, settings content) | Callers validate (C1 §1, LD 6); SQL constraints are the last guard |
| Catch, wrap or rename node:sqlite errors, or turn them into `TypeError`/`RangeError` | C3's fatal rule reads `errcode` (LD 3) |
| Round `utilisation`, fill in a missing `ac_mode`, or clamp a value | C1 §1, §6.12 |
| Create the demo room in `openDb` | C2 `start()` does it |
| Change the schema SQL, add columns, indexes or CHECKs, or add an upgrade 2 | Version 1 is exactly C1 §4 |
| Use `setReadBigInts` or return bigints | Ids and times are JS numbers |
| Weaken, skip or `todo` a test so it passes on the fake | Report the difference instead |
| Write report or summary files; push, merge or rebase onto `master` | The report is your final message; the lead merges |

## 11. When something does not fit

| Situation | Action |
|---|---|
| A shared test fails only on the fake while it follows C1 | Report the test name, C1 section and the fake's behaviour to the lead. Do not change the fake or the test. Continue with the other tasks. |
| C1 is silent or ambiguous | Pick the simplest reading, keep the detail out of shared tests, and list it in your report. Known: the `room_id` ≠ `roomId` message (class only); a non-array `rows` in `replaceMix` (undefined; not tested). |
| C1 seems wrong or impossible on Node 22 | Report it with a minimal reproduction; do not change the contract's behaviour. |
| A wave 0 file is missing or `package.json` lacks the test flag | Stop and report (Task 0) |

Final report (your last message): commits (hash and subject); `npm test` totals before and after; the result of each section 8 step; every contract question or fake mismatch with its C1 section.

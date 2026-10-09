# Work brief: Wave 2, Data 2 stream (C1 revision 6): `server/db.js` and `tests/db.test.js`

Revision 0, 2026-10-09 (C1 revision 6, C10 revision 2, `master` after prep 2.0). Stream: **Data 2** (wave 2). You are the implementer; reviewers check the work before the lead merges it at gate 2.5.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (here mainly 3, 18, 20, 23, 30, 33, 39, 50, 52, 54, 59, 61) | `docs/contracts/LEAD-DECISIONS.md` | They override the contracts and this brief |
| C1 revision 6 (database) | `docs/contracts/db.md` | Everything you build: sections 1, 2.2, 3, 4.2, 4.4, 4.5, 5, 6.1–6.14, 8, 9.2 |
| C10 revision 2, sections 3 and 14 (C1 rows) | `docs/contracts/harvest.md` | Upgrade 4 and `db.sqlite` |
| C9 revision 2, sections 6.1, 6.2 (read only) | `docs/contracts/air.md` | Upgrade 2 (on `master`; you do not change it) |
| Wave 2 plan, sections 2 (step 2b), 3 (Data 2 row), 3.1, 4, 5 | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Owned files, start checks, gate 2.5 |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/data-2.md` | Committed on `master` by the lead; you do not edit it |

When this brief and C1 disagree, C1 wins: follow C1 and report the difference (section 10).

## 1. Goal

| Outcome | Measure |
|---|---|
| Wave 2 schema | `UPGRADES` has four entries: 1 (released), 2 (C9, released), 3 = `SCHEMA_V3_ROOMS` (C1 4.4, verbatim), 4 = `SCHEMA_V4_HARVEST` from `require('./harvest-schema.js')` (C1 4.5, C10 3) |
| Version 4 | `db.version === 4`; a version 1 file gets upgrades 2, 3, 4 in one open; a version 2 file gets 3 and 4; a version 3 file gets 4 (C1 8) |
| One connection | `db.sqlite` is the `DatabaseSync` that `openDb` opened, read only, for `server/harvest-db.js` (C1 6.3, lead decision 61) |
| New Reading keys | `insertReading`, raw, latest and bucket queries carry `ac_fan`, `stage`, `core` (18 keys, C1 6.2, 6.6, lead decision 20) |
| New Calibration fields | `source`, `log_from`, `log_to`, `equipment` (C1 6.10, lead decisions 23, 50) |
| Simulation runs | `saveSimulationRun`, `listSimulationRuns`, `getSimulationRun`, `updateSimulationRun`, `deleteSimulationRun` with the summary columns of C1 6.13 |
| Room equipment | `getEquipment`, `saveEquipment` with the missing-field rule of C1 6.14 |
| Tests | Every row of C1 8 passes on the real db and, where shared, on the fake; no prep 2.0 skip left in `tests/db.test.js` |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/data-2` (`<worktree>` below), branch `stream/data-2`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm` (another developer's tree) or in another worktree. |
| Git | Keep the configured identity; never change `git config`. Plain commit messages such as `feat(db): …`, `test(db): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Never push, merge or rebase (`master` included). |
| Models | Implementer on Sonnet; reviewers on Opus (wave 2 plan 4) |
| Reviews | A spec-compliance review and a code-quality review before the lead merges |
| `master` stays green | The lead merges your branch at gate 2.5 step 1, and `master` must give `npm test` `# fail 0` between merges. Your branch tip must pass on its own: no test may need another stream's code |
| Contract questions | A gap or contradiction in C1: stop that part, report it to the lead, go on with the other tasks. Only the lead changes a contract |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/data-2` |
| `ls server/harvest-schema.js tests/fakes/db.js docs/contracts/db.md docs/contracts/harvest.md` | All four listed (the lead's prep 2.0 files) |
| `node -p "require('./server/harvest-schema.js').SCHEMA_V4_HARVEST.includes('CREATE TABLE harvest_crates')"` | `true` |
| `node -e "const d=require('./tests/fakes/db.js').openFakeDb(); console.log(d.version, d.sqlite, typeof d.saveSimulationRun, typeof d.saveEquipment)"` | `4 null function function` (the C1 revision 6 fake) |
| `grep -c "C1 rev 6 / C2 rev 9 fake" tests/db.test.js` | At least `1`: the prep 2.0 skips (plan step 2b measured them on `fake: open gives path and version`, `fake: insertReading: round trip, T <-> temp`, `fake: saveCalibration: defaults`). Write down the exact list and their number `K` |
| `node --version` | v22.13 or newer (v22.20.0 here) |
| `npm test 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `S0` |
| `git status --porcelain tests/vectors` | Empty |

Read C1 completely before task 1.

## 3. Owned files (the only files you may touch; wave 2 plan section 3, Data 2 row)

| File | Action | Content |
|---|---|---|
| `server/db.js` | Modify | Upgrades 3 and 4, `db.sqlite`, the C1 revision 6 functions and fields |
| `tests/db.test.js` | Modify | The C1 8 tests; remove every prep 2.0 skip |

| Not yours | Owner |
|---|---|
| `server/harvest-schema.js` (`SCHEMA_V4_HARVEST`) | Lead (prep 2.0), then nobody |
| `server/db-common.js`, `tests/fakes/db.js`, `tests/fake-db.test.js`, `tests/fakes/harvest-db.js` | Lead |
| `server/harvest-db.js`, `tests/harvest-db.test.js` | Harvest data (its test switches to `openDb(':memory:')` by itself once `UPGRADES` has version 4) |
| The README note about the one-time upgrade delay | Docs stream |
| Every other file, `docs/` and `tests/vectors/` included | Read only |

## 4. What you build against

| Source | What you take from it |
|---|---|
| C1 1 | General rules; booleans `air`, `lights`, `circ`; transactions: upgrades 2, 3, 4 each one transaction; one connection |
| C1 2.2 | The 8 steps of `openDb` (unchanged) |
| C1 3 | `UPGRADES` with four entries; upgrade 4's SQL comes from `require('./harvest-schema.js')`; db.js prepares no statement on `batches` or `harvest_crates`; the newer-database message |
| C1 4.2 | Meanings of the new columns and tables |
| C1 4.4 | `SCHEMA_V3_ROOMS`: copy the SQL block verbatim (comments included) into a constant |
| C1 4.5 | Upgrade 4: `{ version: 4, sql: SCHEMA_V4_HARVEST }`, the same string object `server/harvest-schema.js` exports |
| C1 5 | JSON columns: `calibrations.equipment`, `simulation_runs.inputs`, `simulation_runs.result` through `toJson` / `fromJson` |
| C1 6.1 | `NotFoundError` `what` `'simulation'` (`Unknown simulation <id>`) |
| C1 6.2 | `Reading` (18 keys, in order), `Calibration` (16 keys), `SimulationRunInfo`, `SimulationRun`, `Equipment` (9 keys, in order) |
| C1 6.3 | `db.version` 4; `db.sqlite`: the connection, read only (for example `Object.defineProperty(db, 'sqlite', { value: conn, enumerable: true, writable: false, configurable: false })`); closed by `db.close()` only |
| C1 6.6 | `insertReading` takes `ac_fan`, `stage`, `core`; the raw, latest and bucket SQL exactly as written there (the bucket query takes `ac_fan` and `stage` from the last row and averages `core`) |
| C1 6.10 | `saveCalibration` takes `source`, `log_from`, `log_to`, `equipment` |
| C1 6.13 | The five simulation run functions, the summary column table and the "Other kinds" row |
| C1 6.14 | `getEquipment`, `saveEquipment`; missing-field message, key order and check order |
| C1 8 | Every test row |
| C1 9.2 | What the fake reproduces; shared tests check only these behaviours |

| node:sqlite fact (Node 22.20) | What `server/db.js` does |
|---|---|
| Rows come back with a null prototype | Copy every returned row into a plain object |
| Binding `true`, `false` or `undefined` throws `ERR_INVALID_ARG_TYPE`; `Infinity` is stored as `Infinity` in a REAL column | Keep the one binding helper: `undefined` → `null`, booleans → `1`/`0`, non-finite → `null` |
| A named-parameter object with a key the SQL does not use throws `ERR_INVALID_STATE` | Pass exactly the parameters each statement uses |
| `prepare()` on a missing table throws | Prepare at step 8, after the upgrades. Never prepare on `batches` or `harvest_crates` (a version 3 file opened with `UPGRADES.slice(0, 3)` must open) |
| After `close()`, `conn.prepare(…)` throws `Error('database is not open')` (`code` `ERR_INVALID_STATE`) | `db.sqlite` needs no guard of its own |
| An INTEGER key compared with the text `'7'` matches row 7 | Before every lookup by id (`runId` included), require `Number.isInteger(id)`, else `NotFoundError` |
| `CHECK` → 275, `NOT NULL` → 1299, wrong type in a STRICT table → 3091 | Let them propagate unchanged |

## 5. Test helpers and layout (`tests/db.test.js`)

| Item | Rule |
|---|---|
| Two targets | The existing `TARGETS` and `both(name, fn)` (`real: <name>`, `fake: <name>`). A "real only" test is a plain `test('real: …')`. Keep this layout |
| Requires | Add only `require('../server/harvest-schema.js')` if a test compares `UPGRADES[3].sql` with `SCHEMA_V4_HARVEST`. No `harvest-db.js`, no `equipment.js`, no other stream's file |
| Clock | `T0 = 1791446400` (multiple of 60, 900, 3600), as now |
| Existing helpers | `assertNotFound`, `assertSql`, `roomInput`, `reading`, `calibRun`, `report`, `makeRoom`, `tmpFile`, `writeVersion1File` (keep; C1 8 names the last one) |
| New factory `simRun(over)` | `Object.assign({ kind: 'cycle', inputs: { mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }], settings: { airM3h: 1800 }, region: 'my-lowland', tariff: 0.57, volume: 60, calibration: null, empty_below: null, equipment: null }, result: { verdict: 'ok', totals: { days: 83, kwh: 1093.4, rm: 623.2, rmPerBlock: 0.31, pass: true }, stages: [], series: [] } }, over)` (db.js checks none of the JSON; this is only a realistic shape) |
| New factory `equipment(over)` | `Object.assign({ ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 }, over)` |
| New helper `writeVersion2File(file)` | Raw `DatabaseSync` (not `openDb`, which prepares the statements of the current schema): `PRAGMA foreign_keys = ON`; `CREATE TABLE schema_version …` (the C1 3 text); `exec(UPGRADES[0].sql)`; `exec(UPGRADES[1].sql)`; rows `(1, T0 − 86400)` and `(2, T0 − 3600)`; then by SQL one room (`INSERT INTO rooms (id, name, volume, adapter, created_at) VALUES (1, 'Room 1', 60, 'sim', T0 − 86400)`), one reading (15 version 2 columns, `air` 1) and one calibration (the 12 version 1 columns) |
| Raw checks of `':memory:'` | A second connection cannot see an in-memory database; read it through `db.sqlite` (the same connection) |
| Never assert in shared tests | Which row gives `ac_mode`, `kwh`, `ac_fan`, `stage` when two readings share a bucket's largest `t`; node:sqlite message texts; anything under "Not reproduced" in C1 9.2; the order of checks inside one error class beyond C1 6.14's "Order of the checks"; `listSimulationRuns` with `before: 0` (C1 does not define it) |
| `K` | The number of prep 2.0 skips found by the start check |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, then build, then see it pass, then commit)

Run one file with `node --disable-warning=ExperimentalWarning --test tests/db.test.js`. "Both" = `both(…)`, two registered tests. A new shared test for a function the fake already has fails only on `real: …` at first; that is the failure to see.

| # | Test(s) first (exact names) | Then build | Proves |
|---|---|---|---|
| 0 | – | Section 2 checks. No commit | The start tree |
| 1 | Change (keep the names): **`open gives path and version`** (both; `db.version === 4`; remove its prep skip); **`real: openDb(path, null) is treated as no options`** (`version` 4); **`real: opening a file creates the folder, schema and indexes`** (tables, all `strict = 1`: `alarms`, `batches`, `calibrations`, `capacity_reports`, `controller_state`, `crop_mixes`, `events`, `harvest_crates`, `readings`, `room_equipment`, `room_settings`, `rooms`, `schema_version`, `simulation_runs`; indexes `alarms_open`, `alarms_room`, `batches_room`, `calibrations_room`, `capacity_reports_room`, `events_room`, `harvest_crates_batch`, `readings_room_t`, `room_settings_room`, `simulation_runs_room`; `readings` columns `room_id, t, temp, RH, CO2, t_out, rh_out, ac_mode, ac_setpoint, fog, air, lights, circ, power_w, kwh, ac_fan, stage, core`; `rooms` columns as now); **`real: reopening a file applies no upgrade twice`** (rows `{1, T0}`, `{2, T0}`, `{3, T0}`, `{4, T0}`); **`real: upgrades apply in order`** (test upgrades 5 and 6 after `UPGRADES`; `version` 6; rows 1–6; `extra_a` with `x`, `y`); **`real: a failed upgrade leaves no trace; earlier upgrades stay`** (failing upgrade 5, message `/^Schema upgrade 5 failed: /`; reopened `version` 4; rows 1–4; no `fk_probe`); **`real: a database newer than the app throws and changes nothing`** (test upgrades 5 and 6; message exactly `` `The database ${file} has schema version 6; this app knows up to 4. Use a newer version of the app.` ``); in **`real: upgrade 2 turns fan 0-3 into air 0/1 and drops rooms.vent (C9 6.2)`** and **`real: a failed upgrade 2 leaves the version 1 file as it was, and the next open upgrades it`** only the version asserts (`db.version` 4; `schema_version` rows 1, 2, 3, 4 with `applied_at` `T0 − 86400`, `T0`, `T0`, `T0`; the 18 `readings` columns): the row shape follows in task 2. New: **`real: open ':memory:' has the version 4 schema`** (C1 8 row "Open `':memory:'`", read through `db.sqlite`: the 14 tables and 10 indexes above; `calibrations` has `source`, `log_from`, `log_to`, `equipment`; `readings` has `air` and no `fan`; `rooms` has no `vent`; `PRAGMA foreign_keys` is 1; `schema_version` versions 1–4; `batches` and `harvest_crates` are empty); **`real: db.sqlite is the connection and cannot be replaced`** (`db.sqlite instanceof DatabaseSync`; `db.sqlite.prepare('SELECT COUNT(*) AS n FROM batches').get().n === 0`; `db.sqlite = null` throws `TypeError` (the file is `'use strict'`) and `db.sqlite` is unchanged; after `db.close()`, `db.sqlite.prepare('SELECT 1')` throws with message `database is not open`) | `SCHEMA_V3_ROOMS` (C1 4.4 verbatim); `UPGRADES = [{1, SCHEMA_V1}, {2, SCHEMA_V2_AIR}, {3, SCHEMA_V3_ROOMS}, {4, SCHEMA_V4_HARVEST}]` with `SCHEMA_V4_HARVEST` from `require('./harvest-schema.js')`; `db.sqlite` (read only). Commit `feat(db): upgrades 3 and 4, db.sqlite (C1 3, 4.4, 4.5, 6.3)` | C1 3, 4.4, 4.5, 6.3; C1 8 rows "Open `':memory:'`", "Open a temporary file", "Upgrades" |
| 2 | Change: **`insertReading: round trip, T <-> temp`** (both; remove its prep skip; the full Reading has the 18 keys in C1 6.2 order, with `ac_fan: 'auto'`, `stage: 'fruiting'`, `core: 22.5`; `queryReadings` and `latestReading` deep-equal it; passing the row back works); **`insertReading: booleans come back 0/1`** (both; add `air: true` → 1 and `air: false` → 0); **`insertReading: unknown field throws and stores nothing`** (both; add `fan` to the key list: `insertReading: unknown field "fan"`); the row-shape asserts of the two upgrade 2 tests of task 1 (the 18 keys, `ac_fan`, `stage`, `core` `null`). New: **`insertReading: ac_fan, stage and core left out are null`** (both); **`insertReading: ac_fan max is 275, core abc is 3091, nothing stored`** (both; `latestReading` stays `null`); **`queryReadings: bucket ac_fan and stage from the last row, core averaged`** (both; `step` 60, rows at B = `T0`, B + 30, B + 150 with `ac_fan` `'low'`, `'high'`, `null`, `stage` `'pinning'`, `'fruiting'`, `'fruiting'`, `core` 20, `null`, 22: bucket B has `ac_fan` `'high'`, `stage` `'fruiting'`, `core` 20; bucket B + 120 has `ac_fan` `null`, `stage` `'fruiting'`, `core` 22) | Reading keys and columns in the insert statement, `READING_KEYS`, and the raw, latest and bucket SQL exactly as C1 6.6. Commit `feat(db): readings carry ac_fan, stage and core (C1 6.6)` | C1 6.2, 6.6; C1 8 rows "Readings", "Readings, `air`", "Readings, upgrade 3 keys" |
| 3 | New, real only: **`real: upgrade 3 from version 2`** (`writeVersion2File`, then `openDb(file, { now: () => T0 })` with the default list: `version` 4; `schema_version` gains rows 3 and 4 with `applied_at` `T0`; the old reading comes back with its 15 values and `ac_fan`, `stage`, `core` `null`; the old calibration with `source`, `log_from`, `log_to`, `equipment` `null`); **`real: upgrades 1 to 4 in one open`** (`writeVersion1File`, default list: `version` 4; rows 1, 2, 3, 4; readings `air` 0, 1, 1, 1 and `ac_fan`, `stage`, `core` `null`; `batches` and `harvest_crates` exist and are empty); **`real: upgrade 4 from version 3`** (`openDb(file, { now: () => T0, upgrades: UPGRADES.slice(0, 3) })` gives `version` 3; `createRoom(roomInput())`; close; reopen with the default list: `version` 4; row 4 added; `getRoom` deep-equals the room before; `batches` and `harvest_crates` exist and are empty) | Nothing new should be needed; fix what fails. Commit `test(db): upgrades from version 1, 2 and 3 files (C1 8)` | C1 3, 8 rows "Upgrade 3 from version 2", "Upgrade 1 to 4 in one open", "Upgrade 4 from version 3"; C10 3 "Old databases" |
| 4 | Change: **`saveCalibration: defaults`** (both; remove its prep skip; the 16 keys of C1 6.2 with `source`, `log_from`, `log_to`, `equipment` `null`). New: **`saveCalibration: source, log_from, log_to, equipment stored and returned`** (both; `source: 'history'`, `log_from` `T0 − 3600`, `log_to` `T0`, `equipment: equipment()` comes back parsed and deep-equal, with `air_m3h`; `listCalibrations`, `applyCalibration` and `currentCalibration` return the same fields); **`saveCalibration: source web is 275; a fraction in log_from is 3091; nothing stored`** (both) | `saveCalibration` and every Calibration read with the four fields; `equipment` through `toJson` / `fromJson`. Commit `feat(db): calibration source, history range and machines (C1 6.10)` | C1 6.10; C1 8 row "Calibrations, upgrade 3 fields" |
| 5 | New (all both): **`saveSimulationRun: cycle summary columns`** (a passing cycle: `verdict` `'pass'`, `blocks` 2000, `days` 83, `kwh` 1093.4, `rm` 623.2, `utilisation` `null`, `real_start` `null`, `note` `null`, `created_at` `T0`; `totals.pass: false` → `'fail'`; `result: { verdict: 'impossible', why: 'x' }` → `'impossible'` with `days`, `kwh`, `rm` `null`; the reply is a `SimulationRun`: the 13 info keys of C1 6.2 in order plus `result`); **`saveSimulationRun: capacity and equipment summary columns`** (capacity `result: { verdict: 'good', utilisation: 74, runs: [] }` → `verdict` `'good'`, `utilisation` 74, `days`, `kwh`, `rm` `null`; equipment `result: { verdict: 'ok', ac: { verdict: 'too-small' } }` → `verdict` `'too-small'`, `days`, `kwh`, `rm`, `utilisation` `null`; equipment `result: { verdict: 'impossible', why: 'x' }` → `'impossible'`; mix `[{ blocks: 1200 }, { blocks: 300 }]` → `blocks` 1500; empty mix → 0); **`saveSimulationRun: kind and verdict CHECKs, nothing stored`** (`kind: 'capacity'` with `result.verdict` `'pass'` → 275; `kind: 'equipment'` with `result.ac.verdict` `'pass'` → 275; `kind: 'heat'` with `result.verdict` `'good'` → 275; `kind: 'equipment'` with no `ac` → 1299; capacity `utilisation: 74.5` → 3091; `inputs` left out → 1299; `listSimulationRuns` stays `[]`); **`saveSimulationRun: note, real_start, at, Infinity in result, unknown field`** (`note: 'n'`, `real_start: T0`, `at: 5` stored, `created_at` 5; `result.x = Infinity` comes back `Infinity` from `getSimulationRun`; `{ …, colour: 1 }` → `TypeError('saveSimulationRun: unknown field "colour"')`, nothing stored); **`listSimulationRuns: newest first, limit, before, no result`** (51 runs: default 50, `id` descending; `{ limit: 200 }` gives 51; `{ before: <smallest id of page 1> }` the rest; `before: null` equals left out; no item has `result`; another room's runs are not listed); **`listSimulationRuns: errors`** (`RangeError` for `limit` 0, 201, 1.5 and `before` 1.5, `'5'`; `{ offset: 1 }` → `TypeError`); **`getSimulationRun: result included; other room and bad ids throw NotFoundError(simulation)`** (a run of another room, `999`, `'1'`, `NaN` each `assertNotFound(…, 'simulation', <given>)`); **`updateSimulationRun: note and real_start`** (each changes alone, `{}` changes nothing, the reply is a `SimulationRunInfo`; `{ kind: 'x' }` → `TypeError('updateSimulationRun: unknown field "kind"')`; `real_start: 1.5` → 3091 and nothing changes; unknown run → `NotFoundError('simulation')`); **`deleteSimulationRun: returns the info read before, then NotFoundError(simulation)`** | The five functions of C1 6.13 with the summary table and the "Other kinds" row; `NotFoundError('simulation', id)`. Commit `feat(db): simulation runs (C1 6.13)` | C1 6.13; C1 8 row "Simulation runs" |
| 6 | New (all both): **`getEquipment: null for a new room; save then get; a second save replaces`** (save returns the 9 keys of C1 6.2 in order with `saved_at` `T0` (or `at`); `getEquipment` deep-equals it; a second save with `ac_hp` 3 replaces the one row); **`saveEquipment: CHECK and type rules, nothing stored`** (`ac_hp: 1.25` → 275; `ac_units: 5` → 275; `air_m3h` 40 and 10001 → 275; `walls: 'pu50', roof: null` → 275; `roof: 'brick115', walls: 'brick115'` → 275; `ac_units: 1.5` → 3091; `ac_hp: 'x'` → 3091; `air_m3h: 'x'` → 3091; after each, `getEquipment` is still `null`; then `air_m3h` 50 and 10000 are stored); **`saveEquipment: fan_m3h is an unknown field`** (`{ ...equipment(), fan_m3h: 900 }` minus `air_m3h` → `TypeError('saveEquipment: unknown field "fan_m3h"')`, nothing stored); **`saveEquipment: missing field message and order`** (left-out `height` → `TypeError('saveEquipment: missing field "height"')`; `height: undefined` → the same; `fog_lph` and `height` left out → names `fog_lph`; `walls: null, roof: null` is not missing and is stored; unknown room → `NotFoundError('room', 999)` before the field checks; after each error `getEquipment` is still `null`) | `getEquipment`, `saveEquipment` (`INSERT … ON CONFLICT (room_id) DO UPDATE SET` every column); check order: room, unknown fields, missing fields, write. Commit `feat(db): room equipment (C1 6.14)` | C1 6.14; C1 8 rows "Equipment", "Equipment, missing field" |
| 7 | Change (keep the names): **`every function throws NotFoundError(room) for an unknown room`** (add `saveSimulationRun`, `listSimulationRuns`, `getSimulationRun`, `updateSimulationRun`, `deleteSimulationRun`, `getEquipment`, `saveEquipment` with otherwise valid arguments); **`constraint rules: one row per rule, nothing stored`** (add one row per C1 9.2 rule of upgrade 3: CHECK 275 for `ac_fan: 'max'`, calibration `source: 'web'`, a cycle run with `result.totals.days: 0`, a run whose mix has `blocks: -1`, equipment `height: 7`; type 3091 for `core: 'abc'`, calibration `log_to: 1.5`, a cycle run with `result.totals.days: 1.5`, `real_start: 1.5`, equipment `at: 1.5`; `stage` has no `CHECK` and gets no row; and the "nothing stored" asserts for `listSimulationRuns` and `getEquipment`); **`left-out at/run_at equals now(), clock moved between calls`** (add `saveSimulationRun` → `created_at`, `saveEquipment` → `saved_at`); **`rows of every shape are plain objects`** (add a `SimulationRunInfo`, a `SimulationRun` and an `Equipment`); **`createRoom: vent is an unknown field (C9 6.1)`** (add: the stored Room has exactly the 6 keys of C1 6.2) | Fix what fails. Commit `test(db): sweeps cover the C1 revision 6 functions` | C1 6.1, 8 rows "Each function", "Constraint errors", "`errcode` values", "Clock", "Rooms, no `vent`" |
| 8 | – | Section 7; commit if anything changed; report (section 10) | – |

| Point | Rule |
|---|---|
| New registered tests | Tasks 1–6 add 23 test ids: 5 real only (tasks 1 and 3: 2 + 3) and 18 shared (36 registered tests), so **41** new registered tests. The `K` prep skips become passing tests (they are rewritten, not removed) |
| Prep skips | Remove the `skip` of each prep 2.0 test as you rewrite it (tasks 1, 2, 4). If step 2b changed `both()` or added a separate fake-only test, undo that change so `both()` is again the plain helper of section 5 |
| No other stream | `tests/db.test.js` must pass on this branch alone: the fake already has every C1 revision 6 function (prep 2.0); never require `server/harvest-db.js`, `equipment.js` or a web file |
| Error checks | `assert.throws(fn, { name: 'TypeError', message: '…' })` with the exact text; constraint errors with `assertSql` (never the message) |

## 7. How to verify

| Name | Shell |
|---|---|
| `MB` | `MB=$(git merge-base HEAD master)` |

| Command | Expected |
|---|---|
| `node --disable-warning=ExperimentalWarning --test tests/db.test.js` | `# fail 0`, `# skipped 0`; every shared test appears twice (`real: …`, `fake: …`) |
| `npm test 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` | `# fail 0`; `# pass` = `N0` + 41 + `K`; `# skipped` = `S0` − `K`; no `ExperimentalWarning` line |
| `grep -c "C1 rev 6 / C2 rev 9 fake" tests/db.test.js` | `0` |
| `node --disable-warning=ExperimentalWarning -e "const m=require('./server/db.js'),{DatabaseSync}=require('node:sqlite'),d=m.openDb(':memory:');console.log(Object.keys(m).sort().join(' '),m.NotFoundError===require('./server/db-common.js').NotFoundError,m.UPGRADES.map(u=>u.version).join(','),m.UPGRADES[3].sql===require('./server/harvest-schema.js').SCHEMA_V4_HARVEST,d.version,d.sqlite instanceof DatabaseSync,Object.keys(d).filter(k=>typeof d[k]==='function').length)"` | `NotFoundError UPGRADES openDb true 1,2,3,4 true 4 true 36` (the 28 wave 1 functions, the 7 of C1 6.13 and 6.14, and `close`) |
| `grep -n "require(" server/db.js` | Only `node:sqlite`, `node:fs`, `node:path`, `./db-common.js`, `./harvest-schema.js` |
| `grep -c -e "FROM batches" -e "INTO batches" -e "harvest_crates" server/db.js` | `0` (db.js has no statement on the upgrade 4 tables; the SQL text is in `server/harvest-schema.js`) |
| `node -e "const s=require('fs').readFileSync('server/db.js','utf8');console.log(s.includes('CREATE TABLE room_equipment ('), s.includes(\"ALTER TABLE readings ADD COLUMN ac_fan TEXT CHECK (ac_fan IN ('low', 'auto', 'high'));\"))"` | `true true` (spot check of the verbatim C1 4.4 copy; the reviewer diffs the whole block against C1 4.4) |
| `git diff --name-only $MB` | Exactly `server/db.js` and `tests/db.test.js` |
| `git status --porcelain tests/vectors` and `git diff --stat $MB -- tests/vectors` | Both empty |
| `git log --format=%B $MB..HEAD \| grep -ci co-authored` | `0` |
| `git branch --show-current` | `stream/data-2` |
| `git status --short` | Empty |
| Rough speed (not a test): 10,000 `insertReading` calls on `':memory:'`, then `queryReadings` with `step: 900` | Each well under 1 s |

## 8. Done when

| # | Item |
|---|---|
| 1 | `server/db.js` exports exactly `openDb`, `NotFoundError` (the `server/db-common.js` class) and `UPGRADES` (versions 1, 2, 3, 4; 1 and 2 unchanged; 3 the C1 4.4 SQL verbatim; 4 the `SCHEMA_V4_HARVEST` of `server/harvest-schema.js`) |
| 2 | `db.version` is 4; `db.sqlite` is the open `DatabaseSync`, read only, closed only by `db.close()` |
| 3 | The db object has exactly the members of C1 6.3–6.14 (36 functions with `close`, plus `path`, `version`, `sqlite`), all synchronous, with C1's names, arguments, shapes, defaults, orders and errors |
| 4 | Readings carry the 18 keys of C1 6.2; the raw, latest and bucket SQL are C1 6.6 verbatim |
| 5 | Calibration, simulation run and equipment shapes, the summary columns and the missing-field rule follow C1 6.10, 6.13, 6.14 |
| 6 | Every row of C1 8 has a passing test; shared tests pass on both targets; real-only tests pass |
| 7 | No prep 2.0 skip is left in `tests/db.test.js`; `both()` is the plain helper |
| 8 | `npm test` `# fail 0` with the counts of section 7; `tests/vectors/` unchanged; only the two owned files changed; committed on `stream/data-2` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit upgrades 1 or 2, or change a word of the C1 4.4 SQL | Released upgrades are never edited (C1 3); upgrade 3 is frozen as written |
| Write the upgrade 4 SQL into `server/db.js`, or prepare a statement on `batches` or `harvest_crates` | C1 3 and 4.5: the text belongs to `server/harvest-schema.js`; the tables belong to `server/harvest-db.js` (C10 5); a version 3 file must still open |
| Add harvest functions to the db object | C1 4.2: db.js has no function on the upgrade 4 tables |
| Replace or close `db.sqlite` anywhere but `db.close()`, or open a second connection | Lead decision 61: one connection |
| Touch any file but the two owned ones (not `server/harvest-schema.js`, the fakes, `docs/`, the README) | File ownership (wave 2 plan 3.1); fake or contract problems go to the lead |
| Run `npm run vectors` or `tools/make-vectors.js` | They rewrite `tests/vectors/` |
| Validate business rules (crop names, verdict meaning, equipment sizes) | Callers validate (C3 7); the SQL constraints are the last guard |
| Catch, wrap or rename node:sqlite errors | C3's fatal rule reads `errcode` (lead decision 3) |
| Round `utilisation`, fill in a missing `verdict`, or default a missing Equipment field | C1 6.13, 6.14 |
| Weaken, skip or `todo` a test so it passes on the fake | Report the difference instead |
| Merge or rebase `master`, push, write report files | The lead merges; the report is your final message |

## 10. Report to the lead (your final message)

| Item | Content |
|---|---|
| Commits | `git log --oneline $MB..HEAD` |
| Counts | `N0`, `S0`, `K` and the prep skip list found at the start; `# pass`, `# fail`, `# skipped` at the end |
| Checks | The result of each row of section 7 (the `node -e` line pasted) |
| Fake mismatches | Each shared test that failed only on the fake while it followed C1: test name, C1 section, the fake's behaviour (do not change the fake) |
| Contract questions | Every gap or contradiction with its C1 section |

## 11. Change log

| Revision | Date | Changes |
|---|---|---|
| 0 | 2026-10-09 | First brief: C1 revision 6 (upgrade 3 after C9's upgrade 2), C10 14 C1 rows (upgrade 4, `db.sqlite`, version 4), wave 2 plan Data 2 row |

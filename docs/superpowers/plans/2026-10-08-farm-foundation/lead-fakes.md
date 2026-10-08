# Work brief: Wave 0 (lead), shared modules, stubs and contract fakes

Stream: `lead-fakes`. Date: 2026-10-08. Repo: `mushroom-farm` (plain JavaScript, CommonJS, no build step, no npm dependencies, Node.js 22.13 or newer; this machine has 22.20).
Binding sources, in this order: `LEAD-DECISIONS.md` (lead decisions 1–7), then the frozen contracts in `docs/contracts/`, then this brief. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`, section 6.

## 1. Goal

Build the wave 0 files that let the wave 1 streams (Data, Rooms, API, Web split) each work alone in their own worktree, without the others' code:

| Deliverable | Contract | Used in wave 1 by |
|---|---|---|
| `server/db-common.js` (`NotFoundError`, `toJson`, `fromJson`) | C1 section 5.1 | Data (`server/db.js`), the fake db, the API |
| `server/rooms-common.js` (`RoomError`, `DEMO_ROOM`, `FIRST_NOTE`, `cleanSettings`) | C2 sections 6.2, 6.3 | Rooms (`server/rooms.js`), the fake room manager, the API |
| `tests/fakes/db.js` (`openFakeDb`): in-memory C1 db | C1 section 9 | Rooms, API, Data (`tests/db.test.js` runs every test against it too) |
| `tests/fakes/rooms.js` (`createFakeRoomManager`): fake C2 room manager | C2 section 16 | API (`tests/api.test.js`, `tests/stream.test.js`, the `server/main.js` stub test) |
| `tests/fakes/api-server.js` (`startFakeApi`): fake C3 HTTP server | C5 section 4.5 | Web split (`tests/web-api.test.js`); wave 2 web streams |
| Stubs `room-rules.js` and `web/rooms.js` | C5 sections 1.5, 1.6 | Every web stream (the script tags load) |
| `package.json` scripts and engines | C1 section 1, C3 section 2.2 | Every stream |

Other streams' tests depend on the fakes behaving exactly as the contracts say. Where a contract says "the fake reproduces", reproduce it exactly.

The lead decisions that shape this work (the lead gives you `LEAD-DECISIONS.md` with this brief; they override the contracts):

| # | Decision, as it applies here |
|---|---|
| 1 | One set of Reading keys everywhere: `room_id`, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `fan`, `lights`, `circ`, `power_w`, `kwh`. The fake db takes and returns exactly these; bucket rows have the same keys (no `n`). |
| 3 | The fake db's constraint errors carry `code: 'ERR_SQLITE_ERROR'` and node:sqlite's `errcode` (275 CHECK, 1299 NOT NULL, 3091 wrong type; 787 and 2067 cannot happen), so `(err.errcode & 0xff) === 19` holds for them as for the real db. |
| 6 | Outside settings never reach `ClimateController.applySettings`: `cleanSettings`, then `ClimateController.importSettings`, and only its `settings` result is stored. The fakes do the same. |
| 7 | The lead writes `tests/fakes/db.js`, `tests/fakes/rooms.js`, `tests/fakes/api-server.js`, `server/db-common.js`, `server/rooms-common.js` in wave 0. The fakes load only the common files, never `server/db.js` or `server/rooms.js`. |

## 2. Before you start

| Step | Command or action | Expected |
|---|---|---|
| 1 | Work only in your own git worktree (the lead made it from `master`). | `git status` is clean |
| 2 | `ls docs/contracts` | `api.md  db.md  rooms.md  web.md`. If any is missing, stop and report to the lead. |
| 3 | Read `LEAD-DECISIONS.md` and these contract sections in full: C1 `db.md` 1, 4, 5, 5.1, 6 (all), 9; C2 `rooms.md` 1, 2, 3, 4, 5.2, 6, 7, 8.5, 9.1, 9.2, 9.4, 10.2, 15, 16; C3 `api.md` 2.3, 4.1, 4.2, 9, 11, 12 (only to see what the API tests expect of the fakes); C5 `web.md` 1.1, 1.4, 1.5, 1.6, 4.5. | – |
| 4 | Read `controller.js` lines 930–977 (`importSettings`, `applySettings`, `SETTINGS_VERSION`, the global `ClimateController`). | – |
| 5 | `node --version` and `npm test` | `v22.20.0` (any ≥ 22.13); `# tests 93`, `# pass 93`, `# fail 0` |

## 3. Owned files (the only files you may create or change)

| File | New or changed | Content |
|---|---|---|
| `package.json` | Changed | Section 5.1 only |
| `room-rules.js` | New | C5 section 1.5 stub, exactly |
| `web/rooms.js` | New | C5 section 1.5 stub, exactly |
| `server/db-common.js` | New | C1 section 5.1 |
| `server/rooms-common.js` | New | C2 section 6.3 |
| `tests/fakes/db.js` | New | C1 section 9 |
| `tests/fakes/rooms.js` | New | C2 section 16 |
| `tests/fakes/api-server.js` | New | C5 section 4.5 |
| `tests/db-common.test.js` | New | Task 2 |
| `tests/rooms-common.test.js` | New | Task 3 |
| `tests/fake-db.test.js` | New | Tasks 4–7 |
| `tests/fake-rooms.test.js` | New | Task 8 |
| `tests/fake-api-server.test.js` | New | Task 9 (name fixed by C5 section 1.6) |

These test names do not clash with any wave 1 file (`tests/db.test.js`, `rooms.test.js`, `api.test.js`, `stream.test.js`, `config.test.js`, `room-rules.test.js`, `web-api.test.js`, `settings-diff.test.js`) or the lead's wave 3 `tests/api-real.test.js`.

## 4. Rules for every file

| Rule | Detail |
|---|---|
| Module format | CommonJS (`require`, `module.exports`); no `"type"` field. The two stubs use the browser wrapper of C5 section 1.4. |
| Requires allowed | `server/db-common.js`, `server/rooms-common.js`, `room-rules.js`, `web/rooms.js`: nothing. `tests/fakes/db.js`: `../../server/db-common.js`. `tests/fakes/rooms.js`: `../../controller.js`, `../../server/rooms-common.js`. `tests/fakes/api-server.js`: `node:http`, `node:fs`, `node:path`. Never `server/db.js`, `server/rooms.js`, `node:sqlite`, or any `web/` file (lead decision 7). |
| Controller | `require('../../controller.js')`, then call `globalThis.ClimateController.<name>(…)` at call time, never a copy taken at load (C2 section 1: tests wrap these functions with spies). |
| Synchronous | Every fake db function and fake room manager method is synchronous. Only `startFakeApi` and `FakeApi.close` return Promises. |
| Time | Integer seconds since 1970 UTC. Default clock `() => Math.floor(Date.now() / 1000)`. |
| Untrusted settings | Lead decision 6: settings from outside go `cleanSettings` → `ClimateController.importSettings`; only its `settings` result is stored. No wave 0 file calls `ClimateController.applySettings`. |
| No extras | No exports, options or behaviour beyond the contracts and this brief. |
| Style | Match the repo: 2-space indent, single quotes, semicolons, short comments only where the reason is not obvious. |

## 5. What to build

### 5.1 `package.json`, `room-rules.js`, `web/rooms.js`

| Item | Value |
|---|---|
| `scripts.start` | `node --disable-warning=ExperimentalWarning server/main.js` (fails until the API stream adds `server/main.js`) |
| `scripts.test` | `node --disable-warning=ExperimentalWarning --test tests/*.test.js` |
| `engines.node` | `">=22.13"` |
| Rest of `package.json` | Unchanged (`vectors`, `headless`, every other key) |
| `room-rules.js` | `(function (global) { 'use strict'; global.ClimateRoomRules = {}; })(typeof window !== 'undefined' ? window : globalThis);` |
| `web/rooms.js` | `(function (global) { 'use strict'; })(typeof window !== 'undefined' ? window : globalThis);` |

### 5.2 `server/db-common.js` and `server/rooms-common.js`

| Export | Contract |
|---|---|
| `NotFoundError` | C1 5.1: `class NotFoundError extends Error`, `constructor(what, id)`, `name = 'NotFoundError'`, `code = 'NOT_FOUND'`, `what`, `id`, `message` = `` `Unknown ${what} ${id}` `` |
| `toJson`, `fromJson` | C1 5.1, the exact one-line code given there |
| `RoomError` | C2 6.2: `class RoomError extends Error`, `constructor(code, message, details = [])`, sets `name = 'RoomError'`, `code`, `message`, `details` |
| `DEMO_ROOM` | `Object.freeze({ name: 'Room 1', volume: 60, vent: 'supply' })` |
| `FIRST_NOTE` | `'Created'` |
| `cleanSettings(settings, base?)` | C2 6.3. Returns `{ settings, warnings }`: a deep copy of `base` (absent: `{}`) with `settings` laid over it. Walking `Object.keys(settings)` (own keys, so a `"__proto__"` key from `JSON.parse` is seen): a key named `__proto__`, `constructor` or `prototype`, at any depth (inside arrays too), is left out with the warning `` `Setting "${path}" is not allowed: ignored.` `` (`path`: keys joined by `.`, array indexes as numbers, for example `rules.constructor`, `a.0.prototype`). A plain-object value whose key holds a plain object in the copy is merged key by key; any other value (arrays included) replaces it, as a cleaned deep copy. Every object and array in the result is new; neither argument is changed. |

### 5.3 `tests/fakes/db.js` (C1 section 9)

`module.exports = { openFakeDb }`. `openFakeDb(options?)` accepts only `now` (any other key, `upgrades` included: `TypeError('openFakeDb: unknown option "<key>"')`) and returns a new empty db with `path = ':memory:'`, `version = 1`, `close()` and the 28 functions of C1 sections 6.4–6.12 (no `insertReadings`, no `getCalibration`).

| Item | Fake behaviour |
|---|---|
| Storage | One array per table; one id counter per table with an `id`, from 1, never reused; an insertion sequence on readings (for ties). |
| Rows out | Fresh plain objects (`Object.prototype`), keys in the order of C1 section 6.2. Reading keys are `T`, `RH`, `CO2` (lead decision 1; the fake has no `temp` column). |
| Copies | Nothing stored shares an object with an argument or a result. JSON columns (`settings`, `report`, `controller`, `sim`) are stored as `toJson(value)` and returned as `fromJson(text)`. |
| All or nothing | A call that throws changes nothing; `createRoom` and `replaceMix` check every row before writing. |
| After `close()` | Every function throws `Error('database is not open')`; a second `close()` does nothing; `path` and `version` stay readable. |

Checks, in this order (C1 leaves the order open; tests break one rule at a time):

| # | Check | Error |
|---|---|---|
| 1 | The db is closed | `Error('database is not open')` |
| 2 | The room id matches a room (archived count; only `Number.isInteger` ids can match) | `NotFoundError('room', id)` |
| 3 | Each argument object (option objects and each `replaceMix` row included) has only its listed keys | `TypeError('<function>: unknown field "<key>"')` |
| 4 | `insertReading`: `room_id`, when present, equals `roomId` | `TypeError` (message free) |
| 5 | Query options of `queryReadings`, `listEvents`, `listAlarms` | `RangeError` naming the option |
| 6 | Column rules (next table) for every value the call would write | Constraint error |
| 7 | Sub-ids: `versionId`, `runId`, `alarmKey` | `NotFoundError('settings' / 'calibration' / 'alarm', id)` |

Column rules, applied to each value written, in this order. Constraint error shape (lead decision 3): `Object.assign(new Error('<message>'), { code: 'ERR_SQLITE_ERROR', errcode, errstr: 'constraint failed' })`; the message is free (for example `CHECK constraint failed: fog`).

| Step | Rule |
|---|---|
| 1 | `undefined` and `null` → NULL. In an INTEGER or REAL column (and `lights`, `circ`), `NaN`, `Infinity`, `-Infinity` → NULL. In a JSON column only `undefined` is NULL; anything else is stored as `toJson(value)` (so `null` is the text `null`). |
| 2 | `lights`, `circ`: `true` → 1, `false` → 0. |
| 3 | INTEGER or REAL column, not NULL, not `typeof 'number'` → `errcode` 3091. INTEGER column (and `lights`, `circ`) not `Number.isInteger` → 3091. |
| 4 | `NOT NULL` column with NULL → 1299. |
| 5 | `CHECK` fails → 275. |
| – | TEXT columns: non-strings are stored as given (not reproduced, C1 9.2). 787 and 2067 cannot happen (room check first; `raiseAlarm` returns the open row). |

| Function | Field | Kind | NOT NULL | CHECK |
|---|---|---|---|---|
| `createRoom` | `name` | TEXT | yes | – |
| | `volume` | REAL | yes | `> 0` |
| | `vent` | TEXT | yes | `supply`, `exhaust` |
| | `adapter` | TEXT (`undefined` → `'sim'`) | yes | – |
| | `settings` | JSON | yes | – |
| | `note` | TEXT (`undefined` → `'Created'`) | no | – |
| | `at` → `created_at` and `saved_at` | INTEGER (`undefined` → `now()`) | yes | – |
| `updateRoom` | `name`, `volume`, `vent` (each key given is written; `undefined` → NULL → 1299) | as `createRoom` | yes | as `createRoom` |
| `archiveRoom` | `at` → `archived_at` | INTEGER (`undefined` → `now()`) | – | – |
| `saveSettings` | `settings` | JSON | yes | – |
| | `note` | TEXT (`undefined` → NULL) | no | – |
| | `at` → `saved_at` | INTEGER (`undefined` → `now()`) | yes | – |
| `insertReading` | `t` | INTEGER | yes | – |
| | `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_setpoint`, `power_w`, `kwh` | REAL | no | – |
| | `ac_mode` | TEXT | yes | `off`, `cool`, `heat`, `dry`, `fan` |
| | `fog`, `fan` | INTEGER | yes | 0–3 |
| | `lights`, `circ` | boolean or INTEGER | yes | 0 or 1 |
| `addEvent` | `t` | INTEGER | yes | – |
| | `level` | TEXT | yes | `info`, `good`, `warning`, `serious`, `critical` |
| | `text` | TEXT | yes | – |
| `raiseAlarm` | `alarm_key`, `label` | TEXT | yes | – |
| | `level` | TEXT | yes | `warning`, `serious`, `critical` |
| | `at` → `raised_at` | INTEGER (`undefined` → `now()`) | yes | – |
| `clearAlarm`, `ackAlarm` | `at` → `cleared_at` / `acked_at` | INTEGER (`undefined` → `now()`) | – | – |
| `saveControllerState` | `controller` | JSON | yes | – |
| | `sim` | JSON (`undefined` → `null`) | no | – |
| | `at` → `saved_at` | INTEGER (`undefined` → `now()`) | yes | – |
| `saveCalibration` | `ua`, `inf_ach`, `moist_buffer`, `co2_per_block` | REAL | yes | – |
| | `rmse_t`, `rmse_rh`, `rmse_co2` | REAL | no | – |
| | `log_rows` | INTEGER | no | – |
| | `run_at` | INTEGER (`undefined` → `now()`) | yes | – |
| `applyCalibration` | `at` → `applied_at` | INTEGER (`undefined` → `now()`) | – | – |
| `replaceMix` (each row) | `crop` | TEXT | yes | – |
| | `blocks` | INTEGER | yes | `>= 0` |
| | `co2_per_block` | REAL | no | – |
| `saveCapacityReport` | `report` | JSON | yes | – |
| | `verdict` = `report?.verdict` | TEXT | yes | `good`, `tight`, `too-dense`, `too-empty`, `impossible` |
| | `utilisation` = `report?.utilisation` when a finite number (never rounded), else NULL | INTEGER | no | – |
| | `run_at` | INTEGER (`undefined` → `now()`) | yes | – |

Function details (everything else exactly C1 sections 6.3–6.12):

| Function | Fake detail |
|---|---|
| `listRooms(options?)` | Key `includeArchived`; by `id` |
| `updateRoom(id, changes)` | `{}` changes nothing; returns the Room after; `archived_at` is an unknown field |
| `archiveRoom(id, at?)` | Already archived: unchanged |
| `currentSettings`, `settingsHistory`, `getSettingsVersion` | Largest `id`; `{ id, saved_at, note }[]` by `id` desc; `NotFoundError('settings', versionId)` for a missing version or another room's |
| `insertReading` | Allowed keys: the 15 Reading keys of lead decision 1 (`temp`, `rh`, `co2`, `n` are unknown fields). Returns `undefined`. |
| `queryReadings(roomId, query)` | Keys `from`, `to`, `step`. `RangeError` when `from` or `to` is not an integer (missing included), `from > to`, or `step` is neither `null`/`undefined` nor an integer ≥ 1. Raw: `from ≤ t ≤ to`, by `t`, ties in insertion order. |
| Buckets (`step`) | Group by `b = Math.floor(t / step) * step`, one row per non-empty bucket by `b`. `t = b`; `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_setpoint`, `power_w`: mean of the non-null values, `null` when none; `fog`, `fan`, `lights`, `circ`: mean; `ac_mode`, `kwh`: those of the row with the largest `t` (ties: inserted last), as they are (so `kwh` can be `null`). Keys and order exactly a raw row's (no count). |
| `latestReading` | Largest `t`, ties inserted last; `null` when none |
| `listEvents(roomId, options?)` | `limit` default 100, integer 1–1000; `before` `null`/`undefined` = none, else an integer (`id < before`); else `RangeError`. By `id` desc. |
| `raiseAlarm` | After the column rules: an open row (`cleared_at === null`) of the key → return a copy of it unchanged |
| `clearAlarm` | Open row of the key gets `cleared_at = at`; `null` when none |
| `ackAlarm` | No row of the key → `NotFoundError('alarm', alarmKey)`; else every row of the key with `acked_at === null` gets `at`; returns the row with the largest `id` |
| `listAlarms(roomId, options?)` | `recent` default 20, integer 0–500 else `RangeError`. Open rows by `raised_at` desc, then the `recent` cleared rows by `cleared_at` desc; ties `id` desc. |
| `saveControllerState` / `loadControllerState` | One state per room, replaced; returns `undefined` / `{ room_id, saved_at, controller, sim }` or `null` |
| Calibrations | `saveCalibration` returns the row with `applied_at: null`; `listCalibrations` by `run_at` desc then `id` desc; `applyCalibration` → `NotFoundError('calibration', runId)` for a missing or another room's run; `currentCalibration`: largest `applied_at` (ties largest `id`) among applied runs, else `null` |
| `getMix` / `replaceMix` | `{ crop, blocks, co2_per_block }[]` in stored order (no `pos`); `replaceMix` replaces all rows and returns them |
| `saveCapacityReport` / `latestCapacityReport` | Keys `report`, `run_at`; returns `{ id, room_id, run_at, verdict, utilisation, report }`; latest = largest `id` or `null` |

### 5.4 `tests/fakes/rooms.js` (C2 section 16)

`module.exports = { createFakeRoomManager }`. `createFakeRoomManager({ db, now })`: `db` is a C1 db (normally `openFakeDb()`); `now` defaults to the clock of section 4. No loops, timer, adapter or controller. Errors are `RoomError` from `server/rooms-common.js` with C2 6.1 texts: `not_found` is `new RoomError('not_found', 'Room <id> not found', [])`; `bad_input` is `new RoomError('bad_input', 'Bad input', details)` with every broken rule in `details`.

| Member | Fake behaviour |
|---|---|
| `calls` | `{ method, args }[]`, `args` = the arguments exactly as passed (rest parameters, so `applySettings(id, s, undefined)` records 3). One entry per outside call of every public method except `on`, `off`, `setLive`, `emit`, pushed at entry before any check (a failed call is recorded; C3 tests assert "no C2 call" by an empty `calls`). Internal use (for example `list` building rooms) adds no entry. |
| `start()`, `stop()`, `tick()` | Recorded; do nothing |
| `get(id)` | `null` for a non-integer id or when `db.getRoom(id)` throws with `code === 'NOT_FOUND'` (other errors are thrown). Else `{ ...room, live }`: archived → `live: null`; otherwise a new object `{ reading: null, stage, crop, targets: null, status: null, alarms, running: true, error: null }` (`stage`, `crop` from `db.currentSettings(id).settings`; `alarms = db.listAlarms(id, { recent: 0 }).length`), then the room's `setLive` overrides applied with `Object.assign`. |
| `list()` | `db.listRooms().map(r => get(r.id))` |
| `create(input)` | A non-object `input` is `{}`; keys other than `name`, `volume`, `vent`, `settings` are ignored. Rules (C2 6.1, all together): `name` string, 1–60 after trimming; `volume` finite 5–5000; `vent` `supply`/`exhaust`; `settings` `undefined` (absent) or a plain object (not `null`, not an array). First settings (C2 9.4): `base = ClimateController.defaultSettings()` with `base.roomM3 = volume`. Absent → `settings = base`, `warnings = []`. Given → `{ settings: merged, warnings: dropped } = cleanSettings(input.settings, base)`, then `ClimateController.importSettings({ format: 'mushroom-climate-settings', version: ClimateController.SETTINGS_VERSION, settings: merged })` (a throw → `bad_input` `[err.message]`), `settings` = its `settings`, `warnings = dropped.concat(its warnings)`. Then `db.createRoom({ name: <trimmed>, volume, vent, adapter: 'sim', settings, note: FIRST_NOTE, at: now() })`. Emits, in order: `settings` `{ roomId, version: db.currentSettings(id), settings: version.settings, warnings, auto: false }`; `event` `{ roomId, event }` after `db.addEvent(id, { t: now(), level: 'info', text: 'Room created' })`; `room` `{ room: get(id) }`. Returns `{ room: get(id), warnings }`. A failed call stores and emits nothing. |
| `update(id, changes)` | `not_found`. A non-object `changes` is `{}`. `bad_input` together: archived (`room <id> is archived`), a key other than `name`, `volume`, `vent` (`unknown field "<key>"`), a broken rule of a given field. Then `db.updateRoom(id, <given fields, name trimmed>)`; emit `room`; return `get(id)`. (No restart: there is no loop.) |
| `archive(id)` | `not_found`. Already archived: return `get(id)`, emit nothing. Else `db.archiveRoom(id, now())`, `db.addEvent` `Room archived` (`info`, `now()`), emit `event`, emit `room`; return `get(id)` (`live: null`). |
| `restart(id)` | `not_found`; archived → `bad_input` `['room <id> is archived']`. No db write. Sets the overrides `running: true`, `error: null`; emit `room`; return `get(id)`. |
| `applySettings(id, settings, note?, options?)` | C2 9.2 steps 1–3 and 11. Step 1: `not_found`; `bad_input` together: archived, `settings` not a plain object (`settings must be an object`), `note` not a string/`null`/`undefined` or over 200 characters after trimming (`note must be text of at most 200 characters`). `base = db.currentSettings(id).settings`. Steps 2–3: `cleanSettings(settings, base)`, then `importSettings` of the merge as in `create` (throw → `bad_input`), `warnings = dropped.concat(imported)`. Step 11: `version = db.saveSettings(id, { settings: next, note: <trimmed, null when empty or absent>, at: now() })`; `db.addEvent` `Settings saved (version <version.id>)` plus `: <note>` when there is a note (`info`, `now()`), emit `event`; then emit `settings` `{ roomId, version, settings: version.settings, warnings, auto: false }`. Returns `{ settings: version.settings, warnings, version }`. `options` only goes into `calls`. |
| `ackAlarm(id, alarmKey)` | C2 10.2 steps 1–3 and 5. `not_found` (archived allowed); `alarmKey` not a non-empty string → `bad_input` `['alarmKey must be a non-empty string']`. `at = now()`; `pending` = rows of `db.listAlarms(id, { recent: 500 })` with this key and `acked_at === null`; `latest = db.ackAlarm(id, alarmKey, at)`, whose `NotFoundError` becomes `new RoomError('not_found', 'No alarm "<key>" in room <id>', [])`. If `pending` is not empty: `db.addEvent` `Acknowledged: <latest.label>` (`info`, `now()`), emit `event`, then one `alarm` `{ roomId, change: 'acked', alarm: { ...row, acked_at: at } }` per pending row. Return `latest`. |
| `on(name, fn)`, `off(name, fn)` | Listener lists per name; listeners run synchronously in the order added; a throw is caught and logged with `console.error`, and the others still run. |
| `emit(name, payload)` | Test helper: sends to the listeners as above. |
| `setLive(id, partial)` | Test helper: merges `partial` into the room's overrides; emits nothing. |

The fake never writes `Started`, `Stopped`, `Resumed …`, `Settings: …`, `Targets restored: …`, readings, raises or clears (C2 16, last table), and never calls `ClimateController.applySettings`.

### 5.5 `tests/fakes/api-server.js` (C5 section 4.5)

`module.exports = { startFakeApi }`. Implement C5 4.5 exactly: `startFakeApi({ retryMs = 3000, root } = {})` resolves to `{ url, requests, reply, emit, dropStreams, close }`.

| Item | Fake detail |
|---|---|
| Listen | `http.createServer`, `listen(0, '127.0.0.1')`; resolve on `listening`; `url` = `http://127.0.0.1:<port>` |
| Recording | Read the whole body, then push `{ method, path, query, body }` before answering (every request, file requests and `GET /api/stream` included). `path` = `req.url` up to `?`, not decoded. `query` = `Object.fromEntries(new URLSearchParams(<text after ?>))`, `{}` when none. `body`: empty → `null`; else `JSON.parse` of the text, or the text when it does not parse. |
| Order of answers | 1 `root` given, method `GET` or `HEAD`, path not starting with `/api/` → static file (next row; `reply` does not apply). 2 The most recently set `reply` whose method equals `req.method` and whose pattern equals the path (string) or tests true (RegExp); a later `reply` with the same method and an equal pattern replaces the earlier one. 3 The defaults of C5 4.5. |
| Static (`root`) | C3 section 9 exactly: `/` and `/index.html`; `/styles.css`; `/controller.js`, `/sim.js`, `/runtime.js`, `/capacity.js`, `/calib.js`, `/room-rules.js`; `/web/<path>` with the extensions `.js`, `.css`, `.html`, `.json`, `.svg`, `.png`, `.ico` and their `Content-Type`s. Query ignored. The path is decoded once; a failed decode, a NUL, a `\`, a `..` segment or a segment starting with `.` → 404; the file must lie inside `root/web/` for `/web/...`; a folder → 404. 200: the bytes, `Content-Type`, `Content-Length`, `Cache-Control: no-cache`; `HEAD`: same status and headers, no body. 404: `text/plain; charset=utf-8`, body `Not found`. |
| Reply bodies | Non-string → `JSON.stringify`, `Content-Type: application/json; charset=utf-8`. String → as it is, `text/plain; charset=utf-8`. `undefined` → empty body. |
| Default array routes | `GET` whose path matches `^/api/rooms(/[^/]+/(settings/history\|readings\|events\|alarms\|calibrations\|mix))?$` → 200 `[]` |
| Other defaults | Other `GET` under `/api/` → 200 `{}`. `POST`, `PUT`, `PATCH` under `/api/` → 200, the recorded body as JSON (`null` without a body). Anything else → 404 `{ "error": "Unknown route", "details": [] }`. |
| Stream | Default `GET /api/stream`: `writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store' })`, write `retry: <retryMs>\n\n` at once, keep `res` in a set, remove it on `req` `close`. Never `: ping`. |
| `emit(name, data)` | Writes `event: <name>\ndata: <JSON.stringify(data)>\n\n` to every open stream |
| `dropStreams()` | `res.end()` on each open stream; clear the set |
| `close()` | End every open stream, `server.close()`, then `server.closeAllConnections()` (Node's `fetch` keeps sockets alive); resolve when the server has closed |

## 6. Tasks (TDD)

For every task: write the tests, run `node --test tests/<file>` and see them fail for the expected reason (module missing or wrong behaviour), implement, run until green, run `npm test` (all green), then commit only that task's files. Commit messages: `chore: …`, `feat(fakes): …`. Do not change git config; do not push. In tests use a fake clock (`let clock = 1791446400; const now = () => clock;`) and `ClimateController.defaultSettings()` for settings.

### Task 1: scaffolding (no test file; checked by commands)

| Step | Action | Check | Expected |
|---|---|---|---|
| 1 | `package.json` (5.1) | `npm pkg get scripts engines` | The new `start` and `test`, `vectors` and `headless` unchanged, `{"node":">=22.13"}` |
| 2 | `room-rules.js` (5.1) | `node -e "require('./room-rules.js'); console.log(JSON.stringify(globalThis.ClimateRoomRules))"` | `{}` |
| 3 | `web/rooms.js` (5.1) | `node -e "require('./web/rooms.js'); console.log('ok')"` | `ok` |
| 4 | Suite | `npm test` | 93 pass, 0 fail, no `ExperimentalWarning` line |
| 5 | Commit | `chore: wave 0 scaffolding (scripts, engines, room-rules and web/rooms stubs)` | – |

### Task 2: `server/db-common.js`, test `tests/db-common.test.js`

| Test | Proves |
|---|---|
| `new NotFoundError('room', 7)`: `instanceof Error`, `name`, `code === 'NOT_FOUND'`, `what`, `id === 7`, `message === 'Unknown room 7'`; `('alarm', 'rhHi')` gives `Unknown alarm rhHi` | C1 5.1 shape |
| `toJson({ a: Infinity, b: [-Infinity, NaN, 1] })` === `'{"a":{"$num":"Infinity"},"b":[{"$num":"-Infinity"},{"$num":"NaN"},1]}'` | Exact encoding |
| `fromJson(toJson(x))` gives back `Infinity`, `-Infinity`, `NaN` at any depth; `undefined` properties are dropped | Round trip, C1 5 |
| `fromJson('{"$num":"x","a":1}')` and `fromJson('{"$num":1}')` come back as plain objects, unchanged | Only the exact form is revived |

### Task 3: `server/rooms-common.js`, test `tests/rooms-common.test.js`

| Test | Proves |
|---|---|
| `new RoomError('bad_input', 'Bad input', ['x'])`: `instanceof Error`, `name === 'RoomError'`, `code`, `message`, `details`; `new RoomError('not_found', 'Room 9 not found').details` deep-equals `[]` | C2 6.2 |
| `DEMO_ROOM` deep-equals `{ name: 'Room 1', volume: 60, vent: 'supply' }` and is frozen; `FIRST_NOTE === 'Created'` | C2 3, 6.3 |
| `cleanSettings(JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":{"x":1},"fanOn":900},"spT":20}'))`: `settings` deep-equals `{ rules: { fanOn: 900 }, spT: 20 }`; `warnings` deep-equals `['Setting "__proto__" is not allowed: ignored.', 'Setting "rules.constructor" is not allowed: ignored.']`; `{ a: [{ prototype: 1, b: 2 }] }` gives `{ a: [{ b: 2 }] }` and the path `a.0.prototype`; `({}).polluted === undefined` and `Object.keys(Object.prototype)` is unchanged | Key filter, paths, warning text, no pollution |
| Merge: base `{ a: [1, 2], o: { x: 1, y: 2 }, n: 5, k: [1] }`, settings `{ a: [3], o: { y: 3 }, n: { z: 1 }, k: { q: 1 } }` → `{ a: [3], o: { x: 1, y: 3 }, n: { z: 1 }, k: { q: 1 } }`; `cleanSettings({ spT: 20 }, defaultSettings())` equals the defaults with only `spT` changed | C2 6.3 merge rule |
| Neither argument's `JSON.stringify` changes; no object or array of the result is (`===`) an object or array of either argument (walk all three) | Pure, shares nothing |

### Task 4: fake db lifecycle, rooms, settings (`tests/fake-db.test.js`)

| Test | Proves |
|---|---|
| `openFakeDb()`: `path === ':memory:'`, `version === 1`; two calls are independent; `openFakeDb({ upgrades: [] })` and `({ foo: 1 })` throw `TypeError` | C1 9.1 |
| `close()` twice is fine; then `listRooms()`, `getRoom(1)`, `insertReading(1, …)` throw `database is not open`; `path`, `version` still readable | C1 6.1, 6.3 |
| `createRoom({ name: 'A', volume: 60, vent: 'supply', settings })` returns `{ id: 1, name: 'A', volume: 60, vent: 'supply', adapter: 'sim', created_at: clock, archived_at: null }` with `Object.prototype`; `currentSettings(1)` deep-equals `{ id: 1, room_id: 1, saved_at: clock, note: 'Created', settings }` | C1 6.4, plain rows |
| `listRooms()` by `id`, without archived rooms; `{ includeArchived: true }` includes them; `{ archived: true }` throws `TypeError` | C1 6.4 |
| `getRoom(7)`, `getRoom('1')`, `getRoom(NaN)`, `getRoom(undefined)` throw `NotFoundError` (`what: 'room'`, `id` as asked; `Unknown room 7`) | C1 1 Ids |
| `updateRoom(1, { name: 'B' })` returns the changed Room; `{}` changes nothing; `{ archived_at: 5 }` and `{ colour: 'x' }` throw `TypeError` and change nothing | C1 6.4 |
| `archiveRoom(1, 100)` → `archived_at: 100`; again with 200 keeps 100; without `at` uses `now()`; every function still works on an archived room | C1 6.4 |
| Changing a returned Room or `settings`, or the object passed to `createRoom`/`saveSettings` after the call, changes nothing read later | Copies |
| `saveSettings(1, { settings, note: 'n', at: 5 })` returns the new current version; `note` defaults to `null`; `settingsHistory(1)` is `{ id, saved_at, note }[]` newest first; `getSettingsVersion` returns a version; room 2's version asked from room 1 throws `NotFoundError` `what: 'settings'` | C1 6.5 |
| Each of the 26 functions that take a room id, called with otherwise valid arguments for an unknown room, throws `NotFoundError` `what: 'room'` | C1 6.1, reads included |
| Left-out `at` uses `options.now()` (`createRoom`, `saveSettings`, `archiveRoom`) | C1 1 Clock |

### Task 5: fake db column rules (same file)

| Test | Proves |
|---|---|
| Table-driven, one broken rule per case, each expecting `code === 'ERR_SQLITE_ERROR'`, the `errcode`, `(errcode & 0xff) === 19`, and an unchanged read afterwards: `createRoom` `volume: 0` → 275, `vent: 'side'` → 275, no `name` → 1299, no `settings` → 1299, `at: 1.5` → 3091, `volume: 'abc'` → 3091; `insertReading` `fog: 4` → 275, `fog: 1.5` → 3091, no `t` → 1299, `t: 1.5` → 3091, `ac_mode: 'auto'` → 275, `lights: 2` → 275, `T: 'abc'` → 3091; `addEvent` `level: 'debug'` → 275, no `text` → 1299; `raiseAlarm` `level: 'info'` → 275; `replaceMix` `blocks: -1` → 275, `blocks: 1.5` → 3091, no `crop` → 1299 (with an earlier mix kept); `saveCapacityReport` `report.verdict: 'ok'` → 275, `report.utilisation: 74.5` → 3091, no `report` → 1299; `saveCalibration` no `ua` → 1299, `ua: NaN` → 1299, `log_rows: 2.5` → 3091; `saveControllerState` no `controller` → 1299 | C1 6.1 code table, 9.2; lead decision 3 |
| `T: NaN`, `power_w: Infinity`, `rmse_t: NaN` are stored as `null`; `lights: true, circ: false` come back `1`, `0` | C1 1 |
| `TypeError` `<function>: unknown field "<key>"`, nothing stored: `createRoom` `colour`; `insertReading` `temp`, `rh`, `co2`, `n`; a `replaceMix` row `co2PerBlock`; `queryReadings` `limit`; `saveCapacityReport` `verdict`; `insertReading(1, { …, room_id: 2 })` throws `TypeError`, `room_id: 1` is accepted | C1 1, 6.6 |

### Task 6: fake db readings (same file)

| Test | Proves |
|---|---|
| A Reading with all 15 keys comes back `deepStrictEqual` from `queryReadings` and `latestReading`, and inserting the returned row again works; a Reading with only the required keys comes back with all 15 keys, missing ones `null` | C1 6.6, lead decision 1 |
| Raw: rows at `from` and `to` included, outside not; ordered by `t` when the temperatures are in another order; two rows with equal `t` both returned in insertion order; another room's rows left out | C1 6.6 raw |
| `step: 60`: `t` is the bucket start; `T` is the mean of non-null values, `null` when all null; `ac_setpoint` `null` when the AC was off for the whole bucket; `fog` 1 and 2 → 1.5; `lights` 1, 0, 0, 1 → 0.5; `ac_mode` and `kwh` from the row with the largest `t` (rows inserted out of `t` order), `kwh: null` when that row has none; an empty bucket is left out; `Object.keys` of a bucket row equals a raw row's | C1 6.6 buckets |
| `RangeError`: no `from`, `to: 1.5`, `from > to`, `step: 0`, `step: 1.5`; `step: null` gives raw rows | C1 6.6 errors |
| `latestReading`: `null` without readings; equal largest `t` gives the one inserted last; the largest `t`, not the highest `T` | C1 6.6 |

### Task 7: fake db events, alarms, state, calibrations, mix, capacity (same file)

| Test | Proves |
|---|---|
| `addEvent` returns `{ id, room_id, t, level, text }`; `listEvents` by `id` desc; 105 events give 100; `{ limit: 5 }`; `{ before: <id> }` only smaller ids; `RangeError` for `limit` 0, 1001, 1.5 and `before: 'x'` | C1 6.7 |
| `raiseAlarm` twice → the same row, one open row; `clearAlarm` sets `cleared_at`; raising again makes a new row; `clearAlarm` with no open row → `null` | C1 6.8 |
| `ackAlarm` marks every unacknowledged row of the key (open and cleared) and returns the newest; again → that row unchanged; unknown key → `NotFoundError` `what: 'alarm'`, `id: 'rhHi'`, `Unknown alarm rhHi` | C1 6.8 |
| `listAlarms`: open rows by `raised_at` desc (ties `id` desc), then cleared by `cleared_at` desc; `{ recent: 1 }` limits the cleared part; `{ recent: 0 }` only open; default 20; `RangeError` for 501 and -1 | C1 6.8 |
| `loadControllerState` `null` before a save; after two saves, the second; `sim` defaults to `null`; a controller object with `Infinity`, `-Infinity`, `NaN` and an `undefined` property loads `deepStrictEqual` to `fromJson(toJson(saved))`; so does `ClimateController.create(ClimateController.defaultSettings(), null, null).snapshot()` | C1 6.9, 5 |
| `saveCalibration` defaults (`applied_at`, `rmse_*`, `log_rows` `null`; `run_at = now()`); `listCalibrations` by `run_at` desc then `id` desc; `applyCalibration` of another room's run → `NotFoundError` `what: 'calibration'`; `currentCalibration` `null` before any apply, then the largest `applied_at` (ties larger `id`); re-applying an older run makes it current | C1 6.10 |
| `getMix` `[]` first; `replaceMix` returns rows in order with `co2_per_block: null` when left out; the same crop twice is kept; `replaceMix(id, [])` empties it | C1 6.11 |
| `saveCapacityReport({ report })` copies `verdict` and `utilisation` (74 stays 74); `utilisation` `null` when missing, `NaN` or `Infinity`; a report holding `Infinity` loads with `Infinity`; `latestCapacityReport` `null` first, then the largest `id` | C1 6.12 |

### Task 8: `tests/fakes/rooms.js`, test `tests/fake-rooms.test.js`

Setup: `db = openFakeDb({ now })`, `rooms = createFakeRoomManager({ db, now })`, `const seen = []; for (const n of ['reading', 'event', 'alarm', 'settings', 'room']) rooms.on(n, p => seen.push([n, p]));`.

| Test | Proves |
|---|---|
| `start()`, `stop()`, `tick()` do nothing and are in `calls`; a call that throws is in `calls` too; `applySettings(id, s, undefined)` records `args.length === 3`; `list()` adds one entry only | `calls` |
| Room seeded with `db.createRoom` and two open alarms: `get(id).live` deep-equals `{ reading: null, stage: 'fruiting', crop: 'oyster', targets: null, status: null, alarms: 2, running: true, error: null }`; `list()` has it; `get(999)`, `get('x')` → `null`; an archived room is not in `list()` and `get` gives `live: null` | Default live |
| `setLive(id, { running: false, error: 'boom' })` changes `get(id).live`, emits nothing; `restart(id)` → `running: true`, `error: null`, one `room` emit, no db event | Test helper, restart |
| `create({ name: ' North ', volume: 80, vent: 'exhaust' })`: name `North`; one version, note `Created`, settings deep-equal `defaultSettings()` with `roomM3: 80`; emits `settings` (`auto: false`, `warnings: []`, `version` = `db.currentSettings(id)`), `event` (`Room created`), `room`, in that order; returns `{ room, warnings: [] }`; `settings: undefined` behaves the same | C2 4, 9.4 |
| `create` with `volume: 200, settings: { crop: 'pink' }` stores `crop: 'pink'`, `roomM3: 200`; `{ roomM3: 150 }` stores 150; `{ spT: 99 }` returns `"spT" = 99 is outside 10–35: set to 35.` and stores 35; `JSON.parse('{"__proto__":{"polluted":1},"spT":20}')` stores `spT: 20`, warns `Setting "__proto__" is not allowed: ignored.`, and `({}).polluted === undefined` | C2 9.4, lead decision 6 |
| `create({})` throws `RoomError` (`instanceof` the `server/rooms-common.js` class, `name === 'RoomError'`, `code: 'bad_input'`, `message: 'Bad input'`) with the three C2 6.1 texts for name, volume, vent; `settings: []` → `settings must be an object`; nothing stored, nothing emitted | C2 6.1, 6.2 |
| `update(id, { name: ' B ' })` stores `B`, emits `room`; `{ colour: 1 }` → `unknown field "colour"`; archived → `room <id> is archived`; `update(999, {})` → `not_found` `Room 999 not found` | C2 4, 6.1 |
| `archive(id)`: `archived_at = now()`, `Room archived` written, emits `event` then `room` (`live: null`); again → returns the room, emits nothing | C2 16 |
| `applySettings(id, { spT: 20 }, ' warmer ')`: stored version = the previous version with only `spT` changed; note `warmer`; event `Settings saved (version <id>): warmer`; emits `event` then `settings` (`auto: false`); returns `{ settings, warnings, version }` with `settings` equal to the stored one; without a note the text has no `:`; `{ exact: true }` gives the same stored settings and is in `calls` | C2 9.2, 16 |
| With `t.mock.method(ClimateController, 'applySettings')` and `t.mock.method(ClimateController, 'importSettings')`: `create` with settings and `applySettings` call `importSettings` and never `applySettings` | Lead decision 6, call-time lookup |
| `applySettings` errors: `settings` `null` or an array → `settings must be an object`; a 201-character note → `note must be text of at most 200 characters`; archived → `bad_input`; unknown room → `not_found`; nothing stored | C2 6.1 |
| `ackAlarm`: `rhHi` raised, cleared, raised again (two unacknowledged rows) → writes `Acknowledged: High humidity`, emits `event` then two `alarm` (`change: 'acked'`, `acked_at = now()`), returns the newest row; again → same row, no emit; `tHi` → `not_found` `No alarm "tHi" in room <id>`; `''` → `bad_input` | C2 10.2 |
| A throwing listener is caught (stub `console.error` with `t.mock.method`) and a later listener still runs; `off` removes a listener; `emit('reading', p)` reaches listeners | C2 7 |

### Task 9: `tests/fakes/api-server.js`, test `tests/fake-api-server.test.js`

Use the global `fetch`; for paths `fetch` would normalise (`..`), use `http.request` with a raw `path`. Close every fake in `t.after`.

| Test | Proves |
|---|---|
| `startFakeApi()` resolves; `url` matches `^http://127\.0\.0\.1:\d+$` | Export, `url` |
| Defaults: `GET /api/rooms`, `/api/rooms/3/events`, `/api/rooms/3/settings/history` → 200 `[]`; `GET /api/rooms/3/settings` → 200 `{}`; `PUT /api/rooms/3/mix` with JSON → 200 echo; `POST` without body → 200 `null`; `DELETE /api/rooms/3` and (without `root`) `GET /index.html` → 404 `{ error: 'Unknown route', details: [] }` | Default table |
| `requests` holds `{ method: 'POST', path: '/api/rooms/1/alarms/rh%20Hi/ack', query: {}, body: null }`; `?from=1&to=2` as strings; a JSON body parsed; a non-JSON body as text | Recording |
| `reply('GET', '/api/rooms', 500, { error: 'Server fault', details: ['x'] })` answers it; a RegExp pattern matches; a later reply for the same method and pattern replaces it; of two matching patterns the last set wins; a string body is `text/plain`; `undefined` gives an empty body | `reply` |
| `startFakeApi({ retryMs: 50 })`: `GET /api/stream` → 200, `text/event-stream; charset=utf-8`, first bytes `retry: 50\n\n` (default `retry: 3000`); `emit('reading', { t: 1 })` arrives as `event: reading\ndata: {"t":1}\n\n` on two open connections; `dropStreams()` ends both readers (`done: true`); a new `GET /api/stream` works and is recorded; `reply('GET', '/api/stream', 503, …)` wins over the default | Stream |
| With `root` = the worktree folder: `/` and `/index.html` give the bytes of `index.html` (`text/html; charset=utf-8`, `Content-Length`, `Cache-Control: no-cache`); `/room-rules.js` and `/web/rooms.js?v=2` give their files as `text/javascript; charset=utf-8`; `HEAD /styles.css` → 200, headers, empty body; `/package.json`, `/web/`, `/web`, `/.git/HEAD`, `/web/../package.json`, `/%ZZ` → 404 `text/plain` `Not found`; a `reply('GET', '/index.html', …)` does not apply; `POST /index.html` → JSON 404 `Unknown route`; `/api/rooms` still gives the default `[]`; file requests are in `requests` | `root` (C3 9) |
| After `await close()` with an open stream, `fetch(url + '/api/rooms')` rejects; the test file exits by itself | `close` |

### Task 10: final verification

Run every check of section 7; fix and commit anything that fails. Report to the lead: the commits, the test count, any contract problem met, and any point of section 9 that needs a decision.

## 7. How to verify

| # | Command | Expected |
|---|---|---|
| 1 | `npm test` | `# fail 0`; `# pass` = 93 + the new tests; no `ExperimentalWarning` line |
| 2 | `node --test tests/vectors.test.js` | 8 tests, 8 pass |
| 3 | `git diff --stat master...HEAD -- tests/vectors controller.js sim.js runtime.js capacity.js calib.js app.js index.html styles.css README.md docs tools tests/harness.js` | No output (the 8 recorded runs and every non-owned file unchanged) |
| 4 | `git diff --name-only master...HEAD` | Only files of section 3 |
| 5 | `git status --porcelain` | Empty |
| 6 | `ls tests/fakes/api-server.js tests/fake-api-server.test.js web/rooms.js room-rules.js` | All four listed (C5 1.6, the lead's wave 0 check) |
| 7 | `grep -n "require(" server/*.js tests/fakes/*.js room-rules.js web/rooms.js` | Only the requires of section 4 |
| 8 | `npm pkg get scripts.start scripts.test engines.node` | `node --disable-warning=ExperimentalWarning server/main.js`, `node --disable-warning=ExperimentalWarning --test tests/*.test.js`, `>=22.13` |
| 9 | `node -e "const {openFakeDb}=require('./tests/fakes/db.js'); const db=openFakeDb(); console.log(Object.keys(db).filter(k=>typeof db[k]==='function').sort().join(' '))"` | `ackAlarm addEvent applyCalibration archiveRoom clearAlarm close createRoom currentCalibration currentSettings getMix getRoom getSettingsVersion insertReading latestCapacityReport latestReading listAlarms listCalibrations listEvents listRooms loadControllerState queryReadings raiseAlarm replaceMix saveCalibration saveCapacityReport saveControllerState saveSettings settingsHistory updateRoom` |
| 10 | `node --test tests/fake-api-server.test.js` | Exits by itself within a few seconds |

## 8. Done when

- [ ] `package.json` has the `start` and `test` scripts and `engines.node` `>=22.13`, nothing else changed.
- [ ] `room-rules.js` and `web/rooms.js` are exactly the C5 1.5 stubs.
- [ ] `server/db-common.js` and `server/rooms-common.js` export exactly C1 5.1 and C2 6.3 (`cleanSettings(settings, base?)` with the merge), with passing tests.
- [ ] `tests/fakes/db.js` has the 28 functions of C1 6 plus `close` and C1 9.2's behaviour (`errcode` 275, 1299, 3091); `tests/fake-db.test.js` covers Tasks 4–7.
- [ ] `tests/fakes/rooms.js` implements C2 16 and never calls `ClimateController.applySettings`; `tests/fake-rooms.test.js` covers Task 8.
- [ ] `tests/fakes/api-server.js` implements C5 4.5 including `root`; `tests/fake-api-server.test.js` covers Task 9.
- [ ] Every check of section 7 passes: `npm test` green, the 8 recorded runs unchanged, only owned files changed.
- [ ] One commit per task on the worktree branch; nothing pushed; report sent to the lead.

## 9. Points the contracts leave open (fake behaviour; not tested unless marked)

| # | Point | Fake behaviour |
|---|---|---|
| 1 | Which error a call that breaks several rules throws | The check order of section 5.3 |
| 2 | A JSON column given `null` (`settings: null`) | Stored as the text `null`, returned `null`; no 1299 |
| 3 | Numeric strings, booleans, objects in INTEGER/REAL columns (C1: not reproduced) | 3091 |
| 4 | `createRoom` with `note: null` | Stored `null` (`undefined` gives `Created`) |
| 5 | Bucket ties on the largest `t` (C1: not defined) | The row inserted last |
| 6 | Buckets for negative `t` | `Math.floor` (SQLite truncates toward zero; only differs below 0) |
| 7 | `listEvents` `before` 0 or negative | Accepted (gives `[]`) |
| 8 | Fake `create`/`update` with a non-object argument | Treated as `{}` |
| 9 | Fake `applySettings` return | `settings` = `version.settings` (stored and read back), the same object shape as the emit (tested) |
| 10 | Emit orders (tested) | `create`: `settings`, `event`, `room`; `applySettings`: `event`, `settings`; `archive`: `event`, `room`; `ackAlarm`: `event`, then the `alarm`s |

## 10. Do not

| Do not | Why |
|---|---|
| Change any file outside section 3 (`controller.js`, `sim.js`, `runtime.js`, `capacity.js`, `calib.js`, `app.js`, `index.html`, `styles.css`, `README.md`, `docs/**` including the contracts, `tools/**`, existing tests, `tests/vectors/**`) | One owner per file; the controller and the recorded runs must not change |
| Write `server/db.js`, `server/rooms.js`, `server/sim-adapter.js`, `server/api.js`, `server/static.js`, `server/config.js`, `server/main.js`, any other `web/*.js`, or any wave 1 test file | Wave 1 streams own them |
| Use any other file name for the fake API server or its test than `tests/fakes/api-server.js` and `tests/fake-api-server.test.js` | C5 1.6: every brief and test relies on these exact names |
| Run `npm run vectors` (`tools/make-vectors.js`) | It rewrites `tests/vectors/` |
| Edit a contract, or build other behaviour because a contract looks wrong | Report to the lead instead |
| Use `node:sqlite` in the fake db, make fake functions async, or make the fakes require `server/db.js` or `server/rooms.js` | C1 9, C2 16, lead decision 7 |
| Pass outside settings to `ClimateController.applySettings` anywhere | Lead decision 6 (prototype pollution) |
| Add `: ping`, CORS headers, a body size limit or route logic to the fake API server | C5 4.5: no route logic, no heartbeat (the client's watchdog is tested against its silence) |
| Add npm dependencies, a `"type"` field, a build step, or options the contracts do not list | No dependencies; YAGNI |
| Push, change git config, or touch GitHub Pages | The lead merges and handles Pages |

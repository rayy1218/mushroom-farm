# C2: Room manager contract

Date: 2026-10-08. Status: **draft** (revision 9, not frozen; the lead freezes it with wave 2). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md` (sections 1, 2, 5, 6).
Binding: the lead decisions of `LEAD-DECISIONS.md` (cited below as "lead decision N"); they override this text. Contract C9 (`docs/contracts/air.md`, frozen, on `master`) overrides the C2 sections its section 10 lists; revision 9 writes C9 6.3 into them.

### Changes in revision 9

Wave 2 rebased on the C9 air exchange (`master` 6a12852). Revision 8 was never frozen.

| Section | Change |
|---|---|
| Header | The duplicate "Spec:" line is removed (finding 10). Status: draft, revision 9. |
| 5.2, 16, 17 | `Live` gains `air` (lead decision 27 as amended): the controller's air exchange state for the Live tab, not part of the summary; the fake's default `live` has `air: null`; test "Live air exchange". |
| 8.1 (Server 2 task) | `master` `server/rooms.js` `startLoopFromRow` saves the `Upgraded: air exchange` settings inside the steps 2–6 `try`, so a db error there crashes the room instead of being thrown as 8.1 requires: Server 2 moves that save out of the `try` (a db error is thrown to the caller), with a test (lead ruling 2026-10-09). |
| Intro, 1 | `server/rooms.js` loads `../air.js` before `../controller.js`; `server/sim-adapter.js` loads `../air.js`, `../sim.js`, `../runtime.js`, `../equipment.js`; the fake loads `../../air.js` before `../../controller.js` (C9 3, 6.3). Reading keys: the 18 keys of lead decision 20 as amended, with `air` in place of `fan` (C9 6.1). |
| 2, 3, 6.1, 6.3 | No `vent`: the Room row is `{ id, name, volume, adapter, created_at, archived_at }`; `DEMO_ROOM` is `{ name: 'Room 1', volume: 60 }`; `update` takes only `name` and `volume` (a `vent` is an unknown field); `create` ignores it (C9 6.3). `TARGET_KEYS` and `PAIR_GAP` follow the controller's six ramp keys and the one pair `rules.fanOn` / `rules.fanOff` (C9 5.2, 6.3). |
| 4 | `create`, `update`, `restart` lose `vent`. New row under "Not a manager method": the Your machines save (C3 6.26) keeps the settings' `airM3h` equal to the Equipment's `air_m3h` with a partial `applySettings` (lead decision 35 as amended). |
| 5.1 | `vent` row removed. |
| 5.3 | Row `fan` (0–3) replaced by `air` (`0` \| `1`, `cmd.air && cmd.air.on ? 1 : 0`); `power_w` sums `ac`, `hu`, `air`, `lights`, `circ` (C9 4.2, 6.3). |
| 5.5 | Alarm key `airTooSmall` added (C9 5.5). |
| 7, 8.1, 8.3, 9.1, 9.2, 9.4, 15, 16 | Every settings object read from the database or given from outside goes through `ClimateController.upgradeSettings` before `importSettings`; the stored base is upgraded before the merge; a loop start that upgraded saves the result once (note `Upgraded: air exchange`) (C9 6.3). |
| 9.1, 9.2 step 7 | Pair correction for `rules.fanOn` / `rules.fanOff` only (C9 6.3). |
| 12.2, 13.1 | The adapter's `room` has no `vent`; `createSimAdapter` sets `env.airM3h = cfg.airM3h` (the room's settings, C9 6.3) and no `env.vent`. `env.airM3h` is the size the simulated room runs, with or without `env.plant`. The "CO₂ jitter" note says "air exchange". |
| 9.1 (lead decision 56) | New row "Lowering CO₂ limit": the exception to the ramp; no Server 2 test depends on the three CO₂ keys ramping after a lowering change. |
| 17 (lead decision 56) | "Pair correction": the low-key test is dropped (unreachable after lead decision 56); the high-key test with its bd24755 numbers stays. |
| 17 | "Recording" checks the 18 keys with `air`; "Whole machine levels" uses `manual.air` (C9 10); "Room equipment" reads `env` through a spy on `globalThis.ClimateSim.create` and uses the Equipment of C8 revision 3 (`air_m3h: 600`) (findings 10, 18); "Settings rules" and "Restore exact" count six target keys; "Pair correction" adds the high key case; new rows for the C9 tests on `master` (air row value, settings upgrade, `vent`, the adapter's air size and require order). |

### Changes in revision 8

Room-centred app and C8 equipment (lead decisions 20, 27, 33, 35, 48, 54). In wave 2 the **Server 2** stream owns `server/rooms.js`, `server/sim-adapter.js` and `tests/rooms.test.js`; the lead owns `tests/fakes/rooms.js` (prep 2.0).

| Section | Change |
|---|---|
| 1 | Reading keys: 18 (adds `ac_fan`, `stage`, `core`; lead decision 20). `server/sim-adapter.js` also loads `../equipment.js` (C8; only `plantOf` is used). |
| 5.2 | `Live` adds `flush` and `blocks` (lead decision 27). Neither is part of the summary, so neither sends a `room` event alone. |
| 5.3 | ReadingRow adds `ac_fan` (the `sim.js` rule, so C1's `CHECK` cannot fail), `stage` (`cfg.stage`), `core` (`r.core` when finite). |
| 7 | The summary is unchanged: `flush` and `blocks` are left out, like `targets` and `status`. |
| 8.1, 12.2, 13.1 | Loop start reads `db.getEquipment(id)`; the adapter factory gets `equipment`; `createSimAdapter` sets `env.plant = ClimateEquipment.plantOf(equipment, { volume, calib })` when the room has machines (positions stay `DEFAULT_ENV`). An equipment save takes effect at the next restart, as a mix. |
| 15 | `getEquipment` added; `insertReading` carries the new keys. |
| 16 | The fake's default `live` adds `flush: null`, `blocks: null`; `setLive` readings have the 18 keys. |
| 17 | "Recording" checks the 18 keys; new tests "Live flush and blocks" and "Room equipment" (skipped while `equipment.js` is the prep 2.0 stub, lead decision 48). |

### Changes in revision 7

| Section | Change |
|---|---|
| 13.1, 5.3, 17 | The simulated room's `io.read()` adds to `CO2` the same jitter far below sensor resolution that `capacity.js` `trial()` uses: `r.CO2 + (r.seq % 2) * 1e-6`. Without it, the noise-free simulated CO₂ settles on one exact value whenever the circulation and fresh-air fans stay at one setting, and the controller's frozen-sensor check (`SENSORS.CO2.stuckMin` = 60 min) raises a false serious `sensor_CO2` alarm and a timed purge (with `manual.circ` Manual On at about 6.3 h; with circulation off at about 6.1 h and 11.8 h). New test "No frozen CO₂". |
| 5.2, 7, 17 | `live.targets.RH` = `Math.round(ctl.state.rhT * 10) / 10` (one decimal). In VPD mode `ctl.state.rhT` is an unrounded float (for example 87.62903745…), which C5 section 3.4 uses as the chart point's `spRH` and the chart prints as `Target <spRH> % ± 3`. C3 section 3.1 (`targets` row) should repeat "rounded to one decimal". New test "Rounded humidity target". |

### Changes in revision 6

| Section | Change |
|---|---|
| 2, 7, 8.2, 17 | Lead decision 2 as written: the summary is again `{ stage, crop, alarms, running, error }`. `targets` and `status` stay in `Live` but are not compared, so a ramp, the VPD humidity target (which moves with each reading) or a status chip alone sends no `room`. This matches C3 section 10.2 and C5 sections 3.2, 3.4 and 7.10, whose `listRooms()` refresh (at most once per 30 s, after a `reading`) brings targets and status to the page. The revision 5 request to C3 is withdrawn. The "Room summary" test now checks that a ramped target or a status chip change alone emits no `room`. |
| 5.3, 17 | `fog` and `fan` are rounded and held in 0–3 by the rule `sim.js` uses for the machines (`importSettings` does not round `manual.hu.level`, `manual.fan.level`, `rules.fanLevel`, `protect.faultFogLevel`, nor limit `rules.baseFan.*`), so C1's `INTEGER CHECK (BETWEEN 0 AND 3)` cannot fail and stop the server. C1's readings "Source" column should repeat this rule. New test "Whole machine levels". |
| 1 | The "Shared modules" rule now says controller functions are called as `ClimateController.<name>(…)` at call time (the "Untrusted keys" test wraps them with spies). |
| 3, 8.1, 12.2, 13.1, 15, 17 | The simulated room uses the room's block count: loop start reads `db.getMix(id)` and passes `blocks` (the sum of the mix's `blocks`, or `null` when below 1) to the adapter factory; `env.blocks` takes it, else `DEFAULT_ENV.blocks`. So an applied calibration's `co2_per_block` (fitted by C5 section 3.6 with the mix sum) gives the room its real block CO₂. A mix change takes effect at the next restart. C1 section 7 must add `getMix` to C2's list. |
| 9.4, 17 | `create` always merges over `defaultSettings()` with `roomM3 = volume`: `cleanSettings(settings, base)`, then `importSettings`. Partial settings no longer reset `roomM3` to 60; a given `roomM3` still wins. C3 section 6.2's "a missing setting takes its default" then reads "… its default (`roomM3` = `volume`)". |
| 15 | `insertReadings` removed from the list of functions not called (C1 revision 4 removed it). |

### Changes in revision 5

| Section | Change |
|---|---|
| 2, 7, 17 | The summary was made `{ stage, crop, targets, status, alarms, running, error }`. Undone in revision 6 (lead decision 2). |
| 7 | The live feed sends the `data` that C3 section 10.2 takes from each payload, not the C2 payload as given. |
| 13.1, 13.2 | `simT` is read when the origin is set (`sim.view().t`), at creation and again after a gap, never cached from creation. |
| 16 | New row: what the fake's `create`, `update`, `archive` and `restart` return. |
| – | `rooms.open-questions.md` (next to the drafts) is superseded by `LEAD-DECISIONS.md` and revisions 4 and 5. It is not part of this contract and is not copied into `docs/contracts/` in the repo. |

### Changes in revision 4

| Section | Change |
|---|---|
| 1, 5.3, 7, 17 | Lead decision 1: one set of Reading keys everywhere. Removed every mention of other column names and of a mapping layer. |
| 6.3, 9.1, 9.2 step 2, 16 | Lead decision 6: settings from outside never reach `ClimateController.applySettings`. `cleanSettings(settings, base)` now also does the merge over the base (a safe deep copy). Only the `importSettings` result is applied to the live `cfg` and stored. The fake does the same. |
| 7 | Lead decision 2: C2 owns every `room` event (lifecycle and summary changes); C3 only relays it. (Revision 5 added `targets` and `status` to the summary; revision 6 removed them again.) |
| 9.1, 9.2 step 7 | Open question decided: the pair correction moves the key the person changed, never the kept live value (the "an edit of one target does not move the others" rule). |
| 8.5, 9.2 steps 9 and 10, 16, 17 | Open question decided: an `exact` restore that called `setStage`, `setCrop` or `setFarmType` writes the event `Targets restored: …` after the controller's `Stage: …` event, because the ramp that event names is cancelled. |
| 11, 17 | The database-error test throws an error of node:sqlite's shape (lead decision 3, C1 section 9.2). |
| 15 | `latestReading` added to the C1 functions the manager does not call (as in C1 section 7). |

This contract defines `server/rooms.js` (the room manager), `server/sim-adapter.js` (the simulated adapter), the small
shared module `server/rooms-common.js` and the fake room manager `tests/fakes/rooms.js`. This contract does not change
the shared modules `air.js`, `controller.js`, `sim.js`, `runtime.js` and `equipment.js`; it uses `env.plant` of `sim.js` and
`ClimateEquipment.plantOf` (both C8, `docs/contracts/equipment.md` sections 4.5 and 5.1), and `env.airM3h` of `sim.js`
and `ClimateController.upgradeSettings` (both C9 on `master`, `docs/contracts/air.md` sections 4.1 and 5.2). Every other
call to them named here exists today. Every database
call named here is a C1 function (`docs/contracts/db.md`) with C1's name, arguments and return shape; section 15 lists
them.

## 1. Files and module format

| File | Owner | Exports | Loads |
|---|---|---|---|
| `server/rooms-common.js` | Lead (wave 0, with the fakes, like `server/db-common.js`) | `RoomError`, `DEMO_ROOM`, `FIRST_NOTE`, `cleanSettings` (section 6.3) | nothing |
| `server/rooms.js` | Rooms stream (wave 1); Server 2 stream (wave 2) | `createRoomManager`, `defaultAdapterFactory`, `TARGET_KEYS`, and the four exports of `./rooms-common.js` re-exported unchanged (the same objects) | `../air.js`, `../controller.js`, `../runtime.js`, `./sim-adapter.js`, `./rooms-common.js`, in this order (`air.js` before `controller.js`, C9 3 and 6.3; as on `master`) |
| `server/sim-adapter.js` | Rooms stream (wave 1); Server 2 stream (wave 2) | `createSimAdapter`, `MAX_CATCH_UP_S`, `TZ_OFFSET_S`, `START_CO2` | `../air.js`, `../sim.js`, `../runtime.js`, `../equipment.js`, in this order (`master` has the first three, C9 6.3; revision 8 adds `../equipment.js`, of which only `ClimateEquipment.plantOf` is used, C8 section 1) |
| `tests/fakes/rooms.js` | Lead (wave 0) | `createFakeRoomManager` (section 16) | `../../air.js`, `../../controller.js`, `../../server/rooms-common.js` (as on `master`). Never `../../server/rooms.js`: that file does not exist in the API stream's worktree during wave 1. |
| `tests/rooms.test.js` | Rooms stream (wave 1); Server 2 stream (wave 2) | – | `server/rooms.js`, the fake db `tests/fakes/db.js`, the fake room manager (parity test, section 17) |

| Rule | Detail |
|---|---|
| Module format | CommonJS (`require`, `module.exports`). `package.json` has no `"type"` field. |
| Shared modules | `require('../controller.js')` and the others, then read `globalThis.ClimateController`, `globalThis.ClimateSim`, `globalThis.ClimateRuntime` (as `tests/harness.js` and `tools/run-headless.js` do). Call the controller functions as `ClimateController.<name>(…)` at call time (for example `ClimateController.importSettings(…)`), never through a copy taken when the module loads (`const { importSettings } = ClimateController` is not allowed), so the spies of the "Untrusted keys" test (section 17) see every call. This holds for `server/rooms.js` and `tests/fakes/rooms.js`. |
| Synchronous | Every method is synchronous (`node:sqlite` is synchronous). No method returns a Promise. |
| One thread | API calls run between ticks, so no locking is needed. |
| Time | Every timestamp is an integer number of seconds since 1970 UTC. The controller time `t` of a live room is this same clock (section 13.2). |
| Database | Only the C1 functions of section 15, with C1's `(roomId, …)` signatures. A C1 `NotFoundError` is recognised by `err.code === 'NOT_FOUND'` (so the real db and the fake db behave the same). |
| Reading keys | Lead decisions 1 and 20: one set of keys everywhere, `room_id`, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `air`, `lights`, `circ`, `power_w`, `kwh`, `ac_fan`, `stage`, `core` (18 keys, in this order; C1's `Reading`, C1 section 6.2; `air` is C9 6.1's key, `0` or `1` in a row the manager writes). The manager builds rows with these keys and passes them on unchanged; it never renames a key. |
| Settings from outside | Lead decision 6: a settings object given to `create` or `applySettings` (from HTTP, an import or a restored version) is never passed to `ClimateController.applySettings`. It goes through `cleanSettings`, `ClimateController.upgradeSettings` (C9 5.2) and `ClimateController.importSettings`, and only the `importSettings` result is applied and stored (sections 6.3 and 9). |
| Stored settings | C9 6.3: every settings object read from the database goes through `ClimateController.upgradeSettings` before `importSettings` (a stored version may be a version 1 object); its warnings come before the import's own (sections 8.1 and 9.2). |

## 2. Terms

| Term | Meaning |
|---|---|
| Room row | A C1 `Room`: `{ id, name, volume, adapter, created_at, archived_at }` (no `vent`: C9's `SCHEMA_V2_AIR` dropped the column, C9 6.2). |
| Loop | The running parts of one room: the adapter, the controller (`ClimateController.create`), the runtime (`ClimateRuntime.createRuntime`) and the room's live `cfg` object. |
| Running room | A room whose loop is ticked. |
| Stopped room | A room that is not archived and has no running loop: before `start()`, after `stop()`, or after a crash (then `error` is set). |
| Crashed room | A stopped room with `error` set. Its controller object is kept in memory (frozen) until `restart`, `archive` or `stop`. |
| Settings object | The controller's settings, the shape of `ClimateController.defaultSettings()` (the `settings` field of a settings file, not the file wrapper). |
| Live `cfg` | The one settings object of a running room. The controller holds it by reference and changes it itself (stage program, ramps). |
| Base | The settings of the room's current stored version (C1 `currentSettings`). The manager keeps a copy in memory for each room it has loaded. |
| Target keys | `TARGET_KEYS` = `Object.keys(ClimateController.profileTargets('oyster', 'fruiting'))` = `spT`, `spRH`, `co2Lim`, `rules.co2SafetyAt`, `rules.fanOn`, `rules.fanOff` (six keys: the controller's `RAMP_KEYS`, C9 5.2; `rules.x` means `cfg.rules.x`). `get(obj, k)` and `set(obj, k, v)` below read and write such a dot path. |
| Adapter reading | The object an adapter's `io.read()` returns (`docs/contract.md` section 1). |
| ReadingRow | The C1 `Reading` the manager writes for one adapter reading (section 5.3). |
| Open map | Per room, the open C1 alarm rows (`cleared_at = null`), keyed by `alarm_key`. |
| Summary | Per room, `{ stage, crop, alarms, running, error }` of its `Live` (section 5.2), built in that key order (lead decision 2). `targets`, `status` and `reading` are not part of it. The manager keeps the `JSON.stringify` text of the last summary it emitted in a `room` event (section 7). |

## 3. `createRoomManager(options)`

`createRoomManager({ db, now, tickMs, adapterFactory })` → manager. Nothing runs until `start()`.

| Option | Type | Default | Meaning |
|---|---|---|---|
| `db` | object | required | The C1 database object (the real `server/db.js` or the fake `tests/fakes/db.js`). Section 15 lists the functions used. |
| `now` | `() => integer` | `() => Math.floor(Date.now() / 1000)` | The clock, in whole seconds since 1970 UTC. Tests pass a fake clock. |
| `tickMs` | integer ≥ 0 | `1000` | Milliseconds between ticks. `0` = no timer: the caller drives the loops with `tick()` (tests). |
| `adapterFactory` | `(args) => adapter` | `defaultAdapterFactory` | Makes the adapter of a room. `args` = `{ room, calib, blocks, equipment, cfg, snapshot, now }` (section 12.2). |

| Constant | Value | Meaning |
|---|---|---|
| `STATE_SAVE_S` | 300 | Controller and adapter state is saved when at least this many seconds of `now()` passed since the last save |
| `NAME_MAX` | 60 | Longest room name (characters, after trimming) |
| `VOLUME_MIN`, `VOLUME_MAX` | 5, 5000 | Room volume range in m³ (the capacity card's `LIM.volume`) |
| `NOTE_MAX` | 200 | Longest settings note (characters, after trimming) |
| `FIRST_NOTE` | `'Created'` | Defined in `server/rooms-common.js`. Note of the first settings version of every room, the demo room included (C1 `createRoom`'s default) |
| `DEMO_ROOM` | `{ name: 'Room 1', volume: 60 }` | Defined in `server/rooms-common.js`. The room `start()` creates in an empty database. `start()` is the only place that creates it (`server/main.js` does not). |
| `RECENT_READING_S` | 3600 | At loop start, `live.reading` is the newest reading of the last hour (section 8.1) |
| `ACK_SCAN` | 500 | How many cleared alarm rows `ackAlarm` scans to find the rows it changes (section 10.2) |
| `PAIR_GAP` | `{ co2: 50 }` | Smallest gap in ppm between `rules.fanOn` and `rules.fanOff` (the same rule as `importSettings`; section 9.2 step 7). It is the only pair (C9 6.3). |

## 4. Manager methods

| Method | Arguments | Returns | Errors (`RoomError` code) | Does |
|---|---|---|---|---|
| `start()` | – | `undefined` | – (a room that fails to start is marked stopped with the error); a db error is thrown | If `db.listRooms({ includeArchived: true })` is empty, calls `create(DEMO_ROOM)` (before the manager counts as started, so `create` does not start the loop itself). Then starts the loop of every room of `db.listRooms()` (archived rooms are left out by C1's default), in id order (section 8.1), and emits `room` for each of them (section 7). Starts the timer when `tickMs > 0`. A second call does nothing. |
| `stop()` | – | `undefined` | – | For each running room: saves its state (section 8.4), writes the event `Stopped`, removes the loop. Crashed rooms: removes the loop, no state save. Stops the timer. Emits no `room` events (the server is shutting down). Does not close the database. |
| `tick()` | – | `undefined` | – | One tick of every running room, in id order (section 8.2). The timer calls it; tests call it with `tickMs: 0`. Does nothing before `start()`, after `stop()`, or after a `fatal` (section 11). |
| `list()` | – | `Room[]` | – | `db.listRooms()` (rooms without `archived_at`, in id order), each with its `live` status. |
| `get(id)` | `id`: integer | `Room` or `null` | – | One room, archived ones included (`live` is `null` for an archived room). `null` for a non-integer id, or when `db.getRoom(id)` throws `NotFoundError`. |
| `create(input)` | `{ name, volume, settings? }`; other keys (for example an old `vent`) are ignored (C9 6.3) | `{ room: Room, warnings: string[] }` | `bad_input` | Validates (section 6.1). Makes the first settings (section 9.4). `db.createRoom({ name, volume, adapter: 'sim', settings, note: FIRST_NOTE, at: now() })` inserts the room and its first version in one transaction. Emits `settings` (`auto: false`, the version from `db.currentSettings(room.id)`). Writes the event `Room created`. Starts its loop if the manager is started. Emits `room` last. |
| `update(id, changes)` | `id`; `changes`: any of `{ name, volume }` | `Room` | `not_found`, `bad_input` | Validates (section 6.1); unknown keys (`vent` included, C9 6.3) and archived rooms are `bad_input`. `db.updateRoom(id, changes)` with the given (trimmed) fields. If `volume` changed and the room is running, calls `restart(id)` so the adapter uses it (`restart` emits `room`); otherwise emits `room`. The settings' `roomM3` is not changed (a person changes it in the settings). |
| `archive(id)` | `id` | `Room` | `not_found` | Already archived: returns the room unchanged and emits nothing. Running: saves the state, writes `Stopped`, removes the loop. Crashed: removes the loop, no state save. Then `db.archiveRoom(id, now())`, writes the event `Room archived`, emits `room` (with `live: null`). |
| `restart(id)` | `id` | `Room` | `not_found`, `bad_input` (archived) | Running: saves the state, writes `Stopped`, removes the loop. Crashed: removes the loop, no state save. Then starts the loop again from the database (section 8.1), so a new applied calibration, volume, mix, Equipment or air exchange size (the settings' `airM3h`, section 13.1) is used and a crashed room runs again. Emits `room`. C3 calls it for `POST /api/rooms/:id/restart` (C3 section 6.19, the Restart button of a stopped room, lead decision 5) and after a calibration apply (C3 section 6.14). |
| `applySettings(id, settings, note?, options?)` | `id`; `settings`: object (full or partial settings object); `note`: string or `null`, optional; `options`: `{ exact: boolean }`, optional (only `options.exact === true` has an effect; any other value is the same as absent) | `{ settings, warnings, version }` | `not_found`, `bad_input` | Validates with `importSettings`, applies the result to the running controller at once (into the same `cfg` object), stores a new version, saves the state. With `exact`, the stored version holds the given target values exactly (restore). Section 9.2. |
| `ackAlarm(id, alarmKey)` | `id`; `alarmKey`: non-empty string | `Alarm` (C1's return of `ackAlarm`: the newest row with that key) | `not_found`, `bad_input` | Acknowledges the alarm in the database and in the controller. Section 10.2. |
| `on(name, listener)` | `name`: event name; `listener`: `(payload) => void` | `undefined` | – | Adds a listener (section 7). |
| `off(name, listener)` | as `on` | `undefined` | – | Removes a listener. |

| Not a manager method | Where it is done |
|---|---|
| Current settings, settings history, readings, events, alarm lists, calibrations, crop mixes, capacity reports | The API reads the database directly (C1). The current settings are the base: `db.currentSettings(id).settings`. |
| Restore of a settings version | The API reads the version (`db.getSettingsVersion`), then calls `applySettings(id, version.settings, 'Restored version <versionId>', { exact: true })`. |
| Apply a calibration | The API marks the run applied (`db.applyCalibration`), then calls `restart(id)`. |
| Keep the air exchange size in step with the room's machines (lead decision 35) | The settings' `airM3h` is the size the live room runs (controller and simulated room, C9 5.2 and 6.3); the Equipment's `air_m3h` (C8) is the size the farmer recorded. C3 6.26 (`PUT /api/rooms/:id/equipment`) keeps them in step: it saves the Equipment (`db.saveEquipment`), reads the room's current settings (as the settings GET route does), and only when their `airM3h` differs from `air_m3h` calls `applySettings(id, { airM3h: air_m3h }, 'Air exchange size from Your machines')`. That is a partial settings object (section 9.1, "Partial input"): the controller gets the new size at once (into the live `cfg`), the simulated room at its next loop start (section 13.1), and the usual `settings` event follows. C2 adds no function for it. C3 tests it (`tests/api.test.js`: the size differs, a new version and a `settings` event; the size is the same, no new version). |
| Shutdown on Ctrl+C or service stop | `server/main.js` calls `stop()`, then closes the database. |
| Demo room | `start()` only (above). |

## 5. Data shapes

### 5.1 Room

The C1 `Room` plus `live`.

| Field | Type | Unit | Notes |
|---|---|---|---|
| `id` | integer | – | |
| `name` | string | – | 1–60 characters |
| `volume` | number | m³ | 5–5000 |
| `adapter` | `'sim'` | – | Version 1 has only the simulated adapter |
| `created_at` | integer | s | |
| `archived_at` | integer \| null | s | |
| `live` | `Live` \| null | – | `null` when the room is archived |

### 5.2 Live

| Field | Type | Unit | Notes |
|---|---|---|---|
| `reading` | `ReadingRow` (C1 `Reading`) \| null | – | The newest reading. At loop start: the newest row `db.queryReadings` returns for the last `RECENT_READING_S` (section 8.1, step 1), or `null`. After each Record: the row just written (section 8.2). Both are C1 `Reading`s with the same keys (section 5.3), so `live.reading` has one shape. |
| `stage` | string \| null | – | `cfg.stage`; `null` when the loop never got a `cfg` (start failed early) |
| `crop` | string \| null | – | `cfg.crop` |
| `targets` | `{ T, RH, CO2 }` \| null | °C, %, ppm | The targets now: `T = cfg.spT`, `RH = Math.round(ctl.state.rhT * 10) / 10` (humidity target now, moves with temperature in VPD mode; rounded to one decimal because in VPD mode `ctl.state.rhT` is an unrounded float such as 87.62903745…, and C5 prints it as the chart's `Target <spRH> % ± 3`), `CO2 = cfg.co2Lim`. During a ramp they differ from the stored settings. `null` without a controller. Not part of the summary (section 7). |
| `status` | `{ T, RH, CO2 }` \| null | – | Each is `ctl.status(kind)` = `{ lvl, icon, text }` (`lvl`: `good`, `info`, `warning`, `serious`, `critical`). `null` while `reading` is `null` or without a controller. Not part of the summary (section 7). |
| `alarms` | integer | – | Number of active alarms = size of the room's open map (the C1 rows with `cleared_at = null`; the same count C3 shows). `0` before the open map is loaded. |
| `running` | boolean | – | |
| `error` | string \| null | – | The crash message of a stopped room (`err.message`); `null` otherwise |
| `flush` | integer \| null | – | Revision 8. `ctl.programStatus(t).flush` with `t` = `live.reading.t`, or `now()` without a reading; `null` without a controller. Not part of the summary (section 7, lead decision 27). |
| `blocks` | integer \| null | blocks | Revision 8. The `blocks` the adapter factory got at loop start (section 8.1 step 3): the mix sum, or `null` when it is below 1. Not part of the summary. |
| `air` | object \| null | – | Revision 9 (lead decision 27 as amended). The air exchange of the running controller, for the Live tab (C5 3.4), built after each Record from `ctl.state`, `cfg` and `ctl.purges()` with `t` = `live.reading.t`: `{ on, state, reason, delayed, timed, manual, manualOn, nextPurgeS, purgeS, why, today }`. `on` = `ctl.state.cmd.air.on`; `state` = `ctl.state.air.state`, exactly C9 5.3's states `'idle'`, `'purge'`, `'after'`; `reason` = `ctl.state.airReason` (C9 5.3: `'purge'`, `'safety'`, `'timed'`, `'free cooling'`, `'drying'`, `'manual'`, or `null` when off); `delayed`, `timed` = `ctl.state.air.delayed`, `.timed`; `manual` = `cfg.manual.air.auto === false`; `manualOn` = `!!cfg.manual.air.on`; `nextPurgeS` = `ctl.state.air.nextPurgeS` (s or `null`); `purgeS` = `t − ctl.purges().cur.start` (whole s) while `on`, else `null`; `why` = `ctl.state.why.air` (string or `null`); `today` = `{ purges, avgS, capped }` over `ctl.purges().events` with `reason === 'purge'` and `start` at or after 00:00 farm time of `t` (`avgS` = mean of `end − start`, `null` when `purges` is 0; `capped` = the count with `capped`). `null` before the first reading or without a controller. Not part of the summary (section 7): a change alone sends no `room` event; the page refreshes it with `listRooms()` (C5 3.4). |

### 5.3 ReadingRow (exactly C1's `Reading`)

The row is C1's `Reading` (C1 section 6.2), with the one set of keys of lead decision 1: C2 builds it with these keys,
C1 stores and returns them, C3 sends them unchanged and C5 reads them. No contract renames them. For each new adapter
reading, with the commands the controller decided for it (`onReading(r, cmd)` of `runtime.js`), the manager builds the
row below, writes it with `db.insertReading(id, row)`, and sets `live.reading = row` (the same object). It equals
(`assert.deepStrictEqual`) the row `db.queryReadings` and `db.latestReading` later return for it.

| Field | Type | Unit | From |
|---|---|---|---|
| `room_id` | integer | – | The room id (`id`; C1 accepts it because it equals the `roomId` argument) |
| `t` | integer | s | `Math.round(r.t)` |
| `T` | number \| null | °C | `r.T` if a finite number, else `null` |
| `RH` | number \| null | % | `r.RH`, same rule |
| `CO2` | number \| null | ppm | `r.CO2`, same rule (for the simulated room it can carry the `1e-6` jitter of section 13.1, which is kept as given) |
| `t_out` | number \| null | °C | `r.tOut`, same rule |
| `rh_out` | number \| null | % | `r.rhOut`, same rule |
| `ac_mode` | `'off'` \| `'cool'` \| `'heat'` \| `'dry'` \| `'fan'` | – | `cmd.ac.power ? cmd.ac.mode : 'off'` |
| `ac_setpoint` | number \| null | °C | `cmd.ac.power ? cmd.ac.setpoint : null` |
| `fog` | integer 0–3 | level | `Math.min(3, Math.max(0, Math.round(cmd.hu.level \|\| 0)))`: the level the simulated fogger really runs (the `level()` rule of `sim.js`). `importSettings` does not round `manual.hu.level` or `protect.faultFogLevel`, so the command can be `1.5`. |
| `air` | 0 \| 1 | – | `cmd.air && cmd.air.on ? 1 : 0` (C9 6.3): `1` while the air exchange (intake `SF-203` and exhaust `EF-206`) is on |
| `lights` | 0 \| 1 | – | `cmd.lights.on ? 1 : 0` |
| `circ` | 0 \| 1 | – | `cmd.circ.on ? 1 : 0` |
| `power_w` | number \| null | W | Sum of the finite values of `r.power` (`ac`, `hu`, `air`, `lights`, `circ`; C9 4.2); `null` when the adapter gives no `power` |
| `kwh` | number \| null | kWh | Sum of the finite values of `r.kwh`: the meter since the simulated room began (kept across restarts in the sim snapshot); `null` when the adapter gives no `kwh` |
| `ac_fan` | `'low'` \| `'auto'` \| `'high'` \| null | – | Revision 8. `cmd.ac.power ? (['low', 'auto', 'high'].includes(cmd.ac.fan) ? cmd.ac.fan : 'auto') : null` (the rule `sim.js` applies, so C1's `CHECK` cannot fail and stop the server) |
| `stage` | string | – | Revision 8. `cfg.stage` after the controller's decision at this reading (one of `ClimateController.STAGES`) |
| `core` | number \| null | °C | Revision 8. `r.core` if a finite number, else `null` (the block core probe) |

No other key is passed. So a row never breaks C1's `fog`, `air` and `ac_fan` CHECKs (an error there during a tick would be
`fatal`, section 11, and would repeat at every server start). Sensor values are stored as the adapter gave them (no filtering), as `docs/contract.md` asks;
the charts hide implausible values.

### 5.4 Event (C1 `Event`)

Written with `db.addEvent(roomId, { t, level, text })`, which returns the stored row.

| Field | Type | Unit | Notes |
|---|---|---|---|
| `id` | integer | – | From the database |
| `room_id` | integer | – | From the database |
| `t` | integer | s | Controller events: `Math.round(ev.t)` (the reading time). Manager events: `now()`. |
| `level` | `'info'` \| `'good'` \| `'warning'` \| `'serious'` \| `'critical'` | – | Controller events: `ev.lvl` |
| `text` | string | – | Controller events: `ev.text` |

### 5.5 Alarm (C1 `Alarm`)

| Field | Type | Unit | Notes |
|---|---|---|---|
| `id` | integer | – | From the database |
| `room_id` | integer | – | From the database |
| `alarm_key` | string | – | The controller's alarm id: `tHi`, `tLo`, `tCrop`, `coreHi`, `rhHi`, `rhLo`, `co2Hi`, `co2Safe`, `disagree`, `acTooSmall`, `blocksDone`, `shockLimit`, `airTooSmall` (C9 5.5), `sensor_<key>` (for example `sensor_RH`) |
| `level` | `'warning'` \| `'serious'` \| `'critical'` | – | The controller alarm's `lvl` |
| `label` | string | – | The controller alarm's `label` |
| `raised_at` | integer | s | `Math.round(alarm.since)` |
| `cleared_at` | integer \| null | s | The time of the reading at which the manager saw it inactive (`now()` at the end of `applySettings`) |
| `acked_at` | integer \| null | s | `now()` at acknowledgement |

### 5.6 SettingsVersion (C1 `SettingsVersion`)

Returned by `db.saveSettings` and `db.currentSettings`.

| Field | Type | Unit | Notes |
|---|---|---|---|
| `id` | integer | – | From the database |
| `room_id` | integer | – | |
| `saved_at` | integer | s | `now()` |
| `note` | string \| null | – | Trimmed; `null` when empty or absent. `Created` for the first version. |
| `settings` | object | – | The stored settings object (section 2), not a settings file |

## 6. Input rules and errors

### 6.1 Input rules

| Field | Rule | `details` text when broken |
|---|---|---|
| `name` | String; trimmed; 1–60 characters | `name must be 1 to 60 characters` |
| `volume` | Finite number, 5–5000 | `volume must be a number from 5 to 5000 (m³)` |
| `settings` in `create` | Optional. `undefined` (key left out, or present with the value `undefined`) means absent (section 9.4, first row). Any other value must be a plain object (not array, not `null`). | `settings must be an object` |
| `settings` in `applySettings` | Required: a plain object (not array, not `null`, not `undefined`) | `settings must be an object` |
| `settings` (content) | `importSettings` must not throw | The thrown message |
| `note` | String, `null` or absent; trimmed; at most 200 characters | `note must be text of at most 200 characters` |
| `alarmKey` | Non-empty string (an empty key would acknowledge every alarm in `ctl.ack`) | `alarmKey must be a non-empty string` |
| `update` keys | Only `name`, `volume` (a `vent` is an unknown field, C9 6.3) | `unknown field "<key>"` (for example `unknown field "vent"`) |
| `create` keys | `name` and `volume` required, `settings` optional; any other key (for example an old `vent`) is ignored and not stored (C9 6.3) | – |
| Archived room | `update`, `restart`, `applySettings` refuse it | `room <id> is archived` |

All broken rules are reported together in `details`. Settings keys named
`__proto__`, `constructor` or `prototype` are not an error: `cleanSettings` drops them with a warning (section 6.3).

### 6.2 `RoomError`

`class RoomError extends Error`, defined in `server/rooms-common.js` (section 6.3) and re-exported by
`server/rooms.js`. `new RoomError(code, message, details)` sets `name = 'RoomError'`, `code`, `message` and `details`.
Any other error thrown by a method is a server fault.

| `code` | `message` | `details` | C3 maps it to |
|---|---|---|---|
| `bad_input` | `Bad input` | string[] (section 6.1) | HTTP 400 |
| `not_found` | `Room <id> not found` or `No alarm "<key>" in room <id>` | `[]` | HTTP 404 |

An unknown or non-integer `id` is `not_found`: the manager calls `db.getRoom(id)` inside a `try` and turns a
`NotFoundError` (`what: 'room'`) into `not_found`. `db.ackAlarm`'s `NotFoundError` (`what: 'alarm'`) becomes
`No alarm "<key>" in room <id>`.

| Caller | How it recognises a room error |
|---|---|
| Any caller (C3, tests) | `err.name === 'RoomError'` and `err.code` (`'bad_input'` or `'not_found'`), or `err instanceof RoomError` with the class from `server/rooms-common.js`. The real manager and the fake throw the same class, so both checks hold for both. |
| C3 `server/api.js` | Never imports `server/rooms.js` (it does not exist in the API stream's worktree in wave 1). |

### 6.3 Shared module `server/rooms-common.js`

Written by the lead in wave 0 (with the fakes), so `server/rooms.js` and `tests/fakes/rooms.js` use the same code.
CommonJS: `module.exports = { RoomError, DEMO_ROOM, FIRST_NOTE, cleanSettings }`. It loads nothing.

| Export | Signature or value | Contract |
|---|---|---|
| `RoomError` | `new RoomError(code, message, details)` | Section 6.2. `details` defaults to `[]`. |
| `DEMO_ROOM` | `{ name: 'Room 1', volume: 60 }` (frozen with `Object.freeze`; no `vent`, C9 6.3) | Section 3 |
| `FIRST_NOTE` | `'Created'` | Section 3 |
| `cleanSettings` | `(settings: object, base?: object) → { settings: object, warnings: string[] }` | `settings` is untrusted; `base` is a trusted settings object (a stored version), or absent (then `{}`). Returns a new object: a deep copy of `base` with `settings` laid over it by the rule of `ClimateController.applySettings` (a plain-object value whose key holds a plain object in the copy is merged key by key; any other value, arrays included, replaces it). It walks `Object.keys` of `settings` (own keys, which include a `"__proto__"` key made by `JSON.parse`) and leaves out, at any depth, every key named `__proto__`, `constructor` or `prototype`, adding one warning per key left out: `Setting "<dot path>" is not allowed: ignored.` (for example `Setting "rules.__proto__" is not allowed: ignored.`). Every object and array of the result is new (fresh `{}` literals and arrays; values from `settings` are deep-copied), so no key reaches `Object.prototype` and the result shares nothing with either argument. Pure: neither argument is changed. Without `base` it is a cleaned deep copy of `settings`. |

Why (lead decision 6): `ClimateController.applySettings(target, src)` recurses into `target[k]` for every own key of
`src`, and `target['__proto__']` is `Object.prototype`, so a settings body `{"__proto__":{"polluted":1}}` passed to it
sets `({}).polluted = 1` in the whole server process (checked on Node 22.20). That is why outside settings never reach
`ClimateController.applySettings`; the merge over the base is done here instead. `importSettings` does not pollute, but
its `k in dst` check lets these keys through to odd warnings (`Unknown setting "__proto__.polluted" is ignored.`) or a
`TypeError` (`{"__proto__":{"__proto__":{}}}`), so `cleanSettings` drops them first with a clear warning. Every
settings object that comes from outside the manager goes through `cleanSettings`, then `upgradeSettings` and
`importSettings` (sections 9.2 steps 2 and 3, and 9.4; C9 6.3).

## 7. Events emitted

Listeners run synchronously, in the order added. An error thrown by a listener is caught and logged with
`console.error`; it never stops a loop and is never treated as a room crash. Each payload is emitted after its
database write succeeded, so the live feed never shows unsaved data.

| Event | When | Payload |
|---|---|---|
| `reading` | After each reading row is written | `{ roomId, live }`: `live` is the room's `Live` (section 5.2) with `live.reading` = the new row, a C1 `Reading` (section 5.3: keys `room_id`, `t`, `T`, `RH`, `CO2`, … of lead decision 1, and no other key) |
| `event` | After each events row is written (controller events and manager events) | `{ roomId, event }`: `event` is the C1 `Event` returned by `addEvent` |
| `alarm` | After an alarms row is inserted, cleared or acknowledged | `{ roomId, change, alarm }`: `change` is `'raised'`, `'cleared'` or `'acked'`; `alarm` is the C1 `Alarm` after the change |
| `settings` | After each settings version is stored (`create`, `applySettings`, automatic); not after the upgrade save of section 8.1 step 2 | `{ roomId, version, settings, warnings, auto }`: `version` is the C1 `SettingsVersion` (with its `settings`); `settings` = `version.settings`; `warnings` string[] (`[]` for automatic versions); `auto` boolean |
| `room` | Always after `create`, `update`, `archive` (when it archives), `restart`, a crash, and for each room started by `start()`. Also when the room's summary (`live.stage`, `live.crop`, `live.alarms`, `live.running`, `live.error`) differs from the last summary emitted for that room, checked at the end of each tick of the room (section 8.2), of `applySettings` and of `ackAlarm` | `{ room }`: the `Room` as `get(id)` returns it. Every `room` emit stores the room's summary as the last emitted one. |
| `fatal` | A database error during a tick (section 11) | `{ error }`: the `Error`. Not sent to the live feed; `server/main.js` listens, prints the message and exits with code 1. |

`roomId` is the integer room id. The live feed (C4, C3 section 10.2) sends `reading`, `event`, `alarm`, `settings` and
`room`, one message per emit, with the `data` that C3 section 10.2 takes from each payload (C2 does not define the
browser's shape).

| `room` event rule (lead decision 2) | Detail |
|---|---|
| Owner | C2 owns every `room` event: the lifecycle ones (`create`, `update`, `archive`, `restart`, a crash, each room started by `start()`) and the summary ones (end of a tick of the room, end of `applySettings`, end of `ackAlarm`, each only when the summary changed). |
| Summary | `{ stage, crop, alarms, running, error }` of `live`, built in that fixed key order (lead decision 2). It is compared as `JSON.stringify(summary)` text with the text of the last emitted one. `live.reading`, `live.targets`, `live.status`, `live.flush` and `live.blocks` are not part of it: the `reading` event carries the reading, and a change of only the targets, the status chips, the flush or the block count sends no `room`. |
| Targets and status | They stay in `Live` and in every `room` payload, `list()` and `get(id)`. They reach the page through C5's `listRooms()` refresh (at most once per 30 s, after a `reading`; C5 sections 3.2 and 3.4). They are left out of the summary because in VPD mode (`humMode: 'vpd'`, the default) `targets.RH` (from `ctl.state.rhT`, section 5.2) is recomputed from the measured T at every reading, so comparing them would send a `room` per reading per room. |
| Rate | At most one summary `room` per room per tick (section 8.2 step 4), and at most one per `applySettings` or `ackAlarm` call. In practice only at a stage or crop change, an alarm raise or clear (a change of the open count), and a crash. |
| C3 | Only relays the C2 `room` events to the stream; it derives no `room` event of its own (not from `reading`, not after a request). |

## 8. The room loop

### 8.1 Loop start (fresh or resumed)

Database reads come first, then the steps that can crash, then the database writes.

| Step | Action |
|---|---|
| 1 | Reads: `open` = `db.listAlarms(id, { recent: 0 })` (only open rows) kept by `alarm_key`; `version = db.currentSettings(id)`; `saved = db.loadControllerState(id)` (or `null`); `calibRow = db.currentCalibration(id)` (or `null`); `mix = db.getMix(id)`; `equipment = db.getEquipment(id)` (or `null`; revision 8); `rows = db.queryReadings(id, { from: now() - RECENT_READING_S, to: now() })`, `live.reading` = the last of `rows` as returned (a C1 `Reading`, no conversion), or `null`. |
| 2 | `{ settings: upgraded, warnings: upgradeWarnings } = ClimateController.upgradeSettings(version.settings)` (C9 6.3); `{ settings: cfg, warnings: imported } = importSettings({ format: 'mushroom-climate-settings', version: ClimateController.SETTINGS_VERSION, settings: upgraded })`; `warnings = upgradeWarnings.concat(imported)`. This is the live `cfg`. The base = a deep copy of `cfg`. Upgrade saved once (C9 6.3): when `upgradeWarnings` is not empty, `db.saveSettings(id, { settings: cfg, note: 'Upgraded: air exchange', at: now() })`, so the next start upgrades nothing and the "was removed" warnings are written once (step 7), not at every start. This save writes no event of its own and emits no `settings`. |
| 3 | `calib` = `calibRow` mapped to `{ ua, infAch, moistBuffer, co2PerBlock }` (from `ua`, `inf_ach`, `moist_buffer`, `co2_per_block`), or `null`. `sum` = the sum of `blocks` over the rows of `mix`; `blocks` = `sum` when `sum ≥ 1`, else `null`. `live.blocks = blocks`. `adapter = adapterFactory({ room, calib, blocks, equipment, cfg, snapshot: saved ? saved.sim : null, now })`. A mix or equipment saved later takes effect at the next loop start (a restart; no new trigger: C3 6.16 and 6.26 do not restart the room). The Equipment's `air_m3h` reaches the room through the settings' `airM3h` instead (section 4, "Not a manager method"; section 13.1). |
| 4 | `ctl = ClimateController.create(cfg, saved ? saved.controller : null, onEvent)`. `onEvent(ev)` keeps the event (`{ t, lvl, text }`) to be written later. |
| 5 | Resumed only: for each controller alarm `a` of `ctl.alarmList()` with `a.acked === false` whose open row `open.get(a.id)` has `acked_at` set: `ctl.ack(a.id)` (an acknowledgement made while the room was crashed, or after the last state save, is not lost). |
| 6a | Fresh (`saved` is `null`): `runtime = ClimateRuntime.createRuntime({ io: adapter.io, ctl, onReading })`, then `runtime.poll()` once, so the first command goes out at once (as `app.js` `reset()` does). |
| 6b | Resumed: `adapter.io.write(ctl.state.cmd)` (the machines keep the last command), then `runtime = createRuntime({ io: adapter.io, ctl, onReading, skipCurrent: true })`, so the reading the controller already used is not fed again. No readings are made up for the gap. |
| 7 | Writes: each settings warning as an event (`warning`, `Settings: <warning>`); the event `Started` (fresh) or `Resumed after <N> min stopped` with `N = Math.round((now() - saved.saved_at) / 60)` (resumed); fresh only: the reading of step 6a is recorded (section 8.2, Record) and the state is saved at once (section 8.4), so a restart within 300 s resumes instead of starting fresh. `lastNow = now()`. `stateSavedAt = now()`. |
| On error | Any error thrown in steps 2–6 (not by a db function): the room is stopped with `error = err.message`. Events kept by `onEvent` are written, then the event `Stopped by an error: <message>` (`serious`). Other rooms still start. A db error in step 1, the step 2 upgrade save, or step 7 is thrown to the caller (`start`, `create`, `restart`); the upgrade save sits outside the steps 2–6 `try` (on `master` it is inside: Server 2 moves it, revision 9 change table, with a test). |

### 8.2 One tick of a running room

| Step | Action |
|---|---|
| 1 | `t = now()`; `dt = t - lastNow`; `lastNow = t`. A negative `dt` (clock set back) counts as `0`. |
| 2 | Drive the loop, one simulated second at a time, as `app.js` `tick()` and `tests/harness.js` do: if the adapter has `io.advance` and `1 ≤ dt ≤ MAX_CATCH_UP_S`: repeat `dt` times { `adapter.io.advance(1)`; `runtime.poll()`; if it returned `true`, Record }. If the adapter has `io.advance` and `dt > MAX_CATCH_UP_S`: `adapter.io.advance(dt)` once (the adapter treats it as a gap, section 13.1), then `runtime.poll()`, Record if `true`. Otherwise (`dt = 0`, or no `io.advance`): `runtime.poll()` once, Record if `true`. |
| Record | For one new adapter reading (`onReading(r, cmd)` kept `r` and `cmd`), in this order, each emitted after its write: (a) the ReadingRow `row` (section 5.3, with `room_id: id`): `db.insertReading(id, row)`, `live.reading = row`, emit `reading`; (b) the controller events kept by `onEvent`: `db.addEvent(id, { t: Math.round(ev.t), level: ev.lvl, text: ev.text })`, emit `event`; (c) alarm changes (section 10.1) with `t = row.t`; (d) an automatic settings version (section 9.3). So after a 300 s stall each of the up to 10 readings is decided on and recorded. |
| 3 | If `t - stateSavedAt >= STATE_SAVE_S`: save the state (section 8.4). |
| 4 | Summary check: if the room's summary `{ stage, crop, alarms, running, error }` (section 7) differs from the last one emitted, emit `room`. A change of only `live.targets` or `live.status` emits nothing. |
| Error | An error thrown by `io.advance`, `runtime.poll` (which calls `io.read`, `ctl.update`, `io.write`, `onReading`) or another adapter or controller call: room crash (section 11). Readings already recorded stay; the events kept from the failing step are written before the crash event. An error thrown by a db function: database error (section 11). |

### 8.3 What is recorded and when

| What | Table | When |
|---|---|---|
| Each new controller reading (one per sensor period, 30 s by default) | `readings` | Record (section 8.2), one row (section 5.3) |
| Each controller event (`onEvent`) | `events` | Record, loop start, or at the end of `applySettings` for events from `setStage`, `setCrop`, `setFarmType` |
| Manager events | `events` | Section 8.5 |
| Alarm raised, cleared, acknowledged | `alarms` | Section 10 |
| Settings version | `room_settings` | `create` (first version, inside `db.createRoom`), `applySettings`, automatic versions (section 9.3), the upgrade save at loop start (section 8.1 step 2, C9 6.3) |
| Controller and adapter state | `controller_state` (one row per room, replaced) | At a fresh loop start; every 300 s of `now()`; at `stop()`, `archive`, `restart` (running rooms); after each settings version of a running room; after `ackAlarm` on a running room |

### 8.4 State save

`db.saveControllerState(id, { controller: ctl.snapshot(), sim: adapter.snapshot(), at: now() })`, then
`stateSavedAt = now()`. The values are plain objects; the database stores them as JSON text (keeping `Infinity` and
`NaN`, C1 section 5). JSON drops `undefined` values (for example `st.v.core` when no probe is installed); the
controller treats a missing value the same way. A crashed room's state is never saved (it may be half-updated).

### 8.5 Events the manager writes

All with `t = now()`, through `db.addEvent`, each followed by an `event` emit.

| When | `level` | `text` |
|---|---|---|
| `create` | `info` | `Room created` |
| Loop start, fresh | `info` | `Started` |
| Loop start, resumed | `info` | `Resumed after <N> min stopped` |
| Settings warnings at loop start | `warning` | `Settings: <warning>` |
| `stop`, `archive`, `restart` of a running room | `info` | `Stopped` |
| Room crash | `serious` | `Stopped by an error: <message>` |
| `archive` | `info` | `Room archived` |
| `applySettings` with `exact` on a running room that called `setStage`, `setCrop` or `setFarmType` (section 9.2 step 10) | `info` | `Targets restored: <cfg.spT> °C, <cfg.spRH> % RH, CO₂ limit <cfg.co2Lim> ppm, no ramp.` (numbers as JavaScript prints them, the style of the controller's `Stage: …` event) |
| Settings version from `applySettings` or automatic | `info` | `Settings saved (version <id>)` plus `: <note>` when there is a note |
| `ackAlarm` that changed at least one row | `info` | `Acknowledged: <label>` |

## 9. Settings on a live room

### 9.1 Rules

| Rule | Detail |
|---|---|
| One object | The controller keeps the live `cfg` by reference. New settings are copied into it with `ClimateController.applySettings(cfg, next)`, where `next` is always an `importSettings` result; the object is never replaced. |
| Untrusted input (lead decision 6) | Every settings object given to `create` or `applySettings` (from HTTP, an import or a restored version) goes through `cleanSettings` (section 6.3), then `ClimateController.upgradeSettings` and `importSettings` (C9 6.3). Only the `importSettings` result is applied to `cfg` and stored. Outside settings are never passed to `ClimateController.applySettings`, and keys named `__proto__`, `constructor` or `prototype` never reach `importSettings`. |
| Validation | Always through `upgradeSettings`, then `importSettings`. A removed key (C9 5.2) is dropped by `upgradeSettings` with its warning (`manual.fan` becomes `manual.air`). A value `importSettings` rejects falls back to the controller default (its warning says so), not to the previous value. |
| Partial input | The input is merged over the base by `cleanSettings(settings, base)` before `importSettings`, so a partial object changes only the given settings and a missing setting keeps the base value (C3 section 6.5, "Rule for missing settings"). The base is upgraded before the merge (C9 6.3, "Base before merge"), so a version 1 base never overwrites a `manual.air` the input gives. The Your machines save uses this with `{ airM3h }` (section 4). |
| Stage, crop, farm type | A change goes through `ctl.setFarmType`, `ctl.setCrop` or `ctl.setStage`, as the Simulator's buttons do: the stage timer restarts and the targets ramp to the crop profile over `program.rampH` hours (a farm-type change also resets the flush count). The ramp starts from the targets in `cfg` at that moment, and owns the targets: a target edited in the same save is the ramp's start value, not kept. Exception: `exact` (next row). |
| Lowering CO₂ limit (lead decision 56, C9 revision 2) | Exception to the ramp: when a stage, crop or farm-type change lowers the CO₂ limit, `co2Lim`, `rules.fanOn` and `rules.fanOff` take the new values at once (T, RH and `rules.co2SafetyAt` still ramp). Server 2's tests must not depend on these three keys ramping after a lowering change (they hold only on `master` until the Equipment merge). |
| Exact (restore) | With `options.exact === true`, every target key takes the value of the new settings, and after a stage, crop or farm-type call the ramp is cancelled and those values are written again, so the stored version equals the `importSettings` result of the given settings (the restored version). The stage timer still restarts. |
| Targets | Each target key is handled on its own. A key whose value in the new settings differs from the base is a person's change: its new value is written into `cfg`. A key equal to the base keeps its live value (during a ramp, the value the ramp has reached), so an edit of one target does not move the others back to the stored version. If at least one key changed (and stage, crop and farm type did not), `ctl.cancelRamp()` is called, as the Simulator does when a target is edited: the other targets stay at their live values. An edit of no target key does not stop a ramp. |
| Pairs | A kept live value and a changed value can break the CO₂ pair rule that `importSettings` enforces (`rules.fanOff ≤ rules.fanOn − 50`; the purge's start and stop levels, the only pair since C9 6.3). Section 9.2 step 7 corrects the changed key, with a warning, before the version is stored. It never moves the kept live value, by the rule of the Targets row: an edit of one target does not move the others. `rules.rhStop` and `rules.rhResume` are not target keys, so they always come from `importSettings` together and already agree. |
| Version content | Each stored version is a deep copy of the live `cfg` right after the change (the `settings` returned and emitted). |
| Restart | A room restarts from its latest version; a ramp in progress continues from the saved controller state, which holds the ramp's start and end values. |

### 9.2 `applySettings(id, settings, note, options)` steps

`exact` below means `options` is an object with `options.exact === true`.

| Step | Action |
|---|---|
| 1 | Check the room (`not_found`; archived → `bad_input`), `settings` and `note` (section 6.1). `base` = the room's base in memory (already upgraded at loop start, `baseWarnings = []`), or, when the manager has not loaded the room, `{ settings: base, warnings: baseWarnings } = ClimateController.upgradeSettings(db.currentSettings(id).settings)`: the stored base is upgraded BEFORE the input is merged over it (C9 6.3, "Base before merge"). |
| 2 | `{ settings: merged, warnings: dropped } = cleanSettings(settings, base)` (section 6.3): the cleaned input laid over a copy of the base. `ClimateController.applySettings` is not used here (lead decision 6). |
| 3 | `{ settings: upgraded, warnings: upgradeWarnings } = ClimateController.upgradeSettings(merged)` (the input itself may be a version 1 object, for example a restored old version); `{ settings: next, warnings: imported } = importSettings({ format: 'mushroom-climate-settings', version: ClimateController.SETTINGS_VERSION, settings: upgraded })`. A throw is `bad_input` with the message; nothing is stored. `warnings = baseWarnings.concat(dropped, upgradeWarnings, imported)`. |
| 4 | Room not running (stopped or crashed): `stored = next`; go to step 11. |
| 5 | `keep` = for each `k` of `TARGET_KEYS`, `get(cfg, k)` (the live values). `changed` = with `exact`: all of `TARGET_KEYS`; otherwise the keys `k` of `TARGET_KEYS` with `get(next, k) !== get(base, k)`. `ClimateController.applySettings(cfg, next)` (`next` is the `importSettings` result of step 3, never the input). |
| 6 | For each `k` of `TARGET_KEYS` not in `changed`: `set(cfg, k, keep[k])`. (The keys in `changed` keep the value of `next`.) |
| 7 | Pair correction, for the one pair (`hi`, `lo`) = (`rules.fanOn`, `rules.fanOff`) (C9 6.3): if `get(cfg, lo) > get(cfg, hi) - 50` and exactly one of the two keys is in `changed`, move that key away from the kept one: `lo` changed → `set(cfg, lo, get(cfg, hi) - 50)`; `hi` changed → `set(cfg, hi, get(cfg, lo) + 50)`. Each correction adds the warning `"<changed key>" = <value given> must be at least 50 ppm <below \| above> "<kept key>" (<kept value> now): set to <new value>.` (for example `"rules.fanOff" = 800 must be at least 50 ppm below "rules.fanOn" (600 now): set to 550.`). When both or neither are in `changed`, the pair already agrees (from `importSettings`, or from a ramp between two valid profiles). |
| 8 | `t = runtime.reading ? runtime.reading.t : now()`. |
| 9 | If `next.farmType !== base.farmType`: `ctl.setFarmType(next.farmType, t)`. Else if `next.crop !== base.crop`: `ctl.setCrop(next.crop, t)`. Else if `next.stage !== base.stage`: `ctl.setStage(next.stage, t)`. Then: with `exact`, `ctl.cancelRamp()` and `set(cfg, k, get(next, k))` for each `k` of `TARGET_KEYS` (the ramp the call started is dropped and the restored targets stay); without `exact`, if none of the three calls was made and `changed` is not empty, `ctl.cancelRamp()`. |
| 10 | `stored = structuredClone(cfg)`. Write the controller events kept since step 5; then, with `exact` when step 9 made one of the three calls, the event `Targets restored: …` (section 8.5), because the controller's `Stage: …` event names the profile targets of a ramp that step 9 cancelled; then alarm changes (section 10.1, with `t = now()`). |
| 11 | `version = db.saveSettings(id, { settings: stored, note, at: now() })` (`note` trimmed, `null` when empty or absent); base = `structuredClone(stored)`. Write the event `Settings saved (version <id>)…`. |
| 12 | Running room: save the state (section 8.4). |
| 13 | Emit `settings` with `auto: false` and `warnings`. Summary check (emit `room` when it differs, section 7). Return `{ settings: stored, warnings, version }`. |
| Error in steps 5–9 | Room crash (section 11); the version is still stored with `stored = next` (steps 11 and 13; no state save), and the method returns normally. |

With `exact`, the stored version equals `next`, which is the `importSettings` result of the restored version merged
over the base (a key the old version does not have keeps the room's current value).

### 9.3 Automatic versions

The controller changes `cfg` itself: an automatic stage change, and the targets at the end of a ramp or cold shock.
After each recorded reading (section 8.2, Record step d) the manager compares the live `cfg` with the base:

| Check (in this order) | Note of the new version |
|---|---|
| `cfg.stage !== base.stage` | `Automatic: stage <ClimateController.STAGES[cfg.stage]>` |
| `ctl.state.stage.ramp` is `null` and `get(cfg, k) !== get(base, k)` for some `k` of `TARGET_KEYS` | `Automatic: targets for <ClimateController.STAGES[cfg.stage]> reached` |

On a match it stores `db.saveSettings(id, { settings: structuredClone(cfg), note, at: now() })`, sets the base to a
copy of it, writes the event `Settings saved (version <id>): <note>`, saves the state at once, and emits `settings`
with `auto: true` and `warnings: []`. During a ramp no version is stored, because the saved ramp recomputes the
targets after a restart.

### 9.4 First settings of a new room

`create` passes the result to `db.createRoom` as `settings`, with `note: 'Created'` (`FIRST_NOTE`) in every case. Every
create uses the same base: `base = ClimateController.defaultSettings()` with `base.roomM3 = volume`. Given settings
are merged over it as `applySettings` merges over a stored version, so the same volume always gives the same
`roomM3` unless the input sets `roomM3` itself.

| Input | Stored version | `warnings` returned by `create` |
|---|---|---|
| `settings` absent: the key is left out, or present with the value `undefined` | `base` | `[]` |
| `settings` given (a plain object) | `{ settings: merged, warnings: dropped } = cleanSettings(settings, base)`; then `ClimateController.upgradeSettings(merged)` (C9 6.3) and `importSettings({ format: 'mushroom-climate-settings', version: ClimateController.SETTINGS_VERSION, settings: <the upgraded settings> }).settings`. A missing setting takes the `base` value (its default, and `roomM3 = volume`); a given `roomM3` wins. | `dropped`, then `upgradeSettings`' warnings, then `importSettings`' warnings |
| Demo room (`start()` calls `create(DEMO_ROOM)`) | `base` (grey oyster, fruiting) with `roomM3 = 60` | `[]` |

C3 section 6.2 ("a missing setting takes its default") must read "… takes its default (`roomM3` = `volume`)".

## 10. Alarms

### 10.1 Raise and clear (detection from the controller's alarm state)

Done after each recorded reading and at the end of `applySettings`. `active` = `ctl.alarmList().filter(a => a.active)`
(each `{ id, label, lvl, active, acked, since }`); `open` = the room's open map.

| Case | Database | Emit |
|---|---|---|
| Key in `active`, not in `open`, `a.acked` false | `row = db.raiseAlarm(id, { alarm_key: a.id, level: a.lvl, label: a.label, at: Math.round(a.since) })`; `open.set(a.id, row)` | `alarm`, `'raised'`, `row` |
| Key in `active`, not in `open`, `a.acked` true (a resumed controller that already had it acknowledged) | `db.raiseAlarm(…)` as above, then `row = db.ackAlarm(id, a.id, now())` (C1 also marks older unacknowledged rows of the key, as the controller's `ack` would); `open.set(a.id, row)` | `alarm`, `'raised'`, `row` (with `acked_at` set) |
| Key in `open`, not in `active` | `row = db.clearAlarm(id, key, t)` with `t` = the reading time (`row.t` of the reading row), or `now()` at the end of `applySettings`; `open.delete(key)`. A `null` return (no open row) emits nothing. | `alarm`, `'cleared'`, `row` |
| Key in both | Nothing | – |

After a restart the open map comes from the database, so an alarm that cleared or was raised in the last minutes
before the stop is put right at the first reading.

### 10.2 `ackAlarm(id, alarmKey)` steps

| Step | Action |
|---|---|
| 1 | Check the room (`not_found`) and `alarmKey` (`bad_input`). Archived rooms are allowed. |
| 2 | `at = now()`. `pending` = the rows of `db.listAlarms(id, { recent: ACK_SCAN })` with `alarm_key === alarmKey` and `acked_at === null` (the rows this call will change; C1 also changes older rows beyond the scan, which are not emitted). |
| 3 | `latest = db.ackAlarm(id, alarmKey, at)`. `NotFoundError` (`what: 'alarm'`) → `not_found` (`No alarm "<key>" in room <id>`); nothing has changed. |
| 4 | If the room has a controller (running or crashed): `ctl.ack(alarmKey)` (marks it acknowledged; an inactive one leaves the controller's list). If the open map has the key: set its `acked_at = at`. |
| 5 | If `pending` is not empty: write the event `Acknowledged: <latest.label>`; emit `alarm` (`'acked'`) for each row of `pending`, with `acked_at = at`. |
| 6 | Running room: save the state. Summary check (section 7). Return `latest`. Acknowledging twice returns the same row and emits nothing. |

A crashed room's state is not saved after `ctl.ack`; section 8.1 step 5 applies the acknowledgement again when the
room restarts.

## 11. Crash isolation and database errors

| Error source | Result |
|---|---|
| Adapter, controller or runtime throws during a tick, a loop start or `applySettings` | Room crash: the loop stops being ticked (`running: false`), `error = err.message`; no state is saved (it may be half-updated); the kept controller events, then the event `Stopped by an error: <message>` (`serious`) are written; `room` is emitted. The other rooms continue. The room runs again after `restart(id)` or a server restart, from its last saved state. |
| A `db` function throws during a tick | Database error: the manager stops its timer, `tick()` does nothing from then on (all loops halt; no state save is tried), and it emits `fatal`. The spec rule: the server stops with a clear message instead of running without saving. Any error thrown by a db function counts, whatever its `code` or `errcode` (C1 errors carry node:sqlite's shape, lead decision 3; C2 decides by where the error came from, not by its code). |
| A `db` function throws inside a method (`start`, `create`, `applySettings`, …) | The error is thrown to the caller (HTTP 500 in C3; `server/main.js` exits when `start()` throws). A `NotFoundError` is first turned into `not_found` (section 6.2). |
| A listener throws | Caught and logged; nothing else happens (section 7). |

## 12. Adapter interface

### 12.1 The adapter

The adapter is the existing one from `docs/contract.md` (sections 1 and 2) and `runtime.js`, plus `view()` and
`snapshot()`. A hardware adapter (work item 3.2) gives the same object.

| Member | Required | Signature | Rules |
|---|---|---|---|
| `io.read()` | Yes | `() => reading \| null` | `docs/contract.md` section 1. `seq` changes with each new reading. `t` is seconds since 1970 UTC and must increase. `hour` is the local time of day at the farm (Malaysia, UTC+8). Optional extras used by the readings table: `power` (W per machine) and `kwh` (kWh per machine, cumulative). |
| `io.write(cmd)` | Yes | `(cmd) => void` | `docs/contract.md` section 2: send the commands as they are; keep the last command between readings. |
| `io.advance(dt)` | No (simulated adapters only) | `(dt: integer s ≥ 1) => void` | Moves the simulated room by `dt` real seconds with the last command. The manager calls it with `dt = 1` (once per second, polling between calls) or with `dt > MAX_CATCH_UP_S` for a gap. |
| `view()` | Yes | `() => object \| null` | Plant data for a drawing or a test; the controller never sees it. A hardware adapter returns `null`. Not used by the manager in version 1. |
| `snapshot()` | Yes | `() => object \| null` | State to resume from, stored in `controller_state.sim`. A hardware adapter returns `null`. |

### 12.2 Adapter factory

| Argument | Type | Meaning |
|---|---|---|
| `room` | Room row | `id`, `volume`, `adapter` (no `vent`, C9 6.3) |
| `calib` | `{ ua, infAch, moistBuffer, co2PerBlock }` \| null | The room's current calibration (`db.currentCalibration`) |
| `blocks` | integer ≥ 1 \| null | The room's block count: the sum of `blocks` over `db.getMix(id)` at loop start, or `null` when that sum is below 1 (section 8.1 step 3) |
| `equipment` | C1 `Equipment` \| null | Revision 8. The room's machines (`db.getEquipment(id)` at loop start), or `null` when none are saved |
| `cfg` | settings object | The live `cfg`, read only for the adapter (the simulated blocks follow `cfg.stage`; `cfg.airM3h` is the simulated room's air exchange size, C9 6.3) |
| `snapshot` | object \| null | `controller_state.sim` of the last save |
| `now` | `() => integer` | The manager's clock |

`defaultAdapterFactory(args)`: `room.adapter === 'sim'` → `createSimAdapter(args)`; anything else throws
`Error('Unknown adapter "<adapter>"')`, which stops that room with the error.

## 13. `server/sim-adapter.js`

### 13.1 `createSimAdapter({ room, calib, blocks, equipment, cfg, snapshot, now })`

Returns `{ io, view(), snapshot() }`. The arguments are those of section 12.2.

| Step | Action |
|---|---|
| 1 | `env = structuredClone(ClimateSim.DEFAULT_ENV)`; `env.airM3h = cfg.airM3h` (C9 6.3: the room's own air exchange size from its settings; always a number after `importSettings`, so it is the size the simulated room runs, with or without `env.plant`; a saved change of `airM3h` reaches the simulated room at the next loop start, the controller at once); no `env.vent` (C9 6.3); `env.room = { volume: room.volume }` plus, with `calib`, `ua`, `infAch`, `moistBuffer`; `env.co2PerBlock = calib ? Math.round(calib.co2PerBlock) : DEFAULT_ENV.co2PerBlock`; `env.blocks = blocks` when `blocks` is not `null` (else `DEFAULT_ENV.blocks`, 2000), the same block count C5 section 3.6 fits `co2_per_block` with; `env.blockStage = cfg.stage`; revision 8: when `equipment` is not `null`, `env.plant = ClimateEquipment.plantOf(equipment, { volume: room.volume, calib })` (C8 section 4.5: with a calibration the plant has no `room` and `loads` keys, so the calibration's `ua` stays in force); `env.inletAt` and `env.exhaustAt` stay `DEFAULT_ENV` (`high`, `low`) for every room. All other values stay `DEFAULT_ENV` (ideal sensors, no noise, daily weather 24–33 °C, sensor period 30 s). |
| 2 | `sim = ClimateSim.create(env, snapshot \|\| undefined)`. Without a snapshot: `sim.setRoom({ T: cfg.spT, RH: cfg.spRH, CO2: START_CO2 })`, so a new room starts at its targets without start-up alarms (as `app.js` `reset()`). |
| 3 | `inner = ClimateRuntime.simIO(sim)`. |
| 4 | Set the time origin (section 13.2). |

| Member | Behaviour |
|---|---|
| `io.read()` | `r = inner.read()`; returns `{ ...r, t: origin + r.t, CO2: Number.isFinite(r.CO2) ? r.CO2 + (r.seq % 2) * 1e-6 : r.CO2 }` (all other fields as `sim.read()` gives them, `hour` included). The CO₂ jitter is explained in the note below. |
| `io.write(cmd)` | `inner.write(cmd)`. |
| `io.advance(dt)` | `dt ≤ 0`: nothing. `1 ≤ dt ≤ MAX_CATCH_UP_S`: `dt` times { `env.blockStage = cfg.stage`; `inner.advance(1)` } (physics in 1 s steps; the manager calls it with `dt = 1`). `dt > MAX_CATCH_UP_S`: no stepping; the time origin is set again (section 13.2), so the gap is a gap, as after a restart. |
| `view()` | `{ ...sim.view(), t: origin + sim.view().t }` |
| `snapshot()` | `sim.snapshot()` |

| Note | Detail |
|---|---|
| Why the CO₂ jitter | The simulated room has ideal sensors and no noise (step 1) and runs around the clock. When the circulation fan and the air exchange stay at one setting, its CO₂ settles on one exact float value, and the controller's frozen-sensor check (`SENSORS.CO2.stuckMin` = 60 min of the same exact value) raises a false serious `sensor_CO2` alarm (`value does not change (frozen)`) and starts a timed purge, again and again. Checked with `sim.js`, `controller.js` and `runtime.js` over 12 h: with `manual.circ` Manual On the alarm comes at about 6.3 h, with circulation off at about 6.1 h and 11.8 h; with the jitter it never comes. `capacity.js` `trial()` adds the same jitter for the same reason (`tests/capacity.test.js`). |
| Size | `1e-6` ppm on every second reading (odd `seq`), far below any sensor resolution, so it changes no decision and no chart. A missing value (`null` from a sensor fault) stays as it is. Only `CO2` gets it: T and RH (stuck after 120 min) keep moving with the daily weather. |

### 13.2 Time origin

The simulation counts its own seconds from 0 (`sim.t`); the controller and the database need real time.

| Item | Value |
|---|---|
| `simT` | The simulation's own time at the moment the origin is set: `sim.view().t` (0 for a new sim). Read again each time the origin is set, at creation and after a gap longer than `MAX_CATCH_UP_S`; never a value kept from creation (the sim has advanced since then). `sim.view()` also avoids the full `structuredClone` of `sim.snapshot()`. |
| `origin` | `now() - simT`, so `origin + sim.t` is the real time now |
| `env.startHour` | `((origin + TZ_OFFSET_S) mod 86400) / 3600` (decimal hours, Malaysia time), so the simulated day and night follow the real clock |
| Set when | At creation (fresh or from a snapshot) and after a gap longer than `MAX_CATCH_UP_S` |
| Effect after a restart | The simulated room continues from its snapshot (no jump in the room); the outdoor weather follows the real time of day; reading `t` keeps increasing |

| Constant | Value | Meaning |
|---|---|---|
| `MAX_CATCH_UP_S` | 300 | Largest `dt` that is simulated; a longer one (event loop stall, clock jump) is a gap |
| `TZ_OFFSET_S` | 28800 | Malaysia time, UTC+8, no daylight saving |
| `START_CO2` | 750 | ppm, start CO₂ of a new simulated room |

## 14. Timing summary

| Item | Value |
|---|---|
| Tick | Every `tickMs` (1000 ms) |
| Simulated physics | 1 s steps, real elapsed time, with a `runtime.poll()` after each step |
| Controller decision | One per new adapter reading (30 s for the simulated room), also during a catch-up of up to 300 s |
| Reading rows | One per controller decision |
| State save | At a fresh start, every 300 s, and at the moments of section 8.3 |
| Most state lost by a crash or power cut | 300 s; settings are never lost |

## 15. Database functions used (C1)

The manager calls only these C1 functions, with C1's names, arguments and returns (`docs/contracts/db.md` section 6).
Values of JSON columns (`settings`, `controller`, `sim`) are passed and returned as plain objects. Every function that
takes a `roomId` throws C1's `NotFoundError` for an unknown room.

| Function (C1) | Arguments as called | Returns (C1) | Used by |
|---|---|---|---|
| `listRooms(options?)` | `{ includeArchived: true }` (empty-database check); no argument (rooms to start, `list`) | `Room[]` by id | `start`, `list` |
| `getRoom(id)` | integer | `Room`; throws `NotFoundError` (turned into `null` or `not_found`) | Every method with an id |
| `createRoom(room)` | `{ name, volume, adapter: 'sim', settings, note: 'Created', at: now() }` (no `vent`, C9 6.3) | `Room` (room and first settings version in one transaction) | `create`, `start` (demo room) |
| `updateRoom(id, changes)` | any of `{ name, volume }` | `Room` | `update` |
| `archiveRoom(id, at)` | integer, `now()` | `Room` with `archived_at` | `archive` |
| `currentSettings(roomId)` | integer | `SettingsVersion` | Loop start; `create` (for the `settings` emit); `applySettings` on a room the manager has not loaded |
| `saveSettings(roomId, version)` | `{ settings, note, at: now() }` | `SettingsVersion` | `applySettings`, automatic versions, the upgrade save at loop start (note `Upgraded: air exchange`, section 8.1 step 2) |
| `currentCalibration(roomId)` | integer | `Calibration` \| null | Loop start |
| `getMix(roomId)` | integer | `MixRow[]` in `pos` order; `[]` if none | Loop start (`blocks` for the simulated adapter, section 8.1 step 3) |
| `getEquipment(roomId)` | integer | `Equipment` \| null | Loop start (`equipment` for the simulated adapter, section 8.1 steps 1 and 3; revision 8) |
| `loadControllerState(roomId)` | integer | `ControllerState` \| null | Loop start |
| `saveControllerState(roomId, state)` | `{ controller, sim, at: now() }` | `undefined` (insert or replace) | Section 8.4 |
| `insertReading(roomId, reading)` | The ReadingRow (section 5.3): a C1 `Reading` (the 18 keys of section 1, `air` included) with `room_id` = `roomId` | `undefined` | Record |
| `queryReadings(roomId, query)` | `{ from: now() - 3600, to: now() }` (raw rows) | `Reading[]` by `t` | Loop start (`live.reading` = the last row, unchanged) |
| `addEvent(roomId, event)` | `{ t, level, text }` | `Event` | Everywhere events are written |
| `listAlarms(roomId, options)` | `{ recent: 0 }` (open rows only); `{ recent: 500 }` | `Alarm[]` | Loop start (open map); `ackAlarm` (rows it changes) |
| `raiseAlarm(roomId, alarm)` | `{ alarm_key, level, label, at }` | `Alarm` | Section 10.1 |
| `clearAlarm(roomId, alarmKey, at)` | integer, string, integer | `Alarm` \| null | Section 10.1 |
| `ackAlarm(roomId, alarmKey, at)` | integer, string, `now()` | `Alarm` (newest row of the key); throws `NotFoundError('alarm')` | `ackAlarm`; section 10.1 (a raise the controller already acknowledged) |

The manager does not call `getSettingsVersion` or `latestReading` (the API calls `getSettingsVersion` for a restore;
`live.reading` at loop start comes from `queryReadings`). C1 section 7 must list `getMix` among C2's functions and drop
it from "C2 does not call" (revision 6).

## 16. Fake room manager (`tests/fakes/rooms.js`, written by the lead in wave 0, for the API stream)

The fake writes through the C1 db it is given, so API tests that write through C2 and read through C1 see the same
data (for example `POST /rooms` then `GET /rooms/:id/settings`, `PUT settings` then `GET history`, an archive then the
404 check through `db.getRoom`). It loads `RoomError`, `DEMO_ROOM`, `FIRST_NOTE` and `cleanSettings` from
`server/rooms-common.js` (never from `server/rooms.js`), so it works in the API stream's wave 1 worktree.

| Member | Fake behaviour |
|---|---|
| `createFakeRoomManager({ db, now })` | `db`: the C1 db object (normally the fake `tests/fakes/db.js`); `now`: as in section 3. No loops, no timer, no adapter, no controller. Tests seed rooms with `db.createRoom` (or the fake's `create`). |
| `start`, `stop`, `tick` | Do nothing |
| `list`, `get` | `db.listRooms()` / `db.getRoom(id)` (with the `NotFoundError` → `null` rule) plus `live`. Default `live` of a room that is not archived: `{ reading: null, stage, crop, targets: null, status: null, alarms, running: true, error: null, flush: null, blocks: null, air: null }` with `stage` and `crop` from `db.currentSettings(id).settings` and `alarms` = `db.listAlarms(id, { recent: 0 }).length`; then the fields given to `setLive` replace these. Archived: `live: null`. |
| Settings upgrade | As the real manager (C9 6.3): `ClimateController.upgradeSettings` runs before every `importSettings` of the fake, and `applySettings` upgrades the stored base before it merges the input over it |
| `create` | Section 6.1 rules (an old `vent` is ignored); first settings by section 9.4 (with `cleanSettings` and `upgradeSettings`); `db.createRoom({ …, note: FIRST_NOTE })`; `db.addEvent` `Room created`; emits `settings` (`auto: false`), `event`, `room`, as section 4 |
| `update` | Section 6.1 rules; `db.updateRoom`; emits `room` |
| `archive` | `db.archiveRoom(id, now())`; `db.addEvent` `Room archived`; emits `event`, `room`. Already archived: unchanged, no emit |
| `restart` | No db write; sets `live.running = true`, `live.error = null` (clears those `setLive` fields); emits `room` |
| Returned Room | `create` returns `{ room: get(room.id), warnings }`; `update`, `archive` and `restart` return `get(id)`. So `live` follows the `list`, `get` rule above (`running: true` for a new room, `null` after an archive). The `room` payload each of them emits is the same `get(id)` value. |
| `applySettings(id, settings, note?, options?)` | Steps 1–3 and 11 of section 9.2 with `base = db.currentSettings(id).settings`: `cleanSettings(settings, base)`, `importSettings` of the merge, `db.saveSettings(id, { settings: next, note, at: now() })` (only the `importSettings` result is stored; the fake never calls `ClimateController.applySettings`, lead decision 6), event `Settings saved (version <id>)…`; emits `settings` (`auto: false`), `event`; returns `{ settings, warnings, version }`. `options` is recorded in `calls` and has no other effect (there is no controller, so the stored version is `next` either way). |
| `ackAlarm` | Steps 1–3 and 5 of section 10.2 (no controller): `db.ackAlarm`, event and `alarm` `'acked'` emits; returns the row |
| `on`, `off` | As section 4 |
| `setLive(id, partialLive)` | Test helper: overrides fields of the room's `live` (for example `{ running: false, error: 'boom' }` for a crashed room, or a `reading`, which must be a C1 `Reading` with its 18 keys). Emits nothing. |
| `emit(name, payload)` | Test helper: sends a section 7 event to the listeners |
| `calls` | Array of `{ method, args }` for assertions (every public method except `on`, `off`, `setLive`, `emit`) |

Errors: the same `RoomError` class (from `server/rooms-common.js`), codes and `details` as sections 6.1 and 6.2.

| What API tests may check against the fake | What they must not check |
|---|---|
| The C2 calls in `calls` (method and arguments), and the C2 events and db rows the fake writes as listed above (`Room created`, `Room archived`, `Settings saved (version <id>)…`, `Acknowledged: <label>`, and the `settings`, `event`, `alarm`, `room` emits listed in this table) | Events and rows only the real manager writes: `Started`, `Stopped`, `Resumed after <N> min stopped`, `Stopped by an error: …`, `Settings: <warning>`, `Targets restored: …`, controller events, readings, alarm raises and clears. Those texts are C2's and are tested in `tests/rooms.test.js`. The "Effects" rows of C3 that name them describe the real system, not the fake. |

## 17. Tests (`tests/rooms.test.js`, with the fake db, a fake clock and `tickMs: 0`)

| Test | Proves |
|---|---|
| Empty database: `start()` creates `Room 1` with one settings version whose note is `Created` and `roomM3 = 60`; a second manager on the same db creates nothing | Demo room |
| `create` without settings (key left out, and key present with `undefined`): one version, note `Created`, `roomM3 = volume`; emits `settings` (`auto: false`) then `room`; with settings: `importSettings` warnings returned; with `settings: { crop: 'pink' }` and `volume: 200`: `roomM3 = 200` (merged over the base); with `settings: { roomM3: 150 }`: `roomM3 = 150` | First settings |
| Fresh room: `start` writes one reading row at `t = now()`; 30 ticks of 1 s add exactly one more row at `t = start + 30`, with matching commands and exactly the 18 C1 `Reading` keys of lead decisions 1 and 20 (`room_id` = the room id, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `air`, `lights`, `circ`, `power_w`, `kwh`, `ac_fan`, `stage`, `core`; no other key); `air` is `0` or `1`; `ac_fan` is `null` while the AC is off and one of `low`, `auto`, `high` while it runs; `stage` equals `get(id).live.stage`; `core` is a number (the simulated room has a probe); the `reading` payload's `live.reading` is `deepStrictEqual` to the row `db.latestReading` returns; controller events become rows | Recording |
| A manager started on a db that has a reading of the last hour: `get(id).live.reading` has the same keys as a row written by Record | One reading shape |
| A clock step of 300 s in one tick records 10 reading rows, 30 s apart | Catch-up |
| An alarm condition held long enough gives an `alarms` row and `alarm` `'raised'`; when it goes away, `cleared_at` is set; `ackAlarm` sets `acked_at`, emits one `'acked'` per changed row, and a second `ackAlarm` emits nothing | Alarms |
| An automatic stage change and an alarm raise each emit `room` once, with the new `live.stage` or `live.alarms` in its payload; a ramped target change alone (a reading during a stage ramp that moves `live.targets.T`) and a status chip change alone (`live.status.T` going from `In band` to `Above band`) emit no `room`; a tick with no summary change (for example a tick with no new reading) emits no `room` | Room summary |
| `applySettings` with `{ manual: { hu: { auto: false, level: 1.5 } } }`, and on another room with `{ manual: { air: { auto: false, on: true } } }` (C9 10): the rooms keep recording, the rows have `fog` = 2 (an integer 0–3) and `air` = 1, and no `fatal` is emitted | Whole machine levels |
| With `ClimateController.create` wrapped by a spy (restored in `t.after`) so that `update` returns `air: { on: true }`, then `air: { on: false }`: the newest row has `air` = 1, then `air` = 0 (C9 6.3) | Air exchange row |
| A room whose mix sums to 500 blocks: the adapter factory gets `blocks: 500`; a room without a mix (or with 0 blocks) gets `blocks: null` (so `createSimAdapter` keeps `DEFAULT_ENV.blocks`) | Block count |
| `startLoopFromRow` with a stored version 1 settings object and a db whose `saveSettings` throws: the error is thrown to the caller (`start`, `create`, `restart`), the room is not marked crashed (8.1, the upgrade save outside the steps 2–6 `try`) | Upgrade save error |
| The prep 2.0 stub probe: while `ClimateEquipment.plantOf(ClimateEquipment.DEFAULTS, { volume: 60, calib: null })` throws `Error('stub')`, the "Room equipment" test is skipped with that reason; after gate 2.5 it runs | Equipment stub probe |
| A room whose mix sums to 500: `live.blocks === 500`; a room without a mix: `null`; `live.flush` is 1 after start and follows an automatic `rest` → `fruiting` change; neither a `flush` nor a `blocks` change alone emits `room` | Live flush and blocks |
| After the first reading of a room with the default settings, `live.air` has the 11 keys of 5.2 with `state` in `idle`, `purge`, `after`; with `manual.air` `{ auto: false, on: true }`, `on`, `manual` and `manualOn` are `true` and `reason` is `'manual'`; `today.purges` counts the purges since 00:00 farm time; a change of `live.air` alone emits no `room` | Live air exchange |
| A room with saved equipment `{ ac_hp: 3, ac_units: 1, fog_lph: 6, air_m3h: 600, walls: 'pu50', roof: 'pu50', height: 3 }` (the 7 fields of C8 revision 3): the adapter factory gets it as `equipment`. `createSimAdapter` returns only `{ io, view(), snapshot() }` (section 13.1), so the test reads the env through a spy, as the `master` test "sim adapter: env" does: it keeps `const orig = globalThis.ClimateSim.create`, replaces it with `(env, snap) => { seen.push(env); return orig(env, snap); }`, and restores `orig` in `t.after` (or `finally`). Then `seen.at(-1).plant.ac.capW === 7910` and `seen.at(-1).plant.room.ua` ≈ 28.12 (no calibration); with an applied calibration `seen.at(-1).plant` has no `room` key; without equipment `seen.at(-1).plant` is `undefined`. In each case `seen.at(-1).airM3h` is the settings' `airM3h` (1800 by default), not the Equipment's `air_m3h` of 600: the live room's size comes from its settings, which the Your machines save keeps in step (section 4, lead decision 35). While `ClimateEquipment.plantOf` throws `Error('stub')` (the prep 2.0 stub of `equipment.js`) the test is skipped: `test(name, { skip: STUB && "plantOf throws 'stub' (prep 2.0 stub of equipment.js); runs at gate 2.5" }, fn)` with `STUB` found once by calling `plantOf` in a `try`. It runs at gate 2.5, after the Equipment merge (lead decision 48). | Room equipment |
| `stop()` saves the state; a new manager on the same db resumes: no reading is repeated, the controller's stage and alarms carry on, the sim continues from its snapshot, reading `t` keeps increasing | Resume |
| `ackAlarm` on a crashed room, then `restart`: the controller's alarm has `acked: true` | Ack while crashed |
| State is saved at a fresh start and again after 300 s of the clock | Periodic save |
| `applySettings` with a new `spT` changes the running `cfg` (same object) and the next commands; warnings are returned; a version is stored | Settings at once |
| `applySettings` with a new stage starts a ramp; an unrelated edit during the ramp does not stop it; an edit of only `spT` during the ramp keeps the other five target keys at their live (ramped) values and cancels the ramp; the end of an uninterrupted ramp stores an automatic version | Settings rules |
| Revision 9 (lead decision 56): a stage change that lowers the CO₂ limit sets `rules.fanOn` and `rules.fanOff` at once, so the live `fanOn` is never below the stored one and the low-key case (an edit of `rules.fanOff` corrected against a lower live `fanOn`) cannot arise from a ramp; the old low-key test (`tests/rooms.test.js` "Pair correction", a golden pinning ramp) is dropped by the lead in prep 2.0 (measured on bd24755 with lead decision 56: it fails, and a raising-ramp version cannot reach the low key: the edit is checked by `importSettings` against the stale base's lower `fanOn` first). The rule of 9.2 step 7 stays for both keys. The high key (`tests/rooms.test.js` "Pair correction, high key", passes on bd24755 with and without lead decision 56): during the oyster `rest` ramp with live `rules.fanOn` = 1890 and `rules.fanOff` = 1690, `applySettings` with `rules.fanOn` = 1650 stores `rules.fanOn` = 1740 with the warning `"rules.fanOn" = 1650 must be at least 50 ppm above "rules.fanOff" (1690 now): set to 1740.` This is the only pair (C9 6.3). | Pair correction |
| Restore: store version A (stage `fruiting`, custom `spT`), change the stage to `pinning` (with `rampH` 4 and with `rampH` 0), then `applySettings(id, A.settings, 'Restored version <A>', { exact: true })`: the stored version and `cfg` have version A's stage and `spT` (all six target keys equal A's), `ctl.state.stage.ramp` is `null`, and the event `Targets restored: …` is written after the `Stage: …` event; without `exact` the same call starts a ramp to the profile and writes no `Targets restored` event | Restore exact |
| `applySettings(id, JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":{"x":1}},"spT":20}'))` and `create` with the same settings: `({}).polluted` is `undefined`, `Object.prototype` has no new key, `spT` = 20 is applied, and the warnings name `__proto__` and `rules.constructor`; `cleanSettings` leaves both arguments unchanged; with `ClimateController.importSettings` and `ClimateController.applySettings` wrapped by spies (restored in `t.after`), every second argument `applySettings` gets is (`===`) a `settings` object that `importSettings` returned | Untrusted keys |
| `applySettings(id, { spT: 20 })`: the stored version equals the base except `spT` (a missing setting keeps the base value, not the default); `cleanSettings(s, base)` returns an object that shares no object with `s` or `base` | Partial merge |
| A room whose settings have `manual.circ = { auto: false, on: true }` runs 12 simulated hours (the fake clock advanced 300 s per tick, 144 ticks): no `alarms` row with `alarm_key` `sensor_CO2`, and no event whose text contains `value does not change (frozen)` | No frozen CO₂ |
| A room with `humMode: 'vpd'` (the default) after a few readings: `live.targets.RH` has at most one decimal (`Math.abs(x * 10 - Math.round(x * 10)) < 1e-9`); with `humMode: 'rh'` it equals `spRH` | Rounded humidity target |
| An adapter whose `read` throws: that room has `running: false` and the error, `room` is emitted; another room keeps writing readings | Crash isolation |
| A `db` function of the fake (for example `insertReading`) replaced by one that throws an error of node:sqlite's shape (`code: 'ERR_SQLITE_ERROR'`, `errcode: 10`, C1 section 9.2) during a tick: `fatal` is emitted with that error and later `tick()` calls do nothing | Database error |
| A clock jump of more than 300 s: no stepping, readings continue with real `t` | Gap |
| Bad inputs and unknown ids give `bad_input` and `not_found` (each with `name === 'RoomError'` and `instanceof` the class from `server/rooms-common.js`); an unknown alarm key gives `not_found` | Errors |
| A stored version 1 settings object (with removed keys, for example `rules.acOff` and `manual.fan = { auto: false, level: 2 }`): the room starts with one event `Settings: Setting "<path>" was removed: fresh air now runs as short purges.` per removed key, no `Unknown setting` warning, `cfg.manual.air` = `{ auto: false, on: true }` and `rules.fanOn` kept; the upgraded settings are saved once with the note `Upgraded: air exchange`, so after `stop()` and a second `start()` each removal is logged once; `create` and `applySettings` upgrade the merged settings (warnings in the order of sections 9.2 and 9.4); `applySettings` with `{ manual: { air: { auto: false, on: true } } }` on a stopped room whose stored base is version 1 stores that `manual.air` (C9 6.3) | Settings upgrade |
| `create({ name: 'B', volume: 60, vent: 'supply' })`: neither the returned room nor `db.getRoom` has a `vent`; `update(id, { vent: 'supply' })` is `bad_input` with `details` `['unknown field "vent"']`; `DEMO_ROOM` has no `vent` (C9 6.3) | No vent |
| `createSimAdapter` with `cfg.airM3h = 900` (the env read through the `ClimateSim.create` spy of "Room equipment"): the env has no `vent` and `env.airM3h === 900`, every other `DEFAULT_ENV` key but the ones section 13.1 sets is unchanged; after `io.write` of a command with `air: { on: true }` and one step, `view().airM3h === 900` (C9 4.2, 6.3) | Air exchange size |
| The children of `server/sim-adapter.js` in `require.cache` are `air.js`, `sim.js`, `runtime.js`, `equipment.js`, in this order (`master` checks the first three; Server 2 adds `equipment.js`); `rooms.TARGET_KEYS` deep-equals `Object.keys(ClimateController.profileTargets('oyster', 'fruiting'))` (C9 6.3) | Requires and target keys |
| The fake manager: `create` then `db.currentSettings`, `applySettings` then `db.settingsHistory`, `archive` then `db.getRoom(id).archived_at` all see the writes; `setLive` changes `get(id).live`; a `__proto__` settings body leaves `Object.prototype` unchanged; its errors are the same `RoomError` class as the real manager's | Fake parity |

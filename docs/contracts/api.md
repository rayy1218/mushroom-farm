# Contracts C3 (HTTP API) and C4 (live feed)

Date: 2026-10-08. Status: **draft** (revision 9, not frozen; the lead freezes it with wave 2). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`.
Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`, sections 1-6.
Binding: the lead decisions of `LEAD-DECISIONS.md` (1–58, cited as "lead decision N") override anything here. C9 (`docs/contracts/air.md`, frozen, lead decision 55) wins where it and this contract disagree.
Owner of the code: the API stream (wave 1), the Server 2 stream (wave 2); every file is listed in section 2.3.
Users: the Rooms UI, Capacity and calibration, Simulator link and Web split streams (`web/api.js`), and the lead (fakes); from revision 8 the wave 2 web streams (Room shell, Live tab, Simulate tab, Calibrate tab, Bench, the Equipment card).
Builds against: C1 (`docs/contracts/db.md`, the fake db `tests/fakes/db.js`) and C2 (`docs/contracts/rooms.md`, the fake
room manager `tests/fakes/rooms.js`), both written by the lead in wave 0 (lead decision 7), and C9 (the air exchange). Section 11 lists every call
the API makes to them.

Where the spec is silent, this contract decides. Those points are marked **decided here** and are listed again
under "Open questions" in the lead's report, so they can be changed before the freeze.

### Changes in revision 9

The wave 2 text moves onto the C9 air exchange (`docs/contracts/air.md`, on `master` 6a12852): an on/off intake + exhaust pair (`air.on`) replaces the one fan with levels; rooms have no `vent`; C9 owns database upgrade 2, so the wave 2 schema is upgrade 3 (lead decisions 20, 35, 54 amended).

| Section | Change |
|---|---|
| Header | Status draft revision 9. Binding: lead decisions 1–55 and C9; the stale "proposes a lead decision 8" sentence and a stray line removed; owner of the code "API stream (wave 1), Server 2 stream (wave 2)" (finding 6). |
| 3.1 | `Live` adds `air` (C2 5.2, lead decision 27 as amended), shown in the example. |
| 2.3 | The box is "Lead decision 8 (recorded; amended by 31)"; the "If the lead keeps the spec as written…" paragraph removed (finding 6). Prep 2.0 row: C1 revision 6, C2 revision 9, `index.html` and the fake API server's `/air.js`, `/cycle.js`, `/equipment.js` (S11, S12). Gate 2.5: upgrades 2 (C9) and 3 run. |
| 3.1 | `vent` removed from Room and its example (C9 6.1, 6.3); the air exchange size is the settings' `airM3h`. Reading example `air` in place of `fan`. |
| 3.2 | Reading key `fan` → `air` (0/1; the fraction on in an averaged row; C9 6.1); 18 keys in a fixed order (lead decision 20 amended); "before upgrade 2" → "before upgrade 3". |
| 3.6 | `equipment` example `air_m3h`; "before upgrade 2" → "before upgrade 3". |
| 3.10.1 | `vent` removed from `inputs`; `calibration` has exactly `{ id, ua, inf_ach, moist_buffer, co2_per_block }` (finding 17); `equipment` with `air_m3h`; new rule: where a run's air exchange size is recorded (no new key). |
| 3.11 | `fan_m3h` → `air_m3h` (50–10000, default 1800, C9 10 row C8); the field order. |
| 4.1 | `applySettings` rows split by route (6.26 added). |
| 5, 6.2, 6.3 | `vent` removed from the bodies and calls; `vent` is an unknown field (C9 6.3). |
| 6.5, 6.7 | Stored and restored settings go through `ClimateController.upgradeSettings` (C9 6.3); the CO₂ pair correction is `rules.fanOn` / `rules.fanOff` only. |
| 6.8 | Averaged `air` is the fraction of readings with the air exchange on (C9 6.1). |
| 6.26 | Body with `air_m3h`. The route keeps the room's settings `airM3h` in step with `air_m3h` through C2 `applySettings` (lead decision 35 amended); its stream events are a settings save's. |
| 7.6 | `checkSimulationRun` checks the `air` part of an equipment report as it checks `ac` (lead ruling 2026-10-09), with a 400 test (12). |
| 7.1 | Load order with `air.js` (C9 3); `room-rules.js` reads `ClimateEquipment` only when a function is called, never at load (findings 4, 12); `ALARM_KEYS` has `airTooSmall` (C9 6.3); `normRoom` has no `vent`. |
| 7.2 | `vent` removed; it is an unknown field (C9 6.3). |
| 7.6 | `inputs.volume` only; `inputs.calibration` exact keys and the unknown-key problem (finding 17). |
| 7.7 | `air_m3h` in the field list; `ClimateEquipment` read at call time (finding 12). |
| 8, 8.1 | No `vent`; `room.airM3h` from the settings; `inputs.calibration` built from the applied Calibration row (finding 17); the calib.js row's `air`. |
| 9 | The fake API server serves `/air.js`, `/cycle.js`, `/equipment.js` too (prep 2.0, S11). |
| 10.2 | Reading example `air`; a 6.26 save that changes `airM3h` sends a settings save's events. |
| 11 | 6.2 without `vent`; 6.26 calls `db.currentSettings` and, when the size differs, `rooms.applySettings`. |
| 12, 12.2 | Tests: `vent` rejected, `air` key, the 6.26 settings sync (differs and same), the require order with `air.js`, `room-rules.js` loads without `equipment.js` (findings 4, 12), `checkSimulationRun` rejects an extra `inputs.calibration` key (finding 17); gate 2.5 checks `schema_version` rows 2 and 3. |

### Changes in revision 8

Room-centred app and C8 equipment (lead decisions 17–24, 39, 50, 52, 54). In wave 2 the **Server 2** stream owns every server file this contract names (section 2.3); the plan is `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md`.

| Section | Change |
|---|---|
| 1 | Body size: at most 8 MB for `POST /api/rooms/:id/simulations`, 1 MB elsewhere (lead decision 21). 201 also for a simulation run. Field names and unknown fields: a simulation run's `result` and `inputs.settings` pass through as sent. `DELETE` is a known method on 6.24 only. |
| 2.3 | Wave 2 owners (prep 2.0, the Server 2 stream, gate 2.5). |
| 3.1 | `Live` adds `flush` and `blocks` (C2 5.2, lead decision 27). |
| 3.2 | Reading adds `ac_fan`, `stage`, `core` (lead decision 20). |
| 3.6 | Calibration adds `source`, `log_from`, `log_to` (lead decision 23) and `equipment` (lead decision 50); `ua` is "Heat through walls and roof" (lead decision 28). |
| 3.8 | CapacityReport is legacy: the web app stores capacity checks as simulation runs (lead decision 19). |
| 3.9, 3.10, 3.11 (new) | SimulationRunInfo, SimulationRun (with `inputs`, 3.10.1), Equipment (C8). |
| 4, 4.1 | New errors: 400 `Invalid simulation run`, 400 `Body is larger than 8 MB`, 400 `Invalid equipment`, 404 `Unknown simulation run`; C1 `NotFoundError` `simulation`. |
| 5, 6.20–6.26 (new) | Routes: list, create, get, patch, delete simulation runs (lead decisions 17, 18); get and put the room's equipment (C8). 6.17 and 6.18 are legacy (lead decision 19). |
| 6.8 | Range limits: `step` ≥ 3600 allows up to 1300 days (lead decision 22). |
| 6.13 | Body takes optional `source`, `log_from`, `log_to`, `equipment`. |
| 7.1 | `room-rules.js` loads after `capacity.js`, `cycle.js`, `equipment.js`; the Node require order; new exports `checkSimulationRun`, `checkRunPatch`, `checkEquipmentBody`. |
| 7.4, 7.6, 7.7 | `checkCalibration` extended; new rules for simulation runs and equipment. |
| 8, 8.1 | Mapping rows for simulation runs and the history log; the browser-storage import sends `source: 'import'`. |
| 9 | `/cycle.js` and `/equipment.js` are served. |
| 10.2 | The `reading` example carries the three new keys; simulation runs and equipment send no stream event (lead decision 18). |
| 11, 12, 12.2 | Calls and tests for the new routes. The `simulation_runs` `CHECK`s accept kind `equipment`; this contract is the gate (lead decision 52). |

### Changes in revision 7

| Section | Change |
|---|---|
| 6.2, revision 5 row | `rooms.create` follows C2 section 9.4 (revision 6): C2 lays `settings` over `ClimateController.defaultSettings()` with `roomM3` = `volume` (`cleanSettings`), then runs `importSettings`, and stores only its result. A missing setting takes its default, with `roomM3` = `volume`; a given `roomM3` wins. Revisions 5 and 6 wrongly said `importSettings` ran "on settings alone", which gave `roomM3` = 60. New test: `POST /api/rooms` with `volume` 200 and `settings: { crop: 'pink' }` stores `roomM3` = 200. |
| 6.5, 6.7 | `warnings` is C2's whole warning list: keys dropped by `cleanSettings`, the `importSettings` warnings, and C2's live-room corrections (C2 sections 6.3 and 9.2), not only the `importSettings` texts. |
| 11 | Row 6.9 reads `db.listEvents(id, { limit, before: before ?? null })`, as 6.9 does, so `before` is never `undefined` (C1 section 6.7 accepts only an integer or `null`). |
| 2.3 | The spec amendment is now a table of every change to spec sections 1, 4, 5 and 6, a condition of the freeze, with the text of a proposed lead decision 8 and what changes if the lead keeps the spec as written. |
| 12, 12.2, 2.3 | `tests/api.test.js` and `tests/stream.test.js` run against the C1 and C2 fakes only ("and later the real ones" removed). The real-module run is a new lead file, `tests/api-real.test.js`, written and run in wave 3 (section 12.2), which checks only statuses, reply shapes and stored values, never the fake's `calls`, `setLive` or `emit`. |

### Changes in revision 6

| Section | Change |
|---|---|
| 6.5, 11, 12 | The exact call of 6.5 is `rooms.applySettings(id, body.settings, note)`, always three arguments: `note` is the trimmed string, or `undefined` when it is `null`, left out or empty after trimming. The test asserts `calls[i].args.length === 3` (replaces "no fourth argument"). |
| 2.3, 12 | New section 2.3: the waves this contract relies on, and one owner per wave for every file C3 names (API stream: `server/config.js`, `tests/config.test.js`, `tests/room-rules.test.js` included). The API stream writes `server/main.js` with the real wiring in wave 1; the lead's wave 1.5 gate runs it on the merged code; the wave 2 streams branch after the gate; wave 3 re-runs every check on the final merge. Spec section 6 must be amended to match (section 2.3 gives the rows). |
| 2.2, 12 | `server/main.js` is tested in wave 1 after all, as the API brief does it (task 11): a temporary copy of `main.js` and `config.js` next to stub `db.js`, `rooms.js` and `api.js` built on the fakes, run as a child process (section 12.1). A stub `rooms.start()` that throws an `ERR_SQLITE_ERROR`-shaped error expects `Database error: …`; one that throws a plain `Error` expects `Cannot start the rooms: …` and the stack. New 2.2 rows: which stream each message goes to, and the file-layout rules the stub test relies on. |
| 8.1, 6.18 | Withdrawn: the revision 5 step that imported each room's stored capacity report (`POST /capacity`). Reports are not imported, as C5 section 3.7 (Complete message `Imported <n> room(s). Run the check again for each room.`), its 7.10 import check and the Capacity and calibration brief already say; spec section 4 only asks the import to create the rooms. |

### Changes in revision 5

| Section | Change |
|---|---|
| 6.5, 6.7, 12 | A setting missing from a PUT or Restore body now **keeps the room's current stored value**, as C2 sections 9.1 and 9.2 and the lead's fake (C2 section 16) do: C2 lays the body over the stored version with `cleanSettings(settings, base)`, then runs `importSettings`, and only that result is applied and stored (lead decision 6). Revision 4 wrongly said "takes the controller default". New test: `PUT { settings: { spT: 20 } }` stores the base with only `spT` changed. `POST /api/rooms` (6.2): C2 uses the base `ClimateController.defaultSettings()` with `roomM3` = `volume`, so a missing setting takes its default and `roomM3` takes `volume` (corrected in revision 7; C2 section 9.4). |
| 3.2 | `ac_setpoint` in an averaged row can be non-null while `ac_mode` is `off` (C1 section 6.6). |
| 2.1, 2.2, 12 | The pure parts of `server/main.js` move to `server/config.js` (`readConfig`, `pickHosts`), tested in wave 1 by `tests/config.test.js`. `main.js` is thin wiring. |
| 2.2 | Listen address: interfaces named `docker…`, `br-…`, `veth…`, `virbr…`, `vmnet…`, `tun…`, `tap…`, `lo…`, `zt…` are skipped; with more than one candidate, all are printed and the start-up line adds `(set FARM_HOST to choose another)`. The README tells the farmer to run the server as a service that restarts on failure (a start before DHCP retries). |
| 2.2 | `npm start` runs `node --disable-warning=ExperimentalWarning server/main.js` (the lead's `package.json`; C1 section 1). |
| 12 | Wave 1.5 gate: after the wave 1 merge, the lead runs the real server once before the wave 2 streams branch. |

### Changes in revision 4

| Section | Change |
|---|---|
| 1, 12 | Every body is parsed with a reviver that drops `__proto__` keys; new test (lead decision 6, defence in depth next to C2's `cleanSettings`). |
| 2.1 | Which modules `server/api.js` may require: never `server/db.js` or `server/rooms.js`; error classes only from `server/db-common.js` and `server/rooms-common.js` (lead decision 7). The fake API server is `tests/fakes/api-server.js` (C5 section 4.5). |
| 2.2 | A throw from `rooms.start()`: `Database error: <message>` for a node:sqlite error, otherwise `Cannot start the rooms: <message>` with the stack; both close the database and exit 1 (open question resolved). |
| 4.1 | How the API recognises C1 and C2 errors (`err.code === 'NOT_FOUND'`, `err.name === 'RoomError'`); `getCalibration` removed (the API never calls it). |
| 4.2 | Constraint codes 787 (foreign key) and 2067 (unique) added; the fake db sets the same `code` and `errcode` (lead decision 3). |
| 6.5, 6.7 | Settings from HTTP go only through `importSettings` (lead decision 6): C2 lays the body over the room's current stored version with `cleanSettings`, then runs `importSettings`, and applies and stores only that result, so a missing setting keeps the room's current value (corrected in revision 5; C2 section 9.2). Restore passes `{ exact: true }` (C2 section 4). |
| 6.19 | Restart button: lead decision 5 (C5 `restartRoom(id)`), no longer "decided here". |
| 10.1, 10.3 | The 45 s watchdog is C5's (lead decision 4); C3 only refers to it. |
| 10.2 | `room` is relayed only; its summary is C2's (lead decision 2): `stage`, `crop`, `alarms`, `running`, `error`. `targets` and `status` alone do not send `room`. |
| 12 | Tests check only the fakes' `calls` and what the fakes write (C2 section 16); `{ exact: true }` on restore; how to make a fatal db error with the fake (C1 section 9.2). |

## 1. General rules

| Topic | Rule |
|---|---|
| Base path | Every API route starts with `/api/`. Every other path is a static file (section 9) or 404. |
| Time | Every time field and time parameter is an integer: seconds since 1970-01-01 00:00 UTC. The page shows Malaysia time. |
| Ids | Room, settings version, calibration run, event, alarm and simulation run ids are positive integers (SQLite row ids). In a path, an id that is not a positive decimal integer gives 404 (as an unknown id). |
| Request body | JSON, UTF-8. The `Content-Type` header is not checked. A route that takes no body ignores any body sent. Every body is parsed with `JSON.parse(text, (k, v) => (k === '__proto__' ? undefined : v))`, so a `__proto__` key never reaches C1, C2 or the controller (C2's `cleanSettings` also drops it; the two layers protect independently). |
| Body size | At most 1 MB (1,048,576 bytes), except `POST /api/rooms/:id/simulations` (6.21): at most 8 MB (8,388,608 bytes), because the longest program's Result is about 4.8 MB (lead decision 21). A larger body gives 400 and is not stored. |
| Reply body | JSON, UTF-8, `Content-Type: application/json; charset=utf-8`, `Cache-Control: no-store`. |
| Numbers | Plain JSON numbers. `NaN` and `Infinity` cannot be sent in JSON; they arrive as `null` (see the CapacityReport and Calibration rules). |
| Field names | Resource fields use the database column names (`snake_case`), as in spec section 3 (`saved_at`, `co2_per_block`). Exceptions: the Reading fields `T`, `RH`, `CO2` (spec section 2; C1's `Reading` object already uses these names, so the API sends it unchanged, section 3.2), and values passed through as stored JSON with their own camelCase names: the controller settings object, the capacity report, a simulation run's `result` (C7 Result, capacity report or C8 Report, as made) and the settings inside a simulation run's `inputs`. |
| Unknown fields | A body field that the route does not define gives 400 (it catches typing errors). Exceptions: the settings object (checked by `importSettings` in C2, which warns), the capacity report (stored as sent), and a simulation run's `result` and `inputs.settings` (7.6). |
| Bad input | 400 with the reasons; **nothing is stored** and the running room is not changed (spec section 5). |
| Status codes | Success: 200, or 201 when the route creates a row named in its reply (room, calibration run, capacity report, simulation run). Errors: 400, 404, 500 only (spec section 3). A known path with the wrong method gives 404 `Unknown route` (**decided here**, no 405). `DELETE` is a known method on 6.24 only. |
| Archived rooms | An archived room is unknown to the API: `GET /api/rooms` leaves it out, and every `/api/rooms/:id/...` route gives 404 for it. Its rows stay in the database (**decided here**). |
| Order of lists | Stated per route. Ties are broken by `id`, in the same direction. |
| Access | No login (spec). No CORS headers: the page and the API have the same origin. The server listens on the farm network address only (section 2.2). |

## 2. Server modules

### 2.1 Exports

| Module | Export | Arguments | Returns | Notes |
|---|---|---|---|---|
| `server/api.js` | `createApi(opts)` | `opts.db`: the C1 database object; `opts.rooms`: the C2 room manager; `opts.root`: absolute path of the repo folder (for static files); `opts.now`: optional, `() => integer seconds`, default `() => Math.floor(Date.now() / 1000)`; `opts.heartbeatMs`: optional, default 15000; `opts.onFatal`: optional, `(err: Error) => void`, default: do nothing | `{ handle, close }` | One object per server. At creation it subscribes to the C2 events (section 10.2). Tests pass the C1 and C2 fakes, a fixed `now`, a short `heartbeatMs` and a recording `onFatal`. |
| `server/api.js` | `handle(req, res)` | Node `http.IncomingMessage`, `http.ServerResponse` | nothing | The `http.createServer` listener: API routes, the stream, then static files. Never throws; a fault becomes a 500 reply. After sending a 500 for a database error (section 4.2), it calls `opts.onFatal(err)`. |
| `server/api.js` | `close()` | none | nothing | Ends every open stream connection, stops the heartbeat timer, removes its C2 listeners (`rooms.off`). A second call does nothing. |
| `server/static.js` | `serveStatic(req, res, root)` | as above, `root` as above | `true` when it answered (a file or a static 404), `false` for a path under `/api/` | Section 9. |
| `server/config.js` | `readConfig(env, fileText, root)` | `env`: an object of strings (`process.env`); `fileText`: the text of `farm.config.json`, or `null` when the file does not exist; `root`: absolute path of the repo folder | `{ port, db, host }`: `port` an integer, `db` an absolute path, `host` a string or `null` (not set: `main.js` uses `pickHosts`) | The configuration rules of section 2.2 (sources, defaults, bad configuration). Throws an `Error` whose message is `Bad configuration: <reason>`. Pure: reads no file, no environment of its own. |
| `server/config.js` | `pickHosts(interfaces)` | the object `os.networkInterfaces()` returns | `{ name, address }[]`: the farm network candidates of section 2.2 (Listen address), in sorted interface-name order; `[]` when there are none | Pure. `main.js` uses the first. |
| `room-rules.js` | `ClimateRoomRules` | – | – | Section 7. Same module pattern as `capacity.js` (a global in the browser and on `globalThis` in Node). Load order in Node and in the browser: section 7.1. |

| Module | May require | Never requires |
|---|---|---|
| `server/api.js` | Node built-ins, `./static.js`, `./db-common.js` and `./rooms-common.js` (only if it wants the error classes; section 4.1 recognises errors without them), and the shared modules of section 7.1 | `./db.js`, `./rooms.js` (C1 and C2 come in through `opts`; in wave 1 those files do not exist in the API stream's worktree, lead decision 7) |
| `server/config.js` | Node built-ins (`node:path`) | Everything else |
| `server/main.js` | `./db.js` (`openDb`), `./rooms.js` (`createRoomManager`), `./api.js`, `./config.js`, Node built-ins | – |

The web streams test against the lead's fake API server `tests/fakes/api-server.js` (lead decision 7; its behaviour is
C5 section 4.5). The API stream does not use it.

### 2.2 `server/main.js`

`npm start` runs `node --disable-warning=ExperimentalWarning server/main.js` (`package.json` start script, set by the
lead; C1 section 1). Without the flag, node:sqlite prints an `ExperimentalWarning` before the start-up line. `main.js`
has no exports and is thin wiring: the configuration and address rules below are `server/config.js` (section 2.1),
tested alone by `tests/config.test.js`. `main.js` itself requires the real `./db.js` and `./rooms.js` from wave 1 on;
in the API stream's worktree those files do not exist, so its wave 1 test runs a copy of it next to stub modules built
on the fakes (section 12.1), and the lead's wave 1.5 gate runs it on the merged code (sections 2.3 and 12.2).

| Item | Rule |
|---|---|
| File layout | `main.js` requires only Node built-ins and `./db.js`, `./rooms.js`, `./api.js`, `./config.js` (relative paths, so the test copy of section 12.1 picks up the stubs next to it). The repo folder `root` is `path.join(__dirname, '..')`. It calls `os.networkInterfaces()` through the `require('node:os')` object, not a destructured copy (the test replaces it). |
| Output | `Farm network addresses: …` and the start-up line go to stdout (`console.log`). Every error line (`Bad configuration: …`, `No farm network address found; …`, `Cannot open the database: …`, `Database error: …`, `Cannot start the rooms: …`, `Cannot listen on …`) goes to stderr (`console.error`). |
| Configuration sources (`readConfig`) | In this order, the first that sets a value wins: (1) environment variables `FARM_PORT`, `FARM_DB`, `FARM_HOST` (a variable that is present sets the value, even when empty); (2) `farm.config.json` in the repo folder (optional; a JSON object with any of `port`, `db`, `host`); (3) the defaults below. |
| Defaults (`readConfig`) | `port` = 8080; `db` = `data/farm.db`; `host` = not set (`null`; the farm network address, next row). A relative `db` path is resolved from the repo folder (`path.resolve(root, db)`). |
| Listen address (`pickHosts`) | `host` when set. Otherwise the candidates: every IPv4 address of `os.networkInterfaces()` that is not internal, lies in 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16, and belongs to an interface whose name does not start with `docker`, `br-`, `veth`, `virbr`, `vmnet`, `tun`, `tap`, `lo` or `zt` (Docker, libvirt, VMware, VPN and loopback interfaces, which phones on the farm Wi-Fi cannot reach), in sorted interface-name order. The server listens on the first candidate. More than one: before listening, print `Farm network addresses: <address> (<name>), <address> (<name>), …` and add ` (set FARM_HOST to choose another)` to the start-up line. None: print `No farm network address found; set FARM_HOST (for example 127.0.0.1).` and exit with code 1 (**decided here**). The server never listens on `0.0.0.0`. |
| Bad configuration (`readConfig`) | `farm.config.json` that is not valid JSON or is not an object; a `port` that is not an integer 1-65535 (from the environment: a string of decimal digits; from the file: a JSON integer); an empty `db` or `host`; a `farm.config.json` field other than `port`, `db`, `host`: `readConfig` throws, `main.js` prints `Bad configuration: <reason>` and exits with code 1. A `farm.config.json` that exists but cannot be read is the same, with the reason `cannot read farm.config.json: <message>` (`main.js` reads the file; a missing file gives `fileText` = `null`). |
| Service (README, Docs stream) | The README tells the farmer to run the server as a service that restarts on failure (for example systemd `Restart=on-failure` with `RestartSec=5`), so a start before DHCP has given the farm address (exit 1, above) is retried. |
| Start-up order | 1 read the configuration (`readConfig(process.env, <text of farm.config.json or null>, root)`, then `pickHosts(os.networkInterfaces())` when `host` is `null`); 2 `db = openDb(dbPath)` (an error: print `Cannot open the database: <message>`, exit 1); 3 `rooms = createRoomManager({ db })`, `rooms.on('fatal', ({ error }) => fatal(error))`, `rooms.start()` (C2 `start()` creates the demo room in an empty database; `main.js` does not). If `rooms.start()` throws: `db.close()`, then print `Database error: <message>` when `err.code === 'ERR_SQLITE_ERROR'` (C2 section 11: a db error in `start` is thrown to the caller), otherwise `Cannot start the rooms: <message>` and the stack (a bug: C2 marks a room that fails to start as stopped and throws nothing else), and exit with code 1 (**decided here**); 4 `api = createApi({ db, rooms, root, onFatal: fatal })`; 5 `server = http.createServer(api.handle)`, `server.listen(port, host)`. |
| Start-up line | On `listening`: print `Open http://<host>:<port>` (for example `Open http://192.168.1.20:8080`), followed by ` (set FARM_HOST to choose another)` when `pickHosts` gave more than one candidate. |
| Listen error | For example `EADDRINUSE`: print `Cannot listen on <host>:<port>: <message>`, then `api.close()`, `rooms.stop()`, `db.close()`, exit 1. |
| Shutdown (`SIGINT` = Ctrl+C, `SIGTERM` = service stop) | In this order: `api.close()`; `server.close()`; `rooms.stop()` (saves each running room's state); `db.close()`; exit 0. A second signal during shutdown exits at once with code 1. |
| `fatal(err)` | Called by the C2 `fatal` event and by `opts.onFatal`. Prints `Database error: <message>` (and the stack) with `console.error`, then `process.exit(1)`. It does not call `rooms.stop()`: no state save is tried, because the database failed (C2 section 11). WAL keeps the file consistent. |

### 2.3 Waves and file owners

This contract relies on the waves below. The approved spec says otherwise: its section 6 runs waves 1 and 2 in
parallel, wires the real db and rooms into `server/main.js` in wave 3, and lists other files per stream. C5 sections
1.1, 1.5 and 7.10 rely on the same waves as this contract (`web/ui.js`, the wave 0 stubs, wave 2 headless checks
against the real merged server; the fake API of C5 section 4.5 serves no page). The spec section 6 has been amended to match, and the wave plan is lead decision 8 (both done 2026-10-08). Inside a wave, nobody waits for another stream's code.

| Lead decision 8 (recorded; amended by 31) |
|---|
| Wave plan: the API stream's wave 1 `server/main.js` holds the real `openDb` and `createRoomManager` wiring (tested with stubs, C3 section 12.1). After the wave 1 merge the lead runs the wave 1.5 gate (C3 section 12.2). The wave 2 streams branch from `master` only after the gate passes and run their headless Chrome checks against the real server (C5 section 7.10). Wave 3 re-runs every test and check on the final merge and adds `tests/api-real.test.js` (C3 section 12.2). Spec section 6 is amended to match (C3 section 2.3). |

| Spec place | The spec says now | Amended to |
|---|---|---|
| Section 1, parts table | No row for the configuration rules; Web app row `index.html`, `web/*.js`, `styles.css` | New row: Configuration rules, `server/config.js`, "Reads the configuration and picks the farm network address (pure; `main.js` calls it)". Web app row: `index.html`, `web/*.js` (including `web/ui.js`), `styles.css`. |
| Section 4, Code split row | Lists `web/api.js` … `web/shell.js` | Adds `web/ui.js` (shared page helpers, C5 section 1.1). |
| Section 5, tests table | `tests/api.test.js`: "Each route against a real server on a random port with a temporary database" | `tests/api.test.js`: each route against a real HTTP server on a random port with the C1 and C2 fakes (C3 section 12). New row `tests/api-real.test.js`: each route once more against the real db (temporary file) and room manager, wave 3 (C3 section 12.2). New rows `tests/config.test.js` and `tests/room-rules.test.js` (C3 section 12). |
| Section 6, opening paragraph | "Nobody waits for another stream's code" | "Inside a wave, nobody waits for another stream's code; wave 2 starts after the wave 1.5 gate." |
| Section 6, wave 0 Lead row | `docs/contracts/*`, `tests/fakes/*`, `package.json` scripts, empty folders | Adds `server/db-common.js`, `server/rooms-common.js`, the stubs `room-rules.js` and `web/rooms.js` (C5 section 1.5), `tests/fake-api-server.test.js`. |
| Section 6, wave 1 API row | `server/api.js`, `server/static.js`, `server/main.js`, `room-rules.js`, `tests/api.test.js`, `tests/stream.test.js`; done when every route and the stream pass against the fakes | Adds `server/config.js`, `tests/config.test.js`, `tests/room-rules.test.js`; `server/main.js` holds the real wiring. Done when also: the `server/main.js` stub tests pass (C3 section 12.1). |
| Section 6, wave 1 Web split row | `index.html`, `web/shell.js`, … | Adds `web/ui.js`, `styles.css`, `tests/web-api.test.js`, `tests/settings-diff.test.js` (C5 sections 1.1 and 7.10). |
| Section 6, new row | – | "1.5, Lead: gate": merge wave 1, full test suite, the gate of C3 section 12.2. Done when the gate passes. |
| Section 6, wave 2 rows | Branch time not stated | Each branches from `master` after the gate; headless Chrome checks against the real server (C5 section 7.10). The Rooms UI row adds `styles.css` (appends a `/* Rooms */` section only). |
| Section 6, wave 3 Lead row | "Streams merged; real db + rooms + API wired in `server/main.js`; end-to-end tests …" | "Streams merged; every test (with `tests/api-real.test.js`) and every headless Chrome check re-run on the final merge; the recorded controller runs: 8 vectors byte-identical, `stage-changes.json` regenerated (lead decision 56), plus `cool-crop.json` (10)" (the wiring is done in wave 1). |
| Section 6, last sentence | "Estimate: about 1.5–2 working days instead of 3, because waves 1 and 2 run in parallel." | Removed. |

| Wave | Who | What, as far as C3 is concerned | Starts when |
|---|---|---|---|
| 0 | Lead | The contracts, the fakes, `server/db-common.js`, `server/rooms-common.js`, the stubs `room-rules.js` and `web/rooms.js` (C5 section 1.5), the `package.json` start script | – |
| 1 | API stream (in parallel with Data, Rooms and Web split) | Its files below; `server/main.js` with the real `openDb` and `createRoomManager` wiring, tested with stubs (section 12.1) | The contracts are frozen |
| 1.5 | Lead: gate | Merges the four wave 1 streams into `master`, runs the full test suite, then the gate of section 12.2 | Every wave 1 stream is reviewed |
| 2.0 | Lead: prep | The frozen contracts, the fakes (C1 revision 6, C2 revision 9, C5 4.5; the fake API server also serves `/air.js`, `/cycle.js` and `/equipment.js`, section 9), `index.html` (C5 1.2: every script tag of section 7.1), the `FarmApi` additions, the tab registry and stubs, the `equipment.js` stub (wave 2 plan, prep 2.0) | – |
| 2 | Data 2, Equipment, Server 2, Room shell, Live tab, Simulate tab, Calibrate tab, Bench, Docs (the wave 2 plan) | Branch from `master` after prep 2.0. Server 2 builds this contract's revision 9 against the C1 and C2 fakes and the `equipment.js` stub. The web streams' headless Chrome checks run against the real server after gate 2.5 (C5 section 7.10) | Prep 2.0 is on `master` |
| 2.5 | Lead: gate | Merges Data 2, Equipment, then Server 2; `npm test`; the gate of section 12.2 with a copy of a version 1 database file and a copy of a version 2 file (wave 2 plan 5 step 0; upgrades 2 (C9) and 3 run on the first, 3 on the second, `Room 1` records readings with the 18 keys of 3.2) | Data 2, Equipment and Server 2 are reviewed |
| 3 | Lead: integration | Merges wave 2 in the plan's order; writes and runs `tests/api-real.test.js` (section 12.2, with 6.20–6.26); runs every test and headless Chrome check again on the final merge; the recorded controller runs: 8 vectors byte-identical, `stage-changes.json` regenerated (lead decision 56), plus `cool-crop.json` (10) | Every wave 2 stream is reviewed |

Every file this contract names has exactly one owner per wave. In wave 3 the lead owns every file (integration fixes).

| File | Wave 0 | Wave 1 | Wave 2 | Defined in |
|---|---|---|---|---|
| `server/api.js` | – | API | Server 2 | 2.1, 4-6, 10 |
| `server/static.js` | – | API | Server 2 | 9 |
| `server/config.js` | – | API | nobody | 2.1, 2.2 |
| `server/main.js` | – | API | nobody | 2.2 |
| `room-rules.js` | Lead (stub, C5 section 1.5) | API (replaces the stub) | Server 2 | 7 |
| `tests/api.test.js` (routes, static files, and `describe('server/main.js')`) | – | API | Server 2 | 12, 12.1 |
| `tests/stream.test.js` | – | API | nobody | 12 |
| `tests/config.test.js` | – | API | nobody | 12 |
| `tests/room-rules.test.js` | – | API | Server 2 | 12 |
| `tests/api-real.test.js` | – | nobody | nobody | 12.2 (the lead writes it in wave 3, with 6.20–6.26) |
| `server/db-common.js` | Lead | nobody | nobody | C1 section 5.1 |
| `server/rooms-common.js` | Lead | nobody | nobody | C2 section 1 |
| `tests/fakes/db.js`, `tests/fakes/rooms.js` | Lead | nobody | Lead (prep 2.0) | C1 section 9, C2 section 16 |
| `tests/fakes/api-server.js`, `tests/fake-api-server.test.js` | Lead | nobody | Lead (prep 2.0) | C5 section 4.5 |
| `package.json` (start script) | Lead | nobody | nobody | 2.2, C1 section 1 |
| `web/ui.js`, `tests/settings-diff.test.js` | – | Web split | nobody | C5 sections 1.1 and 7.10 |
| `tests/web-api.test.js` | – | Web split | Lead (prep 2.0, the new `FarmApi` functions) | C5 sections 4.3 and 7.10 |
| `web/rooms.js` | Lead (stub, C5 section 1.5) | nobody | Room shell (replaces the stub) | C5 sections 1.1, 3.8 |
| `styles.css` | – | Web split | Room shell (appends one `/* Room page */` block only, lead decision 32) | C5 sections 1.1, 3.8 |
| `server/db.js`, `tests/db.test.js` | – | Data | Data 2 | C1 (never required by `server/api.js` or by the API stream's tests) |
| `server/rooms.js`, `server/sim-adapter.js`, `tests/rooms.test.js` | – | Rooms | Server 2 | C2 (never required by `server/api.js`) |

## 3. Resources

Every resource is shown as a table of fields, then as an example. Types: `int` = integer, `num` = finite number,
`str` = string, `bool` = `true`/`false`; `| null` means the field can be `null`. Every field is always present.

### 3.1 Room

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `id` | int | – | |
| `name` | str | 1-60 characters, trimmed | |
| `volume` | num | m³, 5-5000 | Room volume (capacity check and simulated room). |
| `adapter` | str | `sim` | Only `sim` in version 1; set by the server. |
| `created_at` | int | s | |
| `archived_at` | int \| null | s | `null` for every room the API lists; set only in the reply and the `room` event of an archive. |
| `live` | Live \| null | Live (below) | The room as the room manager (C2) knows it now. `null` for an archived room (only in the archive reply and its `room` event). |

A Room has no `vent`: upgrade 2 (C9 6.2) dropped the column, and a `vent` in a body is an unknown field (C9 6.3, section 7.2). The size of the room's air exchange is the settings key `airM3h` (C9 5.2), not a Room field.

**Live** (the object in `Room.live`; the same fields as C2 section 5.2, sent as C2 gives them):

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `reading` | Reading \| null | section 3.2 | The newest reading of the room; `null` before the first one. |
| `stage` | str \| null | `spawn`, `pinning`, `fruiting`, `rest` (keys of `ClimateController.STAGES`) | The controller's present stage (`cfg.stage`); `null` when the loop never got its settings (start failed early). |
| `crop` | str \| null | keys of `ClimateController.CROPS` (`oyster`, `black`, `pink`, `abalone`, ...) | The controller's present crop (`cfg.crop`); `null` as `stage`. |
| `targets` | `{ T, RH, CO2 }` \| null | °C, %, ppm | The targets now: `T` = `cfg.spT`, `RH` = the humidity target now (`ctl.state.rhT`; moves with temperature in VPD mode), `CO2` = `cfg.co2Lim`. During a ramp they differ from the stored settings. `null` when the room has no controller. |
| `status` | `{ T, RH, CO2 }` \| null | each a Chip | Each is the controller's `status(kind)`: Chip = `{ lvl, icon, text }`, `lvl` one of `good`, `info`, `warning`, `serious`, `critical`; `icon` and `text` short strings (for example `{ "lvl": "good", "icon": "✓", "text": "In band" }`). `null` while `reading` is `null` or when the room has no controller. |
| `alarms` | int | ≥ 0 | Number of the room's open alarm rows (C1 rows with `cleared_at` = `null`, the same rows `GET /alarms` lists first; C2 section 5.2). A crashed room keeps its count. `0` before the room manager has loaded the open rows. |
| `running` | bool | – | `true` while the room loop runs. |
| `error` | str \| null | – | Why the loop stopped (the error message) when it crashed; `null` otherwise. |
| `flush` | int \| null | 1, 2, … | Revision 8. The flush the controller is in (`ctl.programStatus(t).flush`, C2 5.2); `null` without a controller. |
| `blocks` | int \| null | blocks | Revision 8. The block count the room's simulated adapter runs with (the mix sum at the last loop start); `null` when the mix sums to less than 1 (the adapter then uses its default). |
| `air` | object \| null | see C2 5.2 | Revision 9 (lead decision 27). The air exchange now: `{ on, state, reason, delayed, timed, manual, manualOn, nextPurgeS, purgeS, why, today: { purges, avgS, capped } }`, exactly C2 5.2 `Live.air` (`state` one of `idle`, `purge`, `after`, C9 5.3); `null` before the first reading or without a controller. |

```json
{ "id": 1, "name": "Room 1", "volume": 60, "adapter": "sim", "created_at": 1791446400, "archived_at": null,
  "live": { "reading": { "room_id": 1, "t": 1791450000, "T": 18.2, "RH": 88.4, "CO2": 812, "t_out": 31.5, "rh_out": 62,
                         "ac_mode": "cool", "ac_setpoint": 17.5, "fog": 1, "air": 0, "lights": 1, "circ": 0, "power_w": 1430, "kwh": 12.84,
                         "ac_fan": "auto", "stage": "fruiting", "core": 19.1 },
            "stage": "fruiting", "crop": "oyster",
            "targets": { "T": 18, "RH": 88, "CO2": 1000 },
            "status": { "T": { "lvl": "good", "icon": "✓", "text": "In band" },
                        "RH": { "lvl": "good", "icon": "✓", "text": "In band" },
                        "CO2": { "lvl": "good", "icon": "✓", "text": "Below limit" } },
            "alarms": 0, "running": true, "error": null, "flush": 1, "blocks": 2000,
            "air": { "on": false, "state": "idle", "reason": null, "delayed": false, "timed": false, "manual": false,
                     "manualOn": false, "nextPurgeS": 240, "purgeS": null, "why": "CO₂ is 812 ppm. The next purge starts at 900 ppm (in about 4 min)",
                     "today": { "purges": 41, "avgS": 74, "capped": 0 } } } }
```

### 3.2 Reading

One row of the `readings` table (C1). The same JSON is sent by `/readings`, in `Room.live.reading` and in the
`reading` stream event. Reading is C1's `Reading` object as `queryReadings` and C2's `live.reading` give it, sent
unchanged (C1 already uses `T`, `RH`, `CO2` and includes `room_id`; there is no count field). The API does no mapping.

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `room_id` | int | – | |
| `t` | int | s | Time of the reading. In an averaged row: the bucket start (section 6.8). |
| `T` | num \| null | °C | Room temperature (main sensor set); `null` when the sensor gave no value. |
| `RH` | num \| null | % | Room relative humidity. |
| `CO2` | num \| null | ppm | Room CO₂. |
| `t_out` | num \| null | °C | Outdoor temperature. |
| `rh_out` | num \| null | % | Outdoor relative humidity. |
| `ac_mode` | str | `cool`, `heat`, `dry`, `fan`, `off` | The AC command after this reading; `off` when the AC power command is off. `fan` is the AC's own fan-only mode, not the air exchange. |
| `ac_setpoint` | num \| null | °C | The AC setpoint command. Raw row: `null` when `ac_mode` is `off`. Averaged row: the mean over the readings with the AC on, `null` only when the AC was off for the whole bucket, so it can be non-null while `ac_mode` (the last reading's) is `off`. |
| `fog` | num | 0-3 | Fogger level command. Fractional in an averaged row. |
| `air` | num | 0 or 1 | Air exchange command (C9): `1` when the intake fan SF-203 and the exhaust fan EF-206 are on (`cmd.air.on`), `0` when off. In an averaged row: the fraction of the readings in the bucket with the air exchange on (0-1). |
| `lights` | num | 0 or 1 | Lights command. In an averaged row: the share of the bucket with the lights on (0-1). |
| `circ` | num | 0 or 1 | Circulation fan command. Averaged like `lights`. |
| `power_w` | num \| null | W | Total electrical power of all machines at the reading; `null` when the adapter has no meter. |
| `kwh` | num \| null | kWh | Sum of the finite values of `r.kwh`: the meter since the simulated room began (kept across restarts in the sim snapshot); `null` when the adapter gives no `kwh`. After an unclean stop (crash, power cut) the room resumes from a snapshot up to 300 s old, so `kwh` can fall below an earlier reading; a client that sums energy treats a decrease as a meter restart. |
| `ac_fan` | str \| null | `low`, `auto`, `high` | Revision 8. The AC indoor fan command; `null` when the AC is off. Averaged row: the last reading's. |
| `stage` | str \| null | `spawn`, `pinning`, `fruiting`, `rest` | Revision 8. The controller stage after this reading. Averaged row: the last reading's. |
| `core` | num \| null | °C | Revision 8. Block core temperature (probe). Averaged row: the mean of the non-null values. |

A Reading has exactly these 18 keys, in this order (lead decision 20 amended): `room_id`, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `air`, `lights`, `circ`, `power_w`, `kwh`, `ac_fan`, `stage`, `core`. There is no `fan` key.

| Old rows | Values |
|---|---|
| Written before upgrade 2 (C9 6.2, version 1 rows) | `air` = `1` where the old fan level was above 0, else `0` |
| Written before upgrade 3 (C1 4.4, the wave 2 schema) | `null` in `ac_fan`, `stage` and `core` |

The exact meaning of each column is C1's (`docs/contracts/db.md`) and C2's (section 5.3); this table repeats it for the browser.

### 3.3 Event

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `id` | int | – | Grows with each new event; used for paging (`before`). |
| `room_id` | int | – | |
| `t` | int | s | Time of the event. |
| `level` | str | `info`, `good`, `warning`, `serious`, `critical` | The controller's event level (`lvl`), or the room manager's (C2 section 8.5). |
| `text` | str | – | The controller's text, for example `Alarm: High humidity`, or a room manager text such as `Started`. |

```json
{ "id": 5321, "room_id": 1, "t": 1791450012, "level": "warning", "text": "Alarm: High humidity" }
```

### 3.4 Alarm

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `id` | int | – | One row per time an alarm is raised. |
| `room_id` | int | – | |
| `alarm_key` | str | the controller's alarm id: `tHi`, `tLo`, `tCrop`, `coreHi`, `rhHi`, `rhLo`, `co2Hi`, `co2Safe`, `disagree`, `acTooSmall`, `blocksDone`, `shockLimit`, `airTooSmall` (C9 5.5), `sensor_<key>` (for example `sensor_RH`) | Used in the ack path (URL-encoded by the client, URL-decoded by the server). |
| `level` | str | `warning`, `serious`, `critical` | |
| `label` | str | – | The controller's label, for example `High humidity`. |
| `raised_at` | int | s | |
| `cleared_at` | int \| null | s | `null` while the alarm is active. |
| `acked_at` | int \| null | s | `null` until acknowledged. |

```json
{ "id": 88, "room_id": 1, "alarm_key": "rhHi", "level": "warning", "label": "High humidity",
  "raised_at": 1791450012, "cleared_at": null, "acked_at": null }
```

### 3.5 Settings and SettingsVersion

**Settings** is the controller's settings object, exactly as `ClimateController.defaultSettings()` makes it and
`importSettings(file).settings` returns it (camelCase keys: `farmType`, `crop`, `stage`, `spT`, `spRH`, `co2Lim`,
`rules`, `protect`, `program`, `offsets`, `manual`, ...). It is **not** the settings file wrapper
(`{ format, version, saved, settings }` of `exportSettings`).

**SettingsVersion** (one stored version, without its settings):

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `id` | int | – | The version id used by Restore. Larger = newer. |
| `room_id` | int | – | Added by the API (C1 `settingsHistory` rows have no `room_id`). |
| `saved_at` | int | s | |
| `note` | str \| null | 0-200 characters | `Created` for the first version of every room (the demo room included); `Restored version <id>` for a restore; `Automatic: …` for a version the controller made (C2 section 9.3); otherwise the user's note. |

```json
{ "id": 14, "room_id": 1, "saved_at": 1791450100, "note": "Lower RH for the pink oyster" }
```

### 3.6 Calibration

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `id` | int | – | The run id. |
| `room_id` | int | – | |
| `run_at` | int | s | When the fit was made. |
| `ua` | num | W/K, 20-400 | Heat through walls and roof (`ClimateCalib.PARAMS.ua`): heat flows out when the room is warmer than outside, in when outside is hotter (lead decision 28). |
| `inf_ach` | num | air changes per hour, 0.05-3 | Air leakage (`PARAMS.infAch`). |
| `moist_buffer` | num | ×, 1-10 | Moisture buffer (`PARAMS.moistBuffer`). |
| `co2_per_block` | num | mL/h per block, 5-300 | CO₂ per block (`PARAMS.co2PerBlock`). |
| `rmse_t` | num \| null | °C, ≥ 0 | Fit error of the temperature; `null` when the log had no temperature values. |
| `rmse_rh` | num \| null | %, ≥ 0 | Fit error of the humidity. |
| `rmse_co2` | num \| null | ppm, ≥ 0 | Fit error of the CO₂. |
| `log_rows` | int \| null | ≥ 2 | Rows in the farm log that was fitted; `null` for a calibration imported from browser storage. |
| `applied_at` | int \| null | s | Last time the run was applied; `null` if never. |
| `applied` | bool | – | Computed: `true` for the room's present calibration (`db.currentCalibration(roomId)`: the run with the largest `applied_at`, ties: the largest `id`). At most one run per room is `true`. |
| `source` | str \| null | `csv`, `history`, `import` | Revision 8. Where the fitted log came from (a CSV log file, the room's own readings, the browser-storage import); `null` for runs saved before upgrade 3 or without a source. |
| `log_from`, `log_to` | int \| null | s | Revision 8. First and last reading time of the fitted history (`source` = `history`); `null` otherwise. |
| `equipment` | object \| null | the 7 Equipment fields (3.11, without `room_id` and `saved_at`) | Revision 8. The room's machines the fit used; `null` = the typical machines (`PLANT`), an import, or a run saved before upgrade 3 (lead decision 50). |

```json
{ "id": 3, "room_id": 1, "run_at": 1791440000, "ua": 92.4, "inf_ach": 0.31, "moist_buffer": 3.6, "co2_per_block": 41,
  "rmse_t": 0.21, "rmse_rh": 1.9, "rmse_co2": 38, "log_rows": 5760, "applied_at": 1791440030, "applied": true,
  "source": "history", "log_from": 1791267200, "log_to": 1791439970,
  "equipment": { "ac_hp": 2.5, "ac_units": 1, "fog_lph": 3, "air_m3h": 1800, "walls": null, "roof": null, "height": 3 } }
```

### 3.7 MixRow

One planned crop of a room (`crop_mixes`). A room's mix is an array of MixRow, in the order it was saved.

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `crop` | str | a key of `ClimateController.CROPS` that has a `range` | |
| `blocks` | int | 0-200000 | |
| `co2_per_block` | num \| null | mL/h per block, 1-1000 | `null`: the check uses the room's calibrated value (or the simulation default). |

```json
[{ "crop": "oyster", "blocks": 1200, "co2_per_block": null }, { "crop": "pink", "blocks": 300, "co2_per_block": 55 }]
```

### 3.8 CapacityReport

Legacy (lead decision 19): the web app of revision 8 stores capacity checks as simulation runs (3.9). The routes 6.17 and 6.18 stay for compatibility.

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `id` | int | – | Larger = newer. |
| `room_id` | int | – | |
| `run_at` | int | s | When the server stored the report. |
| `verdict` | str | `impossible`, `too-dense`, `tight`, `good`, `too-empty` | Copied from `report.verdict`. |
| `utilisation` | int \| null | % | Copied from `report.utilisation`; `null` when the report has none (verdict `impossible`, or no common targets). |
| `report` | object | – | The object returned by `ClimateCapacity.checkAsync(room, mix, opts)`, stored as sent: `room`, `mix`, `planned`, `calibrated`, `estimate`, `warnings`, `verdict`, `why?`, `runs`, and (when the mix has common targets) `targets`, `balance`, `capacity`, `limit`, `utilisation`, `perCrop`, `energy`, `disagree`. Its `mix` uses the capacity.js names (`co2PerBlock`). `Infinity` values (for example `balance.estimate` with no limit) arrive as `null`; the page reads `null` as "no limit". |

```json
{ "id": 7, "room_id": 1, "run_at": 1791450500, "verdict": "good", "utilisation": 74,
  "report": { "room": "Room 1", "mix": [{ "crop": "oyster", "blocks": 1200 }], "planned": 1200, "calibrated": true, "estimate": false,
              "warnings": [], "verdict": "good", "utilisation": 74, "targets": { "spT": 26, "spRH": 88, "co2Lim": 1000, "crop": "oyster" },
              "capacity": { "max": 1620, "hi": 1700, "min": 0, "settled": true }, "runs": [ "..." ] } }
```

### 3.9 SimulationRunInfo and 3.10 SimulationRun

One saved Simulate run: a capacity check, a full cycle or a C8 equipment check (C1 `simulation_runs`). **SimulationRunInfo** has every field below except `result`; **SimulationRun** (6.22 only) adds `result`.

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `id` | int | – | Larger = newer |
| `room_id` | int | – | |
| `created_at` | int | s | When the server stored it |
| `kind` | str | `cycle`, `capacity`, `equipment` | |
| `verdict` | str | cycle: `pass`, `fail`, `impossible`; capacity: `good`, `tight`, `too-dense`, `too-empty`, `impossible`; equipment: `enough`, `too-small`, `too-big`, `oversized`, `impossible` | Copied from `result` by C1 (6.13) |
| `blocks` | int | ≥ 0 | Sum of `inputs.mix[].blocks` |
| `days` | int \| null | days | Cycle that ran: `result.totals.days`; `null` otherwise |
| `kwh` | num \| null | kWh | Cycle that ran: `result.totals.kwh` |
| `rm` | num \| null | RM | Cycle that ran: `result.totals.rm` |
| `utilisation` | int \| null | % | Capacity: `result.utilisation` |
| `real_start` | int \| null | s | 00:00 farm time of the day the planned cycle really started (the Calibrate tab sets it) |
| `note` | str \| null | 0–200 characters | |
| `inputs` | object | 3.10.1 | What the run used |
| `result` | object | – | Only in **SimulationRun**: the C7 Result (with `series`), the capacity report, or the C8 Report, as sent. `NaN` and `Infinity` arrived as `null`. |

#### 3.10.1 `inputs`

| Field | Type | Notes |
|---|---|---|
| `mix` | MixRow[] | The draft mix the run used (3.7 names: `co2_per_block`) |
| `settings` | Settings | The room's settings the run used (cycle and equipment: passed as `opts.settings`, so C7 runs them through `importSettings`; capacity: not passed to `capacity.js`; only their `airM3h` is, as `room.airM3h`, section 8) |
| `region` | str | An own key of `ClimateCapacity.DESIGN_DAYS` (`my-lowland`) |
| `tariff` | num | RM per kWh, 0–10 |
| `volume` | num | The room's volume at run time (7.2 rules) |
| `calibration` | `{ id, ua, inf_ach, moist_buffer, co2_per_block }` \| null | The applied calibration the run used, with exactly these 5 keys (`id` = the applied Calibration's `id`); `null` = typical values |
| `empty_below` | num \| null | Capacity only: `opts.emptyBelow` (%); `null` for a cycle or an equipment check |
| `equipment` | object \| null | The room's Equipment fields (`ac_hp`, `ac_units`, `fog_lph`, `air_m3h`, `walls`, `roof`, `height`) at run time, or `null` when the room has none; required (not `null`) for kind `equipment` (the machines the check started from) |

| Rule | Detail |
|---|---|
| Air exchange size of a run | No `inputs` key of its own. A capacity or cycle run's size is `inputs.settings.airM3h`: the settings the run used, passed as `room.airM3h` (C9 8 `airOf(room)`). An equipment check's is `inputs.equipment.air_m3h` (C8 sets `room.airM3h = air_m3h` per run). |

```json
{ "id": 12, "room_id": 1, "created_at": 1791450900, "kind": "cycle", "verdict": "pass", "blocks": 2000, "days": 83,
  "kwh": 1093.4, "rm": 623.2, "utilisation": null, "real_start": null, "note": null,
  "inputs": { "mix": [{ "crop": "oyster", "blocks": 2000, "co2_per_block": null }], "settings": { "airM3h": 1800, "...": "..." },
              "region": "my-lowland", "tariff": 0.57, "volume": 60, "calibration": null,
              "empty_below": null, "equipment": null } }
```

### 3.11 Equipment (C8)

The machines of one room (C1 `room_equipment`; meanings in `docs/contracts/equipment.md` section 4.2). The fields come in this order: `room_id`, `saved_at`, then the 7 Equipment fields `ac_hp`, `ac_units`, `fog_lph`, `air_m3h`, `walls`, `roof`, `height`.

| Field | Type | Unit or values | Notes |
|---|---|---|---|
| `room_id` | int | – | |
| `saved_at` | int | s | Last save |
| `ac_hp` | num | 1, 1.5, 2, 2.5, 3, 4, 5, 6 | Size of each aircond (hp badge) |
| `ac_units` | int | 1–4 | Number of airconds of that size |
| `fog_lph` | num | L/h, 0.5–50 | Fogger output |
| `air_m3h` | num | m³/h, 50–10000 (C8 default 1800) | Airflow of the air exchange pair (intake = exhaust) when on (C9). A save keeps the room's settings `airM3h` equal to it (6.26). |
| `walls` | str \| null | C8 `CONSTRUCTIONS` keys | `null` = not set |
| `roof` | str \| null | keys with `roof: true` | `null` = not set; set both or neither |
| `height` | num | m, 2–6 | Inside height |

```json
{ "room_id": 1, "saved_at": 1791450950, "ac_hp": 2.5, "ac_units": 1, "fog_lph": 3, "air_m3h": 1800,
  "walls": "pu50", "roof": "pu50", "height": 3 }
```

## 4. Errors

| Field | Type | Notes |
|---|---|---|
| `error` | str | A short sentence from the table below. Tests check the status and `error`. |
| `details` | str[] | One entry per problem, as `field: problem` (for example `mix[2].blocks: must be an integer from 0 to 200000`), or C2's `details` texts. Empty for 404. For 500: the error message. The wording of `details` is not frozen. |

```json
{ "error": "Invalid crop mix", "details": ["mix[0].crop: unknown crop \"shiitake\"", "mix[1].blocks: must be an integer from 0 to 200000"] }
```

| Status | `error` | When |
|---|---|---|
| 400 | `Body is not valid JSON` | The body does not parse. |
| 400 | `Body is larger than 1 MB` | The body is over 1,048,576 bytes (every route that takes a body, except 6.21). |
| 400 | `Body is larger than 8 MB` | 6.21 only: the body is over 8,388,608 bytes. |
| 400 | `Invalid query` | A query parameter breaks its rule (sections 6.8, 6.9). |
| 400 | `Invalid room` | `POST /api/rooms` or `PATCH /api/rooms/:id` body breaks a rule (section 7.2), or C2 `create` / `update` rejects it (section 4.1). |
| 400 | `Invalid settings` | The settings body breaks a rule (sections 6.2, 6.5). |
| 400 | `Invalid crop mix` | `PUT /mix` body breaks a rule (section 7.3). |
| 400 | `Invalid calibration` | `POST /calibrations` body breaks a rule (section 7.4). |
| 400 | `Invalid capacity report` | `POST /capacity` body breaks a rule (section 7.5). |
| 400 | `Invalid simulation run` | `POST` or `PATCH` of a simulation run breaks a rule (section 7.6). |
| 400 | `Invalid equipment` | `PUT /equipment` body breaks a rule (section 7.7). |
| 404 | `Unknown route` | No route has this method and path (under `/api/`). |
| 404 | `Unknown room` | `:id` is not a positive integer, no room has it, or the room is archived. |
| 404 | `Unknown settings version` | `:versionId` is not a version of this room. |
| 404 | `Unknown alarm` | The room has no alarm row with this `:alarmKey`, or the key does not URL-decode. |
| 404 | `Unknown calibration run` | `:runId` is not a calibration run of this room. |
| 404 | `No capacity report` | `GET /capacity` and the room has no report yet. |
| 404 | `Unknown simulation run` | `:runId` is not a positive integer or not a simulation run of this room. |
| 500 | `Server fault` | Anything else that throws (a database error, an unexpected room manager error, a bug). The server prints the error with its stack. A database error then stops the server (section 4.2). |

Checks run in this order, and the first failing step answers: route (404 `Unknown route`), room (404 `Unknown room`,
through `db.getRoom` and `archived_at`), other path ids (404), body size and JSON (400), query and body rules (400),
then the C1 or C2 call (its errors are mapped by section 4.1).

### 4.1 Mapping of C1 and C2 errors

| Error | How the API recognises it | Same for the fakes |
|---|---|---|
| C1 `NotFoundError` | `err.code === 'NOT_FOUND'`, then `err.what` (C1 section 6.1) | Yes: the fake db throws the class from `server/db-common.js` |
| C2 `RoomError` | `err.name === 'RoomError'`, then `err.code` (`'bad_input'` or `'not_found'`) and `err.details` (C2 section 6.2) | Yes: the fake room manager throws the class from `server/rooms-common.js` |
| node:sqlite error | `err.code === 'ERR_SQLITE_ERROR'`, then `err.errcode` (section 4.2) | Yes for constraint errors (lead decision 3) |

| Thrown by | Error | Reply |
|---|---|---|
| C1 (any function) | `NotFoundError` with `what: 'room'` | 404 `Unknown room` |
| C1 `getSettingsVersion` | `NotFoundError` with `what: 'settings'` | 404 `Unknown settings version` |
| C1 `applyCalibration` | `NotFoundError` with `what: 'calibration'` | 404 `Unknown calibration run` |
| C1 `getSimulationRun`, `updateSimulationRun`, `deleteSimulationRun` | `NotFoundError` with `what: 'simulation'` | 404 `Unknown simulation run` |
| C1 | `RangeError` | 500 `Server fault` (the API validates first, so this is a bug) |
| C1 or C2 | node:sqlite error (`code: 'ERR_SQLITE_ERROR'`) | 500 `Server fault`, then section 4.2 |
| C2 `create` | `RoomError` `bad_input` | 400 `Invalid room` with C2's `details` (the API's own plain-object check of 6.2 is the only source of `Invalid settings` on `POST /api/rooms`) |
| C2 `update` | `RoomError` `bad_input` | 400 `Invalid room` with C2's `details` |
| C2 `applySettings` (6.5, 6.7) | `RoomError` `bad_input` | 400 `Invalid settings` with C2's `details` |
| C2 `applySettings` (6.26, the air exchange size) | `RoomError` `bad_input` | 500 `Server fault` (a bug: the API passes a plain object `{ airM3h }` with a number `checkEquipment` already accepted) |
| C2 `ackAlarm` | `RoomError` `not_found` or `bad_input` | 404 `Unknown alarm` (the API checked the room through C1 first, so `not_found` here is the alarm) |
| C2 `update`, `archive`, `restart`, `applySettings` | `RoomError` `not_found` | 404 `Unknown room` (only if the room vanished between the C1 check and the call) |
| C2 `restart` | `RoomError` `bad_input` (archived) | 404 `Unknown room` (cannot happen: the API checked `archived_at` first) |
| Anything else | any error | 500 `Server fault` |

### 4.2 Database errors stop the server

| Item | Rule |
|---|---|
| Which errors | A node:sqlite error (`err.code === 'ERR_SQLITE_ERROR'`) whose primary result code is not `SQLITE_CONSTRAINT` (`(err.errcode & 0xff) !== 19`): disk full, I/O error, locked longer than `busy_timeout`, corrupt file. |
| Not included | A constraint failure (`errcode & 0xff === 19`: 275 CHECK, 1299 NOT NULL, 787 FOREIGN KEY, 3091 wrong type, 2067 UNIQUE): node:sqlite stored nothing and the database is fine; it means the API missed a validation (a bug). It answers 500 only (**decided here**). |
| Fake db | Sets `code: 'ERR_SQLITE_ERROR'` and the same `errcode` as node:sqlite for each of those constraint failures (lead decision 3), so this rule behaves the same against the fake and the real db. A test shared by both checks it (C1). The fake cannot make a non-constraint error; section 12 says how a test makes one. |
| What `handle` does | Sends the 500 reply, then calls `opts.onFatal(err)`. |
| What `server/main.js` does | Section 2.2 `fatal(err)`: prints `Database error: <message>` and exits with code 1. |
| Tick errors | C2 emits `fatal` (C2 section 11); `server/main.js` listens to it with the same `fatal(err)`. |

## 5. Routes

| # | Method | Path | Query or body | Success | Reply |
|---|---|---|---|---|---|
| 6.1 | GET | `/api/rooms` | – | 200 | Room[] |
| 6.2 | POST | `/api/rooms` | `{ name, volume, settings? }` | 201 | Room |
| 6.3 | PATCH | `/api/rooms/:id` | any of `{ name, volume, archived }` | 200 | Room |
| 6.4 | GET | `/api/rooms/:id/settings` | – | 200 | Settings |
| 6.5 | PUT | `/api/rooms/:id/settings` | `{ settings, note? }` | 200 | `{ settings, warnings }` |
| 6.6 | GET | `/api/rooms/:id/settings/history` | – | 200 | SettingsVersion[] |
| 6.7 | POST | `/api/rooms/:id/settings/restore/:versionId` | – | 200 | `{ settings, warnings }` |
| 6.8 | GET | `/api/rooms/:id/readings` | `?from=&to=&step=` | 200 | Reading[] |
| 6.9 | GET | `/api/rooms/:id/events` | `?limit=&before=` | 200 | Event[] |
| 6.10 | GET | `/api/rooms/:id/alarms` | – | 200 | Alarm[] |
| 6.11 | POST | `/api/rooms/:id/alarms/:alarmKey/ack` | – | 200 | Alarm |
| 6.12 | GET | `/api/rooms/:id/calibrations` | – | 200 | Calibration[] |
| 6.13 | POST | `/api/rooms/:id/calibrations` | `{ ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows, run_at?, source?, log_from?, log_to?, equipment? }` | 201 | Calibration |
| 6.14 | POST | `/api/rooms/:id/calibrations/:runId/apply` | – | 200 | Calibration |
| 6.15 | GET | `/api/rooms/:id/mix` | – | 200 | MixRow[] |
| 6.16 | PUT | `/api/rooms/:id/mix` | MixRow[] | 200 | MixRow[] |
| 6.17 | GET | `/api/rooms/:id/capacity` | – | 200 | CapacityReport (legacy, lead decision 19) |
| 6.18 | POST | `/api/rooms/:id/capacity` | the `checkAsync` report object | 201 | CapacityReport (legacy, lead decision 19) |
| 6.19 | POST | `/api/rooms/:id/restart` | – | 200 | Room |
| 6.20 | GET | `/api/rooms/:id/simulations` | `?limit=&before=` | 200 | SimulationRunInfo[] |
| 6.21 | POST | `/api/rooms/:id/simulations` | `{ kind, inputs, result, note? }` | 201 | SimulationRunInfo |
| 6.22 | GET | `/api/rooms/:id/simulations/:runId` | – | 200 | SimulationRun |
| 6.23 | PATCH | `/api/rooms/:id/simulations/:runId` | any of `{ note, real_start }` | 200 | SimulationRunInfo |
| 6.24 | DELETE | `/api/rooms/:id/simulations/:runId` | – | 200 | SimulationRunInfo |
| 6.25 | GET | `/api/rooms/:id/equipment` | – | 200 | Equipment or `null` |
| 6.26 | PUT | `/api/rooms/:id/equipment` | the 7 Equipment fields | 200 | Equipment |
| C4 | GET | `/api/stream` | – | 200 | Server-Sent Events (section 10) |

## 6. Route details

Every route below can also answer 404 `Unknown route` (wrong method) and 500 `Server fault`; the tables list the other
errors. Every `/api/rooms/:id/...` route first checks the room with `db.getRoom(id)` and `archived_at` (404
`Unknown room`). "Room manager" means C2 (`server/rooms.js`), "database" means C1 (`server/db.js`); section 11 lists
the exact calls.

### 6.1 GET /api/rooms

| Item | Value |
|---|---|
| Does | Lists the rooms that are not archived, with their live status. |
| Request | No query, no body. |
| Reply | 200, Room[] (`rooms.list()`), ordered by `id` ascending. `[]` when there are no rooms. |
| Errors | none besides 500 |
| Effects | none |

### 6.2 POST /api/rooms

| Item | Value |
|---|---|
| Does | Creates a room; its loop starts at once (spec section 3). |
| Request | `{ name, volume, settings? }`. `name`, `volume`: rules in section 7.2 (both required). `settings`: optional plain object (not `null`, not an array). A `vent` field is unknown (400 `Invalid room`, C9 6.3). The air exchange size is the setting `airM3h` (C9 5.2; default 1800). |
| Validation | The API checks the room fields (`checkRoom`, 400 `Invalid room`) and that `settings`, when present, is a plain object (400 `Invalid settings`). Then it calls `rooms.create({ name, volume, settings })`, which validates again. C2 lays `settings` over `ClimateController.defaultSettings()` with `roomM3` = `volume` (cleanSettings), then runs importSettings, and stores only its result (lead decision 6; C2 section 9.4). So a missing setting takes its default, with `roomM3` = `volume`, and a given `roomM3` wins (for example `volume` 200 with `settings: { crop: 'pink' }` stores `roomM3` = 200). Without `settings` the room gets `ClimateController.defaultSettings()` with `roomM3` = `volume`. |
| Reply | 201, the `room` of C2's `{ room, warnings }` (with `live` from the started loop). C2's `warnings` (dropped keys and `importSettings` warnings, C2 section 9.4) are not returned (the reply is the Room); a browser that needs them saves the settings with 6.5. |
| Errors | 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid room` (section 7.2, or the body is not an object, or a C2 `bad_input`, section 4.1); 400 `Invalid settings` (`settings` is not a plain object). |
| Effects | One `rooms` row (`adapter` = `sim`, `created_at` = now); one `room_settings` row with `note` = `Created`; the loop starts; stream events `settings` (the first version), `event` (`Room created`, `Started`) and `room`, as C2 emits them. |

### 6.3 PATCH /api/rooms/:id

| Item | Value |
|---|---|
| Does | Renames the room, changes its volume, or archives it. |
| Request | An object with at least one of: `name`, `volume` (rules in section 7.2) and `archived` (only the value `true`). A `vent` field is unknown (C9 6.3). |
| Calls | When `name` or `volume` is present: `rooms.update(id, { those fields })` (a changed `volume` restarts the loop in C2, so the simulated room uses it). Then, when `archived` is `true`: `rooms.archive(id)`. |
| Reply | 200, the Room returned by the last call. After an archive: `archived_at` = now and `live` = `null`. |
| Errors | 404 `Unknown room`; 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid room` (a rule of 7.2, an empty object, an unknown field such as `vent`, or `archived` other than `true`). |
| Effects | The `rooms` row changes; an archive stops the loop and saves its state; stream event `room` (one per C2 call), and `event` rows C2 writes (`Stopped`, `Resumed …`, `Room archived`). There is no un-archive in version 1. |

### 6.4 GET /api/rooms/:id/settings

| Item | Value |
|---|---|
| Does | Gives the room's current settings: the latest stored version, which is the one the controller runs. |
| Request | No query, no body. |
| Reply | 200, the Settings object (bare, no wrapper): `db.currentSettings(id).settings`. |
| Errors | 404 `Unknown room` |
| Effects | none |

### 6.5 PUT /api/rooms/:id/settings

| Item | Value |
|---|---|
| Does | Validates and stores a new settings version; the running controller uses it at once. |
| Request | `{ settings, note? }`. `settings`: required, a plain JSON object (not `null`, not an array). `note`: optional; a string of at most 200 characters after trimming, or `null`. |
| Validation | The API checks only the body shape (the rules of the Request row; no unknown body fields). The settings themselves are validated in one place: `rooms.applySettings(id, body.settings, note)` (C2 section 9.2), always called with exactly three arguments: `note` is `body.note.trim()`, or `undefined` when `body.note` is `null`, left out or empty after trimming. |
| Rule for missing settings | The body's `settings` are untrusted: C2 never passes them to `ClimateController.applySettings` directly. C2 lays them over the room's current stored version with `cleanSettings(settings, base)` (C2 sections 6.3 and 9.2 step 2), then runs `ClimateController.importSettings` on the result, and only that `settings` result is applied to the running controller and stored (lead decision 6). So a setting that is missing **keeps the room's current stored value**; a value that `importSettings` rejects (out of its limits, wrong type, unknown selection) is corrected or falls back to the controller default, with a warning; an unknown setting is dropped with a warning. A partial body (for example `{ "settings": { "spT": 20 } }`) changes only the settings it gives. C5 sends the whole Settings object. C2 also runs `ClimateController.upgradeSettings` as C9 6.3 says (the stored base before the merge, and the merged object), so a setting C9 removed (for example `rules.airMode`) is dropped with the warning `Setting "<path>" was removed: fresh air now runs as short purges.` and `manual.fan` becomes `manual.air` (C9 5.2). The stored version is the corrected merge, except where C2's live-room rules change it (C2 section 9.1: targets during a ramp, a stage, crop or farm-type change, the CO₂ pair correction of `rules.fanOn` / `rules.fanOff`, C9 6.3). |
| Reply | 200, `{ settings, warnings }`, exactly as C2's `applySettings` returns them (its `version` is left out): `settings` is the stored Settings. `warnings` is C2's warning list (string[], `[]` when none): keys dropped by cleanSettings, importSettings warnings, and C2's live-room corrections (C2 sections 6.3 and 9.2). |
| Errors | 404 `Unknown room`; 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid settings`: the body is not an object, `settings` is missing or not a plain object, `note` is not a string or `null` or is longer than 200 after trimming, an unknown body field, or a C2 `bad_input` (section 4.1). |
| Effects | One `room_settings` row (`saved_at` = now, the stored settings, `note`); the room manager applies the settings to the running controller; stream events `settings`, `event` (`Settings saved (version <id>)…` and any controller events), and `room` when C2's summary changes (C2 section 7). A room whose loop is stopped (crashed) stores the version and uses it at its next start. Warnings do not stop the save. |

### 6.6 GET /api/rooms/:id/settings/history

| Item | Value |
|---|---|
| Does | Lists the room's stored settings versions. |
| Request | No query, no body. |
| Reply | 200, SettingsVersion[] from `db.settingsHistory(id)` with `room_id` added, newest first (`id` descending). The first row is the current version. Every version is listed (no paging). |
| Errors | 404 `Unknown room` |
| Effects | none |

### 6.7 POST /api/rooms/:id/settings/restore/:versionId

| Item | Value |
|---|---|
| Does | Makes an earlier version current, stored as a new version. |
| Request | No body. |
| Calls | `v = db.getSettingsVersion(id, versionId)`, then `rooms.applySettings(id, v.settings, 'Restored version <versionId>', { exact: true })` (C2 section 4: with `exact`, the restored targets are kept even when the stage, crop or farm type changes, and no ramp runs). Validation is C2's, as in 6.5: the old version goes through `importSettings` again, so a version saved by an older controller is brought up to date (a version saved before C9 also goes through `ClimateController.upgradeSettings`, C9 6.3, and its warnings join `warnings`); a setting the old version does not have keeps the room's current value (C2 section 9.2); only the `importSettings` result is applied and stored (lead decision 6). |
| Reply | 200, `{ settings, warnings }` as in 6.5. |
| Errors | 404 `Unknown room`; 404 `Unknown settings version` (`:versionId` is not a positive integer or not a version of this room). |
| Effects | One new `room_settings` row with `note` = `Restored version <versionId>`; the room manager applies it; stream events as in 6.5. The restored row itself is not changed. |

### 6.8 GET /api/rooms/:id/readings

| Item | Value |
|---|---|
| Does | Gives the readings history, raw or averaged into time buckets. |
| Query `to` | Optional integer ≥ 0, s. Default: now. |
| Query `from` | Optional integer ≥ 0, s. Default: `to` − 3600. Must be ≤ `to`. |
| Query `step` | Optional integer, s. `0` or absent: raw rows. Otherwise 1-86400: averaged rows. |
| Range limits | Raw rows (`step` = 0): `to` − `from` ≤ 7 days (604,800 s). `step` 1–3599: ≤ 31 days (2,678,400 s). `step` 3600–86400: ≤ 1300 days (112,320,000 s), so the Calibrate tab can load a whole cycle hour by hour (at most 31,200 rows; lead decision 22). |
| Call | `db.queryReadings(id, { from, to, step: step || null })`; the rows are sent unchanged (section 3.2). |
| Rows chosen | `from` ≤ `t` ≤ `to` (both ends included). |
| Reply, raw | 200, Reading[], `t` ascending. `[]` when there are none. |
| Reply, averaged | 200, Reading[], one row per bucket that has at least one reading, `t` ascending. Bucket of a reading: `Math.floor(t / step) * step` (aligned to 1970, so the same buckets come back on every request; the first bucket can start before `from`). Row values: `t` = the bucket start; `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_setpoint`, `power_w`, `core` = the mean of the non-null values (`null` when all are null); `fog`, `air`, `lights`, `circ` = the mean (for `air`: the fraction of the readings with the air exchange on, `AVG(air)`, C9 6.1); `ac_mode`, `kwh`, `ac_fan` and `stage` = the values of the last reading in the bucket. Empty buckets are left out; a chart shows a gap where readings are missing. |
| Errors | 404 `Unknown room`; 400 `Invalid query` (a value that is not a decimal integer, a value out of range, `from` > `to`, a range over its limit). Unknown query parameters are ignored. |
| Effects | none |

### 6.9 GET /api/rooms/:id/events

| Item | Value |
|---|---|
| Does | Gives the event log, newest first, one page at a time. |
| Query `limit` | Optional integer 1-500. Default 100. |
| Query `before` | Optional positive integer: an event `id` (not a time). Only events with `id` < `before` are given (the next page: `before` = the smallest `id` of the last page). |
| Call | `db.listEvents(id, { limit, before: before ?? null })`. |
| Reply | 200, Event[], `id` descending, at most `limit` rows. `[]` at the end of the log. |
| Errors | 404 `Unknown room`; 400 `Invalid query`. |
| Effects | none |

### 6.10 GET /api/rooms/:id/alarms

| Item | Value |
|---|---|
| Does | Gives the active and recent alarms. |
| Call | `db.listAlarms(id, { recent: 20 })` (C1 section 6.8, unchanged). |
| Rows chosen | Every open alarm (`cleared_at` = `null`), then the 20 most recently cleared alarms. |
| Reply | 200, Alarm[]: first the open alarms, `raised_at` descending; then the cleared ones, `cleared_at` descending. Ties: larger `id` first. `[]` when the room never had an alarm. |
| Errors | 404 `Unknown room` |
| Effects | none |

### 6.11 POST /api/rooms/:id/alarms/:alarmKey/ack

| Item | Value |
|---|---|
| Does | Acknowledges an alarm. |
| Request | No body. `:alarmKey` is an `alarm_key`, URL-decoded once with `decodeURIComponent` (for example `sensor_RH`); a key that fails to decode gives 404 `Unknown alarm`. |
| Call | `rooms.ackAlarm(id, alarmKey)` (C2 section 10.2). |
| What is acknowledged | Every row of this room and key with `acked_at` = `null` gets `acked_at` = now, and the running controller acknowledges the alarm (`ctl.ack(alarmKey)`). |
| Reply | 200, the newest row of the key (largest `id`) after the change. Acknowledging again changes nothing and answers 200 with the same row (idempotent). |
| Errors | 404 `Unknown room`; 404 `Unknown alarm` (no row with this key in this room; section 4.1). |
| Effects | When a row changed: stream event `alarm` (`acked`) for each changed row and `event` (`Acknowledged: <label>`). An ack does not change the open-alarm count; C2 emits `room` only when its summary changes (C2 section 10.2 step 6). |

### 6.12 GET /api/rooms/:id/calibrations

| Item | Value |
|---|---|
| Does | Lists the calibration runs of the room. |
| Reply | 200, Calibration[] (`db.listCalibrations(id)`, `applied` from `db.currentCalibration(id)`), `run_at` descending, then `id` descending. `[]` when there are none. |
| Errors | 404 `Unknown room` |
| Effects | none |

### 6.13 POST /api/rooms/:id/calibrations

| Item | Value |
|---|---|
| Does | Saves a fitted run from the Calibrate tab (or one imported from browser storage). It does not apply it. |
| Request | `{ ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows, run_at?, source?, log_from?, log_to?, equipment? }`: rules in section 7.4. `source`: `history` (the room's readings, with `log_from` and `log_to`), `csv` or `import`. `equipment`: the 7 Equipment fields the fit used, or `null` (lead decision 50). From a fit: the four values are `fitAsync(...).params` (`ua`, `infAch`, `moistBuffer`, `co2PerBlock`), the errors are `.result.rmse` (`T`, `RH`, `CO2`), `log_rows` is the number of parsed log rows. |
| Call | `db.saveCalibration(id, body)` (`run_at` left out → now). |
| Reply | 201, the Calibration (`applied_at` = `null`, `applied` = `false`). |
| Errors | 404 `Unknown room`; 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid calibration`. |
| Effects | One `calibrations` row (`run_at` = the body's `run_at`, or now). No stream event. |

### 6.14 POST /api/rooms/:id/calibrations/:runId/apply

| Item | Value |
|---|---|
| Does | Makes the run the room's present calibration: the room's simulated adapter and the room's capacity checks use its four values. |
| Request | No body. |
| Calls | `run = db.applyCalibration(id, runId)`, then `rooms.restart(id)` (the room is not archived: the API checked it). The restart builds the adapter again from the database, so it uses the new calibration (C2 section 8.1); it also runs a crashed room again. |
| Reply | 200, `run` (`applied_at` = now, `applied` = `true`). Applying the present run again only updates `applied_at` (and restarts the loop). |
| Errors | 404 `Unknown room`; 404 `Unknown calibration run` (`:runId` is not a positive integer or not a run of this room; `NotFoundError` `calibration`). |
| Effects | `applied_at` = now on that row (the room's other runs keep theirs, so they are no longer `applied`); the loop restarts; stream events `event` (`Stopped`, then `Resumed after 0 min stopped`) and `room` (from the restart). The Calibrate tab calls 6.13 then 6.14 for **Save and apply**. |

### 6.15 GET /api/rooms/:id/mix

| Item | Value |
|---|---|
| Does | Gives the planned crop mix. |
| Reply | 200, MixRow[] (`db.getMix(id)`) in saved order. `[]` when the room has no mix. |
| Errors | 404 `Unknown room` |
| Effects | none |

### 6.16 PUT /api/rooms/:id/mix

| Item | Value |
|---|---|
| Does | Replaces the whole crop mix. |
| Request | MixRow[] (a JSON array, may be empty): rules in section 7.3. `co2_per_block` may be left out (same as `null`). |
| Call | `db.replaceMix(id, rows)`. |
| Reply | 200, the stored MixRow[] (in the order sent; `co2_per_block` always present). |
| Errors | 404 `Unknown room`; 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid crop mix`. |
| Effects | The room's `crop_mixes` rows are replaced in one transaction. The last capacity report is kept (it is not deleted or changed). No stream event. The live room uses the new block count after its next restart (C2 8.1). |

### 6.17 GET /api/rooms/:id/capacity

| Item | Value |
|---|---|
| Does | Gives the room's last capacity report. |
| Reply | 200, the CapacityReport with the largest `id` (the newest stored; `db.latestCapacityReport(id)`). |
| Errors | 404 `Unknown room`; 404 `No capacity report` (the call returns `null`). |
| Effects | none |

### 6.18 POST /api/rooms/:id/capacity

| Item | Value |
|---|---|
| Does | Saves a finished check. The check runs in the browser (`ClimateCapacity.checkAsync`). The browser-storage import does not use this route (section 8.1). |
| Request | The report object exactly as `checkAsync` returned it (not wrapped): rules in section 7.5. |
| Call | `db.saveCapacityReport(id, { report: body })`. |
| Reply | 201, the CapacityReport (`run_at` = now, `verdict` and `utilisation` copied from the report). |
| Errors | 404 `Unknown room`; 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid capacity report`. |
| Effects | One `capacity_reports` row. Earlier reports are kept. No stream event. |

### 6.19 POST /api/rooms/:id/restart

| Item | Value |
|---|---|
| Does | Runs the room's loop again: after a crash (`live.running` = `false`, `live.error` set), or to restart a running loop. The Rooms home and the room page header (C5 3.8) show a **Restart** button on a stopped room and calls it through `web/api.js` `restartRoom(id)` (lead decision 5; C5 section 4.3). |
| Request | No body. |
| Call | `rooms.restart(id)` (C2 section 4): a running loop saves its state and stops; a crashed one does not save; then the loop starts again from the database (latest settings, applied calibration, saved state). |
| Reply | 200, the Room after the restart. If the loop fails to start again, the reply is still 200, with `live.running` = `false` and the new `live.error`. |
| Errors | 404 `Unknown room` |
| Effects | Stream events `event` (`Stopped` for a running loop; `Resumed after <N> min stopped` or `Started`; or `Stopped by an error: …`) and `room`. |

### 6.20 GET /api/rooms/:id/simulations

| Item | Value |
|---|---|
| Does | Lists the room's saved Simulate runs, newest first, one page at a time. Simulations run in the browser; the server only validates and stores them (lead decision 17). |
| Query `limit` | Optional integer 1-200. Default 50. |
| Query `before` | Optional positive integer: a run `id`. Only runs with `id` < `before` are given (the next page: the smallest `id` of the last page). |
| Call | `db.listSimulationRuns(id, { limit, before: before ?? null })`. |
| Reply | 200, SimulationRunInfo[] (no `result`), `id` descending, at most `limit`. `[]` at the end. |
| Errors | 404 `Unknown room`; 400 `Invalid query`. |
| Effects | none |

### 6.21 POST /api/rooms/:id/simulations

| Item | Value |
|---|---|
| Does | Stores a finished run (a capacity check, a full cycle or an equipment check) that the browser computed. |
| Request | `{ kind, inputs, result, note? }`: rules in section 7.6 (`checkSimulationRun`). At most 8 MB. |
| Call | `db.saveSimulationRun(id, { kind, inputs, result, note })` with `note` trimmed, `null` when empty or left out. |
| Reply | 201, SimulationRunInfo (no `result`: the browser already has it). |
| Errors | 404 `Unknown room`; 400 `Body is not valid JSON`; 400 `Body is larger than 8 MB`; 400 `Invalid simulation run`. |
| Effects | One `simulation_runs` row (`created_at` = now; the summary columns copied by C1 6.13). No stream event: the tab that saved the run reloads its own list (lead decision 18). |

### 6.22 GET /api/rooms/:id/simulations/:runId

| Item | Value |
|---|---|
| Does | Gives one run with its whole `result` (a default cycle's is about 300 KB). |
| Call | `db.getSimulationRun(id, runId)`. |
| Reply | 200, SimulationRun. |
| Errors | 404 `Unknown room`; 404 `Unknown simulation run` (`:runId` not a positive integer, or not a run of this room). |
| Effects | none |

### 6.23 PATCH /api/rooms/:id/simulations/:runId

| Item | Value |
|---|---|
| Does | Changes a run's note, or links it to the room's real cycle (`real_start`, used by Predicted vs real). |
| Request | An object with at least one of `note`, `real_start` and no other field (section 7.6, `checkRunPatch`). |
| Call | `db.updateSimulationRun(id, runId, changes)` (`note` trimmed, empty → `null`). |
| Reply | 200, SimulationRunInfo after the change. |
| Errors | 404 `Unknown room`; 404 `Unknown simulation run`; 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid simulation run`. |
| Effects | The row's `note` and/or `real_start` change. No stream event. |

### 6.24 DELETE /api/rooms/:id/simulations/:runId

| Item | Value |
|---|---|
| Does | Deletes a run: the only delete route (lead decision 18). |
| Request | No body. |
| Call | `db.deleteSimulationRun(id, runId)`. |
| Reply | 200, SimulationRunInfo of the deleted run. |
| Errors | 404 `Unknown room`; 404 `Unknown simulation run`. |
| Effects | The row is deleted. No stream event. |

### 6.25 GET /api/rooms/:id/equipment

| Item | Value |
|---|---|
| Does | Gives the room's machines (C8). |
| Call | `db.getEquipment(id)`. |
| Reply | 200, Equipment, or `null` when the room has no machines saved (the simulation then uses the typical machines, `PLANT`). |
| Errors | 404 `Unknown room` |
| Effects | none |

### 6.26 PUT /api/rooms/:id/equipment

| Item | Value |
|---|---|
| Does | Saves the room's machines (replaces the row) and keeps the room's settings `airM3h` (the live room's air exchange size, C9 5.2) equal to the saved `air_m3h` (lead decision 35 amended). |
| Request | `{ ac_hp, ac_units, fog_lph, air_m3h, walls, roof, height }`: exactly these 7 fields (section 7.7). |
| Calls | 1. `e = db.saveEquipment(id, body)`. 2. `cur = db.currentSettings(id).settings` (as 6.4 reads them). 3. Only when `cur.airM3h !== body.air_m3h`: `rooms.applySettings(id, { airM3h: body.air_m3h }, 'Air exchange size from Your machines')`, exactly three arguments (a partial settings object: C2 lays it over the stored version as in 6.5, so no other setting changes). No other C2 function is needed. |
| Reply | 200, the Equipment `e` (also when the settings changed; the `{ settings, warnings }` of `applySettings` is not returned). |
| Errors | 404 `Unknown room`; 400 `Body is not valid JSON`; 400 `Body is larger than 1 MB`; 400 `Invalid equipment`. The checks run before step 1, so a 400 stores nothing and changes no settings. |
| Effects | The room's `room_equipment` row is replaced. The equipment save itself sends no stream event (lead decision 18). When step 3 runs: one `room_settings` row with `note` = `Air exchange size from Your machines`, and the stream events of a settings save (6.5: `settings`, `event` `Settings saved (version <id>)…`, and `room` when C2's summary changes); the controller uses the new `airM3h` at once, the live simulated room at its next loop restart (C9 6.3). When the sizes are equal: no settings row, no event. No restart: the live room uses the other machines after its next restart (C2 8.1), Simulate and Calibrate use them at once. An applied calibration fitted with other machines is now stale (the Calibrate tab warns, lead decision 50). |

## 7. Validation rules and `room-rules.js`

The rules of today's capacity card (`normRoom`, `validCalib` in `app.js`) move to `room-rules.js`, shared by the API
and the web modules. The limits are the same; the difference is what happens to bad input:

| Function kind | Behaviour | Used by |
|---|---|---|
| `normRoom`, `validCalib` | **Correct**: keep only valid fields, drop bad mix rows, default bad values (today's behaviour, unchanged) | The Rooms home's one-time **Import rooms from this browser** (reads `mushroom-farm.rooms.v1`) |
| `check*` | **Reject**: return the list of problems; the API answers 400 and stores nothing | `server/api.js` |

Settings are not checked here: the room manager validates them (`importSettings`, sections 6.2, 6.5).

### 7.1 Exports of `room-rules.js`

Exported as `ClimateRoomRules` on `window` or `globalThis`.

| Item | Rule |
|---|---|
| Read at load | `global.ClimateSim`, `ClimateController`, `ClimateCalib` (as on `master`) and `ClimateCapacity.DESIGN_DAYS` (wave 2, for the `region` rule of 7.6; `calib.js` itself reads `ClimateSim` once when it loads, and `capacity.js` reads `ClimateAir` at load, C9 3) |
| Read at call time | `global.ClimateEquipment`, only inside `checkEquipmentBody`, `checkCalibration` and `checkSimulationRun`, when they are called; never at load |
| Without `cycle.js` and `equipment.js` | Loading `room-rules.js` must not throw: `tests/web-load.test.js`, `tests/web-bench.test.js`, `tests/web-air.test.js` and `tests/web-mimic.test.js` (C9's) load it after `sim.js`, `air.js`, `controller.js`, `runtime.js`, `calib.js`, `capacity.js` only; nobody changes them in wave 2 (the lead in wave 3, wave 2 plan 3.1) |

| Environment | Load order |
|---|---|
| Browser | The script tags of `index.html` (C5 sections 1.2 and 1.3, written by the lead in prep 2.0): `sim.js`, `air.js`, `controller.js`, `runtime.js`, `calib.js`, `capacity.js`, `cycle.js`, `equipment.js`, `room-rules.js`, then the `web/` files. |
| Node | `server/api.js` and `tests/room-rules.test.js` require `../sim.js`, `../air.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../capacity.js`, `../cycle.js`, `../equipment.js`, in that order, then `../room-rules.js`, then read `globalThis.ClimateRoomRules`. Wave 2 adds `../air.js` to `server/api.js` because it adds `../capacity.js`, which reads `ClimateAir` at load (C9 3). |
| Node, already loaded | On the server `air.js`, `sim.js` and `equipment.js` may already be loaded through `server/rooms.js` → `server/sim-adapter.js` (which requires `../air.js`, `../sim.js`, `../runtime.js`, `../equipment.js`; `server/main.js` requires `rooms.js` before `api.js`), so `equipment.js` can load before `controller.js`, `capacity.js` and `cycle.js`. That is safe: `equipment.js` reads only `ClimateSim` at load, and `ClimateAir`, `ClimateController`, `ClimateCapacity`, `ClimateCycle` only when `estimate` or a run function is called; server code calls only `checkEquipment`, `geometry`, `shell` and `plantOf` (C8 section 1). |

| Export | Signature | Returns | Notes |
|---|---|---|---|
| `LIM` | constant | `{ blocks: 200000, volume: [5, 5000], co2: [1, 1000], name: 60 }` | Today's `LIM` of `app.js`, plus the name length. |
| `VERDICTS` | constant | `['impossible', 'too-dense', 'tight', 'good', 'too-empty']` | Replaces the `VERDICT_CHIP` lookup in `normRoom`; the chip texts stay in the web module. |
| `ALARM_KEYS` | constant | `['tHi', 'tLo', 'tCrop', 'coreHi', 'rhHi', 'rhLo', 'co2Hi', 'co2Safe', 'disagree', 'acTooSmall', 'blocksDone', 'shockLimit', 'airTooSmall']` (`airTooSmall`: C9 5.5, 6.3) | The fixed alarm keys of section 3.4; `sensor_<key>` keys are not listed. For display only; the API does not reject other keys (C2 decides). |
| `hasCrop(key)` | `(str) → bool` | `true` when `key` is an own key of `ClimateController.CROPS` with a `range` | As in `app.js`. |
| `validCalib(c)` | `(object) → calib \| null` | `{ ua, infAch, moistBuffer, co2PerBlock, rmse, date }` or `null` | Unchanged from `app.js` (camelCase, capacity.js shape). `rmse` is `c.rmse \|\| {}`, so `rmse.T` can be `undefined` (section 8 maps it). |
| `normRoom(r, i)` | `(object, int) → room \| null` | `{ id, name, volume, calib, mix, report, rev }` | Unchanged from `app.js`, except `VERDICTS`, `ClimateSim.PLANT.room.volume` (for `PL.room.volume`) and no `vent` (C9 6.3: a stored room's `vent` is ignored). |
| `checkRoom(body, partial)` | `(any, bool) → str[]` | Problems, `[]` when valid | Section 7.2. `partial` = `true` for PATCH. |
| `checkMix(rows)` | `(any) → str[]` | Problems, `[]` when valid | Section 7.3. |
| `checkCalibration(body, now)` | `(any, int) → str[]` | Problems, `[]` when valid | Section 7.4. `now` = the server time in s (for the `run_at` rule). Reads `ClimateEquipment` when called. |
| `checkReport(report)` | `(any) → str[]` | Problems, `[]` when valid | Section 7.5. |
| `checkSimulationRun(body, now)` | `(any, int) → str[]` | Problems, `[]` when valid | Section 7.6 (revision 8). Reads `ClimateEquipment` when called. |
| `checkRunPatch(body, now)` | `(any, int) → str[]` | Problems, `[]` when valid | Section 7.6 (revision 8). |
| `checkEquipmentBody(body)` | `(any) → str[]` | Problems, `[]` when valid | Section 7.7 (revision 8). Reads `ClimateEquipment` when called. |

### 7.2 Room fields (`checkRoom`)

| Field | Required in POST | Rule | Same limit as |
|---|---|---|---|
| (body) | – | A plain object; no fields other than those below (`settings` only when not `partial`; `archived` only when `partial`). `vent` is an unknown field (`vent: unknown field`, C9 6.3). | – |
| `name` | yes | A string; after trimming 1-60 characters. The trimmed name is stored. | `normRoom` (60 characters) |
| `volume` | yes | A finite number from 5 to 5000 (m³) | `LIM.volume` |
| `settings` | no (POST only) | Not checked by `checkRoom`; the API checks it is a plain object (400 `Invalid settings`) and C2 validates it | `importSettings` (in C2) |
| `archived` | – (PATCH only) | Exactly `true` | – |
| (PATCH) | – | At least one field | – |

### 7.3 Crop mix (`checkMix`)

| Field | Rule | Same limit as |
|---|---|---|
| (body) | An array (may be empty) of plain objects; no fields other than `crop`, `blocks`, `co2_per_block` | – |
| `crop` | `hasCrop(crop)` | `normRoom` |
| `blocks` | An integer from 0 to 200000 | `LIM.blocks` (`normRoom` rounds; the API rejects a fraction) |
| `co2_per_block` | Left out, `null`, or a finite number from 1 to 1000 (mL/h per block) | `LIM.co2` |

The same crop may appear in more than one row (as today).

### 7.4 Calibration run (`checkCalibration`)

| Field | Required | Rule | Same limit as |
|---|---|---|---|
| (body) | – | A plain object; no other fields | – |
| `ua` | yes | Finite number from 20 to 400 | `ClimateCalib.PARAMS.ua` (as `validCalib`) |
| `inf_ach` | yes | Finite number from 0.05 to 3 | `PARAMS.infAch` |
| `moist_buffer` | yes | Finite number from 1 to 10 | `PARAMS.moistBuffer` |
| `co2_per_block` | yes | Finite number from 5 to 300 | `PARAMS.co2PerBlock` |
| `rmse_t`, `rmse_rh`, `rmse_co2` | yes (each key present) | `null` or a finite number ≥ 0 | – (`replay` gives `NaN` when a column has no values; JSON sends it as `null`) |
| `log_rows` | yes | `null` or an integer ≥ 2 | `parseCsv` needs 2 data rows |
| `run_at` | no | An integer from 1 to `now` + 60 | – (for imported calibrations: their `date`) |
| `source` | no | Left out, `null`, `csv`, `history` or `import` (revision 8) | – |
| `log_from`, `log_to` | no | Together: both left out or `null`, or both integers ≥ 1 with `log_from` ≤ `log_to` ≤ `now` + 60. Required (not `null`) when `source` is `history` (revision 8) | – |
| `equipment` | no | Left out, `null`, or an object passing `checkEquipmentBody` (7.7; revision 8, lead decision 50) | C8 `checkEquipment` |

### 7.5 Capacity report (`checkReport`)

| Field | Rule | Same rule as |
|---|---|---|
| (body) | A plain object | `normRoom` |
| `verdict` | One of `VERDICTS` | `normRoom` |
| `runs` | An array | `normRoom` |
| `utilisation` | Left out, `null`, or an integer ≥ 0 | – (stored in C1's STRICT `INTEGER` column; `checkAsync` rounds it, and leaves it out when the mix has no common targets) |

The rest of the report is stored as sent and is not checked (the page wrote it; the size limit is 1 MB).

### 7.6 Simulation run (`checkSimulationRun`, `checkRunPatch`)

| Function | Field | Rule |
|---|---|---|
| `checkSimulationRun(body, now)` | (body) | A plain object; only `kind`, `inputs`, `result`, `note` |
| | `kind` | `cycle`, `capacity` or `equipment` |
| | `inputs` | A plain object with exactly the fields of 3.10.1, all present. `mix` passes `checkMix`; `settings` a plain object (not validated here: C7 validates it when it runs); `region` an own key of `ClimateCapacity.DESIGN_DAYS`; `tariff` a finite number 0–10; `volume` as `checkRoom`; `calibration` `null` or an object with exactly the keys `id`, `ua`, `inf_ach`, `moist_buffer`, `co2_per_block` (`id` the applied Calibration's id, a positive integer; the four values within `checkCalibration`'s limits), any other key giving the problem `inputs.calibration.<key>: unknown field`; `empty_below` a finite number 0–100 for `capacity`, `null` for `cycle` and `equipment`; `equipment` `null` or passing `checkEquipmentBody` (7.7), and not `null` for `equipment` |
| | `result`, `kind = 'cycle'` | A plain object. `verdict` `impossible`: exactly the keys `verdict`, `why` (a string). `verdict` `ok`: `totals` an object with `days` an integer 1–1300, `pass` a boolean, `kwh`, `rm`, `rmPerBlock` each a number or `null`; `stages` a non-empty array of objects; `series` an array of length `totals.days × 24` whose element `i` is an object with `h === i`. Anything else in `result` is stored as sent. |
| | `result`, `kind = 'capacity'` | `checkReport` (7.5) |
| | `result`, `kind = 'equipment'` | A plain object. `verdict` `impossible`: exactly the keys `verdict`, `why` (a string). `verdict` `ok`: `ac` an object whose `verdict` is `enough`, `too-small`, `too-big` or `oversized`; `air` an object (C8 11.2) whose `verdict` is `enough`, `too-small`, `not-the-fix` or `oversized` (lead decision 58), `own` and `capS` finite numbers, `needM3h` a number or `null` (`Infinity` arrives as `null` in JSON), `recommended`, `margin` and `purgeS` finite numbers or `null`, `stage` a key of `ClimateController.STAGES`, `text` a non-empty string (revision 9); `runs` a non-empty array of objects; `summary` a non-empty array of strings. Anything else stored as sent. |
| | `note` | Left out, `null`, or a string of at most 200 characters after trimming (stored trimmed; empty → `null`) |
| `checkRunPatch(body, now)` | (body) | A plain object with at least one of `note`, `real_start` and no other field |
| | `note` | `null` or a string of at most 200 characters after trimming |
| | `real_start` | `null` or an integer from 1 to `now` + 366 × 86400 (a planned start may lie ahead) |

| Rule | Detail |
|---|---|
| Schema and API | C1's `CHECK`s accept every kind and verdict of this section; this section is the gate for what is stored (lead decision 52) |

### 7.7 Equipment (`checkEquipmentBody`)

| Field | Rule | Same rule as |
|---|---|---|
| (body) | Not a plain object: the one problem `equipment: must be an object`. Otherwise each of the 7 fields `ac_hp`, `ac_units`, `fog_lph`, `air_m3h`, `walls`, `roof`, `height` must be present (`walls` and `roof` may be `null`): one problem `<field>: missing` per missing field, in that order | – |
| (values) | Then the problems of `ClimateEquipment.checkEquipment(body)` (read from `global.ClimateEquipment` at this call, 7.1), unchanged (they include `<key>: unknown field` for any other field, and `air_m3h: must be a number from 50 to 10000`) | C8 section 4.3 (the real function is already in the prep 2.0 stub of `equipment.js`) |

## 8. Mapping to the browser modules

The capacity and calibration code keeps its camelCase shapes; the web modules convert.

| API (this contract) | capacity.js / calib.js | Rule |
|---|---|---|
| Room `name`, `volume` | `room.name`, `room.volume` | Same values. There is no `room.vent` (C9 8: `room = { name, volume, airM3h?, calib }`). |
| The room's settings `airM3h` (6.4) | `room.airM3h` | Same value: capacity and cycle runs of the Simulate tab pass it (C9 `airOf(room)`; without it every run would use 1800); the Calibrate tab fits with `envBase.airM3h` = it. An equipment check sets `room.airM3h` = its Equipment's `air_m3h` per run instead (C8). |
| The room's Calibration with `applied` = `true` | `room.calib = { ua, infAch, moistBuffer, co2PerBlock, rmse: { T, RH, CO2 }, date }` | `infAch` = `inf_ach`, `moistBuffer` = `moist_buffer`, `co2PerBlock` = `co2_per_block`, `rmse.T` = `rmse_t`, `rmse.RH` = `rmse_rh`, `rmse.CO2` = `rmse_co2`, `date` = `new Date(run_at * 1000).toISOString()`. No applied run: `room.calib = null`. |
| MixRow `{ crop, blocks, co2_per_block }` | mix item `{ crop, blocks, co2PerBlock? }` | `co2PerBlock` = `co2_per_block`; leave it out when `null`. |
| Body of 6.13 | `fitAsync(...)` result and `parseCsv` rows | `ua` = `params.ua`, `inf_ach` = `params.infAch`, `moist_buffer` = `params.moistBuffer`, `co2_per_block` = `params.co2PerBlock`, `rmse_*` = `result.rmse.T / RH / CO2` (`null` when not finite), `log_rows` = `rows.length`. |
| Body of 6.18 | `checkAsync(room, mix, opts)` result | Sent as it is (legacy). |
| `inputs.mix` of 6.21 | `cycle.js` / `capacity.js` / `equipment.js` mix `{ crop, blocks, co2PerBlock? }` | As MixRow (above) |
| `inputs.volume`, `inputs.settings.airM3h`, `inputs.calibration` | `room = { name, volume, airM3h, calib }` | `inputs.calibration` is built from the applied Calibration row: `{ id, ua, inf_ach, moist_buffer, co2_per_block }` (exactly these keys, 7.6), or `null` with no applied run. `calib` = `{ ua, infAch: inf_ach, moistBuffer: moist_buffer, co2PerBlock: co2_per_block, rmse: {}, date }` of that run (above), or `null` |
| `inputs.settings`, `region`, `tariff` | `ClimateCycle.runCycleSteps(room, mix, { settings, region, tariff })` | Cycle |
| `inputs.region`, `tariff`, `empty_below` | `ClimateCapacity.checkSteps(room, mix, { region, tariff, emptyBelow })` | Capacity |
| `inputs.equipment` | `room.plant = ClimateEquipment.plantOf(equipment, room)` (cycle, capacity); `room.equipment` (equipment check) | C5 3.10 |
| `result` of 6.21 | C7 Result, capacity report, C8 Report | Sent as it is |
| Reading (3.2) | `calib.js` log row (`parseCsv` shape) | C5 section 3.11 (`logFromReadings`); the row's `air` is the Reading's `air` (0 or 1, C9 8) |
| Settings | `ClimateController` settings object | Same object; the settings file wrapper is not used by the API. |
| Live `targets`, `status` | `ctl.state.rhT`, `cfg.spT`, `cfg.co2Lim`, `ctl.status(kind)` | Computed on the server (the browser has no controller for a live room). |
### 8.1 Browser-storage import (spec section 4)

For each stored room `r` at position `i` (0-based) of `mushroom-farm.rooms.v1`, after `n = normRoom(r, i)` (rooms
for which it returns `null` are skipped), the Rooms home (C5 3.8; the Capacity module in wave 1) sends, in this order:

| Request | Body field | Value |
|---|---|---|
| `POST /api/rooms` | `name` | `n.name.trim()`, or `Room <i + 1>` when that is empty |
| `POST /api/rooms` | `volume` | `n.volume` (`normRoom` keeps it inside the limits). No `vent` is sent: `normRoom` drops a stored room's `vent` (C9 6.3), and the room gets the default air exchange size (`airM3h` 1800). |
| `PUT /api/rooms/:id/mix` | rows | `n.mix.map(m => ({ crop: m.crop, blocks: m.blocks, co2_per_block: m.co2PerBlock ?? null }))` |
| `POST /api/rooms/:id/calibrations` (only when `n.calib` is not `null`) | `ua`, `inf_ach`, `moist_buffer`, `co2_per_block` | `n.calib.ua`, `.infAch`, `.moistBuffer`, `.co2PerBlock` |
| same | `rmse_t`, `rmse_rh`, `rmse_co2` | `(n.calib.rmse && Number.isFinite(n.calib.rmse.X) && n.calib.rmse.X >= 0) ? n.calib.rmse.X : null` with `X` = `T`, `RH`, `CO2` |
| same | `log_rows` | `null` |
| same | `run_at` | `Math.floor(Date.parse(n.calib.date) / 1000)` when that is an integer from 1 to now + 60; otherwise left out |
| same | `source` | `'import'` (revision 8); `log_from`, `log_to`, `equipment` left out |
| `POST /api/rooms/:id/calibrations/:runId/apply` (only after a calibration) | – | `:runId` = the `id` of the calibration just saved |

| Rule | Detail |
|---|---|
| Reports | Not imported: the import sends no `POST /capacity`. The farmer runs the check again for each room (C5 section 3.7, message `Imported <n> room(s). Run the check again for each room.`). |
| No transaction | Each request stands alone. A failed request leaves the rooms already created; the module stops at the first error. The one-time marker, the button and the partial-failure message are the web module's (C5). |

## 9. Static files

| Path | File | `Content-Type` |
|---|---|---|
| `/` and `/index.html` | `index.html` | `text/html; charset=utf-8` |
| `/styles.css` | `styles.css` | `text/css; charset=utf-8` |
| `/controller.js`, `/sim.js`, `/air.js` (C9), `/runtime.js`, `/capacity.js`, `/calib.js`, `/room-rules.js`, `/cycle.js`, `/equipment.js` | the shared module of that name (`/cycle.js` and `/equipment.js`: revision 8) | `text/javascript; charset=utf-8` |
| `/web/<path>` | the file under `web/` (subfolders allowed) | by extension, below |

| Extension (under `web/`) | `Content-Type` |
|---|---|
| `.js` | `text/javascript; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.html` | `text/html; charset=utf-8` |
| `.json` | `application/json; charset=utf-8` |
| `.svg` | `image/svg+xml` |
| `.png` | `image/png` |
| `.ico` | `image/x-icon` |

| Rule | Detail |
|---|---|
| Methods | `GET` and `HEAD` (`HEAD`: same status and headers, no body). Other methods: 404. |
| Anything else is 404 | Every path not in the first table is 404: `server/`, `data/` (the database), `docs/`, `tests/`, `tools/`, `.git/`, `package.json`, `farm.config.json`, `README.md`, an extension not in the list. |
| No directory listing | A path that names a folder (for example `/web/` or `/web`) is 404; only `/` maps to `index.html`. |
| Path safety | The path is URL-decoded once; a path that fails to decode, has a NUL, a `\`, a `..` segment, or a segment starting with `.` is 404. The resolved file must lie inside `root/web/` (for `/web/...`). |
| Query string | Ignored (`/sim.js?v=2` is `/sim.js`). |
| 200 reply | The file bytes; `Content-Type` from the tables; `Content-Length`; `Cache-Control: no-cache` (the browser checks again, so a restarted server's new files are used). |
| 404 reply | `text/plain; charset=utf-8`, body `Not found`. |
| `/api/...` | Never served as a file; an unknown API path is the JSON 404 `Unknown route`. |
| Fake API server | `tests/fakes/api-server.js` (C5 4.5) serves the same shared modules. On `master` its list lacks `/air.js`, `/cycle.js` and `/equipment.js`; the lead adds all three in prep 2.0, tested in `tests/fake-api-server.test.js` (200, `text/javascript; charset=utf-8`, the file bytes). |

## 10. Stream (C4)

### 10.1 Connection

| Item | Value |
|---|---|
| Route | `GET /api/stream`, no query. One connection carries every room. |
| Reply status | 200 |
| Headers | `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store`, `Connection: keep-alive` |
| First bytes | `retry: 3000\n\n` at once (it also sends the headers). |
| Messages | `event: <name>\ndata: <JSON on one line>\n\n`. No `id:` lines: the server keeps no history, and a reconnecting client reloads from the API instead (10.4). |
| Heartbeat | The comment line `: ping\n\n` every 15 s (`heartbeatMs`) on every open connection (one shared timer), so proxies and phones keep the connection and a client can find a dead one. The client's watchdog is C5's (lead decision 4; C5 section 4.4): no event and no `: ping` for 45 s, and the client closes the connection and reconnects. |
| Order | Messages of one room are sent in the order the room manager emits them. |
| Slow client | If a connection's unsent data (`res.writableLength`) passes 1 MB, the server ends that connection; the client reconnects and reloads (10.4). |
| Client gone | On the response's `close` (`res.on('close')`), the server removes the connection (lead decision 10). |
| Shutdown | `api.close()` ends every connection. |

### 10.2 Events

The room manager (C2 section 7) emits `reading`, `event`, `alarm`, `settings` and `room`; the API takes the `data` from
each payload as below and sends it to every open connection. One C2 emit gives exactly one message; the API only relays
and derives no events of its own (lead decision 2). The `data` column is the browser's contract. C2's `fatal` is not
sent (section 4.2). Simulation runs (6.21–6.24) and equipment saves (6.26) send no event of their own (lead decision 18): the tab that
changed them reloads its own data. A 6.26 save that changes the settings' `airM3h` calls C2 `applySettings`, which emits what any settings save emits (`settings`, `event`, and `room` when the summary changed).

| Event | Sent when | `data` | From the C2 payload |
|---|---|---|---|
| `reading` | A room loop records a new reading (every sensor period, 30 s by default) | Reading (section 3.2), a raw row, as stored | `payload.live.reading`, unchanged |
| `event` | A room's controller or the room manager writes an event | Event (section 3.3), as stored (with its `id`) | `payload.event` |
| `alarm` | An alarm is raised, cleared or acknowledged | Alarm (section 3.4), the row after the change | `payload.alarm` |
| `settings` | A new settings version is stored (room creation, 6.5, 6.7, 6.26 when the air exchange size changed, an automatic version) | `{ id, room_id, saved_at, note, settings }`: the SettingsVersion with the stored Settings | `{ ...payload.version, room_id: payload.roomId, settings: payload.settings }` |
| `room` | C2 emits `room` (C2 is the only owner of this event; lead decision 2, C2 section 7): after create, update, archive, restart and a crash (lifecycle), and at the end of a tick, of `applySettings` and of `ackAlarm` when the room's `stage`, `crop`, `alarms`, `running` or `error` changed (live summary). `live.targets`, `live.status` and `live.reading` in it are current when it is sent; a change of only those does not send `room` (new values reach the page with the next `room`, with `reading` events for `live.reading`, or with `GET /api/rooms`). | Room (section 3.1) with `live`; after an archive, `archived_at` is set, `live` is `null`, and the client drops the room | `payload.room`, unchanged |

```
retry: 3000

event: reading
data: {"room_id":1,"t":1791450030,"T":18.3,"RH":88.1,"CO2":820,"t_out":31.4,"rh_out":62,"ac_mode":"cool","ac_setpoint":17.5,"fog":1,"air":0,"lights":1,"circ":0,"power_w":1425,"kwh":12.85,"ac_fan":"auto","stage":"fruiting","core":27.4}

event: alarm
data: {"id":88,"room_id":1,"alarm_key":"rhHi","level":"warning","label":"High humidity","raised_at":1791450012,"cleared_at":null,"acked_at":null}

: ping

```

### 10.3 Client rules

| Rule | Detail |
|---|---|
| Client code | `web/api.js` `stream(onEvent)`, as C5 section 4.4 defines it (fetch and a stream reader, its own reconnect using `retry:`, and the 45 s heartbeat watchdog of lead decision 4). This contract does not define it again; the reload after a reconnect is section 10.4. |
| Open first, then load | The page opens the stream, and on its first `open` loads what it shows from the API (`GET /api/rooms`, and on a room page its readings, events, alarms and settings). Events that arrive while loading are merged, so nothing between the two is lost. |
| Merge | Readings by (`room_id`, `t`): a reading with a `t` the page already has replaces it. Events by `id`, alarms by `id`, rooms by `id`. |

### 10.4 Reconnect rule

After every reconnect (each `open` with `reconnect: true`, C5 4.4), the page reloads what it may have missed:

| What the page shows | Reload |
|---|---|
| Room cards (Rooms list) | `GET /api/rooms` |
| Live readings and charts of a room | `GET /api/rooms/:id/readings?from=<from>&to=<now>` with `from` = max(last `t` the page holds + 1, now − 3600): the last minutes, at most 60. A chart range longer than 1 h reloads its whole range with its `step`. Missing readings stay a gap (the server does not invent readings). |
| Room header and live values | `GET /api/rooms` (the row with this id) |
| Event log | `GET /api/rooms/:id/events` (first page) |
| Alarms | `GET /api/rooms/:id/alarms` |
| Settings and versions | `GET /api/rooms/:id/settings` and `/settings/history`; when the settings changed and the editor has unsaved changes, the page says so before a save. |

## 11. Calls the API makes to C1 and C2

The API stream builds against the fakes of C1 (`tests/fakes/db.js`) and C2 (`tests/fakes/rooms.js`). These are the only
calls it makes. `id` is the room id from the path; every route that has one first calls the room check.

| Route or part | Calls, in order | Notes |
|---|---|---|
| Room check (every `/api/rooms/:id/...` route) | C1 `db.getRoom(id)` | `NotFoundError` or `archived_at` not `null` → 404 `Unknown room` |
| 6.1 | C2 `rooms.list()` | |
| 6.2 | C2 `rooms.create({ name, volume, settings })` | Reply: its `room` |
| 6.3 | C2 `rooms.update(id, changes)` (when there are changes), then C2 `rooms.archive(id)` (when `archived`) | |
| 6.4 | C1 `db.currentSettings(id)` | Reply: its `settings` |
| 6.5 | C2 `rooms.applySettings(id, body.settings, note)`, always three arguments: `note` = the trimmed string, or `undefined` (when `null`, left out or empty after trimming) | Reply: its `{ settings, warnings }`. The fake's `calls[i].args` is `[id, body.settings, note]` (`args.length === 3`, even when `note` is `undefined`). |
| 6.6 | C1 `db.settingsHistory(id)` | `room_id` added |
| 6.7 | C1 `db.getSettingsVersion(id, versionId)`, then C2 `rooms.applySettings(id, v.settings, 'Restored version <versionId>', { exact: true })` | |
| 6.8 | C1 `db.queryReadings(id, { from, to, step: step \|\| null })` | Rows sent unchanged (section 3.2) |
| 6.9 | C1 `db.listEvents(id, { limit, before: before ?? null })` | `limit` defaulted to 100 by the API; `before` is `null` when the query has none, never `undefined` (C1 section 6.7) |
| 6.10 | C1 `db.listAlarms(id, { recent: 20 })` | |
| 6.11 | C2 `rooms.ackAlarm(id, alarmKey)` | |
| 6.12 | C1 `db.listCalibrations(id)`, C1 `db.currentCalibration(id)` | `applied` computed |
| 6.13 | C1 `db.saveCalibration(id, body)` | |
| 6.14 | C1 `db.applyCalibration(id, runId)`, then C2 `rooms.restart(id)` | |
| 6.15 | C1 `db.getMix(id)` | |
| 6.16 | C1 `db.replaceMix(id, rows)` | |
| 6.17 | C1 `db.latestCapacityReport(id)` | `null` → 404 `No capacity report` |
| 6.18 | C1 `db.saveCapacityReport(id, { report })` | |
| 6.19 | C2 `rooms.restart(id)` | |
| 6.20 | C1 `db.listSimulationRuns(id, { limit, before: before ?? null })` | `limit` defaulted to 50 |
| 6.21 | C1 `db.saveSimulationRun(id, { kind, inputs, result, note })` | `note` trimmed, `null` when empty or left out |
| 6.22 | C1 `db.getSimulationRun(id, runId)` | |
| 6.23 | C1 `db.updateSimulationRun(id, runId, changes)` | `note` trimmed, empty → `null` |
| 6.24 | C1 `db.deleteSimulationRun(id, runId)` | |
| 6.25 | C1 `db.getEquipment(id)` | |
| 6.26 | C1 `db.saveEquipment(id, body)`, then C1 `db.currentSettings(id)`, then, only when its `settings.airM3h !== body.air_m3h`, C2 `rooms.applySettings(id, { airM3h: body.air_m3h }, 'Air exchange size from Your machines')` | Reply: the Equipment from `saveEquipment`. The fake's `calls[i].args` is `[id, { airM3h: body.air_m3h }, 'Air exchange size from Your machines']` (`args.length === 3`) |
| `createApi` | C2 `rooms.on(name, listener)` for `reading`, `event`, `alarm`, `settings`, `room` | |
| `close()` | C2 `rooms.off(name, listener)` for each listener | |

The API never writes settings, alarms, rooms or the running loop through C1 directly: those writes go through C2.
C1 writes the API makes itself: `saveCalibration`, `applyCalibration`, `replaceMix`, `saveCapacityReport`, `saveSimulationRun`, `updateSimulationRun`, `deleteSimulationRun`, `saveEquipment`.

## 12. Tests that prove this contract

| File | Proves |
|---|---|
| `tests/api.test.js` | For every route of section 5, against a real HTTP server on a random port with the C1 and C2 fakes only (the real modules are covered by the wave 1.5 gate and by the lead's `tests/api-real.test.js` in wave 3, section 12.2; this file needs no switch to the real modules): the success status and reply shape; each 400 of the route's table, with nothing stored and no C2 call made; 404 for an unknown room, an archived room and an unknown sub-id; `Unknown route` for a wrong method; the C2 calls of section 11 (the fake's `calls`), including `restart` after a calibration apply and `applySettings` with the `Restored version <n>` note and `{ exact: true }` (and for 6.5 exactly three arguments: `args.length === 3`, `args[2]` the trimmed note, or `undefined` for a body with no note, `null` or `"  "`); `PUT /settings` with `{ "settings": { "spT": 20 } }` stores (and `GET /settings` then gives) the room's previous version with only `spT` changed (6.5, missing settings keep their value); `POST /api/rooms` with `volume` 200 and `settings: { crop: 'pink' }` stores (and `GET /settings` then gives) the defaults with `crop` = `pink` and `roomM3` = 200, and with `settings: { crop: 'pink', roomM3: 90 }` stores `roomM3` = 90 (6.2, C2 section 9.4); each row of the error mapping (4.1), using a fake that throws (a C2 `create` `bad_input` gives 400 `Invalid room`); `onFatal` called after a 500 for a non-constraint node:sqlite error and not for a constraint error (both rules of the next table); a body `{"__proto__":{"polluted":1}, ...}` on `PUT /settings` and `POST /api/rooms` leaves `({}).polluted` `undefined` and adds no key to `Object.prototype`; `/alarms/sensor_RH/ack` and an encoded key; a Reading from `/readings` equal to the C1 row (`T`, `RH`, `CO2`, `room_id`, no other keys); the static file rules of section 9 (`/` gives `index.html`, `/web/` is 404, `/data/farm.db` is 404, `..` is 404). Also `server/main.js` with stub modules (`describe('server/main.js')`, section 12.1). |
| `tests/stream.test.js` | Unchanged in revisions 8 and 9 (it relays the Reading as given). The stream sends `retry: 3000` first, then `reading`, `alarm`, `event`, `settings` and `room` events emitted by the fake room manager (`emit`), with the data and mapping of section 10.2; exactly one message per C2 emit (a `room` payload is sent unchanged, and a `reading` emit is never followed by a `room` the fake did not emit); the heartbeat comment (with a short `heartbeatMs` in the test); a closed client is removed; `close()` ends the connections and removes the C2 listeners. |
| `tests/api.test.js`, revisions 8 and 9 | 6.20–6.26: success status and shape (6.21 and 6.23 reply without `result`, 6.22 with it); each 400 of 7.6 and 7.7 with nothing stored; a 7 MB body is accepted on 6.21 and a 9 MB body gives `Body is larger than 8 MB`; a 2 MB body on 6.23 gives `Body is larger than 1 MB`; 404 `Unknown simulation run` for an unknown id and for another room's run; `DELETE` on another path gives `Unknown route`; 6.21 accepts a `kind: 'equipment'` run with a hand-made Report; 6.25 `null` then the saved row; 6.26 stores the row; 6.26 with an `air_m3h` that differs from the stored settings' `airM3h` (900 against the default 1800) makes exactly one C2 call `applySettings(id, { airM3h: 900 }, 'Air exchange size from Your machines')` (`args.length === 3`), replies the Equipment, and `GET /settings` then gives `airM3h` 900; 6.26 again with the same `air_m3h` makes no `applySettings` call; 6.26 with `fan_m3h` in place of `air_m3h` gives 400 `Invalid equipment` (`air_m3h: missing`, `fan_m3h: unknown field`) with nothing stored; 6.8 accepts `step=3600` over 400 days and rejects `step=600` over 40 days; 6.13 with `source: 'history'` and no `log_from` gives 400, with a valid `equipment` stores it; a Reading from `/readings` has the 18 keys of 3.2 in that order, with `air` and no `fan`; a Room has no `vent`, and `POST /api/rooms` or `PATCH /api/rooms/:id` with a `vent` gives 400 `Invalid room` (`vent: unknown field`) with no C2 call; a Room's `live` has `flush` and `blocks`; `/air.js`, `/cycle.js` and `/equipment.js` are served |
| `tests/config.test.js` | `server/config.js` alone (no db, no room manager, no network; section 2.2). `readConfig`: an environment variable wins over `farm.config.json`, which wins over the defaults, for each of `port`, `db`, `host`; a present but empty `FARM_HOST` is a bad configuration; the defaults (8080, `<root>/data/farm.db`, `host` `null`); a relative `db` resolved from `root`; `fileText` `null` uses the defaults; each `Bad configuration: …` reason of 2.2 throws (bad JSON, not an object, unknown field, port `0`, `65536`, `8080.5`, `"80a"`, empty `db`). `pickHosts` with hand-made interface objects: skips internal, IPv6 and public addresses and every skipped name prefix (`docker0` 172.17.0.1, `br-1a2b`, `veth…`, `virbr0` 192.168.122.1, `vmnet1`, `tun0`, `tap0`, `lo`, `zt…`); keeps `enp3s0`, `eth0`, `wlan0`, `wlp2s0` in sorted name order; gives `[]` when nothing is left. |
| `tests/room-rules.test.js` | Requires `../sim.js`, `../air.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../capacity.js`, `../cycle.js`, `../equipment.js`, then `../room-rules.js` (section 7.1). In a child process, requiring `../sim.js`, `../air.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../capacity.js`, then `../room-rules.js` (no `cycle.js`, no `equipment.js`) does not throw (7.1). `checkRoom`, `checkMix`, `checkCalibration`, `checkReport` accept the limits and reject each broken rule (including a fractional `utilisation`); `normRoom` and `validCalib` behave as today's `app.js` (`normRoom` gives no `vent`); `checkRoom` gives `vent: unknown field` for a `vent`; `ALARM_KEYS` includes `airTooSmall`. Revision 8: `checkSimulationRun` accepts a passing, failing and impossible cycle, a capacity report and an equipment Report, rejects each rule of 7.6 (a `series` of the wrong length, `inputs.equipment: null` for kind `equipment`, `result.ac.verdict: 'pass'`, an `inputs.vent`, an `inputs.calibration` with an extra key such as `rmse_t`: `inputs.calibration.rmse_t: unknown field`); `checkRunPatch`; extended `checkCalibration`; `checkEquipmentBody`: a valid body `[]`, a missing field, an extra field (`fan_m3h: unknown field`), `air_m3h` 40 and 10001 (`air_m3h: must be a number from 50 to 10000`) against 50 and 10000 accepted, and every `checkEquipment` problem. An equipment result whose `air.verdict` is `fine` (not in the list), or whose `air` is missing, gives a problem (400 through 6.21; revision 9). |

| Rule for the API tests | Detail |
|---|---|
| What they check against the fakes | Only the C2 calls in the fake's `calls`, the db rows and events the fakes write, and the emits the fake makes (C2 section 16). Texts only the real manager writes (`Started`, `Stopped`, `Resumed after <N> min stopped`, `Stopped by an error: …`, controller events, readings, alarm raises and clears) are C2's and are tested in `tests/rooms.test.js`; the "Effects" rows of section 6 that name them describe the real system, not the fake. |
| A constraint error | The API validates first, so a route cannot make one: the test replaces one fake function with one that throws `Object.assign(new Error('CHECK constraint failed'), { code: 'ERR_SQLITE_ERROR', errcode: 275 })` (the shape the fake db itself throws, C1 section 9.2). Expected: 500, no `onFatal`. |
| A fatal db error | The fake cannot make one (C1 section 9.2): the test replaces one fake function with one that throws `Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 })`. Expected: 500, then `onFatal(err)` once. |

### 12.1 `server/main.js` tests (wave 1, `tests/api.test.js`, `describe('server/main.js')`)

`server/db.js` and `server/rooms.js` do not exist in the API stream's worktree, so the test runs a copy of `main.js`
next to stub modules built on the fakes, in a child process (`spawn(process.execPath, ['-r', <tmp>/preload-os.js,
<tmp>/server/main.js], { env })`), and reads its stdout, stderr and exit code. The layout rules of section 2.2 (File
layout) make this work. A free port comes from listening on port 0 on `127.0.0.1`, reading the port and closing. Every
child gets a 10 s timeout.

| File in the temporary folder `tmp` | Content |
|---|---|
| `tmp/server/main.js`, `tmp/server/config.js` | Copies of the worktree's files |
| `tmp/server/api.js` | Wraps the real `createApi` (absolute `require` of the worktree's `server/api.js`); its `close` prints `stub: api.close` first |
| `tmp/server/db.js` | `openDb(p)` prints `stub: openDb <p>`; throws `Error('stub cannot open')` when `STUB_DB_THROW` is set; otherwise returns `openFakeDb()` (absolute `require` of the worktree's `tests/fakes/db.js`) with `close` wrapped to print `stub: db.close` |
| `tmp/server/rooms.js` | `createRoomManager({ db })` returns `createFakeRoomManager({ db })` (the worktree's `tests/fakes/rooms.js`) with `stop` printing `stub: rooms.stop` and `start` printing `stub: rooms.start`, then: with `STUB_START_THROW=sqlite` it throws `Object.assign(new Error('stub disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 })`; with `STUB_START_THROW=plain` it throws `new Error('stub start failed')`; with `STUB_FATAL_MS=<n>` it emits `fatal` with `{ error: Object.assign(new Error('stub disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 }) }` after `n` ms |
| `tmp/preload-os.js` | Replaces `require('node:os').networkInterfaces` with a function that returns `JSON.parse(process.env.STUB_IFACES)` |
| `tmp/index.html` | A short known text |

| Test | Expected |
|---|---|
| `FARM_PORT=abc` (the other bad values are `tests/config.test.js`'s) | Exit 1; stderr starts with `Bad configuration:` |
| `tmp/farm.config.json` = `{bad` | Exit 1; stderr starts with `Bad configuration:` |
| `tmp/farm.config.json` = `{ "port": 1 }` and `FARM_PORT=<free port>`, `FARM_HOST=127.0.0.1` | Listens on the free port (the environment wins) |
| No `FARM_HOST`; `STUB_IFACES`: `lo` 127.0.0.1 (internal) and `eth0` 203.0.113.5 | Exit 1; stderr has `No farm network address found; set FARM_HOST (for example 127.0.0.1).` |
| No `FARM_HOST`; `STUB_IFACES`: `wlan0` 192.168.254.253 and `eth0` 10.254.253.252 (both not internal; addresses the test machine does not have) | stdout has `Farm network addresses: 10.254.253.252 (eth0), 192.168.254.253 (wlan0)`; the listen fails, so: exit 1, stderr has `Cannot listen on 10.254.253.252:<port>:`, and stdout has `stub: api.close`, `stub: rooms.stop`, `stub: db.close` in that order |
| Normal start: `FARM_HOST=127.0.0.1`, `FARM_PORT=<free>`, `FARM_DB=x/y.db` | stdout has `stub: openDb <tmp>/x/y.db`, then `stub: rooms.start`, then `Open http://127.0.0.1:<port>`, with nothing after the port on that line; `GET /api/rooms` gives 200 `[]`; `GET /` gives `tmp/index.html` |
| Default db path | Without `FARM_DB`: `stub: openDb <tmp>/data/farm.db` |
| `SIGTERM`, and separately `SIGINT`, after a normal start | Exit 0; stdout has `stub: api.close`, `stub: rooms.stop`, `stub: db.close` in that order |
| `STUB_DB_THROW=1` | Exit 1; stderr has `Cannot open the database: stub cannot open` |
| `STUB_START_THROW=sqlite` | Exit 1; stdout has `stub: db.close`; stderr has `Database error: stub disk I/O error` and no `Cannot start the rooms` |
| `STUB_START_THROW=plain` | Exit 1; stdout has `stub: db.close`; stderr has `Cannot start the rooms: stub start failed` followed by the stack (a line starting with `    at `), and no `Database error` |
| `STUB_FATAL_MS=100` after a normal start | Exit 1; stderr has `Database error: stub disk I/O error`; stdout has no `stub: rooms.stop` |

### 12.2 The real modules: wave 1.5 gate and wave 3

The stub test of 12.1 cannot prove that `main.js` works with the real `server/db.js` and `server/rooms.js`, and
`tests/api.test.js` runs only against the fakes. The lead's gate checks the real server once on the merged wave 1 code
(section 2.3); in wave 3 the lead's `tests/api-real.test.js` runs the routes against the real modules.

| Gate | Who and when | Steps | Passes when |
|---|---|---|---|
| Wave 1.5 | The lead, after the four wave 1 streams are merged into `master` and the full test suite passes, before the wave 2 streams branch (C5 section 7.10 relies on it). Gate 2.5 (wave 2 plan) runs the same steps after merging Data 2, Equipment and Server 2, with `FARM_DB` = a copy of a version 1 database file, and also checks that upgrades 2 (C9) and 3 ran (the file's `schema_version` has rows 2 and 3, `db.version` = 3) and that `Room 1`'s new readings carry `air` (0 or 1), `ac_fan`, `stage` and `core` | `FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=<new temporary file> npm start`; wait for the start-up line; `GET /api/rooms` until `Room 1` has a reading; then `SIGINT` | The server prints `Open http://127.0.0.1:<port>` and no `ExperimentalWarning`; `GET /api/rooms` gives `Room 1` with `live.reading` not `null` within 35 s; `GET /` gives `index.html`; after `SIGINT` the process exits with code 0. A failure is fixed on `master` before wave 2 starts. |
| Wave 3, real modules | The lead writes and runs `tests/api-real.test.js` on the final merge | Below | Every row of the next table passes |
| Wave 3, everything again | The lead, on the final merge | Every test of section 12 (against the fakes, as written), `tests/api-real.test.js`, the gate above, and every headless Chrome check of C5 section 7.10 again | All pass |

| `tests/api-real.test.js` | Rule |
|---|---|
| Set-up | `db = openDb(<new temporary file>)`, `rooms = createRoomManager({ db, tickMs: 0 })`, `rooms.start()` (creates the demo room `Room 1`), `api = createApi({ db, rooms, root, onFatal })`, a real HTTP server on `127.0.0.1` and a free port. After the tests: `api.close()`, server close, `rooms.stop()`, `db.close()`, delete the file. No env switch: it is its own file and never replaces the fakes in `tests/api.test.js`. |
| Checks | For every route of section 5 (6.20–6.26 included; a real default cycle is too slow for a test, so 6.21 posts a small hand-made Result that passes `checkSimulationRun`): the success status and reply shape (the fields and types of section 3); one 400 for each route that takes a body or query; 404 for an unknown room, an archived room and an unknown sub-id; `PUT /settings` with `{ "settings": { "spT": 20 } }` changes only `spT`; `POST /api/rooms` with `volume` 200 and `settings: { crop: 'pink' }` stores `roomM3` = 200; `PUT /equipment` with an `air_m3h` other than the room's settings `airM3h` makes `GET /settings` give that `airM3h` (6.26); `GET /api/stream` sends `retry: 3000`, then a `settings` event after a `PUT /settings`. |
| Not checked (only the fakes have them) | The fake's `calls`, `setLive` and `emit`; the exact number or order of emits; event texts (C2's, tested in `tests/rooms.test.js`); readings, alarm raises and clears; the error mapping and `onFatal` tests that replace a fake function (4.1, 4.2); the `server/main.js` stub tests (12.1). |

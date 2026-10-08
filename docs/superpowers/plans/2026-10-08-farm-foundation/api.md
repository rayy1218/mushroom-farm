# Work brief: Wave 1, API stream

Date: 2026-10-08. Repo: `/home/foqcus/Documents/mushroom-farm`. You work alone in your own git worktree, made from the wave 0 commit. In this brief, `<base>` means that commit (`git merge-base HEAD master`). The contracts in `docs/contracts/` are frozen. Where this brief and a contract disagree, the contract wins: stop and report it to the lead.

## 1. Goal

Build the farm app's HTTP server against contracts C3 and C4, using the wave 0 fakes in place of the real database and room manager.

| Part | File | Result |
|---|---|---|
| HTTP API | `server/api.js` | The 19 C3 routes, the error bodies, the C1 and C2 error mapping, and the database-error stop rule (C3 sections 4-6, 11) |
| Live feed | `server/api.js` | `GET /api/stream`, Server-Sent Events (C3 section 10, contract C4) |
| Static files | `server/static.js` | C3 section 9, with path safety |
| Configuration | `server/config.js` | `readConfig` and `pickHosts`, pure functions (C3 sections 2.1, 2.2) |
| Start-up | `server/main.js` | Thin wiring of the real `openDb` and `createRoomManager`: start-up order, start-up line, shutdown, `fatal` (C3 section 2.2) |
| Shared rules | `room-rules.js` | `ClimateRoomRules` (C3 section 7): today's `normRoom` and `validCalib`, plus the `check*` functions |

`server/db.js` and `server/rooms.js` do not exist in your worktree. You test `server/main.js` with stub modules (task 12). The lead runs it with the real modules in the wave 1.5 gate (C3 section 12.2).

## 2. Owned files (the only files you may create or change)

| File | At start | What you do |
|---|---|---|
| `server/api.js` | missing | Create |
| `server/static.js` | missing | Create |
| `server/config.js` | missing | Create |
| `server/main.js` | missing | Create |
| `room-rules.js` | wave 0 stub (C5 section 1.5) | Replace the whole file |
| `tests/room-rules.test.js` | missing | Create |
| `tests/config.test.js` | missing | Create |
| `tests/api.test.js` | missing | Create (routes, static files, and `describe('server/main.js')`) |
| `tests/stream.test.js` | missing | Create |

Every other file is read-only for you, including `package.json`, `docs/**`, `tests/fakes/**`, `server/db-common.js`, `server/rooms-common.js`, the shared modules (`controller.js`, `sim.js`, `runtime.js`, `capacity.js`, `calib.js`), `app.js`, `index.html`, `styles.css`, `web/**`, `tests/vectors/**` and every other test.

## 3. Read first

| Document | Sections | Why |
|---|---|---|
| `docs/contracts/api.md` (C3, C4) | All | **Your contract.** Routes, resources, errors, check order, static rules, stream, `main.js`, tests. |
| `docs/contracts/db.md` (C1) | 1, 5.1, 6.1, 6.2, 6.4-6.12, 9 | The db functions you call, `NotFoundError`, the node:sqlite error shape, the fake `openFakeDb` |
| `docs/contracts/rooms.md` (C2) | 4, 5.1, 5.2, 6.1-6.3, 7, 11, 16 | The manager methods you call, `RoomError`, the event payloads, the fake `createFakeRoomManager` |
| `docs/contracts/web.md` (C5) | 1.3, 1.5, 4.4 | Browser load order of `room-rules.js`, the stub you replace, the client that reads your stream |
| `LEAD-DECISIONS.md` | 1-7 | Binding: one Reading key set (1), C2 owns `room` (2), fake errcodes (3), watchdog is C5's (4), restart route (5), untrusted settings go through C2 (6), fakes and common files (7) |
| `app.js` | lines 1074-1093 | Today's `LIM`, `hasCrop`, `inRange`, `normRoom`, `validCalib`, which you move |
| `capacity.js` | first and last lines | The module wrapper to copy |
| `calib.js` | `PARAMS` (line 36) | The limits of `validCalib` and `checkCalibration` |

## 4. Contracts you build against

### 4.1 What you export

| Module | Export | Contract |
|---|---|---|
| `server/api.js` | `createApi(opts) → { handle, close }` | C3 2.1. `opts`: `db`, `rooms`, `root`, `now?` (default `() => Math.floor(Date.now() / 1000)`), `heartbeatMs?` (default 15000), `onFatal?` (default no-op). Subscribes to the 5 C2 events at creation. |
| `server/api.js` | `handle(req, res)` | Order: API routes (path starts with `/api/`; `/api/stream` is one of them), then static files. Never throws; a fault becomes a 500. After the 500 for a database error, calls `onFatal(err)`. |
| `server/api.js` | `close()` | Ends every stream connection, clears the heartbeat timer, calls `rooms.off` for every listener. A second call does nothing. |
| `server/static.js` | `serveStatic(req, res, root) → boolean` | C3 9. `true` when it answered (a file or the static 404); `false` for a path under `/api/`, writing nothing. |
| `server/config.js` | `readConfig(env, fileText, root) → { port, db, host }` | C3 2.1, 2.2. Throws `Error('Bad configuration: <reason>')`. Pure. |
| `server/config.js` | `pickHosts(interfaces) → { name, address }[]` | C3 2.2 Listen address. Pure. |
| `server/main.js` | none | C3 2.2 |
| `room-rules.js` | global `ClimateRoomRules` | C3 7.1: exactly `LIM`, `VERDICTS`, `ALARM_KEYS`, `hasCrop`, `validCalib`, `normRoom`, `checkRoom`, `checkMix`, `checkCalibration`, `checkReport` |

| Module | May require | Never requires |
|---|---|---|
| `server/api.js` | Node built-ins, `./static.js`, `./db-common.js`, `./rooms-common.js`, `../sim.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../room-rules.js` (in that order) | `./db.js`, `./rooms.js`, anything under `tests/` |
| `server/static.js` | Node built-ins | everything else |
| `server/config.js` | `node:path` | everything else |
| `server/main.js` | Node built-ins, `./db.js`, `./rooms.js`, `./api.js`, `./config.js` (relative paths) | everything else |

### 4.2 What you use (wave 0, written by the lead)

| Module | Export | Use |
|---|---|---|
| `tests/fakes/db.js` | `openFakeDb({ now })` | The C1 db in every test |
| `tests/fakes/rooms.js` | `createFakeRoomManager({ db, now })` | The C2 manager in every test. `calls` is `{ method, args }[]`; `setLive(id, partial)` and `emit(name, payload)` are test helpers. It writes through the db it is given. |
| `server/db-common.js` | `NotFoundError` | Recognise it by `err.code === 'NOT_FOUND'` and `err.what` (`room`, `settings`, `calibration`) |
| `server/rooms-common.js` | `RoomError` | Recognise it by `err.name === 'RoomError'`, `err.code` (`bad_input`, `not_found`), `err.details`. Tests use the class to make the fake throw. |

### 4.3 Calls the API makes (C3 section 11, exact)

| Route | Calls, in order | Exact arguments and reply |
|---|---|---|
| Room check (every `/api/rooms/:id/…`) | `db.getRoom(id)` | `NotFoundError` or `archived_at !== null` → 404 `Unknown room` |
| 6.1 `GET /api/rooms` | `rooms.list()` | Reply as returned |
| 6.2 `POST /api/rooms` | `rooms.create({ name, volume, vent, settings })` | Values as sent (`settings` is `undefined` when not sent). Reply 201: its `.room` |
| 6.3 `PATCH /api/rooms/:id` | `rooms.update(id, changes)`, then `rooms.archive(id)` | `changes` = only the present keys of `name`, `volume`, `vent`; `update` only when `changes` has a key; `archive` only when `archived === true`. Reply: the last call's Room |
| 6.4 | `db.currentSettings(id)` | Reply: `.settings` |
| 6.5 | `rooms.applySettings(id, body.settings, note)` | Always 3 arguments. `note` = `body.note.trim()`, or `undefined` when `body.note` is `null`, left out, or empty after trimming. Reply: `{ settings, warnings }` (no `version`) |
| 6.6 | `db.settingsHistory(id)` | Each row → `{ id, room_id: id, saved_at, note }` |
| 6.7 | `db.getSettingsVersion(id, versionId)`, then `rooms.applySettings(id, v.settings, 'Restored version <versionId>', { exact: true })` | Reply: `{ settings, warnings }` |
| 6.8 | `db.queryReadings(id, { from, to, step: step \|\| null })` | Rows sent unchanged (C1 Reading, lead decision 1) |
| 6.9 | `db.listEvents(id, { limit, before: before ?? null })` | `limit` default 100 |
| 6.10 | `db.listAlarms(id, { recent: 20 })` | – |
| 6.11 | `rooms.ackAlarm(id, alarmKey)` | `alarmKey` = `decodeURIComponent(segment)` |
| 6.12 | `db.listCalibrations(id)`, `db.currentCalibration(id)` | Each run gets `applied` = `current !== null && run.id === current.id` |
| 6.13 | `db.saveCalibration(id, body)` | `body` as validated; no `run_at` added. Reply 201 with `applied: false` |
| 6.14 | `db.applyCalibration(id, runId)`, then `rooms.restart(id)` | Reply: `{ ...run, applied: true }` |
| 6.15 | `db.getMix(id)` | – |
| 6.16 | `db.replaceMix(id, body)` | Reply: its return value |
| 6.17 | `db.latestCapacityReport(id)` | `null` → 404 `No capacity report` |
| 6.18 | `db.saveCapacityReport(id, { report: body })` | Reply 201 |
| 6.19 | `rooms.restart(id)` | – |
| `createApi` | `rooms.on(name, fn)` for `reading`, `event`, `alarm`, `settings`, `room` | Never `fatal` (`main.js` listens to it) |
| `close()` | `rooms.off(name, fn)` with the same 5 pairs | – |

The API never writes settings, alarms, rooms or loop state through C1. Its only C1 writes are `saveCalibration`, `applyCalibration`, `replaceMix` and `saveCapacityReport`.

### 4.4 Error mapping (C3 4.1, 4.2)

| Error | Route | Reply |
|---|---|---|
| `NotFoundError`, `what: 'room'` | any | 404 `Unknown room` |
| `NotFoundError`, `what: 'settings'` | 6.7 | 404 `Unknown settings version` |
| `NotFoundError`, `what: 'calibration'` | 6.14 | 404 `Unknown calibration run` |
| `RoomError` `bad_input` | 6.2, 6.3 | 400 `Invalid room`, `details` = `err.details` |
| `RoomError` `bad_input` | 6.5, 6.7 | 400 `Invalid settings`, `details` = `err.details` |
| `RoomError` `not_found` or `bad_input` | 6.11 | 404 `Unknown alarm` |
| `RoomError` `not_found` | 6.3, 6.5, 6.7, 6.14, 6.19 | 404 `Unknown room` |
| `RoomError` `bad_input` | 6.14, 6.19 (`restart`, archived) | 404 `Unknown room` |
| Anything else (`RangeError`, node:sqlite error, a bug, a thrown non-Error) | any | 500 `Server fault`, `details` = `[String(err && err.message \|\| err)]`; printed with `console.error(err)` |
| node:sqlite error with `(err.errcode & 0xff) !== 19` (`err.code === 'ERR_SQLITE_ERROR'`) | any | The 500 above, then `onFatal(err)` once, after the reply is sent |

### 4.5 Rules this brief fixes (the contracts leave the detail open)

| Topic | Rule |
|---|---|
| Path | `path` = `req.url` up to the first `?`; query = `new URLSearchParams(rest)`. Do **not** use `new URL(...).pathname`: it turns `/web/%2e%2e/x` into `/x`. |
| API route matching | Split `path` on `/`. Every segment must be non-empty (`/api/rooms/` is `Unknown route`). A route matches on method and segment count; literal segments must be equal; `:id`, `:versionId`, `:runId`, `:alarmKey` match any non-empty text. Validity is checked afterwards, in the C3 4 check order: route, room, other path ids, body size and JSON, query and body rules, then the call. Keep one route table. |
| Path ids | `/^[1-9][0-9]{0,14}$/`, then `Number(...)`. A failing `:id` → 404 `Unknown room`; `:versionId` → `Unknown settings version`; `:runId` → `Unknown calibration run`. |
| `:alarmKey` | `decodeURIComponent` once; a throw → 404 `Unknown alarm` (after the room check). |
| Query integers | Must match `/^[0-9]{1,15}$/`; read with `URLSearchParams.get`. Present but empty (`?from=`) is invalid. Unknown parameters are ignored. Rules: `from`, `to` ≥ 0, `from` ≤ `to`, defaults `to` = `now()`, `from` = `to - 3600`; `step` 0-86400; range ≤ 2,678,400 s, and ≤ 604,800 s when `step` is 0 or absent; `limit` 1-500 (default 100); `before` ≥ 1. A break → 400 `Invalid query`. |
| Body routes | 6.2, 6.3, 6.5, 6.13, 6.16, 6.18 read the body. Every other route never reads it. |
| Body reading | Collect chunks. Past 1,048,576 bytes, stop keeping them but keep draining. At `end`: over the limit → 400 `Body is larger than 1 MB` (exactly 1,048,576 bytes is accepted). Else `JSON.parse(Buffer.concat(chunks).toString('utf8'), (k, v) => (k === '__proto__' ? undefined : v))`; a throw (an empty body too) → 400 `Body is not valid JSON`. |
| Plain object | `v !== null && typeof v === 'object' && !Array.isArray(v)` |
| JSON reply | `res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })`, then `res.end(JSON.stringify(body))`. Error body `{ error, details }`; `details` is always an array (`[]` for 404). |
| `details` wording | `<field>: <problem>`, for example `mix[1].blocks: must be an integer from 0 to 200000`. Not frozen; tests check only the field prefix. |
| Static files | `serveStatic` is synchronous (`fs.statSync`, `fs.readFileSync`; the files are small). The path is decoded once before it is matched. An empty segment (`/web//a.js`) is 404. A path that is not a regular file is 404. |
| Stream connections | Add on the request; remove on `req.on('close')`. Skip writes to a `res` that is `destroyed` or `writableEnded`. After each write, if `res.writableLength > 1048576`: `res.destroy()` and remove it. |
| Heartbeat | One `setInterval(heartbeatMs)` started in `createApi`, `unref()`ed, cleared by `close()`; it writes `: ping\n\n` to every connection. |
| `readConfig` values | Env `FARM_PORT`: a string of decimal digits, 1-65535. File `port`: a JSON integer, 1-65535. `db` and `host` (env or file): a non-empty string, else bad. Reasons are free text after `Bad configuration: `. |
| `main.js` config file | `fs.readFileSync(path.join(root, 'farm.config.json'), 'utf8')`; `ENOENT` → `fileText` `null`; any other read error → `Bad configuration: cannot read farm.config.json: <message>`, exit 1. |
| `main.js` messages | Print with `console.error(err.message)` for `readConfig` errors. `fatal(err)`: `console.error('Database error: ' + err.message)` then `console.error(err.stack)`, `process.exit(1)`. |
| `main.js` shutdown | One handler for `SIGINT` and `SIGTERM`, synchronous: `api.close()`, `server.close()`, `rooms.stop()`, `db.close()`, `process.exit(0)`. A `shuttingDown` flag makes a second signal `process.exit(1)`. |

## 5. Tasks

TDD for every task: write the failing test, run it and see it fail, implement, see it pass, run `npm test`, then commit only that task's files (`feat(room-rules): …`, `feat(api): …`, `test(api): …`) with the repo's configured git identity.

Shared test setup (define it in each test file that needs it; no shared helper file):

| Helper | Definition |
|---|---|
| Clock | `let NOW = 1791450000; const now = () => NOW;` given to `openFakeDb`, `createFakeRoomManager` and `createApi` |
| `startApi(extra)` | `db = openFakeDb({ now })`; `rooms = createFakeRoomManager({ db, now })`; `fatals = []`; `api = createApi({ db, rooms, root, now, heartbeatMs: 50, onFatal: e => fatals.push(e), ...extra })`; `server = http.createServer(api.handle).listen(0, '127.0.0.1')`. Returns `{ url, db, rooms, api, fatals, stop }`; `stop()` calls `api.close()` and closes the server. |
| `root` | `fs.mkdtempSync(path.join(os.tmpdir(), 'farm-'))` holding short known texts: `index.html`, `styles.css`, `sim.js`, `room-rules.js`, `web/a.js`, `web/sub/b.css`, `web/x.txt`, `web/.hidden.js`, `data/farm.db`, `server/api.js`, `package.json`, `README.md`, `.git/config` |
| `seedRoom(db, name)` | `db.createRoom({ name, volume: 60, vent: 'supply', settings: ClimateController.defaultSettings() }).id` |
| `reading(t)` | `{ t, T: 18, RH: 88, CO2: 800, t_out: 30, rh_out: 60, ac_mode: 'cool', ac_setpoint: 17.5, fog: 1, fan: 1, lights: 1, circ: 0, power_w: 1000, kwh: 1 }` for `db.insertReading(id, reading(t))` |
| Requests | Global `fetch` for JSON routes; `node:http` `request` for raw paths (so `..` and `%2e` are not normalised) |

### Task 0: check the wave 0 base (no code)

| Step | Command | Expected |
|---|---|---|
| 1 | `ls docs/contracts tests/fakes server room-rules.js web/rooms.js` | `api.md`, `db.md`, `rooms.md`, `web.md`; `db.js`, `rooms.js`, `api-server.js` in `tests/fakes`; `db-common.js`, `rooms-common.js` in `server`; the two stubs |
| 2 | `npm pkg get scripts.test scripts.start` | `node --disable-warning=ExperimentalWarning --test tests/*.test.js` and `node --disable-warning=ExperimentalWarning server/main.js` |
| 3 | `npm test` | `# fail 0`. Write down the count N. |
| If anything differs | Stop and report to the lead. Do not write fakes or edit `package.json`. | – |

### Task 1: `room-rules.js`: constants, `hasCrop`, `validCalib`, `normRoom` (`tests/room-rules.test.js`)

The test requires `../sim.js`, `../controller.js`, `../runtime.js`, `../calib.js`, then `../room-rules.js`, and reads `globalThis.ClimateRoomRules`.

| Test | Proves |
|---|---|
| Members | `Object.keys(ClimateRoomRules).sort()` equals the 10 names of 4.1 |
| Constants | `LIM` deep-equals `{ blocks: 200000, volume: [5, 5000], co2: [1, 1000], name: 60 }`; `VERDICTS` deep-equals `['impossible', 'too-dense', 'tight', 'good', 'too-empty']`; `ALARM_KEYS` deep-equals the 12 keys of C3 7.1 |
| `hasCrop` | `true` for `oyster`, `milky`; `false` for `shiitake`, `toString`, `__proto__`, `5`, `undefined` |
| `validCalib` | `{ ua: 92, infAch: 0.3, moistBuffer: 3, co2PerBlock: 41, rmse: { T: 0.2 }, date: 'd' }` comes back with the same 6 values; no `rmse` → `{}`; no `date` → `''`; each PARAMS min and max accepted. `null` for `null`, a string, `ua: 19.9`, a non-finite value, a missing key. |
| `normRoom` | As `app.js`: `null` for a non-object; drops mix rows with an unknown crop or blocks outside 0-200000; rounds `blocks` (10.4 → 10); keeps `co2PerBlock` only in 1-1000; `report` kept only with a verdict in `VERDICTS` and an array `runs`, else `null`; `name` = `String(r.name \|\| 'Room').slice(0, 60)`; bad `volume` → 60 (`ClimateSim.PLANT.room.volume`); `vent` other than `exhaust` → `supply`; `id` = `String(r.id)`, or a base-36 text ending with the index; `calib` = `validCalib(r.calib)`; `rev` = 0 |
| Browser load | In a `vm` context whose `window` is the context, running `sim.js`, `controller.js`, `runtime.js`, `calib.js`, `capacity.js`, `room-rules.js` defines `window.ClimateRoomRules` |

Implement: copy `app.js` lines 1074-1093 into the `capacity.js` wrapper (`(function (global) { 'use strict'; … })(typeof window !== 'undefined' ? window : globalThis);`). Read `ClimateSim`, `ClimateController`, `ClimateCalib` from `global`. Use `VERDICTS.includes(rep.verdict)` for `VERDICT_CHIP[rep.verdict]`. Change no other behaviour.

### Task 2: `room-rules.js`: `check*` (C3 7.2-7.5, same test file)

| Test | Proves |
|---|---|
| `checkRoom(body, false)` | `[]` for `{ name: 'A', volume: 60, vent: 'supply' }`, with or without `settings` (any value). One problem each for: a missing `name`, `volume` or `vent`; `name` `'   '`, 61 characters after trimming, or not a string (`'  ' + 60 chars + '  '` is valid); `volume` 4.99, 5000.01, `'60'`, `null`; `vent` `'side'`; field `colour`; `archived`. A non-object body (`null`, `[]`, `'x'`) gives a problem. |
| `checkRoom(body, true)` | `{}` → a problem; `{ archived: true }`, `{ name: 'B' }` valid; `{ archived: false }`, `{ settings: {} }` → a problem |
| `checkMix` | `[]` and a mix with a repeated crop → `[]`. Problems (prefix `mix[i].`): not an array; a row not an object; unknown crop; `blocks` 1.5, -1, 200001, `'5'`; `co2_per_block` 0, 1001, `'x'`; an extra key. `co2_per_block` left out or `null` is valid. |
| `checkCalibration(body, NOW)` | A full valid body → `[]`. Problems: each of the 4 values just outside its PARAMS range; a missing `rmse_t` key (`null` is valid); `rmse_rh` -0.1; `log_rows` 1 or 2.5 (`null`, 2 valid); `run_at` 0, 1.5, `NOW + 61` (`NOW + 60` and left out valid); an extra field; a non-object |
| `checkReport` | `{ verdict: 'good', runs: [] }` → `[]`. Problems: not an object; unknown verdict; `runs` not an array; `utilisation` 74.5 or -1 (left out, `null`, 74 valid) |

### Task 3: `server/config.js` (`tests/config.test.js`, C3 12)

No db, no room manager, no network.

| Test | Proves |
|---|---|
| Sources | For each of `port`, `db`, `host`: env wins over `fileText`, which wins over the defaults |
| Defaults | `fileText` `null`, empty env → `{ port: 8080, db: <root>/data/farm.db, host: null }` |
| Paths | A relative `db` (env or file) → `path.resolve(root, db)` |
| Bad configuration | Throws a message starting `Bad configuration:` for: `fileText` `{bad`; `[]`; an unknown file field; port `0`, `65536`, `8080.5` (file), `"80a"` (env); `FARM_DB=''`; `FARM_HOST=''` (present but empty) |
| `pickHosts` | With hand-made interface objects: skips internal, IPv6 and public (`203.0.113.5`) addresses, and every name prefix `docker` (`docker0` 172.17.0.1), `br-` (`br-1a2b`), `veth`, `virbr` (`virbr0` 192.168.122.1), `vmnet`, `tun`, `tap`, `lo`, `zt`; keeps 10/8, 172.16/12, 192.168/16 on `enp3s0`, `eth0`, `wlan0`, `wlp2s0`, in sorted name order; `[]` when nothing is left |

### Task 4: `server/static.js` (`tests/api.test.js`, `describe('static files')`, through `startApi`)

| Request | Expected |
|---|---|
| `GET /`, `GET /index.html` | 200, the `index.html` text, `Content-Type: text/html; charset=utf-8`, `Cache-Control: no-cache`, `Content-Length` = byte length |
| `GET /styles.css`, `/sim.js?v=2`, `/room-rules.js`, `/web/a.js`, `/web/sub/b.css` | 200 with the C3 9 `Content-Type` |
| `HEAD /` | 200, the same headers, empty body |
| `POST /` | 404, `text/plain; charset=utf-8`, body `Not found` |
| `/controller.js` (not in this root), `/web/x.txt`, `/web/`, `/web`, `/web/sub`, `/web/../server/api.js`, `/web/%2e%2e/server/api.js`, `/web/.hidden.js`, `/web/a%5Cb.js`, `/web/a%00.js`, `/web/%E0%A4%A`, `/web//a.js` | 404 `Not found` |
| `/data/farm.db`, `/package.json`, `/server/api.js`, `/README.md`, `/.git/config`, `/api` | 404 `Not found` |
| `serveStatic` called directly with `GET /api/x` | Returns `false`, writes nothing |

### Task 5: `server/api.js` core: routing, check order, bodies

| Test | Proves |
|---|---|
| `GET /api/nope`, `DELETE /api/rooms/1`, `PUT /api/rooms`, `HEAD /api/rooms`, `GET /api/rooms/`, `POST /api/stream`, `GET /api/unknown` | 404 JSON `{ error: 'Unknown route', details: [] }`, `Cache-Control: no-store` (never the static `Not found`) |
| `GET /api/rooms/<x>/settings` with `x` = `0`, `01`, `1.5`, `abc`, `9999999999999999`, an unknown id, an archived room | 404 `Unknown room` |
| `PUT /api/rooms/<unknown>/settings` with an invalid JSON body | 404 `Unknown room` (room check before body) |
| Invalid JSON and an empty body on `PUT /api/rooms/:id/mix` | 400 `Body is not valid JSON` |
| 1,048,577 bytes on `POST /api/rooms/:id/capacity` | 400 `Body is larger than 1 MB`; `db.latestCapacityReport(id)` is still `null` |
| Exactly 1,048,576 bytes (a valid report padded with a `pad` string) | 201 |

### Task 6: room routes 6.1, 6.2, 6.3, 6.19

| Test | Proves |
|---|---|
| `GET /api/rooms` | `[]` with no rooms; after 2 `seedRoom`: 200 and deep-equals `rooms.list()`; an archived room is not listed |
| `POST /api/rooms` | 201, the Room with `live`; the last `calls` entry is `{ method: 'create', args: [{ name, volume, vent, settings: undefined }] }` |
| `POST` with settings (C3 6.2, C2 9.4) | `volume` 200 with `settings: { crop: 'pink' }` → `GET /settings` has `crop` `pink`, `roomM3` 200, other values the defaults; with `settings: { crop: 'pink', roomM3: 90 }` → `roomM3` 90 |
| `POST` 400s | `Invalid room` for each `checkRoom` rule and a non-object body; `Invalid settings` for `settings` `null`, `[]`, `5`. Each time `rooms.calls` and `db.listRooms()` are unchanged. |
| `PATCH` | `{ name: 'B' }` → `update(id, { name: 'B' })`, 200. `{ archived: true }` → only `archive(id)`; reply `archived_at` = NOW, `live: null`; then `GET /settings` is 404. `{ volume: 80, archived: true }` → `update` then `archive`; reply is the archive's Room. |
| `PATCH` 400s | `{}`, `{ archived: false }`, `{ colour: 1 }`, `{ volume: 1 }` → 400 `Invalid room`, no C2 call |
| `POST /restart` | After `setLive(id, { running: false, error: 'boom' })`: 200, `calls` has `restart` with `[id]`, reply `live.running` `true`, `live.error` `null` |

### Task 7: settings routes 6.4-6.7

| Test | Proves |
|---|---|
| `GET /settings` | Equals `db.currentSettings(id).settings` (bare) |
| `PUT /settings` | `{ settings: { spT: 20 }, note: '  x  ' }` → 200 `{ settings, warnings }` (no `version` key); call args `[id, { spT: 20 }, 'x']`; `GET /settings` then equals the previous version with only `spT` changed. `note` `null`, left out, and `'   '` each give `args.length === 3` and `args[2] === undefined`. |
| `PUT /settings` 400s | `Invalid settings` for: no `settings`; `settings` `null`, `[]`, `'x'`; `note` 5; a note of 201 characters after trimming; an extra body field; a non-object body. No C2 call, no new version. |
| `__proto__` | `{"__proto__":{"polluted":1}, …}` (raw text) on `PUT /settings` (inside and beside `settings`) and on `POST /api/rooms`: `({}).polluted` is `undefined`; `Object.keys(Object.prototype)` unchanged |
| `GET /settings/history` | After one PUT: 2 rows, newest first, each with exactly `id`, `room_id`, `saved_at`, `note` |
| `POST /settings/restore/:v` | 200 `{ settings, warnings }`; call `applySettings(id, v.settings, 'Restored version <v>', { exact: true })`; history has a new row with that note |
| Restore 404s | `abc`, `0`, an unknown id, a version of another room → 404 `Unknown settings version`, no C2 call |

### Task 8: readings, events, alarms, ack (6.8-6.11)

| Test | Proves |
|---|---|
| Readings default | Rows at `NOW-3601`, `NOW-3600`, `NOW`; no query → the last two, each deep-equal to the C1 row with exactly the 15 Reading keys |
| Readings `step` | `step=60` → deep-equals `db.queryReadings(id, { from, to, step: 60 })`; `step=0` → raw rows |
| Readings 400 | `Invalid query` for `from=abc`, `from=-1`, `to=1.5`, `from=`, `step=86401`, `from>to`, a raw range of 604,801 s, 2,678,401 s with `step=900`. `foo=1` → 200. |
| Events | 5 seeded events: `limit=2` → the 2 newest (`id` descending); `before=<smallest id of that page>` → the next page; no query → at most 100. `limit=0`, `limit=501`, `before=0`, `before=x` → 400 `Invalid query`. |
| Alarms | Deep-equals `db.listAlarms(id, { recent: 20 })` |
| Ack | Seed `sensor_RH` with `db.raiseAlarm`. `POST /alarms/sensor_RH/ack` → 200, the row with `acked_at` = NOW, call `ackAlarm(id, 'sensor_RH')`; again → 200, same row. Key `rh Hi` sent as `rh%20Hi` is decoded. `%E0%A4%A` and an unknown key → 404 `Unknown alarm`. |

### Task 9: calibrations, mix, capacity (6.12-6.18)

| Test | Proves |
|---|---|
| `POST /calibrations` | 201, `applied_at: null`, `applied: false`; `run_at` = NOW when left out, the given value when sent. The task 2 invalid bodies → 400 `Invalid calibration`, no row. |
| `GET /calibrations` | `[]` with none; `run_at` descending; exactly one `applied: true` after an apply |
| `POST /calibrations/:run/apply` | 200, `applied: true`, `applied_at` = NOW; `calls` has `restart` with `[id]` after it. `x`, `0`, `999`, a run of another room → 404 `Unknown calibration run`, no `restart` call. |
| Mix | `PUT [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2_per_block: 55 }]` → 200 with `co2_per_block: null` in row 1; `GET` the same; `PUT []` → `[]`. Bad rows and a non-array → 400 `Invalid crop mix`, stored mix unchanged. |
| Capacity | `GET` with none → 404 `No capacity report`. `POST { verdict: 'good', utilisation: 74, runs: [] }` → 201, `verdict` and `utilisation` copied, `run_at` = NOW; next `GET` returns it. Unknown verdict, `utilisation: 74.5` → 400 `Invalid capacity report`. |

### Task 10: error mapping and the database-error stop (4.4 of this brief)

Replace one method on the fake object for one test. `dbErr(errcode)` = `Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode })`.

| Replaced call throws | Expected reply | `onFatal` |
|---|---|---|
| `rooms.create`: `new RoomError('bad_input', 'Bad input', ['name: x'])` | 400 `Invalid room`, `details: ['name: x']` | no |
| `rooms.update`: `bad_input` | 400 `Invalid room` | no |
| `rooms.update`, `archive`, `restart`, `applySettings`: `not_found` | 404 `Unknown room` | no |
| `rooms.applySettings`: `bad_input` | 400 `Invalid settings` | no |
| `rooms.ackAlarm`: `not_found`; separately `bad_input` | 404 `Unknown alarm` | no |
| `db.currentSettings`: `new RangeError('x')` | 500 `Server fault`, `details: ['x']` | no |
| `db.listEvents`: `dbErr(10)`; separately `dbErr(13)`; `db.getRoom`: `dbErr(10)` | 500 | once, the same object, after the reply arrived |
| `db.replaceMix`: `dbErr(275)` (CHECK) | 500 | no |
| `rooms.restart`: `new Error('boom')`; a replaced call that throws the string `'x'` | 500 | no |

### Task 11: the stream (`tests/stream.test.js`, C4)

Client: `http.get(url + '/api/stream')`, collect text, split messages on `\n\n`.

| Test | Proves |
|---|---|
| Open | 200, `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store`, `Connection: keep-alive`; first bytes exactly `retry: 3000\n\n` |
| `reading` | `rooms.emit('reading', { roomId: 1, live: { …, reading: R } })` → `event: reading\ndata: <JSON.stringify(R)>\n\n` |
| `event`, `alarm`, `room` | `data` = `payload.event`, `payload.alarm`, `payload.room`, unchanged (also a `room` with `archived_at` set and `live: null`) |
| `settings` | `{ roomId: 1, version: V, settings: S, warnings: [], auto: false }` → `data` = `{ ...V, room_id: 1, settings: S }` |
| One per emit, in order | Emitting `reading`, `alarm`, `event`, `settings`, `room` gives exactly 5 messages in that order; after a `reading` emit and the next ping, no `room` message |
| Two clients | Both get every message |
| `fatal` | `rooms.emit('fatal', { error })` sends nothing |
| Heartbeat | With `heartbeatMs: 50`, every client gets `: ping\n\n` within 500 ms |
| Client gone | Destroy one client, then emit: no throw; the other client gets the message |
| Slow client | A client that calls `res.pause()`; emit 64 KB `room` payloads until the server ends it (`close` within 10 s); another client still gets messages |
| `close()` | Every client's response ends; `rooms.off` is called for the 5 names with the same functions given to `rooms.on` (wrap both before `createApi`); an emit afterwards writes nothing and does not throw; a second `close()` does nothing |

### Task 12: `server/main.js` (`tests/api.test.js`, `describe('server/main.js')`, C3 12.1)

Build a temporary folder `tmp` per test. Spawn `process.execPath` with `['-r', <tmp>/preload-os.js, <tmp>/server/main.js]`, an env made from `process.env` without any `FARM_*` or `STUB_*` key plus the test's keys, and a 10 s timeout. A free port comes from listening on port 0 on `127.0.0.1`, reading it and closing.

| File in `tmp` | Content |
|---|---|
| `server/main.js`, `server/config.js` | Copies of the worktree's files |
| `server/api.js` | Wraps the real `createApi` (absolute `require` of the worktree's `server/api.js`); its `close` prints `stub: api.close` first |
| `server/db.js` | `openDb(p)` prints `stub: openDb <p>`; with `STUB_DB_THROW` set throws `Error('stub cannot open')`; else returns `openFakeDb()` (absolute `require`) with `close` wrapped to print `stub: db.close` |
| `server/rooms.js` | `createRoomManager({ db })` returns `createFakeRoomManager({ db })` (absolute `require`) with `stop` printing `stub: rooms.stop` and `start` printing `stub: rooms.start`, then: `STUB_START_THROW=sqlite` throws `Object.assign(new Error('stub disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 })`; `STUB_START_THROW=plain` throws `new Error('stub start failed')`; `STUB_FATAL_MS=<n>` emits `fatal` with `{ error: <that sqlite error> }` after `n` ms |
| `preload-os.js` | Replaces `require('node:os').networkInterfaces` with `() => JSON.parse(process.env.STUB_IFACES)` (every test without `FARM_HOST` sets `STUB_IFACES`) |
| `index.html` | A short known text |

| Test | Expected |
|---|---|
| `FARM_PORT=abc` | Exit 1; stderr starts with `Bad configuration:` |
| `tmp/farm.config.json` = `{bad` | Exit 1; stderr starts with `Bad configuration:` |
| `farm.config.json` `{ "port": 1 }`, `FARM_PORT=<free>`, `FARM_HOST=127.0.0.1` | Listens on the free port |
| No `FARM_HOST`; `lo` 127.0.0.1 (internal) and `eth0` 203.0.113.5 | Exit 1; stderr has `No farm network address found; set FARM_HOST (for example 127.0.0.1).` |
| No `FARM_HOST`; `wlan0` 192.168.254.253 and `eth0` 10.254.253.252 (not internal) | stdout has `Farm network addresses: 10.254.253.252 (eth0), 192.168.254.253 (wlan0)`; exit 1; stderr has `Cannot listen on 10.254.253.252:<port>:`; stdout has `stub: api.close`, `stub: rooms.stop`, `stub: db.close` in that order |
| Normal start: `FARM_HOST=127.0.0.1`, `FARM_PORT=<free>`, `FARM_DB=x/y.db` | stdout has `stub: openDb <tmp>/x/y.db`, then `stub: rooms.start`, then the line `Open http://127.0.0.1:<port>` with nothing after the port; `GET /api/rooms` → 200 `[]`; `GET /` → `tmp/index.html` |
| No `FARM_DB` | stdout has `stub: openDb <tmp>/data/farm.db` |
| `SIGTERM`, and separately `SIGINT`, after a normal start | Exit 0; stdout has `stub: api.close`, `stub: rooms.stop`, `stub: db.close` in that order |
| `STUB_DB_THROW=1` | Exit 1; stderr has `Cannot open the database: stub cannot open` |
| `STUB_START_THROW=sqlite` | Exit 1; stdout has `stub: db.close`; stderr has `Database error: stub disk I/O error` and no `Cannot start the rooms` |
| `STUB_START_THROW=plain` | Exit 1; stdout has `stub: db.close`; stderr has `Cannot start the rooms: stub start failed`, then a line starting with `    at `, and no `Database error` |
| `STUB_FATAL_MS=100` after a normal start | Exit 1; stderr has `Database error: stub disk I/O error`; stdout has no `stub: rooms.stop` |

Implement `main.js` exactly in the C3 2.2 start-up order: (1) `readConfig`, then `pickHosts(os.networkInterfaces())` when `host` is `null`; (2) `openDb`; (3) `createRoomManager({ db })`, `rooms.on('fatal', ({ error }) => fatal(error))`, `rooms.start()`; (4) `createApi({ db, rooms, root, onFatal: fatal })`; (5) `http.createServer(api.handle).listen(port, host)`. `root` = `path.join(__dirname, '..')`. Call `os.networkInterfaces()` through the `require('node:os')` object, never destructured.

### Task 13: final checks

Run all of section 6 and fix what fails.

## 6. How to verify

| # | Command | Expected |
|---|---|---|
| 1 | `npm test` | `# fail 0`; the count is N (task 0) plus your new tests |
| 2 | `node --disable-warning=ExperimentalWarning --test tests/api.test.js tests/stream.test.js tests/config.test.js tests/room-rules.test.js` | All pass in under 60 s, and the process exits (no open handle) |
| 3 | `node --test tests/vectors.test.js` | The 8 `vectors: …` tests pass |
| 4 | `git diff --exit-code <base> -- tests/vectors package.json` | Exit code 0 |
| 5 | `git diff --name-only <base>` plus `git status --porcelain` | Only the 9 files of section 2 |
| 6 | `grep -n "require(" server/api.js server/static.js server/config.js server/main.js` | Only the modules of the 4.1 "May require" table; `./db.js` and `./rooms.js` only in `main.js`; nothing under `tests/` |
| 7 | `grep -n "networkInterfaces" server/main.js` | Called as `os.networkInterfaces()` |
| 8 | `node -e "const vm=require('vm'),fs=require('fs');const w={console};w.window=w;vm.createContext(w);for(const f of ['sim.js','controller.js','runtime.js','calib.js','capacity.js','room-rules.js'])vm.runInContext(fs.readFileSync(f,'utf8'),w,{filename:f});console.log(Object.keys(w.ClimateRoomRules).sort().join(','))"` | `ALARM_KEYS,LIM,VERDICTS,checkCalibration,checkMix,checkReport,checkRoom,hasCrop,normRoom,validCalib` |

`npm start` cannot run in your worktree (no `server/db.js`, `server/rooms.js`). Task 12 proves `main.js` with stubs; the lead's wave 1.5 gate runs it for real.

## 7. Done when

| # | Item |
|---|---|
| 1 | All 19 C3 routes and `GET /api/stream` work as C3 sections 5, 6, 10 and 11 say, with the calls of 4.3. |
| 2 | Every C3 section 4 error (status and `error` text), the check order, and every row of 4.4 are tested. |
| 3 | `onFatal` is called once, after the 500, for a non-constraint node:sqlite error, and never otherwise. |
| 4 | Every body is parsed with the `__proto__` reviver, and the pollution test passes. |
| 5 | The C3 section 9 static rules pass, including every path-safety case of task 4. |
| 6 | `readConfig` and `pickHosts` pass `tests/config.test.js`; `main.js` passes every task 12 test. |
| 7 | `room-rules.js` has exactly the 10 members, loads in Node and in a browser-style context, and `normRoom` and `validCalib` behave as in `app.js`. |
| 8 | Section 6 checks 1-8 give the expected results; the 8 recorded runs in `tests/vectors/` are unchanged. |
| 9 | Only the 9 owned files changed, with one commit per task. |
| 10 | Your report to the lead gives the test count before and after, and any contract question you found (with the section). |

## 8. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 2 (above all `package.json`, `tests/fakes/**`, `server/*-common.js`, `docs/**`, the shared modules, `tests/vectors/**`) | One owner per file. Report a needed change to the lead. |
| Require `server/db.js` or `server/rooms.js` anywhere but `server/main.js`; write `tests/api-real.test.js` | They do not exist in your worktree; the real-module test is the lead's (wave 3) |
| Pass settings from a body anywhere but to `rooms.create` and `rooms.applySettings`, or write settings, alarms, rooms or loop state through C1 | Lead decision 6, C3 section 11: C2 validates and stores settings |
| Derive `room` events, send C2's `fatal` to the stream, add `id:` lines or a stream history | Lead decision 2, C4 10.2: one message per C2 emit |
| Add routes, fields, a 405 status, CORS headers, npm dependencies, a framework, a build step, ES modules or a `"type"` field | Not in C3 or the spec |
| Listen on `0.0.0.0` or a public address | C3 2.2 |
| Normalise paths with `new URL()` | It hides `..` and `%2e%2e` (4.5) |
| Check texts only the real manager writes (`Started`, `Stopped`, `Resumed after …`, `Stopped by an error: …`, `Settings: …`, `Targets restored: …`) | C2 16: the fake does not write them |
| Run `npm run vectors` or `tools/make-vectors.js` | It rewrites `tests/vectors/` |
| Change git config, push or merge; change a contract to make a test pass | The lead merges after a spec-compliance review and a code-quality review; contract changes go through the lead |

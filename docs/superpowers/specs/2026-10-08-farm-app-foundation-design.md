# Farm app foundation: design

Date: 2026-10-08. Status: approved; contracts frozen in `docs/contracts/` (lead decisions in `docs/contracts/LEAD-DECISIONS.md`); workstream briefs in `docs/superpowers/plans/2026-10-08-farm-foundation/`.

## Purpose

The project becomes one integrated app for running a mushroom farm. This first sub-project builds the foundation that
every later module plugs into:

| Goal | Result |
|---|---|
| Data in a database, not in the browser or in JSON files | One SQLite file on the farm device holds rooms, settings, readings, events, alarms, calibrations, crop mixes and capacity reports |
| Rooms run 24/7 | A server on the farm device runs each room's control loop in real time and records it, with or without a browser open |
| One app | A web app shell with a menu: Rooms, Simulator, Capacity, Calibration |
| No public site | GitHub Pages is turned off; the repo stays on GitHub as the code backup |

## Decisions

| Subject | Decision |
|---|---|
| Where it runs | A farm device on the farm network (a small PC or a Raspberry Pi). Phones and laptops on the farm Wi-Fi open it in a browser. No internet needed. Matches `docs/phase3-plan.md` ("on the farm network first"). |
| Who runs the controller | The server (approach A). The browser is the screen. The fast what-if tools stay in the browser. |
| Data in SQLite | Rooms and capacity reports; controller settings per room; readings history; events, alarms and calibrations |
| Technology | Node.js 22 with the built-in `node:sqlite` and `node:http`; plain JavaScript; no framework, no build step, no npm dependencies |
| Live updates | Server-Sent Events (one-way server → page); changes go back as normal HTTP requests |
| Access | No login in version 1. The server listens on the farm network only. Logins come later with work item 3.5 (farmer and installer PINs). |
| Settings on a live room | Full editing on the room page, with a change list to confirm, server-side validation, a stored version per save, and Restore |
| Simulated room time | Live rooms run in real time. Fast runs happen only in the Simulator module in the browser. |

### Sub-projects of the farm app

This spec covers only sub-project 1. Each later one gets its own spec, plan and build.

| # | Sub-project | Content |
|---|---|---|
| 1 | Foundation (this spec) | Server, SQLite, app shell, existing features moved to the database, Pages off |
| 2 | Batches and stages | Each batch of blocks from arrival to disposal; drives the controller stage and the capacity check |
| 3 | Harvest and yield | kg per flush and batch, linked to the climate history |
| 4 | Inventory and costs | Supplies, energy, labour, RM per kg |
| 5 | Sales, workers, compliance | Orders, daily tasks, MyGAP records |
| – | Device side (`docs/phase3-plan.md`) | Hardware adapter (3.2), Telegram alarms (3.4), users (3.5); they plug into this server |

### Out of scope

| Item | Where it goes |
|---|---|
| Real sensors and AC | Hardware adapter, work item 3.2; the adapter interface is the existing one in `runtime.js` and `docs/contract.md` |
| Logins and roles | Work item 3.5 |
| Clean-up of old readings (averaging after N days) | Later; the schema allows it |
| Cloud sync | Later (phase 3 decision: farm network first) |
| Fixing the room drawing for supply mode | Separate small task |

## 1. Architecture

```
 phones / laptops on farm Wi-Fi                     farm device (PC or Pi)
 ┌───────────────────────────┐   HTTP + live feed   ┌─────────────────────────────────────┐
 │ Web app (one page, menu)  │ ◄──────────────────► │ server/  (Node 22, no dependencies) │
 │  • Rooms (live)           │                      │  • api: HTTP routes + live feed     │
 │  • Simulator (test bench) │                      │  • rooms: one control loop per room │
 │  • Capacity               │                      │      runtime.js + controller.js     │
 │  • Calibration            │                      │      + adapter (sim now, hw later)  │
 └───────────────────────────┘                      │  • db: SQLite file, schema, queries │
                                                    └─────────────────────────────────────┘
```

| Part | File | Job |
|---|---|---|
| Start-up | `server/main.js` | Reads the configuration, opens the database, starts each room's loop, serves the web app and the API, prints the address |
| Database | `server/db.js` | Opens `data/farm.db` with `node:sqlite`, applies numbered schema upgrades, offers small query functions |
| Room loops | `server/rooms.js` | One running room per active room: the controller plus an adapter, ticked every second through `runtime.js`; saves readings, events, alarms and controller state; applies new settings at once |
| Simulated adapter | `server/sim-adapter.js` | Wraps `sim.js` as the adapter for a live room in real time; a hardware adapter later has the same interface |
| HTTP API and live feed | `server/api.js` | The routes in section 3 and the Server-Sent Events stream |
| Static files | `server/static.js` | Serves `index.html`, `styles.css`, the shared modules and `web/` |
| Shared modules | `controller.js`, `sim.js`, `runtime.js`, `capacity.js`, `calib.js` | Unchanged; they already run in both Node and the browser |
| Web app | `index.html`, `web/*.js` (including `web/ui.js`), `styles.css` | Section 4 |
| Configuration rules | `server/config.js` | Reads the configuration and picks the farm network address (pure; `main.js` calls it) |
| Configuration | `farm.config.json` (optional) or environment variables `FARM_PORT`, `FARM_DB` | Port (default 8080) and database path (default `data/farm.db`) |

### Server restart

| Item | Behaviour |
|---|---|
| Settings | Each room starts from its latest settings version |
| Controller state | Restored from `controller_state` (the controller's existing `snapshot()`), so stages, ramps, alarms and fault states carry on |
| Simulated room state | Restored from the last saved simulation snapshot (`sim.snapshot()`), so the simulated room does not jump |
| Gap in readings | Shown as a gap in the charts; no readings are invented |

## 2. Data model (SQLite)

| Table | One row per | Columns | Replaces |
|---|---|---|---|
| `rooms` | Room | `id`, `name`, `volume`, `vent`, `adapter` (`sim` now), `created_at`, `archived_at` | Rooms in browser storage |
| `room_settings` | Saved settings version | `id`, `room_id`, `saved_at`, `settings` (JSON text, the controller's settings format), `note` | Settings JSON export and import |
| `calibrations` | Calibration run | `id`, `room_id`, `run_at`, `ua`, `inf_ach`, `moist_buffer`, `co2_per_block`, `rmse_t`, `rmse_rh`, `rmse_co2`, `log_rows`, `applied_at` | The calibration card's in-memory result |
| `crop_mixes` | Planned crop in a room | `room_id`, `crop`, `blocks`, `co2_per_block` | The capacity card's mix table |
| `capacity_reports` | Capacity check | `id`, `room_id`, `run_at`, `verdict`, `utilisation`, `report` (JSON text) | The report in browser storage |
| `readings` | Sensor reading | `room_id`, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `fan`, `lights`, `circ`, `power_w`, `kwh` | Samples kept only while the page is open |
| `events` | Controller event | `id`, `room_id`, `t`, `level`, `text` | The event log (lost on reload) |
| `alarms` | Alarm | `id`, `room_id`, `alarm_key`, `level`, `label`, `raised_at`, `cleared_at`, `acked_at` | Alarms (lost on reload) |
| `controller_state` | Room | `room_id`, `saved_at`, `controller` (JSON text), `sim` (JSON text) | Nothing: lets a room resume |
| `schema_version` | Applied upgrade | `version`, `applied_at` | Nothing: later modules add tables by numbered upgrades |

| Decision | Choice | Reason |
|---|---|---|
| Settings and reports as JSON text | Yes | The settings format already has validation (`importSettings`); columns would break whenever the controller changes |
| Settings history | Every saved version is kept | Undo (Restore) and, later, the change log of 3.5 |
| Readings | One row per controller reading (every 30 s by default); index on (`room_id`, `t`) | About 1 million rows and about 100 MB per room per year: fine for SQLite on a Pi |
| Controller state | Saved every 5 minutes and on shutdown | Bounded writes; a restart loses at most 5 minutes of state, never settings |
| Time | Seconds since 1970, UTC, in every table; the page shows Malaysia time | No time-zone mix-ups |
| Writes | One connection in the server; WAL journal mode | Reads from the API never block the room loops |
| Deleting a room | Archive only (`archived_at`); its loop stops; its data stays | No accidental data loss |

## 3. API and live feed

All bodies are JSON. Errors are `{ "error": "...", "details": [...] }` with HTTP 400 (bad input), 404 (unknown room or run)
or 500 (server fault).

| Method and path | Does | Body or reply |
|---|---|---|
| `GET /api/rooms` | Rooms with live status | `[{ id, name, volume, vent, adapter, live: { reading, stage, crop, alarms, running, error } }]` |
| `POST /api/rooms` | Create a room; its loop starts at once | `{ name, volume, vent, settings? }` → the room |
| `PATCH /api/rooms/:id` | Rename, change volume or vent, archive | changed fields → the room |
| `GET /api/rooms/:id/settings` | Current settings | settings |
| `PUT /api/rooms/:id/settings` | Save a new version; the running controller uses it at once | `{ settings, note? }` → `{ settings, warnings }` (validated by `importSettings`) |
| `GET /api/rooms/:id/settings/history` | Earlier versions | `[{ id, saved_at, note }]` |
| `POST /api/rooms/:id/settings/restore/:versionId` | Make an earlier version current (stored as a new version) | → `{ settings, warnings }` |
| `GET /api/rooms/:id/readings?from=&to=&step=` | History; `step` (seconds) averages into buckets | rows |
| `GET /api/rooms/:id/events?limit=&before=` | Event log, newest first | rows |
| `GET /api/rooms/:id/alarms` | Active and recent alarms | rows |
| `POST /api/rooms/:id/alarms/:alarmKey/ack` | Acknowledge an alarm | → the alarm |
| `GET /api/rooms/:id/calibrations` | Calibration runs | rows |
| `POST /api/rooms/:id/calibrations` | Save a run from the Calibration module | fitted values, errors, log size → the run |
| `POST /api/rooms/:id/calibrations/:runId/apply` | Use a run's values for the room's simulated adapter and its capacity checks | → the run |
| `GET /api/rooms/:id/mix`, `PUT /api/rooms/:id/mix` | The planned crop mix | `[{ crop, blocks, co2_per_block }]` |
| `GET /api/rooms/:id/capacity` | Last capacity report | the report or 404 |
| `POST /api/rooms/:id/capacity` | Save a finished check (the check runs in the browser) | the report |
| `GET /api/stream` | Live feed for all rooms (Server-Sent Events) | events `reading`, `event`, `alarm`, `settings`, `room` |

| Topic | Decision |
|---|---|
| Validation | Every body is checked; settings through `importSettings`; crop mixes and reports with the same rules as the capacity card (`normRoom`, `validCalib` move to the shared `room-rules.js`) |
| Live feed drop | The browser reconnects by itself and reloads the last minutes from `readings` |
| Access | No login; listens on the farm network address only (no internet exposure) |

## 4. Web app

| Part | Design |
|---|---|
| Shell | `index.html` with a top menu: **Rooms · Simulator · Capacity · Calibration**; hash addresses (`#/rooms`, `#/rooms/3`, `#/simulator`, `#/capacity`, `#/calibration`) |
| Code split | Today's `app.js` (about 1,350 lines) becomes `web/api.js` (server calls, live feed), `web/charts.js` (existing charts), `web/settings-panel.js` (the settings editor), `web/rooms.js`, `web/simulator.js`, `web/capacity.js`, `web/calibration.js`, `web/shell.js` (menu and routing), `web/ui.js` (shared page helpers, C5 section 1.1) |
| Rooms list | A card per room: name, crop and stage, T / RH / CO₂ now with status, machines, number of active alarms, "stopped" with the error if its loop crashed; button **New room** |
| Room page | Live readings and machines; history charts (1 h, 6 h, 24 h, 7 days, from the database); alarms with Acknowledge; event log; settings editor (below); settings versions with Restore |
| Settings editor | `web/settings-panel.js`: the Simulator's existing settings panels as one reusable part that edits a settings object. The Simulator uses it with its local controller; the room page with the live room's settings. |
| Saving a live room | **Save** shows the changes (setting: old → new) and asks to confirm; the server validates, applies at once, stores a version; warnings are shown |
| Simulator | Today's test bench. JSON settings export/import replaced by **Load settings from room** and **Save settings to room** (same change list). |
| Capacity | Today's card; rooms, mixes and reports from the database. One-time **Import rooms from this browser** (reads `mushroom-farm.rooms.v1`) creates the rooms through the API. The rooms JSON export/import is removed. |
| Calibration | Today's card as its own module: pick a room, load its farm log CSV, fit, then **Save and apply** to that room |
| Backups | The README explains copying `data/farm.db` (with the server stopped, or with SQLite's backup command) |

## 5. Running, errors, tests

| Topic | Design |
|---|---|
| Start | `npm start` → `node server/main.js`; prints `Open http://<device address>:8080` |
| Empty database | Creates the schema and one demo room: "Room 1", simulated, grey oyster fruiting, default settings |
| Bad input | HTTP 400 with the reason; nothing stored |
| Database error | The server stops with a clear message instead of running without saving |
| Room loop crash | That room is marked stopped with the error (in `/api/rooms` and the Rooms list); the other rooms keep running |
| Shutdown (Ctrl+C or service stop) | Saves each room's controller and simulation state, closes the database |

| Test | Proves |
|---|---|
| Existing 93 tests | Nothing broke |
| The 8 recorded controller runs in `tests/vectors/` | Unchanged (the controller does not change) |
| `tests/db.test.js` | Schema creation, upgrades, queries, on in-memory SQLite |
| `tests/rooms.test.js` | A room loop saves readings, events and alarms; resumes after a restart from saved state; applies new settings |
| `tests/api.test.js` | Each route against a real HTTP server on a random port with the C1 and C2 fakes: success, 400, 404 (C3 section 12) |
| `tests/api-real.test.js` | Each route once more against the real database (temporary file) and room manager, in wave 3 (C3 section 12.2) |
| `tests/config.test.js`, `tests/room-rules.test.js` | The configuration rules and the shared room rules (C3 section 12) |
| `tests/stream.test.js` | The live feed delivers readings and alarms |
| Headless Chrome checks | Each module loads without errors; Rooms shows live values; a settings change with the change list and Restore works; the browser-storage import works |

## 6. Team, contracts and workstreams

The work runs like a team: the lead (the main Claude session) writes the contracts first; then agents build the
workstreams **in parallel**, each in its own git worktree, against the contracts; the lead integrates. Nobody waits for
another stream's code inside a wave: each stream tests against the contracts and against fakes that follow them; wave 2 starts after the wave 1.5 gate.

### Contracts (written and frozen before any stream starts)

| # | Contract | File | Defines |
|---|---|---|---|
| C1 | Database | `docs/contracts/db.md` | The schema (section 2) as exact SQL, and every `server/db.js` function: name, arguments, return value, errors |
| C2 | Room manager | `docs/contracts/rooms.md` | `server/rooms.js`: create, start, stop, list, get one, apply settings, archive; the events it emits (`reading`, `event`, `alarm`, `settings`, `room`) with exact payloads; the adapter interface (the existing one from `docs/contract.md`) |
| C3 | HTTP API | `docs/contracts/api.md` | Every route of section 3 with the exact JSON of each resource (Room, Reading, Event, Alarm, SettingsVersion, Calibration, MixRow, CapacityReport), status codes and error bodies |
| C4 | Live feed | `docs/contracts/api.md` (section "Stream") | Server-Sent Events names and payloads (the C2 events, as sent to the browser) and the reconnect rule |
| C5 | Web modules | `docs/contracts/web.md` | The shell's routing; each module exports `mount(el, params)` and `unmount()`; `web/api.js` client functions (one per C3 route, plus `stream(onEvent)`) |
| C6 | Settings editor | `docs/contracts/web.md` (section "Settings editor") | `createSettingsPanel(el, { settings, readOnly, onChange })` returning `{ get(), set(settings), diff(base) }`; the change-list format |
| Fakes | Contract fakes | `tests/fakes/` | An in-memory `db` (C1) and a fake room manager (C2) and a fake API server (C3) so each stream can test alone |

A contract changes only through the lead: the stream that needs a change reports it, the lead updates the contract and
tells the affected streams.

### Workstreams

| Wave | Stream | Owns (files) | Builds against | Done when |
|---|---|---|---|---|
| 0 | Lead | `docs/contracts/*`, `tests/fakes/*`, `tests/fake-api-server.test.js`, `server/db-common.js`, `server/rooms-common.js`, the stubs `room-rules.js` and `web/rooms.js` (C5 section 1.5), `package.json` scripts, empty `server/` and `web/` folders; GitHub Pages off | – | Contracts reviewed and frozen |
| 1 | Data | `server/db.js`, `tests/db.test.js` | C1 | All C1 functions pass their tests on in-memory SQLite |
| 1 | Rooms | `server/rooms.js`, `server/sim-adapter.js`, `tests/rooms.test.js` | C1 (fake db), C2 | Loops save, resume after restart, apply settings, isolate a crashed room |
| 1 | API | `server/api.js`, `server/static.js`, `server/main.js` (with the real `openDb` and `createRoomManager` wiring), `server/config.js`, `room-rules.js` (shared `normRoom`, `validCalib`, used by the API and later the web modules), `tests/api.test.js`, `tests/stream.test.js`, `tests/config.test.js`, `tests/room-rules.test.js` | C2 (fake rooms), C1 (fake db), C3, C4 | Every route and the stream pass against the fakes; the `server/main.js` stub tests pass (C3 section 12.1) |
| 1 | Web split | `index.html`, `styles.css`, `web/ui.js`, `tests/web-api.test.js`, `tests/settings-diff.test.js`, `web/shell.js`, `web/api.js`, `web/charts.js`, `web/simulator.js`, `web/settings-panel.js`, `web/capacity.js`, `web/calibration.js` (moved code only), `app.js` removed | C5, C6 | Today's features work unchanged behind the menu (headless Chrome), `web/api.js` passes against the fake API |
| 1.5 | Lead: gate | – | C3 section 12.2 | Wave 1 merged; full test suite passes; the real server starts, `Room 1` records a reading, `/` serves the app, Ctrl+C exits cleanly |
| 2 | Rooms UI | `web/rooms.js`, `styles.css` (appends a `/* Rooms */` section only) | C3, C4, C5, C6 | Rooms list and room page with live values, charts, alarms, events, full settings editing, change list, Restore |
| 2 | Capacity and calibration | `web/capacity.js`, `web/calibration.js` | C3, C5, `room-rules.js` | Both modules on the API; browser-storage import; JSON export/import removed |
| 2 | Simulator link | `web/simulator.js` | C3, C6 | Load settings from a room; Save settings to a room with the change list |
| 2 | Docs | `README.md`, `docs/contract.md`, `docs/phase3-plan.md` | All | Install, start, open from a phone, back up; 3.1 and 3.3 marked covered |
| 3 | Lead: integration | – | All | Streams merged; every test (with `tests/api-real.test.js`) and every headless Chrome check re-run on the final merge; the 8 recorded controller runs unchanged |

| Rule | Detail |
|---|---|
| File ownership | Each file has one owning stream in a wave; a stream never edits another stream's files |
| Reviews | Every stream's result gets a spec-compliance review and a code-quality review before the lead merges it |
| Models | Implementers on Sonnet, reviewers on Opus (as in the capacity check) |
| Merging | Wave by wave into `master`; full test suite after each merge |
| Wave 2 branch point | Each wave 2 stream branches from `master` after the wave 1.5 gate and runs its headless Chrome checks against the real server (C5 section 7.10) |

Estimate: about 2 working days: the waves run one after another, the streams inside a wave in parallel.

## Open items

| Item | Owner |
|---|---|
| Which farm device (PC or Pi model) runs the server | User and developer |
| Readings clean-up rule (for example 1-minute averages after 90 days) | Later |
| Coordinate with the developer: this covers work items 3.1 and 3.3 of `docs/phase3-plan.md`, and the streams edit most files | User and developer, before building |

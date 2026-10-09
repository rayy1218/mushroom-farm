# Farm app foundation: design

Date: 2026-10-08. Status: approved; contracts frozen in `docs/contracts/` (lead decisions in `docs/contracts/LEAD-DECISIONS.md`); workstream briefs in `docs/superpowers/plans/2026-10-08-farm-foundation/`. Amended 2026-10-08: the room-centred app and C8 equipment (lead decisions 14–54); wave 2 plan in `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md`. Amended 2026-10-09: the air exchange of C9 (`docs/contracts/air.md`, lead decision 55) is on `master`; wave 2 follows it (schema upgrade 3, reading key `air`, no room `vent`, the machines' air exchange size `air_m3h`).

## Purpose

The project becomes one integrated app for running a mushroom farm. This first sub-project builds the foundation that
every later module plugs into:

| Goal | Result |
|---|---|
| Data in a database, not in the browser or in JSON files | One SQLite file on the farm device holds rooms, settings, readings, events, alarms, calibrations, crop mixes, capacity reports, simulation runs (capacity checks, full cycles and equipment checks, with their hourly prediction) and each room's machines |
| Rooms run 24/7 | A server on the farm device runs each room's control loop in real time and records it, with or without a browser open |
| One app | A room-centred web app: the Rooms home lists every room; each room has the tabs **Live**, **Simulate** and **Calibrate**; the **Test bench** stays as a tool (lead decision 14) |
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
| Simulated room time | Live rooms run in real time on the server. Fast runs (capacity check, full cycle, equipment check, calibration fit, test bench) run in the browser; their results are stored on the server (lead decision 17). |

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
| Fixing the room drawing (fan positions, circulation fan) | Done outside the wave 2 streams and on `master` (merge 4849b67); C9 rewrote it: `mimicLayout({ inletAt, exhaustAt })`, intake fan SF-203 and exhaust fan EF-206 with closed dampers when off (lead decisions 53, 55). No wave 2 stream changes the drawing code. |

## 1. Architecture

```
 phones / laptops on farm Wi-Fi                     farm device (PC or Pi)
 ┌───────────────────────────┐   HTTP + live feed   ┌─────────────────────────────────────┐
 │ Web app (one page, menu)  │ ◄──────────────────► │ server/  (Node 22, no dependencies) │
 │  • Rooms (home)           │                      │  • api: HTTP routes + live feed     │
 │  • Room: Live · Simulate  │                      │  • rooms: one control loop per room │
 │          · Calibrate      │                      │      runtime.js + controller.js     │
 │  • Test bench             │                      │      + adapter (sim now, hw later)  │
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
| Shared modules | `sim.js`, `air.js` (C9), `controller.js`, `runtime.js`, `calib.js`, `capacity.js`, `cycle.js` (C7), `equipment.js` (C8), `room-rules.js`, `harvest-rules.js` (C10: `FarmHarvestRules`, batch and crate validation and yield sums) (in this load order) | They run in both Node and the browser. `air.js` (`ClimateAir`, the air exchange sums) is C9's and not changed in wave 2. Wave 2 changes `sim.js`, `controller.js`, `capacity.js` and `cycle.js` only as C8 section 5 and C9 revision 2 (lead decision 56) say (existing results unchanged except the lead decision 56 controller change) |
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
| `rooms` | Room | `id`, `name`, `volume`, `adapter` (`sim` now), `created_at`, `archived_at` (C9's upgrade 2 dropped the old `vent` column) | Rooms in browser storage |
| `room_settings` | Saved settings version | `id`, `room_id`, `saved_at`, `settings` (JSON text, the controller's settings format), `note` | Settings JSON export and import |
| `calibrations` | Calibration run | `id`, `room_id`, `run_at`, `ua`, `inf_ach`, `moist_buffer`, `co2_per_block`, `rmse_t`, `rmse_rh`, `rmse_co2`, `log_rows`, `applied_at`; upgrade 3: `source`, `log_from`, `log_to`, `equipment` (the machines it was fitted with) | The calibration card's in-memory result |
| `crop_mixes` | Planned crop in a room | `room_id`, `crop`, `blocks`, `co2_per_block` | The capacity card's mix table |
| `capacity_reports` | Capacity check | `id`, `room_id`, `run_at`, `verdict`, `utilisation`, `report` (JSON text). Written by version 1 only; capacity checks are now simulation runs (lead decision 19) | The report in browser storage |
| `simulation_runs` (upgrade 3) | Saved capacity check, full cycle or equipment check | `id`, `room_id`, `created_at`, `kind` (`cycle`, `capacity`, `equipment`), `verdict`, `blocks`, `days`, `kwh`, `rm`, `utilisation`, `real_start`, `note`, `inputs` (JSON), `result` (JSON with the hourly series) | The Simulate results kept in the page |
| `room_equipment` (upgrade 3, C8) | Room | `room_id`, `saved_at`, `ac_hp`, `ac_units`, `fog_lph`, `air_m3h` (the air exchange pair's airflow when on, 50–10000 m³/h), `walls`, `roof`, `height` | Nothing: the simulation had one fixed set of machines (`PLANT`) |
| `batches` (upgrade 4, C10) | Batch | A lot of bought, colonised blocks: crop, strain, source, block count, wet kg per block, moisture, spawn date, received, room and placed date, cleared date, flush gap, notes (C10 3) |
| `harvest_crates` (upgrade 4, C10) | Crate | One crate weighed at the room door: batch, time, kg, picker, undone time (C10 3) |
| `readings` | Sensor reading | `room_id`, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `air` (0/1: the air exchange off or on; C9's upgrade 2), `lights`, `circ`, `power_w`, `kwh`; upgrade 3: `ac_fan` (the AC's own fan speed), `stage`, `core` | Samples kept only while the page is open |
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
| Simulation results | Stored whole, the hourly series included (about 300 KB for the default cycle); runs can be deleted (the only delete in the app) | Predicted vs real needs the series; old plans can be cleared |
| Schema upgrades | Upgrade 2 is C9's (on `master`): it rebuilds `readings` with `air` 0/1 and drops `rooms.vent`. Wave 2 adds upgrade 3: columns and tables only, no table rebuild, one transaction (lead decisions 30, 54, 55); C10 adds upgrade 4: the `batches` and `harvest_crates` tables (`SCHEMA_V4_HARVEST`, lead decision 59). `db.version` is 4 after all. | A version 1 or version 2 file upgrades in place at the first start |

## 3. API and live feed

All bodies are JSON. Errors are `{ "error": "...", "details": [...] }` with HTTP 400 (bad input), 404 (unknown room or run)
or 500 (server fault).

| Method and path | Does | Body or reply |
|---|---|---|
| `GET /api/rooms` | Rooms with live status | `[{ id, name, volume, adapter, live: { reading, stage, crop, targets, status, alarms, running, error, flush, blocks, air } }]` (C3 3.1; `air` is the air exchange for the Live tab, lead decision 27) |
| `POST /api/rooms` | Create a room; its loop starts at once | `{ name, volume, settings? }` → the room (the air exchange size is in the settings, `airM3h`) |
| `PATCH /api/rooms/:id` | Rename, change volume, archive | changed fields → the room |
| `GET /api/rooms/:id/settings` | Current settings | settings |
| `PUT /api/rooms/:id/settings` | Save a new version; the running controller uses it at once | `{ settings, note? }` → `{ settings, warnings }` (validated by `importSettings`) |
| `GET /api/rooms/:id/settings/history` | Earlier versions | `[{ id, saved_at, note }]` |
| `POST /api/rooms/:id/settings/restore/:versionId` | Make an earlier version current (stored as a new version) | → `{ settings, warnings }` |
| `GET /api/rooms/:id/readings?from=&to=&step=` | History; `step` (seconds) averages into buckets; raw rows up to 7 days; with a `step` up to 31 days, or up to 1300 days with a `step` of 1 h or more (C3 6.8) | rows |
| `GET /api/rooms/:id/events?limit=&before=` | Event log, newest first | rows |
| `GET /api/rooms/:id/alarms` | Active and recent alarms | rows |
| `POST /api/rooms/:id/alarms/:alarmKey/ack` | Acknowledge an alarm | → the alarm |
| `GET /api/rooms/:id/calibrations` | Calibration runs | rows |
| `POST /api/rooms/:id/calibrations` | Save a run from the Calibrate tab | fitted values, errors, log size, `source`, `log_from`, `log_to`, `equipment` → the run |
| `POST /api/rooms/:id/calibrations/:runId/apply` | Use a run's values for the room's simulated adapter and its capacity checks | → the run |
| `GET /api/rooms/:id/mix`, `PUT /api/rooms/:id/mix` | The planned crop mix | `[{ crop, blocks, co2_per_block }]` |
| `GET /api/rooms/:id/capacity` | Last capacity report (kept; not used by the web app, lead decision 19) | the report or 404 |
| `POST /api/rooms/:id/capacity` | Save a finished check (kept; not used by the web app) | the report |
| `GET`, `POST /api/rooms/:id/simulations` | List the room's saved runs; save a finished run (it runs in the browser) | `?limit=&before=`; `{ kind, inputs, result, note? }` → the run (C3 6.20, 6.21) |
| `GET`, `PATCH`, `DELETE /api/rooms/:id/simulations/:runId` | One run with its result; change its note or real start; delete it | C3 6.22–6.24 |
| `GET`, `PUT /api/rooms/:id/equipment` | The room's machines (C8); a save also sets the room's settings `airM3h` to the saved `air_m3h` when the two differ (a new settings version: the controller uses it at once, the simulated room at its next restart) | the 7 fields `ac_hp`, `ac_units`, `fog_lph`, `air_m3h`, `walls`, `roof`, `height` → Equipment (C3 6.25, 6.26) |
| `/api/batches`, `/api/batches/:batchId` (with `/place`, `/clear`, `/crates`), `/api/rooms/:id/harvest`, `/api/crates/:crateId` | Batches, crates and a room's harvest today (C10 9; mounted through `createApi(opts.extraRoutes)`, lead decision 62) |
| `GET /api/stream` | Live feed for all rooms (Server-Sent Events) | events `reading`, `event`, `alarm`, `settings`, `room` |

| Topic | Decision |
|---|---|
| Validation | Every body is checked; settings through `importSettings`; crop mixes and reports with the same rules as the capacity card (`normRoom`, `validCalib` move to the shared `room-rules.js`); simulation runs with `checkSimulationRun` and machines with `checkEquipmentBody` (C3 7.6, 7.7) |
| Live feed drop | The browser reconnects by itself and reloads the last minutes from `readings` |
| Access | No login; listens on the farm network address only (no internet exposure) |

## 4. Web app

Replaced 2026-10-08 by the room-centred design (lead decision 14; C5 revision 7).

| Part | Design |
|---|---|
| Shell | `index.html` with a top menu **Rooms · Batches · Test bench** (Batches: C10). Hash addresses: `#/rooms`, `#/rooms/3/live`, `#/rooms/3/simulate`, `#/rooms/3/calibrate`, `#/simulator`. `#/rooms/3` opens the Live tab. |
| Code split | `web/api.js` (server calls, live feed), `web/ui.js`, `web/charts.js`, `web/settings-panel.js`, `web/shell.js` (menu and routing), `web/rooms.js` (Rooms home and the room page frame), `web/room-tabs.js` (tab registry), `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js`, `web/room-equipment.js` (the **Your machines** card, C8), `web/simulator.js` (Test bench) |
| Rooms (home) | A card per room: name, status chip, crop · stage · flush · blocks, T / RH / CO₂ now with status chips, machines, active alarms, "Stopped" with the error and **Restart**. **New room**. One-time **Import rooms from this browser**. A short line explains the loop Live → Calibrate → Simulate. |
| Room page | Header: name, crop · stage · flush, blocks, volume, running or stopped with **Restart**, active alarms. Tabs **Live · Simulate · Calibrate**. |
| Live tab | The IoT dashboard of the room (simulated today, real hardware later): readings now with targets and status, machines with C9's **Air exchange** status card (Idle with the next purge, Purging, Delayed, Safety run), and the purge ladder chip, read from the room's `live.air` (C2 5.2, lead decision 27; the hourly purge bars stay in the Test bench in wave 2), history charts (1 h, 6 h, 24 h, 7 days, from the database), alarms with **Acknowledge**, event log, settings editor with the change list, versions with **Restore**, room details (rename, volume, **Archive**) |
| Settings editor | `web/settings-panel.js` (C6), used by the Live tab and by the Test bench |
| Saving a live room | Unchanged: **Save** shows the change list, the server validates, applies at once and stores a version; warnings are shown |
| Simulate tab | Put in a crop mix (a draft; **Save as this room's crop mix** stores it); the room's applied calibration, current settings (with the air exchange size `airM3h`) and saved machines are used; region and tariff. **Check capacity** (fruiting, three design days, `capacity.js`) or **Run a full cycle** (every stage and flush, `cycle.js`, C7). The run happens in the browser; every finished run is saved on the server. **Saved runs**: open, note, **Compare with real**, delete. **Open test bench** opens the Test bench with this room picked. The **Your machines** card (C8) saves the room's aircond, fogger, air exchange, walls and roof and checks whether they are big enough (a saved run of kind `equipment`); when the room's settings use another air exchange size it says so, and saving the machines brings the settings in step. |
| Calibrate tab | **Fit from this room's history**: pick up to 7 days, the app replays the recorded readings in its virtual room and fits four room values (`calib.js`), with the room's own machines when they are saved (C8), the room's air exchange size (settings `airM3h`) and the typical sun; **Save and apply** makes the room's simulation and every later Simulate run use them. A calibration records the machines it was fitted with, and the tab warns when the room's machines changed since (lead decision 50). A log file (CSV) stays as a second source for a room not connected to the app. **Predicted vs real**: a saved full cycle laid over the room's real readings from the cycle's real start date, with the average difference. |
| Test bench | Today's Simulator (fast test bench): **Load settings from room**, **Save settings to room**, `#/simulator/:id` picks a room; it simulates the typical machines (`PLANT`) in wave 2, also when opened from a room, with its own **Air exchange size** input (C9 7). The room drawing (fixed on `master`, rewritten by C9) is not changed in wave 2 (lead decision 53). |
| Moving from the old pages | Capacity → Simulate tab; Calibration → Calibrate tab; the browser-storage import → Rooms home. The menu entries Capacity and Calibration are removed; their old addresses open Rooms. |
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
| Existing tests (93 when this spec was written; 672 on `master` bd24755) | Nothing broke, except the 2 tests that assert the old CO₂ ramp, rewritten or dropped for lead decision 56 (C9 revision 2) |
| The 9 recorded controller runs in `tests/vectors/` (8 regenerated by C9, plus C9's `capped-purges`) | 8 vectors byte-identical, `stage-changes.json` regenerated (lead decision 56), plus `cool-crop.json` (10) (C8's cool-crop rule acts only for a `cool` crop) |
| `tests/db.test.js` | Schema creation, upgrades, queries, on in-memory SQLite |
| `tests/rooms.test.js` | A room loop saves readings, events and alarms; resumes after a restart from saved state; applies new settings |
| `tests/api.test.js` | Each route against a real HTTP server on a random port with the C1 and C2 fakes: success, 400, 404 (C3 section 12) |
| `tests/api-real.test.js` | Each route once more against the real database (temporary file) and room manager, in wave 3 (C3 section 12.2) |
| `tests/config.test.js`, `tests/room-rules.test.js` | The configuration rules and the shared room rules (C3 section 12) |
| `tests/stream.test.js` | The live feed delivers readings and alarms |
| `tests/db.test.js`, upgrade 3 | Upgrades 2 and 3 from a version 1 file, and upgrade 3 from a version 2 file; simulation runs, room equipment, the new reading and calibration fields (C1 revision 6) |
| `tests/web-rooms.test.js`, `tests/web-room-live.test.js`, `tests/web-room-simulate.test.js`, `tests/web-room-calibrate.test.js`, `tests/web-room-link.test.js`, `tests/web-room-equipment.test.js` | The pure parts of the room files and the Test bench link (C5 7.10) |
| `tests/equipment.test.js`, `tests/sim.test.js`, `tests/web-settings-panel.test.js` | The equipment check, the machines and heat flows in the simulation, the lion's mane option (C8 14) |
| Headless Chrome checks | Each module loads without errors; the Rooms home and each room tab against the real server; a full cycle saved and compared; a history fit saved and applied; the machines saved and checked; a settings change with the change list and Restore works; the browser-storage import works |

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
| C5 | Web modules | `docs/contracts/web.md` | The shell's routing (routes `#/rooms/:id/<tab>`); each module exports `mount(el, params)`, `unmount()` and optionally `update(params)`; the room page frame and the tab interface (`web/room-tabs.js`); `web/api.js` client functions (one per C3 route, plus `stream(onEvent)`) |
| C6 | Settings editor | `docs/contracts/web.md` (section "Settings editor") | `createSettingsPanel(el, { settings, readOnly, onChange })` returning `{ get(), set(settings), diff(base) }`; the change-list format |
| C7 | Crop cycle simulation | `docs/contracts/cycle.md` (revision 3; the lead freezes it with wave 2) | `cycle.js`: one whole crop cycle per room and mix; the room's air exchange size `room.airM3h`; `room.plant`, `opts.heat`, the per-stage wet line |
| C8 | Equipment check | `docs/contracts/equipment.md` | `equipment.js`: the room's machines, the aircond size search, the air exchange verdict (`AIR_SIZES`), verdicts and heat breakdown; the changes to `sim.js`, `controller.js`, `capacity.js`, `cycle.js`; lion's mane |
| C9 | Air exchange | `docs/contracts/air.md` (revision 1 frozen, on `master`; revision 2, wave 2: a lower CO₂ limit applies at once at a stage change, with one uncapped purge, lead decision 56) | `air.js` (`ClimateAir`): an intake fan and an exhaust fan that run together as short CO₂ purges; the reading key `air`, upgrade 2, no room `vent`; the sections of C1–C7 it overrides (C9 10) |
| C10 | Batches and harvest by room QR | `docs/contracts/harvest.md` (folded into wave 2 by the owner's decision of 2026-10-09; lead decisions 59–68; spec `docs/superpowers/specs/2026-10-09-harvest-qr-design.md`) | `harvest-rules.js`, `server/harvest-db.js` (upgrade 4), `server/harvest-api.js` (routes through `createApi(opts.extraRoutes)`), the Batches pages, the phone page `#/harvest/:id` and the stickers page |
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
| 2.0 | Lead: prep | The frozen contracts (C1 revision 6, C2 revision 9, C3/C4 revision 9, C5/C6 revision 8, C7 revision 3, C8 revision 3, C9 revision 2), the fakes (with `/air.js`, `/cycle.js`, `/equipment.js` served by the fake API server), `index.html` (C5 1.2), the `FarmApi` additions, `web/room-tabs.js`, the three tab stubs, the `equipment.js` stub, C10's harvest files (`harvest-rules.js`, the vendored QR encoder, the harvest schema, `server/api-common.js`, stubs and fakes), the wave 2 briefs | All | `npm test` green on `master`; the wave 2 start checks pass (wave 2 plan) |
| 2 | Data 2, Equipment, Server 2, Room shell, Live tab, Simulate tab, Calibrate tab, Bench, Docs, Harvest data, Harvest API, Harvest web (twelve) | One owner per file: the streams table of `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | C1–C10 | Each stream's done-when of the wave 2 plan |
| 2.5 | Lead: gate | – | C3 section 12.2 | Data 2, Equipment, Server 2, then Harvest data and Harvest API merged and `server/main.js` wired (C10 8.4); `npm test` green; the real server upgrades a version 1 and a version 2 database file (upgrades 2, 3 and 4) and `Room 1` records readings with the new keys; the web streams' real-server checks then run |
| 3 | Lead: integration | – | All | Streams merged in the order of the wave 2 plan; the lead deletes `web/capacity.js`, `web/calibration.js` and `FarmBench` (after pointing `tests/web-mimic.test.js` at the Node export of `mimicLayout`, which the Bench stream adds), updates `tests/web-load.test.js` and `tests/web-bench.test.js`, and writes `tests/api-real.test.js` with the simulation and equipment routes; every test and every headless Chrome check re-run on the final merge; the recorded controller runs: 8 vectors byte-identical, `stage-changes.json` regenerated (lead decision 56), plus `cool-crop.json` (10) |

| Rule | Detail |
|---|---|
| File ownership | Each file has one owning stream in a wave; a stream never edits another stream's files |
| Reviews | Every stream's result gets a spec-compliance review and a code-quality review before the lead merges it |
| Models | Implementers on Sonnet, reviewers on Opus (as in the capacity check) |
| Merging | Wave by wave into `master`; full test suite after each merge |
| Wave 2 branch point | Each wave 2 stream branches from `master` after prep 2.0; the web streams run their headless Chrome checks against the real server after gate 2.5 (C5 section 7.10) |

Estimate: about 2 working days: the waves run one after another, the streams inside a wave in parallel.

## Open items

| Item | Owner |
|---|---|
| Which farm device (PC or Pi model) runs the server | User and developer |
| Readings clean-up rule (for example 1-minute averages after 90 days) | Later |
| Coordinate with the developer: this covers work items 3.1 and 3.3 of `docs/phase3-plan.md`, and the streams edit most files | User and developer, before building |

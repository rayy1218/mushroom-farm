# Contract C5 and C6: web modules and settings editor

Date: 2026-10-08. Status: **draft** (revision 8, not frozen; the lead freezes it with wave 2). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`.
(sections 4, 5 and 6). Related contracts: C3 and C4 (`docs/contracts/api.md`) define every resource, route, status code and
stream payload. This file does not repeat them. Where it names a C3 resource (Room, Reading, Event, Alarm,
SettingsVersion, Calibration, MixRow, CapacityReport), C3's JSON is used unchanged. C10 (`docs/contracts/harvest.md`,
batches and harvest by room QR) defines the harvest resources (Batch, BatchDetail, Crate, RoomHarvest, CrateSaved),
routes and pages in the same way; this file holds only the C10 14 lines of C5.

### Changes in revision 8

Wave 2 moved onto C9, the air exchange (`docs/contracts/air.md`, frozen, lead decision 55; its section 10 lists the C5 sections it overrides, with C9 7 as the new text), plus the freeze check findings for this file. Upgrade 2 is now C9's; wave 2's schema is upgrade 3. It also folds in C10's requests to C5 (C10 14; owner decision 2026-10-09, lead decisions 59–68): the rows below that name C10.

| Section | Change |
|---|---|
| Header | Status draft, revision 8 |
| 1.1 | `index.html`: wave 2 owner the lead in prep 2.0, then nobody (finding 2). New rows `air.js` (C9 3, nobody in wave 2), `tests/web-load.test.js` and `tests/web-bench.test.js`, `tests/web-air.test.js` and `tests/web-mimic.test.js` (nobody in wave 2). `web/simulator.js`: Bench does not change the mimic or C9's air card code; the fake's served files gain `/air.js`, `/cycle.js`, `/equipment.js` (findings 3, 19) |
| 1.2 | The lead writes `index.html` in prep 2.0 (finding 2); script tag `air.js` after `sim.js` (C9 7) |
| 1.3 | `air.js` is script 2; `capacity.js` needs `ClimateAir` at load; `equipment.js` reads `ClimateAir` and the run modules only at call time; `room-rules.js` reads `ClimateEquipment` only inside `checkEquipmentBody`, `checkCalibration`, `checkSimulationRun`, never at load (finding 4) |
| 1.7 | New `index.html` row (finding 2); the `equipment.js` stub has `AIR_SIZES` and no `FAN_MIN_ACH` (C9 10 row C8); the fake's file list adds `/air.js`, `/cycle.js`, `/equipment.js` (findings 3, 19); the start check greps `index.html`; the `web/room-equipment.js` tag gives a 404 until gate 2.5 |
| 3.2, 3.3 | The Test bench shows C9 7's air exchange; the rules card is **Air exchange and CO₂**; the bars are `drawPurgeBars`; the room drawing is C9's (C9 10 rows 3.2, 3.3) |
| 3.4 | The Reading's air exchange is `On` / `Off` (`r.air`); new table "Air exchange on the Live tab": status card, glance row and ladder chip from C2 `live.air` (lead decision 27 as amended); `drawPurgeBars` stays in the Test bench (C9 10 row 3.4) |
| 3.5 | Member `FarmBench.mimicLayout` (C9 7) until wave 3 |
| 3.6 | No `vent`; `envBase.airM3h` = the room's settings `airM3h`; the Calibrate tab loads `getSettings` (C9 10 row 3.6, C9 4.1) |
| 3.7 | `normRoom` keeps no air key (C9 6.3; C9 10 row 3.7) |
| 3.8 | **New room** and the header info have no `vent` (C9 6.1) |
| 3.9 | "Headless checks of one tab": the gate 2.5 tree's prep 2.0 `index.html` loads every script, the tab is mounted by hand, no script injection, no layout assertion (findings 13, 2) |
| 3.10 | `room.airM3h` = settings `airM3h`; `inputs.calibration` exactly `{ id, ua, inf_ach, moist_buffer, co2_per_block }`, the air size in `inputs.settings.airM3h` (finding 17); machines line `air_m3h`; stream `settings` events; Saved runs: Result chip `info.verdict`, equipment Energy `–` (findings 5, 16); Node tests record `plantOf` (finding 22) |
| 3.11 | `sameMachines` with `air_m3h`; "before upgrade 3"; `envBase.airM3h`; the `PARAMS.ua` note only when a string, and `replay` ignores `stage` before the Bench merge (finding 15); Comparison `base: { series }` and no request for a future start (finding 9); log row `air` from `r.air` (C9 8); Node tests record `plantOf` (finding 22) |
| 3.8 (delta review M6) | Home card status-chip precedence (Stopped > alarms > Out of band > All good) and levels; `#rpAlarms` texts; crop and stage by name in `p.rc-crop` and `#rpInfo`; the home card's air line. |
| 3.8, 3.4, 3.10, 3.11, 6.2 (buildability check) | `.room-air` (Live air card and glance row) and `.cal-charts` (each `drawCalibCharts` host) join the Room shell's CSS block; the Simulate slot is `div.contents[data-slot="equipment-check"]`. |
| 3.10, 3.12, 7.10 (buildability minors) | Saved runs chip table; `machinesText`, `machineRows`, `runRows` texts and the thousands separator; `airNote(a, b)` with `a` `null`; `airLive(null)`; the Calibrate headless range covers readings seeded 2 h back; the Simulate headless check seeds an equipment run; from prep 2.0 until the Room shell merges, `#/rooms` on `master` shows the stub's "not installed" (expected). |
| 3.12 (lead decision 58) | The report's air exchange row also shows the verdict `oversized`. |
| 3.12 | Field `#eqAir` "Air exchange (m³/h)" for `air_m3h`, 50–10000; the air size note; a save keeps the settings' `airM3h` in step (C3 6.26); Progress kind `air`; report row "air exchange" (key `air`); helpers `formValues` order and `airNote` |
| 4.3 | `createRoom`, `updateRoom` without `vent`; `listRooms` `live.air`; `saveEquipment` with `air_m3h` and the settings sync; mapping rows for `airM3h` |
| 4.5 | The served shared modules include `/air.js`, `/cycle.js`, `/equipment.js` (findings 3, 19) |
| 6.1, 6.2 | Power key `air`; `aggregate` averages `air`; `drawPurgeBars(host, hours, clock)` replaces `drawExhaustBars`; `createLadder` chips `{ air }`, one row `Purge`; `drawCalibCharts` reads `base.series` (finding 9) (C9 10 rows 6.1, 6.2) |
| 7.2, 7.3, 7.4, 7.5 | Command `air: { on }`; card **Air exchange and CO₂** with three fieldsets; Machines card device `air` with `airOnChk`; the corrections, bumpless transfer and visibility rules of C9 (C9 10 rows 7.2, 7.3, 7.4) |
| 7.7 | Rows follow C9 7.1: `airM3h`, `rules.fanOn` / `fanOff` labels, `rules.purgeMaxS`, `rules.minOffS`, `manual.air.*`; the removed keys' rows and the AC pair are gone; the list of settings without a control follows `master` (C9 10 row 7.7) |
| 7.8 | Ramp paths are C9's `RAMP_KEYS`; new `airM3h` row; event name `Air exchange`; the `PARAMS.ua` note text (finding 15); Node export `{ createRoomLink, airText, mimicLayout }`; the room drawing is C9's; `createRoomLink(deps)`, its members, steps and page wiring (finding 26) (C9 10 row 7.8) |
| 7.9 | Command `air.on` from `r.air === 1`; the ladder chip from `live.air` (C9 10 row 7.9) |
| 7.10 | No temporary-folder path; tab checks follow 3.9 (finding 13); fake file test row (finding 3); Live tab check stands in for the frame (finding 27) and checks the air card; Simulate check (findings 5, 16, 17); Calibrate check (findings 9, 15, 22); Bench check mounts with `{ roomId: 1 }` and leaves `#/simulator/1` to wave 3 (finding 14); Equipment check of the air size sync (C9 10 row 7.10) |
| Header, Terms (C10 14, lead decisions 59, 60) | C10 (`docs/contracts/harvest.md`) is folded into wave 2; modules `batches` (menu **Batches**) and `harvest` (no menu link of its own) |
| 1.1 (C10 14, lead decisions 59, 60, 65) | New rows `harvest-rules.js` (`FarmHarvestRules`), `web/vendor/qrcodegen.js` (`qrcodegen`), `web/batches.js`, `web/harvest.js`, `web/harvest.css` (C10 2); `index.html`, `web/api.js`, `web/shell.js`, `tests/fakes/api-server.js` rows name their C10 lines |
| 1.2 (C10 14, lead decision 60) | `index.html` adds the `web/harvest.css` link after `styles.css`, the menu link **Batches** between Rooms and Test bench, and four script tags: `harvest-rules.js` after `room-rules.js`, `web/vendor/qrcodegen.js` after `web/settings-panel.js`, `web/batches.js` and `web/harvest.js` after `web/room-calibrate.js` |
| 1.3 (C10 14, lead decision 60) | Rows for the four scripts (25 scripts): `harvest-rules.js` needs `ClimateController`; `web/batches.js` and `web/harvest.js` need `FarmShell` at load |
| 1.4 (C10 2, lead decision 60) | `web/vendor/qrcodegen.js` is vendored unchanged: no 1.4 wrapper; Node tests load it with `node:vm` |
| 1.7 (C10 14, lead decision 60) | Prep 2.0 adds `harvest-rules.js`, `web/vendor/qrcodegen.js` and the stubs `web/batches.js`, `web/harvest.js`, `web/harvest.css`; the fake serves `/harvest-rules.js` and answers `GET /api/batches` with `[]`; the start check lists the three stubs |
| 2.1, 2.2, 2.3 (C10 14, C10 11, lead decision 66) | Routes `#/batches`, `#/batches/:id`, `#/harvest/stickers`, `#/harvest/:id`; `register` accepts `batches` and `harvest`; `MENU_NAMES` adds `batches: 'Batches'`, `harvest: 'Harvest'`; menu marking per route; the bare layout (`body[data-layout="bare"]` on `#/harvest/:id`) at step 5 |
| 3.1 (C10 11, lead decision 66) | `data-layout` on `document.body` is the shell's; modules still never touch `document.body` |
| 3.2 (C10 14, C10 12) | Module rows `batches` and `harvest` |
| 3.8 (C10 14, lead decisions 32, 65) | `styles.css` stays the Room shell's (lead decision 32); `web/harvest.css` is the Harvest web stream's own stylesheet |
| 4.1, 4.3 (C10 14, C10 12.1) | The ten harvest functions (lead, prep 2.0, tested in `tests/web-api.test.js`); batch and crate ids in the path; `state` is the one query value that is a string |
| 4.5 (C10 14, lead decision 60) | `GET /api/batches` answers `[]` by default; `/harvest-rules.js` is one of the served shared modules |
| 7.10 (C10 14, C10 13, lead decisions 59, 66) | Rows for the lead's prep 2.0 additions and the Harvest web checks; the Room shell check covers the four routes, the menu link **Batches** and the bare layout. The Harvest web headless check mounts its views by hand on the gate 2.5 tree (the Room shell's `web/shell.js` merges in wave 3); the addresses and the bare layout through the shell are the lead's wave 3 check |

### Changes in revision 7

The room-centred app (owner correction, lead decision 14) and C8 equipment, frozen together with C1 revision 5, C2 revision 8, C3 revision 8, C7 revision 2 and C8 (`docs/contracts/equipment.md`). Lead decisions 14–32, 35, 47–53. Wave 2 plan: `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md`.

| Section | Change |
|---|---|
| Terms | Modules are `rooms` and `simulator` (menu name **Test bench**); new term "Tab": `live`, `simulate`, `calibrate`. |
| 1.1 | Wave 2 owners: Room shell, Live tab, Simulate tab, Calibrate tab, Bench, Equipment, and the lead's prep 2.0 files. `web/capacity.js` and `web/calibration.js` are no longer loaded (the lead deletes them in wave 3, lead decision 29). |
| 1.2, 1.3 | Menu **Rooms · Test bench**; script tags add `cycle.js`, `equipment.js`, `web/room-tabs.js`, `web/room-live.js`, `web/room-equipment.js`, `web/room-simulate.js`, `web/room-calibrate.js`, and drop `web/capacity.js`, `web/calibration.js`. |
| 1.4, 1.7 (new) | `web/room-tabs.js` defines `FarmRoomTabs`; tab files define no global. Prep 2.0 files and the start check. |
| 2.1–2.3 | Routes `#/rooms/:id/<tab>`, `#/rooms/:id/calibrate/:runId`, `#/simulator/:id`; `#/capacity`, `#/calibration` go to `#/rooms`; a module may offer `update(params)` (lead decision 15). |
| 3.1, 3.2, 3.3 | `update(params)`; two modules; table "Room-centred moves". |
| 3.4 | "Live tab data flow": the header moves to the frame (3.8); the tab gets its events from the tab context; ChartPoint adds `core`. |
| 3.5 | `FarmBench` is no longer used by loaded code from wave 2 on; the lead deletes it in wave 3. |
| 3.6 | The fit input is used by the Calibrate tab (3.11): the page's room, `blockStage` from the log rows, `plant` from the room's machines, the body adds `source`, `log_from`, `log_to`, `equipment`. |
| 3.7 | The Capacity module is not loaded from wave 2 on; `sameMix` and the one-time import table stay binding (the import moves to the Rooms home). |
| 3.8–3.12 (new) | Rooms home and room page frame; tab registry and context; Simulate tab; Calibrate tab; the **Your machines** card (C8). |
| 4.3, 4.5 | `FarmApi` adds `listSimulations`, `createSimulation`, `getSimulation`, `updateSimulation`, `deleteSimulation`, `getEquipment`, `saveEquipment` (lead, prep 2.0); fake defaults for the new routes. |
| 6.2 | `drawCalibCharts` takes optional `labels` and `dashed` (Predicted vs real). |
| 7.1, 7.7, 7.8, 7.9 | The panel serves the Test bench and the Live tab; `inCrop` lists lion's mane (C8 5.4.3, lead decision 47); `#/simulator/:id`; the Test bench uses `PLANT` machines in wave 2; `program-status` shows the flush. |
| 7.10 | Wave 2 checks per stream; real-server checks run after gate 2.5. |

### Changes in revision 6

| Section | Change |
|---|---|
| 1.1, 1.6 | New section 1.6: the exact wave 0 files the web streams rely on (`room-rules.js` stub, `web/rooms.js` stub, `tests/fakes/api-server.js`, `tests/fake-api-server.test.js`), the lead's wave 0 check `ls tests/fakes/api-server.js tests/fake-api-server.test.js web/rooms.js room-rules.js`, and the names no brief may use (`tests/fakes/api.js`, `tests/fake-api.test.js`). The briefs that disagree (lead-fakes Task 10, web-split, simulator-link, capacity-calibration) are regenerated from the frozen contracts before dispatch. 1.1 gains a row for `tests/fake-api-server.test.js`. No change to C3 (its 2.1 and 2.3 already use these names). |
| 3.4, 3.2 | The `listRooms()` refresh after a `reading` event is required of the Rooms UI, and its one timer is the only timer the Rooms module keeps for data. A brief that says "no polling" or "no polling timer" is wrong on this point (rooms-ui.md is regenerated). |
| 3.3 | **Download a sample log (last 24 h)** in the Simulator only downloads the CSV; it no longer loads the rows into the calibration card (today's `calLoad(rows, 'Sample log from the simulation')`), because that card is in the Calibration module. The user loads the file there with its file input. The "fewer than 60 rows" message goes to a new `span.tag#calSampleMsg` beside the button. |
| 4.5, 7.10 | `startFakeApi` takes an optional `root`: when given, a `GET` or `HEAD` outside `/api/` serves files from `root` with C3 section 9's rules, so a headless check can open the page against the fake. The fake then also requires `node:fs` and `node:path`. New 7.10 row: Rooms UI **Restart** against the fake (a stopped room with `live.error`, the button, `POST /api/rooms/1/restart`, the returned Room replaces the card). |
| 7.7 | `rules.fanOff` and `rules.acOn` are held in 400–19950 (were 400–20000), so the pair rule (`fanOn` = max(`fanOn`, `fanOff` + 50), `acOff` = max(`acOff`, `acOn` + 50)) never writes a value above `importSettings`' limit of 20000. The 7.7 intro now covers the values a pair rule writes. |

### Changes in revision 5

| Section | Change |
|---|---|
| 3.2, 3.4, 7.10 | Corrected: a `room` event is sent only when C2's summary (`stage`, `crop`, `alarms`, `running`, `error`) changes (lead decision 2, C2 section 7, C3 section 10.2); a change of `live.targets` or `live.status` alone sends none, and a `reading` event carries only the Reading. New rule: after a `reading` event, the Rooms list and the room page call `listRooms()` again, at most once per 30 s per page, and take `live.status` and `live.targets` from the reply. No change to C2, C3 or the lead decisions. New Rooms UI headless check: a status chip changes after a reading that moves T out of band. |
| 1.1, 1.5, 7.10 | New wave 0 lead stub `web/rooms.js` (registers nothing), so wave 1 has no 404; the Rooms UI stream replaces it in wave 2. The wave 1 headless check opens `index.html` over `file://` or a throwaway static server. |
| 1.2 | The three Google Fonts `<link>` elements are removed: the app loads nothing from the internet (spec: no internet needed). |
| 4.5 | The fake's own test is `tests/fake-api-server.test.js`. |
| 7.5 | `formatValue` prints a number as `String(+value.toFixed(6))`, so ramp values such as `20.200000000000003` show as `20.2`. |
| 7.6 | The `showChanges` note field has `maxlength="200"` and the dialog resolves the trimmed note, so every note meets C3 6.5's 200-character rule. |

### Changes in revision 4

| Section | Change |
|---|---|
| 1.1, 4.5, 7.10 | The fake API server is `tests/fakes/api-server.js`, written by the lead in wave 0, requiring only `node:http` (lead decision 7). |
| 7.6, 7.8, 7.9 | New `FarmSettingsPanel.safeSettings`: settings from HTTP go through `ClimateController.importSettings` before the Simulator applies them (lead decision 6). The room page never calls `applySettings`. |
| 3.4, 4.4, 7.9 | Reconnect (after a drop, an error or the 45 s watchdog) reloads the last minutes of readings as C4 section 10.4 (lead decision 4); a settings reload keeps unsaved edits. |
| 3.2, 3.4 | Readings are read with the C1/C3 keys (`T`, `RH`, `CO2`, `t_out`, …; lead decision 1). `room` events come from C2 and are relayed unchanged by C3 (lead decision 2). |
| 3.7, 7.10 | Open questions decided: the Capacity check uses the default tariff; a failed import keeps the rooms it created; `capVolume` and `capVent` stay; wave 2 headless checks run against the real server of the merged wave 1 code. |

| Term | Meaning |
|---|---|
| Settings | The controller's settings object, in the format of `ClimateController.defaultSettings()` (no file wrapper) |
| Unix time | Integer seconds since 1970-01-01 00:00 UTC. All API times are Unix time. |
| Simulation time | Seconds since the start of a Simulator run (the `t` of `sim.js` and `controller.js`). Not Unix time. |
| Farm time | Malaysia time, UTC+8, no daylight saving. The page shows every Unix time in farm time. |
| Module | One part of the app registered with the shell: `rooms`, `batches` (menu name **Batches**, C10), `simulator` (menu name **Test bench**), and `harvest` (C10: the phone page and the stickers page; no menu link of its own, 2.1). Revision 6 also had `capacity` and `calibration`; from revision 7 their parts are room tabs (3.3, "Room-centred moves") |
| Tab | One view of a room page: `live`, `simulate`, `calibrate` (section 3.9) |

---

## 1. Files and loading (C5)

### 1.1 Files

| File | Global it defines | Owner (wave 0) | Owner (wave 1) | Owner (wave 2) | Content |
|---|---|---|---|---|---|
| `index.html` | – | – | Web split (C9 step 0: the lead added `air.js`) | Lead (prep 2.0, exactly 1.2, C10's lines included: lead decision 60), then nobody | The shell markup and the script tags (1.2). No module markup. |
| `styles.css` | – | – | Web split | Room shell (appends one `/* Room page */` block only, lead decision 32) | Today's styles plus the menu, `.contents`, `dialog` and Machines card styles; from wave 2 every class the room files and the Equipment card use (3.8). The harvest classes are in `web/harvest.css`, not here (lead decision 65) |
| `web/harvest.css` | – | – | – | Lead (prep 2.0 stub: one comment line), then Harvest web (replaces it; lead decision 65) | C10 12.2: every `.bt-*`, `.bd-*`, `.hv-*`, `.st-*` class, the bare layout rule (`body[data-layout="bare"] .bar` hidden, 2.3 step 5) and the print rules of C10 12.5 |
| `room-rules.js` | `ClimateRoomRules` | Lead (stub, 1.5) | API (replaces the stub; exports in C3 section 7.1) | Server 2 (C3 7.6, 7.7) | Shared room, mix, calibration, simulation run and equipment rules. The web modules only read it. |
| `harvest-rules.js` | `FarmHarvestRules` | – | – | Lead (prep 2.0, the real file, C10 plan task 0.2), then nobody | C10 4: batch and crate rules, flushes, totals. Shared by the server and the page; the web modules only read it. |
| `air.js` | `ClimateAir` | – | Lead (C9 step 0, on `master`) | nobody (frozen C9) | C9 section 3 |
| `cycle.js` | `ClimateCycle` | – | Cycle stream (C7) | Equipment (C7 revision 3, C8 5.3) | Loaded by the page from wave 2 |
| `equipment.js` | `ClimateEquipment` | – | – | Lead (prep 2.0 stub, 1.7), then Equipment (replaces it) | C8 |
| `sim.js`, `controller.js`, `capacity.js`, `tools/make-vectors.js` | `ClimateSim`, `ClimateController`, `ClimateCapacity`, – | – | – | Equipment | C8 5.1, 5.4, 5.2; one new recorded run |
| `web/ui.js` | `FarmUi` | – | Web split | nobody | Formatting and small DOM helpers moved from `app.js` (section 5) |
| `web/api.js` | `FarmApi` | – | Web split | Lead (prep 2.0, the 4.3 additions, the ten C10 12.1 functions included), then nobody | One function per C3 and C10 route, and `stream` (section 4) |
| `web/charts.js` | `FarmCharts` | – | Web split | Calibrate tab (the 6.2 `drawCalibCharts` options only) | The charts moved from `app.js` (section 6) |
| `web/settings-panel.js` | `FarmSettingsPanel` | – | Web split (C9's air fields are on `master`) | Equipment (the one `#inCrop` lion's mane option only, lead decision 47) | The settings editor (section 7, C6) |
| `web/vendor/qrcodegen.js` | `qrcodegen` | – | – | Lead (prep 2.0, vendored, C10 plan task 0.3), then nobody | Project Nayuki QR Code generator (MIT), pinned commit 3c6d0b3, compiled once; not edited (1.4) |
| `web/shell.js` | `FarmShell` | – | Web split | Room shell (with C10 11: the four harvest routes, the two module names, the bare layout; lead decision 66) | Menu, routing, settings level, theme, layout (section 2) |
| `web/room-tabs.js` | `FarmRoomTabs` | – | – | Lead (prep 2.0, the real file), then nobody | Tab registry (3.9) |
| `web/rooms.js` | – (registers `rooms`) | Lead (stub, 1.5) | nobody (no wave 1 stream creates or changes it) | Room shell (replaces the stub) | Rooms home and room page frame (3.8) |
| `web/room-live.js` | – (registers tab `live`) | – | – | Lead (prep 2.0 stub), then Live tab (replaces it) | 3.4, 7.9 |
| `web/room-simulate.js` | – (registers tab `simulate`) | – | – | Lead (prep 2.0 stub), then Simulate tab (replaces it) | 3.10 |
| `web/room-calibrate.js` | – (registers tab `calibrate`) | – | – | Lead (prep 2.0 stub), then Calibrate tab (replaces it) | 3.6, 3.11 |
| `web/room-equipment.js` | `FarmEquipmentCard` | – | – | Equipment | The **Your machines** card (3.12, C8) |
| `web/batches.js` | – (registers `batches`) | – | – | Lead (prep 2.0 stub, 1.7), then Harvest web (replaces it) | The Batches pages (C10 12.3; helpers C10 12.2) |
| `web/harvest.js` | – (registers `harvest`) | – | – | Lead (prep 2.0 stub, 1.7), then Harvest web (replaces it) | The phone page and the stickers page (C10 12.4, 12.5; helpers C10 12.2) |
| `web/simulator.js` | `FarmBench` (waves 1 and 2 only, section 3.5) | – | Web split | Bench (not the room drawing `mimicLayout` and not C9's air exchange card code) | Today's test bench (the Test bench); room link (7.8), `#/simulator/:id`, the calibration event text, the Node export of 7.8 |
| `calib.js` | `ClimateCalib` | – | – | Bench | `PARAMS.ua` label and note (lead decision 28), `stage` per row in `replay` (3.11) |
| `web/capacity.js` | – (registers `capacity`) | – | Web split | nobody (no longer loaded by `index.html`) | Today's capacity card; deleted by the lead in wave 3 (lead decision 29) |
| `web/calibration.js` | – (registers `calibration`) | – | Web split | nobody (no longer loaded by `index.html`) | Today's calibration card; deleted by the lead in wave 3 |
| `tests/fakes/api-server.js` | – (CommonJS export `startFakeApi`) | Lead | nobody | Lead (prep 2.0) | The fake API server (section 4.5); prep 2.0 adds `/air.js`, `/cycle.js`, `/equipment.js`, `/harvest-rules.js` to its served files and the `GET /api/batches` default `[]` (4.5) |
| `tests/fake-api-server.test.js` | – | Lead | nobody | Lead (prep 2.0) | The fake API server's own test (section 4.5) |
| `tests/web-load.test.js`, `tests/web-bench.test.js` | – | – | Web split | nobody (the lead in wave 3, lead decision 29) | They load `room-rules.js` without `cycle.js` and `equipment.js` (1.3 row 9) |
| `tests/web-air.test.js`, `tests/web-mimic.test.js` | – | – | Web stream (C9) | nobody (the lead in wave 3 if a merge needs it) | C9's `airText` and `mimicLayout` tests |
| `tests/harvest-rules.test.js`, `tests/qrcodegen.test.js` | – | – | – | Lead (prep 2.0), then nobody | C10 13 |
| `tests/web-batches.test.js`, `tests/web-harvest.test.js` | – | – | – | Harvest web | C10 13 (7.10) |
| `app.js` | – | – | Web split (deletes it) | – | Removed |

### 1.2 index.html

The page is the shell only. Each module builds its own markup inside `<main id="view">` when it mounts. The lead writes this file exactly as below in prep 2.0 (revision 8; it was the Room shell's in revision 7), and no wave 2 stream changes it: the menu has **Rooms**, **Batches** and **Test bench**; the script tags are those of 1.3 (`web/capacity.js` and `web/calibration.js` are no longer loaded; `air.js` is on `master` from C9).

| C10 line (C10 14, lead decision 60) | Place |
|---|---|
| `<link rel="stylesheet" href="web/harvest.css">` | After the `styles.css` link |
| `<a href="#/batches" data-module="batches">Batches</a>` | Menu, between Rooms and Test bench |
| `<script src="harvest-rules.js"></script>` | After `room-rules.js` |
| `<script src="web/vendor/qrcodegen.js"></script>` | After `web/settings-panel.js` |
| `<script src="web/batches.js"></script>`, `<script src="web/harvest.js"></script>` | After `web/room-calibrate.js`, before `web/simulator.js` |

The app loads nothing from the internet (spec: no internet needed). The three Google Fonts `<link>` elements of
today's `index.html` (two preconnects and the stylesheet) are removed; the `font-family` lists in `styles.css`
(`--font-body`, `--font-cond`, `--font-mono`) already fall back to system fonts.

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mushroom farm</title>
<link rel="stylesheet" href="styles.css">
<link rel="stylesheet" href="web/harvest.css">
</head>
<body data-level="farmer">
<header class="bar">
  <div><h1>Mushroom farm</h1></div>
  <nav class="menu" id="menu" aria-label="Main menu">
    <a href="#/rooms" data-module="rooms">Rooms</a>
    <a href="#/batches" data-module="batches">Batches</a>
    <a href="#/simulator" data-module="simulator">Test bench</a>
  </nav>
  <div class="spacer"></div>
  <div class="seg level-seg" role="group" aria-label="Settings level" id="levelSeg">
    <button data-level="farmer" aria-pressed="true">Farmer</button><button data-level="installer" aria-pressed="false">Installer</button>
  </div>
  <button class="btn" id="themeBtn">Dark theme</button>
</header>
<main id="view"></main>
<script src="sim.js"></script>
<script src="air.js"></script>
<script src="controller.js"></script>
<script src="runtime.js"></script>
<script src="calib.js"></script>
<script src="capacity.js"></script>
<script src="cycle.js"></script>
<script src="equipment.js"></script>
<script src="room-rules.js"></script>
<script src="harvest-rules.js"></script>
<script src="web/ui.js"></script>
<script src="web/api.js"></script>
<script src="web/charts.js"></script>
<script src="web/settings-panel.js"></script>
<script src="web/vendor/qrcodegen.js"></script>
<script src="web/shell.js"></script>
<script src="web/room-tabs.js"></script>
<script src="web/rooms.js"></script>
<script src="web/room-live.js"></script>
<script src="web/room-equipment.js"></script>
<script src="web/room-simulate.js"></script>
<script src="web/room-calibrate.js"></script>
<script src="web/batches.js"></script>
<script src="web/harvest.js"></script>
<script src="web/simulator.js"></script>
</body>
</html>
```

### 1.3 Load order

Plain `<script src>` tags at the end of `<body>`: no `defer`, no `async`, no `type="module"`. They run in this order.

| # | Script | Defines | Needs when it loads |
|---|---|---|---|
| 1 | `sim.js` | `ClimateSim` | – |
| 2 | `air.js` | `ClimateAir` | – (C9 3) |
| 3 | `controller.js` | `ClimateController` | – (`ClimateAir` at call time, C9 3) |
| 4 | `runtime.js` | `ClimateRuntime` | – |
| 5 | `calib.js` | `ClimateCalib` | `ClimateSim` |
| 6 | `capacity.js` | `ClimateCapacity` | `ClimateSim`, `ClimateAir` (C9 3), `ClimateController`, `ClimateRuntime` |
| 7 | `cycle.js` | `ClimateCycle` | `ClimateSim`, `ClimateController`, `ClimateRuntime`, `ClimateCapacity` (C7 1) |
| 8 | `equipment.js` | `ClimateEquipment` | `ClimateSim` at load; `ClimateAir`, `ClimateController`, `ClimateCapacity`, `ClimateCycle` only when `estimate` or a run function is called (C8 1) |
| 9 | `room-rules.js` | `ClimateRoomRules` (owned by the API stream in wave 1 and Server 2 in wave 2; its members are exactly those of C3 section 7.1, which is the authority: `LIM`, `VERDICTS`, `ALARM_KEYS`, `hasCrop`, `validCalib`, `normRoom`, `checkRoom`, `checkMix`, `checkCalibration`, `checkReport`, `checkSimulationRun`, `checkRunPatch`, `checkEquipmentBody`) | `ClimateSim`, `ClimateController`, `ClimateCalib` and `ClimateCapacity.DESIGN_DAYS` at load; `ClimateEquipment` only when `checkEquipmentBody`, `checkCalibration` or `checkSimulationRun` is called, never at load. Loading `room-rules.js` without `cycle.js` and `equipment.js` must not throw: `tests/web-load.test.js`, `tests/web-bench.test.js`, `tests/web-air.test.js` and `tests/web-mimic.test.js` load it that way; nobody changes them in wave 2 (the lead in wave 3) (C3 7.1). |
| 10 | `harvest-rules.js` | `FarmHarvestRules` (C10 4) | `ClimateController` (it keeps the object at load and reads `CROPS` at call time, C10 4) |
| 11 | `web/ui.js` | `FarmUi` | – |
| 12 | `web/api.js` | `FarmApi` | – |
| 13 | `web/charts.js` | `FarmCharts` | `FarmUi` (at call time) |
| 14 | `web/settings-panel.js` | `FarmSettingsPanel` | `FarmUi`, `ClimateController` (at call time) |
| 15 | `web/vendor/qrcodegen.js` | `qrcodegen` (C10 2) | – |
| 16 | `web/shell.js` | `FarmShell` | – |
| 17 | `web/room-tabs.js` | `FarmRoomTabs` | – |
| 18 | `web/rooms.js` | nothing (registers `rooms`) | `FarmShell`, `FarmRoomTabs` (at call time) |
| 19 | `web/room-live.js` | nothing (registers tab `live`) | `FarmRoomTabs` (it calls `FarmRoomTabs.register` at load) |
| 20 | `web/room-equipment.js` | `FarmEquipmentCard` | – (it uses `ClimateEquipment`, `FarmApi` at call time); before `web/room-simulate.js` (C8 12.5) |
| 21 | `web/room-simulate.js` | nothing (registers tab `simulate`) | `FarmRoomTabs` |
| 22 | `web/room-calibrate.js` | nothing (registers tab `calibrate`) | `FarmRoomTabs` |
| 23 | `web/batches.js` | nothing (registers `batches`, C10 12) | `FarmShell` (it calls `FarmShell.register` at load); any other global (`FarmApi`, `FarmUi`, `FarmHarvestRules`, `ClimateController`) only at call time |
| 24 | `web/harvest.js` | nothing (registers `harvest`, C10 12) | `FarmShell` (it calls `FarmShell.register` at load); any other global (`FarmApi`, `FarmUi`, `FarmHarvestRules`, `qrcodegen`) only at call time |
| 25 | `web/simulator.js` | `FarmBench` (until wave 3, section 3.5) | `FarmShell` (it calls `FarmShell.register` at load) |

### 1.4 Rules for every web file

| Rule | Detail |
|---|---|
| Wrapper | `(function (global) { 'use strict'; ... })(typeof window !== 'undefined' ? window : globalThis);` like the shared modules, so Node tests can `require()` the file |
| Vendored file | `web/vendor/qrcodegen.js` (C10 2) is the compiled Nayuki encoder with a 3-line header, never edited: it has no wrapper and defines `qrcodegen` with a top-level `var`, as a classic script. Node tests load it with `node:vm` (`tests/qrcodegen.test.js`, C10 13); the page reads `qrcodegen` only at call time. |
| Globals | At most the one global of the table in 1.1. Module files define none; they only call `FarmShell.register`. Tab files (`web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js`) define none; they only call `FarmRoomTabs.register`. |
| No DOM at load | A file does no DOM work when it loads. DOM work starts in `mount`, in `create...` functions, or in the shell's `DOMContentLoaded` handler. |
| Markup | Each module and the settings panel keep their markup as a template string in their own file, moved from today's `index.html` with the same ids and classes. It is set with `el.innerHTML` once per mount. Every dynamic text is set with `textContent`. |
| Ids | Today's ids stay. The shell reserves `menu`, `view`, `levelSeg`, `themeBtn`. Only one module is mounted at a time, and at most one settings panel exists, so ids stay unique. |
| Missing file | A module script that fails to load leaves its route unregistered; the shell shows a notice (section 2.3). The other modules work. |
| No build | No bundler, no npm package, no framework |

### 1.5 Wave 0 stubs: `room-rules.js` and `web/rooms.js`

`index.html` loads `room-rules.js` and `web/rooms.js`, but neither exists when the Web split starts: the API stream
writes `room-rules.js` in wave 1, in parallel with the Web split, and the Room shell stream writes `web/rooms.js` in
wave 2 (revision 7; the Rooms UI stream of revision 6 never ran). So that the Web split's worktree serves both files (no 404 and no console error in the wave 1 headless Chrome
check), the lead commits these two stubs in wave 0. Each owner replaces the whole file. No wave 1 web code reads
`ClimateRoomRules`, and no wave 1 stream creates or changes `web/rooms.js`.

| Item | `room-rules.js` stub | `web/rooms.js` stub |
|---|---|---|
| File | `room-rules.js` (repo root) | `web/rooms.js` |
| Content | `(function (global) { 'use strict'; global.ClimateRoomRules = {}; })(typeof window !== 'undefined' ? window : globalThis);` | `(function (global) { 'use strict'; })(typeof window !== 'undefined' ? window : globalThis);` (the 1.4 wrapper; it registers nothing) |
| Effect | Nobody uses it: it only makes the script tag load. The room files use the real exports from wave 2. | The script tag loads; `rooms` stays unregistered, so `#/rooms` (the default route) shows `This part of the app is not installed.` (2.3 step 6) |
| Replaced by | API stream, wave 1 | Room shell stream, wave 2 |

### 1.6 Wave 0 files the web streams rely on

These names are exact. Every brief (lead-fakes, web-split, and the wave 2 briefs of the wave 2 plan) uses them;
a brief that names another file, or that tells a stream not to create a file the lead must write, is wrong and is
regenerated from the frozen contracts before dispatch.

| File | Written by | Content | Used by |
|---|---|---|---|
| `room-rules.js` | Lead, wave 0 | The stub of 1.5 | Every wave 1 stream (the script tag loads); the API stream replaces it in wave 1 |
| `web/rooms.js` | Lead, wave 0 | The stub of 1.5 (a lead deliverable, like `room-rules.js`) | The Web split's wave 1 headless check (no 404); the Room shell stream replaces it in wave 2 |
| `tests/fakes/api-server.js` | Lead, wave 0 | Section 4.5; tests load it with `require('./fakes/api-server.js')` (from `tests/`) | `tests/web-api.test.js` (Web split); the wave 2 web streams' Node tests and the 7.10 checks against the fake |
| `tests/fake-api-server.test.js` | Lead, wave 0 | The fake's own test (4.5) | The lead |

| Rule | Detail |
|---|---|
| Names not used | `tests/fakes/api.js`, `require('./fakes/api.js')` and `tests/fake-api.test.js` do not exist. |
| The `web/rooms.js` stub | No wave 1 stream creates, changes or deletes it, and no brief tells the lead not to write it. A 404 for `/web/rooms.js` fails the wave 1 headless check (7.10); only `/favicon.ico` may 404. |
| Lead's wave 0 check | Before wave 1 is dispatched, on the wave 0 commit: `ls tests/fakes/api-server.js tests/fake-api-server.test.js web/rooms.js room-rules.js` lists all four, and `grep -rn "fakes/api\.js\|fake-api\.test" briefs/` finds nothing. |
| Each web stream's start check | `ls tests/fakes/api-server.js web/rooms.js room-rules.js` lists all three; otherwise the stream stops and reports to the lead. |

---

### 1.7 Prep 2.0 files (lead, revision 7)

So that every wave 2 stream's worktree loads the page without a 404, the lead commits these files on `master` in prep 2.0, before the streams branch. Each owner replaces the whole stub.

| File | Content in prep 2.0 | Replaced by |
|---|---|---|
| `index.html` | The real file, exactly 1.2 (menu **Rooms · Batches · Test bench**, the `web/harvest.css` link, every script tag of 1.3) | – (the lead's; nobody changes it in wave 2) |
| `harvest-rules.js`, `tests/harvest-rules.test.js` | The real files (C10 4, 13; C10 plan task 0.2) | – (the lead's; nobody changes them in wave 2) |
| `web/vendor/qrcodegen.js`, `tests/qrcodegen.test.js` | The vendored encoder and its test (C10 2, 13; C10 plan task 0.3) | – (the lead's; nobody changes them in wave 2) |
| `web/batches.js`, `web/harvest.js` | Stubs: the 1.4 wrapper, registering nothing (`(function (global) { 'use strict'; })(typeof window !== 'undefined' ? window : globalThis);`) | Harvest web |
| `web/harvest.css` | Stub: one line, `/* Harvest pages (C10 12): written by the Harvest web stream. */` | Harvest web (lead decision 65) |
| `web/room-tabs.js` | The real file (3.9) | – (the lead's; nobody changes it in wave 2) |
| `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js` | Stubs: the 1.4 wrapper, registering nothing, so the frame shows `This tab is not installed.` | Live tab, Simulate tab, Calibrate tab |
| `equipment.js` | Stub: the frozen C8 constants (`AC_SIZES`, `CONSTRUCTIONS`, `FOGGER_SIZES`, `AIR_SIZES`, `DEFAULTS`, `LIMITS`, `SOL_AIR_K`, `MARGIN`, `SHARE`, `RUNS`, `MAX_RUNS`, deep-frozen as C8 4.1) and the real `checkEquipment` (C8 4.3); `geometry`, `shell`, `plantOf`, `estimate`, `runCheckSteps`, `runCheck`, `runCheckAsync` throw `Error('stub')` | Equipment (merged at gate 2.5) |
| `web/api.js`, `tests/web-api.test.js` | The 4.3 additions (the revision 7 functions and the ten C10 12.1 functions) | – |
| `tests/fakes/api-server.js`, `tests/fake-api-server.test.js` | The 4.5 defaults for the new routes (`GET /api/batches` → `[]` included), and the C3 section 9 file list: `/air.js`, `/cycle.js`, `/equipment.js`, `/harvest-rules.js` added to the served files (on `master` 6a12852 the list lacks all four), each tested for 200, `text/javascript; charset=utf-8` and the file bytes | – |

| Rule | Detail |
|---|---|
| Start check of every wave 2 web stream | `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js web/batches.js web/harvest.js web/harvest.css` lists all eight, and `grep -c 'web/room-tabs.js' index.html` prints `1`; otherwise the stream stops and reports to the lead |
| `web/room-equipment.js` | Not a stub: the Equipment stream creates it, and it is on `master` from gate 2.5 (the Equipment merge). Until gate 2.5 its script tag in the prep 2.0 `index.html` gives a 404 (on the fake API and on the real server); no headless check runs before then. The web streams' headless checks run after gate 2.5 on a tree that holds `master` plus their own files (7.10), so the script tag never gives a 404 there |

## 2. Shell (`web/shell.js`)

### 2.1 Routes

| Hash | Module | `params` | Menu link marked |
|---|---|---|---|
| `#/rooms` | `rooms` | `{}` | Rooms |
| `#/rooms/:id` | – | – | The shell calls `location.replace('#/rooms/:id/live')` |
| `#/rooms/:id/live`, `#/rooms/:id/simulate`, `#/rooms/:id/calibrate` | `rooms` | `{ id: Number(id), tab }` (`tab` = the last segment) | Rooms |
| `#/rooms/:id/calibrate/:runId` | `rooms` | `{ id: Number(id), tab: 'calibrate', runId: Number(runId) }` | Rooms |
| `#/simulator` | `simulator` | `{}` | Test bench |
| `#/simulator/:id` | `simulator` | `{ roomId: Number(id) }` | Test bench (the room is picked and its settings loaded; its machines are not: the Test bench uses `PLANT` machines in wave 2, 7.8) |
| `#/batches` | `batches` | `{}` | Batches (C10 11) |
| `#/batches/:id` | `batches` | `{ id: Number(id) }` (a batch id) | Batches (C10 11) |
| `#/harvest/stickers` | `harvest` | `{ view: 'stickers' }` | Batches (C10 11) |
| `#/harvest/:id` | `harvest` | `{ view: 'record', id: Number(id) }` (a room id: the address on the room's QR sticker) | none; bare layout (2.3 step 5; C10 11, lead decision 66) |
| `#/capacity`, `#/calibration`, empty, `#`, `#/`, or anything else | – | – | The shell calls `location.replace('#/rooms')` (the default route; no history entry) |

| Rule | Detail |
|---|---|
| Ids | `:id` and `:runId` match `^[1-9][0-9]{0,14}$` |
| Order | `#/harvest/stickers` is matched before `#/harvest/:id` (`stickers` is not an id anyway) (C10 11) |
| Menu link of `harvest` | The module has no menu link: `#/harvest/stickers` marks the **Batches** link; `#/harvest/:id` marks none (C10 11) |
| Trailing `/` | Ignored (`#/rooms/` is `#/rooms`) |
| Query strings | Not supported |
| `parseHash` | The pure route parser becomes a member of the global: `FarmShell.parseHash(hash)` → `{ name, params }`, `{ redirect: '#/rooms/<id>/live' }` for `#/rooms/:id`, or `null` (an unknown hash: the shell replaces it with `#/rooms`). Tested in Node by `tests/web-shell.test.js` and `tests/web-rooms.test.js` (Room shell) |

### 2.2 Public API

| Member | Signature | Contract |
|---|---|---|
| `FarmShell.register` | `(name: string, module: { mount, unmount, update? }) → void` | Called once by each module file at load. `name` is `rooms`, `simulator`, `batches` or `harvest` (C10 11). A second call with the same name replaces the first. |
| `FarmShell.MENU_NAMES` | `{ rooms: 'Rooms', simulator: 'Test bench', batches: 'Batches', harvest: 'Harvest' }` (frozen) | Menu names, used for `document.title` (`harvest` has no menu link; its name is used for the title only, C10 11) |
| `FarmShell.level` | getter `→ 'farmer' \| 'installer'` | The settings level now (equals `document.body.dataset.level`) |

### 2.3 Switching modules

On `DOMContentLoaded` the shell wires the menu, the level and the theme, then routes. It routes again on every
`hashchange`.

| Step | Action |
|---|---|
| 1 | Parse the hash (2.1). An unknown hash redirects to `#/rooms` and stops here. |
| 2 | Same module and same `params` as now: do nothing. Same module, other `params`, and the module has `update(params)`: call it; when it returns `true`, keep the module mounted, store the new `params`, set `aria-current`, `document.title` and the layout (step 5), and stop. Otherwise continue with step 3 (lead decision 15). |
| 3 | Call `unmount()` of the current module (if any). An exception is caught and logged with `console.error`. |
| 4 | Empty `<main id="view">` and remove every attribute except `id`. |
| 5 | Set `aria-current="page"` on the menu link that the route marks (2.1, column "Menu link marked") and remove it from the others (`#/harvest/:id` marks none). Set `document.title` to `<Menu name> · Mushroom farm` (`MENU_NAMES` of the new module). Layout (C10 11, lead decision 66): for `#/harvest/:id` set `document.body.dataset.layout = 'bare'`; for every other route delete `data-layout` from `document.body`. `web/harvest.css` hides `.bar` under `body[data-layout="bare"]`, so the phone page shows no menu bar. |
| 6 | Module not registered: put `<p class="est-note">This part of the app is not installed.</p>` in `#view` and stop. |
| 7 | Call `mount(view, params)`. If it throws, or returns a Promise that rejects, the shell logs the error and puts `This page could not be opened: <message>` in `#view` (a `<p class="est-note">`). The module stays current, so its `unmount()` still runs at the next switch. |

`#/rooms` and `#/rooms/3/live` are the same module with different `params`. A tab switch on one room (`#/rooms/3/live` → `#/rooms/3/simulate`) goes through `update(params)` (3.8), so the room header stays; another room or the Rooms home makes the shell unmount and mount again.

### 2.4 Settings level and theme

| Control | Behaviour |
|---|---|
| Level (`#levelSeg`) | Farmer at each page load (as today). A click sets `document.body.dataset.level`, updates `aria-pressed`, and dispatches `new CustomEvent('farm-level', { detail: { level } })` on `document`. The existing CSS (`body[data-level="farmer"] .inst`, `.farmer-only`) keeps hiding installer parts. Later, logins (3.5) set the level instead. |
| Theme (`#themeBtn`) | Today's code unchanged (`document.documentElement.dataset.theme`, not stored) |

---

## 3. Module interface (C5)

### 3.1 The object each module registers

| Member | Signature | Contract |
|---|---|---|
| `mount` | `(el: HTMLElement, params: object) → void \| Promise<void>` | `el` is the empty `#view` (a 12-column grid). Builds the module's markup in `el`, loads its data, starts its timers and live feed. The shell does not wait for the Promise. |
| `update` | `(params: object) → boolean`, optional (revision 7) | Called by the shell for new `params` of the mounted module (2.3 step 2). Returns `true` when the module handled them without a remount. |
| `unmount` | `() → void` | Stops everything `mount` started: `requestAnimationFrame` loops, timers, `ResizeObserver`s, `document`/`window` listeners, `FarmApi.stream` (calls its close function), settings panels (`destroy()`), dialogs. Results of async work that finish later are ignored and must not touch the DOM. Must not throw. Need not empty `el`. |

| Rule | Detail |
|---|---|
| DOM scope | A module changes only `el` and its descendants, plus a `<dialog>` it opens (section 7.6). It never changes `document.body` attributes or the shell's elements. `body[data-layout]` is the shell's (2.3 step 5; C10 11, lead decision 66): the `harvest` module never sets it. |
| Attributes on `el` | A module may set attributes on `el` (for example `data-bench`); the shell removes them before the next mount. |
| State | The Simulator keeps its run (simulation, controller, samples, events, settings) in its closure between mounts; the run does not advance while unmounted. The other modules reload from the API at each mount. |
| Errors from the API | Shown in the module's message line with `FarmUi.errorText(err)`; the module stays usable |

### 3.2 Modules

| Name | File | Routes | Shows | Uses |
|---|---|---|---|---|
| `rooms` | `web/rooms.js` | `#/rooms`, `#/rooms/:id/<tab>`, `#/rooms/:id/calibrate/:runId` | The Rooms home and the room page frame with the tabs **Live · Simulate · Calibrate** (3.8, 3.9). Revision 6's Rooms list and room page content is now split between the home, the frame and the Live tab (3.4; table "Room-centred moves" in 3.3). | `FarmApi`, `FarmRoomTabs`, the tab files |
| `simulator` | `web/simulator.js` | `#/simulator`, `#/simulator/:id` | The Test bench: today's test bench (3.3) with C9 7's air exchange (room drawing, status card, glance row, purge ladder, **Air exchange per hour** bars, `#inAirM3h`), **Load settings from room** and **Save settings to room** (7.8); opened from a room's **Open test bench** with that room picked | `ClimateSim`, `ClimateAir`, `ClimateController`, `ClimateRuntime`, `ClimateCalib.toCsv`, `FarmCharts`, `FarmSettingsPanel`, `FarmApi` |
| `batches` | `web/batches.js` (Harvest web) | `#/batches`, `#/batches/:id` | The batch list with the **Received · Placed · Cleared** tabs, the new batch form and the batch detail (place, clear, delete, flushes, crates with Undo) (C10 12.3); helpers `dateToSeconds`, `secondsToDate`, `ageDays`, `batchBody` (C10 12.2) | `FarmApi` (the C10 12.1 functions, `listRooms`), `FarmUi`, `FarmHarvestRules`, `ClimateController.CROPS`; styles in `web/harvest.css` |
| `harvest` | `web/harvest.js` (Harvest web) | `#/harvest/:id` (`view: 'record'`), `#/harvest/stickers` (`view: 'stickers'`) | The phone page opened by a room's QR sticker: batch picker, picker name, **Add crate**, today's crates with Undo (C10 12.4); the stickers page: one QR card per room, the address check, the advice, **Print** (C10 12.5); helpers `parseKg`, `summaryText`, `stickerLink`, `isLocalHost`, `qrSvg` (C10 12.2) | `FarmApi` (`getRoomHarvest`, `addCrate`, `undoCrate`, `listRooms`), `FarmUi`, `qrcodegen`, `localStorage['farm.picker']`; styles in `web/harvest.css` |

Revision 6 had two more modules, `capacity` (`web/capacity.js`) and `calibration` (`web/calibration.js`). From revision 7 `index.html` does not load them; their parts are the Simulate and Calibrate tabs (3.10, 3.11) and the Rooms home's import (3.8); the lead deletes both files in wave 3 (lead decision 29).

### 3.3 Home of every part of today's page

| Today (`index.html`) | New home |
|---|---|
| Header: title and sub-title | Shell header (title "Mushroom farm") |
| Header: room clock, day/night chip, alarm summary, **Acknowledge all** | Simulator: a toolbar row at the top of the module |
| Header: speed, **Pause**, **Reset** | Simulator toolbar |
| Header: theme button | Shell header |
| "Simulation" heading and **Show test bench settings** | Simulator; the bench flag moves from `body[data-bench]` to `el.dataset.bench` (CSS selectors become `[data-bench="off"] ...`) |
| Room schematic (mimic) | Simulator |
| Weather, Growing blocks, Sensors (`.simpanel`) | Simulator (bench) |
| Air path, Disturbances, Air conditioner unit (`.simextra`) | Simulator (bench) |
| Calibration card | Calibration module. Its **Download a sample log (last 24 h)** button (`calSample`) stays in the Simulator bench (it needs the Simulator's samples), as a row in the Sensors section. In the Simulator the button only downloads the CSV (`sample-room-log.csv`, as today); it no longer loads the rows into the calibration card (today's `calLoad(rows, 'Sample log from the simulation')` is dropped). The user loads that file in the Calibration module with its file input. With fewer than 60 rows it downloads nothing and shows `Run the simulation for 1 h or more first.` in a `span.tag#calSampleMsg` beside the button (`calMsg` is in the Calibration module). |
| Capacity card | Capacity module |
| "Climate controller" heading | Simulator (the level switch moves to the shell header) |
| Crop and stage, Targets, Installer: program and room (`.card.targets`) | Settings panel; the live lines (`progStatus`, `progRamp`, `progHarvest`, `cropCheck`, `vpdLine`) go into panel slots filled by the Simulator |
| Fan and CO₂ rules (`.card.rules`), left column | Settings panel (card **Air exchange and CO₂**, C9 7) |
| Fan and CO₂, right column: ladder, ladder note, duty counters | Simulator, in the panel slot `rules-side`; ladder drawn by `FarmCharts.createLadder` (one row `Purge`, C9 7) |
| Five machine faceplates: state, power, meter, reason | Simulator |
| Five machine faceplates: Auto/Manual switch and manual outputs | Settings panel, new **Machines** card (same controls and ids) |
| Water and air (meters) | Simulator |
| Time window filter row, **Show data table** | Simulator |
| Temperature, humidity, CO₂ and power charts | `FarmCharts.createTrendCharts`, used by the Simulator (all four) and the room page (the three trends) |
| Energy since reset (with the tariff) | Simulator |
| Exhaust per hour | Simulator, card **Air exchange per hour**; the bar chart is `FarmCharts.drawPurgeBars` (C9 7) |
| Test the rules over 24 h | Simulator |
| Recent sensor readings table | Simulator |
| Alarms, Controller event log | Simulator (its local controller); the room page has its own from the API |

| Today (`app.js`) | New home |
|---|---|
| Run loop: `reset`, `tick`, `poll`, `sample`, `frame`, speed, pause | `web/simulator.js` |
| Formatting and DOM helpers (`pad2` … `cell`, `ICON`, `LVL_RANK`, `AC_WORD`) | `web/ui.js` (`AC_WORD` stays in the Simulator) |
| `updateUi`, `renderAlarms`, `renderLog`, `renderExhaust` (headline and tables), `renderTable`, mimic animation, `runTest`, `renderTest`, simulation controls, `inTariff`, `ackBtn`, phase 2 simulation controls, `paintProgram`, crop check, bench toggle, window and table buttons, `window.__climate` | `web/simulator.js` (`window.__climate` is set while the Simulator is mounted and deleted on unmount) |
| Charts: `lowerBound` … `drawPower`, `drawCharts` view part, `barPath`, the bar chart of `renderExhaust`, the charts of `calRender`, `LADDER`, `buildLadder`, `layoutLadder`, the drawing part of `updateLadderLive` | `web/charts.js` |
| Rules forms (`RULE_*`, `fillRules`, `fillRulesQuiet`, `paintRhAbs`, `numIn` handlers), targets sliders, `inRoomM3`, stage program (`renderStageSeg`, `fillProgram`, `pg*` handlers, `inFarm`, `inCrop`, `stageSeg`), lights, sensor mode, offsets, Auto/Manual with bumpless transfer, manual outputs, `syncTargets` | `web/settings-panel.js` |
| Calibration (`calRender` table and messages, `calLoad`, file input, fit, apply) | `web/calibration.js`; `calLogFromSamples` and the sample-log download stay in the Simulator (download only, 3.3 row "Calibration card") |
| Capacity (`normRoom`, `validCalib`, `renderRooms` … `renderFarm`, run check) | `web/capacity.js`; in wave 2 `normRoom` and `validCalib` come from `ClimateRoomRules` (C3 section 7.1) and the local copies are deleted; `loadRooms` is kept only for the import (3.7); `saveRooms`, `roomChanged`'s local save, the `capSave` and `capDelete` handlers, export and import are deleted (3.7) |
| `setLevel` | `web/shell.js` |
| Theme | `web/shell.js` |

#### Room-centred moves (revision 7)

| Wave 1 module or brief part | New home | Note |
|---|---|---|
| Rooms list, **New room**, **Restart** on a card | Rooms home (`web/rooms.js`, 3.8) | The card adds `flush` and `blocks` (`live.flush`, `live.blocks`) |
| Room page header (name, info, state, alarms, **Restart**, feed line) | Room page frame (`web/rooms.js`, 3.8) | Plus the tabs |
| Room page live values, machines, charts, alarms, events, settings, versions, room details | Live tab (`web/room-live.js`, 3.4) | Same design |
| Capacity: mix table, **Run check**, report, `verdictText`, `VERDICT_CHIP`, `LIMIT_WORD`, `FAIL_MACHINE` | Simulate tab (`web/room-simulate.js`, 3.10) | The mix is a draft (lead decision 25); the check runs `checkSteps` (lead decision 26) |
| Capacity: farm line (`capFarm`) | Dropped | Each room shows its own runs |
| Capacity: room picker, **New room** (`capNew`, `capVolume`) | Dropped | The room comes from the page; **New room** is on the Rooms home |
| Capacity: **Import rooms from this browser** | Rooms home (3.8) | Same rules (3.7 import table) |
| Calibration: room picker | Dropped | The page's room |
| Calibration: blocks field, CSV load, **Fit**, table, charts, **Save and apply** | Calibrate tab (`web/room-calibrate.js`, 3.11) | The room's history is the default source; CSV is "Log file" |
| Simulator | Test bench (`web/simulator.js`, menu **Test bench**) | Plus `#/simulator/:id`. The room drawing is C9's (`mimicLayout({ inletAt, exhaustAt })`, intake SF-203 and exhaust EF-206, on `master`); no wave 2 stream changes it (lead decision 53) |

### 3.4 Live tab data flow (`web/room-live.js`, wave 2)

Revision 7: the room header, running/stopped state and **Restart** are the frame's (3.8). The Live tab gets every stream event of its room through `ctx.on` (3.9) instead of its own stream, and the Room (with `live.status`, `live.targets`) through `ctx.room()` and the `room` event; the frame does the `listRooms()` status refresh below once per page. Every other row is unchanged, with "the page" read as "the Live tab".

| Part | Source | Refresh |
|---|---|---|
| Room header, running/stopped and error, **Restart** | The frame (3.8) | – |
| Live readings and machines | The latest Reading (from `live.reading`, then stream `reading` events). The air exchange is `On` or `Off` from `r.air` (`1` / `0`, C9 6.1); it has no level. | Each `reading` event |
| Air exchange card, glance row, purge ladder (revision 8, lead decision 27 as amended) | `room.live.air` (C2 5.2 `Live.air`, C3 3.1, passed through unchanged): `{ on, state, reason, delayed, timed, manual, manualOn, nextPurgeS, purgeS, why, today: { purges, avgS, capped } }`, and the current settings (`base`, 7.9) for `airM3h` and `rules.purgeMaxS`. Texts in the table "Air exchange on the Live tab" below. `live.air` `null` or absent (a stopped room, no reading yet): the card shows `–`. | With the Room: the `listRooms()` refresh after a `reading` event, a `room` event, the `restartRoom` reply (row below). Between them the texts stay as received (at most about 30 s old). |
| Status chips and targets (`live.status`, `live.targets`) | A Room object only: the `listRooms()` row, a `room` event, or the `restartRoom` reply. A `reading` event carries only the Reading, and a change of `live.status` or `live.targets` alone sends no `room` event (C2 section 7, C3 section 10.2). | After each `reading` event of a shown room (the list: any room; the room page: its room), the page calls `listRooms()` again, at most once per 30 s per page: when no call of this page started in the last 30 s and none is in flight, it calls at once; otherwise it calls once when those 30 s end (one timer, cleared by `unmount`). From the reply it takes `live.status` and `live.targets` of each shown room (same `id`) and repaints the chips and, on the room page, the chart bands and targets line. A failed call changes nothing and is not retried. Also set again from every `room` event and the `restartRoom` reply. This refresh is required, not optional: it is the only way a change of `live.status` or `live.targets` alone reaches the page (C2 section 7 and C3 section 10.2 send no event for it). It is driven by `reading` events (no `reading`, no call), uses only `FarmApi.listRooms()`, and its one timer is the only data timer of the Rooms module. A brief that forbids "polling" or "a polling timer" does not forbid this refresh. |
| History charts | `getReadings(id, { from, to, step })` with `to` = now, `from` = now − window. Window 1 h and 6 h: no `step`. 24 h: `step` 120. 7 days: `step` 900. | Each `reading` event appends a point; points before `from` are dropped. |
| Alarms | `getAlarms(id)`; **Acknowledge** calls `ackAlarm(id, alarmKey)` | Stream `alarm` events reload the list |
| Event log | `getEvents(id, { limit: 100 })`; **Older** calls `getEvents(id, { limit: 100, before: <the smallest event id shown> })` and appends the page at the bottom; an empty page hides **Older** | Stream `event` events are added at the top |
| Settings, versions | Section 7.9 | Stream `settings` events |
| Reconnect | Stream `open` with `reconnect: true` (after a drop, a fetch error, a non-2xx reply or the watchdog of 4.4) | As C4 section 10.4. Header and live values: `listRooms()`. Alarms: `getAlarms(id)`. Event log: its first page only. History charts: the 1 h window loads `getReadings(id, { from: max(<last t held> + 1, now − 3600), to: now })` (the last minutes) and merges by `t`; the 6 h, 24 h and 7 days windows load their whole range again with their `step`. Missing readings stay a gap. Settings and versions: 7.9. |

Reading → `ChartPoint` (section 6.1): `{ t, T, RH, C: CO2, tOut: t_out, rhOut: rh_out, core, spT, spRH, co2Lim, fanOn, fanOff }` (`core` from revision 7).
The page reads every Reading with its C1/C3 keys (lead decision 1); `ChartPoint` is only the input format of the moved
charts code (`web/charts.js`), not a second name for the Reading.
`spT`, `spRH`, `co2Lim` are the room's targets now, `room.live.targets.T`, `.RH`, `.CO2` (so the bands follow a ramp and
the VPD humidity target); when `live.targets` is `null`, they are `spT`, `spRH`, `co2Lim` of the current settings
(`base`, 7.9). `fanOn`, `fanOff` are `rules.fanOn`, `rules.fanOff` of the current settings. Readings do not store
targets, so every point of the window gets the targets of now; they are set again whenever `live.targets` is
refreshed (row "Status chips and targets" above: the `listRooms()` call after a `reading` event, a `room` event, the
`restartRoom` reply) and on each `settings` event.
`null` becomes `NaN`. The room page draws the three trend charts only (`power: false`): readings hold one total power,
not the power per machine. `gapS` = 3 × max(30, step) so a server stop shows as a gap. The clock is `FarmUi.farmClock()`.

#### Air exchange on the Live tab (revision 8, lead decision 27 as amended)

The texts are those of C9 7 (status card, glance row, ladder chip), with the same rule order as the Test bench's `airText` (`web/simulator.js`), but read from `live.air` instead of a controller in the page. `<m:ss>` is `FarmUi.fmtMinSec` of whole seconds; `<m>` = `max(1, ceil(nextPurgeS / 60))` (the controller's rounding). The first row that applies wins.

| # | `live.air` | Status card state (`#airState`) | Glance row `Air exchange` | Ladder chip (`createLadder` chips `{ air }`) |
|---|---|---|---|---|
| 1 | `on` and `reason === 'purge'` | `Purge <m:ss of purgeS> of <m:ss of rules.purgeMaxS>` | `Purging <m:ss of purgeS>` | `{ lvl: 'info', icon: '▲', text: 'Purging' }` |
| 2 | `on` and `reason === 'safety'` | `Safety run` | `Safety run` | `{ lvl: 'serious', icon: '◆', text: 'Safety run' }` |
| 3 | `on`, other `reason` (`timed`, `free cooling`, `drying`, `manual`) | `Timed purge`, `Free cooling`, `Drying`, `Manual on` | the same text | `{ lvl: 'info', icon: '●', text: <the same text> }` |
| 4 | not `on`, `manual` and `manualOn` | `Manual on` | `Manual on` | `{ lvl: 'info', icon: '●', text: 'Manual on' }` |
| 5 | not `on`, `manual` | `Manual off` | `Manual off` | `{ lvl: 'none', icon: '○', text: 'Manual off' }` |
| 6 | `delayed` | `Delayed (humidity first)` | `Delayed (humidity first)` | `{ lvl: 'info', icon: '❚❚', text: 'Delayed' }` |
| 7 | `timed` | `Timed purge · off` | `Timed purge · off` | `{ lvl: 'none', icon: '○', text: 'Idle' }` |
| 8 | `nextPurgeS > 0` | `Idle · purge in about <m> min` | `Next purge in about <m> min` | `{ lvl: 'none', icon: '○', text: 'Idle' }` |
| 9 | otherwise (`state` `idle` or `after`) | `Idle` | `Idle` | `{ lvl: 'none', icon: '○', text: 'Idle' }` |

| Part | Content |
|---|---|
| Status card | In a `section.card.room-air` (3.8). Heading `Air exchange`, sub-line `SF-203 + EF-206 · <airM3h> m³/h` (the current settings' `airM3h`, `en` grouping), `#airState` (table above), `#airWhy` = `live.air.why` (empty when `null`) |
| Glance row | A `div.room-air` row (3.8): `Air exchange` (table above); per day: `Purges <today.purges> · average <m:ss of today.avgS>` (`–` for the average when `today.purges` is 0), plus ` · <today.capped> capped` when `today.capped` > 0 (`today` counts since 00:00 farm time) |
| Purge ladder | The `rules-side` slot of 7.9: `FarmCharts.createLadder` (C9's one row `Purge`, from `rules.fanOn` to `rules.fanOff`) with the latest CO₂ and the chip of the table above |
| Air exchange per hour (`drawPurgeBars`) | Not on the Live tab in wave 2: the hourly history stays in the Test bench. A later item (it could be built from the `air` column of the readings). |
| `helpers` (`tests/web-room-live.test.js`) | `airLive(air, settings) → { state, glance, chip, day }`: the two tables above, pure |

### 3.5 `FarmBench`: wave 1 bridge (removed in wave 3)

In wave 1 the Calibration and Capacity modules are moved code and still need the Simulator's state, as today. The
Simulator exposes it. From revision 7 no loaded code uses it (`web/capacity.js` and `web/calibration.js` are no longer
loaded; the Calibrate tab builds its own simulation base, 3.6); the lead deletes `FarmBench` and both files in wave 3
(lead decision 29), after moving `tests/web-bench.test.js` and `tests/web-load.test.js` off them.

| Member | Type | Contract |
|---|---|---|
| `FarmBench.env` | getter → object | The Simulator's `env` (the live object). Creates the Simulator state on first use if the Simulator was never mounted. |
| `FarmBench.cfg` | getter → Settings | The Simulator's settings (the live object) |
| `FarmBench.tariff` | getter → number | RM per kWh from the Energy card (default 0.57) |
| `FarmBench.mimicLayout` | function | C9 7's `mimicLayout({ inletAt, exhaustAt })` (on `master`). `tests/web-mimic.test.js` reads it here until the lead points that test at the Node export of 7.8 in wave 3, before deleting `FarmBench` (lead decision 51) |
| `FarmBench.calApplied` | object or `null` | The last applied calibration `{ ua, infAch, moistBuffer, co2PerBlock, rmse, date }` (today's `calApplied`) |
| `FarmBench.applyCalib(params, rmse)` | `({ ua, infAch, moistBuffer, co2PerBlock }, { T, RH, CO2 }) → void` | Today's `#calApply` effect on the Simulator: sets `env.room.ua`, `infAch`, `moistBuffer`, `env.co2PerBlock = Math.round(co2PerBlock)`, sets `calApplied` (date = ISO now), adds today's "Simulation calibrated: …" event, updates `#inPerBlock` and the blocks hint if mounted |

### 3.6 Calibration fit input (used by the Calibrate tab, 3.11)

`ClimateCalib.replay(rows, envBase, params)` and `ClimateCalib.fitAsync(rows, envBase, params, onProgress)` simulate
the picked room from `envBase`. The CO₂ of the blocks is `blocks × co2PerBlock` (`ClimateSim.co2Lpm`), so the block
count must be the room's, or the fitted `co2PerBlock` is wrong by the same factor. In wave 2 the Calibrate tab builds
`envBase` itself, as below; it never uses `FarmBench`.

| Step | Action |
|---|---|
| 1 | The room is the page's room (`ctx.room()`, 3.9). Each mount loads `getMix(id)`, `listCalibrations(id)`, `getEquipment(id)` (C8; `null` = no machines saved) and `getSettings(id)` (for `airM3h`; a stream `settings` event of the room, `ctx.on('settings')`, replaces it). A failure: `errorText` in `#calMsg`, **Fit** stays disabled. |
| 2 | Blocks field: number input `calBlocks`, label `Blocks in the room during the log`. Default: the sum of `blocks` over the room's MixRows, when that sum is ≥ 1; otherwise `live.blocks` when set; otherwise empty. Rule: an integer from 1 to 200000 (`ClimateRoomRules.LIM.blocks`). While it is empty or invalid, **Fit** is disabled and the message line says `Enter the number of blocks in the room during the log.` |
| 3 | `envBase = structuredClone(ClimateSim.DEFAULT_ENV)`; then `envBase.airM3h` = the room's current settings `airM3h` (C9 4.1: the size of the room's air exchange; the live room and its controller use the same number); `envBase.room = { volume: room.volume }`; `envBase.blocks = <the blocks field>`; `envBase.blockStage` = the `stage` of the first log row that has one (history rows carry `stage`, 3.11), else `room.live.stage`, else `DEFAULT_ENV.blockStage` (`'fruiting'`); when the room has equipment, `envBase.plant = ClimateEquipment.plantOf(equipment, { volume: room.volume, calib: {} })` (machines only: no `room`, no `loads`, so the sun stays 500 W, C8 4.5); without equipment no `plant`. Every other value stays `DEFAULT_ENV` (`probe: true`, `co2PerBlock: 45`, …). `envBase` is built again whenever the log, the machines, the settings' `airM3h` or the blocks field changes. The same `envBase` serves both sources (history and CSV). |
| 4 | Start values `params`: the four values of the room's Calibration with `applied` = `true` (`{ ua, infAch: inf_ach, moistBuffer: moist_buffer, co2PerBlock: co2_per_block }`); without an applied run, `ClimateCalib.paramsOf(envBase)`. |
| 5 | Base line (the "before" curves): `ClimateCalib.replay(rows, envBase, params)`. **Fit**: `ClimateCalib.fitAsync(rows, envBase, params, onProgress)` → `{ params, result, evals }`. |
| 6 | **Save and apply**: `run = await saveCalibration(id, body)` with the body mapped as in C3 section 8 (`ua` = `params.ua`, `inf_ach` = `params.infAch`, `moist_buffer` = `params.moistBuffer`, `co2_per_block` = `params.co2PerBlock`, `rmse_t` / `rmse_rh` / `rmse_co2` = `result.rmse.T` / `RH` / `CO2` with `NaN` sent as `null`, `log_rows` = `rows.length`), plus `source` (`history` with `log_from` = the first reading `t` and `log_to` = the last reading `t`; or `csv` with both left out) and `equipment` (the 7 fields of the equipment `envBase.plant` was made from, or `null`; lead decision 50); then `applyCalibration(id, run.id)`. Message: `Applied. Simulate now uses these values.` On an `ApiError`: `errorText`, the fit stays on screen. |

### 3.7 Capacity module (wave 1) and the one-time import

From revision 7 `index.html` does not load `web/capacity.js`: the capacity check is part of the Simulate tab (3.10) and the
import is on the Rooms home (3.8). Two parts of this section stay binding:

| Binding part | Rule | Used by |
|---|---|---|
| `sameMix(a, b)` | Two capacity mixes are equal when they have the same length and, at each index, the same `crop`, the same `blocks`, and the same `co2PerBlock` (both absent counts as equal) | Simulate tab (3.10) |
| One-time import | The table below | Rooms home (3.8) |

#### One-time import from browser storage (Rooms home, 3.8)

| Item | Rule |
|---|---|
| Stored data | `localStorage['mushroom-farm.rooms.v1']`, read as today's `loadRooms`: `JSON.parse`, the `rooms` array, each room through `ClimateRoomRules.normRoom(r, i)`, `null` results dropped (`normRoom` keeps no air key: a stored room's old air setting is ignored, C9 6.3). A read that throws (blocked storage, bad JSON) counts as no stored data. |
| Marker | `localStorage['mushroom-farm.rooms.v1.imported']` = `String(<Unix time>)`, written only after a complete import. |
| Button | **Import rooms from this browser** (revision 7: `rhImport` beside **New room** on the Rooms home; `capImportLocal` in wave 1) is shown only when the marker is absent and the stored data gives at least one room; otherwise it is hidden. |
| Click | `confirm('Create <n> room(s) from this browser on the farm server? Each one starts running as a simulated room.')`; on OK, for each room in order, the requests of C3 section 8.1 (the calibration body with `source: 'import'`), one at a time; message `Importing room <k> of <n>…`. |
| Complete | Write the marker, hide the button, reload the room list, message `Imported <n> room(s). Run the check again for each room.` |
| Failure | Stop at the first `ApiError`; no marker; reload the room list; message `The import stopped at "<name>": <errorText>. <k> room(s) were created; archive them on their room pages before you import again.` There is no rollback (C3 section 8.1 has no transaction): the rooms already created stay, and the module does not archive them itself. |
| Stored data kept | The module never changes or deletes `mushroom-farm.rooms.v1`. |

### 3.8 Rooms home and room page frame (`web/rooms.js`, Room shell, revision 7)

| Part | Content |
|---|---|
| Home: explain card | `p.explain`: `Every grow room is one card. The farm server runs each room's climate controller 24/7, so these values are live even when nobody has the page open.` and the loop line `Live: is the room alright now? → Calibrate: make the virtual room match the real one → Simulate: will this crop plan work? → predicted vs real → Calibrate again` |
| Home: cards | A card per room (`section.card.room-card`): name, status chip by precedence: `live.running` `false` → `{ lvl: 'serious', text: 'Stopped' }`; else `live.alarms` > 0 → `{ lvl: 'warning', text: '<n> alarm' }` (`1 alarm`, `2 alarms`); else any `live.status` chip with `lvl` other than `good` → `{ lvl: 'info', text: 'Out of band' }`; else `{ lvl: 'good', text: 'All good' }`; `p.rc-crop` = `<crop name> · <stage name>[ · flush <flush>][ · <blocks> blocks]` (`ClimateController.CROPS[crop].name`, `ClimateController.STAGES[stage]`; `live.flush`, `live.blocks`), an air line `Air exchange on` / `Air exchange off` from `live.reading.air` (`–` without a reading), T / RH / CO₂ now from `live.reading` with the `live.status` chips (`div.rc-values`), machines, `live.alarms`, "Stopped" with `live.error` and **Restart** when `live.running` is `false`. The whole card links to `#/rooms/<id>/live` (the **Restart** button does not follow the link). |
| Home: **New room** | `div.room-new`: name, volume m³ (5–5000, default `ClimateSim.PLANT.room.volume`); `createRoom({ name, volume })` (no air field: a room has none, C9 6.1) (name = the trimmed text, or `Room <number of rooms + 1>`); the new card appears; message `Created "<name>". It starts running at once (simulated, default settings).` |
| Home: **Import rooms from this browser** | Button `rhImport` beside **New room**; the 3.7 import table; the requests of C3 8.1 (calibration body with `source: 'import'`) |
| Home: stream and refresh | `FarmApi.stream` opened at mount, then `listRooms()` on the first `open` (C4 10.3); a `reading` event updates the card's values; a `room` event replaces the card (a room with `archived_at` set is removed, a new id added); the `listRooms()` refresh after a `reading` event, at most once per 30 s (3.4 row "Status chips and targets"); a reconnect reloads `listRooms()` |
| Frame: header | `section.card.room-head`: `nav.crumbs` (`a[href="#/rooms"]` `Rooms` › name), `h2#rpName`, `span.tag#rpInfo` = `<crop name> · <stage name>[ · flush <n>] · <blocks> blocks · <volume> m³` (names as the home card) (`blocks` left out when `live.blocks` is `null`), `span.chip#rpState` (`Running` / `Stopped: <error>`), `span.chip#rpAlarms` (`No alarms` with `lvl` `good` when `live.alarms` is 0, else `<n> alarm` / `<n> alarms` with `lvl` `warning`), `button.btn#rpRestart` (hidden while running; `restartRoom(id)`, the reply repaints the header), `span.tag#rpFeed` (`Live` / `Reconnecting…`), `p.tag#rpMsg` |
| Frame: tabs | `nav.room-tabs` (`aria-label="Room views"`): links `Live`, `Simulate`, `Calibrate` (`FarmRoomTabs.NAMES` order) to `#/rooms/<id>/<tab>`; `aria-current="page"` on the shown tab |
| Frame: tab host | `div.contents#roomTab` |
| Frame: stream | One `FarmApi.stream` per room page; open first, then load (C4 10.3). The frame does the `listRooms()` status refresh of 3.4 (its only data timer). Events of other rooms are ignored. |
| Frame: mount order | Markup; stream; on the first `open`: `listRooms()` row (no row → `This room does not exist or is archived.` and a link to `#/rooms`, stream closed); header; then mount the tab `params.tab` with a new context (3.9). An unregistered tab: `p.est-note` `This tab is not installed.` in `#roomTab`. |
| Frame: `update(params)` | Same `id`: unmount the current tab (its listeners removed), empty `#roomTab`, mark the new tab link, mount the new tab with a new context (`params.runId` included); return `true`. Another `id`: return `false` (the shell remounts). |
| Frame: `unmount` | Unmount the tab, close the stream, clear the refresh timer |
| Frame: Room updates | A stream `room` event of this room, the status refresh reply and the **Restart** reply repaint the header and are passed to the tab as `room` (3.9). An archived room: the "does not exist" content, stream closed. |
| Classes added to `styles.css` (Room shell, one `/* Room page */` block; lead decision 32) | `.explain`, `.room-tabs` (and `[aria-current="page"]`), `.crumbs`, `.room-card`, `.room-new`, `.room-head`, `.room-live`, `.room-versions`, `.room-details`, `.room-msg`, `.rc-values`, `.rc-crop`, `.run-progress` (bar + `span`), `.run-list`, `.mix-table`, `.result-card`, `.fit-table`, `.pvr-card`, `.equip-form` (the 7 machine fields in two rows), `.equip-bar` (a share bar: `span` width = share %), `.room-air` (the Live tab's air exchange card and glance row, 3.4), `.cal-charts` (the host of each `drawCalibCharts` call, 3.11). No other wave 2 stream edits `styles.css`. The harvest pages' classes and the bare layout rule are in `web/harvest.css`, the Harvest web stream's own stylesheet (C10 12.2; lead decision 65: lead decision 32 holds for `styles.css`). |
| `helpers` (Node, `tests/web-rooms.test.js`) | `cardTexts(room)`, `infoText(room)`, `statusChip(room)`, and the import helpers `readStored`, `importPlan`, `importRooms` |

### 3.9 Tab registry and context (`web/room-tabs.js`, lead, revision 7)

| Member | Signature | Contract |
|---|---|---|
| `FarmRoomTabs.register` | `(name, tab) → void` | `name` one of `live`, `simulate`, `calibrate`; any other name throws `Error('Unknown tab: <name>')`; a second call replaces the first |
| `FarmRoomTabs.get` | `(name) → tab \| undefined` | – |
| `FarmRoomTabs.NAMES` | `['live', 'simulate', 'calibrate']` (frozen) | Tab order; labels `Live`, `Simulate`, `Calibrate` |

| Tab member | Signature | Contract |
|---|---|---|
| `mount` | `(el, ctx) → void \| Promise<void>` | `el` is the empty `#roomTab` (`display: contents`, in the 12-column grid). Builds its markup, loads its data. A throw or a rejection shows `This tab could not be opened: <message>` (the frame does it). |
| `unmount` | `() → void` | As 3.1: stops timers, dialogs, panels, running simulations; results that arrive later never touch the DOM; never throws |
| `helpers` | object | Pure functions for the Node tests (ignored by the frame) |

| `ctx` member | Type | Contract |
|---|---|---|
| `id` | int | The room id |
| `params` | object | `{}`, or `{ runId }` for `#/rooms/:id/calibrate/:runId` |
| `room()` | `() → Room` | The page's latest Room (C3 3.1), never `null` while the tab is mounted |
| `on(type, fn)` | `→ off()` | `type`: `reading`, `event`, `alarm`, `settings` (stream data of this room only), `room` (the page's Room changed: a stream `room` event, the status refresh or a Restart; `fn(room)`), `open` (`{ reconnect }`, stream reconnects only; the first `open` happened before the tab mounted), `down` (`{ error }`). Called after the frame's own handling, in arrival order. The frame removes every listener of a tab after its `unmount`. |

| Rule | Detail |
|---|---|
| Headless checks of one tab | A check opens the gate 2.5 tree's `index.html` (the prep 2.0 file of 1.2: it already loads `cycle.js`, `equipment.js`, `web/room-tabs.js`, `web/room-equipment.js` and the tab files, so no script is injected) and mounts the tab by hand, without the frame: `FarmRoomTabs.get('<tab>').mount(document.getElementById('view'), ctx)` with a hand-made `ctx` `{ id, params: {}, room: () => R, on }` and `R` from `FarmApi.listRooms()` against the real server. The Room shell's `web/rooms.js` and `web/shell.js` are not on that tree (they merge in wave 3; the tree has the wave 0 `web/rooms.js` stub and the wave 1 `web/shell.js`), so `#/rooms` shows the wave 0 stub's `This part of the app is not installed.` and the check empties `#view` before it mounts. The Room shell's `/* Room page */` CSS block is absent there too: a check makes no layout assertion. `on` either returns `() => {}` or records the listeners so the check can call them (7.10 Live tab). The lead's wave 3 checks run the whole page. |
| Tab switch | Unmounts the old tab: a running capacity check, cycle or equipment check stops and is not saved (lead decision 26); unsaved settings edits are dropped (7.9 "Leaving the page") |

### 3.10 Simulate tab (`web/room-simulate.js`, revision 7)

| Part | Content |
|---|---|
| Explain | `p.explain`: `Simulate = try a plan before you do it. Enter the crop mix, then Check capacity (fast: will the climate hold on a hot-dry, a hot-humid and a rainy day, and how many blocks fit?) or Run a full cycle (spawn run, pinning, fruiting and rest for every flush, with the energy cost). Every result is saved and can later be compared with what really happens.` |
| Load at mount | In parallel: `getMix(id)`, `listCalibrations(id)`, `getSettings(id)`, `listSettingsHistory(id)` (first row = the version used), `getEquipment(id)` (C8; `null` = no machines saved), `listSimulations(id, { limit: 50 })`. Each failure: `errorText` in `#smMsg`; **Check capacity** and **Run a full cycle** stay disabled until mix, calibrations, settings and equipment have loaded. A stream `settings` event of the room (`ctx.on('settings')`, `{ id, room_id, saved_at, note, settings }`) replaces the tab's settings and the version shown (later runs, the machines card's note of 3.12 and the line below use it; a **Your machines** save that changes `airM3h` arrives this way, C3 6.26). |
| Crop mix card | `table.mix-table#smMix`: crop select (`ClimateRoomRules.hasCrop` keys, names from `CROPS`), Blocks (0–200000, rounded), CO₂ per block (empty or 1–1000), Remove; **Add a crop** (`{ crop: 'oyster', blocks: 500 }`). The table edits a **draft** seeded from `getMix` (lead decision 25). **Save as this room's crop mix** (`smSaveMix`, enabled when the draft differs from the saved mix by `sameMix`, 3.7) → `saveMix(id, rows)`; message `Saved. The simulated live room uses <n> blocks after its next restart.` |
| Room values line | `span.chip` `calibrated <YYYY-MM-DD>` (applied run, farm date) or `not calibrated — typical values`; `span.tag` `Settings: version <id> saved <stamp>`; `span.tag` `Machines: <ac(hp)> aircond, <fog> L/h fogger, <air> m³/h air exchange` (C8 8.1 `{ac}` form; `<air>` = the Equipment's `air_m3h`) or `Machines: typical (not saved)` |
| Options | `select#smRegion` (own keys of `ClimateCapacity.DESIGN_DAYS`; text `Lowland Peninsular Malaysia` for `my-lowland`, the key otherwise); `input#smTariff` (number, RM per kWh, 0–10, step 0.01, default 0.57); `input#smEmpty` (capacity only: too empty below %, default `ClimateCapacity.VERDICT.emptyBelow`) |
| Buttons | **Check capacity (≈ 2 s)** `smCap`; **Run a full cycle** `smCycle`, text `Run a full cycle (<D> days)` with `D = ClimateCycle.cycleDays(settings.farmType, settings.program)`; **Open test bench** `a.btn[href="#/simulator/<id>"]`. While a run runs: both run buttons, the mix table and **Save as this room's crop mix** are disabled. |
| Long cycle | `D > 180`: `confirm('This program is <D> days long and may take several minutes in the browser. Run it?')` (lead decision 26) |
| Run inputs | `room = { name, volume, airM3h, calib, plant }`: `airM3h` = the tab's settings `airM3h` (the size the live room and its controller use, C9 8 `airOf(room)`; without it every run would use 1800); `calib` = the applied calibration mapped as C3 8, or `null`; `plant = equipment ? ClimateEquipment.plantOf(equipment, { volume, calib }) : undefined` (capacity and cycle use the room's machines, lead decision 35); `mix` = the draft mapped to capacity form; `inputs` = C3 3.10.1: `mix`, `settings` (the tab's settings; the run's air size is `inputs.settings.airM3h`, no other `inputs` key holds it), `region`, `tariff`, `volume`, `calibration` = exactly `{ id, ua, inf_ach, moist_buffer, co2_per_block }` of the applied Calibration row (no other key; `null` without an applied run), `empty_below` (capacity) or `null` (cycle), and `equipment` = the Equipment's 7 fields (`ac_hp, ac_units, fog_lph, air_m3h, walls, roof, height`) or `null` |
| Running | Cycle: the tab steps `ClimateCycle.runCycleSteps(room, mix, { settings, region, tariff })` itself, awaiting `setTimeout(0)` after each Progress and stopping when unmounted; progress `div.run-progress` width `day / days`, text `Day <day> of <days> · <STAGES[stage]>[ · flush <flush>]`. Capacity: `ClimateCapacity.checkSteps(room, mix, { region, tariff, emptyBelow })` the same way, text `Simulation run <n>…` (today's texts). |
| Finished | `createSimulation(id, { kind, inputs, result })` → the run joins the top of the saved list; message `Saved as run <id>.` A rejection: the result stays on screen, `The result was not saved: <errorText>`. An input error thrown by the generator: `The run stopped: <message>`, nothing saved. |
| Result card, capacity | `section.card.result-card`: today's capacity report (verdict chip, holds `<max>` blocks of `<planned>` (`<utilisation> %`), utilisation bar, limit text, design-day table), from the wave 1 `renderReport` |
| Result card, cycle | Chip `all stages pass` (good) / `<n> stage(s) fail` (bad) / `impossible` with `why`; line `<days> days · <flushes> flushes · <kWh> kWh · RM <rm> · RM <rmPerBlock> per block`; table Stage, Flush, Days, Temp in band %, RH ok %, CO₂ ok %, Max core °C, Alarms (`id ×count`), kWh, RM, Result (`Pass` or the `fails` texts; spawn RH and CO₂ shown as `not judged`); note `Spawn run judges temperature and block core only (the bags are sealed).`; prediction chart `FarmCharts.createTrendCharts` (`keys: ['T', 'RH', 'C']`, `clock: FarmUi.simClock(0)`) with points `{ t: h × 3600, T, RH, C: CO2, core, spT, spRH, co2Lim }` (targets of the hour's segment) |
| Equipment slot (C8) | `div.contents[data-slot="equipment-check"]`: its own grid item after the Result card and before Saved runs (not inside the mix card, where the buttons sit). At mount the tab calls `FarmEquipmentCard.mount(slot, { id, equipment, runInputs, onEquipment, onSaved })` (3.12): `runInputs()` returns the cycle inputs of the row "Run inputs" without `plant`; `onEquipment(eq)` replaces the tab's `equipment` (later runs and the machines line use it); `onSaved(info)` adds the run to the top of Saved runs. The tab's `unmount` calls the card's `unmount()`. When `FarmEquipmentCard` is not defined (a tree without the Equipment merge), the slot shows `p.est-note` `The machines check is not installed.` |
| Saved runs card | `table.run-list#smRuns`, built from the SimulationRunInfo rows of `listSimulations` only (they have no `result`, C3 3.9): Run (`Cycle` / `Capacity` / `Equipment` · `clock.stamp(created_at)`), Mix (`<blocks> <crop name>` joined with ` + `), Result chip `info.verdict` for every kind, by the table "Saved runs chips" below, Energy (cycle: `RM <rm / blocks> per block`; capacity: `<utilisation> %`; equipment: `–` in the list: **Open** shows the report with its `buy …` texts), Note; actions **Open** (`getSimulation` → the result card; for kind `equipment`: `FarmEquipmentCard.renderReport(resultEl, result)`), **Compare with real** (a cycle that ran: link `#/rooms/<id>/calibrate/<runId>`; none for capacity and equipment), **Note** (`prompt`, `updateSimulation(id, runId, { note })`), **Delete** (`confirm('Delete this run? It cannot be undone.')`, `deleteSimulation`); **Older** with `before` |
| Saved runs chips (buildability check) | `info.kind` and `info.verdict` → chip `{ lvl, icon, text }`: cycle `pass` → `good` ✓ `Passes`; cycle `fail` → `warning` ✕ `Fails`; capacity `good` → `good` ✓ `Good`; `tight` → `info` ● `Tight`; `too-dense` → `warning` ✕ `Too many blocks`; `too-empty` → `info` ● `Too few blocks`; equipment `enough` → `good` ✓ `Enough`; `too-small` → `warning` ✕ `Too small`; `too-big` → `warning` ✕ `Too big`; `oversized` → `info` ● `Bigger than needed`; any kind `impossible` → `warning` ✕ `Impossible`; anything else → `info` ● the verdict as stored. Order of the list: newest first (C3 6.20) |
| `machinesText(equipment)` | `null` → `Typical machines`; else `<ac(ac_hp, ac_units)> aircond · <fog_lph> L/h fogger · <int(air_m3h)> m³/h air exchange · <walls and roof labels, or Typical walls>` |
| `airLive(null)` | Returns `{ state: '–', glance: '–', chip: null, day: '' }` (a stopped room or no reading yet) |
| `helpers` | `toCapacityMix`, `toMixRows`, `sameMix`, `appliedCalib`, `runInputs(kind, data)` (the row "Run inputs": `room` with `airM3h`, and `inputs.calibration` exactly `{ id, ua, inf_ach, moist_buffer, co2_per_block }` or `null`), `cycleSummary(result)`, `stageRows(result)`, `seriesPoints(result)`, `runRowTexts(info)` (from a SimulationRunInfo only: the Result chip and the Energy text of Saved runs; equipment Energy `–`), `progressText(progress)`, `machinesText(equipment)` |
| Node tests with machines | Before gate 2.5 `ClimateEquipment.plantOf` is the prep 2.0 stub and throws `Error('stub')`. A Node test of the with-equipment branch replaces `globalThis.ClimateEquipment.plantOf` with a recorder (`(eq, room) => ({ ac: { capW: 1 }, args: [eq, room] })`) for that test, restores it in `t.after`, and asserts the arguments (`{ volume, calib }`). The real mapping is checked by the headless check after gate 2.5. |

### 3.11 Calibrate tab (`web/room-calibrate.js`, revision 7)

| Part | Content |
|---|---|
| Explain | `p.explain`: `Calibrate = make the virtual room behave like this real room. The room's recorded history is already on the farm server: pick a few days and press Fit. The app replays those days in its virtual room and adjusts four room values until it matches what really happened. Then Simulate gives answers for this room, not an average one.` |
| Load at mount | 3.6 step 1 (`getMix`, `listCalibrations`, `getEquipment`, `getSettings`) |
| Machines warning (lead decision 50) | `p.tag#cbStale`, shown when the room has an applied calibration and `sameMachines(applied.equipment, equipment)` is `false`: `The applied calibration (<YYYY-MM-DD>) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.` `sameMachines(a, b)`: both `null`, or both objects with equal `ac_hp`, `ac_units`, `fog_lph`, `air_m3h`, `walls`, `roof`, `height` (`equipment` reduced to these 7 fields). A calibration saved before upgrade 3 has `equipment` `null`, so it warns once machines are saved. |
| Source | `div.seg#cbSource`: `This room's history` (default), `Log file (CSV)` |
| History range | `input#cbFrom`, `input#cbTo` (type `date`, farm days); default: `cbFrom` = yesterday, `cbTo` = today (farm days), so the range reaches now and covers readings of the last hours; at most 7 days (C3 6.8 raw limit); **Load** reads `getReadings(id, { from: <from 00:00 farm>, to: min(now, <to + 1 day 00:00 farm> − 1) })` (raw), then shows `<days> days · <n> readings`; fewer than 120 readings: `Not enough readings in these days (at least 1 h).`; gaps over 10 min: `The range has <g> gap(s) (the server was stopped); the fit keeps the machines unchanged through them.` |
| History log | `logFromReadings(readings)` (table below) → calib.js rows |
| Log file | The wave 1 file input (`calFile`, `parseCsv`) and the CSV columns `details` |
| Blocks | `input#calBlocks` as 3.6 step 2 |
| `envBase` | 3.6 step 3 (`blockStage` from the log rows; `plant` from the room's machines; `airM3h` from the room's settings). `calib.js` `replay` follows each row's `stage` (Bench stream, lead decision 23); rows without `stage` (CSV, old readings) keep `envBase.blockStage`. Before the Bench merge (wave 3), `replay` ignores `stage`: the Calibrate tab's tests and check assert no fit result that depends on it. |
| Start values, replay, **Fit** | 3.6 steps 4–5, unchanged |
| Table | `table.fit-table`: Room value (`ClimateCalib.PARAMS[k].label`), Now, Fitted, then the error row `T / RH / CO₂`; below it `p.tag` = `ClimateCalib.PARAMS.ua.note` when it is a string, else no `p.tag` (lead decision 28; the label and the note are the Bench stream's, merged in wave 3 after this tab, so this tab's tests and check do not assert their text: the Bench row of 7.10 and the lead's wave 3 check do) |
| **Save and apply** | 3.6 step 6 (body with `source`, `log_from`, `log_to`, `equipment`); message `Applied. Simulate now uses these values.`; the machines warning hides |
| Predicted vs real card | `section.card.pvr-card`: `select#pvRun` (the room's cycle runs that ran, newest first, from `listSimulations`; preselect `ctx.params.runId`); `input#pvStart` (date; default `run.real_start` as a farm date, else empty); **Use this start** → `updateSimulation(id, runId, { real_start })` |
| Comparison | `start` = 00:00 farm time of `pvStart`; when `start > now` no request is made and the tab shows `No real readings for this run yet.` (a `from` after `to` would get 400 `Invalid query`); `run = getSimulation(id, runId)`; `real = getReadings(id, { from: start, to: min(now, start + days × 86400 − 1), step: 3600 })`; pair `series[h]` with the bucket `t = start + h × 3600` (C7 day 0 starts at 00:00 of the simulated clock; farm midnight is a whole UTC hour, so buckets align); charts `FarmCharts.drawCalibCharts(host, { rows: real points, base: { series: <the predicted points [{ t, T, RH, CO2 }]> }, fit: null, labels: { rows: 'Real (sensors)', base: 'Predicted (run <id>)' }, dashed: 'base' })` with `t` = seconds from `start` |
| Differences | `Average difference: <T> °C, RH <RH> %, CO₂ <CO2> ppm over <n> hours.` (each the mean absolute difference over the hours with both values); `Stage agreement: <share> % of hours` (reading `stage` equals the series `stage`; hours whose reading has no `stage` left out); `A big gap means: calibrate again.`; a start in the future or no readings yet: `No real readings for this run yet.` |
| `helpers` | `logFromReadings`, `farmMidnight(dateText)`, `historyGaps(readings)`, `envBaseFor(room, blocks, rows, equipment, airM3h)`, `paramsOfRun`, `startParams`, `defaultBlocks`, `parseBlocks`, `calibBody(fit, rows, source, range, equipment)`, `sameMachines(a, b)`, `pairSeries(series, buckets, start)`, `differences(pairs)` |
| Node tests with machines | Before gate 2.5 `ClimateEquipment.plantOf` is the prep 2.0 stub and throws `Error('stub')`. A Node test of `envBaseFor` with equipment replaces `globalThis.ClimateEquipment.plantOf` with a recorder (`(eq, room) => ({ ac: { capW: 1 }, args: [eq, room] })`) for that test, restores it in `t.after`, and asserts the arguments (`{ volume, calib: {} }`). The real mapping is checked by the headless check after gate 2.5. |

| History log row (`logFromReadings`) | From the Reading `r` (readings in `t` order; `t0` = the first `t`) |
|---|---|
| `t` | `r.t − t0` |
| `hour` | `((r.t + 28800) mod 86400) / 3600` (farm time) |
| `T`, `RH`, `CO2`, `tOut`, `rhOut` | `r.T`, `r.RH`, `r.CO2`, `r.t_out`, `r.rh_out`; `null` when not finite or outside `ClimateController.SENSORS[k]` `min`–`max` (the charts' `plausible` rule) |
| `air`, `fog`, `lights`, `circ` | `r.air` (`0` / `1`, C9 8: the calib.js column `air`), `r.fog`, `r.lights`, `r.circ` |
| `acPower` | `r.ac_mode === 'off' ? 0 : 1` |
| `acMode` | `r.ac_mode === 'off' ? null : r.ac_mode` |
| `acSet` | `r.ac_setpoint` |
| `acFan` | `r.ac_fan` (the AC's own fan speed; `null` in rows written before upgrade 3: calib.js uses `'auto'`) |
| `stage` | `r.stage` |

### 3.12 Your machines card (`web/room-equipment.js`, Equipment stream, C8)

| Part | Content |
|---|---|
| Global | `FarmEquipmentCard = { mount(el, opts) → { unmount() }, renderReport(el, report), helpers }` |
| `opts` | `{ id, equipment (Equipment \| null), runInputs: () => ({ room, mix, settings, region, tariff, inputs }), onEquipment(eq), onSaved(info) }`; `runInputs` returns what the Simulate tab would run a full cycle with: its `room` without `plant`, and `inputs` in the cycle form (C3 3.10.1 with `inputs.empty_below: null` and `inputs.equipment` the saved Equipment's 7 fields or `null`), never the capacity form |
| Markup | `section.card.result-card`, `h3` `Your machines`, `p.explain` `Tell the app which machines this room has. Check my machines runs a full cycle of this crop mix with them, then tries other aircond sizes, and says what is too small and what to buy.`; `form.equip-form`: `select#eqAcHp` (`1 hp` … `6 hp`), `input#eqAcUnits` (1–4), `input#eqFog` (L/h), `input#eqAir` (label `Air exchange (m³/h)`, 50–10000, step 50: `air_m3h`, the airflow of the intake and exhaust pair when on, C9), `select#eqWalls` and `select#eqRoof` (`Not set` + `CONSTRUCTIONS` labels; the roof list only `roof: true`), `input#eqHeight` (m); `button#eqSave` `Save machines`; `button#eqCheck` `Check my machines`; `p.tag#eqAirNote` (row "Air size note"); `div.run-progress#eqProgress`; `p.tag#eqMsg`; `div#eqResult` |
| Air size note | The room's settings `airM3h` (`<b>`, from `runInputs().settings`) is the size the live room and Simulate use; the saved Equipment's `air_m3h` (`<a>`: the value last stored, from `getEquipment` at mount or the `saveEquipment` reply; not the form field) is what the check uses. A save brings `<b>` to `<a>` (C3 6.26), so they differ only when the settings were changed after the last save (or the room has no saved machines: no note). When the room has saved machines and `<b>` differs from `<a>`, `#eqAirNote` shows `The room's settings use <int(b)> m³/h for the air exchange; save your machines to use <int(a)> m³/h there too.` (`int`: C8 8.1, comma between groups of three digits); otherwise it is empty. It is repainted after each save and each `runInputs()` change (a stream `settings` event, 3.10). |
| Save | `checkEquipment` first (problems in `#eqMsg`); `saveEquipment(id, eq)`; message `Saved. Simulate uses these machines now; the live room uses them after its next restart.`; then `opts.onEquipment(saved)`. When `air_m3h` differed from the settings' `airM3h`, the server also saves the room's settings with `airM3h` = `air_m3h` (C3 6.26; the controller uses it at once); the new settings reach the Simulate tab as a stream `settings` event (3.10). |
| Check | Disabled while running or when `commonTargets(mix)` is impossible. Steps `ClimateEquipment.runCheckSteps({ ...room, equipment: <form values> }, mix, { settings, region, tariff })` itself, awaiting `setTimeout(0)` after each Progress, stopping when unmounted. Progress text by `kind`: `ac` `Run <run> · {ac(ac_hp)} aircond · day <day> of <days>` (`U` = the Progress `ac_units`: `Run 2 · 2 × 1.5 hp aircond · day 3 of 78`); `fogger` `Run <run> · <fog_lph> L/h fogger · day <day> of <days>`; `air` `Run <run> · <air_m3h> m³/h air exchange · day <day> of <days>` (the Progress `air_m3h`; the number of runs is not known in advance); bar width `day / days`, restarting with each run. |
| Finished | `createSimulation(id, { kind: 'equipment', inputs: { ...runInputs().inputs, empty_below: null, equipment: formValues(form) }, result: report })` (C3 7.6: `empty_below` `null` and `equipment` set for kind `equipment`) → `opts.onSaved(info)`, message `Saved as run <id>.`; a rejection keeps the result on screen with `The result was not saved: <errorText>` |
| `renderReport(el, report)` | `impossible`: `p` with `why`. Else: each `summary` line a `p` (the first in `strong`); table `Aircond sizes tried` (`table.run-list`): Aircond (`{ac(hp)}`), Fruiting hours at `{spT}` °C (`pct` %), Worst stage (`<stage> <flush>: <pct> %`), kWh per block (2 decimals), RM per block (2 decimals), Result (`holds it` / `too small` / `too big` (when `tooBig`)), with tags `smallest that works` on `min` and `buy this` on `recommended`; table `Your machines`: Machine, Yours, Verdict, Buy (rows aircond, fogger, air exchange (report key `air`: verdict `enough`, `too-small`, `not-the-fix` or `oversized` (lead decision 58), Buy its `recommended` m³/h, empty when `recommended` is `null`: `enough` and `not-the-fix` show no Buy), walls and roof); table `Where the heat comes from (fruiting hours, with {ac(breakdown.ac_hp)})`: Source (`label`), kWh (heat, whole number), Share (`span.equip-bar` + `round(share)` %); a confirmation run row lists under `Also tried` |
| `unmount` | Stops a running check (nothing saved), removes listeners; a late result never touches the DOM |
| `helpers` | `formValues(form)` (the 7 fields in the order `ac_hp, ac_units, fog_lph, air_m3h, walls, roof, height`), `fillForm(form, eq)`, `progressText(p)` (kinds `ac`, `fogger`, `air`), `runRows(report)`, `machineRows(report)`, `heatRows(report)`, `airNote(a, b)` (`a` = the saved Equipment's `air_m3h` or `null` when the room has none, `b` = the settings' `airM3h`: the row "Air size note" text, or `''` when `a` is `null` or `a === b`) |
| Text rules (buildability check) | Every m³/h, W and block count in the card's texts and tables prints with a comma between groups of three digits (`1,800`, the C8 8.1 `{int}` rule); `machineRows`: columns Machine, Yours (`{ac(own)}` for the aircond, `<fog_lph> L/h`, `<int(air_m3h)> m³/h`, the walls and roof labels or `Typical`), Verdict (the verdict text: `enough` → `Enough`, `too-small` → `Too small`, `too-big` → `Too big`, `oversized` → `Bigger than needed`, `not-the-fix` → `Not the fix`; insulation `poor` / `fair` / `good` → `Poor` / `Fair` / `Good`), Buy (empty when `recommended` is `null`; aircond `{ac(recommended)}`, fogger `<recommended> L/h`, air exchange `<int(recommended)> m³/h`); `runRows`: the Worst stage cell uses the `STAGES` name in lower case and the flush (`pinning 1: 97 %`) |

---

## 4. `web/api.js` (C5)

### 4.1 General

| Item | Contract |
|---|---|
| Base address | `FarmApi.base`, a string, default `''` (same origin). Tests set it to `http://127.0.0.1:<port>`. |
| Request | `fetch(base + path, { method, headers, body })`. With a body: `Content-Type: application/json` and `body = JSON.stringify(body)`. Always `Accept: application/json`. |
| Path values | Room ids, version ids, run ids, batch ids and crate ids (C10) are integers put in the path as decimal; `alarmKey` goes through `encodeURIComponent` |
| Query values | Integers, except `state` of `listBatches`, a string (`received`, `placed` or `cleared`; C10 12.1). A key whose value is `undefined` or `null` is left out of the query. |
| Success | Any 2xx status. Body parsed as JSON and returned unchanged. Status 204 or an empty body resolves `null`. |
| Failure | Every function returns a Promise that rejects with an `ApiError` (4.2), except the one `getCapacity` case of 4.3. No retries, no time-out (the stream's watchdog, 4.4, is the only timer). |

### 4.2 Errors

`FarmApi.ApiError` is a class that extends `Error` (`name: 'ApiError'`, `message` = `error`). Every rejection carries:

| Field | Type | Value |
|---|---|---|
| `status` | integer | The HTTP status (400, 404, 500, …), or `0` when the server cannot be reached |
| `error` | string | The `error` of the C3 error body. Status 0: `'The farm server cannot be reached.'`. Error body that is not JSON: `'HTTP <status>'`. 2xx with a body that is not JSON: `'The server sent a reply that is not JSON.'` |
| `details` | array | The `details` of the C3 error body, or `[]`. Status 0: `[<the fetch error message>]`. |

### 4.3 Functions (one per C3 route)

`id` is a room id, `batchId` a batch id, `crateId` a crate id. Every argument and every result is the C3 or C10 JSON, passed through unchanged. The last ten rows before `stream` are C10 12.1 (C10 resources, C10 6; routes C10 9); the lead adds them in prep 2.0 and tests them in `tests/web-api.test.js` (7.10).

| Function | Route | Arguments | Resolves to |
|---|---|---|---|
| `listRooms()` | `GET /api/rooms` | – | `Room[]` as C3 section 3.1 (`live` with `reading`, `stage`, `crop`, `targets`, `status`, `alarms`, `running`, `error`, from revision 7 `flush`, `blocks`, and from revision 8 `air`, the air exchange summary of 3.4) |
| `createRoom(room)` | `POST /api/rooms` | `room`: `{ name, volume, settings? }` | `Room` |
| `updateRoom(id, fields)` | `PATCH /api/rooms/:id` | `fields`: only the changed C3 fields (`name`, `volume`, `archived: true`) | `Room` |
| `restartRoom(id)` | `POST /api/rooms/:id/restart` | – | `Room` after the restart (when the loop fails again: `live.running` = `false` with the new `live.error`) |
| `getSettings(id)` | `GET /api/rooms/:id/settings` | – | Settings |
| `saveSettings(id, settings, note)` | `PUT /api/rooms/:id/settings` | `settings`: Settings; `note`: string, optional (left out of the body when `undefined` or `''`) | `{ settings, warnings }` (`warnings`: string[]) |
| `listSettingsHistory(id)` | `GET /api/rooms/:id/settings/history` | – | `SettingsVersion[]` (`{ id, room_id, saved_at, note }`) |
| `restoreSettings(id, versionId)` | `POST /api/rooms/:id/settings/restore/:versionId` | – | `{ settings, warnings }` |
| `getReadings(id, { from, to, step })` | `GET /api/rooms/:id/readings?from=&to=&step=` | `from`, `to`: Unix time; `step`: seconds, optional | `Reading[]` |
| `getEvents(id, { limit, before })` | `GET /api/rooms/:id/events?limit=&before=` | Both optional. `limit`: integer 1–500. `before`: an event id (integer); only events with `id` < `before` are returned (the next page: the smallest id of the last page) | `Event[]`, newest first (`id` descending) |
| `getAlarms(id)` | `GET /api/rooms/:id/alarms` | – | `Alarm[]` |
| `ackAlarm(id, alarmKey)` | `POST /api/rooms/:id/alarms/:alarmKey/ack` | – | `Alarm` |
| `listCalibrations(id)` | `GET /api/rooms/:id/calibrations` | – | `Calibration[]` |
| `saveCalibration(id, run)` | `POST /api/rooms/:id/calibrations` | `run`: the C3 Calibration input (fitted `ua` W/K, air leakage per hour, moisture buffer, CO₂ per block mL/h; RMSE of T °C, RH %, CO₂ ppm; number of log rows) | `Calibration` |
| `applyCalibration(id, runId)` | `POST /api/rooms/:id/calibrations/:runId/apply` | – | `Calibration` |
| `getMix(id)` | `GET /api/rooms/:id/mix` | – | `MixRow[]` (`{ crop, blocks, co2_per_block }`) |
| `saveMix(id, rows)` | `PUT /api/rooms/:id/mix` | `rows`: `MixRow[]` | `MixRow[]` |
| `getCapacity(id)` | `GET /api/rooms/:id/capacity` | – | `CapacityReport`, or `null` when the reply is status 404 with `error` = `'No capacity report'` (no report yet). Any other failure rejects with `ApiError`, including 404 `'Unknown room'` (a deleted or archived room). |
| `saveCapacity(id, report)` | `POST /api/rooms/:id/capacity` | `report`: the object from `ClimateCapacity.checkAsync` | `CapacityReport` (legacy, lead decision 19; no wave 2 code calls it) |
| `listSimulations(id, { limit, before })` | `GET /api/rooms/:id/simulations?limit=&before=` | Both optional | `SimulationRunInfo[]` (revision 7, lead prep 2.0) |
| `createSimulation(id, run)` | `POST /api/rooms/:id/simulations` | `run`: `{ kind, inputs, result, note? }` | `SimulationRunInfo` |
| `getSimulation(id, runId)` | `GET /api/rooms/:id/simulations/:runId` | – | `SimulationRun` |
| `updateSimulation(id, runId, fields)` | `PATCH /api/rooms/:id/simulations/:runId` | `fields`: any of `{ note, real_start }` | `SimulationRunInfo` |
| `deleteSimulation(id, runId)` | `DELETE /api/rooms/:id/simulations/:runId` | – | `SimulationRunInfo` |
| `getEquipment(id)` | `GET /api/rooms/:id/equipment` | – | `Equipment` or `null` (C8) |
| `saveEquipment(id, eq)` | `PUT /api/rooms/:id/equipment` | `eq`: the 7 Equipment fields (`ac_hp, ac_units, fog_lph, air_m3h, walls, roof, height`) | `Equipment` (the server also brings the room's settings `airM3h` in step, C3 6.26) |
| `listBatches({ state, room })` | `GET /api/batches?state=&room=` | Both optional: `state` `received`, `placed` or `cleared`; `room` a room id. `listBatches()` sends no query | `Batch[]` (C10 6.1) |
| `createBatch(fields)` | `POST /api/batches` | `fields`: the C10 batch fields | `Batch` |
| `getBatch(batchId)` | `GET /api/batches/:batchId` | – | `BatchDetail` (C10 6.2) |
| `updateBatch(batchId, fields)` | `PATCH /api/batches/:batchId` | `fields`: only the changed batch fields | `Batch` |
| `placeBatch(batchId, body)` | `POST /api/batches/:batchId/place` | `body`: `{ room_id, placed_at? }` | `Batch` |
| `clearBatch(batchId, body = {})` | `POST /api/batches/:batchId/clear` | `body`: `{ cleared_at? }`; always sends a body (`clearBatch(4)` sends `{}`) | `Batch` |
| `deleteBatch(batchId)` | `DELETE /api/batches/:batchId` | – | `Batch` (as before the delete) |
| `getRoomHarvest(id)` | `GET /api/rooms/:id/harvest` | – | `RoomHarvest` (C10 6.4) |
| `addCrate(batchId, body)` | `POST /api/batches/:batchId/crates` | `body`: `{ kg, picker? }` | `CrateSaved` (C10 6.5) |
| `undoCrate(crateId)` | `DELETE /api/crates/:crateId` | – | `Crate` (C10 6.3) |
| `stream(onEvent)` | `GET /api/stream` | `onEvent(type, data)` | Returns a `close()` function at once (not a Promise) |

Mapping between the API and the shared modules is done in the web module, not in `api.js`:

| Web module | API field | Shared-module field |
|---|---|---|
| Simulate tab | `MixRow.co2_per_block` | `capacity.js` / `cycle.js` mix `co2PerBlock` (left out when `null`) |
| Simulate tab, Calibrate tab | The Calibration with `applied` = `true` | `capacity.js` / `cycle.js` / `ClimateRoomRules` room `calib: { ua, infAch, moistBuffer, co2PerBlock, rmse: { T, RH, CO2 }, date }` (`date` = ISO text of `run_at`); `null` without an applied run (C3 section 8) |
| Simulate tab | Equipment (C3 3.11) | `room.plant = ClimateEquipment.plantOf(equipment, { volume, calib })` (3.10) |
| Simulate tab | The room's settings `airM3h` | `room.airM3h` of `capacity.js` / `cycle.js` (C9 8 `airOf(room)`; 3.10) |
| Calibrate tab | The room's MixRows, `volume`, `live.stage`, Equipment, settings `airM3h`, the log rows' `stage` | `envBase` of `ClimateCalib.replay` / `fitAsync` (section 3.6) |
| Calibrate tab | Reading (C3 3.2) | `calib.js` log row (`logFromReadings`, 3.11) |

### 4.4 `stream(onEvent)`

`stream` reads Server-Sent Events with `fetch` and a stream reader (the same code runs in the browser and in Node 22).
This section is the only specification of the client mechanics of `web/api.js`; C4 section 10.3 points here and is
consistent with it (`retry: 3000` first, the `: ping` heartbeat every 15 s of C4 section 10.1). C4's open-then-load,
merge and reconnect rules (10.3, 10.4) apply; the modules apply them on the `open` events below.

| `type` passed to `onEvent` | `data` |
|---|---|
| `reading`, `event`, `alarm`, `settings`, `room` (and any other event name the server sends) | The C4 payload, parsed from JSON, unchanged |
| `open` | `{ reconnect: boolean }`: `false` on the first connection, `true` after each reconnect, whatever caused it (a drop, a fetch error, a non-2xx reply or the watchdog). Sent when a 2xx reply arrives (its headers), before its body is read. A module reloads its data on `reconnect: true` (C4's reconnect rule, section 10.4: on a room page this reloads the last minutes from `GET /readings`). |
| `down` | `{ error: string }`: the connection dropped, failed, or the watchdog found it silent |

| Rule | Detail |
|---|---|
| Watchdog setting | `FarmApi.streamTimeoutMs`: integer, ms, default 45000 (3 × C4's 15 s heartbeat). Read at each connect. Tests set a small value. |
| Connect | `fetch(base + '/api/stream', { headers: { Accept: 'text/event-stream' }, signal })`, with a new `AbortController` per connection |
| Parsing | `event:` sets the name (default `message`); `data:` lines are joined with `\n`; an empty line dispatches; lines starting with `:` are ignored; `id:` is ignored; `retry:` (ms) sets the reconnect delay |
| Bad data | A `data` that is not JSON is skipped with `console.warn` |
| Watchdog | Lead decision 4; C4 section 10.1 refers here. A timer of `streamTimeoutMs` starts at each connect and starts again at every chunk of bytes received (an event, a `retry:` line or a `: ping` comment all count). So when no event and no `: ping` arrives for 45 s (the server pings every 15 s), it fires: abort the request, call `onEvent('down', { error: 'No data from the server for <streamTimeoutMs / 1000> s' })` (`No data from the server for 45 s` by default), and reconnect as after a drop. It finds a connection that a phone's network change or a half-open TCP connection left silent. |
| Reconnect | After a drop (the body ends), a fetch error, a non-2xx reply, or a watchdog abort: exactly one `down` for that connection, wait the delay (default 3000 ms, or the last `retry:`), connect again. Forever, until `close()`. |
| `onEvent` throws | Caught and logged with `console.error`; the stream continues |
| `close()` | Aborts the request, stops the watchdog, cancels a pending reconnect; no `onEvent` call after it; calling it twice is harmless |

### 4.5 Fake API server (`tests/fakes/api-server.js`, written by the lead in wave 0)

The fake that the spec lists in `tests/fakes/` ("a fake API server (C3)"; lead decision 7). `tests/web-api.test.js`
runs against it; no stream writes its own. CommonJS: `module.exports = { startFakeApi }`. It requires only `node:http`,
`node:fs` and `node:path` (never a `server/` file or a `web/` file). It is a real `node:http` server on `127.0.0.1` with no route logic: it records each request and
answers with the defaults below or a reply set by the test. Without `root` it serves no page; with `root` it also serves
the page's files, so a headless Chrome check can drive a page against replies the test sets (the Restart check of
section 7.10). The other wave 2 headless Chrome checks run against the real server (section 7.10). The lead tests the
fake itself in `tests/fake-api-server.test.js` (wave 0), `root` included.

| Export | Signature | Contract |
|---|---|---|
| `startFakeApi` | `(options?: { retryMs?: integer, root?: string }) → Promise<FakeApi>` | Listens on `127.0.0.1` on a free port (`listen(0)`); resolves when listening. `retryMs` (default 3000) is the value of the `retry:` line the stream sends first; tests pass a small value (for example 50) to test a reconnect quickly. `root` (default none): an absolute path to a repo folder (a worktree). When given, every `GET` or `HEAD` whose path is not under `/api/` is answered from the files under `root` with exactly the rules of C3 section 9 (the same paths, `Content-Type`s, path safety, `Cache-Control: no-cache`, and the `text/plain` 404 `Not found`); `reply` does not apply to these paths. |

| `FakeApi` member | Signature | Contract |
|---|---|---|
| `url` | string | `http://127.0.0.1:<port>` (no trailing `/`); tests set `FarmApi.base = url` |
| `requests` | `{ method, path, query, body }[]` | Every request received, in order, including `GET /api/stream`. `method`: upper case. `path`: the URL path without the query, not decoded (`/api/rooms/1/alarms/rh%20Hi/ack` stays encoded). `query`: plain object of the query parameters, string values (`Object.fromEntries(new URLSearchParams(...))`), `{}` when none. `body`: the parsed JSON body, or `null` when the body is empty; a body that is not JSON is kept as its text. |
| `reply` | `(method: string, pathPattern: string \| RegExp, status: integer, body: any) → void` | Sets the answer for requests with this method whose path equals `pathPattern` (a string) or matches it (a RegExp). It holds for every later matching request until `close()`; a later `reply` for the same method and pattern replaces it; when two patterns match, the one set last wins. `body`: any JSON value is sent with `JSON.stringify` and `Content-Type: application/json; charset=utf-8`; a string is sent as it is with `Content-Type: text/plain; charset=utf-8` (to test a reply that is not JSON); `undefined` sends an empty body. |
| `emit` | `(name: string, data: any) → void` | Writes `event: <name>\ndata: <JSON.stringify(data)>\n\n` to every open stream connection. |
| `dropStreams` | `() → void` | Ends every open stream connection (`res.end()`); the server keeps listening, so the client reconnects. |
| `close` | `() → Promise<void>` | Ends every open connection and closes the server; afterwards the port is unreachable (status 0 case). |

| Request without a `reply` | Default answer |
|---|---|
| `GET /api/stream` | 200, `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-store`; writes `retry: <retryMs>\n\n` at once, then only what `emit` sends (no `: ping`, so a silent connection triggers the client's watchdog). The connection stays open until `dropStreams()`, `close()` or the client aborts. |
| `GET` of a C3 route whose reply is an array: `/api/rooms`, `/api/rooms/:id/settings/history`, `/readings`, `/events`, `/alarms`, `/calibrations`, `/mix`, `/simulations` (revision 7), and the C10 route `/api/batches` (with or without a query; C10 14, prep 2.0) | 200, `[]` |
| `GET /api/rooms/:id/equipment` (revision 7) | 200, `null` (a room without machines) |
| Any other `GET` under `/api/` | 200, `{}` |
| `POST`, `PUT`, `PATCH` under `/api/` | 200, the request body echoed as JSON (`null` when the request had no body). The fake has no route logic: a check that needs a server-made field (for example `room_id`, `saved_at`, `id`) sets it with `reply`. |
| `DELETE` under `/api/` (revision 7) | 200, `{}` |
| `GET` or `HEAD` of a path not under `/api/`, with `root` | The file under `root` by C3 section 9 (above). The served shared modules are `/controller.js`, `/sim.js`, `/air.js`, `/runtime.js`, `/capacity.js`, `/calib.js`, `/room-rules.js`, `/cycle.js`, `/equipment.js`, `/harvest-rules.js` (C10 10): the list on `master` 6a12852 lacks `/air.js` (a C9 gap), `/cycle.js`, `/equipment.js` and `/harvest-rules.js`; the lead adds them in prep 2.0 (1.7), tested in `tests/fake-api-server.test.js`. The other C10 files (`/web/harvest.css`, `/web/batches.js`, `/web/harvest.js`, `/web/vendor/qrcodegen.js`) are covered by C3 9's `/web/<path>` rule |
| Any other method, or a path not under `/api/` (without `root`, or a method other than `GET` and `HEAD`) | 404, `{ "error": "Unknown route", "details": [] }` |

Every request is recorded in `requests`, the file requests of `root` included; a check reads only the `/api/` entries.

---

## 5. `web/ui.js`

| Member | Signature | Contract (moved from `app.js` unless noted) |
|---|---|---|
| `set` | `(id, text) → void` | Sets `textContent` of `document.getElementById(id)` when it differs; no-op when the element is missing |
| `cell` | `(tag, text) → Element` | |
| `svgEl` | `(tag, attrs, parent?) → SVGElement` | |
| `paintChip` | `(el, chip) → void` | `chip`: `Chip` (6.1) |
| `clamp` | `(v, lo, hi) → number` | |
| `fmtNum` | `(x, decimals) → string` | `'—'` when not finite |
| `fmtDur`, `fmtMinSec`, `watts`, `pct`, `nf` | `(number) → string` | `nf` = today's capacity `nf` (rounded, `en` grouping) |
| `ICON`, `LVL_RANK` | objects | Today's tables |
| `simClock` | `(startHour) → Clock` | New. `offset` = `startHour × 3600`; `hm` = `HH:MM`; `stamp` = `D<day> HH:MM:SS`; `label` = `Day <day> · HH:MM` (today's `fmtHM`, `fmtStamp`, `fmtClock`) |
| `farmClock` | `() → Clock` | New. `offset` = 28800 (UTC+8); `hm` = `HH:MM`; `stamp` = `YYYY-MM-DD HH:MM:SS`; `label` = `YYYY-MM-DD HH:MM`; all from `t + 28800` with UTC getters (no time-zone database) |
| `errorText` | `(err) → string` | New. `ApiError`: `error`, then `': '` and `details` joined with `'; '` when there are details. Other errors: `err.message`. |

---

## 6. `web/charts.js` (C5)

### 6.1 Types

| Type | Fields |
|---|---|
| `Clock` | `offset` (s added to `t` to get local seconds since a midnight), `hm(t) → string`, `stamp(t) → string`, `label(t) → string`. Night is 19:00–07:00 local. |
| `Chip` | `{ lvl: 'critical' \| 'serious' \| 'warning' \| 'good' \| 'info' \| 'none', icon: string, text: string }` |
| `ChartPoint` | `t` (s, simulation or Unix time), `T` °C, `RH` %, `C` CO₂ ppm, `tOut` °C, `rhOut` %, `core` °C (optional), `spT`, `spRH`, `co2Lim`, `fanOn`, `fanOff` (targets for the bands; `fanOn`, `fanOff` are the purge start and stop levels, C9 5.2), `ac`, `hu`, `air`, `li`, `ci` (W, power chart only; `air` is the air exchange, legend `Air exchange`, C9 7). A missing value is `NaN` or `undefined` and draws as a gap. Other fields are kept and ignored. |
| `View` | `{ t0, t1, pts: ChartPoint[] (sorted by t), gapS?: number }`; `gapS` (default `Infinity`): a line breaks where two points are more than `gapS` apart |

### 6.2 Functions

| Function | Signature | Contract |
|---|---|---|
| `lowerBound` | `(pts, t) → number` | First index with `pts[i].t ≥ t` |
| `nearest` | `(pts, t) → ChartPoint \| null` | |
| `aggregate` | `(pts, maxN) → ChartPoint[]` | Today's bucket average of `T, RH, C, tOut, rhOut, ac, hu, air, li, ci, acSet, core, vpd`; other fields from the bucket's last point; `t` = bucket middle |
| `niceTicks` | `(lo, hi, n) → number[]` | |
| `linePath` | `(pts, X, Y, f, gapS = Infinity) → string` | SVG path; breaks at non-finite values and at time gaps over `gapS` |
| `areaPath` | `(pts, X, Y, lo, hi) → string` | |
| `barPath` | `(x, y, w, h, r) → string` | |
| `createTrendCharts` | `(el, opts) → { draw(view), destroy() }` | 6.3 |
| `drawPurgeBars` | `(host, hours, clock) → void` | C9 7 (replaces wave 1's `drawExhaustBars`). Replaces `host`'s content with the bar chart "Air exchange run minutes per hour". `hours`: 24 × `{ h, runS, starts, m3, cappedN }` (`h` = whole hours of simulation time, the hour buckets of `ctl.purges()`, C9 5.7); the current hour is the last bucket's `h`; each bar's title `<HH:MM>–<HH:MM>: <min> min, <starts> purges, <m3> m³, <cappedN> capped`. Labels every 3 local hours. Used by the Test bench only in wave 2 (3.4). |
| `drawCalibCharts` | `(host, { rows, base, fit, labels?, dashed? }) → void` | `host` is a `div.cal-charts` (3.11: the fit charts and the Predicted vs real charts each have their own). Replaces `host`'s content with today's three calibration charts and key. `rows`: parsed log `[{ t, T, RH, CO2 }]` (t = s from the log start); `base`: `ClimateCalib.replay` result, or any `{ series: [{ t, T, RH, CO2 }] }` (it reads `base.series`; Predicted vs real wraps its points so, 3.11); `fit`: the fitted result or `null`. Revision 7 (Calibrate tab stream): `labels`: optional `{ rows, base, fit }` strings for the key (defaults: today's texts); `dashed`: optional `'base'`, `'fit'` or `null`, which simulated line is dashed (default: today's). Used by Predicted vs real (3.11). |
| `createLadder` | `(el) → { draw(settings, co2, chips), destroy() }` | Builds today's CO₂ rules ladder in `el` (`el` gets class `ladder`). `draw` lays out the scale from `settings.co2Lim` and `settings.rules`, places the CO₂ marker at `co2` (hidden when `NaN`), paints `chips = { air: Chip }` (hidden when `null` or absent). C9 7: one row `{ key: 'air', name: 'Purge', hi: rules.fanOn, lo: rules.fanOff }`; its chip shows the state (`Idle`, `Purging`, `Delayed`, `Safety run`). Cheap enough to call every UI update. |

### 6.3 `createTrendCharts(el, opts)`

| Option | Type | Default | Meaning |
|---|---|---|---|
| `keys` | `('T' \| 'RH' \| 'C')[]` | `['T', 'RH', 'C']` | Trend cards to build, in this order |
| `power` | boolean | `false` | Also build the stacked power card (legend and tooltip) |
| `clock` | `Clock` | required | Axis labels, night shading, hover time |
| `status` | `(kind: 'T' \| 'RH' \| 'CO2') → Chip \| null` | none | Chip beside each sub-line (the Simulator passes `ctl.status`) |

| Returned | Contract |
|---|---|
| `draw(view)` | Aggregates `view.pts` to at most 700 points and draws every card: band, target line, value line, outdoor line, core line (T), live-edge labels, readout and sub-line (today's texts), chip. Keeps the view for hover and resize. |
| `destroy()` | Disconnects the `ResizeObserver`s, cancels a pending redraw, removes the cards |

The cards are today's markup (classes `card trend` and `card power`, without the ids) and are appended as children of
`el`; `el` may be a `div.contents` (`display: contents`) so the cards join the module's grid. Hover, the arrow keys and
Escape work as today, with one crosshair shared by the cards of the set; a hover or a resize redraws the set itself
(one `requestAnimationFrame`).

---

## Settings editor

### 7.1 Purpose (C6)

`web/settings-panel.js` is today's settings panels as one reusable part that edits one Settings object. It never calls
the API and never touches a controller. The Test bench uses it with its local controller; the Live tab with a live
room's settings.

### 7.2 `createSettingsPanel(el, options) → SettingsPanel`

Global: `FarmSettingsPanel.createSettingsPanel`.

| Option | Type | Default | Contract |
|---|---|---|---|
| `settings` | Settings | required | Copied with `structuredClone`; the caller's object is never changed |
| `readOnly` | boolean | `false` | Every control disabled; `onChange` never called |
| `onChange` | `(changes: Change[], settings: Settings) → void` | none | Called once per user action that changed something; `changes` = this action only (old → new), including the panel's own corrections; `settings` = a deep copy of the whole edited object |
| `getCommand` | `() → Command \| null` | none | Bumpless transfer (7.4). `Command` = the controller's `state.cmd` format `{ ac: { power, mode?, setpoint? }, hu: { level }, air: { on }, lights: { on }, circ: { on } }` (C9 5.1). `ac.mode` and `ac.setpoint` may be absent when `ac.power` is `false` (the room page's Command, 7.9). |

| Method | Signature | Contract |
|---|---|---|
| `get` | `() → Settings` | Deep copy of the edited object |
| `set` | `(settings) → void` | Replaces the edited object with a deep copy and repaints every control, except the control that has focus (its text stays until the user commits it). Never calls `onChange`. Does not touch slots. |
| `diff` | `(base: Settings) → Change[]` | `diffSettings(base, get())` |
| `destroy` | `() → void` | Removes the `farm-level` listener and empties `el`; no `onChange` afterwards. The other methods must not be called after it. |

### 7.3 Markup and slots

The panel appends three cards to `el` (give `el` class `contents` so they join the module's grid). Markup and ids are
today's (`index.html`, the targets card, the rules card, the faceplate controls).

| Card | Classes | Content | Visible to |
|---|---|---|---|
| Crop and stage, Targets, Installer: program and room | `card targets` | Today's three sections (the installer section has C9's `inAirSize` next to Room volume); the status lines are replaced by slots | Farmer; the installer section has `inst` |
| Air exchange and CO₂ (C9 7) | `card rules` | Header `Air exchange and CO₂`, left column (`div.inst`: the three rule fieldsets `ruleSafe` Priority 1 · CO₂ safety level, `ruleRh` Priority 2 · Humidity first, Priority 3 · CO₂ purge, and "Fixed values"), right column = slot `rules-side` | Farmer sees the right column only (today's CSS) |
| Machines | `card machines` | Per machine (Air conditioner, Fogger, Air exchange, Lights, Circulation fan): name, the Auto/Manual switch (`.seg[data-dev]`), the manual fieldset (`acManual`, `huManual`, `airManual` with the checkbox `airOnChk` "On (both fans)", `lightsManual`, `circManual`) | Farmer |

| Slot (`[data-slot]`, an empty `div`) | Position | Today's content there |
|---|---|---|
| `program-status` | Crop and stage, after Stage | `progStatus`, `progRamp`, `progHarvest` |
| `crop-check` | End of Crop and stage | `cropCheck` |
| `targets-status` | Targets, after the humidity target | `vpdLine` |
| `rules-side` | Air exchange and CO₂, right column | Ladder (one row `Purge`, C9 7), ladder note, duty counters |

The user of the panel finds a slot with `el.querySelector('[data-slot="…"]')` and fills it. The panel never writes into
a slot.

### 7.4 Behaviour

| Topic | Contract |
|---|---|
| When a change counts | Range sliders on `input` (continuous, as today); other inputs and selects on `change`; stage buttons and Auto/Manual on `click` |
| Field rewrite | After a commit, each control shows the stored value (a clamped number, a parsed time list) |
| Corrections | The input rules of 7.7, including the coupled values (the purge start and stop pair and the humidity pair; farm type → stage). The corrections are part of the same `changes`. |
| Crop, stage, farm type | The panel changes only `crop`, `stage`, `farmType` (and `stage` when the farm type does not use it). It does not change the targets: the owner of the controller applies the stage program (7.8, 7.9). |
| Bumpless transfer | When a machine goes from Auto to Manual and `getCommand()` returns a Command, the panel first copies that machine's command into `manual.<dev>`. AC: `power` always; `mode` only when the Command's `ac.mode` is one of `cool`, `heat`, `dry`, `fan`; `setpoint` only when `ac.setpoint` is a finite number (held in 16–30). Fogger: `level`. Air exchange, lights and circulation: `on`. A value that is not copied keeps the stored `manual.<dev>` value. Without a Command, all stored manual values stay. |
| Manual fieldset | Disabled while its machine is on Auto |
| Settings level | `spT`, `spRH`, `co2Lim` (class `lockable`) are disabled unless `document.body.dataset.level === 'installer'`; the panel listens to `farm-level` on `document`. Installer parts are hidden by the existing CSS. |
| Visibility | Spawn and pinning days only when `farmType === 'full'`; fieldsets `ruleRh`, `ruleSafe` get class `off` when their switch is off |
| Derived texts | `rRhStopAbs` = `(spRH − rules.rhStop %)`, `rRhResumeAbs` = `(spRH − rules.rhResume %)`, from the edited object |
| No change | A commit that leaves every value equal calls no `onChange` |

### 7.5 Change list format

| Field | Type | Meaning |
|---|---|---|
| `path` | string | Dot path of the setting, for example `rules.fanOn`, `program.harvest.times` |
| `label` | string | Label from 7.7; for a setting without a control, the path itself |
| `old` | number \| string \| boolean \| number[] \| `undefined` | Value in the base |
| `new` | same | Value in the edited object |
| `oldText` | string | `formatValue(path, old)` |
| `newText` | string | `formatValue(path, new)` |

| Rule | Detail |
|---|---|
| What is compared | Every leaf of both objects (the union of their keys); arrays are one leaf, equal when same length and every element `===` |
| Missing on one side | Each leaf of the side that has it is listed; the other value is `undefined` |
| Order | The order of the table in 7.7, then the other paths in alphabetical order |
| Shown as | One line per change: `<label>: <oldText> → <newText>` |

| Value | `formatValue(path, value)` |
|---|---|
| `undefined` | `—` |
| Boolean at a path ending in `.auto` | `Auto` / `Manual` |
| Other boolean | `On` / `Off` |
| A value of a select (farm type, crop, stage, sensor mode, fogger level, AC mode) | The option text of 7.7 |
| `program.lights.on`, `program.lights.off` | `HH:MM` (`ClimateController.hhmm`) |
| `program.harvest.times` | `HH:MM, HH:MM`, or `none` when empty |
| Number | `String(+value.toFixed(6))`, then a space and the unit when the field has one. The rounding hides floating-point noise: the controller's ramp (`Math.round(v / 0.1) * 0.1` in `controller.js` `program()`) stores values such as `20.200000000000003`, which print as `20.2`. |
| String | The string |
| Anything else | `JSON.stringify(value)` |

### 7.6 Other exports of `FarmSettingsPanel`

| Member | Signature | Contract |
|---|---|---|
| `diffSettings` | `(base, next) → Change[]` | 7.5; pure, runs in Node |
| `applyChanges` | `(settings, changes) → Settings` | Deep copy of `settings` with each `change.new` written at `change.path` (missing objects created); pure |
| `formatValue` | `(path, value) → string` | 7.5; pure |
| `safeSettings` | `(settings: any) → { settings: Settings, warnings: string[] }` | For settings from HTTP or from any import (lead decision 6): the only way such settings reach a controller's `cfg`. Step 1: a deep copy that leaves out, at any depth, every own key named `__proto__`, `constructor` or `prototype`, with one warning per key `Setting "<dot path>" is not allowed: ignored.` (the rule of C2's `cleanSettings`, C2 section 6.3; the browser cannot load `server/rooms-common.js`). Step 2: `ClimateController.importSettings({ format: 'mushroom-climate-settings', version: ClimateController.SETTINGS_VERSION, settings: <the copy> })`, which builds from `defaultSettings()` and copies only known keys. Returns its `settings` and the warnings of both steps. Throws `importSettings`' error when `settings` is not an object. Pure; runs in Node. |
| `FIELDS` | `{ path, label, unit, options? }[]` | The table of 7.7 (`options`: value → text) |
| `showChanges` | `(changes, { title, confirmText, note }) → Promise<string \| null>` | Opens a modal `<dialog>` (appended to `document.body`, removed when closed): `title`, one line per change, an optional note field when `note` is `true` (an `<input type="text" maxlength="200">`, label `Note (optional)`), buttons `confirmText` and **Cancel**. Resolves the note's text trimmed (`''` when empty, only spaces, or without a note field) on confirm, `null` on Cancel or Escape. So every note a caller sends meets C3 section 6.5 (at most 200 characters after trimming). Callers do not call it with an empty list. |

### 7.7 Fields

Level: F = farmer and installer, I = installer only, L = shown to both, editable by the installer only. Number rule
"clamp a–b" = today's `numIn`: a value that is not a number keeps the old value, then the value is held in a–b. Every
clamp range below lies inside the limit `ClimateController.importSettings` applies to the same path (its
`SETTING_LIMITS`), and so does every value a pair rule writes (the coupled `rhStop`/`rhResume` and `fanOn`/`fanOff`), so a
value the panel accepts is never corrected by the server; where the server has a limit, the panel uses exactly that
limit, except that the lower value of the pair with a 50 ppm gap stops 50 below the server's top (`rules.fanOff`:
400–19950), so the upper value it pushes up stays within 20000 (sliders may use a narrower range). The rows follow
C9 7 and 7.1 (`FIELDS` on `master`).

| Path | Label | Control (id) | Input rule | Level | Unit / option texts |
|---|---|---|---|---|---|
| `farmType` | Farm type | select `inFarm` | `full`, `ready`; a type without the current stage sets `stage` to the type's first stage | F | Full cycle (own spawn run and pinning); Ready-to-fruit blocks (bought in) |
| `crop` | Mushroom | select `inCrop` | The crop keys with a `range` (9 from wave 2: the Equipment stream adds the lion's mane `<option>` after `milky`, C8 5.4.3, lead decision 47) | F | `ClimateController.CROPS[k].name` |
| `stage` | Stage | buttons `stageSeg` | The stages of `FARM_TYPES[farmType]` | F | `ClimateController.STAGES[k]` |
| `program.harvest.on` | Harvest times on | checkbox `pgHarvest` | – | F | On/Off |
| `program.harvest.times` | Harvest times | text `pgTimes` | Split on commas and spaces; each `H:MM` or `HH:MM`; hours held in 0–23, minutes in 0–59; minutes since midnight; sorted; other tokens dropped | F | `HH:MM, HH:MM` |
| `spT` | Temperature target | range `inSpT` | 12–32, step 0.5 (server limit 10–35) | L | °C |
| `spRH` | Humidity target | range `inSpRH` | 50–98, step 1 (server limit 40–99) | L | % |
| `co2Lim` | CO₂ limit (alarm) | range `inCo2Lim` | 400–10000, step 100 (server limit 400–20000) | L | ppm |
| `program.auto` | Change the stage automatically | checkbox `pgAuto` | – | I | On/Off |
| `program.days.spawn` | Spawn run | number `pgDaysSpawn` | Not a number or 0 → 1; clamp 1–90 | I | days |
| `program.days.pinning` | Pinning | number `pgDaysPin` | Same, clamp 1–30 | I | days |
| `program.days.fruiting` | Fruiting | number `pgDaysFruit` | Same, clamp 1–60 | I | days |
| `program.days.rest` | Rest | number `pgDaysRest` | Same, clamp 1–60 | I | days |
| `program.flushes` | Flushes per block | number `pgFlushes` | Same, clamp 1–10, rounded | I | – |
| `program.rampH` | Target change time | number `pgRampH` | Not a number → 0; clamp 0–48 | I | h |
| `program.harvest.dryMin` | Fog off before harvest | number `pgDry` | Not a number → 0; clamp 0–240 | I | min |
| `program.harvest.pickMin` | Picking time | number `pgPick` | Not a number → 0; clamp 0–240 | I | min |
| `program.harvest.floorDrop` | Lowest RH at harvest (target −) | number `pgFloor` | Not a number or 0 → 1; clamp 1–15 | I | % |
| `program.lights.on` | Lights on | text `pgLightOn` | `H:MM` or `HH:MM`, hours 0–23, minutes 0–59; anything else keeps the value | I | `HH:MM` |
| `program.lights.off` | Lights off | text `pgLightOff` | Same | I | `HH:MM` |
| `program.lights.stages.spawn` | Lights in spawn run | checkbox `pgLSpawn` | – | I | On/Off |
| `program.lights.stages.pinning` | Lights in pinning | checkbox `pgLPin` | – | I | On/Off |
| `program.lights.stages.fruiting` | Lights in fruiting | checkbox `pgLFruit` | – | I | On/Off |
| `program.lights.stages.rest` | Lights in rest | checkbox `pgLRest` | – | I | On/Off |
| `sensorMode` | Two sensor sets | select `inSensMode` | `average`, `worst`, `main` | I | Use the average; Use the worst value; Use the main set |
| `roomM3` | Room volume | number `inRoomM3` | Not a number or 0 keeps the value; clamp 1–100000 | I | m³ |
| `airM3h` | Air exchange size | number `inAirSize` | Clamp 50–10000, rounded (C9 5.2) | I | m³/h |
| `offsets.T` | Sensor correction T | number `oT` | Not a number → 0; clamp −5–5 | I | °C |
| `offsets.RH` | Sensor correction RH | number `oRH` | Not a number → 0; clamp −15–15 | I | % |
| `offsets.CO2` | Sensor correction CO₂ | number `oCO2` | Not a number → 0; clamp −500–500 | I | ppm |
| `rules.co2Safety` | CO₂ safety level on | checkbox `rCo2Safety` | – | I | On/Off |
| `rules.co2SafetyAt` | CO₂ safety level | number `rCo2SafeAt` | Clamp 500–20000 | I | ppm |
| `rules.rhLock` | Humidity first on | checkbox `rRhLock` | – | I | On/Off |
| `rules.rhStop` | Humidity first: at target − | number `rRhStop` | Clamp 1–20, rounded; then `rhResume` = min(`rhResume`, `rhStop` − 1) | I | % |
| `rules.rhResume` | Humidity first: until target − | number `rRhResume` | Clamp 0–19, rounded; then `rhStop` = max(`rhStop`, `rhResume` + 1) | I | % |
| `rules.fanOn` | Purge starts at | number `rFanOn` | Clamp 450–20000, rounded; then `fanOff` = min(`fanOff`, `fanOn` − 50) | I | ppm |
| `rules.fanOff` | Purge stops at | number `rFanOff` | Clamp 400–19950 (server limit 400–20000), rounded; then `fanOn` = max(`fanOn`, `fanOff` + 50), so at most 20000 | I | ppm |
| `rules.purgeMaxS` | Longest purge | number `rPurgeMax` | Shown in minutes: clamp 1–15 min, stored as seconds (× 60, rounded; server limit 60–900 s) | I | s |
| `rules.minOffS` | Minimum off time | number `rMinOff` | Clamp 30–600, rounded | I | s |
| `manual.ac.auto` | Air conditioner | Auto/Manual `[data-dev="ac"]` | Bumpless transfer (7.4) | F | Auto/Manual |
| `manual.ac.power` | Air conditioner, manual: power | select `acModeSel` | `off` → `power = false`; another value → `power = true` and `mode` = the value | F | On/Off |
| `manual.ac.mode` | Air conditioner, manual: mode | select `acModeSel` (same) | `cool`, `heat`, `dry`, `fan` | F | Cool; Heat; Dry; Fan only |
| `manual.ac.setpoint` | Air conditioner, manual: setpoint | range `acSetIn` | 16–30, step 0.5 | F | °C |
| `manual.hu.auto` | Fogger | Auto/Manual `[data-dev="hu"]` | Bumpless | F | Auto/Manual |
| `manual.hu.level` | Fogger, manual: level | select `huLevelSel` | 0–3 (number) | F | Off; 1 (1 kg/h); 2 (2 kg/h); 3 (3 kg/h) |
| `manual.air.auto` | Air exchange | Auto/Manual `[data-dev="air"]` | Bumpless | F | Auto/Manual |
| `manual.air.on` | Air exchange: manual output | checkbox `airOnChk` | – | F | On/Off |
| `manual.lights.auto` | Lights | Auto/Manual `[data-dev="lights"]` | Bumpless | F | Auto/Manual |
| `manual.lights.on` | Lights, manual: on | checkbox `liOn` | – | F | On/Off |
| `manual.circ.auto` | Circulation fan | Auto/Manual `[data-dev="circ"]` | Bumpless | F | Auto/Manual |
| `manual.circ.on` | Circulation fan, manual: on | checkbox `ciOn` | – | F | On/Off |

Settings without a control (label = path; they appear in a change list only when two settings objects differ there):
`humMode`, `circ`, `program.coreControl`, `rules.freeCool`, `rules.outdoorDry`, `rules.fogCool`, `rules.acFanRH`,
`protect.*`.

### 7.8 Use in the Test bench (`web/simulator.js`)

The Simulator creates the panel at mount: `createSettingsPanel(host, { settings: cfg, readOnly: false, getCommand: () =>
ctl.state.cmd, onChange })`, where `cfg` is the object its controller runs with. Every user edit takes effect at once,
as today.

| Moment | Simulator action |
|---|---|
| `onChange` with `farmType` | `ctl.setFarmType(new, reading.t)` (it also chooses the stage, so a `stage` change in the same list is skipped); then `panel.set(cfg)` |
| `onChange` with `crop` | `ctl.setCrop(new, reading.t)`; `scheduleCropCheck()`; `panel.set(cfg)` |
| `onChange` with `stage` | `ctl.setStage(new, reading.t)`; `scheduleCropCheck()`; `panel.set(cfg)` |
| `onChange` with `spT`, `spRH`, `co2Lim`, `rules.co2SafetyAt`, `rules.fanOn`, `rules.fanOff` (C9 5.2 `RAMP_KEYS`) | Write the value into `cfg`; `ctl.cancelRamp()` |
| `onChange` with `airM3h` | Write; `env.airM3h` = the same value and `#inAirM3h` shows it (C9 7: the simulated pair and the controller's size together) |
| `onChange` with `manual.<dev>.auto` | Write; event `<Air conditioner \| Fogger \| Air exchange \| Lights \| Circulation fan> set to <auto \| manual>` |
| `onChange` with `offsets.<k>` | Write; event `Sensor correction <k>: <+/−value>` |
| `onChange`, any other path | Write the value into `cfg` at the path |
| After every `onChange` | Redraw the ladder; charts dirty |
| Each UI update (150 ms) | If a ramp runs, or `farmType`/`crop`/`stage` differ from the last update (stage program): `panel.set(cfg)`. Fill the slots (status lines, crop check, VPD line, ladder, duty counters). |
| **Load settings from room** (wave 2) | `{ settings: roomSettings } = safeSettings(await FarmApi.getSettings(id))` (lead decision 6: the reply is never given to `applySettings` as it came; a throw shows `The settings of <room> could not be read: <message>` and changes nothing); `changes = diffSettings(cfg, roomSettings)`; none → message `Same settings as <room>.`; else `showChanges(changes, { title: 'Load the settings of <room>?', confirmText: 'Load', note: false })`; on confirm: `ClimateController.applySettings(cfg, roomSettings)`, `ctl.cancelRamp()`, `panel.set(cfg)`, event `Settings loaded from room "<room>"` |
| **Save settings to room** (wave 2) | `base = await FarmApi.getSettings(id)`; `changes = diffSettings(base, cfg)`; none → message `<room> already has these settings.`; else `note = await showChanges(changes, { title: 'Save these settings to <room>?', confirmText: 'Save to room', note: true })`; on confirm: `saveSettings(id, structuredClone(cfg), note \|\| 'From the Simulator')`; show the warnings, or `Saved.` |

The room picker (a `select` of `listRooms()`, rooms not archived) and the two buttons sit in the "Climate controller"
heading row. When the server cannot be reached, they are disabled with the `errorText` message; the bench itself works.

| Revision 7 rule (Bench stream) | Detail |
|---|---|
| `#/simulator/:id` | The shell passes `{ roomId }` (2.1); the bench picks that room in the picker (when it is listed) and runs **Load settings from room** for it at once (the change list shows first, as above). Opened from the Simulate tab's **Open test bench**. |
| Machines | The Test bench simulates the typical machines (`PLANT`) in wave 2, also on `#/simulator/:id`: a room's saved Equipment is not loaded (lead decision 35 covers Simulate, Calibrate and the live room only). The air exchange size is the bench's own `#inAirM3h` (C9 7), which a loaded `airM3h` sets (`onLoaded` below). |
| Calibration event text | `Simulation calibrated: heat through walls and roof <ua> W/K, …` (was `heat loss`; lead decision 28) |
| `ClimateCalib.PARAMS.ua` (Bench stream, `calib.js`) | `label` `Heat through walls and roof (W/K)`; `note` exactly `Heat flows out when the room is warmer than outside, in when outside is hotter.` (lead decision 28; shown by the Calibrate tab, 3.11) |
| Node export | The last statement inside the wrapper: `if (typeof module === 'object' && module && module.exports) module.exports = { createRoomLink, airText, mimicLayout };` (adds no browser global). `airText` is on `master` (C9); the Bench stream adds `createRoomLink` and `mimicLayout` (lead decision 51). Tested by `tests/web-room-link.test.js` (`createRoomLink`); `tests/web-air.test.js` keeps reading `airText`; the lead points `tests/web-mimic.test.js` at `mimicLayout` in wave 3, before deleting `FarmBench` (3.5). |
| Room drawing | C9's (`mimicLayout({ inletAt, exhaustAt })`, two fans SF-203 and EF-206, closed dampers when off; merged on `master`). No wave 2 stream changes the mimic code or C9's air exchange card code (lead decision 53). |

#### `createRoomLink(deps)` (Bench stream, inside `web/simulator.js`)

The logic of **Load settings from room** and **Save settings to room**, without DOM. If the wave 1 file touches `window`, `document` or `matchMedia` at load, the Bench stream moves that into `mount` or the lazily created Simulator state (1.4), so Node can require the file.

| Dep | Type | Page value |
|---|---|---|
| `api` | `{ getSettings, saveSettings }` as 4.3 | `FarmApi` |
| `diffSettings` | `(base, next) → Change[]` | `FarmSettingsPanel.diffSettings` |
| `safeSettings` | `(settings) → { settings, warnings }` | `FarmSettingsPanel.safeSettings` |
| `showChanges` | `(changes, { title, confirmText, note }) → Promise<string \| null>` | The wrapper in the table "Page wiring" |
| `errorText` | `(err) → string` | `FarmUi.errorText` |
| `cfg` | Settings | The live object the Simulator's controller runs with; never replaced |
| `getCtl` | `() → controller` | `() => ctl` (**Reset** makes a new controller on the same `cfg`) |
| `event` | `(text) → void` | Adds an `info` event to the Simulator log: `onEvent({ t: reading ? reading.t : 0, lvl: 'info', text })` |
| `onLoaded` | `(changes) → void` | Repaint after a confirmed load (table "Page wiring") |

| Member | Signature | Contract |
|---|---|---|
| `load` | `(room: { id, name }) → Promise<string \| null>` | Steps in the table "`load(room)`". A string is the message-line text (`''` clears it). `null` = change nothing (disposed, or another action running). Never rejects. |
| `save` | same | Steps in the table "`save(room)`" |
| `busy` | getter → boolean | `true` from the start of `load` or `save` until it settles |
| `dispose` | `() → void` | Later `load` / `save` resolve `null` with no request. A call in flight resolves `null` and from then on touches nothing (`cfg`, controller, `event`, `onLoaded`, no `saveSettings`). Idempotent. |

| `load(room)` step (`<room>` = `room.name`) | Action |
|---|---|
| 1 | Disposed or `busy`: resolve `null`, no request. Else `busy = true`. |
| 2 | `raw = await api.getSettings(room.id)`. Disposed: `null`. |
| 3 | `roomSettings = safeSettings(raw).settings`. A throw: resolve `The settings of <room> could not be read: <err.message>` (nothing changed). |
| 4 | `changes = diffSettings(cfg, roomSettings)`. Empty: resolve `Same settings as <room>.` |
| 5 | `answer = await showChanges(changes, { title: 'Load the settings of <room>?', confirmText: 'Load', note: false })`. Disposed: `null`. `answer === null`: resolve `''`. |
| 6 | `ClimateController.applySettings(cfg, roomSettings)`; `getCtl().cancelRamp()`; `event('Settings loaded from room "<room>"')`; `onLoaded(changes)`; resolve `Loaded the settings of <room>.` |
| Error | Disposed: `null`. Else resolve `errorText(err)`; an error that is not a `FarmApi.ApiError` is also logged with `console.error`. |
| Always | `busy = false` in `finally`. |

| `save(room)` step | Action |
|---|---|
| 1 | As `load`. |
| 2 | `base = await api.getSettings(room.id)`. Disposed: `null`. |
| 3 | `sent = structuredClone(cfg)`; `changes = diffSettings(base, sent)`. Empty: resolve `<room> already has these settings.` |
| 4 | `note = await showChanges(changes, { title: 'Save these settings to <room>?', confirmText: 'Save to room', note: true })`. Disposed: `null`. `note === null`: resolve `''` (no `PUT`). |
| 5 | `{ warnings } = await api.saveSettings(room.id, sent, note \|\| 'From the Simulator')`. Disposed: `null`. |
| 6 | No warnings: `Saved.`; else `Saved with <n> warning(s): <warnings joined with ' '>`. The reply's `settings` are not copied into `cfg`. |
| Error, Always | As `load`. |

`sent` is taken once, before the dialog, so the server gets exactly what the user confirmed even if the simulation changes `cfg` while the dialog is open.

| Page wiring | Action |
|---|---|
| Markup | Inside the `div.section-head` of the "Climate controller" heading, after its `<p>` (inline style; `styles.css` is not the Bench stream's): `label[for=simRoom]` `Room`, `select#simRoom`, `button.btn#simRoomLoad` `Load settings from room`, `button.btn#simRoomSave` `Save settings to room`, `span.tag#simRoomMsg` (`role="status"`, `aria-live="polite"`); all three controls start disabled |
| `mount` | `link = createRoomLink({ api: FarmApi, diffSettings, safeSettings, showChanges: <wrapper>, errorText: FarmUi.errorText, cfg, getCtl: () => ctl, event, onLoaded })`; then `FarmApi.listRooms()` (once per mount; no stream, no polling) |
| `listRooms` resolves rooms | One `option` per room: `value = String(room.id)`, `option.textContent = room.name` (never `innerHTML`). Select `params.roomId` when listed (`#/simulator/:id`), else the id kept from the last mount if listed, else the first. Enable the select and both buttons; clear the message. With `params.roomId` listed, run **Load** for it at once. |
| `listRooms` resolves `[]` | All three stay disabled; message `No rooms on the farm server. Create one under Rooms.` |
| `listRooms` rejects | All three stay disabled; message `FarmUi.errorText(err)`; the bench keeps running |
| Settles after `unmount` | Ignored (mount token; no DOM access) |
| `simRoom` change | Keep the picked id in the module closure (survives remounts); clear the message |
| Button click | `room` = the listed Room with the picked id. Disable the three. `text = await link.load(room)` (or `save`). `text !== null`: message = `text`, enable the three. `null`: do nothing. |
| `onLoaded(changes)` | `panel.set(cfg)`; if a change has path `farmType`, `crop` or `stage`: `scheduleCropCheck()`; if a change has path `airM3h`: `env.airM3h = cfg.airM3h` and `#inAirM3h` shows it; redraw the ladder and mark the charts dirty (as "After every `onChange`" above) |
| `showChanges` wrapper | `(c, o) => { const p = FarmSettingsPanel.showChanges(c, o); const d = document.body.lastElementChild; openDialog = d && d.tagName === 'DIALOG' ? d : null; return p; }` |
| `unmount` | `link.dispose()`; if `openDialog` is still in the document: `openDialog.close()`, `openDialog.remove()`; `openDialog = null`. Everything else `unmount` does stays. |

### 7.9 Use on the Live tab (`web/room-live.js`)

`base` is the last Settings received from the server. `saving` is `true` while a `saveSettings` or `restoreSettings`
call of this page is in flight. The panel is created with `{ settings: base, readOnly: false, getCommand, onChange }`
(the API answers 404 for an archived room, so the page never shows one; a stopped room still takes a settings save and
uses it at its next start, C3 section 6.5). The room page has no controller and never calls
`ClimateController.applySettings`: the panel only copies the server's Settings, and every save is validated by the
server (`importSettings` in C2, section 9.2). `getCommand` builds the Command from the latest Reading `r` as below
(`null` while there is no Reading).

| Command field | From the Reading `r` |
|---|---|
| `ac.power` | `r.ac_mode !== 'off'` |
| `ac.mode` | `r.ac_mode` when `ac.power` is `true`; absent when it is `false` (bumpless transfer then keeps the stored `manual.ac.mode`) |
| `ac.setpoint` | `r.ac_setpoint` when `ac.power` is `true`; absent when it is `false` (the stored `manual.ac.setpoint` stays) |
| `hu.level` | `r.fog` |
| `air.on` | `r.air === 1` (C9 7) |
| `lights.on` | `r.lights === 1` |
| `circ.on` | `r.circ === 1` |

| Moment | Room page action |
|---|---|
| `onChange` | `n = panel.diff(base).length`; **Save** and **Discard** enabled when `n > 0` and not `saving`; text `<n> unsaved change(s)` |
| **Save** | `changes = panel.diff(base)`; `note = await showChanges(changes, { title: 'Save these changes to <room>?', confirmText: 'Save', note: true })`; `null` → nothing. Then `sent = panel.get()`; `saving = true`; `saveSettings(id, sent, note)` → `{ settings, warnings }`: `base = settings`, `panel.set(applyChanges(settings, diffSettings(sent, panel.get())))` (edits made while saving are kept), show each warning, or `Saved.`; reload the versions. On an `ApiError`: show `errorText`, keep the edits. In both cases `saving = false` at the end. |
| **Discard** | `panel.set(base)` |
| While `saving` | **Save**, **Discard** and **Restore** are disabled, and stream `settings` events for this room are ignored: the reply of the call sets `base`. |
| Stream `settings` for this room (`data` = `{ id, room_id, saved_at, note, settings }`), not `saving` | `pending = panel.diff(base)`; `base = data.settings`; `panel.set(applyChanges(base, pending))`; reload the versions. When `pending` is not empty: note `The settings changed on the server; your <n> change(s) are kept.` |
| Reconnect (stream `open` with `reconnect: true`, 3.4), not `saving` | `fresh = await getSettings(id)`; `pending = panel.diff(base)`; `changed = diffSettings(base, fresh)`; `base = fresh`; `panel.set(applyChanges(base, pending))`; reload the versions. When `changed` and `pending` are both not empty: note `The settings changed on the server; your <n> change(s) are kept.` (C4 section 10.4: the page says so before a save). While `saving`: only the versions reload; the call's reply sets `base`. |
| **Restore** (versions list: `saved_at` in farm time, note) | `confirm('Make the version of <saved_at> current? Unsaved changes are lost.')`; `saving = true`; `restoreSettings(id, versionId)` → `{ settings, warnings }`; `old = base`; `base = settings`; `panel.set(settings)`; show the warnings and the restored changes `diffSettings(old, settings)` as lines; reload the versions. On an `ApiError`: show `errorText`. In both cases `saving = false` at the end. |
| Slots | `program-status`: crop and stage from `live`, plus ` · flush <n>` when `live.flush` is set (revision 7); `rules-side`: `FarmCharts.createLadder` (C9's one row `Purge`) with the latest CO₂ and the chip `{ air }` from `live.air` (3.4, table "Air exchange on the Live tab"; no chip while `live.air` is `null`); the others empty |
| Leaving the page | Unsaved edits are dropped without a prompt; a reply that arrives after `unmount` is ignored |

### 7.10 Checks

| Check | Proves | Owner |
|---|---|---|
| `tests/web-api.test.js` (Node, against `startFakeApi()` of `tests/fakes/api-server.js`, section 4.5) | Each `FarmApi` function, `restartRoom` included (`POST /api/rooms/1/restart`, no body, the reply passed through): method, path, query, body (read from `requests`), result; `ApiError` for 400, 404, 500 (set with `reply`) and no server (after `close()`, status 0); a non-JSON error body and a non-JSON 2xx body; `getCapacity`: 404 `No capacity report` → `null`, 404 `Unknown room` → `ApiError`; `stream` delivers `emit`ted events, sends `open` (`reconnect: false`), then after `dropStreams()` sends `down` and `open` (`reconnect: true`) using the `retry:` delay, and stops after `close()` | Web split |
| `tests/web-api.test.js`, watchdog | With `FarmApi.streamTimeoutMs` = 100 and `startFakeApi({ retryMs: 50 })` (the fake sends no `: ping`): `open` (`reconnect: false`), then `down` with `error` `No data from the server for 0.1 s`, then `open` (`reconnect: true`), and `requests` holds a second `GET /api/stream`; an `emit` every 50 ms keeps the connection (no `down`); no `onEvent` call after `close()` | Web split |
| `tests/settings-diff.test.js` (Node) | `diffSettings` (order, arrays, missing leaves, no change → `[]`), `applyChanges`, `formatValue`; `safeSettings`: `JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":1}}')` gives two warnings and `({}).polluted` stays `undefined`, an unknown key is dropped with `importSettings`' warning, an out-of-limit `spT` is clamped, a missing key takes its default, a non-object throws | Web split |
| Headless Chrome, wave 1 (spec section 5) | Each module mounts and unmounts without errors (with the wave 0 stubs `room-rules.js` and `web/rooms.js`, 1.5 and 1.6: no 404 and no console error; a 404 for `/favicon.ico` is ignored, and a 404 for `/web/rooms.js` or `/room-rules.js` fails the check); `#/rooms` shows `This part of the app is not installed.`; the Simulator runs as today with the panel. The check opens the Web split worktree's `index.html` over `file://` (wave 1 makes no API call), or over a throwaway static file server inside the test tool; `server/static.js` is the API stream's and is not in this worktree. | Web split |
| Headless Chrome, how wave 2 checks run (revision 7) | Against the real server, after the lead's gate 2.5 (Data 2, Equipment, then Server 2 merged into `master`, and with C10 also Harvest data and Harvest API, with `server/main.js` wired as C10 8.4; wave 2 plan, C10 14). Until then each web stream tests in Node against the fake API (4.5) and the prep 2.0 `equipment.js` stub. The check tree: `T=$(mktemp -d); git archive master \| tar -x -C $T` (the gate 2.5 `master`), then the stream's own changed files on top (`git archive HEAD -- <files changed since the merge base> \| tar -x -C $T`); the streams do not merge `master` into their branches (the lead merges). Command: `cd $T && FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=$T/check.db npm start`, then open `http://127.0.0.1:<port>/`. The empty database gets the demo room `Room 1`, which records a reading every 30 s. A check seeds what else it needs through the API or `localStorage`; a check that needs history writes it before `npm start` with a script kept outside the repo (its own `mktemp -d` folder; `openDb`, `createRoom`, `insertReading` on `$T/check.db`). Tab and card checks follow 3.9 "Headless checks of one tab" (the gate 2.5 `index.html` already loads every script; the tab is mounted by hand; no layout assertion). Wave 3 integration runs every check again through the real room page. | Every wave 2 web stream |
| `tests/web-api.test.js`, revision 7 additions | The seven functions of 4.3 (`listSimulations`, `createSimulation`, `getSimulation`, `updateSimulation`, `deleteSimulation`, `getEquipment`, `saveEquipment`): method, path, query, body, result, against the fake; `DELETE` gets 200 `{}`; `getEquipment` gets `null` | Lead (prep 2.0) |
| `tests/fake-api-server.test.js`, revision 8 additions | With `root`: `GET /air.js`, `/cycle.js`, `/equipment.js`, `/harvest-rules.js` each answer 200, `text/javascript; charset=utf-8` and the file bytes; `GET /api/batches` answers 200 `[]` (4.5; C10 14) | Lead (prep 2.0) |
| `tests/web-api.test.js`, C10 additions | The ten functions of 4.3 from C10 12.1, one test each against `startFakeApi()`: method, path, query (`listBatches({ state: 'placed', room: 2 })` sends `?state=placed&room=2`; `listBatches()` sends no query), body (`clearBatch(4)` sends `{}`), and the reply passed through (C10 14) | Lead (prep 2.0) |
| `tests/web-shell.test.js`, `tests/web-rooms.test.js` + headless Chrome, Room shell | Node: the routes of 2.1 (`FarmShell.parseHash`, the four C10 routes included: `#/batches`, `#/batches/4`, `#/harvest/stickers` before `#/harvest/:id`, `#/harvest/3`), the `update(params)` rule of 2.3, `MENU_NAMES` (with `batches` and `harvest`), the home helpers and import helpers (3.8). Headless: the home shows cards with live values and `flush`/`blocks`; a card opens `#/rooms/1/live`; `#/rooms/1` replaces to `/live`; the three tab links switch tabs without a reload of the header (the frame's `GET /api/rooms` count does not grow on a tab switch) and show `This tab is not installed.` where a tab registers nothing; `#/capacity` and `#/calibration` go to `#/rooms`; the menu has Rooms, Batches and Test bench; `#/batches` and `#/harvest/stickers` mark the **Batches** link and `#/harvest/1` marks none; `#/harvest/1` sets `body[data-layout="bare"]` and a switch to `#/rooms` removes it (C10 11, lead decision 66; on this tree `web/batches.js`, `web/harvest.js` and `web/harvest.css` are the prep 2.0 stubs, so the pages show `This part of the app is not installed.` and the check makes no assertion on the bar's visibility); the browser-storage import (with `mushroom-farm.rooms.v1` seeded with two rooms, one with a mix of two crops and a valid `calib`: both rooms, their mixes, an applied calibration with `source: 'import'`, the marker set, the button hidden after a reload); **Restart** against the fake (`startFakeApi({ root: <the check tree> })`, a stopped room `R` with `live.error: 'boom'`, the button sends exactly one `POST /api/rooms/1/restart` with no body and the card then shows the reply), on the home card and in the frame header; no console errors | Room shell |
| `tests/web-room-live.test.js` + headless Chrome, Live tab | Node: `airLive` (3.4, every row of "Air exchange on the Live tab"). Headless: the tab mounted alone with a hand-made `ctx` (3.9) whose `on` records the listeners. The check stands in for the frame: it opens `FarmApi.stream`, passes the `reading`, `event`, `alarm` and `settings` events of room 1 to the tab's listeners of that type, and after each reading calls `FarmApi.listRooms()` and passes room 1 to the `room` listeners (and makes `ctx.room()` return it). Live values and machines (the air exchange `On` / `Off`) from `reading`; the Air exchange card, glance row and ladder chip from `live.air`; the status chip changes after a reading that moves T out of band (the check saves the room's settings through the API with `spT` far from the room's T, then waits up to 65 s); charts, alarms and events load; a settings change shows the change list, saves, and Restore works; the `program-status` slot shows `flush <n>`; no console errors | Live tab |
| `tests/web-room-simulate.test.js` + headless Chrome, Simulate tab | Node: the helpers of 3.10. Headless: a capacity check and a short cycle (settings with 1-day stages, 1 flush, `farmType: 'ready'`) finish, are stored (`listSimulations`), reopen (`getSimulation`), take a note and delete; the draft mix is saved only by **Save as this room's crop mix** (`getMix`); with saved machines (`saveEquipment` through the API first) the stored run's `inputs.equipment` holds them (with `air_m3h`); a stored run's `inputs.settings.airM3h` is the room's settings `airM3h` and `inputs.calibration` has exactly the keys `id`, `ua`, `inf_ach`, `moist_buffer`, `co2_per_block` (or is `null`); the Saved runs row of an equipment run shows its verdict chip and Energy `–`; the equipment slot sits after the Result card and before Saved runs. The headless check seeds one saved run of kind `equipment` (a small hand-made Report through `createSimulation`, as C3 6.21 accepts) so the Saved runs row `Equipment` and **Open** can be checked before the card is merged. | Simulate tab |
| `tests/web-room-calibrate.test.js`, `tests/web-charts.test.js` (append) + headless Chrome, Calibrate tab | The headless check seeds readings 2 h back and uses the tab's default history range, which must cover them (the default `cbFrom` yesterday, `cbTo` today, 3.11). Node: `logFromReadings` (`air` from `r.air`), `pairSeries`, `differences`, `sameMachines` (`air_m3h`), `calibBody`, `envBaseFor` (`airM3h` from the settings; `plantOf` recorded, 3.11); the `drawCalibCharts` options and a `base` given as `{ series }`. No assertion on the `PARAMS` label or note text, nor on a fit result that needs `replay` to follow `stage` (3.11). Headless: a history fit stores a calibration with `source: 'history'`, `log_from`, `log_to` and `equipment` (2 h of readings written into the check database before `npm start`); a CSV fit stores `source: 'csv'`; after `saveEquipment` with other machines the warning `#cbStale` shows; Predicted vs real shows a short saved cycle against its readings and stores `real_start`; a start in the future shows `No real readings for this run yet.` with no `GET …/readings` | Calibrate tab |
| `tests/web-room-link.test.js`, `tests/calib.test.js` (append) + headless Chrome, Test bench | The room link of 7.8 (`createRoomLink` from the Node export: every step of `load` and `save`, `dispose`); the room pick (`{ roomId: 1 }` picks room 1 and shows the Load change list, on `#/simulator/1`) is the lead's wave 3 check, not this stream's (wave 1 `web/shell.js` exposes no way to reach the registered module before Room shell merges); the calibration event text `heat through walls and roof`; `ClimateCalib.PARAMS.ua.label === 'Heat through walls and roof (W/K)'` and `PARAMS.ua.note` contains `outside is hotter`; `replay` follows a row's `stage` (a log switching from `fruiting` to `rest` replays with less CO₂ after the switch); every existing calib and bench test stays green | Bench |
| `tests/web-room-equipment.test.js` + headless Chrome, Equipment card | Node: the card's helpers (3.12; `progressText` for kinds `ac`, `fogger`, `air`; `airNote`). Headless, after gate 2.5: the card mounted alone (3.9 "Headless checks of one tab") against the real server: save and reload the machines; after saving an `air_m3h` that differs from the room's settings `airM3h` the settings come in step and no note shows; changing the settings' `airM3h` afterwards (`saveSettings`) shows the air size note of 3.12, and saving the machines again brings the settings in step (`getSettings(1).airM3h` equals it after the save); a check with a short program (1-day stages, 1 flush, `ready`) finishes and is stored as kind `equipment` (`listSimulations(1)`). Fixes after gate 2.5 merge in wave 3 (lead decision 49). The card inside the Simulate tab is the lead's wave 3 check. | Equipment |
| `tests/web-batches.test.js`, `tests/web-harvest.test.js` + headless Chrome, Harvest web (C10 13) | Node: every helper of C10 12.2 (`parseKg('12,5')` is 12.5, `parseKg('12kg')` is `null`; `summaryText` singular and plural; `isLocalHost`; `qrSvg` holds one `<path>` and `crispEdges`, and its module count matches `qrcodegen` for the same text). Headless, after gate 2.5, on the check tree of the row "how wave 2 checks run": that tree has the wave 1 `web/shell.js` (the Room shell's merges in wave 3), which does not know the C10 routes, so the check mounts the registered module by hand (through a `FarmShell.register` spy or the recorded module, as the Bench row) in an emptied `#view`, with the `params` of 2.1, and checks a link that changes the hash by its `href` instead of following it. Phone page, 390 × 844, `harvest` mounted with `{ view: 'record', id: 1 }` against the real server with one placed batch in room 1 (seeded with `createBatch` and `placeBatch`): with `document.body.dataset.layout = 'bare'` set by the check (standing in for 2.3 step 5) `.bar` is not displayed (`web/harvest.css`); the batch is picked at once; a double tap on **Add crate** stores one crate; with the server stopped the value stays and the red line shows; Undo removes the crate. Two placed batches: the picker shows two buttons. Stickers, `{ view: 'stickers' }`: opened as `http://127.0.0.1:<port>/`, **Print** is disabled and `#stWarn` shows; opened on an address `isLocalHost` does not list (the server started with `FARM_HOST=127.0.0.2`, a loopback address other than `127.0.0.1`, and opened as `http://127.0.0.2:<port>/`; C3 2.2: the server never listens on `0.0.0.0`), one card per room. Batches, `{}` then `{ id }`: create, place, see the crates and flushes, clear. No console errors. The addresses through the shell (`#/batches`, `#/batches/:id`, `#/harvest/:id` with the shell's bare layout, `#/harvest/stickers`) are the lead's wave 3 check | Harvest web |
| Headless Chrome, integration | Every row above on the merged code through the real room page; the Equipment card inside the Simulate tab (mount, **Check my machines** with a short program, the Saved runs row `Equipment`, **Open**); the Harvest web row through the shell's addresses: `#/harvest/1` shows no menu bar, `#/harvest/stickers` and `#/batches` mark **Batches** (C10 11, 13) | Lead (wave 3) |

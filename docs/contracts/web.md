# Contract C5 and C6: web modules and settings editor

Date: 2026-10-08. Status: **frozen** (revision 6). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`.
(sections 4, 5 and 6). Related contracts: C3 and C4 (`docs/contracts/api.md`) define every resource, route, status code and
stream payload. This file does not repeat them. Where it names a C3 resource (Room, Reading, Event, Alarm,
SettingsVersion, Calibration, MixRow, CapacityReport), C3's JSON is used unchanged.

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
| Module | One menu entry of the app: `rooms`, `simulator`, `capacity`, `calibration` |

---

## 1. Files and loading (C5)

### 1.1 Files

| File | Global it defines | Owner (wave 0) | Owner (wave 1) | Owner (wave 2) | Content |
|---|---|---|---|---|---|
| `index.html` | – | – | Web split | nobody | The shell markup and the script tags. No module markup. |
| `styles.css` | – | – | Web split | Rooms UI (appends a `/* Rooms */` section only) | Today's styles plus the menu, `.contents`, `dialog` and Machines card styles |
| `room-rules.js` | `ClimateRoomRules` | Lead (stub, 1.5) | API (replaces the stub; exports in C3 section 7.1) | nobody | Shared room, mix and calibration rules. The web modules only read it. |
| `web/ui.js` | `FarmUi` | – | Web split | nobody | Formatting and small DOM helpers moved from `app.js` (section 5) |
| `web/api.js` | `FarmApi` | – | Web split | nobody | One function per C3 route, and `stream` (section 4) |
| `web/charts.js` | `FarmCharts` | – | Web split | nobody | The charts moved from `app.js` (section 6) |
| `web/settings-panel.js` | `FarmSettingsPanel` | – | Web split | nobody | The settings editor (section 7, C6) |
| `web/shell.js` | `FarmShell` | – | Web split | nobody | Menu, routing, settings level, theme (section 2) |
| `web/rooms.js` | – (registers `rooms`) | Lead (stub, 1.5) | nobody (no wave 1 stream creates or changes it) | Rooms UI (replaces the stub) | Rooms list and room page |
| `web/simulator.js` | `FarmBench` (waves 1 and 2 only, section 3.5) | – | Web split | Simulator link | Today's test bench |
| `web/capacity.js` | – (registers `capacity`) | – | Web split | Capacity and calibration | Today's capacity card (wave 2 data flow: section 3.7) |
| `web/calibration.js` | – (registers `calibration`) | – | Web split | Capacity and calibration | Today's calibration card |
| `tests/fakes/api-server.js` | – (CommonJS export `startFakeApi`) | Lead | nobody | nobody | The fake API server (section 4.5) |
| `tests/fake-api-server.test.js` | – | Lead | nobody | nobody | The fake API server's own test (section 4.5) |
| `app.js` | – | – | Web split (deletes it) | – | Removed |

### 1.2 index.html

The page is the shell only. Each module builds its own markup inside `<main id="view">` when it mounts.

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
</head>
<body data-level="farmer">
<header class="bar">
  <div><h1>Mushroom farm</h1></div>
  <nav class="menu" id="menu" aria-label="Main menu">
    <a href="#/rooms" data-module="rooms">Rooms</a>
    <a href="#/simulator" data-module="simulator">Simulator</a>
    <a href="#/capacity" data-module="capacity">Capacity</a>
    <a href="#/calibration" data-module="calibration">Calibration</a>
  </nav>
  <div class="spacer"></div>
  <div class="seg level-seg" role="group" aria-label="Settings level" id="levelSeg">
    <button data-level="farmer" aria-pressed="true">Farmer</button><button data-level="installer" aria-pressed="false">Installer</button>
  </div>
  <button class="btn" id="themeBtn">Dark theme</button>
</header>
<main id="view"></main>
<script src="sim.js"></script>
<script src="controller.js"></script>
<script src="runtime.js"></script>
<script src="calib.js"></script>
<script src="capacity.js"></script>
<script src="room-rules.js"></script>
<script src="web/ui.js"></script>
<script src="web/api.js"></script>
<script src="web/charts.js"></script>
<script src="web/settings-panel.js"></script>
<script src="web/shell.js"></script>
<script src="web/rooms.js"></script>
<script src="web/simulator.js"></script>
<script src="web/capacity.js"></script>
<script src="web/calibration.js"></script>
</body>
</html>
```

### 1.3 Load order

Plain `<script src>` tags at the end of `<body>`: no `defer`, no `async`, no `type="module"`. They run in this order.

| # | Script | Defines | Needs when it loads |
|---|---|---|---|
| 1 | `sim.js` | `ClimateSim` | – |
| 2 | `controller.js` | `ClimateController` | – |
| 3 | `runtime.js` | `ClimateRuntime` | – |
| 4 | `calib.js` | `ClimateCalib` | `ClimateSim` |
| 5 | `capacity.js` | `ClimateCapacity` | `ClimateSim`, `ClimateController`, `ClimateRuntime` |
| 6 | `room-rules.js` | `ClimateRoomRules` (owned and written by the API stream; its members are exactly those of C3 section 7.1, which is the authority: today `LIM`, `VERDICTS`, `ALARM_KEYS`, `hasCrop`, `validCalib`, `normRoom`, `checkRoom`, `checkMix`, `checkCalibration`, `checkReport`) | `ClimateController`, `ClimateCalib`, `ClimateSim` |
| 7 | `web/ui.js` | `FarmUi` | – |
| 8 | `web/api.js` | `FarmApi` | – |
| 9 | `web/charts.js` | `FarmCharts` | `FarmUi` (at call time) |
| 10 | `web/settings-panel.js` | `FarmSettingsPanel` | `FarmUi`, `ClimateController` (at call time) |
| 11 | `web/shell.js` | `FarmShell` | – |
| 12–15 | `web/rooms.js`, `web/simulator.js`, `web/capacity.js`, `web/calibration.js` | nothing, except `FarmBench` (section 3.5) | `FarmShell` (they call `FarmShell.register` at load) |

### 1.4 Rules for every web file

| Rule | Detail |
|---|---|
| Wrapper | `(function (global) { 'use strict'; ... })(typeof window !== 'undefined' ? window : globalThis);` like the shared modules, so Node tests can `require()` the file |
| Globals | At most the one global of the table in 1.1. Module files define none; they only call `FarmShell.register`. |
| No DOM at load | A file does no DOM work when it loads. DOM work starts in `mount`, in `create...` functions, or in the shell's `DOMContentLoaded` handler. |
| Markup | Each module and the settings panel keep their markup as a template string in their own file, moved from today's `index.html` with the same ids and classes. It is set with `el.innerHTML` once per mount. Every dynamic text is set with `textContent`. |
| Ids | Today's ids stay. The shell reserves `menu`, `view`, `levelSeg`, `themeBtn`. Only one module is mounted at a time, and at most one settings panel exists, so ids stay unique. |
| Missing file | A module script that fails to load leaves its route unregistered; the shell shows a notice (section 2.3). The other modules work. |
| No build | No bundler, no npm package, no framework |

### 1.5 Wave 0 stubs: `room-rules.js` and `web/rooms.js`

`index.html` loads `room-rules.js` and `web/rooms.js`, but neither exists when the Web split starts: the API stream
writes `room-rules.js` in wave 1, in parallel with the Web split, and the Rooms UI stream writes `web/rooms.js` in
wave 2. So that the Web split's worktree serves both files (no 404 and no console error in the wave 1 headless Chrome
check), the lead commits these two stubs in wave 0. Each owner replaces the whole file. No wave 1 web code reads
`ClimateRoomRules`, and no wave 1 stream creates or changes `web/rooms.js`.

| Item | `room-rules.js` stub | `web/rooms.js` stub |
|---|---|---|
| File | `room-rules.js` (repo root) | `web/rooms.js` |
| Content | `(function (global) { 'use strict'; global.ClimateRoomRules = {}; })(typeof window !== 'undefined' ? window : globalThis);` | `(function (global) { 'use strict'; })(typeof window !== 'undefined' ? window : globalThis);` (the 1.4 wrapper; it registers nothing) |
| Effect | Nobody uses it: it only makes the script tag load. The Capacity module uses the real exports from wave 2. | The script tag loads; `rooms` stays unregistered, so `#/rooms` (the default route) shows `This part of the app is not installed.` (2.3 step 6) |
| Replaced by | API stream, wave 1 | Rooms UI stream, wave 2 |

### 1.6 Wave 0 files the web streams rely on

These names are exact. Every brief (lead-fakes, web-split, simulator-link, capacity-calibration, rooms-ui) uses them;
a brief that names another file, or that tells a stream not to create a file the lead must write, is wrong and is
regenerated from the frozen contracts before dispatch.

| File | Written by | Content | Used by |
|---|---|---|---|
| `room-rules.js` | Lead, wave 0 | The stub of 1.5 | Every wave 1 stream (the script tag loads); the API stream replaces it in wave 1 |
| `web/rooms.js` | Lead, wave 0 | The stub of 1.5 (a lead deliverable, like `room-rules.js`) | The Web split's wave 1 headless check (no 404); the Rooms UI stream replaces it in wave 2 |
| `tests/fakes/api-server.js` | Lead, wave 0 | Section 4.5; tests load it with `require('./fakes/api-server.js')` (from `tests/`) | `tests/web-api.test.js` (Web split); the wave 2 web streams' Node tests and the 7.10 checks against the fake |
| `tests/fake-api-server.test.js` | Lead, wave 0 | The fake's own test (4.5) | The lead |

| Rule | Detail |
|---|---|
| Names not used | `tests/fakes/api.js`, `require('./fakes/api.js')` and `tests/fake-api.test.js` do not exist. |
| The `web/rooms.js` stub | No wave 1 stream creates, changes or deletes it, and no brief tells the lead not to write it. A 404 for `/web/rooms.js` fails the wave 1 headless check (7.10); only `/favicon.ico` may 404. |
| Lead's wave 0 check | Before wave 1 is dispatched, on the wave 0 commit: `ls tests/fakes/api-server.js tests/fake-api-server.test.js web/rooms.js room-rules.js` lists all four, and `grep -rn "fakes/api\.js\|fake-api\.test" briefs/` finds nothing. |
| Each web stream's start check | `ls tests/fakes/api-server.js web/rooms.js room-rules.js` lists all three; otherwise the stream stops and reports to the lead. |

---

## 2. Shell (`web/shell.js`)

### 2.1 Routes

| Hash | Module | `params` | Menu link marked |
|---|---|---|---|
| `#/rooms` | `rooms` | `{}` | Rooms |
| `#/rooms/:id` (`id` matches `^[1-9][0-9]{0,14}$`) | `rooms` | `{ id: Number(id) }` | Rooms |
| `#/simulator` | `simulator` | `{}` | Simulator |
| `#/capacity` | `capacity` | `{}` | Capacity |
| `#/calibration` | `calibration` | `{}` | Calibration |
| Empty, `#`, `#/`, or anything else | – | – | The shell calls `location.replace('#/rooms')` (the default route; no history entry) |

A trailing `/` is ignored (`#/rooms/` is `#/rooms`). Query strings are not supported.

### 2.2 Public API

| Member | Signature | Contract |
|---|---|---|
| `FarmShell.register` | `(name: string, module: { mount, unmount }) → void` | Called once by each module file at load. `name` is one of the four module names. A second call with the same name replaces the first. |
| `FarmShell.level` | getter `→ 'farmer' \| 'installer'` | The settings level now (equals `document.body.dataset.level`) |

### 2.3 Switching modules

On `DOMContentLoaded` the shell wires the menu, the level and the theme, then routes. It routes again on every
`hashchange`.

| Step | Action |
|---|---|
| 1 | Parse the hash (2.1). An unknown hash redirects to `#/rooms` and stops here. |
| 2 | Same module and same `params` as now: do nothing. |
| 3 | Call `unmount()` of the current module (if any). An exception is caught and logged with `console.error`. |
| 4 | Empty `<main id="view">` and remove every attribute except `id`. |
| 5 | Set `aria-current="page"` on the menu link of the new module and remove it from the others. Set `document.title` to `<Menu name> · Mushroom farm`. |
| 6 | Module not registered: put `<p class="est-note">This part of the app is not installed.</p>` in `#view` and stop. |
| 7 | Call `mount(view, params)`. If it throws, or returns a Promise that rejects, the shell logs the error and puts `This page could not be opened: <message>` in `#view` (a `<p class="est-note">`). The module stays current, so its `unmount()` still runs at the next switch. |

`#/rooms` and `#/rooms/3` are the same module with different `params`: the shell unmounts and mounts again.

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
| `unmount` | `() → void` | Stops everything `mount` started: `requestAnimationFrame` loops, timers, `ResizeObserver`s, `document`/`window` listeners, `FarmApi.stream` (calls its close function), settings panels (`destroy()`), dialogs. Results of async work that finish later are ignored and must not touch the DOM. Must not throw. Need not empty `el`. |

| Rule | Detail |
|---|---|
| DOM scope | A module changes only `el` and its descendants, plus a `<dialog>` it opens (section 7.6). It never changes `document.body` attributes or the shell's elements. |
| Attributes on `el` | A module may set attributes on `el` (for example `data-bench`); the shell removes them before the next mount. |
| State | The Simulator keeps its run (simulation, controller, samples, events, settings) in its closure between mounts; the run does not advance while unmounted. The other modules reload from the API at each mount. |
| Errors from the API | Shown in the module's message line with `FarmUi.errorText(err)`; the module stays usable |

### 3.2 Modules

| Name | File | Routes | Shows | Uses |
|---|---|---|---|---|
| `rooms` | `web/rooms.js` | `#/rooms`, `#/rooms/:id` | List: a card per room (spec section 4: name, crop and stage, T / RH / CO₂ now from `live.reading` with the `live.status` chips, machines, `live.alarms`, "Stopped" with `live.error` when `live.running` is `false`) and **New room** (name, volume m³, vent). The list opens the stream; a `reading` event updates the card's values (the Reading's own keys `T`, `RH`, `CO2`, `ac_mode`, `fog`, …, C3 section 3.2), a `room` event replaces the card (a room with `archived_at` set is removed, a new id is added). `room` events are C2's, relayed unchanged by C3 (C4 section 10.2); the page derives none. `live.status` and `live.targets` come only from a Room object (`listRooms()`, a `room` event, or the `restartRoom` reply). After a `reading` event, the list and the room page call `listRooms()` again, at most once per 30 s per page, with one timer cleared by `unmount`, and take `live.status` and `live.targets` from the reply (3.4, row "Status chips and targets"; required). **Restart** (shown when `live.running` is `false`, with `live.error`, on the card and in the room page header) calls `restartRoom(id)` and shows the returned Room. Page: live readings and machines, history charts (1 h, 6 h, 24 h, 7 days), alarms with Acknowledge, event log, room details (rename, volume, vent, Archive), settings editor with Save and Discard, settings versions with Restore | `FarmApi`, `FarmCharts.createTrendCharts`, `FarmCharts.createLadder`, `FarmSettingsPanel` |
| `simulator` | `web/simulator.js` | `#/simulator` | Today's test bench (3.3); from wave 2 **Load settings from room** and **Save settings to room** | `ClimateSim`, `ClimateController`, `ClimateRuntime`, `ClimateCalib.toCsv`, `FarmCharts`, `FarmSettingsPanel`, `FarmApi` (wave 2) |
| `capacity` | `web/capacity.js` | `#/capacity` | Today's capacity card. Wave 2 (section 3.7): rooms, mixes and reports from the API; **New room** replaces **Save the present room**; **Delete room** removed; one-time **Import rooms from this browser**; JSON export and import removed | `ClimateCapacity.checkAsync`, `ClimateRoomRules` (wave 2; members in C3 section 7.1), `FarmApi` (wave 2) |
| `calibration` | `web/calibration.js` | `#/calibration` | Today's calibration card. Wave 2: pick a room, load its CSV log, fit with the room's simulation base (3.6), **Save and apply** to that room | `ClimateSim.DEFAULT_ENV`, `ClimateCalib`, `FarmCharts.drawCalibCharts`, `FarmApi` (wave 2) |

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
| Fan and CO₂ rules (`.card.rules`), left column | Settings panel |
| Fan and CO₂, right column: ladder, ladder note, duty counters | Simulator, in the panel slot `rules-side`; ladder drawn by `FarmCharts.createLadder` |
| Five machine faceplates: state, power, meter, reason | Simulator |
| Five machine faceplates: Auto/Manual switch and manual outputs | Settings panel, new **Machines** card (same controls and ids) |
| Water and air (meters) | Simulator |
| Time window filter row, **Show data table** | Simulator |
| Temperature, humidity, CO₂ and power charts | `FarmCharts.createTrendCharts`, used by the Simulator (all four) and the room page (the three trends) |
| Energy since reset (with the tariff) | Simulator |
| Exhaust per hour | Simulator; the bar chart is `FarmCharts.drawExhaustBars` |
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

### 3.4 Room page data flow (Rooms UI, wave 2)

| Part | Source | Refresh |
|---|---|---|
| Room header, running/stopped and error, **Restart** | `listRooms()` (the row with this id). No row (unknown or archived id): the page shows `This room does not exist or is archived.` with a link to `#/rooms`, and nothing else. | Stream `room` events for this room (a lifecycle change such as a restart or a crash, or a change of C2's summary `stage`, `crop`, `alarms`, `running`, `error`; one with `archived_at` set shows the message above), and the Room returned by `restartRoom(id)` |
| Live readings and machines | The latest Reading (from `live.reading`, then stream `reading` events) | Each `reading` event |
| Status chips and targets (`live.status`, `live.targets`) | A Room object only: the `listRooms()` row, a `room` event, or the `restartRoom` reply. A `reading` event carries only the Reading, and a change of `live.status` or `live.targets` alone sends no `room` event (C2 section 7, C3 section 10.2). | After each `reading` event of a shown room (the list: any room; the room page: its room), the page calls `listRooms()` again, at most once per 30 s per page: when no call of this page started in the last 30 s and none is in flight, it calls at once; otherwise it calls once when those 30 s end (one timer, cleared by `unmount`). From the reply it takes `live.status` and `live.targets` of each shown room (same `id`) and repaints the chips and, on the room page, the chart bands and targets line. A failed call changes nothing and is not retried. Also set again from every `room` event and the `restartRoom` reply. This refresh is required, not optional: it is the only way a change of `live.status` or `live.targets` alone reaches the page (C2 section 7 and C3 section 10.2 send no event for it). It is driven by `reading` events (no `reading`, no call), uses only `FarmApi.listRooms()`, and its one timer is the only data timer of the Rooms module. A brief that forbids "polling" or "a polling timer" does not forbid this refresh. |
| History charts | `getReadings(id, { from, to, step })` with `to` = now, `from` = now − window. Window 1 h and 6 h: no `step`. 24 h: `step` 120. 7 days: `step` 900. | Each `reading` event appends a point; points before `from` are dropped. |
| Alarms | `getAlarms(id)`; **Acknowledge** calls `ackAlarm(id, alarmKey)` | Stream `alarm` events reload the list |
| Event log | `getEvents(id, { limit: 100 })`; **Older** calls `getEvents(id, { limit: 100, before: <the smallest event id shown> })` and appends the page at the bottom; an empty page hides **Older** | Stream `event` events are added at the top |
| Settings, versions | Section 7.9 | Stream `settings` events |
| Reconnect | Stream `open` with `reconnect: true` (after a drop, a fetch error, a non-2xx reply or the watchdog of 4.4) | As C4 section 10.4. Header and live values: `listRooms()`. Alarms: `getAlarms(id)`. Event log: its first page only. History charts: the 1 h window loads `getReadings(id, { from: max(<last t held> + 1, now − 3600), to: now })` (the last minutes) and merges by `t`; the 6 h, 24 h and 7 days windows load their whole range again with their `step`. Missing readings stay a gap. Settings and versions: 7.9. |

Reading → `ChartPoint` (section 6.1): `{ t, T, RH, C: CO2, tOut: t_out, rhOut: rh_out, spT, spRH, co2Lim, fanOn, fanOff }`.
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

### 3.5 `FarmBench`: wave 1 bridge (removed in wave 3)

In wave 1 the Calibration and Capacity modules are moved code and still need the Simulator's state, as today. The
Simulator exposes it. The Capacity and calibration stream stops using it in wave 2 (the Calibration module then builds
its own simulation base, 3.6; the Capacity module follows 3.7); the lead deletes it at integration.

| Member | Type | Contract |
|---|---|---|
| `FarmBench.env` | getter → object | The Simulator's `env` (the live object). Creates the Simulator state on first use if the Simulator was never mounted. |
| `FarmBench.cfg` | getter → Settings | The Simulator's settings (the live object) |
| `FarmBench.tariff` | getter → number | RM per kWh from the Energy card (default 0.57) |
| `FarmBench.calApplied` | object or `null` | The last applied calibration `{ ua, infAch, moistBuffer, co2PerBlock, rmse, date }` (today's `calApplied`) |
| `FarmBench.applyCalib(params, rmse)` | `({ ua, infAch, moistBuffer, co2PerBlock }, { T, RH, CO2 }) → void` | Today's `#calApply` effect on the Simulator: sets `env.room.ua`, `infAch`, `moistBuffer`, `env.co2PerBlock = Math.round(co2PerBlock)`, sets `calApplied` (date = ISO now), adds today's "Simulation calibrated: …" event, updates `#inPerBlock` and the blocks hint if mounted |

### 3.6 Calibration fit input (Calibration module, wave 2)

`ClimateCalib.replay(rows, envBase, params)` and `ClimateCalib.fitAsync(rows, envBase, params, onProgress)` simulate
the picked room from `envBase`. The CO₂ of the blocks is `blocks × co2PerBlock` (`ClimateSim.co2Lpm`), so the block
count must be the room's, or the fitted `co2PerBlock` is wrong by the same factor. In wave 2 the module builds
`envBase` itself, as below; it never uses `FarmBench`.

| Step | Action |
|---|---|
| 1 | Room picker: a `select` of `listRooms()` (rooms not archived). Picking a room (and each mount) loads `getMix(id)` and `listCalibrations(id)`. |
| 2 | Blocks field: number input `calBlocks`, label `Blocks in the room during the log`. Default: the sum of `blocks` over the room's MixRows, when that sum is ≥ 1; otherwise empty. Rule: an integer from 1 to 200000 (`ClimateRoomRules.LIM.blocks`). While it is empty or invalid, **Fit** is disabled and the message line says `Enter the number of blocks in the room during the log.` |
| 3 | `envBase = structuredClone(ClimateSim.DEFAULT_ENV)`; then `envBase.vent = room.vent`; `envBase.room = { volume: room.volume }`; `envBase.blocks = <the blocks field>`; `envBase.blockStage = room.live.stage`, or `DEFAULT_ENV.blockStage` (`'fruiting'`) when `room.live.stage` is `null`. Every other value stays `DEFAULT_ENV` (`probe: true`, `co2PerBlock: 45`, …). `envBase` is built again whenever the room or the blocks field changes. |
| 4 | Start values `params`: the four values of the room's Calibration with `applied` = `true` (`{ ua, infAch: inf_ach, moistBuffer: moist_buffer, co2PerBlock: co2_per_block }`); without an applied run, `ClimateCalib.paramsOf(envBase)`. |
| 5 | Base line (the "before" curves): `ClimateCalib.replay(rows, envBase, params)`. **Fit**: `ClimateCalib.fitAsync(rows, envBase, params, onProgress)` → `{ params, result, evals }`. |
| 6 | **Save and apply**: `run = await saveCalibration(id, body)` with the body mapped as in C3 section 8 (`ua` = `params.ua`, `inf_ach` = `params.infAch`, `moist_buffer` = `params.moistBuffer`, `co2_per_block` = `params.co2PerBlock`, `rmse_t` / `rmse_rh` / `rmse_co2` = `result.rmse.T` / `RH` / `CO2` with `NaN` sent as `null`, `log_rows` = `rows.length`); then `applyCalibration(id, run.id)`. Message: `Saved and applied to <room name>.` On an `ApiError`: `errorText`, the fit stays on screen. |

### 3.7 Capacity data flow (Capacity module, wave 2)

In wave 2 the Capacity module keeps today's card (mix table, **Run check**, report, farm line) but reads and writes
through `FarmApi`. It never uses `FarmBench`, and it reads browser storage only for the one-time import. It does not
open the stream: it loads at each mount.

#### Data

| Data | Source | Mapping |
|---|---|---|
| Rooms in the picker `capRoom` | `listRooms()` at mount | Option text as today: `<name> · calibrated <YYYY-MM-DD>` or `<name> · not calibrated`, the date in farm time from the applied run's `run_at` |
| Per room (every listed room at mount, requests in parallel) | `getMix(id)`, `getCapacity(id)`, `listCalibrations(id)` | The capacity room object `{ name, volume, vent, calib }`: `calib` = the run with `applied` = `true`, mapped as C3 section 8, or `null`. The capacity mix: each MixRow → `{ crop, blocks }` plus `co2PerBlock` when `co2_per_block` is not `null`. |
| Saved mix | The capacity mix of the last `getMix(id)` or `saveMix(id, rows)` reply of the room | – |
| Room info line `capRoomInfo` | The room and its applied calibration | Today's text: `<volume> m³ · calibrated <date>` or `<volume> m³ · not calibrated (typical values)` |

`sameMix(a, b)`: two capacity mixes are equal when they have the same length and, at each index, the same `crop`, the
same `blocks`, and the same `co2PerBlock` (both absent counts as equal).

#### Actions

| Action | Module does |
|---|---|
| Mix edit (crop select, Blocks, CO₂ per block, Remove, **Add a crop**) | Today's input rules (blocks rounded and held in 0–200000; CO₂ per block empty, or rounded and held in 1–1000). Updates the table, hides the room's report (it is stale), then `saveMix(id, rows)` with the whole mix as MixRow[] (`co2_per_block`: the number, or `null` when empty). Saves of one room run one at a time, in edit order: a save starts when the previous save of that room has settled. The reply becomes the saved mix. On an `ApiError`: `errorText` in `capMsg`, then `getMix(id)` and the table shows the stored mix. |
| **Run check** | Disabled while a check runs or a mix save of the room is pending. As today: a mix without a row with blocks > 0 gives `Add at least one crop with blocks.` and no check. Otherwise `ClimateCapacity.checkAsync(snap, snap.mix, { emptyBelow, onProgress })` on a copy `snap` of the room object and the saved mix (no `tariff`: capacity.js uses its default, 0.57 RM/kWh, the same value today's page starts with at every load, since today's tariff is never stored; the report text names the tariff used). The Capacity card gets no tariff field. |
| Check finished | When no mix save of the room is pending and `sameMix(<saved mix>, report.mix)`: `saveCapacity(id, report)`; the returned CapacityReport becomes the room's report; message as today `Done (<name>) after <n> simulation runs: …`. Otherwise nothing is saved and the message is `The room changed during the check: run it again.` On an `ApiError` from `saveCapacity`: the report is shown and the message is `The result was not saved: <errorText>`. |
| Report shown | The room's latest `CapacityReport.report`, only when `sameMix(<saved mix>, report.mix)` (C3 6.16 keeps an old report after a mix change). A stale or missing report shows nothing, and the room counts as "not checked yet" in the farm line (as today after an edit). `null` in `balance.estimate` reads as "no limit" (C3 3.8). |
| **New room** (replaces **Save the present room**) | Inputs: `capName` (as today), and two new inputs, because today's button took the volume and vent from the Simulator, which the module no longer reads: `capVolume` (number, m³, 5–5000, default `ClimateSim.PLANT.room.volume`), `capVent` (select: `supply` (default), `exhaust`). A `span.tag` beside the button says `A new room starts running on the server at once (simulated, default settings) and appears under Rooms.` Click: `createRoom({ name, volume, vent })` with `name` = the trimmed `capName`, or `Room <number of rooms + 1>` when empty (no `settings`: the server uses the default settings with `roomM3` = volume). Then reload the module data, select the new room, empty `capName`, message `Created "<name>". Add its crops, then run the check.` On an `ApiError`: `errorText`. |
| **Delete room** | Removed (button `capDelete` and its code). Rooms are archived on the room page only (3.2). |
| JSON export and import (`capExport`, `capImport`) | Removed |

#### One-time import from browser storage

| Item | Rule |
|---|---|
| Stored data | `localStorage['mushroom-farm.rooms.v1']`, read as today's `loadRooms`: `JSON.parse`, the `rooms` array, each room through `ClimateRoomRules.normRoom(r, i)`, `null` results dropped. A read that throws (blocked storage, bad JSON) counts as no stored data. |
| Marker | `localStorage['mushroom-farm.rooms.v1.imported']` = `String(<Unix time>)`, written only after a complete import. |
| Button | **Import rooms from this browser** (`capImportLocal`) is shown only when the marker is absent and the stored data gives at least one room; otherwise it is hidden. |
| Click | `confirm('Create <n> room(s) from this browser on the farm server? Each one starts running as a simulated room.')`; on OK, for each room in order, the requests of C3 section 8.1, one at a time; message `Importing room <k> of <n>…`. |
| Complete | Write the marker, hide the button, reload the module data, message `Imported <n> room(s). Run the check again for each room.` |
| Failure | Stop at the first `ApiError`; no marker; reload the module data; message `The import stopped at "<name>": <errorText>. <k> room(s) were created; archive them on their room pages before you import again.` There is no rollback (C3 section 8.1 has no transaction): the rooms already created stay, and the module does not archive them itself. |
| Stored data kept | The module never changes or deletes `mushroom-farm.rooms.v1`. |

---

## 4. `web/api.js` (C5)

### 4.1 General

| Item | Contract |
|---|---|
| Base address | `FarmApi.base`, a string, default `''` (same origin). Tests set it to `http://127.0.0.1:<port>`. |
| Request | `fetch(base + path, { method, headers, body })`. With a body: `Content-Type: application/json` and `body = JSON.stringify(body)`. Always `Accept: application/json`. |
| Path values | Room ids, version ids and run ids are integers put in the path as decimal; `alarmKey` goes through `encodeURIComponent` |
| Query values | Integers. A key whose value is `undefined` or `null` is left out of the query. |
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

`id` is a room id. Every argument and every result is the C3 JSON, passed through unchanged.

| Function | Route | Arguments | Resolves to |
|---|---|---|---|
| `listRooms()` | `GET /api/rooms` | – | `Room[]` as C3 section 3.1 (`live` with `reading`, `stage`, `crop`, `targets`, `status`, `alarms`, `running`, `error`) |
| `createRoom(room)` | `POST /api/rooms` | `room`: `{ name, volume, vent, settings? }` | `Room` |
| `updateRoom(id, fields)` | `PATCH /api/rooms/:id` | `fields`: only the changed C3 fields (`name`, `volume`, `vent`, `archived: true`) | `Room` |
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
| `saveCapacity(id, report)` | `POST /api/rooms/:id/capacity` | `report`: the object from `ClimateCapacity.checkAsync` | `CapacityReport` |
| `stream(onEvent)` | `GET /api/stream` | `onEvent(type, data)` | Returns a `close()` function at once (not a Promise) |

Mapping between the API and the shared modules is done in the web module, not in `api.js`:

| Web module | API field | Shared-module field |
|---|---|---|
| Capacity | `MixRow.co2_per_block` | `capacity.js` mix `co2PerBlock` (left out when `null`) |
| Capacity, Calibration | The Calibration with `applied` = `true` | `capacity.js` / `ClimateRoomRules` room `calib: { ua, infAch, moistBuffer, co2PerBlock, rmse: { T, RH, CO2 }, date }` (`date` = ISO text of `run_at`); `null` without an applied run (C3 section 8) |
| Calibration | The room's MixRows, `vent`, `volume`, `live.stage` | `envBase` of `ClimateCalib.replay` / `fitAsync` (section 3.6) |

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
| `GET` of a C3 route whose reply is an array: `/api/rooms`, `/api/rooms/:id/settings/history`, `/readings`, `/events`, `/alarms`, `/calibrations`, `/mix` | 200, `[]` |
| Any other `GET` under `/api/` | 200, `{}` |
| `POST`, `PUT`, `PATCH` under `/api/` | 200, the request body echoed as JSON (`null` when the request had no body) |
| `GET` or `HEAD` of a path not under `/api/`, with `root` | The file under `root` by C3 section 9 (above) |
| Any other method or a path not under `/api/` (without `root`, or a method other than `GET` and `HEAD`) | 404, `{ "error": "Unknown route", "details": [] }` |

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
| `ChartPoint` | `t` (s, simulation or Unix time), `T` °C, `RH` %, `C` CO₂ ppm, `tOut` °C, `rhOut` %, `core` °C (optional), `spT`, `spRH`, `co2Lim`, `fanOn`, `fanOff` (targets for the bands), `ac`, `hu`, `fan`, `li`, `ci` (W, power chart only). A missing value is `NaN` or `undefined` and draws as a gap. Other fields are kept and ignored. |
| `View` | `{ t0, t1, pts: ChartPoint[] (sorted by t), gapS?: number }`; `gapS` (default `Infinity`): a line breaks where two points are more than `gapS` apart |

### 6.2 Functions

| Function | Signature | Contract |
|---|---|---|
| `lowerBound` | `(pts, t) → number` | First index with `pts[i].t ≥ t` |
| `nearest` | `(pts, t) → ChartPoint \| null` | |
| `aggregate` | `(pts, maxN) → ChartPoint[]` | Today's bucket average of `T, RH, C, tOut, rhOut, ac, hu, fan, li, ci, acSet, core, vpd`; other fields from the bucket's last point; `t` = bucket middle |
| `niceTicks` | `(lo, hi, n) → number[]` | |
| `linePath` | `(pts, X, Y, f, gapS = Infinity) → string` | SVG path; breaks at non-finite values and at time gaps over `gapS` |
| `areaPath` | `(pts, X, Y, lo, hi) → string` | |
| `barPath` | `(x, y, w, h, r) → string` | |
| `createTrendCharts` | `(el, opts) → { draw(view), destroy() }` | 6.3 |
| `drawExhaustBars` | `(host, { hours, nowH, vol, clock }) → void` | Replaces `host`'s content with today's bar chart. `hours`: 24 × `{ h, runS, starts, m3 }` (`h` = whole hours of simulation time); `nowH`: the current `h`; `vol`: room m³. Labels every 3 local hours. |
| `drawCalibCharts` | `(host, { rows, base, fit }) → void` | Replaces `host`'s content with today's three calibration charts and key. `rows`: parsed log `[{ t, T, RH, CO2 }]` (t = s from the log start); `base`: `ClimateCalib.replay` result; `fit`: the fitted result or `null` |
| `createLadder` | `(el) → { draw(settings, co2, chips), destroy() }` | Builds today's CO₂ rules ladder in `el` (`el` gets class `ladder`). `draw` lays out the scale from `settings.co2Lim` and `settings.rules`, places the CO₂ marker at `co2` (hidden when `NaN`), paints `chips = { fan: Chip, ac: Chip }` (chips hidden when `null`). Cheap enough to call every UI update. |

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
the API and never touches a controller. The Simulator uses it with its local controller; the room page with a live
room's settings.

### 7.2 `createSettingsPanel(el, options) → SettingsPanel`

Global: `FarmSettingsPanel.createSettingsPanel`.

| Option | Type | Default | Contract |
|---|---|---|---|
| `settings` | Settings | required | Copied with `structuredClone`; the caller's object is never changed |
| `readOnly` | boolean | `false` | Every control disabled; `onChange` never called |
| `onChange` | `(changes: Change[], settings: Settings) → void` | none | Called once per user action that changed something; `changes` = this action only (old → new), including the panel's own corrections; `settings` = a deep copy of the whole edited object |
| `getCommand` | `() → Command \| null` | none | Bumpless transfer (7.4). `Command` = the controller's `state.cmd` format `{ ac: { power, mode?, setpoint? }, hu: { level }, fan: { level }, lights: { on }, circ: { on } }`. `ac.mode` and `ac.setpoint` may be absent when `ac.power` is `false` (the room page's Command, 7.9). |

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
| Crop and stage, Targets, Installer: program and room | `card targets` | Today's three sections; the status lines are replaced by slots | Farmer; the installer section has `inst` |
| Fan and CO₂ | `card rules` | Today's header, left column (`div.inst`: the four rule fieldsets and "Fixed values"), right column = slot `rules-side` | Farmer sees the right column only (today's CSS) |
| Machines (new) | `card machines` | Per machine (Air conditioner, Fogger, Exhaust fan, Lights, Circulation fan): name, the Auto/Manual switch (`.seg[data-dev]`), the manual fieldset (`acManual`, `huManual`, `fanManual`, `lightsManual`, `circManual` with today's controls and ids) | Farmer |

| Slot (`[data-slot]`, an empty `div`) | Position | Today's content there |
|---|---|---|
| `program-status` | Crop and stage, after Stage | `progStatus`, `progRamp`, `progHarvest` |
| `crop-check` | End of Crop and stage | `cropCheck` |
| `targets-status` | Targets, after the humidity target | `vpdLine` |
| `rules-side` | Fan and CO₂, right column | Ladder, ladder note, duty counters |

The user of the panel finds a slot with `el.querySelector('[data-slot="…"]')` and fills it. The panel never writes into
a slot.

### 7.4 Behaviour

| Topic | Contract |
|---|---|
| When a change counts | Range sliders on `input` (continuous, as today); other inputs and selects on `change`; stage buttons and Auto/Manual on `click` |
| Field rewrite | After a commit, each control shows the stored value (a clamped number, a parsed time list) |
| Corrections | The input rules of 7.7, including the coupled values (fan, AC and humidity pairs; farm type → stage). The corrections are part of the same `changes`. |
| Crop, stage, farm type | The panel changes only `crop`, `stage`, `farmType` (and `stage` when the farm type does not use it). It does not change the targets: the owner of the controller applies the stage program (7.8, 7.9). |
| Bumpless transfer | When a machine goes from Auto to Manual and `getCommand()` returns a Command, the panel first copies that machine's command into `manual.<dev>`. AC: `power` always; `mode` only when the Command's `ac.mode` is one of `cool`, `heat`, `dry`, `fan`; `setpoint` only when `ac.setpoint` is a finite number (held in 16–30). Fogger and fan: `level`. Lights and circulation: `on`. A value that is not copied keeps the stored `manual.<dev>` value. Without a Command, all stored manual values stay. |
| Manual fieldset | Disabled while its machine is on Auto |
| Settings level | `spT`, `spRH`, `co2Lim` (class `lockable`) are disabled unless `document.body.dataset.level === 'installer'`; the panel listens to `farm-level` on `document`. Installer parts are hidden by the existing CSS. |
| Visibility | `rSetbackRow` only when `rules.acAction === 'setback'`; spawn and pinning days only when `farmType === 'full'`; fieldsets `ruleRh`, `ruleAc`, `ruleSafe` get class `off` when their switch is off |
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
| A value of a select (farm type, crop, stage, sensor mode, actions, levels, AC mode) | The option text of 7.7 |
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
`SETTING_LIMITS`), and so does every value a pair rule writes (the coupled `rhStop`/`rhResume`, `fanOn`/`fanOff` and
`acOff`/`acOn`), so a value the panel accepts is never corrected by the server; where the server has a limit, the panel
uses exactly that limit, except that the lower value of a pair with a 50 ppm gap stops 50 below the server's top
(`rules.fanOff`, `rules.acOn`: 400–19950), so the upper value it pushes up stays within 20000 (sliders may use a narrower
range).

| Path | Label | Control (id) | Input rule | Level | Unit / option texts |
|---|---|---|---|---|---|
| `farmType` | Farm type | select `inFarm` | `full`, `ready`; a type without the current stage sets `stage` to the type's first stage | F | Full cycle (own spawn run and pinning); Ready-to-fruit blocks (bought in) |
| `crop` | Mushroom | select `inCrop` | The 8 crop keys | F | `ClimateController.CROPS[k].name` |
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
| `offsets.T` | Sensor correction T | number `oT` | Not a number → 0; clamp −5–5 | I | °C |
| `offsets.RH` | Sensor correction RH | number `oRH` | Not a number → 0; clamp −15–15 | I | % |
| `offsets.CO2` | Sensor correction CO₂ | number `oCO2` | Not a number → 0; clamp −500–500 | I | ppm |
| `rules.co2Safety` | CO₂ safety level on | checkbox `rCo2Safety` | – | I | On/Off |
| `rules.co2SafetyAt` | CO₂ safety level | number `rCo2SafeAt` | Clamp 500–20000 | I | ppm |
| `rules.rhLock` | Humidity first on | checkbox `rRhLock` | – | I | On/Off |
| `rules.rhStop` | Humidity first: at target − | number `rRhStop` | Clamp 1–20, rounded; then `rhResume` = min(`rhResume`, `rhStop` − 1) | I | % |
| `rules.rhResume` | Humidity first: until target − | number `rRhResume` | Clamp 0–19, rounded; then `rhStop` = max(`rhStop`, `rhResume` + 1) | I | % |
| `rules.rhAction` | Humidity first: action | select `rRhAction` | `stop`, `low` | I | Stop the fan; Reduce the fan to Low |
| `rules.fanOn` | CO₂ purge: start at | number `rFanOn` | Clamp 450–20000, rounded; then `fanOff` = min(`fanOff`, `fanOn` − 50) | I | ppm |
| `rules.fanOff` | CO₂ purge: stop at | number `rFanOff` | Clamp 400–19950 (server limit 400–20000), rounded; then `fanOn` = max(`fanOn`, `fanOff` + 50), so at most 20000 | I | ppm |
| `rules.airMode` | Fresh air | select `rAirMode` | `steady`, `purge` | I | Steady (base level + steps); Purge (on and off) |
| `rules.fanLevel` | Purge level | select `rFanLevel` | 1, 2, 3 (stored as a number) | I | Low; Medium; High |
| `rules.acPurge` | Change the AC during a purge | checkbox `rAcPurge` | – | I | On/Off |
| `rules.acAction` | AC during a purge: action | select `rAcAction` | `setback`, `off` | I | Raise the setpoint (setback); Turn the AC off |
| `rules.acSetbackC` | AC setback | number `rSetbackC` | Clamp 0.5–6 | I | °C |
| `rules.acOff` | AC during a purge: from | number `rAcOff` | Clamp 450–20000, rounded; then `acOn` = min(`acOn`, `acOff` − 50) | I | ppm |
| `rules.acOn` | AC during a purge: until | number `rAcOn` | Clamp 400–19950 (server limit 400–20000), rounded; then `acOff` = max(`acOff`, `acOn` + 50), so at most 20000 | I | ppm |
| `manual.ac.auto` | Air conditioner | Auto/Manual `[data-dev="ac"]` | Bumpless transfer (7.4) | F | Auto/Manual |
| `manual.ac.power` | Air conditioner, manual: power | select `acModeSel` | `off` → `power = false`; another value → `power = true` and `mode` = the value | F | On/Off |
| `manual.ac.mode` | Air conditioner, manual: mode | select `acModeSel` (same) | `cool`, `heat`, `dry`, `fan` | F | Cool; Heat; Dry; Fan only |
| `manual.ac.setpoint` | Air conditioner, manual: setpoint | range `acSetIn` | 16–30, step 0.5 | F | °C |
| `manual.hu.auto` | Fogger | Auto/Manual `[data-dev="hu"]` | Bumpless | F | Auto/Manual |
| `manual.hu.level` | Fogger, manual: level | select `huLevelSel` | 0–3 (number) | F | Off; 1 (1 kg/h); 2 (2 kg/h); 3 (3 kg/h) |
| `manual.fan.auto` | Exhaust fan | Auto/Manual `[data-dev="fan"]` | Bumpless | F | Auto/Manual |
| `manual.fan.level` | Exhaust fan, manual: level | select `fanLevelSel` | 0–3 (number) | F | Off; Low; Medium; High |
| `manual.lights.auto` | Lights | Auto/Manual `[data-dev="lights"]` | Bumpless | F | Auto/Manual |
| `manual.lights.on` | Lights, manual: on | checkbox `liOn` | – | F | On/Off |
| `manual.circ.auto` | Circulation fan | Auto/Manual `[data-dev="circ"]` | Bumpless | F | Auto/Manual |
| `manual.circ.on` | Circulation fan, manual: on | checkbox `ciOn` | – | F | On/Off |

Settings without a control (label = path; they appear in a change list only when two settings objects differ there):
`humMode`, `circ`, `program.coreControl`, `rules.baseFan.*`, `rules.freeCool`, `rules.outdoorDry`, `rules.fogBoost`,
`rules.maxSetback`, `rules.guard`, `rules.fogCool`, `rules.acFanRH`, `protect.*`.

### 7.8 Use in the Simulator

The Simulator creates the panel at mount: `createSettingsPanel(host, { settings: cfg, readOnly: false, getCommand: () =>
ctl.state.cmd, onChange })`, where `cfg` is the object its controller runs with. Every user edit takes effect at once,
as today.

| Moment | Simulator action |
|---|---|
| `onChange` with `farmType` | `ctl.setFarmType(new, reading.t)` (it also chooses the stage, so a `stage` change in the same list is skipped); then `panel.set(cfg)` |
| `onChange` with `crop` | `ctl.setCrop(new, reading.t)`; `scheduleCropCheck()`; `panel.set(cfg)` |
| `onChange` with `stage` | `ctl.setStage(new, reading.t)`; `scheduleCropCheck()`; `panel.set(cfg)` |
| `onChange` with `spT`, `spRH`, `co2Lim`, `rules.fanOn`, `rules.fanOff`, `rules.acOff`, `rules.acOn`, `rules.co2SafetyAt` | Write the value into `cfg`; `ctl.cancelRamp()` |
| `onChange` with `manual.<dev>.auto` | Write; event `<Air conditioner \| Fogger \| Exhaust fan \| Lights \| Circulation fan> set to <auto \| manual>` |
| `onChange` with `offsets.<k>` | Write; event `Sensor correction <k>: <+/−value>` |
| `onChange`, any other path | Write the value into `cfg` at the path |
| After every `onChange` | Redraw the ladder; charts dirty |
| Each UI update (150 ms) | If a ramp runs, or `farmType`/`crop`/`stage` differ from the last update (stage program): `panel.set(cfg)`. Fill the slots (status lines, crop check, VPD line, ladder, duty counters). |
| **Load settings from room** (wave 2) | `{ settings: roomSettings } = safeSettings(await FarmApi.getSettings(id))` (lead decision 6: the reply is never given to `applySettings` as it came; a throw shows `The settings of <room> could not be read: <message>` and changes nothing); `changes = diffSettings(cfg, roomSettings)`; none → message `Same settings as <room>.`; else `showChanges(changes, { title: 'Load the settings of <room>?', confirmText: 'Load', note: false })`; on confirm: `ClimateController.applySettings(cfg, roomSettings)`, `ctl.cancelRamp()`, `panel.set(cfg)`, event `Settings loaded from room "<room>"` |
| **Save settings to room** (wave 2) | `base = await FarmApi.getSettings(id)`; `changes = diffSettings(base, cfg)`; none → message `<room> already has these settings.`; else `note = await showChanges(changes, { title: 'Save these settings to <room>?', confirmText: 'Save to room', note: true })`; on confirm: `saveSettings(id, structuredClone(cfg), note \|\| 'From the Simulator')`; show the warnings, or `Saved.` |

The room picker (a `select` of `listRooms()`, rooms not archived) and the two buttons sit in the "Climate controller"
heading row. When the server cannot be reached, they are disabled with the `errorText` message; the bench itself works.

### 7.9 Use on the room page (Rooms UI)

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
| `fan.level` | `r.fan` |
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
| Slots | `program-status`: crop and stage from `live`; `rules-side`: `FarmCharts.createLadder` with the latest CO₂ and no chips; the others empty |
| Leaving the page | Unsaved edits are dropped without a prompt; a reply that arrives after `unmount` is ignored |

### 7.10 Checks

| Check | Proves | Owner |
|---|---|---|
| `tests/web-api.test.js` (Node, against `startFakeApi()` of `tests/fakes/api-server.js`, section 4.5) | Each `FarmApi` function, `restartRoom` included (`POST /api/rooms/1/restart`, no body, the reply passed through): method, path, query, body (read from `requests`), result; `ApiError` for 400, 404, 500 (set with `reply`) and no server (after `close()`, status 0); a non-JSON error body and a non-JSON 2xx body; `getCapacity`: 404 `No capacity report` → `null`, 404 `Unknown room` → `ApiError`; `stream` delivers `emit`ted events, sends `open` (`reconnect: false`), then after `dropStreams()` sends `down` and `open` (`reconnect: true`) using the `retry:` delay, and stops after `close()` | Web split |
| `tests/web-api.test.js`, watchdog | With `FarmApi.streamTimeoutMs` = 100 and `startFakeApi({ retryMs: 50 })` (the fake sends no `: ping`): `open` (`reconnect: false`), then `down` with `error` `No data from the server for 0.1 s`, then `open` (`reconnect: true`), and `requests` holds a second `GET /api/stream`; an `emit` every 50 ms keeps the connection (no `down`); no `onEvent` call after `close()` | Web split |
| `tests/settings-diff.test.js` (Node) | `diffSettings` (order, arrays, missing leaves, no change → `[]`), `applyChanges`, `formatValue`; `safeSettings`: `JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":1}}')` gives two warnings and `({}).polluted` stays `undefined`, an unknown key is dropped with `importSettings`' warning, an out-of-limit `spT` is clamped, a missing key takes its default, a non-object throws | Web split |
| Headless Chrome, wave 1 (spec section 5) | Each module mounts and unmounts without errors (with the wave 0 stubs `room-rules.js` and `web/rooms.js`, 1.5 and 1.6: no 404 and no console error; a 404 for `/favicon.ico` is ignored, and a 404 for `/web/rooms.js` or `/room-rules.js` fails the check); `#/rooms` shows `This part of the app is not installed.`; the Simulator runs as today with the panel. The check opens the Web split worktree's `index.html` over `file://` (wave 1 makes no API call), or over a throwaway static file server inside the test tool; `server/static.js` is the API stream's and is not in this worktree. | Web split |
| Headless Chrome, how wave 2 checks run | Against the real server of the merged wave 1 code. The wave 2 streams branch from `master` after the wave 1 merge (spec section 6, "Merging: wave by wave"), and the API stream's wave 1 `server/main.js` already opens the real db and starts the real room manager (C3 section 2.2); the lead makes `npm start` run on the merged code before wave 2 starts. Wave 3 integration runs every check again on the final merge. Command: `FARM_HOST=127.0.0.1 FARM_PORT=<free port> FARM_DB=<new temporary file> npm start`, then open `http://127.0.0.1:<port>/`. The empty database gets the demo room `Room 1`, which records a reading every 30 s. A check seeds what else it needs through the API (rooms, mixes, settings) or `localStorage`. The fake API (4.5) is not used here, except by the Rooms UI Restart row below. | Rooms UI, Capacity and calibration, Simulator link |
| Headless Chrome, Rooms UI | The Rooms list shows a card per room with live T, RH and CO₂ (from `live.reading`) and the status chips, and the card's values change when a stream `reading` arrives (wait up to 35 s); a card's status chip changes after a reading that moves T out of band (the check saves the room's settings through the API with `spT` far from the room's T, for example 12 °C, then waits up to 65 s: the next reading, plus at most 30 s for the `listRooms()` refresh of 3.4; no `room` event is needed); a room page loads its charts, alarms and events; a settings change shows the change list, saves, and Restore works; no console errors | Rooms UI |
| Headless Chrome, Rooms UI Restart (against the fake, wave 2) | Lead decision 5. The check runs `api = await startFakeApi({ root: <the Rooms UI worktree> })` and opens `<api.url>/#/rooms`. Before the page loads: `api.reply('GET', '/api/rooms', 200, [R])` with `R` = `{ id: 1, name: 'Room 1', volume: 60, vent: 'supply', adapter: 'sim', created_at: 1791446400, archived_at: null, live: { reading: null, stage: 'fruiting', crop: 'oyster', targets: null, status: null, alarms: 0, running: false, error: 'boom' } }`, and `api.reply('POST', '/api/rooms/1/restart', 200, R2)` with `R2` = `R` with `live.running: true` and `live.error: null`. The card shows `Stopped`, `boom` and a **Restart** button. A click sends exactly one `POST /api/rooms/1/restart` with no body (`requests`), and the card then shows `R2`: no `Stopped`, no `boom`, no **Restart**. The same on `#/rooms/1` with the header's **Restart** (the check also sets `api.reply('GET', '/api/rooms/1/settings', 200, ClimateController.defaultSettings())`, because the fake's default `{}` is not Settings; the other room page routes keep the fake's `[]` defaults). No console errors. | Rooms UI |
| Headless Chrome, Capacity and calibration | Browser-storage import: with `mushroom-farm.rooms.v1` seeded with two rooms (one with a mix of two crops and a valid `calib`), **Import rooms from this browser** creates both rooms (`listRooms`), their mixes (`getMix`), and for the calibrated one an applied calibration (`listCalibrations`, `applied: true`); the marker `mushroom-farm.rooms.v1.imported` is set and, after a reload, the button is hidden. A mix edit is stored (`getMix`); a finished check is stored (`getCapacity`); **Fit** and **Save and apply** store an applied run | Capacity and calibration |
| Headless Chrome, Simulator link | **Load settings from room** and **Save settings to room** show the change list and change the room's settings (`getSettings`) | Simulator link |
| Headless Chrome, integration | All the above on the merged code | Lead |

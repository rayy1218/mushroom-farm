# Work brief: Wave 1, Web split (C5, C6)

Repo: `/home/foqcus/Documents/mushroom-farm` (plain JavaScript, no build step, no npm dependencies, Node.js 22). You work alone in your own git worktree, on a branch made from `master` after the lead's wave 0 commit. `<worktree>` below is the absolute path of your worktree. The contracts are in `<worktree>/docs/contracts/`. The lead decisions that bind this stream are quoted in section 5. Where this brief and a contract differ, the contract wins: stop and report.

## 1. Goal

Split today's `app.js` (1,353 lines) and `index.html` (754 lines) into the app shell and the web modules of C5 and C6 (`docs/contracts/web.md`). Today's features keep working behind the menu; the only behaviour changes are those of section 6.2. You also write `web/api.js`, which is new code: one function per C3 route plus `stream`, tested against the lead's fake API server. At the end `app.js` is deleted.

You build nothing of wave 2: no Rooms module, no `FarmApi` use inside the modules, no **Load/Save settings from room**, no capacity or calibration on the API, and the capacity JSON export/import and **Delete room** stay.

## 2. Before you start

Run in `<worktree>`. If a check fails, stop and report to the lead. Do not create the missing file yourself.

| Check | Expected |
|---|---|
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` (C5 1.6 start check) | All three listed |
| `ls docs/contracts/db.md docs/contracts/rooms.md docs/contracts/api.md docs/contracts/web.md` | All four listed |
| `grep '"test"' package.json` | `"test": "node --disable-warning=ExperimentalWarning --test tests/*.test.js"` |
| `BASE=$(git merge-base HEAD master)` | The wave 0 commit; used by the diff checks and for the old-page copy |
| `npm test` | 0 failures. Write the pass count down as N (93 before wave 0; wave 0 adds the lead's tests). |

`web/rooms.js` and `room-rules.js` are the lead's wave 0 stubs (C5 1.5). `web/rooms.js` registers nothing, so `#/rooms` shows `This part of the app is not installed.` and the page has no 404.

## 3. Owned files (the only files you may touch)

| File | Action | Content | Contract |
|---|---|---|---|
| `index.html` | Replace | Exactly C5 1.2: shell only, no Google Fonts links, 15 script tags in C5 1.3 order | C5 1.2, 1.3 |
| `styles.css` | Modify | Today's styles plus the menu (`.menu`, `a[aria-current="page"]`), `.contents { display: contents }`, `dialog` (change list), `.card.machines`, the Simulator toolbar row; `body[data-bench="off"] …` becomes `[data-bench="off"] …`; the `.section-head .level-seg` rule moves to the header | C5 1.1, 3.3 |
| `web/ui.js` | Create | `FarmUi` | C5 5 |
| `web/api.js` | Create | `FarmApi` (new code) | C5 4, C3, C4 |
| `web/charts.js` | Create | `FarmCharts` | C5 6 |
| `web/settings-panel.js` | Create | `FarmSettingsPanel` | C6 = C5 7.1–7.7 |
| `web/shell.js` | Create | `FarmShell` | C5 2 |
| `web/simulator.js` | Create | Registers `simulator`; defines `FarmBench` | C5 3.1–3.3, 3.5, 7.8 (wave 1 rows) |
| `web/calibration.js` | Create | Registers `calibration` (today's card, using `FarmBench`) | C5 3.2, 3.3, 3.5 |
| `web/capacity.js` | Create | Registers `capacity` (today's card, `localStorage`, using `FarmBench`) | C5 3.2, 3.3, 3.5 |
| `app.js` | Delete (last task) | – | C5 1.1 |
| `tests/web-ui.test.js` | Create | Table 7.1 | C5 5 |
| `tests/web-charts.test.js` | Create | Table 7.2 | C5 6.2 |
| `tests/web-api.test.js` | Create | Table 7.3 | C5 4, 7.10 |
| `tests/settings-diff.test.js` | Create | Table 7.4 | C5 7.5, 7.6, 7.10 |
| `tests/web-load.test.js` | Create | Table 7.5 | C5 1.3, 1.4 |
| `tests/web-bench.test.js` | Create | Table 7.6 | C5 3.5 |

Scratch files for the headless checks live in `/tmp/farm-check/` and `/tmp/farm-old/`, outside the repo.

## 4. Files you must not touch

| Files | Owner |
|---|---|
| `controller.js`, `sim.js`, `runtime.js`, `calib.js`, `capacity.js` | Nobody (shared, unchanged) |
| `room-rules.js` | API stream (replaces the lead's stub in wave 1) |
| `web/rooms.js` | Lead's stub; Rooms UI stream in wave 2. Do not change, replace or delete it. |
| `server/*` (including `server/db-common.js`, `server/rooms-common.js`) | Lead, Data, Rooms and API streams |
| `tests/fakes/*`, `tests/fake-api-server.test.js`, `docs/contracts/*`, `package.json` | Lead |
| `tests/db.test.js`, `tests/rooms.test.js`, `tests/api.test.js`, `tests/stream.test.js`, `tests/config.test.js`, `tests/room-rules.test.js` | Data, Rooms and API streams |
| `tests/vectors/*`, `tests/harness.js`, the existing `tests/*.test.js`, `tools/*` | Nobody (the 8 recorded runs stay unchanged) |
| `README.md`, `docs/contract.md`, `docs/phase3-plan.md`, `docs/superpowers/*` | Docs stream or lead. Leave the README's mention of `app.js` alone. |

## 5. Contracts you build against

| Section (`docs/contracts/web.md` unless noted) | What it gives you |
|---|---|
| C5 1.1–1.6 | Files, globals, `index.html` text, load order, rules for every web file (IIFE wrapper, at most one global, no DOM at load, markup as a template string per module with today's ids, `textContent` for dynamic text), the wave 0 stubs and fake |
| C5 2.1–2.4 | Routes, `FarmShell.register` and `FarmShell.level`, the 7 switching steps, level (`farm-level` event) and theme |
| C5 3.1–3.3 | `mount` / `unmount` rules; what each module shows; the home of every part of today's `index.html` and `app.js` |
| C5 3.5 | `FarmBench` (wave 1 bridge) |
| C5 4.1–4.5 | `FarmApi`: base, requests, `ApiError`, the 19 request functions, `stream` (parsing, reconnect, 45 s watchdog: lead decisions 4 and 5), the fake API server |
| C5 5 | `FarmUi` |
| C5 6.1–6.3 | `FarmCharts` types, functions, `createTrendCharts` |
| C6 = C5 7.1–7.7 | `createSettingsPanel`, markup and slots, behaviour, change list, `diffSettings`, `applyChanges`, `formatValue`, `safeSettings` (lead decision 6), `FIELDS`, `showChanges`, the 56 field rows |
| C5 7.8 | Simulator use of the panel, wave 1 rows (every row except **Load settings from room** and **Save settings to room**) |
| C5 7.10 | The checks you own (rows "Web split") |
| C3 sections 3, 5, 6, 10 (`docs/contracts/api.md`) | Routes, JSON shapes and stream payloads that `web/api.js` passes through unchanged (lead decision 1: Reading keys as stored) |

Lead decisions (binding; they override any draft text):

| # | Decision, as it applies to this stream |
|---|---|
| 1 | Reading keys are the C1 column names (`room_id`, `t`, `T`, `RH`, `CO2`, `t_out`, `rh_out`, `ac_mode`, `ac_setpoint`, `fog`, `fan`, `lights`, `circ`, `power_w`, `kwh`) everywhere; `web/api.js` passes them through with no renaming. |
| 4 | The live-feed watchdog is `stream(onEvent)` in `web/api.js`: no event and no `: ping` for 45 s (server pings every 15 s) → close and reconnect. |
| 5 | `web/api.js` has `restartRoom(id)` for `POST /api/rooms/:id/restart`. |
| 6 | Settings from HTTP or any import never go to `ClimateController.applySettings` directly; they go through `importSettings` first (in the browser: `FarmSettingsPanel.safeSettings`). |
| 7 | The lead writes the fakes (`tests/fakes/api-server.js` for this stream) and the shared constants files in wave 0; streams never write their own. |

C5 3.4, 3.6, 3.7, 7.9 and the wave 2 rows of 7.8 belong to wave 2. Do not build them, and build nothing that contradicts them.

## 6. Decisions and behaviour changes

### 6.1 Points the contracts leave open (decided here)

| Point | Decision |
|---|---|
| Shell in Node | `web/shell.js` adds its `DOMContentLoaded` and `hashchange` listeners only when `typeof document !== 'undefined'`, so `require()` in Node does not throw |
| No DOM at load | `document`, `matchMedia`, `performance`, `requestAnimationFrame`, `localStorage`, `ResizeObserver` are used only inside `mount`, `create…` functions, event handlers or the shell's `DOMContentLoaded` handler |
| Simulator state | `env`, `cfg`, `input.tariff`, `sim`, `ctl`, `io`, `rt`, `reading`, `samples`, `events`, `calApplied` live in the closure of `web/simulator.js`, created by one `ensureState()` on the first `mount` or first `FarmBench` access. It does today's `reset()` without DOM work, so it runs in Node. |
| `ApiError` constructor | `new FarmApi.ApiError(status, error, details)` sets `name = 'ApiError'`, `message = error`, `status`, `error`, `details`. `FarmUi.errorText` recognises it by `err && err.name === 'ApiError'` (`ui.js` loads before `api.js`). |
| Capacity card hint | Only wording change: `calibrate first (under "Show test bench settings")` becomes `calibrate first (in Calibration)` |
| Async results after unmount | A capacity check or calibration fit that finishes after `unmount` is dropped: no DOM work, no `localStorage` write, no `FarmBench` change (a mount generation counter). Busy flags and button states start fresh at the next mount. |
| Capacity rooms | Read from `localStorage` (`loadRooms`) at each `mount`; `roomIdx` kept in the closure and clamped |
| Simulator bench flag | `el.dataset.bench` set at each mount from a closure variable (default `'off'`), so it survives a module switch |
| Ladder element ids | `createLadder` may keep today's inner ids (`ladNow`, `ladLim`, `ladSafe`, `ladScale`); at most one ladder exists at a time |
| Simulator `onChange` writes | Into the live `cfg` with a private `setPath(cfg, path, value)` in `web/simulator.js` (`applyChanges` returns a copy) |
| `web/rooms.js` in Node tests | Not required by the Node tests (its owner replaces it in wave 2); the browser loads it |

### 6.2 Behaviour changes the contracts require (everything else stays as today)

| Area | Today | After the split | Source |
|---|---|---|---|
| Page header | Title "Mushroom room climate controller", subtitle, clock, alarms, speed, Pause, Reset, theme | Title "Mushroom farm", menu, level switch, theme. Clock, sky chip, alarm summary, **Acknowledge all**, speed, **Pause**, **Reset** move to a toolbar row at the top of the Simulator. | C5 1.2, 3.3 |
| Fonts | Loaded from Google Fonts | Not loaded (system fallbacks in `styles.css`) | C5 1.2 |
| Start page | The dashboard | `#/rooms` (in wave 1 the "not installed" notice) | C5 2.1, 1.5 |
| Calibration card | In the Simulator, hidden unless the bench is shown | Its own module, always visible | C5 3.3 |
| Sample log button | Downloads the CSV and loads it into the calibration card; message in `calMsg` | Stays in the Simulator bench, a row at the end of the Sensors section; only downloads `sample-room-log.csv`; with fewer than 60 rows downloads nothing and shows `Run the simulation for 1 h or more first.` in `span.tag#calSampleMsg` beside the button | C5 3.3 |
| Auto/Manual switches and manual outputs | On the five faceplates | In the panel's **Machines** card, same controls and ids; faceplates keep state, power, meter, reason | C5 3.3, 7.3 |
| CO₂ rule numbers | Clamped to 400–20000 | `rules.fanOn`, `rules.acOff`: 450–20000; `rules.fanOff`, `rules.acOn`: 400–19950 (input `max` too); then the pair rule | C6 7.7 |
| Sensor corrections | Not clamped | `offsets.T` ±5, `offsets.RH` ±15, `offsets.CO2` ±500 | C6 7.7 |
| Bumpless transfer (AC) | Copies `power`, `mode`, `setpoint` as they are | `mode` only when `cool`, `heat`, `dry` or `fan`; `setpoint` only when finite (held in 16–30) | C6 7.4 |
| Simulation while away | Always running | Does not advance while the Simulator is unmounted | C5 3.1 |
| `window.__climate` | Always set | Set while the Simulator is mounted, deleted on unmount; same members (`sim`, `ctl`, `reading` getters, `cfg`, `env`, `tick`, `runTest`) | C5 3.3 |
| Document title | Fixed | `<Menu name> · Mushroom farm` | C5 2.3 |

## 7. Tasks (TDD order)

Each task: write the test or check, run it and see it fail, write the code, see it pass, run `npm test`, commit. Use the repo's configured git identity and its message style (`feat(web): …`, `refactor(web): …`). Keep `app.js` as the source to move code from until task 10.

| # | Task | Test first (file, what it proves) | Then implement |
|---|---|---|---|
| 0 | Baseline | Section 2 checks. Old-page copy: `mkdir -p /tmp/farm-old && git archive $BASE \| tar -x -C /tmp/farm-old`. Set up `/tmp/farm-check` (Appendix A) and run the E checks (8.4) on the old page; keep the output as the reference. | – |
| 1 | `web/ui.js` | `tests/web-ui.test.js` (7.1) | Move the helpers; add `simClock`, `farmClock`, `errorText` |
| 2 | `web/charts.js` | `tests/web-charts.test.js` (7.2): pure functions as today, plus `gapS` | Pure functions, then `createTrendCharts`, `drawExhaustBars`, `drawCalibCharts`, `createLadder` (their DOM is proved by tasks 7–9) |
| 3 | `web/api.js` | `tests/web-api.test.js` (7.3) against `startFakeApi()` | `FarmApi` per C5 4 |
| 4 | Panel, pure part | `tests/settings-diff.test.js` (7.4) | `diffSettings`, `applyChanges`, `formatValue`, `safeSettings`, `FIELDS` |
| 5 | Shell, `index.html`, `styles.css` | `tests/web-load.test.js` rows L1–L3 (7.5); headless S1, S2, S4, S5 (8.3) | `web/shell.js`, the new `index.html`, the CSS additions |
| 6 | Panel, DOM part | Headless P1–P9 (8.3), run on `#/rooms` | `createSettingsPanel` (targets card, rules card, Machines card, slots), `showChanges` |
| 7 | Simulator and `FarmBench` | L4 (`simulator`); `tests/web-bench.test.js` (7.6); headless M1–M8, M10, E1–E3 | `web/simulator.js` |
| 8 | Calibration | L4 (`calibration`); headless E4 | `web/calibration.js` |
| 9 | Capacity | L4 (`capacity`); headless S3, M9, E5 | `web/capacity.js` |
| 10 | Remove `app.js`, full check | All of section 8 | `git rm app.js`; fix what the checks find |

### 7.1 `tests/web-ui.test.js` (require `../web/ui.js`, read `globalThis.FarmUi`)

| Test | Proves |
|---|---|
| `fmtNum(1.234, 1)` = `'1.2'`; `fmtNum(NaN, 1)`, `fmtNum(null, 1)` = `'—'` | Moved unchanged |
| `fmtDur(1800)` = `'30 min'`; `fmtDur(5400)` = `'1.5 h'`; `fmtMinSec(75)` = `'1:15'`; `watts(950)` = `'950 W'`; `watts(1430)` = `'1.43 kW'`; `pct(0.256)` = `'26 %'`; `nf(12345.6)` = `'12,346'`; `clamp(5, 0, 3)` = 3 | Moved unchanged |
| `ICON.critical` = `'◆'`; `LVL_RANK.serious` = 2 | Tables moved |
| `simClock(6)`: `offset` 21600; `stamp(0)` = `'D1 06:00:00'`; `label(0)` = `'Day 1 · 06:00'`; `hm(72000)` = `'02:00'`; `stamp(72000)` = `'D2 02:00:00'` | `simClock` |
| `farmClock()`: `offset` 28800; `stamp(1791450012)` = `'2026-10-08 17:00:12'`; `label(1791450012)` = `'2026-10-08 17:00'`; `hm(1791450012)` = `'17:00'`; `stamp(0)` = `'1970-01-01 08:00:00'` | `farmClock` (UTC+8, UTC getters) |
| `errorText` of `Object.assign(new Error('Invalid room'), { name: 'ApiError', status: 400, error: 'Invalid room', details: ['name: a', 'volume: b'] })` = `'Invalid room: name: a; volume: b'`; with `details: []` = `'Invalid room'`; `errorText(new Error('boom'))` = `'boom'` | `errorText` |

### 7.2 `tests/web-charts.test.js` (require `../web/ui.js`, then `../web/charts.js`)

All expected values were computed from today's `app.js`.

| Test | Proves |
|---|---|
| `pts = [{t:0},{t:10},{t:20}]`: `lowerBound(pts, 10)` = 1, `(pts, 15)` = 2, `(pts, 25)` = 3 | Moved unchanged |
| `nearest(pts, 14).t` = 10; `nearest(pts, 16).t` = 20; `nearest([], 5)` = `null` | Moved unchanged |
| `niceTicks(0, 10, 3)` = `[0, 5, 10]`; `niceTicks(18.2, 25.7, 4)` = `[17.5, 20, 22.5, 25, 27.5]`; `niceTicks(5, 5, 3)` = `[5, 5.5, 6]` | Moved unchanged |
| `aggregate(pts, 10)` returns `pts` itself; `aggregate` of `[{t:0,T:1,x:'a'},{t:10,T:NaN,x:'b'},{t:20,T:3,x:'c'},{t:30,T:5,x:'d'}]` with `maxN` 2 gives 2 points: `t` 5 and 25, `T` 1 and 4 (`NaN` left out), `x` `'b'` and `'d'` | Moved unchanged |
| With `X = t => t`, `Y = y => y`: `linePath([{t:0,v:1},{t:10,v:NaN},{t:20,v:3},{t:30,v:4}], X, Y, p => p.v)` = `'M0.0,1.0M20.0,3.0L30.0,4.0'`; `linePath([{t:0,v:1},{t:3,v:2},{t:20,v:3}], X, Y, p => p.v)` = `'M0.0,1.0L3.0,2.0L20.0,3.0'`, and with `gapS` 5 = `'M0.0,1.0L3.0,2.0M20.0,3.0'` | NaN gaps; new `gapS` |
| `areaPath` of one point = `''`; of two points ends with `'Z'` | Moved unchanged |
| `barPath(0, 0, 10, 20, 3)` = `'M0,20V3Q0,0 3,0H7Q10,0 10,3V20Z'` | Moved unchanged |

### 7.3 `tests/web-api.test.js`

Setup: `const { startFakeApi } = require('./fakes/api-server.js')`; `require('../web/api.js')`; `fake = await startFakeApi(…)`; `FarmApi.base = fake.url`. Close the fake and every stream in `t.after`. Read only the `/api/` entries of `fake.requests`.

| Test | Proves |
|---|---|
| Each of the 19 request functions of C5 4.3: method, path, query and body recorded in `fake.requests`, and the resolved value (the fake's default or a `reply`). Include: `restartRoom(1)` → `POST /api/rooms/1/restart`, body `null`, reply passed through; `saveSettings(1, s)` and `saveSettings(1, s, '')` send `{ settings: s }` with no `note` key, `saveSettings(1, s, 'x')` adds `note: 'x'`; `getReadings(1, { from: 10, to: 20 })` → query `{ from: '10', to: '20' }`; `getEvents(1)` → query `{}`; `getEvents(1, { limit: 100, before: 55 })`; `ackAlarm(1, 'rh Hi')` → path `/api/rooms/1/alarms/rh%20Hi/ack`; `saveMix`, `saveCapacity`, `saveCalibration` resolve their echoed bodies | C5 4.1, 4.3 |
| `fake.reply('GET', '/api/rooms', 400, { error: 'Invalid query', details: ['from: bad'] })` → rejects with `instanceof FarmApi.ApiError`, `name` `'ApiError'`, `message` = `error`, `status` 400, `details` as sent; the same for 404 and 500 | C5 4.2 |
| After `await fake.close()`: rejects with `status` 0, `error` `'The farm server cannot be reached.'`, `details` one string (the fetch error message) | Status 0 |
| `reply(…, 500, 'oops')` → `error` `'HTTP 500'`, `details` `[]`; `reply(…, 200, 'hello')` → `ApiError` with `error` `'The server sent a reply that is not JSON.'` | Non-JSON bodies |
| `reply('POST', '/api/rooms/1/restart', 204, undefined)` → resolves `null` | Empty body |
| `getCapacity(1)` with 404 `{ error: 'No capacity report', details: [] }` → `null`; with 404 `{ error: 'Unknown room', details: [] }` → `ApiError` 404 | `getCapacity` |
| `startFakeApi({ retryMs: 50 })`: `stream(onEvent)` returns a function at once; first `open` `{ reconnect: false }`; `fake.emit('reading', { room_id: 1, t: 5 })` → `onEvent('reading', { room_id: 1, t: 5 })`; `fake.dropStreams()` → exactly one `down`, then `open` `{ reconnect: true }` after about 50 ms; two `GET /api/stream` recorded; after `close()` no `onEvent` call and no new request | C5 4.4 |
| A `data:` that is not JSON is skipped (no `onEvent`, the stream continues); an `onEvent` that throws does not stop the stream | C5 4.4 |
| Watchdog: `FarmApi.streamTimeoutMs = 100`, `startFakeApi({ retryMs: 50 })`, no emits → `open` (`false`), `down` `{ error: 'No data from the server for 0.1 s' }`, `open` (`true`), a second `GET /api/stream`; with an `emit` every 50 ms, no `down` within 400 ms; nothing after `close()` | Lead decision 4, C5 7.10 |

### 7.4 `tests/settings-diff.test.js` (require `../controller.js`, `../web/ui.js`, `../web/settings-panel.js`; `d = ClimateController.defaultSettings()`)

| Test | Proves |
|---|---|
| `diffSettings(d, structuredClone(d))` = `[]` | No change |
| `next.rules.fanOn = 1200`, `next.spT = 20`, `next.humMode = 'rh'` → 3 changes in order `spT`, `rules.fanOn`, `humMode`; `spT` has `label` `'Temperature target'`, `oldText` `'25 °C'`, `newText` `'20 °C'`; `humMode` has `label` `'humMode'` | Order, labels, texts (C6 7.5) |
| `program.harvest.times` `[480, 960]` → `[480]`: one change, `old`/`new` the arrays, `oldText` `'08:00, 16:00'`, `newText` `'08:00'`; `[]` gives `'none'` | Arrays are one leaf |
| `rules.extra = 5` only in `next` → `old` `undefined`, `oldText` `'—'`; a leaf only in `base` → `new` `undefined` | Missing leaves |
| `formatValue`: `('manual.ac.auto', false)` = `'Manual'`; `('program.auto', true)` = `'On'`; `('crop', 'pink')` = `'Pink oyster'`; `('farmType', 'ready')` = `'Ready-to-fruit blocks (bought in)'`; `('stage', 'rest')` = `ClimateController.STAGES.rest`; `('rules.fanLevel', 2)` = `'Medium'`; `('manual.hu.level', 0)` = `'Off'`; `('program.lights.on', 420)` = `'07:00'`; `('program.flushes', 3)` = `'3'`; `('spT', 20.200000000000003)` = `'20.2 °C'`; `('x', { a: 1 })` = `'{"a":1}'` | `formatValue` rules |
| `applyChanges(d, [{ path: 'a.b.c', new: 1 }, { path: 'spT', new: 20 }])` → a copy with `a.b.c` = 1 and `spT` = 20; `d` unchanged | `applyChanges` |
| `safeSettings(JSON.parse('{"__proto__":{"polluted":1},"rules":{"constructor":1}}'))` → warnings exactly `['Setting "__proto__" is not allowed: ignored.', 'Setting "rules.constructor" is not allowed: ignored.']`; `({}).polluted` is `undefined` | Lead decision 6, step 1 |
| `safeSettings({ foo: 1 })` warns `Unknown setting "foo" is ignored.`; `safeSettings({ spT: 99 }).settings.spT` = 35 with a warning; `safeSettings({}).settings` deep-equals `d`; `safeSettings(5)` throws | Step 2 (`importSettings`) |
| `FIELDS` has 56 rows; every path is a leaf of `d`; no duplicate paths; every `label` is a string; select rows have `options` | `FIELDS` = C6 7.7 |

### 7.5 `tests/web-load.test.js`

| Row | Test | Proves |
|---|---|---|
| L1 | Snapshot `Object.keys(globalThis)`, then require in C5 1.3 order: `sim.js`, `controller.js`, `runtime.js`, `calib.js`, `capacity.js`, `room-rules.js`, `web/ui.js`, `web/api.js`, `web/charts.js`, `web/settings-panel.js`, `web/shell.js`. Nothing throws. | No DOM at load (C5 1.4) |
| L2 | `FarmUi`, `FarmApi`, `FarmCharts`, `FarmSettingsPanel`, `FarmShell` are objects; `FarmShell.register` is a function | Globals of C5 1.1 |
| L3 | The new keys of `globalThis` are exactly the shared globals (`ClimateSim`, `ClimateController`, `ClimateRuntime`, `ClimateCalib`, `ClimateCapacity`, `ClimateRoomRules`) plus the five web globals (plus `FarmBench` from task 7) | At most one global per file |
| L4 | Replace `FarmShell.register` with a recorder, then require `web/simulator.js`, `web/capacity.js`, `web/calibration.js`: recorded names `['simulator', 'capacity', 'calibration']`, each with `mount` and `unmount` functions; `FarmBench` defined after `web/simulator.js` | Registration (C5 1.3 rows 12–15, 3.5) |

### 7.6 `tests/web-bench.test.js` (require as in L1, then `web/simulator.js`)

| Test | Proves |
|---|---|
| `FarmBench.env` deep-equals `ClimateSim.DEFAULT_ENV` and is the same object on each access; `FarmBench.cfg` deep-equals `ClimateController.defaultSettings()`; `FarmBench.tariff` = 0.57; `FarmBench.calApplied` = `null` | Lazy state, defaults |
| `FarmBench.applyCalib({ ua: 120, infAch: 0.6, moistBuffer: 4, co2PerBlock: 54.6 }, { T: 0.2, RH: 1.5, CO2: 30 })` → `env.room.ua` 120, `infAch` 0.6, `moistBuffer` 4, `env.co2PerBlock` 55; `calApplied` = `{ ua: 120, infAch: 0.6, moistBuffer: 4, co2PerBlock: 55, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date }` with `date` an ISO string; no throw in Node | `applyCalib` = today's `#calApply` effect |

## 8. How to verify

### 8.1 Commands (in `<worktree>`)

| Command | Expected |
|---|---|
| `npm test` | 0 failures; pass count = N + your new tests |
| `node --disable-warning=ExperimentalWarning --test tests/vectors.test.js` | 8 pass (`vectors: co2-sensor-missing.json` … `vectors: two-sensor-sets.json`) |
| `git diff --stat $BASE -- controller.js sim.js runtime.js calib.js capacity.js room-rules.js web/rooms.js tests/vectors tests/harness.js tests/fakes tests/fake-api-server.test.js package.json server docs README.md tools` | Empty |
| `git diff --name-status $BASE` | Exactly: `D app.js`, `M index.html`, `M styles.css`, 8 × `A web/…`, 6 × `A tests/…` (section 3) |
| `ls web` | `api.js calibration.js capacity.js charts.js rooms.js settings-panel.js shell.js simulator.js ui.js` |
| `for f in web/*.js; do node --check $f; done` | No output |
| `test ! -e app.js && ! grep -rn "app\.js" index.html web && ! grep -n "fonts\.g" index.html` | Exit code 0 |
| `grep -c '<script' index.html` | 15, in C5 1.2 order |
| `python3 -m http.server 8765 --bind 127.0.0.1 --directory <worktree>` (background), then 8.3 | All pass |

### 8.2 Headless Chrome: allowed problems

Use `cdp.js` (Appendix A) on `http://127.0.0.1:8765/`. On the new page the only allowed problem is a 404 for `/favicon.ico`. Anything else fails: any other 404 (`/web/rooms.js` and `/room-rules.js` included), any exception, any `console.error`, any request to the internet.

### 8.3 Headless Chrome: checks on the new page

Wait about 300 ms after each hash change.

| Id | Check | Expected |
|---|---|---|
| S1 | Open `/` | `location.hash` = `'#/rooms'`; `#view` text = `This part of the app is not installed.`; Rooms link has `aria-current="page"` |
| S2 | `location.hash = '#/nothing'` | Back to `#/rooms`; `history.length` unchanged |
| S3 | `#/simulator`, `#/capacity`, `#/calibration`, `#/simulator` | Each mounts (`#view .mimic`, `#capRoom`, `#calFile`); `document.title` = `Simulator · Mushroom farm` and so on; after leaving the Simulator, `#view` has only its `id` attribute |
| S4 | Click the Installer button of `#levelSeg` | `document.body.dataset.level` = `'installer'`; `FarmShell.level` = `'installer'`; `aria-pressed` updated |
| S5 | Click `#themeBtn` | `document.documentElement.dataset.theme` toggles; button text as today |
| P1 | On `#/rooms`: `host = document.createElement('div'); document.body.append(host); log = []; p = FarmSettingsPanel.createSettingsPanel(host, { settings: ClimateController.defaultSettings(), onChange: (c, s) => log.push([c, s]) })` | `host` has `.card.targets`, `.card.rules`, `.card.machines` and 4 empty `[data-slot]` |
| P2 | `#rFanOn` = `600`, dispatch `change` | One `onChange`: `rules.fanOn` 900→600, `rules.fanOff` 700→550; `#rFanOff.value` = `'550'` |
| P3 | `#rFanOff` = `20000`, dispatch `change` | `rules.fanOn` →20000, `rules.fanOff` →19950; `#rFanOff.value` = `'19950'` |
| P4 | `#oT` = `9`, dispatch `change` | `offsets.T` 0→5; `#oT.value` = `'5'` |
| P5 | Stage set to `spawn`, then select `ready` in `#inFarm` | One call with `farmType` full→ready and `stage` spawn→fruiting |
| P6 | Recreate with `getCommand: () => ({ ac: { power: true, mode: 'heat', setpoint: 40 }, hu: { level: 2 }, fan: { level: 1 }, lights: { on: true }, circ: { on: true } })`; click Manual of `[data-dev="ac"]` | Changes include `manual.ac.auto` true→false, `manual.ac.mode` cool→heat, `manual.ac.setpoint` 25→30 |
| P7 | `p.set(next)` with another `spT`; `p.diff(ClimateController.defaultSettings())`; change `p.get()` | No `onChange`; `diff` lists `spT`; the panel is unchanged |
| P8 | Recreate with `readOnly: true` | Every `input`, `select`, `button` in `host` disabled; no `onChange` |
| P9 | `pr = FarmSettingsPanel.showChanges(changes, { title: 'T', confirmText: 'Save', note: true })`; type `  x  `; click Save. Again, press Escape. Then `p.destroy()`. | A `<dialog open>` in `document.body`, one line per change, note input `maxlength="200"`; resolves `'x'`, then `null`; the dialog is removed both times; `host` is empty |
| M1 | On `#/simulator` | `window.__climate` defined; `__climate.cfg === FarmBench.cfg`; `__climate.env === FarmBench.env` |
| M2 | Go to `#/capacity` | `window.__climate` is `undefined` |
| M3 | `t1 = __climate.reading.t`; go to `#/capacity`; wait 5 s; back to `#/simulator` | `__climate.reading.t - t1 < 600` (speed 600: it would be about 3000 if it ran while away) |
| M4 | Click `#benchBtn` | `#view` has `data-bench="on"`; `.simpanel` visible; still `on` after leaving and coming back |
| M5 | Farmer level: `#inSpT.disabled`; then Installer | `true`, then `false` |
| M6 | Select `pink` in `#inCrop`, dispatch `change` | `__climate.cfg.crop` = `'pink'`; `__climate.ctl.state.stage.ramp` not `null`; slot `program-status` shows the ramp line |
| M7 | Click Manual of `[data-dev="hu"]` | `__climate.cfg.manual.hu.auto` = `false`; `#huManual.disabled` = `false`; top event `Fogger set to manual` |
| M8 | `FarmBench.applyCalib({ ua: 100, infAch: 0.5, moistBuffer: 3, co2PerBlock: 60 }, { T: 0, RH: 0, CO2: 0 })` while mounted | `#inPerBlock.value` = `'60'`; event `Simulation calibrated: …` in the log |
| M9 | On `#/capacity`: click `#capSave` | `localStorage['mushroom-farm.rooms.v1']` has the room with `volume`, `vent`, `mix[0].crop` from `FarmBench`; `#capMsg` as today |
| M10 | Bench on, click `#resetBtn`, click `#calSample` | No download; `#calSampleMsg` = `Run the simulation for 1 h or more first.` |

### 8.4 Headless Chrome: old page versus new page

Run each check on the old page (`python3 -m http.server 8766 --bind 127.0.0.1 --directory /tmp/farm-old`) and on the new page (after `location.hash = '#/simulator'`, or the module named). Outputs must be equal strings.

| Id | Check | Compared value |
|---|---|---|
| E1 | Click `#pauseBtn`, `#resetBtn`, then `__climate.tick()` 7200 times | `JSON.stringify` of `{ t, T, RH, CO2 }` of `__climate.reading`, `__climate.ctl.state.cmd`, `__climate.ctl.alarmList().map(a => a.id)`. Reference at `BASE`: `t` 7200, `T` 24.807054792128362, `RH` 86.97965366094628, `CO2` 687.3509673915343 |
| E2 | After E1: `__climate.runTest({})` | `JSON.stringify` of the result |
| E3 | After E1: select `pink` in `#inCrop` (`change`), 3600 ticks | `cfg.crop`, `cfg.spT`, `ctl.state.stage.ramp !== null`, the reading as in E1 |
| E4 | (new: `#/calibration`) Load `/tmp/farm-check/log.csv` into `#calFile` with a `DataTransfer`, dispatch `change`; click `#calFit`; wait until `#calMsg` starts with `Fit done` (60 s max) | `#calParams` text, `#calErr0`, `#calErr1` |
| E5 | After E4: click `#calApply`; (new: go to `#/capacity`) set `#capName` to `A`, click `#capSave` | The stored room without `id` and `calib.date`; `#capMsg` without the date |

## 9. Done when

- [ ] Every file of section 3 is created, replaced or deleted as listed, and no other file changed (8.1 diff checks).
- [ ] `index.html` equals C5 1.2 (no font links, 15 script tags in order, `body data-level="farmer"`, no module markup).
- [ ] Every web file uses the IIFE wrapper, defines at most its one global, does no DOM work at load (`tests/web-load.test.js` green).
- [ ] `FarmShell`, `FarmUi`, `FarmApi`, `FarmCharts`, `FarmSettingsPanel`, `FarmBench` have exactly the members of C5 2.2, 5, 4, 6.2, 7.2/7.6 and 3.5.
- [ ] The six new test files pass; `npm test` is green with N + new tests; the 8 vector tests pass; `tests/vectors/` is unchanged.
- [ ] Headless S1–S5, P1–P9, M1–M10 pass with no problem beyond 8.2; E1–E5 give equal strings on old and new page.
- [ ] Every `unmount` stops what its `mount` started (`requestAnimationFrame`, timers, `ResizeObserver`s, trend charts, ladder, panel; `window.__climate` deleted); late capacity and calibration results are dropped (a switch during a running fit leaves no console error).
- [ ] `app.js` is deleted and nothing references it in `index.html` or `web/`.
- [ ] One or more commits per task on your branch; the worktree is clean; the report of section 11 is sent.

## 10. What NOT to do

| Do not | Why |
|---|---|
| Edit a file of section 4 | File ownership; report a needed contract change to the lead instead |
| Create, change or delete `web/rooms.js` | Lead's stub; Rooms UI stream in wave 2 |
| Use `FarmApi` inside the modules, add **Load/Save settings from room**, move capacity or calibration to the API, add the browser-storage import, remove the capacity JSON export/import or **Delete room** | Wave 2 (C5 3.6, 3.7, 7.8 wave 2 rows) |
| Pass settings from outside the panel (a file, HTTP) to `ClimateController.applySettings` without `safeSettings` | Lead decision 6 |
| Rename Reading keys or map them in `web/api.js` | Lead decision 1: C3 JSON passes through unchanged |
| Change behaviour beyond 6.2 (texts, defaults, limits, event texts, chart look) | Moved code only |
| Load anything from the internet; add npm packages, a bundler, a framework, `type="module"`, `defer` or `async` | C5 1.2–1.4 |
| Add members to a global beyond its contract (for example `FarmShell.parseHash`) | C5 is exact; keep helpers private |
| Set `innerHTML` from data | C5 1.4 (static template strings only) |
| Change `git config`, push, merge, rebase onto other streams, or commit `/tmp` scratch files | The lead merges |

## 11. Report to the lead

The branch name and commit list; N and the final `npm test` counts; the output of S, P, M checks with any problems seen; the E1–E5 strings (old and new); every contract gap you met and every point you decided that neither the contracts nor this brief cover.

## Appendix A: scratch helpers (`/tmp/farm-check/`, not in the repo)

Tested on Node 22.20 with `/usr/bin/google-chrome-stable` against today's page (E1 gives the reference values of 8.4). The `chrome-devtools` MCP tools, if your session has them, may run the same checks.

`cdp.js`: `node cdp.js <url> <checks.js>`. `checks.js` exports `[[name, expression], …]`; an expression may be an async IIFE. A check fails when it throws or returns `false`. The helper prints every problem (exceptions, `console.error`, HTTP ≥ 400, failed loads) for comparison with 8.2.

```js
const { spawn } = require('node:child_process');
const [url, checksFile] = process.argv.slice(2);
const checks = require(require('node:path').resolve(checksFile));
const port = 9333 + Math.floor(Math.random() * 500);
const chrome = spawn('google-chrome-stable', ['--headless=new', '--no-first-run', `--remote-debugging-port=${port}`,
  `--user-data-dir=/tmp/farm-check/profile-${port}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise(r => ws.addEventListener('open', r));
  let id = 0; const wait = new Map(), problems = [];
  ws.addEventListener('message', m => {
    const x = JSON.parse(m.data);
    if (x.id && wait.has(x.id)) { wait.get(x.id)(x); wait.delete(x.id); return; }
    if (x.method === 'Runtime.exceptionThrown') problems.push(`exception: ${x.params.exceptionDetails.exception?.description || x.params.exceptionDetails.text}`);
    if (x.method === 'Runtime.consoleAPICalled' && x.params.type === 'error') problems.push(`console.error: ${x.params.args.map(a => a.value ?? a.description).join(' ')}`);
    if (x.method === 'Network.requestWillBeSent' && !/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(x.params.request.url)) problems.push(`internet: ${x.params.request.url}`);
    if (x.method === 'Network.responseReceived' && x.params.response.status >= 400) problems.push(`HTTP ${x.params.response.status}: ${x.params.response.url}`);
    if (x.method === 'Network.loadingFailed' && !x.params.canceled) problems.push(`failed: ${x.params.errorText} ${x.params.requestId}`);
  });
  const send = (method, params = {}) => new Promise(r => { const n = ++id; wait.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  for (const d of ['Runtime', 'Page', 'Network', 'Log']) await send(`${d}.enable`);
  await send('Page.navigate', { url }); await sleep(2500);
  let failed = 0;
  for (const [name, expr] of checks) {
    const r = await send('Runtime.evaluate', { expression: `(async () => (${expr}))()`, awaitPromise: true, returnByValue: true });
    const v = r.result.exceptionDetails ? `THREW ${r.result.exceptionDetails.exception?.description}` : JSON.stringify(r.result.result.value);
    console.log(`${name}: ${v}`);
    if (r.result.exceptionDetails || r.result.result.value === false) failed++;
  }
  console.log(problems.length ? `PROBLEMS:\n  ${problems.join('\n  ')}` : 'PROBLEMS: none');
  ws.close(); chrome.kill(); process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(2); });
```

The old page loads Google Fonts, so its `internet:` lines are expected; only the new page must show none.

Example `checks.js` row for E1 (on the new page put `location.hash = '#/simulator'; await new Promise(r => setTimeout(r, 300));` first):

```js
module.exports = [
  ['E1', `(() => { document.getElementById('pauseBtn').click(); document.getElementById('resetBtn').click(); for (let i = 0; i < 7200; i++) __climate.tick(); const r = __climate.reading; return JSON.stringify({ t: r.t, T: r.T, RH: r.RH, CO2: r.CO2, cmd: __climate.ctl.state.cmd, alarms: __climate.ctl.alarmList().map(a => a.id) }); })()`],
];
```

E4 file load: build the expression in Node with the file text embedded: `const csv = ${JSON.stringify(fs.readFileSync('/tmp/farm-check/log.csv', 'utf8'))}; const dt = new DataTransfer(); dt.items.add(new File([csv], 'log.csv', { type: 'text/csv' })); const inp = document.getElementById('calFile'); inp.files = dt.files; inp.dispatchEvent(new Event('change'));`

`make-log.js`: `node make-log.js <worktree>` writes `/tmp/farm-check/log.csv` (121 rows, 2 h, one row per minute).

```js
const W = process.argv[2];
for (const f of ['sim.js', 'controller.js', 'calib.js']) require(`${W}/${f}`);
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, CAL = globalThis.ClimateCalib;
const e = structuredClone(SIM.DEFAULT_ENV); e.room = { ua: 120, infAch: 0.6, moistBuffer: 4 }; e.co2PerBlock = 55;
const cfg = CC.defaultSettings(); cfg.program.harvest.on = false;
const sim = SIM.create(e), ctl = CC.create(cfg, null, null);
let r = sim.read(), cmd = ctl.update(r), seq = r.seq; const rows = [];
for (let s = 0; s < 8 * 3600; s++) {
  sim.step(1, cmd); r = sim.read(); if (r.seq === seq) continue; seq = r.seq; cmd = ctl.update(r);
  if (r.t < 6 * 3600 || r.t % 60 !== 0) continue;
  rows.push({ t: r.t - 6 * 3600, T: r.T, RH: r.RH, CO2: r.CO2, tOut: r.tOut, rhOut: r.rhOut, fan: cmd.fan.level, fog: cmd.hu.level,
    acPower: cmd.ac.power ? 1 : 0, acMode: cmd.ac.mode, acSet: cmd.ac.setpoint, acFan: cmd.ac.fan, lights: cmd.lights.on ? 1 : 0, circ: cmd.circ.on ? 1 : 0 });
}
require('node:fs').writeFileSync('/tmp/farm-check/log.csv', CAL.toCsv(rows));
console.log(`${rows.length} rows`);
```

Stop both `http.server` processes when you finish.

# Work brief: Wave 2, Capacity and calibration

Date: 2026-10-08. Stream: `capacity-calibration`. Implementer on Sonnet; the reviews (spec compliance, then code quality) run on Opus.
Repo: `/home/foqcus/Documents/mushroom-farm`. You work alone in your own git worktree of it.
Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md` (sections 4, 5, 6).
Contracts (frozen): C5 `docs/contracts/web.md`, C3 `docs/contracts/api.md`. You never call C1 or C2. The lead decisions (LD 1 to 7, `LEAD-DECISIONS.md`) are folded into the contracts; the only one that touches this stream is LD 7: the fake API server is the lead's `tests/fakes/api-server.js`, and you never write a fake. When this brief and a contract disagree, the contract wins: follow it and report the difference to the lead.

## 1. Goal

Move the Capacity and Calibration modules off browser storage and off the Simulator (`FarmBench`), onto the farm server API (`FarmApi`).

| Module | After this stream |
|---|---|
| Capacity (`web/capacity.js`) | Rooms, crop mixes, applied calibrations and capacity reports come from the API (C5 3.7). A mix edit is saved at once. A finished check is stored. **New room** creates a running room on the server and replaces **Save the present room**. **Delete room** and the rooms JSON export and import are removed. A one-time **Import rooms from this browser** copies `mushroom-farm.rooms.v1` to the server. `normRoom` and `validCalib` come from `ClimateRoomRules`. |
| Calibration (`web/calibration.js`) | Pick a room; the module builds that room's simulation base itself (C5 3.6); load a CSV log, fit, then **Save and apply** stores the run and applies it to the room. No `FarmBench`. |

## 2. Owned files (the only files you may create or change)

| File | Status | Content |
|---|---|---|
| `web/capacity.js` | Change | Capacity module, wave 2 data flow (section 5.1 to 5.3) |
| `web/calibration.js` | Change | Calibration module, wave 2 data flow (section 5.4, 5.5) |
| `tests/web-capacity.test.js` | New | Node tests of the Capacity helpers and the import (section 6) |
| `tests/web-calibration.test.js` | New | Node tests of the Calibration helpers (section 6) |

Everything else is read-only, including `index.html`, `styles.css`, `room-rules.js`, `web/api.js`, `web/ui.js`, `web/charts.js`, `web/shell.js`, `web/simulator.js` (it keeps `FarmBench`; the lead removes it in wave 3), `web/rooms.js`, `capacity.js`, `calib.js`, `sim.js`, `controller.js`, `runtime.js`, `server/*`, `tests/fakes/*`, `package.json`, `README.md`, `docs/*`. If you need a change in one of them, stop and report the exact change to the lead.

## 3. Contract sections you build against

| Contract | Sections | What you take from it |
|---|---|---|
| C5 | 1.3, 1.4 | Load order; the file wrapper; no DOM work at load; markup as a template string; dynamic text with `textContent` |
| C5 | 1.6 | Wave 0 file names: the fake is `tests/fakes/api-server.js` (`tests/fakes/api.js` does not exist); your start check |
| C5 | 3.1, 3.2, 3.3 | `mount` / `unmount` rules (async results after `unmount` never touch the DOM); what each module shows; what is deleted (local `normRoom`, `validCalib`, `saveRooms`, `roomChanged`'s local save, `capSave`, `capDelete`, export, import; `calSample` stays in the Simulator) |
| C5 | 3.6 | Calibration fit input, steps 1 to 6 (exact) |
| C5 | 3.7 | Capacity data, actions, the one-time import (exact message texts) |
| C5 | 4.2, 4.3 | `ApiError`; the `FarmApi` functions you call: `listRooms`, `createRoom`, `getMix`, `saveMix`, `getCapacity` (resolves `null` on 404 `No capacity report`), `saveCapacity`, `listCalibrations`, `saveCalibration`, `applyCalibration` |
| C5 | 4.5 | `startFakeApi()` of `tests/fakes/api-server.js`, for one wire-level test |
| C5 | 5, 6.2 | `FarmUi.errorText`, `nf`, `paintChip`, `cell`, `clamp`; `FarmCharts.drawCalibCharts(host, { rows, base, fit })` |
| C5 | 7.10 | Your headless Chrome row ("Capacity and calibration") and "how wave 2 checks run" (against the real server) |
| C3 | 3.1, 3.6, 3.7, 3.8 | Room, Calibration, MixRow, CapacityReport JSON |
| C3 | 6.2, 6.12 to 6.18 | The routes behind those functions and their 400 rules (your bodies must pass them) |
| C3 | 7.1 to 7.5 | `ClimateRoomRules` members and limits (`LIM.blocks` 200000, `LIM.volume` [5, 5000], `LIM.co2` [1, 1000]) |
| C3 | 8, 8.1 | API to capacity.js / calib.js mapping; the exact import requests (no report import) |

### 3.1 Decisions this brief makes (the contracts leave these open; the lead accepts or changes them at review)

| # | Decision | Why |
|---|---|---|
| D1 | Each module registers `{ mount, unmount, helpers }`; `helpers` holds the pure functions of 5.2 and 5.4. The shell ignores the extra member. No new global. | C5 1.4 allows no module global; Node has no DOM, so this is the only way to test the logic |
| D2 | Ids: **New room** `capNew`, volume `capVolume`, vent `capVent`, import `capImportLocal`, room picker `calRoom`, blocks `calBlocks`. `calApply` keeps its id; its text becomes `Save and apply`. | C5 names some ids, not all |
| D3 | Capacity load failure (`listRooms` or any per-room request, at mount or a reload): every control of the card is disabled, the picker is empty, `capMsg` = `The rooms could not be loaded: <errorText>. Open Capacity again to retry.` | A half-loaded room could overwrite its stored mix |
| D4 | **New room**, **Import rooms from this browser** and the room picker are disabled while a check runs, a mix save is pending (any room), or a create or import runs | A reload during a pending save could show a stale mix |
| D5 | Queued mix saves keep running after `unmount` (an edit is not lost) but do not touch the DOM. A check that finishes after `unmount` is not saved. | C5 3.1; a check can be rerun, an edit cannot be recovered |
| D6 | **New room** with a volume that is not a finite number from 5 to 5000: no request, `capMsg` = `Enter a volume from 5 to 5000 m³.` | C5 3.7 gives the range, not the reaction |
| D7 | Calibration: while a fit or a save runs, `calRoom`, `calBlocks`, `calFile`, `calFit`, `calApply` are disabled. A change of room or blocks drops any fit on screen and replays the base line with the new `envBase`. | A fit belongs to one `envBase` |
| D8 | Calibration with no rooms: the picker shows one disabled option `No rooms yet`, Fit stays disabled, `calMsg` = `Create a room under Rooms first.` | Not covered by C5 |
| D9 | Calibration: if `getMix` or `listCalibrations` fails for the picked room, `calMsg` = `errorText` and Fit stays disabled until a room loads | Not covered by C5 |
| D10 | **Save and apply** where `saveCalibration` succeeds and `applyCalibration` fails: `errorText`, the fit stays; a retry saves a new run. No retry logic. | An extra unapplied run is harmless |
| D11 | Capacity header tag: `How many blocks can a room carry in fruiting, on a hot-dry, a hot-humid and a rainy day? It uses the room's applied calibration: calibrate the room first (Calibration in the menu) for a real verdict. The design days are estimates for lowland Peninsular Malaysia.` Initial `capMsg`: `Pick a room, enter the crops, then run the check.` | The old texts name the test bench and **Save** |
| D12 | The import stops at the first rejection of any kind (C5 says `ApiError`; a bug-type error stops it too). The message uses `FarmUi.errorText`, which handles both. | Safer superset of C5 3.7 |

## 4. Start check (Task 0, no code)

Your branch starts from `master` after the wave 1 merge and the lead's wave 1.5 gate (C3 2.3). If any row fails, stop and report to the lead; do not work around it.

| Check | Command | Expected |
|---|---|---|
| Wave 0 files (C5 1.6) | `ls tests/fakes/api-server.js web/rooms.js room-rules.js` | All three listed |
| Wave 1 web files | `ls web/capacity.js web/calibration.js web/api.js web/ui.js web/charts.js web/shell.js web/simulator.js` | All seven listed; `app.js` is gone |
| Real `room-rules.js` | `node -e "require('./sim.js');require('./controller.js');require('./runtime.js');require('./calib.js');require('./room-rules.js');console.log(Object.keys(ClimateRoomRules).sort().join(','))"` | `ALARM_KEYS,LIM,VERDICTS,checkCalibration,checkMix,checkReport,checkRoom,hasCrop,normRoom,validCalib` |
| Server files | `ls server/main.js server/api.js server/static.js server/config.js server/db.js server/rooms.js server/sim-adapter.js` | All listed |
| Baseline tests | `npm test 2>&1 \| tail -8` | `# fail 0`. Write down `# pass` as **B**. |
| Baseline vectors | `git status --porcelain tests/vectors` | Empty |

Then read: the wave 1 `web/capacity.js` and `web/calibration.js` (templates, ids, `renderFarm`, `renderReport`, `verdictText`, `calRender`, how they use `FarmBench`), `web/api.js`, `web/ui.js`, `web/charts.js` (`drawCalibCharts`), `room-rules.js`, `tests/fakes/api-server.js`, and `tests/calib.test.js` (`makeLog`).

## 5. What to build

### 5.1 Capacity state (one object per listed room)

| Field | Type | Meaning |
|---|---|---|
| `id`, `name`, `volume`, `vent` | int, str, num, str | From the C3 Room |
| `calib` | object \| null | `appliedCalib(listCalibrations(id))` |
| `mix` | capacity mix | What the table shows and edits: `[{ crop, blocks, co2PerBlock? }]` |
| `saved` | capacity mix | The mix of the last `getMix` or `saveMix` reply |
| `report` | object \| null | The latest CapacityReport (`getCapacity`, or the `saveCapacity` reply), or `{ report }` for a result that could not be saved. Only `report.report` is read. `null` after a mix edit. |
| `pending` | int | Mix saves queued or running |
| `chain` | Promise | The room's save queue (`Promise.resolve()` at load) |

### 5.2 Capacity `helpers` (pure, Node-testable)

| Helper | Signature | Contract |
|---|---|---|
| `toCapacityMix` | `(rows: MixRow[]) → mix` | Each row → `{ crop, blocks }`, plus `co2PerBlock: row.co2_per_block` when it is not `null` (C3 8) |
| `toMixRows` | `(mix) → MixRow[]` | Each item → `{ crop, blocks, co2_per_block: item.co2PerBlock ?? null }` |
| `sameMix` | `(a, b) → bool` | C5 3.7: same length; at each index the same `crop`, `blocks`, `co2PerBlock` (both absent = equal). A non-array argument → `false`. |
| `appliedCalib` | `(runs: Calibration[]) → calib \| null` | The run with `applied === true`, mapped as C3 8: `{ ua, infAch: inf_ach, moistBuffer: moist_buffer, co2PerBlock: co2_per_block, rmse: { T: rmse_t, RH: rmse_rh, CO2: rmse_co2 }, date: new Date(run_at * 1000).toISOString() }`. None → `null`. |
| `farmDate` | `(t: int) → str` | `YYYY-MM-DD` in farm time: `new Date((t + 28800) * 1000).toISOString().slice(0, 10)` |
| `optionText` | `(room) → str` | `<name> · calibrated <farmDate(Date.parse(calib.date) / 1000)>` or `<name> · not calibrated` |
| `roomInfo` | `(room) → str` | `<volume> m³ · calibrated <date>` (date as `optionText`) or `<volume> m³ · not calibrated (typical values)` |
| `clampBlocks` | `(text) → int` | `Math.round(+text)` held in 0 to 200000; empty or not finite → `0` |
| `clampCo2` | `(text) → int \| null` | Empty or not finite → `null`; else `Math.round(+text)` held in 1 to 1000 |
| `newRoomBody` | `(nameText, volumeText, vent, count) → { name, volume, vent } \| null` | `name` = `nameText.trim()`, or `Room <count + 1>` when empty; `volume` = `+volumeText`; `null` when the volume is not a finite number from 5 to 5000; `vent` as given |
| `shownReport` | `(room) → object \| null` | `room.report.report` when `room.report` is set and `sameMix(room.saved, room.report.report.mix)`; else `null` |
| `farmText` | `(rooms) → str` | The wave 1 `renderFarm` text, reading `shownReport(r)` wherever it read `r.report`. `''` for no rooms. |
| `readStored` | `(storage) → { i, room }[]` | `JSON.parse(storage.getItem('mushroom-farm.rooms.v1'))`; for each element of its `rooms` array at index `i`, `room = ClimateRoomRules.normRoom(element, i)`, `null` results left out (so `i` keeps gaps). Any throw, or no `rooms` array → `[]`. |
| `importPlan` | `({ i, room }, nowS) → { room, mix, calibration }` | The bodies of C3 8.1, exactly. `room` = `{ name: room.name.trim() \|\| 'Room <i + 1>', volume, vent }`; `mix` = the 8.1 MixRow[]; `calibration` = `null` when `room.calib` is `null`, else `{ ua, inf_ach, moist_buffer, co2_per_block, rmse_t, rmse_rh, rmse_co2, log_rows: null }` with each `rmse_*` by the 8.1 rule (finite and ≥ 0, else `null`), plus `run_at` only when `Math.floor(Date.parse(calib.date) / 1000)` is an integer from 1 to `nowS + 60` |
| `importRooms` | `(entries, api, { nowS, onRoom }) → Promise<{ created, failed }>` | For entry `k` = 1..n, in order, one request at a time: `onRoom(k, n)`; `p = importPlan(entry, nowS)`; `r = await api.createRoom(p.room)`; `created++`; `await api.saveMix(r.id, p.mix)`; if `p.calibration`: `run = await api.saveCalibration(r.id, p.calibration)`, `await api.applyCalibration(r.id, run.id)`. At the first rejection it stops and resolves `{ created, failed: { name: p.room.name, error } }`; otherwise `{ created, failed: null }`. Never rejects. `api` is `FarmApi` or a stub. |

### 5.3 Capacity behaviour (`mount`)

| Part | Behaviour |
|---|---|
| Markup | The wave 1 template, changed: `capSave` → `<button class="btn" id="capNew">New room</button>`, followed by a `span.tag` with `A new room starts running on the server at once (simulated, default settings) and appears under Rooms.`; add `<label class="num" for="capVolume">Volume <input type="number" id="capVolume" min="5" max="5000" step="1"> m³</label>` (value `ClimateSim.PLANT.room.volume`) and `<label for="capVent">Air path</label><select id="capVent"><option value="supply">supply</option><option value="exhaust">exhaust</option></select>`; remove `capDelete`, `capExport`, `capImport` (and its label); add `<button class="btn" id="capImportLocal" hidden>Import rooms from this browser</button>` in the last `.cal-row`; header tag and initial `capMsg` as D11. Existing CSS classes only. |
| Load (mount, and every "reload the module data") | `listRooms()`, then for every room `getMix`, `getCapacity`, `listCalibrations`, all in one `Promise.all`. Build 5.1. Any failure: D3. Keep the selected room by id (first room when it is gone). Render the picker (`optionText`), `capRoomInfo` (`roomInfo`), the mix table, the report (`shownReport`), `capFarm` (`farmText`). Show `capImportLocal` only when `localStorage['mushroom-farm.rooms.v1.imported']` is absent and `readStored(localStorage).length ≥ 1` (a throwing `localStorage` = no stored data). |
| Mix edit | C5 3.7: crop select, Blocks (`clampBlocks`), CO₂ per block (`clampCo2`), Remove, **Add a crop** (adds `{ crop: 'oyster', blocks: 500 }`). After each edit: `room.report = null`, re-render report and farm line, `room.pending++`, chain a save on `room.chain` that sends `toMixRows(room.mix)` as it is when the save starts. Success: `room.saved = toCapacityMix(reply)`. Rejection: `capMsg` = `errorText`, then `getMix(id)` → `room.mix = room.saved = toCapacityMix(rows)`, re-render the table if the room is selected. Finally `room.pending--` and update the button states. |
| **Run check** | Disabled with no room, while a check runs, while `room.pending > 0`, or by D4. No row with blocks > 0: `Add at least one crop with blocks.` and no check. `emptyBelow` from `capEmpty` as today. `snap = structuredClone({ name, volume, vent, calib, mix: room.saved })`; `ClimateCapacity.checkAsync(snap, snap.mix, { emptyBelow, onProgress })`, no `tariff`. Progress texts as today. |
| Check finished | When `room.pending === 0 && sameMix(room.saved, report.mix)`: `room.report = await saveCapacity(room.id, report)`, message `Done (<name>) after <n> simulation runs: <chip text>. <verdictText>` (as today). Otherwise `The room changed during the check: run it again.` and nothing saved. `saveCapacity` rejects: `room.report = { report }`, `The result was not saved: <errorText>`. `checkAsync` rejects: `The check stopped: <message>` (as today). After `unmount`: nothing (D5). |
| Report and farm line | The wave 1 `renderReport`, `verdictText`, `VERDICT_CHIP`, `LIMIT_WORD`, `FAIL_MACHINE`, reading `shownReport(room)`; `null` in `balance.estimate` reads as no limit (the existing `Number.isFinite` test does this) |
| **New room** | `body = newRoomBody(capName.value, capVolume.value, capVent.value, rooms.length)`; `null` → D6. Else `r = await createRoom(body)` (no `settings`), reload, select `r.id`, empty `capName`, `Created "<r.name>". Add its crops, then run the check.` Rejection: `errorText`. |
| Import | C5 3.7: `confirm('Create <n> room(s) from this browser on the farm server? Each one starts running as a simulated room.')`; on OK `nowS = Math.floor(Date.now() / 1000)`, `importRooms(readStored(localStorage), FarmApi, { nowS, onRoom })` with `onRoom` showing `Importing room <k> of <n>…`. Complete: `localStorage.setItem('mushroom-farm.rooms.v1.imported', String(nowS))`, hide the button, reload, `Imported <n> room(s). Run the check again for each room.` Failure: no marker, reload, `The import stopped at "<failed.name>": <errorText(failed.error)>. <created> room(s) were created; archive them on their room pages before you import again.` Never writes or removes `mushroom-farm.rooms.v1`. |
| `unmount` | Sets a flag every async continuation checks before it touches the DOM. No timers, no stream. |

### 5.4 Calibration `helpers` (pure, Node-testable)

| Helper | Signature | Contract |
|---|---|---|
| `envBaseFor` | `(room: Room, blocks) → env` | C5 3.6 step 3: `structuredClone(ClimateSim.DEFAULT_ENV)`; `vent = room.vent`; `room = { volume: room.volume }`; `blocks`; `blockStage = room.live && room.live.stage ? room.live.stage : DEFAULT_ENV.blockStage`. Nothing else changes. |
| `paramsOfRun` | `(run) → params` | `{ ua: run.ua, infAch: run.inf_ach, moistBuffer: run.moist_buffer, co2PerBlock: run.co2_per_block }` |
| `startParams` | `(runs, envBase) → params` | C5 3.6 step 4: `paramsOfRun` of the run with `applied === true`; none → `ClimateCalib.paramsOf(envBase)` |
| `defaultBlocks` | `(rows: MixRow[]) → int \| null` | Sum of `blocks` when ≥ 1, else `null` (field empty) |
| `parseBlocks` | `(text) → int \| null` | The number when `text.trim()` is an integer from 1 to `ClimateRoomRules.LIM.blocks`; else `null` |
| `calibBody` | `(fit: { params, result }, rows) → object` | C3 6.13 body: `ua`, `inf_ach`, `moist_buffer`, `co2_per_block` from `fit.params` (not rounded); `rmse_t`, `rmse_rh`, `rmse_co2` from `fit.result.rmse.T / RH / CO2`, `null` when not finite; `log_rows: rows.length`. No `run_at`. |

### 5.5 Calibration behaviour (`mount`)

| Part | Behaviour |
|---|---|
| Markup | The wave 1 template plus a first `.cal-row`: `<label for="calRoom">Room</label><select id="calRoom"></select>` and `<label class="num" for="calBlocks">Blocks in the room during the log <input type="number" id="calBlocks" min="1" max="200000" step="1"></label>`. `calApply` text `Save and apply`. The header tag says the log and the fit belong to the picked room. Keep `calFile`, `calFit`, `calMsg`, `calParams`, `calErr0`, `calErr1`, `calCharts` and the CSV columns `details`. No `calSample`. |
| Mount | `listRooms()` → picker (text = name, value = id); pick the first room. No rooms: D8. Rejection: `calMsg` = `errorText`. |
| Pick a room (also at mount) | A sequence number per pick; replies of an older pick are ignored. `Promise.all([getMix(id), listCalibrations(id)])` → `calBlocks.value = defaultBlocks(rows) ?? ''`, keep `runs`. Failure: D9. Then Rebuild. |
| Blocks `input` | Rebuild |
| Rebuild | `blocks = parseBlocks(calBlocks.value)`. Invalid: Fit disabled, `calMsg` = `Enter the number of blocks in the room during the log.` Valid: `envBase = envBaseFor(room, blocks)`, `params = startParams(runs, envBase)`, `fit = null`, `calApply` disabled; with a log loaded, `base = ClimateCalib.replay(rows, envBase, params)` (a throw: `calMsg` = its message). Render: table "Now" column = `params`; `FarmCharts.drawCalibCharts(calCharts, { rows, base, fit })`. |
| Load a CSV (`calFile`) | `ClimateCalib.parseCsv(text)`; a throw: `The file cannot be used: <message>`. Success: keep `rows`, Rebuild, then `<file name>: <n> rows, <h> h.` (today's text); the blocks message replaces it when the blocks are invalid. |
| **Fit** | Enabled when the room's data is loaded, the blocks are valid, `rows` is set, and no fit or save runs (D7). `ClimateCalib.fitAsync(rows, envBase, params, onProgress)` with today's progress and done texts. Result → `fit`, `calApply` enabled, render. |
| **Save and apply** | C5 3.6 step 6: `run = await saveCalibration(id, calibBody(fit, rows))`; `applied = await applyCalibration(id, run.id)`; `params = paramsOfRun(applied)`; mark it applied in `runs`; `base = replay(rows, envBase, params)`; `fit = null`; `calApply` disabled; `Saved and applied to <room name>.` Rejection: `errorText`, the fit stays (D10). |
| `unmount` | Sets the ignore flag. A running `fitAsync` is not cancelled; its result is dropped. |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, write the code, see it pass, commit)

Both test files start like this (C5 1.3 order; the shell is stubbed so the module registers into a local object):

```js
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../controller.js'); require('../runtime.js'); require('../calib.js');
require('../capacity.js'); require('../room-rules.js'); require('../web/ui.js'); require('../web/api.js');
const registered = {};
globalThis.FarmShell = { register: (name, m) => { registered[name] = m; } };
require('../web/capacity.js');          // '../web/calibration.js' in the other file
const H = registered.capacity.helpers;  // registered.calibration.helpers
```

Run one file: `node --disable-warning=ExperimentalWarning --test tests/web-capacity.test.js`.

| # | Test first (file: what it proves) | Then build | Commit message |
|---|---|---|---|
| 1 | Both files: requiring the module in Node (no `document`) does not throw; the registered object has `mount` and `unmount` functions and a `helpers` object. Fails now: no `helpers`. | `helpers: {}` in both `register` calls (D1); nothing else | `test(web): load capacity and calibration modules in Node` |
| 2 | Capacity: `toCapacityMix([{crop:'oyster',blocks:1200,co2_per_block:null},{crop:'pink',blocks:300,co2_per_block:55}])` deep-equals `[{crop:'oyster',blocks:1200},{crop:'pink',blocks:300,co2PerBlock:55}]`; `toMixRows` gives the rows back. `sameMix`: equal → `true`; other length, crop, blocks or `co2PerBlock` → `false`; absent vs absent → `true`; absent vs 55 → `false`; non-array → `false`. | `toCapacityMix`, `toMixRows`, `sameMix` | `feat(capacity): API mix mapping and sameMix` |
| 3 | Capacity: `appliedCalib` of a list whose `applied: true` run has `run_at: 1790827200`, `rmse_t: 0.2`, `rmse_rh: null` gives exactly the C3 8 shape with `rmse: { T: 0.2, RH: null, CO2: <rmse_co2> }` and `date: '2026-10-01T04:00:00.000Z'`; no applied run → `null`; `[]` → `null`. `farmDate(1791403200)` (2026-10-07 20:00 UTC) = `'2026-10-08'`. `optionText({ name: 'North', volume: 80, calib: { …, date: '2026-10-07T20:00:00.000Z' } })` = `'North · calibrated 2026-10-08'`, `roomInfo` of it = `'80 m³ · calibrated 2026-10-08'`; with `calib: null`: `'Room 1 · not calibrated'` and `'60 m³ · not calibrated (typical values)'`. | `appliedCalib`, `farmDate`, `optionText`, `roomInfo` | `feat(capacity): rooms and calibrations from the API` |
| 4 | Capacity: `clampBlocks`: `'12.6'`→13, `'-5'`→0, `'300000'`→200000, `''`→0, `'abc'`→0. `clampCo2`: `''`→`null`, `'0'`→1, `'55.4'`→55, `'5000'`→1000, `'x'`→`null`. `newRoomBody('  ', '60', 'supply', 2)` → `{ name: 'Room 3', volume: 60, vent: 'supply' }`; `' North '` → `'North'`; volume `'4'`, `'5001'`, `''`, `'abc'` → `null`; `'5'` and `'5000'` accepted. | `clampBlocks`, `clampCo2`, `newRoomBody` | `feat(capacity): mix input rules and New room body` |
| 5 | Capacity: `shownReport` returns the report when its `mix` equals `saved`, `null` when stale (blocks changed) or missing. `farmText` of room A (mix `[{oyster,1200}]`, fresh report: `capacity.max` 1600, `planned` 1200, `runs: [{}]`) and room B (mix `[{pink,500}]`, report with `mix [{pink,400}]`, `runs: [{}]`) = `Farm: 2 rooms, 1,700 blocks planned; capacity 1,600 blocks in 1 checked room (75 % used). 1 room not checked yet.`; `[]` → `''`. | `shownReport`, `farmText` (moved out of the wave 1 `renderFarm`) | `feat(capacity): show only a report that matches the saved mix` |
| 6 | Capacity: `readStored` with `{ getItem: () => JSON.stringify({ version: 1, rooms: [null, { name: 'A', volume: 80, vent: 'exhaust', mix: [{ crop: 'oyster', blocks: 900 }] }, 'bad'] }) }` → one entry, `i === 1`; a throwing `getItem`, bad JSON, or `null` → `[]`. `importPlan` for a room named `'   '` at `i = 2` → name `'Room 3'`; mix `co2PerBlock` absent → `co2_per_block: null`; `calib: null` → `calibration: null`; a valid calib with `date: '2026-10-01T04:00:00.000Z'` → the exact 8.1 body with `log_rows: null` and `run_at: 1790827200`; a date after `nowS + 60`, `''` or `'nonsense'` → no `run_at` key; `rmse.T` = `-1`, `NaN` or missing → `rmse_t: null`. Every body passes `checkRoom(body.room, false)`, `checkMix(body.mix)`, `checkCalibration(body.calibration, nowS)` with `[]`. | `readStored` (with `ClimateRoomRules.normRoom`), `importPlan` | `feat(capacity): read browser-storage rooms for the import` |
| 7 | Capacity: `importRooms` with a recording stub (each function pushes `[name, ...args]`; `createRoom` resolves `{ id: 10 + k, name }`, `saveCalibration` resolves `{ id: 90 }`). Two entries, the first calibrated: calls are exactly `createRoom`, `saveMix(11, …)`, `saveCalibration(11, …)`, `applyCalibration(11, 90)`, `createRoom`, `saveMix(12, …)`; result `{ created: 2, failed: null }`; `onRoom` got (1, 2), (2, 2). Second `createRoom` rejects: `{ created: 1, failed: { name: <second name>, error } }`, no call after it. First `saveMix` rejects: `created: 1`, no further call. | `importRooms` | `feat(capacity): one-time import through the API` |
| 8 | Capacity, wire level: `const { startFakeApi } = require('./fakes/api-server.js')`; `fake = await startFakeApi()`; `FarmApi.base = fake.url`; `fake.reply('POST', '/api/rooms', 201, { id: 7, name: 'North' })`; `fake.reply('POST', '/api/rooms/7/calibrations', 201, { id: 3 })`. `importRooms` of one calibrated entry with `FarmApi` → `fake.requests` (method, path, body) = `POST /api/rooms`, `PUT /api/rooms/7/mix`, `POST /api/rooms/7/calibrations` (the `importPlan` bodies), `POST /api/rooms/7/calibrations/3/apply` (body `null`). `await fake.close()` in `after`. | Nothing if task 7 is right (proves the `FarmApi` names and paths) | `test(capacity): import requests on the wire` |
| 9 | Capacity, source checks (`web/capacity.js` read as text): no `FarmBench`, `capSave`, `capDelete`, `capExport`; no `/\bcapImport\b/`; no `function normRoom`, `function validCalib`, `function loadRooms`, `function saveRooms`; no `removeItem`; no `tariff`; contains `capImportLocal`, `capNew`, `capVolume`, `capVent`. | The 5.3 `mount` / `unmount` with the helpers. Delete the local `LIM`, `hasCrop`, `inRange`, `normRoom`, `validCalib`, `loadRooms`, `saveRooms`, the `capSave`, `capDelete`, `capExport`, `capImport` handlers and every `FarmBench` use. | `feat(capacity): rooms, mixes and reports from the farm server; JSON export and import removed` |
| 10 | Calibration: `envBaseFor({ vent: 'exhaust', volume: 80, live: { stage: 'pinning' } }, 1500)` deep-equals `DEFAULT_ENV` with only `vent`, `room` (`{ volume: 80 }`), `blocks`, `blockStage` changed; `live.stage: null` and `live: null` → `blockStage: 'fruiting'`. `paramsOfRun` maps the four values. `startParams`: applied run → its values; none → `{ ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 }`. `defaultBlocks`: `[]` and `[{blocks:0}]` → `null`, `[{blocks:1200},{blocks:300}]` → 1500. `parseBlocks`: `'1500'`→1500, `' 7 '`→7, `'200000'`→200000; `''`, `'0'`, `'12.5'`, `'200001'`, `'x'` → `null`. | `envBaseFor`, `paramsOfRun`, `startParams`, `defaultBlocks`, `parseBlocks` | `feat(calibration): the picked room's simulation base` |
| 11 | Calibration: `calibBody({ params: { ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41.7 }, result: { rmse: { T: 0.21, RH: NaN, CO2: 38 } } }, <720 rows>)` deep-equals `{ ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41.7, rmse_t: 0.21, rmse_rh: null, rmse_co2: 38, log_rows: 720 }`, and `checkCalibration(body, now)` is `[]`. | `calibBody` | `feat(calibration): run body for the API` |
| 12 | Calibration, the block count reaches the simulation: a 12 h log built like `tests/calib.test.js` `makeLog` (6 h start-up, one row per 60 s) from `DEFAULT_ENV` with `vent: 'exhaust'`, `blocks: 1500`, `co2PerBlock: 60`, `room: { volume: 80, ua: 150, infAch: 0.8, moistBuffer: 4 }` (721 rows). With `room = { vent: 'exhaust', volume: 80, live: { stage: 'fruiting' } }` and `p = { ua: 150, infAch: 0.8, moistBuffer: 4, co2PerBlock: 60 }`: `replay(rows, envBaseFor(room, 1500), p).rmse.CO2 < 10` and `replay(rows, envBaseFor(room, 2000), p).rmse.CO2 > 40` (measured: 0.8 and 78, under 1 s). | Nothing if task 10 is right | `test(calibration): block count drives the replay` |
| 13 | Calibration, source checks: no `FarmBench`, no `calSample`; contains `calRoom`, `calBlocks`, `saveCalibration`, `applyCalibration`. | The 5.5 `mount` / `unmount` with the helpers | `feat(calibration): fit a picked room and Save and apply through the farm server` |
| 14 | Headless Chrome check (7.2) | Fix what it finds; a Node test first for any helper bug | `fix(...)` as needed |
| 15 | Full verification (7.1) | – | – |

Commit on your worktree branch only, with the repo's configured git identity. Do not change git config, push or merge.

## 7. How to verify

### 7.1 Commands

| Check | Command | Expected |
|---|---|---|
| Syntax | `node --check web/capacity.js && node --check web/calibration.js` | No output, exit 0 |
| New tests | `node --disable-warning=ExperimentalWarning --test tests/web-capacity.test.js tests/web-calibration.test.js` | `# fail 0` |
| Whole suite | `npm test 2>&1 \| tail -8` | `# fail 0`; `# pass` = **B** + the new tests |
| Recorded runs | `git status --porcelain tests/vectors && git diff --stat master...HEAD -- tests/vectors controller.js sim.js` | Both empty: the 8 recorded runs are unchanged |
| Ownership | `git diff --name-only master...HEAD` | Only the four files of section 2 |
| No room storage | `grep -n "setItem\|removeItem" web/capacity.js web/calibration.js` | One `setItem` (the `.imported` marker); no `removeItem` |

### 7.2 Headless Chrome check (C5 7.10, against the real server)

Use the Chrome DevTools tools (`mcp__chrome-devtools__*`: `new_page`, `navigate_page`, `evaluate_script`, `click`, `fill`, `upload_file`, `handle_dialog`, `wait_for`, `list_console_messages`). With no browser tool, do not mark the stream done; report it to the lead.

| Step | Action | Expected |
|---|---|---|
| 1 | `PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"); DIR=$(mktemp -d); FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$DIR/farm.db npm start` (background) | `Open http://127.0.0.1:<PORT>`; the empty db gets the demo room `Room 1` |
| 2 | Run the task 12 log builder as a script; write `ClimateCalib.toCsv(rows)` to `/tmp/cal-log.csv` | 721 data rows |
| 3 | Open `http://127.0.0.1:<PORT>/#/capacity`; `evaluate_script`: `localStorage.removeItem('mushroom-farm.rooms.v1.imported'); localStorage.setItem('mushroom-farm.rooms.v1', JSON.stringify({ version: 1, rooms: [ { id: 'a', name: 'North room', volume: 80, vent: 'exhaust', calib: { ua: 120, infAch: 0.5, moistBuffer: 3, co2PerBlock: 50, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: '2026-10-01T04:00:00.000Z' }, mix: [ { crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2PerBlock: 55 } ] }, { id: 'b', name: 'South room', volume: 40, vent: 'supply', calib: null, mix: [] } ] }))`; reload | `#capImportLocal` visible; the picker lists `Room 1 · not calibrated` |
| 4 | Click `capImportLocal`, accept the `confirm` | `Imported 2 room(s). Run the check again for each room.` |
| 5 | `fetch` `/api/rooms`, then North's `/mix` and `/calibrations`, South's too | `North room` (80, exhaust), `South room` (40, supply). North mix `[{crop:'oyster',blocks:1200,co2_per_block:null},{crop:'pink',blocks:300,co2_per_block:55}]`; one run, `applied: true`, `run_at: 1790827200`, `log_rows: null`. South: `[]` and `[]`. The marker is set. |
| 6 | Reload | `#capImportLocal` hidden; North's option says `calibrated 2026-10-01` |
| 7 | Pick North, set oyster blocks to 1000, wait 1 s, GET its `/mix` | First row `blocks: 1000` |
| 8 | **Run check** on North, wait for `Done (North room)` (up to 120 s), GET `/capacity` | 200; `report.mix` equals the saved mix; the report shows on the card |
| 9 | Set North's pink blocks to 400 | The report disappears; the farm line counts North as not checked yet |
| 10 | `capName` = `Test room`, `capVolume` = `30`, `capVent` = `exhaust`, click `capNew` | `Created "Test room". Add its crops, then run the check.`; selected; `/api/rooms` has it (30, exhaust) |
| 11 | `capVolume` = `4`, click `capNew` | `Enter a volume from 5 to 5000 m³.`; no new room |
| 12 | Open `#/calibration`, pick North | `calBlocks` = `1400` (the mix sum after step 9); the "Now" column shows `120.0`, `0.50`, `3.0`, `50.0` |
| 13 | Empty `calBlocks` | Fit disabled; `Enter the number of blocks in the room during the log.` |
| 14 | `calBlocks` = `1500`; `upload_file` `/tmp/cal-log.csv` to `calFile`; **Fit**; wait for `Fit done` (up to 120 s); **Save and apply** | `Saved and applied to North room.`; North `/calibrations`: newest run `applied: true`, `log_rows: 721`; the imported run `applied: false` |
| 15 | `#/rooms` → `#/capacity` → `#/calibration` → `#/rooms` | No errors |
| 16 | `list_console_messages` | No errors and no 404s (except `/favicon.ico`) during the whole check |
| 17 | Kill the server; `rm -rf "$DIR" /tmp/cal-log.csv` | – |

Report each step's expected and actual result in your final report; do not commit them.

## 8. Done when

| # | Item |
|---|---|
| 1 | Every start check of section 4 held (or the lead answered) |
| 2 | Tasks 1 to 13 committed in order, each test written first and seen failing |
| 3 | `npm test`: `# fail 0`, pass count = **B** + the new tests |
| 4 | `tests/vectors/` (the 8 recorded runs), `controller.js` and `sim.js` unchanged |
| 5 | Only the four owned files differ from `master` |
| 6 | Neither module uses `FarmBench`; Capacity has no `capSave`, `capDelete`, `capExport`, `capImport`, and no local `normRoom`, `validCalib`, `LIM`, `hasCrop` |
| 7 | Every message text of C5 3.6, 3.7 and D3 to D11 is in the code word for word |
| 8 | Every step of 7.2 passed with no console errors |
| 9 | Final report to the lead: commits, test counts, headless results, and D1 to D12 restated for acceptance |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 2 | File ownership (spec section 6); report needed changes to the lead |
| Write a fake or name `tests/fakes/api.js` | LD 7, C5 1.6: the lead's `tests/fakes/api-server.js` is the only fake API |
| Add CSS | Use existing classes (`cal-row`, `num`, `tag`, `btn`, `cap-mix`, `cap-report`, `cap-farm`) |
| Add a global, a new file, an npm package, a bundler or a framework | C5 1.4; the only addition is `helpers` (D1) |
| Open the stream in either module | C5 3.7: Capacity loads at each mount; Calibration needs no live data |
| Write, change or delete `mushroom-farm.rooms.v1`, or keep rooms in browser storage | C5 3.7; only the marker is written |
| Import stored capacity reports | C3 8.1 |
| Send `settings` with `createRoom`, or a `tariff` to `checkAsync` | C5 3.7 |
| Round `co2_per_block` before saving a calibration | C3 8 maps `params.co2PerBlock` unchanged |
| Add retries, time-outs, undo, room delete or archive, or re-import | YAGNI; archive is on the room page (C5 3.2) |
| Validate API bodies beyond the input rules above | The server validates (C3 7) |
| Run `npm run vectors`, or change `controller.js` or `sim.js` | The 8 recorded runs must stay unchanged |
| Change a contract, push, merge, or change git config | Only the lead does these |

# Work brief: Calibrate tab (`web/room-calibrate.js`, the `drawCalibCharts` options)

Revision 1, 2026-10-09 (wave 2, written in prep 2.0 from the frozen contracts on `master` e60dabf). Stream: **Calibrate tab**. Implementer on Sonnet; the reviews (spec compliance, then code quality) run on Opus before the lead merges.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (here: 6, 16, 22, 23, 24, 28, 35, 42, 50) | `docs/contracts/LEAD-DECISIONS.md` | They override this brief and every contract text |
| C5 revision 8 | `docs/contracts/web.md` | 1.4, 3.1, 3.6 (the fit input, steps 1–6), 3.9, 3.11 (all rows, the history log table), 4.3 mapping, 6.2 (`drawCalibCharts` with `labels`, `dashed`, `base.series`), 7.10 rows "how wave 2 checks run" and "Calibrate tab" |
| C3 revision 9 | `docs/contracts/api.md` | 3.2 Reading, 3.6 Calibration (`source`, `log_from`, `log_to`, `equipment`), 3.9 SimulationRunInfo, 6.8 (range limits), 6.12–6.14, 6.20, 6.22, 6.23 (`real_start`), 6.25, 7.4 (`checkCalibration`), 8 |
| C7 revision 3 | `docs/contracts/cycle.md` | 10 (the hourly series), 12 (Result, `series[h]`); read-only |
| C8 revision 3 | `docs/contracts/equipment.md` | 4.5 (`plantOf(eq, { volume, calib: {} })`: machines only, the sun stays 500 W); read-only |
| C9 revision 2 | `docs/contracts/air.md` | 4.1 (`envBase.airM3h`), 8 (`calib.js` column `air`); read-only |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 3 (Calibrate tab row), 3.1, 4, 5, 9 |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/room-calibrate.md` | Committed on `master` by the lead in prep 2.0; you do not edit it |

## 1. Goal

| Outcome | Measure |
|---|---|
| The Calibrate tab | Replaces the prep 2.0 stub `web/room-calibrate.js`; registers tab `calibrate`; fits the room values from the room's own readings (default range yesterday–today, farm days) or a CSV log, with the room's blocks, machines and air exchange size; **Save and apply** stores the run with `source`, `log_from`, `log_to`, `equipment` and applies it |
| Stale calibration warning | `#cbStale` when the applied calibration was fitted with other machines than the room has now (lead decision 50) |
| Predicted vs real | A saved cycle run linked to the room by `real_start`; the predicted hourly series against the real hourly readings in `div.cal-charts`, the mean differences and the stage agreement (lead decision 24) |
| Chart options | `FarmCharts.drawCalibCharts(host, { rows, base, fit, labels?, dashed? })` (C5 6.2); each call's host is a `div.cal-charts` |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/room-calibrate` (below `<worktree>`), on branch `stream/room-calibrate`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm`. |
| Git | Keep the configured identity (never change `git config`). Plain commit messages such as `feat(room-calibrate): …`, `feat(charts): …`, `test(room-calibrate): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase; never merge `master` into your branch. |
| Gate 2.5 | Before gate 2.5 `plantOf` is the stub (`Error('stub')`) and the server lacks the wave 2 routes and Reading keys: you test in Node, with `plantOf` recorded (C5 3.11 "Node tests with machines"). Your headless check runs only after the lead's gate 2.5. Do tasks 0–10, commit, tell the lead you wait for gate 2.5, then run task 11. |
| `replay` and `stage` | `calib.js` `replay` follows each row's `stage` only after the Bench stream merges (wave 3). Until then it ignores `stage`: your tests and your check assert no fit result that depends on it, and no text of `ClimateCalib.PARAMS.ua.label` or `.note` (both the Bench stream's, C5 3.11) |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/room-calibrate` |
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` (C5 1.6) | All three listed |
| `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js web/batches.js web/harvest.js web/harvest.css` (C5 1.7) | All eight listed |
| `grep -c 'web/room-tabs.js' index.html` (C5 1.7) | `1` |
| `cat web/room-calibrate.js` | The prep 2.0 stub (the C5 1.4 wrapper, registering nothing) |
| `grep -n "function drawCalibCharts" web/charts.js` | One line: `function drawCalibCharts(host, { rows, base, fit }) {` (no options yet) |
| `grep -n -e listSimulations -e getSimulation -e updateSimulation -e getEquipment web/api.js` | All four present (lead, prep 2.0) |
| `npm test` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `K0` |

Read before you code: `web/calibration.js` (wave 1: the fit card, its texts and number formats; you reuse them, it stays unchanged), `calib.js` (`parseCsv`, `toCsv`, `replay`, `fitAsync` and its progress `{ evals, maxEval, score }`, `paramsOf`, `PARAMS`), `web/charts.js` (`drawCalibCharts`), `styles.css` lines 446–454 (`.cal-charts`, `.simb` dashed by CSS, `.cal-key`), `web/room-tabs.js`, `web/api.js`, `web/ui.js`.

## 3. Owned files (the only files you may touch; wave 2 plan 3, Calibrate tab row)

| File | Action | Content |
|---|---|---|
| `web/room-calibrate.js` | Replace the prep 2.0 stub | The tab (section 5) |
| `web/charts.js` | Modify `drawCalibCharts` only | The `labels` and `dashed` options (5.5); nothing else in the file |
| `tests/web-room-calibrate.test.js` | Create | Section 6 |
| `tests/web-charts.test.js` | Append tests only | CH1–CH4 (section 6); the existing tests unchanged |

| Not yours | Owner |
|---|---|
| `calib.js` (`PARAMS.ua` label and note, `replay` following `stage`) | Bench |
| `web/calibration.js` (stays unchanged; the lead deletes it in wave 3) | Nobody in wave 2 |
| `equipment.js` | Equipment |
| `web/rooms.js`, `web/shell.js`, `styles.css` (`.cal-charts`, `.fit-table`, `.pvr-card` are in its block) | Room shell |
| `web/room-tabs.js`, `web/api.js`, `index.html`, `tests/fakes/*` | Lead (prep 2.0) |
| `room-rules.js`, `server/*` | Server 2 |
| Everything else | Read-only |

| Rule | Detail |
|---|---|
| CSS | You add no CSS. Use the C5 3.8 classes (`.explain`, `.fit-table`, `.pvr-card`, `.cal-charts`, `.room-msg`) and today's (`card`, `seg`, `tag`, `btn`, `cal-row`, `vh`, `measure`, `est-note`) |
| Blocked | If something outside your files blocks you, stop that part and report it to the lead |

## 4. What you build against

| Source | What you take from it |
|---|---|
| C5 3.6 | Steps 1–6: what loads at mount, the blocks field and its rule and message, `envBase` (with `airM3h`, `blockStage`, `plant`), start values, replay and fit, the **Save and apply** body and message |
| C5 3.11 | Explain text, Load at mount, Machines warning and `sameMachines`, Source, History range (default yesterday–today, at most 7 days, raw), the History log table (`logFromReadings`), Log file, `envBase`, Table (the `PARAMS.ua.note` only when a string), **Save and apply**, Predicted vs real card, Comparison, Differences, `helpers`, Node tests with machines |
| C5 6.2 | `drawCalibCharts(host, { rows, base, fit, labels?, dashed? })`: `host` a `div.cal-charts`; `base` read as `base.series`; `labels` `{ rows, base, fit }` (defaults: today's texts); `dashed` `'base'`, `'fit'` or `null` (default: today's) |
| C3 6.8 | Raw rows: `to − from` at most 7 days (604,800 s); `step` 3600: up to 1300 days |
| C3 6.13, 7.4 | The calibration body: `source` (`history` with `log_from` and `log_to`, `csv` with both left out), `equipment` (the 7 fields or `null`) |
| C3 6.23, 7.6 | `updateSimulation(id, runId, { real_start })`: `real_start` from 1 to now + 366 days |
| C7 10, 12 | `series[h]` = `{ h, stage, flush, T, RH, CO2, core, kwh }`, day 0 starts at 00:00 of the simulated clock |

| Lead decision | As it applies to this stream |
|---|---|
| 22 | `GET /readings` allows up to 1300 days with `step` ≥ 3600, so Predicted vs real loads a whole cycle by the hour |
| 23 | The browser loads raw readings (≤ 7 days), maps them with `logFromReadings`, fits with `fitAsync`; CSV stays the second source; calibrations record `source`, `log_from`, `log_to`; `replay` follows a row's `stage` (Bench) |
| 24 | Predicted vs real: `real_start` (00:00 farm time); series hour `h` against the bucket at `real_start + h × 3600`; both curves, the mean absolute differences, the stage agreement |
| 28 | The `ua` label and note are the Bench stream's; you show the note only when it is a string |
| 35 | The fit uses `plantOf(equipment, { volume, calib: {} })` (machines only, typical sun) and `envBase.airM3h` = the settings' `airM3h` |
| 42 | An applied calibration wins even at a `calib.js` limit; nothing changes here in wave 2 |
| 50 | The calibration records the machines it was fitted with; the tab warns when they differ from the room's machines now |

## 5. Design (fixed by this brief where the contracts leave it open)

### 5.1 Tab shape

| Item | Rule |
|---|---|
| Registration | At load, exactly one call: `global.FarmRoomTabs.register('calibrate', { mount, unmount, helpers })`. No global |
| At load | No DOM, no `FarmApi` call. `ClimateSim`, `ClimateCalib`, `ClimateController`, `ClimateEquipment`, `ClimateRoomRules`, `FarmUi`, `FarmApi`, `FarmCharts` are read inside functions |
| State (closure, reset at each `mount`) | `ctx`, `id`, `room`, `mixRows`, `runs` (Calibration[]), `equipment`, `settings`, `source` (`'history'`), `rows` (calib log rows or `null`), `range` (`{ from, to }` of the loaded history or `null`), `envBase`, `params`, `base`, `fit`, `busy` (a fit or a save runs), `cycles` (SimulationRunInfo[] of kind `cycle` that ran), `alive`, `seq` |

### 5.2 Pure helpers (`helpers`)

No helper changes its arguments or touches the DOM or network. `SIM` = `ClimateSim`, `CC` = `ClimateController`, `CAL` = `ClimateCalib`. `FIELDS7` = `['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height']`.

| Helper | Signature → result | Rule |
|---|---|---|
| `farmMidnight(dateText)` | `('YYYY-MM-DD') → int \| null` | `Date.UTC(y, m − 1, d) / 1000 − 28800` (00:00 farm time, UTC+8, whatever the browser's zone); `null` for an empty or invalid text (not `YYYY-MM-DD`, or a day that does not exist: the date read back with UTC getters differs) |
| `farmDate(t)` | `(int) → 'YYYY-MM-DD'` | The farm date of `t`: `new Date((t + 28800) * 1000)` read with `getUTCFullYear`, `getUTCMonth`, `getUTCDate` |
| `defaultRange(now)` | `→ { from, to }` | C5 3.11: `{ from: farmDate(now − 86400), to: farmDate(now) }` (yesterday and today, farm days) |
| `rangeQuery(fromText, toText, now)` | `→ { from, to, days } \| { error }` | `a = farmMidnight(fromText)`, `b = farmMidnight(toText)`. Either `null` → `{ error: 'Pick the first and the last day.' }`; `a > b` → `{ error: 'The first day is after the last day.' }`; `days = (b − a) / 86400 + 1 > 7` → `{ error: 'Pick at most 7 days.' }` (C3 6.8 raw limit); `to = min(now, b + 86400 − 1)`; `to < a` → `{ error: 'The first day is in the future.' }`; else `{ from: a, to, days }` |
| `logFromReadings(readings)` | `(Reading[]) → calib rows` | C5 3.11 table "History log row", in `t` order, `t0` = the first `t`: `t` = `r.t − t0`; `hour` = `((r.t + 28800) % 86400) / 3600`; `T`, `RH`, `CO2`, `tOut`, `rhOut` from `r.T`, `r.RH`, `r.CO2`, `r.t_out`, `r.rh_out`, `null` when not finite or outside `CC.SENSORS[k]` `min`–`max` (`k` = `T`, `RH`, `CO2`, `tOut`, `rhOut`); `air` = `r.air`, `fog`, `lights`, `circ` as stored; `acPower` = `r.ac_mode === 'off' ? 0 : 1`; `acMode` = `r.ac_mode === 'off' ? null : r.ac_mode`; `acSet` = `r.ac_setpoint`; `acFan` = `r.ac_fan`; `stage` = `r.stage`. Exactly these 15 keys per row |
| `historyGaps(readings)` | `→ int` | The number of neighbouring readings (in `t` order) more than 600 s apart |
| `envBaseFor(room, blocks, rows, equipment, airM3h)` | `→ env` | C5 3.6 step 3: `e = structuredClone(SIM.DEFAULT_ENV)`; `e.airM3h = airM3h`; `e.room = { volume: room.volume }`; `e.blocks = blocks`; `e.blockStage` = the `stage` of the first of `rows` that has one, else `room.live && room.live.stage`, else `SIM.DEFAULT_ENV.blockStage`; when `equipment` is set, `e.plant = ClimateEquipment.plantOf(equipment, { volume: room.volume, calib: {} })` (no `plant` key without it). Nothing else changes |
| `paramsOfRun(run)` | `(Calibration) → params` | `{ ua: run.ua, infAch: run.inf_ach, moistBuffer: run.moist_buffer, co2PerBlock: run.co2_per_block }` |
| `startParams(runs, envBase)` | `→ params` | C5 3.6 step 4: `paramsOfRun` of the run with `applied === true`; none → `CAL.paramsOf(envBase)` |
| `defaultBlocks(rows, live)` | `(MixRow[], Live \| null) → int \| null` | C5 3.6 step 2: the sum of `blocks` when ≥ 1; else `live.blocks` when set (≥ 1); else `null` (the field stays empty) |
| `parseBlocks(text)` | `→ int \| null` | The number when `text.trim()` is an integer from 1 to `ClimateRoomRules.LIM.blocks`; else `null` |
| `calibBody(fit, rows, source, range, equipment)` | `→ object` | C5 3.6 step 6, C3 6.13: `{ ua, inf_ach, moist_buffer, co2_per_block }` from `fit.params` (not rounded); `rmse_t`, `rmse_rh`, `rmse_co2` from `fit.result.rmse.T / RH / CO2`, `null` when not finite; `log_rows: rows.length`; `source`; for `'history'` also `log_from: range.from`, `log_to: range.to` (for `'csv'` both left out); `equipment`: the 7 `FIELDS7` fields of `equipment`, or `null`. No `run_at` |
| `sameMachines(a, b)` | `→ bool` | C5 3.11: both `null` → `true`; both objects with equal `FIELDS7` values (other keys such as `room_id`, `saved_at` ignored) → `true`; else `false` |
| `staleText(applied)` | `(Calibration) → string` | `The applied calibration (<farmDate(applied.run_at)>) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.` |
| `pairSeries(series, buckets, start)` | `→ pairs` | For each series hour `h` with a bucket whose `t === start + h × 3600`: `{ h, sim: { T, RH, CO2, stage }, real: { T, RH, CO2, stage } }` (the series' and the bucket's values), `h` ascending; hours without a bucket are left out |
| `differences(pairs)` | `→ { T, RH, CO2, hours, stageShare }` | `T`, `RH`, `CO2`: the mean of `\|sim.k − real.k\|` over the pairs where both are finite (`NaN` when none); `hours` = `pairs.length`; `stageShare` = the % of the pairs whose `real.stage` is set that have `real.stage === sim.stage` (`null` when no pair has a real `stage`) |
| `differenceLines(d)` | `→ string[]` | `hours === 0`: `['No real readings for this run yet.']`. Else `Average difference: <T.toFixed(1)> °C, RH <RH.toFixed(1)> %, CO₂ <Math.round(CO2)> ppm over <hours> hours.`; then `Stage agreement: <Math.round(stageShare)> % of hours` when `stageShare` is not `null`; then `A big gap means: calibrate again.` |
| `predictedRows(series)` | `→ [{ t, T, RH, CO2 }]` | `t = h × 3600` (seconds from the start) |
| `realRows(buckets, start)` | `→ [{ t, T, RH, CO2 }]` | `t = b.t − start` |

### 5.3 Markup (order in `el`, the `#roomTab` host)

| # | Element | Markup | Content |
|---|---|---|---|
| 1 | Explain | `p.explain` | C5 3.11's text exactly |
| 2 | Machines warning | `p.tag#cbStale` (hidden unless 5.4 row "Machines warning") | `staleText(applied)` |
| 3 | Fit card | `section.card` with `h3` `Fit the room values` | `div.seg#cbSource` (`role="group"`): `button[data-src="history"]` `This room's history` (pressed at mount), `button[data-src="csv"]` `Log file (CSV)`; `div.cal-row#cbHistory`: `label` `From` + `input#cbFrom` (`type="date"`), `label` `To` + `input#cbTo` (`type="date"`), `button.btn#cbLoad` `Load`; `div.cal-row#cbCsv` (hidden while the source is history): `label.btn[for="calFile"]` `Load a CSV log`, `input#calFile` (`type="file"`, `accept=".csv,text/csv"`, class `vh`), the wave 1 `details.measure` "CSV columns" text unchanged; `div.cal-row`: `label` `Blocks in the room during the log` + `input#calBlocks` (number, `min="1" max="200000" step="1"`), `button.btn#calFit` `Fit`, `button.btn#calApply` `Save and apply` (both disabled at start); `p.tag#calMsg` (`role="status"`) |
| 4 | Fit table | `table.fit-table#cbTable` | Head Room value, Now, Fitted; one row per `ClimateCalib.PARAMS` key: `PARAMS[k].label`, `params[k]`, `fit.params[k]` or `–` (`toFixed(2)` for `infAch`, else `toFixed(1)`, as wave 1); foot row `T / RH / CO₂`, `base` error, `fit` error (`<T.toFixed(2)> °C / <RH.toFixed(1)> % / <CO2.toFixed(0)> ppm`, `–` when none); then `p.tag#cbNote` = `PARAMS.ua.note` only when it is a string (no `p` otherwise) |
| 5 | Fit charts | `div.cal-charts#cbCharts` | `drawCalibCharts(#cbCharts, { rows, base, fit })` (today's labels and dashes); empty without a log |
| 6 | Predicted vs real | `section.card.pvr-card` with `h3` `Predicted vs real` | `label` `Cycle run` + `select#pvRun` (one `option` per cycle run that ran, newest first, text `Run <id> · <farmDate(created_at)> · <days> days`); `label` `Real start` + `input#pvStart` (`type="date"`); `button.btn#pvUse` `Use this start`; `div.cal-charts#pvCharts`; `div#pvDiff` (one `p` per `differenceLines` line); `p.tag#pvMsg` (`role="status"`) |

### 5.4 Behaviour

| Moment | Action |
|---|---|
| `mount(el, ctx)` | Markup; `room = ctx.room()`; `#cbFrom`, `#cbTo` = `defaultRange(now)`; `ctx.on('settings', d => { settings = d.settings; rebuild(); })`; `ctx.on('room', r => { room = r; })`; then in parallel (C5 3.6 step 1, 3.11 "Load at mount"): `getMix(id)`, `listCalibrations(id)`, `getEquipment(id)` (`null` = none), `getSettings(id)`, and `listSimulations(id, { limit: 200 })` (the Predicted vs real list). A failure: `errorText` in `#calMsg`, **Fit** stays disabled. Then `#calBlocks.value = defaultBlocks(mixRows, room.live) ?? ''`; paint the warning; `rebuild()`; fill the Predicted vs real card |
| Machines warning | Shown when `applied` (the run with `applied === true`) exists and `!sameMachines(applied.equipment, equipment)`: `#cbStale` = `staleText(applied)`; hidden otherwise. Repainted after a save and apply. A run saved before upgrade 3 has `equipment` `null`, so it warns once machines are saved |
| Source | A click on `#cbSource` sets `source`, the pressed button, shows `#cbHistory` or `#cbCsv`; `rows = null`, `range = null`, `fit = null`; `rebuild()` |
| **Load** (history) | `q = rangeQuery(#cbFrom.value, #cbTo.value, now)`; `{ error }` → `#calMsg` = `error`, no request. Else `mySeq = ++seq`; `readings = await getReadings(id, { from: q.from, to: q.to })` (raw; dropped when `mySeq !== seq` or not `alive`); fewer than 120 → `rows = null`, `#calMsg` = `Not enough readings in these days (at least 1 h).`; else `rows = logFromReadings(readings)`, `range = { from: readings[0].t, to: readings[readings.length − 1].t }`, `g = historyGaps(readings)`, `#calMsg` = `<q.days> days · <readings.length> readings`, plus (a space and) `The range has <g> gap(s) (the server was stopped); the fit keeps the machines unchanged through them.` when `g > 0`; `rebuild()` |
| Log file (CSV) | `ClimateCalib.parseCsv(text)`; a throw: `The file cannot be used: <message>`. Success: `rows`, `range = null`; `rebuild()`; `#calMsg` = `<file name>: <n> rows, <h.toFixed(1)> h.` (wave 1 text) |
| `rebuild()` | `blocks = parseBlocks(#calBlocks.value)`. Invalid: **Fit** disabled, `#calMsg` = `Enter the number of blocks in the room during the log.` Valid and the loads done: `envBase = envBaseFor(room, blocks, rows \|\| [], equipment, settings.airM3h)`; `params = startParams(runs, envBase)`; `fit = null`; `#calApply` disabled; with `rows`: `base = ClimateCalib.replay(rows, envBase, params)` (a throw: `#calMsg` = its message); render the table and `#cbCharts`. Called on a new log, a blocks `input`, a settings event, a source change, after **Save and apply** |
| **Fit** | Enabled when the loads are done, the blocks are valid, `rows` is set and not `busy`. `busy = true` (disables `#cbSource`, `#cbLoad`, `#calFile`, `#calBlocks`, `#calFit`, `#calApply`); `#calMsg` = `Fitting… (this takes a few seconds)`; `fit = await ClimateCalib.fitAsync(rows, envBase, params, p => #calMsg = 'Fitting: run <p.evals> of up to <p.maxEval>, error score <p.score.toFixed(2)>…')`; dropped after `unmount`; `#calMsg` = `Fit done after <fit.evals> simulation runs. The air leakage is the least certain value.`; `#calApply` enabled; render. A rejection: `The fit stopped: <message>`. Finally `busy = false` |
| **Save and apply** | C5 3.6 step 6: `busy = true`; `run = await saveCalibration(id, calibBody(fit, rows, source, range, equipment))`; `applied = await applyCalibration(id, run.id)`; `runs = await listCalibrations(id)` (or mark `applied` in `runs`); `params = paramsOfRun(applied)`; `base = replay(rows, envBase, params)`; `fit = null`; `#calMsg` = `Applied. Simulate now uses these values.`; the machines warning hides (repaint). An `ApiError`: `errorText`, the fit stays on screen (a second click saves a new run). Finally `busy = false` |
| Predicted vs real list | `cycles` = the runs of kind `cycle` with `days !== null` (a cycle that ran), newest first. None: `#pvRun` disabled with one option `No cycle runs yet`, `#pvUse` disabled, `#pvMsg` = `Run a full cycle on the Simulate tab first.` Else preselect `ctx.params.runId` when listed, else the first; `#pvStart` = `farmDate(run.real_start)` when set, else empty; when `real_start` is set, compare (row "Comparison") |
| `#pvRun` change | `#pvStart` as above; empty `#pvCharts`, `#pvDiff`; compare when `real_start` is set |
| **Use this start** | `start = farmMidnight(#pvStart.value)`; `null` → `#pvMsg` = `Pick the day this cycle really started.`; else `info = await updateSimulation(id, runId, { real_start: start })` (replace it in `cycles`); then compare. `ApiError`: `errorText` in `#pvMsg` |
| Comparison | `start = farmMidnight(#pvStart.value)`. `start > now`: no request at all (C5 3.11: a `from` after `to` would get 400), `#pvDiff` = `No real readings for this run yet.`, empty `#pvCharts`. Else `run = await getSimulation(id, runId)`; `buckets = await getReadings(id, { from: start, to: min(now, start + info.days × 86400 − 1), step: 3600 })`; `[]` → `No real readings for this run yet.`; else `drawCalibCharts(#pvCharts, { rows: realRows(buckets, start), base: { series: predictedRows(run.result.series) }, fit: null, labels: { rows: 'Real (sensors)', base: 'Predicted (run <runId>)' }, dashed: 'base' })` and `#pvDiff` = `differenceLines(differences(pairSeries(run.result.series, buckets, start)))`. Replies of an older comparison are dropped (`seq`) |
| `unmount` | Each step in its own `try`: `alive = false` (a running `fitAsync` is not cancelled; its result is dropped and never touches the DOM). The frame removes the `ctx.on` listeners |

### 5.5 `drawCalibCharts` options (`web/charts.js`, C5 6.2)

| Item | Rule |
|---|---|
| Signature | `drawCalibCharts(host, { rows, base, fit, labels, dashed })`; `labels` and `dashed` optional |
| `base` | Read as `base.series` (already so): a `replay` result or `{ series: [{ t, T, RH, CO2 }] }` |
| `labels` | `{ rows, base, fit }`, each optional; defaults `Measured`, `Simulation now`, `Simulation, fitted` (today's key) |
| Key markup | No `innerHTML` (labels are data): `div.cal-key` with one `span` per series shown (`rows`, `base`, and `fit` when `fit` is set), each built as `span.append(i, label)` with `i` = `document.createElement('i')` with today's class (`''`, `b`, `a`) |
| `dashed` absent (`undefined`) | Today's look: no inline style (the CSS dashes `.simb`) |
| `dashed` given | On every chart, the `simb` path gets `style.strokeDasharray = dashed === 'base' ? '4 3' : 'none'` and the `sima` path (when drawn) `style.strokeDasharray = dashed === 'fit' ? '4 3' : 'none'`; the key's `i.b` gets `style.borderTopStyle = dashed === 'base' ? 'dashed' : 'solid'`, `i.a` (when shown) `dashed === 'fit' ? 'dashed' : 'solid'`. Inline styles win over the stylesheet's `.cal-charts .simb { stroke-dasharray }` |
| Everything else | Unchanged (sizes, axes, classes `meas`, `simb`, `sima`, the empty `host` when `rows` or `base` is missing) |

### 5.6 Texts (exact)

| Where | Text |
|---|---|
| Explain | `Calibrate = make the virtual room behave like this real room. The room's recorded history is already on the farm server: pick a few days and press Fit. The app replays those days in its virtual room and adjusts four room values until it matches what really happened. Then Simulate gives answers for this room, not an average one.` |
| Range | `<days> days · <n> readings`, `Not enough readings in these days (at least 1 h).`, `The range has <g> gap(s) (the server was stopped); the fit keeps the machines unchanged through them.`, `Pick the first and the last day.`, `The first day is after the last day.`, `Pick at most 7 days.`, `The first day is in the future.` |
| Blocks | `Enter the number of blocks in the room during the log.` |
| Fit | `Fitting… (this takes a few seconds)`, `Fitting: run <n> of up to <m>, error score <s>…`, `Fit done after <n> simulation runs. The air leakage is the least certain value.`, `The fit stopped: <message>`, `The file cannot be used: <message>` |
| Save | `Applied. Simulate now uses these values.` |
| Warning | `The applied calibration (<YYYY-MM-DD>) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.` |
| Predicted vs real | `Real (sensors)`, `Predicted (run <id>)`, `No real readings for this run yet.`, `Average difference: <T> °C, RH <RH> %, CO₂ <CO2> ppm over <n> hours.`, `Stage agreement: <share> % of hours`, `A big gap means: calibrate again.`, `No cycle runs yet`, `Run a full cycle on the Simulate tab first.`, `Pick the day this cycle really started.` |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, then implement, see it pass, `npm test`, commit)

### 6.1 Test files

`tests/web-room-calibrate.test.js`:

```js
// web/room-calibrate.js helpers (docs/contracts/web.md 3.6, 3.11).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js');
require('../web/room-tabs.js');
require('../web/room-calibrate.js');
const H = globalThis.FarmRoomTabs.get('calibrate').helpers;
const SIM = globalThis.ClimateSim, CAL = globalThis.ClimateCalib;
const RD = (t, over) => ({ room_id: 1, t, T: 25, RH: 88, CO2: 900, t_out: 31, rh_out: 60, ac_mode: 'cool', ac_setpoint: 24, fog: 1,
  air: 0, lights: 1, circ: 0, power_w: null, kwh: null, ac_fan: 'auto', stage: 'fruiting', core: 27, ...over });
const EQ = { room_id: 1, saved_at: 5, ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 };
const EQ7 = { ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 };
```

`1791450000` is `2026-10-08 17:00:00` farm time; `farmMidnight('2026-10-08')` is `1791388800`.

Appended to `tests/web-charts.test.js` (a recording DOM stub, set before the first `drawCalibCharts` call; the file's other tests are pure):

```js
function stubEl(tag) {
  return { tag, attrs: {}, style: {}, children: [], className: '', textContent: '', clientWidth: 900,
    setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); }, replaceChildren(...c) { this.children = c; } };
}
const walk = (n, f, out = []) => { if (n && typeof n === 'object') { if (f(n)) out.push(n); (n.children || []).forEach(c => walk(c, f, out)); } return out; };
globalThis.document = { createElement: stubEl, createElementNS: (ns, tag) => stubEl(tag) };
const ROWS = [{ t: 0, T: 20, RH: 80, CO2: 900 }, { t: 3600, T: 21, RH: 82, CO2: 950 }];
const BASE = { series: [{ t: 0, T: 20.5, RH: 81, CO2: 910 }, { t: 3600, T: 21.5, RH: 83, CO2: 940 }] };
const FIT = { result: { series: BASE.series } };
const keyTexts = host => walk(host, n => n.className === 'cal-key')[0].children.map(s => s.children[1]);
const paths = (host, cls) => walk(host, n => n.tag === 'path' && n.attrs.class === cls);
```

### 6.2 Tasks

| # | Test(s) first | Then build | What it proves |
|---|---|---|---|
| 0 | – | Section 2 checks; read the files listed there. No commit | The start state |
| 1 | `tests/web-charts.test.js` (append) **CH1 base as series**: `host = stubEl('div')`; `FarmCharts.drawCalibCharts(host, { rows: ROWS, base: BASE, fit: null })` → three chart boxes and one `cal-key`; `paths(host, 'meas').length === 3`, `paths(host, 'simb').length === 3`, `paths(host, 'sima').length === 0`; `keyTexts(host)` deep-equals `['Measured', 'Simulation now']`; no path has `style.strokeDasharray`. **CH2 labels**: `{ …, fit: FIT, labels: { rows: 'Real (sensors)', base: 'Predicted (run 12)' } }` → `keyTexts` `['Real (sensors)', 'Predicted (run 12)', 'Simulation, fitted']`; `labels.fit: 'F'` → the third is `F`. **CH3 dashed**: `dashed: 'base'` with `fit: FIT` → every `simb` path `style.strokeDasharray === '4 3'`, every `sima` path `'none'`, key `i.b` `style.borderTopStyle === 'dashed'`, `i.a` `'solid'`; `dashed: 'fit'` → the opposite; `dashed: null` → both `'none'` and both icons `'solid'`. **CH4 defaults**: without `labels` and `dashed` the result equals today's (key texts of CH1, no inline styles, class names `meas`, `simb`, `sima`) | The `labels` and `dashed` options and the key without `innerHTML` (5.5) | C5 6.2 |
| 2 | `tests/web-room-calibrate.test.js` **CB1 registration**: `FarmRoomTabs.get('calibrate')` has `mount`, `unmount` functions and a `helpers` object with exactly the names of 5.2; loading did no DOM work; `unmount()` before any mount does not throw | Skeleton: wrapper, `FarmRoomTabs.register('calibrate', { mount, unmount, helpers })` | C5 1.4, 3.9 |
| 3 | **CB2 farm days**: `farmMidnight('2026-10-08') === 1791388800`; `farmDate(1791450000)` = `'2026-10-08'`; `farmDate(1791388800)` = `'2026-10-08'`; `farmDate(1791388799)` = `'2026-10-07'`; `farmMidnight` of `''`, `'x'`, `'2026-13-01'`, `'2026-02-30'` → `null`. **CB3 range**: `defaultRange(1791450000)` deep-equals `{ from: '2026-10-07', to: '2026-10-08' }`; `rangeQuery('2026-10-07', '2026-10-08', 1791450000)` deep-equals `{ from: 1791302400, to: 1791450000, days: 2 }`; `('2026-10-02', '2026-10-08', 1791475199)` → `days` 7 and `to − from === 604799`; `('2026-10-01', '2026-10-08', …)` → `{ error: 'Pick at most 7 days.' }`; `('2026-10-08', '2026-10-07', …)` → `{ error: 'The first day is after the last day.' }`; `('', '2026-10-08', …)` → `{ error: 'Pick the first and the last day.' }`; `('2026-10-09', '2026-10-09', 1791450000)` → `{ error: 'The first day is in the future.' }` | `farmMidnight`, `farmDate`, `defaultRange`, `rangeQuery` | C5 3.11 "History range", C3 6.8 |
| 4 | **CB4 logFromReadings**: `[RD(1791450030, { air: 1 }), RD(1791450000, { CO2: 20000, ac_mode: 'off', ac_setpoint: null, ac_fan: null, stage: null })]` → two rows in `t` order; the first deep-equals `{ t: 0, hour: 17, T: 25, RH: 88, CO2: null, tOut: 31, rhOut: 60, air: 0, fog: 1, lights: 1, circ: 0, acPower: 0, acMode: null, acSet: null, acFan: null, stage: null }`; the second has `t` 30, `hour` 17 + 30 / 3600, `CO2` 900, `air` 1, `acPower` 1, `acMode` `cool`, `acSet` 24, `acFan` `auto`, `stage` `fruiting`; `CAL.replay(rows, <an envBase>, CAL.paramsOf(SIM.DEFAULT_ENV))` does not throw. **CB5 historyGaps**: `t` = 0, 30, 700, 730, 2000 → 2; one reading → 0; `[]` → 0 | `logFromReadings`, `historyGaps` | C5 3.11 table "History log row" (C9 8: `air` from `r.air`) |
| 5 | **CB6 envBaseFor**: `envBaseFor({ volume: 80, live: { stage: 'pinning' } }, 1500, [{ stage: null }, { stage: 'rest' }], null, 900)` deep-equals `{ ...structuredClone(SIM.DEFAULT_ENV), airM3h: 900, room: { volume: 80 }, blocks: 1500, blockStage: 'rest' }` and has no `plant` key; rows without a `stage` → `blockStage` `pinning`; `live: null` → `fruiting`; with machines (C5 3.11 "Node tests with machines"): `const real = ClimateEquipment.plantOf; ClimateEquipment.plantOf = (eq, room) => ({ ac: { capW: 1 }, args: [eq, room] }); t.after(() => { ClimateEquipment.plantOf = real; });` then `envBaseFor(room, 1500, [], EQ, 900).plant.args` deep-equals `[EQ, { volume: 80, calib: {} }]` | `envBaseFor` | C5 3.6 step 3, lead decision 35 |
| 6 | **CB7 start values**: `paramsOfRun({ ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41 })` deep-equals `{ ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41 }`; `startParams([{ …applied: false }, { ua: 100, inf_ach: 0.5, moist_buffer: 2, co2_per_block: 50, applied: true }], e)` → that run's values; no applied run → deep-equals `CAL.paramsOf(e)`. **CB8 blocks**: `defaultBlocks([{ blocks: 1200 }, { blocks: 300 }], null)` 1500; `defaultBlocks([], { blocks: 2000 })` 2000; `defaultBlocks([{ blocks: 0 }], { blocks: null })` `null`; `defaultBlocks([], null)` `null`; `parseBlocks`: `'1500'` 1500, `' 7 '` 7, `'200000'` 200000; `''`, `'0'`, `'12.5'`, `'200001'`, `'x'` → `null` | `paramsOfRun`, `startParams`, `defaultBlocks`, `parseBlocks` | C5 3.6 steps 2, 4 |
| 7 | **CB9 calibBody**: `fit = { params: { ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41.7 }, result: { rmse: { T: 0.21, RH: NaN, CO2: 38 } } }`, 720 rows: `calibBody(fit, rows, 'history', { from: 100, to: 200 }, EQ)` deep-equals `{ ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41.7, rmse_t: 0.21, rmse_rh: null, rmse_co2: 38, log_rows: 720, source: 'history', log_from: 100, log_to: 200, equipment: EQ7 }`; `'csv'` with `range` `null` and `equipment` `null` → no `log_from`, no `log_to` keys, `source: 'csv'`, `equipment: null`. **CB10 sameMachines**: `(null, null)` `true`; `(null, EQ)` `false`; `(EQ7, EQ)` `true` (extra keys ignored); `(EQ7, { ...EQ, air_m3h: 1800 })` `false`. `staleText({ run_at: 1791450000 })` = `The applied calibration (2026-10-08) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.` | `calibBody`, `sameMachines`, `staleText` | C5 3.6 step 6, 3.11 "Machines warning", C3 6.13, lead decision 50 |
| 8 | **CB11 pairs**: `start = 1791388800`; `series = [0, 1, 2].map(h => ({ h, stage: 'fruiting', flush: 1, T: 25, RH: 88, CO2: 900, core: 27, kwh: 1 }))`; `buckets = [RD(start, { T: 25.5, RH: 86, CO2: 930 }), RD(start + 7200, { T: 24.5, RH: 90, CO2: 870, stage: 'rest' })]` → `pairSeries` gives two pairs, `h` 0 and 2; `differences(pairs)` deep-equals `{ T: 0.5, RH: 2, CO2: 30, hours: 2, stageShare: 50 }`; a bucket with `stage: null` is left out of the share; `differences([])` → `hours` 0, `stageShare` `null`. **CB12 lines**: `differenceLines({ T: 0.5, RH: 2, CO2: 30, hours: 2, stageShare: 50 })` deep-equals `['Average difference: 0.5 °C, RH 2.0 %, CO₂ 30 ppm over 2 hours.', 'Stage agreement: 50 % of hours', 'A big gap means: calibrate again.']`; `stageShare: null` → no stage line; `hours: 0` → `['No real readings for this run yet.']`. `predictedRows(series)[2]` deep-equals `{ t: 7200, T: 25, RH: 88, CO2: 900 }`; `realRows(buckets, start)[1].t === 7200` | `pairSeries`, `differences`, `differenceLines`, `predictedRows`, `realRows` | C5 3.11 "Comparison", "Differences", lead decision 24 |
| 9 | No Node test (DOM) | Markup 5.3; load at mount, the warning, source, **Load**, CSV, `rebuild`, **Fit**, **Save and apply** (5.4) | Task 11 |
| 10 | No Node test (DOM) | Predicted vs real (list, **Use this start**, comparison, the future-start rule), `unmount`; then `npm test`, commit, tell the lead you wait for gate 2.5 | Task 11 |
| 11 | Headless Chrome (7.2), after gate 2.5 | Fix what it finds; a Node test first for any helper bug | C5 7.10 row "Calibrate tab" |
| 12 | – | Section 7.1; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| Test names | Start each test with its id. One `test(…)` per id: CH1–CH4, CB1–CB12 |
| Do not assert | The text of `PARAMS.ua.label` or `.note`; any fit number (C5 3.11: `replay` ignores `stage` until the Bench merge) |

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check web/room-calibrate.js && node --check web/charts.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/web-room-calibrate.test.js tests/web-charts.test.js` | `# fail 0`; CB1–CB12 and CH1–CH4 listed with the old chart tests |
| `npm test` | `# fail 0`; `# pass` = `N0` + 16; `# skipped` = `K0` |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `tests/web-charts.test.js`, `tests/web-room-calibrate.test.js`, `web/charts.js`, `web/room-calibrate.js` |
| `git diff $(git merge-base HEAD master) -- web/charts.js` | Changes only inside `drawCalibCharts` |
| `git diff $(git merge-base HEAD master) -- tests/web-charts.test.js \| grep '^-' \| grep -v '^---'` | No output (append only) |
| `git diff --exit-code $(git merge-base HEAD master) -- calib.js web/calibration.js` | No output, exit 0 |
| `grep -n "FarmApi.stream\|setInterval\|innerHTML" web/charts.js web/room-calibrate.js` | Only the one template assignment of `mount` in `web/room-calibrate.js`; none in `drawCalibCharts` |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git status --short` | Empty |

### 7.2 Headless Chrome, after gate 2.5 (C5 3.9 "Headless checks of one tab", 7.10 row "Calibrate tab")

Run only when the lead says gate 2.5 passed. Drive Chrome with the chrome-devtools MCP tools or with `cdp.js` of `web-split.md` Appendix A, copied into a scratch folder `S=$(mktemp -d)`. The tree's `index.html` already loads every script: inject none. Empty `#view` and mount the tab by hand. No layout assertion.

| Step | Shell or page |
|---|---|
| Check tree | `T=$(mktemp -d); git -C <worktree> archive master \| tar -x -C $T; MB=$(git -C <worktree> merge-base HEAD master); git -C <worktree> archive HEAD -- $(git -C <worktree> diff --name-only $MB HEAD) \| tar -x -C $T` |
| History (before `npm start`; C5 7.10: a script outside the repo) | `node $S/seed.js $T` with the script below: it creates `Room 1` in `$T/check.db` and writes 2 h of readings ending about 60 s ago (one per 30 s), so the server finds a room and makes no demo room |
| Server (background) | `PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"); cd $T && FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$T/check.db npm start`; open `http://127.0.0.1:<PORT>/` |
| Seed | In the page: `await FarmApi.saveMix(1, [{ crop: 'oyster', blocks: 2000, co2_per_block: null }]); const EQA = { ac_hp: 1.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 }; await FarmApi.saveEquipment(1, EQA);` |
| Mount (helper) | `window.mountCal = async (params = {}) => { const t = FarmRoomTabs.get('calibrate'); try { t.unmount(); } catch {} const R = (await FarmApi.listRooms()).find(r => r.id === 1); const v = document.getElementById('view'); v.replaceChildren(); await t.mount(v, { id: 1, params, room: () => R, on: () => () => {} }); };` then `await mountCal()`; `window.confirm = () => true` |

`$S/seed.js`:

```js
// node seed.js <tree>: Room 1 and 2 h of readings in <tree>/check.db, before npm start (C5 7.10).
const T = process.argv[2];
for (const f of ['sim', 'air', 'controller', 'runtime']) require(`${T}/${f}.js`);
const { openDb } = require(`${T}/server/db.js`);
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController;
const db = openDb(`${T}/check.db`);
const room = db.createRoom({ name: 'Room 1', volume: 60, settings: CC.defaultSettings() });
const cfg = CC.defaultSettings(); cfg.program.harvest.on = false;
const sim = SIM.create(structuredClone(SIM.DEFAULT_ENV)), ctl = CC.create(cfg, null, null);
const t0 = Math.floor(Date.now() / 1000) - 7200 - 60;
let r = sim.read(), cmd = ctl.update(r), seq = r.seq, n = 0;
for (let s = 0; s < 8 * 3600; s++) {
  sim.step(1, cmd); r = sim.read(); if (r.seq === seq) continue; seq = r.seq; cmd = ctl.update(r);
  if (r.t < 6 * 3600) continue;
  const on = cmd.ac.power;
  db.insertReading(room.id, { t: t0 + (r.t - 6 * 3600), T: r.T, RH: r.RH, CO2: r.CO2, t_out: r.tOut, rh_out: r.rhOut,
    ac_mode: on ? cmd.ac.mode : 'off', ac_setpoint: on ? cmd.ac.setpoint : null, fog: cmd.hu.level, air: cmd.air.on ? 1 : 0,
    lights: cmd.lights.on ? 1 : 0, circ: cmd.circ.on ? 1 : 0, power_w: null, kwh: null,
    ac_fan: on ? (['low', 'auto', 'high'].includes(cmd.ac.fan) ? cmd.ac.fan : 'auto') : null, stage: cfg.stage, core: r.core ?? null });
  n++;
}
db.close(); console.log(`${n} readings`);
```

| # | Step | Expected |
|---|---|---|
| K0 | `node $S/seed.js $T` | Prints `240 readings` or `241 readings` (one per 30 s over 2 h); the server then starts with `Room 1` (id 1) and keeps recording |
| K1 | After `mountCal()` | `p.explain` has the C5 3.11 text; `This room's history` pressed; `#cbFrom` = yesterday and `#cbTo` = today (farm days, `FarmRoomTabs.get('calibrate').helpers.defaultRange(Math.floor(Date.now() / 1000))`); `#calBlocks` = `2000`; `#cbStale` hidden (no applied calibration) |
| K2 | Click `#cbLoad` | `#calMsg` starts `2 days · ` and names at least 240 readings (the default range covers the readings seeded 2 h back); **Fit** enabled; three `svg.chart` in `#cbCharts` (the "before" curves) |
| K3 | Click `#calFit`; wait for `Fit done` (up to 120 s) | The Fitted column of `#cbTable` is filled; `#calApply` enabled |
| K4 | Click `#calApply` | `#calMsg` = `Applied. Simulate now uses these values.`; `(await FarmApi.listCalibrations(1))[0]` has `applied: true`, `source: 'history'`, `log_rows` = the number loaded, `log_from` and `log_to` integers with `log_from < log_to <= now`, `equipment` deep-equal to `EQA` |
| K5 | Click `Log file (CSV)`; build the file in the page: `const now = Math.floor(Date.now() / 1000); const csv = ClimateCalib.toCsv(FarmRoomTabs.get('calibrate').helpers.logFromReadings(await FarmApi.getReadings(1, { from: now - 7200, to: now })));` and load it into `#calFile` with a `DataTransfer` (`new File([csv], 'log.csv', { type: 'text/csv' })`, dispatch `change`) | `#calMsg` = `log.csv: <n> rows, <h> h.` |
| K6 | **Fit**, wait for `Fit done`, **Save and apply** | The newest calibration has `source: 'csv'`, `log_from: null`, `log_to: null` |
| K7 | `await FarmApi.saveEquipment(1, { ...EQA, ac_hp: 2 }); await mountCal()` | `#cbStale` visible with `staleText` of the applied run: `The applied calibration (<today>) was fitted with other machines than this room has now. Fit again so Simulate uses room values that match the machines.` |
| K8 | A short saved cycle: `const S0 = await FarmApi.getSettings(1); const S = { ...S0, farmType: 'ready', program: { ...S0.program, flushes: 1, days: { ...S0.program.days, fruiting: 1, rest: 1 } } }; const result = ClimateCycle.runCycle({ name: 'Room 1', volume: 60, airM3h: S.airM3h, calib: null }, [{ crop: 'oyster', blocks: 2000 }], { settings: S }); const info = await FarmApi.createSimulation(1, { kind: 'cycle', inputs: { mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }], settings: S, region: 'my-lowland', tariff: 0.57, volume: 60, calibration: null, empty_below: null, equipment: null }, result }); await mountCal({ runId: info.id });` | `#pvRun.value === String(info.id)`; `#pvStart` empty; `#pvCharts` empty |
| K9 | Set `#pvStart` to today (farm day); click `#pvUse` | `(await FarmApi.getSimulation(1, info.id)).real_start === farmMidnight(today)`; three `svg.chart` in `#pvCharts`; its key texts `Real (sensors)` and `Predicted (run <info.id>)`; `#pvDiff` first line starts `Average difference: ` and ends `hours.` |
| K10 | Note the number of `/readings` requests so far (`performance.getEntriesByType('resource').filter(e => e.name.includes('/readings')).length`); set `#pvStart` to tomorrow; click `#pvUse` | `#pvDiff` = `No real readings for this run yet.`; the `/readings` count is unchanged |
| K11 | Click `#calFit` with a log loaded, then at once `FarmRoomTabs.get('calibrate').unmount()`; wait for 60 s | No console error; nothing written into `#view` by the late fit |
| K12 | The console for the whole session | No errors; no 404 except `/favicon.ico` |
| End | Stop the server; `rm -rf $T $S` | – |

## 8. Done when

| # | Item |
|---|---|
| 1 | Every start check of section 2 held (or the lead answered) |
| 2 | `web/room-calibrate.js` replaces the stub, registers tab `calibrate` with `mount`, `unmount`, `helpers`, defines no global, does no DOM work at load |
| 3 | Every helper of 5.2 behaves as its row says and is tested (CB1–CB12), `envBaseFor` with machines through a `plantOf` recorder |
| 4 | `drawCalibCharts` takes `labels` and `dashed` (CH1–CH4); nothing else in `web/charts.js` changed |
| 5 | The tab follows C5 3.6 and 3.11 (default range yesterday–today, raw readings ≤ 7 days, `envBase` with `airM3h`, `blockStage`, `plant`, the body with `source`, `log_from`, `log_to`, `equipment`, the stale warning, Predicted vs real with no request for a future start) |
| 6 | `npm test` `# fail 0` at `N0` + 16, `# skipped` `K0`; only the four owned files differ from the merge base |
| 7 | Every headless row K0–K12 passed after gate 2.5, with no console error |
| 8 | Committed on `stream/room-calibrate` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 3, `calib.js` and `web/calibration.js` included, or add CSS | File owners |
| Change `web/charts.js` beyond `drawCalibCharts`'s options | Wave 2 plan 3.1 |
| Use `FarmBench` or the Test bench's environment | C5 3.6: the tab builds its own `envBase` |
| Load more than 7 days of raw readings, or request readings for a start in the future | C3 6.8; C5 3.11 |
| Assert the `PARAMS.ua` label or note, or a fit result that needs `replay` to follow `stage` | C5 3.11: both are the Bench stream's, merged in wave 3 |
| Give `envBase.plant` a `room` or `loads` key (pass `calib: {}` to `plantOf`), or pass the machines without saved Equipment | C8 4.5, lead decision 35 |
| Round the fitted values before saving | C3 8 maps them unchanged |
| Open `FarmApi.stream`, poll, or add a timer | C5 3.9 |
| Put dynamic text into `innerHTML` (the chart key labels included) | C5 1.4 |
| Push, merge, rebase, merge `master` into your branch, or change git config | The lead merges after review |

## 10. Report to the lead

| Item | Content |
|---|---|
| Result | Done or blocked; `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | `N0`, `K0`, the final `npm test` counts |
| Headless | One line per row K0–K12: pass or fail, with what you saw; the fit times of K3 and K6 |
| Points to confirm | (1) the helpers beyond C5 3.11's list (`farmDate`, `defaultRange`, `rangeQuery`, `staleText`, `differenceLines`, `predictedRows`, `realRows`) and `defaultBlocks(rows, live)`'s second argument; (2) the range error texts and the Predicted vs real empty-list texts (5.6); (3) the number formats of `differenceLines`; (4) the inline styles that carry `dashed` over the stylesheet; (5) `listSimulations(id, { limit: 200 })` for the run list |
| Anything else | Every contract gap or mismatch you met, and what you did instead of guessing |

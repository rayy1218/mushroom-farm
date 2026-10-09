# Work brief: Simulate tab (`web/room-simulate.js`)

Revision 1, 2026-10-09 (wave 2, written in prep 2.0 from the frozen contracts on `master` e60dabf). Stream: **Simulate tab**. Implementer on Sonnet; the reviews (spec compliance, then code quality) run on Opus before the lead merges.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–69 (here: 6, 16, 17, 18, 25, 26, 34, 35, 39) | `docs/contracts/LEAD-DECISIONS.md` | They override this brief and every contract text |
| C5 revision 8 | `docs/contracts/web.md` | 1.4, 3.1, 3.7 (`sameMix`), 3.9, 3.10 (all rows), 3.12 (the card's `mount` interface and `renderReport`), 4.3 (with the mapping table), 6.3, 7.10 rows "how wave 2 checks run" and "Simulate tab" |
| C3 revision 9 | `docs/contracts/api.md` | 3.6, 3.7, 3.9–3.11 (SimulationRunInfo, SimulationRun, `inputs`, Equipment), 6.15, 6.16, 6.20–6.25, 7.6 (`checkSimulationRun`: what the server accepts), 8 (mapping) |
| C7 revision 3 (crop cycle) | `docs/contracts/cycle.md` | 2 (`runCycleSteps`, `cycleDays`), 2.1 (`room` with `airM3h` and `plant`), 3, 11 (Progress), 12 (Result) |
| C8 revision 3 (equipment) | `docs/contracts/equipment.md` | 4.1 (`CONSTRUCTIONS` labels), 4.2, 4.5 (`plantOf(eq, { volume, calib })`), 8.1 (`{int}`), 11 (the Report you store and reopen) |
| C9 revision 2 | `docs/contracts/air.md` | Section 8 (`room.airM3h`, `airOf(room)`); read-only |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 3 (Simulate tab row), 3.1, 4, 5, 9 (the slot without the card) |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/room-simulate.md` | Committed on `master` by the lead in prep 2.0; you do not edit it |

## 1. Goal

| Outcome | Measure |
|---|---|
| The Simulate tab | Replaces the prep 2.0 stub `web/room-simulate.js`; registers tab `simulate`; a draft crop mix seeded from the room's mix, **Save as this room's crop mix**, **Check capacity** and **Run a full cycle** in the browser with the room's settings, applied calibration and machines, every result saved as a simulation run, the Saved runs list (Open, Compare with real, Note, Delete, Older) |
| The machines check slot | `div.contents[data-slot="equipment-check"]` after the Result card and before Saved runs; `FarmEquipmentCard.mount(slot, …)` when the card is loaded, else `The machines check is not installed.` |
| The run inputs | Every stored run has `inputs` exactly C3 3.10.1: `inputs.settings.airM3h` is the room's settings `airM3h`, `inputs.calibration` exactly `{ id, ua, inf_ach, moist_buffer, co2_per_block }` or `null`, `inputs.equipment` the room's 7 Equipment fields or `null`; the run's `room` has `airM3h` and, with saved machines, `plant = ClimateEquipment.plantOf(equipment, { volume, calib })` |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/room-simulate` (below `<worktree>`), on branch `stream/room-simulate`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm`. |
| Git | Keep the configured identity (never change `git config`). Plain commit messages such as `feat(room-simulate): …`, `test(room-simulate): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase; never merge `master` into your branch. |
| Gate 2.5 | Before gate 2.5 `equipment.js` is the prep 2.0 stub (`plantOf` throws `Error('stub')`) and the server lacks the simulation routes: you test in Node against the helpers, with `plantOf` recorded (C5 3.10 "Node tests with machines"). Your headless check runs only after the lead's gate 2.5. Do tasks 0–10, commit, tell the lead you wait for gate 2.5, then run task 11. |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/room-simulate` |
| `ls tests/fakes/api-server.js web/rooms.js room-rules.js` (C5 1.6) | All three listed |
| `ls web/room-tabs.js web/room-live.js web/room-simulate.js web/room-calibrate.js equipment.js web/batches.js web/harvest.js web/harvest.css` (C5 1.7) | All eight listed |
| `grep -c 'web/room-tabs.js' index.html` (C5 1.7) | `1` |
| `cat web/room-simulate.js` | The prep 2.0 stub (the C5 1.4 wrapper, registering nothing) |
| `grep -c "Error('stub')" equipment.js` and `grep -c CONSTRUCTIONS equipment.js` | Each at least `1` (the stub, with the frozen catalogue) |
| `grep -n -e listSimulations -e createSimulation -e getSimulation -e updateSimulation -e deleteSimulation -e getEquipment web/api.js` | All six present (lead, prep 2.0) |
| `node -e "for (const f of ['sim','air','controller','runtime','capacity','cycle']) require('./'+f+'.js'); console.log(typeof ClimateCycle.runCycleSteps, typeof ClimateCapacity.checkSteps, ClimateCycle.cycleDays('full', ClimateController.defaultProgram()))"` | `function function 83` |
| `npm test` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `K0` |

Read before you code: `web/room-tabs.js`, `web/api.js`, `web/ui.js`, `web/charts.js` (`createTrendCharts`), `web/capacity.js` at the merge base (wave 1: `VERDICT_CHIP`, `LIMIT_WORD`, `FAIL_MACHINE`, `verdictText`, `renderReport`, the progress text; you copy them, section 5.4), `cycle.js` (`runCycleSteps`, `cycleDays`), `capacity.js` (`checkSteps`, `DESIGN_DAYS`, `VERDICT`, `commonTargets`), the `equipment.js` stub (`CONSTRUCTIONS`).

## 3. Owned files (the only files you may touch; wave 2 plan 3, Simulate tab row)

| File | Action | Content |
|---|---|---|
| `web/room-simulate.js` | Replace the prep 2.0 stub | The tab (section 5) |
| `tests/web-room-simulate.test.js` | Create | Section 6 |

| Not yours | Owner |
|---|---|
| `web/room-equipment.js` (`FarmEquipmentCard`: you only call `mount` and `renderReport`) | Equipment |
| `equipment.js`, `cycle.js`, `capacity.js`, `sim.js`, `controller.js` | Equipment |
| `web/capacity.js` (you copy from it; it stays unchanged and is deleted by the lead in wave 3) | Nobody in wave 2 |
| `web/rooms.js`, `web/shell.js`, `styles.css` | Room shell |
| `web/room-tabs.js`, `web/api.js`, `index.html`, `tests/fakes/*` | Lead (prep 2.0) |
| `room-rules.js`, `server/*` | Server 2 |
| Everything else | Read-only |

| Rule | Detail |
|---|---|
| CSS | You add no CSS. Use the C5 3.8 classes (`.explain`, `.mix-table`, `.run-progress`, `.result-card`, `.run-list`, `.room-msg`) and today's (`card`, `chip`, `tag`, `btn`, `est-note`, `contents`, `cap-report`, `cap-util`, `note`, `warn`) |
| Blocked | If something outside your files blocks you, stop that part and report it to the lead |

## 4. What you build against

| Source | What you take from it |
|---|---|
| C5 3.10 | Every row: Explain text, Load at mount, the stream `settings` event, Crop mix card, Room values line, Options, Buttons, Long cycle, Run inputs, Running, Finished, Result card (capacity, cycle), Equipment slot, Saved runs card and its chip table, `machinesText`, `helpers`, Node tests with machines |
| C5 3.7 | `sameMix(a, b)` |
| C5 3.9 | The tab object and `ctx`; a tab switch stops a running check and saves nothing (lead decision 26) |
| C5 3.12 | `FarmEquipmentCard.mount(el, { id, equipment, runInputs, onEquipment, onSaved }) → { unmount() }`; `runInputs()` returns `{ room, mix, settings, region, tariff, inputs }` in the cycle form (`inputs.empty_below: null`), `room` without `plant`; `FarmEquipmentCard.renderReport(el, report)` |
| C5 4.3 mapping table | MixRow ↔ capacity mix; the applied Calibration → `room.calib`; Equipment → `room.plant`; settings `airM3h` → `room.airM3h` |
| C3 3.10.1, 7.6 | The exact `inputs` and what `checkSimulationRun` accepts |
| C7 2, 11, 12 | `runCycleSteps(room, mix, { settings, region, tariff })` (a generator: one Progress `{ day, days, stage, flush }` per day, then the Result); `cycleDays(farmType, program)`; Result `{ verdict, targets, inputs, stages, totals, series }` or `{ verdict: 'impossible', why }` |
| C8 4.5, 8.1 | `plantOf(eq, { volume, calib })`; `{int}` (comma between groups of three digits) |

| Lead decision | As it applies to this stream |
|---|---|
| 6 | Settings go to C7 as `opts.settings`; C7 runs them through `importSettings` |
| 17, 26 | Simulations run in the browser; the tab steps the generators itself, so leaving the tab stops the run and nothing is saved; a program longer than 180 days asks first |
| 18, 39 | Every run is a `simulation_runs` row (kinds `cycle`, `capacity`, `equipment`); lists never carry `result`; Delete is the only delete; no stream event for runs |
| 25 | The tab edits a draft mix; only **Save as this room's crop mix** writes it; runs use the room's current settings, applied calibration and saved machines; region and tariff are per run |
| 34, 35 | Capacity and cycle runs pass `room.plant` (with machines) and `room.airM3h` = the room's settings `airM3h` |

## 5. Design (fixed by this brief where the contracts leave it open)

### 5.1 Tab shape

| Item | Rule |
|---|---|
| Registration | At load, exactly one call: `global.FarmRoomTabs.register('simulate', { mount, unmount, helpers })`. No global |
| At load | No DOM, no `FarmApi` call. `ClimateController`, `ClimateCapacity`, `ClimateCycle`, `ClimateEquipment`, `ClimateRoomRules`, `FarmUi`, `FarmApi`, `FarmCharts`, `FarmEquipmentCard` are read inside functions (`FarmEquipmentCard` may be absent) |
| State (closure, reset at each `mount`) | `ctx`, `id`, `room`, `saved` (MixRow[] of the last `getMix` / `saveMix`), `draft` (MixRow[]), `calibrations`, `settings`, `version` (`{ id, saved_at }`), `equipment`, `runs` (SimulationRunInfo[]), `running` (`false`), `gen` (a run token), `alive`, `card` (the card's `{ unmount }`), `charts` |
| Draft | Kept in MixRow form (`{ crop, blocks, co2_per_block }`); runs use `toCapacityMix(draft)`; `#smSaveMix` is enabled when `!sameMix(toCapacityMix(draft), toCapacityMix(saved))` and not `running` |

### 5.2 Pure helpers (`helpers`)

No helper changes its arguments or touches the DOM or network. `CC` = `ClimateController`, `EQ` = `ClimateEquipment`. `int(x)` = `String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')` (C8 8.1). `FIELDS7` = `['ac_hp', 'ac_units', 'fog_lph', 'air_m3h', 'walls', 'roof', 'height']`.

| Helper | Signature → result | Rule |
|---|---|---|
| `toCapacityMix(rows)` | `(MixRow[]) → mix` | Each row → `{ crop, blocks }`, plus `co2PerBlock: row.co2_per_block` when it is not `null` (C3 8) |
| `toMixRows(mix)` | `(mix) → MixRow[]` | Each item → `{ crop, blocks, co2_per_block: item.co2PerBlock ?? null }` |
| `sameMix(a, b)` | `→ bool` | C5 3.7: same length; at each index the same `crop`, `blocks`, `co2PerBlock` (both absent = equal). A non-array argument → `false` |
| `appliedCalib(runs)` | `(Calibration[]) → calib \| null` | The run with `applied === true`, mapped as C3 8: `{ ua, infAch: inf_ach, moistBuffer: moist_buffer, co2PerBlock: co2_per_block, rmse: { T: rmse_t, RH: rmse_rh, CO2: rmse_co2 }, date: new Date(run_at * 1000).toISOString() }`; none → `null` |
| `runInputs(kind, data)` | `('cycle' \| 'capacity', { room, settings, draft, calibrations, equipment, region, tariff, emptyBelow }) → { room, mix, settings, region, tariff, emptyBelow, inputs }` | C5 3.10 row "Run inputs". `applied` = the Calibration with `applied === true` or `null`. `room` = `{ name: data.room.name, volume: data.room.volume, airM3h: data.settings.airM3h, calib: appliedCalib(data.calibrations) }`, plus `plant: EQ.plantOf(data.equipment, { volume: data.room.volume, calib: <that calib> })` only when `data.equipment` is set (no `plant` key without it). `mix` = `toCapacityMix(data.draft)`. `inputs` = `{ mix: toMixRows(mix), settings: data.settings, region, tariff, volume: data.room.volume, calibration: applied ? { id, ua, inf_ach, moist_buffer, co2_per_block } of it : null, empty_below: kind === 'capacity' ? data.emptyBelow : null, equipment: data.equipment ? <the 7 FIELDS7 fields> : null }` (no other key; no `room_id` or `saved_at` in `equipment`) |
| `cycleSummary(result)` | `→ { chip, line }` | `impossible`: `{ chip: { lvl: 'warning', icon: '✕', text: 'impossible' }, line: result.why }`. Else `n` = segments with `pass === false`: `n === 0` → chip `{ lvl: 'good', icon: '✓', text: 'all stages pass' }`, else `{ lvl: 'warning', icon: '✕', text: '<n> stage(s) fail' }`; `line` = `<totals.days> days · <inputs.flushes> flushes · <Math.round(totals.kwh)> kWh · RM <totals.rm.toFixed(2)> · RM <totals.rmPerBlock.toFixed(2)> per block` |
| `stageRows(result)` | `→ string[][]` | One row per segment, columns Stage (`CC.STAGES[stage]`), Flush, Days, Temp in band % (`inT.toFixed(1)`), RH ok % (`rhOk.toFixed(1)`, `not judged` for `spawn`), CO₂ ok % (`co2Below.toFixed(1)`, `not judged` for `spawn`), Max core °C (`maxCore.toFixed(1)`), Alarms (`<id> ×<count>` joined `, `, `–` when none), kWh (`Math.round`), RM (`toFixed(2)`), Result (`Pass`, or the `fails` joined `, `) |
| `seriesPoints(result)` | `→ ChartPoint[]` | Each series hour → `{ t: h × 3600, T, RH, C: CO2, core, spT, spRH, co2Lim }`, the three targets from the segment with the hour's `stage` and `flush` (`NaN` when none matches) |
| `runRowTexts(info)` | `(SimulationRunInfo) → { run, mix, chip, energy, note }` | From the SimulationRunInfo only (C3 3.9: no `result`). `run` = `Cycle` / `Capacity` / `Equipment` + ` · ` + `FarmUi.farmClock().stamp(created_at)`; `mix` = the `inputs.mix` rows with `blocks > 0` as `<blocks> <CROPS[crop].name>` joined ` + ` (`–` when none); `chip` by the table "Saved runs chips" of C5 3.10 (5.5 below); `energy`: cycle with `rm !== null` and `blocks > 0` → `RM <(rm / blocks).toFixed(2)> per block`, capacity with `utilisation !== null` → `<utilisation> %`, every other case (equipment included) → `–`; `note` = `note ?? ''` |
| `progressText(p)` | `→ string` | A C7 Progress (has `day`): `Day <day> of <days> · <CC.STAGES[stage]>`, plus ` · flush <flush>` when `stage` is `fruiting` or `rest`. A capacity Progress (`{ runs, blocks, pass }`): `` `Simulation run ${runs}: ${FarmUi.nf(blocks)} blocks, ${pass ? 'pass' : 'fail'}…` `` (the wave 1 text) |
| `machinesText(eq)` | `(Equipment \| null) → string` | C5 3.10: `null` → `Typical machines`; else `<ac> aircond · <fog_lph> L/h fogger · <int(air_m3h)> m³/h air exchange · <walls>` with `ac` = `<ac_hp> hp`, or `<ac_units> × <ac_hp> hp` when `ac_units > 1`; `walls` = `Typical walls` when both `walls` and `roof` are `null`; `<label> walls and roof` when both are the same key; else `<walls label> walls, <roof label> roof` (`EQ.CONSTRUCTIONS[k].label`) |
| `clampBlocks(text)` | `→ int` | `Math.round(+text)` held in 0–200000; empty or not finite → `0` |
| `clampCo2(text)` | `→ int \| null` | Empty or not finite → `null`; else `Math.round(+text)` held in 1–1000 |
| `regionText(key)` | `→ string` | `my-lowland` → `Lowland Peninsular Malaysia`; any other key → the key |

### 5.3 Markup (order in `el`, the `#roomTab` host)

| # | Element | Markup | Content |
|---|---|---|---|
| 1 | Explain | `p.explain` | C5 3.10's text exactly |
| 2 | Crop mix card | `section.card` with `h3` `Crop mix` | `table.mix-table#smMix` (head: Crop, Blocks, CO₂ per block (mL/h), –; one row per draft row: `select` of `Object.keys(CROPS).filter(ClimateRoomRules.hasCrop)` with the names, number input Blocks (`min="0" max="200000" step="1"`), number input CO₂ per block (`min="1" max="1000"`, empty = `null`), `button.btn` `Remove`); `button.btn#smAddCrop` `Add a crop`; `button.btn#smSaveMix` `Save as this room's crop mix` |
| 3 | Room values line | `p.tag#smValues` | `span.chip#smCalib` (`calibrated <YYYY-MM-DD>` with `lvl` `good`, or `not calibrated — typical values` with `lvl` `info`); `span.tag#smSettings` `Settings: version <id> saved <clock.stamp(saved_at)>`; `span.tag#smMachines` `Machines: <machinesText(equipment)>` |
| 4 | Options and buttons | `div.section-head` | `label` `Region` + `select#smRegion` (own keys of `ClimateCapacity.DESIGN_DAYS`, `regionText`); `label` `Tariff (RM per kWh)` + `input#smTariff` (number, `min="0" max="10" step="0.01"`, value `0.57`); `label` `Too empty below (%)` + `input#smEmpty` (number, `min="0" max="100"`, value `ClimateCapacity.VERDICT.emptyBelow`; capacity only); `button.btn#smCap` `Check capacity (≈ 2 s)`; `button.btn#smCycle` `Run a full cycle (<D> days)`; `a.btn#smBench[href="#/simulator/<id>"]` `Open test bench` |
| 5 | Progress and message | `div.run-progress#smProgress` (hidden when idle) with two `span`s (the fill, its `style.width` a percentage; the text); `p.tag.room-msg#smMsg` (`role="status"`) | `progressText`; messages |
| 6 | Result card | `section.card.result-card#smResult` (hidden until there is a result) | Capacity: the wave 1 report (5.4). Cycle: `p` with `span.chip` + the `cycleSummary` line; `table.run-list` with the head of `stageRows` and its rows; `p.est-note` `Spawn run judges temperature and block core only (the bags are sealed).` Equipment (opened from the list): `FarmEquipmentCard.renderReport(#smResult, result)` |
| 7 | Prediction charts | `div.contents#smCharts` | Cycle only: `FarmCharts.createTrendCharts(#smCharts, { keys: ['T', 'RH', 'C'], clock: FarmUi.simClock(0) })` drawn with `{ t0: 0, t1: totals.days × 86400, pts: seriesPoints(result) }`; destroyed before the next result and at `unmount` |
| 8 | Equipment slot | `div.contents[data-slot="equipment-check"]` | Its own grid item, after the Result card and the charts, before Saved runs (5.4 row "Equipment slot") |
| 9 | Saved runs card | `section.card` with `h3` `Saved runs` | `table.run-list#smRuns`: head Run, Mix, Result, Energy, Note, –; per run `tr[data-run-id]`: the `runRowTexts` cells (Result as a `span.chip`), then `button.btn` `Open`, `a.btn` `Compare with real` (only kind `cycle` with `verdict` `pass` or `fail`: `href="#/rooms/<id>/calibrate/<runId>"`), `button.btn` `Note`, `button.btn` `Delete`; `button.btn#smOlder` `Older` |

### 5.4 Behaviour

| Moment | Action |
|---|---|
| `mount(el, ctx)` | Markup; `room = ctx.room()`; `ctx.on('settings', …)` and `ctx.on('room', r => { room = r; })`; then in parallel (C5 3.10 "Load at mount"): `getMix(id)` → `saved` and `draft` (copies); `listCalibrations(id)`; `getSettings(id)`; `listSettingsHistory(id)` (first row = `version`); `getEquipment(id)` (`null` = none); `listSimulations(id, { limit: 50 })`. Each failure: `errorText` in `#smMsg`. `#smCap` and `#smCycle` stay disabled until mix, calibrations, settings and equipment have loaded |
| Equipment slot | After `getSettings` and `getEquipment` have loaded: `FarmEquipmentCard` defined → `card = FarmEquipmentCard.mount(slot, { id, equipment, runInputs: cardInputs, onEquipment, onSaved })`; not defined (a tree without the Equipment merge) → `p.est-note` `The machines check is not installed.` in the slot. `cardInputs()` = `runInputs('cycle', data)` with `plant` left out of its `room`, returned as `{ room, mix, settings, region, tariff, inputs }`. `onEquipment(eq)`: `equipment = eq`; repaint `#smMachines`. `onSaved(info)`: add `info` to the top of `runs`; repaint the list |
| Stream `settings` (`ctx.on('settings')`, `data` = `{ id, room_id, saved_at, note, settings }`) | `settings = data.settings`; `version = { id: data.id, saved_at: data.saved_at }`; repaint `#smSettings` and the `#smCycle` text (C5 3.10: a **Your machines** save that changes `airM3h` arrives this way; later runs and the card's `runInputs()` use it) |
| Mix edit | Crop select, Blocks (`clampBlocks`), CO₂ per block (`clampCo2`), **Remove**, **Add a crop** (`{ crop: 'oyster', blocks: 500, co2_per_block: null }`): change `draft` only; repaint the table and the state of `#smSaveMix` |
| **Save as this room's crop mix** | `rows = await saveMix(id, draft)`; `saved = rows`; `draft` = a copy; `#smMsg` = `Saved. The simulated live room uses <sum of blocks> blocks after its next restart.` `ApiError`: `errorText` in `#smMsg` |
| `#smCycle` text | `Run a full cycle (<D> days)` with `D = ClimateCycle.cycleDays(settings.farmType, settings.program)`; repainted when `settings` change |
| **Run a full cycle** | `D > 180`: `confirm('This program is <D> days long and may take several minutes in the browser. Run it?')`; cancel → nothing. Then `r = runInputs('cycle', data)`; run `ClimateCycle.runCycleSteps(r.room, r.mix, { settings: r.settings, region: r.region, tariff: r.tariff })` (row "Stepping") |
| **Check capacity** | `r = runInputs('capacity', { …, emptyBelow: Number(#smEmpty.value) })`; run `ClimateCapacity.checkSteps(r.room, r.mix, { region: r.region, tariff: r.tariff, emptyBelow: r.emptyBelow })` (row "Stepping") |
| Stepping | `running = true`; `myGen = ++gen`; disable both run buttons, the mix table, `#smAddCrop` and `#smSaveMix`; show `#smProgress`. Loop: `s = it.next()` (a throw: `#smMsg` = `The run stopped: <message>`, nothing saved, stop); `s.done` → finished; else `#smProgress` text = `progressText(s.value)`, fill width = `day / days × 100 %` (capacity: width 0, text only); `await new Promise(r => setTimeout(r, 0))`; stop silently when `!alive \|\| myGen !== gen`. Finally `running = false`, enable the controls, hide `#smProgress` |
| Finished | Show the result (row "Result card"); `info = await createSimulation(id, { kind, inputs: r.inputs, result })`; add `info` to the top of `runs`; `#smMsg` = `Saved as run <info.id>.` A rejection: the result stays on screen, `#smMsg` = `The result was not saved: <errorText>`. After `unmount` nothing is saved (lead decision 26) |
| Result card | Capacity: the wave 1 `renderReport` (5.4 row "Moved code"); cycle: `cycleSummary`, `stageRows`, the note, then the prediction charts; equipment: `FarmEquipmentCard.renderReport` |
| Moved code | Copy from `web/capacity.js` (at the merge base) into `web/room-simulate.js`, unchanged except for its arguments: `VERDICT_CHIP`, `LIMIT_WORD`, `FAIL_MACHINE`, `verdictText(rep)`, and `renderReport` as `renderReport(host, rep)` (it reads `rep`, not module state). `web/capacity.js` itself is not changed |
| Saved runs | Built from `runs` (SimulationRunInfo, no `result`), newest first. **Open**: `run = await getSimulation(id, runId)` → the Result card of its `kind` (equipment without `FarmEquipmentCard`: `p.est-note` `The machines check is not installed.`). **Note**: `text = prompt('Note for run <runId>', note ?? '')`; `null` → nothing; else `info = await updateSimulation(id, runId, { note: text })`, replace the row. **Delete**: `confirm('Delete this run? It cannot be undone.')`; `await deleteSimulation(id, runId)`; remove the row. **Older**: `page = await listSimulations(id, { limit: 50, before: <smallest id in runs> })`, append; an empty page hides `#smOlder`. Every `ApiError`: `errorText` in `#smMsg` |
| `unmount` | Each step in its own `try`: `alive = false`; `gen++` (a running check stops at its next step, nothing saved); `card && card.unmount()`; `charts && charts.destroy()`. The frame removes the `ctx.on` listeners |

### 5.5 Saved runs chips (C5 3.10 table, exact)

| `info.kind` | `info.verdict` | Chip `{ lvl, icon, text }` |
|---|---|---|
| `cycle` | `pass` | `{ lvl: 'good', icon: '✓', text: 'Passes' }` |
| `cycle` | `fail` | `{ lvl: 'warning', icon: '✕', text: 'Fails' }` |
| `capacity` | `good` | `{ lvl: 'good', icon: '✓', text: 'Good' }` |
| `capacity` | `tight` | `{ lvl: 'info', icon: '●', text: 'Tight' }` |
| `capacity` | `too-dense` | `{ lvl: 'warning', icon: '✕', text: 'Too many blocks' }` |
| `capacity` | `too-empty` | `{ lvl: 'info', icon: '●', text: 'Too few blocks' }` |
| `equipment` | `enough` | `{ lvl: 'good', icon: '✓', text: 'Enough' }` |
| `equipment` | `too-small` | `{ lvl: 'warning', icon: '✕', text: 'Too small' }` |
| `equipment` | `too-big` | `{ lvl: 'warning', icon: '✕', text: 'Too big' }` |
| `equipment` | `oversized` | `{ lvl: 'info', icon: '●', text: 'Bigger than needed' }` |
| any | `impossible` | `{ lvl: 'warning', icon: '✕', text: 'Impossible' }` |
| any | anything else | `{ lvl: 'info', icon: '●', text: <the verdict as stored> }` |

### 5.6 Texts (exact)

| Where | Text |
|---|---|
| Explain | `Simulate = try a plan before you do it. Enter the crop mix, then Check capacity (fast: will the climate hold on a hot-dry, a hot-humid and a rainy day, and how many blocks fit?) or Run a full cycle (spawn run, pinning, fruiting and rest for every flush, with the energy cost). Every result is saved and can later be compared with what really happens.` |
| Mix saved | `Saved. The simulated live room uses <n> blocks after its next restart.` |
| Long cycle | `This program is <D> days long and may take several minutes in the browser. Run it?` |
| Run | `Saved as run <id>.`, `The result was not saved: <errorText>`, `The run stopped: <message>` |
| Cycle note | `Spawn run judges temperature and block core only (the bags are sealed).` |
| Slot | `The machines check is not installed.` |
| Delete | `Delete this run? It cannot be undone.` |
| Values line | `calibrated <YYYY-MM-DD>`, `not calibrated — typical values`, `Settings: version <id> saved <stamp>`, `Machines: <machinesText>` |

### 5.7 The equipment-run fixture (for the headless check, task 11)

A small hand-made C8 Report that C3 7.6 accepts for kind `equipment` and that `FarmEquipmentCard.renderReport` can draw (every field of C8 11.2 and 11.3). `S` = the settings the check saved (7.2). Store it with `FarmApi.createSimulation(1, EQ_RUN)`.

```js
const EQ = { ac_hp: 1.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 };
const T1 = 'Your 1.5 hp aircond is enough for grey oyster: it keeps the room within 1 °C of 25 °C 99 % of fruiting hours.';
const T2 = 'Your 3 L/h fogger is enough.';
const T3 = 'Your 1,800 m³/h air exchange is enough: a purge takes at most 1.2 min (fruiting), the limit is 3 min.';
const T4 = 'Walls and roof: good. They bring in 20 % of the heat. (Typical walls: set the walls and roof of this room for a better answer.)';
const EQ_RUN = {
  kind: 'equipment',
  inputs: { mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }], settings: S, region: 'my-lowland', tariff: 0.57,
            volume: 60, calibration: null, empty_below: null, equipment: EQ },
  result: {
    verdict: 'ok', crop: 'Grey oyster', targets: { spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' },
    inputs: { equipment: EQ, uaSource: 'typical', ua: 80, solarPeakW: 500, blocks: 2000, farmType: 'ready', region: 'my-lowland', tariff: 0.57 },
    estimate: { needW: 3000, stage: 'fruiting', perStage: { fruiting: 3000, rest: 1800 }, hp: 1.5 },
    runs: [{ kind: 'ac', ac_hp: 1.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, acPass: true, dryPass: true, co2Pass: true, tooLow: false,
             tooBig: false, pass: true, fruitingInT: 99.1, worst: { stage: 'fruiting', flush: 1, inT: 99.1 }, acFail: null,
             kwh: 40, kwhPerBlock: 0.02, rmPerBlock: 0.0114, fogPeakLph: 1.2, fails: [], hours: 24 }],
    ac: { verdict: 'enough', own: 1.5, units: 1, min: 1.5, recommended: 1.5, noReserve: null, text: T1 },
    fogger: { verdict: 'enough', own: 3, recommended: null, peak: 1.2, text: T2 },
    air: { verdict: 'enough', own: 1800, needM3h: 800, recommended: null, margin: 1200, stage: 'fruiting', purgeS: 69, capS: 180, text: T3 },
    insulation: { verdict: 'good', share: 20, uaSource: 'typical', insulatedHp: null, text: T4 },
    wet: null,
    breakdown: { ac_hp: 1.5, hours: 24, items: [
      { key: 'walls', label: 'Walls and roof (sun included)', kwh: 10, share: 20 }, { key: 'airHeat', label: 'Fresh air: heat', kwh: 7.5, share: 15 },
      { key: 'airWater', label: 'Fresh air: water', kwh: 12.5, share: 25 }, { key: 'blocks', label: 'Blocks', kwh: 17.5, share: 35 },
      { key: 'machines', label: 'Machines and lights', kwh: 2.5, share: 5 }],
      advice: 'bigger-ac', text: 'The heat comes mostly from the blocks and the room itself, not from the walls or the fresh air: a bigger aircond is the right fix.' },
    pass: true,
    summary: [T1, T2, T3, T4],
  },
};
```

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, then implement, see it pass, `npm test`, commit)

### 6.1 Test file header

```js
// web/room-simulate.js helpers (docs/contracts/web.md 3.7, 3.10).
const test = require('node:test');
const assert = require('node:assert/strict');
for (const f of ['sim', 'air', 'controller', 'runtime', 'calib', 'capacity', 'cycle', 'equipment', 'room-rules']) require(`../${f}.js`);
require('../web/ui.js'); require('../web/api.js'); require('../web/charts.js');
require('../web/room-tabs.js');
require('../web/room-simulate.js');
const H = globalThis.FarmRoomTabs.get('simulate').helpers;
const CC = globalThis.ClimateController;
const ROOM = { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 1791446400, archived_at: null, live: null };
const CAL = { id: 3, room_id: 1, run_at: 1790827200, ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41, rmse_t: 0.21,
  rmse_rh: null, rmse_co2: 38, log_rows: 5760, applied_at: 1790827230, applied: true, source: 'history', log_from: 1, log_to: 2, equipment: null };
const EQUIP = { room_id: 1, saved_at: 1791450950, ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 };
const S = { ...CC.defaultSettings(), airM3h: 900 };
const DRAFT = [{ crop: 'oyster', blocks: 1200, co2_per_block: null }, { crop: 'pink', blocks: 300, co2_per_block: 55 }];
const data = over => ({ room: ROOM, settings: S, draft: DRAFT, calibrations: [{ ...CAL, id: 2, applied: false }, CAL], equipment: null,
  region: 'my-lowland', tariff: 0.57, emptyBelow: 50, ...over });
```

`RES` (a hand-made C7 Result, used by SM6):

```js
const seg = (stage, startDay, t, x) => ({ stage, flush: 1, startDay, days: 1, hours: 24, targets: t, lowRhMin: 0, wet: 0, ...x });
const RES = { verdict: 'ok', targets: { spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' },
  inputs: { farmType: 'full', days: { spawn: 1, pinning: 1, fruiting: 1, rest: 1 }, flushes: 1, region: 'my-lowland', blocks: 2000, co2PerBlock: 45, tariff: 0.57, warnings: [] },
  stages: [
    seg('spawn', 0, { spT: 24, spRH: 70, co2Lim: 5000, coreMax: 32 }, { inT: 100, rhOk: 3.4, co2Below: 100, maxCore: 28.2, alarms: {}, kwh: 10.4, rm: 5.93, fails: [], pass: true }),
    seg('fruiting', 1, { spT: 25, spRH: 88, co2Lim: 1000, coreMax: 32 }, { inT: 93.5, rhOk: 99.1, co2Below: 100, maxCore: 27.4, alarms: { rhHi: 2 }, kwh: 12.6, rm: 7.18, fails: ['temperature too high'], pass: false }),
  ],
  totals: { days: 2, kwh: 23, rm: 13.11, rmPerBlock: 0.006555, pass: false },
  series: Array.from({ length: 48 }, (_, h) => ({ h, stage: h < 24 ? 'spawn' : 'fruiting', flush: 1, T: 24, RH: 80, CO2: 900, core: 27, kwh: 0.5 })) };
```

### 6.2 Tasks

| # | Test(s) first | Then build | What it proves |
|---|---|---|---|
| 0 | – | Section 2 checks; read the files listed there. No commit | The start state |
| 1 | **SM1 registration**: `FarmRoomTabs.get('simulate')` has `mount`, `unmount` functions and a `helpers` object with exactly the names of 5.2; loading did no DOM work; `unmount()` before any mount does not throw | Skeleton: wrapper, `FarmRoomTabs.register('simulate', { mount, unmount, helpers })` | C5 1.4, 3.9 |
| 2 | **SM2 mix**: `toCapacityMix(DRAFT)` deep-equals `[{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 300, co2PerBlock: 55 }]`; `toMixRows` gives `DRAFT` back. `sameMix`: equal → `true`; another length, crop, blocks or `co2PerBlock` → `false`; absent vs absent → `true`; absent vs 55 → `false`; a non-array → `false`. **SM3 appliedCalib**: `appliedCalib([{ ...CAL, applied: false }])` → `null`; `[]` → `null`; `appliedCalib([CAL])` deep-equals `{ ua: 92.4, infAch: 0.31, moistBuffer: 3.6, co2PerBlock: 41, rmse: { T: 0.21, RH: null, CO2: 38 }, date: '2026-10-01T04:00:00.000Z' }` | `toCapacityMix`, `toMixRows`, `sameMix`, `appliedCalib` | C5 3.7, C3 8 |
| 3 | **SM4 runInputs without machines**: `r = runInputs('cycle', data())`: `r.room` deep-equals `{ name: 'Room 1', volume: 60, airM3h: 900, calib: appliedCalib([CAL]) }` and `'plant' in r.room === false`; `r.mix` = `toCapacityMix(DRAFT)`; `r.settings === S`, `r.region` `my-lowland`, `r.tariff` 0.57; `r.inputs` deep-equals `{ mix: DRAFT, settings: S, region: 'my-lowland', tariff: 0.57, volume: 60, calibration: { id: 3, ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41 }, empty_below: null, equipment: null }` and `Object.keys(r.inputs.calibration)` is exactly `['id', 'ua', 'inf_ach', 'moist_buffer', 'co2_per_block']`; `runInputs('capacity', data()).inputs.empty_below === 50`; with no applied run: `room.calib` `null` and `inputs.calibration` `null`. **SM5 runInputs with machines** (C5 3.10 "Node tests with machines"): in the test, `const real = ClimateEquipment.plantOf; ClimateEquipment.plantOf = (eq, room) => ({ ac: { capW: 1 }, args: [eq, room] }); t.after(() => { ClimateEquipment.plantOf = real; });`; `r = runInputs('cycle', data({ equipment: EQUIP }))`: `r.room.plant.args[0] === EQUIP`, `r.room.plant.args[1]` deep-equals `{ volume: 60, calib: appliedCalib([CAL]) }`; `r.inputs.equipment` deep-equals `{ ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 }` (no `room_id`, no `saved_at`); `r.room.airM3h === 900` (the settings', not the Equipment's) | `runInputs` | C5 3.10 row "Run inputs", C3 3.10.1, 8; lead decision 35 |
| 4 | **SM6 cycle result**: `cycleSummary(RES)` deep-equals `{ chip: { lvl: 'warning', icon: '✕', text: '1 stage(s) fail' }, line: '2 days · 1 flushes · 23 kWh · RM 13.11 · RM 0.01 per block' }`; with every segment passing: chip `{ lvl: 'good', icon: '✓', text: 'all stages pass' }`; `cycleSummary({ verdict: 'impossible', why: 'Add at least one crop with blocks.' })` → `{ chip: { lvl: 'warning', icon: '✕', text: 'impossible' }, line: 'Add at least one crop with blocks.' }`. `stageRows(RES)` deep-equals `[['Spawn run', '1', '1', '100.0', 'not judged', 'not judged', '28.2', '–', '10', '5.93', 'Pass'], ['Fruiting', '1', '1', '93.5', '99.1', '100.0', '27.4', 'rhHi ×2', '13', '7.18', 'temperature too high']]`. `seriesPoints(RES)[0]` deep-equals `{ t: 0, T: 24, RH: 80, C: 900, core: 27, spT: 24, spRH: 70, co2Lim: 5000 }`; `[30]` has `t` 108000, `spT` 25, `spRH` 88, `co2Lim` 1000; length 48 | `cycleSummary`, `stageRows`, `seriesPoints` | C5 3.10 row "Result card, cycle" |
| 5 | **SM7 runRowTexts**: an info `{ id: 12, room_id: 1, created_at: 1791450900, kind: 'cycle', verdict: 'pass', blocks: 2000, days: 83, kwh: 1093.4, rm: 623.2, utilisation: null, real_start: null, note: null, inputs: { mix: [{ crop: 'oyster', blocks: 2000, co2_per_block: null }] } }` → `{ run: 'Cycle · 2026-10-08 17:15:00', mix: '2000 Grey oyster', chip: { lvl: 'good', icon: '✓', text: 'Passes' }, energy: 'RM 0.31 per block', note: '' }`; a two-row mix → joined with ` + `; capacity `utilisation: 74` → `energy` `74 %`; equipment → `energy` `–`; every chip row of 5.5 (one assertion each, `xyz` → `{ lvl: 'info', icon: '●', text: 'xyz' }`); a cycle `impossible` with `rm: null` → `energy` `–` | `runRowTexts` | C5 3.10 rows "Saved runs card", "Saved runs chips" |
| 6 | **SM8 progressText**: `{ day: 3, days: 83, stage: 'spawn', flush: 1 }` → `Day 3 of 83 · Spawn run`; `{ day: 40, days: 83, stage: 'fruiting', flush: 2 }` → `Day 40 of 83 · Fruiting · flush 2`; `{ day: 50, days: 83, stage: 'rest', flush: 2 }` → `… · Rest between flushes · flush 2`; `{ runs: 3, blocks: 1600, pass: true }` → `Simulation run 3: 1,600 blocks, pass…`; `pass: false` → `fail…`. **SM9 machinesText**: `null` → `Typical machines`; `{ ac_hp: 2.5, ac_units: 1, fog_lph: 3, air_m3h: 1800, walls: null, roof: null, height: 3 }` → `2.5 hp aircond · 3 L/h fogger · 1,800 m³/h air exchange · Typical walls`; `EQUIP` with `ac_units: 2` → `2 × 2.5 hp aircond · 3 L/h fogger · 1,200 m³/h air exchange · PU panel 50 mm walls and roof`; `walls: 'brick115', roof: 'zinc'` → ends `Brick 115 mm, plastered walls, Zinc sheet, no insulation roof`. **SM10 inputs**: `clampBlocks`: `'12.6'` 13, `'-5'` 0, `'300000'` 200000, `''` 0, `'abc'` 0; `clampCo2`: `''` `null`, `'0'` 1, `'55.4'` 55, `'5000'` 1000, `'x'` `null`; `regionText('my-lowland')` = `Lowland Peninsular Malaysia`, `regionText('x')` = `x` | `progressText`, `machinesText`, `clampBlocks`, `clampCo2`, `regionText` | C5 3.10 rows "Running", "`machinesText`" |
| 7 | No Node test (DOM) | Markup 5.3; load at mount, the values line, the mix card and **Save as this room's crop mix**, the stream `settings` row | Task 11 |
| 8 | No Node test (DOM) | Stepping both runs, the long-cycle confirm, Finished, the Result card (with the moved wave 1 capacity report), the prediction charts | Task 11 |
| 9 | No Node test (DOM) | The equipment slot (card or notice), Saved runs (Open, Compare with real, Note, Delete, Older), `unmount` | Task 11 |
| 10 | – | `npm test`; commit; tell the lead you wait for gate 2.5 | – |
| 11 | Headless Chrome (7.2), after gate 2.5 | Fix what it finds; a Node test first for any helper bug | C5 7.10 row "Simulate tab" |
| 12 | – | Section 7.1; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| Test names | Start each test with its id (`test('SM4 runInputs without machines', …)`). One `test(…)` per id: SM1–SM10 |
| Frozen stub | If `ClimateEquipment.plantOf` cannot be replaced because the stub's `ClimateEquipment` object is frozen, stop SM5 and report it to the lead (C5 3.10 requires the recorder); do not edit `equipment.js` |

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check web/room-simulate.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/web-room-simulate.test.js` | `# fail 0`; SM1–SM10 listed |
| `npm test` | `# fail 0`; `# pass` = `N0` + 10; `# skipped` = `K0` |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `tests/web-room-simulate.test.js` and `web/room-simulate.js` |
| `git diff --exit-code $(git merge-base HEAD master) -- web/capacity.js equipment.js cycle.js capacity.js` | No output, exit 0 |
| `grep -n "runCycleAsync\|checkAsync\|runCycle(\|FarmApi.stream\|setInterval" web/room-simulate.js` | No output (the tab steps the generators itself; no stream, no interval) |
| `node -e "for (const f of ['sim','air','controller','runtime','calib','capacity','cycle','equipment','room-rules']) require('./'+f+'.js'); require('./web/room-tabs.js'); require('./web/room-simulate.js')"` | No output, exit 0 |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git status --short` | Empty |

### 7.2 Headless Chrome, after gate 2.5 (C5 3.9 "Headless checks of one tab", 7.10 row "Simulate tab")

Run only when the lead says gate 2.5 passed. Drive Chrome with the chrome-devtools MCP tools or with `cdp.js` of `web-split.md` Appendix A, copied into a scratch folder made with `mktemp -d`. The tree's `index.html` already loads every script (`cycle.js`, `equipment.js`, `web/room-equipment.js`, the tab files): inject none. The tree has the wave 1 shell and the wave 0 `web/rooms.js` stub: empty `#view` and mount the tab by hand. No layout assertion (the Room shell CSS is absent); positions are checked in DOM order only.

| Step | Shell or page |
|---|---|
| Check tree | `T=$(mktemp -d); git -C <worktree> archive master \| tar -x -C $T; MB=$(git -C <worktree> merge-base HEAD master); git -C <worktree> archive HEAD -- $(git -C <worktree> diff --name-only $MB HEAD) \| tar -x -C $T` |
| Server (background) | `PORT=$(node -e "const s=require('net').createServer().listen(0,()=>{console.log(s.address().port);s.close()})"); cd $T && FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$T/check.db npm start`; open `http://127.0.0.1:<PORT>/` |
| Short program | In the page: `const S0 = await FarmApi.getSettings(1); const S = { ...S0, farmType: 'ready', program: { ...S0.program, flushes: 1, days: { ...S0.program.days, fruiting: 1, rest: 1 } } }; await FarmApi.saveSettings(1, S, 'headless short cycle');` (1-day stages, 1 flush, `ready`, C5 7.10) |
| Seed the equipment run | `await FarmApi.createSimulation(1, EQ_RUN)` with the fixture of 5.7 (it must answer 201) |
| Mount (helper `mountSim()`) | `window.mountSim = async () => { const t = FarmRoomTabs.get('simulate'); try { t.unmount(); } catch {} const R = (await FarmApi.listRooms()).find(r => r.id === 1); const v = document.getElementById('view'); v.replaceChildren(); await t.mount(v, { id: 1, params: {}, room: () => R, on: () => () => {} }); };` then `await mountSim()` and wait for the loads (about 1 s) |
| Overrides | `window.confirm = () => true; window.prompt = () => 'headless note';` |

| # | Step | Expected |
|---|---|---|
| M1 | After the mount | `p.explain` has the C5 3.10 text; `#smCycle` = `Run a full cycle (1 days)`; `#smCalib` `not calibrated — typical values`; `#smSettings` starts `Settings: version ` and names the newest version id; `#smMachines` = `Machines: Typical machines`; no console error |
| M2 | Saved runs | The top `#smRuns` row: Run starts `Equipment · `, Mix `2000 Grey oyster`, chip `Enough`, Energy `–` |
| M3 | Slot position | `const slot = document.querySelector('[data-slot="equipment-check"]')`; `document.getElementById('smResult').compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING` and `slot.compareDocumentPosition(document.getElementById('smRuns')) & Node.DOCUMENT_POSITION_FOLLOWING` are both non-zero; the slot holds the card (an `h3` `Your machines`), not the notice (the Equipment merge is on the gate 2.5 tree) |
| M4 | **Open** on the equipment row | `#smResult` shows the report: its first `p` is the fixture's `T1` text |
| M5 | **Add a crop**; set the new row's Blocks to 2000 | `#smSaveMix` enabled; `await FarmApi.getMix(1)` is still `[]` (the draft is not saved) |
| M6 | Click `#smSaveMix` | `#smMsg` = `Saved. The simulated live room uses 2000 blocks after its next restart.`; `getMix(1)` deep-equals `[{ crop: 'oyster', blocks: 2000, co2_per_block: null }]`; `#smSaveMix` disabled |
| M7 | Click `#smCap`; wait for `Saved as run <id>.` (up to 120 s) | The top `#smRuns` row starts `Capacity · `; `(await FarmApi.listSimulations(1))[0]` has `kind` `capacity`; `getSimulation(1, <id>)` has `inputs.settings.airM3h === (await FarmApi.getSettings(1)).airM3h`, `inputs.calibration === null`, `inputs.empty_below === 50`, `inputs.equipment === null` |
| M8 | Click `#smCycle`; wait for `Saved as run <id>.` (up to 60 s) | While running `#smProgress` showed `Day 1 of 1 · Fruiting · flush 1`; the Result card shows the chip and the line `1 days · 1 flushes · …`, one table row per segment, the note; three `svg.chart` in `#smCharts`; the top row starts `Cycle · ` with a `Compare with real` link to `#/rooms/1/calibrate/<id>` |
| M9 | **Open** on the capacity row | `#smResult` shows the capacity report (a verdict chip and the `cap-report` lines) |
| M10 | **Note** on the cycle row | The row's Note cell `headless note`; `(await FarmApi.getSimulation(1, <id>)).note === 'headless note'` |
| M11 | **Delete** on the capacity row | The row is gone; `getSimulation(1, <that id>)` rejects with status 404 |
| M12 | `await FarmApi.saveEquipment(1, { ac_hp: 2, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 })`; `await mountSim()` | `#smMachines` = `Machines: 2 hp aircond · 3 L/h fogger · 1,200 m³/h air exchange · PU panel 50 mm walls and roof`; `(await FarmApi.getSettings(1)).airM3h === 1200` (the server keeps it in step, C3 6.26) |
| M13 | Click `#smCycle`; wait for `Saved as run <id>.` | The stored run's `inputs.equipment` deep-equals `{ ac_hp: 2, ac_units: 1, fog_lph: 3, air_m3h: 1200, walls: 'pu50', roof: 'pu50', height: 3 }`; `inputs.settings.airM3h === 1200` |
| M14 | `run = await FarmApi.saveCalibration(1, { ua: 92.4, inf_ach: 0.31, moist_buffer: 3.6, co2_per_block: 41, rmse_t: 0.21, rmse_rh: 1.9, rmse_co2: 38, log_rows: 5760 }); await FarmApi.applyCalibration(1, run.id); await mountSim()` | `#smCalib` = `calibrated <today's farm date>` |
| M15 | Click `#smCap`; wait for `Saved as run <id>.` | `Object.keys(stored.inputs.calibration)` is exactly `['id', 'ua', 'inf_ach', 'moist_buffer', 'co2_per_block']` and `inputs.calibration.id === run.id` |
| M16 | Count `listSimulations(1)` as `n`; click `#smCycle`, then at once `FarmRoomTabs.get('simulate').unmount()`; wait 10 s | `listSimulations(1).length === n` (nothing saved); no console error |
| M17 | The console for the whole session | No errors; no 404 except `/favicon.ico` |
| End | Stop the server; `rm -rf $T` and the scratch folder | – |

## 8. Done when

| # | Item |
|---|---|
| 1 | Every start check of section 2 held (or the lead answered) |
| 2 | `web/room-simulate.js` replaces the stub, registers tab `simulate` with `mount`, `unmount`, `helpers`, defines no global, does no DOM work at load |
| 3 | Every helper of 5.2 behaves as its row says and is tested (SM1–SM10), the with-machines branch through a `plantOf` recorder |
| 4 | Runs step the C7 and capacity generators in the tab, stop on `unmount` with nothing saved, ask before a program over 180 days, and store `{ kind, inputs, result }` with `inputs` exactly C3 3.10.1 |
| 5 | The slot `div.contents[data-slot="equipment-check"]` sits after the Result card and before Saved runs, mounts the card or shows `The machines check is not installed.` |
| 6 | Saved runs follow C5 3.10 (chips of 5.5, Energy `–` for equipment, Open, Compare with real, Note, Delete, Older) |
| 7 | `npm test` `# fail 0` at `N0` + 10, `# skipped` `K0`; only the two owned files differ from the merge base |
| 8 | Every headless row M1–M17 passed after gate 2.5, with no console error |
| 9 | Committed on `stream/room-simulate` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 3 (`web/capacity.js` and `equipment.js` included), or add CSS | File owners; you copy from `web/capacity.js`, you do not change it |
| Use `runCycle`, `runCycleAsync` or `checkAsync` | Lead decision 26: the tab steps the generator so `unmount` stops it |
| Save a run that finished after `unmount`, or a half-run | Lead decision 26 |
| Write the draft mix anywhere but through **Save as this room's crop mix** | Lead decision 25 |
| Put the air size in `plant` or anywhere but `room.airM3h` and `inputs.settings.airM3h`; give `inputs.calibration` any key beyond the five | C8 4.5, C3 3.10.1, 7.6 |
| Load the room's machines into a capacity or cycle run any other way than `ClimateEquipment.plantOf(equipment, { volume, calib })` | C5 3.10, lead decision 35 |
| Read `result` from a SimulationRunInfo (lists have none) | C3 3.9 |
| Open `FarmApi.stream` or poll | C5 3.9: events come through `ctx.on` |
| Pass settings to `ClimateController.applySettings` | Lead decision 6 |
| Put dynamic text into `innerHTML` | C5 1.4 |
| Push, merge, rebase, merge `master` into your branch, or change git config | The lead merges after review |

## 10. Report to the lead

| Item | Content |
|---|---|
| Result | Done or blocked; `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | `N0`, `K0`, the final `npm test` counts |
| Headless | One line per row M1–M17: pass or fail, with what you saw; the run times of M7, M8, M13 |
| Points to confirm | (1) the helpers beyond C5 3.10's list (`clampBlocks`, `clampCo2`, `regionText`) and the `runInputs` data shape (5.2); (2) the ids `sm*` beyond C5's; (3) the cycle chip `lvl` `warning` for C5's "bad" and the icons; (4) `progressText`'s flush part for `fruiting` and `rest` only; (5) the capacity progress bar width 0 (text only); (6) the card mounted after settings and equipment load |
| Anything else | Every contract gap or mismatch you met, and what you did instead of guessing |

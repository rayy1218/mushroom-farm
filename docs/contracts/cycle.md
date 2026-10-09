# C7: Crop cycle simulation contract (`cycle.js`)

Date: 2026-10-08. Status: **frozen** (revision 2). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`. Work brief: `docs/superpowers/plans/2026-10-08-farm-foundation/cycle.md`.

### Changes in revision 2

The C8 equipment check (`docs/contracts/equipment.md` sections 5.3 and 12.6) and the room-centred app, frozen together (lead decisions 34, 36, 37, 40). In wave 2 the **Equipment** stream owns `cycle.js` and appends to `tests/cycle.test.js`.

| Section | Change |
|---|---|
| Intro, 1, 15 | The page is the Simulate tab (C5 3.10), which asks before a program longer than 180 days (lead decision 26); results are stored in C1 `simulation_runs` through C3 6.20–6.24 and compared in the Calibrate tab (C5 3.11). C5 revision 7 loads `cycle.js`; C3 serves `/cycle.js`. |
| 2.1 | `room` takes an optional `plant` (C8 5.1.1: the room's machines, one-level override of `ClimateSim.PLANT`); new `opts.heat`. |
| 3 | New check 2b: `room.plant` not `null`/`undefined` and not a non-array object → `TypeError('runCycle: plant must be an object')`. |
| 7.1 | Step 2: `e.plant = structuredClone(room.plant)` when `room.plant != null`. |
| 8.1 | New step 2a (with `opts.heat`): heat flows from `sim.heatJ()` into the open hour and segment. |
| 8.2, 8.4 | The wet counter uses the stage's wet line: `CROPS[tg.crop].wetRH[stage]` when the crop sets it, else `PASS.wetRH` (95). Only lion's mane sets it (`{ pinning: 98 }`, lead decision 40); every other crop's result is deep-equal to revision 1. |
| 12.4, 12.2 | With `opts.heat`, every Segment and every series Hour gain `heat` (13 keys, Wh). Without it the Result is deep-equal to revision 1. |
| 14 | Tests for `plant`, `opts.heat` and the per-stage wet line. |

This contract defines `cycle.js`: a simulation of one whole crop cycle (every stage, every flush) for a room and a crop mix. It answers "can this room hold this mix for a full cycle on our region's weather?" one stage at a time. It runs the real controller (`controller.js`) against the simulated room (`sim.js`) through the runtime (`runtime.js`), as the capacity check (`capacity.js` `trial`) does for fruiting only. Its result keeps an hourly series, so the Calibrate tab (C5 3.11) can lay the predicted cycle over the real readings of the same room.

| Part of the user's idea | Where |
|---|---|
| Many rooms; per room a live dashboard (IoT) | Not here: the room's Live tab (C2, C3, C5 3.4) |
| Per room a simulation: put a composition (crop mix), run a cycle, see whether the room capacity is enough for the climate | This contract |
| Save the result and compare it with the real data, then calibrate | Not here. This contract makes the result (with `series`) ready for that; it is stored by C1 `simulation_runs` and C3 6.20–6.24 and compared in the Calibrate tab (C5 3.11) |

### Lead decisions for C7 (binding; this contract implements them)

| Topic | Decision | Section |
|---|---|---|
| Module | New shared file `cycle.js` (browser and Node, global `ClimateCycle`, same wrapper as `capacity.js`). `capacity.js` may only gain exports of existing helpers (`mixCo2`, `roomOf`), no behaviour change; its tests stay green. | 1, 13.2 |
| Functions | `runCycleSteps(room, mix, opts)` generator yielding `{ day, days, stage, flush }` once per simulated day and returning the result; `runCycle` synchronous; `runCycleAsync` yielding to the browser between days, `opts.onProgress`. `room` and `mix` as in `capacity.js`. | 2, 11 |
| Targets | `commonTargets(mix)`; impossible: `{ verdict: 'impossible', why }`, no simulation. The controller runs the stage program of `tg.crop`; in fruiting `spT`/`spRH` are the common targets. `opts.settings` (validated with `importSettings`) override the defaults. | 3, 4 |
| Program | `program.auto = true` with the controller's days per stage and flushes. `full`: spawn, pinning, (fruiting, rest) per flush, ending after the last fruiting; `ready`: (fruiting, rest) per flush, ending after the last fruiting. Total days from the program; harvest windows off; `env.blockStage` follows the controller stage every step. | 5 |
| Weather | Day k uses `DESIGN_DAYS[region].days[k % 3]`; one warm-up day before day 0, not scored. Deterministic. | 6, 7.2 |
| Scoring | Per stage segment: hours, `inT`, `rhOk`, `lowRhMin` per day, `wet`, `co2Below`, max block core, alarms raised per id, kWh, RM (`opts.tariff`, default 0.57). Pass rules: `capacity.js` `PASS` against the stage's own targets; spawn judges temperature and block core (`coreMax`) only. Spawn: air below the band is excused while the controller's `coreControl` rule cools for the core (`core − coreTarget > T − spT`) (added on review, revision 1; signed off by the lead, lead decision 12). `fails[]` lists the failed rules. | 8, 9, 10 |
| Result | `{ verdict, why?, targets, inputs, stages, totals: { days, kwh, rm, rmPerBlock, pass }, series }`; `series` hourly `{ h, stage, flush, T, RH, CO2, core, kwh }` (plus `heat` with `opts.heat`, revision 2) | 12 |
| Room machines and heat (revision 2, C8) | `room.plant` overrides the simulation's machines; `opts.heat` adds heat flows; the wet line is per crop and stage (lead decisions 34, 36, 37, 40) | 2.1, 3, 7.1, 8.1, 8.2, 12 |
| Speed | `DT = 10` s; a full default cycle within 60 s in Node; the tests log the time | 1, 14 |

## 1. General rules

| Rule | Detail |
|---|---|
| File | `cycle.js` in the repository root, next to `capacity.js` |
| Module pattern | The same wrapper as `capacity.js`: `(function (global) { 'use strict'; … global.ClimateCycle = { … }; })(typeof window !== 'undefined' ? window : globalThis);`. No `require`, no `module.exports`, no DOM access, no npm packages. |
| Load order | `sim.js`, `controller.js`, `runtime.js`, `capacity.js`, then `cycle.js`. `cycle.js` reads `global.ClimateSim`, `global.ClimateController`, `global.ClimateRuntime`, `global.ClimateCapacity` once, at load. |
| Browser and Node | The same file runs in both. Node tests `require('../cycle.js')` after the four files above. C5 revision 7 loads it in `index.html` after `capacity.js`; C3 section 9 serves `/cycle.js`. |
| Shared modules | Revision 1: `controller.js`, `sim.js`, `runtime.js` are not changed; `capacity.js` gains two exports and nothing else (section 13.2). Revision 2: C8 changes `sim.js`, `controller.js` and `capacity.js` (C8 section 5); this contract uses `sim.heatJ()` and `env.plant` from them. |
| Deterministic | The same `room`, `mix` and `opts` always give a deep-equal result (`assert.deepStrictEqual`). No `Math.random`, no clock: the simulation uses no noise and no random weather. |
| Numbers | Every number in the result is unrounded (the page rounds for display). Units: °C, % RH, ppm, kWh, RM, hours, days. |
| Time step | `DT = 10` s of simulated time per step (as `capacity.js` `trial`). Not an option. |
| Speed | A full default cycle (83 simulated days) finishes within 60 s in Node 22 (measured on the draft with the weather window of section 6: about 4 s). With the window the run time grows linearly with the program length (measured: about 50 ms per simulated day in Node; 570 days in 27 s). Only the default cycle is bound to 60 s. The longest program `importSettings` allows (spawn 90 + pinning 30 + 10 × fruiting 60 + 9 × rest 60 = 1260 days) takes about 1 minute in Node and longer in a browser; the Simulate tab asks before it runs a program longer than 180 days (C5 3.10, lead decision 26). With `opts.heat` a run takes about 4–10 % longer (C8 13.1). |

## 2. Public API (`global.ClimateCycle`)

| Name | Signature | Returns | Notes |
|---|---|---|---|
| `runCycleSteps` | `(room, mix, opts?)` | A generator. Each `next()` before the end yields one Progress (section 11); the final `next()` returns `{ done: true, value: Result }` | Runs nothing until the first `next()`. Input errors (section 3) throw from the first `next()`. An impossible mix returns at once (`done: true` on the first `next()`, no Progress). |
| `runCycle` | `(room, mix, opts?)` | `Result` | Runs the generator to the end, synchronously. Calls `opts.onProgress(progress)` after each yield when given. Throws the input errors. |
| `runCycleAsync` | `(room, mix, opts?)` | `Promise<Result>` | Same as `runCycle`, but after each Progress (after `opts.onProgress`) it awaits `new Promise(r => setTimeout(r, 0))`, so the page can paint. Input errors reject the Promise. |
| `cycleDays` | `(farmType, program)` | integer days | Section 5.1. `farmType` is `'full'` or `'ready'`; `program` is a settings `program` object. Throws `Error('Unknown farm type: <farmType>')` for any other farm type. |
| `DT` | number | `10` | The time step in seconds (read-only use) |

### 2.1 Arguments

| Argument | Shape | Meaning |
|---|---|---|
| `room` | `{ name, volume, vent, calib, plant? }` as in `capacity.js` (revision 2 adds the optional `plant`: a partial plant of C8 5.1.1, the room's machines; `null` or left out = `ClimateSim.PLANT`): `volume` m³ (falsy = the simulation's 60 m³), `vent` `'supply'` or `'exhaust'` (falsy = the simulation's default `'supply'`), `calib` `{ ua, infAch, moistBuffer, co2PerBlock, rmse, date }` or `null` | The room. `name` is not used. |
| `mix` | `[{ crop, blocks, co2PerBlock? }]` exactly as in `capacity.js` | The planned blocks. A row counts only when `blocks` is a finite number above 0 (as `commonTargets` and `mixCo2`). |
| `opts.settings` | A Settings object (controller settings of the room), optional | Taken through `importSettings` (lead decision 6), then the forced keys of section 4.2 are set. Left out: `ClimateController.defaultSettings()`. |
| `opts.region` | string, default `'my-lowland'` | An own key of `ClimateCapacity.DESIGN_DAYS`. `region = opts.region \|\| 'my-lowland'` (as `capacity.js` `check`: `undefined`, `null` and `''` take the default) |
| `opts.tariff` | number, RM per kWh, default `0.57` | Energy price |
| `opts.heat` | boolean, default `false` | Revision 2. `true`: every Segment and every series Hour gain `heat`, an object with the 13 keys of C8 5.1.2 in **Wh** (J / 3600). `false`: no `heat` key anywhere; the Result is deep-equal to revision 1. |
| `opts.fullWeather` | boolean, default `false` | For the tests only: `true` keeps the whole weather series in `e.weatherSeries` instead of the per-day window (section 6). The Result must be deep-equal either way. |
| `opts.onProgress` | `(progress) => void`, optional | Used by `runCycle` and `runCycleAsync` only |
| `opts` itself | object or left out (`undefined`) | Other keys are ignored |

## 3. Input checks and errors

Checked in this order before anything runs. A failed check throws (from the generator's first `next()`; `runCycle` throws; `runCycleAsync` rejects).

| # | Condition | Error |
|---|---|---|
| 1 | `room` is not a non-null object | `TypeError('runCycle: room must be an object')` |
| 2 | `mix` is not an array | `TypeError('runCycle: mix must be a list')` |
| 2b | Revision 2: `room.plant != null` and it is not a non-array object | `TypeError('runCycle: plant must be an object')` |
| 3 | `opts.settings !== undefined` and it is not a non-null, non-array object | `TypeError('runCycle: settings must be an object')` |
| 4 | `opts.tariff !== undefined` and it is not a finite number ≥ 0 | `TypeError('runCycle: tariff must be a number of at least 0')` |
| 5 | `region = opts.region \|\| 'my-lowland'` is applied first; fails when `!Object.hasOwn(DESIGN_DAYS, region)` (so inherited names such as `'toString'` or `'constructor'` fail too) | `Error('Unknown region: <region>')` (the same text as `capacity.js`) |
| 6 | `exportSettings` or `importSettings` throws (for example `structuredClone` inside `exportSettings` throws a `DataCloneError` for a settings object holding a function) | That error, unchanged |

After the checks: `tg = ClimateCapacity.commonTargets(mix)`. When `tg.impossible` is true the generator returns `{ verdict: 'impossible', why: tg.conflict }` (exactly these two keys) and runs no simulation. This covers an empty mix (`Add at least one crop with blocks.`), an unknown crop (`Unknown crop: <crop>.`) and crops without a common range.

## 4. Targets and controller settings

### 4.1 Targets per stage

| Stage | `spT` (°C) | `spRH` (% RH) | `co2Lim` (ppm) | Used by |
|---|---|---|---|---|
| `fruiting` | `tg.spT` | `tg.spRH` | `tg.co2Lim` | The controller (section 4.3) and the scoring |
| `spawn`, `pinning`, `rest` | `profileTargets(tg.crop, stage).spT` | `.spRH` | `.co2Lim` | The controller (its own stage program) and the scoring |

`tg.crop` is the most CO₂-sensitive crop of the mix (as `commonTargets` picks it). The controller runs that crop's stage program. For every stage the segment also carries `coreMax = CROPS[tg.crop].limits.coreMax` and the spawn rule uses `coreTarget = CROPS[tg.crop].coreTarget`.

### 4.2 Settings for the run (`cfg`), in order

| Step | Action |
|---|---|
| 1 | `opts.settings` given: `imp = CC.importSettings(CC.exportSettings(opts.settings))`; `cfg = imp.settings`; `warnings = imp.warnings`. Not given: `cfg = CC.defaultSettings()`; `warnings = []`. |
| 2 | `farmType = cfg.farmType` (`'full'` or `'ready'`; `importSettings` guarantees one of the two). `S = CC.FARM_TYPES[farmType].stages`. |
| 3 | Whole numbers: each of `cfg.program.days.spawn`, `.pinning`, `.fruiting`, `.rest` and `cfg.program.flushes` becomes `Math.max(1, Math.round(value))`. (`importSettings` holds them inside their limits but allows fractions.) |
| 4 | Forced keys: `cfg.crop = tg.crop`; `cfg.stage = S[0]`; `cfg.program.auto = false` (it becomes `true` at day 0, section 7.2); `cfg.program.harvest.on = false` (harvest windows lower RH on purpose); `cfg.offsets = { T: 0, RH: 0, CO2: 0 }` (the simulated sensors have no error to correct); `cfg.manual.ac.auto`, `cfg.manual.hu.auto`, `cfg.manual.fan.auto`, `cfg.manual.lights.auto`, `cfg.manual.circ.auto` all `true` (the cycle tests automatic control). |
| 5 | `CC.applyProfile(cfg)` (targets of `tg.crop` and `S[0]` at once, no ramp). |
| 6 | `S[0] === 'fruiting'` (farm type `ready`): `cfg.spT = tg.spT`; `cfg.spRH = tg.spRH`. |
| 7 | Every other key (rules switches, protection times, `humMode`, `sensorMode`, `circ`, lights, `rampH`, `coreControl`, …) stays as `cfg` has it. |

### 4.3 Fruiting runs at the common targets

The controller's stage program sets the profile targets of `tg.crop` on each stage change, and again when a cold shock ends (section 5.2). For fruiting, `cycle.js` replaces the temperature and humidity targets with the common ones at these patch points, after the controller's `update` of the reading (section 8.1, step 4):

| Patch point | When |
|---|---|
| Segment start | The first scored reading of every fruiting segment |
| Shock end | A later scored reading of a fruiting segment at which the controller ended a cold shock: `ctl.state.stage.shock` was not `null` after the previous scored reading and is `null` now. The controller has then built a fresh ramp to `profileTargets(crop, 'fruiting')` (`ctl.state.stage.ramp.t0 === r.t`) or, with `rampH = 0`, set `cfg` to those targets, so the earlier patch is gone. |

| Case at a patch point | Action |
|---|---|
| A cold shock runs (`ctl.state.stage.shock` is not `null`) | Only humidity: `ramp.to.spRH = tg.spRH` when a ramp runs, else `cfg.spRH = tg.spRH`. The shock temperature stays (the controller's deliberate cold shock). |
| A ramp runs (`ctl.state.stage.ramp` is not `null`) | `ramp.to.spT = tg.spT`; `ramp.to.spRH = tg.spRH` (the ramp then ends at the common targets) |
| No ramp (`rampH = 0`, or the first segment of `ready`) | `cfg.spT = tg.spT`; `cfg.spRH = tg.spRH` |

The rows are checked in this order; the first that applies is used.

`co2Lim` needs no change: `tg.co2Lim` is `tg.crop`'s own fruiting limit. For a single-crop mix the replacement changes nothing.

## 5. The program (stages and days)

### 5.1 Total days

| Farm type | `D` = `cycleDays(farmType, program)` | Defaults (`days` 21/4/7/10, `flushes` 4) |
|---|---|---|
| `full` | `days.spawn + days.pinning + flushes × days.fruiting + (flushes − 1) × days.rest` | 21 + 4 + 28 + 30 = **83** |
| `ready` | `flushes × days.fruiting + (flushes − 1) × days.rest` | 28 + 30 = **58** |

`cycleDays` rounds the same way as section 4.2 step 3 before adding.

### 5.2 Segments

A segment is one stage occurrence with its flush number, as `ctl.programStatus(t)` reports them (`stage`, `flush`). The controller changes the stage itself (`program.auto = true`) after the set days; the cycle ends at the end of the last fruiting, before the last rest.

| Farm type | Segment order (`stage` flush), `N = flushes` | Count |
|---|---|---|
| `full` | `spawn` 1, `pinning` 1, `fruiting` 1, `rest` 1, `fruiting` 2, `rest` 2, …, `rest` N−1, `fruiting` N | 2N + 1 |
| `ready` | `fruiting` 1, `rest` 1, `fruiting` 2, …, `rest` N−1, `fruiting` N | 2N − 1 |

| Rule | Detail |
|---|---|
| Flush numbers | The controller's count: `spawn` and `pinning` carry flush 1; `rest` k follows `fruiting` k; the flush number rises when `rest` changes to `fruiting`. |
| Boundaries | Stage changes fall on whole days after day 0: segment `startDay` values are whole numbers and each segment lasts exactly its program days. |
| A new segment starts | At the first scored reading whose (`stage`, `flush`) from `ctl.programStatus(r.t)` (after the controller's `update` of that reading) differs from the open segment's. The reading at a boundary belongs to the new segment. |
| End | The reading at `END` (section 7.1) is where the controller leaves the last fruiting (it changes to `rest` and raises `blocksDone`). That reading is not scored; it only closes the last hour's energy (section 10). |
| Block stage | `e.blockStage = cfg.stage` before every simulation step (as `app.js` `tick`), so the blocks' CO₂ and heat follow the controller's stage (`PLANT.blockStage`: spawn 1.3, pinning 1.0, fruiting 1.0, rest 0.6). |
| Ramps | The controller's ramp (`rampH`, default 4 h) after each stage change is part of the segment and is scored against the new stage's targets. |
| Cold shock | No crop in `CROPS` has the `shock` flag today, so this row is not tested. If one is added: the controller applies a shock at pinning **and at every new flush** (`rest` → `fruiting`, `controller.js` line 247). The shock hours count against the targets of the segment they fall in (pinning or fruiting). In fruiting, section 4.3 keeps the shock temperature and patches again when the shock ends. |

## 6. Weather sequence

| Item | Rule |
|---|---|
| Source | `DESIGN_DAYS[region].days`, three design days: index 0 hot-dry, 1 hot-humid, 2 mild/rainy (24 hourly `T`, `RH` each) |
| Warm-up | One day before day 0, using `days[0]`. Not scored, no Progress. |
| Day k (k = 0 … D − 1) | `days[k % 3]`: day 0 hot-dry, day 1 hot-humid, day 2 rainy, day 3 hot-dry, … |
| Series | `e.weatherSeries` = for j = 0 … D (j = 0 is the warm-up, j ≥ 1 is day j − 1) and h = 0 … 23: `{ t: (j × 24 + h) × 3600, T: day.T[h], RH: day.RH[h] }`; then one closing point `{ t: (D + 1) × 86400, T: days[D % 3].T[0], RH: days[D % 3].RH[0] }` |
| Clock | `e.startHour = 0`, so simulation time `t` = 0 is 00:00 of the warm-up day, and day k starts at `t = (k + 1) × 86400` |
| Window | `sim.js` `weather(t)` searches `e.weatherSeries` from its start on every step (`findIndex`), which makes long programs slower per day. So `full` = the series above is built once, and at the start of each simulated day `j` = 0 … D (j = 0 is the warm-up; section 7.2 row 2) `e.weatherSeries = full.slice(Math.max(0, 24 × j − 1), 24 × (j + 1) + 2)`: the point one hour before the day start, the day's 24 points, the point at the day end and the one after it (the slice stops at the closing point on the last day). Every time `t` at which the simulation reads the weather during that day lies in `[24 × j × 3600, 24 × (j + 1) × 3600]`, so `findIndex` finds the same two points `a`, `b` as in the whole series, and the point before the day start keeps the interpolation `a + (b − a) × f` exact at the boundary (`f = 1`). The Result is deep-equal to a run on the whole series (verified on the draft: `SHORT_FULL`, the mix of test M1 and the full default cycle). `opts.fullWeather === true` skips the window (tests only). |

## 7. Simulation

### 7.1 Setup, in order

| Step | Action |
|---|---|
| 1 | `n = Math.max(1, Math.round(Σ blocks of the counted rows))` (a mix such as `[{ crop: 'oyster', blocks: 0.4 }]` passes `commonTargets` but rounds to 0; it runs with 1 block, so `rmPerBlock` stays finite); `c = CAP.mixCo2(room, mix)` (mL/h per block) |
| 2 | `e = structuredClone(SIM.DEFAULT_ENV)`; `Object.assign(e, { startHour: 0, blocks: n, co2PerBlock: c, blockStage: S[0], vent: room.vent \|\| e.vent, noise: false, sensorQuality: 'ideal', harvestDoors: false, randomWeather: false, dailyCycle: false })`; `e.room = CAP.roomOf(room)`; revision 2: when `room.plant != null`, `e.plant = structuredClone(room.plant)` (`roomOf` lays `plant.room` under the calibration, C8 5.2); `full` = the weather series of section 6; `e.weatherSeries = full` (the loop replaces it with the day's window unless `opts.fullWeather`). Every other `DEFAULT_ENV` key stays (`probe: true`, `sensorPeriod: 30`, sensor positions, `vent` positions). |
| 3 | `sim = SIM.create(e)`; `sim.setRoom({ T, RH, CO2 })` with the targets of `S[0]` (section 4.1): `T = spT`, `RH = spRH`, `CO2 = co2Lim − 200` |
| 4 | `ctl = CC.create(cfg, null, null)` |
| 5 | `sio = RT.simIO(sim)`; `io = { ...sio, read: () => { const r = sio.read(); return r && { ...r, CO2: r.CO2 + (r.seq % 2) * 1e-6 }; } }`. A noise-free CO₂ can sit at one exact value, which the controller's frozen-sensor check calls a fault; the change is far below a sensor's resolution (copied from `capacity.js` `trial`). |
| 6 | `rt = RT.createRuntime({ io, ctl, onReading })` with the handler of section 8.1 |
| 7 | `W = 86400` (start of day 0); `END = W + D × 86400` |

### 7.2 Loop

| Step | Action |
|---|---|
| 1 | `rt.poll()` once (the reading at `t = 0`, warm-up) |
| 2 | For `day = −1` (warm-up), `0`, …, `D − 1`: unless `opts.fullWeather`, set the day's weather window (section 6, `j = day + 1`). Then repeat `86400 / DT` (8640) times, `i = 0 … 8639`: if `i === 8639`: `daySeg = ` the open segment (section 11); `e.blockStage = cfg.stage`; `io.advance(DT)`; if day 0 has not started and `io.read().t >= W`: start day 0 (row 3); `rt.poll()`. After the 8640 steps of a `day ≥ 0`: `yield` the Progress of that day from `daySeg` (section 11). |
| 3 | Start of day 0 (once, before the poll that delivers the reading at `t = W`): `cfg.program.auto = true`; `ctl.setStage(S[0], W, false)` (the stage clock starts at `W`; no ramp); if `S[0] === 'fruiting'`: `cfg.spT = tg.spT`, `cfg.spRH = tg.spRH` |
| 4 | After the loop the simulation time is `END` and the last poll has handled the reading at `END`. Build and return the Result (section 12). |

Readings come every `sensorPeriod` = 30 s at exact multiples of 30 s, so every whole hour and every day boundary has a reading, and each scored day has 2880 readings.

## 8. Scoring

### 8.1 The reading handler `onReading(r)`

The runtime calls it after `ctl.update(r)` for each new reading. `v = sim.view()` (the real room air, not the sensor reading).

| Step | Action |
|---|---|
| 1 | `r.t < W`: return (warm-up). |
| 2 | Energy (section 10): `K = Σ Object.values(r.kwh)`; `hour = Math.floor((r.t − W) / 3600)`. If an hour is open and `hour` differs from it: close it with `kwh = K − k0`. If `r.t < END` and no hour `hour` is open: open it with `k0 = K`. |
| 2a | Revision 2, only with `opts.heat`, right after `hour` is computed and before an hour closes: `F = sim.heatJ()`; when a previous `F` exists, add `(F[k] − Fprev[k]) / 3600` to the open hour's `heat[k]` and to the open segment's `heat[k]` for each of the 13 keys; `Fprev = F`. The interval ending at a reading belongs to the hour and segment open before that reading, so a segment's `heat` equals the sum of its hours' `heat` (measured to 2e-8 Wh, C8 13.1). |
| 3 | `r.t >= END`: return. |
| 4 | `ps = ctl.programStatus(r.t)`. No open segment, or `ps.stage` / `ps.flush` differ from it: open a new segment (`startDay = (r.t − W) / 86400`, targets of section 4.1); if its stage is `fruiting`: section 4.3 (segment start). Otherwise, in a fruiting segment, at a shock end: section 4.3 (shock end). Then remember whether `ctl.state.stage.shock` is `null` for the next reading. |
| 5 | Count the reading in the open segment (section 8.2) and in the open hour (section 10). |
| 6 | Alarms (section 9). |

### 8.2 Counters per segment (one per scored reading)

`g` = the segment's targets; `BANDS = CC.BANDS` (`T` 1, `RH` 3, `RHAlarm` 8); `PASS = CAP.PASS` (`inT` 95, `rhOk` 90, `lowRhMin` 60, `wetRH` 95, `wetMax` 10, `co2Below` 98).

| Counter | Adds 1 when |
|---|---|
| `n` | Always |
| `inT` | `Math.abs(v.T − g.spT) <= BANDS.T`, or (spawn only) the reading is excused (row below) |
| excused (spawn only) | `cfg.program.coreControl` is true, `v.T < g.spT − BANDS.T`, and `v.core − coreTarget > v.T − g.spT` (the AC is cooling for the block core: the controller's own rule, which also stops its `tLo` alarm) |
| `tHi` | Not in `inT` and `v.T > g.spT` |
| `tLo` | Not in `inT` and `v.T <= g.spT` |
| `rhOk` | `v.RH >= g.spRH − BANDS.RH` |
| `lowRh` | `v.RH < g.spRH − BANDS.RHAlarm` |
| `wet` | `v.RH > wetLim` (revision 2): `wetLim = (CC.CROPS[tg.crop].wetRH && CC.CROPS[tg.crop].wetRH[stage]) ?? PASS.wetRH`, set once when the segment opens (an internal counter field, not part of the Segment). Only lion's mane sets `wetRH` (`{ pinning: 98 }`, lead decision 40); every other crop and stage uses 95. |
| `co2Below` | `v.CO2 <= g.co2Lim` |
| `maxCore` | Not a count: the largest `v.core` of the segment |

### 8.3 Segment values

| Field | Value | Unit |
|---|---|---|
| `inT` | `inT / n × 100` | % of readings |
| `rhOk` | `rhOk / n × 100` | % |
| `lowRhMin` | `lowRh / n × 1440` | minutes per day (average over the segment) |
| `wet` | `wet / n × 100` | % |
| `co2Below` | `co2Below / n × 100` | % |
| `maxCore` | largest block core | °C |

### 8.4 Pass rules

A segment passes when none of its judged rules fails. `fails` lists the failed rules' texts in this table's order.

| Rule | Fails when | Text | Judged in |
|---|---|---|---|
| Temperature | `inT < PASS.inT` | `temperature too high` when `tHi >= tLo`, else `temperature too low` | every stage |
| Humidity | `rhOk < PASS.rhOk` | `humidity too low` | pinning, fruiting, rest |
| Low humidity alarm | `lowRhMin > PASS.lowRhMin` | `humidity at the low alarm` | pinning, fruiting, rest |
| Wet | `wet > PASS.wetMax` (10 %; `wet` counted against the stage's wet line, 8.2) | `humidity near saturation` | pinning, fruiting, rest |
| CO₂ | `co2Below < PASS.co2Below` | `CO₂ above the limit` | pinning, fruiting, rest |
| Block core | `maxCore > coreMax` | `block core too hot` | spawn |

In the spawn run the bags are sealed: humidity and CO₂ are reported but not judged. The spawn excuse of section 8.2 is needed because the controller deliberately holds the air below the spawn target to keep the block core at `coreTarget` (measured on the draft: 2000 grey oyster blocks, air 20.4–23.2 °C against a 24 °C target, core at most 28.2 °C).

## 9. Alarms

| Rule | Detail |
|---|---|
| Source | `ctl.alarmList()` after each scored reading (step 6 of 8.1) |
| A raise | An alarm `a` with `a.active === true` and `a.since === r.t` (the controller stamps every raise with the reading time) |
| Count | `segment.alarms[a.id] += 1` (key created at 1). Ids are the controller's: `tHi`, `tLo`, `tCrop`, `coreHi`, `rhHi`, `rhLo`, `co2Hi`, `co2Safe`, `disagree`, `acTooSmall`, `sensor_<key>`, … |
| Not counted | Raises in the warm-up day, and `blocksDone` at `END` (not scored) |
| No alarm | `alarms` is `{}` |

## 10. Energy and the hourly series

| Item | Rule |
|---|---|
| Meter | `K = Σ Object.values(r.kwh)` (`ac`, `hu`, `fan`, `lights`, `circ`), cumulative kWh of the reading |
| Hour h (h = 0 … D × 24 − 1) | Opens at its first reading (`t = W + h × 3600`) with `k0 = K`; closes at the first reading of the next hour (the reading at `END` closes the last hour); `kwh = K(close) − k0` |
| Series entry | `{ h, stage, flush, T, RH, CO2, core, kwh }` (plus `heat` with `opts.heat`, 8.1 step 2a): `h` = hours from day 0; `stage`, `flush` = the segment of the hour's first reading; `T`, `RH`, `CO2`, `core` = means of `v.T`, `v.RH`, `v.CO2`, `v.core` over the hour's 120 readings; `kwh` as above |
| Segment `kwh` | Sum of its hours' `kwh` (in hour order) |
| Segment `rm` | `kwh × tariff` |
| Totals | `totals.kwh` = sum of the segments' `kwh`; `totals.rm` = sum of the segments' `rm` (both in segment order) |

## 11. Progress object

One per simulated day (not for the warm-up day), yielded after the day's 8640 steps.

The 8640th step of loop day `day` (section 7.2, 0 … D − 1) lands exactly on the next day's start (`W + (day + 1) × 86400`), so the day's last `rt.poll()` already handles the **next** day's first reading, and at a stage boundary that reading opens the next segment. The open segment after the loop is therefore one day early at every boundary. `stage` and `flush` come from `daySeg`, the segment captured before the day's last step (section 7.2 row 2).

| Field | Type | Value |
|---|---|---|
| `day` | integer | Days done: 1 … `days` |
| `days` | integer | `D` |
| `stage` | string | The stage of the day just simulated: the segment of the reading at `t = W + day × 86400 − sensorPeriod` (`day` = this Progress's `day`, 1 … D; `sensorPeriod` = 30 s), the last reading inside that day. The reading at the day's end boundary belongs to the next day. (`spawn`, `pinning`, `fruiting`, `rest`) |
| `flush` | integer | That segment's flush number |

## 12. Result object

### 12.1 Impossible mix

`{ verdict: 'impossible', why }`: exactly these two keys. `why` is `commonTargets(mix).conflict`.

### 12.2 A run

| Field | Type | Value |
|---|---|---|
| `verdict` | `'ok'` | The simulation ran (whether it passed is `totals.pass`) |
| `targets` | `{ spT, spRH, co2Lim, crop }` | `commonTargets(mix)` |
| `inputs` | object | Table 12.3 |
| `stages` | `Segment[]` | In time order (table 12.4) |
| `totals` | object | Table 12.5 |
| `series` | `Hour[]` | Length `D × 24`, `series[i].h === i` (section 10) |

### 12.3 `inputs`

| Field | Type | Value |
|---|---|---|
| `farmType` | `'full'` \| `'ready'` | From the settings |
| `days` | `{ spawn, pinning, fruiting, rest }` | Days per stage after rounding (all four, also for `ready`) |
| `flushes` | integer | After rounding |
| `region` | string | `region` of section 3 row 5 (`opts.region \|\| 'my-lowland'`) |
| `blocks` | integer | `n` (section 7.1; at least 1) |
| `co2PerBlock` | number | `c` (section 7.1), mL/h |
| `tariff` | number | RM per kWh |
| `warnings` | string[] | `importSettings` warnings (`[]` without `opts.settings`) |

### 12.4 Segment

| Field | Type | Value |
|---|---|---|
| `stage` | string | `spawn`, `pinning`, `fruiting`, `rest` |
| `flush` | integer | Section 5.2 |
| `startDay` | integer | Day of the segment's first reading (day 0 = first scored day) |
| `days` | integer | `n / 2880` |
| `hours` | integer | `days × 24` |
| `targets` | `{ spT, spRH, co2Lim, coreMax }` | Section 4.1 |
| `inT`, `rhOk`, `lowRhMin`, `wet`, `co2Below`, `maxCore` | number | Section 8.3 |
| `alarms` | `{ [id]: count }` | Section 9 |
| `kwh` | number | Section 10 |
| `rm` | number | Section 10 |
| `fails` | string[] | Section 8.4 |
| `pass` | boolean | `fails.length === 0` |
| `heat` | object (revision 2, only with `opts.heat`) | The 13 heat flows of C8 5.1.2 summed over the segment, Wh (8.1 step 2a) |

### 12.5 `totals`

| Field | Type | Value |
|---|---|---|
| `days` | integer | `D` |
| `kwh` | number | Section 10 |
| `rm` | number | Section 10 |
| `rmPerBlock` | number | `rm / n` (`n ≥ 1`, section 7.1) |
| `pass` | boolean | Every segment passes |

### 12.6 Example (defaults, draft measurement, not binding)

2000 grey oyster, default room (`{ volume: 60, vent: 'supply', calib: null }`), default settings, `my-lowland`: 83 days, 9 segments, about 4.1 s in Node 22.20 with the weather window (5.6 s on the whole series; same Result).

| Segment | `inT` | `rhOk` | `co2Below` | `maxCore` | `alarms` | ≈ kWh | Pass |
|---|---|---|---|---|---|---|---|
| spawn 1 (21 d) | 100 (99.8 excused) | 6.2 (not judged) | 100 | 28.2 | – | 227 | yes |
| pinning 1 (4 d) | 99.2 | 96.3 | 99.3 | 28.1 | `tLo` 1, `sensor_RH` 1 | 77 | yes |
| fruiting 1–4 (7 d each) | 99.6–100 | 99.4–100 | 99.9–100 | 27.4 | 0–1 `rhHi` | 97–103 | yes |
| rest 1–3 (10 d each) | 100 | 100 | 100 | 27.4 | – | 67–70 | yes |

The `sensor_RH` alarm in pinning is the controller's response check ("does not respond to its machine"), not a frozen value; it is real controller behaviour in this simulation and is reported as is. 6000 grey oyster, farm type `ready`: each fruiting segment fails with `temperature too high` (`inT` 72–79 %, `acTooSmall` 4–5 raises); the rest segments pass.

## 13. What `cycle.js` uses

### 13.1 Calls into the shared modules (checked against the files on `master`, 2026-10-08)

| Module | Name | Where it is | Used for |
|---|---|---|---|
| `capacity.js` | `ClimateCapacity.commonTargets(mix)` | line 51, exported line 325 | Targets, impossible mix |
| `capacity.js` | `ClimateCapacity.DESIGN_DAYS` | line 43, exported | Weather |
| `capacity.js` | `ClimateCapacity.PASS` | line 25, exported | Pass thresholds |
| `capacity.js` | `ClimateCapacity.mixCo2(room, mix)` | line 77; **export added** (13.2) | CO₂ per block |
| `capacity.js` | `ClimateCapacity.roomOf(room)` | line 83; **export added** (13.2) | Room physics for `e.room` |
| `controller.js` | `ClimateController.defaultSettings()` | line 165, exported line 976 | Settings without `opts.settings` |
| `controller.js` | `ClimateController.exportSettings(cfg)` | line 927, exported | Wraps `opts.settings` in the file format `importSettings` expects |
| `controller.js` | `ClimateController.importSettings(file)` | line 932, exported | Validates `opts.settings` (lead decision 6) |
| `controller.js` | `ClimateController.applyProfile(cfg)` | line 188, exported | First stage targets |
| `controller.js` | `ClimateController.profileTargets(crop, stage)` | line 161, exported | Targets of spawn, pinning, rest |
| `controller.js` | `ClimateController.create(cfg, snapshot, onEvent)` | line 210, exported | The controller |
| `controller.js` | `ClimateController.FARM_TYPES`, `CROPS`, `BANDS` | lines 74, 47, 85, exported | Stage lists, crop limits, bands |
| `controller.js` | `ctl.setStage(stage, t, ramp)` | line 236, returned line 903 | Start of day 0 |
| `controller.js` | `ctl.programStatus(t)` | line 324, returned line 903 | Segment stage and flush |
| `controller.js` | `ctl.alarmList()` | line 439, returned line 903 | Alarm raises |
| `controller.js` | `ctl.state` (getter: `stage.ramp`) | returned line 903 | Section 4.3 |
| `controller.js` | `ctl.update(r)` | returned line 903 | Called by the runtime only |
| `sim.js` | `ClimateSim.create(env)`, `ClimateSim.DEFAULT_ENV` | lines 93, 69, exported line 421 | The simulated room |
| `sim.js` | `sim.setRoom({ T, RH, CO2 })`, `sim.view()`, `sim.read()` | lines 404, 388, 382, returned | Start state, scoring, (via `simIO`) readings |
| `runtime.js` | `ClimateRuntime.simIO(sim)` → `read`, `write`, `advance(dt)` | line 33, exported line 43 | Adapter |
| `runtime.js` | `ClimateRuntime.createRuntime({ io, ctl, onReading })` → `poll()` | line 16, exported | The control loop |

### 13.2 Change to `capacity.js`

| Before | After |
|---|---|
| `global.ClimateCapacity = { commonTargets, balance, trial, calibStatus, verdictOf, checkSteps, check, checkAsync, DESIGN_DAYS, PASS, VERDICT, SEARCH };` | The same object with `mixCo2, roomOf` added. No other line changes; `tests/capacity.test.js` stays green unchanged. |

## 14. Tests (`tests/cycle.test.js`)

The work brief lists them with exact inputs. Required coverage:

| # | Test |
|---|---|
| 1 | `capacity.js` exports `mixCo2` and `roomOf` |
| 2 | Input errors of section 3, each with its exact error, including `region: 'toString'` |
| 3 | An impossible mix returns `{ verdict: 'impossible', why }` with no Progress and no simulation |
| 4 | `cycleDays` for `full` and `ready` (defaults 83 and 58) |
| 5 | Stage order, `startDay`, `days`, `hours` for `full` and `ready` |
| 6 | `series.length === totals.days × 24`; each entry's `stage` and `flush` match its segment |
| 7 | `totals.kwh`, `totals.rm` equal the sums over the segments; the segments' `kwh` equal the sums over their hours |
| 8 | Deterministic: two runs deep-equal |
| 9 | Progress: `D` yields, `day` 1 … D, each day's `stage` and `flush` equal to the segment that holds that day (not one day early); `runCycle` and `runCycleAsync` call `onProgress` D times and give a deep-equal Result |
| 10 | Forced settings: `crop`, `stage` of `opts.settings` do not change the run; fractional days are rounded |
| 11 | A mix runs fruiting at the common targets (also after a ramp from rest) |
| 12 | Sensible case: 2000 grey oyster, default room and settings: every fruiting segment and the spawn segment pass |
| 13 | Dense case: 6000 grey oyster fails fruiting with `temperature too high` |
| 14 | Speed: the default full cycle within 60 s (time logged) |
| 15 | No frozen-CO₂ false alarm: no segment counts `sensor_CO2` in a nearly empty room |
| 16 | Weather window: a run with `opts.fullWeather: true` deep-strict-equals the windowed run (`SHORT_FULL`) |
| 17 | A mix that rounds to 0 blocks (`blocks: 0.4`) runs with `inputs.blocks === 1` and a finite `totals.rmPerBlock` |
| 18 | Revision 2: `room.plant: 5` → `runCycle: plant must be an object`; `plant: null` is accepted; `room.plant = ClimateEquipment.plantOf(DEFAULTS, room)` gives a deep-equal Result (`SHORT_FULL`) |
| 19 | Revision 2: a `plant` with `ac.capW` 2640 lowers each fruiting segment's `inT` (4000 grey oyster, `ready`) |
| 20 | Revision 2: `opts.heat: true` adds `heat` with exactly the 13 keys to every segment and hour; a segment's `heat` equals the sum of its hours' (1e-6); removing every `heat` key gives the Result without `opts.heat`; without `opts.heat` no `heat` key anywhere |
| 21 | Revision 2: a short lion's mane cycle scores pinning `wet` against 98 %: lower than the same run with `wetRH` removed, and without `humidity near saturation` in pinning; spawn and fruiting segments deep-equal |

## 15. Not in this contract

| Item | Where |
|---|---|
| Page, buttons, charts of the cycle | The Simulate tab (C5 3.10) |
| Saving results (database table, API route) | C1 6.13 (`simulation_runs`), C3 6.20–6.24 |
| Predicted-versus-real comparison and calibration from it | The Calibrate tab (C5 3.11); it reads `series` |
| A room's machines | C8 (`room.plant`, revision 2) |
| Random weather, sensor noise | Not modelled here |
| Batches of blocks with their own dates | Sub-project 2 (batches and stages) |

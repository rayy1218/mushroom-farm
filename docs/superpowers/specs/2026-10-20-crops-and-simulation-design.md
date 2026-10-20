# Crops, stage program and room simulation runs (iteration 8)

Date: 2026-10-20 · Branch `v2` · Builds on iterations 4 (simulation model), 5–6 (controller, safety) and 7 (energy and water).

The owner asked (2026-10-20): on the Rooms list, beside **Edit**, a **Simulate** button that opens a stepper asking for the wall heat transfer, the outdoor day high, night low and dew point, the sun on the roof, the fan flow, the aircon and the humidifier, then the crops in the room; the simulation runs in the background and reports the band charts, the time in band (%), the energy and the water. Mid-way the owner added: build what it needs, the crop list, the room's crop and stage and the stage program. The owner does not want design questions: the lead chose every default (marked *default*). v1 code it follows: `controller.js` on `master` (CROPS, STAGES, FARM_TYPES, defaultProgram, defaultRules, setStage, program).

## 1. Scope

| In | Out (later) |
|---|---|
| A crop list (the 8 tropical crops of v1 and lion's mane as a draft) with targets per stage | Batches, harvest, cost per block or kg |
| Each room's crops (crop + blocks, several crops in one room) and its stage | Lights, harvest windows, cold shock, casing steps (v1 extras) |
| The stage program: days per stage, flushes, slow change of the bands (ramp), automatic stage change | Using the outdoor air in control |
| The room bands follow the crops and the stage (they can still be changed by hand) | |
| Simulation runs of a room: stepper on the Rooms list, a background job, a results page, runs kept in the database | Comparing two runs side by side |

## 2. Crop list (`web/crops.js`, pure, imported by the server and the page)

| Item | Rule |
|---|---|
| Crops | v1's list, same keys and numbers: `oyster` Grey oyster, `black` Black oyster, `pink` Pink oyster, `abalone` Abalone oyster, `golden` Golden oyster, `woodear` Black jelly (wood ear), `reishi` Reishi (lingzhi), `milky` Milky (Calocybe indica), `lionsmane` Lion's mane (draft, `cool: true`: needs an insulated room and a larger aircon) |
| Targets | per stage `[T °C, RH %, CO₂ limit ppm]`: `spawn`, `pinning`, `fruiting`, `rest` (v1 numbers) |
| Range | each crop's good fruiting range `{ T: [lo, hi], RH: [lo, hi] }` (v1), used for the "outside the crop's range" warning |
| Stages | `spawn` Spawn run, `pinning` Pinning, `fruiting` Fruiting, `rest` Rest between flushes |
| Farm types | `full` Full cycle (spawn → pinning → fruiting ⇄ rest), `ready` Ready-to-fruit blocks (fruiting ⇄ rest) *default `ready`*: most Malaysian farms buy colonised blocks |
| Bands of one crop and stage | `tLow` = T − 1, `tHigh` = T + 1; `rhLow` = RH − 3, `rhHigh` = min(100, RH + 3); `co2High` = limit − 100, `co2Low` = max(450, min(limit − 150, max(600, limit − 300))), `co2Safety` = limit + 500 (v1's fanOn, fanOff and co2SafetyAt) |
| Bands of a mix | per value the overlap: low = the highest low, high = the lowest high; the CO₂ band and the safety level come from the crop with the lowest CO₂ limit. When a temperature or humidity overlap is empty: the blocks-weighted average target ± the one-crop half width, and a warning "Grey oyster and Milky do not fit one temperature band" |
| Functions | `CROPS`, `STAGES`, `FARM_TYPES`, `cropBands(crop, stage)`, `mixBands(crops, stage)` → `{ bands, warnings }` (`crops` = `[{ crop, blocks }]`, `bands` = `{ co2Low, co2High, co2Safety, tLow, tHigh, rhLow, rhHigh }`), `rangeWarnings(crops, bands)` → texts like "Temperature band 21–23 °C is outside Pink oyster's range 24–29 °C", `validateCrops(list)` → `{ error, field } \| null` (1 to 9 rows, known crop keys, each once, blocks a whole number 1–100 000) |
| CO₂ per block | 60 mL/h for every crop *default* (the sim's default; no per-crop data yet) |

## 3. Room crops and stage program

### 3.1 Stored per room (table `room_programs`, upgrade 11)

| Field | Default | Rule |
|---|---|---|
| `crops` | `[]` (table `room_crops`: room_id, crop, blocks) | `validateCrops`; `[]` = no crop: the program does nothing and the bands are only set by hand |
| `farmType` | `ready` | `full` or `ready` |
| `stage` | `fruiting` | one of the farm type's stages |
| `stageSince` | when set | ms |
| `flush` | 1 | 1–`flushes`; counts fruiting stages |
| `flushes` | 4 | whole number 1–10 |
| `days` | spawn 21, pinning 4, fruiting 7, rest 10 | whole numbers 1–90 each |
| `rampH` | 4 | 0–48 h; 0 = the new bands at once |
| `autoAdvance` | true | the next stage starts after its days |
| `ramp` | null | `{ from: bands, to: bands, startAt, endAt }` while the bands move |
| `done` | false | true after the last flush's fruiting: the room stays in rest, "Flush 4 of 4 done: replace the blocks" |

### 3.2 Pure program (`server/program.js`)

| Function | Rule |
|---|---|
| `nextStage(p)` | `full`: spawn → pinning → fruiting; `ready` and `full`: fruiting → rest (flush stays), rest → fruiting with flush + 1; after the fruiting of the last flush → rest with `done` true; in rest with `done` nothing follows (null) |
| `stageEndsAt(p)` | `stageSince + days[stage]` days, or null (auto off, done, no crops) |
| `startStage(p, stage, now, currentBands, { ramp = true })` | → new program: stage, `stageSince = now`, `ramp` from `currentBands` to `mixBands(crops, stage).bands` over `rampH` (none when `rampH` 0 or `ramp` false); a lower CO₂ upper limit (and its lower limit and safety level) takes effect at once, not over the ramp (v1) |
| `bandsAt(p, now)` | the ramp interpolated (T 0.1 °C, RH 1 %, CO₂ 10 ppm steps; `co2Safety` above `co2High`), or `ramp.to` after `endAt`, or null without a ramp |
| `advance(p, now, currentBands)` | applies every stage change that is due (several when a long time passed, e.g. the simulation) → `{ program, changed: [{ stage, flush, at }], bands }`; a change at `stageEndsAt`, not at `now`; `bands` = what the room's bands should be now (null without a ramp); an ended ramp is dropped after its target is returned |
| `programDays(p, stage, flush)` | days from the start of a stage to the end of the last flush's rest |
| `validateProgram(p)` | `{ error, field } \| null` for a whole program |

### 3.3 Live rooms

| Item | Rule |
|---|---|
| When it runs | the controller's run, every cycle, for every room with crops (auto on or off): `advance`, then during a ramp the room's control bands are set to `bandsAt` (only when they differ) |
| Setting crops or stage | `PUT /api/rooms/:id/crop` with a new `stage`, or crops for a room without crops, starts that stage now (`startStage` with ramp; `applyNow: true` skips the ramp); changing only the blocks or the program numbers keeps the stage and the bands |
| A hand change of a band | `PUT /api/rooms/:id/control` with any band field ends a running ramp (v1: a person's change wins) |
| Alarm | `blocksDone` warning "Flush 4 of 4 done: replace the blocks", cleared when the stage or the crops are set again |

### 3.4 API

| Route | Reply |
|---|---|
| `GET /api/rooms/:id/crop` | `{ crops, farmType, stage, stageSince, flush, flushes, days, rampH, autoAdvance, done, ramp: { to, endAt } \| null, nextStage: { stage, flush, at } \| null, targets: { bands, warnings } \| null }` (`targets` = `mixBands` of the stage, null without crops) |
| `PUT /api/rooms/:id/crop` | any of `crops`, `farmType`, `stage`, `flushes`, `days` (partial: the given stages), `rampH`, `autoAdvance`, `applyNow`; replies like GET; 400 `{ error, field }` (`crops`, `stage`, …); a stage that is not in the farm type: "Stage must be one of fruiting, rest" |

### 3.5 Room page

A **Crop and stage** card above Automatic control: the crops (crop + blocks rows, Add crop, remove), the farm type, the stage with "since 20 Oct 10:42 · day 3 of 7 · flush 1 of 4", "Next: Rest between flushes, about 27 Oct 10:42", the ramp line "Bands moving to fruiting, ready about 14:42", warnings, a **Start stage** select + button, the program numbers in a collapsed **Program** section, Save. Without crops: "No crop set: the bands are set by hand" and an Add crop button.

## 4. Simulation runs

### 4.1 Stepper (Rooms list, **Simulate** beside Edit; a `<dialog>`)

| Step | Fields (prefill: the room's last run, else the default) |
|---|---|
| 1 Room and machines | Wall heat transfer (W/K, 80), Outdoor day high (°C, 33), Outdoor night low (25), Outdoor dew point (24), Sun on the roof (W, 300), Fan flow (m³/h, 600), Aircon (BTU/h, 12 000), Humidifier output (L/h, the room's rating, 2); the room's size is shown, not asked |
| 2 Crops | crop + blocks rows (prefill: the room's crops, else Grey oyster 500), farm type, start stage (the room's, else fruiting); the bands of the mix and its warnings |
| 3 Run | how long: 7 days *default*, or **Whole program** (`programDays` from the start stage, e.g. 68 days for ready-to-fruit fruiting with 4 flushes), whole number 1–90 days; a summary of steps 1–2; **Run simulation** |

Back/Next keep the values; each step checks its fields like the server (errors under the field) before Next. After Run the dialog shows "Running… 35 %" with the step's progress and **Open results** (the results page) and may be closed; the run goes on in the background.

### 4.2 Run (server, `server/simulate.js` pure + `server/simulate-worker.js` + jobs in `server/simulations.js`)

| Item | Rule |
|---|---|
| Model | `device/sim-model.js` `step` and `outdoorAt`, the room's volume, the inputs of step 1, blocks = the sum of the crops, CO₂ per block 60 mL/h |
| Control | `decide` + `protect` of `server/controller.js` with the room's control settings at the start of the run (fresh air, time limit, aircon drop, aircon fan, humidifier during exchange; the CO₂ safety level comes from the crops' bands, like a live room with crops); the bands from the program: `mixBands` of the start stage, then `advance` and `bandsAt` like a live room, `autoAdvance` on, the room's program numbers (else the defaults) |
| Sensors and machines | ideal (no faults, machines follow at once) |
| Time step | 10 s *default* (the controller decides every step) |
| Start | 00:00 of simulated day 1; the room starts inside its bands: T and RH at the band middle, CO₂ 420, the mass at T, the surfaces at the air's RH *default* (no pull-down from outdoor air counted) |
| Time in band | over every step: T in [tLow, tHigh], RH in [rhLow, rhHigh], CO₂ ≤ co2High (low CO₂ is good), and all three; the bands of that moment |
| Energy | each relay machine: its rated W (room ratings) × on time; the aircon: its input at full load from the size of step 1 (BTU/h ÷ 3412 ÷ COP 3, about EER 10; not the room's rating, which is for the unit it has now) × the share of its present capacity it delivers, at least 5 % while on (its fan); by machine and total kWh, cost with the electricity price of Settings |
| Water | the humidifier's water put into the air (L), cost with the water price of Settings when there is one |
| Speed | in a worker thread; one run at a time, others wait (`queued`); progress posted at least every 1 % |
| Restart | a run still `running` or `queued` when the server starts becomes `failed` "Stopped by a restart of the farm app" |

### 4.3 Result

| Part | Shape |
|---|---|
| `series` | every 5 min: `{ s, t, rh, co2, outT, outRH, tLow, tHigh, rhLow, rhHigh, co2Low, co2High, stage }` (`s` = seconds from the start) |
| `machines` | `{ intake, exhaust, circulation, humidifier: [{ from, to }], ac: [{ from, to, setpoint }] }` in seconds (on spans; the aircon split at each setpoint change) |
| `stages` | `[{ stage, flush, from, to }]` (seconds) |
| `summary` | `{ days, inBand: { t, rh, co2, all }, perStage: [{ stage, flush, from, to, inBand }], energy: { byMachine: { intake, exhaust, circulation, humidifier, ac }, kWh, cost }, water: { litres, cost }, perDay: [{ day, kWh, litres }], extremes: { tMin, tMax, rhMin, rhMax, co2Max } }` (percent with one decimal; cost null without a price) |

### 4.4 Storage (table `simulation_runs`, upgrade 11) and API

| Column / route | Rule |
|---|---|
| `simulation_runs` | `id, room_id, created_at, status ('queued','running','done','failed'), progress REAL 0–1, input TEXT (JSON), result TEXT (JSON, null until done), error TEXT, finished_at`; deleting the room deletes its runs; at most 20 runs per room are kept (the oldest finished ones go) |
| `POST /api/rooms/:id/simulations` | body `{ physics: { wallUA, outdoorHigh, outdoorLow, outdoorDew, sunW, fanFlow, acBTU, humidifierLH }, crops, farmType, stage, days }` → 202 the run without `result`; 400 `{ error, field }` (`physics.wallUA` style fields, limits of the device app's PARAMS; outdoor low ≤ high, dew ≤ low) |
| `days` | whole number 1–90 ("Days must be a whole number from 1 to 90", field `days`) |
| `GET /api/rooms/:id/simulations` | newest first, without `result` but with `summary` when done |
| `GET /api/simulations/:id` | the run with `result` |
| `DELETE /api/simulations/:id` | 204; a running run is stopped |

### 4.5 Results page `#/rooms/:id/simulations/:runId`

| Part | Content |
|---|---|
| Head | "Simulation of Room 1", the date, the inputs in one line, back to the room |
| While running | the progress bar, refreshed every 2 s |
| Time in band | tiles: Temperature, Humidity, CO₂, All three (%), and a per-stage table |
| Charts | temperature, humidity, CO₂ over the whole run with the band drawn as it moved (a band per time, not one value), the outdoor line dashed; the machine timeline under them; date ticks "day 1, day 2 …" |
| Energy and water | total kWh, RM, litres; by machine; per day bars |
| Room page | a **Simulations** card: the last runs (date, days, all-three %, kWh, L, status) linking to their pages, and a Simulate button (same stepper) |

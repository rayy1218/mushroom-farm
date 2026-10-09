# C8: Equipment check contract (`equipment.js`)

Date: 2026-10-08. Status: **frozen** (revision 2; change log in section 16). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md` (lead decisions 33–39 are C8's, 40–54 settle its open items). Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`. Wave 2 plan: `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md`. Work brief: `docs/superpowers/plans/2026-10-08-farm-foundation/equipment.md` (the lead prepares it in prep 2.0 from the reviewed draft; the Equipment stream commits it as a byte-for-byte copy, wave 2 plan section 8). Research: `docs/research/2026-10-08-lionsmane-research.md` ("lionsmane-research" below), `docs/research/2026-10-08-equipment-facts.md` ("equipment-facts" below). Prototype (measurement code, not part of the repo): `/home/foqcus/Documents/mushroom-farm-c8/proto/`. Frozen together with the room-centred amendments: C1 revision 5, C2 revision 8, C3 revision 8, C5/C6 revision 7, C7 revision 2; section 12 lists where each C8 part sits in them.

### Changes in revision 2

| Section | Change |
|---|---|
| Header, 12, 16 | Frozen by the lead together with the room-centred amendments. Every placeholder ("hook") of the drafts is filled in the other contracts; section 12 now says where. Paths point to the repo (`docs/research/`, the wave 2 plan). |
| 1 | Load order: at load `equipment.js` reads only `ClimateSim`; `ClimateController`, `ClimateCapacity` and `ClimateCycle` are read when `estimate` or a run function is called, because on the server it may load through `server/sim-adapter.js` before `capacity.js` and `cycle.js`. `web/settings-panel.js` is the Equipment stream's for the one `#inCrop` option (lead decision 47). |
| 4.5 | New rule: a calibration is fitted with the room's machines and the typical sun (`plantOf(eq, { volume, calib: {} })`), and records the machines it was fitted with (C1 `calibrations.equipment`, lead decision 50). |
| 7.4, 8.1, 8.2, 8.8, 11.2 | Lead decision 45: `noReserve` has a reason. `'largest'` (6 hp is the minimum) keeps "fix the room first"; `'too-big'` (the next size up failed as too big) says the size is just enough and no bigger size holds the room steadier. `ac.noReserve` in the Report; summary line 7 only for `'largest'`. |
| 8.5 | Lead decision 43: when the reference run is too wet (`wet` set), the walls and roof text adds ` An insulated room also needs drier fresh air.` |
| 8.6 | Lead decision 46: the wet text quotes each listed segment with its own limit. |
| 12.2 | Lead decision 54: `room_equipment` is in upgrade 2 with the other wave 2 schema changes; lead decision 50: `calibrations.equipment`. |
| 12.3 | `server/sim-adapter.js` requires `../sim.js`, `../runtime.js`, `../equipment.js` (only `plantOf` is used); C2 section 1 amended. Lead decision 48: the C2 equipment test is skipped while `plantOf` is the prep 2.0 stub. |
| 12.4 | `server/api.js` and `tests/room-rules.test.js` require order; `room-rules.js` reads `global.ClimateEquipment` at load; `checkCalibration` takes `equipment`. |
| 12.5 | Slot placement (its own grid item after the Result card, before Saved runs); new row 3.11 (Calibrate tab: `getEquipment`, `envBase.plant`, the stale-machines warning); fake API defaults. |
| 12.7 | Stub exports named (the stub's `plantOf` throws `Error('stub')`); gate 2.5 merges Data 2, Equipment, then Server 2; the card's headless check runs after gate 2.5, its fixes merge in wave 3 (lead decisions 48, 49). |
| 14 | Tests for the revision 2 texts. |
| 15 | Every open item decided (lead decisions 40–46). |

This contract defines `equipment.js`: a check that runs the C7 full crop cycle in one room with the farmer's own machines, then with other aircond sizes, and tells the farmer in plain words whether each machine is big enough, what to buy, and whether the money is better spent on the room (insulation, drier fresh air) than on a bigger aircond. It also defines the minimum changes to `sim.js`, `controller.js`, `capacity.js` and `cycle.js` that make a room's machines part of the simulation, measure where the heat comes from, and let a correctly sized lion's mane room with typical walls pass the whole cycle (13.3).

| Part of the owner's goal | Where |
|---|---|
| Save the farmer's real machines per room (aircond hp and units, fogger, fresh-air fan, walls and roof) | Section 4; database and routes in section 12 |
| Run a full lion's mane cycle in that room with those machines | Sections 5, 7 (C7 `runCycleSteps` with the room's `plant`) |
| Say bluntly when the aircond is too small and what to buy, with a margin for the hottest days | Sections 7.3, 7.4, 8.2 |
| A table of the aircond sizes tried (hours in band, electricity per block) | Section 11.3 |
| Verdicts for fogger, fresh-air fan and walls and roof | Sections 8.3–8.5 |
| Heat breakdown and "bigger aircond or fix the room" | Sections 5.1.2, 9, 8.7 |
| Lion's mane profile and the cold-room controller tuning | Section 5.4 |

### Lead decisions for C8 (binding; this contract implements them)

| Topic | Decision | Section |
|---|---|---|
| Room equipment | Saved per room: aircond size in hp from the Malaysian market list with the number of units, fogger output, fresh-air fan size, wall and roof construction (zinc, brick, EPS and PU panel 50/75/100 mm) giving the room's wall heat transfer (UA), or the calibrated `ua` when the room has an applied calibration. Today `PLANT` in `sim.js` is fixed for every room; C8 lets a room's machines override it without changing any existing caller, test or vector. | 4, 5.1 |
| Search | A quick heat balance picks a starting aircond size; the C7 full cycle confirms the sizes around it, stopping at the smallest size that holds the temperature; recommended = one market step above the minimum when the minimum has a thin margin (exact rule in 7.4). Every size run goes in the result table. | 6, 7 |
| Verdicts | Per machine: enough / too small (size to buy) / oversized; plus walls and roof. Exact message templates with placeholders. | 8 |
| Heat breakdown | Shares of the cooling load by source over the fruiting hours, measured inside the simulation (a read-only addition to `sim.js`). | 5.1.2, 9 |
| Lion's mane | Added to `CROPS` from the research profile (marked draft), with its own pinning wet line (`wetRH`, 98 %, from the sources' 90–100 % RH; lead decision 40); plus the cold-room controller tuning so a correctly sized room with typical walls passes the whole cycle (13.3; an insulated PU 50 room stays too wet in fruiting, section 15 item 11, lead decision 43); the cause of the earlier "humidity near saturation" failure found in the code and fixed. | 5.4, 13.2 |
| Where | New module `equipment.js` (browser and Node, global `ClimateEquipment`, the wrapper of `cycle.js`) plus minimum changes to `sim.js`, `controller.js`, `capacity.js`, `cycle.js`. It runs in the room's Simulate tab and in Node tests. The database, route, room manager and page parts are in C1 revision 5, C2 revision 8, C3 revision 8, C5/C6 revision 7 and C7 revision 2 (section 12 says where). | 1, 12 |

## 1. General rules

| Rule | Detail |
|---|---|
| File | `equipment.js` in the repository root, next to `cycle.js` |
| Module pattern | The wrapper of `cycle.js`: `(function (global) { 'use strict'; … global.ClimateEquipment = { … }; })(typeof window !== 'undefined' ? window : globalThis);`. No `require`, no `module.exports`, no DOM access, no npm packages. |
| Load order | Browser and tests: `sim.js`, `controller.js`, `runtime.js`, `capacity.js`, `cycle.js`, then `equipment.js`. At load it reads only `global.ClimateSim` (`plantOf` and `shell` use `ClimateSim.PLANT`). It reads `global.ClimateController`, `global.ClimateCapacity` and `global.ClimateCycle` when `estimate`, `runCheckSteps`, `runCheck` or `runCheckAsync` is called, never at load: on the server `equipment.js` may load through `server/rooms.js` → `server/sim-adapter.js` before `capacity.js` and `cycle.js` (`server/main.js` requires `rooms.js` before `api.js`). `checkEquipment`, `geometry`, `shell` and `plantOf` use only `ClimateSim` (all the server code calls, section 12.3). |
| Browser and Node | The same file runs in both. Node tests `require('../equipment.js')` after the five files above. |
| Shared modules | Changed only as section 5 says: `sim.js` (5.1), `capacity.js` (5.2), `cycle.js` (5.3, C7 revision 2), `controller.js` (5.4), `web/settings-panel.js` (one `#inCrop` option, 5.4.3; the Equipment stream owns that one-line edit in wave 2, lead decision 47), `tools/make-vectors.js` (one new recorded run). `runtime.js`, `calib.js`, `room-rules.js` are not changed by this stream. |
| No change for existing callers | A room without `plant`, a cycle without `opts.heat`, and every existing crop give results deep-equal to `master` 91ba1b6 (measured, 13.1). Every existing test (584 on `master` 89a0efa) and the 8 recorded vectors stay green unchanged. |
| Deterministic | Same `room`, `mix`, `opts`: deep-equal Report. No `Math.random`, no clock (C7 is deterministic; the search is a fixed sequence). |
| Numbers | Unrounded in the Report (the page rounds). Units: hp (badge), W, W/K, m², m, L/h, m³/h, °C, % RH, ppm, kWh, RM. "kWh" in the heat breakdown is heat (thermal), not electricity; electricity is `kwh` of a run. |
| Speed | One run = one C7 full cycle with `opts.heat` (about 5 s in Node 22 for the 78-day lion's mane program, 3.7 s in desktop Chrome). A check makes 2–9 runs (section 7.7); measured 2–6 (13.5). |
| Draft crop | `CROPS.lionsmane` is a draft profile (comment in the code); its numbers change only through the lead. |

## 2. Public API (`global.ClimateEquipment`)

| Name | Signature | Returns | Notes |
|---|---|---|---|
| `AC_SIZES`, `CONSTRUCTIONS`, `FOGGER_SIZES`, `FAN_SIZES`, `DEFAULTS`, `LIMITS` | frozen data (each nested object frozen too, 4.1) | Section 4.1 | The catalogue (read-only use) |
| `FAN_MIN_ACH`, `SOL_AIR_K`, `MARGIN`, `SHARE`, `RUNS`, `MAX_RUNS` | numbers, frozen objects | Section 4.1 | Rules of 8.4, 4.4, 7.4, 8.5, 7.7 |
| `checkEquipment` | `(eq)` | `string[]` of problems (`[]` = valid) | Section 4.3. Missing fields are allowed (they take `DEFAULTS`). |
| `geometry` | `(volume, height)` | `{ floor, walls, roof }` m² | Section 4.4 |
| `shell` | `(eq, volume)` | `{ floor, walls, roof, ua, solarPeakW }` or `null` | Section 4.4; `null` when `walls` or `roof` is `null` |
| `plantOf` | `(eq, room)` | plant object (sim units) | Section 4.5. `eq` may be partial (missing fields take `DEFAULTS`). `room` = `{ volume, calib }` (other keys ignored). |
| `estimate` | `(room, mix, opts?)` | `{ needW, stage, perStage, hp }` | Section 6. Instant (0.1–0.3 ms). |
| `runCheckSteps` | `(room, mix, opts?)` | A generator: each `next()` before the end yields one Progress (section 10); the last returns the Report (section 11) | Runs nothing until the first `next()`. Input errors (section 3) throw from the first `next()`. An impossible mix returns at once. |
| `runCheck` | `(room, mix, opts?)` | Report | Runs the generator to the end; calls `opts.onProgress(progress)` after each yield |
| `runCheckAsync` | `(room, mix, opts?)` | `Promise<Report>` | As `runCheck`, awaiting `new Promise(r => setTimeout(r, 0))` after each Progress (after `opts.onProgress`). Input errors reject. |

### 2.1 Arguments

| Argument | Shape | Meaning |
|---|---|---|
| `room` | `{ name, volume, vent, calib, equipment }`: `name`, `volume`, `vent`, `calib` exactly as C7 2.1; `equipment` an Equipment object (4.2), partial or `null` | The room. `equipment` `null` or left out = `DEFAULTS` (the machines `PLANT` has today). |
| `mix` | As C7 | The planned blocks |
| `opts.settings` | As C7 (`importSettings` inside C7) | The room's controller settings; the program (days, flushes, farm type) decides the cycle |
| `opts.region` | As C7 | Design days |
| `opts.tariff` | As C7 | RM per kWh |
| `opts.onProgress` | `(progress) => void` | `runCheck`, `runCheckAsync` only |
| `opts.runCycleSteps` | function with the signature of `ClimateCycle.runCycleSteps` | **Tests only**: replaces the C7 generator (search tests with scripted results, section 14). Left out: `ClimateCycle.runCycleSteps`. |

## 3. Input checks and errors

| # | Condition (checked in this order before anything runs; thrown from the first `next()`: `runCheck` throws, `runCheckAsync` rejects) | Error |
|---|---|---|
| 1 | `room` is not a non-null, non-array object | `TypeError('runCheck: room must be an object')` |
| 2 | `mix` is not an array | `TypeError('runCheck: mix must be a list')` |
| 3 | `room.equipment` is not `null`/`undefined` and `checkEquipment(room.equipment)` is not empty | `TypeError('runCheck: ' + problems[0])` (for example `runCheck: ac_hp: must be one of 1, 1.5, 2, 2.5, 3, 4, 5, 6`) |
| 4 | `opts.settings !== undefined` and it is not a non-null, non-array object | `TypeError('runCheck: settings must be an object')` |
| 5 | `opts.tariff !== undefined` and not a finite number ≥ 0 | `TypeError('runCheck: tariff must be a number of at least 0')` |
| 6 | `region = opts.region \|\| 'my-lowland'`; `!Object.hasOwn(ClimateCapacity.DESIGN_DAYS, region)` | `Error('Unknown region: <region>')` |
| 7 | `exportSettings` / `importSettings` throws | That error, unchanged |
| 8 | (not an error) `ClimateCapacity.commonTargets(mix).impossible` | Returns `{ verdict: 'impossible', why: tg.conflict }` (exactly these two keys), no run |
| 9 | Later, during the runs: a C7 Result with `verdict !== 'ok'` (cannot happen after row 8; a guard) | `Error('runCheck: the cycle did not run (<why>)')` |

## 4. Machines and the room shell

### 4.1 Catalogue

| Name | Value | Source |
|---|---|---|
| `AC_SIZES` | `[{ hp: 1, w: 2640 }, { hp: 1.5, w: 3500 }, { hp: 2, w: 5280 }, { hp: 2.5, w: 6810 }, { hp: 3, w: 7910 }, { hp: 4, w: 10550 }, { hp: 5, w: 13480 }, { hp: 6, w: 16120 }]` (frozen, in this order) | Rated cooling per hp badge, Malaysian market (equipment-facts 3): 1, 2, 2.5, 3 hp the median of the sources (BTU/h ÷ 3412.1); 1.5 hp the simulation's `PLANT.ac.capW` 3500 W (sources' median 3560, range 3370–3810), so `DEFAULTS` reproduce today's room; 4, 5, 6 hp one Daikin FHC ceiling model each (E6). 1–3 hp are wall splits, 4–6 hp ceiling or cassette units. |
| `CONSTRUCTIONS` | Table 4.1.1 | equipment-facts 10 |
| `FOGGER_SIZES` | `[3, 6, 14, 24]` L/h | Units on sale (equipment-facts 14: 3, 6, 14, 24 L/h) |
| `FAN_SIZES` | `[300, 600, 900, 1200, 1800]` m³/h at top speed | A step list of the simulation's 900 m³/h fan, not market sizes (no source; equipment-facts 15 has inline fans of 353 and 688 m³/h only; section 15 item 5) |
| `FAN_MIN_ACH` | `5` (air changes per hour at top speed) | Lion's mane fresh air 5–8 changes per hour (lionsmane-research S1, S12, S17; equipment-facts 15). The smallest fan the fan verdict recommends (8.4). |
| `DEFAULTS` | `{ ac_hp: 1.5, ac_units: 1, fog_lph: 3, fan_m3h: 900, walls: null, roof: null, height: 3 }` | Exactly `PLANT` today: one 3500 W aircond, a 3 L/h fogger, a 900 m³/h fan, typical walls (`PLANT.room.ua` 80 W/K) |
| `LIMITS` | `{ ac_units: [1, 4], fog_lph: [0.5, 50], fan_m3h: [50, 5000], height: [2, 6] }` | Input ranges |
| `SOL_AIR_K` | `26` (K) | Assumption, no source in equipment-facts: a light-coloured roof in full sun (1000 W/m², ASHRAE sol-air α/hₒ = 0.026 m²K/W) acts like air 26 K hotter. A bare, weathered or dark zinc roof is closer to 52 K (α/hₒ 0.052), so the sun on zinc roofs (4420 W in 4.4) may be about half the real figure (section 15 item 5). |
| `MARGIN` | `1.2` | Section 7.4 |
| `SHARE` | `{ poor: 40, fair: 25, freshAir: 45 }` (%) | Sections 8.5, 8.7 |
| `RUNS` | `{ ac: 6, margin: 1, fogger: 1, fan: 1 }` | Section 7.7 |
| `MAX_RUNS` | `9` (`RUNS.ac + RUNS.margin + RUNS.fogger + RUNS.fan`) | Progress (section 10) |

| Rule | Detail |
|---|---|
| Frozen | `AC_SIZES` and each of its entries, `CONSTRUCTIONS` and each of its entries, `FOGGER_SIZES`, `FAN_SIZES`, `DEFAULTS`, `LIMITS` and each of its arrays, `SHARE`, `RUNS` are frozen (`Object.isFrozen` true), so no caller can change `shell()` or `plantOf()` for later callers (for example `CONSTRUCTIONS.zinc.u = 1` has no effect, and throws in strict mode) |

#### 4.1.1 `CONSTRUCTIONS`

| Key | `label` | `u` (W/m²K) | Walls | Roof (`roof: true`) | Source (equipment-facts 10) |
|---|---|---|---|---|---|
| `zinc` | `Zinc sheet, no insulation` | 8.5 | yes | yes | Bare metal sheet, median of 2 |
| `brick115` | `Brick 115 mm, plastered` | 2.1 | yes | no | 2 sources |
| `brick230` | `Brick 230 mm` | 2.2 | yes | no | 3 sources |
| `eps50` | `EPS panel 50 mm` | 0.715 | yes | yes | 2 makers |
| `eps75` | `EPS panel 75 mm` | 0.475 | yes | yes | 2 makers |
| `eps100` | `EPS panel 100 mm` | 0.305 | yes | yes | 2 makers |
| `pu50` | `PU panel 50 mm` | 0.38 | yes | yes | Kingspan datasheet |
| `pu75` | `PU panel 75 mm` | 0.275 | yes | yes | Between 70 and 80 mm |
| `pu100` | `PU panel 100 mm` | 0.2 | yes | yes | Kingspan datasheet |

### 4.2 Equipment object

| Field | Type | Unit | Range | Default | Meaning |
|---|---|---|---|---|---|
| `ac_hp` | number | hp (badge) | one of `AC_SIZES[].hp` | 1.5 | Size of each aircond |
| `ac_units` | integer | units | 1–4 | 1 | Number of airconds of that size; the simulation runs them as one unit of `units × w` with one thermostat |
| `fog_lph` | number | L/h | 0.5–50 | 3 | Total fogger output at its top level |
| `fan_m3h` | number | m³/h | 50–5000 | 900 | Fresh-air fan airflow at its top speed (the label value) |
| `walls` | string \| null | – | a `CONSTRUCTIONS` key, or `null` | `null` | Wall construction; `null` = not set |
| `roof` | string \| null | – | a `CONSTRUCTIONS` key with `roof: true`, or `null` | `null` | Roof or ceiling construction |
| `height` | number | m | 2–6 | 3 | Inside height (for wall and roof areas) |

### 4.3 `checkEquipment(eq)`: problems, in this order

| # | Condition | Problem text |
|---|---|---|
| 1 | `eq` is not a non-null, non-array object | `equipment: must be an object` (and nothing else is checked) |
| 2 | Each own key not in `DEFAULTS` (in key order) | `<key>: unknown field` |
| 3 | `ac_hp` present and not one of the `AC_SIZES` hp values (strict `===`) | `ac_hp: must be one of 1, 1.5, 2, 2.5, 3, 4, 5, 6` |
| 4 | `ac_units` present and not an integer 1–4 | `ac_units: must be a whole number from 1 to 4` |
| 5 | `fog_lph` present and not a finite number 0.5–50 | `fog_lph: must be a number from 0.5 to 50` |
| 6 | `fan_m3h` present and not a finite number 50–5000 | `fan_m3h: must be a number from 50 to 5000` |
| 7 | `height` present and not a finite number 2–6 | `height: must be a number from 2 to 6` |
| 8 | `walls` present, not `null`, not a `CONSTRUCTIONS` key | `walls: must be one of zinc, brick115, brick230, eps50, eps75, eps100, pu50, pu75, pu100 or null` |
| 9 | `roof` present, not `null`, not a key with `roof: true` | `roof: must be one of zinc, eps50, eps75, eps100, pu50, pu75, pu100 or null` |
| 10 | `(walls ?? null) === null` differs from `(roof ?? null) === null` | `walls and roof: set both or neither` |

| Rule | Detail |
|---|---|
| Present | `eq[key] !== undefined` |
| Several problems | Every applicable row adds its problem, in table order |

### 4.4 Room shell (`geometry`, `shell`)

| Item | Rule |
|---|---|
| Floor | `floor = volume / height` (m²); plan 5 : 4: `L = √(floor × 5/4)`, `W = √(floor × 4/5)` |
| Areas | `walls = 2 × (L + W) × height`; `roof = floor`. The floor slab is not counted (no U-value source; equipment-facts 11). |
| `ua` | `CONSTRUCTIONS[walls].u × walls m² + CONSTRUCTIONS[roof].u × roof m²` (W/K) |
| `solarPeakW` | `CONSTRUCTIONS[roof].u × roof m² × SOL_AIR_K` (W at the noon sun; the sim scales it by `sin` of the hour). Walls get no sun (shaded). |
| `shell(eq, volume)` | `null` when `eq.walls` or `eq.roof` is `null`; `height` = `eq.height ?? 3` |

| Example (60 m³, height 3) | walls m² | roof m² | `ua` W/K | `solarPeakW` W |
|---|---|---|---|---|
| Typical (no construction: `PLANT`) | – | – | 80 | 500 |
| `zinc` / `zinc` | 54 | 20 | 629.0 | 4420 |
| `brick115` / `zinc` | 54 | 20 | 283.4 | 4420 |
| `pu50` / `pu50` | 54 | 20 | 28.1 | 197.6 |
| `eps75` / `eps75` | 54 | 20 | 35.2 | 247 |
| `eps75` / `eps75`, 120 m³ | 76.4 | 40 | 55.3 | 494 |

### 4.5 `plantOf(eq, room)`: the machines in simulation units

| Name | Value |
|---|---|
| `eq` | `{ ...DEFAULTS, ...eq }` |
| `A` | `ClimateSim.PLANT.ac` |
| `capW` | `AC_SIZES[i].w × ac_units` for the `i` with `hp === ac_hp` |
| `f` | `capW / A.capW` |

| Plant key | Value | Why |
|---|---|---|
| `ac.capW` | `capW` | Rated cooling of all units |
| `ac.coilM3s` | `A.coilM3s × f` | Coil airflow grows with the unit (a bigger unit takes more water out at the same output share); 0.14 m³/s for 3500 W (section 5.1) |
| `ac.auxW` | `A.auxW × f` | Indoor fan power |
| `ac.standbyW` | `A.standbyW × ac_units` | Standby per unit |
| `fogger.levels` | `PLANT.fogger.levels` with `gph` and `w` each × `fog_lph / 3` | Three levels of one third of the output each (as today) |
| `fan.levels` | `PLANT.fan.levels` with `m3h` and `w` each × `fan_m3h / 900` | Low, Medium, High = ⅓, ⅔, 1 of the label airflow (as today) |
| `room` | `{ ua: shell.ua }` only when `room.calib` is falsy and `shell(eq, room.volume \|\| PLANT.room.volume)` is not `null` | Construction gives the wall transfer; an applied calibration wins (C1 calibration `ua` is fitted with the sun at 500 W) |
| `loads` | `{ solarPeakW: shell.solarPeakW }` under the same condition as `room` | Sun on the roof follows the roof |

| Rule | Detail |
|---|---|
| Identity | `plantOf(DEFAULTS, room)` makes the simulation exactly today's room: measured, a C7 default cycle with `room.plant = plantOf(DEFAULTS, room)` deep-equals one without `plant` (13.1). |
| `uaSource` | `'calibration'` when `room.calib` is truthy; else `'construction'` when `walls` and `roof` are set; else `'typical'` (`PLANT.room.ua` 80, `solarPeakW` 500). An applied calibration wins even when its `ua` sits at a `calib.js` limit (20 or 400 W/K) and the construction value lies outside that range (zinc/zinc 629, PU 100 14.8): section 15 item 10, deferred (lead decision 42). |
| Calibration with the room's machines | The Calibrate tab (C5 3.11) fits a room with `envBase.plant = plantOf(eq, { volume, calib: {} })` when the room has saved machines: `calib` is truthy, so the plant has no `room` and no `loads` keys and the sun stays the typical 500 W that a calibration `ua` is fitted with (the row above). Without saved machines it fits with `PLANT`. The calibration records the machines it was fitted with (C1 `calibrations.equipment`: the 7 fields, or `null` for `PLANT`), and the Calibrate tab warns when the room's machines now differ (lead decision 50). |
| Not modelled | Thermal bridges and door, wall sun, rated aircond capacity at a 16–20 °C room (lower than the 27 °C rating, no source: the margin rule of 7.4 covers it), a fresh-air pre-cooler |

## 5. Changes to the shared modules

### 5.1 `sim.js`

| Item | Before (`master` 91ba1b6) | After |
|---|---|---|
| `PLANT.ac` (line 46) | `ac: { capW: 3500, auxW: 35, …` | `ac: { capW: 3500, coilM3s: 0.14, auxW: 35, …` (new key, today's literal) |
| Latent removal (line 324) | `a.acFrac * 0.14 * Math.max(…)` | `a.acFrac * A.coilM3s * Math.max(…)` |
| New function before `create` | – | `const PLANT_KEYS = ['room', 'ac', 'fogger', 'fan', 'loads']; function plantOf(over) { if (over == null) return PLANT; const p = { ...PLANT }; for (const k of PLANT_KEYS) if (over[k] != null) p[k] = { ...PLANT[k], ...over[k] }; return p; }` (one level deep; other keys of `over` ignored) |
| `create` (line 93) | `const R = () => ({ ...PLANT.room, ...(e.room \|\| {}) });` and `PLANT.` everywhere inside `create` | `const P = plantOf(e.plant);` then `const R = () => ({ ...P.room, ...(e.room \|\| {}) });` and every `PLANT.` inside `create` becomes `P.` (`co2Lpm` outside `create` keeps `PLANT.blockStage`) |
| `env.plant` | – | Optional, not in `DEFAULT_ENV`: a partial plant (5.1.1). Read once, when `create` runs. `e.room` (calibration) still overrides `P.room`. |
| Heat flows | – | A closure object `flowJ` (13 keys, 5.1.2), all 0 at `create`, not part of `s` (so `snapshot()` is unchanged); added to in `step` right before `const next = { lo: {}, hi: {} };` (line 349), from the values of that step; changes nothing else |
| Returned object (line 418) | `{ step, read, view, trigger, setRoom, snapshot, env }` | Adds `heatJ: () => ({ ...flowJ })` (J since `create`) |
| Export (line 421) | `{ create, PLANT, DEFAULT_ENV, ahSat, co2Lpm }` | Adds `plantOf` |

#### 5.1.1 `env.plant` keys

| Key | Overridable fields | Used for |
|---|---|---|
| `room` | Any `PLANT.room` field (C8 sets `ua`) | Room physics before `e.room` |
| `ac` | Any `PLANT.ac` field (C8 sets `capW`, `coilM3s`, `auxW`, `standbyW`) | The aircond |
| `fogger` | `levels`, `standbyW` (C8 sets `levels`) | The fogger |
| `fan` | `levels`, `supplyPowerFactor`, `leakFrac` (C8 sets `levels`) | The fresh-air fan |
| `loads` | `baseW`, `lightsW`, `solarPeakW` (C8 sets `solarPeakW`) | Fixed loads and sun |

#### 5.1.2 `heatJ()` keys (J, summed `W × dt` per step)

| Key | W in one step (`Z` = zones before the step, `w` = weather, `L = P.loads`) | Meaning |
|---|---|---|
| `walls` | `room.ua × 0.4 × (w.T − Z.lo.T) + room.ua × 0.6 × (w.T − Z.hi.T)` | Heat through walls and roof (negative when outside is cooler) |
| `sun` | `w.sun × L.solarPeakW` | Sun on the roof |
| `airSens` | `1206 × (inflow.lo × w.T − outflow.lo × Z.lo.T + inflow.hi × w.T − outflow.hi × Z.hi.T)` | Fresh air and leaks: heat (air between the zones cancels) |
| `airLat` | `2450 × (inflow.lo × w.ah − outflow.lo × Z.lo.AH + inflow.hi × w.ah − outflow.hi × Z.hi.AH)` | Fresh air and leaks: water, as the heat the aircond needs to condense it |
| `blockSens` | `blockToAir` | Blocks: heat |
| `blockLat` | `respGps × 2450` | Blocks: water (respiration and transpiration) |
| `base` | `L.baseW` | Fixed small loads |
| `lights` | `lightsW` | Lights |
| `people` | `workers × (P.person.w + P.person.gph / 3600 × 2450)` | Workers (0 in C7 runs) |
| `fog` | `fogGps × 2450` | Fog: water in = air cooled by evaporation (net 0 for the aircond) |
| `water` | `waterGps × 2450` | Floor watering (net 0, as `fog`) |
| `acSens` | `−qAc` | Heat the aircond takes out (negative while heating) |
| `acLat` | `latent × 2450` | Water the aircond takes out, as heat |

| Check | Detail |
|---|---|
| Balance (measured, 13.1) | Over a fruiting segment `acSens + acLat` equals `walls + sun + airSens + airLat + blockSens + blockLat + base + lights + people + water` within 0.5 % (the rest is the room's heat store and water lost at saturation) |

### 5.2 `capacity.js`

| Item | Before | After |
|---|---|---|
| `roomOf` (line 83) | `{ ...SIM.PLANT.room, ...(calib values), volume }` | `{ ...SIM.PLANT.room, ...(room.plant && room.plant.room), ...(calib values), volume }` |
| `balance` (line 111) | `const P = SIM.PLANT, …` | `const P = SIM.plantOf(room.plant), …` |
| `balance` (line 120) | `const coilRate = 0.14 * …` | `const coilRate = P.ac.coilM3s * …` |
| `trial` (line 149) | `e.room = roomOf(room);` | `e.room = roomOf(room); if (room.plant != null) e.plant = structuredClone(room.plant);` |
| `room` argument | `{ name, volume, vent, calib }` | Adds optional `plant` (5.1.1). `checkSteps`/`check` pass it on through `balance` and `trial`. |
| Exports | unchanged | unchanged |

### 5.3 `cycle.js` (C7 revision 2)

| Item | Before | After |
|---|---|---|
| C7 2.1 `room` | `{ name, volume, vent, calib }` | Adds optional `plant` (5.1.1) |
| C7 3 checks | 1 room, 2 mix, 3 settings, … | New check 2b after 2: `room.plant != null` and not a non-array object → `TypeError('runCycle: plant must be an object')` |
| C7 7.1 step 2 | `e.room = CAP.roomOf(room);` | Then `if (room.plant != null) e.plant = structuredClone(room.plant);` |
| C7 2.1 `opts.heat` | – | Boolean, default `false`. `true`: every Segment gains `heat` and every series Hour gains `heat`: objects with the 13 keys of 5.1.2 in **Wh** (J / 3600). `false`: the Result is deep-equal to revision 1. |
| C7 8.1, new step 2a (with `opts.heat`, right after the `hour` is computed, before an hour closes) | – | `F = sim.heatJ()`; when a previous `F` exists: add `(F[k] − Fprev[k]) / 3600` to the open hour's `heat[k]` and to the open segment's `heat[k]`; `Fprev = F`. The interval ending at a reading belongs to the hour and segment open before that reading, so a segment's `heat` equals the sum of its hours' `heat` (measured to 2e-8 Wh). |
| C7 8.2 wet counter (line 193) | `if (v.RH > CAP.PASS.wetRH) openSeg.wet++;` | `if (v.RH > openSeg.wetLim) openSeg.wet++;` with `wetLim: (CC.CROPS[tg.crop].wetRH && CC.CROPS[tg.crop].wetRH[ps.stage]) ?? CAP.PASS.wetRH` set once in `newSegCounters` (an internal counter field, not part of the Segment). A segment's `wet` is the share of readings above its stage's wet line; `wetMax` 10 % is unchanged. Crops without `wetRH` (every crop but lion's mane): unchanged, results deep-equal. |
| C7 15 | "Other machines than `PLANT`'s … not modelled" | "A room's machines: C8 (`room.plant`)" |

### 5.4 `controller.js`

#### 5.4.1 Why a lion's mane room failed "humidity near saturation" even with a big aircond

| Measured with | Value |
|---|---|
| Code | `master` controller and sim, the research profile (fruiting 20 °C / 90 %, pinning 16 °C) |
| Room | 60 m³, typical walls, 1000 blocks; numbers in 13.2 |

| # | Cause in the code | Effect |
|---|---|---|
| 1 | `co2Purge`, steady mode (`controller.js` line 458): the fan never goes below `rules.baseFan[stage]`, Low (300 m³/h) in pinning and fruiting, all night | At night the outside air (23–26 °C, 87–98 %: 19–23 g/m³) holds more water than a 20 °C room can (17.3 g/m³ at saturation). 300 m³/h brings 0.3–0.5 g/s of water. |
| 2 | Physics: at night the room needs little cooling, so the aircond runs at its minimum (`minFrac` 0.2) or cycles; its water removal is proportional to its output (`latent = frac × coil airflow × ΔAH`) | It cannot take that water out without over-cooling the room, so RH sits at 97–99 % all night. A bigger aircond is wetter: its minimum output is larger, so it cycles more. |
| 3 | `sim.js` latent removal used a fixed coil airflow 0.14 m³/s for any `capW` | A bigger aircond took out no more water per share of output. Fixed by `PLANT.ac.coilM3s` scaled in `plantOf` (5.1, 4.5). |
| 4 | Heat mode (`controller.js` line 526): `e < −0.8` for 5 min switches the AC to heat, also when the outdoor air is 31 °C. A large AC in a cool room overshoots below the band at every start (its full-power start for `acStartBoostMin` = 3 min) | Heat and cool flap every half hour and the room swings out of the band: with the wet rule alone, pinning at 16 °C passed at 2 hp (95.1 %) and failed `temperature too high` at 2.5 hp (82.1 %); with C8 but without this rule a farmer's 4 hp is judged too small (13.2). The same flapping is in two recorded oyster vectors (`dry-weather`, `crowded-dry`), so this contract fixes it for cool crops only (section 15, item 3). |
| 5 | Setpoint correction (`controller.js` line 533) keeps integrating while dry mode caps the compressor (`dryMaxFrac` 0.45) | The correction winds down to the lowest setpoint (16 °C); when dry mode ends the AC drives the room to 15 °C (`temperature too low`). |
| 6 | Pinning target 16 °C = `MACHINES.acSetMin` | The correction has no room below the setpoint, so any upset leaves the band. 17 °C passes with every size from 2 hp up. |

#### 5.4.2 `CROPS.lionsmane` (draft) and the `cool` flag

```js
  // Flags: casing (milky: soil casing before pinning, a manual step). Flags for other crops:
  // maxFog (no direct fog on the crop), noFogBoost, shock { T, hours } (cold shock at pinning), spawnLights (light in spawn run),
  // cool (a crop held well below the outdoor air: wet outdoor air rule and no heat mode while the outdoor air is warm, C8).
  // wetRH { <stage>: % } (C8): the "humidity near saturation" line of that stage in C7 scoring (default PASS.wetRH 95).
  …
    // DRAFT (C8, research 2026-10-08, 22 sources for fruiting): a cool crop (fruits at 16-22 °C) that needs an insulated room
    // and a larger AC than the tropical crops. CO2 sets the shape: above about 1000 ppm long spines and coral shapes.
    // Pinning RH 90-100 % in the sources (S12 Out-Grow and S15 Fungi Academy 95-100): wet only above 98 % in pinning.
    lionsmane: { name: "Lion's mane", spawn: [23, 80, 5000], pinning: [17, 92, 700], fruiting: [20, 90, 1000], rest: [21, 80, 2000],
                 limits: { tMin: 14, tMax: 27, coreMax: 30 }, coreTarget: 25, range: { T: [16, 22], RH: [85, 92] }, cool: true,
                 wetRH: { pinning: 98 } },
```

| Item | Value | From the research profile |
|---|---|---|
| Place | Last entry of `CROPS` (after `milky`) | – |
| `pinning` | `[17, 92, 700]` | Research proposed 16 °C (the AC minimum); 17 °C because of cause 6 (still inside the sources' 10–24 °C, S14 16–22 °C) |
| `cool: true` | New flag | Turns on 5.4.3 |
| `wetRH: { pinning: 98 }` | New optional key (C7 scoring only, 5.3; the controller does not read it) | Pinning RH 90–100 % (median 97.5; S12 and S15 95–100, S22 90–95, research section 3): growers hold pinning near saturation, so the app's 95 % line would call a correctly run pinning room "too wet". Measured: above 98 % in pinning 2.7 % at 2 hp, 1.7 % at 2.5 hp, 1.4 % at 4 hp (13.3), under `wetMax` 10. Fruiting keeps 95 (research fruiting RH 85–95). |
| Everything else | As `lionsmane-research.md` section 6 | Unchanged (spawn 23/80/5000, fruiting 20/90/1000, rest 21/80/2000, limits, coreTarget 25, range) |
| Program | Not in `CROPS` (programs are per room settings). Measurements use the research program: `days` spawn 21, pinning 5, fruiting 8, rest 14; `flushes` 3 (78 days, full). | Research section 7 |
| Comment at `controller.js` line 44 | "Only crops that fruit near tropical room temperature …" | Becomes: `// Mostly crops that fruit near tropical room temperature; a cool crop (flag cool) needs an insulated room and a larger AC.` (in the prototype `controller.js.diff` from revision 1) |

#### 5.4.3 Cool-crop rules (only when `CROPS[cfg.crop].cool`)

| Rule | Where | Exact change | Measured effect (1000 blocks, typical room) |
|---|---|---|---|
| Wet outdoor air | `co2Purge`, steady mode, line 458; new state `st.wetAirOn` (initial `false`, added to the `create` state object next to `co2Timed`) | `const wetOk = !!CROPS[cfg.crop].cool && !f.out && !f.RH && !f.T; const outWetter = wetOk && ahOf(v.tOut, v.rhOut) > ahOf(v.T, v.RH); if (!wetOk) st.wetAirOn = false; else if (!st.wetAirOn && outWetter && v.RH > st.rhT + BANDS.RH) st.wetAirOn = true; else if (st.wetAirOn && (!outWetter \|\| v.RH < st.rhT + 1)) st.wetAirOn = false; const base = st.wetAirOn ? 0 : (R.baseFan && R.baseFan[cfg.stage]) \|\| 0;` (CO₂ still steps the fan up) | Fruiting `wet` 16–25 % → 1–6 % at 2–2.5 hp (coil airflow scaled, pinning 16 °C; `master` at 1.5 hp: 27–32 %) |
| No heat while outside is warm | `airConditioner`, line 526 | `const outWarm = !!crop.cool && !f.out && v.tOut > cfg.spT + BANDS.T; st.heatSince = e < -0.8 && !outWarm ? (st.heatSince ?? t) : null;` (`crop` is already defined at line 516: `const t = st.lastT, crop = CROPS[cfg.crop];`) | Pinning at 2.5 hp (full cycle): 90.3 % → 97.0 %; the farmer's 4 hp goes from `too small` (5 hp asked) to `bigger than needed` (13.2) |
| No wind-down in dry mode | `airConditioner`, line 533 | `if (!st.setbackOn && !(crop.cool && st.dryOn && e > 0)) st.trim = clamp(…)` (same expression as today) | Pinning at 2.5 hp (full cycle): `temperature too low` (93.6 %) → passes (97.0 %, the 4 h ramp from spawn included) |

| Rule for every existing crop | Detail |
|---|---|
| No change | All three rules are behind `cool`; no existing crop has it. Measured: the 8 recorded vectors byte-identical after `node tools/make-vectors.js`; the C7 default cycle deep-equal; 573 tests green (13.1). |
| New recorded run | `tools/make-vectors.js` gets one `record` call (exact text in the brief) for `tests/vectors/cool-crop.json`: lion's mane fruiting, 1000 blocks, 12 h from 18:00, harvest windows off. It exercises the wet rule (159 of 1441 readings with `wetAirOn`) and the heat rule (128 readings below the band with the outside warm, no heat). `npm test` then counts 9 vector tests. |
| Settings and UI | No new setting, no settings-panel field (the flag and `wetRH` belong to the crop). The lists built from `CROPS` show lion's mane at once: `SETTING_ENUMS.crop`, `ClimateRoomRules.hasCrop`, `cropOptions()` in `web/settings-panel.js` (the settings list rows), the capacity and Simulate crop selects. The `select#inCrop` of the settings editor (Live tab and Test bench) is written out by hand (`web/settings-panel.js` lines 185–194 of `master`): add `<option value="lionsmane">Lion's mane (Hericium erinaceus)</option>` after the `milky` option, else `setVal($('#inCrop'), 'lionsmane')` (line 593) shows an empty select. New test `tests/web-settings-panel.test.js` **CROPLIST**: the `value`s of the `<option>`s inside `<select id="inCrop">` (read from the file text) equal the `CROPS` keys with a `range` (fails on `master` + lion's mane without the option; passes with it). |

## 6. Quick estimate (`estimate(room, mix, opts)`)

| Step | Rule |
|---|---|
| 1 | `eq = { ...DEFAULTS, ...room.equipment }`; `cfg` = `opts.settings` through `importSettings(exportSettings())` (or `defaultSettings()`), days and flushes rounded as C7 4.2 step 3; `tg = commonTargets(mix)` (caller ensures it is possible); `plant = plantOf(eq, room)`; `P = ClimateSim.plantOf(plant)`; `R = ClimateCapacity.roomOf({ ...room, plant })`; `n` = block count as C7 7.1 step 1; `c = mixCo2(room, mix)` |
| 2 | For each stage `st` of `FARM_TYPES[cfg.farmType].stages`: targets `t` = `tg` for fruiting, else `profileTargets(tg.crop, st)`; `fac = P.blockStage[st]`; `prod = n × c × fac / 1000` (L/h of CO₂) |
| 3 | Fresh air: start at level `lv` = 0 for a `cool` crop, else `cfg.rules.baseFan[st]`; while `lv < 3` and (`m3h[lv] === 0` or `R.co2Out + prod × 1000 / m3h[lv] ≥ t.co2Lim − 100`): `lv++` (`m3h` = `P.fan.levels[].m3h`); `q = (m3h[lv] + (vent === 'exhaust' ? R.infAch × R.volume : 0)) / 3600` m³/s |
| 4 | Per hour `h` of each design day: `ah = RH/100 × ahSat(T)`; `sun = 7 < h < 19 ? sin(π (h − 7) / 12) : 0`; lights on when `cfg.program.lights.stages[st]` and `on ≤ 60h < off`; `S = (R.ua + 1206 q)(T − t.spT) + sun × P.loads.solarPeakW + P.loads.baseW + (lights ? P.loads.lightsW : 0) + n c fac / 60000 × P.resp.wPerLpm`; `G = q (ah − ahT) + n c fac / 60000 × P.resp.gpsPerLpm + (st === 'fruiting' ? n × P.transpGph / 3600 : 0)` with `ahT = t.spRH/100 × ahSat(t.spT)`; need = `S + 2450 × max(0, G)` (W) |
| 5 | `perStage[st]` = the largest, over the design days, of each day's second-largest hourly need (the pass rule allows 5 % of a day out of band, as `capacity.js` `balance`) |
| 6 | `stage` = the stage with the largest need (first in stage order on a tie); `needW = perStage[stage]`; `hp` = the smallest `AC_SIZES[i].hp` with `w × eq.ac_units ≥ needW`, else the largest |

| Measured against the simulation (13.3, 13.4) | Rooms |
|---|---|
| Estimate = the simulated smallest size | 4 (ready farm, PU 50, zinc, 2000 blocks) |
| Estimate one market step above it | 5 (owner's example, brick and zinc, grey oyster, 2 × 1 hp, exhaust) |
| Estimate below it | 0 |
| No size passes | 2 (both start the walk at the estimate and walk up) |
| Why | The estimate is on the safe side (full Low airflow; the target, not the band edge), so the walk usually goes down one step |

## 7. The check (`runCheckSteps`)

### 7.1 Setup

| Step | Rule |
|---|---|
| 1 | Section 3 checks; `tg = commonTargets(mix)`; impossible → return |
| 2 | `eq = { ...DEFAULTS, ...room.equipment }`; `U = eq.ac_units`; `cfg`, `n` as section 6; `crop = CROPS[tg.crop].name`; `est = estimate({ ...room, equipment: eq }, mix, opts)` |

### 7.2 One run

| Item | Rule |
|---|---|
| Input | An Equipment `e2` (a copy of `eq` with one field changed) |
| Call | `runner({ ...room, plant: plantOf(e2, room) }, mix, { settings: opts.settings, region: opts.region, tariff: opts.tariff, heat: true })` with `runner = opts.runCycleSteps \|\| ClimateCycle.runCycleSteps`; every C7 Progress becomes one C8 Progress (section 10) |
| Kinds | `'ac'` (aircond size runs), `'fogger'`, `'fan'` (confirmation runs, 7.6) |
| Summary | The Run row of 11.3, from the C7 Result. AC runs are kept by size index; one size never runs twice. |
| AC pass | `acPass` = no segment's `fails` contains `temperature too high` or `block core too hot`. `temperature too low` is not an AC failure in the walk (7.3 steps 3–4); a run with it (`tooLow`, 11.3) is a too-big aircond when its size is above `min` (7.3 row 6, 8.2 `too-big`) and is never the recommended margin size (7.4). |

### 7.3 Aircond search

| Name | Value |
|---|---|
| `i(hp)` | Index in `AC_SIZES` |
| `own` | `i(eq.ac_hp)` |
| `k` | `i(est.hp)` (moves during the walk) |

| # | Step |
|---|---|
| 1 | Run `own`. |
| 2 | Run `k` (no new run when `k === own`). |
| 3 | `k` passes: while `k > 0` and size `k − 1` passes (running it when it has not run, only while fewer than `RUNS.ac` sizes have run; a size that already ran is reused even at the limit), `k = k − 1`. Then `min = k`. |
| 4 | `k` fails: while `k < 7` and size `k + 1` can be had (already run, or fewer than `RUNS.ac` sizes have run): if `k + 1` passes, `min = k + 1` and stop; else `k = k + 1`. If no size passed, `min = null`. |
| 4b | The own run passes `acPass` and (`min === null` or `own < min`): `min = own`. Sizes below `own` are not run for this. |
| 5 | `min` is the smallest passing size found within the run limit; a passing own size below the walk's result wins (4b). The walk is downward from a pass and upward from a fail, one market step at a time, so the size below `min` failed, is index 0, or was not run because `own` passed. Sizes need not pass or fail in order: a size above `min` can fail because it is too big (13.4: 5 hp for 2000 blocks). |
| 6 | Too big: every AC run with index above `min` that fails `acPass` or has `tooLow` gets `tooBig: true` (an aircond that cycles and lets the room drift, or cools it below the band; measured at 5 hp for 2000 lion's mane blocks and at 6 hp for 2000 grey oyster blocks, 13.4). This includes sizes between `own` and the walk's result that failed (4b). |

### 7.4 Margin rule and the recommended size

| Rule | Detail |
|---|---|
| Thin margin | `min` is set and `AC_SIZES[min].w × U < MARGIN × est.needW` (the minimum has less than 20 % above the estimated peak need) |
| Recommended | Thin margin and `min < 7`: run `min + 1` (reused if it ran; this run may exceed `RUNS.ac` by one, `RUNS.margin`); `rec = min + 1` when that run passes `acPass` and has no `tooLow`, else `rec = min`. No thin margin: `rec = min`. `min = null`: `rec = null`. |
| No reserve | `noReserve` = thin margin and `rec === min`, with a reason: `'largest'` when `min === 7` (the minimum is 6 hp, the largest size: no bigger size exists); `'too-big'` when the `min + 1` run failed `acPass` or has `tooLow` (by 7.3 row 6 that run is `tooBig`: a bigger aircond holds this room less steadily). Otherwise `noReserve` is `null`. `'largest'`: the farmer is told the minimum has no reserve and to fix the room (8.1, 8.2). `'too-big'`: the farmer is told the size is just enough and no bigger size holds the room steadier; "fix the room first" is not said (lead decision 45). |
| Why 20 % | The rated capacity is measured with a 27 °C room; at 16–20 °C a real unit gives less (no source for how much), and days hotter than the design days happen. The simulation pass alone cannot see either. |

### 7.5 Reference run

| Case | Reference run |
|---|---|
| `rec` set | The AC run at `rec` |
| `rec` null | The AC run with the highest `fruitingInT` (on a tie the smaller size) |
| Used by | The fogger, fan, walls and roof, wet and breakdown verdicts; `refEq = { ...eq, ac_hp: <its hp> }` |

### 7.6 Fogger and fan confirmation runs

| Machine | When | Run | Result |
|---|---|---|---|
| Fogger | The reference run fails `humidity too low` or `humidity at the low alarm` in a judged (non-spawn) segment | One run `'fogger'` with `refEq` and `fog_lph` = the first `FOGGER_SIZES` value above `eq.fog_lph` (none above: no run) | `too-small` with `recommended` = that size when the run has no such failure, passes `acPass` and has no `temperature too low`; else `not-the-fix` |
| Fan | The fan is not oversized (8.4) and the reference run fails `CO₂ above the limit` in a judged segment | One run `'fan'` with `refEq` and `fan_m3h` = the first `FAN_SIZES` value above `eq.fan_m3h` (none above: no run) | `too-small` with `recommended` when that run has no CO₂ failure; else `not-the-fix` |

### 7.7 Run budget

| Runs | Most |
|---|---|
| Aircond walk (own included) | `RUNS.ac` = 6 |
| Margin run | `RUNS.margin` = 1 |
| Fogger | `RUNS.fogger` = 1 |
| Fan | `RUNS.fan` = 1 |
| A check | `MAX_RUNS` = 9 (measured 2–5, 13.5) |

## 8. Verdicts and texts

### 8.1 Formatting

| Placeholder | Text |
|---|---|
| `{ac(hp)}` | `<hp> hp` when `U === 1`, else `<U> × <hp> hp` (numbers as JavaScript prints them: `1`, `1.5`, `2.5`) |
| `{own}` | `{ac(eq.ac_hp)}` |
| `{crop}` | `CROPS[tg.crop].name` with its first character in lower case (`lion's mane`, `grey oyster`, `milky (Calocybe indica)`); every template uses it mid-sentence. The Report's `crop` field keeps the name as is (11.2). |
| `{spT}` | `tg.spT` as printed (`20`, `25.5`) |
| `{pct(x)}` | `String(Math.round(x))`, except when `x < 95` and `Math.round(x) ≥ 95`: `(Math.floor(x × 10) / 10).toFixed(1)` (never "95 %" for a value under the pass line) |
| `{stages(list)}` | The distinct `STAGES[stage]` names in lower case, in segment order, joined `a`, `a and b`, `a, b and c` (`pinning`, `fruiting`, `rest between flushes`) |
| `{in}` | `{pct(ownRun.fruitingInT)}` |
| `{round(x)}` | `String(Math.round(x))` (shares, airflows, air changes: no pass line, so no `pct` rule) |
| `{fail}` | From the own run's `acFail` (11.3): `why` `temperature too high` → ` In {stage} {flush} it keeps the room within 1 °C of {T} °C only {pct(acFail.inT)} % of the time.` (`{T}` = that segment's `targets.spT`); `why` `block core too hot` → ` In the spawn run the block core gets too hot.` (both with a leading space). The `too-small` rows always have an `acFail` (the own run failed `acPass`, else 7.3 step 4b) |
| `{noReserve}` | `noReserve === 'largest'` (7.4): ` It has no reserve for the hottest days: fix the room first (see the heat breakdown).`; `noReserve === 'too-big'`: ` It is just enough: it has no reserve for the hottest days, but no bigger size holds this room steadier ({ac(next)} is too big).` with `next` = `AC_SIZES[min + 1].hp` (leading space in both; lead decision 45) |
| `{fog}`, `{fan}` | `eq.fog_lph`, `eq.fan_m3h` as printed |
| `{rec}`, `{tried}` | The machine's `recommended` size; the size of its confirmation run (7.6) |
| `{dry}`, `{co2}` | The reference run's judged segments that fail the humidity-low rules / the CO₂ rule |
| `{peak, one decimal}` | `peak.toFixed(1)` |
| `{stage}`, `{flush}` | A segment's `STAGES` name in lower case and its flush number |

### 8.2 Aircond (`ac`)

| `verdict` | When (the first row that applies) | `text` |
|---|---|---|
| `too-small` | `min === null` | `Your {own} aircond is too small for {crop}.{fail} No aircond in the list holds the temperature in this room for the whole cycle` + (`best !== own`: `: the best, {ac(best)}, keeps it {pct(bestRun.fruitingInT)} % of fruiting hours.`; `best === own`: `; none does better than yours ({in} % of fruiting hours).`) + (fan verdict `oversized`, 8.4: ` Fix the fresh air first: your fan is too big (see the fan line).`; otherwise ` Fix the room first (see the heat breakdown).`) (`best` = the reference run's size, 7.5) |
| `too-small` | `own < min` | `Your {own} aircond is too small for {crop}.{fail} You need at least {ac(min)}.` plus ` Buy {ac(rec)} for a margin on the hottest days.` when `rec !== min`, else `{noReserve}` when `noReserve` is not `null` |
| `too-big` | `own > min` and the own run fails `acPass` or has `tooLow` | `Your {own} aircond is too big for this room: it switches on and off and the room drifts out of the band ({stage} {flush}: {pct(worst.inT)} % in band, the pass line is 95 %). {ac(rec)} holds it.` (`worst` = the own run's segment with the lowest `inT`; `{stage}` its `STAGES` name in lower case) |
| `oversized` | `own ≥ rec + 2` (index) | `Your {own} aircond is bigger than this room needs: {ac(rec)} is enough. It works, but a too-big aircond switches on and off more often and takes less water out of the air.` |
| `enough` | otherwise | `Your {own} aircond is enough for {crop}: it keeps the room within 1 °C of {spT} °C {in} % of fruiting hours.` plus, when `own === min` and `rec > min`, ` It is just enough: on the hottest days it has no reserve. {ac(rec)} gives a margin.`, or, when `own === min` and `noReserve` is not `null`, `{noReserve}` |

| Rule | Detail |
|---|---|
| Fruiting hours | `{in}` (fruiting hours in band) appears only where the aircond holds the band (`enough`, and `none does better than yours`); a failing aircond is described by the segment that fails (`{fail}`), so a room that fails only in pinning or in the spawn run is never told a passing fruiting share |
| Measured texts | 13.3, 13.4 |

### 8.3 Fogger (`fogger`)

| `verdict` | When | `text` |
|---|---|---|
| `too-small` | 7.6 | `Your {fog} L/h fogger is too small: the air gets too dry in {stages(dry)}. A {rec} L/h fogger keeps the humidity up.` |
| `not-the-fix` | 7.6 | `The air gets too dry in {stages(dry)}` + (a run was made: `, and a {tried} L/h fogger does not fix it`) + `: the aircond runs so hard that it dries the air. Fix the heat first (see the heat breakdown).` |
| `oversized` | No dry failure, and some `FOGGER_SIZES` value `s < eq.fog_lph` with `s ≥ 1.5 × peak` (`peak` = the reference run's largest hourly fog use outside spawn, L/h); `recommended` = the smallest such `s` | `Your {fog} L/h fogger is bigger than needed: it never used more than {peak, one decimal} L/h in an hour. It works; a {rec} L/h fogger would do.` |
| `enough` | otherwise | `Your {fog} L/h fogger is enough.` |

| Name | Value |
|---|---|
| `peak` | Max over series hours with `stage !== 'spawn'` of `heat.fog` (Wh) × 3600 / 2450 / 1000 (L/h) |

### 8.4 Fresh-air fan (`fan`)

| Name | Value |
|---|---|
| `need` | The largest over the judged stages of `n × c × blockStage[st] / (co2Lim(st) − 100 − 420)` m³/h (air that holds CO₂ at the fan start level) |
| `low` | `eq.fan_m3h / 3` (the fan's lowest speed) |
| `V` | `room.volume \|\| PLANT.room.volume` (m³) |

| `verdict` | When (first that applies) | `text` |
|---|---|---|
| `oversized` | `low > 2 × need` and `R = ` the smallest `FAN_SIZES` value with `R / 3 ≥ 1.25 × need` and `R ≥ FAN_MIN_ACH × V` exists and `R < eq.fan_m3h`; `recommended = R` | `Your fresh-air fan is bigger than needed: at its lowest speed it brings in {round(low)} m³/h, the blocks need about {round(need)} m³/h. All outside air must be cooled and dried: a {R} m³/h fan would do; at full speed it still changes the room's air {round(R / V)} times an hour.` |
| `too-small` | 7.6 | `Your {fan} m³/h fresh-air fan is too small: CO₂ goes above the limit in {stages(co2)}. A {rec} m³/h fan keeps it below.` |
| `not-the-fix` | 7.6 | `CO₂ goes above the limit in {stages(co2)}` + (a run was made: `, and a {tried} m³/h fan does not fix it.`, else `.`) |
| `enough` | otherwise | `Your {fan} m³/h fresh-air fan is enough: the blocks need about {round(need)} m³/h.` |

### 8.5 Walls and roof (`insulation`)

| Name | Value |
|---|---|
| `share` | The walls item of the breakdown (section 9), % |

| `verdict` | When | `text` |
|---|---|---|
| `poor` | `share ≥ SHARE.poor` (40) | `Walls and roof: poor. They bring in {round(share)} % of the heat.` + insulated + drier + typical |
| `fair` | `share ≥ SHARE.fair` (25) | `Walls and roof: fair. They bring in {round(share)} % of the heat.` + insulated + drier + typical |
| `good` | otherwise | `Walls and roof: good. They bring in {round(share)} % of the heat.` + drier + typical |

| Part | Text |
|---|---|
| insulated (poor, fair) | ` With PU panel 75 mm walls and roof the room would need about {ac(insulatedHp)} (quick estimate).` with `insulatedHp = estimate({ ...room, calib: null, equipment: { ...eq, walls: 'pu75', roof: 'pu75' } }, mix, opts).hp` |
| drier (any verdict, when `wet` is not `null`: the reference run is too wet, 8.6) | ` An insulated room also needs drier fresh air.` (lead decision 43: less heat to remove means the aircond takes less water out, 13.4 PU 50 row) |
| typical (`uaSource === 'typical'`) | ` (Typical walls: set the walls and roof of this room for a better answer.)` |

| Order of the parts | Detail |
|---|---|
| `poor`, `fair` | The verdict text, then insulated, then drier, then typical |
| `good` | The verdict text, then drier, then typical |

### 8.6 Too wet (`wet`)

| Field | Value |
|---|---|
| (the object) | `null` unless the reference run has a judged segment failing `humidity near saturation` |
| `stages` | `[{ stage, flush, wet, limit }]` of those segments (`wet` = C7 segment `wet`, %; `limit` = the stage's wet line, `CROPS[tg.crop].wetRH?.[stage] ?? PASS.wetRH`, 5.3) |
| `{seg}` | One listed segment with its own limit (lead decision 46): `<stage> <flush> (above <limit> % RH {pct(wet)} % of the time)`, with `<stage>` its `STAGES` name in lower case (`pinning 1 (above 98 % RH 16 % of the time)`) |
| `{segs}` | Every listed segment as `{seg}`, in segment order, joined `a`, `a and b`, `a, b and c` |
| `text` | `The room is too wet in {segs}. A bigger aircond does not fix this: the outside air brings in more water than the aircond can take out without making the room too cold. Dry the fresh air before it comes in: an energy-recovery unit with a moisture-exchanging core (enthalpy wheel or hygroscopic core), a fresh-air dehumidifier, or add a dehumidifier in the room.` |
| Example (13.4, 2000 blocks at 4 hp) | `The room is too wet in pinning 1 (above 98 % RH 16 % of the time), fruiting 1 (above 95 % RH 15 % of the time), fruiting 2 (above 95 % RH 11 % of the time) and fruiting 3 (above 95 % RH 13 % of the time). A bigger aircond …` (numbers illustrative) |
| Why these devices | equipment-facts 13: a hygroscopic-core or desiccant-wheel energy-recovery unit recovers 50–80 % including moisture; the common aluminium plate unit and plate or run-around exchangers are sensible only (no drying); a pre-cooling coil alone "doesn't improve efficiency significantly" (B19) |

### 8.7 Heat breakdown advice (`breakdown.advice`, `breakdown.text`)

| `advice` | When (first that applies) | `text` |
|---|---|---|
| `insulate` | walls share ≥ `SHARE.poor` (40) | `Most of the heat comes through the walls and roof ({round(walls)} %). Insulate before you buy a bigger aircond.` |
| `fresh-air` | fresh air heat + water ≥ `SHARE.freshAir` (45) | `Most of the heat comes in with the fresh air ({round(air)} %: {round(airHeat)} % heat, {round(airWater)} % water). Bring in only the fresh air the blocks need, and recover its coolness with an energy-recovery unit that also exchanges moisture before you buy a bigger aircond.` (equipment-facts 13: 50–80 % recovered by moisture-exchanging units; plate units are sensible only) |
| `bigger-ac` | otherwise | `The heat comes mostly from the blocks and the room itself, not from the walls or the fresh air: a bigger aircond is the right fix.` |

### 8.8 Summary (`summary`, in this order)

| # | Line | When |
|---|---|---|
| 1 | `ac.text` | Always |
| 2 | `fan.text` | `ac.verdict === 'too-small'` and `fan.verdict === 'oversized'` (the fan is named in line 1 or is a cause of the heat; it comes first) |
| 3 | `wet.text` | `wet` set |
| 4 | `fogger.text` | Always |
| 5 | `fan.text` | Always, unless it is line 2 |
| 6 | `insulation.text` | Always |
| 7 | `breakdown.text` | `ac.verdict === 'too-small'`, or `wet` set, or `noReserve === 'largest'` (7.4; the `'too-big'` text does not point to the breakdown, lead decision 45) |

## 9. Heat breakdown (measured in the simulation)

| Item | Rule |
|---|---|
| Run | The reference run (7.5), with `opts.heat` |
| Hours | The fruiting segments only: `Σ heat` of the segments with `stage === 'fruiting'`; `hours` = their total hours |
| Items, in this order | `walls` `Walls and roof (sun included)` = `walls + sun`; `airHeat` `Fresh air: heat` = `airSens`; `airWater` `Fresh air: water` = `airLat`; `blocks` `Blocks` = `blockSens + blockLat`; `machines` `Machines and lights` = `base + lights` |
| `kwh` | The item's Wh / 1000 (heat, kWh) |
| `share` | `max(0, kwh) / Σ max(0, kwh of the five) × 100`; all 0 when the sum is 0 |
| Not items | `fog`, `water` (net zero for the aircond: their water is the air's lost heat), `people` (0 in C7 runs), `acSens`/`acLat` (the aircond's side of the balance) |

## 10. Progress

| Field | Type | Value |
|---|---|---|
| (when) | – | One Progress per simulated day of every run |
| `run` | integer | 1, 2, … (runs started so far) |
| `maxRuns` | integer | `MAX_RUNS` (9: an upper bound, not the expected count) |
| `kind` | string | `'ac'`, `'fogger'`, `'fan'` |
| `ac_hp`, `ac_units`, `fog_lph`, `fan_m3h` | number | The run's machines (`ac_units` = `eq.ac_units`, the same in every run) |
| `day`, `days` | integer | The C7 Progress `day` and `days` |

## 11. Report object

### 11.1 Impossible mix

| Field | Value |
|---|---|
| `verdict` | `'impossible'` |
| `why` | `commonTargets(mix).conflict` |
| Other keys | None |

### 11.2 A check

| Field | Type | Value |
|---|---|---|
| `verdict` | `'ok'` | The check ran |
| `crop` | string | `CROPS[tg.crop].name` as written (`Lion's mane`; the texts use `{crop}`, 8.1) |
| `targets` | object | `commonTargets(mix)` |
| `inputs` | object | 11.4 |
| `estimate` | object | Section 6 result |
| `runs` | Run[] | AC runs in size order, then the confirmation runs in run order (11.3) |
| `ac` | object | `{ verdict, own, units, min, recommended, noReserve, text }`: `own` = `eq.ac_hp`; `min`, `recommended` hp or `null`; `noReserve` `'largest'`, `'too-big'` or `null` (7.4) |
| `fogger` | object | `{ verdict, own, recommended, peak, text }` plus `tried` (L/h or `null`) for `not-the-fix` |
| `fan` | object | `{ verdict, own, recommended, needM3h, text }` plus `tried` for `not-the-fix` |
| `insulation` | object | `{ verdict, share, uaSource, insulatedHp, text }` (`insulatedHp` `null` when `good`) |
| `wet` | object \| null | 8.6 |
| `breakdown` | object | `{ ac_hp, hours, items: [{ key, label, kwh, share }], advice, text }` |
| `pass` | boolean | The reference run's C7 `totals.pass` (the whole cycle passes with the recommended machines) |
| `summary` | string[] | 8.8 |

### 11.3 Run

| Field | Type | Value |
|---|---|---|
| `kind` | string | `'ac'`, `'fogger'`, `'fan'` |
| `ac_hp`, `ac_units`, `fog_lph`, `fan_m3h` | number | The run's machines |
| `acPass` | boolean | 7.2 |
| `dryPass`, `co2Pass` | boolean | No judged segment fails the humidity-low rules / the CO₂ rule |
| `tooLow` | boolean | Some segment fails `temperature too low` |
| `tooBig` | boolean | 7.3 row 6: index above `min` and (`!acPass` or `tooLow`) (`false` for confirmation runs) |
| `pass` | boolean | C7 `totals.pass` |
| `fruitingInT` | number | `Σ(inT × hours) / Σ hours` over the fruiting segments (% of fruiting time in the temperature band) |
| `worst` | `{ stage, flush, inT }` | The segment with the lowest `inT` (first on a tie) |
| `acFail` | `{ stage, flush, inT, spT, why }` \| `null` | Of the segments that fail `acPass`, the one with the lowest `inT` (first on a tie); `spT` its `targets.spT`; `why` `'temperature too high'` when its `fails` contain it, else `'block core too hot'`. `null` when the run passes `acPass`. Used by `{fail}` (8.1) |
| `kwh`, `kwhPerBlock`, `rmPerBlock` | number | C7 `totals.kwh`, `totals.kwh / n`, `totals.rmPerBlock` (electricity of the whole cycle) |
| `fogPeakLph` | number | 8.3 `peak` |
| `fails` | `[{ stage, flush, fails }]` | The failing segments |
| `hours` | number | Fruiting hours |

### 11.4 `inputs`

| Field | Value |
|---|---|
| `equipment` | `eq` (all 7 fields) |
| `uaSource` | 4.5 |
| `ua` | `ClimateCapacity.roomOf({ ...room, plant: plantOf(eq, room) }).ua` (W/K) |
| `solarPeakW` | `ClimateSim.plantOf(plantOf(eq, room)).loads.solarPeakW` |
| `blocks` | `n` |
| `farmType` | `cfg.farmType` |
| `region` | `opts.region \|\| 'my-lowland'` |
| `tariff` | `opts.tariff ?? 0.57` |

## 12. Where C8 sits in the other contracts (frozen together with them)

The draft of this section proposed exact changes to the room-centred amendments. The lead folded them into the contracts named below (revision 2); those contracts are now the authority for each part, and this section only says where each part is.

### 12.1 The placeholders of the drafts

| Draft placeholder | Place | Filled in | Content |
|---|---|---|---|
| H1 | C1 upgrade 2 SQL | C1 revision 5, section 4.3 | `CREATE TABLE room_equipment` in upgrade 2 (lead decision 54: wave 2 adds no other upgrade); the `simulation_runs` `CHECK`s take kind `equipment` and its verdicts; `calibrations.equipment` (lead decision 50) |
| H2 | C1 functions and fake | C1 sections 6.13 (summary rule of `kind = 'equipment'`), 6.14 (`getEquipment`, `saveEquipment`), 8, 9 | – |
| H3 | C1 `db.version` | C1 sections 3, 6.3, 9.1 | `2` |
| H4 | C2 adapter factory, `createSimAdapter` | C2 revision 8, sections 1, 8.1, 12.2, 13.1, 15, 17 | `equipment` → `env.plant`; positions stay `DEFAULT_ENV` |
| H5 | C3 routes | C3 revision 8, sections 6.25, 6.26 | `GET`, `PUT /api/rooms/:id/equipment` |
| H6 | C3 `inputs.equipment` | C3 sections 3.10.1, 7.6, 7.7 | The room's Equipment (7 fields) or `null`; required for kind `equipment` |
| H7 | C5 Simulate tab slot | C5 revision 7, sections 3.10, 3.12 | The **Your machines** card `web/room-equipment.js` |
| H8 | C5 `FarmApi` | C5 section 4.3 | `getEquipment`, `saveEquipment` |
| H9 | C7 `room` argument | C7 revision 2 | `room.plant`, `opts.heat`, the per-crop, per-stage wet line (5.3) |
| H10 | Drawing positions per room | Not in wave 2 | Inlet and outlet positions stay `DEFAULT_ENV` (`high`, `low`) for every room (section 15 item 6) |
| H11 | Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | The Equipment stream, prep 2.0 stub, gate 2.5 and wave 3 order (12.7) |

### 12.2 C1 (`docs/contracts/db.md`, revision 5)

| C1 place | C8 part |
|---|---|
| 4.3 upgrade 2 SQL | `room_equipment` (one row per room, replaced on save; `CHECK`s from 4.1–4.3 of this contract); `simulation_runs` kind `equipment` with verdicts `enough`, `too-small`, `too-big`, `oversized`, `impossible`; `calibrations.equipment` (JSON, nullable) |
| 4.2 `room_equipment`, `simulation_runs`, `calibrations` | Column meanings |
| 6.2 shapes | `Equipment` = `{ room_id, saved_at, ac_hp, ac_units, fog_lph, fan_m3h, walls, roof, height }`; `Calibration` adds `equipment` |
| 6.13 summary columns | `kind = 'equipment'`: `verdict` = `'impossible'` when `result.verdict === 'impossible'`, else `result.ac.verdict`; `blocks` as the other kinds; `days`, `kwh`, `rm`, `utilisation` `null` |
| 6.14 | `getEquipment(roomId)` → `Equipment` or `null`; `saveEquipment(roomId, eq)` (the 7 fields, all required; upsert) |
| 8, 9 | Tests (the six `CHECK`/type failures checked on node:sqlite, Node 22.20) and the fake's lists |

### 12.3 C2 (`docs/contracts/rooms.md`, revision 8)

| C2 place | C8 part |
|---|---|
| 1 files | `server/sim-adapter.js` requires `../sim.js`, `../runtime.js`, `../equipment.js` (only `plantOf` is used) |
| 8.1 loop start | `equipment = db.getEquipment(id)` (`null` when none); passed to the adapter factory |
| 12.2, 13.1 | `env.plant = ClimateEquipment.plantOf(equipment, { volume: room.volume, calib })` when `equipment` is not `null`; `env.inletAt`, `env.exhaustAt` stay `DEFAULT_ENV` |
| 8.1 note | An equipment save does not restart the room; the live room uses the new machines after its next restart (as the mix) |
| 17 test "Room equipment" | Saved equipment `{ ac_hp: 3, ac_units: 1, fog_lph: 6, fan_m3h: 600, walls: 'pu50', roof: 'pu50', height: 3 }` gives `env.plant.ac.capW === 7910` and `env.plant.room.ua` ≈ 28.12 without a calibration, no `plant.room` with one, and no `env.plant` without equipment. Skipped (`test(…, { skip: … })` with the reason `plantOf throws 'stub' (prep 2.0 stub of equipment.js)`) while `ClimateEquipment.plantOf` throws `Error('stub')`; it runs at gate 2.5 after the Equipment merge (lead decision 48) |

### 12.4 C3 (`docs/contracts/api.md`, revision 8)

| C3 place | C8 part |
|---|---|
| 3.11 Equipment | `{ room_id, saved_at, ac_hp, ac_units, fog_lph, fan_m3h, walls, roof, height }` |
| 3.10.1 `inputs.equipment` | The room's Equipment fields at run time, or `null` when the room has none |
| 4 errors | 400 `Invalid equipment` (6.26) |
| 6.25, 6.26 | `GET /api/rooms/:id/equipment` → Equipment or `null`; `PUT` the 7 fields → Equipment (no stream event; the live room uses it after its next restart) |
| 7.1 | `server/api.js` and `tests/room-rules.test.js` require `../sim.js`, `../controller.js`, `../runtime.js`, `../calib.js`, `../capacity.js`, `../cycle.js`, `../equipment.js`, then `../room-rules.js`; `room-rules.js` reads `global.ClimateEquipment` at load |
| 7.4 | `checkCalibration` takes an optional `equipment` (`null` or passing `checkEquipmentBody`; lead decision 50) |
| 7.6 | `checkSimulationRun` kind `equipment` |
| 7.7 | `checkEquipmentBody(body)` |
| 9 | `/equipment.js` served |

### 12.5 C5 and C6 (`docs/contracts/web.md`, revision 7)

| C5 place | C8 part |
|---|---|
| 1.1, 1.3, 1.2 | `equipment.js` (`ClimateEquipment`) after `cycle.js`; `web/room-equipment.js` (`FarmEquipmentCard`) before `web/room-simulate.js` |
| 1.7 | The prep 2.0 stub `equipment.js` (12.7) |
| 3.10 Simulate tab | Load at mount adds `getEquipment(id)`; every run's `room` gains `plant` when the room has Equipment; `inputs.equipment`; the slot `div[data-slot="equipment-check"]` is its own grid item after the Result card and before Saved runs (not inside the mix card); kind `equipment` in Saved runs |
| 3.11 Calibrate tab | Load at mount adds `getEquipment(id)`; `envBase.plant = ClimateEquipment.plantOf(equipment, { volume, calib: {} })` (machines only; the sun stays 500 W, 4.5); the calibration body carries `equipment`; a warning when the room's machines differ from the applied calibration's (lead decision 50) |
| 3.12 | The **Your machines** card (`FarmEquipmentCard`): markup, save, check, progress texts, `renderReport`, helpers |
| 3.8 CSS | `.equip-form`, `.equip-bar` in the Room shell's `/* Room page */` block (lead decision 32) |
| 4.3, 4.5 | `getEquipment`, `saveEquipment`; fake defaults `GET …/equipment` → 200 `null`, `PUT` echoes the body |
| 7.7 | `inCrop` lists lion's mane (5.4.3) |
| 7.8 | The Test bench uses `PLANT` machines in wave 2, also on `#/simulator/:id` |
| 7.10 | `tests/web-room-equipment.test.js` and the card's headless check, after gate 2.5 (lead decision 49) |

### 12.6 C7 (`docs/contracts/cycle.md`, revision 2)

| C7 place | C8 part |
|---|---|
| Header, 2.1, 3, 7.1, 8.1, 8.2, 12.2, 12.4, 15 | Section 5.3: check 2b; `e.plant`; step 2a; `heat` on Segment and Hour only with `opts.heat`; the 8.2 wet counter against the stage's wet line (default 95, lead decision 40) |
| 14 tests | `room.plant` = `plantOf(DEFAULTS)` gives a deep-equal Result; a `plant` with `ac.capW` 2640 lowers `inT`; `opts.heat` adds `heat` with 13 keys and a segment's `heat` equals the sum of its hours; without `opts.heat` no `heat` key; `plant: 5` → `runCycle: plant must be an object`; a short lion's mane cycle scores pinning `wet` against 98 % |

### 12.7 Lead decisions 33–39 and the wave 2 rows

Decisions 33–39 are recorded in `LEAD-DECISIONS.md` (repeated here for C8 readers):

| # | Topic | Decision |
|---|---|---|
| 33 | Room equipment | One `room_equipment` row per room (4.2), in upgrade 2 (lead decision 54) |
| 34 | Machines in the simulation | `env.plant` (one-level override of `PLANT`) and `room.plant` (C7, `capacity.js`); `ClimateEquipment.plantOf` maps Equipment to it; `DEFAULTS` = today's `PLANT` exactly |
| 35 | Every Simulate run and the live room use the room's machines | Simulate's capacity and cycle runs pass `room.plant`; the live sim sets `env.plant` at loop start; the Calibrate tab fits with them (4.5) |
| 36 | Heat accounting | `sim.heatJ()` and C7 `opts.heat`; the breakdown is over fruiting hours of the reference run |
| 37 | Lion's mane draft and cool-crop rules | `CROPS.lionsmane` (pinning 17 °C, `cool: true`, `wetRH: { pinning: 98 }`); the three rules only for `cool` crops; C7 scores the wet line per crop and stage (95 % unless a crop sets `wetRH`, lead decision 40); vectors unchanged plus `cool-crop.json`; `select#inCrop` gains the lion's mane option (lead decision 47) |
| 38 | Search and verdicts | Sections 7 and 8: estimate-started one-step walk with a passing own size winning (7.3 step 4b), `MARGIN` 1.2, `RUNS` 6+1+1+1, the AC judged on temperature and block core only (a size above the minimum that overcools is too big), humidity and CO₂ judged per machine, a too-small text names the failing stage |
| 39 | Equipment checks are simulation runs | Kind `equipment` in `simulation_runs`, run in the browser (lead decision 17), saved through C3 6.21, no series stored |

| Wave 2 item (authority: the wave 2 plan) | Rule |
|---|---|
| Equipment stream owns | `equipment.js` (replaces the prep 2.0 stub), `sim.js`, `capacity.js`, `cycle.js`, `controller.js`, `web/settings-panel.js` (the `#inCrop` option only, lead decision 47), `tools/make-vectors.js`, `tests/vectors/cool-crop.json`, `tests/sim.test.js`, `tests/equipment.test.js`, `tests/web-settings-panel.test.js`, `tests/cycle.test.js` (append), `tests/controller.test.js` (append), `tests/capacity.test.js` (append), `web/room-equipment.js`, `tests/web-room-equipment.test.js`, `docs/superpowers/plans/2026-10-08-farm-foundation/equipment.md` (a byte-for-byte copy of the brief the lead gives it) |
| Prep 2.0 stub (lead) | `equipment.js` exporting the frozen constants (`AC_SIZES`, `CONSTRUCTIONS`, `FOGGER_SIZES`, `FAN_SIZES`, `DEFAULTS`, `LIMITS`, `FAN_MIN_ACH`, `SOL_AIR_K`, `MARGIN`, `SHARE`, `RUNS`, `MAX_RUNS`, deep-frozen as 4.1) and the real `checkEquipment` (4.3); `geometry`, `shell`, `plantOf`, `estimate`, `runCheckSteps`, `runCheck`, `runCheckAsync` throw `Error('stub')`. Done when `require('./equipment.js')` after the five files of section 1 works, `checkEquipment(DEFAULTS)` is `[]` and `plantOf` throws `stub`. |
| Order | Server and web streams build against the fakes and the stub. Gate 2.5 merges Data 2, Equipment, then Server 2, so the real `equipment.js`, `sim.js` and `cycle.js` arrive with the Equipment merge, before Server 2; the C2 equipment test then runs. The card's headless check runs after gate 2.5; its fixes merge in wave 3 (lead decisions 48, 49). |
| `controller.js`, `sim.js`, `cycle.js` owner | Only the Equipment stream changes them in wave 2 (`cycle.js` under C7 revision 2) |
| Lead wave 3 | `tests/web-load.test.js` (globals `ClimateCycle`, `ClimateEquipment`, `FarmRoomTabs`, `FarmEquipmentCard`); the headless check of the card inside the Simulate tab (mount, **Check my machines** with a short program, the Saved runs row `Equipment`, **Open**) |

## 13. Measured on the draft (prototype in `/home/foqcus/Documents/mushroom-farm-c8/proto`, Node 22.20, `master` 91ba1b6; revision 1 numbers re-measured on the revision 1 prototype)

### 13.1 Code checks

| Check | Result |
|---|---|
| `npm test` with the 5.1–5.4 changes | 575 pass, 0 fail (573 + the new vector + CROPLIST); revision 0 without CROPLIST: 574 |
| Vectors | The 8 existing files byte-identical after `node tools/make-vectors.js`; `cool-crop.json` 1441 steps, 228 KB |
| C7 default cycle (2000 grey oyster), changed modules vs `master` | Deep-equal; also deep-equal with `room.plant = plantOf(DEFAULTS)`; with `opts.heat` deep-equal after removing `heat` (revision 1, with `wetRH`: `identity.js` against an exported `master` tree, `identity ok`) |
| `heat` segment vs sum of its hours | Largest difference 2.2e-8 Wh |
| Energy closure (aircond removal / sources), oyster default | Fruiting 0.998–1.000, rest 1.001–1.002, spawn 1.000, pinning 0.926 (water lost at saturation) |
| `opts.heat` cost | About 4–10 % run time (two measurements: +3.8 %, +9.6 %; timing noise on a shared machine) |

### 13.2 The wet failure (60 m³, 1000 lion's mane, typical room)

| Run (full program of 13.3 unless noted) | Pinning (`inT` / `wet`, %) | Fruiting (`inT` / `wet`, %) |
|---|---|---|
| `master` controller, 3500 W, pinning 16 °C | 41.0 / 43.4 | 81.0–86.9 / 27.1–31.6 |
| `master` controller, 8000 W, pinning 16 °C | 91.2 / 84.2 | 96.6–97.4 / 58.7–65.6 |
| `master` controller, 12000 W, pinning 16 °C | 94.6 / 89.6 | 98.5–99.7 / 80.5–86.1 |
| + coil airflow scaled, 7910 W (short program: 3 days each), pinning 16 °C | 76.4 / 41.7 | 95.7 / 25.0 |
| + wet outdoor air rule, 5280 W, pinning 16 °C | 95.1 / 33.8 | 98.1–100 / 0.9–4.3 |
| + wet rule, 6810 W (no other C8 rule), pinning 16 °C | 82.1 / 35.3 (`temperature too high`: heat flapping) | 98.1–99.5 / 1.7–5.1 |
| C8 revision 0 (all three rules, pinning 17 °C, wet line 95 %), 5280 W | 97.0 / 25.5 | 99.5 overall / passes |
| C8 revision 1 (`wetRH` pinning 98 %), 2 / 2.5 / 4 hp | 97.0 / 2.7, 97.0 / 1.7, 97.2 / 1.4 (wet = above 98 %): pinning passes | 2 and 2.5 hp pass (wet 0.9–5.5 %); 4 hp fruiting 1 too wet (10.3 %) |
| C8 without the no-heat rule (farmer's 4 hp) | 2.5 hp: 90.3 / – (`temperature too high`); the check calls 4 hp `too small` and asks for 5 hp | – |
| C8 (farmer's 4 hp) | 2.5 hp: 97.0 / 24.1; 4 hp `bigger than needed`, buy 2.5 hp | – |
| Pinning `wet` against the pinning target (3 design days, 5280 W) | Wet rule only: 16 °C 23–41 %, 18 °C 13–21 %, 20 °C 5–10 % (RH targets 86–92 %). Wet and no-heat rules, 17 °C, CO₂ limit 1000 instead of 700: 11.7–13.2 % | – |
| Conclusion | Pinning stays above 95 % RH 24–40 % of the time at every size because its CO₂ limit (700 ppm) keeps the fan at Low (300 m³/h) all night. Growers hold pinning at 90–100 % RH (research), so revision 1 scores lion's mane pinning against 98 % (`wetRH`, 5.4.2): then pinning passes at 2–4 hp. A room that is still too wet is reported as the fresh-air problem (8.6), not an aircond size | – |

### 13.3 The owner's example: 60 m³, 1000 lion's mane blocks

| Input | Value |
|---|---|
| Program | Days 21/5/8/14 (spawn, pinning, fruiting, rest), 3 flushes, full: 78 days |
| Room | 60 m³, supply vent, typical walls (UA 80 W/K, sun 500 W) |
| Machines | 3 L/h fogger, 900 m³/h fan, the farmer's aircond (rows below) |
| Tariff | 0.57 RM/kWh |
| Estimate | 5626 W (pinning) → 2.5 hp |

| Aircond | Fruiting hours at 20 °C | Worst stage | kWh per block | RM per block | AC result | Whole cycle |
|---|---|---|---|---|---|---|
| 1 hp | 46.7 % | pinning 11.0 % | 0.954 | 0.544 | too small | fails (temperature too high) |
| 1.5 hp | 80.4 % | pinning 63.9 % | 1.032 | 0.588 | too small | fails (temperature too high) |
| 2 hp (smallest that works) | 99.5 % | pinning 97.0 % | 1.088 | 0.620 | holds it | **passes** (pinning above 98 %: 2.7 %; revision 0 with the 95 % line: pinning too wet, 25.5 %) |
| 2.5 hp (buy this) | 99.0 % | pinning 97.0 % | 1.118 | 0.637 | holds it | **passes** (pinning above 98 %: 1.7 %; revision 0: too wet, 24.1 %) |
| 4 hp | 97.3 % | fruiting 96.7 % | 1.194 | 0.680 | holds it (bigger than needed) | fruiting 1 too wet (10.3 %) |

| Farmer's aircond | Runs (sizes) | Time (Node, serial) | Summary line 1 |
|---|---|---|---|
| 1 hp | 4 (1, 2.5, 2, 1.5) | 19.5–21.3 s | `Your 1 hp aircond is too small for lion's mane. In pinning 1 it keeps the room within 1 °C of 17 °C only 11 % of the time. You need at least 2 hp. Buy 2.5 hp for a margin on the hottest days.` |
| 1.5 hp | 3 (1.5, 2.5, 2) | 15.7 s | `Your 1.5 hp aircond is too small for lion's mane. In pinning 1 it keeps the room within 1 °C of 17 °C only 64 % of the time. You need at least 2 hp. Buy 2.5 hp for a margin on the hottest days.` |
| 2.5 hp (recommended) | 3 (2.5, 2, 1.5) | 14.8 s | `Your 2.5 hp aircond is enough for lion's mane: it keeps the room within 1 °C of 20 °C 99 % of fruiting hours.` |
| 2 hp | 3 (2, 2.5, 1.5) | 14.1 s | `Your 2 hp aircond is enough for lion's mane: it keeps the room within 1 °C of 20 °C 99 % of fruiting hours. It is just enough: on the hottest days it has no reserve. 2.5 hp gives a margin.` |
| 4 hp | 4 (4, 2.5, 2, 1.5) | 18.8 s | `Your 4 hp aircond is bigger than this room needs: 2.5 hp is enough. It works, but a too-big aircond switches on and off more often and takes less water out of the air.` |

| Other lines (every case above) | Text |
|---|---|
| Wet | None (`wet` `null`): pinning is above 98 % only 1.7–2.7 % of the time (revision 0, 95 % line: `The room is too wet in pinning (above 95 % RH up to 24 % of the time)…`) |
| Fogger | `Your 3 L/h fogger is enough.` (peak use 1.0 L/h at 2.5 hp) |
| Fan | `Your 900 m³/h fresh-air fan is enough: the blocks need about 250 m³/h.` |
| Walls and roof | `Walls and roof: fair. They bring in 28 % of the heat. With PU panel 75 mm walls and roof the room would need about 2 hp (quick estimate). (Typical walls: …)` |
| Advice (summary line 5 for 1 and 1.5 hp, the `too-small` cases) | `Most of the heat comes in with the fresh air (55 %: 25 % heat, 30 % water). Bring in only the fresh air the blocks need, and recover its coolness with an energy-recovery unit that also exchanges moisture before you buy a bigger aircond.` |
| Whole check | `pass` `true` (the reference run, 2.5 hp, passes the whole cycle); summary 5 lines for 1 and 1.5 hp, 4 lines otherwise |

| Heat breakdown (2.5 hp, 576 fruiting hours) | kWh (heat) | Share |
|---|---|---|
| Walls and roof (sun included) | 438 | 28.1 % |
| Fresh air: heat | 390 | 25.0 % |
| Fresh air: water | 467 | 29.9 % |
| Blocks | 226 | 14.5 % |
| Machines and lights | 40 | 2.6 % |

| Same room, farm type `ready` (fruiting and rest, 52 days), 1 hp | Result |
|---|---|
| Estimate | 4762 W (fruiting) → 2 hp |
| Runs | 1 hp 47.1 %, 1.5 hp 81.4 %, 2 hp 99.8 % (whole cycle **passes**), 2.5 hp 99.4 % (**passes**); 4 runs, 23 s |
| Verdict | `Your 1 hp aircond is too small for lion's mane. In fruiting 2 it keeps the room within 1 °C of 20 °C only 46 % of the time. You need at least 2 hp. Buy 2.5 hp for a margin on the hottest days.` Fan (summary line 2, 8.8): `… a 600 m³/h fan would do; at full speed it still changes the room's air 10 times an hour.` (Low 300 m³/h, need 94 m³/h; 600 ≥ `FAN_MIN_ACH` × 60 = 300). |
| Conclusion | A correctly sized lion's mane room with typical walls passes the whole cycle, with ready blocks and (revision 1, pinning wet line 98 %) with its own spawn run and pinning. Revision 0 (95 % line) failed pinning on humidity at every size. |

### 13.4 Other rooms (1 hp farmer's aircond unless noted; lion's mane, full, 1000 blocks, 60 m³ unless noted)

| Room | Estimate | Sizes run | Smallest / buy | Notes |
|---|---|---|---|---|
| PU 50 walls and roof (UA 28.1, sun 198 W) | 4586 W → 2 hp | 1, 2, 1.5, 2.5 | 2 / 2.5 | Walls 15 % (good); too wet at every size: fruiting 20–25 % above 95 %, pinning 13–19 % above 98 % (an insulated room needs less cooling and dries less; section 15 item 11). 1 hp: `… In pinning 1 it keeps the room within 1 °C of 17 °C only 38 % of the time.` (fruiting 94.4 %) |
| Brick 115 walls, zinc roof (UA 283.4, sun 4420 W) | 12464 W → 5 hp | 1, 5, 4, 3 | 4 / 5 | Too dry at every size; a 6 L/h fogger is `not-the-fix` (room too cold); walls 58 % → `insulate`; PU 75 estimate about 2 hp |
| Zinc walls and roof (UA 629, sun 4420 W) | 17890 W → 6 hp | 1, 6, 5 | 6 / 6 (no bigger size; 16120 W against a need of 17890 W) | `… You need at least 6 hp. It has no reserve for the hottest days: fix the room first (see the heat breakdown).` Too dry; a 6 L/h fogger is `not-the-fix`; walls 70 % → `insulate`; 4.05 kWh per block at 6 hp (typical room at 2.5 hp: 1.12) |
| 2000 blocks, farmer's 5 hp | 9509 W → 4 hp | 5, 4, 3 | 4 / 4 (5 hp fails: too big) | `Your 5 hp aircond is too big for this room: … (fruiting 1: 94.5 % in band, the pass line is 95 %). 4 hp holds it.` Too wet at 4 hp: pinning 16 % above 98 %, fruiting 11–15 % above 95 % |
| 120 m³, EPS 75, 2000 blocks | 9133 W → 4 hp | 1, 4, 5, 6 | none | Best 4 hp: fruiting 95.9 %, fruiting 1 at 94.7 %; wet at 4 hp: pinning 15.5 % above 98 %, fruiting 10.5–14.3 % above 95 % (revision 0: 41 % above 95 %); fresh air 55 % → `fresh-air` |
| Grey oyster 2000, farmer's 1.5 hp | 4801 W → 2 hp | 1.5, 2, 1 | 1.5 / 2 | `Your 1.5 hp aircond is enough for grey oyster: it keeps the room within 1 °C of 25 °C 100 % of fruiting hours. It is just enough …`; the whole cycle passes (as C7) |
| Grey oyster 2000, farmer's 6 hp | 4801 W → 2 hp | 6, 2, 1.5, 1 | 1.5 / 2 | 6 hp passes `acPass` but fails `temperature too low` in pinning (94.8 %; C7 `totals.pass` false): revision 1 `too-big`, `tooBig` on 6 hp, `Your 6 hp aircond is too big for this room: … (pinning 1: 94.8 % in band, the pass line is 95 %). 2 hp holds it.` (revision 0 said `oversized … It works`) |
| 2 × 1 hp | 5626 W → 2 × 1.5 hp | 1, 1.5 (per unit) | 2 × 1 / 2 × 1.5 | Same physics as one 2 hp (equal kWh) |
| Exhaust vent, 1.5 hp | 5916 W → 2.5 hp | 1.5, 2.5, 2 | 2 / 2.5 | 74.6 % at 1.5 hp |
| 2.5 hp, 14 L/h fogger, 1800 m³/h fan | 9248 W → 4 hp | 2.5, 4, 5, 6 | none | Low 600 m³/h of wet air: the room fails at every size (2.5 hp best, 97 % of fruiting hours; its pinning 93.2 %). Summary line 1: `Your 2.5 hp aircond is too small for lion's mane. In pinning 1 it keeps the room within 1 °C of 17 °C only 93 % of the time. No aircond in the list holds the temperature in this room for the whole cycle; none does better than yours (97 % of fruiting hours). Fix the fresh air first: your fan is too big (see the fan line).` Line 2: the fan, `a 1200 m³/h fan would do` |

### 13.5 Speed

| Measure | Value |
|---|---|
| One run (78-day lion's mane cycle with `opts.heat`), Node 22.20 | 4.3–5.4 s (serial) |
| One run, desktop Chrome 152 (headless) | 3.7 s |
| Owner's example from 1 hp, Node / Chrome | 19.5–21.3 s / 14.8 s (4 runs) |
| Runs per check in 13.3–13.4 | 2–5 (fogger and fan confirmations included; 4 for the new grey oyster 6 hp row) |
| `estimate` | 0.1–0.3 ms (0.16 ms in revision 1) |
| A phone | 2–3 × desktop (room-centred draft, risks): about 30–60 s for 4 runs |

## 14. Tests

The work brief lists them with exact inputs. Required coverage:

| # | File | Test |
|---|---|---|
| 1 | `tests/equipment.test.js` | Catalogue values and frozenness (each `AC_SIZES` and `CONSTRUCTIONS` entry too); `DEFAULTS` keys equal the Equipment fields |
| 2 | same | `checkEquipment`: every problem of 4.3 with its exact text and order; partial objects valid |
| 3 | same | `geometry`, `shell` (60 m³ and 120 m³ examples of 4.4) |
| 4 | same | `plantOf`: mapping of 4.5; `DEFAULTS` gives `PLANT`'s values; calibration drops `room` and `loads` |
| 5 | same | `estimate`: the 4.4 rooms give the needs and sizes of 13.3–13.4 (±1 W) |
| 6 | same | Input errors of section 3, impossible mix, async rejection |
| 7 | same | Search with a scripted runner (`opts.runCycleSteps`): up-walk, down-walk, run reuse, `RUNS.ac` limit, margin run, `rec` stays `min` when `min + 1` fails or is too cold, own passes below a failing estimate (4b), `tooBig` for `!acPass` and for `tooLow`, `min === null` and the best run (also when the best is the own size), `noReserve` with both reasons (`'largest'` when 6 hp is the minimum; `'too-big'` when the margin run fails as too big, including too cold) |
| 8 | same | Verdict texts of 8.2–8.8 for scripted reports (each row of each table, both `{fail}` forms, both `{noReserve}` texts, the fan-first summary order); summary line 7 present for `noReserve === 'largest'` and absent for `'too-big'`; the walls and roof text with and without the drier part (`wet` set or `null`, for `good` and for `fair`); the wet text with two segments of different limits (pinning 98, fruiting 95), each quoted with its own limit |
| 9 | same | Progress fields and count |
| 10 | same | Real check: the owner's example from 1 hp: `min` 2, `recommended` 2.5, sizes run `[1, 1.5, 2, 2.5]`, summary line 1 exactly as 13.3, `wet` `null`, `pass` `true`, time logged, under 120 s |
| 11 | `tests/cycle.test.js` | C7 revision 2 rows of 12.6, including the per-stage wet line (5.3) |
| 12 | `tests/capacity.test.js` | `roomOf` with `plant.room`; `trial` with a 2640 W plant lowers `inT`; `balance` with `plant` |
| 13 | `tests/sim.test.js` (new) | `plantOf(undefined) === PLANT`; `env.plant` changes `capW`; `heatJ` keys and closure; `snapshot()` has no `flowJ` |
| 14 | `tests/controller.test.js` | `CROPS.lionsmane` exact (with `cool` and `wetRH`); the three cool-crop rules on and off (the same readings with `crop: 'oyster'` keep today's commands) |
| 14b | `tests/web-settings-panel.test.js` (new) | CROPLIST: `select#inCrop` options equal the `CROPS` keys with a `range` (5.4.3) |
| 15 | `tests/vectors.test.js` | Unchanged file; 9 vectors pass |
| 16 | `tests/web-room-equipment.test.js` | Card helpers (C5 3.12) |

## 15. Not in this contract and the lead's decisions on the open items

| # | Item | Status |
|---|---|---|
| 1 | Pinning of lion's mane stays above 95 % RH 24–40 % of the time at every aircond size (13.2): its sources want 90–100 % RH in pinning (S12, S15 95–100). Options: (A, revision 0) keep `PASS.wetRH` 95 for every crop and tell the farmer to dry the fresh air; (B, revision 1) a per-crop, per-stage wet line, `CROPS.lionsmane.wetRH = { pinning: 98 }`, a C7 scoring change (5.3, 5.4.2; full cycle above 98 %: 1.4–2.7 % at 2–4 hp, passes). If the lead keeps A: 8.6 must skip the dehumidifier advice for a stage whose research RH range reaches 95 % or more and say `the app's 95 % limit is stricter than growers use for pinning`; 13.3 and REAL1 go back to revision 0 (`wet` pinning) | Decided: B (lead decision 40). Fruiting keeps 95 % |
| 2 | A moisture-exchanging energy-recovery unit or a fresh-air dehumidifier as a machine the simulation can run (to confirm the "dry the fresh air" advice) | Later (a new `env.plant` key) |
| 3 | The no-heat and no-wind-down rules for every crop: two oyster vectors show heat mode with 31 °C outside | Later; needs new vectors (`node tools/make-vectors.js`) and new C7 numbers |
| 4 | A fan bigger than the room needs makes the aircond check fail at every size (13.4, last row) | Handled by the text (revision 1): the aircond line says `Fix the fresh air first: your fan is too big (see the fan line)` and the fan line comes second (8.2, 8.8); the wording of review findings 4 and 17 is kept, with `none does better than yours` (lead decision 41). A later search could run the fan fix first. |
| 5 | No source: aircond capacity at a 16–20 °C room, prices, a low-temperature (8 °C) unit (the margin rule stands in); `SOL_AIR_K` 26 K is the ASHRAE light-roof value, while bare or dark zinc can reach 52 K (α/hₒ 0.052), so the zinc-roof rooms (13.4) may be optimistic by about 4400 W of sun at noon; `FAN_SIZES` is a step list, not market sizes (equipment-facts 16) | No source. A per-construction value (`CONSTRUCTIONS[k].solAirK`: zinc 52, panels 26) is a later item (lead decision 44); `SOL_AIR_K` 26 stays in wave 2 |
| 6 | Drawing positions per room (H10), wall sun, floor U-value | Later |
| 7 | Program per crop (lion's mane 21/5/8/14 × 3 is the room's settings, not part of `CROPS`) | The farmer sets it in the room settings |
| 8 | Electricity of the confirmation runs and of a fresh-air fix in RM per kg | Later (roadmap: Costs, Economics) |
| 9 | The rows the room-centred draft had to carry (`equipment.js`, `web/room-equipment.js`, the contract freeze, the merge position) | Done: folded into C1–C7 and the wave 2 plan by the lead (section 12) |
| 10 | `calib.js` limits `ua` to 20–400 W/K, but the construction UA of zinc/zinc (629) and PU 100 (14.8) lie outside it. An applied calibration wins (4.5), so for such a room a clipped calibration (20 or 400) silently replaces a more accurate construction value. Option: when the applied calibration's `ua` sits at a limit and walls and roof are set, use the construction `ua` (`uaSource` `construction`) and say so in the insulation text; this needs the calibration replaced in `room.calib` before C7 (`roomOf` applies it after `plant.room`), also in the Simulate tab and the live adapter | Deferred (lead decision 42): a later item; no change in wave 2 |
| 11 | An insulated room (PU 50) is too wet in fruiting at every aircond size (20–25 % above 95 %; 13.4): less heat to remove means less water taken out. The insulation text for poor and fair rooms could add `an insulated room also needs drier fresh air`. | Decided (lead decision 43): when the reference run is too wet, the walls and roof text adds ` An insulated room also needs drier fresh air.` for every verdict (8.5) |

## 16. Change log

| Revision | Date | Changes |
|---|---|---|
| 0 | 2026-10-08 | First draft for review |
| 2 | 2026-10-08 | Frozen by the lead (table "Changes in revision 2" at the top): the room-centred amendments' section 14.2 applied (one upgrade 2, require order, stub exports, slot placement, Calibrate row), lead decisions 40–54 applied, section 12 folded into C1–C7 and the wave 2 plan, research copied to `docs/research/` |
| 1 | 2026-10-08 | Review findings 1–29 (table below): the own-size rule of the search (7.3 step 4b); `tooLow` makes a size too big (7.3, 7.4, 8.2); too-small texts name the failing stage (`{fail}`) and the no-reserve case; fan-first text and order; fan size kept at 5 air changes per hour; wet and fresh-air advice name moisture-exchanging units; lion's mane pinning wet line 98 % (option B, C7 scoring); `#inCrop` option; deep-frozen catalogue; `ac_units` in Progress; card inputs and progress texts; Room shell, lead prep and wave 3 rows; the contract frozen by the lead; drafts moved to `/home/foqcus/Documents/mushroom-farm-c8/`; numbers in 13 re-measured |

| Finding | Section(s) changed | Change |
|---|---|---|
| 1, 16 (own passes below a failing estimate) | 7.3 | Step 4b; step 5 reworded; row 6 notes sizes between own and the walk's result |
| 2, 18 (overcooling never too big) | 7.2, 7.3 row 6, 7.4, 8.2, 11.3, 13.4 | `tooBig` and `too-big` use `!acPass` or `tooLow`; `rec = min + 1` needs no `tooLow`; brief test S-COLD; measured grey oyster 2000 blocks, 6 hp |
| 3 (`#inCrop` list) | 1, 5.4.3, 12.7, 14 | `web/settings-panel.js` option, test CROPLIST |
| 4, 17 (too-small texts quote fruiting) | 8.1 `{fail}`, 8.2, 11.3 `acFail`, 13.3, 13.4 | The failing segment is named (`In pinning 1 it keeps the room within 1 °C of 17 °C only 11 % of the time.`); `none does better than yours` when the best is the own size |
| 5 (`/tmp` and the shared tree) | Header, 13 | Paths under `/home/foqcus/Documents/mushroom-farm-c8/`; `identity.js` reads an exported `master` (`MDIR`) |
| 6 | 13.3 | 52 days |
| 7 | 5.4.3 | Wet outdoor air row numbers |
| 8 | 13.1, 13.5, 2 | Heat cost 4–10 %; `estimate` 0.1–0.3 ms |
| 9 | 5.4.2, 5.4.3 | Line 516; line 44 comment in the prototype diff |
| 10 (no reserve at 6 hp) | 7.4, 8.1, 8.2, 8.8, 13.4 | `noReserve` and its text; breakdown line in the summary |
| 11, 27 (units, progress, crop name, rounding) | 8.1, 8.2, 10, 11.2, 12.5 | `ac_units` in Progress; progress text per kind; `buy {ac(recommended)}`; `{crop}` lower case; `{round}` for shares (prototype fixed); `within 1 °C of` |
| 12 | Brief 7.1 | Vector checks with `--diff-filter` |
| 13, 25 (sources) | 4.1, 15 item 5 | `SOL_AIR_K` marked an assumption, circular check dropped; `FAN_SIZES` and `AC_SIZES` sources; equipment-facts 16 gaps |
| 14 (insulated room wet) | Header, 13.4, 15 item 11 | Goal limited to typical walls; PU 50 numbers; lead decision |
| 15 (deep freeze) | 2, 4.1 | Every catalogue entry frozen; brief EQ1 |
| 19 (pinning wet line) | 5.3, 5.4.2, 13.2, 13.3, 15 item 1 | Option B adopted in the draft, measured; fallback for A stated |
| 20 (devices that do not dry) | 8.6, 8.7 | Moisture-exchanging energy recovery, fresh-air dehumidifier |
| 21 (fan too big blamed on the room) | 8.2, 8.8, 13.4, 15 item 4 | Fan-first text and order; brief test S-FANFIRST |
| 22 (Room shell and wave 3 rows) | 12.5, 12.7, 12.8 | Rows added; room-centred rows listed for its author |
| 23 (equipment run inputs) | 12.5 | Cycle form, `empty_below: null` |
| 24 (headless check in wave 2) | 12.5 row 6.11, 12.7, brief task 17 | The card mounted alone after gate 2.5; the Simulate tab check moves to the lead's wave 3 |
| 26 (calibration limits) | 4.5, 15 item 10 | Listed for the lead |
| 28 (fan below 5 air changes) | 4.1 `FAN_MIN_ACH`, 8.4, 13.3 | `R ≥ FAN_MIN_ACH × V`; the text gives the air changes |
| 29 (who commits the contract) | 12.7, 12.8, brief 2, 3, task 0 | The lead commits `docs/contracts/equipment.md` in prep 2.0; the stream copies only the brief |
| Found while fixing | 12.7, brief 3 | `equipment.js` replaces a prep 2.0 stub (the stub's content defined); the Equipment stream merges in wave 3 after Server 2, not before gate 2.5 |

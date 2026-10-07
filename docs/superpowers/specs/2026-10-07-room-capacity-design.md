# Room capacity check: design

Date: 2026-10-07. Status: design approved, waiting for spec review. Implementation not started.

## Purpose

A farmer enters what they plan to grow in a room: one or more mushroom types, each with a number of blocks. The tool
uses the calibrated room and its machines to answer:

| Question | Answer |
|---|---|
| Can this room grow this mix? | **Impossible**, with the reason (no common targets, or the machines cannot hold the climate even with almost no blocks). |
| How many blocks can it carry? | The **capacity**: the most blocks, in the same mix ratios, that keep the climate in band on all design days. |
| How full is it? | The **utilisation**: planned blocks ÷ capacity. |
| Is that sensible? | **Too dense**, **tight**, **good**, or **too empty**, with the limiting machine and the energy cost per block. |

## Decisions

| Subject | Decision |
|---|---|
| Utilisation | Climate capacity: planned blocks ÷ the most blocks the machines keep in band. Not rack space, not machine load. |
| Composition | A farm has several rooms. A room can hold one crop or a mix. |
| Weather | Three design days per region (hot-dry, hot-humid, mild/rainy). The worst day decides. |
| Stage | Fruiting only, all blocks at once (worst case). |
| Too empty | Utilisation below a limit, default 50 %, set by the farmer. The report always shows the energy cost per block. |
| Calculation | Approach C: an energy and water balance gives an estimate and the likely limiting machine; the simulation with the real controller confirms and decides. |
| Calibration | A verdict needs a calibrated room. An uncalibrated room gets the same report, marked "estimate". |
| Out of scope | Choosing machines to buy (a follow-up that reuses this check with other machine sizes), rack space, batch plans with mixed stages, spore cross-contamination, per-crop fog rules, running a mixed room day to day. |

## 1. Composition and common targets

### Input

| Field | Content |
|---|---|
| Room | One saved room (see section 3). |
| Mix | A list of `{ crop, blocks }`. A one-crop room is a list of one. |
| CO₂ per block | Per crop. Default: the calibrated value of the room. The farmer can enter a measured value per crop (the page already explains the measurement). |

### Good range per crop (new data in `CROPS`)

The good range is the fruiting band where the crop grows well. It is narrower than the alarm limits (`limits`).

| Crop key | Crop | Good T (°C) | Good RH (%) | CO₂ limit (ppm) |
|---|---|---|---|---|
| `oyster` | Grey oyster | 23–27 | 85–92 | 1000 |
| `black` | Black oyster | 21–25 | 85–92 | 900 |
| `pink` | Pink oyster | 24–29 | 85–92 | 1000 |
| `abalone` | Abalone oyster | 25–30 | 85–90 | 1000 |
| `golden` | Golden oyster | 22–26 | 85–92 | 800 |
| `woodear` | Black jelly (wood ear) | 24–29 | 88–95 | 1500 |
| `reishi` | Reishi (lingzhi) | 25–30 | 85–92 | 1000 |
| `milky` | Milky (Calocybe indica) | 28–34 | 80–90 | 1000 |

The CO₂ limit is the existing fruiting limit in `CROPS`. The ranges are typical start values; growers tune them.

### Common targets

| Target | Rule |
|---|---|
| Temperature | Block-weighted average of each crop's fruiting target, then clamped into the overlap of the good T ranges. |
| RH | Same rule with the good RH ranges. |
| CO₂ limit | The lowest limit in the mix. |
| No overlap (T or RH) | Verdict **impossible**. The message names the conflict, for example: "Grey oyster needs at most 27 °C, milky needs at least 28 °C: no common temperature." |

## 2. Capacity calculation and verdicts

### Step 1: balance (instant)

For the worst hour of each design day, the most blocks each machine can carry:

| Machine | Limit |
|---|---|
| Fan (fresh air for CO₂) | Blocks × CO₂ per block ÷ (CO₂ limit − outdoor CO₂) ≤ the top fan airflow. |
| AC (heat) | Walls + fresh air + lights + sun + block respiration heat − fog cooling ≤ the AC capacity at that outdoor temperature. |
| Fogger (water) | Water for the incoming air + water the AC coil removes − water from the blocks ≤ the top fogger output. |

The lowest of the three is the **estimate**; its machine is the **likely limit**. The formulas use the same constants as
`sim.js` (`PLANT`) and the calibrated room values.

| Machine | Worst hour of a design day |
|---|---|
| Fan | Any hour (outdoor CO₂ is constant); the limit is the same on all days. |
| AC | The hour with the highest outdoor temperature (sun included). |
| Fogger | The hour with the lowest outdoor absolute humidity. |

### Step 2: simulation (decides)

| Item | Rule |
|---|---|
| Run | The calibrated room with the real controller: 1 warm-up day, then the three design days. Simulation step 10 s. |
| Size | The whole mix scaled by one factor; the ratios stay. |
| Search | Start at the step 1 estimate, try ±15 %, then halve the interval until it is within 5 %. Usually 3–4 runs; at most 8. |
| Pass | On each design day: temperature in band ≥ 95 % of the day, RH in band ≥ 90 %, CO₂ below the limit ≥ 98 %, and at most 60 min below the RH alarm level. The band is the controller band (±1 °C, ±3 % RH) around the fixed common targets (not the VPD-adjusted RH target). The score uses the real room air from the simulation, not the sensors. |
| Controller settings in a trial | The present controller settings, with the harvest windows off (they lower RH on purpose). |
| Capacity | The largest size that passes all design days. |
| Disagreement | If step 1 and step 2 differ by more than 15 %, the report says: "The simple balance and the simulation disagree; the simulation decides." |

### Verdicts

| Verdict | Condition | Example text |
|---|---|---|
| **Impossible** | No common targets, or the room fails at 5 % of the planned blocks | "The AC cannot hold 21 °C on the hot-dry day, even with almost no blocks." |
| **Too dense** | Utilisation > 100 % | "Holds 3,400 blocks; you plan 4,000 (118 %). Limit: the fan on the hot-humid day." |
| **Tight** | 90 % ≤ utilisation ≤ 100 % | "Works, but there is no margin for a hotter week than the design days." |
| **Good** | Too-empty limit ≤ utilisation < 90 % | "Holds 3,400 blocks; 2,000 planned (59 %)." |
| **Too empty** | Utilisation < too-empty limit (default 50 %) | "You use 30 %. Energy cost: RM 0.14 per block per cycle." |

For a mix, the capacity is given in the same ratios, for example "holds up to 1,700 grey + 1,130 pink oyster".

## 3. Parts and data flow

### New file `capacity.js`

Global `ClimateCapacity`. No page code; the same pattern as `calib.js`. Works in the browser and in Node.

| Function | Job |
|---|---|
| `commonTargets(mix)` | Common targets, or `{ impossible, conflict }`. |
| `balance(room, mix, day)` | Most blocks per machine for the worst hour of one design day (step 1). |
| `trial(room, mix, scale)` | One simulated run at one size, scored pass/fail per design day. Uses the `runtime.js` loop. |
| `checkSteps(room, mix, opts)` | Generator for the full check; yields progress after each run; returns the report. |
| `DESIGN_DAYS` | The design days per region (below). |

### Design days (first region: lowland Peninsular Malaysia)

Each day is 24 hourly values of outdoor temperature and RH, given to the simulation as `weatherSeries`.

| Day | Temperature | RH | Tests |
|---|---|---|---|
| Hot-dry | 24–34 °C | 50–90 % | The AC and the fogger |
| Hot-humid | 25–32 °C | 70–95 % | AC water removal and the fan |
| Mild / rainy | 23–28 °C | 85–98 % | Too wet, and heat at night |

These values are estimates. They are marked so on the page, can be replaced with MetMalaysia data, and the farmer can
edit them.

### Room record

| Field | Content |
|---|---|
| `name` | Room name. |
| `volume` | m³. |
| `machines` | AC capacity, fogger levels, fan levels, ventilation type (the current `PLANT` values). |
| `calib` | Heat loss, air leakage, moisture buffer, CO₂ per block, fit error, date. Missing = uncalibrated. |
| `mix` | The planned mix. |
| `report` | The last finished report. |

### Controller change

| Change | Effect |
|---|---|
| `CROPS[crop].range = { T: [lo, hi], RH: [lo, hi] }` | New data only. No control behaviour changes. |
| Mixed room in a trial | The trial sets the common targets as targets, and the controller crop is the crop with the lowest CO₂ limit, so its alarm limits apply. |

### Page: new card "Room capacity" (after the calibration card)

| Part | Content |
|---|---|
| Room list | Rooms with their calibration state and date. |
| Mix table | Crop and blocks per row; add and remove rows; CO₂ per block per crop (optional). |
| Run check | Button and progress bar. |
| Report | Verdict, utilisation bar, capacity in mix ratios, limiting machine, pass/fail per design day, kWh per day, RM per block per cycle. "Estimate" label when uncalibrated. |
| Farm total | Planned blocks, capacity, and utilisation for all rooms. |
| Storage | Browser storage, export and import as JSON. Must use the same storage as work item 3.1 (settings). Agree with the developer before building. |

## 4. Errors and edge cases

| Case | Behaviour |
|---|---|
| Empty mix or 0 blocks | No check. "Add at least one crop with blocks." |
| Poor calibration (fit error above 0.5 °C, 5 % RH, or 100 ppm CO₂) | Report marked "estimate"; advice to calibrate with a longer log. |
| Calibration older than 90 days | Warning: "The room may have changed (season, insulation, leaks): calibrate again." |
| Room fails at 5 % of the plan | Verdict impossible; the report names the failing measure and design day. |
| Search does not settle in 8 runs | Report a range, for example "between 2,900 and 3,200 blocks". |
| Page closed during a check | No partial result is saved; the last finished report stays. |

## 5. Tests

| Test | Proves |
|---|---|
| `commonTargets`: weighting, clamping into the overlap, impossible names the conflict | Mix rules |
| `balance`: fan limit against a hand calculation (2,000 blocks × 45 mL/h, limit 1,000 ppm) | Formulas |
| Verdicts at 49 / 50 %, 90 %, 100 % | Thresholds |
| Hidden room (as in `tests/calib.test.js`): capacity within 10 % of a brute-force sweep | The search finds the real limit |
| Default room: grey oyster passes 2,000 blocks; golden oyster is limited by RH; grey + milky is impossible | Known cases |
| A full check in Node within 20 s | Fast enough for the page |
| The 8 files in `tests/vectors/` pass without new vectors | The controller behaviour did not change |

## Open items

| Item | Owner |
|---|---|
| Design-day values from MetMalaysia data, and more regions | Grower or developer |
| Shared browser storage with work item 3.1 | Developer and Claude, before building |
| Measured CO₂ per block for each species | Farm measurements |

# Air exchange: short, powerful CO₂ purges: design

Date: 2026-10-08. Status: approved in brainstorming. Built as its own mini-wave before wave 2 (contract C9 in `docs/contracts/air.md`); plan in `docs/superpowers/plans/2026-10-08-air-exchange/`.

## Purpose

| Problem today | Result after this change |
|---|---|
| The fresh-air fan (300/600/900 m³/h) cannot pull CO₂ down to the stop level when the room is full: with 6,000 blocks even High holds about 710 ppm against a 700 ppm stop level, so the fan never stops | The air exchange is sized from the block count, so every purge reaches the stop level within a time cap |
| The default "Steady" mode keeps the fan at Low all through pinning and fruiting, so outdoor air disturbs the room 24/7 | The fans are off between purges; the room is sealed except for wall leakage |
| A purge is long and gentle, so temperature and humidity stay off target for a long time | A purge is short and powerful (at most 3 min); the room is prepared before it and recovers after it |

## Physics this design rests on

Short purges do not reduce the total outdoor air per day: the blocks make a fixed amount of CO₂, and holding a CO₂ level takes about the same daily volume of hot, wet air. They change the shape of the disturbance: a few short, deep swings and long quiet stretches. A sealed room fills with CO₂ quickly, so short purges are also frequent purges.

60 m³ room, 45 mL/h CO₂ per block, 420 ppm outside, leakage 0.4 changes an hour, start level 900 ppm, stop level 700 ppm:

| Blocks | CO₂ rise with the fans off | Off time between purges | Airflow for a 5 min purge | Airflow for a 3 min purge | Purge time at 2,400 m³/h |
|---|---|---|---|---|---|
| 2,000 | ~22 ppm/min | ~9 min | 650 m³/h | 900 m³/h | ~0.9 min |
| 4,000 | ~45 ppm/min | ~4 min | 900 m³/h | 1,150 m³/h | ~1.0 min |
| 6,000 | ~75 ppm/min | ~3 min | 1,150 m³/h | 1,400 m³/h | ~1.2 min |

A wider band (for example stop 600, start 1,000) makes purges rarer and deeper. The band is the setting that trades how often against how hard.

In Malaysia a purge does not always dry the room: outdoor air at 33 °C and 60 % RH (about 21.5 g/m³) holds more water than a 25 °C room at 88 % RH (about 20.3 g/m³), so a daytime purge often pushes RH up as well as temperature. The Prepare step (section 2) therefore works in both directions.

## Decisions

| Subject | Decision |
|---|---|
| Hardware | One filtered intake fan and one exhaust fan, each with a motorised damper, switched on and off together on demand (the industrial standard). No continuous fresh air. |
| Size | A setting per room (`air_m3h`); the app recommends it (section 4) |
| Purge end | CO₂ reaches the stop level, or the time cap (3 min) is reached |
| AC and fogger | Prepare before the purge (direction-aware), recover after it; no AC setback |
| Old fresh-air modes | Both removed (`steady` with base levels, and on/off `purge` at a fixed level) |
| Model | Approach B: a new on/off command `air.on` for the pair; fan levels removed everywhere |
| When | Its own mini-wave now, before wave 2: a frozen contract C9, its own database upgrade, parallel streams. Wave 2 builds on the new air model; the wave 2 and C8 drafts are amended to match (section 3). |

## 1. The room's air exchange (`sim.js`)

| Item | Design |
|---|---|
| Machines | Intake fan `SF-203` (filtered) and exhaust fan `EF-206`, each with a motorised damper, on command `air.on` |
| Airflow | Balanced: intake = exhaust = `air_m3h` when on; the room stays at neutral pressure |
| Fans off | Dampers closed; only wall leakage (`room.infAch × room.volume`) exchanges air, unfiltered |
| Positions | `env.inletAt` and `env.exhaustAt` (`high` / `low`) stay: the intake feeds that air zone, the exhaust draws from that zone |
| Filtered air | Intake air counts as filtered; leakage counts in `unfilteredM3` |
| Power | `air_w` while on (both fans). `PLANT.air.wPerM3h` = 0.08 W per m³/h for the pair (144 W at 1,800 m³/h), marked "no source" until the equipment research gives figures. |
| Default | `PLANT.air = { m3h: 1800, wPerM3h: 0.08 }` |

| Removed from `sim.js` | Reason |
|---|---|
| `PLANT.fan.levels` (Off/Low/Medium/High) | No levels: the pair is on or off |
| `env.vent` (`supply` / `exhaust`) | Both fans always run together |
| `PLANT.fan.supplyPowerFactor`, `PLANT.fan.leakFrac` | Only served the one-fan supply/exhaust model |

## 2. The purge cycle (`controller.js`)

### 2.1 States

| State | Starts when | Fans | AC and fogger |
|---|---|---|---|
| Idle | After a purge (and after the minimum off time) | Off | Normal targets |
| Prepare | The predicted purge is at most `prepareLeadS` away (2.2) | Off | Prepare targets (2.3) |
| Purge | CO₂ ≥ start level (`rules.fanOn`) | On | Prepare targets held; no AC setback |
| End | CO₂ ≤ stop level (`rules.fanOff`), or the purge has lasted `purgeMaxS` | Off for at least `minOffS` | Normal targets again; the normal rules run the AC and fogger hard until the room is on target |

### 2.2 Rise rate and predicted purge

| Item | Rule |
|---|---|
| Rise rate | Least-squares slope of CO₂ against time over the readings since the fans last stopped, needing at least 4 readings (2 min at the default 30 s reading period) |
| Predicted time to purge | (start level − CO₂ now) ÷ rise rate |
| No prediction | Rise rate ≤ 0, or fewer than 4 readings: Prepare waits |
| Many blocks | When the time between purges is shorter than `prepareLeadS`, Prepare simply holds between purges |

### 2.3 Prepare targets

| Quantity | Push of the purge | Prepare target |
|---|---|---|
| Temperature | Outdoor temperature above room temperature (purge warms) | `spT − 0.8 × BANDS.T` (bottom of the band) |
| Temperature | Outdoor temperature below room temperature (purge cools) | `spT + 0.8 × BANDS.T` (top of the band) |
| RH | Outdoor absolute humidity above the room's (purge wets) | `rhT − 0.8 × BANDS.RH` (bottom of the band) |
| RH | Outdoor absolute humidity below the room's (purge dries) | `rhT + 0.8 × BANDS.RH` (top of the band) |
| Either | Push smaller than 0.5 °C or 0.5 g/m³, or an outdoor sensor fault | No change |

### 2.4 Rules around the purge

| Rule | Design |
|---|---|
| Time cap | A purge never lasts longer than `purgeMaxS` (default 180 s), except under the CO₂ safety level |
| Fans too small | After 3 purges in a row that hit the cap: a warning alarm, "Purges don't reach 700 ppm in 3 min. The air exchange needs about 1,400 m³/h." The size comes from the rise rate (2.2), the room volume (`cfg.roomM3`) and the purge formula of section 4. It clears after a purge reaches the stop level. |
| CO₂ safety level (priority 1) | Forces the fans on, ignoring the cap, until CO₂ is below the safety level (as today) |
| Humidity first (priority 2) | If RH ≤ `rhT − rhStop`, the fogger has been at maximum for `FOG_FULL_S`, and the purge would dry the room (2.3): the purge start is delayed, at most until CO₂ reaches the CO₂ limit (`co2Lim`, the alarm level); then it purges anyway |
| CO₂ sensor fault | Timed purge as today: on for part of each `protect.timedPurgeEvery`, the part learned from past purge seconds per hour when available, else `protect.timedPurgeOn`; each timed purge is capped by `purgeMaxS` |
| Free cooling, outdoor drying | Kept: the fans may also run when outdoor air is cooler or drier and the room needs it; these runs are not counted as purges |
| Harvest window | Unchanged (fog off); purges run normally |
| Minimum on time | 30 s (fixed), so a noisy reading cannot stop a purge at once |

### 2.5 Settings (`rules`)

| Key | Type | Range | Default | Meaning |
|---|---|---|---|---|
| `fanOn` (kept) | ppm | 450–20000 | `co2Lim − 100` | Purge starts at |
| `fanOff` (kept) | ppm | 400–20000 | `max(450, co2Lim − 300)` | Purge stops at |
| `purgeMaxS` (new) | s | 60–900 | 180 | Time cap of one purge |
| `prepare` (new) | boolean | – | `true` | Prepare before a purge |
| `prepareLeadS` (new) | s | 0–900 | 180 | How long before the predicted purge Prepare starts |
| `minOffS` (new) | s | 30–600 | 60 | Minimum time the fans stay off after a purge |

| Removed key | Was |
|---|---|
| `airMode` | `steady` / `purge` |
| `baseFan` | Base fan level per stage |
| `fanLevel` | Fan level of an on/off purge |
| `fogBoost` | One more fog level during a purge |
| `rhAction: 'low'` | Reduce the purge to Low (`rhAction` keeps only the delay behaviour of 2.4) |
| `acPurge`, `acAction`, `acSetbackC`, `acOff`, `acOn`, `maxSetback` | AC setback or AC off during a purge |

## 3. Settings, stored data and contracts

| Place | Change |
|---|---|
| Command (`docs/contract.md`) | `fan.level` 0–3 → `air.on` true/false; `cmdFields` `fanLevel` → `air` |
| Reading (C1 database, C3 API, C5 web) | Key `fan` (0–3) → `air` (0/1). A new database upgrade (number 2; the upgrade wave 2 plans becomes number 3) renames the column and converts old rows: level > 0 → 1. A bucket (averaged) row gives the fraction of time on. |
| Settings (C6) | `SETTINGS_VERSION` + 1. Importing an older file drops the removed keys (2.5) with a warning per key and keeps `fanOn` / `fanOff`. New keys validated with the ranges of 2.5. |
| `RAMP_KEYS` | Drop `rules.acOff`, `rules.acOn`; keep the others |
| Equipment (C8 draft) | `fan_m3h` → `air_m3h` (the pair's airflow, 50–10000 m³/h, default 1800). `FAN_SIZES` → `AIR_SIZES` `[600, 900, 1200, 1800, 2400, 3600]`. The steady-mode patch ("wet outdoor air" on the base level, C8 draft lines 279 and 316) is dropped. |
| Test vectors | Regenerated with `npm run vectors` after the controller's unit tests pass; field `air` replaces `fanLevel` |
| Lead decision | One new decision in `docs/contracts/LEAD-DECISIONS.md`: "Air exchange: on/off intake + exhaust pair, short purges, this spec, contract C9"; the wave 2 drafts renumber their database upgrade to 3 |

## 4. Sizing and screens

### 4.1 Sizing rule

| Item | Rule |
|---|---|
| CO₂ output | `G` = blocks × CO₂ per block at the room's highest output (fruiting, most blocks) |
| Purge time at airflow `Q` | `Q' = Q + leakage`; `Css = co2Out + G / Q'`; time = `V / Q' × ln((start − Css) / (stop − Css))`, and "never" when `Css ≥ stop` |
| Recommendation | The smallest size in `AIR_SIZES` whose purge time ≤ `purgeMaxS`, and the next size up as the margin choice |
| Where it is used | C8 fan verdict (with C8's confirmation cycle run), the capacity check's CO₂ pass, and the controller's "fans too small" estimate (2.4) |
| Verdict wording | "Your 900 m³/h air exchange is too small for 6,000 blocks: a purge takes 4.3 min, the limit is 3 min. Buy at least 1,400 m³/h; 1,800 m³/h gives a margin." |

### 4.2 Screens

| Place | Design |
|---|---|
| Room drawing | `SF-203` on the inlet wall and `EF-206` on the outlet wall (high or low per `inletAt` / `exhaustAt`), both drawn as fans; both spin during a purge; with the fans off the dampers show closed; text "Purge 1,800 m³/h" or "Off · dampers closed". `mimicLayout` loses the vent branch. |
| Status card | "Exhaust fan" → "Air exchange (SF-203 + EF-206)". State: Idle, Prepare (purge in about 2 min), Purge 0:45 of 3:00, Delayed (humidity first); a plain-language "why" line |
| Fan and CO₂ card | → "Air exchange and CO₂". Ladder: start level, stop level and the Prepare point; the AC setback row is removed. Stats: purges per day, average and longest purge, purges that hit the cap. |
| At a glance | "Next purge in about 2 min" or "Purging 0:45"; per day: purges and their average length |
| Settings panel (Installer) | Purge group: start, stop, time cap, Prepare on/off and lead time, minimum off time. Removed: fresh-air mode, base levels, purge level, AC during a purge. |
| Machines (Auto/Manual) | The air exchange's manual output is On/Off |
| Charts | The fan level area → an on/off band for the air exchange |
| Test bench | The fresh-air mode select is replaced by "Air exchange size (m³/h)" (until C8 brings equipment per room) |

## 5. Tests

| Test | Proves |
|---|---|
| `tests/controller.test.js` (append) | Idle → Prepare from the predicted rise; Purge at the start level; end at the stop level; end at the cap; the minimum off time; the 30 s minimum on time; Prepare's direction in the four cases of 2.3 and "no change" for a small push |
| `tests/controller.test.js` (append) | Humidity first delays a purge but never past `co2Lim`; the safety level ignores the cap; a CO₂ sensor fault gives a capped timed purge |
| `tests/controller.test.js` (append) | The "fans too small" alarm fires after 3 capped purges and its size is within 15 % of the value from the simulation's true CO₂ output; it clears after a purge reaches the stop level |
| `tests/integration.test.js` (append) | Balanced flow; leakage only with the dampers closed; power only while on; the positions feed the right zones |
| Integration (2 simulated days) | 6,000 blocks at 1,800 m³/h: every purge ≤ 3 min and CO₂ never above `co2Lim`. 6,000 blocks at 900 m³/h: the alarm fires with an estimate of about 1,400 m³/h. Prepare on vs off: time outside the temperature and RH bands is lower with Prepare on. |
| `tests/settings.test.js` (append) | An older settings file imports with one warning per removed key and keeps `fanOn` / `fanOff`; new keys reject values outside their ranges |
| `tests/db.test.js` (append) | The new upgrade converts `fan` to `air` 0/1; a bucket row gives the fraction on |
| `tests/vectors.test.js` | Passes on the regenerated vectors |
| `tests/web-mimic.test.js` (update) | `mimicLayout` places both fans by `inletAt` / `exhaustAt` |
| Headless Chrome | Both fans spin during a purge; the status card and the glance panel show Prepare, Purge and Delayed |

## 6. Build

| Step | Who | Content |
|---|---|---|
| 0 | Lead | Merge `fix/room-drawing` (the web stream edits the same drawing). Write contract C9 (`docs/contracts/air.md`) and the shared pure module `air.js` (`ClimateAir`: purge time, size recommendation, rise rate) with its tests; amend `docs/contract.md`, C1, C3, C5 and `LEAD-DECISIONS.md`; freeze |
| 1 | Controller stream | `controller.js`: purge cycle, settings, import of older files |
| 1 | Simulation stream | `sim.js`, `capacity.js`, `cycle.js`, `calib.js`, `tools/run-headless.js` |
| 1 | Data stream | Database upgrade (`fan` → `air`), `server/rooms.js` reading mapping, fakes |
| 1 | Web stream | Drawing, status card, glance panel, test bench, settings panel, Machines On/Off, charts |
| 2 | Lead | Merge in order (simulation, controller, data, web), regenerate the vectors, run section 5, browser checks, amend the wave 2 and C8 drafts in `/tmp` and `~/Documents/mushroom-farm-drafts` |

# Intake air filter (iteration 11)

Date: 2026-10-22 · Branch `v2` · Builds on iterations 2 (sensors), 6 (alarms), 7 (energy), 8 (simulation runs) and 9–10 (dehumidifier, suggest machines).

Why: nothing in v2 knows about the filter on a room's intake. The simulator moves a fixed `fanFlow` whatever the filter's state, the energy totals count the fans at their rating, and the only sign of a clogged filter in a real room is CO₂ that will not come down. The owner asked for all four parts: clogging in the simulator, a filter pressure sensor, a change reminder and fan power in the energy totals. The owner chose one filter per room intake (today's setup: each container's own intake and exhaust fan) and the fan-curve model. A shared fresh-air unit serving several rooms (the owner's stage 3 for a row of 2–4 containers) is a later spec and takes the filter with it.

## 1. Scope

| In | Out (later) |
|---|---|
| One intake filter per room: its settings, how long it has been in use, a change reminder | Exhaust filters, two-stage filters (pre + fine), a filter shared by several rooms |
| Simulator: the filter loads with the air through it; intake flow, filter pressure and intake fan watts come from the fan curve | EC constant-flow fans (they hold their flow and draw more watts instead) |
| An optional differential pressure sensor per room (Modbus), with alarms | A relief damper in place of the exhaust fan (the room over pressure) |
| Intake fan watts in the energy totals follow the filter | Suggest machines choosing fans by pressure (it keeps sizing with a clean filter) |
| Simulation runs: filter settings, filter changes, unfiltered share | The shared fresh-air unit and its coil |

## 2. Physics (`device/sim-model.js`)

| Item | Rule |
|---|---|
| Parameters | `fanFlow` (exists; now "with a clean filter"), `fanMaxPa`, `filterCleanPa`, `filterFinalPa` (section 3), `filterLifeDays` (section 8) |
| State | the model state gains `Lf`, the filter's loading (0 = clean, 1 = at its change pressure, may go past 1). A state from before this iteration starts at `Lf` = 0 |
| Fan curve | a straight line from (0, `fanMaxPa`) through the clean operating point (`fanFlow`, `filterCleanPa`). The duct and grille are part of that clean point |
| Filter pressure | `p` = min(`fanMaxPa`, `filterCleanPa` + (`filterFinalPa` − `filterCleanPa`) × `Lf`): what a sensor across the filter reads while the intake runs (`filterFinalPa` at `Lf` = 1). `acting.filterPa` = `p` while the intake fan runs, else 0 |
| Intake share | `f` = max(0, (`fanMaxPa` − `p`) ÷ (`fanMaxPa` − `filterCleanPa`)): the intake flow ÷ `fanFlow` on the fan's curve at `p` (1 when clean; 0.75 at the change pressure with the defaults; 0 at the fan's maximum) |
| `filterOf(params, Lf)` | → `{ share, pressurePa }`; no filter: `{ share: 1, pressurePa: 0 }` |
| Air exchange | both fans: `fanFlow` × (1 + `f`) ÷ 2 (the exhaust fan keeps pulling; the shortfall comes in through the leaks, unfiltered); intake alone: `SINGLE_FAN` × `fanFlow` × `f`; exhaust alone: as now; never below the leakage, as now |
| Unfiltered share | both fans: (1 − `f`) ÷ (1 + `f`) of the exchange; reported, not used by the physics |
| Loading | each sub-step `Lf` += air through the filter (m³) ÷ (`filterLifeDays` × 24 × `fanFlow`). Air through the filter = `fanFlow` × `f` (both fans) or `SINGLE_FAN` × `fanFlow` × `f` (intake alone), × the step time. The filter loads with the air it passes, not with the days |
| Change | `changeFilter(state)` → the state with `Lf` = 0 |
| Reply | `acting` gains `filterPa`, `intakeShare` (`f`), `unfilteredM3h`, `filterLoad` (`Lf`) |

Example (defaults 40 / 80 / 200 Pa, Container Alpha, 150 m³/h, both fans on all the time): clean 150 m³/h all through the filter; after 30 days `Lf` ≈ 0.88, `f` ≈ 0.78 (`f` = 1 − `Lf` ÷ 4 gives `Lf` = 4 (1 − e^(−t ÷ 120 days))); at `Lf` = 1 the sensor reads 80 Pa, `f` = 0.75: 131 m³/h of exchange, 112.5 through the filter and 18.75 through the leaks.

## 3. Room settings

| Field | Label | Default | Range | Used by |
|---|---|---|---|---|
| `fanMaxPa` | Intake fan maximum pressure (from its datasheet) | 200 Pa | 20–2000, whole | energy estimate, simulation runs (prefill) |
| `filterCleanPa` | Clean filter pressure drop | 40 Pa | 5–1000, whole | `filterMissing`, energy estimate, simulation runs (prefill) |
| `filterFinalPa` | Filter change pressure: the pressure sensor's reading at which to change the filter (with the intake running) | 80 Pa | above `filterCleanPa`, below `fanMaxPa`, whole | `filterDirty`, simulation runs (prefill) |
| `filterChangeDays` | Change the filter every | 30 days | 0–365, whole; 0 = no reminder | `filterDue`, simulation runs (prefill) |
| `filterChangedAt` | (not edited; set by **Filter changed**) | the room's creation, or the upgrade time for an existing room | ms | `filterDue`, the Filter card |
| `dpAddress` | Filter pressure sensor address (Sensors section) | empty | 1–247, unique like the other addresses | polling |

| Check | Error (400, field) |
|---|---|
| `fanMaxPa` ≤ `filterCleanPa` | "Fan maximum pressure must be above the clean filter's pressure drop", `fanMaxPa` |
| `filterFinalPa` ≤ `filterCleanPa` | "Filter change pressure must be above the clean filter's pressure drop", `filterFinalPa` |
| `filterFinalPa` ≥ `fanMaxPa` | "Filter change pressure must be below the fan's maximum pressure", `filterFinalPa` (the sensor never reads more than the fan pushes) |

The three checks are made in the same order by the device app (`filterProblem`), the room settings, the simulation runs, the room dialog and the Simulate stepper.

The room dialog gets a section **Intake filter** with the first four fields; `dpAddress` goes in the Sensors section. A save that leaves out a filter setting keeps the stored value (a new room gets the default); the cross checks compare what will be saved: an update merges the room's stored settings into the body first, a new room takes the defaults. The dialog always sends all four.

## 4. Pressure sensor

| Item | Rule |
|---|---|
| Device | an RS485 differential pressure transmitter across the filter: function 04, input register 0 = ΔP in Pa × 10, signed. *Default, to be checked against the owner's transmitter* |
| Polling | after the room's T/RH and CO₂ sensors, before the energy meter; one read; a failed read = a failed poll. The poller decodes the register; the Modbus client stays generic |
| Bad reading | outside −50 to 2000 Pa: stored with `ok` 0, the value kept, and the error "Out of range" |
| Status | as the energy meter: online, timeout (1–2 failed in a row), offline (3 or more), `no-data`, `not-wired` (no address) |
| Storage | table `filter_readings (id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL, address INTEGER NOT NULL, at INTEGER NOT NULL, ok INTEGER NOT NULL CHECK (ok IN (0,1)), pa REAL, error TEXT)`, the energy meter readings' three indexes on `(room_id, address, …)`; deleted with the room |
| Counts when | the intake fan has been commanded on for at least 60 s (from `machine_log`) and, when the controller has a machines view with the relay module, its intake status is `on` (a dead fan or a relay that does not answer reads about 0 Pa and must not look like a missing filter); a reading from before the last filter change is the old filter's and never counts. A reading at other times is stored and shown but judged by nothing. The controller reads the room again before it judges the filter (a **Filter changed** may land while it sends to another room) |
| API | `GET /api/rooms/:id/sensors` returns a fourth element `{ kind: 'dp', address, status, failuresInRow, lastOk: { at, pa } \| null, readings }`, like the energy meter |

## 5. Change reminder and alarms

| Item | Rule |
|---|---|
| **Filter changed** | `POST /api/rooms/:id/filter/changed` → sets `filterChangedAt` to now, adds a row to `filter_changes (id INTEGER PRIMARY KEY, room_id INTEGER NOT NULL, at INTEGER NOT NULL, pa_before REAL)` (`pa_before`: the last counted reading of the past day since the previous change, or null: the intake is usually off while the filter is changed), clears `filterDue`, `filterDirty` and `filterMissing`; returns the room. `GET /api/rooms/:id/filter/changes` → the last 20, newest first |
| `filterDue` (warning, no delay) | `filterChangeDays` > 0 and days since `filterChangedAt` ≥ `filterChangeDays`. Text "Filter in use 32 days, change every 30". Clears on **Filter changed** or when the setting moves the due date past now |
| `filterDirty` (warning, 10 min counted) | a sensor is set and the counted ΔP ≥ `filterFinalPa`. Text "Filter pressure 85 Pa, at or above the change pressure 80". Clears below `filterFinalPa` − 10 or on **Filter changed** |
| `filterMissing` (warning, 10 min counted) | a sensor is set and the counted ΔP < `filterCleanPa` ÷ 2. Text "Filter pressure 12 Pa: filter missing or torn, or the sensor tube is off". Clears at or above 0.6 × `filterCleanPa` or on **Filter changed** |
| Counting the 10 min | intake-running time with counted readings, added up across exchanges: each evaluation with a counted reading in the raising range adds the time since the room's previous evaluation, but none from before the intake's present run passed its spin-up (`countFrom` of `filterInput`). The count pauses (keeps its time) while there is no counted reading (intake off or spinning up, the sensor's last poll failed, nothing counted in the last 120 s) and while a reading is between the raising and the release range; it starts again on a counted reading in the release range (dirty: below `filterFinalPa` − 10; missing: at or above 0.6 × `filterCleanPa`), on **Filter changed** and when the sensor is removed. An active alarm stays while there is no counted reading. Example: 3-min exchanges every 15 min at the change pressure add 2 min each (after the 60 s spin-up): 8 min after the 4th exchange, raised at the end of the 5th |
| Filter card (room page) | pressure now on a bar marked clean and change pressure (or "No pressure sensor"), days in use and the due date (or "No reminder"), the **Filter changed** button with a confirm, the last 5 changes |

## 6. Energy

| Item | Rule |
|---|---|
| Intake fan watts | rated × (1 + 0.15 × (p − `filterCleanPa`) ÷ (`fanMaxPa` − `filterCleanPa`)), never below rated and never above 1.15 × rated (p is taken at most `fanMaxPa`): rated with a clean filter, 1.15 × rated at the fan's maximum pressure. Small fixed-speed AC fans lose air, not watts, on a dirty filter |
| Simulator (`device/sim-power.js`, `server/simulate.js`) | p = the model's `filterPa` |
| Real-room estimate (`server/usage.js`) | with a sensor: p = the day's mean counted ΔP (no counted reading that day: rated); without a sensor: rated, as now |
| Exhaust and circulation fans | unchanged |

## 7. Device app

| Item | Rule |
|---|---|
| Sensor kind | `dp`, value `pa` (−50 to 2000), typed by hand, answering as section 4 |
| Simulated room | parameters `fanMaxPa`, `filterCleanPa`, `filterFinalPa`, `filterLifeDays` with the section 3 defaults (old saved simulations get them); a seventh link `filterProbe` (a `dp` device) that each tick gets `filterPa`; the sim card shows the filter pressure and loading and a **Change filter** button (`changeFilter`). A **Reset** puts the air back and keeps the filter as it is |
| Two buttons | the device's **Change filter** changes the simulated filter; the farm's **Filter changed** records it. The owner presses both, as with a real filter |

## 8. Simulation runs

| Item | Rule |
|---|---|
| New physics fields | `fanMaxPa`, `filterCleanPa`, `filterFinalPa`, `filterChangeDays` (prefilled from the room), `filterLifeDays` (default 30, 1–365), `filterUsedDays` (the filter's age at the start: prefilled with the room's whole days since `filterChangedAt`, 0–365), `filterSensor` (true when the room has `dpAddress`; not asked). As the other fields, the stepper prefills from the room's last run first, except `filterUsedDays`, always the room's now. When any of the seven is sent, `fanMaxPa`, `filterCleanPa`, `filterFinalPa` and `filterLifeDays` are required (whole numbers in the device app's ranges, with the three checks of section 3); `filterChangeDays` and `filterUsedDays` default to 0 and `filterSensor` to false. None of the seven sent: no filter |
| Start | `Lf` = `filterUsedDays` ÷ `filterLifeDays`, as if the filter had passed `fanFlow` all that time (a conservative start) |
| Changes in the run | at the start of a 10 s step, the filter is changed (`Lf` = 0) when `filterChangeDays` > 0 and that many days passed since the last change (before the run: `filterUsedDays` ago, so a filter in use that long is changed at once), or, with `filterSensor`, after 10 min of intake running at or above `filterFinalPa`, added up over the exchanges like the `filterDirty` alarm (it starts again only below `filterFinalPa` − 10; the model has no spin-up) |
| Results | `summary.filter` = `{ changes (s from the start), meanExchangeM3h (over the whole run), meanFilterPa (while the intake ran; null if it never ran), unfilteredPct (of all the air that came in while the intake ran, with the exhaust or alone, the part through the leaks) }`, or null without a filter. The page shows them as an **Intake filter** card, the changes as marks on the intake row and the filter in the input line |
| Old runs | runs saved before this iteration show no filter lines; a run without filter fields has no filter (`Lf` 0) |
| Suggest machines | unchanged: it passes no filter fields, and a run without them keeps `Lf` at 0 (`f` = 1) |

## 9. Database (upgrade 13 → 14)

| Change | Detail |
|---|---|
| `rooms` columns | `fan_max_pa REAL NOT NULL DEFAULT 200`, `filter_clean_pa REAL NOT NULL DEFAULT 40`, `filter_final_pa REAL NOT NULL DEFAULT 80`, `filter_change_days INTEGER NOT NULL DEFAULT 30`, `filter_changed_at INTEGER` (set to the upgrade time for existing rooms), `dp_address INTEGER` (1–247) |
| Tables | `filter_readings` (section 4), `filter_changes` (section 5) |
| Test | the upgrade run on a v13 copy of the owner's database, as for upgrade 12 |

## 10. Tests

| Area | Cases |
|---|---|
| Physics | `f` = 1 clean; 0.75 at `Lf` 1 with the defaults; falls past 1; the pair, intake-alone, exhaust-alone and no-fan exchanges; loading in proportion to the air through the filter (half the run time, half the loading); `changeFilter`; a state without `Lf` |
| Power | rated at clean, 1.15 × rated at `fanMaxPa`, never below rated |
| Room settings | defaults, ranges, the two cross checks, `dpAddress` uniqueness against every other address and the outdoor sensor |
| Sensor | register decode (signed × 10), out of range, statuses, polling order, counted only after 60 s of intake |
| Alarms | each alarm's raise after its delay, clear rule, clear on **Filter changed**, nothing judged without a counted reading |
| API | **Filter changed** (row, alarms cleared, `pa_before`), the changes list, the fourth sensor element |
| Usage | estimate with and without a sensor, a day without counted readings |
| Simulation runs | changes by days and by pressure, results fields, old runs, suggest machines unaffected |
| Device | `dp` kind, `filterProbe` link, **Change filter**, old saved simulations |
| Upgrade | 13 → 14 on a v13 copy |

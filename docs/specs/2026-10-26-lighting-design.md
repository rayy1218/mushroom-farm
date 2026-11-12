# Lights on a schedule per stage (iteration 15)

Date: 2026-10-26 · Branch `v2` · Builds on iterations 3 (machines), 5–6 (controller, alarms), 7 (energy), 8 (crop program, simulation runs), 9 (dehumidifier, the model for a "fitted" relay machine), 13–14 (Room card, Climate tab groups, Crop tab stage plan).

The owner asked (2026-10-26) for a Lighting group in the Climate tab and chose "Schedule per stage": lights on relay output 6, each stage with its own light hours, following the crop stage automatically. Mushrooms fruit towards light; they need a few hundred lux for 8–12 h a day while pinning and fruiting, none in the spawn run. The lead chose every default (*default*).

## 1. Scope

| In | Out (later) |
|---|---|
| Lights on the relay module's output 6 (current input 6), per room "fitted" or not, a power rating | Dimming, lux sensors, several light circuits |
| A daily light schedule per stage in the crop program: hours a day and a start time | Light per crop (one schedule per room's program) |
| The automatic rule, manual control, statuses and alarms like the other relay machines | Sunrise/sunset dimming |
| Energy, the device app's relay and simulation, the server's simulation runs | |
| The Climate tab's Lighting group, the Crop tab's stage targets, the Room card's picture and machine tiles, the Machines card | |

## 2. Machine

| Item | Rule |
|---|---|
| Key | `lights`, the 6th relay key: `RELAY_KEYS = ['intake', 'exhaust', 'circulation', 'humidifier', 'dehumidifier', 'lights']` (coil 5, discrete input 5); the poller reads 6 coils (fn 01) and 6 inputs (fn 02) |
| Fitted | room field `lights` (true/false, *default* false); not fitted: status `not-fitted`, never commanded (manual PUT → 400 "This room has no lights", field `lights`), no alarms, hidden on the pages — as the dehumidifier |
| Rating | room field `lightsW` "Lights power" W, *default* 60, 0–5000 (an LED strip for a container) |
| Statuses | as the other relay machines when fitted (on, off, switching, not-following, not-running, running-while-off, no-answer, not-wired) |
| Name | "Lights" |

## 3. Schedule (crop program)

| Item | Rule |
|---|---|
| Hours a day per stage | program field `lightHours` `{ spawn, pinning, fruiting, rest }`, whole hours 0–24, *defaults* spawn 0, pinning 12, fruiting 12, rest 0 |
| Start | program field `lightStart` "HH:MM" local time, *default* "07:00"; the lights are on from it for that stage's hours (crossing midnight allowed) |
| Saving | PUT `/api/rooms/:id/crop` accepts `lightHours` (any of the four) and `lightStart`, checked like the days ("Light hours must be a whole number from 0 to 24", "Light start must be a time like 07:00"); GET returns them |
| No crops | no program: the lights are off under automatic control |

## 4. Automatic rule (`decide` in `server/controller.js`)

| Condition (in this order) | Result | Reason text |
|---|---|---|
| not fitted | not commanded | "" |
| auto off | not commanded | — (as the other machines) |
| no crops | off | "Lights off: no crop set" |
| stage's hours 0 | off | "Lights off: none in the spawn run" (the stage's name) |
| now inside today's window | on | "Lights on: 07:00–19:00 for fruiting (12 h)" |
| outside | off | "Lights off: on 07:00–19:00 for fruiting" |
| Hold | none (lights may switch any time) | |

## 5. Energy and physics

| Item | Rule |
|---|---|
| Usage estimate (`server/usage.js`) | run time × `lightsW` |
| Device model (`device/sim-model.js`) | the lights' power into the air as heat while on; new sim parameter `lightsW` (*default* 60, 0–5000) |
| Device power (`device/sim-power.js`) | `lightsW` while on |
| Server simulation runs (`server/simulate.js`) | the lights follow the rule with the run's clock and program (its `lightHours`, `lightStart`); their energy in the totals; a run with no lights fitted has none |

## 6. Database (upgrade 15 → 16)

| Change | Detail |
|---|---|
| `rooms` | `lights INTEGER NOT NULL DEFAULT 0 CHECK (lights IN (0,1))`, `lights_w REAL NOT NULL DEFAULT 60` |
| `room_programs` | `light_spawn`, `light_pinning`, `light_fruiting`, `light_rest` INTEGER NOT NULL with the defaults of section 3; `light_start TEXT NOT NULL DEFAULT '07:00'` |
| `machine_log`, `machine_commands` | the machine check lists gain `lights` (rebuild the CHECK as earlier upgrades did) |
| Test | the upgrade on a v15 copy built the way the existing upgrade tests build older versions; re-running harmless |

## 7. Device app

| Item | Rule |
|---|---|
| Relay | 6 outputs; a state file from before (5 outputs) gets a 6th, off |
| Simulated room | parameter `lightsW`; the relay's output 6 drives the light heat |
| Page | the relay row "Lights"; the sim settings gain "Lights power (W)" |

## 8. Farm pages

| Item | Rule |
|---|---|
| Room dialog | Machines section: "Lights fitted" checkbox (as the dehumidifier's) and "Lights power (W)" in Power and water |
| Machines card | a Lights row (On/Off switch) when fitted |
| Climate tab | a **Lighting** group after Air circulation, when fitted: today's window ("On 07:00–19:00 (12 h) for fruiting", or "Off all day in the spawn run") and the reason line; a link "Change the hours on the Crop tab" |
| Crop tab | each stage's Targets table gains a **Light** row ("12 h a day from 07:00", "Off"); the stage pencil edits its light hours with its days; the program row gains "Lights from (time)" |
| Room card | a lamp under the ceiling in the picture (a warm glow and light below it while on, `lights` in the DrawState as the other units); a machine tile "Lights · Light for the crop" after Air circulation (before the exhaust), only when fitted |
| Alarms | `machine.lights` like the other relay machines |

## 9. Tests

| Area | Cases |
|---|---|
| Rule | fitted/not, auto off, no crops, hours 0, inside and outside the window, a window crossing midnight, stage change mid-day |
| Program | defaults, saving `lightHours` and `lightStart`, the checks |
| Machines and poller | 6 coils and inputs, `not-fitted`, manual PUT refused when not fitted |
| Energy | estimate with the rating; the device's power; simulation runs with and without lights |
| Upgrade | 15 → 16 on a v15 copy |
| Pages | the Lighting group, the Light row and pencil, the lamp, the tile, the dialog fields; browser check on a throwaway app |

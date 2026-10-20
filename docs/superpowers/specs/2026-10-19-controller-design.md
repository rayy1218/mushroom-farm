# Automatic control (v2 iteration 5)

Date: 2026-10-19 · Branch `v2` · Builds on `2026-10-16-machines-design.md` (iteration 3) and the device simulation (iteration 4). Rules given by the owner; the lead chose the defaults marked *default*.

## 1. Rules (owner)

| Machine | Rule |
|---|---|
| **Air exchange** (intake + exhaust together) | starts when CO₂ ≥ CO₂ band upper limit (750), stops when CO₂ ≤ band lower limit (600); between them it keeps its state. "Air exchange" = this on state. |
| **Humidifier** | band rule on RH: on when RH ≤ RH band lower limit, off when RH ≥ upper limit, keeps its state in between; **always on during an air exchange**, unless "Humidifier on during air exchange" is off for the room (then it follows its RH band state alone; the band state is tracked either way) |
| **Aircon** | power on, mode cool, fan from the room's `acFan` setting (*default* auto; a slower fan makes the coil colder and wrings more water out of air that is not near saturation; in a room close to saturation it hardly matters, revised simulation 2026-10-20); setpoint = middle of the temperature band; **during an air exchange setpoint − `acDrop`** (a room setting 0 to 10 °C, step 0.5; 0 for a new room because the aircon already runs at full power during an exchange; rooms that existed at the upgrade 7 → 8 keep the 5 °C they had; clamped to the AC's 16–30 °C, rounded to 0.5) |
| **Circulation fan** | on all the time |

## 2. Settings per room

| Setting | Default | Limits |
|---|---|---|
| `auto` | off *default* | — |
| CO₂ band `co2Low`–`co2High` | 600–750 ppm | 300–5000, low < high |
| Temperature band `tLow`–`tHigh` | 21–23 °C *default* | 16–35, low < high |
| RH band `rhLow`–`rhHigh` | 85–95 % *default* | 40–100, low < high |
| `humidifierDuringExchange` "Humidifier on during air exchange" | off for a new room (2026-10-20: the outdoor dew point, 23–27 °C on the Malaysian lowlands, is above the room's T, so fresh air cooled into the room arrives at over 100 % RH; the exchange humidifies already); rooms that existed at the upgrade 3 → 4 keep on | true or false; a change takes effect on the next cycle |
| `acFan` "Aircon fan" | auto (current behaviour) | `auto`, `low` or `high`; a change takes effect on the next cycle |

Stored in a new table `room_controls (room_id PK, auto, co2_low, co2_high, t_low, t_high, rh_low, rh_high, exchange INTEGER, exchange_since INTEGER, humidifier INTEGER, humidifier_during_exchange INTEGER NOT NULL DEFAULT 1 (a new room's row is written with 0), ac_fan TEXT NOT NULL DEFAULT 'auto' CHECK (ac_fan IN ('auto','low','high')))` (db upgrade 2 → 3, 3 → 4 adds `humidifier_during_exchange`, and 5 → 6 adds `ac_fan`; a row per room, created with the room and for existing rooms by the upgrade; deleted with the room). `exchange` and `humidifier` are the controller's remembered band states (so hysteresis survives a restart).

## 3. Running

| Item | Behaviour |
|---|---|
| When | at the end of each 5 s poll cycle, for every room with `auto` on |
| Inputs | the room's latest **ok** readings of this cycle: CO₂ from the CO₂ sensor, RH from the T/RH probe. A sensor whose latest poll failed (or not wired) → the rule that needs it **keeps its current state** *default* |
| Outputs | desired commands for intake, exhaust, humidifier, circulation (relay) and the AC (power, mode, setpoint, fan) |
| Sending | only machines whose desired command differs from the **commanded** value in the database (same path as a manual command: save + write); never re-sent every cycle, except a machine whose status is `not-following`: it is sent again (same path) at most 3 times per not-following episode, about every 10–15 s because the status waits out the switching window and needs a poll after the send; after 3 tries it stops and the red status stands, with the reason "<Machine>: not following after 3 tries" (while re-sending: "<Machine>: not following, sent again (2 of 3)"). The count is in memory per room and machine, and resets when the machine follows again (on/off), when the desired value changes, when auto is turned on, and when the room is deleted; no relay module or AC gateway address → that part is skipped |
| Turning auto on | evaluates at once on the next cycle (band states start from the current commanded intake state for `exchange`, current humidifier command for `humidifier`) |
| Turning auto off | nothing is switched; machines stay as they are and manual control is back |
| Manual commands while auto | 409 "Automatic control is on" (field none) |
| Reason | per machine a short text kept in memory, e.g. "Air exchange: CO₂ 762 ≥ 750", "Humidifier: on during air exchange" (when it is off for the room: "Humidifier: off (RH 96 ≥ 95; not forced during air exchange)", "Humidifier: on (RH 84 ≤ 85)"), "Aircon: 17.0 °C (22.0 − 5 during air exchange)" (with acDrop 5; with 0 the text stays "Aircon: 22.0 °C (middle of 21–23)"; with the fan set to low or high the text ends ", fan low" / ", fan high", e.g. "Aircon: 22.0 °C (middle of 21–23), fan low"), "Circulation: always on", "CO₂ sensor not answering: air exchange kept on" |

## 4. API

| Route | Body / reply |
|---|---|
| `GET /api/rooms/:id/control` | `{ auto, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, humidifierDuringExchange, acFan, exchange, exchangeSince, humidifierBand, reasons: { exchange, humidifier, ac, circulation } }` |
| `PUT /api/rooms/:id/control` | any of `auto`, `humidifierDuringExchange` (boolean), `acFan` (`auto`, `low` or `high`) and the six band values; validation 400 with `field` ("CO₂ band lower limit must be below the upper limit", "Aircon fan must be auto, low or high" with field `acFan`…); reply as GET |
| `PUT /api/rooms/:id/machines/…` | 409 while `auto` is on |
| `GET /api/rooms/:id/machines` | unchanged, plus `auto: bool` at the top level |

## 5. Page (room detail)

| Element | Behaviour |
|---|---|
| "Automatic control" card (above Machines) | Auto switch; three band rows (CO₂ ppm, Temperature °C, Humidity %) with low/high number inputs and **Save**; under them the switch "Humidifier on during air exchange" and the choice "Aircon fan" (Auto / Low / High), each sent at once with "Sending…" and not part of Save (unsent edits kept across the 5 s refresh, like the AC form); state line "Air exchange on since 10:42" / "Air exchange off"; the four reasons |
| Machines card while auto | toggles and AC controls disabled, a note "Automatic control is on" |
| Errors | field errors under the band inputs |

## 6. Tests

| Area | Covers |
|---|---|
| Controller (pure decide function) | band hysteresis for CO₂ and RH (on at ≥ upper, off at ≤ lower, keep in between), humidifier forced on during exchange, AC fan from the setting (auto, low, high) and its reason text, AC setpoint middle and −5 with clamp/rounding, circulation always on, missing sensor keeps state |
| Runner | only differences are sent; nothing when auto off; skipped parts without addresses; band states saved; manual 409 while auto |
| DB / API | upgrade 2 → 3 keeps rooms, readings and commands; control validation; deletes with room |
| End to end | farm controller + device simulation: closed room CO₂ rises to ≥ 750 → exchange on (intake, exhaust, humidifier on, AC setpoint 17) → CO₂ falls to ≤ 600 → exchange off (AC back to 22) |

## Changes 2026-10-20

| Change | Rule |
|---|---|
| CO₂ band lower limit | at least 450 ppm (outdoor air is about 420, so a lower limit below that can never be reached); both inputs and the server check 450 to 5000 |
| `acDrop` | new room setting "Aircon lower during air exchange (°C)", 0 to 10, saved with the bands; column `room_controls.ac_drop REAL NOT NULL DEFAULT 5` (db upgrade 7 → 8, so existing rooms keep 5); a new room's row is written with 0 |
| Hints | each band row shows the typical band of the crops grown here (temperature: grey oyster about 24 to 28 °C, lion's mane about 18 to 22 °C; CO₂: oyster under about 1000, lion's mane under about 750 to 1000 ppm; humidity: 85 to 95 % oyster, about 90 % lion's mane) |
| Safety level label | "CO₂ safety level for the crop (ppm)", with the hint that it is not a limit for people (5000 ppm over 8 h) |

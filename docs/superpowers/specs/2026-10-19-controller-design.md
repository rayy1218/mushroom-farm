# Automatic control (v2 iteration 5)

Date: 2026-10-19 · Branch `v2` · Builds on `2026-10-16-machines-design.md` (iteration 3) and the device simulation (iteration 4). Rules given by the owner; the lead chose the defaults marked *default*.

## 1. Rules (owner)

| Machine | Rule |
|---|---|
| **Air exchange** (intake + exhaust together) | starts when CO₂ ≥ CO₂ band upper limit (750), stops when CO₂ ≤ band lower limit (600); between them it keeps its state. "Air exchange" = this on state. |
| **Humidifier** | band rule on RH: on when RH ≤ RH band lower limit, off when RH ≥ upper limit, keeps its state in between; **always on during an air exchange** |
| **Aircon** | power on, mode cool, fan auto; setpoint = middle of the temperature band; **during an air exchange setpoint − 5 °C** (clamped to the AC's 16–30 °C, rounded to 0.5) |
| **Circulation fan** | on all the time |

## 2. Settings per room

| Setting | Default | Limits |
|---|---|---|
| `auto` | off *default* | — |
| CO₂ band `co2Low`–`co2High` | 600–750 ppm | 300–5000, low < high |
| Temperature band `tLow`–`tHigh` | 21–23 °C *default* | 16–35, low < high |
| RH band `rhLow`–`rhHigh` | 85–95 % *default* | 40–100, low < high |

Stored in a new table `room_controls (room_id PK, auto, co2_low, co2_high, t_low, t_high, rh_low, rh_high, exchange INTEGER, exchange_since INTEGER, humidifier INTEGER)` (db upgrade 2 → 3; a row per room, created with the room and for existing rooms by the upgrade; deleted with the room). `exchange` and `humidifier` are the controller's remembered band states (so hysteresis survives a restart).

## 3. Running

| Item | Behaviour |
|---|---|
| When | at the end of each 5 s poll cycle, for every room with `auto` on |
| Inputs | the room's latest **ok** readings of this cycle: CO₂ from the CO₂ sensor, RH from the T/RH probe. A sensor whose latest poll failed (or not wired) → the rule that needs it **keeps its current state** *default* |
| Outputs | desired commands for intake, exhaust, humidifier, circulation (relay) and the AC (power, mode, setpoint, fan) |
| Sending | only machines whose desired command differs from the **commanded** value in the database (same path as a manual command: save + write); never re-sent every cycle; no relay module or AC gateway address → that part is skipped |
| Turning auto on | evaluates at once on the next cycle (band states start from the current commanded intake state for `exchange`, current humidifier command for `humidifier`) |
| Turning auto off | nothing is switched; machines stay as they are and manual control is back |
| Manual commands while auto | 409 "Automatic control is on" (field none) |
| Reason | per machine a short text kept in memory, e.g. "Air exchange: CO₂ 762 ≥ 750", "Humidifier: on during air exchange", "Aircon: 17.0 °C (22.0 − 5 during air exchange)", "Circulation: always on", "CO₂ sensor not answering: air exchange kept on" |

## 4. API

| Route | Body / reply |
|---|---|
| `GET /api/rooms/:id/control` | `{ auto, co2Low, co2High, tLow, tHigh, rhLow, rhHigh, exchange, exchangeSince, reasons: { exchange, humidifier, ac, circulation } }` |
| `PUT /api/rooms/:id/control` | any of `auto` and the six band values; validation 400 with `field` ("CO₂ band lower limit must be below the upper limit"…); reply as GET |
| `PUT /api/rooms/:id/machines/…` | 409 while `auto` is on |
| `GET /api/rooms/:id/machines` | unchanged, plus `auto: bool` at the top level |

## 5. Page (room detail)

| Element | Behaviour |
|---|---|
| "Automatic control" card (above Machines) | Auto switch; three band rows (CO₂ ppm, Temperature °C, Humidity %) with low/high number inputs and **Save** (unsent edits kept across the 5 s refresh, like the AC form); state line "Air exchange on since 10:42" / "Air exchange off"; the four reasons |
| Machines card while auto | toggles and AC controls disabled, a note "Automatic control is on" |
| Errors | field errors under the band inputs |

## 6. Tests

| Area | Covers |
|---|---|
| Controller (pure decide function) | band hysteresis for CO₂ and RH (on at ≥ upper, off at ≤ lower, keep in between), humidifier forced on during exchange, AC setpoint middle and −5 with clamp/rounding, circulation always on, missing sensor keeps state |
| Runner | only differences are sent; nothing when auto off; skipped parts without addresses; band states saved; manual 409 while auto |
| DB / API | upgrade 2 → 3 keeps rooms, readings and commands; control validation; deletes with room |
| End to end | farm controller + device simulation: closed room CO₂ rises to ≥ 750 → exchange on (intake, exhaust, humidifier on, AC setpoint 17) → CO₂ falls to ≤ 600 → exchange off (AC back to 22) |

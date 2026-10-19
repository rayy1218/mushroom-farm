# Safety and history (v2 iteration 6)

Date: 2026-10-19 · Branch `v2` · Builds on `2026-10-19-controller-design.md` (iteration 5). Ports items 1–4 and 7 of the v1 comparison: alarms, sensor checks with safe states, a CO₂ safety level with an exchange time limit, machine protection, long-range charts with a machine timeline, and an Overview home page. The owner asked to go straight to building; the lead chose every default (marked *default*). v1 code it follows: `controller.js` on `master` (SENSORS, ALARMS, validate, protectAir/Fog/Ac).

## 1. Sensor checks

Every cycle, for every room (auto on or off), the latest reading of each wired sensor taken in this cycle is checked. A reading that fails a check is **bad**: the controller treats it as missing, and no process alarm uses it.

| Check | T | RH | CO₂ | Bad when |
|---|---|---|---|---|
| No reading | ✓ | ✓ | ✓ | the poll failed (`ok` false) |
| Range | −10 to 60 °C | 1 to 100 % | 300 to 10 000 ppm | outside the range |
| Sudden jump | 2 °C/min | 15 %/min | 1000 ppm/min | the change since the last good reading, per minute, is above the rate. A jump is accepted (good again) when 3 readings in a row agree with each other (each within the rate of the one before). A **falling** CO₂ is not tested while an air exchange runs or in the cycle after it stopped. |
| Frozen | 120 min | 120 min (30 min while the humidifier is commanded on) | 60 min | the exact same value for that long. RH ≥ 99.9 is never frozen (a wet probe reads 100). |

| Item | Behaviour |
|---|---|
| Fault | 3 bad readings in a row → the sensor is **faulty** (alarm 3.1 "sensor fault"); the next good reading ends the fault |
| T/RH probe | T and RH are checked separately; the probe is faulty when either value is faulty. The controller uses RH only. |
| State | in memory per room and kind (last good value and time, same-value start, pending jump, bad count); a restart starts fresh *default* |
| Not polled this cycle | not counted (no reading of this cycle → nothing changes) |
| Module | `server/checks.js`: `createSensorChecks({ now })` → `{ check(roomId, kind, reading, ctx) → { ok, why, fault, faultWhy }, get(roomId) → { trh, co2 }, forget(roomId) }`; `ctx = { exchangeRecent, humidifierOn }`. `why`/`faultWhy` texts: "no reading", "value out of range", "sudden jump", "value does not change (frozen)". |

## 2. Controller changes

### 2.1 Air exchange (replaces the CO₂ rule of iteration 5)

| State | Condition (checked in this order) | Result | Reason text |
|---|---|---|---|
| any | CO₂ sensor faulty | **timed exchange**: on for 10 min, then off for 20 min *default*, repeating (from `exchangeSince` / `exchangeEndedAt`) | "CO₂ sensor fault: timed air exchange, 10 min of every 30" |
| any | no good CO₂ reading this cycle (bad or missing, not yet faulty) | kept | "CO₂ reading not usable: air exchange kept on/off" |
| off | CO₂ ≥ safety level | on at once (ignores the minimum off time) | "Air exchange: CO₂ 1300 ≥ safety level 1250" |
| off | CO₂ ≥ upper limit and off for ≥ 60 s | on | "Air exchange: CO₂ 762 ≥ 750" |
| off | CO₂ ≥ upper limit, off < 60 s | stays off | "Air exchange waits: minimum off time, 40 s to go" |
| off | otherwise | off | as iteration 5 |
| on | CO₂ ≥ safety level | stays on, no time limit | "Air exchange: CO₂ 1300 ≥ safety level 1250, no time limit" |
| on | CO₂ ≤ lower limit and on for ≥ 30 s | off; `cappedInRow` = 0 | "Air exchange: CO₂ 590 ≤ 600" |
| on | on for ≥ time limit | off; `cappedInRow` + 1 | "Air exchange stopped at the 10 min limit: CO₂ 667 above 600" |
| on | otherwise | stays on | as iteration 5 |

After a stop at the limit the band rule applies again: CO₂ between the limits keeps the exchange off, so it only restarts at the upper limit. This ends the never-ending exchange of iteration 5. `cappedInRow` ≥ 3 raises "Air exchange too small" (3.1). The safety level and the time limit apply only with auto on; with auto off the safety alarm is still raised.

### 2.2 Humidifier

| Item | Behaviour |
|---|---|
| Band rule, forced during exchange | as iteration 5 |
| T/RH probe faulty | **timed humidifier**: band state on for 10 min, off for 10 min *default*, repeating (from `humidifierSince`); reason "Humidity sensor fault: timed humidifier, 10 min of every 20" |
| Bad RH reading, not faulty | band state kept (as iteration 5) |

### 2.3 Machine protection (auto only; manual commands act at once) *defaults*

| Machine | Rule | Reason while held |
|---|---|---|
| Air exchange (intake + exhaust) | at least 30 s on and 60 s off (2.1); the safety level skips the off wait | in 2.1 |
| Humidifier | its command changes at most once a minute (1 min on, 1 min off) | "Humidifier waits: minimum on time, 40 s to go" / "minimum off time" |
| Aircon | at most one changed command every 2 min (a re-send of the same command to a not-following AC is not a change) | "Aircon waits: next change in 1 min 20 s" |
| Circulation | none (always on) | — |

The humidifier and aircon change times are kept in memory per room (the last time the controller changed that command); after a restart there is no wait *default*. The re-send rule of iteration 5 is unchanged.

### 2.4 Pure functions

| Function | Change |
|---|---|
| `decide({ bands, state, readings, faults, now, humidifierDuringExchange, acFan })` | `bands` gains `co2Safety` and `exchangeMaxMin`; `state` = `{ exchange, exchangeSince, exchangeEndedAt, cappedInRow, humidifier, humidifierSince }`; `faults` = `{ co2, trh }` (booleans); returns `{ state, desired, reasons }` with the new state times |
| `protect({ desired, commands, changedAt: { humidifier, ac }, now })` | new: returns `{ desired, held: { humidifier, ac } }` (held = reason text or ''); the desired values with a held machine kept at its commanded value |

### 2.5 New settings per room

| Setting | Label | Default | Limits |
|---|---|---|---|
| `co2Safety` | CO₂ safety level (ppm) | 1250 *default* (v1: limit + 500) | above `co2High`, at most 10 000 ("CO₂ safety level must be above the CO₂ band upper limit", field `co2Safety`) |
| `exchangeMaxMin` | Air exchange time limit (min) | 10 *default* | whole number 1–120 ("Air exchange time limit must be a whole number from 1 to 120 min") |

## 3. Alarms

### 3.1 Kinds *defaults*

| Key | Level | Raised when | Cleared when | Delay | Text (example) |
|---|---|---|---|---|---|
| `tHigh` | warning | T > tHigh + 1 | T ≤ tHigh + 0.8 | 5 min | "Temperature 24.3 °C, above 23 + 1" |
| `tLow` | warning | T < tLow − 1 | T ≥ tLow − 0.8 | 5 min | "Temperature 19.6 °C, below 21 − 1" |
| `rhLow` | warning | RH < rhLow − 5 | RH ≥ rhLow − 4 | 5 min | "Humidity 78 %, below 85 − 5" |
| `co2High` | warning | CO₂ > co2High + 100 | CO₂ ≤ co2High + 80 | 5 min | "CO₂ 880 ppm, above 750 + 100" |
| `co2Safety` | critical | CO₂ ≥ co2Safety | CO₂ < co2Safety − 20 | 60 s | "CO₂ 1300 ppm, at or above the safety level 1250" |
| `sensorTrh` / `sensorCo2` | serious | sensor faulty (1) | fault ends | none | "T/RH probe fault: value does not change (frozen)" |
| `exchangeTooSmall` | warning | `cappedInRow` reaches 3 | an exchange ends at the lower limit, or auto turned off | none | "Air exchange too small: 3 exchanges in a row stopped at the 10 min limit before CO₂ reached 600 ppm" |
| `machine.<key>` (intake, exhaust, circulation, humidifier, ac) | serious | the machine's status is `not-following`, `not-running`, `running-while-off`, `fault` or `no-answer` for 60 s | status is anything else | 60 s | "Exhaust fan: not running (switch on, no current)" |

| Item | Behaviour |
|---|---|
| Who checks | the controller's `run`, after each cycle, for **every** room (auto on or off) |
| Process alarms (tHigh … co2Safety) | only from good readings; a faulty or missing sensor stops the delay count (no alarm from a bad sensor) |
| Delay | the condition must hold for the delay (kept in memory); shorter changes give no alarm |
| Machine alarms | only for wired machines; status from `machines.get(roomId)` |
| One at a time | at most one **active** alarm per room and key; text is fixed at raise time |
| Acknowledge | an active, acknowledged alarm stays shown (dimmed) until it clears; a cleared, unacknowledged alarm stays shown until acknowledged; cleared + acknowledged leaves the current list (kept in the history) |
| Room deleted | its alarms are deleted |
| Module | `server/alarms.js`: `createAlarms({ db, now })` → `{ evaluate(room, input), list… }`, input = `{ readings: { t, rh, co2 } (good values or null), bands, faults: { trh, co2 } with texts, cappedInRow, machines: view }` |

### 3.2 Table (db upgrade 6 → 7)

`alarms (id INTEGER PK, room_id INTEGER NOT NULL, key TEXT NOT NULL, level TEXT NOT NULL CHECK (level IN ('warning','serious','critical')), text TEXT NOT NULL, raised_at INTEGER NOT NULL, cleared_at INTEGER, acked_at INTEGER)` with index `(room_id, id)` and a unique partial index on `(room_id, key) WHERE cleared_at IS NULL`.

## 4. Machine log and history (db upgrade 6 → 7)

| Item | Behaviour |
|---|---|
| Table | `machine_log (id INTEGER PK, room_id INTEGER NOT NULL, machine TEXT NOT NULL CHECK (machine IN ('intake','exhaust','circulation','humidifier','ac')), at INTEGER NOT NULL, on_ INTEGER NOT NULL CHECK (on_ IN (0,1)), setpoint REAL, mode TEXT, fan TEXT, source TEXT NOT NULL CHECK (source IN ('manual','auto')))`, index `(room_id, machine, at)` |
| Written by | `machines.command` after it saves a command (manual, or auto via `bypassAuto`), only when the value differs from the previous log row of that machine (a re-send logs nothing) |
| Readings index | `readings_by_time (room_id, kind, at)` for the history query |
| Room deleted | its log rows are deleted |
| Upgrade | also adds `room_controls` columns `co2_safety REAL NOT NULL DEFAULT 1250`, `exchange_max_min INTEGER NOT NULL DEFAULT 10`, `exchange_ended_at INTEGER`, `capped_in_row INTEGER NOT NULL DEFAULT 0`, `humidifier_since INTEGER`; backup of the owner's file before the first run: `data/v2-before-safety.db` |

## 5. API

| Route | Reply |
|---|---|
| `GET /api/alarms` | the current alarms of every room (active, or cleared and not acknowledged): `[{ id, roomId, roomName, key, level, text, raisedAt, clearedAt, ackedAt }]`, critical first, then newest |
| `GET /api/rooms/:id/alarms` | `{ current: [...], history: [...] }`; history = the room's last 50 alarms of any state, newest first |
| `POST /api/alarms/:id/ack` | 200 with the alarm (acknowledging twice is fine); 404 "Alarm not found" |
| `POST /api/rooms/:id/alarms/ack` | acknowledges every current alarm of the room; 200 `{ acked: n }` |
| `GET /api/rooms/:id/control` | gains `co2Safety`, `exchangeMaxMin`, `exchangeEndedAt`, `cappedInRow`, `checks: { trh: { ok, why, fault }, co2: {…} }` (null for a sensor not checked yet), `reasons.held` text for protection waits (shown with the machine's reason) |
| `PUT /api/rooms/:id/control` | accepts `co2Safety`, `exchangeMaxMin` |
| `GET /api/rooms/:id/history?hours=N` | N one of 1, 6, 24, 168, 720 (400 otherwise, field `hours`). `{ from, to, bucketS, trh: [{ at, t, rh }], co2: [{ at, co2 }], machines: { intake: [{ at, on, source }], exhaust, circulation, humidifier, ac: [{ at, on, setpoint, mode, fan, source }] } }`. Readings: good readings only, averaged in buckets of `bucketS` = 15 s, 60 s, 5 min, 30 min, 2 h for 1, 6, 24, 168, 720 h (`at` = bucket middle); empty buckets are left out. Machines: the log rows in the window plus the last row before `from` (with `at` = `from`), so each line starts with its state. |
| `GET /api/overview` | `{ rooms: [{ id, name, trh: { status, t, rh, at }, co2: { status, co2, at }, auto, exchange, exchangeSince, bands: { tLow, tHigh, rhLow, rhHigh, co2Low, co2High }, alarms: { count, level } , spark: { t: [{at, v}], rh: […], co2: […] } }], alarms: <as GET /api/alarms, at most 10> }`; spark = 24 h in 30 min buckets |

## 6. Pages

| Page | Element | Behaviour |
|---|---|---|
| **Overview** `#/overview` (new home: an empty or unknown hash goes here; side bar and tab bar get an "Overview" first entry) | Tiles | "Rooms" (count, how many with no active alarm: "3 of 4 OK"), "Alarms" (active count, highest level colour), "Air exchanges running" (count) |
| | Alarm list | the 10 newest current alarms over all rooms: level chip, room name (link), text, time ("10:42", or "12 Oct 10:42" before today), Acknowledge button |
| | Room cards | name (link to the room), T / RH / CO₂ now with the sensor status word when not online, Auto on/off, "Air exchange on since 10:42", alarm count chip, three 24 h sparklines with the band shaded; "No rooms yet" with a link to Rooms when empty |
| | Refresh | every reading interval (as the room page); parts fail independently with one banner line |
| **Room page** | Alarms card (top, hidden when there are no current alarms) | current alarms (level chip, text, raised time, "Cleared 10:50" when cleared, dimmed when acknowledged), Acknowledge per alarm and "Acknowledge all"; a "History" disclosure listing the last 50 |
| | Automatic control card | two more inputs in the band area: "CO₂ safety level (ppm)" and "Air exchange time limit (min)", saved with **Save**; the state line "Air exchange on since 10:42 (stops by 10:52)"; a held reason under its machine's reason; sensor check line "CO₂ sensor: fault (value does not change)" when not ok |
| | Charts | a range choice over the charts: Live (last 50 polls, as today) / 1 h / 6 h / 24 h / 7 d / 30 d *default* Live; other ranges use `/history`, refreshed every 60 s; the band shading stays; 7-day and 30-day ticks show the date |
| | Machine timeline (under the charts, ranges other than Live) | one row per machine (Intake, Exhaust, Circulation, Humidifier, Aircon), a bar where it was commanded on (auto bars solid, manual bars hatched), the AC row labelled with its setpoint changes; hovering a chart shows a shared time line across the charts and the timeline |
| **Rooms list** | each row | an alarm chip with the count of active alarms, coloured by the highest level |
| **Nav** | Overview entry | a badge with the number of active, unacknowledged alarms (polled every 30 s); page title prefixed "(2) " when > 0 |

## 7. Tests

| Area | Covers |
|---|---|
| Checks | each check and its texts, jump accepted after 3 agreeing readings, CO₂ fall during exchange, wet RH not frozen, humidifier-on 30 min RH frozen, fault after 3, recovery |
| Controller | safety start/hold, time limit stop + `cappedInRow`, min on/off, timed exchange and timed humidifier on faults, `protect` for humidifier and AC, reasons |
| Alarms | each kind raises after its delay and not before, clears with hysteresis, no alarm from a bad sensor, one active per key, acknowledge rules, delete with room |
| DB | upgrade 6 → 7 keeps rooms, readings, commands, controls; new defaults; deletes with room |
| API | alarm routes, history buckets and machine start rows, overview shape, control validation of the new settings |
| Machine log | logs manual and auto changes, not re-sends |
| Web | pure helpers (bucket ticks, timeline spans, badge count, title), stubbed fetch for pages |
| End to end | farm + device simulation: CO₂ held at 667 between the limits → the exchange stops at the time limit; a CO₂ sensor set to "not answering" → fault alarm and timed exchange |

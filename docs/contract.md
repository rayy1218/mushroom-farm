# Controller contract

This document defines the data that goes into the climate controller and the data that comes out of it.
A hardware adapter, the simulation, and a port of the controller to another language (Rust, C++) must all
use this contract.

On the farm server, `server/rooms.js` runs this loop once per room: one adapter and one controller per room, ticked every second.

| Contract | Content |
|---|---|
| [`contracts/db.md`](contracts/db.md) | The database |
| [`contracts/rooms.md`](contracts/rooms.md) | The room manager and the adapters |
| [`contracts/api.md`](contracts/api.md) | The HTTP API and the live feed |
| [`contracts/web.md`](contracts/web.md) | The web modules and the settings editor |
| [`contracts/air.md`](contracts/air.md) | The air exchange |

```
 sensors ──► adapter.read() ──► reading ──► controller.update(reading) ──► commands ──► adapter.write(commands) ──► machines
                                   ▲                                                                    │
                                   └──────────────── runtime.js: one decision per new reading ◄─────────┘
```

On the server, each reading and its commands are recorded in `data/farm.db` (`readings`, `events`, `alarms`).

## 1. Reading

The adapter makes one reading per sensor period (default 30 s). `seq` changes when a new reading is available.
The controller decides only on a new reading.

| Field | Unit | Range | Notes |
|---|---|---|---|
| `seq` | – | integer | Increases by 1 for each new reading. |
| `t` | s | ≥ 0 | Controller time. It must increase. The difference between readings is the time step. On the farm server: seconds since 1970 UTC (the simulated adapter adds a time origin, `contracts/rooms.md` 13.2). In the Test bench and the test vectors: seconds from the start of the run (0). |
| `hour` | h | 0–24 | Local time of day at the farm (Malaysia, UTC+8, no daylight saving), decimal hours. Used for lights, harvest windows, and history. |
| `T` | °C | −10–60 | Room temperature (main sensor set). |
| `RH` | % | 1–100 | Room relative humidity (main set). |
| `CO2` | ppm | 300–10000 | Room CO₂ (main set). |
| `tOut` | °C | −20–60 | Outdoor temperature. |
| `rhOut` | % | 1–100 | Outdoor relative humidity. |
| `core` | °C | −10–70 | Optional: block probe. **Leave it out** (undefined) when there is no probe. |
| `T2`, `RH2`, `CO2b` | as above | as above | Optional: second sensor set. Leave them out when there is no second set. |
| `power` | W | `{ ac, hu, air, lights, circ }` | Optional: power of each machine now. The server stores the sum as `power_w`. Leave it out without a meter. The controller ignores it. |
| `kwh` | kWh | `{ ac, hu, air, lights, circ }` | Optional: energy of each machine since the adapter's meter started (it only grows). The server stores the sum as `kwh`. The controller ignores it. |
| `runS` | s | `{ ac, hu, air }` | Simulation only: run time of each machine. The controller and the server ignore it. |
| `water` | kg | `{ fogKg, acKg }` | Simulation only: fogger water and AC condensate. The controller and the server ignore it. |
| `unfilteredM3` | m³ | ≥ 0 | Simulation only: air that came in unfiltered. The controller and the server ignore it. |

A sensor that is installed but gives no value sends `null`. The controller counts `null`, values out of range,
spikes, and frozen values as bad. After 3 bad readings in a row, the sensor has a fault and its loop goes to a safe state.

Do not filter, average, or correct the values in the adapter. The controller does this (sensor corrections are a setting).
The server stores the values as the adapter gives them (no filtering), as the 18 keys of `contracts/db.md` 6.2 (`readings`, 4.2).

## 2. Commands

`controller.update()` returns the commands after the machine protection (minimum on/off times, minimum time between AC
commands). The adapter must send them as they are.

| Field | Values | Notes |
|---|---|---|
| `ac.power` | `true` / `false` | |
| `ac.mode` | `cool`, `heat`, `dry`, `fan` | |
| `ac.setpoint` | 16–30 °C, steps of 0.5 | The AC's own thermostat controls to this value. |
| `ac.fan` | `low`, `auto`, `high` | High fan = warmer coil = less water out of the air. |
| `hu.level` | 0–3 | Fogger level (0 = off). |
| `air.on` | `true` / `false` | Air exchange: the intake fan (SF-203) and the exhaust fan (EF-206) on together, dampers open (C9). |
| `lights.on` | `true` / `false` | |
| `circ.on` | `true` / `false` | Circulation fan. |

The server records the commands of each reading (`ac_mode`, `ac_setpoint`, `fog`, `air`, `lights`, `circ`, and from upgrade 3 `ac_fan`; `ac_mode` is `off` when `ac.power` is off): `contracts/db.md` 4.2.

### Rules for an adapter

| # | Rule | Detail |
|---|---|---|
| 1 | **Keep the last command.** | Between readings, the machines keep the last command. |
| 2 | **Send changes, and repeat when the link is one-way.** | An infrared AC link cannot read the AC state, so send the AC command again every 10 min (the AC can miss a command). Relays and Modbus need no repeat. |
| 3 | **Safe state when the controller stops** (a watchdog in the adapter or the relay board). | If the adapter receives no new command for 5 min: fogger off (no flooding); air exchange on (fresh air and CO₂ removal); AC: leave it on, its own thermostat holds the last setpoint; lights: off. |
| 4 | **Time.** | On the farm server `t` is seconds since 1970 UTC and increases; `hour` is farm local time. |

These values are a proposal; confirm them for the farm.

## 3. Test vectors (for a port)

`tests/vectors/*.json` contain recorded scenarios:

```json
{
  "format": "mushroom-climate-vectors", "version": 1, "name": "spikes", "description": "...",
  "settings": { ...the controller settings... },
  "cmdFields": ["acPower", "acMode", "acSetpoint", "acFan", "fogLevel", "air", "lights", "circ"],
  "actions": [ { "beforeStep": 120, "call": "setStage", "args": ["pinning"], "t": 3600 } ],
  "steps": [ { "r": { "seq": 1, "t": 0, "hour": 6, "T": 27.0, "...": "..." }, "c": [1, "cool", 25, "auto", 0, 0, 0, 1] } ]
}
```

A port must:

| Step | Action |
|---|---|
| 1 | Make a controller with `settings`. |
| 2 | For each step in order: first do the `actions` with `beforeStep` equal to the step index, then call `update(r)`. |
| 3 | Compare the commands with `c`. **All steps must agree.** The JS test is `tests/vectors.test.js`. |

The scenarios: tropical fruiting with a harvest window, CO₂ sensor missing, spikes on all sensors, dry weather,
two sensor sets with a failed main RH sensor, a black oyster stage change with ramps, cold weather (heat mode),
a crowded room in dry air (purges delayed by humidity first), and purges that hit the time cap (C9 section 9).

When an intended change of the JS controller changes the commands, make the vectors again (`npm run vectors`) and
port the same change.

## 4. Settings file

`ClimateController.exportSettings(cfg)` gives:

```json
{ "format": "mushroom-climate-settings", "version": 2, "saved": "2026-10-07T06:00:00.000Z", "settings": { ... } }
```

`importSettings(file)` does not trust the file. It keeps only known settings, holds numbers inside their limits,
accepts only known names for selections, corrects settings that disagree (for example a fan stop level above the
start level), and gives a warning for each correction. A version 1 file goes through `upgradeSettings` first: each removed fresh-air setting gives a warning (C9 5.2).

Where the format is used:

| Use | Part of the file | Checked by |
|---|---|---|
| Settings versions on the server | The `settings` part only, one row per save in `room_settings` | `upgradeSettings` then `importSettings` on every save and Restore (`contracts/rooms.md` 9.2, `contracts/air.md` 6.3) |
| `GET` and `PUT /api/rooms/:id/settings` | The bare settings object | `contracts/api.md` 3.5 |
| `tools/run-headless.js --settings <file>` | The whole file | `importSettings` |

## 5. Adapter on the farm server

The server runs one adapter per room (`contracts/rooms.md` 12). A hardware adapter (work item 3.2) gives the same object.

| Member | Required | Signature | Rules |
|---|---|---|---|
| `io.read()` | Yes | `() => reading \| null` | Section 1. `seq` changes with each new reading. `t` is seconds since 1970 UTC and increases. `hour` is farm local time. Optional extras: `power` and `kwh` (per machine). |
| `io.write(cmd)` | Yes | `(cmd) => void` | Section 2: send the commands as they are; keep the last command between readings. |
| `io.advance(dt)` | No (simulated adapters only) | `(dt: integer s ≥ 1) => void` | Moves the simulated room by `dt` real seconds with the last command. |
| `view()` | Yes | `() => object \| null` | Plant data for a drawing or a test; the controller never sees it. A hardware adapter returns `null`. |
| `snapshot()` | Yes | `() => object \| null` | State to resume from, stored by the server. A hardware adapter returns `null`. |

| Factory argument | Type | Meaning |
|---|---|---|
| `room` | `{ id, name, volume, adapter, created_at, archived_at }` | The room row (no `vent`) |
| `calib` | object or `null` | The room's current calibration |
| `blocks` | integer or `null` | The room's block count |
| `equipment` | object or `null` | The room's machines, or `null`; the simulated room gets `env.plant` from it |
| `cfg` | settings object | The live settings; `cfg.airM3h` is the simulated room's air exchange size |
| `snapshot` | object or `null` | The state of the last save |
| `now` | `() => integer` | The manager's clock (`contracts/rooms.md` 12.2, 13.1) |

| Timing | Value |
|---|---|
| Tick | Every 1 s |
| Physics | In 1 s steps |
| Decision | One per new reading (30 s) |
| Catch-up | Up to 300 s; a longer pause is a gap |
| State save | Every 300 s and at stop (`contracts/rooms.md` 13.2, 14) |

| Step | Adding a hardware adapter (work item 3.2) |
|---|---|
| 1 | Write a module that returns the same object: `view()` and `snapshot()` return `null`, and there is no `io.advance`. |
| 2 | Put its name in `rooms.adapter` (the column has no `CHECK`). |
| 3 | Add a branch in `defaultAdapterFactory` of `server/rooms.js`. An unknown name stops that room with `Unknown adapter "<name>"`. |
| 4 | Today the server creates every room with `adapter: 'sim'`, so choosing another adapter is a contract change of work item 3.2. |
| 5 | Follow the adapter rules of section 2 (watchdog, keep the last command). |

# Controller contract

This document defines the data that goes into the climate controller and the data that comes out of it.
A hardware adapter, the simulation, and a port of the controller to another language (Rust, C++) must all
use this contract.

```
 sensors ──► adapter.read() ──► reading ──► controller.update(reading) ──► commands ──► adapter.write(commands) ──► machines
                                   ▲                                                                    │
                                   └──────────────── runtime.js: one decision per new reading ◄─────────┘
```

## 1. Reading

The adapter makes one reading per sensor period (default 30 s). `seq` changes when a new reading is available.
The controller decides only on a new reading.

| Field | Unit | Range | Notes |
|---|---|---|---|
| `seq` | – | integer | Increases by 1 for each new reading. |
| `t` | s | ≥ 0 | Controller time. It must increase. The difference between readings is the time step. |
| `hour` | h | 0–24 | Local time of day (decimal). Used for lights, harvest windows, and history. |
| `T` | °C | −10–60 | Room temperature (main sensor set). |
| `RH` | % | 1–100 | Room relative humidity (main set). |
| `CO2` | ppm | 300–10000 | Room CO₂ (main set). |
| `tOut` | °C | −20–60 | Outdoor temperature. |
| `rhOut` | % | 1–100 | Outdoor relative humidity. |
| `core` | °C | −10–70 | Optional: block probe. **Leave it out** (undefined) when there is no probe. |
| `T2`, `RH2`, `CO2b` | as above | as above | Optional: second sensor set. Leave them out when there is no second set. |

A sensor that is installed but gives no value sends `null`. The controller counts `null`, values out of range,
spikes, and frozen values as bad. After 3 bad readings in a row, the sensor has a fault and its loop goes to a safe state.

Do not filter, average, or correct the values in the adapter. The controller does this (sensor corrections are a setting).

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
| `fan.level` | 0–3 | Exhaust (or supply) fan level (0 = off). |
| `lights.on` | `true` / `false` | |
| `circ.on` | `true` / `false` | Circulation fan. |

### Rules for an adapter
1. **Keep the last command.** Between readings, the machines keep the last command.
2. **Send changes, and repeat when the link is one-way.** An infrared AC link cannot read the AC state, so send the
   AC command again every 10 min (the AC can miss a command). Relays and Modbus need no repeat.
3. **Safe state when the controller stops** (a watchdog in the adapter or the relay board). If the adapter receives no new
   command for 5 min:
   - fogger off (no flooding),
   - exhaust fan at Low (fresh air and CO₂ removal),
   - AC: leave it on; its own thermostat holds the last setpoint,
   - lights: off.
   These values are a proposal; confirm them for the farm.

## 3. Test vectors (for a port)

`tests/vectors/*.json` contain recorded scenarios:

```json
{
  "format": "mushroom-climate-vectors", "version": 1, "name": "spikes", "description": "...",
  "settings": { ...the controller settings... },
  "cmdFields": ["acPower", "acMode", "acSetpoint", "acFan", "fogLevel", "fanLevel", "lights", "circ"],
  "actions": [ { "beforeStep": 120, "call": "setStage", "args": ["pinning"], "t": 3600 } ],
  "steps": [ { "r": { "seq": 1, "t": 0, "hour": 6, "T": 27.0, "...": "..." }, "c": [1, "cool", 25, "auto", 0, 0, 0, 1] } ]
}
```

A port must:
1. Make a controller with `settings`.
2. For each step in order: first do the `actions` with `beforeStep` equal to the step index, then call `update(r)`.
3. Compare the commands with `c`. **All steps must agree.** The JS test is `tests/vectors.test.js`.

The scenarios: tropical fruiting with a harvest window, CO₂ sensor missing, spikes on all sensors, dry weather,
two sensor sets with a failed main RH sensor, a black oyster stage change with ramps, cold weather (heat mode),
and a crowded room in dry air (reduced purge, fan levels Low and High).

When an intended change of the JS controller changes the commands, make the vectors again (`npm run vectors`) and
port the same change.

## 4. Settings file

`ClimateController.exportSettings(cfg)` gives:

```json
{ "format": "mushroom-climate-settings", "version": 1, "saved": "2026-10-07T06:00:00.000Z", "settings": { ... } }
```

`importSettings(file)` does not trust the file. It keeps only known settings, holds numbers inside their limits,
accepts only known names for selections, corrects settings that disagree (for example a fan stop level above the
start level), and gives a warning for each correction. The same file is the configuration of a farm device.

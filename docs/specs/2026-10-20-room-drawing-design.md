# Room drawing

The animated room cross-section of the old app (FarmMimic), ported to v2. One module draws it; the farm's room page and the device app's simulated rooms feed it.

## 1. Where it is shown

| Place | Fed by | Mapping | Painted |
|---|---|---|---|
| Room page, "Room" card above the sensor cards (`web/room-detail.js`) | the room, its sensors, the machines view and the control state the page already loads | `fromRoom` | on every refresh (5 s by default) |
| Device page, each simulated room card (`device/web/sim-drawing.js`) | `GET /api/sims` room and `GET /api/sensors` | `fromSim` | on every refresh (2 s) |

## 2. Files

| File | Role |
|---|---|
| `web/mimic-math.js` | pure: `fromRoom`, `fromSim`, `readoutStatus`, `isNight`, `view`, `describe`, `sizeFor` (tested in Node) |
| `web/mimic.js` | DOM: `createMimic(host, { idPrefix })` returns `{ paint(drawState), tick(dtSeconds), destroy() }`; `startLoop(getMimics)` returns `stop()` |
| `web/mimic.css` | styles on the page's theme tokens; own drawing colours per theme |
| `device/http.js` | serves `mimic.js`, `mimic-math.js`, `machines-math.js`, `mimic.css` from the farm's `web/` folder (no copy) |
| `device/web/sim-drawing.js` | one drawing per simulated room card, one shared animation loop |

## 3. DrawState

| Field | Type | Meaning |
|---|---|---|
| `name` | string | room name |
| `note` | string | top line: "Automatic control · air exchange on", "Automatic control on/off", "Simulation switched off" |
| `out` | `{ T, RH }` or null | outdoor air; null draws "No outdoor sensor" and no sun or moon |
| `night` | boolean | moon instead of sun |
| `T`, `RH`, `CO2` | number or null | the readings; null draws "--" |
| `status.T`, `.RH`, `.CO2` | `{ lvl, icon, text }` or null | `lvl` none, good, warning, serious or critical; an icon and a word, never colour alone |
| `units.ac` | unit plus `mode` | aircon: `cool`, `heat`, `dry`, `fan` or null |
| `units.hu`, `.intake`, `.exhaust`, `.circ` | unit | humidifier, intake fan, exhaust fan, circulation fan |
| `blocks` | string | "2,000 blocks" under the rack, or empty |
| `co2Rate` | 0 to 1 | amount of CO₂ bubbles |
| `capScale` | 0 to 1 | size of the mushroom caps on the blocks |

A unit is `{ known, on, level, state, sub, warn }`:

| Field | Meaning |
|---|---|
| `known` | false draws the unit dimmed with "No data", "Not wired", "No answer" or "No relay linked" |
| `on` | moving: blades turn, mist rises, air arrows run |
| `level` | 0 to 1, speed and amount of the animation |
| `state`, `sub` | the words under the name; `sub` is the second line (aircon fan) |
| `warn` | machine problem: the outline is amber and the state starts with "!" |

## 4. fromRoom

| Input | Result |
|---|---|
| sensor `lastOk` values | `T`, `RH`, `CO2` (a timed-out sensor keeps its last value) |
| sensor status and the control bands | chip: not wired, no data yet, timeout or offline (serious), below band, above band, in band, safety level (critical) |
| relay machine status `on`, `off`, `switching`, `not-following`, `not-running`, `running-while-off` | `known` true; `on` is the device's running input (the coil when running is unknown); the last three also `warn` |
| relay machine status `not-wired`, `no-data`, `no-answer` | `known` false |
| aircon `reported` power, mode, setpoint, fan | `on`, `mode`, state "Cool 23.5 °C", sub "fan Auto"; level 0.6 (0.3 in fan mode); the condenser runs unless the mode is fan |
| aircon status `fault`, `not-following` | "Fault (code n)", "not following the farm"; both `warn` |
| aircon status not wired, no data, no answer, or no reported values | `known` false |
| control `auto`, `exchange` | `note` |
| outdoor | none: `out` null, `night` false |
| `CO2` | `co2Rate` = CO₂ / 3000 |

Missing input (null, undefined, partial objects) never throws; it draws "no data".

## 5. fromSim

| Input | Result |
|---|---|
| `state.T`, `rh`, `state.CO2` | readings; chips say "Simulated" |
| `outdoor.T`, `outdoor.RH` | `out` |
| `clock` (seconds since midnight) | `night` from 19:00 to 07:00 |
| linked relay `running[0..3]`, `coils` | intake, exhaust, circulation, humidifier: "Running", "On, not running" (warn), "Off"; running while off also warns; no link: "No relay linked" |
| linked aircon `power`, `mode` (0 to 3), `setpoint`, `fan`, `error` | like the room page; level = cooling or heating kW of `acting` / (`acBTU` × 0.00029307), at least 0.15 while on, 0.6 without `acting` |
| `acting.exchangeM3h` / `fanFlow` | fan level, at least 0.4 (1 without a flow figure) |
| `acting.humidifierGH` / (`humidifierLH` × 1000) | humidifier level, at least 0.2 |
| `blocks`, `co2PerBlock` | `blocks` text; `co2Rate` = blocks × mL/h / 1000 / 150 L/h, at least 0.15; 0 when the simulation is off |
| `enabled` false | note "Simulation switched off" |

## 6. Drawing rules

| Rule | Detail |
|---|---|
| Size | drawn 1:1 at the host's width (ResizeObserver rebuilds it); shapes scale, text never does; labels 12 to 13 px, readings 16 px, outdoor temperature 22 px |
| Layouts | host width 720 px or more: the cross-section (shapes scale from 0.72 to 1.35); under 720 px: a stacked layout 580 px high, designed for 320 to 719 px |
| Colours | the page's tokens (`--ink`, `--surface`, `--muted`, `--border-strong`); aircon blue, air teal, humidifier cyan, status colours set per theme in `mimic.css` |
| Accessibility | `role="img"` and an `aria-label` that says the readings, every machine and the outdoor state in words |
| Animation | `requestAnimationFrame`, one loop; paused while the tab is hidden; not started with `prefers-reduced-motion: reduce` (the picture still updates); stopped when the room page unmounts |
| Late replies | the room page checks its per-mount token after every await; the drawing is destroyed on unmount |

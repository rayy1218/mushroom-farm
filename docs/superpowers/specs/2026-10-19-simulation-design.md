# Device app simulation (v2 iteration 4)

Date: 2026-10-19 · Branch `v2` · Builds on `2026-10-16-machines-design.md`. Owner asked for it directly ("in 8090 add a section called simulation, based on machine status adjust the sensor value"); defaults below were chosen by the lead.

## 1. Goal

| Want | Meaning |
|---|---|
| Simulation section | a new section on the device page (`:8090`) |
| Sensors follow machines | a simulated room links a T/RH probe, a CO₂ sensor, a relay module and an AC gateway of the device app; every second the sensors' values move according to what the machines are **really** doing on the device (stuck relays, dead motors, refusing or faulty AC included) |
| Farm app unchanged | the farm app just polls and sees the values change |

Out of scope: several zones per room, day/night outdoor cycle, crops and growth, saving the simulated history, any change to the farm app.

## 2. Simulated room

| Field | Default | Meaning |
|---|---|---|
| `name` | "Sim room 1" | label |
| `enabled` | false | while on, the linked sensors' values come from the simulation (their value inputs are read-only and show "simulated") |
| `trh`, `co2`, `relay`, `ac` | null | addresses of devices of that kind; each optional; a device can belong to one simulated room only |
| `volume` | 60 m³ | room air volume |
| `blocks` | 500 | mushroom blocks in the room |
| `co2PerBlock` | 60 mL/h | CO₂ of one fruiting block (1 to 1.2 kg); 0 to 1000. Real blocks: about 30 to 100. Measure it: close the room for 30 min, then CO₂ per block = ppm rise per hour × volume ÷ blocks (for example 500 ppm/h × 60 m³ ÷ 500 = 60 mL/h). The block heat follows from it (§3) |
| `wallUA` | 80 W/K | heat through walls and roof per K between outdoor and room; 0 to 100000. A 60 m³ room: PU panel 50 mm ≈ 28, brick walls with a zinc roof ≈ 283 (research 2026-10-08 on master) |
| `outdoorHigh`, `outdoorLow`, `outdoorDew` | 33 °C, 25 °C, 24 °C | outdoor air through the day: T from the night low at 03:00 to the day high at 15:00 (a cosine), the dew point the same all day, so RH is about 61 % in the afternoon and 94 % at night. Defaults from Subang 2015–2024 (mean daily high 32.9 °C, low 25.0 °C, dew point about 24 °C). The night low must not be above the day high, nor the dew point above the night low (400 with that `field`); equal high and low give a fixed outdoor |
| `fanFlow` | 600 m³/h | flow of the intake/exhaust pair (both running; one alone moves half) |
| `acBTU` | 12000 BTU/h | aircon capacity; whole number 0 to 200000 (1 kW = 3412.142 BTU/h) |
| `humidifierLH` | 2.0 L/h | humidifier output (water); 0 to 100, step 0.1 (1 L = 1000 g) |
| State | `T`, `W` (absolute humidity g/m³), `CO2` | starts at the outdoor T and W of its time of day, CO₂ 420; "Reset" sets it back |
| `clock` | the local time when added | the room's simulated time of day in s from midnight (0 to 86399), advanced by the simulated seconds of each tick; Reset sets it to the local time again. The reply also has `outdoor: { T, RH }` at that time (0.1) |

Global: `speed` 1×, 10× or 60× (simulated seconds per real second).

## 3. Model (single well-mixed zone, per simulated second; sub-steps of at most 5 s)

| Effect | Applies when (device truth) | Change |
|---|---|---|
| Walls | always | T moves toward outdoorT at wallUA / cap per s (cap = heat capacity below; 200 W/K in a 60 m³ room is a time constant of 1 h) |
| Air exchange | intake running AND exhaust running → flow = fanFlow; only one of them running → 0.5 × fanFlow; none → 0.3 × volume per hour (leakage) | W and CO₂ move toward outdoor (CO₂ outdoor 420 ppm) at k = flow / 3600 / volume per s (air properties); T moves toward outdoorT at kT = min(1, flow × 1.2 / 3600 × dt / cap), cap = heat capacity below (the contents are 10× the air, so T is 10× slower than W) |
| Blocks | always | CO₂ `co2PerBlock`; water 0.3 g/h per block (respiration and evaporation from the block and its mushrooms); heat = respiration (467 kJ per mol CO₂, 24.5 L/mol: 19.1 kJ per L of CO₂) less the evaporation of that water (2.45 kJ/g): at 60 mL/h 1.14 − 0.74 kJ/h ≈ 0.11 W per block, below about 39 mL/h the blocks cool the room a little |
| Humidifier | humidifier running | adds `humidifierGH` of water; evaporation cools: 2.45 kJ per g taken from the air |
| Aircon | AC power on AND error code 0 | **cool**: capacity P = acKW × clamp((T − setpoint) / 0.5 °C, 0, 1), split into latent and sensible. Coil temperature 12 °C: wc = Wsat(12 °C), span = Wsat(T) − wc, wet = span > 0 ? clamp((W − wc) / span, 0, 1) : 0 (no condensation once the air's dew point is below the coil). Water removed = P × f × wet / 2.45 g/s with f = 0.35 fan low, 0.25 auto, 0.15 high; latent kW = water × 2.45; **sensible kW = P − latent kW** and only the sensible part lowers T (and is limited so T never passes the setpoint in one step; the latent part is scaled the same) · **dry**: as cool but P capped at 0.4 × acKW and f = 0.6 · **heat**: adds P = acKW × clamp((setpoint − T) / 0.5 °C, 0, 1) · **fan**: nothing |
| Circulation fan | — | no effect in a single-zone model (stated on the page) |
| Saturation | always | W never above saturation at T (RH ≤ 100 %; the excess condenses) |

Outdoor air: the runner gives the model `outdoorT` and `outdoorRH` at the room's `clock` (`outdoorAt` in `sim-model.js`), constant within one step.

Reference points (the defaults, 8 h from the outdoor state at 12:00): AC cool 22 auto ≈ 22.1 °C / 85 %, fan low ≈ 79 %, fan high ≈ 97 %, AC + humidifier 100 %; closed 1 h ≈ 32.2 °C / 70 % / 850 ppm; full exchange ≈ 30.9 °C / 69 % / 470 ppm. With the controller's default bands for 48 h (last 24 h): T in band 100 %, RH in band 20 % (fan low 49 %), RH above 98 % for 58 % of the time, exchange on 18 %. The numbers before 2026-10-20 (0.3 L/h, 1 W and 1 g/h per block, walls 200 W/K, outdoor fixed 32 °C / 80 %) gave T in band 0 % and an exchange that never ended.

Heat capacity of the room = volume × 1.2 kJ/(m³·K) × 10 (air plus contents and blocks), so temperature moves in minutes, not seconds.

RH = W / Wsat(T) × 100, Wsat from the Magnus formula (`es = 0.6108·exp(17.27·T/(T+237.3))` kPa, `Wsat = 2167·es/(T+273.15)` g/m³).

Sensor values written each tick: T/RH probe `t` = T, `rh` = RH (both rounded to 0.1); CO₂ sensor `co2` = rounded CO₂; AC gateway `roomT` = T (0.1). Values are clamped to the device limits (§3 of iteration 3: T −40…80, RH 0…100, CO₂ 0…10000).

`acting` (returned by `step`) reports what really happened in the last sub-step: `exchangeM3h`, `acCoolKW` (sensible, after the setpoint limit), `acLatentKW` (water removed × 2.45, after limits), `acHeatKW`, `humidifierGH` (water actually evaporated, 0 at saturation), `blocksKW`. The page also shows, per simulated room, what is acting now, e.g. "Air exchange 600 m³/h · AC cooling 2.1 kW · Humidifier +2.0 L/h · Blocks +57 W", and a line "Outdoor now 31.2 °C / 66 % · simulated time 14:05 (low at 03:00, high at 15:00, same dew point all day)".

## 4. Device app changes

| Part | Change |
|---|---|
| `device/sim-model.js` | pure: `step(state, inputs, params, dt) → { state, acting }`; no I/O |
| `device/simulation.js` | runner: every 1 s real time, for each enabled simulated room read the linked devices from the store (coils, running, AC values after stuck/dead/refuse/error), step `speed` simulated seconds, write the sensor values through the store (bypassing the "simulated" lock) |
| Store | simulated rooms and `speed` saved in the state file (with the current T/W/CO₂, so a restart resumes); manual updates of a simulated sensor's values → 409 "Sensor n is simulated by <room>" while enabled |
| HTTP | `GET /api/sims`, `POST /api/sims` (name optional), `PUT /api/sims/:id` (any field of §2 except state), `POST /api/sims/:id/reset`, `DELETE /api/sims/:id`, `PUT /api/sim-speed { speed }`; validation 400 with `field`, 404, 409 for a device already linked elsewhere or of the wrong kind |
| Page | new "Simulation" section below the devices: speed select; one card per simulated room: enable switch, name, four link selects (only devices of that kind), parameter inputs, live T / RH / CO₂, the "acting" line, Reset, Remove; "+ Add simulated room" |
| Units | the model (`sim-model.js`) keeps `acKW` and `humidifierGH`; the runner converts `acBTU` ÷ 3412.142 and `humidifierLH` × 1000 before each step. A state file with the old `acKW` / `humidifierGH` is converted on load (BTU/h rounded, L/h rounded to 0.1); the API ignores the old names. A file's old `outdoorT` / `outdoorRH` are dropped (the day cycle defaults apply), as are outdoor values that do not fit together; a missing or bad `clock` is the local time |
| `startDevice` | option `simTickMs` (default 1000; tests use a manual `tick()` instead) |

## 5. Tests

| Area | Covers |
|---|---|
| Model | each effect's direction and size (walls, exchange full/half/leak, blocks, humidifier incl. cooling, AC cool/dry/heat/fan, fan-speed water fraction, error ≠ 0 = no AC, saturation), stability with dt = 300 s at 60×, no NaN |
| Runner | uses device truth: stuck coil, dead motor, refusing AC, AC error; writes values into the linked sensors; disabled room writes nothing; unlinked device skipped |
| Store/HTTP | CRUD, validation, link conflicts, simulated-sensor lock 409, state file round trip |
| End to end | farm poller + device with a simulated room: switch the exhaust and intake on via Modbus → CO₂ falls on the next polls |

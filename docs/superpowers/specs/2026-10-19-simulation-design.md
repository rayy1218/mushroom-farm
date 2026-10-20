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
| `sunW` | 300 W | peak sun heat through the roof at 13:00 (a half sine from 07:00 to 19:00); 0 to 100000. About 300 W for an insulated 20 m² roof, several kW for bare zinc |
| `fanFlow` | 600 m³/h | flow of the intake/exhaust pair (both running; one alone moves 30 %, at least the leakage) |
| `acBTU` | 12000 BTU/h | aircon capacity; whole number 0 to 200000 (1 kW = 3412.142 BTU/h) |
| `humidifierLH` | 2.0 L/h | humidifier output (water); 0 to 100, step 0.1 (1 L = 1000 g) |
| State | `T` (air), `W` (absolute humidity g/m³), `CO2`, `Tm` (the room's mass: blocks, racks, inner layer of floor and walls), `Hs` (the water on the surfaces as an RH in %, above 100 = free water on them, at most 200) | starts at the outdoor T and W of its time of day, CO₂ 420, `Tm` = T, `Hs` = the air's RH; "Reset" sets it back. A saved state without `Tm` / `Hs` gets them level with the air |
| `clock` | the local time when added | the room's simulated time of day in s from midnight (0 to 86399), advanced by the simulated seconds of each tick; Reset sets it to the local time again. The reply also has `outdoor: { T, RH }` at that time (0.1) |

Global: `speed` 1×, 10× or 60× (simulated seconds per real second).

## 3. Model (single well-mixed zone, two heat nodes, per simulated second; sub-steps of at most 5 s)

Revised 2026-10-20 (the audit's remaining items). Constants are in `device/sim-model.js`.

| Effect | Applies when (device truth) | Change |
|---|---|---|
| Heat nodes | always | **air** node: volume × 1.2072 kJ/(m³·K) × 3 (air and light contents); **mass** node: volume × 10 kJ/(m³·K) + blocks × 4 kJ/K (a 1.2 kg block at 60 % water); coupled by volume × 5 W/K + blocks × 0.4 W/K (exact two-capacity exchange each sub-step). The probe and the aircon see the air node, so a purge moves the air in about a minute while the blocks follow over hours |
| Walls | always | air T moves toward outdoorT at wallUA / air node capacity per s |
| Air exchange | intake AND exhaust running → fanFlow; one of them → 0.3 × fanFlow (at least the leakage); none → 0.3 × volume per hour (leakage) | W and CO₂ move toward outdoor (CO₂ outdoor 420 ppm) at k = flow / 3600 / volume per s; air T moves toward outdoorT at flow × 1.2072 / 3600 / air node capacity per s |
| Blocks | always | CO₂ `co2PerBlock`; water 0.3 g/h per block at 90 % RH, in proportion to the dryness (100 − RH) / 10, at most 3× (0.6 g/h at 80 %, none at 100 %); heat into the mass node = respiration (467 kJ per mol CO₂, 24.5 L/mol: 19.1 kJ per L) less the evaporation of that water (2.45 kJ/g): at 60 mL/h and 90 % ≈ 0.11 W per block, 0.32 W at 100 % |
| Humidifier | humidifier running | adds `humidifierGH` of water (evaporation stops at saturation); evaporation cools the air 2.45 kJ/g; its driver adds 40 W per L/h |
| Machine heat | running | circulation fan 60 W; intake fan 60 W (its motor sits in the incoming air; the exhaust fan's goes outside) |
| Sun | daytime | `sunW` × sun share (0 at night) into the air node |
| Aircon | AC power on AND error code 0 | **cool**: total capacity P = acKW × factor × clamp((T − setpoint) / 0.5 °C, 0, 1), factor = 1 + 0.03 × (indoor wet bulb − 19) − 0.012 × (outdoorT − 35), 0.6 to 1.2 (rated at 27 °C / 19 °C wet bulb indoors, 35 °C outdoors). The coil's apparatus dew point (ADP) 9 °C fan low, 11 auto, 13 high splits P: sensible per m³ = 1.2072 × (T − ADP), latent per m³ = max(0, W − Wsat(ADP)) × 2.45, SHR = sensible / (sensible + latent) (≈ 0.8 at the rating point, ≈ 0.42 at 22 °C / 90 %); sensible = P × SHR lowers the air T (never past the setpoint in one step; the latent part is scaled the same); water removed = P × (1 − SHR) / 2.45 g/s · **dry**: P capped at 0.4 × acKW, ADP 7 °C · **heat**: P = acKW × clamp((setpoint − T) / 0.5 °C, 0, 1) (rated output) · **fan**: nothing |
| Surfaces | always | the surfaces hold 3 × the air's water at 25 °C per % of their RH; air RH and surface RH move toward their weighted level with a time constant of 20 min; water taken up gives its 2.45 kJ/g to the air, water given back takes it |
| Condensation | W above saturation | the excess goes onto the surfaces (`Hs` above 100 = free water) and its heat into the air, solved so the warmed air is just saturated |

Outdoor air: the runner gives the model `outdoorT`, `outdoorRH` and `sun` at the room's `clock` (`outdoorAt` in `sim-model.js`), constant within one step.

Reference points (the defaults, circulation on, 8 h from the outdoor state at 12:00): AC cool 22 auto ≈ 22.1 °C / 65 %, fan low ≈ 61 %, fan high ≈ 69 %, AC + humidifier 100 %; closed 1 h ≈ 33.0 °C / 73 % / 850 ppm; full exchange ≈ 31.5 °C / 68 % / 470 ppm. With the controller's default bands for 48 h (last 24 h; humidifier not forced, no aircon drop): T in band 100 %, RH in band 96 %, never above 98 %, exchange on 18 %, aircon removing about 1.3 L/h at an SHR of about 0.42 (the fan speed hardly matters this close to saturation). Before the revision (fixed water shares 0.35/0.25/0.15, one heat capacity, no surfaces) the same room was in its RH band 20 % of the time; before 2026-10-20 (0.3 L/h, 1 W and 1 g/h per block, walls 200 W/K, outdoor fixed 32 °C / 80 %) T was in band 0 % and the exchange never ended.

Heat capacity: the air node (≈ 217 kJ/K for 60 m³) moves in minutes, the mass node (≈ 2600 kJ/K with 500 blocks) in hours.

Order within a sub-step: humidifier, blocks, sun and motors; air ↔ mass; walls; exchange; then the aircon from the air as those left it (so the room settles at the setpoint whatever the step length; 1 s and 60 s steps agree within 0.1 °C); then surfaces and condensation. The humidifier's evaporation is capped at saturation counting its own cooling.

Limits: the settings are checked one by one, so extreme combinations are not physical: a 1 m³ room with 100 kW of sun and no walls, or a 100 L/h humidifier (4 kW driver heat) in 1 m³ without leaks, heat the air without bound, and 100000 blocks in 1 m³ give CO₂ of millions of ppm. The sensor values are clamped to the device limits (T −40 to 80, RH 0 to 100, CO₂ 0 to 10000); only the card shows the raw state.

RH = W / Wsat(T) × 100, Wsat from the Magnus formula (`es = 0.6108·exp(17.27·T/(T+237.3))` kPa, `Wsat = 2167·es/(T+273.15)` g/m³).

Sensor values written each tick: T/RH probe `t` = T, `rh` = RH (both rounded to 0.1); CO₂ sensor `co2` = rounded CO₂; AC gateway `roomT` = T (0.1). Values are clamped to the device limits (§3 of iteration 3: T −40…80, RH 0…100, CO₂ 0…10000).

`acting` (returned by `step`) reports what really happened in the last sub-step: `exchangeM3h`, `acCoolKW` (sensible, after the setpoint limit), `acLatentKW` (water removed × 2.45, after limits), `acHeatKW`, `humidifierGH` (water actually evaporated, 0 at saturation), `blocksKW`, `sunKW`, `machineKW` (motors and the humidifier driver), `surfaceGH` (water taken up by the surfaces, negative when given back, including condensation), `condensedGH`. The card also shows "Blocks and racks 22.3 °C · surfaces 90 %" ("(wet)" above 100). The page also shows, per simulated room, what is acting now, e.g. "Air exchange 600 m³/h · AC cooling 2.1 kW · Humidifier +2.0 L/h · Blocks +57 W", and a line "Outdoor now 31.2 °C / 66 % · simulated time 14:05 (low at 03:00, high at 15:00, same dew point all day)".

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

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
| `outdoorT`, `outdoorRH` | 32 °C, 80 % | outdoor air (fixed) |
| `fanFlow` | 600 m³/h | flow of the intake/exhaust pair |
| `acKW` | 3.5 kW | aircon capacity |
| `humidifierGH` | 2000 g/h | humidifier output (water) |
| State | `T`, `W` (absolute humidity g/m³), `CO2` | starts at outdoor T and W, CO₂ 420; "Reset" sets it back |

Global: `speed` 1×, 10× or 60× (simulated seconds per real second).

## 3. Model (single well-mixed zone, per simulated second; sub-steps of at most 5 s)

| Effect | Applies when (device truth) | Change |
|---|---|---|
| Walls | always | T moves toward outdoorT with time constant 1 h |
| Air exchange | intake running AND exhaust running → flow = fanFlow; only one of them running → 0.5 × fanFlow; none → 0.02 × volume per hour (leakage) | k = flow / 3600 / volume per s; T, W and CO₂ each move toward outdoor (CO₂ outdoor 420 ppm) at rate k |
| Blocks | always | heat 1 W per block; water 2 g/h per block; CO₂ 0.3 L/h per block |
| Humidifier | humidifier running | adds `humidifierGH` of water; evaporation cools: 2.45 kJ per g taken from the air |
| Aircon | AC power on AND error code 0 | **cool**: removes heat P = acKW × clamp((T − setpoint) / 1 °C, 0, 1); water removed = P × f / 2.45 g/s with f = 0.35 fan low, 0.25 auto, 0.15 high · **dry**: as cool but P capped at 0.4 × acKW and f = 0.6 · **heat**: adds P = acKW × clamp((setpoint − T) / 1 °C, 0, 1) · **fan**: nothing |
| Circulation fan | — | no effect in a single-zone model (stated on the page) |
| Saturation | always | W never above saturation at T (RH ≤ 100 %; the excess condenses) |

Heat capacity of the room = volume × 1.2 kJ/(m³·K) × 10 (air plus contents and blocks), so temperature moves in minutes, not seconds.

RH = W / Wsat(T) × 100, Wsat from the Magnus formula (`es = 0.6108·exp(17.27·T/(T+237.3))` kPa, `Wsat = 2167·es/(T+273.15)` g/m³).

Sensor values written each tick: T/RH probe `t` = T, `rh` = RH (both rounded to 0.1); CO₂ sensor `co2` = rounded CO₂; AC gateway `roomT` = T (0.1). Values are clamped to the device limits (§3 of iteration 3: T −40…80, RH 0…100, CO₂ 0…10000).

The page also shows, per simulated room, what is acting now, e.g. "Air exchange 600 m³/h · AC cooling 2.1 kW · Humidifier +2.0 kg/h · Blocks +0.5 kW".

## 4. Device app changes

| Part | Change |
|---|---|
| `device/sim-model.js` | pure: `step(state, inputs, params, dt) → { state, acting }`; no I/O |
| `device/simulation.js` | runner: every 1 s real time, for each enabled simulated room read the linked devices from the store (coils, running, AC values after stuck/dead/refuse/error), step `speed` simulated seconds, write the sensor values through the store (bypassing the "simulated" lock) |
| Store | simulated rooms and `speed` saved in the state file (with the current T/W/CO₂, so a restart resumes); manual updates of a simulated sensor's values → 409 "Sensor n is simulated by <room>" while enabled |
| HTTP | `GET /api/sims`, `POST /api/sims` (name optional), `PUT /api/sims/:id` (any field of §2 except state), `POST /api/sims/:id/reset`, `DELETE /api/sims/:id`, `PUT /api/sim-speed { speed }`; validation 400 with `field`, 404, 409 for a device already linked elsewhere or of the wrong kind |
| Page | new "Simulation" section below the devices: speed select; one card per simulated room: enable switch, name, four link selects (only devices of that kind), parameter inputs, live T / RH / CO₂, the "acting" line, Reset, Remove; "+ Add simulated room" |
| `startDevice` | option `simTickMs` (default 1000; tests use a manual `tick()` instead) |

## 5. Tests

| Area | Covers |
|---|---|
| Model | each effect's direction and size (walls, exchange full/half/leak, blocks, humidifier incl. cooling, AC cool/dry/heat/fan, fan-speed water fraction, error ≠ 0 = no AC, saturation), stability with dt = 300 s at 60×, no NaN |
| Runner | uses device truth: stuck coil, dead motor, refusing AC, AC error; writes values into the linked sensors; disabled room writes nothing; unlinked device skipped |
| Store/HTTP | CRUD, validation, link conflicts, simulated-sensor lock 409, state file round trip |
| End to end | farm poller + device with a simulated room: switch the exhaust and intake on via Modbus → CO₂ falls on the next polls |

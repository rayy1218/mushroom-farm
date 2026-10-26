# Mushroom farm

A small web app for running a mushroom farm: an Overview of every room, and per room the live readings of its temperature/humidity probe and CO₂ sensor, manual or automatic control of its machines (intake, exhaust and circulation fans, humidifier, aircon), alarms, and charts up to 30 days back, all over Modbus TCP.

Needs Node 22.13 or newer; there are no npm dependencies.

## Run

Two programs. In one terminal, the farm app:

```bash
npm start
```

Open http://localhost:8080. In another terminal, the device app (a pretend Modbus gateway with sensors you control):

```bash
npm run device
```

Open http://localhost:8090, add sensors (address + kind), type their values, and switch "answering" off to make a sensor time out. Then give a room the same addresses in the farm app (Edit room → Sensors) and open the room's page.

Machines work the same way: add a relay module and an aircon gateway on the device page, give the room their addresses (Edit room → Machines), then switch the machines from the room's page. Each machine shows what the farm **commanded**, what the device **reports**, and (fans and humidifier) whether its current switch says it is **running**. On the device page you can make a relay stick, a motor die, the aircon refuse commands or show an error code, and watch the room page report it.

**Automatic control.** Turn on Auto on a room's page and the farm app runs the machines from the room's bands: an air exchange (intake + exhaust) starts at the CO₂ upper limit and stops at the lower limit or after the time limit (10 min by default); at the CO₂ safety level it runs with no limit. The humidifier follows the humidity band (and can be forced on during an exchange: off for a new room, since Malaysian outdoor air is wet enough), the aircon cools to the middle of the temperature band (optionally lower during an exchange: 0 °C for a new room), the circulation fan is always on. With no air exchange for 15 min (a room setting, 0 turns it off) the fans run for 1 min of fresh air whatever the CO₂. Machines are protected from rapid switching (an exchange runs at least 30 s and stays off at least 60 s, the humidifier changes at most once a minute, the aircon at most every 2 min).

**Sensor checks and alarms.** Every reading is checked (no answer, out of range, sudden jump, a value that does not change for an hour or two); 3 bad readings in a row make the sensor faulty. With a faulty CO₂ sensor, auto runs a timed air exchange (10 min of every 30); with a faulty humidity reading, a timed humidifier (10 of every 20). Alarms: temperature or humidity outside the band (a wet room after 15 min above the upper humidity limit + 3), CO₂ high or at the safety level, a sensor fault, a machine not following its command, air exchange too small, a humidifier too small (running 30 min with the humidity still below the band). They show on the room page, the Overview and as a badge on the menu; acknowledge them there. Without a simulation the device app's values never change, so after an hour its sensors count as frozen: that is the check working.

**History.** On a room's page choose Live, 1 h, 6 h, 24 h, 7 d or 30 d; the longer ranges show averages and a timeline of when each machine was on (automatic or manual).

**Simulation.** In the device page's Simulation section, add a simulated room and link a T/RH probe, a CO₂ sensor, a relay module and an aircon gateway, then enable it. The linked sensors' values then follow what the machines are really doing on the device (a stuck relay, dead motor or faulty aircon has no effect): mushroom blocks add CO₂ (60 mL/h each by default; measure yours by closing the room for 30 min: ppm rise per hour × volume ÷ blocks), moisture and the heat that comes with it, heat leaks through the walls (wall heat transfer, 80 W/K by default) and the sun warms the roof, the outdoor air follows a day (night low 25 °C at 03:00, day high 33 °C at 15:00, dew point 24 °C all day), intake + exhaust bring it in, the blocks, racks and walls hold heat and moisture, water condenses on them when the air is saturated, the humidifier adds moisture, the aircon cools or heats toward its setpoint and dries the air through its coil (more in a wet room, on fan low and in dry mode), with less capacity on a hot day. Speed 1×, 10× or 60×. The farm app sees the values change like real sensors.

**Room drawing.** The room page opens with a "Room" card that draws the room: the aircon and its condenser, the intake, exhaust and circulation fans, the humidifier mist, CO₂ bubbles and the three readings, animated from what the machines really report (a stuck or dead machine shows a warning). Each simulated room card on the device page draws the same picture, including the outdoor temperature and a sun or moon. The device serves the farm's `web/mimic.js` itself, so there is one copy. Spec: `docs/superpowers/specs/2026-10-20-room-drawing-design.md`.

**Outdoor sensor, energy and water.** Set the address of an outdoor T/RH probe on the Settings page: the Overview shows the outdoor temperature, humidity and dew point, the room drawing shows them with the sun or moon, and the room charts draw the outdoor values as a dashed line. Each room can have an energy meter (an Eastron SDM120-style Modbus meter; Edit room → Sensors) and power ratings for its machines (Edit room → Power and water: fans 60 W, humidifier 80 W and 2.0 L/h, aircon 1050 W input by default). The room page's "Energy and water" card shows today, 7 days and 30 days in kWh, RM and litres, a bar chart per day and the share of each machine: metered when the room has a meter, otherwise estimated from run time × rating (the aircon estimate is an upper bound). Water is the humidifier's run time × its L/h. Prices are on the Settings page (electricity RM 0.55/kWh by default; the water price is blank until you enter your bill's rate, and water costs show only then). In the device app, add an "Energy meter" and a second T/RH probe and link them to a simulated room as its meter and outdoor probe. Spec: `docs/superpowers/specs/2026-10-20-energy-water-outdoor-design.md`.

**Crops and stage program.** On a room's page, the "Crop and stage" card takes the crops in the room (Grey, Black, Pink, Abalone and Golden oyster, wood ear, reishi, milky, and lion's mane as a draft; several crops in one room get the overlap of their bands) and the farm type (ready-to-fruit blocks: fruiting and rest; full cycle: spawn run, pinning, fruiting and rest). The room's bands follow the crops and the stage: a new stage moves them over 4 hours (a lower CO₂ limit at once), and after its days (fruiting 7, rest 10, spawn run 21, pinning 4 by default) the next stage starts by itself, flush after flush (4 by default). After the last flush an alarm says to replace the blocks; **New blocks** starts again at flush 1. A band changed by hand on the Automatic control card stays until the next stage.

**Suggest machines.** In the Simulate stepper's last step, **Suggest machines for these crops** works out machine sizes for the room, its crops and the walls and weather of step 1: first estimates from formulas (the fan that holds CO₂ under the band, a humidifier and dehumidifier small enough not to overshoot the band in their minimum run, the aircon from the heat), then a background search of 32–60 setups over one fruiting and one rest stage. It lists the best five with their time in band and energy; the ones that keep temperature, humidity and CO₂ each above the target (95 % by default) come first, cheapest first. It searches with no aircon drop during an air exchange and no forced humidifier, and **Use this** fills the stepper with the machines and those settings for the run (the room's own settings stay as they are; the summary and the run's page name what differs). Spec: `docs/superpowers/specs/2026-10-22-suggest-machines-design.md`.

**Dehumidifier.** A room can have a dehumidifier on output 5 of its relay module (Edit room → Machines → "Dehumidifier fitted", then its power and its capacity in L/day as on its label under Power and water). Auto switches it on at the upper humidity limit and off at the middle of the band, only once the humidifier has been off for 30 min (a room that needed the humidifier a moment ago is not wet by itself: an air exchange wets it for a few minutes) and never together with the humidifier; its compressor gets 3 min between changes. A fitted dehumidifier has a machine tile, a timeline row, alarms and a share of the energy; the Simulate stepper asks for its size (0 = none) and the results show the water it took out. Spec: `docs/superpowers/specs/2026-10-21-dehumidifier-design.md`.

**Intake filter.** Each room has a filter on its intake fan (Edit room → Intake filter: the fan's maximum pressure from its datasheet, the clean filter's pressure drop, the change pressure: the filter pressure sensor's reading at which to change it with the intake running, 80 Pa by default and below the fan's maximum, and how often to change it, 0 = no reminder). The room page's **Intake filter** card shows the days in use and the due date, and **Filter changed** records a new filter (the days start again, the filter alarms clear). With an optional filter pressure sensor (Edit room → Sensors → "Filter pressure sensor address") the card shows the pressure across the filter; readings count once the intake has run 60 s. Alarms: the filter due, the pressure at or above the change pressure (dirty) and below half the clean drop (missing or torn, or the sensor tube is off), each after 10 min of intake running with such readings, added up across exchanges. With a sensor the intake fan's estimated energy rises with the pressure. In the simulator a filter loads with the air it passes and the fan moves less air as it does (the exhaust fan pulls the shortfall in through the leaks, unfiltered); the device app's sim card shows the filter and has a **Change filter** button (a Reset keeps the filter as it is). Simulation runs take the room's filter settings and its days in use, change it on the reminder (or at the change pressure with a sensor) and report the changes, the mean filter pressure and the unfiltered share. Spec: `docs/superpowers/specs/2026-10-22-filter-design.md`.

**Lights.** A room can have lights on output 6 of its relay module (Edit room → Machines → "Lights fitted", their power under Power and water, 60 W by default). The crop program gives each stage its light hours (spawn run 0, pinning and fruiting 12, rest 0 by default; the pencil of each stage on the Crop tab) and the time they come on ("Lights from", 07:00 by default; a window may run past midnight). Auto keeps them on in that window of the present stage, off without crops or once the crop is finished. The Climate tab's Lighting group shows today's hours and why; the Room card draws a lamp and a tile. The farm device's OS time zone must be the farm's (`timedatectl set-timezone Asia/Kuala_Lumpur`): the lights follow its clock. Spec: `docs/superpowers/specs/2026-10-26-lighting-design.md`.

**Simulation runs.** On the Rooms list (or a room's Simulations card), **Simulate** asks in three steps for the room's walls, weather and machines (wall heat transfer, outdoor day high, night low and dew point, sun on the roof, fan flow, aircon size, humidifier output), the crops and the start stage, and how long (7 days, or the whole program). The run goes on in the background (a 68-day program takes a few seconds) with the room's own control settings, and its page shows the time in band (temperature, humidity, CO₂, all three; per stage), charts with the band as it moved and the outdoor air, the machine timeline, and the energy (kWh, RM, per machine and per day) and water (litres). The aircon energy comes from the size you enter (COP 3). The last 20 runs of each room are kept. Spec: `docs/superpowers/specs/2026-10-20-crops-and-simulation-design.md`.

**Live updates.** The pages keep one connection open to the farm app (`GET /api/events`, server-sent events) and refresh as soon as something changes: a room's readings after each poll, its machines, control, crop or filter, the alarms (the menu badge), the outdoor probe, and the progress of simulation runs and machine suggestions. A "Live" mark in the top bar shows the connection; while it is up the pages' own timers slow to 60 s, and when it drops they go back to their short timers and the browser reconnects by itself. A hidden tab closes its connection and reopens it when shown. Spec: `docs/superpowers/specs/2026-10-26-live-alarms-outdoor-design.md`.

**Phone alarms (Telegram).** On the Settings page, the "Phone alarms (Telegram)" card sends alarms to a Telegram chat: make a bot with @BotFather, paste its token (write-only: the page shows only its last 4 characters), send the bot a message and enter your chat id (a group's negative id or `@channel` also work), then **Send test message**. Critical and serious alarms are sent by default (warnings can be added), a "Cleared" message follows when one ends, and an unacknowledged critical alarm repeats every 30 min (0 = no repeats). A failed message is retried after 1, 5 and 15 min (longer when Telegram asks), at most 50 wait; the card shows the last sent message and the last error. The farm keeps running whatever Telegram does.

**Outdoor air in control.** With an outdoor probe set (Settings), auto uses the outdoor air (a room setting on the Automatic control card, on by default): **free cooling** runs the air exchange while outdoor air is at least 2 °C cooler than the room and not wetter, with the room in the warm part of its band, until it reaches the middle; **outdoor drying** runs it while the room is above its humidity band and the outdoor air holds at least 1 g/m³ less water, until the humidity is back at the middle (never taking the room out of its temperature band); and a timed fresh-air run waits out very wet or hot outdoor air for at most one more interval. The exchange line names why it runs ("· free cooling", "· outdoor drying"). Simulation runs and Suggest machines use the same rules. In the default climate (dew point 24 °C) outdoor air is rarely drier than a room, so it mostly helps warm crops such as milky at night: in a 17-day run of a 60 m³ milky room, the time with all three in band went from 48 % to 57 % for 0.8 % more energy.

The farm app polls every wired sensor and machine every reading interval (5 s by default; change it on the Settings page, 1–300 s). A sensor is **online** when the latest poll answered, **timeout** after 1–2 failed polls in a row, **offline** after 3 or more. Stop the device app to see what a dead gateway looks like.

### Farm app settings

| Env var | Default | Meaning |
|---|---|---|
| `FARM_PORT` | `8080` | HTTP port (0 picks a free one) |
| `FARM_DB` | `data/v2.db` | SQLite database file, or `:memory:` |
| `FARM_GATEWAY` | `127.0.0.1:1502` | Modbus TCP gateway `host:port` (the device app, or a real gateway) |

### Device app settings

| Env var | Default | Meaning |
|---|---|---|
| `DEVICE_MODBUS_PORT` | `1502` | Modbus TCP port the farm app polls |
| `DEVICE_HTTP_PORT` | `8090` | control page |
| `DEVICE_STATE` | `device/state.json` | where the sensors and their values are kept |

### Devices (register map)

| Device | Request | Reply |
|---|---|---|
| T/RH probe | function 04, registers 1–2 | temperature × 10 (signed), humidity × 10 |
| CO₂ sensor | function 03, register 0 | ppm |
| Outdoor probe | function 04, registers 1–2 (as a room T/RH probe) | temperature × 10 (signed), humidity × 10 |
| Energy meter | function 04, input registers 0x000C–0x000D and 0x0156–0x0157 | active power W and total energy kWh, each a float32, high word first |
| Filter pressure sensor | function 04, input register 0 | pressure across the filter, Pa × 10 (signed) |
| Relay module | coils 0–5 (fn 01 read, fn 05 write), inputs 0–5 (fn 02, current switches); the farm reads 4, 5 with a dehumidifier, 6 with lights | outputs: 0 intake, 1 exhaust, 2 circulation, 3 humidifier, 4 dehumidifier, 5 lights |
| Aircon gateway | holding 0–3 (fn 03 read, fn 16 write), input 0–1 (fn 04) | power, mode (0 cool, 1 heat, 2 dry, 3 fan), setpoint × 10, fan (0 auto, 1 low, 2 high); room T × 10, error code |

A real RS-485 farm uses the same requests through an Ethernet-to-RS-485 gateway: point `FARM_GATEWAY` at it.

## Test

```bash
npm test
```

Design: `docs/superpowers/specs/2026-10-16-rooms-design.md` (rooms), `docs/superpowers/specs/2026-10-16-sensors-design.md` (sensors, room page, device app), `docs/superpowers/specs/2026-10-16-machines-design.md` (machines) `docs/superpowers/specs/2026-10-19-simulation-design.md` (simulation), `docs/superpowers/specs/2026-10-19-controller-design.md` (automatic control), `docs/superpowers/specs/2026-10-19-settings-design.md` (settings) `docs/superpowers/specs/2026-10-19-safety-and-history-design.md` (sensor checks, alarms, safety level, history, Overview) `docs/superpowers/specs/2026-10-20-room-drawing-design.md` (room drawing) `docs/superpowers/specs/2026-10-20-energy-water-outdoor-design.md` (outdoor sensor, energy and water) and `docs/superpowers/specs/2026-10-20-crops-and-simulation-design.md` (crops, stage program, simulation runs).

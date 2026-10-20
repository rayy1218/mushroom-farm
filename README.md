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

**Automatic control.** Turn on Auto on a room's page and the farm app runs the machines from the room's bands: an air exchange (intake + exhaust) starts at the CO₂ upper limit and stops at the lower limit or after the time limit (10 min by default); at the CO₂ safety level it runs with no limit. The humidifier follows the humidity band (and can be forced on during an exchange), the aircon cools to the middle of the temperature band (5 °C lower during an exchange), the circulation fan is always on. Machines are protected from rapid switching (an exchange runs at least 30 s and stays off at least 60 s, the humidifier changes at most once a minute, the aircon at most every 2 min).

**Sensor checks and alarms.** Every reading is checked (no answer, out of range, sudden jump, a value that does not change for an hour or two); 3 bad readings in a row make the sensor faulty. With a faulty CO₂ sensor, auto runs a timed air exchange (10 min of every 30); with a faulty humidity reading, a timed humidifier (10 of every 20). Alarms: temperature or humidity outside the band, CO₂ high or at the safety level, a sensor fault, a machine not following its command, air exchange too small. They show on the room page, the Overview and as a badge on the menu; acknowledge them there. Without a simulation the device app's values never change, so after an hour its sensors count as frozen: that is the check working.

**History.** On a room's page choose Live, 1 h, 6 h, 24 h, 7 d or 30 d; the longer ranges show averages and a timeline of when each machine was on (automatic or manual).

**Simulation.** In the device page's Simulation section, add a simulated room and link a T/RH probe, a CO₂ sensor, a relay module and an aircon gateway, then enable it. The linked sensors' values then follow what the machines are really doing on the device (a stuck relay, dead motor or faulty aircon has no effect): mushroom blocks add heat, moisture and CO₂, intake + exhaust bring in outdoor air, the humidifier adds moisture, the aircon cools or heats toward its setpoint and dries the air (more on fan low, most in dry mode). Speed 1×, 10× or 60×. The farm app sees the values change like real sensors.

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
| Relay module | coils 0–3 (fn 01 read, fn 05 write), inputs 0–3 (fn 02, current switches) | outputs: 0 intake, 1 exhaust, 2 circulation, 3 humidifier |
| Aircon gateway | holding 0–3 (fn 03 read, fn 16 write), input 0–1 (fn 04) | power, mode (0 cool, 1 heat, 2 dry, 3 fan), setpoint × 10, fan (0 auto, 1 low, 2 high); room T × 10, error code |

A real RS-485 farm uses the same requests through an Ethernet-to-RS-485 gateway: point `FARM_GATEWAY` at it.

## Test

```bash
npm test
```

Design: `docs/superpowers/specs/2026-10-16-rooms-design.md` (rooms), `docs/superpowers/specs/2026-10-16-sensors-design.md` (sensors, room page, device app), `docs/superpowers/specs/2026-10-16-machines-design.md` (machines) `docs/superpowers/specs/2026-10-19-simulation-design.md` (simulation), `docs/superpowers/specs/2026-10-19-controller-design.md` (automatic control), `docs/superpowers/specs/2026-10-19-settings-design.md` (settings) and `docs/superpowers/specs/2026-10-19-safety-and-history-design.md` (sensor checks, alarms, safety level, history, Overview).

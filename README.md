# Mushroom farm

A small web app for running a mushroom farm: a list of grow rooms; per room the live readings of its temperature/humidity probe and CO₂ sensor, and manual control of its machines (intake, exhaust and circulation fans, humidifier, aircon), all over Modbus TCP.

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

Machines work the same way: add a relay module and an aircon gateway on the device page, give the room their addresses (Edit room → Machines), then switch the machines from the room's page. Each machine shows what the farm **commanded**, what the device **reports**, and (fans and humidifier) whether its current switch says it is **running**. On the device page you can make a relay stick, a motor die, the aircon refuse commands or show an error code, and watch the room page report it. There is no automatic control yet: machines only change when you switch them.

The farm app polls every wired sensor and machine every 5 s. A sensor is **online** when the latest poll answered, **timeout** after 1–2 failed polls in a row, **offline** after 3 or more. Stop the device app to see what a dead gateway looks like.

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

### Sensors (register map)

| Sensor | Request | Reply |
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

Design: `docs/superpowers/specs/2026-10-16-rooms-design.md` (rooms), `docs/superpowers/specs/2026-10-16-sensors-design.md` (sensors, room page, device app) and `docs/superpowers/specs/2026-10-16-machines-design.md` (machines).

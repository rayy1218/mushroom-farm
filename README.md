# Mushroom farm

A web app for a small mushroom farm in Malaysia. It controls the climate of the fruiting rooms over Modbus TCP, guides the daily work, and keeps the farm's books. The owner and the workers each sign in. A device simulator plays the rooms' sensors and machines, so you can run everything without hardware.

Plain JavaScript. No build step, no npm dependencies. Needs Node 22.13 or newer (it uses the built-in `node:sqlite`).

## What it does

| Area | What you get |
|---|---|
| Climate | Live temperature, humidity and CO₂ per room; automatic control of intake, exhaust and circulation fans, humidifier, dehumidifier, aircon and lights from the room's bands; free cooling and outdoor drying from an outdoor probe |
| Safety | Sensor checks (no answer, out of range, jump, frozen), alarms on the room page, the Overview and a menu badge, optional Telegram messages (Settings) |
| Rooms | Crops and stage program (spawn run, pinning, fruiting, rest, flushes), intake filter tracking, energy (kWh, RM) and water (L), history up to 30 days |
| Simulation | Simulation runs for a room's walls, weather and machines, and Suggest machines for sizing |
| Tasks | Daily stage tasks, upkeep, long-term tasks, the Today page, the Calendar, a CSV log and printable myGAP sheets |
| Harvest | kg per run, flush, room and crop; kg per block and biological efficiency |
| Business | Summary, Batches, Inventory, Sales, Costs, Runs and Economics (owner only) |
| Sign-in | Workers sign in with a 6-digit PIN, owners with a password. Workers see no money. Sessions, lockouts and a live stream that follows the session |

## Quick start

Needs Node 22.13 or newer. Use two terminals.

```bash
npm run device    # the device simulator: http://localhost:8090
npm start         # the farm app:         http://localhost:8080
```

Make the first owner. Nobody can sign in until you do. It asks for the password twice and does not show it (14 characters or more).

```bash
npm run owner -- "<name>"
```

Open http://localhost:8080 and sign in. Then:

1. On the device page, add sensors (address and kind) and type their values.
2. In the farm app, give a room the same addresses (room page, Equipment tab).
3. For a live-looking room, add a simulated room on the device page, link its sensors and machines, and enable it.

The database is created at `data/v2.db` on the first start and moved up to the current version by itself. Copy it first when you update an existing farm. It never moves back down.

## Configuration

Environment variables. All are optional.

| Variable | Read by | Default | Meaning |
|---|---|---|---|
| `FARM_PORT` | farm app | `8080` | HTTP port (0 picks a free one) |
| `FARM_DB` | farm app, `npm run owner` | `data/v2.db` | SQLite file, or `:memory:` |
| `FARM_GATEWAY` | farm app | `127.0.0.1:1502` | The farm's Modbus TCP gateway `host:port`: the device app or a real gateway. A room may have its own |
| `DEVICE_MODBUS_PORT` | device app | `1502` | Modbus TCP port the farm app polls |
| `DEVICE_HTTP_PORT` | device app | `8090` | The device control page |
| `DEVICE_STATE` | device app | `device/state.json` | Where sensors and their values are kept |
| `DEVICE_HOST` | device app | `127.0.0.1` | Address both device ports listen on (`0.0.0.0` in Docker) |
| `TZ` | both | the machine's | The time zone: set `Asia/Kuala_Lumpur`; the lights and the task days follow the clock. Docker and the systemd units already set it |

Everything else (bands, prices, poll interval, Telegram, outdoor probe address, workers, task rules) is set on the Settings page and stored in the database.

## Devices

The farm app polls every wired sensor and machine each reading interval (5 s by default, 1–300 s in Settings). A sensor is online when the last poll answered, timeout after 1–2 failed polls, offline after 3 or more.

| Device | Request | Reply |
|---|---|---|
| T/RH probe | function 04, registers 1–2 | temperature × 10 (signed), humidity × 10 |
| CO₂ sensor | function 03, register 0 | ppm |
| Outdoor probe | function 04, registers 1–2 (as a T/RH probe) | temperature × 10 (signed), humidity × 10 |
| Energy meter | function 04, input registers 0x000C–0x000D and 0x0156–0x0157 | active power W and total energy kWh, each a float32, high word first |
| Filter pressure sensor | function 04, input register 0 | pressure across the filter, Pa × 10 (signed) |
| Relay module | coils 0–5 (fn 01 read, fn 05 write); inputs 0–5 (fn 02, current switches) | outputs: 0 intake, 1 exhaust, 2 circulation, 3 humidifier, 4 dehumidifier, 5 lights |
| Aircon gateway | holding 0–3 (fn 03 read, fn 16 write); input 0–1 (fn 04) | power, mode (0 cool, 1 heat, 2 dry, 3 fan), setpoint × 10, fan (0 auto, 1 low, 2 high); room T × 10, error code |

A real RS-485 farm uses the same requests through an Ethernet-to-RS-485 gateway. Point `FARM_GATEWAY` at it.

**A gateway per room.** A room behind its own gateway (its own RS-485 bus) takes that gateway's `host:port` in the Modbus gateway card at the top of its Equipment (Setup tab). Empty means `FARM_GATEWAY`. The room's sensors, meter, filter sensor, relay module and aircon go through it, so their addresses only need to differ on that gateway. The outdoor probe always uses the farm's gateway. Gateways are polled at the same time, so a silent one does not slow the other rooms.

## Run with Docker

Needs Docker (Docker Desktop on Windows or macOS). From the project folder:

```bash
docker compose up -d --build
```

Farm app on http://localhost:8080, device app on http://localhost:8090. Both restart with Docker. Make the first owner with:

```bash
docker compose exec farm node --disable-warning=ExperimentalWarning server/owner.js "<name>"
```

| Task | Command |
|---|---|
| Stop (data stays) | `docker compose down` |
| Logs | `docker compose logs -f` |
| Update after `git pull` | `docker compose up -d --build` |
| Use a real gateway | Put `FARM_GATEWAY=<gateway-host>:502` in a `.env` file next to `compose.yaml`, then `docker compose up -d --build farm` |
| Back up the database | `docker compose stop farm`, then `docker compose cp farm:/data/v2.db ./v2-backup.db` |
| Delete all data | `docker compose down -v` |

Data lives in two volumes: `farm-data` (`/data/v2.db`) and `device-data` (`/data/state.json`). To bring in files from another machine (taken with both apps stopped), copy them in, then give them to the `node` user. Without the `chown`, the apps cannot write them.

```bash
docker compose stop
docker compose cp v2.db farm:/data/v2.db
docker compose cp state.json device:/data/state.json
docker compose cp state.json.sim device:/data/state.json.sim
docker compose run --rm --no-deps --user root farm chown -R node:node /data
docker compose run --rm --no-deps --user root device chown -R node:node /data
docker compose start
```

## Run on a cloud VM

`deploy/oracle/` runs the live farm on one Linux VM (written for an Oracle Cloud Always Free Ampere VM, Ubuntu 24.04) as systemd services. It uses plain Node, not Docker: the rooms' own gateways are stored as `127.0.0.1:1512` to `:1514`, which only work when all the apps share one host.

| Service | Ports | State |
|---|---|---|
| `mushroom-farm` | HTTP 8080 | `/opt/mushroom-farm/data/v2.db` |
| `mushroom-device` | HTTP 8090, Modbus 1502 | `/opt/mushroom-farm/device/state.json` |
| `mushroom-gateway@alpha`, `@beta`, `@gamma` | HTTP 8092 / 8093 / 8094, Modbus 1512 / 1513 / 1514 | `/opt/mushroom-farm/data/gateways/<name>.json` |

The scripts run on the dev machine. `<vm-host>` is an SSH host name for the VM.

| Task | Command |
|---|---|
| First set-up | `deploy/oracle/push-code.sh <vm-host>`, then `ssh <vm-host> bash /opt/mushroom-farm/deploy/oracle/setup-vm.sh` (time zone, Node 22, Tailscale, the `farm` user, the services) |
| First owner | On the VM, in `/opt/mushroom-farm`: `sudo -u farm FARM_DB=/opt/mushroom-farm/data/v2.db node --disable-warning=ExperimentalWarning server/owner.js "<name>"`. Never as root |
| Move data in | Stop the local apps, then `deploy/oracle/push-data.sh <vm-host>` |
| Ship new code | `deploy/oracle/push-code.sh <vm-host>` (code at `HEAD`, no data), then `ssh <vm-host> sudo systemctl restart mushroom-farm`. Restart `mushroom-device` and `mushroom-gateway@{alpha,beta,gamma}` too when `device/` changed |
| Status | `ssh <vm-host> systemctl status 'mushroom-*'` |
| Logs | `ssh <vm-host> journalctl -u mushroom-farm -f` |
| Back up the database | `ssh <vm-host> sudo systemctl stop mushroom-farm`, `scp <vm-host>:/opt/mushroom-farm/data/v2.db ./v2-backup.db`, `ssh <vm-host> sudo systemctl start mushroom-farm` |

Safety notes:

| Note | Why |
|---|---|
| `push-data.sh` replaces the VM's database and simulator state | Use it for the first move only. It refuses to run while local apps listen on the farm's ports |
| Run one farm app per farm | After the data moves, keep the old machine's apps stopped. Two would keep two histories |
| `push-code.sh` sends code only | It never touches `data/`. Back up the database before an update that adds a database version |
| Only SSH should be open on the VM | Reach the pages through Tailscale: `tailscale serve` for the tailnet only, `tailscale funnel --bg 8080` to put the farm app on the internet. The device apps stay on the tailnet |
| With Funnel on, the sign-in is public | `GET /api/login/names` needs no session, so anyone can read the active workers' names, and wrong PINs can lock a worker until the owner's Unlock. Use long owner passwords |

Funnel off again: `sudo tailscale funnel --bg 8080 off && sudo tailscale serve --bg 8080`.

## Project layout

| Path | What |
|---|---|
| `server/` | Farm app: `main.js` (start), `app.js` and `*-api.js` (HTTP routes), `db.js` (schema and migrations), `controller.js` (automatic control), `poller.js` and `modbus.js` (devices), `alarms.js`, `tasks.js`, `auth.js`, `owner.js` (first owner), and one module per business area (`harvests`, `batches`, `inventory`, `sales`, `costs`, `runs`, `economics`) |
| `web/` | Browser UI: `index.html`, `app.js` (router), and a page, math and dialog file per area. No build |
| `device/` | Device simulator: `main.js` (start), `modbus-server.js`, `simulation.js` and `sim-model.js` (the room physics), `web/` (its control page) |
| `tests/` | `node:test` files, `*.test.js` |
| `deploy/oracle/` | systemd units, `push-code.sh`, `push-data.sh`, `setup-vm.sh` |
| `docs/superpowers/` | `specs/` (design per feature) and `plans/` (implementation plans) |
| `docs/research/`, `docs/mockups/`, `docs/screenshots/` | Research notes, design mockups, captures |
| `Dockerfile`, `compose.yaml` | One image for both apps |
| `data/` | Created at run time: the database. Not in git |

## Tests

```bash
npm test
```

Runs `tests/*.test.js` with the built-in `node:test` runner (60 s per file). They cover the Modbus layer, the device simulator, automatic control, alarms, the HTTP API of every area, sign-in, the database migrations and the UI's math.

## Docs

| Doc | What |
|---|---|
| `PRODUCT.md` | Who the app is for and what it is for |
| `DESIGN.md` | The design system |
| `docs/superpowers/specs/` | One design spec per feature, named `YYYY-MM-DD-<feature>-design.md` |
| `docs/superpowers/plans/` | The implementation plan for each spec |

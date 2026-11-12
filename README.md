# Mushroom farm

[![Tests](https://github.com/rayy1218/mushroom-farm/actions/workflows/test.yml/badge.svg)](https://github.com/rayy1218/mushroom-farm/actions/workflows/test.yml) ![Node 22.13+](https://img.shields.io/badge/node-%E2%89%A5%2022.13-339933) ![No dependencies](https://img.shields.io/badge/dependencies-none-blue)

Keeps a small mushroom farm's grow rooms in the right climate, tells the team what to do each day, and shows what every kilogram costs and earns.

![The Overview: four rooms with their temperature, humidity and CO₂ against the crop's bands; one room's humidity is above its band](docs/images/overview.png)

Built for one farm in lowland Malaysia. The owner and the workers each sign in, on a desk or a phone.

| Jump to | For |
|---|---|
| [For farm owners](#for-farm-owners) | What it does for the farm, what it costs to run |
| [For engineers](#for-engineers) | How it is built, how to run and deploy it |

## For farm owners

### The problems it solves

| Problem | What the app does |
|---|---|
| A room runs too hot, too dry or too stuffy for a few hours, and a crop is lost | It reads every room every 5 seconds and runs the fans, humidifier, dehumidifier, aircon and lights to keep the room inside the crop's bands. Each crop stage (spawn run, pinning, fruiting, rest) has its own bands |
| Nobody notices a problem until the morning | Alarms show on every page, with a count in the menu, and reach a phone through Telegram (optional). A room out of band turns Serious after 30 min and Critical past the crop's own limits, so the phone rings for what matters. A gateway outage is one alarm, not one per machine, and cleared alarms fold away |
| Outside air is free cooling, but only some hours | An outdoor probe tells the app when outside air can cool or dry a room, so the aircon runs less |
| Workers forget a task, or do it on the wrong day | The Today page lists each room's tasks for the stage it is in, plus upkeep that is due. Workers tick them off on a phone |
| You don't know what a kilogram costs to grow | Energy (kWh and RM) and water (L) per room, harvests per room and crop, costs and sales give a profit per run and per kg |
| A month of buying looks like a loss, and stock and equipment never show | Costs counts materials when used and blocks when they go into a room; what was bought is a cash line apart, the stock is valued, equipment is written off a month at a time, and sales reach the run that grew them |
| You are about to buy a container, an aircon or a new crop and can't tell if it pays | Economics compares a month of your room with the other ways to get the crop (a highland grower, a lowland shed, importing), with the break-even price and the payback. A simulator tests a room's walls, weather and machines before you buy them |
| myGAP paperwork | Printable task, harvest and batch sheets, and CSV exports |

### What you see each day

| Screen | What it tells you |
|---|---|
| Overview | Is the farm OK? Every room's readings against its bands, alarms, the outdoor air, today's energy cost and the harvest |
| A room | Its readings, a drawing of the room with every machine on or off, the crop's stage and day, and the next fresh-air change |
| Today | The day's tasks for every room, by morning, afternoon and upkeep. Made for a phone |
| Harvest | kg picked per day, room and crop, its expected value and the energy cost per kg |
| Business | This month's profit, what needs attention, and each run's profit so far. Owner only: workers see no money |
| Economics | One room's month with one crop against the other ways to grow or buy it |

### Screens

The money and kg figures in these pictures are a made-up example month, not the farm's own. The readings come from the device simulator.

| Screen | Picture |
|---|---|
| **A room.** Readings against the bands, the room's machines as they run, and the crop's progress | <img src="docs/images/room.png" alt="Room 1's Now tab: temperature 21.1 °C and humidity 82.7 % RH in band, CO₂ below the stop point, a drawing of the room with the aircon, circulation fan and dehumidifier on, the list of seven machines and the crop card for lion's mane on day 10 of 10" width="560"> |
| **Today, on a phone.** Each room's tasks in the order of the day. Tick one when it is done, or skip it | <img src="docs/images/today-phone.png" alt="The Today page on a phone: 26 tasks due; Container 1 with grey oyster on fruiting day 1, morning tasks (footbath, humidifier, harvest check), afternoon tasks and overdue upkeep" width="260"> |
| **Harvest.** What the rooms picked, what it is worth and the electricity per kg | <img src="docs/images/harvest.png" alt="The Harvest page over 30 days: 500.3 kg picked, an expected value of RM 12,044.40, RM 0.68 of electricity per kg, a bar chart of kg per day and tables by room and by crop" width="560"> |
| **Business Summary.** The month's profit, the problems that need you, and every run in progress | <img src="docs/images/summary.png" alt="The Business Summary: November so far, a profit of RM 1,700.17 on RM 11,420 income and RM 9,719.83 costs, 45.3 kg not sold yet, one buyer's unpaid deliveries, and the four runs in progress with their profit so far" width="560"> |
| **Economics.** A month of lion's mane in Room 1 against a highland grower, importing, and a warm strain | <img src="docs/images/economics.png" alt="The Economics page for lion's mane in Room 1: a month of income, blocks, electricity, labour, packing, transport, rent and equipment for four ways to grow or buy it; Room 1 makes RM 3,583.76 a month, breaks even at RM 30.25 a kg and pays back in 10 months" width="560"> |

### What it needs

| Need | Detail |
|---|---|
| A computer | Any PC that stays on, or a small cloud VM (it runs on a free Oracle Cloud VM). No database server, no licences to buy |
| Sensors and machines | Modbus sensors and relays: temperature and humidity probes, a CO₂ sensor, an energy meter, a relay module for the fans, humidifier, dehumidifier and lights, an aircon gateway. Wired over RS-485 to an Ethernet gateway |
| No hardware yet | The built-in device simulator plays the sensors and machines, so you can try everything first |
| Phones | Any phone browser. Workers sign in with a 6-digit PIN, owners with a password |
| Phone alarms | Optional: a Telegram bot, set up on the Settings page |

## For engineers

### Architecture

```mermaid
flowchart TB
  UI["Browser, desk or phone<br/>web/: plain ES modules, no build"]
  subgraph Farm["Farm app: server/, one Node process"]
    HTTP["HTTP API, static files<br/>and live stream"]
    Poller["Poller"]
    Ctrl["Controller"]
    Mach["Machines"]
    Alarms["Alarms and<br/>daily tasks"]
    Sim["Simulations<br/>(worker thread)"]
    DB[("SQLite<br/>node:sqlite")]
  end
  TG["Telegram<br/>(optional)"]
  GW["Modbus TCP gateway<br/>(the farm's, or a room's own)"]
  subgraph Field["Farm floor, or the device simulator: device/"]
    Sensors["T/RH probes, CO₂ sensor,<br/>outdoor probe, energy meter,<br/>filter pressure"]
    Relays["Relay module: fans,<br/>humidifier, dehumidifier, lights"]
    AC["Aircon gateway"]
  end

  UI <-->|"JSON over HTTP,<br/>live stream (SSE)"| HTTP
  HTTP <--> DB
  Sim <--> DB
  Poller --> DB
  Poller --> Ctrl
  Ctrl -->|"the stage's bands"| Mach
  Ctrl --> Alarms
  Alarms --> DB
  Alarms --> TG
  Poller -->|"read every 5 s"| GW
  Mach -->|"switch"| GW
  GW --> Sensors
  GW --> Relays
  GW --> AC
```

| Part | What it does |
|---|---|
| Poller (`poller.js`, `modbus.js`, `gateways.js`) | Reads every wired sensor and machine each interval (5 s default). Each gateway is polled at the same time, so a silent one does not slow the other rooms |
| Controller (`controller.js`, `machines.js`) | Compares each room's readings with its bands and switches the machines. Auto or manual per room. Raises the alarms and makes each day's tasks |
| Alarms to phones (`telegram.js`) | Sends alarms to a Telegram chat when one is set up in Settings |
| Live stream (`live.js`, `events.js`) | Served next to the HTTP API. Server-Sent Events push readings, alarms and machine states to every open page. It follows the session: a signed-out browser stops receiving |
| Database (`db.js`) | One SQLite file through the built-in `node:sqlite`. Migrations run on start and only move up |
| Simulations (`simulate.js`, `simulate-worker.js`) | Room physics (walls, weather, machines) in a worker thread, for test runs and machine sizing |
| Device simulator (`device/`) | A Modbus TCP server and a control page that play the sensors, relays and aircon, with room physics |

### Stack

| Item | Choice |
|---|---|
| Runtime | Node 22.13 or newer (for `node:sqlite`) |
| Dependencies | None. No npm packages, server or browser |
| Language | Plain JavaScript (ES modules) |
| Build | None. The server sends `web/` as it is |
| Tests | Built-in `node:test` |
| Licence | All rights reserved, see [LICENSE](LICENSE) |

### Quick start

Use two terminals.

```bash
npm run device    # the device simulator: http://localhost:8090
npm start         # the farm app:         http://localhost:8080
```

Make the first owner. Nobody can sign in until you do. It asks for the password twice and does not show it (14 characters or more).

```bash
npm run owner -- "<name>"
```

Open http://localhost:8080 and sign in. Then:

| Step | Where | What |
|---|---|---|
| 1 | Device page | Add sensors (address and kind) and type their values |
| 2 | Farm app, room page, Setup tab | Give a room the same addresses |
| 3 | Device page | For a live-looking room, add a simulated room, link its sensors and machines, and enable it |

The database is created at `data/v2.db` on the first start and moved up to the current version by itself. Copy it first when you update an existing farm (for example to `data/v2-before-update.db`). It never moves back down.

### Configuration

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

### Devices

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

| Wiring | How |
|---|---|
| A real RS-485 farm | The same requests through an Ethernet-to-RS-485 gateway. Point `FARM_GATEWAY` at it |
| A gateway per room | A room on its own RS-485 bus takes that gateway's `host:port` in the Modbus gateway card at the top of its Setup tab. Empty means `FARM_GATEWAY`. The room's sensors, meter, filter sensor, relay module and aircon go through it, so their addresses only need to differ on that gateway. The outdoor probe always uses the farm's gateway |

### Run with Docker

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

### Run on a cloud VM

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
| Funnel off again | `sudo tailscale funnel --bg 8080 off && sudo tailscale serve --bg 8080` |

| Safety note | Why |
|---|---|
| `push-data.sh` replaces the VM's database and simulator state | Use it for the first move only. It refuses to run while local apps listen on the farm's ports |
| Run one farm app per farm | After the data moves, keep the old machine's apps stopped. Two would keep two histories |
| `push-code.sh` sends code only | It never touches `data/`. Back up the database before an update that adds a database version |
| Only SSH should be open on the VM | Reach the pages through Tailscale: `tailscale serve` for the tailnet only, `tailscale funnel --bg 8080` to put the farm app on the internet. The device apps stay on the tailnet |
| With Funnel on, the sign-in is public | `GET /api/login/names` needs no session, so anyone can read the active workers' names, and wrong PINs can lock a worker until the owner's Unlock. Use long owner passwords |

### Project layout

| Path | What |
|---|---|
| `server/` | Farm app: `main.js` (start), `app.js` and `*-api.js` (HTTP routes), `db.js` (schema and migrations), `controller.js` (automatic control), `poller.js` and `modbus.js` (devices), `alarms.js`, `tasks.js`, `auth.js`, `owner.js` (first owner), and one module per business area (`harvests`, `batches`, `inventory`, `sales`, `costs`, `runs`, `economics`) |
| `web/` | Browser UI: `index.html`, `app.js` (router), and a page, math and dialog file per area. No build |
| `device/` | Device simulator: `main.js` (start), `modbus-server.js`, `simulation.js` and `sim-model.js` (the room physics), `web/` (its control page) |
| `tests/` | `node:test` files, `*.test.js` |
| `deploy/oracle/` | systemd units, `push-code.sh`, `push-data.sh`, `setup-vm.sh` |
| `docs/` | `specs/` (design per feature) and `plans/` (implementation plans) |
| `docs/images/` | The pictures in this README |
| `docs/research/`, `docs/mockups/`, `docs/screenshots/` | Research notes, design mockups, captures |
| `Dockerfile`, `compose.yaml` | One image for both apps |
| `data/` | Created at run time: the database. Not in git |

### Tests

```bash
npm test
```

Runs `tests/*.test.js` with the built-in `node:test` runner (60 s per file). They cover the Modbus layer, the device simulator, automatic control, alarms, the HTTP API of every area, sign-in, the database migrations and the UI's math. CI runs them on Node 22.

### Docs

| Doc | What |
|---|---|
| `docs/PRODUCT.md` | Who the app is for and what it is for |
| `docs/DESIGN.md` | The design system |
| `docs/specs/` | One design spec per feature, named `YYYY-MM-DD-<feature>-design.md` |
| `docs/plans/` | The implementation plan for each spec |

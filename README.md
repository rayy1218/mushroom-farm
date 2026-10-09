# Mushroom farm

One app for running a mushroom farm. A server on a farm device (a small PC or a Raspberry Pi) runs the climate controller of each room 24 hours a day and keeps all the data in one SQLite file. Phones and laptops on the farm Wi-Fi open the app in a browser. No internet is needed.

| Menu | What it does |
|---|---|
| **Rooms** | The Rooms home: one card per room with its status. **New room** adds a room. **Import rooms from this browser** brings in the rooms saved by the old capacity card. Each room page has the tabs **Live**, **Simulate** and **Calibrate**. |
| **Batches** | Batches of bought blocks: received, placed in a room, cleared. Harvest per flush, grams per block and BE %. **Print QR stickers** prints one sticker per room. |
| **Test bench** | The simulation test bench in the browser. Open it alone, or from a room with **Open test bench**. **Load settings from room** and **Save settings to room** move the settings between the bench and a room. |

| Room page tab | What it does |
|---|---|
| **Live** | Readings, charts, alarms, events and machines. The air exchange card. The settings, with their versions and **Restore**. **Restart** for a stopped room. |
| **Simulate** | Try a plan before you do it. Make a draft crop mix, then **Check capacity** or **Run a full cycle**. Every run is saved: **Open**, **Note**, **Delete**, **Compare with real**. The **Your machines** card and **Check my machines** tell you if the room's machines are big enough. |
| **Calibrate** | Fit the room's values from its own history or from a CSV log, then **Save and apply**. For a linked cycle run, it shows predicted against real. |

| Room status | Meaning |
|---|---|
| `Stopped` | The room's loop stopped. The card shows the error and **Restart**. The other rooms keep running. |
| `<n> alarm` or `<n> alarms` | The room has open alarms. |
| `Out of band` | A value is outside its band. |
| `All good` | Everything is in band and there is no alarm. |

The Rooms home shows the first status that applies, in the order of this table.

## Install

| What you need | Detail |
|---|---|
| Node.js | `Node.js 22.13` or newer |
| A farm device | A PC or a Raspberry Pi on the farm network |
| Packages | None to install: the app has no dependencies |
| Internet | Only to install Node.js and to get the code |

| System | Steps |
|---|---|
| Raspberry Pi OS (64-bit), Debian, Ubuntu | Run the NodeSource commands below |
| Windows, macOS | Install the Node.js 22 LTS installer from `https://nodejs.org/en/download` |
| Warning | The system `nodejs` package of Debian 12, Raspberry Pi OS and Ubuntu 24.04 is older than 22 and does not work. Use the NodeSource commands. |
| Check | `node --version` prints `v22.13.0` or newer |

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt-get install -y nodejs
node --version
```

| Step | Command |
|---|---|
| Get the code | `git clone https://github.com/rayy1218/mushroom-farm.git` |
| Go to the folder | `cd mushroom-farm` |
| Update later | `git pull`, then restart the server (on a service: `sudo systemctl restart mushroom-farm`). An update may run a database upgrade (see "Database upgrades"). |

## Start

| Step | What happens |
|---|---|
| `npm start` | The server starts. After two lines about the script, it prints the address, for example `Open http://192.168.1.20:8080`. |
| First start | It makes `data/farm.db` with the demo room `Room 1`: simulated, grey oyster, fruiting, default settings. The room records a reading every 30 s. |
| Stop | Press Ctrl+C. The server saves the state of each room and closes the database. Closing the terminal stops the server cleanly in the same way. |

| Setting | Environment variable | `farm.config.json` key | Default | Rule |
|---|---|---|---|---|
| Port | `FARM_PORT` | `port` | 8080 | A whole number from 1 to 65535 |
| Database file | `FARM_DB` | `db` | `data/farm.db` | Not empty. A relative path starts from the repo folder. |
| Listen address | `FARM_HOST` | `host` | The first private IPv4 address of the device | Not empty. Private means 10.x, 172.16 to 172.31.x or 192.168.x. Interfaces are taken in name order. Docker, virtual-machine, VPN and loopback interfaces are skipped (names starting `docker`, `br-`, `veth`, `virbr`, `vmnet`, `tun`, `tap`, `lo`, `zt`). |
| Time zone | `TZ` | – | The device's own | Use `Asia/Kuala_Lumpur` on the farm device. "Today" on the phone harvest page starts at the device's midnight. |

| Rule | Detail |
|---|---|
| Order | The environment wins over `farm.config.json`, which wins over the default. |
| Empty variable | A variable that is set but empty counts as set. For `FARM_DB` and `FARM_HOST` that is a `Bad configuration` error. |
| File keys | `farm.config.json` takes only `port`, `db` and `host`. Any other key is a `Bad configuration` error. |
| Address | The server never listens on `0.0.0.0`. |

```json
{ "port": 8080, "db": "data/farm.db", "host": "192.168.1.20" }
```

| Message | Meaning | What to do |
|---|---|---|
| `Open http://<host>:<port>` | The server is ready. With ` (set FARM_HOST to choose another)` at the end, the device has several farm addresses. | Open the address. Set `FARM_HOST` to choose another. |
| `Farm network addresses: <address> (<name>), …` | The device has several farm addresses. It uses the first. | Set `FARM_HOST` if the first is the wrong network. |
| `No farm network address found; set FARM_HOST (for example 127.0.0.1).` | The device has no private address. This also happens when the server starts before the router gave an address. | Connect the device to the farm network, or set `FARM_HOST`. The service of "Run at boot" tries again by itself. |
| `Bad configuration: <reason>` | A setting or `farm.config.json` is wrong. | Fix what the reason says. |
| `Cannot open the database: <message>` | The database file cannot be opened. This includes a file made by a newer version of the app, and `Schema upgrade <n> failed`. | Check the path and the disk. For a newer file, update the app. Restore a backup if an upgrade failed. |
| `Cannot open the harvest records: <message>` | The harvest store could not open on the database. The server stops. | Report it. |
| `Cannot listen on <host>:<port>: <message>` | Another copy is running, or another program uses the port. | Stop the other copy, or set another `FARM_PORT`. |
| `Database error: <message>` | The server stopped on purpose: the disk is full or the SD card is failing. At most the last 5 minutes of controller state are lost, never settings. | Free space or replace the card, then start again. |
| `Cannot start the rooms: <message>` | A fault in the app. | Report it with the lines that follow. |
| A room shows `Stopped` with an error | One room failed. The other rooms keep running. | Press **Restart** on that room. If it stops again, report the error. |

## Open from a phone

| Step | What to do |
|---|---|
| 1 | Connect the phone to the farm Wi-Fi (the network of the device). |
| 2 | Type the printed address with `http://`, not `https://`. |
| 3 | Bookmark it, or use "Add to Home screen". |

| Problem | Cause | Fix |
|---|---|---|
| The page does not open | The phone is on another network, or a guest Wi-Fi isolates devices, or a firewall on the device blocks the port | Use the farm Wi-Fi. On Linux with `ufw` active: `sudo ufw allow 8080/tcp`. |
| The address changed after a router restart | The router gave the device a new address | Give the device a fixed address on the router ("DHCP reservation"). The QR stickers need it too (see "Harvest stickers"). |
| The server picked the wrong network | The device has both Ethernet and Wi-Fi | Set `FARM_HOST`. `hostname -I` lists the addresses. |
| Live values stop after the phone slept or the Wi-Fi dropped | The live connection broke | The page reconnects by itself within about 45 s and loads the missed minutes. Gaps in the readings stay gaps. |

| Safety | Detail |
|---|---|
| No login | This version has no login. Anyone on the farm Wi-Fi can change settings and record harvest. Keep the Wi-Fi password private. Logins are work item 3.5. |
| Router | Never forward the port on the router. |
| Internet | There is no public website. GitHub keeps only the code. |

## Run at boot (Linux)

Save this as `/etc/systemd/system/mushroom-farm.service`. Change `User` and `WorkingDirectory`. Find the node path with `command -v node`.

```ini
[Unit]
Description=Mushroom farm server
After=network-online.target
Wants=network-online.target

[Service]
# Change these two lines: your user and the folder of the code
User=pi
WorkingDirectory=/home/pi/mushroom-farm
Environment=TZ=Asia/Kuala_Lumpur
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

| Step | Command |
|---|---|
| 1 | Create the file above |
| 2 | `sudo systemctl daemon-reload` |
| 3 | `sudo systemctl enable --now mushroom-farm` |
| See the address and messages | `journalctl -u mushroom-farm -f` |
| Stop | `sudo systemctl stop mushroom-farm` (the same clean stop as Ctrl+C) |
| Restart after an update | `sudo systemctl restart mushroom-farm` |

| Line of the unit | Why |
|---|---|
| `Restart=on-failure` | Starts the server again after a failure, for example a start before the router gave the address. |
| `Environment=TZ=Asia/Kuala_Lumpur` | Runs the server in Malaysian time, so "today" on the phone harvest page starts at Malaysian midnight. |
| `ExecStart` | Runs `node` directly, not `npm start`, so the stop signal reaches the server once. A second signal makes it exit at once with code 1. |

## What is stored

| What | Table | Note |
|---|---|---|
| Rooms | `rooms` | The demo room, and every room you add |
| Settings versions | `room_settings` | One row per save |
| Readings | `readings` | Every 30 s per room |
| Events and alarms | `events`, `alarms` | |
| Calibrations | `calibrations` | |
| Crop mixes | `crop_mixes` | |
| Capacity reports | `capacity_reports` | Old pages only |
| Controller state | `controller_state` | Saved every 5 minutes and at stop |
| Saved simulation runs | `simulation_runs` | The only thing you can delete in the app |
| The room's machines | `room_equipment` | |
| Batches and harvest crates | `batches`, `harvest_crates` | |

A room needs about 100 MB per year.

| Reading key | Unit | Meaning |
|---|---|---|
| `room_id` | – | The room |
| `t` | s | Time of the reading, seconds since 1970 (UTC) |
| `T` | °C | Room temperature |
| `RH` | % | Room relative humidity |
| `CO2` | ppm | Room CO₂ |
| `t_out` | °C | Outdoor temperature |
| `rh_out` | % | Outdoor relative humidity |
| `ac_mode` | – | `off`, `cool`, `heat`, `dry` or `fan` |
| `ac_setpoint` | °C | AC setpoint |
| `fog` | level 0 to 3 | Fogger level |
| `air` | 0 or 1 | `1` while the air exchange is on. In an average row: the share of the time it was on. |
| `lights` | 0 or 1 | Lights on |
| `circ` | 0 or 1 | Circulation fan on |
| `power_w` | W | Power of all machines |
| `kwh` | kWh | Energy used since the meter started |
| `ac_fan` | – | `low`, `auto` or `high`; empty when the AC is off |
| `stage` | – | Crop stage |
| `core` | °C | Block core temperature, when there is a probe |

`ac_fan`, `stage` and `core` are empty for readings recorded before upgrade 3.

## Database upgrades

| Upgrade | What it does | First start after the update |
|---|---|---|
| 2 | Air exchange. The old fan level becomes `air` 0 or 1. Rooms lose their old air-path setting. | Rebuilds the `readings` table once and copies every reading |
| 3 | Rooms, simulations and machines. New reading and calibration columns, and the `simulation_runs` and `room_equipment` tables. | Checks every stored reading once |
| 4 | Batches and harvest. Adds the empty `batches` and `harvest_crates` tables. | Fast |

| Rule | Detail |
|---|---|
| When | Upgrades run by themselves at the first `npm start` after an update, in order. Each is all or nothing. |
| Time | On a large file the first start can take from seconds to a minute, before the `Open http://…` line. It happens only once. |
| Backup | Back up `data/farm.db` before you update (see "Back up the data"). |
| Going back | An older app cannot open an upgraded file: `Cannot open the database: … has schema version …`. |

## Harvest stickers

| Step | What to do |
|---|---|
| 1 | Open **Batches**, create a batch, and place it in a room. |
| 2 | Open **Print QR stickers** (`#/harvest/stickers`) from the farm address, for example `http://192.168.1.20:8080`. Never open it from `localhost`: the page warns you and disables **Print**, because phones cannot reach `localhost`. |
| 3 | Print (A4, 6 per page). Stick one sticker on each room door. |
| 4 | A worker scans the sticker with the phone camera, picks the batch, types the weight and presses **Add crate**. |
| 5 | A wrong crate is removed with **Undo**. |

| Advice | Why |
|---|---|
| Laminate the stickers, or print on waterproof labels | The rooms run at 90 % humidity. |
| Give the farm device a fixed address on the router (DHCP reservation) | Every sticker holds the address and stops working when it changes. |
| Run the service with `TZ=Asia/Kuala_Lumpur` (see "Run at boot") | The phone's "today" is then the farm's day. |

| The office sees | Meaning |
|---|---|
| Flush | A gap of `flush_gap_days` days without a crate (default 5) starts a new flush. |
| kg | Fresh weight of the crates. |
| g per block | Fresh grams for each block of the batch. |
| BE % | Biological efficiency: fresh kg per kg of dry substrate. |

## Back up the data

| Way | When | Steps |
|---|---|---|
| Copy with the server stopped | Any system | Stop the server with Ctrl+C. Copy `data/farm.db` to a USB stick or another computer. Start the server. After a clean stop only `data/farm.db` is left: there is no `data/farm.db-wal` or `data/farm.db-shm`. |
| SQLite's backup command with the server running | Linux | Install `sqlite3` once: `sudo apt-get install -y sqlite3`. Then `sqlite3 data/farm.db ".backup '/media/usb/farm-$(date +%F).db'"`. |

| Rule | Detail |
|---|---|
| Off the device | Keep backups off the device. An SD card can fail. |
| How often | At least daily, and always before an update (see "Database upgrades"). |
| While running | Never copy only `farm.db` while the server runs: the newest data may still be in `farm.db-wal`. |
| After an unclean stop | After a `Database error`, a power cut or a crash, `data/farm.db-wal` may still be there. It holds the newest data, so never copy `farm.db` alone. Either use the `sqlite3 … .backup` command above (it also works with the server stopped), or start the server and stop it once with Ctrl+C, then copy `data/farm.db`. |

## Restore a backup

| Step | What to do |
|---|---|
| 1 | Stop the server. |
| 2 | Rename the current `data/farm.db` (keep it). |
| 3 | Copy the backup to `data/farm.db`. |
| 4 | Delete `data/farm.db-wal` and `data/farm.db-shm` if they exist. |
| 5 | Start the server. |
| 6 | Check the Rooms home. |

| Backup from | Result |
|---|---|
| An older version of the app | It is upgraded at the start (see "Database upgrades"). |
| A newer version of the app | `Cannot open the database: The database … has schema version …`. Update the app (`git pull`) first. |

## Moving from the old page

| Old | Now |
|---|---|
| Rooms saved in a browser by the old capacity card | Open **Rooms** in that same browser and click **Import rooms from this browser**. The button shows only while there are stored rooms. Each room starts running as a simulated room. Run the check again on its **Simulate** tab. Reports are not imported. |
| Settings JSON files | **Load settings from room** and **Save settings to room** in the Test bench replace the JSON export and import. |
| The old **Capacity** and **Calibration** menus | The **Simulate** and **Calibrate** tabs of each room |

## Air exchange

| Item | Meaning |
|---|---|
| The pair | The intake fan `SF-203` and the exhaust fan `EF-206` run together, with the dampers open. |
| Purges | Short purges start when CO₂ reaches the start level. They stop at the stop level or at the time cap. |
| Size | The room's settings hold the size in `airM3h` (m³/h, default 1800). |
| **Your machines** | On the **Simulate** tab. It records the room's machines and keeps `airM3h` equal to the air exchange size. A save that changes it stores a settings version `Air exchange size from Your machines`. |
| New size | The live controller uses a new size at once. A simulated room uses it after its next restart. |
| Alarm | `airTooSmall` shows when purges keep hitting the time cap. |

## Tests and tools

| Command | What it does |
|---|---|
| `npm test` | Runs all tests (Node.js 22.13 or newer) |
| `npm run vectors` | Makes the recorded controller runs again after an intended controller change |
| `npm run headless -- --days 2` | Runs the controller and the simulation without a browser or server |

## Files

| File | Part | Content |
|---|---|---|
| `controller.js` | Controller | The control logic. It sees only sensor readings. |
| `runtime.js` | Runtime | Connects an I/O adapter (simulation or hardware) to the controller. |
| `sim.js` | Simulation | The room, the weather, the blocks, the machines and the sensors. |
| `air.js` | Air exchange | Purge arithmetic shared by the controller and the checks. |
| `calib.js` | Calibration | Fits the simulation to a log (CSV) or to a room's history. |
| `capacity.js` | Capacity check | How many blocks of a crop mix a room carries in fruiting. |
| `cycle.js` | Full cycle | Runs a whole crop cycle in the simulation. |
| `equipment.js` | Machines check | Sizes the AC, the fogger and the air exchange for a room. |
| `harvest-rules.js` | Harvest rules | Field rules for batches and crates, shared by the server and the pages. |
| `room-rules.js` | Room rules | Field rules for rooms, shared by the server and the pages. |
| `index.html`, `styles.css` | Page | The app page and its style. |
| `package.json` | Package | Scripts and the Node.js version. |
| `farm.config.json` | Configuration | Optional (see "Start"). |
| `data/farm.db` | Data | Made at the first start. Not in git, never served. |
| `server/` | Server | See the next rows. |
| `server/main.js`, `server/config.js` | Start | Wiring, messages, settings and the listen address. |
| `server/db.js`, `server/db-common.js` | Database | SQLite file, upgrades and queries. |
| `server/rooms.js`, `server/rooms-common.js`, `server/sim-adapter.js` | Rooms | One loop per room, and the simulated room adapter. |
| `server/api.js`, `server/api-common.js`, `server/static.js` | HTTP | The API, the live feed and the files. |
| `server/harvest-schema.js`, `server/harvest-db.js`, `server/harvest-api.js` | Harvest | Upgrade 4, the harvest store and its routes. |
| `web/` | Pages | See the next rows. |
| `web/shell.js`, `web/api.js`, `web/ui.js`, `web/charts.js`, `web/settings-panel.js` | Shared | Menu and routes, calls to the server, small helpers, charts, settings editor. |
| `web/rooms.js`, `web/room-tabs.js` | Rooms home | The Rooms home and the room page frame. |
| `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js`, `web/room-equipment.js` | Room tabs | The **Live**, **Simulate** and **Calibrate** tabs, and the **Your machines** card. |
| `web/batches.js`, `web/harvest.js`, `web/harvest.css` | Harvest | Batch pages, the phone page, the stickers page. |
| `web/vendor/qrcodegen.js` | QR code | Nayuki QR Code generator (MIT). |
| `web/simulator.js` | Test bench | The simulation test bench. |
| `tests/` | Tests | Unit, integration, settings, server and page tests. `tests/fakes/` holds fakes; `tests/vectors/` holds the recorded controller runs. |
| `tools/` | Tools | `make-vectors.js` and `run-headless.js`. |
| `docs/` | Documents | See "Documents". |

## Documents

| Document | Content |
|---|---|
| [`docs/contract.md`](docs/contract.md) | The reading, the commands, the adapter rules and the settings file |
| [`docs/contracts/db.md`](docs/contracts/db.md) | The database |
| [`docs/contracts/rooms.md`](docs/contracts/rooms.md) | The room manager and the adapters |
| [`docs/contracts/api.md`](docs/contracts/api.md) | The HTTP API and the live feed |
| [`docs/contracts/web.md`](docs/contracts/web.md) | The web modules and the settings editor |
| [`docs/contracts/cycle.md`](docs/contracts/cycle.md) | The full cycle simulation |
| [`docs/contracts/equipment.md`](docs/contracts/equipment.md) | The machines check |
| [`docs/contracts/air.md`](docs/contracts/air.md) | The air exchange |
| [`docs/contracts/harvest.md`](docs/contracts/harvest.md) | Batches and harvest by room QR |
| [`docs/phase3-plan.md`](docs/phase3-plan.md) | Phase 3 decisions, options and work items |
| [`docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`](docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md) | The farm app foundation design |
| [`docs/superpowers/specs/2026-10-09-harvest-qr-design.md`](docs/superpowers/specs/2026-10-09-harvest-qr-design.md) | The harvest by QR design |

## Change the controller

| Step | What to do |
|---|---|
| 1 | Change `controller.js`. |
| 2 | Run `npm test`. |
| 3 | If the vector test fails and the change is intended, run `npm run vectors`, then `npm test` again. |
| 4 | Restart the server so the rooms use the new controller. |

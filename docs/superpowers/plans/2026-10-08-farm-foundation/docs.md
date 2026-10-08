# Work brief: Wave 2, Docs stream

Date: 2026-10-08. Stream: **Docs**. Wave: 2. Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md` (sections 1–6; "Workstreams", row "2 Docs"). Contracts: C1 `docs/contracts/db.md`, C2 `docs/contracts/rooms.md`, C3/C4 `docs/contracts/api.md`, C5/C6 `docs/contracts/web.md`. The lead decisions (`LEAD-DECISIONS.md`, LD 1–7) are folded into the contracts and override anything else.

## 1. Goal

Bring the user-facing documents up to date with the farm app foundation, so that a farmer or developer can install Node.js 22.13, start the server, open the app from a phone on the farm Wi-Fi, run it at boot, and back up and restore `data/farm.db`; and add a test that fails when the documents drift from the code.

| Outcome | Document |
|---|---|
| Install, start, configure, open from a phone, run at boot, back up, restore, move from the old page, files | `README.md` (rewrite) |
| The reading, commands and settings file as the farm server uses them; the server's adapter object; links to `docs/contracts/` | `docs/contract.md` (edit) |
| Work items 3.1, 3.3 and 3.7 marked covered; decisions, order, preparation and findings brought up to date | `docs/phase3-plan.md` (edit) |
| A test that fails when these documents drift from the code | `tests/docs.test.js` (new) |

You work alone in your own git worktree, branched from `master` after the wave 1 merge and the lead's wave 1.5 gate (C3 section 2.3). Your worktree has the wave 0 and wave 1 code: `server/` (`main.js`, `config.js`, `db.js`, `db-common.js`, `rooms.js`, `rooms-common.js`, `sim-adapter.js`, `api.js`, `static.js`), `room-rules.js`, `index.html`, `styles.css`, `web/` (with the lead's stub `web/rooms.js`), `tests/fakes/`; `app.js` is gone. The other wave 2 streams (Rooms UI, Capacity and calibration, Simulator link) run at the same time, so their changes are **not** in your worktree: document the Rooms page, the browser-storage import and the Simulator's Load/Save from C5 (sections 3.2, 3.7, 7.8), not from code.

**When code and contract differ:** the README describes what the merged code does (users run the code), and you report every difference to the lead (section 10). You never edit code or contracts.

## 2. Owned files (the only files you may create or change)

| File | Action |
|---|---|
| `README.md` | Rewrite (section 5.1) |
| `docs/contract.md` | Edit (section 5.2) |
| `docs/phase3-plan.md` | Edit (section 5.3) |
| `tests/docs.test.js` | Create (section 4) |

Everything else is read-only, including `package.json`, `.gitignore`, `docs/contracts/*`, the spec, `server/*`, `web/*`, `tests/fakes/*`, `tests/vectors/*` and every other test.

## 3. Contract sections you document (read them first)

| Topic | Source |
|---|---|
| Node.js 22.13 or newer; `--disable-warning=ExperimentalWarning` on `npm start` and `npm test` | C1 section 1 (rows "Engine", "Experimental warning"); `package.json` |
| Configuration (`FARM_PORT`, `FARM_DB`, `FARM_HOST`, `farm.config.json`), listen address, every start-up and error message, service, shutdown | C3 sections 2.1 (`server/config.js`) and 2.2 (all rows) |
| No login, farm network only, no CORS | C3 section 1 (row "Access"); spec "Decisions" (row "Access") |
| Files the server serves; `data/` never served | C3 section 9 |
| Database file: WAL, `synchronous = NORMAL`, `busy_timeout` 5000 ms | C1 section 2.2 |
| Schema upgrades; "newer than the app" error | C1 section 3 |
| What is stored; about 100 MB per room per year | C1 section 4.2; spec section 2 |
| Demo room `Room 1` on an empty database | C2 section 3 (`DEMO_ROOM`, in `server/rooms-common.js`), section 4 (`start()`) |
| State saved every 300 s and at stop; at most 300 s of state lost, never settings | C2 sections 8.3, 8.4, 14 |
| Room crash, Restart, database error | C2 section 11; C3 sections 4.2, 6.19 (LD 5) |
| Live feed drop and reload | C3 sections 10.1, 10.4; C5 section 4.4 (LD 4: 45 s watchdog) |
| Adapter object, factory (with `blocks`), simulated adapter, time origin, UTC+8 | C2 sections 12.1, 12.2, 13.1, 13.2 |
| Reading row (`power_w`, `kwh` = sums; one set of keys) | C1 section 4.2 (`readings`); C2 section 5.3 (LD 1) |
| Settings versions; `importSettings` on every save and Restore | C1 section 4.2 (`room_settings`); C2 sections 9.1, 9.2; C3 sections 6.4–6.7 (LD 6) |
| Web modules and menu | C5 sections 1.1, 2.1, 3.2 |
| One-time import of rooms from browser storage | C5 section 3.7; C3 section 8.1 |
| Simulator Load/Save settings from/to a room | C5 section 7.8 |
| Backups | Spec section 4 (row "Backups") |
| Reading fields of the simulation | `sim.js` `read()`: `seq`, `t`, `hour`, `T`, `RH`, `CO2`, `tOut`, `rhOut`, `power`, `kwh`, `runS`, `water`, `unfilteredM3`, plus `core` (`DEFAULT_ENV.probe` is `true`); optional `T2`, `RH2`, `CO2b` |

## 4. The test file `tests/docs.test.js`

Plain `node:test`, CommonJS, no dependencies, the style of `tests/vectors.test.js`. It reads the documents as text and checks only facts the code defines (names, scripts, members, links, status values), never wording.

Header (exact):

```js
// Docs: the README, docs/contract.md and docs/phase3-plan.md must agree with the code they describe.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const ROOT = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const pkg = JSON.parse(read('package.json'));
const DOCS = ['README.md', 'docs/contract.md', 'docs/phase3-plan.md'];
// Markdown table rows, and the first cell of a row
const rows = md => md.split('\n').filter(l => l.trimStart().startsWith('|'));
const firstCell = l => (l.split('|')[1] || '').trim();
```

| # | Test name (exact) | What it does | Proves |
|---|---|---|---|
| T1 | `docs: relative links resolve` | For each file of `DOCS`: every link target of `/\]\(([^)\s]+)\)/g` that does not start with a scheme (`/^[a-z]+:/i`) or `#` is resolved, after removing a `#…` part, relative to the document's folder; `fs.existsSync` must be true. The failure message lists `<doc>: <target>`. | No dead links |
| T2 | `docs: README npm commands are package.json scripts` | Names from `/\bnpm run ([\w:-]+)/g` and `/\bnpm (start\|test)\b/g` in `README.md` are keys of `pkg.scripts`. `README.md` does not match `/\bnpm (install\|ci)\b/`. | No command for a script that does not exist; no install step (no dependencies) |
| T3 | `docs: README names the Node version of package.json` | `min = pkg.engines.node.replace(/^>=\s*/, '')`; `README.md` contains `Node.js ${min}` and does not match `/Node\.js 20\b/`. | Install matches `engines.node` |
| T4 | `docs: README configuration and messages match the server` | `code` = text of `server/main.js` + text of `server/config.js`. Each of `FARM_PORT`, `FARM_DB`, `FARM_HOST`, `farm.config.json`, `8080`, `Open http://`, `Farm network addresses:`, `No farm network address found`, `Bad configuration:`, `Cannot open the database:`, `Cannot listen on`, `Database error:`, `Cannot start the rooms:` is in `README.md` **and** in `code`. `README.md` contains `data/farm.db`; `code` contains `farm.db`. | Names, default port, default path and messages agree with the code |
| T5 | `docs: README service matches the start script` | The single line of `README.md` that starts with `ExecStart=`: `line.replace(/^ExecStart=\S*node\s+/, '') === pkg.scripts.start.replace(/^node\s+/, '')`. `README.md` has a line `Restart=on-failure`. | The unit runs the server with the flags of `npm start` and restarts it on failure (C3 2.2 "Service") |
| T6 | `docs: README names every top-level file and folder` | For every entry of `fs.readdirSync(ROOT)` not starting with `.`, not `node_modules` or `data`, that is a folder or ends with `.js`, `.html`, `.css` or `.json`: `README.md` contains `` `name` `` or `` `name/` ``. If `app.js` does not exist, `README.md` does not contain `app.js`. `README.md` does not match ``/Open `index\.html`/`` or `/No server/i`. | The file table is complete; the browser-only start text is gone |
| T7 | `docs: contract.md lists every member of the server adapter` | `require('../controller.js')`; `const { createSimAdapter } = require('../server/sim-adapter.js')`; `a = createSimAdapter({ room: { id: 1, name: 'Room 1', volume: 60, vent: 'supply', adapter: 'sim', created_at: 0, archived_at: null }, calib: null, blocks: null, cfg: globalThis.ClimateController.defaultSettings(), snapshot: null, now: () => 1791446400 })`. For every key `k` of `a` other than `io`: a table row of `docs/contract.md` has a first cell containing `` `${k}()` ``. For every key `k` of `a.io`: a first cell contains `` `io.${k}( ``. | The doc names every member the real adapter has |
| T8 | `docs: contract.md lists every field of a simulated reading` | With the adapter of T7: for every key `k` of `a.io.read()`, a table row of `docs/contract.md` has a first cell containing `` `${k}` ``. | Every reading field the server receives is documented (the 14 keys of section 3, last row) |
| T9 | `docs: phase3-plan marks the covered work items` | In `docs/phase3-plan.md`, the header row containing `\| # \|` and `Status` gives the `Status` column. Rows whose first cell is `3.1`, `3.3`, `3.7`: the status cell starts with `Covered`. Rows `3.2`, `3.4`, `3.5`, `3.6`, `3.8`: the status cell is exactly `Open`. | 3.1, 3.3 and 3.7 covered; nothing else |

T7 and T8 build the adapter inside a helper function called from each test (not at load time), so a failing `require` fails only T7 and T8.

## 5. What each document must contain

Plain English, short sentences, as the existing docs. **Every structured item (steps, settings, commands with meaning, messages, files, rules) is a Markdown table with consistent columns; never one table and sibling paragraphs for items of the same kind.** Shell commands go in fenced code blocks, referenced from the table row they belong to. File and code names in backticks. Web files of other wave 2 streams (`web/rooms.js`, `web/capacity.js`, `web/calibration.js`, `web/simulator.js`) are named in backticks, never linked.

### 5.1 `README.md` (rewrite)

| # | Heading | Required content | Source |
|---|---|---|---|
| 1 | `# Mushroom farm` | One paragraph: one app for running a mushroom farm. A server on a farm device (a small PC or a Raspberry Pi) runs each room's climate controller 24 hours a day and keeps the data in one SQLite file; phones and laptops on the farm Wi-Fi open the app in a browser; no internet needed. Menu table (Menu / What it does): Rooms (live rooms, charts, alarms, events, settings with versions and Restore, Restart of a stopped room), Simulator (the test bench in the browser; Load/Save settings from/to a room), Capacity (crop mix and capacity check per room), Calibration (fit a room to its farm log CSV, Save and apply). | Spec "Purpose", section 4; C5 3.2 |
| 2 | `## Install` | Table "What you need": `Node.js 22.13` or newer (exact phrase); a farm device on the farm network; no `npm install` (no dependencies); no internet after install. Table "Install Node.js" (System / Steps): Raspberry Pi OS (64-bit), Debian, Ubuntu: the NodeSource commands below; Windows, macOS: the Node.js 22 LTS installer from `https://nodejs.org/en/download`; a row warning that the system `nodejs` package of Debian 12, Raspberry Pi OS and Ubuntu 24.04 is older than 22 and does not work; check: `node --version` prints `v22.13.0` or newer. Table "Get the code": `git clone https://github.com/rayy1218/mushroom-farm.git`; `cd mushroom-farm`; update later with `git pull`, then restart the server. | C1 1; `package.json` |
| 3 | `## Start` | `npm start`; the line it prints (example `Open http://192.168.1.20:8080`); the first start creates `data/farm.db` with the demo room `Room 1` (simulated, grey oyster, fruiting, default settings) that records a reading every 30 s; stop with Ctrl+C, which saves each room's state and closes the database. Table "Configuration" (Setting / Environment variable / `farm.config.json` key / Default / Rule): port, `FARM_PORT`, `port`, 8080, integer 1–65535; database file, `FARM_DB`, `db`, `data/farm.db`, not empty, a relative path is from the repo folder; listen address, `FARM_HOST`, `host`, the first private IPv4 address (10.x, 172.16–31.x, 192.168.x) in interface-name order, skipping Docker, virtual-machine, VPN and loopback interfaces (names starting `docker`, `br-`, `veth`, `virbr`, `vmnet`, `tun`, `tap`, `lo`, `zt`), not empty. Rule rows: the environment wins over `farm.config.json`, which wins over the default; a variable that is set but empty counts as set; `farm.config.json` takes only `port`, `db`, `host`; the server never listens on `0.0.0.0`. An example `farm.config.json`. Table "Messages" (Message / Meaning / What to do), one row per message as the code prints it: `Open http://<host>:<port>` (with ` (set FARM_HOST to choose another)` when there are several addresses); `Farm network addresses: <address> (<name>), …`; `No farm network address found; set FARM_HOST (for example 127.0.0.1).` (also when the server starts before the router gave an address; the service of "Run at boot" retries); `Bad configuration: <reason>`; `Cannot open the database: <message>` (including the "newer version of the app" and `Schema upgrade <n> failed` cases of C1 3); `Cannot listen on <host>:<port>: <message>` (another copy running, or another program on the port); `Database error: <message>` (the server stopped on purpose: disk full or a failing SD card; at most the last 5 minutes of controller state are lost, never settings); `Cannot start the rooms: <message>` (a fault in the app; report it with the lines that follow). A row for a room shown "Stopped" with an error on the Rooms list: the other rooms keep running; **Restart** on that room. | C3 2.2, 6.19; C2 3, 11, 14; C1 3 |
| 4 | `## Open from a phone` | Steps table: connect the phone to the farm Wi-Fi (the device's network); type the printed address with `http://` (not `https://`); bookmark it or "Add to Home screen". Problems table (Problem / Cause / Fix): page does not open (different network; guest Wi-Fi that isolates devices; a firewall on the device: `sudo ufw allow 8080/tcp` when `ufw` is active); the address changed after a router restart (reserve the device's address in the router, "DHCP reservation"); the server picked the wrong network on a device with Ethernet and Wi-Fi (set `FARM_HOST`; `hostname -I` lists the addresses); live values stop after the phone slept or the Wi-Fi dropped (the page reconnects by itself within about 45 s and reloads the missed minutes; gaps stay gaps). Safety table: no login in this version, so anyone on the farm Wi-Fi can change settings (keep the Wi-Fi password private; logins come with work item 3.5); never forward the port on the router; there is no public website (GitHub Pages is off; GitHub keeps only the code). | C3 1, 2.2, 10.4; C5 4.4; spec "Decisions" |
| 5 | `## Run at boot (Linux)` | The unit file `/etc/systemd/system/mushroom-farm.service` below (change `User` and `WorkingDirectory`; find the node path with `command -v node`). Steps table: create the file; `sudo systemctl daemon-reload`; `sudo systemctl enable --now mushroom-farm`; see the address and messages with `journalctl -u mushroom-farm -f`; stop with `sudo systemctl stop mushroom-farm` (the same clean stop as Ctrl+C). Rows explaining: `Restart=on-failure` starts the server again after a failure, for example a start before the router gave the address; `ExecStart` runs `node` directly, not `npm start`, so the stop signal reaches the server once (a second signal makes it exit at once with code 1). | C3 2.2 ("Service", "Shutdown") |
| 6 | `## Back up the data` | Table of what `data/farm.db` holds: rooms, settings versions, readings every 30 s, events, alarms, calibrations, crop mixes, capacity reports, controller state; about 100 MB per room per year. Table "Ways to back up" (Way / When / Steps): (a) copy with the server stopped (any system): stop, copy `data/farm.db` to a USB stick or another computer, start; what to do with `data/farm.db-wal` and `data/farm.db-shm` (write what Task 7 step 4 showed after a clean stop); (b) SQLite's backup command with the server running (Linux): install `sqlite3` once (`sudo apt-get install -y sqlite3`), then `sqlite3 data/farm.db ".backup '/media/usb/farm-$(date +%F).db'"`. Rows: keep backups off the device (an SD card can fail); back up at least daily; never copy only `farm.db` while the server runs. | Spec 4 "Backups"; C1 2.2 |
| 7 | `## Restore a backup` | Steps table: stop the server; rename the current `data/farm.db` (keep it); copy the backup to `data/farm.db`; delete `data/farm.db-wal` and `data/farm.db-shm` if they exist; start; check the Rooms list. A row: a backup made by a newer version of the app gives `Cannot open the database: The database … has schema version …`; update the app (`git pull`) first. | C1 3; C3 2.2 |
| 8 | `## Moving from the old page` | Table: rooms saved in a browser by the old capacity card: open **Capacity** in that same browser, click **Import rooms from this browser** (once; each room starts running as a simulated room; run the check again for each room; reports are not imported); old settings JSON files: the Simulator's JSON export and import are replaced by **Load settings from room** and **Save settings to room**. | C5 3.7, 7.8; C3 8.1 |
| 9 | `## Tests and tools` | Table Command / Does: `npm test` (all tests; Node.js 22.13 or newer); `npm run vectors` (makes the 8 recorded controller runs again after an intended controller change); `npm run headless -- --days 2` (the controller and simulation without a browser or server). Only scripts of `package.json` (T2). | `package.json` |
| 10 | `## Files` | Table File / Part / Content. Every top-level file and folder (T6) and: `server/main.js`, `server/config.js`; `server/db.js`, `server/db-common.js`; `server/rooms.js`, `server/rooms-common.js`, `server/sim-adapter.js`; `server/api.js`, `server/static.js`; `index.html`, `styles.css`; `web/` with the files of C5 1.1 (`shell.js`, `api.js`, `ui.js`, `charts.js`, `settings-panel.js`, `rooms.js`, `simulator.js`, `capacity.js`, `calibration.js`); `room-rules.js`; `controller.js`, `runtime.js`, `sim.js`, `calib.js`, `capacity.js`; `package.json`; `farm.config.json` (optional, see "Start"); `data/farm.db` (made at the first start, not in git, never served); `tests/` (with `tests/fakes/` and `tests/vectors/`); `tools/`; `docs/`. No `app.js`. | C5 1.1; C3 2.1, 9 |
| 11 | `## Documents` | Table Document / Content, with links: `docs/contract.md`, `docs/contracts/db.md`, `docs/contracts/rooms.md`, `docs/contracts/api.md`, `docs/contracts/web.md`, `docs/phase3-plan.md`, `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`. | – |
| 12 | `## Change the controller` | Steps table: change `controller.js`; run `npm test`; if the vector test fails and the change is intended, `npm run vectors`, then `npm test` again; restart the server so the rooms use the new controller. | Today's README |

The unit file (exact, except `User`, `WorkingDirectory` and the node path; the `ExecStart` arguments equal `scripts.start` after `node`, T5):

```ini
[Unit]
Description=Mushroom farm server
After=network-online.target
Wants=network-online.target

[Service]
# Change these two lines: your user and the folder of the code
User=pi
WorkingDirectory=/home/pi/mushroom-farm
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/main.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

NodeSource commands (row 2):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o nodesource_setup.sh
sudo -E bash nodesource_setup.sh
sudo apt-get install -y nodejs
node --version
```

### 5.2 `docs/contract.md` (edit; keep sections 1–4 and their numbers, add section 5)

| Where | Change |
|---|---|
| Intro | Add: on the farm server, `server/rooms.js` runs this loop once per room (one adapter and one controller per room, ticked every second). A table (Contract / Content) with links to `contracts/db.md` (database), `contracts/rooms.md` (room manager and adapters), `contracts/api.md` (HTTP API and live feed), `contracts/web.md` (web modules and settings editor). |
| Diagram | One line under it: on the server, each reading and its commands are recorded in `data/farm.db` (`readings`, `events`, `alarms`). |
| 1, row `t` | Notes: controller time; it must increase. On the farm server: seconds since 1970 UTC (the simulated adapter adds a time origin, `contracts/rooms.md` 13.2). In the Simulator and the test vectors: seconds from the start of the run (0). |
| 1, row `hour` | Notes: local time of day at the farm (Malaysia, UTC+8, no daylight saving), decimal hours. |
| 1, new rows after `T2` | Same columns, first cells exactly `` `power` ``, `` `kwh` ``, `` `runS` ``, `` `water` ``, `` `unfilteredM3` `` (T8). `power`: W, `{ ac, hu, fan, lights, circ }`, optional: power of each machine now; the server stores the sum as `power_w`; leave it out without a meter. `kwh`: kWh, same keys, optional: energy of each machine since the adapter's meter started (it only grows); the server stores the sum as `kwh`. `runS`: s, `{ ac, hu, fan }`, simulation only: machine run time. `water`: kg, `{ fogKg, acKg }`, simulation only: fogger water and AC condensate. `unfilteredM3`: m³, simulation only: air that came in unfiltered. A Notes cell says the controller ignores all five and the server ignores `runS`, `water`, `unfilteredM3`. |
| 1, after the table | The server stores the values as the adapter gives them (no filtering): `contracts/db.md` 4.2 `readings`. |
| 2, after the table | The server records the commands of each reading (`ac_mode`, `ac_setpoint`, `fog`, `fan`, `lights`, `circ`; `ac.fan` is not stored): `contracts/db.md` 4.2. |
| 2, "Rules for an adapter" | The numbered list becomes a table `# / Rule / Detail` with the same three rules, plus rule 4 "Time": on the farm server `t` is seconds since 1970 UTC and increases; `hour` is farm local time. Keep "These values are a proposal; confirm them for the farm." |
| 3, "A port must" | The numbered list becomes a table `Step / Action` (same text). |
| 4 | Replace "The same file is the configuration of a farm device." with a table "Where the format is used" (Use / Part of the file / Checked by): settings versions on the server (`room_settings`: the `settings` part only, one row per save; `importSettings` on every save and Restore, `contracts/rooms.md` 9.2); `GET` and `PUT /api/rooms/:id/settings` (the bare settings object, `contracts/api.md` 3.5); `tools/run-headless.js --settings <file>` (the whole file). |
| New 5 "Adapter on the farm server" | Table "Members" (Member / Required / Signature / Rules), five rows with first cells exactly `` `io.read()` ``, `` `io.write(cmd)` ``, `` `io.advance(dt)` ``, `` `view()` ``, `` `snapshot()` ``, content from `contracts/rooms.md` 12.1. Table "Factory arguments" (Argument / Type / Meaning): `room`, `calib`, `blocks`, `cfg`, `snapshot`, `now` from 12.2. Table "Timing" (Item / Value): tick every 1 s; physics in 1 s steps; one decision per new reading (30 s); catch-up up to 300 s, a longer pause is a gap; state saved every 300 s and at stop (`contracts/rooms.md` 13.2, 14). Table "Adding a hardware adapter (work item 3.2)" (Step / Action): a module that returns the same object (`view()` and `snapshot()` return `null`, no `io.advance`); a name in `rooms.adapter` (the column has no `CHECK`); a branch in `defaultAdapterFactory` of `server/rooms.js` (an unknown name stops that room with `Unknown adapter "<name>"`); today the server creates every room with `adapter: 'sim'`, so choosing another adapter is a contract change of 3.2; the adapter rules of section 2 (watchdog, keep the last command). |

### 5.3 `docs/phase3-plan.md` (edit)

| Where | Change |
|---|---|
| Status line | `Status: preparation done; farm app foundation built (covers 3.1, 3.3 and 3.7) on <date>.` with the date of your commit (`date +%F`), and a link to the spec. |
| Decisions, row "Dashboard and history" | Effect: built: the farm server (`server/`) serves the app and keeps the history in `data/farm.db`; works without internet. |
| Decisions, new row | "Live updates": Server-Sent Events (server to page); changes go back as HTTP requests. Effect: no WebSocket. |
| Hardware option A | "Control loop": the farm server as it is (Node.js 22.13 or newer). |
| Work items table | A `Status` column after `Size`. 3.1 `Covered by the foundation, except a CSV export of a room's history`; 3.3 `Covered by the foundation, with the simulated adapter`; 3.7 `Covered by the foundation`; 3.2, 3.4, 3.5, 3.6, 3.8 `Open` (exactly). Notes of 3.1: settings saved per room as versions with Restore; the Simulator's JSON export and import replaced by Load/Save settings from/to a room; the Simulator keeps its sample-log CSV; no CSV export of a live room's readings. Notes of 3.3: `server/` with SQLite history and Server-Sent Events instead of WebSocket; a hardware adapter (3.2) plugs in through `docs/contract.md` section 5. Notes of 3.7: one loop per room on the server; the Rooms list is the overview. |
| "Suggested order" | `Done: 3.1, 3.3, 3.7. Next: 3.8 → 3.2 → 3.4 → 3.5 → 3.6.` |
| "Preparation that is done" | The bullet list becomes a table (Item / Content). New row "Farm app foundation" with links to the spec and the contracts. Drop the stale count "66 tests" (write `npm test` without a count). |
| "Findings to remember", room capacity row | Replace the sentence about browser storage and "work item 3.1 should use the same key prefix" with: rooms are now on the farm server; the Capacity module imports the rooms of `mushroom-farm.rooms.v1` once and marks the import with `mushroom-farm.rooms.v1.imported`. Other findings and the open questions stay unchanged. |

## 6. Tasks (TDD order: failing test first)

Commit after each task that ends green, on your branch, with the repository's git configuration unchanged. Message prefixes: `test(docs):`, `docs(readme):`, `docs(contract):`, `docs(phase3):`.

| # | Task | Steps | Expected result |
|---|---|---|---|
| 0 | Before you start | Run the checks of the table below. Read `server/main.js` and `server/config.js` (exact messages, defaults, signals) and `server/sim-adapter.js` (keys of the adapter and of `io.read()`). | Checks pass or are reported. N = the `# tests` count. |
| 1 | README tests (red) | Create `tests/docs.test.js` with the header and T2–T6. Run `node --disable-warning=ExperimentalWarning --test tests/docs.test.js`. | T3 fails (`Node.js 20`); T4 fails (no `FARM_PORT`); T5 fails (no `ExecStart=`); T6 fails (`app.js`, ``Open `index.html` ``, missing `server/`, `web/`, `room-rules.js`). T2 may pass. No commit. |
| 2 | README (green) | Rewrite `README.md` as 5.1. Run the file. | T2–T6 pass. Commit `docs(readme): install, start, phone, run at boot, backup and restore for the farm server` with the test file. |
| 3 | contract tests (red) | Add T7 and T8. Run the file. | T7 fails (`view()`, `snapshot()`, `io.advance(` missing); T8 fails (`power`, `kwh`, `runS`, `water`, `unfilteredM3` missing). |
| 4 | contract.md (green) | Edit `docs/contract.md` as 5.2. Run the file. | T2–T8 pass. Commit `docs(contract): adapter on the farm server, reading extras, server time`. |
| 5 | phase3 test (red) | Add T9. Run the file. | T9 fails (no `Status` column). |
| 6 | phase3-plan.md (green) | Edit `docs/phase3-plan.md` as 5.3. Run the file. | T2–T9 pass. Commit `docs(phase3): mark 3.1, 3.3 and 3.7 covered by the farm app foundation`. |
| 7 | Prove the README by doing it | Run section 6.1 in order; fix the README where reality differs (for example the `-wal` file after a clean stop, a message text). Also run `npm start` once without `FARM_HOST` and note the printed lines; stop with Ctrl+C. | Every expected result of 6.1 holds, or the README says what really happens and the difference is in your report. Commit `docs(readme): match the server's real behaviour` if anything changed. |
| 8 | Links (red, then green) | Add T1. Run the file; fix any dead link in the three documents. | T1–T9 pass. Commit `test(docs): relative links resolve`. |
| 9 | Full check | Section 7. | All green. |

| Check (Task 0) | Command | Expected | If not |
|---|---|---|---|
| Start script | `npm pkg get scripts.start` | `"node --disable-warning=ExperimentalWarning server/main.js"` | Report; stop the Start and service rows until the lead answers |
| Test script | `npm pkg get scripts.test` | `"node --disable-warning=ExperimentalWarning --test tests/*.test.js"` | Report; continue |
| Engines | `npm pkg get engines.node` | `">=22.13"` | Report; the README uses the value in `package.json` (T3) |
| Server files | `ls server/main.js server/config.js server/db.js server/rooms.js server/sim-adapter.js server/api.js server/static.js room-rules.js web/ui.js` | All listed | Report and stop |
| Baseline green | `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail)'` | `# fail 0`; note `# tests` as N | Report and stop |
| Vectors clean | `git status --porcelain -- tests/vectors/` | No output | Report and stop |
| `data/` ignored | `git check-ignore -q data/farm.db && echo ignored` | `ignored` (if not: report it, the farm database must never be committed; continue and `rm -rf data` after 6.1 step 7) | Report; continue |

### 6.1 Manual checks for Task 7 (Linux shell, in the worktree)

```bash
TMP=$(mktemp -d); PORT=18080; DB=$TMP/farm.db
# 1 start (setsid: own process group, so step 4 is like Ctrl+C in a terminal)
FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$DB setsid npm start > $TMP/out.log 2>&1 & PID=$!
sleep 3; cat $TMP/out.log
# 2 the demo room
curl -s http://127.0.0.1:$PORT/api/rooms
# 3 backup while running (skip if sqlite3 is not installed; say so in the report)
sqlite3 $DB ".backup '$TMP/backup.db'" && sqlite3 $TMP/backup.db "SELECT id, name FROM rooms"
# 4 clean stop like Ctrl+C
kill -INT -- -$PID; wait $PID; echo "exit $?"; ls $TMP
# 5 resume
FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$DB setsid npm start > $TMP/out2.log 2>&1 & PID=$!
sleep 3; curl -s "http://127.0.0.1:$PORT/api/rooms/1/events?limit=5"
kill -INT -- -$PID; wait $PID
# 6 restore the backup
cp $TMP/backup.db $DB; rm -f $DB-wal $DB-shm
FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$DB setsid npm start > $TMP/out3.log 2>&1 & PID=$!
sleep 3; curl -s http://127.0.0.1:$PORT/api/rooms; kill -INT -- -$PID; wait $PID
# 7 the data folder is never served (default data/farm.db in the worktree)
FARM_HOST=127.0.0.1 FARM_PORT=$PORT setsid npm start > $TMP/out4.log 2>&1 & PID=$!
sleep 3; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:$PORT/data/farm.db; kill -INT -- -$PID; wait $PID; rm -rf data
# 8 the unit file (if systemd-analyze exists): the README's unit with User=$USER and WorkingDirectory=$PWD
systemd-analyze verify $TMP/mushroom-farm.service
```

| Step | Expected |
|---|---|
| 1 | `out.log` has `Open http://127.0.0.1:18080` and no `ExperimentalWarning` |
| 2 | A JSON array with one room: `"id":1`, `"name":"Room 1"`, `"vent":"supply"`, `"adapter":"sim"`, a `live` object |
| 3 | `1\|Room 1` |
| 4 | `exit 0`; `ls` shows which of `farm.db`, `farm.db-wal`, `farm.db-shm` remain: write this into README row 6 |
| 5 | The events include `Resumed after 0 min stopped` (state saved at the stop), not a new `Started` |
| 6 | `Room 1` again |
| 7 | `404`; `data/` removed afterwards, so `git status` stays clean |
| 8 | No errors about the unit's syntax (a warning that the user does not exist here is fine); if `systemd-analyze` is missing, say so |

## 7. How to verify

| Command | Expected |
|---|---|
| `node --disable-warning=ExperimentalWarning --test tests/docs.test.js` | 9 tests, all pass |
| `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail)'` | `# tests` = N + 9; `# fail 0` |
| `node --test tests/vectors.test.js` | 8 tests (`vectors: <file>.json`), all pass |
| `git diff --exit-code master...HEAD -- tests/vectors/` | No output, exit code 0 (the 8 recorded runs unchanged) |
| `git diff --name-only master...HEAD` | Exactly `README.md`, `docs/contract.md`, `docs/phase3-plan.md`, `tests/docs.test.js` |
| `git status --porcelain` | Empty (no `data/`, no temporary files) |

## 8. Done when

| # | Check |
|---|---|
| 1 | `tests/docs.test.js` has T1–T9 with the exact names of section 4, and each was seen failing before its document was written |
| 2 | `README.md` has the 12 sections of 5.1; every structured item is a table |
| 3 | `docs/contract.md` has the changes of 5.2, including section 5 "Adapter on the farm server" |
| 4 | `docs/phase3-plan.md` has the changes of 5.3; 3.1, 3.3 and 3.7 are `Covered…`, the others `Open` |
| 5 | Every step of 6.1 was run, or its absence is reported; the README matches what the server did |
| 6 | Section 7 holds: `npm test` green with N + 9 tests; the 8 files in `tests/vectors/` unchanged; only the four owned files changed; `git status` clean |
| 7 | The report of section 10 is sent to the lead |

## 9. What NOT to do

| Do not | Instead |
|---|---|
| Change any file outside section 2 | Report the needed change to the lead |
| Run `npm run vectors` | Never needed for docs; it rewrites `tests/vectors/` |
| Commit `data/`, a database file, `farm.config.json` or temporary files | `mktemp -d` and `FARM_DB`; `rm -rf data` after step 7 |
| Test prose wording | Test only facts the code defines (names, scripts, members, links, status values) |
| Describe logins, Telegram, cloud sync, readings clean-up or a CSV export of live history as present | Name them as later work items |
| Promise behaviour you did not run (backup, restore, clean stop) without saying so | Run 6.1, or list it under "Not verified" |
| Write paragraphs for lists of steps, settings, messages or files | Tables with consistent columns |
| Add npm dependencies, a docs generator or a Markdown linter | Plain Markdown and `node:test` |
| Link to web files of other wave 2 streams | Name them in backticks |
| Document an adapter member that C2 12.1 does not list just to make T7 pass | Report the extra member to the lead as a contract difference |

## 10. Report to the lead (your final message)

| Item | Content |
|---|---|
| Files | The four owned files, one line each on what changed |
| Tests | N before, N + 9 after, `# fail 0`; the vectors diff result |
| Manual checks | The result of each step of 6.1 (pasted output lines), including which `farm.db-*` files remained after a clean stop, and the lines printed without `FARM_HOST` |
| Task 0 checks | Any that failed |
| Differences | Every place where the merged code differs from C1, C2 or C3 (message text, default, signal handling, adapter members), and what the README now says |
| Not verified | Anything you could not run (no `sqlite3`, no `systemd-analyze`, no phone) |

Decisions this brief makes beyond the spec (the lead may strike them before dispatch):

| # | Decision | Why |
|---|---|---|
| D1 | The Docs stream also owns `tests/docs.test.js` | TDD needs a test; it keeps the docs from drifting from `package.json`, `server/main.js`, `server/config.js` and the adapter |
| D2 | 3.7 "More than one room" is also marked covered | C2 runs one loop per room; C5's Rooms list is the overview page of 3.7 |
| D3 | 3.1 is "Covered … except a CSV export of a room's history" | The foundation has no CSV export of a live room's readings |
| D4 | A `Status` column with `Covered…` / `Open` | Machine-checkable by T9 |
| D5 | A systemd unit with `Restart=on-failure`, `RestartSec=5`, and `node` run directly | C3 2.2 "Service" asks for a service that restarts on failure; `npm` in the unit could pass the stop signal on twice, and a second signal exits at once with code 1 |
| D6 | Two backup ways only: a stopped copy and `sqlite3 .backup` | The spec names both; a Node one-liner needs different quoting per shell |

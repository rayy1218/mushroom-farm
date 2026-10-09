# Work brief: Wave 2, Docs stream (revision 2)

Date: 2026-10-09. Stream: **Docs** (wave 2). You are the implementer; reviewers check the work before the lead merges it. This revision replaces the brief of 2026-10-08 (revision 0, written before the room-centred app, C9 and C10).

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 1–74 (notably 20 Reading keys, 27 Live air, 35 air exchange size, 54 upgrade numbers, 55 C9, 59 C10 build, 66 bare layout, 67 farm time zone, 74 (added on `master` after the wave 2 freeze): T4 and T12 hold before and after the merges; the steady-fan findings of `docs/phase3-plan.md` are replaced by C9) | `docs/contracts/LEAD-DECISIONS.md` | They override everything below |
| C1 revision 6 (database) | `docs/contracts/db.md` | Schema, upgrades 2, 3, 4 (sections 3, 4.3–4.5), the 18 Reading keys (6.2), what is stored (4.2) |
| C2 revision 9 (room manager) | `docs/contracts/rooms.md` | Demo room, loop, state saves, crash and Restart, adapter (12.1, 12.2, 13) |
| C3 and C4 revision 9 (HTTP API, live feed) | `docs/contracts/api.md` | Configuration, messages, service, shutdown (2.2), static files (9), live feed (10) |
| C5 revision 8 (web modules) | `docs/contracts/web.md` | Menu, modules, Rooms home, tabs, Test bench, files (1.1, 2.1, 3.2, 3.4, 3.7, 3.8, 3.10–3.12, 7.8) |
| C8 revision 3 (equipment check) | `docs/contracts/equipment.md` | The **Your machines** card and the machines check |
| C9 revision 2 (air exchange) | `docs/contracts/air.md` | The air exchange pair, purges, `airM3h`, upgrade 2 |
| C10 revision 2 (batches and harvest by room QR) | `docs/contracts/harvest.md` | Batches, the phone page, the stickers page, `TZ=Asia/Kuala_Lumpur`, upgrade 4 (sections 1, 8.3, 11, 12, 14 row "Docs stream") |
| Wave 2 plan, sections 3 (Docs row), 3.1, 4, 6.1, 8 (row `docs.md`), 9 | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Owned files, rules, merge order (Docs merges 9th in wave 3), this brief's content |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/docs.md` | Committed by the lead in prep 2.0; you do not edit it |

| Also | Path |
|---|---|
| Spec | `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md` |
| Harvest spec | `docs/superpowers/specs/2026-10-09-harvest-qr-design.md` |

## 1. Goal

Bring the user-facing documents up to date with the farm app as wave 2 builds it, so that a farmer or developer can install Node.js 22.13, start the server, open the app from a phone on the farm Wi-Fi, run it at boot in the farm time zone, understand the one-time database upgrades, print the harvest stickers, and back up and restore `data/farm.db`; and add a test that fails when the documents drift from the code.

| Outcome | Document |
|---|---|
| Install, start, configure, open from a phone, run at boot (with `TZ=Asia/Kuala_Lumpur`), upgrades, stickers, back up, restore, move from the old page, files | `README.md` (rewrite) |
| The reading, commands and settings file as the farm server uses them; the server's adapter object; links to `docs/contracts/` | `docs/contract.md` (edit) |
| Work items 3.1, 3.3 and 3.7 marked covered; decisions, order, preparation and findings brought up to date | `docs/phase3-plan.md` (edit) |
| A test that fails when these documents drift from the code | `tests/docs.test.js` (new; it does not exist on `master`) |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/docs`, on branch `stream/docs`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm` (another developer's working tree) or in another worktree. |
| Git | Keep the configured identity; never change `git config`. Plain commit messages with the prefixes of section 6, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase (the lead merges; wave 2 plan 4). |
| Models and reviews | Implementer on Sonnet; a spec-compliance review and a code-quality review (reviewers on Opus) before the lead merges (wave 2 plan 4) |
| `master` stays green | The lead merges Docs in wave 3, 9th, after Data 2, Equipment, Server 2 (gate 2.5), Room shell, Live tab, Simulate tab, Calibrate tab and Bench (wave 2 plan 6.1), and before the harvest streams' later commits and Harvest web. `npm test` must give `# fail 0` on your branch tip and after those merges. So every check of `tests/docs.test.js` must hold on both trees: on prep 2.0 `master` (no Data 2, Server 2 or harvest server code) and on the merged code. Write a check that depends on another stream's code as a conditional (T4, T12), never as a check that holds only after another stream. |
| What your worktree has | Prep 2.0 `master`: the wave 1 server (`server/main.js`, `config.js`, `db.js` at schema version 2, `rooms.js`, `sim-adapter.js`, `api.js`, `static.js`, `db-common.js`, `rooms-common.js`), C9 (`air.js`), C7 (`cycle.js`), the lead's prep 2.0 files: the `equipment.js` stub, `harvest-rules.js`, `server/harvest-schema.js`, `server/api-common.js`, `web/room-tabs.js`, the stubs `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js`, `web/batches.js`, `web/harvest.js`, `web/harvest.css`, `web/vendor/qrcodegen.js`, `index.html` (C5 1.2), the fakes |
| What it does not have | The other streams' code. Document the Rooms home, the three tabs (**Live**, **Simulate**, **Calibrate**), the Test bench, simulation runs, the equipment check (**Your machines**, **Check my machines**), the batch pages, the phone harvest page and the stickers page from the contracts (C5 3.2, 3.4, 3.8, 3.10–3.12, 7.8; C8; C10 11, 12), not from code |
| Code and contract differ | After the merges, users run the merged code: the README describes what the merged code does, and you report every difference to the lead (section 10). You never edit code or contracts. |
| Contract questions | A gap or a contradiction in a contract: stop that part and report to the lead (wave 2 plan 4); only the lead changes a contract |

| Check (from the worktree) | Command | Expected | If not |
|---|---|---|---|
| Branch | `git branch --show-current` | `stream/docs` (never `master`) | Stop and report |
| Start script | `npm pkg get scripts.start` | `"node --disable-warning=ExperimentalWarning server/main.js"` | Report; stop the Start and service rows until the lead answers |
| Test script | `npm pkg get scripts.test` | `"node --disable-warning=ExperimentalWarning --test tests/*.test.js"` | Report; continue |
| Engines | `npm pkg get engines.node` | `">=22.13"` | Report; the README uses the value in `package.json` (T3) |
| Server and prep files | `ls server/main.js server/config.js server/db.js server/rooms.js server/sim-adapter.js server/api.js server/static.js server/api-common.js server/harvest-schema.js room-rules.js harvest-rules.js equipment.js cycle.js air.js web/ui.js web/room-tabs.js web/vendor/qrcodegen.js index.html` | All listed | Report and stop |
| No docs test yet | `ls tests/docs.test.js` | `No such file` | Report; continue |
| Baseline green | `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail\|skipped)'` | `# fail 0` with exactly the prep 2.0 skips; write down `# tests` as N and `# skipped` as S | Report and stop |
| Vectors clean | `git status --porcelain -- tests/vectors/` | No output | Report and stop |
| `data/` ignored | `git check-ignore -q data/farm.db && echo ignored` | `ignored` | Report (the farm database must never be committed); continue and `rm -rf data` after 6.1 step 7 |

## 3. Owned files (the only files you may create or change; wave 2 plan section 3, Docs row)

| File | Action |
|---|---|
| `README.md` | Rewrite (section 5.1) |
| `docs/contract.md` | Edit (section 5.2) |
| `docs/phase3-plan.md` | Edit (section 5.3) |
| `tests/docs.test.js` | Create (section 4) |

| Not yours | Owner |
|---|---|
| `package.json`, `.gitignore`, `index.html`, the fakes, `web/api.js`, `docs/contracts/*`, the specs, the plans and briefs, `docs/research/*` | Lead |
| `docs/ROADMAP.md` | Lead (wave 3) |
| `server/*`, `room-rules.js`, every `web/*` file, the shared modules, every other test, `tests/vectors/*` | Other streams or nobody (wave 2 plan 3.1) |

## 4. The test file `tests/docs.test.js`

Plain `node:test`, CommonJS, no dependencies, the style of `tests/vectors.test.js`. It reads the documents as text and checks only facts the code or a frozen contract defines (names, scripts, members, keys, links, status values), never wording. Every `require` of a repo module runs inside a test (or a helper a test calls), never at load time, so a failing `require` fails only its tests.

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
// The 18 Reading keys, in order (C1 6.2, lead decision 20)
const READING_KEYS = ['room_id', 't', 'T', 'RH', 'CO2', 't_out', 'rh_out', 'ac_mode', 'ac_setpoint', 'fog', 'air', 'lights', 'circ', 'power_w', 'kwh', 'ac_fan', 'stage', 'core'];
```

| # | Test name (exact) | What it does | Proves |
|---|---|---|---|
| T1 | `docs: relative links resolve` | For each file of `DOCS`: every link target of `/\]\(([^)\s]+)\)/g` that does not start with a scheme (`/^[a-z]+:/i`) or `#` is resolved, after removing a `#…` part, relative to the document's folder; `fs.existsSync` must be true. The failure message lists `<doc>: <target>`. | No dead links |
| T2 | `docs: README npm commands are package.json scripts` | Names from `/\bnpm run ([\w:-]+)/g` and `/\bnpm (start\|test)\b/g` in `README.md` are keys of `pkg.scripts`. `README.md` does not match `/\bnpm (install\|ci)\b/`. | No command for a script that does not exist; no install step (no dependencies) |
| T3 | `docs: README names the Node version of package.json` | `min = pkg.engines.node.replace(/^>=\s*/, '')`; `README.md` contains `Node.js ${min}` and does not match `/Node\.js 20\b/`. | Install matches `engines.node` |
| T4 | `docs: README configuration and messages match the server` | `code` = text of `server/main.js` + text of `server/config.js`. Each of `FARM_PORT`, `FARM_DB`, `FARM_HOST`, `farm.config.json`, `8080`, `Open http://`, `Farm network addresses:`, `No farm network address found`, `Bad configuration:`, `Cannot open the database:`, `Cannot listen on`, `Database error:`, `Cannot start the rooms:` is in `README.md` **and** in `code`. `README.md` contains `data/farm.db`; `code` contains `farm.db`. `README.md` always contains `Cannot open the harvest records:` (C3 2.2, C10 8.4). Conditional: `if (code.includes('openHarvest'))`, `code` also contains `Cannot open the harvest records:` (the lead wires `server/main.js` at gate 2.5; on your branch `main.js` has no `openHarvest`). | Names, default port, default path and messages agree with the code, before and after gate 2.5 |
| T5 | `docs: README service matches the start script` | The single line of `README.md` that starts with `ExecStart=`: `line.replace(/^ExecStart=\S*node\s+/, '') === pkg.scripts.start.replace(/^node\s+/, '')`. `README.md` has a line exactly `Restart=on-failure` and a line exactly `Environment=TZ=Asia/Kuala_Lumpur`. | The unit runs the server with the flags of `npm start`, restarts it on failure (C3 2.2 "Service") and runs it in the farm time zone (C10 8.3, lead decision 67) |
| T6 | `docs: README names every top-level file and folder` | For every entry of `fs.readdirSync(ROOT)` not starting with `.`, not `node_modules` or `data`, that is a folder or ends with `.js`, `.html`, `.css` or `.json`: `README.md` contains `` `name` `` or `` `name/` ``. If `app.js` does not exist, `README.md` does not contain `app.js`. `README.md` does not match ``/Open `index\.html`/`` or `/No server/i`. | The file table is complete (now `cycle.js`, `equipment.js`, `harvest-rules.js` too); the browser-only start text is gone |
| T7 | `docs: contract.md lists every member of the server adapter` | Helper `adapter()`: `require('../air.js'); require('../controller.js'); const { createSimAdapter } = require('../server/sim-adapter.js'); return createSimAdapter({ room: { id: 1, name: 'Room 1', volume: 60, adapter: 'sim', created_at: 0, archived_at: null }, calib: null, blocks: null, equipment: null, cfg: globalThis.ClimateController.defaultSettings(), snapshot: null, now: () => 1791446400 })` (the C2 12.2 adapter-factory arguments `{ room, calib: null, blocks: null, equipment: null, cfg, snapshot: null, now }`; no `vent`). `a = adapter()`. For every key `k` of `a` other than `io`: a table row of `docs/contract.md` has a first cell containing `` `${k}()` ``. For every key `k` of `a.io`: a first cell contains `` `io.${k}( ``. | The doc names every member the real adapter has (on `master` e60dabf: `io`, `view`, `snapshot`; `io.read`, `io.write`, `io.advance`) |
| T8 | `docs: contract.md lists every field of a simulated reading` | With `adapter()` of T7: for every key `k` of `a.io.read()`, a table row of `docs/contract.md` has a first cell containing `` `${k}` ``. | Every reading field the server receives is documented (on `master` e60dabf: `seq`, `t`, `hour`, `T`, `RH`, `CO2`, `tOut`, `rhOut`, `power`, `kwh`, `runS`, `water`, `unfilteredM3`, `core`) |
| T9 | `docs: phase3-plan marks the covered work items` | In `docs/phase3-plan.md`, the header row containing `\| # \|` and `Status` gives the `Status` column. Rows whose first cell is `3.1`, `3.3`, `3.7`: the status cell starts with `Covered`. Rows `3.2`, `3.4`, `3.5`, `3.6`, `3.8`: the status cell is exactly `Open`. | 3.1, 3.3 and 3.7 covered; nothing else |
| T10 | `docs: README lists the 18 Reading keys` | For each key `k` of `READING_KEYS`: some table row of `README.md` has first cell exactly `` `${k}` ``. No table row of `README.md` has first cell `` `fan` ``. `README.md` does not match `/\bvent\b/`. | The stored reading as C1 6.2 and lead decision 20 define it; the C9 removals (`fan` → `air`, no `vent`) |
| T11 | `docs: README room statuses and air exchange` | `README.md` contains `All good`, `Out of band`, `alarm` and `Stopped` (the four Rooms home status chips of C5 3.8). `README.md` matches `/air exchange/i` and contains `` `airM3h` ``; `require('../air.js'); require('../controller.js')`: `'airM3h' in globalThis.ClimateController.defaultSettings()` is `true`. | The room statuses; the air exchange (C9) and its settings key, which exists in the code |
| T12 | `docs: README upgrades, stickers and farm time zone` | Find the `README.md` table whose header row (the first row of a run of consecutive table lines) contains `Upgrade`; its rows have first cells `2`, `3` and `4`. For every `v ≥ 2` of `require('../server/db.js').UPGRADES.map(u => u.version)`, a row of that table has first cell `String(v)` (plain, no backticks; holds with versions 1, 2 on your branch and 1–4 after Data 2). `README.md` contains `#/harvest/stickers`, `fixed address` and `TZ=Asia/Kuala_Lumpur`. | Upgrades 2, 3 and 4 (C1 3; buildability check), the stickers page and its fixed-address advice, the farm time zone (C10 14 row "Docs stream", lead decision 67) |

| Test rule | Detail |
|---|---|
| Count | 12 tests, exactly the names above |
| Where `require` runs | Only inside a test or a helper a test calls (T7, T8, T11, T12) |
| Both trees | T4 and T12 are written so they hold on prep 2.0 `master` and after the merges (conditional `openHarvest` check; the `UPGRADES` loop) |

## 5. What each document must contain

Plain English, short sentences, as the existing docs. **Every structured item (steps, settings, commands with meaning, messages, files, keys, statuses, upgrades, rules) is a Markdown table with consistent columns; never one table and sibling paragraphs for items of the same kind.** Shell commands and the unit file go in fenced code blocks, referenced from the table row they belong to. File and code names in backticks. Web files of other wave 2 streams (`web/rooms.js`, `web/room-live.js`, `web/room-simulate.js`, `web/room-calibrate.js`, `web/room-equipment.js`, `web/batches.js`, `web/harvest.js`, `web/harvest.css`, `web/simulator.js`) are named in backticks, never linked (T1 must hold on your branch whatever they contain).

### 5.1 `README.md` (rewrite)

| # | Heading | Required content | Source |
|---|---|---|---|
| 1 | `# Mushroom farm` | One paragraph: one app for running a mushroom farm. A server on a farm device (a small PC or a Raspberry Pi) runs each room's climate controller 24 hours a day and keeps the data in one SQLite file; phones and laptops on the farm Wi-Fi open the app in a browser; no internet needed. Menu table (Menu / What it does): **Rooms** (the Rooms home: one card per room with its status; **New room**; **Import rooms from this browser** for rooms saved by the old capacity card; each room page has the tabs **Live**, **Simulate**, **Calibrate**), **Batches** (batches of bought blocks: received, placed in a room, cleared; harvest per flush, g per block, BE %; **Print QR stickers**), **Test bench** (the simulation test bench in the browser, opened alone or from a room's **Open test bench**; **Load settings from room** and **Save settings to room**). Table "Room page tabs" (Tab / What it does): **Live** (readings, charts, alarms, events, machines, the air exchange card, settings with versions and Restore, **Restart** of a stopped room), **Simulate** (a draft crop mix → **Check capacity** or **Run a full cycle**; every run is saved: **Open**, **Note**, **Delete**, **Compare with real**; the **Your machines** card and **Check my machines**), **Calibrate** (fit the room's values from its own history or a CSV log, **Save and apply**; predicted vs real for a linked cycle run). Table "Room statuses" (Status / Meaning), the chips of the Rooms home in precedence order: `Stopped` (the room's loop stopped; the error and **Restart**), `<n> alarm` / `<n> alarms`, `Out of band` (a value outside its band), `All good`. | Spec "Purpose", section 4; C5 3.2, 3.4, 3.8, 3.10, 3.11, 3.12, 7.8; C10 12.3 |
| 2 | `## Install` | Table "What you need": `Node.js 22.13` or newer (exact phrase); a farm device on the farm network; no `npm install` (no dependencies); no internet after install. Table "Install Node.js" (System / Steps): Raspberry Pi OS (64-bit), Debian, Ubuntu: the NodeSource commands below; Windows, macOS: the Node.js 22 LTS installer from `https://nodejs.org/en/download`; a row warning that the system `nodejs` package of Debian 12, Raspberry Pi OS and Ubuntu 24.04 is older than 22 and does not work; check: `node --version` prints `v22.13.0` or newer. Table "Get the code": `git clone https://github.com/rayy1218/mushroom-farm.git`; `cd mushroom-farm`; update later with `git pull`, then restart the server (an update may run a database upgrade, row 7). | C1 1; `package.json` |
| 3 | `## Start` | `npm start`; the line it prints (example `Open http://192.168.1.20:8080`); the first start creates `data/farm.db` with the demo room `Room 1` (simulated, grey oyster, fruiting, default settings) that records a reading every 30 s; stop with Ctrl+C, which saves each room's state and closes the database. Table "Configuration" (Setting / Environment variable / `farm.config.json` key / Default / Rule): port, `FARM_PORT`, `port`, 8080, integer 1–65535; database file, `FARM_DB`, `db`, `data/farm.db`, not empty, a relative path is from the repo folder; listen address, `FARM_HOST`, `host`, the first private IPv4 address (10.x, 172.16–31.x, 192.168.x) in interface-name order, skipping Docker, virtual-machine, VPN and loopback interfaces (names starting `docker`, `br-`, `veth`, `virbr`, `vmnet`, `tun`, `tap`, `lo`, `zt`), not empty; time zone, `TZ`, –, the device's, `Asia/Kuala_Lumpur` on the farm device ("today" on the phone harvest page starts at the device's midnight, lead decision 67). Rule rows: the environment wins over `farm.config.json`, which wins over the default; a variable that is set but empty counts as set; `farm.config.json` takes only `port`, `db`, `host`; the server never listens on `0.0.0.0`. An example `farm.config.json`. Table "Messages" (Message / Meaning / What to do), one row per message as the code prints it: `Open http://<host>:<port>` (with ` (set FARM_HOST to choose another)` when there are several addresses); `Farm network addresses: <address> (<name>), …`; `No farm network address found; set FARM_HOST (for example 127.0.0.1).` (also when the server starts before the router gave an address; the service of "Run at boot" retries); `Bad configuration: <reason>`; `Cannot open the database: <message>` (including the "newer version of the app" and `Schema upgrade <n> failed` cases of C1 3); `Cannot open the harvest records: <message>` (the harvest store could not open on the database; the server stops; report it); `Cannot listen on <host>:<port>: <message>` (another copy running, or another program on the port); `Database error: <message>` (the server stopped on purpose: disk full or a failing SD card; at most the last 5 minutes of controller state are lost, never settings); `Cannot start the rooms: <message>` (a fault in the app; report it with the lines that follow). A row for a room shown `Stopped` with an error on the Rooms home: the other rooms keep running; **Restart** on that room. | C3 2.2, 6.19; C2 3, 11, 14; C1 3; C10 8.3, 8.4 |
| 4 | `## Open from a phone` | Steps table: connect the phone to the farm Wi-Fi (the device's network); type the printed address with `http://` (not `https://`); bookmark it or "Add to Home screen". Problems table (Problem / Cause / Fix): page does not open (different network; guest Wi-Fi that isolates devices; a firewall on the device: `sudo ufw allow 8080/tcp` when `ufw` is active); the address changed after a router restart (give the device a fixed address on the router, "DHCP reservation"; the QR stickers need it too, row 8); the server picked the wrong network on a device with Ethernet and Wi-Fi (set `FARM_HOST`; `hostname -I` lists the addresses); live values stop after the phone slept or the Wi-Fi dropped (the page reconnects by itself within about 45 s and reloads the missed minutes; gaps stay gaps). Safety table: no login in this version, so anyone on the farm Wi-Fi can change settings and record harvest (keep the Wi-Fi password private; logins come with work item 3.5); never forward the port on the router; there is no public website (GitHub Pages is off; GitHub keeps only the code). | C3 1, 2.2, 10.4; C5 4.4; spec "Decisions" |
| 5 | `## Run at boot (Linux)` | The unit file `/etc/systemd/system/mushroom-farm.service` below (change `User` and `WorkingDirectory`; find the node path with `command -v node`). Steps table: create the file; `sudo systemctl daemon-reload`; `sudo systemctl enable --now mushroom-farm`; see the address and messages with `journalctl -u mushroom-farm -f`; stop with `sudo systemctl stop mushroom-farm` (the same clean stop as Ctrl+C). Rows explaining: `Restart=on-failure` starts the server again after a failure, for example a start before the router gave the address; `Environment=TZ=Asia/Kuala_Lumpur` runs the server in Malaysian time, so "today" on the phone harvest page starts at Malaysian midnight (C10 8.3); `ExecStart` runs `node` directly, not `npm start`, so the stop signal reaches the server once (a second signal makes it exit at once with code 1). | C3 2.2 ("Service", "Shutdown"); C10 8.3; lead decision 67 |
| 6 | `## What is stored` | Table of what `data/farm.db` holds (What / Table / Note): rooms, settings versions, readings every 30 s, events, alarms, calibrations, crop mixes, capacity reports (old pages only), controller state, saved simulation runs (`simulation_runs`, the only thing you can delete), the room's machines (`room_equipment`), batches and harvest crates (`batches`, `harvest_crates`); about 100 MB per room per year. Table "A reading" (Key / Unit / Meaning), one row per Reading key in the order of C1 6.2, first cells exactly `` `room_id` ``, `` `t` ``, `` `T` ``, `` `RH` ``, `` `CO2` ``, `` `t_out` ``, `` `rh_out` ``, `` `ac_mode` ``, `` `ac_setpoint` ``, `` `fog` ``, `` `air` ``, `` `lights` ``, `` `circ` ``, `` `power_w` ``, `` `kwh` ``, `` `ac_fan` ``, `` `stage` ``, `` `core` `` (T10); `air` is `1` while the air exchange is on (an average row: the share of the time on); `ac_fan`, `stage`, `core` are empty for readings recorded before upgrade 3. Never write `vent` or a `fan` row (T10). | C1 4.2, 6.2, 6.6; lead decision 20; spec section 2 |
| 7 | `## Database upgrades` | Table "Upgrades" (Upgrade / What it does / First start after the update), first cells exactly `2`, `3`, `4` (T12): `2` (air exchange, C9): rebuilds the `readings` table once (the old fan level becomes `air` 0/1; rooms lose their old air-path setting), copies every reading once; `3` (rooms, simulations and machines): new reading and calibration columns and the `simulation_runs` and `room_equipment` tables; checks every stored reading once; `4` (batches and harvest): adds the empty `batches` and `harvest_crates` tables. Rule rows: upgrades run by themselves at the first `npm start` after an update, in order, each all or nothing; on a large file the first start can take from seconds to a minute (before the `Open http://…` line), only once; back up `data/farm.db` before you update (section "Back up the data"); an older app cannot open an upgraded file (`Cannot open the database: … has schema version …`). | C1 3, 4.3, 4.4 (cost row), 4.5; wave 2 plan 9 (risk row); C10 3 |
| 8 | `## Harvest stickers` | Table "Record harvest by QR" (Step / What to do): open **Batches**, create a batch, place it in a room; open **Print QR stickers** (`#/harvest/stickers`) from the farm address (for example `http://192.168.1.20:8080`), never from `localhost` (the page warns and disables **Print**: phones cannot reach `localhost`); print (A4, 6 per page) and stick one sticker per room door; a worker scans it with the phone camera, picks the batch, types the weight and presses **Add crate**; a wrong crate is removed with **Undo**. Table "Sticker advice" (Advice / Why): laminate the stickers or print on waterproof labels (the rooms run at 90 % humidity); give the farm device a fixed address on the router (DHCP reservation), because every sticker holds the address and stops working when it changes (T12 checks `fixed address`); run the service with `TZ=Asia/Kuala_Lumpur` (section "Run at boot") so the phone's "today" is the farm's day. Table "What the office sees" (Item / Meaning): flushes (a gap of `flush_gap_days`, default 5, starts a new flush), kg, g per block, BE % (biological efficiency: fresh kg per kg of dry substrate). | C10 1, 4, 11, 12.3–12.5; lead decisions 66, 67 |
| 9 | `## Back up the data` | Table "Ways to back up" (Way / When / Steps): (a) copy with the server stopped (any system): stop, copy `data/farm.db` to a USB stick or another computer, start; what to do with `data/farm.db-wal` and `data/farm.db-shm` (write what Task 7 step 4 showed after a clean stop); (b) SQLite's backup command with the server running (Linux): install `sqlite3` once (`sudo apt-get install -y sqlite3`), then `sqlite3 data/farm.db ".backup '/media/usb/farm-$(date +%F).db'"`. Rows: keep backups off the device (an SD card can fail); back up at least daily and always before an update (section "Database upgrades"); never copy only `farm.db` while the server runs. | Spec 4 "Backups"; C1 2.2 |
| 10 | `## Restore a backup` | Steps table: stop the server; rename the current `data/farm.db` (keep it); copy the backup to `data/farm.db`; delete `data/farm.db-wal` and `data/farm.db-shm` if they exist; start; check the Rooms home. Rows: a backup from an older version of the app is upgraded at the start (section "Database upgrades"); a backup made by a newer version gives `Cannot open the database: The database … has schema version …`; update the app (`git pull`) first. | C1 3; C3 2.2 |
| 11 | `## Moving from the old page` | Table: rooms saved in a browser by the old capacity card: open **Rooms** in that same browser, click **Import rooms from this browser** (shown only once, while there are stored rooms; each room starts running as a simulated room; run the check again for each room on its **Simulate** tab; reports are not imported); old settings JSON files: the Test bench's JSON export and import are replaced by **Load settings from room** and **Save settings to room**; the old **Capacity** and **Calibration** menus are now the **Simulate** and **Calibrate** tabs of each room. | C5 3.7, 3.8, 7.8; C3 8.1; lead decision 14 |
| 12 | `## Air exchange` | Table (Item / Meaning): the pair (intake fan `SF-203` and exhaust fan `EF-206`, on together with the dampers open); short purges when CO₂ reaches the start level, stopped at the stop level or at the time cap; the size in the room's settings, `` `airM3h` `` (m³/h, default 1800; T11); **Your machines** on the **Simulate** tab records the room's machines and keeps `airM3h` equal to its air exchange size (a save that changes it stores a settings version `Air exchange size from Your machines`); the live room uses a new size at once in the controller and in the simulated room after its next restart; the `airTooSmall` alarm when purges keep hitting the cap. | C9 1, 4, 5; lead decisions 35, 55; C3 6.26; C2 4 |
| 13 | `## Tests and tools` | Table Command / Does: `npm test` (all tests; Node.js 22.13 or newer); `npm run vectors` (makes the recorded controller runs again after an intended controller change; no count of files); `npm run headless -- --days 2` (the controller and simulation without a browser or server). Only scripts of `package.json` (T2). | `package.json` |
| 14 | `## Files` | Table File / Part / Content. Every top-level file and folder (T6: `air.js`, `calib.js`, `capacity.js`, `controller.js`, `cycle.js`, `equipment.js`, `harvest-rules.js`, `index.html`, `package.json`, `room-rules.js`, `runtime.js`, `sim.js`, `styles.css`, `docs/`, `server/`, `tests/`, `tools/`, `web/`) and: `server/main.js`, `server/config.js`; `server/db.js`, `server/db-common.js`; `server/rooms.js`, `server/rooms-common.js`, `server/sim-adapter.js`; `server/api.js`, `server/api-common.js`, `server/static.js`; `server/harvest-schema.js`, `server/harvest-db.js`, `server/harvest-api.js`; `web/` with the files of C5 1.1 that stay after wave 3 (`shell.js`, `api.js`, `ui.js`, `charts.js`, `settings-panel.js`, `rooms.js`, `room-tabs.js`, `room-live.js`, `room-simulate.js`, `room-calibrate.js`, `room-equipment.js`, `batches.js`, `harvest.js`, `harvest.css`, `vendor/qrcodegen.js` (Nayuki QR Code generator, MIT), `simulator.js`); `farm.config.json` (optional, see "Start"); `data/farm.db` (made at the first start, not in git, never served); `tests/` (with `tests/fakes/` and `tests/vectors/`); `tools/`; `docs/`. No `app.js`; `web/capacity.js` and `web/calibration.js` are not listed (no longer loaded; the lead deletes them in wave 3, lead decision 29). | C5 1.1; C3 2.1, 9; C10 2 |
| 15 | `## Documents` | Table Document / Content, with links: `docs/contract.md`, `docs/contracts/db.md`, `docs/contracts/rooms.md`, `docs/contracts/api.md`, `docs/contracts/web.md`, `docs/contracts/cycle.md`, `docs/contracts/equipment.md`, `docs/contracts/air.md`, `docs/contracts/harvest.md`, `docs/phase3-plan.md`, `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`, `docs/superpowers/specs/2026-10-09-harvest-qr-design.md`. | – |
| 16 | `## Change the controller` | Steps table: change `controller.js`; run `npm test`; if the vector test fails and the change is intended, `npm run vectors`, then `npm test` again; restart the server so the rooms use the new controller. | Today's README |

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
Environment=TZ=Asia/Kuala_Lumpur
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
| Intro | Add: on the farm server, `server/rooms.js` runs this loop once per room (one adapter and one controller per room, ticked every second). A table (Contract / Content) with links to `contracts/db.md` (database), `contracts/rooms.md` (room manager and adapters), `contracts/api.md` (HTTP API and live feed), `contracts/web.md` (web modules and settings editor), `contracts/air.md` (air exchange). |
| Diagram | One line under it: on the server, each reading and its commands are recorded in `data/farm.db` (`readings`, `events`, `alarms`). |
| 1, row `t` | Notes: controller time; it must increase. On the farm server: seconds since 1970 UTC (the simulated adapter adds a time origin, `contracts/rooms.md` 13.2). In the Test bench and the test vectors: seconds from the start of the run (0). |
| 1, row `hour` | Notes: local time of day at the farm (Malaysia, UTC+8, no daylight saving), decimal hours. |
| 1, new rows after `T2` | Same columns, first cells exactly `` `power` ``, `` `kwh` ``, `` `runS` ``, `` `water` ``, `` `unfilteredM3` `` (T8). `power`: W, `{ ac, hu, air, lights, circ }`, optional: power of each machine now; the server stores the sum as `power_w`; leave it out without a meter. `kwh`: kWh, same keys, optional: energy of each machine since the adapter's meter started (it only grows); the server stores the sum as `kwh`. `runS`: s, `{ ac, hu, air }`, simulation only: machine run time. `water`: kg, `{ fogKg, acKg }`, simulation only: fogger water and AC condensate. `unfilteredM3`: m³, simulation only: air that came in unfiltered. A Notes cell says the controller ignores all five and the server ignores `runS`, `water`, `unfilteredM3`. |
| 1, after the table | One sentence: the server stores the values as the adapter gives them (no filtering), as the 18 keys of `contracts/db.md` 6.2 (`readings`, 4.2). |
| 2, after the table | The server records the commands of each reading (`ac_mode`, `ac_setpoint`, `fog`, `air`, `lights`, `circ`, and from upgrade 3 `ac_fan`; `ac_mode` is `off` when `ac.power` is off): `contracts/db.md` 4.2. |
| 2, "Rules for an adapter" | The numbered list becomes a table `# / Rule / Detail` with the same three rules, plus rule 4 "Time": on the farm server `t` is seconds since 1970 UTC and increases; `hour` is farm local time. Keep "These values are a proposal; confirm them for the farm." |
| 3, "A port must" | The numbered list becomes a table `Step / Action` (same text). |
| 4 | Replace "The same file is the configuration of a farm device." with a table "Where the format is used" (Use / Part of the file / Checked by): settings versions on the server (`room_settings`: the `settings` part only, one row per save; `upgradeSettings` then `importSettings` on every save and Restore, `contracts/rooms.md` 9.2, `contracts/air.md` 6.3); `GET` and `PUT /api/rooms/:id/settings` (the bare settings object, `contracts/api.md` 3.5); `tools/run-headless.js --settings <file>` (the whole file). |
| New 5 "Adapter on the farm server" | Table "Members" (Member / Required / Signature / Rules), five rows with first cells exactly `` `io.read()` ``, `` `io.write(cmd)` ``, `` `io.advance(dt)` ``, `` `view()` ``, `` `snapshot()` ``, content from `contracts/rooms.md` 12.1. Table "Factory arguments" (Argument / Type / Meaning): `room` (the room row `{ id, name, volume, adapter, created_at, archived_at }`, no `vent`), `calib`, `blocks`, `equipment` (the room's machines or `null`; the simulated room gets `env.plant` from it), `cfg` (the live settings; `cfg.airM3h` is the simulated room's air exchange size), `snapshot`, `now` (`contracts/rooms.md` 12.2, 13.1). Table "Timing" (Item / Value): tick every 1 s; physics in 1 s steps; one decision per new reading (30 s); catch-up up to 300 s, a longer pause is a gap; state saved every 300 s and at stop (`contracts/rooms.md` 13.2, 14). Table "Adding a hardware adapter (work item 3.2)" (Step / Action): a module that returns the same object (`view()` and `snapshot()` return `null`, no `io.advance`); a name in `rooms.adapter` (the column has no `CHECK`); a branch in `defaultAdapterFactory` of `server/rooms.js` (an unknown name stops that room with `Unknown adapter "<name>"`); today the server creates every room with `adapter: 'sim'`, so choosing another adapter is a contract change of 3.2; the adapter rules of section 2 (watchdog, keep the last command). |

### 5.3 `docs/phase3-plan.md` (edit)

| Where | Change |
|---|---|
| Status line | `Status: preparation done; farm app foundation built (covers 3.1, 3.3 and 3.7) on <date>.` with the date of your commit (`date +%F`), and a link to the spec. |
| Decisions, row "Dashboard and history" | Effect: built: the farm server (`server/`) serves the app and keeps the history in `data/farm.db`; works without internet. |
| Decisions, new row | "Live updates": Server-Sent Events (server to page); changes go back as HTTP requests. Effect: no WebSocket. |
| Hardware option A | "Control loop": the farm server as it is (Node.js 22.13 or newer). |
| Work items table | A `Status` column after `Size`. 3.1 `Covered by the foundation, except a CSV export of a room's history`; 3.3 `Covered by the foundation, with the simulated adapter`; 3.7 `Covered by the foundation`; 3.2, 3.4, 3.5, 3.6, 3.8 `Open` (exactly). Notes of 3.1: settings saved per room as versions with Restore; the Test bench's JSON export and import replaced by Load/Save settings from/to a room; the Test bench keeps its sample-log CSV; no CSV export of a live room's readings. Notes of 3.3: `server/` with SQLite history and Server-Sent Events instead of WebSocket; a hardware adapter (3.2) plugs in through `docs/contract.md` section 5. Notes of 3.6: add that harvest weights are now recorded per batch and crate (C10, **Batches**), so kWh per kg can use them; status stays `Open`. Notes of 3.7: one loop per room on the server; the Rooms home is the overview. |
| "Suggested order" | `Done: 3.1, 3.3, 3.7. Next: 3.8 → 3.2 → 3.4 → 3.5 → 3.6.` |
| "Preparation that is done" | The bullet list becomes a table (Item / Content). New row "Farm app foundation" with links to the spec and the contracts (`docs/contracts/`); new row "Batches and harvest" with links to the harvest spec and `docs/contracts/harvest.md`. Drop the stale count "66 tests" (write `npm test` without a count) and the count of vector files. |
| "Findings to remember" | Row "New defaults (review 3)": replace the steady fresh-air fan text with the C9 air exchange: short purges by an intake and exhaust pair (`docs/contracts/air.md`). Room capacity row: replace the sentence about browser storage and "work item 3.1 should use the same key prefix" with: rooms are now on the farm server; the Rooms home imports the rooms of `mushroom-farm.rooms.v1` once and marks the import with `mushroom-farm.rooms.v1.imported`. Other findings and the open questions stay unchanged. |

## 6. Tasks (TDD order: failing test first)

Commit after each task that ends green, on `stream/docs`. Message prefixes: `test(docs):`, `docs(readme):`, `docs(contract):`, `docs(phase3):`.

| # | Task | Steps | Expected result |
|---|---|---|---|
| 0 | Before you start | The checks of section 2. Read `server/main.js` and `server/config.js` (exact messages, defaults, signals) and `server/sim-adapter.js` (keys of the adapter and of `io.read()`). Read C5 3.2, 3.4, 3.8, 3.10–3.12, 7.8 and C10 11–12 for the pages you describe. | Checks pass or are reported. N and S written down. |
| 1 | README tests (red) | Create `tests/docs.test.js` with the header and T2–T6, T10, T11, T12. Run `node --disable-warning=ExperimentalWarning --test tests/docs.test.js`. | T3 fails (`Node.js 20`); T4 fails (no `FARM_PORT`); T5 fails (no `ExecStart=`); T6 fails (`app.js`, ``Open `index.html` ``, missing `server/`, `web/`, `room-rules.js`, `cycle.js`, `equipment.js`, `harvest-rules.js`); T10 fails (no Reading key rows); T11 fails (no `All good`); T12 fails (no Upgrade table). T2 may pass. No commit. |
| 2 | README (green) | Rewrite `README.md` as 5.1. Run the file. | T2–T6, T10–T12 pass. Commit `docs(readme): farm server, rooms, batches and stickers, upgrades, run at boot in farm time, backup and restore` with the test file. |
| 3 | contract tests (red) | Add T7 and T8. Run the file. | T7 fails (`view()`, `snapshot()`, `io.advance(` missing); T8 fails (`power`, `kwh`, `runS`, `water`, `unfilteredM3` missing). |
| 4 | contract.md (green) | Edit `docs/contract.md` as 5.2. Run the file. | T2–T8, T10–T12 pass. Commit `docs(contract): adapter on the farm server, reading extras, server time`. |
| 5 | phase3 test (red) | Add T9. Run the file. | T9 fails (no `Status` column). |
| 6 | phase3-plan.md (green) | Edit `docs/phase3-plan.md` as 5.3. Run the file. | T2–T12 pass. Commit `docs(phase3): mark 3.1, 3.3 and 3.7 covered by the farm app foundation`. |
| 7 | Prove the README by doing it | Run section 6.1 in order; fix the README where reality differs (for example the `-wal` file after a clean stop, a message text). Also run `npm start` once without `FARM_HOST` and note the printed lines; stop with Ctrl+C. | Every expected result of 6.1 holds, or the README says what really happens and the difference is in your report. Commit `docs(readme): match the server's real behaviour` if anything changed. |
| 8 | Links (red, then green) | Add T1. Run the file; fix any dead link in the three documents. | T1–T12 pass. Commit `test(docs): relative links resolve`. |
| 9 | Both trees | Check T4 and T12 against a tree with the later code by reading them: T4's harvest check runs only when `main.js` holds `openHarvest`; T12's loop follows `UPGRADES`. No other check reads another stream's code. | Written down in the report (section 10, row "Both trees") |
| 10 | Full check | Section 7. | All green. |

### 6.1 Manual checks for Task 7 (Linux shell, in the worktree)

```bash
TMP=$(mktemp -d); PORT=18080; DB=$TMP/farm.db
# 1 start (setsid: own process group, so step 4 is like Ctrl+C in a terminal)
FARM_HOST=127.0.0.1 FARM_PORT=$PORT FARM_DB=$DB setsid npm start > $TMP/out.log 2>&1 & PID=$!
sleep 3; cat $TMP/out.log
# 2 the demo room
curl -s http://127.0.0.1:$PORT/api/rooms
# 3 backup while running, and the schema version (skip if sqlite3 is not installed; say so in the report)
sqlite3 $DB ".backup '$TMP/backup.db'" && sqlite3 $TMP/backup.db "SELECT id, name FROM rooms" && sqlite3 $DB "SELECT MAX(version) FROM schema_version"
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
# 8 the unit file (if systemd-analyze exists): the README's unit, Environment=TZ line included, with User=$USER and WorkingDirectory=$PWD
systemd-analyze verify $TMP/mushroom-farm.service
```

| Step | Expected |
|---|---|
| 1 | `out.log` has `Open http://127.0.0.1:18080` and no `ExperimentalWarning` |
| 2 | A JSON array with one room: `"id":1`, `"name":"Room 1"`, `"adapter":"sim"`, no `"vent"`, a `live` object |
| 3 | `1\|Room 1`, then `2` (the schema version of the prep 2.0 tree; after gate 2.5 it is `4`: the README's upgrade table describes the merged code, not this number) |
| 4 | `exit 0`; `ls` shows which of `farm.db`, `farm.db-wal`, `farm.db-shm` remain: write this into README row 9 |
| 5 | The events include `Resumed after 0 min stopped` (state saved at the stop), not a new `Started` |
| 6 | `Room 1` again |
| 7 | `404`; `data/` removed afterwards, so `git status` stays clean |
| 8 | No errors about the unit's syntax, `Environment=` accepted (a warning that the user does not exist here is fine); if `systemd-analyze` is missing, say so |

## 7. How to verify

| Command | Expected |
|---|---|
| `node --disable-warning=ExperimentalWarning --test tests/docs.test.js` | 12 tests, all pass |
| `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail\|skipped)'` | `# tests` = N + 12; `# fail 0`; `# skipped` = S (the prep 2.0 skips, unchanged) |
| `node --test tests/vectors.test.js` | Every vector test passes (the count is `master`'s) |
| `git diff --exit-code master...HEAD -- tests/vectors/` | No output, exit code 0 |
| `git diff --name-only master...HEAD` | Exactly `README.md`, `docs/contract.md`, `docs/phase3-plan.md`, `tests/docs.test.js` |
| `grep -n "require(" tests/docs.test.js` | Every repo `require` inside a test or helper function, none at the top level (only `node:test`, `node:assert/strict`, `node:fs`, `node:path` there) |
| `git log --format=%B master..HEAD \| grep -ci 'co-authored'` | `0` |
| `git branch --show-current` | `stream/docs` |
| `git status --porcelain` | Empty (no `data/`, no temporary files) |

## 8. Done when

| # | Check |
|---|---|
| 1 | `tests/docs.test.js` has T1–T12 with the exact names of section 4, and each was seen failing before its document was written |
| 2 | `README.md` has the 16 sections of 5.1 (Mushroom farm, Install, Start, Open from a phone, Run at boot (Linux), What is stored, Database upgrades, Harvest stickers, Back up the data, Restore a backup, Moving from the old page, Air exchange, Tests and tools, Files, Documents, Change the controller); every structured item is a table |
| 3 | The README names the Rooms home, the three tabs, the Test bench, simulation runs, the equipment check, the air exchange (C9), upgrades 2, 3 and 4 and their one-time delay, backups, the stickers page with the fixed farm address advice, and `TZ=Asia/Kuala_Lumpur` for the service (wave 2 plan 3, Docs row) |
| 4 | `docs/contract.md` has the changes of 5.2, including section 5 "Adapter on the farm server" with the `equipment` factory argument |
| 5 | `docs/phase3-plan.md` has the changes of 5.3; 3.1, 3.3 and 3.7 are `Covered…`, the others `Open` |
| 6 | Every step of 6.1 was run, or its absence is reported; the README matches what the server did |
| 7 | Section 7 holds: N + 12 tests, `# fail 0`; `tests/vectors/` unchanged; only the four owned files changed; `git status` clean; plain commits on `stream/docs`, nothing pushed |
| 8 | The report of section 10 is sent to the lead |

## 9. What NOT to do

| Do not | Instead |
|---|---|
| Change any file outside section 3 | Report the needed change to the lead |
| Run `npm run vectors` | Never needed for docs; it rewrites `tests/vectors/` |
| Commit `data/`, a database file, `farm.config.json` or temporary files | `mktemp -d` and `FARM_DB`; `rm -rf data` after step 7 |
| Test prose wording | Test only facts the code or a frozen contract defines (names, scripts, members, keys, links, status values) |
| Write a check that holds only after another stream's merge (for example `Cannot open the harvest records:` in `main.js`, or `UPGRADES` having version 4) | The conditional forms of T4 and T12 |
| `require` a repo module at the top of `tests/docs.test.js` | Inside the test or a helper |
| Describe logins, Telegram, cloud sync, readings clean-up, a CSV export of live history or a harvest export as present | Name them as later work items |
| Write `vent`, a `fan` Reading key, the **Capacity** or **Calibration** menus, or a vector count | The C9 words (`air`, air exchange), the room tabs, "the recorded controller runs" |
| Promise behaviour you did not run (backup, restore, clean stop) without saying so | Run 6.1, or list it under "Not verified" |
| Write paragraphs for lists of steps, settings, messages, keys, statuses, upgrades or files | Tables with consistent columns |
| Add npm dependencies, a docs generator or a Markdown linter | Plain Markdown and `node:test` |
| Link to web files of other wave 2 streams | Name them in backticks |
| Document an adapter member that C2 12.1 does not list just to make T7 pass | Report the extra member to the lead as a contract difference |

## 10. Report to the lead (your final message)

| Item | Content |
|---|---|
| Files | The four owned files, one line each on what changed |
| Tests | N before, N + 12 after, `# fail 0`, `# skipped` S unchanged; the vectors diff result |
| Manual checks | The result of each step of 6.1 (pasted output lines), including which `farm.db-*` files remained after a clean stop, the schema version, and the lines printed without `FARM_HOST` |
| Both trees | How T4 and T12 hold on your branch and after the merges (Task 9) |
| Task 0 checks | Any that failed |
| Differences | Every place where the code differs from C1, C2, C3, C5 or C10 (message text, default, signal handling, adapter members), and what the README now says |
| Not verified | Anything you could not run (no `sqlite3`, no `systemd-analyze`, no phone, the pages of other streams) |
| Commits | `git log --oneline master..HEAD` |

Decisions this brief makes beyond the contracts (the lead may strike them before dispatch):

| # | Decision | Why |
|---|---|---|
| D1 | The Docs stream owns `tests/docs.test.js` | TDD needs a test; it keeps the docs from drifting from `package.json`, `server/main.js`, `server/config.js`, `server/db.js` and the adapter |
| D2 | 3.7 "More than one room" is also marked covered | C2 runs one loop per room; the Rooms home is the overview page of 3.7 |
| D3 | 3.1 is "Covered … except a CSV export of a room's history" | The foundation has no CSV export of a live room's readings |
| D4 | A `Status` column with `Covered…` / `Open` | Machine-checkable by T9 |
| D5 | A systemd unit with `Restart=on-failure`, `RestartSec=5`, `Environment=TZ=Asia/Kuala_Lumpur`, and `node` run directly | C3 2.2 "Service" (restart on failure, the farm time zone, lead decision 67); `npm` in the unit could pass the stop signal on twice, and a second signal exits at once with code 1 |
| D6 | Two backup ways only: a stopped copy and `sqlite3 .backup` | The spec names both; a Node one-liner needs different quoting per shell |
| D7 | T4 and T12 check later code conditionally (`openHarvest` in `main.js`; the versions in `UPGRADES`) | Docs merges after gate 2.5 but is tested on prep 2.0 `master`; `master` must stay green between merges |
| D8 | Contract-defined facts that have no code on your branch (the 18 Reading keys as README rows, the room statuses, upgrades 2–4, `#/harvest/stickers`, `fixed address`, `TZ=Asia/Kuala_Lumpur`) are checked in the README text only (T10–T12) | Wave 2 plan 8 row `docs.md` asks the test to check them; their code arrives with other streams |
| D9 | New README sections "What is stored", "Database upgrades", "Harvest stickers" and "Air exchange" | One place each for the 18 keys (T10), the upgrades and their one-time delay (C1 4.4, wave 2 plan 9), the C10 14 Docs items and C9 |

## 11. Change log

| Revision | Date | Changes |
|---|---|---|
| 0 | 2026-10-08 | First brief (wave 2 before the room-centred app, C9 and C10): T1–T9 |
| 1 | 2026-10-09 | Rewritten on the frozen wave 2 contracts (C1 6, C2 9, C3 9, C5 8, C8 3, C9 2, C10 2; lead decisions 1–69): worktree and branch `stream/docs` after prep 2.0, Docs merges 9th in wave 3, `master` stays green (conditional checks); README menu Rooms · Batches · Test bench, the room tabs, simulation runs, the equipment check, the air exchange, What is stored with the 18 Reading keys, Database upgrades 2, 3, 4, Harvest stickers, `Environment=TZ=Asia/Kuala_Lumpur` in the unit, `Cannot open the harvest records:`; T7 with the adapter-factory arguments `{ room, calib: null, blocks: null, equipment: null, cfg, snapshot: null, now }` and no `vent`; new T10–T12; `docs/contract.md` power and run-time keys with `air`, `ac_fan` recorded, the `equipment` factory argument; phase3 note on 3.6 |
| 2 | 2026-10-09 | Lead decision 74 cited (the points this brief settles) |

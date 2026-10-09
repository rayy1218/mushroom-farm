# Phase 3 plan: from test bench to farm product

Date: 2026-10-07. Status: preparation done; farm app foundation built (covers 3.1, 3.3 and 3.7) on 2026-10-09. See [the design](superpowers/specs/2026-10-08-farm-app-foundation-design.md).

## Decisions

| Subject | Decision | Effect |
|---|---|---|
| Dashboard and history | **On the farm network first.** Cloud later. | Built: the farm server (`server/`) serves the app and keeps the history in `data/farm.db`. It works without internet. |
| Live updates | **Server-Sent Events** (server to page); changes go back as HTTP requests. | No WebSocket. |
| Alarm channel | **Telegram.** | A bot sends the alarms to a group chat. It needs internet only for the messages. |
| AC link | **Not known.** Design for infrared first. | One-way link: repeat the command; the controller cannot read the AC state. |
| Controller hardware | **Open.** | See the options below. Nothing in the preparation depends on it. |

### Hardware options

| Option | Control loop | Dashboard, history, Telegram | Work |
|---|---|---|---|
| A. Raspberry Pi | The farm server as it is (Node.js 22.13 or newer) | Same Pi | Smallest. Needs a UPS and a plan for SD-card wear (read-only root, or an SSD). |
| B. ESP32 (Rust) + Pi | Rust port on the ESP32 (`esp-hal` or `esp-idf-svc`) | Small Pi or PC on the farm network | Port the controller (about 780 lines of code, without comments). The test vectors are the acceptance test. The ESP32 keeps control when the Pi stops. |
| C. ESP32 only (Rust or C++) | On the ESP32 | Simple page from the ESP32; history only a few days (flash) | Port, and a small dashboard. No SQLite. |
| D. PLC + Pi | PLC program (IEC 61131-3) | Pi | Most robust I/O, but the logic is rewritten. The JS version and the vectors are the specification. |

Recommendation: **A** for the first farm (fastest to a working room). Move to **B** if the farm wants the control
loop to keep running when the computer fails. The contract and the vectors make B possible later without a redesign.

## Work items

Size: S = hours, M = about a day, L = several days.

| # | Item | Depends on | Size | Status | Notes |
|---|---|---|---|---|---|
| 3.1 | Save, export, import settings in the page; export history as CSV | – | S | Covered by the foundation, except a CSV export of a room's history | Settings are saved per room as versions with Restore. The Test bench's JSON export and import are replaced by Load settings from a room and Save settings to a room. The Test bench keeps its sample-log CSV. There is no CSV export of a live room's readings. |
| 3.2 | Hardware layer | hardware choice, AC link | L | Open | Prepared: `runtime.js`, `simIO`, `docs/contract.md`. Next: adapters for sensors (for example RS-485 Modbus sensors), relays, infrared AC; watchdog and safe relay states. |
| 3.3 | Device service and history | 3.2 | L | Covered by the foundation, with the simulated adapter | `server/` with SQLite history (1 row per reading: about 1 million rows per year per room) and Server-Sent Events instead of WebSocket. A hardware adapter (3.2) plugs in through `docs/contract.md` section 5. `tools/run-headless.js` runs the same loop without a browser. |
| 3.4 | Telegram alarms | 3.3, a bot token | M | Open | Message on a new alarm, a reminder if nobody acknowledges in 15 min, acknowledge from the chat, quiet hours for warnings (not for critical alarms). |
| 3.5 | Users and the change log | 3.3 | M | Open | Farmer and installer roles with a PIN; a record of each setting change (who, when, old and new value). The two settings levels already exist on the page. |
| 3.6 | Energy reports | 3.3 | S–M | Open | kWh and RM per day and month for each machine; kWh per kg if the harvest weight is entered. Harvest weights are now recorded per batch and crate (C10, **Batches**), so kWh per kg can use them. |
| 3.7 | More than one room | 3.3 | M | Covered by the foundation | One loop per room on the server; the Rooms home is the overview page. |
| 3.8 | Bahasa Malaysia | – | M | Open | All page text in `en.json` / `ms.json`, a language switch, and a review by a native speaker. |

Suggested order. Done: 3.1, 3.3, 3.7. Next: 3.8 → 3.2 → 3.4 → 3.5 → 3.6.

## Preparation that is done

| Item | Content |
|---|---|
| `runtime.js` | One loop that connects any I/O adapter to the controller. The page, the 24 h test, the tests, the headless runner and the farm server all use it. |
| `docs/contract.md` | The reading, the commands, the adapter rules, the watchdog proposal, the vector format, the settings file, and the adapter on the farm server. |
| Settings file | Export, import with validation and warnings, apply without a restart (`tests/settings.test.js`). |
| Test vectors | Recorded scenarios of readings and commands (`tests/vectors/`, `tools/make-vectors.js`, `tests/vectors.test.js`). They are strict: a small change of the controller fails several files. |
| `package.json` | `npm test`, `npm start`, `npm run vectors`, `npm run headless`. |
| Farm app foundation | The farm server, the Rooms home and the room tabs. See [the design](superpowers/specs/2026-10-08-farm-app-foundation-design.md) and the contracts in [`docs/contracts/`](contracts/db.md). |
| Batches and harvest | Batches, crates and QR stickers per room. See [the harvest design](superpowers/specs/2026-10-09-harvest-qr-design.md) and [`docs/contracts/harvest.md`](contracts/harvest.md). |

## Open questions

1. Hardware: option A, B, C, or D?
2. AC: brand and model, and is there a remote with a known infrared protocol? A Modbus or Wi-Fi option?
3. Sensors: which models? (RS-485 Modbus sensors are robust over long cables.) A heated RH probe?
4. Watchdog safe state: agree with the proposal in `docs/contract.md` section 2?
5. Telegram: who receives the alarms, and are there quiet hours?
6. Rooms: how many rooms on the first farm?

## Findings to remember

| Finding | Content |
|---|---|
| New defaults (review 3) | The air exchange of C9 ([`docs/contracts/air.md`](contracts/air.md)): short purges by an intake and exhaust fan pair, in place of steady fresh air. |
| Crop capacity | With a 3.5 kW AC on a 33 °C day, golden oyster (24 °C) is in band only 70 % of the time; the other crops hold 100 %. The page checks this when a grower selects a crop, and the controller warns when the AC is at its limit. A setpoint inside the AC range (16–30 °C) does not prove that the AC is big enough. |
| Cold shock | A split AC cannot go below 16 °C. A crop with a lower shock gets a warning: the cold-water soak must give the shock. The shock repeats at each new flush. |
| AC rule during a purge | With steady fresh air, the rule rarely acts. In purge mode, "no AC rule" gave fewer compressor starts and less energy than a +1 °C setback. Measure one AC restart before the farm uses the rule. |
| Spare sensors | A spare sensor set must be next to the main set. In another position it measures other air (in the test, RH in band was 29 % with the spare at the inlet height, 100 % with it next to the main set). |
| Calibration | The farm log must record the machine states (also the circulation fan) at 1 min or less. With a supply fan that always runs, the air leakage cannot be measured, and it has no effect. |
| Dry weather | With steady fresh air, CO₂ stays below the limit, but the fogger cannot add water as fast as the dry air removes it (RH in band about 53 % with 4,000 blocks and 55 % night humidity). A larger fogger is necessary there. |
| Room capacity (2026-10-07) | A room passes between a minimum and a maximum number of blocks. In the default room (uncalibrated, supply fan), grey oyster holds about 3,650 blocks (limit: temperature on the hot-humid day); golden and black oyster also have an approximate minimum (about 600 and 1,170 blocks), because a nearly empty room of a cool crop stays above 95 % RH on humid and rainy days. RH above the target is not a failure (outdoor air on humid days is wetter than the target); near saturation is. The design days are estimates: replace them with MetMalaysia data. Rooms are now on the farm server; the Rooms home imports the rooms of `mushroom-farm.rooms.v1` once and marks the import with `mushroom-farm.rooms.v1.imported`. |

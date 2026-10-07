# Phase 3 plan: from test bench to farm product

Date: 2026-10-07. Status: preparation done; implementation not started.

## Decisions

| Subject | Decision | Effect |
|---|---|---|
| Dashboard and history | **On the farm network first.** Cloud later. | The device serves the page and keeps the history. It works without internet. |
| Alarm channel | **Telegram.** | A bot sends the alarms to a group chat. It needs internet only for the messages. |
| AC link | **Not known.** Design for infrared first. | One-way link: repeat the command; the controller cannot read the AC state. |
| Controller hardware | **Open.** | See the options below. Nothing in the preparation depends on it. |

### Hardware options

| Option | Control loop | Dashboard, history, Telegram | Work |
|---|---|---|---|
| A. Raspberry Pi | `controller.js` as it is (Node.js) | Same Pi | Smallest. Needs a UPS and a plan for SD-card wear (read-only root, or an SSD). |
| B. ESP32 (Rust) + Pi | Rust port on the ESP32 (`esp-hal` or `esp-idf-svc`) | Small Pi or PC on the farm network | Port the controller (about 780 lines of code, without comments). The test vectors are the acceptance test. The ESP32 keeps control when the Pi stops. |
| C. ESP32 only (Rust or C++) | On the ESP32 | Simple page from the ESP32; history only a few days (flash) | Port, and a small dashboard. No SQLite. |
| D. PLC + Pi | PLC program (IEC 61131-3) | Pi | Most robust I/O, but the logic is rewritten. The JS version and the vectors are the specification. |

Recommendation: **A** for the first farm (fastest to a working room). Move to **B** if the farm wants the control
loop to keep running when the computer fails. The contract and the vectors make B possible later without a redesign.

## Work items

Size: S = hours, M = about a day, L = several days.

| # | Item | Depends on | Size | Notes |
|---|---|---|---|---|
| 3.1 | Save, export, import settings in the page; export history as CSV | – | S | Prepared: `exportSettings`, `importSettings` (with validation), `applySettings`. Needs the buttons and browser storage. |
| 3.2 | Hardware layer | hardware choice, AC link | L | Prepared: `runtime.js`, `simIO`, `docs/contract.md`. Next: adapters for sensors (for example RS-485 Modbus sensors), relays, infrared AC; watchdog and safe relay states. |
| 3.3 | Device service and history | 3.2 | L | Node service on the Pi: runtime loop, SQLite history (1 row per reading: about 1 million rows per year per room), HTTP + WebSocket for the page. Prepared: `tools/run-headless.js` runs the same loop without a browser. |
| 3.4 | Telegram alarms | 3.3, a bot token | M | Message on a new alarm, a reminder if nobody acknowledges in 15 min, acknowledge from the chat, quiet hours for warnings (not for critical alarms). |
| 3.5 | Users and the change log | 3.3 | M | Farmer and installer roles with a PIN; a record of each setting change (who, when, old and new value). The two settings levels already exist on the page. |
| 3.6 | Energy reports | 3.3 | S–M | kWh and RM per day and month for each machine; kWh per kg if the harvest weight is entered. |
| 3.7 | More than one room | 3.3 | M | One runtime per room on the same device; an overview page. The controller and the simulation already make independent instances. |
| 3.8 | Bahasa Malaysia | – | M | All page text in `en.json` / `ms.json`, a language switch, and a review by a native speaker. |

Suggested order: 3.1 → 3.8 (both need no hardware) → 3.2 → 3.3 → 3.4 → 3.5 → 3.6 → 3.7.

## Preparation that is done

- `runtime.js`: one loop that connects any I/O adapter to the controller. The page, the 24 h test, the tests, and the
  headless runner all use it.
- `docs/contract.md`: the reading, the commands, the adapter rules, the watchdog proposal, the vector format, the
  settings file.
- Settings file: export, import with validation and warnings, apply without a restart (`tests/settings.test.js`).
- Test vectors: 8 scenarios, 721–1441 readings each (`tests/vectors/`, `tools/make-vectors.js`,
  `tests/vectors.test.js`). A change of one fogger threshold fails 3 of the 8 files, so the vectors are strict.
- `package.json`: `npm test` (66 tests), `npm run vectors`, `npm run headless`.

## Open questions

1. Hardware: option A, B, C, or D?
2. AC: brand and model, and is there a remote with a known infrared protocol? A Modbus or Wi-Fi option?
3. Sensors: which models? (RS-485 Modbus sensors are robust over long cables.) A heated RH probe?
4. Watchdog safe state: agree with the proposal in `docs/contract.md` section 2?
5. Telegram: who receives the alarms, and are there quiet hours?
6. Rooms: how many rooms on the first farm?

## Findings to remember

- **New defaults (review 3):** steady fresh air (the fan at Low all day, steps with CO₂) and a filtered supply fan,
  air in high and out low. Result: 0 fan starts and 0 AC starts per day, stable CO₂, no unfiltered air. Cost: about
  +1.5 kWh/day (13.7 against 12.2 kWh/day with the old purge and exhaust fan).
- **Crop capacity:** with a 3.5 kW AC on a 33 °C day, golden oyster (24 °C) is in band only 70 % of the time; the other
  crops hold 100 %. The page checks this when a grower selects a crop, and the controller warns when the AC is at its
  limit. A setpoint inside the AC range (16–30 °C) does not prove that the AC is big enough.
- **Cold shock:** a split AC cannot go below 16 °C. A crop with a lower shock gets a warning: the cold-water soak must
  give the shock. The shock repeats at each new flush.
- **AC rule during a purge:** with steady fresh air, the rule rarely acts. In purge mode, "no AC rule" gave fewer
  compressor starts and less energy than a +1 °C setback. Measure one AC restart before the farm uses the rule.
- **Spare sensors:** a spare sensor set must be next to the main set. In another position it measures other air
  (in the test, RH in band was 29 % with the spare at the inlet height, 100 % with it next to the main set).
- **Calibration:** the farm log must record the machine states (also the circulation fan) at 1 min or less. With a
  supply fan that always runs, the air leakage cannot be measured, and it has no effect.
- **Dry weather:** with steady fresh air, CO₂ stays below the limit, but the fogger cannot add water as fast as the dry
  air removes it (RH in band about 53 % with 4,000 blocks and 55 % night humidity). A larger fogger is necessary there.

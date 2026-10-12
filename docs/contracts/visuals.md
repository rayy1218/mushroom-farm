# Contract C13: UX wave 3 (visuals)

Date: 2026-10-12. Status: **frozen** (revision 1). Changes only through the lead (`docs/contracts/LEAD-DECISIONS.md`, decisions 102 on).
Source: `docs/reviews/2026-10-12-farmer-and-design-review.md` ("Where to visualize", findings 4, 6, 14, 15, 26, the form rule "Rules as labelled fields"), and the wave 2 leftovers. Builds on C11 (`ux.md`) and C12 (`layout.md`), whose classes, helpers and layout stay in force; **C13 wins** where they differ.

## 1. Streams

| Wave | Stream | Branch / worktree | Owns (only these files change) | Done when |
|---|---|---|---|---|
| prep | Lead | `ux/wave3` | `web/mimic.js` (stub), `web/plan.css` (stub), `index.html` tags, `tests/web-load.test.js`, this file | Built (stub `FarmMimic` loads; 1260 tests) |
| 1 | **Drawing** | `stream/ux3-drawing` | `web/mimic.js`, `web/simulator.js`, `styles.css` (the room drawing rules and the Test bench rules only), new `tests/web-mimic-shared.test.js`, `tests/web-mimic.test.js`, `tests/web-bench.test.js` if present | Section 2 and 6.3 built; the Test bench looks and works as before through `FarmMimic` |
| 1 | **Trends** | `stream/ux3-trends` | `web/charts.js`, `web/room-live.js`, `web/room.css`, `tests/web-charts.test.js`, `tests/web-room-live.test.js` | Section 3 built |
| 1 | **Plan** | `stream/ux3-plan` | `web/room-simulate.js`, `web/room-equipment.js`, `web/room-calibrate.js`, `web/plan.css`, their three `tests/web-room-*.test.js` | Section 4 built |
| 1 | **Yield** | `stream/ux3-yield` | `web/batches.js`, `web/harvest.css`, `tests/web-batches.test.js` | Section 5 built |
| 1 | **Rules** | `stream/ux3-rules` | `web/settings-panel.js`, `tests/web-settings-panel.test.js`, `tests/settings*.test.js` only where they pin panel markup | Section 6.1 built |

A stream never edits another stream's files; it asks the lead. Charts are hand-made inline SVG through `FarmUi.svgEl` (no libraries), follow the C11 tokens (`--s-ac`, `--s-hu`, `--s-air`, `--s-li`, `--s-ci` for machines, `--good/--warning/--serious/--critical` for status only, `--band`, `--trend`, `--grid`, `--axis`, `--muted`), work in light and dark, have a `role="img"` and an `aria-label` that says the main finding in words, and are readable at 390 px (a chart may scroll inside its own card, never the page). Every chart sits under a short heading that says what question it answers.

## 2. The shared room drawing `FarmMimic` (Drawing stream; `web/mimic.js`)

The SVG of the Test bench (`MIMIC_SVG`, `mimicLayout`, the painting and animation code in `web/simulator.js`) moves into `web/mimic.js`. `web/simulator.js` keeps building its state from the simulator and calls `FarmMimic`; it must look and animate as today.

| Member | Contract |
|---|---|
| `FarmMimic.create(host, { idPrefix })` | Puts the drawing into `host` and returns `{ paint(state), tick(dtSeconds), destroy() }`. All element ids inside the SVG carry `idPrefix` (default `''` for the Test bench, so its ids stay as today); the room page uses `rm-`. `destroy()` removes the SVG and every listener. Two drawings can live on one page. |
| `paint(state)` | Paints a **DrawState** (below). Unknown or `null` parts are drawn as "no data" (dashes, units off), never throw. Cheap enough to call on every reading. |
| `tick(dt)` | Advances the animation (fans, compressor, mist, CO₂ bubbles, air flows) by `dt` seconds of real time from the last painted state. Does nothing when `matchMedia('(prefers-reduced-motion: reduce)')` matches. The caller owns the frame loop. |
| `FarmMimic.layout({ inletAt, exhaustAt })` | Today's `mimicLayout` (unchanged rules and tests). |
| `FarmMimic.fromReading({ reading, live, room, settings, level })` | Pure. Builds a DrawState for a real room from the newest C3 Reading, the room's Live, the Room and its stored settings (may be `null`). `level` = `farmer` hides the sensor and machine codes (TT-101, ACU-201, …) and shows plain names. Returns `null` when `reading` is `null`. |

**DrawState** (all fields optional; text fields are drawn as given, the painter computes no words):

| Field | Meaning |
|---|---|
| `title` | Stage line top right, for example `Grey oyster · Fruiting` (the bench adds ` · SANDBOX`). |
| `roomLine`, `airLine`, `powerLine` | The three small lines under it (`Room 1 · 60 m³`, `Fresh air 0.4 changes an hour`, `Power now 432 W · 12.8 kWh today`). |
| `out` | `{ T, RH }` outdoors, or `null`. `night` boolean (sun or moon). |
| `T`, `RH`, `CO2` | Numbers or `null`; drawn in the three readouts with their units. |
| `status` | `{ T, RH, CO2 }`, each a chip `{ lvl, icon, text }` or `null`; `lvl` colours the readout. |
| `zones` | `{ lo: { T, RH, C }, hi: { T, RH, C } }` or `null` (the bench has them; a real room has not). |
| `units.ac` | `{ on, run (0–1, compressor and air-flow speed), state, sub, manual }` |
| `units.cond` | `{ on, state }` (outdoor condenser) |
| `units.hu` | `{ level (0–3, mist amount), state, sub, manual }` |
| `units.air` | `{ on, state, manual, inletAt, exhaustAt }` (both fans and dampers) |
| `units.circ`, `units.lights` | `{ on, state, manual }` |
| `blocks`, `core` | Block count text and core temperature text (`2,000 blocks`, `Core 27.4 °C`). |
| `co2Rate` | 0–1, the bubble amount. |
| `stage` | `spawn`, `pinning`, `fruiting`, `rest` (cap size). |
| `codes` | `true` shows the equipment and sensor codes; `false` shows plain names (`Aircon`, `Mister`, `Fresh-air in`, `Fresh-air out`, `Fan`, and no TT/MT/AT bubbles). |
| `note` | Free text top right (the bench's disturbances). |

A unit with `manual: true` shows a small `MANUAL` tag next to it (the C11 manual chip look).

**`fromReading` rules:** AC `on` = `ac_mode !== 'off'`; `run` = 1 when on and `power_w` is above 150 W, else 0.3; `state` = `Cool 25.0 °C` style (C11 machine tile words); `sub` empty. Mister `level` = `fog`, `state` `Level 2` / `Off`. Air `on` = `air === 1`, positions from settings (`inletAt`/`exhaustAt` when present, else high/low). Lights, circ from the reading. `manual` from `live.manual`. `status` from `live.status` through `FarmUi.plainChip` when `level` is `farmer`. `title` from crop and stage names; `roomLine` `<name> · <volume> m³`; `airLine` from `settings.airM3h / room.volume` when the air is on, else `Fresh air off`; `powerLine` from `power_w` and the meter. `blocks` from `live.blocks`; `core` from the reading; `co2Rate` from `live.blocks` (0 → 0, 2000 or more → 1). `out` from `t_out`, `rh_out`; `night` from the farm hour (19:00–07:00).

## 3. Trends (Trends stream)

### 3.1 Room Overview tab (`web/room-live.js`, `web/room.css`)

| Part | Rule |
|---|---|
| Room drawing | A `figure.card.room-drawing` at the top of the tab, full width, with `FarmMimic.create(host, { idPrefix: 'rm-' })`; painted from `FarmMimic.fromReading(...)` on every reading and on level change; animated with one `requestAnimationFrame` loop that stops on unmount and while `document.hidden`. Under 720 px it is replaced by the C11 machine tiles (the tiles stay as they are on all widths below the drawing; on desktop the tiles move under the drawing as a compact row). |
| Machine timeline | Under the three trend charts, one `section.card.machine-timeline` for the same window as the trends (1 h, 6 h, 24 h, 7 days): one row per machine (Aircon, Mister, Fresh air, Lights, Circulation fan) with filled spans where the machine was on, in its machine colour; the Mister row shades by level (1–3); the Aircon row is on/off. Shares the trends' x axis and the hover line (C5 6.1 hover). Built by `FarmCharts.drawMachineTimeline(host, rows, { from, to, clock })` from the same readings the trends use (averaged rows: on when the bucket's mean is ≥ 0.5 for `air`, `lights`, `circ`; `fog > 0`; `ac_mode !== 'off'`). |
| Duplicate air line | The loose `Fresh air · Idle · Purges 0` glance row under the Fresh air card goes (the card says it). |
| Sensor codes | In the trend cards the sensor-code line (`TT-101 · outdoor OT-104`) gets `data-level-only="installer"`. |
| Versions card | (C12 leftover) On the Settings tab, Settings versions no longer leaves an empty half row at 1440 px: it spans the full row (`room.css`, which Trends owns). |

### 3.2 `web/charts.js`

`drawMachineTimeline` (above) and its pure helper `machineSpans(rows, key, test)` → `[{ from, to, level }]`, merging consecutive buckets; exported on `FarmCharts` and unit-tested. Nothing else in `charts.js` changes behaviour, except that the power chart's white zig-zag separator strokes between stacked areas are removed (review finding 15).

## 4. Plan (Plan stream; `web/room-simulate.js`, `web/room-equipment.js`, `web/room-calibrate.js`, `web/plan.css`)

| Screen | Chart | Rule |
|---|---|---|
| Simulate → Check capacity | **Capacity bullet** `figure.cap-bullet` | A horizontal bar from 0 to the largest block count tried: zones `Too empty` (below the pass window), `Fits` (the pass window), `Too full` (above), labelled under the bar; a marker for **your plan** (the mix's block count) with its number; a thin marker for the room's most efficient count if the result has it. Heading `Does your plan fit this room?`; the verdict sentence under it in words (`2,000 blocks fit. The room holds up to 3,652.`). Replaces the old 8 px bar. The design-day table stays below, collapsed in a `details` `Show the three design days`. |
| Simulate → Run full cycle | **Cycle chart** `figure.cycle-gantt` | X axis in days from day 0; a band row per stage (Spawn run, Pinning, Fruiting, Rest) with the stage colours from `--band` steps (not machine colours), flush markers (▼ with `Flush n`), and under it daily energy bars (kWh per day, `--s-ac` for the aircon share if the result gives a split, else `--trend`). Heading `Your grow cycle, day by day`; under it total energy and RM. Replaces the unlabelled stage table, which stays collapsed (`Show the stage table`). |
| Your machines → Check | **Aircond sizes** `figure.ac-sizes` | One group per size tried: a bar for % of time in band (0–100) and a bar for RM per block; the room's own size outlined and labelled `yours`, the recommended size labelled `recommended`. Heading `Which aircond size works?`. The heat breakdown becomes one 100 % stacked bar (`Where the heat comes from`) with a legend. The tables stay collapsed. |
| Calibrate → after Fit | **Fit quality** `figure.fit-quality` | For T, RH and CO₂: two bars, error before (typical values) and after (fitted) as RMSE in the unit, with a verdict word per row (`Good` ≤ 0.5 °C / 3 % / 80 ppm, `Fair` ≤ 1.0 / 6 / 150, else `Poor`; lead decision 103) and a one-line summary (`The fitted room follows your readings closely.`). Sits above the existing overlay charts. |

Each chart's numbers come from the result objects these tabs already have (no new API calls); a stream that finds a needed number missing from a result says so in its report rather than computing physics in the page. Pure helpers exported and tested (`bulletZones(report)`, `cycleDays(result)`, `sizeGroups(report)`, `fitVerdict(kind, rmse)`).

## 5. Yield (Yield stream; `web/batches.js`, `web/harvest.css`)

| Screen | Chart | Rule |
|---|---|---|
| Batch page | **Flush chart** `figure.flush-chart` | One bar per flush (kg), labelled with kg and g per block; a line over them for cumulative BE % with its own right-hand axis; heading `Harvest per flush`; summary `Flush 2 gave 40 % less than flush 1.` (the drop from the best flush, when there are 2 or more). Above the flush table, which stays. |
| Batches → Growing tab | **Room timeline** `figure.room-timeline` | One row per room; each placed batch is a bar from its placed date to today (or its cleared date on Finished), labelled with the mushroom and `Flush n`; today as a vertical line; a click on a bar opens the batch. Heading `What is growing where`. Above the list table. Rooms with nothing growing show an empty row `Empty`. |

## 6. Other

### 6.1 Rule editor as labelled fields (Rules stream; `web/settings-panel.js`)

Every rule that reads as a sentence with inputs in it becomes C11 `.field`s with label above, unit as `.unit`, and the computed absolute value as `.field-help`. For example Priority 2: **Delay purges below** `[3] %` under target, help `= 85 % now`; **Resume above** `[1] %` under target, help `= 87 % now`. Priority 1: **Safety level** `[1500] ppm` with the checkbox `Run the fresh air above this level` as a `.chk`. Same for Priority 3 and the AC and fogger rule groups. Ids, settings paths, limits, the diff and the save flow do not change; tests that pin markup are updated, not deleted.

### 6.2 Words

Charts use the farmer words of C11 and C12 (Aircon, Mister, Fresh air, `OK`, `Too full`). Numbers with units, thousands separators (`3,652`), one decimal for kg and kWh, two for RM.

### 6.3 Test bench 24 h test (Drawing stream; `web/simulator.js`)

The 16-column rule-comparison table becomes **difference bars**: for each rule set compared with `Your rules`, bars for the change in time in band (percentage points) and in energy (kWh), green when better, `--serious` when worse, a `No difference` label when every change is under 0.5; heading `How do the other rules compare?`. The table stays collapsed below.

## 7. Checks for every stream

| Check | How |
|---|---|
| Unit tests | `npm test` passes in the stream's worktree; pure helpers exported and tested. |
| Headless | Server from the worktree: `FARM_PORT=<port> FARM_DB=/tmp/uxw3/<stream>.db node --disable-warning=ExperimentalWarning server/main.js` (Drawing 8111, Trends 8112, Plan 8113, Yield 8114, Rules 8115); it prints its LAN URL. Drive it with `/tmp/uxreview/node_modules/playwright-core` and `/home/foqcus/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell`; set `localStorage['mushroom-farm.level']='installer'` where installer screens are needed. Seed through the API. Screenshot every changed screen at 1440×900 and 390×844, light and dark, into `/tmp/uxw3/<stream>/` and look at them. `scrollWidth` ≤ viewport; no console errors. Stop **only your own** server, by its PID. |
| Commits | On the stream branch; prefixes and layout are not reviewed. |

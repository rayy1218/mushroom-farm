# Harvest and yield: what each room picks and what it earns (iteration 22)

Date: 2026-11-04 · Branch `v2` · Builds on iteration 19 (Tasks), 14 (crop stage plan), 21 (Calendar) and the Usage tab.

The owner chose Harvest and yield as the next module (2026-11-04) and every row marked *owner*: a harvest recorded from the
harvest check's Done (as now) or a Record a harvest button, stamped with the room's crop, stage, flush and blocks; kg per
block, biological efficiency, RM value and cost per kg; the per-crop figures in Settings; a summary on the Crop tab, a
Harvest room tab, a farm Harvest page and an Overview card; runs of blocks kept; a CSV and a printable myGAP 4-6 sheet. The
owner then told the lead to go on without them (2026-11-04): the lead chose the rest.

## 1. Scope

| In | Out (later) |
|---|---|
| A harvest from the harvest check's Done: kg as now, one kg per crop in a mixed room *owner* | Grades (A/B), rejects, weight per piece |
| **Record a harvest** for picking outside the checks (a crop, kg, who, when) *owner* | Sales: buyer, invoice, price sold *owner* |
| Each harvest stamped with the room's run, crop, stage, flush and blocks of that crop *owner* | Blocks taken out partway through a run *owner* |
| Runs: each New blocks starts one; harvests belong to it, so past runs keep their figures *owner* | Spawn, substrate and batch records (myGAP 4-2) |
| Figures: kg, kg per block, biological efficiency, RM value, cost per kg *owner* | A yield forecast; comparing runs on a chart |
| Settings → Yield: per crop the dry substrate per block (kg) and the price (RM per kg) *owner* | Prices per grade or per buyer |
| Crop tab: one summary line; a **Harvest** room tab with the detail *owner* | Harvests on the Calendar beyond the task rows it shows now |
| A farm **Harvest** page, `#/harvest`, in the top bar *owner* | |
| An Overview card: kg today, 7 and 30 days, the 30-day value *owner* | |
| CSV of the harvests and a printable myGAP 4-6 sheet, sales columns blank *owner* | |
| Edit or delete a wrong harvest | |

## 2. Data (database version 20)

| Table | Columns | Rules |
|---|---|---|
| `runs` | `id`, `room_id`, `started_at` (ms), `ended_at` (ms, null while open), `crops` (JSON `[{ crop, blocks }]`), `partial` (0/1) | At most one open run per room (unique index where `ended_at IS NULL`). `partial`: the run was already under way at the upgrade, so it was recorded from then. |
| `harvests` | `id`, `room_id`, `run_id`, `crop`, `stage`, `flush`, `blocks`, `kg` (REAL), `picked_at` (ms), `worker`, `task_id` (null: recorded by hand), `created_at` | `kg` over 0 up to 10,000; `crop` one of the run's crops; `blocks` the run's blocks of that crop when picked; `flush` null only for a row copied at the upgrade. Index `(room_id, picked_at)` and `(picked_at)`. |

### 2.1 A run's life (in `crop-api.js` `put`, written with the program in one transaction: `db.setProgram(roomId, program, run)`)

| Change on the Crop tab | The run |
|---|---|
| Crops given to a room that had none | A run opens now with the crops |
| New blocks (a done room given crops again, or `newBlocks`) | The open run ends now and a new one opens now |
| The crops or block counts changed in a running room | The open run's `crops` follow (the harvests keep the blocks they were stamped with) |
| Crops cleared | The open run ends now |
| A stage change by hand or by the clock, more flushes, done | Nothing (a done run stays open until New blocks or a clear: the spent blocks may still give a late pick) |
| The room deleted | Its runs and harvests go with it; the Delete room card says "readings, history, crop, harvests and simulations" |

### 2.2 The upgrade (version 19 → 20)

| Step | Rule |
|---|---|
| Tables | `runs` and `harvests` made |
| Runs | Each room with crops gets an open run with its crops, `partial` 1, started at the upgrade or at its first copied harvest, whichever is earlier |
| Harvests | Each done harvest task row (`harvestAm`, `harvestPm`, `harvestDaily`, `reishiRim`) with kg over 0 becomes a harvest of that run: the first of the room's crops the rule is for, its blocks, stage as now, flush null, picked at the row's closed time, its worker and task id. A room with no crops now has nothing to copy them to: they stay task rows only. (The live farm had none with kg on 2026-11-04.) |

## 3. Recording

| Way | Rule |
|---|---|
| Done on a harvest check | The Done dialog asks one kg per crop when two or more of the room's crops are ones the rule is for ("Grey oyster kg", "Lion's mane kg"), else one "kg picked" as now. Each kg over 0 makes a harvest of that crop, stamped now, in the same transaction as the task's close; the task's `amount` is the total. Empty or 0: no harvest (0 stays on the task as now). |
| The task's open row | Carries `harvestCrops: [{ crop, name }]` (the room's crops the rule is for, in the room's order) so the dialog knows what to ask; null on other rows. |
| The API body | `POST /api/tasks/:id/done { worker, amount }` as now, or `{ worker, amounts: { <crop>: kg } }`. `amount` on a row with two or more harvest crops: 400 "Give the kg of each crop". A crop not in `harvestCrops`: 400. |
| Record a harvest | On the Harvest tab. Fields: crop (a picker when the run has two or more), kg, who (the worker picker, as Done), when (date and time, default now; not before the run started, not in the future). No crops in the room: the button is off with "Give the room its crops on the Crop tab first". |
| Edit | kg and when. A harvest from a check changes its task's `amount` to the new total of the task's harvests, in one transaction. |
| Delete | With a confirm ("Delete 2.4 kg of Grey oyster picked 4 Nov 08:12?"). A harvest from a check: the task's `amount` becomes the total of what is left, null when nothing is left. |
| Who | The tasks' worker check (`workerOf`): an active worker when the farm has a list. |
| Events | Every write publishes `harvest` `{ roomId }`; the Harvest tab, the Crop summary, the Harvest page and the Overview card read again. A Done on a harvest check also publishes the tasks events as now. |

## 4. The figures (`server/harvest-math.js`, pure)

| Figure | Rule |
|---|---|
| kg | The sum of the harvests in the group (a run, a flush, a crop, a period) |
| kg per block | kg ÷ the run's blocks of the crops in the group (the run's latest block counts). A period on the farm page: not shown (a period cuts across runs). |
| Biological efficiency (BE) | kg ÷ (blocks × dry substrate kg per block) × 100, whole %. Null when a crop in the group has no dry substrate figure; the page says "Set the dry substrate per block in Settings → Yield". |
| RM value | Σ kg of a crop × its price per kg. Null when a crop with kg has no price; the page names the crops. |
| Cost per kg | The room's electricity and water cost (the Usage tab's days, at today's prices, as Usage shows them) over the run's days (its start to its end or now) ÷ the run's kg. Null with no kg, or for a run that started over 400 days ago (the usage days kept). A farm period: the farm's cost over the period ÷ its kg. Water counts only when a water price is set ("electricity only" then). |
| A flush | The run's harvests of that flush number; its days from its first to its last pick. A copied harvest without a flush: a row "Before records" at the top. |
| A mixed room | Per-crop figures (kg, kg per block, BE, RM) and the room's totals; cost per kg only for the whole run (the room's energy is not split by crop). |
| Settings changed | The figures are worked out on each read, so a new dry substrate figure or price changes past runs too (the owner's choice); the Settings card says so. |

## 5. Settings → Yield

A card in Settings: one row per crop of the crop list (`web/crops.js`), columns **Dry substrate per block (kg)** and
**Price (RM per kg)**, each empty when not set. Dry substrate: 0.05–20 kg; price: 0–1,000 RM. Stored as one setting
`cropYield` (JSON `{ <crop>: { dryKg, priceKg } }`, `null` for not set), sent with `PUT /api/settings` like the others. The
card's note: "Biological efficiency is fresh kg over the dry substrate's kg. A 2.27 kg block at 60 % water holds about
0.9 kg dry. A change here changes the figures of past runs too."

## 6. API

| Route | Reply |
|---|---|
| `GET /api/rooms/:id/harvests` | `{ current, past }`: `current` the open run's view or null, `past` the ended runs newest first. A run's view: `{ id, startedAt, endedAt, partial, crops, kg, perBlock, be, value, cost: { costPerKg, cost, days, water } , byCrop: [{ crop, blocks, kg, perBlock, be, value }], flushes: [{ flush, from, to, kg, byCrop, perBlock, be }], missing: { dryKg: [crop], price: [crop] }, harvests: [row] }`. 404 for no such room. |
| `POST /api/rooms/:id/harvests` | `{ crop, kg, worker, pickedAt? }` → 201 the row. 400 for a bad field (with `field`), 409 "No crops in this room". |
| `PUT /api/harvests/:id` | `{ kg?, pickedAt? }` → the row. 404, 400. |
| `DELETE /api/harvests/:id` | 204. 404. |
| `GET /api/harvest?days=7\|30\|90\|365` | The farm: `{ from, to, days, bucket: 'day'\|'week'\|'month', buckets: [{ from, to, kg }], totals: { kg, value, cost }, rooms: [{ id, name, crops, kg, value, current: { kg, perBlock, be } }], crops: [{ crop, kg, value }], today, last7, last30, missing, records }`. `today/last7/last30`: `{ kg, value }` (the Overview card). `records`: the myGAP rows: one per day, room, crop and run `{ date, roomId, roomName, crop, runStartedAt, kg }`. Buckets: days for 7 and 30, weeks (Monday first) for 90, months for 365. Default 30; another value 400. |
| `GET /api/harvest.csv?days=…` | `date,time,room,crop,run started,stage,flush,blocks,kg,worker,from` (from: "harvest check" or "recorded"), oldest first, with the BOM and the formula guard of the tasks CSV; file name `harvests <from>–<to>.csv`. |
| `POST /api/tasks/:id/done` | Section 3. |
| Task views | Open harvest rows gain `harvestCrops` (section 3). |

## 7. The pages

| Part | Design |
|---|---|
| Crop tab summary | One line in the program card under the stage plan (a room with crops): "Flush 2 · 18.4 kg this run · 0.31 kg per block · BE 34 %" (the figures that are known), then the link **Harvests** to the Harvest tab. No harvest yet: "No harvests recorded in this run yet." |
| Harvest room tab | `#/rooms/7/harvest`, between Tasks and Simulations, the basket picture's tab. Head: **Record a harvest**. **This run** card: started ("Blocks in 3 Oct" or "Recorded from 4 Nov" when partial), the crops and blocks, the tiles kg, kg per block, BE, RM value, cost per kg ("RM 3.10 per kg · electricity and water over 46 days at today's prices"); the flushes table (Flush, Days, kg, kg per block, BE; a mixed room adds a kg column per crop and a By crop table); a missing-figure note linking to Settings → Yield. **Harvests** card: the run's harvests newest first: when, crop (in a mixed room), flush, kg, who, "from the harvest check" or "recorded", Edit and Delete. **Past runs** card: a row per run (dates, crops, blocks, kg, kg per block, BE, RM, cost per kg), each opening (a details) to its flushes and harvests. No run ever: "No harvests yet. They are recorded from the harvest checks on the Tasks tab, or with Record a harvest." |
| Harvest page | `#/harvest`. Head: "Harvest", the range (7, 30, 90, 365 days; a segmented control), **Export CSV**, **myGAP sheet**. Tiles: kg, RM value, cost per kg. A bar chart of kg per day, week or month in a new series hue `--s-harvest` (both themes). Tables: By room (room with its crop picture, kg, RM; the current run's kg per block and BE), By crop (crop picture and name, kg, RM). No harvest in the range: "No harvests in the last 30 days." |
| myGAP sheet | `#/harvest/sheet?days=30`, a print page: title "myGAP 4-6 · Production and sales record (Rekod pengeluaran dan penjualan hasil)", the farm's name, the dates; the table Date, Crop, Block / location (room · run of 3 Oct), Harvested (kg), Sold (kg), Price / kg (RM), Total (RM), Invoice No., Buyer; the last five blank to write in; a **Print** button (hidden in print); light colours and no top bar in print. |
| Overview card | "Harvest" beside Energy: kg today, 7 days, 30 days, and the 30-day RM value when known; the title links to the Harvest page. No harvest in 30 days: "No harvests in the last 30 days." |
| Top bar | **Harvest** (the basket icon and the word; the icon alone on a phone) between Calendar and Overview. The Navigation Rule names it. |
| Done dialog | Section 3: the kg fields, each with "Leave it empty if it was not weighed." |
| Numbers | One formatter (`web/harvest-math.js`): kg to 1 decimal for totals and up to 2 for a harvest (2.35 kg), kg per block to 2 decimals, BE whole %, RM 2 decimals with grouping (RM 1,240.50), cost "RM 3.10 per kg". |

## 8. Testing

| Test | Covers |
|---|---|
| `tests/harvest-math.test.js` (pure) | kg per block, BE, RM and cost per kg for one crop and a mixed room; missing figures; flushes with the "Before records" row; buckets by day, week and month |
| `tests/db-harvest.test.js` | The upgrade from 19 (runs for rooms with crops, copied rows, partial), the run's life with `setProgram`, the unique open run, delete room |
| `tests/harvest-api.test.js` | Done with amount and amounts (mixed room), the 400s, the task total after edit and delete, Record a harvest (time limits, no crops 409), the room and farm views, the CSV, the `harvest` events, `harvestCrops` on views |
| `tests/crop-api.test.js` (added) | Crops given, New blocks, a block count change, crops cleared: the run |
| `tests/settings.test.js` (added) | `cropYield` checks and read-back |
| `tests/web-harvest-math.test.js` | The formatter, the summary line, the sheet rows, the flushes table's columns |
| Look | 1440 and 390 px, both themes: the Harvest tab, the Harvest page, the sheet in print, the Overview card, the Done dialog in a mixed room, the top bar at 360 px; the detector on the changed files |

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
| Done on a harvest check | The Done dialog asks one kg per crop when two or more of the room's crops are ones the rule is for (a fieldset "kg picked" with one hint, "Leave a box empty if that crop was not weighed.", then a box per crop named by its picture and name, "kg" inside a narrow box, two a row from 360 px; audit #15), else one "kg picked" box with "kg" inside it, as Record a harvest's (the bags box has none). Each kg over 0 makes a harvest of that crop, stamped now, in the same transaction as the task's close; the task's `amount` is the total. Empty or 0: no harvest (0 stays on the task as now). |
| The task's open row | Carries `harvestCrops: [{ crop, name, blocks }]` (the room's crops the rule is for, in the room's order, with the open run's blocks of each, which a harvest of it is stamped with) so the dialog knows what to ask and can check a pick; null on other rows. |
| The API body | `POST /api/tasks/:id/done { worker, amount }` as now, or `{ worker, amounts: { <crop>: kg } }`. `amount` on a row with two or more harvest crops: 400 "Give the kg of each crop". A crop not in `harvestCrops`: 400. |
| Record a harvest | On the Harvest tab. The dialog's title names the room ("Record a harvest · Room 1"), its lead the stamp the harvest will take ("Flush 3 · Fruiting"; audit #12). Fields: crop (a picker when the run has two or more), kg ("kg" inside the box), who (the worker picker, as Done), when (date and time side by side from 360 px, the date's day in the farm's words under its box, "Wednesday 4 Nov", since a browser shows the date in its own locale; default now; not before the run started, not in the future; a back-dated pick takes the room's stage and flush as they are now, since no stage history is kept). No crops in the room: the button is off with "Give the room its crops on the Crop tab first". |
| Edit | kg and when; the dialog's footer has a quiet red "Delete this harvest" at its start, which opens Delete's confirm (audit #8). A harvest from a check changes its task's `amount` to the new total of the task's harvests, in one transaction. |
| Delete | With a confirm: the title "Delete 2.40 kg of Grey oyster?", the lead "Picked 4 Nov 08:12 by Ali." (audit #14). A harvest from a check: the task's `amount` becomes the total of what is left, null when nothing is left. |
| An implausible pick | Done, Record and Edit (a changed kg) ask once, not refuse, when one pick is over 0.3 kg a block of that crop's blocks in the run (`PICK_MAX_PER_BLOCK`: a whole good flush is about 0.2 to 0.3 kg a block, so more is likelier a slipped decimal point): the first submit shows under the kg box, in amber (a check, not a fault: the box is not marked invalid; the words are read out, the box's description), "That's 0.55 kg per block in one pick. Is 526.32 kg right?" and the primary button reads "Record anyway" ("Save anyway", "Done anyway"); a submit with the same kg sends it, a changed kg is checked again (`pickCheck`, `pickWarning`, `donePicks` in `web/harvest-math.js`; `pickGuard` in `web/task-dialogs.js`). |
| Who | The tasks' worker check (`workerOf`): an active worker when the farm has a list. |
| Events | Every write publishes `harvest` `{ roomId }`; the Harvest tab, the Crop summary, the Harvest page and the Overview card read again. A Settings save of the yield figures or the prices publishes `harvest` `{ roomId: null }`: every room's (the room-scoped listeners take null as all rooms). A Done on a harvest check also publishes the tasks events as now; an edit or delete of a check's harvest publishes the room's `tasks` part and `tasks` `{ due }` (Today and Calendar). |

## 4. The figures (`server/harvest-math.js`, pure)

| Figure | Rule |
|---|---|
| kg | The sum of the harvests in the group (a run, a flush, a crop, a period) |
| kg per block | kg ÷ the run's blocks of the crops in the group (the run's latest block counts). A period on the farm page: not shown (a period cuts across runs). |
| Biological efficiency (BE) | kg ÷ (blocks × dry substrate kg per block) × 100, whole %. Null when a crop in the group has no dry substrate figure; the page says "Set the dry substrate per block in Settings → Yield". |
| RM value | Σ kg of a crop × its price per kg over the crops that have a price; `unpriced` names the crops with kg and no price (left out). Null only when no crop with kg has a price. The page shows the value with "without Lion's mane (34.4 kg, no price)" (several crops: their names joined with ", " and their kg together); a null value is "—" with "Lion's mane has no price". (UI/UX audit 2026-11-04 #5: one unpriced crop hid the farm's whole value.) |
| Cost per kg | The room's electricity and water cost (the Usage tab's days, at today's prices, as Usage shows them) over the run's days (its start to its end or now) ÷ the run's kg, kept to 6 places (RM 2.12 over 526.32 kg is RM 0.004028 a kg: 2 places would make it a false 0). Null with no kg, or for a run that started over 400 days ago (the usage days kept). Null with `cost.none: 'no-energy'` when those days used 0 kWh and 0 water (nothing recorded): shown as "—" with "No energy recorded yet", never "RM 0.00" (audit #3). Null with `cost.none: 'pending'` (and `cost` null) while a day of the range is not worked out yet: a view never works out a cold day in the request (a year of one-second readings takes seconds); it starts a background warm of that room (one at a time a room, a day at a time with the event loop free between), which sends the room's `harvest` event when done so the open pages reload; shown as "—" with "Working out the energy cost…". A Setup save drops the room's worked-out days only when its meter, filter sensor or gateway changes. A farm period: the farm's cost over the period ÷ its kg, by the same rule. Water counts only when a water price is set ("electricity only" then). |
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
| `GET /api/rooms/:id/harvests` | `{ current, past, stamp }`: `current` the open run's view or null, `past` the ended runs newest first, `stamp` `{ stage, flush }` a harvest recorded now takes (null without a run). A run's view: `{ id, startedAt, endedAt, partial, crops, kg, perBlock, be, value, unpriced: [crop], cost: { costPerKg, cost, days, water, none? } , byCrop: [{ crop, blocks, kg, perBlock, be, value }], flushes: [{ flush, from, to, kg, byCrop, perBlock, be }], missing: { dryKg: [crop], price: [crop] }, harvests: [row] }`. 404 for no such room. |
| `POST /api/rooms/:id/harvests` | `{ crop, kg, worker, pickedAt? }` → 201 the row. 400 for a bad field (with `field`), 409 "No crops in this room". |
| `PUT /api/harvests/:id` | `{ kg?, pickedAt? }` → the row. 404, 400. |
| `DELETE /api/harvests/:id` | 204. 404. |
| `GET /api/harvest?days=7\|30\|90\|365` | The farm: `{ from, to, days, bucket: 'day'\|'week'\|'month', buckets: [{ from, to, kg }], totals: { kg, value, unpriced, cost }, rooms: [{ id, name, crops, kg, value, unpriced, current: { kg, perBlock, be } }], crops: [{ crop, kg, value }], today, last7, last30, missing, records }`. `today/last7/last30`: `{ kg, value, unpriced }` (the Overview card). `value` and `unpriced` as section 4; `cost.none` as section 4. `records`: the myGAP rows: one per day, room, crop and run `{ date, roomId, roomName, crop, runStartedAt, kg }`. Buckets: days for 7 and 30, weeks (Monday first) for 90, months for 365. Default 30; another value 400. |
| `GET /api/harvest.csv?days=…` | `date,time,room,crop,run started,stage,flush,blocks,kg,worker,from` (from: "harvest check" or "recorded"), oldest first, with the BOM and the formula guard of the tasks CSV; file name `harvests <from>–<to>.csv`. |
| `POST /api/tasks/:id/done` | Section 3. |
| Task views | Open harvest rows gain `harvestCrops` (section 3). |

## 7. The pages

| Part | Design |
|---|---|
| Crop tab summary | Its own row in the program card under the stage plan (a room with crops), named "Harvest" as the fields beside it are; on a phone the link is 44 px to tap: "Flush 2 · 18.4 kg this run · 0.31 kg per block · BE 34 %" (the figures that are known), then the link **Harvests** to the Harvest tab. No harvest yet: "No harvests recorded in this run yet." |
| Harvest room tab | `#/rooms/7/harvest`, between Tasks and Simulations, the basket picture's tab. Head: **Record a harvest** (off with "Give the room its crops on the Crop tab first", the Crop tab a link, while the room has past runs but no crops). **This run** card: started ("Blocks in 3 Oct" or "Recorded from 4 Nov" when partial), the crops and blocks, the tiles kg, kg per block, BE, RM value, cost per kg ("RM 3.10" with "electricity and water · 46 days"; on a phone two a row, an odd last tile the whole row; a tile grows to its figure and the row wraps rather than a long figure run into the next tile's rule, RM 1,234,567.89 or 12,345.6 kg, and a phone sets a figure over 11 characters a size down); right under the tiles the notes: "The cost per kg is at today's prices." and the missing-figure note linking to Settings → Yield (audit #16); the flushes table (Flush, Dates, kg, kg per block, BE; a mixed room adds a kg column per crop and a By crop table; on a phone the heads wrap so a one-crop table fits 390 px). **Harvests** card: the run's latest 8 harvests (5 on a phone; "Show all N"), newest first: the kg in a column of its own (2 decimals), crop (in a mixed room), flush, then on one line when, who and "from the harvest check" (a harvest recorded by hand, the usual case, says nothing); one quiet Edit a row (audit #8, #24). **Past runs** card: a table (Dates, Crops, kg, kg per block, BE, RM value, Cost per kg), the dates a button that opens the row under it, indented, to the run's flushes and its latest 8 harvests ("Show all N"); on a phone each run a block of labelled figures (audit #19). A room that never had crops: no Record button; a dashed empty card with the basket faded, "No crops in this room yet." and the link button "Give it crops on the Crop tab" (audit #11). |
| Harvest page | `#/harvest`. Head: "Harvest", the range (a segmented control "7 days · 30 days · 13 weeks · 12 months", what the bars cover; the address keeps `days=7\|30\|90\|365`), **Export CSV**, **myGAP sheet**. The totals card is titled with the reply's dates ("6 Oct – 4 Nov 2026"; audit #6: "the last 365 days" covered 339). Tiles: kg, RM value, cost per kg. A bar chart of kg per day, week or month in a new series hue `--s-harvest` (both themes); its y axis, as Usage's and Exchange's bars, runs to the first multiple at or over the peak of the finest 1, 2, 2.5 or 5 × 10ⁿ step that gives 3 to 6 values (`niceScale`; 25.3 kg: 0, 10, 20, 30; audit #21). Tables: By room (room with its crop picture, never wrapped; kg and RM under a group head "Last 30 days" (the segment's words), the current run's kg per block and BE under "This run"; on a phone the run's two columns give way to a muted line under the name, "This run 0.45 kg per block · BE 50 %"; audit #7), By crop (crop picture and name, kg, RM). No harvest in the range: "No harvests in the last 30 days." (the segment's words: "…in the last 13 weeks."). |
| myGAP sheet | `#/harvest/sheet?days=30`, a print page: title "myGAP 4-6 · Production and sales record (Rekod pengeluaran dan penjualan hasil)", "Farm:" with a blank line to write the farm's name on (the app has no farm-name setting), the dates; the table Date, Crop, Block / location (room · run of 3 Oct), Harvested (kg) to 2 decimals, Sold (kg), Price / kg (RM), Total (RM), Invoice No., Buyer; the last five blank to write in; a Total row with the period's kg (printed once, at the end); a **Print** button (hidden in print); light colours and no top bar in print. |
| Overview card | "Harvest" beside Energy: kg today, 7 days, 30 days, and the 30-day RM value when known (the crops it leaves out: "Lion's mane not priced"); under the tiles a 48 px strip of the 30 days' kg in `--s-harvest` (no axis) and the rooms that picked with their 30-day kg, two a line, so the card is no taller than Energy and water at the desk (audit #23); the title links to the Harvest page (44 px to tap on a phone). No harvest in 30 days: "No harvests in the last 30 days." |
| Top bar | **Harvest** (the basket icon and the word; the icon alone on a phone) between Calendar and Overview. The Navigation Rule names it. |
| Done dialog | Section 3: a mixed room's kg boxes in one fieldset with one hint. |
| Numbers | One formatter (`web/harvest-math.js`): kg to 1 decimal for totals and 2 for a harvest (2.35 kg, 5.70 kg: a list's figures line up), kg per block to 2 decimals, BE whole %, RM 2 decimals with grouping (RM 1,240.50), cost "RM 3.10 per kg": 2 decimals from RM 0.10, below that its first two significant digits up to 4 decimals (RM 0.04, RM 0.004, RM 0.0035; under RM 0.0001 "under RM 0.0001"), so a cost above 0 never shows a false "RM 0.00" (a true 0 does; `costKgText`, the room tiles, Past runs and the Harvest page alike). |
| Names | A crop on a record (a harvest row, the tables, the Done dialog's labels, the CSV, the myGAP sheet) is `cropShortName`: the crop list's name without " (draft)", a setup label (audit #4). One name per figure everywhere: "kg", "kg per block", "BE" (an `<abbr>` "Biological efficiency"), "RM value", "Cost per kg" (audit #18). The cost tile's line is short ("electricity and water · 46 days"); "The cost per kg is at today's prices." is said once under the tiles. |

## 8. Testing

| Test | Covers |
|---|---|
| `tests/harvest-math.test.js` (pure) | kg per block, BE, RM and cost per kg for one crop and a mixed room; missing figures; flushes with the "Before records" row; buckets by day, week and month |
| `tests/db-harvest.test.js` | The upgrade from 19 (runs for rooms with crops, copied rows, partial), the run's life with `setProgram`, the unique open run, delete room |
| `tests/harvests.test.js` | Done with amount and amounts (mixed room), the 400s, the task total after edit and delete, Record a harvest (time limits, no crops 409), the room and farm views, their cost (pending while a cold room's days are worked out), the CSV, `harvestCrops` on views |
| `tests/api-harvest.test.js` | The routes, the days check, the `harvest` events (a write, a warm done, a Settings save with `roomId: null`) and the tasks events of a check's harvest edit or delete |
| `tests/crop-api.test.js` (added) | Crops given, New blocks, a block count change, crops cleared: the run |
| `tests/settings.test.js` (added) | `cropYield` checks and read-back |
| `tests/web-harvest-math.test.js` | The formatter, the summary line, the sheet rows, the flushes table's columns |
| Look | 1440 and 390 px, both themes: the Harvest tab, the Harvest page, the sheet in print, the Overview card, the Done dialog in a mixed room, the top bar at 360 px; the detector on the changed files and five pages (the UI/UX audit, 2026-11-04). The sheet's print rules were read from the CSS: print media could not be emulated |

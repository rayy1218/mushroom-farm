# Batches: where each run's blocks come from, bought or made (business module)

Date: 2026-11-05 · Branch `feat/batches` (from `v2` at `7a0713e`) · Database version **21** · One of four parallel business
modules: the shared contract is `~/.claude/task-logs/business/CONTRACT.md` (this module's rows, and its section 7 changes of
2026-11-05). Builds on iteration 22 (Harvest: runs and harvests).

The owner chose every row marked *owner* (2026-11-05): a batch is either kind, bought ready blocks or blocks made on the
farm; the making is recorded in full (recipe, sterilising, inoculation, incubation, contamination); the work is split into
two parts on one branch, part 1 mergeable before part 2; a block's weight, the strain, the delivery note and the inoculation
date are recorded; a batch's dry kg replaces the Settings estimate in Harvest's BE; a batch is put into a room on the Batches
page; a delivery splits across rooms; Batches writes Inventory's stock moves; a myGAP 4-2 sheet and a CSV; the incubation
is in a room or an area, per batch; saved recipes; one sterilising entry per load; contamination checks with a cause; a
made block's price is its materials' cost. The lead chose the rest.

## 1. Scope

| Part | In | Out (later) |
|---|---|---|
| 1 | Receive bought blocks *owner*; put into a room, split across rooms *owner*, take out | A New blocks picker on the Crop tab |
| 1 | Contamination checks on any batch, with a cause *owner* | A Contamination module's own pages and reports |
| 1 | Inventory stock moves for blocks *owner* | Inventory's own pages (Inventory's module) |
| 1 | A batch's dry kg per block in Harvest's BE *owner* | Changing Harvest's pages |
| 1 | The myGAP 4-2 sheet and a CSV *owner*; `batchLineFor(run)` for the Harvest tab | Wiring it into `harvest-card.js` (the integrator) |
| 2 | Make blocks: mix, sterilise, inoculate, incubate *owner* | Spawn grown on the farm (a spawn lab) |
| 2 | Saved recipes and the day's amounts *owner* | A sterilising temperature log *owner* |
| 2 | Materials drawn from Inventory; the price per block worked out *owner* | Labour and steam fuel in the block price (Costs keeps them) |

Part 1 is built, reviewed and mergeable first; part 2 follows on the same branch. One upgrade step makes every table of both
parts, so part 2 needs no second database version.

## 2. Data (database version 21)

| Table | Columns | Rules |
|---|---|---|
| `batches` | Contract: `id`, `run_id`, `room_id`, `crop`, `supplier`, `received_at` (ms), `blocks`, `price_per_block` (RM, null = unknown), `spawn_batch`, `note`. Own: `kind` (`'bought'`, `'made'`), `parent_id`, `strain`, `delivery_ref`, `inoculated_at` (ms), `block_kg` (REAL), `water_pct` (REAL), `placed_at` (ms), `recipe_id`, `incubation` (`'room'`, `'area'`, null), `incubated_from`, `incubated_to` (ms), `mixed_at` (ms), `created_at` | `crop` one of `CROP_KEYS`. `blocks` 1–100,000: the blocks this row holds; lost blocks do not lower it (they were paid for). `received_at`: the day received, or for a made batch the day mixed. `run_id`, `room_id` and `placed_at` all set or all null. `block_kg` 0.2–10 and `water_pct` 30–80, both set or both null. `price_per_block` 0–1,000. Text fields trimmed, up to 80 characters (`note` 500), empty stored as null. Index `(run_id)`, `(received_at)`, `(parent_id)`. |
| `batch_checks` | `id`, `batch_id`, `at` (ms), `lost`, `cause` (`'green'`, `'black'`, `'bacterial'`, `'pests'`, `'other'`), `worker`, `note`, `created_at` | `lost` 1 up to the batch's good blocks. Good blocks = `blocks` − Σ `lost`. |
| `batch_recipes` | `id`, `name`, `crop` (null = any), `sawdust_pct`, `bran_pct`, `lime_pct`, `gypsum_pct`, `other_pct`, `other_name`, `water_pct`, `bag_kg`, `archived` (0/1), `created_at` | The five % of dry weight, each 0–100, sum 100 (to 0.1). `other_name` set when `other_pct` is over 0. `water_pct` 30–80, `bag_kg` 0.2–10. Name unique among the unarchived. |
| `batch_materials` | `id`, `batch_id`, `item` (`'sawdust'`, `'bran'`, `'lime'`, `'gypsum'`, `'other'`, `'spawn'`, `'bags'`), `name`, `qty`, `unit` (`'kg'`, `'bags'`, `'pcs'`), `stock_item_id` (null without Inventory) | `qty` over 0 up to 100,000. `name` the other ingredient's name, or null. |
| `batch_loads` | `id`, `batch_id`, `method` (`'steam'`, `'pressure'`, `'pasteurise'`), `bags`, `hot_at` (ms), `hold_h`, `temp_c`, `worker`, `created_at` | `bags` 1 up to the batch's blocks; `hold_h` 0.5–24; `temp_c` 60–130. |

All tables `CREATE TABLE IF NOT EXISTS … STRICT`, made in the `if (version < 21)` step in the `// ---- Batches ----` block of
`server/db.js`, with the Batches methods.

### 2.1 Splitting

| Rule | Detail |
|---|---|
| A delivery | The first row (`parent_id` null) and its parts (`parent_id` = the first row's id). Its blocks = the first row's + its parts'. |
| A part | Made by Put into a room with fewer blocks than the row's good blocks. It copies the first row's `kind`, `crop`, `supplier`, `received_at`, `price_per_block`, `spawn_batch`, `strain`, `delivery_ref`, `inoculated_at`, `block_kg`, `water_pct` and the making columns; the first row's `blocks` drops by the part's. A part is never split again from itself: putting part of a waiting part in a room splits from the first row's family the same way (a new part, the waiting row's blocks lowered). |
| Shared fields | Edited on the first row; the write copies them to every part in the same transaction. A part's own fields: `blocks` (only through place and fold), its room, run, `placed_at`, its checks, `note`. |
| Materials, loads, recipe | Belong to the first row. |

## 3. A batch's life

| Action | Rule |
|---|---|
| Receive blocks | `kind 'bought'`. Crop, supplier (required), received date (not in the future; default today), blocks, price per block (or empty), spawn batch No., strain, delivery note No., inoculation date (not after received), block weight and water % (both or neither; the form fills 60 %), note. The batch waits (no room). |
| Put into a room | A room and a number of blocks (1 up to the row's good blocks; default all). The room must have an open run whose crops include the batch's crop: else 409 "Give Container 1 its crops on the Crop tab first" (no open run) or "Container 1's run has no Pink oyster". All the good blocks: the row itself takes the room, the run and `placed_at` now. Fewer: a part (2.1). Only a waiting row is put in. |
| More batch blocks than the run's | Allowed. The batch page and the In rooms card say, in amber: "Batches hold 1,200 Grey oyster blocks; the run has 950." (the Crop tab's count may be the wrong one). |
| Take out of the room | Only while the run is open (else 409 "Container 1's run has ended"). A part whose first row is waiting folds back into it: its blocks are added to the first row, its checks move to it, the part is deleted. Otherwise the row clears its room, run and `placed_at` and waits. |
| Contamination check | Date and time (not in the future; not before received), blocks lost, cause, who (`checkWorker`, as Tasks), note. Edit (the same checks) and delete. |
| Edit | Every Receive field; crop only while the whole delivery waits; `blocks` (a waiting first row with no parts only) not below its lost blocks. |
| Delete | With a confirm. A first row with parts: 409 "Take its parts out of the rooms first". A part: deleted, its blocks are not given back (it was a wrong record). Its checks, materials and loads go with it. |
| The run ends (New blocks, crops cleared) | Nothing: the batch stays tied to that run. Batches of an ended run are listed under Past. |
| A room deleted | The room's batches clear `room_id`, `run_id` and `placed_at` in `deleteRoom`'s transaction (one line, section 9): room and run ids are reused, so a stale id would point at the next room. The batch itself is kept (the delivery and its cost happened). |
| Events | Every write publishes `batches` `{ batchId, roomId, runId }` (`'batches'` added to `EVENT_TYPES`). A write that changes a placed batch's weight, water, blocks, room or run also publishes `harvest` `{ roomId }`, so the BE shown reads again. |

### 3.1 Stock moves (contract section 7, 2026-11-05)

Written only when the `stock_moves` table exists (`sqlite_master`), in the same transaction as the batch write; without it,
no move and no error. `ref_kind 'batch'`, `ref_id` the batch row's id.

| Batch write | Move |
|---|---|
| Receive | + the delivery's blocks (the first row's and its parts') at `received_at`, `unit_cost` = `price_per_block`, on the item "<crop name> blocks", `ref_id` the first row's id; a split or a fold does not change it, a part's delete lowers it |
| Put into a room | − the blocks put in, at `placed_at`, on the row put in |
| A check on a waiting row | − `lost`, at the check's time, note "contaminated" |
| Made batch (part 2) | + `blocks` at `mixed_at` (`unit_cost` the worked-out price); − each material line with a `stock_item_id`, at `mixed_at` (spawn: at `inoculated_at`) |
| Edit, take out, fold, delete, check edit or delete | The moves of the rows it touches are deleted and written again from the rows as they now are (a folded part's go with it), so they are never out of step |

| Item | Rule |
|---|---|
| Blocks | The `stock_items` row of kind `'blocks'` named "<crop short name> blocks" (for example "Grey oyster blocks"), unit `'blocks'`, `reorder_at` null; made in the same transaction when missing |
| A material | The `stock_item_id` picked on its line (part 2) |

### 3.2 The BE hook (`server/harvests.js`; contract section 7, 2026-11-05)

| Rule | Detail |
|---|---|
| When | A run's batches of a crop number one or more and every one has `block_kg` and `water_pct` |
| Dry kg per block | Σ(blocks × block_kg × (1 − water_pct ÷ 100)) ÷ Σ blocks over those batches, to 3 places |
| Then | The run's figures (`runFigures`) get a `cropYield` whose entry for that crop has that `dryKg` (the price kept); every other crop and run as Settings → Yield. `harvest-math.js` is not changed. |
| How | `createHarvests({ db, batchDryKg })`: `batchDryKg(runId)` → `{ <crop>: kg }` from `server/batches.js`; `harvests.js` overlays it on `readCropYield(db)` per run (`runView` and the farm view's current-run figures). Absent (tests, or before merge): as now. |

## 4. The figures (`server/batches-math.js` and `web/batches-math.js`, pure)

| Figure | Rule |
|---|---|
| Good blocks | `blocks` − Σ checks' `lost` |
| Dry kg per block | `block_kg` × (1 − `water_pct` ÷ 100); null without them |
| blockCost (the read API) | Σ blocks × `price_per_block` over the rows listed, to 2 places; null when any row's price is null; 0 with no rows |
| A delivery's cost | Its blocks × the price |
| Recipe amounts (part 2) | Dry kg per bag = `bag_kg` × (1 − `water_pct` ÷ 100); each ingredient's kg = bags × that × its % ÷ 100, to 0.1 kg; the water guide = bags × `bag_kg` × `water_pct` ÷ 100 L (before the water the dry ingredients already hold, said beside it) |
| Made price per block (part 2) | Σ material qty × the item's latest purchase `unit_cost` (Inventory's `stock_moves` with `ref_kind 'purchase'`) ÷ blocks made, to 4 places; null when any line has no `stock_item_id` or its item no purchase price, or without Inventory. Stored on the first row and its parts whenever the materials or blocks change. Blocks made, not good blocks: blocks × price = the materials' cost, losses included. |
| Status (part 2) | From the steps: "Mixed 3 Nov", "Sterilised 3 Nov", "Inoculated 4 Nov", "Incubating since 4 Nov · day 12", "Ready to fruit", then as a bought batch: "Waiting", "In Container 2", "Past · Container 2". |

## 5. Part 2: making blocks

A made batch (`kind 'made'`) is made on the mixing day and filled in over the next days. Its batch page has a **Making** card
with the steps in order, each with its own Record or Edit.

| Step | Fields | Rules |
|---|---|---|
| Mix | Date (`mixed_at`, = `received_at`), recipe, crop (the recipe's, or picked), bags (= `blocks`), the materials table: one line per ingredient with the worked-out kg (section 4), editable to what was used, each with an Inventory item picker when Inventory exists | `block_kg` and `water_pct` filled from the recipe (editable), so BE uses them (3.2). `supplier` stays empty until the spawn is recorded. |
| Sterilise | Loads: method (Atmospheric steam, Pressure, Pasteurise), bags, reached temperature at (date and time), hold (h), temperature reached (°C), who | Not before the mix. An amber note when the loads' bags are fewer than the blocks: "300 of 400 bags sterilised". |
| Inoculate | Date (`inoculated_at`), spawn supplier (`supplier`), strain, spawn batch No., the spawn amount (a material line, item `spawn`, kg or bags, with its Inventory item) | Not before the mix |
| Incubate | Where: **In a grow room** (`incubation 'room'`: Put into a room, a full-cycle room's run in its Spawn stage, as in part 1) or **In an area** (`'area'`: from, default the inoculation date; to, set by **Ready to fruit**, then Put into a room as a bought batch) | Not before the inoculation |
| Checks | As part 1 | |

| Recipes | Rule |
|---|---|
| Where | A **Recipes** button in the Batches page head opens a dialog: the list, Add, Edit, Archive |
| Fields | Name, crop (or Any), sawdust, bran, lime, gypsum and other % of dry weight (other with its name), water %, wet kg per bag; the sum shown live ("Sum 100 %") |
| Archive | Never delete: past batches name their recipe. An archived recipe is not offered for a new mix. |

## 6. API

| Route | Reply |
|---|---|
| `GET /api/batches?run=&from=&to=&status=` | `{ batches: [row], blockCost }`. A row (camelCase): `id, kind, parentId, runId, roomId, roomName, crop, supplier, receivedAt, blocks, lost, good, pricePerBlock, spawnBatch, strain, deliveryRef, inoculatedAt, blockKg, waterPct, dryKg, placedAt, runStartedAt, runEndedAt, note, status` (`'waiting'`, `'placed'`, `'past'`; part 2 adds `'making'` before the batch is ready). `run` a run id; `from`/`to` YYYY-MM-DD on `received_at` (farm time, `to` inclusive); `status` one of the statuses. Newest received first. A bad parameter: 400. |
| `GET /api/batches/:id` | The row, plus `delivery: [row]` (the first row and its parts), `checks: [check]`, `runBlocks` (the run's blocks of that crop when placed), `batchBlocks` (the run's batches' blocks of that crop); part 2: `recipe, materials, loads`. 404. |
| `POST /api/batches` | Receive, or (part 2) `kind: 'made'` with the Mix fields → 201 the row. 400 with `field`. |
| `PUT /api/batches/:id` | Edit (section 3; part 2: the steps' fields) → the row. 400, 404, 409 (crop of a placed delivery). |
| `DELETE /api/batches/:id` | 204. 404, 409 (has parts). |
| `POST /api/batches/:id/place` | `{ roomId, blocks }` → 201 the row put in. 400, 404, 409. |
| `POST /api/batches/:id/unplace` | → the row that now waits. 404, 409 (run ended, or not placed). |
| `POST /api/batches/:id/checks` | `{ at?, lost, cause, worker, note? }` → 201 the check. |
| `PUT /api/batch-checks/:id`, `DELETE /api/batch-checks/:id` | The check / 204. 400, 404. |
| `GET /api/batches.csv?from=&to=` | `received,crop,kind,supplier,strain,spawn batch,delivery note,blocks,lost,price per block,room,run started,placed,block kg,water %,note`, oldest first, the BOM and the formula guard of the tasks CSV; file name `batches <from>–<to>.csv` |
| Part 2 | `GET /api/batch-recipes` (`?all=1` with the archived), `POST /api/batch-recipes`, `PUT /api/batch-recipes/:id` (fields, or `{ archived: true }`); loads `POST /api/batches/:id/loads`, `PUT/DELETE /api/batch-loads/:id`; materials sent whole with the Mix and Inoculate steps in `PUT /api/batches/:id` |

The routes live in `server/batches-api.js`, wired by one line in `server/api.js`; the logic in `server/batches.js`
(`createBatches({ db, now })`), no HTTP in it.

## 7. The pages

| Part | Design |
|---|---|
| Batches page | `#/business/batches` (`web/batches-page.js`). Head: "Batches", **Receive blocks** (primary), **Make blocks** and **Recipes** (part 2), **Export CSV**, **myGAP 4-2 sheet**. **Waiting** card: rows of the waiting batches, the crop picture and name, supplier, "Received 3 Nov · 2 days ago", the good blocks ("1,200 blocks", or "1,180 of 1,200 good" after a loss), **Put into a room**; part 2 lists the made batches still making above them, with their status line. Empty: "No blocks waiting." **In rooms** card: one group per room's open run, "Container 1 · run since 3 Oct", its batches (supplier, spawn batch, blocks, received), the amber over-count note (section 3). Empty: "No batches in a room's current run." **Past** card: batches of ended runs, a table (Received, Crop, Supplier, Spawn batch, Blocks, Lost, RM per block, Room · run) under a segmented control "90 days · 12 months · All" (on `received_at`); on a phone a block of labelled figures a batch, as Harvest's Past runs. `?run=<id>`: only that run's batches, with "All batches" to clear it. A row opens its batch. |
| A batch | `#/business/batches/<id>` (the same module). Head: crop picture, "Grey oyster blocks" (made: "Grey oyster blocks · made"), "Received 3 Nov 2026 · Agro Supplies" (made: the status line); **Put into a room** or **Take out** (while the run is open), **Edit**, a quiet red **Delete**. **Details** card (a definition list): spawn batch, strain, delivery note, inoculated, block weight "2.30 kg · 60 % water · 0.92 kg dry", price per block, the delivery's cost, note; empty fields left out. **Delivery** card (a delivery with parts): each row its blocks and its room or "Waiting", the open one marked. **Contamination** card: checks newest first (date, blocks lost, cause, who), **Record a check**, a quiet Edit a row; empty "No contamination recorded." Part 2: **Making** card (section 5). A missing id: "No such batch." with a link back. |
| Dialogs | Receive and Edit: grouped fields (The blocks: crop, supplier, received, blocks, price; Spawn: spawn batch, strain, inoculated; Weight: block kg, water %; Paperwork: delivery note, note). A date shows the farm's words under its box ("Tuesday 3 Nov"), as Harvest's Record does. Put into a room: the rooms, those without the crop in an open run listed but off with the reason; blocks (default all good). Record a check: date and time, blocks lost, cause (Green mould, Black mould, Bacterial / wet spot, Pests, Other), who (the worker picker), note. Delete: "Delete 1,200 Grey oyster blocks from Agro Supplies?" with the lead the received date. Take out: a confirm naming the room. |
| myGAP 4-2 sheet | `#/business/batches/sheet?from=&to=` (`web/batches-sheet.js`): title "myGAP 4-2 · Purchase, use and treatment of planting material (Pembelian, penggunaan dan rawatan bahan tanaman)", "Farm:" and a blank line, the dates. Columns: Date, Variety / material (+ batch No.), Qty bought, Price / unit, Qty used, Block / area, Treatment: why, Treatment: material, Treatment: rate, Supplier / operator. Rows by date: a bought delivery's **receipt** ("Grey oyster blocks · PL-27 · batch 0912", "1,200 blocks", "RM 2.30", the supplier) and a **use** row per placement ("800 blocks", "Container 1 · run of 3 Oct"); a made batch's receipt is its spawn (inoculation date, "Grey oyster spawn · PL-27 · batch 0912", the amount, the price when known, the spawn supplier) and its use "made into 400 blocks", then its placements. Treatment columns blank, to write in. **Print** (hidden in print), A4 landscape, light colours and no top bar in print, as the 4-6 sheet. The page's From and To boxes default to the last 90 days. |
| `batchLineFor(run, reply)` | In `web/batches-math.js`, for the integrator to wire into the Harvest tab's run card. `reply` = `GET /api/batches?run=<run.id>`. → null with no batches, else `{ text, href }`: one batch "Blocks · Agro Supplies · spawn batch 0912 · 950 blocks · RM 2,185.00" (the parts known), href `#/business/batches/<id>`; two or more "Blocks · 2 batches · 1,200 blocks · RM 2,760.00" (the cost left out when unknown), href `#/business/batches?run=<run.id>`. |
| Numbers | One formatter, `web/batches-math.js`: RM 2 decimals with grouping (RM 2,185.00); a price per block to 2 decimals, or more where needed for a made block (RM 0.8731 shows "RM 0.87"); blocks grouped ("1,200 blocks", "1 block"); block kg 2 decimals; water whole %; dry kg 2 decimals; dates as Harvest writes them ("3 Nov", "3 Nov 2026" when not this year). Crops by `cropShortName`. Tabular figures. |
| Styles | One block at the end of `web/styles.css`, `.bt-` prefixed, between `/* ---- Batches ---- */` comments; tokens only. |
| Reaching it | By address until the integrator adds the Business top-bar entry (contract section 6). |

## 8. Testing

| Test | Covers |
|---|---|
| `tests/batches-math.test.js` | Good blocks, dry kg, the run's dry kg per crop for BE (all weighted, one missing → none), blockCost (null when one price is unknown), recipe amounts, made price per block, the status line |
| `tests/db-batches.test.js` | The upgrade from 20 to 21 (every table, STRICT, indexes), the room delete clearing a batch's room and run, the Batches methods |
| `tests/batches.test.js` | Receive and its 400s; place (whole, a part, a part of a part's family, the 409s); unplace (fold, wait again, run ended); edit (shared fields to the parts, crop only while waiting, blocks not below lost); delete (parts 409); checks; stock moves with Inventory's tables (a fixture makes them by the contract's columns) and without; the BE hook through `createHarvests({ batchDryKg })` |
| `tests/api-batches.test.js` | Every route, `?run/from/to/status` and their 400s, the CSV, the `batches` and `harvest` events |
| `tests/web-batches-math.test.js` | The formatter, `batchLineFor`, the 4-2 sheet rows (bought and made), the page's groups |
| Part 2 | Recipes (the sum, archive, unique name), Mix amounts, loads and their checks, inoculate, incubate in a room or an area, the made price with and without purchase prices, the made sheet rows |
| Look | The UI/UX audit: Impeccable critique and audit at 1440, 1024 and 390 px, both themes: the Batches page, a batch (bought and made), each dialog, the sheet; then the finish review |

Test servers use ports 18900–18949; throwaway databases under `/tmp/batches/`.

## 9. Shared files touched (contract section 3)

| File | Change |
|---|---|
| `server/db.js` | The `// ---- Batches ----` block (tables, the version-21 step, methods); `VERSION = 21`; one line in `deleteRoom` clearing the room's batches (section 3) |
| `server/api.js` | One line wiring `batches-api.js`, and `createHarvests({ db, batchDryKg })` (3.2) |
| `server/harvests.js` | The BE hook (3.2) |
| `web/route.js`, `web/app.js` | The routes `#/business/batches`, `#/business/batches/<id>`, `#/business/batches/sheet` |
| `web/live.js` | `'batches'` in `EVENT_TYPES` |
| `web/styles.css` | The `.bt-` block |
| `DESIGN.md`, `README.md`, `PRODUCT.md` | A Batches section or row each |

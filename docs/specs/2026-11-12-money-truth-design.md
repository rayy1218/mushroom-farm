# Money truth: what goes into the business figures (iteration B1)

Date: 2026-11-12 · Branch `feat/money-truth` from `v2` at `85a8e87` · Database version 28 (after the alarms iteration's 27) · Scope: the business audit
(`~/.claude/task-logs/audit/business/REPORT.md`) findings B1, B2, B3, B4, B10, B13, B15 and B16, in the owner's order
(`~/.claude/task-logs/next/PLAN.md`, approved "proceed"; the owner asked not to be asked mid-way, so every choice the audit
left open is the lead's and is listed in section 12).

The audit found the arithmetic sound and the inputs wrong: made blocks never charged their materials, buying was costed as
spending, sales with no room never reached a run, Economics priced from a guess, skipped every run the farm has, wrote off
equipment that Costs never knew of, counted labour by the minute and priced a built room as a 40 ft reefer. This
iteration fixes what goes in. Every module keeps its own rule; where a rule changes it changes in the module that owns it,
and the contract (`~/.claude/task-logs/business/CONTRACT.md`) gets a row for it (section 11).

## 1. Scope

| In | Out (later) |
|---|---|
| B1: a made batch's materials costed at the lots its draws took (oldest first), its cost per block = materials ÷ blocks made, charged to the run its blocks go into; a draw with no price marks the run "Some costs have no price" | Making costs beyond materials (labour hours, fuel, sterilising electricity: audit B14) |
| B2: stock valued (what is left of each lot × its unit cost) on Inventory and the Summary; Costs counts a material when it is used, and shows what was bought for stock as a cash line apart | A cash curve, money owed to suppliers (B21) |
| B3: a sale line with no room tied to the one open run growing its crop; otherwise shared over the runs that picked the crop in the 14 days before, by kg; "RM 384.00 of sales not tied to a run" on Runs | Changing a sale's stored room or run (the tie is worked out on each read) |
| B4: Economics' selling price from "Your sales" (the crop's last 90 days) ahead of Settings; the realised price beside the price figure; a flag when Settings' or your own price is more than 25 % off it | A price per buyer or per grade |
| B15: a run recorded only since the harvest upgrade (`partial`) counts in Economics once the owner gives its real block-in day; the loss measured from Batches' contamination checks, the yield then per good block | Contamination records beyond Batches' checks (iteration C) |
| B10: an equipment register (item, a room or the farm, bought on any day, RM, months to write off, resale value) written off straight-line as a Costs line; Costs shows profit before and after the write-off; Economics' Your container equipment reads the register when the room has items | Loans, interest, depreciation for tax |
| B13: Economics' labour as people: workers × a month's cost each (with EPF, SOCSO and EIS), from Costs' monthly labour items or the research figure, shared over the rooms by their blocks; minutes per block kept as a capacity check | Labour time from the Done log (B23) |
| B16: a room type on Setup (container, built room, shed); Economics prices the building and the cooling by the type | Cooling sized by Suggest machines inside Economics |

## 2. Data (database version 28)

One step, `if (version < 28) { … }` in `server/db.js`, `VERSION = 28` (the alarms iteration takes 27: `ALTER TABLE alarms ADD COLUMN acked_by TEXT`), every statement below in one transaction with the
other steps. The farm app moves the database up on its first start (copy `data/v2.db` first).

| Change | Owner | SQL | Rule |
|---|---|---|---|
| `equipment` table | Costs | `CREATE TABLE IF NOT EXISTS equipment (id INTEGER PRIMARY KEY, name TEXT NOT NULL, room_id INTEGER, part TEXT NOT NULL DEFAULT 'other' CHECK (part IN ('building','cooling','humidifier','fans','racks','other')), bought_on TEXT NOT NULL, amount REAL NOT NULL, life_months INTEGER NOT NULL, resale REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL) STRICT` | `room_id` null: the farm's. A trigger `equipment_room_gone` makes a deleted room's items the farm's (room ids are reused) |
| `runs.blocks_in_at` | Harvest's table, written by Runs | `ALTER TABLE runs ADD COLUMN blocks_in_at INTEGER` | ms, null: not given. Only a `partial` run takes one (section 7) |
| `rooms.room_type` | Rooms (Setup) | `ALTER TABLE rooms ADD COLUMN room_type TEXT NOT NULL DEFAULT 'container' CHECK (room_type IN ('container','built','shed'))` | Every room of before is a container until the owner says otherwise |

Labour (section 9) adds two Economics figures; they are rows of `economics_figures` (version 26), no schema.

## 3. Lots and their cost (Inventory, `server/inventory-math.js`)

Inventory already keeps lots and uses them oldest first (`lotsOf`). It gains the money of each lot and of each move out.

| Rule | Detail |
|---|---|
| A lot's unit cost | A purchase: its total ÷ its qty (the RM paid), else its `unit_cost`; a bought batch's receipt (blocks): its `unit_cost` (Batches' price per block); a made delivery's receipt: Batches' live price (`madePricer`, its materials at their lots), marked `partial` while a material has no price (valued at the priced part, the item then "part with no price"); a count that added: the unit cost of the item's latest priced lot before it, else none. A lot with none is unpriced |
| What a move out takes (`costedMoves(moves, lotCost)`) | In time order (`at`, then id), each move out takes from the lots in at that time, oldest first, each to 0 before the next; a throw-out takes its own lot first (a throw-out dated before its own lot, the purchase's day edited since, is owed from that lot when it comes). What it takes beyond the stock then (stock below zero) is taken from the next lots to come in, oldest first, as `lotsOf` ends: so a lot's left is the same in both. → per move out `{ moveId, qty, cost, unpricedQty }`: `cost` the RM of what it took from priced lots, to 2 places; `unpricedQty` what came from unpriced lots or from no lot at all |
| A lot's value | Its left × its unit cost, to 2 places; unpriced: none |
| An item's value | Σ its lots' values; `unpriced: true` when a lot with some left has no unit cost, or the stock is below zero |
| Golden (made-up figures) | Sawdust 1,200 kg at RM 1.40, 360.5 kg drawn: RM 504.70 drawn, 839.5 kg left worth RM 1,175.30. Rice bran 92.4 of 400 kg at RM 2.10: RM 194.04 drawn, RM 645.96 left. Lime 4.6 of 80 kg at RM 0.90: RM 4.14, RM 67.86 left. Gypsum 4.6 of 80 kg at RM 1.20: RM 5.52, RM 90.48 left. Grain spawn 57.5 of 300 kg at RM 11.00: RM 632.50, RM 2,667.50 left. Plastic bags: 480 drawn, never bought: cost 0, 480 unpriced, item unpriced. Stock worth RM 4,647.10 |

The Inventory page and its list reply (`GET /api/inventory`):

| Part | Design |
|---|---|
| Reply | Each item gains `value` (RM) and `unpriced` (boolean); the list gains `value: { total, unpriced: [item names] }` (items not archived). The item reply's lots gain `unitCost` and `value`. A worker's reply loses them (`value`, `unpriced` and `unitCost` are money keys) |
| Head | Under the page's head: "Stock worth RM 4,647.10" (`fs-md`, 600), then muted "at what each lot cost · Plastic bags: no price" (several: "2 items have no price"). Owner only (a worker's reply has no value: the line is not drawn) |
| Item card | "RM 1,175.30" muted under the quantity; "no price" when the item has none; "RM 20.00 · part with no price" |
| Item page | A Worth tile ("At what each lot cost"); each lot's Left adds "RM 1.40 per kg · RM 1,175.30" (no price: "no price") |

## 4. Made blocks charge their materials (Batches, `server/batches-math.js`)

| Rule | Detail |
|---|---|
| A made batch's materials | Its first row's material lines. A line drawn from an Inventory item costs what its draw took (`costedMoves`, section 3); a line with no Inventory item (not picked, or the item since deleted) has no price |
| Its cost (`madeCost`) | `{ total: Σ the priced part, missing: [the names of the lines with any unpriced part] }`; `total` null when no line has a price |
| Price per block | total ÷ the blocks made (every row of the delivery), to 4 places; null when total is null. Worked out on each read of Batches' views (live: a purchase entered later prices an earlier draw); also stored on each write, as before, for the readers of the column. Over RM 1,000 a block: refused when the write sent the amounts, else stored unknown (as before); Costs uses the same cap (`madeOver`), so it never charges such a delivery, it names it with no price. The blocks' receipt move carries the price only while every material has one (else no unit cost: Inventory does not value the blocks at a part price) |
| The view | A made batch's view gains `priceMissing: [names]` and `cost` (the row's share of the materials, split to the sen: the figure Costs charges; `blockCost` sums it, `blockCostPartial` when a material has no price) ("Plastic bags"); its Making card's note says "The price per block counts the materials with a price; no price yet for Plastic bags: enter its purchase in Inventory." (all priced: "The price per block is the materials at what their lots cost in Inventory, oldest first; a purchase entered later counts at once.") |
| Golden | Container 1's 480 made grey oyster blocks: RM 504.70 + 194.04 + 4.14 + 5.52 + 632.50 = RM 1,340.90, RM 2.7935 a block, Plastic bags missing |

Batches no longer reads "the latest purchase price" for a made block (`madePrice` is gone); the spawn's 4-2 sheet price is
unchanged.

## 5. Costs used, and what was bought (Costs, `server/costs-sources.js`, `server/costs-math.js`)

### 5.1 What counts as a cost of the month

| Source | Before | Now |
|---|---|---|
| A batch (bought or made) | On the month received; its run when placed | **When its blocks go into a room** (`placed_at`): on that day, on its run (not shared). A bought batch: blocks × its price; a made one: its materials (section 4) split over the delivery's rows by blocks (each floored to the sen, the last taking the rest: `split`). A row never placed: its blocks lost while waiting, at each check's day, × its price per block, on the farm's month, not shared ("Blocks lost before a room"). A placed row whose room was deleted: on the farm's month, not shared |
| An Inventory purchase | A shared cost the month bought | **Not a cost.** A cash line (5.2) |
| An Inventory use (Record use) | Nothing | What it took (section 3), on its day: with a room, on that room's run open that day (else the farm's month, not shared); without a room, shared |
| A count that found less, a throw-out | Nothing | What it took, on its day, shared |
| A made batch's draws (`ref_kind 'batch'`) | Nothing (the purchase was the cost) | In the batch's cost (above), never on their own |
| Equipment | Nothing | Its write-off (section 6) |

Every Inventory line keeps its category and name by the item's kind (`INVENTORY_LINES`: Spawn, Bags, Chemicals, Packaging,
Other supplies); its source reads "used, from Inventory". A use or a draw with an unpriced part adds a note and marks the
costs incomplete:

| Note kind | Words | On |
|---|---|---|
| `unpriced-batch` (as before) | A made batch: "Container 1’s blocks of 5 Nov: no price for Plastic bags"; a bought one: "Container 1’s blocks of 5 Nov have no price" (no room: "Blocks put in 5 Nov have no price"; lost while waiting: "Blocks lost 3 Nov before a room have no price"). Carries `runId` and `batchId` | The month and the batch's run |
| `no-unit-cost` (as before, now on use) | "Plastic bags used 6 Nov: 40 pcs have no price" | The month, and the run when the use was in a room |

Golden: Container 1's run (grey oyster, 480 made blocks put in on 5 Nov) costs RM 1,340.90 of blocks + RM 64.20 measured
electricity = RM 1,405.10, marked "Some costs have no price" with the note about the plastic bags. September 2026 (RM 5,988.00
of materials bought on 21 Sep, none used then) has no material cost: its profit is no longer −RM 5,988.00.

### 5.2 Bought for stock (the cash line)

| Part | Design |
|---|---|
| What | The month's Inventory purchases (kind not blocks) and the bought batches received in the month, at what was paid |
| Reply | `monthView` gains `bought: { total, lines: [{ key, label, amount }], unpriced: [names] }` (lines by kind: "Spawn", "Other supplies", …; bought blocks "Blocks"), biggest first |
| Page | Under the By category table, its own small table, caption "Bought for stock", a muted line "Paid this month; a cost once used." over it, the lines and a Total ("RM 5,988.00"). None: not drawn |
| Summary | Money card: muted lines "Bought for stock this month: RM 5,988.00 (a cost once used)" when over 0, and "Stock on hand: RM 4,647.10 at what each lot cost" with an Inventory link; the reply gains `stock` and `month.bought`. Its blocks with no price come from Batches' deliveries waiting or in a room (a bought one with none, a made one with a material unpriced), one note a delivery |
| CSV | A row per purchase, type `bought`, source "Inventory" or "Batches" (never in the cost total) |

### 5.3 Runs keep their lead

A run's figures still start 62 days before its start (`RUN_LEAD_DAYS`): a batch now lands on its placing day, inside the
run, but a monthly room item or a bill's top-up still may not.

## 6. The equipment register (Costs)

### 6.1 Rules

| Field | Rule |
|---|---|
| Name | 1–60 characters, trimmed ("Daikin FTKF 2.5 hp") |
| For | The farm, or a room |
| Part | Building or container, Cooling, Humidifier, Fans and controls, Racks, Other (Economics reads it, 6.3) |
| Bought | Any real day up to today (no 400-day floor: "Pick the day bought, up to today") |
| RM | Over 0 up to 10,000,000, 2 places |
| Written off over | Whole months, 1–240 |
| Resale value | 0 up to the RM paid ("The resale value can't be more than what it cost") |
| Note | Up to 200 characters |

| Write-off | Rule |
|---|---|
| A month's | (RM − resale) ÷ months, floored to the sen; the last month takes the rest, so the months sum to RM − resale |
| When | Once a month on the bought day's day of the month (the month's last day when shorter: as a monthly item, `chargeDate`), from the month bought for the item's months; never a future day |
| Where | A room's item: the room's run open on that day, else the farm's month, not shared. The farm's: shared over the runs by block-days, as the farm's costs |
| Line | Category `equipment` ("Equipment written off"), source `register` ("written off, from the register") |
| Golden | A Daikin RM 4,170.00 over 60 months, no resale: RM 69.50 a month, 60 charges. RM 1,000.00 over 3 months, resale 100: RM 300.00, 300.00, 300.00 |

### 6.2 Costs' figures and page

| Part | Design |
|---|---|
| Tiles | Profit is after the write-off. Under it, when the month wrote anything off: "RM 1,234.56 before write-off" (muted, its own line; a loss "−RM …"). The tiles' reply gains `writeOff` and `profitBeforeWriteOff` |
| A run | Its parts gain `equipment` (its room's items' write-off; the farm's items are in its share of the shared costs); the run breakdown and the run page say "Equipment written off" |
| Equipment card | A card after Monthly items, title "Equipment": a row per item (name; for; part; "bought 3 Jan 2025"; RM; "RM 69.50 a month over 60 months"; "RM 2,780.00 left to write off" or "written off"), a quiet Edit each, **Add equipment** in the card head. None: "No equipment yet. Add what you bought for a room or the farm; it is written off a month at a time." |
| Dialog | Name, For, Part, Bought, RM, Written off over (months), Resale value, Note; under them "RM 69.50 a month for 60 months." worked out as typed. Edit: every field and a quiet red "Delete this item" (confirm: "Delete Daikin FTKF 2.5 hp? Its write-off goes from every month.") |
| Routes | `GET /api/equipment`, `POST /api/equipment`, `PUT` and `DELETE /api/equipment/:id`; 400 `{ error, field }`; every write publishes `costs` |

### 6.3 Economics reads the register

| Rule | Detail |
|---|---|
| When | The room has one or more items in the register |
| Figures | The parts the register has items for come from it, source `register` (chip "Your equipment"): Building (was "Container, delivered"), Cooling, Humidifier, Fans, Racks, and a new "Other equipment" (`yours.other`, research 0), each Σ the room's items of that part. A part with no item keeps its next source and says "Not in your equipment register: research." You set still wins |
| Write-off | While the register's parts are as the register has them, Your container's "Equipment written off" is the register's month (Σ each item's (RM − resale) ÷ its months, floored to the sen: the planning figure, items past their months included) + the other parts ÷ "Equipment written off over"; a register part set over it: equipment ÷ the months, as before |
| Note | "Your equipment register: Daikin FTKF 2.5 hp RM 4,170.00, Daikin FTKF 2.5 hp RM 4,170.00." |

## 7. Sales reach runs (Costs' income rule, `saleShares` in `server/costs-math.js`)

| Step | A sale line goes to |
|---|---|
| 1 | Its own `run_id`, when that run grows its crop (Sales ties a line to its room's run whatever the crop) |
| 2 | Its room's run open on its day, when that run grows its crop; none open that day (sold after the run ended): that room's runs that picked its crop in the 14 days up to it, by kg; none of those: on to step 3 |
| 3 | No room: the runs open on its day whose crops include its crop: when exactly one, that run |
| 4 | Otherwise: the runs that picked its crop in the 14 days up to its day (its day and the 13 before), each by its share of the kg of that crop they picked then; its RM and kg split by those shares (`split`, to the sen and to 0.01 kg) |
| 5 | None of those: not tied |

| Where it shows | Design |
|---|---|
| Costs | A run's income and kg sold follow the steps (the month's income is unchanged: every sale by its day) |
| Runs | The list reply gains `untied: { total, kg, count }` (the crop filter applied); the page says over the table "RM 384.00 of sales not tied to a run" with a link "Sales" when the total is over 0. A run page lists every line reaching it at its share (`tie: { how, share, kg, total }`), and says under Sold how: "Tied here: the only run growing Lion's mane that day", "Shared: 2.5 kg of a 10.0 kg sale, by the kg picked here" (nothing for its own run or its container's) |
| Economics | Your runs' price reads the counted runs' tied and shared lines (the farm-wide fallback goes: section 8 has Your sales) |
| Golden | Room 1's 8 kg of lion's mane sold for RM 384.00 on 5 Nov, no room: the only open run growing lion's mane is Room 1's, so its income is RM 384.00 (it was RM 0.00) |

## 8. Economics: the price, the runs, the loss (Economics, `server/economics*.js`)

### 8.1 Your sales

| Rule | Detail |
|---|---|
| Source order of `price` | You set › Your runs (the counted runs' tied and shared lines) › **Your sales** (the crop's sale lines of the last 90 days, farm-wide: Σ RM ÷ Σ kg) › Settings › Research |
| Tag and note | Chip "Your sales"; "Your sales: 8.0 kg of Lion's mane sold for RM 384.00 in the last 90 days." The view's price figure carries `realised` (the Your sales figure) |
| Beside the figure | Whenever the crop sold in the last 90 days and the price shown is not Your sales: "Your sales, last 90 days: RM 48.00 a kg." |
| The flag | When the price used is You set or Settings and differs from Your sales' by more than 25 % (note key `price-off`): "Settings’ expected price, RM 35.00 a kg, is 27 % under your sales’ RM 48.00 a kg of the last 90 days." ("Your RM 70.00 a kg is 46 % over your sales’ RM 48.00 a kg of the last 90 days.") in the warning text tone |
| Golden | Room 1, lion's mane: price RM 48.00 from Your sales (was RM 35.00 from Settings) |

### 8.2 Partial runs

| Rule | Detail |
|---|---|
| Why | The harvest upgrade (4 Nov) opened a run for every planted room from that day (`partial`): their picks before it are not recorded and their start is the upgrade's. Economics left them out, so every room of the farm stays on research for a whole cycle |
| Count it | The run page of a partial run says "Recorded from 4 Nov, when the app began keeping runs; its blocks went in earlier, so Economics leaves it out." and **Count it in Economics** (counted: "Counted in Economics from 20 Sep, the day its blocks went in.", **Change the day**, **Stop counting it**): a dialog asking "Blocks went in on" (a day, up to the recorded start, at most 365 days before it) with "Count it only if every pick since then is recorded." → `PUT /api/runs/:id/blocks-in { blocksInAt: ms }`; **Stop counting it** sends `null`. 400 `{ field: 'blocksInAt' }` outside the days; 409 for a run that is not partial. Publishes `harvest` `{ roomId }` (the runs are Harvest's table; Runs, Costs and Economics already listen) |
| Counted | A run counts when it has ended, has kg of the crop and is not partial or has a block-in day. Its start for the figures' dates and its electricity days is the block-in day; a day before its recorded start belongs to it when no run was open in the room then |
| The note | "Your runs: 2 finished runs of Lion's mane in Container 1 (one counted from its block-in day), …" |

### 8.3 The loss from Batches' checks

| Rule | Detail |
|---|---|
| When | Every counted run has batches of the crop |
| Loss | Σ blocks lost in the room (each batch's lost after it went in) ÷ Σ blocks put in (its blocks that went in), in %, to 0.1 |
| Yield | Σ kg ÷ (Σ put in − Σ lost in the room) × 1,000: "Yield per good block", as the model reads it |
| Note | Loss: "Your runs: 50 of 2,000 blocks lost (Batches’ checks)."; yield: "… 450.0 kg from 1,950 good blocks of 2,000 put in (231 g a good block)." The note "Counted in your yield" goes, and so does "a loss here counts them twice" |
| Otherwise | As before: the yield over every block put in, the loss 0 "counted in your yield" |

## 9. Economics: labour as people

| Figure | Key, unit, scope, range | Sources, first first |
|---|---|---|
| Workers on the farm | `yours.workers`, workers, farm (in Your container's fold), 0–100 (a part-time worker 0.5) | You set › Your costs (the workers named on the monthly labour items charging this month, each item with no name a worker of its own) › Research 1 |
| A worker's month, with EPF, SOCSO and EIS | `yours.workerMonth`, RM a month, farm, 0–100,000 | You set › Your costs (Σ those items ÷ the workers) › Research RM 1,954.15 (RM 1,700 minimum wage × 1.1495: EPF 13 %, SOCSO 1.75 %, EIS 0.2 %; range 1,954.15–2,299.00, the RM 2,000 minimum from June 2027; medium; sources L21, G17, G18) |

| Rule | Detail |
|---|---|
| Your container's labour a month | workers × a worker's month × the room's share; the share = Your container's blocks ÷ (its blocks + every other room's blocks now, from their Crop tabs: the view's `context.otherBlocks`) |
| The other ways | As before (minutes per block × the hourly labour cost; import: hours a day): they stand for another grower's own staff |
| Minutes per block | Kept for Your container as a capacity check: hours needed = blocks started a month × minutes ÷ 60; hours there = workers × share × 208 (26 days of 8 h) |
| Line under the table | First under the table: "Labour: Container 1’s share (40 %, by blocks) of 1 worker at RM 1,954.15 a month. Handling its blocks takes 52.9 h a month of the 83.2 h that share gives." Over: "… takes 120.0 h a month, more than the 83.2 h that share gives." in the warning text tone |
| Note on Your costs | "Your costs: Aminah’s and Siti’s base wages, RM 3,400.00 a month as entered in Costs (enter them with EPF, SOCSO and EIS)." (three or more: "3 workers’ base wages"). Research at its defaults: Your container now carries one worker's RM 1,954.15 a month, so stage 1's 11.2 table moves (lion's mane RM 2,183.70 → RM 680.07 a month at the research figures) |
| `wage` | Its label becomes "Labour cost, other ways" (RM an hour); the other ways and import keep it |

## 10. The room type (Setup and Economics)

| Part | Design |
|---|---|
| Setup | The Room profile group gains "Room type" (a select: Container · Built room · Shed) under the sizes. `validateRoom` takes `roomType` (`'container'`, `'built'`, `'shed'`; left out: kept; a new room: container). 400 "Pick a room type" |
| Your way's name | "Your container", "Your room" (built), "Your shed": the column, the headline and the phone table say it |
| Building | Container: as before ("Container, delivered", by size: over 40 m³ a 40 ft). Built room: "Building, insulated" = the panel area 2 × (L × W + L × H + W × H) × RM 160 a m² (100–250, low, no source: "156.6 m² of insulated panel walls, roof and floor at RM 160 a m² (100–250); no source: enter your own quote"). Shed: "Shed" = RM 5,000 a 2,000 blocks (the lowland shed's house), racks then 0 (in the shed). The building's research note ends "By the room type on its Setup tab: container, built room or shed." |
| Cooling | Container: as before. Built room: one 2.5 hp unit (RM 4,520 fitted) per 38 m³ (the containers' rule: a 40 ft holds 2), "3 × Daikin FTKF 2.5 hp for 113 m³; size it with Suggest machines on the room's page", low. Shed: 0 ("A lowland shed isn't cooled; set yours if it is") |
| The view | `room` gains `type`; `size` is null for a built room or a shed |
| Golden | Room 1 (9 × 4.5 × 2.8 m, 113.4 m³, built): no 40 ft reefer (RM 38,100) and no 2 × 2.5 hp (RM 9,040); its building (RM 25,056) and three units (RM 13,560) instead |

## 11. The contract (`~/.claude/task-logs/business/CONTRACT.md`)

| Section | Change |
|---|---|
| 5, tables | `stock_moves`: Costs and Batches read every move (not only purchases) and cost them with Inventory's `costedMoves`. `batches`: a made batch's `price_per_block` is its materials at their lots (live in the views). `costs` → plus `equipment` (Costs). `runs.blocks_in_at` (written by Runs). `rooms.room_type` |
| 5, reads | `GET /api/batches` rows gain `priceMissing`; `GET /api/inventory` gains `value`; `GET /api/costs/month` gains `bought`, `tiles.writeOff`, `tiles.profitBeforeWriteOff`, run `parts.equipment`; `GET /api/runs` gains `untied` |
| 7, a row | 2026-11-12, Money truth: the rules of sections 3–10 and who owns each (Inventory: lot costs and value; Batches: the made price; Costs: used not bought, placing day, the register, the sale steps; Runs: its first write; Economics: Your sales, partial runs, the loss, labour, the register, the room type; Setup: the room type) |

## 12. Decisions (the lead's, 2026-11-12)

| # | Question the audit left open | Decision | Why |
|---|---|---|---|
| 1 | When is a block a cost? | When it goes into a room (placing day), bought or made | B2's rule (a cost when used) for blocks too: a big delivery waiting is stock, not a loss |
| 2 | A draw beyond the stock (bags never bought) | Unpriced now; priced by the next lot to come in, as Inventory's lots already end | Keeps Inventory's lots and Costs' cost of them the same; the note tells the owner what to enter |
| 3 | A count that found more | Priced at the item's latest priced lot before it | Found stock is worth what was last paid; leaving it unpriced would mark every later draw incomplete |
| 4 | A made batch's price live or stored | Live in every view (stored too, for the column's readers) | A purchase entered after the mix (the bags) must price the batch without editing it |
| 5 | The window for sharing a sale | 14 days up to the sale, by kg picked | The audit's suggestion; mushrooms keep days, not weeks |
| 6 | A sale tie: stored or worked out | Worked out on each read | Ties a sale already recorded; nothing to migrate; Sales' rows stay as entered |
| 7 | Your sales' window | 90 days, farm-wide | The audit's; long enough for a slow seller, short enough to follow the market |
| 8 | The price flag | More than 25 % off, on You set or Settings | The audit's 25 % |
| 9 | Who writes a run's block-in day | Runs (its first write), stored on Harvest's `runs` table | The run page is where the owner sees the run whole; Harvest's partial flag is unchanged |
| 10 | Measured loss when only some counted runs have batches | Not measured (the old rule for all) | Mixing a measured loss with "counted in the yield" would count some losses twice |
| 11 | Labour from Costs: with or without the employer's part | As entered in Costs, and the note says to enter it with EPF, SOCSO and EIS | Costs records what the farm pays |
| 12 | A room's share of the workers | By its blocks against the farm's blocks now | Economics plans a month now; block-days over a past month would lag a room just filled |
| 13 | Hours a worker gives | 208 a month (26 days × 8 h) | Malaysia's 48-hour week less rest days |
| 14 | Equipment write-off timing | Monthly from the month bought, on its day, like a monthly item | One rule the owner already knows from rent |
| 15 | Room type of the rooms of before | Container | The owner sets Room 1; guessing from the name or size would be wrong for someone |
| 16 | A built room's cost | RM 160 a m² of panel, 1 unit per 38 m³ | No sourced figure; a low-confidence estimate the owner replaces with a quote, flagged as such |
| 17 | Equipment register's parts | Six parts, one per Economics equipment figure, "Other" a new figure | Economics can replace each research figure with the owner's own |
| 18 | Your runs' farm-wide price fallback | Removed | Your sales replaces it; two farm-wide fallbacks would disagree |

## 13. Open for the owner

| # | Question | Until answered |
|---|---|---|
| 1 | Is Room 1 a built room? Setup → Room type | Economics prices it as a container (the note says so) |
| 2 | A real quote for Room 1's building and cooling | RM 160 a m² and one 2.5 hp per 38 m³ (low confidence) |
| 3 | Count the four runs of 4 Nov in Economics (their block-in days) | They stay out of Your runs |
| 4 | The plastic bags: enter their purchase | Container 1's blocks read RM 2.61 a block, "Plastic bags have no price" |
| 5 | Are the wages in Costs entered with EPF, SOCSO and EIS? | Economics reads them as entered |
| 6 | Foreign workers (levy RM 640 a year, EPF 2 %) | One cost for every worker; set "A worker's month" to your mix |
| 7 | Should a sale be tied to a run in the Sales dialog too (instead of on each read)? | Worked out on each read |

## 14. Testing

| Test | Covers |
|---|---|
| `tests/inventory-math.test.js` | `costedMoves`: oldest first, a throw-out's own lot, an out beyond the stock filled by a later lot, a count's lot priced at the last price, the golden five materials and the bags; lot and item value, RM 4,647.10 |
| `tests/batches-math.test.js`, `tests/batches.test.js` | `madeCost`: RM 1,340.90, RM 2.7935 a block, Plastic bags missing; live after a later purchase; over RM 1,000 still refused |
| `tests/costs-math.test.js`, `tests/costs-sources.test.js`, `tests/costs.test.js` | Placing-day charge (bought and made, split rows, lost while waiting); uses on a room's run and shared; September's purchases a cash line; the bought line; the sale steps (Room 1's RM 384; two runs shared by kg); the write-off (60 × RM 69.50; the last month's rest); profit before write-off |
| `tests/db-money-truth.test.js` | The step from a version 27 file: the table (STRICT), the trigger, both columns and their defaults; rooms, runs and sales kept |
| `tests/api-equipment.test.js` | The routes, the 400s with `field`, the `costs` event, a worker's 403 |
| `tests/runs.test.js`, `tests/api-runs.test.js` | `untied`; the block-in day's route (400, 409, the event) |
| `tests/economics*.test.js` | Your sales (RM 48.00), the flag, a counted partial run, the measured loss, labour as people, the register, the room types |
| `tests/web-*.test.js` | The words of each new line |
| Look | Inventory, Costs, Runs, a run, Summary, Economics and Setup at 1440 and 390 px, dark and light (the UI/UX audit step) |

## 15. After the reviews (2026-11-12)

| Change | Why |
|---|---|
| A delivery's blocks going out (lost, into a room) carry `lot_id` = its receipt move | Lots used oldest first took another delivery's blocks: stock worth + costs exceeded what was paid |
| Inventory values a made delivery's blocks lot with Batches' live price | A purchase entered after the mix priced the batch but not the stock |
| Picks indexed by crop and day for the sale steps; a run page ties only the lines that can reach it; the Summary skips the untied sum; Economics reads only its crop's picks in the counted runs' span (index `harvests_by_crop`, version 28) | On a 3-year farm the Runs list, Summary and Economics took seconds; now within about 1.3× of before (Economics' lion's mane about 2×, 140 ms) |
| The register's parts only; its write-off the planning figure | One item made every other part 0; a written-off item charged 0 while its RM counted |
| A use in a room since deleted stays on the farm's month | It was shared over the other runs |
| A sale's own or room's run counts only when it grows the sale's crop | A RM 20 grey oyster sale tagged Room 1 (lion's mane) was Room 1's income in Costs but not on its run page |
| A file at 28 without `harvests_by_crop` (an earlier build) gains it on open | The index came with the review |

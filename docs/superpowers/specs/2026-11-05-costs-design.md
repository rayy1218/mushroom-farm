# Costs: what the farm spends and what it makes (business module)

Date: 2026-11-05 · Branch `feat/costs` from `v2` at `7a0713e` · Database version 24 · One of four parallel business
modules (`~/.claude/task-logs/business/CONTRACT.md`): Batches, Inventory and Sales are built at the same time and merge
before Costs.

The owner chose (2026-11-05) every row marked *owner*: each bill entered as it happens, rent and base wages as monthly
items entered once; shared costs split over runs by block-days; a worker's base wage repeats and a sales bonus is entered by
hand when paid; block and purchase costs read live from Batches and Inventory, never copied, Batches winning for blocks; the
measured energy and water kept, an entered bill only topping up what was not measured; no equipment write-off; the page
leading with the month's profit; income from Sales only; the costs worked out on each read (approach A).

## 1. Scope

| In | Out (later) |
|---|---|
| Costs entered by hand: date, category, RM, for the farm or a container, a note *owner* | Equipment and its write-off *owner* |
| Monthly items (rent, base wages) entered once, repeating until stopped *owner* | Tax, loans, financing, the owner's own time |
| Labour per worker; a sales bonus as a one-off labour cost *owner* | Timesheets, hours × rate |
| Shared costs split over runs by block-days *owner* | A profit split per crop (a mixed room's energy is not split by crop) |
| Block cost from Batches, purchases from Inventory, read live *owner* | Copying their rows into `costs` (`source_kind` stays `'manual'`) |
| The measured energy and water; a bill topping up the unmeasured part *owner* | A CSV of the costs |
| Income from Sales; the unsold harvest value as a note only *owner* | Income from the harvest value |
| Profit per month, per run and per kg; 12 months of profit *owner* | Break-even price, forecasts |
| `GET /api/costs/summary` in the contract's shape | The Business top-bar entry (the integrator adds it at merge) |

## 2. Data (database version 24)

`costs`, STRICT, `CREATE TABLE IF NOT EXISTS`, made in `server/db.js`'s own block (`// ---- Costs ----`) by the step
`if (version < 24) { … }`; `VERSION = 24` on this branch.

| Column | Type | Rule |
|---|---|---|
| `id` | INTEGER PRIMARY KEY | |
| `date` | TEXT | YYYY-MM-DD, a real date, not after today and not before the first day of the oldest usage month kept (400 "Pick a date from 1 Oct 2025 to today"). The bounds are checked for a new cost and for an edit that gives a different date; an unchanged date is never re-checked. A monthly item: the first month it charges, and the day of the month it charges on; the new item of a Change may carry a date later this month (below). |
| `category` | TEXT | `'blocks'`, `'spawn'`, `'labour'`, `'rent'`, `'repairs'`, `'transport'`, `'packaging'`, `'utilities'`, `'other'` (the contract's list) |
| `amount` | REAL | RM, over 0 up to 1,000,000, stored to 2 places |
| `room_id` | INTEGER | Null: the whole farm. Else a room (a deleted room's costs become the farm's: the trigger `costs_room_gone`) |
| `run_id` | INTEGER | A one-off room cost: the run open in that room on its date, set on save (null when none was open). A monthly item and a farm cost: null. A deleted run's costs lose it (the trigger `costs_run_gone`). |
| `note` | TEXT | Up to 200 characters, trimmed; may be empty |
| `source_kind` | TEXT | Always `'manual'` (the contract's column: nothing is copied in) |
| `source_id` | INTEGER | Always null |
| `repeat` | TEXT | Null, or `'monthly'`. An electricity or water bill cannot repeat (400 "An electricity or water bill is entered each month"). |
| `repeat_until` | TEXT | YYYY-MM, the last month a monthly item charges; null: it keeps going. Not before the item's first month. Null on a one-off. |
| `worker` | TEXT | Labour only (null otherwise): a worker by the tasks' rule (`checkWorker`: an active worker when the farm has a list) |
| `utility` | TEXT | Utilities only (null otherwise): `'electricity'`, `'water'` or `'other'` |
| `period_from`, `period_to` | TEXT | An electricity or water bill only (null otherwise): the dates the bill covers, YYYY-MM-DD, from ≤ to, up to 62 days ("Pick the last day the bill covers, up to 62 days after the first"), near the bill's date: from up to 92 days before it ("Pick a first day up to 92 days before the bill’s date", `field: 'periodFrom'`) and to up to 31 days after it ("Pick a last day up to 31 days after the bill’s date", `field: 'periodTo'`). The period may reach past today (only the measured days up to today count). Default: the calendar month of the bill's date. |
| `created_at` | INTEGER | ms |

Indexes: `(date)`, `(room_id)`. The database has no foreign keys (rooms and runs are deleted by hand in `deleteRoom`, another module's block), so the step also makes two triggers: `costs_room_gone` (after a room's delete: its costs' `room_id` and `run_id` null) and `costs_run_gone` (after a run's delete: its costs' `run_id` null).

### 2.1 A monthly item

| Rule | Detail |
|---|---|
| Charges | Once a month on the day of its `date` (the month's last day when the month is shorter: 31 → 30 Nov, 28 or 29 Feb), from the month of `date` through `repeat_until`, or through the current month when null. Never a future month, never a future day of this month (charged on 25 Nov: not shown on 5 Nov). |
| Its run | A monthly room item finds each charge's run on read: the room's run open on that charge's date. |
| Change from a month | `POST /api/costs/:id/change { from: 'YYYY-MM', amount, note? }`: the item's `repeat_until` becomes the month before `from`, and a new monthly item starts on the same day in `from` with the new amount (the other fields copied), in one transaction. The new item charges on the clamped day (31 → 30 in a 30-day month) from then on, so its `date` may be later this month; editing it in place or changing it again keeps that date (an unchanged date is not re-checked). `amount` is required (400). `PUT` refuses a `repeat` different from the stored one (400 "Repeat changes through Change or Stop"). `from` must be after the item's first month and not after the current month; 400 otherwise. A `from` equal to the item's first month: the amount is edited in place (`PUT`). |
| Stop | `POST /api/costs/:id/stop { after: 'YYYY-MM' }`: `repeat_until` becomes `after` (not before its first month, not after the current month, and not after its current `repeat_until`: a Stop only shortens). |
| Delete | Removes every month: only for an item entered by mistake. The confirm says so: "Delete Rent, RM 1,500.00 a month, and every month it charged since Oct 2026?" |

## 3. Reading the other modules (`server/costs-sources.js`)

One file reads the other modules' tables by the contract's column names (section 5): `readSources(raw, fromMs, toMs)` on the raw `DatabaseSync` (the database object has no raw SQL), called by the one method `costSources(fromMs, toMs)` in `db.js`'s Costs block. A table that does not exist yet (checked in `sqlite_master`) gives an empty list, never an error, so Costs works before Batches, Inventory and Sales merge.

One function, `readSources(raw, fromMs, toMs)`, returns `{ batches: [{ batchId, runId, roomId, at, blocks, pricePerBlock, cost }], purchases: [{ id, itemId, name, kind, at, qty, unitCost, total }], sales: [{ id, at, crop, kg, total, roomId, runId }] }`. Times are ms, both ends inclusive.

| Source | Read | Rule |
|---|---|---|
| Batches (`batches`) | `batches` | Dated by `received_at`. `cost` = blocks × `price_per_block` rounded to 2 places, null when the price is null. A batch with no run (waiting to go in, or its container deleted): on the month it was received, not shared; placed, on its run (owner 2026-11-05). Made batches left out: their materials count as Inventory purchases (owner 2026-11-05, contract section 7). Batches' optional `kind` column is checked with `pragma_table_info`; `AND kind IS NOT 'made'` is added only when it exists. |
| Inventory (`stock_moves` ⋈ `stock_items`) | `purchases` | `ref_kind = 'purchase'` and `qty > 0`, by `at`. `total` = the total as paid: `COALESCE(total, qty × unit_cost)` when `stock_moves` has a `total` column (checked with `pragma_table_info`), else qty × `unit_cost`; rounded to 2 places, null when both are null. Kind `'blocks'` left out (Batches wins for blocks, owner). A `ref_kind = 'batch'` receipt is not a purchase. |
| Sales (`sales`) | `sales` | All sales in the range by `sold_at` |

The ranges are farm dates (the usage days' zone). Tests make the three tables with the contract's columns as fixtures.

## 4. The figures (`server/costs-math.js`, pure)

| Figure | Rule |
|---|---|
| A run's block-days in a month | The run's blocks (the sum of its `crops` blocks) × the days it was open in the month, its first and last day both counted; an open run up to today |
| Shared costs of a month | Farm costs (no room: one-offs and monthly charges), Inventory purchases in the month (`kind` not `'blocks'`), and the utilities top-up. A run's share: its block-days in the month ÷ every run's block-days in the month. A month with no block-days: they stay with the farm ("RM 300.00 of shared costs not shared: no blocks in this month"). |
| A room cost with no run | On the farm month; on no run; not shared |
| Block cost | Batches: on the batch's run and the month of `received_at`; a batch is received before its run starts, so a run's figures start 62 days before its start (`RUN_LEAD_DAYS`: before the start only the run's own lines land on it, it has no block-days there and no share). A batch's cost is rounded per batch (blocks × price to 2 places), so a cent may differ from Batches' own blockCost sum. A batch with no price: left out and named ("Container 1's blocks of 3 Oct have no price"; with no known room "Blocks received 3 Oct have no price"), the note carrying its run; the costs marked incomplete (`incomplete: true` on the month's figures, and on a run's when one of its own batches is unpriced). A batch with no run (waiting to go in, or its container deleted): on the month it was received, not shared; placed, on its run (owner 2026-11-05). |
| Measured energy and water | Each room's usage days (`roomDays`, `cachedOnly`) at today's prices, as Harvest's cost per kg: on the farm month, and on the room's run open that day. Water only when a water price is set ("electricity only" then). A day not worked out yet: the figure `pending` and a warm of that room started (Harvest's pattern: one at a time a room), which publishes `costs` `{}` when done; shown as "Working out the energy cost…"; while pending, the month's (or run's) costs, profit, cost per kg and profit per kg are null ("—"), never a partial figure. A pending day pends the month and the run open that day in that room, not the other runs: a closed run keeps its figures while another room works out a day. Each room's figure is rounded per run (a line per room and run). |
| Utilities top-up | Per electricity or water bill: the bill − the measured cost of that utility over all rooms over the bill's period. The measured part is the sum of the same per-room, per-run rounded amounts as the measured lines over the bill's period, so a month never exceeds its bill by a sen. Over 0: a shared "Unmeasured electricity" (or water) cost in the month the bill's period ends (owner 2026-11-05), on its last day (today while that is still to come); the entry stays listed in the month of its date, its `topUp` naming the month it went to. Two bills of one utility whose periods overlap share the measured cost of the days both cover in proportion to their amounts, so it is taken off once (the period cut where the covering bills change; each piece's measured cost × this bill's amount ÷ the covering bills' amounts). Exactly 0: nothing added, no note. Under 0: nothing added, a note "Measured RM 612.40 is above the electricity bill of RM 580.00: the estimate runs high". The bill's own amount is never counted as a cost (the measured part already is). A bill whose period has a pending day: the top-up pending too, and with it the month it lands in and every run with block-days in that month (their share is not known yet). A bill with no period (an old row): the calendar month of its date, landing in that month. A bill whose period starts before the usage days kept (400 days back): its whole amount counts as shared, noted. `'other'` utilities: a plain cost (shared, or the room's). |
| Income | Sales: a month's income is its sales by `sold_at`. A run's: its sales with that `run_id`, plus sales with no `run_id` and that room's `room_id` sold while the run was open (up to today when open). Sales with neither, or with a `run_id` that is no run (nor a harvest's): the month only. |
| Not yet sold | Shown when the kg picked exceed the kg sold: a note beside Income, "6.0 kg picked and not yet sold (about RM 84.00 at your expected prices)". Only the unsold part is valued: Harvest's RM value of the kg picked (`valueOf` with the crop prices) × the unsold kg ÷ the kg picked. When a picked crop has no price, no value: "6.0 kg picked and not yet sold" (no "about" part, rather than a low figure). Never in profit. |
| Costs | The sum of: own costs (one-offs, monthly charges), block cost, measured energy and water, the share of shared costs (a run), or every cost (a month) |
| Profit | Income − costs |
| Cost per kg | Costs ÷ kg harvested (Harvest's harvests in the month, or the run's); null with no kg |
| Profit per kg | Profit ÷ kg sold; null when nothing was sold ("—") |
| A run across months | Each month's share worked out with that month's block-days; the run's figures sum its months, from the month 62 days before its start (its blocks) to today |
| Gaps (`notes`) | Each missing input named, never guessed: a batch with no price, a purchase with no unit cost (either: `incomplete`), no sales recorded in the month, no water price, a pending energy day. A note is shown once per kind, text and run: two runs' notes of the same text both kept. |
| Rounding | RM to 2 places at each sum; each run's share floored to the whole sen, the last run of a month taking the remainder, so the shares sum to the month's shared total and none is negative |

## 5. API (`server/costs-api.js`, wired by one line in `server/api.js`)

| Route | Reply |
|---|---|
| `GET /api/costs/month?month=YYYY-MM` | `{ month, today, first (the oldest month kept, YYYY-MM), tiles: { income, costs, profit, costPerKg, profitPerKg, kgHarvested, kgSold, unsold, incomplete }, notes: [{ kind, text }], byCategory: [{ key, label, source, amount, share }], entries: [cost charge], repeating: [cost row], runs: [run view], last12: [{ month, income, costs, profit, pending }], pending }`. Default: the current month; a month after it or before the 400 usage days: 400 with `field: 'month'` (the page then shows this month). An entry of an electricity or water bill carries `topUp: { amount, month }`: what it adds, the amount of its "Unmeasured" line (0 when the measured cost covers it, null while a day of its own period is worked out), and the month it lands in (its period's end). A run view: `{ id, roomId, roomName, startedAt, endedAt, crops, income, costs, profit, kgHarvested, kgSold, costPerKg, profitPerKg, parts: { blocks, energy, water, own, shared }, notes, pending, incomplete }`. |
| `GET /api/costs/summary?from=&to=&run=` | The contract's shape: `{ total, byCategory: [{ category, amount }], energy, water, income, profit, profitPerKg }`. `from`/`to` farm dates (default: this month); `run` instead gives the run's figures, its `byCategory` adding a `'shared'` entry (the run's share of the shared costs). `energy` and `water` null while pending (never a partial figure); `water` null when no water price is set. 400 for a bad date, 404 for no such run. |
| `GET /api/costs` | `{ costs: [row] }`, every row (the edit dialogs) |
| `POST /api/costs` | `{ date, category, amount, roomId?, note?, repeat?, worker?, utility?, periodFrom?, periodTo? }` → 201 the row. 400 with `field` for a bad field: "Enter an amount over RM 0, up to RM 1,000,000", labour with no worker "Pick who was paid" (the tasks' other worker messages as they are). |
| `PUT /api/costs/:id` | The same fields → the row (a one-off's run found again from its room and date). 404, 400. |
| `DELETE /api/costs/:id` | 204. 404. |
| `POST /api/costs/:id/change` | Section 2.1 → `{ ended: row, started: row }`. 400 on a one-off. |
| `POST /api/costs/:id/stop` | Section 2.1 → the row. 400 on a one-off. |
| Events | Every write publishes `costs` `{}`; `'costs'` added to `EVENT_TYPES` in `web/live.js`. |

Rows as JSON are camelCase (`roomId`, `runId`, `repeatUntil`, `periodFrom`, …).

## 6. The page (`#/business/costs`)

`web/costs-page.js`, `mount(container, opts)` returning an unmount, added to `web/route.js` and `web/app.js`. Until the
merge it is reached by its address; the integrator adds the Business entry.

| Part | Design |
|---|---|
| Head | "Costs", a month stepper (‹ November 2026 ›: two 44 px buttons, disabled at the ends; one that had the focus hands it to the other), **Add a cost**. The address keeps `?month=YYYY-MM` (replaced in place). A month step reads only that month; the costs and rooms lists (the dialogs') are read at first and on the `costs` and `room` events. While another month is asked for, the figures on show stay dimmed (`aria-busy`) until its answer comes, a failure included. |
| Month card | Tiles: Profit first, in Display (32 px, 28 px on a phone, its own row there), then Income, Costs, Cost per kg, Profit per kg. A loss: "−RM 1,240.00" in the loss tone with the word "Loss" (never by colour alone); a profit per kg under 0 in the loss tone too. "Nothing sold" on both Income and Profit per kg; else "683.0 kg sold" under Income and "on 683.0 kg sold" under Profit per kg. While the energy is worked out: "—" with "working out" on the four figures it feeds, and one note "Working out the energy cost…" first under the tiles. The notes (not yet sold, gaps); a batch or a purchase with no price in the warning text. On a phone the four two a row; one long figure sets them all a size down. |
| 12 months | "Profit, last 12 months (RM)" (the title follows the months drawn: "last 11 months" when only 11 are kept, "last 6 months" on a phone): bars of the months up to the shown one (those kept), above and below a zero line on one scale (one step from `niceScale` of the larger side, its multiples both ways; a tick under 28 px from the one before left out), ticks bare ("10,000", "−5,000"); the shown month marked and its profit printed at its bar's end (every bar's when a month's slot is 60 px or more). A bar is a link to its month, named "October 2026: profit RM 3,764.00", "loss RM 4,805.00", "nothing recorded" or "working out"; one Tab stop, ← → Home End along the bars. A pending month's bar a hatched stub with a dashed edge. A phone whose slots would be under 24 px shows the last 6 months. No income and no costs in any month: "No figures yet." in place of the chart. |
| By category | A table: category, RM, share of the month's costs; each line's source in a muted line: "from Batches", "from Inventory", "measured", "bill − measured", and "entered" on a line entered here whose name also comes from another source. A Total row, the Costs tile's figure. Energy and water are their own lines (Electricity measured, Water measured, Unmeasured electricity, Unmeasured water). |
| Entries | The month's charges, newest first: date, category, what (the worker, the note; "monthly" as a tag), for whom ("The farm" or the container), RM, a quiet Edit. An electricity or water bill tagged "bill" with what it adds under it: "adds RM 580.00 unmeasured" ("… unmeasured to October" when its period ends in another month) or "adds nothing: measured is higher". A block each when the list is under 560 px wide (a phone; the left column at 1024 px). Batches and Inventory lines are not here (they are edited at their source); the By category table names them. |
| Monthly items | The monthly items charging in the shown month, their columns lined up (one grid, each item its subgrid): what, for whom, RM a month, "since Jul 2026" (", until Oct 2026"; "Aug 2026 only"), **Change** and **Stop**. |
| Runs | The runs open at any time in the month, each with its whole figures (every month it spans, not only this month's part): Dates, Container, Crops (the main crop's 24 px picture, `aria-hidden`, before the names: Harvest's By crop), Income, Costs, Profit, Profit per kg; the dates a button opening the run's breakdown under it (blocks, "no price" when a batch of it has none; energy, water, own costs, share of shared, income, kg picked and sold, the notes; no side stripe), the focus kept on it. "Some costs have no price" under its Costs when incomplete; a loss and a profit per kg under 0 in the loss tone; while a run is worked out, "Working out the energy cost of some runs…" above the table. On a phone each run a block of labelled figures, its breakdown two a row. |
| Add / Edit dialog | Date, category, RM, for (The farm · Container 1 · …), worker (labour: the active workers, none picked, "Pick a name"; a text box only when the farm has no list; names that could not be read say so, never a box to guess in), utility kind and period (utilities: Kind, Bill from, Bill to before Amount; the period for electricity and water, filled with the date's month and following the date until changed by hand; "Up to 92 days before the date", "Up to 62 days after Bill from"; the browser checks the period's limits before sending), note, "Every month" (Add only). Amounts in their boxes grouped as the page shows them ("1,800.00"). A bill says under Amount: "The measured electricity already counts; only the part not measured (bill − measured) is added." The browser checks the amount and the worker before sending. A one-off room cost shows where it lands: "On Container 1’s run of 3 Oct." or "No run in Container 1 then: on the farm’s month." Edit of a one-off: every field, and a quiet red "Delete this cost". Edit of a monthly item: amount and note "from [month]" (Change), with a quiet Stop and a quiet red "Delete this item". |
| Stop | The last month, this month first. A month gone by removes the charges after it: a warning names them ("November’s charge of RM 1,800.00 goes too.") and the button reads "Stop and remove 1 charge", a Danger button (red); blue again when the pick removes nothing. |
| Delete | A monthly item's confirm names what goes: "5 charges, RM 7,500.00, Jul–Nov 2026". |
| Layout | Two columns from 900 px (the month card and the runs across both). Leaving the page closes its dialog. |
| Empty month | "No costs recorded for November 2026." with **Add a cost**; measured energy still shows. |
| Live | Reloads on `costs`, `harvest`, `sales`, `batches`, `inventory` events (the last three are no-ops until those modules publish). |
| Numbers | One formatter in `web/costs-math.js` (the One Format Rule): RM 2 places with grouping, a loss with a leading "−"; cost and profit per kg by Harvest's `costKgText` rule (never a false RM 0.00); kg by Harvest's formatter (`web/harvest-math.js`). |
| Styles | One `.co-` block at the end of `web/styles.css` between `/* ---- Costs ---- */` comments, tokens only; profit and loss in the existing state tokens. |
| Docs | A Costs row or section in `DESIGN.md`, `README.md` and `PRODUCT.md` (Capabilities: "Costs"), not rewording others. |

Works at 1440, 1024 and 390 px, both themes.

## 7. Testing

| Test | Covers |
|---|---|
| `tests/costs-math.test.js` (pure) | Monthly charges (day 31 in a 30-day month and in February, a stop, a change from a month, never a future month or day); block-days across a month boundary and for an open run; the shared split with remainders, a month with no blocks; the top-up both ways and pending; income by run and by room; profit, cost per kg, profit per kg; the notes |
| `tests/db-costs.test.js` | The step to 24 (STRICT, made once, upgrade from 20), add, edit, delete, change, stop, the triggers for a deleted room and run |
| `tests/costs-sources.test.js` | The three tables missing (empty) and present (fixtures with the contract's columns): the `'blocks'` purchases left out, an unpriced batch, a purchase with no unit cost, sales in a range |
| `tests/costs.test.js` | The month view and the summary shape against fixtures; change and stop; pending energy and the warm's event |
| `tests/api-costs.test.js` | The routes, the 400s with `field`, the 404s, the `costs` event on each write |
| `tests/web-costs-math.test.js` | The formatter, a loss's text, the tile rows, the bars' scale |
| Look | 1440, 1024 and 390 px, both themes (the UI/UX audit step) |

Test servers use ports 19050–19099; throwaway databases under `/tmp/costs/`.

## 8. Contract

The new columns are on `costs`, which Costs owns; the category list is the contract's. What Costs reads of the other modules is in the contract's section 7 Costs row (2026-11-05, owner's yes): made batches left out (their materials are Inventory's purchases), `stock_moves.total` read when that column exists, `batches.kind` read only when it exists.

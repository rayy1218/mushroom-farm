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
| `date` | TEXT | YYYY-MM-DD, a real date, not after today. A monthly item: the first month it charges, and the day of the month it charges on. |
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
| `period_from`, `period_to` | TEXT | An electricity or water bill only (null otherwise): the dates the bill covers, YYYY-MM-DD, from ≤ to, up to 62 days. Default: the calendar month of the bill's date. |
| `created_at` | INTEGER | ms |

Indexes: `(date)`, `(room_id)`. The database has no foreign keys (rooms and runs are deleted by hand in `deleteRoom`, another module's block), so the step also makes two triggers: `costs_room_gone` (after a room's delete: its costs' `room_id` and `run_id` null) and `costs_run_gone` (after a run's delete: its costs' `run_id` null).

### 2.1 A monthly item

| Rule | Detail |
|---|---|
| Charges | Once a month on the day of its `date` (the month's last day when the month is shorter: 31 → 30 Nov, 28 or 29 Feb), from the month of `date` through `repeat_until`, or through the current month when null. Never a future month, never a future day of this month (charged on 25 Nov: not shown on 5 Nov). |
| Its run | A monthly room item finds each charge's run on read: the room's run open on that charge's date. |
| Change from a month | `POST /api/costs/:id/change { from: 'YYYY-MM', amount, note? }`: the item's `repeat_until` becomes the month before `from`, and a new monthly item starts on the same day in `from` with the new amount (the other fields copied), in one transaction. `from` must be after the item's first month and not after the current month; 400 otherwise. A `from` equal to the item's first month: the amount is edited in place (`PUT`). |
| Stop | `POST /api/costs/:id/stop { after: 'YYYY-MM' }`: `repeat_until` becomes `after` (not before its first month, not after the current month). |
| Delete | Removes every month: only for an item entered by mistake. The confirm says so: "Delete Rent, RM 1,500.00 a month, and every month it charged since Oct 2026?" |

## 3. Reading the other modules (`server/costs-sources.js`)

One file reads the other modules' tables by the contract's column names (section 5): `readSources(raw, fromMs, toMs)` on the raw `DatabaseSync` (the database object has no raw SQL), called by the one method `costSources(fromMs, toMs)` in `db.js`'s Costs block. A table that does not exist yet (checked in `sqlite_master`) gives an empty list, never an error, so Costs works before Batches, Inventory and Sales merge.

| Source | Read | Rule |
|---|---|---|
| Batches (`batches`) | `blockCosts(from, to)` → `[{ batchId, runId, roomId, receivedAt, blocks, pricePerBlock, cost }]` | `cost` = blocks × `price_per_block`, null when the price is null. Dated by `received_at`. A batch with no `run_id` yet: on its room's month only. |
| Inventory (`stock_moves` ⋈ `stock_items`) | `purchases(from, to)` → `[{ id, itemId, name, kind, at, qty, unitCost, total }]` | `ref_kind = 'purchase'` and `qty > 0`. `total` = qty × `unit_cost`, null when `unit_cost` is null. Kind `'blocks'` left out (Batches wins for blocks *owner*). |
| Sales (`sales`) | `sales(from, to)` → `[{ id, soldAt, crop, kg, total, roomId, runId }]` | All sales in the range by `sold_at` |

The ranges are farm dates (the usage days' zone). Tests make the three tables with the contract's columns as fixtures.

## 4. The figures (`server/costs-math.js`, pure)

| Figure | Rule |
|---|---|
| A run's block-days in a month | The run's blocks (the sum of its `crops` blocks) × the days it was open in the month, its first and last day both counted; an open run up to today |
| Shared costs of a month | Farm costs (no room: one-offs and monthly charges), Inventory purchases in the month (`kind` not `'blocks'`), and the utilities top-up. A run's share: its block-days in the month ÷ every run's block-days in the month. A month with no block-days: they stay with the farm ("RM 300.00 of shared costs not shared: no blocks in this month"). |
| A room cost with no run | On the farm month; on no run; not shared |
| Block cost | Batches: on the batch's run and the month of `received_at`. A batch with no price: left out and named ("Container 1's blocks of 3 Oct have no price"; with no known room "Blocks received 3 Oct have no price"), the note carrying its run; the costs marked incomplete (`incomplete: true` on the month's figures, and on a run's when one of its own batches is unpriced). A batch with no run and no room: shared. |
| Measured energy and water | Each room's usage days (`roomDays`, `cachedOnly`) at today's prices, as Harvest's cost per kg: on the farm month, and on the room's run open that day. Water only when a water price is set ("electricity only" then). A day not worked out yet: the figure `pending` and a warm of that room started (Harvest's pattern: one at a time a room), which publishes `costs` `{}` when done; shown as "Working out the energy cost…"; while pending, the month's (or run's) costs, profit, cost per kg and profit per kg are null ("—"), never a partial figure. A pending day pends the month and the run open that day in that room, not the other runs: a closed run keeps its figures while another room works out a day. Each room's figure is rounded per run (a line per room and run). |
| Utilities top-up | Per electricity or water bill: the bill − the measured cost of that utility over all rooms over the bill's period. The measured part is the sum of the same per-room, per-run rounded amounts as the measured lines over the bill's period, so a month never exceeds its bill by a sen. Over 0: a shared "Unmeasured electricity" (or water) cost in the month of the bill's `date`. Exactly 0: nothing added, no note. Under 0: nothing added, a note "Measured RM 612.40 is above the electricity bill of RM 580.00: the estimate runs high". The bill's own amount is never counted as a cost (the measured part already is). A bill whose period has a pending day: the top-up pending too, and with it the month and every run with block-days in that month (their share is not known yet). A bill with no period (an old row): the calendar month of its date. A bill whose period starts before the usage days kept (400 days back): its whole amount counts as shared, noted. `'other'` utilities: a plain cost (shared, or the room's). |
| Income | Sales: a month's income is its sales by `sold_at`. A run's: its sales with that `run_id`, plus sales with no `run_id` and that room's `room_id` sold while the run was open (up to today when open). Sales with neither, or with a `run_id` that is no run (nor a harvest's): the month only. |
| Not yet sold | Shown when the kg picked exceed the kg sold: a note beside Income, "6.0 kg picked and not yet sold (about RM 84.00 at your prices)". Only the unsold part is valued: Harvest's RM value of the kg picked (`valueOf` with the crop prices) × the unsold kg ÷ the kg picked. When a picked crop has no price, no value: "6.0 kg picked and not yet sold" (no "about" part, rather than a low figure). Never in profit. |
| Costs | The sum of: own costs (one-offs, monthly charges), block cost, measured energy and water, the share of shared costs (a run), or every cost (a month) |
| Profit | Income − costs |
| Cost per kg | Costs ÷ kg harvested (Harvest's harvests in the month, or the run's); null with no kg |
| Profit per kg | Profit ÷ kg sold; null when nothing was sold ("—") |
| A run across months | Each month's share worked out with that month's block-days; the run's figures sum its months |
| Gaps (`notes`) | Each missing input named, never guessed: a batch with no price, a purchase with no unit cost (either: `incomplete`), no sales recorded in the month, no water price, a pending energy day. A note is shown once per kind, text and run: two runs' notes of the same text both kept. |
| Rounding | RM to 2 places at each sum; each run's share floored to the whole sen, the last run of a month taking the remainder, so the shares sum to the month's shared total and none is negative |

## 5. API (`server/costs-api.js`, wired by one line in `server/api.js`)

| Route | Reply |
|---|---|
| `GET /api/costs/month?month=YYYY-MM` | `{ month, today, tiles: { income, costs, profit, costPerKg, profitPerKg, kgHarvested, kgSold, unsold }, notes: [{ kind, text }], byCategory: [{ key, label, source, amount, share }], entries: [cost charge], repeating: [cost row], runs: [run view], last12: [{ month, income, costs, profit, pending }], pending }`. Default: the current month; a month after it or before the 400 usage days: 400. A run view: `{ id, roomId, roomName, startedAt, endedAt, crops, income, costs, profit, kgHarvested, kgSold, costPerKg, profitPerKg, parts: { blocks, energy, water, own, shared }, notes }`. |
| `GET /api/costs/summary?from=&to=&run=` | The contract's shape: `{ total, byCategory: [{ category, amount }], energy, water, income, profit, profitPerKg }`. `from`/`to` farm dates (default: this month); `run` instead gives the run's figures, its `byCategory` adding a `'shared'` entry (the run's share of the shared costs). `energy` and `water` null while pending (never a partial figure); `water` null when no water price is set. 400 for a bad date, 404 for no such run. |
| `GET /api/costs` | `{ costs: [row] }`, every row (the edit dialogs) |
| `POST /api/costs` | `{ date, category, amount, roomId?, note?, repeat?, worker?, utility?, periodFrom?, periodTo? }` → 201 the row. 400 with `field` for a bad field. |
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
| Head | "Costs", a month stepper (‹ November 2026 ›; the next arrow off at the current month), **Add a cost**. The address keeps `?month=YYYY-MM`. |
| Month card | Tiles: Income, Costs, Profit, Cost per kg, Profit per kg. A loss: "−RM 1,240.00" with the word "Loss" (never by colour alone). Under the tiles, the notes (not yet sold, gaps, pending energy). On a phone two tiles a row, the odd last one the whole row (Harvest's rule). |
| 12 months | Profit bars of the 12 months up to the shown one, above and below a zero line, the scale by `niceScale`; the shown month marked; a bar is a link to its month. A pending month's bar hatched with "working out". |
| By category | A table: category, RM, share of the month's costs; each line's source in a muted line: "from Batches", "from Inventory", "measured", "bill − measured". Energy and water are their own lines (Electricity measured, Water measured, Unmeasured electricity, Unmeasured water). |
| Entries | The month's charges, newest first: date, category, what (the worker, the note; "monthly" as a tag), for whom ("The farm" or the container), RM, a quiet Edit. On a phone each a block. Batches and Inventory lines are not here (they are edited at their source); the By category table names them. |
| Monthly items | The monthly items charging in the shown month: what, for whom, RM a month, since when, **Change** and **Stop**. |
| Runs | The runs open at any time in the month, each with its whole figures (every month it spans, not only this month's part): Dates, Container, Crops, Income, Costs, Profit, Profit per kg; the dates a button opening the run's breakdown under it (blocks, energy, water, own costs, share of shared, income, the notes). On a phone each run a block of labelled figures. |
| Add / Edit dialog | Date, category, RM, for (The farm · Container 1 · …), worker (labour), utility kind and period (utilities; the period for electricity and water, default the date's month), note, "Every month" (Add only). A one-off room cost shows where it lands: "On Container 1's run of 3 Oct" or "No run then: on the farm month". Edit of a one-off: every field, and a quiet red "Delete this cost". Edit of a monthly item: amount and note "from [month]" (Change), its Stop and its Delete. |
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

No change to the contract: the new columns are on `costs`, which Costs owns; the category list is the contract's.

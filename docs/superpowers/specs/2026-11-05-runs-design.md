# Runs: a run of blocks from every module's side (the Run page)

Date: 2026-11-05 · Branch `feat/runs` from `v2` at `ff73338` (live v2 and the Business audit fixes) · Database version 24,
no step · Approved design: `/tmp/joint/runs-design.md`

The owner chose (2026-11-05) every row marked *owner*: the build order Run page → Business summary → Economics; the run page
under Business (`#/business/runs/<id>`) with a Runs list as the fifth Business tab (Batches · Inventory · Sales · Costs ·
Runs); the run page leading with Profit so far; the Runs list showing money and yield; approach A, a server module that
composes the run on each read, with no new tables.

## 1. Scope

| In | Out (later) |
|---|---|
| The Runs tab: every run of blocks with its container, crops, dates, kg, kg per block, income, costs and profit; a crop filter *owner* | Sorting by a column, paging, a date range |
| A run's page: Profit so far first, then income, costs, kg picked, kg per block and BE; its blocks, harvests, sales and costs *owner* | Editing anything there: each figure is changed in the module that keeps it |
| A server module composing a run from Harvest, Batches, Sales and Costs on each read (approach A) *owner* | A runs table, a stored summary, a database step |
| One marked `// ---- Runs ----` block in `server/db.js` (`allRuns`) and one in `server/costs.js` (`runViews`) | Any change to how Harvest, Batches, Sales or Costs work out a figure |
| Links in: Harvest's This run and Past runs, Costs' run breakdown, Batches' room heads *owner* | A link from Sales (it names rooms, never runs: section 6.3) |
| The Business summary and Economics *owner* | Built next, in that order |

## 2. Data (database version 24, no step)

No table and no column is added; `VERSION` stays 24. `server/db.js` gets one marked block in its returned object, after
`costSources`:

| Method | Reply | Rule |
|---|---|---|
| `allRuns()` | `[{ id, roomId, startedAt, endedAt, crops, partial, roomName }]` | Every row of `runs` (`runOf`'s shape) with `LEFT JOIN rooms` for `roomName`, `ORDER BY started_at DESC, id DESC`. `roomName` null when the room is not there. |

A deleted room's runs are deleted with it (`deleteRoom` runs `deleteCropRuns`), so `roomName` is null only in a database
edited by hand; the code and the page still read it (section 9). A run id is reused when the newest run is deleted with its
room (`runs.id` is `INTEGER PRIMARY KEY` without `AUTOINCREMENT`); an old link then opens the new run, as Batches' `?run=`
links do.

## 3. Composition per source (`server/runs.js`)

`createRuns({ db, harvests, batches, sales, costs })` → `{ list({ crop }), view(id) }`. Pure composition over each module's
own functions; no state, no HTTP. `harvests` and `batches` are `server/api.js`'s own services (Harvest's figures take
Batches' dry kg per block, and Harvest's usage warm publishes `harvest` there); `sales` and `costs` are made by the routes
(section 5).

| Source | Function read | Fields taken | Rule |
|---|---|---|---|
| Runs | `db.allRuns()` (list), `db.getRunById(id)` and `db.getRoom(roomId)` (view) | `id, roomId, roomName, crops, partial, startedAt, endedAt` | The list's order: the open runs first, then the ended ones, each newest started first |
| Harvest | `harvests.roomView(roomId)`, once per room that has a run; its `current` and `past` views by run id | `kg, perBlock, be, byCrop, flushes, missing, harvests` (newest pick first) | No change to `server/harvests.js`: the room view already holds every run's figures (`runFigures`). A room the view does not find (gone between reads) gives no figures |
| Batches | `batches.list({ run: id })` | `batches` (Batches' views), `blockCost` | View only. `blockCost` null when a batch has no price; 0 with no batches |
| Sales | `sales.summary({ run: id })`; `db.salesBetween(-8.64e15, 8.64e15)` filtered by `runId` | `kg, total, byCrop`; the lines, newest delivery first, a delivery's lines in the order entered (fixes 2026-11-05): `{ id, deliveryId, soldAt, buyer, invoiceNo, crop, kg, priceKg, total, paidAt }` | View only. Sales has no "lines of a run" function; the run's lines are its rows by `run_id`, as `summary({ run })` reads them. A line belongs to the run when the sale named the container: Sales sets `run_id` from the run open in that room at the sale (`runAt`) |
| Costs | `costs.runViews()` (list) and `costs.runViews({ run: id })` (view) | `income, costs, profit, profitPerKg, kgSold, pending, incomplete, parts, byCategory, notes` | The new marked block below |

### 3.1 Costs' Runs block (`server/costs.js`)

| Method | Reply | Rule |
|---|---|---|
| `runViews({ run = null } = {})` | `[run view]`, each exactly as `monthView`'s `runs` give it: `{ id, roomId, roomName, startedAt, endedAt, crops, parts: { blocks, energy, water, own, shared }, byCategory, income, kgHarvested, kgSold, costs, profit, costPerKg, profitPerKg, notes, pending, incomplete }` | One `dataFor` read from the earliest wanted run's first month (`runFirstMonth`) less `MAX_BILL_DAYS`, every run in it (the shared split needs them all), the months memoised once (`monthsOf`) for all; `runTotals` per run. `run`: that run alone, `[]` when there is no such run (no 404 here). A cold usage day starts Costs' warm, as every Costs view does |

Why a helper: `summary({ run })` has the money but not the breakdown (`parts`) Costs' page shows, and the list would repeat
the whole read once per run. Each run's `costs`, `income`, `profit` and `profitPerKg` equal `summary({ run })`'s `total`,
`income`, `profit` and `profitPerKg` (a test holds it).

## 4. The figures

### 4.1 A row (`list`)

| Field | From | Rule |
|---|---|---|
| `id, roomId, roomName, crops, partial, startedAt, endedAt` | `allRuns` | `crops`: `[{ crop, blocks }]` as the run holds them |
| `kg` | Harvest | The run's total, 2 places; 0 without figures |
| `perBlock` | Harvest | kg over all the run's blocks (a mixed run's whole), 2 places; 0 with nothing picked; null without figures |
| `income` | Costs | RM, 0 without figures |
| `costs`, `profit` | Costs | RM; null while pending (never a partial figure) and without figures |
| `profitPerKg` | Costs | Profit over kg sold; null while pending, with nothing sold and without figures (fixes 2026-11-05: on the row, for the list's Profit per kg) |
| `pending` | Costs | True while a usage day the run needs is still worked out |
| `incomplete` | Costs | True when a batch or a purchase with no price was left out |

### 4.2 A run (`view`): the row and

| Field | From | Rule |
|---|---|---|
| `kgSold` | Costs | kg of the run's sales |
| `be` | Harvest | Null when a crop has no dry kg (no block weight, nothing in Settings → Yield) |
| `byCrop` | Harvest | `[{ crop, blocks, kg, perBlock, be, value }]`, one per crop: a mixed run's yield per crop |
| `flushes` | Harvest | `[{ flush, from, to, kg, byCrop, perBlock, be }]` |
| `missing` | Harvest | `{ dryKg: [crop], price: [crop] }` |
| `harvests` | Harvest | The latest `LATEST_HARVESTS` (3) picks, newest first (fixes 2026-11-05: 8 before) |
| `harvestCount` | Harvest | Every pick of the run |
| `batches`, `blockCost` | Batches | Section 3 |
| `sales` | Sales | `{ kg, total, byCrop: [{ crop, kg, total }], lines }` |
| `costsByKind` | Costs | `{ parts, byCategory, notes }`; null without Costs' view of the run |
| `prices` | Settings | `{ electricity, water }` (`readSettings`, RM per kWh and per m³, null when not set): a 0 electricity or water with a price is "not recorded yet", without one "no price set" (fixes 2026-11-05) |

`sales.total` equals `income` (both are the run's sale lines; a test holds it). Profit is Costs' (income less costs), never
worked out again here.

## 5. API (`server/runs-api.js`, wired in `server/api.js`)

| Route | Reply |
|---|---|
| `GET /api/runs?crop=` | `{ runs: [row] }` (section 4.1). `crop`: missing or empty for every run, else a crop key (`CROP_KEYS`): the runs that have that crop. 400 `{ error: 'Pick a crop', field: 'crop' }` for another word |
| `GET /api/runs/:id` | The row and section 4.2's fields. 404 `{ error: 'Run not found' }` for no such run (a deleted room's run too) |
| Any other method | 404 "Not found" |
| Events | None of its own (`'runs'` is not an event). Its own Costs service's warm, when done, publishes `costs` `{}`, so a page waiting for the energy asks again |

`createRunRoutes({ db, events, harvests, batches, now, zone })` makes `createCosts({ db, now, zone })` (its warm publishes
`costs`) and `createSales({ db, now })` (it never writes, so never tells), and turns a 4xx error with `status` into the API's
`HttpError` (as Costs' routes do). `server/api.js` gets four marked lines: the import, `createRunRoutes({ db, events,
harvests, batches })` after the Costs routes, the route call after Costs', and `runRoutes.close()` in `api.close`.

## 6. Pages

### 6.1 The Runs tab (`#/business/runs`, `?crop=`)

`web/runs-page.js` `mount(container, { crop })`, under the Business strip (`.bz-page`), the fifth tab: `BUSINESS_TABS` gains
`{ key: 'runs', label: 'Runs', hash: RUNS_HASH }`; `#/business` remembers it as any tab.

| Part | Design |
|---|---|
| Head | "Runs", "Each run of blocks: what it picked, sold and cost.", a **Crop** select (All crops, then each crop by its short name; Calendar's `.field` select). A change replaces the address (`runsHash(crop)`) and reads again in place, the list dimmed (`aria-busy`) until the answer |
| Table | One card. Columns: Run, Crops, kg, kg per block, Income, Costs, Profit, Profit per kg (fixes 2026-11-05). Run is the row's `th` and its link to the run page: the container and Costs' run days, "Container 1 · 24 Sep – now", "Container 1 · 24 Sep – 20 Dec" (`runRow`'s `dates`; "recorded 24 Sep – now" for a run under way at the upgrade; "A deleted room · …"). Crops: the main crop's 24 px picture (`aria-hidden`) before "600 Grey oyster" ("300 Grey oyster · 100 Lion's mane"). A loss keeps its minus, only the figure in the loss tone, "Loss" under Profit; under Costs "working out" while pending, else "Some costs have no price" when incomplete; a run without Costs' view (its room gone) a dash. Under the table Costs' line "Shared costs (rent, wages, …) are split over the runs by block-days." The table keeps ARIA roles (`table`, `row`, `rowheader`, `cell`) and its caption as its name; its box, where it scrolls (over 600 px), is a named region with a Tab stop. The paint key holds the crop, so the caption follows it |
| Phone (≤ 600 px) | Each run a block of labelled figures (the label's alt text empty: read once, from its column): its container and days the heading (a 44 px tap) with Profit beside it, then Crops across, then three a row; no gap above the first run |
| Empty | "No runs yet. A run starts when a container gets its blocks on its Crop tab."; with a crop, "No runs of Pink oyster." |

### 6.2 A run's page (`#/business/runs/<id>`)

`web/runs-page.js` `mountRun(container, { id })`, into the view (no strip; a back link, as a batch's page).

| Part | Design |
|---|---|
| Head | "← Runs" (hidden on the gone card, which has its own); the title "600 Grey oyster blocks" ("300 Grey oyster and 100 Lion's mane blocks"; "1 Grey oyster block"); under it "Container 1 · since 4 Nov" ("· 4 Nov – 20 Dec" ended; "recorded since 4 Nov" for a run under way at the harvest upgrade), the container a link to its Harvest tab. The page's title is the run's |
| Money and yield | A card of seven tiles (`us-tiles hv-tiles co-tiles`, Harvest's tiles in Costs' month-card look): **Profit so far** in display size ("Profit" once ended) on its own row, then Income ("40.0 kg sold" or "Nothing sold"), Costs ("Some costs have no price"), Profit per kg (Costs' `perKgText`, "on 40.0 kg sold", the loss tone on a loss), Picked ("88.0 kg not sold" when some is not sold), kg per block, BE (spelt out for a pointer): three and three over 600 px, two a row on a phone, never one left alone. A loss: "−RM 1,140.00" in the loss tone with "Loss". Pending: Profit, Costs and Profit per kg "—" with "working out". Under the tiles one muted line, what the costs are made of (Costs' parts): "Blocks RM 3,040.00 · Own RM 480.00 · Shared RM 14,359.23 (80 % of costs) · Electricity and water not recorded yet" (the parts over 0, the biggest with its share when there are several, then electricity and water at 0: "not recorded yet" with a price, "No water price" without; none while pending), then Harvest's Settings → Yield line when a figure is missing (fixes 2026-11-05) |
| Costs | Right after the money (fixes 2026-11-05). Costs' notes first ("Working out the energy cost…" while pending; a left-out price in the warning tone), then Costs' run breakdown as a list (Blocks a link to the run's batches, Electricity, Water, Own costs, Share of shared costs: the parts over 0, but Electricity and Water always, at 0 in muted words: "not recorded yet" with a price in Settings, "no price set" without, "working out" while pending) and Total (the Costs tile's figure, "—" while pending), then the shared-costs line. Its Blocks is the run's one block-cost figure. Head link **Costs** |
| Blocks | Each batch a link to its page: "600 Grey oyster blocks", under it "Agro Supplies · received 28 Sep · RM 2.50 a block"; a made batch "made 20 Sep · RM 1.29 a block" and a second line "Its materials count in Costs as Inventory purchases"; "no price". No money total (fixes 2026-11-05: the Costs card holds it). Head link **Batches** (the run's batches; Batches' page when none). Empty: "No batches in this run. Blocks come in and go into a container through Batches." |
| Harvests | Harvest's Flushes table (a mixed run's per-crop columns and phone split lines as on the Harvest tab), By crop for a mixed run, then "Picks": the latest 3 (Harvest's rows without Edit), "The latest 3 of 13." when there are more, then the link "All picks on the Harvest tab" (none for a room that is gone). Head link **Harvest tab** (none for a room that is gone). Empty: "Nothing picked in this run yet." |
| Sales | A table: Day ("Fri 13 Nov"), Buyer (its reference under it), Sold ("Grey oyster 40.00 kg"), RM per kg, Total, Paid (Sales' "Unpaid" / "Paid 14 Nov" mark and look). "Sold 48.0 kg · RM 576.00" under it. On a phone each line a block of labelled figures: the day with its Total beside it, Buyer across, Sold and RM per kg, Paid a line of its own without a label. ARIA roles and the region as the Runs table. Head link **Sales**. Empty: "No sales of this run. A sale line that names the container counts in the run open on its day." |
| Layout | One column; from 900 px a grid of two columns (3 : 2), areas Money · Costs, Harvests · Blocks, Sales across, each card its own height (`align-items: start`) |
| Phone taps | Up to 600 px every `.co-link` on the page (card heads, the head's container, the parts list, the batches, All picks, the gone card) reaches 44 px with block padding over its line; the Runs rows' link is a 44 px inline-flex |
| Focus | A repaint keeps the cursor: the focused link's address and words (or its focus key) are kept before the parts are replaced and the same one is focused after |
| Gone | A run that is not there (404 "Run not found"): the title "Run", "No such run. A container's runs go with it when it is deleted." and "Back to Runs" (`.co-link`, the one way back: the head's back link hides); the page stops asking. A failed first read (no answer) also titles the page "Run", never "Loading…" |

### 6.3 Links in (small marked edits)

| Where | Edit |
|---|---|
| Harvest tab, This run (`web/harvest-card.js`) | The head line ends "· Run page" (`runLine.replaceChildren(runHead(run), DOT, runPageLink(run, getRoom()?.name))`); the "Profit so far … · Costs" line opens the run page (fixes 2026-11-05; the run page's Costs card links on to Costs) |
| Harvest tab, Past runs | A past run's fold starts with a "Run page" line |
| Costs' runs (`web/costs-page.js`) | The run's breakdown ends with a "Run page" line (`co-link`), named for its run |
| Batches' rooms (`web/batches-page.js`) | The room head's "run since 4 Nov" is a link to the run page |
| Sales (`web/sales-page.js`) | No edit: Sales shows a delivery's rooms, never its run ("where shown" in the design) |

Each "Run page" link is named for its run: "Run page, Container 1, since 24 Sep" (`runPageLabel`, `aria-label`; the
visible words stay "Run page"). The Harvest tab's take `.co-link` (fixes 2026-11-05: `.rn-run-link` merged into it);
Batches' room head already styles any link in it.

## 7. Numbers (the One Format Rule)

| Figure | Formatter | From |
|---|---|---|
| RM, a loss with "−" | `moneyText` | `web/costs-math.js` |
| kg ("80.0 kg"), a pick ("16.00 kg") | `kgText` | `web/harvest-math.js` |
| kg per block, BE (cells) | `perBlockText`, `beText` (`{ cell: true }`) | `web/harvest-math.js` |
| A run's days on the page head and a link's name ("since 4 Nov", "4 Nov – 20 Dec", "4–20 Nov") | `dayRange`, exported (one word, marked) | `web/harvest-math.js` |
| A run's days in the Runs list ("24 Sep – now", "24 Sep – 20 Dec"), its money cells | `runRow` (`dates`, `cells`, `loss`, `perKgLoss`) | `web/costs-math.js` |
| Profit per kg | `perKgText` | `web/costs-math.js` |
| A day with its year when not this one | `dateText` | `web/batches-math.js` |
| Blocks ("600 Grey oyster blocks") | `countBlocks` | `web/batches-math.js` |
| RM per block | `rmText` | `web/batches-math.js` (Harvest's) |
| A sale line's day, buyer, sold, total, paid | `deliveryRow`, `priceText` | `web/sales-math.js` |
| The costs breakdown and its notes | `runParts`, `monthNotes`, `SHARED_NOTE` | `web/costs-math.js` |
| Flushes, By crop, a pick | `flushColumns`, `flushRows`, `flushPerCrop`, `flushSplits`, `byCropRows`, `harvestLine` | `web/harvest-math.js` |
| Tiles, Settings → Yield line, BE's name | `tileNodes`, `missingLine`, `figureName` | `web/harvest-card.js` |
| The main crop | `mainCrop` | `web/room-card-math.js` |

The page's own words live in `web/runs-math.js`: the rows, the title and sub line, the tiles, the Blocks, Sales and Costs
rows.

## 8. Live updates

| Trigger | Both pages |
|---|---|
| `harvest`, `batches`, `sales`, `costs` events (those in `EVENT_TYPES`) | Read again (throttled, `createThrottle`) |
| `room` with `part` `crop` or `room` | Read again (a run starts or ends; a room's name) |
| The stream back up | Read again |
| Timer | 60 s (`fallbackMs`: slower while the stream is up) |
| A stale answer | Dropped (a mount token and a read sequence) |
| An older farm app (404 "Not found") | `OUTDATED` in the banner, no more reads |

## 9. Edge cases

| Case | Behaviour |
|---|---|
| An open run | "since 4 Nov"; "Profit so far"; Costs' figures to today |
| An ended run | "4 Nov – 20 Dec"; "Profit"; sales and costs tied to it after its end still count (Costs' rule) |
| A run under way at the harvest upgrade (`partial`) | "recorded since 4 Nov" / "recorded 4 Nov – 20 Dec" |
| A deleted room | Its runs are deleted with it: they leave the list and their page reads "No such run" (404). A `runs` row whose room is missing (a database edited by hand): `roomName` null, "A deleted room" in words, no Harvest link, no Harvest figures (kg 0, kg per block "—"), no Costs view: its money "—", never "working out" (a test holds it) |
| A mixed run | Its crops in the title and the Crops cell; By crop gives the yield per crop; the money is the whole run's |
| A run with no batches, harvests, sales or costs | Each card says so (section 6.2); kg 0.0 kg, kg per block 0.00 kg, Income, Costs and Profit RM 0.00 |
| Costs still working out the energy | `pending`: Profit and Costs "—" with "working out" on the tiles and the Runs tab, "Working out the energy cost…" first in the Costs card, Total "—"; the warm's `costs` event reloads the page |
| A batch without a price | Its row "no price"; Costs' Blocks "no price" or "…, some with no price"; Costs' `incomplete`: "Some costs have no price" |
| A run with more than 3 picks | The latest 3, "The latest 3 of N.", then "All picks on the Harvest tab" |
| No meter readings | Electricity (or water) 0 with a price in Settings: "not recorded yet" in the Costs card and the money's make-up line; no price: "no price set" / "No water price" |
| An unknown crop in the address | Read as every crop (the address is tidied); the API refuses it (400 on `crop`) |
| A run id reused | Section 2 |

## 10. Files

| File | Status | Responsibility |
|---|---|---|
| `server/db.js` | Modify (own block) | `allRuns()` |
| `server/costs.js` | Modify (own block) | `runViews({ run })` |
| `server/runs.js` | Create | `createRuns`, `RunError`, `LATEST_HARVESTS` |
| `server/runs-api.js` | Create | `createRunRoutes` |
| `server/api.js` | Modify (four marked lines) | Wire the routes, close them |
| `web/route.js` | Modify (own block) | `RUNS_HASH`, `runsHash`, `runHash`, the `runs` and `run` routes, the fifth tab |
| `web/business-tabs.js`, `web/app.js` | Modify | The header comment; mount the two pages |
| `web/harvest-math.js` | Modify (one word) | `export` `dayRange` |
| `web/runs-math.js` | Create | The pages' pure parts |
| `web/runs-page.js` | Create | `mount`, `mountRun` |
| `web/harvest-card.js`, `web/costs-page.js`, `web/batches-page.js` | Modify (marked) | The links in |
| `web/styles.css` | Modify (own block at the end) | `/* ---- Runs … ---- */` … `/* ---- end Runs ---- */`, tokens only |
| `DESIGN.md`, `README.md`, `PRODUCT.md` | Modify | A Runs section, paragraph and capability row; the strip's five tabs |

## 11. Testing

| Test | Covers |
|---|---|
| `tests/db-runs.test.js` | `allRuns`: none, the order, the shape, a deleted room's runs gone, a run without its room (`roomName` null) |
| `tests/costs-runs.test.js` | `runViews`: pending then whole, equal to `monthView`'s runs and to `summary({ run })`, one run, none for an unknown run |
| `tests/runs.test.js` | The real Harvest, Batches, Sales and Costs on one farm: the list's order and row shape (an ended run started after an open one still after it), the crop filter and its 400, pending, an ended run's parts and prices, a mixed run, a run with nothing, the latest 3 picks, the sale lines' order within a delivery, a room-less run (no name, money a dash, never pending), the 404 and a deleted room |
| `tests/api-runs.test.js` | The routes, the 400 and 404s, no other method, the `costs` event after a cold read |
| `tests/web-runs-route.test.js` and `tests/web-route.test.js` | The addresses, the crop, the fifth tab, the strip on the list only |
| `tests/web-runs-math.test.js` | The rows, days, title, tiles (pending, a loss, ended), Blocks, Sales and Costs rows |
| `tests/web-runs-page.test.js` | Source checks: the mounts, the reloads, the address, the 404, the cards' links, the `.rn-` block, the links in |
| Look | The UI/UX audit after the build: 1440, 1024 and 390 px, both themes |

Test files use throwaway databases under `/tmp/runs/` and servers on port 0.

## 12. Decisions beyond the design

| Decision | Why |
|---|---|
| `server/costs.js` gets a marked `runViews` | The run summary lacks the breakdown the Costs card reuses (`runParts`), and the list would read everything once per run |
| No change to `server/harvests.js` | `roomView` already holds every run's figures; one call per room serves the list |
| The run's sale lines read through `db.salesBetween` and filtered by run, not a new Sales function | Sales keeps no per-run lines function; the summary reads the same rows |
| The row adds `partial`, `pending`, `incomplete`; the view adds `kgSold`, `byCrop`, `missing`, `harvestCount` | The head's "recorded", the "working out" and "no price" words, Income's "kg sold", the mixed run's yield per crop, the Yield line and "8 of N" |
| `costsByKind` is `{ parts, byCategory, notes }` | `parts` and `notes` feed Costs' own breakdown and notes (one format); `byCategory` is the summary contract's kinds, for the Business summary next |
| Tile "Picked", not "kg picked" | Costs' run breakdown already names the figure "Picked" |
| "Profit so far" while open, "Profit" once ended | An ended run's figure is its result, though late sales and costs still land on it |
| The run page has no strip, a back link "Runs" | As a batch and an item: the strip is for the five lists |
| Dates is the list row's link (its `th`), in the design's column order | A container's name is not unique across runs; the dates with the container name the run |
| The crop in the address (`?crop=`) | As Sales' period and Costs' month: a bookmark or Back keeps it |
| Links in say "Run page"; Sales gets none | One name for the link; Sales never shows a run |
| A link in Costs' breakdown, not in place of its toggle | The breakdown stays where it is; the run page is one tap from it |
| The run page reads again on `room` crop and room events | A run ends or starts with the crops; the head names the room |
| (Fixes 2026-11-05, the server review, the design review and the technical audit) The money's make-up under the tiles, Profit per kg, the kg not sold, Costs right after the money | The page said what the profit was but not why; the reader's next question is what the costs are made of |
| No block cost in the Blocks card | It disagreed with Costs' Blocks (a made batch's materials count as Inventory purchases); one block-cost figure, the Costs card's |
| Electricity and Water kept at 0 in words, from Settings' prices (`prices` on the view) | A 0 hidden read as "free"; a price with a 0 means nothing was recorded, no price means none can be worked out |
| The list's first column is the container and Costs' run days | One link names the run; Costs' words ("24 Sep – now") are the list's, as Costs' runs table |
| ARIA roles on the tables that become blocks on a phone; the labels' alt text empty | `display: block` drops a table's meaning; the label is read once, from its column |

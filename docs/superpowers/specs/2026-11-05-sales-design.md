# Sales: what was sold, to whom, and what is owed (business module, parallel session)

Date: 2026-11-05 · Branch `feat/sales` (from `v2` at `7a0713e`) · Database version **23** · Contract
`~/.claude/task-logs/business/CONTRACT.md` · Builds on iteration 22 (Harvest and yield).

The owner chose every row marked *owner* in the brainstorm (2026-11-05): the farm sells to wholesalers or middlemen and to
shops and restaurants, priced per kg; the buyer issues the invoice, so the app records the buyer's reference; one form
records a delivery with a line per crop; buyers are a kept list with a usual price per crop; a line may name the room it
came from; the Settings → Yield price stays as the expected price and Harvest's "RM value" becomes "Expected value"; unsold
kg is not recorded here; a delivery is paid or unpaid; on the myGAP 4-6 sheet each sale line is its own row. The owner
approved the data, API and pages below (2026-11-05).

## 1. Scope

| In | Out (later) |
|---|---|
| Record a sale: a delivery to one buyer, a line per crop (kg, RM per kg, optional room) *owner* | Printing invoices or delivery notes; numbering invoices *owner* |
| The buyer's reference (their invoice, receipt or statement number) *owner* | Unsold kg: spoiled, rejected, given away (with Contamination later) *owner* |
| Buyers as a list: name, phone, note, a usual price per crop that pre-fills a line *owner* | Part payments and running balances *owner* |
| A line tied to a room; its run found by the app *owner* | Grades (A/B), packs, retail cash sales |
| Paid or unpaid per delivery, with the paid date; what each buyer owes *owner* | Sales on the Calendar or the Overview |
| Sold kg against harvested kg, average price got against expected, per crop *owner* | Taxes (SST) and discounts |
| Harvest's "RM value" relabelled "Expected value" *owner* | |
| The myGAP 4-6 sheet's sales columns filled, a sale line a row of its own *owner* | |
| `GET /api/sales/summary` for Costs (contract §5) | |
| A CSV of the sales lines | |

## 2. Data (database version 23)

### 2.1 Tables

| Table | Columns | Rules |
|---|---|---|
| `buyers` (new; contract change §9) | `id`, `name` TEXT, `phone` TEXT (null), `note` TEXT (null), `prices` TEXT (JSON `{ <crop>: RM per kg }`, `{}` when none), `archived` INTEGER 0/1, `created_at` (ms) | `name` 1–60 characters after trimming, unique without regard to case (`UNIQUE` on `name COLLATE NOCASE`); `phone` up to 30 characters; `note` up to 200; a price 0–1,000, a crop of the crop list (`CROP_KEYS`). |
| `sales` (contract §5) | Contract: `id`, `sold_at` (ms), `crop`, `kg` REAL, `price_kg` REAL (RM), `total` REAL (RM), `buyer` TEXT, `invoice_no` TEXT (null), `room_id` (null = mixed), `run_id` (null = not tied), `note` (null). Sales' own: `delivery_id`, `buyer_id` (→ `buyers.id`), `paid_at` (ms, null = unpaid), `created_at` (ms) | One row per crop line. Index `(sold_at)`, `(delivery_id)`, `(buyer_id)`, `(run_id)`, and `(sold_at)` where `paid_at` is null. STRICT, `CREATE TABLE IF NOT EXISTS`. |

### 2.2 A delivery

| Rule | Detail |
|---|---|
| What it is | The `sales` rows sharing a `delivery_id`; `delivery_id` is its first line's `id` when recorded (ids are never reused: AUTOINCREMENT) (set in the same transaction as the insert). |
| Shared fields | `sold_at`, `buyer`, `buyer_id`, `invoice_no`, `note`, `paid_at` are the same on every line of a delivery: written only together, in one transaction (`db.saveDelivery`, `db.setDeliveryPaid`). |
| `buyer` | The buyer's name at the time of the sale, copied from `buyers.name`. Renaming a buyer rewrites `buyer` on that buyer's rows in the same transaction (one name per buyer in the history and the sheet). |
| Lines | 1 to 9 lines; a crop at most once in a delivery; `crop` one of `CROP_KEYS`. |
| `kg` | Over 0 up to 10,000, stored to 2 decimals. |
| `price_kg` | 0 to 1,000, stored to 2 decimals (0 allowed: a free sample to a buyer). |
| `total` | Worked out by the server: round(kg × price_kg, 2) from the kg and price already to 2 places, in whole sen. A body's total is ignored. Every Sales rounding to 2 places is half away from zero on the number's decimal text (`round2`: 1.005 → 1.01, where `Math.round(n * 100) / 100` gives 1.00); the dialog sends kg and RM per kg rounded the same way and shows the total that will be recorded. |
| `invoice_no` | Optional, up to 40 characters after trimming; empty is null. |
| `note` | Optional, up to 200 characters. |
| `sold_at` | A date and time; not in the future (a minute's grace for clocks); not before 2020-01-01. |
| Room and run | A line may name a room (`roomId`, an existing room). The server sets `run_id` to that room's run whose `started_at` ≤ `sold_at` and whose `ended_at` is null or after `sold_at`; none: null. No room: `room_id` and `run_id` null (mixed). An edit works the run out again. |
| Paid | `paid_at` null: unpaid. Mark paid sets it (a date, default today; not before the sale's day, not in the future); Mark unpaid clears it. An edit keeps it. |
| A room deleted | Its lines keep their kg and money; `room_id` and `run_id` become null in the room delete's transaction (income is not lost with the room). The Delete room card's words do not change (sales are kept). |
| A run's rows otherwise | Runs are never deleted except with their room, so `run_id` stays valid. |

### 2.3 Buyers

| Rule | Detail |
|---|---|
| Add | From the Buyers dialog or from the Record form's "New buyer…" (name and phone). |
| Edit | Name, phone, note, usual prices (a box per crop of the crop list, empty = none). |
| Archive | Hides the buyer from the Record form's picker; their sales and what they owe stay. **Restore** brings them back. |
| Delete | Only a buyer with no sales; one with sales: 409 "Archive this buyer instead: it has sales". |
| Edit a delivery of an archived buyer | The picker shows the archived buyer as the selected value (marked "archived"). |

### 2.4 The upgrade (version 22 → 23 on the merged branch; 20 → 23 on this branch)

| Step | Rule |
|---|---|
| Block | `if (version < 23) { … }` under a comment header `// ---- Sales ----` in `server/db.js`; `VERSION = 23` on this branch (contract §2). |
| Tables | `buyers` and `sales` made, with their indexes. Nothing copied: the farm has no sales records. |
| Room delete | `deleteRoom` gains the `UPDATE sales SET room_id = NULL, run_id = NULL WHERE room_id = ?` in its transaction (`room_id` has no foreign key, so the null comes from this statement). |

## 3. Recording

| Way | Rule |
|---|---|
| Record a sale | The Sales page's primary button. The dialog "Record a sale". Fields: **Date** (default today; the day in the farm's words under the box, "Thursday 5 Nov", as Harvest's Record), **Buyer** (a picker of the active buyers, A–Z, then "New buyer…", which opens two boxes in place: name and phone), **Buyer's reference** (optional, the hint "Their invoice or receipt number"), **Note** (optional), then the lines. The picker opens on a chosen, disabled first option "Pick a buyer" (the cursor on it; Record only: Edit keeps the sale's buyer), and no price is filled until a buyer is picked (the lines then fill as below); with no buyers at all it opens on "New buyer…". From 900 px the form is two columns: Date and Buyer, Reference and Note. |
| A line | **Crop** (the farm's crop list in its order, a crop already on another line left out), **kg** ("kg" inside the box), **RM per kg** ("RM" before), **Room** (optional: the rooms by name, then "Mixed", the default), and the line's total at its end (RM, worked out as typed). **Remove** on each line when there are two or more. **Add a crop** under the lines (off at 9 lines or when every crop is used). |
| The price pre-fill | Choosing a crop (or a buyer, for lines with no price typed) fills RM per kg from the buyer's usual price for that crop, else Settings → Yield's expected price, else empty. A pre-filled expected price shows the muted word "expected" inside the box at its right end (as kg's unit) until the box is changed. A typed price is never overwritten. |
| The foot | The delivery's kg and total ("16.50 kg · RM 214.50") above the buttons. |
| An unlikely value | Asks once, not refuses (as Harvest's `pickCheck`): a line's RM per kg over 3 × its crop's expected price, or a line's kg over 500. The first submit shows under the line, in amber, as a note the width of the line (read with the box: its `aria-describedby`, polite), "That's 3.4 times the expected RM 12.00 per kg. Is RM 41.00 right?" or "Is 650.00 kg right?" and the primary button reads "Record anyway" ("Save anyway"); the same values sent again go; a changed value is checked again. No expected price: only the kg check. |
| No buyers | The dialog opens with "New buyer…" chosen. |
| Edit | A delivery's row on the Sales page opens "Edit sale" with every field as Record (an edit keeps the sale's time unless its date changes: another day, 12:00); the footer has a quiet red "Delete this sale" at its start, which opens the confirm. |
| Delete | Confirm: title "Delete the sale of 5 Nov to Kedai Ah Seng?", lead "RM 214.50 · Grey oyster 12.00 kg, Pink oyster 4.50 kg." Buttons "Delete sale" and "Cancel". |
| Mark paid | On an unpaid delivery (the Owed card and the Edit dialog): a small dialog "Mark paid", its lead "Wed 4 Nov · Restoran Wong Kitchen Sdn Bhd · RM 232.50", with **Paid on** (default today) → `PUT …/paid`. A paid delivery's Edit dialog shows "Paid 9 Nov" and a quiet **Mark unpaid**. |
| Events | Every sales or buyers write publishes `sales` `{}`; `'sales'` is added to `EVENT_TYPES` in `web/live.js` (contract §5). The Sales page and the myGAP sheet read again on `sales`, on `harvest` (harvested kg; a Settings save of `cropYield`, the expected prices, already publishes `harvest` `{ roomId: null }`), on a room's `room` part (a room renamed or deleted) and when the stream comes back. |

## 4. The figures (`server/sales-math.js`, pure)

| Figure | Rule |
|---|---|
| A delivery's kg and total | The sums of its lines; total to 2 places. |
| Sold kg, income | Sums of the period's lines (by `sold_at`, the farm's days). |
| Owed | Sum of the totals of every unpaid delivery, whatever its date; with the count of deliveries and the oldest's age in whole days. |
| Harvested kg | The harvests' kg in the same period (`db` harvests by `picked_at`, as the Harvest page). |
| Per crop | Sold kg, harvested kg, income, average RM per kg (income ÷ sold kg, 2 places; lines at RM 0 count), expected RM per kg (Settings → Yield, null when not set). The difference "RM 1.20 under expected" / "RM 0.80 over expected" / "as expected" (within RM 0.005); no colour verdict. |
| Per buyer | kg, income, owed (all time); the oldest unpaid day is in `owed.buyers[].oldestAt`. |
| Summary (Costs) | The contract's shape: `kg`, `total` over the lines in `from..to` (and the run, when `run` is given); `byCrop` and `byRun` (lines with a run only; `runId` null lines are left out of `byRun`). |
| Periods | `from`/`to` are farm dates (YYYY-MM-DD, Asia/Kuala_Lumpur, UTC+8), both days included; as the Harvest page's ranges: 7 days, 30 days, 13 weeks (91 days), 12 months (365 days) ending today. |

## 5. API (`server/sales-api.js`, wired by one line in `server/api.js`)

| Route | Reply |
|---|---|
| `GET /api/sales?days=7\|30\|90\|365` | `{ from, to, days, deliveries: [delivery], totals: { kg, total, harvestedKg, count }, owed: { total, count, oldestAt, buyers: [{ buyerId, buyer, total, count, oldestAt, deliveries: [delivery] }] }, byCrop: [{ crop, kg, harvestedKg, total, avgPriceKg, expectedPriceKg }], byBuyer: [{ buyerId, buyer, kg, total, owed }], buyerCount }` (`buyerCount`: the active buyers; 0: the page's empty words ask for the first). Deliveries newest first. `owed` is all time. Default 30; another value 400. |
| A delivery | `{ id, soldAt, buyerId, buyer, buyerArchived, invoiceNo, note, paidAt, kg, total, lines: [{ id, crop, kg, priceKg, total, roomId, roomName, runId, runStartedAt }] }`, lines in the crop list's order. |
| `GET /api/sales/range?from=YYYY-MM-DD&to=YYYY-MM-DD` | `{ from, to, lines: [{ date, soldAt, crop, roomName, runStartedAt, kg, priceKg, total, invoiceNo, buyer }] }`, oldest first (the myGAP sheet). Bad dates or `from` after `to`: 400; more than 400 days: 400. |
| `POST /api/sales` | `{ soldAt, buyerId, invoiceNo?, note?, lines: [{ crop, kg, priceKg, roomId? }] }` → 201 the delivery. 400 with `field` (`soldAt`, `buyerId`, `lines`, `lines.1.kg`, …) and the error's words. An archived buyer: 400 `buyerId` "This buyer is archived". |
| `PUT /api/sales/deliveries/:id` | The same body: the delivery's lines replaced in one transaction (the `delivery_id` and `paid_at` kept). 404, 400. A paid delivery whose new date is after its paid day: 400 `soldAt` "Paid before this date". |
| `PUT /api/sales/deliveries/:id/paid` | `{ paidAt: ms }` or `{ paidAt: null }` → the delivery. 404, 400. |
| `DELETE /api/sales/deliveries/:id` | 204. 404. |
| `GET /api/sales/summary?from=&to=&run=` | The contract's `{ kg, total, byCrop: [{ crop, kg, total }], byRun: [{ runId, kg, total }] }`. `from`, `to` optional farm dates (none: all time); `run` optional. 400 for a bad date. |
| `GET /api/sales.csv?days=…` | One row per line, oldest first: `date,time,buyer,reference,crop,room,run started,kg,price per kg,total,paid on,note`, with the BOM and the formula guard of the harvest CSV; file name `sales <from>–<to>.csv`. |
| `GET /api/buyers` | `{ buyers: [{ id, name, phone, note, prices, archived, sales, owed }] }`, A–Z; `sales` the count of deliveries. |
| `POST /api/buyers` | `{ name, phone?, note?, prices? }` → 201 the buyer. 400 with `field`; 409 `name` "A buyer with this name exists". |
| `PUT /api/buyers/:id` | `{ name?, phone?, note?, prices?, archived? }` → the buyer. 404, 400, 409. |
| `DELETE /api/buyers/:id` | 204. 404; 409 "Archive this buyer instead: it has sales". |

## 6. The pages

| Part | Design |
|---|---|
| Address | `#/business/sales`, with `?days=7\|30\|90\|365` (30 without one), added to `web/route.js` and `web/app.js` (contract §4). No top-bar entry: the integrator adds "Business" at merge. |
| Head | "Sales", the line "What was sold, to whom, and what is owed.", the period (the segmented control "7 days · 30 days · 13 weeks · 12 months", as Harvest's), **Record a sale** (primary), **Buyers**, **Export CSV**. |
| Totals card | Titled with the reply's dates ("6 Oct – 4 Nov 2026"). Tiles: **Sold** (kg, the line "of 64.5 kg harvested", none when nothing was harvested), **Income** (RM), **Owed** (RM, the line "3 sales · oldest 12 days"; nothing owed: "RM 0.00" and "All paid", or "Nothing owed" when the period has no sales either). The Owed tile says "all time" in its line's start when the period is shorter than the oldest unpaid day ("all time · 3 sales · oldest 40 days"). |
| Owed card | Shown only when something is owed. A row per buyer, most owed first: name, RM owed, the oldest "12 days"; a button on the name opens the buyer's unpaid deliveries under it (date, the lines in short, total, reference, **Mark paid**). From 900 px the rows are columns in a 52rem measure and the open deliveries fixed columns, the RM figures on one right edge; a hairline between buyers. |
| Sales card | The period's deliveries, newest first: date ("Thu 5 Nov"), buyer, the lines in short ("Grey oyster 12.00 kg · Pink oyster 4.50 kg"), total RM in its own column, a "Paid 9 Nov" or "Unpaid" mark (text, the unpaid one in the warning ink, not colour alone), the reference muted; one quiet **Edit** a row. The latest 20 (10 on a phone), "Show all N". The columns are the list's, each delivery a subgrid of them, so the totals share one right edge. On a phone each delivery is a block: date and buyer on the first line, the lines, then total and the mark, the reference on its own line. A crop's part of the lines is never broken inside. |
| By crop table | Crop (picture and name), Sold (kg), Harvested (kg), Income, Average RM per kg, Expected RM per kg, and the difference in words under the average on a phone. A crop sold or harvested in the period has a row. On a phone: Crop (the sold kg under the name, "98.8 kg sold"), Income, Average. |
| By buyer table | Buyer, kg, Income, Owed (all time). On a phone the kg goes under the name. |
| Empty | No sales in the period: the totals card stays (Sold "0.0 kg", Income "RM 0.00"), the Sales card says "No sales in the last 30 days." (the segment's words), By buyer hides, and By crop shows only the crops harvested in the period (sold 0.0 kg). No buyers at all: the Sales card says "No buyers yet. Record a sale to add the first." with a **Record a sale** button under it. |
| Buyers dialog | "Buyers": a list (name, phone, the usual prices in short "Grey oyster RM 12.00 · Pink RM 14.00", the owed sum), each with **Edit**; archived buyers under a "Archived" heading, muted, with **Restore**; **Add a buyer**. Edit: name, phone, note, a box per crop for the usual price; at its foot a quiet **Archive** (or **Delete buyer** when it has no sales). Save, Archive, Restore and Cancel in Edit / Add a buyer come back to the list, the cursor on that buyer; a Restore or an Archive is said in a polite status line ("Kedai Ah Seng restored."). |
| myGAP 4-6 sheet | `mountSheet` also asks `GET /api/sales/range` for the same days. The rows are the harvest rows and the sale lines together, by date (a day's harvest rows first, then its sale lines by time): a sale row has Date, Crop, Block / location ("Room 1 · run of 3 Oct", or "Mixed" with no room), Harvested blank, Sold (kg) to 2 decimals, Price / kg (RM) to 2, Total (RM) to 2, Invoice No. (the reference), Buyer. The harvest rows' sales cells stay blank. The Total row: harvested kg, sold kg and the RM total. The sales request failing leaves the harvest rows and says, above the table, "Sales could not be read: the sales columns are blank." (Sales' part of `web/harvest-page.js` / `web/harvest-math.js` only, contract §3.) |
| Harvest relabel | "RM value" becomes **"Expected value"** on the Harvest tab's tiles and Past runs, the Harvest page's tiles and tables, and the Overview card's line; Settings → Yield's column becomes **"Expected price (RM per kg)"** and its note adds "The prices you get are recorded in Sales." (contract change §9). |
| Numbers | One formatter, `web/sales-math.js`: RM through Harvest's `rmText` (RM 1,240.50), kg through `kgText` (totals 1 decimal, a line 2), RM per kg "RM 12.00", days "12 days" / "1 day" / "today". Crop names through `cropShortName`. |
| Sizes | Works at 1440, 1024 and 390 px, both themes; targets 44 px on a phone. Styles in one `/* ---- Sales ---- */` block at the end of `web/styles.css`, classes `.sl-`, tokens only. |

## 7. Files

| File | What |
|---|---|
| `server/db.js` | The `// ---- Sales ----` block: tables, the version 23 step, `saveDelivery`, `deleteDelivery`, `setDeliveryPaid`, `salesBetween`, `unpaidSales`, buyers' methods, `runAt(roomId, ms)`; the room delete's one statement |
| `server/sales-math.js` | Pure: validation of a body, totals, owed, per crop, per buyer, the summary, the CSV rows |
| `server/sales.js` | The store: reads Settings' `cropYield` and the harvests for harvested kg, writes through `db`, `onChange` |
| `server/sales-api.js` | The routes of section 5 |
| `server/api.js` | One line wiring the routes (and the `sales` publish on change, as Harvest's) |
| `web/sales-math.js` | Pure: the formatter, the page's rows, the dialog's line totals, pre-fill and the unlikely-value check, the sheet's sale rows |
| `web/sales-page.js` | The page, `mount(container, { days })` returning an unmount |
| `web/sales-dialogs.js` | Record / Edit sale, Mark paid, Delete confirm, Buyers |
| `web/route.js`, `web/app.js`, `web/live.js` | The route; `'sales'` in `EVENT_TYPES` |
| `web/harvest-page.js`, `web/harvest-math.js` | The sheet's sales rows and Total; the "Expected value" labels |
| `web/settings*.js` | The Yield card's column name and note |
| `web/styles.css` | The `.sl-` block |
| `DESIGN.md`, `README.md`, `PRODUCT.md` | A Sales section or row each |

## 8. Testing

| Test | Covers |
|---|---|
| `tests/sales-math.test.js` (pure) | Body validation and its `field`s, totals and rounding, owed and oldest days, per crop with harvested kg and expected price, per buyer, the summary's `byRun` leaving out null runs, the CSV rows |
| `tests/db-sales.test.js` | The upgrade to 23 from 20 (tables, indexes, `user_version`), a delivery's shared fields written together, `runAt` (open, ended, before any run), the room delete clearing `room_id`/`run_id`, a buyer rename rewriting `buyer` |
| `tests/sales.test.js` | Record, edit (lines added, changed, removed; paid kept), delete, paid and unpaid with their limits, an archived buyer refused, the period views, `owed` all time |
| `tests/api-sales.test.js` | The routes and their 400/404/409s, `days` checked, the summary's exact shape for Costs, the CSV, the `sales` events on every write |
| `tests/web-sales-math.test.js` | The formatter, delivery rows, line totals, the pre-fill order (buyer's price, expected, empty) and the "expected" mark, the unlikely-value check, the sheet's merged rows and Total |
| `tests/web-harvest-math.test.js` (changed) | The "Expected value" labels; `sheetRows` with sale lines |
| Look | The UI/UX audit (Impeccable critique and audit) at 1440, 1024 and 390 px, both themes: the Sales page with and without sales, Owed open, the Record dialog with three lines and the unlikely-value warning, Buyers, the sheet; fixes before the finish review |

## 9. Contract changes (CONTRACT.md §7, owner's yes 2026-11-05)

| Change | Why |
|---|---|
| Sales owns a second table, `buyers`, and adds `delivery_id`, `buyer_id`, `paid_at`, `created_at` to `sales` (allowed: own columns) | The owner chose a buyers list and paid/unpaid per delivery |
| Sales relabels Harvest's "RM value" to "Expected value" (Harvest tab, Harvest page, Overview card) and Settings → Yield's price column to "Expected price (RM per kg)" | The owner chose to keep the Settings price as the expected price beside real sales |
| `server/db.js` `deleteRoom` gains one statement clearing the room from `sales` | A room's sales keep their money when the room goes |

# Inventory: what's in stock, what was bought and used, and what runs out (business module)

Date: 2026-11-05 · Branch `feat/inventory` (worktree `.claude/worktrees/inventory`, from `v2` at `7a0713e`) · Database
version **22** · One of four parallel business modules (`~/.claude/task-logs/business/CONTRACT.md`): merges after Batches,
before Sales and Costs.

The owner chose every row marked *owner* in the brainstorm (2026-11-05): the kinds of stock, a unit per item, use by hand
with a stock count, Low on the page plus one Telegram message, blocks following Batches, a printable myGAP 4-5 sheet, a
use-by per purchase, lots taken oldest purchase first, block items with no Purchase. The lead chose the rest (approach A:
a ledger of moves, every figure worked out on read). The contract's section 7 (Batches, 2026-11-05) fixes how blocks and
batch materials reach stock: **Batches writes those moves itself**; Inventory shows them and never writes or edits them.

## 1. Scope

| In | Out (later) |
|---|---|
| Items of the kinds blocks, spawn, bags, chemical, packaging and other *owner* | Fuel and water as stock |
| A unit per item, picked when it is added: pcs, kg, g, L, mL (`blocks` on block items) *owner* | Packs that convert to units (a carton of 500) |
| **Purchase**: qty, total paid (RM), supplier, an optional use-by date, the day | Suppliers as records of their own, purchase orders |
| **Record use** by hand: qty, the room, the reason, who *owner* | Use taken off when a task is Done *owner* |
| **Count stock**: one sheet for every item; each typed figure a count; the page shows when each item was last counted *owner* | A Today task to count *owner* |
| A reorder level per item: **Low** on the page and one Telegram message *owner* | A Today task or an alarm for low stock *owner* |
| A use-by per purchase: a warning 7 days ahead, **Expired**, **Throw out** *owner* | Lot numbers |
| Lots taken **oldest purchase first** *owner* | Earliest use-by first |
| Blocks and batch materials follow Batches (Batches writes their moves) *owner* | Purchases of blocks in Inventory *owner* |
| `GET /api/inventory/purchases` for Costs (contract section 5) | |
| A printable myGAP 4-5 sheet filled from the records; equipment, PHI and re-entry left blank *owner* | Those three columns in the app |
| Edit or delete a wrong purchase, use or count | Editing a batch move (Batches owns it) |

## 2. Data (database version 22)

The tables' contract columns (section 5 of the contract) keep their names and meanings; the rest are Inventory's own. Every
own column is nullable or has a default (contract section 7), since Batches inserts rows naming only the contract's columns.

| Table | Columns | Rules |
|---|---|---|
| `stock_items` | Contract: `id`, `name`, `kind` (`'blocks'`, `'spawn'`, `'bags'`, `'chemical'`, `'packaging'`, `'other'`), `unit`, `reorder_at` (REAL, null = none). Own: `ingredient` (text, chemicals), `lrmp_no` (text, chemicals), `archived` (0/1, default 0), `low_sent_at` (ms, null) | STRICT. `kind` has a CHECK of the six; `unit` has none in the table (Batches writes `'blocks'`), the store checks it. A unique index on `name COLLATE NOCASE`. |
| `stock_moves` | Contract: `id`, `item_id` (→ `stock_items.id`), `at` (ms), `qty` (REAL, + in / − out), `unit_cost` (RM per unit), `ref_kind` (`'purchase'`, `'use'`, `'batch'`, `'adjust'`), `ref_id`, `note`. Own: `total` (RM paid, a purchase), `supplier`, `use_by` (`YYYY-MM-DD`, a purchase), `room_id`, `reason`, `worker`, `counted` (REAL, a count: what was on the shelf), `lot_id` (the purchase a use was taken from, Throw out only), `use_by_sent_at` (ms) | STRICT. A CHECK on `ref_kind`. Index `(item_id, at)` and `(ref_kind, at)`. |

### 2.1 What each move is

| Move | Written by | `qty` | Other columns |
|---|---|---|---|
| Purchase | Inventory | over 0 | `ref_kind 'purchase'`, `total`, `unit_cost` = `total` ÷ `qty` (kept to 6 places), `supplier`, `use_by`, `at` |
| Use | Inventory | under 0 | `ref_kind 'use'`, `room_id` (null: not in a room), `reason`, `worker`, `at`; `lot_id` for a Throw out |
| Count | Inventory | the counted figure − the records' figure at that moment (0 allowed, only here) | `ref_kind 'adjust'`, `counted`, `worker`, `at` now |
| Batch | **Batches** (contract section 7) | + blocks received, − blocks into a room, − materials used on a making day | `ref_kind 'batch'`, `ref_id` the batch id, `unit_cost` on a receipt |

### 2.2 Units

| Unit | Kinds offered | Entry | Shown |
|---|---|---|---|
| pcs | any but blocks | whole numbers | "120 pcs" |
| kg, L | any but blocks | up to 2 decimals | 2 decimals, "3.50 L", "0.25 kg" |
| g, mL | any but blocks | whole numbers | "250 g", "500 mL" |
| blocks | block items only (Batches makes them, "<crop> blocks") | uses and counts only, whole numbers | "480 blocks" |

A unit cannot change once the item has moves (the figures would change meaning); the Edit dialog says so.

### 2.3 The upgrade (version 20 → 22 on this branch)

| Step | Rule |
|---|---|
| `if (version < 22)` | Make `stock_items` and `stock_moves` and their indexes (`CREATE TABLE IF NOT EXISTS`), in the `// ---- Inventory ----` block of `server/db.js`. No rows. `VERSION = 22` on this branch; at merge the integrator keeps every step. |

## 3. The figures (`server/inventory-math.js`, pure)

| Figure | Rule |
|---|---|
| In stock | Σ `qty` of the item's moves. May go under 0 (a use recorded beyond the records): shown as "−2.00 L" so a count can put it right. |
| Lots | Each in-move (a purchase, a batch receipt, a count that added) is a lot of its `qty`, in the order of `at` then `id`. First each Throw out (a use with `lot_id`) comes off its own lot (any part beyond what that lot holds joins the other outs); then the other outs together come off the lots **oldest first** *owner*, each lot to 0 before the next. A lot's **left** is what remains. A lot with nothing left is not listed. |
| Use-by state | A lot with some left and a `use_by`: **soon** when the farm's today is within 7 days of it (the use-by day itself counts as usable), **expired** after it. The item's `useBy` is the earliest of its lots' (expired before soon). |
| Low | `reorder_at` set and in stock at or under it. |
| Last counted | The `at` of the item's latest count; null when never counted. Over 7 days: "not counted for 9 days" (muted, not amber). |
| Attention | Over the items not archived: how many are low, have a soon lot, have an expired lot. |
| The farm's day | Asia/Kuala_Lumpur, UTC+8 all year, as `server/task-rules.js` works it out. |

## 4. Recording

| Way | Rule |
|---|---|
| Add item | Name (1–60 characters, unique ignoring case: 400 "There is already an item called Bleach"), kind (blocks not offered: Batches makes block items), unit, reorder at (optional, 0–100,000), and for a chemical the active ingredient and LRMP No. (optional, up to 60 characters). |
| Edit item | The same fields; the unit only while the item has no moves. A block item: its reorder level only. |
| Archive | **Archive** on the item page: it leaves the list, the attention line and the messages; its records stay. "Show archived (3)" under the list; **Bring back** on its page. Delete only for an item with no moves (409 "Archive it instead"). A block item cannot be archived (Batches looks it up by name). |
| Purchase | Item (block items not offered: 409 "Blocks come in from Batches"), qty (the unit inside the box; 0 < qty ≤ 100,000), total paid (RM, 0–1,000,000), with "RM 8.33 per L" worked out under it, supplier (optional, up to 60 characters; the earlier suppliers suggested), use by (optional, not before the day bought), the day (default today; not in the future, not over 400 days back; `at` is now for today, else 12:00 of that day). |
| Record use | Item (any not archived, block items included), qty, room (the farm's rooms or "Not in a room"), reason (optional, up to 60 characters; the item's earlier reasons suggested, e.g. "Footbath"), who (the worker picker and check of Tasks, `checkWorker`), when (default now; not in the future, not over 400 days back). More than in stock: the first submit says under the qty "Only 2.00 L in stock. Record 5.00 L anyway?" and the button reads "Record anyway"; the same qty again sends it (Harvest's pick guard pattern). |
| Count stock | A page of its own, `#/business/inventory/count` (a worker walks the shelves with the phone; a dialog of every item would be too long): every item not archived, grouped by kind: name, "By the records 3.50 L", a box in the unit (≥ 0). Who once at the top. A box left empty is skipped; a figure saves a count of that item (even when it matches: Last counted moves), all in one transaction, each against the records at that moment. Save sends only the typed ones; nothing typed: the button is off. After a save the page goes back to the list. |
| Throw out | On a soon or expired lot of the item page: a confirm "Throw out 3.00 kg of Grey oyster spawn bought 1 Nov?", who; a use of the lot's left with `reason` "Expired" (or "Thrown out" for a soon lot) and `lot_id`. |
| Edit a move | A purchase: qty, total, supplier, use by, day (a changed use-by clears `use_by_sent_at`). A use: qty, room, reason, who, when. A count: not edited: delete it and count again. A batch move: no Edit; its row says "Change it in Batches" (409 on the API). |
| Delete a move | With a confirm naming it ("Delete the purchase of 5.00 L of Bleach on 3 Nov?"). Deleting a purchase whose lot has Throw outs deletes them too (they would point at nothing), the confirm says so. |
| Events | Every write publishes `inventory` `{ itemId }`. The server also subscribes to `batches` (Batches publishes it): it runs the message check (section 6) and publishes `inventory` `{ itemId: null }`, so the pages reload without listening for `batches` themselves. |

## 5. The pages

| Part | Design |
|---|---|
| Inventory page | `#/business/inventory` (no top-bar link: the integrator adds the Business entry at merge). Head: "Inventory", **Record use** (primary: the floor's most common job), **Purchase**, **Count stock**, **Add item**, and the quiet link **myGAP 4-5 sheet**. |
| Attention line | Only when something needs it: "2 low · 1 to use by 12 Nov · 1 expired" (amber words, red for expired; the State-Only Colour Rule), those items listed first in their groups. |
| The list | Groups by kind in the contract's order with their names (Blocks, Spawn, Bags, Chemicals, Packaging, Other); an empty group is not shown. Columns: Item (with the ingredient muted under a chemical's name), In stock, Reorder at, Last counted ("today", "3 days ago", "not counted for 9 days", "never"), and a pill: **Low** (amber), **Use by 12 Nov** (amber), **Expired** (red); at most one pill, the worst. The row opens the item page. On a phone each item is one row: the name and its pill on the first line, In stock to the right, the reorder level and last counted muted under. |
| Empty | No items: a dashed empty card, "No stock items yet." and **Add item**. |
| Item page | `#/business/inventory/<id>`: the name, kind and unit; tiles In stock, Reorder at, Last counted; **Purchase** (not on a block item), **Record use**, **Edit**, **Archive**. **Lots** card (when any has some left): bought (the day, or "Batch 14", or "Count 3 Nov"), qty, left, use by with its pill, and **Throw out** on a soon or expired lot. **History** card: the latest 20 moves newest first ("Show all N"): when, what ("Bought from Kedai Ali · RM 25.00", "Used in Container 2 · Footbath · Ali", "Counted 3.50 L · Ali", "Batch 14 · received", "Batch 14 · into Container 2", "Batch 16 · made"), the qty signed in its own column, one quiet **Edit** a row (none on a batch move: "Change it in Batches", muted). |
| Dialogs | Section 4, with the Harvest dialogs' layout: the unit inside the qty box, the date's day in the farm's words under its box, the worker picker, a quiet red "Delete this …" at the footer's start of an Edit. |
| myGAP 4-5 sheet | `#/business/inventory/sheet?days=30` (30, 90 or 365; the range a segmented control), a print page as the 4-6 sheet: title "myGAP 4-5 · Purchase and use of pesticides / chemicals (Pembelian dan penggunaan racun perosak / bahan kimia)", "Farm:" with a blank line, the dates; one row per purchase and use of the chemical items in the range, oldest first. Columns below. **Print** (hidden in print); light colours and no top bar in print. No chemical records: "No chemical purchases or uses in the last 30 days." |
| Settings | An **Inventory** card (`web/inventory-settings.js`): one switch, "Send low-stock and use-by messages to Telegram" (on by default), its note "Uses the Telegram chat set above. One message when an item first falls to its reorder level, and one per purchase 7 days before its use-by." While Telegram is not set up the note adds "Nothing is sent until Telegram is set up above." (the switch still saves). |
| Numbers | One formatter (`web/inventory-math.js`): a qty with its unit (section 2.2, grouped thousands, "−" for under 0), RM to 2 places with grouping ("RM 1,240.50"), the per-unit price ("RM 8.33 per L"; under RM 0.10 two significant digits, as Harvest's cost per kg). |

### 5.1 The 4-5 sheet's columns

| Column | A purchase | A use |
|---|---|---|
| Date | The day | The day |
| Crop | blank | The crops of the room's run at that moment (`runs`), short names joined with ", "; blank when not in a room or no run |
| Location & area | blank | The room's name ("Not in a room" when none; "A deleted room" when gone) |
| Trade name & active ingredient | The item's name, then its ingredient in brackets when set | as a purchase |
| LRMP No. | The item's | The item's |
| Price | "RM 25.00" (the total) | blank |
| Qty bought / rate used | "5.00 L bought" | "1.00 L used" |
| Reason for use | blank | The reason |
| Equipment, PHI (days), Re-entry period | blank to write in | blank to write in |
| Operator | blank | The worker |

## 6. Telegram messages (`server/inventory-alerts.js`)

| Rule | Detail |
|---|---|
| When it checks | After every Inventory write, on a `batches` event, at start and once an hour (a use-by window opens as days pass). |
| Low | An item not archived, low, `low_sent_at` null: send "📦 Low stock · Bleach · 1.50 L left (reorder at 2.00 L)", then set `low_sent_at`. Back over the level (or the level cleared): `low_sent_at` back to null, so the next fall sends again. |
| Use-by | A lot with some left, soon or expired, `use_by_sent_at` null: "📦 Use by 12 Nov · Grey oyster spawn · 3.00 kg left from the purchase of 1 Nov" (expired already when first seen: "📦 Expired 12 Nov · …"), then set `use_by_sent_at` on the purchase. |
| Off | The setting `inventoryTelegram` false, or no token or chat (`readTelegram`): nothing is sent and nothing is marked, so turning it on sends what is due. |
| Sending | `fetchTransport` from `server/telegram.js` (imported, the file not changed); one message at a time; a failure is logged (never the token) and the mark not set, so the next check tries again. Never breaks a write. |

## 7. API (`server/inventory-api.js`, one line in `server/api.js`)

| Route | Reply |
|---|---|
| `GET /api/inventory[?archived=1]` | `{ items: [{ id, name, kind, unit, reorderAt, ingredient, lrmpNo, archived, qty, low, lastCountedAt, useBy: { date, state: 'soon'\|'expired' } \| null }], attention: { low, soon, expired }, archivedCount, suppliers }` (suppliers: the earlier ones, for the Purchase dialog) |
| `POST /api/inventory/items` | `{ name, kind, unit, reorderAt?, ingredient?, lrmpNo? }` → 201 the item. 400 with `field`. |
| `PUT /api/inventory/items/:id` | Any of those, or `{ archived }` → the item. 404, 400, 409 (a unit change with moves; a block item's other fields). |
| `DELETE /api/inventory/items/:id` | 204; 409 "Archive it instead" with moves. |
| `GET /api/inventory/items/:id` | The item as in the list, plus `lots: [{ moveId, at, qty, left, useBy, state }]` and `moves: [{ id, at, qty, refKind, refId, total, unitCost, supplier, useBy, roomId, roomName, reason, worker, counted, lotId }]` newest first (`roomName`: a use's room; a batch move's, the batch's `room_id` read from `batches` when that table is there, else null), `suppliers` and `reasons` (the earlier ones, for the dialogs). 404. |
| `POST /api/inventory/purchases` | `{ itemId, qty, total, supplier?, useBy?, day? }` → 201 the move. 400, 404, 409 (a block item; an archived item). |
| `POST /api/inventory/uses` | `{ itemId, qty, roomId?, reason?, worker, at? }` (qty as a positive amount) → 201. 400, 404. |
| `POST /api/inventory/counts` | `{ worker, counts: [{ itemId, qty }] }` → 201 `{ moves }`, one transaction; one bad entry rejects all (400 with `field` `counts.<index>`). |
| `PUT /api/inventory/moves/:id` | Section 4's fields → the move. 404, 400, 409 (a batch move: "Change it in Batches"; a count). |
| `DELETE /api/inventory/moves/:id` | 204. 404, 409 (a batch move). |
| `POST /api/inventory/lots/:moveId/throw-out` | `{ worker }` → 201 the use. 404, 409 (nothing left, or neither soon nor expired). |
| `GET /api/inventory/purchases?from=YYYY-MM-DD&to=YYYY-MM-DD` | **Contract shape**: `{ purchases: [{ id, itemId, name, kind, at, qty, unitCost, total }] }`, the `'purchase'` moves whose farm day is from–to inclusive, oldest first. Batch moves never (Costs gets blocks from Batches: no double count). 400 for a missing or bad date or from after to. |
| `GET /api/inventory/sheet?days=30\|90\|365` | `{ from, to, rows: [section 5.1 as fields] }`. Default 30; another value 400. |
| Settings | `inventoryTelegram` (boolean, default true) in `server/settings.js`'s own Inventory block, through `PUT /api/settings`. |

## 8. Files

| File | Job |
|---|---|
| `server/inventory-math.js` | Pure: in stock, lots, use-by states, Low, attention, the sheet rows, the farm's day |
| `server/inventory.js` | The store: checks and writes, one transaction each; the views |
| `server/inventory-api.js` | The routes; the `batches` subscription |
| `server/inventory-alerts.js` | The Telegram checks and texts |
| `web/inventory-math.js` | The formatter, the pill and line words, the dialogs' checks |
| `web/inventory-page.js`, `web/inventory-item.js`, `web/inventory-dialogs.js`, `web/inventory-count.js`, `web/inventory-sheet.js`, `web/inventory-settings.js` | The list page, the item page, the dialogs, the Count stock page, the 4-5 sheet, the Settings card |
| Shared (contract section 3) | `server/db.js` (the Inventory block and the version-22 step), `server/api.js` (one line), `web/route.js` and `web/app.js` (the four addresses: the list, an item, Count stock, the 4-5 sheet), `web/live.js` (`'inventory'` in `EVENT_TYPES`), `server/settings.js` (its block), the Settings page (one line mounting the card), `web/styles.css` (`.iv-`, at the end), `DESIGN.md` (an Inventory section), `README.md` and `PRODUCT.md` (a row each) |

## 9. Testing

| Test | Covers |
|---|---|
| `tests/inventory-math.test.js` (pure) | In stock; lots oldest first, a Throw out off its own lot, outs beyond the lots; soon and expired at the day's edges (farm time); Low; attention; the sheet rows (the crops from a run, a deleted room, not in a room) |
| `tests/db-inventory.test.js` | The upgrade from 20 to 22; the defaults when a row names only the contract's columns (as Batches writes); the unique name ignoring case |
| `tests/inventory.test.js` | Each write's checks and 400s; units and decimals; a purchase on a block item 409; a count against the records, a matching count; edit and delete of moves, a batch move refused; delete of a purchase with Throw outs; archive and delete of items |
| `tests/api-inventory.test.js` | The routes; the purchases shape and its days (farm time, batch moves left out); the sheet's days; the `inventory` events; a `batches` event re-publishing |
| `tests/inventory-alerts.test.js` | Low sent once, cleared when back over and sent again; use-by soon and expired once per lot; a changed use-by sent again; off or no Telegram sends nothing; a failure retried at the next check |
| `tests/web-inventory-math.test.js` | The formatter, the pills, Last counted's words, the per-unit price |
| `tests/settings.test.js` (added) | `inventoryTelegram` check and read-back |
| Look | The UI/UX audit: 1440, 1024 and 390 px, both themes: the list (with and without attention), the item page, each dialog, Count stock, the 4-5 sheet, the Settings card; then the Impeccable finish review |

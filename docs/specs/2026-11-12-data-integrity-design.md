# Data integrity: records the owner can trust (iteration B2)

Date: 2026-11-12 · Branch `feat/data-integrity` from `main` at `6816d19`, rebased onto Money truth (B1) before the build ·
Database version 29 (27 alarms, 28 Money truth) · Scope: the business audit (`~/.claude/task-logs/audit/business/REPORT.md`)
findings B5, B6, B7, B8, B9, B12 and B17, and the farmer audit's F10 for what is not sold
(`~/.claude/task-logs/audit/farmer/REPORT.md`), as the owner approved them (`~/.claude/task-logs/next/PLAN.md`, "proceed").
The lead chose every value the audit left open; each is in section 15.

The audit found the sums right and the records loose: a paid sale could be edited to a few sen and stay paid, a paid
delivery could be deleted with no trace, the same sale and the same cost were accepted twice, a sale many times the harvest
went through, produce stayed "not yet sold" long after it could keep, a room the app could not see was costed as if every
machine ran all day, every past day was priced at today's electricity price, and two pages could be a sen apart on the same
run. The figures in this spec's examples are made up. This iteration makes every money record
answer for itself: who wrote it and when, what it was before, why it went; asks once before a likely mistake; closes what
was never sold; and prices electricity the way the bill does.

## 1. Scope

| Finding | In | Out (later) |
|---|---|---|
| B7 | A change log of every money record (sale deliveries and their lines, payments, costs, Inventory purchases, uses, counts and throw-outs, equipment, harvests, Not sold, the tariff): who, when, before, after, why. Void instead of delete: a voided record stays in its list, its figures struck, with who and why, and leaves every figure. A paid sale is edited or voided only after **Mark unpaid**, with a reason. A Changes page of the whole log | Batches' own rows (deliveries, prices, checks) and the stock moves Batches writes: their history comes with Contamination (C), which reworks the checks. Locking a closed month (section 8.3 marks it instead) |
| B8 | Ask once before recording a likely duplicate: a sale (same buyer, crop and kg within 10 minutes), a cost (same date, category, amount and place), a harvest (same room, crop and kg within 10 minutes), a Not sold record | Duplicates across modules (a cost entered that Inventory also holds) |
| B9 | Server checks that ask once: kg sold of a crop beyond what was picked (+5 %), a crop sold before it was ever picked, a price over 3 × the expected, a line over 500 kg, a pick over 0.3 kg a block (the room's picks of the last 10 minutes summed). A sale beyond the harvest leaves a note on Costs and the Summary | Refusing any of them (the farmer may know better) |
| B12 + F10 | A **Not sold** record (day, crop, kg, reason: spoiled, rejected, sample, staff, dried, given away; room optional; who) that closes the unsold balance. Unsold kg ages out by the crop's keeping days: "still to sell" and "past its keeping days". Shrink per crop from the counted runs, an Economics source (Your runs) | Grades and packs on harvests and sales (F10's other half); selling dried produce as its own crop |
| B5 | Every room-day's electricity split into measured (the meter), estimated (machine run time) and unseen (time the app could not see the room: nothing counted). Costs, Runs, a run's page, Harvest and the Energy card show measured and estimated apart; a month warns when estimates pass 20 % of its kWh; "Electricity · measured" only when it is | Reconciling each room with a sub-meter's bill |
| B6 | A dated electricity tariff (from a day: the rate and the AFA, RM per kWh), each day priced at its own; Settings' price becomes a new rate from today. A TNB bill lowers the counted electricity as well as raising it. A month closes on the 14th of the next; a later change that moves its figures marks it "re-priced", with what it was and what changed, until the owner keeps the new figures | A dated water price; the TNB tariff's capacity and network charges as their own lines |
| B17 | One function prices electricity and water: each room-day rounded to the sen, then the rounded days summed. Costs, Runs, Harvest and the Energy card use it | Changing how Sales or Inventory round |

## 2. Data (database version 29)

One step, `if (version < 29) { … }` in `server/db.js` under `// ---- Data integrity ----`, `VERSION = 29`, every statement in
the one transaction of the upgrade. A void column is added only where the table lacks it (a table made new by an earlier
step of the same upgrade already has it, as the alarms step does).

### 2.1 Every change

| Change | Owner | SQL | Rule |
|---|---|---|---|
| `changes` table | Data integrity (`server/changes.js`) | `CREATE TABLE IF NOT EXISTS changes (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, by TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('owner','worker','app')), kind TEXT NOT NULL CHECK (kind IN ('sale','cost','equipment','harvest','move','not-sold','tariff','month','room')), row_id INTEGER NOT NULL, action TEXT NOT NULL CHECK (action IN ('add','edit','paid','unpaid','void','restore','undo','change','stop','keep','delete')), before TEXT, after TEXT, reason TEXT) STRICT`; indexes `(kind, row_id, id)` and `(at)` | Section 3 |
| Append only | Data integrity | `CREATE TRIGGER IF NOT EXISTS changes_kept_update BEFORE UPDATE ON changes BEGIN SELECT RAISE(ABORT, 'The change log is kept as written'); END;` and the same `BEFORE DELETE` (`changes_kept_delete`) | Nothing in the app rewrites the log |
| Void columns on `sales` | Sales | `ALTER TABLE sales ADD COLUMN voided_at INTEGER`, `… voided_by TEXT`, `… void_reason TEXT` | Written on every line of a delivery together (section 4) |
| Void columns on `costs` | Costs | The same three | |
| Void columns on `equipment` (version 28) | Costs | The same three | |
| Void columns on `harvests` | Harvest | The same three | |
| Void columns on `stock_moves` | Inventory | The same three | A `'batch'` move is never voided by Inventory (Batches owns it) |
| `not_sold` table | Sales | Section 2.2 | |
| `tariffs` table | Costs | Section 2.3; one row put in at the upgrade | |
| `month_closes` table | Costs | Section 2.4 | |
| A deleted room | Sales, Data integrity | `CREATE TRIGGER IF NOT EXISTS not_sold_room_gone AFTER DELETE ON rooms BEGIN UPDATE not_sold SET room_id = NULL, run_id = NULL WHERE room_id = OLD.id; END;`; `deleteRoom` writes one `changes` row (kind `room`, action `delete`, `before` `{ name, runs, harvests, kg }`) in its transaction | The room's harvests still go with it (as now); the log says how many and how much |

### 2.2 `not_sold`

| Column | Type | Rule |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Never reused (an Undo deletes by id) |
| `at` | INTEGER NOT NULL | ms; a day and time, not in the future (a minute's grace), not before 2020 |
| `crop` | TEXT NOT NULL | One of `CROP_KEYS` |
| `kg` | REAL NOT NULL CHECK (kg > 0 AND kg <= 10000) | To 2 places (Sales' `round2`) |
| `reason` | TEXT NOT NULL CHECK (reason IN ('spoiled','rejected','sample','staff','dried','given')) | Words: Spoiled, Rejected by the buyer, Sample, Eaten by staff, Dried, Given away |
| `room_id` | INTEGER | Null: not said. An existing room |
| `run_id` | INTEGER | Set on save: the room's run open at `at` (as a sale line's), null otherwise |
| `buyer_id` | INTEGER | Only for `rejected`: the buyer who turned it back (optional) |
| `note` | TEXT | Up to 200 characters, empty is null |
| `worker` | TEXT | Who recorded it (a worker: themselves, as every worker write) |
| `created_at` | INTEGER NOT NULL | ms |
| `voided_at`, `voided_by`, `void_reason` | | Section 4 |

Index `(at)`, `(crop, at)`. STRICT.

### 2.3 `tariffs`

| Column | Type | Rule |
|---|---|---|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `from_date` | TEXT NOT NULL UNIQUE | YYYY-MM-DD, a real day; the rate holds from it to the day before the next rate's `from_date` (the last rate: to today and on). The first rate's day is always `2020-01-01`, so every day has one |
| `rate` | REAL NOT NULL CHECK (rate >= 0 AND rate <= 10) | RM per kWh, the energy charge as the bill gives it, to 4 places |
| `afa` | REAL NOT NULL DEFAULT 0 CHECK (afa >= -1 AND afa <= 1) | RM per kWh, the Automatic Fuel Adjustment (a rebate is below 0), to 4 places |
| `note` | TEXT NOT NULL DEFAULT '' | Up to 200 characters ("TNB bill Oct 2026, AFA +2.75 sen") |
| `created_at` | INTEGER NOT NULL | ms |
| `voided_at`, `voided_by`, `void_reason` | | A voided rate is left out; the first rate can't be voided |

| Upgrade | Rule |
|---|---|
| The one row | `from_date '2020-01-01'`, `rate` = Settings' `electricityPrice` (0.55 when never set), `afa 0`, note "Settings' price before the tariff". Every past day keeps the price it had, so nothing moves at the upgrade |

A day's price is its rate's `rate + afa`, to 4 places.

### 2.4 `month_closes`

| Column | Type | Rule |
|---|---|---|
| `month` | TEXT PRIMARY KEY | YYYY-MM |
| `closed_at` | INTEGER NOT NULL | ms: when the figures were kept |
| `figures` | TEXT NOT NULL | JSON `{ income, costs, profit, writeOff, kWh: { measured, estimated }, runs: { <runId>: { income, costs, profit } } }` as Costs worked them out then |

A row is written by Costs (section 8.3), replaced only by **Keep the new figures** (a `changes` row, kind `month`, action `keep`,
`before` the old figures).

## 3. The change log

### 3.1 What an entry holds

| Field | Rule |
|---|---|
| `at` | The server's time of the write |
| `by`, `role` | The signed-in name and role (`req.who`); a write with no person (a test, a script, the app's own) is `'app'` / `'app'` |
| `kind`, `row_id` | What it is about: `sale` (the delivery's id: its lines are rewritten on an edit, the delivery keeps its id), `cost`, `equipment`, `harvest`, `move` (a stock move), `not-sold`, `tariff`, `month` (row id: YYYYMM as a number), `room` |
| `action` | `add`, `edit`, `paid`, `unpaid`, `void`, `restore`, `undo` (deleted inside its minute, section 4.3), `change` (a monthly item changed from a month: on the old item; the new item has its own `add`), `stop` (a monthly item's last month), `keep` (a month's new figures kept), `delete` (a room) |
| `before`, `after` | JSON of the record as its API shows it (camelCase), with the names it had then (`buyer`, `roomName`, `itemName`). `add`: `after` only; `edit`, `change`, `stop`: both; `paid`: `after { paidAt }`; `unpaid`: `before { paidAt }`; `void`, `restore`, `undo`: `before` the record |
| `reason` | Required on `unpaid` and `void` (3–200 characters after trimming: "Say why, in a few words"); optional on `restore` and `keep` |
| Same transaction | The entry is written in the transaction of the write it describes (`db.logChange` inside the store's `inTransaction`): a write that fails leaves no entry, and no write goes unlogged |
| Kept | For good; the triggers refuse an update or a delete |

### 3.2 What is logged

| Module | Writes logged |
|---|---|
| Sales | Record, edit, Mark paid, Mark unpaid, void, restore of a delivery; a buyer's rename is not money and is not logged |
| Not sold | Record, edit, void, restore, Undo |
| Costs | Add, edit, Change from a month, Stop, void, restore of a cost; add, edit, void, restore of an equipment item; add, edit, void of a tariff rate; Keep the new figures of a month |
| Harvest | Record (from Record, Edit, and a check's Done), edit, void, restore; a Done's Undo (its harvests deleted) as `undo` |
| Inventory | Purchase, use, count, throw-out (each move), edit, void, restore, Undo |
| Rooms | A room deleted (one entry) |

### 3.3 The words (`web/changes-math.js`, pure)

| Action | Words in a History list |
|---|---|
| `add` | "Recorded" ("Recorded by Aminah" when the person differs from the record's own name) |
| `edit` | "Edited: " and each field that changed, "before → after": "Pink oyster RM 18.00 → RM 0.10 a kg; total RM 57.60 → RM 0.32"; "kg 38.40 → 3.84"; "date 3 Nov → 4 Nov"; a line added "Grey oyster 4.00 kg added", gone "Pink oyster 1.50 kg removed" |
| `paid` | "Marked paid on 6 Nov" |
| `unpaid` | "Marked unpaid (was paid 6 Nov): The buyer's transfer bounced" |
| `void` | "Voided: Entered twice" |
| `restore` | "Restored" (": " and the reason when given) |
| `undo` | "Undone within a minute" |
| `change` | "From Dec 2026: RM 1,500.00 → RM 1,600.00 a month" |
| `stop` | "Stopped after Oct 2026" |
| `keep` | "New figures kept: profit RM 1,234.56 → RM 1,200.00" |
| `delete` | "Room 2 deleted with 2 runs and 14 harvests, 63.40 kg" |

Every entry's line: "10 Nov 14:03 · Lim · " and the words. A record of before the log: its History says "Recorded before the change
log began (12 Nov 2026)" first.

## 4. Void, restore, Undo and the paid lock

### 4.1 Void

| Rule | Detail |
|---|---|
| What it does | Sets `voided_at`, `voided_by`, `void_reason` on the record (every line of a delivery) and writes a `void` entry. The record stays, in its own list, and leaves every figure, sheet and reply that sums |
| Who | The owner. A worker never voids (403) |
| A reason | Required, 3–200 characters ("Why void it?", a hint "Entered twice") |
| Readers | Every query that sums or lists records for a figure adds `voided_at IS NULL`: Sales' totals, owed, by crop and buyer, the summary and the sheet; Costs' sources (`server/costs-sources.js`: sales, purchases, uses, counts, throw-outs, equipment, harvests) and its own costs; Inventory's lots, stock, `costedMoves`, alerts and the 4-5 sheet; Harvest's runs, BE, the Harvest page, the 4-6 sheet and the CSVs; Runs; Batches' run lines; Economics; the Summary; the unsold balance. A list that shows records for editing (Sales card, Costs entries, Harvest records, an item's history, the Equipment card, Not sold) shows a voided one in place (section 11) |
| A voided record's edit | Refused (409 "Restore it first"); it opens read only with its History |
| Restore | The owner; a `restore` entry (a reason optional); the record counts again. A restore that would break a rule a new record would meet (a sale whose buyer is now archived) is allowed: it was valid when made |
| A voided purchase | Voids the throw-outs taken from its lot in the same transaction (their reason "Its purchase was voided"), as a delete does now; its draws then come from the other lots (`costedMoves` on each read) |
| A voided harvest from a check's Done | Its task's amount becomes the total left, as a delete does now |
| A voided monthly item | Every charge goes from every month, as a delete did; the item stays in Monthly items' history struck |
| A voided equipment item | Its write-off goes from every month (as Money truth's delete); the item stays on the Equipment card struck |
| A voided tariff rate | Its days take the rate before it |

### 4.2 The paid lock (Sales)

| Rule | Detail |
|---|---|
| Edit | `PUT /api/sales/deliveries/:id` on a paid delivery: 409 `{ error: 'This sale is paid. Mark it unpaid first, with a reason.', field: 'paidAt' }` |
| Void | A paid delivery: 409 "This sale is paid. Mark it unpaid first, with a reason." |
| Mark unpaid | `PUT …/paid { paidAt: null, reason }`: the reason required (400 `field: 'reason'` "Say why it is no longer paid"); an `unpaid` entry with the paid day in `before` |
| Mark paid | `PUT …/paid { paidAt }` as now; a `paid` entry. A voided delivery: 409 "Restore it first" |
| Why | The cash in hand and the record must agree: a change to what was paid is a decision with a reason, not an edit |

### 4.3 Undo and delete

| Route | Now |
|---|---|
| `DELETE /api/sales/deliveries/:id`, `DELETE /api/costs/:id`, `DELETE /api/equipment/:id`, `DELETE /api/harvests/:id`, `DELETE /api/tariffs/:id` | 409 `{ error: 'Void it instead: a money record is kept.' }` |
| `DELETE /api/inventory/moves/:id`, `DELETE /api/not-sold/:id` | Undo only: within 60 s of its `add`, by the same person (`by`); the row goes and an `undo` entry keeps it. Otherwise 409 "Void it instead: a money record is kept." |
| A check's Done Undo (tasks) | Unchanged (its day, its person); each harvest it deletes gets an `undo` entry |

## 5. Asks: once before a likely mistake

### 5.1 The way an ask works

| Rule | Detail |
|---|---|
| Server | A write route works out its asks after its 400 checks pass. Any ask not in the body's `confirmed` (an array of kinds) → 409 `{ error: 'Check before saving', asks: [{ kind, field, text }] }`, nothing written |
| Browser | The dialog shows each ask's text under its field in the warning text (Field error's look in `warning-text`, the box's `aria-describedby`, polite), the primary button reads "Record anyway" ("Save anyway"); sending again adds the asks' kinds to `confirmed`. A changed value clears `confirmed` and the server asks again |
| One shape | `server/asks.js`: `askOrThrow(asks, confirmed)`; every module's asks use it, so every dialog reads the same reply |
| A worker | Gets the asks of the writes they may make (harvest, use, count, Not sold); the texts carry no RM |
| The browser's own checks | Sales' 3 × price and 500 kg checks and Harvest's pick check move to the server (one rule, one place); the dialogs keep only the 400 checks |

### 5.2 The asks

| Kind | Writes | Asks when | Words (field) |
|---|---|---|---|
| `duplicate` | Sale record and edit | Another delivery not voided to the same buyer has a line of the same crop and kg (to 0.01) and was sold within 10 min of this one, or sold the same farm day and recorded within the last 10 min (a back-dated sale is 12:00 every time) | "Kedai Ah Seng already has 4.00 kg of Grey oyster at 09:41 (RM 54.00), recorded 1 minute ago. Is this another sale?" (`lines.0.kg`) |
| `duplicate` | Cost add and edit (one-offs) | Another cost not voided, one-off, entered by hand, of the same date, category, amount and place (the farm or the room) | "A Packaging cost of RM 45.00 on 10 Nov is already recorded (by Lim at 11:20). Is this another one?" (`amount`) |
| `duplicate` | Harvest record (Record, a check's Done) | A harvest not voided in the same room of the same crop and kg (to 0.01) picked within 10 min | "38.40 kg of Grey oyster was recorded in Container 4 at 07:50 by Aminah. Is this another pick?" (`kg`, or the Done box `kg:<crop>`) |
| `duplicate` | Not sold record | The same crop, kg and reason within 10 min | "12.00 kg of Grey oyster was recorded not sold (spoiled) at 16:20. Is this another?" (`kg`) |
| `pick` | Harvest record and edit, a check's Done | The crop's picks in the room in the 10 min up to this one, with it, are over 0.3 kg a block of the run's blocks of the crop (`PICK_MAX_PER_BLOCK`) | One pick: "That's 0.40 kg a block in one pick. Is 240.00 kg right?" (as now). Several: "With the picks of the last 10 minutes that makes 165.25 kg from 500 blocks, 0.33 kg a block. Is 85.10 kg right?" (`kg`) |
| `price` | Sale record and edit | A line's RM per kg over 3 × the crop's expected price (Settings → Yield) | "That's 3.4 times the expected RM 12.00 per kg. Is RM 41.00 right?" (`lines.0.priceKg`; as now) |
| `kg` | Sale record and edit | A line over 500 kg | "Is 650.00 kg right?" (`lines.0.kg`; as now) |
| `oversell` | Sale record and edit, Not sold record and edit | The crop's balance (5.3) after this write: sold and not sold above picked × 1.05 | "That makes 2,418.00 kg of Abalone oyster sold or not sold, but 212.00 kg was picked. Is 2,400.00 kg right?" (`lines.0.kg` / `kg`) |
| `before-picked` | Sale record and edit | No pick of the line's crop, not voided, on or before the sale's farm day | "No Golden oyster pick is recorded on or before 2 Nov. Is the crop or the date right?" (`lines.0.crop`) |
| `beyond` | Not sold record and edit | More than the crop's unsold balance (section 6.2: still to sell and past its days) | "That's more than the 12.00 kg of Grey oyster not yet sold. Is 20.00 kg right?" (`kg`) |
| `closed-month` | Any money write or void dated in a closed month (section 8.3), a tariff rate whose days reach one | The date (or a date before the edit) is in a month with a `month_closes` row | "October 2026 is closed: this changes its figures, and the month will say re-priced." (`date`, `soldAt` or `from`) |

### 5.3 The crop's balance (B9)

| Rule | Detail |
|---|---|
| From | The crop's first recorded pick (not voided). A sale or Not sold dated before it is left out (it met `before-picked`) |
| Picked | Σ kg of the crop's picks not voided, to the end of the day asked |
| Sold, not sold | Σ kg of the crop's sale lines and Not sold records not voided, from the first pick's day to the day asked |
| Over | sold + not sold > picked × 1.05, compared to 0.01 kg. 212.00 kg picked allows 222.60 kg |
| On Costs | A note (`oversold`, the warning text) on every month whose last day (today in this month) has the crop over: "Abalone oyster: 2,418.00 kg sold or not sold to 10 Nov against 212.00 kg picked. Check the sales." The tiles still sum what is recorded |
| On the Summary | A Needs-you line, "Abalone oyster: sales above the harvest", linking to Sales; tone warning |

## 6. Not sold (B12, F10)

### 6.1 Recording

| Rule | Detail |
|---|---|
| Fields | Day (today by default; the day in words under its box), Crop, kg, Why (a picker of the six reasons, no default: "Pick why"), Room (optional; from the Harvest tab: that room), Buyer (only for Rejected; optional), Note, Who (the active workers; a worker: themselves) |
| Where | The Harvest tab's run card: **Not sold** beside Record a harvest (owner and workers); the Sales page's Unsold card (owner): **Record not sold**, and from a "past its keeping days" row with the crop and the kg filled in |
| Money | None: a Not sold record moves no RM. Its kg leaves the unsold balance; the cost of growing it is already counted |
| Ties to runs | Money truth's sale steps (`saleRuns` in `server/costs-math.js`), as a sale line of 0 RM: its own room's run that day, the one open run growing the crop, else the runs that picked it in the 14 days before, by kg |
| After | The Harvest tab says "12.00 kg of Grey oyster recorded not sold (spoiled) · Undo" for 60 s; the Sales page the same |

### 6.2 The unsold balance and keeping days

| Rule | Detail |
|---|---|
| The farm's now (Sales' Unsold card, the Summary) | Per crop, the picks not voided, oldest first. In time order, each sale line takes kg from the picks still fresh on its day (picked within the crop's keeping days up to it), oldest first, then from older picks; each Not sold record takes from the oldest picks first. What is left of each pick: **still to sell** when picked within the keeping days up to today, **past its keeping days** otherwise |
| A month (Costs) | As now, the month's picked − sold, and now − not sold, all by date: "6.0 kg picked and not yet sold (about RM 84.00 at your expected prices)" |
| A run (Costs, Runs, a run's page) | Its picked − its tied sold − its tied Not sold. The run page's Picked tile: "24.0 kg sold · 166.0 kg not sold · 0.0 kg left" |
| Value | Still to sell × the expected price (Settings → Yield), "about RM 162.00 at your expected prices"; past its keeping days has no value |
| Keeping days | Settings → Yield gains a column **Keeps fresh (days)**, 1–60, empty: the crop's default below. `cropYield` entries take `keepDays` |

| Crop | Default days | Basis |
|---|---|---|
| Grey oyster | 3 | S06: 3–4 days at 5–8 °C |
| Black oyster | 3 | As grey oyster |
| Pink oyster | 2 | P25, P26, P35: 24–36 h at room temperature, about 4 days chilled |
| Abalone oyster | 3 | As grey oyster (estimate) |
| Golden oyster | 2 | Fragile as pink (estimate) |
| Black jelly (wood ear) | 5 | J21, J32: 2–5 days at ambient, about 7 at 4 °C |
| Reishi (lingzhi) | 30 | Sold dried (estimate) |
| Milky (Calocybe indica) | 5 | Firm flesh (estimate) |
| Lion's mane | 5 | L01, L02: a week in the fridge, two hours outside |

### 6.3 Shrink for Economics

| Rule | Detail |
|---|---|
| Source | Economics' `shrink` figure (crop scope) gains Your runs: You set › Your runs › Research |
| Your runs | Over the counted runs (Money truth 8.2) of the crop: Σ Not sold kg tied to them ÷ Σ kg they picked × 100, to 0.1 % |
| When | Every counted run's balance is closed: its picked − sold − not sold is at most 5 % of its picked. Otherwise no Your runs figure, and the note says why |
| Note | "Your runs: 166.0 of 190.0 kg not sold (87.4 %), 1 run." Not closed: "Your runs: 21.0 kg of Container 4’s run of 3 Oct is neither sold nor recorded as Not sold: record it to measure shrink." |

## 7. Electricity: measured, estimated, unseen (B5)

### 7.1 A room's day (`server/usage.js`)

| Rule | Detail |
|---|---|
| Seen | A room is seen while one of its good readings (T and RH, CO₂, energy meter, filter pressure) is at most 15 min old (`SEEN_MS`: three readings at the slowest reading interval, 300 s; changed in the build, 17.1). A room with none of those devices is always seen (its estimate is all the app has; the Energy card says "No sensor: estimated from what the app switched") |
| Metered time | While a good meter reading is at most 15 min old (`SEEN_MS`) |
| Measured kWh | The meter's steps (as now), inside the metered time |
| Estimated kWh | Each machine's run time inside the seen time that is not metered, × its rating (as now: `estimateDay`). A machine left "on" in the log counts only while the room is seen: an outage is not costed as running all day |
| Unseen | The day's time from the room's first ever reading on that is not seen, in ms. Nothing is counted for it |
| The day | `{ date, kWh, kWhMeasured, kWhEstimated, unseenMs, metered, byMachine, waterL }`: `kWh` = measured + estimated (3 places); `metered` true when measured > 0 and estimated is 0 (the Energy card's meaning stays); water from the humidifier's seen run time |
| Cache | The day's work caches its seen and metered spans with its run times; the cache's rules for a reading written into its days stay |

### 7.2 Where it shows

| Place | Design |
|---|---|
| Costs' lines | Per room and run, two lines: "Electricity · measured" (source `measured`) and "Electricity · estimated" (source `estimated`, its muted source line "from machine run time"); a line at 0 not drawn. Water stays one line ("Water") |
| Costs' notes | `estimated-high` (warning text) when the month's estimated kWh are more than 20 % of its counted kWh: "94 % of November’s electricity so far (233.0 of 247.8 kWh) is estimated from machine run time. Enter the TNB bill to check it." `unseen`: "The app could not see Container 2 for 5 days 6 h 55 min this month: no electricity is counted for that time. Enter the TNB bill: its top-up counts it." (one note a room, an hour or more, the time to 5 min; a run's page: the same two notes over the run's own days) |
| Costs' reply | `monthView` gains `kWh: { measured, estimated, unseenMs }`; a run's `parts.energy` stays the whole, with `parts.energyEstimated` |
| A run (Costs' breakdown, Runs, a run's page) | "Electricity RM 64.37 measured · RM 9.85 estimated" in the money make-up line; the run page adds the two notes for its own days |
| Harvest tab and page | The cost per kg's basis line: "incl. RM 9.85 estimated" when any; "6 h not seen" when the run's days have unseen time |
| Energy card (Usage) | Each day's bar keeps its metered/estimated tone; a day with unseen time is marked "not seen 6 h 55 min" in its read-out (to 5 min, as Costs' note and the Harvest tab); the 7 and 30 day tiles' basis line says "part estimated" when any day is |
| Economics | Your runs' electricity per block keeps every counted day; its note adds "of which 34 % estimated, 2 days not seen" when so |

## 8. The tariff and the bill (B6)

### 8.1 The tariff

| Rule | Detail |
|---|---|
| A day's price | Its rate's `rate + afa` (2.3) |
| Settings | The Electricity price box gives way to an **Electricity tariff** card: a table From · To · Rate · AFA · RM per kWh · Note, newest first, a quiet Edit each; **Add a rate** (From, Rate, AFA, Note). To is worked out ("to 30 Sep 2026", the last "and on") |
| Old route | `PUT /api/settings { electricityPrice }` adds a rate from today (AFA 0) instead of changing the past; `GET /api/settings` gives `electricityPrice` as today's price, so Economics' Settings source and the simulator read today's |
| Its days | A rate added, edited or voided changes the days it holds: when they reach a closed month, the `closed-month` ask first |
| Workers | Never see it (money) |

### 8.2 A bill lowers as well as raises

| Case | Rule |
|---|---|
| The counted electricity of a bill's period | Σ the period's measured and estimated lines (each priced per day, section 9), as the top-up counts them now |
| Bill above it | As now: "Unmeasured electricity", shared over the runs by block-days, the bill − counted |
| Bill below it | A correction of counted − bill, taken off the estimated lines of the period first, each by its share of the estimated RM (floored to the sen, the last taking the rest: `split`), up to all of them; what is left off the measured lines, the same way. Each piece a line "Electricity above the bill" (source `bill`, negative) on its line's room and run. The note "the estimate runs high" goes |
| Equal | Nothing added |
| Water | The same rules for a water bill |

### 8.3 Closed months

| Rule | Detail |
|---|---|
| When a month closes | At the end of the 14th day of the next month (farm time): the bill has usually come. Its figures are kept (`month_closes`) by the first Costs read after that which is not pending, and by the daily tick at 06:00 |
| Re-priced | A month with a close whose figures now differ by RM 0.01 or more (income, costs or profit; any run's) is re-priced: `monthView` gains `repriced: { closedAt, was: { income, costs, profit }, changes: [entries] }` (the log's entries made after `closed_at` whose record's date, before or after, is in the month, and tariff entries whose days reach it) |
| Costs page | Under the month's tiles, in the warning text: "Re-priced since 14 Dec: profit was RM 1,234.56, now RM 1,200.00." and "What changed (3)" opening the entries; a quiet **Keep the new figures** (a `keep` entry; the mark goes) |
| The 12 months chart | A re-priced month's bar has a dot over it and says "re-priced" in its name |
| Runs | A run with a part in a re-priced month says "Re-priced" under its Profit, linking to that month |
| Lock | Not this iteration: open for the owner |

## 9. One rounding (B17)

| Rule | Detail |
|---|---|
| The function | `energyCost(days, { tariff, waterPrice })` in `server/energy-cost.js`, pure: per room-day, measured RM = round(kWhMeasured × the day's price, 2), estimated RM = round(kWhEstimated × the day's price, 2), water RM = round(waterL ÷ 1,000 × water price, 2) (null without a water price); sums the rounded days. → `{ measured, estimated, electricity, water, kWhMeasured, kWhEstimated, unseenMs }` |
| Rounding | Sales' `round2` (half away from zero on the decimal text), so RM 0.5555 is RM 0.56 on every page |
| Users | Costs' measured and estimated lines (a line = its room-run days), a bill's counted part, Harvest's run and range cost, the Energy card's tiles and days, Economics' electricity cost where it prices days |
| A month | Σ its lines, each Σ its days: the month equals the sum of its rooms to the sen |

## 10. API

| Route | Change |
|---|---|
| Every write route of section 3.2 | Takes `confirmed: [kinds]`; may answer 409 `{ error, asks }` (section 5); logs its change with `req.who` (the route helpers gain `who`) |
| `PUT /api/sales/deliveries/:id` | 409 on a paid or a voided delivery (4.1, 4.2) |
| `PUT /api/sales/deliveries/:id/paid` | `{ paidAt: null, reason }` needs the reason |
| `POST /api/sales/deliveries/:id/void` `{ reason }`, `POST …/restore` `{ reason? }` | → the delivery. 404, 400 `reason`, 409 paid |
| `POST /api/costs/:id/void`, `/restore`; `POST /api/equipment/:id/void`, `/restore`; `POST /api/harvests/:id/void`, `/restore`; `POST /api/inventory/moves/:id/void`, `/restore`; `POST /api/not-sold/:id/void`, `/restore` | The same shape. A `'batch'` move: 409 "Change it in Batches" |
| The `DELETE` routes | Section 4.3 |
| `GET /api/not-sold?days=7\|30\|90\|365` | `{ from, to, records: [{ id, at, crop, kg, reason, roomId, roomName, runId, buyerId, buyer, note, worker, voided, edits }] }` |
| `POST /api/not-sold`, `PUT /api/not-sold/:id` | `{ at, crop, kg, reason, roomId?, buyerId?, note?, worker, confirmed? }` → 201 / 200 the record. 400 with `field` |
| `GET /api/sales` | Gains `unsold: { crops: [{ crop, fresh, past, pastSince, value }], total: { fresh, past, value } }` (6.2); each delivery gains `voided: { at, by, reason } \| null` and `edits` (its `edit` and `unpaid` entries' count: a Mark paid is no edit, 17.1) |
| `GET /api/changes?kind=&id=` | One record's entries, oldest first: `{ entries: [{ id, at, by, role, action, before, after, reason }], before: true }` (`before`: the record is older than the log). Owner only |
| `GET /api/changes?days=&kind=&by=` | The Changes page: newest first, at most 500, with `kinds` and `people` for the filters |
| `GET /api/changes.csv?days=` | `when,who,what,record,action,change,reason`, the BOM and the formula guard |
| `GET /api/tariffs`, `POST /api/tariffs`, `PUT /api/tariffs/:id`, `POST /api/tariffs/:id/void` | `{ tariffs: [{ id, from, to, rate, afa, price, note, voided }] }`; a body `{ from, rate, afa?, note?, confirmed? }`; 400 with `field`, 409 a `from` already taken ("A rate starts on that day: edit it") |
| `POST /api/costs/months/:month/keep` | Keep the new figures (8.3) → the month view |
| `GET /api/costs/month` | Gains `kWh`, `repriced`, the `estimated` and negative `bill` lines, notes `estimated-high`, `unseen`, `oversold`; entries gain `voided`, `edits` |
| `GET /api/rooms/:id/harvests` | Each harvest gains `voided`, `edits`; each run gains `notSold: [records]` (no `left`: 17.1) |
| `GET /api/rooms/:id/usage`, `GET /api/usage` | Days gain `kWhMeasured`, `kWhEstimated`, `unseenMs`; totals gain `estimated` (RM) |
| Events | Every void, restore and Undo publishes its module's event (`sales`, `costs`, `harvest`, `inventory`); Not sold publishes `sales`; a tariff rate publishes `costs` and `harvest` `{ roomId: null }` (every cost per kg moves) |

## 11. The pages

| Page or part | Design |
|---|---|
| Voided record, every list | The row stays in its place, drops to `ink-2` 400, its figures (kg, RM) struck through, the word "Voided" in a muted chip before them, and under it "Voided 10 Nov by Lim: Entered twice" (muted 13 px, not struck). A new named rule in DESIGN.md, the Void Rule: a voided money record is the one row whose figures are struck; a done task or closed row still never is |
| Edited mark | A record with `edits` over 0: a muted "edited" after its date (13 px), its count in the History title |
| History (in every Edit dialog of a money record) | A fold at the dialog's foot, over the buttons, "History (4)": opening it reads `GET /api/changes?kind=&id=` and lists the entries newest first, one a row (when · who · words, the reason in quotes under them); "All changes" at its end opens the Changes page filtered to the record. Owner only (a worker's dialogs have no History) |
| Void in an Edit dialog | The quiet red button at the footer's start reads "Void this sale" ("Void this cost", "… item", "… harvest", "… purchase", "… use", "… count", "… record"). Its confirm: title "Void the sale of 5 Nov to Kedai Ah Seng?", lead "RM 214.50 · Grey oyster 12.00 kg, Pink oyster 4.50 kg. It stays in the list, struck through, and leaves every figure.", a required "Why void it?" box (hint "Entered twice"), buttons **Void sale** (Danger) and Cancel. A voided record's Edit opens read only: "Voided 10 Nov by Lim: Entered twice", **Restore** (quiet) and its History |
| A paid sale's Edit | The fields read only, a line "Paid 6 Nov. To change this sale, mark it unpaid first." and **Mark unpaid…** (quiet). Mark unpaid opens a small dialog: lead "Tue 3 Nov · Restoran Wong · RM 57.60, paid 6 Nov", a required "Why is it no longer paid?" (hint "The buyer's transfer bounced"), **Mark unpaid** (primary). Back in the Edit dialog the fields open and the paid line says "Unpaid since just now" |
| Asks | Every Record and Edit dialog of section 5 shows the server's asks under their fields (5.1); Record anyway sends again |
| Sales page | The Sales card lists voided deliveries struck (in date order); the totals, owed and tables leave them out. A new **Unsold** card after the totals: a row per crop with unsold kg: crop, "9.0 kg still to sell · about RM 162.00", "166.0 kg past its keeping days since 6 Nov" (warning text) and **Record not sold** on that row (crop and kg filled in); then the period's Not sold records (day, crop, kg, why, who, a quiet Edit). None unsold and none recorded: the card is not drawn. Head gains **Record not sold** (secondary) |
| Costs page | By category: "Electricity · measured" and "Electricity · estimated" rows (source "from the meter", "from machine run time"), "Electricity above the bill" when negative. The notes of 7.2 and 5.3. Entries: voided ones struck. The re-priced line and Keep the new figures under the tiles (8.3). The Equipment card's items: Void in place of Delete |
| Runs and a run's page | The money make-up line with measured and estimated electricity; the Picked tile's sold, not sold and left; "Re-priced" under Profit when so |
| Harvest tab | The run card: **Not sold** beside Record a harvest (owner and worker), the run's Not sold records under its harvests ("12.00 kg spoiled · Aminah · 16:20"), voided harvests struck; Edit of a harvest: Void (owner) |
| Harvest page | The records table's voided rows struck; cost per kg's basis line (7.2) |
| Inventory | An item's history: voided moves struck; Edit dialogs: Void (owner); Undo as now inside its minute |
| Settings | The Electricity tariff card (8.1); Yield's Keeps fresh column (6.2) |
| Summary | The money card's Not sold tile and line become **Still to sell** ("9.0 kg", "about RM 162.00 at your expected prices") and the line "166.0 kg past its keeping days: record it as Not sold" with a Sales link (warning text); the Needs-you line for sales above the harvest; a foot link **Change history** to the Changes page |
| Changes page | `#/business/changes` (not a tab: reached from the Summary, every History fold and Settings). Head "Changes", the line "Every change to a money record: who, when, before and after.", the period segments (7 days · 30 days · 13 weeks · 12 months), filters What (All, Sales, Costs, Equipment, Harvests, Inventory, Not sold, Tariff, Months, Rooms) and Who (the people in the period), **Export CSV**. A table: When, Who, What ("Sale of 5 Nov to Kedai Ah Seng", a link to it), Change (the words of 3.3), Why. On a phone each entry a block: when and who, then what, the change, why. Owner only |
| Sizes | Every page at 1440, 1024 and 390 px, both themes; targets 44 px on a phone; tokens only (`.dx-` styles for the Changes page and the shared parts, between `/* ---- Data integrity ---- */` comments) |

## 12. Workers

| Action | Owner | Worker |
|---|---|---|
| Record a harvest (Record, a check's Done) | Yes | Yes, as themselves; the `duplicate` and `pick` asks apply |
| Edit, void or restore a harvest | Yes | No (403, as now for edit) |
| Record a use or a count | Yes | Yes, as themselves (as now); their asks apply |
| Undo their own use or count inside its minute | Yes | Yes (`DELETE /api/inventory/moves/:id` added to the worker routes, the same-person rule in the store) |
| Void, restore or edit a stock move | Yes | No |
| Record Not sold | Yes | Yes, as themselves, from the Harvest tab; `POST /api/not-sold` and `DELETE /api/not-sold/:id` (their own Undo) added to the worker routes |
| Edit, void or restore Not sold | Yes | No |
| Sales, costs, equipment, tariff, closed months | Yes | No (as now) |
| See voided harvests struck, and who voided and why | Yes | Yes (no money in it) |
| History folds, the Changes page, `GET /api/changes` | Yes | No (403: the log holds money) |
| Logged under their name | | Every worker write's `by` is the signed-in name, whatever the body says (the login rule) |

## 13. The contract (`~/.claude/task-logs/business/CONTRACT.md`)

| Section | Change |
|---|---|
| 5, tables | `sales`, `costs`, `equipment`, `harvests`, `stock_moves`: `voided_at`, `voided_by`, `void_reason`; **every reader leaves `voided_at IS NOT NULL` rows out of every figure**. New: `changes` (Data integrity, append only), `not_sold` (Sales), `tariffs` and `month_closes` (Costs) |
| 5, reads | `GET /api/sales` gains `unsold` and each delivery `voided`, `edits`; `GET /api/costs/month` gains `kWh`, `repriced`, lines of source `estimated` and negative `bill`; a run's `parts.energyEstimated`; usage days gain `kWhMeasured`, `kWhEstimated`, `unseenMs`; `readSettings(db).electricityPrice` is today's tariff price; `energyCost` (`server/energy-cost.js`) is the one way to price usage days; the asks reply (409 `asks`) is every write's |
| 7, a row | 2026-11-12, Data integrity: the change log and who writes it (each module, in its write's transaction, through `db.logChange`); void not delete (each module its own records; Inventory never voids a `'batch'` move); the paid lock; the asks and their kinds; Not sold (Sales) and its ties (Costs' sale steps); keeping days (Settings → Yield); seen, measured and estimated time (Usage); the tariff, the bill's correction and closed months (Costs); one rounding (`energyCost`) |

## 14. Golden cases (from the audit's numbers)

| # | Case | Expected |
|---|---|---|
| G1 | A paid delivery of 3 Nov: Pink oyster 3.20 kg × RM 18.00 = RM 57.60, paid 6 Nov. `PUT` it to 3.20 kg × RM 0.10 | 409 "This sale is paid. Mark it unpaid first, with a reason." Nothing changes |
| G2 | G1's delivery: Mark unpaid with no reason, then with "The buyer's transfer bounced", then the edit | 400 `reason`; then unpaid, an `unpaid` entry (`before { paidAt: 6 Nov }`); then RM 0.32, an `edit` entry "Pink oyster RM 18.00 → RM 0.10 a kg; total RM 57.60 → RM 0.32". History: Recorded, Marked paid on 6 Nov, Marked unpaid (was paid 6 Nov): The buyer's transfer bounced, Edited |
| G3 | `DELETE` another paid delivery, RM 54.00 | 409 "Void it instead: a money record is kept." Void while paid: 409. Unpaid, void "Entered twice": the Sales card shows it struck, "Voided 10 Nov by Lim: Entered twice"; income falls by RM 54.00 and nothing more is owed |
| G4 | Two deliveries to the same buyer: 4.00 kg Grey oyster × RM 13.50 at 09:41 and 09:41 | The second: 409 `asks [duplicate]` "… already has 4.00 kg of Grey oyster at 09:41 (RM 54.00) …"; sent with `confirmed: ['duplicate']`: 201. 4.10 kg: no ask |
| G5 | Two Packaging costs of RM 45.00 on 10 Nov for the farm | The second asks `duplicate`; RM 45.00 Packaging on 11 Nov, or Rent on 10 Nov, or for Container 4: no ask |
| G6 | Container 4, 500 Grey oyster blocks: picks of 38.40 kg at 07:50, 41.75 kg at 07:52, 85.10 kg at 07:54 | None is a duplicate; the third asks `pick`: "With the picks of the last 10 minutes that makes 165.25 kg from 500 blocks, 0.33 kg a block. Is 85.10 kg right?" A second 38.40 kg at 07:52: asks `duplicate` |
| G7 | Abalone oyster: 212.00 kg picked, 18.00 kg sold. A sale of 2,400.00 kg | Asks `oversell` "That makes 2,418.00 kg of Abalone oyster sold or not sold, but 212.00 kg was picked. Is 2,400.00 kg right?"; confirmed: Costs' November notes "Abalone oyster: 2,418.00 kg sold or not sold to 10 Nov against 212.00 kg picked. Check the sales." and the Summary's Needs-you line. A sale bringing the total to 222.60 kg: no ask; 222.61 kg: asks |
| G8 | A Golden oyster sale dated 2 Nov; the first Golden oyster pick 3 Nov | Asks `before-picked` "No Golden oyster pick is recorded on or before 2 Nov. Is the crop or the date right?"; confirmed, the sale stays out of the crop's balance |
| G9 | A line at RM 41.00 a kg, expected RM 12.00, sent by a client with no browser check | The server asks `price` "That's 3.4 times the expected RM 12.00 per kg. Is RM 41.00 right?" |
| G10 | Black jelly picked 1 Nov, 190.0 kg; 24.0 kg sold 2 Nov; today 10 Nov; keeps 5 days | Unsold card: "166.0 kg past its keeping days since 6 Nov", no value; Summary "166.0 kg past its keeping days: record it as Not sold". Record Not sold 166.00 kg, spoiled: the balance is 0, the card and the Summary line go, the run's Picked tile "24.0 kg sold · 166.0 kg not sold · 0.0 kg left" |
| G11 | G10's run ended and counted in Economics | Shrink from Your runs 87.4 % ("166.0 of 190.0 kg not sold (87.4 %), 1 run."), in place of the research 6 % |
| G12 | Container 2, metered, readings 2–6 kWh a day to 3 Nov 16:50, then none; the aircon's last log row "on, cool"; now is 9 Nov 00:00 | 4–8 Nov: 0.000 kWh each, unseen 24 h each (before: estimated up to 41 kWh a day); 3 Nov measured to 16:50, seen to 17:05, 6 h 55 min unseen; November's note "The app could not see Container 2 for 5 days 6 h 55 min this month …" |
| G13 | November: Container 2 measured 14.8 kWh, Container 5 (no meter, seen all month) estimated 233.0 kWh | Lines "Electricity · measured" for Container 2 and "Electricity · estimated" for Container 5; the note "94 % of November’s electricity so far (233.0 of 247.8 kWh) is estimated from machine run time. Enter the TNB bill to check it." |
| G14 | Tariff: 0.5150 from 1 Jan 2020; AFA +0.0275 from 1 Oct 2026. A room uses 10.000 kWh on 30 Sep and on 1 Oct | 30 Sep RM 5.15, 1 Oct RM 5.43 (5.425, half away from zero) (before: RM 5.50 each, today's price). Settings' `electricityPrice` reads 0.5425 |
| G15 | October bill RM 500.00; counted RM 560.00 (measured RM 430.00; estimated RM 100.00 in Container 1 and RM 30.00 in Container 2) | "Electricity above the bill" −RM 46.15 (Container 1) and −RM 13.85 (Container 2): counted RM 500.00. A bill of RM 400.00: −RM 100.00, −RM 30.00 and −RM 30.00 off the measured lines by their shares: RM 400.00. RM 600.00: "Unmeasured electricity" RM 40.00 shared, as before |
| G16 | October closed 14 Nov at profit RM 2,045.30 (1,180.0 kWh at RM 0.5150); on 20 Nov the owner adds the October AFA rate, +0.0275 from 1 Oct | The tariff ask `closed-month`; confirmed: October "Re-priced since 14 Nov: profit was RM 2,045.30, now RM 2,012.85." (1,180.0 kWh × RM 0.0275 = RM 32.45 more), What changed (1) the rate's `add`; Keep the new figures: a `keep` entry, the mark goes |
| G17 | A run's three days of 1.010 kWh at RM 0.55 | Each day RM 0.56 (0.5555), the run RM 1.68 on Costs, Runs, the Harvest tab and the Energy card (before: the Harvest tab RM 1.67 from 3.030 kWh × 0.55 = 1.6665) |
| G18 | A month of two rooms | The month's electricity equals Container 1's lines + Container 2's lines to the sen (before: a month could be a sen or two off the sum of its rooms) |
| G19 | A worker records 7.6 kg of Pink oyster, then posts `void` on it, then `GET /api/changes` | 201 with the harvest, its `add` entry `by` the worker; 403; 403 |
| G20 | An Inventory use by Sara, Undo at 40 s by Sara; another, Undo at 70 s | The first gone, an `undo` entry; the second 409 "Void it instead: a money record is kept." |

## 15. Decisions (the lead's, 2026-11-12)

| # | Question left open | Decision | Why |
|---|---|---|---|
| 1 | Log in the app or in SQL triggers | In each store's write, in its transaction, through one `db.logChange` | A delivery edit rewrites its lines; a trigger would log row noise without who or why. A test per write route (section 18) keeps the log complete |
| 2 | A sale's history: per line or per delivery | Per delivery (`row_id` = the delivery's id) | The owner edits a delivery; its lines are rewritten on each edit |
| 3 | Void a paid sale directly | No: Mark unpaid first, as for an edit | One rule for "what was paid changes" |
| 4 | Undo inside its minute: a void or a delete | A delete, kept in the log as `undo` | A slip seconds ago struck in the list forever is noise; the log still holds it |
| 5 | Restore | Yes, the owner's, logged | A void by mistake must come back without re-typing |
| 6 | Voided rows shown or hidden | Shown in place, struck, with who and why | The owner's scope; a new Void Rule beside "a done row is never struck" |
| 7 | Duplicate window | 10 minutes, and the same farm day for a back-dated sale | The audit's; back-dated sales are all 12:00 |
| 8 | A cost duplicate's window | The same date, any time | Costs carry a date, not a time |
| 9 | Several quick picks of different kg | Not a duplicate; their sum against the pick check | Workers weigh crate by crate; several heavy picks minutes apart are caught by kg a block |
| 10 | The browser's 3 × and pick checks | Moved to the server, one ask reply | One rule, one place; a script or an old page can't skip it |
| 11 | Oversell basis | All time from the crop's first recorded pick, sold + not sold > picked × 1.05 | Picks before the harvest upgrade were never recorded; a sale before the first pick asked already |
| 12 | Ages of unsold kg | Kept per crop as days, defaults from the research, set in Settings → Yield | A farm with a cold room keeps longer |
| 13 | Who records Not sold | Owner and workers | The worker sees the spoiled crates first; no money in it |
| 14 | Not sold to runs | Money truth's sale steps, as a 0 RM line | One tie rule for everything sold or not |
| 15 | Shrink measured when | Only when every counted run's balance is closed (≤ 5 % left) | An unrecorded loss would read as no shrink |
| 16 | Seen | A good reading at most 15 minutes old; a room with no sensor always seen | The poller reads every 5 s by default but may be set to 300 s; 15 min is three readings at the slowest, so a slow interval never reads as an outage. With no device the app has nothing else |
| 17 | A metered day's gap | Metered while a meter reading is ≤ 15 min old; seen but unmetered time estimated | A day's meter half missing would otherwise undercount quietly |
| 18 | Tariff shape | From a day only (to = the next rate's day before); rate and AFA apart | No gaps or overlaps to check; the bill prints both and AFA changes monthly |
| 19 | Settings' electricity price | A new rate from today when set | Old pages and tests keep working, and the past is never re-priced by a Settings save |
| 20 | Bill below the counted | Taken off the estimates first, then the measured, on their rooms and runs | The estimate is the likelier error; a shared cut would move cost to rooms that measured right |
| 21 | Closed months | Close at the end of the 14th of the next month, mark re-priced, Keep the new figures | Honest without a lock; the bill comes in the first two weeks |
| 22 | Rounding | Per room-day, half away from zero (`round2`), summed | The audit's; the per-day price needs a per-day sum anyway |
| 23 | The Energy card | Uses `energyCost` too | Otherwise a fourth page would disagree |
| 24 | Batches' rows | Not logged this iteration | Contamination (C) reworks the checks; Batches' moves are Batches' |
| 25 | The Changes page | A page of its own, not an eighth Business tab | The tab strip is full; the log is an owner's look-back |

## 16. Open for the owner

| # | Question | Until answered |
|---|---|---|
| 1 | Lock a closed month instead of marking it re-priced? | Marked re-priced, the new figures shown |
| 2 | The 14th as the close day | The 14th |
| 3 | Keeping days per crop (6.2), with your cold room | The defaults; Settings → Yield changes them |
| 4 | Record as Not sold what was picked before this iteration and never sold (and why) | The Summary says it is past its keeping days |
| 5 | Enter the tariff's AFA by month from your TNB bills | One rate from 2020 at Settings' RM 0.55 |
| 6 | Enter the TNB bill of any month a room was not seen for days | Unseen time costs nothing until the bill's top-up |
| 7 | Is 5 % the right allowance above the harvest? | 5 % |
| 8 | Should a worker undo a harvest they just recorded (as a use)? | Only the owner voids harvests; a check's Done keeps its Undo |
| 9 | Batches' history now, before Contamination? | With Contamination |
| 10 | Is 15 minutes the right seen window (a room's time after its last reading still counted)? | Answered 2026-11-20: 15 min (three readings at the slowest interval) |
| 11 | The Charts tab's range total still prices its kWh at today's price (it sums time buckets, not days) | Left as is; the Energy card's tiles and days use the tariff |
| 12 | On a phone, Costs shows one "could not see" note a room; one shared note for rooms of the same time would be shorter | One note a room |
| 13 | A bill dated in the next month (October's, billed 3 Nov): count it for the month it covers, re-pricing that month if closed? | Answered 2026-11-20: for the month it covers; the Changes page shows it |

## 17. Depends on Money truth (B1)

| Money truth gives | This iteration uses it for | Conflict and how it is settled |
|---|---|---|
| Database 28, `equipment` | Void columns on `equipment`, its log | Money truth's "Delete this item" (6.2) becomes "Void this item"; `DELETE /api/equipment/:id` answers 409 |
| `costedMoves` (Inventory) | Voided moves left out before costing | Money truth reads every move; it must read through the store's not-voided list |
| Uses, counts and throw-outs as costs (5.1) | Their void and Undo move Costs | None |
| The bill's top-up (Costs' `topUp`), note `bill-below` | The correction of 8.2 | Money truth keeps "Measured … is above the bill: the estimate runs high"; this iteration replaces it with the correction lines |
| The measured lines (`measuredGroups`, source `measured`, CSV `measured`) | Split measured and estimated, priced by `energyCost` | Money truth's "Electricity" label becomes "Electricity · measured" / "· estimated"; the CSV sources gain `estimated` |
| The sale steps (`saleRuns`, `saleParts`) | Not sold's ties; a run's left; shrink | Money truth's ties read voided sales out |
| Counted runs (8.2) | Shrink from Your runs | None |
| The Summary's `stock` and `bought` lines | Placed beside Still to sell | The Summary's "Not sold" tile (business-summary spec) becomes "Still to sell" |
| Runs' `untied` | Leaves voided lines out | None |
| `PUT /api/runs/:id/blocks-in` | Not logged (not money) | None |
| The contract's 2026-11-12 Money truth row | A new row after it | None |

### 17.1 Changed during the build (2026-11-13)

| Spec | Built | Why |
|---|---|---|
| 7.1, decisions 16–17 | `SEEN_MS` 15 min, not 5; G12 reads 6 h 55 min unseen | Three readings at the slowest reading interval (300 s): a slow interval is not an outage |
| 7.2 | Every unseen time is said to 5 min (Costs, the Harvest tab, the Energy card) | One rounding for one figure |
| 10 | `GET /api/rooms/:id/harvests` runs carry `notSold` but no `left` | A run's left needs Costs' sale ties; the run page's Picked tile (Runs, from Costs) says it |
| 10 | `edits` counts `edit`, `unpaid`, `change` and `stop`, not `paid` | A Mark paid is no edit (seen on the UI check: a paid sale read "edited") |
| 3.1 | A harvest's History owns only the entries after its id's last Undo and from its making on | `harvests.id` has no AUTOINCREMENT: a Done's Undo (or a room delete) gives the newest ids back |
| 10 | The Changes page shows the newest 500 of a period and says so; the CSV has every entry | A year's log is more than a page |
| 8.3 | A close tick a minute after start and at 06:00 daily, besides the first Costs read | A month nobody opens still closes |
| 4.1 | The Harvest page's 4-6 table shows a voided pick struck on screen; the printed sheet leaves it out | The page's table is the sheet |
| 6.2 | A Not sold record takes the oldest picks first, then, when those are gone, later ones (as a sale does) | Nothing recorded is lost from the balance |
| 8.1 | Settings' price on a day that already has a rate keeps its AFA (the rate is what makes the day's price the one typed); the same price writes nothing | Settings' price is the day's whole price |
| 4.3 | The pages offer Undo for 58 s; the server allows 60 s from the `add` entry | A press at the edge never meets a 409 halfway |
| 11 | A worker opening `#/business/changes` reads "Ask the owner" (the server refuses the log) | As the spec's page; no longer sent to Today |

## 18. Testing

| Test | Covers |
|---|---|
| `tests/db-data-integrity.test.js` | The step from a version 28 file: `changes` (STRICT, both triggers refuse), the void columns on five tables, `not_sold`, `tariffs` with its one row at Settings' price, `month_closes`; rows kept; the room delete's entry and trigger |
| `tests/changes.test.js` | `logChange` inside a failing write leaves nothing; entries' shape; `GET /api/changes` by record and by period; the CSV; a worker's 403 |
| `tests/web-changes-math.test.js` | The words of 3.3 for every action and kind |
| `tests/changes-coverage.test.js` | Every write route of 3.2, driven through the API, leaves exactly its entry with the signed-in `by` |
| `tests/asks.test.js` | `askOrThrow`; the 409 shape; `confirmed` |
| `tests/sales.test.js`, `tests/api-sales.test.js` | G1–G4, G7–G9: the paid lock, Mark unpaid's reason, void and restore, the asks, the voided rows out of every figure |
| `tests/costs*.test.js` | G5, G13, G15, G16, G18: void, duplicates, the split lines, the notes, the correction, closed months and Keep |
| `tests/harvests.test.js`, `tests/api-harvest.test.js` | G6, G19: void, the asks on Record, Edit and Done, a worker's rights |
| `tests/inventory*.test.js` | Void, a purchase's throw-outs, G20 |
| `tests/not-sold.test.js`, `tests/unsold-math.test.js` | Recording, the asks, ties, G10: the balance, keeping days, still to sell and past |
| `tests/economics*.test.js` | G11 |
| `tests/usage.test.js` | G12: seen spans, metered time, unseen ms; the cache |
| `tests/energy-cost.test.js` | G14, G17: per-day prices, `round2`, the tariff's days |
| `tests/tariffs.test.js` | Routes, the first rate, `PUT /api/settings` adding a rate, the closed-month ask |
| `tests/roles.test.js` | Section 12's routes |
| `tests/web-*.test.js` | The pages' new words: void rows, asks, Unsold card, Changes page rows, re-priced lines, tariff rows |
| Look | Sales, Costs, Runs, a run, Harvest tab and page, Inventory item, Settings, Summary and Changes at 1440 and 390 px, dark and light (the UI/UX audit step) |

## 19. Files

| File | Change |
|---|---|
| `server/db.js` | The version 29 step; `logChange`, `changesOf`, `changesBetween`; void and restore methods per table; not-voided filters in every read; `not_sold`, `tariffs`, `month_closes` methods |
| `server/changes.js`, `server/changes-api.js` (new) | The log's reads, the CSV, the routes |
| `server/asks.js` (new) | `askOrThrow` |
| `server/energy-cost.js` (new) | `energyCost`, `priceOn(tariff, date)` |
| `server/not-sold.js`, `server/unsold-math.js` (new) | Not sold's store and routes' work; the balance and aging |
| `server/tariffs.js` (new) | The tariff store; Settings' price |
| `server/sales*.js`, `server/costs*.js`, `server/harvests.js`, `server/harvest-api.js`, `server/inventory*.js`, `server/tasks.js`, `server/usage.js`, `server/economics*.js`, `server/business.js`, `server/settings.js`, `server/roles.js`, `server/api.js`, `server/app.js` | Section by section |
| `web/changes-math.js`, `web/changes-page.js`, `web/changes-fold.js`, `web/asks.js`, `web/void-dialog.js` (new) | The words, the page, the History fold, the asks under fields, the void confirm |
| `web/sales-*.js`, `web/costs-*.js`, `web/harvest-*.js`, `web/inventory-*.js`, `web/runs-*.js`, `web/business-*.js`, `web/settings*.js`, `web/yield-card.js`, `web/usage*.js`, `web/route.js`, `web/app.js`, `web/styles.css` | Section 11 |
| `docs/DESIGN.md`, `docs/PRODUCT.md`, `README.md` | The Void Rule; a Data integrity row; the routes |

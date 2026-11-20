# Data integrity Implementation Plan

**Goal:** Every money record answers for itself: a change log (who, when, before, after, why), void instead of delete, a paid sale changed only after Mark unpaid with a reason; the server asks once before a duplicate, an oversell, a sale before any pick and an unlikely price or pick; a Not sold record closes the unsold balance, aged by keeping days, and gives Economics its shrink; electricity is measured, estimated or unseen per room-day, priced by a dated tariff, corrected by the bill both ways, rounded once per room-day; closed months say when they were re-priced.

**Architecture:** Spec `docs/specs/2026-11-12-data-integrity-design.md`. Database 29 (task 1) adds `changes` (append only), void columns on five tables, `not_sold`, `tariffs`, `month_closes`. One logger (`db.logChange`, inside each store's write transaction) and one ask helper (`server/asks.js`) serve every module; `req.who` reaches the stores through the route helpers. Usage days gain seen and metered spans (`server/usage.js`); one pure `energyCost` (`server/energy-cost.js`) prices every room-day by the tariff and is the only pricing Costs, Harvest and the Energy card use. The unsold balance is pure (`server/unsold-math.js`). The web gets pure words (`web/changes-math.js`), one History fold, one void confirm and one asks renderer shared by every dialog.

**Tech Stack:** Node 22.13+, `node:sqlite`, plain JS modules, no build, `node --test`.

---

## Ground rules

| Rule | Detail |
|---|---|
| Start | Only after Money truth (B1) merges into `main`: rebase `feat/data-integrity` onto it, run `npm test`, note the count here |
| Branch | `feat/data-integrity` in `.claude/worktrees/data-integrity`; every command there |
| Tests | One file: `node --disable-warning=ExperimentalWarning --test tests/<file>`; all: `npm test` |
| TDD | Each task: write the test, run it and see it fail for the reason expected, implement, run it green, run `npm test`, commit |
| Commits | One per task, "Data integrity: …", subject ≤ 72 characters, details in the body, no trailers |
| Never | Push, merge, deploy, `ssh oracle-farm`, port 8080, `sqlite3` on `data/v2.db` |
| Test databases | Under `/tmp/data-integrity/` (wiped on reboot); test servers on ports 19300–19349 |
| UI check env | `~/.claude/task-logs/next/integrity-env/`: a copy of `~/.claude/task-logs/audit/env/v2.db`, the farm app on port 8381 (task 33) |

## File map

| File | Change |
|---|---|
| `server/db.js` | Version 29 step; `logChange`, `changesOf`, `changesBetween`; void and restore methods; not-voided reads; `not_sold`, `tariffs`, `month_closes` methods; the room delete's entry |
| `server/changes.js`, `server/changes-api.js` | The log's reads, the CSV, `GET /api/changes`, `GET /api/changes.csv` |
| `server/asks.js` | `askOrThrow(asks, confirmed)`, `AskError` |
| `server/api.js` | `who` in the route helpers; wiring of the new routes |
| `server/sales*.js` | Log, paid lock, Mark unpaid reason, void, restore, asks, `unsold` in the view |
| `server/not-sold.js`, `server/unsold-math.js` | Not sold's store; the balance, aging, run ties |
| `server/costs*.js`, `server/costs-equipment.js` | Log, void, duplicates, estimated lines, notes, the bill's correction, closed months, Keep |
| `server/harvests.js`, `server/harvest-api.js`, `server/tasks.js` | Log, void, asks on Record, Edit and Done; Undo entries |
| `server/inventory*.js` | Log, void, Undo window, not-voided lots |
| `server/usage.js`, `server/usage-buckets.js` | Seen and metered spans, `kWhMeasured`, `kWhEstimated`, `unseenMs` |
| `server/energy-cost.js`, `server/tariffs.js` | `energyCost`, `priceOn`; the tariff store, Settings' price |
| `server/settings.js` | `keepDays` in `cropYield`; `electricityPrice` from the tariff |
| `server/economics*.js` | Shrink from Your runs; the electricity note |
| `server/business.js` | Still to sell, past its days, the oversold need |
| `server/roles.js` | Section 12's worker routes |
| `web/changes-math.js`, `web/changes-page.js`, `web/changes-fold.js`, `web/asks.js`, `web/void-dialog.js` | New shared parts and the Changes page |
| `web/sales-*.js`, `web/costs-*.js`, `web/harvest-*.js`, `web/inventory-*.js`, `web/runs-*.js`, `web/business-*.js`, `web/settings*.js`, `web/yield-card.js`, `web/usage*.js` | Section 11 of the spec |
| `web/route.js`, `web/app.js`, `web/styles.css` | `#/business/changes`; the `.dx-` block |
| `docs/DESIGN.md`, `docs/PRODUCT.md`, `README.md`, `~/.claude/task-logs/business/CONTRACT.md` | The Void Rule, a row, the routes, the contract row |

## Tasks

### Task 1: database 29
Files: `server/db.js`, `tests/db-data-integrity.test.js`.
- [ ] Test: open a version 28 file (made by the suite's helper with a sale, a cost, an equipment item, a harvest and a stock move) → `user_version` 29; `changes` is STRICT and an `UPDATE` or `DELETE` on it throws "The change log is kept as written"; `voided_at`, `voided_by`, `void_reason` on `sales`, `costs`, `equipment`, `harvests`, `stock_moves`, all null on the old rows; `not_sold` with its CHECKs (a reason outside the six refused); `tariffs` has one row `2020-01-01`, rate = the stored `electricityPrice` (0.55 when none), afa 0; `month_closes` empty; deleting a room clears `not_sold.room_id`. A fresh database comes out the same.
- [ ] Expected first run: fails on `user_version` 28. Implement the step under `// ---- Data integrity ----`, `VERSION = 29`; fix the suites that assert 28. Green, `npm test`, commit.

### Task 2: the logger
Files: `server/db.js`, `tests/changes.test.js`.
- [ ] Test: `db.logChange({ at, by, role, kind, rowId, action, before, after, reason })` stores JSON text and reads back parsed through `db.changesOf(kind, rowId)` (oldest first) and `db.changesBetween(from, to, { kind, by })` (newest first, at most 500); a write that throws after `logChange` inside `inTransaction` leaves no entry; a bad kind or action throws (CHECK).
- [ ] Expected first run: `logChange` is not a function. Implement. Green, commit.

### Task 3: who reaches the stores
Files: `server/api.js`, `server/app.js`, `tests/api-who.test.js`.
- [ ] Test: a route module's helpers carry `who` `{ name, role }` from the session; with no session (tests' direct calls) `who` is `{ name: 'app', role: 'app' }`.
- [ ] Implement: `helpers.who` beside `send`, `readJson`. Green, commit.

### Task 4: the ask helper
Files: `server/asks.js`, `server/api.js` (the 409 shape), `tests/asks.test.js`.
- [ ] Test: `askOrThrow([], [])` returns; `askOrThrow([{ kind: 'duplicate', field: 'kg', text }], [])` throws `AskError` (status 409) whose reply is `{ error: 'Check before saving', asks: [...] }`; with `confirmed: ['duplicate']` it returns; a non-array `confirmed` reads as `[]`. Through the API's error handler the reply keeps `asks`.
- [ ] Implement. Green, commit.

### Task 5: Sales logs and the paid lock
Files: `server/sales.js`, `server/sales-math.js`, `server/sales-api.js`, `server/db.js` (Sales block), `tests/sales.test.js`, `tests/api-sales.test.js`.
- [ ] Test (G1, G2): record, Mark paid, edit and Mark unpaid each write one entry with `kind 'sale'`, `rowId` the delivery id, `before`/`after` as the spec's 3.1; `PUT` on a paid delivery → 409 "This sale is paid. Mark it unpaid first, with a reason." with `field 'paidAt'`; `{ paidAt: null }` with no reason → 400 `reason`; with a reason → unpaid and the `unpaid` entry carries it; then the edit to 2.50 kg × RM 0.20 → RM 0.50 and an `edit` entry.
- [ ] Expected first run: the `PUT` on a paid delivery succeeds (200). Implement. Green, commit.

### Task 6: Sales void and restore
Files: as task 5, `tests/sales-void.test.js`.
- [ ] Test (G3): `DELETE` → 409 "Void it instead: a money record is kept."; void a paid one → 409; void needs a reason of 3–200 characters (400 `reason`); a voided delivery is in `view().deliveries` with `voided { at, by, reason }` and out of `totals`, `owed`, `byCrop`, `byBuyer`, `summary`, `range` (the 4-6 sheet) and the CSV; its `PUT` and paid → 409 "Restore it first"; restore brings it back into every figure; each writes its entry; deliveries carry `edits`.
- [ ] Implement (every Sales read in `db.js` takes `voided_at IS NULL` except the list's). Green, commit.

### Task 7: Sales asks
Files: `server/sales.js`, `server/sales-math.js` (`saleAsks`), `tests/sales-asks.test.js`.
- [ ] Test: G4 (duplicate within 10 min; a back-dated one on the same day recorded within 10 min; 4.10 kg no ask; an edit not asking about itself), G7 (oversell from the crop's first pick, 222.60 kg no ask, 222.61 kg asks, Not sold counted), G8 (before-picked; that sale left out of the balance), G9 (price 3 ×), the 500 kg ask; `confirmed` passes them; a voided delivery is never a duplicate.
- [ ] Implement with `askOrThrow`. Green, commit.

### Task 8: the Costs store logs and voids
Files: `server/costs.js`, `server/costs-api.js`, `server/db.js` (Costs block), `tests/costs-void.test.js`.
- [ ] Test: add, edit, Change from a month (`change` on the old item, `add` on the new), Stop and void/restore each log; `DELETE /api/costs/:id` → 409; a voided one-off leaves the month's lines and is in `entries` with `voided`; a voided monthly item's charges leave every month; a voided bill's top-up goes.
- [ ] Implement. Green, commit.

### Task 9: Costs duplicates
Files: `server/costs.js`, `tests/costs-asks.test.js`.
- [ ] Test (G5): a second Packaging RM 45.00 on 10 Nov for the farm asks `duplicate` with the spec's words and `field 'amount'`; other date, category, place, a monthly item or a voided one: no ask.
- [ ] Implement. Green, commit.

### Task 10: equipment logs and voids
Files: `server/costs-equipment.js`, `server/costs-api.js`, `tests/api-equipment.test.js`.
- [ ] Test: add, edit, void, restore log `kind 'equipment'`; `DELETE` → 409; a voided item's write-off leaves every month and Economics' register figures; it stays in `GET /api/equipment` with `voided`.
- [ ] Implement. Green, commit.

### Task 11: harvests log, void and ask
Files: `server/harvests.js`, `server/harvest-api.js`, `server/tasks.js`, `server/db.js`, `tests/harvests-integrity.test.js`.
- [ ] Test: G6 (duplicate; the quick picks' sum against 0.3 kg a block, the one-pick words as before); Record, Edit and a check's Done ask and log (Done's `by` the worker); a Done's Undo writes `undo` per harvest; void (owner) takes it out of the run figures, BE, the Harvest page, the 4-6 sheet and the CSV, and a check's task amount becomes the total left; `DELETE /api/harvests/:id` → 409; `roomView` gives `voided`, `edits`.
- [ ] Implement. Green, commit.

### Task 12: Inventory logs, void and the Undo window
Files: `server/inventory.js`, `server/inventory-math.js`, `server/inventory-api.js`, `tests/inventory-void.test.js`.
- [ ] Test: purchase, use, count, throw-out and edit log `kind 'move'`; G20 (Undo by the same person within 60 s deletes and logs `undo`; at 70 s or by another → 409 "Void it instead: a money record is kept."); void a purchase voids its throw-outs and its lot leaves `lotsOf`, `costedMoves`, the stock, the value and the 4-5 sheet; a `'batch'` move → 409 "Change it in Batches"; restore.
- [ ] Implement. Green, commit.

### Task 13: every other reader leaves voided rows out
Files: `server/costs-sources.js`, `server/runs.js`, `server/economics-runs.js`, `server/business.js`, `server/batches.js` (its run's lines), `tests/void-readers.test.js`.
- [ ] Test: one fixture with one voided sale, cost, equipment item, harvest and stock move of each kind: Costs' month and run figures, Runs' list and `untied`, Economics' Your sales, Your runs and the register, the Summary and Batches' run lines equal a fixture without those rows.
- [ ] Implement. Green, commit.

### Task 14: the changes routes
Files: `server/changes.js`, `server/changes-api.js`, `server/api.js`, `tests/api-changes.test.js`.
- [ ] Test: `GET /api/changes?kind=sale&id=` gives the entries oldest first and `before: true` for a record older than the log; `?days=30&kind=&by=` newest first with `kinds` and `people`; 400 for a bad kind or days; the CSV's header and the formula guard; the room delete's entry.
- [ ] Implement. Green, commit.

### Task 15: the coverage test
Files: `tests/changes-coverage.test.js`.
- [ ] Test: a table of every write route of the spec's 3.2, each driven through the API as the owner (and the worker routes as a worker), asserting exactly one new entry (a purchase voided with throw-outs: one per move) with the signed-in `by` and the right `kind`, `action`, `rowId`. It fails if a write route is added without its entry.
- [ ] Fix any gap it finds. Green, commit.

### Task 16: Not sold store and routes
Files: `server/not-sold.js`, `server/db.js`, `server/api.js`, `tests/not-sold.test.js`, `tests/api-not-sold.test.js`.
- [ ] Test: record with the 400s (`at`, `crop`, `kg`, `reason`, `roomId`, `buyerId` only for rejected, `note`), the run tie on save, a worker recorded as themselves; the asks `duplicate`, `beyond`, `oversell`; edit, void, restore and the Undo window; `GET /api/not-sold?days=`; each write logs `kind 'not-sold'` and publishes `sales`.
- [ ] Implement. Green, commit.

### Task 17: the unsold balance and keeping days
Files: `server/unsold-math.js`, `server/settings.js` (`keepDays`), `server/sales.js` (`unsold`), `server/costs-math.js` (month and run left), `tests/unsold-math.test.js`.
- [ ] Test: G10 (166.0 kg past since 6 Nov, no value; Not sold 166 kg closes it); a sale takes the picks still fresh on its day first; Not sold takes the oldest; still to sell valued at the expected price; `cropYield` accepts `keepDays` 1–60 (400 otherwise) and the defaults of the spec's table; Costs' month note subtracts Not sold; a run's `left` and kg not sold through the sale steps.
- [ ] Implement. Green, commit.

### Task 18: shrink for Economics
Files: `server/economics.js`, `server/economics-runs.js`, `tests/economics-shrink.test.js`.
- [ ] Test (G11): a counted run with 190.0 kg picked, 24.0 sold, 166.0 not sold → shrink 87.4 % from Your runs with the note; a run with 21.0 kg left → no Your runs figure and the "record it" note; You set still wins.
- [ ] Implement. Green, commit.

### Task 19: seen, metered and unseen time
Files: `server/usage.js`, `server/usage-buckets.js`, `tests/usage-seen.test.js`.
- [ ] Test (G12): `seenSpans(readingTimes, from, to)` (each good reading covers 15 min); a room with no device is seen all day; the aircon "on" from 3 Nov counts only to 16:50 + 15 min (SEEN_MS, spec 17.1); 4–8 Nov 0 kWh, `unseenMs` 86,400,000; a metered day with a meter gap estimates the seen part; `kWh = kWhMeasured + kWhEstimated`; `metered` as the spec; the cache returns the same on a second read and drops on a reading written into the day; the history buckets agree with the days.
- [ ] Implement. Green, commit.

### Task 20: the tariff
Files: `server/tariffs.js`, `server/settings.js`, `server/api.js`, `tests/tariffs.test.js`.
- [ ] Test: `GET /api/tariffs` with `to` worked out; add (400 `from`, `rate`, `afa`; 409 a taken day), edit and void (not the first rate); each logs `kind 'tariff'` and publishes `costs` and `harvest`; `PUT /api/settings { electricityPrice: 0.60 }` adds a rate from today and leaves yesterday's price; `readSettings(db).electricityPrice` is today's `rate + afa` (G14: 0.5425).
- [ ] Implement. Green, commit.

### Task 21: one pricing function
Files: `server/energy-cost.js`, `tests/energy-cost.test.js`.
- [ ] Test (G14, G17): `priceOn(tariff, '2026-09-30')` 0.5150, `'2026-10-01'` 0.5425; `energyCost` of three days of 1.010 kWh at 0.55 → electricity 1.68 (not 1.67); measured and estimated priced apart; water per day, null without a price; `round2` on 0.5555 → 0.56.
- [ ] Implement. Green, commit.

### Task 22: Costs, Harvest and the Energy card price through it
Files: `server/costs-math.js`, `server/costs.js`, `server/harvests.js`, `server/usage.js` (`totals`), `server/economics-runs.js`, `tests/energy-cost-users.test.js`.
- [ ] Test (G17, G18): one fixture: a run's electricity on Costs, Runs, the Harvest tab, the Harvest page and the Energy card is the same RM; a month equals the sum of its room lines; a day before and after a rate change priced at its own rate on every page.
- [ ] Implement: `measuredGroups` and `costOf` call `energyCost`; `data.prices.electricity` gives way to `data.tariff`. Fix the suites whose figures move by a sen and say so in the commit body. Green, commit.

### Task 23: measured and estimated on Costs, the notes and the bill's correction
Files: `server/costs-math.js`, `server/costs.js`, `tests/costs-energy.test.js`.
- [ ] Test: G13 (the two lines and the 94 % note; under 20 %: no note); the `unseen` note per room (G12's words); `kWh` and `parts.energyEstimated` in the reply; G15 (−RM 46.15 and −RM 13.85; the RM 400 case through the measured lines; RM 600 as before; the `bill-below` note gone); the CSV's `estimated` source.
- [ ] Implement. Green, commit.

### Task 24: closed months
Files: `server/costs.js`, `server/costs-math.js`, `server/db.js`, `server/main.js` (the 06:00 tick), `tests/costs-close.test.js`.
- [ ] Test (G16): no close before the 15th; the first not-pending read on or after it writes `month_closes`; a later rate or a back-dated cost makes `repriced { closedAt, was, changes }`; the `closed-month` ask on writes dated in a closed month and on a tariff reaching one; `POST /api/costs/months/:month/keep` rewrites the figures with a `keep` entry and the mark goes; a run in a re-priced month carries `repriced`.
- [ ] Implement. Green, commit.

### Task 25: the oversold note and the Summary
Files: `server/costs-math.js`, `server/business.js`, `tests/business-integrity.test.js`.
- [ ] Test: G7's note on November; the Summary's Needs-you line; the money card's `unsold { fresh, past, value, pastSince }` in place of the month's unsold; the Change history link's data (none needed beyond the route).
- [ ] Implement. Green, commit.

### Task 26: worker routes
Files: `server/roles.js`, `tests/roles.test.js`, `tests/api-roles-integrity.test.js`.
- [ ] Test (G19): a worker may `POST /api/not-sold`, `DELETE /api/not-sold/:id` (own, in its minute), `DELETE /api/inventory/moves/:id` (own, in its minute); 403 on every void and restore route, `GET /api/changes`, the tariff routes, `POST /api/costs/months/:month/keep`; a worker's harvest asks carry no RM; their entries' `by` is the signed-in name even when the body names another.
- [ ] Implement. Green, commit.

### Task 27: web shared parts
Files: `web/changes-math.js`, `web/changes-fold.js`, `web/asks.js`, `web/void-dialog.js`, `web/styles.css`, `tests/web-changes-math.test.js`, `tests/web-asks.test.js`.
- [ ] Test: the words of the spec's 3.3 for every action and kind (G2's four lines); the "before the change log" line; `asksFor(reply)` maps asks to fields and the primary's "Record anyway" / "Save anyway"; a changed value clears `confirmed`; the void confirm's title, lead and reason check (3–200).
- [ ] Implement; the Void Rule's styles (`.dx-voided`: `ink-2`, figures struck, the chip). Green, commit.

### Task 28: Sales page and dialogs
Files: `web/sales-page.js`, `web/sales-dialogs.js`, `web/sales-math.js`, `tests/web-sales-math.test.js`, `tests/web-sales-page.test.js`.
- [ ] Test: a voided delivery's row (struck, its who/why line); "edited"; a paid Edit read only with Mark unpaid…; the Mark unpaid dialog's reason; Void this sale and its confirm; the History fold's count; asks under the lines (the browser's own 3 × and 500 kg checks gone); the Unsold card's rows (G10) and Record not sold with the crop and kg filled in; the Not sold dialog and its records list.
- [ ] Implement. Green, commit.

### Task 29: Costs, Runs and a run's page
Files: `web/costs-page.js`, `web/costs-dialogs.js`, `web/costs-equipment.js`, `web/costs-math.js`, `web/runs-math.js`, `web/runs-page.js`, their tests.
- [ ] Test: the By category rows "Electricity · measured", "Electricity · estimated", "Electricity above the bill"; the notes in warning text; voided entries and equipment struck; Void this cost / item; the cost duplicate ask; the re-priced line, What changed and Keep the new figures; the 12-month bar's "re-priced" name; the run's money make-up line with both electricity parts; the Picked tile's sold, not sold and left; "Re-priced" under Profit.
- [ ] Implement. Green, commit.

### Task 30: Harvest, Inventory, Settings, Summary, Energy card
Files: `web/harvest-card.js`, `web/harvest-page.js`, `web/harvest-math.js`, `web/inventory-item.js`, `web/inventory-dialogs.js`, `web/settings-page.js`, `web/yield-card.js`, `web/business-page.js`, `web/business-math.js`, `web/usage*.js`, their tests.
- [ ] Test: the run card's Not sold button (owner and worker) and records; voided harvests struck; Void this harvest (owner only); the harvest asks under the kg box (the browser's pick check gone, Done's too); an item's voided moves; the Electricity tariff card's rows and Add a rate, with the closed-month ask; Yield's Keeps fresh column; the Summary's Still to sell tile and past-days line, the oversold need, the Change history link; the Energy card's "not seen 9 h 40 min" and "part estimated".
- [ ] Implement. Green, commit.

### Task 31: the Changes page
Files: `web/changes-page.js`, `web/route.js`, `web/app.js`, `tests/web-changes-page.test.js`.
- [ ] Test: `#/business/changes` with `?days=&kind=&by=`; the table's rows (when, who, what as a link, change, why); the phone blocks; the empty words "No changes in the last 30 days."; Export CSV's address; a worker's page says "Ask the owner" (403).
- [ ] Implement. Green, commit.

### Task 32: docs and the contract
Files: `docs/DESIGN.md` (the Void Rule beside Rows; the History fold under Folds; asks under Messages), `docs/PRODUCT.md` (a Data integrity row), `README.md` (the routes, the tariff in Settings), `~/.claude/task-logs/business/CONTRACT.md` (the spec's section 13).
- [ ] Write them; `npm test` (the README's wording tests). Commit.

### Task 33: UI check (Impeccable critique and audit)
- [ ] Set up `~/.claude/task-logs/next/integrity-env/`: copy `~/.claude/task-logs/audit/env/v2.db` (and its `state.json` for the sims), start the farm app from this branch on port 8381 with that database and its own sims; sign in as the owner and as the worker.
- [ ] Put in the golden cases on the copy (made-up figures only, never the copy's own): G1–G3 (a paid sale unpaid, edited, one voided), G4 and G5 (asks shown), G6 and G7 (asks), G10 (the Unsold card, then Not sold), G13–G16 (two lines, the notes, a rate, a bill, a re-priced October).
- [ ] Run the `impeccable` skill's critique and audit on: Sales (the list with a voided row, the Unsold card, Edit of a paid sale, Mark unpaid, the void confirm, the asks, History open), Costs (the electricity rows, the notes, re-priced, voided entries), Runs and a run's page, the Harvest tab as owner and worker (Not sold, a voided harvest), an Inventory item, Settings (tariff, Yield), the Summary, the Changes page; each at 1440 and 390 px, dark and light.
- [ ] Fix every finding of priority P0–P2 with a test where it is a rule; list P3s in the handoff. Commit the fixes ("Data integrity: UI check fixes").

### Task 34: final review
- [ ] Run the full suite; note the count.
- [ ] Spec compliance review (a fresh reviewer, `superpowers:code-reviewer`): every row of the spec's sections 2–14 against the code, every golden case against a test.
- [ ] Code quality review (a second fresh reviewer): transactions around every logged write, the not-voided filter in every reader (grep each table's `FROM` against `voided_at`), the worker filter on new replies, no RM in a worker's ask.
- [ ] Impeccable finish review of the touched pages.
- [ ] Fix, re-run `npm test`, commit; write `~/.claude/task-logs/data-integrity/HANDOFF.md` (branch, last commit, test count, open items). Stop at "ready to merge": no merge, no push, no deploy.

# Money truth (iteration B1) Implementation Plan

**Goal:** Fix what goes into the business figures (spec `docs/specs/2026-11-12-money-truth-design.md`): made blocks charge their materials at their lots, stock is valued and costs count when used, sales reach runs, Economics prices from your sales, counts partial runs and measured loss, reads an equipment register, prices labour as people and knows the room type.

**Architecture:** Each rule changes in the module that owns it (contract section 7): Inventory gains the lots' money (`costedMoves`, values); Batches prices a made batch from its draws at those lots; Costs counts batches on their placing day, Inventory uses and shrink when they happen, purchases as a cash line, the equipment register's write-off and the sale steps; Runs gains one write (a partial run's block-in day); Economics reads them all. Database 28 (after the alarms' 27): `equipment`, `runs.blocks_in_at`, `rooms.room_type`.

**Tech Stack:** Node 22.13+, `node:http`, `node:sqlite`, plain HTML/CSS/JS modules, no build, no npm dependencies, `node --test`.

---

## Ground rules

| Rule | Detail |
|---|---|
| Worktree | `/home/foqcus/Documents/mushroom-farm/.claude/worktrees/money-truth`, branch `feat/money-truth` from `v2` `85a8e87`. Every command runs there |
| Tests | One file: `node --disable-warning=ExperimentalWarning --test tests/<file>`; all: `npm test` (3074 at the start) |
| TDD | Each task: the failing test first, run it red, the code, run it green, `npm test` green, commit |
| Commits | One per task, "Money truth: …" in the repo's style, no attribution trailers |
| Live apps | Never `ssh oracle-farm`, port 8080, push-code/push-data, GitHub, or a merge into `v2` |
| Look | Farm `FARM_PORT=8281`, `FARM_GATEWAY=127.0.0.1:3502`, a copy of the audit database in `~/.claude/task-logs/next/money-env/` with every room's gateway `127.0.0.1:3512`; Chrome over CDP on 9251 |

## File map

| File | Task | Responsibility |
|---|---|---|
| `server/db.js` | 1, 8, 10, 15 | Version 28 step; the equipment, runs and rooms methods |
| `server/inventory-math.js`, `server/inventory.js`, `web/inventory-*.js` | 2, 3 | `costedMoves`, lot and item value; the list and item replies; the page lines |
| `server/batches-math.js`, `server/batches.js`, `server/batches-db.js`, `web/batches-*.js` | 4 | `madeCost`, the live made price, `priceMissing` |
| `server/costs-sources.js`, `server/costs-math.js`, `server/costs.js` | 5, 6, 7, 8 | Placing day, uses, the bought line, the sale steps, the register's write-off |
| `server/costs-equipment.js`, `server/costs-api.js` | 8 | The register's checks and routes |
| `web/costs-page.js`, `web/costs-math.js`, `web/costs-dialogs.js`, `web/costs-equipment.js` | 9 | Tiles, Bought for stock, the Equipment card and dialog |
| `server/runs.js`, `server/runs-api.js`, `web/runs-page.js`, `web/runs-math.js` | 10 | `untied`, shared lines, the block-in day |
| `server/business.js`, `web/business-math.js`, `web/business-page.js` | 11 | Stock worth, bought this month, the unpriced need's batch |
| `server/economics*.js`, `web/economics-*.js` | 12, 13, 14, 16 | Your sales, partial runs, the loss, labour, the register, the room type |
| `server/rooms.js`, `web/room-fields.js`, `web/room-form.js` | 15 | Room type on Setup |
| `README.md`, `PRODUCT.md`, `DESIGN.md`, `CONTRACT.md` | 17 | The docs |
| `web/styles.css` | 3, 9, 10, 11, 14 | Their blocks' lines, tokens only |

## Tasks

### Task 1: Database 28

- [ ] Test `tests/db-money-truth.test.js`: a version 27 file (made by `openDb`, then the three changes dropped and `user_version` 27) opens as 28 with `equipment` STRICT, its trigger, `runs.blocks_in_at` null on the old runs, `rooms.room_type` `'container'`; a deleted room's equipment goes to the farm; a bad `room_type` fails the CHECK.
- [ ] `server/db.js`: `MONEY_TRUTH` SQL, the step `if (version < 28)`, `VERSION = 28`; the asserts of `user_version` in the other tests become 28.

### Task 2: Inventory's lots cost (pure)

- [ ] `tests/inventory-math.test.js`: `costedMoves` (oldest first; a throw-out's own lot; an out beyond the stock filled by the next lot; a count's lot at the last price; an unpriced lot), `lotUnitCost`, `itemValue`; the golden five materials (RM 504.70, 194.04, 4.14, 5.52, 632.50) and their RM 4,647.10 left; the bags unpriced.
- [ ] `server/inventory-math.js`: `lotUnitCost(move, before)`, `costedMoves(moves)`, `valueOf(lots)`; `itemView` gains `value`, `unpriced` (for the reply: `valueUnpriced` renamed `unpriced`, a money key).

### Task 3: Stock worth on Inventory

- [ ] `tests/inventory.test.js`: the list's `value { total, unpriced }`, each item's `value`; the item's lots with `unitCost` and `value`; a worker's reply without them (`tests/roles.test.js` or `api-login`).
- [ ] `tests/web-inventory-math.test.js`: `stockWorthLine` ("Stock worth RM 4,647.10"; "at what each lot cost · Plastic bags have no price"; "2 items have no price"), the card's "RM 1,175.30" / "no price", the lot's "RM 1.40 a kg · RM 1,175.30".
- [ ] `server/inventory.js`, `web/inventory-math.js`, `web/inventory-page.js`, `web/inventory-item.js`, CSS.

### Task 4: A made batch's price from its draws

- [ ] `tests/batches-math.test.js`: `madeCost` (RM 1,340.90, missing Plastic bags; no lines: null; a line with no item: missing).
- [ ] `tests/batches.test.js`: a made batch's view `pricePerBlock` 2.7935 and `priceMissing`; a later bags purchase prices it with no batch write; the stored column follows on a write; over RM 1,000 still refused.
- [ ] `server/batches-db.js` (the moves of a set of items, ordered), `server/batches-math.js`, `server/batches.js`, the Making card's words in `web/batches-making.js`.

### Task 5: Costs reads every move and the placing day

- [ ] `tests/costs-sources.test.js`: batches with `placedAt`, `kind`, `parentId`, the made cost split over rows, the lost-while-waiting rows; `uses` (use, count, throw-out) costed; `purchases` kept (the bought line); without Inventory or Batches: empty.
- [ ] `server/costs-sources.js`: read the batches with their checks and materials, every stock move costed with `costedMoves`.

### Task 6: Costs counts what was used

- [ ] `tests/costs-math.test.js`: a batch on its placing day on its run; a made batch's RM 1,340.90 and its note; lost while waiting; a use in a room on its run, without a room shared; a purchase not a cost; `bought`; September's −RM 5,988.00 gone.
- [ ] `tests/costs.test.js`: `monthView.bought`; Container 1's run RM 1,340.90 + energy, incomplete.
- [ ] `server/costs-math.js` (`linesOf`, `boughtOf`), `server/costs.js`.

### Task 7: Sales reach runs

- [ ] `tests/costs-math.test.js`: `saleShares` steps 1–5 (Room 1's RM 384; two runs shared 3:1 by kg; nothing picked: untied); `figuresOf` run income; `untiedOf`.
- [ ] `tests/costs.test.js`: `untied()`; a run's income RM 384.00.
- [ ] `server/costs-math.js`, `server/costs.js` (`untied`, `runViews` shared lines).

### Task 8: The equipment register

- [ ] `tests/costs-equipment.test.js` (checks, write-off months), `tests/db-money-truth.test.js` (methods), `tests/api-equipment.test.js` (routes, 400 with field, `costs` event, a worker's 403).
- [ ] `tests/costs-math.test.js`: the write-off lines (room on its run, farm shared, 60 × RM 69.50, the last month's rest), `writeOff`, `profitBeforeWriteOff`, run `parts.equipment`.
- [ ] `server/db.js` (the methods), `server/costs-equipment.js`, `server/costs.js`, `server/costs-math.js`, `server/costs-api.js`.

### Task 9: The Costs page

- [ ] `tests/web-costs-math.test.js`: the before-write-off line, `boughtRows`, the equipment rows and the dialog's "RM 69.50 a month for 60 months.", the new sources' words.
- [ ] `tests/web-costs-page.test.js`: the Bought for stock table, the Equipment card.
- [ ] `web/costs-math.js`, `web/costs-page.js`, `web/costs-equipment.js` (the dialog), CSS; the CSV's bought rows (`server/costs-math.js`).

### Task 10: Runs

- [ ] `tests/runs.test.js`: `list().untied`; a run's shared lines; `setBlocksIn` (400, 409, the event).
- [ ] `tests/api-runs.test.js`: `PUT /api/runs/:id/blocks-in`.
- [ ] `tests/web-runs-math.test.js`: "RM 384.00 of sales not tied to a run", the partial line, the dialog's words, "Shared: …".
- [ ] `server/runs.js`, `server/runs-api.js`, `server/db.js` (Runs block: `setRunBlocksIn`), `web/runs-page.js`, `web/runs-math.js`.

### Task 11: The Summary

- [ ] `tests/business.test.js`, `tests/web-business-math.test.js`: the stock worth and bought lines; the unpriced need links its batch from the note.
- [ ] `server/business.js`, `web/business-math.js`, `web/business-page.js`.

### Task 12: Economics, Your sales

- [ ] `tests/economics-runs.test.js`, `tests/economics.test.js`: the sources' order (RM 48.00 from Your sales), the realised line, the flag over 25 %, Your runs tied by the sale steps (no farm-wide fallback).
- [ ] `tests/web-economics-figures.test.js`: the chip, the notes, the flag's words.
- [ ] `server/economics-runs.js`, `server/economics.js`, `web/economics-figures.js`.

### Task 13: Economics, partial runs and the loss

- [ ] `tests/economics-runs.test.js`: a partial run with a block-in day counts (its start, its earlier days' kWh); the measured loss and the yield per good block; mixed coverage: the old rule.
- [ ] `server/economics-runs.js`, `server/harvests.js` (the room view's runs carry `blocksInAt`), `web/economics-figures.js` (notes).

### Task 14: Economics, labour as people

- [ ] `tests/economics-model.test.js`: `labourMonth`, the capacity hours.
- [ ] `tests/economics.test.js`: `workers` and `workerMonth` from Costs' monthly labour items; research RM 1,954.15; the share by blocks.
- [ ] `tests/web-economics-math.test.js`: the labour line, the over line.
- [ ] `web/economics-defaults.js`, `web/economics-model.js`, `server/economics.js`, `web/economics-math.js`, `web/economics-page.js`.

### Task 15: The room type

- [ ] `tests/rooms.test.js` (or the existing room validation test): `roomType` checked, kept when left out; `tests/db-*.test.js`: stored and read.
- [ ] `server/rooms.js`, `server/db.js`, `web/room-fields.js`, `web/room-form.js` (a select kind).

### Task 16: Economics, the room type and the register

- [ ] `tests/economics-defaults.test.js`: a built room's building and cooling, a shed's; `sizeOf` null for them.
- [ ] `tests/economics.test.js`: the register's figures and write-off; You set still wins.
- [ ] `tests/economics-model.test.js`: `writeOffMonth` replaces equipment ÷ life.
- [ ] `web/economics-defaults.js`, `web/economics-model.js`, `server/economics.js`, `web/economics-math.js`, `web/economics-figures.js`, `web/economics-page.js`.

### Task 17: The docs and the contract

- [ ] `README.md` (the changed paragraphs and database 28), `PRODUCT.md`, `DESIGN.md`, the contract's rows (section 11 of the spec).

### Task 18: The UI check

- [ ] The test copy (section Ground rules), the farm on 8281, Chrome on 9251.
- [ ] Impeccable critique and audit of Inventory, Costs, Runs (list and a run), Summary, Economics and a room's Setup at 1440 and 390 px, dark and light; fix what they find; commit; stop everything started.

# Economics stage 2 (iteration E2) Implementation Plan

**Goal:** The Economics page answers at a glance (Profit tiles, profit per way as bars, source labels in tiers and a page meter, a narrow table with Your container beside one other way on a phone), shows each run against the plan saved when it started, maps profit over price × yield under a sales limit, and ranks what moves profit most.

**Architecture:** Spec `docs/specs/2026-11-12-economics-stage-2-design.md`. The money stays in the browser: three new pure modules beside the stage-1 model, `web/economics-plan.js` (a run against its plan), `web/economics-map.js` (price × yield) and `web/economics-swing.js` (the tornado), each feeding the model the view's figures and money truth's `context`. The server adds one table, `economics_plans` (database 30), filled by `server/economics-plans.js` when it hears a run start (the `room` crop event), per-run actuals in `server/economics-runs.js` (`eachRun`) and one route, `GET /api/economics/plans`. The page's DOM for the new sections lives in `web/economics-charts.js`; their words in the pure modules, `web/economics-math.js` and `web/economics-figures.js`.

**Tech Stack:** Node 22.13+, `node:http`, `node:sqlite`, plain HTML/CSS/JS modules, no build, no npm dependencies, `node --test`.

---

## Ground rules

| Rule | Detail |
|---|---|
| Worktree | `/home/foqcus/Documents/mushroom-farm/.claude/worktrees/economics-2`, branch `feat/economics-2`. Every command runs there |
| Start | Not before money truth merges into `main`. Then `git rebase main` (the spec and this plan are the only commits before it), `npm test` green, and note the count in Task 1's commit |
| Version | 30 needs data integrity's 29 first. If integrity has not merged at the rebase, stop and ask the lead before Task 1 (the version is renumbered by merge order) |
| TDD | Each task: the failing test first, run it red, the code, run it green, `npm test` green, commit |
| Tests | One file: `node --disable-warning=ExperimentalWarning --test tests/<file>`; all: `npm test` |
| Commits | One per task, subject "Economics 2: …" (at most 72 characters), the detail in the body, no attribution trailers |
| Owned code | Economics' files (`server/economics*.js`, `web/economics-*.js`), the Economics block of `server/db.js`, the `.ec-` block of `web/styles.css`, their tests, and the docs of Task 19. No other module's figure changes (contract section 7) |
| Live apps | Never push, merge, deploy, `ssh`, or touch port 8080 or `data/`. Tests use in-memory databases and port 0; a look uses port 19300, `FARM_GATEWAY=127.0.0.1:19301` and a throwaway database under `/tmp/economics-2/` |
| Made-up figures only | The repository is public: tests, comments, docs and screenshots use stage 1's 11.1 inputs, research defaults or made-up examples, never a farm's real sales, harvests, costs, stock or runs |
| Units and money | Metric; RM through Costs' formatters, kg through Harvest's (the One Format Rule); every new line through `keepTogether` |

## File map

| File | Task | Responsibility |
|---|---|---|
| `server/db.js` | 1 | Version 30: `economics_plans`, indexes, trigger, rows before; `economicsPlan`, `economicsPlans`, `saveEconomicsPlan` |
| `server/economics-runs.js` | 2, 12 | `countedRuns` (shared with `yourRuns`), `eachRun`; `yourSales` gains `first` |
| `server/economics-plans.js` | 3 | `createPlans`: the plan check (event, start, read) and `plansView` |
| `server/economics.js`, `server/economics-api.js` | 3, 12 | Make and close the plans; `GET /api/economics/plans`; `limit`; `market.kgWeek` |
| `web/economics-model.js` | 4 | `x.life`, `ctx.life`; the register's scaled write-off seam |
| `web/economics-plan.js` | 5 | A run against its plan, the gaps, the run in progress |
| `web/economics-charts.js` | 6, 11, 14, 16 | DOM painters of the new sections |
| `web/economics-math.js` | 7, 8, 10 | `tilesOf`, `stickyText`, `barsOf`, `SHORT_LEFT`, the renamed rows |
| `web/economics-figures.js` | 9 | `tierOf`, the labels, `meterOf`, the research note |
| `web/economics-defaults.js` | 9, 10, 12 | Research notes without confidence words; "Loss after harvest"; `market.kgWeek` |
| `web/economics-map.js` | 13 | Price × yield |
| `web/economics-swing.js` | 15 | What moves profit most |
| `web/economics-page.js`, `web/styles.css` | 6, 11, 14, 16 | The sections, the sticky line, Compare with, the reads; the `.ec-` styles |
| `docs/DESIGN.md`, `README.md`, `docs/PRODUCT.md`, `CONTRACT.md`, stage 1's spec | 19 | The docs |

## Part 1: your runs against the plan (built first)

### Task 1: the plans table (spec 7.2)

**Files:** Modify `server/db.js` (Economics block). Test: create `tests/db-economics-plans.test.js`; modify the tests that assert the version (29 → 30).

- [ ] **Test first.** A version-29 file with two rooms and three runs (one of lion's mane and grey oyster, one of black oyster, one of pink) upgrades to 30: `economics_plans` exists and is STRICT, its unique index `economics_plan` and `economics_plans_by_room`; the rows before are four (lion's mane, grey oyster, pink; none for black oyster), each with `figures` and `context` null and `at` the upgrade's clock; `saveEconomicsPlan` writes once and a second save of the same run and crop returns false and keeps the first figures; `economicsPlans(roomId, crop)` newest run first, parsed; deleting a run (and `deleteRoom`) takes its plans; a fresh database at 30 has the table and no rows.
- [ ] Run it: fails (no table, version 29).
- [ ] **Code.** The SQL of spec 7.2 in the Economics block; `if (version < 30) { db.exec(PLANS); insertBefore.run({ now: Date.now() }); }`; `VERSION = 30`; the three methods.
- [ ] Run it green; `npm test` green. Commit "Economics 2: database 30, the plans table and its rows before".

### Task 2: each run's actuals (spec 7.3)

**Files:** Modify `server/economics-runs.js`. Test: modify `tests/economics-runs.test.js`.

- [ ] **Test first.** On a real farm (the in-memory database with Harvest, Batches, Sales and the usage days as the file's other tests): `countedRuns` gives what `yourRuns` counted before (an existing test now calls it); `eachRun` for a room with two finished lion's mane runs, one open and one partial without a block-in day: `past` newest first with blocks, lost and `measured` (both runs with batches), kg, `sold` by the sale steps (a sale with no room tied by "the one run growing the crop"), price, block price (a batch with a material unpriced left out and counted in `batchesLeftOut`), kWh per block of that run alone, `kwhPending` while a day is pending, days; a mixed run's `mixed`; `current` with its day; `leftOut.partial` 1; a part throwing names it in `errors` and leaves its figure null.
- [ ] Run it: fails (`eachRun` missing).
- [ ] **Code.** Lift the counted filter into `countedRuns`; `eachRun` reusing `lossOf`, `saleParts`, the batch price and the energy rule one run at a time.
- [ ] Run it green; `npm test` green. Commit "Economics 2: each counted run's own actuals".

### Task 3: saving the plan, and its route (spec 7.1, 7.4, 8)

**Files:** Create `server/economics-plans.js`. Modify `server/economics.js`, `server/economics-api.js`. Test: create `tests/economics-plans.test.js`; modify `tests/api-economics.test.js`.

- [ ] **Test first.** With a real `events` and `createEconomics`: a Crop tab save giving an empty room lion's mane (the `room` crop event) saves one plan with every shared and `yours.*` figure's value and source and the view's `context`, at `now()`, and publishes `economics` `{ roomId, crop }`; a second event saves nothing; new blocks on a done room (a new run) save its plan; an open run gaining grey oyster saves grey oyster's; a black oyster run saves none; a run whose event was missed is planned when the service starts and on a plans read; changing a figure later leaves the plan as saved. The route: `GET /api/economics/plans?room=&crop=` gives `current`, `past`, `leftOut`, `plans` (a run before: `{ at, before: true }`), `errors`; 400 for a bad crop, 404 for a room not there, 403 for a worker; `close()` stops listening.
- [ ] Run it: fails.
- [ ] **Code.** `createPlans({ db, figuresOf, events, now, log })` → `{ check(roomId), plansView(room, crop), close }`; `createEconomics` makes it (passing its own `figuresOf`) and closes it; the route in `createEconomicsRoutes`.
- [ ] Run it green; `npm test` green. Commit "Economics 2: save a run's plan when it starts; the plans route".

### Task 4: the model's block life (spec 7.7, 5.3)

**Files:** Modify `web/economics-model.js`. Test: modify `tests/economics-model.test.js`.

- [ ] **Test first.** `blockLife({ ..., life: 44 })` is 44; `grow(inputsOf(VALUES, 'yours', { life: 44 }))` has 1,202.18 blocks a month and its kWh a month worked out over 44 days; without `life` every stage-1 golden is unchanged; `inputsOf` with `ctx.register` and an equipment total off the register's by a swung figure with `ctx.register.scale: true` (what Task 15 passes) scales the register's month by the new total ÷ the register's, and without `scale` keeps money truth's rule (the write-off from the register only at its exact total).
- [ ] Run it: fails.
- [ ] **Code.** As spec 7.7.
- [ ] Run it green; `npm test` green. Commit "Economics 2: the model takes a run's own block life".

### Task 5: a run against its plan, in the browser (spec 7.5, 7.6, 7.9)

**Files:** Create `web/economics-plan.js`. Test: create `tests/economics-plan.test.js`.

- [ ] **Test first.** Spec 7.9: the plan (11.1 values) and the run (1,740 blocks, 87 lost, 380.6 kg, RM 16,200.00 for 300.0 kg, 0.45 kWh, RM 6.50, 28 days): plan RM 3,003.16 and 391.52 kg, run RM 2,832.85 and 230.25 g, diff −170.31; every row's words (7.5's table); `gapsOf` gives the seven one-at-a-time gaps in order and `gapsLine` names Selling price then Yield per good block; not measured: Yield per block put in 218.74 against 225.01 g, −RM 334.45, named Selling price then Block price; no sales: the plan's price and "No sales reached it"; a plan before: today's values and the before line; a key the plan lacks: today's value and its line; `progressOf` and the three progress lines (day 20 of 26, past the plan, nothing picked yet); every line through `keepTogether`.
- [ ] Run it: fails.
- [ ] **Code.** The exports of spec 7.5 and 7.6, the money through the model, the words through Costs' and Harvest's formatters.
- [ ] Run it green; `npm test` green. Commit "Economics 2: a run against its plan, worked out in the browser".

### Task 6: the runs section on the page (spec 7.8, 9)

**Files:** Create `web/economics-charts.js` (`paintPlans`). Modify `web/economics-page.js`, `web/styles.css` (`.ec-` block). Test: modify `tests/web-economics-page.test.js`.

- [ ] **Test first (source checks).** The page reads `/api/economics/plans?room=&crop=` beside the view, on the stage-1 triggers and not after a save; its own stale-answer guard (the reader's sequence); the card "Your runs against the plan" before Figures; the progress line and bar, the folds (the newest open, "N older runs"), the tables' captions, the left-out line, the empty line; the failure line with Retry and the older-app line (spec 9); the phone's three columns; tokens only.
- [ ] Run it: fails.
- [ ] **Code.** `paintPlans(node, { plans, values, ctx, room, crop, type })` building from `economics-plan.js`'s words; the page's second reader.
- [ ] Run it green; `npm test` green. Commit "Economics 2: your runs against the plan on the page".

## Part 2: the answer at a glance

### Task 7: the tiles' and the sticky line's words (spec 4.1)

**Files:** Modify `web/economics-math.js`. Test: modify `tests/web-economics-math.test.js`.

- [ ] **Test first.** `tilesOf` at the 11.1 values, price 50 and 35: every label, figure, tone and caption of 4.1's golden table; nothing sold ("—", "Nothing sells at these figures."); just at break-even; best other way the same as yours and less than yours; Your room and Your shed by the type; `stickyText` for a profit, a loss and nothing sold.
- [ ] Run it: fails.
- [ ] **Code.** `tilesOf(results, { room, crop, type, price, life })`, `stickyText(yours)`.
- [ ] Run it green; `npm test` green. Commit "Economics 2: the profit tiles' and the sticky line's words".

### Task 8: the bars' words and scale (spec 4.2)

**Files:** Modify `web/economics-math.js`. Test: modify `tests/web-economics-math.test.js`.

- [ ] **Test first.** `barsOf(results, left, crop, type)` for lion's mane at 11.1: five rows in the fixed order, Lowland shed not compared with "the warm strain is its lowland shed", zero at 43.26 %, each bar's start and length as a share of the track, its words ("Highland grower, RM 3,152.92 a month profit"); grey oyster's four rows and two not compared; all profits (zero at 0 %), all losses (100 %), a way at RM 0.00 ("breaks even", no bar); `SHORT_LEFT` for each crop.
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: profit per way as diverging bars, the words".

### Task 9: the source labels and the page meter (spec 4.3)

**Files:** Modify `web/economics-figures.js`, `web/economics-defaults.js`. Test: modify `tests/web-economics-figures.test.js`, `tests/economics-defaults.test.js`.

- [ ] **Test first.** `tierOf` for every source (owner typed; runs, sales, costs, register recorded; simulator, settings, the planted blocks app; research); the label's words and its reader words ("Research, medium confidence"); `meterOf` over lion's mane's 27 (5 yours, 18 research, 4 app) and none yours; a research note opens with its range, not "Low confidence:".
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: source labels in tiers and the page meter".

### Task 10: the table renamed and the phone's two columns (spec 4.4)

**Files:** Modify `web/economics-math.js`, `web/economics-defaults.js`. Test: modify `tests/web-economics-math.test.js`, `tests/economics-defaults.test.js`.

- [ ] **Test first.** The rows read "Blocks a month", "Payback (equipment)", "Payback (incl. first batch)"; `fillLine` opens "First batch:"; `shrink`'s label is "Loss after harvest"; `compareChoices(results)` gives the other ways with the best first and `phoneCaption` "A month: Your container and Highland grower".
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: the table's plainer row names and the phone's pair".

### Task 11: tiles, bars, labels, table and sticky line on the page (spec 3, 4, 10, 11)

**Files:** Modify `web/economics-charts.js` (`paintTiles`, `paintBars`), `web/economics-page.js`, `web/styles.css`. Test: modify `tests/web-economics-page.test.js`.

- [ ] **Test first (source checks).** The month card: the `sr-only` sentence first, the tiles (Costs' classes, `aria-hidden`), the meter, the warning line; the card "A month, each way" with the bars (an `ol`, each shown way a button) above the table; the table's 760 px cap, its row hover, a marked column; the phone table with **Compare with** only when more than two ways, its change said; the sticky line first in the sections' box, shown by an `IntersectionObserver` on the month card, `aria-hidden`, stage 1's `.ec-now` gone; the labels' tier classes, their 3 px row rules and 4 px corners, no hover; tile 4 a button that focuses its bar; 44 px on a phone; tokens only.
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: tiles, bars, labels and the narrow table on the page".

## Part 3: price × yield

### Task 12: the sales limit (spec 6.3)

**Files:** Modify `web/economics-defaults.js`, `server/economics-runs.js`, `server/economics.js`. Test: modify `tests/economics-runs.test.js`, `tests/economics.test.js`, `tests/api-economics.test.js`.

- [ ] **Test first.** `market.kgWeek` is a figure (kg a week, crop, 0 to 100,000) not in `figuresFor` for any crop; `PUT` sets it for every crop, `DELETE` clears it, a value over 100,000 is refused in the Settings rule's words; `yourSales` gives `first`; the view's `limit` is the owner's, else Your sales' (24.0 kg over 21 days → 8.0 kg a week; a first sale today → over 7 days), else `{ value: null, source: null }`; the swing and folds never see it.
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: what you can sell a week, from your sales or set".

### Task 13: the map, pure (spec 6.1, 6.2, 6.4, 6.6)

**Files:** Create `web/economics-map.js`. Test: create `tests/economics-map.test.js`.

- [ ] **Test first.** Spec 6.6: all 49 cells and seven break-evens with no limit; at 60 kg a week the three capped rows (each −4,554.46 … 11,079.83, break-even 37.48) and the rest unchanged; the 100 g row's line off the grid to the right; `now` the centre; a 0 price or yield gives `{ none }`; prices clamped at RM 1,000; `cellText` ("3,003", "−4,648", a phone's "+"); `cellLabel` capped and not; `lineWords`.
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: the price × yield map, worked out".

### Task 14: the map on the page (spec 6.5, 10, 11)

**Files:** Modify `web/economics-charts.js` (`paintMap`), `web/economics-page.js`, `web/styles.css`. Test: modify `tests/web-economics-page.test.js`.

- [ ] **Test first (source checks).** The card "Price × yield" after "What moves profit most"'s place (before the runs); the limit's row first (a Figures row, saved on leaving the box); the grid a table with a caption, heads, `table-layout: fixed`, the svg line `aria-hidden`; each cell a button named by `cellLabel`, one Tab stop (roving `tabindex`), arrows, Home and End; the picked line `aria-live="polite"`; the hatch for capped cells and the ● for now; the legend; 64 × 40 px cells from 600 px and 40 × 40 under; redrawn on typing.
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: the price × yield map on the page".

## Part 4: what moves profit most (built last)

### Task 15: the swing, pure (spec 5.1 to 5.4, 5.6)

**Files:** Create `web/economics-swing.js`. Test: create `tests/economics-swing.test.js`.

- [ ] **Test first.** Spec 5.6, both columns: every row's low, high and both changes to the sen, the order and the ties; `still` (Transport, Rent) in the ±20 % column; a whole figure rounded outwards; a loss of 80 % swings to 90 %; Flushes carries the yield; a typed figure swings ±20 %; with a register, an equipment figure moves the write-off by its share and "Equipment written off over" is still; with workers, Labour cost and Labour per block are still; `swingText` and `stillLine` words.
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: what moves profit most, worked out".

### Task 16: the swing on the page (spec 5.5)

**Files:** Modify `web/economics-charts.js` (`paintSwing`), `web/economics-page.js`, `web/styles.css`. Test: modify `tests/web-economics-page.test.js`.

- [ ] **Test first (source checks).** The card "What moves profit most" after "A month, each way"; the lead and "Now:" line; a list of rows (words, then a bar `aria-hidden` on one scale); the top 8 and Show all (its words, the focus kept, no button with 8 or fewer); the still line; redrawn on typing.
- [ ] Run it: fails.
- [ ] **Code.** As spec.
- [ ] Run it green; `npm test` green. Commit "Economics 2: what moves profit most on the page".

## Part 5: the docs, the look and the review

### Task 17: the units guard

**Files:** Modify `tests/web-economics-units.test.js`.

- [ ] **Test first.** Every new line (tiles' captions, bars, swing, map, the plan's lines, the meter) keeps a number with its unit and RM with its number (no plain space between them).
- [ ] Run it; fix any line through `keepTogether`. `npm test` green. Commit "Economics 2: every new line keeps its units together".

### Task 18: the UI check (spec 14)

**Files:** As the findings need.

- [ ] Start a look server (port 19300, a throwaway database under `/tmp/economics-2/` seeded with made-up figures only, `FARM_GATEWAY=127.0.0.1:19301`), with: a room with a planned finished run and one before stage 2, a run in progress, a sales limit that caps the map, a loss (lion's mane at RM 36.00), grey oyster (two ways) and a new farm.
- [ ] Run the Impeccable critique and audit at 1440 and 390 px, dark and light: hierarchy (the tiles read first), the bars' and map's legibility, the labels' tiers, the phone's pair and Compare with, the map at 360 px, focus order and the screen-reader words, contrast of the cell words on `critical-bg` and `good-soft` in both themes.
- [ ] Fix each finding with its test where it has one; screenshots kept under `/tmp/economics-2/shots/`. `npm test` green. Commit "Economics 2: the UI check's fixes" (a list in the body).

### Task 19: the docs (spec 12)

**Files:** Modify `docs/DESIGN.md`, `README.md`, `docs/PRODUCT.md`, `docs/specs/2026-11-06-economics-design.md` (section 13's 44 px row), `~/.claude/task-logs/business/CONTRACT.md` (section 7), and this iteration's spec (a "What shipped" section).

- [ ] DESIGN's Economics section as built (tiles, bars, labels, table, swing, map, runs, sticky line); Chips and counts gains "Source label"; the State-Only Colour Rule names the Economics exception; the 44 px Rule ends "The owner accepted it (2026-11-12)." and names the map's 40 px cells.
- [ ] README's Economics paragraph and the new route; PRODUCT's capability rows; the contract's row; "What shipped" with every change from the spec.
- [ ] `npm test` green. Commit "Economics 2: the docs".

### Task 20: the final review

- [ ] Ask for the two-stage review (the team's): first spec compliance (every row of the spec's sections 4 to 11 against the code and its test), then code quality. Fix what it finds, each with its test, `npm test` green, one commit per fix.
- [ ] Report to the lead: the commits, the test count, the UI check's screenshots, and anything left open. Never merge, push or deploy.

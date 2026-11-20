# Economics, stage 2: the answer at a glance, what moves it, and your runs against the plan (iteration E2)

Date: 2026-11-12 · Branch `feat/economics-2` from `main` at `6816d19` · Database version 30 (27 alarms, 28 money truth, 29 data
integrity) · Builds after money truth (`feat/money-truth`, spec `docs/specs/2026-11-12-money-truth-design.md`) merges, rebased
onto it · Stage 1: `docs/specs/2026-11-06-economics-design.md` (its section 13 is what shipped) · Audits:
`~/.claude/task-logs/audit/business/REPORT.md` ("Recommended for Economics stage 2", B4, B12, B13, B15) and
`~/.claude/task-logs/audit/designer/REPORT.md` ("Economics direction", D6, D7, D8, D27)

The owner approved the design on 2026-11-12 (parts A1 to A5, B1 to B3, the layout and the build order). Part A makes the
page answer "does it pay, and how much of this is my own data" at a glance; part B adds what moves profit most, the price ×
yield map with a sales limit, and each run against the plan saved when it started. Everything is Your container's (the
room's own way, named by its room type since money truth: Your container, Your room, Your shed); the money is worked out in
the browser with the stage-1 model, as before.

## 1. Scope

| In | Out (later) |
|---|---|
| A1: Profit tiles in place of the headline sentence (Profit a month, Break-even against your selling price, Payback, Best other way); a 44 px sticky line in place of the sticky sentence; the sentence kept as visually hidden text *owner* | A cash curve, months 0 to 24 (audit priority 4) |
| A2: Profit per way as horizontal diverging bars, under the tiles, before the table; a way not compared keeps its row with the reason *owner* | Running profit apart from the investment case (audit priority 3) |
| A3: Source labels in three tiers (yours typed, yours recorded, the app's) and quiet Research with a confidence meter; a page meter "Your figures N of M" *owner* | A whole-farm view (one TNB account, rent once) |
| A4: The table capped at 760 px with its rows renamed; on a phone Your container beside one other way, picked with **Compare with** when there are more than two *owner* | Electricity in the hottest month, a heat-wave case |
| A5: Links inside a note's sentence keep their line on a phone, recorded in DESIGN's 44 px Rule *owner* | The designer's "Show research only" filter and the bars' cost breakdown toggle |
| B1: What moves profit most: Your container's profit with each figure at its low then its high, the rest held; top 8 and **Show all** (`web/economics-swing.js`) *owner* | A swing of the other ways' profit |
| B2: The price × yield map: a 7 × 7 grid of Your container's profit a month, a break-even line, where you are now, a cell's numbers on a tap, and a sales limit ("you can sell about N kg a week") so the map never promises income above what you can sell (`web/economics-map.js`) *owner* | The sales limit on the tiles and the table (open for the owner, 15) |
| B3: Your runs against the plan: the room and crop's figures saved as a run's plan when the run starts (`economics_plans`, version 30); each finished run against its plan, what made the difference; a run in progress against the plan by now *owner* | Shrink per run (data integrity's not-sold record, B12, comes later or in its own iteration) |
| The build order: runs against the plan first, the tornado last (the business auditor's) *owner* | |

## 2. What it reads from money truth and the other iterations

### 2.1 Depends on money truth

Economics stage 2 is built on money truth's Economics (database 28). It reads, never changes, the outputs below.

| Money truth output | Its spec | Stage 2 reads it for |
|---|---|---|
| `inputsOf(values, way, ctx)` and `compare(values, ways, ctx)` with `ctx = { otherBlocks, register }`; the view's `context` | 6.3, 9 | Every swing, map cell and run figure passes the view's `context` to the model; a plan saves it (7.1) |
| `x.labourMonth`, `x.writeOffMonth` in `grow` (labour as people, the register's write-off) | 6.3, 9 | The swing and the map hold them as the model gives them; the register's write-off scales with a swung equipment figure (5.3) |
| The figures `yours.workers`, `yours.workerMonth`, `yours.other`; `wage` relabelled "Labour cost, other ways" | 6.3, 9 | Swing figures (5.1); plan keys (7.1); `wage` and `yours.labourMin` then move no profit of Your container and are named as such (5.4) |
| The sources `'sales'`, `'costs'`, `'register'` and their chips "Your sales", "Your costs", "Your equipment" | 8.1, 9, 6.3 | The recorded tier of the labels (4.3), the page meter, the ±20 % swing (5.2) |
| Your sales (`yourSales`: the crop's sale lines of the last 90 days, farm-wide) and the price figure's `realised` | 8.1 | The sales limit's default (6.3); the Break-even tile's price is the price used, whatever its source |
| Partial runs counted with their block-in day (`runs.blocks_in_at`, a run's start then that day) | 8.2 | Which finished runs show against the plan and the day a run in progress is on (7.4) |
| The loss from Batches' checks, the yield then per good block (`lossOf`) | 8.3 | Each run's Blocks lost and Yield rows (7.5) |
| Costs' sale steps (`saleParts`: own run, its room's run, the one run growing the crop, shared by kg) | 7 | Each run's selling price and kg sold (7.4) |
| A made batch's live price and `priceMissing` | 4 | Each run's block price (a batch with a material unpriced is left out, as Your runs does) |
| The room type: `view.room.type`, `yoursName(type)`, `figureLabel(key, type)`, `wayName(way, { type })` | 10 | Your way's name on the tiles, bars, table, map, swing and plan |
| `labourLine(yours, room)` | 9 | Stays first under the table |
| Version 28 | 2 | This iteration's step is 30 |

### 2.2 The other iterations

| Iteration | What it means here |
|---|---|
| Alarms (27, merged) | Nothing read |
| Data integrity (29) | Its upgrade step runs before this one's 30. Its not-sold record (B12) may later give shrink from Your runs; stage 2 then swings it ±20 % like any recorded figure and nothing else changes. If stage 2 merges first, the lead renumbers (the contract's section 2 rule) |
| Contamination (31) | Waits on this one; runs against the plan will read its loss records then |

## 3. The page, top to bottom

| # | Section | Card title | Built in |
|---|---|---|---|
| 1 | The month: four tiles, the page meter, the hidden sentence | none (`aria-label` "The month") | 4.1, 4.3 |
| 2 | Profit per way (bars), then the comparison table and its lines | "A month, each way" | 4.2, 4.4 |
| 3 | What moves profit most | "What moves profit most" | 5 |
| 4 | Price × yield | "Price × yield" | 6 |
| 5 | Your runs against the plan | "Your runs against the plan" | 7 |
| 6 | Figures (as stage 1, the labels of 4.3) | "Figures" | Stage 1 8.5, 4.3 |
| — | The sticky line, under the top bar once the tiles have scrolled away, to the page's end | none | 4.1 |

Sections 2 to 5 work out again on every keystroke in Figures (the model in the browser); section 5's runs are read from the
server, their money worked out in the browser too.

## 4. Part A: the answer at a glance

### 4.1 The tiles (A1)

Costs' stat strip exactly (`us-tiles hv-tiles co-tiles`, its first tile the lead in display size): four across from 900 px,
two by two below. Words from `tilesOf(results, { room, crop, type, price, life })` in `web/economics-math.js`.

| Tile | Label | Figure | Caption (`fs-xs` muted unless said) |
|---|---|---|---|
| 1 (lead, 32 px; 28 px on a phone) | "Profit a month" | `moneyText(profit)`; a loss in `critical-text` | "Profit · Container 1, Lion's mane"; a loss "Loss · Container 1, Lion's mane" (the word first: never colour alone) |
| 2 | "Break-even" | "RM 38.23 a kg"; "—" when nothing sells | "You sell at RM 50.00, RM 11.77 over it."; short: "You sell at RM 36.00, RM 2.23 short." in `critical-text`; equal to the sen: "You sell at RM 38.23, just at it."; nothing sells: "Nothing sells at these figures." |
| 3 | "Payback" | `monthsText(paybackAll)` with a capital ("13 months", "Under 1 month"); "Never" in `critical-text` | "With the first batch · equipment RM 35,990.00"; never: "Not within the 60 months it is written off over" |
| 4 | "Best other way" | The way's name over its profit: "Highland grower" (`fs-sm` 600) and "RM 3,152.92" (a loss in `critical-text`) | "RM 149.76 a month more than yours"; "RM 1,003.16 a month less than yours"; the same to the sen: "The same as yours". A button (the whole tile): it scrolls to the bars and puts the focus on that way's bar |

The best other way is the shown way (not Your container) with the most profit as shown, ties in the bars' order (stage 1's
rule). Every crop shows at least two ways, so tile 4 always has one.

| Part | Design |
|---|---|
| The sentence | Stage 1's `headline()` (both sentences), in a `sr-only` paragraph first in the card, so a screen reader hears the answer in words; the tiles follow it `aria-hidden="true"` (they say it again) |
| The meter | Under the tiles, 4.3 |
| A part not read | Stage 1's warning line stays in this card, under the meter |
| The sticky line | Replaces stage 1's `.ec-now` sticky sentence. One 44 px line, `surface` over a hairline, sticky under the top bar (`--topbar-h`), first child of the box that holds sections 2 to 6, so it rides to the page's end: "Profit RM 3,003.16 a month · Break-even RM 38.23 a kg"; a loss "Loss −RM 567.53 a month · Break-even RM 38.23 a kg" with only the figure in `critical-text`; nothing sold "Nothing sells · −RM 2,083.00 a month". Shown only while the tiles card is out of view (an `IntersectionObserver`; without one, never shown). `aria-hidden` (the saved line says the result to a reader, as stage 1). It updates as figures are typed. A focused box scrolls clear of it (`scroll-margin-top`) |

| Golden (the stage-1 11.1 inputs, Container 1, lion's mane) | Tiles |
|---|---|
| Price RM 50.00 | Profit "RM 3,003.16", "Profit · Container 1, Lion's mane"; Break-even "RM 38.23 a kg", "You sell at RM 50.00, RM 11.77 over it."; Payback "13 months", "With the first batch · equipment RM 35,990.00"; Best other way "Highland grower", "RM 3,152.92", "RM 149.76 a month more than yours". Sticky: "Profit RM 3,003.16 a month · Break-even RM 38.23 a kg" |
| Price RM 36.00 | Profit "−RM 567.53", "Loss · Container 1, Lion's mane"; Break-even "RM 38.23 a kg", "You sell at RM 36.00, RM 2.23 short."; Payback "Never", "Not within the 60 months it is written off over"; Best other way "Highland grower", "−RM 417.77", "RM 149.76 a month more than yours" |

### 4.2 Profit per way (A2)

One row a way in a fixed order: Your container (by its type's name), Lowland shed, Highland grower, Import and resell, Warm
strain. The rows are the crop's shown ways and its ways not compared (stage 1 4.1); Warm strain is lion's mane's only, so it
is no row for another crop. Bars from `barsOf(results, left, crop)` in `web/economics-math.js`.

| Part | Design |
|---|---|
| Row | 34 px (44 px on a phone), a 160 px label column then the track; under 480 px the label sits over its bar. Your row: its label 700, its bar with a 2 px `accent` outline; the others' bars at 70 % opacity (the fill only, never the words) |
| Scale | One for every row: the track spans the biggest loss (left) and the biggest profit (right) among the shown ways; the zero line (1 px `axis`) sits at loss ÷ (loss + profit) of the track (43.3 % at the golden); all profits: zero at the left edge; all losses: at the right |
| Bar | A loss from zero to the left in `critical`, a profit to the right in `good`; a profit shown as RM 0.00 draws no bar and reads "breaks even" |
| Value | Just past the bar's end, outside it ("RM 3,003.16"; "−RM 2,403.95" in `critical-text`), never inside a bar; a bar that reaches the track's edge leaves its value room, as the track ends 7em short of the row's far side |
| Not compared | The row keeps its place with no bar: "Not compared: <short reason>" in `muted` `fs-sm` (table below). The full reason stays under the table (stage 1 8.4) |
| A tap | Each shown way's row is a button ("Highland grower, RM 3,152.92 a month profit. Show in the table"): it marks that way's column in the table (`accent` at 10 %, "Shown" beside its head, the table's "differs" look) until another is tapped, and on a phone makes it the **Compare with** way (4.4) |
| Reader | The rows are a list (`ol`), each row's words its name, its figure and "profit", "loss" or "breaks even"; the bars `aria-hidden` |

| Crop, way not compared | Short reason |
|---|---|
| Grey oyster, Highland grower | "it fruits best at 25 °C" |
| Grey oyster, Import and resell | "fresh grey oyster keeps 3–4 days" |
| Pink oyster, Highland grower | "too cool to pin there" |
| Pink oyster, Import and resell | "it keeps 1–4 days; none is imported" |
| Black jelly, Highland grower | "growth slows below 18 °C" |
| Lion's mane, Lowland shed | "the warm strain is its lowland shed" |

| Golden (11.1, price RM 50.00) | Rows |
|---|---|
| Lion's mane | Your container RM 3,003.16 (right); Lowland shed "Not compared: the warm strain is its lowland shed"; Highland grower RM 3,152.92 (the longest right); Import and resell −RM 269.27 (left); Warm strain −RM 2,403.95 (the longest left). Zero at 43.26 % of the track |

### 4.3 Source labels and the page meter (A3)

The tag of a figure's row (stage 1 8.5) becomes a label in one of four tiers. Labels, not buttons: 4 px corners, no hover,
the default cursor, 12 px 600 words (DESIGN gains a "Source label" row in Chips and counts, 4 px, an exception to the
full-round shape, and the tiers as a recorded exception to the State-Only Colour Rule: on Economics, blue is yours as typed and
green yours as recorded; the owner's choice, 2026-11-12).

| Tier | Sources (view `source`) | Label | Look | The row |
|---|---|---|---|---|
| Yours, typed | `owner` | "You set" with a pencil before it (`aria-hidden` svg, 12 px) | `accent-soft` fill, `accent-text` words | A 3 px `accent` rule at its left; the box's edge `accent` at rest |
| Yours, recorded | `runs` (not the planted blocks), `sales`, `costs`, `register` | "Your runs · 3 runs", "Your sales", "Your costs", "Your equipment" | `good-soft` fill, `good-text` words | A 3 px `good` rule at its left |
| The app's | `simulator`, `settings`, the planted blocks (`runs` with `from: 'crop'`) | "Simulator", "Settings", "Crop tab" | Stage 1's neutral outline (`border-strong` edge, `ink-2`) | — |
| Research | `research` | "Research" and a three-dot meter: high ●●●, medium ●●○, low ●○○ (6 px dots, `ink-2` filled, `border-strong` empty) | No edge, no fill, `muted` words | — |

"Saving…" and "Not saved" keep stage 1's neutral outline. The meter's dots are `aria-hidden`; the label's words for a reader
are "Research, medium confidence". A research note no longer opens with its confidence ("Low confidence: 150–400 g. …"
becomes "150–400 g. …"): the meter says it.

| Page meter | Design |
|---|---|
| Where | The month card, under the tiles, `fs-sm` `ink-2`, its own line (stage 1's sources line goes) |
| Counts | Over the figures that make Your container's month: every shown figure whose way is `'shared'` or `'yours'` (`figuresFor(crop)`); the other ways' figures are research for a grower who is not you and are not counted |
| Words | "Your figures 5 of 27 · Research 18 · Settings and app 4"; none yours: "Your figures 0 of 27 · Research 23 · Settings and app 4 · set yours in Figures below" with "Figures" a link to the Figures card's title (in a sentence: keeps its line, A5). "Your figures" counts the yours tiers, "Settings and app" the app's |
| Function | `meterOf(figures)` in `web/economics-figures.js` → `{ yours, of, research, app }` |

### 4.4 The table (A4)

| Part | Design |
|---|---|
| Width | The table at most 760 px wide (`max-inline-size`), its label column 240 px, each way at least 120 px, left in its card (the card spans the main column) |
| Hover | A row under the pointer takes `band` (desk only) |
| Rows renamed (D27) | "Blocks started, or kg bought, a month" → "Blocks a month" (import's cell keeps "283.4 kg bought"); "Pays back, equipment only" → "Payback (equipment)"; "Pays back, with the first fill" → "Payback (incl. first batch)"; the line "With the first fill: …" → "First batch: Container 1's equipment, its first 1,740 blocks (RM 10,440.00) and the costs until the first harvest, 12 days in (RM 326.75)."; the Figures label "Shrink, harvest to sale" → "Loss after harvest" (its key `shrink` kept) |
| The marked column | 4.2's tap: the column tinted, "Shown" muted beside its head |
| Phone (≤ 600 px) | One table: the label column, Your container and one other way, side by side, narrow numeric columns (stage 1's one small table a way goes). With more than two ways, a labelled select **Compare with** over it (Calendar's select, 44 px), its options the other shown ways, first the best other way (tile 4); the choice kept while the room and crop stay, cleared by another room or crop; tapping a bar picks it too. With two ways, no select |
| Phone widths | At 360 px: labels 44 %, each way 28 %; a label wraps, a figure never does (stage 1's `keepTogether`) |
| Reader | The phone table's caption names its ways ("A month: Your container and Highland grower"); the select's change is said ("Comparing with Highland grower") |

### 4.5 Links on a phone (A5)

| Rule | Design |
|---|---|
| In a sentence | A link inside a note's sentence (a research note's sources, the expected price's "Settings", the meter's "Figures") keeps its line, with no padding (WCAG 2.5.8's inline exception); the owner accepted it on 2026-11-12 |
| Alone | A link that stands alone ("Change in Settings", "Rooms, to add one", "Give its block-in day") keeps 44 px |
| DESIGN | The 44 px Rule's Economics sentence ends "The owner accepted it (2026-11-12)." in place of "The lead's decision, the owner to confirm." (also in DESIGN's Economics Styles row and stage 1's section 13 row) |

## 5. What moves profit most (B1, `web/economics-swing.js`)

### 5.1 The figures that swing

| Rule | Detail |
|---|---|
| Which | Every shown figure whose way is `'shared'` or `'yours'` (Settings' electricity price too, though it has no box here), but `yours.blocks` (the room's own count, which every way is sized to: not a guess about the farm). The sales limit (6.3) is never in `figuresFor`, so never swings |
| Whose profit | Your container's profit a month (`grow(inputsOf(values, 'yours', ctx)).profit`); the other ways are not swung |
| The values | The page's values as the sums use them: the saved figures with a typed valid figure over its saved one (stage 1's `valuesOf(figures, typed)`), so the bars follow the typing |
| A flush | Swinging Flushes per block moves the yield with it: the yield per good block × new flushes ÷ flushes, so the yield per flush holds (equal flushes). Without this a flush fewer would show more profit (a shorter block life at the same yield) |

### 5.2 Each figure's low and high

| Source of the figure as used | Low, high |
|---|---|
| `research` | Its research range: `research.low`, `research.high` (a range that does not hold the value is used as it is) |
| `owner`, `runs`, `sales`, `costs`, `register`, `settings`, `simulator`, and a typed figure not yet saved | value × 0.8, value × 1.2 |
| A whole-number figure (flushes, days, months) | The low rounded down, the high rounded up (2 flushes: 1 to 3; 12 days: 9 to 15) |
| Every figure | Clamped to its allowed limits (stage 1 4.2: a loss or shrink at most 90 %, flushes 1 to 10) |

### 5.3 Held while one figure moves

| Case | Rule |
|---|---|
| Every other figure | At its value now |
| The model's context | The view's `context` (money truth): the other rooms' blocks and the register |
| The register's write-off (money truth 6.3: used while Your container's equipment equals the register's total) | A swung equipment figure scales the register's month by the new total over the register's: writeOffMonth × equipment′ ÷ total. Without this the write-off would jump from the register's month to equipment ÷ months the moment a figure moved off the total. "Equipment written off over" then moves nothing (each item has its own months) and is named under the bars (5.4) |

### 5.4 The module

| Export | Does |
|---|---|
| `SWING` | 0.2 |
| `TOP` | 8 |
| `rangeOf(f, value)` | 5.2 → `{ low, high, how: 'research' \| 'twenty' }`; `f` a view figure (`key`, `source`, `research`), `value` the value the sums use |
| `swings(figures, values, ctx)` | → `{ base, rows: [{ key, low, high, how, atLow, atHigh, down, up, spread }], still: [key] }`: `atLow` and `atHigh` the profit change (RM a month) at the low and the high, `down` = min, `up` = max, `spread` = up − down; `rows` sorted by spread as shown (to the sen), then in `figuresFor`'s order; `still` the keys whose spread shows as RM 0.00 (not in `rows`) |
| `swingText(row, type)` | "Selling price RM 40.00 → 60.00: −RM 2,550.50 to +RM 2,550.50 a month" (the label, the low → high in the figure's unit, the change at the low then at the high; a change "+RM …", "−RM …" or "RM 0.00"); "Flushes per block 1 → 3 (the yield with them): −RM 7,179.00 to +RM 3,589.50 a month" |
| `stillLine(keys, type)` | "Not moving it at these figures: Transport to buyers, Rent." (labels by `figureLabel`); none: null |

### 5.5 On the page

| Part | Design |
|---|---|
| Lead | Muted `fs-sm` under the title: "Container 1's profit a month, each figure set to its low then its high, the rest held. Research figures swing over their research range; yours, your runs', your sales' and Settings' by 20 % each way." Then "Now: RM 3,003.16 a month." (600, the zero line's figure) |
| A row | The words of `swingText` (`fs-sm`, 600 for the label), then a 12 px bar under them on one shared scale: the biggest change of the shown rows, either way, is half the track each side of a centre line (1 px `axis`); the part below now in `critical`, above in `good`; a 2 px tick at each end. The row's words are the reader's; the bar `aria-hidden` |
| Show all | The top 8; a quiet button "Show all 21" (the number of rows) under them, then "Show the top 8"; the focus stays on it; no button with 8 rows or fewer |
| Still | `stillLine` muted under the rows |
| Typing | Worked out again with the table on each valid keystroke |
| Empty | Never: Your container always has figures. Every row still: "No figure moves it at these figures." |

### 5.6 Golden (the stage-1 11.1 inputs, Container 1, lion's mane; base RM 3,003.16)

The values are stage 1's `VALUES` of `tests/economics-model.test.js` with `yours.kwhBlock` = 506 × 42 ÷ (1,740 × 30.4)
(the model page's 506 kWh a month), labour by the minute (no workers figures) and no register: a test feeds them with the
source shown.

| Case | Every figure "You set" (±20 %) | Every figure "Research" (lion's mane ranges) |
|---|---|---|
| 1 | Flushes per block 1 → 3: −RM 7,179.00 to +RM 3,589.50 | Yield per good block 150 → 400 g: −RM 4,795.36 to +RM 7,191.25 |
| 2 | Selling price RM 40.00 → 60.00: −RM 2,550.50 to +RM 2,550.50 | Flushes per block 1 → 3: −RM 7,179.00 to +RM 3,589.50 |
| 3 | Yield per good block 200 → 300 g: −RM 2,397.47 to +RM 2,397.47 | Selling price RM 30.00 → 70.00: −RM 5,100.99 to +RM 5,100.99 |
| 4 | Block price RM 4.80 → 7.20 a block: +RM 1,511.31 to −RM 1,511.31 | Block price RM 3.00 → 10.00 a block: +RM 3,778.29 to −RM 5,037.71 |
| 5 | Rest and turnaround 12 → 20 days: +RM 381.37 to −RM 315.04 | Rent RM 0.00 → 4,000.00 a month: RM 0.00 to −RM 4,000.00 |
| 6 | Loss after harvest 8 → 12 %: +RM 266.39 to −RM 266.39 | Blocks lost 5 → 25 %: +RM 665.96 to −RM 1,997.89 |
| 7 | Blocks lost 8 → 12 %: +RM 266.39 to −RM 266.39 | Loss after harvest 5 → 20 %: +RM 665.96 to −RM 1,331.93 |
| 8 | Days to first harvest 9 → 15 days: +RM 278.69 to −RM 241.53 | Rest and turnaround 9 → 30 days: +RM 724.60 to −RM 905.75 |
| 9 to 23 | Days between flushes 11 → 17 (+278.69 / −241.53), Packing 2.40 → 3.60 (+153.03 / −153.03), Equipment written off over 48 → 72 months (−149.96 / +99.97), Labour cost 8 → 12 (+105.79 / −105.79), Labour per block 2.016 → 3.024 min (+105.79 / −105.79), Container 14,800 → 22,200 (+61.67 / −61.67), Electricity price 0.4408 → 0.6612 (+55.76 / −55.76), Electricity per block 0.3214 → 0.4821 kWh (+55.76 / −55.76), Cooling (+28.60 / −28.60), Fans (+11.00 / −11.00), Humidifier (+10.00 / −10.00), Racks (+8.70 / −8.70), Electricity fixed charge 16 → 24 (+4.00 / −4.00) | Packing 1.50 → 5.00 (+382.57 / −510.10), Electricity per block 0.40 → 1.63 kWh (+1.23 / −852.32), Labour per block 1.26 → 5.04 min (+264.48 / −528.96), Days between flushes 10 → 18 (+381.37 / −315.04), Equipment written off over 36 → 96 (−399.89 / +224.94), Transport 0 → 2 (0 / −510.10), Container 17,300 → 38,100 (+20.00 / −326.67), Days to first harvest 10 → 14 (+181.15 / −164.68), Labour cost 8.72 → 12 (+67.71 / −105.79), Fans (+26.67 / −70.00), Cooling (+77.00 / −7.67), Electricity price 0.515 → 0.596 (+18.22 / −22.77), Humidifier 900 → 3,000 (+35.00 / 0), Racks 348 → 2,262 (+37.70 / +5.80), Electricity fixed charge 10 → 20 (+10.00 / 0) |
| Still | Transport to buyers, Rent (both RM 0.00: 20 % of nothing) | none |

Ties as shown to the sen keep `figuresFor`'s order (Loss after harvest before Blocks lost; Days to first harvest before Days
between flushes; Labour cost before Labour per block; Electricity price before Electricity per block).

## 6. Price × yield (B2, `web/economics-map.js`)

### 6.1 The grid

| Part | Rule |
|---|---|
| Columns | 7 selling prices: the price now × 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6 (−60 % to +60 % in 20 % steps), low to high, left to right; each clamped to the figure's limit (RM 1,000 a kg) |
| Rows | 7 yields per good block: the yield now × the same steps, high at the top; clamped to 5,000 g. A flush is not moved: the yield is the block's over all its flushes |
| A cell | Your container's month at that price and yield, the rest held (the view's `context` too): `{ profit, kgSold, be, capped }` |
| Now | The centre cell (row 4, column 4) is the figures now, marked ● |
| A price or yield of 0 | No grid: "With a selling price of RM 0.00 there is nothing to map: set it in Figures." (or "a yield of 0 g") |

### 6.2 The break-even line

| Rule | Detail |
|---|---|
| Where | Profit is a straight line in the price, so each row has one break-even price, the model's `be` at that yield (with the sales limit, 6.3: the capped costs ÷ the capped kg) |
| Drawn | An svg over the grid (its viewBox the grid's 7 × 7 cells, `preserveAspectRatio="none"`, `aria-hidden`), a 2 px `ink` polyline through each row's centre at x = 0.5 + (be − first price) ÷ the price step; a row whose break-even is off the grid ends the line at the grid's edge with a 6 px arrow pointing off it |
| Said | Under the grid: "Break-even at your yield (250 g): RM 38.23 a kg." and, when the line leaves the grid: "Below 150 g a block it breaks even only above RM 80.00 a kg." |

### 6.3 The sales limit

| Part | Design |
|---|---|
| The figure | `market.kgWeek` "What you can sell", kg a week, scope crop (the crop's market, every room), 0 to 100,000, way `'market'`. In `FIGURES` but not in `figuresFor` (no fold, no swing, no meter); `PUT` and `DELETE /api/economics/figures` take it for every crop. No research figure |
| Its sources | You set, else none: only a limit the owner typed caps (the owner, 2026-11-13, decision 31). Your sales (money truth's `yourSales`: the crop's kg sold farm-wide over the days from the first of the last 90 days' sales to today, at least 7 days, × 7, to 0.1 kg) is a suggestion in its note, never a cap |
| The view | `limit: { value, source: 'owner' \| null, at, sales: { kg, days, from } \| null }` (`server/economics.js`): `value` the owner's or null, `sales` Your sales' week beside it either way; `yourSales` gains the day of the window's first sale (`first`). The page's cap is `limitWeekOf(limit, typed)`: the box as typed, else the owner's |
| In the map | A cell whose kg sold a month is over the limit × 30.4 ÷ 7 sells only that: income, packing and transport on the capped kg, every other cost kept (the blocks are grown and paid for). The cell is `capped` |
| Its box | At the top of the card, a Figures row (stage 1 8.5, its label, box, unit "kg a week", label of 4.3, note and Back to default). Not set, with sales: "No limit set: nothing is capped. You've sold about 8.0 kg a week of Lion's mane (24.0 kg over 21 days)." and a quiet **Use this** that saves that week as if typed; set: "You set this on 6 Nov · You've sold about 8.0 kg a week." with Back to default; then, set: "It caps Container 1's month as if it alone sold Lion's mane; the other rooms' Lion's mane is not taken off it."; not set: the same opening "A limit caps …"; no sales: "No limit: you sold no Lion's mane in the last 90 days. Set what you can sell a week." Saved on leaving the box as every figure; typing redraws the map |

### 6.4 The module

| Export | Does |
|---|---|
| `STEPS` | `[0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6]` |
| `capOf(kgWeek)` | kg a month: kgWeek × 30.4 ÷ 7; null for no limit |
| `cellOf(values, ctx, { price, yieldG, cap })` | One cell: `{ profit, kgSold, be, capped }` (`be` null with nothing sold) |
| `mapOf(values, ctx, { kgWeek })` | `{ prices: [7], yields: [7] (high first), rows: [[cell × 7] × 7], now: { row: 3, col: 3 } or null, here, price, yieldG, line: [{ yieldG, be, off: 'left' \| 'right' \| null }], cap }` or `{ none: 'price' \| 'yield' }`; `here` the cell at the figures now (the tiles' month), `now` null when no cell is exactly it (§17) |
| `cellText(cell)` | The desk cell: the profit in whole RM, grouped, its sign ("3,003", "−4,648"), the column heads saying "RM a month"; the phone cell: "+", "−" or "0" |
| `cellLabel(cell, price, yieldG)` | A reader's and the picked line's words: "RM 60.00 a kg and 300 g a block: RM 8,461.22 a month, 306.1 kg sold, break-even RM 32.35 a kg." Capped: "…: RM 5,868.40 a month, 260.6 kg sold of 306.1 kg grown (what you can sell), break-even RM 37.48 a kg." |
| `lineWords(map)` | 6.2's lines |

### 6.5 On the page

| Part | Design |
|---|---|
| Lead | Muted `fs-sm`: "Container 1's profit a month at selling prices and yields around yours now, the rest held." |
| The grid | A real table (caption, `sr-only`: "Profit a month by selling price and yield per good block"): a corner cell "g ╲ RM a kg", the price heads ("RM 20", "RM 30", …; to the sen when not whole), the yield heads ("100 g", …); 49 cells of equal size (`table-layout: fixed`): 64 × 40 px from 600 px, 40 × 40 px under (7 of them fit 360 px with the heads), no gaps but a 1 px `surface` seam |
| A cell | A loss `critical-bg`, a profit `good-soft`, RM 0.00 `band`; its words `cellText`; capped cells hatched (a 45° `border-strong` repeating gradient over the fill); the now cell ● (8 px `ink` dot) beside its words and a 2 px `ink` outline |
| Taps and keys | Each cell a button with the `cellLabel` as its name, one Tab stop for the grid (roving `tabindex`: arrows move, Home and End the row's ends), as Costs' months chart. Tap or Enter picks the cell: its line under the grid (a polite live line), the cell outlined `accent`. The picked cell starts as now's |
| Legend | One line under the grid: a swatch and its word for each: "Profit", "Loss", "Capped by what you can sell" (only with a limit), "● Now", "— Break-even" |
| Typing | The map is drawn again on each valid keystroke in Figures or the limit's box; the picked cell keeps its place |

### 6.6 Golden (the stage-1 11.1 inputs; RM a month, to the sen)

No sales limit. Prices RM 20, 30, 40, 50, 60, 70, 80; yields 400.02, 350.02, 300.02, 250.02, 200.01, 150.01, 100.01 g
(shown "400 g" … "100 g").

| Yield \ price | 20 | 30 | 40 | 50 | 60 | 70 | 80 | Break-even |
|---|---|---|---|---|---|---|---|---|
| 400 g | −2,046.82 | 2,033.97 | 6,114.76 | 10,195.56 | 14,276.35 | 18,357.15 | 22,437.94 | 25.02 |
| 350 g | −2,913.99 | 656.70 | 4,227.40 | 7,798.09 | 11,368.79 | 14,939.48 | 18,510.17 | 28.16 |
| 300 g | −3,781.16 | −720.56 | 2,340.03 | 5,400.63 | 8,461.22 | 11,521.82 | 14,582.41 | 32.35 |
| 250 g (now) | −4,648.33 | −2,097.83 | 452.66 | **3,003.16** | 5,553.66 | 8,104.15 | 10,654.65 | 38.23 |
| 200 g | −5,515.50 | −3,475.10 | −1,434.70 | 605.69 | 2,646.09 | 4,686.49 | 6,726.88 | 47.03 |
| 150 g | −6,382.66 | −4,852.37 | −3,322.07 | −1,791.77 | −261.47 | 1,268.82 | 2,799.12 | 61.71 |
| 100 g | −7,249.83 | −6,229.64 | −5,209.44 | −4,189.24 | −3,169.04 | −2,148.84 | −1,128.64 | 91.06 (off the grid: right) |

With "What you can sell" 60 kg a week (cap 260.57 kg a month): the rows 300, 350 and 400 g grow more than that and are all
capped, each the same: −4,554.46, −1,948.74, 656.97, 3,262.69, 5,868.40, 8,474.11, 11,079.83, break-even 37.48; the rows 250 g and
under are as above (255.05 kg sold at 250 g is under the cap).

## 7. Your runs against the plan (B3)

### 7.1 The plan saved when a run starts

| Part | Rule |
|---|---|
| When | A run of blocks opens in a room (Harvest's `runs`, written by the Crop tab's save: an empty room given crops, or new blocks on a done room) or an open run gains a crop it did not have. For each of its crops that is one of the four, the plan is that room and crop's figures as the view resolves them at that moment |
| What is saved | Every figure whose way is `'shared'` or `'yours'` for the crop: `{ [key]: { value, source } }`, and the view's `context` (money truth's `{ otherBlocks, register }`) with the crop's own blocks in the run (`cropBlocks`; `yours.blocks` is the room's, every crop's), so the plan's month is worked out exactly as on that day. Nothing of the other ways |
| How it hears | Economics subscribes to the `room` event with `part: 'crop'` (published after every Crop tab save and every program change the farm app sees). On each: the room's open run, and for each of its four crops without a plan row, the plan saved, then `economics` `{ roomId, crop, plan: true }` published. The same check runs on every plans read of the room, not when the service starts (it would work out every room's figures as the app comes up): a missed event is caught on the next read. A part not read when the figures are resolved (the view's `errors`) saves nothing, as its fallback figures would be frozen; the next crop event or plans read saves it |
| Never replaced | A plan row is written once (`INSERT OR IGNORE`); later changes of the figures never move it |
| Before stage 2 | The upgrade to version 30 writes a row with no figures for every crop (of the four) of every run that exists then: such a run "started before plans were kept" and is compared with today's figures, marked so |
| The contract | Economics reads Harvest's runs and listens to `room`; it never writes a run, a program or a figure of another module |

### 7.2 Data (database version 30)

`server/db.js`, in the Economics block: the step `if (version < 30) { … }` (after data integrity's 29), `VERSION = 30`.

```sql
CREATE TABLE IF NOT EXISTS economics_plans (
  id       INTEGER PRIMARY KEY,
  run_id   INTEGER NOT NULL,           -- Harvest's runs.id
  room_id  INTEGER NOT NULL,
  crop     TEXT    NOT NULL,           -- one of the four
  at       INTEGER NOT NULL,           -- ms: when it was saved (the run's start; the upgrade for a run before)
  figures  TEXT,                       -- JSON { key: { value, source } }; null: the run started before plans were kept
  context  TEXT                        -- JSON { otherBlocks, register } (money truth's model context); null with figures null
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS economics_plan ON economics_plans (run_id, crop);
CREATE INDEX IF NOT EXISTS economics_plans_by_room ON economics_plans (room_id, crop);
CREATE TRIGGER IF NOT EXISTS economics_plan_run_gone AFTER DELETE ON runs BEGIN
  DELETE FROM economics_plans WHERE run_id = OLD.id;
END;
INSERT OR IGNORE INTO economics_plans (run_id, room_id, crop, at, figures, context)
  SELECT r.id, r.room_id, json_extract(c.value, '$.crop'), :now, NULL, NULL
  FROM runs r, json_each(r.crops) c
  WHERE json_extract(c.value, '$.crop') IN ('oyster', 'pink', 'woodear', 'lionsmane');
```

| Method | Reply | Rule |
|---|---|---|
| `economicsPlan(runId, crop)` | the row (camelCase, `figures` and `context` parsed) or null | |
| `economicsPlans(roomId, crop)` | `[row]` | The room and crop's rows, newest run first |
| `saveEconomicsPlan({ runId, roomId, crop, at, figures, context })` | true when written | `INSERT OR IGNORE`: an existing row stays |

| Upgrade case | Rule |
|---|---|
| `:now` | The upgrade's own clock (ms), bound as a parameter |
| A deleted room | `deleteRoom` deletes its runs by hand; the trigger takes their plans (run ids are reused) |
| Version 29 to 30 | The table, its indexes, its trigger and the rows before; nothing else changes |
| Back up | `data/v2.db` before the first start at 30 (the owner's deploy) |

### 7.3 The runs and their actuals (`server/economics-runs.js`)

| Part | Rule |
|---|---|
| The counted rule | One function shared with Your runs (`countedRuns`): ended, with kg of the crop, not partial or with a block-in day (money truth 8.2), its start the block-in day for a partial run |
| `eachRun({ db, harvests, batches, days, room, crop, today, zone, log })` | → `{ current, past, leftOut, errors }` |
| `past` | The counted runs, newest first: `[{ runId, from, to, days, partial, mixed: [crop keys], blocks, lost, measured, kg, sold: { kg, total } \| null, price, blockPrice, batchesLeftOut, kwhBlock, kwhPending }]`: blocks = the crop's blocks put in (`byCrop`), lost and `measured` by money truth's `lossOf` over the run's own batches of the crop (all of them with batches, else not measured), kg its kg picked, `sold` its lines and shares by Costs' sale steps, price = total ÷ kg sold (null with none), block price its priced batches (money truth's rule), kWh per block its own days' kWh ÷ the run's blocks of every crop (stage 1's rule, one run), `kwhPending` while a day is worked out, days = farm days from `from` to `to` |
| `current` | The room's open run when it has the crop: `{ runId, from, partial, blocksInAt, day, kg, blocks }`; `day` = farm days from its start to today; a partial run with no block-in day: `day` null |
| `leftOut` | `{ partial: n }`: the room's ended runs of the crop left out as partial without a block-in day |
| A part not read | As Your runs: logged, named in `errors` (`harvest`, `sales`, `batches`, `energy`), its figure null |

### 7.4 The route

| Route | Reply |
|---|---|
| `GET /api/economics/plans?room=<id>&crop=<key>` | 200 `{ room: { id, name, type }, crop, current, past, leftOut, plans: { [runId]: { at, figures, context } \| { at, before: true } }, errors }` (`current` and `past` 7.3; `plans` the rows of those runs: a run with no row at all is `before` too); 400 `{ error: 'Pick a crop', field: 'crop' }`; 404 `{ error: 'Room not found' }`. The owner's only (off the worker list: 403) |
| Its events | Read again on `economics`, `harvest`, `sales`, `batches` and `costs` and the `room` crop event (the page's stage-1 triggers); not after a figure save (a figure save changes only "today's figures", which the page holds) |

### 7.5 A finished run against its plan (`web/economics-plan.js`, pure)

The plan's values are the saved figures' values, or today's (the page's values) for a run before, with that run's own blocks
(its room's and its crop's, not today's room). The run's values are the plan's with these replaced by the run's own:

| Figure | The run's value | When the run has none |
|---|---|---|
| `yours.blocks` | The room as the plan had it: the plan's room blocks × its blocks of the crop put in ÷ the plan's (`cropBlocks`), so a crop added to an open run is not compared with the room it joined; a plan without `cropBlocks`, the run's room (every crop's). The table's and the gap's blocks, loss and kg are the crop's own | — |
| `yours.loss`, `yours.yieldG` | Measured: lost ÷ put in, and kg ÷ (put in − lost) × 1,000 (per good block). Not measured: the yield over every block put in and the loss 0 (stage 1's rule) | — |
| `price` | Its sales' price | The plan's, and the row says "No sales reached it" |
| `blockPrice` | Its batches' price | The plan's, "No price" |
| `yours.kwhBlock` | Its own kWh per block | The plan's, "Not measured" ("Working out…" while pending) |
| The block life | Its days in the room + the plan's rest and turnaround (the model's `life`, 7.7) | — |

| Row | Plan | This run |
|---|---|---|
| Blocks put in | "1,740" | "1,740" |
| Blocks lost | "10 % (174)" | "5 % (87)"; not measured: "In the yield" |
| Yield per good block (measured), else Yield per block put in (the plan's yield × (1 − loss)) | "250 g" | "230 g" |
| kg picked | blocks × (1 − loss) × yield: "391.5 kg" | "380.6 kg" |
| Selling price | "RM 50.00 a kg" | "RM 54.00 a kg" with "300.0 kg sold" muted under it |
| Block price | "RM 6.00 a block" | "RM 6.50 a block" |
| Electricity per block | "0.40 kWh" | "0.45 kWh" |
| Days in the room | first + interval × (flushes − 1): "26 days" | "28 days" |
| Profit a month at these figures (700, a `border-strong` rule above) | "RM 3,003.16" | "RM 2,832.85" |

| Line | Words |
|---|---|
| Against the plan | Under the table: "RM 170.31 a month under the plan." / "RM 85.00 a month over the plan." / "The same as the plan." (no colour: under a plan is not a fault) |
| What made the difference | The two biggest of the one-at-a-time gaps: the plan's profit with only that figure (or the yield and loss together when not measured, or the block life) taken from the run, less the plan's. "What made the difference, each on its own: Selling price RM 54.00 a kg against RM 50.00 planned, +RM 1,020.20 a month; Yield per good block 230 g against 250 g, −RM 947.76 a month." One gap only: one clause; none over RM 0.00: "Nothing moved it more than a sen." |
| The plan | "Plan saved 1 Sep 08:12 with that day's figures." Before: "Started before plans were kept: compared with today's figures." |
| A mixed run | "Container 1 also grew Grey oyster in this run; its electricity is shared by every block." |
| A partial run | "Counted from 20 Sep, the day its blocks went in." |

| Export | Does |
|---|---|
| `planValuesOf(plan, todayValues)` | → `{ values, ctx, before }` |
| `runValuesOf(planValues, run)` | → `{ values, life }` (the table above) |
| `runMonths(plan, run, todayValues, todayCtx)` | → `{ plan: grow result, run: grow result, diff }` |
| `gapsOf(plan, run, todayValues, todayCtx)` | → `[{ key, label, delta, planText, runText }]`, biggest \|delta\| first, those under RM 0.005 left out |
| `runRows(plan, run, todayValues)` | → the rows above `[{ key, label, plan, run, sub }]` |
| `againstLine(diff)`, `gapsLine(gaps)`, `planLine(plan)` | The lines above |

### 7.6 A run in progress

| Part | Rule |
|---|---|
| The plan by now | The plan's kg picked × the flushes due by today ÷ flushes; flush n is due on day first + interval × (n − 1) (equal flushes, 5.1's rule) |
| Words | "Day 20 of 26: 180.0 kg so far, the plan by now 195.8 kg." (26 = the plan's days in the room); past them: "Day 30, past the plan's 26 days: 380.6 kg so far, the plan 391.5 kg."; nothing picked: "Day 5 of 26: nothing picked yet; the plan's first harvest is on day 12." |
| A partial run with no block-in day | "Recorded from 12 Oct; give the day its blocks went in to compare it." with **Give its block-in day** (a link to its run page, 44 px on a phone) |
| Before stage 2 | Today's figures, with the before line |
| Function | `progressOf(current, planValues)` → `{ day, days, kg, planKg, firstDay }`; `progressLine(p)` |

### 7.7 The model's one change

| Change | Why |
|---|---|
| `blockLife(x)` gives `x.life` when it is a number, else first + interval × max(0, flushes − 1) + turn; `inputsOf(values, 'yours', ctx)` passes `ctx.life` into `x.life` before it works out the kWh a month | A run's own block life (its days + the plan's turnaround) sets its blocks and electricity a month; every stage-1 caller passes no `life` and is unchanged |
| `inputsOf(values, 'yours', ctx)` with `ctx.register.scale` true uses writeOffMonth × equipment ÷ total whatever the equipment; without it, money truth's rule (the register's month only at its exact total) | The swing's seam (5.3), one place for the register's write-off |

### 7.8 On the page

| Part | Design |
|---|---|
| Lead | Muted `fs-sm`: "Each run's figures against the figures saved when it started; its money a month at its own figures." |
| In progress | First, its own line (`fs-md` 600) with a 6 px `muted` progress bar under it (kg so far of the plan's kg) |
| Finished | The newest five, newest first, each a fold (DESIGN's Folds), the newest open: its head "1 Sep – 29 Sep · RM 2,832.85 a month at its figures · RM 170.31 under the plan" (a heading inside the summary); inside the table (caption "1 Sep – 29 Sep against its plan"), then the lines. More: a fold "4 older runs" |
| Left out | A muted line "2 runs left out: recorded from 12 Oct without their block-in day." |
| Empty | "No finished runs of Lion's mane in Container 1 yet. When blocks go in on its Crop tab, that day's figures are saved as the run's plan." |
| Phone | The table keeps its three columns (label 44 %, Plan 28 %, This run 28 %); a sub line ("300.0 kg sold") under its figure |
| Typing | A run before stage 2 is worked out again with the typing (today's figures); a planned one only with its own figures |

### 7.9 Golden

The plan: the stage-1 11.1 values (as 5.6), saved on 1 Sep 08:12. The run: 1,740 blocks of lion's mane put in 1 Sep, ended
29 Sep (28 days), 87 lost by Batches' checks, 380.6 kg picked, 300.0 kg sold for RM 16,200.00, 0.45 kWh a block, blocks RM
6.50.

| Result | Value |
|---|---|
| Plan | kg picked 391.52; profit RM 3,003.16 a month; days in the room 26 |
| Run | yield per good block 230.25 g; loss 5 %; block life 44 days (28 + 16); kg sold a month 236.66; profit RM 2,832.85 a month; RM 170.31 under the plan |
| One at a time | Selling price +RM 1,020.20; Yield per good block −RM 947.76; Blocks lost +RM 665.96; Block price −RM 629.71; Days in the room −RM 164.68; Electricity per block −RM 33.47; Blocks put in RM 0.00 |
| What made the difference | Selling price (+RM 1,020.20), then Yield per good block (−RM 947.76) |
| Not measured (no batches) | Yield per block put in 218.74 g against 225.01 g planned: −RM 334.45 (yield and loss together); the two: Selling price, then Block price (−RM 629.71); the run's month the same RM 2,832.85 |
| In progress, day 20, 180.0 kg | "Day 20 of 26: 180.0 kg so far, the plan by now 195.8 kg." (flush 1 of 2 due on day 12) |

## 8. The server's other changes

| Part | Change |
|---|---|
| `GET /api/economics` view | Gains `limit` (6.3). Nothing else: the tiles, bars, swing and map are worked out in the browser from `figures` and `context` |
| `PUT`, `DELETE /api/economics/figures` | Take `market.kgWeek` for every crop (`keyCheck`) |
| `GET /api/economics/plans` | New (7.4) |
| `createEconomics` | Gains the plan check (7.1): it subscribes to `room` beside `simulation`; `close()` stops both |
| Events | `economics` `{ roomId, crop }` also when a plan is saved; nothing new in `EVENT_TYPES` |
| `server/roles.js` | Unchanged: the new route is off the worker list (403) |

## 9. Errors and empty states

| Case | The page |
|---|---|
| The plans read fails (no answer, 5xx) | Section 5 alone shows "Couldn't read your runs just now · Retry" (a quiet Retry, the Summary's); the rest of the page as it was |
| A part of the plans not read (`errors.sales`, …) | The rows it feeds read "Couldn't read Sales just now" in `warning-text`; the run's month uses the plan's figure for them |
| An older farm app (404 "Not found" on `/plans`) | Section 5 says "This farm app is older than the page; reload once it is updated." and stops asking; the rest works |
| No rooms | Stage 1's empty card only (no tiles, sections) |
| Nothing sells at these figures | Tile 2 "—", tile 3 "Never"; the bars as they are; the map draws (its other cells sell); the swing rows' changes are worked out as ever |
| A price or yield of 0 | The map's line (6.1); the rest as it is |
| A run with no kg picked, ended | Not counted (the counted rule); not shown |
| A plan with a figure key the code no longer has | Left out of the plan's values (today's value is used and the row says "today's") |
| A plan figure missing a key added since (money truth's `yours.other` on an older plan) | Today's value for it, said under the table: "Other equipment: today's figure (not in the plan)." |
| A room renamed or its type changed | The words follow on the `room` event |

## 10. Phone layout (≤ 600 px)

| Section | Layout |
|---|---|
| Tiles | Two by two; the lead tile's figure 28 px |
| Meter | Wraps at its middots, each part whole |
| Bars | The label over its bar, 44 px rows (they are buttons) |
| Table | Label, Your container and one other way; **Compare with** over it when more than two ways (4.4) |
| What moves | The words over the bar, full width; Show all 44 px |
| Map | 40 × 40 px cells, signs in the cells, the picked cell's line under it; the limit's row as a Figures row on a phone (label over box) |
| Runs | Folds 44 px; three-column tables |
| Sticky line | 44 px, `fs-sm` |
| Every control | 44 px (the 44 px Rule), but the map's cells (40 px: 7 must fit 360 px; one Tab stop, WCAG 2.5.8's 24 px met) and a link inside a sentence (A5) |

## 11. Accessibility

| Part | Rule |
|---|---|
| The answer | The headline sentence first in the month card, `sr-only`; the tiles `aria-hidden` |
| Tile 4 | A real button: "Best other way: Highland grower, RM 3,152.92 a month, RM 149.76 more than yours. Show it in the bars" |
| Bars | An `ol`; each shown way a button with its words; the bar shapes `aria-hidden` |
| Labels | Words always ("You set", "Your runs · 3 runs", "Research, medium confidence"); colour and the rule at the row's left only repeat them |
| What moves | A list; each row's words carry the range and both changes; the bars `aria-hidden`; Show all says what it does |
| Map | A table with a caption and row and column heads; each cell a button named by `cellLabel`; one Tab stop, arrows, Home, End; the picked line a polite live region; hatching and the dot repeat what the name says |
| Runs | Real tables with captions; folds as DESIGN's; the progress bar `aria-hidden` (its line says it) |
| Sticky line | `aria-hidden` (stage 1's rule) |
| Focus | Stage 1's rules for Figures; Show all and the map keep the focus where it was through a repaint (their focus keys `swing:all`, `map:<row>:<col>`) |
| Motion | None added |
| Contrast | Cell words on `critical-bg` and `good-soft` checked at 4.5 : 1 in both themes in the UI check (a token pair that fails gets its text token, `critical-text` or `good-text`) |

## 12. Files

| File | Status | Responsibility |
|---|---|---|
| `server/db.js` | Modify (Economics block) | Version 30, `economics_plans`, its indexes, trigger and rows before; three methods |
| `server/economics-runs.js` | Modify | `countedRuns` (shared), `eachRun` (7.3); `yourSales` gains `first` |
| `server/economics-plans.js` | Create | `createPlans({ db, figuresOf, events, now, log })`: the plan check on `room` events and on a read, not at start (7.1); `plansView(room, crop)` (7.4) |
| `server/economics.js` | Modify | `limit` in the view; `market.kgWeek` in `keyCheck`; makes the plans and closes them |
| `server/economics-api.js` | Modify | `GET /api/economics/plans` |
| `web/economics-defaults.js` | Modify | `market.kgWeek` in `FIGURES` (way `'market'`); "Loss after harvest"; research notes without their confidence words |
| `web/economics-model.js` | Modify | `x.life`, `ctx.life` (7.7) |
| `web/economics-swing.js` | Create | Section 5.4 |
| `web/economics-map.js` | Create | Section 6.4 |
| `web/economics-plan.js` | Create | Sections 7.5 and 7.6 |
| `web/economics-math.js` | Modify | `tilesOf`, `stickyText`, `barsOf`, `SHORT_LEFT`; the rows renamed; `fillLine` "First batch" |
| `web/economics-figures.js` | Modify | `tierOf(f)`, the label's words with the meter, `meterOf`, the research note without confidence words |
| `web/economics-charts.js` | Create | The DOM of the tiles, bars, swing, map and runs (`paintTiles`, `paintBars`, `paintSwing`, `paintMap`, `paintPlans`), each from the pure modules' words |
| `web/economics-page.js` | Modify | The sections in order, the sticky line, Compare with, the plans read, the limit's box |
| `web/styles.css` | Modify (the `.ec-` block) | Tiles, bars, labels and the row rules, the table cap, the phone table, swing, map, runs, sticky line; tokens only |
| `docs/DESIGN.md` | Modify | Economics section (every part above), Chips and counts (Source label), the State-Only Colour Rule's Economics exception, the 44 px Rule (A5, the map's cells) |
| `README.md`, `docs/PRODUCT.md` | Modify | Economics paragraph and capability rows |
| `~/.claude/task-logs/business/CONTRACT.md` | Modify (section 7) | "Economics stage 2: listens to `room` (crop) and reads Harvest's runs to save a run's plan; owns `economics_plans` (version 30); reads Costs' sale steps, Batches and the usage days per run; changes no other module's figure" |
| `docs/specs/2026-11-06-economics-design.md` | Modify (section 13) | The 44 px row: the owner accepted |
| `tests/…` | Create, modify | Section 13 |

## 13. Testing

| Test | Covers |
|---|---|
| `tests/economics-swing.test.js` | 5.6 both golden columns (every row's low, high and both changes to the sen, the order and ties, `still`); a whole figure's floor and ceiling; the clamp (a loss at 80 % swings to 90 %, not 96 %); the flush rule; a typed figure swings ±20 %; the register scaled (an equipment figure moves the write-off by its share; `life` still); labour as people (wage and minutes still); `swingText`, `stillLine` |
| `tests/economics-map.test.js` | 6.6 (every cell, every break-even, the capped rows); `capOf`; a 0 price or yield; the clamp at RM 1,000; the line off the grid; `cellText`, `cellLabel`, `lineWords` |
| `tests/economics-plan.test.js` | 7.9: the plan's and the run's month, every row's words, the one-at-a-time gaps and the two named, not measured; a run before (today's values); a missing key; `progressOf` and its three lines |
| `tests/economics-model.test.js` | `x.life` and `ctx.life`; stage 1's goldens unchanged |
| `tests/db-economics-plans.test.js` | Version 29 to 30: the table (STRICT), indexes, trigger; the rows before for every run's crops of the four (and none for another crop); `saveEconomicsPlan` never replaces; a run deleted takes its plans |
| `tests/economics-runs.test.js` | `countedRuns` as Your runs; `eachRun` on a real farm: blocks, measured loss, kg, sold and price by the sale steps, block price, kWh per block one run, pending, a partial run with a block-in day, `leftOut`, `current` and its day |
| `tests/economics-plans.test.js` | A Crop tab save on an empty room saves the plan (its figures and context) and publishes `economics`; new blocks on a done room; an open run gaining a crop; a crop not of the four; never replaced; the read check (none at start); a part not read saves nothing until it is read; the crop's own blocks; the plans view and its 404/400 |
| `tests/api-economics.test.js` | `GET /api/economics/plans`; `market.kgWeek` set and cleared; `limit` in the view (Your sales, owner, none); a worker's 403 on the new route |
| `tests/web-economics-math.test.js` | `tilesOf` 4.1's goldens (both prices, nothing sold, the same as yours); `stickyText`; `barsOf` (the order, the zero at 43.26 %, not compared rows and words); the renamed rows |
| `tests/web-economics-figures.test.js` | `tierOf` for every source; the labels' words; `meterOf`; the research note's words |
| `tests/web-economics-page.test.js` | Source checks: the sections in order, the sticky line and its observer, Compare with, the plans read and its triggers, the limit's box, the `.ec-` block (tokens only, 44 px but the map's 40 px cells, the phone table) |
| `tests/web-economics-units.test.js` | Every new line through `keepTogether` |
| Look | Section 14's UI check |

Test files use in-memory databases and servers on port 0; a look server uses a port from 19300 and a throwaway database
under `/tmp/economics-2/` seeded with made-up figures only (the repository is public: no farm's real figures in specs,
plans, tests, comments or screenshots).

## 14. The UI check

The team's audit step: after the build, an Impeccable critique and audit of the page at 1440 and 390 px, dark and light, with
a new farm (all research), a room with a planned finished run and one before stage 2, a run in progress, a sales limit that
caps the map, a loss (price RM 36.00), lion's mane (five rows of bars) and grey oyster (two ways: no Compare with). Fixes
before the final review.

## 15. Decisions (the lead's, 2026-11-12)

| # | Question | Decision | Why |
|---|---|---|---|
| 1 | The tiles' money format | The app's, to the sen ("RM 3,003.16"), not the sketches' whole RM | The One Format Rule (stage 1's decision for the headline) |
| 2 | Tile 3's payback | With the first batch (stage 1's "with the first fill") | The owner's question is when the money spent comes back, blocks included |
| 3 | Tile 4 when yours is best | It still names the best other way, "RM … less than yours" | The tile always answers "what else could I do"; the bars show the rest |
| 4 | Bars and the table in one card | Yes: bars first, the table under them | They answer the same question at two depths; a tap on a bar marks its column a few pixels below |
| 5 | The meter's scope | Your container's and the shared figures | The other ways' figures are another grower's, research by nature; counting them would make "your figures" read low forever |
| 6 | The labels' colours | Accent for typed, good for recorded, recorded in DESIGN as an exception to the State-Only Colour Rule | The owner approved the designer's direction; the exception is named so no other page copies it |
| 7 | A crop tab's blocks | The app's tier, neutral | The designer's list; the room's own count is not a measured result |
| 8 | Which figures swing | Your container's and the shared, not the room's blocks | Blocks are the room's size; every way is sized to them, so moving them is a different question (a bigger room) |
| 9 | A whole figure's ±20 % | Rounded outwards (2 flushes: 1 to 3) | Rounding to the nearest would give no swing at all for 2 flushes or a 3-day figure |
| 10 | A flush more or less | Brings its share of the yield (equal flushes) | The yield is the block's over every flush (stage 1 deferred this to stage 2); equal flushes overstate a third flush for lion's mane, said in Open 3 |
| 11 | The register's write-off in a swing | Scaled by the swung equipment's share | Money truth's equality test would make any swung equipment figure jump to the formula's write-off |
| 12 | Swing labels | The app's money format with a sign ("+RM 2,550.50") | One format; the owner's sketch rounded for the example only |
| 13 | The map's range | −60 % to +60 % around now, in 20 % steps, now in the centre | Always the neighbourhood of now; the swing's ±20 % is the next step out; research ranges differ per figure and would put now anywhere |
| 14 | The map's cells | Whole RM on a desk (the heads say RM a month), a sign on a phone; to the sen in the picked line | 49 figures to the sen do not fit; the exact figure is one tap away |
| 15 | The map's cells on a phone | 40 px, an exception in the 44 px Rule | Seven 44 px cells and their heads do not fit 360 px; one Tab stop and the 24 px minimum hold |
| 16 | The sales limit's scope | Per crop, every room (the crop's market) | Buyers buy a crop, not a room's |
| 17 | The sales limit from Your sales | The kg sold over the days since the window's first sale (at least 7), a week's worth | A crop that began selling three weeks ago is not averaged over 90 days |
| 18 | What a capped cell costs | Every cost kept, income and per-kg costs on what sells | The blocks are grown whether or not they sell; that is the warning the map must give |
| 19 | The plan table's name | `economics_plans` | Economics' tables share the prefix (`economics_figures`) |
| 20 | How a plan is triggered | The `room` crop event and a check on every plans read (none at start, §17) | Economics only listens (the contract); a hook in the Crop tab's route would change Rooms' code |
| 21 | Runs before stage 2 | A row with no figures written by the upgrade | Tells a run before from one whose plan was missed, with no clock in Settings |
| 22 | A crop added to an open run | Its plan saved then | Its blocks went in then |
| 23 | The run's block life | Its days in the room + the plan's turnaround | The run ends when the room is cleared; the turnaround after it is not the run's |
| 24 | Yield rows when the loss is not measured | Per block put in, the plan's yield × (1 − loss) beside it | Stage 1's rule: the runs' yield already counts lost blocks |
| 25 | Gaps | One at a time from the plan, the two biggest named | Plain to explain; the note says "each on its own" since they do not add up |
| 26 | Under the plan | Words, no colour | Under a plan is not a fault (the State-Only Colour Rule) |
| 27 | The plan by now | Equal flushes, a flush due on its day | The model has no flush split; the line is a guide, not a forecast |
| 28 | The plans' route | Its own (`/api/economics/plans`) | The view is read after every figure save; the runs are not needed then |
| 29 | Shrink against the plan | Not this build | Shrink per run needs data integrity's not-sold record (B12) |
| 30 | The designer's "Show research only" filter, the bars' cost toggle | Not built | Not in the owner's approved parts |
| 31 | The owner, 2026-11-12: what you can sell caps the month (closes Open 1); 2026-11-13: only when typed | The model's `sellCap` on every way: kg sold at most what you can sell a month, income and the per-kg costs (packing, transport) on what sells, every other cost kept; the tiles, sticky line, bars, table and swing use it; the profit tile's caption "Loss at what you can sell · RM 129.43 if all 228.6 kg sold" (the reader's sentence: "At what you can sell (60.0 kg a week); RM 129.43 a month if all 228.6 kg sold."); the table's kg sold says "of 228.6 kg grown"; the map's now cell is the same month (a golden test, with a limit typed and without). The runs against the plan stay uncapped (a plan's figures are its own). The cap applies only when the owner has typed a limit (`market.kgWeek` set, or typed and not yet saved); with nothing typed nothing is capped, and Your sales' week is shown as a suggestion in the limit box's note ("You've sold about 35.8 kg a week") with a one-tap **Use this** | One answer everywhere: the tiles and the map's now cell agree. A cap the owner never chose (Your sales' rate) cut the month of a farm still growing its market; the suggestion keeps the figure one tap away |
| 32 | The owner, 2026-11-12: "Set these first" (closes Open 8) | The decisions sit apart above the chart: Rent, Workers on the farm, A worker's month, Equipment written off over, and the equipment (Container or building, Cooling, Humidifier, Fans, Racks, Other equipment), every one shown (moving or not), each its name a link to its box, its value, its source label and what it moves; the chart ranks the rest. Each chart row's name is a link to its box with its source after it | They are the owner's choices, not the farm's risks; a research guess for rent ranked them above the price |
| 33 | The owner, 2026-11-12: Figures folded (closes Open 7) | The Figures card starts folded under a 44 px title toggle with the Folds' chevron; one tap opens it; the choice kept on the device (`farm.economics.figures` in localStorage); a link to a figure (Set these first, a chart row, the meter's Figures) opens the card and the figure's fold and puts the cursor on its box | The page answers first; the figures are its workbench |

## 16. Open for the owner

| # | Question | Until answered |
|---|---|---|
| 1 | Should "What you can sell" also cap the tiles, bars and table? | Answered 2026-11-12: yes (decision 31); 2026-11-13: only a limit the owner typed |
| 2 | Re-save a run's plan ("make today's figures this run's plan")? | A plan is frozen once saved |
| 3 | Equal flushes for the swing and the plan by now: give a first-flush share per crop? | Equal flushes |
| 4 | The map around now (±60 %) or over the research ranges? | Around now |
| 5 | The partial runs recorded at the harvest upgrade: give their block-in days (money truth's Open 3) | They stay out of Your runs against the plan ("2 runs left out") |
| 6 | Tile 4 tapped: scroll to the bars (now) or open the table on that way? | The bars |
| 7 | Should Figures start folded? (the critique) | Answered 2026-11-12: yes (decision 33) |
| 8 | Set the decisions apart from the risks, under "Set these first"? (the critique) | Answered 2026-11-12: yes (decision 32) |

## 17. What shipped beyond this spec

Built 2026-11-12 on `feat/economics-2`, rebased on `main` at `5803ad3` (money truth merged). The sections named are amended to
match.

| Part | What shipped |
|---|---|
| Money truth as merged (2.1) | The register's write-off in the model is the register's month for its parts plus the rest over the months, used while every register part's figure equals the register's; the swing's seam (`ctx.register.scale`) scales the register's month by its parts now ÷ its total (5.3, 7.7) |
| The upgrade (7.2) | The step is `version < 30` with no code of data integrity's; the tests that read the version expect 30; the two "still at 28" tests stamp 28 |
| The plan saved (7.1) | On the `room` crop event and on every plans read of the room; not when the service starts (it would work out every room's figures as the app comes up; a missed event is caught on the next read) |
| `eachRun` (7.3) | `days` = farm days from the start to the end (the block-in day is day 0); `current.day` the same to today; a part not read leaves that run's figure null (`batches`: the loss not measured, the block price null) |
| The plans route (7.4) | `plans[runId]` is `{ at: null, before: true }` for a run with no row at all |
| A run against its plan (7.5) | The gaps line says "… against … planned" for both gaps; the left-out line is "2 runs left out: recorded without the day their blocks went in."; a run's fold title "1 Sep – 29 Sep · RM 2,832.85 a month at its figures · RM 170.31 under the plan"; the profit row's loss in `critical-text`; the progress bar marks the plan by now |
| The sticky line (4.1) | One inline run inside the 44 px line (a flex line dropped the spaces at its pieces' edges); shown by an IntersectionObserver on the month card |
| The bars (4.2) | Each row a button marks its table column and says so; the value just past the bar's end, the track 7.5em short of the row's sides; a loss's fill at full opacity |
| Compare with (4.4) | The phone's table shows Your container and the way picked (the best other way by default, a bar's tap too) |
| The labels (4.3) | Typed "You set" with a 12 px pencil; Saving… and Not saved neutral; a research row's dots hidden with "Research, low confidence" for a reader; profit green on its soft fill darkened in light to reach 4.5 : 1 |
| The meter (4.3) | "set yours in Figures below": Figures a quiet inline button to that card's title (a link would change the route); each part kept whole with no-break spaces |
| What moves profit most (5) | Set these first (decision 32) above the chart; each row's name a link to its box with its source after it; its bar's fall at the left and rise at the right, each with the figure that gives it (the words for a reader whole on the name); with labour as people the still line leaves out the other ways' hourly cost and says the minutes a block set only the hours; a range's unit follows its high figure; the swing uses the capped month (decision 31) |
| The sales limit (6.3) | `limit.sales` is `{ kg, days, from }` with `from` the window's first sale; the limit's row is a Figures row in the map's card (`limitFigure`), saved through the figures route |
| The map (6) | The break-even is one svg line under the cells' words (a halo keeps them legible), straight between the columns' centres, held at the grid's edge with an arrow outside it where it leaves; the grid built once a shape and updated in place as figures are typed; the capped rows said ("From 300 g a block you grow more than you can sell (60.0 kg a week): those rows earn the same."); now's cell is the month the tiles show (decision 31); a phone's price heads to one place; 35 px cells under 380 px (about 34 px drawn at 360 px, the table's fixed layout sharing the seams); 84 × 46 px from 1200 px with the lines beside the grid; the picked line said on the page's polite line only when a cell is picked |
| Typing (3) | One paint a frame however fast the keys come; the tiles, bars and table at once, the swing, the map and the runs after a 150 ms pause (the audit measured a fifth of a second a key on a slow phone before) |
| The UI check (14) | An Impeccable critique (design review) and audit (detector, contrast, targets, overflow, keyboard, timing) at 1440, 390 and 360 px, dark and light, on a throwaway database of made-up figures; every finding fixed and the owner's three answers built (decisions 31–33), then checked again (no overflow at 360 or 390 px, profit green 5.9 : 1 in light, a keystroke to its painted frame about 30 ms, the detector clean) |
| The final review | A mixed run: the room's blocks (every crop's, `roomBlocks`) set the run's month as the plan saved them, the crop's its yield and loss; the plan's blocks and kg at the crop's share; the plan by now at the run's blocks. A run in and out the same day takes a day of block life. A part of the plans not read says so in the rows it feeds (`warning-text`), the month at the plan's figure. The swing scales the register only when the figures are the register's (`asRegister`, shared with the model). The map's arrows move the cursor and the Tab stop; a tap or Enter picks and paints the map alone; the centre held at the figure's limit ÷ 1.6 so the steps stay even (now: see the independent review). A plan saved tells `economics` with `plan: true`; a figure saved reads the view alone. Sales not read says so in the limit's note. `current.blocksInAt` given |
| The independent review (2026-11-13) | A crop added to an open run: the plan keeps the crop's own blocks (`context.cropBlocks`), the plan column's blocks, loss and kg come from them and the run's month is worked out at the room as the plan had it (an on-plan run read "RM 1,041.24 over the plan … Blocks put in 1,500 against 1,000"; now "The same as the plan."); a run from before plans takes its blocks from the run, not today's room. The plan check skips its save while a part is not read (its fallback figures would be frozen). The sales limit caps only when typed (decision 31): `limit.value` null unless the owner set it, Your sales' week a suggestion with **Use this**, the note "It caps Container 1's month as if it alone sold Lion's mane; the other rooms' Lion's mane is not taken off it." ("A limit caps …" when none is set); the reader's sentence adds, when the month is capped, "At what you can sell (35.8 kg a week); RM 1,326.26 a month if all 189.7 kg sold." (built with the typing, beside the tiles). The map marks Now only on a cell that is exactly now: with the centre clamped (RM 800 a kg between the RM 750 and RM 875 columns) no cell is marked, the legend's Now is hidden and a line says "Now, at RM 800.00 a kg and 250 g a block, falls between the cells: RM … a month."; the break-even at your yield from now's own month. A figure's name in Set these first and the chart is a 44 px target on a phone (12 px padding, a matching negative margin). The plans read reads Harvest's room view once and the sale steps' data once for every past run (on a made-up farm of 3 rooms: 27.6 → 12.5 ms at 20 runs a room, 96.0 → 42.6 ms at 60). The shared number formatters (Overview's `grouped`, Harvest's, Economics' `upTo`) keep one `Intl.NumberFormat` a shape instead of one a call. Measured on a made-up farm in headless Chrome, medians of three runs (before → after): at 390 px a keystroke to its painted frame 31 → 27 ms at 1× CPU and 65–82 → 55–60 ms at 4×; the swing, map and runs painted after the pause 54–58 → 18–26 ms at 1× and 119–176 → 43–53 ms at 4×; at 1440 px the keystroke 26–31 → 24–28 ms at 1× and 66–84 → 51–63 ms at 4×, the pause's paint 46–54 → 16–27 ms and 102–220 → 43–67 ms |
| Wording | The off-grid line reads "At 100 g a block it breaks even only above RM 80.00 a kg." ("… and under it …" over several rows; 6.2); a plan key the code no longer has is left out without a line (only a key the plan lacks is said, 9) |
| The version | Database 30 assumes data integrity's 29 merges first; if this branch merged first, data integrity's step would be renumbered (31), as the contract's section 2 says |


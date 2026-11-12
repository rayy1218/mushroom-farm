# Business summary: the Summary tab at #/business

Date: 2026-11-06 · Branch `feat/summary` from `integrate/business` at `a944e93` (Runs merged) · Database version 24, no step ·
Approved design: the owner, 2026-11-06 (the build order Run page → **Business summary** → Economics, 2026-11-05)

The owner chose (2026-11-06) every row marked *owner*: a Summary tab first in the Business strip; the briefcase entry always
opening it, the memory of the last tab gone; a money card for this month with last month's result under it; a "Needs you"
list, one line per to-do, each linking to where it is fixed; the runs in progress; one server read composing the modules'
own functions, the browser wording it.

## 1. Scope

| In | Out (later) |
|---|---|
| A **Summary** tab, first in the strip (Summary · Batches · Inventory · Sales · Costs · Runs), at `#/business` *owner* | Economics (built next), a month picker on the Summary, charts |
| The briefcase entry always opens the Summary; `farm.business`, `lastBusiness`, `keepBusiness` and `businessLanding` go *owner* | Any change to how the modules work out a figure |
| This month's Profit, Income and Costs as Costs' month card has them, the kg not sold, last month's result *owner* | A year's figures, a comparison with the same month last year |
| "Needs you": money owed, stock below zero, stock low, a use-by near or past, blocks ready for a room, blocks with no price *owner* (blocks being made dropped in the fix pass, section 12) | Alarms, tasks and machine faults (Today and the Overview hold them), a purchase with no unit cost |
| The runs in progress with their days, kg picked and profit so far, each to its run page *owner* | Ended runs (the Runs tab lists them) |
| `GET /api/business/summary` from a new `server/business.js` composing the modules' functions *owner* | A table, a stored summary, an event of its own |

## 2. Placement and addresses (`web/route.js`, `web/app.js`)

| Part | Design |
|---|---|
| Tab | `BUSINESS_TABS[0]` = `{ key: 'summary', label: 'Summary', hash: '#/business' }`; the strip draws it first (`web/business-tabs.js` unchanged but for its header comment) |
| Route | `parseRoute('#/business')` (and `#/business/`, tidied) → `{ name: 'summary' }`; `canonicalHash({ name: 'summary' })` → `'#/business'`. The route was `{ name: 'business' }`, a redirect only |
| Tab of a page | `BUSINESS_PAGES` gains `['summary', 'summary']`: `businessTabOf` and `businessStrip` give `'summary'` for `#/business`, so the strip shows, the top bar's Business is current (`aria-current="true"`) and the view takes `.bz-view` |
| Landing *owner* | No memory: `app.js` loses `BUSINESS_KEY` (`'farm.business'`), `lastBusiness`, `keepBusiness`, the redirect of `#/business` and `if (tab) keepBusiness(tab);`; `route.js` loses `businessLanding`. A browser's old `farm.business` value is left alone (never read again) |
| Old addresses | `#/business/batches`, `/inventory`, `/sales`, `/costs`, `/runs` and every page under them work as before |
| Mount | `app.js`: `: route.name === 'summary' ? summary.mount(page, {}) // ---- Summary ----` into the `.bz-page` box under the strip |

## 3. Composition per source (`server/business.js`)

`createBusiness({ costs, sales, inventory, batches, runs, zone, log })` → `{ summary() }`. Pure composition over each module's
own service functions; no state, no HTTP. Each part is read in its own `try`: a throw is logged with its part named
(`log("Business summary: couldn't read sales:", err)`) and names its part in `errors`; the other parts still come. `zone`
(default `localZone`) gives a delivery's farm month for the one unpriced batch (section 4.1).

| Part (errors key) | Function read | Used for |
|---|---|---|
| `costs` | `costs.monthView()` (this month, the one behind `GET /api/costs/month`) | `month` (its `month`, `today`, `pending`, `tiles`, `repeating`); `lastMonth` from its `last12` entry for the month before; the `unpriced` need from its `notes` of kind `'unpriced-batch'` |
| `sales` | `sales.view({ days: 7 }).owed` (every unpaid delivery, whatever the period) | The `owed` need |
| `inventory` | `inventory.list().items` (archived items left out) | The `below-zero`, `low` and `use-by` needs |
| `batches` | `batches.list().batches` | The `blocks` need (status `waiting`); the `unpriced` need's one batch |
| `runs` | `runs.list().runs` filtered to `endedAt === null` | `runs`, in Runs' order (newest started first) |

`server/business-api.js` makes the services as `server/runs-api.js` does: its own `createCosts({ db, now, zone })` (its warm
publishes `costs`), `createSales({ db, now })`, `createInventory({ db, now })` and `createRuns({ db, harvests, batches, sales,
costs })`, with `api.js`'s own `harvests` and `batches`.

## 4. The reply (`GET /api/business/summary`)

| Field | Shape | Rule |
|---|---|---|
| `month` | `{ month: 'YYYY-MM', today, pending, tiles, repeating }` or null | Costs' `monthView` as it is: `tiles` = `{ income, costs, profit, costPerKg, profitPerKg, kgHarvested, kgSold, unsold: { kg, value } \| null, incomplete }` (costs, profit and the per-kg figures null while pending); `today` (the farm's date) and `repeating` (the monthly items) for Costs' still-to-come line. Null when Costs could not be read |
| `lastMonth` | `{ month, income, costs, profit, pending }` or null | `last12`'s month before `month`: the same figures Costs' 12-month chart and that month's tiles give. Null when that month is before the kept usage days (not in `last12`) or Costs could not be read |
| `needs` | `[need]` | In the order of section 4.1; `[]` when nothing needs the owner. A part not read adds none |
| `runs` | `[row]` or null | Runs' list rows (spec 2026-11-05-runs-design.md 4.1: `id, roomId, roomName, crops, partial, startedAt, endedAt, kg, perBlock, income, costs, profit, profitPerKg, pending, incomplete`) with `endedAt` null. Null when Runs could not be read |
| `errors` | `{ [part]: 'Something went wrong' }` | Always there, `{}` when every part was read. The key is the part of section 3; the words are the API's own for a server fault (the log has the cause) |

### 4.1 The needs, in order

| # | `kind` | Fields | When | `href` |
|---|---|---|---|---|
| 1 | `owed` | `total` (RM), `count` (deliveries), `oldestAt` (ms), `oldestBuyer` (the oldest unpaid sale's buyer), `buyers` (names, most owed first) | Sales' `owed.count` over 0 | `#/business/sales` |
| 2 | `below-zero` | `items: [{ id, name, qty, unit }]` (Inventory's order: kind, then name) | An item's `qty` under 0 | One item: `#/business/inventory/<id>`; several: `#/business/inventory` |
| 3 | `low` | `items: [{ id, name, qty, unit, reorderAt }]` | An item `low` with `qty` 0 or more (one below zero is in #2 only) | As #2 |
| 4 | `use-by` | `id, name, unit, useBy: { date, state, qty }` (Inventory's `useBy`), one need per item | An item's `useBy.state` `'expired'` or `'soon'` (Inventory's 7 days); the expired first, then the earliest day | `#/business/inventory/<id>` |
| 5 | `blocks` | `blocks`, `crops` (good blocks ready for a room; crop keys in first-seen order, the list newest received first) | A batch with status `waiting` and `good` over 0 (blocks being made are not a to-do: their steps are on Batches) | `#/business/batches` |
| 6 | `unpriced` | `notes: [{ text, runId }]` (Costs' own note words), `batchId` (or null) | This month's Costs notes of kind `'unpriced-batch'`: one need for all runs. `batchId` when there is one note and Batches' list has exactly one bought batch with no price received this farm month | `batchId`: `#/business/batches/<id>`; else `#/business/batches` |

## 5. API (`server/business-api.js`, wired in `server/api.js`)

| Route | Reply |
|---|---|
| `GET /api/business/summary` | Section 4, 200 |
| Any other method | 404 "Not found" |
| `GET /api/business`, `/api/business/summary/…` | 404 "Not found" (the API's own) |
| Events | None of its own (`'business'` is not an event). Its own Costs service's warm, when done, publishes `costs` `{}`, so a page waiting for the energy asks again |

`createBusinessRoutes({ db, events, harvests, batches, now, zone, log })` → `async (req, res, path, { send, HttpError })`
answering true for its path; `close()` stops its Costs warms and its telling. `server/api.js` gets four marked lines
(`// ---- Summary ----`): the import, `createBusinessRoutes({ db, events, harvests, batches })` after the Runs routes, the
route call after Runs', and `businessRoutes.close()` in `api.close`.

## 6. The page (`web/business-page.js` `mount(container)`, `#/business`)

| Part | Design |
|---|---|
| Head | "Summary", under it "This month's money, what needs you and the runs under way." Document title "Business summary · Mushroom farm" |
| Money card (top, full width) | Title "November so far" (the reply's month's name; "This month so far" when Costs was not read), head link **Costs** (`#/business/costs`). Costs' month tiles Profit, Income, Costs (`monthTiles(month).slice(0, 3)`, `us-tiles hv-tiles co-tiles`: Profit in display size, its own row on a phone, Income and Costs two a row there); from 1100 px two more, Not sold and last month (`.sm-wide`). Under the tiles, muted `fs-sm` lines: Costs' still-to-come line first, then below 1100 px the kg not sold and last month's result (`.sm-narrow`; section 6.1) |
| Needs you | Title "Needs you · N" (N the needs; "Needs you" with none). One line per need (section 6.2), the worst first, the whole line its link to the need's `href` (`.sm-need-link`, 14 px `fs-md` ink, underlined on hover and focus only) with an 8 px state dot, hairlines between; a need part not read in its needs' place; or the empty words |
| Runs in progress | Title "Runs in progress", head link **Runs** (`#/business/runs`). A row per open run (section 6.3) |
| Layout | Desk (from 900 px): Money across the top, then Needs you and Runs in progress side by side, two equal columns (`grid-template-areas: "money money" "needs runs"`), each card its own height (`align-items: start`). Below 900 px one column in that order |
| Phone taps (≤ 600 px) | Every link and Retry reaches 44 px: a need's line has 12 px over and under; the card head links and a run's container are `inline-flex` at 44 px with no padding over their line (as the run page's container links); the rooms link takes 14 px block padding; Retry is `bz-quiet` (44 px on a phone) |
| Shared look | `.bz-view` (set by `app.js`): 14 px card titles; both themes from the tokens |

### 6.1 The money card's words

| Case | Words |
|---|---|
| Title | "November so far"; "This month so far" without `month` |
| Tiles | Costs' own: "Profit" "RM 357.18" (a loss "−RM 340.00" in the critical text token with "Loss"); "Income" with "10.0 kg sold" or "Nothing sold"; "Costs" with "Some costs have no price" when `incomplete`. Pending: Profit and Costs "—" with "working out" |
| Still to come | Costs' `toComeNote` words, the first line: "Still to come this month: RM 1,500.00 (rent)"; none once every monthly item is charged |
| Not sold | Tile (≥ 1100 px): "Not sold" "124.4 kg" "about RM 4,354.00 at your expected prices" (no line without an expected price). Line (below): "124.4 kg not sold yet, about RM 4,354.00 at your expected prices"; "12.0 kg not sold yet" when `unsold.value` is null. Neither when `unsold` is null |
| Last month | Tile (≥ 1100 px): "October" with "RM 1,200.00" "Profit"; "−RM 13,412.23" "Loss" in the critical text token; "RM 0.00" "Nothing recorded"; "—" "working out". Line (below): "October: RM 1,200.00 profit"; "October: −RM 13,412.23 loss" (only the figure in the critical text token); "October: nothing recorded"; "October: working out"; "December 2025: …" when its year is not this month's. Neither without `lastMonth` |
| Costs not read | The card holds only "Couldn't read Costs just now · trying again every minute" in the warning text tone and Retry |

### 6.2 Needs you: a line each

The lines are ranked: red (`critical`) first, then amber (`warning`), then the rest; within a tone, the order of section
4.1 (a part not read in its needs' place). The dot's colour is the tone's token (`--critical`, `--warning`); the words say
the state, so the colour is never the only sign.

| # | Kind | Words (exact) | Tone | Link |
|---|---|---|---|---|
| 1 | `owed` | "RM 604.00 owed by Kedai Ah Seng and Pasar Tani · oldest 50 days (Kedai Ah Seng)" (the oldest sale's buyer when more than one owes); three or more buyers: "… owed by A, B and 2 more · …"; the age is Sales' `ageText` ("today", "1 day", "12 days") | Amber when the oldest is over 30 days, else none | Sales |
| 2 | `below-zero` | One item: "Below zero: Sawdust −360.50 kg · a purchase is missing"; several: "Below zero: Grain spawn, Plastic bags, Gypsum and 2 more · purchases are missing" (up to 3 names) | Red | The item's page; Inventory for several |
| 3 | `low` | One item: "Low stock: Grow bags 120 pcs, reorder at 200 pcs"; several: "Low stock: Bags and Gloves", "Low stock: A, B, C and 1 more" | Amber | As #2 |
| 4 | `use-by` | "Lime · 10.00 kg expired 4 Nov"; "Bleach · 5.00 L use by 9 Nov" (Inventory's `useByLine`) | Red expired, amber soon (Inventory's pills) | The item's page |
| 5 | `blocks` | "400 Pink oyster blocks ready for a room"; several crops: "1,200 blocks ready for a room" (Batches' `blocksText`); one block: "1 Grey oyster block ready for a room" | None | Batches |
| 6 | `unpriced` | One note: Costs' words and "· this month's costs leave them out" ("Blocks received 5 Nov have no price · this month's costs leave them out", "Room 1’s blocks of 4 Nov have no price · …"); several: "Blocks of 3 deliveries have no price · this month's costs leave them out" | Amber (Costs' amber note) | The batch's page when `batchId`; else Batches |
| — | none | "Nothing needs you right now." (only when Sales, Inventory, Batches and Costs were all read) | — | — |
| — | a part not read | "Couldn't check Sales just now · trying again every minute" (Inventory, Batches, Costs alike) in the warning text tone with a quiet Retry, in its needs' place among the amber lines | Amber | — |
| — | an unknown kind | Left out (a newer server; an inherited name such as `toString` too) | — | — |

### 6.3 Runs in progress: a row each

| Part | Words |
|---|---|
| Head | The container, weight 600, as the run page's link (`.co-link`, named "Run page, Container 1, since 4 Nov", Runs' `runPageLabel`, its visible words in it) with the main crop's 24 px picture (`aria-hidden`) ("A deleted room" without a name); at the right the money so far as the run page's Profit tile has it: "Profit so far RM 357.18"; a loss "Profit so far −RM 1,005.97" with only the figure in the critical text token and "Loss" under it (as the Runs list and the run page); "Profit so far —" with "working out" under it while pending; "Profit so far —" without Costs' view; "Some costs have no price" under it when `incomplete` ("Loss · Some costs have no price" with a loss) |
| Line | Muted `fs-sm`: "600 Grey oyster · since 4 Nov · day 3 · 20.0 kg picked" (Runs' crops and days; the first day day 1; "recorded since 4 Nov" with no day for a run under way at the harvest upgrade; "nothing picked yet" at 0 kg) |
| None | "No runs in progress. A run starts when a container gets its blocks on its Crop tab." and under it the link "Rooms, to open a container" (`#/overview`, which holds the rooms) |
| Runs not read | "Couldn't read Runs just now · trying again every minute" in the warning text tone and Retry |

### 6.4 States

| State | Page |
|---|---|
| First read under way | The head only (the cards hidden) |
| No answer, first read | The banner "Couldn't reach the farm server" with Retry; the cards stay hidden |
| No answer later | The banner over the last answer, which stays |
| An older farm app (404 "Not found") | `OUTDATED` in the banner, no more reads |
| A part not read | Section 6.1, 6.2, 6.3: only that part says so, with Retry; a part newly not read is said once in a polite live line ("Couldn't read Sales just now."). Retry focused and its part read this time: the cursor goes to the page's title |
| Energy still worked out | Costs' tiles "—" with "working out"; a run's money "working out"; the warm's `costs` event reloads the page |

## 7. Numbers (the One Format Rule)

| Figure | Formatter | From |
|---|---|---|
| RM, a loss with "−", owed, the unsold value, last month | `moneyText` | `web/costs-math.js` |
| The month tiles | `monthTiles` | `web/costs-math.js` |
| A month's name | `monthTitle`, `monthName` ("November", exported for the Summary in the fix pass) | `web/costs-math.js` (Calendar's) |
| The monthly items still to come | `toComeNote` | `web/costs-math.js` |
| kg ("124.4 kg", "20.0 kg picked") | `kgText` | `web/harvest-math.js` |
| A stock qty ("−360.50 kg", "120 pcs"), a use-by line | `qtyText`, `useByLine` | `web/inventory-math.js` |
| Blocks of one crop ("400 Pink oyster blocks"), of several ("1,200 blocks") | `countBlocks`, `blocksText` | `web/batches-math.js` |
| The oldest unpaid sale's age | `ageText` | `web/sales-math.js` |
| A run's crops, days and its link's name | `cropsText`, `runDates`, `runPageLabel` | `web/runs-math.js` |
| The main crop | `mainCrop` | `web/room-card-math.js` |
| Tiles | `tileNodes` | `web/harvest-card.js` |

The page's own words live in `web/business-math.js`: the title, the not-sold and last-month lines, the needs' lines, the
failure and empty words, the runs' rows.

## 8. Live updates

| Trigger | The page |
|---|---|
| `batches`, `inventory`, `sales`, `costs`, `harvest` events (those in `EVENT_TYPES`) | Read again (throttled, `createThrottle`) |
| `room` with `part` `crop` or `room` | Read again (a run starts or ends; a room's name) |
| The stream back up | Read again |
| Timer | 60 s (`fallbackMs`: slower while the stream is up) |
| A stale answer | Dropped (a mount token and a read sequence) |
| A repaint | Keeps the cursor on the same line by its focus key (a need's kind, `use-by:<id>`, `run:<id>`, `retry:<part>`; the head links by address and words, as the run page's); on the page's title when that line is gone; a reply equal to the last one painted (and the same farm day) paints nothing |

`web/live.js` needs no change: every event above is in `EVENT_TYPES`.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| A new farm | Profit, Income and Costs RM 0.00; no not-sold line; "October: nothing recorded"; "Nothing needs you right now."; "No runs in progress. …" with Rooms |
| The first month kept (no month before it in `last12`) | No last-month line |
| An item below zero with a reorder level | Its below-zero line only (never also low) |
| An archived item | Not read (Inventory's list leaves it out) |
| A batch whose every block was lost | Not waiting (no good block) |
| A waiting batch with no price received this month | Two lines: blocks ready for a room (#5) and no price (#6, to that batch's page) |
| Blocks being made | No line (Batches shows their steps); they are a need once ready for a room |
| An item at 0 at or under its reorder level | Low (#3), not below zero |
| An unpriced batch received in an earlier month | Not in this month's notes, so no line; its run's money says "Some costs have no price" |
| A mixed run | Its crops in the line ("300 Grey oyster · 100 Lion's mane"), the main crop's picture |
| Costs still working out the energy | Section 6.4 |
| One module throws | Section 6.4; the reply is still 200 |
| Past midnight | The next paint words "day N" and "oldest N days" again (the farm day is in the paint key) |

## 10. Files

| File | Status | Responsibility |
|---|---|---|
| `server/business.js` | Create | `createBusiness`, `PARTS`, `PART_FAILED`: the reply of section 4 |
| `server/business-api.js` | Create | `createBusinessRoutes` |
| `server/api.js` | Modify (four marked lines) | Wire the route, close it |
| `web/route.js` | Modify (Business block, marked) | The Summary tab first, the `summary` route, `businessLanding` gone |
| `web/app.js` | Modify | The landing memory gone; mount the page (marked) |
| `web/business-tabs.js` | Modify (comment) | Six tabs |
| `web/business-math.js` | Create | The page's pure parts |
| `web/business-page.js` | Create | `mount` |
| `web/styles.css` | Modify (own block at the end) | `/* ---- Summary … ---- */` … `/* ---- end Summary ---- */`, `.sm-` only, tokens only |
| `DESIGN.md`, `README.md`, `PRODUCT.md` | Modify | A Summary section, paragraph and capability row; the Business Landing and Tab strip rows; six pages |
| `~/.claude/task-logs/business/CONTRACT.md` | Modify (section 7) | A row for the new read |
| `tests/web-route.test.js`, `tests/web-runs-route.test.js`, `tests/web-costs-route.test.js`, `tests/web-shell.test.js` | Modify | `#/business` is `summary`; six tabs; no landing memory |

## 11. Testing

| Test | Covers |
|---|---|
| `tests/business.test.js` | The real Costs, Sales, Inventory, Batches and Runs on one farm: the reply's keys; the month equal to Costs' `monthView`; last month equal to Costs' view of that month; every need kind in its order with its `href` (one item or delivery to its page, several to the list); the oldest sale's buyer; a use-by tie by day; an archived item; a low item at 0; below zero not also low; lost blocks summed and crops in order; a lost batch not waiting; blocks being made not a need; the open runs only; a new farm; pending; one module failing (stand-ins: only its part goes, logged with its part); every module failing |
| `tests/api-business.test.js` | The route's reply keys, no other method, other paths 404; a cold month pending, the `costs` event after the warm, the month whole |
| `tests/web-business-route.test.js` | `#/business` the `summary` route and first tab, its strip; no `businessLanding`; the other tabs' addresses |
| `tests/web-route.test.js`, `tests/web-runs-route.test.js`, `tests/web-costs-route.test.js` | Updated: `summary`, six tabs, no landing test |
| `tests/web-shell.test.js` | No `farm.business`, `businessLanding`, `lastBusiness`, `keepBusiness` in `app.js` |
| `tests/web-business-math.test.js` | Title, tiles (a loss, pending), still to come, not sold and last month as lines and tiles (each case), every need's line, tone and rank (one and several, owed at 30 and 31 days, an unknown or inherited kind), a part not read in its place, the title's count, the empty words, the runs' rows (loss, pending, no view, incomplete, partial, day 1, nothing picked) |
| `tests/web-business-page.test.js` | For real: the focus kept by key over a repaint and moved to the title when its line goes (a fake container); the reads (a stale answer dropped, the timer, an older app stopping them, a gone page) with a stubbed read and timer. Source checks: the mount, the events, the cards' order and links, the failure lines and Retry, the `.sm-` block (tokens only, every rule inside a media block read, the grid, five tiles from 1100 px, 44 px taps) |
| `tests/web-shell.test.js` | The top bar's Business current as `"true"` styled; the strip's edge fade (`data-more`) |
| Look | The UI/UX audit after the build: 1440, 1024 and 390 px, both themes; after the fix pass 1440, 1024, 390 and 360 px, both themes, an empty farm and a Sales failure |

Test files use in-memory databases and servers on port 0; a look server uses port 19160 and a throwaway database under
`/tmp/summary/`.

## 12. Decisions beyond the design

| Decision | Why |
|---|---|
| Last month from `monthView`'s `last12`, not a second `monthView({ month })` | One Costs read; `last12` is `figs(month)`, the same figures as that month's tiles (a test holds it) |
| The route is named `summary` (it was `business`, a redirect) | The tab's key, the route's name and the strip's `data-tab` say the same thing |
| `errors` always present, `{}` when none; its words the API's 500 words | A stable shape for the page; the cause goes to the log, as `api.js` does for a 500 |
| Sales' owed through `sales.view({ days: 7 }).owed` | Sales has no owed-only function; its owed is all-time whatever the period, and 7 days is its shortest read |
| Below zero excludes nothing but archived items; low excludes items below zero | One line per fact: a negative stock is the bigger problem and already names the item |
| ~~"Run page" as the run's link~~ The container's name is the run page's link (fix pass A9), still named "Run page, Container 1, since 4 Nov" | One link per row, the biggest target; the visible words stay in the accessible name |
| ~~No colour on the needs' lines~~ A state dot per line, the worst first (fix pass A2; reverses the first decision, owner may overrule) | DESIGN.md spends colour on state: below zero and expired are faults, low, use-by soon, owed over 30 days and a price left out are warnings, the colours Inventory's pills and Costs' notes already give them. A list in fixed module order buried the fault under the money owed |
| Blocks being made dropped from Needs you (fix pass A2) | A status, not a to-do: Batches shows each step; the blocks become a need once ready for a room |
| The money headline stays this month's profit so far, with Costs' still-to-come line first under the tiles (fix pass A1, owner may overrule) | The profit to today is Costs' own figure; the rent still to charge is what makes it look better than the month will end, so it sits right under it in Costs' words |
| Not sold and last month as tiles 4 and 5 from 1100 px, lines below (fix pass A7) | A wide desk's money card was half empty; on a phone three tiles keep Profit alone, then two a row |
| One loss form: the figure keeps its minus, only it in the critical text token, the word "Loss" beside it (fix pass A6) | As Costs' month card, the Runs list and the run page; "Loss so far RM …" (no minus) was the Summary's alone. The Runs list and run page already had this form: unchanged |
| One item or one delivery named: its own page (fix pass A3) | The owner lands on what to fix; the delivery's batch is found in Batches' list (a bought batch, no price, received this farm month), since Costs' note carries no batch id; a split delivery or any doubt: Batches' list |
| A part not read is a warning line in its place with Retry, said once to a screen reader (fix pass A4) | It may hide a need; a muted line after the list read as nothing wrong |
| The read stays one composition of the modules' own reads (review R8) | Timed on a seeded year (4 rooms, 33 runs, 998 harvests, 335 sales, 20 items): about 48 ms a read, of it Runs' list 28 ms and Costs' month 15 ms. At a read a minute and on events (throttled), not worth a second Runs read for open runs only |
| The Runs card listens to `room` crop and room events too | A run starts or ends with the crops; the row names the room (as the run page) |
| `web/live.js` unchanged | Every event the page needs is already in `EVENT_TYPES` |
| The not-sold figure is a line, not a fourth tile | Three tiles keep the phone's rows even (Profit alone, then two); the design put it after the tiles |
| A browser's old `farm.business` value is not removed | Nothing reads it; removing it would be code kept for one browser's leftover |

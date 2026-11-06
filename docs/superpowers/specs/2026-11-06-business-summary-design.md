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
| "Needs you": money owed, stock below zero, stock low, a use-by near or past, blocks waiting or being made, blocks with no price *owner* | Alarms, tasks and machine faults (Today and the Overview hold them), a purchase with no unit cost |
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

`createBusiness({ costs, sales, inventory, batches, runs, log })` → `{ summary() }`. Pure composition over each module's own
service functions; no state, no HTTP. Each part is read in its own `try`: a throw is logged (`log(err)`) and names its part
in `errors`; the other parts still come.

| Part (errors key) | Function read | Used for |
|---|---|---|
| `costs` | `costs.monthView()` (this month, the one behind `GET /api/costs/month`) | `month` (its `month`, `pending`, `tiles`); `lastMonth` from its `last12` entry for the month before; the `unpriced` need from its `notes` of kind `'unpriced-batch'` |
| `sales` | `sales.view({ days: 7 }).owed` (every unpaid delivery, whatever the period) | The `owed` need |
| `inventory` | `inventory.list().items` (archived items left out) | The `below-zero`, `low` and `use-by` needs |
| `batches` | `batches.list().batches` | The `blocks` need (status `waiting` and `making`) |
| `runs` | `runs.list().runs` filtered to `endedAt === null` | `runs`, in Runs' order (newest started first) |

`server/business-api.js` makes the services as `server/runs-api.js` does: its own `createCosts({ db, now, zone })` (its warm
publishes `costs`), `createSales({ db, now })`, `createInventory({ db, now })` and `createRuns({ db, harvests, batches, sales,
costs })`, with `api.js`'s own `harvests` and `batches`.

## 4. The reply (`GET /api/business/summary`)

| Field | Shape | Rule |
|---|---|---|
| `month` | `{ month: 'YYYY-MM', pending, tiles }` or null | Costs' `monthView` as it is: `tiles` = `{ income, costs, profit, costPerKg, profitPerKg, kgHarvested, kgSold, unsold: { kg, value } \| null, incomplete }` (costs, profit and the per-kg figures null while pending). Null when Costs could not be read |
| `lastMonth` | `{ month, income, costs, profit, pending }` or null | `last12`'s month before `month`: the same figures Costs' 12-month chart and that month's tiles give. Null when that month is before the kept usage days (not in `last12`) or Costs could not be read |
| `needs` | `[need]` | In the order of section 4.1; `[]` when nothing needs the owner. A part not read adds none |
| `runs` | `[row]` or null | Runs' list rows (spec 2026-11-05-runs-design.md 4.1: `id, roomId, roomName, crops, partial, startedAt, endedAt, kg, perBlock, income, costs, profit, profitPerKg, pending, incomplete`) with `endedAt` null. Null when Runs could not be read |
| `errors` | `{ [part]: 'Something went wrong' }` | Always there, `{}` when every part was read. The key is the part of section 3; the words are the API's own for a server fault (the log has the cause) |

### 4.1 The needs, in order

| # | `kind` | Fields | When | `href` |
|---|---|---|---|---|
| 1 | `owed` | `total` (RM), `count` (deliveries), `oldestAt` (ms), `buyers` (names, most owed first) | Sales' `owed.count` over 0 | `#/business/sales` |
| 2 | `below-zero` | `items: [{ id, name, qty, unit }]` (Inventory's order: kind, then name) | An item's `qty` under 0 | `#/business/inventory` |
| 3 | `low` | `items: [{ id, name, qty, unit, reorderAt }]` | An item `low` with `qty` 0 or more (one below zero is in #2 only) | `#/business/inventory` |
| 4 | `use-by` | `id, name, unit, useBy: { date, state, qty }` (Inventory's `useBy`), one need per item | An item's `useBy.state` `'expired'` or `'soon'` (Inventory's 7 days); the expired first, then the earliest day | `#/business/inventory/<id>` |
| 5 | `blocks` | `waiting: { blocks, crops }`, `making: { blocks, crops }` (good blocks; crop keys in first-seen order) | A batch with status `waiting` or `making` and `good` over 0 | `#/business/batches` |
| 6 | `unpriced` | `notes: [{ text, runId }]` (Costs' own note words) | This month's Costs notes of kind `'unpriced-batch'`: one need for all runs | `#/business/batches` |

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
| Money card (top, full width) | Title "November so far" (the reply's month's name; "This month so far" when Costs was not read), head link **Costs** (`#/business/costs`). Costs' month tiles Profit, Income, Costs (`monthTiles(month).slice(0, 3)`, `us-tiles hv-tiles co-tiles`: Profit in display size, its own row on a phone, Income and Costs two a row there). Under the tiles, muted `fs-sm` lines: the kg not sold, then last month's result (section 6.1) |
| Needs you | Title "Needs you". One line per need (section 6.2), each line its own `.co-link` to the need's `href`, hairlines between; then a muted line per need part not read; or the empty words |
| Runs in progress | Title "Runs in progress", head link **Runs** (`#/business/runs`). A row per open run (section 6.3) |
| Layout | Desk (from 900 px): Money across the top, then Needs you and Runs in progress side by side, two equal columns (`grid-template-areas: "money money" "needs runs"`), each card its own height (`align-items: start`). Below 900 px one column in that order |
| Phone taps (≤ 600 px) | Every `.co-link` on the page reaches 44 px: a need's line is a block with 12 px over and under; the card head links and Run page take 14 px block padding over their line, as the run page's |
| Shared look | `.bz-view` (set by `app.js`): 14 px card titles; both themes from the tokens |

### 6.1 The money card's words

| Case | Words |
|---|---|
| Title | "November so far"; "This month so far" without `month` |
| Tiles | Costs' own: "Profit" "RM 357.18" (a loss "−RM 340.00" in the critical text token with "Loss"); "Income" with "10.0 kg sold" or "Nothing sold"; "Costs" with "Some costs have no price" when `incomplete`. Pending: Profit and Costs "—" with "working out" |
| Not sold | "140.6 kg not sold yet, about RM 4,921.35 at your expected prices"; "12.0 kg not sold yet" when a picked crop has no expected price (`unsold.value` null); no line when `unsold` is null |
| Last month | "October: profit RM 1,200.00"; "October: loss RM 13,412.23"; "October: nothing recorded" (income and costs 0); "October: working out" (pending); "December 2025: …" when its year is not this month's; no line without `lastMonth` |
| Costs not read | The card holds only "Couldn't read Costs just now." |

### 6.2 Needs you: a line each

| # | Kind | Words (exact) | Link |
|---|---|---|---|
| 1 | `owed` | "RM 604.00 owed by Kedai Ah Seng and Pasar Tani · oldest 12 days"; three or more buyers: "… owed by A, B and 2 more · …"; the age is Sales' `ageText` ("today", "1 day", "12 days") | Sales |
| 2 | `below-zero` | One item: "Below zero: Sawdust −430.60 kg · a purchase is missing"; several: "Below zero: Grain spawn, Plastic bags, Gypsum and 2 more · purchases are missing" (up to 3 names) | Inventory |
| 3 | `low` | One item: "Low stock: Grow bags 120 pcs, reorder at 200 pcs"; several: "Low stock: Bags and Gloves", "Low stock: A, B, C and 1 more" | Inventory |
| 4 | `use-by` | "Lime · 10.00 kg expired 4 Nov"; "Bleach · 5.00 L use by 9 Nov" (Inventory's `useByLine`) | The item's page |
| 5 | `blocks` | "400 Pink oyster blocks ready for a room · 100 Grey oyster blocks being made"; one part alone when the other is 0; several crops: "1,200 blocks ready for a room"; one block: "1 Grey oyster block being made" | Batches |
| 6 | `unpriced` | One note: Costs' words and "· this month's costs leave them out" ("Blocks received 5 Nov have no price · this month's costs leave them out", "Room 1’s blocks of 4 Nov have no price · …"); several: "Blocks of 3 deliveries have no price · this month's costs leave them out" | Batches |
| — | none | "Nothing needs you right now." (only when Sales, Inventory, Batches and Costs were all read) | — |
| — | a part not read | "Couldn't check Sales just now." (Inventory, Batches, Costs alike), muted, in that order, after the lines | — |
| — | an unknown kind | Left out (a newer server) | — |

### 6.3 Runs in progress: a row each

| Part | Words |
|---|---|
| Head | The main crop's 24 px picture (`aria-hidden`) and the container in weight 600 ("Container 1"; "A deleted room" without a name); at the right the money so far: "Profit so far RM 357.18"; a loss "Loss so far RM 1,005.97", the word saying it and only the figure in the critical text token (Harvest's profit line's words); "Profit so far —" with "working out" under it while pending; "Profit so far —" without Costs' view; "Some costs have no price" under it when `incomplete` |
| Line | Muted `fs-sm`: "600 Grey oyster · since 4 Nov · day 3 · 20.0 kg picked · Run page" (Runs' crops and days; the first day day 1; "recorded since 4 Nov" with no day for a run under way at the harvest upgrade); "Run page" a `.co-link` named for its run, "Run page, Container 1, since 4 Nov" (Runs' `runPageLabel`) |
| None | "No runs in progress. A run starts when a container gets its blocks on its Crop tab." and under it the link "Rooms" (`#/overview`, which holds the rooms) |
| Runs not read | "Couldn't read Runs just now." |

### 6.4 States

| State | Page |
|---|---|
| First read under way | The head only (the cards hidden) |
| No answer, first read | The banner "Couldn't reach the farm server" with Retry; the cards stay hidden |
| No answer later | The banner over the last answer, which stays |
| An older farm app (404 "Not found") | `OUTDATED` in the banner, no more reads |
| A part not read | Section 6.1, 6.2, 6.3: only that part says so |
| Energy still worked out | Costs' tiles "—" with "working out"; a run's money "working out"; the warm's `costs` event reloads the page |

## 7. Numbers (the One Format Rule)

| Figure | Formatter | From |
|---|---|---|
| RM, a loss with "−", owed, the unsold value, last month | `moneyText` | `web/costs-math.js` |
| The month tiles | `monthTiles` | `web/costs-math.js` |
| A month's name | `monthTitle` | `web/costs-math.js` (Calendar's) |
| kg ("140.6 kg", "20.0 kg picked") | `kgText` | `web/harvest-math.js` |
| A stock qty ("−430.60 kg", "120 pcs"), a use-by line | `qtyText`, `useByLine` | `web/inventory-math.js` |
| Blocks of one crop ("400 Pink oyster blocks") | `countBlocks` | `web/batches-math.js` |
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
| A repaint | Keeps the cursor on the same link (its address and words); a reply equal to the last one painted (and the same farm day) paints nothing |

`web/live.js` needs no change: every event above is in `EVENT_TYPES`.

## 9. Edge cases

| Case | Behaviour |
|---|---|
| A new farm | Profit, Income and Costs RM 0.00; no not-sold line; "October: nothing recorded"; "Nothing needs you right now."; "No runs in progress. …" with Rooms |
| The first month kept (no month before it in `last12`) | No last-month line |
| An item below zero with a reorder level | Its below-zero line only (never also low) |
| An archived item | Not read (Inventory's list leaves it out) |
| A batch whose every block was lost | Not waiting (no good block) |
| A waiting batch with no price received this month | Two lines: blocks ready for a room (#5) and no price (#6) |
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
| `tests/business.test.js` | The real Costs, Sales, Inventory, Batches and Runs on one farm: the reply's keys; the month equal to Costs' `monthView`; last month equal to Costs' view of that month; every need kind in its order with its `href`; below zero not also low; a lost batch not waiting; the open runs only; a new farm; pending; one module failing (stand-ins: only its part goes, logged); every module failing |
| `tests/api-business.test.js` | The route's reply keys, no other method, other paths 404; a cold month pending, the `costs` event after the warm, the month whole |
| `tests/web-business-route.test.js` | `#/business` the `summary` route and first tab, its strip; no `businessLanding`; the other tabs' addresses |
| `tests/web-route.test.js`, `tests/web-runs-route.test.js`, `tests/web-costs-route.test.js` | Updated: `summary`, six tabs, no landing test |
| `tests/web-shell.test.js` | No `farm.business`, `businessLanding`, `lastBusiness`, `keepBusiness` in `app.js` |
| `tests/web-business-math.test.js` | Title, tiles (a loss, pending), not sold, last month (each case), every need's line (one and several, an unknown kind), the empty and failure words, the runs' rows (loss, pending, no view, incomplete, partial, day 1) |
| `tests/web-business-page.test.js` | Source checks: the mount, the reads and events, the cards' order and links, the failure lines, the `.sm-` block (tokens only, the grid, 44 px taps) |
| Look | The UI/UX audit after the build: 1440, 1024 and 390 px, both themes |

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
| "Run page" as the run's link (named per run), not the container's name | Runs' own pattern; the visible words stay in the accessible name |
| No colour on the needs' lines | The words say what is wrong; colour stays for state (the loss figure) |
| The Runs card listens to `room` crop and room events too | A run starts or ends with the crops; the row names the room (as the run page) |
| `web/live.js` unchanged | Every event the page needs is already in `EVENT_TYPES` |
| The not-sold figure is a line, not a fourth tile | Three tiles keep the phone's rows even (Profit alone, then two); the design put it after the tiles |
| A browser's old `farm.business` value is not removed | Nothing reads it; removing it would be code kept for one browser's leftover |

# Economics, stage 1: the Economics tab at #/business/economics

Date: 2026-11-06 · Branch `feat/economics` from `v2` at `938a61e` (rebased after the login merge) · Database version 26 (one step after the login's 25) ·
Approved design: the owner, 2026-11-06 (`~/.claude/task-logs/economics/approved-design.md`) · Research appendix:
`docs/superpowers/specs/2026-11-06-economics-defaults.md`

The owner chose (2026-11-06) every row marked *owner*: plan with the farm's real figures, actuals where the farm has them and
research defaults where not, each marked; compare one of the farm's rooms, a month at a time, with a lowland shed, a highland
grower, importing and reselling, and (lion's mane only) a warm-tolerant strain, every way sized to that room's blocks; the
figures saved on the farm, editable, each with "back to default"; the electricity per block real when the room has grown the
crop, else worked out by the simulator on a button, saved and dated; two stages, each deployed. Stage 1 is this spec: the
page, its figures and the one shared model. Stage 2 (its own spec) adds what moves profit most, the price × yield map and
the runs against the plan.

## 1. Scope

| In | Out (later) |
|---|---|
| An **Economics** tab, the seventh in the Business strip (Summary · Batches · Inventory · Sales · Costs · Runs · Economics), at `#/business/economics` *owner* | Stage 2: what moves profit most (tornado), the price × yield map, your runs against the plan *owner* |
| Pick a room (Container 1, 2, 3, Room 1: the farm's rooms) and a crop: grey oyster, pink oyster, black jelly, lion's mane *owner* | The app's other crops (black, abalone and golden oyster, reishi, milky); several rooms added up |
| A headline in two sentences: the room's month, break-even and payback, then the best other way *owner* | Loans, interest, tax, the owner's own time; dried or processed products (dried black jelly, lion's mane powder) |
| A comparison: Your container, Lowland shed, Highland grower, Import and resell, Warm strain (lion's mane only), a month each, by part; one card per way on a phone, your container first *owner* | The model page's other room types (tents, a PIR room, a container on its own reefer unit) |
| A **Figures** card: every figure of that room and crop with where it comes from (You set, Your runs, Simulator, Research; Settings for two), edited in place, saved for every device, **Back to default** *owner* | Editing a run's yield, a sale or a batch here: each is changed in its own module |
| Your runs: the yield, price, block price and electricity per block of the room's finished runs of the crop, read on each request *owner* | A stored copy of the actuals |
| **Work it out**: the room's simulation with the crop over one block life, offline, never switching a machine; the result saved and dated *owner* | Sizing the machines (Suggest machines does that) |
| One table, `economics_figures` (the owner's figures and the simulator's), database version 26 *owner* | A table of results: the page works them out on every change |
| One pure model module (the port of `research/lions-mane-economics.html`) for the page now and stage 2 *owner* | The model on the server (stage 2 may add it) |
| Research defaults in code with their range, confidence and sources, pink oyster and black jelly researched for this spec *owner* | Fetching prices from the web |
| A row in the contract's section 7: Economics reads the other modules and never changes how they work a figure out *owner* | |

## 2. Placement and addresses (`web/route.js`, `web/app.js`)

| Part | Design |
|---|---|
| Tab | `BUSINESS_TABS` gains `{ key: 'economics', label: 'Economics', hash: '#/business/economics' }` last, marked `// ---- Economics ----`; `BUSINESS_PAGES` gains `['economics', 'economics']` |
| Route | `parseRoute('#/business/economics')` (also with `/` and `?room=<id>&crop=<key>`) → `{ name: 'economics', room, crop }`: `room` a whole number or null, `crop` one of `ECONOMICS_CROPS` (`'oyster'`, `'pink'`, `'woodear'`, `'lionsmane'`) or null. `canonicalHash` leaves a null out |
| The room and crop shown | The address's; without a room, the first room of the reply's list (the Overview's order); without a crop, the room's main crop now when it is one of the four (`mainCrop`), else lion's mane (the farm's main target, PRODUCT.md). The page writes its choice into the address in place (`history.replaceState`, as Runs' Crop select), so a reload keeps it. No memory between visits (as the Summary) |
| Mount | `app.js`: `: route.name === 'economics' ? economics.mount(page, { room: route.room, crop: route.crop }) // ---- Economics ----` into the `.bz-page` box under the strip; the view takes `.bz-view` |
| Who | The owner. The routes are not on the login work's worker allow-list (`server/roles.js`, merged in 938a61e), so a worker gets 403, as for every money page |

## 3. Data (database version 26)

`server/db.js` gains one block, `// ---- Economics ---- … // ---- end Economics ----`: the table, its upgrade step
`if (version < 26) db.exec(ECONOMICS);`, `VERSION = 26`, and the methods below in the returned object.

```sql
CREATE TABLE IF NOT EXISTS economics_figures (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL DEFAULT 0,   -- 0: every room (a farm or crop figure)
  crop       TEXT    NOT NULL DEFAULT '',  -- '': every crop (a farm or room figure)
  key        TEXT    NOT NULL,             -- section 4, e.g. 'price', 'yours.kwhBlock', 'shed.house'
  source     TEXT    NOT NULL CHECK (source IN ('owner', 'simulator')),
  value      REAL,                         -- null: a simulator figure never worked out yet
  at         INTEGER,                      -- ms: when the owner set it, or when the simulator worked it out
  status     TEXT    CHECK (status IN ('working', 'done', 'failed')),  -- simulator rows only
  sim_id     INTEGER,                      -- the room's simulation run (simulator rows)
  started_at INTEGER,                      -- ms, the last Work it out
  error      TEXT,                         -- the reason of the last failure
  kwh        REAL,                         -- the simulator's result behind value: kWh, blocks, days
  blocks     INTEGER,
  days       INTEGER
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS economics_figure ON economics_figures (room_id, crop, key, source);
CREATE TRIGGER IF NOT EXISTS economics_room_gone AFTER DELETE ON rooms BEGIN
  DELETE FROM economics_figures WHERE room_id = OLD.id;
END;
```

| Method | Reply | Rule |
|---|---|---|
| `economicsFigures(roomId, crop)` | `[row]` (camelCase) | Every row with `room_id` in (0, roomId) and `crop` in ('', crop) |
| `setEconomicsFigure({ roomId, crop, key, value, at })` | the row | Upserts the owner's row; `roomId` and `crop` are already 0 / '' where the key's scope says so (section 4) |
| `clearEconomicsFigure({ roomId, crop, key })` | true when a row went | Deletes the owner's row only |
| `startEconomicsSim({ roomId, crop, simId, at })` | the row | Upserts the simulator row of `'yours.kwhBlock'`: `status 'working'`, `sim_id`, `started_at`, `error` null; `value`, `at`, `kwh`, `blocks`, `days` kept (the figure before it stays) |
| `settleEconomicsSim({ simId, value, at, kwh, blocks, days } \| { simId, error })` | the row or null | Done: `status 'done'` and the new value; failed: `status 'failed'`, `error`, the value kept |
| `economicsSimsWorking()` | `[row]` | The rows still `'working'` (the server settles them at start, section 6) |

Room ids are reused, so a deleted room's figures go with it (the trigger; `deleteRoom` is untouched). A farm or crop figure
(`room_id` 0) stays.

## 4. The figures and where each comes from

### 4.1 The ways compared, per crop

| Crop | Ways shown, in this order | Not compared (the page says why: appendix 1.9) |
|---|---|---|
| Grey oyster | Your container, Lowland shed | Highland grower, Import and resell |
| Pink oyster | Your container, Lowland shed | Highland grower, Import and resell |
| Black jelly | Your container, Lowland shed, Import and resell | Highland grower |
| Lion's mane | Your container, Highland grower, Import and resell, Warm strain | Lowland shed (the warm strain is the lowland shed for this crop) |

### 4.2 Every figure

Scope says where a figure applies and so where it is saved: **farm** (every room and crop: `room_id` 0, `crop` ''), **crop**
(every room, that crop: `room_id` 0), **room** (that room, every crop: `crop` ''), **room and crop**. Checks: a figure out of
its range is refused with "<Label> must be a number from <min> to <max> <unit>" ("a whole number" when whole), the
Settings rule's words. Defaults, ranges, confidence and sources: the appendix, section 1.

| Key | Label | Unit | Scope | Range | Ways |
|---|---|---|---|---|---|
| `price` | Selling price | RM/kg | crop | 0–1,000 | all |
| `shrink` | Shrink, harvest to sale | % | crop | 0–90 | all |
| `pack` | Packing and delivery | RM/kg | crop | 0–100 | all |
| `blockPrice` | Block price, ready to fruit | RM a block | crop | 0–100 | the growing ways |
| `tariff` | Electricity price | RM/kWh | farm | Settings' (0–10) | the growing ways; read from Settings, not set here |
| `fixedTnb` | Electricity fixed charge | RM a month | farm | 0–1,000 | the growing ways |
| `wage` | Labour cost | RM an hour | farm | 0–200 | all |
| `life` | Equipment written off over | months, whole | farm | 1–240 | all |
| `yours.blocks` | Blocks in the room | blocks, whole | room | 1–100,000 | every way is sized to it (section 5.2) |
| `yours.yieldG` | Yield per good block, all flushes | g | room and crop | 0–5,000 | Your container |
| `yours.flushes` | Flushes per block | whole | room and crop | 1–10 | Your container |
| `yours.loss` | Blocks lost | % | room and crop | 0–90 | Your container |
| `yours.first` | Days to first harvest | days, whole | room and crop | 1–120 | Your container |
| `yours.interval` | Days between flushes | days, whole | room and crop | 1–120 | Your container |
| `yours.turn` | Rest and turnaround | days, whole | room and crop | 0–120 | Your container |
| `yours.kwhBlock` | Electricity per block, over its life | kWh | room and crop | 0–100 | Your container |
| `yours.labourMin` | Labour per block handled | min | room and crop | 0–600 | Your container |
| `yours.transport` | Transport to buyers | RM/kg | room and crop | 0–100 | Your container |
| `yours.rent` | Rent | RM a month | room | 0–1,000,000 | Your container |
| `yours.container` | Container, delivered | RM | room | 0–10,000,000 | Your container |
| `yours.cooling` | Cooling, fitted | RM | room | 0–10,000,000 | Your container |
| `yours.humidifier` | Humidifier | RM | room | 0–10,000,000 | Your container |
| `yours.fans` | Fans, controller and wiring | RM | room | 0–10,000,000 | Your container |
| `yours.racks` | Racks | RM | room | 0–10,000,000 | Your container |
| `shed.*`, `highland.*`, `warm.*` | `yieldG`, `flushes`, `loss`, `first`, `interval`, `turn`, `labourMin`, `transport` as Your container's; `kwhHouse` "Fans and humidifier electricity, per house" (kWh a month, 0–10,000); `rent` "Rent" (RM a month); `house` "House and racks, per house", `humidifier` "Humidifier or misting, per house", `fans` "Fans, controller and wiring, per house" (RM, 0–10,000,000); highland only `uphill` "Block freight up to the highlands" (RM a block, 0–100) | as Your container's | crop | as Your container's | that way |
| `import.landed` | Landed price | RM/kg | crop | 0–1,000 | Import and resell |
| `import.buyHours` | Trading labour | hours a day | crop | 0–24 | Import and resell |
| `import.rent` | Rent | RM a month | crop | 0–1,000,000 | Import and resell |

### 4.3 Where a figure comes from

The first source that has the figure gives it; the page tags it. "You set" over a real figure keeps the real one beside it.

| Figure | Sources, first first |
|---|---|
| `price` | You set › Your runs (Sales) › Settings (Settings → Yield's expected price) › Research |
| `blockPrice` | You set › Your runs (Batches) › Research |
| `yours.yieldG` | You set › Your runs (Harvest) › Research |
| `yours.loss` | You set › Your runs (0 when the yield is from your runs: "counted in your yield", section 4.4) › Research |
| `yours.kwhBlock` | You set › Your runs (the room's measured energy) › Simulator › Research |
| `yours.blocks` | You set › Your runs (the room's blocks now, from its Crop tab; else its latest run's) › Research (the room's volume × 22, rounded down) |
| `yours.container`, `yours.cooling`, `yours.humidifier`, `yours.racks` | You set › Research, from the room's size (appendix 1.4): over 40 m³ a 40 ft high cube, else a 20 ft; humidifiers one per 6 L/h of the room's humidifier output (Setup); racks RM 0.70 × `yours.blocks` |
| `tariff` | Settings → Electricity price (Costs uses the same price) |
| Every other figure | You set › Research |

### 4.4 Your runs (read on each request, never stored)

A run counts for room R and crop C when it is in R, has ended (`endedAt` set), is not `partial` (recorded since the harvest
upgrade only), has C among its crops and has kg of C picked. The figures say how many runs they come from ("4 runs") and their
dates.

| Figure | From | Rule |
|---|---|---|
| Yield per block | Harvest: `harvests.roomView(R).past`, each counted run's `byCrop` entry for C | Σ kg of C ÷ Σ blocks of C × 1,000, in g. Harvest counts every block put in, so the lost blocks are already in it; `yours.loss` then reads 0 from your runs |
| Selling price | Sales: the sale lines of C (`db.salesBetween`) tied to a counted run (`runId`, or no run and `roomId` R on a day of the run by Costs' `runOn` rule) | Σ total ÷ Σ kg. With no line tied: C's sales farm-wide from the first counted run's start to 14 days after the last one's end ("farm-wide sales", said in the note). None: the next source |
| Block price | Batches: `batches.list()` rows of C on a counted run with a `pricePerBlock` | Σ (blocks × price) ÷ Σ blocks. Batches without a price are left out and named in the note ("2 batches without a price left out"); none priced: the next source |
| Electricity per block | Energy: `roomDays(db, room, { cachedOnly: true, count })` (`server/usage.js`) for R, each day given to the run open on it (Costs' `runOn`) | Σ kWh of the counted runs' days ÷ Σ blocks of those runs (all their crops: the room's electricity serves every block in it). A run with a day before the energy kept (400 days) or with no kWh at all is left out; a day still being worked out (`pending`) leaves the figure "working out" until the Costs warm publishes `costs` |
| Blocks in the room | The room's program (`db.getProgram(id).crops`, its Crop tab; all crops summed) | Its blocks now; an empty room: its latest run's blocks. This is the room's own number, so it counts as Your runs |

### 4.5 A source that can't be read

| Case | Figure | Note on the figure |
|---|---|---|
| Harvest, Sales, Batches or the energy throws | The next source | "Couldn't read Sales just now; using research." (the module and the source used named) |
| The simulator failed | The last worked-out value (or the next source when none) | Section 6.3 |
| A run's room gone between reads | That run left out | — |

## 5. The model (`web/economics-model.js`, pure)

The port of `research/lions-mane-economics.html` (its `model()`), used by the page now and by stage 2. No DOM, no fetch,
no clock. A month is 30.4 days.

### 5.1 A growing way (`grow(x)`: Your container, Lowland shed, Highland grower, Warm strain)

| Result | Formula |
|---|---|
| Block life (days) | life = first + interval × max(0, flushes − 1) + turn |
| Blocks started a month | blocksM = blocks × 30.4 ÷ life |
| kg sold a month | kgSold = blocksM × (1 − loss ÷ 100) × yieldG ÷ 1,000 × (1 − shrink ÷ 100) |
| Income | kgSold × price |
| Blocks | blocksM × (blockPrice + uphill) (uphill 0 but for the highland grower) |
| Electricity | kWhMonth × tariff + fixedTnb, where Your container's kWhMonth = kwhBlock × blocksM and another way's = kwhHouse × houses |
| Labour | blocksM × labourMin ÷ 60 × wage |
| Packing and delivery | kgSold × pack |
| Transport | kgSold × transport |
| Rent | rent |
| Equipment written off | equipment ÷ life (the write-off months) |
| Costs | the sum of the seven parts above |
| Profit a month | income − costs; the profit before write-off op = profit + equipment written off |
| Break-even | costs ÷ kgSold (RM a kg; none when kgSold is 0). The same as the model page's (costs − packing) ÷ kgSold + pack |
| Equipment | the way's items summed (section 5.2) |
| First fill | blocks × (blockPrice + uphill) |
| Wait to the first harvest | rampM = first ÷ 30.4 months; its costs rampCost = (electricity + labour + rent) × rampM |
| Pays back, equipment only | equipment ÷ op, when op > 0 and it is at most the write-off months; else never |
| Pays back, with the first fill | rampM + (equipment + first fill + rampCost) ÷ op, when op > 0 and it is at most the write-off months; else never |

### 5.2 Sizing the ways to the room

| Rule | Detail |
|---|---|
| Blocks | Every growing way has `yours.blocks` |
| Houses | A shed, a highland house or a warm-strain shed holds up to 2,000 blocks: houses = ⌈blocks ÷ 2,000⌉. `kwhHouse`, `house`, `humidifier` and `fans` are per house |
| Your container's equipment | container + cooling + humidifier + fans + racks |
| Import and resell | Sells Your container's kg sold (the model page's rule: the same volume, bought in) |

### 5.3 Import and resell (`trade(x, kgSold)`)

| Result | Formula |
|---|---|
| kg bought a month | kgBought = kgSold ÷ (1 − shrink ÷ 100) |
| Income | kgSold × price |
| Mushrooms bought | kgBought × landed |
| Labour | buyHours × 30.4 × wage |
| Packing and delivery | kgSold × pack |
| Rent | rent |
| Electricity, transport, equipment | 0; payback "no equipment" |
| Profit, break-even | as 5.1 |

### 5.4 The module's exports

| Export | Does |
|---|---|
| `DAYS_A_MONTH` | 30.4 |
| `grow(x)` | 5.1 → `{ life, blocksM, kgSold, income, cost: { blocks, electricity, labour, packing, transport, rent, writeOff }, costs, profit, op, be, equipment, fill, rampM, rampCost, payback, paybackAll, kwhMonth }` (`be` null with no kg sold; a payback never is `Infinity`) |
| `trade(x, kgSold)` | 5.3 → `{ kgBought, kgSold, income, cost, costs, profit, be, equipment: 0 }` |
| `housesOf(blocks)` | ⌈blocks ÷ 2,000⌉, at least 1 |
| `inputsOf(figures, way)` | The figures' values (section 4) → that way's `x` (the per-house sums, Your container's equipment sum) |
| `compare(figures, ways)` | Every shown way's result, Your container first: the comparison and the headline read only this |

## 6. Work it out (the simulator)

### 6.1 The run

| Part | Design |
|---|---|
| Button | On the **Electricity per block** row of Your container: "Work it out" (or "Work it out again"). `POST /api/economics/work-out` `{ room, crop }` |
| What runs | One of the room's simulations, queued through `simulations.start(roomId, body)` (`server/simulations.js`) like Simulate's: it shows on the room's Simulation page with the others and keeps their limits (one runs at a time, at most 5 waiting per room) |
| Body | `crops: [{ crop, blocks: yours.blocks }]`; `farmType: 'ready'`, `stage: 'fruiting'`, `start: 'band'`; `days` = Your container's block life, rounded, 1 to 90; the walls, weather and filter of the room's newest simulation (its `input.physics`), else Simulate's defaults (`PHYSICS_FIELDS` `def`: walls 80 W/K, sun 300 W, 33 / 25 °C, dew point 24 °C); the machines the room has on Setup (`roomMachines` in `web/simulate-math.js`: the aircon class from its rated input, the humidifier's output, a dehumidifier when fitted; the fan flow from the newest run, else 600 m³/h) |
| The figure | kWh per block = the run's `summary.energy.kWh` ÷ its blocks, to 3 places; saved in the simulator row with the run's kWh, blocks, days and the time it finished |
| How long | Measured on the development desk: 2.3 s for 42 days and 3.9 s for 68 days of a 1,482-block 40 ft (one worker thread; it never holds up the farm app). The cloud VM is slower; a run queued behind others waits its turn |
| Machines | None switched. `simulate.js` is pure (the device app's air model, the farm's control and program, ideal sensors, no Modbus, no clock), run in a worker thread; it never touches the live room, its machines or its program |
| One at a time | One Work it out per room and crop: asking again while one works is refused (409) |

### 6.2 Settling the result

| When | Then |
|---|---|
| The `simulation` event says the run is `done` | The row is done (`settleEconomicsSim`); `economics` is published |
| The run is `failed` | The row fails with the run's error; the value before it stays; `economics` is published |
| The run is gone (deleted on the Simulation page while waiting or running) | Fails with "The simulation was deleted" |
| The farm app restarts mid-run | At start, every `'working'` row is settled from its run: Simulate's own restart failure ("Stopped by a restart of the farm app") |
| The body is refused by the simulation's checks | The row fails at once with the check's words ("Aircon size must be a whole number from 0 to 200000 BTU/h"); the reply is 200 with that state |

### 6.3 What the page says

| State | On the Electricity per block row |
|---|---|
| Never worked out | The Research note, then "Work it out runs Container 1's simulation with Lion's mane for one block life (42 days), with its machines from Setup. Nothing is switched." and **Work it out** |
| Waiting | "Waiting for another simulation…" (the run is queued) |
| Working | "Working it out · 40 %" (the `simulation` event's progress; a polite live line says "Working it out" once) |
| Done | Tag Simulator; "Simulator, 6 Nov 14:02: 708.7 kWh over 42 days for 1,482 blocks." and **Work it out again** |
| Failed | "Couldn't work it out: <the reason>. The figure before it stays." in the warning text tone, and **Try again** |
| Your runs have it | Tag Your runs; the simulator's figure, when there is one, in the note ("Simulator, 6 Nov: 0.48 kWh"); **Work it out again** stays |

## 7. API (`server/economics.js`, `server/economics-api.js`)

`createEconomics({ db, harvests, batches, simulations, events, now, zone, log })` → `{ view, setFigure, clearFigure,
workOut, close }`: resolves the figures of section 4 (no money worked out on the server). `createEconomicsRoutes({ db,
events, harvests, batches, simulations })` → the route handler; `server/api.js` gets four marked lines
(`// ---- Economics ----`): the import, the creation after the Summary's, the route call after the Summary's, `close()` in
`api.close`.

### 7.1 Routes

| Route | Reply |
|---|---|
| `GET /api/economics?room=<id>&crop=<key>` | 200 the view (7.2). No `room`: the first room. No `crop`: the room's main crop when one of the four, else `'lionsmane'`. A bad crop: 400 `{ error: 'Pick a crop', field: 'crop' }`; a room not there: 404 `{ error: 'Room not found' }` |
| `PUT /api/economics/figures` | Body `{ room, crop, key, value }` → 200 the view. 400 `{ error, field: 'value' }` out of range (4.2's words); 400 `{ error: 'Unknown figure', field: 'key' }`; 400 `{ error: 'Electricity price is set in Settings', field: 'key' }` for `tariff`; 404 a room not there |
| `DELETE /api/economics/figures?room=&crop=&key=` | 200 the view (also when nothing was set) |
| `POST /api/economics/work-out` | Body `{ room, crop }` → 202 the view, the simulator working; 409 `{ error: 'Already working it out for Container 1 and Lion's mane' }`; 409 the simulations' own "This room already has 5 simulations waiting or running"; 200 the view with the failure (6.2) when the simulation's checks refuse the body |
| Any other method or path under `/api/economics` | 404 "Not found" |

### 7.2 The view

| Field | Shape | Rule |
|---|---|---|
| `rooms` | `[{ id, name }]` | Every room, the Overview's order |
| `room` | `{ id, name, volume, size: '40 ft' \| '20 ft', humidifierLH }` or null | null with no rooms (then `figures` is `[]`) |
| `crop` | `'oyster' \| 'pink' \| 'woodear' \| 'lionsmane'` | |
| `ways` | `['yours', …]` | 4.1's order for the crop |
| `left` | `[{ way, reason }]` | 4.1's not compared; `reason` a key the page words (`'too-cool'`, `'not-imported'`, `'warm-strain'`) |
| `figures` | `[{ key, way, scope, value, source, at, real, research, runs, notes }]` | Every figure of 4.2 for the shown ways. `source` `'owner' \| 'runs' \| 'simulator' \| 'settings' \| 'research'`; `at` (ms) for an owner or simulator figure; `real`: the figure under an owner's, `{ value, source }` (runs, simulator or settings) or null; `research` `{ value, low, high, confidence }` (the room-size defaults worked out); `runs` `{ count, from, to, kg, blocks, total, batchesLeftOut, farmWide }` (what the note needs) or null; `notes`: keys (`'loss-in-yield'`, `'not-read:sales'`, `'pending'`) |
| `sim` | `{ status, simId, progress, startedAt, at, kwh, blocks, days, error }` or null | The simulator row of the room and crop; `progress` while working (the run's) |
| `errors` | `{ [part]: 'Something went wrong' }` | Parts `harvest`, `sales`, `batches`, `energy`; `{}` when every part was read (the Summary's rule) |

### 7.3 Events

| Event | When |
|---|---|
| `economics` `{ roomId, crop }` | A figure set or cleared, a Work it out started, settled or failed. `'economics'` is added to `EVENT_TYPES` in `web/live.js` (one line) |
| `simulation` (existing) | The page shows its run's progress from it without asking again |

## 8. The page (`web/economics-page.js` `mount(container, { room, crop })`)

### 8.1 Parts

| Part | Design |
|---|---|
| Head | "Economics", under it "What one of your rooms makes a month with a crop, against the other ways to grow it or buy it in." Document title "Economics · Mushroom farm". Under the line two labelled selects (Calendar's): **Room** (each room's name) and **Crop** (Grey oyster, Pink oyster, Black jelly, Lion's mane); side by side, stacked under 600 px |
| Headline card | No card title; the sentence of 8.2 in the lead size (`fs-lg`, 600), the second sentence under it in `fs-md` `ink-2`, then one muted `fs-sm` line on the figures' sources: "From your runs: yield, selling price · Simulator: electricity · You set: 2 · The rest is research." ("All research: set your own figures below." when none is real) |
| Compared | Card title "A month, each way". A table (caption the title): a column per shown way, headed "Your container" (with the room's name under it, muted), "Lowland shed", "Highland grower", "Import and resell", "Warm strain"; rows 8.3. Under it, muted `fs-sm` lines: the first fill (8.3), "Every way is sized to Container 1's 1,740 blocks; a shed or a highland house holds up to 2,000." and the not compared line (8.4) |
| Figures | Card title "Figures", under it muted: "Change a figure and the page works it out again as you type; it is saved for every device when you leave the box." Folds (DESIGN's): **Shared by every way** and **Your container** open; then one per other shown way, closed, its head "Lowland shed · 13 figures · all research" ("· 2 you set"). A row per figure (8.5) |
| Layout | One column at every width: Headline, Compared, Figures. The table's box scrolls sideways when it must (a region named by its caption, a Tab stop, as Runs) |
| Phone (≤ 600 px) | Compared becomes one block per way, Your container first (the Runs table's blocks: ARIA `table`, `row`, `rowheader`, `cell`; each block's label `content: attr(data-label) / ""`), its head the way's name with Profit a month beside it. Every select, box, button and link reaches 44 px |
| Shared look | `.bz-view` card titles (14 px); folds, chips, inputs and the quiet button (`bz-quiet`) as they are; the page's own CSS in the `.ec-` block |

### 8.2 The headline (exact words; `headline(results, room, crop)` in `web/economics-math.js`)

| Case | Sentence 1 |
|---|---|
| A profit that pays back | "Lion's mane in Container 1: RM 3,003.16 a month, break-even RM 38.23 a kg, pays back in 13 months." |
| A profit that doesn't pay back within the write-off | "Lion's mane in Container 1: RM 120.00 a month, break-even RM 49.10 a kg, but it doesn't pay back within the 60 months the equipment is written off over." |
| A loss | "Grey oyster in Container 1: −RM 1,400.38 a month loss, break-even RM 18.68 a kg, never pays back." (only the figure in the critical text token) |
| Nothing sold (yield, blocks or kg 0) | "Grey oyster in Container 1 sells nothing at these figures: −RM 2,083.00 a month loss." |

| Case (the best other way: the shown way with the most profit, ties in column order) | Sentence 2 |
|---|---|
| It makes more than yours, at a profit | "A highland grower makes RM 3,152.92 on a quarter of the equipment." |
| It loses less than yours | "A lowland shed loses less, −RM 814.18, on a tenth of the equipment." |
| Yours makes the most, at a profit | "That is the most of the 4 ways; next, a highland grower makes RM 2,000.00." ("Every other way loses money at these figures." when they all lose) |
| Yours loses, and every other way loses more | "Every other way loses more." |
| Only one way shown | None |

| Equipment words (the other way's equipment ÷ yours) | Words |
|---|---|
| Import (none) | "with no equipment" |
| Yours is 0 | "on RM 6,800.00 of equipment" |
| Under 0.875 | "on <the nearest of a tenth, a fifth, a quarter, a third, half, two thirds, three quarters> of the equipment" (0.2306 → "a quarter") |
| 0.875 to 1.15 | "on about the same equipment" |
| Over 1.15 | "on 1.5 times the equipment"; "on twice the equipment" at 1.95–2.05 |

| Way names in a sentence | Words |
|---|---|
| Lowland shed | "A lowland shed" |
| Highland grower | "A highland grower" |
| Import and resell | "Importing and reselling" |
| Warm strain | "A warm strain in a lowland shed" |

### 8.3 Compared: the rows (exact labels)

| Row | Growing way cell | Import and resell cell |
|---|---|---|
| Blocks started a month | "1,259" | "283.4 kg bought" |
| kg sold a month | "255.0 kg" | "255.0 kg" |
| Income | "RM 12,752.48" | as growing |
| Blocks, or mushrooms bought | "RM 7,556.57" | "RM 11,648.60" |
| Electricity | "RM 298.81" | "RM 0.00" |
| Labour | "RM 528.96" | "RM 608.00" |
| Packing and delivery | "RM 765.15" | as growing |
| Transport | "RM 0.00" | "RM 0.00" |
| Rent | "RM 0.00" | as growing |
| Equipment written off | "RM 599.83" | "RM 0.00" |
| Costs | "RM 9,749.32" | as growing |
| Profit a month | "RM 3,003.16"; a loss "−RM 2,403.95" in the critical text token with "Loss" under it | as growing |
| Break-even | "RM 38.23 a kg"; "—" with nothing sold | as growing |
| Equipment | "RM 35,990.00" | "None" |
| Pays back, equipment only | "10 months" | "No equipment" |
| Pays back, with the first fill | "13 months"; "never" | "No equipment" |

| Line under the table | Words |
|---|---|
| The first fill | "With the first fill: Container 1's equipment, its first 1,740 blocks (RM 10,440.00) and the costs until the first harvest, 12 days in (RM 326.75)." |
| Never (when any cell says never) | "Never: not within the 60 months the equipment is written off over." |
| Months | Under 1: "under 1 month"; under 9.95: one decimal ("6.2 months"); else whole ("13 months"); 1 exactly "1 month" (the model page's rule) |

### 8.4 Not compared

| Crop | Words (one muted line under the table) |
|---|---|
| Grey oyster | "Not compared: a highland grower (grey oyster isn't grown commercially there; it fruits best at 25 °C and Cameron Highlands averages 17.9 °C) and importing (fresh grey oyster keeps 3–4 days and Malaysia grows its own)." |
| Pink oyster | "Not compared: a highland grower (too cool to pin: it needs 18–20 °C) and importing (it keeps 1–4 days; none is imported)." |
| Black jelly | "Not compared: a highland grower (growth slows sharply below 18 °C)." |
| Lion's mane | "Not compared: a lowland shed with the usual strain (it fruits at 18–24 °C); the warm strain is the lowland shed for lion's mane." |

### 8.5 A figure's row

| Part | Design |
|---|---|
| Label | The figure's label (4.2), with its unit in the box's suffix ("g", "RM/kg", "%") |
| Box | A number box (`inputmode="decimal"`, whole-number figures `numeric`), 9em, the value without grouping ("1740", "38.23"). Settings figures (Electricity price) show the value as text and a link "Change in Settings" (`#/settings`) instead |
| Tag | A neutral chip: "You set", "Your runs · 4 runs" ("· 1 run"), "Simulator", "Settings", "Research". Never colour alone |
| Note | Muted `fs-sm` under the row (8.6), with its actions |
| Applies | Muted `fs-sm`: "Every room and crop" (farm), "Every room, Lion's mane" (crop), "Container 1, every crop" (room), "Container 1, Lion's mane" (room and crop) |
| Type | On each `input` a valid number recalculates the headline and the table at once (the model in the browser); an invalid one keeps the last valid figure in them and shows the refusal under the box (`critical-text`, `aria-invalid`, `aria-describedby`), the page checking with 4.2's ranges and words before sending |
| Save | On `change` (Enter, or leaving the box): `PUT`; the tag reads "Saving…", then "You set"; a polite live line "Saved: Selling price, RM 55.00 a kg, every room." A refusal from the server: its words under the box, nothing saved. No answer: "Couldn't save · Retry" under the box; the typed figure stays in the sums, marked "not saved" |
| Back to default | A quiet button (`bz-quiet`) on a You set figure: `DELETE`; the figure falls to its next source; the cursor stays on the row's box |

### 8.6 The notes (exact words)

| Source or state | Note |
|---|---|
| Research | "Research, low confidence: 150–400 g. Malaysian 150 g in a warm room; Shandong factory 400 g. Sources: Malaysiaaktif 2025, Nongji 2023." (the appendix's note and range; each source its link, opening in a new tab) |
| Your runs, yield | "Your runs: 4 finished runs of Lion's mane in Container 1, 12 Aug – 30 Oct: 1,592.0 kg from 7,000 blocks put in (227 g a block, lost blocks counted)." |
| Your runs, price | "Your runs: 1,480.0 kg sold for RM 81,400.00." Farm-wide: "Your sales: Lion's mane sold farm-wide 12 Aug – 13 Nov, 1,480.0 kg for RM 81,400.00 (no sale was tied to these runs)." |
| Your runs, block price | "Your runs: 7,000 blocks in 5 batches." With some unpriced: "… · 2 batches without a price left out." |
| Your runs, electricity | "Your runs: 3,412.6 kWh measured over 140 days for 7,000 blocks." While a day is worked out: "Your runs: working out the energy…" |
| Your runs, blocks | "Container 1's blocks now (its Crop tab)." Empty room: "Container 1's last run, 12 Aug." |
| Loss counted in the yield | "Counted in your yield: your runs' kg a block is over every block put in." When the owner sets a loss over it: "Your runs' yield already counts lost blocks; a loss here counts them twice." in the warning text tone |
| Settings, price | "Your expected price in Settings → Yield." and the link "Settings" |
| Settings, electricity | "Settings → Electricity price; Costs uses it too." and "Change in Settings" |
| You set | "You set this on 6 Nov." and **Back to default**; over a real figure: "You set this on 6 Nov · Your runs: 227 g." |
| A part not read | "Couldn't read Sales just now; using research." in the warning text tone |
| The simulator | 6.3 |

### 8.7 Numbers (the One Format Rule)

| Figure | Formatter | From |
|---|---|---|
| RM, a loss with "−" | `moneyText` | `web/costs-math.js` |
| RM a kg | `perKgText` + " a kg" | `web/costs-math.js` |
| kg | `kgText` | `web/harvest-math.js` |
| Blocks, grouped | `grouped` | `web/overview-math.js` |
| Months, g, kWh, %, days, min, hours | `monthsText`, `figureText(key, v)` ("250 g", "0.40 kWh", "10 %", "42 days", "2.52 min", "2 hours a day") | `web/economics-math.js` |
| A crop's name | `cropShortName` ("Black jelly (wood ear)" in sentences; "Black jelly" in the select) | `web/crops.js` |
| Dates | `dayMonth` ("6 Nov"), `formatDateTime` ("6 Nov 14:02") | `web/tasks-math.js`, `web/simulation-math.js` |

## 9. Live updates, failures and edge cases

### 9.1 Live updates

| Trigger | The page |
|---|---|
| `economics`, `harvest`, `sales`, `batches`, `costs` events; `room` with `part` `crop` or `room`; a room added or deleted | Read again (throttled, `createThrottle`) |
| `simulation` with the page's `sim.simId` | The progress words only; `done` or `failed` arrives as `economics` |
| The stream back up | Read again |
| Timer | 60 s (`fallbackMs`) |
| A stale answer | Dropped (a mount token and a read sequence) |
| A repaint | Keeps the cursor on the same box or button by its figure key; never rewrites a box the owner is typing in (its text and its unsaved figure stay); a reply equal to the last one painted paints nothing |

### 9.2 States

| State | Page |
|---|---|
| First read under way | The head only |
| No rooms | "No rooms yet. Economics plans with one of your rooms." and the link "Rooms, to add one" (`#/overview`) |
| No answer, first read | The banner "Couldn't reach the farm server" with Retry |
| No answer later | The banner over the last answer, which stays (the owner's typing too) |
| An older farm app (404 "Not found") | `OUTDATED` in the banner, no more reads |
| The address's room is gone (404 "Room not found") | Asks again without the room; a line "That room is gone; showing Container 1." |
| A part not read | Its figures fall to the next source with 8.6's note; one warning line at the top of Figures, "Couldn't read Sales just now · trying again every minute", with a quiet Retry (the Summary's) |

### 9.3 Edge cases

| Case | Behaviour |
|---|---|
| A new farm (no runs, no sales) | Every figure Research but the blocks (the room's, or its volume's); "All research: set your own figures below." |
| A room with a crop the four don't include (black oyster) | The crop picked is lion's mane; the room's blocks still count |
| A mixed run (oyster and lion's mane) | Counts for each crop: its own kg, blocks, sales and batches; the electricity ÷ every block of the run |
| A run still open | Not counted (only finished runs) |
| A run with no kg of the crop | Not counted ("no picks recorded"); the owner can set the yield |
| Yield from your runs with Batches' losses recorded | Still per block put in (Harvest's own figure), so the loss reads 0 |
| A sale with no room and no run | Not tied; counted only in the farm-wide fallback |
| Shrink or loss 90 % | Allowed (the range); 100 % is refused (kg bought would divide by 0) |
| Blocks 0, yield 0, price 0 | Blocks are at least 1; yield or price 0: income 0, "sells nothing" |
| Equipment all 0 | Payback "under 1 month" when op > 0 (no equipment to pay back, the fill still counted) |
| A Work it out with the room's machines not rated | Simulate's defaults fill in (as `roomMachines` says); the note names them |
| The block life over 90 days (black jelly 85 is under) | The simulation runs 90 days and the kWh is scaled to the life: × life ÷ 90 (said in the note: "scaled from 90 days") |
| Two devices change the same figure | The last save wins; the other device repaints on the `economics` event (unless its box is being typed in) |
| The room renamed | The words follow on the `room` event |

## 10. Files

| File | Status | Responsibility |
|---|---|---|
| `web/economics-model.js` | Create | Section 5: `grow`, `trade`, `housesOf`, `inputsOf`, `compare`, `DAYS_A_MONTH` |
| `web/economics-defaults.js` | Create | `ECONOMICS_CROPS`, `WAYS` and `LEFT` per crop, `FIGURES` (key, label, unit, scope, min, max, whole, ways), the research defaults per crop (value, low, high, confidence, sources, note), the room-size rules (appendix 1.4), `SOURCES` (id → short title, URL, date), `checkFigure(key, value)` (4.2's words) |
| `web/economics-math.js` | Create | The words: headline, rows, notes, tags, applies, the not compared line, `monthsText`, `figureText` |
| `web/economics-page.js` | Create | `mount` |
| `server/economics.js` | Create | `createEconomics`: the view (sections 4 and 7.2), the owner's figures, Work it out and its settling |
| `server/economics-api.js` | Create | `createEconomicsRoutes` |
| `server/db.js` | Modify (own block) | Section 3 |
| `server/api.js` | Modify (four marked lines) | Wire the routes, close them |
| `web/route.js` | Modify (Economics block, marked) | The tab, the `economics` route |
| `web/app.js` | Modify (marked) | Mount the page |
| `web/business-tabs.js` | Modify (comment) | Seven tabs |
| `web/live.js` | Modify (one line) | `'economics'` in `EVENT_TYPES` |
| `web/styles.css` | Modify (own block at the end) | `/* ---- Economics ---- */` … `/* ---- end Economics ---- */`, `.ec-` only, tokens only |
| `DESIGN.md`, `README.md`, `PRODUCT.md` | Modify | An Economics section; the Business tab strip row (seven tabs); a capability row |
| `~/.claude/task-logs/business/CONTRACT.md` | Modify (section 7) | "Economics reads Harvest's `roomView`, Batches' `list`, Sales' lines, the usage days and Costs' `runOn`, Settings' prices and Yield, and starts simulations through `simulations.start`; it never changes how they work a figure out. It owns `economics_figures` (version 26) and the `economics` event" |
| `tests/…` | Create, modify | Section 11 |

## 11. Testing

### 11.1 Golden: the model page at its own inputs (`tests/economics-model.test.js`)

The model must give the model page's results exactly (to 0.01) on its inputs (the page's state at its defaults, the custom
cold room; reproduced on 2026-11-06 by running both the page's `model()` and this spec's port).

| Input | Your container | Highland grower | Warm strain | Import and resell |
|---|---|---|---|---|
| Shared | price 50, shrink 10, pack 3, blockPrice 6, tariff 0.551, fixedTnb 20, wage 10, life 60 | the same | the same | the same |
| Blocks | 1,740 | 1,740 | 1,740 | — |
| Yield per good block | 250.015 g (161.3 × 1.55) | 250.015 g | 124 g (80 × 1.55) | — |
| Flushes, loss, first, interval, turn | 2, 10 %, 12, 14, 16 | the same | the same | — |
| Electricity | 506 kWh a month (as `kwhMonth`) | 146 kWh a month | 146 kWh a month | — |
| Labour per block | 2.52 min | 2.52 min | 2.52 min | 2 hours a day |
| Transport, uphill, rent | 0, 0, 0 | 2, 0, 0 | 0, 0, 0 | rent 0 |
| Equipment | 18,500 + 8,580 + 3,000 + 3,300 + 2,610 = 35,990 | 5,000 + 1,500 + 1,800 = 8,300 | 5,000 + 1,500 + 3,300 = 9,800 | — |
| Landed price | — | — | — | 41.1047 (8.10 × 4.087 + 8) |

| Output | Your container | Highland grower | Warm strain | Import and resell |
|---|---|---|---|---|
| Block life | 42 days | 42 days | 42 days | — |
| Blocks started a month | 1,259.43 | 1,259.43 | 1,259.43 | 283.39 kg bought |
| kg sold a month | 255.05 | 255.05 | 126.50 | 255.05 |
| Income | 12,752.48 | 12,752.48 | 6,324.85 | 12,752.48 |
| Blocks, or mushrooms bought | 7,556.57 | 7,556.57 | 7,556.57 | 11,648.60 |
| Electricity | 298.81 | 100.45 | 100.45 | 0 |
| Labour | 528.96 | 528.96 | 528.96 | 608.00 |
| Packing and delivery | 765.15 | 765.15 | 379.49 | 765.15 |
| Transport | 0 | 510.10 | 0 | 0 |
| Rent | 0 | 0 | 0 | 0 |
| Equipment written off | 599.83 | 138.33 | 163.33 | 0 |
| Costs | 9,749.32 | 9,599.56 | 8,728.80 | 13,021.75 |
| Profit a month | **3,003.16** | **3,152.92** | −2,403.95 | −269.27 |
| Break-even (RM a kg) | **38.23** | **37.64** | 69.00 | 51.06 |
| Equipment | 35,990 | 8,300 | 9,800 | 0 |
| First fill | 10,440.00 | 10,440.00 | 10,440.00 | — |
| Costs to the first harvest | 326.75 | 248.45 | 248.45 | — |
| Pays back, equipment only | 9.99 months ("10 months") | 2.52 ("2.5 months") | never | no equipment |
| Pays back, with the first fill | **13.37 ("13 months")** | **6.16 ("6.2 months")** | never | no equipment |

| Headline at these (Container 1) | "Lion's mane in Container 1: RM 3,003.16 a month, break-even RM 38.23 a kg, pays back in 13 months. A highland grower makes RM 3,152.92 on a quarter of the equipment." |
|---|---|

### 11.2 The defaults in a 40 ft container (`tests/economics-defaults.test.js`)

Worked by this spec's port at the appendix's defaults: a 67.4 m³ room (40 ft), humidifier 2 L/h, 1,482 blocks, tariff 0.55
(Settings' default), fixed charge 20, wage 10, write-off 60 months; Your container's equipment 38,100 + 9,040 + 1,500 + 3,300
+ 1,037.40 = 52,977.40; a shed house 5,000 + 1,500 + 300 = 6,800.

| Crop | Way | kg sold a month | Income | Costs | Profit a month | Break-even | Equipment | Pays back (equipment only; with the first fill) |
|---|---|---|---|---|---|---|---|---|
| Grey oyster | Your container | 161.29 | 1,612.85 | 3,013.23 | −1,400.38 | 18.68 | 52,977.40 | never; never |
| Grey oyster | Lowland shed | 72.76 | 727.60 | 1,541.78 | −814.18 | 21.19 | 6,800 | never; never |
| Pink oyster | Your container | 308.16 | 6,163.22 | 6,398.20 | −234.97 | 20.76 | 52,977.40 | never; never |
| Pink oyster | Lowland shed | 121.64 | 2,432.85 | 3,190.46 | −757.61 | 26.23 | 6,800 | never; never |
| Black jelly | Your container | 120.47 | 3,011.81 | 2,852.24 | 159.56 | 23.68 | 52,977.40 | 50.82; 55.27 |
| Black jelly | Lowland shed | 76.23 | 1,905.73 | 1,890.74 | 15.00 | 24.80 | 6,800 | 52.99; never |
| Black jelly | Import and resell | 120.47 (128.16 bought) | 3,011.81 | 2,370.48 | 641.32 | 19.68 | 0 | no equipment |
| Lion's mane | Your container | 217.22 | 10,860.94 | 8,677.25 | 2,183.70 | 39.95 | 52,977.40 | 17.28; 20.66 |
| Lion's mane | Highland grower | 217.22 | 10,860.94 | 8,211.37 | 2,649.57 | 37.80 | 8,300 | 2.98; 6.64 |
| Lion's mane | Warm strain | 107.74 | 5,387.03 | 7,473.50 | −2,086.47 | 69.37 | 9,800 | never; never |
| Lion's mane | Import and resell | 217.22 (241.35 bought) | 10,860.94 | 11,121.39 | −260.45 | 51.20 | 0 | no equipment |

| Crop | Headline at these |
|---|---|
| Grey oyster | "Grey oyster in Container 1: −RM 1,400.38 a month loss, break-even RM 18.68 a kg, never pays back. A lowland shed loses less, −RM 814.18, on a tenth of the equipment." |
| Pink oyster | "Pink oyster in Container 1: −RM 234.97 a month loss, break-even RM 20.76 a kg, never pays back. Every other way loses more." |
| Black jelly | "Black jelly (wood ear) in Container 1: RM 159.56 a month, break-even RM 23.68 a kg, pays back in 55 months. Importing and reselling makes RM 641.32 with no equipment." |
| Lion's mane | "Lion's mane in Container 1: RM 2,183.70 a month, break-even RM 39.95 a kg, pays back in 21 months. A highland grower makes RM 2,649.57 on a fifth of the equipment." |

### 11.3 The rest

| Test | Covers |
|---|---|
| `tests/economics-model.test.js` | 11.1; `grow` with no kg sold (`be` null), op ≤ 0 (never), payback past the write-off (never), equipment 0; `trade`; `housesOf` (1, 2,000, 2,001); `inputsOf` (per-house sums, Your container's kWh a month from kWh per block) |
| `tests/economics-defaults.test.js` | 11.2; every figure of every crop and shown way has a default inside its own range and inside 4.2's limits, a confidence and known source ids; `checkFigure`'s words (number, whole, range); the room-size rules (20 ft at 40 m³, 40 ft above; humidifiers per 6 L/h; racks per block; blocks from the volume) |
| `tests/db-economics.test.js` | Version 26 from 25 (the table, the index, the trigger); set, clear, the scope sentinels; a room deleted takes its rows and leaves the farm's; the simulator row's start, done and failed keeping the value |
| `tests/economics.test.js` | The real Harvest, Batches and Sales on one farm: the counted runs (ended, not partial, with kg of the crop; an open run, a partial run and another room's left out); yield, loss 0 "in your yield", price tied and farm-wide, block price with an unpriced batch, kWh per block from the usage days (pending, before the kept days, a mixed run); the source order of every figure of 4.3; Settings' expected price and electricity price; one part throwing (logged, its figures fall to research with the note, `errors` names it); no rooms; the room-size research |
| `tests/api-economics.test.js` | The routes and their replies and refusals (7.1); the `economics` event on a save, a clear and a Work it out; Work it out with a stand-in `simulations`: working, done (kWh ÷ blocks, the run's figures saved), failed (the value kept), deleted, refused by the checks, a second one refused (409), the room's limit (409); the restart settling; the real simulations queue once on a short run (a 10-block room, 1 day) through to a saved figure, with `createEconomics` given no machines, poller or controller (it takes none: nothing it holds can switch a machine) |
| `tests/web-economics-route.test.js` | `#/business/economics` and its `room` and `crop`; the seventh tab, its strip; the other tabs unchanged |
| `tests/web-economics-math.test.js` | Every headline case of 8.2 (profit, past the write-off, loss, nothing sold; every second-sentence case and every equipment word, 0.2306 → "a quarter", 0.128 → "a tenth"); every row of 8.3 with a loss, never, no equipment; months words (0.5, 6.16, 9.99, 13.37, 1); the notes of 8.6; the not compared lines; the applies words; the sources line |
| `tests/web-economics-page.test.js` | For real with a fake container: typing recalculates the headline and table, an invalid figure keeps the last valid one and shows the refusal; a repaint keeps the cursor and never rewrites a box being typed in; a stale answer dropped; an older app stops the reads. Source checks: the mount, the events, the cards' order, the folds, the `.ec-` block (tokens only, the phone blocks, 44 px taps) |
| `tests/web-shell.test.js`, `tests/web-route.test.js` | Seven tabs; `'economics'` in `EVENT_TYPES` |
| Look | The UI/UX audit after the build: 1440, 1024, 390 and 360 px, both themes; a new farm, a room with runs, a Work it out working and failed, a Sales failure |

Test files use in-memory databases and servers on port 0; a look server uses a port from 19200 and a throwaway database under
`/tmp/economics/`.

## 12. Decisions beyond the design

| Decision | Why |
|---|---|
| The address is `#/business/economics?room=<id>&crop=<key>`, the seventh tab; no memory between visits | A link or reload keeps the room and crop; the Summary dropped the Business strip's last-tab memory, so this page keeps none of its own |
| Room and crop are two labelled selects, not a segmented control | Four crop names do not fit a segmented control at 360 px; Runs' Crop select and Calendar's selects are the existing part |
| The ways shown depend on the crop (4.1): the highland grower for lion's mane only, importing for black jelly and lion's mane, the lowland shed for the warm crops; lion's mane's lowland shed is its warm strain | A way that nobody uses for that crop is not a competitor; the reasons (appendix 1.9) are shown under the table, so nothing is hidden. The owner may overrule: the highland estimates for pink (×0.6) and black jelly (×0.7) are in the appendix |
| One table with four scopes (farm, crop, room, room and crop), `room_id` 0 and `crop` '' for "every", one row per key and source | A selling price or a wage is the farm's, not one room's; a container's price is the room's whatever it grows; the yield is the room's with that crop. Sentinels keep one plain unique index (no `NULL` in it) |
| A trigger deletes a room's figures when the room goes | Room ids are reused; Costs' triggers already do this, so `deleteRoom` stays untouched |
| Database version 26 | The login work (`feat/login`) merged first at 25 (938a61e), so Economics takes 26 (the contract's section 2 rule) |
| A run counts when ended, not partial, with kg of the crop picked; the actuals are read on each request, not stored | "Finished" is the owner's word; a partial run lacks its start, a run with no picks recorded says nothing about yield. Reading live keeps them right after any edit in Harvest, Sales or Batches |
| Your runs' yield is kg per block put in, and the loss then reads 0 ("counted in your yield") | Harvest's kg per block already divides by every block put in, the lost ones too; applying the loss again would count them twice |
| The price from your runs is the crop's sale lines tied to the counted runs (run, or room and day), else the crop's farm-wide sales over the runs' span | A sale's room is optional, so many sales are tied to nothing; farm-wide sales over the same weeks are still the farm's real price, and the note says so |
| Settings is a fifth source tag: the expected price (after your runs, before research) and the electricity price (always) | Both are the owner's own figures, already used by Harvest and Costs. The electricity price is not set on Economics, so Economics and Costs never disagree on it |
| kWh per block from your runs is the room's measured kWh over the runs' days ÷ all their blocks, from the usage days kept (400 days) | The energy serves every block in the room; the usage days are what Costs reads, with its own day-to-run rule, so the two pages agree |
| The model takes kWh a month: Your container's is kWh per block × blocks started a month; the other ways' is per house | The approved design asks for kWh per block (what runs and the simulator measure); the model page used kWh a month for the room. One conversion keeps both |
| Work it out goes through the simulations queue and is one of the room's simulations; Economics copies the result into its row | One worker, the queue's limits and the Simulation page's view for free; the copy keeps the figure when the run is pruned (20 kept per room) or deleted |
| Work it out runs one block life (1 to 90 days), the room's walls and weather from its newest simulation (else Simulate's defaults), the room's machines from Setup, the crop and the room's blocks | That is the figure the model needs (kWh per block over its life). The walls and weather describe the building and the weather, as Simulate's stepper already takes them from the last run |
| One Work it out per room and crop at a time (409 while working) | A second would only replace the first |
| The yield is one figure, per good block over all flushes; the model page's first-flush yield and second-flush share are not figures in stage 1 | Only the total moves the money; the runs and the research give totals. Stage 2's tornado decides how a change in flushes moves the yield |
| Import and resell takes one landed price in RM a kg (freight and duty in), not USD × rate + freight | One figure the owner can quote; black jelly's evidence is a landed RM price. Lion's mane's default is USD 8.10 × 4.057 + RM 8.00 = RM 40.86 with today's rate; the golden test feeds the page's 41.1047 |
| Every way gets your room's blocks; a shed, highland house or warm-strain shed holds up to 2,000 blocks; import sells your kg | "Options sized to that room's blocks" (the owner); 2,000 is the October defaults' house, and ⌈1,740 ÷ 2,000⌉ = 1 keeps the model page's numbers |
| Block price, selling price, shrink and packing are shared by every way | As the model page: the same block market and buyers; the highland grower's extra is its own block freight and transport |
| Your container's equipment defaults come from its size (a 40 ft over 40 m³), at today's prices; the owner enters what was paid | The farm's rooms are containers; the owner's real price beats any estimate, and the size rule gives a fair start |
| The payback counts the whole equipment even for a container already bought | The page plans; to see the running profit alone the owner sets the equipment to 0 (allowed) |
| Defaults changed from the model page: Daikin 2.5 hp RM 4,170 (was 3,940), racks RM 0.70 a block (was RM 3,000 per 2,000, unsourced), USD at 4.057 (was 4.087); kept: labour 0.75–1.0 h per 1,000 blocks a day (range widened to 4 h) | Today's prices (appendix section 2). The labour stays the owner-approved figure until the farm records its own, since a 4 h figure from sheds would decide the grey oyster verdict on one news story |
| Pink oyster's and black jelly's electricity per block: grey oyster's simulated 0.46 kWh over 60 days per block-day, over their own block life (low confidence) | No source can know this room's figure; Work it out is one button away |
| The money is worked out in the browser; the server only resolves the figures | One model module, the instant recalculation the owner asked for, and stage 2 reuses it; nothing to keep in step on the server |
| Figures in folds, one per way, not a wide table of ways | The same list works on a desk and a phone; the shared figures and Your container open, the rest a tap away |
| Save on leaving the box, recalculate on every keystroke | The owner sees the effect while typing; one save per change, not per key |
| The headline keeps the app's money format ("RM 3,003.16", not the approved sketch's "RM 3,003") and says "a kg" | The One Format Rule: the same figure reads the same on every page |
| The second sentence names the best other way and its equipment as a fraction | The approved sketch ("a highland grower makes RM 3,153 on a quarter of the equipment"); the fractions keep it plain and the table has the exact figure |
| Months: one decimal under 9.95, whole above, "under 1 month", "never" | The model page's rule, so "6.2 months" and "13 months" read as the owner saw them |
| The page and its routes are the owner's only | All of it is money; the login work closes any route not on its worker list |
| The crops are the four the owner named | The other crops have no research; adding one is a defaults entry and a test |

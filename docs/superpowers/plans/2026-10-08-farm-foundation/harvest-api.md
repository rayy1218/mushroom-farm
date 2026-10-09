# Work brief: Wave 2, Harvest API stream (C10 revision 2): `server/harvest-api.js` and `tests/harvest-api.test.js`

Revision 1, 2026-10-09 (C10 revision 2, C3 revision 9, C1 revision 6, lead decision 74; `master` after prep 2.0). Change log in section 11. Stream: **Harvest API** (wave 2). You are the implementer; reviewers check the work before the lead merges it.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 59–68 and 74 | `docs/contracts/LEAD-DECISIONS.md` | They override this brief and the contracts (62 extra routes, 63 no 409, 64 check order, 67 today, 68 archived and cleared; 74, added on `master` after the wave 2 freeze, makes the rules of section 4.4 binding: 9.4 whenever `placed_at` is set, the flush of 9.9, the 9.5 / 9.6 body texts and explicit `null`, the id check by `HttpError(404)` before the body rules, the test file header) |
| C10 revision 2 (batches and harvest) | `docs/contracts/harvest.md` | Sections 2, 4, 5.2, 5.4, 6, 7, 8.1–8.3, 9, 13 (row `tests/harvest-api.test.js`) |
| C3 revision 9 (HTTP API) | `docs/contracts/api.md` | Section 1 (status codes, ids, trimming style), 2.1 (the `ExtraRoute` table: match order, `needsRoom`, `hasBody`, `run(ctx)`, fault handling; the module table row `server/harvest-api.js`), 4 (error body, check order of an extra route), 4.1 (C10 rows of the mapping), 4.2 (database errors stop the server) |
| C1 revision 6 | `docs/contracts/db.md` | 6.1 (`NotFoundError`, node:sqlite error shape and codes); 7 (row `server/harvest-api.js`: `getRoom` only) |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 3 (Harvest API row), 3.1, 4 (stream rules), 5 step 3b (your merge) |
| Harvest plan | `docs/superpowers/plans/2026-10-09-harvest-qr/README.md` | Task 0.2 (`harvest-rules.js` code), 0.4 (the lead's files), step 1 |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/harvest-api.md` | Committed by the lead in prep 2.0; you do not edit it |

| Also | Path |
|---|---|
| Spec | `docs/superpowers/specs/2026-10-09-harvest-qr-design.md` |

## 1. Goal

| Outcome | Measure |
|---|---|
| The ten harvest routes exist as data | `createHarvestRoutes(opts)` returns ten `ExtraRoute` objects in C10 9 order, with the method, segments, `needsRoom` and `hasBody` of section 4.2 |
| Each route answers as C10 9 says | Every rule of C10 9, in its order, with the exact `error` and `details` texts; the reply status and shape of C10 6 |
| "Today" is the farm's day | `startOfDay(t)` is local midnight of the process time zone (C10 8.2), Malaysian midnight under `TZ=Asia/Kuala_Lumpur` |
| The routes plug into C3 without new code there | `run(ctx)` is synchronous, throws `HttpError` (from `server/api-common.js`) for a C10 7 error and lets every other error through unchanged, so Server 2's `createApi` answers them (C3 2.1, 4.1, 4.2) |
| Every C10 13 row of `tests/harvest-api.test.js` passes | Against the fake db and the fake harvest store, with a fixed `now` |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/harvest-api`, branch `stream/harvest-api`, made by the lead from `master` after prep 2.0. `<worktree>` below is this path. Never work in `/home/foqcus/Documents/mushroom-farm` itself (another developer uses it). |
| Git | Keep the configured identity; never change `git config`. Plain commit messages such as `feat(harvest-api): …`, `test(harvest-api): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase (the lead merges; wave 2 plan 4). |
| Models | Implementer on Sonnet, reviewers on Opus (wave 2 plan 4) |
| Reviews | A spec-compliance review and a code-quality review before the lead merges (wave 2 plan 4) |
| `master` stays green | The lead merges your branch at gate 2.5 step 3b, after Harvest data, and only then wires `server/main.js` (C10 8.4). So your branch tip must give `npm test` `# fail 0` on its own, and your module must never need `server/harvest-db.js`, `server/db.js` or `server/api.js`: the store and the db come in through `opts` |
| Contract questions | A gap or a contradiction in C10 or C3: stop that part, report it to the lead, and go on with the rest. Only the lead changes a contract |

| Check (from `<worktree>`) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/harvest-api` (never `master`) |
| `ls harvest-rules.js server/api-common.js server/harvest-schema.js tests/fakes/harvest-db.js tests/fakes/db.js docs/contracts/harvest.md` | All six listed (the lead's prep 2.0 files) |
| `node -e "const {HttpError}=require('./server/api-common.js'); const e=new HttpError(400,'x',['a']); console.log(e.name, e.status, e.error, e.details.length)"` | `HttpError 400 x 1` |
| `node -p "require('./controller.js'); require('./harvest-rules.js'); Object.keys(FarmHarvestRules).length"` | `9` |
| `node -p "const {openFakeDb}=require('./tests/fakes/db.js'); const {openFakeHarvest}=require('./tests/fakes/harvest-db.js'); Object.keys(openFakeHarvest(openFakeDb())).sort().join(' ')"` | `addCrate clearBatch countCrates createBatch deleteBatch getBatch getCrate listBatches listCrates placeBatch undoCrate updateBatch` (the 12 functions of C10 5.2) |
| `ls server/harvest-api.js tests/harvest-api.test.js` | Both missing (yours to create) |
| `npm test 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` | `# fail 0`. Write down `# pass` as `N0` and `# skipped` as `S0` (the prep 2.0 skips) |

Read C10 completely, and C3 sections 1, 2.1, 4, 4.1 and 4.2, before task 1.

## 3. Owned files (the only files you may touch; wave 2 plan section 3, Harvest API row)

| File | Action | Content |
|---|---|---|
| `server/harvest-api.js` | Create | `createHarvestRoutes(opts)` and `startOfDay(t)` (C10 8.2, 8.3, 9) |
| `tests/harvest-api.test.js` | Create | Section 6 |

| Not yours | Owner |
|---|---|
| `server/api.js` (mounting `opts.extraRoutes`, the room check of `needsRoom`, body reading, `HttpError` answering, `mapError` for `batch` / `crate`), `server/static.js` (`/harvest-rules.js`), `tests/api.test.js` | Server 2 |
| `server/main.js` (C10 8.4 wiring, `STUB_HARVEST_THROW` test) | Lead, gate 2.5 step 3b |
| `server/harvest-db.js`, `tests/harvest-db.test.js` (the real store) | Harvest data |
| `harvest-rules.js`, `server/api-common.js`, `server/harvest-schema.js`, `tests/fakes/db.js`, `tests/fakes/harvest-db.js`, `tests/fake-harvest-db.test.js`, `web/api.js`, `index.html`, `docs/contracts/*`, this brief | Lead (prep 2.0), then nobody |
| `web/batches.js`, `web/harvest.js`, `web/harvest.css` | Harvest web |
| `tests/api-real.test.js` (each C10 9 route once through the real server) | Lead, wave 3 |

## 4. What you build against

### 4.1 Contract sections

| Source | What you take from it |
|---|---|
| C10 6.1 Batch | `BatchRow` (the 15 columns, SQL order) plus `room_name` (`db.getRoom(room_id).name`, archived rooms included; `null` while received), `state` (`FarmHarvestRules.state`), `totals` (`FarmHarvestRules.totals(batch, crates)` over all crate rows of the batch; the rules skip undone crates) |
| C10 6.2 BatchDetail | Batch plus `flushes` (`FarmHarvestRules.flushes(batch, crates)`) and `crates`: the live crates (`deleted_at` `null`), `t` descending, then `id` descending |
| C10 6.3 Crate | `CrateRow` `{ id, batch_id, t, kg, picker, deleted_at }` as the store returns it |
| C10 6.4 RoomHarvest | `{ room: { id, name }, day_start, batches }`; `day_start = startOfDay(now())`; `batches` = the room's placed batches, `placed_at` ascending then `id`, each a Batch plus `flush` (the `n` of the last flush, `0` without crates) and `today` (`{ crates, kg }`: live crates with `t >= day_start`, newest first; `kg` their sum rounded to 2 decimals) |
| C10 6.5 CrateSaved | `{ crate, flush, totals }`: the new Crate, the `n` of the flush it joined (section 4.4), the batch's new totals |
| C10 7 | The `error` texts: 400 `Invalid batch`, `Invalid crate`, `Batch is already in a room`, `Batch is not in a room`, `Batch is cleared`, `Batch has crates`, `Crate is already undone`; 404 `Unknown batch`, `Unknown crate`. No 409 (lead decision 63) |
| C10 8.1 | `HttpError(status, error, details = [])` from `server/api-common.js` (the lead's file; one class for `server/api.js` and you) |
| C10 8.2 | The export, the `ExtraRoute` shape `{ method, segs, needsRoom, hasBody, run }`, `run(ctx)` with `ctx = { id, params, body, query }`, the order of checks (lead decision 64), the reserved segment names, the requires rule |
| C10 8.3 | `day_start = startOfDay(now())`; tests set `process.env.TZ = 'Asia/Kuala_Lumpur'` before the first `Date` call |
| C10 9 | Each route: rules in order (the first failing one answers), store calls, errors; the `details` texts of 9.1, 9.2, 9.4, 9.5, 9.6 (section 4.3); trimming of `strain`, `source`, `notes`, `picker` (empty after trimming → `null`); "now" is `opts.now()` |
| C10 4 | `FarmHarvestRules`: `state`, `flushes`, `totals`, `checkBatch(body, partial)`, `checkCrate(body)`, `DEFAULTS.flush_gap_days` (5). You call them; you never re-implement them |
| C10 5.2, 5.4 | The store functions you call and their errors (`NotFoundError` `batch`, `crate`, `room`; node:sqlite errors with C1's codes); the fake store has the same behaviour |
| C3 2.1 (`ExtraRoute` table) | `createApi` matches your routes after the C3 routes and before `/api/stream`; with `needsRoom` it runs the room check (404 `Unknown room`) and passes `ctx.id`; with `hasBody` it reads at most 1 MB and parses it with the `__proto__` reviver (400 `Body is larger than 1 MB` / `Body is not valid JSON`) before `run`; without `hasBody` `ctx.body` is `undefined`; `ctx.params` holds the raw `:name` strings; `ctx.query` is a `URLSearchParams`; the `{ status, body }` return is sent as JSON; a thrown `HttpError` is answered with its `status`, `error`, `details`; any other throw goes through `mapError` (C3 4.1) and, for a non-constraint node:sqlite error, `onFatal` (C3 4.2) |
| C3 4 (last paragraph), lead decision 64 | Inside `run`: the `:batchId` / `:crateId` check (404) first, then the body rules (400), then the state rules (400), then the store call. A bad id with valid JSON that breaks the body rules answers 404 |
| C1 6.1 | `NotFoundError` is recognised by `err.code === 'NOT_FOUND'` and `err.what`; a node:sqlite error has `code: 'ERR_SQLITE_ERROR'` and `errcode` |

### 4.2 Route table (the array `createHarvestRoutes` returns, in this order)

| # | `method` | `segs` | `needsRoom` | `hasBody` | Success status | Reply |
|---|---|---|---|---|---|---|
| 9.1 | `GET` | `['api', 'batches']` | `false` | `false` | 200 | Batch[] |
| 9.2 | `POST` | `['api', 'batches']` | `false` | `true` | 201 | Batch |
| 9.3 | `GET` | `['api', 'batches', ':batchId']` | `false` | `false` | 200 | BatchDetail |
| 9.4 | `PATCH` | `['api', 'batches', ':batchId']` | `false` | `true` | 200 | Batch |
| 9.5 | `POST` | `['api', 'batches', ':batchId', 'place']` | `false` | `true` | 200 | Batch |
| 9.6 | `POST` | `['api', 'batches', ':batchId', 'clear']` | `false` | `true` | 200 | Batch |
| 9.7 | `DELETE` | `['api', 'batches', ':batchId']` | `false` | `false` | 200 | Batch (as before the delete) |
| 9.8 | `GET` | `['api', 'rooms', ':id', 'harvest']` | `true` | `false` | 200 | RoomHarvest |
| 9.9 | `POST` | `['api', 'batches', ':batchId', 'crates']` | `false` | `true` | 201 | CrateSaved |
| 9.10 | `DELETE` | `['api', 'crates', ':crateId']` | `false` | `false` | 200 | Crate |

### 4.3 Rules of each route, in order (C10 9; the first failing rule answers)

| # | Rule, in order | Answer when broken (`error`; `details`) | Store and C1 calls on success |
|---|---|---|---|
| 9.1 | `state` absent, or one of `received`, `placed`, `cleared` | 400 `Invalid query`; `['state: must be received, placed or cleared']` | `listBatches({ state, room_id })` (`null` for an absent one), then per batch `getRoom` (for `room_name`, when placed or cleared) and `listCrates(id)` (for `totals`) |
| 9.1 | `room` absent, or a positive integer of a room that exists (archived rooms included) | 400 `Invalid query`; `['room: no such room']` | – |
| 9.1 | Any other query key | Ignored | – |
| 9.2 | `checkBatch(body, false)` is `[]` | 400 `Invalid batch`; the `checkBatch` problems | – |
| 9.2 | `received_at <= now` | 400 `Invalid batch`; `['received_at: must not be in the future']` | – |
| 9.2 | `spawn_date`, when not `null`, `<= now` | 400 `Invalid batch`; `['spawn_date: must not be in the future']` | `createBatch({ ...fields, flush_gap_days: body.flush_gap_days ?? 5 })` with the text fields trimmed (empty → `null`); reply the Batch, 201 |
| 9.3 | Batch id (section 4.4) | 404 `Unknown batch` | `getBatch`, `listCrates`; reply the BatchDetail |
| 9.4 | Batch id | 404 `Unknown batch` | – |
| 9.4 | `checkBatch(body, true)` is `[]` | 400 `Invalid batch`; the `checkBatch` problems | – |
| 9.4 | `received_at`, when given, `<= now` | 400 `Invalid batch`; `['received_at: must not be in the future']` | – |
| 9.4 | `received_at`, when given and the batch has a `placed_at` (placed or cleared), `<= placed_at` | 400 `Invalid batch`; `['received_at: must not be after the day it was placed']` | `updateBatch(id, fields)` with the text fields trimmed (empty → `null`); reply the Batch |
| 9.5 | Batch id | 404 `Unknown batch` | – |
| 9.5 | Body has only `room_id` and `placed_at` | 400 `Invalid batch`; one `<key>: unknown field` per other key | – |
| 9.5 | `room_id` a positive integer of a room that exists and is not archived (a non-integer and a missing `room_id` included) | 400 `Invalid batch`; `['room_id: no such room']` | `getRoom(room_id)` |
| 9.5 | `placed_at` (absent: `now`) an integer | 400 `Invalid batch`; `['placed_at: must be whole seconds since 1970']` | – |
| 9.5 | `placed_at >= received_at` | 400 `Invalid batch`; `['placed_at: must not be before the day it was received']` | – |
| 9.5 | `placed_at <= now` | 400 `Invalid batch`; `['placed_at: must not be in the future']` | – |
| 9.5 | The batch is received | 400 `Batch is already in a room`; `[]` | `placeBatch(id, room_id, placed_at)`; reply the Batch |
| 9.6 | Batch id | 404 `Unknown batch` | – |
| 9.6 | Body has only `cleared_at` (`{}` is allowed) | 400 `Invalid batch`; one `<key>: unknown field` per other key | – |
| 9.6 | `cleared_at` (absent: `now`) an integer | 400 `Invalid batch`; `['cleared_at: must be whole seconds since 1970']` | – |
| 9.6 | `cleared_at <= now` | 400 `Invalid batch`; `['cleared_at: must not be in the future']` | – |
| 9.6 | The batch is placed | Received: 400 `Batch is not in a room`; cleared: 400 `Batch is cleared`; `[]` | – |
| 9.6 | `cleared_at >= placed_at` | 400 `Invalid batch`; `['cleared_at: must not be before the day it was placed']` | `clearBatch(id, cleared_at)`; reply the Batch |
| 9.7 | Batch id | 404 `Unknown batch` | – |
| 9.7 | `countCrates(id) === 0` (undone crates count) | 400 `Batch has crates`; `[]` | The Batch read first, then `deleteBatch(id)`; reply the Batch as before the delete |
| 9.8 | Room check | Done by `createApi` before `run` (`needsRoom`): `run` gets `ctx.id` | `getRoom(ctx.id)` (for `room`), `listBatches({ state: 'placed', room_id: ctx.id })`, per batch `listCrates`; reply the RoomHarvest |
| 9.9 | Batch id | 404 `Unknown batch` | – |
| 9.9 | `checkCrate(body)` is `[]` | 400 `Invalid crate`; the `checkCrate` problems | – |
| 9.9 | The batch is placed (an archived room's batch counts, lead decision 68) | Received: 400 `Batch is not in a room`; cleared: 400 `Batch is cleared`; `[]` | `addCrate(id, { kg, picker, t: now })` (`picker` trimmed, empty or absent → `null`), then `listCrates(id)`; reply the CrateSaved, 201 |
| 9.10 | Crate id (section 4.4) | 404 `Unknown crate` | – |
| 9.10 | `deleted_at === null` (a crate of a cleared batch can be undone, lead decision 68) | 400 `Crate is already undone`; `[]` | `undoCrate(id, now)`; reply the Crate |

### 4.4 Rules this brief fixes (the contract leaves the detail open)

| Item | Rule |
|---|---|
| Id check | `:batchId` / `:crateId` must match `/^[1-9][0-9]{0,14}$/` (the C3 `ID_RE`). A string that does not match: `throw new HttpError(404, 'Unknown batch', [])` (or `'Unknown crate'`). Then `getBatch(id)` / `getCrate(id)`: a `NotFoundError` (`err.code === 'NOT_FOUND'`) becomes the same `HttpError`. This is the first thing `run` does, so the 404 comes before the body rules (C10 8.2, lead decision 64) |
| Other store errors | A `NotFoundError` from a later store call, a node:sqlite error, a `TypeError`, any other error: rethrown unchanged. Server 2's `mapError` answers `batch` / `crate` with 404 and a node:sqlite error with 500 (and `onFatal` for a non-constraint one; C3 4.1, 4.2) |
| Body not an object (9.5, 9.6) | `ctx.body` that is not a plain object (`null`, an array, a number): 400 `Invalid batch`, `['body: must be an object']` (the `checkBatch` text) |
| `placed_at` / `cleared_at` given as `null` | Not absent: it fails the integer rule (`… must be whole seconds since 1970`). Only a missing key (or `undefined`) takes `now` |
| Flush a crate joined (9.9) | After `addCrate`, `f = FarmHarvestRules.flushes(batch, listCrates(id))`; `flush` = the `n` of the flush whose `from <= crate.t <= to` (with `t = now` this is the last flush) |
| Trimming | `strain`, `source`, `notes` (9.2, 9.4) and `picker` (9.9): `typeof v === 'string' ? (v.trim() \|\| null) : v`, after `checkBatch` / `checkCrate` passed (they check the trimmed length) |
| `now` | `opts.now`, default `() => Math.floor(Date.now() / 1000)`; read once per `run` call |
| `run` | Synchronous (C3 2.1). It returns `{ status, body }`; it never writes to a response |
| Unknown `opts` key | Not defined by C10 8.2: do not throw and do not test it |
| Requires | `require('../controller.js')`, then `require('../harvest-rules.js')`, then read `globalThis.FarmHarvestRules`; `require('./api-common.js')`; `./db-common.js` only if you need it (the `err.code` test needs no class). Never `./db.js`, `./api.js`, `./harvest-db.js` (C10 8.2, C3 2.1 module table) |

## 5. Test file layout (`tests/harvest-api.test.js`)

| Item | Rule |
|---|---|
| Header (exact, block below) | The statement after `'use strict'` sets `process.env.TZ` (C10 8.3, 13), before any `require` and before anything can call `Date` |
| Requires | `node:test` as `test`, `node:assert/strict` as `assert`; `../server/api-common.js` (`HttpError`); `./fakes/db.js` (`openFakeDb`); `./fakes/harvest-db.js` (`openFakeHarvest`); `../controller.js`, `../harvest-rules.js` (for `FarmHarvestRules` in the totals checks); `../server/harvest-api.js` (`createHarvestRoutes`, `startOfDay`) |
| Clock | `const NOW = 1791450000;` (2026-10-08 17:00 farm time). `const DAY = 86400;` `setup()` keeps `let clock = NOW` and `now = () => clock`, and returns `setClock` |
| Known values (checked with `TZ=Asia/Kuala_Lumpur` on Node 22.20) | `startOfDay(NOW) === 1791388800` (2026-10-07T16:00:00Z); `startOfDay(1791388800) === 1791388800`; `startOfDay(1791388799) === 1791302400` |
| `setup()` | `db = openFakeDb({ now })`; `harvest = openFakeHarvest(db, { now })`; `room(name, { archived } = {})` = `db.createRoom({ name, volume: 60, settings: {} })`, then `db.archiveRoom(id)` when `archived`; `routes = createHarvestRoutes({ db, harvest, now })`. Returns `{ db, harvest, routes, room, call, setClock }` |
| `seed(harvest, over)` | `harvest.createBatch({ crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: NOW - 10 * DAY, ...over })`; a placed batch adds `harvest.placeBatch(b.id, roomId, NOW - 9 * DAY)`; crates at chosen times with `harvest.addCrate(b.id, { kg, picker: null, t })` (the route always uses `t = now`) |
| `GOOD` | The POST body `{ crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: NOW - DAY }` |
| `call(method, path, { id, body, query } = {})` | Splits `path` (no leading `/`) into segments, finds the one route with that `method` and matching `segs` (a `:name` segment matches any one segment; fails the test when none or two match), builds `params` from the `:name` segments, `ctx = { id: route.needsRoom ? id : undefined, params, body: route.hasBody ? body : undefined, query: new URLSearchParams(query \|\| '') }`, returns `route.run(ctx)`. It stands in for `createApi`: for 9.8 the test passes the room id itself, as `createApi` would after its room check |
| `assertHttp(fn, status, error, details)` | `assert.throws(fn, e => e instanceof HttpError && e.status === status && e.error === error && (details === undefined \|\| assert.deepStrictEqual(e.details, details) === undefined))` |
| "Nothing stored" | After each 400 or 404: the store reads (`listBatches()`, `getBatch(id)`, `listCrates(id)`) equal the reads before the call (`deepStrictEqual`) |
| Key lists | `BATCH_KEYS` = the 15 columns of C10 3 `batches` in SQL order; a Batch has `[...BATCH_KEYS, 'room_name', 'state', 'totals']`; a BatchDetail adds `flushes`, `crates`; a RoomHarvest batch adds `flush`, `today`. Assert with `Object.keys` in that order |
| Never assert | The order of keys inside `totals`, `flushes` or `today` beyond deep equality with `FarmHarvestRules`; which detail comes first when one body breaks two rules (every case breaks one rule); anything `createApi` does (section 6, task 9 note) |

```js
// Harvest routes (server/harvest-api.js). Contract: docs/contracts/harvest.md (C10) sections 6-9, C3 section 2.1.
'use strict';
process.env.TZ = 'Asia/Kuala_Lumpur';
```

## 6. Tasks (TDD: write the test, run it and see it fail, then implement, see it pass, commit)

Run one file with `node --disable-warning=ExperimentalWarning --test tests/harvest-api.test.js`. Commit after each task that ends green.

| # | Test(s) first (exact names) | Then build | Proves |
|---|---|---|---|
| 0 | – | Section 2 checks; read C10 and C3 2.1, 4. No commit | The prep 2.0 base is there |
| 1 | **`exports: createHarvestRoutes and startOfDay`**: `Object.keys(require('../server/harvest-api.js')).sort()` deep-equals `['createHarvestRoutes', 'startOfDay']`. **`routes: ten routes in C10 9 order`**: `routes.map(r => [r.method, r.segs, r.needsRoom, r.hasBody])` deep-equals section 4.2's table; every `run` is a function; `Object.keys` of each route is exactly `method, segs, needsRoom, hasBody, run`. **`routes: no reserved segment names`**: no segment of any route is `:versionId`, `:runId` or `:alarmKey` (lead decision 64, C3 2.1); the only `:id` is in 9.8. **`requires: never server/db.js, server/api.js or server/harvest-db.js`**: after the requires, none of the three resolved paths is a key of `require.cache` | The module, the route array (each `run` may throw `Error('todo')` for now) | C10 8.2, 8.4; C3 2.1 |
| 2 | **`startOfDay: Malaysian midnight`**: the three known values of section 5; `startOfDay(NOW + 7 * 3600)` (00:00 on 2026-10-09 farm time) is `1791475200` | `startOfDay`, exactly the C10 8.2 code | C10 8.2, 8.3; lead decision 67 |
| 3 | **`9.1 GET /api/batches: Batch list, order, room_name, state, totals`**: three batches (received, placed in `Room 1`, cleared) with crates (one undone): status 200; `received_at` descending then `id` descending; each Batch has the key list of section 5; `room_name` `null` while received, `'Room 1'` once placed; `state` per batch; `totals` deep-equals `FarmHarvestRules.totals(batchRow, harvest.listCrates(id))`. **`9.1 GET /api/batches: state and room filters`**: `state=placed` gives the placed batch only; `room=<id>` the batches of that room; a room archived after the batch was placed is accepted and its batch keeps `room_name`; an unknown query key (`x=1`) is ignored. **`9.1 GET /api/batches: bad query is 400 Invalid query`**: `state=open` → `['state: must be received, placed or cleared']`; `room=abc`, `room=0`, `room=999` → `['room: no such room']` | 9.1 | C10 6.1, 9.1 |
| 4 | **`9.2 POST /api/batches: 201 Batch, defaults, trimming`**: `GOOD` → status 201, a Batch with `state` `received`, `room_name` `null`, `flush_gap_days` 5, `created_at` `NOW`, `totals` `{ crates: 0, kg: 0, g_per_block: 0, be_pct: 0, flushes: 0 }`; `strain: '  PO-2 '` stored `'PO-2'`, `notes: '   '` stored `null`; `flush_gap_days: 7` kept. **`9.2 POST /api/batches: checkBatch problems are 400 Invalid batch, nothing stored`**: `{}` → the five `required` details of `checkBatch`; `{ ...GOOD, room_id: 1 }` → `['room_id: unknown field']`; `{ ...GOOD, block_count: 0 }` → the one `block_count` problem; each time the store is unchanged. **`9.2 POST /api/batches: dates in the future are 400 Invalid batch`**: `received_at: NOW + 1` → `['received_at: must not be in the future']`; `spawn_date: NOW + 1` → `['spawn_date: must not be in the future']`; `received_at: NOW` and `spawn_date: null` are accepted | 9.2 | C10 9.2, 4 |
| 5 | **`9.3 GET /api/batches/:batchId: BatchDetail with flushes and live crates newest first`**: a placed batch with crates at `NOW - 8 DAY`, `NOW - 7 DAY` and `NOW - 1 DAY` plus one undone: status 200, the BatchDetail key list, `flushes` deep-equals `FarmHarvestRules.flushes(row, allCrates)` (two flushes), `crates` the three live ones `t` descending (equal `t`: `id` descending), `totals` over all rows. **`ids: a bad or unknown :batchId is 404 Unknown batch`**: for each of 9.3, 9.4, 9.5, 9.6, 9.7, 9.9 and each of `abc`, `0`, `1.5`, `-1`, `999`: `assertHttp(…, 404, 'Unknown batch', [])`, nothing stored. **`ids: the id check comes before the body rules`**: 9.4 on `999` with `{ crop: 3 }`, 9.5 on `999` with `{ x: 1 }`, 9.9 on `999` with `{}`: each 404 `Unknown batch` (lead decision 64) | The id check of section 4.4 (a helper used by every batch route), 9.3 | C10 6.2, 7, 8.2, 9.3 |
| 6 | **`9.4 PATCH /api/batches/:batchId: changed fields only, trimming`**: `{ notes: ' moved to rack 2 ' }` → 200, the Batch with `notes` `'moved to rack 2'` and every other field unchanged; `{ strain: '' }` → `strain` `null`. **`9.4 PATCH /api/batches/:batchId: 400 Invalid batch`**: `{}` → `['body: at least one field is required']`; `{ room_id: 2 }` → `['room_id: unknown field']`; `{ received_at: NOW + 1 }` → `['received_at: must not be in the future']`; on a placed batch (placed `NOW - 9 DAY`) `{ received_at: NOW - 8 * DAY }` → `['received_at: must not be after the day it was placed']`, and the same on a cleared batch; on a received batch `{ received_at: NOW - 2 * DAY }` is accepted | 9.4 | C10 9.4 |
| 7 | **`9.5 place: 200 Batch, placed_at defaults to now`**: `{ room_id }` → 200, `state` `placed`, `room_name` `'Room 1'`, `placed_at` `NOW`; `{ room_id, placed_at: NOW - DAY }` keeps that time. **`9.5 place: body rules are 400 Invalid batch`**, each with nothing stored: `{ room_id, x: 1 }` → `['x: unknown field']`; `null` and `[]` → `['body: must be an object']`; `{}`, `{ room_id: 'abc' }`, `{ room_id: 1.5 }`, `{ room_id: 999 }` and an archived room → `['room_id: no such room']`; `placed_at: 1.5` and `placed_at: null` → `['placed_at: must be whole seconds since 1970']`; `placed_at` one second before `received_at` → `['placed_at: must not be before the day it was received']`; `placed_at: NOW + 1` → `['placed_at: must not be in the future']`. **`9.5 place: a placed or cleared batch is 400 Batch is already in a room`**: details `[]`, the batch unchanged | 9.5 | C10 9.5 |
| 8 | **`9.6 clear: 200 Batch; {} clears now`**: `{}` → 200, `state` `cleared`, `cleared_at` `NOW`; `{ cleared_at: NOW - DAY }` keeps it. **`9.6 clear: body, state and date rules in order`**: `{ x: 1 }` → `['x: unknown field']`; `{ cleared_at: 1.5 }` → `['cleared_at: must be whole seconds since 1970']`; `{ cleared_at: NOW + 1 }` → `['cleared_at: must not be in the future']`; a received batch → 400 `Batch is not in a room` (also with `cleared_at` before `received_at`: the state rule comes before the date order rule); a cleared batch → 400 `Batch is cleared`; a placed batch with `cleared_at` one second before `placed_at` → `['cleared_at: must not be before the day it was placed']`; nothing stored each time. **`9.7 DELETE /api/batches/:batchId: 200 Batch as before the delete`**: a received batch without crates → 200, the Batch (`state` `received`, `totals` zero); then 9.3 on the same id is 404 `Unknown batch`. **`9.7 DELETE: a batch with crates is 400 Batch has crates`**: a batch whose only crate is undone → 400 `Batch has crates`, `[]`, the batch still there | 9.6, 9.7 | C10 9.6, 9.7 |
| 9 | **`9.8 GET /api/rooms/:id/harvest: RoomHarvest`**: room 1 with two placed batches (placed `NOW - 9 DAY` and `NOW - 5 DAY`, the later one created first), one received batch, one cleared batch that was in room 1, and a placed batch of room 2: status 200; `room` deep-equals `{ id: 1, name: 'Room 1' }`; `day_start` `1791388800`; `batches` holds the two placed batches of room 1, `placed_at` ascending (then `id`), each with the RoomHarvest batch key list. **`9.8 today and flush`**: crates at `NOW - 8 * DAY`, `1791388799` (one second before midnight), `1791388800` (midnight), `NOW - 60` and one undone at `NOW - 30` on batch A: `today.crates` are the two live crates of today, newest first, `today.kg` their sum to 2 decimals (`0.1 + 0.2` gives `0.3`); the crate at `1791388799` is not in today; batch B without crates has `flush` 0 and `today` `{ crates: [], kg: 0 }`; batch A's `flush` is the `n` of its last flush (2: the crate at `NOW - 8 * DAY` is flush 1, today's crates flush 2) | 9.8 (`run` uses `ctx.id`; the room check is `createApi`'s) | C10 6.4, 8.3, 9.8; lead decision 67 |
| 10 | **`9.9 POST crates: 201 CrateSaved`**: on a placed batch `{ kg: 12.5, picker: '  Aminah ' }` → 201; `body` keys exactly `crate`, `flush`, `totals`; `crate` `{ id, batch_id, t: NOW, kg: 12.5, picker: 'Aminah', deleted_at: null }`; `totals` deep-equals `FarmHarvestRules.totals(row, harvest.listCrates(id))`; `{ kg: 3 }` and `{ kg: 3, picker: '' }` store `picker` `null`. **`9.9 POST crates: flush is the flush the crate joined`**: first crate → `flush` 1; with a seeded crate at `NOW - 6 * DAY` (gap 5 days) → `flush` 2; with a seeded crate at `NOW - 2 * DAY` → `flush` 1. **`9.9 POST crates: 400 Invalid crate, Batch is not in a room, Batch is cleared`**: `{}` → `['kg: required']`; `{ kg: 51 }` → `['kg: must be a number from 0.01 to 50 kg']`; `{ kg: 1, batch_id: 2 }` → `['batch_id: unknown field']`; a received batch → `Batch is not in a room`; a cleared batch → `Batch is cleared`; nothing stored each time. **`9.9 POST crates: a batch whose room was archived takes crates`**: archive the room after placing: 201 (lead decision 68) | 9.9 | C10 6.5, 9.9; lead decision 68 |
| 11 | **`9.10 DELETE /api/crates/:crateId: 200 Crate`**: → 200, the Crate with `deleted_at` `NOW`; the batch's totals no longer count it. **`9.10 DELETE: 404 Unknown crate, 400 Crate is already undone`**: `abc`, `0`, `1.5`, `999` → 404 `Unknown crate`, `[]`; a second undo → 400 `Crate is already undone`, `[]`, `deleted_at` keeps the first time (move the clock between the calls). **`9.10 DELETE: a crate of a cleared batch can be undone`**: clear the batch, then undo its crate → 200 (lead decision 68) | 9.10 | C10 9.10; lead decision 68 |
| 12 | **`store errors reach the caller unchanged`**: replace `harvest.addCrate` with a function that throws `E = Object.assign(new Error('CHECK constraint failed'), { code: 'ERR_SQLITE_ERROR', errcode: 275 })`; 9.9 on a placed batch: `assert.throws(() => call(…), e => e === E)` (the same object, not an `HttpError`); the same with `Object.assign(new Error('disk I/O error'), { code: 'ERR_SQLITE_ERROR', errcode: 10 })` from `harvest.listBatches` on 9.1 | Rethrow rule of section 4.4 | C10 8.2, 13; C3 4.1, 4.2 (`mapError` is Server 2's) |
| 13 | – | Section 7; commit; report (section 10) | |

| Point | Rule |
|---|---|
| Test names | Exactly as in bold above: 33 tests. Write each before its code |
| Not your tests | `createApi`'s part of an extra route (the `needsRoom` room check and 404 `Unknown room`, body size and JSON, answering an `HttpError`, `mapError` of `NotFoundError` `batch` / `crate`, `onFatal`) is Server 2's (`tests/api.test.js`, C10 13 Server 2 row). The real server, db and store are the lead's (gate 2.5 step 4, `tests/api-real.test.js` in wave 3) |
| Error checks | `assertHttp` with the exact `error` and the exact `details` array of section 4.3 |
| Time | The file runs in well under 1 s (fakes only) |

## 7. How to verify (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check server/harvest-api.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/harvest-api.test.js 2>&1 \| grep -E '^# (tests\|pass\|fail)'` | `# tests 33`, `# pass 33`, `# fail 0` |
| `npm test 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` | `# pass` = `N0` + 33; `# fail 0`; `# skipped` = `S0` |
| `TZ=UTC node --disable-warning=ExperimentalWarning --test tests/harvest-api.test.js 2>&1 \| grep -E '^# fail'` | `# fail 0` (the file sets its own time zone) |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `server/harvest-api.js` and `tests/harvest-api.test.js` |
| `grep -n "require(" server/harvest-api.js` | Only Node built-ins, `./api-common.js`, `./db-common.js`, `../controller.js`, `../harvest-rules.js` |
| `node -e "require('./server/harvest-api.js'); const p=require('node:path'); const k=Object.keys(require.cache).map(f=>p.relative(process.cwd(),f)); console.log(k.filter(f=>['server/db.js','server/api.js','server/harvest-db.js'].includes(f)).length)"` | `0` |
| `node -e "const {createHarvestRoutes}=require('./server/harvest-api.js'); console.log(createHarvestRoutes({db:{},harvest:{}}).map(r=>r.method+' /'+r.segs.join('/')).join(', '))"` | `GET /api/batches, POST /api/batches, GET /api/batches/:batchId, PATCH /api/batches/:batchId, POST /api/batches/:batchId/place, POST /api/batches/:batchId/clear, DELETE /api/batches/:batchId, GET /api/rooms/:id/harvest, POST /api/batches/:batchId/crates, DELETE /api/crates/:crateId` |
| `grep -c -e "409" -e "async " -e "emit(" server/harvest-api.js` | `0` |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git branch --show-current` | `stream/harvest-api` |
| `git status --short` | Empty |

## 8. Done when

| # | Item |
|---|---|
| 1 | `server/harvest-api.js` exports exactly `createHarvestRoutes` and `startOfDay`; the route array is section 4.2, in C10 9 order |
| 2 | Every rule of C10 9 answers in its order with the exact `error` and `details` of section 4.3; the 404 of a bad id comes before the body rules (lead decision 64) |
| 3 | Replies are the C10 6 shapes (Batch, BatchDetail, Crate, RoomHarvest, CrateSaved), with `totals` and `flushes` from `FarmHarvestRules`; 201 for 9.2 and 9.9, 200 otherwise |
| 4 | `startOfDay` is the C10 8.2 code; RoomHarvest's `today` starts at it |
| 5 | Store errors other than the id lookups reach the caller unchanged; `run` is synchronous and throws only `HttpError` for C10 7 errors |
| 6 | The module requires only the C10 8.2 list and never loads `server/db.js`, `server/api.js`, `server/harvest-db.js` |
| 7 | The 33 tests of section 6 exist, each seen failing before its code; `npm test` gives `# fail 0` with `N0` + 33 passes and `S0` skips |
| 8 | Only the two owned files changed; plain commits on `stream/harvest-api`; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Answer 409, or any status other than 200, 201, 400, 404 | Lead decision 63, C3 1 |
| Send a stream event or call the room manager | C10 9: the pages reload after each change; C3 10.2 |
| Mount the routes, read bodies, check the room of 9.8, or edit `server/api.js`, `server/static.js`, `server/main.js` | Server 2 and the lead (C3 2.1, C10 8.4) |
| Re-implement `checkBatch`, `checkCrate`, `state`, `flushes` or `totals`, or copy `LIM` values | `harvest-rules.js` is the one source (C10 4) |
| Make `run` async or return a Promise | C3 2.1: `run(ctx)` is synchronous |
| Catch and rewrite node:sqlite errors, or turn them into an `HttpError` | C3 4.2: a non-constraint error must stop the server through `mapError` and `onFatal` |
| Require `./db.js`, `./api.js` or `./harvest-db.js`, or open a database | C10 8.2; they come in through `opts` |
| Use the segment names `:versionId`, `:runId`, `:alarmKey` | Lead decision 64, C3 2.1 (`createApi` checks them on every matched route) |
| Use `Date` in tests before setting `process.env.TZ`, or depend on the machine's time zone | C10 8.3, 13 |
| Change `tests/fakes/harvest-db.js` or skip a test that fails on the fake | Report the difference to the lead |
| Write report or summary files; push, merge or rebase | The report is your final message; the lead merges |

## 10. Report to the lead (your final message)

| Item | Content |
|---|---|
| Commits | `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | `N0` and `S0` before; `# pass`, `# fail`, `# skipped` after; the 33 test names |
| Section 7 | The result of each command |
| Contract questions | Every gap or contradiction in C10 or C3 you met, with its section, and what you did (section 4.4 decisions included if a reviewer questions them) |
| Fake differences | Any place the fake store behaved unlike C10 5.2 (test name, section, behaviour) |

## 11. Change log

| Revision | Date | Changes |
|---|---|---|
| 0 | 2026-10-09 | First brief, from C10 revision 2, C3 revision 9, C1 revision 6, lead decisions 59–68 and the wave 2 plan (prep 2.0 step 6, harvest plan task 0.5) |
| 1 | 2026-10-09 | Lead decision 74 cited: the section 4.4 rules are binding |

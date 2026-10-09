# C10: Batches and harvest by room QR

Date: 2026-10-09. Status: **frozen** (revision 2, lead decision 69, 2026-10-09). Changes only through the lead; see `docs/contracts/LEAD-DECISIONS.md`.
Spec: `docs/superpowers/specs/2026-10-09-harvest-qr-design.md`. Plan: `docs/superpowers/plans/2026-10-09-harvest-qr/README.md`.
Folded into the wave 2 drafts on `wave2/contracts` (owner decision 2026-10-09): C1 revision 6, C3/C4 revision 9, C5/C6 revision 8, the wave 2 plan revision 2, lead decisions 1–68 (C10's are 59–68). Section 14 lists what C10 needed in those contracts; the lead folded every row in. Where C10 and those contracts disagree, the folded contracts win.

### Changes in revision 2

| Section | Change |
|---|---|
| 4, 9, 12.2, 12.3, 13 (combined checks, final round) | Harvest web keeps a pre-merge headless check with the `FarmShell.register` wrapper and a second load of its two scripts; the shell addresses stay the lead's wave 3 check. The 400 `details` texts of 9.1, 9.2, 9.5, 9.6. The harvest-db real store: the stand-in `DatabaseSync` until `UPGRADES` has version 4, then `openDb` (no edit at the gate); the upgrade 4 test is Data 2's. TZ line, `node:vm` for `qrcodegen`, `#btCrop` from `CROPS`, the tab and link labels, `DEFAULTS` meaning. |
| 7, 8.2, 8.4, 13 (lead rulings 2026-10-09) | Check order aligned with C3 (bad id + valid JSON breaking field rules → 404); reserved segment names; `openHarvest` failure at start-up; the Harvest web headless check mounts by hand on the gate 2.5 tree with `FARM_HOST=127.0.0.2` for the stickers, and the shell addresses move to the lead's wave 3 check (C5 7.10 wins). |
| Header, 14 | Folded into C1, C3, C5, the wave 2 plan and the spec (every row of section 14 applied); written first against 07f63c6, now on the wave 2 drafts after the buildability round (upgrade numbers unchanged: upgrade 4 after upgrades 2 (C9) and 3 (wave 2), `db.version` 4). |
| 15 | The proposals H1–H10 are recorded as lead decisions 59–68; every "H<n>" in this contract now names its decision. |

## 1. General rules

| Topic | Rule |
|---|---|
| Scope | Batches of bought, colonised blocks; harvest crates recorded from a phone opened by a room's QR sticker; flushes, g per block and BE %; the stickers page. Out of scope: spec "Out of scope". |
| Build | Inside wave 2 (lead decision 59): prep 2.0 adds the lead's harvest files (section 2); three more streams (Harvest data, Harvest API, Harvest web) run in parallel with the nine wave 2 streams. |
| Own files | Harvest code lives in new files. A shared file gets only the registration lines of section 14, written by its wave 2 owner or by the lead (lead decision 60). |
| Time | Integer seconds since 1970-01-01 00:00 UTC, as C1 and C3. Date-only values (received, placed, cleared, spawn) are local midnight of the farm device when the page sends a date. |
| Today | From local midnight of the farm device (`startOfDay`, section 8.3). The farm device runs with `TZ=Asia/Kuala_Lumpur` (README, Docs stream) (lead decision 67). |
| Status codes | C3's: 200, 201, 400, 404, 500 only. A state conflict is a 400 with its own `error` text (section 7) (lead decision 63). |
| Field names | Database column names (`snake_case`), as C3. |
| Validation | `harvest-rules.js` (section 4) and the route rules of section 9; the SQL constraints are the last guard (C1 section 1). |

## 2. Files and owners

| File | Prep 2.0 (lead) | Wave 2 owner | Content |
|---|---|---|---|
| `harvest-rules.js` | The real file (plan task 0.2) | nobody | Section 4; global `FarmHarvestRules` |
| `tests/harvest-rules.test.js` | The real file (plan task 0.2) | nobody | Section 13 |
| `web/vendor/qrcodegen.js` | Vendored, compiled (plan task 0.3) | nobody | Nayuki QR Code generator (MIT), pinned commit 3c6d0b3; global `qrcodegen` |
| `tests/qrcodegen.test.js` | The real file (plan task 0.3) | nobody | Section 13 |
| `server/harvest-schema.js` | The real file | nobody | `module.exports = { SCHEMA_V4_HARVEST }`: the exact SQL of section 3 |
| `server/api-common.js` | The real file | nobody | `module.exports = { HttpError }` (section 8.1) |
| `tests/fakes/harvest-db.js`, `tests/fake-harvest-db.test.js` | The real files | nobody | Section 5.4 |
| `server/harvest-db.js`, `tests/harvest-db.test.js` | – | Harvest data | Section 5 |
| `server/harvest-api.js`, `tests/harvest-api.test.js` | – | Harvest API | Sections 6–9 |
| `web/batches.js`, `web/harvest.js`, `web/harvest.css` | Stubs (the C5 1.4 wrapper registering nothing; an empty stylesheet) | Harvest web (replaces each) | Sections 11, 12 |
| `tests/web-batches.test.js`, `tests/web-harvest.test.js` | – | Harvest web | Section 13 |
| `index.html`, `web/api.js`, `tests/web-api.test.js`, `tests/fakes/api-server.js`, `tests/fake-api-server.test.js`, `tests/fakes/db.js` | The section 14 additions | nobody (as C5 1.1) | – |
| `server/db.js`, `tests/db.test.js` | – | Data 2 (section 14, C1 rows) | Upgrade 4 entry, `db.sqlite`, version 4 |
| `server/api.js`, `server/static.js`, `tests/api.test.js` | – | Server 2 (section 14, C3 rows) | `HttpError` from `api-common.js`, `opts.extraRoutes`, `/harvest-rules.js` |
| `web/shell.js`, `tests/web-shell.test.js` | – | Room shell (section 14, C5 rows) | The four routes, two module names, the bare layout |
| `server/main.js` | – | Lead at gate 2.5 (section 14) | Wiring of section 8.4 |

## 3. Schema upgrade 4 (exact SQL)

`SCHEMA_V4_HARVEST` in `server/harvest-schema.js`, the `sql` of upgrade 4 (`{ version: 4, sql: SCHEMA_V4_HARVEST }` in C1 `UPGRADES`), one transaction (C1 section 3). Only `CREATE TABLE` and `CREATE INDEX`. Checked on node:sqlite (Node 22.20) on 2026-10-09: every `CHECK` and foreign key below fires; a fraction in `t` gives 3091; an integer `kg` is stored as real.

```sql
-- Upgrade 4: batches and harvest by room QR (C10).

CREATE TABLE batches (
  id             INTEGER PRIMARY KEY,
  crop           TEXT    NOT NULL,
  strain         TEXT,
  source         TEXT,
  block_count    INTEGER NOT NULL CHECK (block_count >= 1),
  block_wet_kg   REAL    NOT NULL CHECK (block_wet_kg > 0),
  moisture_pct   REAL    NOT NULL CHECK (moisture_pct >= 0 AND moisture_pct < 100),
  spawn_date     INTEGER,
  received_at    INTEGER NOT NULL,
  room_id        INTEGER REFERENCES rooms (id),
  placed_at      INTEGER,
  cleared_at     INTEGER,
  flush_gap_days INTEGER NOT NULL DEFAULT 5 CHECK (flush_gap_days >= 1),
  notes          TEXT,
  created_at     INTEGER NOT NULL,
  CHECK ((room_id IS NULL) = (placed_at IS NULL)),
  CHECK (placed_at IS NULL OR placed_at >= received_at),
  CHECK (cleared_at IS NULL OR (placed_at IS NOT NULL AND cleared_at >= placed_at))
) STRICT;
CREATE INDEX batches_room ON batches (room_id, cleared_at);

CREATE TABLE harvest_crates (
  id         INTEGER PRIMARY KEY,
  batch_id   INTEGER NOT NULL REFERENCES batches (id),
  t          INTEGER NOT NULL,
  kg         REAL    NOT NULL CHECK (kg >= 0.01 AND kg <= 50),
  picker     TEXT,
  deleted_at INTEGER
) STRICT;
CREATE INDEX harvest_crates_batch ON harvest_crates (batch_id, t);
```

| Rule | Detail |
|---|---|
| `crop` has no `CHECK` | Like `readings.stage`: a new crop (lion's mane, lead decision 47) needs no table rebuild; `checkBatch` validates it |
| Upper limits | `block_count`, `block_wet_kg`, `flush_gap_days` and text lengths have no SQL upper limit; `harvest-rules.js` `LIM` holds them |
| Old databases | Upgrade 4 runs on a version 3 file (after upgrades 2 and 3 on older files); both tables start empty |

## 4. `harvest-rules.js` (`FarmHarvestRules`)

The code of plan task 0.2. Same module pattern as `room-rules.js`. Load order: `controller.js`, then this file (it reads `ClimateController.CROPS` at call time through the object captured at load). Pure: no database, no DOM.

| Member | Type or signature | Contract |
|---|---|---|
| `DAY` | `86400` | Seconds per day |
| `LIM` | `{ blocks: [1, 1000000], blockKg: 20, gapDays: [1, 60], kg: [0.01, 50], picker: 40, text: 80, notes: 2000 }` | Limits |
| `DEFAULTS` | `{ moisture_pct: 60, flush_gap_days: 5 }` | Form default (`moisture_pct`: `checkBatch` still requires it on create); create default (`flush_gap_days`, 9.2) |
| `state(batch)` | → `'received' \| 'placed' \| 'cleared'` | `cleared_at` set → `cleared`; else `room_id` set → `placed`; else `received` |
| `drySubstrateKg(batch)` | → number | `block_count × block_wet_kg × (1 − moisture_pct / 100)` |
| `flushes(batch, crates)` | → `Flush[]` | Crates with `deleted_at == null`, sorted by `t` then `id`; a crate whose `t` is at least `flush_gap_days × 86400` after the previous crate starts a new flush. Flush = `{ n, from, to, crates, kg, g_per_block, be_pct }` (`kg` 2 decimals, the other two 1 decimal). Does not change its input. |
| `totals(batch, crates)` | → `{ crates, kg, g_per_block, be_pct, flushes }` | Over the live crates; `flushes` is the count |
| `checkBatch(body, partial)` | → `string[]` | Fields `crop`, `strain`, `source`, `block_count`, `block_wet_kg`, `moisture_pct`, `spawn_date`, `received_at`, `flush_gap_days`, `notes`; create (`partial` false) requires `crop`, `block_count`, `block_wet_kg`, `moisture_pct`, `received_at`; edit (`partial` true) requires at least one field. Each problem is `field: problem`. |
| `checkCrate(body)` | → `string[]` | Fields `kg` (required, 0.01–50, message `kg: must be a number from 0.01 to 50 kg`) and `picker` (text ≤ 40 or `null`) |

## 5. Harvest store (`server/harvest-db.js`)

### 5.1 Export and rules

| Export | Arguments | Returns |
|---|---|---|
| `openHarvest(db, options?)` | `db`: the C1 db object (version 4 or newer); `options.now`: `() => integer seconds` (default `() => Math.floor(Date.now() / 1000)`) | The store (5.2). `TypeError` for an unknown option; `Error('Harvest needs schema version 4 or newer')` when `db.version < 4` |

| Rule | Detail |
|---|---|
| Connection | The store uses `db.sqlite`, the C1 connection (section 14, C1 row; lead decision 61), and prepares its statements once. It opens no connection of its own. |
| Like C1 | Section 1 of C1 applies: synchronous, plain-object rows, unknown keys throw `TypeError('<function>: unknown field "<key>"')` before writing, `undefined` and non-finite numbers bound as `NULL`, no business rules, SQL constraints as the last guard with C1's error codes |
| Room check | `placeBatch` and `listBatches({ room_id })` call `db.getRoom` first (archived rooms count) and pass on its `NotFoundError('room')` |
| Errors | `NotFoundError` from `server/db-common.js` with `what` `'batch'` (`Unknown batch <id>`) or `'crate'` (`Unknown crate <id>`) |

### 5.2 Functions

`BatchRow` = the 15 columns of `batches` in SQL order. `CrateRow` = the 6 columns of `harvest_crates` in SQL order.

| Function | Arguments | Returns | Errors |
|---|---|---|---|
| `createBatch(fields)` | `crop`, `strain`, `source`, `block_count`, `block_wet_kg`, `moisture_pct`, `spawn_date`, `received_at`, `flush_gap_days` (default 5), `notes`, `at` (default `now()`, stored as `created_at`) | `BatchRow` | `TypeError`; node:sqlite error |
| `getBatch(id)` | – | `BatchRow` | `NotFoundError('batch')` |
| `listBatches(options?)` | `state`: `'received'`, `'placed'`, `'cleared'` or `null` (default: all); `room_id`: integer or `null` | `BatchRow[]`, `received_at` descending, then `id` descending | `TypeError`; `RangeError` (bad `state`); `NotFoundError('room')` |
| `updateBatch(id, changes)` | Any of the 10 fields of `createBatch` except `at`; `{}` changes nothing | `BatchRow` after the change | `NotFoundError('batch')`; `TypeError` (`room_id`, `placed_at`, `cleared_at`, `created_at` included); node:sqlite error |
| `placeBatch(id, roomId, placedAt)` | integers | `BatchRow` | `NotFoundError('batch')`; `NotFoundError('room')`; node:sqlite error (275 for a date order) |
| `clearBatch(id, clearedAt)` | integer | `BatchRow` | `NotFoundError('batch')`; node:sqlite error (275) |
| `deleteBatch(id)` | – | `BatchRow` read before the delete | `NotFoundError('batch')`; node:sqlite error 787 when crate rows exist (the API checks `countCrates` first) |
| `countCrates(batchId)` | – | integer: every row, undone ones included | `NotFoundError('batch')` |
| `addCrate(batchId, crate)` | `kg`, `picker`, `t` (default `now()`) | `CrateRow` | `NotFoundError('batch')`; `TypeError`; node:sqlite error |
| `listCrates(batchId, options?)` | `from`: integer s or `null` (default): only `t >= from` | `CrateRow[]`, `t` ascending, then `id`; undone crates included | `NotFoundError('batch')`; `TypeError` |
| `getCrate(id)` | – | `CrateRow` | `NotFoundError('crate')` |
| `undoCrate(id, at?)` | `at` default `now()` | `CrateRow` with `deleted_at` set; already undone: unchanged (keeps the first time) | `NotFoundError('crate')` |

### 5.3 Who calls what

| Caller | Functions |
|---|---|
| `server/harvest-api.js` | All of 5.2 |
| `server/main.js` | `openHarvest` |

### 5.4 The fake (`tests/fakes/harvest-db.js`, lead, prep 2.0)

| Export | Arguments | Returns |
|---|---|---|
| `openFakeHarvest(db, options?)` | `db`: the C1 fake db (`openFakeDb`, version 4); `options.now` as 5.1 | A store with exactly the functions, orders, defaults and errors of 5.2, in memory |

| Behaviour | Fake |
|---|---|
| `NOT NULL`, `CHECK`, wrong type | `Error` with `code: 'ERR_SQLITE_ERROR'` and `errcode` 1299, 275, 3091 as C1 9.2, for every rule of section 3 |
| Foreign key | `deleteBatch` with crate rows: `errcode` 787 (it can happen through the store) |
| Room check | Through the fake db's `getRoom` |
| Its own test | `tests/fake-harvest-db.test.js` (lead): the shared cases of `tests/harvest-db.test.js` that do not need SQLite, run against the fake |

## 6. Resources

### 6.1 Batch

`BatchRow` (5.2) plus:

| Field | Type | Notes |
|---|---|---|
| `room_name` | str \| null | The room's name (archived rooms included); `null` while received |
| `state` | str | `received`, `placed` or `cleared` (`FarmHarvestRules.state`) |
| `totals` | object | `FarmHarvestRules.totals(batch, crates)` over all crate rows |

```json
{ "id": 4, "crop": "oyster", "strain": "PO-2", "source": "Kebun Jamur Sdn Bhd", "block_count": 1000, "block_wet_kg": 1.2,
  "moisture_pct": 60, "spawn_date": 1790812800, "received_at": 1791216000, "room_id": 1, "placed_at": 1791302400,
  "cleared_at": null, "flush_gap_days": 5, "notes": null, "created_at": 1791216300,
  "room_name": "Room 1", "state": "placed",
  "totals": { "crates": 4, "kg": 36, "g_per_block": 36, "be_pct": 7.5, "flushes": 2 } }
```

### 6.2 BatchDetail

Batch plus `flushes` (`FarmHarvestRules.flushes`) and `crates`: the live crates (`deleted_at` `null`), newest first (`t` descending, then `id` descending).

### 6.3 Crate

`CrateRow`: `{ id, batch_id, t, kg, picker, deleted_at }`.

### 6.4 RoomHarvest

| Field | Type | Notes |
|---|---|---|
| `room` | `{ id, name }` | |
| `day_start` | int | `startOfDay(now)` (8.3) |
| `batches` | array | The room's placed batches (`state` `placed`, this `room_id`), `placed_at` ascending, then `id`. Each is a Batch plus `flush` (int: `n` of the last flush, `0` without crates) and `today` (`{ crates: Crate[], kg }`: live crates with `t >= day_start`, newest first; `kg` their sum, 2 decimals) |

### 6.5 CrateSaved

`{ crate: Crate, flush: int, totals }`: the new crate, the `n` of the flush it joined, the batch's new totals.

## 7. Errors

The C3 error body (`{ error, details }`). New `error` texts:

| Status | `error` | When |
|---|---|---|
| 400 | `Invalid batch` | A batch body breaks `checkBatch` or a route rule of section 9 (dates, room) |
| 400 | `Invalid crate` | A crate body breaks `checkCrate` |
| 400 | `Batch is already in a room` | Place on a placed or cleared batch |
| 400 | `Batch is not in a room` | Clear or add a crate on a received batch |
| 400 | `Batch is cleared` | Clear or add a crate on a cleared batch |
| 400 | `Batch has crates` | Delete a batch with any crate row (undone ones count) |
| 400 | `Crate is already undone` | Undo of an undone crate |
| 404 | `Unknown batch` | `:batchId` is not a positive integer or matches no batch |
| 404 | `Unknown crate` | `:crateId` is not a positive integer or matches no crate |

C3's `Body is not valid JSON`, `Body is larger than 1 MB`, `Invalid query`, `Unknown room`, `Unknown route` and `Server fault` apply unchanged. C1 errors from the store: `NotFoundError` `batch` → 404 `Unknown batch`, `crate` → 404 `Unknown crate`, `room` → section 9; others as C3 4.1.

## 8. Routes module (`server/harvest-api.js`)

### 8.1 `HttpError` (`server/api-common.js`, lead, prep 2.0)

```js
// server/api-common.js: the error a route throws to answer with a C3 error body (C3 4, C10 8.1).
class HttpError extends Error {
  constructor(status, error, details = []) {
    super(error);
    this.name = 'HttpError';
    this.status = status;
    this.error = error;
    this.details = details;
  }
}
module.exports = { HttpError };
```

### 8.2 Export

| Export | Arguments | Returns |
|---|---|---|
| `createHarvestRoutes(opts)` | `opts.db`: the C1 db (or fake); `opts.harvest`: the store (or fake); `opts.now`: optional, as C3 `createApi` | `ExtraRoute[]`, in the order of section 9 |
| `startOfDay(t)` | integer s | integer s: local midnight (process time zone) of the day that holds `t` (`const d = new Date(t * 1000); d.setHours(0, 0, 0, 0); return Math.floor(d.getTime() / 1000);`) |

`ExtraRoute` = `{ method, segs, needsRoom, hasBody, run }`:

| Member | Contract |
|---|---|
| `method` | `GET`, `POST`, `PATCH` or `DELETE` |
| `segs` | Path segments, a `:name` segment matching any one segment (for example `['api', 'batches', ':batchId', 'crates']`) |
| `needsRoom` | `true` only for `GET /api/rooms/:id/harvest`: `createApi` runs its room check first (C3 4 order) and passes the room id as `ctx.id` |
| `hasBody` | `true`: `createApi` reads the body (1 MB, C3 1) and passes it parsed as `ctx.body`; `false`: the body is drained and ignored |
| `run(ctx)` | `ctx` = `{ id, params, body, query }` (`params`: the raw `:name` strings; `query`: a `URLSearchParams`). Synchronous. Returns `{ status, body }`; throws `HttpError` for a section 7 error; any other throw goes through C3's `mapError` (a non-constraint SQLite error stops the server, C3 4.2) |

| Rule | Detail |
|---|---|
| Order of checks | C3's order up to the body (route, room for `needsRoom`, body size and JSON), then inside `run`: the `:batchId` / `:crateId` check (404), the body rules (400), the state rules (400), the store call. So a bad id with a body that is not valid JSON or is over 1 MB answers 400 (`createApi` reads the body first), and a bad id with valid JSON that breaks the field rules answers 404 (lead decision 64; C3 4) |
| Reserved segment names | An extra route never uses `:versionId`, `:runId` or `:alarmKey`: `createApi` checks those names on every matched route (C3 2.1) |
| Requires | Node built-ins, `./api-common.js`, `./db-common.js`, `../controller.js` and `../harvest-rules.js` (through `globalThis` after `require`). Never `./db.js`, `./api.js`, `./harvest-db.js` (they come in through `opts`). |

### 8.3 Today

`day_start = startOfDay(now())`. The README (Docs stream) tells the farmer to run the service with `TZ=Asia/Kuala_Lumpur` (systemd `Environment=TZ=Asia/Kuala_Lumpur`). Tests set `process.env.TZ = 'Asia/Kuala_Lumpur'` before the first `Date` call.

### 8.4 Wiring (`server/main.js`, lead at gate 2.5)

```js
const { openHarvest } = require('./harvest-db.js');
const { createHarvestRoutes } = require('./harvest-api.js');
// after rooms.start():
const harvest = openHarvest(db);
const api = createApi({ db, rooms, root, onFatal: fatal, extraRoutes: createHarvestRoutes({ db, harvest }) });
```

| Failure | Rule |
|---|---|
| `openHarvest` throws | As an `openDb` failure: `main.js` prints `Cannot open the harvest records: <message>` to stderr, `rooms.stop()`, `db.close()`, exit 1 (C3 2.2 step 4) |

## 9. Routes

Every route can also answer 404 `Unknown route`, 400 `Body is not valid JSON` / `Body is larger than 1 MB` (routes with a body) and 500 `Server fault`. Text fields `strain`, `source`, `notes`, `picker` are trimmed; empty after trimming is stored as `null`. "Now" is `opts.now()`.

| # | Method | Path | Body or query | Success | Reply |
|---|---|---|---|---|---|
| 9.1 | GET | `/api/batches` | `?state=&room=` | 200 | Batch[] |
| 9.2 | POST | `/api/batches` | batch fields | 201 | Batch |
| 9.3 | GET | `/api/batches/:batchId` | – | 200 | BatchDetail |
| 9.4 | PATCH | `/api/batches/:batchId` | any of the batch fields | 200 | Batch |
| 9.5 | POST | `/api/batches/:batchId/place` | `{ room_id, placed_at? }` | 200 | Batch |
| 9.6 | POST | `/api/batches/:batchId/clear` | `{ cleared_at? }` (`{}` allowed) | 200 | Batch |
| 9.7 | DELETE | `/api/batches/:batchId` | – | 200 | Batch (as before the delete) |
| 9.8 | GET | `/api/rooms/:id/harvest` | – | 200 | RoomHarvest |
| 9.9 | POST | `/api/batches/:batchId/crates` | `{ kg, picker? }` | 201 | CrateSaved |
| 9.10 | DELETE | `/api/crates/:crateId` | – | 200 | Crate |

| # | Rules, in order (first failing one answers) | Store calls | Errors |
|---|---|---|---|
| 9.1 | `state`: absent, or `received` / `placed` / `cleared` (else `details` `state: must be received, placed or cleared`); `room`: absent, or a positive integer (a room that exists, archived included; else `room: no such room`); other query keys ignored | `listBatches({ state, room_id })`, then per batch `getRoom` (name) and `listCrates` (totals) | 400 `Invalid query` (bad value, or an unknown `room`) |
| 9.2 | `checkBatch(body, false)`; `received_at <= now` (`received_at: must not be in the future`); `spawn_date`, when set, `<= now` (`spawn_date: must not be in the future`) | `createBatch({ ...fields, flush_gap_days: body.flush_gap_days ?? 5 })` | 400 `Invalid batch` |
| 9.3 | Batch id | `getBatch`, `listCrates` | 404 `Unknown batch` |
| 9.4 | Batch id; `checkBatch(body, true)`; `received_at <= now`; when placed, `received_at <= placed_at` (`received_at: must not be after the day it was placed`) | `updateBatch` | 404 `Unknown batch`; 400 `Invalid batch` |
| 9.5 | Batch id; body has only `room_id` and `placed_at` (another key: `<key>: unknown field`); `room_id` a positive integer of a room that exists and is not archived (otherwise, a non-integer included: `room_id: no such room`); `placed_at` (default now) an integer (`placed_at: must be whole seconds since 1970`), `>= received_at` (`placed_at: must not be before the day it was received`), `<= now` (`placed_at: must not be in the future`); then the batch is received | `getRoom`, `placeBatch(id, room_id, placed_at)` | 404 `Unknown batch`; 400 `Invalid batch`; 400 `Batch is already in a room` |
| 9.6 | Batch id; body has only `cleared_at` (another key: `<key>: unknown field`); `cleared_at` (default now) an integer (`cleared_at: must be whole seconds since 1970`), `<= now` (`cleared_at: must not be in the future`); then the batch is placed (received: `Batch is not in a room`; cleared: `Batch is cleared`); then `cleared_at >= placed_at` (`cleared_at: must not be before the day it was placed`) | `clearBatch(id, cleared_at)` | 404 `Unknown batch`; 400 `Invalid batch`; 400 `Batch is not in a room`; 400 `Batch is cleared` |
| 9.7 | Batch id; `countCrates(id) === 0` | `deleteBatch` | 404 `Unknown batch`; 400 `Batch has crates` |
| 9.8 | Room check by `createApi` (`needsRoom`) | `listBatches({ state: 'placed', room_id: id })`, per batch `listCrates` | 404 `Unknown room` |
| 9.9 | Batch id; `checkCrate(body)`; batch received → `Batch is not in a room`; cleared → `Batch is cleared`. A batch whose room was archived later still takes crates (lead decision 68) | `addCrate(id, { kg, picker, t: now })`, `listCrates` | 404 `Unknown batch`; 400 `Invalid crate`; 400 `Batch is not in a room`; 400 `Batch is cleared` |
| 9.10 | Crate id; `deleted_at === null`. A crate of a cleared batch can be undone (lead decision 68) | `undoCrate(id, now)` | 404 `Unknown crate`; 400 `Crate is already undone` |

No route sends a stream event (C4 unchanged): the phone and the batch pages reload after each change.

## 10. Static files and `index.html`

| Item | Rule |
|---|---|
| `/harvest-rules.js` | Served like the shared modules (C3 9, `text/javascript; charset=utf-8`); the fake API server serves it too (C5 4.5) |
| `/web/vendor/qrcodegen.js`, `/web/harvest.css`, `/web/batches.js`, `/web/harvest.js` | Already covered by C3 9's `/web/<path>` rule (subfolders allowed) |
| `index.html` | Section 14, C5 1.2 row: one stylesheet link, one menu link, four script tags |

## 11. Shell routes (C5 2.1, built by Room shell)

| Hash | Module | `params` | Menu link marked |
|---|---|---|---|
| `#/batches` | `batches` | `{}` | Batches |
| `#/batches/:id` | `batches` | `{ id: Number(id) }` | Batches |
| `#/harvest/stickers` | `harvest` | `{ view: 'stickers' }` | Batches |
| `#/harvest/:id` | `harvest` | `{ view: 'record', id: Number(id) }` | none |

| Rule | Detail |
|---|---|
| Order | `#/harvest/stickers` is matched before `#/harvest/:id` (`stickers` is not an id anyway) |
| Names | `FarmShell.register` accepts `batches` and `harvest`; `FarmShell.MENU_NAMES` adds `batches: 'Batches'`, `harvest: 'Harvest'` |
| Menu link of `harvest` | `#/harvest/stickers` marks the **Batches** link; `#/harvest/:id` marks none |
| Bare layout (lead decision 66) | At step 5 of C5 2.3 the shell sets `document.body.dataset.layout = 'bare'` for `#/harvest/:id` and deletes `data-layout` for every other route. `web/harvest.css` hides `.bar` under `body[data-layout="bare"]`. Modules never touch `document.body` (C5 3.1). |

## 12. Web modules (Harvest web stream)

### 12.1 `FarmApi` functions (C5 4.3, lead, prep 2.0)

| Function | Route | Arguments | Resolves to |
|---|---|---|---|
| `listBatches({ state, room })` | `GET /api/batches?state=&room=` | both optional | `Batch[]` |
| `createBatch(fields)` | `POST /api/batches` | batch fields | `Batch` |
| `getBatch(batchId)` | `GET /api/batches/:batchId` | – | `BatchDetail` |
| `updateBatch(batchId, fields)` | `PATCH /api/batches/:batchId` | changed fields | `Batch` |
| `placeBatch(batchId, body)` | `POST /api/batches/:batchId/place` | `{ room_id, placed_at? }` | `Batch` |
| `clearBatch(batchId, body = {})` | `POST /api/batches/:batchId/clear` | `{ cleared_at? }`; always sends a body | `Batch` |
| `deleteBatch(batchId)` | `DELETE /api/batches/:batchId` | – | `Batch` |
| `getRoomHarvest(id)` | `GET /api/rooms/:id/harvest` | – | `RoomHarvest` |
| `addCrate(batchId, body)` | `POST /api/batches/:batchId/crates` | `{ kg, picker? }` | `CrateSaved` |
| `undoCrate(crateId)` | `DELETE /api/crates/:crateId` | – | `Crate` |

`query` values follow C5 4.1; `state` is a string (the one non-integer query value; left out when `undefined` or `null`).

### 12.2 Files

| File | Registers | Node export (last statement inside the wrapper, as C5 7.8) |
|---|---|---|
| `web/batches.js` | `batches` | `{ dateToSeconds, secondsToDate, ageDays, batchBody }` |
| `web/harvest.js` | `harvest` | `{ parseKg, summaryText, stickerLink, isLocalHost, qrSvg }` |
| `web/harvest.css` | – | Every `.bt-*`, `.bd-*`, `.hv-*`, `.st-*` class; the bare layout rule; the print rules of 12.5 |

| Helper | Contract |
|---|---|
| `dateToSeconds('YYYY-MM-DD')` | 00:00 farm time (UTC+8, the farm device's `TZ=Asia/Kuala_Lumpur`, lead decision 67) in seconds: `Date.UTC(y, m − 1, d) / 1000 − 8 × 3600`, whatever the browser's time zone; `null` for an empty or invalid string |
| `secondsToDate(t)` | `'YYYY-MM-DD'` of the farm date: `new Date((t + 8 × 3600) × 1000)` read with the UTC getters (`getUTCFullYear`, `getUTCMonth`, `getUTCDate`) |
| `ageDays(from, now)` | Whole days, `Math.floor((now − from) / 86400)` |
| `batchBody(form)` | The C10 batch body from the form values: numbers parsed, dates through `dateToSeconds`, empty text left out on create and sent as `null` on edit |
| `parseKg(text)` | Accepts `12.5`, `12,5`, ` 12.5 `; `null` for anything else (no unit, no sign) |
| `summaryText(batch)` | `Flush <flush> · <today.kg> kg today · <n> crate(s)` (`1 crate`, `5 crates`); `No crates today` when `today.crates` is empty |
| `stickerLink(origin, roomId)` | `<origin>/#/harvest/<roomId>` |
| `isLocalHost(hostname)` | `true` for `localhost`, `127.0.0.1`, `[::1]`, `::1` |
| `qrSvg(qrcodegen, text)` | SVG text: `QrCode.encodeText(text, Ecc.QUARTILE)`, 4-module quiet zone, one `<path>`, `shape-rendering="crispEdges"`, `class="st-qr"` |

### 12.3 Batches pages (`batches`)

| Part | Ids and behaviour |
|---|---|
| List `#/batches` | Tabs `#btTabReceived` `Received`, `#btTabPlaced` `In rooms` (default), `#btTabCleared` `Cleared` (`aria-pressed`); `#btList` rows `tr[data-id]` with crop name, strain, room, age in days (from `placed_at`, or `received_at` while received), kg, g per block, BE %; a row opens `#/batches/<id>`; `#btStickers` `Print QR stickers` links to `#/harvest/stickers`; message line `#btMsg` |
| New batch | Form `#btForm`: `#btCrop` (a `<select>` of the crops with a fruiting range, by name), `#btStrain`, `#btSource`, `#btCount`, `#btKg`, `#btMoist` (60), `#btReceived` (date, today), `#btSave`. Save → `createBatch`; a 400 shows its `details` in `#btMsg`; success reloads the list on **Received** |
| Detail `#/batches/:id` | `#bdHead` (crop, strain, state); details form `#bdForm` with the batch fields plus `#bdGap` and `#bdNotes`, `#bdSave` (`updateBatch` with the changed fields only); `#bdWait` `Received to placed: <n> days` once placed; `#bdRoom` (a `<select>` of `listRooms()`) and `#bdPlace` while received; `#bdClear` while placed; `#bdDelete` while `totals.crates === 0`; `#bdFlushes` rows (flush, first and last date, kg, g per block, BE %); `#bdCrates` rows (time, kg, picker) each with `button[data-undo="<crateId>"]`; `#bdMsg`. Clear, Delete and Undo ask `confirm()` first. Unknown batch: `This batch does not exist.` with a link to `#/batches` |

### 12.4 Phone page (`harvest`, `view: 'record'`)

| Part | Ids and behaviour |
|---|---|
| Load | `getRoomHarvest(id)`. 404 `Unknown room`: `This room does not exist or is archived.` and nothing else |
| `#hvRoom` | The room name |
| Batch picker `#hvPick` | One placed batch: picked at once, no picker. Several: one large `button[data-batch="<id>"]` each (crop name, strain, placed date). None: `#hvNone` `No batch in this room. Ask the office to place one.` `#hvChange` (**Change batch**) returns to the picker when there are several. |
| Name `#hvName` | Optional; kept in `localStorage['farm.picker']`; sent as `picker` |
| Weigh | `#hvKg` (`inputmode="decimal"`), `#hvAdd` (**Add crate**). `parseKg` `null` → `#hvMsg` `Type the weight in kg, for example 12.5` without a request. `#hvAdd` is disabled from the click until the reply, so a double tap sends one request. |
| Saved | The field is emptied, `getRoomHarvest` reloads, `#hvSummary` shows `summaryText`, `#hvToday` lists today's crates (`li[data-crate]`: time, kg, picker, `button[data-undo]`), the focus returns to `#hvKg` |
| Failures | Status 0 or 500: the value stays, `#hvMsg` (class `err`) `Not saved: check Wi-Fi and press Add crate again`. 400 `Invalid crate`: the first `details` entry. 400 `Batch is cleared` or `Batch is not in a room`, 404 `Unknown batch`: `This batch was cleared`, then the picker reloads. |
| Undo | `confirm('Undo the crate of <kg> kg?')`, then `undoCrate`, then reload |

### 12.5 Stickers (`harvest`, `view: 'stickers'`)

| Part | Ids and behaviour |
|---|---|
| Cards | `listRooms()`; one `.st-card[data-room="<id>"]` per room: `.st-name` (room name), the `qrSvg` of `stickerLink(location.origin, id)`, `.st-link` (the link as text), `Scan to record harvest` |
| Address check | `isLocalHost(location.hostname)`: `#stWarn` `Open this page from the farm address (for example http://192.168.1.20:8080); phones cannot reach localhost.` and `#stPrint` disabled. Otherwise `#stPrint` calls `window.print()` |
| Advice `#stAdvice` | `Laminate the stickers or print on waterproof labels: the rooms run at 90 % humidity.` and `Give the farm device a fixed address on the router; if its address changes, every sticker stops working.` |
| Print CSS | `@page { size: A4; margin: 10mm }`; `.st-card` 90 mm × 88 mm, `break-inside: avoid`, two per row (6 per page); the QR 60 mm; `.bar`, buttons, `#stWarn`, `#stAdvice` hidden |

## 13. Tests

| File | Owner | Proves |
|---|---|---|
| `tests/harvest-rules.test.js` | Lead (prep 2.0) | Plan task 0.2: 43 tests (members, state, dry substrate, flush grouping at and under the gap, deleted crates, totals, rounding, every `checkBatch` and `checkCrate` rule and limit) |
| `tests/qrcodegen.test.js` | Lead (prep 2.0) | Plan task 0.3: the recorded fingerprint of `http://192.168.1.20:8080/#/harvest/3` at Q (version 4, size 33, mask 3, sha-256 of the matrix) and the three finder patterns |
| `tests/fake-harvest-db.test.js` | Lead (prep 2.0) | The fake store against 5.2 and 5.4 |
| `tests/harvest-db.test.js` | Harvest data | Every case defined once and run on `openFakeHarvest(openFakeDb())` and on a real store. The real store is `openHarvest(openDb(':memory:'))` when `require('../server/db.js').UPGRADES.some(u => u.version === 4)` (from gate 2.5), else `openHarvest` over this stand-in (no edit at the gate): `const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived_at INTEGER) STRICT;'); sqlite.exec(SCHEMA_V4_HARVEST); const getRoom = id => { const r = sqlite.prepare('SELECT * FROM rooms WHERE id = ?').get(id); if (!r) throw new NotFoundError('room', id); return { ...r }; };` with `db = { version: 4, sqlite, getRoom }`. Cases: each function's shape, order, defaults and errors; each `CHECK` (275), `NOT NULL` (1299), wrong type (3091) with nothing stored; `deleteBatch` with crates → 787; `undoCrate` twice keeps the first time; `listCrates({ from })` inclusive. Real only: `openHarvest` on a db with `version` 3 throws. (Upgrade 4 on a version 3 file is Data 2's test, C1 8.) |
| `tests/harvest-api.test.js` | Harvest API | `process.env.TZ = 'Asia/Kuala_Lumpur'` first. Each route's `run` against the fake db and fake store with a fixed `now`: reply status and shape; every 400 and 404 of section 9 with nothing stored; `startOfDay` (Malaysia midnight; a `t` one second before midnight belongs to the day before); RoomHarvest `today` and `flush`; a 404 for a non-integer id; a constraint error thrown by a replaced store function reaches `mapError` (rethrown, not an `HttpError`) |
| `tests/web-batches.test.js`, `tests/web-harvest.test.js` | Harvest web | Both set `process.env.TZ = 'Asia/Kuala_Lumpur'` first (the farm-time helpers must not depend on it; the line keeps the tests the same on any machine). Node: every helper of 12.2 (`dateToSeconds` / `secondsToDate` give farm dates; `parseKg('12,5')` is 12.5, `parseKg('12kg')` is `null`; `summaryText` singular and plural; `isLocalHost`; `qrSvg` holds one path and `crispEdges`, and its module count matches `qrcodegen` for the same text, with `web/vendor/qrcodegen.js` loaded through `node:vm` as `tests/qrcodegen.test.js` does, since `require` gives no global); the `#btCrop` options derive from `ClimateController.CROPS` (the crops with a fruiting range, lion's mane included once Equipment has merged) |
| Headless Chrome, Harvest web (after gate 2.5) | Harvest web | On the gate 2.5 tree (the wave 1 `web/shell.js` does not know the C10 routes). In the page: `const mods = {}; const reg = FarmShell.register; FarmShell.register = (n, m) => { mods[n] = m; reg(n, m); };`, then load `/web/harvest.js` and `/web/batches.js` once more with `script` elements, awaiting each `onload` (they are IIFEs, so the second copy is harmless; this is a module check, not a tab check, so C5 3.9's no-injection rule does not apply), then mount `mods.harvest` / `mods.batches` in the emptied `#view` (lead ruling 2026-10-09); the check sets `document.body.dataset.layout = 'bare'` itself for the phone page. At 390 × 844 with `{ view: 'record', id: 1 }` against the real server with one placed batch: `web/harvest.css` hides `.bar`; batch picked at once; a double tap on **Add crate** stores one crate; with the server stopped the value stays and the red line shows; Undo removes the crate. Two placed batches: the picker shows two buttons. Stickers (`{ view: 'stickers' }`): opened as `http://127.0.0.1:…`, Print disabled and `#stWarn` shown; with the server started with `FARM_HOST=127.0.0.2` and opened as `http://127.0.0.2:…`, one card per room. Batches (`{}`, then `{ id }`): create, place, see the crates and flushes, clear. No console errors |
| Headless Chrome, through the shell (wave 3) | Lead | The real addresses `#/batches`, `#/batches/:id`, `#/harvest/stickers`, `#/harvest/:id` through the Room shell's `web/shell.js`, with the shell's bare layout on `#/harvest/:id` (no menu bar) |
| `tests/api.test.js` (Server 2) | Server 2 | `createApi` with `opts.extraRoutes` of one test route: its `run` gets `ctx.id` after the room check (`needsRoom`), `ctx.body` parsed, the 1 MB limit, an `HttpError` answered with its status, `error` and `details`; a C3 route still wins over an extra route with the same path; `/harvest-rules.js` served |
| `tests/api-real.test.js` (wave 3) | Lead | Each section 9 route once through the real server, db and store |
| Phone check (wave 3) | Lead | A printed sticker scanned by a real phone on the farm Wi-Fi records two crates; one Undo; both seen on `#/batches/:id` |

## 14. What C10 needs in the wave 2 contracts and plan (folded)

The lead folded these into the wave 2 drafts (revision 2; lead decisions 59–68).

| Contract | Section | Change |
|---|---|---|
| C1 | 3 | `UPGRADES` gets `{ version: 4, sql: SCHEMA_V4_HARVEST }` (`require('./harvest-schema.js')`, the lead's prep 2.0 file); `db.version` is 4; "Later modules add their tables this way" now has its first case |
| C1 | 6.3 | New member `db.sqlite`: the `DatabaseSync` connection, read-only, for `server/harvest-db.js` only (lead decision 61). Fake: `sqlite` is `null` |
| C1 | 8 | `Open ':memory:'`: version 4, `batches`, `harvest_crates` and their indexes exist. New row "Upgrade 4 from version 3": a file opened with `UPGRADES.slice(0, 3)` and given one room, reopened: version 4, both tables empty. The test upgrades move to 5 and 6; the newer-database message says `knows up to 4` |
| C1 | 9.1 | The fake's `version` is 4 |
| C3 | 1 | Status codes: `DELETE` is a known method on 6.24 and on C10 9.7 and 9.10 |
| C3 | 2.1 | `createApi` takes `opts.extraRoutes` (optional `ExtraRoute[]`, C10 8.2), matched after the C3 routes and before `/api/stream`, with the same room check, body reading and fault handling; `HttpError` comes from `server/api-common.js` (C10 8.1) and replaces `api.js`'s own class (lead decision 62). Module table: `server/api.js` may require `./api-common.js`; `server/harvest-api.js` row (C10 8.2) |
| C3 | 2.2 | `main.js` start-up order step 4 becomes C10 8.4 (`openHarvest`, `extraRoutes`); `main.js` may require `./harvest-db.js` and `./harvest-api.js` |
| C3 | 2.3 | Files: `server/api-common.js`, `server/harvest-schema.js` (lead, prep 2.0); `server/harvest-db.js`, `server/harvest-api.js` and their tests (Harvest data, Harvest API); `server/main.js` (lead, gate 2.5) |
| C3 | 4 | The C10 7 error texts, by reference |
| C3 | 5 | Routes C10 9.1–9.10, by reference |
| C3 | 9 | `/harvest-rules.js` in the shared module list |
| C3 | 12 | `tests/api.test.js` rows of C10 13 (Server 2) |
| C5 | 1.1 | Rows for `harvest-rules.js` (`FarmHarvestRules`), `web/vendor/qrcodegen.js` (`qrcodegen`), `web/batches.js`, `web/harvest.js`, `web/harvest.css` (C10 2) |
| C5 | 1.2 | After the `styles.css` link: `<link rel="stylesheet" href="web/harvest.css">`. Menu: `<a href="#/batches" data-module="batches">Batches</a>` between Rooms and Test bench. Scripts: `harvest-rules.js` after `room-rules.js`; `web/vendor/qrcodegen.js` after `web/settings-panel.js`; `web/batches.js` and `web/harvest.js` after `web/room-calibrate.js`, before `web/simulator.js` |
| C5 | 1.3 | The four rows of those scripts (`harvest-rules.js` needs `ClimateController`; `web/batches.js` and `web/harvest.js` need `FarmShell` at load) |
| C5 | 1.7 | Prep 2.0 stubs `web/batches.js`, `web/harvest.js`, `web/harvest.css`; the start check lists them |
| C5 | 2.1, 2.2, 2.3 | C10 11 (routes, names, menu marking, bare layout at step 5) |
| C5 | 3.2 | Module rows `batches` and `harvest` (C10 12) |
| C5 | 4.3 | The ten functions of C10 12.1; `tests/web-api.test.js` covers them (lead, prep 2.0) |
| C5 | 4.5 | `GET /api/batches` answers `[]` by default; `/harvest-rules.js` served with `root` |
| C5 | 7.10 | Rows for the Harvest web checks (C10 13) |
| Lead decision 32 | – | `styles.css` stays Room shell's; `web/harvest.css` is Harvest web's own stylesheet (lead decision 65) |
| Wave 2 plan | 2 | Prep 2.0 adds C10 2's lead files (plan tasks 0.2, 0.3 and the rest of C10 2's prep column) |
| Wave 2 plan | 3, 3.1 | Three streams: Harvest data (`stream/harvest-data`), Harvest API (`stream/harvest-api`), Harvest web (`stream/harvest-web`), with C10 2's files |
| Wave 2 plan | 5 | Gate 2.5 also merges Harvest data and Harvest API, wires `main.js` (C10 8.4) and checks upgrade 4 on the version 1 and version 2 files (version 4 after) |
| Wave 2 plan | 6 | Wave 3: `tests/api-real.test.js` covers C10 9; the phone check of C10 13 |
| Docs stream | README | The stickers page, the fixed address advice, `TZ=Asia/Kuala_Lumpur` for the service, upgrade 4 |

## 15. Lead decisions (recorded as 59–68)

| # | Subject | Decision |
|---|---|---|
| 59 | Build | Batches and harvest by room QR are built inside wave 2 (owner, 2026-10-09): C10 is frozen with the wave 2 contracts; three more streams; upgrade 4 |
| 60 | Own files | Harvest code lives in new files; shared files get only the registration lines of C10 14 |
| 61 | Connection | C1's db object exposes its `DatabaseSync` as `db.sqlite` for `server/harvest-db.js`; one connection stays the rule |
| 62 | Extra routes | `createApi(opts.extraRoutes)` mounts C10's routes; `HttpError` moves to `server/api-common.js` |
| 63 | Status codes | No 409: state conflicts are 400s with their own `error` texts (C10 7), because C3 allows 400, 404, 500 only |
| 64 | Check order | An extra route checks its own `:batchId` / `:crateId` inside `run`, after the body is read |
| 65 | Stylesheet | `web/harvest.css` belongs to Harvest web; lead decision 32 holds for `styles.css` |
| 66 | Bare layout | The shell sets `body[data-layout="bare"]` on `#/harvest/:id`; modules still never touch `document.body` |
| 67 | Today | "Today" is from the farm device's local midnight; the service runs with `TZ=Asia/Kuala_Lumpur` |
| 68 | Archived and cleared | A placed batch keeps taking crates after its room is archived; a crate of a cleared batch can still be undone |

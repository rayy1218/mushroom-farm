# Work brief: Wave 2, Harvest data stream (C10 revision 2): `server/harvest-db.js` and `tests/harvest-db.test.js`

Revision 1, 2026-10-09 (C10 revision 2, lead decision 70, C1 revision 6, wave 2 plan as frozen on `master` e60dabf). Stream: **Harvest data** (wave 2). You are the implementer; reviewers check the work before the lead merges it.

| Binding source, in this order | Path | What it settles |
|---|---|---|
| Lead decisions 59–68 and 70 (and 1–58 where they apply: 3 the error codes, 7 the fakes) | `docs/contracts/LEAD-DECISIONS.md` | They override this brief. Lead decision 70 was added on `master` after the wave 2 freeze: read it there (section 4.3 below repeats it) |
| C10 revision 2 (batches and harvest by room QR) | `docs/contracts/harvest.md` | Sections 1, 2, 3, 5.1–5.4, 13 (row `tests/harvest-db.test.js`) |
| C1 revision 6 (database) | `docs/contracts/db.md` | Section 1 (general rules, which C10 5.1 applies to the store), 6.1 (errors and `errcode` values), 6.3 (`db.sqlite`), 9.2 (what a fake reproduces) |
| Wave 2 plan | `docs/superpowers/plans/2026-10-08-farm-foundation/wave2-plan.md` | Sections 3 (Harvest data row), 3.1, 4 (stream rules), 5 step 3b (your merge) |
| Harvest plan | `docs/superpowers/plans/2026-10-09-harvest-qr/README.md` | Task 0.4 (the lead's harvest files you build on), task 0.5, Step 1 row "Harvest data" |
| This brief | `docs/superpowers/plans/2026-10-08-farm-foundation/harvest-data.md` | Committed on `master` by the lead in prep 2.0; you do not edit it |

When this brief and C10 or C1 disagree, the contract wins: follow it and report the difference (section 10).

## 1. Goal

| Outcome | Measure |
|---|---|
| The harvest store exists | `server/harvest-db.js` exports exactly `openHarvest`; `openHarvest(db, options)` returns a store with exactly the 12 functions of C10 5.2, synchronous, with C10's shapes, orders, defaults and errors |
| One connection | The store prepares its statements once on `db.sqlite` (C1 6.3, lead decision 61) and opens no connection of its own |
| C1's rules hold for the store | Plain-object rows; unknown keys throw `TypeError('<function>: unknown field "<key>"')` before writing; `undefined` and non-finite numbers bound as `NULL`; no business rules; node:sqlite constraint errors reach the caller unchanged (275, 1299, 3091, 787) |
| Every case runs on two targets | Each shared test runs on the lead's fake store (`openFakeHarvest(openFakeDb())`) and on a real store, so the fake and the real store agree |
| No edit at the gate | `tests/harvest-db.test.js` picks `openDb(':memory:')` when `UPGRADES` has version 4 (after Data 2 is merged), else the C10 13 stand-in; the lead merges you at gate 2.5 step 3b without touching your file |

## 2. Before you start

| Rule | Detail |
|---|---|
| Worktree | You work alone in `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/harvest-data`, on branch `stream/harvest-data`, made by the lead from `master` after prep 2.0. Never work in `/home/foqcus/Documents/mushroom-farm` (another developer's working tree) or in another worktree. |
| Git | Keep the configured identity; never change `git config`. Plain commit messages such as `feat(harvest-db): batches (C10 5.2)`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase (the lead merges; you never merge `master` into your branch). |
| Models and reviews | Implementer on Sonnet, reviewers on Opus. A spec-compliance review and a code-quality review run before the lead merges. |
| `master` stays green | The lead merges you into `master` at gate 2.5 step 3b, after Data 2 (upgrade 4) and before Harvest API. Your branch tip must give `npm test` `# fail 0` on its own, both on the prep 2.0 tree (no upgrade 4: the stand-in) and after Data 2's merge (upgrade 4: `openDb`). The real-store pick of section 5 makes both hold without an edit. |
| Contract questions | A gap or contradiction in C10 or C1: stop that part, report it to the lead, carry on with the rest. Only the lead changes a contract. |

| Check (from the worktree) | Expected; otherwise stop and report to the lead |
|---|---|
| `git branch --show-current` | `stream/harvest-data` |
| `node --version` | v22.13 or newer (v22.20.0 here) |
| `ls harvest-rules.js server/harvest-schema.js server/api-common.js tests/fakes/harvest-db.js tests/fake-harvest-db.test.js docs/contracts/harvest.md` | All six listed (the lead's prep 2.0 files, harvest plan tasks 0.2–0.4) |
| `ls server/harvest-db.js tests/harvest-db.test.js` | Both missing (yours to create) |
| `node -p "require('./server/db.js').UPGRADES.some(u => u.version === 4)"` | `false` (Data 2 is not merged: your real target is the C10 13 stand-in) |
| `node -p "const d = require('./tests/fakes/db.js').openFakeDb(); [d.version, d.sqlite]"` | `[ 4, null ]` (the prep 2.0 fake db, C1 9.1) |
| `node --disable-warning=ExperimentalWarning -e "const { DatabaseSync } = require('node:sqlite'); const s = new DatabaseSync(':memory:'); s.exec('CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived_at INTEGER) STRICT;'); s.exec(require('./server/harvest-schema.js').SCHEMA_V4_HARVEST); console.log('ok')"` | `ok` (the schema runs on the stand-in's `rooms` table) |
| `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail\|skipped)'` | `# fail 0`. Write down `# pass` as **N0** and `# skipped` as **S0** (the prep 2.0 skips; none of them is in your files). |
| `git status --short` | Empty |

Read C10 sections 1–5 and 13 and C1 sections 1, 6.1, 6.3 and 9.2 before Task 1.

## 3. Owned files (exactly C10 2)

| File | Action | Content |
|---|---|---|
| `server/harvest-db.js` | Create | CommonJS. `module.exports = { openHarvest }`. Requires only Node built-ins and `./db-common.js` (`NotFoundError`) |
| `tests/harvest-db.test.js` | Create | Section 5 layout; the tests of section 6 |

| Not yours | Owner | Why you read it |
|---|---|---|
| `server/harvest-schema.js` | Lead (prep 2.0), then nobody | `SCHEMA_V4_HARVEST`, for the stand-in |
| `tests/fakes/harvest-db.js`, `tests/fake-harvest-db.test.js` | Lead (prep 2.0), then nobody | `openFakeHarvest`, your fake target (C10 5.4) |
| `tests/fakes/db.js` | Lead (prep 2.0), then nobody | `openFakeDb`, the db under the fake store |
| `server/db.js`, `tests/db.test.js` | Data 2 | Upgrade 4, `db.sqlite`, the "Upgrade 4 from version 3" test (C1 8). Your test requires `../server/db.js` only to read `UPGRADES` and, after gate 2.5, to call `openDb` |
| `server/db-common.js` | Lead (wave 0), then nobody | `NotFoundError` |
| `server/harvest-api.js`, `tests/harvest-api.test.js` | Harvest API | The routes that call your store (they test against the fake store) |
| `server/main.js` | Lead at gate 2.5 | `openHarvest(db)` wiring (C10 8.4) |
| Every other file | Nobody in your stream | Read-only |

## 4. What you build against

| Source | What you take from it |
|---|---|
| C10 3 | The upgrade 4 tables: `batches` (15 columns), `harvest_crates` (6 columns), their `CHECK`s, `NOT NULL`s, foreign keys, the `flush_gap_days` default 5, and the two indexes |
| C10 5.1 | `openHarvest(db, options?)`: `options.now` (default `() => Math.floor(Date.now() / 1000)`); `TypeError` for an unknown option; `Error('Harvest needs schema version 4 or newer')` when `db.version < 4`; the connection, "Like C1", room check and error rules |
| C10 5.2 | The 12 functions: arguments, returns, orders, defaults, errors. `BatchRow` = the 15 columns of `batches` in SQL order; `CrateRow` = the 6 columns of `harvest_crates` in SQL order |
| C10 5.4 | What the fake store reproduces (your shared tests check only these behaviours) |
| C10 13, row `tests/harvest-db.test.js` | The two targets, the real-store pick and the stand-in code (verbatim), the cases to cover, the real-only case |
| C1 1 | Synchronous; integer seconds; ids (an id that matches no row, including `NaN`, a string, `undefined`, gives `NotFoundError`); plain-object rows; unknown fields; missing and non-finite values bound as `NULL`; no business rules; SQL constraints as the last guard |
| C1 6.1 | `NotFoundError` shape (`code: 'NOT_FOUND'`, `what`, `id`, `Unknown <what> <id>`); constraint `errcode`s 275 (`CHECK`), 1299 (`NOT NULL`), 3091 (wrong type), 787 (foreign key), all with `code: 'ERR_SQLITE_ERROR'` and `errcode & 0xff === 19` |
| C1 6.3, lead decision 61 | `db.sqlite` is the `DatabaseSync` that `openDb` opened; read-only; for `server/harvest-db.js` only; nobody closes it except `db.close()` |
| Lead decision 70 | The real store behaves as the prep fake store `tests/fakes/harvest-db.js` on the details of section 4.3 |

| BatchRow key order (C10 3) | `id`, `crop`, `strain`, `source`, `block_count`, `block_wet_kg`, `moisture_pct`, `spawn_date`, `received_at`, `room_id`, `placed_at`, `cleared_at`, `flush_gap_days`, `notes`, `created_at` |
|---|---|
| CrateRow key order (C10 3) | `id`, `batch_id`, `t`, `kg`, `picker`, `deleted_at` |

### 4.1 node:sqlite facts (checked on Node 22.20; the same as the Data stream's)

| Fact | What `server/harvest-db.js` does |
|---|---|
| Rows come back with a null prototype | Copy every returned row (`{ ...row }`) |
| Binding `true`, `false` or `undefined` throws `ERR_INVALID_ARG_TYPE`; `NaN` binds as `NULL` but `Infinity` is stored | One binding helper: `undefined` → `null`, a non-finite number → `null`, anything else unchanged |
| A named-parameter object with a key the SQL does not use throws `ERR_INVALID_STATE` | Pass exactly the parameters each statement uses |
| An INTEGER key compared with the text `'7'` matches row 7 | Before every lookup by a batch or crate id, require `Number.isInteger(id)`; otherwise throw `NotFoundError` |
| A `CHECK` fails with 275, a `NOT NULL` with 1299, a fraction or a non-numeric string in an INTEGER column with 3091, a foreign key with 787 | Let them propagate unchanged; never wrap or rewrite |
| `foreign_keys` is a per-connection `PRAGMA` | C1's `openDb` and the C10 13 stand-in both set it `ON`; the store never changes it |
| `prepare()` on a missing table throws | `openHarvest` checks `db.version` first, then prepares |

### 4.2 Suggested internal structure (not part of the contract)

| Helper | Job |
|---|---|
| `fields(fn, obj, allowed)` | For each own key of `obj` (when not `undefined` or `null`) not in `allowed`: `throw new TypeError(\`${fn}: unknown field "${key}"\`)` |
| `val(x)` | The binding helper of 4.1 |
| `plain(row)` | `row ? { ...row } : null` |
| `batchOrThrow(id)` | `if (!Number.isInteger(id) \|\| !(row = getBatchStmt.get(id))) throw new NotFoundError('batch', id)` |
| `crateOrThrow(id)` | The same with `'crate'` |
| `roomCheck(id)` | `db.getRoom(id)` (passes on its `NotFoundError('room')`; archived rooms count) |

| Order of checks in every function | Detail |
|---|---|
| 1 | The batch or crate id (`NotFoundError`) |
| 2 | The room (`placeBatch`, `listBatches({ room_id })`: `db.getRoom`) |
| 3 | Unknown fields (`TypeError`), then `RangeError` (`listBatches` `state`) |
| 4 | The write (node:sqlite constraint errors) |

C10 does not fix this order across error kinds; lead decision 70 fixes one case (`placeBatch`: batch before room, rows 1–2 above). Other tests use calls that break one rule only (section 6, "Never assert").

### 4.3 Lead decision 70: details where both stores agree

| Detail | Rule | Test (task) |
|---|---|---|
| `placeBatch` check order | The batch first, then the room: with an unknown batch and an unknown room, `NotFoundError('batch')` | `placeBatch: an unknown batch wins over an unknown room (LD 70)` (5) |
| `updateBatch` with an explicit `undefined` | Sets the column to `NULL` (as C1 `updateRoom`): `{ strain: undefined }` clears `strain`; a `NOT NULL` column (`crop: undefined`) fails with 1299 | `updateBatch: an explicit undefined sets NULL (LD 70)` (4) |
| `clearBatch(id, null)` | On a cleared batch: `cleared_at` becomes `NULL`, so the batch is placed again (the store has no business rule; the API never sends `null`, C10 9.6) | `clearBatch: null un-clears a cleared batch (LD 70)` (5) |
| `undoCrate(id, null)` | Changes nothing: a live crate stays live (`deleted_at` `null`), an undone crate keeps its time | `undoCrate: an explicit null at changes nothing (LD 70)` (8) |
| `listCrates` `from` | Not validated (the API checks queries, C10 9). `null`, left out and every non-finite number (`Infinity`, `-Infinity`, `NaN`: bound as `NULL`, C1 1) mean no filter: all crates (C10 5.2). In SQL write the filter as `(? IS NULL OR t >= ?)`: a bare `t >= NULL` returns no rows | `listCrates: a null or non-finite from is no filter (LD 70)` (7) |
| `listBatches({ room_id })` | Filters on `room_id` in every state (a cleared batch of the room is listed; with `state` the two filters combine) | `listBatches: room_id filters in every state (LD 70)` (3) |
| Schema version | The real store keeps `Error('Harvest needs schema version 4 or newer')`; the fake does not enforce it (so that test is real only) | `real: openHarvest needs schema version 4` (1) |

## 5. Test file layout (`tests/harvest-db.test.js`)

| Item | Rule |
|---|---|
| Header (first line) | `// Harvest store (server/harvest-db.js). Contract: docs/contracts/harvest.md sections 3, 5 and 13.` then `'use strict';` |
| Requires | `node:test` as `test`, `node:assert/strict` as `assert`, `{ DatabaseSync }` from `node:sqlite`, `{ openHarvest }` from `../server/harvest-db.js`, `{ SCHEMA_V4_HARVEST }` from `../server/harvest-schema.js`, `{ NotFoundError }` from `../server/db-common.js`, `{ openFakeDb }` from `./fakes/db.js`, `{ openFakeHarvest }` from `./fakes/harvest-db.js`, and `../server/db.js` (for `UPGRADES` and `openDb`) |
| Real-store pick (C10 13, no edit at the gate) | `const { openDb, UPGRADES } = require('../server/db.js'); const HAS_V4 = UPGRADES.some(u => u.version === 4);`. When `HAS_V4`: `db = openDb(':memory:', { now })`. Otherwise the C10 13 stand-in, verbatim: `const sqlite = new DatabaseSync(':memory:'); sqlite.exec('PRAGMA foreign_keys = ON; CREATE TABLE rooms (id INTEGER PRIMARY KEY, name TEXT NOT NULL, archived_at INTEGER) STRICT;'); sqlite.exec(SCHEMA_V4_HARVEST); const getRoom = id => { const r = sqlite.prepare('SELECT * FROM rooms WHERE id = ?').get(id); if (!r) throw new NotFoundError('room', id); return { ...r }; };` with `db = { version: 4, sqlite, getRoom }` |
| Targets | `const TARGETS = [['fake', openFake], ['real', openReal]];`. Each opener takes `(t, now)`, registers its clean-up with `t.after`, and returns `{ db, harvest, addRoom(name, { archived = false } = {}) }`. Fake: `db = openFakeDb({ now })`, `harvest = openFakeHarvest(db, { now })`. Real: the pick above, `harvest = openHarvest(db, { now })`. `addRoom` returns the new room id: on `openFakeDb` and `openDb` through `db.createRoom({ name, volume: 60, settings: {} })` then, when `archived`, `db.archiveRoom(id)`; on the stand-in through `sqlite.prepare('INSERT INTO rooms (name, archived_at) VALUES (?, ?)').run(name, archived ? now() : null)` and its `lastInsertRowid` (as a `Number`) |
| `both(name, fn)` | Registers `test(\`${label}: ${name}\`, t => fn(t, open))` once per target; `open()` gives the opener's object with the test's clock. A real-only test is a plain `test('real: …')` |
| Clock | Per test: `let clock = 1791450000; const now = () => clock;` (2026-10-08 17:00 farm time). Move it with `clock += …` between calls |
| Clean-up | `t.after`: the fake and `openDb` targets `db.close()`; the stand-in `sqlite.close()` |
| `assertNotFound(fn, what, id)` | `instanceof NotFoundError` (the class from `server/db-common.js`), `code === 'NOT_FOUND'`, `what` and `id` as given (`Object.is` for `NaN`), `message === \`Unknown ${what} ${id}\`` |
| `assertSql(fn, errcode)` | `code === 'ERR_SQLITE_ERROR'`, `errcode` as given, `(errcode & 0xff) === 19`. Never the message or `errstr` |
| Unknown-field asserts | The exact message `` `<function>: unknown field "<key>"` `` |
| Factories | `const batch = over => ({ crop: 'oyster', block_count: 1000, block_wet_kg: 1.2, moisture_pct: 60, received_at: clock - 86400, ...over });` and `const crate = over => ({ kg: 12.5, ...over });` |
| Key lists | `const BATCH_KEYS = ['id', 'crop', 'strain', 'source', 'block_count', 'block_wet_kg', 'moisture_pct', 'spawn_date', 'received_at', 'room_id', 'placed_at', 'cleared_at', 'flush_gap_days', 'notes', 'created_at'];` and `const CRATE_KEYS = ['id', 'batch_id', 't', 'kg', 'picker', 'deleted_at'];`. Shapes are checked with `assert.deepEqual(Object.keys(row), BATCH_KEYS)` (order included) |
| Plain rows | `Object.getPrototypeOf(row) === Object.prototype` for at least one row of each shape |
| "Nothing stored" | After a failed `createBatch`: `listBatches()` unchanged; after a failed `addCrate`: `countCrates(batchId)` unchanged; after a failed `updateBatch`, `placeBatch` or `clearBatch`: `getBatch(id)` deep-equals the row before |
| Unknown ids | Batch and crate ids: `999`, `NaN`, `'1'` (row 1 exists), `undefined`. Room ids: `999` only (the stand-in's `getRoom` follows C10 13 verbatim and does not apply C1's id rule to `'1'` or `undefined`) |

## 6. Tasks (TDD: write the test, run it and see it fail for the right reason, implement, see it pass, commit)

Run one file with `node --disable-warning=ExperimentalWarning --test tests/harvest-db.test.js`. "Shared" = registered with `both`, so each name below runs as `fake: <name>` and `real: <name>`. Commit after each task that ends green.

| # | Test(s) first (exact names) | Then build | Proves |
|---|---|---|---|
| 0 | – (no code) | Run the section 2 checks; read the fake store `tests/fakes/harvest-db.js` and its test to see what the lead's fake already does. No commit | Start state |
| 1 | Real only: **`real: openHarvest rejects an unknown option`** (`openHarvest(db, { nope: 1 })` throws `TypeError`, class only: C10 5.1 fixes no message); **`real: openHarvest needs schema version 4`** (`openHarvest({ version: 3, sqlite, getRoom }, { now })` on a stand-in connection throws exactly `Error('Harvest needs schema version 4 or newer')`; with `version: 4` it works); **`real: the store writes through db.sqlite`** (after `harvest.createBatch(batch())`, `db.sqlite.prepare('SELECT COUNT(*) AS n FROM batches').get().n === 1`: one connection, lead decision 61). Shared: **`store functions`** (the store's own keys, sorted, deep-equal `['addCrate', 'clearBatch', 'countCrates', 'createBatch', 'deleteBatch', 'getBatch', 'getCrate', 'listBatches', 'listCrates', 'placeBatch', 'undoCrate', 'updateBatch']`, each a function) | `openHarvest` (options check, version check, statements prepared once on `db.sqlite`); `module.exports = { openHarvest }` | C10 5.1, 5.2; C1 6.3 |
| 2 | **`createBatch: shape and defaults`** (`createBatch(batch())` returns exactly `BATCH_KEYS` in order, `strain`, `source`, `spawn_date`, `room_id`, `placed_at`, `cleared_at`, `notes` `null`, `flush_gap_days` 5, `created_at` = `now()`, `id` an integer; `getBatch(id)` deep-equals it; the row is a plain object); **`createBatch: explicit values are stored`** (`strain: 'PO-2'`, `source: 'Kebun'`, `spawn_date: clock - 30 * 86400`, `flush_gap_days: 7`, `notes: 'rack 2'`, `at: 5` → `created_at` 5); **`createBatch: unknown field; nothing stored`** (`colour: 'red'` → `TypeError('createBatch: unknown field "colour"')`; `room_id: 1` → `TypeError('createBatch: unknown field "room_id"')`; `listBatches()` stays `[]`); **`getBatch: unknown ids throw NotFoundError(batch)`** (999, `NaN`, `'1'` with batch 1 present, `undefined`) | `createBatch`, `getBatch` | C10 5.2 rows 1–2; C1 1 (ids, unknown fields, defaults) |
| 3 | **`listBatches: order is received_at descending, then id descending`** (three batches received at T−3 d, T−1 d, T−1 d: the two at T−1 d first, larger `id` first); **`listBatches: state filter`** (one received, one placed, one cleared: `{ state: 'received' }`, `'placed'`, `'cleared'` each give that one; `{ state: null }` and `{}` give all three); **`listBatches: room filter; archived rooms count`** (batches placed in room A and room B: `{ room_id: A }` gives A's; a batch in a room archived after placing is still listed by `{ room_id }`; `{ room_id: A, state: 'placed' }` combines both); **`listBatches: room_id filters in every state (LD 70)`** (a received batch, a placed one and a cleared one, the last two placed in room A: `{ room_id: A }` gives the placed and the cleared batch; `{ room_id: A, state: 'cleared' }` the cleared one only); **`listBatches: errors`** (`{ state: 'gone' }` → `RangeError`; `{ room_id: 999 }` → `NotFoundError('room', 999)`; `{ room: 1 }` → `TypeError('listBatches: unknown field "room"')`) | `listBatches` (the state rule is `FarmHarvestRules.state`: `cleared_at` set → cleared; else `room_id` set → placed; else received) | C10 5.2 row 3; 5.1 room check |
| 4 | **`updateBatch: changes fields; {} changes nothing`** (`{ strain: 'X', notes: 'n', flush_gap_days: 6 }` returns the changed `BatchRow`; `{}` returns it unchanged); **`updateBatch: fields it refuses`** (each of `room_id`, `placed_at`, `cleared_at`, `created_at`, `at`, `colour` → `TypeError('updateBatch: unknown field "<key>"')`, row unchanged); **`updateBatch: a constraint failure leaves the row unchanged`** (`{ moisture_pct: 100 }` → 275; `{ crop: null }` → 1299); **`updateBatch: unknown batch`** (999 → `NotFoundError('batch', 999)`); **`updateBatch: an explicit undefined sets NULL (LD 70)`** (a batch with `strain: 'PO-2'`, `notes: 'n'`: `{ strain: undefined, notes: undefined }` returns them `null`; `{ crop: undefined }` → 1299, row unchanged) | `updateBatch` | C10 5.2 row 4 |
| 5 | **`placeBatch: sets room_id and placed_at`** (returns the row with both set; `getBatch` agrees); **`placeBatch: archived room accepted; unknown room and batch throw`** (a room archived before the call is accepted: the store has no business rules, archived rooms count; room 999 → `NotFoundError('room', 999)` with the batch unchanged; batch 999 with a valid room → `NotFoundError('batch', 999)`); **`placeBatch: placed before received is a CHECK failure`** (`placed_at = received_at − 1` → 275, row unchanged); **`clearBatch: sets cleared_at`**; **`clearBatch: before placed, or on a received batch, is a CHECK failure`** (`cleared_at = placed_at − 1` → 275; a received batch → 275; rows unchanged); **`clearBatch: unknown batch`**; **`placeBatch: an unknown batch wins over an unknown room (LD 70)`** (`placeBatch(999, 999, t)` → `NotFoundError('batch', 999)`); **`clearBatch: null un-clears a cleared batch (LD 70)`** (`clearBatch(id, null)` on a cleared batch returns it with `cleared_at` `null` and `room_id`, `placed_at` kept) | `placeBatch` (room check through `db.getRoom`), `clearBatch` | C10 5.2 rows 5–6; C10 3 `CHECK`s |
| 6 | **`addCrate: shape and default t`** (`addCrate(b, { kg: 12.5 })` returns exactly `CRATE_KEYS` in order, `t` = `now()`, `picker` and `deleted_at` `null`; `getCrate(id)` deep-equals it); **`addCrate: explicit t and picker; integer kg`** (`{ kg: 12, picker: 'Aminah', t: clock - 60 }` comes back with `kg` 12, the given `t` and `picker`); **`addCrate: unknown field; unknown batch`** (`{ kg: 1, batch_id: 2 }` → `TypeError('addCrate: unknown field "batch_id"')`, nothing stored; batch 999 → `NotFoundError('batch', 999)`); **`getCrate: unknown ids throw NotFoundError(crate)`** (999, `NaN`, `'1'` with crate 1 present, `undefined`) | `addCrate`, `getCrate` | C10 5.2 rows 9, 11 |
| 7 | **`listCrates: t ascending, then id; undone crates included`** (crates at t 300, 100, 200 and two at 400: order 100, 200, 300, 400 (smaller `id` first), 400; an undone crate is listed with `deleted_at` set); **`listCrates: from is inclusive`** (`{ from: 200 }` gives 200, 300, 400, 400; `{ from: null }` equals `{}`); **`listCrates: a null or non-finite from is no filter (LD 70)`** (`{ from: Infinity }`, `{ from: -Infinity }`, `{ from: NaN }` and `{ from: null }` each give all the batch's crates, as `{}`); **`listCrates: errors`** (`{ to: 5 }` → `TypeError('listCrates: unknown field "to"')`; batch 999 → `NotFoundError('batch', 999)`) | `listCrates` (filter `(? IS NULL OR t >= ?)` with `from` through the binding helper) | C10 5.2 row 10; C10 13 "inclusive" |
| 8 | **`undoCrate: sets deleted_at; a second undo keeps the first time`** (`undoCrate(id, 500)` → `deleted_at` 500; `undoCrate(id, 900)` returns the row with 500); **`undoCrate: default at is now; unknown crate`** (no `at` → `now()`; crate 999 → `NotFoundError('crate', 999)`); **`undoCrate: an explicit null at changes nothing (LD 70)`** (`undoCrate(liveId, null)` returns it with `deleted_at` `null` and `listCrates` still shows it live; `undoCrate(undoneId, null)` keeps its first `deleted_at`); **`countCrates: counts every row, undone ones included`** (three crates, one undone → 3; a new batch → 0; batch 999 → `NotFoundError('batch', 999)`) | `undoCrate`, `countCrates` | C10 5.2 rows 8, 12; C10 13 "twice keeps the first time" |
| 9 | **`deleteBatch: returns the row read before the delete`** (the returned row deep-equals the earlier `getBatch`; then `getBatch(id)` → `NotFoundError('batch', id)`); **`deleteBatch: a batch with crate rows is a foreign key failure`** (one live crate → 787; only an undone crate → 787 too; the batch and its crates stay); **`deleteBatch: unknown batch`** | `deleteBatch` (no business check: the API checks `countCrates` first, C10 9.7) | C10 5.2 row 7; C10 5.4 row "Foreign key" |
| 10 | **`constraint rules: one row per rule, nothing stored`**: a table of calls, each breaking only one rule, each `assertSql` plus "nothing stored". 275 (`CHECK`): `block_count: 0`; `block_wet_kg: 0`; `moisture_pct: 100`; `moisture_pct: -1`; `flush_gap_days: 0`; `placeBatch` before `received_at`; `clearBatch` before `placed_at`; `clearBatch` of a received batch; `addCrate` `kg: 0.009`; `kg: 50.01`. 1299 (`NOT NULL`): `crop`, `block_count`, `block_wet_kg`, `moisture_pct`, `received_at` each left out; `addCrate` without `kg`. 3091 (wrong type): `block_count: 1.5`; `flush_gap_days: 2.5`; `received_at: 1.5`; `spawn_date: 'abc'`; `addCrate` `t: 1.5`. **`non-finite and missing values are bound as NULL`** (`block_wet_kg: NaN` → 1299; `addCrate` `kg: Infinity` → 1299; `strain` and `notes` left out or `undefined` → `null`); **`rows of every shape are plain objects`** (a `BatchRow` from each of `createBatch`, `getBatch`, `listBatches`, `updateBatch`, `placeBatch`, `clearBatch`, `deleteBatch`; a `CrateRow` from each of `addCrate`, `getCrate`, `listCrates`, `undoCrate`) | – (the earlier tasks should already pass; fix what does not) | C10 3 every rule; C10 13 "each `CHECK`, `NOT NULL`, wrong type with nothing stored"; C1 1 |
| 11 | – | Section 7; commit; report (section 10) | – |

| Point | Rule |
|---|---|
| Test count | 41 shared names (82 tests: `fake:` and `real:`) and 3 real-only tests: 85 new tests (6 of the shared names are lead decision 70's) |
| A shared test fails only on the fake | The fake is the lead's (C10 5.4): do not change it, do not weaken or skip the test. Report the test, the C10 section and the fake's behaviour; carry on |
| Never assert (not defined by C10 or C1, or not reproduced by the fake) | Which error comes first when one call breaks two rules, except `placeBatch` (batch before room, lead decision 70) (for example an unknown field on an unknown batch); node:sqlite message texts and `errstr`; numeric strings, non-strings in TEXT columns, booleans, objects (C1 9.2 "Not reproduced"); `'abc'` in a column that also has a `CHECK` (every REAL column of C10 3 has one, so a non-numeric string in a REAL column cannot break one rule only); `flush_gap_days: null` given explicitly (C10 gives a default only for a left-out field); `placeBatch` on an already placed batch (no business rule in the store); `listCrates` with a `from` that is not a number or `null` (not validated, lead decision 70); the `openHarvest` unknown-option message; any behaviour of the stand-in's `getRoom` for non-integer ids |
| Upgrade 4 | "Upgrade 4 from version 3" is Data 2's test in `tests/db.test.js` (C1 8, C10 13): you do not test the upgrade |
| Gate 2.5 | At gate 2.5 step 3b `HAS_V4` becomes `true` by itself and the real target becomes `openDb(':memory:')`; the lead runs `npm test` there. You prove the stand-in path only: a scratch copy cannot get upgrade 4 without Data 2's upgrade 3 |

## 7. How to verify

| Command (from the worktree) | Expected |
|---|---|
| `node --check server/harvest-db.js` | No output, exit 0 |
| `node --disable-warning=ExperimentalWarning --test tests/harvest-db.test.js 2>&1 \| grep -E '^# (tests\|pass\|fail)'` | `# tests 85`, `# pass 85`, `# fail 0` |
| `node --disable-warning=ExperimentalWarning --test tests/harvest-db.test.js 2>&1 \| grep -cE '^ok [0-9]+ - fake: '` and the same with `real: ` | `41` and `44` (every shared name on both targets, plus the 3 real-only tests) |
| `npm test 2>&1 \| grep -E '^# (pass\|fail\|skipped)'` | `# pass` = N0 + 85, `# fail 0`, `# skipped` = S0 |
| `node -p "Object.keys(require('./server/harvest-db.js')).join(' ')"` | `openHarvest` |
| `grep -n "require(" server/harvest-db.js` | Only Node built-ins (`node:…`) and `./db-common.js`; never `./db.js`, `./harvest-schema.js`, `./api.js` |
| `grep -c "new DatabaseSync" server/harvest-db.js` | `0` (no connection of its own) |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `server/harvest-db.js` and `tests/harvest-db.test.js` |
| `git diff --quiet $(git merge-base HEAD master) HEAD -- docs/ tests/fakes/ server/harvest-schema.js server/db.js` | Exit 0 |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git branch --show-current` and `git status --short` | `stream/harvest-data`; empty |

## 8. Done when

| # | Item |
|---|---|
| 1 | `server/harvest-db.js` exports exactly `openHarvest`, which checks its options and `db.version` (C10 5.1) and returns a store with exactly the 12 functions of C10 5.2 |
| 2 | Every function has C10's arguments (with the lead decision 70 details of section 4.3), return shape (`BatchRow` and `CrateRow` key order), order, defaults and errors; every row is a plain object |
| 3 | The store uses `db.sqlite` only and prepares its statements once; it requires only Node built-ins and `./db-common.js` |
| 4 | node:sqlite constraint errors reach the caller unchanged (275, 1299, 3091, 787); `NotFoundError` has `what` `batch`, `crate` or `room` |
| 5 | `tests/harvest-db.test.js` covers every case of section 6 on both targets with the C10 13 real-store pick (no edit at the gate); the 3 real-only tests pass; every test was seen failing before its code |
| 6 | Section 7 holds: `npm test` `# pass` = N0 + 85, `# skipped` = S0; only the two owned files changed; committed on `stream/harvest-data` with plain messages; nothing pushed; report sent |

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit any file outside section 3 (`tests/fakes/harvest-db.js`, `tests/fakes/db.js`, `server/harvest-schema.js`, `server/db.js`, `server/db-common.js`, `docs/`, `package.json`, other tests) | One owner per file (wave 2 plan 3.1); fake or contract problems go to the lead |
| Open a second connection (`new DatabaseSync`) in `server/harvest-db.js`, close `db.sqlite`, or change its `PRAGMA`s | Lead decision 61: one connection; only `db.close()` closes it |
| Require `./db.js`, `./api.js` or `./harvest-schema.js` from `server/harvest-db.js` | C10 5.1: the db comes in as an argument; the schema is applied by C1's upgrade 4 |
| Add business rules (a batch already in a room, a cleared batch taking crates, an archived room refused, a batch with crates refused before the delete) | Those are the API's 400s (C10 7, 9); the store keeps only the SQL constraints (C10 5.1 "Like C1") |
| Catch, wrap or rename node:sqlite errors, or turn them into `TypeError`/`RangeError` | C3's fatal rule reads `errcode` (C1 6.1, C3 4.2) |
| Add functions, exports, a `close`, async functions, caches or row limits | C10 5.2 is the whole store |
| Edit the C10 13 stand-in or the real-store pick, or switch to `openDb` by hand | The gate must need no edit (C10 13, wave 2 plan 3 Harvest data row) |
| Test the upgrade itself | Data 2's test (C1 8) |
| Weaken, skip or `todo` a test so it passes on the fake | Report the difference instead |
| Run `npm run vectors` or `tools/make-vectors.js` | They rewrite `tests/vectors/` |
| Write report or summary files; push, merge or rebase onto `master` | The report is your final message; the lead merges |

## 10. Report to the lead (your final message)

| Item | Content |
|---|---|
| Commits | `git log --oneline $(git merge-base HEAD master)..HEAD` |
| Tests | N0 and S0 before; `# pass`, `# fail`, `# skipped` after; the harvest-db file totals |
| Section 7 | The result of each command |
| Differences | Every shared test that fails only on the fake (name, C10 section, the fake's behaviour); every gap or contradiction in C10 or C1 you met |

## 11. Change log

| Revision | Date | Changes |
|---|---|---|
| 0 | 2026-10-09 | First brief, from C10 revision 2 (sections 3, 5, 13), C1 revision 6 (1, 6.1, 6.3, 9.2), the wave 2 plan (3, 3.1, 4, 5 step 3b) and the harvest plan (task 0.5, Step 1) |
| 1 | 2026-10-09 | Lead decision 70: section 4.3 and six shared tests (`placeBatch` batch before room, explicit `undefined` in `updateBatch`, `clearBatch(id, null)`, `undoCrate(id, null)`, a null or non-finite `listCrates` `from` with the `(? IS NULL OR t >= ?)` filter, `listBatches({ room_id })` in every state); 85 new tests |

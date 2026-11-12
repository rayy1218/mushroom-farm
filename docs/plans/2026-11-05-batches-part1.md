# Batches part 1 Implementation Plan


**Goal:** Record bought batches of blocks, put them into a room's open run (splitting a delivery across rooms), take them out, record contamination checks, keep Inventory's stock moves in step, feed a batch's dry kg into Harvest's BE, and give the Batches page, a batch's page, the myGAP 4-2 sheet, a CSV and `batchLineFor` (spec `docs/specs/2026-11-05-batches-design.md`, part 1).

**Architecture:** The tables (both parts', so part 2 needs no second version) live in `server/batches-db.js`, made in `db.js`'s version-21 step and reached as `db.batches`. The rules live in `server/batches.js` (`createBatches`, no HTTP), its pure figures in `server/batches-math.js`, its routes in `server/batches-api.js`. The web side is `web/batches-math.js` (pure: the formatter, groups, `batchLineFor`, sheet rows, dialog bodies), `web/batches-dialogs.js`, `web/batches-page.js` (the list and a batch) and `web/batches-sheet.js`.

**Tech Stack:** Node 22.13+, `node:http`, `node:sqlite` (`DatabaseSync`), plain ES modules in the browser, `node --test`. No dependencies.

**Rules for every task:** work in `/home/foqcus/Documents/mushroom-farm/.claude/worktrees/batches` (branch `feat/batches`). Never touch `data/v2.db` or the live apps. A manual server uses a port from 18900–18949 and a database under `/tmp/batches/`. Commit as the repo's configured identity (Ray Tham, GitHub noreply). Run one test file with `node --disable-warning=ExperimentalWarning --test tests/<file>`; the whole suite with `npm test`. Metric units, RM money. Contract: `~/.claude/task-logs/business/CONTRACT.md` (shared-file rules in its section 3; this module's changes in section 7).

---

## File map

| File | New/changed | Responsibility |
|---|---|---|
| `server/batches-db.js` | New | `BATCHES_SCHEMA` (every Batches table) and `createBatchStore(db)`: SQL in and camelCase rows out, the transaction helper, Inventory's stock tables when they exist |
| `server/db.js` | Changed | Import; `VERSION = 21`; the `if (version < 21)` step; `const batchStore = createBatchStore(db)`; `batches: batchStore` on the returned object; one line in `deleteRoom` |
| `server/batches-math.js` | New | Pure: good blocks, dry kg, a run's dry kg per crop, blockCost, status, the run's blocks, the stock moves a delivery should have |
| `server/batches.js` | New | `createBatches({ db, now })`: receive, list, detail, edit, remove, place, unplace, checks, `dryKgFor`, CSV, `onChange` |
| `server/harvests.js` | Changed | `batchDryKg` option; a run's yield figures take the batches' dry kg (spec 3.2) |
| `server/batches-api.js` | New | The routes (spec 6) |
| `server/api.js` | Changed | Make `batches`, wire its routes and events, pass `batchDryKg` to `createHarvests` |
| `web/live.js` | Changed | `'batches'` in `EVENT_TYPES` |
| `web/route.js`, `web/app.js` | Changed | `#/business/batches`, `#/business/batches/<id>`, `#/business/batches/sheet` |
| `web/batches-math.js` | New | Pure web parts |
| `web/batches-dialogs.js` | New | Receive, Edit, Put into a room, Take out, Delete, Record/Edit a check |
| `web/batches-page.js` | New | The Batches page and a batch's page |
| `web/batches-sheet.js` | New | The myGAP 4-2 print page |
| `web/styles.css` | Changed | The `.bt-` block at the end |
| `DESIGN.md`, `README.md`, `PRODUCT.md` | Changed | A Batches section or row |
| `tests/db-batches.test.js`, `tests/batches-math.test.js`, `tests/batches.test.js`, `tests/api-batches.test.js`, `tests/web-batches-math.test.js` | New | Tests |
| `tests/db-machines.test.js:86`, `tests/controller-fresh-air.test.js:171` and 13 more migration tests (`db-*`, `dehumidifier-review`, `gateways`, `lights`, `manual-since`, `db.test.js`), `tests/web-route.test.js` | Changed | `user_version` 21; the new routes |

---

### Task 1: The tables and the store

**Files:**
- Create: `server/batches-db.js`
- Modify: `server/db.js` (line 9 `VERSION`, `migrate` after the `version < 20` step, after the `const q = { … };` block, `deleteRoom`, the returned object before `close()`)
- Modify: `tests/db-machines.test.js:86`, `tests/controller-fresh-air.test.js:171` (20 → 21)
- Test: `tests/db-batches.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/db-batches.test.js`:

```js
// The Batches tables (spec 2026-11-05-batches-design.md 2): the version-21 step, the store's rows, a deleted room's batches.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { openWithStock } from './batches-fixture.js';

const ROOM = { name: 'Room 1', length: 6, width: 4, height: 2.5 };
const BATCH = { kind: 'bought', crop: 'oyster', supplier: 'Agro Supplies', receivedAt: 1000, blocks: 1200, pricePerBlock: 2.3, createdAt: 1000 };
const TABLES = ['batches', 'batch_checks', 'batch_recipes', 'batch_materials', 'batch_loads'];

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

test('a new file has every Batches table, STRICT, at version 21', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'new.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  t.after(() => raw.close());
  assert.equal(raw.prepare('PRAGMA user_version').get().user_version, 21);
  for (const name of TABLES) {
    const sql = raw.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(name)?.sql;
    assert.ok(sql, name);
    assert.match(sql, /STRICT/, name);
  }
});

test('a version 20 file is upgraded to 21 and keeps its rows', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'farm-db-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, 'v20.db');
  const first = openDb(path);
  first.createRoom(ROOM, 1000);
  first.close();
  const raw = new DatabaseSync(path);
  raw.exec(`${TABLES.map((n) => `DROP TABLE ${n};`).join(' ')} PRAGMA user_version = 20;`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.equal(db.listRooms().length, 1);
  assert.deepEqual(db.batches.all(), []);
  const id = db.batches.insert(BATCH);
  assert.equal(db.batches.get(id).supplier, 'Agro Supplies');
});

test('the store: insert, get, update, family, checks, remove', (t) => {
  const db = fresh(t);
  const s = db.batches;
  const id = s.insert(BATCH);
  const b = s.get(id);
  assert.equal(b.id, id);
  assert.equal(b.kind, 'bought');
  assert.equal(b.parentId, null);
  assert.equal(b.blocks, 1200);
  assert.equal(b.pricePerBlock, 2.3);
  assert.equal(b.lost, 0);
  assert.equal(b.roomName, null);
  assert.equal(b.runCrops, null);
  s.update(id, { note: 'Late', blocks: 1100 });
  assert.equal(s.get(id).note, 'Late');
  assert.equal(s.get(id).blocks, 1100);
  const part = s.insert({ ...BATCH, parentId: id, blocks: 100 });
  assert.deepEqual(s.family(id).map((x) => x.id), [id, part]);
  const c = s.insertCheck({ batchId: id, at: 2000, lost: 5, cause: 'green', worker: 'Ali', note: null, createdAt: 2000 });
  assert.equal(s.check(c).lost, 5);
  assert.equal(s.get(id).lost, 5);
  s.updateCheck(c, { at: 2100, lost: 6, cause: 'black', worker: 'Siti', note: 'wet' });
  assert.deepEqual({ ...s.check(c), createdAt: 0 }, { id: c, batchId: id, at: 2100, lost: 6, cause: 'black', worker: 'Siti', note: 'wet', createdAt: 0 });
  s.moveChecks(id, part);
  assert.equal(s.checks(part).length, 1);
  s.remove(part);
  assert.equal(s.get(part), null);
  assert.equal(s.check(c), null, 'a batch\'s checks go with it');
  assert.equal(s.all().length, 1);
});

test('a placed batch shows its room and run; run, room and placed are set together', (t) => {
  const db = fresh(t);
  const roomId = db.createRoom(ROOM, 1000).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 950 }] }, { change: 'start', at: 1500 });
  const run = db.openRun(roomId);
  const id = db.batches.insert(BATCH);
  db.batches.update(id, { runId: run.id, roomId, placedAt: 1600 });
  const b = db.batches.get(id);
  assert.equal(b.roomName, 'Room 1');
  assert.equal(b.runStartedAt, 1500);
  assert.equal(b.runEndedAt, null);
  assert.deepEqual(b.runCrops, [{ crop: 'oyster', blocks: 950 }]);
  assert.deepEqual(db.batches.byRun(run.id).map((x) => x.id), [id]);
  assert.throws(() => db.batches.update(id, { runId: null }), /CHECK/);
});

test('deleting a room keeps its batches without the room, run or placed time (ids are reused)', (t) => {
  const db = fresh(t);
  const roomId = db.createRoom(ROOM, 1000).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 950 }] }, { change: 'start', at: 1500 });
  const id = db.batches.insert(BATCH);
  db.batches.update(id, { runId: db.openRun(roomId).id, roomId, placedAt: 1600 });
  assert.equal(db.deleteRoom(roomId), true);
  const b = db.batches.get(id);
  assert.deepEqual([b.roomId, b.runId, b.placedAt], [null, null, null]);
});

test('the stock tables: none until Inventory makes them; then items and moves', (t) => {
  const db = fresh(t);
  const s = db.batches;
  assert.equal(s.hasStock(), false);
  s.tx(() => s.exec(STOCK));
  assert.equal(s.hasStock(), true);
  const item = s.blocksItem('Grey oyster blocks');
  assert.equal(s.blocksItem('Grey oyster blocks'), item, 'found, not made twice');
  s.insertMove({ itemId: item, at: 1000, qty: 1200, unitCost: 2.3, refId: 7, note: null });
  s.insertMove({ itemId: item, at: 2000, qty: -1200, unitCost: null, refId: 8, note: 'into a room' });
  assert.deepEqual(s.moves([7, 8]).map((m) => m.qty), [1200, -1200]);
  s.deleteMoves([7]);
  assert.deepEqual(s.moves([7, 8]).map((m) => m.refId), [8]);
});
```

Create `tests/batches-fixture.js` (not a test file: `npm test` runs `tests/*.test.js` only):

```js
// Inventory's two tables by the contract's columns (section 5), as Inventory's own step will make them: the Batches tests
// make them to see the stock moves (spec 2026-11-05-batches-design.md 3.1).
export const STOCK = `
CREATE TABLE stock_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, unit TEXT NOT NULL, reorder_at REAL) STRICT;
CREATE TABLE stock_moves (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, at INTEGER NOT NULL, qty REAL NOT NULL, unit_cost REAL,
  ref_kind TEXT NOT NULL, ref_id INTEGER, note TEXT) STRICT;`;
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-batches.test.js`
Expected: FAIL (`user_version` 20, `db.batches` undefined).

- [ ] **Step 3: Write `server/batches-db.js`**

```js
// The Batches tables and their queries (spec 2026-11-05-batches-design.md 2 and 3.1): made by db.js's version-21 step and
// reached as db.batches (createBatchStore). Rows go in and come out in camelCase; the rules are server/batches.js's.
// Inventory's stock_items and stock_moves are Inventory's: they are written here only when they exist (contract section 7).

export const BATCHES_SCHEMA = `
CREATE TABLE IF NOT EXISTS batches (
  id              INTEGER PRIMARY KEY,
  kind            TEXT    NOT NULL DEFAULT 'bought' CHECK (kind IN ('bought', 'made')),
  parent_id       INTEGER,
  run_id          INTEGER,
  room_id         INTEGER,
  placed_at       INTEGER,
  crop            TEXT    NOT NULL,
  supplier        TEXT,
  received_at     INTEGER NOT NULL,
  blocks          INTEGER NOT NULL CHECK (blocks BETWEEN 1 AND 100000),
  price_per_block REAL    CHECK (price_per_block BETWEEN 0 AND 1000),
  spawn_batch     TEXT,
  strain          TEXT,
  delivery_ref    TEXT,
  inoculated_at   INTEGER,
  block_kg        REAL    CHECK (block_kg BETWEEN 0.2 AND 10),
  water_pct       REAL    CHECK (water_pct BETWEEN 30 AND 80),
  recipe_id       INTEGER,
  mixed_at        INTEGER,
  incubation      TEXT    CHECK (incubation IN ('room', 'area')),
  incubated_from  INTEGER,
  incubated_to    INTEGER,
  note            TEXT,
  created_at      INTEGER NOT NULL,
  CHECK ((run_id IS NULL) = (room_id IS NULL) AND (run_id IS NULL OR placed_at IS NOT NULL)),
  CHECK ((block_kg IS NULL) = (water_pct IS NULL))
) STRICT;
CREATE INDEX IF NOT EXISTS batches_by_run ON batches (run_id);
CREATE INDEX IF NOT EXISTS batches_by_received ON batches (received_at);
CREATE INDEX IF NOT EXISTS batches_by_parent ON batches (parent_id);
CREATE TABLE IF NOT EXISTS batch_checks (
  id         INTEGER PRIMARY KEY,
  batch_id   INTEGER NOT NULL,
  at         INTEGER NOT NULL,
  lost       INTEGER NOT NULL CHECK (lost BETWEEN 1 AND 100000),
  cause      TEXT    NOT NULL CHECK (cause IN ('green', 'black', 'bacterial', 'pests', 'other')),
  worker     TEXT,
  note       TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS batch_checks_by_batch ON batch_checks (batch_id, at);
CREATE TABLE IF NOT EXISTS batch_recipes (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  crop        TEXT,
  sawdust_pct REAL    NOT NULL CHECK (sawdust_pct BETWEEN 0 AND 100),
  bran_pct    REAL    NOT NULL CHECK (bran_pct BETWEEN 0 AND 100),
  lime_pct    REAL    NOT NULL CHECK (lime_pct BETWEEN 0 AND 100),
  gypsum_pct  REAL    NOT NULL CHECK (gypsum_pct BETWEEN 0 AND 100),
  other_pct   REAL    NOT NULL DEFAULT 0 CHECK (other_pct BETWEEN 0 AND 100),
  other_name  TEXT,
  water_pct   REAL    NOT NULL CHECK (water_pct BETWEEN 30 AND 80),
  bag_kg      REAL    NOT NULL CHECK (bag_kg BETWEEN 0.2 AND 10),
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  created_at  INTEGER NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS batch_materials (
  id            INTEGER PRIMARY KEY,
  batch_id      INTEGER NOT NULL,
  item          TEXT    NOT NULL CHECK (item IN ('sawdust', 'bran', 'lime', 'gypsum', 'other', 'spawn', 'bags')),
  name          TEXT,
  qty           REAL    NOT NULL CHECK (qty > 0 AND qty <= 100000),
  unit          TEXT    NOT NULL CHECK (unit IN ('kg', 'bags', 'pcs')),
  stock_item_id INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS batch_materials_by_batch ON batch_materials (batch_id);
CREATE TABLE IF NOT EXISTS batch_loads (
  id         INTEGER PRIMARY KEY,
  batch_id   INTEGER NOT NULL,
  method     TEXT    NOT NULL CHECK (method IN ('steam', 'pressure', 'pasteurise')),
  bags       INTEGER NOT NULL CHECK (bags BETWEEN 1 AND 100000),
  hot_at     INTEGER NOT NULL,
  hold_h     REAL    NOT NULL CHECK (hold_h BETWEEN 0.5 AND 24),
  temp_c     REAL    NOT NULL CHECK (temp_c BETWEEN 60 AND 130),
  worker     TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX IF NOT EXISTS batch_loads_by_batch ON batch_loads (batch_id);`;

// A batch's fields (camelCase) and their columns.
const COLUMNS = {
  kind: 'kind', parentId: 'parent_id', runId: 'run_id', roomId: 'room_id', placedAt: 'placed_at', crop: 'crop', supplier: 'supplier',
  receivedAt: 'received_at', blocks: 'blocks', pricePerBlock: 'price_per_block', spawnBatch: 'spawn_batch', strain: 'strain',
  deliveryRef: 'delivery_ref', inoculatedAt: 'inoculated_at', blockKg: 'block_kg', waterPct: 'water_pct', recipeId: 'recipe_id',
  mixedAt: 'mixed_at', incubation: 'incubation', incubatedFrom: 'incubated_from', incubatedTo: 'incubated_to', note: 'note',
  createdAt: 'created_at',
};
const CHECK_COLUMNS = { batchId: 'batch_id', at: 'at', lost: 'lost', cause: 'cause', worker: 'worker', note: 'note', createdAt: 'created_at' };

// Every batch with its lost blocks, its room's name and its run's times and crops.
const SELECT = `
SELECT b.*, rm.name AS room_name, ru.started_at AS run_started_at, ru.ended_at AS run_ended_at, ru.crops AS run_crops,
       COALESCE((SELECT SUM(c.lost) FROM batch_checks c WHERE c.batch_id = b.id), 0) AS lost
FROM batches b LEFT JOIN rooms rm ON rm.id = b.room_id LEFT JOIN runs ru ON ru.id = b.run_id`;

function batchOf(r) {
  const out = {};
  for (const [key, column] of Object.entries(COLUMNS)) out[key] = r[column];
  out.id = r.id;
  out.lost = r.lost;
  out.roomName = r.room_name;
  out.runStartedAt = r.run_started_at;
  out.runEndedAt = r.run_ended_at;
  out.runCrops = r.run_crops === null ? null : JSON.parse(r.run_crops);
  return out;
}
const checkOf = (r) => ({ id: r.id, batchId: r.batch_id, at: r.at, lost: r.lost, cause: r.cause, worker: r.worker, note: r.note, createdAt: r.created_at });

// The columns and values of the given fields of `map` (an unknown field throws: a typo is a bug, not a no-op).
function columnsOf(fields, map) {
  return Object.entries(fields).map(([key, value]) => {
    if (!Object.hasOwn(map, key)) throw new Error(`No column for ${key}`);
    return [map[key], value];
  });
}

// db: the DatabaseSync (not db.js's wrapper). → the store.
export function createBatchStore(db) {
  const q = {
    all: db.prepare(`${SELECT} ORDER BY b.received_at DESC, b.id DESC`),
    get: db.prepare(`${SELECT} WHERE b.id = ?`),
    family: db.prepare(`${SELECT} WHERE b.id = ?1 OR b.parent_id = ?1 ORDER BY b.id`),
    byRun: db.prepare(`${SELECT} WHERE b.run_id = ? ORDER BY b.id`),
    remove: db.prepare('DELETE FROM batches WHERE id = ?'),
    removeChecks: db.prepare('DELETE FROM batch_checks WHERE batch_id = ?'),
    removeMaterials: db.prepare('DELETE FROM batch_materials WHERE batch_id = ?'),
    removeLoads: db.prepare('DELETE FROM batch_loads WHERE batch_id = ?'),
    checks: db.prepare('SELECT * FROM batch_checks WHERE batch_id = ? ORDER BY at, id'),
    check: db.prepare('SELECT * FROM batch_checks WHERE id = ?'),
    removeCheck: db.prepare('DELETE FROM batch_checks WHERE id = ?'),
    moveChecks: db.prepare('UPDATE batch_checks SET batch_id = ? WHERE batch_id = ?'),
    forgetRoom: db.prepare('UPDATE batches SET room_id = NULL, run_id = NULL, placed_at = NULL WHERE room_id = ?'),
    hasStock: db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'stock_moves'"),
  };

  function insertRow(table, fields, map) {
    const pairs = columnsOf(fields, map);
    const sql = `INSERT INTO ${table} (${pairs.map(([c]) => c).join(', ')}) VALUES (${pairs.map(() => '?').join(', ')})`;
    return Number(db.prepare(sql).run(...pairs.map(([, v]) => v)).lastInsertRowid);
  }
  function updateRow(table, id, fields, map) {
    const pairs = columnsOf(fields, map);
    if (!pairs.length) return;
    db.prepare(`UPDATE ${table} SET ${pairs.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...pairs.map(([, v]) => v), id);
  }

  return {
    // fn() inside one transaction; its value. Not nested: the callers of batches.js open one per write.
    tx(fn) {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
    // Raw SQL (tests make Inventory's tables with it).
    exec: (sql) => db.exec(sql),

    // Every batch, newest received first.
    all: () => q.all.all().map(batchOf),
    // A batch, or null.
    get(id) {
      const r = q.get.get(id);
      return r ? batchOf(r) : null;
    },
    // A delivery: its first row and its parts, by id.
    family: (firstId) => q.family.all(firstId).map(batchOf),
    // The batches put into a run.
    byRun: (runId) => q.byRun.all(runId).map(batchOf),
    // A new batch from its camelCase fields. → its id.
    insert: (fields) => insertRow('batches', fields, COLUMNS),
    // The given fields of a batch.
    update: (id, fields) => updateRow('batches', id, fields, COLUMNS),
    // A batch and its checks, materials and loads.
    remove(id) {
      q.removeChecks.run(id);
      q.removeMaterials.run(id);
      q.removeLoads.run(id);
      q.remove.run(id);
    },
    // A deleted room's batches keep their records without the room, its run and the time they went in (db.js deleteRoom).
    forgetRoom: (roomId) => q.forgetRoom.run(roomId),

    // A batch's checks, oldest first.
    checks: (batchId) => q.checks.all(batchId).map(checkOf),
    check(id) {
      const r = q.check.get(id);
      return r ? checkOf(r) : null;
    },
    insertCheck: (fields) => insertRow('batch_checks', fields, CHECK_COLUMNS),
    updateCheck: (id, fields) => updateRow('batch_checks', id, fields, CHECK_COLUMNS),
    removeCheck: (id) => q.removeCheck.run(id),
    // A folded part's checks go to its first row.
    moveChecks: (fromId, toId) => q.moveChecks.run(toId, fromId),

    // ---- Inventory's tables (contract section 7): only when they exist ----
    hasStock: () => Boolean(q.hasStock.get()),
    // The stock item of kind 'blocks' with this name, made when missing. → its id.
    blocksItem(name) {
      const found = db.prepare("SELECT id FROM stock_items WHERE kind = 'blocks' AND name = ? ORDER BY id LIMIT 1").get(name);
      if (found) return found.id;
      return Number(db.prepare("INSERT INTO stock_items (name, kind, unit, reorder_at) VALUES (?, 'blocks', 'blocks', NULL)").run(name).lastInsertRowid);
    },
    insertMove({ itemId, at, qty, unitCost, refId, note }) {
      db.prepare("INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note) VALUES (?, ?, ?, ?, 'batch', ?, ?)")
        .run(itemId, at, qty, unitCost ?? null, refId, note ?? null);
    },
    // The 'batch' moves of these batch ids, by time.
    moves(refIds) {
      if (!refIds.length) return [];
      return db.prepare(`SELECT * FROM stock_moves WHERE ref_kind = 'batch' AND ref_id IN (${refIds.map(() => '?').join(', ')}) ORDER BY at, id`)
        .all(...refIds).map((r) => ({ id: r.id, itemId: r.item_id, at: r.at, qty: r.qty, unitCost: r.unit_cost, refId: r.ref_id, note: r.note }));
    },
    deleteMoves(refIds) {
      if (!refIds.length) return;
      db.prepare(`DELETE FROM stock_moves WHERE ref_kind = 'batch' AND ref_id IN (${refIds.map(() => '?').join(', ')})`).run(...refIds);
    },
  };
}
```

- [ ] **Step 4: Wire it into `server/db.js`**

1. Under the other imports at the top:

```js
import { BATCHES_SCHEMA, createBatchStore } from './batches-db.js'; // ---- Batches ---- (spec 2026-11-05-batches-design.md 2)
```

2. Line 9: `const VERSION = 20;` → `const VERSION = 21;`

3. In `migrate`, right after the `if (version < 20) { … }` block and before `db.exec(\`PRAGMA user_version = ${VERSION}\`);`:

```js
    // ---- Batches ---- (spec 2026-11-05-batches-design.md 2): every table of both parts in one step.
    if (version < 21) db.exec(BATCHES_SCHEMA);
```

4. In `openDb`, right after the closing `};` of `const q = { … };` (before `function checkName`):

```js
  const batchStore = createBatchStore(db); // ---- Batches ---- (spec 2026-11-05-batches-design.md 2)
```

5. In `deleteRoom`, right after `q.deleteTasks.run(id);`:

```js
        batchStore.forgetRoom(id); // Batches: the room's batches are kept without it (room and run ids are reused)
```

6. In the returned object, right before `close() {`:

```js
    // ---- Batches ---- (spec 2026-11-05-batches-design.md): the store of server/batches-db.js.
    batches: batchStore,

```

7. In `tests/db-machines.test.js` line 86 and `tests/controller-fresh-air.test.js` line 171 change the expected `user_version` from `20` to `21`.

- [ ] **Step 5: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-batches.test.js tests/db-machines.test.js tests/controller-fresh-air.test.js tests/db-harvest.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/batches-db.js server/db.js tests/db-batches.test.js tests/batches-fixture.js tests/db-machines.test.js tests/controller-fresh-air.test.js
git commit -m "Batches 1: the tables (version 21, both parts) and the store; a deleted room's batches kept without it"
```

---

### Task 2: The pure figures (`server/batches-math.js`)

**Files:**
- Create: `server/batches-math.js`
- Test: `tests/batches-math.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/batches-math.test.js`:

```js
// The Batches figures (spec 2026-11-05-batches-design.md 3.1, 3.2 and 4), pure.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goodOf, dryKgOf, runDryKg, blockCost, statusOf, runBlocksOf, movesOf } from '../server/batches-math.js';

const b = (o) => ({ id: 1, parentId: null, crop: 'oyster', blocks: 100, lost: 0, pricePerBlock: 2, blockKg: null, waterPct: null,
  runId: null, runEndedAt: null, runCrops: null, placedAt: null, receivedAt: 1000, ...o });

test('good blocks and dry kg per block', () => {
  assert.equal(goodOf(b({ blocks: 1200, lost: 20 })), 1180);
  assert.equal(dryKgOf(b({ blockKg: 2.3, waterPct: 60 })), 0.92);
  assert.equal(dryKgOf(b({})), null);
});

test("a run's dry kg per crop: only a crop whose batches all have a weight, weighted by blocks", () => {
  const rows = [
    b({ id: 1, blocks: 600, blockKg: 2, waterPct: 60 }), // 0.8 kg dry
    b({ id: 2, blocks: 400, blockKg: 2.5, waterPct: 60 }), // 1.0 kg dry
    b({ id: 3, crop: 'pink', blocks: 100, blockKg: 2, waterPct: 60 }),
    b({ id: 4, crop: 'pink', blocks: 100 }),
  ];
  assert.deepEqual(runDryKg(rows), { oyster: 0.88 });
  assert.deepEqual(runDryKg([]), {});
});

test('blockCost: blocks × price over the rows; null when one price is unknown; 0 with none', () => {
  assert.equal(blockCost([b({ blocks: 950, pricePerBlock: 2.3 }), b({ blocks: 250, pricePerBlock: 2.4 })]), 2785);
  assert.equal(blockCost([b({ pricePerBlock: 2 }), b({ pricePerBlock: null })]), null);
  assert.equal(blockCost([]), 0);
});

test("status and the run's blocks of the crop", () => {
  assert.equal(statusOf(b({})), 'waiting');
  assert.equal(statusOf(b({ runId: 3 })), 'placed');
  assert.equal(statusOf(b({ runId: 3, runEndedAt: 5000 })), 'past');
  assert.equal(statusOf(b({ placedAt: 3000 })), 'past', 'its room was deleted');
  assert.equal(runBlocksOf(b({})), null);
  assert.equal(runBlocksOf(b({ runId: 3, runCrops: [{ crop: 'pink', blocks: 300 }, { crop: 'oyster', blocks: 950 }] })), 950);
  assert.equal(runBlocksOf(b({ runId: 3, runCrops: [{ crop: 'pink', blocks: 300 }] })), 0);
});

test('the stock moves of a delivery: its receipt, a placed row out (less what was lost before), a waiting row\'s losses', () => {
  const first = b({ id: 1, blocks: 700, pricePerBlock: 2.3, receivedAt: 1000 });
  const part = b({ id: 2, parentId: 1, blocks: 500, placedAt: 3000, runId: 9 });
  const checks = { 1: [{ at: 1500, lost: 10 }], 2: [{ at: 2000, lost: 5 }, { at: 4000, lost: 3 }] };
  assert.deepEqual(movesOf([first, part], (id) => checks[id] ?? []), [
    { refId: 1, at: 1000, qty: 1200, unitCost: 2.3, note: null },
    { refId: 1, at: 1500, qty: -10, unitCost: null, note: 'contaminated' },
    { refId: 2, at: 2000, qty: -5, unitCost: null, note: 'contaminated' },
    { refId: 2, at: 3000, qty: -495, unitCost: null, note: 'into a room' },
  ]);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-math.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `server/batches-math.js`**

```js
// The Batches figures (spec 2026-11-05-batches-design.md 3.1, 3.2 and 4), pure: a batch here is a store row (camelCase,
// with lost, runEndedAt and runCrops).

export const round = (v, places) => {
  const f = 10 ** places;
  return Math.round(v * f) / f;
};

// The blocks not lost to contamination.
export const goodOf = (b) => b.blocks - (b.lost ?? 0);

// Dry substrate kg per block: the block's weight less its water; null without them.
export const dryKgOf = (b) => (b.blockKg == null || b.waterPct == null ? null : round(b.blockKg * (1 - b.waterPct / 100), 3));

// A run's batches → { <crop>: dry kg per block } for each crop whose batches all have a weight, weighted by their blocks
// (spec 3.2: Harvest's BE then uses it instead of Settings → Yield).
export function runDryKg(rows) {
  const byCrop = new Map();
  for (const b of rows) byCrop.set(b.crop, [...(byCrop.get(b.crop) ?? []), b]);
  const out = {};
  for (const [crop, list] of byCrop) {
    if (list.some((b) => dryKgOf(b) === null)) continue;
    const blocks = list.reduce((s, b) => s + b.blocks, 0);
    out[crop] = round(list.reduce((s, b) => s + b.blocks * b.blockKg * (1 - b.waterPct / 100), 0) / blocks, 3);
  }
  return out;
}

// Σ blocks × price per block, to 2 places; null when any row's price is unknown (the contract's rule); 0 with no rows.
export function blockCost(rows) {
  if (rows.some((b) => b.pricePerBlock == null)) return null;
  return round(rows.reduce((s, b) => s + b.blocks * b.pricePerBlock, 0), 2);
}

// 'waiting' (not yet in a room), 'placed' (in a room's open run) or 'past' (its run ended, or its room was deleted: a placed
// time with no room).
export const statusOf = (b) => (b.runId == null ? (b.placedAt == null ? 'waiting' : 'past') : b.runEndedAt == null ? 'placed' : 'past');

// The run's blocks of the batch's crop (the Crop tab's count); null for a waiting batch.
export function runBlocksOf(b) {
  if (b.runId == null || !Array.isArray(b.runCrops)) return null;
  return b.runCrops.find((c) => c.crop === b.crop)?.blocks ?? 0;
}

// The stock moves a delivery should have (spec 3.1), from its rows (the first row and its parts) and checksOf(id) (a row's
// checks, oldest first): + the delivery's blocks on the first row at its receipt; a waiting row's losses out; a placed row's
// losses before it went in out, then the rest of its blocks out when it went in (a loss after that is in a room, not stock).
export function movesOf(family, checksOf) {
  const first = family.find((b) => b.parentId == null) ?? family[0];
  const total = family.reduce((s, b) => s + b.blocks, 0);
  const moves = [{ refId: first.id, at: first.receivedAt, qty: total, unitCost: first.pricePerBlock ?? null, note: null }];
  for (const b of family) {
    const checks = checksOf(b.id);
    const before = b.placedAt == null ? checks : checks.filter((c) => c.at <= b.placedAt);
    for (const c of before) moves.push({ refId: b.id, at: c.at, qty: -c.lost, unitCost: null, note: 'contaminated' });
    if (b.placedAt == null) continue;
    const out = b.blocks - before.reduce((s, c) => s + c.lost, 0);
    if (out > 0) moves.push({ refId: b.id, at: b.placedAt, qty: -out, unitCost: null, note: 'into a room' });
  }
  return moves;
}
```

- [ ] **Step 4: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-math.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/batches-math.js tests/batches-math.test.js
git commit -m "Batches 2: the pure figures (good blocks, dry kg, a run's dry kg per crop, blockCost, status, the stock moves of a delivery)"
```

---

### Task 3: Receive, list, detail, edit, delete (`server/batches.js`)

**Files:**
- Create: `server/batches.js`
- Test: `tests/batches.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/batches.test.js` (Tasks 4–6 add to it):

```js
// Batches (spec 2026-11-05-batches-design.md 3, 3.1, 3.2 and 6): receive, list, edit, delete, put into a room and take out,
// contamination checks, the stock moves, the BE hook.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createBatches } from '../server/batches.js';
import { openWithStock } from './batches-fixture.js';

const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const GOOD = { crop: 'oyster', supplier: 'Agro Supplies', receivedAt: NOW - 2 * DAY, blocks: 1200, pricePerBlock: 2.3, spawnBatch: '0912' };

function setup(t, { stock = false } = {}) {
  const db = stock ? openWithStock(t) : openDb(':memory:');
  if (!stock) t.after(() => db.close());
  let clock = NOW;
  const batches = createBatches({ db, now: () => clock });
  const told = [];
  batches.onChange((c) => told.push(c));
  let n = 0;
  function room(crops = [{ crop: 'oyster', blocks: 950 }]) {
    n += 1;
    const id = db.createRoom({ ...ROOM, name: `Container ${n}` }, 1000).id;
    db.setProgram(id, { ...db.getProgram(id), crops }, { change: 'start', at: NOW - 5 * DAY });
    return id;
  }
  return { db, batches, told, room, tick: (ms) => { clock += ms; }, now: () => clock };
}

const status = (fn) => {
  try { fn(); } catch (err) { return [err.status, err.field ?? null, err.message]; }
  return null;
};

test('receive: a waiting bought batch with its fields; the defaults', (t) => {
  const { batches, told } = setup(t);
  const b = batches.receive({ ...GOOD, strain: ' PL-27 ', deliveryRef: 'DN-551', note: 'two pallets', inoculatedAt: NOW - 20 * DAY, blockKg: 2.3, waterPct: 60 });
  assert.equal(b.kind, 'bought');
  assert.equal(b.status, 'waiting');
  assert.equal(b.strain, 'PL-27', 'trimmed');
  assert.equal(b.good, 1200);
  assert.equal(b.dryKg, 0.92);
  assert.equal(b.runBlocks, null);
  assert.deepEqual(told.at(-1), { batchId: b.id, roomId: null, runId: null, harvestRooms: [] });
  const plain = batches.receive({ crop: 'pink', supplier: 'Farm Co', blocks: 10 });
  assert.equal(plain.receivedAt, NOW, 'received now when not given');
  assert.equal(plain.pricePerBlock, null);
  assert.equal(plain.spawnBatch, null);
});

test('receive: each bad field is a 400 naming it', (t) => {
  const { batches } = setup(t);
  const cases = [
    [{ crop: 'tomato' }, 'crop'],
    [{ supplier: '  ' }, 'supplier'],
    [{ supplier: 'x'.repeat(81) }, 'supplier'],
    [{ receivedAt: NOW + DAY }, 'receivedAt'],
    [{ blocks: 0 }, 'blocks'],
    [{ blocks: 1.5 }, 'blocks'],
    [{ blocks: 100_001 }, 'blocks'],
    [{ pricePerBlock: -1 }, 'pricePerBlock'],
    [{ pricePerBlock: 1001 }, 'pricePerBlock'],
    [{ spawnBatch: 'a\u0007b' }, 'spawnBatch'],
    [{ note: 'n'.repeat(501) }, 'note'],
    [{ inoculatedAt: GOOD.receivedAt + DAY }, 'inoculatedAt'],
    [{ blockKg: 2.3 }, 'waterPct'],
    [{ waterPct: 60 }, 'blockKg'],
    [{ blockKg: 11, waterPct: 60 }, 'blockKg'],
    [{ blockKg: 2, waterPct: 90 }, 'waterPct'],
  ];
  for (const [change, field] of cases) {
    const got = status(() => batches.receive({ ...GOOD, ...change }));
    assert.deepEqual(got?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.receive(null))[0], 400);
});

test('list: newest received first; by run, dates and status; blockCost; bad queries', (t) => {
  const { batches } = setup(t);
  const a = batches.receive({ ...GOOD, receivedAt: NOW - 10 * DAY });
  const b = batches.receive({ ...GOOD, receivedAt: NOW - DAY, pricePerBlock: null });
  assert.deepEqual(batches.list().batches.map((x) => x.id), [b.id, a.id]);
  assert.equal(batches.list().blockCost, null, 'one price unknown');
  const sinceFive = batches.list({ from: '2026-10-31' });
  assert.deepEqual(sinceFive.batches.map((x) => x.id), [b.id]);
  assert.deepEqual(batches.list({ to: '2026-10-26' }).batches.map((x) => x.id), [a.id], 'to is inclusive (received 26 Oct)');
  assert.equal(batches.list({ from: '2026-10-26', to: '2026-10-26' }).blockCost, 2760);
  assert.deepEqual(batches.list({ status: 'placed' }).batches, []);
  for (const [q, field] of [[{ run: 'x' }, 'run'], [{ from: '2026-13-01' }, 'from'], [{ to: '5 Nov' }, 'to'], [{ status: 'gone' }, 'status']]) {
    assert.deepEqual(status(() => batches.list(q)).slice(0, 2), [400, field]);
  }
});

test('detail: the row, its delivery and checks; 404', (t) => {
  const { batches } = setup(t);
  const a = batches.receive(GOOD);
  const d = batches.detail(a.id);
  assert.equal(d.id, a.id);
  assert.deepEqual(d.delivery.map((x) => x.id), [a.id]);
  assert.deepEqual(d.checks, []);
  assert.equal(d.batchBlocks, null);
  assert.equal(status(() => batches.detail(999))[0], 404);
});

test('edit: fields change; blocks only on a waiting first row; cross checks against the stored row', (t) => {
  const { batches } = setup(t);
  const a = batches.receive({ ...GOOD, blockKg: 2.3, waterPct: 60 });
  const e = batches.edit(a.id, { supplier: 'Agro Supplies Sdn Bhd', blocks: 1100, note: '' });
  assert.equal(e.supplier, 'Agro Supplies Sdn Bhd');
  assert.equal(e.blocks, 1100);
  assert.equal(e.note, null);
  assert.equal(e.blockKg, 2.3, 'not given: kept');
  assert.equal(batches.edit(a.id, { blockKg: null, waterPct: null }).dryKg, null);
  assert.deepEqual(status(() => batches.edit(a.id, { blockKg: 2 })).slice(0, 2), [400, 'waterPct'], 'water % is still empty');
  assert.deepEqual(status(() => batches.edit(a.id, { inoculatedAt: NOW })).slice(0, 2), [400, 'inoculatedAt'], 'after the stored received day');
  assert.equal(status(() => batches.edit(999, {}))[0], 404);
});

test('delete: a batch goes; 404 after', (t) => {
  const { batches, told } = setup(t);
  const a = batches.receive(GOOD);
  batches.remove(a.id);
  assert.equal(status(() => batches.detail(a.id))[0], 404);
  assert.equal(told.at(-1).batchId, a.id);
  assert.equal(status(() => batches.remove(a.id))[0], 404);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `server/batches.js`**

This is the whole module; Tasks 4–6 only add tests (and Task 6 the CSV method is already here).

```js
// Batches (spec 2026-11-05-batches-design.md 3 and 6): receive bought blocks, put them into a room's open run (a part split
// off when fewer go in) and take them out, contamination checks, the views, the CSV, and a run's dry kg for Harvest's BE
// (3.2). Every write keeps Inventory's stock moves in step (3.1) when Inventory's tables exist. No HTTP.

import { CROP_KEYS, cropShortName } from '../web/crops.js';
import { localDate, dayStart, addDays } from './task-rules.js';
import { checkWorker, TaskError } from './tasks.js';
import { cell } from './csv.js';
import { goodOf, dryKgOf, runDryKg, blockCost, statusOf, runBlocksOf, movesOf } from './batches-math.js';

export const MAX_BLOCKS = 100_000;
export const CAUSES = ['green', 'black', 'bacterial', 'pests', 'other'];
const STATUSES = ['waiting', 'placed', 'past'];
const MAX_TEXT = 80;
const MAX_NOTE = 500;
const EARLIEST = Date.UTC(2000, 0, 1);
// Edited on any row of a delivery, written to all of them (spec 2.1); a part copies these and the making columns.
const SHARED = ['crop', 'supplier', 'receivedAt', 'pricePerBlock', 'spawnBatch', 'strain', 'deliveryRef', 'inoculatedAt', 'blockKg', 'waterPct'];
const COPIED = [...SHARED, 'kind', 'recipeId', 'mixedAt', 'incubation', 'incubatedFrom', 'incubatedTo'];
const CSV_HEAD = ['received', 'crop', 'kind', 'supplier', 'strain', 'spawn batch', 'delivery note', 'blocks', 'lost', 'price per block', 'room',
  'run started', 'placed', 'block kg', 'water %', 'note'];

export class BatchError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'BatchError';
    this.status = status;
    this.field = field;
  }
}

const bad = (message, field) => new BatchError(400, message, field);
const conflict = (message, field) => new BatchError(409, message, field);
const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const numIn = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && localDate(dayStart(s)) === s;
const grouped = (n) => n.toLocaleString('en-US');
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

// A text field: trimmed, at most max characters, no control characters (a note may hold line breaks); empty is null.
function textOf(v, field, label, max = MAX_TEXT) {
  if (v === undefined || v === null) return null;
  const control = field === 'note' ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (typeof v !== 'string' || control.test(v)) throw bad(`${label} must be plain text`, field);
  const s = v.trim();
  if (s.length > max) throw bad(`${label} must be at most ${max} characters`, field);
  return s || null;
}

// The receive fields of body, checked (spec 3). With `was` (an edit) only the fields given are checked and returned, the
// cross checks (inoculated by received, weight with water) made against the stored row. → camelCase fields.
function checkFields(body, now, was = null) {
  if (!isPlain(body)) throw bad('Body must be a JSON object');
  const has = (k) => Object.hasOwn(body, k);
  const asked = (k) => !was || has(k);
  const out = {};
  if (asked('crop')) {
    if (!CROP_KEYS.includes(body.crop)) throw bad('Pick a crop', 'crop');
    out.crop = body.crop;
  }
  if (asked('supplier')) {
    out.supplier = textOf(body.supplier, 'supplier', 'Supplier');
    if (!out.supplier) throw bad('Give the supplier', 'supplier');
  }
  if (asked('receivedAt')) {
    const v = has('receivedAt') ? body.receivedAt : now;
    if (!Number.isInteger(v) || v > now || v < EARLIEST) throw bad('Pick the day received, not in the future', 'receivedAt');
    out.receivedAt = v;
  }
  if (asked('blocks')) {
    if (!intIn(body.blocks, 1, MAX_BLOCKS)) throw bad('Blocks must be a whole number from 1 to 100,000', 'blocks');
    out.blocks = body.blocks;
  }
  if (asked('pricePerBlock')) {
    const v = body.pricePerBlock ?? null;
    if (v !== null && !numIn(v, 0, 1000)) throw bad('Price per block must be RM 0–1,000, or empty', 'pricePerBlock');
    out.pricePerBlock = v === null ? null : Math.round(v * 10_000) / 10_000;
  }
  for (const [key, label] of [['spawnBatch', 'Spawn batch'], ['strain', 'Strain'], ['deliveryRef', 'Delivery note']]) {
    if (asked(key)) out[key] = textOf(body[key], key, label);
  }
  if (asked('note')) out.note = textOf(body.note, 'note', 'Note', MAX_NOTE);
  if (asked('inoculatedAt')) {
    const v = body.inoculatedAt ?? null;
    if (v !== null && !(Number.isInteger(v) && v >= EARLIEST)) throw bad('Pick the day inoculated', 'inoculatedAt');
    out.inoculatedAt = v;
  }
  if (asked('blockKg') || asked('waterPct')) {
    const kg = has('blockKg') ? body.blockKg ?? null : was?.blockKg ?? null;
    const water = has('waterPct') ? body.waterPct ?? null : was?.waterPct ?? null;
    if (kg !== null && !numIn(kg, 0.2, 10)) throw bad('Block weight must be 0.2–10 kg, or empty', 'blockKg');
    if (water !== null && !numIn(water, 30, 80)) throw bad('Water must be 30–80 %, or empty', 'waterPct');
    if (kg === null && water !== null) throw bad('Give the block weight with the water %', 'blockKg');
    if (kg !== null && water === null) throw bad('Give the water % with the block weight', 'waterPct');
    out.blockKg = kg;
    out.waterPct = water;
  }
  const received = out.receivedAt ?? was?.receivedAt;
  const inoculated = 'inoculatedAt' in out ? out.inoculatedAt : was?.inoculatedAt ?? null;
  if (inoculated !== null && localDate(inoculated) > localDate(received)) throw bad('Inoculated must be on or before the day received', 'inoculatedAt');
  return out;
}

// The list's query, from the address's strings (null: not given). → { run, from, to, status }.
function queryOf({ run = null, from = null, to = null, status = null } = {}) {
  if (run !== null && !/^[1-9][0-9]{0,14}$/.test(String(run))) throw bad('run must be a run id', 'run');
  if (from !== null && !isDate(from)) throw bad('from must be a date, YYYY-MM-DD', 'from');
  if (to !== null && !isDate(to)) throw bad('to must be a date, YYYY-MM-DD', 'to');
  if (status !== null && !STATUSES.includes(status)) throw bad('status must be waiting, placed or past', 'status');
  return { run: run === null ? null : Number(run), from, to, status };
}

// A store row as the API shows it (spec 6).
function viewOf(b) {
  return {
    id: b.id, kind: b.kind, parentId: b.parentId, runId: b.runId, roomId: b.roomId, roomName: b.roomName, crop: b.crop,
    supplier: b.supplier, receivedAt: b.receivedAt, blocks: b.blocks, lost: b.lost, good: goodOf(b), pricePerBlock: b.pricePerBlock,
    spawnBatch: b.spawnBatch, strain: b.strain, deliveryRef: b.deliveryRef, inoculatedAt: b.inoculatedAt, blockKg: b.blockKg,
    waterPct: b.waterPct, dryKg: dryKgOf(b), placedAt: b.placedAt, runStartedAt: b.runStartedAt, runEndedAt: b.runEndedAt,
    runBlocks: runBlocksOf(b), note: b.note, status: statusOf(b), createdAt: b.createdAt,
  };
}

// db: the farm database (db.batches is the store); now is injectable.
export function createBatches({ db, now = Date.now }) {
  const store = db.batches;
  const listeners = new Set();
  const firstOf = (b) => b.parentId ?? b.id;

  // After a write: fn({ batchId, roomId, runId, harvestRooms }) — harvestRooms: the rooms of the placed rows it touched
  // (before or after), whose Harvest figures may change (3.2).
  function tell(rows) {
    const touched = rows.filter(Boolean);
    const placed = touched.find((b) => b.roomId != null);
    const change = {
      batchId: touched[0]?.id ?? null, roomId: placed?.roomId ?? null, runId: placed?.runId ?? null,
      harvestRooms: [...new Set(touched.filter((b) => b.roomId != null).map((b) => b.roomId))],
    };
    for (const fn of [...listeners]) fn(change);
  }

  function batchOf(id) {
    const b = Number.isInteger(id) ? store.get(id) : null;
    if (!b) throw new BatchError(404, 'Batch not found');
    return b;
  }

  // Inventory's moves of a delivery written again from its rows (3.1); `gone`: ids of rows just deleted. Inside the write's
  // transaction; nothing without Inventory's tables.
  function sync(firstId, gone = []) {
    if (!store.hasStock()) return;
    const family = store.family(firstId);
    store.deleteMoves([...family.map((b) => b.id), ...gone]);
    if (!family.length) return;
    const itemId = store.blocksItem(`${cropShortName(family[0].crop)} blocks`);
    for (const m of movesOf(family, (id) => store.checks(id))) store.insertMove({ itemId, ...m });
  }

  // A check's fields (spec 3): at most `max` blocks lost; `was` (an edit): a field not given keeps its stored value.
  function checkOf(body, b, max, was = null) {
    if (!isPlain(body)) throw bad('Body must be a JSON object');
    const t = now();
    const given = (k) => Object.hasOwn(body, k);
    const at = given('at') ? body.at : was?.at ?? t;
    if (!Number.isInteger(at) || at > t || localDate(at) < localDate(b.receivedAt)) throw bad('Pick a time from the day received to now', 'at');
    const lost = given('lost') ? body.lost : was?.lost;
    if (max < 1) throw conflict('Every block of this batch is lost already');
    if (!intIn(lost, 1, max)) throw bad(`Blocks lost must be a whole number from 1 to ${grouped(max)}`, 'lost');
    const cause = given('cause') ? body.cause : was?.cause;
    if (!CAUSES.includes(cause)) throw bad('Pick a cause', 'cause');
    let worker = was?.worker ?? null;
    if (!was || given('worker')) {
      try {
        worker = checkWorker(db, body.worker);
      } catch (err) {
        if (err instanceof TaskError) throw new BatchError(err.status, err.message, err.field);
        throw err;
      }
    }
    const note = given('note') || !was ? textOf(body.note, 'note', 'Note', MAX_NOTE) : was.note;
    return { at, lost, cause, worker, note };
  }

  return {
    // { batches: [view], blockCost } (spec 6), newest received first.
    list(query = {}) {
      const { run, from, to, status } = queryOf(query);
      const rows = store.all().filter((b) => (run === null || b.runId === run)
        && (from === null || localDate(b.receivedAt) >= from) && (to === null || localDate(b.receivedAt) <= to));
      const batches = rows.map(viewOf).filter((b) => status === null || b.status === status);
      return { batches, blockCost: blockCost(batches) };
    },

    // A batch with its delivery, its checks (newest first) and, when placed, the run's batches' blocks of its crop.
    detail(id) {
      const b = batchOf(id);
      const sameRun = b.runId == null ? null : store.byRun(b.runId).filter((x) => x.crop === b.crop);
      return {
        ...viewOf(b),
        delivery: store.family(firstOf(b)).map(viewOf),
        checks: store.checks(b.id).toReversed(),
        batchBlocks: sameRun === null ? null : sameRun.reduce((s, x) => s + x.blocks, 0),
      };
    },

    // Receive bought blocks (spec 3). → the view.
    receive(body) {
      const t = now();
      const fields = checkFields(body, t);
      const id = store.tx(() => {
        const made = store.insert({ kind: 'bought', ...fields, createdAt: t });
        sync(made);
        return made;
      });
      const b = store.get(id);
      tell([b]);
      return viewOf(b);
    },

    // Edit (spec 3): shared fields to every row of the delivery; crop only while all of it waits; blocks only on a waiting
    // first row with no parts, not below its lost blocks. → the view.
    edit(id, body) {
      const b = batchOf(id);
      const fields = checkFields(body, now(), b);
      const family = store.family(firstOf(b));
      if ('crop' in fields && fields.crop !== b.crop && family.some((x) => x.placedAt != null)) {
        throw conflict('Take the blocks out of the rooms to change the crop', 'crop');
      }
      if ('blocks' in fields && fields.blocks !== b.blocks) {
        if (b.parentId != null || family.length > 1 || b.placedAt != null) throw conflict('Blocks change only on a waiting batch with no parts', 'blocks');
        if (fields.blocks < b.lost) throw bad(`Blocks can't be fewer than the ${grouped(b.lost)} lost`, 'blocks');
      }
      const shared = Object.fromEntries(Object.entries(fields).filter(([k]) => SHARED.includes(k)));
      const own = Object.fromEntries(Object.entries(fields).filter(([k]) => !SHARED.includes(k)));
      store.tx(() => {
        if (Object.keys(shared).length) for (const x of family) store.update(x.id, shared);
        if (Object.keys(own).length) store.update(id, own);
        sync(firstOf(b));
      });
      const after = store.get(id);
      tell([after, ...family]);
      return viewOf(after);
    },

    // Delete (spec 3): a first row with parts is refused; a part's blocks are not given back.
    remove(id) {
      const b = batchOf(id);
      if (b.parentId == null && store.family(b.id).length > 1) throw conflict('Take its parts out of the rooms first');
      store.tx(() => {
        store.remove(id);
        sync(firstOf(b), [id]);
      });
      tell([b]);
    },

    // Put `blocks` of a waiting row into the room's open run (spec 3): all its good blocks move the row itself; fewer split a
    // part off (2.1). → the view of the row put in.
    place(id, body) {
      if (!isPlain(body)) throw bad('Body must be a JSON object');
      const b = batchOf(id);
      if (b.placedAt != null) throw conflict(b.runId != null ? `These blocks are in ${b.roomName} already` : 'These blocks went into a room that was deleted');
      const room = Number.isInteger(body.roomId) ? db.getRoom(body.roomId) : null;
      if (!room) throw bad('Pick a room', 'roomId');
      const good = goodOf(b);
      if (good < 1) throw conflict('Every block of this batch was lost');
      const n = body.blocks ?? good;
      if (!intIn(n, 1, good)) throw bad(`Blocks must be a whole number from 1 to ${grouped(good)}`, 'blocks');
      const run = db.openRun(room.id);
      if (!run) throw conflict(`Give ${room.name} its crops on the Crop tab first`);
      if (!run.crops.some((c) => c.crop === b.crop)) throw conflict(`${room.name}'s run has no ${cropShortName(b.crop)}`);
      const t = now();
      const placedId = store.tx(() => {
        let rowId = id;
        if (n === good) {
          store.update(id, { runId: run.id, roomId: room.id, placedAt: t });
        } else {
          const first = store.get(firstOf(b));
          rowId = store.insert({ ...pick(first, COPIED), parentId: first.id, blocks: n, runId: run.id, roomId: room.id, placedAt: t, createdAt: t });
          store.update(id, { blocks: b.blocks - n });
        }
        sync(firstOf(b));
        return rowId;
      });
      const placed = store.get(placedId);
      tell([placed]);
      return viewOf(placed);
    },

    // Take a row out of its room while the run is open (spec 3): a part whose first row waits folds back into it; another
    // row waits again. → the view of the row that waits.
    unplace(id) {
      const b = batchOf(id);
      if (b.runId == null) throw conflict('These blocks are not in a room');
      if (b.runEndedAt != null) throw conflict(`${b.roomName}'s run has ended`);
      const first = b.parentId == null ? null : store.get(b.parentId);
      const waitingId = store.tx(() => {
        if (first && first.placedAt == null) {
          store.update(first.id, { blocks: first.blocks + b.blocks });
          store.moveChecks(b.id, first.id);
          store.remove(b.id);
          sync(first.id, [b.id]);
          return first.id;
        }
        store.update(b.id, { runId: null, roomId: null, placedAt: null });
        sync(firstOf(b));
        return b.id;
      });
      const waiting = store.get(waitingId);
      tell([b, waiting]);
      return viewOf(waiting);
    },

    // A contamination check on a row (spec 3). → the check.
    addCheck(id, body) {
      const b = batchOf(id);
      const fields = checkOf(body, b, goodOf(b));
      const checkId = store.tx(() => {
        const made = store.insertCheck({ batchId: b.id, ...fields, createdAt: now() });
        sync(firstOf(b));
        return made;
      });
      tell([b]);
      return store.check(checkId);
    },

    editCheck(checkId, body) {
      const c = Number.isInteger(checkId) ? store.check(checkId) : null;
      if (!c) throw new BatchError(404, 'Check not found');
      const b = store.get(c.batchId);
      const fields = checkOf(body, b, goodOf(b) + c.lost, c);
      store.tx(() => {
        store.updateCheck(checkId, fields);
        sync(firstOf(b));
      });
      tell([b]);
      return store.check(checkId);
    },

    removeCheck(checkId) {
      const c = Number.isInteger(checkId) ? store.check(checkId) : null;
      if (!c) throw new BatchError(404, 'Check not found');
      const b = store.get(c.batchId);
      store.tx(() => {
        store.removeCheck(checkId);
        sync(firstOf(b));
      });
      tell([b]);
    },

    // { <crop>: dry kg per block } of a run's batches whose weights are all known (spec 3.2; harvests.js).
    dryKgFor: (runId) => runDryKg(store.byRun(runId)),

    // The batches received from `from` to `to` (farm dates; the last 90 days by default) as CSV, oldest first:
    // { name: 'batches <from>–<to>.csv', text } (the route adds the BOM).
    csv(query = {}) {
      const today = localDate(now());
      const asked = queryOf({ from: query.from ?? null, to: query.to ?? null });
      const from = asked.from ?? addDays(today, -89);
      const to = asked.to ?? today;
      const rows = store.all().filter((b) => localDate(b.receivedAt) >= from && localDate(b.receivedAt) <= to).toReversed();
      const lines = [CSV_HEAD, ...rows.map((b) => [
        localDate(b.receivedAt), cropShortName(b.crop), b.kind, b.supplier, b.strain, b.spawnBatch, b.deliveryRef, b.blocks, b.lost,
        b.pricePerBlock, b.roomName, b.runStartedAt == null ? null : localDate(b.runStartedAt), b.placedAt == null ? null : localDate(b.placedAt),
        b.blockKg, b.waterPct, b.note,
      ])];
      return { name: `batches ${from}–${to}.csv`, text: `${lines.map((l) => l.map(cell).join(',')).join('\r\n')}\r\n` };
    },

    // fn(change) after every write (tell); → a function that stops it.
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/batches.js tests/batches.test.js
git commit -m "Batches 3: receive, list, detail, edit and delete bought batches (createBatches)"
```

---
### Task 4: Put into a room, split, take out

**Files:**
- Test: `tests/batches.test.js` (add)
- (`server/batches.js` already has `place` and `unplace` from Task 3; this task proves them and fixes what the tests find.)

- [ ] **Step 1: Write the tests**

First change Task 3's `setup` helper's `room` so a room can be made without crops (add the `if`):

```js
  function room(crops = [{ crop: 'oyster', blocks: 950 }]) {
    n += 1;
    const id = db.createRoom({ ...ROOM, name: `Container ${n}` }, 1000).id;
    if (crops) db.setProgram(id, { ...db.getProgram(id), crops }, { change: 'start', at: NOW - 5 * DAY });
    return id;
  }
```

Append to `tests/batches.test.js`:

```js
test('place all the good blocks: the row itself goes in, its room and run shown', (t) => {
  const { batches, room, told } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const p = batches.place(a.id, { roomId });
  assert.equal(p.id, a.id);
  assert.equal(p.status, 'placed');
  assert.equal(p.roomName, 'Container 1');
  assert.equal(p.placedAt, NOW);
  assert.equal(p.runBlocks, 950);
  assert.deepEqual(told.at(-1).harvestRooms, [roomId]);
  const d = batches.detail(a.id);
  assert.equal(d.batchBlocks, 1200, 'more than the run\'s 950: allowed, the page says so');
  assert.deepEqual(batches.list({ run: String(p.runId) }).batches.map((x) => x.id), [a.id]);
});

test('place fewer: a part splits off with the shared fields; the first row keeps the rest', (t) => {
  const { batches, room } = setup(t);
  const one = room();
  const two = room();
  const a = batches.receive({ ...GOOD, strain: 'PL-27', blockKg: 2.3, waterPct: 60, note: 'first only' });
  const part = batches.place(a.id, { roomId: one, blocks: 800 });
  assert.notEqual(part.id, a.id);
  assert.equal(part.parentId, a.id);
  assert.deepEqual([part.blocks, part.supplier, part.strain, part.blockKg, part.pricePerBlock, part.note], [800, 'Agro Supplies', 'PL-27', 2.3, 2.3, null]);
  assert.equal(batches.detail(a.id).blocks, 400);
  assert.deepEqual(batches.detail(a.id).delivery.map((x) => x.id), [a.id, part.id]);
  const rest = batches.place(a.id, { roomId: two });
  assert.equal(rest.id, a.id, 'the rest: the first row itself');
  assert.equal(rest.roomName, 'Container 2');
});

test('a waiting part splits from the first row\'s family, never from itself', (t) => {
  const { batches, room } = setup(t);
  const one = room();
  const two = room();
  const a = batches.receive(GOOD);
  const p1 = batches.place(a.id, { roomId: one, blocks: 800 });
  batches.place(a.id, { roomId: two }); // the first row goes in too
  const back = batches.unplace(p1.id); // the first row is placed: the part waits on its own
  assert.equal(back.id, p1.id);
  assert.equal(back.status, 'waiting');
  const p2 = batches.place(p1.id, { roomId: two, blocks: 300 });
  assert.equal(p2.parentId, a.id);
  assert.equal(batches.detail(p1.id).blocks, 500);
});

test('take out: a part folds back into its waiting first row with its checks; otherwise the row waits', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 800 });
  batches.addCheck(part.id, { lost: 4, cause: 'green', worker: 'Ali' });
  const back = batches.unplace(part.id);
  assert.equal(back.id, a.id);
  assert.equal(back.blocks, 1200);
  assert.equal(back.lost, 4, 'the part\'s check moved to the first row');
  assert.equal(batches.detail(a.id).delivery.length, 1);
  const whole = batches.place(a.id, { roomId });
  assert.equal(batches.unplace(whole.id).status, 'waiting');
});

test('place and take out: the refusals', (t) => {
  const { db, batches, room, tick } = setup(t);
  const oyster = room();
  const pink = room([{ crop: 'pink', blocks: 300 }]);
  const empty = room(null);
  const a = batches.receive(GOOD);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: 999 })).slice(0, 2), [400, 'roomId']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: oyster, blocks: 1201 })).slice(0, 2), [400, 'blocks']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: oyster, blocks: 0 })).slice(0, 2), [400, 'blocks']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: empty })), [409, null, 'Give Container 3 its crops on the Crop tab first']);
  assert.deepEqual(status(() => batches.place(a.id, { roomId: pink })), [409, null, "Container 2's run has no Grey oyster"]);
  assert.equal(status(() => batches.unplace(a.id))[0], 409, 'not in a room');
  batches.place(a.id, { roomId: oyster });
  assert.equal(status(() => batches.place(a.id, { roomId: oyster }))[0], 409, 'in a room already');
  tick(DAY);
  db.setProgram(oyster, { ...db.getProgram(oyster), crops: [] }, { change: 'end', at: NOW + DAY });
  assert.deepEqual(status(() => batches.unplace(a.id)), [409, null, "Container 1's run has ended"]);
  assert.equal(batches.detail(a.id).status, 'past');
  assert.equal(status(() => batches.edit(a.id, { crop: 'pink' }))[0], 409, 'crop of a placed delivery');
  assert.equal(status(() => batches.edit(a.id, { blocks: 1000 }))[0], 409, 'blocks of a placed row');
});

test('delete: a first row with parts is refused; a part is deleted without giving its blocks back', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 200 });
  assert.deepEqual(status(() => batches.remove(a.id)), [409, null, 'Take its parts out of the rooms first']);
  batches.remove(part.id);
  assert.equal(batches.detail(a.id).blocks, 1000);
  batches.remove(a.id);
  assert.deepEqual(batches.list().batches, []);
});

test('shared fields edited on a part are written to the whole delivery; a note stays the row\'s own', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 200 });
  batches.edit(part.id, { pricePerBlock: 2.5, spawnBatch: '0913', note: 'part note' });
  assert.deepEqual([batches.detail(a.id).pricePerBlock, batches.detail(a.id).spawnBatch, batches.detail(a.id).note], [2.5, '0913', null]);
  assert.equal(batches.detail(part.id).note, 'part note');
});
```

- [ ] **Step 2: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches.test.js`
Expected: PASS. A failure is a bug in Task 3's `place`, `unplace`, `remove` or `edit`: fix it there (the test is the spec's rule), rerun.

- [ ] **Step 3: Commit**

```bash
git add tests/batches.test.js server/batches.js
git commit -m "Batches 4: put into a room (a part splits off), take out (a part folds back), the refusals"
```

---

### Task 5: Contamination checks

**Files:**
- Test: `tests/batches.test.js` (add)

- [ ] **Step 1: Write the tests**

Append to `tests/batches.test.js`:

```js
test('checks: record, list newest first, edit, delete; good blocks follow', (t) => {
  const { batches, tick } = setup(t);
  const a = batches.receive(GOOD);
  const c1 = batches.addCheck(a.id, { lost: 20, cause: 'green', worker: 'Ali', note: 'top shelf' });
  assert.deepEqual([c1.batchId, c1.at, c1.lost, c1.cause, c1.worker, c1.note], [a.id, NOW, 20, 'green', 'Ali', 'top shelf']);
  tick(60_000);
  const c2 = batches.addCheck(a.id, { lost: 5, cause: 'pests', worker: 'Siti' });
  const d = batches.detail(a.id);
  assert.equal(d.good, 1175);
  assert.deepEqual(d.checks.map((c) => c.id), [c2.id, c1.id]);
  const e = batches.editCheck(c1.id, { lost: 30 });
  assert.deepEqual([e.lost, e.worker, e.note], [30, 'Ali', 'top shelf'], 'not given: kept');
  batches.removeCheck(c2.id);
  assert.equal(batches.detail(a.id).good, 1170);
  assert.equal(status(() => batches.removeCheck(c2.id))[0], 404);
  assert.equal(status(() => batches.editCheck(999, { lost: 1 }))[0], 404);
});

test('checks: the refusals', (t) => {
  const { batches } = setup(t);
  const a = batches.receive({ ...GOOD, blocks: 10 });
  const cases = [
    [{ lost: 11, cause: 'green', worker: 'Ali' }, 'lost'],
    [{ lost: 0, cause: 'green', worker: 'Ali' }, 'lost'],
    [{ lost: 1, cause: 'rot', worker: 'Ali' }, 'cause'],
    [{ lost: 1, cause: 'green', worker: '' }, 'worker'],
    [{ lost: 1, cause: 'green', worker: 'Ali', at: NOW + 60_000 }, 'at'],
    [{ lost: 1, cause: 'green', worker: 'Ali', at: GOOD.receivedAt - 86_400_000 }, 'at'],
  ];
  for (const [body, field] of cases) assert.deepEqual(status(() => batches.addCheck(a.id, body)).slice(0, 2), [400, field], JSON.stringify(body));
  const c = batches.addCheck(a.id, { lost: 10, cause: 'black', worker: 'Ali' });
  assert.equal(status(() => batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'Ali' }))[0], 409, 'all lost already');
  assert.equal(batches.editCheck(c.id, { lost: 10 }).lost, 10, 'its own lost blocks count back in');
});

test('checks: a name not on the workers list is refused when the farm has one', (t) => {
  const { db, batches } = setup(t);
  db.setWorkers([{ name: 'Ali', active: true }]);
  const a = batches.receive(GOOD);
  assert.deepEqual(status(() => batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'Bob' })).slice(0, 2), [400, 'worker']);
  assert.equal(batches.addCheck(a.id, { lost: 1, cause: 'green', worker: 'ali' }).worker, 'Ali');
});

test('a batch whose blocks are all lost cannot be put into a room', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const a = batches.receive({ ...GOOD, blocks: 3 });
  batches.addCheck(a.id, { lost: 3, cause: 'bacterial', worker: 'Ali' });
  assert.deepEqual(status(() => batches.place(a.id, { roomId })), [409, null, 'Every block of this batch was lost']);
});
```

- [ ] **Step 2: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches.test.js`
Expected: PASS (fix `checkOf` in `server/batches.js` if not). Check `db.setWorkers`'s argument shape in `server/db.js` (around line 1903) if the workers test fails on it.

- [ ] **Step 3: Commit**

```bash
git add tests/batches.test.js server/batches.js
git commit -m "Batches 5: contamination checks (record, edit, delete, the refusals, the workers list)"
```

---

### Task 6: Stock moves and the CSV

**Files:**
- Test: `tests/batches.test.js` (add)

- [ ] **Step 1: Write the tests**

Append to `tests/batches.test.js`:

```js
const movesOf = (db, ids) => db.batches.moves(ids).map((m) => [m.refId, m.qty, m.unitCost, m.note]);

test('stock moves: receipt, a part in, a loss while waiting, a fold, an edit, a delete', (t) => {
  const { db, batches, room, tick } = setup(t, { stock: true });
  const roomId = room();
  const a = batches.receive(GOOD);
  const item = db.batches.blocksItem('Grey oyster blocks');
  assert.deepEqual(db.batches.moves([a.id]).map((m) => m.itemId), [item], 'on the crop\'s blocks item');
  assert.deepEqual(movesOf(db, [a.id]), [[a.id, 1200, 2.3, null]]);
  tick(60_000);
  const part = batches.place(a.id, { roomId, blocks: 800 });
  assert.deepEqual(movesOf(db, [a.id, part.id]), [[a.id, 1200, 2.3, null], [part.id, -800, null, 'into a room']]);
  tick(60_000);
  batches.addCheck(a.id, { lost: 10, cause: 'green', worker: 'Ali' });
  assert.deepEqual(movesOf(db, [a.id, part.id]).at(-1), [a.id, -10, null, 'contaminated']);
  batches.unplace(part.id);
  assert.deepEqual(movesOf(db, [a.id, part.id]), [[a.id, 1200, 2.3, null], [a.id, -10, null, 'contaminated']], 'the fold: the part\'s moves gone');
  batches.edit(a.id, { pricePerBlock: 2.4 });
  assert.equal(db.batches.moves([a.id])[0].unitCost, 2.4);
  batches.edit(a.id, { crop: 'pink' });
  assert.deepEqual(db.batches.moves([a.id]).map((m) => m.itemId), [db.batches.blocksItem('Pink oyster blocks'), db.batches.blocksItem('Pink oyster blocks')]);
  batches.remove(a.id);
  assert.deepEqual(movesOf(db, [a.id, part.id]), []);
});

test('stock moves: a placed row\'s later losses are in a room, not stock; deleting a part lowers the receipt', (t) => {
  const { db, batches, room, tick } = setup(t, { stock: true });
  const roomId = room();
  const a = batches.receive(GOOD);
  const part = batches.place(a.id, { roomId, blocks: 200 });
  tick(60_000);
  batches.addCheck(part.id, { lost: 7, cause: 'pests', worker: 'Ali' });
  assert.deepEqual(movesOf(db, [part.id]), [[part.id, -200, null, 'into a room']]);
  batches.remove(part.id);
  assert.deepEqual(movesOf(db, [a.id, part.id]), [[a.id, 1000, 2.3, null]]);
});

test('without Inventory\'s tables nothing is written and nothing fails', (t) => {
  const { db, batches, room } = setup(t);
  const a = batches.receive(GOOD);
  batches.place(a.id, { roomId: room(), blocks: 100 });
  assert.equal(db.batches.hasStock(), false);
});

test('the CSV: the head, oldest first, the formula guard, the default 90 days', (t) => {
  const { batches, room } = setup(t);
  batches.receive({ ...GOOD, receivedAt: NOW - 100 * 86_400_000, supplier: 'Too old' });
  const a = batches.receive({ ...GOOD, receivedAt: NOW - 3 * 86_400_000, supplier: '=cmd' });
  batches.receive({ ...GOOD, receivedAt: NOW - 86_400_000, supplier: 'Later', note: 'a, b' });
  batches.place(a.id, { roomId: room() });
  const { name, text } = batches.csv();
  assert.equal(name, 'batches 2026-08-08–2026-11-05.csv');
  const lines = text.trimEnd().split('\r\n');
  assert.equal(lines[0], 'received,crop,kind,supplier,strain,spawn batch,delivery note,blocks,lost,price per block,room,run started,placed,block kg,water %,note');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "2026-11-02,Grey oyster,bought,'=cmd,,0912,,1200,0,2.3,Container 1,2026-10-31,2026-11-05,,,");
  assert.match(lines[2], /,"a, b"$/);
  assert.equal(batches.csv({ from: '2026-11-04', to: '2026-11-04' }).text.trimEnd().split('\r\n').length, 2);
  assert.equal(status(() => batches.csv({ from: 'x' }))[0], 400);
});
```

- [ ] **Step 2: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches.test.js`
Expected: PASS (fix `sync`, `movesOf` or `csv` if not).

- [ ] **Step 3: Commit**

```bash
git add tests/batches.test.js server/batches.js server/batches-math.js
git commit -m "Batches 6: Inventory's stock moves kept in step through every write; the CSV"
```

---

### Task 7: The BE hook in `server/harvests.js`

**Files:**
- Modify: `server/harvests.js` (`createHarvests` signature at line 56; `runView` at ~136; `farmView`'s current-run `runFigures` at ~248)
- Test: `tests/batches.test.js` (add)

- [ ] **Step 1: Write the failing test**

Append to `tests/batches.test.js` (add `import { createHarvests } from '../server/harvests.js';` to the imports at the top):

```js
test("Harvest's BE uses the batches' dry kg when every batch of the crop in the run has a weight (spec 3.2)", async (t) => {
  const { db, batches, room } = setup(t);
  const roomId = room([{ crop: 'oyster', blocks: 1000 }]);
  const harvests = createHarvests({ db, now: () => NOW, batchDryKg: batches.dryKgFor });
  t.after(() => harvests.stop());
  harvests.record(roomId, { crop: 'oyster', kg: 100, worker: 'Ali' });
  const before = harvests.roomView(roomId).current;
  assert.equal(before.be, null, 'no dry substrate in Settings and no batch');
  const a = batches.receive({ ...GOOD, blocks: 600, blockKg: 2.5, waterPct: 60 }); // 1.0 kg dry
  batches.place(a.id, { roomId });
  const b = batches.receive({ ...GOOD, blocks: 400 });
  batches.place(b.id, { roomId });
  assert.equal(harvests.roomView(roomId).current.be, null, 'one batch has no weight: Settings stays');
  batches.edit(b.id, { blockKg: 2.5, waterPct: 60 });
  assert.equal(harvests.roomView(roomId).current.be, 10, '100 kg ÷ (1,000 blocks × 1.0 kg) × 100');
  assert.deepEqual(harvests.roomView(roomId).current.missing.dryKg, []);
  assert.equal(harvests.farmView({ days: 30 }).rooms[0].current.be, 10);
  await harvests.warmed();
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test --test-name-pattern="BE uses" tests/batches.test.js`
Expected: FAIL (`be` stays null: `batchDryKg` is ignored).

- [ ] **Step 3: Change `server/harvests.js`**

1. The signature (line 56):

```js
export function createHarvests({ db, now = Date.now, zone = localZone, log = console.error, batchDryKg = () => ({}) }) {
```

and add to the comment above it (line 54–55) the sentence: `batchDryKg(runId): { <crop>: dry kg per block } from the run's batches (spec 2026-11-05-batches-design.md 3.2), which replaces Settings → Yield's figure for that run and crop.`

2. Right after the `prices` helper (`const prices = () => { … };`, ~line 104–107), add:

```js
  // A run's yield figures: a crop whose batches in the run all have a weight takes their dry kg per block (spec
  // 2026-11-05-batches-design.md 3.2); its price, and every other crop, as Settings → Yield.
  function yieldOf(cropYield, runId) {
    const out = { ...cropYield };
    for (const [crop, dryKg] of Object.entries(batchDryKg(runId))) out[crop] = { priceKg: cropYield[crop]?.priceKg ?? null, dryKg };
    return out;
  }
```

3. In `runView`, change `...runFigures(run, harvests, cropYield, usage),` to:

```js
      ...runFigures(run, harvests, yieldOf(cropYield, run.id), usage),
```

4. In `farmView`, change `const f = runFigures(run, db.runHarvests(run.id), cropYield, null);` to:

```js
          const f = runFigures(run, db.runHarvests(run.id), yieldOf(cropYield, run.id), null);
```

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches.test.js tests/harvests.test.js tests/api-harvest.test.js`
Expected: PASS (Harvest's own tests unchanged: without `batchDryKg` nothing differs).

- [ ] **Step 5: Commit**

```bash
git add server/harvests.js tests/batches.test.js
git commit -m "Batches 7: Harvest's BE takes a run's batches' dry kg per block when they all have a weight (contract section 7)"
```

---
### Task 8: The routes, the wiring and the events

**Files:**
- Create: `server/batches-api.js`
- Modify: `server/api.js` (imports; before `const harvests = createHarvests({ db });` at ~line 88; that line; `route()` after the `harvestRoutes` line at ~123)
- Modify: `web/live.js:6`
- Test: `tests/api-batches.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/api-batches.test.js`:

```js
// The Batches routes (spec 2026-11-05-batches-design.md 6): every route, its 400s and 404s, the query, the CSV, and the
// events the pages listen for ('batches'; 'harvest' for a placed batch's room).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createTasks } from '../server/tasks.js';
import { createEvents } from '../server/events.js';

const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };
const GOOD = { crop: 'oyster', supplier: 'Agro Supplies', blocks: 1200, pricePerBlock: 2.3 };

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const server = createApp(db, { tasks: createTasks({ db }), events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const raw = (method, path, body) => fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const call = async (method, path, body) => {
    const res = await raw(method, path, body);
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  async function room() {
    const made = await call('POST', '/api/rooms', { ...ROOM, trhAddress: 1 });
    assert.equal((await call('PUT', `/api/rooms/${made.body.id}/crop`, { crops: [{ crop: 'oyster', blocks: 950 }] })).status, 200);
    return made.body.id;
  }
  const of = (type) => seen.filter(([x]) => x === type).map(([, d]) => d);
  return { db, call, raw, room, of };
}

test('receive, list, read, edit, delete', async (t) => {
  const { call, of } = await app(t);
  const made = await call('POST', '/api/batches', GOOD);
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.equal(made.body.status, 'waiting');
  assert.deepEqual(of('batches').at(-1), { batchId: made.body.id, roomId: null, runId: null });
  const list = await call('GET', '/api/batches');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.batches.map((b) => b.id), [made.body.id]);
  assert.equal(list.body.blockCost, 2760);
  const one = await call('GET', `/api/batches/${made.body.id}`);
  assert.deepEqual(one.body.delivery.map((b) => b.id), [made.body.id]);
  const put = await call('PUT', `/api/batches/${made.body.id}`, { supplier: 'Agro Supplies Sdn Bhd' });
  assert.equal(put.body.supplier, 'Agro Supplies Sdn Bhd');
  assert.equal((await call('DELETE', `/api/batches/${made.body.id}`)).status, 204);
  assert.equal((await call('GET', `/api/batches/${made.body.id}`)).status, 404);
});

test('a bad body or query is a 400 with its field; unknown ids 404; other methods 404', async (t) => {
  const { call } = await app(t);
  const bad = await call('POST', '/api/batches', { ...GOOD, blocks: 0 });
  assert.deepEqual([bad.status, bad.body.field], [400, 'blocks']);
  for (const q of ['run=x', 'from=2026-13-01', 'to=5', 'status=gone']) {
    assert.equal((await call('GET', `/api/batches?${q}`)).status, 400, q);
  }
  assert.equal((await call('PUT', '/api/batches/99', { note: 'x' })).status, 404);
  assert.equal((await call('POST', '/api/batches/99/place', { roomId: 1 })).status, 404);
  assert.equal((await call('PUT', '/api/batch-checks/99', { lost: 1 })).status, 404);
  assert.equal((await call('PATCH', '/api/batches')).status, 404);
});

test('place, take out, checks; the events of a placed batch tell its room\'s Harvest too', async (t) => {
  const { call, room, of } = await app(t);
  const roomId = await room();
  const made = await call('POST', '/api/batches', GOOD);
  const placed = await call('POST', `/api/batches/${made.body.id}/place`, { roomId, blocks: 800 });
  assert.equal(placed.status, 201, JSON.stringify(placed.body));
  assert.equal(placed.body.parentId, made.body.id);
  assert.deepEqual(of('harvest').at(-1), { roomId });
  const byRun = await call('GET', `/api/batches?run=${placed.body.runId}`);
  assert.deepEqual(byRun.body.batches.map((b) => b.id), [placed.body.id]);
  assert.equal(byRun.body.blockCost, 1840);
  const check = await call('POST', `/api/batches/${placed.body.id}/checks`, { lost: 3, cause: 'green', worker: 'Ali' });
  assert.equal(check.status, 201, JSON.stringify(check.body));
  assert.equal((await call('PUT', `/api/batch-checks/${check.body.id}`, { lost: 4 })).body.lost, 4);
  assert.equal((await call('DELETE', `/api/batch-checks/${check.body.id}`)).status, 204);
  const noCrop = await call('POST', `/api/batches/${made.body.id}/place`, { roomId: 999 });
  assert.deepEqual([noCrop.status, noCrop.body.field], [400, 'roomId']);
  const out = await call('POST', `/api/batches/${placed.body.id}/unplace`);
  assert.equal(out.status, 200);
  assert.equal(out.body.id, made.body.id, 'folded back');
  assert.equal((await call('POST', `/api/batches/${made.body.id}/unplace`)).status, 409);
});

test('the CSV: a file with the BOM, its name from the dates', async (t) => {
  const { call, raw } = await app(t);
  await call('POST', '/api/batches', { ...GOOD, receivedAt: Date.UTC(2026, 5, 1) });
  const res = await raw('GET', '/api/batches.csv?from=2026-01-01&to=2026-12-31');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(res.headers.get('content-disposition'), /batches 2026-01-01/);
  const text = await res.text();
  assert.equal(text.charCodeAt(0), 0xfeff);
  assert.equal((await raw('GET', '/api/batches.csv?from=bad')).status, 400);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-batches.test.js`
Expected: FAIL (404s: no routes).

- [ ] **Step 3: Write `server/batches-api.js`**

```js
// The Batches routes (spec 2026-11-05-batches-design.md 6), called from api.js: GET and POST /api/batches, GET
// /api/batches.csv, GET, PUT and DELETE /api/batches/:id, POST /api/batches/:id/place, /unplace and /checks, PUT and DELETE
// /api/batch-checks/:id. server/batches.js keeps the rules; this reads the query and body and turns its errors into the API's.

import { attachment } from './tasks-api.js';

const ID = '([1-9][0-9]{0,14})';
const ONE = new RegExp(`^/api/batches/${ID}$`);
const ACTION = new RegExp(`^/api/batches/${ID}/(place|unplace|checks)$`);
const CHECK = new RegExp(`^/api/batch-checks/${ID}$`);
const BOM = '\uFEFF'; // before the CSV, so Excel on Windows reads it as UTF-8

// batches: from createBatches. → async (req, res, path, { send, readJson, HttpError, url }) that answers true when the path
// is one of its routes.
export function createBatchRoutes({ batches }) {
  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const notFound = () => new HttpError(404, 'Not found');
    const noContent = () => { res.writeHead(204); res.end(); };
    const param = (name) => url.searchParams.get(name);

    if (path === '/api/batches') {
      if (req.method === 'GET') send(res, 200, batches.list({ run: param('run'), from: param('from'), to: param('to'), status: param('status') }));
      else if (req.method === 'POST') send(res, 201, batches.receive(await readJson(req)));
      else throw notFound();
      return true;
    }
    if (path === '/api/batches.csv') {
      if (req.method !== 'GET') throw notFound();
      const { name, text } = batches.csv({ from: param('from'), to: param('to') });
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(name) });
      res.end(BOM + text);
      return true;
    }
    const one = ONE.exec(path);
    if (one) {
      const id = Number(one[1]);
      if (req.method === 'GET') send(res, 200, batches.detail(id));
      else if (req.method === 'PUT') send(res, 200, batches.edit(id, await readJson(req)));
      else if (req.method === 'DELETE') { batches.remove(id); noContent(); }
      else throw notFound();
      return true;
    }
    const action = ACTION.exec(path);
    if (action) {
      if (req.method !== 'POST') throw notFound();
      const id = Number(action[1]);
      if (action[2] === 'place') send(res, 201, batches.place(id, await readJson(req)));
      else if (action[2] === 'unplace') send(res, 200, batches.unplace(id));
      else send(res, 201, batches.addCheck(id, await readJson(req)));
      return true;
    }
    const check = CHECK.exec(path);
    if (check) {
      const id = Number(check[1]);
      if (req.method === 'PUT') send(res, 200, batches.editCheck(id, await readJson(req)));
      else if (req.method === 'DELETE') { batches.removeCheck(id); noContent(); }
      else throw notFound();
      return true;
    }
    return false;
  }

  // A 4xx from server/batches.js (BatchError) becomes the API's HttpError.
  return async function batchRoutes(req, res, path, helpers) {
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      const { HttpError } = helpers;
      if (!(err instanceof HttpError) && Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
        throw new HttpError(err.status, err.message, err.field);
      }
      throw err;
    }
  };
}
```

`POST /api/batches/:id/unplace` has no body: `readJson` is not called for it, so a request without a content type is fine.

- [ ] **Step 4: Wire it into `server/api.js` and `web/live.js`**

1. Imports, after `import { createHarvestRoutes } from './harvest-api.js';`:

```js
import { createBatches } from './batches.js';
import { createBatchRoutes } from './batches-api.js';
```

2. Right before `const harvests = createHarvests({ db });`:

```js
  // ---- Batches ---- (spec 2026-11-05-batches-design.md 3 and 6): every write tells the pages; the rooms of the placed
  // batches it touched hear 'harvest' too (their BE may change, 3.2).
  const batches = createBatches({ db });
  const batchRoutes = createBatchRoutes({ batches });
  batches.onChange(({ batchId, roomId, runId, harvestRooms }) => {
    events?.publish('batches', { batchId, roomId, runId });
    for (const id of harvestRooms) events?.publish('harvest', { roomId: id });
  });
```

3. Change `const harvests = createHarvests({ db });` to:

```js
  const harvests = createHarvests({ db, batchDryKg: batches.dryKgFor });
```

4. In `route()`, right after `if (await harvestRoutes(req, res, path, { send, readJson, HttpError, url })) return;`:

```js
    if (await batchRoutes(req, res, path, { send, readJson, HttpError, url })) return;
```

5. `web/live.js` line 6:

```js
export const EVENT_TYPES = ['room', 'alarms', 'outdoor', 'simulation', 'sizing', 'tasks', 'harvest', 'batches'];
```

If a test asserts the exact `EVENT_TYPES` list (`grep -rn "EVENT_TYPES\|'harvest'\]" tests/`), add `'batches'` there too.

- [ ] **Step 5: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-batches.test.js tests/api-harvest.test.js tests/web-live.test.js`
Expected: PASS (`tests/web-live.test.js` may not exist under that name: run the live test file that `ls tests | grep live` shows).

- [ ] **Step 6: Commit**

```bash
git add server/batches-api.js server/api.js web/live.js tests/api-batches.test.js
git commit -m "Batches 8: the routes, wired into api.js; the 'batches' event, and 'harvest' for a placed batch's room"
```

---

### Task 9: The page routes

**Files:**
- Modify: `web/route.js` (after `sheetHash` at line 69; `parseRoute`; `canonicalHash`)
- Modify: `web/app.js` (imports; the mount chain at lines 57–66)
- Test: `tests/web-route.test.js` (add)

- [ ] **Step 1: Write the failing test**

Add to the import line of `tests/web-route.test.js`: `BATCHES_HASH, batchHash, batchesRunHash, batchSheetHash`, and append:

```js
test('the Batches pages: the list (one run\'s with ?run=), a batch, the myGAP 4-2 sheet with its dates', () => {
  assert.equal(BATCHES_HASH, '#/business/batches');
  assert.deepEqual(parseRoute('#/business/batches'), { name: 'batches', run: null });
  assert.deepEqual(parseRoute('#/business/batches?run=12'), { name: 'batches', run: 12 });
  assert.deepEqual(parseRoute('#/business/batches?run=x'), { name: 'batches', run: null });
  assert.equal(isCanonical('#/business/batches?run=x'), false);
  assert.equal(batchesRunHash(12), '#/business/batches?run=12');
  assert.deepEqual(parseRoute('#/business/batches/7'), { name: 'batch', id: 7 });
  assert.equal(batchHash(7), '#/business/batches/7');
  assert.deepEqual(parseRoute('#/business/batches/sheet?from=2026-08-08&to=2026-11-05'), { name: 'batchSheet', from: '2026-08-08', to: '2026-11-05' });
  assert.deepEqual(parseRoute('#/business/batches/sheet'), { name: 'batchSheet', from: null, to: null });
  assert.deepEqual(parseRoute('#/business/batches/sheet?from=2026-13-01&to=x'), { name: 'batchSheet', from: null, to: null });
  assert.equal(batchSheetHash('2026-08-08', '2026-11-05'), '#/business/batches/sheet?from=2026-08-08&to=2026-11-05');
  for (const h of ['#/business/batches', '#/business/batches?run=12', '#/business/batches/7', '#/business/batches/sheet?from=2026-08-08&to=2026-11-05']) {
    assert.equal(isCanonical(h), true, h);
  }
  assert.deepEqual(parseRoute('#/business/batches/0'), { name: 'overview' });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-route.test.js`
Expected: FAIL (no such export).

- [ ] **Step 3: Change `web/route.js`**

After `export const sheetHash = …;` (line 69):

```js

// ---- Batches ---- (spec 2026-11-05-batches-design.md 7): the page (?run= one run's batches), a batch, and the myGAP 4-2
// sheet with its dates in the query (the page puts the last 90 days there when they are missing or not dates).
export const BATCHES_HASH = '#/business/batches';
export const batchHash = (id) => `${BATCHES_HASH}/${id}`;
export const batchesRunHash = (runId) => `${BATCHES_HASH}?run=${runId}`;
export const batchSheetHash = (from, to) => `${BATCHES_HASH}/sheet?from=${from}&to=${to}`;
function parseBatches(hash) {
  const sheet = /^#\/business\/batches\/sheet\/?(?:\?(.*))?$/.exec(hash);
  if (sheet) {
    const p = new URLSearchParams(sheet[1] ?? '');
    const [from, to] = [p.get('from'), p.get('to')].map((d) => (isDate(d) ? d : null));
    return { name: 'batchSheet', from: from && to ? from : null, to: from && to ? to : null };
  }
  const one = new RegExp(`^#/business/batches/${ID}/?$`).exec(hash);
  if (one) return { name: 'batch', id: Number(one[1]) };
  const list = /^#\/business\/batches\/?(?:\?(.*))?$/.exec(hash);
  if (!list) return null;
  const run = new URLSearchParams(list[1] ?? '').get('run');
  return { name: 'batches', run: /^[1-9][0-9]{0,14}$/.test(run ?? '') ? Number(run) : null };
}
```

In `parseRoute`, right before `// #/rooms (the Rooms list until 2026-10-28) is the Overview now…`:

```js
  const batches = parseBatches(hash ?? '');
  if (batches) return batches;
```

In `canonicalHash`, right before `return route.name === 'settings' ? …`:

```js
  if (route.name === 'batches') return route.run ? batchesRunHash(route.run) : BATCHES_HASH;
  if (route.name === 'batch') return batchHash(route.id);
  if (route.name === 'batchSheet') return route.from && route.to ? batchSheetHash(route.from, route.to) : `${BATCHES_HASH}/sheet`;
```

- [ ] **Step 4: Change `web/app.js`**

After `import * as taskSheet from './task-sheet.js';`:

```js
import * as batches from './batches-page.js';
import * as batchSheet from './batches-sheet.js';
```

In the mount chain, right before `: overview.mount(view, {});`:

```js
    : route.name === 'batches' ? batches.mount(view, { run: route.run })
    : route.name === 'batch' ? batches.mountBatch(view, { id: route.id })
    : route.name === 'batchSheet' ? batchSheet.mountSheet(view, { from: route.from, to: route.to })
```

(`web/batches-page.js` and `web/batches-sheet.js` come in Tasks 12 and 13; until then the app does not load in a browser, the tests do not import `app.js`.)

- [ ] **Step 5: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-route.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/route.js web/app.js tests/web-route.test.js
git commit -m "Batches 9: the page routes #/business/batches, a batch, and the 4-2 sheet"
```

---
### Task 10: The web's pure parts (`web/batches-math.js`)

**Files:**
- Create: `web/batches-math.js`
- Test: `tests/web-batches-math.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/web-batches-math.test.js`:

```js
// The Batches pages' pure parts (spec 2026-11-05-batches-design.md 7).

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rmText, blocksText, kgText, waterText, dateText, agoText, goodText, countBlocks, weightText, pageGroups, pastIn, pastCells,
  detailFacts, overNote, batchLineFor, sheetRows, SHEET_COLUMNS, receiveBody, receiveValues, placeBody, roomChoices, checkBody,
  checkLine, statusLine,
} from '../web/batches-math.js';

const nb = ' ';
const dot = `${nb}· `;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const b = (o) => ({ id: 1, parentId: null, kind: 'bought', crop: 'oyster', supplier: 'Agro Supplies', receivedAt: NOW - 2 * DAY, blocks: 1200,
  lost: 0, good: 1200, pricePerBlock: 2.3, spawnBatch: '0912', strain: null, deliveryRef: null, inoculatedAt: null, blockKg: null,
  waterPct: null, dryKg: null, runId: null, roomId: null, roomName: null, runStartedAt: null, runEndedAt: null, runBlocks: null,
  placedAt: null, note: null, status: 'waiting', ...o });

test('the formatter', () => {
  assert.equal(rmText(2185), `RM${nb}2,185.00`);
  assert.equal(rmText(null), '—');
  assert.equal(blocksText(1200), `1,200${nb}blocks`);
  assert.equal(blocksText(1), `1${nb}block`);
  assert.equal(kgText(2.3), `2.30${nb}kg`);
  assert.equal(waterText(60), `60${nb}%`);
  assert.equal(dateText(NOW, '2026-11-05'), '5 Nov');
  assert.equal(dateText(Date.UTC(2025, 0, 3, 4), '2026-11-05'), '3 Jan 2025');
  assert.equal(agoText(NOW, NOW), 'today');
  assert.equal(agoText(NOW - DAY, NOW), 'yesterday');
  assert.equal(agoText(NOW - 12 * DAY, NOW), '12 days ago');
  assert.equal(goodText(b({})), `1,200${nb}blocks`);
  assert.equal(goodText(b({ lost: 20, good: 1180 })), '1,180 of 1,200 good');
  assert.equal(countBlocks(1200, 'oyster'), '1,200 Grey oyster blocks');
  assert.equal(countBlocks(1, 'pink'), '1 Pink oyster block');
  assert.equal(weightText(b({ blockKg: 2.3, waterPct: 60, dryKg: 0.92 })), `2.30${nb}kg${dot}60${nb}% water${dot}0.92${nb}kg dry`);
  assert.equal(weightText(b({})), null);
});

test('the page\'s groups: waiting, in rooms by run with the over-count note, past', () => {
  const run = { runId: 4, roomId: 2, roomName: 'Container 1', runStartedAt: NOW - 5 * DAY, runBlocks: 950, status: 'placed' };
  const list = [
    b({ id: 1 }),
    b({ id: 2, ...run, blocks: 800 }),
    b({ id: 3, ...run, blocks: 400 }),
    b({ id: 4, runId: 3, roomName: 'Container 2', runEndedAt: NOW - DAY, status: 'past' }),
  ];
  const g = pageGroups(list);
  assert.deepEqual(g.waiting.map((x) => x.id), [1]);
  assert.equal(g.rooms.length, 1);
  assert.deepEqual(g.rooms[0].batches.map((x) => x.id), [2, 3]);
  assert.deepEqual(g.rooms[0].over, ['Batches hold 1,200 Grey oyster blocks; the run has 950.']);
  assert.deepEqual(g.past.map((x) => x.id), [4]);
  assert.deepEqual(pastIn([b({ receivedAt: NOW - 100 * DAY }), b({ receivedAt: NOW - 10 * DAY })], 90, NOW).length, 1);
  assert.equal(pastIn([b({ receivedAt: NOW - 400 * DAY })], null, NOW).length, 1);
  assert.deepEqual(pastCells(b({ ...run, lost: 3 }), '2026-11-05'),
    ['3 Nov', 'Grey oyster', 'Agro Supplies', '0912', '1,200', '3', `RM${nb}2.30`, `Container 1${dot}run of 31 Oct`]);
});

test('a batch: its facts, the over-count note, its status line, a check\'s line', () => {
  const one = b({ strain: 'PL-27', blockKg: 2.3, waterPct: 60, dryKg: 0.92, delivery: [b({ blocks: 800 }), b({ id: 2, parentId: 1, blocks: 400 })] });
  assert.deepEqual(detailFacts(one), [
    ['Spawn batch', '0912'], ['Strain', 'PL-27'], ['Block weight', `2.30${nb}kg${dot}60${nb}% water${dot}0.92${nb}kg dry`],
    ['Price per block', `RM${nb}2.30`], ['Delivery', `1,200${nb}blocks${dot}RM${nb}2,760.00`],
  ]);
  assert.equal(overNote(b({ status: 'placed', runBlocks: 950, batchBlocks: 1200 })), 'Batches hold 1,200 Grey oyster blocks; the run has 950.');
  assert.equal(overNote(b({ status: 'placed', runBlocks: 950, batchBlocks: 950 })), null);
  assert.equal(statusLine(b({})), 'Waiting');
  assert.equal(statusLine(b({ status: 'placed', roomName: 'Container 1' })), 'In Container 1');
  assert.equal(statusLine(b({ status: 'past', roomName: 'Container 1' })), `Past${dot}Container 1`);
  assert.equal(checkLine({ at: NOW, lost: 20, cause: 'green', worker: 'Ali' }, '2026-11-05'), `5 Nov 12:00${dot}20${nb}blocks lost${dot}Green mould${dot}Ali`);
});

test('batchLineFor: null without batches; one batch; several', () => {
  const run = { id: 4 };
  assert.equal(batchLineFor(run, { batches: [], blockCost: 0 }), null);
  assert.equal(batchLineFor(null, { batches: [b({})] }), null);
  assert.deepEqual(batchLineFor(run, { batches: [b({ id: 7, blocks: 950 })], blockCost: 2185 }),
    { text: `Blocks${dot}Agro Supplies${dot}spawn batch 0912${dot}950${nb}blocks${dot}RM${nb}2,185.00`, href: '#/business/batches/7' });
  assert.deepEqual(batchLineFor(run, { batches: [b({ id: 7, blocks: 800 }), b({ id: 8, blocks: 400, pricePerBlock: null })], blockCost: null }),
    { text: `Blocks${dot}2 batches${dot}1,200${nb}blocks`, href: '#/business/batches?run=4' });
});

test('the myGAP 4-2 sheet: a receipt row per delivery and a use row per placement in the dates, by date', () => {
  assert.equal(SHEET_COLUMNS.length, 10);
  const first = b({ id: 1, blocks: 400, strain: 'PL-27', receivedAt: Date.UTC(2026, 10, 2, 4) });
  const part = b({ id: 2, parentId: 1, blocks: 800, placedAt: Date.UTC(2026, 10, 3, 4), runId: 4, roomName: 'Container 1', runStartedAt: Date.UTC(2026, 9, 3, 4) });
  const old = b({ id: 3, receivedAt: Date.UTC(2026, 6, 1, 4), pricePerBlock: null, supplier: 'Old' });
  const rows = sheetRows([part, first, old], { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(rows, [
    ['2 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, `1,200${nb}blocks`, `RM${nb}2.30`, '', '', '', '', '', 'Agro Supplies'],
    ['3 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, '', '', `800${nb}blocks`, `Container 1${dot}run of 3 Oct`, '', '', '', ''],
  ]);
  assert.equal(sheetRows([old], { from: '2026-07-01', to: '2026-07-01' })[0][3], '', 'an unknown price: blank to write in');
});

test('the dialogs\' bodies', () => {
  const v = { crop: 'oyster', supplier: 'Agro', receivedDate: '2026-11-03', blocks: '1,200', pricePerBlock: '2.30', spawnBatch: '0912',
    strain: '', deliveryRef: '', inoculatedDate: '', blockKg: '', waterPct: '60', note: '' };
  const r = receiveBody(v);
  assert.deepEqual(r.body, { crop: 'oyster', supplier: 'Agro', receivedAt: Date.UTC(2026, 10, 2, 16), blocks: 1200, pricePerBlock: 2.3,
    spawnBatch: '0912', strain: '', deliveryRef: '', note: '', inoculatedAt: null, blockKg: null, waterPct: null });
  assert.equal(receiveBody({ ...v, blockKg: '2.3' }).body.waterPct, 60, 'water counts only with a weight');
  assert.deepEqual(receiveBody({ ...v, blocks: '12.5' }).field, 'blocks');
  assert.deepEqual(receiveBody({ ...v, pricePerBlock: 'two' }).field, 'pricePerBlock');
  assert.deepEqual(receiveBody({ ...v, receivedDate: '' }).field, 'receivedDate');
  const edit = receiveBody(v, { edit: { cropEditable: false, blocksEditable: false } }).body;
  assert.equal('crop' in edit || 'blocks' in edit, false);
  assert.equal(receiveValues(null).waterPct, '60');
  assert.equal(receiveValues(b({ pricePerBlock: 2.3, blockKg: 2.3, waterPct: 60 })).pricePerBlock, '2.3');
  assert.deepEqual(placeBody({ roomId: '3', blocks: '' }, 1200).body, { roomId: 3, blocks: 1200 });
  assert.equal(placeBody({ roomId: '', blocks: '' }, 1200).field, 'roomId');
  const rooms = [
    { id: 1, name: 'Room 1', crop: { crops: [] } },
    { id: 2, name: 'Container 1', crop: { crops: [{ crop: 'oyster', blocks: 950 }] } },
    { id: 3, name: 'Container 2', crop: { crops: [{ crop: 'pink', blocks: 600 }] } },
  ];
  assert.deepEqual(roomChoices(rooms, 'oyster'), { ok: [[2, 'Container 1']], off: ['Room 1 (no crops)', 'Container 2 (no Grey oyster)'] });
  const c = checkBody({ checkDate: '2026-11-05', checkTime: '8:12', lost: '20', cause: 'green', worker: 'Ali', note: '' });
  assert.deepEqual(c.body, { at: Date.UTC(2026, 10, 5, 0, 12), lost: 20, cause: 'green', worker: 'Ali', note: '' });
  assert.equal(checkBody({ checkDate: '2026-11-05', checkTime: '25:00', lost: '1', cause: 'green', worker: 'Ali' }).field, 'checkTime');
  assert.equal('worker' in checkBody({ checkDate: '2026-11-05', checkTime: '08:00', lost: '1', cause: 'green', worker: '' }, { edit: true }).body, false);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-batches-math.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `web/batches-math.js`**

```js
// The Batches pages' pure parts (spec 2026-11-05-batches-design.md 7): the one formatter (RM, blocks, kg, water, dates),
// the page's groups and rows, a batch's facts and lines, batchLineFor (the Harvest tab's line, wired by the integrator), the
// myGAP 4-2 sheet's rows, and the dialogs' bodies. A missing figure is a dash; a number keeps its unit at a wrap (a
// no-break space, as the Units Rule has it) and a '·' joins with DOT.

import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';
import { farmDate, farmTime, dayMonth, daysFrom } from './tasks-math.js';
import { whenMs } from './harvest-math.js';
import { batchHash, batchesRunHash } from './route.js';

const NB = ' ';
const DASH = '—';
const DAY_MS = 86_400_000;
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// ---- the formatter ----

export const rmText = (v) => (finite(v) ? `RM${NB}${grouped(v, 2)}` : DASH);
export const blocksText = (n) => (finite(n) ? `${grouped(n, 0)}${NB}${n === 1 ? 'block' : 'blocks'}` : DASH);
export const kgText = (v) => (finite(v) ? `${grouped(v, 2)}${NB}kg` : DASH);
export const waterText = (v) => (finite(v) ? `${grouped(v, 0)}${NB}%` : DASH);
// "3 Nov", with the year when it is not this one (today: the farm's date).
export function dateText(ms, today) {
  if (!finite(ms)) return DASH;
  const d = farmDate(ms);
  return d.slice(0, 4) === String(today).slice(0, 4) ? dayMonth(d) : `${dayMonth(d)} ${d.slice(0, 4)}`;
}
export const fullDate = (ms) => (finite(ms) ? `${dayMonth(farmDate(ms))} ${farmDate(ms).slice(0, 4)}` : DASH);
export function agoText(ms, nowMs) {
  const n = daysFrom(farmDate(ms), farmDate(nowMs));
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
}
export const goodText = (b) => (b.lost > 0 ? `${grouped(b.good, 0)} of ${grouped(b.blocks, 0)} good` : blocksText(b.blocks));
export const cropBlocks = (crop) => `${cropShortName(crop)} blocks`;
// "1,200 Grey oyster blocks", "1 Pink oyster block".
export const countBlocks = (n, crop) => `${grouped(n, 0)} ${cropShortName(crop)} ${n === 1 ? 'block' : 'blocks'}`;
export function weightText(b) {
  if (!finite(b.blockKg)) return null;
  return [kgText(b.blockKg), `${waterText(b.waterPct)} water`, `${kgText(b.dryKg)} dry`].join(DOT);
}
export const CAUSE_NAMES = { green: 'Green mould', black: 'Black mould', bacterial: 'Bacterial / wet spot', pests: 'Pests', other: 'Other' };
export const roomRunText = (b) => (b.roomName && finite(b.runStartedAt) ? `${b.roomName}${DOT}run of ${dayMonth(farmDate(b.runStartedAt))}`
  : finite(b.placedAt) ? 'a deleted room' : DASH);

// ---- the Batches page ----

// The words under a waiting batch's name and a placed one's.
export const waitingLine = (b, nowMs) => [b.supplier, `Received ${dateText(b.receivedAt, farmDate(nowMs))}${DOT}${agoText(b.receivedAt, nowMs)}`].filter(Boolean).join(DOT);
export const placedLine = (b, today) => [b.supplier, b.spawnBatch ? `spawn batch ${b.spawnBatch}` : null, `received ${dateText(b.receivedAt, today)}`].filter(Boolean).join(DOT);

// The notes of a run whose batches of a crop hold more blocks than the run has (spec 3: allowed, said in amber).
export function overNotes(list) {
  const byCrop = new Map();
  for (const b of list) {
    const x = byCrop.get(b.crop) ?? { blocks: 0, runBlocks: b.runBlocks };
    x.blocks += b.blocks;
    byCrop.set(b.crop, x);
  }
  return [...byCrop].filter(([, x]) => finite(x.runBlocks) && x.blocks > x.runBlocks)
    .map(([crop, x]) => `Batches hold ${countBlocks(x.blocks, crop)}; the run has ${grouped(x.runBlocks, 0)}.`);
}

// { waiting, rooms: [{ runId, roomId, roomName, runStartedAt, batches, over }] by room name, past } of the list reply.
export function pageGroups(batches) {
  const runs = new Map();
  for (const b of batches.filter((x) => x.status === 'placed')) {
    if (!runs.has(b.runId)) runs.set(b.runId, { runId: b.runId, roomId: b.roomId, roomName: b.roomName, runStartedAt: b.runStartedAt, batches: [] });
    runs.get(b.runId).batches.push(b);
  }
  const rooms = [...runs.values()].sort((a, b) => String(a.roomName).localeCompare(String(b.roomName))).map((r) => ({ ...r, over: overNotes(r.batches) }));
  return { waiting: batches.filter((x) => x.status === 'waiting'), rooms, past: batches.filter((x) => x.status === 'past') };
}

export const PAST_RANGES = [[90, '90 days'], [365, '12 months'], [null, 'All']];
// The past batches received in the last `days` days (null: all).
export function pastIn(past, days, nowMs) {
  if (days === null) return past;
  const from = farmDate(nowMs - (days - 1) * DAY_MS);
  return past.filter((b) => farmDate(b.receivedAt) >= from);
}
export const PAST_COLUMNS = ['Received', 'Crop', 'Supplier', 'Spawn batch', 'Blocks', 'Lost', 'RM per block', 'Room · run'];
export const pastCells = (b, today) => [dateText(b.receivedAt, today), cropShortName(b.crop), b.supplier ?? DASH, b.spawnBatch ?? DASH,
  grouped(b.blocks, 0), grouped(b.lost, 0), rmText(b.pricePerBlock), roomRunText(b)];

// ---- a batch ----

// The Details card's rows [label, value], the empty ones left out (detail: GET /api/batches/:id).
export function detailFacts(b) {
  const total = (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);
  return [
    ['Spawn batch', b.spawnBatch], ['Strain', b.strain], ['Delivery note', b.deliveryRef],
    ['Inoculated', finite(b.inoculatedAt) ? fullDate(b.inoculatedAt) : null], ['Block weight', weightText(b)],
    ['Price per block', finite(b.pricePerBlock) ? rmText(b.pricePerBlock) : null],
    ['Delivery', finite(b.pricePerBlock) ? `${blocksText(total)}${DOT}${rmText(total * b.pricePerBlock)}` : blocksText(total)],
    ['Note', b.note],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
}
export const overNote = (b) => (b.status === 'placed' && finite(b.runBlocks) && finite(b.batchBlocks) && b.batchBlocks > b.runBlocks
  ? `Batches hold ${countBlocks(b.batchBlocks, b.crop)}; the run has ${grouped(b.runBlocks, 0)}.` : null);
export const statusLine = (b) => (b.status === 'waiting' ? 'Waiting' : b.status === 'placed' ? `In ${b.roomName}` : `Past${DOT}${b.roomName ?? 'a deleted room'}`);
export const checkLine = (c, today) => [`${dateText(c.at, today)} ${farmTime(c.at)}`, `${blocksText(c.lost)} lost`, CAUSE_NAMES[c.cause] ?? c.cause, c.worker]
  .filter(Boolean).join(DOT);
export const deliveryLine = (x) => `${blocksText(x.blocks)}${DOT}${x.status === 'waiting' ? 'Waiting' : x.roomName ?? 'a deleted room'}`;

// ---- the Harvest tab's line (contract section 4; the integrator wires it into harvest-card.js) ----

// run: the Harvest tab's run ({ id }); reply: GET /api/batches?run=<run.id>. → { text, href } or null without batches.
export function batchLineFor(run, reply) {
  const list = Array.isArray(reply?.batches) ? reply.batches : [];
  if (!run || !list.length) return null;
  const cost = finite(reply.blockCost) ? rmText(reply.blockCost) : null;
  if (list.length === 1) {
    const [b] = list;
    return { text: ['Blocks', b.supplier, b.spawnBatch ? `spawn batch ${b.spawnBatch}` : null, blocksText(b.blocks), cost].filter(Boolean).join(DOT), href: batchHash(b.id) };
  }
  const blocks = list.reduce((s, b) => s + b.blocks, 0);
  return { text: ['Blocks', `${list.length} batches`, blocksText(blocks), cost].filter(Boolean).join(DOT), href: batchesRunHash(run.id) };
}

// ---- the myGAP 4-2 sheet ----

export const SHEET_TITLE = 'myGAP 4-2 · Purchase, use and treatment of planting material (Pembelian, penggunaan dan rawatan bahan tanaman)';
export const SHEET_COLUMNS = ['Date', 'Variety / material (+ batch No.)', 'Qty bought', 'Price / unit', 'Qty used', 'Block / area',
  'Treatment: why', 'Treatment: material', 'Treatment: rate', 'Supplier / operator'];
export const materialText = (b) => [cropBlocks(b.crop), b.strain, b.spawnBatch ? `batch ${b.spawnBatch}` : null].filter(Boolean).join(DOT);

// The sheet's rows from every batch (GET /api/batches): a receipt row per delivery received in [from, to] (its blocks, the
// first row's and its parts') and a use row per row put into a room in [from, to], by date (a receipt before its uses).
export function sheetRows(batches, { from, to }) {
  const families = new Map();
  for (const b of batches) families.set(b.parentId ?? b.id, [...(families.get(b.parentId ?? b.id) ?? []), b]);
  const rows = [];
  const inRange = (d) => d >= from && d <= to;
  for (const [firstId, family] of families) {
    const first = family.find((b) => b.id === firstId) ?? family[0];
    const received = farmDate(first.receivedAt);
    if (inRange(received)) {
      const total = family.reduce((s, b) => s + b.blocks, 0);
      rows.push({ date: received, order: 0, id: firstId,
        cells: [fullDate(first.receivedAt), materialText(first), blocksText(total), finite(first.pricePerBlock) ? rmText(first.pricePerBlock) : '', '', '', '', '', '', first.supplier ?? ''] });
    }
    for (const b of family) {
      if (!finite(b.placedAt) || !inRange(farmDate(b.placedAt))) continue;
      rows.push({ date: farmDate(b.placedAt), order: 1, id: b.id,
        cells: [fullDate(b.placedAt), materialText(first), '', '', blocksText(b.blocks), roomRunText(b), '', '', '', ''] });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.id - b.id).map((r) => r.cells);
}

// ---- the dialogs' bodies (the boxes' own checks; the server checks again) ----

// A typed number: '' is null, a plain decimal its value (thousands commas allowed), anything else NaN.
export function numberOf(text) {
  const s = String(text ?? '').trim().replace(/,/g, '');
  if (s === '') return null;
  return /^[0-9]+(\.[0-9]+)?$/.test(s) ? Number(s) : NaN;
}
const dayMs = (date) => whenMs(date, '00:00'); // the farm's midnight of a date box's day

// A batch's boxes for Edit; null: Receive's (the water box filled with 60 %).
export function receiveValues(b) {
  const day = (ms) => (finite(ms) ? farmDate(ms) : '');
  const text = (v) => (v === null || v === undefined ? '' : String(v));
  if (!b) {
    return { crop: '', supplier: '', receivedDate: farmDate(Date.now()), blocks: '', pricePerBlock: '', spawnBatch: '', strain: '',
      inoculatedDate: '', blockKg: '', waterPct: '60', deliveryRef: '', note: '' };
  }
  return { crop: b.crop, supplier: text(b.supplier), receivedDate: day(b.receivedAt), blocks: String(b.blocks), pricePerBlock: text(b.pricePerBlock),
    spawnBatch: text(b.spawnBatch), strain: text(b.strain), inoculatedDate: day(b.inoculatedAt), blockKg: text(b.blockKg),
    waterPct: finite(b.waterPct) ? String(b.waterPct) : '60', deliveryRef: text(b.deliveryRef), note: text(b.note) };
}

// Receive's and Edit's boxes → { body } or { field, message }. edit: { cropEditable, blocksEditable } (those boxes are not
// shown otherwise, and not sent). The water % counts only with a block weight.
export function receiveBody(v, { edit = null } = {}) {
  const body = {};
  if (!edit || edit.cropEditable) body.crop = v.crop;
  body.supplier = v.supplier ?? '';
  body.receivedAt = dayMs(v.receivedDate);
  if (!finite(body.receivedAt)) return { field: 'receivedDate', message: 'Pick the day received' };
  if (!edit || edit.blocksEditable) {
    const n = numberOf(v.blocks);
    if (!Number.isInteger(n)) return { field: 'blocks', message: 'Give the blocks as a whole number' };
    body.blocks = n;
  }
  const price = numberOf(v.pricePerBlock);
  if (Number.isNaN(price)) return { field: 'pricePerBlock', message: 'Give the price as a number, like 2.30, or leave it empty' };
  body.pricePerBlock = price;
  for (const k of ['spawnBatch', 'strain', 'deliveryRef', 'note']) body[k] = v[k] ?? '';
  body.inoculatedAt = v.inoculatedDate ? dayMs(v.inoculatedDate) : null;
  if (Number.isNaN(body.inoculatedAt)) return { field: 'inoculatedDate', message: 'Pick the day inoculated, or leave it empty' };
  const kg = numberOf(v.blockKg);
  if (Number.isNaN(kg)) return { field: 'blockKg', message: 'Give the weight as a number, like 2.3, or leave it empty' };
  const water = kg === null ? null : numberOf(v.waterPct);
  if (Number.isNaN(water)) return { field: 'waterPct', message: 'Give the water as a number, like 60' };
  body.blockKg = kg;
  body.waterPct = water;
  return { body };
}

// Put into a room's boxes → { body } or { field, message }; an empty blocks box is all the good blocks.
export function placeBody(v, good) {
  if (!v.roomId) return { field: 'roomId', message: 'Pick a room' };
  const n = numberOf(v.blocks);
  if (n !== null && !Number.isInteger(n)) return { field: 'blocks', message: 'Give the blocks as a whole number' };
  return { body: { roomId: Number(v.roomId), blocks: n ?? good } };
}

// The rooms (GET /api/rooms) a batch of `crop` can go into (their run has the crop) and why the others cannot.
export function roomChoices(rooms, crop) {
  const ok = [];
  const off = [];
  for (const r of rooms) {
    const crops = Array.isArray(r.crop?.crops) ? r.crop.crops : [];
    if (crops.some((c) => c.crop === crop)) ok.push([r.id, r.name]);
    else off.push(`${r.name} (${crops.length ? `no ${cropShortName(crop)}` : 'no crops'})`);
  }
  return { ok, off };
}

// Record or Edit a check's boxes → { body } or { field, message }; an Edit with no name picked keeps the stored one.
export function checkBody(v, { edit = false } = {}) {
  const at = whenMs(v.checkDate, v.checkTime);
  if (!finite(at)) return /^\d{4}-\d{2}-\d{2}$/.test(String(v.checkDate ?? '')) ? { field: 'checkTime', message: 'Give the time as 24 h, like 08:12' } : { field: 'checkDate', message: 'Pick the day' };
  const lost = numberOf(v.lost);
  if (!Number.isInteger(lost)) return { field: 'lost', message: 'Give the blocks lost as a whole number' };
  const body = { at, lost, cause: v.cause, note: v.note ?? '' };
  if (v.worker || !edit) body.worker = v.worker ?? '';
  return { body };
}
```

Note on `receiveBody`'s expected body in the test: it lists `inoculatedAt`, `blockKg`, `waterPct` after `note` — `deepEqual` ignores key order, so the order in the code does not matter.

- [ ] **Step 4: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-batches-math.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/batches-math.js tests/web-batches-math.test.js
git commit -m "Batches 10: the web's pure parts (the formatter, the page's groups, batchLineFor, the 4-2 sheet rows, the dialogs' bodies)"
```

---
### Task 11: The dialogs (`web/batches-dialogs.js`)

**Files:**
- Create: `web/batches-dialogs.js`

DOM code: its pure parts are tested in Task 10; it is seen working in Task 15's browser check and the UI/UX audit.

- [ ] **Step 1: Write `web/batches-dialogs.js`**

```js
// The Batches dialogs (spec 2026-11-05-batches-design.md 7): Receive blocks and Edit, Put into a room, Take out, Delete, and
// Record or Edit a contamination check (with its Delete). They use the tasks' dialog (openForm) and worker picker; after a
// change, or a 404 or 409 (gone, or changed meanwhile), the page reads again.

import { request } from './api.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { openForm, loadWorkers, workerField, errorText, setWorker } from './task-dialogs.js';
import { dateHint, whenBoxes } from './harvest-math.js';
import { farmDate } from './tasks-math.js';
import {
  receiveBody, receiveValues, placeBody, roomChoices, checkBody, CAUSE_NAMES, blocksText, countBlocks, fullDate,
} from './batches-math.js';

const COMMAND_TIMEOUT = 15000;
// The server's field → the dialog's box (a time is typed in date and time boxes).
const BOXES = { receivedAt: 'receivedDate', inoculatedAt: 'inoculatedDate', at: 'checkDate' };

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// onChanged(): read the page again. onError(text): a failure the page shows (a dialog closed before its answer came).
export function createBatchDialogs({ onChanged, onError }) {
  // A command. → true, or the problem for the dialog to show (on its box when the server named one it has).
  async function send(method, path, body) {
    try {
      await request(method, path, body, COMMAND_TIMEOUT);
      onChanged();
      return true;
    } catch (err) {
      if (err.status === 404 || err.status === 409) onChanged();
      if (err.status === 400 && err.field === 'worker') window.dispatchEvent(new CustomEvent('farm:worker')); // renamed or removed
      return err.status === 400 && err.field ? { field: BOXES[err.field] ?? err.field, message: err.message } : { message: errorText(err) };
    }
  }
  const ask = (options) => openForm({ ...options, onLost: onError });
  const today = () => farmDate(Date.now());

  // Receive's and Edit's boxes, in four groups.
  function receiveFields(v, { cropEditable = true, blocksEditable = true } = {}) {
    return [
      {
        kind: 'group', legend: 'The blocks', className: 'bt-group', fields: [
          ...(cropEditable ? [{ name: 'crop', label: 'Crop', kind: 'select', value: v.crop, options: [['', 'Pick a crop'], ...CROP_KEYS.map((k) => [k, cropShortName(k)])] }] : []),
          { name: 'supplier', label: 'Supplier', kind: 'text', value: v.supplier, maxLength: 80 },
          { name: 'receivedDate', label: 'Received', kind: 'date', value: v.receivedDate, max: today(), hintOf: dateHint },
          ...(blocksEditable ? [{ name: 'blocks', label: 'Blocks', kind: 'number', value: v.blocks, inputMode: 'numeric', suffix: 'blocks' }] : []),
          { name: 'pricePerBlock', label: 'Price per block (RM)', kind: 'number', value: v.pricePerBlock, hint: 'Leave it empty if the bill has not come.' },
        ],
      },
      {
        kind: 'group', legend: 'Spawn', className: 'bt-group', fields: [
          { name: 'spawnBatch', label: 'Spawn batch No.', kind: 'text', value: v.spawnBatch, maxLength: 80 },
          { name: 'strain', label: 'Strain', kind: 'text', value: v.strain, maxLength: 80 },
          { name: 'inoculatedDate', label: 'Inoculated', kind: 'date', value: v.inoculatedDate, max: today(), hintOf: dateHint },
        ],
      },
      {
        kind: 'group', legend: 'Weight', className: 'bt-group', hint: "With a weight, the Harvest tab's BE uses this batch's dry substrate.", fields: [
          { name: 'blockKg', label: 'Block weight', kind: 'number', value: v.blockKg, suffix: 'kg' },
          { name: 'waterPct', label: 'Water', kind: 'number', value: v.waterPct, suffix: '%' },
        ],
      },
      {
        kind: 'group', legend: 'Paperwork', className: 'bt-group', fields: [
          { name: 'deliveryRef', label: 'Delivery note No.', kind: 'text', value: v.deliveryRef, maxLength: 80 },
          { name: 'note', label: 'Note', kind: 'area', value: v.note },
        ],
      },
    ];
  }

  function receive() {
    ask({
      title: 'Receive blocks',
      lead: ['Blocks bought ready to fruit. Put them into a room once they are in it.'],
      fields: receiveFields(receiveValues(null)),
      buttons: [{ value: 'save', label: 'Receive', primary: true }],
      submit: async (v) => {
        const r = receiveBody(v);
        return r.body ? send('POST', '/api/batches', r.body) : r;
      },
    });
  }

  // b: the batch's detail (GET /api/batches/:id).
  function edit(b) {
    const can = {
      cropEditable: b.delivery.every((x) => x.placedAt === null),
      blocksEditable: b.parentId === null && b.delivery.length === 1 && b.placedAt === null,
    };
    const lead = [];
    if (b.delivery.length > 1) lead.push('The supplier, spawn, price and weight change on every part of this delivery.');
    ask({
      title: `Edit ${countBlocks(b.blocks, b.crop)}`,
      lead,
      fields: receiveFields(receiveValues(b), can),
      buttons: [{ value: 'save', label: 'Save', primary: true }],
      submit: async (v) => {
        const r = receiveBody(v, { edit: can });
        return r.body ? send('PUT', `/api/batches/${b.id}`, r.body) : r;
      },
    });
  }

  // b: a waiting batch (a list row or the detail).
  async function place(b) {
    let rooms;
    try {
      rooms = await request('GET', '/api/rooms');
    } catch (err) {
      onError(errorText(err));
      return;
    }
    const { ok, off } = roomChoices(Array.isArray(rooms) ? rooms : [], b.crop);
    const lead = [`${countBlocks(b.good, b.crop)} to put in${b.supplier ? `, from ${b.supplier}` : ''}.`];
    if (!ok.length) lead.push(`No room has ${cropShortName(b.crop)} in its run: give a room its crops on the Crop tab first.`);
    ask({
      title: 'Put into a room',
      lead,
      fields: ok.length ? [
        {
          name: 'roomId', label: 'Room', kind: 'select', value: ok.length === 1 ? String(ok[0][0]) : '',
          options: [['', 'Pick a room'], ...ok.map(([id, name]) => [String(id), name])], hint: off.length ? `Not offered: ${off.join(', ')}.` : undefined,
        },
        { name: 'blocks', label: 'Blocks', kind: 'number', value: String(b.good), inputMode: 'numeric', suffix: 'blocks', hint: `Fewer than ${blocksText(b.good)} splits the batch: the rest waits.` },
      ] : [],
      buttons: ok.length ? [{ value: 'place', label: 'Put in', primary: true }] : [],
      submit: async (v) => {
        const r = placeBody(v, b.good);
        return r.body ? send('POST', `/api/batches/${b.id}/place`, r.body) : r;
      },
    });
  }

  // b: a placed batch's detail.
  function takeOut(b) {
    const first = b.delivery.find((x) => x.parentId === null);
    const folds = b.parentId !== null && first?.placedAt === null;
    ask({
      title: `Take ${countBlocks(b.blocks, b.crop)} out of ${b.roomName}?`,
      lead: [folds ? "They go back to the delivery's waiting blocks." : 'The batch waits again, to be put into a room.'],
      buttons: [{ value: 'out', label: 'Take out', primary: true }],
      submit: () => send('POST', `/api/batches/${b.id}/unplace`),
    });
  }

  // onGone(): after the delete (the page goes back to the list).
  function remove(b, onGone) {
    ask({
      title: `Delete ${countBlocks(b.blocks, b.crop)}${b.supplier ? ` from ${b.supplier}` : ''}?`,
      lead: [`Received ${fullDate(b.receivedAt)}. Its contamination checks go with it.`],
      buttons: [{ value: 'delete', label: 'Delete', danger: true }],
      submit: async () => {
        try {
          await request('DELETE', `/api/batches/${b.id}`, undefined, COMMAND_TIMEOUT);
          onGone();
          return true;
        } catch (err) {
          if (err.status === 404) { onGone(); return true; }
          return { message: errorText(err) };
        }
      },
    });
  }

  // Record a check on b (c null) or edit c.
  async function check(b, c = null) {
    let names;
    try {
      names = await loadWorkers();
    } catch (err) {
      onError(errorText(err));
      return;
    }
    const shown = whenBoxes(c?.at ?? Date.now());
    const max = b.good + (c?.lost ?? 0);
    const lead = [`${countBlocks(b.blocks, b.crop)}${b.roomName ? ` in ${b.roomName}` : ''}: ${blocksText(b.good)} good now.`];
    if (!names.length) {
      const p = el('p', 'tk-lead');
      const a = el('a', '', 'Settings');
      a.href = '#/settings';
      p.append("No names yet: add the workers' names in ", a, ' first.');
      lead.push(p);
    }
    const who = workerField(names, 'Who checked');
    if (c) who.value = names.includes(c.worker) ? c.worker : '';
    ask({
      title: c ? 'Edit the check' : 'Record a check',
      lead,
      fields: [
        {
          kind: 'group', className: 'tk-when', fields: [
            { name: 'checkDate', label: 'Date', kind: 'date', value: shown.date, min: farmDate(b.receivedAt), max: today(), hintOf: dateHint },
            { name: 'checkTime', label: 'Time', kind: 'text', value: shown.time, placeholder: '08:12', inputMode: 'decimal', maxLength: 5, hint: '24 h, like 08:12' },
          ],
        },
        { name: 'lost', label: 'Blocks lost', kind: 'number', value: c ? String(c.lost) : '', inputMode: 'numeric', suffix: 'blocks', hint: `Up to ${blocksText(max)}` },
        { name: 'cause', label: 'Cause', kind: 'select', value: c?.cause ?? '', options: [['', 'Pick a cause'], ...Object.entries(CAUSE_NAMES)] },
        who,
        { name: 'note', label: 'Note', kind: 'area', value: c?.note ?? '' },
      ],
      buttons: [
        ...(c ? [{ label: 'Delete this check', action: () => removeCheck(c) }] : []),
        { value: 'save', label: c ? 'Save' : 'Record', primary: true },
      ],
      submit: async (v) => {
        const r = checkBody(v, { edit: Boolean(c) });
        if (!r.body) return r;
        if (r.body.worker) setWorker(r.body.worker); // the next dialog picks the same name
        return c ? send('PUT', `/api/batch-checks/${c.id}`, r.body) : send('POST', `/api/batches/${b.id}/checks`, r.body);
      },
    });
  }

  function removeCheck(c) {
    ask({
      title: `Delete the check of ${fullDate(c.at)}?`,
      lead: [`${blocksText(c.lost)} lost to ${(CAUSE_NAMES[c.cause] ?? c.cause).toLowerCase()}. They count as good again.`],
      buttons: [{ value: 'delete', label: 'Delete', danger: true }],
      submit: () => send('DELETE', `/api/batch-checks/${c.id}`),
    });
  }

  return { receive, edit, place, takeOut, remove, check };
}
```

- [ ] **Step 2: Check it parses**

Run: `node --check web/batches-dialogs.js && node --disable-warning=ExperimentalWarning --test tests/web-batches-math.test.js`
Expected: no output from `--check`; the tests PASS.

- [ ] **Step 3: Commit**

```bash
git add web/batches-dialogs.js
git commit -m "Batches 11: the dialogs (Receive, Edit, Put into a room, Take out, Delete, Record and Edit a check)"
```

---

### Task 12: The Batches page and a batch's page (`web/batches-page.js`)

**Files:**
- Create: `web/batches-page.js`

- [ ] **Step 1: Write `web/batches-page.js`**

```js
// The Batches page, #/business/batches, and a batch's page, #/business/batches/<id> (spec 2026-11-05-batches-design.md 7):
// the batches waiting, in the rooms' current runs and past (one run's with ?run=); a batch's details, its delivery and its
// contamination checks, with its actions. Both read again on the batches events, a room's crop or name change (a run starts
// or ends), when the stream comes back, and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { picture } from './pictures.js';
import { DOT } from './text-math.js';
import { farmDate } from './tasks-math.js';
import { BATCHES_HASH, batchHash, batchSheetHash, roomHash } from './route.js';
import { createBatchDialogs } from './batches-dialogs.js';
import {
  pageGroups, pastIn, PAST_RANGES, PAST_COLUMNS, pastCells, waitingLine, placedLine, goodText, cropBlocks, detailFacts, overNote,
  statusLine, checkLine, deliveryLine, fullDate, dateText,
} from './batches-math.js';

const REFRESH_MS = 60_000;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function button(label, className = '') {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

// How a page stays current; load() is the page's, timerOf(ms) its slow timer while the stream is down. → stop().
function keepCurrent(load, timerOf) {
  const reload = createThrottle(load);
  const offs = [
    live.on('batches', () => reload.call()),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),
    live.onStatus((up) => { if (up) reload.call(); else timerOf(REFRESH_MS); }),
  ];
  return () => {
    reload.cancel();
    for (const off of offs) off();
  };
}

// A page's read: GET path, paint(data); the banner on a failure; the fallback timer. → { load, stop }.
function reader(path, paint, els, alive) {
  let seq = 0;
  let timer = null;
  let outdated = false;
  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', path());
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(data);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      if (err.status === 404 && !routeMissing(err)) { paint(null); return; } // the batch is gone
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }
  const stopLive = keepCurrent(() => { if (alive()) load(); }, (ms) => {
    if (outdated) return;
    clearTimeout(timer);
    timer = setTimeout(load, ms);
  });
  return { load, stop: () => { clearTimeout(timer); stopLive(); } };
}

const BANNER = `<div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>`;

// A batch's row: its picture, its name (a link to it), a line of words, its blocks, and an optional action.
function batchRow(b, line, action = null) {
  const row = el('div', 'bt-row');
  const words = el('div', 'bt-words');
  const name = el('a', 'bt-name', cropBlocks(b.crop));
  name.href = batchHash(b.id);
  words.append(name, el('p', 'bt-line', line));
  row.append(picture('crop', b.crop, { size: 32 }), words, el('span', 'bt-count', goodText(b)));
  if (action) row.append(action);
  return row;
}

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

// ---- the Batches page ----

const LIST = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Batches</h1>
      <p class="page-sub">Where each run's blocks come from: the supplier, the spawn batch, the blocks and their price.</p>
    </div>
    <div class="bt-tools">
      <button type="button" class="primary" data-receive>Receive blocks</button>
      <a class="button" data-csv download>Export CSV</a>
      <a class="button" data-sheet>myGAP 4-2 sheet</a>
    </div>
  </div>
  ${BANNER}
  <p class="bt-filter" data-filter hidden>Batches of one run. <a href="${BATCHES_HASH}">All batches</a></p>
  <section class="card bt-card" aria-labelledby="bt-waiting-title"><h2 id="bt-waiting-title">Waiting</h2><div data-waiting><p class="none">Loading…</p></div></section>
  <section class="card bt-card" aria-labelledby="bt-rooms-title"><h2 id="bt-rooms-title">In rooms</h2><div data-rooms></div></section>
  <section class="card bt-card" aria-labelledby="bt-past-title">
    <div class="card-head"><h2 id="bt-past-title">Past</h2><div class="range-bar bt-range" role="group" aria-label="Received in" data-range></div></div>
    <div data-past></div>
  </section>`;

export function mount(container, { run = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = LIST;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'), bannerText: q('[data-banner-text]'), waiting: q('[data-waiting]'), rooms: q('[data-rooms]'),
    past: q('[data-past]'), range: q('[data-range]'),
  };
  document.title = 'Batches · Mushroom farm';
  q('[data-filter]').hidden = run === null;
  const today = farmDate(Date.now());
  q('[data-csv]').href = '/api/batches.csv';
  q('[data-sheet]').href = batchSheetHash(farmDate(Date.now() - 89 * 86_400_000), today);

  let list = null;
  let days = 90;
  let painted = '';
  const showError = (text) => { els.bannerText.textContent = text; els.banner.hidden = false; };
  const read = reader(() => (run === null ? '/api/batches' : `/api/batches?run=${run}`), (data) => { list = data?.batches ?? []; paint(); }, els, alive);
  const dialogs = createBatchDialogs({ onChanged: () => { if (alive()) read.load(); }, onError: showError });
  q('[data-receive]').addEventListener('click', () => dialogs.receive());
  q('[data-retry]').addEventListener('click', () => read.load());

  const ranges = PAST_RANGES.map(([n, label]) => {
    const b = button(label);
    b.addEventListener('click', () => { days = n; painted = ''; paint(); });
    els.range.append(b);
    return [n, b];
  });

  function pastTable(rows) {
    const wrap = el('div', 'us-table-wrap');
    const t = el('table', 'us-table bt-past-table');
    t.append(el('caption', 'sr-only', 'Past batches'));
    const head = el('tr');
    PAST_COLUMNS.forEach((c, i) => {
      const th = el('th', [4, 5, 6].includes(i) ? 'num' : '', c);
      th.scope = 'col';
      head.append(th);
    });
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const b of rows) {
      const tr = el('tr');
      pastCells(b, today).forEach((text, i) => {
        const cellEl = el(i === 0 ? 'th' : 'td', [4, 5, 6].includes(i) ? 'num' : '');
        cellEl.dataset.label = PAST_COLUMNS[i]; // a phone shows each figure under its name
        if (i === 0) {
          cellEl.scope = 'row';
          const a = el('a', '', text);
          a.href = batchHash(b.id);
          cellEl.append(a);
        } else {
          cellEl.textContent = text;
        }
        tr.append(cellEl);
      });
      body.append(tr);
    }
    t.append(thead, body);
    wrap.append(t);
    return wrap;
  }

  function paint() {
    if (!list) return;
    const key = JSON.stringify([list, days]);
    if (key === painted) return;
    painted = key;
    for (const [n, b] of ranges) b.setAttribute('aria-pressed', String(n === days));
    const g = pageGroups(list);
    const now = Date.now();
    els.waiting.replaceChildren(...(g.waiting.length ? g.waiting.map((b) => {
      const put = button('Put into a room');
      put.disabled = b.good < 1;
      put.addEventListener('click', () => dialogs.place(b));
      return batchRow(b, waitingLine(b, now), put);
    }) : [el('p', 'none', 'No blocks waiting.')]));
    els.rooms.replaceChildren(...(g.rooms.length ? g.rooms.map((r) => {
      const group = el('div', 'bt-group-room');
      const h = el('h3', 'bt-room-head');
      const a = el('a', '', r.roomName);
      a.href = roomHash(r.roomId, 'harvest');
      h.append(a, `${DOT}run since ${dateText(r.runStartedAt, today)}`);
      group.append(h, ...r.batches.map((b) => batchRow(b, placedLine(b, today))), ...r.over.map((t) => el('p', 'bt-over', t)));
      return group;
    }) : [el('p', 'none', "No batches in a room's current run.")]));
    const past = pastIn(g.past, days, now);
    els.past.replaceChildren(past.length ? pastTable(past) : el('p', 'none', days === null ? 'No past batches.' : `No past batches received in the last ${PAST_RANGES.find(([n]) => n === days)[1]}.`));
  }

  read.load();
  return function unmount() {
    mountSeq++;
    read.stop();
  };
}

// ---- a batch ----

const ONE = `
  <a class="back" href="${BATCHES_HASH}">Batches</a>
  <div class="page-head">
    <div class="page-titles bt-titles">
      <span class="bt-pic" data-pic></span>
      <div>
        <h1 class="page-title" tabindex="-1" data-title>Loading…</h1>
        <p class="page-sub" data-sub></p>
      </div>
    </div>
    <div class="bt-tools" data-actions></div>
  </div>
  ${BANNER}
  <div data-body hidden>
    <p class="bt-over" data-over hidden></p>
    <section class="card bt-card" aria-labelledby="bt-details-title"><h2 id="bt-details-title">Details</h2><dl class="bt-facts" data-facts></dl></section>
    <section class="card bt-card" aria-labelledby="bt-delivery-title" data-delivery-card hidden><h2 id="bt-delivery-title">Delivery</h2><div data-delivery></div></section>
    <section class="card bt-card" aria-labelledby="bt-checks-title">
      <div class="card-head"><h2 id="bt-checks-title">Contamination</h2><span data-add-check></span></div>
      <div data-checks></div>
    </section>
  </div>
  <section class="card bt-card" data-gone hidden><p class="none">No such batch.</p><a href="${BATCHES_HASH}">Back to Batches</a></section>`;

export function mountBatch(container, { id }) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = ONE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'), bannerText: q('[data-banner-text]'), title: q('[data-title]'), sub: q('[data-sub]'), pic: q('[data-pic]'),
    actions: q('[data-actions]'), body: q('[data-body]'), over: q('[data-over]'), facts: q('[data-facts]'), deliveryCard: q('[data-delivery-card]'),
    delivery: q('[data-delivery]'), addCheck: q('[data-add-check]'), checks: q('[data-checks]'), gone: q('[data-gone]'),
  };
  document.title = 'Batch · Mushroom farm';
  let painted = '';
  const showError = (text) => { els.bannerText.textContent = text; els.banner.hidden = false; };
  const read = reader(() => `/api/batches/${id}`, paint, els, alive);
  const dialogs = createBatchDialogs({ onChanged: () => { if (alive()) read.load(); }, onError: showError });
  q('[data-retry]').addEventListener('click', () => read.load());

  function paint(b) {
    if (!b) {
      els.body.hidden = true;
      els.actions.replaceChildren();
      els.title.textContent = 'Batch';
      els.sub.textContent = '';
      els.gone.hidden = false;
      return;
    }
    const key = JSON.stringify(b);
    if (key === painted) return;
    painted = key;
    const today = farmDate(Date.now());
    document.title = `${cropBlocks(b.crop)} · Mushroom farm`;
    els.gone.hidden = true;
    els.body.hidden = false;
    els.pic.replaceChildren(picture('crop', b.crop, { size: 40 }));
    els.title.textContent = cropBlocks(b.crop);
    els.sub.textContent = [`Received ${fullDate(b.receivedAt)}`, b.supplier, statusLine(b)].filter(Boolean).join(DOT);

    const actions = [];
    if (b.status === 'waiting') {
      const put = button('Put into a room', 'primary');
      put.disabled = b.good < 1;
      put.addEventListener('click', () => dialogs.place(b));
      actions.push(put);
    } else if (b.status === 'placed') {
      const out = button('Take out');
      out.addEventListener('click', () => dialogs.takeOut(b));
      actions.push(out);
    }
    const edit = button('Edit');
    edit.addEventListener('click', () => dialogs.edit(b));
    const del = button('Delete', 'danger-text');
    del.addEventListener('click', () => dialogs.remove(b, () => { location.hash = BATCHES_HASH; }));
    els.actions.replaceChildren(...actions, edit, del);

    const over = overNote(b);
    els.over.hidden = !over;
    els.over.textContent = over ?? '';
    els.facts.replaceChildren(...detailFacts(b).map(([label, value]) => {
      const row = el('div');
      row.append(el('dt', '', label), el('dd', '', value));
      return row;
    }));

    els.deliveryCard.hidden = b.delivery.length < 2;
    els.delivery.replaceChildren(...b.delivery.map((x) => {
      const row = el('p', 'bt-delivery-row');
      if (x.id === b.id) {
        row.append(el('strong', '', deliveryLine(x)), el('span', 'muted', ' (this one)'));
      } else {
        const a = el('a', '', deliveryLine(x));
        a.href = batchHash(x.id);
        row.append(a);
      }
      return row;
    }));

    const add = button('Record a check');
    add.disabled = b.good < 1;
    add.addEventListener('click', () => dialogs.check(b));
    els.addCheck.replaceChildren(add);
    els.checks.replaceChildren(...(b.checks.length ? b.checks.map((c) => {
      const row = el('div', 'bt-check');
      row.append(el('p', 'bt-line', checkLine(c, today)));
      if (c.note) row.append(el('p', 'muted bt-note', c.note));
      const editCheck = button('Edit', 'bt-quiet');
      editCheck.setAttribute('aria-label', `Edit the check of ${fullDate(c.at)}`);
      editCheck.addEventListener('click', () => dialogs.check(b, c));
      row.append(editCheck);
      return row;
    }) : [el('p', 'none', 'No contamination recorded.')]));
  }

  read.load();
  return function unmount() {
    mountSeq++;
    read.stop();
  };
}
```

- [ ] **Step 2: Check it parses**

Run: `node --check web/batches-page.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add web/batches-page.js
git commit -m "Batches 12: the Batches page (waiting, in rooms, past) and a batch's page (details, delivery, contamination)"
```

---

### Task 13: The myGAP 4-2 sheet (`web/batches-sheet.js`)

**Files:**
- Create: `web/batches-sheet.js`

- [ ] **Step 1: Write `web/batches-sheet.js`**

```js
// The myGAP 4-2 sheet, #/business/batches/sheet?from=&to= (spec 2026-11-05-batches-design.md 7): a print page of the
// planting material bought and used in the dates, from every batch (GET /api/batches): a receipt row per delivery, a use
// row per placement, the treatment columns blank to write in. The From and To boxes change the address; the last 90 days
// when it has none. The Harvest sheet's print rules (hv-sheet classes, body.printing-sheet) give it its paper.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { farmDate } from './tasks-math.js';
import { BATCHES_HASH, batchSheetHash } from './route.js';
import { sheetRows, SHEET_TITLE, SHEET_COLUMNS, fullDate } from './batches-math.js';
import { dateHint } from './harvest-math.js';

const REFRESH_MS = 60_000;
const DAY_MS = 86_400_000;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

const TEMPLATE = `
  <div class="hv-sheet bt-sheet">
    <div class="hv-sheet-tools">
      <a class="back" href="${BATCHES_HASH}">Back to Batches</a>
      <div class="bt-sheet-dates">
        <label>From <input type="date" data-from></label>
        <label>To <input type="date" data-to></label>
      </div>
      <button type="button" class="primary" data-print>Print</button>
    </div>
    <h1 class="page-title hv-sheet-title" tabindex="-1"></h1>
    <dl class="hv-sheet-facts">
      <div><dt>Farm</dt><dd class="hv-write-line"></dd></div>
      <div><dt>Period</dt><dd data-period></dd></div>
    </dl>
    <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
    <p class="none" data-empty hidden>No planting material bought or used in these dates.</p>
    <div class="hv-sheet-wrap" data-wrap hidden>
      <table class="hv-sheet-table bt-sheet-table">
        <thead><tr data-head></tr></thead>
        <tbody data-rows></tbody>
      </table>
    </div>
  </div>`;

let mountSeq = 0;

export function mountSheet(container, { from = null, to = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  const today = farmDate(Date.now());
  if (!from || !to || from > to) {
    from = farmDate(Date.now() - 89 * DAY_MS);
    to = today;
    history.replaceState(null, '', batchSheetHash(from, to)); // the dates the sheet shows, in its address
  }
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    from: q('[data-from]'), to: q('[data-to]'), period: q('[data-period]'), banner: q('.banner'), bannerText: q('[data-banner-text]'),
    empty: q('[data-empty]'), wrap: q('[data-wrap]'), rows: q('[data-rows]'),
  };
  document.title = 'myGAP 4-2 sheet · Mushroom farm';
  document.body.classList.add('printing-sheet');
  q('.hv-sheet-title').textContent = SHEET_TITLE;
  q('[data-head]').append(...SHEET_COLUMNS.map((c) => {
    const th = el('th', '', c);
    th.scope = 'col';
    return th;
  }));
  els.from.value = from;
  els.to.value = to;
  els.from.max = today;
  els.to.max = today;
  els.from.title = dateHint(from);
  els.to.title = dateHint(to);
  const midday = (d) => Date.parse(`${d}T04:00:00Z`); // 12:00 farm time of a date, for the words
  els.period.textContent = `${fullDate(midday(from))} – ${fullDate(midday(to))}`;
  // A changed date: the address (the router mounts the sheet again on it).
  const onDate = () => {
    const [f, t] = [els.from.value, els.to.value];
    if (/^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t) && f <= t) location.hash = batchSheetHash(f, t);
  };
  els.from.addEventListener('change', onDate);
  els.to.addEventListener('change', onDate);

  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  function paint(data) {
    const rows = sheetRows(Array.isArray(data?.batches) ? data.batches : [], { from, to });
    const key = JSON.stringify(rows);
    if (key === painted) return;
    painted = key;
    els.empty.hidden = rows.length > 0;
    els.wrap.hidden = rows.length === 0;
    els.rows.replaceChildren(...rows.map((cells) => {
      const tr = el('tr');
      tr.append(...cells.map((c, i) => el('td', i >= 6 && i <= 8 ? 'hv-write' : '', c)));
      return tr;
    }));
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const data = await request('GET', '/api/batches');
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(data);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const reload = createThrottle(() => { if (alive()) load(); });
  const offs = [
    live.on('batches', () => reload.call()),
    live.on('room', (d) => { if (d.part === 'room') reload.call(); }), // a room renamed: the Block / area column names it
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) { clearTimeout(timer); timer = setTimeout(load, REFRESH_MS); }
    }),
  ];
  q('[data-print]').addEventListener('click', () => window.print());
  q('[data-retry]').addEventListener('click', () => load());
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offs) off();
    document.body.classList.remove('printing-sheet');
  };
}
```

`fullDate` takes ms; `midday` gives the date's farm noon, so "8 Aug 2026 – 5 Nov 2026" is the boxes' days.

- [ ] **Step 2: Check it parses**

Run: `node --check web/batches-sheet.js`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add web/batches-sheet.js
git commit -m "Batches 13: the myGAP 4-2 sheet (receipts and uses in the dates, the treatment columns to write in)"
```

---

### Task 14: The styles

**Files:**
- Modify: `web/styles.css` (append at the end) and the print block at ~line 343

- [ ] **Step 1: Append the `.bt-` block to the end of `web/styles.css`**

```css
/* ---- Batches ---- (spec 2026-11-05-batches-design.md 7): the Batches page, a batch, the 4-2 sheet's date boxes. Tokens only. */
.bt-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.bt-filter { margin: 0 0 12px; color: var(--ink-2); font-size: var(--fs-sm); }
.bt-card { margin-bottom: 16px; }
.bt-card > h2 { margin-bottom: 12px; }
.bt-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto auto; align-items: center; gap: 4px 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.bt-row:first-child { border-top: 0; padding-top: 0; }
.bt-words { min-width: 0; }
.bt-name { color: var(--ink); font-weight: 600; text-decoration: underline; text-decoration-color: var(--axis); text-underline-offset: 3px; }
.bt-name:hover, .bt-name:focus-visible { text-decoration-color: currentColor; }
.bt-line { margin: 2px 0 0; color: var(--ink-2); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.bt-count { font-variant-numeric: tabular-nums; white-space: nowrap; text-align: right; }
.bt-group-room + .bt-group-room { margin-top: 18px; }
.bt-room-head { margin: 0 0 8px; font-size: var(--fs-md); font-weight: 600; font-variant-numeric: tabular-nums; }
.bt-room-head a { color: var(--ink); }
.bt-over { margin: 8px 0 0; padding: 8px 12px; border-radius: 8px; background: var(--warning-soft); color: var(--warning-text); font-size: var(--fs-sm); }
.bt-range { margin: 0; }
.bt-past-table th a { color: var(--ink); }
.bt-titles { display: flex; align-items: center; gap: 12px; }
.bt-pic { flex: none; display: inline-flex; }
.bt-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px 24px; margin: 0; }
.bt-facts div { display: contents; }
.bt-facts dt { color: var(--ink-2); }
.bt-facts dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.bt-delivery-row { margin: 6px 0 0; font-variant-numeric: tabular-nums; }
.bt-check { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 12px; padding: 8px 0; border-top: 1px solid var(--border); }
.bt-check:first-child { border-top: 0; padding-top: 0; }
.bt-check .bt-line { margin: 0; color: var(--ink); }
.bt-check .bt-note { grid-column: 1; margin: 0; font-size: var(--fs-sm); }
.bt-check button { grid-column: 2; grid-row: 1; }
.bt-quiet { min-height: 36px; padding: 4px 10px; background: transparent; border-color: transparent; color: var(--ink-2); }
.bt-quiet:hover { border-color: var(--border); color: var(--ink); }
.bt-sheet-dates { display: flex; flex-wrap: wrap; gap: 8px 16px; }
.bt-sheet-dates label { display: inline-flex; align-items: center; gap: 6px; color: var(--ink-2); font-size: var(--fs-sm); }
@media (max-width: 600px) {
  .bt-row { grid-template-columns: 32px minmax(0, 1fr); }
  .bt-row .bt-count { grid-column: 2; text-align: left; }
  .bt-row > button { grid-column: 1 / -1; min-height: 44px; }
  .bt-tools > * { min-height: 44px; }
  .bt-facts { grid-template-columns: minmax(0, 1fr); gap: 2px; }
  .bt-facts dd { margin-bottom: 8px; }
  /* Past: each batch a block of labelled figures (as Harvest's Past runs) */
  .bt-past-table thead { display: none; }
  .bt-past-table, .bt-past-table tbody, .bt-past-table tr { display: block; }
  .bt-past-table tr { padding: 10px 0; border-top: 1px solid var(--border); }
  .bt-past-table tr:first-child { border-top: 0; }
  .bt-past-table th, .bt-past-table td { display: grid; grid-template-columns: 9.5em minmax(0, 1fr); gap: 8px; padding: 2px 0; border: 0; text-align: left; }
  .bt-past-table :is(th, td)::before { content: attr(data-label); color: var(--ink-2); font-weight: 400; }
  .bt-past-table .num { text-align: left; }
}
/* ---- end Batches ---- */
```

- [ ] **Step 2: Hide the sheet's date boxes in print**

In the `@media print` block at ~line 343, the sheet's tools row (`.hv-sheet-tools`) is already hidden, and the date boxes live in it: nothing to add. Check with `grep -n "hv-sheet-tools" web/styles.css` that `body.printing-sheet .hv-sheet-tools` has `display: none`.

- [ ] **Step 3: Commit**

```bash
git add web/styles.css
git commit -m "Batches 14: the .bt- styles (rows, rooms, the over-count note, facts, checks, Past as blocks on a phone)"
```

---

### Task 15: Docs, the whole suite, a look in the browser

**Files:**
- Modify: `DESIGN.md` (a `### Batches` section after `### Task grid`), `README.md` (a Batches row or paragraph where Harvest is described), `PRODUCT.md` (the Capabilities table: a Batches row; Evidence/Open untouched)
- Modify: `docs/specs/2026-11-05-batches-design.md` (two lines, below)

- [ ] **Step 1: Spec lines that the build settled**

In the spec's section 7 Dialogs row, replace "the rooms, those without the crop in an open run listed but off with the reason" with "the rooms whose open run has the crop; the others named in the hint under the box with the reason ("Not offered: Container 2 (no Grey oyster), Room 1 (no crops).")" (the shared dialog's picker has no off options), and "cause (a segmented list" with "cause (a picker". In section 3's Events row, replace "A write that changes a placed batch's weight, water, blocks, room or run also publishes `harvest` `{ roomId }`" with "A write that touches a placed row (before or after it) also publishes `harvest` `{ roomId }` for that room".

- [ ] **Step 2: DESIGN.md**

Add after the `### Task grid` section (before `## Do's and Don'ts`):

```markdown
### Batches
(2026-11-05, spec 2026-11-05-batches-design.md.) `#/business/batches`: Waiting, In rooms (a group per room's current run, the room a link to its Harvest tab) and Past (a range control 90 days · 12 months · All; on a phone each batch a block of labelled figures). A batch row: the crop picture, "Grey oyster blocks" as a link, a muted line (supplier · received · days ago), the good blocks at the right ("1,180 of 1,200 good" after a loss), and Put into a room. More batch blocks than the run's is said in amber on `--warning-soft` (a check, not a fault). A batch's page: Details as a definition list (empty facts left out), Delivery (when split), Contamination (checks newest first, a quiet Edit each). Money as Harvest's (RM 2 decimals, grouped), blocks grouped. The myGAP 4-2 sheet reuses the 4-6 sheet's print rules. Styles in the `.bt-` block.
```

- [ ] **Step 3: README.md and PRODUCT.md**

README: where the Harvest module is listed, add one line: "**Batches** (`#/business/batches`): bought blocks received, put into rooms (split across rooms), contamination checks, the myGAP 4-2 sheet and a CSV; a batch's weight feeds Harvest's BE. Spec `docs/specs/2026-11-05-batches-design.md`." (Read README.md first and match its list's form.)

PRODUCT.md, the Capabilities and Constraints table, after the Harvest row:

```markdown
| Batches | Bought blocks: supplier, spawn batch, strain, delivery note, blocks, price, weight; put into a room's run, split across rooms; contamination checks; Inventory stock moves; the myGAP 4-2 sheet and a CSV. Blocks made on the farm come next (part 2) |
```

- [ ] **Step 4: The whole suite**

Run: `npm test 2>&1 | tail -15`
Expected: every test passes (2197 before this branch plus the new ones). A failure outside the Batches files: read it; most likely a test that lists `EVENT_TYPES` or the API's routes; fix it in this branch.

- [ ] **Step 5: A look in the browser**

```bash
mkdir -p /tmp/batches && rm -f /tmp/batches/look.db
PORT=18901 DB_PATH=/tmp/batches/look.db node --disable-warning=ExperimentalWarning server/main.js
```

(Check `server/main.js` for the real names of the port and database variables first: `grep -n "process.env" server/main.js`.) Then in a browser (chrome-devtools MCP) at `http://localhost:18901/#/business/batches`: make a room with Grey oyster blocks, Receive a batch, Put part of it into the room, open the batch, Record a check, Take out, open the 4-2 sheet; at 1440 and 390 px, dark and light. Fix what is broken. Stop the server after.

- [ ] **Step 6: Commit**

```bash
git add DESIGN.md README.md PRODUCT.md docs/specs/2026-11-05-batches-design.md web server tests
git commit -m "Batches 15: DESIGN, README and PRODUCT rows; the spec's settled lines; fixes from the browser look"
```

---

## After the plan (the contract's process, not tasks for the implementer)

| Step | Who |
|---|---|
| UI/UX audit: Impeccable critique and audit at 1440, 1024 and 390 px, both themes (the page, a batch, each dialog, the sheet), and its fixes | Lead session |
| Final code review and the Impeccable finish review, and their fixes | Lead session |
| Part 2 plan (making blocks) | Lead session, after part 1 is ready to merge |
| Stop at "ready to merge": branch, last commit, test count in the handoff | Lead session |

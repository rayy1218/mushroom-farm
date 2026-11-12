# Inventory Implementation Plan


**Goal:** Build the Inventory business module: stock items and a ledger of moves (purchases, uses, counts, Batches' batch moves), lots taken oldest purchase first with use-by warnings, Low stock, one Telegram message per event, the purchases route Costs reads, a printable myGAP 4-5 sheet, and the pages `#/business/inventory`, `#/business/inventory/<id>`, `#/business/inventory/count`, `#/business/inventory/sheet`.

**Architecture:** Two STRICT tables (`stock_items`, `stock_moves`) made in the database's version-22 step. Every figure (in stock, lots, Low, use-by) is worked out on read by pure code (`server/inventory-math.js`); `server/inventory.js` checks and writes; `server/inventory-api.js` holds the routes, publishes `inventory` events and runs the Telegram checks (`server/inventory-alerts.js`). The web side is plain modules: one formatter (`web/inventory-math.js`), the dialogs on the tasks' `openForm`, and four pages.

**Tech Stack:** Node 22.13+, `node:http`, `node:sqlite`, plain HTML/CSS/JS modules, no build, no npm dependencies, `node --test`.

**Spec:** `docs/specs/2026-11-05-inventory-design.md`. **Contract:** `~/.claude/task-logs/business/CONTRACT.md` (section 7: Batches writes `'batch'` moves and block items itself; Inventory never writes or edits them, and every column it adds has a default).

---

## Conventions every task follows

| Rule | Detail |
|---|---|
| Where | Worktree `/home/foqcus/Documents/mushroom-farm/.claude/worktrees/inventory`, branch `feat/inventory`. Run every command from there. Never touch `data/v2.db` or the live apps. |
| Tests | `node --disable-warning=ExperimentalWarning --test <file>` for one file; `npm test` for all. Throwaway files under `/tmp/inventory/`. Browser checks on ports 18950–18999 only. |
| Shared files | Only the lines named in a task. In `server/db.js` every Inventory addition sits under a `// ---- Inventory ----` comment. CSS goes in one block at the end of `web/styles.css` between `/* ---- Inventory ---- */` and `/* ---- end Inventory ---- */`, every class prefixed `.iv-`, tokens only. |
| Words | Plain short English, metric units, a no-break space between a number and its unit (the formatter does it), `·` joins with `DOT` from `web/text-math.js`. |
| Commits | One per task at least, message starting "Inventory: ". Git identity is already the repo's (Ray Tham). |

## File map

| File | New/changed | Responsibility |
|---|---|---|
| `server/db.js` | changed | `INVENTORY` tables, the `version < 22` step, `VERSION = 22`, row mappers, statements and methods (`stockItems` … `batchRooms`) |
| `server/inventory-math.js` | new | Pure: `stockOf`, `lotsOf`, `useByState`, `itemView`, `attentionOf`, `sheetRows`, constants |
| `server/inventory.js` | new | `createInventory({ db, now })`: checks and writes, the views, `InventoryError` |
| `server/inventory-alerts.js` | new | `createInventoryAlerts(...)`: Low and use-by Telegram messages |
| `server/inventory-api.js` | new | `createInventoryApi({ db, events })`: routes, events, the `batches` subscription |
| `server/api.js` | changed | 3 lines: import, create, route; `api.close` stops it |
| `server/settings.js` | changed | Its own block: `inventoryTelegram` |
| `web/inventory-math.js` | new | The formatter and the pages' pure parts |
| `web/route.js`, `web/app.js`, `web/live.js` | changed | The four addresses; `'inventory'` event |
| `web/inventory-dialogs.js` | new | Item, Purchase, Use, Edit/Delete a record, Throw out, Archive |
| `web/inventory-page.js` | new | The list |
| `web/inventory-item.js` | new | An item: tiles, lots, history |
| `web/inventory-count.js` | new | Count stock |
| `web/inventory-sheet.js` | new | The myGAP 4-5 print page |
| `web/inventory-settings.js`, `web/settings-page.js` | new, changed (2 lines) | The Settings card |
| `web/styles.css` | changed | The `.iv-` block at the end |
| `tests/db-inventory.test.js`, `tests/inventory-math.test.js`, `tests/inventory.test.js`, `tests/inventory-alerts.test.js`, `tests/api-inventory.test.js`, `tests/settings-inventory.test.js`, `tests/web-inventory-math.test.js`, `tests/web-inventory-pages.test.js` | new | As each task says |
| `DESIGN.md`, `README.md`, `PRODUCT.md` | changed | An Inventory section / row each |

---

### Task 1: The tables, the version-22 step and the database methods

**Files:**
- Modify: `server/db.js` (the constant after `RUNS_HARVESTS`; `VERSION`; `migrate`; row mappers after `harvestOf`; statements at the end of the `q` object; methods before `close()`)
- Modify: the tests that assert `user_version` 20: `tests/db-acfan.test.js:107`, `tests/db-machines.test.js:86`, `tests/db-programs.test.js:122`, `tests/controller-fresh-air.test.js:171`, `tests/db-usage.test.js:29` (and any other `grep` finds)
- Test: `tests/db-inventory.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/db-inventory.test.js`:

```js
// Inventory in the database (spec 2026-11-05-inventory-design.md 2): the version-22 step, the defaults of a row written with
// only the contract's columns (as Batches writes them), the unique name, the moves, the purchases between two times and a
// batch's room.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

function fresh(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  return db;
}

function file(t, name) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-inv-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return join(dir, name);
}

test('a version 20 file is brought to 22 with the two inventory tables, empty', (t) => {
  const path = file(t, 'v20.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  raw.exec('DROP TABLE stock_moves; DROP TABLE stock_items; PRAGMA user_version = 20;');
  raw.close();
  const db = openDb(path);
  assert.deepEqual(db.stockItems(), []);
  assert.deepEqual(db.stockMoves(), []);
  db.close();
  const check = new DatabaseSync(path);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 22);
  check.close();
});

test('a block item and a batch move written with only the contract columns read back with the defaults', (t) => {
  const path = file(t, 'batches.db');
  openDb(path).close();
  const raw = new DatabaseSync(path);
  raw.exec(`INSERT INTO stock_items (id, name, kind, unit, reorder_at) VALUES (1, 'Grey oyster blocks', 'blocks', 'blocks', NULL);
            INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note) VALUES (1, 1000, 500, 1.2, 'batch', 14, NULL);`);
  raw.close();
  const db = openDb(path);
  t.after(() => db.close());
  assert.deepEqual(db.stockItem(1), {
    id: 1, name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks', reorderAt: null, ingredient: null, lrmpNo: null,
    archived: false, lowSentAt: null,
  });
  const [m] = db.stockMoves();
  assert.deepEqual(m, {
    id: m.id, itemId: 1, at: 1000, qty: 500, unitCost: 1.2, refKind: 'batch', refId: 14, note: null, total: null, supplier: null,
    useBy: null, roomId: null, reason: null, worker: null, counted: null, lotId: null, useBySentAt: null,
  });
});

test('item names are unique ignoring case; items and moves are written, changed and deleted', (t) => {
  const db = fresh(t);
  const bleach = db.insertStockItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2, ingredient: 'Sodium hypochlorite', lrmpNo: null });
  assert.equal(bleach.name, 'Bleach');
  assert.equal(bleach.ingredient, 'Sodium hypochlorite');
  assert.equal(db.stockNameUsed('bleach'), true);
  assert.equal(db.stockNameUsed('BLEACH', bleach.id), false);
  assert.throws(() => db.insertStockItem({ name: 'BLEACH', kind: 'chemical', unit: 'L' }));
  const changed = db.updateStockItem(bleach.id, { ...bleach, kind: 'other', reorderAt: 3, archived: true });
  assert.equal(changed.kind, 'other');
  assert.equal(changed.reorderAt, 3);
  assert.equal(changed.archived, true);
  db.setStockLowSent(bleach.id, 5000);
  assert.equal(db.stockItem(bleach.id).lowSentAt, 5000);

  const [buy] = db.insertStockMoves([{ itemId: bleach.id, at: 1000, qty: 5, refKind: 'purchase', total: 25, unitCost: 5, supplier: 'Kedai Ali', useBy: '2026-12-01' }]);
  assert.equal(buy.qty, 5);
  assert.equal(buy.useBy, '2026-12-01');
  const [out] = db.insertStockMoves([{ itemId: bleach.id, at: 2000, qty: -1, refKind: 'use', worker: 'Ali', lotId: buy.id, reason: 'Expired' }]);
  assert.deepEqual(db.itemStockMoves(bleach.id).map((m) => m.id), [buy.id, out.id]);
  const edited = db.updateStockMove(buy.id, { ...buy, qty: 6, total: 30, unitCost: 5, useBySentAt: 7000 });
  assert.equal(edited.qty, 6);
  assert.equal(edited.useBySentAt, 7000);
  db.setStockUseBySent(buy.id, null);
  assert.equal(db.stockMove(buy.id).useBySentAt, null);
  assert.equal(db.deleteStockMove(buy.id), 2, 'a purchase takes its throw-outs with it');
  assert.deepEqual(db.itemStockMoves(bleach.id), []);
  assert.equal(db.stockMove(buy.id), null);
  assert.equal(db.deleteStockItem(bleach.id), true);
  assert.equal(db.stockItem(bleach.id), null);
});

test('a list of moves is written in one transaction: one bad row writes none', (t) => {
  const db = fresh(t);
  const spawn = db.insertStockItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  assert.throws(() => db.insertStockMoves([
    { itemId: spawn.id, at: 1, qty: 1, refKind: 'adjust', counted: 1 },
    { itemId: spawn.id, at: 1, qty: 1, refKind: 'nonsense' },
  ]));
  assert.deepEqual(db.stockMoves(), []);
});

test('purchases between two times carry the item name and kind; batch moves are left out', (t) => {
  const db = fresh(t);
  const spawn = db.insertStockItem({ name: 'Grey oyster spawn', kind: 'spawn', unit: 'kg' });
  db.insertStockMoves([
    { itemId: spawn.id, at: 1000, qty: 3, refKind: 'purchase', total: 30, unitCost: 10 },
    { itemId: spawn.id, at: 2000, qty: 2, refKind: 'batch', refId: 4, unitCost: 1 },
    { itemId: spawn.id, at: 9000, qty: 1, refKind: 'purchase', total: 10, unitCost: 10 },
  ]);
  const got = db.stockPurchasesBetween(0, 5000);
  assert.equal(got.length, 1);
  assert.equal(got[0].name, 'Grey oyster spawn');
  assert.equal(got[0].kind, 'spawn');
  assert.equal(got[0].total, 30);
});

test("a batch's room is read from the batches table when it is there; without the table, none", (t) => {
  const path = file(t, 'rooms.db');
  const db = openDb(path);
  t.after(() => db.close());
  assert.deepEqual([...db.batchRooms([4])], []);
  const raw = new DatabaseSync(path);
  raw.exec('CREATE TABLE batches (id INTEGER PRIMARY KEY, room_id INTEGER) STRICT; INSERT INTO batches VALUES (4, 2), (5, NULL);');
  raw.close();
  assert.deepEqual([...db.batchRooms([4, 5, 6])], [[4, 2], [5, null]]);
  assert.deepEqual([...db.batchRooms([])], []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-inventory.test.js`
Expected: FAIL (`db.stockItems is not a function`, `no such table: stock_moves`).

- [ ] **Step 3: Add the tables, the step and the methods**

In `server/db.js`:

1. `const VERSION = 20;` → `const VERSION = 22;`

2. After the `RUNS_HARVESTS` constant (it ends with `harvests_by_task ... WHERE task_id IS NOT NULL;\`;`), add:

```js
// ---- Inventory (spec 2026-11-05-inventory-design.md 2) ----
// Stock items and their moves. Batches inserts block items and 'batch' moves naming only the contract's columns (contract
// section 7), so every other column is nullable or has a default; the unit has no CHECK here ('blocks' is Batches').
const INVENTORY = `
CREATE TABLE IF NOT EXISTS stock_items (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('blocks', 'spawn', 'bags', 'chemical', 'packaging', 'other')),
  unit        TEXT    NOT NULL,
  reorder_at  REAL,
  ingredient  TEXT,
  lrmp_no     TEXT,
  archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
  low_sent_at INTEGER
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS stock_items_name ON stock_items (name COLLATE NOCASE);
CREATE TABLE IF NOT EXISTS stock_moves (
  id             INTEGER PRIMARY KEY,
  item_id        INTEGER NOT NULL REFERENCES stock_items (id),
  at             INTEGER NOT NULL,
  qty            REAL    NOT NULL,
  unit_cost      REAL,
  ref_kind       TEXT    NOT NULL CHECK (ref_kind IN ('purchase', 'use', 'batch', 'adjust')),
  ref_id         INTEGER,
  note           TEXT,
  total          REAL,
  supplier       TEXT,
  use_by         TEXT,
  room_id        INTEGER,
  reason         TEXT,
  worker         TEXT,
  counted        REAL,
  lot_id         INTEGER,
  use_by_sent_at INTEGER
) STRICT;
CREATE INDEX IF NOT EXISTS stock_moves_by_item ON stock_moves (item_id, at);
CREATE INDEX IF NOT EXISTS stock_moves_by_kind ON stock_moves (ref_kind, at);`;
```

3. In `migrate`, after the `if (version < 20) { … }` block and before `db.exec(\`PRAGMA user_version = ${VERSION}\`);`:

```js
    // ---- Inventory (spec 2026-11-05-inventory-design.md 2.3) ----
    if (version < 22) db.exec(INVENTORY);
```

4. After the `harvestOf` mapper:

```js
// ---- Inventory ---- A stock_items row and a stock_moves row as the inventory module shows them.
const stockItemOf = (r) => ({
  id: r.id, name: r.name, kind: r.kind, unit: r.unit, reorderAt: r.reorder_at, ingredient: r.ingredient, lrmpNo: r.lrmp_no,
  archived: r.archived === 1, lowSentAt: r.low_sent_at,
});
const stockMoveOf = (r) => ({
  id: r.id, itemId: r.item_id, at: r.at, qty: r.qty, unitCost: r.unit_cost, refKind: r.ref_kind, refId: r.ref_id, note: r.note,
  total: r.total, supplier: r.supplier, useBy: r.use_by, roomId: r.room_id, reason: r.reason, worker: r.worker,
  counted: r.counted, lotId: r.lot_id, useBySentAt: r.use_by_sent_at,
});
```

5. At the end of the `q = { … }` object literal (after the last harvest statement, `deleteHarvests: …`), add:

```js
    // ---- Inventory (spec 2026-11-05-inventory-design.md 2) ----
    stockItems: db.prepare('SELECT * FROM stock_items ORDER BY name COLLATE NOCASE, id'),
    stockItem: db.prepare('SELECT * FROM stock_items WHERE id = ?'),
    stockNameUsed: db.prepare('SELECT 1 FROM stock_items WHERE name = ? COLLATE NOCASE AND id IS NOT ?'),
    insertStockItem: db.prepare('INSERT INTO stock_items (name, kind, unit, reorder_at, ingredient, lrmp_no) VALUES (?, ?, ?, ?, ?, ?)'),
    updateStockItem: db.prepare('UPDATE stock_items SET name = ?, kind = ?, unit = ?, reorder_at = ?, ingredient = ?, lrmp_no = ?, archived = ? WHERE id = ?'),
    deleteStockItem: db.prepare('DELETE FROM stock_items WHERE id = ?'),
    setStockLowSent: db.prepare('UPDATE stock_items SET low_sent_at = ? WHERE id = ?'),
    stockMoves: db.prepare('SELECT * FROM stock_moves ORDER BY at, id'),
    itemStockMoves: db.prepare('SELECT * FROM stock_moves WHERE item_id = ? ORDER BY at, id'),
    stockMove: db.prepare('SELECT * FROM stock_moves WHERE id = ?'),
    insertStockMove: db.prepare(`INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note, total, supplier, use_by,
                                                          room_id, reason, worker, counted, lot_id)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`),
    updateStockMove: db.prepare(`UPDATE stock_moves SET at = ?, qty = ?, unit_cost = ?, total = ?, supplier = ?, use_by = ?, room_id = ?,
                                                        reason = ?, worker = ?, use_by_sent_at = ? WHERE id = ?`),
    deleteStockMove: db.prepare('DELETE FROM stock_moves WHERE id = ?1 OR lot_id = ?1'),
    setStockUseBySent: db.prepare('UPDATE stock_moves SET use_by_sent_at = ? WHERE id = ?'),
    stockPurchasesBetween: db.prepare(`SELECT m.*, i.name AS item_name, i.kind AS item_kind FROM stock_moves m
                                       JOIN stock_items i ON i.id = m.item_id
                                       WHERE m.ref_kind = 'purchase' AND m.at BETWEEN ? AND ? ORDER BY m.at, m.id`),
    hasBatches: db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'batches'"),
```

6. In the returned object, right before `close() {`, add:

```js
    // ---- Inventory (spec 2026-11-05-inventory-design.md 2). An item is { id, name, kind, unit, reorderAt, ingredient, lrmpNo,
    //      archived, lowSentAt }; a move { id, itemId, at, qty, unitCost, refKind, refId, note, total, supplier, useBy, roomId,
    //      reason, worker, counted, lotId, useBySentAt }. Batches writes its own 'batch' moves (contract section 7). ----

    // Every item, by name.
    stockItems() {
      return q.stockItems.all().map(stockItemOf);
    },

    // An item, or null.
    stockItem(id) {
      const r = q.stockItem.get(id);
      return r ? stockItemOf(r) : null;
    },

    // Whether another item (not `id`) has the name, case aside.
    stockNameUsed(name, id = null) {
      return Boolean(q.stockNameUsed.get(name, id));
    },

    // A new item: { name, kind, unit, reorderAt?, ingredient?, lrmpNo? } → the item. Throws on a name used (the unique index).
    insertStockItem({ name, kind, unit, reorderAt = null, ingredient = null, lrmpNo = null }) {
      return this.stockItem(Number(q.insertStockItem.run(name, kind, unit, reorderAt, ingredient, lrmpNo).lastInsertRowid));
    },

    // The item's fields as given (all of them: name, kind, unit, reorderAt, ingredient, lrmpNo, archived). → the item.
    updateStockItem(id, { name, kind, unit, reorderAt, ingredient, lrmpNo, archived }) {
      q.updateStockItem.run(name, kind, unit, reorderAt, ingredient, lrmpNo, archived ? 1 : 0, id);
      return this.stockItem(id);
    },

    // → true when an item went.
    deleteStockItem(id) {
      return q.deleteStockItem.run(id).changes > 0;
    },

    // When the item's Low message went (ms), or null once it is back over its level.
    setStockLowSent(id, at) {
      q.setStockLowSent.run(at, id);
    },

    // Every move, oldest first.
    stockMoves() {
      return q.stockMoves.all().map(stockMoveOf);
    },

    // The item's moves, oldest first.
    itemStockMoves(itemId) {
      return q.itemStockMoves.all(itemId).map(stockMoveOf);
    },

    // A move, or null.
    stockMove(id) {
      const r = q.stockMove.get(id);
      return r ? stockMoveOf(r) : null;
    },

    // New moves in one transaction: [{ itemId, at, qty, refKind, unitCost?, refId?, note?, total?, supplier?, useBy?, roomId?,
    // reason?, worker?, counted?, lotId? }] → the moves. One bad row writes none.
    insertStockMoves(list) {
      const ids = [];
      inTransaction(() => {
        for (const m of list) {
          ids.push(Number(q.insertStockMove.run(m.itemId, m.at, m.qty, m.unitCost ?? null, m.refKind, m.refId ?? null, m.note ?? null,
            m.total ?? null, m.supplier ?? null, m.useBy ?? null, m.roomId ?? null, m.reason ?? null, m.worker ?? null,
            m.counted ?? null, m.lotId ?? null).lastInsertRowid));
        }
      });
      return ids.map((id) => this.stockMove(id));
    },

    // A move's changeable fields as given (at, qty, unitCost, total, supplier, useBy, roomId, reason, worker, useBySentAt).
    // → the move.
    updateStockMove(id, m) {
      q.updateStockMove.run(m.at, m.qty, m.unitCost ?? null, m.total ?? null, m.supplier ?? null, m.useBy ?? null, m.roomId ?? null,
        m.reason ?? null, m.worker ?? null, m.useBySentAt ?? null, id);
      return this.stockMove(id);
    },

    // Deletes a move and the throw-outs taken from it (lot_id). → how many rows went.
    deleteStockMove(id) {
      return Number(q.deleteStockMove.run(id).changes);
    },

    // When the purchase's use-by message went (ms), or null.
    setStockUseBySent(id, at) {
      q.setStockUseBySent.run(at, id);
    },

    // The purchases made in [from, to] (ms), oldest first, each with its item's name and kind.
    stockPurchasesBetween(from, to) {
      return q.stockPurchasesBetween.all(from, to).map((r) => ({ ...stockMoveOf(r), name: r.item_name, kind: r.item_kind }));
    },

    // Batches' rooms: Map batch id → room id (null until its blocks go in), read from Batches' table when it is there.
    batchRooms(ids) {
      const out = new Map();
      if (!ids.length || !q.hasBatches.get()) return out;
      const rows = db.prepare(`SELECT id, room_id FROM batches WHERE id IN (${ids.map(() => '?').join(', ')})`).all(...ids);
      for (const r of rows) out.set(r.id, r.room_id);
      return out;
    },
```

(`inTransaction` already exists in `openDb`. `batchRooms` prepares its statement each call because the `batches` table may not exist when the database opens.)

- [ ] **Step 4: Run the new test**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-inventory.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Bring the version checks to 22**

Run: `grep -n "user_version').get().user_version, 20" tests/*.js`
In each line found, change `20` to `22` (the database is version 22 on this branch; the integrator sets it to the highest at merge, contract section 2). Then run:
`node --disable-warning=ExperimentalWarning --test tests/db*.test.js tests/controller-fresh-air.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/db.js tests/db-inventory.test.js tests/db-acfan.test.js tests/db-machines.test.js tests/db-programs.test.js tests/controller-fresh-air.test.js tests/db-usage.test.js
git commit -m "Inventory: stock_items and stock_moves in the version-22 step, with their database methods"
```

---

### Task 2: The figures (pure)

**Files:**
- Create: `server/inventory-math.js`
- Test: `tests/inventory-math.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/inventory-math.test.js`:

```js
// Inventory's figures (spec 2026-11-05-inventory-design.md 3 and 5.1): in stock, lots oldest purchase first, a throw-out off
// its own lot, the use-by states in the farm's day, Low, an item's view, the attention counts, the myGAP 4-5 rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stockOf, lotsOf, useByState, itemView, attentionOf, sheetRows, SOON_DAYS, KINDS, ITEM_UNITS, WHOLE_UNITS } from '../server/inventory-math.js';

const at = (date, hh = 12) => Date.parse(`${date}T${String(hh).padStart(2, '0')}:00:00+08:00`);
let next = 0;
const mv = (fields) => ({
  id: ++next, itemId: 1, at: 0, qty: 0, unitCost: null, refKind: 'use', refId: null, note: null, total: null, supplier: null,
  useBy: null, roomId: null, reason: null, worker: null, counted: null, lotId: null, useBySentAt: null, ...fields,
});
const ITEM = { id: 1, name: 'Spawn', kind: 'spawn', unit: 'kg', reorderAt: null, ingredient: null, lrmpNo: null, archived: false, lowSentAt: null };

test('the kinds, the units and the whole-number units', () => {
  assert.deepEqual(KINDS, ['blocks', 'spawn', 'bags', 'chemical', 'packaging', 'other']);
  assert.deepEqual(ITEM_UNITS, ['pcs', 'kg', 'g', 'L', 'mL']);
  assert.deepEqual(WHOLE_UNITS, ['pcs', 'g', 'mL', 'blocks']);
});

test('in stock is the sum of the moves, to 3 places, and may go under 0', () => {
  assert.equal(stockOf([]), 0);
  assert.equal(stockOf([mv({ qty: 0.1 }), mv({ qty: 0.2 })]), 0.3);
  assert.equal(stockOf([mv({ qty: 2 }), mv({ qty: -5 })]), -3);
});

test('outs come off the oldest lot first, each lot to 0 before the next', () => {
  const a = mv({ at: 1000, qty: 5, refKind: 'purchase' });
  const b = mv({ at: 2000, qty: 3, refKind: 'purchase', useBy: '2026-12-01' });
  const lots = lotsOf([b, mv({ at: 3000, qty: -6 }), a]);
  assert.deepEqual(lots.map((l) => [l.moveId, l.qty, l.left]), [[a.id, 5, 0], [b.id, 3, 2]]);
  assert.equal(lots[1].useBy, '2026-12-01');
  assert.equal(lots[1].refKind, 'purchase');
});

test('a batch receipt and a count that added are lots; a count that took away is an out', () => {
  const batch = mv({ at: 1000, qty: 100, refKind: 'batch', refId: 4 });
  const count = mv({ at: 2000, qty: 5, refKind: 'adjust', counted: 105 });
  const less = mv({ at: 3000, qty: -10, refKind: 'adjust', counted: 95 });
  assert.deepEqual(lotsOf([batch, count, less]).map((l) => [l.refKind, l.refId, l.left]), [['batch', 4, 90], ['adjust', null, 5]]);
});

test('a throw-out comes off its own lot first; any part beyond it joins the other outs', () => {
  const a = mv({ at: 1000, qty: 5, refKind: 'purchase' });
  const b = mv({ at: 2000, qty: 3, refKind: 'purchase', useBy: '2026-11-01' });
  assert.deepEqual(lotsOf([a, b, mv({ at: 3000, qty: -3, lotId: b.id, reason: 'Expired' })]).map((l) => l.left), [5, 0]);
  assert.deepEqual(lotsOf([a, b, mv({ at: 3000, qty: -4, lotId: b.id })]).map((l) => l.left), [4, 0]);
});

test('outs beyond every lot leave them all at 0', () => {
  assert.deepEqual(lotsOf([mv({ qty: 2, refKind: 'purchase' }), mv({ at: 5, qty: -9 })]).map((l) => l.left), [0]);
});

test('use-by: soon within 7 days (the day itself usable), expired after it, nothing further off', () => {
  assert.equal(SOON_DAYS, 7);
  assert.equal(useByState(null, '2026-11-05'), null);
  assert.equal(useByState('2026-11-13', '2026-11-05'), null);
  assert.equal(useByState('2026-11-12', '2026-11-05'), 'soon');
  assert.equal(useByState('2026-11-05', '2026-11-05'), 'soon');
  assert.equal(useByState('2026-11-04', '2026-11-05'), 'expired');
});

test("an item's view: in stock, Low at or under its level, last counted, its worst use-by and its lots with some left", () => {
  const now = at('2026-11-05', 9);
  const old = mv({ at: at('2026-10-01'), qty: 2, refKind: 'purchase', useBy: '2026-11-04' });
  const later = mv({ at: at('2026-11-01'), qty: 3, refKind: 'purchase', useBy: '2026-11-10' });
  const count = mv({ at: at('2026-11-02'), qty: 0, refKind: 'adjust', counted: 5 });
  const v = itemView({ ...ITEM, reorderAt: 5 }, [old, later, count], now);
  assert.equal(v.qty, 5);
  assert.equal(v.low, true);
  assert.equal(v.lastCountedAt, count.at);
  assert.deepEqual(v.useBy, { date: '2026-11-04', state: 'expired' });
  assert.deepEqual(v.lots.map((l) => [l.moveId, l.left, l.state]), [[old.id, 2, 'expired'], [later.id, 3, 'soon']]);
  assert.equal(v.name, 'Spawn');
  assert.equal(v.archived, false);
  assert.equal(itemView({ ...ITEM, reorderAt: 4 }, [old, later], now).low, false);
  assert.equal(itemView(ITEM, [], now).low, false, 'no level: never Low');
  assert.equal(itemView(ITEM, [], now).lastCountedAt, null);
  assert.equal(itemView(ITEM, [], now).useBy, null);
});

test("the use-by day is the farm's (UTC+8): 23:30 on 4 Nov in Malaysia is still 4 Nov", () => {
  const lot = mv({ at: at('2026-11-01'), qty: 1, refKind: 'purchase', useBy: '2026-11-04' });
  assert.equal(itemView(ITEM, [lot], Date.parse('2026-11-04T23:30:00+08:00')).useBy.state, 'soon');
  assert.equal(itemView(ITEM, [lot], Date.parse('2026-11-05T00:10:00+08:00')).useBy.state, 'expired');
});

test('attention counts the items not archived: low, a soon lot, an expired lot (each item by its worst)', () => {
  const v = (fields) => ({ archived: false, low: false, useBy: null, ...fields });
  assert.deepEqual(attentionOf([
    v({ low: true }), v({ useBy: { date: 'x', state: 'soon' } }), v({ low: true, useBy: { date: 'x', state: 'expired' } }),
    v({ archived: true, low: true }),
  ]), { low: 2, soon: 1, expired: 1 });
});

test('the 4-5 rows: chemical purchases and uses, oldest first, with the crops of the run, the room or none', () => {
  const items = new Map([
    [1, { ...ITEM, kind: 'chemical', name: 'Bleach', ingredient: 'Sodium hypochlorite', lrmpNo: 'LRMP 123', unit: 'L' }],
    [2, { ...ITEM, id: 2 }],
  ]);
  const rooms = new Map([[7, 'Container 1']]);
  const runs = [{ startedAt: at('2026-10-01'), endedAt: null, crops: [{ crop: 'oyster', blocks: 500 }, { crop: 'lionsmane', blocks: 100 }] }];
  const moves = [
    mv({ itemId: 1, at: at('2026-11-03'), qty: -1, refKind: 'use', roomId: 7, reason: 'Footbath', worker: 'Ali' }),
    mv({ itemId: 1, at: at('2026-11-01'), qty: 5, refKind: 'purchase', total: 25 }),
    mv({ itemId: 1, at: at('2026-11-04'), qty: -0.5, refKind: 'use', roomId: null, worker: 'Siti' }),
    mv({ itemId: 1, at: at('2026-11-04'), qty: -0.5, refKind: 'use', roomId: 99, worker: 'Siti' }),
    mv({ itemId: 2, at: at('2026-11-02'), qty: 1, refKind: 'purchase', total: 9 }),
    mv({ itemId: 1, at: at('2026-11-02'), qty: 2, refKind: 'adjust', counted: 6 }),
  ];
  const names = { oyster: 'Grey oyster', lionsmane: "Lion's mane" };
  const rows = sheetRows(moves, { items, rooms, runsOf: (id) => (id === 7 ? runs : []), cropName: (c) => names[c] });
  assert.deepEqual(rows.map((r) => [r.date, r.kind, r.crop, r.location, r.qty, r.price, r.reason, r.operator]), [
    ['2026-11-01', 'purchase', '', '', 5, 25, '', ''],
    ['2026-11-03', 'use', "Grey oyster, Lion's mane", 'Container 1', 1, null, 'Footbath', 'Ali'],
    ['2026-11-04', 'use', '', 'Not in a room', 0.5, null, '', 'Siti'],
    ['2026-11-04', 'use', '', 'A deleted room', 0.5, null, '', 'Siti'],
  ]);
  assert.equal(rows[0].product, 'Bleach (Sodium hypochlorite)');
  assert.equal(rows[0].lrmpNo, 'LRMP 123');
  assert.equal(rows[0].unit, 'L');
});

test('a use in a room with no run at that moment has no crop', () => {
  const items = new Map([[1, { ...ITEM, kind: 'chemical', name: 'Bleach', unit: 'L' }]]);
  const runs = [{ startedAt: at('2026-11-10'), endedAt: null, crops: [{ crop: 'oyster', blocks: 1 }] }];
  const rows = sheetRows([mv({ itemId: 1, at: at('2026-11-03'), qty: -1, roomId: 7 })], { items, rooms: new Map([[7, 'Room']]), runsOf: () => runs, cropName: (c) => c });
  assert.equal(rows[0].crop, '');
  assert.equal(rows[0].product, 'Bleach');
  assert.equal(rows[0].lrmpNo, '');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory-math.test.js`
Expected: FAIL (`Cannot find module '../server/inventory-math.js'`).

- [ ] **Step 3: Write `server/inventory-math.js`**

```js
// Inventory's figures (spec 2026-11-05-inventory-design.md 3 and 5.1): in stock, the lots (oldest purchase first), the use-by
// states, Low, an item's view, the attention counts and the myGAP 4-5 rows. Pure: no database, no clock.

import { localDate, daysBetween } from './task-rules.js';

export const KINDS = ['blocks', 'spawn', 'bags', 'chemical', 'packaging', 'other'];
// The units of an item made on the page; 'blocks' is the unit of Batches' block items alone.
export const ITEM_UNITS = ['pcs', 'kg', 'g', 'L', 'mL'];
// The units counted in whole numbers (kg and L take 2 decimals).
export const WHOLE_UNITS = ['pcs', 'g', 'mL', 'blocks'];
export const SOON_DAYS = 7;

export const round3 = (n) => Math.round(n * 1000) / 1000;
const byTime = (a, b) => a.at - b.at || a.id - b.id;

// The item's moves summed (may be under 0: a use recorded beyond the records, put right by a count).
export const stockOf = (moves) => round3(moves.reduce((sum, m) => sum + m.qty, 0));

// The item's lots: each in-move (a purchase, a batch receipt, a count that added) in time order, with what is left of it.
// A throw-out (a use with lotId) comes off its own lot first; every other out, and any part of a throw-out beyond its lot,
// comes off the lots oldest first, each to 0 before the next. → [{ moveId, at, qty, left, useBy, refKind, refId }], those
// with nothing left included.
export function lotsOf(moves) {
  const sorted = [...moves].sort(byTime);
  const lots = sorted.filter((m) => m.qty > 0).map((m) => ({
    moveId: m.id, at: m.at, qty: m.qty, left: m.qty, useBy: m.useBy ?? null, refKind: m.refKind, refId: m.refId ?? null,
  }));
  const byId = new Map(lots.map((l) => [l.moveId, l]));
  let rest = 0;
  for (const m of sorted) {
    if (m.qty >= 0) continue;
    let out = -m.qty;
    const own = m.lotId === null || m.lotId === undefined ? null : byId.get(m.lotId);
    if (own) {
      const take = Math.min(own.left, out);
      own.left = round3(own.left - take);
      out = round3(out - take);
    }
    rest = round3(rest + out);
  }
  for (const lot of lots) {
    if (rest <= 0) break;
    const take = Math.min(lot.left, rest);
    lot.left = round3(lot.left - take);
    rest = round3(rest - take);
  }
  return lots;
}

// A lot's use-by on the farm's day `today`: 'soon' from SOON_DAYS before it to the day itself, 'expired' after, else null.
export function useByState(useBy, today) {
  if (!useBy) return null;
  const days = daysBetween(today, useBy);
  if (days < 0) return 'expired';
  return days <= SOON_DAYS ? 'soon' : null;
}

const WORST = { expired: 0, soon: 1 };

// An item with its figures at `now` (ms): { id, name, kind, unit, reorderAt, ingredient, lrmpNo, archived, qty, low,
// lastCountedAt, useBy: { date, state } | null (the worst of its lots: expired before soon, then the earliest), lots: the
// lots with some left, each with its state }.
export function itemView(item, moves, now) {
  const today = localDate(now);
  const qty = stockOf(moves);
  const lots = lotsOf(moves).filter((l) => l.left > 0).map((l) => ({ ...l, state: useByState(l.useBy, today) }));
  const counted = moves.filter((m) => m.refKind === 'adjust' && m.counted !== null && m.counted !== undefined).map((m) => m.at);
  const dated = lots.filter((l) => l.state).sort((a, b) => WORST[a.state] - WORST[b.state] || a.useBy.localeCompare(b.useBy));
  return {
    id: item.id, name: item.name, kind: item.kind, unit: item.unit, reorderAt: item.reorderAt, ingredient: item.ingredient,
    lrmpNo: item.lrmpNo, archived: item.archived, qty, low: item.reorderAt !== null && qty <= item.reorderAt,
    lastCountedAt: counted.length ? Math.max(...counted) : null,
    useBy: dated.length ? { date: dated[0].useBy, state: dated[0].state } : null,
    lots,
  };
}

// How many items not archived are low, have a soon lot (their worst), have an expired lot.
export function attentionOf(views) {
  const out = { low: 0, soon: 0, expired: 0 };
  for (const v of views) {
    if (v.archived) continue;
    if (v.low) out.low += 1;
    if (v.useBy?.state === 'soon') out.soon += 1;
    if (v.useBy?.state === 'expired') out.expired += 1;
  }
  return out;
}

// The myGAP 4-5 rows (spec 5.1): the chemical items' purchases and uses among `moves`, oldest first. items: Map id → item;
// rooms: Map id → name; runsOf(roomId) → that room's runs ({ startedAt, endedAt, crops: [{ crop }] }); cropName(crop) → its
// short name. → [{ moveId, date, kind: 'purchase' | 'use', crop, location, product, lrmpNo, price, qty, unit, reason,
// operator }]; the web formats them.
export function sheetRows(moves, { items, rooms, runsOf, cropName }) {
  return moves
    .filter((m) => items.get(m.itemId)?.kind === 'chemical' && (m.refKind === 'purchase' || m.refKind === 'use'))
    .sort(byTime)
    .map((m) => {
      const item = items.get(m.itemId);
      const bought = m.refKind === 'purchase';
      const run = bought || m.roomId === null ? null
        : runsOf(m.roomId).find((r) => r.startedAt <= m.at && (r.endedAt === null || m.at < r.endedAt)) ?? null;
      return {
        moveId: m.id, date: localDate(m.at), kind: bought ? 'purchase' : 'use',
        crop: run ? run.crops.map((c) => cropName(c.crop)).join(', ') : '',
        location: bought ? '' : m.roomId === null ? 'Not in a room' : rooms.get(m.roomId) ?? 'A deleted room',
        product: item.ingredient ? `${item.name} (${item.ingredient})` : item.name,
        lrmpNo: item.lrmpNo ?? '', price: bought ? m.total : null, qty: Math.abs(m.qty), unit: item.unit,
        reason: bought ? '' : m.reason ?? '', operator: bought ? '' : m.worker ?? '',
      };
    });
}
```

- [ ] **Step 4: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory-math.test.js`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add server/inventory-math.js tests/inventory-math.test.js
git commit -m "Inventory: the figures (in stock, lots oldest purchase first, use-by, Low, attention, the 4-5 rows)"
```

---

### Task 3: The formatter (web, pure; the server's messages use it too)

**Files:**
- Create: `web/inventory-math.js`
- Test: `tests/web-inventory-math.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/web-inventory-math.test.js`:

```js
// Inventory's one formatter (spec 2026-11-05-inventory-design.md 5 Numbers): a qty with its unit, RM, the price per unit,
// a farm day.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qtyText, rmText, perUnitText, dayText, longDayText } from '../web/inventory-math.js';

const plain = (s) => s.replace(/ /g, ' ');

test('a qty: whole units whole, kg and L to 2 decimals, grouped, a true minus, + only when asked', () => {
  assert.equal(plain(qtyText(120, 'pcs')), '120 pcs');
  assert.equal(plain(qtyText(1234, 'blocks')), '1,234 blocks');
  assert.equal(plain(qtyText(250, 'g')), '250 g');
  assert.equal(plain(qtyText(3.5, 'L')), '3.50 L');
  assert.equal(plain(qtyText(0.25, 'kg')), '0.25 kg');
  assert.equal(plain(qtyText(-2, 'L')), '−2.00 L');
  assert.equal(plain(qtyText(5, 'L', { signed: true })), '+5.00 L');
  assert.equal(plain(qtyText(0, 'L', { signed: true })), '0.00 L');
  assert.equal(plain(qtyText(-0.001, 'L')), '0.00 L', 'no minus on a figure that shows as 0');
  assert.equal(qtyText(null, 'L'), '—');
  assert.ok(qtyText(3.5, 'L').includes(' '), 'the unit keeps to its number');
});

test('RM to 2 places with grouping', () => {
  assert.equal(plain(rmText(1240.5)), 'RM 1,240.50');
  assert.equal(plain(rmText(0)), 'RM 0.00');
  assert.equal(rmText(null), '—');
});

test('the price per unit: 2 places from RM 0.10, two significant digits below, never a false 0', () => {
  assert.equal(plain(perUnitText(25, 3, 'L')), 'RM 8.33 per L');
  assert.equal(plain(perUnitText(4, 100, 'pcs')), 'RM 0.04 per piece');
  assert.equal(plain(perUnitText(3.5, 1000, 'mL')), 'RM 0.0035 per mL');
  assert.equal(plain(perUnitText(0.01, 1000, 'g')), 'under RM 0.0001 per g');
  assert.equal(plain(perUnitText(0, 5, 'kg')), 'RM 0.00 per kg');
  assert.equal(perUnitText(25, 0, 'L'), '');
  assert.equal(perUnitText(NaN, 3, 'L'), '');
});

test('a farm day in words', () => {
  assert.equal(dayText('2026-11-12'), '12 Nov');
  assert.equal(longDayText('2026-11-12'), '12 Nov 2026');
  assert.equal(dayText('nonsense'), '—');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-math.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `web/inventory-math.js` (its first part)**

```js
// Inventory's one formatter and the pages' pure parts (spec 2026-11-05-inventory-design.md 5): a qty with its unit, RM, the
// price per unit, a farm day; the pills, the words and the dialogs' bodies (below). A number keeps its unit at a wrap (a
// no-break space, as the Units Rule has it). server/inventory-alerts.js uses the formatter for its messages.

const NB = ' ';
const DASH = '—';
const MINUS = '−';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const grouped = (n, min, max = min) => n.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });

// The units counted in whole numbers (kg and L take 2 decimals): as server/inventory-math.js WHOLE_UNITS.
export const WHOLE_UNITS = ['pcs', 'g', 'mL', 'blocks'];
// "per piece", "per block"; the others by their symbol.
const ONE = { pcs: 'piece', blocks: 'block' };

// "3.50 L", "120 pcs", "−2.00 L"; signed: "+5.00 L" for an in-move. A figure that shows as 0 has no sign.
export function qtyText(qty, unit, { signed = false } = {}) {
  if (!finite(qty)) return DASH;
  const places = WHOLE_UNITS.includes(unit) ? 0 : 2;
  const shown = grouped(Math.abs(qty), places);
  const zero = Number(shown.replace(/,/g, '')) === 0;
  const sign = zero ? '' : qty < 0 ? MINUS : signed ? '+' : '';
  return `${sign}${shown}${NB}${unit}`;
}

// "RM 1,240.50".
export const rmText = (v) => (finite(v) ? `RM${NB}${grouped(v, 2)}` : DASH);

// What one unit cost: "RM 8.33 per L"; under RM 0.10 its first two significant digits up to 4 decimals ("RM 0.0035 per
// mL"), under RM 0.0001 "under RM 0.0001 per g", as Harvest's cost per kg. '' without a qty.
export function perUnitText(total, qty, unit) {
  if (!finite(total) || !finite(qty) || qty <= 0) return '';
  const p = total / qty;
  const per = `per${NB}${ONE[unit] ?? unit}`;
  if (p > 0 && p < 0.0001) return `under${NB}RM${NB}0.0001 ${per}`;
  const text = p === 0 || p >= 0.1 ? grouped(p, 2) : grouped(p, 2, Math.min(4, 1 - Math.floor(Math.log10(p))));
  return `RM${NB}${text} ${per}`;
}

const dateParts = (date) => /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
// "12 Nov" and "12 Nov 2026" from 'YYYY-MM-DD'.
export function dayText(date) {
  const m = dateParts(date);
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}` : DASH;
}
export function longDayText(date) {
  const m = dateParts(date);
  return m && MONTHS[Number(m[2]) - 1] ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : DASH;
}
```

Note on `perUnitText(4, 100, 'pcs')`: p = 0.04, `1 - floor(log10(0.04))` = 3 decimals at most, `grouped(0.04, 2, 3)` = "0.04". For 0.0035: max 4 → "0.0035".

- [ ] **Step 4: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-math.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/inventory-math.js tests/web-inventory-math.test.js
git commit -m "Inventory: the one formatter (qty with its unit, RM, the price per unit, a farm day)"
```

---

### Task 4: The store: items and the views

**Files:**
- Create: `server/inventory.js`
- Test: `tests/inventory.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/inventory.test.js`:

```js
// The inventory store (spec 2026-11-05-inventory-design.md 4 and 7): items, the list and an item's page; purchases, uses,
// edits, deletes and throw-outs; counts, the purchases for Costs and the 4-5 sheet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createInventory } from '../server/inventory.js';

const NOW = Date.parse('2026-11-05T09:00:00+08:00');
const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let now = NOW;
  const inv = createInventory({ db, now: () => now });
  const told = [];
  inv.onChange((id) => told.push(id));
  return { db, inv, told, setNow: (ms) => { now = ms; } };
}

// For assert.throws: a refusal with that status and (when given) that field.
const refused = (status, field) => (err) => err.status === status && (field === undefined || err.field === field);

test('an item is added with its checks; a chemical keeps its ingredient and LRMP No., another kind does not', (t) => {
  const { inv, told } = setup(t);
  const bleach = inv.addItem({ name: '  Bleach ', kind: 'chemical', unit: 'L', reorderAt: 2, ingredient: 'Sodium hypochlorite', lrmpNo: 'LRMP 1' });
  assert.equal(bleach.name, 'Bleach');
  assert.equal(bleach.qty, 0);
  assert.equal(bleach.low, true, '0 is at or under 2');
  assert.equal(bleach.ingredient, 'Sodium hypochlorite');
  assert.equal(bleach.lrmpNo, 'LRMP 1');
  assert.deepEqual(told, [bleach.id]);
  const bags = inv.addItem({ name: 'Grow bags', kind: 'bags', unit: 'pcs', ingredient: 'x' });
  assert.equal(bags.ingredient, null);
  assert.equal(bags.reorderAt, null);
  assert.throws(() => inv.addItem({ name: 'bleach', kind: 'chemical', unit: 'L' }), refused(400, 'name'));
  assert.throws(() => inv.addItem({ name: '', kind: 'chemical', unit: 'L' }), refused(400, 'name'));
  assert.throws(() => inv.addItem({ name: 'x'.repeat(61), kind: 'other', unit: 'L' }), refused(400, 'name'));
  assert.throws(() => inv.addItem({ name: 'Blocks', kind: 'blocks', unit: 'blocks' }), refused(400, 'kind'));
  assert.throws(() => inv.addItem({ name: 'Diesel', kind: 'fuel', unit: 'L' }), refused(400, 'kind'));
  assert.throws(() => inv.addItem({ name: 'Diesel', kind: 'other', unit: 'gallon' }), refused(400, 'unit'));
  assert.throws(() => inv.addItem({ name: 'Punnets', kind: 'packaging', unit: 'pcs', reorderAt: 1.5 }), refused(400, 'reorderAt'));
  assert.throws(() => inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg', reorderAt: 1.234 }), refused(400, 'reorderAt'));
  assert.throws(() => inv.addItem(null), refused(400));
});

test('the list: by kind in the contract order, then name; attention; archived items hidden unless asked', (t) => {
  const { db, inv } = setup(t);
  inv.addItem({ name: 'Punnets', kind: 'packaging', unit: 'pcs' });
  inv.addItem({ name: 'bleach', kind: 'chemical', unit: 'L', reorderAt: 1 });
  inv.addItem({ name: 'Alcohol', kind: 'chemical', unit: 'L' });
  db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  const old = inv.addItem({ name: 'Old cleaner', kind: 'chemical', unit: 'L', reorderAt: 1 });
  inv.editItem(old.id, { archived: true });
  const list = inv.list();
  assert.deepEqual(list.items.map((i) => i.name), ['Grey oyster blocks', 'Alcohol', 'bleach', 'Punnets']);
  assert.deepEqual(list.attention, { low: 1, soon: 0, expired: 0 });
  assert.equal(list.archivedCount, 1);
  assert.equal('lots' in list.items[0], false);
  assert.deepEqual(list.suppliers, []);
  assert.deepEqual(inv.list({ archived: true }).items.map((i) => i.name), ['Grey oyster blocks', 'Alcohol', 'bleach', 'Old cleaner', 'Punnets']);
});

test('edit: name, kind, level; the unit only while the item has no records; a block item only its level', (t) => {
  const { db, inv } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const changed = inv.editItem(spawn.id, { name: 'Grey oyster spawn', unit: 'g', reorderAt: 500 });
  assert.equal(changed.name, 'Grey oyster spawn');
  assert.equal(changed.unit, 'g');
  assert.equal(changed.reorderAt, 500);
  assert.equal(inv.editItem(spawn.id, { kind: 'chemical', ingredient: 'Ethanol' }).ingredient, 'Ethanol');
  assert.equal(inv.editItem(spawn.id, { kind: 'other' }).ingredient, null, 'not a chemical: no ingredient');
  db.insertStockMoves([{ itemId: spawn.id, at: NOW, qty: 5, refKind: 'adjust', counted: 5 }]);
  assert.throws(() => inv.editItem(spawn.id, { unit: 'kg' }), refused(409, 'unit'));
  assert.equal(inv.editItem(spawn.id, { unit: 'g', reorderAt: null }).reorderAt, null, 'the same unit is fine');
  assert.throws(() => inv.editItem(spawn.id, { archived: 'yes' }), refused(400, 'archived'));
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  assert.equal(inv.editItem(blocks.id, { reorderAt: 200 }).reorderAt, 200);
  assert.throws(() => inv.editItem(blocks.id, { name: 'Blocks' }), refused(409));
  assert.throws(() => inv.editItem(blocks.id, { archived: true }), refused(409));
  assert.throws(() => inv.editItem(999, { name: 'x' }), refused(404));
});

test('delete: only an item with no records; else archive it', (t) => {
  const { db, inv, told } = setup(t);
  const a = inv.addItem({ name: 'A', kind: 'other', unit: 'pcs' });
  const b = inv.addItem({ name: 'B', kind: 'other', unit: 'pcs' });
  db.insertStockMoves([{ itemId: b.id, at: NOW, qty: 1, refKind: 'adjust', counted: 1 }]);
  inv.removeItem(a.id);
  assert.equal(db.stockItem(a.id), null);
  assert.equal(told.at(-1), a.id);
  assert.throws(() => inv.removeItem(b.id), refused(409));
  assert.throws(() => inv.removeItem(a.id), refused(404));
});

test("an item's page: its view, its lots, its moves newest first with their rooms, the earlier suppliers and reasons", (t) => {
  const { db, inv } = setup(t);
  const room = db.createRoom(ROOM, 1000);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  db.insertStockMoves([
    { itemId: bleach.id, at: NOW - 3000, qty: 5, refKind: 'purchase', total: 25, unitCost: 5, supplier: 'Kedai Ali' },
    { itemId: bleach.id, at: NOW - 2000, qty: -1, refKind: 'use', roomId: room.id, reason: 'Footbath', worker: 'Ali' },
    { itemId: bleach.id, at: NOW - 1000, qty: -1, refKind: 'use', roomId: 999, reason: 'footbath', worker: 'Ali' },
  ]);
  const page = inv.item(bleach.id);
  assert.equal(page.qty, 3);
  assert.deepEqual(page.lots.map((l) => l.left), [3]);
  assert.deepEqual(page.moves.map((m) => [m.refKind, m.roomName]), [['use', null], ['use', 'Container 1'], ['purchase', null]]);
  assert.equal(page.moves[0].roomId, 999, 'a deleted room keeps its id; the page says so');
  assert.equal('useBySentAt' in page.moves[0], false);
  assert.deepEqual(page.suppliers, ['Kedai Ali']);
  assert.deepEqual(page.reasons, ['footbath'], 'the latest spelling, once');
  assert.deepEqual(inv.list().suppliers, ['Kedai Ali']);
  assert.throws(() => inv.item(999), refused(404));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `server/inventory.js`**

```js
// Inventory (spec 2026-11-05-inventory-design.md 4 and 7): stock items, purchases, uses, counts and throw-outs with their
// checks, and the views the routes send. Batch moves are Batches' (contract section 7): shown, never written or changed
// here. No HTTP.

import { localDate, dayStart, addDays } from './task-rules.js';
import { checkWorker } from './tasks.js';
import { cropShortName } from '../web/crops.js';
import { KINDS, ITEM_UNITS, WHOLE_UNITS, itemView, attentionOf, sheetRows, stockOf, round3 } from './inventory-math.js';

export const MAX_QTY = 100_000;
export const MAX_TOTAL = 1_000_000;
export const MAX_TEXT = 60;
export const BACK_DAYS = 400;
export const SHEET_DAYS = [30, 90, 365];
const MAX_COUNTS = 500;
const SUGGESTED = 20; // earlier suppliers and reasons offered in the dialogs
const DAY_MS = 86_400_000;
const NOON_MS = 12 * 3_600_000;
const MOVE_FIELDS = ['id', 'at', 'qty', 'refKind', 'refId', 'note', 'total', 'unitCost', 'supplier', 'useBy', 'roomId', 'reason', 'worker', 'counted', 'lotId'];

// A refused request: status 400, 404 or 409, field the input it is about (the routes reply { error, field }).
export class InventoryError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'InventoryError';
    this.status = status;
    this.field = field;
  }
}

const bodyOf = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new InventoryError(400, 'Body must be a JSON object');
  return body;
};
const given = (v) => v !== undefined;
// A real farm day, 'YYYY-MM-DD'.
const isDay = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && localDate(dayStart(s)) === s;

// A short text: trimmed, up to MAX_TEXT characters, no control characters; empty is null (refused when required).
function textOf(v, field, label, required = false) {
  const s = typeof v === 'string' ? v.trim() : v;
  if (s === undefined || s === null || s === '') {
    if (required) throw new InventoryError(400, `Give the ${label}`, field);
    return null;
  }
  if (typeof s !== 'string' || s.length > MAX_TEXT || /[\u0000-\u001f\u007f]/.test(s)) {
    throw new InventoryError(400, `The ${label} must be text of at most ${MAX_TEXT} characters`, field);
  }
  return s;
}

// A qty in the item's unit: whole numbers for pcs, g, mL and blocks, up to 2 decimals for kg and L; over 0 (from 0 for a
// count or a reorder level) up to MAX_QTY.
function qtyOf(v, unit, field = 'qty', { zero = false } = {}) {
  const places = WHOLE_UNITS.includes(unit) ? 0 : 2;
  const scaled = typeof v === 'number' && Number.isFinite(v) ? v * 10 ** places : NaN;
  const fits = Math.abs(scaled - Math.round(scaled)) < 1e-6;
  if (!(fits && (zero ? v >= 0 : v > 0) && v <= MAX_QTY)) {
    const from = zero ? 'from 0' : 'over 0';
    throw new InventoryError(400, places
      ? `Give the ${unit} as a number ${from} up to 100,000, at most 2 decimals`
      : `Give a whole number of ${unit} ${from} up to 100,000`, field);
  }
  return Math.round(scaled) / 10 ** places;
}

const reorderOf = (v, unit) => (v === null || v === undefined ? null : qtyOf(v, unit, 'reorderAt', { zero: true }));

// The total paid: RM 0 to MAX_TOTAL, at most 2 decimals.
function totalOf(v) {
  const ok = typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= MAX_TOTAL && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;
  if (!ok) throw new InventoryError(400, 'Give the total paid in RM, from 0 to 1,000,000', 'total');
  return Math.round(v * 100) / 100;
}

const unitCost = (total, qty) => Math.round((total / qty) * 1e6) / 1e6;
const byKindThenName = (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });

// The first SUGGESTED different texts (case aside), in the order given.
function distinct(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length === SUGGESTED) break;
  }
  return out;
}

// db: the farm database; now injectable. onChange(fn(itemId)) hears every write (itemId of the item it was about).
export function createInventory({ db, now = Date.now, log = console.error }) {
  const listeners = new Set();
  function tell(itemId) {
    for (const fn of [...listeners]) {
      try { fn(itemId); } catch (err) { log(err); }
    }
  }
  const today = () => localDate(now());

  function itemOf(id) {
    const item = Number.isInteger(id) ? db.stockItem(id) : null;
    if (!item) throw new InventoryError(404, 'No such item');
    return item;
  }
  function moveOf(id) {
    const m = Number.isInteger(id) ? db.stockMove(id) : null;
    if (!m) throw new InventoryError(404, 'No such record');
    return m;
  }
  const roomNames = () => new Map(db.listRooms().map((r) => [r.id, r.name]));
  // Every move, by item.
  function movesByItem() {
    const by = new Map();
    for (const m of db.stockMoves()) {
      if (!by.has(m.itemId)) by.set(m.itemId, []);
      by.get(m.itemId).push(m);
    }
    return by;
  }
  // The suppliers of earlier purchases (any item), newest first.
  const suppliers = () => distinct(db.stockMoves().filter((m) => m.refKind === 'purchase').reverse().map((m) => m.supplier));

  // ---- views ----

  // The list: { items (no lots), attention, archivedCount, suppliers }; archived items only when asked.
  function list({ archived = false } = {}) {
    const by = movesByItem();
    const views = db.stockItems().map((item) => itemView(item, by.get(item.id) ?? [], now()));
    return {
      items: views.filter((v) => archived || !v.archived).sort(byKindThenName).map(({ lots, ...v }) => v),
      attention: attentionOf(views),
      archivedCount: views.filter((v) => v.archived).length,
      suppliers: suppliers(),
    };
  }

  // An item's page: its view with its lots, its moves newest first (roomName: a use's room; a batch move's, its batch's room
  // when Batches' table is there; null for none or a deleted room), the earlier suppliers and the item's earlier reasons.
  function item(id) {
    const it = itemOf(id);
    const moves = db.itemStockMoves(it.id);
    const rooms = roomNames();
    const batchIds = [...new Set(moves.filter((m) => m.refKind === 'batch' && m.refId !== null).map((m) => m.refId))];
    const batchRooms = db.batchRooms(batchIds);
    const roomName = (m) => {
      const roomId = m.refKind === 'batch' ? batchRooms.get(m.refId) ?? null : m.roomId;
      return roomId === null ? null : rooms.get(roomId) ?? null;
    };
    return {
      ...itemView(it, moves, now()),
      moves: moves.slice().reverse().map((m) => ({ ...Object.fromEntries(MOVE_FIELDS.map((f) => [f, m[f]])), roomName: roomName(m) })),
      suppliers: suppliers(),
      reasons: distinct(moves.filter((m) => m.refKind === 'use' && m.lotId === null).reverse().map((m) => m.reason)),
    };
  }

  // ---- items ----

  function nameOf(v, id = null) {
    const name = textOf(v, 'name', 'name', true);
    if (db.stockNameUsed(name, id)) throw new InventoryError(400, `There is already an item called ${name}`, 'name');
    return name;
  }
  function kindOf(v) {
    if (!KINDS.includes(v) || v === 'blocks') throw new InventoryError(400, 'Pick a kind', 'kind');
    return v;
  }
  function unitOf(v) {
    if (!ITEM_UNITS.includes(v)) throw new InventoryError(400, 'Pick a unit', 'unit');
    return v;
  }
  const ingredientOf = (v) => textOf(v, 'ingredient', 'active ingredient');
  const lrmpOf = (v) => textOf(v, 'lrmpNo', 'LRMP No.');

  // { name, kind (not blocks), unit, reorderAt?, ingredient?, lrmpNo? } → the item's view.
  function addItem(body) {
    const b = bodyOf(body);
    const name = nameOf(b.name);
    const kind = kindOf(b.kind);
    const unit = unitOf(b.unit);
    const chemical = kind === 'chemical';
    const made = db.insertStockItem({
      name, kind, unit, reorderAt: reorderOf(b.reorderAt, unit),
      ingredient: chemical ? ingredientOf(b.ingredient) : null, lrmpNo: chemical ? lrmpOf(b.lrmpNo) : null,
    });
    tell(made.id);
    return itemView(made, [], now());
  }

  // Any of name, kind, unit (only while the item has no moves), reorderAt, ingredient, lrmpNo, archived. A block item
  // (Batches') takes its reorder level only. → the item's view.
  function editItem(id, body) {
    const it = itemOf(id);
    const b = bodyOf(body);
    const moves = db.itemStockMoves(it.id);
    if (it.kind === 'blocks') {
      if (['name', 'kind', 'unit', 'ingredient', 'lrmpNo', 'archived'].some((k) => given(b[k]))) {
        throw new InventoryError(409, "A block item is Batches': only its reorder level changes here");
      }
      const saved = db.updateStockItem(it.id, { ...it, reorderAt: given(b.reorderAt) ? reorderOf(b.reorderAt, it.unit) : it.reorderAt });
      tell(it.id);
      return itemView(saved, moves, now());
    }
    const kind = given(b.kind) ? kindOf(b.kind) : it.kind;
    const unit = given(b.unit) ? unitOf(b.unit) : it.unit;
    if (unit !== it.unit && moves.length) throw new InventoryError(409, 'The unit cannot change once the item has records', 'unit');
    if (given(b.archived) && typeof b.archived !== 'boolean') throw new InventoryError(400, 'Archived must be true or false', 'archived');
    const chemical = kind === 'chemical';
    const saved = db.updateStockItem(it.id, {
      name: given(b.name) ? nameOf(b.name, it.id) : it.name, kind, unit,
      reorderAt: reorderOf(given(b.reorderAt) ? b.reorderAt : it.reorderAt, unit),
      ingredient: !chemical ? null : given(b.ingredient) ? ingredientOf(b.ingredient) : it.ingredient,
      lrmpNo: !chemical ? null : given(b.lrmpNo) ? lrmpOf(b.lrmpNo) : it.lrmpNo,
      archived: given(b.archived) ? b.archived : it.archived,
    });
    tell(it.id);
    return itemView(saved, moves, now());
  }

  // Only an item with no moves (else archive it).
  function removeItem(id) {
    const it = itemOf(id);
    if (db.itemStockMoves(it.id).length) throw new InventoryError(409, 'Archive it instead: it has records');
    db.deleteStockItem(it.id);
    tell(it.id);
  }

  return {
    list, item, addItem, editItem, removeItem,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
```

(The imports `addDays`, `cropShortName`, `sheetRows`, `stockOf`, `round3` and the constants `MAX_COUNTS`, `DAY_MS`, `NOON_MS` are used by Tasks 5 and 6.)

- [ ] **Step 4: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/inventory.js tests/inventory.test.js
git commit -m "Inventory: the store's items, the list and an item's page"
```

---

### Task 5: The store: purchases, uses, edits, deletes and throw-outs

**Files:**
- Modify: `server/inventory.js`
- Test: `tests/inventory.test.js` (append)

- [ ] **Step 1: Append the failing tests**

Append to `tests/inventory.test.js`:

```js
test('a purchase: qty in the unit, the total, the price per unit, the supplier, a use-by, the day', (t) => {
  const { inv, told } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const today = inv.purchase({ itemId: bleach.id, qty: 3, total: 25, supplier: ' Kedai Ali ', useBy: '2026-12-01' });
  assert.equal(today.at, NOW);
  assert.equal(today.qty, 3);
  assert.equal(today.unitCost, 8.333333);
  assert.equal(today.supplier, 'Kedai Ali');
  assert.equal(today.refKind, 'purchase');
  assert.equal(told.at(-1), bleach.id);
  const back = inv.purchase({ itemId: bleach.id, qty: 1.25, total: 0, day: '2026-11-01' });
  assert.equal(back.at, Date.parse('2026-11-01T12:00:00+08:00'));
  assert.equal(back.unitCost, 0);
  assert.equal(back.useBy, null);
  for (const [body, field] of [
    [{ qty: 0, total: 1 }, 'qty'], [{ qty: 1.234, total: 1 }, 'qty'], [{ qty: 100_001, total: 1 }, 'qty'], [{ qty: '3', total: 1 }, 'qty'],
    [{ qty: 1, total: -1 }, 'total'], [{ qty: 1, total: 1.005 }, 'total'], [{ qty: 1, total: null }, 'total'],
    [{ qty: 1, total: 1, day: '2026-11-06' }, 'day'], [{ qty: 1, total: 1, day: '2025-09-30' }, 'day'], [{ qty: 1, total: 1, day: '2026-02-30' }, 'day'],
    [{ qty: 1, total: 1, day: '2026-11-03', useBy: '2026-11-02' }, 'useBy'], [{ qty: 1, total: 1, useBy: 'soon' }, 'useBy'],
    [{ qty: 1, total: 1, supplier: 'x'.repeat(61) }, 'supplier'],
  ]) assert.throws(() => inv.purchase({ itemId: bleach.id, ...body }), refused(400, field), JSON.stringify(body));
  assert.throws(() => inv.purchase({ itemId: 999, qty: 1, total: 1 }), refused(404));
  const bags = inv.addItem({ name: 'Bags', kind: 'bags', unit: 'pcs' });
  assert.throws(() => inv.purchase({ itemId: bags.id, qty: 1.5, total: 1 }), refused(400, 'qty'));
});

test('no purchase of a block item (Batches brings blocks in); nothing new on an archived item', (t) => {
  const { db, inv } = setup(t);
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  assert.throws(() => inv.purchase({ itemId: blocks.id, qty: 10, total: 10 }), refused(409));
  const old = inv.addItem({ name: 'Old', kind: 'other', unit: 'pcs' });
  inv.editItem(old.id, { archived: true });
  assert.throws(() => inv.purchase({ itemId: old.id, qty: 1, total: 1 }), refused(409));
  assert.throws(() => inv.use({ itemId: old.id, qty: 1, worker: 'Ali' }), refused(409));
});

test('a use: taken off, with the room, the reason and who; more than in stock is allowed', (t) => {
  const { db, inv } = setup(t);
  const room = db.createRoom(ROOM, 1000);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const used = inv.use({ itemId: bleach.id, qty: 2, roomId: room.id, reason: 'Footbath', worker: 'Ali' });
  assert.equal(used.qty, -2);
  assert.equal(used.roomId, room.id);
  assert.equal(used.reason, 'Footbath');
  assert.equal(used.worker, 'Ali');
  assert.equal(used.at, NOW);
  assert.equal(inv.item(bleach.id).qty, -2);
  const back = inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', at: NOW - 3_600_000 });
  assert.equal(back.at, NOW - 3_600_000);
  assert.equal(back.roomId, null);
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  assert.equal(inv.use({ itemId: blocks.id, qty: 12, reason: 'Contaminated', worker: 'Ali' }).qty, -12, 'block items take uses');
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, roomId: 999, worker: 'Ali' }), refused(400, 'roomId'));
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1 }), refused(400, 'worker'));
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', at: NOW + 120_000 }), refused(400, 'at'));
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', at: NOW - 401 * 86_400_000 }), refused(400, 'at'));
});

test('who: one of the active workers when the farm has a list, as the list spells it', (t) => {
  const { db, inv } = setup(t);
  db.setWorkers([{ name: 'Ali', active: true }]);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  assert.equal(inv.use({ itemId: bleach.id, qty: 1, worker: 'ali' }).worker, 'Ali');
  assert.throws(() => inv.use({ itemId: bleach.id, qty: 1, worker: 'Siti' }), refused(400, 'worker'));
});

test('edit a purchase or a use; a changed use-by may be told again; a count and a batch move are not edited', (t) => {
  const { db, inv } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const buy = inv.purchase({ itemId: bleach.id, qty: 3, total: 25, useBy: '2026-11-10' });
  db.setStockUseBySent(buy.id, NOW);
  const same = inv.editMove(buy.id, { total: 30, supplier: 'Kedai Ali' });
  assert.equal(same.unitCost, 10);
  assert.equal(same.supplier, 'Kedai Ali');
  assert.equal(same.useBySentAt, NOW, 'the same use-by: not told again');
  const moved = inv.editMove(buy.id, { useBy: '2026-11-20', day: '2026-11-02' });
  assert.equal(moved.useBySentAt, null);
  assert.equal(moved.at, Date.parse('2026-11-02T12:00:00+08:00'));
  assert.throws(() => inv.editMove(buy.id, { useBy: '2026-11-01' }), refused(400, 'useBy'));
  const used = inv.use({ itemId: bleach.id, qty: 1, worker: 'Ali', reason: 'Footbath' });
  const edited = inv.editMove(used.id, { qty: 2, reason: 'Cleaning', roomId: null });
  assert.equal(edited.qty, -2);
  assert.equal(edited.reason, 'Cleaning');
  assert.equal(edited.worker, 'Ali');
  const [count] = db.insertStockMoves([{ itemId: bleach.id, at: NOW, qty: 0, refKind: 'adjust', counted: 1 }]);
  assert.throws(() => inv.editMove(count.id, { qty: 1 }), refused(409));
  const [batch] = db.insertStockMoves([{ itemId: bleach.id, at: NOW, qty: -1, refKind: 'batch', refId: 3 }]);
  assert.throws(() => inv.editMove(batch.id, { qty: 1 }), refused(409));
  assert.throws(() => inv.removeMove(batch.id), refused(409));
  assert.throws(() => inv.editMove(999, { qty: 1 }), refused(404));
});

test('delete a record; a purchase takes its throw-outs with it', (t) => {
  const { inv, told } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const buy = inv.purchase({ itemId: spawn.id, qty: 3, total: 30, useBy: '2026-11-08' });
  assert.equal(inv.throwOut(buy.id, { worker: 'Ali' }).lotId, buy.id);
  inv.removeMove(buy.id);
  assert.deepEqual(inv.item(spawn.id).moves, []);
  assert.equal(told.at(-1), spawn.id);
  assert.throws(() => inv.removeMove(buy.id), refused(404));
});

test('throw out: what is left of a soon or expired lot, from that lot, with the words for it', (t) => {
  const { inv, setNow } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const old = inv.purchase({ itemId: spawn.id, qty: 2, total: 20, day: '2026-10-20' });
  const soon = inv.purchase({ itemId: spawn.id, qty: 3, total: 30, useBy: '2026-11-08' });
  const later = inv.purchase({ itemId: spawn.id, qty: 1, total: 10, useBy: '2026-12-30' });
  inv.use({ itemId: spawn.id, qty: 1, worker: 'Ali' });
  const thrown = inv.throwOut(soon.id, { worker: 'Ali' });
  assert.equal(thrown.qty, -3);
  assert.equal(thrown.reason, 'Thrown out');
  assert.equal(thrown.refKind, 'use');
  assert.deepEqual(inv.item(spawn.id).lots.map((l) => [l.moveId, l.left]), [[old.id, 1], [later.id, 1]]);
  assert.throws(() => inv.throwOut(soon.id, { worker: 'Ali' }), refused(409), 'nothing left');
  assert.throws(() => inv.throwOut(later.id, { worker: 'Ali' }), refused(409), 'not near its use-by');
  setNow(Date.parse('2026-12-31T09:00:00+08:00'));
  assert.throws(() => inv.throwOut(later.id, {}), refused(400, 'worker'));
  assert.equal(inv.throwOut(later.id, { worker: 'Ali' }).reason, 'Expired');
  assert.throws(() => inv.throwOut(999, { worker: 'Ali' }), refused(404));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory.test.js`
Expected: the new tests FAIL (`inv.purchase is not a function`); the five from Task 4 PASS.

- [ ] **Step 3: Add the moves to `server/inventory.js`**

Inside `createInventory`, after `removeItem`, add:

```js
  // ---- moves ----

  function roomOf(v) {
    if (v === null || v === undefined) return null;
    if (!Number.isInteger(v) || !db.listRooms().some((r) => r.id === v)) throw new InventoryError(400, 'Pick a room', 'roomId');
    return v;
  }
  // When a use happened: now when not given; not in the future (a minute's grace for a clock), not over BACK_DAYS ago.
  function atOf(v) {
    const t = now();
    if (v === undefined || v === null) return t;
    if (!Number.isInteger(v) || v > t + 60_000 || v < t - BACK_DAYS * DAY_MS) {
      throw new InventoryError(400, 'Pick a time from the last 400 days up to now', 'at');
    }
    return v;
  }
  // A purchase's day: today (the time now) or an earlier day of the last BACK_DAYS (12:00 of it).
  function dayAt(v) {
    const d = today();
    if (v === undefined || v === null || v === d) return now();
    if (!isDay(v) || v > d || v < addDays(d, -BACK_DAYS)) throw new InventoryError(400, 'Pick a day from the last 400 days up to today', 'day');
    return dayStart(v) + NOON_MS;
  }
  // A use-by: none, or a date not before the day bought (`at`).
  function useByOf(v, at) {
    if (v === undefined || v === null || v === '') return null;
    if (!isDay(v)) throw new InventoryError(400, 'Give the use-by as a date', 'useBy');
    if (v < localDate(at)) throw new InventoryError(400, 'The use-by cannot be before the day it was bought', 'useBy');
    return v;
  }
  const workerOf = (v) => checkWorker(db, v); // the tasks' rule (400, field 'worker')
  const supplierOf = (v) => textOf(v, 'supplier', 'supplier');
  const reasonOf = (v) => textOf(v, 'reason', 'reason');
  function openItem(id) {
    const it = itemOf(id);
    if (it.archived) throw new InventoryError(409, 'Bring the item back first: it is archived');
    return it;
  }

  // { itemId, qty, total, supplier?, useBy?, day? } → the move. Not a block item: Batches brings blocks in.
  function purchase(body) {
    const b = bodyOf(body);
    const it = openItem(b.itemId);
    if (it.kind === 'blocks') throw new InventoryError(409, 'Blocks come in from Batches');
    const qty = qtyOf(b.qty, it.unit);
    const total = totalOf(b.total);
    const at = dayAt(b.day);
    const [move] = db.insertStockMoves([{
      itemId: it.id, at, qty, refKind: 'purchase', total, unitCost: unitCost(total, qty), supplier: supplierOf(b.supplier), useBy: useByOf(b.useBy, at),
    }]);
    tell(it.id);
    return move;
  }

  // { itemId, qty (the amount used, over 0), roomId?, reason?, worker, at? } → the move (its qty under 0).
  function use(body) {
    const b = bodyOf(body);
    const it = openItem(b.itemId);
    const qty = qtyOf(b.qty, it.unit);
    const fields = { roomId: roomOf(b.roomId), reason: reasonOf(b.reason), worker: workerOf(b.worker), at: atOf(b.at) };
    const [move] = db.insertStockMoves([{ itemId: it.id, qty: -qty, refKind: 'use', ...fields }]);
    tell(it.id);
    return move;
  }

  // A purchase's qty, total, supplier, useBy, day; a use's qty, roomId, reason, worker, at. A count is deleted and counted
  // again; a batch move is Batches'. → the move.
  function editMove(id, body) {
    const m = moveOf(id);
    const b = bodyOf(body);
    if (m.refKind === 'batch') throw new InventoryError(409, 'Change it in Batches');
    if (m.refKind === 'adjust') throw new InventoryError(409, 'A count is not edited: delete it and count again');
    const it = db.stockItem(m.itemId);
    let next;
    if (m.refKind === 'purchase') {
      const qty = given(b.qty) ? qtyOf(b.qty, it.unit) : m.qty;
      const total = given(b.total) ? totalOf(b.total) : m.total;
      const at = given(b.day) && b.day !== localDate(m.at) ? dayAt(b.day) : m.at;
      const useBy = useByOf(given(b.useBy) ? b.useBy : m.useBy, at);
      next = {
        ...m, qty, total, unitCost: total === null ? m.unitCost : unitCost(total, qty), at,
        supplier: given(b.supplier) ? supplierOf(b.supplier) : m.supplier, useBy, useBySentAt: useBy === m.useBy ? m.useBySentAt : null,
      };
    } else {
      next = {
        ...m, qty: given(b.qty) ? -qtyOf(b.qty, it.unit) : m.qty, roomId: given(b.roomId) ? roomOf(b.roomId) : m.roomId,
        reason: given(b.reason) ? reasonOf(b.reason) : m.reason, worker: given(b.worker) ? workerOf(b.worker) : m.worker,
        at: given(b.at) ? atOf(b.at) : m.at,
      };
    }
    const saved = db.updateStockMove(m.id, next);
    tell(m.itemId);
    return saved;
  }

  // A purchase (with the throw-outs taken from it), a use or a count; never a batch move.
  function removeMove(id) {
    const m = moveOf(id);
    if (m.refKind === 'batch') throw new InventoryError(409, 'Change it in Batches');
    db.deleteStockMove(m.id);
    tell(m.itemId);
  }

  // What is left of a soon or expired lot, taken from that lot: a use with the reason "Expired" (or "Thrown out" before its
  // day) and lotId. { worker } → the move.
  function throwOut(moveId, body) {
    const b = bodyOf(body);
    const m = moveOf(moveId);
    const it = db.stockItem(m.itemId);
    const lot = itemView(it, db.itemStockMoves(it.id), now()).lots.find((l) => l.moveId === m.id);
    if (!lot) throw new InventoryError(409, 'Nothing is left of it');
    if (!lot.state) throw new InventoryError(409, 'It is not near its use-by');
    const worker = workerOf(b.worker);
    const [move] = db.insertStockMoves([{
      itemId: it.id, at: now(), qty: -lot.left, refKind: 'use', reason: lot.state === 'expired' ? 'Expired' : 'Thrown out', worker, lotId: m.id,
    }]);
    tell(it.id);
    return move;
  }
```

And extend the returned object's first line to:

```js
    list, item, addItem, editItem, removeItem, purchase, use, editMove, removeMove, throwOut,
```

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory.test.js`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add server/inventory.js tests/inventory.test.js
git commit -m "Inventory: purchases, uses, edits, deletes and throw-outs"
```

---

### Task 6: The store: counts, the purchases for Costs, the 4-5 sheet

**Files:**
- Modify: `server/inventory.js`
- Test: `tests/inventory.test.js` (append)

- [ ] **Step 1: Append the failing tests**

```js
test('a count: each typed figure against the records at that moment, a matching one too, in one go', (t) => {
  const { inv, told } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const bags = inv.addItem({ name: 'Bags', kind: 'bags', unit: 'pcs' });
  inv.purchase({ itemId: bleach.id, qty: 5, total: 25 });
  const { moves } = inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: 3.5 }, { itemId: bags.id, qty: 0 }] });
  assert.deepEqual(moves.map((m) => [m.itemId, m.qty, m.counted, m.refKind, m.worker]), [[bleach.id, -1.5, 3.5, 'adjust', 'Ali'], [bags.id, 0, 0, 'adjust', 'Ali']]);
  assert.equal(inv.item(bleach.id).qty, 3.5);
  assert.equal(inv.item(bags.id).lastCountedAt, NOW);
  assert.ok(told.includes(bleach.id) && told.includes(bags.id));
});

test('a count with one bad entry saves none', (t) => {
  const { inv } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  const old = inv.addItem({ name: 'Old', kind: 'other', unit: 'pcs' });
  inv.editItem(old.id, { archived: true });
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: 1 }, { itemId: old.id, qty: 1 }] }), refused(400, 'counts.1'));
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: 1 }, { itemId: bleach.id, qty: 2 }] }), refused(400, 'counts.1'));
  assert.throws(() => inv.count({ worker: 'Ali', counts: [{ itemId: bleach.id, qty: -1 }] }), refused(400, 'counts.0'));
  assert.throws(() => inv.count({ worker: 'Ali', counts: [] }), refused(400, 'counts'));
  assert.throws(() => inv.count({ counts: [{ itemId: bleach.id, qty: 1 }] }), refused(400, 'worker'));
  assert.deepEqual(inv.item(bleach.id).moves, []);
});

test("the purchases for Costs: the farm's days from–to, oldest first, never a batch move", (t) => {
  const { db, inv } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const a = inv.purchase({ itemId: spawn.id, qty: 2, total: 20, day: '2026-11-01' });
  const b = inv.purchase({ itemId: spawn.id, qty: 1, total: 12 });
  db.insertStockMoves([{ itemId: spawn.id, at: NOW, qty: 500, refKind: 'batch', refId: 1, unitCost: 1.2 }]);
  assert.deepEqual(inv.purchases('2026-11-01', '2026-11-05'), { purchases: [
    { id: a.id, itemId: spawn.id, name: 'Spawn', kind: 'spawn', at: a.at, qty: 2, unitCost: 10, total: 20 },
    { id: b.id, itemId: spawn.id, name: 'Spawn', kind: 'spawn', at: b.at, qty: 1, unitCost: 12, total: 12 },
  ] });
  assert.deepEqual(inv.purchases('2026-11-02', '2026-11-04').purchases, []);
  assert.deepEqual(inv.purchases('2026-11-05', '2026-11-05').purchases.map((p) => p.id), [b.id], 'a one-day range');
  assert.throws(() => inv.purchases('2026-11-05', '2026-11-01'), refused(400, 'from'));
  assert.throws(() => inv.purchases(null, '2026-11-01'), refused(400, 'from'));
  assert.throws(() => inv.purchases('2026-11-01', '5 Nov'), refused(400, 'to'));
});

test('the 4-5 sheet of the last 30, 90 or 365 days', (t) => {
  const { db, inv } = setup(t);
  const room = db.createRoom(ROOM, 1000);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', lrmpNo: 'LRMP 9' });
  inv.purchase({ itemId: bleach.id, qty: 5, total: 25, day: '2026-09-01' });
  inv.use({ itemId: bleach.id, qty: 1, roomId: room.id, reason: 'Footbath', worker: 'Ali' });
  const sheet = inv.sheet(30);
  assert.equal(sheet.from, '2026-10-07');
  assert.equal(sheet.to, '2026-11-05');
  assert.equal(sheet.days, 30);
  assert.deepEqual(sheet.rows.map((r) => [r.kind, r.location, r.lrmpNo]), [['use', 'Container 1', 'LRMP 9']]);
  assert.equal(inv.sheet(90).rows.length, 2);
  assert.throws(() => inv.sheet(7), refused(400, 'days'));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory.test.js`
Expected: the four new tests FAIL (`inv.count is not a function`).

- [ ] **Step 3: Add count, purchases and sheet**

Inside `createInventory`, after `throwOut`, add:

```js
  // ---- counts, the purchases for Costs, the 4-5 sheet ----

  // { worker, counts: [{ itemId, qty }] }: each a count against the records at this moment (qty: the difference, 0 when it
  // matches; counted: the figure), all in one transaction; one bad entry (field counts.<index>) saves none. → { moves }.
  function count(body) {
    const b = bodyOf(body);
    if (!Array.isArray(b.counts) || b.counts.length === 0 || b.counts.length > MAX_COUNTS) {
      throw new InventoryError(400, 'Give at least one count', 'counts');
    }
    const worker = workerOf(b.worker);
    const at = now();
    const seen = new Set();
    const list = b.counts.map((c, i) => {
      const field = `counts.${i}`;
      const it = c !== null && typeof c === 'object' && Number.isInteger(c.itemId) ? db.stockItem(c.itemId) : null;
      if (!it || it.archived) throw new InventoryError(400, 'No such item', field);
      if (seen.has(it.id)) throw new InventoryError(400, 'That item is counted twice', field);
      seen.add(it.id);
      const counted = qtyOf(c.qty, it.unit, field, { zero: true });
      return { itemId: it.id, at, qty: round3(counted - stockOf(db.itemStockMoves(it.id))), refKind: 'adjust', counted, worker };
    });
    const moves = db.insertStockMoves(list);
    for (const id of seen) tell(id);
    return { moves };
  }

  // The contract's read for Costs: the purchases whose farm day is from–to ('YYYY-MM-DD', inclusive), oldest first.
  function purchases(from, to) {
    if (!isDay(from)) throw new InventoryError(400, 'from must be a date, YYYY-MM-DD', 'from');
    if (!isDay(to)) throw new InventoryError(400, 'to must be a date, YYYY-MM-DD', 'to');
    if (from > to) throw new InventoryError(400, 'from must not be after to', 'from');
    const rows = db.stockPurchasesBetween(dayStart(from), dayStart(addDays(to, 1)) - 1);
    return { purchases: rows.map((m) => ({ id: m.id, itemId: m.itemId, name: m.name, kind: m.kind, at: m.at, qty: m.qty, unitCost: m.unitCost, total: m.total })) };
  }

  // The myGAP 4-5 sheet of the last `days` farm days (today included): { from, to, days, rows } (inventory-math sheetRows).
  function sheet(days) {
    if (!SHEET_DAYS.includes(days)) throw new InventoryError(400, 'days must be 30, 90 or 365', 'days');
    const to = today();
    const from = addDays(to, -(days - 1));
    const start = dayStart(from);
    const end = dayStart(addDays(to, 1)) - 1;
    const items = new Map(db.stockItems().map((i) => [i.id, i]));
    const runs = new Map();
    const runsOf = (roomId) => {
      if (!runs.has(roomId)) runs.set(roomId, db.cropRuns(roomId));
      return runs.get(roomId);
    };
    const moves = db.stockMoves().filter((m) => m.at >= start && m.at <= end);
    return { from, to, days, rows: sheetRows(moves, { items, rooms: roomNames(), runsOf, cropName: cropShortName }) };
  }
```

And extend the returned object's first line to:

```js
    list, item, addItem, editItem, removeItem, purchase, use, editMove, removeMove, throwOut, count, purchases, sheet,
```

- [ ] **Step 4: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory.test.js`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add server/inventory.js tests/inventory.test.js
git commit -m "Inventory: counts, the purchases for Costs and the myGAP 4-5 sheet's rows"
```

---

### Task 7: The setting `inventoryTelegram`

**Files:**
- Modify: `server/settings.js` (its own block after the Harvest block; `validateSettings`, `writeSettings`, `settingsView`)
- Test: `tests/settings-inventory.test.js`

- [ ] **Step 1: Write the failing test**

```js
// The Inventory setting (spec 2026-11-05-inventory-design.md 5 and 7): low-stock and use-by messages to Telegram, on unless
// turned off.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { validateSettings, writeSettings, settingsView, readInventoryTelegram } from '../server/settings.js';

test('on by default; saved off and on again; shown with the settings', (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  assert.equal(readInventoryTelegram(db), true);
  assert.equal(settingsView(db).inventoryTelegram, true);
  const off = validateSettings({ inventoryTelegram: false });
  assert.deepEqual(off, { settings: { inventoryTelegram: false } });
  writeSettings(db, off.settings);
  assert.equal(readInventoryTelegram(db), false);
  assert.equal(settingsView(db).inventoryTelegram, false);
  writeSettings(db, { inventoryTelegram: true });
  assert.equal(readInventoryTelegram(db), true);
});

test('only true or false', () => {
  assert.deepEqual(validateSettings({ inventoryTelegram: 'yes' }), { error: 'Stock messages must be on or off', field: 'inventoryTelegram' });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/settings-inventory.test.js`
Expected: FAIL (`readInventoryTelegram` is not exported).

- [ ] **Step 3: Add the block**

In `server/settings.js`, after `readCropYield` (the end of the Harvest block), add:

```js
// ---- Inventory (spec 2026-11-05-inventory-design.md 5 and 6) ----
const INVENTORY_FIELDS = {
  inventoryTelegram: { ok: (v) => typeof v === 'boolean', error: 'Stock messages must be on or off' },
};

// Whether the low-stock and use-by messages go to the Telegram chat: on unless turned off.
export function readInventoryTelegram(db) {
  return db.getSetting('inventoryTelegram') !== '0';
}
```

In `validateSettings`, after the `YIELD_FIELDS` loop, add:

```js
  for (const [field, { ok, error }] of Object.entries(INVENTORY_FIELDS)) {
    if (!Object.hasOwn(body, field)) continue;
    if (!ok(body[field])) return { error, field };
    settings[field] = body[field];
  }
```

In `writeSettings`, after the `cropYield` line, add:

```js
  if (Object.hasOwn(settings, 'inventoryTelegram')) db.setSetting('inventoryTelegram', settings.inventoryTelegram ? '1' : '0');
```

In `settingsView`, after `cropYield: readCropYield(db),` add:

```js
    inventoryTelegram: readInventoryTelegram(db),
```

(`readInventoryTelegram` is a function declaration, so it is hoisted above `settingsView`.)

- [ ] **Step 4: Run it and the settings tests that compare whole replies**

Run: `node --disable-warning=ExperimentalWarning --test tests/settings-inventory.test.js tests/settings.test.js tests/api-settings.test.js tests/api-telegram.test.js tests/db-settings.test.js tests/settings-usage.test.js tests/main.test.js`
Expected: PASS. If a test compares the whole `GET /api/settings` reply with `deepEqual` and now fails only for the new key, add `inventoryTelegram: true` to its expected object (the Settings reply gained the key; nothing else changed).

- [ ] **Step 5: Commit**

```bash
git add server/settings.js tests/settings-inventory.test.js tests/*.test.js
git commit -m "Inventory: the inventoryTelegram setting"
```

---

### Task 8: The Telegram messages

**Files:**
- Create: `server/inventory-alerts.js`
- Test: `tests/inventory-alerts.test.js`

- [ ] **Step 1: Write the failing test**

```js
// Low-stock and use-by messages (spec 2026-11-05-inventory-design.md 6): sent once, again only after the item was back over
// its level or the use-by changed; nothing when off or without Telegram; a failure tried at the next check, the token never
// in the log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createInventory } from '../server/inventory.js';
import { createInventoryAlerts, lowText, useByText } from '../server/inventory-alerts.js';

const NOW = Date.parse('2026-11-05T09:00:00+08:00');
const TOKEN = '123456:ABCDEFGHIJKLMNOP';
const plain = (s) => s.replace(/\u00a0/g, ' ');

function setup(t) {
  const db = openDb(':memory:');
  t.after(() => db.close());
  let now = NOW;
  const state = { on: true, token: TOKEN, fail: false };
  const sent = [];
  const logs = [];
  const transport = async ({ token, chatId, text }) => {
    if (state.fail) return { ok: false, description: `Unauthorized for ${token}` };
    sent.push({ chatId, text: plain(text) });
    return { ok: true };
  };
  const alerts = createInventoryAlerts({
    db, now: () => now, transport, telegram: () => ({ telegramToken: state.token, telegramChatId: '42' }), enabled: () => state.on,
    log: (x) => logs.push(String(x)), setTimer: () => 1, clearTimer: () => {},
  });
  const inv = createInventory({ db, now: () => now });
  return { db, inv, alerts, sent, logs, state, setNow: (ms) => { now = ms; } };
}

test('the texts', () => {
  assert.equal(plain(lowText({ name: 'Bleach', qty: 1.5, unit: 'L', reorderAt: 2 })), '📦 Low stock · Bleach · 1.50 L left (reorder at 2.00 L)');
  const lot = { useBy: '2026-11-12', left: 3, at: Date.parse('2026-11-01T12:00:00+08:00'), state: 'soon' };
  assert.equal(plain(useByText({ name: 'Grey oyster spawn', unit: 'kg' }, lot)), '📦 Use by 12 Nov · Grey oyster spawn · 3.00 kg left from the purchase of 1 Nov');
  assert.equal(plain(useByText({ name: 'Spawn', unit: 'kg' }, { ...lot, state: 'expired' })), '📦 Expired 12 Nov · Spawn · 3.00 kg left from the purchase of 1 Nov');
});

test('Low: sent once; back over the level clears it; falling again sends again', async (t) => {
  const { db, inv, alerts, sent } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  inv.purchase({ itemId: bleach.id, qty: 1.5, total: 10 });
  await alerts.check();
  await alerts.check();
  assert.deepEqual(sent, [{ chatId: '42', text: '📦 Low stock · Bleach · 1.50 L left (reorder at 2.00 L)' }]);
  assert.equal(db.stockItem(bleach.id).lowSentAt, NOW);
  inv.purchase({ itemId: bleach.id, qty: 5, total: 25 });
  await alerts.check();
  assert.equal(db.stockItem(bleach.id).lowSentAt, null);
  inv.use({ itemId: bleach.id, qty: 5, worker: 'Ali' });
  await alerts.check();
  assert.equal(sent.length, 2);
});

test('use-by: once per lot, soon or already expired; a changed use-by is told again', async (t) => {
  const { inv, alerts, sent } = setup(t);
  const spawn = inv.addItem({ name: 'Spawn', kind: 'spawn', unit: 'kg' });
  const soon = inv.purchase({ itemId: spawn.id, qty: 3, total: 30, useBy: '2026-11-12', day: '2026-11-01' });
  inv.purchase({ itemId: spawn.id, qty: 1, total: 10, useBy: '2026-11-04', day: '2026-11-01' });
  inv.purchase({ itemId: spawn.id, qty: 1, total: 10, useBy: '2026-12-30' });
  await alerts.check();
  await alerts.check();
  assert.deepEqual(sent.map((s) => s.text), [
    '📦 Use by 12 Nov · Spawn · 3.00 kg left from the purchase of 1 Nov',
    '📦 Expired 4 Nov · Spawn · 1.00 kg left from the purchase of 1 Nov',
  ]);
  inv.editMove(soon.id, { useBy: '2026-11-11' });
  await alerts.check();
  assert.equal(sent.length, 3);
});

test('off, or no token: nothing sent and nothing marked, so turning it on sends what is due', async (t) => {
  const { db, inv, alerts, sent, state } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  state.on = false;
  await alerts.check();
  state.on = true;
  state.token = '';
  await alerts.check();
  assert.deepEqual(sent, []);
  assert.equal(db.stockItem(bleach.id).lowSentAt, null);
  state.token = TOKEN;
  await alerts.check();
  assert.equal(sent.length, 1);
});

test('a failure is logged without the token and tried again at the next check', async (t) => {
  const { db, inv, alerts, sent, logs, state } = setup(t);
  const bleach = inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  state.fail = true;
  await alerts.check();
  assert.equal(sent.length, 0);
  assert.equal(db.stockItem(bleach.id).lowSentAt, null);
  assert.ok(logs.length > 0);
  assert.ok(logs.every((l) => !l.includes(TOKEN)), logs.join('\n'));
  state.fail = false;
  await alerts.check();
  assert.equal(sent.length, 1);
});

test('an archived item is never told; two checks at once send once', async (t) => {
  const { inv, alerts, sent } = setup(t);
  const old = inv.addItem({ name: 'Old', kind: 'other', unit: 'pcs', reorderAt: 5 });
  inv.editItem(old.id, { archived: true });
  inv.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  await Promise.all([alerts.check(), alerts.check()]);
  assert.deepEqual(sent.map((s) => s.text), ['📦 Low stock · Bleach · 0.00 L left (reorder at 2.00 L)']);
});

test('start checks at once and then on its timer; stop ends both', async (t) => {
  const db = openDb(':memory:');
  t.after(() => db.close());
  const timers = [];
  let cleared = 0;
  const alerts = createInventoryAlerts({
    db, transport: async () => ({ ok: true }), telegram: () => ({ telegramToken: '', telegramChatId: '' }), enabled: () => true,
    setTimer: (fn, ms) => { timers.push([fn, ms]); return timers.length; }, clearTimer: () => { cleared += 1; },
  });
  alerts.start();
  assert.equal(timers.length, 1);
  assert.equal(timers[0][1], 3_600_000);
  alerts.stop();
  assert.equal(cleared, 1);
  await alerts.check(); // after stop: nothing, no throw
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory-alerts.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write `server/inventory-alerts.js`**

```js
// Low-stock and use-by messages (spec 2026-11-05-inventory-design.md 6): one Telegram message when an item first falls to
// its reorder level (again only after it was back over it), one per purchase when its use-by comes within 7 days or has
// passed. To the alarms' chat with telegram.js's transport (that file is not changed); the token never reaches a log line.
// Checked after every write, on Batches' events, at start and hourly (server/inventory-api.js). Never throws.

import { fetchTransport } from './telegram.js';
import { readTelegram, readInventoryTelegram } from './settings.js';
import { itemView } from './inventory-math.js';
import { localDate } from './task-rules.js';
import { qtyText, dayText } from '../web/inventory-math.js';

export const CHECK_MS = 3_600_000;
const DOT = ' · ';

export const lowText = (v) => `📦 Low stock${DOT}${v.name}${DOT}${qtyText(v.qty, v.unit)} left (reorder at ${qtyText(v.reorderAt, v.unit)})`;
export const useByText = (v, lot) => `📦 ${lot.state === 'expired' ? 'Expired' : 'Use by'} ${dayText(lot.useBy)}${DOT}${v.name}${DOT}`
  + `${qtyText(lot.left, v.unit)} left from the purchase of ${dayText(localDate(lot.at))}`;

// The token out of a text (Telegram's errors may echo the URL).
const mask = (text, token) => (token ? String(text).split(token).join('***') : String(text)).replace(/bot[0-9]{3,20}:[A-Za-z0-9_-]{10,}/g, 'bot***');

// telegram() → { telegramToken, telegramChatId }; enabled() → the inventoryTelegram setting. setTimer/clearTimer: an
// interval (unref'd: it never keeps the process alive).
export function createInventoryAlerts({
  db, now = Date.now, transport = fetchTransport, telegram = () => readTelegram(db), enabled = () => readInventoryTelegram(db),
  setTimer = (fn, ms) => { const t = setInterval(fn, ms); t.unref?.(); return t; }, clearTimer = clearInterval, log = console.error,
}) {
  let stopped = false;
  let running = null;
  let again = false;
  let timer = null;
  const safeLog = (text, token) => { try { log(mask(text, token)); } catch { /* logging must not throw */ } };

  async function send(text, s) {
    try {
      const r = await transport({ token: s.telegramToken, chatId: s.telegramChatId, text });
      if (r?.ok) return true;
      safeLog(`Inventory message not sent: ${r?.description ?? 'no reason given'}`, s.telegramToken);
    } catch (err) {
      safeLog(`Inventory message not sent: ${err?.message ?? err}`, s.telegramToken);
    }
    return false;
  }

  async function once() {
    const s = telegram();
    const on = enabled() && Boolean(s.telegramToken && s.telegramChatId);
    const by = new Map();
    for (const m of db.stockMoves()) {
      if (!by.has(m.itemId)) by.set(m.itemId, []);
      by.get(m.itemId).push(m);
    }
    for (const item of db.stockItems()) {
      if (stopped) return;
      if (item.archived) continue;
      const moves = by.get(item.id) ?? [];
      const v = itemView(item, moves, now());
      if (!v.low) {
        if (item.lowSentAt !== null) db.setStockLowSent(item.id, null);
      } else if (item.lowSentAt === null && on && await send(lowText(v), s)) {
        if (stopped) return;
        db.setStockLowSent(item.id, now());
      }
      for (const lot of v.lots) {
        if (!on || !lot.state || lot.refKind !== 'purchase') continue;
        if (moves.find((m) => m.id === lot.moveId)?.useBySentAt !== null) continue;
        if (await send(useByText(v, lot), s)) {
          if (stopped) return;
          db.setStockUseBySent(lot.moveId, now());
        }
      }
    }
  }

  // One check at a time; a check asked for while one runs makes it run once more. → a promise kept when done.
  function check() {
    if (stopped) return Promise.resolve();
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      do {
        again = false;
        await once();
      } while (again && !stopped);
    })().catch((err) => safeLog(`Inventory messages: ${err?.message ?? err}`)).finally(() => { running = null; });
    return running;
  }

  return {
    check,
    start() {
      if (stopped || timer !== null) return;
      timer = setTimer(() => { check(); }, CHECK_MS);
      check();
    },
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/inventory-alerts.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add server/inventory-alerts.js tests/inventory-alerts.test.js
git commit -m "Inventory: low-stock and use-by messages to Telegram, once each"
```

---

### Task 9: The routes, the events and the wiring in api.js

**Files:**
- Create: `server/inventory-api.js`
- Modify: `server/api.js` (an import; one `createInventoryApi` line after the harvest wiring; one `routes` line in `route()` after `harvestRoutes`; `api.close` also stops it)
- Test: `tests/api-inventory.test.js`

- [ ] **Step 1: Write the failing test**

```js
// The inventory routes (spec 2026-11-05-inventory-design.md 7): the list, items, purchases, uses, counts, edits, deletes,
// throw-outs, the purchases for Costs, the 4-5 sheet; the 'inventory' events, and a 'batches' event read again.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const server = createApp(db, { events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  const inventoryEvents = () => seen.filter(([type]) => type === 'inventory').map(([, data]) => data);
  return { db, events, call, inventoryEvents };
}

test('items: add, list, read, edit, archive, delete', async (t) => {
  const { call, inventoryEvents } = await app(t);
  const made = await call('POST', '/api/inventory/items', { name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: 2 });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.id;
  assert.deepEqual(inventoryEvents().at(-1), { itemId: id });
  const list = await call('GET', '/api/inventory');
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map((i) => i.name), ['Bleach']);
  assert.deepEqual(list.body.attention, { low: 1, soon: 0, expired: 0 });
  const bad = await call('POST', '/api/inventory/items', { name: 'bleach', kind: 'chemical', unit: 'L' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.field, 'name');
  assert.equal((await call('GET', `/api/inventory/items/${id}`)).body.name, 'Bleach');
  assert.equal((await call('PUT', `/api/inventory/items/${id}`, { reorderAt: 3 })).body.reorderAt, 3);
  assert.equal((await call('PUT', `/api/inventory/items/${id}`, { archived: true })).body.archived, true);
  assert.deepEqual((await call('GET', '/api/inventory')).body.items, []);
  assert.equal((await call('GET', '/api/inventory?archived=1')).body.items.length, 1);
  assert.equal((await call('DELETE', `/api/inventory/items/${id}`)).status, 204);
  assert.equal((await call('GET', `/api/inventory/items/${id}`)).status, 404);
  assert.equal((await call('PATCH', `/api/inventory/items/${id}`, {})).status, 404);
});

test('purchase, use, count, edit, delete and throw out', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/inventory/items', { name: 'Spawn', kind: 'spawn', unit: 'kg' })).body.id;
  const buy = await call('POST', '/api/inventory/purchases', { itemId: id, qty: 3, total: 30, useBy: '2000-01-01', day: null });
  assert.equal(buy.status, 400, 'a use-by before the day bought');
  assert.equal(buy.body.field, 'useBy');
  const ok = await call('POST', '/api/inventory/purchases', { itemId: id, qty: 3, total: 30 });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const used = await call('POST', '/api/inventory/uses', { itemId: id, qty: 1, worker: 'Ali' });
  assert.equal(used.status, 201, JSON.stringify(used.body));
  assert.equal(used.body.qty, -1);
  assert.equal((await call('POST', '/api/inventory/uses', { itemId: id, qty: 1 })).body.field, 'worker');
  const counted = await call('POST', '/api/inventory/counts', { worker: 'Ali', counts: [{ itemId: id, qty: 1.5 }] });
  assert.equal(counted.status, 201);
  assert.equal(counted.body.moves[0].qty, -0.5);
  assert.equal((await call('PUT', `/api/inventory/moves/${used.body.id}`, { qty: 2 })).body.qty, -2);
  assert.equal((await call('PUT', `/api/inventory/moves/${counted.body.moves[0].id}`, { qty: 2 })).status, 409);
  assert.equal((await call('POST', `/api/inventory/lots/${ok.body.id}/throw-out`, { worker: 'Ali' })).status, 409, 'no use-by');
  assert.equal((await call('DELETE', `/api/inventory/moves/${used.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/inventory/moves/${used.body.id}`)).status, 404);
  const page = await call('GET', `/api/inventory/items/${id}`);
  assert.deepEqual(page.body.moves.map((m) => m.refKind), ['adjust', 'purchase']);
});

test("a batch move is shown and never changed here", async (t) => {
  const { db, call } = await app(t);
  const blocks = db.insertStockItem({ name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' });
  const [move] = db.insertStockMoves([{ itemId: blocks.id, at: Date.now(), qty: 500, refKind: 'batch', refId: 3, unitCost: 1.2 }]);
  assert.equal((await call('GET', `/api/inventory/items/${blocks.id}`)).body.qty, 500);
  const put = await call('PUT', `/api/inventory/moves/${move.id}`, { qty: 1 });
  assert.equal(put.status, 409);
  assert.equal(put.body.error, 'Change it in Batches');
  assert.equal((await call('DELETE', `/api/inventory/moves/${move.id}`)).status, 409);
  assert.equal((await call('POST', '/api/inventory/purchases', { itemId: blocks.id, qty: 1, total: 1 })).status, 409);
});

test('the purchases for Costs: the contract shape; from and to checked', async (t) => {
  const { call } = await app(t);
  const id = (await call('POST', '/api/inventory/items', { name: 'Punnets', kind: 'packaging', unit: 'pcs' })).body.id;
  const buy = (await call('POST', '/api/inventory/purchases', { itemId: id, qty: 500, total: 75 })).body;
  const today = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
  const got = await call('GET', `/api/inventory/purchases?from=${today}&to=${today}`);
  assert.equal(got.status, 200);
  assert.deepEqual(got.body, { purchases: [{ id: buy.id, itemId: id, name: 'Punnets', kind: 'packaging', at: buy.at, qty: 500, unitCost: 0.15, total: 75 }] });
  assert.equal((await call('GET', '/api/inventory/purchases')).status, 400);
  assert.equal((await call('GET', `/api/inventory/purchases?from=${today}&to=2000-01-01`)).body.field, 'from');
});

test('the 4-5 sheet: 30 days by default, 30, 90 or 365', async (t) => {
  const { call } = await app(t);
  const got = await call('GET', '/api/inventory/sheet');
  assert.equal(got.status, 200);
  assert.equal(got.body.days, 30);
  assert.deepEqual(got.body.rows, []);
  assert.equal((await call('GET', '/api/inventory/sheet?days=365')).body.days, 365);
  assert.equal((await call('GET', '/api/inventory/sheet?days=7')).status, 400);
  assert.equal((await call('GET', '/api/inventory/sheet?days=abc')).status, 400);
});

test("a 'batches' event is read again: the pages hear 'inventory' with no item", async (t) => {
  const { events, inventoryEvents } = await app(t);
  events.publish('batches', { id: 3 });
  assert.deepEqual(inventoryEvents().at(-1), { itemId: null });
});

test('an unknown inventory path is a 404', async (t) => {
  const { call } = await app(t);
  assert.equal((await call('GET', '/api/inventory/nothing')).status, 404);
  assert.equal((await call('POST', '/api/inventory', {})).status, 404);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-inventory.test.js`
Expected: FAIL (404s: no routes yet).

- [ ] **Step 3: Write `server/inventory-api.js`**

```js
// The inventory routes (spec 2026-11-05-inventory-design.md 7), called from api.js. server/inventory.js checks, records and
// works out; this reads the path, the query and the body, publishes 'inventory' { itemId } after each change and runs the
// Telegram checks (server/inventory-alerts.js) then, at start, hourly and on Batches' 'batches' events (Batches writes block
// and material moves, which can make an item Low), after which the pages hear 'inventory' { itemId: null }.

import { createInventory } from './inventory.js';
import { createInventoryAlerts } from './inventory-alerts.js';

const ID = '([1-9][0-9]{0,14})';
const ONE_ITEM = new RegExp(`^/api/inventory/items/${ID}$`);
const ONE_MOVE = new RegExp(`^/api/inventory/moves/${ID}$`);
const THROW_OUT = new RegExp(`^/api/inventory/lots/${ID}/throw-out$`);

// events: the farm's bus (null in some tests). alerts: options for createInventoryAlerts (tests). → { routes, inventory,
// alerts, stop }; routes(req, res, path, { send, readJson, HttpError, url }) answers true when the path is one of its own.
export function createInventoryApi({ db, events = null, now = Date.now, alerts: alertOptions = {}, log = console.error }) {
  const inventory = createInventory({ db, now, log });
  const alerts = createInventoryAlerts({ db, now, log, ...alertOptions });
  const offChange = inventory.onChange((itemId) => {
    events?.publish('inventory', { itemId });
    alerts.check();
  });
  const offBatches = events ? events.subscribe((type) => {
    if (type !== 'batches') return;
    alerts.check();
    events.publish('inventory', { itemId: null });
  }) : () => {};
  alerts.start();

  const noContent = (res) => {
    res.writeHead(204);
    res.end();
  };

  async function route(req, res, path, { send, readJson, HttpError, url }) {
    if (path !== '/api/inventory' && !path.startsWith('/api/inventory/')) return false;
    const notFound = () => new HttpError(404, 'Not found');
    const { method } = req;

    if (path === '/api/inventory') {
      if (method !== 'GET') throw notFound();
      send(res, 200, inventory.list({ archived: url.searchParams.get('archived') === '1' }));
      return true;
    }
    if (path === '/api/inventory/items') {
      if (method !== 'POST') throw notFound();
      send(res, 201, inventory.addItem(await readJson(req)));
      return true;
    }
    const item = ONE_ITEM.exec(path);
    if (item) {
      const id = Number(item[1]);
      if (method === 'GET') send(res, 200, inventory.item(id));
      else if (method === 'PUT') send(res, 200, inventory.editItem(id, await readJson(req)));
      else if (method === 'DELETE') { inventory.removeItem(id); noContent(res); }
      else throw notFound();
      return true;
    }
    if (path === '/api/inventory/purchases') {
      if (method === 'GET') send(res, 200, inventory.purchases(url.searchParams.get('from'), url.searchParams.get('to')));
      else if (method === 'POST') send(res, 201, inventory.purchase(await readJson(req)));
      else throw notFound();
      return true;
    }
    if (path === '/api/inventory/uses' || path === '/api/inventory/counts') {
      if (method !== 'POST') throw notFound();
      const body = await readJson(req);
      send(res, 201, path === '/api/inventory/uses' ? inventory.use(body) : inventory.count(body));
      return true;
    }
    const move = ONE_MOVE.exec(path);
    if (move) {
      const id = Number(move[1]);
      if (method === 'PUT') send(res, 200, inventory.editMove(id, await readJson(req)));
      else if (method === 'DELETE') { inventory.removeMove(id); noContent(res); }
      else throw notFound();
      return true;
    }
    const lot = THROW_OUT.exec(path);
    if (lot) {
      if (method !== 'POST') throw notFound();
      send(res, 201, inventory.throwOut(Number(lot[1]), await readJson(req)));
      return true;
    }
    if (path === '/api/inventory/sheet') {
      if (method !== 'GET') throw notFound();
      const asked = url.searchParams.get('days');
      if (asked !== null && !/^[0-9]{1,4}$/.test(asked)) throw new HttpError(400, 'days must be 30, 90 or 365', 'days');
      send(res, 200, inventory.sheet(asked === null ? 30 : Number(asked)));
      return true;
    }
    throw notFound();
  }

  // A 4xx from the store (InventoryError, or the tasks' worker check) becomes the API's HttpError.
  async function routes(req, res, path, helpers) {
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      const { HttpError } = helpers;
      if (!(err instanceof HttpError) && Number.isInteger(err?.status) && err.status >= 400 && err.status < 500) {
        throw new HttpError(err.status, err.message, err.field);
      }
      throw err;
    }
  }

  return {
    routes, inventory, alerts,
    stop() {
      offChange();
      offBatches();
      alerts.stop();
    },
  };
}
```

- [ ] **Step 4: Wire it in `server/api.js`**

1. With the other imports, after `import { createHarvestRoutes } from './harvest-api.js';`:

```js
import { createInventoryApi } from './inventory-api.js'; // ---- Inventory ----
```

2. After the line `const stopTelling = () => { … harvests.stop(); };`:

```js
  const inventoryApi = createInventoryApi({ db, events }); // ---- Inventory (spec 2026-11-05-inventory-design.md 7) ----
```

3. In `route()`, after `if (await harvestRoutes(req, res, path, { send, readJson, HttpError, url })) return;`:

```js
    if (await inventoryApi.routes(req, res, path, { send, readJson, HttpError, url })) return;
```

4. Change `api.close = stopTelling;` to:

```js
  api.close = () => { stopTelling(); inventoryApi.stop(); };
```

- [ ] **Step 5: Run the tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-inventory.test.js tests/api.test.js tests/api-harvest.test.js`
Expected: PASS.

- [ ] **Step 6: Run the whole suite**

Run: `npm test 2>&1 | tail -15`
Expected: every test passes (2197 before this work plus the new ones). Fix anything this branch broke before going on.

- [ ] **Step 7: Commit**

```bash
git add server/inventory-api.js server/api.js tests/api-inventory.test.js
git commit -m "Inventory: the routes, the inventory events and the batches subscription"
```

---

### Task 10: The pages' pure parts

**Files:**
- Modify: `web/inventory-math.js` (imports at the top; append the rest)
- Test: `tests/web-inventory-math.test.js` (append)

- [ ] **Step 1: Append the failing tests**

Add to the import line of `tests/web-inventory-math.test.js` (replace it):

```js
import {
  qtyText, rmText, perUnitText, dayText, longDayText, daysBefore, pillOf, lotPill, countedText, attentionParts, groupItems, lotLabel,
  moveLine, deleteTitle, deleteLead, throwOutTitle, throwOutLead, numberIn, itemBody, purchaseBody, useBody, purchaseEditBody,
  useEditBody, overStock, countBody, sheetCells, sheetRange, sheetEmpty, SHEET_COLUMNS, KIND_OPTIONS, UNIT_OPTIONS,
} from '../web/inventory-math.js';
```

Append:

```js
const at = (date, time = '12:00') => Date.parse(`${date}T${time}:00+08:00`);
const item = (fields) => ({ id: 1, name: 'Bleach', kind: 'chemical', unit: 'L', reorderAt: null, archived: false, qty: 0, low: false, useBy: null, lastCountedAt: null, ...fields });

test('a farm day some days before another', () => {
  assert.equal(daysBefore('2026-11-05', 400), '2025-10-01');
  assert.equal(daysBefore('2026-03-01', 1), '2026-02-28');
});

test('the pills: archived, then expired (red), Low, a use-by (amber); none for a calm item', () => {
  assert.deepEqual(pillOf(item({ archived: true, low: true })), { text: 'Archived', tone: 'none' });
  assert.deepEqual(pillOf(item({ low: true, useBy: { date: '2026-11-04', state: 'expired' } })), { text: 'Expired', tone: 'warn' });
  assert.deepEqual(pillOf(item({ low: true, useBy: { date: '2026-11-12', state: 'soon' } })), { text: 'Low', tone: 'amber' });
  assert.deepEqual(pillOf(item({ useBy: { date: '2026-11-12', state: 'soon' } })), { text: 'Use by 12 Nov', tone: 'amber' });
  assert.equal(pillOf(item()), null);
  assert.deepEqual(lotPill({ state: 'soon', useBy: '2026-11-12' }), { text: 'Use by 12 Nov', tone: 'amber' });
  assert.deepEqual(lotPill({ state: 'expired', useBy: '2026-11-04' }), { text: 'Expired', tone: 'warn' });
  assert.equal(lotPill({ state: null, useBy: '2027-01-01' }), null);
});

test("last counted in words; over 7 days or never is muted", () => {
  const now = at('2026-11-05', '09:00');
  assert.deepEqual(countedText(null, now), { text: 'never', stale: true });
  assert.deepEqual(countedText(at('2026-11-05', '08:00'), now), { text: 'today', stale: false });
  assert.deepEqual(countedText(at('2026-11-04'), now), { text: 'yesterday', stale: false });
  assert.deepEqual(countedText(at('2026-10-29'), now), { text: '7 days ago', stale: false });
  assert.deepEqual(countedText(at('2026-10-27'), now), { text: 'not counted for 9 days', stale: true });
});

test('the attention line: low and soon amber, expired red; one soon item names its day', () => {
  const soon = item({ useBy: { date: '2026-11-12', state: 'soon' } });
  assert.deepEqual(attentionParts({ low: 2, soon: 1, expired: 1 }, [soon]), [
    { text: '2 low', tone: 'amber' }, { text: '1 to use by 12 Nov', tone: 'amber' }, { text: '1 expired', tone: 'warn' },
  ]);
  assert.deepEqual(attentionParts({ low: 0, soon: 2, expired: 0 }, [soon, soon]), [{ text: '2 to use within 7 days', tone: 'amber' }]);
  assert.deepEqual(attentionParts({ low: 0, soon: 0, expired: 0 }, []), []);
});

test('the groups: by kind in order, empty kinds left out, the items that need a look first', () => {
  const groups = groupItems([
    item({ id: 1, name: 'Alcohol', kind: 'chemical' }), item({ id: 2, name: 'Bleach', kind: 'chemical', low: true }),
    item({ id: 3, name: 'Punnets', kind: 'packaging', unit: 'pcs' }), item({ id: 4, name: 'Grey oyster blocks', kind: 'blocks', unit: 'blocks' }),
  ]);
  assert.deepEqual(groups.map((g) => [g.name, g.items.map((i) => i.id)]), [['Blocks', [4]], ['Chemicals', [2, 1]], ['Packaging', [3]]]);
});

test("a lot's name and a move's line", () => {
  assert.equal(lotLabel({ refKind: 'purchase', at: at('2026-11-01') }), 'Bought 1 Nov');
  assert.equal(lotLabel({ refKind: 'batch', refId: 14, at: 0 }), 'Batch 14');
  assert.equal(lotLabel({ refKind: 'adjust', at: at('2026-11-03') }), 'Count 3 Nov');
  const bleach = item();
  const line = (m) => {
    const l = moveLine({ roomId: null, roomName: null, reason: null, worker: null, lotId: null, supplier: null, useBy: null, ...m }, bleach);
    return { ...l, what: l.what.replace(/\u00a0/g, ' '), qty: l.qty.replace(/\u00a0/g, ' ') };
  };
  assert.deepEqual(line({ refKind: 'purchase', at: at('2026-11-03'), qty: 5, total: 25, supplier: 'Kedai Ali', useBy: '2026-12-01' }), {
    when: '3 Nov', what: 'Bought from Kedai Ali · RM 25.00 · use by 1 Dec', qty: '+5.00 L', edit: 'edit',
  });
  assert.equal(line({ refKind: 'use', at: at('2026-11-03', '08:12'), qty: -1, roomId: 2, roomName: 'Container 2', reason: 'Footbath', worker: 'Ali' }).what, 'Used in Container 2 · Footbath · Ali');
  assert.equal(line({ refKind: 'use', at: 0, qty: -1, roomId: 9, roomName: null }).what, 'Used in a deleted room');
  assert.equal(line({ refKind: 'use', at: 0, qty: -1 }).what, 'Used');
  assert.equal(line({ refKind: 'use', at: at('2026-11-03', '08:12'), qty: -1 }).when, '3 Nov 08:12');
  assert.equal(line({ refKind: 'use', at: 0, qty: -3, lotId: 4, reason: 'Expired', worker: 'Ali' }).what, 'Thrown out · expired · Ali');
  const count = line({ refKind: 'adjust', at: 0, qty: -1.5, counted: 3.5, worker: 'Ali' });
  assert.equal(count.what, 'Counted 3.50 L · Ali');
  assert.equal(count.edit, 'delete');
  const batch = line({ refKind: 'batch', refId: 14, at: 0, qty: 500 });
  assert.equal(batch.what, 'Batch 14 · received');
  assert.equal(batch.edit, null);
  assert.equal(moveLine({ refKind: 'batch', refId: 14, at: 0, qty: -500, roomName: 'Container 2' }, item({ kind: 'blocks', unit: 'blocks' })).what.replace(/\u00a0/g, ' '), 'Batch 14 · into Container 2');
  assert.equal(moveLine({ refKind: 'batch', refId: 16, at: 0, qty: -2, roomName: null }, item({ kind: 'spawn', unit: 'kg' })).what.replace(/\u00a0/g, ' '), 'Batch 16 · made');
});

test('the confirms: delete and throw out', () => {
  const bleach = item();
  const plain = (s) => s.replace(/\u00a0/g, ' ');
  assert.equal(plain(deleteTitle({ refKind: 'purchase', qty: 5, at: at('2026-11-03') }, bleach)), 'Delete the purchase of 5.00 L of Bleach on 3 Nov?');
  assert.equal(plain(deleteTitle({ refKind: 'use', qty: -1, at: at('2026-11-03'), lotId: null }, bleach)), 'Delete the use of 1.00 L of Bleach on 3 Nov?');
  assert.equal(plain(deleteTitle({ refKind: 'use', qty: -1, at: at('2026-11-03'), lotId: 4 }, bleach)), 'Delete the throw-out of 1.00 L of Bleach on 3 Nov?');
  assert.equal(plain(deleteTitle({ refKind: 'adjust', qty: 0, at: at('2026-11-03') }, bleach)), 'Delete the count of Bleach on 3 Nov?');
  assert.equal(deleteLead({ refKind: 'purchase' }, { throwOuts: true }), 'The throw-outs taken from it go with it.');
  assert.equal(deleteLead({ refKind: 'purchase' }, { throwOuts: false }), null);
  assert.equal(deleteLead({ refKind: 'adjust' }, {}), 'In stock goes back to what the records said without it.');
  const lot = { left: 3, at: at('2026-11-01'), useBy: '2026-11-04', state: 'expired' };
  assert.equal(plain(throwOutTitle(lot, item({ name: 'Spawn', unit: 'kg' }))), 'Throw out 3.00 kg of Spawn bought 1 Nov?');
  assert.equal(throwOutLead(lot), 'Its use-by was 4 Nov.');
  assert.equal(throwOutLead({ ...lot, state: 'soon' }), 'Its use-by is 4 Nov.');
});

test('a number typed for a unit', () => {
  assert.deepEqual(numberIn('3.5', 'L'), { value: 3.5 });
  assert.deepEqual(numberIn('12', 'pcs'), { value: 12 });
  assert.equal(numberIn('1.5', 'pcs').error, 'Give a whole number of pcs over 0 up to 100,000');
  assert.equal(numberIn('1.234', 'kg').error, 'Give the kg as a number over 0 up to 100,000, at most 2 decimals');
  assert.equal(numberIn('0', 'kg').error, 'Give the kg as a number over 0 up to 100,000, at most 2 decimals');
  assert.deepEqual(numberIn('0', 'kg', { zero: true }), { value: 0 });
  assert.equal(numberIn('', 'kg').error, 'Give the qty');
  assert.equal(numberIn('1,5', 'kg').error, 'Give the kg as a number over 0 up to 100,000, at most 2 decimals');
});

test("the item dialog's body: a chemical's fields; a block item's level only", () => {
  assert.deepEqual(itemBody({ name: ' Bleach ', kind: 'chemical', unit: 'L', reorderAt: '2', ingredient: 'Sodium hypochlorite', lrmpNo: '' }), {
    name: 'Bleach', kind: 'chemical', unit: 'L', ingredient: 'Sodium hypochlorite', lrmpNo: null, reorderAt: 2,
  });
  assert.deepEqual(itemBody({ name: 'Bags', kind: 'bags', unit: 'pcs', reorderAt: '' }), { name: 'Bags', kind: 'bags', unit: 'pcs', reorderAt: null });
  assert.deepEqual(itemBody({ name: '', kind: 'bags', unit: 'pcs' }), { error: 'Give the name', field: 'name' });
  assert.equal(itemBody({ name: 'Bags', kind: 'bags', unit: 'pcs', reorderAt: '2.5' }).field, 'reorderAt');
  assert.deepEqual(itemBody({ reorderAt: '200' }, item({ kind: 'blocks', unit: 'blocks' })), { reorderAt: 200 });
});

test("Purchase's body", () => {
  const bleach = item();
  assert.deepEqual(purchaseBody({ qty: '3', total: '25', supplier: ' Kedai Ali ', day: '2026-11-05', useBy: '' }, bleach, '2026-11-05'), {
    itemId: 1, qty: 3, total: 25, supplier: 'Kedai Ali', useBy: null, day: '2026-11-05',
  });
  assert.equal(purchaseBody({ qty: '3', total: 'free', day: '2026-11-05' }, bleach, '2026-11-05').field, 'total');
  assert.equal(purchaseBody({ qty: '3', total: '1', day: '2026-11-06' }, bleach, '2026-11-05').field, 'day');
  assert.equal(purchaseBody({ qty: '3', total: '1', day: '2026-11-05', useBy: '2026-11-01' }, bleach, '2026-11-05').field, 'useBy');
});

test("Record use's body: the time only when changed, not in the future", () => {
  const bleach = item();
  const now = at('2026-11-05', '09:00');
  const shown = { date: '2026-11-05', time: '09:00' };
  const v = { qty: '1', roomId: '2', reason: 'Footbath', worker: 'Ali', date: '2026-11-05', time: '09:00' };
  assert.deepEqual(useBody(v, bleach, { now, shown }), { itemId: 1, qty: 1, roomId: 2, reason: 'Footbath', worker: 'Ali' });
  assert.equal(useBody({ ...v, time: '8:30' }, bleach, { now, shown }).at, at('2026-11-05', '08:30'));
  assert.equal(useBody({ ...v, roomId: '' }, bleach, { now, shown }).roomId, null);
  assert.equal(useBody({ ...v, worker: '' }, bleach, { now, shown }).field, 'worker');
  assert.equal(useBody({ ...v, time: '10:30' }, bleach, { now, shown }).field, 'time');
  assert.equal(useBody({ ...v, time: 'soon' }, bleach, { now, shown }).field, 'time');
});

test('the edit bodies carry only what changed', () => {
  const bleach = item();
  const buy = { qty: 5, total: 25, supplier: 'Kedai Ali', useBy: null, at: at('2026-11-03') };
  assert.deepEqual(purchaseEditBody({ qty: '5', total: '30', supplier: 'Kedai Ali', day: '2026-11-03', useBy: '' }, buy, bleach, '2026-11-05'), { total: 30 });
  const use = { qty: -1, roomId: null, reason: 'Footbath', worker: 'Ali', at: at('2026-11-03', '08:12') };
  const shown = { date: '2026-11-03', time: '08:12' };
  assert.deepEqual(useEditBody({ qty: '2', roomId: '', reason: 'Footbath', worker: 'Ali', date: '2026-11-03', time: '08:12' }, use, bleach, { now: at('2026-11-05'), shown }), { qty: 2 });
});

test('more than in stock asks', () => {
  assert.equal(overStock(5, item({ qty: 2 })).replace(/\u00a0/g, ' '), 'Only 2.00 L in stock. Record 5.00 L anyway?');
  assert.equal(overStock(2, item({ qty: 2 })), null);
  assert.equal(overStock(1, item({ qty: -3 })).replace(/\u00a0/g, ' '), 'Only 0.00 L in stock. Record 1.00 L anyway?');
});

test("Count stock's body: typed boxes only, each checked; who once", () => {
  const entries = [{ itemId: 1, unit: 'L', text: '3.5' }, { itemId: 2, unit: 'pcs', text: '' }, { itemId: 3, unit: 'pcs', text: '0' }];
  assert.deepEqual(countBody(entries, 'Ali'), { worker: 'Ali', counts: [{ itemId: 1, qty: 3.5 }, { itemId: 3, qty: 0 }] });
  assert.deepEqual(countBody(entries, ''), { error: 'Pick who counted', field: 'worker' });
  assert.deepEqual(countBody([{ itemId: 2, unit: 'pcs', text: '1.5' }], 'Ali'), { error: 'Give a whole number of pcs from 0 up to 100,000', field: 'count-2' });
  assert.deepEqual(countBody([{ itemId: 2, unit: 'pcs', text: '' }], 'Ali'), { error: 'Type at least one count', field: null });
});

test('the 4-5 sheet: twelve columns; a row in the farm words; the range; the empty line', () => {
  assert.equal(SHEET_COLUMNS.length, 12);
  const row = { date: '2026-11-03', kind: 'use', crop: 'Grey oyster', location: 'Container 1', product: 'Bleach (Sodium hypochlorite)', lrmpNo: '', price: null, qty: 1, unit: 'L', reason: 'Footbath', operator: 'Ali' };
  assert.deepEqual(sheetCells(row).map((c) => c.replace(/\u00a0/g, ' ')), ['3 Nov 2026', 'Grey oyster', 'Container 1', 'Bleach (Sodium hypochlorite)', '', '', '1.00 L used', 'Footbath', '', 'Ali', '', '']);
  assert.equal(sheetCells({ ...row, kind: 'purchase', price: 25, qty: 5 })[5].replace(/\u00a0/g, ' '), 'RM 25.00');
  assert.equal(sheetCells({ ...row, kind: 'purchase', price: 25, qty: 5 })[6].replace(/\u00a0/g, ' '), '5.00 L bought');
  assert.equal(sheetRange({ from: '2026-10-07', to: '2026-11-05' }), '7 Oct 2026 – 5 Nov 2026');
  assert.equal(sheetEmpty(90), 'No chemical purchases or uses in the last 90 days.');
});

test("the pickers' options", () => {
  assert.deepEqual(KIND_OPTIONS.map(([k]) => k), ['spawn', 'bags', 'chemical', 'packaging', 'other']);
  assert.deepEqual(UNIT_OPTIONS.map(([u]) => u), ['pcs', 'kg', 'g', 'L', 'mL']);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-math.test.js`
Expected: FAIL (the new names are not exported).

- [ ] **Step 3: Add the imports and the pure parts**

At the top of `web/inventory-math.js`, after the header comment, add:

```js
import { DOT } from './text-math.js';
import { farmDate, farmTime, daysFrom } from './tasks-math.js';
import { whenMs } from './harvest-math.js';
import { normaliseClock } from './light-math.js';
```

Append to `web/inventory-math.js`:

```js
// The farm day n days before `date` ('YYYY-MM-DD'): the date boxes' earliest day.
export const daysBefore = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

// ---- the pages (spec 5) ----

export const KIND_NAMES = { blocks: 'Blocks', spawn: 'Spawn', bags: 'Bags', chemical: 'Chemicals', packaging: 'Packaging', other: 'Other' };
const KIND_ORDER = Object.keys(KIND_NAMES);
// The kinds an item is made with here (Batches makes the block items) and the units: [value, label].
export const KIND_OPTIONS = [['spawn', 'Spawn'], ['bags', 'Bags'], ['chemical', 'Chemical'], ['packaging', 'Packaging'], ['other', 'Other']];
export const KIND_ONE = Object.fromEntries([...KIND_OPTIONS, ['blocks', 'Blocks']]);
export const UNIT_OPTIONS = [['pcs', 'pcs (a count)'], ['kg', 'kg'], ['g', 'g'], ['L', 'L'], ['mL', 'mL']];
const MAX_QTY = 100_000;
const MAX_TOTAL = 1_000_000;
const MAX_TEXT = 60;

// An item's one pill, the worst: Archived (grey), Expired (red), Low, Use by 12 Nov (amber); null when nothing to say.
export function pillOf(item) {
  if (item.archived) return { text: 'Archived', tone: 'none' };
  if (item.useBy?.state === 'expired') return { text: 'Expired', tone: 'warn' };
  if (item.low) return { text: 'Low', tone: 'amber' };
  if (item.useBy?.state === 'soon') return { text: `Use by ${dayText(item.useBy.date)}`, tone: 'amber' };
  return null;
}
export function lotPill(lot) {
  if (lot.state === 'expired') return { text: 'Expired', tone: 'warn' };
  if (lot.state === 'soon') return { text: `Use by ${dayText(lot.useBy)}`, tone: 'amber' };
  return null;
}

// Last counted in words; stale (muted) over 7 days or never: a reminder, not a fault, so never amber.
export function countedText(at, now) {
  if (!finite(at)) return { text: 'never', stale: true };
  const days = daysFrom(farmDate(at), farmDate(now));
  if (days <= 0) return { text: 'today', stale: false };
  if (days === 1) return { text: 'yesterday', stale: false };
  if (days <= 7) return { text: `${days} days ago`, stale: false };
  return { text: `not counted for ${days} days`, stale: true };
}

// The attention line's parts: "2 low" and "1 to use by 12 Nov" amber, "1 expired" red. items: the list (a lone soon item's day).
export function attentionParts(attention, items = []) {
  const parts = [];
  if (attention?.low) parts.push({ text: `${attention.low} low`, tone: 'amber' });
  if (attention?.soon) {
    const dates = items.filter((i) => i.useBy?.state === 'soon').map((i) => i.useBy.date).sort();
    parts.push({ text: attention.soon === 1 && dates.length ? `1 to use by ${dayText(dates[0])}` : `${attention.soon} to use within 7 days`, tone: 'amber' });
  }
  if (attention?.expired) parts.push({ text: `${attention.expired} expired`, tone: 'warn' });
  return parts;
}

// The list's groups in the contract's order of kinds (an empty kind left out); in a group the items with a pill first,
// each part in the order given (the server's: by name).
export function groupItems(items) {
  return KIND_ORDER.map((kind) => {
    const list = items.filter((i) => i.kind === kind);
    const first = list.filter((i) => !i.archived && pillOf(i));
    return { kind, name: KIND_NAMES[kind], items: [...first, ...list.filter((i) => !first.includes(i))] };
  }).filter((g) => g.items.length);
}

// A lot's name: "Bought 1 Nov", "Batch 14", "Count 3 Nov".
export function lotLabel(lot) {
  if (lot.refKind === 'batch') return `Batch ${lot.refId}`;
  if (lot.refKind === 'adjust') return `Count ${dayText(farmDate(lot.at))}`;
  return `Bought ${dayText(farmDate(lot.at))}`;
}

const joined = (...parts) => parts.filter(Boolean).join(DOT);

// A history row: { when ("3 Nov" for a purchase, "3 Nov 08:12" else), what, qty (signed), edit: 'edit' (a purchase or a
// use), 'delete' (a count: deleted, not edited) or null (a batch move: Batches') }.
export function moveLine(m, item) {
  const when = m.refKind === 'purchase' ? dayText(farmDate(m.at)) : `${dayText(farmDate(m.at))} ${farmTime(m.at)}`;
  let what;
  if (m.refKind === 'purchase') what = joined(m.supplier ? `Bought from ${m.supplier}` : 'Bought', rmText(m.total), m.useBy && `use by ${dayText(m.useBy)}`);
  else if (m.refKind === 'adjust') what = joined(`Counted ${qtyText(m.counted, item.unit)}`, m.worker);
  else if (m.refKind === 'batch') what = joined(`Batch ${m.refId}`, m.qty > 0 ? 'received' : item.kind === 'blocks' ? `into ${m.roomName ?? 'a room'}` : 'made');
  else if (m.lotId !== null && m.lotId !== undefined) what = joined('Thrown out', m.reason === 'Expired' ? 'expired' : null, m.worker);
  else what = joined(m.roomId === null || m.roomId === undefined ? 'Used' : `Used in ${m.roomName ?? 'a deleted room'}`, m.reason, m.worker);
  const edit = m.refKind === 'batch' ? null : m.refKind === 'adjust' ? 'delete' : 'edit';
  return { when, what, qty: qtyText(m.qty, item.unit, { signed: true }), edit };
}

// The Delete confirm: "Delete the purchase of 5.00 L of Bleach on 3 Nov?"; its lead (null for none).
export function deleteTitle(m, item) {
  const day = dayText(farmDate(m.at));
  if (m.refKind === 'adjust') return `Delete the count of ${item.name} on ${day}?`;
  const what = m.refKind === 'purchase' ? 'purchase' : m.lotId !== null && m.lotId !== undefined ? 'throw-out' : 'use';
  return `Delete the ${what} of ${qtyText(Math.abs(m.qty), item.unit)} of ${item.name} on ${day}?`;
}
export function deleteLead(m, { throwOuts = false } = {}) {
  if (m.refKind === 'adjust') return 'In stock goes back to what the records said without it.';
  return m.refKind === 'purchase' && throwOuts ? 'The throw-outs taken from it go with it.' : null;
}

// The Throw out confirm.
export const throwOutTitle = (lot, item) => `Throw out ${qtyText(lot.left, item.unit)} of ${item.name} bought ${dayText(farmDate(lot.at))}?`;
export const throwOutLead = (lot) => `Its use-by ${lot.state === 'expired' ? 'was' : 'is'} ${dayText(lot.useBy)}.`;

// ---- the dialogs' bodies: { …body } or { error, field } ----

// A number typed for the unit: whole for pcs, g, mL and blocks; up to 2 decimals for kg and L; a point, never a comma.
export function numberIn(text, unit, { zero = false, label = 'qty' } = {}) {
  const s = String(text ?? '').trim();
  if (s === '') return { error: `Give the ${label}` };
  const whole = WHOLE_UNITS.includes(unit);
  const n = (whole ? /^[0-9]{1,6}$/ : /^[0-9]{1,6}(\.[0-9]{1,2})?$/).test(s) ? Number(s) : NaN;
  if ((zero ? n >= 0 : n > 0) && n <= MAX_QTY) return { value: n };
  const from = zero ? 'from 0' : 'over 0';
  return { error: whole ? `Give a whole number of ${unit} ${from} up to 100,000` : `Give the ${unit} as a number ${from} up to 100,000, at most 2 decimals` };
}
const textIn = (v) => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};
const tooLong = (s) => s !== null && s.length > MAX_TEXT;

// Add or Edit item. A block item (Batches') sends its level only.
export function itemBody(values, item = null) {
  const blocks = item?.kind === 'blocks';
  const unit = blocks ? item.unit : values.unit;
  const body = {};
  if (!blocks) {
    const name = textIn(values.name);
    if (!name) return { error: 'Give the name', field: 'name' };
    if (tooLong(name)) return { error: `The name must be at most ${MAX_TEXT} characters`, field: 'name' };
    Object.assign(body, { name, kind: values.kind, unit });
    if (values.kind === 'chemical') {
      for (const [field, label] of [['ingredient', 'active ingredient'], ['lrmpNo', 'LRMP No.']]) {
        const s = textIn(values[field]);
        if (tooLong(s)) return { error: `The ${label} must be at most ${MAX_TEXT} characters`, field };
        body[field] = s;
      }
    }
  }
  if (textIn(values.reorderAt) === null) {
    body.reorderAt = null;
  } else {
    const r = numberIn(values.reorderAt, unit, { zero: true, label: 'reorder level' });
    if (r.error) return { error: r.error, field: 'reorderAt' };
    body.reorderAt = r.value;
  }
  return body;
}

// Purchase: today is the farm's day (the latest a purchase may be).
export function purchaseBody(values, item, today) {
  const qty = numberIn(values.qty, item.unit);
  if (qty.error) return { error: qty.error, field: 'qty' };
  const t = String(values.total ?? '').trim();
  const total = /^[0-9]{1,7}(\.[0-9]{1,2})?$/.test(t) ? Number(t) : NaN;
  if (!(total >= 0 && total <= MAX_TOTAL)) return { error: 'Give the total paid in RM, from 0 to 1,000,000', field: 'total' };
  const supplier = textIn(values.supplier);
  if (tooLong(supplier)) return { error: `The supplier must be at most ${MAX_TEXT} characters`, field: 'supplier' };
  const day = String(values.day ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return { error: 'Pick a day up to today', field: 'day' };
  const useBy = String(values.useBy ?? '');
  if (useBy && useBy < day) return { error: 'The use-by cannot be before the day it was bought', field: 'useBy' };
  return { itemId: item.id, qty: qty.value, total, supplier, useBy: useBy || null, day };
}

// Record use. shown: the date and time boxes as they opened ({ date, time }); unchanged, the server takes now.
export function useBody(values, item, { now, shown }) {
  const qty = numberIn(values.qty, item.unit);
  if (qty.error) return { error: qty.error, field: 'qty' };
  const reason = textIn(values.reason);
  if (tooLong(reason)) return { error: `The reason must be at most ${MAX_TEXT} characters`, field: 'reason' };
  if (!values.worker) return { error: 'Pick who used it', field: 'worker' };
  const body = { itemId: item.id, qty: qty.value, roomId: values.roomId ? Number(values.roomId) : null, reason, worker: values.worker };
  const date = String(values.date ?? '');
  const time = normaliseClock(values.time);
  if (date === shown.date && time === shown.time) return body;
  if (Number.isNaN(whenMs(date, '00:00'))) return { error: 'Pick a date', field: 'date' };
  const at = whenMs(date, time);
  if (Number.isNaN(at)) return { error: 'Give the time as 24 h, like 08:12', field: 'time' };
  if (at > now + 60_000) return { error: 'Pick a time up to now', field: 'time' };
  return { ...body, at };
}

// The Edit dialogs: only what changed (an empty body: nothing to send).
export function purchaseEditBody(values, m, item, today) {
  const full = purchaseBody(values, item, today);
  if (full.error) return full;
  const was = { qty: m.qty, total: m.total, supplier: m.supplier, useBy: m.useBy, day: farmDate(m.at) };
  return Object.fromEntries(Object.keys(was).filter((k) => full[k] !== was[k]).map((k) => [k, full[k]]));
}
export function useEditBody(values, m, item, { now, shown }) {
  const full = useBody(values, item, { now, shown });
  if (full.error) return full;
  const body = {};
  if (full.qty !== -m.qty) body.qty = full.qty;
  if (full.roomId !== m.roomId) body.roomId = full.roomId;
  if (full.reason !== m.reason) body.reason = full.reason;
  if (full.worker !== m.worker) body.worker = full.worker;
  if ('at' in full) body.at = full.at;
  return body;
}

// Record use asks once when the qty is over what is in stock (a check, not a fault): the words, or null.
export function overStock(qty, item) {
  const has = Math.max(item.qty ?? 0, 0);
  return qty > has + 1e-9 ? `Only ${qtyText(has, item.unit)} in stock. Record ${qtyText(qty, item.unit)} anyway?` : null;
}

// Count stock: entries [{ itemId, unit, text }]; an empty box is skipped. field: 'worker', 'count-<itemId>' or null.
export function countBody(entries, worker) {
  if (!worker) return { error: 'Pick who counted', field: 'worker' };
  const counts = [];
  for (const e of entries) {
    if (String(e.text ?? '').trim() === '') continue;
    const n = numberIn(e.text, e.unit, { zero: true, label: 'count' });
    if (n.error) return { error: n.error, field: `count-${e.itemId}` };
    counts.push({ itemId: e.itemId, qty: n.value });
  }
  if (!counts.length) return { error: 'Type at least one count', field: null };
  return { worker, counts };
}

// ---- the myGAP 4-5 sheet (spec 5.1) ----

export const SHEET_TITLE = 'myGAP 4-5 · Purchase and use of pesticides / chemicals (Pembelian dan penggunaan racun perosak / bahan kimia)';
export const SHEET_COLUMNS = ['Date', 'Crop', 'Location & area', 'Trade name & active ingredient', 'LRMP No.', 'Price', 'Qty bought / rate used',
  'Reason for use', 'Equipment', 'Operator', 'PHI (days)', 'Re-entry period'];
// The columns left blank to write in by hand.
export const SHEET_WRITE = [8, 10, 11];
export const SHEET_DAYS = [30, 90, 365];
export const sheetCells = (r) => [
  longDayText(r.date), r.crop, r.location, r.product, r.lrmpNo, r.price === null ? '' : rmText(r.price),
  `${qtyText(r.qty, r.unit)} ${r.kind === 'purchase' ? 'bought' : 'used'}`, r.reason, '', r.operator, '', '',
];
export const sheetRange = ({ from, to }) => `${longDayText(from)} – ${longDayText(to)}`;
export const sheetEmpty = (days) => `No chemical purchases or uses in the last ${days} days.`;
```

- [ ] **Step 4: Run the tests (and the server ones that use the formatter)**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-math.test.js tests/inventory-alerts.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/inventory-math.js tests/web-inventory-math.test.js
git commit -m "Inventory: the pages' pure parts (pills, words, lines, the dialogs' bodies, the 4-5 cells)"
```

---

### Task 11: The addresses and the live event

**Files:**
- Modify: `web/route.js` (constants and `parseRoute`/`canonicalHash` branches), `web/live.js` (`EVENT_TYPES`)
- Test: `tests/web-inventory-route.test.js`

- [ ] **Step 1: Write the failing test**

```js
// The Inventory addresses (spec 2026-11-05-inventory-design.md 5) and its live event.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, isCanonical, canonicalHash, INVENTORY_HASH, INVENTORY_COUNT_HASH, inventoryItemHash, inventorySheetHash } from '../web/route.js';
import { EVENT_TYPES } from '../web/live.js';

test('the list, an item, Count stock and the 4-5 sheet', () => {
  assert.deepEqual(parseRoute('#/business/inventory'), { name: 'inventory' });
  assert.deepEqual(parseRoute('#/business/inventory/'), { name: 'inventory' });
  assert.deepEqual(parseRoute('#/business/inventory/7'), { name: 'inventoryItem', id: 7 });
  assert.deepEqual(parseRoute('#/business/inventory/count'), { name: 'inventoryCount' });
  assert.deepEqual(parseRoute('#/business/inventory/sheet?days=90'), { name: 'inventorySheet', days: 90 });
  assert.deepEqual(parseRoute('#/business/inventory/sheet'), { name: 'inventorySheet', days: 30 });
  assert.deepEqual(parseRoute('#/business/inventory/sheet?days=7'), { name: 'inventorySheet', days: 30 });
  assert.deepEqual(parseRoute('#/business/inventory/0'), { name: 'overview' });
  assert.deepEqual(parseRoute('#/business/inventory/other'), { name: 'overview' });
});

test('one address each', () => {
  assert.equal(INVENTORY_HASH, '#/business/inventory');
  assert.equal(INVENTORY_COUNT_HASH, '#/business/inventory/count');
  assert.equal(inventoryItemHash(7), '#/business/inventory/7');
  assert.equal(inventorySheetHash(365), '#/business/inventory/sheet?days=365');
  for (const h of ['#/business/inventory', '#/business/inventory/7', '#/business/inventory/count', '#/business/inventory/sheet?days=30']) {
    assert.ok(isCanonical(h), h);
  }
  assert.equal(canonicalHash(parseRoute('#/business/inventory/sheet')), '#/business/inventory/sheet?days=30');
  assert.equal(isCanonical('#/business/inventory/'), false);
});

test("the pages hear 'inventory'", () => {
  assert.ok(EVENT_TYPES.includes('inventory'));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-route.test.js`
Expected: FAIL (the names are not exported).

- [ ] **Step 3: Add the addresses and the event**

In `web/route.js`, after `export const sheetHash = …;`:

```js
// ---- Inventory (spec 2026-11-05-inventory-design.md 5): the list, an item, Count stock and the myGAP 4-5 sheet with its
// period (30, 90 or 365 days; 30 without one). Reached by address until the Business entry is added at the merge. ----
export const INVENTORY_HASH = '#/business/inventory';
export const INVENTORY_COUNT_HASH = `${INVENTORY_HASH}/count`;
export const inventoryItemHash = (id) => `${INVENTORY_HASH}/${id}`;
const INVENTORY_SHEET_DAYS = [30, 90, 365];
export const inventorySheetHash = (days = 30) => `${INVENTORY_HASH}/sheet?days=${days}`;
```

In `parseRoute`, before the line `// #/rooms (the Rooms list until 2026-10-28) is the Overview now …`:

```js
  // ---- Inventory ----
  const inventory = /^#\/business\/inventory(?:\/(count|sheet|[1-9][0-9]{0,14}))?\/?(?:\?(.*))?$/.exec(hash ?? '');
  if (inventory) {
    if (inventory[1] === 'count') return { name: 'inventoryCount' };
    if (inventory[1] === 'sheet') {
      const n = Number(new URLSearchParams(inventory[2] ?? '').get('days'));
      return { name: 'inventorySheet', days: INVENTORY_SHEET_DAYS.includes(n) ? n : 30 };
    }
    return inventory[1] ? { name: 'inventoryItem', id: Number(inventory[1]) } : { name: 'inventory' };
  }
```

In `canonicalHash`, before `return route.name === 'settings' ? …`:

```js
  if (route.name === 'inventory') return INVENTORY_HASH; // ---- Inventory ----
  if (route.name === 'inventoryItem') return inventoryItemHash(route.id);
  if (route.name === 'inventoryCount') return INVENTORY_COUNT_HASH;
  if (route.name === 'inventorySheet') return inventorySheetHash(route.days);
```

In `web/live.js`: `export const EVENT_TYPES = ['room', 'alarms', 'outdoor', 'simulation', 'sizing', 'tasks', 'harvest'];` → add `'inventory'` at the end.

- [ ] **Step 4: Run the route and live tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-route.test.js tests/web-route.test.js tests/web-live.test.js`
Expected: PASS. (If `tests/web-live.test.js` compares `EVENT_TYPES` whole, add `'inventory'` to its expected list.)

- [ ] **Step 5: Commit**

```bash
git add web/route.js web/live.js tests/web-inventory-route.test.js tests/web-live.test.js
git commit -m "Inventory: the four addresses and the inventory live event"
```

---

### Task 12: The dialogs

**Files:**
- Create: `web/inventory-dialogs.js`
- Test: `tests/web-inventory-pages.test.js` (source checks, as `tests/web-harvest-page.test.js` does: the DOM is checked in the browser in Task 18)

- [ ] **Step 1: Write the failing source checks**

```js
// The Inventory pages and dialogs (spec 2026-11-05-inventory-design.md 4 and 5). Source checks; the look is checked in the
// browser (the UI/UX audit).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const path = (name) => new URL(`../web/${name}`, import.meta.url);
const src = (name) => readFileSync(path(name), 'utf8');

test('the dialogs: on the tasks openForm; the routes they send to; more than in stock asks once', () => {
  const d = src('inventory-dialogs.js');
  assert.ok(d.includes("from './task-dialogs.js'"));
  for (const route of ["'/api/inventory/items'", "'/api/inventory/purchases'", "'/api/inventory/uses'", '`/api/inventory/moves/${move.id}`', '`/api/inventory/lots/${lot.moveId}/throw-out`']) {
    assert.ok(d.includes(route), route);
  }
  assert.ok(d.includes('overStock('));
  assert.ok(d.includes("`${label} anyway`"));
  assert.ok(d.includes("closeLabel: 'Keep it'"));
  assert.ok(d.includes("label: 'Delete this record'"));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: FAIL (ENOENT: `web/inventory-dialogs.js`).

- [ ] **Step 3: Write `web/inventory-dialogs.js`**

```js
// Inventory's dialogs (spec 2026-11-05-inventory-design.md 4 and 5): Add and Edit item, Purchase, Record use, Edit a purchase
// or a use, Delete a record, Throw out, Archive. On the tasks' openForm, laid out as the Harvest dialogs: the unit inside the
// qty box, the day in the farm's words under a date box, the worker picker, a quiet red Delete at an Edit's footer start.
// Each takes onDone() (the page reads again) and onLost(text) (a failure that came back after the dialog closed).

import { request, routeMissing, OUTDATED } from './api.js';
import { openForm, loadWorkers, setWorker, workerField, errorText } from './task-dialogs.js';
import { whenBoxes, dateHint } from './harvest-math.js';
import { farmDate } from './tasks-math.js';
import {
  KIND_OPTIONS, UNIT_OPTIONS, qtyText, perUnitText, daysBefore, itemBody, purchaseBody, useBody, purchaseEditBody, useEditBody,
  overStock, deleteTitle, deleteLead, throwOutTitle, throwOutLead,
} from './inventory-math.js';

const COMMAND_TIMEOUT = 15000;
const BACK_DAYS = 400;

// → true, or the problem for the dialog: { field, message } (the server's field; 'at' is the time box's) or { message }.
async function send(method, path, body) {
  try {
    await request(method, path, body, COMMAND_TIMEOUT);
    return true;
  } catch (err) {
    if (err.status === 400 && err.field === 'worker') window.dispatchEvent(new CustomEvent('farm:worker')); // renamed or removed
    if (err.status === 400 && err.field) return { field: err.field === 'at' ? 'time' : err.field, message: err.message };
    return { message: routeMissing(err) ? OUTDATED : errorText(err) };
  }
}
const finish = (result, onDone) => {
  if (result === true) onDone?.();
  return result;
};

// Earlier texts offered under a box (a datalist; any other text may still be typed).
function suggest(form, name, list) {
  const input = form.input(name);
  if (!input || !list?.length) return;
  const options = document.createElement('datalist');
  options.id = `iv-list-${name}`;
  for (const text of list) {
    const o = document.createElement('option');
    o.value = text;
    options.append(o);
  }
  input.after(options);
  input.setAttribute('list', options.id);
}

// The unit inside a qty box (the suffix openForm put there).
function setSuffix(form, name, unit) {
  const s = form.input(name)?.parentElement?.querySelector('.tk-suffix');
  if (s) s.textContent = unit;
}

// No workers on the list yet: say where to add them (as Record a harvest does).
function namesLead(names) {
  if (names.length) return [];
  const p = document.createElement('p');
  p.className = 'tk-lead';
  const a = document.createElement('a');
  a.href = '#/settings';
  a.textContent = 'Settings';
  p.append("No names yet: add the workers' names in ", a, ' first.');
  return [p];
}

// The worker picker with a record's own name kept when it is no longer on the list.
function workerFieldWith(names, label, name) {
  const list = name && !names.includes(name) ? [...names, name] : names;
  return { ...workerField(list, label), ...(name ? { value: name } : {}) };
}

// More than in stock asks once (Harvest's pick guard): the first submit says so under the qty box, in amber, and the button
// reads "Record anyway"; the same item and qty again sends it; a changed qty or item asks again.
function createOverGuard(value = 'save', label = 'Record') {
  let asked = null;
  let watching = false;
  return (form, item, qty) => {
    const b = form.button(value);
    const words = overStock(qty, item);
    const key = `${item.id}=${qty}`;
    if (!words || key === asked) {
      b.textContent = label;
      return null;
    }
    asked = key;
    b.textContent = `${label} anyway`;
    if (!watching) {
      watching = true;
      for (const name of ['qty', 'itemId']) {
        form.input(name)?.addEventListener('input', () => { asked = null; b.textContent = label; });
        form.input(name)?.addEventListener('change', () => { asked = null; b.textContent = label; });
      }
    }
    return { field: 'qty', message: words, warn: true };
  };
}

// The date and 24 h time boxes side by side (Record a harvest's).
const whenFields = (shown) => [{
  kind: 'group', className: 'tk-when',
  fields: [
    { name: 'date', label: 'Date', kind: 'date', value: shown.date, min: daysBefore(farmDate(Date.now()), BACK_DAYS), max: farmDate(Date.now()), hintOf: dateHint },
    { name: 'time', label: 'Time', kind: 'text', value: shown.time, placeholder: '08:12', inputMode: 'decimal', maxLength: 5, hint: '24 h, like 08:12' },
  ],
}];

// ---- items ----

// Add (item null) or Edit an item. hasMoves: the unit is shown but cannot change. A block item: its level only.
export function openItemDialog({ item = null, hasMoves = false, onDone, onLost }) {
  const blocks = item?.kind === 'blocks';
  const unit = item?.unit ?? 'pcs';
  const fields = blocks ? [] : [
    { name: 'name', label: 'Name', kind: 'text', value: item?.name ?? '', maxLength: 60, placeholder: 'Bleach' },
    { name: 'kind', label: 'Kind', kind: 'select', value: item?.kind ?? 'chemical', options: KIND_OPTIONS },
    {
      name: 'unit', label: 'Unit', kind: 'select', value: unit, options: UNIT_OPTIONS,
      hint: hasMoves ? 'The unit cannot change once the item has records.' : 'What it is counted in. It cannot change once the item has records.',
    },
  ];
  fields.push({ name: 'reorderAt', label: 'Reorder at', kind: 'number', value: item?.reorderAt ?? '', suffix: unit, hint: 'Low at or under this. Leave it empty for no level.' });
  if (!blocks) {
    fields.push(
      { name: 'ingredient', label: 'Active ingredient', kind: 'text', value: item?.ingredient ?? '', maxLength: 60, hint: 'For the myGAP 4-5 sheet.' },
      { name: 'lrmpNo', label: 'LRMP No.', kind: 'text', value: item?.lrmpNo ?? '', maxLength: 60, hint: "A registered pesticide's number, on its label." },
    );
  }
  const form = openForm({
    title: item ? `Edit ${item.name}` : 'Add an item',
    lead: blocks ? ['Its name and unit come from Batches.'] : [],
    fields,
    buttons: [{ value: 'save', label: item ? 'Save' : 'Add', primary: true }],
    onLost,
    submit: async (v) => {
      const body = itemBody(v, item);
      if (body.error) return { field: body.field, message: body.error };
      return finish(await send(item ? 'PUT' : 'POST', item ? `/api/inventory/items/${item.id}` : '/api/inventory/items', body), onDone);
    },
  });
  if (!blocks) {
    const kind = form.input('kind');
    const unitBox = form.input('unit');
    const chemical = () => {
      for (const name of ['ingredient', 'lrmpNo']) form.input(name).closest('.field').hidden = kind.value !== 'chemical';
    };
    kind.addEventListener('change', chemical);
    unitBox.addEventListener('change', () => setSuffix(form, 'reorderAt', unitBox.value));
    unitBox.disabled = hasMoves;
    chemical();
  }
  return form;
}

// Archive with a confirm; Bring back has none.
export function openArchiveDialog({ item, onDone, onLost }) {
  return openForm({
    title: `Archive ${item.name}?`,
    lead: ['It leaves the list, the attention line and the messages. Its records stay, and Show archived brings it back.'],
    buttons: [{ value: 'archive', label: 'Archive', primary: true }],
    closeLabel: 'Keep it',
    onLost,
    submit: async () => finish(await send('PUT', `/api/inventory/items/${item.id}`, { archived: true }), onDone),
  });
}
export const bringBack = (item) => send('PUT', `/api/inventory/items/${item.id}`, { archived: false });

// ---- Purchase and Record use ----

// items: the list's items (block and archived ones are left out); itemId: the one picked first.
export function openPurchaseDialog({ items, itemId = null, suppliers = [], onDone, onLost }) {
  const list = items.filter((i) => i.kind !== 'blocks' && !i.archived);
  if (!list.length) return null;
  const today = farmDate(Date.now());
  let item = list.find((i) => i.id === itemId) ?? list[0];
  let form = null;
  const priceHint = () => (form ? perUnitText(Number(form.input('total').value), Number(form.input('qty').value), item.unit) : '');
  form = openForm({
    title: 'Purchase',
    fields: [
      { name: 'itemId', label: 'Item', kind: 'select', value: String(item.id), options: list.map((i) => [String(i.id), i.name]) },
      { name: 'qty', label: 'Qty bought', kind: 'number', value: '', suffix: item.unit },
      { name: 'total', label: 'Total paid', kind: 'number', value: '', suffix: 'RM', hintOf: priceHint },
      { name: 'supplier', label: 'Supplier', kind: 'text', value: '', maxLength: 60, hint: 'Optional.' },
      {
        kind: 'group', className: 'tk-when',
        fields: [
          { name: 'day', label: 'Day bought', kind: 'date', value: today, min: daysBefore(today, BACK_DAYS), max: today, hintOf: dateHint },
          { name: 'useBy', label: 'Use by', kind: 'date', value: '', hintOf: (d) => (d ? dateHint(d) : 'Optional.') },
        ],
      },
    ],
    buttons: [{ value: 'save', label: 'Record', primary: true }],
    onLost,
    submit: async (v) => {
      const body = purchaseBody(v, item, farmDate(Date.now()));
      if (body.error) return { field: body.field, message: body.error };
      return finish(await send('POST', '/api/inventory/purchases', body), onDone);
    },
  });
  const hint = () => {
    const h = document.getElementById('tk-f-total-hint');
    if (h) h.textContent = priceHint();
  };
  form.input('qty').addEventListener('input', hint);
  form.input('itemId').addEventListener('change', () => {
    item = list.find((i) => String(i.id) === form.input('itemId').value) ?? item;
    setSuffix(form, 'qty', item.unit);
    hint();
  });
  suggest(form, 'supplier', suppliers);
  return form;
}

// items: the list's items (archived ones left out; block items take uses); reasons: the item's earlier ones.
export async function openUseDialog({ items, itemId = null, reasons = [], onDone, onLost }) {
  const list = items.filter((i) => !i.archived);
  if (!list.length) return null;
  let names;
  let rooms;
  try {
    [names, rooms] = await Promise.all([loadWorkers(), request('GET', '/api/rooms')]);
  } catch (err) {
    onLost?.(errorText(err));
    return null;
  }
  let item = list.find((i) => i.id === itemId) ?? list[0];
  const shown = whenBoxes(Date.now());
  const guard = createOverGuard();
  let form = null;
  form = openForm({
    title: 'Record use',
    lead: namesLead(names),
    fields: [
      { name: 'itemId', label: 'Item', kind: 'select', value: String(item.id), options: list.map((i) => [String(i.id), `${i.name} (${qtyText(i.qty, i.unit)} in stock)`]) },
      { name: 'qty', label: 'Qty used', kind: 'number', value: '', suffix: item.unit },
      { name: 'roomId', label: 'Room', kind: 'select', value: '', options: [['', 'Not in a room'], ...rooms.map((r) => [String(r.id), r.name])] },
      { name: 'reason', label: 'Reason', kind: 'text', value: '', maxLength: 60, placeholder: 'Footbath', hint: 'Optional.' },
      workerField(names, 'Who used it'),
      ...whenFields(shown),
    ],
    buttons: [{ value: 'save', label: 'Record', primary: true }],
    onLost,
    submit: async (v) => {
      const body = useBody(v, item, { now: Date.now(), shown });
      if (body.error) return { field: body.field, message: body.error };
      const asked = guard(form, item, body.qty);
      if (asked) return asked;
      setWorker(body.worker); // kept for the next time, as the Done dialog does
      return finish(await send('POST', '/api/inventory/uses', body), onDone);
    },
  });
  form.input('itemId').addEventListener('change', () => {
    item = list.find((i) => String(i.id) === form.input('itemId').value) ?? item;
    setSuffix(form, 'qty', item.unit);
  });
  suggest(form, 'reason', reasons);
  return form;
}

// ---- a record: Edit, Delete, Throw out ----

// Edit a purchase or a use (a count is deleted, not edited; a batch move is Batches'). throwOuts: the purchase has some.
export async function openMoveDialog({ move, item, suppliers = [], reasons = [], throwOuts = false, onDone, onLost }) {
  const remove = { label: 'Delete this record', action: () => openDeleteDialog({ move, item, throwOuts, onDone, onLost }) };
  if (move.refKind === 'purchase') {
    const form = openForm({
      title: 'Edit a purchase',
      fields: [
        { name: 'qty', label: 'Qty bought', kind: 'number', value: String(move.qty), suffix: item.unit },
        { name: 'total', label: 'Total paid', kind: 'number', value: String(move.total ?? ''), suffix: 'RM' },
        { name: 'supplier', label: 'Supplier', kind: 'text', value: move.supplier ?? '', maxLength: 60, hint: 'Optional.' },
        {
          kind: 'group', className: 'tk-when',
          fields: [
            { name: 'day', label: 'Day bought', kind: 'date', value: farmDate(move.at), max: farmDate(Date.now()), hintOf: dateHint },
            { name: 'useBy', label: 'Use by', kind: 'date', value: move.useBy ?? '', hintOf: (d) => (d ? dateHint(d) : 'Optional.') },
          ],
        },
      ],
      buttons: [remove, { value: 'save', label: 'Save', primary: true }],
      onLost,
      submit: async (v) => {
        const body = purchaseEditBody(v, move, item, farmDate(Date.now()));
        if (body.error) return { field: body.field, message: body.error };
        if (Object.keys(body).length === 0) return true;
        return finish(await send('PUT', `/api/inventory/moves/${move.id}`, body), onDone);
      },
    });
    suggest(form, 'supplier', suppliers);
    return form;
  }
  let names;
  let rooms;
  try {
    [names, rooms] = await Promise.all([loadWorkers(), request('GET', '/api/rooms')]);
  } catch (err) {
    onLost?.(errorText(err));
    return null;
  }
  const shown = whenBoxes(move.at);
  const roomOptions = [['', 'Not in a room'], ...rooms.map((r) => [String(r.id), r.name])];
  if (move.roomId !== null && !rooms.some((r) => r.id === move.roomId)) roomOptions.push([String(move.roomId), 'A deleted room']);
  const form = openForm({
    title: move.lotId === null ? 'Edit a use' : 'Edit a throw-out',
    fields: [
      { name: 'qty', label: 'Qty used', kind: 'number', value: String(-move.qty), suffix: item.unit },
      { name: 'roomId', label: 'Room', kind: 'select', value: move.roomId === null ? '' : String(move.roomId), options: roomOptions },
      { name: 'reason', label: 'Reason', kind: 'text', value: move.reason ?? '', maxLength: 60, hint: 'Optional.' },
      workerFieldWith(names, 'Who used it', move.worker),
      ...whenFields(shown),
    ],
    buttons: [remove, { value: 'save', label: 'Save', primary: true }],
    onLost,
    submit: async (v) => {
      const body = useEditBody(v, move, item, { now: Date.now(), shown });
      if (body.error) return { field: body.field, message: body.error };
      if (Object.keys(body).length === 0) return true;
      return finish(await send('PUT', `/api/inventory/moves/${move.id}`, body), onDone);
    },
  });
  suggest(form, 'reason', reasons);
  return form;
}

export function openDeleteDialog({ move, item, throwOuts = false, onDone, onLost }) {
  return openForm({
    title: deleteTitle(move, item),
    lead: [deleteLead(move, { throwOuts })].filter(Boolean),
    buttons: [{ value: 'delete', label: 'Delete', primary: true, danger: true }],
    closeLabel: 'Keep it',
    onLost,
    submit: async () => finish(await send('DELETE', `/api/inventory/moves/${move.id}`), onDone),
  });
}

export async function openThrowOutDialog({ lot, item, onDone, onLost }) {
  let names;
  try {
    names = await loadWorkers();
  } catch (err) {
    onLost?.(errorText(err));
    return null;
  }
  return openForm({
    title: throwOutTitle(lot, item),
    lead: [throwOutLead(lot), ...namesLead(names)],
    fields: [workerField(names, 'Who threw it out')],
    buttons: [{ value: 'throw', label: 'Throw out', primary: true, danger: true }],
    closeLabel: 'Keep it',
    onLost,
    submit: async (v) => {
      if (!v.worker) return { field: 'worker', message: 'Pick who threw it out' };
      setWorker(v.worker);
      return finish(await send('POST', `/api/inventory/lots/${lot.moveId}/throw-out`, { worker: v.worker }), onDone);
    },
  });
}
```

- [ ] **Step 4: Run the source checks**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/inventory-dialogs.js tests/web-inventory-pages.test.js
git commit -m "Inventory: the dialogs (item, purchase, use, edit, delete, throw out, archive)"
```

---

### Task 13: The list page and its styles

**Files:**
- Create: `web/inventory-page.js`
- Modify: `web/app.js` (an import and one mount line), `web/styles.css` (the `.iv-` block at the end)
- Test: `tests/web-inventory-pages.test.js` (append)

- [ ] **Step 1: Append the failing source checks**

```js
test('the list page: mounted by the router; reads the list on the inventory events; its buttons and links', () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventory from './inventory-page.js';"));
  assert.ok(app.includes(": route.name === 'inventory' ? inventory.mount(view, {})"));
  const page = src('inventory-page.js');
  assert.ok(page.includes("live.on('inventory', () => reload.call())"));
  assert.ok(page.includes("request('GET', archived ? '/api/inventory?archived=1' : '/api/inventory')"));
  for (const words of ['Record use', 'Purchase', 'Count stock', 'Add item', 'myGAP 4-5 sheet', 'No stock items yet.']) assert.ok(page.includes(words), words);
});

test('the styles: one Inventory block at the end, .iv- classes, tokens only', () => {
  const css = src('styles.css');
  const start = css.indexOf('/* ---- Inventory ---- */');
  const end = css.indexOf('/* ---- end Inventory ---- */');
  assert.ok(start > 0 && end > start);
  const block = css.slice(start, end);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/, 'no fixed colours: tokens only');
  for (const sel of block.match(/^[^@\s/}][^{]*\{/gm) ?? []) assert.match(sel, /\.iv-/, sel);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: the two new tests FAIL.

- [ ] **Step 3: Write `web/inventory-page.js`**

```js
// The Inventory page, #/business/inventory (spec 2026-11-05-inventory-design.md 5): every item by kind with what is in stock,
// its reorder level, when it was last counted and its pill; the attention line; Record use, Purchase, Count stock, Add item
// and the myGAP 4-5 sheet. Reads GET /api/inventory on the 'inventory' events, when the stream comes back, and on a timer.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { inventoryItemHash, INVENTORY_COUNT_HASH, inventorySheetHash } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { DOT } from './text-math.js';
import { openItemDialog, openPurchaseDialog, openUseDialog } from './inventory-dialogs.js';
import { groupItems, pillOf, attentionParts, countedText, qtyText } from './inventory-math.js';

const REFRESH_MS = 60_000;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Inventory</h1>
      <p class="page-sub">What is in stock, what was bought and used, and what runs out.</p>
    </div>
    <div class="iv-tools">
      <button type="button" class="primary" data-use>Record use</button>
      <button type="button" data-purchase>Purchase</button>
      <a class="button" data-count>Count stock</a>
      <button type="button" data-add>Add item</button>
      <a class="iv-sheet-link" data-sheet>myGAP 4-5 sheet</a>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <p class="iv-attention" data-attention hidden></p>
  <div class="iv-groups" data-groups></div>
  <section class="card iv-empty" data-empty hidden>
    <p class="none">No stock items yet.</p>
    <button type="button" class="primary" data-add-empty>Add item</button>
  </section>
  <p class="iv-archived" data-archived-line hidden><button type="button" class="iv-link" data-archived></button></p>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

export function pillNode(pill) {
  const p = el('span', 'pill', pill?.text ?? '');
  if (pill) p.dataset.tone = pill.tone;
  return p;
}

// One kind's card: a table of its items (on a phone each row a block: the name and pill, then In stock, then the rest).
function groupCard(group, now) {
  const card = el('section', 'card iv-group');
  const id = `iv-g-${group.kind}`;
  const h = el('h2', '', group.name);
  h.id = id;
  card.setAttribute('aria-labelledby', id);
  const wrap = el('div', 'us-table-wrap');
  const t = el('table', 'us-table iv-table');
  t.append(el('caption', 'sr-only', group.name));
  const head = el('tr');
  for (const [text, cls] of [['Item', ''], ['In stock', 'num'], ['Reorder at', 'num'], ['Last counted', ''], ['', 'iv-state-col']]) {
    const th = el('th', cls, text);
    th.scope = 'col';
    if (!text) th.append(el('span', 'sr-only', 'State'));
    head.append(th);
  }
  const thead = el('thead');
  thead.append(head);
  const body = el('tbody');
  for (const item of group.items) {
    const tr = el('tr');
    tr.dataset.id = String(item.id);
    const name = el('th', 'iv-name');
    name.scope = 'row';
    const a = el('a', '', item.name);
    a.href = inventoryItemHash(item.id);
    name.append(a);
    if (item.ingredient) name.append(el('span', 'iv-sub', item.ingredient));
    const counted = countedText(item.lastCountedAt, now);
    const countCell = el('td', `iv-counted${counted.stale ? ' iv-stale' : ''}`, counted.text);
    countCell.dataset.label = 'Last counted';
    const reorder = el('td', 'num iv-reorder', item.reorderAt === null ? '—' : qtyText(item.reorderAt, item.unit));
    reorder.dataset.label = 'Reorder at';
    const state = el('td', 'iv-state');
    state.append(pillNode(pillOf(item)));
    tr.append(name, el('td', 'num iv-qty', qtyText(item.qty, item.unit)), reorder, countCell, state);
    body.append(tr);
  }
  t.append(thead, body);
  wrap.append(t);
  card.append(h, wrap);
  return card;
}

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    use: q('[data-use]'), purchase: q('[data-purchase]'), count: q('[data-count]'), add: q('[data-add]'), sheet: q('[data-sheet]'),
    banner: q('.banner'), bannerText: q('[data-banner-text]'), attention: q('[data-attention]'), groups: q('[data-groups]'),
    empty: q('[data-empty]'), archivedLine: q('[data-archived-line]'), archived: q('[data-archived]'),
  };
  document.title = 'Inventory · Mushroom farm';
  els.count.href = INVENTORY_COUNT_HASH;
  els.sheet.href = inventorySheetHash(30);

  let data = null; // GET /api/inventory
  let archived = false; // archived items shown
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  const showError = (text) => {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  };

  function paint() {
    const key = JSON.stringify([data, archived]);
    if (key === painted) return;
    painted = key;
    const items = data.items ?? [];
    const parts = attentionParts(data.attention, items);
    els.attention.hidden = parts.length === 0;
    els.attention.replaceChildren(...parts.flatMap((p, i) => {
      const s = el('span', 'iv-att', p.text);
      s.dataset.tone = p.tone;
      return i ? [DOT, s] : [s];
    }));
    els.empty.hidden = items.length > 0 || data.archivedCount > 0;
    els.groups.replaceChildren(...groupItems(items).map((g) => groupCard(g, Date.now())));
    els.archivedLine.hidden = data.archivedCount === 0;
    els.archived.textContent = archived ? 'Hide archived' : `Show archived (${data.archivedCount})`;
    const open = items.filter((i) => !i.archived);
    els.use.disabled = open.length === 0;
    els.purchase.disabled = !open.some((i) => i.kind !== 'blocks');
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', archived ? '/api/inventory?archived=1' : '/api/inventory');
      if (!alive() || mine !== seq) return;
      data = reply;
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  const done = () => load();
  const add = () => openItemDialog({ onDone: done, onLost: showError });
  els.add.addEventListener('click', add);
  q('[data-add-empty]').addEventListener('click', add);
  els.use.addEventListener('click', () => { if (data) openUseDialog({ items: data.items, onDone: done, onLost: showError }); });
  els.purchase.addEventListener('click', () => { if (data) openPurchaseDialog({ items: data.items, suppliers: data.suppliers, onDone: done, onLost: showError }); });
  els.archived.addEventListener('click', () => {
    archived = !archived;
    load();
  });
  q('[data-retry]').addEventListener('click', () => load());

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('inventory', () => reload.call()),
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) {
        clearTimeout(timer);
        timer = setTimeout(load, REFRESH_MS);
      }
    }),
  ];
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
  };
}
```

- [ ] **Step 4: Mount it in `web/app.js`**

With the page imports (after `import * as taskSheet from './task-sheet.js';`):

```js
import * as inventory from './inventory-page.js'; // ---- Inventory ----
```

In the mount chain, before the last line `: overview.mount(view, {});`:

```js
    : route.name === 'inventory' ? inventory.mount(view, {})
```

- [ ] **Step 5: Start the `.iv-` block at the end of `web/styles.css`**

```css
/* ---- Inventory (spec 2026-11-05-inventory-design.md 5) ---- */
.iv-tools { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-left: auto; }
.iv-sheet-link { color: var(--ink-2); font-size: var(--fs-sm); padding: 10px 4px; }
.iv-attention { margin: 0 0 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.iv-att[data-tone="amber"] { color: var(--warning-text); }
.iv-att[data-tone="warn"] { color: var(--critical-text); }
.iv-groups { display: grid; gap: 16px; }
.iv-group h2 { margin: 0 0 8px; font-size: var(--fs-md); font-weight: 600; }
.iv-table .iv-name a { color: var(--ink); font-weight: 600; text-decoration: none; }
.iv-table .iv-name a:hover { text-decoration: underline; }
.iv-sub { display: block; color: var(--muted); font-size: var(--fs-sm); font-weight: 400; }
.iv-table .iv-qty { font-weight: 600; }
.iv-counted { color: var(--ink-2); }
.iv-stale { color: var(--muted); }
.iv-state-col, .iv-state { width: 1%; white-space: nowrap; text-align: right; }
.iv-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; background: transparent; border-style: dashed; border-color: var(--border-strong); }
.iv-empty .none { margin: 0; }
.iv-archived { margin: 12px 0 0; }
.iv-link { background: none; border: 0; padding: 10px 0; color: var(--ink-2); text-decoration: underline; cursor: pointer; font: inherit; }
@media (max-width: 600px) {
  .iv-tools { flex: 1 1 100%; margin-left: 0; }
  .iv-tools > :is(button, a.button) { flex: 1 1 calc(50% - 4px); justify-content: center; min-height: 44px; }
  .iv-table thead { display: none; }
  .iv-table tr { display: grid; grid-template-columns: 1fr auto; gap: 2px 12px; padding: 10px 0; border-top: 1px solid var(--border); }
  .iv-table :is(th, td) { border: 0; padding: 0; }
  .iv-table .iv-name { grid-column: 1; }
  .iv-table .iv-name a { display: inline-block; padding: 4px 0; }
  .iv-table .iv-qty { grid-column: 2; grid-row: 1; }
  .iv-table .iv-state { grid-column: 1 / -1; text-align: left; }
  .iv-table :is(.iv-reorder, .iv-counted) { grid-column: 1 / -1; text-align: left; color: var(--muted); font-size: var(--fs-sm); }
  .iv-table :is(.iv-reorder, .iv-counted)::before { content: attr(data-label) ": "; }
}
/* ---- end Inventory ---- */
```

- [ ] **Step 6: Run the checks and look at the page**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: PASS.

Then look at it in the browser: start a throwaway farm app on a test port with a throwaway database:

```bash
mkdir -p /tmp/inventory && rm -f /tmp/inventory/look.db*
FARM_PORT=18950 FARM_DB=/tmp/inventory/look.db FARM_GATEWAY=127.0.0.1:18951 \
  node --disable-warning=ExperimentalWarning server/main.js > /tmp/inventory/look.log 2>&1 &
```

(`FARM_GATEWAY` points at a port nothing listens on, so this app never talks to the live device app on 1502.) Open `http://127.0.0.1:18950/#/business/inventory`, add two items, record a purchase and a use; check 1440 and 390 px in both themes. Stop the app afterwards (`kill %1`).

- [ ] **Step 7: Commit**

```bash
git add web/inventory-page.js web/app.js web/styles.css tests/web-inventory-pages.test.js
git commit -m "Inventory: the list page"
```

---

### Task 14: The item page

**Files:**
- Create: `web/inventory-item.js`
- Modify: `web/app.js` (import and mount line), `web/styles.css` (inside the `.iv-` block)
- Test: `tests/web-inventory-pages.test.js` (append)

- [ ] **Step 1: Append the failing source checks**

```js
test("the item page: mounted; its tiles, lots and history; batch moves not edited; the item's own actions", () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventoryItem from './inventory-item.js';"));
  assert.ok(app.includes(": route.name === 'inventoryItem' ? inventoryItem.mount(view, { id: route.id })"));
  const page = src('inventory-item.js');
  assert.ok(page.includes('request(\'GET\', `/api/inventory/items/${id}`)'));
  for (const words of ['In stock', 'Reorder at', 'Last counted', 'Lots', 'History', 'Change it in Batches', 'Throw out', 'Bring back', 'That item no longer exists.']) {
    assert.ok(page.includes(words), words);
  }
  assert.ok(page.includes('HISTORY_SHOWN = 20'));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: the new test FAILS.

- [ ] **Step 3: Write `web/inventory-item.js`**

```js
// An item's page, #/business/inventory/<id> (spec 2026-11-05-inventory-design.md 5): its tiles (In stock, Reorder at, Last
// counted), its lots with their use-by and Throw out, and its history newest first (20, then Show all) with one quiet Edit a
// row (a count: Delete; a batch move: Batches'). Purchase (not on a block item), Record use, Edit and Archive or Bring back.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { INVENTORY_HASH } from './route.js';
import { live } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { DOT } from './text-math.js';
import {
  openItemDialog, openPurchaseDialog, openUseDialog, openMoveDialog, openDeleteDialog, openThrowOutDialog, openArchiveDialog, bringBack,
} from './inventory-dialogs.js';
import { pillNode } from './inventory-page.js';
import { qtyText, countedText, lotLabel, lotPill, moveLine, dayText, KIND_ONE } from './inventory-math.js';

const REFRESH_MS = 60_000;
const HISTORY_SHOWN = 20;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <a class="back" data-back>Inventory</a>
      <h1 class="page-title" tabindex="-1" data-title>Loading…</h1>
      <p class="page-sub" data-sub></p>
    </div>
    <div class="iv-tools" data-tools hidden>
      <button type="button" class="primary" data-use>Record use</button>
      <button type="button" data-purchase>Purchase</button>
      <button type="button" data-edit>Edit</button>
      <button type="button" data-archive>Archive</button>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <div class="iv-item" data-body hidden>
    <section class="card iv-figures" aria-label="Figures">
      <div class="us-tiles iv-tiles" data-tiles></div>
    </section>
    <section class="card iv-lots" data-lots-card aria-labelledby="iv-lots-title" hidden>
      <h2 id="iv-lots-title">Lots</h2>
      <div class="us-table-wrap"><table class="us-table iv-lot-table">
        <caption class="sr-only">Lots</caption>
        <thead><tr><th scope="col">Bought</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Left</th><th scope="col">Use by</th><th scope="col"><span class="sr-only">Action</span></th></tr></thead>
        <tbody data-lots></tbody>
      </table></div>
    </section>
    <section class="card iv-history" aria-labelledby="iv-history-title">
      <h2 id="iv-history-title">History</h2>
      <p class="none" data-no-history hidden>Nothing recorded yet.</p>
      <ul class="iv-moves" data-moves></ul>
      <button type="button" class="iv-link" data-all hidden></button>
    </section>
  </div>
  <section class="card iv-empty" data-gone hidden>
    <p class="none">That item no longer exists.</p>
    <a class="button" data-gone-back>Back to Inventory</a>
  </section>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function tile(label, value, line = null) {
  const t = el('div', 'us-tile');
  t.append(el('p', 'us-label', label), el('p', 'us-kwh', value));
  if (line) t.append(el('p', 'us-basis', line));
  return t;
}

let mountSeq = 0;

export function mount(container, { id }) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    title: q('[data-title]'), sub: q('[data-sub]'), tools: q('[data-tools]'), use: q('[data-use]'), purchase: q('[data-purchase]'),
    edit: q('[data-edit]'), archive: q('[data-archive]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), body: q('[data-body]'),
    tiles: q('[data-tiles]'), lotsCard: q('[data-lots-card]'), lots: q('[data-lots]'), moves: q('[data-moves]'), noHistory: q('[data-no-history]'),
    all: q('[data-all]'), gone: q('[data-gone]'),
  };
  q('[data-back]').href = INVENTORY_HASH;
  q('[data-gone-back]').href = INVENTORY_HASH;
  document.title = 'Inventory · Mushroom farm';

  let data = null; // GET /api/inventory/items/:id
  let showAll = false;
  let seq = 0;
  let timer = null;
  let outdated = false;
  let painted = '';

  const showError = (text) => {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  };
  const done = () => load();

  function paint() {
    const key = JSON.stringify([data, showAll]);
    if (key === painted) return;
    painted = key;
    const it = data;
    const blocks = it.kind === 'blocks';
    els.title.textContent = it.name;
    document.title = `${it.name} · Inventory · Mushroom farm`;
    els.sub.textContent = [KIND_ONE[it.kind] ?? it.kind, `counted in ${it.unit}`, it.ingredient, it.lrmpNo && `LRMP No. ${it.lrmpNo}`].filter(Boolean).join(DOT);
    els.tools.hidden = false;
    els.purchase.hidden = blocks || it.archived;
    els.use.hidden = it.archived;
    els.archive.hidden = blocks;
    els.archive.textContent = it.archived ? 'Bring back' : 'Archive';
    els.body.hidden = false;

    const counted = countedText(it.lastCountedAt, Date.now());
    const pill = it.useBy ? `${it.useBy.state === 'expired' ? 'Expired' : 'Use by'} ${dayText(it.useBy.date)}` : null;
    els.tiles.replaceChildren(
      tile('In stock', qtyText(it.qty, it.unit), [it.low ? 'Low' : null, pill].filter(Boolean).join(DOT) || null),
      tile('Reorder at', it.reorderAt === null ? '—' : qtyText(it.reorderAt, it.unit), it.reorderAt === null ? 'No level set' : null),
      tile('Last counted', counted.text),
    );

    els.lotsCard.hidden = it.lots.length === 0;
    els.lots.replaceChildren(...it.lots.map((lot) => {
      const tr = el('tr');
      const head = el('th', '', lotLabel(lot));
      head.scope = 'row';
      const useBy = el('td');
      const lp = lotPill(lot);
      if (lp) useBy.append(pillNode(lp));
      else useBy.textContent = lot.useBy ? dayText(lot.useBy) : '—';
      const action = el('td', 'iv-lot-action');
      if (lot.state) {
        const b = el('button', 'danger-text', 'Throw out');
        b.type = 'button';
        b.addEventListener('click', () => openThrowOutDialog({ lot, item: it, onDone: done, onLost: showError }));
        action.append(b);
      }
      tr.append(head, el('td', 'num', qtyText(lot.qty, it.unit)), el('td', 'num', qtyText(lot.left, it.unit)), useBy, action);
      return tr;
    }));

    const moves = showAll ? it.moves : it.moves.slice(0, HISTORY_SHOWN);
    els.noHistory.hidden = it.moves.length > 0;
    els.moves.replaceChildren(...moves.map((m) => {
      const line = moveLine(m, it);
      const li = el('li', 'iv-move');
      const text = el('div', 'iv-move-text');
      text.append(el('span', 'iv-move-what', line.what), el('span', 'iv-move-when', line.when));
      li.append(text, el('span', 'iv-move-qty', line.qty));
      if (line.edit === null) {
        li.append(el('span', 'iv-move-note', 'Change it in Batches'));
      } else {
        const b = el('button', 'iv-link iv-move-edit', line.edit === 'edit' ? 'Edit' : 'Delete');
        b.type = 'button';
        const throwOuts = it.moves.some((x) => x.lotId === m.id);
        b.addEventListener('click', () => (line.edit === 'edit'
          ? openMoveDialog({ move: m, item: it, suppliers: it.suppliers, reasons: it.reasons, throwOuts, onDone: done, onLost: showError })
          : openDeleteDialog({ move: m, item: it, onDone: done, onLost: showError })));
        li.append(b);
      }
      return li;
    }));
    els.all.hidden = showAll || it.moves.length <= HISTORY_SHOWN;
    els.all.textContent = `Show all ${it.moves.length}`;
  }

  async function load() {
    if (!alive()) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', `/api/inventory/items/${id}`);
      if (!alive() || mine !== seq) return;
      data = reply;
      els.banner.hidden = true;
      paint();
    } catch (err) {
      if (!alive() || mine !== seq) return;
      if (err.status === 404 && !routeMissing(err)) {
        els.body.hidden = true;
        els.tools.hidden = true;
        els.gone.hidden = false;
        els.title.textContent = 'Item';
        return;
      }
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
      if (routeMissing(err)) { outdated = true; return; }
    }
    if (!alive()) return;
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }

  els.use.addEventListener('click', () => { if (data) openUseDialog({ items: [data], itemId: data.id, reasons: data.reasons, onDone: done, onLost: showError }); });
  els.purchase.addEventListener('click', () => { if (data) openPurchaseDialog({ items: [data], itemId: data.id, suppliers: data.suppliers, onDone: done, onLost: showError }); });
  els.edit.addEventListener('click', () => { if (data) openItemDialog({ item: data, hasMoves: data.moves.length > 0, onDone: done, onLost: showError }); });
  els.archive.addEventListener('click', async () => {
    if (!data) return;
    if (!data.archived) {
      openArchiveDialog({ item: data, onDone: done, onLost: showError });
      return;
    }
    const r = await bringBack(data);
    if (r === true) load();
    else showError(r.message);
  });
  els.all.addEventListener('click', () => {
    showAll = true;
    paint();
  });
  q('[data-retry]').addEventListener('click', () => load());

  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    live.on('inventory', (d) => { if (d?.itemId === null || d?.itemId === undefined || d.itemId === id) reload.call(); }),
    live.on('room', (d) => { if (d.part === 'room') reload.call(); }), // a room renamed or deleted: the history names it
    live.onStatus((up) => {
      if (up) reload.call();
      else if (!outdated) {
        clearTimeout(timer);
        timer = setTimeout(load, REFRESH_MS);
      }
    }),
  ];
  load();

  return function unmount() {
    mountSeq++;
    clearTimeout(timer);
    reload.cancel();
    for (const off of offLive) off();
  };
}
```

- [ ] **Step 4: Mount it in `web/app.js`**

Import after the list page's:

```js
import * as inventoryItem from './inventory-item.js';
```

Mount line after the list page's:

```js
    : route.name === 'inventoryItem' ? inventoryItem.mount(view, { id: route.id })
```

- [ ] **Step 5: Add its styles inside the `.iv-` block (before `/* ---- end Inventory ---- */`)**

```css
.iv-item { display: grid; gap: 16px; }
.iv-tiles { margin: 0; }
.iv-lots h2, .iv-history h2 { margin: 0 0 8px; font-size: var(--fs-md); font-weight: 600; }
.iv-lot-action { text-align: right; }
.iv-moves { list-style: none; margin: 0; padding: 0; }
.iv-move { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 4px 16px; padding: 10px 0; border-top: 1px solid var(--border); }
.iv-move:first-child { border-top: 0; }
.iv-move-text { display: flex; flex-direction: column; min-width: 0; }
.iv-move-when { color: var(--muted); font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.iv-move-qty { font-weight: 600; font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.iv-move-note { color: var(--muted); font-size: var(--fs-sm); }
@media (max-width: 600px) {
  .iv-move { grid-template-columns: 1fr auto; }
  .iv-move :is(.iv-move-edit, .iv-move-note) { grid-column: 1 / -1; justify-self: start; }
}
```

- [ ] **Step 6: Run the checks; look at it**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: PASS. In the throwaway app (Task 13 Step 6), open an item: purchase with a use-by 3 days ahead, Throw out, Edit a use, Delete a count, Archive and Bring back; 1440 and 390 px, both themes.

- [ ] **Step 7: Commit**

```bash
git add web/inventory-item.js web/app.js web/styles.css tests/web-inventory-pages.test.js
git commit -m "Inventory: the item page (tiles, lots, history)"
```

---

### Task 15: Count stock

**Files:**
- Create: `web/inventory-count.js`
- Modify: `web/app.js` (import and mount line), `web/styles.css` (inside the `.iv-` block)
- Test: `tests/web-inventory-pages.test.js` (append)

- [ ] **Step 1: Append the failing source check**

```js
test('Count stock: mounted; one form of every item; sends the typed ones; a refresh keeps the typed boxes', () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventoryCount from './inventory-count.js';"));
  assert.ok(app.includes(": route.name === 'inventoryCount' ? inventoryCount.mount(view, {})"));
  const page = src('inventory-count.js');
  assert.ok(page.includes("send('POST', '/api/inventory/counts'") || page.includes("request('POST', '/api/inventory/counts'"));
  assert.ok(page.includes('countBody('));
  assert.ok(page.includes('By the records'));
  assert.ok(page.includes('location.hash = INVENTORY_HASH'));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: the new test FAILS.

- [ ] **Step 3: Write `web/inventory-count.js`**

```js
// Count stock, #/business/inventory/count (spec 2026-11-05-inventory-design.md 4 and 5): a box for every item not archived,
// by kind, beside what the records say; who once at the top. Save sends the typed boxes as one count (POST
// /api/inventory/counts) and goes back to the list. The records' figures follow the 'inventory' events; the boxes are never
// touched by a refresh (a worker may be halfway along the shelves).

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { INVENTORY_HASH } from './route.js';
import { live } from './live.js';
import { createThrottle } from './live-math.js';
import { loadWorkers, getWorker, setWorker, errorText } from './task-dialogs.js';
import { groupItems, qtyText, countBody } from './inventory-math.js';

const COMMAND_TIMEOUT = 15000;

const TEMPLATE = `
  <div class="page-head">
    <div class="page-titles">
      <a class="back" data-back>Inventory</a>
      <h1 class="page-title" tabindex="-1">Count stock</h1>
      <p class="page-sub">Type what is on the shelf. A box left empty is skipped.</p>
    </div>
  </div>
  <div class="banner" role="alert" hidden>
    <span data-banner-text></span>
    <button type="button" data-retry>Retry</button>
  </div>
  <form class="iv-count" data-form novalidate hidden>
    <div class="card iv-count-who">
      <div class="field">
        <label for="iv-count-worker">Who counted</label>
        <select id="iv-count-worker" data-worker aria-describedby="iv-count-worker-error"></select>
        <p class="field-error" id="iv-count-worker-error" aria-live="polite"></p>
      </div>
    </div>
    <div class="iv-groups" data-groups></div>
    <p class="form-error" role="alert" tabindex="-1" data-error hidden></p>
    <div class="iv-count-send">
      <button type="submit" class="primary" data-save disabled>Save counts</button>
      <span class="muted" data-typed role="status"></span>
    </div>
  </form>
  <section class="card iv-empty" data-empty hidden>
    <p class="none">No stock items to count.</p>
    <a class="button" data-empty-back>Back to Inventory</a>
  </section>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

let mountSeq = 0;

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    form: q('[data-form]'), worker: q('[data-worker]'), workerError: q('#iv-count-worker-error'), groups: q('[data-groups]'),
    error: q('[data-error]'), save: q('[data-save]'), typed: q('[data-typed]'), banner: q('.banner'), bannerText: q('[data-banner-text]'),
    empty: q('[data-empty]'),
  };
  q('[data-back]').href = INVENTORY_HASH;
  q('[data-empty-back]').href = INVENTORY_HASH;
  document.title = 'Count stock · Inventory · Mushroom farm';

  const rows = new Map(); // itemId → { item, input, error, records }
  let busy = false;

  const showError = (text) => {
    els.bannerText.textContent = text;
    els.banner.hidden = false;
  };
  const entries = () => [...rows.values()].map((r) => ({ itemId: r.item.id, unit: r.item.unit, text: r.input.value }));
  function countTyped() {
    const n = entries().filter((e) => e.text.trim() !== '').length;
    els.save.disabled = busy || n === 0;
    els.typed.textContent = n ? `${n} typed` : '';
  }

  function build(items) {
    const open = items.filter((i) => !i.archived);
    els.empty.hidden = open.length > 0;
    els.form.hidden = open.length === 0;
    els.groups.replaceChildren(...groupItems(open).map((g) => {
      const card = el('fieldset', 'card iv-count-group');
      card.append(el('legend', '', g.name));
      for (const item of g.items) {
        const id = `iv-count-${item.id}`;
        const row = el('div', 'field iv-count-row');
        const label = el('label', 'iv-count-name', item.name);
        label.htmlFor = id;
        const records = el('p', 'c-hint iv-count-records', `By the records ${qtyText(item.qty, item.unit)}`);
        records.id = `${id}-hint`;
        const box = el('span', 'tk-suffix-box');
        const input = el('input');
        Object.assign(input, { id, type: 'text', inputMode: 'decimal', autocomplete: 'off' });
        const suffix = el('span', 'tk-suffix', item.unit);
        suffix.setAttribute('aria-hidden', 'true');
        box.append(input, suffix);
        const error = el('p', 'field-error');
        error.id = `${id}-error`;
        error.setAttribute('aria-live', 'polite');
        input.setAttribute('aria-describedby', `${records.id} ${error.id}`);
        input.addEventListener('input', () => {
          error.textContent = '';
          input.removeAttribute('aria-invalid');
          countTyped();
        });
        row.append(label, records, box, error);
        card.append(row);
        rows.set(item.id, { item, input, error, records });
      }
      return card;
    }));
    countTyped();
  }

  // A refresh: the records' figures only.
  function refresh(items) {
    for (const item of items) {
      const r = rows.get(item.id);
      if (!r) continue;
      r.item = item;
      r.records.textContent = `By the records ${qtyText(item.qty, item.unit)}`;
    }
  }

  async function load(first = false) {
    try {
      const [data, names] = await Promise.all([request('GET', '/api/inventory'), first ? loadWorkers() : Promise.resolve(null)]);
      if (!alive()) return;
      els.banner.hidden = true;
      if (first) {
        const mine = getWorker();
        els.worker.replaceChildren(...[['', 'Pick a name'], ...names.map((n) => [n, n])].map(([v, t]) => {
          const o = el('option', '', t);
          o.value = v;
          return o;
        }));
        els.worker.value = names.includes(mine) ? mine : '';
        build(data.items);
      } else {
        refresh(data.items);
      }
    } catch (err) {
      if (!alive()) return;
      showError(routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);
    }
  }

  function fieldError(field, message) {
    if (field === 'worker') {
      els.workerError.textContent = message;
      els.worker.setAttribute('aria-invalid', 'true');
      els.worker.focus();
      return;
    }
    const itemId = field ? Number(String(field).replace(/^count-/, '')) : NaN;
    const r = rows.get(itemId);
    if (r) {
      r.error.textContent = message;
      r.input.setAttribute('aria-invalid', 'true');
      r.input.focus();
      return;
    }
    els.error.textContent = message;
    els.error.hidden = false;
    els.error.focus();
  }

  els.worker.addEventListener('change', () => {
    els.workerError.textContent = '';
    els.worker.removeAttribute('aria-invalid');
  });
  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy) return;
    els.error.hidden = true;
    const body = countBody(entries(), els.worker.value);
    if (body.error) {
      fieldError(body.field, body.error);
      return;
    }
    busy = true;
    countTyped();
    try {
      await request('POST', '/api/inventory/counts', body, COMMAND_TIMEOUT);
      setWorker(body.worker);
      if (alive()) location.hash = INVENTORY_HASH;
    } catch (err) {
      if (!alive()) return;
      // the server names an entry 'counts.<index>' (of the counts sent) or 'worker'
      const m = /^counts\.(\d+)$/.exec(err.field ?? '');
      const field = m ? `count-${body.counts[Number(m[1])]?.itemId}` : err.field === 'worker' ? 'worker' : null;
      if (err.status === 400 && err.field === 'worker') window.dispatchEvent(new CustomEvent('farm:worker'));
      fieldError(field, err.status === 400 ? err.message : errorText(err));
    } finally {
      busy = false;
      if (alive()) countTyped();
    }
  });
  q('[data-retry]').addEventListener('click', () => load(rows.size === 0));

  const reload = createThrottle(() => { if (alive() && rows.size) load(false); });
  const offLive = [live.on('inventory', () => reload.call()), live.onStatus((up) => { if (up) reload.call(); })];
  load(true);

  return function unmount() {
    mountSeq++;
    reload.cancel();
    for (const off of offLive) off();
  };
}
```

(`getWorker` is exported by `web/task-dialogs.js`; check the export list there, as Task 12 did.)

- [ ] **Step 4: Mount it in `web/app.js`**

```js
import * as inventoryCount from './inventory-count.js';
```

```js
    : route.name === 'inventoryCount' ? inventoryCount.mount(view, {})
```

- [ ] **Step 5: Its styles inside the `.iv-` block**

```css
.iv-count { display: grid; gap: 16px; }
.iv-count-who .field { max-width: 320px; margin: 0; }
.iv-count-group { margin: 0; min-width: 0; }
.iv-count-group legend { padding: 0; font-size: var(--fs-md); font-weight: 600; }
.iv-count-row { display: grid; grid-template-columns: minmax(0, 1fr) 160px; grid-template-areas: "name box" "records box" "error error"; align-items: center; gap: 2px 16px; margin: 0; padding: 10px 0; border-top: 1px solid var(--border); }
.iv-count-row:first-of-type { border-top: 0; }
.iv-count-name { grid-area: name; font-weight: 600; }
.iv-count-records { grid-area: records; margin: 0; font-variant-numeric: tabular-nums; }
.iv-count-row .tk-suffix-box { grid-area: box; }
.iv-count-row .field-error { grid-area: error; }
.iv-count-send { display: flex; align-items: center; gap: 12px; }
@media (max-width: 600px) {
  .iv-count-row { grid-template-columns: minmax(0, 1fr) 120px; }
  .iv-count-send button { flex: 1 1 auto; min-height: 44px; }
}
```

- [ ] **Step 6: Run the checks; look at it**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: PASS. In the throwaway app: Count stock with two boxes typed, one empty; a bad figure (1.5 pcs) stays on its row; save goes back to the list and Last counted says "today".

- [ ] **Step 7: Commit**

```bash
git add web/inventory-count.js web/app.js web/styles.css tests/web-inventory-pages.test.js
git commit -m "Inventory: Count stock"
```

---

### Task 16: The myGAP 4-5 sheet

**Files:**
- Create: `web/inventory-sheet.js`
- Modify: `web/app.js` (import and mount line), `web/styles.css` (inside the `.iv-` block)
- Test: `tests/web-inventory-pages.test.js` (append)

The page reuses the Harvest sheet's layout classes (`hv-sheet`, `hv-sheet-tools`, `hv-sheet-title`, `hv-sheet-facts`, `hv-write-line`, `hv-sheet-wrap`, `hv-sheet-table`) and `body.printing-sheet`, so its print rules (no top bar, no buttons, light colours, A4 landscape, the head row on every page) already apply. Inventory only reads those classes; it does not change them.

- [ ] **Step 1: Append the failing source check**

```js
test('the 4-5 sheet: mounted; the period in its address; printing as the 4-6 sheet does', () => {
  const app = src('app.js');
  assert.ok(app.includes("import * as inventorySheet from './inventory-sheet.js';"));
  assert.ok(app.includes(": route.name === 'inventorySheet' ? inventorySheet.mount(view, { days: route.days })"));
  const page = src('inventory-sheet.js');
  assert.ok(page.includes("document.body.classList.add('printing-sheet')"));
  assert.ok(page.includes("document.body.classList.remove('printing-sheet')"));
  assert.ok(page.includes('request(\'GET\', `/api/inventory/sheet?days=${period}`)'));
  assert.ok(page.includes("history.replaceState(null, '', inventorySheetHash(n))"));
  assert.ok(page.includes('window.print()'));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: the new test FAILS.

- [ ] **Step 3: Write `web/inventory-sheet.js`**

```js
// The myGAP 4-5 sheet, #/business/inventory/sheet?days=30 (spec 2026-11-05-inventory-design.md 5 and 5.1): the chemical
// items' purchases and uses of the last 30, 90 or 365 days as the sheet's twelve columns, Equipment, PHI and Re-entry left
// blank to write in. A print page as the Harvest 4-6 sheet (its layout classes and body.printing-sheet).

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { INVENTORY_HASH, inventorySheetHash } from './route.js';
import { live } from './live.js';
import { createThrottle } from './live-math.js';
import { SHEET_TITLE, SHEET_COLUMNS, SHEET_WRITE, SHEET_DAYS, sheetCells, sheetRange, sheetEmpty } from './inventory-math.js';

const TEMPLATE = `
  <div class="hv-sheet iv-sheet">
    <div class="hv-sheet-tools">
      <a class="back" data-back>Back to Inventory</a>
      <div class="range-bar" role="group" aria-label="Period" data-range></div>
      <button type="button" class="primary" data-print>Print</button>
    </div>
    <h1 class="page-title hv-sheet-title" tabindex="-1"></h1>
    <dl class="hv-sheet-facts">
      <div><dt>Farm</dt><dd class="hv-write-line"></dd></div>
      <div><dt>Period</dt><dd data-period>Loading…</dd></div>
    </dl>
    <div class="banner" role="alert" hidden>
      <span data-banner-text></span>
      <button type="button" data-retry>Retry</button>
    </div>
    <p class="none" data-empty hidden></p>
    <div class="hv-sheet-wrap" data-wrap hidden>
      <table class="hv-sheet-table iv-sheet-table">
        <thead><tr data-head></tr></thead>
        <tbody data-rows></tbody>
      </table>
    </div>
  </div>`;

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

let mountSeq = 0;

export function mount(container, { days = 30 } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = TEMPLATE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    period: q('[data-period]'), banner: q('.banner'), bannerText: q('[data-banner-text]'), empty: q('[data-empty]'), wrap: q('[data-wrap]'),
    rows: q('[data-rows]'), range: q('[data-range]'),
  };
  document.title = 'myGAP 4-5 sheet · Mushroom farm';
  document.body.classList.add('printing-sheet'); // print: no top bar, no buttons, light colours (styles.css)
  q('[data-back]').href = INVENTORY_HASH;
  q('.hv-sheet-title').textContent = SHEET_TITLE;
  q('[data-head]').append(...SHEET_COLUMNS.map((c) => {
    const th = el('th', '', c);
    th.scope = 'col';
    return th;
  }));

  let period = days;
  let seq = 0;
  const buttons = SHEET_DAYS.map((n) => {
    const b = el('button', '', `${n} days`);
    b.type = 'button';
    b.addEventListener('click', () => pick(n));
    els.range.append(b);
    return [n, b];
  });
  const showPeriod = () => {
    for (const [n, b] of buttons) b.setAttribute('aria-pressed', String(n === period));
    els.empty.textContent = sheetEmpty(period);
  };
  function pick(n) {
    if (n === period) return;
    period = n;
    history.replaceState(null, '', inventorySheetHash(n));
    showPeriod();
    load();
  }

  function paint(sheet) {
    els.period.textContent = sheetRange(sheet);
    els.empty.hidden = sheet.rows.length > 0;
    els.wrap.hidden = sheet.rows.length === 0;
    els.rows.replaceChildren(...sheet.rows.map((r) => {
      const tr = el('tr');
      tr.append(...sheetCells(r).map((c, i) => el('td', SHEET_WRITE.includes(i) ? 'hv-write' : '', c)));
      return tr;
    }));
  }

  async function load() {
    if (!alive()) return;
    const mine = ++seq;
    try {
      const sheet = await request('GET', `/api/inventory/sheet?days=${period}`);
      if (!alive() || mine !== seq) return;
      els.banner.hidden = true;
      paint(sheet);
    } catch (err) {
      if (!alive() || mine !== seq) return;
      els.bannerText.textContent = routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message;
      els.banner.hidden = false;
      els.period.textContent = '—';
    }
  }

  q('[data-print]').addEventListener('click', () => window.print());
  q('[data-retry]').addEventListener('click', () => load());
  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [live.on('inventory', () => reload.call()), live.onStatus((up) => { if (up) reload.call(); })];
  showPeriod();
  load();

  return function unmount() {
    mountSeq++;
    reload.cancel();
    for (const off of offLive) off();
    document.body.classList.remove('printing-sheet');
  };
}
```

- [ ] **Step 4: Mount it in `web/app.js`**

```js
import * as inventorySheet from './inventory-sheet.js';
```

```js
    : route.name === 'inventorySheet' ? inventorySheet.mount(view, { days: route.days })
```

- [ ] **Step 5: Its styles inside the `.iv-` block**

```css
.iv-sheet .hv-sheet-tools .range-bar { margin: 0; }
.iv-sheet-table { min-width: 1100px; } /* twelve columns: a phone scrolls the sheet sideways */
.iv-sheet-table td:nth-child(4) { min-width: 12rem; }
@media print {
  body.printing-sheet .iv-sheet-table { min-width: 0; font-size: 8pt; }
  body.printing-sheet .iv-sheet-table td { height: 8mm; }
}
```

(The `.iv-` test of Task 13 accepts these selectors: each names an `.iv-` class.)

- [ ] **Step 6: Run the checks; look at it**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: PASS. In the throwaway app: a chemical item with an ingredient and LRMP No., a purchase and a use in a room with crops; the sheet shows both rows; 90 days changes the address; Print opens the browser's dialog with no top bar.

- [ ] **Step 7: Commit**

```bash
git add web/inventory-sheet.js web/app.js web/styles.css tests/web-inventory-pages.test.js
git commit -m "Inventory: the myGAP 4-5 print sheet"
```

---

### Task 17: The Settings card

**Files:**
- Create: `web/inventory-settings.js`
- Modify: `web/settings-page.js` (one holder in the template, one mount line, one unmount line)
- Test: `tests/web-inventory-pages.test.js` (append)

- [ ] **Step 1: Append the failing source check**

```js
test('the Settings card: one switch, saved at once; says so while Telegram is not set up', () => {
  const settings = src('settings-page.js');
  assert.ok(settings.includes("import { mountInventorySettings } from './inventory-settings.js';"));
  assert.ok(settings.includes('<div data-inventory-settings></div>'));
  assert.ok(settings.includes("mountInventorySettings(q('[data-inventory-settings]'))"));
  const card = src('inventory-settings.js');
  assert.ok(card.includes('Send low-stock and use-by messages to Telegram'));
  assert.ok(card.includes("request('PUT', '/api/settings', { inventoryTelegram:"));
  assert.ok(card.includes('Nothing is sent until Telegram is set up above.'));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js`
Expected: the new test FAILS.

- [ ] **Step 3: Write `web/inventory-settings.js`**

```js
// The "Inventory" card of the Settings page (spec 2026-11-05-inventory-design.md 5): one switch, the low-stock and use-by
// messages to the Telegram chat set above, saved as soon as it changes. While Telegram is not set up the note says nothing is
// sent yet (the switch still saves: it takes effect once Telegram is set up, read when Settings opens).

import { request, OFFLINE } from './api.js';

const NOTE = 'Uses the Telegram chat set above. One message when an item first falls to its reorder level, and one per purchase 7 days before its use-by.';

export function mountInventorySettings(container) {
  let alive = true;
  container.innerHTML = `
  <div class="banner" role="alert" data-ivs-banner hidden>
    <span data-ivs-banner-text></span>
    <button type="button" data-ivs-retry>Retry</button>
  </div>
  <section class="card settings iv-settings" id="inventory" aria-labelledby="iv-settings-title" data-ivs-card hidden>
    <h2 id="iv-settings-title">Inventory</h2>
    <label class="tg-check"><input type="checkbox" data-ivs-telegram> Send low-stock and use-by messages to Telegram</label>
    <p class="muted s-hint" data-ivs-note></p>
    <p class="s-saved" data-ivs-saved role="status" hidden></p>
  </section>`;
  const q = (sel) => container.querySelector(sel);
  const card = q('[data-ivs-card]');
  const box = q('[data-ivs-telegram]');
  const note = q('[data-ivs-note]');
  const saved = q('[data-ivs-saved]');
  const banner = q('[data-ivs-banner]');
  const bannerText = q('[data-ivs-banner-text]');

  function paint(s) {
    const ready = Boolean(s.telegramTokenSet && s.telegramChatId);
    box.checked = s.inventoryTelegram !== false;
    box.disabled = false;
    note.textContent = ready ? NOTE : `${NOTE} Nothing is sent until Telegram is set up above.`;
    card.hidden = false;
  }

  async function load() {
    banner.hidden = true;
    try {
      const s = await request('GET', '/api/settings');
      if (alive) paint(s);
    } catch (err) {
      if (!alive) return;
      bannerText.textContent = `Inventory: ${err.status === 0 ? OFFLINE : err.message}`;
      banner.hidden = false;
    }
  }

  box.addEventListener('change', async () => {
    saved.hidden = true;
    const want = box.checked;
    box.disabled = true;
    try {
      const s = await request('PUT', '/api/settings', { inventoryTelegram: want });
      if (!alive) return;
      paint(s);
      saved.textContent = want ? 'Stock messages on.' : 'Stock messages off.';
      saved.hidden = false;
    } catch (err) {
      if (!alive) return;
      box.checked = !want;
      box.disabled = false;
      bannerText.textContent = `Inventory: ${err.status === 0 ? OFFLINE : err.message}`;
      banner.hidden = false;
    }
  });
  q('[data-ivs-retry]').addEventListener('click', () => load());
  load();

  return () => {
    alive = false;
  };
}
```

- [ ] **Step 4: Wire it in `web/settings-page.js`**

1. Imports: after `import { mountYield } from './yield-card.js';` add `import { mountInventorySettings } from './inventory-settings.js';`
2. Template: after `<div data-yield></div>` add `<div data-inventory-settings></div>`
3. After `const unmountTaskSettings = mountTaskSettings(q('[data-task-settings]'));` add `const unmountInventorySettings = mountInventorySettings(q('[data-inventory-settings]'));`
4. In `unmount()`, after `unmountTaskSettings();` add `unmountInventorySettings();`

- [ ] **Step 5: Run the checks and the settings page tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-inventory-pages.test.js tests/web-settings.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add web/inventory-settings.js web/settings-page.js tests/web-inventory-pages.test.js
git commit -m "Inventory: the Settings card (stock messages to Telegram)"
```

---

### Task 18: The documents, the whole suite, the handoff

**Files:**
- Modify: `DESIGN.md` (a `### Inventory` section under Components, after `### Task grid`), `README.md` (a row), `PRODUCT.md` (a Capabilities row)
- Modify: `~/.claude/task-logs/inventory/HANDOFF.md`

- [ ] **Step 1: DESIGN.md**

After the `### Task grid` section, add:

```markdown
### Inventory
(2026-11-05, business module; spec `docs/specs/2026-11-05-inventory-design.md`.) `#/business/inventory`: one card per kind (Blocks, Spawn, Bags, Chemicals, Packaging, Other) with a table Item, In stock, Reorder at, Last counted and one pill, the worst: **Expired** red (`warn`), **Low** and **Use by 12 Nov** amber, **Archived** grey; the items with a pill first in their card. The attention line above the cards, only when there is something: "2 low · 1 to use by 12 Nov · 1 expired" in the same tones. Last counted over 7 days or never is muted words, never amber (a reminder, not a fault: the State-Only Colour Rule). On a phone each row is a block: the name and In stock on the first line, the pill, then "Reorder at" and "Last counted" muted with their labels. An item's page: the tiles In stock, Reorder at, Last counted; Lots (bought, qty, left, use by with its pill, **Throw out** on a soon or expired lot); History newest first, 20 then "Show all N", the signed qty in its own column, one quiet Edit a row (a count: Delete; a batch move: "Change it in Batches", muted). Count stock is a page of its own (`/count`): a box per item beside "By the records 3.50 L", who once at the top, Save counts. The myGAP 4-5 sheet (`/sheet?days=30`) prints as the Harvest 4-6 sheet does, on its classes. One formatter (`web/inventory-math.js`): kg and L to 2 decimals, pcs, g, mL and blocks whole, "−" for under 0, RM to 2 places, "RM 8.33 per L". Styles in one `.iv-` block at the end of `styles.css`.
```

- [ ] **Step 2: README.md and PRODUCT.md**

README: in its list of pages or features, add one row in the same format as Harvest's: "Inventory (`#/business/inventory`): stock items and their purchases, uses and counts; lots with use-by; Low and use-by messages to Telegram; the myGAP 4-5 sheet". PRODUCT.md, the Capabilities table, after the Harvest row:

```markdown
| Inventory | Stock items by kind with a unit each; purchases (RM, supplier, use-by), uses (room, reason, who), counts; lots used oldest first; Low and use-by on the page and once to Telegram; blocks from Batches; the purchases for Costs; the myGAP 4-5 sheet |
```

Also in PRODUCT.md's "Evidence on Hand" note "(the app has no sales records)" stays as is (Sales' to change).

- [ ] **Step 3: The whole suite**

Run: `npm test 2>&1 | tail -20`
Expected: every test passes. Write down the count (`# pass N`).

- [ ] **Step 4: Commit**

```bash
git add DESIGN.md README.md PRODUCT.md
git commit -m "Inventory: DESIGN.md, README and PRODUCT rows"
```

- [ ] **Step 5: The handoff**

Add a row to the State table of `~/.claude/task-logs/inventory/HANDOFF.md`: the date, "Built (plan tasks 1–18)", the branch's last commit (`git log --oneline -1`) and the test count. The next steps (not in this plan, in the contract's process): the UI/UX audit (Impeccable critique + audit at 1440/1024/390 px, both themes) and its fixes; the final code review and the Impeccable finish review and their fixes; then stop at "ready to merge".

---

## Self-review notes (kept for the reviewer)

| Spec part | Task |
|---|---|
| 2 Data, 2.3 upgrade | 1 |
| 3 Figures | 2 |
| 4 Recording (items, purchase, use, count, throw out, edit, delete, events) | 4, 5, 6, 9 |
| 5 Pages (list, item, dialogs, 4-5 sheet, Settings, numbers) | 3, 10–17 |
| 5.1 Sheet columns | 2 (rows), 10 (cells), 16 (page) |
| 6 Telegram | 7, 8, 9 (checks after writes, on `batches`, hourly) |
| 7 API | 9 |
| 8 Files | all |
| 9 Testing | each task's tests; the look in 13–16 and the audit after |

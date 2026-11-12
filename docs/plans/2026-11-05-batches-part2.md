# Batches part 2 (making blocks) Implementation Plan


**Goal:** Make blocks on the farm: saved recipes, the Mix (a made batch with its materials worked out from a recipe), sterilising loads, the inoculation (the spawn line), the incubation (in a grow room or an area, Ready to fruit), Put into a room for made blocks, the made price per block from Inventory's purchase prices, the made stock moves, the CSV's two new columns, the Batches page's Make blocks and Recipes, a made batch's Making card, and the myGAP 4-2 sheet's made rows (spec `docs/specs/2026-11-05-batches-design.md`, part 2: sections 2, 3.1, 4, 5, 6, 7).

**Architecture:** No database version: part 1's version-21 step already made `batch_recipes`, `batch_materials`, `batch_loads` and the batches' making columns; the one schema change (below) goes into `BATCHES_SCHEMA` while v21 is unmerged. The store (`server/batches-db.js`) gets the recipe, material, load and Inventory-item queries; the pure figures (`server/batches-math.js`) get the `making` status, `madePrice` and the made branch of `movesOf`. Part 1's field checks move to a new `server/batches-fields.js` so the making checks can live in a new pure `server/batches-making.js`; `server/batches.js` (`createBatches`) grows `mix`, a made branch of `edit`, loads, recipes and `stockItems`, and its `sync` keeps a made batch's price per block in step. The web side: pure parts in `web/batches-math.js`, the making dialogs and the Making card in a new `web/batches-making.js` (wired into `createBatchDialogs`), the page in `web/batches-page.js`.

**Tech Stack:** Node 22.13+, `node:http`, `node:sqlite` (`DatabaseSync`), plain ES modules in the browser, `node --test`. No dependencies.

**Sources:** the spec (sections 2, 3.1, 4, 5, 6, 7 for part 2), the lead's decisions in `/tmp/batches/part2-decisions.md` (they override anything vaguer in the spec; numbered "decision N" below), the contract `~/.claude/task-logs/business/CONTRACT.md` (Batches reads Inventory's `stock_items` and purchase prices and writes only `'batch'` moves, only when the tables exist; shared-file rules in its section 3). Part 1's plan `docs/plans/2026-11-05-batches-part1.md` for the patterns.

**Rules for every task:**
- Work in `/home/foqcus/Documents/mushroom-farm/.claude/worktrees/batches` (branch `feat/batches`).
- **Re-read the current version of every file you modify before editing it.** Other fixes land on this branch while the plan is carried out (UI fixes to `web/batches-*.js` in particular). The "Find" blocks below quote the files as of `b50fe81`; if one no longer matches word for word, find the same place in the current file and make the same change there, keeping the fixes that landed.
- Never touch `data/v2.db` or the live apps. A manual server uses a free port from 18900–18949 (`ss -ltn | grep 189` first) and a database under `/tmp/batches/`; stop it by its PID afterwards.
- Commit as the repo's configured identity (Ray Tham, GitHub noreply), only the files the task names (`git add <paths>`, never `git add -A`: other sessions' work sits in this worktree).
- One test file: `node --disable-warning=ExperimentalWarning --test tests/<file>`; the whole suite: `npm test`.
- Metric units, RM money; DESIGN.md's named rules (tables over prose in docs).

**Decisions this plan makes where the spec and the decisions are silent** (each is written into the spec in Task 14):

| # | Point | Decision | Why |
|---|---|---|---|
| P1 | `batch_loads.id` | `INTEGER PRIMARY KEY AUTOINCREMENT` (the one schema change, in `BATCHES_SCHEMA`) | Loads have their own `PUT`/`DELETE` routes; part 1's review made every routed id never reused (a stale dialog must not edit the next load). v21 is unmerged, so no new version |
| P2 | Server file size | Part 1's checks move to `server/batches-fields.js`; the making checks go to `server/batches-making.js` (pure) | `server/batches.js` would grow from 394 to ~800 lines |
| P3 | Web file size | The making dialogs and the Making card go to a new `web/batches-making.js`; `createBatchDialogs` spreads them in | Keeps `batches-dialogs.js` and `batches-page.js` under ~400 lines each |
| P4 | Put into a room with no incubation recorded | Sets `incubation 'room'` on the whole delivery in the same write | Decision 3: "Put into a room is offered once inoculated (incubation in a room)"; the spec's Incubate step: "In a grow room: Put into a room" |
| P5 | Where the blocks incubate, once some are in a room | Fixed: a change is a 409 "Take the blocks out of the rooms to change their incubation" | A placed batch's status must not flip back to making under a run |
| P6 | The day count | "Incubating since 4 Nov · day 12": the first day is day 1 | The spec's example; one rule for the status line and the Making card |
| P7 | A made price over RM 1,000 a block | Refused, 400 on `materials` ("The materials come to over RM 1,000 a block: check the amounts") | The column's CHECK is 0–1,000; a slipped decimal must not be a 500 |
| P8 | Inventory items in the pickers | `kind <> 'blocks'` (the blocks items are Batches' own) | A material is never a block |
| P9 | Without Inventory | A `stockItemId` sent is not kept (null); the price is null | Nothing to check it against (decision 4: no picker then) |
| P10 | The 4-2 sheet's made use row | Qty used: the spawn amount; Block / area: "made into 400 blocks" | The spec says the use is "made into 400 blocks"; the spawn is the material used |
| P11 | The plastic bags line | Labelled "Plastic bags" (the batch's bag count is "Bags") | Two boxes called Bags in one dialog |
| P12 | The Recipes dialog | Lists the recipes in use (Edit, Archive); no Restore. `GET /api/batch-recipes?all=1` exists for a later need | The spec asks for list, Add, Edit, Archive only |
| P13 | A made batch's Edit | The head's **Edit** opens Edit the mix (as the Making card's Mix Edit) | A made batch has no Receive fields |
| P14 | The day mixed vs placements | Not checked on an edit | Inoculated ≥ mixed and a placement needs the inoculation, so a placement before the mix cannot happen |
| P15 | Incubating in a grow room | Put into a room keeps part 1's rule (an open run with the crop); the run's stage is not checked. The Incubate dialog says "a room whose run is in its Spawn stage" | The stage is the run's program, which the farm may set after the blocks go in; refusing would block the common order of work |

---

## File map

| File | New/changed | Responsibility |
|---|---|---|
| `server/batches-db.js` | Changed | `batch_loads.id` AUTOINCREMENT; recipe, material and load columns and queries; the batch row's `sterilisedAt` and spawn line; Inventory's items (not blocks) and latest purchase price |
| `server/batches-math.js` | Changed | `statusOf` → `'making'`; `madePrice`; `movesOf(family, checksOf, materials)` |
| `server/batches-fields.js` | New | Part 1's field rules moved out of `batches.js` (BatchError, bad, conflict, number, time and text checks) and `weightOf` |
| `server/batches-making.js` | New | Pure: `checkRecipe`, `checkMaterials`, `checkMade`, `checkLoad`, `MIX_ITEMS`, `METHODS` |
| `server/batches.js` | Changed | Imports the two; `mix`, `editMade`, the made rules in `place`, loads, recipes, `stockItems`; views with the making fields; `sync` keeps the made price; the CSV's `mixed`, `recipe` |
| `server/batches-api.js` | Changed | Part 2's routes (spec 6) and `GET /api/batches/stock-items` (decision 4) |
| `web/batches-math.js` | Changed | The formatter's bags, %, amounts; recipe amounts and lines; the dialogs' boxes and bodies; `statusText`, `placeable`, `makingSteps`, the load line, notes; the page's making group; made facts; the sheet's made rows |
| `web/batches-making.js` | New | `createMakingDialogs` (Recipes, Recipe, Archive, Make blocks / Edit the mix, Sterilise load, Inoculate, Incubate, Ready to fruit) and `makingNodes` (the Making card) |
| `web/batches-dialogs.js` | Changed | Spreads the making dialogs in; the server fields of part 2 mapped to boxes; a made batch's Delete words |
| `web/batches-page.js` | Changed | Make blocks and Recipes in the head; making rows above the waiting ones; a made batch's title, status line, Edit, Put into a room and Making card |
| `web/styles.css` | Changed | Making-card, recipe-list and dialog-layout rules inside the `.bt-` block |
| `tests/batches-fixture.js` | Changed | `openWithInventory(t)` → `{ db, item, buy }` (Inventory's items and purchases); `openWithStock` uses it |
| `tests/db-batches.test.js`, `tests/batches-math.test.js`, `tests/api-batches.test.js`, `tests/batches.test.js` | Changed | Part 2's store, figures and routes; the CSV's head and rows |
| `tests/batches-making.test.js` | New | Recipes, Make blocks, the steps, Put into a room, loads, the price and moves, the stock items, the CSV |
| `tests/web-batches-making.test.js` | New | The web's making parts |
| `docs/specs/2026-11-05-batches-design.md`, `DESIGN.md`, `README.md`, `PRODUCT.md` | Changed | The settled lines; the Batches section and rows |

No change to `server/db.js`, `server/api.js`, `web/route.js`, `web/app.js`, `web/live.js` (no new page, event or version).

---

### Task 1: The store: recipes, materials, loads, Inventory's items

**Files:**
- Modify: `server/batches-db.js`
- Modify: `tests/batches-fixture.js`
- Test: `tests/db-batches.test.js`

- [ ] **Step 1: Inventory's side in the fixture**

Replace the whole of `tests/batches-fixture.js` with:

```js
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';

// Inventory's two tables by the contract's columns (section 5), as Inventory's own step will make them: the Batches tests
// make them to see the stock moves (spec 2026-11-05-batches-design.md 3.1).
export const STOCK = `
CREATE TABLE stock_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, unit TEXT NOT NULL, reorder_at REAL) STRICT;
CREATE TABLE stock_moves (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, at INTEGER NOT NULL, qty REAL NOT NULL, unit_cost REAL,
  ref_kind TEXT NOT NULL, ref_id INTEGER, note TEXT) STRICT;`;

// A farm database that already has Inventory's tables (made first, as a merged farm's would be), removed after the test, and
// Inventory's side of them as its own pages would write it: item(name, kind, unit) → the item's id; buy(itemId, unitCost, at)
// a purchase of 100 at that price (the made price per block reads the latest).
export function openWithInventory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'farm-batches-'));
  const path = join(dir, 'stock.db');
  const raw = new DatabaseSync(path);
  raw.exec(STOCK);
  const db = openDb(path);
  t.after(() => { raw.close(); db.close(); rmSync(dir, { recursive: true, force: true }); });
  return {
    db,
    item: (name, kind = 'other', unit = 'kg') => Number(raw.prepare('INSERT INTO stock_items (name, kind, unit, reorder_at) VALUES (?, ?, ?, NULL)').run(name, kind, unit).lastInsertRowid),
    buy(itemId, unitCost, at = 1000) {
      raw.prepare("INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind, ref_id, note) VALUES (?, ?, 100, ?, 'purchase', NULL, NULL)").run(itemId, at, unitCost);
    },
  };
}

// A farm database that already has Inventory's tables (openWithInventory's, without its helpers).
export const openWithStock = (t) => openWithInventory(t).db;
```

- [ ] **Step 2: Write the failing tests**

In `tests/db-batches.test.js`, change the fixture import to `import { openWithStock, openWithInventory } from './batches-fixture.js';` and append:

```js
const RECIPE = { name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, otherPct: 0, otherName: null, waterPct: 60, bagKg: 2.3, archived: 0, createdAt: 1000 };
const LOAD = { method: 'steam', bags: 200, hotAt: 2000, holdH: 6, tempC: 98, worker: 'Ali', createdAt: 2000 };

test('recipes: insert, read (archived as true or false), update, by name', (t) => {
  const s = fresh(t).batches;
  const r = s.insertRecipe(RECIPE);
  const a = s.insertRecipe({ ...RECIPE, name: 'Bran 25' });
  assert.deepEqual(s.recipe(r), { id: r, ...RECIPE, archived: false });
  s.updateRecipe(r, { archived: 1 });
  assert.equal(s.recipe(r).archived, true);
  assert.deepEqual(s.recipes().map((x) => x.id), [a, r], 'by name');
  assert.equal(s.recipe(999), null);
});

test("a made batch's materials (by item, the spawn last) and loads (by time); a part reads its first row's; they go with it", (t) => {
  const s = fresh(t).batches;
  const id = s.insert({ ...BATCH, kind: 'made', supplier: null, mixedAt: 1000 });
  const part = s.insert({ ...BATCH, kind: 'made', supplier: null, mixedAt: 1000, parentId: id, blocks: 100 });
  assert.deepEqual([s.get(id).sterilisedAt, s.get(id).spawnQty], [null, null]);
  s.setMaterials(id, ['spawn'], [{ item: 'spawn', name: null, qty: 12, unit: 'kg', stockItemId: 9 }]);
  s.setMaterials(id, ['sawdust', 'bran'], [
    { item: 'bran', name: null, qty: 73.6, unit: 'kg', stockItemId: 4 },
    { item: 'sawdust', name: null, qty: 287, unit: 'kg', stockItemId: null },
  ]);
  assert.deepEqual(s.materials(id).map((m) => [m.item, m.qty, m.unit, m.stockItemId]), [['sawdust', 287, 'kg', null], ['bran', 73.6, 'kg', 4], ['spawn', 12, 'kg', 9]]);
  s.setMaterials(id, ['sawdust', 'bran'], []);
  assert.deepEqual(s.materials(id).map((m) => m.item), ['spawn'], 'only the items named are replaced');
  const l1 = s.insertLoad({ batchId: id, ...LOAD });
  const l2 = s.insertLoad({ batchId: id, ...LOAD, hotAt: 1500 });
  assert.deepEqual(s.loads(id).map((l) => l.id), [l2, l1], 'by the time they got hot');
  assert.deepEqual({ ...s.load(l1), id: 0 }, { id: 0, batchId: id, ...LOAD });
  s.updateLoad(l1, { bags: 150 });
  assert.equal(s.load(l1).bags, 150);
  for (const row of [s.get(id), s.get(part)]) {
    assert.deepEqual([row.sterilisedAt, row.spawnQty, row.spawnUnit, row.spawnItemId], [2000, 12, 'kg', 9], `row ${row.id}`);
  }
  s.removeLoad(l2);
  assert.deepEqual(s.loads(id).map((l) => l.id), [l1]);
  s.remove(id);
  assert.deepEqual([s.materials(id), s.loads(id)], [[], []]);
});

test("a load's id is never reused after a delete", (t) => {
  const s = fresh(t).batches;
  const id = s.insert({ ...BATCH, kind: 'made', supplier: null, mixedAt: 1000 });
  const l1 = s.insertLoad({ batchId: id, ...LOAD });
  s.removeLoad(l1);
  assert.ok(s.insertLoad({ batchId: id, ...LOAD }) > l1);
});

test("Inventory's items for the materials: not the blocks items, with their latest purchase price; none without Inventory", (t) => {
  const none = fresh(t).batches;
  assert.deepEqual([none.stockItems(), none.stockItem(1), none.purchasePrice(1)], [[], null, null]);
  const { db, item, buy } = openWithInventory(t);
  const sawdust = item('Sawdust', 'other', 'kg');
  const spawn = item('Grey oyster spawn', 'spawn', 'kg');
  db.batches.blocksItem('Grey oyster blocks');
  buy(sawdust, 0.3, 1000);
  buy(sawdust, 0.35, 2000);
  buy(sawdust, 0.4, 1500);
  assert.deepEqual(db.batches.stockItems(), [
    { id: spawn, name: 'Grey oyster spawn', kind: 'spawn', unit: 'kg', unitCost: null },
    { id: sawdust, name: 'Sawdust', kind: 'other', unit: 'kg', unitCost: 0.35 },
  ]);
  assert.equal(db.batches.purchasePrice(sawdust), 0.35, 'the latest by time');
  assert.equal(db.batches.purchasePrice(spawn), null);
  assert.deepEqual(db.batches.stockItem(spawn), { id: spawn, name: 'Grey oyster spawn', kind: 'spawn', unit: 'kg' });
  assert.equal(db.batches.stockItem(999), null);
});
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-batches.test.js`
Expected: the four new tests FAIL (`s.insertRecipe is not a function`, `s.stockItems is not a function`, …); the others pass.

- [ ] **Step 4: The schema's one change (P1)**

In `BATCHES_SCHEMA`, find:

```sql
CREATE TABLE IF NOT EXISTS batch_loads (
  id         INTEGER PRIMARY KEY,
```

and replace with:

```sql
CREATE TABLE IF NOT EXISTS batch_loads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
```

(A database already at version 21 keeps its old `batch_loads`: only throwaway databases under `/tmp` are at 21 before the merge.)

- [ ] **Step 5: The columns, the row's making fields, the queries**

After `const CHECK_COLUMNS = { … };` add:

```js
// Part 2 (spec 5): a recipe's, a material line's and a sterilising load's fields and their columns.
const RECIPE_COLUMNS = {
  name: 'name', crop: 'crop', sawdustPct: 'sawdust_pct', branPct: 'bran_pct', limePct: 'lime_pct', gypsumPct: 'gypsum_pct', otherPct: 'other_pct',
  otherName: 'other_name', waterPct: 'water_pct', bagKg: 'bag_kg', archived: 'archived', createdAt: 'created_at',
};
const MATERIAL_COLUMNS = { batchId: 'batch_id', item: 'item', name: 'name', qty: 'qty', unit: 'unit', stockItemId: 'stock_item_id' };
const LOAD_COLUMNS = { batchId: 'batch_id', method: 'method', bags: 'bags', hotAt: 'hot_at', holdH: 'hold_h', tempC: 'temp_c', worker: 'worker', createdAt: 'created_at' };
```

Replace the `SELECT` constant and its comment with:

```js
// Every batch with its lost blocks, its room's name and its run's times and crops; a made batch's last sterilising load and
// its spawn line (both its first row's: spec 2.1).
const SELECT = `
SELECT b.*, rm.name AS room_name, ru.started_at AS run_started_at, ru.ended_at AS run_ended_at, ru.crops AS run_crops,
       COALESCE((SELECT SUM(c.lost) FROM batch_checks c WHERE c.batch_id = b.id), 0) AS lost,
       COALESCE((SELECT SUM(c.lost) FROM batch_checks c WHERE c.batch_id = b.id AND b.placed_at IS NOT NULL AND c.at <= b.placed_at), 0) AS lost_before,
       (SELECT MAX(l.hot_at) FROM batch_loads l WHERE l.batch_id = COALESCE(b.parent_id, b.id)) AS sterilised_at,
       s.qty AS spawn_qty, s.unit AS spawn_unit, s.stock_item_id AS spawn_item_id
FROM batches b LEFT JOIN rooms rm ON rm.id = b.room_id LEFT JOIN runs ru ON ru.id = b.run_id
     LEFT JOIN batch_materials s ON s.batch_id = COALESCE(b.parent_id, b.id) AND s.item = 'spawn'`;
// The latest purchase price of the stock item i (Inventory's 'purchase' moves; contract section 5).
const LATEST_PRICE = `SELECT m.unit_cost FROM stock_moves m WHERE m.item_id = i.id AND m.ref_kind = 'purchase' AND m.unit_cost IS NOT NULL
  ORDER BY m.at DESC, m.id DESC LIMIT 1`;
const MATERIAL_ORDER = "CASE item WHEN 'sawdust' THEN 0 WHEN 'bran' THEN 1 WHEN 'lime' THEN 2 WHEN 'gypsum' THEN 3 WHEN 'other' THEN 4 WHEN 'bags' THEN 5 ELSE 6 END";
```

(One spawn line per batch: `checkMaterials` in Task 5 allows each item once, so the join gives one row.)

In `batchOf(r)`, before `return out;`, add:

```js
  out.sterilisedAt = r.sterilised_at;
  out.spawnQty = r.spawn_qty;
  out.spawnUnit = r.spawn_unit;
  out.spawnItemId = r.spawn_item_id;
```

After `const checkOf = …;` add:

```js
const recipeOf = (r) => ({
  id: r.id, name: r.name, crop: r.crop, sawdustPct: r.sawdust_pct, branPct: r.bran_pct, limePct: r.lime_pct, gypsumPct: r.gypsum_pct,
  otherPct: r.other_pct, otherName: r.other_name, waterPct: r.water_pct, bagKg: r.bag_kg, archived: r.archived === 1, createdAt: r.created_at,
});
const materialOf = (r) => ({ id: r.id, batchId: r.batch_id, item: r.item, name: r.name, qty: r.qty, unit: r.unit, stockItemId: r.stock_item_id });
const loadOf = (r) => ({ id: r.id, batchId: r.batch_id, method: r.method, bags: r.bags, hotAt: r.hot_at, holdH: r.hold_h, tempC: r.temp_c, worker: r.worker, createdAt: r.created_at });
```

In `createBatchStore`, add to the `q` object after `hasStock: …`:

```js
    recipes: db.prepare('SELECT * FROM batch_recipes ORDER BY name COLLATE NOCASE, id'),
    recipe: db.prepare('SELECT * FROM batch_recipes WHERE id = ?'),
    materials: db.prepare(`SELECT * FROM batch_materials WHERE batch_id = ? ORDER BY ${MATERIAL_ORDER}, id`),
    loads: db.prepare('SELECT * FROM batch_loads WHERE batch_id = ? ORDER BY hot_at, id'),
    load: db.prepare('SELECT * FROM batch_loads WHERE id = ?'),
    removeLoad: db.prepare('DELETE FROM batch_loads WHERE id = ?'),
```

and right after the `q` object's closing `};`:

```js
  const hasStock = () => q.hasStock.get().n === 2;
```

- [ ] **Step 6: The store's methods**

In the returned object, find:

```js
    // ---- Inventory's tables (contract section 7): only when they exist ----
    hasStock: () => q.hasStock.get().n === 2,
```

and replace with:

```js
    // ---- making blocks (spec 5): recipes, a made batch's materials and its sterilising loads ----
    // Every recipe (archived too), by name.
    recipes: () => q.recipes.all().map(recipeOf),
    recipe(id) {
      const r = q.recipe.get(id);
      return r ? recipeOf(r) : null;
    },
    insertRecipe: (fields) => insertRow('batch_recipes', fields, RECIPE_COLUMNS),
    updateRecipe: (id, fields) => updateRow('batch_recipes', id, fields, RECIPE_COLUMNS),
    // A batch's material lines: the mix's in the recipe's order, then the spawn.
    materials: (batchId) => q.materials.all(batchId).map(materialOf),
    // The lines of these items replaced by `lines` (the Mix sends its own, the Inoculate step the spawn).
    setMaterials(batchId, items, lines) {
      db.prepare(`DELETE FROM batch_materials WHERE batch_id = ? AND item IN (${items.map(() => '?').join(', ')})`).run(batchId, ...items);
      for (const m of lines) insertRow('batch_materials', { batchId, ...m }, MATERIAL_COLUMNS);
    },
    // A batch's loads, by the time they got hot.
    loads: (batchId) => q.loads.all(batchId).map(loadOf),
    load(id) {
      const r = q.load.get(id);
      return r ? loadOf(r) : null;
    },
    insertLoad: (fields) => insertRow('batch_loads', fields, LOAD_COLUMNS),
    updateLoad: (id, fields) => updateRow('batch_loads', id, fields, LOAD_COLUMNS),
    removeLoad: (id) => q.removeLoad.run(id),

    // ---- Inventory's tables (contract section 7): only when they exist ----
    hasStock,
    // The items a made batch's materials may draw from (not the blocks items Batches makes), by name, with their latest
    // purchase price (null: none yet); none without Inventory.
    stockItems() {
      if (!hasStock()) return [];
      return db.prepare(`SELECT i.id, i.name, i.kind, i.unit, (${LATEST_PRICE}) AS unit_cost FROM stock_items i WHERE i.kind <> 'blocks' ORDER BY i.name COLLATE NOCASE, i.id`)
        .all().map((r) => ({ id: r.id, name: r.name, kind: r.kind, unit: r.unit, unitCost: r.unit_cost }));
    },
    // A stock item, or null (and null without Inventory).
    stockItem(id) {
      if (!hasStock()) return null;
      const r = db.prepare('SELECT id, name, kind, unit FROM stock_items WHERE id = ?').get(id);
      return r ? { id: r.id, name: r.name, kind: r.kind, unit: r.unit } : null;
    },
    // A stock item's latest purchase price (RM per its unit), or null.
    purchasePrice(itemId) {
      if (!hasStock()) return null;
      return db.prepare(`SELECT (${LATEST_PRICE}) AS unit_cost FROM (SELECT ? AS id) i`).get(itemId).unit_cost;
    },
```

(`remove(id)` already deletes a batch's materials and loads.)

- [ ] **Step 7: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-batches.test.js tests/batches.test.js`
Expected: PASS, every test (the fixture change keeps part 1's stock tests green).

- [ ] **Step 8: Commit**

```bash
git add server/batches-db.js tests/batches-fixture.js tests/db-batches.test.js
git commit -m "Batches part 2, 1: the store's recipes, materials and loads; Inventory's items and purchase prices; a load's id never reused"
```

---

### Task 2: The pure figures: making, the made price, the made moves

**Files:**
- Modify: `server/batches-math.js`
- Test: `tests/batches-math.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/batches-math.test.js`, add `madePrice` to the import from `'../server/batches-math.js'` and append:

```js
test('a made batch is making until it is ready: in an area with its ready day, or put into a room', () => {
  const made = (o) => b({ kind: 'made', incubation: null, incubatedFrom: null, incubatedTo: null, ...o });
  assert.equal(statusOf(made({})), 'making');
  assert.equal(statusOf(made({ incubation: 'area', incubatedFrom: 2000 })), 'making');
  assert.equal(statusOf(made({ incubation: 'area', incubatedFrom: 2000, incubatedTo: 3000 })), 'waiting', 'ready to fruit');
  assert.equal(statusOf(made({ incubation: 'room', runId: 3, placedAt: 4000 })), 'placed');
  assert.equal(statusOf(made({ incubation: 'room', runId: 3, placedAt: 4000, runEndedAt: 5000 })), 'past');
  assert.equal(statusOf(made({ incubation: 'room' })), 'making', 'taken out of its grow room: it still incubates');
});

test('the made price per block: the materials at their purchase prices over the blocks made; null when one is unknown', () => {
  const prices = { 1: 0.35, 2: 1.2, 3: 0.08 };
  const priceOf = (id) => prices[id] ?? null;
  const lines = [{ qty: 287, stockItemId: 1 }, { qty: 73.6, stockItemId: 2 }, { qty: 400, stockItemId: 3 }];
  assert.equal(madePrice(lines, priceOf, 400), 0.5519, '(100.45 + 88.32 + 32) ÷ 400, to 4 places');
  assert.equal(madePrice([...lines, { qty: 5, stockItemId: null }], priceOf, 400), null, 'a line with no item');
  assert.equal(madePrice([{ qty: 5, stockItemId: 9 }], priceOf, 400), null, 'an item with no purchase price');
  assert.equal(madePrice([], priceOf, 400), null, 'no materials');
});

test("the stock moves of a made batch: its blocks at the mix, each material with an item out at the mix, the spawn at the inoculation", () => {
  const first = b({ id: 1, kind: 'made', blocks: 400, pricePerBlock: 0.55, receivedAt: 1000, mixedAt: 1000, inoculatedAt: 3000 });
  const materials = [
    { item: 'sawdust', qty: 287, stockItemId: 11 },
    { item: 'bran', qty: 73.6, stockItemId: null },
    { item: 'spawn', qty: 12, stockItemId: 12 },
  ];
  assert.deepEqual(movesOf([first], () => [], materials), [
    { refId: 1, at: 1000, qty: 400, unitCost: 0.55, note: null },
    { itemId: 11, refId: 1, at: 1000, qty: -287, unitCost: null, note: 'mixed' },
    { itemId: 12, refId: 1, at: 3000, qty: -12, unitCost: null, note: 'spawn' },
  ]);
  assert.deepEqual(movesOf([{ ...first, inoculatedAt: null }], () => [], materials).map((m) => m.qty), [400, -287], 'no spawn move before the inoculation');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-math.test.js`
Expected: FAIL (`madePrice` is not exported; `statusOf` says `'waiting'` for a made batch; `movesOf` has no material moves).

- [ ] **Step 3: Implement**

In `server/batches-math.js`, replace `statusOf` and its comment with:

```js
// 'making' (a made batch not yet ready: not in a room, and not an area's blocks marked ready to fruit), 'waiting' (not yet in
// a room), 'placed' (in a room's open run) or 'past' (its run ended, or its room was deleted: a placed time with no room).
export function statusOf(b) {
  if (b.kind === 'made' && b.placedAt == null && !(b.incubation === 'area' && b.incubatedTo != null)) return 'making';
  return b.runId == null ? (b.placedAt == null ? 'waiting' : 'past') : b.runEndedAt == null ? 'placed' : 'past';
}

// A made block's price (spec 4): Σ material qty × its item's latest purchase price ÷ the blocks made, to 4 places; null with no
// lines, a line with no Inventory item, or an item with no purchase price. priceOf(stockItemId) → RM per unit, or null.
export function madePrice(materials, priceOf, blocks) {
  if (!materials.length || !(blocks > 0)) return null;
  let total = 0;
  for (const m of materials) {
    const cost = m.stockItemId == null ? null : priceOf(m.stockItemId);
    if (cost == null) return null;
    total += m.qty * cost;
  }
  return round(total / blocks, 4);
}
```

Replace the comment and first line of `movesOf` with:

```js
// The stock moves a delivery should have (spec 3.1), from its rows (the first row and its parts) and checksOf(id) (a row's
// checks, oldest first): + the delivery's blocks on the first row at its receipt; a waiting row's losses out; a placed row's
// losses before it went in out, then the rest of its blocks out when it went in (a loss after that is in a room, not stock).
// A row whose room was deleted keeps its placed time, so its move out stays. A made batch's materials (its first row's lines)
// with an Inventory item go out on their own items (itemId): the mix's at the mix, the spawn at the inoculation (none before
// it). family: not empty.
export function movesOf(family, checksOf, materials = []) {
```

and before its `return moves;` add:

```js
  for (const m of materials) {
    const at = m.item === 'spawn' ? first.inoculatedAt : first.mixedAt ?? first.receivedAt;
    if (m.stockItemId == null || at == null) continue;
    moves.push({ itemId: m.stockItemId, refId: first.id, at, qty: -m.qty, unitCost: null, note: m.item === 'spawn' ? 'spawn' : 'mixed' });
  }
```

(A made batch's receipt move needs nothing new: its `receivedAt` is its day mixed, and its `pricePerBlock` the worked-out price.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-math.test.js tests/batches.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/batches-math.js tests/batches-math.test.js
git commit -m "Batches part 2, 2: the pure figures (a made batch making until ready, the made price per block, the made stock moves)"
```

---

### Task 3: Part 1's field checks move to `server/batches-fields.js`

No behaviour changes: the making checks (Task 4 on) need the same rules from a second module.

**Files:**
- Create: `server/batches-fields.js`
- Modify: `server/batches.js` (its head, lines 1–49 at `b50fe81`, and the weight block of `checkFields`)

- [ ] **Step 1: Create `server/batches-fields.js`**

```js
// The Batches field rules shared by server/batches.js and server/batches-making.js (spec 2026-11-05-batches-design.md 2 and
// 3): the error a refusal throws, the number, time and text checks, a block's weight. No database.

import { localDate, dayStart } from './task-rules.js';

export const MAX_BLOCKS = 100_000;
export const MAX_TEXT = 80;
export const MAX_NOTE = 500;
export const EARLIEST = Date.UTC(2000, 0, 1);

export class BatchError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'BatchError';
    this.status = status;
    this.field = field;
  }
}

export const bad = (message, field) => new BatchError(400, message, field);
export const conflict = (message, field) => new BatchError(409, message, field);
export const isPlain = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const intIn = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
export const numIn = (v, min, max) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
// A time: whole ms from 2000 to now.
export const isTime = (v, now) => Number.isInteger(v) && v >= EARLIEST && v <= now;
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(dayStart(s)) && localDate(dayStart(s)) === s;
export const grouped = (n) => n.toLocaleString('en-US');

// A text field: trimmed, at most max characters, no control characters (a note may hold line breaks); empty is null.
export function textOf(v, field, label, max = MAX_TEXT) {
  if (v === undefined || v === null) return null;
  const control = field === 'note' ? /[\u0000-\u0009\u000b-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (typeof v !== 'string' || control.test(v)) throw bad(`${label} must be plain text`, field);
  const s = v.trim();
  if (s.length > max) throw bad(`${label} must be at most ${max} characters`, field);
  return s || null;
}

// A block's weight and water % (spec 2: both or neither); a field not in body keeps was's (an edit). → { blockKg, waterPct }.
export function weightOf(body, was = null) {
  const has = (k) => Object.hasOwn(body, k);
  const kg = has('blockKg') ? body.blockKg ?? null : was?.blockKg ?? null;
  const water = has('waterPct') ? body.waterPct ?? null : was?.waterPct ?? null;
  if (kg !== null && !numIn(kg, 0.2, 10)) throw bad('Block weight must be 0.2–10 kg, or empty', 'blockKg');
  if (water !== null && !numIn(water, 30, 80)) throw bad('Water must be 30–80 %, or empty', 'waterPct');
  if (kg === null && water !== null) throw bad('Give the block weight with the water %', 'blockKg');
  if (kg !== null && water === null) throw bad('Give the water % with the block weight', 'waterPct');
  return { blockKg: kg, waterPct: water };
}
```

- [ ] **Step 2: `server/batches.js` imports them**

Replace everything from `import { CROP_KEYS, cropShortName } from '../web/crops.js';` down to (not including) the comment `// The receive fields of body, checked (spec 3).` with:

```js
import { CROP_KEYS, cropShortName } from '../web/crops.js';
import { localDate, addDays } from './task-rules.js';
import { checkWorker, TaskError } from './tasks.js';
import { cell } from './csv.js';
import { goodOf, dryKgOf, runDryKg, blockCost, statusOf, runBlocksOf, movesOf } from './batches-math.js';
import {
  BatchError, MAX_BLOCKS, MAX_NOTE, EARLIEST, bad, conflict, isPlain, intIn, numIn, isDate, grouped, textOf, weightOf,
} from './batches-fields.js';

export { BatchError, MAX_BLOCKS };
export const CAUSES = ['green', 'black', 'bacterial', 'pests', 'other'];
const STATUSES = ['waiting', 'placed', 'past'];
// Edited on any row of a delivery, written to all of them (spec 2.1); a part copies these and the making columns.
const SHARED = ['crop', 'supplier', 'receivedAt', 'pricePerBlock', 'spawnBatch', 'strain', 'deliveryRef', 'inoculatedAt', 'blockKg', 'waterPct'];
const COPIED = [...SHARED, 'kind', 'recipeId', 'mixedAt', 'incubation', 'incubatedFrom', 'incubatedTo'];
const CSV_HEAD = ['received', 'crop', 'kind', 'supplier', 'strain', 'spawn batch', 'delivery note', 'blocks', 'lost', 'price per block', 'room',
  'run started', 'placed', 'block kg', 'water %', 'note'];
const pick = (row, keys) => Object.fromEntries(keys.map((k) => [k, row[k]]));

```

In `checkFields`, replace the block that starts `if (asked('blockKg') || asked('waterPct')) {` and ends with its closing `}` (ten lines: `kg`, `water`, four throws, `out.blockKg`, `out.waterPct`) with the one line:

```js
  if (asked('blockKg') || asked('waterPct')) Object.assign(out, weightOf(body, was));
```

- [ ] **Step 3: Run Batches' tests and the API's**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches.test.js tests/batches-math.test.js tests/db-batches.test.js tests/api-batches.test.js`
Expected: PASS, every test, the same count as before the task.

- [ ] **Step 4: Commit**

```bash
git add server/batches-fields.js server/batches.js
git commit -m "Batches part 2, 3: part 1's field rules move to batches-fields.js (BatchError, number, time and text checks, weightOf) for the making checks to share"
```

---

### Task 4: Recipes

**Files:**
- Create: `server/batches-making.js`
- Modify: `server/batches.js`
- Test: `tests/batches-making.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `tests/batches-making.test.js`:

```js
// Making blocks (spec 2026-11-05-batches-design.md 4 and 5): recipes, Make blocks (the mix), the steps (inoculate, incubate,
// ready to fruit), Put into a room for made blocks, sterilising loads, the made price per block and its stock moves.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createBatches } from '../server/batches.js';
import { openWithInventory } from './batches-fixture.js';

const ROOM = { name: 'Container 1', length: 6, width: 4, height: 2.5 };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const RECIPE = { name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, waterPct: 60, bagKg: 2.3 };
const MIX = [{ item: 'sawdust', qty: 287, unit: 'kg' }, { item: 'bran', qty: 73.6, unit: 'kg' }];
const LOAD = { method: 'steam', bags: 200, hotAt: NOW - DAY, holdH: 6, tempC: 98, worker: 'Ali' };

function setup(t, { stock = false } = {}) {
  const inventory = stock ? openWithInventory(t) : null;
  const db = inventory ? inventory.db : openDb(':memory:');
  if (!inventory) t.after(() => db.close());
  let clock = NOW;
  const batches = createBatches({ db, now: () => clock });
  const told = [];
  batches.onChange((c) => told.push(c));
  let n = 0;
  function room(crops = [{ crop: 'oyster', blocks: 400 }]) {
    n += 1;
    const id = db.createRoom({ ...ROOM, name: `Container ${n}` }, 1000).id;
    db.setProgram(id, { ...db.getProgram(id), crops }, { change: 'start', at: NOW - 5 * DAY });
    return id;
  }
  return { db, batches, told, room, tick: (ms) => { clock += ms; }, item: inventory?.item, buy: inventory?.buy };
}

const status = (fn) => {
  try { fn(); } catch (err) { return [err.status, err.field ?? null, err.message]; }
  return null;
};

// 400 bags of Grey oyster mixed two days ago (3 Nov), sawdust and bran.
const made = (batches, o = {}) => batches.mix({ crop: 'oyster', blocks: 400, mixedAt: NOW - 2 * DAY, materials: MIX, ...o });

test('recipes: add, list by name, edit, archive; the parts add up to 100 %; a name in use once', (t) => {
  const { batches, told } = setup(t);
  const r = batches.addRecipe(RECIPE);
  assert.deepEqual({ ...r, id: 0, createdAt: 0 }, { id: 0, ...RECIPE, otherPct: 0, otherName: null, archived: false, createdAt: 0 });
  assert.equal(r.createdAt, NOW);
  assert.deepEqual(told.at(-1), { batchId: null, roomId: null, runId: null, harvestRooms: [] }, 'the pages hear of it');
  const cases = [
    [{ name: ' ' }, 'name'],
    [{ name: 'sawdust 78' }, 'name'],
    [{ crop: 'tomato' }, 'crop'],
    [{ branPct: 21 }, 'sawdustPct'],
    [{ sawdustPct: 80, limePct: -1 }, 'limePct'],
    [{ sawdustPct: 76, otherPct: 2 }, 'otherName'],
    [{ waterPct: 85 }, 'waterPct'],
    [{ bagKg: 0.1 }, 'bagKg'],
    [{ archived: 'yes' }, 'archived'],
  ];
  for (const [change, field] of cases) {
    assert.deepEqual(status(() => batches.addRecipe({ ...RECIPE, name: 'B', ...change }))?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.addRecipe({ ...RECIPE, name: 'B', branPct: 21 }))[2], 'The parts must add up to 100 % (now 101 %)');
  assert.equal(status(() => batches.addRecipe(null))[0], 400);
  const other = batches.addRecipe({ ...RECIPE, name: 'With cotton', crop: '', sawdustPct: 70, otherPct: 8, otherName: ' Cotton waste ' });
  assert.deepEqual([other.crop, other.otherName], [null, 'Cotton waste'], 'Any crop; trimmed');
  assert.deepEqual(batches.recipes().recipes.map((x) => x.name), ['Sawdust 78', 'With cotton']);
  const e = batches.editRecipe(r.id, { bagKg: 2.5 });
  assert.deepEqual([e.bagKg, e.sawdustPct, e.name], [2.5, 78, 'Sawdust 78'], 'not given: kept');
  assert.equal(batches.editRecipe(r.id, { archived: true }).archived, true);
  assert.deepEqual(batches.recipes().recipes.map((x) => x.name), ['With cotton'], 'an archived recipe is not offered');
  assert.deepEqual(batches.recipes({ all: true }).recipes.map((x) => x.name), ['Sawdust 78', 'With cotton']);
  assert.equal(batches.addRecipe(RECIPE).name, 'Sawdust 78', 'an archived name is free again');
  assert.deepEqual(status(() => batches.editRecipe(r.id, { archived: false }))?.slice(0, 2), [400, 'name'], 'back in use, its name would be there twice');
  assert.equal(status(() => batches.editRecipe(999, {}))[0], 404);
});
```

(`made` and `LOAD` are used from Task 5 on.)

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js`
Expected: FAIL with `batches.addRecipe is not a function`.

- [ ] **Step 3: Create `server/batches-making.js` with the recipe check**

```js
// Making blocks (spec 2026-11-05-batches-design.md 5): the checks of a recipe, a made batch's step fields, its material lines
// and a sterilising load. Pure: server/batches.js passes what it read from the database; a refusal throws a BatchError.

import { CROP_KEYS } from '../web/crops.js';
import { bad, isPlain, numIn, textOf } from './batches-fields.js';

// A recipe's five parts of the dry weight (spec 2), each 0–100, together 100 (to 0.1).
export const PARTS = ['sawdustPct', 'branPct', 'limePct', 'gypsumPct', 'otherPct'];
const RECIPE_KEYS = ['name', 'crop', ...PARTS, 'otherName', 'waterPct', 'bagKg', 'archived'];

// A recipe's fields (spec 5), checked. was: the stored recipe (an edit: a field not given keeps its value; `{ archived: true }`
// alone archives it); taken(name): an unarchived recipe other than this one has that name, case aside. → its columns' fields.
export function checkRecipe(body, { was = null, taken = () => false } = {}) {
  if (!isPlain(body)) throw bad('Body must be a JSON object');
  const v = { ...(was ?? {}), ...Object.fromEntries(RECIPE_KEYS.filter((k) => Object.hasOwn(body, k)).map((k) => [k, body[k]])) };
  const name = textOf(v.name, 'name', 'Name');
  if (!name) throw bad('Give the recipe a name', 'name');
  const crop = v.crop || null;
  if (crop !== null && !CROP_KEYS.includes(crop)) throw bad('Pick a crop, or Any crop', 'crop');
  const parts = {};
  for (const k of PARTS) {
    const x = k === 'otherPct' ? v[k] ?? 0 : v[k];
    if (!numIn(x, 0, 100)) throw bad('Each part must be 0–100 %', k);
    parts[k] = Math.round(x * 10) / 10;
  }
  const sum = Math.round(PARTS.reduce((s, k) => s + parts[k], 0) * 10);
  if (sum !== 1000) throw bad(`The parts must add up to 100 % (now ${sum / 10} %)`, 'sawdustPct');
  const otherName = parts.otherPct > 0 ? textOf(v.otherName, 'otherName', 'The other ingredient') : null;
  if (parts.otherPct > 0 && !otherName) throw bad('Name the other ingredient', 'otherName');
  if (!numIn(v.waterPct, 30, 80)) throw bad('Water must be 30–80 %', 'waterPct');
  if (!numIn(v.bagKg, 0.2, 10)) throw bad('A bag must weigh 0.2–10 kg', 'bagKg');
  const archived = v.archived ?? false;
  if (typeof archived !== 'boolean') throw bad('archived must be true or false', 'archived');
  if (!archived && taken(name)) throw bad(`A recipe in use is called ${name} already`, 'name');
  return { name, crop, ...parts, otherName, waterPct: v.waterPct, bagKg: v.bagKg, archived: archived ? 1 : 0 };
}
```

- [ ] **Step 4: The recipes in `createBatches`**

In `server/batches.js`, add after the `batches-fields.js` import:

```js
import { checkRecipe } from './batches-making.js';
```

In `createBatches`, before `function batchOf(id) {`, add:

```js
  // name → an unarchived recipe other than exceptId has it, case aside (spec 2: a name is unique among those in use).
  const nameTaken = (exceptId) => (name) => store.recipes().some((r) => !r.archived && r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase());

```

In the returned object, before `// { <crop>: dry kg per block } of a run's batches …` (`dryKgFor`), add:

```js
    // ---- recipes (spec 5) ----

    // { recipes } by name: those in use, or with all every one (archived too).
    recipes({ all = false } = {}) {
      return { recipes: store.recipes().filter((r) => all || !r.archived) };
    },

    // A new recipe. → the recipe.
    addRecipe(body) {
      const fields = checkRecipe(body, { taken: nameTaken(null) });
      const id = store.insertRecipe({ ...fields, createdAt: now() });
      tell([]);
      return store.recipe(id);
    },

    // A recipe's fields, or { archived: true } (never deleted: the batches made with it name it). A batch's materials were
    // copied at its mix: they do not change. → the recipe.
    editRecipe(id, body) {
      const was = Number.isInteger(id) ? store.recipe(id) : null;
      if (!was) throw new BatchError(404, 'Recipe not found');
      store.updateRecipe(id, checkRecipe(body, { was, taken: nameTaken(id) }));
      tell([]);
      return store.recipe(id);
    },

```

(`tell([])` publishes `batches` with null ids: an open page reads again.)

- [ ] **Step 5: Run the test to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/batches-making.js server/batches.js tests/batches-making.test.js
git commit -m "Batches part 2, 4: recipes (add, edit, archive; the five parts add up to 100 %; a name once among those in use)"
```

---

### Task 5: Make blocks (the mix) and the made batch's views

**Files:**
- Modify: `server/batches-making.js`, `server/batches.js`
- Test: `tests/batches-making.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/batches-making.test.js`:

```js
test('make blocks: a made batch, making, mixed and received the same day, no supplier yet; the recipe gives the crop and the weight', (t) => {
  const { batches, told } = setup(t);
  const r = batches.addRecipe(RECIPE);
  const b = batches.mix({ recipeId: r.id, blocks: 400, mixedAt: NOW - DAY, materials: [...MIX, { item: 'other', name: ' Cotton waste ', qty: 10, unit: 'kg' }], note: 'first mix' });
  assert.deepEqual([b.kind, b.status, b.crop, b.blocks, b.supplier, b.receivedAt, b.mixedAt, b.recipeId, b.blockKg, b.waterPct, b.dryKg, b.pricePerBlock, b.note],
    ['made', 'making', 'oyster', 400, null, NOW - DAY, NOW - DAY, r.id, 2.3, 60, 0.92, null, 'first mix']);
  assert.deepEqual([b.incubation, b.sterilisedAt, b.spawn], [null, null, null]);
  assert.deepEqual(told.at(-1), { batchId: b.id, roomId: null, runId: null, harvestRooms: [] });
  const d = batches.detail(b.id);
  assert.equal(d.recipe.name, 'Sawdust 78');
  assert.deepEqual(d.materials.map((m) => [m.item, m.name, m.qty, m.unit, m.stockItemId, m.itemName, m.unitCost]), [
    ['sawdust', null, 287, 'kg', null, null, null], ['bran', null, 73.6, 'kg', null, null, null], ['other', 'Cotton waste', 10, 'kg', null, null, null],
  ]);
  assert.deepEqual(d.loads, []);
  const plain = batches.mix({ crop: 'pink', blocks: 10 });
  assert.deepEqual([plain.mixedAt, plain.receivedAt, plain.blockKg, plain.recipeId], [NOW, NOW, null, null], 'today; no recipe, no weight');
  assert.deepEqual(batches.detail(plain.id).materials, []);
  assert.equal(batches.mix({ recipeId: r.id, crop: 'pink', blocks: 10, blockKg: 2, waterPct: 65 }).crop, 'pink', "a crop picked over the recipe's");
  assert.deepEqual(batches.list({ status: 'making' }).batches.map((x) => x.id).slice(1), [plain.id, b.id], 'newest first');
  assert.deepEqual(batches.list({ status: 'waiting' }).batches, []);
});

test('make blocks: each bad field is a 400 naming it', (t) => {
  const { batches } = setup(t);
  const old = batches.addRecipe({ ...RECIPE, name: 'Old' });
  batches.editRecipe(old.id, { archived: true });
  const cases = [
    [{ crop: 'tomato' }, 'crop'],
    [{ crop: null }, 'crop'],
    [{ blocks: 0 }, 'blocks'],
    [{ blocks: 2.5 }, 'blocks'],
    [{ mixedAt: NOW + DAY }, 'mixedAt'],
    [{ mixedAt: 9e15 }, 'mixedAt'],
    [{ recipeId: 999 }, 'recipeId'],
    [{ recipeId: old.id }, 'recipeId'],
    [{ pricePerBlock: 1 }, 'pricePerBlock'],
    [{ blockKg: 2.3 }, 'waterPct'],
    [{ note: 'n'.repeat(501) }, 'note'],
    [{ materials: 'sawdust' }, 'materials'],
    [{ materials: [{ item: 'cement', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 0, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 100_001, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 1, unit: 'pcs' }] }, 'materials'],
    [{ materials: [{ item: 'bags', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 1, unit: 'kg' }, { item: 'sawdust', qty: 2, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'other', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'spawn', qty: 1, unit: 'kg' }] }, 'materials'],
    [{ materials: [{ item: 'sawdust', qty: 1, unit: 'kg', stockItemId: 'x' }] }, 'materials'],
    [{ spawn: { qty: 1, unit: 'kg' } }, 'inoculatedAt'],
  ];
  for (const [change, field] of cases) {
    assert.deepEqual(status(() => made(batches, change))?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.mix([]))[0], 400);
  assert.deepEqual(batches.list().batches, [], 'nothing was kept');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js`
Expected: the two new tests FAIL with `batches.mix is not a function`.

- [ ] **Step 3: The material and step checks**

In `server/batches-making.js`, replace the `batches-fields.js` import line with:

```js
import { localDate } from './task-rules.js';
import { bad, isPlain, intIn, numIn, isTime, textOf, weightOf, MAX_BLOCKS, MAX_NOTE } from './batches-fields.js';
```

and append:

```js

// The material lines (spec 2 and 5): the mix's ingredients and its plastic bags, and the spawn (its own line, from the
// Inoculate step). Ingredients in kg, the bags in pieces, the spawn in kg or bags.
export const MIX_ITEMS = ['sawdust', 'bran', 'lime', 'gypsum', 'other', 'bags'];
export const UNITS = { sawdust: ['kg'], bran: ['kg'], lime: ['kg'], gypsum: ['kg'], other: ['kg'], bags: ['pcs'], spawn: ['kg', 'bags'] };
const ITEM_NAMES = { sawdust: 'Sawdust', bran: 'Bran', lime: 'Lime', gypsum: 'Gypsum', other: 'The other ingredient', bags: 'Plastic bags', spawn: 'Spawn' };

// lines: the material lines sent ([{ item, name?, qty, unit, stockItemId? }]), one per item of `items`; known(id): that
// Inventory item exists (null without Inventory: no item is kept); field: the field a refusal names. → the lines to store.
export function checkMaterials(lines, items, known, field = 'materials') {
  if (!Array.isArray(lines)) throw bad('Materials must be a list of lines', field);
  const seen = new Set();
  return lines.map((m) => {
    if (!isPlain(m) || !items.includes(m.item)) throw bad(`A material must be one of: ${items.join(', ')}`, field);
    const label = ITEM_NAMES[m.item];
    if (seen.has(m.item)) throw bad(`${label} is listed twice`, field);
    seen.add(m.item);
    if (!numIn(m.qty, 0, 100_000) || m.qty === 0) throw bad(`${label}: the amount must be over 0, up to 100,000`, field);
    if (!UNITS[m.item].includes(m.unit)) throw bad(`${label} is counted in ${UNITS[m.item].join(' or ')}`, field);
    const name = m.item === 'other' ? textOf(m.name, field, "The other ingredient's name") : null;
    if (m.item === 'other' && !name) throw bad('Name the other ingredient', field);
    const id = m.stockItemId ?? null;
    if (id !== null && !(Number.isInteger(id) && id > 0)) throw bad(`${label}: pick an Inventory item from the list`, field);
    if (id !== null && known && !known(id)) throw bad(`${label}: that Inventory item is gone; pick another`, field);
    return { item: m.item, name, qty: Math.round(m.qty * 1000) / 1000, unit: m.unit, stockItemId: known ? id : null };
  });
}

// The Mix, Inoculate and Incubate fields of a made batch (spec 5), checked; the materials apart (checkMaterials). was: the
// first row as stored (an edit: only the fields given are checked, against the rest as stored); null: a new mix (mixed today
// unless given; the crop and the weight from the recipe unless given). recipeOf(id): the recipe, or null. → camelCase fields
// (receivedAt with mixedAt: a made batch is received the day it is mixed).
export function checkMade(body, { was = null, now, recipeOf }) {
  if (!isPlain(body)) throw bad('Body must be a JSON object');
  const has = (k) => Object.hasOwn(body, k);
  const asked = (k) => !was || has(k);
  if (has('pricePerBlock')) throw bad("A made block's price is worked out from its materials", 'pricePerBlock');
  const out = {};
  let recipe = null;
  if (asked('recipeId')) {
    const id = body.recipeId ?? null;
    recipe = Number.isInteger(id) ? recipeOf(id) : null;
    // an archived recipe is not offered for a new mix; a batch keeps its own
    if (id !== null && (!recipe || (recipe.archived && id !== was?.recipeId))) throw bad('Pick a recipe in use, or none', 'recipeId');
    out.recipeId = id;
  }
  if (asked('mixedAt')) {
    const t = has('mixedAt') ? body.mixedAt : now;
    if (!isTime(t, now)) throw bad('Pick the day mixed, not in the future', 'mixedAt');
    out.mixedAt = t;
    out.receivedAt = t;
  }
  if (asked('crop')) {
    const crop = body.crop || recipe?.crop || null;
    if (!CROP_KEYS.includes(crop)) throw bad('Pick a crop', 'crop');
    out.crop = crop;
  }
  if (asked('blocks')) {
    if (!intIn(body.blocks, 1, MAX_BLOCKS)) throw bad('Bags must be a whole number from 1 to 100,000', 'blocks');
    out.blocks = body.blocks;
  }
  if (!was && recipe && !has('blockKg') && !has('waterPct')) Object.assign(out, { blockKg: recipe.bagKg, waterPct: recipe.waterPct });
  else if (asked('blockKg') || asked('waterPct')) Object.assign(out, weightOf(body, was));
  if (asked('note')) out.note = textOf(body.note, 'note', 'Note', MAX_NOTE);
  for (const [key, label] of [['supplier', 'Spawn supplier'], ['strain', 'Strain'], ['spawnBatch', 'Spawn batch']]) {
    if (has(key)) out[key] = textOf(body[key], key, label);
  }
  if (has('inoculatedAt')) {
    const t = body.inoculatedAt ?? null;
    if (t !== null && !isTime(t, now)) throw bad('Pick the day inoculated, not in the future', 'inoculatedAt');
    out.inoculatedAt = t;
  }
  if (has('incubation')) {
    if (![null, 'room', 'area'].includes(body.incubation)) throw bad('Pick where the blocks incubate', 'incubation');
    out.incubation = body.incubation;
  }
  for (const [key, message] of [['incubatedFrom', 'Pick the day the incubation began, not in the future'], ['incubatedTo', 'Pick the day they were ready, not in the future']]) {
    if (!has(key)) continue;
    const t = body[key] ?? null;
    if (t !== null && !isTime(t, now)) throw bad(message, key);
    out[key] = t;
  }
  // the steps' order (spec 5): inoculated on or after the mix; the incubation after the inoculation
  const after = { ...(was ?? {}), ...out };
  const day = (t) => localDate(t);
  if (after.inoculatedAt != null && day(after.inoculatedAt) < day(after.mixedAt)) {
    throw bad('Inoculated must be on or after the day mixed', has('inoculatedAt') ? 'inoculatedAt' : 'mixedAt');
  }
  if (after.incubation != null && after.inoculatedAt == null) {
    throw has('incubation') ? bad('Record the inoculation first', 'incubation') : bad('Clear the incubation before the inoculation', 'inoculatedAt');
  }
  if (after.incubation === 'area') {
    if (after.incubatedFrom == null) out.incubatedFrom = after.incubatedFrom = after.inoculatedAt; // from the inoculation by default
    if (day(after.incubatedFrom) < day(after.inoculatedAt)) {
      throw bad('The incubation begins on or after the day inoculated', has('incubatedFrom') ? 'incubatedFrom' : 'inoculatedAt');
    }
    if (after.incubatedTo != null && day(after.incubatedTo) < day(after.incubatedFrom)) throw bad('Ready must be on or after the incubation began', 'incubatedTo');
  } else {
    // in a grow room, or not yet: no area dates (an area's are cleared when it changes)
    if ((has('incubatedFrom') && body.incubatedFrom != null) || (has('incubatedTo') && body.incubatedTo != null)) {
      throw bad('Only an incubation in an area has dates', 'incubation');
    }
    if (was?.incubatedFrom != null || was?.incubatedTo != null) Object.assign(out, { incubatedFrom: null, incubatedTo: null });
  }
  return out;
}
```

- [ ] **Step 4: `createBatches`: the making status, the views, `mix`**

In `server/batches.js`:

Change the `batches-making.js` import to `import { checkRecipe, checkMade, checkMaterials, MIX_ITEMS } from './batches-making.js';`.

Replace `const STATUSES = ['waiting', 'placed', 'past'];` with `const STATUSES = ['making', 'waiting', 'placed', 'past'];`, and the `COPIED` line with:

```js
const MAKING = ['recipeId', 'mixedAt', 'incubation', 'incubatedFrom', 'incubatedTo'];
const COPIED = [...SHARED, 'kind', ...MAKING];
```

In `queryOf`, the status message becomes `'status must be making, waiting, placed or past'`.

Replace `viewOf`'s comment and first line with:

```js
// A store row as the API shows it (spec 6); priceOf(stockItemId): an Inventory item's latest purchase price (the spawn's, for
// the 4-2 sheet's price per unit).
function viewOf(b, priceOf) {
```

and add, after `runBlocks: runBlocksOf(b), note: b.note, status: statusOf(b), createdAt: b.createdAt,`:

```js
    // a made batch's making (spec 5): the steps' days, its last sterilising load and its spawn
    mixedAt: b.mixedAt, recipeId: b.recipeId, incubation: b.incubation, incubatedFrom: b.incubatedFrom, incubatedTo: b.incubatedTo,
    sterilisedAt: b.sterilisedAt,
    spawn: b.spawnQty == null ? null : { qty: b.spawnQty, unit: b.spawnUnit, unitCost: b.spawnItemId == null ? null : priceOf(b.spawnItemId) },
```

In `createBatches`, after `const firstOf = (b) => b.parentId ?? b.id;` add:

```js
  const view = (b) => viewOf(b, (itemId) => store.purchasePrice(itemId));
```

and inside `createBatches` change every other `viewOf(x)` to `view(x)` and every `.map(viewOf)` to `.map(view)` (in `list`, `detail`, `receive`, `edit`, `place`, `unplace`: `grep -n viewOf server/batches.js` then shows only the function and the `view` line).

In `detail`, after `batchBlocks: …,` add:

```js
        // part 2 (spec 6): a made batch's recipe, its material lines (with their Inventory item's name and latest purchase price)
        // and its sterilising loads, all its first row's
        recipe: b.recipeId == null ? null : store.recipe(b.recipeId),
        materials: store.materials(firstOf(b)).map((m) => ({
          ...m, itemName: m.stockItemId == null ? null : store.stockItem(m.stockItemId)?.name ?? null,
          unitCost: m.stockItemId == null ? null : store.purchasePrice(m.stockItemId),
        })),
        loads: store.loads(firstOf(b)),
```

Before `// A check's fields (spec 3):` add:

```js
  // A made batch's material lines in body (spec 5), checked: the mix's (materials) and the spawn (spawn: one line, or null to
  // clear it; it needs the day inoculated). An item picked is kept only with Inventory. → { mix?, spawn? } (absent: not sent).
  function linesOf(body, inoculatedAt) {
    const known = store.hasStock() ? (id) => store.stockItem(id) !== null : null;
    const out = {};
    if (Object.hasOwn(body, 'materials')) out.mix = checkMaterials(body.materials, MIX_ITEMS, known);
    if (Object.hasOwn(body, 'spawn')) {
      out.spawn = body.spawn === null ? [] : checkMaterials([{ ...(isPlain(body.spawn) ? body.spawn : {}), item: 'spawn' }], ['spawn'], known, 'spawn');
      if (out.spawn.length && inoculatedAt == null) throw bad('Give the day inoculated with the spawn', 'inoculatedAt');
    }
    return out;
  }

```

In the returned object, before `// Edit (spec 3): shared fields to every row of the delivery; …`, add:

```js
    // Make blocks (spec 5): a made batch from the Mix's fields and materials (and, given, the later steps'). → the view.
    mix(body) {
      const t = now();
      const fields = checkMade(body, { now: t, recipeOf: (id) => store.recipe(id) });
      const lines = linesOf(body, fields.inoculatedAt ?? null);
      const id = store.tx(() => {
        const made = store.insert({ kind: 'made', ...fields, createdAt: t });
        if (lines.mix) store.setMaterials(made, MIX_ITEMS, lines.mix);
        if (lines.spawn) store.setMaterials(made, ['spawn'], lines.spawn);
        sync(made);
        return made;
      });
      const b = store.get(id);
      tell([b]);
      return view(b);
    },

```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js tests/batches.test.js tests/api-batches.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/batches-making.js server/batches.js tests/batches-making.test.js
git commit -m "Batches part 2, 5: Make blocks (a made batch from the mix, its materials, the recipe's crop and weight); the making status and fields in the views; recipe, materials and loads in a batch's detail"
```

---

### Task 6: The steps (inoculate, incubate, ready to fruit, edit the mix) and Put into a room

**Files:**
- Modify: `server/batches.js`
- Test: `tests/batches-making.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/batches-making.test.js`:

```js
test('the steps: inoculated not before the mix; the incubation needs the inoculation; in an area until ready to fruit', (t) => {
  const { batches } = setup(t);
  const b = made(batches, { mixedAt: NOW - 3 * DAY });
  assert.deepEqual(status(() => batches.edit(b.id, { inoculatedAt: NOW - 4 * DAY })), [400, 'inoculatedAt', 'Inoculated must be on or after the day mixed']);
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'area' })), [400, 'incubation', 'Record the inoculation first']);
  assert.deepEqual(status(() => batches.edit(b.id, { pricePerBlock: 1 }))?.slice(0, 2), [400, 'pricePerBlock']);
  const i = batches.edit(b.id, { inoculatedAt: NOW - 2 * DAY, supplier: 'Spawn Co', strain: 'PL-27', spawnBatch: '0912', spawn: { qty: 12, unit: 'kg', stockItemId: null } });
  assert.deepEqual([i.status, i.supplier, i.strain, i.spawnBatch, i.spawn], ['making', 'Spawn Co', 'PL-27', '0912', { qty: 12, unit: 'kg', unitCost: null }]);
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'area', incubatedFrom: NOW - 3 * DAY }))?.slice(0, 2), [400, 'incubatedFrom']);
  const area = batches.edit(b.id, { incubation: 'area' });
  assert.deepEqual([area.incubation, area.incubatedFrom, area.incubatedTo, area.status], ['area', NOW - 2 * DAY, null, 'making'], 'from the inoculation by default');
  assert.deepEqual(status(() => batches.edit(b.id, { incubatedTo: NOW - 3 * DAY }))?.slice(0, 2), [400, 'incubatedTo']);
  assert.deepEqual(status(() => batches.edit(b.id, { incubatedTo: NOW + DAY }))?.slice(0, 2), [400, 'incubatedTo']);
  assert.equal(batches.edit(b.id, { incubatedTo: NOW }).status, 'waiting', 'ready to fruit');
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'room', incubatedTo: NOW }))?.slice(0, 2), [400, 'incubation'], 'only an area has dates');
  const room = batches.edit(b.id, { incubation: 'room' });
  assert.deepEqual([room.incubation, room.incubatedFrom, room.incubatedTo, room.status], ['room', null, null, 'making'], "the area's dates go");
  assert.deepEqual(status(() => batches.edit(b.id, { inoculatedAt: null })), [400, 'inoculatedAt', 'Clear the incubation before the inoculation']);
  assert.deepEqual(status(() => batches.edit(b.id, { spawn: { qty: 0, unit: 'kg' } }))?.slice(0, 2), [400, 'spawn']);
  assert.deepEqual(status(() => batches.edit(b.id, { spawn: { qty: 2, unit: 'pcs' } }))?.slice(0, 2), [400, 'spawn']);
  assert.equal(batches.edit(b.id, { spawn: { qty: 30, unit: 'bags' } }).spawn.unit, 'bags');
  assert.equal(batches.edit(b.id, { spawn: null }).spawn, null, 'the spawn line cleared');
  assert.deepEqual(status(() => batches.edit(b.id, { mixedAt: NOW - DAY })), [400, 'mixedAt', 'Inoculated must be on or after the day mixed']);
  assert.equal(batches.edit(b.id, { incubation: null, inoculatedAt: null }).inoculatedAt, null, 'both cleared at once');
});

test('edit the mix: the day moves the received day, not after a load; the mix lines replaced, the spawn kept; a recipe edit changes no batch', (t) => {
  const { batches } = setup(t);
  const r = batches.addRecipe(RECIPE);
  const b = made(batches, { recipeId: r.id, mixedAt: NOW - 3 * DAY });
  batches.edit(b.id, { inoculatedAt: NOW - DAY, spawn: { qty: 12, unit: 'kg' } });
  const e = batches.edit(b.id, { mixedAt: NOW - 2 * DAY, materials: [{ item: 'sawdust', qty: 300, unit: 'kg' }] });
  assert.deepEqual([e.mixedAt, e.receivedAt], [NOW - 2 * DAY, NOW - 2 * DAY]);
  assert.deepEqual(batches.detail(b.id).materials.map((m) => [m.item, m.qty]), [['sawdust', 300], ['spawn', 12]]);
  batches.addCheck(b.id, { lost: 1, cause: 'green', worker: 'Ali', at: NOW - 2 * DAY });
  assert.deepEqual(status(() => batches.edit(b.id, { mixedAt: NOW - DAY })), [400, 'mixedAt', 'Some contamination checks are before that day']);
  assert.equal(batches.edit(b.id, { blocks: 380 }).blocks, 380);
  assert.deepEqual(status(() => batches.edit(b.id, { blocks: 0 }))?.slice(0, 2), [400, 'blocks']);
  batches.editRecipe(r.id, { sawdustPct: 80, branPct: 18 });
  assert.equal(batches.detail(b.id).materials[0].qty, 300, 'copied at the mix, not linked');
  batches.editRecipe(r.id, { archived: true });
  assert.equal(batches.edit(b.id, { recipeId: r.id, note: 'kept' }).recipeId, r.id, 'its own archived recipe stays');
  assert.equal(batches.detail(b.id).recipe.archived, true);
});

test('put made blocks into a room: once inoculated (they incubate in that grow room) or, in an area, once ready to fruit', (t) => {
  const { batches, room } = setup(t);
  const roomId = room();
  const b = made(batches);
  assert.deepEqual(status(() => batches.place(b.id, { roomId })), [409, null, 'Record the inoculation before these blocks go into a room']);
  batches.edit(b.id, { inoculatedAt: NOW - DAY });
  const p = batches.place(b.id, { roomId, blocks: 100 });
  assert.deepEqual([p.status, p.parentId, p.kind, p.incubation, p.mixedAt], ['placed', b.id, 'made', 'room', NOW - 2 * DAY], 'a part copies the making');
  assert.equal(batches.detail(b.id).incubation, 'room', 'the whole delivery incubates in a grow room');
  assert.deepEqual(status(() => batches.edit(b.id, { incubation: 'area' }))?.slice(0, 2), [409, 'incubation']);
  assert.deepEqual(status(() => batches.edit(b.id, { crop: 'pink' }))?.slice(0, 2), [409, 'crop']);
  assert.deepEqual(status(() => batches.edit(b.id, { blocks: 200 }))?.slice(0, 2), [409, 'blocks']);
  assert.equal(batches.edit(p.id, { strain: 'PL-27' }).strain, 'PL-27');
  assert.equal(batches.detail(b.id).strain, 'PL-27', 'shared: edited on a part, written to the delivery');
  assert.equal(batches.unplace(p.id).id, b.id, 'folded back');
  assert.equal(batches.detail(b.id).status, 'making', 'out of the room it still incubates');
  const area = made(batches);
  batches.edit(area.id, { inoculatedAt: NOW - DAY, incubation: 'area' });
  assert.deepEqual(status(() => batches.place(area.id, { roomId })), [409, null, 'These blocks incubate in an area: mark them ready to fruit first']);
  batches.edit(area.id, { incubatedTo: NOW });
  const whole = batches.place(area.id, { roomId });
  assert.deepEqual([whole.status, whole.incubation, whole.incubatedTo], ['placed', 'area', NOW]);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js`
Expected: the three new tests FAIL (a made batch's edit still goes through the bought batch's checks; `place` takes uninoculated blocks).

- [ ] **Step 3: `editMade` and the made rules in `place`**

In `server/batches.js`, before `// A made batch's material lines in body (spec 5),` (`linesOf`), add:

```js
  // Edit a made batch (spec 5): the Mix's fields and materials, the Inoculate step's (the spawn supplier, strain, spawn batch,
  // the spawn line), the Incubate step's; the shared and making fields to every row of the delivery, the materials on its first
  // row. Crop and bags as a bought batch's (2.1); the day mixed not after a load or a check (nor the inoculation, which comes
  // before any placement); where the blocks incubate fixed while some are in a room. → the view.
  function editMade(b, body) {
    const firstId = firstOf(b);
    const first = store.get(firstId);
    const fields = checkMade(body, { was: first, now: now(), recipeOf: (id) => store.recipe(id) });
    const lines = linesOf(body, 'inoculatedAt' in fields ? fields.inoculatedAt : first.inoculatedAt);
    const family = store.family(firstId);
    const placed = family.some((x) => x.placedAt != null);
    if ('crop' in fields && fields.crop !== first.crop && placed) throw conflict('Take the blocks out of the rooms to change the crop', 'crop');
    if ('blocks' in fields && fields.blocks !== b.blocks) {
      if (b.parentId != null || family.length > 1 || b.placedAt != null) throw conflict('Bags change only on a waiting batch with no parts', 'blocks');
      if (fields.blocks < b.lost) throw bad(`Bags can't be fewer than the ${grouped(b.lost)} lost`, 'blocks');
      if (store.loads(firstId).some((l) => l.bags > fields.blocks)) throw bad('A sterilising load has more bags than that', 'blocks');
    }
    if (placed && ['incubation', 'incubatedFrom', 'incubatedTo'].some((k) => k in fields && fields[k] !== first[k])) {
      throw conflict('Take the blocks out of the rooms to change their incubation', 'incubation');
    }
    if ('mixedAt' in fields && fields.mixedAt !== first.mixedAt) {
      const day = localDate(fields.mixedAt);
      if (store.loads(firstId).some((l) => localDate(l.hotAt) < day)) throw bad('Some sterilising loads are before that day', 'mixedAt');
      if (family.some((x) => store.checks(x.id).some((c) => localDate(c.at) < day))) throw bad('Some contamination checks are before that day', 'mixedAt');
    }
    const shared = Object.fromEntries(Object.entries(fields).filter(([k]) => SHARED.includes(k) || MAKING.includes(k)));
    const own = Object.fromEntries(Object.entries(fields).filter(([k]) => !SHARED.includes(k) && !MAKING.includes(k)));
    store.tx(() => {
      if (Object.keys(shared).length) for (const x of family) store.update(x.id, shared);
      if (Object.keys(own).length) store.update(b.id, own);
      if (lines.mix) store.setMaterials(firstId, MIX_ITEMS, lines.mix);
      if (lines.spawn) store.setMaterials(firstId, ['spawn'], lines.spawn);
      sync(firstId);
    });
    const after = store.get(b.id);
    tell([after, ...family]);
    return view(after);
  }

```

In `edit(id, body)`, right after `const b = batchOf(id);` add:

```js
      if (b.kind === 'made') return editMade(b, body);
```

In `place(id, body)`, replace its comment's last line `// part off (2.1). → the view of the row put in.` with:

```js
    // part off (2.1). Made blocks once inoculated, or, incubating in an area, once ready to fruit (spec 5). → the view of the
    // row put in.
```

before `const room = Number.isInteger(body.roomId) ? db.getRoom(body.roomId) : null;` add:

```js
      if (b.kind === 'made' && b.inoculatedAt == null) throw conflict('Record the inoculation before these blocks go into a room');
      if (b.kind === 'made' && b.incubation === 'area' && b.incubatedTo == null) throw conflict('These blocks incubate in an area: mark them ready to fruit first');
```

and at the start of its transaction, right after `const placedId = store.tx(() => {`:

```js
        // made blocks put in before any incubation was recorded incubate in that grow room (spec 5)
        if (b.kind === 'made' && b.incubation == null) for (const x of store.family(firstOf(b))) store.update(x.id, { incubation: 'room' });
```

(The part split off below reads the first row again, so it copies `incubation 'room'`.)

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js tests/batches.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/batches.js tests/batches-making.test.js
git commit -m "Batches part 2, 6: a made batch's steps (inoculate with its spawn, incubate in a grow room or an area, ready to fruit, edit the mix) and Put into a room once inoculated or ready"
```

---

### Task 7: Sterilising loads

**Files:**
- Modify: `server/batches-making.js`, `server/batches.js`
- Test: `tests/batches-making.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/batches-making.test.js`:

```js
test('sterilising loads: record, by time, edit, delete; not before the mix; bags up to the blocks made; only on a made batch', (t) => {
  const { batches, told } = setup(t);
  const b = made(batches);
  const l1 = batches.addLoad(b.id, LOAD);
  assert.deepEqual({ ...l1, id: 0 }, { id: 0, batchId: b.id, ...LOAD, createdAt: NOW });
  assert.equal(told.at(-1).batchId, b.id);
  const l2 = batches.addLoad(b.id, { ...LOAD, hotAt: NOW - DAY - 3_600_000, bags: 100 });
  const d = batches.detail(b.id);
  assert.deepEqual(d.loads.map((l) => l.id), [l2.id, l1.id], 'by the time they got hot');
  assert.equal(d.sterilisedAt, NOW - DAY, 'the last load');
  assert.equal(batches.list().batches[0].sterilisedAt, NOW - DAY);
  const e = batches.editLoad(l1.id, { bags: 300, holdH: 6.25 });
  assert.deepEqual([e.bags, e.holdH, e.method, e.worker], [300, 6.3, 'steam', 'Ali'], 'to 0.1 h; not given: kept');
  batches.removeLoad(l2.id);
  assert.deepEqual(batches.detail(b.id).loads.map((l) => l.id), [l1.id]);
  assert.equal(status(() => batches.removeLoad(l2.id))[0], 404);
  assert.equal(status(() => batches.editLoad(999, { bags: 1 }))[0], 404);
  const cases = [
    [{ method: 'boil' }, 'method'],
    [{ bags: 0 }, 'bags'],
    [{ bags: 401 }, 'bags'],
    [{ hotAt: NOW - 3 * DAY }, 'hotAt'],
    [{ hotAt: NOW + 60_000 }, 'hotAt'],
    [{ holdH: 0.25 }, 'holdH'],
    [{ tempC: 140 }, 'tempC'],
    [{ worker: '' }, 'worker'],
  ];
  for (const [change, field] of cases) {
    assert.deepEqual(status(() => batches.addLoad(b.id, { ...LOAD, ...change }))?.slice(0, 2), [400, field], JSON.stringify(change));
  }
  assert.equal(status(() => batches.addLoad(b.id, { ...LOAD, bags: 401 }))[2], 'Bags must be a whole number from 1 to 400');
  const bought = batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', blocks: 10 });
  assert.deepEqual(status(() => batches.addLoad(bought.id, LOAD)), [409, null, 'Only blocks made on the farm have sterilising loads']);
  assert.deepEqual(status(() => batches.edit(b.id, { blocks: 250 })), [400, 'blocks', 'A sterilising load has more bags than that']);
  assert.deepEqual(status(() => batches.edit(b.id, { mixedAt: NOW })), [400, 'mixedAt', 'Some sterilising loads are before that day']);
  batches.remove(b.id);
  assert.equal(status(() => batches.editLoad(l1.id, { bags: 1 }))[0], 404, "a batch's loads go with it");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js`
Expected: FAIL with `batches.addLoad is not a function`.

- [ ] **Step 3: The load check**

In `server/batches-making.js`, add `grouped` to the `batches-fields.js` import (`import { bad, isPlain, intIn, numIn, isTime, grouped, textOf, weightOf, MAX_BLOCKS, MAX_NOTE } from './batches-fields.js';`) and append:

```js

// A sterilising load's methods (spec 5): atmospheric steam, pressure, pasteurise.
export const METHODS = ['steam', 'pressure', 'pasteurise'];

// A sterilising load's fields (spec 2 and 5), without its worker (server/batches.js checks the name). mixedAt: the batch's day
// mixed (no load before it); blocks: the blocks made (a load holds at most those); was: the stored load (an edit: a field not
// given keeps its value). → { method, bags, hotAt, holdH, tempC }.
export function checkLoad(body, { mixedAt, blocks, now, was = null }) {
  if (!isPlain(body)) throw bad('Body must be a JSON object');
  const v = (k) => (Object.hasOwn(body, k) ? body[k] : was?.[k]);
  const method = v('method');
  if (!METHODS.includes(method)) throw bad('Pick a method', 'method');
  const bags = v('bags');
  if (!intIn(bags, 1, blocks)) throw bad(`Bags must be a whole number from 1 to ${grouped(blocks)}`, 'bags');
  const hotAt = v('hotAt');
  if (!isTime(hotAt, now) || localDate(hotAt) < localDate(mixedAt)) throw bad('Pick a time from the day mixed to now', 'hotAt');
  const holdH = v('holdH');
  if (!numIn(holdH, 0.5, 24)) throw bad('Hold must be 0.5–24 h', 'holdH');
  const tempC = v('tempC');
  if (!numIn(tempC, 60, 130)) throw bad('Temperature must be 60–130 °C', 'tempC');
  return { method, bags, hotAt, holdH: Math.round(holdH * 10) / 10, tempC: Math.round(tempC * 10) / 10 };
}
```

- [ ] **Step 4: The loads in `createBatches`; the worker check shared**

In `server/batches.js`, change the `batches-making.js` import to `import { checkRecipe, checkMade, checkMaterials, checkLoad, MIX_ITEMS } from './batches-making.js';`.

In `checkOf` (the contamination check's fields), replace:

```js
    let worker = was?.worker ?? null;
    if (!was || given('worker')) {
      try {
        worker = checkWorker(db, body.worker);
      } catch (err) {
        if (err instanceof TaskError) throw new BatchError(err.status, err.message, err.field);
        throw err;
      }
    }
```

with:

```js
    const worker = workerOf(body, was);
```

and after `checkOf`'s closing `}` add:

```js

  // Who did a check or a load: a name as Tasks' (checkWorker); `was` (an edit): kept when not given.
  function workerOf(body, was) {
    if (was && !Object.hasOwn(body, 'worker')) return was.worker;
    try {
      return checkWorker(db, body.worker);
    } catch (err) {
      if (err instanceof TaskError) throw new BatchError(err.status, err.message, err.field);
      throw err;
    }
  }

  // A sterilising load's fields on a made batch's first row (spec 5): bags up to the blocks made; `was` (an edit): a field not
  // given keeps its stored value.
  function loadOf(body, first, was = null) {
    const blocks = store.family(first.id).reduce((s, x) => s + x.blocks, 0);
    const fields = checkLoad(body, { mixedAt: first.mixedAt, blocks, now: now(), was });
    return { ...fields, worker: workerOf(body, was) };
  }

  // A load by id, with its batch's first row. → { load, first }.
  function loadById(loadId) {
    const load = Number.isInteger(loadId) ? store.load(loadId) : null;
    if (!load) throw new BatchError(404, 'Load not found');
    return { load, first: store.get(load.batchId) };
  }
```

In the returned object, before `// { <crop>: dry kg per block } …` (`dryKgFor`), add:

```js
    // ---- sterilising loads (spec 5): a made batch's, on its first row ----

    // A load on a made batch. → the load.
    addLoad(id, body) {
      const b = batchOf(id);
      const first = store.get(firstOf(b));
      if (first.kind !== 'made') throw conflict('Only blocks made on the farm have sterilising loads');
      const fields = loadOf(body, first);
      const loadId = store.tx(() => {
        const made = store.insertLoad({ batchId: first.id, ...fields, createdAt: now() });
        sync(first.id);
        return made;
      });
      tell([b]);
      return store.load(loadId);
    },

    editLoad(loadId, body) {
      const { load, first } = loadById(loadId);
      const fields = loadOf(body, first, load);
      store.tx(() => {
        store.updateLoad(loadId, fields);
        sync(first.id);
      });
      tell([first]);
      return store.load(loadId);
    },

    removeLoad(loadId) {
      const { first } = loadById(loadId);
      store.tx(() => {
        store.removeLoad(loadId);
        sync(first.id);
      });
      tell([first]);
    },

```

(`sync` on a load write: decision 6, the price is worked out again on every write to the batch.)

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js tests/batches.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/batches-making.js server/batches.js tests/batches-making.test.js
git commit -m "Batches part 2, 7: sterilising loads (record, edit, delete; not before the mix; bags up to the blocks made); the worker check shared with checks"
```

---

### Task 8: The made price per block, the made stock moves, Inventory's items, the CSV's columns

**Files:**
- Modify: `server/batches.js`
- Modify: `tests/batches.test.js` (the CSV test's head and rows)
- Test: `tests/batches-making.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/batches-making.test.js`:

```js
test("the made price per block and the stock moves, from Inventory's items and purchase prices", (t) => {
  const { db, batches, room, item, buy } = setup(t, { stock: true });
  const sawdust = item('Sawdust');
  const bran = item('Rice bran');
  const spawn = item('Grey oyster spawn', 'spawn');
  buy(sawdust, 0.35);
  buy(bran, 1.2);
  const b = made(batches, { materials: [{ item: 'sawdust', qty: 287, unit: 'kg', stockItemId: sawdust }, { item: 'bran', qty: 73.6, unit: 'kg', stockItemId: bran }] });
  assert.equal(b.pricePerBlock, 0.4719, '(287 × 0.35 + 73.6 × 1.2) ÷ 400 blocks made');
  const blocks = db.batches.blocksItem('Grey oyster blocks');
  const moves = () => db.batches.moves([b.id]).map((m) => [m.itemId, m.at, m.qty, m.unitCost, m.note]);
  assert.deepEqual(moves(), [
    [blocks, NOW - 2 * DAY, 400, 0.4719, null],
    [sawdust, NOW - 2 * DAY, -287, null, 'mixed'],
    [bran, NOW - 2 * DAY, -73.6, null, 'mixed'],
  ]);
  const i = batches.edit(b.id, { inoculatedAt: NOW - DAY, spawn: { qty: 12, unit: 'kg', stockItemId: spawn } });
  assert.equal(i.pricePerBlock, null, 'the spawn has no purchase price yet');
  assert.deepEqual(batches.detail(b.id).materials.map((m) => [m.itemName, m.unitCost]), [['Sawdust', 0.35], ['Rice bran', 1.2], ['Grey oyster spawn', null]]);
  buy(spawn, 8);
  assert.equal(batches.detail(b.id).pricePerBlock, null, 'a later purchase counts at the next write');
  assert.equal(batches.edit(b.id, { note: 'spawn bought' }).pricePerBlock, 0.7119, '+ 12 × 8, ÷ 400');
  assert.deepEqual(moves().at(-1), [spawn, NOW - DAY, -12, null, 'spawn'], 'the spawn out at the inoculation');
  assert.deepEqual(batches.list().batches[0].spawn, { qty: 12, unit: 'kg', unitCost: 8 }, "the 4-2 sheet's price per unit");
  const p = batches.place(b.id, { roomId: room(), blocks: 100 });
  assert.equal(p.pricePerBlock, 0.7119, "a part has the delivery's price: the blocks made, not the row's");
  assert.deepEqual(db.batches.moves([p.id]).map((m) => m.qty), [-100], 'into a room');
  assert.deepEqual(status(() => made(batches, { blocks: 1, materials: [{ item: 'sawdust', qty: 5000, unit: 'kg', stockItemId: bran }] })),
    [400, 'materials', 'The materials come to over RM 1,000 a block: check the amounts']);
  assert.deepEqual(status(() => made(batches, { materials: [{ item: 'sawdust', qty: 1, unit: 'kg', stockItemId: 999 }] }))?.slice(0, 2), [400, 'materials'], 'no such item');
  batches.remove(p.id);
  batches.remove(b.id);
  assert.deepEqual([db.batches.materials(b.id), db.batches.loads(b.id), db.batches.moves([b.id, p.id])], [[], [], []], 'its lines and moves go with it');
});

test("Inventory's items for the pickers; without Inventory an item picked is not kept and the price is unknown", (t) => {
  const plain = setup(t);
  assert.deepEqual(plain.batches.stockItems(), { items: [] });
  const b = made(plain.batches, { materials: [{ item: 'sawdust', qty: 287, unit: 'kg', stockItemId: 5 }] });
  assert.deepEqual([b.pricePerBlock, plain.batches.detail(b.id).materials[0].stockItemId], [null, null]);
  const { batches, item, buy } = setup(t, { stock: true });
  const sawdust = item('Sawdust');
  buy(sawdust, 0.35);
  batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', blocks: 10 }); // makes the item "Grey oyster blocks"
  assert.deepEqual(batches.stockItems(), { items: [{ id: sawdust, name: 'Sawdust', kind: 'other', unit: 'kg', unitCost: 0.35 }] });
});

test('the CSV ends with the day mixed and the recipe', (t) => {
  const { batches } = setup(t);
  const r = batches.addRecipe(RECIPE);
  made(batches, { recipeId: r.id });
  const lines = batches.csv().text.trimEnd().split('\r\n');
  assert.match(lines[0], /,note,mixed,recipe$/);
  assert.equal(lines[1], '2026-11-03,Grey oyster,made,,,,,400,0,,,,,2.3,60,,2026-11-03,Sawdust 78');
});
```

In `tests/batches.test.js`, test `'the CSV: the head, oldest first, the formula guard, the default 90 days'`, replace:

```js
  assert.equal(lines[0], 'received,crop,kind,supplier,strain,spawn batch,delivery note,blocks,lost,price per block,room,run started,placed,block kg,water %,note');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "2026-11-02,Grey oyster,bought,'=cmd,,0912,,1200,0,2.3,Container 1,2026-10-31,2026-11-05,,,");
  assert.match(lines[2], /,"a, b"$/);
```

with:

```js
  assert.equal(lines[0], 'received,crop,kind,supplier,strain,spawn batch,delivery note,blocks,lost,price per block,room,run started,placed,block kg,water %,note,mixed,recipe');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], "2026-11-02,Grey oyster,bought,'=cmd,,0912,,1200,0,2.3,Container 1,2026-10-31,2026-11-05,,,,,");
  assert.match(lines[2], /,"a, b",,$/);
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js tests/batches.test.js`
Expected: FAIL (the price is null; no material moves; `batches.stockItems is not a function`; the CSV has 16 columns).

- [ ] **Step 3: `sync` keeps the made price; the items; the CSV**

In `server/batches.js`:

Replace the file's head comment (lines 1–3) with:

```js
// Batches (spec 2026-11-05-batches-design.md 3, 5 and 6): receive bought blocks or make them (recipes, the mix, sterilising
// loads, inoculation, incubation), put them into a room's open run (a part split off when fewer go in) and take them out,
// contamination checks, the views, the CSV, and a run's dry kg for Harvest's BE (3.2). Every write keeps a made batch's price
// per block and Inventory's stock moves in step (3.1, 4) when Inventory's tables exist. No HTTP.
```

Add `madePrice` to the `batches-math.js` import. In `CSV_HEAD`, replace `'water %', 'note'];` with `'water %', 'note', 'mixed', 'recipe'];`.

Replace the whole `sync` function and its comment with:

```js
  // After a write to a delivery, inside its transaction (`gone`: ids of rows just deleted): a made batch's price per block worked
  // out again from its materials at Inventory's latest purchase prices and the blocks made, on every row (spec 4; over RM 1,000
  // a block is a slip in the amounts: refused); then Inventory's moves written again from the rows (3.1), when its tables exist.
  function sync(firstId, gone = []) {
    let family = store.family(firstId);
    const first = family.find((b) => b.parentId == null);
    const materials = first?.kind === 'made' ? store.materials(first.id) : [];
    if (first?.kind === 'made') {
      const price = madePrice(materials, (itemId) => store.purchasePrice(itemId), family.reduce((s, b) => s + b.blocks, 0));
      if (price !== null && price > 1000) throw bad('The materials come to over RM 1,000 a block: check the amounts', 'materials');
      if (family.some((b) => b.pricePerBlock !== price)) {
        for (const b of family) store.update(b.id, { pricePerBlock: price });
        family = store.family(firstId);
      }
    }
    if (!store.hasStock()) return;
    store.deleteMoves([...family.map((b) => b.id), ...gone]);
    if (!family.length) return;
    const itemId = store.blocksItem(`${cropShortName(family[0].crop)} blocks`);
    for (const m of movesOf(family, (id) => store.checks(id), materials)) store.insertMove({ itemId, ...m });
  }
```

(A material move carries its own `itemId`, which the spread keeps over the blocks item.)

In the returned object, before `// ---- sterilising loads (spec 5): a made batch's, on its first row ----`, add:

```js
    // { items: [{ id, name, kind, unit, unitCost }] }: Inventory's items a made batch's materials may draw from, with their
    // latest purchase price (decision 4 of part 2); none without Inventory.
    stockItems: () => ({ items: store.stockItems() }),

```

In `csv`, after the `const rows = …` line add:

```js
      const recipes = new Map(store.recipes().map((r) => [r.id, r.name]));
```

and replace the row's last line `b.blockKg, b.waterPct, b.note,` with:

```js
        b.blockKg, b.waterPct, b.note, b.mixedAt == null ? null : localDate(b.mixedAt), recipes.get(b.recipeId) ?? null,
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/batches-making.test.js tests/batches.test.js tests/batches-math.test.js tests/db-batches.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/batches.js tests/batches-making.test.js tests/batches.test.js
git commit -m "Batches part 2, 8: the made price per block from Inventory's purchase prices on every write; the made stock moves (blocks, materials, spawn); Inventory's items; the CSV's mixed and recipe"
```

---

### Task 9: The routes

**Files:**
- Modify: `server/batches-api.js`
- Test: `tests/api-batches.test.js`

- [ ] **Step 1: Write the failing test**

Append to `tests/api-batches.test.js`:

```js
test('making blocks: recipes, Make blocks, the steps through PUT, loads, the stock items; their 400s and 404s', async (t) => {
  const { call, of } = await app(t);
  const RECIPE = { name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, waterPct: 60, bagKg: 2.3 };
  const recipe = await call('POST', '/api/batch-recipes', RECIPE);
  assert.equal(recipe.status, 201, JSON.stringify(recipe.body));
  assert.deepEqual(of('batches').at(-1), { batchId: null, roomId: null, runId: null });
  assert.deepEqual((await call('GET', '/api/batch-recipes')).body.recipes.map((r) => r.id), [recipe.body.id]);
  const sum = await call('POST', '/api/batch-recipes', { ...RECIPE, name: 'Short', branPct: 10 });
  assert.deepEqual([sum.status, sum.body.field], [400, 'sawdustPct']);
  assert.equal((await call('PUT', `/api/batch-recipes/${recipe.body.id}`, { archived: true })).body.archived, true);
  assert.deepEqual((await call('GET', '/api/batch-recipes')).body.recipes, []);
  assert.equal((await call('GET', '/api/batch-recipes?all=1')).body.recipes.length, 1);
  assert.equal((await call('PUT', '/api/batch-recipes/99', { name: 'x' })).status, 404);
  assert.equal((await call('DELETE', `/api/batch-recipes/${recipe.body.id}`)).status, 404, 'archived, never deleted');
  const made = await call('POST', '/api/batches', { kind: 'made', crop: 'oyster', blocks: 400, materials: [{ item: 'sawdust', qty: 287, unit: 'kg' }] });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  assert.deepEqual([made.body.kind, made.body.status, made.body.supplier], ['made', 'making', null]);
  assert.deepEqual(of('batches').at(-1), { batchId: made.body.id, roomId: null, runId: null });
  const noBags = await call('POST', '/api/batches', { kind: 'made', crop: 'oyster' });
  assert.deepEqual([noBags.status, noBags.body.field], [400, 'blocks']);
  const load = await call('POST', `/api/batches/${made.body.id}/loads`, { method: 'steam', bags: 400, hotAt: Date.now(), holdH: 6, tempC: 98, worker: 'Ali' });
  assert.equal(load.status, 201, JSON.stringify(load.body));
  assert.equal((await call('PUT', `/api/batch-loads/${load.body.id}`, { bags: 300 })).body.bags, 300);
  const one = await call('GET', `/api/batches/${made.body.id}`);
  assert.deepEqual([one.body.loads.length, one.body.materials.length, one.body.recipe], [1, 1, null]);
  assert.equal((await call('DELETE', `/api/batch-loads/${load.body.id}`)).status, 204);
  assert.equal((await call('DELETE', `/api/batch-loads/${load.body.id}`)).status, 404);
  assert.equal((await call('PATCH', '/api/batch-loads/1')).status, 404);
  const step = await call('PUT', `/api/batches/${made.body.id}`, { inoculatedAt: Date.now(), supplier: 'Spawn Co', spawn: { qty: 12, unit: 'kg' } });
  assert.equal(step.status, 200, JSON.stringify(step.body));
  assert.deepEqual([step.body.supplier, step.body.spawn.qty], ['Spawn Co', 12]);
  assert.deepEqual((await call('GET', '/api/batches?status=making')).body.batches.map((b) => b.id), [made.body.id]);
  assert.deepEqual((await call('GET', '/api/batches/stock-items')).body, { items: [] });
  assert.equal((await call('POST', '/api/batches/stock-items')).status, 404);
  const bought = await call('POST', '/api/batches', GOOD);
  assert.equal((await call('POST', `/api/batches/${bought.body.id}/loads`, { method: 'steam' })).status, 409);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-batches.test.js`
Expected: FAIL (`/api/batch-recipes` is a 404).

- [ ] **Step 3: The routes**

Replace the whole of `server/batches-api.js` with:

```js
// The Batches routes (spec 2026-11-05-batches-design.md 6), called from api.js: GET and POST /api/batches (POST with
// kind 'made' makes blocks), GET /api/batches.csv, GET /api/batches/stock-items, GET, PUT and DELETE /api/batches/:id, POST
// /api/batches/:id/place, /unplace, /checks and /loads, PUT and DELETE /api/batch-checks/:id and /api/batch-loads/:id, GET and
// POST /api/batch-recipes, PUT /api/batch-recipes/:id. server/batches.js keeps the rules; this reads the query and body and
// turns its errors into the API's.

import { attachment } from './tasks-api.js';

const ID = '([1-9][0-9]{0,14})';
const ONE = new RegExp(`^/api/batches/${ID}$`);
const ACTION = new RegExp(`^/api/batches/${ID}/(place|unplace|checks|loads)$`);
const CHECK = new RegExp(`^/api/batch-checks/${ID}$`);
const LOAD = new RegExp(`^/api/batch-loads/${ID}$`);
const RECIPE = new RegExp(`^/api/batch-recipes/${ID}$`);
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
      else if (req.method === 'POST') {
        const body = await readJson(req);
        send(res, 201, body?.kind === 'made' ? batches.mix(body) : batches.receive(body));
      } else throw notFound();
      return true;
    }
    if (path === '/api/batches.csv') {
      if (req.method !== 'GET') throw notFound();
      const { name, text } = batches.csv({ from: param('from'), to: param('to') });
      res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': attachment(name) });
      res.end(BOM + text);
      return true;
    }
    if (path === '/api/batches/stock-items') {
      if (req.method !== 'GET') throw notFound();
      send(res, 200, batches.stockItems());
      return true;
    }
    if (path === '/api/batch-recipes') {
      if (req.method === 'GET') send(res, 200, batches.recipes({ all: param('all') === '1' }));
      else if (req.method === 'POST') send(res, 201, batches.addRecipe(await readJson(req)));
      else throw notFound();
      return true;
    }
    const recipe = RECIPE.exec(path);
    if (recipe) {
      if (req.method !== 'PUT') throw notFound(); // recipes are archived, never deleted
      send(res, 200, batches.editRecipe(Number(recipe[1]), await readJson(req)));
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
      else if (action[2] === 'loads') send(res, 201, batches.addLoad(id, await readJson(req)));
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
    const load = LOAD.exec(path);
    if (load) {
      const id = Number(load[1]);
      if (req.method === 'PUT') send(res, 200, batches.editLoad(id, await readJson(req)));
      else if (req.method === 'DELETE') { batches.removeLoad(id); noContent(); }
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

(`/api/batches/stock-items` is matched before `ONE`, whose id pattern would not take it anyway; `POST /api/batches` with `kind: 'made'` is Make blocks.)

- [ ] **Step 4: Run the tests and the whole suite**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-batches.test.js` then `npm test 2>&1 | tail -8`
Expected: PASS; the whole suite passes (a failure outside the Batches files: read it before changing anything).

- [ ] **Step 5: Commit**

```bash
git add server/batches-api.js tests/api-batches.test.js
git commit -m "Batches part 2, 9: the routes (recipes, Make blocks through POST /api/batches, loads, GET /api/batches/stock-items)"
```

---

### Task 10: The web's pure parts I: recipes, the Mix and the steps' boxes

**Files:**
- Modify: `web/batches-math.js`
- Test: `tests/web-batches-making.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `tests/web-batches-making.test.js`:

```js
// Making blocks on the Batches pages (spec 2026-11-05-batches-design.md 4, 5 and 7), the pure parts in web/batches-math.js:
// a recipe's amounts and lines, the dialogs' boxes and bodies, the status line, the Making card's steps, the made rows of the
// page and of the myGAP 4-2 sheet.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  recipeAmounts, waterGuide, recipeLine, recipeSum, sumText, recipeValues, recipeBody, mixValues, recipeFill, mixBody,
  inoculateValues, inoculateBody, loadValues, loadBody, incubateValues, incubateBody, readyBody, qtyText, bagsText, pctText,
} from '../web/batches-math.js';

const nb = '\u00a0';
const dot = `${nb}· `;
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 5, 4); // 5 Nov 2026 12:00 farm time
const RECIPE = { id: 3, name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, otherPct: 0, otherName: null, waterPct: 60, bagKg: 2.3, archived: false };
const b = (o) => ({ id: 1, parentId: null, kind: 'made', crop: 'oyster', supplier: null, receivedAt: NOW - 2 * DAY, mixedAt: NOW - 2 * DAY, blocks: 400,
  lost: 0, good: 400, pricePerBlock: null, spawnBatch: null, strain: null, inoculatedAt: null, blockKg: 2.3, waterPct: 60, recipeId: null,
  incubation: null, incubatedFrom: null, incubatedTo: null, sterilisedAt: null, spawn: null, runId: null, roomId: null, roomName: null,
  placedAt: null, note: null, status: 'making', ...o });

test("a recipe's amounts: each part's dry kg to 0.1 kg, the bags, the water guide; its line", () => {
  assert.deepEqual(recipeAmounts(RECIPE, 400), {
    dryKgPerBag: 0.92,
    lines: [
      { item: 'sawdust', name: null, qty: 287, unit: 'kg' }, { item: 'bran', name: null, qty: 73.6, unit: 'kg' },
      { item: 'lime', name: null, qty: 3.7, unit: 'kg' }, { item: 'gypsum', name: null, qty: 3.7, unit: 'kg' },
      { item: 'bags', name: null, qty: 400, unit: 'pcs' },
    ],
    waterL: 552,
  });
  const cotton = { ...RECIPE, sawdustPct: 70, otherPct: 8, otherName: 'Cotton waste' };
  assert.deepEqual(recipeAmounts(cotton, 100).lines.find((l) => l.item === 'other'), { item: 'other', name: 'Cotton waste', qty: 7.4, unit: 'kg' });
  assert.equal(waterGuide(RECIPE, 400), `Water: about 552${nb}L for 400${nb}bags, less the water the dry ingredients already hold.`);
  assert.equal(recipeLine(RECIPE), `Grey oyster${dot}Sawdust 78${nb}%${dot}Bran 20${nb}%${dot}Lime 1${nb}%${dot}Gypsum 1${nb}%${dot}60${nb}% water${dot}2.30${nb}kg a bag`);
  assert.equal(recipeLine({ ...cotton, crop: null }).split(dot).slice(0, 2).join('|'), `Any crop|Sawdust 70${nb}%`);
  assert.ok(recipeLine(cotton).includes(`Cotton waste 8${nb}%`));
});

test('the formatter for making: bags, %, a material in its unit', () => {
  assert.equal(bagsText(1), `1${nb}bag`);
  assert.equal(bagsText(2.5), `2.5${nb}bags`);
  assert.equal(pctText(78.5), `78.5${nb}%`);
  assert.equal(qtyText(1248.333, 'kg'), `1,248.33${nb}kg`);
  assert.equal(qtyText(400, 'pcs'), `400${nb}pcs`);
  assert.equal(qtyText(30, 'bags'), `30${nb}bags`);
  assert.equal(qtyText(null, 'kg'), '—');
});

test("the Recipe dialog: its boxes, the live sum, the body", () => {
  assert.equal(recipeValues(null).waterPct, '60');
  assert.deepEqual(recipeValues(RECIPE), { name: 'Sawdust 78', crop: 'oyster', sawdustPct: '78', branPct: '20', limePct: '1', gypsumPct: '1', otherPct: '', otherName: '', waterPct: '60', bagKg: '2.3' });
  const v = recipeValues(RECIPE);
  assert.equal(recipeSum(v), 100);
  assert.equal(sumText(v), `Sum 100${nb}%`);
  assert.equal(sumText({ ...v, branPct: '21' }), `Sum 101${nb}%: the parts must add up to 100${nb}%`);
  assert.equal(sumText({ ...v, branPct: 'x' }), 'Sum —');
  assert.equal(sumText(recipeValues(null)), `Sum 0${nb}%`, 'nothing typed yet: no warning');
  assert.deepEqual(recipeBody(v).body, { name: 'Sawdust 78', crop: 'oyster', sawdustPct: 78, branPct: 20, limePct: 1, gypsumPct: 1, otherPct: 0, otherName: null, waterPct: 60, bagKg: 2.3 });
  assert.deepEqual(recipeBody({ ...v, crop: '', otherPct: '8', otherName: 'Cotton', sawdustPct: '70' }).body.otherName, 'Cotton');
  assert.equal(recipeBody({ ...v, crop: '' }).body.crop, null, 'Any crop');
  assert.equal(recipeBody({ ...v, limePct: '1,5' }).field, 'limePct');
  assert.equal(recipeBody({ ...v, waterPct: '' }).field, 'waterPct');
  assert.equal(recipeBody({ ...v, bagKg: 'two' }).field, 'bagKg');
});

test('the Mix dialog: a new mix\'s boxes, a made batch\'s, a recipe\'s fill, the body', () => {
  const fresh = mixValues(null, '2026-11-05');
  assert.deepEqual([fresh.mixedDate, fresh.recipeId, fresh.blocks, fresh['qty-sawdust'], fresh['item-bags']], ['2026-11-05', '', '', '', '']);
  const one = mixValues(b({ recipeId: 3, note: 'n', materials: [
    { item: 'sawdust', name: null, qty: 287, unit: 'kg', stockItemId: 4 }, { item: 'other', name: 'Cotton', qty: 5, unit: 'kg', stockItemId: null },
    { item: 'spawn', name: null, qty: 12, unit: 'kg', stockItemId: 9 },
  ] }), '2026-11-05');
  assert.deepEqual([one.mixedDate, one.recipeId, one.crop, one.blocks, one['qty-sawdust'], one['item-sawdust'], one['qty-other'], one.otherName, one.blockKg, one.waterPct, one.note],
    ['2026-11-03', '3', 'oyster', '400', '287', '4', '5', 'Cotton', '2.3', '60', 'n']);
  assert.equal('qty-spawn' in one, false, 'the spawn is the Inoculate step\'s');
  assert.deepEqual(recipeFill(RECIPE, 400), {
    blockKg: '2.3', waterPct: '60', otherName: '', 'qty-sawdust': '287', 'qty-bran': '73.6', 'qty-lime': '3.7', 'qty-gypsum': '3.7', 'qty-other': '', 'qty-bags': '400',
  });
  assert.deepEqual(recipeFill(RECIPE, NaN), { blockKg: '2.3', waterPct: '60', otherName: '' }, 'no bags yet: the weight only');
  const v = { ...fresh, crop: 'oyster', blocks: '400', 'qty-sawdust': '287', 'item-sawdust': '4', 'qty-bran': '73.6', 'qty-bags': '400', blockKg: '2.3', waterPct: '60' };
  assert.deepEqual(mixBody(v).body, {
    mixedAt: Date.UTC(2026, 10, 4, 16), recipeId: null, crop: 'oyster', blocks: 400,
    materials: [
      { item: 'sawdust', name: null, qty: 287, unit: 'kg', stockItemId: 4 }, { item: 'bran', name: null, qty: 73.6, unit: 'kg', stockItemId: null },
      { item: 'bags', name: null, qty: 400, unit: 'pcs', stockItemId: null },
    ],
    blockKg: 2.3, waterPct: 60, note: '',
  });
  assert.equal('crop' in mixBody({ ...v, crop: '', recipeId: '3' }).body, false, "an empty crop: the recipe's");
  assert.equal(mixBody({ ...v, blocks: '40.5' }).field, 'blocks');
  assert.equal(mixBody({ ...v, 'qty-lime': 'a bit' }).field, 'qty-lime');
  assert.equal(mixBody({ ...v, mixedDate: '' }).field, 'mixedDate');
  assert.deepEqual(mixBody({ ...v, 'qty-other': '5', otherName: 'Cotton' }).body.materials[2], { item: 'other', name: 'Cotton', qty: 5, unit: 'kg', stockItemId: null });
  const edit = mixBody(v, { edit: { cropEditable: false, blocksEditable: false } }).body;
  assert.equal('crop' in edit || 'blocks' in edit, false);
});

test('the Inoculate, Sterilise, Incubate and Ready to fruit dialogs: boxes and bodies', () => {
  const inoculated = b({ inoculatedAt: NOW - DAY, supplier: 'Spawn Co', spawnBatch: '0912', materials: [{ item: 'spawn', qty: 30, unit: 'bags', stockItemId: 9 }] });
  assert.deepEqual(inoculateValues(inoculated, '2026-11-05'), { inoculatedDate: '2026-11-04', supplier: 'Spawn Co', strain: '', spawnBatch: '0912', spawnQty: '30', spawnUnit: 'bags', spawnItem: '9' });
  assert.deepEqual(inoculateValues(b({}), '2026-11-05').inoculatedDate, '2026-11-05', 'today by default');
  const v = { inoculatedDate: '2026-11-04', supplier: 'Spawn Co', strain: '', spawnBatch: '0912', spawnQty: '12', spawnUnit: 'kg', spawnItem: '7' };
  assert.deepEqual(inoculateBody(v).body, { inoculatedAt: Date.UTC(2026, 10, 3, 16), supplier: 'Spawn Co', strain: '', spawnBatch: '0912', spawn: { qty: 12, unit: 'kg', stockItemId: 7 } });
  assert.equal(inoculateBody({ ...v, spawnQty: '' }).body.spawn, null, 'no amount: no spawn line');
  assert.equal(inoculateBody({ ...v, spawnQty: 'x' }).field, 'spawnQty');
  assert.equal(inoculateBody({ ...v, inoculatedDate: '' }).field, 'inoculatedDate');

  assert.deepEqual(loadValues(null, b({ loads: [{ bags: 300 }] }), NOW), { method: 'steam', bags: '100', hotDate: '2026-11-05', hotTime: '12:00', holdH: '', tempC: '' }, 'the bags not yet sterilised');
  assert.equal(loadValues(null, b({ loads: [{ bags: 400 }] }), NOW).bags, '400', 'every bag was: all of them again');
  const load = { method: 'pressure', bags: 200, hotAt: Date.UTC(2026, 10, 4, 0, 12), holdH: 2.5, tempC: 121, worker: 'Ali' };
  assert.deepEqual(loadValues(load, b({}), NOW), { method: 'pressure', bags: '200', hotDate: '2026-11-04', hotTime: '08:12', holdH: '2.5', tempC: '121' });
  const lv = { method: 'steam', bags: '400', hotDate: '2026-11-04', hotTime: '8:12', holdH: '6', tempC: '98', worker: 'Ali' };
  assert.deepEqual(loadBody(lv).body, { method: 'steam', bags: 400, hotAt: Date.UTC(2026, 10, 4, 0, 12), holdH: 6, tempC: 98, worker: 'Ali' });
  assert.equal(loadBody({ ...lv, hotTime: '25:00' }).field, 'hotTime');
  assert.equal(loadBody({ ...lv, hotDate: '' }).field, 'hotDate');
  assert.equal(loadBody({ ...lv, bags: '' }).field, 'bags');
  assert.equal(loadBody({ ...lv, holdH: '' }).field, 'holdH');
  assert.equal(loadBody({ ...lv, tempC: 'hot' }).field, 'tempC');
  assert.equal('worker' in loadBody({ ...lv, worker: '' }, { edit: true }).body, false, 'an Edit with no name keeps the stored one');

  assert.deepEqual(incubateValues(b({ inoculatedAt: NOW - DAY })), { incubation: '', fromDate: '2026-11-04', toDate: '' });
  assert.deepEqual(incubateValues(b({ inoculatedAt: NOW - 2 * DAY, incubation: 'area', incubatedFrom: NOW - DAY, incubatedTo: NOW })), { incubation: 'area', fromDate: '2026-11-04', toDate: '2026-11-05' });
  assert.deepEqual(incubateBody({ incubation: 'area', fromDate: '2026-11-04', toDate: '' }).body, { incubation: 'area', incubatedFrom: Date.UTC(2026, 10, 3, 16), incubatedTo: null });
  assert.deepEqual(incubateBody({ incubation: 'room', fromDate: '2026-11-04', toDate: '2026-11-05' }).body, { incubation: 'room', incubatedFrom: null, incubatedTo: null });
  assert.deepEqual(incubateBody({ incubation: '', fromDate: '', toDate: '' }).body, { incubation: null, incubatedFrom: null, incubatedTo: null }, 'not yet');
  assert.equal(incubateBody({ incubation: 'area', fromDate: '', toDate: '' }).field, 'fromDate');
  assert.deepEqual(readyBody({ readyDate: '2026-11-05' }).body, { incubatedTo: Date.UTC(2026, 10, 4, 16) });
  assert.equal(readyBody({ readyDate: '' }).field, 'readyDate');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-batches-making.test.js`
Expected: FAIL (`recipeAmounts` is not exported).

- [ ] **Step 3: Implement**

In `web/batches-math.js`, change the `harvest-math.js` import to `import { whenMs, whenBoxes, rmText } from './harvest-math.js';`, end the head comment's last line with `…the dialogs' bodies, and making blocks (spec 4 and 5: a recipe's amounts, the steps, their bodies).`, and append at the end of the file:

```js
// ---- making blocks (spec 4 and 5) ----

export const MIX_ITEMS = ['sawdust', 'bran', 'lime', 'gypsum', 'other', 'bags'];
export const RECIPE_PARTS = ['sawdustPct', 'branPct', 'limePct', 'gypsumPct', 'otherPct'];
const PART_ITEMS = { sawdustPct: 'sawdust', branPct: 'bran', limePct: 'lime', gypsumPct: 'gypsum', otherPct: 'other' };
export const MATERIAL_NAMES = { sawdust: 'Sawdust', bran: 'Bran', lime: 'Lime', gypsum: 'Gypsum', other: 'Other', bags: 'Plastic bags', spawn: 'Spawn' };
export const METHOD_NAMES = { steam: 'Atmospheric steam', pressure: 'Pressure', pasteurise: 'Pasteurise' };
const round1 = (v) => Math.round(v * 10) / 10;
const boxText = (v) => (v === null || v === undefined ? '' : String(v));

export const bagsText = (n) => (finite(n) ? `${grouped(n, 0, 2)}${NB}${n === 1 ? 'bag' : 'bags'}` : DASH);
export const pctText = (v) => (finite(v) ? `${grouped(v, 0, 1)}${NB}%` : DASH);
// A material's amount in its unit: kg to 2 decimals at most, bags, pieces.
export function qtyText(qty, unit) {
  if (!finite(qty)) return DASH;
  if (unit === 'pcs') return `${grouped(qty, 0)}${NB}pcs`;
  if (unit === 'bags') return bagsText(qty);
  return `${grouped(qty, 0, 2)}${NB}kg`;
}

// A recipe's amounts for `bags` bags (spec 4): the dry kg a bag, each ingredient's kg to 0.1 kg (the parts at 0 % left out),
// the plastic bags, and the water guide in L. → { dryKgPerBag, lines: [{ item, name, qty, unit }], waterL }.
export function recipeAmounts(recipe, bags) {
  const dryKgPerBag = recipe.bagKg * (1 - recipe.waterPct / 100);
  const lines = RECIPE_PARTS.filter((k) => recipe[k] > 0).map((k) => ({
    item: PART_ITEMS[k], name: k === 'otherPct' ? recipe.otherName : null, qty: round1((bags * dryKgPerBag * recipe[k]) / 100), unit: 'kg',
  }));
  lines.push({ item: 'bags', name: null, qty: bags, unit: 'pcs' });
  return { dryKgPerBag: Math.round(dryKgPerBag * 1000) / 1000, lines, waterL: round1((bags * recipe.bagKg * recipe.waterPct) / 100) };
}
export const waterGuide = (recipe, bags) => `Water: about ${grouped(recipeAmounts(recipe, bags).waterL, 0)}${NB}L for ${bagsText(bags)}, less the water the dry ingredients already hold.`;

// "Grey oyster · Sawdust 78 % · Bran 20 % · Lime 1 % · Gypsum 1 % · 60 % water · 2.30 kg a bag".
export function recipeLine(r) {
  const parts = RECIPE_PARTS.filter((k) => r[k] > 0).map((k) => `${k === 'otherPct' ? r.otherName : MATERIAL_NAMES[PART_ITEMS[k]]} ${pctText(r[k])}`);
  return [r.crop ? cropShortName(r.crop) : 'Any crop', ...parts, `${pctText(r.waterPct)} water`, `${blockKgText(r.bagKg)} a bag`].join(DOT);
}

// The five parts typed (an empty box is 0) → their sum to 0.1, or NaN when one is not a number.
export function recipeSum(v) {
  let sum = 0;
  for (const k of RECIPE_PARTS) {
    const n = numberOf(v[k]);
    if (Number.isNaN(n)) return NaN;
    sum += n ?? 0;
  }
  return round1(sum);
}
// The Recipe dialog's live sum under the parts (no warning before a part is typed).
export function sumText(v) {
  const sum = recipeSum(v);
  if (Number.isNaN(sum)) return `Sum ${DASH}`;
  return Math.round(sum * 10) === 1000 || sum === 0 ? `Sum ${pctText(sum)}` : `Sum ${pctText(sum)}: the parts must add up to 100${NB}%`;
}

// A recipe's boxes for Edit; null: Add's (water 60 %).
export function recipeValues(r = null) {
  if (!r) return { name: '', crop: '', sawdustPct: '', branPct: '', limePct: '', gypsumPct: '', otherPct: '', otherName: '', waterPct: '60', bagKg: '' };
  return {
    name: r.name, crop: r.crop ?? '', ...Object.fromEntries(RECIPE_PARTS.map((k) => [k, k === 'otherPct' && !r[k] ? '' : boxText(r[k])])),
    otherName: boxText(r.otherName), waterPct: boxText(r.waterPct), bagKg: boxText(r.bagKg),
  };
}

// The Recipe dialog's boxes → { body } or { field, message }; an empty part is 0.
export function recipeBody(v) {
  const body = { name: v.name ?? '', crop: v.crop || null };
  for (const k of RECIPE_PARTS) {
    const n = numberOf(v[k]);
    if (Number.isNaN(n)) return { field: k, message: 'Give the part as a number, like 78, or leave it empty' };
    body[k] = n ?? 0;
  }
  body.otherName = body.otherPct > 0 ? v.otherName ?? '' : null;
  body.waterPct = numberOf(v.waterPct);
  if (!finite(body.waterPct)) return { field: 'waterPct', message: 'Give the water as a number, like 60' };
  body.bagKg = numberOf(v.bagKg);
  if (!finite(body.bagKg)) return { field: 'bagKg', message: "Give a bag's weight as a number, like 2.3" };
  return { body };
}

// The Mix dialog's boxes: a new mix's (b null: mixed today) or a made batch's (its detail: its mix lines, not the spawn).
// A material's boxes are qty-<item> and item-<item> (its Inventory item).
export function mixValues(b = null, today = farmDate(Date.now())) {
  const v = { mixedDate: today, recipeId: '', crop: '', blocks: '', otherName: '', blockKg: '', waterPct: '', note: '' };
  for (const item of MIX_ITEMS) {
    v[`qty-${item}`] = '';
    v[`item-${item}`] = '';
  }
  if (!b) return v;
  Object.assign(v, {
    mixedDate: farmDate(b.mixedAt ?? b.receivedAt), recipeId: boxText(b.recipeId), crop: b.crop, blocks: String(b.blocks),
    blockKg: boxText(b.blockKg), waterPct: boxText(b.waterPct), note: boxText(b.note),
  });
  for (const m of b.materials ?? []) {
    if (!MIX_ITEMS.includes(m.item)) continue;
    v[`qty-${m.item}`] = String(m.qty);
    v[`item-${m.item}`] = boxText(m.stockItemId);
    if (m.item === 'other') v.otherName = boxText(m.name);
  }
  return v;
}

// The boxes a recipe fills for `bags` bags: the weight and water, the other ingredient's name and, with a whole number of
// bags, every material's amount (empty for a part at 0 %).
export function recipeFill(recipe, bags) {
  const out = { blockKg: String(recipe.bagKg), waterPct: String(recipe.waterPct), otherName: recipe.otherPct > 0 ? boxText(recipe.otherName) : '' };
  if (!(Number.isInteger(bags) && bags > 0)) return out;
  for (const item of MIX_ITEMS) out[`qty-${item}`] = '';
  for (const m of recipeAmounts(recipe, bags).lines) out[`qty-${m.item}`] = String(m.qty);
  return out;
}

// The Mix dialog's boxes → { body } or { field, message }: an empty amount leaves its material out; the water % counts only
// with a weight. edit: { cropEditable, blocksEditable } (those boxes not shown otherwise, and not sent); an empty crop is left
// to the recipe's.
export function mixBody(v, { edit = null } = {}) {
  const body = { mixedAt: dayMs(v.mixedDate) };
  if (!finite(body.mixedAt)) return { field: 'mixedDate', message: 'Pick the day mixed' };
  body.recipeId = v.recipeId ? Number(v.recipeId) : null;
  if ((!edit || edit.cropEditable) && v.crop) body.crop = v.crop;
  if (!edit || edit.blocksEditable) {
    const n = numberOf(v.blocks);
    if (!Number.isInteger(n)) return { field: 'blocks', message: 'Give the bags as a whole number' };
    body.blocks = n;
  }
  body.materials = [];
  for (const item of MIX_ITEMS) {
    const qty = numberOf(v[`qty-${item}`]);
    if (Number.isNaN(qty)) return { field: `qty-${item}`, message: 'Give the amount as a number, or leave it empty' };
    if (qty === null) continue;
    const stock = v[`item-${item}`] ? Number(v[`item-${item}`]) : null;
    body.materials.push({ item, name: item === 'other' ? v.otherName ?? '' : null, qty, unit: item === 'bags' ? 'pcs' : 'kg', stockItemId: stock });
  }
  const kg = numberOf(v.blockKg);
  if (Number.isNaN(kg)) return { field: 'blockKg', message: 'Give the weight as a number, like 2.3, or leave it empty' };
  const water = kg === null ? null : numberOf(v.waterPct);
  if (Number.isNaN(water)) return { field: 'waterPct', message: 'Give the water as a number, like 60' };
  body.blockKg = kg;
  body.waterPct = water;
  body.note = v.note ?? '';
  return { body };
}

// The Inoculate dialog's boxes (b: the detail; today the day by default) and back → { body } or { field, message }: an empty
// spawn amount clears the spawn line.
export function inoculateValues(b, today) {
  const spawn = (b.materials ?? []).find((m) => m.item === 'spawn');
  return {
    inoculatedDate: finite(b.inoculatedAt) ? farmDate(b.inoculatedAt) : today, supplier: boxText(b.supplier), strain: boxText(b.strain),
    spawnBatch: boxText(b.spawnBatch), spawnQty: spawn ? String(spawn.qty) : '', spawnUnit: spawn?.unit ?? 'kg', spawnItem: boxText(spawn?.stockItemId),
  };
}
export function inoculateBody(v) {
  const inoculatedAt = dayMs(v.inoculatedDate);
  if (!finite(inoculatedAt)) return { field: 'inoculatedDate', message: 'Pick the day inoculated' };
  const qty = numberOf(v.spawnQty);
  if (Number.isNaN(qty)) return { field: 'spawnQty', message: 'Give the spawn as a number, or leave it empty' };
  const spawn = qty === null ? null : { qty, unit: v.spawnUnit === 'bags' ? 'bags' : 'kg', stockItemId: v.spawnItem ? Number(v.spawnItem) : null };
  return { body: { inoculatedAt, supplier: v.supplier ?? '', strain: v.strain ?? '', spawnBatch: v.spawnBatch ?? '', spawn } };
}

// The blocks made: the delivery's (the first row's and its parts').
const madeBlocks = (b) => (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);

// A sterilising load's boxes: load's for Edit; a new one's the bags not yet sterilised (all of them again once every bag
// was) and now. nowMs: the time shown.
export function loadValues(load, b, nowMs) {
  const shown = whenBoxes(load?.hotAt ?? nowMs);
  if (load) return { method: load.method, bags: String(load.bags), hotDate: shown.date, hotTime: shown.time, holdH: String(load.holdH), tempC: String(load.tempC) };
  const rest = madeBlocks(b) - (b.loads ?? []).reduce((s, l) => s + l.bags, 0);
  return { method: 'steam', bags: String(rest > 0 ? rest : madeBlocks(b)), hotDate: shown.date, hotTime: shown.time, holdH: '', tempC: '' };
}
// → { body } or { field, message }; an Edit with no name picked keeps the stored one.
export function loadBody(v, { edit = false } = {}) {
  const hotAt = whenMs(v.hotDate, v.hotTime);
  if (!finite(hotAt)) return /^\d{4}-\d{2}-\d{2}$/.test(String(v.hotDate ?? '')) ? { field: 'hotTime', message: 'Give the time as 24 h, like 08:12' } : { field: 'hotDate', message: 'Pick the day' };
  const bags = numberOf(v.bags);
  if (!Number.isInteger(bags)) return { field: 'bags', message: 'Give the bags as a whole number' };
  const holdH = numberOf(v.holdH);
  if (!finite(holdH)) return { field: 'holdH', message: 'Give the hold in hours, like 6' };
  const tempC = numberOf(v.tempC);
  if (!finite(tempC)) return { field: 'tempC', message: 'Give the temperature as a number, like 98' };
  const body = { method: v.method, bags, hotAt, holdH, tempC };
  if (v.worker || !edit) body.worker = v.worker ?? '';
  return { body };
}

// The Incubate dialog's boxes (the area's From is the inoculation day by default) and back → { body } or { field, message }:
// '' (not yet) clears the incubation; a grow room has no dates.
export function incubateValues(b) {
  const from = finite(b.incubatedFrom) ? b.incubatedFrom : b.inoculatedAt;
  return { incubation: b.incubation ?? '', fromDate: finite(from) ? farmDate(from) : '', toDate: finite(b.incubatedTo) ? farmDate(b.incubatedTo) : '' };
}
export function incubateBody(v) {
  if (v.incubation !== 'area') return { body: { incubation: v.incubation === 'room' ? 'room' : null, incubatedFrom: null, incubatedTo: null } };
  const from = dayMs(v.fromDate);
  if (!finite(from)) return { field: 'fromDate', message: 'Pick the day the incubation began' };
  const to = v.toDate ? dayMs(v.toDate) : null;
  if (Number.isNaN(to)) return { field: 'toDate', message: 'Pick the day they were ready, or leave it empty' };
  return { body: { incubation: 'area', incubatedFrom: from, incubatedTo: to } };
}
// Ready to fruit's day → { body } or { field, message }.
export function readyBody(v) {
  const at = dayMs(v.readyDate);
  return finite(at) ? { body: { incubatedTo: at } } : { field: 'readyDate', message: 'Pick the day they were ready' };
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-batches-making.test.js tests/web-batches-math.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/batches-math.js tests/web-batches-making.test.js
git commit -m "Batches part 2, 10: the web's making parts (a recipe's amounts, line and sum; the Recipe, Mix, Inoculate, Sterilise, Incubate and Ready boxes and bodies)"
```

---

### Task 11: The web's pure parts II: the status line, the Making card's steps, the page's and the sheet's made rows

**Files:**
- Modify: `web/batches-math.js`
- Test: `tests/web-batches-making.test.js`

- [ ] **Step 1: Write the failing tests**

In `tests/web-batches-making.test.js`, add to the import list (after `pctText,`):

```js
  statusText, placeable, pageGroups, placedLine, detailFacts, makingSteps, loadLine, sterilisedNote, madePriceNote, sheetRows,
```

and append:

```js
test('a made batch\'s status line, step by step; Put into a room once it can go in', () => {
  const today = '2026-11-05';
  assert.equal(statusText(b({}), today), 'Mixed 3 Nov');
  assert.equal(statusText(b({ sterilisedAt: NOW - DAY - 3_600_000 }), today), 'Sterilised 4 Nov');
  assert.equal(statusText(b({ sterilisedAt: NOW - DAY, inoculatedAt: NOW - DAY }), today), 'Inoculated 4 Nov');
  assert.equal(statusText(b({ inoculatedAt: NOW - 12 * DAY, incubation: 'area', incubatedFrom: NOW - 11 * DAY }), today), `Incubating since 25 Oct${dot}day 12`);
  assert.equal(statusText(b({ incubation: 'area', incubatedFrom: NOW - 11 * DAY, incubatedTo: NOW, status: 'waiting' }), today), 'Ready to fruit');
  assert.equal(statusText(b({ status: 'placed', roomName: 'Container 2' }), today), 'In Container 2');
  assert.equal(statusText(b({ kind: 'bought', status: 'waiting' }), today), 'Waiting');
  assert.equal(placeable(b({})), false, 'not inoculated');
  assert.equal(placeable(b({ inoculatedAt: NOW - DAY })), true, 'to incubate in a grow room');
  assert.equal(placeable(b({ inoculatedAt: NOW - DAY, incubation: 'area', incubatedFrom: NOW - DAY })), false, 'in an area until ready');
  assert.equal(placeable(b({ status: 'waiting' })), true);
  assert.equal(placeable(b({ status: 'placed' })), false);
});

test('the page: making batches in their own group; a made batch in a room says when it was made; its facts', () => {
  const g = pageGroups([b({ id: 1 }), b({ id: 2, kind: 'bought', status: 'waiting' }), b({ id: 3, status: 'waiting', incubation: 'area', incubatedTo: NOW })]);
  assert.deepEqual([g.making.map((x) => x.id), g.waiting.map((x) => x.id)], [[1], [2, 3]]);
  assert.equal(placedLine(b({ supplier: 'Spawn Co', spawnBatch: '0912' }), '2026-11-05'), `Spawn Co${dot}spawn batch 0912${dot}made 3 Nov`);
  const one = b({ supplier: 'Spawn Co', spawnBatch: '0912', deliveryRef: 'never shown', dryKg: 0.92, pricePerBlock: 0.7119,
    delivery: [b({ blocks: 300 }), b({ id: 2, parentId: 1, blocks: 100 })] });
  assert.deepEqual(detailFacts(one), [
    ['Spawn supplier', 'Spawn Co'], ['Spawn batch', '0912'], ['Block weight', `2.30${nb}kg${dot}60${nb}% water${dot}0.92${nb}kg dry`],
    ['Price per block', `RM${nb}0.71`], ['Blocks made', `400${nb}blocks${dot}RM${nb}284.76`],
  ]);
});

test('the Making card\'s steps: what each recorded, and what can be done next', () => {
  const today = '2026-11-05';
  const mk = b({
    recipe: { name: 'Sawdust 78' }, supplier: 'Spawn Co', strain: 'PL-27', spawnBatch: '0912', inoculatedAt: NOW - DAY, incubation: 'area', incubatedFrom: NOW - DAY,
    materials: [
      { item: 'sawdust', qty: 287, unit: 'kg', itemName: 'Sawdust (Kilang Jaya)' }, { item: 'other', name: 'Cotton waste', qty: 10, unit: 'kg' },
      { item: 'spawn', qty: 12, unit: 'kg' },
    ],
    loads: [],
  });
  const steps = makingSteps(mk, today);
  assert.deepEqual(steps.map((s) => [s.key, s.done, s.can]), [['mix', true, true], ['sterilise', false, true], ['inoculate', true, true], ['incubate', true, true]]);
  assert.deepEqual(steps[0].lines, [`Mixed 3 Nov${dot}recipe Sawdust 78${dot}400${nb}bags`, `Sawdust${dot}287${nb}kg${dot}from Sawdust (Kilang Jaya)`, `Cotton waste${dot}10${nb}kg`]);
  assert.deepEqual(steps[2].lines, [`Inoculated 4 Nov${dot}Spawn Co${dot}PL-27${dot}batch 0912${dot}12${nb}kg spawn`]);
  assert.deepEqual(steps[3].lines, [`In an area since 4 Nov${dot}day 2`]);
  assert.deepEqual(makingSteps({ ...mk, incubatedTo: NOW }, today)[3].lines, [`In an area since 4 Nov${dot}ready to fruit 5 Nov`]);
  const fresh = makingSteps(b({}), today);
  assert.deepEqual([fresh[0].lines[0], fresh[2].lines, fresh[3].can, fresh[3].why], [`Mixed 3 Nov${dot}no recipe${dot}400${nb}bags`, [], false, 'Record the inoculation first']);
  const inRoom = makingSteps(b({ inoculatedAt: NOW - DAY, incubation: 'room', placedAt: NOW, roomName: 'Container 1', status: 'placed' }), today)[3];
  assert.deepEqual([inRoom.lines, inRoom.can, inRoom.why], [[`In a grow room${dot}Container 1`], false, 'Some blocks are in a room']);
  assert.deepEqual(makingSteps(b({ inoculatedAt: NOW - DAY, incubation: 'room' }), today)[3].lines, ['In a grow room: put the blocks into a room']);
});

test('a load\'s line, the amber note of bags not yet sterilised, the price note', () => {
  assert.equal(loadLine({ hotAt: Date.UTC(2026, 10, 4, 0, 12), method: 'steam', bags: 400, tempC: 98, holdH: 6, worker: 'Ali' }, '2026-11-05'),
    `4 Nov 08:12${dot}Atmospheric steam${dot}400${nb}bags${dot}98${nb}°C for 6${nb}h${dot}Ali`);
  assert.equal(sterilisedNote(b({ loads: [{ bags: 300 }] })), '300 of 400 bags sterilised');
  assert.equal(sterilisedNote(b({ loads: [{ bags: 300 }, { bags: 100 }] })), null);
  assert.equal(sterilisedNote(b({ loads: [] })), null);
  assert.match(madePriceNote(b({ pricePerBlock: 0.71 })), /^The price per block is the materials/);
  assert.match(madePriceNote(b({})), /^No price per block yet/);
});

test('the 4-2 sheet: a made batch\'s receipt is its spawn, its use "made into" the blocks, then its placements', () => {
  const range = { from: '2026-11-01', to: '2026-11-30', today: '2026-11-05' };
  const first = b({ id: 5, blocks: 300, supplier: 'Spawn Co', strain: 'PL-27', spawnBatch: '0912', receivedAt: Date.UTC(2026, 10, 1, 4),
    mixedAt: Date.UTC(2026, 10, 1, 4), inoculatedAt: Date.UTC(2026, 10, 3, 4), spawn: { qty: 12, unit: 'kg', unitCost: 8 }, pricePerBlock: 0.71 });
  const part = b({ id: 6, parentId: 5, blocks: 100, strain: 'PL-27', spawnBatch: '0912', placedAt: Date.UTC(2026, 10, 4, 4), usedBlocks: 100, runId: 4,
    roomName: 'Container 1', runStartedAt: Date.UTC(2026, 9, 3, 4), status: 'placed' });
  assert.deepEqual(sheetRows([part, first], range), [
    ['3 Nov 2026', `Grey oyster spawn${dot}PL-27${dot}batch 0912`, `12${nb}kg`, `RM${nb}8.00`, '', '', '', '', '', 'Spawn Co'],
    ['3 Nov 2026', `Grey oyster spawn${dot}PL-27${dot}batch 0912`, '', '', `12${nb}kg`, `made into 400${nb}blocks`, '', '', '', ''],
    ['4 Nov 2026', `Grey oyster blocks${dot}PL-27${dot}batch 0912`, '', '', `100${nb}blocks`, `Container 1${dot}run of 3 Oct`, '', '', '', ''],
  ]);
  assert.deepEqual(sheetRows([{ ...first, inoculatedAt: null, spawn: null }], range), [], 'not inoculated yet: nothing to write');
  assert.equal(sheetRows([{ ...first, spawn: { qty: 30, unit: 'bags', unitCost: null } }], range)[0][3], '', 'no price: blank to write in');
  assert.equal(sheetRows([{ ...first, spawn: null }], range)[0][2], '', 'no spawn line: blank');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-batches-making.test.js`
Expected: the five new tests FAIL (`statusText` is not exported, …).

- [ ] **Step 3: Implement**

In `web/batches-math.js`:

`pageGroups`: its comment becomes `// { making, waiting, rooms: [{ runId, roomId, roomName, runStartedAt, batches, over }] by room name, past } of the list reply` + `// (making: made batches not yet ready, listed above the waiting ones).`, and its `return` becomes:

```js
  return {
    making: batches.filter((x) => x.status === 'making'), waiting: batches.filter((x) => x.status === 'waiting'), rooms,
    past: batches.filter((x) => x.status === 'past'),
  };
```

`placedLine` becomes:

```js
export const placedLine = (b, today) => [b.supplier, b.spawnBatch ? `spawn batch ${b.spawnBatch}` : null,
  b.kind === 'made' ? `made ${dateText(b.mixedAt ?? b.receivedAt, today)}` : `received ${dateText(b.receivedAt, today)}`].filter(Boolean).join(DOT);
```

`detailFacts` becomes:

```js
export function detailFacts(b) {
  const total = (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);
  const made = b.kind === 'made'; // its spawn's supplier; no delivery note; its blocks made at the materials' cost
  return [
    ['Spawn supplier', made ? b.supplier : null], ['Spawn batch', b.spawnBatch], ['Strain', b.strain], ['Delivery note', made ? null : b.deliveryRef],
    ['Inoculated', finite(b.inoculatedAt) ? fullDate(b.inoculatedAt) : null], ['Block weight', weightText(b)],
    ['Price per block', finite(b.pricePerBlock) ? rmText(b.pricePerBlock) : null],
    [made ? 'Blocks made' : 'Delivery', finite(b.pricePerBlock) ? `${blocksText(total)}${DOT}${rmText(total * b.pricePerBlock)}` : blocksText(total)],
    ['Note', b.note],
  ].filter(([, v]) => v !== null && v !== undefined && v !== '');
}
```

After `export const materialText = …;` add:

```js
export const spawnText = (b) => [`${cropShortName(b.crop)} spawn`, b.strain, b.spawnBatch ? `batch ${b.spawnBatch}` : null].filter(Boolean).join(DOT);
```

`sheetRows`: add to its comment `// A made batch's receipt is its spawn, on the day inoculated (the amount, its price per unit when known, the spawn supplier),` + `// with a use row the same day: the spawn "made into" the blocks (none before the inoculation).`, and replace, inside its loop:

```js
    const received = farmDate(first.receivedAt);
    if (inRange(received)) {
      const total = family.reduce((s, b) => s + b.blocks, 0);
      rows.push({ date: received, order: 0, id: firstId,
        cells: [fullDate(first.receivedAt), materialText(first), blocksText(total), finite(first.pricePerBlock) ? rmText(first.pricePerBlock) : '', '', '', '', '', '', first.supplier ?? ''] });
    }
    for (const b of family) {
      if (!finite(b.placedAt) || !inRange(farmDate(b.placedAt))) continue;
      rows.push({ date: farmDate(b.placedAt), order: 1, id: b.id,
```

with:

```js
    const received = farmDate(first.receivedAt);
    const total = family.reduce((s, b) => s + b.blocks, 0);
    if (first.kind === 'made') {
      const day = finite(first.inoculatedAt) ? farmDate(first.inoculatedAt) : null;
      if (day && inRange(day)) {
        const amount = first.spawn ? qtyText(first.spawn.qty, first.spawn.unit) : '';
        const price = finite(first.spawn?.unitCost) ? rmText(first.spawn.unitCost) : '';
        rows.push({ date: day, order: 0, id: firstId, cells: [fullDate(first.inoculatedAt), spawnText(first), amount, price, '', '', '', '', '', first.supplier ?? ''] });
        rows.push({ date: day, order: 1, id: firstId, cells: [fullDate(first.inoculatedAt), spawnText(first), '', '', amount, `made into ${blocksText(total)}`, '', '', '', ''] });
      }
    } else if (inRange(received)) {
      rows.push({ date: received, order: 0, id: firstId,
        cells: [fullDate(first.receivedAt), materialText(first), blocksText(total), finite(first.pricePerBlock) ? rmText(first.pricePerBlock) : '', '', '', '', '', '', first.supplier ?? ''] });
    }
    for (const b of family) {
      if (!finite(b.placedAt) || !inRange(farmDate(b.placedAt))) continue;
      rows.push({ date: farmDate(b.placedAt), order: 2, id: b.id,
```

(the rest of the placement row unchanged). Then append at the end of the file:

```js
// A batch's status in words (spec 4): a made batch's step while it is being made ("Mixed 3 Nov", "Sterilised 3 Nov",
// "Inoculated 4 Nov", "Incubating since 4 Nov · day 12", the first day day 1), "Ready to fruit" once ready and waiting; else
// as a bought batch's (statusLine).
export function statusText(b, today) {
  if (b.kind !== 'made') return statusLine(b);
  if (b.status === 'waiting' && b.incubation === 'area' && finite(b.incubatedTo)) return 'Ready to fruit';
  if (b.status !== 'making') return statusLine(b);
  if (b.incubation === 'area' && finite(b.incubatedFrom)) {
    return `Incubating since ${dateText(b.incubatedFrom, today)}${DOT}day ${daysFrom(farmDate(b.incubatedFrom), today) + 1}`;
  }
  if (finite(b.inoculatedAt)) return `Inoculated ${dateText(b.inoculatedAt, today)}`;
  if (finite(b.sterilisedAt)) return `Sterilised ${dateText(b.sterilisedAt, today)}`;
  return `Mixed ${dateText(b.mixedAt ?? b.receivedAt, today)}`;
}

// Put into a room is offered (spec 5): a waiting batch; a made one still making once inoculated, unless it incubates in an
// area (then once ready to fruit, when it waits).
export const placeable = (b) => b.status === 'waiting' || (b.status === 'making' && finite(b.inoculatedAt) && b.incubation !== 'area');

// "Sawdust · 287 kg · from Sawdust (Kilang Jaya)": a material line, with its Inventory item's name when it has one.
export const materialLine = (m) => [m.item === 'other' ? m.name ?? MATERIAL_NAMES.other : MATERIAL_NAMES[m.item] ?? m.item, qtyText(m.qty, m.unit),
  m.itemName ? `from ${m.itemName}` : null].filter(Boolean).join(DOT);
// "4 Nov 08:12 · Atmospheric steam · 400 bags · 98 °C for 6 h · Ali": a sterilising load (hot_at: it reached the temperature).
export const loadLine = (l, today) => [`${dateText(l.hotAt, today)} ${farmTime(l.hotAt)}`, METHOD_NAMES[l.method] ?? l.method, bagsText(l.bags),
  `${grouped(l.tempC, 0, 1)}${NB}°C for ${grouped(l.holdH, 0, 1)}${NB}h`, l.worker].filter(Boolean).join(DOT);
// The amber note when the loads hold fewer bags than were made: "300 of 400 bags sterilised"; null with no load or all done.
export function sterilisedNote(b) {
  const done = (b.loads ?? []).reduce((s, l) => s + l.bags, 0);
  const total = madeBlocks(b);
  return done > 0 && done < total ? `${grouped(done, 0)} of ${grouped(total, 0)} bags sterilised` : null;
}
// How a made block's price comes about (decision 6 of part 2), or why there is none.
export const madePriceNote = (b) => (finite(b.pricePerBlock)
  ? "The price per block is the materials at Inventory's latest purchase prices when the batch was last saved: a later purchase counts at its next change."
  : 'No price per block yet: every material needs an Inventory item with a purchase price.');

function incubationLines(b, today) {
  if (b.incubation === 'room') return [finite(b.placedAt) && b.roomName ? `In a grow room${DOT}${b.roomName}` : 'In a grow room: put the blocks into a room'];
  if (b.incubation !== 'area') return [];
  const since = `In an area since ${dateText(b.incubatedFrom, today)}`;
  return [finite(b.incubatedTo) ? `${since}${DOT}ready to fruit ${dateText(b.incubatedTo, today)}` : `${since}${DOT}day ${daysFrom(farmDate(b.incubatedFrom), today) + 1}`];
}

// The Making card's steps in order (spec 5), from a made batch's detail: [{ key, title, lines, done, can, why }]. Each step can
// be recorded or edited at any time (can), except the incubation before the inoculation, or while blocks are in a room (where
// they incubate is fixed then); why: the reason, for the button's title. The loads are the detail's, listed by the card.
export function makingSteps(b, today) {
  const inoculated = finite(b.inoculatedAt);
  const placed = (b.delivery ?? [b]).some((x) => finite(x.placedAt));
  const spawn = (b.materials ?? []).find((m) => m.item === 'spawn');
  const mixed = [`Mixed ${dateText(b.mixedAt ?? b.receivedAt, today)}`, b.recipe ? `recipe ${b.recipe.name}` : 'no recipe', bagsText(madeBlocks(b))].join(DOT);
  const inoculation = [`Inoculated ${dateText(b.inoculatedAt, today)}`, b.supplier, b.strain, b.spawnBatch ? `batch ${b.spawnBatch}` : null,
    spawn ? `${qtyText(spawn.qty, spawn.unit)} spawn` : null].filter(Boolean).join(DOT);
  return [
    { key: 'mix', title: 'Mix', done: true, can: true, why: null, lines: [mixed, ...(b.materials ?? []).filter((m) => m.item !== 'spawn').map(materialLine)] },
    { key: 'sterilise', title: 'Sterilise', done: (b.loads ?? []).length > 0, can: true, why: null, lines: [] },
    { key: 'inoculate', title: 'Inoculate', done: inoculated, can: true, why: null, lines: inoculated ? [inoculation] : [] },
    {
      key: 'incubate', title: 'Incubate', done: b.incubation != null, can: inoculated && !placed,
      why: !inoculated ? 'Record the inoculation first' : placed ? 'Some blocks are in a room' : null, lines: incubationLines(b, today),
    },
  ];
}
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-batches-making.test.js tests/web-batches-math.test.js`
Expected: PASS (part 1's sheet and page tests too).

- [ ] **Step 5: Commit**

```bash
git add web/batches-math.js tests/web-batches-making.test.js
git commit -m "Batches part 2, 11: the web's making figures (the status line, Put into a room once it can go in, the Making card's steps, a load's line, the notes, the made facts, the making group, the 4-2 sheet's made rows)"
```

---

### Task 12: The making dialogs (`web/batches-making.js`)

The dialogs are DOM code over the shared `openForm`; their pure parts are tested in Tasks 10–11, and the dialogs themselves in Task 14's browser check.

**Files:**
- Create: `web/batches-making.js`
- Modify: `web/batches-dialogs.js`

- [ ] **Step 1: Create `web/batches-making.js` with the dialogs**

```js
// Making blocks on the Batches pages (spec 2026-11-05-batches-design.md 5 and 7): the Recipes dialog (the list, Add, Edit,
// Archive), Make blocks and Edit the mix, a sterilising load (Record, Edit, Delete), the inoculation, the incubation, Ready
// to fruit; and the Making card of a made batch's page. The dialogs use the tasks' dialog (openForm) through
// createBatchDialogs' tools, which wires them in: after a change, or a 404 or 409, the page reads again.

import { request } from './api.js';
import { CROP_KEYS, cropShortName } from './crops.js';
import { loadWorkers, workerField, errorText, setWorker } from './task-dialogs.js';
import { dateHint } from './harvest-math.js';
import { farmDate } from './tasks-math.js';
import { batchHash } from './route.js';
import {
  MIX_ITEMS, RECIPE_PARTS, MATERIAL_NAMES, METHOD_NAMES, numberOf, recipeLine, sumText, recipeValues, recipeBody, mixValues,
  recipeFill, mixBody, waterGuide, inoculateValues, inoculateBody, loadValues, loadBody, incubateValues, incubateBody, readyBody,
  countBlocks, bagsText, fullDate,
} from './batches-math.js';

const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const madeBlocks = (b) => (b.delivery ?? [b]).reduce((s, x) => s + x.blocks, 0);

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

// A button with the page's focus key (for the focus to come back to it after a change) and, when given, its spoken name.
function action(label, key, name, onClick, className = '') {
  const b = el('button', className, label);
  b.type = 'button';
  b.dataset.focusKey = key;
  if (name) b.setAttribute('aria-label', name);
  b.addEventListener('click', onClick);
  return b;
}

// tools: createBatchDialogs' { send(method, path, body) → { ok, data } or a problem, closing(r), ask(options) (openForm),
// remember() (the opener's focus key), alive(), onError(text), today() }. → the making dialogs.
export function createMakingDialogs({ send, closing, ask, remember, alive, onError, today }) {
  // GET path → its reply, or null after saying why (the page left, or the request failed).
  async function read(path) {
    try {
      const data = await request('GET', path);
      return alive() ? data : null;
    } catch (err) {
      if (alive()) onError(errorText(err));
      return null;
    }
  }

  // ---- recipes ----

  function recipes() {
    remember();
    showRecipes();
  }

  // The list (after a change it opens again, without taking a new opener).
  async function showRecipes() {
    const data = await read('/api/batch-recipes');
    if (!data) return;
    const list = data.recipes ?? [];
    const box = el('div', 'bt-recipes');
    if (!list.length) box.append(el('p', 'none', 'No recipes yet.'));
    for (const r of list) {
      const row = el('div', 'bt-recipe');
      const words = el('div', 'bt-words');
      words.append(el('p', 'bt-recipe-name', r.name), el('p', 'bt-line', recipeLine(r)));
      row.append(words, action('Edit', `recipe-${r.id}`, `Edit ${r.name}`, () => recipe(r), 'bt-quiet'),
        action('Archive', `archive-${r.id}`, `Archive ${r.name}`, () => archive(r), 'bt-quiet'));
      box.append(row);
    }
    ask({
      title: 'Recipes',
      lead: ['The mixes the farm makes blocks from. An archived recipe stays with the batches made from it, and is not offered for a new mix.', box],
      closeLabel: 'Close',
      buttons: [{ value: 'add', label: 'Add a recipe', primary: true }],
      submit: async () => {
        recipe(null);
        return true;
      },
    });
  }

  // Add (r null) or edit a recipe; the parts' sum under them as they are typed.
  function recipe(r) {
    const v = recipeValues(r);
    const part = (name, label) => ({ name, label, kind: 'number', value: v[name], suffix: '%' });
    const form = ask({
      title: r ? `Edit ${r.name}` : 'Add a recipe',
      lead: r ? ['A change counts from the next mix: the batches made already keep their amounts.'] : [],
      fields: [
        { name: 'name', label: 'Name', kind: 'text', value: v.name, maxLength: 80 },
        { name: 'crop', label: 'Crop', kind: 'select', value: v.crop, options: [['', 'Any crop'], ...CROP_KEYS.map((k) => [k, cropShortName(k)])] },
        {
          kind: 'group', legend: 'Parts of the dry weight', className: 'bt-group bt-parts', fields: [
            part('sawdustPct', 'Sawdust'), part('branPct', 'Bran'), part('limePct', 'Lime'), part('gypsumPct', 'Gypsum'), part('otherPct', 'Other'),
            { name: 'otherName', label: 'Other: what', kind: 'text', value: v.otherName, maxLength: 80 },
          ],
        },
        {
          kind: 'group', legend: 'A bag', className: 'bt-group', fields: [
            { name: 'waterPct', label: 'Water', kind: 'number', value: v.waterPct, suffix: '%' },
            { name: 'bagKg', label: 'Wet weight', kind: 'number', value: v.bagKg, suffix: 'kg' },
          ],
        },
      ],
      buttons: [{ value: 'save', label: r ? 'Save' : 'Add', primary: true }],
      submit: async (values) => {
        const out = recipeBody(values);
        if (!out.body) return out;
        const sent = await send(r ? 'PUT' : 'POST', r ? `/api/batch-recipes/${r.id}` : '/api/batch-recipes', out.body);
        if (!sent.ok) return sent;
        showRecipes();
        return true;
      },
    });
    const sum = el('p', 'c-hint bt-sum');
    sum.setAttribute('aria-live', 'polite');
    form.input('otherName').closest('.tk-group').append(sum);
    const say = () => { sum.textContent = sumText(Object.fromEntries(RECIPE_PARTS.map((k) => [k, form.input(k).value]))); };
    for (const k of RECIPE_PARTS) form.input(k).addEventListener('input', say);
    say();
  }

  function archive(r) {
    ask({
      title: `Archive ${r.name}?`,
      lead: ['It stays with the batches made from it, and is no longer offered for a new mix.'],
      buttons: [{ value: 'archive', label: 'Archive', primary: true }],
      submit: async () => {
        const sent = await send('PUT', `/api/batch-recipes/${r.id}`, { archived: true });
        if (!sent.ok) return sent;
        showRecipes();
        return true;
      },
    });
  }

  // ---- the mix ----

  // The Mix dialog's boxes: the mix, its materials (each with its Inventory item when Inventory has items), the weight, a note.
  function mixFields(v, list, items, can) {
    const itemOptions = [['', 'No Inventory item'], ...items.map((s) => [String(s.id), `${s.name} (${s.unit})`])];
    const material = (item) => ({
      kind: 'group', className: 'bt-material', fields: [
        { name: `qty-${item}`, label: MATERIAL_NAMES[item], kind: 'number', value: v[`qty-${item}`], suffix: item === 'bags' ? 'pcs' : 'kg' },
        ...(item === 'other' ? [{ name: 'otherName', label: 'Other: what', kind: 'text', value: v.otherName, maxLength: 80 }] : []),
        ...(items.length ? [{ name: `item-${item}`, label: `${MATERIAL_NAMES[item]}: Inventory item`, kind: 'select', value: v[`item-${item}`], options: itemOptions }] : []),
      ],
    });
    return [
      {
        kind: 'group', legend: 'The mix', className: 'bt-group', fields: [
          { name: 'mixedDate', label: 'Mixed', kind: 'date', value: v.mixedDate, max: today(), hintOf: dateHint },
          { name: 'recipeId', label: 'Recipe', kind: 'select', value: v.recipeId, options: [['', 'No recipe'], ...list.map((r) => [String(r.id), r.archived ? `${r.name} (archived)` : r.name])] },
          ...(!can || can.cropEditable ? [{ name: 'crop', label: 'Crop', kind: 'select', value: v.crop, options: [['', 'Pick a crop'], ...CROP_KEYS.map((k) => [k, cropShortName(k)])] }] : []),
          ...(!can || can.blocksEditable ? [{ name: 'blocks', label: 'Bags', kind: 'number', value: v.blocks, inputMode: 'numeric', suffix: 'bags', hint: 'One bag makes one block.' }] : []),
        ],
      },
      {
        kind: 'group', legend: 'Materials', className: 'bt-group',
        hint: `Worked out from the recipe: change them to what was used. An empty box is left out.${items.length ? ' Each Inventory item, with its purchase price, gives the price per block.' : ''}`,
        fields: MIX_ITEMS.map(material),
      },
      {
        kind: 'group', legend: 'Weight', className: 'bt-group', hint: "A bag's wet weight and water, from the recipe. With them the Harvest tab's BE uses this batch's dry substrate.", fields: [
          { name: 'blockKg', label: 'Bag weight', kind: 'number', value: v.blockKg, suffix: 'kg' },
          { name: 'waterPct', label: 'Water', kind: 'number', value: v.waterPct, suffix: '%' },
        ],
      },
      { name: 'note', label: 'Note', kind: 'area', value: v.note },
    ];
  }

  // A recipe picked fills the crop, the weight, the water and the amounts; bags typed work the amounts out again; the water
  // guide follows. fixedBags: the bags when their box is not shown (an edit of a split batch).
  function wireMix(form, list, water, fixedBags) {
    const box = (name) => form.input(name);
    const recipeNow = () => list.find((r) => String(r.id) === box('recipeId').value) ?? null;
    const bags = () => (box('blocks') ? numberOf(box('blocks').value) : fixedBags);
    const say = () => {
      const r = recipeNow();
      const n = bags();
      water.textContent = r && Number.isInteger(n) && n > 0 ? waterGuide(r, n) : '';
      water.hidden = !water.textContent;
    };
    const fill = () => {
      const r = recipeNow();
      if (r) {
        for (const [name, value] of Object.entries(recipeFill(r, bags()))) if (box(name)) box(name).value = value;
        if (r.crop && box('crop')) box('crop').value = r.crop;
      }
      say();
    };
    box('recipeId').addEventListener('change', fill);
    box('blocks')?.addEventListener('input', fill);
    say();
  }

  // Make blocks (b null; on to the new batch's page after) or edit a made batch's mix (b: its detail).
  async function mix(b = null) {
    remember();
    const [recipeData, itemData] = await Promise.all([read('/api/batch-recipes'), read('/api/batches/stock-items')]);
    if (!recipeData || !itemData) return;
    const list = recipeData.recipes ?? [];
    if (b?.recipe && !list.some((r) => r.id === b.recipe.id)) list.push(b.recipe); // an archived recipe stays its batch's
    const can = b ? { cropEditable: b.delivery.every((x) => x.placedAt === null), blocksEditable: b.parentId === null && b.delivery.length === 1 && b.placedAt === null } : null;
    const water = el('p', 'tk-lead bt-water');
    water.setAttribute('aria-live', 'polite');
    const form = ask({
      title: b ? 'Edit the mix' : 'Make blocks',
      lead: [b ? 'A recipe picked again fills the amounts afresh.' : "The day the substrate is mixed and bagged. Sterilise, inoculate and incubate on the batch's page.", water],
      fields: mixFields(mixValues(b, today()), list, itemData.items ?? [], can),
      buttons: [{ value: 'save', label: b ? 'Save' : 'Make blocks', primary: true }],
      submit: async (values) => {
        const out = mixBody(values, { edit: can });
        if (!out.body) return out;
        if (b) return closing(await send('PUT', `/api/batches/${b.id}`, out.body));
        const sent = await send('POST', '/api/batches', { kind: 'made', ...out.body });
        if (sent.ok && Number.isInteger(sent.data?.id)) location.hash = batchHash(sent.data.id); // on to its steps
        return closing(sent);
      },
    });
    wireMix(form, list, water, b ? madeBlocks(b) : null);
  }

  // ---- the steps ----

  // Record a sterilising load on b (load null) or edit it.
  async function sterilise(b, load = null) {
    remember();
    let names;
    try {
      names = await loadWorkers();
    } catch (err) {
      if (alive()) onError(errorText(err));
      return;
    }
    if (!alive()) return;
    const v = loadValues(load, b, Date.now());
    const who = workerField(names, 'Who');
    if (load) who.value = names.includes(load.worker) ? load.worker : '';
    const lead = [`${countBlocks(madeBlocks(b), b.crop)} mixed ${fullDate(b.mixedAt ?? b.receivedAt)}.`];
    if (!names.length) {
      const p = el('p', 'tk-lead');
      const a = el('a', '', 'Settings');
      a.href = '#/settings';
      p.append("No names yet: add the workers' names in ", a, ' first.');
      lead.push(p);
    }
    ask({
      title: load ? 'Edit the load' : 'Record a sterilising load',
      lead,
      fields: [
        { name: 'method', label: 'Method', kind: 'select', value: v.method, options: Object.entries(METHOD_NAMES) },
        { name: 'bags', label: 'Bags', kind: 'number', value: v.bags, inputMode: 'numeric', suffix: 'bags', hint: `Up to ${bagsText(madeBlocks(b))}` },
        {
          kind: 'group', className: 'tk-when', fields: [
            { name: 'hotDate', label: 'Reached the temperature', kind: 'date', value: v.hotDate, min: farmDate(b.mixedAt ?? b.receivedAt), max: today(), hintOf: dateHint },
            { name: 'hotTime', label: 'At', kind: 'text', value: v.hotTime, placeholder: '08:12', inputMode: 'decimal', maxLength: 5, hint: '24 h, like 08:12' },
          ],
        },
        { name: 'tempC', label: 'Temperature reached', kind: 'number', value: v.tempC, suffix: '°C' },
        { name: 'holdH', label: 'Held for', kind: 'number', value: v.holdH, suffix: 'h' },
        who,
      ],
      buttons: [
        ...(load ? [{ label: 'Delete this load', action: () => removeLoad(load) }] : []),
        { value: 'save', label: load ? 'Save' : 'Record', primary: true },
      ],
      submit: async (values) => {
        const out = loadBody(values, { edit: Boolean(load) });
        if (!out.body) return out;
        if (out.body.worker) setWorker(out.body.worker); // the next dialog picks the same name
        return closing(await (load ? send('PUT', `/api/batch-loads/${load.id}`, out.body) : send('POST', `/api/batches/${b.id}/loads`, out.body)));
      },
    });
  }

  function removeLoad(load) {
    ask({
      title: `Delete the load of ${fullDate(load.hotAt)}?`,
      lead: [`${bagsText(load.bags)}, ${METHOD_NAMES[load.method] ?? load.method}.`],
      buttons: [{ value: 'delete', label: 'Delete', danger: true }],
      submit: async () => closing(await send('DELETE', `/api/batch-loads/${load.id}`)),
    });
  }

  // Record or edit the inoculation: its day, the spawn's supplier, strain and batch No., the spawn used (with its item).
  async function inoculate(b) {
    remember();
    const itemData = await read('/api/batches/stock-items');
    if (!itemData) return;
    const items = itemData.items ?? [];
    const v = inoculateValues(b, today());
    ask({
      title: finite(b.inoculatedAt) ? 'Edit the inoculation' : 'Record the inoculation',
      lead: [`${countBlocks(madeBlocks(b), b.crop)} mixed ${fullDate(b.mixedAt ?? b.receivedAt)}.`],
      fields: [
        { name: 'inoculatedDate', label: 'Inoculated', kind: 'date', value: v.inoculatedDate, min: farmDate(b.mixedAt ?? b.receivedAt), max: today(), hintOf: dateHint },
        {
          kind: 'group', legend: 'Spawn', className: 'bt-group', fields: [
            { name: 'supplier', label: 'Spawn supplier', kind: 'text', value: v.supplier, maxLength: 80 },
            { name: 'strain', label: 'Strain', kind: 'text', value: v.strain, maxLength: 80 },
            { name: 'spawnBatch', label: 'Spawn batch No.', kind: 'text', value: v.spawnBatch, maxLength: 80 },
          ],
        },
        {
          kind: 'group', legend: 'Spawn used', className: 'bt-group bt-material', hint: 'Leave the amount empty if it was not weighed or counted.', fields: [
            { name: 'spawnQty', label: 'Amount', kind: 'number', value: v.spawnQty },
            { name: 'spawnUnit', label: 'Counted in', kind: 'select', value: v.spawnUnit, options: [['kg', 'kg'], ['bags', 'bags']] },
            ...(items.length ? [{ name: 'spawnItem', label: 'Inventory item', kind: 'select', value: v.spawnItem, options: [['', 'No Inventory item'], ...items.map((s) => [String(s.id), `${s.name} (${s.unit})`])] }] : []),
          ],
        },
      ],
      buttons: [{ value: 'save', label: finite(b.inoculatedAt) ? 'Save' : 'Record', primary: true }],
      submit: async (values) => {
        const out = inoculateBody(values);
        return out.body ? closing(await send('PUT', `/api/batches/${b.id}`, out.body)) : out;
      },
    });
  }

  // Where the blocks incubate: in a grow room (then Put into a room) or in an area (from a day; ready to fruit on a day).
  function incubate(b) {
    remember();
    const v = incubateValues(b);
    const from = farmDate(b.inoculatedAt);
    ask({
      title: 'Incubation',
      lead: ['In a grow room: put the blocks into a room whose run is in its Spawn stage. In an area: they stay on racks until they are ready to fruit, then go into a room.'],
      fields: [
        { name: 'incubation', label: 'Where', kind: 'select', value: v.incubation, options: [['', 'Not yet'], ['room', 'In a grow room'], ['area', 'In an area']] },
        {
          kind: 'group', legend: 'In an area', className: 'bt-group', hint: 'Leave Ready to fruit empty until they are.', fields: [
            { name: 'fromDate', label: 'From', kind: 'date', value: v.fromDate, min: from, max: today(), hintOf: dateHint },
            { name: 'toDate', label: 'Ready to fruit', kind: 'date', value: v.toDate, min: from, max: today(), hintOf: dateHint },
          ],
        },
      ],
      buttons: [{ value: 'save', label: 'Save', primary: true }],
      submit: async (values) => {
        const out = incubateBody(values);
        return out.body ? closing(await send('PUT', `/api/batches/${b.id}`, out.body)) : out;
      },
    });
  }

  // An area's blocks ready to fruit: the day (today by default); then they wait to go into a room.
  function ready(b) {
    remember();
    ask({
      title: 'Ready to fruit',
      lead: [`${countBlocks(b.good, b.crop)} in the area since ${fullDate(b.incubatedFrom)}. Then put them into a room.`],
      fields: [{ name: 'readyDate', label: 'Ready on', kind: 'date', value: today(), min: farmDate(b.incubatedFrom), max: today(), hintOf: dateHint }],
      buttons: [{ value: 'save', label: 'Ready to fruit', primary: true }],
      submit: async (values) => {
        const out = readyBody(values);
        return out.body ? closing(await send('PUT', `/api/batches/${b.id}`, out.body)) : out;
      },
    });
  }

  return { recipes, mix, sterilise, inoculate, incubate, ready };
}
```

Notes for the implementer: `openForm` fields are fixed at opening, so the live parts (the recipe sum, a recipe filling the Mix, the water guide) listen on `form.input(name)` after `ask(…)` returns, as `task-dialogs.js` does for the worker list. A submit that opens the next dialog (Add a recipe from the list, the list again after a save) does so before returning `true`: `openForm`'s `run` then finds the opening replaced and leaves the new one open.

- [ ] **Step 2: Wire them into `createBatchDialogs`**

In `web/batches-dialogs.js`:

The head comment's second and third lines become:

```js
// Record or Edit a contamination check (with its Delete); the making ones (web/batches-making.js) come with them. They use the
// tasks' dialog (openForm) and worker picker; after a change, or a 404 or 409 (gone, or changed meanwhile), the page reads again.
```

After `import { batchHash } from './route.js';` add `import { createMakingDialogs } from './batches-making.js';`.

Replace the `BOXES` line with:

```js
const BOXES = {
  receivedAt: 'receivedDate', inoculatedAt: 'inoculatedDate', at: 'checkDate', mixedAt: 'mixedDate', hotAt: 'hotDate', incubatedFrom: 'fromDate',
  incubatedTo: 'toDate', spawn: 'spawnQty',
};
```

(A server field with no box in the open dialog, as `materials`, shows as the dialog's own error line.)

In `remove(b, onGone)`, replace:

```js
    ask({
      title: `Delete ${countBlocks(b.blocks, b.crop)}${b.supplier ? ` from ${b.supplier}` : ''}?`,
      lead: [`Received ${fullDate(b.receivedAt)}. Its contamination checks go with it.`],
```

with:

```js
    const made = b.kind === 'made';
    ask({
      title: `Delete ${countBlocks(b.blocks, b.crop)}${made ? ` made ${fullDate(b.mixedAt ?? b.receivedAt)}` : b.supplier ? ` from ${b.supplier}` : ''}?`,
      lead: [made ? 'Its materials, sterilising loads and contamination checks go with it.' : `Received ${fullDate(b.receivedAt)}. Its contamination checks go with it.`],
```

Replace the last line `return { receive, edit, place, takeOut, remove, check, openerKey: () => opener };` with:

```js
  const making = createMakingDialogs({ send, closing, ask, remember, alive, onError, today });
  return { receive, edit, place, takeOut, remove, check, ...making, openerKey: () => opener };
```

- [ ] **Step 3: Check the modules load**

Run: `node --check web/batches-making.js && node --check web/batches-dialogs.js && npm test 2>&1 | tail -6`
Expected: no syntax error; the whole suite passes.

- [ ] **Step 4: Commit**

```bash
git add web/batches-making.js web/batches-dialogs.js
git commit -m "Batches part 2, 12: the making dialogs (Recipes, a recipe, Archive, Make blocks and Edit the mix, a sterilising load, the inoculation, the incubation, Ready to fruit)"
```

---

### Task 13: The pages: Make blocks, Recipes, the making rows, the Making card, the styles

**Files:**
- Modify: `web/batches-making.js`, `web/batches-page.js`, `web/styles.css`

- [ ] **Step 1: The Making card**

In `web/batches-making.js`, change the import's last line `  countBlocks, bagsText, fullDate,` to:

```js
  makingSteps, loadLine, sterilisedNote, madePriceNote, countBlocks, bagsText, fullDate,
```

and append at the end of the file:

```js

// The Making card of a made batch's page (spec 5): the steps in order, each with what was recorded and its button; the loads
// with their Edit and the amber note while fewer bags were sterilised than made; how the price per block comes about.
// b: the detail; dialogs: createBatchDialogs' (the making ones are in it); today: the farm's date. → the card's nodes.
export function makingNodes(b, dialogs, today) {
  const nodes = makingSteps(b, today).map((s) => {
    const step = el('div', 'bt-step');
    const head = el('div', 'bt-step-head');
    const tools = el('div', 'bt-step-tools');
    head.append(el('h3', 'bt-step-title', s.title), tools);
    step.append(head, ...s.lines.map((text) => el('p', 'bt-line', text)));
    if (s.key === 'mix') tools.append(action('Edit', 'mix', 'Edit the mix', () => dialogs.mix(b)));
    if (s.key === 'sterilise') {
      for (const l of b.loads ?? []) {
        const row = el('div', 'bt-load');
        row.append(el('p', 'bt-line', loadLine(l, today)), action('Edit', `load-${l.id}`, `Edit the load of ${fullDate(l.hotAt)}`, () => dialogs.sterilise(b, l), 'bt-quiet'));
        step.append(row);
      }
      const note = sterilisedNote(b);
      if (note) step.append(el('p', 'bt-over', note));
      tools.append(action('Record a load', 'load', null, () => dialogs.sterilise(b)));
    }
    if (s.key === 'inoculate') {
      tools.append(action(s.done ? 'Edit' : 'Record', 'inoculate', s.done ? 'Edit the inoculation' : 'Record the inoculation', () => dialogs.inoculate(b)));
    }
    if (s.key === 'incubate') {
      if (b.incubation === 'area' && !finite(b.incubatedTo) && s.can) tools.append(action('Ready to fruit', 'ready', null, () => dialogs.ready(b)));
      const go = action(s.done ? 'Edit' : 'Record', 'incubate', s.done ? 'Edit the incubation' : 'Record the incubation', () => dialogs.incubate(b));
      go.disabled = !s.can;
      if (s.why) go.title = s.why;
      tools.append(go);
    }
    if (!s.lines.length && !(s.key === 'sterilise' && (b.loads ?? []).length)) step.append(el('p', 'none', s.why && !s.can ? `Not yet. ${s.why}.` : 'Not yet.'));
    return step;
  });
  nodes.push(el('p', 'muted bt-making-note', madePriceNote(b)));
  return nodes;
}
```

- [ ] **Step 2: The Batches page**

In `web/batches-page.js`:

After `import { createBatchDialogs } from './batches-dialogs.js';` add `import { makingNodes } from './batches-making.js';`. Add `statusText, placeable` to the `batches-math.js` import.

In `LIST`, after `<button type="button" class="primary" data-receive>Receive blocks</button>` add:

```html
      <button type="button" data-make>Make blocks</button>
      <button type="button" data-recipes data-focus-key="recipes">Recipes</button>
```

After `q('[data-receive]').addEventListener('click', () => dialogs.receive());` add:

```js
  q('[data-make]').addEventListener('click', () => dialogs.mix());
  q('[data-recipes]').addEventListener('click', () => dialogs.recipes());
```

(Make blocks goes on to the new batch's page, so it needs no focus key.)

In `paint()`, replace the Waiting card's block (from `els.waiting.replaceChildren(...(g.waiting.length ? g.waiting.map((b) => {` to its `}) : [el('p', 'none', 'No blocks waiting.')]));`) with:

```js
    const waiting = [...g.making, ...g.waiting]; // the made batches still making above the ones that wait (spec 7)
    els.waiting.replaceChildren(...(waiting.length ? waiting.map((b) => {
      let put = null;
      if (placeable(b)) {
        put = button('Put into a room');
        put.dataset.focusKey = `put-${b.id}`;
        put.setAttribute('aria-label', `Put ${countBlocks(b.good, b.crop)} into a room`);
        put.disabled = b.good < 1;
        if (put.disabled) put.title = 'Every block was lost';
        put.addEventListener('click', () => dialogs.place(b));
      }
      return batchRow(b, b.kind === 'made' ? statusText(b, today) : waitingLine(b, now), put);
    }) : [el('p', 'none', 'No blocks waiting.')]));
```

- [ ] **Step 3: A batch's page**

In `ONE`, after the Details `<section …>` line add:

```html
    <section class="card bt-card" aria-labelledby="bt-making-title" data-making-card hidden><h2 id="bt-making-title">Making</h2><div data-making></div></section>
```

In `mountBatch`'s `els`, add `makingCard: q('[data-making-card]'), making: q('[data-making]'),`.

In its `paint(b)`, replace:

```js
    els.title.textContent = cropBlocks(b.crop);
    els.sub.textContent = [`Received ${fullDate(b.receivedAt)}`, b.supplier, statusLine(b)].filter(Boolean).join(DOT);

    const actions = [];
    if (b.status === 'waiting') {
```

with:

```js
    const made = b.kind === 'made';
    els.title.textContent = made ? `${cropBlocks(b.crop)}${DOT}made` : cropBlocks(b.crop);
    els.sub.textContent = made ? statusText(b, today) : [`Received ${fullDate(b.receivedAt)}`, b.supplier, statusLine(b)].filter(Boolean).join(DOT);

    const actions = [];
    if (placeable(b)) {
```

replace `edit.addEventListener('click', () => dialogs.edit(b));` with `edit.addEventListener('click', () => (made ? dialogs.mix(b) : dialogs.edit(b)));` (P13), and before `els.deliveryCard.hidden = b.delivery.length < 2;` add:

```js
    els.makingCard.hidden = !made;
    els.making.replaceChildren(...(made ? makingNodes(b, dialogs, today) : []));

```

- [ ] **Step 4: The styles**

In `web/styles.css`, inside the Batches block, right before `/* ---- end Batches ---- */`, add:

```css
.bt-step { padding: 12px 0; border-top: 1px solid var(--border); }
.bt-step:first-child { border-top: 0; padding-top: 0; }
.bt-step-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
.bt-step-title { margin: 0; font-size: var(--fs-md); font-weight: 600; }
.bt-step-tools { display: flex; flex-wrap: wrap; gap: 8px; }
.bt-step > .bt-line, .bt-step > .none { margin: 4px 0 0; }
.bt-load { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding: 4px 0; }
.bt-load .bt-line { margin: 0; color: var(--ink); }
.bt-making-note { margin: 12px 0 0; font-size: var(--fs-sm); }
.bt-recipes { margin: 8px 0 0; }
.bt-recipe { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 4px 8px; padding: 8px 0; border-top: 1px solid var(--border); }
.bt-recipe:first-child { border-top: 0; }
.bt-recipe-name { margin: 0; font-weight: 600; }
.bt-recipe .bt-line { margin: 2px 0 0; }
.bt-sum, .bt-water { font-variant-numeric: tabular-nums; }
.tk-dialog .bt-material { margin-bottom: 0; }
@media (min-width: 360px) {
  .tk-dialog .bt-material .tk-group-fields, .tk-dialog .bt-parts .tk-group-fields { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 600px) {
  .bt-recipe { grid-template-columns: minmax(0, 1fr) auto; }
  .bt-recipe .bt-words { grid-column: 1 / -1; }
  .bt-step-tools > button, .bt-recipe > button { min-height: 44px; }
}
```

- [ ] **Step 5: Check and commit**

Run: `node --check web/batches-making.js && node --check web/batches-page.js && npm test 2>&1 | tail -6`
Expected: no syntax error; the whole suite passes.

```bash
git add web/batches-making.js web/batches-page.js web/styles.css
git commit -m "Batches part 2, 13: Make blocks and Recipes on the Batches page, the making rows above the waiting ones, a made batch's page and its Making card; the .bt- styles for them"
```

---

### Task 14: Docs, the whole suite, a look in the browser

**Files:**
- Modify: `docs/specs/2026-11-05-batches-design.md`, `DESIGN.md`, `README.md`, `PRODUCT.md`

- [ ] **Step 1: The spec's settled lines**

In the spec:

1. Section 6, the CSV row: replace `` `received,crop,kind,supplier,strain,spawn batch,delivery note,blocks,lost,price per block,room,run started,placed,block kg,water %,note` `` with `` `received,crop,kind,supplier,strain,spawn batch,delivery note,blocks,lost,price per block,room,run started,placed,block kg,water %,note,mixed,recipe` ``.
2. Section 6, the `Part 2` row: replace its reply cell with: `` `GET /api/batch-recipes` (`?all=1` with the archived), `POST /api/batch-recipes`, `PUT /api/batch-recipes/:id` (fields, or `{ archived: true }`; no delete); `POST /api/batches` with `kind: 'made'` and the Mix's fields (`mixedAt`, `recipeId`, `crop`, `blocks`, `blockKg`, `waterPct`, `note`, `materials`); `PUT /api/batches/:id` on a made batch takes the steps' fields (`materials` the mix's lines whole, `inoculatedAt`, `supplier`, `strain`, `spawnBatch`, `spawn` one line or null, `incubation`, `incubatedFrom`, `incubatedTo`; `pricePerBlock` is a 400); loads `POST /api/batches/:id/loads`, `PUT/DELETE /api/batch-loads/:id`; `GET /api/batches/stock-items` → `{ items: [{ id, name, kind, unit, unitCost }] }` (Inventory's items but its blocks ones, the latest purchase price; empty without Inventory). A row also carries `mixedAt, recipeId, incubation, incubatedFrom, incubatedTo, sterilisedAt` and `spawn` (`{ qty, unit, unitCost }` or null); the detail's `materials` carry `itemName` and `unitCost` ``.
3. After section 5's Recipes table, add:

```markdown
### 5.1 Settled in the build (part 2, 2026-11-05)

| Point | Rule |
|---|---|
| Decisions | The lead's twelve decisions for part 2 (`/tmp/batches/part2-decisions.md`, owner: "proceed without me in loop") |
| Loads' ids | `batch_loads.id` is AUTOINCREMENT (ids never reused, as the other routed ids), in the version-21 step |
| Status | `making` until ready: an area's blocks marked ready to fruit, or put into a room. "Incubating since 4 Nov · day 12" counts the first day as day 1; a ready batch that waits says "Ready to fruit" |
| Put into a room | Offered once inoculated (unless it incubates in an area: then once ready). With no incubation recorded it sets `incubation 'room'` on the whole delivery |
| Incubation | Fixed while some blocks are in a room (409). Clearing the inoculation needs the incubation cleared first. A grow room's run stage is not checked (the dialog names the Spawn stage) |
| Materials | Ingredients in kg, the plastic bags ("Plastic bags") in pcs, the spawn in kg or bags; one line per item; an Inventory item kept only with Inventory; the item's unit shown in the picker, not converted |
| Made price | Over RM 1,000 a block is refused (400 on `materials`): a slip in the amounts. Worked out again on every write to the batch, loads and checks too |
| The 4-2 sheet | The made use row: Qty used the spawn amount, Block / area "made into 400 blocks". Nothing before the inoculation |
| Files | The making checks in `server/batches-making.js`, the shared field rules in `server/batches-fields.js`; the making dialogs and the Making card in `web/batches-making.js` |
```

- [ ] **Step 2: DESIGN.md**

In the `### Batches` section's table, replace the Page row with:

```markdown
| Page | Head: Receive blocks (primary), Make blocks, Recipes, Export CSV, myGAP 4-2 sheet. Waiting (made batches still making above the waiting ones, their status line as the row's words; Put into a room once they can go in), In rooms (a group per room's current run, the room a link to its Harvest tab) and Past (a range control 90 days · 12 months · All; on a phone each batch a block of labelled figures) |
```

and add after the Batch page row:

```markdown
| Made batch | Title "Grey oyster blocks · made", the status line under it ("Mixed 3 Nov", "Sterilised 3 Nov", "Inoculated 4 Nov", "Incubating since 4 Nov · day 12", "Ready to fruit"); Edit opens Edit the mix |
| Making card | The steps in order (Mix, Sterilise, Inoculate, Incubate), each an h3 with its buttons at the right and what was recorded under it in `ink-2` ("Not yet." when nothing); the loads a row each with a quiet Edit; "300 of 400 bags sterilised" in amber on `--warning-soft`; a muted line on how the price per block comes about |
| Recipes | A dialog listing the recipes in use (name, then "Grey oyster · Sawdust 78 % · … · 2.30 kg a bag"), a quiet Edit and Archive each, Add a recipe (primary); the recipe dialog shows the parts' live sum under them |
| Make blocks | Groups The mix, Materials (a box per material, its Inventory item beside it when Inventory has items; two columns from 360 px), Weight, Note; a recipe fills the crop, the amounts and the weight; the water guide in the lead follows the bags |
```

- [ ] **Step 3: README.md and PRODUCT.md**

README: replace the `**Batches.**` paragraph with:

```markdown
**Batches.** (`#/business/batches`, by address until the Business top-bar entry is added): bought blocks received (supplier, spawn batch, strain, delivery note, blocks, price, weight), or blocks made on the farm (Make blocks: a saved recipe works out the day's amounts; then sterilising loads, the inoculation with its spawn, the incubation in a grow room or an area, Ready to fruit), put into a room's run (split across rooms) and taken out, contamination checks with a cause, the myGAP 4-2 sheet and a CSV. A made block's price is its materials at Inventory's purchase prices; a batch's weight feeds Harvest's BE. Spec `docs/specs/2026-11-05-batches-design.md`.
```

PRODUCT.md, the Batches row:

```markdown
| Batches | Bought blocks: supplier, spawn batch, strain, delivery note, blocks, price, weight. Blocks made on the farm: saved recipes, the mix and its materials, sterilising loads, the inoculation, the incubation; the price per block from the materials. Put into a room's run, split across rooms; contamination checks; Inventory stock moves; the myGAP 4-2 sheet and a CSV |
```

- [ ] **Step 4: The whole suite**

Run: `npm test 2>&1 | tail -8`
Expected: every test passes (part 2 adds about 100 to the count before Task 1).

- [ ] **Step 5: A look in the browser**

Make a throwaway database with Inventory's two tables and three priced items, then start the app on a free port:

```bash
mkdir -p /tmp/batches && rm -f /tmp/batches/look2.db*
node -e "
const { DatabaseSync } = require('node:sqlite');
const db = new DatabaseSync('/tmp/batches/look2.db');
db.exec(\`CREATE TABLE stock_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, unit TEXT NOT NULL, reorder_at REAL) STRICT;
CREATE TABLE stock_moves (id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL, at INTEGER NOT NULL, qty REAL NOT NULL, unit_cost REAL, ref_kind TEXT NOT NULL, ref_id INTEGER, note TEXT) STRICT;
INSERT INTO stock_items (name, kind, unit) VALUES ('Sawdust', 'other', 'kg'), ('Rice bran', 'other', 'kg'), ('Grey oyster spawn', 'spawn', 'kg');
INSERT INTO stock_moves (item_id, at, qty, unit_cost, ref_kind) VALUES (1, 1000, 1000, 0.35, 'purchase'), (2, 1000, 100, 1.2, 'purchase'), (3, 1000, 50, 8, 'purchase');\`);
db.close();"
ss -ltn | grep 1890   # pick a free port, e.g. 18902
FARM_DB=/tmp/batches/look2.db FARM_PORT=18902 node --disable-warning=ExperimentalWarning server/main.js
```

In a browser (chrome-devtools MCP, an isolated context) at `http://localhost:18902/#/business/batches`, with a worker's name added in Settings and a room given Grey oyster blocks on its Crop tab:

| Check | Expected |
|---|---|
| Recipes → Add a recipe (78 / 20 / 1 / 1, water 60, 2.3 kg) | "Sum 100 %" under the parts as they are typed; the list shows its line after Add |
| Make blocks: the recipe, 400 bags, items for sawdust and bran | The crop, the amounts (287, 73.6, 3.7, 3.7, 400) and the weight filled; "Water: about 552 L for 400 bags…"; Make blocks goes to the new batch's page |
| The batch's page | "Grey oyster blocks · made", "Mixed 5 Nov"; the Making card's four steps; Incubate's Record disabled ("Record the inoculation first") |
| Record a load of 300 bags | The load's line; "300 of 400 bags sterilised" in amber |
| Record the inoculation with 12 kg of the spawn item | The status line "Inoculated …"; Put into a room in the head |
| Incubate in an area, then Ready to fruit | "Incubating since … · day 1", then "Ready to fruit"; Put into a room |
| Put into a room | The batch in the room's group, "made 5 Nov" in its line |
| The 4-2 sheet | The spawn receipt row (12 kg, RM 8.00, the supplier) and its "made into 400 blocks" use row |
| The Batches page | The made batch above the waiting ones while making, with its status line |

Do it at 1440 and 390 px, dark and light. Fix what is broken (re-run the suite after). Stop the server by its PID after.

- [ ] **Step 6: Commit**

```bash
git add docs/specs/2026-11-05-batches-design.md DESIGN.md README.md PRODUCT.md
git commit -m "Batches part 2, 14: the spec's settled lines (5.1), DESIGN, README and PRODUCT rows for making blocks"
```

(Fixes from the browser look: commit their files by name, with a message saying what each fixes.)

---

## After the plan (the contract's process, not tasks for the implementer)

| Step | Who |
|---|---|
| UI/UX audit: Impeccable critique and audit at 1440, 1024 and 390 px, both themes (the Batches page with making rows, a made batch, each making dialog, the sheet's made rows), and its fixes | Lead session |
| Final code review and the Impeccable finish review, and their fixes | Lead session |
| Stop at "ready to merge": branch, last commit, test count in `~/.claude/task-logs/batches/HANDOFF.md` | Lead session |

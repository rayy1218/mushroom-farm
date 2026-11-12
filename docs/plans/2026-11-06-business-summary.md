# Business Summary Implementation Plan


**Goal:** A **Summary** tab, first in the Business strip and where the top bar's Business always opens (`#/business`): this month's money as Costs gives it with last month's result, a "Needs you" list (one line per to-do, each a link to where it is fixed) and the runs in progress.

**Architecture:** Spec `docs/specs/2026-11-06-business-summary-design.md`. Nothing is stored. A server module (`server/business.js`) composes one reply on every read from the modules' own service functions: Costs' `monthView` (this month's tiles, last month from its `last12`, the unpriced-batch notes), Sales' owed, Inventory's list, Batches' list and Runs' list; a module that throws leaves only its own part out (`errors`). `server/business-api.js` serves `GET /api/business/summary`. The route `#/business` becomes the `summary` route and the first Business tab; the last-tab memory (`farm.business`, `businessLanding`) goes. The page (`web/business-page.js`) keeps its words in a pure module (`web/business-math.js`) and formats every figure with the owning module's formatter (the One Format Rule).

**Tech Stack:** Node 22.13+, `node:http`, `node:sqlite`, plain HTML/CSS/JS modules, no build, no npm dependencies, `node --test`.

---

## Ground rules (read before Task 1)

| Rule | Detail |
|---|---|
| Worktree | `/home/foqcus/Documents/mushroom-farm/.claude/worktrees/summary`, branch `feat/summary` (from `integrate/business` `a944e93`). Run every command there. |
| Reference build | `/tmp/summary-plancheck` holds this plan built and passing (2763 tests); its files are the exact files below. Compare against it when unsure; never copy its `.git`. |
| Owned code | New: `server/business.js`, `server/business-api.js`, `web/business-math.js`, `web/business-page.js`, their tests. In shared files only the lines below, marked `// ---- Summary ----` (`/* ---- Summary … ---- */` in CSS), and the Business block's lines the spec changes (the tab list, the route, the landing). Do not change how any module works out a figure. |
| Live apps | Never touch `:8080`, `:8090`, `:8092–8094`, `:1502`, `:1512–1514`, `data/`, or run sqlite3 on a `data/*.db`. Tests use in-memory databases and port 0. A manual look uses port 19160, a gateway that does not exist (`FARM_GATEWAY=127.0.0.1:19161`) and `/tmp/summary/look.db`. |
| Tests | One file: `node --disable-warning=ExperimentalWarning --test tests/<file>`. Everything: `npm test` (2736 tests at the start, 2763 at the end). |
| Style | Match the code around: comments say what and why in plain words, `const` arrows for small helpers, camelCase JSON, metric units, RM. |
| Commits | One per task, message "Summary: …". The repo's git identity is already set (Ray Tham's noreply); commit only the task's files. |

## File map

| File | Status | Responsibility |
|---|---|---|
| `server/business.js` | Create | `createBusiness({ costs, sales, inventory, batches, runs, log })` → `summary()`; `PARTS`, `PART_FAILED` |
| `server/business-api.js` | Create | `createBusinessRoutes({ db, events, harvests, batches, now, zone, log })`: the route, Costs' warm publishing `costs` |
| `server/api.js` | Modify (four marked lines) | Import, make, route, close |
| `web/route.js` | Modify (Business block) | The Summary tab first, the `summary` route for `#/business`, `businessLanding` gone |
| `web/app.js` | Modify | The landing memory gone (Task 3); the page mounted (Task 5) |
| `web/business-tabs.js` | Modify (comment) | Six tabs |
| `web/business-math.js` | Create | Pure: the money card's words, the needs' lines, the runs' rows, the failure and empty words |
| `web/business-page.js` | Create | `mount(container)` |
| `web/styles.css` | Modify (own block at the end) | `.sm-` styles, tokens only |
| `DESIGN.md`, `README.md`, `PRODUCT.md`, `~/.claude/task-logs/business/CONTRACT.md` | Modify | Summary section, paragraph, capability row; Business Landing and Tab strip rows; the contract's section 7 row |
| `tests/business.test.js`, `tests/api-business.test.js`, `tests/web-business-route.test.js`, `tests/web-business-math.test.js`, `tests/web-business-page.test.js` | Create | One or more per task |
| `tests/web-route.test.js`, `tests/web-runs-route.test.js`, `tests/web-costs-route.test.js`, `tests/web-shell.test.js` | Modify | `#/business` is `summary`; six tabs; no landing memory |

---

### Task 1: The service `server/business.js` (spec 3, 4, 9)

**Files:**
- Create: `server/business.js`
- Test: `tests/business.test.js`

The real modules on one in-memory farm: `fixedZone(480)` and a clock the test moves, as `tests/runs.test.js`. Costs' figures are `pending` until its usage warm has run once (`warm()` reads once, then awaits the warms).

- [ ] **Step 1: Write the failing test**

Create `tests/business.test.js`:

```js
// The Business summary's service (server/business.js, spec 2026-11-06-business-summary-design.md 3 and 4): the real Costs,
// Sales, Inventory, Batches and Runs modules on one farm database; the month's money as Costs gives it, every kind of need
// in its order, the open runs, the empty farm, and a module that fails (only its part goes). No HTTP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { createCosts } from '../server/costs.js';
import { createInventory } from '../server/inventory.js';
import { createRuns } from '../server/runs.js';
import { createBusiness, PARTS, PART_FAILED } from '../server/business.js';
import { fixedZone } from '../server/usage.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // a farm day and hour
const NOW = at('2026-11-15');
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4, trhAddress: 1 };

// The modules on a new farm database at NOW; overrides: stand-ins for some of them (a module that fails).
function setup(t, overrides = {}) {
  const db = openDb(':memory:');
  let clock = NOW;
  const now = () => clock;
  const zone = fixedZone(480);
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const sales = createSales({ db, now });
  const costs = createCosts({ db, now, zone });
  const inventory = createInventory({ db, now });
  const runs = createRuns({ db, harvests, batches, sales, costs });
  const logged = [];
  const business = createBusiness({ costs, sales, inventory, batches, runs, log: (err) => logged.push(err.message), ...overrides });
  t.after(async () => {
    harvests.stop();
    costs.stop();
    await Promise.all([harvests.warmed(), costs.warmed()]);
    db.close();
  });
  // the usage days worked out (none recorded: no energy), so Costs' figures are whole
  const warm = async () => {
    business.summary();
    await Promise.all([harvests.warmed(), costs.warmed()]);
  };
  return { db, batches, sales, costs, inventory, business, logged, warm, setClock: (ms) => { clock = ms; } };
}

// Container 1's open run since 1 Nov (600 oyster blocks bought 28 Oct at RM 2.50, 20 kg picked), a RM 120 repair in October,
// two unpaid sales, Sawdust used with no purchase (below zero), Grow bags under their level, Lime past its use-by and
// Bleach near it, 400 Pink oyster blocks waiting with no price and 100 oyster blocks being made.
function farm(s) {
  const { db, batches, sales, costs, inventory } = s;
  s.setClock(at('2026-10-01'));
  const room = db.createRoom(ROOM, at('2026-10-01')).id;
  s.setClock(NOW);
  costs.add({ date: '2026-10-05', category: 'repairs', amount: 120, roomId: room, note: 'Fan belt' });
  const bought = batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', receivedAt: at('2026-10-28'), blocks: 600, pricePerBlock: 2.5 });
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'oyster', blocks: 600 }] }, { change: 'start', at: at('2026-11-01', 9) });
  const run = db.openRun(room);
  batches.place(bought.id, { roomId: room });
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'oyster', stage: 'fruiting', flush: 1, blocks: 1, kg: 20, pickedAt: at('2026-11-10'), worker: null, taskId: null, at: at('2026-11-10') });
  const kedai = sales.addBuyer({ name: 'Kedai Ah Seng' });
  const pasar = sales.addBuyer({ name: 'Pasar Tani' });
  sales.record({ soldAt: at('2026-11-05'), buyerId: kedai.id, lines: [{ crop: 'oyster', kg: 8, priceKg: 12, roomId: room }] });
  sales.record({ soldAt: at('2026-11-12'), buyerId: pasar.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 12, roomId: room }] });
  const sawdust = inventory.addItem({ name: 'Sawdust', kind: 'other', unit: 'kg' });
  inventory.use({ itemId: sawdust.id, qty: 30, worker: 'Ali' });
  const bags = inventory.addItem({ name: 'Grow bags', kind: 'bags', unit: 'pcs', reorderAt: 200 });
  inventory.purchase({ itemId: bags.id, qty: 120, total: 60, day: '2026-11-10' });
  const lime = inventory.addItem({ name: 'Lime', kind: 'other', unit: 'kg' });
  inventory.purchase({ itemId: lime.id, qty: 10, total: 8, day: '2026-11-05', useBy: '2026-11-13' });
  const bleach = inventory.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
  inventory.purchase({ itemId: bleach.id, qty: 5, total: 25, day: '2026-11-14', useBy: '2026-11-18' });
  batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-14'), blocks: 400 });
  batches.mix({ crop: 'oyster', blocks: 100 });
  return { room, run, kedai, pasar, sawdust, bags, lime, bleach };
}

test('summary: the reply\'s parts; the month\'s money is Costs\' own, last month its result', async (t) => {
  const s = setup(t);
  farm(s);
  await s.warm();
  const r = s.business.summary();
  assert.deepEqual(Object.keys(r), ['month', 'lastMonth', 'needs', 'runs', 'errors']);
  const view = s.costs.monthView();
  assert.deepEqual(r.month, { month: '2026-11', pending: false, tiles: view.tiles });
  assert.equal(r.month.tiles.income, 120, 'the two sales');
  assert.equal(r.month.tiles.incomplete, true, 'the pink blocks have no price');
  assert.deepEqual(r.month.tiles.unsold, { kg: 10, value: null }, '20 kg picked, 10 sold; no expected price set');
  assert.deepEqual(r.lastMonth, { month: '2026-10', income: 0, costs: 1620, profit: -1620, pending: false }, 'the blocks and the repair');
  assert.deepEqual(r.errors, {});
});

test('summary: last month\'s figures equal Costs\' view of that month', async (t) => {
  const s = setup(t);
  farm(s);
  await s.warm();
  const { lastMonth } = s.business.summary();
  const october = s.costs.monthView({ month: '2026-10' }).tiles;
  assert.deepEqual([lastMonth.income, lastMonth.costs, lastMonth.profit], [october.income, october.costs, october.profit]);
});

test('summary: every kind of need, in its order, each with where it is fixed', async (t) => {
  const s = setup(t);
  const f = farm(s);
  await s.warm();
  const { needs } = s.business.summary();
  assert.deepEqual(needs.map((n) => n.kind), ['owed', 'below-zero', 'low', 'use-by', 'use-by', 'blocks', 'unpriced']);
  const [owed, below, low, lime, bleach, blocks, unpriced] = needs;
  assert.deepEqual(owed, { kind: 'owed', total: 120, count: 2, oldestAt: at('2026-11-05'), buyers: ['Kedai Ah Seng', 'Pasar Tani'], href: '#/business/sales' },
    'the buyers most owed first');
  assert.deepEqual(below, { kind: 'below-zero', items: [{ id: f.sawdust.id, name: 'Sawdust', qty: -30, unit: 'kg' }], href: '#/business/inventory' });
  assert.deepEqual(low, { kind: 'low', items: [{ id: f.bags.id, name: 'Grow bags', qty: 120, unit: 'pcs', reorderAt: 200 }], href: '#/business/inventory' });
  assert.deepEqual(lime, { kind: 'use-by', id: f.lime.id, name: 'Lime', unit: 'kg', useBy: { date: '2026-11-13', state: 'expired', qty: 10 }, href: `#/business/inventory/${f.lime.id}` },
    'the expired first');
  assert.deepEqual(bleach, { kind: 'use-by', id: f.bleach.id, name: 'Bleach', unit: 'L', useBy: { date: '2026-11-18', state: 'soon', qty: 5 }, href: `#/business/inventory/${f.bleach.id}` });
  assert.deepEqual(blocks, { kind: 'blocks', waiting: { blocks: 400, crops: ['pink'] }, making: { blocks: 100, crops: ['oyster'] }, href: '#/business/batches' });
  assert.deepEqual(unpriced, { kind: 'unpriced', notes: [{ text: 'Blocks received 14 Nov have no price', runId: null }], href: '#/business/batches' });
});

test('summary: an item below zero is not also low; a lost batch is not waiting', async (t) => {
  const s = setup(t);
  const salt = s.inventory.addItem({ name: 'Salt', kind: 'other', unit: 'kg', reorderAt: 5 });
  s.inventory.use({ itemId: salt.id, qty: 2, worker: 'Ali' });
  const lost = s.batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: at('2026-11-14'), blocks: 10, pricePerBlock: 2 });
  s.batches.addCheck(lost.id, { lost: 10, cause: 'green', worker: 'Ali' });
  await s.warm();
  const { needs } = s.business.summary();
  assert.deepEqual(needs.map((n) => n.kind), ['below-zero']);
});

test('summary: the open runs as Runs lists them; an ended run is not in progress', async (t) => {
  const s = setup(t);
  const f = farm(s);
  await s.warm();
  const { runs } = s.business.summary();
  assert.deepEqual(runs.map((r) => [r.id, r.roomName, r.kg, r.endedAt]), [[f.run.id, 'Container 1', 20, null]]);
  assert.deepEqual(Object.keys(runs[0]), ['id', 'roomId', 'roomName', 'crops', 'partial', 'startedAt', 'endedAt', 'kg', 'perBlock',
    'income', 'costs', 'profit', 'profitPerKg', 'pending', 'incomplete']);
  s.db.setProgram(f.room, { ...s.db.getProgram(f.room), crops: [] }, { change: 'end', at: at('2026-11-15', 9) });
  assert.deepEqual(s.business.summary().runs, []);
});

test('summary: a new farm: nothing needs the owner, no runs, the money at 0', async (t) => {
  const s = setup(t);
  await s.warm();
  const r = s.business.summary();
  assert.deepEqual([r.needs, r.runs, r.errors], [[], [], {}]);
  assert.deepEqual([r.month.tiles.income, r.month.tiles.costs, r.month.tiles.profit, r.month.tiles.unsold], [0, 0, 0, null]);
  assert.deepEqual(r.lastMonth, { month: '2026-10', income: 0, costs: 0, profit: 0, pending: false });
});

test('summary: the energy still worked out: the month pending, its costs and profit null', (t) => {
  const s = setup(t);
  s.db.createRoom(ROOM, at('2026-10-01'));
  const r = s.business.summary();
  assert.equal(r.month.pending, true);
  assert.deepEqual([r.month.tiles.costs, r.month.tiles.profit], [null, null]);
});

test('summary: a module that fails leaves only its own part out, says so and logs why', async (t) => {
  const broken = { view() { throw new Error('sales broke'); }, list() { throw new Error('list broke'); } };
  const s = setup(t, { sales: broken, inventory: broken });
  farm(s);
  await s.warm();
  s.logged.length = 0;
  const r = s.business.summary();
  assert.deepEqual(r.errors, { sales: PART_FAILED, inventory: PART_FAILED });
  assert.deepEqual(r.needs.map((n) => n.kind), ['blocks', 'unpriced'], 'Batches\' and Costs\' needs still there');
  assert.equal(r.month.month, '2026-11');
  assert.equal(r.runs.length, 1);
  assert.deepEqual(s.logged, ['sales broke', 'list broke']);
});

test('summary: every module failing: each part null or empty, every part named', (t) => {
  const fail = () => { throw new Error('down'); };
  const s = setup(t, {
    costs: { monthView: fail }, sales: { view: fail }, inventory: { list: fail }, batches: { list: fail }, runs: { list: fail },
  });
  const r = s.business.summary();
  assert.deepEqual(r, { month: null, lastMonth: null, needs: [], runs: null, errors: Object.fromEntries(PARTS.map((p) => [p, PART_FAILED])) });
  assert.equal(PART_FAILED, 'Something went wrong');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/business.test.js`
Expected: FAIL: `Cannot find module '…/server/business.js'`.

- [ ] **Step 3: Write the service**

Create `server/business.js`:

```js
// The Business summary (spec 2026-11-06-business-summary-design.md): the month's money, what needs the owner and the runs in
// progress, composed on each read from the modules' own functions: Costs' month view (this month's tiles, last month's
// result, the batches with no price), Sales' owed, Inventory's list (below zero, low, use-by), Batches' list (blocks waiting
// or being made) and Runs' list (the open runs). No table, no state, no HTTP. A module that fails leaves only its own part
// out (errors[part]); the rest still shows. The server gives the figures; the browser words them (web/business-math.js).

import { addMonths } from './costs-math.js';
import { SALES_HASH, INVENTORY_HASH, inventoryItemHash, BATCHES_HASH } from '../web/route.js';

// The parts a reply may name in errors: each module read once.
export const PARTS = ['costs', 'sales', 'inventory', 'batches', 'runs'];
// The words of a part that could not be read (the API's own for a server fault: the log has the cause).
export const PART_FAILED = 'Something went wrong';
// A lot's use-by: expired before soon, then the earliest day.
const WORST = { expired: 0, soon: 1 };

// costs, sales, inventory, batches, runs: the modules' services (createCosts, createSales, createInventory, createBatches,
// createRuns); log: where a part's failure is told.
export function createBusiness({ costs, sales, inventory, batches, runs, log = console.error }) {
  return {
    // GET /api/business/summary: { month, lastMonth, needs, runs, errors } (spec 4).
    summary() {
      const errors = {};
      // A part read on its own: a throw leaves it null and says so in errors, never the whole reply.
      const read = (part, fn) => {
        try {
          return fn();
        } catch (err) {
          log(err);
          errors[part] = PART_FAILED;
          return null;
        }
      };
      const view = read('costs', () => costs.monthView());
      const owed = read('sales', () => sales.view({ days: 7 }).owed);
      const items = read('inventory', () => inventory.list().items);
      const blocks = read('batches', () => batches.list().batches);
      const open = read('runs', () => runs.list().runs.filter((r) => r.endedAt === null));
      const last = view ? view.last12.find((x) => x.month === addMonths(view.month, -1)) ?? null : null;
      return {
        month: view && { month: view.month, pending: view.pending, tiles: view.tiles },
        lastMonth: last && { month: last.month, income: last.income, costs: last.costs, profit: last.profit, pending: last.pending },
        needs: [...owedNeeds(owed), ...stockNeeds(items), ...blockNeeds(blocks), ...unpricedNeeds(view)],
        runs: open,
        errors,
      };
    },
  };
}

// (1) Money owed: Sales' owed (every unpaid delivery), the buyers most owed first.
function owedNeeds(owed) {
  if (!owed?.count) return [];
  return [{ kind: 'owed', total: owed.total, count: owed.count, oldestAt: owed.oldestAt, buyers: owed.buyers.map((b) => b.buyer), href: SALES_HASH }];
}

// (2) Stock below zero (a purchase not recorded), (3) stock low (at or under its reorder level, not below zero: (2) says
// it), (4) a use-by within 7 days or past, one per item, the expired first, then the earliest. items: Inventory's list
// (archived items left out), by kind then name.
function stockNeeds(items) {
  if (!items) return [];
  const below = items.filter((i) => i.qty < 0);
  const low = items.filter((i) => i.low && i.qty >= 0);
  const dated = items.filter((i) => i.useBy?.state).sort((a, b) => WORST[a.useBy.state] - WORST[b.useBy.state] || a.useBy.date.localeCompare(b.useBy.date));
  return [
    ...(below.length ? [{ kind: 'below-zero', items: below.map(({ id, name, qty, unit }) => ({ id, name, qty, unit })), href: INVENTORY_HASH }] : []),
    ...(low.length ? [{ kind: 'low', items: low.map(({ id, name, qty, unit, reorderAt }) => ({ id, name, qty, unit, reorderAt })), href: INVENTORY_HASH }] : []),
    ...dated.map(({ id, name, unit, useBy }) => ({ kind: 'use-by', id, name, unit, useBy, href: inventoryItemHash(id) })),
  ];
}

// (5) Blocks ready for a room (waiting) or being made (making), their good blocks and crops; batches with no good block
// left out (every block lost: nothing to put in).
function blockNeeds(batches) {
  if (!batches) return [];
  const group = (status) => {
    const list = batches.filter((b) => b.status === status && b.good > 0);
    return { blocks: list.reduce((s, b) => s + b.good, 0), crops: [...new Set(list.map((b) => b.crop))] };
  };
  const waiting = group('waiting');
  const making = group('making');
  return waiting.blocks || making.blocks ? [{ kind: 'blocks', waiting, making, href: BATCHES_HASH }] : [];
}

// (6) Blocks with no price: this month's Costs notes of kind 'unpriced-batch', one need for all of them.
function unpricedNeeds(view) {
  const notes = (view?.notes ?? []).filter((n) => n.kind === 'unpriced-batch');
  return notes.length ? [{ kind: 'unpriced', notes: notes.map((n) => ({ text: n.text, runId: n.runId ?? null })), href: BATCHES_HASH }] : [];
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/business.test.js tests/runs.test.js tests/costs.test.js`
Expected: PASS (the business tests: 9 of 9).

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: PASS, 2745 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add server/business.js tests/business.test.js
git commit -m "Summary: server/business.js composes the month, the needs and the open runs from the modules"
```

### Task 2: The route `server/business-api.js` and its wiring (spec 5)

**Files:**
- Create: `server/business-api.js`
- Modify: `server/api.js` (four marked lines)
- Test: `tests/api-business.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/api-business.test.js`:

```js
// The Business summary's route (spec 2026-11-06-business-summary-design.md 5): GET /api/business/summary, no other method,
// and the 'costs' event when the month's energy has been worked out.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';

const DAY = 86_400_000;
const ROOM = { name: 'Container 1', length: 6, width: 2.4, height: 2.4, trhAddress: 1 };

async function app(t) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const roomId = db.createRoom(ROOM, Date.now() - 2 * DAY).id;
  db.setProgram(roomId, { ...db.getProgram(roomId), crops: [{ crop: 'oyster', blocks: 600 }] }, { change: 'start', at: Date.now() - DAY });
  const runId = db.openRun(roomId).id;
  const server = createApp(db, { events });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise((r) => server.close(r)); db.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path) => {
    const res = await fetch(base + path, { method });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { call, seen, runId, roomId };
}

test('GET /api/business/summary: the month, last month, the needs, the open runs; no other method', async (t) => {
  const { call, runId } = await app(t);
  const r = await call('GET', '/api/business/summary');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body), ['month', 'lastMonth', 'needs', 'runs', 'errors']);
  assert.deepEqual(Object.keys(r.body.month), ['month', 'pending', 'tiles']);
  assert.deepEqual(r.body.needs, []);
  assert.deepEqual(r.body.runs.map((x) => [x.id, x.roomName]), [[runId, 'Container 1']]);
  assert.deepEqual(r.body.errors, {});
  assert.equal((await call('POST', '/api/business/summary')).status, 404);
  assert.equal((await call('GET', '/api/business')).status, 404);
  assert.equal((await call('GET', '/api/business/summary/1')).status, 404);
});

test('a cold month reads pending; its energy worked out publishes costs, and the month reads whole', async (t) => {
  const { call, seen } = await app(t);
  const cold = await call('GET', '/api/business/summary');
  assert.deepEqual([cold.body.month.pending, cold.body.month.tiles.costs, cold.body.month.tiles.profit], [true, null, null]);
  for (let i = 0; i < 100 && !seen.some(([type]) => type === 'costs'); i++) await new Promise((r) => setTimeout(r, 50));
  assert.ok(seen.some(([type]) => type === 'costs'), 'the warm done: costs published');
  const warm = await call('GET', '/api/business/summary');
  assert.deepEqual([warm.body.month.pending, warm.body.month.tiles.costs, warm.body.month.tiles.profit], [false, 0, 0]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-business.test.js`
Expected: FAIL: the first test gets 404 `{ error: 'Not found' }` for `GET /api/business/summary` (`assert.equal(r.status, 200)`).

- [ ] **Step 3: Write the route**

Create `server/business-api.js`:

```js
// The Business summary's route (spec 2026-11-06-business-summary-design.md 5), called from api.js: GET /api/business/summary.
// server/business.js composes the reply from the modules; this makes the services it reads. Read only: it publishes nothing
// of its own ('business' is not an event); its Costs service's usage warm, when done, publishes 'costs' so the page that
// waited for the energy asks again.

import { createBusiness } from './business.js';
import { createRuns } from './runs.js';
import { createSales } from './sales.js';
import { createCosts } from './costs.js';
import { createInventory } from './inventory.js';
import { localZone } from './usage.js';

// db: the farm database; events: the bus (null in some tests); harvests and batches: api.js's own services (Harvest's figures
// take Batches' dry kg, and its usage warm publishes 'harvest' there). → async (req, res, path, { send, HttpError }) answering
// true when the path is its route; its close() stops the Costs service's warms.
export function createBusinessRoutes({ db, events = null, harvests, batches, now = Date.now, zone = localZone, log = console.error }) {
  const costs = createCosts({ db, now, zone });
  const stopTelling = costs.onChange(() => events?.publish('costs', {}));
  const sales = createSales({ db, now });
  const business = createBusiness({
    costs, sales, inventory: createInventory({ db, now }), batches, runs: createRuns({ db, harvests, batches, sales, costs }), log,
  });

  async function businessRoutes(req, res, path, { send, HttpError }) {
    if (path !== '/api/business/summary') return false;
    if (req.method !== 'GET') throw new HttpError(404, 'Not found');
    send(res, 200, business.summary());
    return true;
  }
  businessRoutes.close = () => { stopTelling(); costs.stop(); };
  return businessRoutes;
}
```

- [ ] **Step 4: Wire it in `server/api.js`**

In `server/api.js`, replace:

```js
import { createRunRoutes } from './runs-api.js'; // ---- Runs ----
```

with:

```js
import { createRunRoutes } from './runs-api.js'; // ---- Runs ----
import { createBusinessRoutes } from './business-api.js'; // ---- Summary ----
```

In `server/api.js`, replace:

```js
  const runRoutes = createRunRoutes({ db, events, harvests, batches }); // ---- Runs ---- (spec 2026-11-05-runs-design.md 5)
```

with:

```js
  const runRoutes = createRunRoutes({ db, events, harvests, batches }); // ---- Runs ---- (spec 2026-11-05-runs-design.md 5)
  const businessRoutes = createBusinessRoutes({ db, events, harvests, batches }); // ---- Summary ---- (spec 2026-11-06-business-summary-design.md 5)
```

In `server/api.js`, replace:

```js
    if (await runRoutes(req, res, path, { send, readJson, HttpError, url })) return; // ---- Runs ----
```

with:

```js
    if (await runRoutes(req, res, path, { send, readJson, HttpError, url })) return; // ---- Runs ----
    if (await businessRoutes(req, res, path, { send, HttpError })) return; // ---- Summary ----
```

In `server/api.js`, replace:

```js
  api.close = () => { stopTelling(); inventoryApi.stop(); costRoutes.close(); runRoutes.close(); }; // ---- Inventory, Costs, Runs ----
```

with:

```js
  api.close = () => { stopTelling(); inventoryApi.stop(); costRoutes.close(); runRoutes.close(); businessRoutes.close(); }; // ---- Inventory, Costs, Runs, Summary ----
```

- [ ] **Step 5: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-business.test.js tests/api-runs.test.js tests/api-costs.test.js tests/api.test.js`
Expected: PASS.

- [ ] **Step 6: Run everything**

Run: `npm test`
Expected: PASS, 2747 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add server/business-api.js server/api.js tests/api-business.test.js
git commit -m "Summary: GET /api/business/summary"
```

### Task 3: The Summary tab first, `#/business` its address, no landing memory (spec 2)

**Files:**
- Modify: `web/route.js` (the Business block), `web/app.js` (the landing memory out), `web/business-tabs.js` (comment)
- Modify: `tests/web-route.test.js`, `tests/web-runs-route.test.js`, `tests/web-costs-route.test.js`, `tests/web-shell.test.js`
- Test: `tests/web-business-route.test.js`

The page is mounted in Task 5; until then `#/business` falls through to the Overview under the strip. Do not look at it in a browser before Task 5.

- [ ] **Step 1: Write the failing tests**

Create `tests/web-business-route.test.js`:

```js
// The Summary tab's address (spec 2026-11-06-business-summary-design.md 2): #/business itself, the first Business tab; the
// top bar's entry always opens it (no memory of the last tab); the other tabs' old addresses keep working.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as route from '../web/route.js';

const { parseRoute, canonicalHash, isCanonical, BUSINESS_HASH, BUSINESS_TABS, businessTabOf, businessStrip } = route;

test('#/business is the Summary tab: its route, canonical as it is, the first tab, its strip shown', () => {
  assert.deepEqual(parseRoute('#/business'), { name: 'summary' });
  assert.equal(canonicalHash(parseRoute('#/business/')), BUSINESS_HASH);
  assert.equal(isCanonical('#/business'), true);
  assert.deepEqual(BUSINESS_TABS[0], { key: 'summary', label: 'Summary', hash: '#/business' });
  assert.equal(businessTabOf(parseRoute('#/business')), 'summary');
  assert.equal(businessStrip(parseRoute('#/business')), 'summary');
});

test('no landing memory: the entry never sends #/business elsewhere', () => {
  assert.equal('businessLanding' in route, false);
});

test('the other tabs\' addresses keep working, each its own tab', () => {
  const cases = {
    '#/business/batches': 'batches', '#/business/inventory': 'inventory', '#/business/sales': 'sales', '#/business/costs': 'costs',
    '#/business/runs': 'runs',
  };
  for (const [hash, tab] of Object.entries(cases)) {
    assert.equal(isCanonical(hash), true, hash);
    assert.equal(businessStrip(parseRoute(hash)), tab, hash);
  }
});
```

Then bring the existing tests to the new addresses.

In `tests/web-route.test.js`, replace:

```js
// ---- Business (the integration, 2026-11-05): one top-bar entry, #/business, and the strip of the four pages ----
test('#/business: its own route, canonical as it is, a trailing slash tidied', async () => {
  const { BUSINESS_HASH } = await import('../web/route.js');
  assert.equal(BUSINESS_HASH, '#/business');
  assert.deepEqual(parseRoute('#/business'), { name: 'business' });
  assert.deepEqual(parseRoute('#/business/'), { name: 'business' });
  assert.equal(isCanonical('#/business'), true);
  assert.equal(isCanonical('#/business/'), false);
  assert.equal(canonicalHash({ name: 'business' }), '#/business');
```

with:

```js
// ---- Business (the integration, 2026-11-05): one top-bar entry, #/business (the Summary tab since 2026-11-06), and the strip of the six pages ----
test('#/business: the Summary tab\'s own route, canonical as it is, a trailing slash tidied', async () => {
  const { BUSINESS_HASH } = await import('../web/route.js');
  assert.equal(BUSINESS_HASH, '#/business');
  assert.deepEqual(parseRoute('#/business'), { name: 'summary' });
  assert.deepEqual(parseRoute('#/business/'), { name: 'summary' });
  assert.equal(isCanonical('#/business'), true);
  assert.equal(isCanonical('#/business/'), false);
  assert.equal(canonicalHash({ name: 'summary' }), '#/business');
```

In `tests/web-route.test.js`, replace:

```js
test('the Business tabs: Batches, Inventory, Sales, Costs, Runs, each its page', async () => {
  const { BUSINESS_TABS, INVENTORY_HASH, COSTS_HASH, RUNS_HASH } = await import('../web/route.js');
  assert.deepEqual(BUSINESS_TABS.map((t) => t.key), ['batches', 'inventory', 'sales', 'costs', 'runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.label), ['Batches', 'Inventory', 'Sales', 'Costs', 'Runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.hash), [BATCHES_HASH, INVENTORY_HASH, SALES_HASH, COSTS_HASH, RUNS_HASH]);
  for (const t of BUSINESS_TABS) assert.ok(isCanonical(t.hash), t.hash);
});

test('businessLanding: the tab last used in this browser, Batches the first time or for a key that is not one', async () => {
  const { businessLanding } = await import('../web/route.js');
  assert.equal(businessLanding(null), '#/business/batches');
  assert.equal(businessLanding('inventory'), '#/business/inventory');
  assert.equal(businessLanding('sales'), '#/business/sales');
  assert.equal(businessLanding('costs'), '#/business/costs');
  assert.equal(businessLanding('nope'), '#/business/batches');
  assert.equal(businessLanding('toString'), '#/business/batches', 'not a property of an object');
});
```

with:

```js
test('the Business tabs: Summary, Batches, Inventory, Sales, Costs, Runs, each its page', async () => {
  const { BUSINESS_TABS, BUSINESS_HASH, INVENTORY_HASH, COSTS_HASH, RUNS_HASH } = await import('../web/route.js');
  assert.deepEqual(BUSINESS_TABS.map((t) => t.key), ['summary', 'batches', 'inventory', 'sales', 'costs', 'runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.label), ['Summary', 'Batches', 'Inventory', 'Sales', 'Costs', 'Runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.hash), [BUSINESS_HASH, BATCHES_HASH, INVENTORY_HASH, SALES_HASH, COSTS_HASH, RUNS_HASH]);
  for (const t of BUSINESS_TABS) assert.ok(isCanonical(t.hash), t.hash);
});
```

In `tests/web-route.test.js`, replace:

```js
    '#/business': null, '#/harvest': null,
```

with:

```js
    '#/business': 'summary', '#/harvest': null,
```

In `tests/web-route.test.js`, replace:

```js
test('businessStrip: the strip shows on the four pages only (not a batch, an item, Count stock, or a sheet for print)', async () => {
```

with:

```js
test('businessStrip: the strip shows on the six pages only (not a batch, an item, Count stock, or a sheet for print)', async () => {
```

In `tests/web-route.test.js`, replace:

```js
'#/business/inventory/sheet?days=30': null, '#/business': null, '#/overview': null,
```

with:

```js
'#/business/inventory/sheet?days=30': null, '#/business': 'summary', '#/overview': null,
```

In `tests/web-runs-route.test.js`, replace:

```js
  parseRoute, canonicalHash, isCanonical, RUNS_HASH, runsHash, runHash, businessTabOf, businessStrip, businessLanding,
} from '../web/route.js';
```

with:

```js
  parseRoute, canonicalHash, isCanonical, RUNS_HASH, runsHash, runHash, businessTabOf, businessStrip,
} from '../web/route.js';
```

In `tests/web-runs-route.test.js`, replace:

```js
test('Runs is a Business tab: its strip on the list, not on a run (it has its back link); the landing remembers it', () => {
```

with:

```js
test('Runs is a Business tab: its strip on the list, not on a run (it has its back link)', () => {
```

In `tests/web-runs-route.test.js`, replace:

```js
  assert.equal(businessStrip(parseRoute('#/business/runs/12')), null);
  assert.equal(businessLanding('runs'), '#/business/runs');
```

with:

```js
  assert.equal(businessStrip(parseRoute('#/business/runs/12')), null);
```

In `tests/web-costs-route.test.js`, replace:

```js
  assert.equal(parseRoute('#/business').name, 'business', 'the Business entry, added at the merge');
```

with:

```js
  assert.equal(parseRoute('#/business').name, 'summary', 'the Business entry, added at the merge: the Summary tab since 2026-11-06');
```

In `tests/web-shell.test.js`, replace:

```js
test('#/business opens the tab last used (farm.business), in place of its own address; the strip over the four pages', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  assert.ok(app.includes("const BUSINESS_KEY = 'farm.business';"));
  assert.match(app, /if \(route\.name === 'business'\) \{\n\s*history\.replaceState\(null, '', businessLanding\(lastBusiness\(\)\)\);\n\s*show\(before\);\n\s*return;\n\s*\}/);
  assert.ok(app.includes('if (tab) keepBusiness(tab);'));
  assert.ok(app.includes('view.append(businessTabs(businessStrip(route)), page);'));
```

with:

```js
test('#/business is the Summary tab itself: no memory of the last tab (farm.business gone); the strip over the six pages', () => {
  const app = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
  for (const gone of ['farm.business', 'businessLanding', 'lastBusiness', 'keepBusiness']) assert.ok(!app.includes(gone), gone);
  assert.ok(app.includes('view.append(businessTabs(businessStrip(route)), page);'));
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-business-route.test.js tests/web-route.test.js tests/web-runs-route.test.js tests/web-costs-route.test.js tests/web-shell.test.js`
Expected: FAIL: `parseRoute('#/business')` is `{ name: 'business' }`, `BUSINESS_TABS[0]` is Batches, `businessLanding` is still exported, and `app.js` still holds `farm.business`.

- [ ] **Step 3: The tab and the route (`web/route.js`)**

In `web/route.js`, replace:

```js
// ---- Business (the integration, 2026-11-05; DESIGN.md "Business") ----: the top bar's one Business entry opens #/business,
// which goes to the tab last used in this browser (Batches the first time); the five pages share a strip of tabs, as a
// room's page does. businessTabOf(route): the tab a page belongs to (the top bar marks Business on every one of them);
// businessStrip(route): the tab whose strip shows: only the five pages themselves (a batch, an item, Count stock and a run
// keep their back link; a sheet for print has no strip).
export const BUSINESS_HASH = '#/business';
export const BUSINESS_TABS = [
```

with:

```js
// ---- Business (the integration, 2026-11-05; DESIGN.md "Business") ----: the top bar's one Business entry opens #/business,
// the Summary tab (spec 2026-11-06-business-summary-design.md 2: always, no memory of the last tab); the six pages share a
// strip of tabs, as a room's page does. businessTabOf(route): the tab a page belongs to (the top bar marks Business on every
// one of them); businessStrip(route): the tab whose strip shows: only the six pages themselves (a batch, an item, Count stock
// and a run keep their back link; a sheet for print has no strip).
export const BUSINESS_HASH = '#/business';
export const BUSINESS_TABS = [
  { key: 'summary', label: 'Summary', hash: BUSINESS_HASH }, // ---- Summary ----
```

In `web/route.js`, replace:

```js
const BUSINESS_PAGES = new Map([
  ['batches', 'batches'],
```

with:

```js
const BUSINESS_PAGES = new Map([
  ['summary', 'summary'], // ---- Summary ----
  ['batches', 'batches'],
```

In `web/route.js`, replace:

```js
export const businessStrip = (route) => (BUSINESS_TABS.some((t) => t.key === route?.name) ? route.name : null);
export const businessLanding = (last) => (BUSINESS_TABS.find((t) => t.key === last) ?? BUSINESS_TABS[0]).hash;
```

with:

```js
export const businessStrip = (route) => (BUSINESS_TABS.some((t) => t.key === route?.name) ? route.name : null);
```

In `web/route.js`, replace:

```js
  if (/^#\/business\/?$/.test(hash ?? '')) return { name: 'business' }; // ---- Business ----
```

with:

```js
  if (/^#\/business\/?$/.test(hash ?? '')) return { name: 'summary' }; // ---- Summary ----
```

In `web/route.js`, replace:

```js
  if (route.name === 'business') return BUSINESS_HASH; // ---- Business ----
```

with:

```js
  if (route.name === 'summary') return BUSINESS_HASH; // ---- Summary ----
```

- [ ] **Step 4: The landing memory out of `web/app.js`**

In `web/app.js`, replace:

```js
import { parseRoute, isCanonical, canonicalHash, businessTabOf, businessStrip, businessLanding } from './route.js';
```

with:

```js
import { parseRoute, isCanonical, canonicalHash, businessTabOf, businessStrip } from './route.js';
```

In `web/app.js`, replace:

```js
// ---- Business ---- the tab last used in this browser: #/business opens it (Batches the first time).
const BUSINESS_KEY = 'farm.business';
function lastBusiness() {
  try { return localStorage.getItem(BUSINESS_KEY); } catch { return null; }
}
function keepBusiness(tab) {
  try { localStorage.setItem(BUSINESS_KEY, tab); } catch { /* not kept */ }
}
// ---- end Business ----

let unmount = null;
```

with:

```js
let unmount = null;
```

In `web/app.js`, replace:

```js
  const route = parseRoute(location.hash);
  // ---- Business ---- the entry stands for the tab last used: put its address in place of #/business, no history entry
  if (route.name === 'business') {
    history.replaceState(null, '', businessLanding(lastBusiness()));
    show(before);
    return;
  }
  // ---- end Business ----
```

with:

```js
  const route = parseRoute(location.hash);
```

In `web/app.js`, replace:

```js
  // ---- Business ---- the five pages under the strip of their tabs: the page mounts into its own box below it
  const tab = businessTabOf(route);
  if (tab) keepBusiness(tab);
```

with:

```js
  // ---- Business ---- the six pages under the strip of their tabs: the page mounts into its own box below it (#/business is
  // the Summary tab itself: no memory of the last tab, spec 2026-11-06-business-summary-design.md 2)
  const tab = businessTabOf(route);
```

(`show(before)` keeps its `before` parameter: the tasks sheet's mount still reads it.)

- [ ] **Step 5: The strip's comment (`web/business-tabs.js`)**

In `web/business-tabs.js`, replace:

```js
// The Business strip (the integration, 2026-11-05; DESIGN.md "Business"): Batches · Inventory · Sales · Costs · Runs over
// each of the five pages (Runs: spec 2026-11-05-runs-design.md 6), styled as the room page's tabs (their `.room-tabs` rules:
```

with:

```js
// The Business strip (the integration, 2026-11-05; DESIGN.md "Business"): Summary · Batches · Inventory · Sales · Costs · Runs
// over each of the six pages (Runs: spec 2026-11-05-runs-design.md 6; Summary, #/business: spec
// 2026-11-06-business-summary-design.md 2), styled as the room page's tabs (their `.room-tabs` rules:
```

- [ ] **Step 6: Run them to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-business-route.test.js tests/web-route.test.js tests/web-runs-route.test.js tests/web-costs-route.test.js tests/web-shell.test.js`
Expected: PASS.

- [ ] **Step 7: Run everything**

Run: `npm test`
Expected: PASS, 2749 tests, 0 failures (3 new, the landing test gone).

- [ ] **Step 8: Commit**

```bash
git add web/route.js web/app.js web/business-tabs.js tests/web-business-route.test.js tests/web-route.test.js tests/web-runs-route.test.js tests/web-costs-route.test.js tests/web-shell.test.js
git commit -m "Summary: the Summary tab first in the strip at #/business; the last-tab memory (farm.business, businessLanding) gone"
```

### Task 4: The page's pure parts (`web/business-math.js`, spec 6 and 7)

**Files:**
- Create: `web/business-math.js`
- Test: `tests/web-business-math.test.js`

`DOT` is `'\u00a0· '` and the formatters keep a number with its unit by a no-break space (`NB`), so the expected words are built with them.

- [ ] **Step 1: Write the failing test**

Create `tests/web-business-math.test.js`:

```js
// The Business summary's pure parts (web/business-math.js, spec 2026-11-06-business-summary-design.md 6 and 7): the money
// card's title, tiles and lines, each need's line, the failure and empty words, the open runs' rows.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOT } from '../web/text-math.js';
import {
  moneyTitle, moneyTiles, unsoldLine, lastMonthLine, NEEDS_NONE, NEED_PARTS, needLines, needFailLines, needsEmpty, readFailText,
  RUNS_NONE, runRows,
} from '../web/business-math.js';

const NB = ' ';
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // farm day and hour
const NOW = at('2026-11-15');
const TODAY = '2026-11-15';
const TILES = {
  income: 384, costs: 192.82, profit: 191.18, costPerKg: 1.46, profitPerKg: 23.9, kgHarvested: 132.4, kgSold: 8,
  unsold: { kg: 124.4, value: 4354 }, incomplete: true,
};
const MONTH = { month: '2026-11', pending: false, tiles: TILES };
const RUN = {
  id: 7, roomId: 1, roomName: 'Container 1', crops: [{ crop: 'oyster', blocks: 600 }], partial: false,
  startedAt: at('2026-11-04', 9), endedAt: null, kg: 132.4, perBlock: 0.22, income: 384, costs: 192.82, profit: 191.18,
  profitPerKg: 23.9, pending: false, incomplete: false,
};

test('the money card: "November so far", Costs\' Profit, Income and Costs tiles, the kg not sold', () => {
  assert.equal(moneyTitle(MONTH), 'November so far');
  assert.equal(moneyTitle(null), 'This month so far', 'Costs not read');
  assert.deepEqual(moneyTiles(MONTH), [
    { label: 'Profit', value: `RM${NB}191.18` },
    { label: 'Income', value: `RM${NB}384.00`, line: `8.0${NB}kg sold` },
    { label: 'Costs', value: `RM${NB}192.82`, line: 'Some costs have no price' },
  ]);
  assert.equal(unsoldLine(MONTH), `124.4${NB}kg not sold yet, about RM${NB}4,354.00 at your expected prices`);
  assert.equal(unsoldLine({ ...MONTH, tiles: { ...TILES, unsold: { kg: 12, value: null } } }), `12.0${NB}kg not sold yet`, 'a crop with no expected price');
  assert.equal(unsoldLine({ ...MONTH, tiles: { ...TILES, unsold: null } }), null, 'everything picked is sold');
  assert.equal(unsoldLine(null), null);
});

test('the money card: a loss, and the energy still worked out', () => {
  const loss = moneyTiles({ ...MONTH, tiles: { ...TILES, profit: -340, incomplete: false } });
  assert.deepEqual(loss[0], { label: 'Profit', value: `−RM${NB}340.00`, line: 'Loss', tone: 'loss' });
  assert.deepEqual(loss[2], { label: 'Costs', value: `RM${NB}192.82` });
  const pending = moneyTiles({ ...MONTH, pending: true, tiles: { ...TILES, costs: null, profit: null } });
  assert.deepEqual([pending[0], pending[2]], [{ label: 'Profit', value: '—', line: 'working out' }, { label: 'Costs', value: '—', line: 'working out' }]);
});

test('last month\'s result: profit or loss in words, nothing recorded, working out, the year when it is another', () => {
  assert.equal(lastMonthLine({ month: '2026-10', income: 1500, costs: 300, profit: 1200, pending: false }, MONTH), `October: profit RM${NB}1,200.00`);
  assert.equal(lastMonthLine({ month: '2026-10', income: 0, costs: 13412.23, profit: -13412.23, pending: false }, MONTH), `October: loss RM${NB}13,412.23`);
  assert.equal(lastMonthLine({ month: '2026-10', income: 0, costs: 0, profit: 0, pending: false }, MONTH), 'October: nothing recorded');
  assert.equal(lastMonthLine({ month: '2026-10', income: 0, costs: null, profit: null, pending: true }, MONTH), 'October: working out');
  assert.equal(lastMonthLine({ month: '2025-12', income: 10, costs: 0, profit: 10, pending: false }, { ...MONTH, month: '2026-01' }), `December 2025: profit RM${NB}10.00`);
  assert.equal(lastMonthLine(null, MONTH), null, 'last month not kept');
});

test('a line per need, in the reply\'s order, each with its address', () => {
  const needs = [
    { kind: 'owed', total: 1240, count: 3, oldestAt: at('2026-11-03'), buyers: ['Kedai Ah Seng', 'Pasar Tani'], href: '#/business/sales' },
    { kind: 'below-zero', items: [{ id: 5, name: 'Sawdust', qty: -360.5, unit: 'kg' }], href: '#/business/inventory' },
    { kind: 'low', items: [{ id: 6, name: 'Grow bags', qty: 120, unit: 'pcs', reorderAt: 200 }], href: '#/business/inventory' },
    { kind: 'use-by', id: 8, name: 'Lime', unit: 'kg', useBy: { date: '2026-11-13', state: 'expired', qty: 4.5 }, href: '#/business/inventory/8' },
    { kind: 'use-by', id: 9, name: 'Bleach', unit: 'L', useBy: { date: '2026-11-18', state: 'soon', qty: 3 }, href: '#/business/inventory/9' },
    { kind: 'blocks', waiting: { blocks: 400, crops: ['pink'] }, making: { blocks: 100, crops: ['oyster'] }, href: '#/business/batches' },
    { kind: 'unpriced', notes: [{ text: 'Room 1’s blocks of 4 Nov have no price', runId: 1 }], href: '#/business/batches' },
  ];
  assert.deepEqual(needLines(needs, NOW), [
    { kind: 'owed', text: `RM${NB}1,240.00 owed by Kedai Ah Seng and Pasar Tani${DOT}oldest 12 days`, href: '#/business/sales' },
    { kind: 'below-zero', text: `Below zero: Sawdust −360.50${NB}kg${DOT}a purchase is missing`, href: '#/business/inventory' },
    { kind: 'low', text: `Low stock: Grow bags 120${NB}pcs, reorder at 200${NB}pcs`, href: '#/business/inventory' },
    { kind: 'use-by', text: `Lime${DOT}4.50${NB}kg expired 13 Nov`, href: '#/business/inventory/8' },
    { kind: 'use-by', text: `Bleach${DOT}3.00${NB}L use by 18 Nov`, href: '#/business/inventory/9' },
    { kind: 'blocks', text: `400 Pink oyster blocks ready for a room${DOT}100 Grey oyster blocks being made`, href: '#/business/batches' },
    { kind: 'unpriced', text: `Room 1’s blocks of 4 Nov have no price${DOT}this month's costs leave them out`, href: '#/business/batches' },
  ]);
});

test('the needs of several: the names cut short, the blocks of several crops, the deliveries counted', () => {
  const lines = needLines([
    { kind: 'owed', total: 96, count: 4, oldestAt: NOW, buyers: ['A', 'B', 'C', 'D'], href: '#/business/sales' },
    { kind: 'below-zero', items: ['Grain spawn', 'Plastic bags', 'Gypsum', 'Lime', 'Rice bran'].map((name, i) => ({ id: i, name, qty: -1, unit: 'kg' })), href: '#/business/inventory' },
    { kind: 'low', items: [{ id: 1, name: 'Bags', qty: 1, unit: 'pcs', reorderAt: 5 }, { id: 2, name: 'Gloves', qty: 0, unit: 'pcs', reorderAt: 5 }], href: '#/business/inventory' },
    { kind: 'blocks', waiting: { blocks: 1200, crops: ['oyster', 'pink'] }, making: { blocks: 0, crops: [] }, href: '#/business/batches' },
    { kind: 'blocks', waiting: { blocks: 0, crops: [] }, making: { blocks: 1, crops: ['oyster'] }, href: '#/business/batches' },
    { kind: 'unpriced', notes: [{ text: 'a', runId: 1 }, { text: 'b', runId: 3 }, { text: 'c', runId: null }], href: '#/business/batches' },
    { kind: 'something-new', href: '#/business' },
  ], NOW).map((l) => l.text);
  assert.deepEqual(lines, [
    `RM${NB}96.00 owed by A, B and 2 more${DOT}oldest today`,
    `Below zero: Grain spawn, Plastic bags, Gypsum and 2 more${DOT}purchases are missing`,
    'Low stock: Bags and Gloves',
    '1,200 blocks ready for a room',
    '1 Grey oyster block being made',
    `Blocks of 3 deliveries have no price${DOT}this month's costs leave them out`,
  ], 'a kind the page does not know is left out');
});

test('nothing needs you only when every module was read; a module not read says so', () => {
  assert.equal(needsEmpty({}), NEEDS_NONE);
  assert.equal(NEEDS_NONE, 'Nothing needs you right now.');
  assert.equal(needsEmpty({ runs: 'Something went wrong' }), NEEDS_NONE, 'the runs are not a need');
  assert.equal(needsEmpty({ sales: 'Something went wrong' }), null);
  assert.deepEqual(NEED_PARTS, ['sales', 'inventory', 'batches', 'costs']);
  assert.deepEqual(needFailLines({ costs: 'x', sales: 'x', runs: 'x' }), ["Couldn't check Sales just now.", "Couldn't check Costs just now."]);
  assert.deepEqual(needFailLines(undefined), []);
  assert.equal(readFailText('costs'), "Couldn't read Costs just now.");
  assert.equal(readFailText('runs'), "Couldn't read Runs just now.");
});

test('the open runs: container, crops, days with its day, kg picked, the money so far, the run page named for its run', () => {
  const [row] = runRows([RUN], TODAY);
  assert.deepEqual(row, {
    id: 7, href: '#/business/runs/7', label: 'Run page, Container 1, since 4 Nov', room: 'Container 1', crop: 'oyster',
    crops: '600 Grey oyster', days: `since 4 Nov${DOT}day 12`, kg: `132.4${NB}kg picked`, money: { label: 'Profit so far', value: `RM${NB}191.18` },
  });
  assert.equal(RUNS_NONE, 'No runs in progress. A run starts when a container gets its blocks on its Crop tab.');
  assert.deepEqual(runRows(null, TODAY), []);
});

test('the open runs: a loss in words, working out, no Costs view, some costs with no price, a run under way at the upgrade', () => {
  const money = (o) => runRows([{ ...RUN, ...o }], TODAY)[0].money;
  assert.deepEqual(money({ profit: -1140 }), { label: 'Loss so far', value: `RM${NB}1,140.00`, tone: 'loss' });
  assert.deepEqual(money({ pending: true, costs: null, profit: null }), { label: 'Profit so far', value: '—', line: 'working out' });
  assert.deepEqual(money({ costs: null, profit: null }), { label: 'Profit so far', value: '—' });
  assert.deepEqual(money({ incomplete: true }), { label: 'Profit so far', value: `RM${NB}191.18`, line: 'Some costs have no price' });
  const partial = runRows([{ ...RUN, partial: true, roomName: null }], TODAY)[0];
  assert.deepEqual([partial.days, partial.room], ['recorded since 4 Nov', 'A deleted room']);
  assert.equal(runRows([{ ...RUN, startedAt: at('2026-11-15', 9) }], TODAY)[0].days, `since 15 Nov${DOT}day 1`);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-business-math.test.js`
Expected: FAIL: `Cannot find module '…/web/business-math.js'`.

- [ ] **Step 3: Write the module**

Create `web/business-math.js`:

```js
// The Business summary's pure parts (spec 2026-11-06-business-summary-design.md 6 and 7): the money card's title, tiles and
// lines, a line per need, the open runs' rows, and the words of a part that could not be read. Every figure goes through
// its module's one formatter (the One Format Rule): RM and a loss by Costs', kg by Harvest's, a stock qty and a use-by by
// Inventory's, blocks by Batches', a sale's age by Sales', a run's days and crops by Runs'. A '·' joins with DOT.

import { DOT } from './text-math.js';
import { kgText } from './harvest-math.js';
import { moneyText, monthTiles, monthTitle } from './costs-math.js';
import { qtyText, useByLine } from './inventory-math.js';
import { countBlocks } from './batches-math.js';
import { ageText } from './sales-math.js';
import { cropsText, runDates, runPageLabel } from './runs-math.js';
import { mainCrop } from './room-card-math.js';
import { farmDate, daysFrom } from './tasks-math.js';
import { runHash } from './route.js';

const DASH = '—';
const MINUS = '−';
const isLoss = (text) => text.startsWith(MINUS); // from the shown figure, as Costs': a loss under half a sen is none
const grouped = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 0 });
const andList = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`);
// "Kedai Ah Seng and Pasar Tani", "Sawdust, Lime, Gypsum and 2 more": up to max names, then how many more.
const namesText = (names, max) => (names.length <= max ? andList(names) : `${names.slice(0, max).join(', ')} and ${names.length - max} more`);
const monthName = (month) => monthTitle(month).split(' ')[0]; // "November"

// ---- the money card ----

// The card's title: "November so far" (this month to today); "This month so far" when Costs could not be read.
export const moneyTitle = (month) => (month ? `${monthName(month.month)} so far` : 'This month so far');

// The tiles (harvest-card.js's tileNodes): Costs' month card's Profit, Income and Costs, as Costs words them (a loss, "working
// out" while the energy is worked out, "Some costs have no price").
export const moneyTiles = (month) => monthTiles(month).slice(0, 3);

// The kg picked and not sold: "124.4 kg not sold yet, about RM 4,354.00 at your expected prices" (Costs' unsold; without the
// RM when a picked crop has no expected price); null when everything picked is sold.
export function unsoldLine(month) {
  const u = month?.tiles?.unsold;
  if (!u) return null;
  return `${kgText(u.kg)} not sold yet${u.value === null || u.value === undefined ? '' : `, about ${moneyText(u.value)} at your expected prices`}`;
}

// Last month's whole result: "October: profit RM 1,200.00", "October: loss RM 13,412.23", "October: nothing recorded",
// "October: working out"; the year when it is another ("December 2025: …"). null without last month (not kept).
export function lastMonthLine(last, month) {
  if (!last) return null;
  const name = month && last.month.slice(0, 4) === month.month.slice(0, 4) ? monthName(last.month) : monthTitle(last.month);
  if (last.pending) return `${name}: working out`;
  if (last.income === 0 && last.costs === 0) return `${name}: nothing recorded`;
  const text = moneyText(last.profit);
  return isLoss(text) ? `${name}: loss ${text.slice(MINUS.length)}` : `${name}: profit ${text}`;
}

// ---- Needs you ----

export const NEEDS_NONE = 'Nothing needs you right now.';
// The modules the needs come from, in the card's order of their failure lines.
export const NEED_PARTS = ['sales', 'inventory', 'batches', 'costs'];
export const PART_NAMES = { costs: 'Costs', sales: 'Sales', inventory: 'Inventory', batches: 'Batches', runs: 'Runs' };

// A group of blocks: "400 Pink oyster blocks" of one crop, "1,200 blocks" of several.
const blocksText = ({ blocks, crops }) => (crops.length === 1 ? countBlocks(blocks, crops[0]) : `${grouped(blocks)} ${blocks === 1 ? 'block' : 'blocks'}`);

// A need's line in words.
const WORDS = {
  owed: (n, now) => `${moneyText(n.total)} owed by ${namesText(n.buyers, 2)}${DOT}oldest ${ageText(n.oldestAt, now)}`,
  'below-zero': (n) => (n.items.length === 1
    ? `Below zero: ${n.items[0].name} ${qtyText(n.items[0].qty, n.items[0].unit)}${DOT}a purchase is missing`
    : `Below zero: ${namesText(n.items.map((i) => i.name), 3)}${DOT}purchases are missing`),
  low: (n) => (n.items.length === 1
    ? `Low stock: ${n.items[0].name} ${qtyText(n.items[0].qty, n.items[0].unit)}, reorder at ${qtyText(n.items[0].reorderAt, n.items[0].unit)}`
    : `Low stock: ${namesText(n.items.map((i) => i.name), 3)}`),
  'use-by': (n) => `${n.name}${DOT}${useByLine(n).text}`,
  blocks: (n) => [
    ...(n.waiting.blocks > 0 ? [`${blocksText(n.waiting)} ready for a room`] : []),
    ...(n.making.blocks > 0 ? [`${blocksText(n.making)} being made`] : []),
  ].join(DOT),
  unpriced: (n) => `${n.notes.length === 1 ? n.notes[0].text : `Blocks of ${n.notes.length} deliveries have no price`}${DOT}this month's costs leave them out`,
};

// The card's lines, in the reply's order: [{ kind, text, href }] (a kind this page does not know is left out). now: ms.
export const needLines = (needs, now = Date.now()) => (needs ?? []).filter((n) => WORDS[n.kind])
  .map((n) => ({ kind: n.kind, text: WORDS[n.kind](n, now), href: n.href }));

// A need's module that could not be read: "Couldn't check Sales just now.", one per part, in NEED_PARTS' order.
export const needFailLines = (errors) => NEED_PARTS.filter((p) => errors?.[p]).map((p) => `Couldn't check ${PART_NAMES[p]} just now.`);

// The card's empty words: only when every module was read (a part not read may hold a need).
export const needsEmpty = (errors) => (NEED_PARTS.some((p) => errors?.[p]) ? null : NEEDS_NONE);

// A part that could not be read, in its own card: "Couldn't read Costs just now."
export const readFailText = (part) => `Couldn't read ${PART_NAMES[part]} just now.`;

// ---- Runs in progress ----

export const RUNS_NONE = 'No runs in progress. A run starts when a container gets its blocks on its Crop tab.';

// A run's days: "since 4 Nov · day 12" (the first day day 1, as a batch's incubation); "recorded since 4 Nov" for a run under
// way at the harvest upgrade (its real start, so its day, is not known). today: the farm's date.
const daysText = (run, today) => (run.partial ? runDates(run, today) : `${runDates(run, today)}${DOT}day ${daysFrom(farmDate(run.startedAt), today) + 1}`);

// The money so far: "Profit so far" with Costs' figure, "Loss so far" with the loss without its minus (the word says it, the
// figure in the loss tone, as Harvest's profit line); a dash with "working out" while pending, a dash without Costs' view;
// "Some costs have no price" under it when so.
function moneyOf(run) {
  if (run.pending) return { label: 'Profit so far', value: DASH, line: 'working out' };
  if (run.profit === null || run.profit === undefined) return { label: 'Profit so far', value: DASH };
  const text = moneyText(run.profit);
  const line = run.incomplete ? { line: 'Some costs have no price' } : {};
  return isLoss(text) ? { label: 'Loss so far', value: text.slice(MINUS.length), tone: 'loss', ...line } : { label: 'Profit so far', value: text, ...line };
}

// The open runs' rows, as Runs lists them (newest started first): { id, href (the run page), label (its link's name, Runs'
// runPageLabel), room, crop (the main crop, for its picture), crops ("600 Grey oyster"), days, kg ("20.0 kg picked"), money }.
export const runRows = (runs, today) => (runs ?? []).map((run) => ({
  id: run.id, href: runHash(run.id), label: runPageLabel(run, today), room: run.roomName ?? 'A deleted room', crop: mainCrop(run.crops),
  crops: cropsText(run), days: daysText(run, today), kg: `${kgText(run.kg)} picked`, money: moneyOf(run),
}));
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-business-math.test.js tests/web-runs-math.test.js tests/web-costs-math.test.js`
Expected: PASS (the business math tests: 8 of 8).

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: PASS, 2757 tests, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add web/business-math.js tests/web-business-math.test.js
git commit -m "Summary: web/business-math.js, the money card's words, a line per need, the open runs' rows"
```

### Task 5: The page, its mount, its styles and live reads (spec 6, 8)

**Files:**
- Create: `web/business-page.js`
- Modify: `web/app.js` (two marked lines), `web/styles.css` (own block at the end)
- Test: `tests/web-business-page.test.js`

`web/live.js` needs no change: `batches`, `inventory`, `sales`, `costs`, `harvest` and `room` are all in `EVENT_TYPES`.

- [ ] **Step 1: Write the failing test**

Create `tests/web-business-page.test.js`:

```js
// The Business summary page (web/business-page.js, spec 2026-11-06-business-summary-design.md 6): its mount under the strip,
// its reads, its cards and links, its styles. Source checks.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('business-page.js');
const app = src('app.js');
const css = src('styles.css');
const smCss = css.slice(css.indexOf('/* ---- Summary (spec 2026-11-06-business-summary-design.md 6) ---- */'), css.indexOf('/* ---- end Summary ---- */'));

test('the router mounts the Summary under the strip, at #/business', () => {
  assert.ok(app.includes("import * as summary from './business-page.js'; // ---- Summary ----"));
  assert.ok(app.includes(": route.name === 'summary' ? summary.mount(page, {}) // ---- Summary ----"));
  assert.ok(page.includes('<h1 class="page-title" tabindex="-1">Summary</h1>'));
  assert.ok(page.includes("document.title = 'Business summary · Mushroom farm';"));
});

test('it reads the summary again on the modules\' events, a room\'s crops or name, the stream\'s return and a timer; a stale answer is dropped', () => {
  assert.ok(page.includes("const LISTEN = ['batches', 'inventory', 'sales', 'costs', 'harvest'].filter((type) => EVENT_TYPES.includes(type));"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),"));
  assert.ok(page.includes('live.onStatus((up) => { if (up) reload.call(); }),'));
  assert.ok(page.includes("const reply = await request('GET', '/api/business/summary');"));
  assert.ok(page.includes('if (!alive() || mine !== seq) return;'));
  assert.ok(page.includes('timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));'));
  assert.ok(page.includes('keepFocus(container, () => paint(reply));'), 'focus kept over a repaint');
});

test('three cards in order, Money first; each part says when its module could not be read', () => {
  const order = ['sm-money-title', 'sm-needs-title', 'sm-runs-title'].map((id) => page.indexOf(`id="${id}"`));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.ok(order.every((i) => i > 0));
  assert.ok(page.includes('<a class="co-link" href="${COSTS_HASH}">Costs</a>'));
  assert.ok(page.includes('<a class="co-link" href="${RUNS_HASH}">Runs</a>'));
  assert.ok(page.includes("els.money.replaceChildren(el('p', 'none', readFailText('costs')));"));
  assert.ok(page.includes("els.runs.replaceChildren(el('p', 'none', readFailText('runs')));"));
  assert.ok(page.includes("parts.push(...needFailLines(r.errors).map((t) => el('p', 'none sm-failed', t)));"));
  assert.ok(page.includes("const none = lines.length ? null : needsEmpty(r.errors);"));
});

test('the money in Costs\' tiles\' look; a run page link named for its run; no runs: a link to the rooms', () => {
  assert.ok(page.includes("const tiles = el('div', 'us-tiles hv-tiles co-tiles');"));
  assert.ok(page.includes("if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn';"));
  assert.ok(page.includes("page.setAttribute('aria-label', row.label);"));
  assert.ok(page.includes("rooms.append(link('Rooms', ROOMS_HASH));"));
  assert.ok(page.includes("const ROOMS_HASH = '#/overview';"));
});

test('an older farm app or no answer: the banner says why; an older app stops the asking', () => {
  assert.ok(page.includes('const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);'));
  assert.ok(page.includes('outdated = routeMissing(err);'));
});

test('the styles: one .sm- block at the end, tokens only; Money across, then Needs you beside Runs from 900 px; 44 px taps', () => {
  assert.ok(smCss.length > 0);
  assert.ok(css.trimEnd().endsWith('/* ---- end Summary ---- */'));
  assert.equal(/#[0-9a-f]{3,8}\b/i.test(smCss), false, 'no fixed colour');
  for (const rule of smCss.match(/[^{}]+\{[^}]*\}/g) ?? []) {
    const selector = rule.slice(0, rule.indexOf('{')).replace(/\/\*[^*]*\*\//g, '').trim();
    if (selector.startsWith('@media') || selector === '') continue;
    assert.match(selector, /\.sm-/, selector);
  }
  assert.ok(smCss.includes('.sm-page { display: grid; gap: 16px; align-items: start; }'));
  assert.ok(smCss.includes('grid-template-areas: "money money" "needs runs";'));
  assert.ok(smCss.includes('.sm-page .co-link { padding-block: 14px; }'));
  assert.ok(smCss.includes('.sm-need .co-link { display: block; padding-block: 12px; }'));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-business-page.test.js`
Expected: FAIL: `ENOENT … web/business-page.js`.

- [ ] **Step 3: Write the page**

Create `web/business-page.js`:

```js
// The Business summary, #/business (spec 2026-11-06-business-summary-design.md 6): the Summary tab, first in the Business
// strip. This month's money as Costs gives it, a line per thing that needs the owner (each a link to where it is fixed) and
// the runs in progress. Read only. It asks again on the batches, inventory, sales, costs and harvest events, a room's crops or
// name, when the stream comes back, and on a timer (as Runs); an answer older than the last asked is dropped. A module that
// could not be read says so in its own card; the rest shows.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { COSTS_HASH, RUNS_HASH } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { farmDate } from './tasks-math.js';
import { DOT } from './text-math.js';
import { picture } from './pictures.js';
import { tileNodes } from './harvest-card.js';
import {
  moneyTitle, moneyTiles, unsoldLine, lastMonthLine, needLines, needFailLines, needsEmpty, readFailText, RUNS_NONE, runRows,
} from './business-math.js';

const REFRESH_MS = 60_000;
const LISTEN = ['batches', 'inventory', 'sales', 'costs', 'harvest'].filter((type) => EVENT_TYPES.includes(type));
const ROOMS_HASH = '#/overview'; // the Overview holds the rooms (#/rooms is it now)

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}
// A link in the Business pages' link look (neutral ink, a muted underline: Costs' .co-link).
const link = (text, href) => {
  const a = el('a', 'co-link', text);
  a.href = href;
  return a;
};
// After a repaint the cursor goes back to the same link (its address and words), as the run page's.
const keyOf = (node) => (node?.getAttribute?.('href') ? `${node.getAttribute('href')}|${node.textContent}` : null);
function keepFocus(container, repaint) {
  const before = container.contains(document.activeElement) ? keyOf(document.activeElement) : null;
  repaint();
  if (!before || container.contains(document.activeElement)) return;
  const again = [...container.querySelectorAll('a[href]')].find((n) => keyOf(n) === before);
  again?.focus({ preventScroll: true });
}
// The words of a failed read: an older farm app, no answer, or the server's own.
const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);

const PAGE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Summary</h1>
      <p class="page-sub">This month's money, what needs you and the runs under way.</p>
    </div>
  </div>
  <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
  <div class="sm-page" data-body hidden>
    <section class="card sm-money" aria-labelledby="sm-money-title">
      <div class="card-head"><h2 id="sm-money-title" data-money-title>This month so far</h2><a class="co-link" href="${COSTS_HASH}">Costs</a></div>
      <div data-money></div>
    </section>
    <section class="card sm-needs" aria-labelledby="sm-needs-title">
      <div class="card-head"><h2 id="sm-needs-title">Needs you</h2></div>
      <div data-needs></div>
    </section>
    <section class="card sm-runs" aria-labelledby="sm-runs-title">
      <div class="card-head"><h2 id="sm-runs-title">Runs in progress</h2><a class="co-link" href="${RUNS_HASH}">Runs</a></div>
      <div data-runs></div>
    </section>
  </div>`;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = PAGE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    banner: q('.banner'), bannerText: q('[data-banner-text]'), body: q('[data-body]'), moneyTitle: q('[data-money-title]'),
    money: q('[data-money]'), needs: q('[data-needs]'), runs: q('[data-runs]'),
  };
  document.title = 'Business summary · Mushroom farm';
  let painted = '';

  // Profit, Income and Costs as Costs' month card has them, then the kg not sold and last month's result.
  function paintMoney(r) {
    els.moneyTitle.textContent = moneyTitle(r.month);
    if (!r.month) {
      els.money.replaceChildren(el('p', 'none', readFailText('costs')));
      return;
    }
    const list = moneyTiles(r.month);
    const nodes = tileNodes(list);
    list.forEach((t, i) => { if (t.tone === 'loss') nodes[i].querySelector('.us-kwh').dataset.tone = 'warn'; });
    const tiles = el('div', 'us-tiles hv-tiles co-tiles');
    tiles.append(...nodes);
    // a phone: one long figure sets the others a size down (Costs' month card; Profit has its own row)
    tiles.toggleAttribute('data-long', nodes.slice(1).some((n) => n.querySelector('.us-kwh').hasAttribute('data-long')));
    const lines = [unsoldLine(r.month), lastMonthLine(r.lastMonth, r.month)].filter(Boolean).map((t) => el('p', 'muted sm-line', t));
    els.money.replaceChildren(tiles, ...lines);
  }

  // A line per need, each its link; "Nothing needs you right now." only when every module was read.
  function paintNeeds(r, now) {
    const lines = needLines(r.needs, now);
    const parts = [];
    if (lines.length) {
      const list = el('ul', 'sm-needs-list');
      for (const n of lines) {
        const li = el('li', 'sm-need');
        li.dataset.kind = n.kind;
        li.append(link(n.text, n.href));
        list.append(li);
      }
      parts.push(list);
    }
    const none = lines.length ? null : needsEmpty(r.errors);
    if (none) parts.push(el('p', 'none', none));
    parts.push(...needFailLines(r.errors).map((t) => el('p', 'none sm-failed', t)));
    els.needs.replaceChildren(...parts);
  }

  // Each open run: its container with the money so far beside it, then its crops, days and kg, and its Run page.
  function paintRuns(r, today) {
    if (!r.runs) {
      els.runs.replaceChildren(el('p', 'none', readFailText('runs')));
      return;
    }
    if (!r.runs.length) {
      const rooms = el('p', 'sm-foot');
      rooms.append(link('Rooms', ROOMS_HASH));
      els.runs.replaceChildren(el('p', 'none', RUNS_NONE), rooms);
      return;
    }
    const list = el('ul', 'sm-runs-list');
    for (const row of runRows(r.runs, today)) {
      const li = el('li', 'sm-run');
      const head = el('div', 'sm-run-head');
      const room = el('span', 'co-crop sm-room');
      if (row.crop) room.append(picture('crop', row.crop, { size: 24 }));
      room.append(el('span', '', row.room));
      // "Profit so far RM 357.18"; a loss in words, only its figure in the loss tone (Costs' way)
      const money = el('span', 'sm-so-far');
      money.append(el('span', 'sm-so-far-label', row.money.label), ' ', el('span', `sm-so-far-value${row.money.tone === 'loss' ? ' co-loss' : ''}`, row.money.value));
      if (row.money.line) money.append(el('span', 'co-sub', row.money.line));
      head.append(room, money);
      const line = el('p', 'muted sm-run-line', `${[row.crops, row.days, row.kg].join(DOT)}${DOT}`);
      const page = link('Run page', row.href);
      page.setAttribute('aria-label', row.label); // "Run page, Container 1, since 4 Nov": one name per run
      line.append(page);
      li.append(head, line);
      list.append(li);
    }
    els.runs.replaceChildren(list);
  }

  function paint(r) {
    els.banner.hidden = true;
    els.body.hidden = false;
    const now = Date.now();
    const today = farmDate(now); // read at each paint: past midnight "day 12" and "oldest 3 days" move on
    const key = JSON.stringify([r, today]);
    if (key === painted) return;
    painted = key;
    paintMoney(r);
    paintNeeds(r, now);
    paintRuns(r, today);
  }
  // No answer: the banner says why; what was shown stays (a first read that fails shows the banner alone).
  function fail(err) {
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }

  let seq = 0;
  let timer = null;
  let outdated = false;
  let stopped = false;
  async function load() {
    if (!alive() || outdated || stopped) return;
    clearTimeout(timer);
    const mine = ++seq;
    try {
      const reply = await request('GET', '/api/business/summary');
      if (!alive() || mine !== seq) return;
      keepFocus(container, () => paint(reply));
    } catch (err) {
      if (!alive() || mine !== seq) return;
      outdated = routeMissing(err);
      fail(err);
      if (outdated) return;
    }
    clearTimeout(timer);
    timer = setTimeout(load, fallbackMs(REFRESH_MS, live.connected()));
  }
  const reload = createThrottle(() => { if (alive()) load(); });
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => reload.call())),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }), // a run starts or ends; a room's name
    live.onStatus((up) => { if (up) reload.call(); }),
  ];
  q('[data-retry]').addEventListener('click', () => load());
  load();

  return function unmount() {
    mountSeq++;
    stopped = true;
    reload.cancel();
    clearTimeout(timer);
    for (const off of offLive) off();
  };
}
```

- [ ] **Step 4: Mount it (`web/app.js`)**

In `web/app.js`, replace:

```js
import * as runs from './runs-page.js'; // ---- Runs ----
```

with:

```js
import * as runs from './runs-page.js'; // ---- Runs ----
import * as summary from './business-page.js'; // ---- Summary ----
```

In `web/app.js`, replace:

```js
    : route.name === 'run' ? runs.mountRun(view, { id: route.id })
```

with:

```js
    : route.name === 'run' ? runs.mountRun(view, { id: route.id })
    : route.name === 'summary' ? summary.mount(page, {}) // ---- Summary ----
```

- [ ] **Step 5: The styles**

Append to the end of `web/styles.css`, right after `/* ---- end Runs ---- */`:

```css
/* ---- Summary (spec 2026-11-06-business-summary-design.md 6) ---- */
/* the Business summary, #/business: the money across the top; from 900 px Needs you beside Runs in progress, each card its own
   height (align-items: start), never stretched to its neighbour's; one column below, in that order */
.sm-page { display: grid; gap: 16px; align-items: start; }
@media (min-width: 900px) {
  .sm-page { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "money money" "needs runs"; }
  .sm-money { grid-area: money; }
  .sm-needs { grid-area: needs; }
  .sm-runs { grid-area: runs; }
}
.sm-page .none { margin: 0; color: var(--muted); }
.sm-line { margin: 8px 0 0; font-size: var(--fs-sm); font-variant-numeric: tabular-nums; }
.sm-money .co-tiles + .sm-line { margin-top: 12px; }
/* Needs you: a line each, the whole line its link; a module not read in a muted line under them */
:is(.sm-needs-list, .sm-runs-list) { list-style: none; margin: 0; padding: 0; }
.sm-need { padding: 8px 0; border-top: 1px solid var(--border); font-size: var(--fs-sm); }
.sm-need:first-child { border-top: 0; padding-top: 0; }
.sm-needs-list + .sm-failed { margin-top: 8px; }
/* Runs in progress: the container (its main crop's picture) with the money so far beside it, then its crops, days, kg and Run page */
.sm-run { display: grid; gap: 4px; padding: 10px 0; border-top: 1px solid var(--border); }
.sm-run:first-child { border-top: 0; padding-top: 0; }
.sm-run-head { display: flex; align-items: start; justify-content: space-between; gap: 4px 12px; flex-wrap: wrap; }
.sm-room { font-weight: 600; }
.sm-so-far { text-align: right; font-variant-numeric: tabular-nums; }
.sm-so-far-label { color: var(--muted); font-size: var(--fs-sm); }
.sm-so-far-value { font-weight: 600; }
.sm-run-line { margin: 0; font-size: var(--fs-sm); }
.sm-foot { margin: 10px 0 0; font-size: var(--fs-sm); }
@media (max-width: 600px) {
  /* a finger's tap: every link reaches 44 px, its padding over the line (inline, as the run page's); a need's line a block */
  .sm-page .co-link { padding-block: 14px; }
  .sm-need { padding: 0; }
  .sm-need .co-link { display: block; padding-block: 12px; }
  .sm-so-far { text-align: left; }
}
/* ---- end Summary ---- */
```

- [ ] **Step 6: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-business-page.test.js tests/web-shell.test.js tests/web-runs-page.test.js`
Expected: PASS.

- [ ] **Step 7: Run everything**

Run: `npm test`
Expected: PASS, 2763 tests, 0 failures.

- [ ] **Step 8: Commit**

```bash
git add web/business-page.js web/app.js web/styles.css tests/web-business-page.test.js
git commit -m "Summary: the page at #/business (money, Needs you, runs in progress), its .sm- styles and live reads"
```

### Task 6: The documents (spec 10)

**Files:**
- Modify: `DESIGN.md`, `README.md`, `PRODUCT.md`, `~/.claude/task-logs/business/CONTRACT.md` (outside the repo, not committed)

`.impeccable/design.json` is regenerated from `DESIGN.md` by the UI audit's documenter step, not by hand.

- [ ] **Step 1: `DESIGN.md`, the Business section**

Replace `One top-bar entry for the five business pages.` with `One top-bar entry for the six business pages.`

Replace the Landing row:

```markdown
| Landing | `#/business` opens the tab last used in this browser (`farm.business`, kept on every business page), Batches the first time; its address is replaced, so Back skips it (`web/route.js` `businessLanding`) |
```

with:

```markdown
| Landing | `#/business` is the Summary tab itself, always (2026-11-06, the Business summary: the memory of the last tab, `farm.business`, is gone); the other tabs' addresses are as before |
```

In the Tab strip row replace `| Tab strip | Batches · Inventory · Sales · Costs · Runs, in that order,` with `| Tab strip | Summary · Batches · Inventory · Sales · Costs · Runs, in that order,`, and in the same row replace `On the five pages only: a batch, an item, Count stock and a run keep their back link, and a sheet for print (4-2, 4-5) has none (Runs: 2026-11-05) |` with `On the six pages only: a batch, an item, Count stock and a run keep their back link, and a sheet for print (4-2, 4-5) has none (Runs: 2026-11-05; Summary: 2026-11-06) |`.

- [ ] **Step 2: `DESIGN.md`, a Summary section**

Insert right before the line `## Do's and Don'ts` (after the Runs section), followed by one empty line:

```markdown
### Summary
(2026-11-06; spec `docs/specs/2026-11-06-business-summary-design.md`.) The **Summary** tab, `#/business`, the first tab of the Business strip and where the top bar's Business always opens: this month's money, what needs the owner and the runs in progress, composed from the modules on each read. Read only. Where each part lives:

| Part | Design |
|---|---|
| Head | "Summary", "This month's money, what needs you and the runs under way." The page's title "Business summary" |
| Money | A card across the top titled "November so far" (head link **Costs**): Costs' month tiles Profit (display size, its own row on a phone), Income, Costs, as Costs words them (a loss, "working out", "Some costs have no price"); under them, muted, "124.4 kg not sold yet, about RM 4,354.00 at your expected prices" and last month's result "October: loss RM 1,508.00" ("profit RM …", "nothing recorded", "working out"). The figures are Costs' own (`monthView`), so they always match it |
| Needs you | A line per thing to do, each line its own link (`.co-link`) to where it is fixed, in this order: money owed (Sales), stock below zero, stock low (Inventory), a use-by within 7 days or past (one line per item, to its page), blocks ready for a room or being made (Batches), blocks with no price this month (Batches). "Nothing needs you right now." only when every module was read; a module not read adds "Couldn't check Sales just now." |
| Runs in progress | Each open run: the main crop's 24 px picture and the container, the money so far beside it ("Profit so far RM 357.18"; "Loss so far RM 1,005.97" with only the figure in the critical text token), then "600 Grey oyster · since 4 Nov · day 3 · 20.0 kg picked · Run page" (the link named for its run, as Runs'). Head link **Runs**. None: "No runs in progress. A run starts when a container gets its blocks on its Crop tab." and a link "Rooms" |
| Layout | Money across the top; from 900 px Needs you beside Runs in progress, each card its own height (`align-items: start`); one column below in that order. Up to 600 px every link reaches 44 px (a need's line a block with 12 px over and under; the others block padding over their line) |
| Failures | A module that could not be read says so in its own card ("Couldn't read Costs just now.", "Couldn't read Runs just now."); the rest shows. No answer at all: the banner with Retry, as the other pages |
| Live | Asks again on the `batches`, `inventory`, `sales`, `costs` and `harvest` events, a room's crops or name, the stream's return and a 60 s timer; a repaint keeps the cursor on the same link |
| Styles | The `.sm-` block at the end of `styles.css`, tokens only; everything else is the other modules' classes |
```

- [ ] **Step 3: `README.md`**

In the **Business.** paragraph replace:

```markdown
holds five pages under one strip of tabs, Batches, Inventory, Sales, Costs and Runs, each described below; `#/business` opens the one last used in this browser (Batches the first time).
```

with:

```markdown
holds six pages under one strip of tabs, Summary, Batches, Inventory, Sales, Costs and Runs, each described below; `#/business` is the Summary, always.
```

Then insert after the **Runs.** paragraph (it ends "Spec: `docs/specs/2026-11-05-runs-design.md`."), as its own paragraph:

```markdown
**Summary.** `#/business`, the first Business tab and where the top bar's Business opens: this month's profit, income and costs as Costs works them out, the kg not sold yet and last month's result; a line per thing that needs you (money owed, stock below zero or low, a use-by near or past, blocks ready for a room or being made, blocks with no price), each a link to where you fix it; and each run in progress with its days, kg picked and profit so far, linking to its run page. It is read only and stores nothing: the server composes it from the modules on every read, and a module that cannot be read leaves only its own part out. Route: `GET /api/business/summary`. No database step. Spec: `docs/specs/2026-11-06-business-summary-design.md`.
```

- [ ] **Step 4: `PRODUCT.md`**

In Capabilities and Constraints add a row right after the `| Runs | … |` row:

```markdown
| Summary | `#/business`: this month's money as Costs gives it and last month's result; what needs the owner (money owed, stock below zero or low, a use-by near, blocks waiting or being made, blocks with no price), each linking to where it is fixed; the runs in progress with their profit so far |
```

- [ ] **Step 5: The contract's section 7 (`~/.claude/task-logs/business/CONTRACT.md`)**

Add a row at the end of the table in "## 7. Changes to this contract":

```markdown
| 2026-11-06 | Summary | A new read, `GET /api/business/summary` (`server/business.js`, `server/business-api.js`): this month's Costs tiles and last month's result (`monthView`, its `last12`), Sales' owed, Inventory's below zero, low and use-by items, Batches' waiting and making blocks, Costs' unpriced-batch notes and Runs' open runs, composed from each module's service functions (read only, no table). The Business strip gains Summary first at `#/business`; the last-tab memory (`farm.business`, `businessLanding`) is gone. **Every module, read this:** a change to `monthView`'s `tiles`/`last12`/`notes`, Sales' `owed`, Inventory's item view (`qty`, `low`, `useBy`), Batches' `status`/`good` or Runs' list row shape breaks the Summary | Yes (2026-11-06, the owner's approved Summary design) |
```

- [ ] **Step 6: Run everything**

Run: `npm test`
Expected: PASS, 2763 tests, 0 failures.

- [ ] **Step 7: Commit**

```bash
git add DESIGN.md README.md PRODUCT.md
git commit -m "Summary: DESIGN.md's Summary section and six tabs, README's Summary paragraph, PRODUCT.md's capability"
```

### Task 7: Look at it running, then hand over

**Files:** none changed (a throwaway database under `/tmp/summary/`).

- [ ] **Step 1: Seed a throwaway farm**

Create `/tmp/summary/seed.mjs` (outside the repo) and run it from the worktree with `node --disable-warning=ExperimentalWarning /tmp/summary/seed.mjs /tmp/summary/look.db /home/foqcus/Documents/mushroom-farm/.claude/worktrees/summary`:

```js
const root = process.argv[3] ?? '/home/foqcus/Documents/mushroom-farm/.claude/worktrees/summary';
const { openDb } = await import(`${root}/server/db.js`);
const { createBatches } = await import(`${root}/server/batches.js`);
const { createSales } = await import(`${root}/server/sales.js`);
const { createCosts } = await import(`${root}/server/costs.js`);
const { createInventory } = await import(`${root}/server/inventory.js`);
const DAY = 86_400_000;
const NOW = Date.now();
const db = openDb(process.argv[2]);
let clock = NOW - 70 * DAY;
const now = () => clock;
const batches = createBatches({ db, now });
const sales = createSales({ db, now });
const costs = createCosts({ db, now: () => NOW });
const inventory = createInventory({ db, now: () => NOW });
const ROOM = { length: 6, width: 2.4, height: 2.4 };
const one = db.createRoom({ ...ROOM, name: 'Container 1' }, clock).id;
const two = db.createRoom({ ...ROOM, name: 'Container 2' }, clock).id;
const program = (roomId, crops, at, change) => db.setProgram(roomId, { ...db.getProgram(roomId), crops }, { change, at });
const pick = (roomId, runId, crop, kg, at, flush) => db.insertHarvest({ roomId, runId, crop, stage: 'fruiting', flush, blocks: 1, kg, pickedAt: at, worker: 'Kumar', taskId: null, at });
const b1 = batches.receive({ crop: 'oyster', supplier: 'Agro Supplies', receivedAt: NOW - 70 * DAY, blocks: 600, pricePerBlock: 2.5, spawnBatch: '0912' });
program(one, [{ crop: 'oyster', blocks: 600 }], NOW - 65 * DAY, 'start');
const a = db.openRun(one);
clock = NOW - 64 * DAY;
batches.place(b1.id, { roomId: one });
for (let i = 0; i < 12; i++) pick(one, a.id, 'oyster', 5 + i, NOW - (60 - i * 2) * DAY, i < 6 ? 1 : 2);
clock = NOW - 50 * DAY;
const buyer = sales.addBuyer({ name: 'Kedai Ah Seng' });
const pasar = sales.addBuyer({ name: 'Pasar Tani Kajang' });
sales.record({ soldAt: NOW - 50 * DAY, buyerId: buyer.id, invoiceNo: 'R-1', lines: [{ crop: 'oyster', kg: 40, priceKg: 12, roomId: one }] });
costs.add({ date: new Date(NOW - 40 * DAY).toISOString().slice(0, 10), category: 'repairs', amount: 120, roomId: one, note: 'Fan belt' });
clock = NOW;
program(one, [{ crop: 'oyster', blocks: 300 }, { crop: 'lionsmane', blocks: 100 }], NOW - 30 * DAY, 'restart');
const b = db.openRun(one);
pick(one, b.id, 'oyster', 10, NOW - 5 * DAY, 1);
pick(one, b.id, 'lionsmane', 5, NOW - 5 * DAY, 1);
sales.record({ soldAt: NOW - 2 * DAY, buyerId: buyer.id, lines: [{ crop: 'oyster', kg: 8, priceKg: 12, roomId: one }] });
sales.record({ soldAt: NOW - DAY, buyerId: pasar.id, lines: [{ crop: 'oyster', kg: 2, priceKg: 14, roomId: one }] });
program(two, [{ crop: 'pink', blocks: 200 }], NOW - 2 * DAY, 'start');
costs.add({ date: new Date(NOW - 20 * DAY).toISOString().slice(0, 10), category: 'rent', amount: 1500, repeat: 'monthly' });
const day = (n) => new Date(NOW + n * DAY + 8 * 3_600_000).toISOString().slice(0, 10);
const sawdust = inventory.addItem({ name: 'Sawdust', kind: 'other', unit: 'kg' });
inventory.use({ itemId: sawdust.id, qty: 360.5, worker: 'Ali' });
const bags = inventory.addItem({ name: 'Grow bags', kind: 'bags', unit: 'pcs', reorderAt: 200 });
inventory.purchase({ itemId: bags.id, qty: 120, total: 60, day: day(-3) });
const lime = inventory.addItem({ name: 'Lime', kind: 'other', unit: 'kg' });
inventory.purchase({ itemId: lime.id, qty: 10, total: 8, day: day(-10), useBy: day(-2) });
const bleach = inventory.addItem({ name: 'Bleach', kind: 'chemical', unit: 'L' });
inventory.purchase({ itemId: bleach.id, qty: 5, total: 25, day: day(-1), useBy: day(3) });
batches.receive({ crop: 'pink', supplier: 'Agro Supplies', receivedAt: NOW - DAY, blocks: 400 });
batches.mix({ crop: 'oyster', blocks: 100 });
console.log('runs', db.allRuns().map((r) => r.id));
db.close();
```

Expected: `runs [ 3, 2, 1 ]`.

- [ ] **Step 2: Start a look server**

```bash
cd /home/foqcus/Documents/mushroom-farm/.claude/worktrees/summary && FARM_DB=/tmp/summary/look.db FARM_PORT=19160 FARM_GATEWAY=127.0.0.1:19161 node --disable-warning=ExperimentalWarning server/main.js
```

Expected: `Farm app on http://localhost:19160 (database /tmp/summary/look.db, gateway 127.0.0.1:19161, reading every 5 s)`.

- [ ] **Step 3: Check**

| Address | See |
|---|---|
| `#/business` | Six tabs, Summary first and current; the top bar's Business current. "November so far" (this month): Profit, Income "10.0 kg sold", Costs "Some costs have no price"; "5.0 kg not sold yet"; last month "…: loss RM …" |
| Needs you | Seven lines in order: owed by Kedai Ah Seng and Pasar Tani Kajang; Below zero: Sawdust −360.50 kg; Low stock: Grow bags; Lime expired; Bleach use by; 400 Pink oyster blocks ready for a room · 100 Grey oyster blocks being made; Blocks received … have no price. Each opens its page |
| Runs in progress | Container 2 and Container 1 (mixed), each "Loss so far RM …" with the figure in the loss tone and "· Run page" opening its run |
| The briefcase from `#/business/costs` | Opens the Summary (not Costs); Back returns to Costs |
| `#/business/batches`, `/inventory`, `/sales`, `/costs`, `/runs` | Each as before, its tab current |

At 1300 px (Money across, Needs you beside Runs in progress) and 390 px (one column; every link 44 px or taller: `[...document.querySelectorAll('.sm-page a')].map((a) => a.getBoundingClientRect().height)`), both themes; no console errors. Stop the server (Ctrl-C) and remove `/tmp/summary/look.db*`.

- [ ] **Step 4: Hand over**

The branch is ready for the UI/UX audit step (Impeccable critique and audit, desk and phone, both themes) and the finish review; it is not merged here.

---

## Self-review

| Check | Result |
|---|---|
| Spec coverage | Composition 3, reply 4, edge cases 9 → Task 1; API 5 → Task 2; placement and addresses 2 → Task 3; words 6.1–6.3, numbers 7 → Task 4; page 6, states 6.4, live 8 → Task 5; files 10 (documents, contract) → Task 6; the look of testing 11 → Task 7 |
| Placeholders | None: every new file is given whole, every edit as its exact old and new text |
| Names | `createBusiness`/`summary`/`PARTS`/`PART_FAILED`, `createBusinessRoutes`, the `summary` route and tab key, `BUSINESS_HASH`, the `business-math.js` exports (`moneyTitle`, `moneyTiles`, `unsoldLine`, `lastMonthLine`, `NEEDS_NONE`, `NEED_PARTS`, `PART_NAMES`, `needLines`, `needFailLines`, `needsEmpty`, `readFailText`, `RUNS_NONE`, `runRows`) and `mount` are used with the same names and shapes in every later task |
| Built | Applied task by task to a copy of `a944e93` (`/tmp/summary-plancheck`): each task's tests fail before and pass after; `npm test` 2745, 2747, 2749, 2757, 2763, 2763 after Tasks 1–6, 0 fail; the page looked at on port 19160 at 1300 and 390 px, both themes, no console errors |

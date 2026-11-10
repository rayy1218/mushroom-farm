# Economics (stage 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An **Economics** tab, the seventh in the Business strip (`#/business/economics?room=&crop=`): one of the farm's rooms with one crop (grey oyster, pink oyster, black jelly, lion's mane), a month at a time, against a lowland shed, a highland grower, importing and reselling and (lion's mane) a warm strain, with every figure tagged by where it comes from (You set, Your runs, Simulator, Settings, Research), edited in place and saved for every device, and a **Work it out** button that runs the room's simulation for the electricity per block.

**Architecture:** Spec `docs/superpowers/specs/2026-11-06-economics-design.md` (its research appendix `2026-11-06-economics-defaults.md`). One pure model (`web/economics-model.js`, the port of the lion's mane model page) works the money out in the browser on every keystroke; the research defaults with their ranges and sources live in `web/economics-defaults.js`, shared by the server and the page. The server only resolves the figures: `server/economics-runs.js` reads Your runs live from Harvest, Sales, Batches and the usage days; `server/economics-sim.js` builds the Work it out body; `server/economics.js` composes the view, saves the owner's figures in one new table (`economics_figures`, database version 26) and settles Work it out from the `simulation` events; `server/economics-api.js` serves four routes, the owner's only. The page (`web/economics-page.js`) keeps its words in `web/economics-math.js` (the comparison) and `web/economics-figures.js` (the Figures card).

**Tech Stack:** Node 22.13+, `node:http`, `node:sqlite`, plain HTML/CSS/JS modules, no build, no npm dependencies, `node --test`.

---

## Ground rules (read before Task 1)

| Rule | Detail |
|---|---|
| Worktree | `/home/foqcus/Documents/mushroom-farm/.claude/worktrees/economics`, branch `feat/economics` (from `v2` `938a61e`, with the spec at `45e2d67`). Run every command there. |
| Reference build | `/home/foqcus/.config/superpowers/worktrees/mushroom-farm/econ-plancheck` (branch `scratch/econ-plancheck`, throwaway) holds this plan built and passing; its files are the exact files below. Compare against it when unsure; never merge or copy its `.git` or its `plan/` folder. |
| Owned code | New: `server/economics.js`, `server/economics-api.js`, `server/economics-runs.js`, `server/economics-sim.js`, `web/economics-model.js`, `web/economics-defaults.js`, `web/economics-math.js`, `web/economics-figures.js`, `web/economics-page.js`, their tests. In shared files only the lines below, marked `// ---- Economics ----` (`/* ---- Economics ---- */` in CSS). Do not change how any other module works out a figure (contract section 7). |
| Login | Every Economics route is the owner's: `server/roles.js` is not changed (a route off its worker list is 403); the live stream keeps the `economics` event from a worker's stream (Task 7). |
| Live apps | Never start, restart or deploy the farm app; never touch `:8080`, `:8090`, `:8092–8094`, `:1502`, `:1512–1514`, `data/`, or run sqlite3 on a `data/*.db`; never ssh. Tests use in-memory databases, files under `/tmp/economics/` and port 0. A manual look uses port 19200, a gateway that does not exist (`FARM_GATEWAY=127.0.0.1:19201`) and `/tmp/economics/look.db`. |
| Tests | One file: `node --disable-warning=ExperimentalWarning --test tests/<file>`. Everything: `npm test` (2922 tests at the start). |
| Units and money | Metric only (g, kg, kWh, m³, °C, L/h, days, min); money is RM with 2 places through the owning module's formatter (the One Format Rule). |
| Style | Match the code around: comments say what and why in plain words, `const` arrows for small helpers, camelCase JSON. |
| Commits | One per task, message "Economics: …" (plain sentences). The repo's git identity is already set; no attribution trailers; commit only the task's files. |

## File map

| File | Status | Responsibility |
|---|---|---|
| `web/economics-model.js` | Create (Task 1) | `DAYS_A_MONTH`, `HOUSE_BLOCKS`, `blockLife`, `grow`, `trade`, `housesOf`, `inputsOf`, `compare` (spec 5) |
| `web/economics-defaults.js` | Create (Task 2) | `ECONOMICS_CROPS`, `WAYS`, `LEFT`, `WAY_NAMES`, `FIGURES`, `figureOf`, `figuresFor`, `placeOf`, `checkFigure`, `researchOf`, `sizeOf`, `SOURCES` (spec 4, appendix 1 and 6) |
| `server/db.js` | Modify (Task 3, own block) | `economics_figures`, its index and trigger, version 26, six methods, `SIM_KEY` |
| `server/economics-runs.js` | Create (Task 4) | `yourRuns`: Your runs' figures (spec 4.4, 4.5) |
| `server/economics-sim.js` | Create (Task 5) | `simBody`, `simFigure`, `MAX_SIM_DAYS`, `DELETED_TEXT` (spec 6.1) |
| `server/economics.js` | Create (Task 6) | `createEconomics`: `view`, `setFigure`, `clearFigure`, `workOut`, `close`; `EconomicsError`, `DEFAULT_CROP` (spec 4.3, 6.2, 7.2) |
| `server/economics-api.js` | Create (Task 7) | `createEconomicsRoutes` (spec 7.1) |
| `server/api.js` | Modify (Task 7, four marked lines) | Import, make, route, close |
| `server/live.js` | Modify (Task 7, marked) | `OWNER_EVENTS`: a worker's stream never carries `economics` |
| `web/route.js`, `web/business-tabs.js`, `web/live.js` | Modify (Task 8, marked) | The seventh tab, the `economics` route, `'economics'` in `EVENT_TYPES` |
| `web/economics-math.js` | Create (Task 9) | The comparison's words: `monthsText`, `figureText`, `rangeText`, `wayName`, `headline`, `ROWS`, `rows`, `fillLine`, `sizedLine`, `neverLine`, `leftLine` (spec 8.2–8.4, 8.7) |
| `web/economics-figures.js` | Create (Task 10) | The Figures card's words and the typed figures: `foldsOf`, `foldHead`, `tagText`, `appliesText`, `noteParts`, `simText`, `sourcesLine`, `valuesOf`, `typed`, `boxText`, `savedText`, `partsLine`, `createDraft` (spec 8.5, 8.6, 6.3, 9.2) |
| `web/economics-page.js` | Create (Task 11) | `mount(container, { room, crop })` |
| `web/app.js` | Modify (Task 11, marked) | Mount the page under the strip |
| `web/styles.css` | Modify (Task 11, own block at the end) | `.ec-` styles, tokens only |
| `README.md`, `DESIGN.md`, `PRODUCT.md`, the spec | Modify (Task 12) | The Business paragraph and an Economics paragraph, the strip row and an Economics section, a capability row, "What shipped" (section 13) |
| `tests/…` | Create, modify | One or more per task; `tests/api-login.test.js` gains the Economics routes (Task 7); `tests/web-roles.test.js` names the page as the owner's (Task 11); `tests/web-route.test.js` seven tabs (Task 8); the version-25 asserts become 26 (Task 3) |

## Decisions this plan takes (the spec left them open)

| Decision | Why |
|---|---|
| Your runs, the Work it out body and the routes are three server files beside `server/economics.js` (`economics-runs.js`, `economics-sim.js`, `economics-api.js`) | Each has one job and its own test; the service composes them |
| The Figures card's words are their own module, `web/economics-figures.js`, beside `web/economics-math.js` | The two together would be one very long file; the comparison and the figures change for different reasons |
| `settleEconomicsSim` finds the row by room and crop, not by `simId` | A Work it out the simulation's checks refuse has no run (no `simId`) and still fails its row; there is one simulator row per room and crop |
| The view's `sim.status` is `'waiting'` while the run is queued (the row says `'working'`) | Spec 6.3's "Waiting for another simulation…" needs it; the row keeps the spec's three states |
| The view carries `machinesNote` (`roomMachines`' note: which machines are at Simulate's defaults) | Spec 9.3 says the note names them before the run |
| The phone's comparison is one small table a way (its name and profit as its head), not ARIA-roled blocks of one table | A real table a way reads right to a screen reader with no role overrides; the desk table is hidden on a phone (and the blocks on a desk) |
| Dates in the notes are farm time (`farmDate`, `farmTime`), not `formatDateTime` (the browser's zone) | As every other Business page; the same date on every device |
| `blockLife` is one export of the model, used by the model, the service and the page | One rule for a block's days |
| A pending energy day leaves the electricity per block from the next source with a `'pending'` note; the Harvest service's own usage warm (started by `roomView`) publishes `harvest` when done, which the page listens to | Harvest's `roomView` already warms the room's days back to its oldest run; a second warm in Economics would do the same work |
| `research` in a figure carries its `sources` and `note` too | The page's research note needs them (spec 8.6) |
| A block life over 90 days: the run takes 90 days and the kWh is scaled by the life the run was started for (kept in memory per run; after a restart, the run's own days) | No column holds the life; a run done across a restart is rare and then reads unscaled |
| A figure key of a way not shown for the crop is refused as "Unknown figure" | Nothing on the page can set it; it would only be noise |

---
## Part 1: the model and the figures (pure)

### Task 1: The model `web/economics-model.js`, with the golden test (spec 5, 11.1)

**Files:**
- Create: `web/economics-model.js`
- Test: `tests/economics-model.test.js`

The golden test feeds the model page's exact inputs (`research/lions-mane-economics.html` at its defaults, the custom cold room: yield 250.015 g = 161.3 × 1.55, 506 kWh a month for the cold room and 146 for the highland grower and the warm strain, tariff 0.551, landed price 41.1047 = 8.10 × 4.087 + 8, equipment 35,990 / 8,300 / 9,800) and must give its results to the sen: cold room RM 3,003.16 a month, break-even RM 38.23, payback with the first fill 13.37 months; highland RM 3,152.92, RM 37.64, 6.16 months.

- [ ] **Step 1: Write the failing test**

Create `tests/economics-model.test.js`:

```js
// The Economics model (web/economics-model.js, spec 2026-11-06-economics-design.md 5 and 11.1): a growing way, import and
// resell, the houses, the figures to a way's inputs and the comparison. The golden test feeds the model page's own inputs
// (research/lions-mane-economics.html at its defaults, the custom cold room) and must give its results to the sen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAYS_A_MONTH, blockLife, grow, trade, housesOf, inputsOf, compare } from '../web/economics-model.js';

const r2 = (v) => Math.round(v * 100) / 100;
// Every figure of `want` to 2 places (a nested object too); Infinity and null as they are.
function near(got, want, path = '') {
  for (const [k, v] of Object.entries(want)) {
    if (v !== null && typeof v === 'object') near(got[k], v, `${path}${k}.`);
    else if (typeof v === 'number' && Number.isFinite(v)) assert.equal(r2(got[k]), v, `${path}${k}`);
    else assert.equal(got[k], v, `${path}${k}`);
  }
}

// The model page's shared inputs and its cold room (section 11.1).
const SHARED = { price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, lifeMonths: 60 };
const GROW = { blocks: 1740, yieldG: 161.3 * 1.55, flushes: 2, loss: 10, first: 12, interval: 14, turn: 16, labourMin: 2.52, uphill: 0, rent: 0 };
const COLD = { ...SHARED, ...GROW, kwhMonth: 506, transport: 0, equipment: 18500 + 8580 + 3000 + 3300 + 2610 };
const HIGHLAND = { ...SHARED, ...GROW, kwhMonth: 146, transport: 2, equipment: 5000 + 1500 + 1800 };
const WARM = { ...SHARED, ...GROW, yieldG: 80 * 1.55, kwhMonth: 146, transport: 0, equipment: 5000 + 1500 + 3300 };
const IMPORT = { price: 50, shrink: 10, pack: 3, wage: 10, landed: 8.10 * 4.087 + 8, buyHours: 2, rent: 0 };

test('golden: the cold room gives the model page\'s RM 3,003.16 a month, break-even RM 38.23, payback 13.37 months', () => {
  assert.equal(DAYS_A_MONTH, 30.4);
  near(grow(COLD), {
    life: 42, blocksM: 1259.43, kgSold: 255.05, income: 12752.48,
    cost: { blocks: 7556.57, electricity: 298.81, labour: 528.96, packing: 765.15, transport: 0, rent: 0, writeOff: 599.83 },
    costs: 9749.32, profit: 3003.16, be: 38.23, equipment: 35990, fill: 10440, rampCost: 326.75, payback: 9.99, paybackAll: 13.37,
  });
});

test('golden: the highland grower makes RM 3,152.92, break-even RM 37.64, payback 6.16 months', () => {
  near(grow(HIGHLAND), {
    blocksM: 1259.43, kgSold: 255.05, income: 12752.48,
    cost: { blocks: 7556.57, electricity: 100.45, labour: 528.96, packing: 765.15, transport: 510.10, rent: 0, writeOff: 138.33 },
    costs: 9599.56, profit: 3152.92, be: 37.64, equipment: 8300, fill: 10440, rampCost: 248.45, payback: 2.52, paybackAll: 6.16,
  });
});

test('golden: the warm strain loses RM 2,403.95 and never pays back', () => {
  near(grow(WARM), {
    kgSold: 126.50, income: 6324.85,
    cost: { blocks: 7556.57, electricity: 100.45, labour: 528.96, packing: 379.49, transport: 0, rent: 0, writeOff: 163.33 },
    costs: 8728.80, profit: -2403.95, be: 69.00, equipment: 9800, fill: 10440, rampCost: 248.45, payback: Infinity, paybackAll: Infinity,
  });
});

test('golden: import and resell sells the cold room\'s kg and loses RM 269.27, break-even RM 51.06', () => {
  const cold = grow(COLD);
  near(trade(IMPORT, cold.kgSold), {
    kgBought: 283.39, kgSold: 255.05, income: 12752.48,
    cost: { blocks: 11648.60, electricity: 0, labour: 608, packing: 765.15, transport: 0, rent: 0, writeOff: 0 },
    costs: 13021.75, profit: -269.27, be: 51.06, equipment: 0, payback: null, paybackAll: null,
  });
});

test('grow: nothing sold has no break-even; a loss or a payback past the write-off never pays back; no equipment pays back at once', () => {
  const none = grow({ ...COLD, yieldG: 0 });
  assert.equal(none.kgSold, 0);
  assert.equal(none.be, null);
  assert.equal(none.payback, Infinity);
  const slow = grow({ ...COLD, equipment: 3602.99 * 61 }); // op 3,602.99 a month: 61 months is past the 60
  assert.equal(slow.payback, Infinity);
  assert.equal(slow.paybackAll, Infinity);
  const free = grow({ ...COLD, equipment: 0 });
  assert.equal(free.payback, 0);
  assert.equal(r2(free.paybackAll), 3.38, 'the first fill and the wait still counted');
  assert.equal(grow({ ...COLD, flushes: 1 }).life, 28, 'one flush: no interval');
  assert.equal(blockLife({ first: 12, interval: 14, flushes: 2, turn: 16 }), 42);
});

test('housesOf: a house holds up to 2,000 blocks, at least one', () => {
  assert.deepEqual([housesOf(1), housesOf(2000), housesOf(2001), housesOf(0)], [1, 1, 2, 1]);
});

// The figures as the page holds them (key → value), at the model page's inputs.
const VALUES = {
  price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60,
  'yours.blocks': 1740, 'yours.yieldG': 250.015, 'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14,
  'yours.turn': 16, 'yours.kwhBlock': 0.4, 'yours.labourMin': 2.52, 'yours.transport': 0, 'yours.rent': 0,
  'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
  'highland.yieldG': 250.015, 'highland.flushes': 2, 'highland.loss': 10, 'highland.first': 12, 'highland.interval': 14,
  'highland.turn': 16, 'highland.labourMin': 2.52, 'highland.transport': 2, 'highland.rent': 0, 'highland.uphill': 0.5,
  'highland.kwhHouse': 146, 'highland.house': 5000, 'highland.humidifier': 1500, 'highland.fans': 1800,
  'import.landed': 41.1047, 'import.buyHours': 2, 'import.rent': 0,
};

test('inputsOf: your container\'s kWh a month from kWh per block, its equipment summed; a house way per house; import its own', () => {
  const yours = inputsOf(VALUES, 'yours');
  assert.equal(yours.kwhMonth, 0.4 * 1740 * 30.4 / 42);
  assert.equal(yours.equipment, 35990);
  assert.deepEqual([yours.lifeMonths, yours.uphill, yours.blocks, yours.yieldG], [60, 0, 1740, 250.015]);
  const two = inputsOf({ ...VALUES, 'yours.blocks': 2001 }, 'highland');
  assert.deepEqual([two.kwhMonth, two.equipment, two.uphill, two.transport], [292, 16600, 0.5, 2]);
  assert.deepEqual(inputsOf(VALUES, 'import'), { price: 50, shrink: 10, pack: 3, wage: 10, landed: 41.1047, buyHours: 2, rent: 0 });
});

test('compare: your container first, import selling your kg sold', () => {
  const out = compare(VALUES, ['yours', 'highland', 'import']);
  assert.deepEqual(out.map((r) => r.way), ['yours', 'highland', 'import']);
  assert.equal(out[2].kgSold, out[0].kgSold);
  assert.equal(out[2].kind, 'trade');
  assert.equal(out[1].kind, 'grow');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-model.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `web/economics-model.js`.

- [ ] **Step 3: Write the model**

Create `web/economics-model.js`:

```js
// The Economics model (spec 2026-11-06-economics-design.md 5): the port of research/lions-mane-economics.html's model(), a
// month of one way to grow (Your container, Lowland shed, Highland grower, Warm strain) or to buy in and resell. Pure: no
// DOM, no fetch, no clock. The page works the money out with it on every change; stage 2 reuses it.
//   blockLife(x) · grow(x) · trade(x, kgSold) · housesOf(blocks) · inputsOf(values, way) · compare(values, ways)

export const DAYS_A_MONTH = 30.4;
export const HOUSE_BLOCKS = 2000; // a shed, a highland house or a warm-strain shed holds up to this many blocks

const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// The days a block holds its place: to its first harvest, between its flushes, then its rest and turnaround.
export const blockLife = (x) => x.first + x.interval * Math.max(0, x.flushes - 1) + x.turn;

// A growing way's month. x: { blocks, yieldG, flushes, loss, first, interval, turn, shrink, price, blockPrice, uphill,
// kwhMonth, tariff, fixedTnb, labourMin, wage, pack, transport, rent, equipment, lifeMonths }. be: RM a kg (null with no kg
// sold); a payback that never comes is Infinity.
export function grow(x) {
  const life = blockLife(x);
  const blocksM = (x.blocks * DAYS_A_MONTH) / life;
  const kgSold = ((blocksM * (1 - x.loss / 100) * x.yieldG) / 1000) * (1 - x.shrink / 100);
  const income = kgSold * x.price;
  const writeOff = x.equipment / x.lifeMonths;
  const cost = {
    blocks: blocksM * (x.blockPrice + x.uphill),
    electricity: x.kwhMonth * x.tariff + x.fixedTnb,
    labour: ((blocksM * x.labourMin) / 60) * x.wage,
    packing: kgSold * x.pack,
    transport: kgSold * x.transport,
    rent: x.rent,
    writeOff,
  };
  const costs = sum(cost);
  const profit = income - costs;
  const op = profit + writeOff; // before the write-off: what pays the equipment back
  const fill = x.blocks * (x.blockPrice + x.uphill);
  const rampM = x.first / DAYS_A_MONTH;
  const rampCost = (cost.electricity + cost.labour + cost.rent) * rampM;
  const within = (months) => (op > 0 && months <= x.lifeMonths ? months : Infinity);
  return {
    kind: 'grow', life, blocksM, kgSold, income, cost, costs, profit, op, be: kgSold > 0 ? costs / kgSold : null,
    equipment: x.equipment, fill, rampM, rampCost, kwhMonth: x.kwhMonth,
    payback: within(x.equipment / op), paybackAll: within(rampM + (x.equipment + fill + rampCost) / op),
  };
}

// Import and resell: kgSold (your container's) bought in at the landed price. x: { price, shrink, pack, wage, landed,
// buyHours, rent }. No equipment: payback null ("No equipment").
export function trade(x, kgSold) {
  const kgBought = kgSold / (1 - x.shrink / 100);
  const income = kgSold * x.price;
  const cost = {
    blocks: kgBought * x.landed, electricity: 0, labour: x.buyHours * DAYS_A_MONTH * x.wage, packing: kgSold * x.pack,
    transport: 0, rent: x.rent, writeOff: 0,
  };
  const costs = sum(cost);
  return {
    kind: 'trade', kgBought, kgSold, income, cost, costs, profit: income - costs, be: kgSold > 0 ? costs / kgSold : null,
    equipment: 0, payback: null, paybackAll: null,
  };
}

export const housesOf = (blocks) => Math.max(1, Math.ceil(blocks / HOUSE_BLOCKS));

const SHARED = ['price', 'shrink', 'pack', 'blockPrice', 'tariff', 'fixedTnb', 'wage'];
const GROWING = ['yieldG', 'flushes', 'loss', 'first', 'interval', 'turn', 'labourMin', 'transport', 'rent'];
const YOUR_EQUIPMENT = ['container', 'cooling', 'humidifier', 'fans', 'racks'];
const HOUSE_EQUIPMENT = ['house', 'humidifier', 'fans'];

// values: every figure's value by its key (section 4.2: 'price', 'yours.yieldG', 'shed.house', …). → that way's x.
export function inputsOf(values, way) {
  if (way === 'import') {
    return {
      price: values.price, shrink: values.shrink, pack: values.pack, wage: values.wage,
      landed: values['import.landed'], buyHours: values['import.buyHours'], rent: values['import.rent'],
    };
  }
  const own = (k) => values[`${way}.${k}`];
  const x = {
    ...Object.fromEntries(SHARED.map((k) => [k, values[k]])), lifeMonths: values.life, blocks: values['yours.blocks'],
    ...Object.fromEntries(GROWING.map((k) => [k, own(k)])), uphill: way === 'highland' ? own('uphill') : 0,
  };
  if (way === 'yours') {
    x.kwhMonth = (own('kwhBlock') * x.blocks * DAYS_A_MONTH) / blockLife(x);
    x.equipment = YOUR_EQUIPMENT.reduce((s, k) => s + own(k), 0);
  } else {
    const houses = housesOf(x.blocks);
    x.kwhMonth = own('kwhHouse') * houses;
    x.equipment = HOUSE_EQUIPMENT.reduce((s, k) => s + own(k), 0) * houses;
  }
  return x;
}

// Every shown way's month, Your container first ('yours' must be in ways): [{ way, ...grow or trade }]. Import sells Your
// container's kg (the model page's rule: the same volume, bought in).
export function compare(values, ways) {
  const yours = grow(inputsOf(values, 'yours'));
  return ['yours', ...ways.filter((w) => w !== 'yours')].map((way) => ({
    way, ...(way === 'yours' ? yours : way === 'import' ? trade(inputsOf(values, way), yours.kgSold) : grow(inputsOf(values, way))),
  }));
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-model.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add web/economics-model.js tests/economics-model.test.js
git commit -m "Economics: the model (a growing way, import and resell, the houses, the figures to a way's inputs, the comparison), the port of the lion's mane model page; the golden test gives its RM 3,003.16 and RM 3,152.92"
```

---

### Task 2: The figures and their research defaults `web/economics-defaults.js` (spec 4, 11.2; appendix 1, 6)

**Files:**
- Create: `web/economics-defaults.js`
- Test: `tests/economics-defaults.test.js`

Every figure of section 4.2 (key, label, unit, scope, range, whole, way), the ways per crop (4.1), the research default of every figure for every crop (appendix section 1) and the room-size rules (appendix 1.4), and the sources (appendix section 6, a short title each). The test works every crop and shown way at the defaults in a 40 ft container (67.4 m³, humidifier 2 L/h, 1,482 blocks, Settings' electricity price 0.55) and must give the spec's table 11.2.

- [ ] **Step 1: Write the failing test**

Create `tests/economics-defaults.test.js`:

```js
// The Economics figures and defaults (web/economics-defaults.js, spec 2026-11-06-economics-design.md 4 and 11.2): every
// crop and shown way worked at the research defaults in a 40 ft container, the figures' ranges and words, the room-size rules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECONOMICS_CROPS, WAYS, LEFT, FIGURES, figureOf, figuresFor, placeOf, checkFigure, researchOf, sizeOf, SOURCES,
} from '../web/economics-defaults.js';
import { compare } from '../web/economics-model.js';

const ROOM = { volume: 67.4, humidifierLH: 2 }; // a 40 ft container (section 11.2)
const r2 = (v) => Math.round(v * 100) / 100;

// Every figure of the crop at its research default, the electricity price Settings' default 0.55.
function researchValues(crop, room = ROOM) {
  const blocks = researchOf('yours.blocks', crop, room, null).value;
  return Object.fromEntries(figuresFor(crop).map((f) => [f.key, f.key === 'tariff' ? 0.55 : researchOf(f.key, crop, room, blocks).value]));
}

// [way, kg sold, income, costs, profit, break-even, equipment, payback, payback with the first fill] (null: never)
const TABLE = {
  oyster: [
    ['yours', 161.29, 1612.85, 3013.23, -1400.38, 18.68, 52977.40, null, null],
    ['shed', 72.76, 727.60, 1541.78, -814.18, 21.19, 6800, null, null],
  ],
  pink: [
    ['yours', 308.16, 6163.22, 6398.20, -234.97, 20.76, 52977.40, null, null],
    ['shed', 121.64, 2432.85, 3190.46, -757.61, 26.23, 6800, null, null],
  ],
  woodear: [
    ['yours', 120.47, 3011.81, 2852.24, 159.56, 23.68, 52977.40, 50.82, 55.27],
    ['shed', 76.23, 1905.73, 1890.74, 15.00, 24.80, 6800, 52.99, null],
    ['import', 120.47, 3011.81, 2370.48, 641.32, 19.68, 0, 'none', 'none'],
  ],
  lionsmane: [
    ['yours', 217.22, 10860.94, 8677.25, 2183.70, 39.95, 52977.40, 17.28, 20.66],
    ['highland', 217.22, 10860.94, 8211.37, 2649.57, 37.80, 8300, 2.98, 6.64],
    ['import', 217.22, 10860.94, 11121.39, -260.45, 51.20, 0, 'none', 'none'],
    ['warm', 107.74, 5387.03, 7473.50, -2086.47, 69.37, 9800, null, null],
  ],
};
const months = (v) => (v === null ? 'none' : Number.isFinite(v) ? r2(v) : null);

for (const crop of ECONOMICS_CROPS) {
  test(`11.2: ${crop} at the research defaults in a 40 ft container`, () => {
    const out = compare(researchValues(crop), WAYS[crop]);
    assert.deepEqual(out.map((o) => o.way), TABLE[crop].map((row) => row[0]));
    out.forEach((o, i) => {
      const [, kg, income, costs, profit, be, equipment, payback, all] = TABLE[crop][i];
      assert.deepEqual(
        [r2(o.kgSold), r2(o.income), r2(o.costs), r2(o.profit), r2(o.be), r2(o.equipment), months(o.payback), months(o.paybackAll)],
        [kg, income, costs, profit, be, equipment, payback, all], `${crop} ${o.way}`,
      );
    });
  });
}

test('11.2: import buys 128.16 kg of black jelly and 241.35 kg of lion\'s mane a month', () => {
  assert.equal(r2(compare(researchValues('woodear'), WAYS.woodear)[2].kgBought), 128.16);
  assert.equal(r2(compare(researchValues('lionsmane'), WAYS.lionsmane)[2].kgBought), 241.35);
});

test('every figure of every crop\'s shown ways has a default inside its own range and the figure\'s limits, a confidence and known sources', () => {
  for (const crop of ECONOMICS_CROPS) {
    for (const f of figuresFor(crop)) {
      const d = researchOf(f.key, crop, ROOM, 1482);
      assert.ok(d, `${crop} ${f.key} has a default`);
      assert.ok(d.low <= d.value && d.value <= d.high, `${crop} ${f.key}: ${d.low} ≤ ${d.value} ≤ ${d.high}`);
      assert.ok(d.value >= f.min && d.value <= f.max, `${crop} ${f.key} inside ${f.min}–${f.max}`);
      assert.ok(['high', 'medium', 'low'].includes(d.confidence), `${crop} ${f.key} confidence`);
      for (const s of d.sources) assert.ok(SOURCES[s], `${crop} ${f.key}: source ${s} is known`);
      if (!f.settings) assert.equal(checkFigure(f.key, d.value), null, `${crop} ${f.key} passes its own check`);
    }
  }
});

test('the figures: the shared ones, Your container\'s, then each shown way\'s; scopes saved as room 0 and crop \'\' for every', () => {
  assert.deepEqual([...new Set(figuresFor('lionsmane').map((f) => f.way))], ['shared', 'yours', 'highland', 'warm', 'import']);
  assert.deepEqual([...new Set(figuresFor('oyster').map((f) => f.way))], ['shared', 'yours', 'shed']);
  assert.ok(figuresFor('lionsmane').some((f) => f.key === 'highland.uphill'));
  assert.ok(!figuresFor('lionsmane').some((f) => f.key === 'warm.uphill'));
  assert.equal(FIGURES.length, new Set(FIGURES.map((f) => f.key)).size, 'keys are unique');
  assert.deepEqual(placeOf('price', 3, 'pink'), { roomId: 0, crop: 'pink' });
  assert.deepEqual(placeOf('wage', 3, 'pink'), { roomId: 0, crop: '' });
  assert.deepEqual(placeOf('yours.rent', 3, 'pink'), { roomId: 3, crop: '' });
  assert.deepEqual(placeOf('yours.yieldG', 3, 'pink'), { roomId: 3, crop: 'pink' });
  assert.deepEqual(placeOf('shed.yieldG', 3, 'pink'), { roomId: 0, crop: 'pink' });
  assert.deepEqual(LEFT.lionsmane, [{ way: 'shed', reason: 'warm-strain' }]);
});

test('checkFigure: a number in range passes; out of range, not a number or not whole is refused in the Settings rule\'s words', () => {
  assert.equal(checkFigure('price', 55), null);
  assert.equal(checkFigure('price', 1001), 'Selling price must be a number from 0 to 1000 RM/kg');
  assert.equal(checkFigure('price', '55'), 'Selling price must be a number from 0 to 1000 RM/kg');
  assert.equal(checkFigure('yours.blocks', 1.5), 'Blocks in the room must be a whole number from 1 to 100000 blocks');
  assert.equal(checkFigure('yours.flushes', 0), 'Flushes per block must be a whole number from 1 to 10');
  assert.equal(checkFigure('yours.loss', 100), 'Blocks lost must be a number from 0 to 90 %');
  assert.equal(checkFigure('yours.loss', 90), null);
  assert.equal(checkFigure('tariff', 0.6), 'Electricity price is set in Settings');
  assert.equal(checkFigure('nope', 1), 'Unknown figure');
  assert.equal(figureOf('nope'), null);
});

test('the room-size rules: a 20 ft up to 40 m³, a 40 ft above; humidifiers per 6 L/h; racks per block; blocks from the volume', () => {
  const small = { volume: 40, humidifierLH: 7 };
  assert.deepEqual([sizeOf(small), sizeOf(ROOM)], ['20 ft', '40 ft']);
  assert.deepEqual([researchOf('yours.container', 'oyster', small, 1).value, researchOf('yours.container', 'oyster', ROOM, 1).value], [24550, 38100]);
  assert.deepEqual([researchOf('yours.cooling', 'oyster', small, 1).value, researchOf('yours.cooling', 'oyster', ROOM, 1).value], [4520, 9040]);
  assert.equal(researchOf('yours.humidifier', 'oyster', small, 1).value, 3000, '7 L/h: two humidifiers');
  assert.equal(researchOf('yours.humidifier', 'oyster', { volume: 30, humidifierLH: 0 }, 1).value, 1500, 'at least one');
  assert.equal(researchOf('yours.racks', 'oyster', ROOM, 1482).value, 1037.4);
  assert.equal(researchOf('yours.blocks', 'oyster', ROOM, null).value, 1482);
  assert.equal(researchOf('yours.blocks', 'oyster', small, null).value, 880);
  assert.equal(researchOf('import.landed', 'oyster', ROOM, 1), null, 'grey oyster is not imported');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-defaults.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `web/economics-defaults.js`.

- [ ] **Step 3: Write the figures and defaults**

Create `web/economics-defaults.js`:

```js
// The Economics figures and their research defaults (spec 2026-11-06-economics-design.md 4; the research appendix
// 2026-11-06-economics-defaults.md, section 1, gives every value, range, confidence and source). Pure: imported by the farm
// server (which resolves each figure's source) and by the page (which checks a typed figure before it is sent).
//   ECONOMICS_CROPS · WAYS · LEFT · WAY_NAMES · FIGURES · figureOf(key) · figuresFor(crop) · placeOf(key, roomId, crop)
//   checkFigure(key, value) · researchOf(key, crop, room, blocks) · SOURCES

// The crops the owner named (spec 1), in the Crop select's order.
export const ECONOMICS_CROPS = ['oyster', 'pink', 'woodear', 'lionsmane'];

// The ways compared per crop, Your container first (spec 4.1), and the ways left out with the reason the page words.
export const WAYS = {
  oyster: ['yours', 'shed'],
  pink: ['yours', 'shed'],
  woodear: ['yours', 'shed', 'import'],
  lionsmane: ['yours', 'highland', 'import', 'warm'],
};
export const LEFT = {
  oyster: [{ way: 'highland', reason: 'too-cool' }, { way: 'import', reason: 'not-imported' }],
  pink: [{ way: 'highland', reason: 'too-cool' }, { way: 'import', reason: 'not-imported' }],
  woodear: [{ way: 'highland', reason: 'too-cool' }],
  lionsmane: [{ way: 'shed', reason: 'warm-strain' }],
};
export const WAY_NAMES = { yours: 'Your container', shed: 'Lowland shed', highland: 'Highland grower', import: 'Import and resell', warm: 'Warm strain' };

// A figure: key, label, unit (the box's suffix and the refusal's), scope ('farm', 'crop', 'room', 'roomCrop': where it is
// saved, spec 4.2), its range, whole (a whole number), way ('shared' or the way it belongs to) and settings (read from
// Settings, never set here).
const fig = (key, label, unit, scope, min, max, whole = false) => ({
  key, label, unit, scope, min, max, whole, way: key.includes('.') ? key.slice(0, key.indexOf('.')) : 'shared',
});
const MONEY_MAX = 10_000_000;
const RENT_MAX = 1_000_000;
// The figures of a growing way other than your container (a shed, a highland house, a warm-strain shed), per house.
const houseWay = (way) => [
  fig(`${way}.yieldG`, 'Yield per good block, all flushes', 'g', 'crop', 0, 5000),
  fig(`${way}.flushes`, 'Flushes per block', '', 'crop', 1, 10, true),
  fig(`${way}.loss`, 'Blocks lost', '%', 'crop', 0, 90),
  fig(`${way}.first`, 'Days to first harvest', 'days', 'crop', 1, 120, true),
  fig(`${way}.interval`, 'Days between flushes', 'days', 'crop', 1, 120, true),
  fig(`${way}.turn`, 'Rest and turnaround', 'days', 'crop', 0, 120, true),
  fig(`${way}.kwhHouse`, 'Fans and humidifier electricity, per house', 'kWh a month', 'crop', 0, 10_000),
  fig(`${way}.labourMin`, 'Labour per block handled', 'min', 'crop', 0, 600),
  fig(`${way}.transport`, 'Transport to buyers', 'RM/kg', 'crop', 0, 100),
  ...(way === 'highland' ? [fig('highland.uphill', 'Block freight up to the highlands', 'RM a block', 'crop', 0, 100)] : []),
  fig(`${way}.rent`, 'Rent', 'RM a month', 'crop', 0, RENT_MAX),
  fig(`${way}.house`, 'House and racks, per house', 'RM', 'crop', 0, MONEY_MAX),
  fig(`${way}.humidifier`, 'Humidifier or misting, per house', 'RM', 'crop', 0, MONEY_MAX),
  fig(`${way}.fans`, 'Fans, controller and wiring, per house', 'RM', 'crop', 0, MONEY_MAX),
];
export const FIGURES = [
  fig('price', 'Selling price', 'RM/kg', 'crop', 0, 1000),
  fig('shrink', 'Shrink, harvest to sale', '%', 'crop', 0, 90),
  fig('pack', 'Packing and delivery', 'RM/kg', 'crop', 0, 100),
  fig('blockPrice', 'Block price, ready to fruit', 'RM a block', 'crop', 0, 100),
  { ...fig('tariff', 'Electricity price', 'RM/kWh', 'farm', 0, 10), settings: true },
  fig('fixedTnb', 'Electricity fixed charge', 'RM a month', 'farm', 0, 1000),
  fig('wage', 'Labour cost', 'RM an hour', 'farm', 0, 200),
  fig('life', 'Equipment written off over', 'months', 'farm', 1, 240, true),
  fig('yours.blocks', 'Blocks in the room', 'blocks', 'room', 1, 100_000, true),
  fig('yours.yieldG', 'Yield per good block, all flushes', 'g', 'roomCrop', 0, 5000),
  fig('yours.flushes', 'Flushes per block', '', 'roomCrop', 1, 10, true),
  fig('yours.loss', 'Blocks lost', '%', 'roomCrop', 0, 90),
  fig('yours.first', 'Days to first harvest', 'days', 'roomCrop', 1, 120, true),
  fig('yours.interval', 'Days between flushes', 'days', 'roomCrop', 1, 120, true),
  fig('yours.turn', 'Rest and turnaround', 'days', 'roomCrop', 0, 120, true),
  fig('yours.kwhBlock', 'Electricity per block, over its life', 'kWh', 'roomCrop', 0, 100),
  fig('yours.labourMin', 'Labour per block handled', 'min', 'roomCrop', 0, 600),
  fig('yours.transport', 'Transport to buyers', 'RM/kg', 'roomCrop', 0, 100),
  fig('yours.rent', 'Rent', 'RM a month', 'room', 0, RENT_MAX),
  fig('yours.container', 'Container, delivered', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.cooling', 'Cooling, fitted', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.humidifier', 'Humidifier', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.fans', 'Fans, controller and wiring', 'RM', 'room', 0, MONEY_MAX),
  fig('yours.racks', 'Racks', 'RM', 'room', 0, MONEY_MAX),
  ...houseWay('shed'),
  ...houseWay('highland'),
  ...houseWay('warm'),
  fig('import.landed', 'Landed price', 'RM/kg', 'crop', 0, 1000),
  fig('import.buyHours', 'Trading labour', 'hours a day', 'crop', 0, 24),
  fig('import.rent', 'Rent', 'RM a month', 'crop', 0, RENT_MAX),
];
const BY_KEY = new Map(FIGURES.map((f) => [f.key, f]));
export const figureOf = (key) => BY_KEY.get(key) ?? null;

// The figures of a crop's shown ways: the shared ones, Your container's, then each other shown way's.
export const figuresFor = (crop) => FIGURES.filter((f) => f.way === 'shared' || WAYS[crop].includes(f.way));

// Where a figure of room roomId and crop is saved (spec 3): room_id 0 and crop '' mean "every".
export function placeOf(key, roomId, crop) {
  const { scope } = figureOf(key);
  return { roomId: scope === 'room' || scope === 'roomCrop' ? roomId : 0, crop: scope === 'crop' || scope === 'roomCrop' ? crop : '' };
}

// null when value is a figure the key may take, else the refusal (spec 4.2, the Settings rule's words).
export function checkFigure(key, value) {
  const f = figureOf(key);
  if (!f) return 'Unknown figure';
  if (f.settings) return `${f.label} is set in Settings`;
  const ok = typeof value === 'number' && Number.isFinite(value) && value >= f.min && value <= f.max && (!f.whole || Number.isInteger(value));
  return ok ? null : `${f.label} must be ${f.whole ? 'a whole number' : 'a number'} from ${f.min} to ${f.max}${f.unit ? ` ${f.unit}` : ''}`;
}

// ---- The research defaults (appendix section 1) ----
// r(value, low, high, confidence, sources, note): one default; a figure's entry is one for every crop or one per crop.
const r = (value, low, high, confidence, sources, note = '') => ({ value, low, high, confidence, sources, note });
const perCrop = (entries) => ({ perCrop: entries });
const LIONS_42 = 'Set so the block life is the owner\'s earlier 42 days (35–56)';
// The highland grower's and the warm strain's block life and handling (lion's mane only; appendix 1.6 and 1.7).
const LIONS_HOUSE = {
  flushes: r(2, 1, 3, 'low', ['L01', 'L13', 'L28'], 'First flush largest; a 42-day block life, assumed'),
  loss: r(10, 5, 25, 'low', ['L01']),
  first: r(12, 10, 14, 'low', ['L01', 'L02', 'L06'], 'A 42-day block life, assumed'),
  interval: r(14, 10, 18, 'low', ['L01', 'L15'], '"14 days apart"'),
  turn: r(16, 9, 30, 'low', ['L01'], LIONS_42),
  labourMin: r(2.52, 1.26, 5.04, 'low', ['L01'], '1 h per 1,000 blocks a day over 42 days'),
  rent: r(0, 0, 4000, 'low', ['L01']),
  house: r(5000, 1300, 10_000, 'low', ['L01', 'G20', 'G21', 'G22', 'G23']),
  humidifier: r(1500, 900, 3000, 'low', ['L01', 'S42']),
};
const SHED = {
  'shed.yieldG': perCrop({
    oyster: r(170, 100, 300, 'medium', ['S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S15', 'G07'], 'Farm data 100–150 g; guides 250–640 g; a Jerantut grower\'s 400 g is an outlier'),
    pink: r(150, 80, 250, 'low', ['P06', 'P07', 'P17', 'P24', 'P29'], 'Malaysian guides 50–150 g a 1 kg bag'),
    woodear: r(180, 120, 250, 'medium', ['J02', 'J03', 'J06'], 'Malaysian guide 150–200 g a 1 kg bag; UPM 83–131 g over 3 flushes'),
  }),
  'shed.flushes': perCrop({
    oyster: r(6, 4, 8, 'medium', ['S06', 'S07', 'S15']),
    pink: r(3, 2, 5, 'low', ['P06', 'P08', 'P16', 'P30']),
    woodear: r(4, 3, 5, 'medium', ['J05', 'J06', 'J26']),
  }),
  'shed.loss': perCrop({
    oyster: r(10, 5, 50, 'low', ['S07', 'S44'], 'About half fruit in the first flush'),
    pink: r(10, 5, 20, 'low', ['P02'], 'Grey\'s'),
    woodear: r(15, 10, 25, 'low', ['J07', 'J26'], 'Less tolerant of contamination than oyster'),
  }),
  'shed.first': perCrop({
    oyster: r(7, 4, 14, 'medium', ['S06', 'P08', 'P16']),
    pink: r(7, 4, 14, 'medium', ['S06', 'P08', 'P16']),
    woodear: r(18, 12, 30, 'medium', ['J06', 'J21', 'J24', 'J26']),
  }),
  'shed.interval': perCrop({
    oyster: r(14, 10, 20, 'medium', ['S06']),
    pink: r(12, 7, 15, 'medium', ['P04', 'P24']),
    woodear: r(20, 14, 30, 'medium', ['J21', 'J26']),
  }),
  'shed.turn': perCrop({
    oyster: r(13, 5, 40, 'low', ['S07', 'S47'], 'Set so the block life is 90 days (75–120)'),
    pink: r(14, 2, 50, 'low', ['P06', 'P07', 'P24'], 'Set so the block life is 45 days (30–84)'),
    woodear: r(7, 3, 40, 'low', ['J02', 'J03', 'J24'], 'Block life 85 days (60–120)'),
  }),
  'shed.kwhHouse': r(60, 0, 150, 'low', ['S07', 'G27'], 'Estimate: a misting pump and two fans'),
  'shed.labourMin': perCrop({
    oyster: r(4.05, 2.16, 21.6, 'low', ['S07', 'G07', 'G24'], '0.75 h per 1,000 blocks a day over 90 days; range 0.4–4 h'),
    pink: r(2.03, 1.35, 10.8, 'low', ['S07', 'G07'], 'Over 45 days'),
    woodear: r(3.83, 2.55, 20.4, 'low', ['J02', 'G07'], 'Over 85 days; misting 3–4 times a day'),
  }),
  'shed.transport': r(0, 0, 2, 'low', [], 'No source; a lowland farm near the Klang Valley. Enter your own'),
  'shed.rent': r(0, 0, 4000, 'low', ['L01']),
  'shed.house': r(5000, 1300, 10_000, 'low', ['G20', 'G21', 'G22', 'G23', 'G26'], 'RM 2.50 a block of room (0.65–5.00)'),
  'shed.humidifier': r(1500, 500, 3000, 'low', ['G27'], 'A shop quote of nearly RM 1,500 (2009)'),
  'shed.fans': r(300, 150, 2400, 'low', ['G28'], 'Estimate for one or two fans'),
};
const HIGHLAND = {
  'highland.yieldG': r(250, 150, 400, 'low', ['L01', 'L16'], 'Copies your container\'s although Cameron Highlands averages 17.9 °C, just below 18–24 °C'),
  ...Object.fromEntries(Object.entries(LIONS_HOUSE).map(([k, v]) => [`highland.${k}`, v])),
  'highland.kwhHouse': r(146, 126, 146, 'low', ['L37'], 'Fans 120 W all day (88 kWh) + a 2 L/h humidifier (58 kWh)'),
  'highland.transport': r(2, 1, 4, 'low', [], 'Placeholder to Klang Valley buyers; no source'),
  'highland.uphill': r(0, 0, 1, 'low', [], 'Placeholder; no source'),
  'highland.fans': r(1800, 900, 3000, 'low', ['L01'], 'No controller'),
};
const WARM = {
  'warm.yieldG': r(124, 93, 155, 'low', ['L02', 'L17', 'L28'], 'An assumed 80 g first flush (60–100) × 1.55, below Perak\'s "can reach" 150 g'),
  ...Object.fromEntries(Object.entries(LIONS_HOUSE).map(([k, v]) => [`warm.${k}`, v])),
  'warm.kwhHouse': r(146, 126, 146, 'low', ['L37'], 'As the highland grower\'s'),
  'warm.transport': r(0, 0, 2, 'low', []),
  'warm.fans': r(3300, 1700, 7500, 'low', ['L01']),
};
const RESEARCH = {
  tariff: r(0.5515, 0.515, 0.596, 'medium', ['L18', 'L19', 'G01', 'G19'], 'LV non-domestic 50.68 sen + AFA 3.60 sen (Nov 2026) × 1.016 (KWTBB)'),
  fixedTnb: r(20, 10, 20, 'medium', ['L18', 'S35'], 'RM 10 on the Specific Agriculture tariff if the farm qualifies (unverified)'),
  wage: r(10, 8.72, 12, 'medium', ['L21', 'G17', 'G18'], 'RM 8.72/h minimum plus about 15 % employer contributions'),
  life: r(60, 36, 96, 'low', ['L01'], 'The owner\'s earlier estimate; no interest'),
  price: perCrop({
    oyster: r(10, 8, 13, 'high', ['S12', 'S14', 'S15', 'S16', 'G04'], 'Farm-gate and wholesale; retail RM 16 (12–25)'),
    pink: r(20, 14, 45, 'low', ['P01', 'P03', 'P14', 'P21', 'P22'], 'No Malaysian pink wholesale price; coloured-oyster farm-gate RM 16'),
    woodear: r(25, 15, 30, 'medium', ['J01', 'J02', 'J08', 'J10', 'J11'], 'Growers quote RM 30; Chinese fresh black fungus at RM 18–24 retail caps what buyers pay'),
    lionsmane: r(50, 30, 70, 'low', ['L01', 'L02', 'L03', 'L05', 'L09', 'G10'], 'The owner\'s earlier estimate, between import (about RM 33) and farm-direct (RM 70, Perak)'),
  }),
  shrink: perCrop({
    oyster: r(5, 2, 15, 'low', ['S06'], 'Estimate; 3–4 days at 5–8 °C'),
    pink: r(10, 5, 25, 'low', ['P25', 'P26', 'P35'], 'About 24–36 h at room temperature, about 4 days chilled'),
    woodear: r(6, 3, 12, 'low', ['J21', 'J32'], 'Keeps 2–5 days at ambient, about 7 at 4 °C'),
    lionsmane: r(10, 5, 20, 'low', ['L01', 'L02'], 'A week in the fridge, two hours outside'),
  }),
  pack: perCrop({
    oyster: r(0.5, 0.2, 2, 'low', ['G09', 'G29', 'G30'], 'Wholesale bags about RM 0.20/kg; retail punnets about RM 2.00/kg'),
    pink: r(1.5, 0.8, 3, 'low', ['P09', 'P21', 'G29'], 'Estimate: small chilled punnets, frequent drops'),
    woodear: r(0.8, 0.5, 1.5, 'low', ['J08', 'G29'], 'Estimate: sold in 200 g trays'),
    lionsmane: r(3, 1.5, 5, 'low', ['L01'], 'The owner\'s earlier estimate; cold chain'),
  }),
  blockPrice: perCrop({
    oyster: r(2, 1.5, 2.8, 'medium', ['S01', 'S03', 'S47', 'G05'], 'Pontian seller RM 2.80 / 2.50 / 2.30 by quantity; own-made about RM 1.00'),
    pink: r(2.5, 2, 4.5, 'low', ['P03', 'P04', 'P05', 'P19', 'P20'], 'Online small orders RM 3.50–4.50; own-made about RM 1.00'),
    woodear: r(2.5, 2, 3.5, 'low', ['J19', 'J24', 'J25'], 'Not found: oyster blocks plus a premium; own-made about RM 1.30'),
    lionsmane: r(6, 3, 10, 'low', ['L01', 'L10', 'L36', 'G10'], 'No Malaysian block price; China 3 CNY a bag before freight'),
  }),
  'yours.yieldG': perCrop({
    oyster: r(238, 204, 340, 'low', ['S06', 'S07', 'S08', 'S09', 'S10', 'S11', 'S12', 'S15', 'S17'], 'The shed\'s 170 g plus 40 % for the controlled room'),
    pink: r(200, 150, 300, 'low', ['P24', 'P29', 'P31', 'P32'], '+33 % on the shed; the gain is humidity, CO₂ and air'),
    woodear: r(260, 200, 400, 'low', ['J05', 'J21', 'J22'], 'About +45 % on the shed'),
    lionsmane: r(250, 150, 400, 'low', ['L01', 'L02', 'L13', 'L14', 'L15'], 'Malaysian 150 g in a warm room; Shandong factory 400 g'),
  }),
  'yours.flushes': perCrop({
    oyster: r(4, 3, 6, 'medium', ['APP'], 'The app\'s default program'),
    pink: r(2, 2, 3, 'medium', ['P09', 'P16', 'P24', 'P30']),
    woodear: r(4, 3, 6, 'low', ['J21', 'J22', 'J37'], 'Indonesia 4–8; flush 2 is bigger than flush 1'),
    lionsmane: r(2, 1, 3, 'medium', ['L13', 'L28'], 'First flush largest'),
  }),
  'yours.loss': perCrop({
    oyster: r(5, 2, 15, 'low', ['S44', 'L26'], 'Under 2 % in MARDI\'s controlled house, over 10 % in ordinary houses'),
    pink: r(5, 2, 10, 'low', ['P24'], 'Grey\'s; the mycelium dies below 8–10 °C'),
    woodear: r(7, 3, 12, 'low', ['J07'], 'Estimate; Malaysian growers report high contamination'),
    lionsmane: r(10, 5, 25, 'low', ['L01'], 'Bought blocks travel far'),
  }),
  'yours.first': perCrop({
    oyster: r(7, 3, 14, 'medium', ['S06', 'P08', 'APP'], 'Pins 3–5 days after opening; the app\'s fruiting stage is 7 days'),
    pink: r(7, 4, 14, 'medium', ['P04', 'P08', 'P09', 'P16']),
    woodear: r(18, 12, 30, 'medium', ['J06', 'J21', 'J24', 'J26'], 'Pins 4–10 days after slitting, picked 6–10 days later'),
    lionsmane: r(12, 10, 14, 'medium', ['L02', 'L06'], '11–13 days in Perak; about 10 in Mr Fungus\'s tents'),
  }),
  'yours.interval': perCrop({
    oyster: r(17, 12, 20, 'medium', ['S06', 'APP'], 'The app\'s fruiting 7 days + rest 10 days'),
    pink: r(12, 7, 15, 'medium', ['P04', 'P16', 'P24', 'P30']),
    woodear: r(20, 14, 30, 'medium', ['J21', 'J22', 'J26']),
    lionsmane: r(14, 10, 18, 'medium', ['L15'], '"14 days apart"'),
  }),
  'yours.turn': perCrop({
    oyster: r(2, 1, 10, 'low', ['S06', 'APP'], 'Set so the block life is the October 60 days (50–80)'),
    pink: r(6, 2, 10, 'low', ['P16', 'P24'], 'Set so the block life is 25 days (20–55)'),
    woodear: r(7, 3, 10, 'low', [], 'Not found; grey\'s. Block life 85 days'),
    lionsmane: r(16, 9, 30, 'low', ['L01'], LIONS_42),
  }),
  'yours.kwhBlock': perCrop({
    oyster: r(0.46, 0.4, 0.55, 'medium', ['APP'], 'The app\'s simulation (October)'),
    pink: r(0.19, 0.1, 0.4, 'low', ['APP'], 'Estimate: grey\'s 0.46 kWh over 60 days per block-day, over pink\'s 25 days. Work it out for the room'),
    woodear: r(0.65, 0.4, 1, 'low', ['APP'], 'Estimate: as pink, over 85 days. Work it out for the room'),
    lionsmane: r(0.4, 0.4, 1.63, 'medium', ['L38'], 'The cooling page\'s low case for a 60 m³ room at full racks'),
  }),
  'yours.labourMin': perCrop({
    oyster: r(2.7, 1.44, 14.4, 'low', ['S07', 'G07', 'G24'], '0.75 h per 1,000 blocks a day over the 60-day life; range 0.4–4 h'),
    pink: r(1.13, 0.75, 6, 'low', ['S07', 'G07'], 'Grey\'s rate over 25 days; picked daily'),
    woodear: r(3.83, 2.55, 20.4, 'low', ['J02', 'J21', 'G07'], 'Grey\'s rate over 85 days'),
    lionsmane: r(2.52, 1.26, 5.04, 'low', ['L01'], '1 h per 1,000 blocks a day over 42 days'),
  }),
  'yours.transport': r(0, 0, 2, 'low', [], 'No source; a lowland farm near the Klang Valley. Enter your own'),
  'yours.rent': r(0, 0, 4000, 'low', ['L01', 'L35'], 'The owner, 2026-10-27: likely 0'),
  'yours.fans': r(3300, 1700, 7500, 'low', ['L01'], 'Fan pair 800, controller 1,500, wiring 1,000; none sourced'),
  ...SHED,
  ...HIGHLAND,
  ...WARM,
  'import.landed': perCrop({
    woodear: r(13, 10, 16, 'low', ['J08', 'J09', 'J11', 'J29'], 'Not found: back-calculated from Chinese fresh black fungus at RM 18–24/kg retail'),
    lionsmane: r(40.86, 26.53, 53.12, 'low', ['L09', 'G02', 'G13', 'G14'], 'USD 8.10 × 4.057 + RM 8.00 freight, duty and handling (a placeholder)'),
  }),
  'import.buyHours': r(2, 1.4, 2.6, 'low', [], 'Placeholder'),
  'import.rent': r(0, 0, 4000, 'low', ['L01']),
};

// The room-size defaults (appendix 1.4): over 40 m³ a 40 ft high cube, else a 20 ft.
export const BLOCKS_PER_M3 = 22;
export const BIG_ROOM_M3 = 40;
export const HUMIDIFIER_LH = 6; // one humidifier per 6 L/h of the room's humidifier output, at least one
export const sizeOf = (room) => (room.volume > BIG_ROOM_M3 ? '40 ft' : '20 ft');
function roomResearch(key, room, blocks) {
  const big = room.volume > BIG_ROOM_M3;
  if (key === 'yours.blocks') {
    return r(Math.max(1, Math.floor(room.volume * BLOCKS_PER_M3)), Math.floor(room.volume * 8.3), Math.floor(room.volume * 29), 'low', ['L38'],
      '29 blocks a m³ of room at full racks, a container counting 75 % of its volume; the simulator\'s test load is 8.3');
  }
  if (key === 'yours.container') {
    return r(big ? 38_100 : 24_550, 17_300, 38_100, 'low', ['L29', 'L31'], big ? 'A used 40 ft reefer RM 36,800 + haulage and a side loader' : 'A used 20 ft reefer RM 23,500 + haulage and a side loader');
  }
  if (key === 'yours.cooling') {
    return r(big ? 9040 : 4520, 3960, 9040, 'medium', ['G16', 'L23', 'L38'], big ? '2 × Daikin FTKF 2.5 hp at RM 4,170 + RM 350 fitting' : 'A Daikin FTKF 2.5 hp at RM 4,170 + RM 350 fitting');
  }
  if (key === 'yours.humidifier') {
    const units = Math.max(1, Math.ceil((room.humidifierLH ?? 0) / HUMIDIFIER_LH));
    return r(1500 * units, 900 * units, 3000 * units, 'low', ['S42', 'L01'], `RM 1,500 a unit, ${units} for ${room.humidifierLH ?? 0} L/h`);
  }
  if (key === 'yours.racks') {
    return r(Math.round(0.7 * blocks * 100) / 100, Math.round(0.2 * blocks * 100) / 100, Math.round(1.3 * blocks * 100) / 100, 'medium', ['G21', 'G25', 'G33'], 'RM 0.70 a block (0.20–1.30): an iron rack RM 250 for 350 blocks');
  }
  return undefined;
}

// A figure's research default for crop in room ({ volume, humidifierLH }), with blocks the room's blocks as the page uses
// them (the racks follow them): { value, low, high, confidence, sources, note }, or null when the figure has none for crop.
export function researchOf(key, crop, room, blocks) {
  const sized = roomResearch(key, room, blocks);
  if (sized !== undefined) return sized;
  const entry = RESEARCH[key];
  if (!entry) return null;
  return entry.perCrop ? entry.perCrop[crop] ?? null : entry;
}

// The sources of the defaults (appendix section 6): id → { title (short), url (null: this repository), year }.
export const SOURCES = {
  APP: { title: "This app's simulation", url: null, year: '2026' },
  S01: { title: 'Threads', url: 'https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/', year: '2026' },
  S03: { title: 'Siswazah Tani', url: 'https://siswazah-tani.blogspot.com/2020/11/jualan-bongkah-cendawan-tiram-kelabu.html', year: '2020' },
  S04: { title: 'Siswazah Tani', url: 'https://siswazah-tani.blogspot.com/2020/01/cara-mengira-kos-penghasilan-beg.html', year: '2020' },
  S06: { title: 'DOA', url: 'https://epengembangan.doa.gov.my/en/tanaman/komoditi-berpotensi/cendawan/', year: '' },
  S07: { title: 'Cendawan Online', url: 'https://cendawanonline.wordpress.com/', year: '2018' },
  S08: { title: 'Petani', url: 'https://petani.my/cara-tanam-cendawan-tiram-di-rumah/', year: '' },
  S09: { title: 'ScienceDirect', url: 'https://www.sciencedirect.com/science/article/pii/S0304423813003129', year: '2013' },
  S10: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/376638044_SCIPe_MARDI_Pakej_lengkap_untuk_industri_cendawan_tempatan_SCIPe_MARDI_A_complete_package_for_the_local_mushroom_industry', year: '' },
  S11: { title: 'MARDI', url: 'http://etmr.mardi.gov.my/index.php/25-abstract/2013/volume-8/57-daya-maju-perusahaan-cendawan-tiram-di-semenanjung-malaysia', year: '2013' },
  S12: { title: 'Utusan Borneo', url: 'https://www.utusanborneo.com.my/2025/12/20/pengusaha-tanaman-cendawan-tiram-mampu-meraih-pendapatan-lumayan', year: '2025' },
  S14: { title: 'Sinar Harian', url: 'https://www.sinarharian.com.my/article/257798/edisi/johor/cuaca-panas-pengeluaran-cendawan-tiram-terjejas', year: '2023' },
  S15: { title: 'Agrimag', url: 'https://agrimag.my/en/article-details/pengeluaran-harian-300-kg-bekalan-cendawan-tiram-masih-kurang', year: '2023' },
  S16: { title: 'Harga Sekilo', url: 'https://www.hargasekilo.my/harga-cendawan-tiram/', year: '2026' },
  S17: { title: 'ScienceDirect', url: 'https://www.sciencedirect.com/science/article/pii/S2666154323004593', year: '2023' },
  S35: { title: 'TNB', url: 'https://www.mytnb.com.my/ms-MY/business/understand-your-bill/pricing-tariff', year: '2026' },
  S42: { title: 'Duokai', url: 'https://duokai.en.made-in-china.com/product/ZdoteFAVELrT/China-CE-Approved-24-Liter-Per-Hour-Ultrasonic-Air-Humidifier-Industrial-Agriculture-Grow-Room-Mushroom-Fogger.html', year: '2026' },
  S44: { title: 'PubMed', url: 'https://pubmed.ncbi.nlm.nih.gov/39384289/', year: '2024' },
  S47: { title: 'Sinar Harian', url: 'https://www.sinarharian.com.my/article/159472/edisi/cendawan-tiram-beri-pendapatan-lumayan-buat-suami-isteri', year: '2021' },
  L01: { title: 'October defaults', url: null, year: '2026' },
  L02: { title: 'Malaysiaaktif', url: 'https://malaysiaaktif.my/2025/04/cendawan-kobis-bunga-tarik-perhatian-penduduk-seberang-perak', year: '2025' },
  L03: { title: 'Dusun', url: 'https://dusun.com.my/product/organic-local-fresh-lion-mane-200gm/', year: '2026' },
  L05: { title: 'Vegan District', url: 'https://vegandistrict.my/products/lions-head-mushroom-100g', year: '2026' },
  L06: { title: 'Mr Fungus', url: 'https://www.mrfungus.com.my/', year: '2026' },
  L09: { title: 'Tridge', url: 'https://www.tridge.com/market-overview/fresh-lion-s-mane-mushroom', year: '2026' },
  L10: { title: 'Sina Finance', url: 'https://finance.sina.com.cn/jjxw/2025-04-12/doc-inesvpzh4569524.shtml', year: '2025' },
  L13: { title: 'Nongji', url: 'https://www.nongji1958.com/index.php/node/61629', year: '2023' },
  L14: { title: 'Europe PMC', url: 'https://europepmc.org/article/PMC/PMC10432537', year: '2023' },
  L15: { title: 'Stamets (archive.org)', url: 'https://archive.org/details/PaulStametsGrowingGourmetAndMedicinalMushrooms2000', year: '1993' },
  L16: { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Cameron_Highlands', year: '' },
  L17: { title: 'Bewilder', url: 'https://www.bewildersg.com/grow-kits/p/wr2za998wnnh7ueme24e1kxtntsa7k', year: '2026' },
  L18: { title: 'Arus Energ', url: 'https://arusenerg.com/tnb-tariff-malaysia/', year: '2026' },
  L19: { title: 'TNB', url: 'https://www.mytnb.com.my/tariff/index.html?lang=en', year: '2026' },
  L21: { title: 'MOHR', url: 'https://gajiminimum.mohr.gov.my/wp-content/uploads/PUA%20376.pdf', year: '2024' },
  L23: { title: 'Calculator Malaysia', url: 'https://calculatormalaysia.com/harga/harga-aircond-malaysia/', year: '2026' },
  L26: { title: 'HH Publisher', url: 'https://journals.hh-publisher.com/index.php/AAFRJ/article/view/444', year: '2021' },
  L28: { title: 'Out-Grow', url: 'https://www.out-grow.com/pages/lions-mane-warm-weather-hericium-erinaceus', year: '2026' },
  L29: { title: 'Carousell', url: 'https://www.carousell.com.my/reefer-container/q/', year: '2026' },
  L31: { title: 'DNE Logistics', url: 'https://dnelogistics.com.my/container-haulage-port-klang-rates-routes.html', year: '2026' },
  L35: { title: 'Mudah', url: 'https://www.mudah.my/selangor/shop-lot-for-rent', year: '2026' },
  L36: { title: 'Shroomy', url: 'https://www.shroomy-tek.com/products/lions-mane-grow-kit', year: '2026' },
  L37: { title: "The simulator's model", url: null, year: '2026' },
  L38: { title: 'Cooling page', url: null, year: '2026' },
  P01: { title: 'Free Malaysia Today', url: 'https://www.freemalaysiatoday.com/category/bahasa/2020/01/05/pesara-tentera-tanam-cendawan-tiram-warna-warni', year: '2020' },
  P02: { title: 'Free Malaysia Today', url: 'https://www.freemalaysiatoday.com/category/nation/2020/01/05/money-making-world-of-mokhtars-multi-coloured-mushrooms', year: '2020' },
  P03: { title: 'Animhosnan', url: 'http://animhosnan.blogspot.com/2022/12/cendawan-tiram-warna-warni.html', year: '2022' },
  P04: { title: 'Lazada', url: 'https://www.lazada.com.my/products/bongkah-cendawan-tiram-pink-i2426799976.html', year: '' },
  P05: { title: 'PG Mall', url: 'https://pgmall.my/p/U277/4281', year: '' },
  P06: { title: 'ZZ Agro', url: 'http://zz-agro.blogspot.com/2011/11/cendawan-cendawan-berpotensi-di.html', year: '2011' },
  P07: { title: 'Cendawan Global', url: 'http://cendawanglobal.blogspot.com/2007/09/cendawan-merah-jambu.html', year: '2007' },
  P08: { title: 'DOA', url: 'https://epengembangan.doa.gov.my/en/tanaman/komoditi-berpotensi/', year: '' },
  P09: { title: 'Shroomy', url: 'https://www.shroomy-tek.com/', year: '2026' },
  P10: { title: 'Mogoo Farm', url: 'https://mogoofarm.com/', year: '' },
  P11: { title: 'Animagro', url: 'http://animagro.blogspot.com/2020/07/types-of-oyster-mushroom.html', year: '2020' },
  P14: { title: 'SupplyBunny', url: 'https://www.supplybunny.com/en/products/oyster-mushroom-sold-per-kg-735d8cc4-fce1-4b9f-8926-7708282d22e6', year: '2025' },
  P16: { title: 'Trubus', url: 'https://trubus.id/jamur-tiram-merah-muda-dan-kuning-lezat-dan-bergizi/', year: '2024' },
  P17: { title: 'Unand', url: 'https://tpa.fateta.unand.ac.id/index.php/JTPA/article/view/621', year: '2022' },
  P19: { title: 'Nanagarden', url: 'https://www.nanagarden.com/product/192564', year: '' },
  P20: { title: 'CECD Chonburi', url: 'https://cecdchonburi.com/?product=quality-mushroom-spawn', year: '' },
  P21: { title: 'CMPC Coop', url: 'https://cmpccoop.com/?portfolio=fresh-mushrooms-oyster-mushrooms-pink-gull-mushrooms-golden-oyster-mushrooms', year: '' },
  P22: { title: 'DOAE', url: 'https://smce2023.doae.go.th/product_detail.php?smce_id=650110810042&ps_id=6598', year: '' },
  P24: { title: 'Mycelia', url: 'https://mycelia.be/m2708-pleurotus-djamor/', year: '' },
  P25: { title: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Pleurotus_djamor', year: '' },
  P26: { title: 'IJCMAS', url: 'https://www.ijcmas.com/9-11-2020/R.%20Kavipriya,%20et%20al.pdf', year: '2020' },
  P27: { title: 'Nature Lion', url: 'https://naturelion.ca/blog/pink-oyster-mushroom-guide', year: '' },
  P28: { title: 'Out-Grow', url: 'https://www.out-grow.com/blogs/growing-mushrooms/growing-pink-oyster-mushrooms-is-it-that-easy', year: '' },
  P29: { title: 'Lykyn', url: 'https://lykyn.com/blogs/news/pink-oyster-grow-kit', year: '' },
  P30: { title: 'Shroomery', url: 'https://www.shroomery.org/9406/Pleurotus-djamor', year: '' },
  P31: { title: 'Pak. J. Bot.', url: 'http://www.pakbs.org/pjbot/PDFs/44(1)/61.pdf', year: '2012' },
  P32: { title: 'JAB', url: 'https://jabonline.in/abstract.php?article_id=1247&sts=2', year: '' },
  P33: { title: 'Tridge', url: 'https://www.tridge.com/tridge-woods/fresh-oyster-mushroom/CN', year: '2022' },
  P35: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/351265218_Determination_of_how_to_minimize_postharvest_losses_in_oyster_mushroom_Pleurotus_ostreatus', year: '' },
  P37: { title: 'Kuanju', url: 'https://kuanju.wordpress.com/2013/06/24/mushroom-farm-cameron-highlands/', year: '2013' },
  J01: { title: 'TRDI', url: 'https://www.trdi.my/usahawan-cendawan-terengganu-rancang-tembusi-pasaran-eksport', year: '2024' },
  J02: { title: 'Bernama', url: 'https://www.bernama.com/bm/news.php?id=1814697', year: '2020' },
  J03: { title: 'Animhosnan', url: 'http://animhosnan.blogspot.com/2014/07/cendawan-jeli-hitam-part-1.html', year: '2014' },
  J05: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/324673393_Antioxidant_Properties_and_Yield_of_Wood_Ear_Mushroom_Auricularia_polytricha_Agaricomycetes_Cultivated_on_Rubberwood_Sawdust', year: '2018' },
  J06: { title: 'SciAlert', url: 'https://scialert.net/fulltext/?doi=ajps.2014.111.119', year: '2014' },
  J07: { title: 'CORE', url: 'https://files01.core.ac.uk/download/pdf/268875774.pdf', year: '' },
  J08: { title: "Lotus's", url: 'https://www.lotuss.com.my/p/fresh-black-fungus-200g-75189332', year: '2026' },
  J09: { title: 'Village Grocer', url: 'https://vkg.bites.com.my/products/china-fresh-black-fungus-200g', year: '2026' },
  J10: { title: 'Jaya Grocer', url: 'https://jgcj.jayagrocer.com/products/mushroom-vt-black-jelly-200g-mys', year: '2026' },
  J11: { title: 'Jaya Grocer', url: 'https://klec.jayagrocer.com/products/black-fungus-mushroom-china-200g', year: '2026' },
  J12: { title: 'Doremi', url: 'https://www.doremi.my/fresh-black-fungus', year: '2026' },
  J14: { title: 'Great Ocean', url: 'https://greatocean.my/product/1kg-black-fungus-qing-shui-%E6%B8%85%E6%B0%B4%E7%99%BD%E8%83%8C%E9%BB%91%E6%9C%A8%E8%80%B3-1kg/', year: '2026' },
  J15: { title: 'NBS Grocery', url: 'https://www.nbsgrocery.com/showproducts/productid/3254283/cid/344643/goldenhorse-black-fungus-1kg-%E9%87%91%E9%A9%AC%E7%89%8C-%E9%BB%91%E6%9C%A8%E8%80%B3-kulat-hitam/', year: '2026' },
  J16: { title: 'SupplyBunny', url: 'https://www.supplybunny.com/en/products/dried-black-fungus-cloud-ear-100g-sold-per-packet-cendawan-telinga-tikus', year: '2026' },
  J17: { title: 'Lazada', url: 'https://www.lazada.com.my/products/hot-sale-100-organic-high-quality-50-gram-dried-black-jelly-mushroom-from-farm-50-gram-cendawan-telinga-kera-kering-dari-ladang-i2449171754.html', year: '2026' },
  J19: { title: 'Threads', url: 'https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/', year: '2026' },
  J21: { title: 'Trubus', url: 'https://trubus.id/berdaya-karena-jamur-kuping/', year: '2020' },
  J22: { title: "Ma'soem University", url: 'https://masoemuniversity.ac.id/artikel/memulai-bisnis-jamur-kuping-dari-budidaya-hingga-menjadi-pemasok-pasar/', year: '2026' },
  J24: { title: 'Khaosod', url: 'https://www.khaosod.co.th/technologychaoban/featured/article_259400', year: '' },
  J25: { title: 'Nanagarden', url: 'https://www.nanagarden.com/tag/%E0%B9%80%E0%B8%AB%E0%B9%87%E0%B8%94%E0%B8%AB%E0%B8%B9%E0%B8%AB%E0%B8%99%E0%B8%B9', year: '' },
  J26: { title: 'Kepu China', url: 'https://www.kepuchina.cn/xc/201809/t20180918_733231.shtml', year: '2018' },
  J27: { title: 'CNHNB', url: 'https://www.cnhnb.com/xt/article-113868.html', year: '' },
  J29: { title: 'CNHNB', url: 'https://www.cnhnb.com/p/muer-0-0-15303-0-1/', year: '2025' },
  J30: { title: 'YMT', url: 'https://news.ymt.com/new_arg_tech/eEoeFH6B', year: '' },
  J32: { title: 'Viet World Kitchen', url: 'https://www.vietworldkitchen.com/blog/2026/05/wood-ear-mushroom-and-black-fungus-a-beginners-guide-to-buying-prepping-and-cooking.html', year: '2026' },
  J37: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/340806952_Cultivation_of_a_wild_strain_of_Auricularia_cornea_from_Thailand', year: '2020' },
  G01: { title: 'Paul Tan', url: 'https://paultan.org/2026/11/02/tnb-bill-afa-rate-november-2026-set-at-3-60-sen-kwh/', year: '2026' },
  G02: { title: 'Bank Negara', url: 'https://www.bnm.gov.my/kuala-lumpur-usd/myr-reference-rate', year: '2026' },
  G03: { title: 'Investing.com', url: 'https://www.investing.com/currencies/usd-myr-historical-data', year: '2026' },
  G04: { title: 'Harga Sekilo', url: 'https://www.hargasekilo.my/harga-cendawan-tiram/', year: '2026' },
  G05: { title: 'Threads', url: 'https://www.threads.com/@saiful_sifucendawan/post/DbAUzlVEiGY/promosi-jualan-bongkah-cendawan-tiram-kelabu-harga-bongkah-cendawan-rm-rm/', year: '2026' },
  G06: { title: 'Mudah', url: 'https://www.mudah.my/bongkah-cendawan-tiram-kelabu-matang100-115559660.htm', year: '2026' },
  G07: { title: 'Utusan', url: 'https://www.utusan.com.my/nasional/2026/11/cendawan-ubah-hidup-bekas-tukang-binaan/', year: '2026' },
  G08: { title: 'MARDI', url: 'http://etmr.mardi.gov.my/index.php/25-abstract/2013/volume-8/57-daya-maju-perusahaan-cendawan-tiram-di-semenanjung-malaysia', year: '2013' },
  G09: { title: 'Agrimag', url: 'https://agrimag.my/en/article-details/pengeluaran-harian-300-kg-bekalan-cendawan-tiram-masih-kurang', year: '2023' },
  G10: { title: 'Shroomy', url: 'https://www.shroomy-tek.com/', year: '2026' },
  G11: { title: 'Dusun', url: 'https://dusun.com.my/product/organic-local-fresh-lion-mane-200gm/', year: '' },
  G13: { title: 'Tridge', url: 'https://www.tridge.com/intelligences/lions-mane-mushroom/price', year: '2026' },
  G14: { title: 'Tridge', url: 'https://www.tridge.com/market-overview/fresh-lion-s-mane-mushroom#price', year: '2026' },
  G15: { title: 'Vegan District', url: 'https://vegandistrict.my/products/lions-head-mushroom-100g', year: '' },
  G16: { title: 'Daikin', url: 'https://www.daikin.com.my/products/residential/wall-mounted/ftkf-series', year: '2026' },
  G17: { title: 'The Star', url: 'https://www.thestar.com.my/news/nation/2026/10/09/budget-2027-minimum-wage-to-rise-to-rm2000-from-june-2027-says-anwar', year: '2026' },
  G18: { title: 'Maukerja', url: 'https://www.maukerja.my/career-advice/blog/ms/34016/gaji-minimum-malaysia', year: '2026' },
  G19: { title: 'Cobler', url: 'https://cobler.io/blog/your-tnb-bill-line-by-line', year: '2026' },
  G20: { title: 'Le Mushroom', url: 'http://lemushroom.blogspot.com/2010/05/mesin-mixer-dan-bagging-bag-cendawan-2.html', year: '' },
  G21: { title: 'Animhosnan', url: 'http://animhosnan.blogspot.com/2018/06/agrimaths-cendawan-part-12.html', year: '2018' },
  G22: { title: 'Harizamrry', url: 'https://harizamrry.wordpress.com/2008/01/29/bantuan-dan-insentif-dalam-industri-cendawan/', year: '2008' },
  G23: { title: 'Selangor assembly', url: 'https://dewan.selangor.gov.my/question/pertanian-13/', year: '2012' },
  G24: { title: 'Perak Sejahtera', url: 'https://www.peraksejahtera.com/dari-kokpit-ke-kebun/', year: '2026' },
  G25: { title: 'Lazada', url: 'https://www.lazada.com.my/products/installation-rak-tinggi-cendawan-tiram-7-14-days-delivery-i4044543166.html', year: '' },
  G26: { title: 'PJK', url: 'https://www.pjk.edu.my/penerbitanPJK/9.%20AGRO%20-%20FatihahAidaZalina.pdf', year: '' },
  G27: { title: 'URS Agro', url: 'http://ursagro.blogspot.com/2009/02/pemasangan-misting-system.html', year: '2009' },
  G28: { title: 'Saidina', url: 'https://saidinafurniture.com/product/mist-fan/', year: '' },
  G29: { title: 'BigGo', url: 'https://my.biggo.com/s/punnet/', year: '2026' },
  G30: { title: 'Abi Agro', url: 'https://abiagro.com.my/plastik-pembalut-buah/', year: '' },
  G31: { title: 'ResearchGate', url: 'https://www.researchgate.net/publication/306522802_Comparative_Study_of_Fruiting_Body_Production_of_some_Oyster_Mushroom_in_Two_Different_Temperatures', year: '' },
  G32: { title: 'The Vibes', url: 'https://www.thevibes.com/index.php/articles/lifestyles/84354/Teacher-turned-entrepreneur-extolls-virtues-of-mushrooms-as-unexplored-commodity', year: '' },
  G33: { title: 'Mudah', url: 'https://www.mudah.my/rak-cendawan-109639455.htm', year: '' },
};
```

- [ ] **Step 4: Run both pure tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-defaults.test.js tests/economics-model.test.js`
Expected: PASS, 17 tests (9 + 8). Then `npm test`: 2939 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/economics-defaults.js tests/economics-defaults.test.js
git commit -m "Economics: the figures (labels, units, scopes, ranges, the Settings words of a refusal), the ways per crop and the research default of every figure with its range, confidence and sources; every crop and way at the defaults gives the spec's table 11.2"
```

---
## Part 2: the server

### Task 3: The table `economics_figures`, database version 26 (spec 3)

**Files:**
- Modify: `server/db.js` (five places, each marked `---- Economics ----`)
- Modify: the tests that assert the database version (`25` becomes `26`)
- Test: `tests/db-economics.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/db-economics.test.js`:

```js
// The Economics table (spec 2026-11-06-economics-design.md 3): the step to version 26 from a version-25 file, the owner's
// figures with their "every" sentinels, a deleted room taking its rows, the simulator row's start, done and failed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb, SIM_KEY } from '../server/db.js';

mkdirSync('/tmp/economics', { recursive: true });
const fileOf = () => join(mkdtempSync('/tmp/economics/db-'), 'farm.db');
const T = Date.UTC(2026, 10, 6, 6); // 14:00 on the farm
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

test('a version 25 database is upgraded to 26: the table (STRICT), its unique index and the room trigger; its rooms kept', () => {
  const file = fileOf();
  const db = openDb(file);
  const room = db.createRoom(ROOM, T).id;
  db.close();
  const raw = new DatabaseSync(file);
  raw.exec('DROP TRIGGER economics_room_gone; DROP TABLE economics_figures; PRAGMA user_version = 25;'); // a version 25 file
  raw.close();
  const again = openDb(file);
  assert.equal(again.getRoom(room).name, 'Container 1');
  assert.deepEqual(again.economicsFigures(room, 'lionsmane'), []);
  again.close();
  const check = new DatabaseSync(file);
  assert.equal(check.prepare('PRAGMA user_version').get().user_version, 26);
  const kinds = (name) => check.prepare('SELECT type, sql FROM sqlite_master WHERE name = ?').get(name);
  assert.match(kinds('economics_figures').sql, /STRICT/);
  assert.equal(kinds('economics_figure').type, 'index');
  assert.match(kinds('economics_figure').sql, /UNIQUE INDEX/);
  assert.equal(kinds('economics_room_gone').type, 'trigger');
  assert.throws(() => check.exec("INSERT INTO economics_figures (key, source) VALUES ('price', 'guess')"), /CHECK/);
  assert.throws(() => check.exec("INSERT INTO economics_figures (key, source, status) VALUES ('price', 'owner', 'busy')"), /CHECK/);
  check.close();
});

test('the owner\'s figures: set (again: the last wins), read with the room\'s and every room\'s and crop\'s, cleared', () => {
  const db = openDb(':memory:');
  const one = db.createRoom(ROOM, T).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, T).id;
  const set = (roomId, crop, key, value, at = T) => db.setEconomicsFigure({ roomId, crop, key, value, at });
  assert.deepEqual(set(0, '', 'wage', 12), {
    id: 1, roomId: 0, crop: '', key: 'wage', source: 'owner', value: 12, at: T, status: null, simId: null, startedAt: null,
    error: null, kwh: null, blocks: null, days: null,
  });
  set(0, 'lionsmane', 'price', 55);
  set(0, 'oyster', 'price', 11);
  set(one, '', 'yours.rent', 300);
  set(one, 'lionsmane', 'yours.yieldG', 230);
  set(two, 'lionsmane', 'yours.yieldG', 180);
  assert.equal(set(0, 'lionsmane', 'price', 60, T + 1).value, 60, 'the last save wins');
  const keys = (roomId, crop) => db.economicsFigures(roomId, crop).map((r) => `${r.roomId}/${r.crop}/${r.key}=${r.value}`);
  assert.deepEqual(keys(one, 'lionsmane'), ['0//wage=12', '0/lionsmane/price=60', `${one}//yours.rent=300`, `${one}/lionsmane/yours.yieldG=230`]);
  assert.deepEqual(keys(two, 'oyster'), ['0//wage=12', '0/oyster/price=11']);
  assert.equal(db.clearEconomicsFigure({ roomId: 0, crop: 'lionsmane', key: 'price' }), true);
  assert.equal(db.clearEconomicsFigure({ roomId: 0, crop: 'lionsmane', key: 'price' }), false, 'nothing left to clear');
  assert.deepEqual(keys(one, 'lionsmane'), ['0//wage=12', `${one}//yours.rent=300`, `${one}/lionsmane/yours.yieldG=230`]);
  db.close();
});

test('a deleted room takes its own rows; the farm\'s and the crops\' stay', () => {
  const db = openDb(':memory:');
  const one = db.createRoom(ROOM, T).id;
  db.setEconomicsFigure({ roomId: 0, crop: 'lionsmane', key: 'price', value: 55, at: T });
  db.setEconomicsFigure({ roomId: one, crop: '', key: 'yours.rent', value: 300, at: T });
  db.setEconomicsFigure({ roomId: one, crop: 'lionsmane', key: 'yours.yieldG', value: 230, at: T });
  db.startEconomicsSim({ roomId: one, crop: 'lionsmane', simId: 4, at: T });
  db.deleteRoom(one);
  assert.deepEqual(db.economicsFigures(one, 'lionsmane').map((r) => r.key), ['price']);
  db.close();
});

test('the simulator row: started (working), done with its figure, started again (the figure kept), failed (the figure kept)', () => {
  const db = openDb(':memory:');
  const one = db.createRoom(ROOM, T).id;
  const where = { roomId: one, crop: 'lionsmane' };
  const first = db.startEconomicsSim({ ...where, simId: 7, at: T });
  assert.deepEqual([first.key, first.source, first.status, first.simId, first.startedAt, first.value], [SIM_KEY, 'simulator', 'working', 7, T, null]);
  assert.deepEqual(db.economicsSimsWorking().map((r) => r.simId), [7]);
  const done = db.settleEconomicsSim({ ...where, value: 0.478, at: T + 4000, kwh: 708.7, blocks: 1482, days: 42 });
  assert.deepEqual([done.status, done.value, done.at, done.kwh, done.blocks, done.days, done.error], ['done', 0.478, T + 4000, 708.7, 1482, 42, null]);
  assert.deepEqual(db.economicsSimsWorking(), []);
  const again = db.startEconomicsSim({ ...where, simId: 9, at: T + 9000 });
  assert.deepEqual([again.status, again.simId, again.startedAt, again.value, again.at], ['working', 9, T + 9000, 0.478, T + 4000]);
  const failed = db.settleEconomicsSim({ ...where, error: 'Stopped by a restart of the farm app' });
  assert.deepEqual([failed.status, failed.error, failed.value, failed.kwh], ['failed', 'Stopped by a restart of the farm app', 0.478, 708.7]);
  assert.equal(db.settleEconomicsSim({ roomId: one, crop: 'oyster', error: 'x' }), null, 'no row for grey oyster');
  assert.deepEqual(db.economicsFigures(one, 'lionsmane').map((r) => r.source), ['simulator'], 'the owner\'s row is apart');
  db.close();
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-economics.test.js`
Expected: FAIL, `SyntaxError: The requested module '../server/db.js' does not provide an export named 'SIM_KEY'`.

- [ ] **Step 3: The version**

In `server/db.js` replace:

```js
const VERSION = 25;
```

with:

```js
const VERSION = 26;
```

- [ ] **Step 4: The schema and the row**

In `server/db.js`, before the Login block's `accountRow`, replace:

```js
const accountRow = (r) => ({
```

with:

```js
// ---- Economics ---- (spec 2026-11-06-economics-design.md 3): the owner's figures and the simulator's, one row per room,
// crop, key and source; room_id 0 and crop '' mean "every" (a farm or crop figure; a room figure), so the unique index has
// no NULL in it. Room ids are reused: the trigger deletes a deleted room's rows (deleteRoom is untouched).
const ECONOMICS = `
CREATE TABLE IF NOT EXISTS economics_figures (
  id         INTEGER PRIMARY KEY,
  room_id    INTEGER NOT NULL DEFAULT 0,
  crop       TEXT    NOT NULL DEFAULT '',
  key        TEXT    NOT NULL,
  source     TEXT    NOT NULL CHECK (source IN ('owner', 'simulator')),
  value      REAL,
  at         INTEGER,
  status     TEXT    CHECK (status IN ('working', 'done', 'failed')),
  sim_id     INTEGER,
  started_at INTEGER,
  error      TEXT,
  kwh        REAL,
  blocks     INTEGER,
  days       INTEGER
) STRICT;
CREATE UNIQUE INDEX IF NOT EXISTS economics_figure ON economics_figures (room_id, crop, key, source);
CREATE TRIGGER IF NOT EXISTS economics_room_gone AFTER DELETE ON rooms BEGIN
  DELETE FROM economics_figures WHERE room_id = OLD.id;
END;`;
// The simulator's figure: the room's electricity per block with a crop.
export const SIM_KEY = 'yours.kwhBlock';
const economicsRow = (r) => ({
  id: r.id, roomId: r.room_id, crop: r.crop, key: r.key, source: r.source, value: r.value, at: r.at, status: r.status,
  simId: r.sim_id, startedAt: r.started_at, error: r.error, kwh: r.kwh, blocks: r.blocks, days: r.days,
});
// ---- end Economics ----

const accountRow = (r) => ({
```

- [ ] **Step 5: The upgrade step**

In `migrate`, after the Login step, replace:

```js
      db.exec(LOGIN);
    }
    db.exec(`PRAGMA user_version = ${VERSION}`);
```

with:

```js
      db.exec(LOGIN);
    }
    if (version < 26) db.exec(ECONOMICS); // ---- Economics ---- (spec 2026-11-06-economics-design.md 3)
    db.exec(`PRAGMA user_version = ${VERSION}`);
```

- [ ] **Step 6: The statements**

After Costs' `costQ`, replace:

```js
  // Runs fn in one transaction: all of its writes or none.
  function inTransaction(fn) {
```

with:

```js
  // ---- Economics ---- (spec 2026-11-06-economics-design.md 3): the economics_figures statements.
  const econQ = {
    of: db.prepare(`SELECT * FROM economics_figures WHERE room_id IN (0, ?) AND crop IN ('', ?) ORDER BY id`),
    get: db.prepare('SELECT * FROM economics_figures WHERE room_id = ? AND crop = ? AND key = ? AND source = ?'),
    setOwner: db.prepare(`INSERT INTO economics_figures (room_id, crop, key, source, value, at) VALUES (?, ?, ?, 'owner', ?, ?)
                          ON CONFLICT (room_id, crop, key, source) DO UPDATE SET value = excluded.value, at = excluded.at`),
    clearOwner: db.prepare("DELETE FROM economics_figures WHERE room_id = ? AND crop = ? AND key = ? AND source = 'owner'"),
    startSim: db.prepare(`INSERT INTO economics_figures (room_id, crop, key, source, status, sim_id, started_at) VALUES (?, ?, ?, 'simulator', 'working', ?, ?)
                          ON CONFLICT (room_id, crop, key, source) DO UPDATE SET status = 'working', sim_id = excluded.sim_id,
                          started_at = excluded.started_at, error = NULL`),
    simDone: db.prepare(`UPDATE economics_figures SET status = 'done', value = ?, at = ?, kwh = ?, blocks = ?, days = ?, error = NULL
                         WHERE room_id = ? AND crop = ? AND key = ? AND source = 'simulator'`),
    simFailed: db.prepare(`UPDATE economics_figures SET status = 'failed', error = ?
                           WHERE room_id = ? AND crop = ? AND key = ? AND source = 'simulator'`),
    working: db.prepare("SELECT * FROM economics_figures WHERE source = 'simulator' AND status = 'working' ORDER BY id"),
  };
  // ---- end Economics ----

  // Runs fn in one transaction: all of its writes or none.
  function inTransaction(fn) {
```

- [ ] **Step 7: The methods**

At the end of the returned object, after the Runs block, replace:

```js
    // ---- end Runs ----

    close() {
```

with:

```js
    // ---- end Runs ----

    // ---- Economics ---- (spec 2026-11-06-economics-design.md 3). A figure row is economicsRow's; roomId 0 and crop '' are
    // "every" (economics-defaults.js placeOf says which a key takes).

    // Every row a room and crop read: room 0 or roomId, crop '' or crop.
    economicsFigures(roomId, crop) {
      return econQ.of.all(roomId, crop).map(economicsRow);
    },

    // The owner's figure set at `at` (ms). → the row.
    setEconomicsFigure({ roomId, crop, key, value, at }) {
      econQ.setOwner.run(roomId, crop, key, value, at);
      return economicsRow(econQ.get.get(roomId, crop, key, 'owner'));
    },

    // The owner's figure gone (the simulator's stays). → true when a row went.
    clearEconomicsFigure({ roomId, crop, key }) {
      return econQ.clearOwner.run(roomId, crop, key).changes > 0;
    },

    // A Work it out started: the simulator row of the room and crop working on simulation simId; the figure before it kept.
    // → the row.
    startEconomicsSim({ roomId, crop, simId, at }) {
      econQ.startSim.run(roomId, crop, SIM_KEY, simId, at);
      return economicsRow(econQ.get.get(roomId, crop, SIM_KEY, 'simulator'));
    },

    // A Work it out settled: done with its figure ({ value, at, kwh, blocks, days }) or failed ({ error }: the figure before
    // it kept). → the row, or null when the room and crop have none.
    settleEconomicsSim({ roomId, crop, error = null, value = null, at = null, kwh = null, blocks = null, days = null }) {
      if (error !== null) econQ.simFailed.run(error, roomId, crop, SIM_KEY);
      else econQ.simDone.run(value, at, kwh, blocks, days, roomId, crop, SIM_KEY);
      const r = econQ.get.get(roomId, crop, SIM_KEY, 'simulator');
      return r ? economicsRow(r) : null;
    },

    // The simulator rows still working (settled when the farm app starts).
    economicsSimsWorking() {
      return econQ.working.all().map(economicsRow);
    },
    // ---- end Economics ----

    close() {
```

- [ ] **Step 8: Run the test**

Run: `node --disable-warning=ExperimentalWarning --test tests/db-economics.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 9: The other tests that know the version**

Seventeen test files assert version 25 (the login's). Make them 26, and the one test name that says 25:

```bash
sed -i "s/user_version').get().user_version, 25)/user_version').get().user_version, 26)/; s/version(path), 25)/version(path), 26)/" tests/*.test.js
sed -i "s/^test('a new database is at version 25 with the sign-in columns/test('a new database (version 25 and on) has the sign-in columns/" tests/db-login.test.js
grep -c "user_version, 26)\|version(path), 26)" tests/*.test.js | grep -v ':0' | wc -l
```

Expected: `18` (the seventeen and `tests/db-economics.test.js`). Then `npm test`: 2943 tests, 0 fail.

- [ ] **Step 10: Commit**

```bash
git add server/db.js tests/db-economics.test.js tests/*.test.js
git commit -m "Economics: the economics_figures table at database version 26 (the owner's figures and the simulator's, room 0 and crop '' for every, one row per key and source, a trigger taking a deleted room's rows) and its six methods; the version tests read 26"
```

---

### Task 4: Your runs `server/economics-runs.js` (spec 4.4, 4.5)

**Files:**
- Create: `server/economics-runs.js`
- Test: `tests/economics-runs.test.js`

The real Harvest, Batches and Sales on one farm file (a partial run is flagged by hand, as the harvest upgrade would). The usage days are a stand-in (`days(room, count)`): the service passes `roomDays(..., { cachedOnly: true })`.

| Figure | Rule |
|---|---|
| Counted runs | Harvest's `roomView(R).past`: ended, not `partial`, with kg of the crop (`byCrop`) |
| `yours.yieldG` | Σ kg ÷ Σ blocks of the crop × 1,000 (g, 1 place); `yours.loss` 0 from your runs (counted in the yield) |
| `price` | Σ total ÷ Σ kg of the crop's lines tied to a counted run (`runId`, or its room on a day of the run by Costs' `runOn`); none tied: farm-wide from the first counted run's start to 14 days after the last one's end |
| `blockPrice` | Σ (blocks × price) ÷ Σ blocks of the crop's batches on a counted run with a price; the others counted as left out |
| `yours.kwhBlock` | Σ kWh of the counted runs' days (each day to the run `runOn` gives it) ÷ Σ blocks of those runs (every crop); a run before the 400 kept days or with no kWh left out; a pending day: `{ pending: true }` |
| `yours.blocks` | The room's Crop tab now; an empty room: its latest run's |

- [ ] **Step 1: Write the failing test**

Create `tests/economics-runs.test.js`:

```js
// Your runs on the Economics page (server/economics-runs.js, spec 2026-11-06-economics-design.md 4.4 and 4.5): the real
// Harvest, Batches and Sales on one farm; which runs count, the yield and the loss in it, the price tied and farm-wide, the
// block price with an unpriced batch, the electricity per block from the usage days, the room's blocks, a part that throws.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createSales } from '../server/sales.js';
import { fixedZone } from '../server/usage.js';
import { yourRuns, PART_FAILED } from '../server/economics-runs.js';

mkdirSync('/tmp/economics', { recursive: true });
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8); // a farm day and hour
const zone = fixedZone(480);
const NOW = at('2026-12-01');
const TODAY = '2026-12-01';
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

// A farm on a database file (a partial run is made by hand): Container 1 with two finished runs of lion's mane (the first
// mixed with grey oyster), an ended run of grey oyster only, an open run, and Container 2 with its own lion's mane run.
function farm(t) {
  const file = join(mkdtempSync('/tmp/economics/runs-'), 'farm.db');
  let db = openDb(file);
  let clock = at('2026-08-01');
  const now = () => clock;
  const services = () => {
    const batches = createBatches({ db, now });
    return { batches, harvests: createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor }), sales: createSales({ db, now }) };
  };
  let s = services();
  t.after(async () => {
    s.harvests.stop();
    await s.harvests.warmed();
    db.close();
  });
  const one = db.createRoom(ROOM, clock).id;
  const two = db.createRoom({ ...ROOM, name: 'Container 2', trhAddress: 2 }, clock).id;
  const run = (room, crops, from, to) => {
    clock = at(from, 9);
    db.setProgram(room, { ...db.getProgram(room), crops }, { change: 'start', at: clock });
    const r = db.openRun(room);
    if (to) {
      clock = at(to, 9);
      db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: clock });
    }
    return r.id;
  };
  const pick = (room, runId, crop, kg, day) => db.insertHarvest({
    roomId: room, runId, crop, stage: 'fruiting', flush: 1, blocks: 1, kg, pickedAt: at(day), worker: null, taskId: null, at: at(day),
  });
  // a partial run (recorded from the harvest upgrade): ended, with picks, never counted
  const partial = run(one, [{ crop: 'lionsmane', blocks: 500 }], '2026-07-01', '2026-07-30');
  pick(one, partial, 'lionsmane', 400, '2026-07-20');
  // run 1, mixed; its lion's mane blocks bought at RM 6 and placed while it is open
  clock = at('2026-08-11');
  const b1 = s.batches.receive({ crop: 'lionsmane', supplier: 'Agro', receivedAt: at('2026-08-11'), blocks: 1000, pricePerBlock: 6 });
  const r1 = run(one, [{ crop: 'lionsmane', blocks: 1000 }, { crop: 'oyster', blocks: 500 }], '2026-08-12');
  s.batches.place(b1.id, { roomId: one });
  pick(one, r1, 'lionsmane', 200, '2026-09-01');
  pick(one, r1, 'oyster', 50, '2026-09-02');
  clock = at('2026-09-23', 9);
  db.setProgram(one, { ...db.getProgram(one), crops: [] }, { change: 'end', at: clock });
  // run 2: 600 blocks at RM 5 and 400 without a price
  clock = at('2026-09-23', 10);
  const b2 = s.batches.receive({ crop: 'lionsmane', supplier: 'Agro', receivedAt: clock, blocks: 600, pricePerBlock: 5 });
  const b3 = s.batches.receive({ crop: 'lionsmane', supplier: 'Agro', receivedAt: clock, blocks: 400 });
  const r2 = run(one, [{ crop: 'lionsmane', blocks: 1000 }], '2026-09-24');
  s.batches.place(b2.id, { roomId: one });
  s.batches.place(b3.id, { roomId: one });
  pick(one, r2, 'lionsmane', 250, '2026-10-10');
  clock = at('2026-11-03', 9);
  db.setProgram(one, { ...db.getProgram(one), crops: [] }, { change: 'end', at: clock });
  // an ended run of grey oyster only, then the open run (picks, not counted)
  const r3 = run(one, [{ crop: 'oyster', blocks: 300 }], '2026-11-04', '2026-11-05');
  pick(one, r3, 'oyster', 5, '2026-11-04');
  const open = run(one, [{ crop: 'lionsmane', blocks: 800 }], '2026-11-05');
  pick(one, open, 'lionsmane', 30, '2026-11-08');
  // Container 2's own run
  const other = run(two, [{ crop: 'lionsmane', blocks: 100 }], '2026-08-01', '2026-09-01');
  pick(two, other, 'lionsmane', 90, '2026-08-20');
  clock = NOW;
  // the partial flag, set by hand as the harvest upgrade would have
  db.close();
  const raw = new DatabaseSync(file);
  raw.prepare('UPDATE runs SET partial = 1 WHERE id = ?').run(partial);
  raw.close();
  s.harvests.stop();
  db = openDb(file);
  s = services();
  const buyer = s.sales.addBuyer({ name: 'Kedai' }).id;
  const sell = (soldAt, lines) => s.sales.record({ soldAt, buyerId: buyer, lines });
  return { db, ...s, one, two, r1, r2, sell, room: () => db.getRoom(one) };
}

// Usage days with kWh a day (or pending on the given dates), back count days from today.
const daysOf = (kWh, pending = [], today = TODAY) => (room, count) => Array.from({ length: count }, (_, i) => {
  const date = new Date(at(today) - (count - 1 - i) * 86_400_000 + 8 * 3_600_000).toISOString().slice(0, 10);
  return pending.includes(date) ? { date, pending: true } : { date, kWh };
});
const read = (f, crop = 'lionsmane', more = {}) => yourRuns({
  db: f.db, harvests: f.harvests, batches: f.batches, days: daysOf(10), room: f.room(), crop, today: TODAY, zone, ...more,
});

test('the counted runs: ended, not partial, with kg of the crop; the yield over every block put in, the loss read as 0', (t) => {
  const f = farm(t);
  const { figures, errors } = read(f);
  assert.deepEqual(errors, {});
  assert.deepEqual(figures['yours.yieldG'], {
    value: 225, runs: { count: 2, from: at('2026-08-12', 9), to: at('2026-11-03', 9), kg: 450, blocks: 2000 },
  });
  assert.deepEqual(figures['yours.loss'], { value: 0, runs: { count: 2, from: at('2026-08-12', 9), to: at('2026-11-03', 9) } });
  assert.equal(read(f, 'oyster').figures['yours.yieldG'].value, 68.8, 'grey oyster: 55 kg from 800 blocks, run 1 and the oyster-only run');
  assert.equal(read(f, 'pink').figures['yours.yieldG'], undefined, 'no run of pink');
});

test('the room\'s blocks: its Crop tab now, else its latest run\'s', (t) => {
  const f = farm(t);
  assert.deepEqual(read(f).figures['yours.blocks'], { value: 800, runs: { from: 'crop' } });
  f.db.setProgram(f.one, { ...f.db.getProgram(f.one), crops: [] }, { change: 'end', at: NOW });
  assert.deepEqual(read(f).figures['yours.blocks'], { value: 800, runs: { from: 'run', at: at('2026-11-05', 9) } });
});

test('the price: the crop\'s lines tied to a counted run (its run, or its room on a day of it); else farm-wide over the runs\' weeks', (t) => {
  const f = farm(t);
  f.sell(at('2026-09-05'), [{ crop: 'lionsmane', kg: 100, priceKg: 50, roomId: f.one }]); // run 1 (Sales ties it)
  f.sell(at('2026-11-03', 15), [{ crop: 'lionsmane', kg: 50, priceKg: 40, roomId: f.one }]); // run 2's last day, after its end
  f.sell(at('2026-11-08'), [{ crop: 'lionsmane', kg: 10, priceKg: 99, roomId: f.one }]); // the open run: not counted
  f.sell(at('2026-10-01'), [{ crop: 'lionsmane', kg: 10, priceKg: 99 }]); // no room: not tied
  assert.deepEqual(read(f).figures.price, {
    value: 46.67, runs: { count: 2, from: at('2026-08-12', 9), to: at('2026-11-03', 9), kg: 150, total: 7000, farmWide: false },
  });
  // grey oyster: no line tied, so its sales farm-wide from run 1's start to 14 days after the oyster-only run's end
  f.sell(at('2026-11-10'), [{ crop: 'oyster', kg: 20, priceKg: 10 }]);
  f.sell(at('2026-11-30'), [{ crop: 'oyster', kg: 20, priceKg: 90 }]); // after the 14 days
  const oyster = read(f, 'oyster').figures.price;
  assert.equal(oyster.value, 10);
  assert.equal(oyster.runs.farmWide, true);
  assert.equal(oyster.runs.until, at('2026-11-05', 9) + 14 * 86_400_000);
});

test('the block price: the priced batches of the crop on a counted run; one without a price left out and counted', (t) => {
  const f = farm(t);
  assert.deepEqual(read(f).figures.blockPrice, { value: 5.63, runs: { count: 2, blocks: 1600, batches: 2, batchesLeftOut: 1 } });
  assert.equal(read(f, 'oyster').figures.blockPrice, undefined, 'no grey oyster batch');
});

test('the electricity per block: each day to the run open on it, ÷ every block of the counted runs; pending while a day is worked out', (t) => {
  const f = farm(t);
  // run 1: 12 Aug – 23 Sep (43 days, 1,500 blocks), run 2: 24 Sep – 3 Nov (41 days, 1,000 blocks), 10 kWh a day
  assert.deepEqual(read(f).figures['yours.kwhBlock'], { value: 0.336, runs: { count: 2, kWh: 840, days: 84, blocks: 2500 } });
  assert.deepEqual(read(f, 'lionsmane', { days: daysOf(10, ['2026-10-01']) }).figures['yours.kwhBlock'], { value: null, pending: true, runs: { count: 2 } });
  assert.equal(read(f, 'lionsmane', { days: daysOf(0) }).figures['yours.kwhBlock'], undefined, 'no kWh recorded: left to the next source');
  // 20 Sep 2027: run 1 started 405 days before, past the 400 kept; run 2 alone
  const kept = read(f, 'lionsmane', { today: '2027-09-20', days: daysOf(10, [], '2027-09-20') });
  assert.deepEqual(kept.figures['yours.kwhBlock'], { value: 0.41, runs: { count: 1, kWh: 410, days: 41, blocks: 1000 } });
  assert.equal(read(f, 'lionsmane', { today: '2027-11-15', days: daysOf(10, [], '2027-11-15') }).figures['yours.kwhBlock'], undefined, 'both past the kept days');
});

test('a part that throws is logged and named; its figures are left to the next source, the rest still read', (t) => {
  const f = farm(t);
  const logged = [];
  const broken = { list() { throw new Error('boom'); } };
  const out = read(f, 'lionsmane', { batches: broken, log: (what, err) => logged.push(`${what} ${err.message}`) });
  assert.deepEqual(out.errors, { batches: PART_FAILED });
  assert.deepEqual(logged, ["Economics: couldn't read batches: boom"]);
  assert.equal(out.figures.blockPrice, undefined);
  assert.equal(out.figures['yours.yieldG'].value, 225);
  const noHarvest = read(f, 'lionsmane', { harvests: { roomView() { throw new Error('x'); } }, log: () => {} });
  assert.deepEqual(noHarvest.errors, { harvest: PART_FAILED });
  assert.deepEqual(Object.keys(noHarvest.figures), ['yours.blocks']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-runs.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `server/economics-runs.js`.

- [ ] **Step 3: Write Your runs**

Create `server/economics-runs.js`:

```js
// Your runs on the Economics page (spec 2026-11-06-economics-design.md 4.4 and 4.5): the yield, selling price, block price
// and electricity per block of a room's finished runs of a crop, and the room's blocks, read from Harvest, Sales, Batches
// and the usage days on each request (never stored). A part that cannot be read is logged and named in errors; its
// figures are left to the next source.
//   yourRuns({ db, harvests, batches, days, room, crop, today, zone, log }) → { figures, errors }

import { addDays, daysBetween } from './task-rules.js';
import { runOn } from './costs-math.js';
import { USAGE_DAYS_KEPT } from './usage.js';

export const PART_FAILED = 'Something went wrong';
export const SALES_AFTER_DAYS = 14; // a run's crop sold farm-wide up to this many days after its end
const DAY_MS = 86_400_000;
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;
const total = (list, f) => list.reduce((s, x) => s + f(x), 0);

// db: the farm database; harvests and batches: the modules' services; days(room, count): the room's usage days back count
// days (roomDays with cachedOnly: a day still being worked out is { pending: true }); room: the room row; crop: a crop key;
// today: the farm's date (YYYY-MM-DD, zone's); zone: the usage days' zone.
// → { figures: { [key]: { value, runs } or { value: null, pending: true, runs } }, errors: { [part]: PART_FAILED } }
export function yourRuns({ db, harvests, batches, days, room, crop, today, zone, log = console.error }) {
  const errors = {};
  const read = (part, fn) => {
    try {
      return fn();
    } catch (err) {
      log(`Economics: couldn't read ${part}:`, err);
      errors[part] = PART_FAILED;
      return null;
    }
  };
  const figures = {};
  const blocks = read('harvest', () => roomBlocks(db, room.id));
  if (blocks) figures['yours.blocks'] = blocks;
  // the counted runs: ended, not partial, with kg of the crop picked (oldest first)
  const counted = read('harvest', () => harvests.roomView(room.id).past
    .filter((r) => !r.partial && r.endedAt !== null && r.byCrop.some((c) => c.crop === crop && c.kg > 0))
    .map((r) => ({ ...r, own: r.byCrop.find((c) => c.crop === crop) }))
    .toReversed());
  if (!counted?.length) return { figures, errors };
  const span = { count: counted.length, from: counted[0].startedAt, to: counted.at(-1).endedAt };

  const kg = total(counted, (r) => r.own.kg);
  const put = total(counted, (r) => r.own.blocks);
  if (put > 0) {
    figures['yours.yieldG'] = { value: round((kg / put) * 1000, 1), runs: { ...span, kg: round(kg, 2), blocks: put } };
    figures['yours.loss'] = { value: 0, runs: span }; // counted in the yield (spec 4.4)
  }

  // Costs' runs of the room (its runOn rule ties a day to the run open on it)
  const roomRuns = db.cropRuns(room.id).map((r) => ({
    id: r.id, roomId: room.id, startDate: zone.label(r.startedAt), endDate: r.endedAt === null ? null : zone.label(r.endedAt),
    blocks: total(r.crops, (c) => c.blocks),
  }));
  const ids = new Set(counted.map((r) => r.id));
  const price = read('sales', () => salesPrice(db, { room, crop, roomRuns, ids, span, today, zone }));
  if (price) figures.price = price;
  const blockPrice = read('batches', () => batchPrice(batches, { crop, ids, count: span.count }));
  if (blockPrice) figures.blockPrice = blockPrice;
  const kwh = read('energy', () => energy({ days, room, counted, roomRuns, today, zone }));
  if (kwh) figures['yours.kwhBlock'] = kwh;
  return { figures, errors };
}

// The room's blocks now (its Crop tab); an empty room: its latest run's.
function roomBlocks(db, roomId) {
  const now = db.getProgram(roomId)?.crops ?? [];
  if (now.length) return { value: total(now, (c) => c.blocks), runs: { from: 'crop' } };
  const last = db.cropRuns(roomId)[0];
  return last ? { value: total(last.crops, (c) => c.blocks), runs: { from: 'run', at: last.startedAt } } : null;
}

// Σ total ÷ Σ kg of the crop's sale lines tied to a counted run (its run, or its room on a day of the run); none tied: the
// crop's sales farm-wide from the first counted run's start to 14 days after the last one's end.
function salesPrice(db, { room, crop, roomRuns, ids, span, today, zone }) {
  const lines = db.salesBetween(0, Number.MAX_SAFE_INTEGER).filter((s) => s.crop === crop);
  const runOf = (s) => s.runId ?? (s.roomId === room.id ? runOn(roomRuns, room.id, zone.label(s.soldAt), today)?.id ?? null : null);
  const tied = lines.filter((s) => ids.has(runOf(s)));
  const until = span.to + SALES_AFTER_DAYS * DAY_MS;
  const used = tied.length ? tied : lines.filter((s) => s.soldAt >= span.from && s.soldAt <= until);
  const kg = total(used, (s) => s.kg);
  if (!(kg > 0)) return null;
  const sum = total(used, (s) => s.total);
  return {
    value: round(sum / kg, 2),
    runs: { ...span, kg: round(kg, 2), total: round(sum, 2), farmWide: !tied.length, ...(tied.length ? {} : { until }) },
  };
}

// Σ (blocks × price) ÷ Σ blocks of the crop's batches on a counted run with a price; the ones without left out (counted).
function batchPrice(batches, { crop, ids, count }) {
  const own = batches.list().batches.filter((b) => b.crop === crop && ids.has(b.runId));
  const priced = own.filter((b) => b.pricePerBlock !== null && b.pricePerBlock !== undefined);
  const blocks = total(priced, (b) => b.blocks);
  if (!(blocks > 0)) return null;
  return {
    value: round(total(priced, (b) => b.blocks * b.pricePerBlock) / blocks, 2),
    runs: { count, blocks, batches: priced.length, batchesLeftOut: own.length - priced.length },
  };
}

// Σ kWh of the counted runs' days ÷ Σ blocks of those runs (every crop: the room's electricity serves every block). A run
// starting before the kept days, or with no kWh at all, is left out; a day still being worked out makes it pending.
function energy({ days, room, counted, roomRuns, today, zone }) {
  const kept = counted.filter((r) => daysBetween(zone.label(r.startedAt), today) + 1 <= USAGE_DAYS_KEPT);
  if (!kept.length) return null;
  const count = daysBetween(zone.label(kept[0].startedAt), today) + 1;
  const byDate = new Map(days(room, count).map((d) => [d.date, d]));
  let kWh = 0;
  let blocks = 0;
  let dayCount = 0;
  let runs = 0;
  for (const r of kept) {
    const own = [];
    const [from, to] = [zone.label(r.startedAt), zone.label(r.endedAt)];
    for (let d = from; d <= to; d = addDays(d, 1)) if (runOn(roomRuns, room.id, d, today)?.id === r.id && byDate.has(d)) own.push(byDate.get(d));
    if (own.some((d) => d.pending)) return { value: null, pending: true, runs: { count: kept.length } };
    const sum = total(own, (d) => d.kWh);
    if (!(sum > 0)) continue;
    kWh += sum;
    blocks += total(r.crops, (c) => c.blocks);
    dayCount += own.length;
    runs += 1;
  }
  if (!(blocks > 0)) return null;
  return { value: round(kWh / blocks, 3), runs: { count: runs, kWh: round(kWh, 1), days: dayCount, blocks } };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-runs.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add server/economics-runs.js tests/economics-runs.test.js
git commit -m "Economics: Your runs (the yield, selling price, block price and electricity per block of a room's finished runs of a crop, and its blocks), read live from Harvest, Sales, Batches and the usage days; a part that throws is named and left to the next source"
```

---

### Task 5: Work it out's body and figure `server/economics-sim.js` (spec 6.1)

**Files:**
- Create: `server/economics-sim.js`
- Test: `tests/economics-sim.test.js`

The body is one of the room's simulations: the crop and the room's blocks, ready-to-fruit blocks fruiting from in band, one block life (1 to 90 days), the walls, weather and filter of its newest simulation (else Simulate's defaults: `PHYSICS_FIELDS`' `def`), its machines as Simulate's step 1 takes them (`roomMachines` in `web/simulate-math.js`). The simulation's own checks (`validateSimulation`) must take it.

- [ ] **Step 1: Write the failing test**

Create `tests/economics-sim.test.js`:

```js
// Work it out's body and figure (server/economics-sim.js, spec 2026-11-06-economics-design.md 6.1): the room's machines
// from Setup, the walls and weather of its newest simulation else Simulate's defaults, the block life as the days (1 to 90),
// a body the simulation's own checks take; kWh per block from a done run, scaled when the life is over 90 days.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { validateSimulation } from '../server/simulations.js';
import { simBody, simFigure, MAX_SIM_DAYS } from '../server/economics-sim.js';

const T = Date.UTC(2026, 10, 6, 6);
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

test('a room with nothing rated and no simulation: Simulate\'s defaults, said in the note; one block life of the crop', () => {
  const db = openDb(':memory:');
  const room = db.getRoom(db.createRoom(ROOM, T).id);
  const { body, days, machinesNote } = simBody({ room, lastRun: null, crop: 'lionsmane', blocks: 1482, life: 42 });
  assert.deepEqual(body, {
    physics: { wallUA: 80, sunW: 300, outdoorHigh: 33, outdoorLow: 25, outdoorDew: 24, fanFlow: 600, acBTU: 12000, humidifierLH: room.humidifierLH, dehumidifierLday: 0 },
    crops: [{ crop: 'lionsmane', blocks: 1482 }], farmType: 'ready', stage: 'fruiting', start: 'band', days: 42,
  });
  assert.equal(days, 42);
  assert.match(machinesNote, /Fan flow/);
  assert.equal(validateSimulation(body).error, undefined, 'the simulation\'s checks take it');
  db.close();
});

test('the newest run\'s walls, weather and filter; the room\'s rated aircon; the days 1 to 90', () => {
  const db = openDb(':memory:');
  const id = db.createRoom(ROOM, T).id;
  db.updateRoom(id, { ...db.getRoom(id), acInputW: 2100, humidifierLH: 4 });
  const room = db.getRoom(id);
  const lastRun = { createdAt: T, input: { physics: {
    wallUA: 30, sunW: 900, outdoorHigh: 34, outdoorLow: 24, outdoorDew: 23, fanFlow: 450, acBTU: 9000, humidifierLH: 2,
    fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80, filterLifeDays: 90, filterChangeDays: 0, filterUsedDays: 10, filterSensor: false,
  } } };
  const { body } = simBody({ room, lastRun, crop: 'oyster', blocks: 500, life: 60 });
  assert.deepEqual(body.physics, {
    wallUA: 30, sunW: 900, outdoorHigh: 34, outdoorLow: 24, outdoorDew: 23, fanMaxPa: 200, filterCleanPa: 40, filterFinalPa: 80,
    filterLifeDays: 90, filterChangeDays: 0, filterUsedDays: 10, filterSensor: false, fanFlow: 450, acBTU: 24000, humidifierLH: 4, dehumidifierLday: 0,
  });
  assert.equal(validateSimulation(body).error, undefined);
  assert.equal(simBody({ room, lastRun, crop: 'woodear', blocks: 500, life: 120 }).days, MAX_SIM_DAYS);
  assert.equal(simBody({ room, lastRun, crop: 'pink', blocks: 500, life: 0.4 }).days, 1);
  db.close();
});

test('simFigure: kWh ÷ blocks to 3 places; a life over the run\'s days scales the kWh; no energy, no figure', () => {
  const run = { input: { days: 42, crops: [{ crop: 'lionsmane', blocks: 1482 }] }, summary: { energy: { kWh: 708.7 } } };
  assert.deepEqual(simFigure(run, 42), { value: 0.478, kwh: 708.7, blocks: 1482, days: 42 });
  const long = { input: { days: 90, crops: [{ crop: 'woodear', blocks: 1000 }] }, summary: { energy: { kWh: 600 } } };
  assert.deepEqual(simFigure(long, 120), { value: 0.8, kwh: 800, blocks: 1000, days: 120 });
  assert.deepEqual(simFigure(long, undefined), { value: 0.6, kwh: 600, blocks: 1000, days: 90 }, 'the life unknown: the run\'s days');
  assert.equal(simFigure({ ...run, summary: null }, 42), null);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-sim.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `server/economics-sim.js`.

- [ ] **Step 3: Write the body and the figure**

Create `server/economics-sim.js`:

```js
// Work it out on the Economics page (spec 2026-11-06-economics-design.md 6): the body of the room's simulation with a crop
// over one block life, and the electricity per block its finished run gives. Pure: the caller reads the room, its newest
// simulation and the figures, and queues the body through simulations.start (which never switches a machine).
//   simBody({ room, lastRun, crop, blocks, life }) → { body, days, machinesNote } · simFigure(run, life) → the row's figure

import { PHYSICS_FIELDS, FILTER_KEYS, roomMachines } from '../web/simulate-math.js';

export const MAX_SIM_DAYS = 90; // a simulation's longest run; a longer block life is scaled from it
export const DELETED_TEXT = 'The simulation was deleted';
const WEATHER = PHYSICS_FIELDS.filter((f) => f.group); // the walls, sun and weather: the building's, from the newest run
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

// room: the room row (its ratings on Setup); lastRun: its newest simulation or null; blocks: Your container's blocks; life:
// the block life in days. The walls, weather and filter of the newest run (else Simulate's defaults), the room's machines
// (roomMachines: Setup's, else the newest run's, else Simulate's), ready-to-fruit blocks fruiting from in band.
export function simBody({ room, lastRun, crop, blocks, life }) {
  const p = lastRun?.input?.physics ?? {};
  const physics = Object.fromEntries(WEATHER.map((f) => [f.key, isNumber(p[f.key]) ? p[f.key] : f.def]));
  if (FILTER_KEYS.some((k) => p[k] !== undefined)) {
    for (const k of [...FILTER_KEYS, 'filterSensor']) if (p[k] !== undefined) physics[k] = p[k];
  }
  const { machines, note } = roomMachines({ room, lastRun });
  const days = Math.min(MAX_SIM_DAYS, Math.max(1, Math.round(life)));
  return {
    body: { physics: { ...physics, ...machines }, crops: [{ crop, blocks }], farmType: 'ready', stage: 'fruiting', start: 'band', days },
    days,
    machinesNote: note,
  };
}

// A done run's figure: kWh per block over the block life, to 3 places; a life over the run's days scales its kWh (× life ÷
// days). → { value, kwh, blocks, days } (kwh and days the life's), or null when the run has no energy.
export function simFigure(run, life) {
  const kWh = run.summary?.energy?.kWh;
  const blocks = (run.input?.crops ?? []).reduce((s, c) => s + c.blocks, 0);
  const ran = run.input?.days;
  if (!isNumber(kWh) || !(blocks > 0) || !(ran > 0)) return null;
  const days = isNumber(life) && life > ran ? life : ran;
  const kwh = (kWh * days) / ran;
  return { value: round(kwh / blocks, 3), kwh: round(kwh, 1), blocks, days };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics-sim.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add server/economics-sim.js tests/economics-sim.test.js
git commit -m "Economics: Work it out's simulation body (the crop and the room's blocks over one block life, the newest run's walls and weather, the room's machines from Setup) and its figure (kWh per block, scaled past 90 days)"
```

---

### Task 6: The service `server/economics.js` (spec 4.3, 6.2, 7.2)

**Files:**
- Create: `server/economics.js`
- Test: `tests/economics.test.js`

| Part | Rule |
|---|---|
| Sources | `price`: You set › Your runs › Settings (Yield's expected price) › Research; `blockPrice`, `yours.yieldG`, `yours.blocks`: You set › Your runs › Research; `yours.loss`: You set › Your runs (0, only when the yield is from your runs) › Research; `yours.kwhBlock`: You set › Your runs › Simulator › Research; `tariff`: Settings always; the rest You set › Research. `real`: the source under an owner's figure when it is not research |
| Notes | `'loss-in-yield'`, `'loss-twice'` (a loss set over your runs' yield), `'pending'`, `'not-read:<part>'` |
| Work it out | Refused with 409 while one works for the room and crop, or with the queue's own 409; the simulation's checks refusing the body fail the row at once (200); started, the row works on the run (`sim.status` `'waiting'` while queued); the `simulation` event `done` or `failed` settles it; a run gone fails it ("The simulation was deleted"); at start every row still working is settled from its run |
| Events | `economics { roomId, crop }` on a save, a clear (when a row went), a start and a settle |

- [ ] **Step 1: Write the failing test**

Create `tests/economics.test.js`:

```js
// The Economics service (server/economics.js, spec 2026-11-06-economics-design.md 4, 6 and 7): the real Harvest and Batches
// on one farm; every figure's source in its order, the owner's figure over a real one, the scopes, Settings' prices, the
// room-size research, a part not read; Work it out with a stand-in queue: working, done, failed, deleted, refused, one at a
// time, the room's limit, a restart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../server/db.js';
import { createHarvests } from '../server/harvests.js';
import { createBatches } from '../server/batches.js';
import { createEvents } from '../server/events.js';
import { validateSimulation, RESTART_TEXT } from '../server/simulations.js';
import { writeSettings } from '../server/settings.js';
import { fixedZone } from '../server/usage.js';
import { createEconomics, EconomicsError } from '../server/economics.js';

const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const NOW = at('2026-11-10');
const zone = fixedZone(480);
const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 }; // 69 m³: a 40 ft

// A stand-in for simulations.start: the real checks, a stored queued run; full: the room's limit reached.
function standIn(db, now) {
  return {
    full: false,
    start(roomId, body) {
      const checked = validateSimulation(body);
      if (checked.error) return checked;
      if (this.full) return { error: 'This room already has 5 simulations waiting or running', conflict: true };
      return { run: db.createRun(roomId, { ...checked.input, ctx: {} }, now()) };
    },
  };
}

function setup(t, { rooms = 1, ...more } = {}) {
  const db = openDb(':memory:');
  let clock = NOW;
  const now = () => clock;
  const events = createEvents();
  const heard = [];
  events.subscribe((type, data) => { if (type === 'economics') heard.push(data); });
  const batches = createBatches({ db, now });
  const harvests = createHarvests({ db, now, zone, batchDryKg: batches.dryKgFor });
  const ids = Array.from({ length: rooms }, (_, i) => db.createRoom({ ...ROOM, name: `Container ${i + 1}`, trhAddress: i + 1 }, NOW).id);
  const simulations = standIn(db, now);
  const make = () => createEconomics({ db, harvests, batches, simulations, events, now, zone, log: () => {}, days: (room, count) => [], ...more });
  const econ = make();
  t.after(async () => {
    econ.close();
    harvests.stop();
    await harvests.warmed();
    db.close();
  });
  return { db, events, heard, econ, make, simulations, ids, room: ids[0], setClock: (ms) => { clock = ms; } };
}
const fig = (v, key) => v.figures.find((f) => f.key === key);
const pick = (f) => ({ value: f.value, source: f.source });

test('a new farm: every figure research but the electricity price (Settings); the room\'s size; lion\'s mane without a crop', (t) => {
  const s = setup(t);
  const v = s.econ.view();
  assert.deepEqual(v.rooms, [{ id: s.room, name: 'Container 1' }]);
  assert.deepEqual(v.room, { id: s.room, name: 'Container 1', volume: 69, size: '40 ft', humidifierLH: s.db.getRoom(s.room).humidifierLH });
  assert.deepEqual([v.crop, v.ways, v.left], ['lionsmane', ['yours', 'highland', 'import', 'warm'], [{ way: 'shed', reason: 'warm-strain' }]]);
  assert.deepEqual(v.errors, {});
  assert.equal(v.sim, null);
  assert.ok(v.machinesNote.includes("Simulate's default"));
  assert.deepEqual(pick(fig(v, 'tariff')), { value: 0.55, source: 'settings' });
  assert.deepEqual(pick(fig(v, 'yours.blocks')), { value: 1518, source: 'research' });
  assert.deepEqual(pick(fig(v, 'yours.racks')), { value: 1062.6, source: 'research' }, 'RM 0.70 a block');
  assert.ok(v.figures.filter((f) => f.key !== 'tariff').every((f) => f.source === 'research'));
  assert.deepEqual(Object.keys(fig(v, 'price').research), ['value', 'low', 'high', 'confidence', 'sources', 'note']);
  assert.deepEqual(v.figures.slice(0, 3).map((f) => [f.key, f.way, f.scope]), [['price', 'shared', 'crop'], ['shrink', 'shared', 'crop'], ['pack', 'shared', 'crop']]);
  assert.deepEqual(s.econ.view({ room: s.room, crop: 'oyster' }).ways, ['yours', 'shed']);
});

test('the crop shown without one: the room\'s main crop when one of the four, else lion\'s mane; a bad crop or room refused', (t) => {
  const s = setup(t);
  s.db.setProgram(s.room, { ...s.db.getProgram(s.room), crops: [{ crop: 'oyster', blocks: 300 }, { crop: 'pink', blocks: 500 }] }, { change: 'start', at: NOW });
  assert.equal(s.econ.view().crop, 'pink');
  s.db.setProgram(s.room, { ...s.db.getProgram(s.room), crops: [{ crop: 'black', blocks: 300 }] }, { change: 'restart', at: NOW });
  assert.equal(s.econ.view().crop, 'lionsmane', 'black oyster is not one of the four');
  assert.equal(fig(s.econ.view(), 'yours.blocks').source, 'runs', 'the room\'s own blocks still count');
  assert.throws(() => s.econ.view({ crop: 'black' }), (e) => e instanceof EconomicsError && e.status === 400 && e.message === 'Pick a crop' && e.field === 'crop');
  assert.throws(() => s.econ.view({ room: 99 }), (e) => e.status === 404 && e.message === 'Room not found');
});

test('no rooms: no room, no figures', (t) => {
  const s = setup(t, { rooms: 0 });
  assert.deepEqual(s.econ.view(), {
    rooms: [], room: null, crop: 'lionsmane', ways: ['yours', 'highland', 'import', 'warm'], left: [{ way: 'shed', reason: 'warm-strain' }],
    figures: [], sim: null, machinesNote: null, errors: {},
  });
});

test('the sources in order: You set over Your runs (kept beside it), Your runs, Settings\' expected price, Research', (t) => {
  const s = setup(t);
  const { db, room } = s;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'lionsmane', blocks: 1000 }] }, { change: 'start', at: at('2026-10-01', 9) });
  const run = db.openRun(room);
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 230, pickedAt: at('2026-10-20'), worker: null, taskId: null, at: at('2026-10-20') });
  db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: at('2026-11-05', 9) });
  let v = s.econ.view();
  assert.deepEqual(pick(fig(v, 'yours.yieldG')), { value: 230, source: 'runs' });
  assert.equal(fig(v, 'yours.yieldG').runs.count, 1);
  assert.deepEqual([fig(v, 'yours.loss').value, fig(v, 'yours.loss').source, fig(v, 'yours.loss').notes], [0, 'runs', ['loss-in-yield']]);
  assert.deepEqual(pick(fig(v, 'yours.blocks')), { value: 1000, source: 'runs' }, 'the latest run\'s blocks in an empty room');
  assert.deepEqual(pick(fig(v, 'price')), { value: 50, source: 'research' });
  writeSettings(db, { cropYield: { lionsmane: { dryKg: 0.4, priceKg: 55 } } });
  writeSettings(db, { electricityPrice: 0.6 });
  v = s.econ.view();
  assert.deepEqual(pick(fig(v, 'price')), { value: 55, source: 'settings' });
  assert.deepEqual(pick(fig(v, 'tariff')), { value: 0.6, source: 'settings' });
  s.econ.setFigure({ room, crop: 'lionsmane', key: 'yours.yieldG', value: 250 });
  s.econ.setFigure({ room, crop: 'lionsmane', key: 'yours.loss', value: 5 });
  v = s.econ.setFigure({ room, crop: 'lionsmane', key: 'price', value: 60 });
  assert.deepEqual([fig(v, 'yours.yieldG').source, fig(v, 'yours.yieldG').value, fig(v, 'yours.yieldG').at], ['owner', 250, NOW]);
  assert.deepEqual(fig(v, 'yours.yieldG').real, { value: 230, source: 'runs' });
  assert.deepEqual(fig(v, 'price').real, { value: 55, source: 'settings' });
  assert.deepEqual(pick(fig(v, 'yours.loss')), { value: 5, source: 'owner' });
  assert.deepEqual(fig(v, 'yours.loss').notes, [], 'the yield is the owner\'s now: no runs\' loss under it');
  v = s.econ.clearFigure({ room, crop: 'lionsmane', key: 'yours.yieldG' });
  assert.deepEqual(fig(v, 'yours.loss').notes, ['loss-twice'], 'a loss set over your runs\' yield counts lost blocks twice');
  assert.equal(fig(v, 'yours.loss').real.source, 'runs');
  v = s.econ.clearFigure({ room, crop: 'lionsmane', key: 'yours.loss' });
  assert.deepEqual(pick(fig(v, 'yours.loss')), { value: 0, source: 'runs' });
  assert.equal(fig(s.econ.setFigure({ room, crop: 'lionsmane', key: 'wage', value: 12 }), 'wage').real, null, 'nothing real under it');
});

test('the scopes: a crop\'s price for every room, a farm\'s wage for every crop, a room\'s rent for every crop, a yield for one room and crop', (t) => {
  const s = setup(t, { rooms: 2 });
  const [one, two] = s.ids;
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'price', value: 60 });
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'wage', value: 12 });
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'yours.rent', value: 300 });
  s.econ.setFigure({ room: one, crop: 'lionsmane', key: 'yours.yieldG', value: 260 });
  const other = s.econ.view({ room: two, crop: 'lionsmane' });
  assert.deepEqual([fig(other, 'price').value, fig(other, 'wage').value, fig(other, 'yours.rent').source, fig(other, 'yours.yieldG').source], [60, 12, 'research', 'research']);
  const oyster = s.econ.view({ room: one, crop: 'oyster' });
  assert.deepEqual([fig(oyster, 'price').source, fig(oyster, 'wage').value, fig(oyster, 'yours.rent').value, fig(oyster, 'yours.yieldG').source], ['research', 12, 300, 'research']);
  assert.equal(s.heard.length, 4, 'an economics event a save');
  assert.deepEqual(s.heard[0], { roomId: one, crop: 'lionsmane' });
});

test('setFigure and clearFigure refuse: a room not there, a bad crop, a figure not of the crop\'s ways, the electricity price, out of range', (t) => {
  const s = setup(t);
  const refused = (fn, status, message, field) => assert.throws(fn, (e) => e.status === status && e.message === message && e.field === field);
  refused(() => s.econ.setFigure({ room: 99, crop: 'oyster', key: 'price', value: 1 }), 404, 'Room not found', undefined);
  refused(() => s.econ.setFigure({ room: s.room, crop: 'x', key: 'price', value: 1 }), 400, 'Pick a crop', 'crop');
  refused(() => s.econ.setFigure({ room: s.room, crop: 'oyster', key: 'highland.yieldG', value: 1 }), 400, 'Unknown figure', 'key');
  refused(() => s.econ.setFigure({ room: s.room, crop: 'oyster', key: 'tariff', value: 1 }), 400, 'Electricity price is set in Settings', 'key');
  refused(() => s.econ.setFigure({ room: s.room, crop: 'oyster', key: 'yours.loss', value: 100 }), 400, 'Blocks lost must be a number from 0 to 90 %', 'value');
  refused(() => s.econ.clearFigure({ room: s.room, crop: 'oyster', key: 'nope' }), 400, 'Unknown figure', 'key');
  assert.equal(fig(s.econ.clearFigure({ room: s.room, crop: 'oyster', key: 'price' }), 'price').source, 'research', 'nothing set: as it was');
  assert.deepEqual(s.heard, [], 'nothing saved, nothing told');
});

test('a part not read: logged, named in errors, its figures noted and from the next source', (t) => {
  const logged = [];
  const s = setup(t, { batches: { list() { throw new Error('boom'); } }, log: (what) => logged.push(what) });
  const { db, room } = s;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'lionsmane', blocks: 1000 }] }, { change: 'start', at: at('2026-10-01', 9) });
  const run = db.openRun(room);
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 230, pickedAt: at('2026-10-20'), worker: null, taskId: null, at: at('2026-10-20') });
  db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: at('2026-11-05', 9) });
  const v = s.econ.view();
  assert.deepEqual(v.errors, { batches: 'Something went wrong' });
  assert.deepEqual(logged, ["Economics: couldn't read batches:"]);
  assert.deepEqual([fig(v, 'blockPrice').source, fig(v, 'blockPrice').notes], ['research', ['not-read:batches']]);
  assert.equal(fig(v, 'yours.yieldG').source, 'runs', 'the rest still read');
});

test('the electricity per block: Your runs while a day is worked out notes pending and falls to the simulator, then research', (t) => {
  const s = setup(t, { days: (room, count) => Array.from({ length: count }, (_, i) => ({ date: zone.label(NOW - (count - 1 - i) * 86_400_000), pending: true })) });
  const { db, room } = s;
  db.setProgram(room, { ...db.getProgram(room), crops: [{ crop: 'lionsmane', blocks: 1000 }] }, { change: 'start', at: at('2026-10-01', 9) });
  const run = db.openRun(room);
  db.insertHarvest({ roomId: room, runId: run.id, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1000, kg: 230, pickedAt: at('2026-10-20'), worker: null, taskId: null, at: at('2026-10-20') });
  db.setProgram(room, { ...db.getProgram(room), crops: [] }, { change: 'end', at: at('2026-11-05', 9) });
  let f = fig(s.econ.view(), 'yours.kwhBlock');
  assert.deepEqual([f.source, f.value, f.notes, f.runs], ['research', 0.4, ['pending'], { count: 1 }]);
  db.startEconomicsSim({ roomId: room, crop: 'lionsmane', simId: null, at: NOW });
  db.settleEconomicsSim({ roomId: room, crop: 'lionsmane', value: 0.48, at: NOW - 5, kwh: 480, blocks: 1000, days: 42 });
  f = fig(s.econ.view(), 'yours.kwhBlock');
  assert.deepEqual([f.source, f.value, f.at], ['simulator', 0.48, NOW - 5]);
});

test('Work it out: queued (waiting), working with the run\'s progress, done (kWh ÷ blocks saved), again, failed (the figure kept)', (t) => {
  const s = setup(t);
  const { db, room, events } = s;
  const out = s.econ.workOut({ room, crop: 'lionsmane' });
  assert.equal(out.status, 202);
  const [run] = db.listRuns(room);
  assert.deepEqual(run.input.crops, [{ crop: 'lionsmane', blocks: 1518 }]);
  assert.equal(run.input.days, 42, 'one block life at the research defaults');
  assert.deepEqual([out.view.sim.status, out.view.sim.simId, out.view.sim.startedAt, out.view.sim.value], ['waiting', run.id, NOW, null]);
  db.setRunProgress(run.id, 'running', 0.4);
  assert.deepEqual([s.econ.view().sim.status, s.econ.view().sim.progress], ['working', 0.4]);
  assert.throws(() => s.econ.workOut({ room, crop: 'lionsmane' }), (e) => e.status === 409 && e.message === "Already working it out for Container 1 and Lion's mane");
  db.finishRun(run.id, { status: 'done', summary: { energy: { kWh: 725.6 } } }, NOW + 4000);
  events.publish('simulation', { id: run.id, roomId: room, status: 'done', progress: 1 });
  let v = s.econ.view();
  assert.deepEqual([v.sim.status, v.sim.value, v.sim.kwh, v.sim.blocks, v.sim.days, v.sim.at], ['done', 0.478, 725.6, 1518, 42, NOW + 4000]);
  assert.deepEqual(pick(fig(v, 'yours.kwhBlock')), { value: 0.478, source: 'simulator' });
  assert.deepEqual(s.heard.map((h) => h.crop), ['lionsmane', 'lionsmane'], 'told when it started and when it settled');
  s.econ.workOut({ room, crop: 'lionsmane' });
  const again = db.listRuns(room)[0];
  assert.equal(fig(s.econ.view(), 'yours.kwhBlock').value, 0.478, 'the figure before it stays while it works');
  db.finishRun(again.id, { status: 'failed', error: 'The simulation worker stopped (exit code 1)' }, NOW + 9000);
  events.publish('simulation', { id: again.id, roomId: room, status: 'failed', progress: 0 });
  v = s.econ.view();
  assert.deepEqual([v.sim.status, v.sim.error, v.sim.value], ['failed', 'The simulation worker stopped (exit code 1)', 0.478]);
  assert.equal(fig(v, 'yours.kwhBlock').value, 0.478);
});

test('Work it out: a run deleted meanwhile fails it; the room\'s limit and the simulation\'s checks refuse; no queue, no route', (t) => {
  const s = setup(t);
  const { db, room } = s;
  s.econ.workOut({ room, crop: 'oyster' });
  db.deleteRun(db.listRuns(room)[0].id);
  assert.deepEqual([s.econ.view({ room, crop: 'oyster' }).sim.status, s.econ.view({ room, crop: 'oyster' }).sim.error], ['failed', 'The simulation was deleted']);
  s.simulations.full = true;
  assert.throws(() => s.econ.workOut({ room, crop: 'pink' }), (e) => e.status === 409 && e.message === 'This room already has 5 simulations waiting or running');
  s.simulations.full = false;
  db.createRun(room, { physics: { wallUA: 999_999 } }, NOW); // the newest run's walls: out of the simulation's range
  const refused = s.econ.workOut({ room, crop: 'pink' });
  assert.equal(refused.status, 200);
  assert.deepEqual([refused.view.sim.status, refused.view.sim.error], ['failed', 'Wall heat transfer must be a number from 0 to 100000 W/K']);
  const none = createEconomics({ db, harvests: { roomView: () => ({ past: [] }) }, batches: { list: () => ({ batches: [] }) }, now: () => NOW, zone });
  assert.throws(() => none.workOut({ room, crop: 'pink' }), (e) => e.status === 404 && e.message === 'Not found');
});

test('a restart settles every row still working from its run: Simulate\'s restart failure', (t) => {
  const s = setup(t);
  const { db, room } = s;
  s.econ.workOut({ room, crop: 'lionsmane' });
  s.econ.close();
  db.failUnfinishedRuns(RESTART_TEXT, NOW + 1); // what createSimulations does as the farm app starts
  const after = s.make();
  t.after(() => after.close());
  assert.deepEqual([after.view().sim.status, after.view().sim.error], ['failed', 'Stopped by a restart of the farm app']);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `server/economics.js`.

- [ ] **Step 3: Write the service**

Create `server/economics.js`:

```js
// The Economics page's service (spec 2026-11-06-economics-design.md 4, 6 and 7): every figure of a room and crop with where
// it comes from (You set, Your runs, Simulator, Settings, Research), the owner's figures saved and cleared, and Work it out
// (one of the room's simulations, queued through simulations.start) settled from the 'simulation' events. No money is worked
// out here: the page does it with web/economics-model.js. No HTTP.
//   createEconomics({ db, harvests, batches, simulations, events, now, zone, log, days }) → { view, setFigure, clearFigure,
//   workOut, close }

import { readSettings, readCropYield } from './settings.js';
import { roomDays, localZone } from './usage.js';
import { yourRuns } from './economics-runs.js';
import { simBody, simFigure, DELETED_TEXT } from './economics-sim.js';
import { SIM_KEY } from './db.js';
import {
  ECONOMICS_CROPS, WAYS, LEFT, figureOf, figuresFor, placeOf, checkFigure, researchOf, sizeOf,
} from '../web/economics-defaults.js';
import { cropShortName } from '../web/crops.js';
import { blockLife, inputsOf } from '../web/economics-model.js';

// A refused request: status 400, 404 or 409, field the input it is about (the routes reply { error, field }).
export class EconomicsError extends Error {
  constructor(status, message, field = undefined) {
    super(message);
    this.name = 'EconomicsError';
    this.status = status;
    this.field = field;
  }
}

export const DEFAULT_CROP = 'lionsmane'; // the farm's main target (PRODUCT.md)
// The parts each figure's Your runs read (a part not read: its note, the figure from the next source).
const PARTS_OF = {
  'yours.yieldG': ['harvest'], 'yours.loss': ['harvest'], 'yours.blocks': ['harvest'],
  price: ['harvest', 'sales'], blockPrice: ['harvest', 'batches'], 'yours.kwhBlock': ['harvest', 'energy'],
};
// The figures Your runs may give; the rest are You set › Research (price also Settings).
const FROM_RUNS = new Set(Object.keys(PARTS_OF));

// The room's main crop now (the most blocks, the first on a tie) when it is one of the four, else lion's mane.
function cropOf(db, roomId) {
  const crops = db.getProgram(roomId)?.crops ?? [];
  const main = crops.reduce((best, c) => (!best || c.blocks > best.blocks ? c : best), null)?.crop;
  return ECONOMICS_CROPS.includes(main) ? main : DEFAULT_CROP;
}

export function createEconomics({
  db, harvests, batches, simulations = null, events = null, now = Date.now, zone = localZone, log = console.error,
  days = (room, count) => roomDays(db, room, { now: now(), zone, count, cachedOnly: true }),
}) {
  const lives = new Map(); // simulation id → the block life it was started for (the kWh is scaled to it)
  const publish = (roomId, crop) => events?.publish('economics', { roomId, crop });

  // A row working on a run that has ended (or gone): its figure saved, or its failure with the figure before it kept.
  // → true when it settled.
  function settleFrom(row) {
    const run = row.simId === null ? null : db.getRun(row.simId, { withResult: false });
    const where = { roomId: row.roomId, crop: row.crop };
    if (run && run.status !== 'done' && run.status !== 'failed') return false;
    if (!run) db.settleEconomicsSim({ ...where, error: DELETED_TEXT });
    else if (run.status === 'failed') db.settleEconomicsSim({ ...where, error: run.error ?? 'The simulation failed' });
    else {
      const figure = simFigure(run, lives.get(run.id));
      if (figure) db.settleEconomicsSim({ ...where, ...figure, at: run.finishedAt ?? now() });
      else db.settleEconomicsSim({ ...where, error: 'The simulation gave no electricity' });
    }
    lives.delete(row.simId);
    publish(row.roomId, row.crop);
    return true;
  }
  const settleWorking = (match = () => true) => {
    for (const row of db.economicsSimsWorking()) {
      if (!match(row)) continue;
      try {
        settleFrom(row);
      } catch (err) {
        log(err);
      }
    }
  };
  // A restart: every row still working is settled from its run (Simulate fails the unfinished runs as it starts).
  settleWorking();
  const stopListening = events ? events.subscribe((type, data) => {
    if (type === 'simulation' && (data?.status === 'done' || data?.status === 'failed')) settleWorking((row) => row.simId === data.id);
  }) : () => {};

  function roomOf(id) {
    const room = Number.isInteger(id) ? db.getRoom(id) : null;
    if (!room) throw new EconomicsError(404, 'Room not found');
    return room;
  }
  function cropCheck(crop) {
    if (!ECONOMICS_CROPS.includes(crop)) throw new EconomicsError(400, 'Pick a crop', 'crop');
    return crop;
  }
  function keyCheck(key, crop) {
    const f = figureOf(key);
    if (!f || !figuresFor(crop).includes(f)) throw new EconomicsError(400, 'Unknown figure', 'key');
    if (f.settings) throw new EconomicsError(400, `${f.label} is set in Settings`, 'key');
    return f;
  }

  // Every figure of the room and crop (spec 4.3 and 7.2), Your container's blocks first (the racks' default follows them).
  function figuresOf(room, crop) {
    const rows = db.economicsFigures(room.id, crop);
    const owner = new Map(rows.filter((r) => r.source === 'owner').map((r) => [r.key, r]));
    const sim = rows.find((r) => r.source === 'simulator' && r.key === SIM_KEY) ?? null;
    const { electricityPrice } = readSettings(db);
    const expected = readCropYield(db)[crop]?.priceKg;
    const { figures: runs, errors } = yourRuns({ db, harvests, batches, days, room, crop, today: zone.label(now()), zone, log });
    const size = { volume: room.volume, humidifierLH: room.humidifierLH };
    const out = [];
    const value = new Map();
    const list = figuresFor(crop);
    for (const f of [list.find((x) => x.key === 'yours.blocks'), ...list.filter((x) => x.key !== 'yours.blocks')]) {
      const research = researchOf(f.key, crop, size, value.get('yours.blocks'));
      const notes = [];
      const actual = FROM_RUNS.has(f.key) ? runs[f.key] : undefined;
      if (actual?.pending) notes.push('pending');
      for (const part of PARTS_OF[f.key] ?? []) if (errors[part]) notes.push(`not-read:${part}`);
      // the sources after You set, the first first
      const below = [];
      if (f.settings) below.push({ value: electricityPrice, source: 'settings' });
      if (f.key === 'yours.loss') {
        const yieldFrom = out.find((x) => x.key === 'yours.yieldG')?.source;
        if (yieldFrom === 'runs' && actual) below.push({ value: actual.value, source: 'runs' });
      } else if (actual && actual.value !== null) below.push({ value: actual.value, source: 'runs' });
      if (f.key === SIM_KEY && sim?.value !== null && sim?.value !== undefined) below.push({ value: sim.value, source: 'simulator' });
      if (f.key === 'price' && typeof expected === 'number') below.push({ value: expected, source: 'settings' });
      below.push({ value: research.value, source: 'research' });
      const own = f.settings ? undefined : owner.get(f.key);
      const used = own ? { value: own.value, source: 'owner' } : below[0];
      const real = own && below[0].source !== 'research' ? below[0] : null;
      if (f.key === 'yours.loss' && used.source === 'runs') notes.push('loss-in-yield');
      if (f.key === 'yours.loss' && own && out.find((x) => x.key === 'yours.yieldG')?.source === 'runs') notes.push('loss-twice');
      value.set(f.key, used.value);
      out.push({
        key: f.key, way: f.way, scope: f.scope, value: used.value, source: used.source,
        at: used.source === 'owner' ? own.at : used.source === 'simulator' ? sim.at : null,
        real, research, runs: actual?.runs ?? null, notes,
      });
    }
    const order = new Map(list.map((f, i) => [f.key, i]));
    return { figures: out.sort((a, b) => order.get(a.key) - order.get(b.key)), errors, values: Object.fromEntries(value), sim };
  }

  // The simulator row as the page shows it: waiting while its run is queued, the run's progress while it works.
  function simView(row) {
    if (!row) return null;
    const run = row.status === 'working' && row.simId !== null ? db.getRun(row.simId, { withResult: false }) : null;
    return {
      status: run?.status === 'queued' ? 'waiting' : row.status, simId: row.simId, progress: run ? run.progress : null,
      startedAt: row.startedAt, at: row.at, value: row.value, kwh: row.kwh, blocks: row.blocks, days: row.days, error: row.error,
    };
  }

  // GET /api/economics: room and crop null for the first room and its main crop.
  function view({ room = null, crop = null } = {}) {
    if (crop !== null) cropCheck(crop);
    const rooms = db.listRooms();
    if (!rooms.length) {
      const c = crop ?? DEFAULT_CROP;
      return { rooms: [], room: null, crop: c, ways: WAYS[c], left: LEFT[c], figures: [], sim: null, machinesNote: null, errors: {} };
    }
    const r = room === null ? rooms[0] : rooms.find((x) => x.id === room);
    if (!r) throw new EconomicsError(404, 'Room not found');
    const c = crop ?? cropOf(db, r.id);
    settleWorking((row) => row.roomId === r.id && row.crop === c); // a run deleted meanwhile, or an event missed
    const { figures, errors, sim } = figuresOf(r, c);
    const lastRun = db.listRuns(r.id)[0] ?? null;
    return {
      rooms: rooms.map(({ id, name }) => ({ id, name })),
      room: { id: r.id, name: r.name, volume: r.volume, size: sizeOf(r), humidifierLH: r.humidifierLH },
      crop: c, ways: WAYS[c], left: LEFT[c], figures, sim: simView(sim),
      machinesNote: simBody({ room: r, lastRun, crop: c, blocks: 1, life: 1 }).machinesNote,
      errors,
    };
  }

  return {
    view,

    // PUT /api/economics/figures { room, crop, key, value }: the owner's figure, saved where its scope says. → the view.
    setFigure(body) {
      const { room, crop, key, value } = body ?? {};
      const r = roomOf(room);
      const c = cropCheck(crop);
      keyCheck(key, c);
      const refused = checkFigure(key, value);
      if (refused) throw new EconomicsError(400, refused, 'value');
      db.setEconomicsFigure({ ...placeOf(key, r.id, c), key, value, at: now() });
      publish(r.id, c);
      return view({ room: r.id, crop: c });
    },

    // DELETE /api/economics/figures: the owner's figure gone (nothing set: as it was). → the view.
    clearFigure({ room, crop, key }) {
      const r = roomOf(room);
      const c = cropCheck(crop);
      keyCheck(key, c);
      if (db.clearEconomicsFigure({ ...placeOf(key, r.id, c), key })) publish(r.id, c);
      return view({ room: r.id, crop: c });
    },

    // POST /api/economics/work-out { room, crop }: the room's simulation with the crop over one block life, queued.
    // → { status: 202, view } (working), or 200 with the failure when the simulation's checks refuse the body.
    workOut(body) {
      if (!simulations) throw new EconomicsError(404, 'Not found');
      const { room, crop } = body ?? {};
      const r = roomOf(room);
      const c = cropCheck(crop);
      if (db.economicsSimsWorking().some((row) => row.roomId === r.id && row.crop === c)) {
        throw new EconomicsError(409, `Already working it out for ${r.name} and ${cropShortName(c)}`);
      }
      const { values } = figuresOf(r, c);
      const life = blockLife(inputsOf(values, 'yours'));
      const { body: input } = simBody({ room: r, lastRun: db.listRuns(r.id)[0] ?? null, crop: c, blocks: values['yours.blocks'], life });
      const result = simulations.start(r.id, input);
      if (result.error && result.conflict) throw new EconomicsError(409, result.error);
      const where = { roomId: r.id, crop: c };
      if (result.error) {
        db.startEconomicsSim({ ...where, simId: null, at: now() });
        db.settleEconomicsSim({ ...where, error: result.error });
        publish(r.id, c);
        return { status: 200, view: view({ room: r.id, crop: c }) };
      }
      lives.set(result.run.id, life);
      const row = db.startEconomicsSim({ ...where, simId: result.run.id, at: now() });
      publish(r.id, c);
      settleFrom(row); // a run that ended at once (a stand-in) is settled now
      return { status: 202, view: view({ room: r.id, crop: c }) };
    },

    close() {
      stopListening();
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/economics.test.js`
Expected: PASS, 11 tests. Then `npm test`: 2963 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add server/economics.js tests/economics.test.js
git commit -m "Economics: the service (every figure of a room and crop with its source, the owner's over a real one kept beside it, Settings' prices, the room-size research; the owner's figures saved where their scope says; Work it out queued, settled from the simulation events, failed when its run is gone or the farm app restarted)"
```

---

### Task 7: The routes, their wiring, the owner's only (spec 7.1, 7.3)

**Files:**
- Create: `server/economics-api.js`
- Modify: `server/api.js` (four marked lines)
- Modify: `server/live.js` (marked: `OWNER_EVENTS`)
- Modify: `tests/api-login.test.js` (the Economics routes in `ROUTES`, a worker 403 on each)
- Test: `tests/api-economics.test.js`

`server/roles.js` is not changed: no Economics route is on its worker list, so the gate answers a worker 403 "Ask the owner" on each. The live stream (`/api/events`) is on the worker list and passes every event to every stream, so a worker's stream would hear `economics` (a room and crop the owner is planning): `createSse` now keeps the events in `OWNER_EVENTS` from any stream whose sign-in is not an owner's.

- [ ] **Step 1: Write the failing test**

Create `tests/api-economics.test.js`:

```js
// The Economics routes (spec 2026-11-06-economics-design.md 7): GET /api/economics, PUT and DELETE /api/economics/figures,
// POST /api/economics/work-out, their refusals and the 'economics' event; one Work it out through the real simulations queue
// to a saved figure; the owner's only: a worker gets 403 on every route and never hears 'economics' on the live stream.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openDb } from '../server/db.js';
import { createApp } from '../server/app.js';
import { createEvents } from '../server/events.js';
import { createSimulations } from '../server/simulations.js';
import { hashSecret } from '../server/auth.js';
import { OWNER_EVENTS } from '../server/live.js';

const ROOM = { name: 'Container 1', length: 12, width: 2.3, height: 2.5, trhAddress: 1 };

async function app(t, { login = false, simulations = null } = {}) {
  const db = openDb(':memory:');
  const events = createEvents();
  const seen = [];
  events.subscribe((type, data) => seen.push([type, data]));
  const room = db.createRoom(ROOM, Date.now()).id;
  const sims = simulations ? simulations({ db, events }) : null;
  const server = createApp(db, { login, events, simulations: sims, loginNotify: () => {} });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(async () => {
    sims?.close();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    db.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, body, cookie) => {
    const headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(cookie ? { cookie } : {}) };
    const res = await fetch(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
  return { db, events, seen, room, call, base, port: server.address().port };
}
const fig = (v, key) => v.figures.find((f) => f.key === key);
const economics = (seen) => seen.filter(([type]) => type === 'economics').map(([, d]) => d);

test('GET /api/economics: the first room and its crop without a query; the room and crop asked; refusals', async (t) => {
  const { call, room } = await app(t);
  const r = await call('GET', '/api/economics');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(Object.keys(r.body), ['rooms', 'room', 'crop', 'ways', 'left', 'figures', 'sim', 'machinesNote', 'errors']);
  assert.deepEqual([r.body.room.id, r.body.crop], [room, 'lionsmane']);
  const oyster = await call('GET', `/api/economics?room=${room}&crop=oyster`);
  assert.deepEqual([oyster.status, oyster.body.crop, oyster.body.ways], [200, 'oyster', ['yours', 'shed']]);
  assert.deepEqual(await call('GET', '/api/economics?crop=reishi'), { status: 400, body: { error: 'Pick a crop', field: 'crop' } });
  assert.deepEqual(await call('GET', '/api/economics?room=99'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('GET', '/api/economics?room=abc'), { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('POST', '/api/economics'), { status: 404, body: { error: 'Not found' } });
  assert.deepEqual(await call('GET', '/api/economics/nope'), { status: 404, body: { error: 'Not found' } });
  assert.deepEqual(await call('GET', '/api/economics/figures'), { status: 404, body: { error: 'Not found' } });
});

test('PUT and DELETE /api/economics/figures: saved, told, cleared; refusals in their words', async (t) => {
  const { call, room, seen } = await app(t);
  const put = await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'price', value: 55 });
  assert.equal(put.status, 200);
  assert.deepEqual([fig(put.body, 'price').value, fig(put.body, 'price').source], [55, 'owner']);
  assert.deepEqual(economics(seen), [{ roomId: room, crop: 'lionsmane' }]);
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'price', value: 5000 }),
    { status: 400, body: { error: 'Selling price must be a number from 0 to 1000 RM/kg', field: 'value' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'nope', value: 1 }),
    { status: 400, body: { error: 'Unknown figure', field: 'key' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room, crop: 'lionsmane', key: 'tariff', value: 0.6 }),
    { status: 400, body: { error: 'Electricity price is set in Settings', field: 'key' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room: 99, crop: 'lionsmane', key: 'price', value: 1 }),
    { status: 404, body: { error: 'Room not found' } });
  assert.deepEqual(await call('PUT', '/api/economics/figures', { room: String(room), crop: 'lionsmane', key: 'price', value: 1 }),
    { status: 404, body: { error: 'Room not found' } }, 'a room is a whole number');
  const del = await call('DELETE', `/api/economics/figures?room=${room}&crop=lionsmane&key=price`);
  assert.deepEqual([del.status, fig(del.body, 'price').source], [200, 'research']);
  const again = await call('DELETE', `/api/economics/figures?room=${room}&crop=lionsmane&key=price`);
  assert.equal(again.status, 200, 'nothing set: 200 all the same');
  assert.equal(economics(seen).length, 2, 'told once for the save and once for the clear');
  assert.deepEqual(await call('DELETE', '/api/economics/figures?crop=lionsmane&key=price'), { status: 404, body: { error: 'Room not found' } });
});

test('POST /api/economics/work-out without a simulations queue: 404', async (t) => {
  const { call, room } = await app(t);
  assert.deepEqual(await call('POST', '/api/economics/work-out', { room, crop: 'oyster' }), { status: 404, body: { error: 'Not found' } });
});

test('Work it out through the real simulations queue: a 10-block room over one day, to a saved figure', async (t) => {
  const { call, room, seen } = await app(t, {
    simulations: ({ db, events }) => createSimulations({ db, onChange: (type, data) => events.publish(type, data) }),
  });
  for (const [key, value] of [['yours.blocks', 10], ['yours.flushes', 1], ['yours.first', 1], ['yours.turn', 0]]) {
    assert.equal((await call('PUT', '/api/economics/figures', { room, crop: 'oyster', key, value })).status, 200);
  }
  const started = await call('POST', '/api/economics/work-out', { room, crop: 'oyster' });
  assert.equal(started.status, 202, JSON.stringify(started.body));
  assert.ok(['waiting', 'working'].includes(started.body.sim.status));
  assert.equal((await call('POST', '/api/economics/work-out', { room, crop: 'oyster' })).status, 409, 'one at a time');
  for (let i = 0; i < 200 && economics(seen).length < 6; i++) await new Promise((r) => setTimeout(r, 50));
  const v = (await call('GET', `/api/economics?room=${room}&crop=oyster`)).body;
  assert.equal(v.sim.status, 'done', JSON.stringify(v.sim));
  assert.deepEqual([v.sim.blocks, v.sim.days], [10, 1]);
  assert.ok(v.sim.kwh > 0 && Math.abs(v.sim.value - v.sim.kwh / 10) < 0.01, 'kWh ÷ blocks (kWh kept to 0.1, the figure to 0.001)');
  assert.deepEqual([fig(v, 'yours.kwhBlock').source, fig(v, 'yours.kwhBlock').value], ['simulator', v.sim.value]);
  const runs = (await call('GET', `/api/rooms/${room}/simulations`)).body;
  assert.deepEqual([runs.length, runs[0].input.days, runs[0].input.crops], [1, 1, [{ crop: 'oyster', blocks: 10 }]], 'one of the room\'s simulations');
});

// Signs in Ali (a worker, PIN 482913) and Ray (the owner) on a login app. → their cookies.
async function signIns(db, base) {
  db.setWorkers([{ name: 'Ali', active: true }]);
  const ali = db.listWorkers()[0].id;
  db.setSecret(ali, await hashSecret('482913'));
  const ray = db.setOwner('Ray', await hashSecret('long enough password'));
  const signIn = async (id, secret) => {
    const res = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, secret }) });
    return /^farm_session=[^;]+/.exec(res.headers.get('set-cookie'))[0];
  };
  return { worker: await signIn(ali, '482913'), owner: await signIn(ray, 'long enough password') };
}

test('the owner\'s only: a worker gets 403 on every Economics route; the owner is answered', async (t) => {
  const { db, call, base, room } = await app(t, { login: true });
  const { worker, owner } = await signIns(db, base);
  const routes = [
    ['GET', '/api/economics'], ['GET', `/api/economics?room=${room}&crop=oyster`],
    ['PUT', '/api/economics/figures', { room, crop: 'oyster', key: 'price', value: 12 }],
    ['DELETE', `/api/economics/figures?room=${room}&crop=oyster&key=price`],
    ['POST', '/api/economics/work-out', { room, crop: 'oyster' }],
  ];
  for (const [method, path, body] of routes) {
    assert.deepEqual(await call(method, path, body, worker), { status: 403, body: { error: 'Ask the owner' } }, `${method} ${path}`);
  }
  assert.equal(db.economicsFigures(room, 'oyster').length, 0, 'nothing a worker sent was saved');
  assert.equal((await call('GET', '/api/economics', undefined, owner)).status, 200);
  assert.equal((await call('PUT', '/api/economics/figures', { room, crop: 'oyster', key: 'price', value: 12 }, owner)).status, 200);
});

// Opens the live stream with a cookie; until(re) waits for its text to match.
function stream(port, cookie) {
  return new Promise((resolve, reject) => {
    const req = http.get({ port, host: '127.0.0.1', path: '/api/events', headers: { cookie } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (d) => { text += d; });
      resolve({ req, text: () => text });
    });
    req.on('error', reject);
  });
}
const until = async (s, re) => {
  for (let i = 0; i < 100 && !re.test(s.text()); i++) await new Promise((r) => setTimeout(r, 20));
  assert.match(s.text(), re);
};

test('the live stream: a worker\'s never carries economics (the owner\'s events); the owner\'s does', async (t) => {
  assert.deepEqual([...OWNER_EVENTS], ['economics']);
  const { db, events, base, port } = await app(t, { login: true });
  const { worker, owner } = await signIns(db, base);
  const [w, o] = [await stream(port, worker), await stream(port, owner)];
  t.after(() => { w.req.destroy(); o.req.destroy(); });
  await until(w, /event: hello/);
  await until(o, /event: hello/);
  events.publish('economics', { roomId: 1, crop: 'oyster' });
  events.publish('harvest', { roomId: 1 });
  await until(w, /event: harvest/);
  await until(o, /event: harvest/);
  assert.doesNotMatch(w.text(), /economics/);
  assert.match(o.text(), /event: economics\ndata: \{"roomId":1,"crop":"oyster"\}/);
});
```

- [ ] **Step 2: The login test's list of routes**

In `tests/api-login.test.js` (its `ROUTES` must name every route the server answers, and its worker test checks each is 403), replace:

```js
  ['PUT', '/api/sales/deliveries/1', false], ['PUT', '/api/sales/deliveries/1/paid', false], ['PUT', '/api/buyers/1', false],
];
```

with:

```js
  ['PUT', '/api/sales/deliveries/1', false], ['PUT', '/api/sales/deliveries/1/paid', false], ['PUT', '/api/buyers/1', false],
  ['GET', '/api/economics', false], ['PUT', '/api/economics/figures', false], ['POST', '/api/economics/work-out', false], // ---- Economics ----
];
```

- [ ] **Step 3: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-economics.test.js tests/api-login.test.js`
Expected: FAIL: `api-economics` with `SyntaxError: The requested module '../server/live.js' does not provide an export named 'OWNER_EVENTS'`; `api-login`'s "ROUTES has a row for every route…" with "ROUTES rows that name no route".

- [ ] **Step 4: Write the routes**

Create `server/economics-api.js`:

```js
// The Economics page's routes (spec 2026-11-06-economics-design.md 7.1), called from api.js: GET /api/economics?room=&crop=,
// PUT and DELETE /api/economics/figures, POST /api/economics/work-out. server/economics.js does the work; this reads the
// requests and turns its refusals into the API's. The owner's only: server/roles.js lets no worker in (a route not on its
// worker list is 403), and the live stream keeps the 'economics' event from workers (server/live.js).

import { createEconomics, EconomicsError } from './economics.js';
import { localZone } from './usage.js';

const ID = /^[1-9][0-9]{0,14}$/;
const ROUTE = /^\/api\/economics(?:\/figures|\/work-out)?$/; // its three paths; another under /api/economics is the API's 404

// The room of a query: none (null: the first room), else an id; text that is not an id is no room (404).
const roomQuery = (text) => (text === null || text === '' ? null : ID.test(text) ? Number(text) : 0);

// db: the farm database; events: the bus (null in some tests); harvests and batches: api.js's own services; simulations:
// the queue (null: no Work it out). → async (req, res, path, { send, readJson, HttpError, url }) answering true when the path
// is one of its routes; its close() stops listening to the simulations' events.
export function createEconomicsRoutes({ db, events = null, harvests, batches, simulations = null, now = Date.now, zone = localZone, log = console.error }) {
  const economics = createEconomics({ db, harvests, batches, simulations, events, now, zone, log });

  async function route(req, res, path, { send, readJson, HttpError, url }) {
    const q = (name) => url.searchParams.get(name);
    if (path === '/api/economics' && req.method === 'GET') {
      send(res, 200, economics.view({ room: roomQuery(q('room')), crop: q('crop') || null }));
    } else if (path === '/api/economics/figures' && req.method === 'PUT') {
      send(res, 200, economics.setFigure(await readJson(req)));
    } else if (path === '/api/economics/figures' && req.method === 'DELETE') {
      send(res, 200, economics.clearFigure({ room: roomQuery(q('room')) ?? 0, crop: q('crop'), key: q('key') }));
    } else if (path === '/api/economics/work-out' && req.method === 'POST') {
      const { status, view } = economics.workOut(await readJson(req));
      send(res, status, view);
    } else {
      throw new HttpError(404, 'Not found'); // another method
    }
    return true;
  }

  async function economicsRoutes(req, res, path, helpers) {
    if (!ROUTE.test(path)) return false;
    try {
      return await route(req, res, path, helpers);
    } catch (err) {
      if (err instanceof EconomicsError) throw new helpers.HttpError(err.status, err.message, err.field);
      throw err;
    }
  }
  economicsRoutes.close = () => economics.close();
  return economicsRoutes;
}
```

- [ ] **Step 5: Wire them in `server/api.js`**

Replace:

```js
import { createBusinessRoutes } from './business-api.js'; // ---- Summary ----
```

with:

```js
import { createBusinessRoutes } from './business-api.js'; // ---- Summary ----
import { createEconomicsRoutes } from './economics-api.js'; // ---- Economics ----
```

Replace:

```js
  const businessRoutes = createBusinessRoutes({ db, events, harvests, batches }); // ---- Summary ---- (spec 2026-11-06-business-summary-design.md 5)
```

with:

```js
  const businessRoutes = createBusinessRoutes({ db, events, harvests, batches }); // ---- Summary ---- (spec 2026-11-06-business-summary-design.md 5)
  const economicsRoutes = createEconomicsRoutes({ db, events, harvests, batches, simulations }); // ---- Economics ---- (spec 2026-11-06-economics-design.md 7)
```

Replace:

```js
    if (await businessRoutes(req, res, path, { send, HttpError })) return; // ---- Summary ----
```

with:

```js
    if (await businessRoutes(req, res, path, { send, HttpError })) return; // ---- Summary ----
    if (await economicsRoutes(req, res, path, { send, readJson, HttpError, url })) return; // ---- Economics ----
```

Replace:

```js
  api.close = () => { stopTelling(); inventoryApi.stop(); costRoutes.close(); runRoutes.close(); businessRoutes.close(); }; // ---- Inventory, Costs, Runs, Summary ----
```

with:

```js
  api.close = () => { stopTelling(); inventoryApi.stop(); costRoutes.close(); runRoutes.close(); businessRoutes.close(); economicsRoutes.close(); }; // ---- Inventory, Costs, Runs, Summary, Economics ----
```

- [ ] **Step 6: Keep the owner's events from a worker's stream (`server/live.js`)**

Replace:

```js
const KEEPALIVE_MS = 30_000;
```

with:

```js
const KEEPALIVE_MS = 30_000;
// ---- Economics ---- the events only an owner's stream carries (a signed-in worker's never does): the owner's planning figures.
export const OWNER_EVENTS = new Set(['economics']);
```

In `createSse`'s handler replace:

```js
    client.off = events.subscribe((type, data) => write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
```

with:

```js
    const owner = !req.who || req.who.role === 'owner'; // without sign-in (no req.who) every stream is the owner's
    client.off = events.subscribe((type, data) => {
      if (owner || !OWNER_EVENTS.has(type)) write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`); // ---- Economics ----
    });
```

- [ ] **Step 7: Run them to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/api-economics.test.js tests/api-login.test.js tests/live-sse.test.js`
Expected: PASS (api-economics 6 tests; api-login and live-sse as before). Then `npm test`: 2969 tests, 0 fail.

- [ ] **Step 8: Commit**

```bash
git add server/economics-api.js server/api.js server/live.js tests/api-economics.test.js tests/api-login.test.js
git commit -m "Economics: the routes (GET /api/economics, PUT and DELETE /api/economics/figures, POST /api/economics/work-out), wired in api.js; the owner's only: a worker gets 403 on each and a worker's live stream never carries the economics event"
```

---
## Part 3: the page

### Task 8: The seventh tab, its address and the `economics` event (spec 2, 7.3)

**Files:**
- Modify: `web/route.js` (the Economics block, the tab, the page, the parse, the canonical address; marked)
- Modify: `web/business-tabs.js` (its comment: seven tabs)
- Modify: `web/live.js` (`'economics'` in `EVENT_TYPES`)
- Modify: `tests/web-route.test.js` (the tabs test: seven)
- Test: `tests/web-economics-route.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/web-economics-route.test.js`:

```js
// The Economics tab's address (spec 2026-11-06-economics-design.md 2): #/business/economics with its room and crop, the
// seventh Business tab and its strip; the owner's only (a worker's address is Today); the 'economics' event on the stream.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRoute, canonicalHash, isCanonical, ECONOMICS_HASH, economicsHash, BUSINESS_TABS, businessTabOf, businessStrip, workerHash } from '../web/route.js';
import { EVENT_TYPES } from '../web/live.js';

test('#/business/economics: its room (a whole number) and crop (one of the four), each or neither', () => {
  assert.equal(ECONOMICS_HASH, '#/business/economics');
  assert.deepEqual(parseRoute('#/business/economics'), { name: 'economics', room: null, crop: null });
  assert.deepEqual(parseRoute('#/business/economics/'), { name: 'economics', room: null, crop: null });
  assert.deepEqual(parseRoute('#/business/economics?room=3&crop=pink'), { name: 'economics', room: 3, crop: 'pink' });
  assert.deepEqual(parseRoute('#/business/economics?crop=lionsmane'), { name: 'economics', room: null, crop: 'lionsmane' });
  assert.deepEqual(parseRoute('#/business/economics?room=0&crop=reishi'), { name: 'economics', room: null, crop: null }, 'not a room, not one of the four');
  assert.deepEqual(parseRoute('#/business/economics/2'), { name: 'overview' });
});

test('its one address: room then crop, a null left out; others tidied to it', () => {
  assert.equal(economicsHash({ room: 3, crop: 'pink' }), '#/business/economics?room=3&crop=pink');
  assert.equal(economicsHash({ crop: 'oyster' }), '#/business/economics?crop=oyster');
  assert.equal(economicsHash(), '#/business/economics');
  assert.equal(canonicalHash(parseRoute('#/business/economics?crop=pink&room=3')), '#/business/economics?room=3&crop=pink');
  assert.equal(isCanonical('#/business/economics?room=3&crop=pink'), true);
  assert.equal(isCanonical('#/business/economics/'), false);
  assert.equal(isCanonical('#/business/economics?room=x'), false);
});

test('the seventh Business tab, last, its strip shown; the other tabs unchanged', () => {
  assert.deepEqual(BUSINESS_TABS.at(-1), { key: 'economics', label: 'Economics', hash: '#/business/economics' });
  assert.deepEqual(BUSINESS_TABS.map((t) => t.key), ['summary', 'batches', 'inventory', 'sales', 'costs', 'runs', 'economics']);
  assert.equal(businessTabOf(parseRoute('#/business/economics?room=3')), 'economics');
  assert.equal(businessStrip(parseRoute('#/business/economics?room=3&crop=pink')), 'economics');
  assert.equal(businessStrip(parseRoute('#/business/runs')), 'runs');
});

test('the owner\'s only: a worker opening it is sent to Today; the economics event is one the page can hear', () => {
  assert.equal(workerHash(parseRoute('#/business/economics')), '#/today');
  assert.ok(EVENT_TYPES.includes('economics'));
});
```

In `tests/web-route.test.js` replace:

```js
test('the Business tabs: Summary, Batches, Inventory, Sales, Costs, Runs, each its page', async () => {
  const { BUSINESS_TABS, BUSINESS_HASH, INVENTORY_HASH, COSTS_HASH, RUNS_HASH } = await import('../web/route.js');
  assert.deepEqual(BUSINESS_TABS.map((t) => t.key), ['summary', 'batches', 'inventory', 'sales', 'costs', 'runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.label), ['Summary', 'Batches', 'Inventory', 'Sales', 'Costs', 'Runs']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.hash), [BUSINESS_HASH, BATCHES_HASH, INVENTORY_HASH, SALES_HASH, COSTS_HASH, RUNS_HASH]);
```

with:

```js
test('the Business tabs: Summary, Batches, Inventory, Sales, Costs, Runs, Economics, each its page', async () => {
  const { BUSINESS_TABS, BUSINESS_HASH, INVENTORY_HASH, COSTS_HASH, RUNS_HASH, ECONOMICS_HASH } = await import('../web/route.js');
  assert.deepEqual(BUSINESS_TABS.map((t) => t.key), ['summary', 'batches', 'inventory', 'sales', 'costs', 'runs', 'economics']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.label), ['Summary', 'Batches', 'Inventory', 'Sales', 'Costs', 'Runs', 'Economics']);
  assert.deepEqual(BUSINESS_TABS.map((t) => t.hash), [BUSINESS_HASH, BATCHES_HASH, INVENTORY_HASH, SALES_HASH, COSTS_HASH, RUNS_HASH, ECONOMICS_HASH]);
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-route.test.js tests/web-route.test.js`
Expected: FAIL: `web-economics-route` with `SyntaxError: The requested module '../web/route.js' does not provide an export named 'ECONOMICS_HASH'`; `web-route` with `ECONOMICS_HASH` undefined in the tabs test.

- [ ] **Step 3: The route (`web/route.js`)**

Replace:

```js
import { CROP_KEYS } from './crops.js'; // ---- Runs ----
```

with:

```js
import { CROP_KEYS } from './crops.js'; // ---- Runs ----
import { ECONOMICS_CROPS } from './economics-defaults.js'; // ---- Economics ----
```

After the Runs block, replace:

```js
// ---- end Runs ----

// ---- Business (the integration, 2026-11-05; DESIGN.md "Business") ----
```

with:

```js
// ---- end Runs ----
// ---- Economics ---- (spec 2026-11-06-economics-design.md 2): the Economics tab, its room and crop in the query (none: the
// page picks them and writes them in place).
export const ECONOMICS_HASH = '#/business/economics';
export function economicsHash({ room = null, crop = null } = {}) {
  const q = [room ? `room=${room}` : '', crop ? `crop=${crop}` : ''].filter(Boolean).join('&');
  return q ? `${ECONOMICS_HASH}?${q}` : ECONOMICS_HASH;
}
function parseEconomics(hash) {
  const m = /^#\/business\/economics\/?(?:\?(.*))?$/.exec(hash);
  if (!m) return null;
  const p = new URLSearchParams(m[1] ?? '');
  const room = /^[1-9][0-9]{0,14}$/.test(p.get('room') ?? '') ? Number(p.get('room')) : null;
  return { name: 'economics', room, crop: ECONOMICS_CROPS.includes(p.get('crop')) ? p.get('crop') : null };
}
// ---- end Economics ----

// ---- Business (the integration, 2026-11-05; DESIGN.md "Business") ----
```

Replace:

```js
  { key: 'runs', label: 'Runs', hash: RUNS_HASH }, // ---- Runs ----
];
```

with:

```js
  { key: 'runs', label: 'Runs', hash: RUNS_HASH }, // ---- Runs ----
  { key: 'economics', label: 'Economics', hash: ECONOMICS_HASH }, // ---- Economics ----
];
```

Replace:

```js
  ['runs', 'runs'], ['run', 'runs'], // ---- Runs ----
]);
```

with:

```js
  ['runs', 'runs'], ['run', 'runs'], // ---- Runs ----
  ['economics', 'economics'], // ---- Economics ----
]);
```

In `parseRoute` replace:

```js
  const runs = parseRuns(hash ?? ''); // ---- Runs ----
  if (runs) return runs;
```

with:

```js
  const runs = parseRuns(hash ?? ''); // ---- Runs ----
  if (runs) return runs;
  const economics = parseEconomics(hash ?? ''); // ---- Economics ----
  if (economics) return economics;
```

In `canonicalHash` replace:

```js
  if (route.name === 'run') return runHash(route.id);
```

with:

```js
  if (route.name === 'run') return runHash(route.id);
  if (route.name === 'economics') return economicsHash(route); // ---- Economics ----
```

- [ ] **Step 4: The strip's comment and the event**

In `web/business-tabs.js` replace:

```js
// The Business strip (the integration, 2026-11-05; DESIGN.md "Business"): Summary · Batches · Inventory · Sales · Costs · Runs
// over each of the six pages (Runs: spec 2026-11-05-runs-design.md 6; Summary, #/business: spec
// 2026-11-06-business-summary-design.md 2), styled as the room page's tabs (their `.room-tabs` rules:
// underline tabs, the current one in ink on the accent line). On a phone the six scroll sideways: the edge that has more
// fades while a tab is hidden there (the room page's data-more). app.js puts it above the page's own mount; the page itself
```

with:

```js
// The Business strip (the integration, 2026-11-05; DESIGN.md "Business"): Summary · Batches · Inventory · Sales · Costs · Runs
// · Economics over each of the seven pages (Runs: spec 2026-11-05-runs-design.md 6; Summary, #/business: spec
// 2026-11-06-business-summary-design.md 2; Economics: spec 2026-11-06-economics-design.md 2), styled as the room page's tabs
// (their `.room-tabs` rules: underline tabs, the current one in ink on the accent line). On a phone the seven scroll
// sideways: the edge that has more fades while a tab is hidden there (the room page's data-more). app.js puts it above the
// page's own mount; the page itself
```

In `web/live.js` replace:

```js
export const EVENT_TYPES = ['room', 'alarms', 'outdoor', 'simulation', 'sizing', 'tasks', 'harvest', 'batches', 'inventory', 'sales', 'costs'];
```

with:

```js
export const EVENT_TYPES = ['room', 'alarms', 'outdoor', 'simulation', 'sizing', 'tasks', 'harvest', 'batches', 'inventory', 'sales', 'costs', 'economics'];
```

- [ ] **Step 5: Run them to see them pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-route.test.js tests/web-route.test.js tests/web-business-route.test.js tests/web-shell.test.js`
Expected: PASS. Then `npm test`: 2973 tests, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add web/route.js web/business-tabs.js web/live.js tests/web-economics-route.test.js tests/web-route.test.js
git commit -m "Economics: the seventh Business tab at #/business/economics with its room and crop in the address (a worker's address is Today), and the economics event on the page's stream"
```

---

### Task 9: The comparison's words `web/economics-math.js` (spec 8.2–8.4, 8.7)

**Files:**
- Create: `web/economics-math.js`
- Test: `tests/web-economics-math.test.js`

The headline at the golden inputs ("Lion's mane in Container 1: RM 3,003.16 a month, break-even RM 38.23 a kg, pays back in 13 months. A highland grower makes RM 3,152.92 on a quarter of the equipment.") and at every crop's research defaults (11.2's four headlines); every case of 8.2; every row of 8.3. RM through Costs' `moneyText` and `perKgText`, kg through Harvest's `kgText`; a number keeps its unit with a no-break space (the tests read it as a space).

- [ ] **Step 1: Write the failing test**

Create `tests/web-economics-math.test.js`:

```js
// The Economics page's words for the comparison (web/economics-math.js, spec 2026-11-06-economics-design.md 8.2–8.4, 8.7):
// the headline at the golden inputs and at every crop's defaults, every headline case and equipment word, the rows (a loss,
// never, no equipment), the months, a figure with its unit, the lines under the table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthsText, figureText, rangeText, wayName, headline, rows, fillLine, sizedLine, neverLine, leftLine } from '../web/economics-math.js';
import { compare, grow, trade } from '../web/economics-model.js';
import { ECONOMICS_CROPS, WAYS, figuresFor, researchOf } from '../web/economics-defaults.js';

const NB = '\u00a0';
// The words as the spec writes them: a number keeps its unit with a no-break space (the Units Rule), read here as a space.
const plain = (v) => (typeof v === 'string' ? v.replaceAll(NB, ' ') : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)])) : v);
const text = (h) => plain([h.first.map((p) => (typeof p === 'string' ? p : p.text)).join(''), h.second].filter(Boolean).join(' '));

// The model page's inputs (section 11.1) as figures.
const GOLDEN = {
  price: 50, shrink: 10, pack: 3, blockPrice: 6, tariff: 0.551, fixedTnb: 20, wage: 10, life: 60,
  'yours.blocks': 1740, 'yours.yieldG': 250.015, 'yours.flushes': 2, 'yours.loss': 10, 'yours.first': 12, 'yours.interval': 14,
  'yours.turn': 16, 'yours.kwhBlock': 506 / (1740 * 30.4 / 42), 'yours.labourMin': 2.52, 'yours.transport': 0, 'yours.rent': 0,
  'yours.container': 18500, 'yours.cooling': 8580, 'yours.humidifier': 3000, 'yours.fans': 3300, 'yours.racks': 2610,
  ...Object.fromEntries(['highland', 'warm'].flatMap((w) => [
    [`${w}.yieldG`, w === 'warm' ? 124 : 250.015], [`${w}.flushes`, 2], [`${w}.loss`, 10], [`${w}.first`, 12], [`${w}.interval`, 14],
    [`${w}.turn`, 16], [`${w}.labourMin`, 2.52], [`${w}.transport`, w === 'highland' ? 2 : 0], [`${w}.rent`, 0], [`${w}.kwhHouse`, 146],
    [`${w}.house`, 5000], [`${w}.humidifier`, 1500], [`${w}.fans`, w === 'highland' ? 1800 : 3300],
  ])),
  'highland.uphill': 0, 'import.landed': 41.1047, 'import.buyHours': 2, 'import.rent': 0,
};

test('golden: the headline at the model page\'s inputs in Container 1', () => {
  const h = headline(compare(GOLDEN, WAYS.lionsmane), { room: 'Container 1', crop: 'lionsmane', life: 60 });
  assert.equal(text(h), "Lion's mane in Container 1: RM 3,003.16 a month, break-even RM 38.23 a kg, pays back in 13 months. A highland grower makes RM 3,152.92 on a quarter of the equipment.");
});

test('11.2: the headline of every crop at the research defaults in a 40 ft container', () => {
  const room = { volume: 67.4, humidifierLH: 2 };
  const want = {
    oyster: 'Grey oyster in Container 1: −RM 1,400.38 a month loss, break-even RM 18.68 a kg, never pays back. A lowland shed loses less, −RM 814.18, on a tenth of the equipment.',
    pink: 'Pink oyster in Container 1: −RM 234.97 a month loss, break-even RM 20.76 a kg, never pays back. Every other way loses more.',
    woodear: 'Black jelly (wood ear) in Container 1: RM 159.56 a month, break-even RM 23.68 a kg, pays back in 55 months. Importing and reselling makes RM 641.32 with no equipment.',
    lionsmane: "Lion's mane in Container 1: RM 2,183.70 a month, break-even RM 39.95 a kg, pays back in 21 months. A highland grower makes RM 2,649.57 on a fifth of the equipment.",
  };
  for (const crop of ECONOMICS_CROPS) {
    const values = Object.fromEntries(figuresFor(crop).map((f) => [f.key, f.key === 'tariff' ? 0.55 : researchOf(f.key, crop, room, 1482).value]));
    values['yours.blocks'] = 1482;
    assert.equal(text(headline(compare(values, WAYS[crop]), { room: 'Container 1', crop, life: 60 })), want[crop], crop);
  }
});

// A result as the model gives it, with only what the words read.
const r = (way, profit, { equipment = 10_000, kg = 100, be = 30, paybackAll = 12, kind = 'grow' } = {}) => ({ way, kind, profit, equipment, kgSold: kg, be, paybackAll, payback: paybackAll });

test('the headline\'s first sentence: a profit that pays back, one that doesn\'t within the write-off, a loss (its figure in the loss tone), nothing sold', () => {
  const at = (yours) => headline([yours], { room: 'Container 1', crop: 'lionsmane', life: 60 });
  assert.equal(text(at(r('yours', 120, { be: 49.1, paybackAll: Infinity }))), "Lion's mane in Container 1: RM 120.00 a month, break-even RM 49.10 a kg, but it doesn't pay back within the 60 months the equipment is written off over.");
  assert.equal(at(r('yours', 120)).second, null, 'one way shown: no second sentence');
  const loss = headline([r('yours', -1400.38, { be: 18.68, paybackAll: Infinity })], { room: 'Container 1', crop: 'oyster', life: 60 });
  assert.deepEqual(plain(loss.first), ['Grey oyster in Container 1: ', { text: '−RM 1,400.38', tone: 'loss' }, ' a month loss, break-even RM 18.68 a kg, never pays back.']);
  assert.equal(loss.first[1].text, `−RM${NB}1,400.38`, 'RM keeps its figure at a wrap');
  const none = headline([r('yours', -2083, { kg: 0, be: null, paybackAll: Infinity })], { room: 'Container 1', crop: 'oyster', life: 60 });
  assert.equal(text(none), 'Grey oyster in Container 1 sells nothing at these figures: −RM 2,083.00 a month loss.');
  assert.deepEqual(plain(none.first[1]), { text: '−RM 2,083.00', tone: 'loss' });
});

test('the headline\'s second sentence: the best other way (ties in column order) makes more, loses less, yours the most, all lose more', () => {
  const second = (results) => plain(headline(results, { room: 'Container 1', crop: 'lionsmane', life: 60 }).second);
  assert.equal(second([r('yours', 100), r('highland', 300, { equipment: 2306 }), r('warm', 300, { equipment: 9999 })]), 'A highland grower makes RM 300.00 on a quarter of the equipment.');
  assert.equal(second([r('yours', -1400), r('shed', -814.18, { equipment: 1280 })]), 'A lowland shed loses less, −RM 814.18, on a tenth of the equipment.');
  assert.equal(second([r('yours', 3000), r('highland', 2000), r('import', -5, { kind: 'trade', equipment: 0 }), r('warm', -9)]), 'That is the most of the 4 ways; next, a highland grower makes RM 2,000.00.');
  assert.equal(second([r('yours', 3000), r('highland', -1), r('warm', -9)]), 'Every other way loses money at these figures.');
  assert.equal(second([r('yours', -100), r('shed', -900)]), 'Every other way loses more.');
});

test('the equipment words: none, yours none, the nearest fraction, about the same, twice, times', () => {
  const words = (other, yours = 10_000, kind = 'grow') => headline([r('yours', 1, { equipment: yours }), r('highland', 9, { equipment: other, kind })],
    { room: 'R', crop: 'lionsmane', life: 60 }).second.replace(/^A highland grower makes RM.\S+ /, '').replaceAll(NB, ' ');
  assert.equal(words(0, 10_000, 'trade'), 'with no equipment.');
  assert.equal(words(6800, 0), 'on RM 6,800.00 of equipment.');
  assert.equal(words(1280), 'on a tenth of the equipment.');
  assert.equal(words(2306), 'on a quarter of the equipment.');
  assert.equal(words(3400), 'on a third of the equipment.');
  assert.equal(words(5200), 'on half of the equipment.');
  assert.equal(words(7000), 'on two thirds of the equipment.');
  assert.equal(words(8000), 'on three quarters of the equipment.');
  assert.equal(words(9000), 'on about the same equipment.');
  assert.equal(words(11_500), 'on about the same equipment.');
  assert.equal(words(15_000), 'on 1.5 times the equipment.');
  assert.equal(words(20_400), 'on twice the equipment.');
});

test('the rows at the golden inputs: the cold room and import, a loss with "Loss" under it, never, no equipment', () => {
  const [cold, , imp, warm] = compare(GOLDEN, WAYS.lionsmane);
  const table = rows([cold, imp, warm]);
  const at = (key) => table.find((x) => x.key === key);
  assert.deepEqual(table.map((x) => x.label), ['Blocks started a month', 'kg sold a month', 'Income', 'Blocks, or mushrooms bought', 'Electricity', 'Labour',
    'Packing and delivery', 'Transport', 'Rent', 'Equipment written off', 'Costs', 'Profit a month', 'Break-even', 'Equipment',
    'Pays back, equipment only', 'Pays back, with the first fill']);
  const cells = (key) => plain(at(key).cells.map((c) => c.text));
  assert.deepEqual(cells('blocks'), ['1,259', '283.4 kg bought', '1,259']);
  assert.deepEqual(cells('kg'), ['255.0 kg', '255.0 kg', '126.5 kg']);
  assert.deepEqual(cells('income'), ['RM 12,752.48', 'RM 12,752.48', 'RM 6,324.85']);
  assert.deepEqual(cells('bought'), ['RM 7,556.57', 'RM 11,648.60', 'RM 7,556.57']);
  assert.deepEqual(cells('electricity'), ['RM 298.81', 'RM 0.00', 'RM 100.45']);
  assert.deepEqual(cells('labour'), ['RM 528.96', 'RM 608.00', 'RM 528.96']);
  assert.deepEqual(cells('writeOff'), ['RM 599.83', 'RM 0.00', 'RM 163.33']);
  assert.deepEqual(cells('costs'), ['RM 9,749.32', 'RM 13,021.75', 'RM 8,728.80']);
  assert.deepEqual(plain(at('profit').cells), [{ text: 'RM 3,003.16' }, { text: '−RM 269.27', tone: 'loss', sub: 'Loss' }, { text: '−RM 2,403.95', tone: 'loss', sub: 'Loss' }]);
  assert.deepEqual(cells('be'), ['RM 38.23 a kg', 'RM 51.06 a kg', 'RM 69.00 a kg']);
  assert.deepEqual(cells('equipment'), ['RM 35,990.00', 'None', 'RM 9,800.00']);
  assert.deepEqual(cells('payback'), ['10 months', 'No equipment', 'never']);
  assert.deepEqual(cells('paybackAll'), ['13 months', 'No equipment', 'never']);
  assert.equal(rows([grow({ ...inputs, yieldG: 0 })])[12].cells[0].text, '—', 'nothing sold: no break-even');
});
const inputs = { blocks: 1740, yieldG: 250, flushes: 2, loss: 10, first: 12, interval: 14, turn: 16, shrink: 10, price: 50, blockPrice: 6, uphill: 0,
  kwhMonth: 506, tariff: 0.551, fixedTnb: 20, labourMin: 2.52, wage: 10, pack: 3, transport: 0, rent: 0, equipment: 35990, lifeMonths: 60 };

test('the months: under 1, 1, one decimal under 9.95, whole above, never', () => {
  assert.deepEqual(plain([0.5, 1, 6.16, 9.94, 9.99, 13.37, 61.2, Infinity, NaN].map(monthsText)),
    ['under 1 month', '1 month', '6.2 months', '9.9 months', '10 months', '13 months', '61 months', 'never', '—']);
  assert.equal(trade({ price: 1, shrink: 0, pack: 0, wage: 0, landed: 0, buyHours: 0, rent: 0 }, 1).payback, null);
});

test('a figure with its unit, and a research range', () => {
  assert.deepEqual(plain([
    figureText('yours.yieldG', 250.015), figureText('yours.kwhBlock', 0.4), figureText('shrink', 10), figureText('yours.first', 42),
    figureText('yours.first', 1), figureText('yours.labourMin', 2.52), figureText('import.buyHours', 2), figureText('import.buyHours', 1),
    figureText('price', 55), figureText('blockPrice', 6), figureText('yours.rent', 300), figureText('wage', 10), figureText('yours.container', 38100),
    figureText('tariff', 0.5515), figureText('yours.blocks', 1740), figureText('life', 60), figureText('yours.flushes', 2), figureText('yours.flushes', 1),
    figureText('shed.kwhHouse', 60), figureText('price', null),
  ]), [
    '250 g', '0.40 kWh', '10 %', '42 days', '1 day', '2.52 min', '2 hours a day', '1 hour a day', 'RM 55.00 a kg', 'RM 6.00 a block',
    'RM 300.00 a month', 'RM 10.00 an hour', 'RM 38,100.00', 'RM 0.5515 a kWh', '1,740 blocks', '60 months', '2 flushes', '1 flush',
    '60 kWh a month', '—',
  ]);
  assert.equal(plain(rangeText('yours.yieldG', 150, 400)), '150–400 g');
  assert.equal(plain(rangeText('price', 8, 13)), 'RM 8.00–13.00 a kg');
});

test('the way names, and the lines under the table', () => {
  assert.deepEqual(['yours', 'shed', 'highland', 'import', 'warm'].map((w) => wayName(w)), ['Your container', 'Lowland shed', 'Highland grower', 'Import and resell', 'Warm strain']);
  assert.equal(wayName('warm', { sentence: true }), 'A warm strain in a lowland shed');
  assert.equal(wayName('import', { sentence: true, lower: true }), 'importing and reselling');
  const [cold, , , warm] = compare(GOLDEN, WAYS.lionsmane);
  assert.equal(plain(fillLine(cold, { room: 'Container 1', blocks: 1740, first: 12 })), "With the first fill: Container 1's equipment, its first 1,740 blocks (RM 10,440.00) and the costs until the first harvest, 12 days in (RM 326.75).");
  assert.equal(plain(sizedLine('Container 1', 1740)), "Every way is sized to Container 1's 1,740 blocks; a shed or a highland house holds up to 2,000.");
  assert.equal(neverLine([cold, warm], 60), 'Never: not within the 60 months the equipment is written off over.');
  assert.equal(neverLine([cold], 60), null);
  assert.match(leftLine('oyster'), /^Not compared: a highland grower \(grey oyster isn't grown commercially there/);
  assert.equal(leftLine('woodear'), 'Not compared: a highland grower (growth slows sharply below 18 °C).');
  assert.equal(leftLine('lionsmane'), "Not compared: a lowland shed with the usual strain (it fruits at 18–24 °C); the warm strain is the lowland shed for lion's mane.");
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-math.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `web/economics-math.js`.

- [ ] **Step 3: Write the words**

Create `web/economics-math.js`:

```js
// The Economics page's words for the comparison (spec 2026-11-06-economics-design.md 8.2–8.4, 8.7): the headline, the rows
// of "A month, each way", the lines under it, the months and a figure with its unit. Pure: the results are the model's
// (web/economics-model.js compare), every RM through Costs' formatter and every kg through Harvest's (the One Format Rule).
//   monthsText · figureText · rangeText · wayName · headline · ROWS · rows · fillLine · sizedLine · neverLine · leftLine

import { moneyText, perKgText } from './costs-math.js';
import { kgText } from './harvest-math.js';
import { grouped } from './overview-math.js';
import { cropShortName } from './crops.js';
import { figureOf, WAY_NAMES } from './economics-defaults.js';
import { HOUSE_BLOCKS } from './economics-model.js';

const NB = '\u00a0'; // a number keeps its unit at a wrap (the Units Rule)
const DASH = '—';
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const cents = (v) => Math.round(v * 100); // a figure as it shows: a loss under half a sen is none
const upTo = (v, places) => v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: places });

// A payback: "under 1 month", "1 month", one decimal under 9.95 ("6.2 months"), else whole ("13 months"), "never".
export function monthsText(v) {
  if (v === Infinity) return 'never';
  if (!finite(v)) return DASH;
  if (v < 1) return `under${NB}1${NB}month`;
  const text = v < 9.95 ? v.toFixed(1) : grouped(Math.round(v), 0);
  return text === '1.0' ? `1${NB}month` : `${text}${NB}months`;
}

// A figure's number and unit: [before, number, after] ("RM ", "55.00", " a kg"; "", "250", " g").
function parts(key, v) {
  const { unit } = figureOf(key);
  const money = (after) => [`RM${NB}`, grouped(v, 2), after];
  const plural = (one, many) => (v === 1 ? one : many);
  switch (unit) {
    case 'RM/kg': return money(`${NB}a${NB}kg`);
    case 'RM a block': return money(`${NB}a${NB}block`);
    case 'RM a month': return money(`${NB}a${NB}month`);
    case 'RM an hour': return money(`${NB}an${NB}hour`);
    case 'RM': return money('');
    case 'RM/kWh': return [`RM${NB}`, v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }), `${NB}a${NB}kWh`];
    case 'g': return ['', grouped(Math.round(v), 0), `${NB}g`];
    case 'kWh': return ['', grouped(v, 2), `${NB}kWh`];
    case 'kWh a month': return ['', upTo(v, 1), `${NB}kWh a${NB}month`];
    case '%': return ['', upTo(v, 1), `${NB}%`];
    case 'days': return ['', grouped(v, 0), `${NB}${plural('day', 'days')}`];
    case 'min': return ['', grouped(v, 2), `${NB}min`];
    case 'hours a day': return ['', upTo(v, 1), `${NB}${plural('hour', 'hours')} a${NB}day`];
    case 'months': return ['', grouped(v, 0), `${NB}${plural('month', 'months')}`];
    case 'blocks': return ['', grouped(v, 0), `${NB}${plural('block', 'blocks')}`];
    default: return ['', grouped(v, 0), `${NB}${plural('flush', 'flushes')}`]; // flushes per block
  }
}
// "250 g", "RM 55.00 a kg", "42 days", "2 flushes"; a dash without a number.
export function figureText(key, v) {
  if (!finite(v)) return DASH;
  return parts(key, v).join('');
}
// A research range: "150–400 g", "RM 8.00–13.00 a kg".
export function rangeText(key, low, high) {
  const [before, a, after] = parts(key, low);
  return `${before}${a}–${parts(key, high)[1]}${after}`;
}

// A way's name: as a column head, or in a sentence ("A highland grower", lower-cased after a comma).
const IN_A_SENTENCE = { shed: 'A lowland shed', highland: 'A highland grower', import: 'Importing and reselling', warm: 'A warm strain in a lowland shed' };
export const wayName = (way, { sentence = false, lower = false } = {}) => {
  const name = sentence ? IN_A_SENTENCE[way] : WAY_NAMES[way];
  return lower ? name[0].toLowerCase() + name.slice(1) : name;
};

const FRACTIONS = [[0.1, 'a tenth'], [0.2, 'a fifth'], [0.25, 'a quarter'], [1 / 3, 'a third'], [0.5, 'half'], [2 / 3, 'two thirds'], [0.75, 'three quarters']];
// The other way's equipment against yours: "on a quarter of the equipment", "with no equipment", "on twice the equipment".
function equipmentWords(other, yours) {
  if (other.kind === 'trade' || other.equipment === 0) return 'with no equipment';
  if (yours.equipment === 0) return `on ${moneyText(other.equipment)} of equipment`;
  const ratio = other.equipment / yours.equipment;
  if (ratio < 0.875) return `on ${FRACTIONS.reduce((a, b) => (Math.abs(b[0] - ratio) < Math.abs(a[0] - ratio) ? b : a))[1]} of the equipment`;
  if (ratio <= 1.15) return 'on about the same equipment';
  if (ratio >= 1.95 && ratio <= 2.05) return 'on twice the equipment';
  return `on ${upTo(ratio, 1)} times the equipment`;
}

// The headline (spec 8.2): { first: [text or { text, tone: 'loss' }], second: text or null }. results: compare's, Your
// container first; room: its name; crop: its key; life: the months the equipment is written off over.
export function headline(results, { room, crop, life }) {
  const [yours, ...others] = results;
  const name = `${cropShortName(crop)} in ${room}`;
  const loss = (v) => ({ text: moneyText(v), tone: 'loss' });
  let first;
  if (!(yours.kgSold >= 0.05)) { // shows as 0.0 kg
    first = [`${name} sells nothing at these figures: `, loss(yours.profit), ` a${NB}month loss.`];
  } else if (cents(yours.profit) < 0) {
    first = [`${name}: `, loss(yours.profit), ` a${NB}month loss, break-even ${perKgText(yours.be)} a${NB}kg, never pays back.`];
  } else {
    const pays = yours.paybackAll === Infinity
      ? `but it doesn't pay back within the ${life} months the equipment is written off over.`
      : `pays back in ${monthsText(yours.paybackAll)}.`;
    first = [`${name}: ${moneyText(yours.profit)} a${NB}month, break-even ${perKgText(yours.be)} a${NB}kg, ${pays}`];
  }
  if (!others.length) return { first, second: null };
  const best = others.reduce((a, b) => (cents(b.profit) > cents(a.profit) ? b : a));
  let second;
  if (cents(best.profit) > cents(yours.profit)) {
    second = cents(best.profit) > 0
      ? `${wayName(best.way, { sentence: true })} makes ${moneyText(best.profit)} ${equipmentWords(best, yours)}.`
      : `${wayName(best.way, { sentence: true })} loses less, ${moneyText(best.profit)}, ${equipmentWords(best, yours)}.`;
  } else if (cents(yours.profit) > 0) {
    second = cents(best.profit) > 0
      ? `That is the most of the ${results.length} ways; next, ${wayName(best.way, { sentence: true, lower: true })} makes ${moneyText(best.profit)}.`
      : 'Every other way loses money at these figures.';
  } else {
    second = 'Every other way loses more.';
  }
  return { first, second };
}

// The rows of "A month, each way" (spec 8.3): [{ key, label, cell(result) → { text, tone?, sub? } }].
const money = (v) => ({ text: moneyText(v) });
const growOr = (grow, trade) => (r) => (r.kind === 'trade' ? trade(r) : grow(r));
export const ROWS = [
  { key: 'blocks', label: 'Blocks started a month', cell: growOr((r) => ({ text: grouped(Math.round(r.blocksM), 0) }), (r) => ({ text: `${kgText(r.kgBought)} bought` })) },
  { key: 'kg', label: 'kg sold a month', cell: (r) => ({ text: kgText(r.kgSold) }) },
  { key: 'income', label: 'Income', cell: (r) => money(r.income) },
  { key: 'bought', label: 'Blocks, or mushrooms bought', cell: (r) => money(r.cost.blocks) },
  { key: 'electricity', label: 'Electricity', cell: (r) => money(r.cost.electricity) },
  { key: 'labour', label: 'Labour', cell: (r) => money(r.cost.labour) },
  { key: 'packing', label: 'Packing and delivery', cell: (r) => money(r.cost.packing) },
  { key: 'transport', label: 'Transport', cell: (r) => money(r.cost.transport) },
  { key: 'rent', label: 'Rent', cell: (r) => money(r.cost.rent) },
  { key: 'writeOff', label: 'Equipment written off', cell: (r) => money(r.cost.writeOff) },
  { key: 'costs', label: 'Costs', cell: (r) => money(r.costs) },
  { key: 'profit', label: 'Profit a month', cell: (r) => (cents(r.profit) < 0 ? { text: moneyText(r.profit), tone: 'loss', sub: 'Loss' } : money(r.profit)) },
  { key: 'be', label: 'Break-even', cell: (r) => ({ text: r.be === null ? DASH : `${perKgText(r.be)} a${NB}kg` }) },
  { key: 'equipment', label: 'Equipment', cell: growOr((r) => money(r.equipment), () => ({ text: 'None' })) },
  { key: 'payback', label: 'Pays back, equipment only', cell: growOr((r) => ({ text: monthsText(r.payback) }), () => ({ text: 'No equipment' })) },
  { key: 'paybackAll', label: 'Pays back, with the first fill', cell: growOr((r) => ({ text: monthsText(r.paybackAll) }), () => ({ text: 'No equipment' })) },
];
// Every row with its cells, a column per result: [{ key, label, cells }].
export const rows = (results) => ROWS.map(({ key, label, cell }) => ({ key, label, cells: results.map(cell) }));

// The lines under the table.
export const fillLine = (yours, { room, blocks, first }) => `With the first fill: ${room}'s equipment, its first ${grouped(blocks, 0)}${NB}blocks `
  + `(${moneyText(yours.fill)}) and the costs until the first harvest, ${first}${NB}${first === 1 ? 'day' : 'days'} in (${moneyText(yours.rampCost)}).`;
export const sizedLine = (room, blocks) => `Every way is sized to ${room}'s ${grouped(blocks, 0)}${NB}blocks; a shed or a highland house holds up to ${grouped(HOUSE_BLOCKS, 0)}.`;
// When any growing way never pays back.
export const neverLine = (results, life) => (results.some((r) => r.kind === 'grow' && (r.payback === Infinity || r.paybackAll === Infinity))
  ? `Never: not within the ${life} months the equipment is written off over.` : null);
// The ways not compared for the crop (spec 8.4).
const LEFT_WORDS = {
  oyster: 'Not compared: a highland grower (grey oyster isn\'t grown commercially there; it fruits best at 25 °C and Cameron Highlands averages 17.9 °C) and importing (fresh grey oyster keeps 3–4 days and Malaysia grows its own).',
  pink: 'Not compared: a highland grower (too cool to pin: it needs 18–20 °C) and importing (it keeps 1–4 days; none is imported).',
  woodear: 'Not compared: a highland grower (growth slows sharply below 18 °C).',
  lionsmane: 'Not compared: a lowland shed with the usual strain (it fruits at 18–24 °C); the warm strain is the lowland shed for lion\'s mane.',
};
export const leftLine = (crop) => LEFT_WORDS[crop] ?? null;
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-math.test.js`
Expected: PASS, 9 tests. Then `npm test`: 2982 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/economics-math.js tests/web-economics-math.test.js
git commit -m "Economics: the comparison's words (the headline and the best other way with its equipment as a fraction, the rows of a month each way, the months, a figure with its unit, the lines under the table); the golden and the four default headlines"
```

---

### Task 10: The Figures card's words and the typed figures `web/economics-figures.js` (spec 8.5, 8.6, 6.3, 9.2)

**Files:**
- Create: `web/economics-figures.js`
- Test: `tests/web-economics-figures.test.js`

`createDraft()` holds what the owner types: each box's last valid figure over the reply's until it is saved, put back or refused; a box whose text is not a figure keeps its last valid one in the sums and its refusal; a new reply keeps what is typed. It is the page's "typing recalculates at once; an invalid figure keeps the last valid one" (spec 11.3), run here for real.

- [ ] **Step 1: Write the failing test**

Create `tests/web-economics-figures.test.js`:

```js
// The Economics page's Figures card (web/economics-figures.js, spec 2026-11-06-economics-design.md 8.1, 8.5, 8.6, 6.3, 9.2):
// the folds and their heads, the tags, where a figure applies, every note, the simulator's line in each state, the sources
// line, a typed figure checked as the server would, the saved line and the line of a part not read.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  foldsOf, foldHead, tagText, appliesText, noteParts, simText, sourcesLine, valuesOf, typed, boxText, savedText, partsLine, createDraft,
} from '../web/economics-figures.js';
import { figuresFor, researchOf } from '../web/economics-defaults.js';

const NB = ' ';
const plain = (v) => JSON.parse(JSON.stringify(v).replaceAll(NB, ' '));
const at = (d, h = 12) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8)), h - 8);
const ctx = { room: 'Container 1', crop: 'lionsmane' };

// The figures of lion's mane in a 40 ft container, every one research (as the server gives them on a new farm).
function figures() {
  const room = { volume: 67.4, humidifierLH: 2 };
  return figuresFor('lionsmane').map((f) => {
    const research = researchOf(f.key, 'lionsmane', room, 1482);
    const value = f.key === 'tariff' ? 0.55 : research.value; // the electricity price: Settings' default
    return { key: f.key, way: f.way, scope: f.scope, value, source: 'research', at: null, real: null, research, runs: null, notes: [] };
  });
}
const one = (key, more = {}) => ({ ...figures().find((f) => f.key === key), ...more });

test('the folds: Shared by every way and Your container open, then each other shown way closed; their heads', () => {
  const view = { ways: ['yours', 'highland', 'import', 'warm'], figures: figures() };
  const folds = foldsOf(view);
  assert.deepEqual(folds.map((f) => [f.title, f.open, f.figures.length]), [
    ['Shared by every way', true, 8], ['Your container', true, 16], ['Highland grower', false, 14], ['Import and resell', false, 3], ['Warm strain', false, 13],
  ]);
  assert.equal(plain(foldHead(folds[4])), 'Warm strain · 13 figures · all research');
  folds[4].figures[0].source = 'owner';
  folds[4].figures[1].source = 'owner';
  assert.equal(plain(foldHead(folds[4])), 'Warm strain · 13 figures · 2 you set');
  folds[0].figures[4].source = 'settings';
  assert.equal(plain(foldHead(folds[0])), 'Shared by every way · 8 figures', 'neither set nor all research');
});

test('the tags, and where a figure applies', () => {
  assert.deepEqual(plain([
    tagText({ source: 'owner' }), tagText({ source: 'runs', runs: { count: 4 } }), tagText({ source: 'runs', runs: { count: 1 } }),
    tagText({ source: 'runs', runs: { from: 'crop' } }), tagText({ source: 'simulator' }), tagText({ source: 'settings' }), tagText({ source: 'research' }),
  ]), ['You set', 'Your runs · 4 runs', 'Your runs · 1 run', 'Your runs', 'Simulator', 'Settings', 'Research']);
  assert.deepEqual(['wage', 'price', 'yours.rent', 'yours.yieldG'].map((k) => appliesText(one(k), 'Container 1', 'lionsmane')),
    ['Every room and crop', "Every room, Lion's mane", 'Container 1, every crop', "Container 1, Lion's mane"]);
});

test('the research note: confidence, range, its note and its sources (each a link)', () => {
  const [note] = noteParts(one('yours.yieldG'), ctx);
  assert.equal(plain(note.text), "Research, low confidence: 150–400 g. Malaysian 150 g in a warm room; Shandong factory 400 g.");
  assert.deepEqual(note.sources.map((s) => `${s.title} ${s.year}`), ['October defaults 2026', 'Malaysiaaktif 2025', 'Nongji 2023', 'Europe PMC 2023', 'Stamets (archive.org) 1993']);
  assert.equal(note.sources[1].url, 'https://malaysiaaktif.my/2025/04/cendawan-kobis-bunga-tarik-perhatian-penduduk-seberang-perak');
  assert.equal(noteParts(one('import.buyHours'), ctx)[0].sources, undefined, 'a placeholder with no source');
});

test('Your runs\' notes: yield, price tied and farm-wide, block price with batches left out, electricity, blocks, the loss in the yield', () => {
  const runs = { count: 4, from: at('2026-08-12'), to: at('2026-10-30') };
  const note = (key, f) => plain(noteParts(one(key, { source: 'runs', ...f }), ctx).map((n) => n.text));
  assert.deepEqual(note('yours.yieldG', { value: 227.4, runs: { ...runs, kg: 1592, blocks: 7000 } }),
    ["Your runs: 4 finished runs of Lion's mane in Container 1, 12 Aug – 30 Oct: 1,592.0 kg from 7,000 blocks put in (227 g a block, lost blocks counted)."]);
  assert.deepEqual(note('price', { runs: { ...runs, kg: 1480, total: 81400, farmWide: false } }), ['Your runs: 1,480.0 kg sold for RM 81,400.00.']);
  assert.deepEqual(note('price', { runs: { ...runs, kg: 1480, total: 81400, farmWide: true, until: at('2026-11-13') } }),
    ["Your sales: Lion's mane sold farm-wide 12 Aug – 13 Nov, 1,480.0 kg for RM 81,400.00 (no sale was tied to these runs)."]);
  assert.deepEqual(note('blockPrice', { runs: { count: 4, blocks: 7000, batches: 5, batchesLeftOut: 2 } }), ['Your runs: 7,000 blocks in 5 batches. · 2 batches without a price left out.']);
  assert.deepEqual(note('blockPrice', { runs: { count: 4, blocks: 1000, batches: 1, batchesLeftOut: 0 } }), ['Your runs: 1,000 blocks in 1 batch.']);
  assert.deepEqual(note('yours.kwhBlock', { runs: { count: 4, kWh: 3412.6, days: 140, blocks: 7000 } }), ['Your runs: 3,412.6 kWh measured over 140 days for 7,000 blocks.']);
  assert.deepEqual(note('yours.blocks', { runs: { from: 'crop' } }), ["Container 1's blocks now (its Crop tab)."]);
  assert.deepEqual(note('yours.blocks', { runs: { from: 'run', at: at('2026-08-12') } }), ["Container 1's last run, 12 Aug."]);
  assert.deepEqual(note('yours.loss', { value: 0, runs, notes: ['loss-in-yield'] }), ["Counted in your yield: your runs' kg a block is over every block put in."]);
});

test('the owner\'s, Settings\', a pending day, a part not read and a loss counted twice', () => {
  const notes = (f) => plain(noteParts(f, ctx));
  assert.deepEqual(notes(one('yours.yieldG', { source: 'owner', value: 250, at: at('2026-11-06'), real: { value: 227.4, source: 'runs' } })),
    [{ text: 'You set this on 6 Nov · Your runs: 227 g.' }]);
  assert.deepEqual(notes(one('wage', { source: 'owner', value: 12, at: at('2026-11-06') })), [{ text: 'You set this on 6 Nov.' }]);
  assert.deepEqual(notes(one('price', { source: 'settings', value: 55 })), [{ text: 'Your expected price in Settings → Yield.', link: { text: 'Settings', href: '#/settings' } }]);
  assert.deepEqual(notes(one('tariff', { source: 'settings', value: 0.55 })), [{ text: 'Settings → Electricity price; Costs uses it too.' }]);
  const pending = notes(one('yours.kwhBlock', { notes: ['pending'] }));
  assert.deepEqual(pending[0], { text: 'Your runs: working out the energy…' });
  assert.match(pending[1].text, /^Research, medium confidence/);
  assert.deepEqual(notes(one('price', { notes: ['not-read:harvest', 'not-read:sales'] })).slice(0, 2), [
    { text: "Couldn't read Harvest just now; using research.", tone: 'warn' }, { text: "Couldn't read Sales just now; using research.", tone: 'warn' },
  ]);
  assert.deepEqual(notes(one('yours.loss', { source: 'owner', value: 5, at: at('2026-11-06'), real: { value: 0, source: 'runs' }, notes: ['loss-twice'] })), [
    { text: 'You set this on 6 Nov · Your runs: 0 %.' },
    { text: "Your runs' yield already counts lost blocks; a loss here counts them twice.", tone: 'warn' },
  ]);
});

test('the simulator\'s line: never, waiting, working, done (scaled past 90 days), failed, beside your runs', () => {
  const kwh = one('yours.kwhBlock');
  const line = (sim, f = kwh, more = {}) => plain(simText(sim, f, { ...ctx, life: 42, machinesNote: null, ...more }));
  assert.deepEqual(line(null), { text: "Work it out runs Container 1's simulation with Lion's mane for one block life (42 days), with its machines from Setup. Nothing is switched.", action: 'Work it out' });
  assert.equal(line(null, kwh, { machinesNote: "Fan flow at Simulate's default (not on Setup)", life: 120 }).text,
    "Work it out runs Container 1's simulation with Lion's mane for one block life (90 days), with its machines from Setup. Fan flow at Simulate's default (not on Setup). Nothing is switched.");
  assert.deepEqual(line({ status: 'waiting' }), { text: 'Waiting for another simulation…', action: null });
  assert.deepEqual(line({ status: 'working', progress: 0.4 }), { text: 'Working it out · 40 %', action: null });
  const done = { status: 'done', at: at('2026-11-06', 14) + 2 * 60_000, value: 0.478, kwh: 708.7, blocks: 1482, days: 42 };
  assert.deepEqual(line(done, { ...kwh, source: 'simulator' }), { text: 'Simulator, 6 Nov 14:02: 708.7 kWh over 42 days for 1,482 blocks.', action: 'Work it out again' });
  assert.equal(line({ ...done, days: 120, kwh: 800 }, { ...kwh, source: 'simulator' }).text, 'Simulator, 6 Nov 14:02: 800.0 kWh over 120 days (scaled from 90 days) for 1,482 blocks.');
  assert.deepEqual(line({ status: 'failed', error: 'Stopped by a restart of the farm app' }),
    { text: "Couldn't work it out: Stopped by a restart of the farm app. The figure before it stays.", tone: 'warn', action: 'Try again' });
  assert.deepEqual(line(done, { ...kwh, source: 'runs' }), { text: 'Simulator, 6 Nov: 0.48 kWh.', action: 'Work it out again' });
});

test('the sources line: what is real named, the owner\'s counted; all research', () => {
  const list = figures();
  assert.equal(sourcesLine(list.map((f) => (f.key === 'tariff' ? { ...f, source: 'settings' } : f))), 'All research: set your own figures below.');
  const mixed = list.map((f) => ({
    ...f,
    source: { 'yours.yieldG': 'runs', price: 'runs', 'yours.kwhBlock': 'simulator', wage: 'owner', 'yours.rent': 'owner', tariff: 'settings' }[f.key] ?? 'research',
  }));
  assert.equal(plain(sourcesLine(mixed)), 'From your runs: selling price, yield · Simulator: electricity · You set: 2 · The rest is research.');
});

test('a typed figure: checked as the server checks it; the values with the typed ones over the saved', () => {
  assert.deepEqual(typed('price', ' 55 '), { value: 55 });
  assert.deepEqual(typed('price', ''), { error: 'Selling price must be a number from 0 to 1000 RM/kg' });
  assert.deepEqual(typed('price', 'abc'), { error: 'Selling price must be a number from 0 to 1000 RM/kg' });
  assert.deepEqual(typed('yours.blocks', '1740.5'), { error: 'Blocks in the room must be a whole number from 1 to 100000 blocks' });
  const values = valuesOf(figures(), { price: 60 });
  assert.deepEqual([values.price, values.wage, values['yours.blocks']], [60, 10, 1482]);
  assert.deepEqual([boxText(1740), boxText(38.23), boxText(0.40177), boxText(null)], ['1740', '38.23', '0.4018', '']);
});

test('the saved line, and the line of a part not read', () => {
  assert.equal(plain(savedText('price', 55, 'Container 1', 'lionsmane')), 'Saved: Selling price, RM 55.00 a kg, every room.');
  assert.equal(plain(savedText('wage', 12, 'Container 1', 'lionsmane')), 'Saved: Labour cost, RM 12.00 an hour, every room and crop.');
  assert.equal(plain(savedText('yours.rent', 300, 'Container 1', 'lionsmane')), 'Saved: Rent, RM 300.00 a month, Container 1, every crop.');
  assert.equal(plain(savedText('yours.yieldG', 230, 'Container 1', 'lionsmane')), "Saved: Yield per good block, all flushes, 230 g, Container 1 and Lion's mane.");
  assert.equal(plain(partsLine({ sales: 'Something went wrong', energy: 'Something went wrong' })), "Couldn't read Sales and the energy just now · trying again every minute");
  assert.equal(partsLine({}), null);
});

test('the draft: typing a figure recalculates at once; one that is not a figure keeps the last valid one and its refusal; a reply keeps what is typed', () => {
  const draft = createDraft();
  assert.deepEqual(draft.results(), [], 'nothing read yet');
  const reply = { ways: ['yours', 'highland', 'import', 'warm'], figures: figures() };
  draft.use(reply);
  const profit = () => Math.round(draft.results()[0].profit * 100) / 100;
  assert.equal(profit(), 2183.70, 'the research defaults (section 11.2, lion\'s mane)');
  assert.deepEqual(draft.type('price', '55'), { value: 55 });
  assert.ok(profit() > 2183.70 + 1000, 'RM 5 more a kg over 217 kg');
  const at55 = profit();
  assert.deepEqual(draft.type('price', '55x'), { error: 'Selling price must be a number from 0 to 1000 RM/kg' });
  assert.equal(profit(), at55, 'the last valid figure stays in the sums');
  assert.equal(draft.error('price'), 'Selling price must be a number from 0 to 1000 RM/kg');
  assert.equal(draft.unsaved('price'), true);
  draft.use({ ...reply, figures: figures().map((f) => (f.key === 'wage' ? { ...f, value: 12, source: 'owner' } : f)) });
  assert.equal(draft.values().price, 55, 'a new reply keeps the typed figure');
  assert.equal(draft.values().wage, 12);
  draft.drop('price');
  assert.deepEqual([draft.values().price, draft.error('price'), draft.unsaved('price')], [50, null, false]);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-figures.test.js`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `web/economics-figures.js`.

- [ ] **Step 3: Write the Figures card's words**

Create `web/economics-figures.js`:

```js
// The Economics page's Figures card (spec 2026-11-06-economics-design.md 8.1, 8.5, 8.6, 6.3 and 9.2): its folds, each
// figure's tag, where it applies, its note, the simulator's line, the headline's sources line, and a typed figure checked
// before it is sent. Pure: the figures are the server's view (server/economics.js), the words follow the One Format Rule.
//   foldsOf · foldHead · tagText · appliesText · noteParts · simText · sourcesLine · valuesOf · typed · boxText · savedText
//   · partsLine · createDraft

import { checkFigure, figureOf, SOURCES, WAY_NAMES } from './economics-defaults.js';
import { compare } from './economics-model.js';
import { figureText, rangeText } from './economics-math.js';
import { moneyText } from './costs-math.js';
import { kgText } from './harvest-math.js';
import { grouped } from './overview-math.js';
import { farmDate, farmTime, dayMonth } from './tasks-math.js';
import { cropShortName } from './crops.js';
import { DOT } from './text-math.js';

const NB = '\u00a0';
const SETTINGS_HASH = '#/settings';
const dateText = (ms) => dayMonth(farmDate(ms));
const plural = (n, one, many) => `${grouped(n, 0)}${NB}${n === 1 ? one : many}`;

// The folds (spec 8.1): Shared by every way and Your container open, then one per other shown way, closed.
export function foldsOf(view) {
  const ways = ['shared', ...view.ways];
  return ways.map((way) => ({
    way, title: way === 'shared' ? 'Shared by every way' : WAY_NAMES[way], open: way === 'shared' || way === 'yours',
    figures: view.figures.filter((f) => f.way === way),
  })).filter((f) => f.figures.length);
}
// A fold's head: "Lowland shed · 13 figures · all research" ("· 2 you set").
export function foldHead(fold) {
  const set = fold.figures.filter((f) => f.source === 'owner').length;
  const tail = set ? `${set} you set` : fold.figures.every((f) => f.source === 'research') ? 'all research' : null;
  return [fold.title, plural(fold.figures.length, 'figure', 'figures'), tail].filter(Boolean).join(DOT);
}

// The source tag: never colour alone (a neutral chip with its words).
export function tagText(f) {
  if (f.source === 'owner') return 'You set';
  if (f.source === 'runs') return f.runs?.count ? `Your runs${DOT}${plural(f.runs.count, 'run', 'runs')}` : 'Your runs';
  return { simulator: 'Simulator', settings: 'Settings', research: 'Research' }[f.source];
}

// Where a figure applies (its scope): "Every room and crop", "Every room, Lion's mane", "Container 1, every crop",
// "Container 1, Lion's mane".
export function appliesText(f, room, crop) {
  const name = cropShortName(crop);
  return { farm: 'Every room and crop', crop: `Every room, ${name}`, room: `${room}, every crop`, roomCrop: `${room}, ${name}` }[f.scope];
}

const SOURCE_WORDS = { runs: 'Your runs', simulator: 'Simulator', settings: 'Settings' };
const PART_NAMES = { harvest: 'Harvest', sales: 'Sales', batches: 'Batches', energy: 'the energy' };
const USING = { research: 'research', simulator: 'the simulator', settings: 'Settings', runs: 'your runs', owner: 'your figure' };
const span = (runs) => `${dateText(runs.from)} – ${dateText(runs.to)}`;

// What Your runs say of a figure (spec 8.6).
function runsNote(f, { room, crop }) {
  const r = f.runs;
  switch (f.key) {
    case 'yours.yieldG':
      return `Your runs: ${plural(r.count, 'finished run', 'finished runs')} of ${cropShortName(crop)} in ${room}, ${span(r)}: ${kgText(r.kg)} from `
        + `${plural(r.blocks, 'block', 'blocks')} put in (${figureText('yours.yieldG', f.value)} a${NB}block, lost blocks counted).`;
    case 'price':
      return r.farmWide
        ? `Your sales: ${cropShortName(crop)} sold farm-wide ${dateText(r.from)} – ${dateText(r.until)}, ${kgText(r.kg)} for ${moneyText(r.total)} (no sale was tied to these runs).`
        : `Your runs: ${kgText(r.kg)} sold for ${moneyText(r.total)}.`;
    case 'blockPrice':
      return `Your runs: ${plural(r.blocks, 'block', 'blocks')} in ${plural(r.batches, 'batch', 'batches')}.`
        + (r.batchesLeftOut ? `${DOT}${plural(r.batchesLeftOut, 'batch', 'batches')} without a price left out.` : '');
    case 'yours.kwhBlock':
      return `Your runs: ${grouped(r.kWh, 1)}${NB}kWh measured over ${plural(r.days, 'day', 'days')} for ${plural(r.blocks, 'block', 'blocks')}.`;
    case 'yours.blocks':
      return r.from === 'crop' ? `${room}'s blocks now (its Crop tab).` : `${room}'s last run, ${dateText(r.at)}.`;
    default:
      return null;
  }
}

// The note under a figure's row (spec 8.6): [{ text, tone?, link?: { text, href }, sources?: [{ title, url, year }] }].
// ctx: { room, crop }.
export function noteParts(f, ctx) {
  const out = [];
  for (const n of f.notes) {
    if (n.startsWith('not-read:')) {
      out.push({ text: `Couldn't read ${PART_NAMES[n.slice(9)]} just now; using ${USING[f.source]}.`, tone: 'warn' });
    }
  }
  if (f.notes.includes('pending')) out.push({ text: 'Your runs: working out the energy…' });
  if (f.source === 'owner') {
    const real = f.real ? `${DOT}${SOURCE_WORDS[f.real.source]}: ${figureText(f.key, f.real.value)}` : '';
    out.push({ text: `You set this on ${dateText(f.at)}${real}.` });
  } else if (f.source === 'runs' && f.key === 'yours.loss') {
    out.push({ text: 'Counted in your yield: your runs\' kg a block is over every block put in.' });
  } else if (f.source === 'runs') {
    out.push({ text: runsNote(f, ctx) });
  } else if (f.source === 'settings' && f.key === 'price') {
    out.push({ text: 'Your expected price in Settings → Yield.', link: { text: 'Settings', href: SETTINGS_HASH } });
  } else if (f.source === 'settings') {
    out.push({ text: 'Settings → Electricity price; Costs uses it too.' });
  } else if (f.source === 'research') {
    const r = f.research;
    const sources = r.sources.map((id) => SOURCES[id]).filter(Boolean);
    out.push({
      text: `Research, ${r.confidence} confidence: ${rangeText(f.key, r.low, r.high)}.${r.note ? ` ${r.note}.` : ''}`,
      ...(sources.length ? { sources } : {}),
    });
  }
  if (f.notes.includes('loss-twice')) out.push({ text: 'Your runs\' yield already counts lost blocks; a loss here counts them twice.', tone: 'warn' });
  return out;
}

// The Electricity per block row's simulator line (spec 6.3): { text, tone?, action (the button's words) or null }. sim: the
// view's; f: the kwhBlock figure; ctx: { room, crop, life (days), machinesNote }.
export function simText(sim, f, { room, crop, life, machinesNote }) {
  const days = Math.min(90, Math.max(1, Math.round(life)));
  const intro = `Work it out runs ${room}'s simulation with ${cropShortName(crop)} for one block life (${plural(days, 'day', 'days')}), `
    + `with its machines from Setup.${machinesNote ? ` ${machinesNote}.` : ''} Nothing is switched.`;
  if (!sim) return { text: intro, action: 'Work it out' };
  if (sim.status === 'waiting') return { text: 'Waiting for another simulation…', action: null };
  if (sim.status === 'working') return { text: `Working it out${DOT}${Math.round((sim.progress ?? 0) * 100)}${NB}%`, action: null };
  if (sim.status === 'failed') return { text: `Couldn't work it out: ${sim.error}. The figure before it stays.`, tone: 'warn', action: 'Try again' };
  if (f.source !== 'simulator') {
    return { text: `Simulator, ${dateText(sim.at)}: ${figureText('yours.kwhBlock', sim.value)}.`, action: 'Work it out again' };
  }
  const scaled = sim.days > 90 ? ' (scaled from 90 days)' : '';
  return {
    text: `Simulator, ${dateText(sim.at)} ${farmTime(sim.at)}: ${grouped(sim.kwh, 1)}${NB}kWh over ${plural(sim.days, 'day', 'days')}${scaled} for ${plural(sim.blocks, 'block', 'blocks')}.`,
    action: 'Work it out again',
  };
}

// The headline card's sources line (spec 8.1): "From your runs: yield, selling price · Simulator: electricity · You set: 2 ·
// The rest is research." ("All research: set your own figures below." when none is real.)
const SHORT = { 'yours.yieldG': 'yield', price: 'selling price', blockPrice: 'block price', 'yours.kwhBlock': 'electricity', 'yours.blocks': 'blocks' };
export function sourcesLine(figures) {
  const of = (source) => figures.filter((f) => f.source === source && SHORT[f.key]).map((f) => SHORT[f.key]);
  const set = figures.filter((f) => f.source === 'owner').length;
  const parts = [
    of('runs').length ? `From your runs: ${of('runs').join(', ')}` : null,
    of('simulator').length ? `Simulator: ${of('simulator').join(', ')}` : null,
    of('settings').length ? `Settings: ${of('settings').join(', ')}` : null,
    set ? `You set: ${set}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(DOT)}${DOT}The rest is research.` : 'All research: set your own figures below.';
}

// The figures' values by key (the model's input), with the typed ones over them.
export const valuesOf = (figures, typedValues = {}) => ({ ...Object.fromEntries(figures.map((f) => [f.key, f.value])), ...typedValues });

// A figure as typed: { value } or { error } (the server's words, spec 4.2).
export function typed(key, text) {
  const t = String(text).trim();
  const value = t === '' ? NaN : Number(t);
  const error = checkFigure(key, value);
  return error ? { error } : { value };
}
// The box's text: the value without grouping ("1740", "38.23").
export const boxText = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(Math.round(v * 10_000) / 10_000) : '');

// The polite line after a save: "Saved: Selling price, RM 55.00 a kg, every room."
export function savedText(key, value, room, crop) {
  const f = figureOf(key);
  const where = { farm: 'every room and crop', crop: 'every room', room: `${room}, every crop`, roomCrop: `${room} and ${cropShortName(crop)}` }[f.scope];
  return `Saved: ${f.label}, ${figureText(key, value)}, ${where}.`;
}

// The warning at the top of Figures when a part was not read (spec 9.2), or null.
export function partsLine(errors) {
  const parts = Object.keys(errors ?? {}).filter((p) => PART_NAMES[p]).map((p) => PART_NAMES[p]);
  return parts.length ? `Couldn't read ${parts.join(' and ')} just now${DOT}trying again every minute` : null;
}

// The figures as the page holds them while the owner types (spec 8.5, 9.1): the last reply's, with each box's last valid
// figure over it until it is saved, put back or refused; a box whose text is not a figure keeps its last valid one in the
// sums and its refusal. A new reply keeps what is typed. → { use(reply), type(key, text), drop(key), error(key),
// unsaved(key), values(), results() }.
export function createDraft() {
  let figures = [];
  let ways = ['yours'];
  const typedValues = {};
  const errors = {};
  return {
    use(reply) {
      figures = reply.figures;
      ways = reply.ways;
    },
    type(key, text) {
      const t = typed(key, text);
      if ('value' in t) {
        typedValues[key] = t.value;
        delete errors[key];
      } else {
        errors[key] = t.error;
      }
      return t;
    },
    drop(key) {
      delete typedValues[key];
      delete errors[key];
    },
    error: (key) => errors[key] ?? null,
    unsaved: (key) => key in typedValues,
    values: () => valuesOf(figures, typedValues),
    results() {
      return figures.length ? compare(valuesOf(figures, typedValues), ways) : [];
    },
  };
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-figures.test.js`
Expected: PASS, 10 tests. Then `npm test`: 2992 tests, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add web/economics-figures.js tests/web-economics-figures.test.js
git commit -m "Economics: the Figures card's words (folds, tags, where a figure applies, every note, the simulator's line, the sources line, the saved line) and the draft of typed figures checked as the server checks them"
```

---

### Task 11: The page, its mount and its styles (spec 8, 9)

**Files:**
- Create: `web/economics-page.js`
- Modify: `web/app.js` (two marked lines)
- Modify: `web/styles.css` (the `.ec-` block at the end)
- Modify: `tests/web-roles.test.js` (the page in `OWNER_ONLY`: a worker never reaches it)
- Test: `tests/web-economics-page.test.js`

The page reuses the Summary's reader (`createReader`: a stale answer dropped, an older app stops the reads) and `keepFocus` from `web/business-page.js`. Figure rows are built once per room, crop and set of figures and updated in place after, so a repaint never rewrites the box being typed in. On a phone the comparison is one small table a way (CSS shows `.ec-desk` or `.ec-phone`).

- [ ] **Step 1: Write the failing test**

Create `tests/web-economics-page.test.js`:

```js
// The Economics page (web/economics-page.js, spec 2026-11-06-economics-design.md 8 and 9): its mount under the strip, its
// reads and live updates, the cards in order, the folds and rows, typing and saving, the phone's blocks and the .ec- styles.
// The typing (the draft) and the reads (createReader, keepFocus) run for real in their own tests
// (web-economics-figures, web-business-page); here the page's use of them is checked in its source.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (name) => readFileSync(new URL(`../web/${name}`, import.meta.url), 'utf8');
const page = src('economics-page.js');
const app = src('app.js');
const css = src('styles.css');
const ecCss = css.slice(css.indexOf('/* ---- Economics (spec 2026-11-06-economics-design.md 8) ---- */'), css.indexOf('/* ---- end Economics ---- */'));

test('the router mounts it under the strip with the address\'s room and crop; its title', () => {
  assert.ok(app.includes("import * as economics from './economics-page.js'; // ---- Economics ----"));
  assert.ok(app.includes(": route.name === 'economics' ? economics.mount(page, { room: route.room, crop: route.crop }) // ---- Economics ----"));
  assert.ok(page.includes('<h1 class="page-title" tabindex="-1">Economics</h1>'));
  assert.ok(page.includes('What one of your rooms makes a month with a crop, against the other ways to grow it or buy it in.'));
  assert.ok(page.includes("document.title = 'Economics · Mushroom farm';"));
});

test('it reads again on the events, a room\'s crops or name, the stream\'s return and a timer; stale answers dropped, an older app stops', () => {
  assert.ok(page.includes("const LISTEN = ['economics', 'harvest', 'sales', 'batches', 'costs'].filter((type) => EVENT_TYPES.includes(type));"));
  assert.ok(page.includes("live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }),"));
  assert.ok(page.includes('live.onStatus((up) => { if (up) reload.call(); }),'));
  assert.ok(page.includes("live.on('simulation', (d) => {"), 'the progress of its own run');
  assert.ok(page.includes('const reader = createReader({'), 'the Summary\'s reader: a sequence drops a stale answer, a missing route stops');
  assert.ok(page.includes('delay: () => fallbackMs(REFRESH_MS, live.connected()),'));
  assert.ok(page.includes('if (key === painted) return; // the same answer: nothing to paint'));
  assert.ok(page.includes("if (err.status === 404 && err.message === 'Room not found' && want.room !== null) {"));
  assert.ok(page.includes('That room is gone; showing ${reply.room.name}.'));
});

test('the cards in order: the headline, A month, each way, Figures; the selects; no rooms; the banner', () => {
  const at = (s) => page.indexOf(s);
  assert.ok(at('<label for="ec-room">Room</label>') < at('<label for="ec-crop">Crop</label>'));
  assert.ok(at('class="card ec-headline"') < at('<h2 id="ec-compare-title">A month, each way</h2>'));
  assert.ok(at('<h2 id="ec-compare-title">A month, each way</h2>') < at('<h2 id="ec-figures-title">Figures</h2>'));
  assert.ok(page.includes('No rooms yet. Economics plans with one of your rooms.'));
  assert.ok(page.includes('Rooms, to add one'));
  assert.ok(page.includes('<div class="banner" role="alert" hidden>'));
  assert.ok(page.includes("const keepAddress = () => history.replaceState(null, '', economicsHash({ room: reply.room?.id ?? null, crop: reply.crop }));"));
});

test('typing works the money out at once; a save on leaving the box; a refusal under it; no answer keeps it, not saved; Back to default', () => {
  assert.ok(page.includes("box.addEventListener('input', () => onType(f.key, box));"));
  assert.ok(page.includes("box.addEventListener('change', () => onSave(f.key, box));"));
  assert.ok(page.includes('if (t.error) return; // the refusal is under the box; nothing is sent'));
  assert.ok(page.includes("tag.textContent = 'Saving…';"));
  assert.ok(page.includes("request('PUT', '/api/economics/figures', { room: reply.room.id, crop: reply.crop, key, value: t.value })"));
  assert.ok(page.includes('notSaved.add(key); // the typed figure stays in the sums, marked not saved'));
  assert.ok(page.includes("box.setAttribute('aria-invalid', 'true');"));
  assert.ok(page.includes("box.setAttribute('aria-describedby', error.id);"));
  assert.ok(page.includes("request('DELETE', `/api/economics/figures?room=${reply.room.id}&crop=${reply.crop}&key=${encodeURIComponent(key)}`)"));
  assert.ok(page.includes("request('POST', '/api/economics/work-out', { room: reply.room.id, crop: reply.crop })"));
  assert.ok(page.includes("box.inputMode = def.whole ? 'numeric' : 'decimal';"));
});

test('a repaint keeps the cursor and never rewrites a box the owner is typing in', () => {
  assert.ok(page.includes('const typing = box && document.activeElement === box;'));
  assert.ok(page.includes('if (box && !typing && !draft.unsaved(f.key) && !draft.error(f.key)) box.value = boxText(f.value);'));
  assert.ok(page.includes('keepFocus(container, () => {'));
  assert.ok(page.includes("box.dataset.focusKey = `box:${f.key}`;"));
  assert.ok(page.includes('if (next !== shape) {'), 'the rows are rebuilt only for another room, crop or set of figures');
});

test('the styles: one .ec- block, tokens only (no colour of its own), the phone\'s blocks and 44 px taps', () => {
  assert.ok(ecCss.length > 500);
  assert.doesNotMatch(ecCss, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tokens only');
  assert.ok([...ecCss.matchAll(/^\s*([^@/\s][^{]*)\{/gm)].every((m) => m[1].split(/,(?![^(]*\))/).every((s) => /\.ec-/.test(s))), 'every rule is .ec-');
  assert.ok(ecCss.includes('@media (max-width: 600px)'));
  assert.ok(ecCss.includes('.ec-desk { display: none; }'));
  assert.ok(ecCss.includes('.ec-phone { display: grid; gap: 16px; }'));
  assert.ok(ecCss.includes('.ec-box { min-height: 44px; }'));
  assert.ok(ecCss.includes('.ec-fig .co-link, .ec-foot .co-link { display: inline-flex; align-items: center; min-height: 44px; }'));
});
```

In `tests/web-roles.test.js` (a worker's pages are swept for owner routes; an owner's page is named with the guard that keeps a worker out) replace:

```js
  ['runs-page.js', 'Runs and a run', OWNER_PAGE], ['business-page.js', 'the Business summary', OWNER_PAGE],
```

with:

```js
  ['runs-page.js', 'Runs and a run', OWNER_PAGE], ['business-page.js', 'the Business summary', OWNER_PAGE],
  ['economics-page.js', 'Economics', OWNER_PAGE], // ---- Economics ----
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-page.test.js`
Expected: FAIL, `ENOENT` for `web/economics-page.js`.

- [ ] **Step 3: Write the page**

Create `web/economics-page.js`:

```js
// The Economics tab, #/business/economics?room=&crop= (spec 2026-11-06-economics-design.md 8 and 9): what one of the farm's
// rooms makes a month with a crop, against the other ways to grow it or buy it in. The server gives the figures and where
// each comes from; the page works the money out with the model (web/economics-model.js) on every keystroke, saves a figure
// when its box is left, and runs Work it out. It asks again on the economics, harvest, sales, batches and costs events, a
// room's crops or name, when the stream comes back, and on a timer (as the Summary); an answer older than the last asked is
// dropped; an older farm app stops the reads.

import { request, OFFLINE, OUTDATED, routeMissing } from './api.js';
import { economicsHash } from './route.js';
import { live, EVENT_TYPES } from './live.js';
import { fallbackMs, createThrottle } from './live-math.js';
import { keepFocus, createReader } from './business-page.js';
import { ECONOMICS_CROPS, figureOf } from './economics-defaults.js';
import { blockLife, inputsOf } from './economics-model.js';
import { headline, rows, wayName, fillLine, sizedLine, neverLine, leftLine, figureText } from './economics-math.js';
import {
  foldsOf, foldHead, tagText, appliesText, noteParts, simText, sourcesLine, boxText, savedText, partsLine, createDraft,
} from './economics-figures.js';
import { cropShortName } from './crops.js';

const REFRESH_MS = 60_000;
const LISTEN = ['economics', 'harvest', 'sales', 'batches', 'costs'].filter((type) => EVENT_TYPES.includes(type));
const ROOMS_HASH = '#/overview'; // the Overview holds the rooms
const CROP_SELECT = { oyster: 'Grey oyster', pink: 'Pink oyster', woodear: 'Black jelly', lionsmane: "Lion's mane" };

function el(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined && content !== null) node.textContent = content;
  return node;
}
// A link in the Business pages' link look (Costs' .co-link).
const link = (text, href, newTab = false) => {
  const a = el('a', 'co-link', text);
  a.href = href;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  return a;
};
const idOf = (key) => `ec-f-${key.replace('.', '-')}`;
// The words of a failed read: an older farm app, no answer, or the server's own.
const failText = (err) => (routeMissing(err) ? OUTDATED : err.status === 0 ? OFFLINE : err.message);

const PAGE = `
  <div class="page-head">
    <div class="page-titles">
      <h1 class="page-title" tabindex="-1">Economics</h1>
      <p class="page-sub">What one of your rooms makes a month with a crop, against the other ways to grow it or buy it in.</p>
    </div>
  </div>
  <div class="ec-picks" data-picks hidden>
    <div class="field ec-pick"><label for="ec-room">Room</label><select id="ec-room" data-room></select></div>
    <div class="field ec-pick"><label for="ec-crop">Crop</label><select id="ec-crop" data-crop></select></div>
  </div>
  <div class="banner" role="alert" hidden><span data-banner-text></span><button type="button" data-retry>Retry</button></div>
  <p class="sr-only" data-said aria-live="polite"></p>
  <p class="muted ec-gone" data-gone hidden></p>
  <div class="card ec-empty" data-empty hidden>
    <p class="none">No rooms yet. Economics plans with one of your rooms.</p>
    <p class="ec-foot"><a class="co-link" href="${ROOMS_HASH}">Rooms, to add one</a></p>
  </div>
  <div class="ec-page" data-body hidden>
    <section class="card ec-headline" aria-label="The month">
      <p class="ec-lead" data-lead></p>
      <p class="ec-second" data-second></p>
      <p class="muted ec-sources" data-sources></p>
    </section>
    <section class="card ec-compare" aria-labelledby="ec-compare-title">
      <div class="card-head"><h2 id="ec-compare-title">A month, each way</h2></div>
      <div data-table></div>
      <div class="ec-lines" data-lines></div>
    </section>
    <section class="card ec-figures" aria-labelledby="ec-figures-title">
      <div class="card-head"><h2 id="ec-figures-title">Figures</h2></div>
      <p class="muted ec-intro">Change a figure and the page works it out again as you type; it is saved for every device when you leave the box.</p>
      <p class="ec-parts" data-parts hidden></p>
      <div data-folds></div>
    </section>
  </div>`;

let mountSeq = 0; // every mount gets a token; an answer that finds the token changed is dropped

export function mount(container, { room = null, crop = null } = {}) {
  const me = ++mountSeq;
  const alive = () => me === mountSeq;
  container.innerHTML = PAGE;
  const q = (sel) => container.querySelector(sel);
  const els = {
    picks: q('[data-picks]'), room: q('[data-room]'), crop: q('[data-crop]'), banner: q('.banner'), bannerText: q('[data-banner-text]'),
    said: q('[data-said]'), gone: q('[data-gone]'), empty: q('[data-empty]'), body: q('[data-body]'), lead: q('[data-lead]'),
    second: q('[data-second]'), sources: q('[data-sources]'), table: q('[data-table]'), lines: q('[data-lines]'), parts: q('[data-parts]'),
    folds: q('[data-folds]'),
  };
  document.title = 'Economics · Mushroom farm';
  let want = { room, crop }; // the room and crop asked for (null: the server's choice)
  let reply = null;
  let draft = createDraft();
  let painted = '';
  let shape = ''; // the figure rows' keys and room and crop: the rows are rebuilt only when it changes
  const said = (text) => { els.said.textContent = text; };

  // ---- The headline and the comparison: worked out in the browser from the figures (and what is typed) ----
  function paintMoney() {
    const results = draft.results();
    if (!results.length) return;
    const values = draft.values();
    const life = values.life;
    const h = headline(results, { room: reply.room.name, crop: reply.crop, life });
    els.lead.replaceChildren(...h.first.map((p) => (typeof p === 'string' ? p : el('span', 'co-loss', p.text))));
    els.second.textContent = h.second ?? '';
    els.second.hidden = !h.second;
    els.sources.textContent = sourcesLine(reply.figures);
    paintTable(results);
    const lines = [
      fillLine(results[0], { room: reply.room.name, blocks: values['yours.blocks'], first: values['yours.first'] }),
      neverLine(results, life),
      results.length > 1 ? sizedLine(reply.room.name, values['yours.blocks']) : null,
      leftLine(reply.crop),
    ].filter(Boolean);
    els.lines.replaceChildren(...lines.map((t) => el('p', 'muted ec-line', t)));
  }

  // A desk table (a column a way) and, on a phone, one small table a way, Your container first (CSS shows one of them).
  function paintTable(results) {
    const table = rows(results);
    const wrap = el('div', 'us-table-wrap ec-desk');
    wrap.setAttribute('role', 'region');
    wrap.setAttribute('aria-label', 'A month, each way');
    wrap.tabIndex = 0;
    wrap.dataset.focusKey = 'region-compare';
    const t = el('table', 'us-table ec-table');
    t.append(el('caption', 'sr-only', 'A month, each way'));
    const head = el('tr');
    const corner = el('th', '');
    corner.scope = 'col';
    corner.append(el('span', 'sr-only', 'Figure'));
    head.append(corner);
    for (const r of results) {
      const th = el('th', 'num');
      th.scope = 'col';
      th.append(el('span', 'ec-way', wayName(r.way)));
      if (r.way === 'yours') th.append(el('span', 'ec-way-room', reply.room.name));
      head.append(th);
    }
    const thead = el('thead');
    thead.append(head);
    const body = el('tbody');
    for (const row of table) {
      const tr = el('tr');
      tr.dataset.row = row.key;
      const th = el('th', '', row.label);
      th.scope = 'row';
      tr.append(th);
      for (const c of row.cells) tr.append(cellNode('td', c));
      body.append(tr);
    }
    t.append(thead, body);
    wrap.append(t);
    // the phone's: a block a way, its head the way's name with its profit
    const phone = el('div', 'ec-phone');
    results.forEach((r, i) => {
      const block = el('section', 'ec-block');
      const profit = table.find((x) => x.key === 'profit').cells[i];
      const blockHead = el('div', 'ec-block-head');
      const name = el('h3', 'ec-block-name', wayName(r.way));
      if (r.way === 'yours') name.append(el('span', 'ec-way-room', reply.room.name));
      blockHead.append(name, cellNode('p', profit, 'ec-block-profit'));
      const bt = el('table', 'us-table ec-block-table');
      bt.append(el('caption', 'sr-only', `${wayName(r.way)}: a month`));
      const bb = el('tbody');
      for (const row of table.filter((x) => x.key !== 'profit')) {
        const tr = el('tr');
        const th = el('th', '', row.label);
        th.scope = 'row';
        tr.append(th, cellNode('td', row.cells[i]));
        bb.append(tr);
      }
      bt.append(bb);
      block.append(blockHead, bt);
      phone.append(block);
    });
    els.table.replaceChildren(wrap, phone);
  }
  // A cell: its figure, a loss in the critical text with "Loss" under it.
  function cellNode(tag, c, extra = '') {
    const node = el(tag, ['num', extra].filter(Boolean).join(' '));
    node.append(c.tone === 'loss' ? el('span', 'co-loss', c.text) : c.text);
    if (c.sub) node.append(el('span', 'ec-sub', c.sub));
    return node;
  }

  // ---- The Figures card ----
  // The rows are built when the room, crop or figures change; a repaint otherwise updates them in place and never rewrites
  // a box the owner is typing in (its text and its unsaved figure stay).
  function paintFigures() {
    const line = partsLine(reply.errors);
    els.parts.hidden = !line;
    if (line) {
      const retry = el('button', 'bz-quiet', 'Retry');
      retry.type = 'button';
      retry.dataset.focusKey = 'retry-parts';
      retry.addEventListener('click', () => reader.load());
      els.parts.replaceChildren(el('span', '', line), retry);
    }
    const next = JSON.stringify([reply.room.id, reply.crop, reply.figures.map((f) => f.key)]);
    if (next !== shape) {
      shape = next;
      els.folds.replaceChildren(...foldsOf(reply).map(foldNode));
    }
    for (const fold of foldsOf(reply)) {
      const summary = els.folds.querySelector(`[data-fold="${fold.way}"] > summary`);
      if (summary) summary.textContent = foldHead(fold);
      for (const f of fold.figures) updateRow(f);
    }
  }
  function foldNode(fold) {
    const d = el('details', 'ec-fold');
    d.dataset.fold = fold.way;
    d.open = fold.open;
    const s = el('summary', 'part-title ec-fold-head', foldHead(fold));
    d.append(s, ...fold.figures.map(rowNode));
    return d;
  }
  function rowNode(f) {
    const def = figureOf(f.key);
    const row = el('div', 'ec-fig');
    row.dataset.key = f.key;
    const label = el(def.settings ? 'span' : 'label', 'ec-fig-label', def.label); // Settings' figure has no box to name
    const field = el('div', 'ec-fig-field');
    if (def.settings) {
      field.append(el('span', 'ec-fig-value', ''), link('Change in Settings', '#/settings'));
    } else {
      const box = el('input', 'ec-box');
      box.id = idOf(f.key);
      label.htmlFor = box.id;
      box.type = 'text';
      box.inputMode = def.whole ? 'numeric' : 'decimal';
      box.autocomplete = 'off';
      box.dataset.focusKey = `box:${f.key}`;
      box.addEventListener('input', () => onType(f.key, box));
      box.addEventListener('change', () => onSave(f.key, box));
      field.append(box);
      field.append(el('span', 'ec-unit', def.unit)); // empty for flushes: the boxes stay in one column
    }
    const tag = el('span', 'ec-tag');
    const error = el('p', 'ec-error');
    error.id = `${idOf(f.key)}-error`;
    error.hidden = true;
    const note = el('div', 'ec-note');
    const applies = el('p', 'muted ec-applies');
    row.append(label, field, tag, error, note, applies);
    if (f.key === 'yours.kwhBlock') row.append(el('div', 'ec-sim'));
    return row;
  }
  // A row's tag, box, note, applies and (electricity per block) simulator line, from the figure as the reply has it.
  function updateRow(f) {
    const row = els.folds.querySelector(`[data-key="${f.key}"]`);
    if (!row) return;
    const box = row.querySelector('.ec-box');
    const typing = box && document.activeElement === box;
    if (box && !typing && !draft.unsaved(f.key) && !draft.error(f.key)) box.value = boxText(f.value);
    const value = row.querySelector('.ec-fig-value');
    if (value) value.textContent = figureText(f.key, f.value);
    const tag = row.querySelector('.ec-tag');
    if (!tag.dataset.saving) tag.textContent = draft.unsaved(f.key) && notSaved.has(f.key) ? 'Not saved' : tagText(f);
    tag.dataset.source = f.source;
    showError(f.key, row);
    const note = row.querySelector('.ec-note');
    const parts = noteParts(f, { room: reply.room.name, crop: reply.crop }).map(noteNode);
    if (notSaved.has(f.key)) parts.unshift(retryNode(f.key));
    if (f.source === 'owner') parts.push(backNode(f.key));
    note.replaceChildren(...parts);
    row.querySelector('.ec-applies').textContent = appliesText(f, reply.room.name, reply.crop);
    const sim = row.querySelector('.ec-sim');
    if (sim) paintSim(sim, f);
  }
  function noteNode(n) {
    const p = el('p', `ec-note-line${n.tone === 'warn' ? ' ec-warn' : ' muted'}`, n.text);
    if (n.link) p.append(' ', link(n.link.text, n.link.href));
    if (n.sources) {
      p.append(' Sources: ');
      n.sources.forEach((s, i) => {
        const words = [s.title, s.year].filter(Boolean).join(' ');
        p.append(i ? ', ' : '', s.url ? link(words, s.url, true) : words);
      });
      p.append('.');
    }
    return p;
  }
  function backNode(key) {
    const b = el('button', 'bz-quiet ec-back', 'Back to default');
    b.type = 'button';
    b.dataset.focusKey = `back:${key}`;
    b.setAttribute('aria-label', `Back to default: ${figureOf(key).label}`);
    b.addEventListener('click', () => onBack(key));
    return b;
  }
  function retryNode(key) {
    const p = el('p', 'ec-note-line ec-warn', "Couldn't save");
    const b = el('button', 'bz-quiet', 'Retry');
    b.type = 'button';
    b.dataset.focusKey = `retry:${key}`;
    b.addEventListener('click', () => {
      const box = els.folds.querySelector(`[data-key="${key}"] .ec-box`);
      if (box) onSave(key, box);
    });
    p.append(' · ', b);
    return p;
  }
  function showError(key, row = els.folds.querySelector(`[data-key="${key}"]`)) {
    const box = row?.querySelector('.ec-box');
    const error = row?.querySelector('.ec-error');
    if (!box || !error) return;
    const text = serverErrors.get(key) ?? draft.error(key);
    error.textContent = text ?? '';
    error.hidden = !text;
    if (text) {
      box.setAttribute('aria-invalid', 'true');
      box.setAttribute('aria-describedby', error.id);
    } else {
      box.removeAttribute('aria-invalid');
      box.removeAttribute('aria-describedby');
    }
  }

  // The Electricity per block row's Work it out line (spec 6.3).
  let simSaid = null; // the run "Working it out" was said for
  function paintSim(node, f) {
    const values = draft.values();
    const s = simText(reply.sim, f, {
      room: reply.room.name, crop: reply.crop, life: blockLife(inputsOf(values, 'yours')), machinesNote: reply.machinesNote,
    });
    const p = el('p', `ec-note-line${s.tone === 'warn' ? ' ec-warn' : ' muted'}`, s.text);
    p.dataset.simLine = '';
    const parts = [p];
    if (s.action) {
      const b = el('button', 'bz-quiet ec-work', s.action);
      b.type = 'button';
      b.dataset.focusKey = 'work-out';
      b.addEventListener('click', onWorkOut);
      parts.push(b);
    }
    node.replaceChildren(...parts);
    const working = reply.sim && (reply.sim.status === 'working' || reply.sim.status === 'waiting');
    if (working && simSaid !== reply.sim.simId) {
      simSaid = reply.sim.simId;
      said('Working it out');
    }
  }

  // ---- Typing, saving, back to default, Work it out ----
  const serverErrors = new Map(); // key → the server's refusal of the last save
  const notSaved = new Set(); // keys whose save got no answer
  function onType(key, box) {
    serverErrors.delete(key);
    draft.type(key, box.value);
    showError(key);
    paintMoney();
  }
  async function onSave(key, box) {
    const t = draft.type(key, box.value);
    if (t.error) return; // the refusal is under the box; nothing is sent
    const row = els.folds.querySelector(`[data-key="${key}"]`);
    const tag = row?.querySelector('.ec-tag');
    if (tag) {
      tag.dataset.saving = '1';
      tag.textContent = 'Saving…';
    }
    try {
      const next = await request('PUT', '/api/economics/figures', { room: reply.room.id, crop: reply.crop, key, value: t.value });
      if (!alive()) return;
      notSaved.delete(key);
      draft.drop(key);
      if (tag) delete tag.dataset.saving;
      said(savedText(key, t.value, reply.room.name, reply.crop));
      show(next);
    } catch (err) {
      if (!alive()) return;
      if (tag) delete tag.dataset.saving;
      if (err.status === 0) {
        notSaved.add(key); // the typed figure stays in the sums, marked not saved
      } else {
        serverErrors.set(key, err.message);
        draft.drop(key);
      }
      repaint();
    }
  }
  async function onBack(key) {
    try {
      const next = await request('DELETE', `/api/economics/figures?room=${reply.room.id}&crop=${reply.crop}&key=${encodeURIComponent(key)}`);
      if (!alive()) return;
      draft.drop(key);
      serverErrors.delete(key);
      notSaved.delete(key);
      show(next);
      // the box shows the figure it fell to (a repaint leaves a focused box alone), and keeps the cursor
      const box = els.folds.querySelector(`[data-key="${key}"] .ec-box`);
      if (box) {
        box.value = boxText(reply.figures.find((f) => f.key === key)?.value);
        box.focus({ preventScroll: true });
      }
      said(`${figureOf(key).label}: back to default.`);
    } catch (err) {
      if (alive()) fail(err);
    }
  }
  async function onWorkOut() {
    try {
      const next = await request('POST', '/api/economics/work-out', { room: reply.room.id, crop: reply.crop });
      if (alive()) show(next);
    } catch (err) {
      if (alive()) said(err.message);
    }
  }

  // ---- Reads ----
  const keepAddress = () => history.replaceState(null, '', economicsHash({ room: reply.room?.id ?? null, crop: reply.crop }));
  function fillPicks() {
    const rooms = reply.rooms.map((r) => {
      const o = el('option', '', r.name);
      o.value = String(r.id);
      return o;
    });
    els.room.replaceChildren(...rooms);
    els.room.value = String(reply.room.id);
    if (!els.crop.options.length) {
      els.crop.replaceChildren(...ECONOMICS_CROPS.map((c) => {
        const o = el('option', '', CROP_SELECT[c]);
        o.value = c;
        return o;
      }));
    }
    els.crop.value = reply.crop;
  }
  function repaint() {
    keepFocus(container, () => {
      paintMoney();
      paintFigures();
    });
  }
  // A reply: shown at once (a save's or a Work it out's) or from a read.
  function show(next) {
    els.banner.hidden = true;
    if (next.room && reply && (next.room.id !== reply.room?.id || next.crop !== reply.crop)) {
      draft = createDraft();
      serverErrors.clear();
      notSaved.clear();
    }
    reply = next;
    if (!reply.room) {
      els.picks.hidden = true;
      els.body.hidden = true;
      els.empty.hidden = false;
      return;
    }
    const key = JSON.stringify(reply);
    if (key === painted) return; // the same answer: nothing to paint
    painted = key;
    draft.use(reply);
    els.empty.hidden = true;
    els.picks.hidden = false;
    els.body.hidden = false;
    fillPicks();
    keepAddress();
    repaint();
  }
  // No answer: the banner says why; what was shown stays (a first read that fails shows the banner alone).
  function fail(err) {
    els.bannerText.textContent = failText(err);
    els.banner.hidden = false;
  }

  const path = () => `/api/economics${want.room || want.crop ? `?${[want.room ? `room=${want.room}` : '', want.crop ? `crop=${want.crop}` : ''].filter(Boolean).join('&')}` : ''}`;
  const reader = createReader({
    read: () => request('GET', path()),
    done: show,
    failed(err) {
      if (err.status === 404 && err.message === 'Room not found' && want.room !== null) {
        want = { room: null, crop: want.crop }; // the address's room is gone: the first room instead
        els.gone.hidden = false;
        reader.load().then(() => { if (reply?.room) els.gone.textContent = `That room is gone; showing ${reply.room.name}.`; });
        return;
      }
      fail(err);
    },
    delay: () => fallbackMs(REFRESH_MS, live.connected()),
    alive,
  });
  const reload = createThrottle(() => { if (alive()) reader.load(); });
  const offLive = [
    ...LISTEN.map((type) => live.on(type, () => reload.call())),
    live.on('room', (d) => { if (d.part === 'crop' || d.part === 'room') reload.call(); }), // a run starts or ends; a room's name
    live.on('simulation', (d) => {
      // its progress words only; done or failed arrives as 'economics'
      if (!reply?.sim || d.id !== reply.sim.simId || (d.status !== 'running' && d.status !== 'queued')) return;
      reply.sim = { ...reply.sim, status: d.status === 'queued' ? 'waiting' : 'working', progress: d.progress };
      const node = els.folds.querySelector('[data-key="yours.kwhBlock"] .ec-sim');
      const f = reply.figures.find((x) => x.key === 'yours.kwhBlock');
      if (node && f) keepFocus(container, () => paintSim(node, f));
    }),
    live.onStatus((up) => { if (up) reload.call(); }),
  ];
  const pick = () => {
    want = { room: Number(els.room.value) || null, crop: els.crop.value || null };
    els.gone.hidden = true;
    reader.load();
  };
  els.room.addEventListener('change', pick); // the crop picked stays: the same crop in another room
  els.crop.addEventListener('change', pick);
  q('[data-retry]').addEventListener('click', () => reader.load());
  reader.load();

  return function unmount() {
    mountSeq++;
    reader.stop();
    reload.cancel();
    for (const off of offLive) off();
  };
}
```

- [ ] **Step 4: Mount it (`web/app.js`)**

Replace:

```js
import * as summary from './business-page.js'; // ---- Summary ----
```

with:

```js
import * as summary from './business-page.js'; // ---- Summary ----
import * as economics from './economics-page.js'; // ---- Economics ----
```

Replace:

```js
    : route.name === 'summary' ? summary.mount(page, {}) // ---- Summary ----
```

with:

```js
    : route.name === 'summary' ? summary.mount(page, {}) // ---- Summary ----
    : route.name === 'economics' ? economics.mount(page, { room: route.room, crop: route.crop }) // ---- Economics ----
```

- [ ] **Step 5: The styles (`web/styles.css`, at the end)**

Replace:

```css
/* ---- end Login ---- */
```

with:

```css
/* ---- end Login ---- */

/* ---- Economics (spec 2026-11-06-economics-design.md 8) ---- */
/* the room and crop: Calendar's labelled selects, side by side, stacked under 600 px */
.ec-picks { display: flex; flex-wrap: wrap; gap: 0 16px; margin: 0 0 16px; }
.ec-pick { margin: 0; min-width: 200px; }
.ec-gone { margin: 0 0 12px; font-size: var(--fs-sm); }
.ec-page { display: grid; gap: 16px; align-items: start; }
/* the headline: the lead sentence, the best other way under it, then where the figures come from */
.ec-lead { margin: 0; font-size: var(--fs-lg); font-weight: 600; line-height: 1.45; }
.ec-second { margin: 6px 0 0; font-size: var(--fs-md); color: var(--ink-2); }
.ec-sources { margin: 10px 0 0; font-size: var(--fs-sm); }
/* the comparison: a column a way on a desk; the way's room muted under its name; a loss's word under its figure */
.ec-table thead th { vertical-align: bottom; }
.ec-way { display: block; }
.ec-way-room { display: block; color: var(--muted); font-weight: 400; font-size: var(--fs-sm); }
.ec-sub { display: block; color: var(--muted); font-size: var(--fs-sm); }
.ec-table tr[data-row="profit"] :is(th, td) { font-weight: 700; border-top: 1px solid var(--border-strong); }
.ec-table tr[data-row="costs"] :is(th, td) { font-weight: 600; }
.ec-lines { margin-top: 10px; }
.ec-line { margin: 4px 0 0; font-size: var(--fs-sm); }
.ec-phone { display: none; }
/* the figures: folds as Setup's parts; a row is its label, box and tag, then its note and where it applies */
.ec-intro { margin: 0 0 8px; font-size: var(--fs-sm); }
.ec-parts { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; margin: 0 0 8px; color: var(--warning-text); font-size: var(--fs-sm); }
.ec-fold { border-top: 1px solid var(--border); }
.ec-fold-head { font-weight: 600; }
.ec-fig { display: grid; grid-template-columns: minmax(0, 1fr) auto 10.5em; align-items: center; gap: 4px 12px; padding: 10px 0; border-top: 1px solid var(--border); }
.ec-fold > summary + .ec-fig { border-top: 0; }
.ec-fig-label { font-weight: 500; }
.ec-fig-field { display: flex; align-items: center; gap: 6px; }
.ec-box { width: 9em; min-height: 36px; padding: 6px 10px; font: inherit; text-align: right; font-variant-numeric: tabular-nums;
  border: 1px solid var(--border-strong); border-radius: var(--radius); background: var(--surface); color: var(--ink); }
.ec-box[aria-invalid="true"] { border-color: var(--critical-text); }
.ec-unit { min-width: 6.5em; color: var(--muted); font-size: var(--fs-sm); }
.ec-fig-value { font-variant-numeric: tabular-nums; }
/* the source tag: a neutral mark chip, its words saying the source (never colour alone) */
.ec-tag { justify-self: end; padding: 2px 10px; border: 1px solid var(--border-strong); border-radius: 999px; color: var(--ink-2); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
.ec-tag[data-source="owner"] { background: var(--accent-soft); }
.ec-error, .ec-note, .ec-applies, .ec-sim { grid-column: 1 / -1; margin: 0; font-size: var(--fs-sm); }
.ec-error { color: var(--critical-text); }
.ec-note { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; }
.ec-note-line { margin: 0; }
.ec-warn { color: var(--warning-text); }
.ec-sim { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
.ec-foot { margin: 10px 0 0; font-size: var(--fs-sm); }
@media (max-width: 600px) {
  .ec-pick { flex: 1 1 100%; }
  /* the comparison: a block a way, Your container first, its head the way's name with its profit */
  .ec-desk { display: none; }
  .ec-phone { display: grid; gap: 16px; }
  .ec-block-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .ec-block-name { margin: 0; font-size: var(--fs-md); }
  .ec-block-profit { margin: 0; font-weight: 700; text-align: right; }
  .ec-block-table tbody th { font-weight: 400; color: var(--ink-2); }
  /* a figure: its label over its box; the tag beside the box */
  .ec-fig { grid-template-columns: minmax(0, 1fr) auto; }
  .ec-unit { min-width: 0; }
  .ec-fig-label { grid-column: 1 / -1; }
  .ec-box { min-height: 44px; }
  .ec-fig .co-link, .ec-foot .co-link { display: inline-flex; align-items: center; min-height: 44px; }
}
/* ---- end Economics ---- */
```

- [ ] **Step 6: Run the page's and the roles' tests**

Run: `node --disable-warning=ExperimentalWarning --test tests/web-economics-page.test.js tests/web-roles.test.js tests/web-shell.test.js`
Expected: PASS (web-economics-page 6 tests). Then `npm test`: 2998 tests, 0 fail.

- [ ] **Step 7: Look at it once**

Seed a look database and start a look server (port 19200, a gateway that does not exist, a throwaway file):

```bash
mkdir -p /tmp/economics && rm -f /tmp/economics/look.db*
cat > /tmp/economics/seed.mjs <<'SEED'
import { openDb } from '/home/foqcus/Documents/mushroom-farm/.claude/worktrees/economics/server/db.js';
import { setOwnerPassword } from '/home/foqcus/Documents/mushroom-farm/.claude/worktrees/economics/server/owner.js';
import { createSales } from '/home/foqcus/Documents/mushroom-farm/.claude/worktrees/economics/server/sales.js';
const db = openDb('/tmp/economics/look.db');
const DAY = 86400000;
const now = Date.now();
console.log(await setOwnerPassword(db, 'Ray', 'Tq7#vxR2pLm9!zKw'));
const one = db.createRoom({ name: 'Container 1', length: 12, width: 2.35, height: 2.39, trhAddress: 1 }, now - 120 * DAY).id;
const two = db.createRoom({ name: 'Container 2', length: 6, width: 2.35, height: 2.39, trhAddress: 2 }, now - 120 * DAY).id;
db.setProgram(one, { ...db.getProgram(one), crops: [{ crop: 'lionsmane', blocks: 1400 }] }, { change: 'start', at: now - 90 * DAY });
const run = db.openRun(one);
for (let i = 0; i < 6; i++) db.insertHarvest({ roomId: one, runId: run.id, crop: 'lionsmane', stage: 'fruiting', flush: 1, blocks: 1400, kg: 50, pickedAt: now - (80 - i * 5) * DAY, worker: null, taskId: null, at: now - 80 * DAY });
db.setProgram(one, { ...db.getProgram(one), crops: [] }, { change: 'end', at: now - 45 * DAY });
db.setProgram(one, { ...db.getProgram(one), crops: [{ crop: 'lionsmane', blocks: 1482 }] }, { change: 'start', at: now - 40 * DAY });
const sales = createSales({ db, now: () => now });
const buyer = sales.addBuyer({ name: 'Kedai' }).id;
sales.record({ soldAt: now - 70 * DAY, buyerId: buyer, lines: [{ crop: 'lionsmane', kg: 120, priceKg: 48, roomId: one }] });
db.setProgram(two, { ...db.getProgram(two), crops: [{ crop: 'oyster', blocks: 600 }] }, { change: 'start', at: now - 10 * DAY });
db.close();
console.log('seeded');
SEED
node --disable-warning=ExperimentalWarning /tmp/economics/seed.mjs
FARM_DB=/tmp/economics/look.db FARM_PORT=19200 FARM_GATEWAY=127.0.0.1:19201 node --disable-warning=ExperimentalWarning server/main.js
```

Expected: `{ id: 1, name: 'Ray' }`, `seeded`, then `Farm app on http://localhost:19200 (database /tmp/economics/look.db, gateway 127.0.0.1:19201, reading every 5 s)`. Sign in as Ray with that password and open `#/business/economics`:

| Check | See |
|---|---|
| The strip | Seven tabs, Economics last and current; the address becomes `?room=1&crop=lionsmane` |
| Headline | "Lion's mane in Container 1: RM … a month, break-even RM … a kg, pays back in … months." then "A highland grower makes RM 2,215.14 on a fifth of the equipment."; the sources line names selling price, blocks and yield from your runs |
| Typing | Type `60x` in Selling price: the headline moves at once with RM 60, the refusal shows under the box; delete the `x` and press Enter: "You set", the note "You set this on … · Your runs: RM 48.00 a kg." and **Back to default**; Back to default puts 48 back in the box, the cursor on it |
| Work it out | On Electricity per block: "Working it out · …%", then within about 10 s "Simulator, …: … kWh over 42 days for 1,482 blocks." and the tag Simulator |
| A room gone | `#/business/economics?room=99&crop=oyster`: "That room is gone; showing Container 1." and the address tidied to `?room=1&crop=oyster`; the headline "Grey oyster in Container 1: −RM 1,400.38 a month loss, …" |
| Phone (390 px) | The selects stacked, one block a way, every box, select, button and link 44 px (`[...document.querySelectorAll('.ec-page :is(input, button, select, a, summary)')].filter((n) => n.offsetParent).filter((n) => n.getBoundingClientRect().height < 44).length` is `0`), no sideways scroll |

Both themes, no console errors. Stop the server (Ctrl-C) and remove `/tmp/economics/look.db*` and `/tmp/economics/seed.mjs`.

- [ ] **Step 8: Commit**

```bash
git add web/economics-page.js web/app.js web/styles.css tests/web-economics-page.test.js tests/web-roles.test.js
git commit -m "Economics: the page (the room and crop, the headline, a month each way as a table or a block a way on a phone, the Figures card in folds with each figure's source, typing worked out at once and saved on leaving the box, Back to default, Work it out), mounted under the Business strip, its .ec- styles"
```

---
## Part 4: documents, the look and the reviews

### Task 12: The documents (spec 10)

**Files:**
- Modify: `README.md` (the Business paragraph; an Economics paragraph after the Summary's)
- Modify: `PRODUCT.md` (a capability row)
- Modify: `DESIGN.md` (the Business tab strip row; an Economics section after the Summary's)
- Modify: `docs/superpowers/specs/2026-11-06-economics-design.md` (section 13, what shipped)

The contract's section 7 row for Economics is already written (2026-11-06, the owner's yes; version 26 since the login merged).

- [ ] **Step 1: README**

Replace:

```markdown
**Business.** The top bar's **Business** (`#/business`, between Harvest and Overview) holds six pages under one strip of tabs, Summary, Batches, Inventory, Sales, Costs and Runs, each described below; `#/business` is the Summary, always.
```

with:

```markdown
**Business.** The top bar's **Business** (`#/business`, between Harvest and Overview) holds seven pages under one strip of tabs, Summary, Batches, Inventory, Sales, Costs, Runs and Economics, each described below; `#/business` is the Summary, always.
```

Replace:

```markdown
Route: `GET /api/business/summary`. No database step. Spec: `docs/superpowers/specs/2026-11-06-business-summary-design.md`.
```

with:

```markdown
Route: `GET /api/business/summary`. No database step. Spec: `docs/superpowers/specs/2026-11-06-business-summary-design.md`.

**Economics.** `#/business/economics` (`?room=<id>&crop=<key>`), the seventh Business tab: what one of your rooms makes a month with one crop (grey oyster, pink oyster, black jelly or lion's mane), against a lowland shed, a highland grower, importing and reselling and, for lion's mane, a warm strain, each sized to the room's blocks (only the ways that make sense for the crop; the page says why the others are left out). A headline gives the room's profit a month, its break-even price and when the equipment and the first fill of blocks pay back, then the best other way; a table compares every way a month by part (blocks, electricity, labour, packing, transport, rent, the equipment written off), on a phone one block a way. Under **Figures** every figure says where it comes from: **You set** (saved for every device, with **Back to default**), **Your runs** (the room's finished runs of the crop: the yield from Harvest, the price from Sales, the block price from Batches, the electricity per block from the measured energy), **Simulator**, **Settings** (the expected price and the electricity price) or **Research** (with its range, confidence and sources); the money is worked out again as you type. **Work it out** runs the room's simulation with the crop over one block life (one of the room's simulations, offline; nothing is switched) and saves the electricity per block it gives. The owner's only. Routes: `GET /api/economics?room=&crop=`, `PUT` and `DELETE /api/economics/figures`, `POST /api/economics/work-out`. Economics needs database 26: the farm app moves the database up on its first start (copy `data/v2.db` first, for instance to `data/v2-before-economics.db`). Spec: `docs/superpowers/specs/2026-11-06-economics-design.md` (its research: `2026-11-06-economics-defaults.md`).
```

- [ ] **Step 2: PRODUCT.md**

Replace:

```markdown
| Summary | `#/business`: this month's money as Costs gives it and last month's result; what needs the owner (money owed, stock below zero or low, a use-by near, blocks ready for a room, blocks with no price), the most urgent first, each linking to where it is fixed; the runs in progress with their profit so far |
```

with:

```markdown
| Summary | `#/business`: this month's money as Costs gives it and last month's result; what needs the owner (money owed, stock below zero or low, a use-by near, blocks ready for a room, blocks with no price), the most urgent first, each linking to where it is fixed; the runs in progress with their profit so far |
| Economics | `#/business/economics`: one room and crop's month against a lowland shed, a highland grower, importing and reselling and a warm strain; profit, break-even and payback; every figure tagged You set, Your runs, Simulator, Settings or Research (with its sources), edited in place; Work it out on the room's simulation |
```

- [ ] **Step 3: DESIGN.md**

Replace:

```markdown
| Tab strip | Summary · Batches · Inventory · Sales · Costs · Runs, in that order, above the page's head: the room page's underline tabs as they are (`.room-tabs`; `web/business-tabs.js`, a `nav` named "Business"), the current one in `ink` on the 2 px `accent` line. On the six pages only: a batch, an item, Count stock and a run keep their back link, and a sheet for print (4-2, 4-5) has none (Runs: 2026-11-05; Summary: 2026-11-06) |
```

with:

```markdown
| Tab strip | Summary · Batches · Inventory · Sales · Costs · Runs · Economics, in that order, above the page's head: the room page's underline tabs as they are (`.room-tabs`; `web/business-tabs.js`, a `nav` named "Business"), the current one in `ink` on the 2 px `accent` line. On the seven pages only: a batch, an item, Count stock and a run keep their back link, and a sheet for print (4-2, 4-5) has none (Runs: 2026-11-05; Summary: 2026-11-06; Economics: 2026-11-10) |
```

Replace:

```markdown
| Styles | The `.sm-` block at the end of `styles.css`, tokens only; everything else is the other modules' classes |

### Sign-in
```

with:

```markdown
| Styles | The `.sm-` block at the end of `styles.css`, tokens only; everything else is the other modules' classes |

### Economics
(2026-11-10; spec `docs/superpowers/specs/2026-11-06-economics-design.md`.) The **Economics** tab, `#/business/economics?room=&crop=`, the seventh of the Business strip: one room and crop's month against the other ways to grow it or buy it in. The owner's only. Where each part lives:

| Part | Design |
|---|---|
| Head | "Economics", "What one of your rooms makes a month with a crop, against the other ways to grow it or buy it in." Under it Calendar's labelled selects **Room** and **Crop** (Grey oyster, Pink oyster, Black jelly, Lion's mane), side by side, stacked up to 600 px; the choice goes into the address in place |
| Headline | A card with no title: the room's month in `fs-lg` 600 ("Lion's mane in Container 1: RM 3,003.16 a month, break-even RM 38.23 a kg, pays back in 13 months."; a loss's figure only in `critical-text`), the best other way under it in `fs-md` `ink-2`, then a muted `fs-sm` line on where the figures come from ("From your runs: yield, selling price · Simulator: electricity · You set: 2 · The rest is research.") |
| A month, each way | A data table, a column a way ("Your container" with the room's name muted under it, Lowland shed, Highland grower, Import and resell, Warm strain), a row a part, Profit a month bold over a `border-strong` rule, a loss in `critical-text` with "Loss" under it; its box scrolls sideways when it must (a named region, a Tab stop). Up to 600 px one block a way, Your container first: its name with its profit beside it, then a two-column table of the rest. Muted `fs-sm` lines under it: the first fill, "Never: …" when a way never pays back, the sizing, the ways not compared and why |
| Figures | Folds (DESIGN's): **Shared by every way** and **Your container** open, one more per shown way closed, each head "Lowland shed · 13 figures · all research" ("· 2 you set"). A row: the label, a 9em right-aligned number box with its unit muted beside it (the boxes in one column), the source tag right (a neutral mark chip, 12 px 600: You set on `accent-soft`, Your runs · 4 runs, Simulator, Settings, Research), then muted `fs-sm` lines: the note (Research's range, confidence and sources as links opening a new tab; Your runs' kg, blocks, sales or batches; the date You set it and the real figure beside it, with a quiet **Back to default**) and where it applies ("Every room, Lion's mane"). The electricity price is Settings' text with **Change in Settings** in place of a box. A refusal under its box in `critical-text` (`aria-invalid`, `aria-describedby`); a warning note in `warning-text` |
| Typing | Each keystroke works the headline and the table out again in the browser (the last valid figure stays in the sums while a box holds something that is not one); leaving the box saves it ("Saving…" in the tag; a polite live line "Saved: Selling price, RM 55.00 a kg, every room."); no answer leaves it "Not saved" with **Retry** |
| Work it out | On the Electricity per block row: what it will run and that nothing is switched, then **Work it out**; "Waiting for another simulation…", "Working it out · 40 %" (from the `simulation` event), "Simulator, 6 Nov 14:02: 708.7 kWh over 42 days for 1,482 blocks." with **Work it out again**, or the failure in `warning-text` with **Try again** |
| Live | Asks again on the `economics`, `harvest`, `sales`, `batches` and `costs` events, a room's crops or name, the stream's return and a 60 s timer; a repaint keeps the cursor and never rewrites a box being typed in; the same answer paints nothing |
| Styles | The `.ec-` block at the end of `styles.css`, tokens only; 44 px boxes, selects, buttons and links on a phone |

### Sign-in
```

- [ ] **Step 4: The spec's "what shipped"**

At the end of `docs/superpowers/specs/2026-11-06-economics-design.md` replace:

```markdown
| The crops are the four the owner named | The other crops have no research; adding one is a defaults entry and a test |
```

with:

```markdown
| The crops are the four the owner named | The other crops have no research; adding one is a defaults entry and a test |

## 13. What shipped beyond this spec

The plan (`docs/superpowers/plans/2026-11-06-economics.md`) settled these where the spec was open; the build follows them.

| Part | What shipped |
|---|---|
| Server files | Your runs (`server/economics-runs.js`), Work it out's body and figure (`server/economics-sim.js`) and the routes (`server/economics-api.js`) beside the service (`server/economics.js`); the Figures card's words in `web/economics-figures.js` beside `web/economics-math.js` |
| `settleEconomicsSim` | Finds the row by room and crop (`{ roomId, crop, … }`), not by `simId`: a Work it out the simulation's checks refuse has no run and still fails its row |
| The view | `sim.status` is `'waiting'` while the run is queued; `machinesNote` names the machines at Simulate's defaults; a figure's `research` carries its `sources` and `note` |
| Pending energy | A day still being worked out leaves the electricity per block from the next source with the "working out the energy…" note; Harvest's own warm (started by `roomView`) publishes `harvest` when done, which the page hears |
| Over 90 days | The kWh is scaled by the block life the run was started for (kept in memory; after a restart, the run's own days) |
| A figure of a way not shown | Refused as "Unknown figure" |
| The live stream | A worker's stream never carries `economics` (`OWNER_EVENTS` in `server/live.js`) |
| The phone's comparison | One small table a way (its name and profit as its head) instead of ARIA-roled blocks |
| Dates | Farm time (`farmDate`, `farmTime`), as the other Business pages |
```

- [ ] **Step 5: Run everything and commit**

Run: `npm test`
Expected: 2998 tests, 0 fail.

```bash
git add README.md PRODUCT.md DESIGN.md docs/superpowers/specs/2026-11-06-economics-design.md
git commit -m "Economics: README (the seventh Business page and database 26), PRODUCT.md, DESIGN.md (the strip, the Economics section) and the spec's what shipped"
```

---

### Task 13: The UI/UX audit and its fixes (run by the lead)

The owner's standing step for a UI iteration: an Impeccable critique and audit, then the fixes, before the finish review.

- [ ] **Step 1: Critique and audit.** Run the `impeccable` skill's critique and audit on the Economics tab against a look server (Task 11 Step 7's seed and command): desk 1440 px and phone 390 px (also 1024 and 360 px, spec 11.3), dark and light themes; states: a new farm (all research), a room with runs (the seed), Work it out working and failed (stop the server mid-run, start it again: "Stopped by a restart of the farm app"), a Sales failure (spec 9.2), a figure refused and one not saved (the server stopped while saving). Save the reports under `.impeccable/critique/`.
- [ ] **Step 2: Fix.** Each finding fixed in its own commit ("Economics: the audit's …"), TDD where it is behaviour, `npm test` green after each; the DESIGN.md Economics section kept true.
- [ ] **Step 3: Look again** at the four widths and both themes; no console errors.

---

### Task 14: The final whole-branch review (run by the lead)

- [ ] **Step 1: Review.** A code review of the whole branch against `v2` (`git diff 938a61e...feat/economics`) and this plan: the golden numbers, the version 26 step, the owner's only (routes, the live stream, the worker's pages), the contract (no other module's way of working a figure changed), metric units and RM, the One Format Rule, the marked lines in shared files.
- [ ] **Step 2: Fix** what it finds, each in its own commit, `npm test` green.
- [ ] **Step 3: Hand over.** The branch is ready to merge into `v2`; it is not merged, pushed or deployed here. Stop with the branch, its last commit and the test count; the owner decides the merge and the deploy (copy the VM's database before the first start at version 26).

---

## Self-review

| Check | Result |
|---|---|
| Spec coverage | Scope 1 and placement 2 → Tasks 8, 11; data 3 → Task 3; figures 4.1–4.3 → Tasks 2, 6; your runs 4.4, failures 4.5 → Task 4; model 5 → Task 1; Work it out 6.1 → Task 5, 6.2 → Task 6, 6.3 → Tasks 10, 11; API 7.1 → Task 7, view 7.2 → Task 6, events 7.3 → Tasks 6–8; page 8.1, 8.5 → Task 11, headline 8.2, rows 8.3, not compared 8.4, numbers 8.7 → Task 9, notes 8.6 → Task 10; live, states, edge cases 9 → Tasks 6, 10, 11; files 10 → every task, documents → Task 12; tests 11.1 → Tasks 1 and 9, 11.2 → Tasks 2 and 9, 11.3 → each task's test, the look → Tasks 11 and 13 |
| Placeholders | None: every new file is given whole, every edit as its exact old and new text |
| Names | `grow`, `trade`, `blockLife`, `housesOf`, `inputsOf`, `compare`, `HOUSE_BLOCKS`; `figureOf`, `figuresFor`, `placeOf`, `checkFigure`, `researchOf`, `sizeOf`, `WAYS`, `LEFT`, `WAY_NAMES`, `SOURCES`; `SIM_KEY` and the six db methods; `yourRuns`; `simBody`, `simFigure`, `DELETED_TEXT`; `createEconomics`, `EconomicsError`; `createEconomicsRoutes`; `OWNER_EVENTS`; `ECONOMICS_HASH`, `economicsHash`; the `economics-math.js` and `economics-figures.js` exports; `mount`: each used with the same name and shape in every later task |
| Built | Applied task by task to a copy of `45e2d67` (`scratch/econ-plancheck`): each task's test fails before and passes after; `npm test` 2930, 2939, 2943, 2949, 2952, 2963, 2969, 2973, 2982, 2992, 2998, 2998 after Tasks 1–12, 0 fail; the page looked at on port 19200 at 1440 and 390 px, both themes: typing, saving, Back to default, Work it out to a saved figure, a gone room, no console errors |

# Air exchange (short, powerful CO₂ purges) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one fresh-air fan (levels 0–3, steady/purge modes, AC setback) with an on/off intake + exhaust pair that runs short, capped purges, prepares the room before each purge, and tells the farmer when the pair is too small.

**Architecture:** A new pure module `air.js` (`ClimateAir`) holds the purge arithmetic shared by the controller, the capacity check and the equipment check. Contract C9 (`docs/contracts/air.md`) is frozen first; then four streams work in parallel git worktrees (simulation, controller, data, web), each against C9 only; the lead merges in order, regenerates the vectors and runs the integration checks.

**Tech Stack:** Plain JavaScript (browser IIFEs + Node 22), `node:test`, `node:sqlite`, no build step, no dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-air-exchange-purge-design.md`. **Contract:** `docs/contracts/air.md` (C9).

---

## Files and who owns them

| Step | Owner | Brief | Files |
|---|---|---|---|
| 0 | Lead | This file, tasks 0.1–0.6 | `air.js`, `tests/air.test.js`, `index.html` (one script line), `docs/contracts/air.md`, `docs/contracts/LEAD-DECISIONS.md`, `docs/contract.md` |
| 1 | Simulation stream | `simulation.md` | C9 section 2, row "Simulation stream" |
| 1 | Controller stream | `controller.md` | C9 section 2, row "Controller stream" |
| 1 | Data stream | `data.md` | C9 section 2, row "Data stream" |
| 1 | Web stream | `web.md` | C9 section 2, row "Web stream" |
| 2 | Lead | This file, tasks 2.1–2.7 | `tests/integration.test.js`, `tests/harness.js`, `tests/vectors/*.json`, `docs/contracts/cycle.md` (example numbers), `docs/ROADMAP.md`, `README.md` |

Merge order at step 2: simulation → controller → data → web. Each stream works from the step 0 commit (`<base>`). Worktrees live under `~/.config/superpowers/worktrees/mushroom-farm/` (never `/tmp`: it is wiped on reboot).

## Step 0: lead

### Task 0.1: Merge the drawing branch and this plan

`fix/room-drawing` (room drawing, glance panel, Climate Controller layout) touches `web/simulator.js` and `styles.css`, which the web stream rewrites. It must be on `master` first.

- [ ] **Step 1:** In the main checkout, commit the drawing work on `fix/room-drawing`:

```bash
cd ~/Documents/mushroom-farm
git add web/simulator.js styles.css docs/ROADMAP.md tests/web-mimic.test.js
git commit -m "feat(web): room drawing by vent and positions, CF-205, at-a-glance panel, controller section grid"
```

- [ ] **Step 2:** Rebase on `master`, test, merge:

```bash
git rebase master
npm test            # expected: all pass
git switch master && git merge --no-ff fix/room-drawing -m "Merge fix/room-drawing"
```

- [ ] **Step 3:** Merge `docs/air-exchange-spec` (spec, C9, this plan) into `master` the same way.

### Task 0.2: `air.js` (`ClimateAir`)

**Files:** Create `air.js`, `tests/air.test.js`.

- [ ] **Step 1: Write the failing test** `tests/air.test.js`:

```js
// air.js: ClimateAir (contract C9 section 3).
const test = require('node:test');
const assert = require('node:assert/strict');
require('../air.js');
const A = globalThis.ClimateAir;

// 60 m³ room, 420 ppm outside, 6000 blocks at 45 mL/h = 0.27 m³/h of CO2, purge 900 → 700 ppm.
const ROOM = { volume: 60, co2Out: 420, prodM3h: 0.27, start: 900, stop: 700 };

test('module shape: frozen, sizes, min points', () => {
  assert.ok(Object.isFrozen(A));
  assert.ok(Object.isFrozen(A.SIZES));
  assert.deepEqual([...A.SIZES], [600, 900, 1200, 1800, 2400, 3600]);
  assert.equal(A.MIN_POINTS, 4);
});

test('steadyPpm: outside plus output over flow; no flow is Infinity', () => {
  assert.equal(A.steadyPpm({ co2Out: 420, prodM3h: 0.27, flowM3h: 900 }), 720);
  assert.equal(A.steadyPpm({ co2Out: 420, prodM3h: 0.27, flowM3h: 0 }), Infinity);
});

test('purgeTimeS: hand calculation at 1800 m³/h', () => {
  const css = 420 + 0.27e6 / 1800;                                  // 570 ppm
  const want = 60 / 1800 * Math.log((900 - css) / (700 - css)) * 3600;
  assert.ok(Math.abs(A.purgeTimeS({ ...ROOM, m3h: 1800 }) - want) < 1e-9);
  assert.ok(Math.abs(want - 111.8) < 0.1);                           // about 1.9 min
});

test('purgeTimeS: leakage adds to the flow', () => {
  assert.ok(A.purgeTimeS({ ...ROOM, m3h: 1200, leakM3h: 24 }) < A.purgeTimeS({ ...ROOM, m3h: 1200 }));
});

test('purgeTimeS: never reaches the stop level, no flow, already below', () => {
  assert.equal(A.purgeTimeS({ ...ROOM, m3h: 900 }), Infinity);      // steady 720 ppm ≥ 700
  assert.equal(A.purgeTimeS({ ...ROOM, m3h: 0 }), Infinity);
  assert.equal(A.purgeTimeS({ ...ROOM, m3h: 1800, start: 650 }), 0);
});

test('sizeFor: smallest multiple of 50 that meets the cap, with size and margin', () => {
  const r = A.sizeFor({ ...ROOM, capS: 180 });
  assert.equal(r.needM3h % 50, 0);
  assert.ok(A.purgeTimeS({ ...ROOM, m3h: r.needM3h }) <= 180);
  assert.ok(A.purgeTimeS({ ...ROOM, m3h: r.needM3h - 50 }) > 180);
  assert.ok(r.needM3h >= 1350 && r.needM3h <= 1500);                 // spec table: about 1,400 m³/h
  assert.equal(r.size, 1800);
  assert.equal(r.margin, 2400);
});

test('sizeFor: past the last size gives null size and margin; impossible gives Infinity', () => {
  const big = A.sizeFor({ ...ROOM, prodM3h: 3, capS: 60 });
  assert.ok(big.needM3h > 3600);
  assert.equal(big.size, null);
  assert.equal(big.margin, null);
  const last = A.sizeFor({ ...ROOM, capS: 180, sizes: [600, 1800] });
  assert.equal(last.size, 1800);
  assert.equal(last.margin, null);
  assert.equal(A.sizeFor({ ...ROOM, co2Out: 800, capS: 180 }).needM3h, Infinity);   // outside air above the stop level
});

test('riseRate: least-squares slope; too few points or no time spread is null', () => {
  const pts = [0, 30, 60, 90, 120].map(t => ({ t, C: 700 + 1.25 * t + (t === 60 ? 2 : 0) }));
  assert.ok(Math.abs(A.riseRate(pts) - 1.25) < 0.01);
  assert.equal(A.riseRate(pts.slice(0, 3)), null);
  assert.equal(A.riseRate([{ t: 5, C: 1 }, { t: 5, C: 2 }, { t: 5, C: 3 }, { t: 5, C: 4 }]), null);
  assert.equal(A.riseRate([{ t: 0, C: NaN }, { t: 30, C: 1 }, { t: 60, C: 2 }, { t: 90, C: 3 }]), null);
  assert.equal(A.riseRate(null), null);
});

test('prodFromRise: rise × volume, plus what the leakage carries out', () => {
  // 0.27 m³/h in 60 m³ is 4500 ppm/h = 1.25 ppm/s
  assert.ok(Math.abs(A.prodFromRise({ ratePpmS: 1.25, volume: 60, co2: 800, co2Out: 420 }) - 0.27) < 1e-12);
  assert.ok(Math.abs(A.prodFromRise({ ratePpmS: 1.25, volume: 60, leakM3h: 24, co2: 800, co2Out: 420 }) - (0.27 + 24 * 380e-6)) < 1e-12);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/air.test.js`
Expected: FAIL, `Cannot find module '../air.js'`.

- [ ] **Step 3: Write `air.js`**

```js
/*
 * air.js: AIR EXCHANGE ARITHMETIC (contract C9 section 3)
 *
 * Shared by the controller (size message), the capacity check and the equipment check.
 *   purgeTimeS(o)  -> seconds for a purge from the start to the stop level; Infinity when it never gets there
 *   sizeFor(o)     -> { needM3h, size, margin }: the smallest airflow that meets the time cap, and the sizes to buy
 *   riseRate(pts)  -> ppm/s from CO2 readings taken with the fans off; null with too few points
 * Volumes in m³, flows in m³/h, CO2 in ppm, CO2 output in m³/h.
 */
(function (global) {
  'use strict';
  const SIZES = Object.freeze([600, 900, 1200, 1800, 2400, 3600]);
  const MIN_POINTS = 4;
  const MAX_M3H = 1e6;

  function steadyPpm({ co2Out, prodM3h, flowM3h }) {
    return flowM3h > 0 ? co2Out + prodM3h * 1e6 / flowM3h : Infinity;
  }

  function purgeTimeS({ volume, co2Out, leakM3h = 0, prodM3h, m3h, start, stop }) {
    if (start <= stop) return 0;
    const q = m3h + leakM3h;
    if (!(q > 0)) return Infinity;
    const css = steadyPpm({ co2Out, prodM3h, flowM3h: q });
    if (css >= stop) return Infinity;
    return volume / q * Math.log((start - css) / (stop - css)) * 3600;
  }

  function sizeFor({ volume, co2Out, leakM3h = 0, prodM3h, start, stop, capS, sizes = SIZES }) {
    const ok = m3h => purgeTimeS({ volume, co2Out, leakM3h, prodM3h, m3h, start, stop }) <= capS;
    let lo = 0, hi = 50;
    while (!ok(hi)) {
      lo = hi; hi *= 2;
      if (hi > MAX_M3H) return { needM3h: Infinity, size: null, margin: null };
    }
    while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (ok(mid)) hi = mid; else lo = mid; }
    const needM3h = Math.ceil(hi / 50) * 50;
    const i = sizes.findIndex(s => s >= needM3h);
    return { needM3h, size: i < 0 ? null : sizes[i], margin: i < 0 || i + 1 >= sizes.length ? null : sizes[i + 1] };
  }

  function riseRate(points) {
    const p = (points || []).filter(x => x && Number.isFinite(x.t) && Number.isFinite(x.C));
    if (p.length < MIN_POINTS) return null;
    const n = p.length, mt = p.reduce((s, x) => s + x.t, 0) / n, mc = p.reduce((s, x) => s + x.C, 0) / n;
    let sxx = 0, sxy = 0;
    for (const x of p) { sxx += (x.t - mt) ** 2; sxy += (x.t - mt) * (x.C - mc); }
    return sxx > 0 ? sxy / sxx : null;
  }

  function prodFromRise({ ratePpmS, volume, leakM3h = 0, co2, co2Out }) {
    return ratePpmS * 3600 * volume / 1e6 + leakM3h * Math.max(0, co2 - co2Out) / 1e6;
  }

  global.ClimateAir = Object.freeze({ SIZES, MIN_POINTS, steadyPpm, purgeTimeS, sizeFor, riseRate, prodFromRise });
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: Run the tests**

Run: `node --test tests/air.test.js` → expected `# pass 9`, `# fail 0`. Then `npm test` → all pass (nothing else uses `air.js` yet).

- [ ] **Step 5: Commit**

```bash
git add air.js tests/air.test.js
git commit -m "feat(air): ClimateAir purge time, size recommendation, rise rate (C9 section 3)"
```

### Task 0.3: Lead decision 55 and freeze C9

**Files:** Modify `docs/contracts/LEAD-DECISIONS.md` (append a row), `docs/contracts/air.md` (status line).

- [ ] **Step 1:** Append to the decisions table:

```markdown
| 55 | Air exchange (C9; 14–54 are reserved by the parked wave 2 decisions on `wave2/contracts-folded`) | The one fresh-air fan, its levels, `env.vent`, `rules.airMode`, `baseFan`, `fanLevel`, `rhAction`, `fogBoost` and the AC-during-purge rules are replaced by an on/off intake + exhaust pair (`air.on`) with short purges capped at `rules.purgeMaxS`, Prepare timed from the CO₂ rise rate, and the `airTooSmall` alarm. Contract C9 (`docs/contracts/air.md`) overrides the sections listed in its section 10. The reading key `fan` becomes `air`; database upgrade 2 is C9's, so wave 2's planned upgrade becomes 3. `SETTINGS_VERSION` 2 with `upgradeSettings` for older settings and stored room settings. |
```

- [ ] **Step 2:** In `docs/contracts/air.md`, change the status line to `Status: frozen (lead decision 55), <date>.`
- [ ] **Step 3: Commit** `git commit -am "docs(contracts): freeze C9 air exchange (lead decision 55)"`

### Task 0.4: Load `air.js` in the browser

**Files:** Modify `index.html` (script list, lines 25–26).

- [ ] **Step 1:** Insert `<script src="air.js"></script>` between `<script src="sim.js"></script>` and `<script src="controller.js"></script>`.
- [ ] **Step 2:** Run `npm test`. If a web load test pins the script list, add `air.js` there in the same commit.
- [ ] **Step 3: Commit** `git commit -am "feat(web): load air.js before controller.js (C9 section 3)"`

### Task 0.5: `docs/contract.md`

- [ ] **Step 1:** Apply C9 section 10, row `docs/contract.md`: command row `air.on` (true/false, "Air exchange: intake and exhaust fans on together"), the adapter rule "air exchange on (fresh air and CO₂ removal)", `cmdFields` and the example of C9 section 9, the `crowded-dry` text "a crowded room in dry air (purges delayed by humidity first)", settings version 2.
- [ ] **Step 2: Commit** `git commit -am "docs(contract): air.on command, cmdFields, settings version 2 (C9)"`

### Task 0.6: Make the stream worktrees and dispatch

- [ ] **Step 1:** From the step 0 commit:

```bash
cd ~/Documents/mushroom-farm
for s in simulation controller data web; do
  git worktree add ~/.config/superpowers/worktrees/mushroom-farm/air-$s -b stream/air-$s master
done
```

- [ ] **Step 2:** Dispatch one subagent per stream (Agent tool, in parallel, one message), each with its brief path `docs/superpowers/plans/2026-10-08-air-exchange/<stream>.md` and its worktree path. Two-stage review per stream (spec compliance, then code quality) before merge.

## Step 1: streams

| Stream | Brief | Depends on (contract only) |
|---|---|---|
| Simulation | `simulation.md` | C9 sections 3, 4, 8; `air.js` |
| Controller | `controller.md` | C9 sections 3, 5, 9; `air.js` |
| Data | `data.md` | C9 sections 5.2 (`upgradeSettings` signature), 6 |
| Web | `web.md` | C9 sections 4.2 (meter keys, `act.air`), 5 (command, settings, `purges()`, stats, `st.air`), 7, 8 (capacity room shape) |

Each stream's tests that depend on another stream's code use the contract's shapes, not the other stream's files. Cross-stream failures that can only appear after merging are the lead's at step 2.

## Step 2: lead integration

### Task 2.1: Merge in order

- [ ] For each of `stream/air-simulation`, `stream/air-controller`, `stream/air-data`, `stream/air-web`: `git merge --no-ff <branch>`, then `npm test`. Expected: the stream's own tests pass; failures in `tests/integration.test.js` and `tests/vectors.test.js` are expected until tasks 2.2–2.3.

- [ ] After the controller merge, delete the simulation stream's test-only "C9 bridge" from `tests/capacity.test.js`, `tests/cycle.test.js` and `tests/calib.test.js` (brief `simulation.md` names it), and remove the `todo` option from the three tests it marked; run them. If cycle test FULL still fails, check the spike-filter rule (C9 5.6 "Sensor check") first.
- [ ] Re-measure the capacity check "too wet with many blocks" result (simulation brief question 2: default room, 200 golden oyster, capacity 222 with no limit named). If the two capacity `todo` tests still fail with the C9 controller and Prepare, stop and bring it to the user as a design question (which side a near-saturation failure belongs to); do not loosen the tests.

### Task 2.2: Regenerate the vectors

- [ ] Run `npm run vectors`, then `node --test tests/vectors.test.js` → pass. Check the new `capped-purges` file has runs of `air` 1 lasting at most `purgeMaxS`.
- [ ] Commit `git commit -am "test(vectors): regenerate for the air exchange (C9 section 9)"`.

### Task 2.3: Harness and integration tests

**Files:** Modify `tests/harness.js`, `tests/integration.test.js`.

- [ ] **Step 1: Harness.** In `tests/harness.js`: add `require('../air.js');` before `require('../controller.js');`. In the returned object replace `kwhDay: k('ac') + k('hu') + k('fan')` with `k('air')`, `fanKwh` with `airKwh: k('air')`, `fanH` with `airH: (s1.airOnS - base.stats.airOnS) / 3600 / days`, `fanStarts` with `purges: (s1.purges - base.stats.purges) / days`, and add:

```js
    cappedPurges: s1.cappedPurges - base.stats.cappedPurges,
    longestPurgeS: s1.longestPurgeS,
    alarmIds: [...alarmIds],
    sizeText,
```

with, inside `run`, `const alarmIds = new Set(); let sizeText = null;` and at the end of `measure()`:

```js
    for (const a of ctl.alarmList()) if (a.active) alarmIds.add(a.id);
    if (ctl.state.air.sizeText) sizeText = ctl.state.air.sizeText;
```

(`measure()` runs only after `measureFrom`; that is intended: the alarm must be on in steady operation.)

- [ ] **Step 2: Remove the tests that pin the old model:** `purge mode: a 0.5 °C setback…` (line 19), `old layout (exhaust, purge)…` (line 62), `a filtered supply fan cuts the unfiltered air…` (line 70), `steady fresh air (default)…` (line 99). In `default oyster fruiting…` (line 10) replace `assert.ok(r.fanStarts <= 120, …)` with `assert.equal(r.cappedPurges, 0, 'capped purges');`. Search the file for `fanStarts`, `fanH`, `fanKwh`, `airMode`, `vent` and change each remaining use to the new fields (or remove the line when it tests a removed setting).

- [ ] **Step 3: Add the three tests of C9 section 11:**

```js
const AIR = globalThis.ClimateAir;
const crowded = { blocks: 6000, airM3h: 1800 };

test('6000 blocks at 1800 m³/h: every purge within the cap, CO₂ never above the limit', () => {
  const r = run({ env: crowded, cfg: noHarvest() });
  assert.ok(r.purges > 100, `purges ${r.purges}/day`);
  assert.equal(r.cappedPurges, 0);
  assert.ok(r.longestPurgeS <= 180, `longest purge ${r.longestPurgeS} s`);
  assert.ok(r.overMin <= 1, `CO₂ over the limit ${r.overMin} min/day`);
});

test('6000 blocks at 900 m³/h: the size alarm, with an estimate near the true need', () => {
  const r = run({ hours: 12, measureFrom: 6, env: { blocks: 6000, airM3h: 900 }, cfg: { ...noHarvest(), airM3h: 900 } });
  assert.ok(r.alarmIds.includes('airTooSmall'), `alarms ${r.alarmIds}`);
  const R = CC.defaultRules(CC.defaultSettings().co2Lim);
  const truth = AIR.sizeFor({ volume: 60, co2Out: 420, prodM3h: 6000 * 45 / 1e6, start: R.fanOn, stop: R.fanOff, capS: 180 }).needM3h;
  const est = Number(/needs about (\d+)/.exec(r.sizeText)[1]);
  assert.ok(Math.abs(est - truth) / truth <= 0.15, `estimate ${est}, truth ${truth}`);
});

test('Prepare on vs off: more time in the temperature and RH bands with Prepare on', () => {
  const on = run({ env: crowded, cfg: noHarvest() });
  const off = run({ env: crowded, cfg: noHarvest(), rules: { prepare: false } });
  const out = r => (100 - r.inT) + (100 - r.inRH);
  assert.ok(out(on) < out(off), `out of band: on ${out(on).toFixed(2)} %, off ${out(off).toFixed(2)} %`);
});
```

- [ ] **Step 4:** `node --test tests/integration.test.js` → pass. If the Prepare test fails, record both numbers and stop: that is a design finding for the user, not a test to loosen.
- [ ] **Step 5: Commit** `git commit -am "test(integration): air exchange purges, size alarm, Prepare benefit (C9 section 11)"`

### Task 2.4: Re-measure the C7 example numbers

- [ ] Run `node tools/run-headless.js --days 2` and the cycle test; replace the example numbers in `docs/contracts/cycle.md` lines 337–346 with the measured ones; commit `docs(cycle): example numbers after the air exchange (C9 section 10)`.

### Task 2.5: Browser checks (headless Chrome against the real server)

- [ ] Copy the live database (`~/.local/share/mushroom-farm/farm.db`) to `~/.local/share/mushroom-farm/air-check.db`, start the server on it on a spare port (`FARM_PORT=8092 FARM_DB=… node server/main.js`) and confirm: the upgrade runs (version 2), Room 1 reads with `air`, the Simulator shows both fans spinning during a purge, the status card cycles Idle → Prepare → Purge, the glance panel shows the next purge, the settings panel saves `rules.purgeMaxS` on a live room.

### Task 2.6: Docs

- [ ] `README.md` file table: add `air.js`. `docs/ROADMAP.md`: row "Air exchange: short, powerful purges (C9)" ✅. Commit.

### Task 2.7: Hand over to the parked wave 2 branch

- [ ] Tell the owner of `wave2/contracts-folded` (project memory) that C9 is on `master`: that branch rebases and applies C9 section 10 rows "C8 `equipment.md`" and "Wave 2 contracts" (upgrade 3, `air`, no `vent`, `air_m3h`, `ClimateAir.sizeFor`).

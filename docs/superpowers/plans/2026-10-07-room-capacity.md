# Room Capacity Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tell a farmer, for a calibrated room and a mix of mushroom crops, whether the plan is impossible, too dense, tight, good or too empty, with the room's capacity (and minimum) in blocks and the utilisation.

**Architecture:** A new browser-and-Node module `capacity.js` (global `ClimateCapacity`, same pattern as `calib.js`) computes common targets for the mix, an instant heat-and-water balance estimate, and then searches the block count with full simulation trials (`sim.js` + `controller.js` through `runtime.js`) over three design days. The page gets a "Room capacity" card that saves rooms in `localStorage` and shows the report. The controller only gets new crop data (`range`).

**Tech Stack:** Plain JavaScript (no build), Node.js 20+ `node:test`, the existing simulation and controller.

**Spec:** `docs/superpowers/specs/2026-10-07-room-capacity-design.md` (read it first; the "Pass window" and the one-sided RH rule were added after testing).

---

## Before you start

| Check | Command | Expected |
|---|---|---|
| Repo and branch | `cd ~/Documents/climate-controller && git status --short && git branch --show-current` | No changes except this plan and the spec; branch `master`. |
| Commit identity (set per repo, never globally) | `git config user.name && git config user.email` | `Ray Tham` and `65101833+rayy1218@users.noreply.github.com` |
| Baseline tests | `npm test 2>&1 \| grep -E '^# (tests\|pass\|fail)'` | `# tests 66`, `# pass 66`, `# fail 0` |

Another developer edits this folder too. Before each task, run `git status --short`. If files you did not touch have changed, stop and ask; do not commit their work as part of a task.

Every commit message ends with this line (after a blank line):

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

Do **not** push. Pushing updates the public GitHub Pages site; the user decides when.

## File structure

| File | Change | Responsibility |
|---|---|---|
| `controller.js` | Modify `CROPS` | Add `range: { T: [lo, hi], RH: [lo, hi] }` per crop (data only; control behaviour must not change). |
| `capacity.js` | Create | Common targets, balance (step 1), trial (step 2), calibration status, verdict, full check. No page code. |
| `tests/controller.test.js` | Modify | One test: every crop's range is inside its alarm limits. |
| `tests/capacity.test.js` | Create | All tests of `capacity.js`. |
| `index.html` | Modify | "Room capacity" card after the calibration card; `<script src="capacity.js">` after `calib.js`. |
| `styles.css` | Modify | Styles for the card (append at the end). |
| `app.js` | Modify | Remember the applied calibration; the room list, mix table, run button, report, farm total, export/import. |
| `README.md`, `docs/phase3-plan.md` | Modify | File table and findings. |

Key facts about the existing code (do not change them):

| Fact | Where |
|---|---|
| `CC.applyProfile(cfg)` sets `spT`, `spRH`, `co2Lim` and the CO₂ rule levels from `CROPS[cfg.crop][cfg.stage]`. | `controller.js` |
| `CC.defaultRules(lim).fanOn` = `lim - 100`; `baseFan.fruiting` = 1 (Low, 300 m³/h). | `controller.js` |
| `SIM.create(env)` accepts `env.room` overrides (`ua`, `infAch`, `moistBuffer`, `volume`) and `env.weatherSeries` (`[{ t, T, RH }]`, `t` in s from the start). | `sim.js` |
| `sim.view()` is the real room air (score it); `sim.read()` is what the sensors report. | `sim.js` |
| `RT.createRuntime({ io, ctl, onReading })` + `RT.simIO(sim)`: `io.advance(dt)` then `rt.poll()`. | `runtime.js` |

---

### Task 1: Good fruiting range per crop

**Files:**
- Modify: `controller.js` (the `CROPS` table)
- Test: `tests/controller.test.js`

- [ ] **Step 1: Write the failing test**

In `tests/controller.test.js`, directly after the test `'every crop can be held by a split AC (16-30 °C) and its targets are inside its own range'`, add:

```js
test('every crop has a good range inside its alarm limits', () => {
  for (const [k, c] of Object.entries(CC.CROPS)) {
    if (k === 'flagTest') continue;
    assert.ok(c.range.T[0] < c.fruiting[0] + 0.01 && c.fruiting[0] <= c.range.T[1], `${k}: target inside its T range`);
    assert.ok(c.range.T[0] >= c.limits.tMin && c.range.T[1] <= c.limits.tMax, `${k}: T range inside the limits`);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test tests/controller.test.js 2>&1 | grep -E '^not ok|range'`
Expected: `not ok ... every crop has a good range inside its alarm limits` (TypeError: Cannot read properties of undefined (reading 'T')).

- [ ] **Step 3: Add the ranges**

In `controller.js`, replace the block from the comment `// coreTarget: block core temperature ...` down to the closing `};` of `CROPS` with:

```js
  // coreTarget: block core temperature that the AC holds in spawn run (with a block probe).
  // range: the good fruiting band (T °C, RH %), narrower than the alarm limits; a mixed room needs targets inside every crop's range.
  // Only crops that fruit near tropical room temperature (a split AC cannot hold 16-21 °C on a 33 °C day).
  // Flags: casing (milky: soil casing before pinning, a manual step). Flags for other crops:
  // maxFog (no direct fog on the crop), noFogBoost, shock { T, hours } (cold shock at pinning), spawnLights (light in spawn run).
  const CROPS = {
    oyster:    { name: 'Grey oyster', spawn: [24, 70, 5000], pinning: [24, 92, 800], fruiting: [25, 88, 1000], rest: [25, 80, 2000],
                 limits: { tMin: 20, tMax: 30, coreMax: 32 }, coreTarget: 28, range: { T: [23, 27], RH: [85, 92] } },
    // Dark-cap strain: cooler air and light give the darker cap colour.
    black:     { name: 'Black oyster', spawn: [25, 70, 5000], pinning: [23, 92, 800], fruiting: [23, 88, 900], rest: [24, 80, 2000],
                 limits: { tMin: 16, tMax: 28, coreMax: 30 }, coreTarget: 27, range: { T: [21, 25], RH: [85, 92] } },
    // Fast and very tropical. Short shelf life; cold storage damages it.
    pink:      { name: 'Pink oyster', spawn: [27, 70, 5000], pinning: [26, 92, 800], fruiting: [26, 88, 1000], rest: [27, 80, 2000],
                 limits: { tMin: 20, tMax: 32, coreMax: 33 }, coreTarget: 29, range: { T: [24, 29], RH: [85, 92] } },
    // Black spore stalks on the block surface are normal, not a mould.
    abalone:   { name: 'Abalone oyster', spawn: [27, 70, 5000], pinning: [26, 90, 1000], fruiting: [27, 87, 1000], rest: [27, 80, 2000],
                 limits: { tMin: 22, tMax: 32, coreMax: 33 }, coreTarget: 29, range: { T: [25, 30], RH: [85, 90] } },
    // Very sensitive to CO2 (long thin stems); brittle caps.
    golden:    { name: 'Golden oyster', spawn: [26, 70, 5000], pinning: [24, 92, 700], fruiting: [24, 88, 800], rest: [25, 80, 2000],
                 limits: { tMin: 18, tMax: 30, coreMax: 31 }, coreTarget: 27, range: { T: [22, 26], RH: [85, 92] } },
    // Takes more CO2 and direct water; needs light for a dark colour.
    woodear:   { name: 'Black jelly (wood ear)', spawn: [27, 70, 5000], pinning: [26, 92, 1500], fruiting: [26, 90, 1500], rest: [27, 80, 3000],
                 limits: { tMin: 20, tMax: 32, coreMax: 33 }, coreTarget: 29, range: { T: [24, 29], RH: [88, 95] } },
    // Long cycle. CO2 sets the shape: below about 1000 ppm kidney caps, above 2000 ppm antlers.
    reishi:    { name: 'Reishi (lingzhi)', spawn: [28, 70, 5000], pinning: [27, 90, 1000], fruiting: [27, 88, 1000], rest: [27, 80, 2000],
                 limits: { tMin: 22, tMax: 32, coreMax: 34 }, coreTarget: 29, range: { T: [25, 30], RH: [85, 92] } },
    // Heat-loving (30-35 °C). Held at 30 °C: the highest split AC setpoint.
    milky:     { name: 'Milky (Calocybe indica)', spawn: [30, 70, 5000], pinning: [30, 90, 1000], fruiting: [30, 85, 1000], rest: [30, 80, 2000],
                 limits: { tMin: 25, tMax: 36, coreMax: 38 }, coreTarget: 32, range: { T: [28, 34], RH: [80, 90] }, casing: true },
  };
```

Only the `range` fields and the one comment line `// range: ...` are new; every other value stays as it is.

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 67`, `# pass 67`, `# fail 0`. The 8 test vectors must pass unchanged (the ranges are data only). If `tests/vectors.test.js` fails, you changed something else: undo it.

- [ ] **Step 5: Commit**

```bash
git add controller.js tests/controller.test.js
git commit -m "feat(crops): good fruiting range per crop for mixed rooms" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `capacity.js` with common targets and design days

**Files:**
- Create: `capacity.js`
- Create: `tests/capacity.test.js`

- [ ] **Step 1: Write the failing tests**

Create `tests/capacity.test.js`:

```js
// Room capacity check (capacity.js). Spec: docs/superpowers/specs/2026-10-07-room-capacity-design.md
const test = require('node:test');
const assert = require('node:assert/strict');
require('../sim.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js');
const CAP = globalThis.ClimateCapacity, CC = globalThis.ClimateController;

const room = { name: 'Room 1', volume: 60, vent: 'supply', calib: null };
const NOW = Date.parse('2026-10-07T12:00:00Z');

// ---------- common targets ----------
test('one crop: its own fruiting targets', () => {
  assert.deepEqual(CAP.commonTargets([{ crop: 'oyster', blocks: 2000 }]), { spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' });
});

test('a mix: block-weighted targets inside every range; the most CO2-sensitive crop sets the limit', () => {
  // 1200 × 25 °C + 800 × 26 °C = 25.4 °C -> rounded to 25.5
  assert.deepEqual(CAP.commonTargets([{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 800 }]), { spT: 25.5, spRH: 88, co2Lim: 1000, crop: 'oyster' });
  const g = CAP.commonTargets([{ crop: 'pink', blocks: 1500 }, { crop: 'golden', blocks: 500 }]);
  assert.equal(g.co2Lim, 800);
  assert.equal(g.crop, 'golden');
  assert.ok(g.spT >= 24 && g.spT <= 26, `${g.spT} inside both ranges`);
});

test('no common range: impossible, and the message names both crops', () => {
  const r = CAP.commonTargets([{ crop: 'oyster', blocks: 1200 }, { crop: 'milky', blocks: 800 }]);
  assert.equal(r.impossible, true);
  assert.match(r.conflict, /Grey oyster needs at most 27 °C, Milky .* needs at least 28 °C/);
});

test('an empty mix is refused', () => {
  assert.equal(CAP.commonTargets([{ crop: 'oyster', blocks: 0 }]).impossible, true);
});

```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E 'Cannot find module|^# fail'`
Expected: `Cannot find module '../capacity.js'`.

- [ ] **Step 3: Create `capacity.js`**

```js
/*
 * capacity.js: ROOM CAPACITY CHECK
 *
 * How many blocks of a crop mix can a room carry in fruiting, on the design days of its region?
 *
 *   commonTargets(mix)                 -> { spT, spRH, co2Lim, crop } or { impossible: true, conflict }
 *   balance(room, mix, targets)        -> step 1: most blocks per machine (fan, AC, fogger), instant estimate
 *   trial(room, mix, targets, blocks)  -> step 2: one simulated run with the real controller, pass/fail per design day
 *   checkSteps(room, mix, opts)        -> generator for the full check; yields progress, returns the report
 *   check(room, mix, opts)             -> the same, run to the end
 *
 * room = { name, volume, vent, calib: { ua, infAch, moistBuffer, co2PerBlock, rmse: { T, RH, CO2 }, date } | null }
 * mix  = [{ crop, blocks, co2PerBlock? }]   (co2PerBlock in mL/h; default: the room's calibrated value)
 * Machine sizes are the simulation's (ClimateSim.PLANT). Choosing other machines is a later step.
 * Spec: docs/superpowers/specs/2026-10-07-room-capacity-design.md
 */
(function (global) {
  'use strict';
  const SIM = global.ClimateSim, CC = global.ClimateController, RT = global.ClimateRuntime;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ahSat = SIM.ahSat;

  // Pass rules for one design day. RH is one-sided: above the target does no harm, near saturation does.
  const PASS = { inT: 95, rhOk: 90, lowRhMin: 60, wetRH: 95, wetMax: 10, co2Below: 98 };
  const SEARCH = { step: 1.15, resolution: 0.05, maxRuns: 8, lowAt: 0.05, minRuns: 4, disagree: 0.15 };
  const VERDICT = { tight: 90, dense: 100, emptyBelow: 50 };
  const CALIB = { maxT: 0.5, maxRH: 5, maxCO2: 100, maxAgeDays: 90 };
  // Reasons that more blocks make worse ("dense") or fewer blocks make worse ("empty").
  const EMPTY_REASONS = ['temperature too low', 'humidity near saturation'];

  // Design days: 24 hourly outdoor values. T follows a cosine (low 03:00, high 15:00); RH falls as T rises.
  function makeDay(name, tLo, tHi, rhLo, rhHi) {
    const T = [], RH = [];
    for (let h = 0; h < 24; h++) {
      const f = (1 - Math.cos(2 * Math.PI * (h - 3) / 24)) / 2;        // 0 at 03:00, 1 at 15:00
      T.push(+(tLo + (tHi - tLo) * f).toFixed(2));
      RH.push(+(rhHi - (rhHi - rhLo) * f).toFixed(1));
    }
    return { name, T, RH };
  }
  // ESTIMATES for lowland Peninsular Malaysia: replace with MetMalaysia data when available.
  const DESIGN_DAYS = {
    'my-lowland': {
      name: 'Lowland Peninsular Malaysia (estimates)',
      days: [makeDay('Hot-dry', 24, 34, 50, 90), makeDay('Hot-humid', 25, 32, 70, 95), makeDay('Mild / rainy', 23, 28, 85, 98)],
    },
  };

  // ---------- 1. Common targets ----------
  function commonTargets(mix) {
    const items = mix.filter(m => m.blocks > 0);
    if (!items.length) return { impossible: true, conflict: 'Add at least one crop with blocks.' };
    const total = items.reduce((s, m) => s + m.blocks, 0);
    const crop = m => CC.CROPS[m.crop];
    const pick = (key, idx) => {
      const lo = Math.max(...items.map(m => crop(m).range[key][0]));
      const hi = Math.min(...items.map(m => crop(m).range[key][1]));
      const avg = items.reduce((s, m) => s + crop(m).fruiting[idx] * m.blocks, 0) / total;
      return { lo, hi, value: clamp(avg, lo, hi) };
    };
    const conflict = (key, unit, r) => {
      const a = items.find(m => crop(m).range[key][1] === r.hi), b = items.find(m => crop(m).range[key][0] === r.lo);
      return `${crop(a).name} needs at most ${r.hi} ${unit}, ${crop(b).name} needs at least ${r.lo} ${unit}: no common ${key === 'T' ? 'temperature' : 'humidity'}.`;
    };
    const T = pick('T', 0), H = pick('RH', 1);
    if (T.lo > T.hi) return { impossible: true, conflict: conflict('T', '°C', T) };
    if (H.lo > H.hi) return { impossible: true, conflict: conflict('RH', '% RH', H) };
    // The most CO2-sensitive crop sets the limit; with a tie, the crop with more blocks.
    const sens = items.slice().sort((a, b) => crop(a).fruiting[2] - crop(b).fruiting[2] || b.blocks - a.blocks)[0];
    return { spT: Math.round(T.value * 2) / 2, spRH: Math.round(H.value), co2Lim: crop(sens).fruiting[2], crop: sens.crop };
  }

  // CO2 per block of the mix (block-weighted), mL/h.
  function mixCo2(room, mix) {
    const def = (room.calib && room.calib.co2PerBlock) || SIM.DEFAULT_ENV.co2PerBlock;
    const total = mix.reduce((s, m) => s + m.blocks, 0);
    return total ? mix.reduce((s, m) => s + m.blocks * (m.co2PerBlock || def), 0) / total : def;
  }
  const roomOf = room => ({
    ...SIM.PLANT.room,
    ...(room.calib ? { ua: room.calib.ua, infAch: room.calib.infAch, moistBuffer: room.calib.moistBuffer } : {}),
    volume: room.volume || SIM.PLANT.room.volume,
  });

  global.ClimateCapacity = { commonTargets, DESIGN_DAYS, PASS, VERDICT, SEARCH };
})(typeof window !== 'undefined' ? window : globalThis);
```

Notes:
- `PASS`, `SEARCH`, `VERDICT`, `CALIB` and `EMPTY_REASONS` are used by later tasks; they are defined here once.
- The design days are **estimates**; the comment says so, and the page says so.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 4`, `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add capacity.js tests/capacity.test.js
git commit -m "feat(capacity): common targets for a crop mix and design days" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Step 1, the heat-and-water balance

**Files:**
- Modify: `capacity.js`
- Test: `tests/capacity.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/capacity.test.js`:

```js
// ---------- balance ----------
test('balance: the fan limit matches a hand calculation', () => {
  // 900 m³/h × (900 - 420) ppm / 45 mL/h per block = 9600 blocks
  const tg = CAP.commonTargets([{ crop: 'oyster', blocks: 1 }]);
  assert.equal(CAP.balance(room, [{ crop: 'oyster', blocks: 1 }], tg).fan, 9600);
  // An exhaust fan also gets the leakage air: (900 + 0.4 × 60) × 480 / 45 = 9856
  assert.equal(CAP.balance({ ...room, vent: 'exhaust' }, [{ crop: 'oyster', blocks: 1 }], tg).fan, 9856);
});

test('balance: a cooler crop carries fewer blocks; milky is limited by the fogger', () => {
  const est = crop => CAP.balance(room, [{ crop, blocks: 1 }], CAP.commonTargets([{ crop, blocks: 1 }]));
  assert.ok(est('golden').ac < est('oyster').ac && est('oyster').ac < est('pink').ac);
  assert.equal(est('milky').limit, 'fog');
});

```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|is not a function'`
Expected: two `not ok` lines with `CAP.balance is not a function`.

- [ ] **Step 3: Add the balance**

In `capacity.js`, insert this section directly **before** the line `  global.ClimateCapacity = ...`:

```js
  // ---------- 2. Balance (step 1) ----------
  // Largest n in [0, max] with need(n) <= cap. need(0) > cap gives 0; no limit up to max gives Infinity.
  function maxBlocks(need, cap, max = 200000) {
    if (need(0) > cap) return 0;
    let ok = 0, bad = null;
    for (let n = 100; n <= max; n *= 2) { if (need(n) > cap) { bad = n; break; } ok = n; }
    if (bad == null) return Infinity;
    while (bad - ok > 1) { const m = Math.floor((ok + bad) / 2); if (need(m) > cap) bad = m; else ok = m; }
    return ok;
  }
  // Per hour of each design day, with the room at target + band (the pass rule allows the band edge):
  //   S = sensible heat gain (W), G = water gain (g/s) from the outdoor air and the blocks.
  //   The fog replaces the water the AC coil takes out, and its evaporation cools the air, so the AC
  //   carries S + 2450·G. When the coil cannot take out G, the room runs wetter than the target (allowed)
  //   and the coil's water removal (at most latentMax of its output) is lost for cooling: S / (1 - latentMax).
  // Each day's worst hour is left out: the pass rule allows 5 % of the day out of band.
  function balance(room, mix, tg, region = 'my-lowland') {
    const P = SIM.PLANT, R = roomOf(room), c = mixCo2(room, mix), rules = CC.defaultRules(tg.co2Lim);
    const leak = room.vent === 'exhaust' ? R.infAch * R.volume : 0;               // m³/h; supply fan: no leak in
    const fanBase = CC.MACHINES.fanM3h[rules.baseFan.fruiting] + leak;
    const fanTop = P.fan.levels[P.fan.levels.length - 1].m3h + leak;
    const fogTop = P.fogger.levels[P.fogger.levels.length - 1].gph / 3600;         // g/s
    const dC = rules.fanOn - R.co2Out;                                              // CO2 held at the fan start level
    const air = n => Math.max(fanBase, n * c / dC) / 3600;                          // m³/s of outdoor air
    const blockW = c / 60000 * P.resp.wPerLpm, blockGps = c / 60000 * P.resp.gpsPerLpm + P.transpGph / 3600;
    const tRoom = tg.spT + CC.BANDS.T, ahT = tg.spRH / 100 * ahSat(tRoom), share = P.ac.latentMax.auto;
    const coilRate = 0.14 * Math.max(0, ahT - ahSat(P.ac.coil.auto));              // g/s at full output
    const latent = A => Math.min(coilRate * A / P.ac.capW, share * A / 2450);
    const days = DESIGN_DAYS[region].days;
    const hours = days.map(d => d.T.map((T, h) => ({ T, ah: d.RH[h] / 100 * ahSat(T),
      sun: h > 7 && h < 19 ? Math.sin(Math.PI * (h - 7) / 12) : 0, lights: h >= 7 && h < 19 })));
    const at = (n, x) => {
      const q = air(n), dT = x.T - tRoom;
      const S = R.ua * dT + q * 1206 * dT + P.loads.baseW + (x.lights ? P.loads.lightsW : 0) + x.sun * P.loads.solarPeakW + n * blockW;
      const G = q * (x.ah - ahT) + n * blockGps;
      const A1 = S + 2450 * G, L = latent(Math.max(0, A1));
      return L >= G ? { ac: A1, fog: L - G } : { ac: S / (1 - share), fog: 0 };
    };
    const secondWorst = key => n => Math.max(...hours.map(day => day.map(x => at(n, x)[key]).sort((a, b) => b - a)[1]));
    const out = { fan: maxBlocks(n => n * c / dC, fanTop), ac: maxBlocks(secondWorst('ac'), P.ac.capW), fog: maxBlocks(secondWorst('fog'), fogTop) };
    out.estimate = Math.min(out.fan, out.ac, out.fog);
    out.limit = ['fan', 'ac', 'fog'].find(k => out[k] === out.estimate);
    return out;
  }

```

Then replace the `global.ClimateCapacity = ...` line with:

```js
  global.ClimateCapacity = { commonTargets, balance, DESIGN_DAYS, PASS, VERDICT, SEARCH };
```

Why the model looks like this (measured on 2026-10-07): at 15:00 of a hot day the fogger runs and its evaporation removes about 680 W, so a sensible-only balance said 450 blocks while the simulation held 2,000. The total-heat form (S + 2450·G) matches the simulation within 13 % for grey, golden and pink oyster and milky.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 6`, `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add capacity.js tests/capacity.test.js
git commit -m "feat(capacity): heat-and-water balance estimate (step 1)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Step 2, one simulated trial over the design days

**Files:**
- Modify: `capacity.js`
- Test: `tests/capacity.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/capacity.test.js`:

```js
// ---------- trial ----------
test('trial: 2000 grey oyster pass all three design days', () => {
  const mix = [{ crop: 'oyster', blocks: 2000 }];
  const r = CAP.trial(room, mix, CAP.commonTargets(mix), 2000);
  assert.equal(r.pass, true, JSON.stringify(r.days));
  assert.equal(r.days.length, 3);
  assert.ok(r.kwhDay > 5 && r.kwhDay < 30, `${r.kwhDay} kWh/day`);
});

test('trial: too many blocks fail on temperature ("dense"); too few cool-crop blocks fail near saturation ("empty")', () => {
  const grey = [{ crop: 'oyster', blocks: 6000 }];
  const d = CAP.trial(room, grey, CAP.commonTargets(grey), 6000);
  assert.equal(d.side, 'dense');
  assert.ok(d.days.some(x => x.fails.includes('temperature too high')));
  const golden = [{ crop: 'golden', blocks: 200 }];
  const e = CAP.trial(room, golden, CAP.commonTargets(golden), 200);
  assert.equal(e.side, 'empty');
  assert.ok(e.days.some(x => x.fails.includes('humidity near saturation')));
});

```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|is not a function'`
Expected: two `not ok` lines with `CAP.trial is not a function`.

- [ ] **Step 3: Add the trial**

Insert directly before `  global.ClimateCapacity = ...`:

```js
  // ---------- 3. Trial (step 2) ----------
  // One run: a warm-up day (the first design day), then each design day. The real room air is scored.
  function trial(room, mix, tg, blocks, region = 'my-lowland', dt = 10) {
    const days = DESIGN_DAYS[region].days, seq = [days[0], ...days];
    const n = Math.max(0, Math.round(blocks));
    const e = structuredClone(SIM.DEFAULT_ENV);
    Object.assign(e, { startHour: 0, blocks: n, co2PerBlock: mixCo2(room, mix), blockStage: 'fruiting', vent: room.vent || e.vent,
      noise: false, sensorQuality: 'ideal', harvestDoors: false, randomWeather: false, dailyCycle: false });
    e.room = roomOf(room);
    e.weatherSeries = [];
    seq.forEach((d, k) => d.T.forEach((T, h) => e.weatherSeries.push({ t: (k * 24 + h) * 3600, T, RH: d.RH[h] })));
    const last = days[days.length - 1];
    e.weatherSeries.push({ t: seq.length * 86400, T: last.T[0], RH: last.RH[0] });
    const cfg = CC.defaultSettings();
    cfg.crop = tg.crop; cfg.stage = 'fruiting'; CC.applyProfile(cfg);
    cfg.spT = tg.spT; cfg.spRH = tg.spRH;
    cfg.program.harvest.on = false;                       // harvest windows lower RH on purpose
    const sim = SIM.create(e);
    sim.setRoom({ T: tg.spT, RH: tg.spRH, CO2: tg.co2Lim - 200 });
    const ctl = CC.create(cfg, null, null), io = RT.simIO(sim);
    const score = seq.map(() => ({ n: 0, inT: 0, tHi: 0, tLo: 0, rhOk: 0, lowRh: 0, wet: 0, co2Below: 0 }));
    let kwh0 = null, kwh1 = null;
    const rt = RT.createRuntime({ io, ctl, onReading: r => {
      const k = Math.floor(r.t / 86400);
      if (k < 1 || k >= seq.length) return;
      const v = sim.view(), s = score[k];
      if (!kwh0) kwh0 = { ...r.kwh };
      kwh1 = r.kwh;
      s.n++;
      if (Math.abs(v.T - tg.spT) <= CC.BANDS.T) s.inT++; else if (v.T > tg.spT) s.tHi++; else s.tLo++;
      if (v.RH >= tg.spRH - CC.BANDS.RH) s.rhOk++;
      if (v.RH < tg.spRH - CC.BANDS.RHAlarm) s.lowRh++;
      if (v.RH > PASS.wetRH) s.wet++;
      if (v.CO2 <= tg.co2Lim) s.co2Below++;
    } });
    rt.poll();
    for (let t = 0; t < seq.length * 86400; t += dt) { io.advance(dt); rt.poll(); }
    const result = score.slice(1).map((s, i) => {
      const pc = x => x / s.n * 100;
      const d = { name: days[i].name, inT: pc(s.inT), rhOk: pc(s.rhOk), lowRhMin: s.lowRh / s.n * 1440, wet: pc(s.wet), co2Below: pc(s.co2Below) };
      d.fails = [
        d.inT < PASS.inT && (s.tHi >= s.tLo ? 'temperature too high' : 'temperature too low'),
        d.rhOk < PASS.rhOk && 'humidity too low',
        d.lowRhMin > PASS.lowRhMin && 'humidity at the low alarm',
        d.wet > PASS.wetMax && 'humidity near saturation',
        d.co2Below < PASS.co2Below && 'CO₂ above the limit',
      ].filter(Boolean);
      d.pass = d.fails.length === 0;
      return d;
    });
    const kwhDay = kwh1 ? Object.keys(kwh1).reduce((sum, k) => sum + kwh1[k] - kwh0[k], 0) / days.length : 0;
    const fails = result.flatMap(d => d.fails);
    const side = !fails.length ? null : fails.every(f => EMPTY_REASONS.includes(f)) ? 'empty' : 'dense';
    return { blocks: n, days: result, pass: !fails.length, side, kwhDay };
  }

```

Replace the export line with:

```js
  global.ClimateCapacity = { commonTargets, balance, trial, DESIGN_DAYS, PASS, VERDICT, SEARCH };
```

Notes:
- `startHour: 0` makes the simulation hour equal to the series hour, so the sun and the lights line up with the design day.
- The trial uses `dt = 10` s like `calib.js`; one trial (4 simulated days) takes about 0.2–0.4 s.
- RH is judged one-sided (spec, "Why RH is one-sided"): `rhOk` counts RH ≥ target − 3; `wet` counts RH > 95 %.

- [ ] **Step 4: Run the tests**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 8`, `# pass 8`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add capacity.js tests/capacity.test.js
git commit -m "feat(capacity): simulated trial over three design days (step 2)" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Calibration status and verdicts

**Files:**
- Modify: `capacity.js`
- Test: `tests/capacity.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/capacity.test.js`:

```js
// ---------- calibration status ----------
test('calibration status: none, good, poor, old', () => {
  assert.equal(CAP.calibStatus(room, NOW).estimate, true);
  const cal = { ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1.5, CO2: 30 }, date: '2026-10-01T00:00:00Z' };
  assert.deepEqual(CAP.calibStatus({ ...room, calib: cal }, NOW), { calibrated: true, estimate: false, warnings: [] });
  const poor = CAP.calibStatus({ ...room, calib: { ...cal, rmse: { T: 0.9, RH: 1, CO2: 20 } } }, NOW);
  assert.equal(poor.estimate, true);
  const old = CAP.calibStatus({ ...room, calib: { ...cal, date: '2026-05-01T00:00:00Z' } }, NOW);
  assert.equal(old.estimate, false);
  assert.match(old.warnings[0], /days old/);
});

// ---------- verdicts ----------
test('verdict thresholds', () => {
  const cap = { max: 1000, min: 0 };
  const v = n => CAP.verdictOf(n, cap).verdict;
  assert.equal(v(490), 'too-empty');
  assert.equal(v(500), 'good');
  assert.equal(v(894), 'good');                 // 89.4 % shows as 89 %
  assert.equal(v(896), 'tight');                // 89.6 % shows as 90 %
  assert.equal(v(1004), 'tight');               // 100.4 % shows as 100 %
  assert.equal(v(1006), 'too-dense');           // 100.6 % shows as 101 %
  assert.equal(CAP.verdictOf(400, cap, { emptyBelow: 30 }).verdict, 'good');
  assert.equal(CAP.verdictOf(500, { max: 0, min: 0 }).verdict, 'impossible');
  assert.deepEqual(CAP.verdictOf(500, { max: 2000, min: 600 }), { verdict: 'too-empty', why: 'wet', utilisation: 25 });
});

```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|is not a function'`
Expected: two `not ok` lines (`CAP.calibStatus is not a function`, `CAP.verdictOf is not a function`).

- [ ] **Step 3: Add the two functions**

Insert directly before `  global.ClimateCapacity = ...`:

```js
  // ---------- 4. Calibration status ----------
  function calibStatus(room, now = Date.now()) {
    const c = room.calib;
    if (!c) return { calibrated: false, estimate: true, warnings: ['Estimate: this room is not calibrated, so the check uses typical room values. Calibrate this room in its Calibrate tab.'] };
    const warnings = [];
    const r = c.rmse || {};
    const poor = r.T > CALIB.maxT || r.RH > CALIB.maxRH || r.CO2 > CALIB.maxCO2;
    if (poor) warnings.push('Estimate: the calibration fits the log poorly. Calibrate again with a longer log (24–48 h).');
    const ageDays = c.date ? (now - Date.parse(c.date)) / 86400000 : 0;
    if (ageDays > CALIB.maxAgeDays) warnings.push(`The calibration is ${Math.round(ageDays)} days old: the room may have changed (season, insulation, leaks). Calibrate again.`);
    return { calibrated: true, estimate: poor, warnings };
  }

  // ---------- 5. Verdict ----------
  function verdictOf(planned, cap, opts = {}) {
    const emptyBelow = opts.emptyBelow ?? VERDICT.emptyBelow;
    if (!cap.max) return { verdict: 'impossible', utilisation: null };
    const utilisation = Math.round(planned / cap.max * 100);     // whole percent: the verdict matches the number shown
    if (cap.min && planned < cap.min) return { verdict: 'too-empty', why: 'wet', utilisation };
    if (utilisation > VERDICT.dense) return { verdict: 'too-dense', utilisation };
    if (utilisation >= VERDICT.tight) return { verdict: 'tight', utilisation };
    if (utilisation < emptyBelow) return { verdict: 'too-empty', why: 'use', utilisation };
    return { verdict: 'good', utilisation };
  }

```

Replace the export line with:

```js
  global.ClimateCapacity = { commonTargets, balance, trial, calibStatus, verdictOf, DESIGN_DAYS, PASS, VERDICT, SEARCH };
```

The utilisation is rounded to a whole percent **before** the thresholds, so a farmer who sees "50 %" never gets "too empty" (49.8 % used to show as 50 % with the verdict "too empty").

- [ ] **Step 4: Run the tests**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 10`, `# pass 10`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add capacity.js tests/capacity.test.js
git commit -m "feat(capacity): calibration status and verdicts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The full check (search for the pass window)

**Files:**
- Modify: `capacity.js`
- Test: `tests/capacity.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `tests/capacity.test.js`:

```js
// ---------- full check ----------
test('check: the capacity is the real limit (passes at the capacity, fails 10 % above)', () => {
  // A room with other walls, leaks and blocks than the default: the search must still find its limit.
  const hidden = { ...room, calib: { ua: 140, infAch: 0.9, moistBuffer: 4, co2PerBlock: 60, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
  const mix = [{ crop: 'oyster', blocks: 2000 }];
  const t0 = Date.now();
  const r = CAP.check(hidden, mix, { now: NOW });
  assert.ok(Date.now() - t0 < 20000, 'a full check takes less than 20 s');
  assert.ok(r.capacity.max > 0 && r.capacity.settled, JSON.stringify(r.capacity));
  const tg = CAP.commonTargets(mix);
  assert.equal(CAP.trial(hidden, mix, tg, r.capacity.max).pass, true);
  assert.equal(CAP.trial(hidden, mix, tg, r.capacity.max * 1.1).pass, false);
});

test('check: 2000 grey oyster in the default room is good; 6000 is too dense', () => {
  const good = CAP.check(room, [{ crop: 'oyster', blocks: 2000 }], { now: NOW });
  assert.equal(good.verdict, 'good');
  assert.equal(good.estimate, true, 'uncalibrated room: the report is an estimate');
  assert.ok(good.energy.rmPerBlockCycle > 0);
  assert.equal(good.limit[0].day, 'Hot-humid');
  const dense = CAP.check(room, [{ crop: 'oyster', blocks: 6000 }], { now: NOW });
  assert.equal(dense.verdict, 'too-dense');
  assert.ok(dense.utilisation > 100);
});

test('check: 200 golden oyster is too empty (too wet), with a minimum and a maximum', () => {
  const r = CAP.check(room, [{ crop: 'golden', blocks: 200 }], { now: NOW });
  assert.equal(r.verdict, 'too-empty');
  assert.equal(r.why, 'wet');
  assert.ok(r.capacity.min > 200 && r.capacity.min < r.capacity.max, JSON.stringify(r.capacity));
});

test('check: an impossible mix runs no simulation', () => {
  const r = CAP.check(room, [{ crop: 'oyster', blocks: 1200 }, { crop: 'milky', blocks: 800 }], { now: NOW });
  assert.equal(r.verdict, 'impossible');
  assert.equal(r.runs.length, 0);
});

test('check: the capacity is split over the crops in the mix ratios', () => {
  const r = CAP.check(room, [{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 800 }], { now: NOW });
  const [a, b] = r.perCrop;
  assert.ok(a.max + b.max <= r.capacity.max && a.max + b.max >= r.capacity.max - 1);
  assert.ok(Math.abs(a.max / b.max - 1.5) < 0.01);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|is not a function'`
Expected: five `not ok` lines with `CAP.check is not a function`.

- [ ] **Step 3: Add the check**

Insert directly before `  global.ClimateCapacity = ...`:

```js
  // ---------- 6. Full check ----------
  // opts: { region, emptyBelow, tariff (RM/kWh), cycleDays, now }
  function* checkSteps(room, mix, opts = {}) {
    const region = opts.region || 'my-lowland';
    const planned = mix.reduce((s, m) => s + (m.blocks > 0 ? m.blocks : 0), 0);
    const cal = calibStatus(room, opts.now);
    const base = { room: room.name, mix: mix.map(m => ({ ...m })), planned, ...cal };
    const tg = commonTargets(mix);
    if (tg.impossible) return { ...base, verdict: 'impossible', why: tg.conflict, runs: [] };
    const est = balance(room, mix, tg, region);
    const runs = [];
    const maxRuns = 1 + SEARCH.maxRuns + 1 + SEARCH.minRuns;
    function* run(n) {
      const r = trial(room, mix, tg, n, region);
      runs.push(r);
      yield { runs: runs.length, maxRuns, blocks: r.blocks, pass: r.pass };
      return r;
    }
    // Upper end: the largest passing size, to 5 %.
    const plan = yield* run(planned);
    let lo = plan.pass ? plan.blocks : null, hi = plan.pass || plan.side === 'empty' ? null : plan.blocks;
    let lowFail = plan.side === 'empty' ? plan.blocks : null;
    const up = n => Math.max(est.estimate, n * SEARCH.step), down = n => Math.min(est.estimate, n / SEARCH.step);
    let next = plan.pass || plan.side === 'empty' ? up(planned) : down(planned);
    if (!Number.isFinite(next)) next = (lo || planned) * 2;
    for (let i = 0; i < SEARCH.maxRuns; i++) {
      if (lo != null && hi != null && (hi - lo) / lo <= SEARCH.resolution) break;
      if (lo != null && hi != null) next = (lo + hi) / 2;
      else if (lo != null && next <= lo) next = lo * SEARCH.step;
      else if (hi != null && next >= hi) next = hi / SEARCH.step;
      const r = yield* run(Math.max(1, next));
      if (r.pass) { lo = r.blocks; next = r.blocks * SEARCH.step; }
      else if (r.side === 'empty' && (lo == null || r.blocks < lo)) { lowFail = Math.max(lowFail ?? 0, r.blocks); next = hi != null ? (r.blocks + hi) / 2 : up(r.blocks); }
      else { hi = r.blocks; next = r.blocks / SEARCH.step; }
    }
    // Lower end: does a nearly empty room fail (too wet, too cold)? Then find the smallest passing size, to 10 %.
    let min = 0;
    if (lo != null) {
      let a = lowFail;
      if (a == null) { const low = yield* run(Math.max(1, planned * SEARCH.lowAt)); if (!low.pass) a = low.blocks; }
      if (a != null) {
        let b = runs.filter(r => r.pass).reduce((m, r) => Math.min(m, r.blocks), Infinity);
        for (let i = 0; i < SEARCH.minRuns && (b - a) / b > 0.1; i++) {
          const r = yield* run((a + b) / 2);
          if (r.pass) b = r.blocks; else a = r.blocks;
        }
        min = b;
      }
    } else {
      const low = yield* run(Math.max(1, planned * SEARCH.lowAt));
      if (low.pass) lo = low.blocks;                       // passes only when nearly empty
    }
    const cap = { max: lo || 0, hi, min, settled: lo != null && hi != null && (hi - lo) / lo <= SEARCH.resolution };
    const failing = runs.filter(r => !r.pass && r.side === 'dense').sort((a, b) => a.blocks - b.blocks)[0];
    const limit = failing ? failing.days.filter(d => !d.pass).map(d => ({ day: d.name, fails: d.fails })) : [];
    const v = verdictOf(planned, cap, opts);
    const tariff = opts.tariff ?? 0.57;
    const P = CC.defaultProgram(), cycleDays = opts.cycleDays ?? P.days.fruiting * P.flushes + P.days.rest * (P.flushes - 1);
    const total = planned || 1;
    return {
      ...base, targets: tg, balance: est, capacity: cap, limit, ...v,
      perCrop: mix.map(m => ({ crop: m.crop, max: Math.floor(cap.max * m.blocks / total), min: Math.ceil(cap.min * m.blocks / total) })),
      energy: { kwhDay: plan.kwhDay, rmPerBlockCycle: planned ? plan.kwhDay * tariff * cycleDays / planned : null, cycleDays, tariff },
      disagree: cap.max > 0 && Number.isFinite(est.estimate) && Math.abs(est.estimate - cap.max) / cap.max > SEARCH.disagree,
      runs: runs.map(r => ({ blocks: r.blocks, pass: r.pass, side: r.side, days: r.days })),
    };
  }
  function check(room, mix, opts) {
    const g = checkSteps(room, mix, opts);
    for (;;) { const s = g.next(); if (s.done) return s.value; if (opts && opts.onStep) opts.onStep(s.value); }
  }
  // Same check; it gives the page a moment between runs and reports the progress.
  async function checkAsync(room, mix, opts = {}) {
    const g = checkSteps(room, mix, opts);
    for (;;) {
      const s = g.next();
      if (s.done) return s.value;
      if (opts.onProgress) opts.onProgress(s.value);
      await new Promise(r => setTimeout(r, 0));
    }
  }

```

Replace the export line with:

```js
  global.ClimateCapacity = { commonTargets, balance, trial, calibStatus, verdictOf, checkSteps, check, checkAsync, DESIGN_DAYS, PASS, VERDICT, SEARCH };
```

How the search works (spec, "Pass window"): the planned size runs first (its energy goes in the report). A pass or an "empty" failure moves up, a "dense" failure moves down; the first move jumps to the balance estimate. Once a pass and a fail bracket the limit, the interval is halved to 5 %. Then the lower end: an "empty" failure seen so far, or a run at 5 % of the plan, starts a halving search for the smallest passing size (to 10 %).

- [ ] **Step 4: Run the tests**

Run: `node --test tests/capacity.test.js 2>&1 | grep -E '^not ok|^# (tests|pass|fail|duration)'`
Expected: `# tests 15`, `# pass 15`, `# fail 0`, duration under about 10 s.

Reference results in the default room (uncalibrated) for a quick sanity check:

| Plan | Verdict | Window |
|---|---|---|
| 2,000 grey oyster | good, 55 % | max ≈ 3,650 |
| 6,000 grey oyster | too dense | max ≈ 3,700 |
| 200 golden oyster | too empty (too wet) | ≈ 605 – 1,890 |
| 2,000 black oyster | tight, 96 % | ≈ 1,170 – 2,075 (balance disagrees: expected) |
| 1,200 grey + 800 milky | impossible (no common temperature) | – |

- [ ] **Step 5: Run the whole suite**

Run: `npm test 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 82`, `# pass 82`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add capacity.js tests/capacity.test.js
git commit -m "feat(capacity): full check with pass window, verdict and energy per block" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The "Room capacity" card (markup and styles)

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

- [ ] **Step 1: Add the card**

In `index.html`, insert this directly **before** the line `  <!-- ================= CONTROLLER ================= -->` (that is, after the calibration card's closing `</section>`):

```html
  <section class="card capacity" aria-labelledby="hCap">
    <div class="rules-head">
      <h2 id="hCap">Room capacity</h2>
      <span class="tag">How many blocks can a room carry in fruiting, on a hot-dry, a hot-humid and a rainy day? It uses the calibrated room values. The design days are estimates for lowland Peninsular Malaysia.</span>
    </div>
    <div class="cal-row">
      <label for="capRoom">Room</label><select id="capRoom"></select>
      <input type="text" id="capName" placeholder="Name for a new room" aria-label="Name for a new room">
      <button class="btn" id="capSave">Save the present room</button>
      <button class="btn" id="capDelete">Delete room</button>
      <span class="tag" id="capRoomInfo"></span>
    </div>
    <table class="cap-mix">
      <thead><tr><th>Mushroom</th><th>Blocks</th><th>CO₂ per block, mL/h (optional)</th><th><span class="vh">Remove</span></th></tr></thead>
      <tbody id="capMix"></tbody>
    </table>
    <div class="cal-row">
      <button class="btn" id="capAdd">Add a crop</button>
      <label class="num" for="capEmpty">Too empty below <input type="number" id="capEmpty" min="10" max="90" step="5" value="50"> %</label>
      <button class="btn" id="capRun">Run check</button>
      <progress id="capProg" max="1" value="0" hidden></progress>
      <span class="tag" id="capMsg">Save a room, enter the crops, then run the check.</span>
    </div>
    <div id="capReport" class="cap-report" aria-live="polite"></div>
    <p id="capFarm" class="cap-farm"></p>
    <div class="cal-row">
      <button class="btn" id="capExport">Export rooms</button>
      <label class="btn" for="capImport">Import rooms</label><input type="file" id="capImport" accept=".json,application/json" class="vh">
    </div>
  </section>

```

- [ ] **Step 2: Load the module**

In `index.html`, after `<script src="calib.js"></script>`, add:

```html
<script src="capacity.js"></script>
```

`capacity.js` must load after `sim.js`, `controller.js` and `runtime.js` and before `app.js`.

- [ ] **Step 3: Add the styles**

Append to the end of `styles.css`:

```css
/* Room capacity */
.capacity { grid-column: span 12; }
.capacity h2 { font-size: 16px; font-weight: 600; }
.cap-mix { max-width: 720px; margin-bottom: 10px; }
.cap-mix input[type="number"] { width: 90px; }
.cap-report { display: grid; gap: 8px; margin: 6px 0 10px; }
.cap-report p { margin: 0; }
.cap-report .warn { color: var(--warning); }
.cap-report .note { color: var(--muted); font-size: 13px; }
.cap-util { height: 8px; max-width: 480px; background: var(--band); border-radius: 4px; overflow: hidden; }
.cap-util span { display: block; height: 100%; background: var(--lvl, var(--ink)); }
.cap-util[data-lvl="good"] { --lvl: var(--good); }
.cap-util[data-lvl="warning"] { --lvl: var(--warning); }
.cap-util[data-lvl="serious"] { --lvl: var(--serious); }
.cap-util[data-lvl="critical"] { --lvl: var(--critical); }
.cap-farm { font-weight: 600; margin: 0 0 10px; }
```

- [ ] **Step 4: Check the page still loads**

Open `index.html` in a browser (no server needed). Expected: the simulation runs; a "Room capacity" card shows after "Calibration with a farm log"; the browser console has no errors. The buttons do nothing yet.

- [ ] **Step 5: Commit**

```bash
git add index.html styles.css
git commit -m "feat(page): room capacity card markup and styles" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Wire the card in `app.js`

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Remember the applied calibration**

In `app.js`, find:

```js
let calRows = null, calFit = null, calBase = null;
```

and add a line after it:

```js
let calApplied = null;          // the last applied calibration, for the room capacity check
```

In the `$('#calApply')` click handler, directly after the line that starts with `  env.co2PerBlock = Math.round(P.co2PerBlock);`, add:

```js
  calApplied = { ua: P.ua, infAch: P.infAch, moistBuffer: P.moistBuffer, co2PerBlock: env.co2PerBlock, rmse: calFit.result.rmse, date: new Date().toISOString() };
```

(It must come before the handler sets `calFit = null`.)

- [ ] **Step 2: Add the capacity section**

Insert this directly **before** the line `// ---------------- Settings level and test bench ----------------`:

```js
// ---------------- Room capacity ----------------
// Rooms are kept in this browser (localStorage). Settings storage (work item 3.1) should use the same
// "mushroom-farm." key prefix. Spec: docs/superpowers/specs/2026-10-07-room-capacity-design.md
const CAPY = window.ClimateCapacity;
const ROOMS_KEY = 'mushroom-farm.rooms.v1';
let rooms = loadRooms(), roomIdx = 0, capBusy = false;
function loadRooms() {
  try { const x = JSON.parse(localStorage.getItem(ROOMS_KEY)); return Array.isArray(x && x.rooms) ? x.rooms : []; } catch { return []; }
}
function saveRooms() {
  try { localStorage.setItem(ROOMS_KEY, JSON.stringify({ version: 1, rooms })); }
  catch { set('capMsg', 'The browser did not save the rooms (storage full or blocked).'); }
}
const curRoom = () => rooms[roomIdx] || null;
const nf = n => Math.round(n).toLocaleString('en');
const cropName = k => (CC.CROPS[k] ? CC.CROPS[k].name : k);
const roomChanged = r => { r.report = null; saveRooms(); renderReport(); renderFarm(); };
function renderRooms() {
  const sel = $('#capRoom');
  sel.replaceChildren(...rooms.map((r, i) => { const o = document.createElement('option'); o.value = String(i); o.textContent = r.name; return o; }));
  if (!rooms.length) { const o = document.createElement('option'); o.textContent = 'No rooms yet'; o.disabled = true; sel.append(o); }
  roomIdx = clamp(roomIdx, 0, Math.max(0, rooms.length - 1));
  if (rooms.length) sel.value = String(roomIdx);
  const r = curRoom();
  set('capRoomInfo', !r ? '' : r.calib ? `${r.volume} m³ · calibrated ${r.calib.date.slice(0, 10)}` : `${r.volume} m³ · not calibrated (typical values)`);
  $('#capDelete').disabled = $('#capRun').disabled = $('#capAdd').disabled = !r;
  renderMix(); renderReport(); renderFarm();
}
function renderMix() {
  const r = curRoom(), body = $('#capMix');
  if (!r) { body.replaceChildren(); return; }
  const td = x => { const c = document.createElement('td'); c.append(x); return c; };
  const num = (val, label, apply) => {
    const el = document.createElement('input'); el.type = 'number'; el.min = '0'; el.step = '1'; el.value = val ?? ''; el.setAttribute('aria-label', label);
    el.addEventListener('change', () => { apply(el.value === '' ? null : Math.max(0, Math.round(+el.value))); roomChanged(r); });
    return el;
  };
  body.replaceChildren(...r.mix.map((m, i) => {
    const sel = document.createElement('select'); sel.setAttribute('aria-label', 'Mushroom');
    for (const [k, c] of Object.entries(CC.CROPS)) { if (!c.range) continue; const o = document.createElement('option'); o.value = k; o.textContent = c.name; sel.append(o); }
    sel.value = m.crop;
    sel.addEventListener('change', () => { m.crop = sel.value; roomChanged(r); });
    const del = document.createElement('button'); del.className = 'btn'; del.textContent = 'Remove';
    del.addEventListener('click', () => { r.mix.splice(i, 1); renderMix(); roomChanged(r); });
    const tr = document.createElement('tr');
    tr.append(td(sel), td(num(m.blocks, 'Blocks', v => { m.blocks = v || 0; })), td(num(m.co2PerBlock, 'CO₂ per block, mL/h', v => { m.co2PerBlock = v || undefined; })), td(del));
    return tr;
  }));
}
const VERDICT_CHIP = {
  impossible: { lvl: 'critical', icon: '◆', text: 'Impossible' },
  'too-dense': { lvl: 'serious', icon: '▲', text: 'Too dense' },
  tight: { lvl: 'warning', icon: '▲', text: 'Tight' },
  good: { lvl: 'good', icon: '✓', text: 'Good' },
  'too-empty': { lvl: 'warning', icon: '▼', text: 'Too empty' },
};
const LIMIT_WORD = { fan: 'the fan (fresh air for CO₂)', ac: 'the AC (heat)', fog: 'the fogger (water)' };
function verdictText(rep) {
  const cap = rep.capacity, pct = rep.utilisation == null ? '' : ` (${Math.round(rep.utilisation)} %)`;
  const holds = cap ? `Holds ${cap.settled ? '' : 'at least '}${nf(cap.max)} blocks` : '';
  switch (rep.verdict) {
    case 'impossible': return rep.why || 'No size of this mix passes on all design days, even with almost no blocks.';
    case 'too-dense': return `${holds}; you plan ${nf(rep.planned)}${pct}.`;
    case 'tight': return `${holds}; you plan ${nf(rep.planned)}${pct}. It works, but there is no margin for a hotter week than the design days.`;
    case 'good': return `${holds}; you plan ${nf(rep.planned)}${pct}.`;
    case 'too-empty': return rep.why === 'wet'
      ? `Below ${nf(cap.min)} blocks the room is too wet (near saturation) on the rainy day; you plan ${nf(rep.planned)}. ${holds}.`
      : `You use ${Math.round(rep.utilisation)} % of the room. ${holds}; you plan ${nf(rep.planned)}.`;
    default: return '';
  }
}
function renderReport() {
  const host = $('#capReport'), r = curRoom(), rep = r && r.report;
  host.replaceChildren();
  if (!rep) return;
  const p = (txt, cls) => { const e = document.createElement('p'); e.textContent = txt; if (cls) e.className = cls; host.append(e); return e; };
  const chip = document.createElement('span'); chip.className = 'chip'; paintChip(chip, VERDICT_CHIP[rep.verdict]);
  const head = document.createElement('p'); head.append(chip, ` ${verdictText(rep)}`); host.append(head);
  for (const w of rep.warnings || []) p(w, 'warn');
  if (!rep.capacity) return;                                   // no common targets: nothing was simulated
  if (rep.utilisation != null) {
    const bar = document.createElement('div'); bar.className = 'cap-util'; bar.dataset.lvl = VERDICT_CHIP[rep.verdict].lvl;
    const fill = document.createElement('span'); fill.style.width = `${clamp(rep.utilisation, 0, 100)}%`; bar.append(fill); host.append(bar);
  }
  const t = rep.targets;
  p(`Targets: ${t.spT} °C, ${t.spRH} % RH, CO₂ limit ${nf(t.co2Lim)} ppm (${cropName(t.crop)} sets the CO₂ limit).`);
  if (rep.perCrop.length > 1 && rep.capacity.max) p(`Capacity in the same mix: ${rep.perCrop.map(c => `${nf(c.max)} ${cropName(c.crop)}`).join(' + ')}.`);
  if (rep.capacity.min && rep.why !== 'wet') p(`Needs at least ${nf(rep.capacity.min)} blocks: below that the room gets too wet on the rainy day.`);
  if (rep.limit.length) p(`Limit: ${rep.limit.map(l => `${l.fails.join(', ')} on the ${l.day.toLowerCase()} day`).join('; ')}.`);
  if (rep.energy && rep.energy.rmPerBlockCycle != null) p(`Energy: ${rep.energy.kwhDay.toFixed(1)} kWh per day, RM ${rep.energy.rmPerBlockCycle.toFixed(2)} per block per cycle (${rep.energy.cycleDays} days at RM ${rep.energy.tariff.toFixed(2)}/kWh).`);
  const b = rep.balance;
  p(`Simple balance: ${Number.isFinite(b.estimate) ? nf(b.estimate) : 'no limit'} blocks, limit ${LIMIT_WORD[b.limit]}.${rep.disagree ? ' The simple balance and the simulation disagree; the simulation decides.' : ''}`, 'note');
  const plan = rep.runs[0];
  if (!plan) return;
  const tbl = document.createElement('table'), thead = document.createElement('thead'), tb = document.createElement('tbody'), hr = document.createElement('tr');
  for (const h of ['Design day', 'Temp in band', 'RH ≥ target − 3', 'RH > 95 %', 'CO₂ ≤ limit', `Result, ${nf(plan.blocks)} blocks`]) hr.append(cell('th', h));
  thead.append(hr);
  for (const d of plan.days) {
    const tr = document.createElement('tr');
    tr.append(cell('td', d.name), cell('td', `${d.inT.toFixed(0)} %`), cell('td', `${d.rhOk.toFixed(0)} %`), cell('td', `${d.wet.toFixed(0)} %`), cell('td', `${d.co2Below.toFixed(0)} %`), cell('td', d.pass ? 'Pass' : d.fails.join(', ')));
    tb.append(tr);
  }
  tbl.append(thead, tb); host.append(tbl);
}
function renderFarm() {
  if (!rooms.length) { set('capFarm', ''); return; }
  const done = rooms.filter(r => r.report && r.report.capacity && r.report.capacity.max > 0);
  const planned = rooms.reduce((s, r) => s + r.mix.reduce((a, m) => a + (m.blocks || 0), 0), 0);
  const cap = done.reduce((s, r) => s + r.report.capacity.max, 0), used = done.reduce((s, r) => s + r.report.planned, 0);
  const missing = rooms.length - done.length, pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  set('capFarm', `Farm: ${pl(rooms.length, 'room')}, ${nf(planned)} blocks planned`
    + (done.length ? `; capacity ${nf(cap)} blocks in ${pl(done.length, 'checked room')} (${Math.round(used / cap * 100)} % used)` : '')
    + (missing ? `. ${pl(missing, 'room')} without a capacity yet.` : '.'));
}
// A calibration from a file is not trusted: all four values must be numbers, else the room is uncalibrated.
function validCalib(c) {
  if (!c || typeof c !== 'object') return null;
  const ok = ['ua', 'infAch', 'moistBuffer', 'co2PerBlock'].every(k => Number.isFinite(c[k]) && c[k] > 0);
  return ok ? { ua: c.ua, infAch: c.infAch, moistBuffer: c.moistBuffer, co2PerBlock: c.co2PerBlock, rmse: c.rmse || {}, date: String(c.date || '') } : null;
}
$('#capRoom').addEventListener('change', e => { roomIdx = +e.target.value; renderRooms(); });
$('#capSave').addEventListener('click', () => {
  const name = $('#capName').value.trim() || `Room ${rooms.length + 1}`;
  rooms.push({ id: Date.now().toString(36), name, volume: (env.room && env.room.volume) || PL.room.volume, vent: env.vent,
    calib: calApplied ? { ...calApplied } : null, mix: [{ crop: cfg.crop, blocks: env.blocks }], report: null });
  roomIdx = rooms.length - 1; $('#capName').value = '';
  saveRooms(); renderRooms();
  set('capMsg', calApplied ? `Saved "${name}" with the calibration of ${calApplied.date.slice(0, 10)}.` : `Saved "${name}" without a calibration: the check uses typical room values.`);
});
$('#capDelete').addEventListener('click', () => {
  const r = curRoom();
  if (!r || !confirm(`Delete the room "${r.name}"?`)) return;
  rooms.splice(roomIdx, 1); roomIdx = 0; saveRooms(); renderRooms();
});
$('#capAdd').addEventListener('click', () => { const r = curRoom(); if (!r) return; r.mix.push({ crop: 'oyster', blocks: 500 }); renderMix(); roomChanged(r); });
$('#capRun').addEventListener('click', () => {
  const r = curRoom();
  if (!r || capBusy) return;
  capBusy = true; $('#capRun').disabled = true;
  const prog = $('#capProg'); prog.hidden = false; prog.value = 0;
  set('capMsg', 'Checking… (a few seconds)');
  const emptyBelow = clamp(+$('#capEmpty').value || 50, 10, 90);
  CAPY.checkAsync(r, r.mix, { emptyBelow, tariff: input.tariff, onProgress: s => {
    prog.value = s.runs / s.maxRuns;
    set('capMsg', `Simulation run ${s.runs}: ${nf(s.blocks)} blocks, ${s.pass ? 'pass' : 'fail'}…`);
  } })
    .then(rep => { r.report = rep; saveRooms(); set('capMsg', `Done after ${rep.runs.length} simulation runs.`); })
    .catch(err => set('capMsg', `The check stopped: ${err.message}`))
    .finally(() => { capBusy = false; $('#capRun').disabled = false; prog.hidden = true; renderReport(); renderFarm(); });
});
$('#capExport').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ format: 'mushroom-farm-rooms', version: 1, saved: new Date().toISOString(), rooms }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'rooms.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('#capImport').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => {
    const x = JSON.parse(txt);
    if (!x || x.format !== 'mushroom-farm-rooms' || !Array.isArray(x.rooms)) throw new Error('this is not a rooms file of this page');
    const ok = x.rooms.filter(r => r && typeof r.name === 'string' && Array.isArray(r.mix)
      && r.mix.every(m => m && CC.CROPS[m.crop] && CC.CROPS[m.crop].range && Number.isFinite(m.blocks) && m.blocks >= 0));
    if (!confirm(`Replace the ${rooms.length} saved room(s) with ${ok.length} room(s) from the file?`)) return;
    rooms = ok.map((r, i) => ({ id: String(r.id || `${Date.now().toString(36)}${i}`), name: r.name.slice(0, 60), volume: Number(r.volume) > 0 ? Number(r.volume) : PL.room.volume,
      vent: r.vent === 'exhaust' ? 'exhaust' : 'supply', calib: validCalib(r.calib),
      mix: r.mix.map(m => ({ crop: m.crop, blocks: Math.round(m.blocks), ...(Number.isFinite(m.co2PerBlock) && m.co2PerBlock > 0 ? { co2PerBlock: m.co2PerBlock } : {}) })), report: null }));
    roomIdx = 0; saveRooms(); renderRooms();
    set('capMsg', `Imported ${rooms.length} room(s)${ok.length < x.rooms.length ? `; ${x.rooms.length - ok.length} invalid room(s) skipped` : ''}. Run the check again for each room.`);
  }).catch(err => set('capMsg', `The file cannot be used: ${err.message}.`)).finally(() => { e.target.value = ''; });
});
renderRooms();

```

Notes:
- Everything from a file or from storage is rendered with `textContent` (never `innerHTML`). `validCalib` drops a calibration whose values are not positive numbers.
- A report is saved only when a check finishes, so closing the page during a check saves nothing partial.
- The storage key `mushroom-farm.rooms.v1` sets the `mushroom-farm.` prefix for work item 3.1 (settings storage).

- [ ] **Step 3: Check that it parses**

Run: `node -e "new Function(require('fs').readFileSync('app.js','utf8'))" && echo ok`
Expected: `ok`.

- [ ] **Step 4: Check it in the browser**

Open `index.html`. In the "Room capacity" card:

| Action | Expected |
|---|---|
| Type `Room A`, click **Save the present room** | The room list shows "Room A"; info "60 m³ · not calibrated (typical values)"; one mix row "Grey oyster", 2,000 blocks. |
| Set the row to 1,200, **Add a crop**, set it to Pink oyster, 800 | No report yet. |
| **Run check** | Progress bar; after about 1–3 s: chip **GOOD**, "Holds 4,016 blocks; you plan 2,000 (50 %)." (± a few %), the "Estimate: this room is not calibrated…" warning, targets 25.5 °C / 88 % / 1,000 ppm, capacity split 2,409 grey + 1,606 pink, limit "temperature too high on the hot-humid day", a 3-row design-day table all "Pass". |
| Reload the page | Room A and its report are still there; the farm line reads "Farm: 1 room, 2,000 blocks planned; capacity … (50 % used)." |
| Set pink to Milky and run | Chip **IMPOSSIBLE**: "Grey oyster needs at most 27 °C, Milky (Calocybe indica) needs at least 28 °C: no common temperature." |
| **Export rooms**, **Delete room**, **Import rooms** with the exported file | The room comes back (report cleared, "Run the check again"). |
| Browser console | No errors. |

- [ ] **Step 5: Run the tests**

Run: `npm test 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 82`, `# pass 82`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
git add app.js
git commit -m "feat(page): room capacity check with saved rooms, report and farm total" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/phase3-plan.md`

- [ ] **Step 1: README file table**

In `README.md`, in the `## Files` table, add this row after the `calib.js` row:

```markdown
| `capacity.js` | Capacity check | How many blocks of a crop mix a room carries in fruiting on three design days; verdict and utilisation. |
```

and change the `tests/` row's content to: `Unit tests, integration tests, settings tests, calibration tests, capacity tests, and test vectors.`

- [ ] **Step 2: Findings**

In `docs/phase3-plan.md`, under `## Findings to remember`, add:

```markdown
- **Room capacity (2026-10-07):** a room passes between a minimum and a maximum number of blocks. In the default
  room, grey oyster holds about 3,650 blocks (limit: temperature on the hot-humid day); golden and black oyster also
  have a minimum (about 600 and 1,170 blocks), because a nearly empty room of a cool crop stays above 95 % RH on a rainy
  day. RH above the target is not a failure (outdoor air on humid days is wetter than the target); near saturation is.
  The design days are estimates: replace them with MetMalaysia data.
```

- [ ] **Step 3: Final check**

Run: `npm test 2>&1 | grep -E '^not ok|^# (tests|pass|fail)'`
Expected: `# tests 82`, `# pass 82`, `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/phase3-plan.md
git commit -m "docs: room capacity check in the README and findings" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand over**

Report the commits (`git log --oneline -10`). Do not push: ask the user first (a push updates the public page at https://rayy1218.github.io/mushroom-farm/).

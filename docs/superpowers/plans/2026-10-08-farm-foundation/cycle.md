# Work brief: Crop cycle simulation (`cycle.js`)

Date: 2026-10-08. Stream: **Cycle**. Contract: **C7** `docs/contracts/cycle.md` (frozen, revision 1). Binding: `LEAD-DECISIONS.md` and the C7 lead decisions (restated in the contract; they override this brief). Spec: `docs/superpowers/specs/2026-10-08-farm-app-foundation-design.md`. You are the implementer; reviewers check the work before the lead merges.

## 1. Goal

A room gets a second view next to its live dashboard: a simulation. The grower puts a crop mix (composition) into the room, runs one whole crop cycle (every stage, every flush) on the region's design days, and sees per stage whether the room holds the climate. The result keeps an hourly series, so a later module can lay it over the room's real readings and calibrate.

This stream builds only the engine: `cycle.js` (`global.ClimateCycle`: `runCycleSteps`, `runCycle`, `runCycleAsync`, `cycleDays`, `DT`) and its Node tests. No page, no storage, no API.

| Outcome | Measure |
|---|---|
| A full cycle runs with the real controller and the real stage program | Stage order and days match the program (full and ready) |
| Each stage is judged against its own targets | Segments with `inT`, `rhOk`, `lowRhMin`, `wet`, `co2Below`, `maxCore`, alarms, kWh, RM, `fails`, `pass` |
| Sensible and dense rooms are told apart | 2000 grey oyster passes fruiting; 6000 fails fruiting on temperature |
| Fast enough for the browser | Default full cycle (83 days) within 60 s in Node (draft: about 4 s); run time linear in the program length (per-day weather window, C7 6) |

## 2. Before you start

You work alone in your own git worktree on branch `stream/cycle`, made from `master` by the lead. `<worktree>` below is its absolute path. Never work in `/home/foqcus/Documents/mushroom-farm` itself (another developer uses it).

| Check | Expected; otherwise stop and report to the lead |
|---|---|
| `git -C <worktree> branch --show-current` | `stream/cycle` (never `master`) |
| `ls <worktree>/capacity.js <worktree>/controller.js <worktree>/sim.js <worktree>/runtime.js <worktree>/tests/capacity.test.js` | All listed |
| `grep -n "global.ClimateCapacity = " <worktree>/capacity.js` | One line, without `mixCo2` and `roomOf` |
| `ls /tmp/cycle-draft/cycle.md /tmp/cycle-draft/cycle-brief.md` | Both listed |
| `npm test` (in `<worktree>`) | `# fail 0`. Write down the `# pass` count (the baseline). |

Git: keep the configured identity (never change `git config`). Plain commit messages such as `feat(cycle): …`, `test(cycle): …`, `docs(cycle): …`, with no `Co-Authored-By` or other attribution lines. Never commit on `master`. Do not push, merge or rebase.

## 3. Owned files (the only files you may touch)

| File | Action | Content |
|---|---|---|
| `docs/contracts/cycle.md` | Create | A byte-for-byte copy of `/tmp/cycle-draft/cycle.md` |
| `docs/superpowers/plans/2026-10-08-farm-foundation/cycle.md` | Create | A byte-for-byte copy of `/tmp/cycle-draft/cycle-brief.md` |
| `cycle.js` | Create | The module (C7) |
| `tests/cycle.test.js` | Create | The tests of section 6 |
| `capacity.js` | Modify: the export line only | Add `mixCo2, roomOf` to the `global.ClimateCapacity` object (C7 13.2) |

Everything else is read-only: `controller.js`, `sim.js`, `runtime.js`, `calib.js`, `app.js`, `index.html`, `styles.css`, `package.json`, `tests/vectors/*`, every existing test, every other doc. If something outside your files blocks you, stop that part and report it.

## 4. What you build against

| Source | What you take from it |
|---|---|
| C7 sections 1–3 | File, wrapper, API, arguments, input errors (exact texts, exact order; `region = opts.region \|\| 'my-lowland'`, checked with `Object.hasOwn`) |
| C7 section 4 | Targets per stage; settings steps 1–7; the fruiting replacement (ramp `to` or `cfg`; at segment start and at a shock end; humidity only while a shock runs) |
| C7 section 5 | `cycleDays`; segment order; boundaries; block stage follows `cfg.stage` |
| C7 section 6 | The weather series (warm-up `days[0]`, day k `days[k % 3]`, closing point) and the per-day weather window (exact slice; `opts.fullWeather` skips it) |
| C7 section 7 | Setup steps 1–7 (`n` at least 1, env keys, `setRoom`, the CO₂ change of `1e-6` on odd readings) and the loop (weather window, warm-up, start of day 0, `daySeg`, `yield` per day) |
| C7 sections 8–10 | The reading handler; counters; spawn excuse; pass rules and fail texts; alarm raises (`active && since === r.t`); hourly energy and series |
| C7 sections 11–12 | Progress and Result shapes, exactly |
| C7 section 13 | Every call into the shared modules (all exist on `master`; line numbers given) |
| `capacity.js` `trial` (lines 141–198) | The closest model: env setup, weather series, CO₂ change, scoring with `sim.view()`, the time loop. Copy its patterns, not its code paths (do not call `trial`). |
| `app.js` line 42 (`tick`) | `env.blockStage = cfg.stage` before each step |

### 4.1 Shape of `runCycleSteps` (guide; the contract is binding)

```js
function* runCycleSteps(room, mix, opts = {}) {
  // C7 3: checks 1-5 in order, then settings (C7 4.2 step 1) -> errors throw here, on the first next()
  const tg = CAP.commonTargets(mix);
  if (tg.impossible) return { verdict: 'impossible', why: tg.conflict };
  // C7 4.2 steps 2-6 (cfg), C7 5.1 (D), C7 6 (`full` weather series), C7 7.1 (n >= 1, e, sim, ctl, io, rt, W, END)
  // onReading(r): C7 8.1 steps 1-6 (energy hours, segments `seg`, counters, fruiting replacement
  //   at segment start and at a shock end, alarms)
  rt.poll();
  let started = false, daySeg = null;
  for (let day = -1; day < D; day++) {
    const j = day + 1;   // C7 6: per-day weather window, same numbers as the whole series
    if (!opts.fullWeather) e.weatherSeries = full.slice(Math.max(0, 24 * j - 1), 24 * (j + 1) + 2);
    for (let i = 0; i < 86400 / DT; i++) {
      // The last step lands on the next day's start: its poll handles the NEXT day's first reading,
      // which opens the next segment at a stage boundary. Capture the day's segment before it (C7 11).
      if (i === 86400 / DT - 1) daySeg = seg;
      e.blockStage = cfg.stage;
      io.advance(DT);
      if (!started && io.read().t >= W) { started = true; /* C7 7.2 row 3 */ }
      rt.poll();
    }
    if (day >= 0) yield { day: day + 1, days: D, stage: daySeg.stage, flush: daySeg.flush };
  }
  // C7 8.3, 8.4, 10, 12: build segments, totals, series
}
```

## 5. Measured on the draft (for your sanity checks; not binding)

| Run | Result |
|---|---|
| 2000 grey oyster, default room and settings (full, 83 days) | 4.1 s with the weather window (5.6 s on the whole series, deep-equal Result). Spawn: air 20.4–23.2 °C (the AC cools for the core), 99.8 % of readings excused, `maxCore` 28.2, passes. Pinning: `inT` 99.2, `rhOk` 96.3, `lowRhMin` 36, `co2Below` 99.3, alarms `tLo` 1 and `sensor_RH` 1 (controller response check), passes. Fruiting 1–4: `inT` 99.6–100, pass. Rest 1–3: pass. About 915 kWh in total. |
| 6000 grey oyster, ready, default days | Each fruiting: `inT` 72–79, `temperature too high`, `acTooSmall` 4–5, `tHi` 2–3. Rest passes. About 3 s for 58 days. |
| Spawn only, 10000 grey oyster | `maxCore` 34.6 (> 32), air above the band: fails `temperature too high` and `block core too hot` |
| 50 grey oyster, ready, 1 flush | Without the CO₂ change: 4 `sensor_CO2` raises. With it: none. |
| Mix 1200 grey oyster + 800 pink, ready | `tg.spT` 25.5; mean fruiting room T 25.50 |
| Readings | Every 30 s at exact multiples of 30 s: 2880 per day, 120 per hour |
| Long program (ready, 2000 oyster, 10 flushes, fruiting 30, rest 30: 570 days) | 27 s with the window (about 47 ms per day); 77 s on the whole series (136 ms per day, growing with length) |
| Progress of `SHORT_FULL` | `spawn, spawn, pinning, fruiting, fruiting, rest, fruiting, fruiting` with `daySeg`; one day early (`spawn, pinning, fruiting, fruiting, rest, …`) if you yield the open segment after the loop |

If your numbers differ much from these, re-read C7 7 and 8 before changing anything; report a real difference to the lead.

## 6. Tasks (TDD: write the test, run it and see it fail, then implement, then see it pass)

All tests go in `tests/cycle.test.js`. Write each test before its code. Commit after each task that ends green.

### 6.1 Test file setup

| Item | Value |
|---|---|
| Header | `// Crop cycle simulation (cycle.js). Contract: docs/contracts/cycle.md` |
| Requires, in order | `node:test` as `test`, `node:assert/strict` as `assert`; then `require('../sim.js')`, `'../controller.js'`, `'../runtime.js'`, `'../capacity.js'`, `'../cycle.js'` |
| Globals | `const CY = globalThis.ClimateCycle, CAP = globalThis.ClimateCapacity, CC = globalThis.ClimateController, SIM = globalThis.ClimateSim;` |
| Room | `const room = { name: 'Room 1', volume: 60, vent: 'supply', calib: null };` |
| Mix helper | `const oyster = n => [{ crop: 'oyster', blocks: n }];` |
| Short programs | `const SHORT_FULL = { farmType: 'full', program: { flushes: 2, days: { spawn: 2, pinning: 1, fruiting: 2, rest: 1 } } };` (8 days) and `const SHORT_READY = { farmType: 'ready', program: { flushes: 2, days: { fruiting: 2, rest: 1 } } };` (5 days) |
| Shared run | `let shortFull; const getShortFull = () => shortFull || (shortFull = CY.runCycle(room, oyster(2000), { settings: SHORT_FULL }));` (one run reused by several tests) |
| Near | `const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));` |

### 6.2 Tasks

| # | Test(s) first | Then build | What it proves |
|---|---|---|---|
| 0 | – | `mkdir -p docs/contracts docs/superpowers/plans/2026-10-08-farm-foundation`; `cp /tmp/cycle-draft/cycle.md docs/contracts/cycle.md`; `cp /tmp/cycle-draft/cycle-brief.md docs/superpowers/plans/2026-10-08-farm-foundation/cycle.md`; commit `docs(cycle): C7 contract and work brief` | The contract travels with the code |
| 1 | **X1** `typeof CAP.mixCo2 === 'function'`, `typeof CAP.roomOf === 'function'`; `CAP.mixCo2(room, oyster(10)) === 45`; `CAP.mixCo2({ ...room, calib: { ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 50 } }, oyster(10)) === 50`; `CAP.roomOf(room)` deep-equals `{ ...SIM.PLANT.room, volume: 60 }`; `CAP.roomOf({ volume: 30, calib: { ua: 90, infAch: 0.5, moistBuffer: 4 } })` has `ua` 90, `infAch` 0.5, `moistBuffer` 4, `volume` 30 | Add `mixCo2, roomOf` to the export object in `capacity.js` (one line). Run `node --test tests/capacity.test.js`: still all green. | C7 13.2 |
| 2 | **E1** `CY.runCycle(null, oyster(1))` throws `TypeError` with message `runCycle: room must be an object`; `(room, 'x')` → `runCycle: mix must be a list`; `{ settings: [] }` and `{ settings: null }` → `runCycle: settings must be an object`; `{ tariff: -1 }`, `{ tariff: NaN }`, `{ tariff: '0.5' }` → `runCycle: tariff must be a number of at least 0`; `{ region: 'mars' }` → `Error` `Unknown region: mars`; `{ region: 'toString' }` → `Error` `Unknown region: toString` (`Object.hasOwn`); `{ region: 'mars', tariff: -1 }` → the tariff error (order); `{ settings: { farmType: 'ready', f: () => 1 } }` throws `{ name: 'DataCloneError' }` (from `exportSettings`, unchanged). **E2** `const g = CY.runCycleSteps(null, [])` does not throw; `g.next()` throws the room error. `await assert.rejects(CY.runCycleAsync(room, 'x'), /mix must be a list/)`. | `cycle.js` wrapper, `runCycleSteps` checks (C7 3), `runCycle`, `runCycleAsync` | C7 2, 3 |
| 3 | **I1** mix `[{ crop: 'oyster', blocks: 1200 }, { crop: 'milky', blocks: 800 }]`: `runCycle` deep-equals `{ verdict: 'impossible', why: <the commonTargets conflict> }` and `why` matches `/Grey oyster needs at most 27 °C/`; the generator's first `next()` is `done: true`; `onProgress` is never called. `oyster(0)` → `why` = `Add at least one crop with blocks.` | Impossible branch | No simulation for an impossible mix |
| 4 | **D1** `CY.cycleDays('full', CC.defaultProgram()) === 83`; `('ready', CC.defaultProgram()) === 58`; with `{ ...CC.defaultProgram(), flushes: 2, days: { spawn: 2, pinning: 1, fruiting: 2, rest: 1 } }`: full 8, ready 5; with `days.fruiting: 1.6, flushes: 1.4` (others default): ready 2; `cycleDays('other', CC.defaultProgram())` throws `Unknown farm type: other` | `cycleDays` (C7 5.1) | Total days |
| 5 | **S1** `getShortFull()`: `stages.map(s => [s.stage, s.flush, s.startDay, s.days, s.hours])` deep-equals `[['spawn',1,0,2,48], ['pinning',1,2,1,24], ['fruiting',1,3,2,48], ['rest',1,5,1,24], ['fruiting',2,6,2,48]]`; `verdict === 'ok'`; `totals.days === 8`; `targets` deep-equals `{ spT: 25, spRH: 88, co2Lim: 1000, crop: 'oyster' }`; segment `targets`: spawn `{ spT: 24, spRH: 70, co2Lim: 5000, coreMax: 32 }`, pinning `{ spT: 24, spRH: 92, co2Lim: 800, coreMax: 32 }`, fruiting `{ spT: 25, spRH: 88, co2Lim: 1000, coreMax: 32 }`, rest `{ spT: 25, spRH: 80, co2Lim: 2000, coreMax: 32 }` (each equals `profileTargets('oyster', stage)` plus `CROPS.oyster.limits.coreMax`; fruiting is the common targets); `inputs` deep-equals `{ farmType: 'full', days: { spawn: 2, pinning: 1, fruiting: 2, rest: 1 }, flushes: 2, region: 'my-lowland', blocks: 2000, co2PerBlock: 45, tariff: 0.57, warnings: [] }` | Settings (C7 4.2), weather (6), setup and loop (7), segments (8.1 step 4) | Stage order and durations, full |
| 6 | **S2** `runCycle(room, oyster(2000), { settings: SHORT_READY })`: `[stage, flush, startDay, days]` = `[['fruiting',1,0,2], ['rest',1,2,1], ['fruiting',2,3,2]]`; `totals.days === 5`; `series.length === 120` | Start of day 0 for `ready` (C7 7.2 row 3) | Stage order and durations, ready |
| 7 | **R1** `getShortFull()`: `series.length === totals.days * 24` (192); `series[i].h === i` for every i; each entry's `stage`, `flush` equal those of the segment with `startDay * 24 <= h < (startDay + days) * 24`; `T`, `RH`, `CO2`, `core`, `kwh` are finite; `kwh >= 0`; every segment's `inT`, `rhOk`, `wet`, `co2Below` are in 0–100 | Hours and series (C7 10) | Series for the predicted-vs-real view |
| 8 | **R2** `getShortFull()`: `near(totals.kwh, Σ stages.kwh)`; `near(totals.rm, Σ stages.rm)`; for each segment `near(seg.rm, seg.kwh * 0.57)` and `near(seg.kwh, Σ series.kwh of its hours)`; `near(totals.rmPerBlock, totals.rm / 2000)`; `totals.pass === stages.every(s => s.pass)`; each `s.pass === (s.fails.length === 0)`; `totals.kwh > 0`. With `{ settings: SHORT_READY, tariff: 1 }`: `near(totals.rm, totals.kwh)` | Energy, totals (C7 10, 12.5) | Totals equal the sum of the segments |
| 9 | **DET** `runCycle(room, oyster(2000), { settings: SHORT_FULL })` deep-strict-equals `getShortFull()` | – (should pass; if not, find the non-determinism) | Deterministic |
| 10 | **P1** Collect the yields of `runCycleSteps(room, oyster(2000), { settings: SHORT_FULL })`: 8 Progress objects; `day` 1…8; `days` all 8; `stage` = `['spawn','spawn','pinning','fruiting','fruiting','rest','fruiting','fruiting']`; `flush` = `[1,1,1,1,1,1,2,2]` (each day's segment, not one day early: C7 11, `daySeg` in 4.1); the returned value deep-equals `getShortFull()`. **P2** `runCycle(room, oyster(2000), { settings: SHORT_READY, onProgress })` calls it 5 times; `await runCycleAsync(...)` with the same input calls it 5 times and resolves a deep-equal Result. | Progress (C7 11), `onProgress`, async yield | Progress per day; three entry points agree |
| 11 | **F1** settings = `SHORT_FULL` plus `crop: 'pink'`, `stage: 'rest'`, `offsets: { T: 3, RH: 0, CO2: 0 }`, `manual: { fan: { auto: false, level: 0 } }`, `program.auto: false`, `program.harvest.on: true` (deep-merge them into a copy of `SHORT_FULL`): the Result deep-strict-equals `getShortFull()`. **F2** `{ farmType: 'ready', program: { flushes: 1.4, days: { fruiting: 1.6 } } }`: `inputs.flushes === 1`, `inputs.days.fruiting === 2`, `totals.days === 2`, one segment. **F3** `{ farmType: 'ready', program: { flushes: 1, days: { fruiting: 1 } }, bogus: 1 }`: `inputs.warnings` contains `Unknown setting "bogus" is ignored.` **F4** mix `[{ crop: 'oyster', blocks: 0.4 }]`, settings `{ farmType: 'ready', program: { flushes: 1, days: { fruiting: 1 } } }`: `verdict === 'ok'`, `inputs.blocks === 1`, `Number.isFinite(totals.rmPerBlock)`, `near(totals.rmPerBlock, totals.rm)` | Forced keys and rounding (C7 4.2 steps 3–4); `n` at least 1 (C7 7.1 step 1) | Room settings cannot break the cycle; `importSettings` is used |
| 12 | **M1** mix `[{ crop: 'oyster', blocks: 1200 }, { crop: 'pink', blocks: 800 }]`, `{ settings: SHORT_READY }`: `targets.spT === 25.5`, `targets.crop === 'oyster'`; both fruiting segments have `targets.spT === 25.5`, `targets.spRH === 88`; the rest segment has `targets.spT === 25`; mean `series.T` over fruiting 1's hours is within 0.2 of 25.5; mean over fruiting 2's hours from `startDay * 24 + 6` on is within 0.25 of 25.5 | Fruiting replacement (C7 4.3), both cases (no ramp; ramp from rest) | The controller runs fruiting at the common targets |
| 13 | **DENSE** `runCycle(room, oyster(6000), { settings: { farmType: 'ready', program: { flushes: 1 } } })`: one segment; `pass === false`; `fails` includes `temperature too high`; `inT < 95`; `alarms.acTooSmall >= 1`; `totals.pass === false` | Pass rules (C7 8.4), alarms (9) | Dense fails fruiting on temperature |
| 14 | **CO2** `runCycle(room, oyster(50), { settings: { farmType: 'ready', program: { flushes: 1 } } })`: no segment has `alarms.sensor_CO2` | The CO₂ change (C7 7.1 step 5) | No frozen-CO₂ false alarm |
| 15 | **WIN** `CY.runCycle(room, oyster(2000), { settings: SHORT_FULL, fullWeather: true })` deep-strict-equals `getShortFull()`. If tasks 5–14 were built on the whole series, this passes at once; then add the window and see it stay green. | The per-day weather window (C7 6, 7.2 row 2) | The speed-up changes no number |
| 16 | **FULL** `const t0 = Date.now(); const r = CY.runCycle(room, oyster(2000)); const ms = Date.now() - t0; t.diagnostic(\`full default cycle (83 days): ${ms} ms\`);` then: `ms < 60000`; `totals.days === 83`; 9 segments in the order spawn, pinning, (fruiting, rest) × 3, fruiting; `series.length === 1992`; every fruiting segment `pass === true`; the spawn segment `pass === true` and `maxCore <= 32`; no segment has `alarms.sensor_CO2`; `inputs.days` deep-equals `{ spawn: 21, pinning: 4, fruiting: 7, rest: 10 }`, `inputs.flushes === 4` | Spawn excuse and core rule (C7 8.2, 8.4) | Sensible case; speed bound with the time logged |
| 17 | – | Run section 7.1; commit; report (section 7.2) | |

Notes on the tests:

| Point | Rule |
|---|---|
| Test names | Start each with its id, for example `test('S1 full program: stage order and durations', …)` |
| Error checks | `assert.throws(fn, { name: 'TypeError', message: 'runCycle: room must be an object' })` (exact text) |
| Time | Do not assert the time of any test except FULL's 60 s bound. The whole file should take about 20 s. |
| Do not assert | `totals.pass` of the FULL run, the pinning or rest segments of FULL, or exact kWh: they are reported, not part of the contract's guarantees |

## 7. How to verify

### 7.1 Commands (from `<worktree>`)

| Command | Expected |
|---|---|
| `node --check cycle.js` | No output, exit 0 |
| `node --test tests/cycle.test.js` | Every test of 6.2 passes; `# fail 0`; the diagnostic line `full default cycle (83 days): <ms> ms` shows (copy it into your report) |
| `node --test tests/capacity.test.js` | `# fail 0` (unchanged test file) |
| `npm test` | `# fail 0`; `# pass` = baseline + the number of new tests |
| `npm test 2>&1 \| grep -c '^ok .* - vectors: '` | `8` (the recorded runs still pass) |
| `git diff --name-only $(git merge-base HEAD master)` | Exactly `capacity.js`, `cycle.js`, `docs/contracts/cycle.md`, `docs/superpowers/plans/2026-10-08-farm-foundation/cycle.md`, `tests/cycle.test.js` |
| `git diff $(git merge-base HEAD master) -- capacity.js` | One changed line: the `global.ClimateCapacity = { … }` export line, with `mixCo2, roomOf` added |
| `git diff --exit-code $(git merge-base HEAD master) -- tests/vectors tests/capacity.test.js controller.js sim.js runtime.js` | No output, exit 0 |
| `cmp docs/contracts/cycle.md /tmp/cycle-draft/cycle.md && cmp docs/superpowers/plans/2026-10-08-farm-foundation/cycle.md /tmp/cycle-draft/cycle-brief.md` | No output, exit 0 |
| `git log --format=%B $(git merge-base HEAD master)..HEAD \| grep -ci 'co-authored'` | `0` |
| `git branch --show-current` | `stream/cycle` |
| `git status --short` | Empty |

### 7.2 Report to the lead

| Item | Content |
|---|---|
| Output | The 7.1 results, the measured FULL time, and the per-segment `inT` / `pass` of the FULL run (one line per segment) |
| Differences | Anything that does not match section 5 by a wide margin, and anything in C7 that did not fit the code |
| Commits | `git log --oneline $(git merge-base HEAD master)..HEAD` |

## 8. Done when

- [ ] `docs/contracts/cycle.md` and `docs/superpowers/plans/2026-10-08-farm-foundation/cycle.md` are exact copies of the drafts.
- [ ] `capacity.js` differs from `master` only by `mixCo2, roomOf` in its export line; `tests/capacity.test.js` passes unchanged.
- [ ] `cycle.js` defines `global.ClimateCycle = { runCycleSteps, runCycle, runCycleAsync, cycleDays, DT }` with the wrapper of C7 1, and runs in Node and the browser without changes.
- [ ] Input errors, impossible result, Progress and Result match C7 exactly (keys, texts, order).
- [ ] `tests/cycle.test.js` has X1, E1, E2, I1, D1, S1, S2, R1, R2, DET, P1, P2, F1, F2, F3, F4, M1, DENSE, CO2, WIN, FULL, each seen failing before its code existed (DET and WIN may pass at once).
- [ ] The FULL run takes under 60 s and its time is logged with `t.diagnostic`.
- [ ] Every command of 7.1 gives its expected result (`npm test` `# fail 0`, 8 vector tests pass, only the five owned files changed, `tests/vectors` unchanged).
- [ ] Committed on `stream/cycle` with plain messages; nothing pushed; report sent.

## 9. What NOT to do

| Do not | Why |
|---|---|
| Edit `controller.js`, `sim.js`, `runtime.js`, `calib.js`, `app.js`, `index.html`, `styles.css`, `package.json`, or any existing test | C7 1: shared modules unchanged; file ownership |
| Change anything in `capacity.js` except the export line, or move `mixCo2` / `roomOf` | C7 13.2: no behaviour change; its tests stay green |
| Call `ClimateCapacity.trial` or `check` from `cycle.js`, or copy `PASS`, `DESIGN_DAYS`, `BANDS` values | Use the exported objects, so a change there reaches the cycle |
| Pass `opts.settings` to `ClimateController.create` or `applySettings` as given | Lead decision 6: only `importSettings(exportSettings(settings)).settings` |
| Change the stage yourself during the run (other than the one `setStage(S[0], W, false)` at day 0), or call `cancelRamp` | The controller's own stage program (`program.auto`) drives the stages (C7 lead decision "Program") |
| Score with the sensor reading `r` | Score the room air from `sim.view()` (as `capacity.js`); `r` only gives `t`, `kwh` |
| Add noise, random weather, harvest doors, a different `DT`, or a speed-up that changes results. The one allowed speed-up is the exact per-day weather window of C7 6 (slice from one point before the day start to one point after the day end); any other window, or a narrower slice, can change the interpolation at the boundary | Determinism and the frozen numbers; WIN proves the window changes nothing |
| Round numbers in the Result | C7 1: unrounded |
| Add `cycle.js` to `index.html`, write a page, a route or a table | Later modules (C7 15) |
| Write `tests/vectors/*` or run `npm run vectors` | The 8 recorded runs stay unchanged |
| Add npm packages, a bundler or a framework | Spec: no dependencies, no build step |
| Commit on `master`, push, merge, rebase, change `git config`, or add `Co-Authored-By` lines | Git rules of this project |
| Edit anything in `/home/foqcus/Documents/mushroom-farm` itself | Another developer uses that checkout; work only in `<worktree>` |

## 10. Points this brief decides (report anything that does not fit)

| # | Point | Decision |
|---|---|---|
| 1 | Spawn temperature rule | Air below the band is excused while the AC cools for the block core (controller rule `core − coreTarget > T − spT`, with `coreControl` on). Without it every spawn run fails (draft: 0.2 % in band at 2000 blocks; with it 99.8 % excused, `maxCore` 28.2). Now written into the C7 Scoring lead decision; it **awaits the lead's explicit sign-off**. If the lead drops it, spawn always fails on temperature and FULL's spawn assertion goes. |
| 2 | Forced settings | `crop`, `stage`, `program.auto`, `program.harvest.on`, `offsets` (zero), `manual.*.auto` (true); days and flushes rounded to whole numbers |
| 3 | Start of day 0 | `program.auto` off in the warm-up; at `t = W` `setStage(S[0], W, false)` restarts the stage clock |
| 4 | Fruiting targets | Replace `spT`, `spRH` in the ramp's `to` (or in `cfg` when no ramp) at the first reading of each fruiting segment, through `ctl.state` |
| 5 | Ramps | Scored against the new stage's targets (the draft passes with them) |
| 6 | Alarms | A raise = `active && since === r.t` in `ctl.alarmList()`; `blocksDone` at `END` is not counted |
| 7 | Extra API | `cycleDays` and `DT` exported; `inputs` also carries `blocks`, `co2PerBlock`, `tariff`, `warnings` |
| 8 | `sensor_RH` in pinning | Reported as is (controller response check); no RH change is added |
| 9 | Progress stage | From `daySeg`, the segment captured before the day's last step (C7 11), because that step's poll already opens the next day's segment |
| 10 | Weather window | Per-day exact slice (C7 6); `opts.fullWeather: true` keeps the whole series, for WIN only |
| 11 | Region | `opts.region \|\| 'my-lowland'` as `capacity.js` `check`; `Object.hasOwn(DESIGN_DAYS, region)` |
| 12 | Blocks | `n = Math.max(1, Math.round(…))`: a mix that rounds to 0 runs with 1 block |
| 13 | Settings errors | Errors of `exportSettings` (`DataCloneError`) and `importSettings` pass through unchanged |
| 14 | Cold shock | No crop has it today (not tested). C7 4.3: in fruiting keep the shock temperature, patch only humidity, and patch again when the shock ends |

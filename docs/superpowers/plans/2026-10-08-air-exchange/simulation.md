# Work brief: Air exchange mini-wave, simulation stream

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this brief task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

Date: 2026-10-09. Repo: `/home/foqcus/Documents/mushroom-farm`. You work alone in the git worktree `~/.config/superpowers/worktrees/mushroom-farm/air-simulation` (branch `stream/air-simulation`), made from the step 0 commit. In this brief `<base>` means that commit (`git merge-base HEAD master`). Contract C9 (`docs/contracts/air.md`) is frozen. Where this brief and C9 disagree, C9 wins: stop and report it to the lead. Never put anything durable in `/tmp` (it is wiped on reboot).

Every code step below was run on a scratch copy of `<base>`; the test counts and numbers given are the ones measured there.

## 1. Goal

Replace the one fresh-air fan of the simulation with the intake + exhaust pair of C9, and move its callers to the new shapes.

| Part | File | Result |
|---|---|---|
| Plant and environment | `sim.js` | `PLANT.air`, `DEFAULT_ENV.airM3h`, no `vent`, new header comment (C9 4.1) |
| Command, meters, view | `sim.js` | `cmd.air.on` → `act.air`; meters `air`; power by size; `view().airM3h` (C9 4.2) |
| Air flows | `sim.js` | Balanced on/off pair, leakage only with the fans off, unfiltered air (C9 4.3) |
| Old snapshots | `sim.js` | `create(env, snapshot)` upgrades a pre-C9 snapshot (C9 4.2) |
| Capacity | `capacity.js` | `balance` gives `out.air` from `ClimateAir.purgeTimeS`; trial sets `env.airM3h`; rooms have no `vent` (C9 8) |
| Crop cycle | `cycle.js` | No `vent`; `manual.air.auto` (C9 8) |
| Calibration | `calib.js` | CSV column `air` (old `fan` read as on above 0); replay sends `air.on` (C9 8) |
| Headless tool | `tools/run-headless.js` | Loads `air.js` (C9 3, 8) |

## 2. Owned files (the only files you may change)

| File | At start | What you do |
|---|---|---|
| `sim.js` | wave 1 | Tasks 2, 6 |
| `capacity.js` | wave 1 | Task 3 |
| `cycle.js` | wave 1 | Task 4 |
| `calib.js` | wave 1 | Task 5 |
| `tools/run-headless.js` | wave 1 | Task 7 |
| `tests/capacity.test.js` | wave 1 | Tasks 1, 2, 3, 6 (the new simulation tests live here, C9 11) |
| `tests/cycle.test.js` | wave 1 | Tasks 1, 2, 4 |
| `tests/calib.test.js` | wave 1 | Tasks 1, 2, 5 |

Every other file is read-only for you: above all `air.js`, `controller.js`, `runtime.js`, `server/**`, `web/**`, `tests/harness.js`, `tests/integration.test.js`, `tests/vectors/**`, `docs/**`, `package.json`. No new files.

## 3. Read first

| Document | Sections | Why |
|---|---|---|
| `docs/contracts/air.md` (C9) | 1, 2, 3, 4, 8, 10, 11 | **Your contract** |
| `docs/superpowers/specs/2026-10-08-air-exchange-purge-design.md` | Physics, 1, 4.1 | Why the pair, the purge time formula |
| `docs/superpowers/plans/2026-10-08-air-exchange/README.md` | Task 0.2, Step 1 table | `air.js` (already in `<base>`), what the other streams do |
| `air.js` | All | `ClimateAir.purgeTimeS`, which `balance` calls |
| `sim.js` | 11-25, 34-91, 93-116, 243-305, 362-401 | The code you change |
| `capacity.js` | 1-22, 89-157 | `balance` and `trial` |
| `controller.js` | 122-183, 903 | Today's `defaultRules`, `defaultSettings`, `create` return: what the test bridge (4.3) wraps |
| `web/simulator.js` | 40-50, 180-225 | Callers of `view()` and the meters (web stream's file: read only) |

## 4. Contracts you build against

### 4.1 What you change

| Item | Before | After (C9) |
|---|---|---|
| `PLANT.fan` | `{ levels, supplyPowerFactor, leakFrac }` | Removed. `PLANT.air = { m3h: 1800, wPerM3h: 0.08 }` |
| `DEFAULT_ENV.vent` | `'supply'` | Removed; an env with `vent` is accepted and the key ignored |
| `DEFAULT_ENV.airM3h` | – | `null` (= `PLANT.air.m3h`); the sim uses `Number.isFinite(e.airM3h) ? clamp(e.airM3h, 50, 10000) : PLANT.air.m3h` |
| Command | `cmd.fan.level` 0–3 | `cmd.air.on`; `cmd.fan` ignored |
| `s.act.fanLevel` | 0–3 | `s.act.air` boolean |
| Meter key | `fan` in `s.p`, `s.kwh`, `s.runS`, reading `power`, `kwh`, `runS` | `air` |
| `view().airM3h` | `infAch × volume + fan m³/h` | `(act.air ? m3h : 0) + leak`, leak only with the fans off |
| `balance(...)` | `{ fan, ac, fog, estimate, limit }` | `{ air, ac, fog, estimate, limit }`, `limit ∈ 'air' \| 'ac' \| 'fog'`; `air` is `Infinity` when 100000 blocks still pass |
| `trial`, `runCycle` | env `vent` from the room | `env.airM3h = room.airM3h ?? null`, `cfg.airM3h = room.airM3h ?? PLANT.air.m3h` |
| Capacity room | `{ name, volume, vent, calib }` | `{ name, volume, airM3h?, calib }` |
| Calibration CSV | column `fan` (0–3) | column `air` (0/1); aliases `air`, `fan`, `fan_level`, `exhaust` |

### 4.2 What you use

| Module | Export | Use |
|---|---|---|
| `air.js` (step 0, lead) | `ClimateAir.purgeTimeS({ volume, co2Out, leakM3h, prodM3h, m3h, start, stop })` | `balance` air limit; tests' hand calculation |
| `controller.js` (pre-C9 in your worktree) | `defaultRules(lim).fanOn`, `.fanOff`, `.purgeMaxS` | `balance`. `purgeMaxS` exists only after the controller stream merges; until then the test bridge (4.3) supplies it |

### 4.3 Rules this brief fixes (C9 leaves the detail open)

| Topic | Rule |
|---|---|
| Pre-C9 controller | Your worktree has the old `controller.js`: it sends `fan: { level }`, has `manual.fan`, `rules.airMode: 'steady'`, no `rules.purgeMaxS`. The new sim ignores `cmd.fan`, so every run through the real controller would never purge. Your three test files therefore carry a **C9 bridge** (task 2, step 1): test-only code that wraps `ClimateController` to send `air: { on: fan.level > 0 }`, adds `manual.air` and `rules.purgeMaxS: 180`, and runs the old controller in `airMode: 'purge'`. It returns at once when `defaultSettings().manual.air` exists, so it does nothing after the controller stream merges. Its first line is `// C9 bridge (lead deletes at step 2)` and its last `// end of C9 bridge`, so the lead can find and delete it at step 2 (README task 2.1; contract question 4, accepted). |
| Tests that need the C9 controller | Three tests depend on behaviour only the C9 controller can show. They get a `node:test` `todo` option with the reason (task 3, 4): they still run and print, but do not fail `npm test`. The lead removes the `todo` at step 2 (README task 2.1; contract questions 1, 2). |
| `balance` air limit | Bisection over 0–100000 in a new helper `largestOk(ok, max)`: `0` when `ok(0)` fails, `Infinity` when `ok(max)` holds (C9 8, like `maxBlocks`), else the largest whole `n` with `ok(n)`. |
| Size in the sim | One helper in `create`, `airM3h()`, used by `step` and `view`: C9 4.1's clamp, read at each call (the test bench edits the env live). |
| CSV `air` values | `parseCsv` stores `air` as `1` (value > 0), `0`, or `null` (empty or not a number). `replay` uses C9's `(r.air ?? 0) > 0`. |
| Snapshot upgrade | Also renames `fan` → `air` in the stored reading (`s.reading.power`, `.kwh`, `.runS`), so `read()` right after a restore already has `air` (C9 4.2, since commit 35bde0b). |
| Calibration test log | One row per reading (30 s), not per minute: a replay then runs every purge exactly as long as it ran. Measured: with a 1 min log the fit found `infAch` 0.70 for a hidden 0.9 (22 % off) and a CO₂ RMSE of 31 ppm; with the 30 s log 0.95 (6 %) and 2.9 ppm. |
| Why the fit still finds the leakage | With the pair on there is no leakage (C9 4.3). But purges are short: in the test log the fans are on for 16 % of the readings. In the other 84 % the leakage alone sets how fast CO₂ rises and how T and RH drift, which is what the fit needs. The old `EXHAUST` env (leakage always on under suction) is gone with `vent`. |

### 4.4 Tests of other streams that fail in your worktree after task 5

Measured on the scratch copy. Do not fix them; they are not yours. Any failure outside this table goes in your report with its name and first error line.

| File | Test | Why | Fixed by |
|---|---|---|---|
| `tests/integration.test.js` | `default oyster fruiting, tropical weather: in band, few starts` | `tests/harness.js` reads `kwh.fan` and `stats.fanStarts`; the sim ignores the old controller's `cmd.fan` | Lead, task 2.3 |
| `tests/integration.test.js` | `purge mode: a 0.5 °C setback keeps the AC compressor running; "AC off" restarts it at each purge` | Pins the removed AC setback and fan levels | Lead, task 2.3 (removed) |
| `tests/integration.test.js` | `CO2 sensor fault: the timed purge copies earlier days and holds CO2` | The sim ignores `cmd.fan`: no purge reaches the room | Lead, after the controller merge |
| `tests/integration.test.js` | `humidity sensor fault: fog and AC fan copy the same hour of an earlier day; no low-humidity time` | Same | Lead, after the controller merge |
| `tests/integration.test.js` | `old layout (exhaust, purge): AC fan speed control reduces the water that the AC removes and the fogger adds back` | Pins `vent: 'exhaust'` | Lead, task 2.3 (removed) |
| `tests/integration.test.js` | `a filtered supply fan cuts the unfiltered air by more than 80 %` | Pins `vent` | Lead, task 2.3 (removed) |
| `tests/integration.test.js` | `steady fresh air (default): no bursts, stable CO2, no unfiltered air` | Pins steady mode | Lead, task 2.3 (removed) |
| `tests/rooms.test.js` | `Settings at once` | The sim ignores the old controller's `cmd.fan`; the room drifts and the AC setpoint trim moves within 30 s (21 ≠ 20) | Should pass after the controller merge; lead checks |
| `tests/web-mimic.test.js` (arrives with `fix/room-drawing` at step 0) | Every test that reads `SIM.DEFAULT_ENV.vent` | C9 4.1 removes `vent` | Web stream (C9 7) |

`tests/vectors.test.js`, `tests/controller.test.js`, `tests/settings.test.js`, `tests/api.test.js` and the other web tests do not step the sim with the controller's command and pass.

## 5. Tasks

TDD for every task. Commit only the task's files, with the repo's configured git identity (`git config user.name` must print `Ray Tham`; if not, stop and report). Line numbers are those of `<base>`; after an earlier edit in the same file they shift, so match by the quoted text.

**One commit for tasks 2–5.** `sim.js` stops reading `cmd.fan` in task 2, and `capacity.js`, `cycle.js`, `calib.js` and their tests break until tasks 3–5 move them. They land together so that `npm test` stays green for your files at every commit. Tasks 2–4 end with "do not commit"; task 5 commits all seven files.

### Task 0: check the base (no code)

| Step | Command (in the worktree) | Expected |
|---|---|---|
| 1 | `git log --oneline -1 && git status --short` | The step 0 commit; clean tree |
| 2 | `ls air.js tests/air.test.js && grep -n "air.js" index.html` | Both files; one `<script src="air.js">` line before `controller.js` |
| 3 | `node --test tests/capacity.test.js tests/cycle.test.js tests/calib.test.js 2>&1 \| grep -E "^# (tests\|pass\|fail)"` | `# tests 49`, `# pass 49`, `# fail 0` (26 + 21 + 2) |
| 4 | `npm test 2>&1 \| grep -E "^# (tests\|pass\|fail)"` | `# fail 0`. Write down the count N. |
| If anything differs | Stop and report to the lead. | – |

### Task 1: the tests load `air.js`; test rooms lose `vent`

**Files:** `tests/capacity.test.js`, `tests/cycle.test.js`, `tests/calib.test.js`.

Behaviour-neutral: `air.js` defines a global nobody reads yet; today's `capacity.js` treats a room without `vent` as `supply`, the default.

- [ ] **Step 1:** `tests/capacity.test.js` line 4. Replace

```js
require('../sim.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js');
```

with

```js
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js');
```

and line 7 `const room = { name: 'Room 1', volume: 60, vent: 'supply', calib: null };` with

```js
const room = { name: 'Room 1', volume: 60, calib: null };
```

- [ ] **Step 2:** `tests/cycle.test.js` line 4. Replace

```js
require('../sim.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js'); require('../cycle.js');
```

with

```js
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../runtime.js'); require('../capacity.js'); require('../cycle.js');
```

and line 7 `const room = { name: 'Room 1', volume: 60, vent: 'supply', calib: null };` with

```js
const room = { name: 'Room 1', volume: 60, calib: null };
```

- [ ] **Step 3:** `tests/calib.test.js` line 4. Replace

```js
require('../sim.js'); require('../controller.js'); require('../calib.js');
```

with

```js
require('../sim.js'); require('../air.js'); require('../controller.js'); require('../calib.js');
```

- [ ] **Step 4: Run** `node --test tests/capacity.test.js tests/cycle.test.js tests/calib.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`. Expected: `# tests 49`, `# pass 49`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add tests/capacity.test.js tests/cycle.test.js tests/calib.test.js
git commit -m "test(sim): load air.js; test rooms without vent (C9 3, 8)"
```

### Task 2: `sim.js` air exchange (C9 4.1, 4.2, 4.3) — part 1 of the switch

**Files:** `sim.js`, `tests/capacity.test.js`, `tests/cycle.test.js`, `tests/calib.test.js`.

- [ ] **Step 1: Add the C9 bridge** (4.3) to each of the three test files, directly below the `require(...)` line of task 1 (line 4). The same block in all three files:

```js
// C9 bridge (lead deletes at step 2). Test only: until the controller stream merges, controller.js still speaks the old fan shapes.
// This makes it speak C9's: cmd.air, manual.air, rules.purgeMaxS, and on/off purges in place of steady air.
// It does nothing once controller.js has manual.air; the lead deletes it at step 2.
(function bridge(CC) {
  if (CC.defaultSettings().manual.air) return;
  const fix = cfg => { cfg.manual.air = { auto: true, on: false }; cfg.rules.airMode = 'purge'; cfg.rules.purgeMaxS = 180; return cfg; };
  const { defaultRules, defaultSettings, importSettings, create } = CC;
  CC.defaultRules = lim => ({ ...defaultRules(lim), airMode: 'purge', purgeMaxS: 180 });
  CC.defaultSettings = () => fix(defaultSettings());
  CC.importSettings = input => {
    const r = importSettings(input);
    return { settings: fix(r.settings), warnings: r.warnings.filter(w => !w.includes('"manual.air')) };
  };
  CC.create = (cfg, snapshot, onEvent) => {
    const ctl = create(cfg, snapshot, onEvent), update = ctl.update;
    ctl.update = r => { const c = update(r); return { ...c, air: { on: c.fan.level > 0 } }; };
    return ctl;
  };
})(globalThis.ClimateController);
// end of C9 bridge
```

`capacity.js` and `cycle.js` look the controller's functions up at call time, so the bridge works below their `require`.

- [ ] **Step 2:** `tests/capacity.test.js` line 5. Replace

```js
const CAP = globalThis.ClimateCapacity, CC = globalThis.ClimateController;
```

with

```js
const CAP = globalThis.ClimateCapacity, CC = globalThis.ClimateController, SIM = globalThis.ClimateSim, AIR = globalThis.ClimateAir;
```

- [ ] **Step 3: Write the failing tests.** Append to the end of `tests/capacity.test.js`:

```js
// ---------- air exchange in the simulation (C9 4) ----------
const CMD = (air, extra = {}) => ({ ac: { power: false, mode: 'cool', setpoint: 25, fan: 'auto' }, hu: { level: 0 },
  lights: { on: false }, circ: { on: false }, ...(air === undefined ? {} : { air: { on: air } }), ...extra });
// An empty room (no blocks, no doors) with both zones at 1420 ppm, 1000 ppm above the outdoor air.
function airRoom(over = {}) {
  const e = { ...structuredClone(SIM.DEFAULT_ENV), blocks: 0, dailyCycle: false, ...over };
  const sim = SIM.create(e);
  sim.setRoom({ T: 25, RH: 85, CO2: 1420 });
  return sim;
}
const zoneC = sim => { const z = sim.view().zones; return { lo: z.lo.C, hi: z.hi.C }; };

test('sim: plant and environment of the air exchange', () => {
  assert.deepEqual(SIM.PLANT.air, { m3h: 1800, wPerM3h: 0.08 });
  assert.equal(SIM.PLANT.fan, undefined);
  assert.equal(SIM.DEFAULT_ENV.airM3h, null);
  assert.equal('vent' in SIM.DEFAULT_ENV, false);
  assert.equal(SIM.DEFAULT_ENV.inletAt, 'high');
  assert.equal(SIM.DEFAULT_ENV.exhaustAt, 'low');
});

test('sim: fans on, intake high and exhaust low: outdoor air enters high, no leakage', () => {
  const sim = airRoom();
  sim.step(1, CMD(true));
  const c = zoneC(sim);
  // high zone: 0.5 m³/s of 420 ppm air in, 0.5 m³/s of zone air on to the low zone, 30 m³: -1000 × 0.5 / 30 ppm
  assert.ok(Math.abs(c.hi - (1420 - 1000 * 0.5 / 30)) < 1e-9, `${c.hi}`);
  assert.ok(Math.abs(c.lo - 1420) < 1e-9, `${c.lo}`);   // the low zone gets high-zone air at 1420 ppm and loses the same
});

test('sim: fans on, intake low and exhaust high: outdoor air enters low', () => {
  const sim = airRoom({ inletAt: 'low', exhaustAt: 'high' });
  sim.step(1, CMD(true));
  const c = zoneC(sim);
  assert.ok(Math.abs(c.lo - (1420 - 1000 * 0.5 / 30)) < 1e-9, `${c.lo}`);
  assert.ok(Math.abs(c.hi - 1420) < 1e-9, `${c.hi}`);
});

test('sim: env.airM3h sets the airflow', () => {
  const sim = airRoom({ airM3h: 900 });
  sim.step(1, CMD(true));
  assert.ok(Math.abs(zoneC(sim).hi - (1420 - 1000 * 0.25 / 30)) < 1e-9);
});

test('sim: fans off: only leakage, half through each zone', () => {
  const sim = airRoom();
  sim.step(1, CMD(false));
  const c = zoneC(sim), leak = 0.4 * 60 / 3600;   // m³/s
  for (const zn of ['lo', 'hi']) assert.ok(Math.abs(c[zn] - (1420 - 1000 * leak / 2 / 30)) < 1e-9, `${zn} ${c[zn]}`);
});

test('sim: unfiltered air is the leakage (fans off) and the door, never the intake', () => {
  const on = airRoom(), off = airRoom();
  for (let i = 0; i < 3600; i++) { on.step(1, CMD(true)); off.step(1, CMD(false)); }
  assert.equal(on.view().unfilteredM3, 0);
  assert.ok(Math.abs(off.view().unfilteredM3 - 24) < 1e-6, `${off.view().unfilteredM3}`);   // 0.4 × 60 m³ in 1 h
  const door = airRoom();
  door.trigger('door');
  for (let i = 0; i < 60; i++) door.step(1, CMD(true));
  assert.ok(Math.abs(door.view().unfilteredM3 - 15) < 1e-6, `${door.view().unfilteredM3}`); // 0.25 m³/s for 60 s
});

test('sim: power, energy and run time of the air exchange', () => {
  const sim = airRoom();
  for (let i = 0; i < 3600; i++) sim.step(1, CMD(true));
  let v = sim.view();
  assert.ok(Math.abs(v.power.air - 144) < 1e-9);               // 1800 m³/h × 0.08 W
  assert.ok(Math.abs(v.kwh.air - 0.144) < 1e-9);
  assert.equal(sim.snapshot().runS.air, 3600);
  for (let i = 0; i < 600; i++) sim.step(1, CMD(false));
  v = sim.view();
  assert.equal(v.power.air, 0);
  assert.ok(Math.abs(v.kwh.air - 0.144) < 1e-9);
  assert.equal(sim.snapshot().runS.air, 3600);
  const r = sim.read();
  for (const k of ['power', 'kwh']) { assert.ok('air' in r[k], k); assert.equal('fan' in r[k], false, k); }
  assert.equal(r.runS.air, 3600);
  assert.equal('fan' in r.runS, false);
  const half = airRoom({ airM3h: 900 });
  half.step(1, CMD(true));
  assert.ok(Math.abs(half.view().power.air - 72) < 1e-9);
});

test('sim: view() shows the air exchange and the leakage', () => {
  const sim = airRoom();
  sim.step(1, CMD(true));
  assert.equal(sim.view().act.air, true);
  assert.equal(sim.view().airM3h, 1800);
  assert.equal('fanLevel' in sim.view().act, false);
  sim.step(1, CMD(false));
  assert.equal(sim.view().act.air, false);
  assert.ok(Math.abs(sim.view().airM3h - 24) < 1e-9);          // leakage 0.4 × 60 m³/h
});

test('sim: an old fan command and an old vent field are ignored', () => {
  const sim = airRoom();
  sim.step(1, CMD(undefined, { fan: { level: 3 } }));
  assert.equal(sim.view().act.air, false);
  assert.equal(sim.view().power.air, 0);
  const a = airRoom(), b = airRoom({ vent: 'exhaust' });
  for (let i = 0; i < 600; i++) { a.step(1, CMD(i % 120 < 30)); b.step(1, CMD(i % 120 < 30)); }
  assert.deepEqual(b.snapshot(), a.snapshot());
});

test('sim: env.airM3h is held to 50-10000; anything but a number means the default', () => {
  const power = airM3h => { const sim = airRoom({ airM3h }); sim.step(1, CMD(true)); return sim.view().power.air; };
  assert.ok(Math.abs(power(20000) - 800) < 1e-9);   // 10000 m³/h × 0.08 W
  assert.ok(Math.abs(power(10) - 4) < 1e-9);        // 50 m³/h
  for (const x of [null, undefined, NaN, '900']) assert.ok(Math.abs(power(x) - 144) < 1e-9, String(x));
  const sim = airRoom({ airM3h: 20000 });
  sim.step(1, CMD(true));
  assert.equal(sim.view().airM3h, 10000);
});
```

- [ ] **Step 4: Run them to see them fail.** `node --test --test-name-pattern="^sim: " tests/capacity.test.js 2>&1 | grep -E "^(not )?ok|^# (tests|fail)"`. Expected: `# tests 10`, `# fail 10` (`SIM.PLANT.air` is `undefined`; `CMD(...)` has no `fan`, so today's `step` throws `Cannot read properties of undefined (reading 'level')`).

- [ ] **Step 5: `sim.js` header** (lines 14–16). Replace

```js
 *   - Air path: an exhaust fan with a passive inlet (the room is under suction: all incoming air is
 *     unfiltered) or a filtered supply fan with a damper (slight over-pressure). Inlet and outlet can be
 *     low or high.
```

with

```js
 *   - Air exchange: a filtered intake fan (SF-203) and an exhaust fan (EF-206), each with a motorised
 *     damper, switched on and off together (command air.on). Balanced: the room stays at neutral pressure.
 *     With the fans off the dampers are closed and only wall leakage exchanges air (unfiltered).
 *     The intake and the exhaust can each be low or high.
```

- [ ] **Step 6: `PLANT`** (lines 53–55). Replace

```js
    fan: { levels: [
      { name: 'Off', m3h: 0, w: 0 }, { name: 'Low', m3h: 300, w: 60 }, { name: 'Medium', m3h: 600, w: 90 }, { name: 'High', m3h: 900, w: 120 },
    ], supplyPowerFactor: 1.15, leakFrac: 0.3 },
```

with

```js
    // Air exchange (intake + exhaust pair) when on. wPerM3h is for both fans: no source yet, replace with equipment data.
    air: { m3h: 1800, wPerM3h: 0.08 },
```

- [ ] **Step 7: `DEFAULT_ENV`** (lines 74–75). Replace

```js
    // Default: filtered supply fan, air in high, out low (CO2 collects low). 'exhaust' = exhaust fan, open inlet.
    vent: 'supply', inletAt: 'high', exhaustAt: 'low',
```

with

```js
    // Air exchange: airM3h null = PLANT.air.m3h; a number overrides it (held to 50-10000). Air in high, out low (CO2 collects low).
    airM3h: null, inletAt: 'high', exhaustAt: 'low',
```

- [ ] **Step 7b: The size helper** (C9 4.1). After line 95 (`const R = () => ({ ...PLANT.room, ...(e.room || {}) });`) insert:

```js
    // Air exchange size (m³/h): env.airM3h held to 50-10000; anything but a number means PLANT.air.m3h.
    const airM3h = () => (Number.isFinite(e.airM3h) ? clamp(e.airM3h, 50, 10000) : PLANT.air.m3h);
```

- [ ] **Step 8: `init()`** (lines 104 and 106–108). In line 104 replace `huLevel: 0, fanLevel: 0, lights: false` with `huLevel: 0, air: false, lights: false`. Replace lines 106–108

```js
        p: { ac: PLANT.ac.standbyW, hu: PLANT.fogger.standbyW, fan: 0, lights: 0, circ: 0 },
        kwh: { ac: 0, hu: 0, fan: 0, lights: 0, circ: 0 },
        runS: { ac: 0, hu: 0, fan: 0 },
```

with

```js
        p: { ac: PLANT.ac.standbyW, hu: PLANT.fogger.standbyW, air: 0, lights: 0, circ: 0 },
        kwh: { ac: 0, hu: 0, air: 0, lights: 0, circ: 0 },
        runS: { ac: 0, hu: 0, air: 0 },
```

- [ ] **Step 9: Command** (line 254). Replace

```js
      a.fanLevel = level(cmd.fan.level, PLANT.fan.levels.length);
```

with

```js
      a.air = !!(cmd.air && cmd.air.on);
```

- [ ] **Step 10: Air flows** (lines 282–302; line 303 `// Net flow from low to high …` and everything after it stay). Replace

```js
      // ---- Air flows (m³/s) ----
      const fanL = PLANT.fan.levels[a.fanLevel], qFan = fanL.m3h / 3600, leak = room.infAch * room.volume / 3600;
      const d = s.dist, qDoor = s.t < d.door ? 0.25 : 0;
      const inZ = e.inletAt === 'high' ? 'hi' : 'lo', outZ = e.exhaustAt === 'low' ? 'lo' : 'hi';
      const inflow = { lo: 0, hi: 0 }, outflow = { lo: 0, hi: 0 };
      let unfiltered;
      if (e.vent === 'supply') {
        // Filtered supply fan: slight over-pressure. Leaks bring air in only when the fan is off.
        inflow[inZ] += qFan; outflow[outZ] += qFan;
        const leakIn = qFan > 0 ? 0 : leak;
        inflow.lo += leakIn / 2; inflow.hi += leakIn / 2; outflow.lo += leakIn / 2; outflow.hi += leakIn / 2;
        unfiltered = leakIn;
      } else {
        // Exhaust fan with a passive inlet: the room is under suction. All incoming air is unfiltered;
        // part of it comes through gaps instead of the inlet.
        const lf = PLANT.fan.leakFrac;
        inflow[inZ] += qFan * (1 - lf); inflow.lo += qFan * lf / 2 + leak / 2; inflow.hi += qFan * lf / 2 + leak / 2;
        outflow[outZ] += qFan; outflow.lo += leak / 2; outflow.hi += leak / 2;
        unfiltered = qFan + leak;
      }
      inflow.lo += qDoor; outflow.lo += qDoor; unfiltered += qDoor;
```

with

```js
      // ---- Air flows (m³/s) ----
      // On: filtered air in through the intake, the same flow out through the exhaust, no leakage.
      // Off: the dampers are closed; only wall leakage, half through each zone, unfiltered.
      const m3h = airM3h();
      const qAir = a.air ? m3h / 3600 : 0, leak = a.air ? 0 : room.infAch * room.volume / 3600;
      const d = s.dist, qDoor = s.t < d.door ? 0.25 : 0;
      const inZ = e.inletAt === 'high' ? 'hi' : 'lo', outZ = e.exhaustAt === 'low' ? 'lo' : 'hi';
      const inflow = { lo: 0, hi: 0 }, outflow = { lo: 0, hi: 0 };
      inflow[inZ] += qAir; outflow[outZ] += qAir;
      inflow.lo += leak / 2; inflow.hi += leak / 2; outflow.lo += leak / 2; outflow.hi += leak / 2;
      let unfiltered = leak;
      inflow.lo += qDoor; outflow.lo += qDoor; unfiltered += qDoor;
```

- [ ] **Step 11: Meters** (lines 365 and 371). Replace

```js
      s.p.fan = fanL.w * (e.vent === 'supply' ? PLANT.fan.supplyPowerFactor : 1);
```

with

```js
      s.p.air = a.air ? m3h * PLANT.air.wPerM3h : 0;
```

and

```js
      if (a.fanLevel > 0) s.runS.fan += dt;
```

with

```js
      if (a.air) s.runS.air += dt;
```

The `kwh` loop (line 368) sums every key of `s.p`, so `kwh.air` follows. `sampleSensors` (line 236) copies `s.p`, `s.kwh`, `s.runS`, so the reading follows.

- [ ] **Step 12: `view()`** (lines 391 and 395). Replace

```js
      const qFan = PLANT.fan.levels[s.act.fanLevel].m3h;
```

with

```js
      const room = R(), qAir = s.act.air ? airM3h() : 0, leak = s.act.air ? 0 : room.infAch * room.volume;
```

and in the returned object

```js
        airM3h: R().infAch * R().volume + qFan, fogGph: PLANT.fogger.levels[s.act.huLevel].gph,
```

with

```js
        airM3h: qAir + leak, fogGph: PLANT.fogger.levels[s.act.huLevel].gph,
```

`act: { ...s.act }` already carries `air`.

- [ ] **Step 13: Run the new tests.** `node --test --test-name-pattern="^sim: " tests/capacity.test.js 2>&1 | grep -E "^# (tests|pass|fail)"`. Expected: `# tests 10`, `# pass 10`, `# fail 0`.

- [ ] **Step 14: Check for leftovers.** `grep -nE "PLANT\.fan|fanLevel|e\.vent|\.fan\.level|s\.p\.fan|runS\.fan|supplyPowerFactor|leakFrac" sim.js` → no output. `grep -c "e\.airM3h" sim.js` → `1` (only in `airM3h()`).

- [ ] **Step 15: Do not commit.** `capacity.js` still reads `PLANT.fan` (its `balance` tests throw); task 3 fixes it.

### Task 3: `capacity.js` (C9 8) — part 2 of the switch

**Files:** `capacity.js`, `tests/capacity.test.js`.

- [ ] **Step 1: Write the failing balance tests.** In `tests/capacity.test.js` replace the test at lines 53–59

```js
test('balance: the fan limit matches a hand calculation', () => {
  // 900 m³/h × (900 - 420) ppm / 45 mL/h per block = 9600 blocks
  const tg = CAP.commonTargets([{ crop: 'oyster', blocks: 1 }]);
  assert.equal(CAP.balance(room, [{ crop: 'oyster', blocks: 1 }], tg).fan, 9600);
  // An exhaust fan also gets the leakage air: (900 + 0.4 × 60) × 480 / 45 = 9856
  assert.equal(CAP.balance({ ...room, vent: 'exhaust' }, [{ crop: 'oyster', blocks: 1 }], tg).fan, 9856);
});
```

with

```js
test('balance: the air exchange limit matches a hand calculation with ClimateAir', () => {
  // oyster: purge 900 -> 700 ppm, cap 180 s, 1800 m³/h, 45 mL/h per block, 60 m³, 420 ppm outside
  const mix = [{ crop: 'oyster', blocks: 1 }], tg = CAP.commonTargets(mix);
  const time = (n, m3h) => AIR.purgeTimeS({ volume: 60, co2Out: 420, leakM3h: 0, prodM3h: n * 45 / 1e6, m3h, start: 900, stop: 700 });
  const b = CAP.balance(room, mix, tg);
  assert.ok(time(b.air, 1800) <= 180 && time(b.air + 1, 1800) > 180, `${b.air}`);
  // closed form: 60/1800 h × ln((900 - css)/(700 - css)) = 180 s  ->  css = 642.56 ppm  ->  n = (642.56 - 420) × 1800 / 45
  assert.equal(b.air, 8902);
  const small = CAP.balance({ ...room, airM3h: 900 }, mix, tg);
  assert.ok(time(small.air, 900) <= 180 && time(small.air + 1, 900) > 180, `${small.air}`);
  assert.equal(small.limit, 'air');
  assert.equal(small.estimate, small.air);
});

test('balance: the leakage and the old vent field do not change the estimate', () => {
  const mix = [{ crop: 'oyster', blocks: 1 }], tg = CAP.commonTargets(mix);
  const cal = { ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 };
  const a = CAP.balance({ ...room, calib: cal }, mix, tg);
  assert.deepEqual(CAP.balance({ ...room, calib: { ...cal, infAch: 2 } }, mix, tg), a);
  assert.deepEqual(CAP.balance({ ...room, calib: cal, vent: 'exhaust' }, mix, tg), a);
});

test('balance: no air exchange limit up to 100000 blocks is Infinity', () => {
  // 5 mL/h per block at 10000 m³/h: 100000 blocks hold 470 ppm and purge 900 -> 700 in 14 s
  const mix = [{ crop: 'oyster', blocks: 1, co2PerBlock: 5 }];
  assert.equal(CAP.balance({ ...room, airM3h: 10000 }, mix, CAP.commonTargets(mix)).air, Infinity);
});
```

- [ ] **Step 1b: The trial test.** Insert after the test `trial: bad input is refused with a clear error; blocks are rounded` (it ends at line 113):

```js
test('trial: the room size of the air exchange reaches the simulation', () => {
  const mix = [{ crop: 'oyster', blocks: 2000 }], tg = CAP.commonTargets(mix);
  const base = CAP.trial(room, mix, tg, 2000);
  assert.deepEqual(CAP.trial({ ...room, airM3h: 1800 }, mix, tg, 2000), base, 'no size is the default 1800 m³/h');
  assert.notDeepEqual(CAP.trial({ ...room, airM3h: 900 }, mix, tg, 2000), base);
});
```

`cfg.airM3h` (step 10) cannot be observed until the C9 controller reads it; the test proves the env path.

- [ ] **Step 2: Delete** the test at lines 67–72 (`balance: a fog need that is high when nearly empty still finds the upper limit`). It pinned the leaky exhaust room. Without a base fan and without leakage in the balance, no design-day room has a fog need above the fogger's at 0 blocks (checked for every crop at `ua` 20, 80, 200, 400), so the case no longer exists. `maxBlocks` keeps its U-shape handling.

- [ ] **Step 3: Run to see them fail.** `node --test --test-name-pattern="^balance: " tests/capacity.test.js 2>&1 | grep -E "^(not )?ok|^# (tests|fail)"`. Expected: `# tests 5`, `# fail 5` (`Cannot read properties of undefined (reading 'levels')`: `PLANT.fan` is gone).

- [ ] **Step 4: `capacity.js` header** (lines 7, 13, 15). Replace

```js
 *   balance(room, mix, targets, region) -> step 1: { fan, ac, fog, estimate, limit }, most blocks per machine, instant
```

with

```js
 *   balance(room, mix, targets, region) -> step 1: { air, ac, fog, estimate, limit }, most blocks per machine, instant
```

replace

```js
 * room = { name, volume, vent, calib: { ua, infAch, moistBuffer, co2PerBlock, rmse: { T, RH, CO2 }, date } | null }
```

with

```js
 * room = { name, volume, airM3h?, calib: { ua, infAch, moistBuffer, co2PerBlock, rmse: { T, RH, CO2 }, date } | null }
```

and replace

```js
 * Machine sizes are the simulation's (ClimateSim.PLANT). Choosing other machines is a later step.
```

with

```js
 * Machine sizes are the simulation's (ClimateSim.PLANT); the air exchange is room.airM3h (default PLANT.air.m3h).
 * Choosing other machines is a later step.
```

- [ ] **Step 5: Globals** (line 20). Replace

```js
  const SIM = global.ClimateSim, CC = global.ClimateController, RT = global.ClimateRuntime;
```

with

```js
  const SIM = global.ClimateSim, CC = global.ClimateController, RT = global.ClimateRuntime, AIR = global.ClimateAir;
```

- [ ] **Step 6: `largestOk`.** Insert after line 102 (the closing `}` of `maxBlocks`):

```js
  // Largest whole n in [0, max] with ok(n), for an ok that holds up to some n and fails above it (bisection).
  // Never ok gives 0; still ok at max gives Infinity (no limit), as in maxBlocks.
  function largestOk(ok, max) {
    if (!ok(0)) return 0;
    if (ok(max)) return Infinity;
    let lo = 0, hi = max;
    while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (ok(m)) lo = m; else hi = m; }
    return lo;
  }
```

- [ ] **Step 7: Comment above `balance`.** After line 108 (`// Each day's worst hour is left out: …`) insert:

```js
  // Outdoor air: the purges bring in, on average, the air that carries the blocks' CO2 out at the middle of the
  // purge band (n·c / dC). The air exchange limit: the most blocks whose purge still reaches the stop level
  // within the time cap.
```

- [ ] **Step 8: `balance` air** (lines 112–117). Replace

```js
    const leak = room.vent === 'exhaust' ? R.infAch * R.volume : 0;               // m³/h; supply fan: no leak in
    const fanBase = P.fan.levels[rules.baseFan.fruiting].m3h + leak;
    const fanTop = P.fan.levels[P.fan.levels.length - 1].m3h + leak;
    const fogTop = P.fogger.levels[P.fogger.levels.length - 1].gph / 3600;         // g/s
    const dC = rules.fanOn - R.co2Out;                                              // CO2 held at the fan start level
    const air = n => Math.max(fanBase, n * c / dC) / 3600;                          // m³/s of outdoor air
```

with

```js
    const airM3h = room.airM3h ?? P.air.m3h;                                         // the air exchange when on
    const fogTop = P.fogger.levels[P.fogger.levels.length - 1].gph / 3600;         // g/s
    const dC = (rules.fanOn + rules.fanOff) / 2 - R.co2Out;                        // CO2 held at the middle of the purge band
    const air = n => n * c / dC / 3600;                                             // m³/s of outdoor air, on average
```

- [ ] **Step 9: `balance` result** (lines 133–135). Replace

```js
    const out = { fan: maxBlocks(n => n * c / dC, fanTop), ac: maxBlocks(secondWorst('ac'), P.ac.capW), fog: maxBlocks(secondWorst('fog'), fogTop) };
    out.estimate = Math.min(out.fan, out.ac, out.fog);
    out.limit = ['fan', 'ac', 'fog'].find(k => out[k] === out.estimate);
```

with

```js
    const purgeOk = n => AIR.purgeTimeS({ volume: R.volume, co2Out: R.co2Out, leakM3h: 0, prodM3h: n * c / 1e6,
      m3h: airM3h, start: rules.fanOn, stop: rules.fanOff }) <= rules.purgeMaxS;
    const out = { air: largestOk(purgeOk, 100000), ac: maxBlocks(secondWorst('ac'), P.ac.capW), fog: maxBlocks(secondWorst('fog'), fogTop) };
    out.estimate = Math.min(out.air, out.ac, out.fog);
    out.limit = ['air', 'ac', 'fog'].find(k => out[k] === out.estimate);
```

`c` is mL/h per block, so `n × c / 10⁶` is m³/h of CO₂ (C9 8).

- [ ] **Step 10: `trial`** (lines 147 and 157). Replace

```js
    Object.assign(e, { startHour: 0, blocks: n, co2PerBlock: mixCo2(room, mix), blockStage: 'fruiting', vent: room.vent || e.vent,
```

with

```js
    Object.assign(e, { startHour: 0, blocks: n, co2PerBlock: mixCo2(room, mix), blockStage: 'fruiting', airM3h: room.airM3h ?? null,
```

and after line 157 (`cfg.program.harvest.on = false;  // harvest windows lower RH on purpose`) insert

```js
    cfg.airM3h = room.airM3h ?? SIM.PLANT.air.m3h;         // the controller knows the size it runs
```

The pre-C9 controller ignores the extra key.

- [ ] **Step 11: Run the balance tests.** Same command as step 3. Expected: `# tests 5`, `# pass 5`. Measured values for reference (default room, 1800 m³/h):

| Crop | `air` | `ac` | `fog` | `limit` |
|---|---|---|---|---|
| oyster | 8902 | 3039 | 7260 | `ac` |
| golden | 902 | 1534 | 4054 | `air` |
| pink | 8902 | 3780 | 6021 | `ac` |
| milky | 8902 | 19837 | 3840 | `fog` |
| oyster at `airM3h: 900` | 2018 | 3039 | 7260 | `air` |

- [ ] **Step 12: Run the whole file.** `node --test tests/capacity.test.js 2>&1 | grep -E "^not ok|^# (tests|pass|fail)"`. Expected: 5 failures, all from the sealed room (fans off between purges; no steady base fan bringing in wet air):

| Test | Fails because |
|---|---|
| `trial: too many blocks fail … ("empty")` | 200 golden in the default room now pass (`side` `null`) |
| `trial: a nearly empty room is judged on the room …` | Same at 0 blocks |
| `check: 200 golden oyster is too empty (too wet), with a minimum and a maximum` | Verdict `tight` (capacity 222: from 233 blocks the purges' wet air gives "near saturation", labelled `empty`) |
| `check: a balance estimate of 0 does not send the search to 1 block` | With no base fan the balance gives 1026 for `ua` 200, not 0 |
| `check: a too-wet plan with a low estimate still finds the pass window` | 100 black oyster pass; verdict `too-empty` (`why: 'use'`) |

- [ ] **Step 13: A leaky room for the "empty" side.** After line 8 (`const NOW = …`) insert:

```js
// A leaky room: with the fans off between purges, its leakage brings in wet outdoor air. With few blocks
// (little heat, so the AC seldom dries the air) it runs near saturation on the mild, rainy day.
const leaky = { ...room, calib: { ua: 80, infAch: 2, moistBuffer: 3, co2PerBlock: 45 } };
```

In `trial: too many blocks fail …` (line 97) replace

```js
  const e = CAP.trial(room, golden, CAP.commonTargets(golden), 200);
```

with

```js
  const e = CAP.trial(leaky, golden, CAP.commonTargets(golden), 200);
```

In `trial: a nearly empty room is judged on the room …` (lines 103–105) replace

```js
  // Noise-free CO2 would sit at exactly 420 ppm and look like a frozen sensor; the trial must still label this "empty".
  const golden = [{ crop: 'golden', blocks: 200 }];
  assert.equal(CAP.trial(room, golden, CAP.commonTargets(golden), 0).side, 'empty');
```

with

```js
  // Noise-free CO2 would sit at exactly 420 ppm and look like a frozen sensor; the trial must still label this "empty"
  // (the leaky room is too wet when empty).
  const golden = [{ crop: 'golden', blocks: 200 }];
  assert.equal(CAP.trial(leaky, golden, CAP.commonTargets(golden), 0).side, 'empty');
```

Measured: the leaky room fails "humidity near saturation" on Mild / rainy at 0 and 200 blocks (18.8 % and 16.2 % of the day above 95 % RH).

- [ ] **Step 14: The warm room.** In `check: a balance estimate of 0 …` (lines 204–213) replace

```js
  const warm = { ...room, calib: { ua: 200, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
```

with

```js
  const warm = { ...room, calib: { ua: 300, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45, rmse: { T: 0.2, RH: 1, CO2: 20 }, date: '2026-10-01T00:00:00Z' } };
```

and

```js
  assert.equal(r.verdict, 'impossible', 'too hot at every size, as the simulation shows');
```

with

```js
  assert.ok(r.capacity.max < 100, `too hot above a few dozen blocks, as the simulation shows: ${JSON.stringify(r.capacity)}`);
```

Measured: the balance gives `ac` 0 from `ua` 300; the check runs 1000, 870, … and settles at a capacity of 43 (`too-dense`), limit "temperature too high" on Hot-dry.

- [ ] **Step 15: Two `todo` tests** (4.3; contract question 2: the lead re-measures them with the C9 controller at step 2). Replace the first line of the test at line 184

```js
test('check: 200 golden oyster is too empty (too wet), with a minimum and a maximum', () => {
```

with

```js
test('check: 200 golden oyster is too empty (too wet), with a minimum and a maximum', { todo: 'C9: the lead re-measures with the C9 controller at step 2' }, () => {
```

and the first line of the test at line 215

```js
test('check: a too-wet plan with a low estimate still finds the pass window', () => {
```

with

```js
test('check: a too-wet plan with a low estimate still finds the pass window', { todo: 'C9: the lead re-measures with the C9 controller at step 2' }, () => {
```

The bodies stay as they are.

- [ ] **Step 16: Run the whole file.** `node --test tests/capacity.test.js 2>&1 | grep -E "^not ok|^# (tests|pass|fail|todo)"`. Expected: `# tests 38`, `# pass 36`, `# fail 0`, `# todo 2`; the only `not ok` lines are the two `# TODO` tests. About 17 s.

- [ ] **Step 17: Do not commit** (tasks 4, 5 first).

### Task 4: `cycle.js` (C9 8) — part 3 of the switch

**Files:** `cycle.js`, `tests/cycle.test.js`.

- [ ] **Step 1: Update the test.** In `F1 forced settings cannot change the run` (line 174) replace

```js
  merged.manual = { fan: { auto: false, level: 0 } };
```

with

```js
  merged.manual = { air: { auto: false, on: false } };
```

- [ ] **Step 1b: Write the failing size test.** Append to the end of `tests/cycle.test.js`:

```js
// ---------- AIR ----------
test('AIR the room size of the air exchange reaches the simulation', () => {
  const r = CY.runCycle({ ...room, airM3h: 1800 }, oyster(2000), { settings: SHORT_READY });
  assert.deepStrictEqual(r, CY.runCycle(room, oyster(2000), { settings: SHORT_READY }), 'no size is the default 1800 m³/h');
  const small = CY.runCycle({ ...room, airM3h: 900 }, oyster(2000), { settings: SHORT_READY });
  assert.ok(Math.abs(small.totals.kwh - r.totals.kwh) > 1e-6, `${small.totals.kwh} vs ${r.totals.kwh}`);
});
```

Run `node --test --test-name-pattern="^AIR " tests/cycle.test.js 2>&1 | grep -E "^(not )?ok"`. Expected: `not ok`, message `61.94778821991438 vs 61.94778821991438` (the size does not reach the sim yet).

- [ ] **Step 2: Run F1.** `node --test --test-name-pattern="^F1 " tests/cycle.test.js 2>&1 | grep -E "^(not )?ok|^# fail"`. Expected: `ok` (measured). No test can fail first in your worktree: the pre-C9 controller still has `manual.fan`, and the bridge adds `manual.air`. Step 3 matters after the controller merge, when `manual.fan` is gone and today's line 75 would throw `Cannot set properties of undefined (setting 'auto')` in every cycle test.

- [ ] **Step 3: `cycle.js` manual** (line 75). Replace

```js
    cfg.manual.ac.auto = true; cfg.manual.hu.auto = true; cfg.manual.fan.auto = true;
```

with

```js
    cfg.manual.ac.auto = true; cfg.manual.hu.auto = true; cfg.manual.air.auto = true;
```

and after line 74 (`cfg.offsets = { T: 0, RH: 0, CO2: 0 };`) insert

```js
    cfg.airM3h = room.airM3h ?? SIM.PLANT.air.m3h;
```

- [ ] **Step 4: `cycle.js` env** (line 105; C9 8: as the capacity trial). Replace

```js
      startHour: 0, blocks: n, co2PerBlock: c, blockStage: S[0], vent: room.vent || e.vent,
```

with

```js
      startHour: 0, blocks: n, co2PerBlock: c, blockStage: S[0], airM3h: room.airM3h ?? null,
```

The energy sums (line 146) add every key of `r.kwh`, so they follow the `air` key with no change (C9 8).

- [ ] **Step 5: `todo` on FULL** (contract question 1: the controller stream implements C9 5.6 "Sensor check"; the lead removes the `todo` at step 2). Replace line 246

```js
test('FULL full default cycle: speed and sensible result', t => {
```

with

```js
test('FULL full default cycle: speed and sensible result', { todo: 'C9 5.6 "Sensor check" (controller stream): the lead removes this at step 2' }, t => {
```

Measured: every other assertion of FULL holds (83 days in about 6 s, all four fruiting flushes pass, spawn passes with a core of 28.2 °C); the last one fails: `sensor_CO2` is raised 91 times in spawn. Spawn holds CO₂ near 4900 ppm; a purge at 1800 m³/h in 60 m³ pulls it down about 2200 ppm/min, more than the controller's spike limit (`SENSORS.CO2.rate` 1000 ppm/min).

- [ ] **Step 6: Run the file.** `node --test tests/cycle.test.js 2>&1 | grep -E "^not ok|^# (tests|pass|fail|todo)"`. Expected: `# tests 22`, `# pass 21`, `# fail 0`, `# todo 1` (AIR passes now). About 12 s.

- [ ] **Step 7: Do not commit** (task 5 first).

### Task 5: `calib.js` (C9 8) — part 4 of the switch, then commit

**Files:** `calib.js`, `tests/calib.test.js`.

- [ ] **Step 1: Write the failing tests.** Replace everything in `tests/calib.test.js` below the bridge block of task 2 (from `const SIM = globalThis.ClimateSim, …` to the end, old lines 5–46) with:

```js
const SIM = globalThis.ClimateSim, CC = globalThis.ClimateController, CAL = globalThis.ClimateCalib;

// A log of a "hidden" room, with every reading (30 s), so a replay runs each purge exactly as long as it ran.
// With the air exchange on there is no leakage (C9 4.3), but the purges are short: the fans are off most of the
// day, and then the leakage sets how fast CO2 rises and how the room drifts. That is what the fit finds.
function makeLog(hidden, hours = 24) {
  const e = structuredClone(SIM.DEFAULT_ENV);
  e.room = { ua: hidden.ua, infAch: hidden.infAch, moistBuffer: hidden.moistBuffer };
  e.co2PerBlock = hidden.co2PerBlock;
  const cfg = CC.defaultSettings(); cfg.program.harvest.on = false;
  const sim = SIM.create(e), ctl = CC.create(cfg, null, null);
  let r = sim.read(), cmd = ctl.update(r), seq = r.seq;
  const rows = [];
  for (let s = 0; s < (hours + 6) * 3600; s++) {
    sim.step(1, cmd); r = sim.read(); if (r.seq === seq) continue; seq = r.seq; cmd = ctl.update(r);
    if (r.t < 6 * 3600) continue;                             // 6 h of start-up
    rows.push({ t: r.t - 6 * 3600, T: r.T, RH: r.RH, CO2: r.CO2, tOut: r.tOut, rhOut: r.rhOut, air: cmd.air.on ? 1 : 0, fog: cmd.hu.level,
      acPower: cmd.ac.power ? 1 : 0, acMode: cmd.ac.mode, acSet: cmd.ac.setpoint, acFan: cmd.ac.fan, lights: cmd.lights.on ? 1 : 0, circ: cmd.circ.on ? 1 : 0 });
  }
  return { rows, env: e };
}

test('CSV export and import give the same rows', () => {
  const { rows } = makeLog({ ua: 80, infAch: 0.4, moistBuffer: 3, co2PerBlock: 45 }, 2);
  const back = CAL.parseCsv(CAL.toCsv(rows));
  assert.equal(back.length, rows.length);
  assert.ok(rows.some(x => x.air === 1) && rows.some(x => x.air === 0), 'the log has purges and pauses');
  assert.deepEqual(back.map(x => x.air), rows.map(x => x.air));
  assert.ok(Math.abs(back[5].T - rows[5].T) < 0.01 && back[5].acMode === rows[5].acMode);
  assert.equal(CAL.toCsv(rows).split('\n')[0].split(',')[6], 'air');
});

test('an old log with a fan column (levels 0-3) reads as air on above 0, and replays the same', () => {
  const air = 'minutes,T,RH,CO2,air\n0,25,85,900,0\n1,25,85,880,1\n2,25,85,860,1\n3,25,85,850,0\n';
  const fan = 'minutes,T,RH,CO2,fan\n0,25,85,900,0\n1,25,85,880,2\n2,25,85,860,3\n3,25,85,850,0\n';
  const a = CAL.parseCsv(air), f = CAL.parseCsv(fan);
  assert.deepEqual(f.map(r => r.air), [0, 1, 1, 0]);
  assert.deepEqual(f, a);
  assert.equal(CAL.parseCsv('minutes,T,RH,CO2,exhaust\n0,25,85,900,3\n1,25,85,880,\n')[1].air, null);
  const base = structuredClone(SIM.DEFAULT_ENV), p = CAL.paramsOf(base);
  assert.deepEqual(CAL.replay(f, base, p), CAL.replay(a, base, p));
  const off = CAL.parseCsv('minutes,T,RH,CO2,air\n0,25,85,900,0\n1,25,85,880,0\n2,25,85,860,0\n3,25,85,850,0\n');
  assert.ok(CAL.replay(a, base, p).series[3].CO2 < CAL.replay(off, base, p).series[3].CO2 - 50, 'the replay runs the air exchange');
});

test('the fit finds the hidden room values from a 24 h log', () => {
  const hidden = { ua: 140, infAch: 0.9, moistBuffer: 4, co2PerBlock: 60 };
  const { rows } = makeLog(hidden);
  const base = structuredClone(SIM.DEFAULT_ENV); base.startHour = 12;    // the log starts at 12:00
  const start = CAL.paramsOf(base);
  const before = CAL.replay(rows, base, start);
  const { params, result } = CAL.fit(rows, base, start);
  assert.ok(result.score < before.score * 0.3, `score ${before.score.toFixed(2)} -> ${result.score.toFixed(2)}`);
  for (const k of ['ua', 'infAch', 'co2PerBlock']) {
    const err = Math.abs(params[k] - hidden[k]) / hidden[k];
    assert.ok(err < 0.25, `${k}: found ${params[k].toFixed(2)}, hidden ${hidden[k]} (${(err * 100).toFixed(0)} %)`);
  }
  assert.ok(result.rmse.T < 0.3 && result.rmse.CO2 < 50, JSON.stringify(result.rmse));
});
```

The `EXHAUST` constant and its uses are gone (C9 4.1 removes `vent`). Why the fit stays meaningful: section 4.3, last two rows.

- [ ] **Step 2: Run to see them fail.** `node --test tests/calib.test.js 2>&1 | grep -E "^(not )?ok|^# (tests|fail)"`. Expected: `# tests 3`, at least 2 `not ok` (`toCsv` writes `fan`, `parseCsv` has no `air`, `replay` sends `fan`).

- [ ] **Step 3: Header** (line 12). Replace

```js
 *   fan (0-3), fog (0-3), acPower (0/1), acMode (cool/heat/dry/fan), acSet (°C), acFan (low/auto/high), lights (0/1), circ (0/1)
```

with

```js
 *   air (0/1; an old fan column 0-3 counts as on above 0), fog (0-3), acPower (0/1), acMode (cool/heat/dry/fan), acSet (°C), acFan (low/auto/high), lights (0/1), circ (0/1)
```

- [ ] **Step 4: Column aliases** (line 26). Replace

```js
    fan: ['fan', 'fan_level', 'exhaust'],
```

with

```js
    air: ['air', 'fan', 'fan_level', 'exhaust'],
```

- [ ] **Step 5: `parseCsv`** (lines 60–62). After line 60 (`const str = k => …`) insert

```js
      const onOff = x => (x == null || !Number.isFinite(x) ? null : x > 0 ? 1 : 0);
```

and in the `rows.push(...)` line replace

```js
        fan: num('fan'), fog: num('fog'),
```

with

```js
        air: onOff(num('air')), fog: num('fog'),
```

- [ ] **Step 6: `toCsv`** (lines 70, 73). Replace `'tOut', 'rhOut', 'fan', 'fog',` with `'tOut', 'rhOut', 'air', 'fog',` and `r.fan ?? '', r.fog ?? '',` with `r.air ?? '', r.fog ?? '',`.

- [ ] **Step 7: `replay` command** (line 98). Replace

```js
      hu: { level: r.fog ?? 0 }, fan: { level: r.fan ?? 0 }, lights: r.lights == null ? undefined : { on: r.lights > 0 },
```

with

```js
      hu: { level: r.fog ?? 0 }, air: { on: (r.air ?? 0) > 0 }, lights: r.lights == null ? undefined : { on: r.lights > 0 },
```

- [ ] **Step 8: Run.** `node --test tests/calib.test.js 2>&1 | grep -E "^(not )?ok|^# (tests|pass|fail)"`. Expected: `# tests 3`, `# pass 3`, `# fail 0`. About 25 s. Measured fit: `ua` 142.6, `infAch` 0.95, `moistBuffer` 4.03, `co2PerBlock` 61.9; RMSE T 0.04 °C, RH 0.09 %, CO₂ 2.9 ppm.

- [ ] **Step 9: Leftovers.** `grep -nE "PLANT\.fan|e\.vent|room\.vent|\.fan\.level|kwh\.fan|runS\.fan|s\.p\.fan|supplyPowerFactor|leakFrac" sim.js capacity.js cycle.js calib.js`. Expected: no output.

- [ ] **Step 10: All tests.** `npm test 2>&1 | grep -E "^not ok|^# (tests|pass|fail|todo)"`. Expected: `# tests` = N + 14, `# todo 3` (your three), and the `not ok` lines are exactly your three `# TODO` tests plus the tests of section 4.4. Anything else: stop and fix (yours) or report (not yours).

- [ ] **Step 11: Commit the switch**

```bash
git add sim.js capacity.js cycle.js calib.js tests/capacity.test.js tests/cycle.test.js tests/calib.test.js
git commit -m "feat(sim): air exchange (intake + exhaust pair, on/off) replaces the fresh-air fan (C9 4, 8)"
```

### Task 6: old snapshots (C9 4.2 "Snapshot restore")

**Files:** `sim.js`, `tests/capacity.test.js`.

- [ ] **Step 1: Write the failing test.** Append to `tests/capacity.test.js`:

```js
test('sim: an old snapshot (fan level, fan meters) is upgraded', () => {
  const sim = airRoom();
  for (let i = 0; i < 40; i++) sim.step(1, CMD(true));
  const old = sim.snapshot();
  delete old.act.air; old.act.fanLevel = 2;
  for (const k of ['p', 'kwh', 'runS']) { old[k].fan = old[k].air; delete old[k].air; }
  for (const k of ['power', 'kwh', 'runS']) { old.reading[k].fan = old.reading[k].air; delete old.reading[k].air; }
  const up = SIM.create(sim.env, old).snapshot();
  assert.equal(up.act.air, true);
  assert.equal('fanLevel' in up.act, false);
  for (const k of ['p', 'kwh', 'runS']) {
    assert.equal(up[k].air, sim.snapshot()[k].air, k);
    assert.equal('fan' in up[k], false, k);
  }
  assert.equal(up.reading.kwh.air, sim.snapshot().reading.kwh.air);
  assert.equal('fan' in up.reading.power, false);
  old.act.fanLevel = 0;
  assert.equal(SIM.create(sim.env, old).snapshot().act.air, false);
  assert.deepEqual(SIM.create(sim.env, sim.snapshot()).snapshot(), sim.snapshot(), 'a new snapshot is unchanged');
});
```

- [ ] **Step 2: Run to see it fail.** `node --test --test-name-pattern="old snapshot" tests/capacity.test.js 2>&1 | grep -E "^(not )?ok|^# fail"`. Expected: `not ok`, `undefined !== true` (`act.air` missing).

- [ ] **Step 3: Restore through `upgrade`** (line 96). Replace

```js
    let s = snapshot ? structuredClone(snapshot) : init();
```

with

```js
    let s = snapshot ? upgrade(structuredClone(snapshot)) : init();
```

- [ ] **Step 4: `upgrade`.** Insert after the closing `}` of `init()` (line 115 at `<base>`):

```js
    // A snapshot from before the air exchange (one fan with levels 0-3): fan level > 0 is "on"; the meters keep their values.
    function upgrade(x) {
      if (x.act && 'fanLevel' in x.act) { x.act.air = x.act.fanLevel > 0; delete x.act.fanLevel; }
      for (const m of [x.p, x.kwh, x.runS, x.reading && x.reading.power, x.reading && x.reading.kwh, x.reading && x.reading.runS]) {
        if (m && 'fan' in m) { m.air = m.fan; delete m.fan; }
      }
      return x;
    }
```

A function declaration is hoisted, so the call in line 96 works.

- [ ] **Step 5: Run.** `node --test tests/capacity.test.js 2>&1 | grep -E "^# (tests|pass|fail|todo)"`. Expected: `# tests 39`, `# pass 37`, `# fail 0`, `# todo 2`. Then `grep -c fanLevel sim.js` → `1` (the `upgrade` line).

- [ ] **Step 6: Commit**

```bash
git add sim.js tests/capacity.test.js
git commit -m "feat(sim): restore old snapshots as the air exchange (C9 4.2)"
```

### Task 7: `tools/run-headless.js` (C9 3, 8)

**Files:** `tools/run-headless.js`.

- [ ] **Step 1: See the gap.** `grep -c "air.js" tools/run-headless.js` → `0`. (No unit test exists for the tool; C9 3 requires every Node module that runs a controller loop (`tools/*.js` among them) to load `air.js` before `controller.js`.)

- [ ] **Step 2: Edit** line 6. Replace

```js
require(path.join(D, 'sim.js')); require(path.join(D, 'controller.js')); require(path.join(D, 'runtime.js'));
```

with

```js
require(path.join(D, 'sim.js')); require(path.join(D, 'air.js')); require(path.join(D, 'controller.js')); require(path.join(D, 'runtime.js'));
```

The output lines sum every `kwh` key, so they follow the `air` meter with no other change.

- [ ] **Step 3: Run** `node tools/run-headless.js --days 1`. Expected: two lines, `Grey oyster, Fruiting, 1 day(s)` and `day 1: temperature in band … %, humidity in band … %, … kWh, alarms …`, exit code 0. (In your worktree the pre-C9 controller's `cmd.fan` is ignored, so no purge runs: the numbers are not meaningful until the controller merges. Measured with the old controller: 100 %, 90 %, 11.59 kWh, alarms 3.)

- [ ] **Step 4: Commit**

```bash
git add tools/run-headless.js
git commit -m "chore(tools): run-headless loads air.js (C9 3)"
```

### Task 8: final checks

Run all of section 6 and fix what fails in your files.

## 6. How to verify

| # | Command | Expected |
|---|---|---|
| 1 | `node --test tests/capacity.test.js tests/cycle.test.js tests/calib.test.js 2>&1 \| grep -E "^# (tests\|pass\|fail\|todo)"` | `# tests 64`, `# pass 61`, `# fail 0`, `# todo 3` |
| 2 | `npm test 2>&1 \| grep -E "^not ok\|^# (tests\|fail\|todo)"` | N + 15 tests; `not ok` only for your 3 `# TODO` tests and the tests of 4.4 |
| 3 | `git diff --name-only <base>` plus `git status --porcelain` | Only the 8 files of section 2; clean tree |
| 4 | `grep -nE "PLANT\.fan\|e\.vent\|room\.vent\|\.fan\.level\|kwh\.fan\|runS\.fan\|s\.p\.fan\|supplyPowerFactor\|leakFrac" sim.js capacity.js cycle.js calib.js tools/run-headless.js` | No output |
| 5 | `grep -c fanLevel sim.js` | `1` (in `upgrade`) |
| 6 | `node -e "const vm=require('vm'),fs=require('fs');const w={console};w.window=w;vm.createContext(w);for(const f of ['sim.js','air.js','controller.js','runtime.js','calib.js','capacity.js','cycle.js'])vm.runInContext(fs.readFileSync(f,'utf8'),w,{filename:f});console.log(typeof w.ClimateCapacity.balance, typeof w.ClimateCycle.runCycle, JSON.stringify(w.ClimateSim.PLANT.air))"` | `function function {"m3h":1800,"wPerM3h":0.08}` (browser-style load, `air.js` before `capacity.js`) |
| 7 | `node tools/run-headless.js --days 1` | Two lines, exit 0 |
| 8 | `git diff --exit-code <base> -- tests/vectors package.json air.js controller.js` | Exit code 0 |
| 9 | `grep -c "C9 bridge (lead deletes at step 2)\|end of C9 bridge" tests/capacity.test.js tests/cycle.test.js tests/calib.test.js` | `2` per file (the lead deletes the blocks at step 2) |

## 7. Done when

| # | Item |
|---|---|
| 1 | `sim.js` meets C9 4.1, 4.2 and 4.3, each proven by a `sim:` test in `tests/capacity.test.js` |
| 2 | `balance` returns `out.air` equal to the `ClimateAir` hand calculation (8902 for oyster at 1800 m³/h), `Infinity` with no limit up to 100000; `limit` uses `'air'` |
| 3 | `trial` sets `env.airM3h` and `cfg.airM3h`; no file of yours sets or reads `vent` |
| 4 | `cycle.js` sets `env.airM3h`, `cfg.airM3h`, `cfg.manual.air.auto = true`, and no `vent` |
| 5 | Calibration CSV writes `air`, reads `air` and old `fan` columns, replays `air.on`; the fit test passes on the 30 s log |
| 6 | `tools/run-headless.js` loads `air.js` before `controller.js` |
| 7 | Section 6 checks 1–9 give the expected results |
| 8 | Four commits: task 1, tasks 2–5, task 6, task 7 |
| 9 | Your report to the lead gives the test counts before and after, every failure outside 4.4, and the contract questions of section 9 with anything new you found |

## 8. What NOT to do

| Do not | Why |
|---|---|
| Edit `controller.js`, `air.js`, `tests/harness.js`, `tests/integration.test.js`, `server/**`, `web/**`, any other test | One owner per file (C9 2). Report a needed change. |
| Make the sim read `cmd.fan` or `env.vent` "for now" | C9 4.1, 4.2: both are ignored |
| Read `e.airM3h` anywhere in `sim.js` but `airM3h()` | One clamp (C9 4.1) for power, flows and `view()` |
| Add leakage to `balance` or to the sim while the fans run | C9 4.3, 8: `leakM3h: 0`, no leakage with the fans on |
| Loosen an assertion to make a test pass, beyond the edits of tasks 3–5 | The edits listed are the measured consequences of C9; anything else is a finding to report |
| Remove a `todo` option or the bridge | The lead does both at step 2, after the controller merges |
| Run `npm run vectors` or `tools/make-vectors.js` | It rewrites `tests/vectors/` (the lead regenerates at step 2) |
| Use `/tmp` for anything you keep | It is wiped on reboot |
| Change git config, push or merge | The lead merges after review |

## 9. Contract questions for the lead (answered)

All seven were answered by the lead in C9 commit 35bde0b and the README; this brief follows the rulings.

| # | C9 section | Problem | Ruling | Where in this brief |
|---|---|---|---|---|
| 1 | 5.6 | The controller's CO₂ spike filter (1000 ppm/min) flags a strong purge at high CO₂: in spawn the prototype raised `sensor_CO2` 91 times in the 83-day cycle. | Controller stream's job: C9 5.6 row "Sensor check" (falling CO₂ while `air.on` and one reading after is not rate-tested). FULL stays `todo`; the lead removes it at step 2. | Task 4 step 5 |
| 2 | 8 (capacity) | In the sealed room "near saturation" grows with blocks but counts as an `empty` failure; the two too-wet `check` tests cannot be met. | The lead re-measures with the C9 controller at step 2 (README task 2.1); a persisting failure goes to the user as a design question. The two tests stay `todo`. | Task 3 step 15 |
| 3 | 8 (trial, `cycle.js`) | `cycle.js` did not pass the room's size; neither run told the controller the size. | `cycle.js` sets `env.airM3h = room.airM3h ?? null` like `trial`; both set `cfg.airM3h = room.airM3h ?? PLANT.air.m3h`. | Task 3 steps 1b, 10; task 4 steps 1b, 3, 4 |
| 4 | 2, 11 | The stream's tests run the pre-C9 controller. | Bridge accepted; README task 2.1 deletes it after the controller merge. Marker lines `// C9 bridge (lead deletes at step 2)` … `// end of C9 bridge`. | Task 2 step 1; section 6 check 9 |
| 5 | 4.2 | Renaming the stored reading's keys on restore. | Confirmed; now in C9 4.2. | Task 6 |
| 6 | 4.1 | No rule for a size outside 50–10000 or not a number. | `m3h = Number.isFinite(e.airM3h) ? clamp(e.airM3h, 50, 10000) : PLANT.air.m3h`, with a test. | Task 2 steps 3, 7b |
| 7 | 8 (`balance`) | Result when 100000 blocks still pass. | `Infinity`, like the other limits. | Task 3 steps 1, 6 |

## 10. Self-review

### 10.1 Every C9 requirement of this stream, and its task

| C9 | Requirement | Task | Proven by |
|---|---|---|---|
| 2 | Only the 8 simulation-stream files | All | Section 6 check 3 |
| 3 | Node modules that run a controller loop or the capacity check load `air.js` before `controller.js`; `capacity.js` reads `ClimateAir` at load time | 1, 3, 7 | Task 1 requires; `AIR = global.ClimateAir` (task 3 step 5); section 6 checks 6, 7 |
| 4.1 | `PLANT.air = { m3h: 1800, wPerM3h: 0.08 }`, replaces `PLANT.fan` | 2 | `sim: plant and environment …` |
| 4.1 | `DEFAULT_ENV.airM3h: null`; a number overrides, held to 50–10000; not a number = default | 2 | `sim: plant and environment …`, `sim: env.airM3h sets the airflow`, `sim: env.airM3h is held to 50-10000 …` |
| 4.1 | `inletAt`, `exhaustAt` unchanged | 2 | `sim: plant and environment …`, the two position tests |
| 4.1 | `vent` removed; an env with `vent` accepted, key ignored | 2 | `sim: an old fan command and an old vent field are ignored` |
| 4.1 | Header comment rewritten | 2 | Step 5 |
| 4.2 | `act.air = !!(cmd.air && cmd.air.on)`; `cmd.fan` ignored | 2 | `sim: view() …`, `sim: an old fan command …` |
| 4.2 | Meter key `air` in `s.p`, `s.kwh`, `s.runS`, reading | 2 | `sim: power, energy and run time …` |
| 4.2 | Power `m3h × wPerM3h` while on | 2 | Same (144 W, 72 W at 900) |
| 4.2 | `runS.air += dt` while on | 2 | Same |
| 4.2 | `view().airM3h` = on flow + leak only when off; `act.air` | 2 | `sim: view() shows the air exchange and the leakage` |
| 4.2 | Snapshot restore upgrade | 6 | `sim: an old snapshot … is upgraded` |
| 4.3 | On: `inflow[inZ]`, `outflow[outZ]` += q; no leakage; filtered | 2 | The two position tests, `sim: unfiltered air …` |
| 4.3 | Off: leakage half per zone; unfiltered | 2 | `sim: fans off …`, `sim: unfiltered air …` |
| 4.3 | Door unchanged | 2 | `sim: unfiltered air …` (15 m³ in 60 s with the fans on) |
| 8 | `balance`: no base fan, `dC` mid-band, `air(n) = n c / dC`, `out.air` by `purgeTimeS` ≤ `purgeMaxS`, bisection 0–100000 (`Infinity` past it), `airM3h = room.airM3h ?? PLANT.air.m3h`, `limit` names | 3 | `balance: the air exchange limit matches a hand calculation with ClimateAir`, `balance: the leakage and the old vent field …`, `balance: no air exchange limit up to 100000 blocks is Infinity` |
| 8 | Capacity room `{ name, volume, airM3h?, calib }` | 1, 3 | Test rooms; header line 13 |
| 8 | Trial `env.airM3h = room.airM3h ?? null`, `cfg.airM3h = room.airM3h ?? PLANT.air.m3h`; no `vent` | 3 | `trial: the room size of the air exchange reaches the simulation`; section 6 check 4 |
| 8 | `cycle.js`: no `vent`, `env.airM3h` and `cfg.airM3h` as the trial, `manual.air.auto = true`, energy keys follow | 4 | `AIR …`, `F1`, `R2`, section 6 check 4 |
| 8 | `calib.js` column `air` + aliases, > 0 is on, replay `air.on`, `toCsv` writes `air` | 5 | The three calibration tests |
| 8 | `tools/run-headless.js` unchanged output, follows the meter keys | 7 | Section 6 check 7 |
| 11 | Simulation tests: 4.3 flows, power and meters; snapshot upgrade; `balance` hand calculation; CSV round trip with `air` and an old `fan` column | 2, 3, 5, 6 | As above |

### 10.2 Placeholder scan

| Check | Result |
|---|---|
| "TBD", "TODO" as plan text, "similar to task N", "add validation" | None. The word `todo` appears only as the `node:test` option on three tests, each with its reason and contract question. |
| Code steps without full code | None: every changed line is quoted before and after. |
| Commands without expected output | None. |
| Numbers not measured | None: every count and value was measured on a scratch copy of `<base>` with the code of this brief, applied literally from its code blocks (last run after C9 commit 35bde0b). N (the base test count) is written down in task 0. |
